import React, { useState, useMemo } from 'react';
import {
  Megaphone,
  FileText,
  BarChart3,
  Shield,
  Plus,
  Download,
  Building2,
  CheckCheck,
  BellRing,
  Users,
  Image as ImageIcon,
  ArrowRight,
  Send,
  Copy,
  FileDown,
  Wallet,
  CalendarCheck,
  HeartPulse,
  ClipboardCheck,
  Settings,
} from 'lucide-react';
import { SystemState } from '../types/system.ts';
import { apiRequest, exportRowsToCsv, formatIDR } from '../lib/api.ts';
import { hasPermission, ROLE_PERMISSION_MATRIX, SYSTEM_ROLES } from '../lib/rbac.ts';
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendBrowserDigitalNotification,
  formatDigitalNotificationCard,
  downloadDigitalNoticeFile,
  DigitalNotificationPermission,
} from '../lib/digitalNotifications.ts';
import { Modal, StatusText } from '../components/ui/Primitives.tsx';
import { MonthlyAthleteReportHub } from '../components/ui/MonthlyAthleteReportHub.tsx';
import { WhatsAppGatewayHub } from '../components/ui/WhatsAppGatewayHub.tsx';
import {
  AuditLogs,
  AuditLogsView,
  exportAuditLogsToPdf,
  computeAuditJsonDiff,
} from './AuditLogsView.tsx';
import { AppSettingsView } from './AppSettingsView.tsx';

export { AuditLogs, AuditLogsView, exportAuditLogsToPdf, computeAuditJsonDiff };

interface CommDocsReportsAdminViewProps {
  state: SystemState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function CommDocsReportsAdminView({
  state,
  onRefresh,
  notify,
}: CommDocsReportsAdminViewProps) {
  const [subTab, setSubTab] = useState<
    'comm' | 'docs' | 'reports' | 'admin' | 'audit' | 'settings'
  >('comm');
  const [modalType, setModalType] = useState<
    null | 'announcement' | 'direct_notif' | 'document' | 'media' | 'branch' | 'user'
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [dispatchingTrigger, setDispatchingTrigger] = useState<string | null>(null);
  const [notifCategoryFilter, setNotifCategoryFilter] = useState<string>('ALL');
  const [notifReadFilter, setNotifReadFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [browserPushPerm, setBrowserPushPerm] = useState<DigitalNotificationPermission>(() =>
    getBrowserNotificationPermission()
  );

  const role = state.currentUser.activeRoleCode;
  const canCreateComm = hasPermission(role, 'communication', 'create');
  const canCreateDoc = hasPermission(role, 'documents', 'create');
  const canCreateBranch = hasPermission(role, 'administration', 'create');
  const canUpdateAdmin = hasPermission(role, 'administration', 'update');
  const canAudit = hasPermission(role, 'audit', 'view');

  const handleExportSystemAuditPdf = () => {
    const auditLogs = state.auditLogs || [];
    if (auditLogs.length === 0) {
      notify('Tidak ada data jejak audit untuk diekspor ke PDF.', 'error');
      return;
    }
    try {
      const fileName = exportAuditLogsToPdf({
        logs: auditLogs,
        organizationName: state.organization.name,
        printedByName: state.currentUser.fullName,
        printedByRole: state.currentUser.activeRoleCode,
        filterSummary: 'Konsolidasi System Audit Log (Timestamp, User/Role, Tindakan & JSON Diff)',
      });
      notify(
        `Laporan formal System Audit Log (${auditLogs.length} event beserta JSON diff) berhasil diunduh sebagai PDF (${fileName}).`
      );
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : 'Gagal mengekspor PDF Log Audit.',
        'error'
      );
    }
  };

  const [annForm, setAnnForm] = useState({
    branchId: state.currentUser.branchId || '',
    teamId: '',
    targetRole: 'ALL',
    title: '',
    content: '',
    priority: 'IMPORTANT',
  });

  const [directNotifForm, setDirectNotifForm] = useState({
    category: 'BILLING' as
      | 'BILLING'
      | 'TRAINING'
      | 'MEDICAL'
      | 'EVALUATION'
      | 'ANNOUNCEMENT'
      | 'SYSTEM',
    targetRole: 'ALL',
    title: '',
    message: '',
  });

  const [docForm, setDocForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    entityType: 'ATHLETE',
    entityId: state.athletes[0]?.id || '',
    documentCategory: 'CERTIFICATE',
    title: '',
    fileType: 'PDF',
    fileUrl: 'https://storage.zamoa-cbtc.id/docs/sertifikat-kompetisi.pdf',
    visibility: 'BRANCH',
  });

  const [mediaForm, setMediaForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    entityType: 'TRAINING' as 'TRAINING' | 'MATCH' | 'ATHLETE' | 'EVENT',
    entityId: state.trainingSessions[0]?.id || state.athletes[0]?.id || '',
    mediaType: 'PHOTO' as 'PHOTO' | 'VIDEO',
    title: '',
    mediaUrl: 'https://storage.zamoa-cbtc.id/media/highlight-latihan-cbtc.jpg',
    visibility: 'BRANCH' as 'PUBLIC' | 'BRANCH' | 'ROLE_RESTRICTED',
  });

  const [branchForm, setBranchForm] = useState({
    code: '',
    name: '',
    city: '',
    address: '',
    phone: '',
    courtsCount: '2',
  });

  const [userForm, setUserForm] = useState({
    fullName: '',
    email: '',
    activeRoleCode: 'COACH',
    branchId: state.branches[0]?.id || '',
  });

  const handleMarkRead = async (notifId: string) => {
    try {
      await apiRequest(`/api/notifications/${notifId}/read`, { method: 'PATCH' });
      await onRefresh();
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      notify('Seluruh notifikasi digital telah ditandai sebagai dibaca.');
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memperbarui status baca', 'error');
    }
  };

  const handleEnableBrowserPush = async () => {
    const perm = await requestBrowserNotificationPermission();
    setBrowserPushPerm(perm);
    if (perm === 'granted') {
      sendBrowserDigitalNotification(
        'Notifikasi Digital ZAMOA CBTC Aktif',
        'Perangkat Anda kini terhubung dengan sistem pemberitahuan digital real-time akademi.',
        'SYSTEM'
      );
      notify('Push Notifikasi Browser berhasil diaktifkan pada perangkat ini.');
    } else if (perm === 'denied') {
      notify(
        'Izin notifikasi browser diblokir oleh pengaturan browser. Gunakan In-App Digital Notification Center.',
        'error'
      );
    }
  };

  const handleAutoDispatchDigital = async (
    triggerType: 'BILLING_REMINDER' | 'TRAINING_SCHEDULE' | 'MEDICAL_ALERT' | 'EVALUATION_REPORT',
    label: string
  ) => {
    setDispatchingTrigger(triggerType);
    try {
      const res = await apiRequest<{
        ok: boolean;
        dispatchedCount: number;
        items: Array<{ title: string; message: string; category: string }>;
      }>('/api/notifications/auto-dispatch', {
        method: 'POST',
        body: JSON.stringify({
          triggerType,
          channel:
            triggerType === 'BILLING_REMINDER' || triggerType === 'TRAINING_SCHEDULE'
              ? 'WHATSAPP'
              : 'IN_APP',
        }),
      });
      if (res.items?.[0]) {
        sendBrowserDigitalNotification(
          res.items[0].title,
          res.items[0].message,
          res.items[0].category
        );
      }
      notify(
        `Otomasi Gateway "${label}" berhasil menyiarkan ${res.dispatchedCount} notifikasi otomatis ke Orang Tua.`
      );
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal menjalankan otomasi notifikasi', 'error');
    } finally {
      setDispatchingTrigger(null);
    }
  };

  const handleCopyDigitalCard = async (item: {
    id: string;
    category: string;
    title: string;
    message: string;
    createdAt: string;
  }) => {
    const formatted = formatDigitalNotificationCard({
      ...item,
      organizationName: state.organization.name,
    });
    try {
      await navigator.clipboard.writeText(formatted);
      notify('Kartu pemberitahuan digital resmi berhasil disalin ke clipboard.');
    } catch {
      notify('Pesan siap diunduh sebagai bukti digital.');
    }
  };

  const filteredNotifications = useMemo(() => {
    return state.notifications.filter((n) => {
      if (notifCategoryFilter !== 'ALL' && n.category !== notifCategoryFilter) {
        return false;
      }
      if (notifReadFilter === 'UNREAD' && n.isRead) {
        return false;
      }
      return true;
    });
  }, [state.notifications, notifCategoryFilter, notifReadFilter]);

  const unreadCount = useMemo(
    () => state.notifications.filter((n) => !n.isRead).length,
    [state.notifications]
  );

  const handleUpdateUserRole = async (
    userId: string,
    newRoleCode: string,
    newBranchId: string | null
  ) => {
    setUpdatingUserId(userId);
    try {
      await apiRequest(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({
          activeRoleCode: newRoleCode,
          branchId: newBranchId,
        }),
      });
      notify(`Otorisasi role pengguna berhasil diperbarui ke ${newRoleCode}.`);
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memperbarui role pengguna', 'error');
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('comm')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'comm'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span>Komunikasi & Notifikasi ({state.announcements.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('docs')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'docs'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Dokumen & Media ({state.documents.length + state.media.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('reports')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'reports'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Rapor Bulanan Atlet & Laporan KPI</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('admin')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'admin'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Multi-Cabang & RBAC Matrix</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'audit'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>System Audit Log ({state.auditLogs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'settings'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Pengaturan Aplikasi</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'comm' && canCreateComm && (
            <>
              <button
                type="button"
                onClick={() => setModalType('direct_notif')}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5 text-amber-400" />
                <span>Kirim Notifikasi Digital</span>
              </button>
              <button
                type="button"
                onClick={() => setModalType('announcement')}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Publikasikan Pengumuman</span>
              </button>
            </>
          )}
          {subTab === 'docs' && canCreateDoc && (
            <>
              <button
                type="button"
                onClick={() => setModalType('media')}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
              >
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>Unggah Media Latihan/Tanding</span>
              </button>
              <button
                type="button"
                onClick={() => setModalType('document')}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Unggah Metadata Dokumen</span>
              </button>
            </>
          )}
          {subTab === 'admin' && canCreateBranch && (
            <>
              <button
                type="button"
                onClick={() => setModalType('user')}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
              >
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>Tambah Akun Pengguna</span>
              </button>
              <button
                type="button"
                onClick={() => setModalType('branch')}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Cabang Akademi</span>
              </button>
            </>
          )}
          {(subTab === 'audit' || subTab === 'reports' || subTab === 'admin') && (
            <button
              type="button"
              onClick={handleExportSystemAuditPdf}
              className="px-3.5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md flex items-center gap-1.5 shadow-sm transition-colors"
              title="Unduh Laporan Formal Jejak Audit Sistem beserta JSON Diff ke dalam format PDF"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Unduh Log Audit sebagai PDF ({state.auditLogs.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* SUBTAB 1: DIGITAL COMMUNICATION & AUTOMATED NOTIFICATIONS */}
      {subTab === 'comm' && (
        <div className="space-y-6">
          {/* Digital Notification Control Bar & Browser Web Push */}
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <BellRing className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Pusat Digitalisasi Notifikasi & Siaran Otomatis Multi-Peran
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Distribusi pemberitahuan digital real-time melalui In-App Notification Center, Web Push Browser, serta Kartu Pemberitahuan Digital Resmi yang siap dibagikan atau diunduh.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleEnableBrowserPush}
                className={`px-3 py-1.5 text-xs font-semibold rounded border flex items-center gap-1.5 ${
                  browserPushPerm === 'granted'
                    ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>
                  {browserPushPerm === 'granted'
                    ? 'Web Push Browser: Aktif'
                    : 'Aktifkan Push Browser'}
                </span>
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded flex items-center gap-1.5"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Tandai Semua Dibaca ({unreadCount})</span>
                </button>
              )}
            </div>
          </div>

          {/* Automated Digital Event Triggers */}
          {canCreateComm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono text-amber-400">
                    <span>01 / BILLING DIGITAL</span>
                    <Wallet className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-100">
                    Pengingat Tagihan & Piutang
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Pindai otomatis invoice yang belum lunas dan kirim notifikasi tagihan digital.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={dispatchingTrigger !== null}
                  onClick={() =>
                    handleAutoDispatchDigital('BILLING_REMINDER', 'Pengingat Tagihan Invoice')
                  }
                  className="w-full px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-100 border border-slate-700 rounded transition-colors flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {dispatchingTrigger === 'BILLING_REMINDER'
                      ? 'Menyiarkan...'
                      : 'Siarkan Pengingat Tagihan'}
                  </span>
                </button>
              </div>

              <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono text-emerald-400">
                    <span>02 / TRAINING CALL</span>
                    <CalendarCheck className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-100">
                    Panggilan Jadwal Latihan
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Kirim notifikasi jadwal sesi latihan aktif beserta waktu, lapangan, dan pelatih.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={dispatchingTrigger !== null}
                  onClick={() =>
                    handleAutoDispatchDigital('TRAINING_SCHEDULE', 'Panggilan Jadwal Latihan')
                  }
                  className="w-full px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-100 border border-slate-700 rounded transition-colors flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {dispatchingTrigger === 'TRAINING_SCHEDULE'
                      ? 'Menyiarkan...'
                      : 'Siarkan Jadwal Latihan'}
                  </span>
                </button>
              </div>

              <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono text-red-400">
                    <span>03 / MEDICAL ALERT</span>
                    <HeartPulse className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-100">
                    Alert Medis Return-to-Play
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Siarkan peringatan batas latihan bagi atlet dengan status cedera aktif.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={dispatchingTrigger !== null}
                  onClick={() =>
                    handleAutoDispatchDigital('MEDICAL_ALERT', 'Alert Medis Return-to-Play')
                  }
                  className="w-full px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-100 border border-slate-700 rounded transition-colors flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {dispatchingTrigger === 'MEDICAL_ALERT'
                      ? 'Menyiarkan...'
                      : 'Siarkan Alert Medis'}
                  </span>
                </button>
              </div>

              <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono text-sky-400">
                    <span>04 / RAPOR BULANAN ATLET</span>
                    <ClipboardCheck className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-100">
                    Auto-Email Rapor Bulanan Orang Tua
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Kompilasi otomatis data evaluasi teknis, fisik, mental & kehadiran ke email orang tua.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    disabled={dispatchingTrigger !== null}
                    onClick={async () => {
                      setDispatchingTrigger('EVALUATION_REPORT');
                      try {
                        const res = await apiRequest<{
                          ok: boolean;
                          dispatchedCount: number;
                        }>('/api/reports/monthly-athlete-cards/send-email', {
                          method: 'POST',
                          body: JSON.stringify({
                            sendAll: true,
                            periodLabel: 'Rapor Bulanan Oktober 2026',
                          }),
                        });
                        notify(
                          `Berhasil mengirim otomatis ${res.dispatchedCount} Rapor Bulanan Atlet (Teknis, Fisik & Kehadiran) ke email orang tua.`
                        );
                        await onRefresh();
                      } catch (err: unknown) {
                        notify(
                          err instanceof Error ? err.message : 'Gagal mengirim Rapor Bulanan Atlet',
                          'error'
                        );
                      } finally {
                        setDispatchingTrigger(null);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {dispatchingTrigger === 'EVALUATION_REPORT'
                        ? 'Mengirim Email Rapor...'
                        : 'Kirim Email Rapor Bulanan'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubTab('reports')}
                    className="w-full px-2.5 py-1 text-[11px] font-mono text-amber-300 hover:text-amber-200 bg-slate-950/70 border border-slate-800 rounded text-center"
                  >
                    Buka Hub Rapor Bulanan →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* WHATSAPP GATEWAY AUTOMATION CENTER (DAILY TRAINING REMINDER & INVOICE PAYMENT NOTIFICATIONS) */}
          <WhatsAppGatewayHub
            state={state}
            onRefresh={onRefresh}
            notify={notify}
            defaultView="training"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Targeted Announcements */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  Pengumuman Terpublikasi ({state.announcements.length})
                </h3>
                <span className="text-xs text-slate-400">Distribusi Multi-Role</span>
              </div>
              <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                {state.announcements.map((ann) => (
                  <div
                    key={ann.id}
                    className="p-4 rounded border border-slate-800 bg-slate-950/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-amber-400">
                        Target Role: {ann.targetRole || 'ALL'}
                      </span>
                      <StatusText status={ann.priority} />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-100">{ann.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{ann.content}</p>
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-slate-500">
                        {new Date(ann.createdAt).toLocaleString('id-ID')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyDigitalCard({
                              id: ann.id,
                              category: `PENGUMUMAN-${ann.priority}`,
                              title: ann.title,
                              message: ann.content,
                              createdAt: ann.createdAt,
                            })
                          }
                          className="px-2 py-1 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Salin Pesan Digital</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadDigitalNoticeFile({
                              id: ann.id,
                              category: `PENGUMUMAN-${ann.priority}`,
                              title: ann.title,
                              message: ann.content,
                              createdAt: ann.createdAt,
                              organizationName: state.organization.name,
                            })
                          }
                          className="px-2 py-1 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded flex items-center gap-1"
                        >
                          <FileDown className="w-3 h-3" />
                          <span>Unduh Bukti</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Digital Notification Feed */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  In-App Digital Notification Center ({unreadCount} Belum Dibaca)
                </h3>
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Filter kategori notifikasi"
                    value={notifCategoryFilter}
                    onChange={(e) => setNotifCategoryFilter(e.target.value)}
                    className="px-2 py-1 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-200"
                  >
                    <option value="ALL">Semua Kategori</option>
                    <option value="BILLING">BILLING</option>
                    <option value="TRAINING">TRAINING</option>
                    <option value="MEDICAL">MEDICAL</option>
                    <option value="EVALUATION">EVALUATION</option>
                    <option value="ANNOUNCEMENT">ANNOUNCEMENT</option>
                    <option value="SYSTEM">SYSTEM</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setNotifReadFilter((prev) => (prev === 'ALL' ? 'UNREAD' : 'ALL'))
                    }
                    className={`px-2.5 py-1 text-xs font-mono rounded border ${
                      notifReadFilter === 'UNREAD'
                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold'
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    {notifReadFilter === 'UNREAD' ? 'Belum Dibaca' : 'Semua Status'}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
                {filteredNotifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded border space-y-2 ${
                      n.isRead
                        ? 'border-slate-800/60 bg-slate-950/30 opacity-80'
                        : 'border-amber-500/40 bg-amber-950/15'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-mono text-amber-400">
                          {n.category} · {new Date(n.createdAt).toLocaleString('id-ID')}
                        </div>
                        <div className="text-sm font-semibold text-slate-100 mt-0.5">{n.title}</div>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">{n.message}</p>
                      </div>
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(n.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded flex items-center gap-1 shrink-0"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span>Tandai Baca</span>
                        </button>
                      )}
                    </div>
                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopyDigitalCard(n)}
                        className="px-2 py-1 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Salin Kartu Digital</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadDigitalNoticeFile({
                            ...n,
                            organizationName: state.organization.name,
                          })
                        }
                        className="px-2 py-1 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded flex items-center gap-1"
                      >
                        <FileDown className="w-3 h-3" />
                        <span>Unduh Notice</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: DOCUMENTS & MEDIA */}
      {subTab === 'docs' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">
                Repositori Dokumen Resmi, Kontrak, Sertifikat, Invoice & Slip Gaji ({state.documents.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Judul Dokumen</th>
                    <th className="py-3 px-4">Kategori & Entitas</th>
                    <th className="py-3 px-4">Format</th>
                    <th className="py-3 px-4">Visibilitas Akses</th>
                    <th className="py-3 px-4">Waktu Unggah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {state.documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{doc.title}</div>
                        <div className="font-mono text-xs text-slate-400">{doc.fileUrl}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-amber-400">
                        {doc.documentCategory} ({doc.entityType})
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">{doc.fileType}</td>
                      <td className="py-3 px-4">
                        <StatusText status={doc.visibility} />
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-400">
                        {new Date(doc.uploadedAt).toLocaleDateString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">
                Galeri Media Dokumentasi Latihan, Pertandingan & Evaluasi ({state.media.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Judul Media</th>
                    <th className="py-3 px-4">Tipe & Entitas</th>
                    <th className="py-3 px-4">Visibilitas</th>
                    <th className="py-3 px-4">Waktu Unggah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {state.media.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{m.title}</div>
                        <div className="font-mono text-xs text-slate-400">{m.mediaUrl}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-amber-400">
                        {m.mediaType} · {m.entityType}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={m.visibility} />
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-400">
                        {new Date(m.uploadedAt).toLocaleDateString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: EXECUTIVE REPORTS & ANALYTICS */}
      {subTab === 'reports' && (
        <div className="space-y-6">
          {/* MONTHLY ATHLETE REPORT CARD & AUTO-EMAIL PARENT HUB */}
          <MonthlyAthleteReportHub state={state} onRefresh={onRefresh} notify={notify} />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3">
              <h4 className="text-sm font-semibold text-slate-100">
                1. Laporan Pertumbuhan & Retensi Atlet
              </h4>
              <p className="text-xs text-slate-400">
                Rekapitulasi status membership aktif, non-aktif, alumni, dan distribusi per cabang/KU.
              </p>
              <button
                type="button"
                onClick={() =>
                  exportRowsToCsv(
                    'laporan-pertumbuhan-atlet',
                    state.athletes.map((a) => ({
                      memberCode: a.memberCode,
                      fullName: a.fullName,
                      status: a.membershipStatus,
                      position: a.position,
                      joinedAt: a.joinedAt,
                    }))
                  )
                }
                className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh CSV Atlet</span>
              </button>
            </div>

            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3">
              <h4 className="text-sm font-semibold text-slate-100">
                2. Laporan Keuangan & Piutang Membership
              </h4>
              <p className="text-xs text-slate-400">
                Rekapitulasi tagihan terbit, pembayaran masuk, sisa piutang (AR), dan pengeluaran.
              </p>
              <button
                type="button"
                onClick={() =>
                  exportRowsToCsv(
                    'laporan-keuangan-piutang',
                    state.invoices.map((i) => ({
                      invoiceNumber: i.invoiceNumber,
                      category: i.revenueCategory,
                      totalAmount: i.totalAmount,
                      paidAmount: i.paidAmount,
                      status: i.status,
                    }))
                  )
                }
                className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh CSV Keuangan</span>
              </button>
            </div>

            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3">
              <h4 className="text-sm font-semibold text-slate-100">
                3. Laporan Produktivitas Pelatih & Payroll
              </h4>
              <p className="text-xs text-slate-400">
                Rekapitulasi sesi latihan terlaksana, evaluasi atlet, dan biaya kompensasi bulanan.
              </p>
              <button
                type="button"
                onClick={() =>
                  exportRowsToCsv(
                    'laporan-payroll-kompensasi',
                    state.payrolls.map((p) => ({
                      payrollNumber: p.payrollNumber,
                      period: `${p.periodMonth}/${p.periodYear}`,
                      totalGross: p.totalGross,
                      totalDeduction: p.totalDeduction,
                      totalNet: p.totalNet,
                      status: p.status,
                    }))
                  )
                }
                className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh CSV Payroll</span>
              </button>
            </div>

            <div className="p-5 rounded-lg border border-amber-500/30 bg-amber-950/15 space-y-3">
              <h4 className="text-sm font-semibold text-slate-100">
                4. Laporan Formal Jejak Audit & JSON Diff (PDF)
              </h4>
              <p className="text-xs text-slate-300">
                Dokumen laporan tata kelola formal mencakup timestamp, user/role, tindakan, dan rincian perubahan nilai data (JSON diff).
              </p>
              <button
                type="button"
                onClick={handleExportSystemAuditPdf}
                className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded inline-flex items-center gap-1.5 shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Unduh Log Audit sebagai PDF</span>
              </button>
            </div>
          </div>

          {/* Branch Comparison Table */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">
                Matriks Perbandingan Kinerja Antar-Cabang (Multi-Branch KPI)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Cabang</th>
                    <th className="py-3 px-4 text-right">Atlet Aktif</th>
                    <th className="py-3 px-4 text-right">Tim</th>
                    <th className="py-3 px-4 text-right">Pelatih</th>
                    <th className="py-3 px-4 text-right">Total Pendapatan Tertagih</th>
                    <th className="py-3 px-4 text-right">Total Beban</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm font-mono">
                  {state.branches.map((b) => {
                    const bAthletes = state.athletes.filter(
                      (a) => a.branchId === b.id && a.membershipStatus === 'ACTIVE'
                    ).length;
                    const bTeams = state.teams.filter((t) => t.branchId === b.id).length;
                    const bCoaches = state.coaches.filter((c) => c.branchId === b.id).length;
                    const bCollected = state.invoices
                      .filter((i) => i.branchId === b.id && i.status !== 'CANCELLED')
                      .reduce((s, i) => s + Number(i.paidAmount || 0), 0);
                    const bExpense = state.expenses
                      .filter((e) => e.branchId === b.id)
                      .reduce((s, e) => s + Number(e.amount || 0), 0);
                    return (
                      <tr key={b.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-sans font-semibold text-slate-100">
                          {b.name} <span className="font-mono text-amber-400">({b.code})</span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-200">{bAthletes}</td>
                        <td className="py-3 px-4 text-right text-slate-200">{bTeams}</td>
                        <td className="py-3 px-4 text-right text-slate-200">{bCoaches}</td>
                        <td className="py-3 px-4 text-right text-emerald-400">
                          {formatIDR(bCollected)}
                        </td>
                        <td className="py-3 px-4 text-right text-red-300">
                          {formatIDR(bExpense)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: MULTI-BRANCH & USER RBAC MATRIX */}
      {subTab === 'admin' && (
        <div className="space-y-6">
          {/* Branches */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-100">
                Daftar Cabang Operasional ({state.branches.length})
              </h3>
              {canAudit && (
                <button
                  type="button"
                  onClick={() => setSubTab('audit')}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Buka Audit Logs</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {state.branches.map((b) => (
                <div
                  key={b.id}
                  className="p-4 rounded border border-slate-800 bg-slate-950/50 flex items-start justify-between"
                >
                  <div>
                    <div className="font-mono text-xs text-amber-400">{b.code}</div>
                    <div className="text-sm font-semibold text-slate-100">{b.name}</div>
                    <div className="text-xs text-slate-400">
                      {b.city} — {b.address}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs text-slate-300">
                    <div>{b.courtsCount} Court</div>
                    <StatusText status={b.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* User Accounts & Role Assignment Management */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Manajemen Akun Pengguna & Delegasi Role/Cabang ({state.users.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Setiap perubahan role atau cakupan cabang pengguna secara otomatis tercatat pada tabel audit_logs (PERMISSION_CHANGE).
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Nama & Email</th>
                    <th className="py-3 px-4">Role Aktif</th>
                    <th className="py-3 px-4">Cakupan Cabang</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {state.users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{u.fullName}</div>
                        <div className="font-mono text-slate-400">{u.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        {canUpdateAdmin ? (
                          <select
                            aria-label={`Ubah role untuk ${u.fullName}`}
                            value={u.activeRoleCode}
                            disabled={updatingUserId === u.id}
                            onChange={(e) =>
                              handleUpdateUserRole(u.id, e.target.value, u.branchId)
                            }
                            className="px-2.5 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-amber-400"
                          >
                            {SYSTEM_ROLES.map((r) => (
                              <option key={r.code} value={r.code}>
                                {r.code} — {r.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-mono text-amber-400">{u.activeRoleCode}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {canUpdateAdmin ? (
                          <select
                            aria-label={`Ubah cabang untuk ${u.fullName}`}
                            value={u.branchId || 'ALL'}
                            disabled={updatingUserId === u.id}
                            onChange={(e) =>
                              handleUpdateUserRole(
                                u.id,
                                u.activeRoleCode,
                                e.target.value === 'ALL' ? null : e.target.value
                              )
                            }
                            className="px-2.5 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-200"
                          >
                            <option value="ALL">ALL_BRANCHES (Konsolidasi Pusat)</option>
                            {state.branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.code} — {b.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-mono text-slate-300">
                            {state.branches.find((b) => b.id === u.branchId)?.name || 'ALL_BRANCHES'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RBAC Matrix */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">
                Matriks Role-Based Access Control (12 Role × Action-Level Permissions)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Cakupan Cabang</th>
                    <th className="py-3 px-4">Otorisasi Modul & Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {SYSTEM_ROLES.map((r) => {
                    const perms = ROLE_PERMISSION_MATRIX[r.code] || {};
                    return (
                      <tr key={r.code} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-amber-400">{r.code}</div>
                          <div className="text-slate-200 font-medium">{r.name}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {r.branchScoped ? 'BRANCH_SCOPED' : 'ALL_BRANCHES'}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                          {Object.entries(perms).map(([dom, acts]) => (
                            <span key={dom} className="inline-block mr-3 mb-1">
                              <strong className="text-slate-100">{dom}:</strong> [
                              {(acts as string[]).join(', ')}]
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 5: SYSTEM AUDIT LOG (DATABASE QUERIES & SYSTEM EVENTS) */}
      {subTab === 'audit' && <AuditLogs state={state} notify={notify} />}

      {/* SUBTAB 6: APPLICATION SETTINGS */}
      {subTab === 'settings' && (
        <AppSettingsView state={state} onRefresh={onRefresh} notify={notify} />
      )}

      {/* MODALS */}
      <Modal
        open={modalType !== null}
        onClose={() => setModalType(null)}
        title={
          modalType === 'announcement'
            ? 'Publikasikan Pengumuman Akademi'
            : modalType === 'direct_notif'
            ? 'Kirim Notifikasi Digital Terarah'
            : modalType === 'document'
            ? 'Unggah Metadata Dokumen Resmi'
            : modalType === 'media'
            ? 'Unggah Dokumentasi Media Latihan / Pertandingan'
            : modalType === 'user'
            ? 'Tambah Akun Pengguna & Delegasi Role RBAC'
            : 'Tambah Cabang Akademi Baru'
        }
      >
        {modalType === 'direct_notif' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                const res = await apiRequest<{
                  ok: boolean;
                  dispatchedCount: number;
                }>('/api/notifications/send-direct', {
                  method: 'POST',
                  body: JSON.stringify(directNotifForm),
                });
                sendBrowserDigitalNotification(
                  directNotifForm.title,
                  directNotifForm.message,
                  directNotifForm.category
                );
                notify(
                  `Notifikasi digital berhasil dikirim ke ${res.dispatchedCount} penerima (${directNotifForm.targetRole}).`
                );
                setModalType(null);
                setDirectNotifForm({
                  category: 'BILLING',
                  targetRole: 'ALL',
                  title: '',
                  message: '',
                });
                await onRefresh();
              } catch (err: unknown) {
                notify(
                  err instanceof Error ? err.message : 'Gagal mengirim notifikasi digital',
                  'error'
                );
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kategori Notifikasi *</label>
                <select
                  value={directNotifForm.category}
                  onChange={(e) =>
                    setDirectNotifForm({
                      ...directNotifForm,
                      category: e.target.value as
                        | 'BILLING'
                        | 'TRAINING'
                        | 'MEDICAL'
                        | 'EVALUATION'
                        | 'ANNOUNCEMENT'
                        | 'SYSTEM',
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                >
                  <option value="BILLING">BILLING (Keuangan & Tagihan)</option>
                  <option value="TRAINING">TRAINING (Jadwal & Presensi)</option>
                  <option value="MEDICAL">MEDICAL (Kesehatan & RTP)</option>
                  <option value="EVALUATION">EVALUATION (Rapor Atlet)</option>
                  <option value="ANNOUNCEMENT">ANNOUNCEMENT (Pengumuman)</option>
                  <option value="SYSTEM">SYSTEM (Operasional)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target Penerima (Role) *</label>
                <select
                  value={directNotifForm.targetRole}
                  onChange={(e) =>
                    setDirectNotifForm({ ...directNotifForm, targetRole: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="ALL">SELURUH ROLE (ALL)</option>
                  {SYSTEM_ROLES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Judul Notifikasi Digital *</label>
              <input
                type="text"
                required
                value={directNotifForm.title}
                onChange={(e) =>
                  setDirectNotifForm({ ...directNotifForm, title: e.target.value })
                }
                placeholder="[Tagihan Membership] Konfirmasi Pembayaran Periode berjalan"
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Isi Pesan Digital *</label>
              <textarea
                rows={3}
                required
                value={directNotifForm.message}
                onChange={(e) =>
                  setDirectNotifForm({ ...directNotifForm, message: e.target.value })
                }
                placeholder="Tulis rincian informasi yang akan diterima secara real-time di pusat notifikasi pengguna..."
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim Notifikasi Digital</span>
              </button>
            </div>
          </form>
        )}
        {modalType === 'announcement' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/announcements', {
                  method: 'POST',
                  body: JSON.stringify(annForm),
                });
                notify('Pengumuman berhasil dipublikasikan dan notifikasi dikirim.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal membuat pengumuman', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs text-slate-400 mb-1">Judul Pengumuman *</label>
              <input
                type="text"
                required
                value={annForm.title}
                onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Prioritas *</label>
                <select
                  value={annForm.priority}
                  onChange={(e) => setAnnForm({ ...annForm, priority: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="NORMAL">NORMAL</option>
                  <option value="IMPORTANT">IMPORTANT</option>
                  <option value="URGENT">URGENT</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target Role</label>
                <select
                  value={annForm.targetRole}
                  onChange={(e) => setAnnForm({ ...annForm, targetRole: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="ALL">SELURUH ROLE (ALL)</option>
                  {SYSTEM_ROLES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Isi Pengumuman *</label>
              <textarea
                rows={3}
                required
                value={annForm.content}
                onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Publikasikan
              </button>
            </div>
          </form>
        )}

        {modalType === 'document' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/documents', {
                  method: 'POST',
                  body: JSON.stringify(docForm),
                });
                notify('Metadata dokumen berhasil disimpan.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menyimpan dokumen', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Judul Dokumen *</label>
                <input
                  type="text"
                  required
                  value={docForm.title}
                  onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                  placeholder="Sertifikat Kelulusan Evaluasi Level 1"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kategori *</label>
                <select
                  value={docForm.documentCategory}
                  onChange={(e) => setDocForm({ ...docForm, documentCategory: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="CERTIFICATE">CERTIFICATE</option>
                  <option value="DOCUMENT">DOCUMENT</option>
                  <option value="CONTRACT">CONTRACT</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Visibilitas *</label>
                <select
                  value={docForm.visibility}
                  onChange={(e) => setDocForm({ ...docForm, visibility: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="PUBLIC">PUBLIC</option>
                  <option value="BRANCH">BRANCH</option>
                  <option value="ROLE_RESTRICTED">ROLE_RESTRICTED</option>
                  <option value="PRIVATE">PRIVATE</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Simpan Dokumen
              </button>
            </div>
          </form>
        )}

        {modalType === 'media' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/media', {
                  method: 'POST',
                  body: JSON.stringify(mediaForm),
                });
                notify('Metadata media berhasil diunggah.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menyimpan media', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Judul Media *</label>
                <input
                  type="text"
                  required
                  value={mediaForm.title}
                  onChange={(e) => setMediaForm({ ...mediaForm, title: e.target.value })}
                  placeholder="Rekaman Drill Shooting & Scrimmage KU-16"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tipe Media *</label>
                <select
                  value={mediaForm.mediaType}
                  onChange={(e) =>
                    setMediaForm({
                      ...mediaForm,
                      mediaType: e.target.value as 'PHOTO' | 'VIDEO',
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="PHOTO">PHOTO</option>
                  <option value="VIDEO">VIDEO</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Visibilitas *</label>
                <select
                  value={mediaForm.visibility}
                  onChange={(e) =>
                    setMediaForm({
                      ...mediaForm,
                      visibility: e.target.value as 'PUBLIC' | 'BRANCH' | 'ROLE_RESTRICTED',
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="PUBLIC">PUBLIC</option>
                  <option value="BRANCH">BRANCH</option>
                  <option value="ROLE_RESTRICTED">ROLE_RESTRICTED</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">URL Media *</label>
                <input
                  type="text"
                  required
                  value={mediaForm.mediaUrl}
                  onChange={(e) => setMediaForm({ ...mediaForm, mediaUrl: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Simpan Media
              </button>
            </div>
          </form>
        )}

        {modalType === 'user' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/users', {
                  method: 'POST',
                  body: JSON.stringify(userForm),
                });
                notify('Akun pengguna baru berhasil dibuat.');
                setModalType(null);
                setUserForm({
                  fullName: '',
                  email: '',
                  activeRoleCode: 'COACH',
                  branchId: state.branches[0]?.id || '',
                });
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal membuat pengguna baru', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={userForm.fullName}
                  onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                  placeholder="Coach Hendra Wijaya"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Email Resmi *</label>
                <input
                  type="email"
                  required
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder="hendra.wijaya@zamoa-cbtc.id"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Role RBAC *</label>
                <select
                  value={userForm.activeRoleCode}
                  onChange={(e) => setUserForm({ ...userForm, activeRoleCode: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                >
                  {SYSTEM_ROLES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Penempatan Cabang</label>
                <select
                  value={userForm.branchId}
                  onChange={(e) => setUserForm({ ...userForm, branchId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="">Seluruh Cabang (Pusat)</option>
                  {state.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Buat Akun Pengguna
              </button>
            </div>
          </form>
        )}

        {modalType === 'branch' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/branches', {
                  method: 'POST',
                  body: JSON.stringify(branchForm),
                });
                notify('Cabang baru berhasil ditambahkan.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menambah cabang', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kode Cabang *</label>
                <input
                  type="text"
                  required
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                  placeholder="CBTC-BDG"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Cabang *</label>
                <input
                  type="text"
                  required
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder="ZAMOA CBTC Bandung Arena"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kota *</label>
                <input
                  type="text"
                  required
                  value={branchForm.city}
                  onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Jumlah Lapangan *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={branchForm.courtsCount}
                  onChange={(e) => setBranchForm({ ...branchForm, courtsCount: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Alamat Lengkap *</label>
                <input
                  type="text"
                  required
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Simpan Cabang
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
