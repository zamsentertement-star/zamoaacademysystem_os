import React, { useState, useMemo } from 'react';
import {
  QrCode,
  Download,
  Copy,
  CheckCircle2,
  UserCheck,
  Users,
  Briefcase,
  ShieldCheck,
  Search,
  Sparkles,
} from 'lucide-react';
import { SystemState } from '../../types/system.ts';
import { apiRequest } from '../../lib/api.ts';
import {
  enqueueOfflineAttendance,
  isCurrentlyOffline,
  isNetworkDisconnectError,
} from '../../lib/offlineAttendanceQueue.ts';
import { Modal, StatusText } from './Primitives.tsx';
import { AthletePhotoThumbnail } from './AthletePassportPhotoInput.tsx';

export interface QrPersonIdentity {
  id: string;
  entityType: 'ATHLETE' | 'COACH' | 'STAFF';
  code: string;
  fullName: string;
  roleTitle: string;
  subtitle: string;
  branchId: string;
  branchName: string;
  status: string;
  attendanceCount: number;
  lastSignature: string | null;
  photoUrl?: string | null;
  registrationChannel?: string | null;
}

export function buildQrMatrix21(payload: string): boolean[][] {
  const size = 21;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const placeFinder = (rowOffset: number, colOffset: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = rowOffset + r;
        const cc = colOffset + c;
        if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
          reserved[rr][cc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
            const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            matrix[rr][cc] = isOuter || isInner;
          } else {
            matrix[rr][cc] = false;
          }
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    reserved[6][i] = true;
    matrix[6][i] = i % 2 === 0;
    reserved[i][6] = true;
    matrix[i][6] = i % 2 === 0;
  }

  // Deterministic bit stream from payload
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let bitIdx = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c]) {
        const ch = payload.charCodeAt(bitIdx % payload.length) || 67;
        const mix = (hash >>> (bitIdx % 24)) ^ (ch * 31 + r * 17 + c * 13);
        matrix[r][c] = (mix & 1) === 1;
        bitIdx++;
      }
    }
  }

  return matrix;
}

export function QrCodeSvg({
  code,
  value,
  entityType = 'ATHLETE',
  sizePx,
  size,
}: {
  code?: string;
  value?: string;
  entityType?: 'ATHLETE' | 'COACH' | 'STAFF' | 'QRIS';
  sizePx?: number;
  size?: number;
}) {
  const effectiveCode = code || value || 'ZAMOA-CBTC-QR';
  const effectiveSize = sizePx || size || 132;
  const payload = `ZAMOA-CBTC|${entityType}|${effectiveCode}`;
  const matrix = useMemo(() => buildQrMatrix21(payload), [payload]);
  const grid = 21;

  return (
    <svg
      width={effectiveSize}
      height={effectiveSize}
      viewBox={`0 0 ${grid + 4} ${grid + 4}`}
      className="bg-white rounded-md border border-slate-300 shadow-sm mx-auto shrink-0"
      shapeRendering="crispEdges"
      aria-label={`QR Code ${effectiveCode}`}
    >
      <rect x={0} y={0} width={grid + 4} height={grid + 4} fill="#ffffff" />
      {matrix.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? (
            <rect
              key={`${rIdx}-${cIdx}`}
              x={cIdx + 2}
              y={rIdx + 2}
              width={1}
              height={1}
              fill="#0f172a"
            />
          ) : null
        )
      )}
    </svg>
  );
}

export function downloadDigitalQrCardSvg(person: QrPersonIdentity, orgName: string) {
  const payload = `ZAMOA-CBTC|${person.entityType}|${person.code}`;
  const matrix = buildQrMatrix21(payload);
  const badgeColor =
    person.entityType === 'ATHLETE'
      ? '#f59e0b'
      : person.entityType === 'COACH'
      ? '#10b981'
      : '#38bdf8';
  const badgeLabel =
    person.entityType === 'ATHLETE'
      ? 'KARTU QR PEMAIN / ATLET'
      : person.entityType === 'COACH'
      ? 'KARTU QR PELATIH / COACH'
      : 'KARTU QR STAF AKADEMI';

  const qrRects: string[] = [];
  const scale = 7;
  const offsetX = 115;
  const offsetY = 130;

  matrix.forEach((row, r) => {
    row.forEach((filled, c) => {
      if (filled) {
        qrRects.push(
          `<rect x="${offsetX + (c + 2) * scale}" y="${offsetY + (r + 2) * scale}" width="${scale}" height="${scale}" fill="#0f172a" />`
        );
      }
    });
  });

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="540" viewBox="0 0 400 540">
  <rect width="400" height="540" rx="16" fill="#090d16" stroke="#1e293b" stroke-width="4"/>
  <rect x="0" y="0" width="400" height="86" rx="16" fill="#0f172a"/>
  <rect x="0" y="82" width="400" height="4" fill="${badgeColor}"/>
  <text x="200" y="36" text-anchor="middle" fill="#f8fafc" font-family="monospace" font-size="14" font-weight="bold">${orgName.toUpperCase()}</text>
  <text x="200" y="62" text-anchor="middle" fill="${badgeColor}" font-family="monospace" font-size="12" font-weight="bold">${badgeLabel}</text>
  <rect x="${offsetX}" y="${offsetY}" width="${25 * scale}" height="${25 * scale}" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  ${qrRects.join('\n  ')}
  <text x="200" y="348" text-anchor="middle" fill="#f8fafc" font-family="sans-serif" font-size="18" font-weight="bold">${person.fullName}</text>
  <text x="200" y="376" text-anchor="middle" fill="${badgeColor}" font-family="monospace" font-size="16" font-weight="bold">${person.code}</text>
  <text x="200" y="404" text-anchor="middle" fill="#cbd5e1" font-family="sans-serif" font-size="12">${person.roleTitle}</text>
  <text x="200" y="426" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="11">${person.subtitle}</text>
  <line x1="40" y1="450" x2="360" y2="450" stroke="#1e293b" stroke-width="1.5"/>
  <text x="200" y="476" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="11">CABANG: ${person.branchName.toUpperCase()} • STATUS: ${person.status}</text>
  <text x="200" y="502" text-anchor="middle" fill="#64748b" font-family="monospace" font-size="10">PAYLOAD: ${payload}</text>
</svg>`;

  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Kartu-QR-${person.code}-${person.fullName.replace(/\s+/g, '-')}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildAllQrIdentities(state: SystemState): QrPersonIdentity[] {
  const list: QrPersonIdentity[] = [];

  // 1. Athletes
  state.athletes.forEach((a) => {
    const branch = state.branches.find((b) => b.id === a.branchId);
    const team = state.teams.find((t) => t.id === a.teamId);
    const attCount = state.attendances.filter(
      (att) => att.athleteId === a.id && ['PRESENT', 'LATE'].includes(att.status)
    ).length;
    list.push({
      id: a.id,
      entityType: 'ATHLETE',
      code: a.memberCode,
      fullName: a.fullName,
      roleTitle: `Pemain / Atlet • Posisi ${a.position} (#${a.jerseyNumber})`,
      subtitle: `${team?.name || 'Tim Akademi'} • Jersey ${a.jerseySize}`,
      branchId: a.branchId,
      branchName: branch?.name || 'Jakarta HQ',
      status: a.membershipStatus,
      attendanceCount: attCount,
      lastSignature: `QR-PASS-${a.memberCode}`,
      photoUrl: a.photoUrl || null,
      registrationChannel: a.registrationChannel || 'ONLINE',
    });
  });

  // 2. Coaches
  state.coaches.forEach((c, idx) => {
    const branch = state.branches.find((b) => b.id === c.branchId);
    const code = c.coachCode || `COACH-CBTC-0${idx + 1}`;
    const coachAtts = (state.coachAttendances || []).filter(
      (ca) => ca.coachId === c.id && ['PRESENT', 'LATE', 'SUBSTITUTE'].includes(ca.status)
    );
    const lastSig = coachAtts[0]?.digitalSignatureHash || `SIG-COACH-${code}`;
    list.push({
      id: c.id,
      entityType: 'COACH',
      code,
      fullName: c.fullName,
      roleTitle: `${c.isHeadCoach ? 'Head Coach' : 'Coach'} • ${c.licenseLevel}`,
      subtitle: `${c.specialization} (${c.coachType})`,
      branchId: c.branchId,
      branchName: branch?.name || 'Jakarta HQ',
      status: c.status,
      attendanceCount: coachAtts.length,
      lastSignature: lastSig,
    });
  });

  // 3. Staff
  state.staff.forEach((s, idx) => {
    const branch = state.branches.find((b) => b.id === s.branchId);
    const code = s.staffCode || `STF-CBTC-0${idx + 1}`;
    const staffAtts = (state.staffAttendances || []).filter(
      (sa) => sa.staffId === s.id && ['PRESENT', 'LATE', 'ON_DUTY'].includes(sa.status)
    );
    const lastSig = staffAtts[0]?.digitalSignatureHash || `SIG-STF-${code}`;
    list.push({
      id: s.id,
      entityType: 'STAFF',
      code,
      fullName: s.fullName,
      roleTitle: `Staf ${s.department} • ${s.positionTitle}`,
      subtitle: `Kontak: ${s.phone}${s.email ? ` • ${s.email}` : ''}`,
      branchId: s.branchId,
      branchName: branch?.name || 'Jakarta HQ',
      status: s.status,
      attendanceCount: staffAtts.length,
      lastSignature: lastSig,
    });
  });

  return list;
}

interface DigitalQrPassHubProps {
  state: SystemState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
  defaultTab?: 'my_card' | 'athletes' | 'coaches' | 'staff';
  activeSessionId?: string;
}

export function DigitalQrPassHub({
  state,
  onRefresh,
  notify,
  defaultTab = 'my_card',
  activeSessionId,
}: DigitalQrPassHubProps) {
  const [tab, setTab] = useState<'my_card' | 'athletes' | 'coaches' | 'staff'>(defaultTab);
  const [search, setSearch] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [focusedPerson, setFocusedPerson] = useState<QrPersonIdentity | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const allIdentities = useMemo(() => buildAllQrIdentities(state), [state]);

  // Determine the default identity matching the current active role
  const roleDefaultIdentity = useMemo(() => {
    const role = state.currentUser.activeRoleCode;
    if (role === 'PLAYER' || role === 'PARENT') {
      return allIdentities.find((x) => x.entityType === 'ATHLETE') || allIdentities[0];
    }
    if (role === 'COACH' || role === 'HEAD_COACH') {
      return allIdentities.find((x) => x.entityType === 'COACH') || allIdentities[0];
    }
    if (role === 'MEDICAL_STAFF') {
      return (
        allIdentities.find(
          (x) => x.entityType === 'STAFF' && x.roleTitle.toUpperCase().includes('MEDICAL')
        ) ||
        allIdentities.find((x) => x.entityType === 'STAFF') ||
        allIdentities[0]
      );
    }
    if (role === 'FINANCE_OFFICER' || role === 'ACCOUNTANT') {
      return (
        allIdentities.find(
          (x) => x.entityType === 'STAFF' && x.roleTitle.toUpperCase().includes('FINANCE')
        ) ||
        allIdentities.find((x) => x.entityType === 'STAFF') ||
        allIdentities[0]
      );
    }
    if (role === 'ADMIN_STAFF' || role === 'BRANCH_MANAGER' || role === 'EVENT_COORDINATOR') {
      return (
        allIdentities.find(
          (x) =>
            x.entityType === 'STAFF' &&
            (x.roleTitle.toUpperCase().includes('ADMIN') ||
              x.roleTitle.toUpperCase().includes('OPERATIONS'))
        ) ||
        allIdentities.find((x) => x.entityType === 'STAFF') ||
        allIdentities[0]
      );
    }
    return allIdentities[0];
  }, [allIdentities, state.currentUser.activeRoleCode]);

  const currentPersonalIdentity = useMemo(() => {
    if (selectedPersonId) {
      const found = allIdentities.find((x) => x.id === selectedPersonId);
      if (found) return found;
    }
    return roleDefaultIdentity;
  }, [allIdentities, selectedPersonId, roleDefaultIdentity]);

  const targetSession = useMemo(() => {
    if (activeSessionId) {
      const found = state.trainingSessions.find((s) => s.id === activeSessionId);
      if (found) return found;
    }
    return state.trainingSessions[0];
  }, [state.trainingSessions, activeSessionId]);

  const handleQuickScanCheckIn = async (person: QrPersonIdentity) => {
    if (!targetSession) {
      notify('Pilih atau jadwalkan sesi latihan terlebih dahulu.', 'error');
      return;
    }

    const saveToOfflineLocalStorage = () => {
      enqueueOfflineAttendance({
        entityType:
          person.entityType === 'ATHLETE'
            ? 'ATHLETE_SINGLE'
            : person.entityType === 'COACH'
            ? 'COACH_SINGLE'
            : 'STAFF_SINGLE',
        branchId: targetSession.branchId,
        sessionId: targetSession.id,
        targetId: person.id,
        targetName: person.fullName,
        targetCode: person.code,
        status: 'PRESENT',
        sourceOrMethod: person.entityType === 'ATHLETE' ? 'QR' : 'DIGITAL_QR',
        notes: `Scan Kartu QR (${person.code})`,
      });
      notify(
        `[OFFLINE-FIRST] Koneksi terputus: Presensi QR ${person.fullName} (${person.code}) disimpan di LocalStorage & otomatis sinkron saat kembali online.`
      );
    };

    if (isCurrentlyOffline()) {
      saveToOfflineLocalStorage();
      return;
    }

    setSubmittingId(person.id);
    try {
      if (person.entityType === 'ATHLETE') {
        await apiRequest('/api/attendances', {
          method: 'POST',
          body: JSON.stringify({
            branchId: targetSession.branchId,
            sessionId: targetSession.id,
            athleteId: person.id,
            status: 'PRESENT',
            source: 'QR',
            notes: `Scan Kartu QR Pemain (${person.code})`,
          }),
        });
      } else if (person.entityType === 'COACH') {
        await apiRequest('/api/coach-attendances', {
          method: 'POST',
          body: JSON.stringify({
            branchId: targetSession.branchId,
            sessionId: targetSession.id,
            coachId: person.id,
            status: 'PRESENT',
            checkInMethod: 'DIGITAL_QR',
            notes: `Scan Kartu QR Pelatih (${person.code})`,
          }),
        });
      } else {
        await apiRequest('/api/staff-attendances', {
          method: 'POST',
          body: JSON.stringify({
            branchId: targetSession.branchId,
            sessionId: targetSession.id,
            staffId: person.id,
            status: 'PRESENT',
            checkInMethod: 'DIGITAL_QR',
            notes: `Scan Kartu QR Staf (${person.code})`,
          }),
        });
      }
      notify(
        `Scan QR Berhasil! ${person.fullName} (${person.code}) tercatat PRESENT pada sesi ${targetSession.topic}.`
      );
      await onRefresh();
    } catch (err: unknown) {
      if (isNetworkDisconnectError(err)) {
        saveToOfflineLocalStorage();
      } else {
        notify(err instanceof Error ? err.message : 'Gagal memproses scan QR', 'error');
      }
    } finally {
      setSubmittingId(null);
    }
  };

  const handleCopyCode = (code: string, name: string) => {
    navigator.clipboard?.writeText(code);
    notify(`Kode QR "${code}" milik ${name} disalin ke clipboard.`);
  };

  const filteredList = useMemo(() => {
    return allIdentities.filter((item) => {
      if (tab === 'athletes' && item.entityType !== 'ATHLETE') return false;
      if (tab === 'coaches' && item.entityType !== 'COACH') return false;
      if (tab === 'staff' && item.entityType !== 'STAFF') return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.fullName.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.roleTitle.toLowerCase().includes(q) ||
        item.branchName.toLowerCase().includes(q)
      );
    });
  }, [allIdentities, tab, search]);

  return (
    <div className="space-y-5">
      {/* Navigation Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('my_card')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              tab === 'my_card'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Kartu QR Saya (Sesuai Role: {state.currentUser.activeRoleCode})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('athletes')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              tab === 'athletes'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>
              Kartu QR Pemain ({allIdentities.filter((x) => x.entityType === 'ATHLETE').length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('coaches')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              tab === 'coaches'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>
              Kartu QR Pelatih ({allIdentities.filter((x) => x.entityType === 'COACH').length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('staff')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              tab === 'staff'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>
              Kartu QR Staf Lainnya ({allIdentities.filter((x) => x.entityType === 'STAFF').length})
            </span>
          </button>
        </div>

        {tab !== 'my_card' && (
          <div className="relative w-full lg:w-72">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau kode QR..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 placeholder:text-slate-500"
            />
          </div>
        )}
      </div>

      {/* TAB 1: KARTU QR DIGITAL SAYA (PERSONAL PORTAL) */}
      {tab === 'my_card' && currentPersonalIdentity && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Personal Digital ID Card */}
          <div className="lg:col-span-5 rounded-xl border-2 border-amber-500/40 bg-slate-950 p-6 text-center space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="text-left">
                <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
                  {state.organization.name}
                </div>
                <div className="text-xs font-semibold text-slate-200">
                  OFFICIAL DIGITAL QR ID PASS
                </div>
              </div>
              <StatusText status={currentPersonalIdentity.status} />
            </div>

            <div className="py-2 flex items-center justify-center gap-4">
              {currentPersonalIdentity.entityType === 'ATHLETE' && (
                <AthletePhotoThumbnail
                  photoUrl={currentPersonalIdentity.photoUrl}
                  fullName={currentPersonalIdentity.fullName}
                  size="lg"
                />
              )}
              <QrCodeSvg
                code={currentPersonalIdentity.code}
                entityType={currentPersonalIdentity.entityType}
                sizePx={160}
              />
            </div>

            <div className="space-y-1">
              <div className="text-[11px] font-mono uppercase px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300 inline-block">
                {currentPersonalIdentity.entityType === 'ATHLETE'
                  ? 'PEMAIN / ATLET AKADEMI'
                  : currentPersonalIdentity.entityType === 'COACH'
                  ? 'PELATIH / COACH RESMI'
                  : 'STAF OPERASIONAL & MEDIS'}
              </div>
              <h3 className="text-lg font-bold text-slate-100 pt-1">
                {currentPersonalIdentity.fullName}
              </h3>
              <div className="text-sm font-mono font-bold text-amber-400">
                {currentPersonalIdentity.code}
              </div>
              <p className="text-xs text-slate-300">{currentPersonalIdentity.roleTitle}</p>
              <p className="text-xs text-slate-400">{currentPersonalIdentity.subtitle}</p>
            </div>

            <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-left text-xs font-mono">
              <div className="p-2.5 rounded bg-slate-900/70 border border-slate-800">
                <div className="text-[10px] text-slate-400">CABANG HOMEBASE</div>
                <div className="text-slate-100 font-semibold truncate">
                  {currentPersonalIdentity.branchName}
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-900/70 border border-slate-800">
                <div className="text-[10px] text-slate-400">PRESENSI TERVERIFIKASI</div>
                <div className="text-emerald-400 font-semibold">
                  {currentPersonalIdentity.attendanceCount} Sesi Hadir
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() =>
                  handleCopyCode(currentPersonalIdentity.code, currentPersonalIdentity.fullName)
                }
                className="px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5 text-amber-400" />
                <span>Salin Kode QR</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadDigitalQrCardSvg(currentPersonalIdentity, state.organization.name)
                }
                className="px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Kartu QR (.SVG)</span>
              </button>
            </div>
          </div>

          {/* Right Panel: Profile Switcher & Instant Self Check-In */}
          <div className="lg:col-span-7 space-y-4">
            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-amber-400" />
                  <span>Akses Kartu QR Pribadi (Pemain, Pelatih & Staf)</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Setiap Pemain, Pelatih, dan Staf dapat melihat serta mengunduh Kartu QR mereka sendiri di halaman ini. Gunakan pemilih di bawah untuk melihat kartu QR atas nama personel tertentu:
                </p>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-amber-400 mb-1.5">
                  Pilih / Lihat Kartu QR Milik Personel (Pemain / Pelatih / Staf):
                </label>
                <select
                  value={currentPersonalIdentity.id}
                  onChange={(e) => setSelectedPersonId(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <optgroup label="PEMAIN / ATLET (ATHLETES)">
                    {allIdentities
                      .filter((x) => x.entityType === 'ATHLETE')
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          [PEMAIN] {item.code} — {item.fullName} ({item.roleTitle})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="PELATIH / COACH (COACHES)">
                    {allIdentities
                      .filter((x) => x.entityType === 'COACH')
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          [PELATIH] {item.code} — {item.fullName} ({item.roleTitle})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="STAF AKADEMI (MEDIS, OPERASIONAL, FINANCE, ADMIN)">
                    {allIdentities
                      .filter((x) => x.entityType === 'STAFF')
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          [STAF] {item.code} — {item.fullName} ({item.roleTitle})
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              {targetSession && (
                <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono uppercase text-emerald-400">
                      Simulasi Scan Mandiri pada Sesi Aktif
                    </div>
                    <div className="text-xs font-semibold text-slate-100 mt-0.5">
                      {targetSession.sessionDate} ({targetSession.startTime}-{targetSession.endTime}) — {targetSession.topic}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={submittingId === currentPersonalIdentity.id}
                    onClick={() => handleQuickScanCheckIn(currentPersonalIdentity)}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Scan QR & Check-In Sekarang</span>
                  </button>
                </div>
              )}

              <div className="p-3.5 rounded border border-slate-800 bg-slate-950/60 space-y-1.5 text-xs">
                <div className="font-mono text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Token Verifikasi QR:</span>
                </div>
                <div className="font-mono text-emerald-400 break-all">
                  ZAMOA-CBTC|{currentPersonalIdentity.entityType}|{currentPersonalIdentity.code}|
                  {currentPersonalIdentity.lastSignature}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TABS 2, 3, 4: GRID OF ALL QR CARDS (ATHLETES, COACHES, STAFF) */}
      {tab !== 'my_card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredList.map((person) => (
            <div
              key={person.id}
              className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 flex flex-col justify-between gap-4 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div
                  className="cursor-pointer"
                  onClick={() => setFocusedPerson(person)}
                  title="Klik untuk memperbesar Kartu QR"
                >
                  <QrCodeSvg code={person.code} entityType={person.entityType} sizePx={104} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-amber-400">
                      {person.code}
                    </span>
                    <StatusText status={person.status} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-100 mt-1 truncate">
                    {person.fullName}
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">{person.roleTitle}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    {person.subtitle}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-800/80">
                    <span>{person.branchName}</span>
                    <span className="text-emerald-400">{person.attendanceCount}x Hadir</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFocusedPerson(person)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                  >
                    <QrCode className="w-3 h-3" />
                    <span>Perbesar QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(person.code, person.fullName)}
                    className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Salin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadDigitalQrCardSvg(person, state.organization.name)}
                    className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded flex items-center gap-1"
                  >
                    <Download className="w-3 h-3 text-amber-400" />
                    <span>.SVG</span>
                  </button>
                </div>

                {targetSession && (
                  <button
                    type="button"
                    disabled={submittingId === person.id}
                    onClick={() => handleQuickScanCheckIn(person)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Check-In QR</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: FULLSCREEN QR CARD VIEW */}
      <Modal
        open={Boolean(focusedPerson)}
        onClose={() => setFocusedPerson(null)}
        title={`Kartu ID & Kode QR Digital — ${focusedPerson?.fullName || ''}`}
        subtitle="Dapat dipindai langsung pada Terminal Presensi Lapangan atau diunduh ke perangkat."
      >
        {focusedPerson && (
          <div className="space-y-4">
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-950 text-center space-y-3">
              <div className="text-[11px] font-mono uppercase tracking-widest text-amber-400">
                {state.organization.name} • DIGITAL QR PASS
              </div>
              <QrCodeSvg
                code={focusedPerson.code}
                entityType={focusedPerson.entityType}
                sizePx={192}
              />
              <div>
                <div className="text-lg font-bold text-slate-100">{focusedPerson.fullName}</div>
                <div className="text-sm font-mono font-bold text-amber-400 mt-0.5">
                  {focusedPerson.code}
                </div>
                <div className="text-xs text-slate-300 mt-1">{focusedPerson.roleTitle}</div>
                <div className="text-xs text-slate-400">{focusedPerson.subtitle}</div>
              </div>
              <div className="text-[11px] font-mono text-emerald-400 pt-2 border-t border-slate-800">
                Token: ZAMOA-CBTC|{focusedPerson.entityType}|{focusedPerson.code}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleCopyCode(focusedPerson.code, focusedPerson.fullName)}
                className="px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Kode QR</span>
              </button>
              <button
                type="button"
                onClick={() => downloadDigitalQrCardSvg(focusedPerson, state.organization.name)}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Kartu QR (.SVG)</span>
              </button>
              {targetSession && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleQuickScanCheckIn(focusedPerson);
                    setFocusedPerson(null);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Simulasikan Scan Check-In</span>
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
