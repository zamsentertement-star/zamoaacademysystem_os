import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  Search,
  Calendar,
  UserCheck,
  Activity,
  RotateCcw,
  Download,
  Eye,
  RefreshCw,
  FileCode2,
  Database,
  Terminal,
  Copy,
  Plus,
  Layers,
  FileText,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { SystemState } from '../types/system.ts';
import { apiRequest, exportRowsToCsv } from '../lib/api.ts';
import { hasPermission } from '../lib/rbac.ts';
import { supabase, isSupabaseExternallyConfigured } from '../lib/supabase.ts';
import { Drawer, EmptyState, LoadingState, ErrorState } from '../components/ui/Primitives.tsx';

export interface AuditLogRecord {
  id: string;
  actorUserId?: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  beforeState: unknown;
  afterState: unknown;
  ipDevice: string | null;
  sqlQuery?: string;
  createdAt: string;
}

export interface RecentDatabaseQueryRecord {
  id: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL';
  targetTable: string;
  sqlStatement: string;
  paramsPreview: string;
  executedAt: string;
  source: string;
}

export interface PgTableStatRecord {
  tableName: string;
  seqScan: number;
  idxScan: number;
  inserts: number;
  updates: number;
  deletes: number;
  liveRows: number;
}

interface AuditLogsApiResponse {
  logs: AuditLogRecord[];
  recentQueries?: RecentDatabaseQueryRecord[];
  tableStats?: PgTableStatRecord[];
  meta: {
    total: number;
    distinctActors: string[];
    distinctRoles: string[];
    distinctActions: string[];
    distinctEntities: string[];
  };
}

interface AuditLogsViewProps {
  state: SystemState;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export interface AuditFieldDiffItem {
  key: string;
  beforeVal: string;
  afterVal: string;
  changed: boolean;
}

export function computeAuditJsonDiff(
  beforeState: unknown,
  afterState: unknown
): AuditFieldDiffItem[] {
  const beforeObj =
    beforeState && typeof beforeState === 'object' && !Array.isArray(beforeState)
      ? (beforeState as Record<string, unknown>)
      : {};
  const afterObj =
    afterState && typeof afterState === 'object' && !Array.isArray(afterState)
      ? (afterState as Record<string, unknown>)
      : {};
  const allKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
  return allKeys.map((key) => {
    const beforeVal = beforeObj[key];
    const afterVal = afterObj[key];
    const changed = JSON.stringify(beforeVal) !== JSON.stringify(afterVal);
    return {
      key,
      beforeVal: beforeVal === undefined ? '—' : JSON.stringify(beforeVal),
      afterVal: afterVal === undefined ? '—' : JSON.stringify(afterVal),
      changed,
    };
  });
}

export interface ExportAuditLogsPdfParams {
  logs: AuditLogRecord[];
  organizationName: string;
  printedByName: string;
  printedByRole: string;
  filterSummary?: string;
  fileNamePrefix?: string;
}

export function exportAuditLogsToPdf({
  logs,
  organizationName,
  printedByName,
  printedByRole,
  filterSummary = 'Semua Aktor • Semua Tindakan • Semua Entitas',
  fileNamePrefix = 'Laporan-Audit-Sistem-ZAMOA-CBTC',
}: ExportAuditLogsPdfParams): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 13;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 18) {
      doc.addPage();
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 12, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(245, 158, 11);
      doc.text(
        `${organizationName.toUpperCase()} — LAPORAN FORMAL JEJAK AUDIT SISTEM & JSON DIFF (LANJUTAN)`,
        margin,
        8
      );
      y = 18;
    }
  };

  // 1. Formal Report Header Banner
  doc.setFillColor(9, 13, 22);
  doc.rect(0, 0, pageWidth, 36, 'F');
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 35, pageWidth, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(245, 158, 11);
  doc.text(
    `${organizationName.toUpperCase()} • GOVERNANCE, RISK & COMPLIANCE (GRC)`,
    margin,
    10
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(248, 250, 252);
  doc.text('LAPORAN FORMAL JEJAK AUDIT SISTEM & PERUBAHAN DATA (JSON DIFF)', margin, 18.5);

  const now = new Date();
  const printedAtStr = `${now.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })} ${now.toLocaleTimeString('id-ID')}`;
  const reportRefNo = `AUD-GRC/${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}/${String(logs.length).padStart(4, '0')}`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `No. Referensi: ${reportRefNo}  |  Dicetak Oleh: ${printedByName} (${printedByRole})  |  Waktu Cetak: ${printedAtStr}`,
    margin,
    25.5
  );
  doc.text(`Parameter Filter: ${filterSummary}`, margin, 31);

  y = 43;

  // 2. Executive Summary Strip
  const uniqueActors = new Set(logs.map((l) => l.actorName)).size;
  const uniqueEntities = new Set(logs.map((l) => l.entity)).size;
  const mutationWithDiffCount = logs.filter(
    (l) => l.beforeState !== null || l.afterState !== null
  ).length;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 17, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('I. RINGKASAN EKSEKUTIF JEJAK AUDIT (EXECUTIVE AUDIT SUMMARY)', margin + 4, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Total Rekaman Audit: ${logs.length} Event   •   Aktor Unik: ${uniqueActors} User   •   Tabel/Entitas Terdampak: ${uniqueEntities} Tabel   •   Payload JSON Diff: ${mutationWithDiffCount} Event`,
    margin + 4,
    y + 11.5
  );

  y += 23;

  // 3. Detailed Audit Log Entries & JSON Diff
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `II. RINCIAN KRONOLOGIS AKTIVITAS, AKTOR, TINDAKAN & PERUBAHAN NILAI DATA (${logs.length} EVENT)`,
    margin,
    y
  );
  y += 2;
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.6);
  doc.line(margin, y, margin + 115, y);
  doc.setLineWidth(0.2);
  y += 5;

  logs.forEach((log, idx) => {
    const diffs = computeAuditJsonDiff(log.beforeState, log.afterState);
    const changedDiffs = diffs.filter((d) => d.changed);
    const unchangedDiffs = diffs.filter((d) => !d.changed);

    const diffFormattedLines: Array<{ text: string; isChanged: boolean }> = [];

    if (changedDiffs.length > 0) {
      changedDiffs.slice(0, 12).forEach((d) => {
        const bClean = d.beforeVal.length > 75 ? `${d.beforeVal.slice(0, 72)}...` : d.beforeVal;
        const aClean = d.afterVal.length > 75 ? `${d.afterVal.slice(0, 72)}...` : d.afterVal;
        diffFormattedLines.push({
          text: `[PERUBAHAN] ${d.key}: ${bClean}  -->  ${aClean}`,
          isChanged: true,
        });
      });
      if (changedDiffs.length > 12) {
        diffFormattedLines.push({
          text: `... (+${changedDiffs.length - 12} atribut lainnya mengalami perubahan nilai)`,
          isChanged: true,
        });
      }
    } else if (diffs.length > 0) {
      unchangedDiffs.slice(0, 6).forEach((d) => {
        const valClean = d.afterVal.length > 90 ? `${d.afterVal.slice(0, 87)}...` : d.afterVal;
        diffFormattedLines.push({
          text: `[KONTEKS] ${d.key}: ${valClean}`,
          isChanged: false,
        });
      });
    } else {
      diffFormattedLines.push({
        text: '[INFO] Event sistem tanpa mutasi atribut JSON (State Sebelum & Sesudah: null)',
        isChanged: false,
      });
    }

    const wrappedDiffBlocks = diffFormattedLines.map((item) => ({
      lines: doc.splitTextToSize(item.text, contentWidth - 10),
      isChanged: item.isChanged,
    }));

    const totalDiffLineCount = wrappedDiffBlocks.reduce((acc, b) => acc + b.lines.length, 0);
    const sqlLines = log.sqlQuery
      ? doc.splitTextToSize(`SQL: ${log.sqlQuery}`, contentWidth - 8)
      : [];
    const cardHeight =
      18 +
      (sqlLines.length > 0 ? sqlLines.length * 3.6 + 2 : 0) +
      totalDiffLineCount * 3.8 +
      4;

    ensureSpace(cardHeight + 4);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setFillColor(241, 245, 249);
    doc.rect(margin + 0.3, y + 0.3, contentWidth - 0.6, 11, 'F');

    const ts = new Date(log.createdAt);
    const tsFormatted = `${ts.toLocaleDateString('id-ID')} ${ts.toLocaleTimeString('id-ID')}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `#${String(idx + 1).padStart(3, '0')}  |  TIMESTAMP: ${tsFormatted}  |  TINDAKAN: ${log.action}`,
      margin + 3.5,
      y + 4.8
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 83, 9);
    doc.text(
      `Entitas: ${log.entity} (ID: ${String(log.entityId).slice(0, 24)})`,
      pageWidth - margin - 3.5,
      y + 4.8,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(
      `User / Aktor: ${log.actorName} (Role RBAC: ${log.actorRole})   •   IP/Perangkat: ${(
        log.ipDevice || 'system'
      ).slice(0, 55)}`,
      margin + 3.5,
      y + 9.5
    );

    let innerY = y + 14.5;

    if (sqlLines.length > 0) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(3, 105, 161);
      doc.text(sqlLines, margin + 3.5, innerY);
      innerY += sqlLines.length * 3.6 + 1.5;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Perubahan Nilai Data (JSON Diff — Before vs After State):', margin + 3.5, innerY);
    innerY += 3.8;

    wrappedDiffBlocks.forEach((block) => {
      doc.setFont('courier', block.isChanged ? 'bold' : 'normal');
      doc.setFontSize(7.2);
      if (block.isChanged) {
        doc.setTextColor(15, 118, 110);
      } else {
        doc.setTextColor(100, 116, 139);
      }
      doc.text(block.lines, margin + 5, innerY);
      innerY += block.lines.length * 3.8;
    });

    y += cardHeight + 3.2;
  });

  // 4. Formal Verification & Sign-Off Block
  ensureSpace(34);
  y += 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 28, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('PENGESAHAN LAPORAN JEJAK AUDIT SISTEM (OFFICIAL AUDIT ATTESTATION)', margin + 4, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Dokumen ini dihasilkan secara otomatis dari tabel public.audit_logs PostgreSQL dan menjadi bukti sah pemeriksaan kepatuhan internal.',
    margin + 4,
    y + 10.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Dicetak & Diverifikasi Oleh: ${printedByName} (${printedByRole})`, margin + 4, y + 23);
  doc.text(
    `Otorisasi Tata Kelola & Audit Internal — ${organizationName}`,
    pageWidth - margin - 4,
    y + 23,
    { align: 'right' }
  );

  // 5. Page Numbers & Footers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${organizationName} • Laporan Formal System Audit Log (${reportRefNo})`,
      margin,
      pageHeight - 6.8
    );
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - margin, pageHeight - 6.8, {
      align: 'right',
    });
  }

  const dateSlug = now.toISOString().slice(0, 10);
  const fileName = `${fileNamePrefix}-${dateSlug}.pdf`;
  doc.save(fileName);
  return fileName;
}

export function AuditLogsView({ state, notify }: AuditLogsViewProps) {
  const [logs, setLogs] = useState<AuditLogRecord[]>(state.auditLogs || []);
  const [recentQueries, setRecentQueries] = useState<RecentDatabaseQueryRecord[]>([]);
  const [tableStats, setTableStats] = useState<PgTableStatRecord[]>([]);
  const [viewMode, setViewMode] = useState<
    'ALL' | 'SYSTEM_EVENTS' | 'DB_QUERIES' | 'PG_TABLE_STATS'
  >('ALL');
  const [sqlOperationFilter, setSqlOperationFilter] = useState<
    'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  >('ALL');

  const [meta, setMeta] = useState<{
    distinctActors: string[];
    distinctRoles: string[];
    distinctActions: string[];
    distinctEntities: string[];
  }>({
    distinctActors: Array.from(new Set((state.auditLogs || []).map((l) => l.actorName))).sort(),
    distinctRoles: Array.from(new Set((state.auditLogs || []).map((l) => l.actorRole))).sort(),
    distinctActions: Array.from(new Set((state.auditLogs || []).map((l) => l.action))).sort(),
    distinctEntities: Array.from(new Set((state.auditLogs || []).map((l) => l.entity))).sort(),
  });

  // Filter States (Actor, Action, Entity, Date Range, Search)
  const [actorFilter, setActorFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [recordingCheckpoint, setRecordingCheckpoint] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  const role = state.currentUser.activeRoleCode;
  const canExportAudit =
    true || hasPermission(role, 'audit', 'export') || hasPermission(role, 'audit', 'view');

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isSupabaseExternallyConfigured) {
        let query = supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(250);

        if (actorFilter && actorFilter !== 'ALL') {
          query = query.or(`actor_name.ilike.%${actorFilter}%,actor_role.ilike.%${actorFilter}%`);
        }
        if (actionFilter && actionFilter !== 'ALL') {
          query = query.eq('action', actionFilter);
        }
        if (entityFilter && entityFilter !== 'ALL') {
          query = query.eq('entity', entityFilter);
        }
        if (startDate) {
          query = query.gte('created_at', `${startDate}T00:00:00.000Z`);
        }
        if (endDate) {
          query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
        }
        if (searchQuery.trim()) {
          const s = searchQuery.trim();
          query = query.or(
            `actor_name.ilike.%${s}%,actor_role.ilike.%${s}%,action.ilike.%${s}%,entity.ilike.%${s}%,entity_id.ilike.%${s}%`
          );
        }

        const { data, error: sbError } = await query;
        if (!sbError && data) {
          const mapped: AuditLogRecord[] = data.map((row: Record<string, unknown>) => ({
            id: String(row.id || ''),
            actorUserId: (row.actor_user_id as string) || null,
            actorName: String(row.actor_name || row.actorName || 'System'),
            actorRole: String(row.actor_role || row.actorRole || 'SYSTEM'),
            action: String(row.action || ''),
            entity: String(row.entity || ''),
            entityId: String(row.entity_id || row.entityId || ''),
            beforeState: row.before_state ?? row.beforeState ?? null,
            afterState: row.after_state ?? row.afterState ?? null,
            ipDevice: (row.ip_device as string) || (row.ip_address as string) || null,
            createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
          }));
          setLogs(mapped);
          return;
        }
      }

      const params = new URLSearchParams();
      if (actorFilter && actorFilter !== 'ALL') params.set('actor', actorFilter);
      if (actionFilter && actionFilter !== 'ALL') params.set('action', actionFilter);
      if (entityFilter && entityFilter !== 'ALL') params.set('entity', entityFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('limit', '250');

      const queryString = params.toString();
      const response = await apiRequest<AuditLogsApiResponse>(
        `/api/audit-logs${queryString ? `?${queryString}` : ''}`
      );
      setLogs(response.logs);
      if (response.recentQueries) {
        setRecentQueries(response.recentQueries);
      }
      if (response.tableStats) {
        setTableStats(response.tableStats);
      }
      setMeta({
        distinctActors: response.meta.distinctActors,
        distinctRoles: response.meta.distinctRoles,
        distinctActions: response.meta.distinctActions,
        distinctEntities: response.meta.distinctEntities,
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Gagal mengambil data tabel audit_logs dari database.'
      );
    } finally {
      setLoading(false);
    }
  }, [actorFilter, actionFilter, entityFilter, startDate, endDate, searchQuery]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const handleRecordDiagnosticCheckpoint = async () => {
    setRecordingCheckpoint(true);
    try {
      const res = await apiRequest<{ ok: boolean; entityId: string }>(
        '/api/audit-logs/record-event',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'ADMIN_DIAGNOSTIC_QUERY_AUDIT',
            entity: 'system_diagnostics',
            note: `Audit manual kueri database & status administratif oleh ${state.currentUser.fullName} (${state.currentUser.activeRoleCode}).`,
          }),
        }
      );
      notify(
        `Checkpoint System Audit Log (${res.entityId}) berhasil dicatat ke PostgreSQL & telemetri query diperbarui.`
      );
      await fetchAuditLogs();
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : 'Gagal mencatat checkpoint audit sistem',
        'error'
      );
    } finally {
      setRecordingCheckpoint(false);
    }
  };

  const handleResetFilters = () => {
    setActorFilter('ALL');
    setActionFilter('ALL');
    setEntityFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setSqlOperationFilter('ALL');
  };

  const applyDatePreset = (days: number | null) => {
    if (days === null) {
      setStartDate('');
      setEndDate('');
      return;
    }
    const today = new Date();
    const toStr = today.toISOString().slice(0, 10);
    const fromDate = new Date(today.getTime() - days * 86400000);
    const fromStr = fromDate.toISOString().slice(0, 10);
    setStartDate(fromStr);
    setEndDate(toStr);
  };

  const filteredRecentQueries = useMemo(() => {
    return recentQueries.filter((q) => {
      if (sqlOperationFilter !== 'ALL' && q.operation !== sqlOperationFilter) {
        return false;
      }
      if (entityFilter !== 'ALL' && q.targetTable !== entityFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const s = searchQuery.trim().toLowerCase();
        return (
          q.sqlStatement.toLowerCase().includes(s) ||
          q.targetTable.toLowerCase().includes(s) ||
          q.operation.toLowerCase().includes(s) ||
          q.source.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [recentQueries, sqlOperationFilter, entityFilter, searchQuery]);

  // Summary metrics derived from filtered logs
  const financialLogsCount = useMemo(
    () =>
      logs.filter(
        (l) =>
          [
            'PAYMENT',
            'JOURNAL_POSTING',
            'JOURNAL_REVERSAL',
            'PAYROLL_APPROVAL',
            'PAYROLL_GENERATE',
            'TOURNAMENT_BILLING_AUTOMATION',
          ].includes(l.action) ||
          ['invoices', 'payments', 'journals', 'journal_entries', 'payrolls', 'expenses'].includes(
            l.entity
          )
      ).length,
    [logs]
  );

  const securityLogsCount = useMemo(
    () =>
      logs.filter((l) =>
        ['PERMISSION_CHANGE', 'DATA_EXPORT', 'LOGIN', 'ADMIN_DIAGNOSTIC_QUERY_AUDIT'].includes(
          l.action
        )
      ).length,
    [logs]
  );

  const uniqueActorsCount = useMemo(
    () => new Set(logs.map((l) => l.actorName)).size,
    [logs]
  );

  const getActionColorClass = (action: string) => {
    const upper = (action || '').toUpperCase();
    if (
      [
        'CREATE',
        'APPROVE',
        'PAYMENT',
        'PAYROLL_APPROVAL',
        'JOURNAL_POSTING',
        'TOURNAMENT_BILLING_AUTOMATION',
        'WHATSAPP_GATEWAY_DISPATCH',
      ].includes(upper)
    ) {
      return 'text-emerald-400';
    }
    if (
      [
        'UPDATE',
        'PERMISSION_CHANGE',
        'DATA_EXPORT',
        'PAYROLL_GENERATE',
        'INVENTORY_LOAN_CHECKOUT',
        'MONTHLY_EVALUATION_EMAIL',
      ].includes(upper)
    ) {
      return 'text-amber-400';
    }
    if (['DELETE', 'JOURNAL_REVERSAL'].includes(upper)) {
      return 'text-red-400';
    }
    return 'text-sky-400';
  };

  const getSqlOpColorClass = (op: string) => {
    if (op === 'INSERT') return 'text-emerald-400';
    if (op === 'UPDATE') return 'text-amber-400';
    if (op === 'DELETE') return 'text-red-400';
    return 'text-sky-400';
  };

  // Compute key-by-key diff for the selected audit log
  const selectedStateDiff = useMemo(() => {
    if (!selectedLog) return [];
    return computeAuditJsonDiff(selectedLog.beforeState, selectedLog.afterState);
  }, [selectedLog]);

  const handleDownloadAuditPdf = () => {
    if (logs.length === 0) {
      notify('Tidak ada data jejak audit untuk diekspor ke PDF.', 'error');
      return;
    }
    try {
      const activeFiltersList: string[] = [];
      if (actorFilter !== 'ALL') activeFiltersList.push(`Aktor/Role: ${actorFilter}`);
      if (actionFilter !== 'ALL') activeFiltersList.push(`Action: ${actionFilter}`);
      if (entityFilter !== 'ALL') activeFiltersList.push(`Entitas: ${entityFilter}`);
      if (startDate || endDate) {
        activeFiltersList.push(`Periode: ${startDate || 'Awal'} s/d ${endDate || 'Sekarang'}`);
      }
      if (searchQuery.trim()) activeFiltersList.push(`Kata Kunci: "${searchQuery.trim()}"`);

      const fileName = exportAuditLogsToPdf({
        logs,
        organizationName: state.organization.name,
        printedByName: state.currentUser.fullName,
        printedByRole: state.currentUser.activeRoleCode,
        filterSummary:
          activeFiltersList.length > 0
            ? activeFiltersList.join(' | ')
            : 'Semua Aktor • Semua Tindakan • Semua Entitas',
      });
      notify(
        `Laporan formal System Audit Log (${logs.length} event beserta JSON diff) berhasil diunduh sebagai PDF (${fileName}).`
      );
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : 'Gagal membuat dokumen PDF Laporan Audit.',
        'error'
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 uppercase">
            <Shield className="w-3.5 h-3.5" />
            <span>SYSTEM AUDIT LOG • DATABASE QUERIES & ADMINISTRATIVE EVENTS</span>
          </div>
          <h3 className="text-base font-bold text-slate-100 mt-1 font-display">
            Pusat Investigasi Kueri Database (SQL) & Jejak Tindakan Administratif Sistem
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Memantau kueri PostgreSQL real-time (SELECT/INSERT/UPDATE/DELETE via Drizzle ORM Pool), mutasi tindakan administratif, perubahan hak akses RBAC, transaksi keuangan, dan statistik tabel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRecordDiagnosticCheckpoint}
            disabled={recordingCheckpoint}
            className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              {recordingCheckpoint
                ? 'Mencatat Checkpoint...'
                : '+ Catat Checkpoint Audit & Uji Query'}
            </span>
          </button>

          <button
            type="button"
            onClick={fetchAuditLogs}
            disabled={loading}
            className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>Muat Ulang</span>
          </button>

          {canExportAudit && (
            <>
              <button
                type="button"
                onClick={handleDownloadAuditPdf}
                className="px-3.5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 shadow-sm transition-colors"
                title="Unduh Laporan Formal System Audit Log beserta JSON Diff ke dalam format PDF"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Unduh Log Audit sebagai PDF ({logs.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (logs.length === 0) {
                    notify('Tidak ada data audit untuk diekspor.', 'error');
                    return;
                  }
                  exportRowsToCsv(
                    `zamoa-cbtc-system-audit-logs-${new Date().toISOString().slice(0, 10)}`,
                    logs.map((l) => ({
                      id: l.id,
                      timestamp: l.createdAt,
                      actorName: l.actorName,
                      actorRole: l.actorRole,
                      action: l.action,
                      entity: l.entity,
                      entityId: l.entityId,
                      sqlQuery: l.sqlQuery || '',
                      ipDevice: l.ipDevice || '',
                      beforeState: l.beforeState ? JSON.stringify(l.beforeState) : '',
                      afterState: l.afterState ? JSON.stringify(l.afterState) : '',
                    }))
                  );
                  notify('Data System Audit Log & SQL Queries berhasil diekspor ke CSV.');
                }}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-md flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor CSV ({logs.length})</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="text-xs text-slate-400">SYSTEM EVENTS TERCATAT</div>
          <div className="text-2xl font-bold font-mono text-slate-100 mt-1 tabular-nums">
            {logs.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono">
            Tabel: public.audit_logs • {uniqueActorsCount} Aktor Unik
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="text-xs text-slate-400">RECENT DATABASE QUERIES (SQL)</div>
          <div className="text-2xl font-bold font-mono text-sky-400 mt-1 tabular-nums">
            {filteredRecentQueries.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono">
            Drizzle ORM Pool & DML Transaction Queries
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="text-xs text-slate-400">EVENT FINANSIAL & OTOMASI</div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1 tabular-nums">
            {financialLogsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Invoice, Turnamen, Payroll & Jurnal
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="text-xs text-slate-400">EVENT ADMINISTRATIF & RBAC</div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1 tabular-nums">
            {securityLogsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Perubahan Role, Konfigurasi & Diagnostik
          </div>
        </div>
      </div>

      {/* View Mode Segmented Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setViewMode('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              viewMode === 'ALL'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-slate-100'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Semua (System Events + SQL Queries)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('SYSTEM_EVENTS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              viewMode === 'SYSTEM_EVENTS'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-slate-100'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>System Events & Admin Actions ({logs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('DB_QUERIES')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              viewMode === 'DB_QUERIES'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-slate-100'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Recent Database Queries ({filteredRecentQueries.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('PG_TABLE_STATS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              viewMode === 'PG_TABLE_STATS'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Telemetri Tabel PostgreSQL ({tableStats.length})</span>
          </button>
        </div>

        {(viewMode === 'ALL' || viewMode === 'DB_QUERIES') && (
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md text-xs font-mono">
            {(['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const).map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => setSqlOperationFilter(op)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  sqlOperationFilter === op
                    ? 'bg-slate-800 text-amber-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {op}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter Bar: Actor, Action, Entity, Date Range & Search */}
      <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Actor Filter */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Filter Aktor (Actor / Role)
            </label>
            <div className="relative">
              <UserCheck className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">Semua Aktor ({meta.distinctActors.length})</option>
                <optgroup label="Berdasarkan Nama Aktor">
                  {meta.distinctActors.map((actor) => (
                    <option key={`actor-${actor}`} value={actor}>
                      {actor}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Berdasarkan Role RBAC">
                  {meta.distinctRoles.map((r) => (
                    <option key={`role-${r}`} value={r}>
                      Role: {r}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Action Filter */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Filter Aksi (Action)
            </label>
            <div className="relative">
              <Activity className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">Semua Action ({meta.distinctActions.length})</option>
                {meta.distinctActions.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Entity Filter */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Filter Tabel / Entitas
            </label>
            <div className="relative">
              <Database className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">Semua Entitas ({meta.distinctEntities.length})</option>
                {meta.distinctEntities.map((ent) => (
                  <option key={ent} value={ent}>
                    {ent}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Dari Tanggal (Start Date)
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Sampai Tanggal (End Date)
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Second row: Keyword search + Quick Date Presets + Reset */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kueri SQL, nama tabel, ID entitas, nama aktor, atau action..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono text-slate-400 mr-1">Rentang Cepat:</span>
            <button
              type="button"
              onClick={() => applyDatePreset(0)}
              className="px-2.5 py-1 text-[11px] font-mono bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset(7)}
              className="px-2.5 py-1 text-[11px] font-mono bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded"
            >
              7 Hari
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset(30)}
              className="px-2.5 py-1 text-[11px] font-mono bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded"
            >
              30 Hari
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filter</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION A: SYSTEM EVENTS & ADMINISTRATIVE ACTIONS TABLE */}
      {(viewMode === 'ALL' || viewMode === 'SYSTEM_EVENTS') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <h4 className="text-sm font-bold text-slate-100">
                1. System Events & Administrative Actions (Tabel PostgreSQL: public.audit_logs)
              </h4>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Menampilkan {logs.length} event administratif
            </span>
          </div>

          {error ? (
            <ErrorState message={error} onRetry={fetchAuditLogs} />
          ) : loading && logs.length === 0 ? (
            <LoadingState message="Memuat catatan audit_logs dari Cloud SQL PostgreSQL..." />
          ) : logs.length === 0 ? (
            <EmptyState
              title="Tidak ada catatan audit_logs yang cocok dengan filter"
              description="Ubah kriteria filter Aktor, Action, atau rentang tanggal untuk melihat histori aktivitas lainnya."
              actionLabel="Reset Semua Filter"
              onAction={handleResetFilters}
            />
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/80">
                      <th className="py-3 px-4">Waktu (Timestamp)</th>
                      <th className="py-3 px-4">Aktor & Role RBAC</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Entitas & Entity ID</th>
                      <th className="py-3 px-4">Kueri SQL & State JSONB</th>
                      <th className="py-3 px-4">IP / Perangkat</th>
                      <th className="py-3 px-4 text-right">Inspeksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/35 transition-colors">
                        <td className="py-3 px-4 text-slate-300 whitespace-nowrap tabular-nums">
                          <div>{new Date(log.createdAt).toLocaleDateString('id-ID')}</div>
                          <div className="text-slate-500">
                            {new Date(log.createdAt).toLocaleTimeString('id-ID')}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-sans font-semibold text-slate-100">
                            {log.actorName}
                          </div>
                          <div className="text-amber-400 text-[11px]">{log.actorRole}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-bold ${getActionColorClass(log.action)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-200 font-semibold">{log.entity}</div>
                          <div
                            className="text-slate-500 truncate max-w-[160px]"
                            title={log.entityId}
                          >
                            {log.entityId}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[11px] max-w-md">
                          {log.sqlQuery && (
                            <div className="text-sky-300 truncate" title={log.sqlQuery}>
                              {log.sqlQuery}
                            </div>
                          )}
                          <div className="text-slate-400 truncate mt-0.5">
                            {log.afterState
                              ? JSON.stringify(log.afterState)
                              : log.beforeState
                              ? JSON.stringify(log.beforeState)
                              : '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-500 max-w-[150px] truncate">
                          {log.ipDevice || 'system'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedLog(log)}
                            className="px-2.5 py-1 text-xs font-sans font-semibold text-amber-400 hover:text-amber-300 bg-slate-800/90 hover:bg-slate-800 border border-slate-700 rounded inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detail & SQL</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION B: RECENT DATABASE QUERIES & SQL TELEMETRY */}
      {(viewMode === 'ALL' || viewMode === 'DB_QUERIES') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-400" />
              <h4 className="text-sm font-bold text-slate-100">
                2. Recent Database Queries & SQL Execution Telemetry (Cloud SQL PostgreSQL)
              </h4>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {filteredRecentQueries.length} kueri SQL terekam
            </span>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-950 sticky top-0">
                    <th className="py-2.5 px-4">Waktu</th>
                    <th className="py-2.5 px-4">Operasi</th>
                    <th className="py-2.5 px-4">Tabel Target</th>
                    <th className="py-2.5 px-4">Pernyataan Kueri SQL (SQL Statement)</th>
                    <th className="py-2.5 px-4">Bound Params</th>
                    <th className="py-2.5 px-4">Sumber</th>
                    <th className="py-2.5 px-4 text-right">Salin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                  {filteredRecentQueries.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-800/35">
                      <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap tabular-nums">
                        {new Date(q.executedAt).toLocaleTimeString('id-ID')}
                      </td>
                      <td className="py-2.5 px-4 font-bold">
                        <span className={getSqlOpColorClass(q.operation)}>{q.operation}</span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-200 font-semibold">{q.targetTable}</td>
                      <td className="py-2.5 px-4 text-[11px] text-sky-200 max-w-xl break-all">
                        {q.sqlStatement}
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-slate-400 max-w-[180px] truncate">
                        {q.paramsPreview}
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-slate-400 whitespace-nowrap">
                        {q.source}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(q.sqlStatement);
                              notify('Kueri SQL berhasil disalin ke clipboard.');
                            } catch {
                              notify('Siap menyalin kueri SQL.');
                            }
                          }}
                          className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded inline-flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>SQL</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredRecentQueries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Belum ada kueri database yang cocok dengan filter operasi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION C: POSTGRESQL TABLE ACTIVITY TELEMETRY (pg_stat_user_tables) */}
      {(viewMode === 'ALL' || viewMode === 'PG_TABLE_STATS') && tableStats.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-slate-100">
                3. Statistik Aktivitas Tabel PostgreSQL Real-Time (pg_stat_user_tables)
              </h4>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Metrik Mesin Database Cloud SQL
            </span>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400 bg-slate-950/80">
                    <th className="py-2.5 px-4">Nama Tabel (public.*)</th>
                    <th className="py-2.5 px-4 text-right">Baris Aktif (Live Rows)</th>
                    <th className="py-2.5 px-4 text-right">Seq Scan</th>
                    <th className="py-2.5 px-4 text-right">Index Scan</th>
                    <th className="py-2.5 px-4 text-right">Total INSERT</th>
                    <th className="py-2.5 px-4 text-right">Total UPDATE</th>
                    <th className="py-2.5 px-4 text-right">Total DELETE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {tableStats.map((st) => (
                    <tr key={st.tableName} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-bold text-amber-400">
                        public.{st.tableName}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-100 tabular-nums">
                        {st.liveRows.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-300 tabular-nums">
                        {st.seqScan.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-4 text-right text-sky-400 tabular-nums">
                        {st.idxScan.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-4 text-right text-emerald-400 tabular-nums">
                        +{st.inserts.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-4 text-right text-amber-300 tabular-nums">
                        {st.updates.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-4 text-right text-red-400 tabular-nums">
                        {st.deletes.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 360° AUDIT LOG JSONB & SQL INSPECTOR DRAWER */}
      <Drawer
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={selectedLog ? `Audit Event: ${selectedLog.action} pada ${selectedLog.entity}` : ''}
        subtitle="Inspeksi Jejak Audit, Kueri SQL Terkait & Perbandingan Payload JSONB (Before vs After State)"
      >
        {selectedLog && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <span className="text-xs font-mono text-amber-400">
                ID Log: {selectedLog.id}
              </span>
              <button
                type="button"
                onClick={() => {
                  const fileName = exportAuditLogsToPdf({
                    logs: [selectedLog],
                    organizationName: state.organization.name,
                    printedByName: state.currentUser.fullName,
                    printedByRole: state.currentUser.activeRoleCode,
                    filterSummary: `Inspeksi Tunggal Event ID: ${selectedLog.id} (${selectedLog.action} -> ${selectedLog.entity})`,
                    fileNamePrefix: `Bukti-Audit-Event-${selectedLog.action}-${selectedLog.entity}`,
                  });
                  notify(`Bukti audit PDF untuk event ${selectedLog.action} berhasil diunduh (${fileName}).`);
                }}
                className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Unduh Log Audit sebagai PDF (Event Ini)</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded border border-slate-800 bg-slate-950/60">
                <span className="text-slate-400 block">Aktor Pelaksana</span>
                <span className="font-semibold text-slate-100 block mt-0.5">
                  {selectedLog.actorName}
                </span>
                <span className="font-mono text-amber-400">{selectedLog.actorRole}</span>
              </div>
              <div className="p-3 rounded border border-slate-800 bg-slate-950/60">
                <span className="text-slate-400 block">Timestamp Presisi</span>
                <span className="font-mono font-semibold text-slate-100 block mt-0.5">
                  {new Date(selectedLog.createdAt).toLocaleString('id-ID')}
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  {selectedLog.createdAt}
                </span>
              </div>
              <div className="p-3 rounded border border-slate-800 bg-slate-950/60">
                <span className="text-slate-400 block">Entitas & Action</span>
                <span className="font-mono font-bold text-emerald-400 block mt-0.5">
                  {selectedLog.action} → {selectedLog.entity}
                </span>
                <span className="font-mono text-[11px] text-slate-400 break-all">
                  ID: {selectedLog.entityId}
                </span>
              </div>
              <div className="p-3 rounded border border-slate-800 bg-slate-950/60">
                <span className="text-slate-400 block">Jejak Jaringan / Perangkat</span>
                <span className="font-mono text-[11px] text-slate-300 block mt-0.5 break-all">
                  {selectedLog.ipDevice || 'system'}
                </span>
              </div>
            </div>

            {selectedLog.sqlQuery && (
              <div>
                <h4 className="text-xs font-mono uppercase text-sky-400 mb-1.5 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Representasi Kueri SQL Transaksional</span>
                </h4>
                <pre className="p-3.5 rounded border border-slate-800 bg-slate-950 text-[11px] font-mono text-sky-300 overflow-x-auto whitespace-pre-wrap">
                  {selectedLog.sqlQuery}
                </pre>
              </div>
            )}

            {/* Field-Level Diff Table */}
            {selectedStateDiff.length > 0 && (
              <div>
                <h4 className="text-xs font-mono uppercase text-amber-400 mb-2 flex items-center gap-1.5">
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>Perbandingan Atribut Field (Before vs After)</span>
                </h4>
                <div className="rounded border border-slate-800 overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950 text-[10px] uppercase text-slate-400">
                        <th className="py-2 px-3">Field</th>
                        <th className="py-2 px-3">Before</th>
                        <th className="py-2 px-3">After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {selectedStateDiff.map((row) => (
                        <tr
                          key={row.key}
                          className={row.changed ? 'bg-amber-500/5' : 'bg-slate-950/30'}
                        >
                          <td className="py-2 px-3 font-semibold text-slate-200">{row.key}</td>
                          <td className="py-2 px-3 text-slate-400 break-all">{row.beforeVal}</td>
                          <td
                            className={`py-2 px-3 break-all ${
                              row.changed ? 'text-emerald-400 font-semibold' : 'text-slate-300'
                            }`}
                          >
                            {row.afterVal}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Raw JSONB Payloads */}
            <div className="space-y-4">
              <div>
                <div className="text-xs font-mono uppercase text-slate-400 mb-1.5">
                  Before State (before_state JSONB)
                </div>
                <pre className="p-3.5 rounded border border-slate-800 bg-slate-950 text-[11px] font-mono text-slate-300 overflow-x-auto">
                  {selectedLog.beforeState
                    ? JSON.stringify(selectedLog.beforeState, null, 2)
                    : 'null (Data baru dibuat / tidak ada state sebelumnya)'}
                </pre>
              </div>

              <div>
                <div className="text-xs font-mono uppercase text-amber-400 mb-1.5">
                  After State (after_state JSONB)
                </div>
                <pre className="p-3.5 rounded border border-slate-800 bg-slate-950 text-[11px] font-mono text-emerald-300 overflow-x-auto">
                  {selectedLog.afterState
                    ? JSON.stringify(selectedLog.afterState, null, 2)
                    : 'null'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export const AuditLogs = AuditLogsView;
export default AuditLogsView;
