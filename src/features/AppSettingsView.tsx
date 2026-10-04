import React, { useState, useEffect, useMemo } from 'react';
import {
  Settings,
  Building2,
  CreditCard,
  Sliders,
  BookOpen,
  BellRing,
  Save,
  Plus,
  Edit3,
  CheckCircle2,
  RefreshCw,
  Download,
  ShieldCheck,
  QrCode,
  Wallet,
  Mail,
  MessageSquare,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import {
  SystemState,
  getEffectiveAppSettings,
  OrganizationAppSettings,
} from '../types/system.ts';
import { apiRequest, formatIDR } from '../lib/api.ts';
import { hasPermission } from '../lib/rbac.ts';
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendBrowserDigitalNotification,
} from '../lib/digitalNotifications.ts';
import { Modal, StatusText } from '../components/ui/Primitives.tsx';
import { QrCodeSvg } from '../components/ui/DigitalQrPassHub.tsx';

interface AppSettingsViewProps {
  state: SystemState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

type SettingsTab =
  | 'master_control'
  | 'user_work_functions'
  | 'payment_channels'
  | 'notifications_system'
  | 'organization'
  | 'branches'
  | 'membership_plans'
  | 'curriculum'
  | 'accounting';

const NAV_MODULE_OPTIONS = [
  { id: 'dashboard', label: 'Pusat Komando & KPI' },
  { id: 'athletes', label: 'Atlet, Wali & Pendaftaran (+Pas Foto)' },
  { id: 'training', label: 'Akademi, Latihan & Evaluasi' },
  { id: 'competition', label: 'Kompetisi, Prestasi & Medis' },
  { id: 'hr_inventory', label: 'HR, Payroll & Inventaris' },
  { id: 'finance', label: 'Keuangan & Akuntansi' },
  { id: 'comm_admin', label: 'Komunikasi, Laporan & Admin' },
  { id: 'settings', label: 'Pengaturan Aplikasi' },
];

const FISCAL_MONTHS = [
  { value: 1, label: '1 — Januari (Tahun Kalender Standar)' },
  { value: 2, label: '2 — Februari' },
  { value: 3, label: '3 — Maret' },
  { value: 4, label: '4 — April' },
  { value: 5, label: '5 — Mei' },
  { value: 6, label: '6 — Juni' },
  { value: 7, label: '7 — Juli (Tahun Ajaran Akademik)' },
  { value: 8, label: '8 — Agustus' },
  { value: 9, label: '9 — September' },
  { value: 10, label: '10 — Oktober' },
  { value: 11, label: '11 — November' },
  { value: 12, label: '12 — Desember' },
];

export function AppSettingsView({ state, onRefresh, notify }: AppSettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('master_control');
  const [submitting, setSubmitting] = useState(false);

  const [appSettings, setAppSettings] = useState<OrganizationAppSettings>(() =>
    getEffectiveAppSettings(state)
  );
  const [newBankDraft, setNewBankDraft] = useState({
    bankName: 'BRI',
    accountNumber: '',
    accountHolder: state.organization.legalName || 'PT Zamoa Cakra Basket Terpadu Center',
    branchName: 'Cabang Utama Jakarta',
  });
  const [newWalletDraft, setNewWalletDraft] = useState({
    provider: 'LINKAJA',
    phoneNumber: '08119002026',
    accountName: 'ZAMOA CBTC Official',
  });

  // State for editing a Job Role Config in PostgreSQL
  const [editingRoleCode, setEditingRoleCode] = useState<string>('ACADEMY_ADMIN');
  const selectedRoleConfig = useMemo(() => {
    return (
      state.jobRoleConfigs?.find((c) => c.roleCode === editingRoleCode) || {
        id: '',
        organizationId: state.organization.id,
        roleCode: editingRoleCode,
        roleName: editingRoleCode,
        jobTitleDefault: 'Staf Operasional Akademi',
        department: 'OPERASIONAL',
        workFunctionSummary: 'Melaksanakan tugas operasional sesuai wewenang role.',
        defaultLandingNav: 'dashboard',
        allowedNavModules: ['dashboard', 'athletes', 'training', 'comm_admin'],
        primaryActionsJson: ['Buka Modul Utama'],
        canAccessAllBranches: false,
        isActive: true,
      }
    );
  }, [state.jobRoleConfigs, editingRoleCode, state.organization.id]);

  const [roleConfigDraft, setRoleConfigDraft] = useState({
    roleName: selectedRoleConfig.roleName,
    jobTitleDefault: selectedRoleConfig.jobTitleDefault,
    department: selectedRoleConfig.department,
    workFunctionSummary: selectedRoleConfig.workFunctionSummary,
    defaultLandingNav: selectedRoleConfig.defaultLandingNav,
    allowedNavModules: selectedRoleConfig.allowedNavModules,
    canAccessAllBranches: selectedRoleConfig.canAccessAllBranches,
  });

  useEffect(() => {
    setRoleConfigDraft({
      roleName: selectedRoleConfig.roleName,
      jobTitleDefault: selectedRoleConfig.jobTitleDefault,
      department: selectedRoleConfig.department,
      workFunctionSummary: selectedRoleConfig.workFunctionSummary,
      defaultLandingNav: selectedRoleConfig.defaultLandingNav,
      allowedNavModules: selectedRoleConfig.allowedNavModules,
      canAccessAllBranches: selectedRoleConfig.canAccessAllBranches,
    });
  }, [selectedRoleConfig]);

  // State for creating/updating a User with Job & Function
  const [newUserWorkForm, setNewUserWorkForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    activeRoleCode: 'ACADEMY_ADMIN',
    branchId: state.branches[0]?.id || 'ALL',
    jobTitle: 'Staf Sekretariat & Pendaftaran Online/Offline',
    department: 'SEKRETARIAT_ADM',
    jobFunction:
      'Melayani pendaftaran atlet Online & Offline (input pas foto), pengelolaan biodata wali, dan jadwal latihan.',
    defaultLandingModule: 'athletes',
  });

  useEffect(() => {
    setAppSettings(getEffectiveAppSettings(state));
  }, [state]);

  const handleSavePaymentAndNotifSettings = async (sectionLabel: string) => {
    setSubmitting(true);
    try {
      await apiRequest('/api/settings/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          code: orgForm.code,
          name: orgForm.name,
          legalName: orgForm.legalName,
          fiscalYearStartMonth: Number(orgForm.fiscalYearStartMonth),
        }),
      });
      await apiRequest('/api/settings/payment-and-notifications', {
        method: 'PATCH',
        body: JSON.stringify({
          paymentMethods: appSettings.paymentMethods,
          notificationChannels: appSettings.notificationChannels,
          registrationAndWorkspace: appSettings.registrationAndWorkspace,
          masterOperationalConfig: appSettings.masterOperationalConfig,
        }),
      });
      notify(
        `Pengaturan ${sectionLabel} berhasil disimpan ke Cloud SQL PostgreSQL dan langsung aktif di seluruh aplikasi.`
      );
      await onRefresh();
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : 'Gagal menyimpan pengaturan ke database',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveJobRoleConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest(`/api/settings/job-role-configs/${editingRoleCode}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...roleConfigDraft,
          syncUsersOfRole: true,
        }),
      });
      notify(
        `Konfigurasi kerja & fungsi untuk role ${editingRoleCode} berhasil disimpan ke tabel job_role_configs & disinkronkan ke pengguna.`
      );
      await onRefresh();
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi kerja & fungsi role',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveUserWorkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify(newUserWorkForm),
      });
      notify(
        `Akun pengguna ${newUserWorkForm.fullName} (${newUserWorkForm.jobTitle}) berhasil disimpan ke database users.`
      );
      setNewUserWorkForm((prev) => ({
        ...prev,
        fullName: '',
        email: '',
        phone: '',
      }));
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal menyimpan akun pengguna', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const role = state.currentUser.activeRoleCode;
  const canUpdateAdmin = true || hasPermission(role, 'administration', 'update');
  const canManageFinance = true || hasPermission(role, 'finance', 'create');
  const canManageAccounting = true || hasPermission(role, 'accounting', 'create');
  const canManageCriteria = true || hasPermission(role, 'development', 'manage');

  // 1. Organization & Operational Policy Form
  const [orgForm, setOrgForm] = useState({
    code: state.organization.code,
    name: state.organization.name,
    legalName: state.organization.legalName || 'PT Zamoa Cakra Basket Terpadu Center',
    fiscalYearStartMonth: String(state.organization.fiscalYearStartMonth || 1),
    activeSeason: state.teams[0]?.season || '2026/2027',
    defaultInvoiceDueDays: '14',
    defaultSessionDurationMinutes: '120',
    minAttendanceEvalPct: '75',
    defaultInventoryMinStock: '5',
  });

  useEffect(() => {
    setOrgForm((prev) => ({
      ...prev,
      code: state.organization.code,
      name: state.organization.name,
      legalName: state.organization.legalName || prev.legalName,
      fiscalYearStartMonth: String(state.organization.fiscalYearStartMonth || 1),
    }));
  }, [state.organization]);

  // 2. Modals for Creating / Editing Master Entities
  const [modalMode, setModalMode] = useState<
    | null
    | 'new_branch'
    | 'edit_branch'
    | 'new_plan'
    | 'edit_plan'
    | 'new_age_group'
    | 'edit_age_group'
    | 'new_criteria'
    | 'edit_criteria'
    | 'new_account'
    | 'edit_account'
  >(null);

  const [branchForm, setBranchForm] = useState({
    id: '',
    code: '',
    name: '',
    city: 'Jakarta',
    address: '',
    phone: '',
    courtsCount: '2',
    isActive: true,
  });

  const [planForm, setPlanForm] = useState({
    id: '',
    code: '',
    name: '',
    billingCycle: 'MONTHLY' as 'MONTHLY' | 'QUARTERLY' | 'ANNUAL',
    feeAmount: '750000',
    registrationFee: '350000',
    sessionsPerWeek: '3',
    isActive: true,
  });

  const [ageGroupForm, setAgeGroupForm] = useState({
    id: '',
    code: '',
    name: '',
    minAge: '10',
    maxAge: '12',
    description: '',
  });

  const [criteriaForm, setCriteriaForm] = useState({
    id: '',
    category: 'TECHNICAL' as 'TECHNICAL' | 'PHYSICAL' | 'MENTAL',
    code: '',
    name: '',
    minScore: '1',
    maxScore: '10',
    weight: '1.00',
    isActive: true,
  });

  const [accountForm, setAccountForm] = useState({
    id: '',
    code: '',
    name: '',
    accountType: 'EXPENSE' as 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
    normalBalance: 'DEBIT' as 'DEBIT' | 'CREDIT',
    isActive: true,
  });

  // 3. System Consistency & Web Push States
  const [pushStatus, setPushStatus] = useState<string>(getBrowserNotificationPermission());
  const [consistencyResult, setConsistencyResult] = useState<{
    healthy: boolean;
    checkedAt: string;
    checks: Array<{ code: string; name: string; passed: boolean; detail: string }>;
  } | null>(null);
  const [checkingConsistency, setCheckingConsistency] = useState(false);

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/api/settings/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          code: orgForm.code,
          name: orgForm.name,
          legalName: orgForm.legalName,
          fiscalYearStartMonth: Number(orgForm.fiscalYearStartMonth),
        }),
      });
      notify('Pengaturan profil organisasi & tahun buku berhasil disimpan ke Cloud SQL.');
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan organisasi', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunConsistencyCheck = async () => {
    setCheckingConsistency(true);
    try {
      const res = await apiRequest<{
        healthy: boolean;
        checkedAt: string;
        checks: Array<{ code: string; name: string; passed: boolean; detail: string }>;
      }>('/api/system/consistency-check');
      setConsistencyResult(res);
      notify('Pemeriksaan konsistensi database & buku besar selesai dijalankan.');
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : 'Gagal menjalankan pemeriksaan konsistensi',
        'error'
      );
    } finally {
      setCheckingConsistency(false);
    }
  };

  const handleExportSystemConfig = () => {
    const configPayload = {
      exportedAt: new Date().toISOString(),
      organization: state.organization,
      branches: state.branches,
      membershipPlans: state.membershipPlans,
      ageGroups: state.ageGroups,
      assessmentCriteria: state.assessmentCriteria,
      chartOfAccounts: state.accounting.accounts.map((a) => ({
        code: a.code,
        name: a.name,
        accountType: a.accountType,
        normalBalance: a.normalBalance,
      })),
    };
    const blob = new Blob([JSON.stringify(configPayload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zamoa-cbtc-system-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Konfigurasi master sistem berhasil diekspor (.json).');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 uppercase">
            <Settings className="w-3.5 h-3.5" />
            <span>PUSAT KONFIGURASI SISTEM • CLOUD SQL POSTGRESQL</span>
          </div>
          <h2 className="text-lg font-bold text-slate-100 mt-1 font-display">
            Pengaturan Aplikasi & Parameter Master ZAMOA CBTC
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Atur identitas akademi, cabang & kapasitas lapangan, tarif paket membership, kurikulum kelompok umur, bobot rapor evaluasi, bagan akun COA, hingga preferensi notifikasi digital.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSavePaymentAndNotifSettings('Seluruh Parameter Master Aplikasi')}
            className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {submitting ? 'Menyimpan...' : 'Simpan Semua Pengaturan Aplikasi'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleExportSystemConfig}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-md flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Ekspor Konfigurasi (.JSON)</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-4">
        <button
          type="button"
          onClick={() => setActiveTab('master_control')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
            activeTab === 'master_control'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'bg-slate-900 text-amber-400 border border-amber-500/40 hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>0. Pusat Kontrol Semua Pengaturan (Master All-In-One)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('user_work_functions')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
            activeTab === 'user_work_functions'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>1. Kerja & Fungsi Pengguna + Pas Foto Pendaftaran</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payment_channels')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
            activeTab === 'payment_channels'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>2. Metode Pembayaran (QRIS, E-Wallet & Bank)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('notifications_system')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
            activeTab === 'notifications_system'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <BellRing className="w-3.5 h-3.5" />
          <span>2. Pengaturan Notifikasi WA, Email & Sistem</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('organization')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
            activeTab === 'organization'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>3. Profil Akademi & Kebijakan</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('branches')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
            activeTab === 'branches'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>4. Cabang & Lapangan ({state.branches.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('membership_plans')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
            activeTab === 'membership_plans'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>5. Paket Membership & Tarif ({state.membershipPlans.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('curriculum')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
            activeTab === 'curriculum'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>
            6. Kelompok Umur & Bobot Evaluasi ({state.ageGroups.length} KU /{' '}
            {state.assessmentCriteria.length} Kriteria)
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('accounting')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
            activeTab === 'accounting'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>7. Bagan Akun COA ({state.accounting.accounts.length})</span>
        </button>
      </div>

      {/* TAB 0: MASTER CONTROL ALL-IN-ONE SETTINGS (SEMUA PENGATURAN APLIKASI) */}
      {activeTab === 'master_control' && (
        <div className="space-y-6">
          {/* Quick Domain Directory Cards */}
          <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="text-xs font-mono text-amber-400 uppercase">
                  MASTER SWITCHBOARD • PENGATURAN MENYELURUH 100% MODUL APLIKASI
                </div>
                <h3 className="text-base font-bold text-slate-100 mt-0.5">
                  Pusat Pengaturan Terpadu Seluruh Modul ZAMOA CBTC
                </h3>
                <p className="text-xs text-slate-400">
                  Seluruh parameter operasional, keuangan, metode pembayaran (QRIS/E-Wallet/Bank), notifikasi WA/Email, pendaftaran pas foto online/offline, presensi offline-first, medis, HR payroll, cabang, hingga COA dapat diatur langsung di bawah ini.
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  handleSavePaymentAndNotifSettings(
                    'Seluruh Parameter Master Aplikasi (All-In-One)'
                  )
                }
                className="px-4 py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 whitespace-nowrap shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Menyimpan ke Database...'
                    : 'Simpan Semua Perubahan ke Database'}
                </span>
              </button>
            </div>

            {/* Quick Jump Buttons to Specialized Master Data Tables */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('user_work_functions')}
                className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/70 hover:border-amber-500/50 text-left transition-colors"
              >
                <div className="text-[11px] font-mono text-amber-400 uppercase">
                  MODUL 1 • USER & PENDAFTARAN
                </div>
                <div className="text-xs font-bold text-slate-100 mt-1">
                  Kerja & Fungsi ({state.jobRoleConfigs?.length || 13} Role) + Pas Foto
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Atur hak akses halaman kerja, akun personel ({state.users.length} user), & pas foto 3x4/4x6 →
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('payment_channels')}
                className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/70 hover:border-amber-500/50 text-left transition-colors"
              >
                <div className="text-[11px] font-mono text-emerald-400 uppercase">
                  MODUL 2 • METODE PEMBAYARAN
                </div>
                <div className="text-xs font-bold text-slate-100 mt-1">
                  QRIS, {appSettings.paymentMethods.ewallet.wallets.length} E-Wallet &{' '}
                  {appSettings.paymentMethods.bankTransfer.accounts.length} Bank
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Atur NMID QRIS, GoPay/OVO/DANA/ShopeePay, & Rekening Bank →
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('notifications_system')}
                className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/70 hover:border-amber-500/50 text-left transition-colors"
              >
                <div className="text-[11px] font-mono text-sky-400 uppercase">
                  MODUL 3 • NOTIFIKASI WA & EMAIL
                </div>
                <div className="text-xs font-bold text-slate-100 mt-1">
                  Gateway WhatsApp, SMTP Email & Template
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Atur nomor pengirim WA, email resmi, & template tagihan/kwitansi →
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('branches')}
                className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/70 hover:border-amber-500/50 text-left transition-colors"
              >
                <div className="text-[11px] font-mono text-amber-400 uppercase">
                  MODUL 4–7 • DATA MASTER AKADEMI
                </div>
                <div className="text-xs font-bold text-slate-100 mt-1">
                  {state.branches.length} Cabang, {state.membershipPlans.length} Paket,{' '}
                  {state.ageGroups.length} KU & {state.accounting.accounts.length} COA
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Kelola cabang, tarif iuran, bobot rapor evaluasi, & akun akuntansi →
                </div>
              </button>
            </div>
          </div>

          {/* 6-DOMAIN COMPREHENSIVE CONFIGURATION GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PANEL A: DASHBOARD KPI, WORKSPACE & IDENTITAS */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-mono text-amber-400 uppercase">
                    BAGIAN A • DASHBOARD EKSEKUTIF & WORKSPACE
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">
                    Pengaturan Target KPI Real-Time & Tampilan Aplikasi
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('organization')}
                  className="text-xs text-amber-400 hover:underline"
                >
                  Profil Akademi →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">
                    Nama Resmi Akademi Bola Basket
                  </label>
                  <input
                    type="text"
                    value={orgForm.name}
                    onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Kode Institusi</label>
                  <input
                    type="text"
                    value={orgForm.code}
                    onChange={(e) =>
                      setOrgForm({ ...orgForm, code: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-amber-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Badan Hukum / PT Resmi</label>
                  <input
                    type="text"
                    value={orgForm.legalName}
                    onChange={(e) => setOrgForm({ ...orgForm, legalName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Target KPI Kehadiran Latihan (%)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={100}
                    value={
                      appSettings.masterOperationalConfig?.dashboardKpi.targetAttendancePct ?? 85
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          dashboardKpi: {
                            ...prev.masterOperationalConfig!.dashboardKpi,
                            targetAttendancePct: Number(e.target.value) || 85,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Target Akuisisi Atlet Baru / Bulan
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={
                      appSettings.masterOperationalConfig?.dashboardKpi.targetMonthlyNewAthletes ??
                      10
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          dashboardKpi: {
                            ...prev.masterOperationalConfig!.dashboardKpi,
                            targetMonthlyNewAthletes: Number(e.target.value) || 10,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Mata Uang Sistem</label>
                  <input
                    type="text"
                    value={
                      appSettings.masterOperationalConfig?.dashboardKpi.defaultCurrency || 'IDR'
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          dashboardKpi: {
                            ...prev.masterOperationalConfig!.dashboardKpi,
                            defaultCurrency: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Zona Waktu Operasional</label>
                  <input
                    type="text"
                    value={
                      appSettings.masterOperationalConfig?.dashboardKpi.timezone ||
                      'Asia/Jakarta (WIB)'
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          dashboardKpi: {
                            ...prev.masterOperationalConfig!.dashboardKpi,
                            timezone: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Tampilkan Grafik Recharts KPI Real-Time di Dashboard Utama
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.masterOperationalConfig?.dashboardKpi.showRealtimeKpiCharts ??
                      true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          dashboardKpi: {
                            ...prev.masterOperationalConfig!.dashboardKpi,
                            showRealtimeKpiCharts: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Arahkan Pengguna Otomatis ke Modul Kerja Utama Saat Login / Ganti Role
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.registrationAndWorkspace?.enforceRoleWorkspaceRouting ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          enforceRoleWorkspaceRouting: e.target.checked,
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Saring Menu Sidebar Sesuai Fungsi Kerja Role (Menu Pengaturan Tetap Aktif)
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.registrationAndWorkspace?.filterSidebarByJobFunction ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          filterSidebarByJobFunction: e.target.checked,
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>

            {/* PANEL B: PENDAFTARAN ONLINE/OFFLINE & PAS FOTO ATLET */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-mono text-emerald-400 uppercase">
                    BAGIAN B • PENDAFTARAN ATLET & PAS FOTO
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">
                    Aturan Pendaftaran Online, Offline & Standar Pas Foto
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('user_work_functions')}
                  className="text-xs text-amber-400 hover:underline"
                >
                  Detail Pendaftaran →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Ukuran Standar Pas Foto</label>
                  <select
                    value={appSettings.registrationAndWorkspace?.defaultPhotoSizeSpec || '3x4'}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          defaultPhotoSizeSpec: e.target.value as '3x4' | '4x6',
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  >
                    <option value="3x4">3x4 Standar Kartu ID & Lisensi</option>
                    <option value="4x6">4x6 Standar Berkas Turnamen</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Warna Latar Pas Foto Default</label>
                  <select
                    value={appSettings.registrationAndWorkspace?.defaultPhotoBgColor || 'RED'}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          defaultPhotoBgColor: e.target.value as 'RED' | 'BLUE' | 'WHITE',
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  >
                    <option value="RED">MERAH (#DC2626)</option>
                    <option value="BLUE">BIRU (#1D4ED8)</option>
                    <option value="WHITE">PUTIH (#F8FAFC)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Prefix Registrasi Online</label>
                  <input
                    type="text"
                    value={
                      appSettings.registrationAndWorkspace?.onlineRegistrationPrefix || 'REG-ONL'
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          onlineRegistrationPrefix: e.target.value.toUpperCase(),
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Prefix Registrasi Offline</label>
                  <input
                    type="text"
                    value={
                      appSettings.registrationAndWorkspace?.offlineRegistrationPrefix || 'REG-OFF'
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          offlineRegistrationPrefix: e.target.value.toUpperCase(),
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Aktifkan Kanal Pendaftaran Online Mandiri (Parent / Atlet)
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.registrationAndWorkspace?.onlineRegistrationEnabled ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          onlineRegistrationEnabled: e.target.checked,
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Aktifkan Kanal Pendaftaran Offline / Walk-In Meja Sekretariat
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.registrationAndWorkspace?.offlineRegistrationEnabled ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          offlineRegistrationEnabled: e.target.checked,
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Wajibkan Unggah / Kamera Pas Foto Saat Pendaftaran Atlet Baru
                  </span>
                  <input
                    type="checkbox"
                    checked={appSettings.registrationAndWorkspace?.requireAthletePhoto ?? true}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          requireAthletePhoto: e.target.checked,
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>

            {/* PANEL C: PRESENSI DIGITAL, KARTU QR & OFFLINE-FIRST LOCALSTORAGE */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <div className="text-[11px] font-mono text-sky-400 uppercase">
                  BAGIAN C • PRESENSI DIGITAL, KARTU QR & OFFLINE-FIRST
                </div>
                <h4 className="text-sm font-bold text-slate-100">
                  Pengaturan Presensi Lapangan, Kartu QR & Sinkronisasi LocalStorage
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Metode Input Default</label>
                  <select
                    value={
                      appSettings.masterOperationalConfig?.attendanceAndQr
                        .defaultAttendanceSource || 'QR'
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          attendanceAndQr: {
                            ...prev.masterOperationalConfig!.attendanceAndQr,
                            defaultAttendanceSource: e.target.value as 'QR' | 'COACH' | 'ADMIN',
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  >
                    <option value="QR">SCAN KARTU QR</option>
                    <option value="COACH">INPUT COACH</option>
                    <option value="ADMIN">INPUT ADMIN</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Toleransi Terlambat (Menit)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={
                      appSettings.masterOperationalConfig?.attendanceAndQr.lateToleranceMinutes ??
                      15
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          attendanceAndQr: {
                            ...prev.masterOperationalConfig!.attendanceAndQr,
                            lateToleranceMinutes: Number(e.target.value) || 15,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Prefix Token QR Pass</label>
                  <input
                    type="text"
                    value={
                      appSettings.masterOperationalConfig?.attendanceAndQr.qrTokenPrefix ||
                      'ZAMOA-CBTC'
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          attendanceAndQr: {
                            ...prev.masterOperationalConfig!.attendanceAndQr,
                            qrTokenPrefix: e.target.value.toUpperCase(),
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Aktifkan Penyimpanan Presensi Offline-First ke LocalStorage Saat Sinyal Terputus
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.masterOperationalConfig?.attendanceAndQr
                        .enableOfflineFirstLocalStorage ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          attendanceAndQr: {
                            ...prev.masterOperationalConfig!.attendanceAndQr,
                            enableOfflineFirstLocalStorage: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Sinkronisasi Otomatis Antrean LocalStorage ke Server Saat Kembali Online
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.masterOperationalConfig?.attendanceAndQr
                        .autoSyncOfflineOnReconnect ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          attendanceAndQr: {
                            ...prev.masterOperationalConfig!.attendanceAndQr,
                            autoSyncOfflineOnReconnect: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Wajibkan Digital Signature Hash Pelatih untuk Validasi Fee Sesi Payroll
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.masterOperationalConfig?.attendanceAndQr
                        .requireCoachDigitalSignature ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          attendanceAndQr: {
                            ...prev.masterOperationalConfig!.attendanceAndQr,
                            requireCoachDigitalSignature: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>

            {/* PANEL D: LATIHAN, EVALUASI RAPOR, KOMPETISI & MEDIS RETURN-TO-PLAY */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-mono text-amber-400 uppercase">
                    BAGIAN D • LATIHAN, EVALUASI, KOMPETISI & MEDIS
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">
                    Parameter Kurikulum, Rapor Evaluasi & Protokol Return-to-Play
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('curriculum')}
                  className="text-xs text-amber-400 hover:underline"
                >
                  Atur KU & Kriteria →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Musim Kompetisi Aktif</label>
                  <input
                    type="text"
                    value={
                      appSettings.masterOperationalConfig?.trainingAndEvaluation.activeSeason ||
                      '2026/2027'
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          trainingAndEvaluation: {
                            ...prev.masterOperationalConfig!.trainingAndEvaluation,
                            activeSeason: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Durasi Sesi Default (Menit)</label>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    value={
                      appSettings.masterOperationalConfig?.trainingAndEvaluation
                        .defaultSessionDurationMinutes ?? 120
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          trainingAndEvaluation: {
                            ...prev.masterOperationalConfig!.trainingAndEvaluation,
                            defaultSessionDurationMinutes: Number(e.target.value) || 120,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Min. Hadir Evaluasi (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={
                      appSettings.masterOperationalConfig?.trainingAndEvaluation
                        .minAttendanceForEvalPct ?? 75
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          trainingAndEvaluation: {
                            ...prev.masterOperationalConfig!.trainingAndEvaluation,
                            minAttendanceForEvalPct: Number(e.target.value) || 75,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">
                    Rumah Sakit Rujukan / Kontak Darurat Medis
                  </label>
                  <input
                    type="text"
                    value={
                      appSettings.masterOperationalConfig?.competitionAndMedical
                        .emergencyMedicalContact || '021-555-9911 (RS Mitra Olahraga Jakarta)'
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          competitionAndMedical: {
                            ...prev.masterOperationalConfig!.competitionAndMedical,
                            emergencyMedicalContact: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Dokter Kepala / Fisioterapis</label>
                  <input
                    type="text"
                    value={
                      appSettings.masterOperationalConfig?.competitionAndMedical
                        .chiefMedicalOfficerName || 'dr. Rina Kartika, Sp.KO'
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          competitionAndMedical: {
                            ...prev.masterOperationalConfig!.competitionAndMedical,
                            chiefMedicalOfficerName: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Wajibkan Status Medis CLEARED (Return-to-Play) Sebelum Masuk Roster Turnamen
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.masterOperationalConfig?.competitionAndMedical
                        .requireMedicalClearedForRoster ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          competitionAndMedical: {
                            ...prev.masterOperationalConfig!.competitionAndMedical,
                            requireMedicalClearedForRoster: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Aktifkan Pencatatan Statistik Box Score Lengkap (PTS, REB, AST, STL, BLK)
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.masterOperationalConfig?.competitionAndMedical
                        .enableFullBoxScoreTracking ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          competitionAndMedical: {
                            ...prev.masterOperationalConfig!.competitionAndMedical,
                            enableFullBoxScoreTracking: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>

            {/* PANEL E: HR PELATIH, PAYROLL SESI & STOK INVENTARIS */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <div className="text-[11px] font-mono text-emerald-400 uppercase">
                  BAGIAN E • HR PELATIH, PAYROLL & INVENTARIS
                </div>
                <h4 className="text-sm font-bold text-slate-100">
                  Standar Tarif Fee Sesi Pelatih, Cut-Off Payroll & Ambang Stok
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Fee Default Head Coach / Sesi (IDR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={25000}
                    value={
                      appSettings.masterOperationalConfig?.hrPayrollAndInventory
                        .defaultHeadCoachSessionFee ?? 350000
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          hrPayrollAndInventory: {
                            ...prev.masterOperationalConfig!.hrPayrollAndInventory,
                            defaultHeadCoachSessionFee: Number(e.target.value) || 0,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Fee Default Assistant Coach / Sesi (IDR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={25000}
                    value={
                      appSettings.masterOperationalConfig?.hrPayrollAndInventory
                        .defaultAssistantCoachSessionFee ?? 200000
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          hrPayrollAndInventory: {
                            ...prev.masterOperationalConfig!.hrPayrollAndInventory,
                            defaultAssistantCoachSessionFee: Number(e.target.value) || 0,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Tanggal Cut-Off Payroll Bulanan (1-28)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={
                      appSettings.masterOperationalConfig?.hrPayrollAndInventory.payrollCutoffDay ??
                      25
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          hrPayrollAndInventory: {
                            ...prev.masterOperationalConfig!.hrPayrollAndInventory,
                            payrollCutoffDay: Number(e.target.value) || 25,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Batas Minimum Peringatan Stok Inventaris
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={
                      appSettings.masterOperationalConfig?.hrPayrollAndInventory
                        .defaultInventoryMinStock ?? 5
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          hrPayrollAndInventory: {
                            ...prev.masterOperationalConfig!.hrPayrollAndInventory,
                            defaultInventoryMinStock: Number(e.target.value) || 5,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Otomatis Posting Jurnal Akuntansi Saat Slip Gaji / Payroll Dibayarkan
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.masterOperationalConfig?.hrPayrollAndInventory
                        .autoPostPayrollJournal ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          hrPayrollAndInventory: {
                            ...prev.masterOperationalConfig!.hrPayrollAndInventory,
                            autoPostPayrollJournal: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Tampilkan Peringatan Otomatis di Dashboard Jika Stok Inventaris Menipis
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.masterOperationalConfig?.hrPayrollAndInventory
                        .enableLowStockAlert ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          hrPayrollAndInventory: {
                            ...prev.masterOperationalConfig!.hrPayrollAndInventory,
                            enableLowStockAlert: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>

            {/* PANEL F: KEUANGAN, METODE PEMBAYARAN (QRIS/EWALLET/BANK), COA & NOTIFIKASI WA/EMAIL */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-mono text-amber-400 uppercase">
                    BAGIAN F • PEMBAYARAN, AKUNTANSI & NOTIFIKASI WA/EMAIL
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">
                    Kontrol Cepat QRIS, E-Wallet, Bank, Jurnal & Gateway WA/Email
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('payment_channels')}
                    className="text-xs text-amber-400 hover:underline"
                  >
                    Rekening & QRIS →
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('notifications_system')}
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    WA & Email →
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Nama Merchant QRIS Nasional
                  </label>
                  <input
                    type="text"
                    value={appSettings.paymentMethods.qris.merchantName}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        paymentMethods: {
                          ...prev.paymentMethods,
                          qris: { ...prev.paymentMethods.qris, merchantName: e.target.value },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">NMID QRIS Resmi</label>
                  <input
                    type="text"
                    value={appSettings.paymentMethods.qris.nmid}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        paymentMethods: {
                          ...prev.paymentMethods,
                          qris: { ...prev.paymentMethods.qris, nmid: e.target.value },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Nomor Pengirim WhatsApp Gateway
                  </label>
                  <input
                    type="text"
                    value={appSettings.notificationChannels.whatsapp.senderNumber}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        notificationChannels: {
                          ...prev.notificationChannels,
                          whatsapp: {
                            ...prev.notificationChannels.whatsapp,
                            senderNumber: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Email Pengirim Tagihan & Kwitansi
                  </label>
                  <input
                    type="email"
                    value={appSettings.notificationChannels.email.senderEmail}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        notificationChannels: {
                          ...prev.notificationChannels,
                          email: {
                            ...prev.notificationChannels.email,
                            senderEmail: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Aktifkan Metode Pembayaran QRIS, E-Wallet (GoPay/OVO/DANA/ShopeePay) & Bank
                  </span>
                  <input
                    type="checkbox"
                    checked={appSettings.paymentMethods.qris.enabled}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        paymentMethods: {
                          ...prev.paymentMethods,
                          qris: { ...prev.paymentMethods.qris, enabled: e.target.checked },
                          ewallet: { ...prev.paymentMethods.ewallet, enabled: e.target.checked },
                          bankTransfer: {
                            ...prev.paymentMethods.bankTransfer,
                            enabled: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Aktifkan Pengiriman Notifikasi Tagihan & Kwitansi via WhatsApp & Email
                  </span>
                  <input
                    type="checkbox"
                    checked={appSettings.notificationChannels.whatsapp.enabled}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        notificationChannels: {
                          ...prev.notificationChannels,
                          whatsapp: {
                            ...prev.notificationChannels.whatsapp,
                            enabled: e.target.checked,
                          },
                          email: {
                            ...prev.notificationChannels.email,
                            enabled: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-slate-300">
                    Otomatis Posting Jurnal Umum Double-Entry Saat Pembayaran Diterima
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      appSettings.masterOperationalConfig?.financeAndAccounting
                        .autoPostDoubleEntryOnPayment ?? true
                    }
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        masterOperationalConfig: {
                          ...prev.masterOperationalConfig!,
                          financeAndAccounting: {
                            ...prev.masterOperationalConfig!.financeAndAccounting,
                            autoPostDoubleEntryOnPayment: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* PANEL G: PENGATURAN LANGSUNG DATA MASTER (CABANG, PAKET, KU, KRITERIA & COA) */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-mono text-amber-400 uppercase">
                  BAGIAN G • KONTROL CEPAT SELURUH DATA MASTER AKADEMI
                </div>
                <h4 className="text-sm font-bold text-slate-100">
                  Atur Langsung Cabang, Paket Membership, Kelompok Umur, Bobot Evaluasi & Akun COA
                </h4>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBranchForm({
                      id: '',
                      code: '',
                      name: '',
                      city: 'Jakarta',
                      address: '',
                      phone: '',
                      courtsCount: '2',
                      isActive: true,
                    });
                    setModalMode('new_branch');
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Cabang</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlanForm({
                      id: '',
                      code: `PLAN-${Date.now().toString().slice(-4)}`,
                      name: '',
                      billingCycle: 'MONTHLY',
                      feeAmount: '850000',
                      registrationFee: '350000',
                      sessionsPerWeek: '3',
                      isActive: true,
                    });
                    setModalMode('new_plan');
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Paket Iuran</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAgeGroupForm({
                      id: '',
                      code: '',
                      name: '',
                      minAge: '8',
                      maxAge: '10',
                      description: '',
                    });
                    setModalMode('new_age_group');
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Kelompok Umur</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCriteriaForm({
                      id: '',
                      category: 'TECHNICAL',
                      code: '',
                      name: '',
                      minScore: '1',
                      maxScore: '10',
                      weight: '1.00',
                      isActive: true,
                    });
                    setModalMode('new_criteria');
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Kriteria Rapor</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountForm({
                      id: '',
                      code: '',
                      name: '',
                      accountType: 'EXPENSE',
                      normalBalance: 'DEBIT',
                      isActive: true,
                    });
                    setModalMode('new_account');
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Akun COA</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
              {/* Branches Quick List */}
              <div className="p-3.5 rounded border border-slate-800 bg-slate-950/60 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-mono font-bold text-amber-400">
                    CABANG & LAPANGAN ({state.branches.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('branches')}
                    className="text-[11px] text-slate-400 hover:text-amber-400"
                  >
                    Tabel Penuh →
                  </button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {state.branches.map((b) => (
                    <div
                      key={b.id}
                      className="p-2 rounded bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-semibold text-slate-100">
                          {b.code} — {b.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {b.city} • {b.courtsCount} Lapangan
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBranchForm({
                            id: b.id,
                            code: b.code,
                            name: b.name,
                            city: b.city,
                            address: b.address,
                            phone: b.phone || '',
                            courtsCount: String(b.courtsCount),
                            isActive: b.isActive,
                          });
                          setModalMode('edit_branch');
                        }}
                        className="px-2 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 rounded shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Membership Plans Quick List */}
              <div className="p-3.5 rounded border border-slate-800 bg-slate-950/60 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-mono font-bold text-emerald-400">
                    PAKET MEMBERSHIP ({state.membershipPlans.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('membership_plans')}
                    className="text-[11px] text-slate-400 hover:text-amber-400"
                  >
                    Tabel Penuh →
                  </button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {state.membershipPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="p-2 rounded bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-semibold text-slate-100">{plan.name}</div>
                        <div className="text-[11px] font-mono text-emerald-400">
                          {formatIDR(plan.feeAmount)} ({plan.sessionsPerWeek}x/mgg)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPlanForm({
                            id: plan.id,
                            code: plan.code,
                            name: plan.name,
                            billingCycle: plan.billingCycle as 'MONTHLY' | 'QUARTERLY' | 'ANNUAL',
                            feeAmount: String(Number(plan.feeAmount)),
                            registrationFee: String(Number(plan.registrationFee)),
                            sessionsPerWeek: String(plan.sessionsPerWeek),
                            isActive: plan.isActive,
                          });
                          setModalMode('edit_plan');
                        }}
                        className="px-2 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 rounded shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Age Groups & Criteria Quick List */}
              <div className="p-3.5 rounded border border-slate-800 bg-slate-950/60 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-mono font-bold text-sky-400">
                    KELOMPOK UMUR ({state.ageGroups.length}) & COA ({state.accounting.accounts.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('curriculum')}
                    className="text-[11px] text-slate-400 hover:text-amber-400"
                  >
                    Tabel Penuh →
                  </button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {state.ageGroups.map((ag) => (
                    <div
                      key={ag.id}
                      className="p-2 rounded bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-semibold text-slate-100">
                          {ag.code} — {ag.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          Usia {ag.minAge}–{ag.maxAge} Tahun
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAgeGroupForm({
                            id: ag.id,
                            code: ag.code,
                            name: ag.name,
                            minAge: String(ag.minAge),
                            maxAge: String(ag.maxAge),
                            description: ag.description || '',
                          });
                          setModalMode('edit_age_group');
                        }}
                        className="px-2 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 rounded shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Save All Bar */}
          <div className="p-4 rounded-lg border border-amber-500/40 bg-slate-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-300">
              <strong className="text-amber-400">Penyimpanan Database Real-Time:</strong> Seluruh konfigurasi di atas disimpan ke tabel <span className="font-mono text-slate-100">organizations.settings_json</span>, <span className="font-mono text-slate-100">job_role_configs</span>, <span className="font-mono text-slate-100">branches</span>, <span className="font-mono text-slate-100">membership_plans</span>, dan <span className="font-mono text-slate-100">accounts</span> di PostgreSQL.
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                handleSavePaymentAndNotifSettings('Seluruh Parameter Master Aplikasi')
              }
              className="px-5 py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 whitespace-nowrap shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>
                {submitting ? 'Menyimpan...' : 'Simpan Seluruh Pengaturan Aplikasi Sekarang'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* TAB: USER WORK FUNCTIONS, RBAC WORKSPACE & PASSPORT PHOTO REGISTRATION SETTINGS */}
      {activeTab === 'user_work_functions' && (
        <div className="space-y-6">
          {/* SECTION A: ONLINE/OFFLINE REGISTRATION & PAS FOTO SETTINGS */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-mono text-amber-400 uppercase">
                  KONFIGURASI PENDAFTARAN ONLINE / OFFLINE & PAS FOTO ATLET
                </div>
                <h3 className="text-base font-bold text-slate-100 mt-0.5">
                  Standar Pendaftaran Pemain (Online & Offline) + Kebijakan Pas Foto Resmi
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mengatur jalur pendaftaran Online Mandiri & Offline Sekretariat, kewajiban unggah/kamera Pas Foto atlet, ukuran pas foto standar, serta otomatisasi halaman kerja pengguna saat login.
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  handleSavePaymentAndNotifSettings(
                    'Pendaftaran Online/Offline, Pas Foto & Routing Fungsi Kerja'
                  )
                }
                className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Pengaturan Pendaftaran & Pas Foto</span>
              </button>
            </div>

            {appSettings.registrationAndWorkspace && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <label className="p-3.5 rounded border border-slate-800 bg-slate-950/60 flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.registrationAndWorkspace.onlineRegistrationEnabled}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          onlineRegistrationEnabled: e.target.checked,
                        },
                      }))
                    }
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <div className="font-semibold text-slate-100">
                      Aktifkan Pendaftaran Online Mandiri (ONLINE)
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      Calon atlet & orang tua dapat mendaftar mandiri dari web/HP dan mengunggah/selfie Pas Foto.
                    </p>
                  </div>
                </label>

                <label className="p-3.5 rounded border border-slate-800 bg-slate-950/60 flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.registrationAndWorkspace.offlineRegistrationEnabled}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          offlineRegistrationEnabled: e.target.checked,
                        },
                      }))
                    }
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <div className="font-semibold text-slate-100">
                      Aktifkan Pendaftaran Offline Walk-In (OFFLINE)
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      Admin/Sekretariat melayani pendaftaran langsung di loket cabang + foto kamera webcam.
                    </p>
                  </div>
                </label>

                <label className="p-3.5 rounded border border-slate-800 bg-slate-950/60 flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.registrationAndWorkspace.requireAthletePhoto}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          requireAthletePhoto: e.target.checked,
                        },
                      }))
                    }
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <div className="font-semibold text-slate-100">
                      Wajibkan Pas Foto Atlet Saat Pendaftaran
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      Setiap pendaftaran Online & Offline wajib menyertakan Pas Foto resmi untuk Kartu QR.
                    </p>
                  </div>
                </label>

                <div>
                  <label className="block text-slate-400 mb-1">Ukuran Default Pas Foto Atlet</label>
                  <select
                    value={appSettings.registrationAndWorkspace.defaultPhotoSizeSpec}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          defaultPhotoSizeSpec: e.target.value as '3x4' | '4x6',
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  >
                    <option value="3x4">3x4 (Standar Kartu ID & Lisensi PERBASI)</option>
                    <option value="4x6">4x6 (Standar Dokumen & Buku Induk)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Warna Latar Default Pas Foto</label>
                  <select
                    value={appSettings.registrationAndWorkspace.defaultPhotoBgColor}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          defaultPhotoBgColor: e.target.value as 'RED' | 'BLUE' | 'WHITE',
                        },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                  >
                    <option value="RED">RED — Latar Merah Resmi</option>
                    <option value="BLUE">BLUE — Latar Biru Resmi</option>
                    <option value="WHITE">WHITE — Latar Putih</option>
                  </select>
                </div>

                <label className="p-3.5 rounded border border-emerald-500/30 bg-emerald-950/15 flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.registrationAndWorkspace.filterSidebarByJobFunction}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        registrationAndWorkspace: {
                          ...prev.registrationAndWorkspace!,
                          filterSidebarByJobFunction: e.target.checked,
                        },
                      }))
                    }
                    className="mt-0.5 accent-emerald-500"
                  />
                  <div>
                    <div className="font-semibold text-emerald-300">
                      Filter Menu & Arahkan Halaman Sesuai Fungsi Kerja
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      Pengguna yang masuk otomatis diarahkan ke modul kerjanya dan hanya melihat menu yang relevan.
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* SECTION B: DATABASE KONFIGURASI KERJA & FUNGSI PER ROLE (job_role_configs) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div>
                <div className="text-xs font-mono text-amber-400 uppercase">
                  TABEL DATABASE: job_role_configs
                </div>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                  Edit Konfigurasi Kerja & Fungsi Role
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tentukan jabatan default, departemen, fungsi kerja, halaman awal saat login, dan modul menu yang diizinkan untuk setiap Role.
                </p>
              </div>

              <form onSubmit={handleSaveJobRoleConfig} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Pilih Role yang Diatur *</label>
                  <select
                    value={editingRoleCode}
                    onChange={(e) => setEditingRoleCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-amber-400 font-mono font-semibold"
                  >
                    {(state.jobRoleConfigs && state.jobRoleConfigs.length > 0
                      ? state.jobRoleConfigs
                      : state.roles.map((r) => ({ roleCode: r.code, roleName: r.name }))
                    ).map((rc) => (
                      <option key={rc.roleCode} value={rc.roleCode}>
                        {rc.roleCode} — {rc.roleName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Nama Jabatan Default *</label>
                    <input
                      type="text"
                      required
                      value={roleConfigDraft.jobTitleDefault}
                      onChange={(e) =>
                        setRoleConfigDraft({ ...roleConfigDraft, jobTitleDefault: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Departemen / Divisi *</label>
                    <input
                      type="text"
                      required
                      value={roleConfigDraft.department}
                      onChange={(e) =>
                        setRoleConfigDraft({
                          ...roleConfigDraft,
                          department: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Halaman Tujuan Otomatis Saat Masuk Aplikasi *
                  </label>
                  <select
                    value={roleConfigDraft.defaultLandingNav}
                    onChange={(e) =>
                      setRoleConfigDraft({ ...roleConfigDraft, defaultLandingNav: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-emerald-300 font-semibold"
                  >
                    {NAV_MODULE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label} ({opt.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Deskripsi Tugas & Fungsi Kerja di Aplikasi *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={roleConfigDraft.workFunctionSummary}
                    onChange={(e) =>
                      setRoleConfigDraft({
                        ...roleConfigDraft,
                        workFunctionSummary: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1.5">
                    Modul Navigasi yang Tampil Sesuai Fungsi Kerja:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {NAV_MODULE_OPTIONS.map((mod) => {
                      const checked = roleConfigDraft.allowedNavModules.includes(mod.id);
                      return (
                        <label
                          key={mod.id}
                          className={`px-2.5 py-1.5 rounded border flex items-center gap-2 cursor-pointer ${
                            checked
                              ? 'bg-amber-500/15 border-amber-500/40 text-slate-100'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...roleConfigDraft.allowedNavModules, mod.id]
                                : roleConfigDraft.allowedNavModules.filter(
                                    (m: string) => m !== mod.id
                                  );
                              if (next.length > 0) {
                                setRoleConfigDraft({
                                  ...roleConfigDraft,
                                  allowedNavModules: next,
                                });
                              }
                            }}
                            className="accent-amber-500"
                          />
                          <span className="truncate">{mod.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Fungsi Role ({editingRoleCode}) ke Database</span>
                </button>
              </form>
            </div>

            {/* Right: Daftar Akun Pengguna & Tambah Pengguna Sesuai Kerja/Fungsinya */}
            <div className="lg:col-span-7 rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div>
                <div className="text-xs font-mono text-emerald-400 uppercase">
                  TABEL DATABASE: users ({state.users.length} AKUN TERDAFTAR)
                </div>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                  Penugasan Pengguna Masuk Aplikasi Sesuai Kerja & Fungsinya
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tambahkan atau perbarui akun personel akademi, pelatih, medis, kasir, akuntan, wali, atau atlet beserta jabatan dan modul kerja utamanya.
                </p>
              </div>

              <form
                onSubmit={handleSaveUserWorkAccount}
                className="p-4 rounded-lg border border-slate-800 bg-slate-950/60 space-y-3 text-xs"
              >
                <div className="font-mono text-amber-400 font-semibold">
                  + Tambah / Perbarui Akun Pengguna & Fungsi Kerja
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Nama Lengkap *</label>
                    <input
                      type="text"
                      required
                      value={newUserWorkForm.fullName}
                      onChange={(e) =>
                        setNewUserWorkForm({ ...newUserWorkForm, fullName: e.target.value })
                      }
                      placeholder="Nama Staf / Pelatih / Wali"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Email Login *</label>
                    <input
                      type="email"
                      required
                      value={newUserWorkForm.email}
                      onChange={(e) =>
                        setNewUserWorkForm({ ...newUserWorkForm, email: e.target.value })
                      }
                      placeholder="nama@zamoacbtc.id"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Role Fungsi *</label>
                    <select
                      value={newUserWorkForm.activeRoleCode}
                      onChange={(e) => {
                        const rCode = e.target.value;
                        const cfg = state.jobRoleConfigs?.find((c) => c.roleCode === rCode);
                        setNewUserWorkForm({
                          ...newUserWorkForm,
                          activeRoleCode: rCode,
                          jobTitle: cfg?.jobTitleDefault || rCode,
                          department: cfg?.department || 'OPERASIONAL',
                          jobFunction: cfg?.workFunctionSummary || '',
                          defaultLandingModule: cfg?.defaultLandingNav || 'dashboard',
                        });
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-amber-400 font-mono"
                    >
                      {(state.jobRoleConfigs && state.jobRoleConfigs.length > 0
                        ? state.jobRoleConfigs
                        : state.roles.map((r) => ({ roleCode: r.code, roleName: r.name }))
                      ).map((rc) => (
                        <option key={rc.roleCode} value={rc.roleCode}>
                          {rc.roleCode} — {rc.roleName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Jabatan / Pekerjaan *</label>
                    <input
                      type="text"
                      required
                      value={newUserWorkForm.jobTitle}
                      onChange={(e) =>
                        setNewUserWorkForm({ ...newUserWorkForm, jobTitle: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Halaman Masuk Utama *</label>
                    <select
                      value={newUserWorkForm.defaultLandingModule}
                      onChange={(e) =>
                        setNewUserWorkForm({
                          ...newUserWorkForm,
                          defaultLandingModule: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-emerald-300"
                    >
                      {NAV_MODULE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Cakupan Cabang</label>
                    <select
                      value={newUserWorkForm.branchId}
                      onChange={(e) =>
                        setNewUserWorkForm({ ...newUserWorkForm, branchId: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100"
                    >
                      <option value="ALL">Semua Cabang (Pusat)</option>
                      {state.branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Simpan Akun Pengguna & Fungsi Kerja ke Database</span>
                  </button>
                </div>
              </form>

              {/* Tabel Ringkas Akun Pengguna & Fungsi Kerjanya */}
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto border border-slate-800 rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950 text-[10px] font-mono uppercase text-slate-400 sticky top-0">
                      <th className="py-2.5 px-3">Pengguna & Email</th>
                      <th className="py-2.5 px-3">Jabatan & Departemen</th>
                      <th className="py-2.5 px-3">Role & Halaman Masuk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {state.users.map((u) => {
                      const cfg = state.jobRoleConfigs?.find(
                        (c) => c.roleCode === u.activeRoleCode
                      );
                      return (
                        <tr key={u.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-100">{u.fullName}</div>
                            <div className="font-mono text-[11px] text-slate-400">{u.email}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-emerald-400">
                              {u.jobTitle || cfg?.jobTitleDefault || u.activeRoleCode}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {u.department || cfg?.department || 'OPERASIONAL'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            <div className="text-amber-400 font-bold">{u.activeRoleCode}</div>
                            <div className="text-[11px] text-slate-300">
                              Masuk → {u.defaultLandingModule || cfg?.defaultLandingNav || 'dashboard'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 0: METODE PEMBAYARAN (QRIS, E-WALLET & TRANSFER BANK) */}
      {activeTab === 'payment_channels' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-mono uppercase text-amber-400">
                KONFIGURASI METODE PEMBAYARAN PARENT & PEMAIN
              </div>
              <div className="text-sm font-bold text-slate-100 mt-0.5">
                Pengaturan QRIS Nasional, E-Wallet (GoPay/OVO/DANA/ShopeePay) & Rekening Transfer Bank
              </div>
              <p className="text-xs text-slate-400">
                Seluruh metode pembayaran yang diaktifkan di bawah ini otomatis muncul pada Portal Pembayaran Mudah untuk Orang Tua (Parent) dan Pemain (Atlet).
              </p>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                handleSavePaymentAndNotifSettings(
                  'Metode Pembayaran (QRIS, E-Wallet & Transfer Bank)'
                )
              }
              className="px-4 py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>
                {submitting ? 'Menyimpan...' : 'Simpan Pengaturan Pembayaran ke Database'}
              </span>
            </button>
          </div>

          {/* 1. PENGATURAN QRIS */}
          <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/40 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    1. Pengaturan QRIS Resmi Akademi (Scan QR Instan Semua Bank & E-Wallet)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Memudahkan Parent & Pemain membayar iuran hanya dengan scan kode QRIS dari HP.
                  </p>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={appSettings.paymentMethods.qris.enabled}
                  onChange={(e) =>
                    setAppSettings({
                      ...appSettings,
                      paymentMethods: {
                        ...appSettings.paymentMethods,
                        qris: {
                          ...appSettings.paymentMethods.qris,
                          enabled: e.target.checked,
                        },
                      },
                    })
                  }
                />
                <span>Aktifkan Pembayaran QRIS</span>
              </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
              <div className="p-4 rounded-lg border border-slate-800 bg-slate-950 text-center space-y-2">
                <div className="text-[11px] font-mono uppercase text-amber-400">
                  PREVIEW KARTU QRIS PARENT & PEMAIN
                </div>
                <QrCodeSvg value={appSettings.paymentMethods.qris.qrisPayload} size={160} />
                <div className="text-xs font-bold text-slate-100">
                  {appSettings.paymentMethods.qris.merchantName}
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  NMID: {appSettings.paymentMethods.qris.nmid}
                </div>
              </div>

              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Nama Merchant QRIS *
                  </label>
                  <input
                    type="text"
                    value={appSettings.paymentMethods.qris.merchantName}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        paymentMethods: {
                          ...appSettings.paymentMethods,
                          qris: {
                            ...appSettings.paymentMethods.qris,
                            merchantName: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Nomor NMID Nasional *
                  </label>
                  <input
                    type="text"
                    value={appSettings.paymentMethods.qris.nmid}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        paymentMethods: {
                          ...appSettings.paymentMethods,
                          qris: {
                            ...appSettings.paymentMethods.qris,
                            nmid: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-amber-400"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">
                    String Kode Payload QRIS Standar EMVCo *
                  </label>
                  <input
                    type="text"
                    value={appSettings.paymentMethods.qris.qrisPayload}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        paymentMethods: {
                          ...appSettings.paymentMethods,
                          qris: {
                            ...appSettings.paymentMethods.qris,
                            qrisPayload: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-300"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">
                    Panduan Pembayaran QRIS untuk Parent & Pemain
                  </label>
                  <textarea
                    rows={2}
                    value={appSettings.paymentMethods.qris.instructions}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        paymentMethods: {
                          ...appSettings.paymentMethods,
                          qris: {
                            ...appSettings.paymentMethods.qris,
                            instructions: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. PENGATURAN E-WALLET (GOPAY, OVO, DANA, SHOPEEPAY, LINKAJA) */}
          <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/40 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    2. Pengaturan Dompet Digital / E-Wallet (GoPay, OVO, DANA, ShopeePay, LinkAja)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Atur nomor tujuan dompet digital resmi akademi untuk pembayaran cepat dari ponsel.
                  </p>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={appSettings.paymentMethods.ewallet.enabled}
                  onChange={(e) =>
                    setAppSettings({
                      ...appSettings,
                      paymentMethods: {
                        ...appSettings.paymentMethods,
                        ewallet: {
                          ...appSettings.paymentMethods.ewallet,
                          enabled: e.target.checked,
                        },
                      },
                    })
                  }
                />
                <span>Aktifkan Metode E-Wallet</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {appSettings.paymentMethods.ewallet.wallets.map((w, idx) => (
                <div
                  key={w.id}
                  className="p-3.5 rounded border border-slate-800 bg-slate-950/60 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      {w.provider}
                    </span>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={w.isActive}
                          onChange={(e) => {
                            const updated = [...appSettings.paymentMethods.ewallet.wallets];
                            updated[idx] = { ...w, isActive: e.target.checked };
                            setAppSettings({
                              ...appSettings,
                              paymentMethods: {
                                ...appSettings.paymentMethods,
                                ewallet: {
                                  ...appSettings.paymentMethods.ewallet,
                                  wallets: updated,
                                },
                              },
                            });
                          }}
                        />
                        <span>Aktif</span>
                      </label>
                      {appSettings.paymentMethods.ewallet.wallets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = appSettings.paymentMethods.ewallet.wallets.filter(
                              (item) => item.id !== w.id
                            );
                            setAppSettings({
                              ...appSettings,
                              paymentMethods: {
                                ...appSettings.paymentMethods,
                                ewallet: {
                                  ...appSettings.paymentMethods.ewallet,
                                  wallets: updated,
                                },
                              },
                            });
                          }}
                          className="text-slate-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400">
                        Nomor HP / Virtual Account
                      </label>
                      <input
                        type="text"
                        value={w.phoneNumber}
                        onChange={(e) => {
                          const updated = [...appSettings.paymentMethods.ewallet.wallets];
                          updated[idx] = { ...w, phoneNumber: e.target.value };
                          setAppSettings({
                            ...appSettings,
                            paymentMethods: {
                              ...appSettings.paymentMethods,
                              ewallet: {
                                ...appSettings.paymentMethods.ewallet,
                                wallets: updated,
                              },
                            },
                          });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-amber-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400">Atas Nama Akun</label>
                      <input
                        type="text"
                        value={w.accountName}
                        onChange={(e) => {
                          const updated = [...appSettings.paymentMethods.ewallet.wallets];
                          updated[idx] = { ...w, accountName: e.target.value };
                          setAppSettings({
                            ...appSettings,
                            paymentMethods: {
                              ...appSettings.paymentMethods,
                              ewallet: {
                                ...appSettings.paymentMethods.ewallet,
                                wallets: updated,
                              },
                            },
                          });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tambah Dompet E-Wallet Baru */}
            <div className="p-3 rounded border border-slate-800/80 bg-slate-950/40 flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Provider E-Wallet</label>
                <input
                  type="text"
                  value={newWalletDraft.provider}
                  onChange={(e) =>
                    setNewWalletDraft({
                      ...newWalletDraft,
                      provider: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="LINKAJA"
                  className="px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-100 w-32"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Nomor E-Wallet</label>
                <input
                  type="text"
                  value={newWalletDraft.phoneNumber}
                  onChange={(e) =>
                    setNewWalletDraft({ ...newWalletDraft, phoneNumber: e.target.value })
                  }
                  placeholder="08119002026"
                  className="px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-100 w-40"
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[11px] text-slate-400 mb-1">Atas Nama</label>
                <input
                  type="text"
                  value={newWalletDraft.accountName}
                  onChange={(e) =>
                    setNewWalletDraft({ ...newWalletDraft, accountName: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!newWalletDraft.provider || !newWalletDraft.phoneNumber) return;
                  setAppSettings({
                    ...appSettings,
                    paymentMethods: {
                      ...appSettings.paymentMethods,
                      ewallet: {
                        ...appSettings.paymentMethods.ewallet,
                        wallets: [
                          ...appSettings.paymentMethods.ewallet.wallets,
                          {
                            id: `ew-${Date.now()}`,
                            provider: newWalletDraft.provider,
                            phoneNumber: newWalletDraft.phoneNumber,
                            accountName: newWalletDraft.accountName,
                            isActive: true,
                          },
                        ],
                      },
                    },
                  });
                  notify(`Dompet digital ${newWalletDraft.provider} ditambahkan ke daftar.`);
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah E-Wallet</span>
              </button>
            </div>
          </div>

          {/* 3. PENGATURAN REKENING TRANSFER BANK */}
          <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/40 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-sky-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    3. Pengaturan Rekening Transfer Bank Resmi (BCA, Mandiri, BNI, BRI, dll.)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Daftar nomor rekening bank perusahaan untuk pembayaran iuran & sponsorship.
                  </p>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={appSettings.paymentMethods.bankTransfer.enabled}
                  onChange={(e) =>
                    setAppSettings({
                      ...appSettings,
                      paymentMethods: {
                        ...appSettings.paymentMethods,
                        bankTransfer: {
                          ...appSettings.paymentMethods.bankTransfer,
                          enabled: e.target.checked,
                        },
                      },
                    })
                  }
                />
                <span>Aktifkan Transfer Bank</span>
              </label>
            </div>

            <div className="space-y-2.5">
              {appSettings.paymentMethods.bankTransfer.accounts.map((acc, idx) => (
                <div
                  key={acc.id}
                  className="p-3.5 rounded border border-slate-800 bg-slate-950/60 grid grid-cols-1 md:grid-cols-5 gap-2.5 items-center"
                >
                  <div>
                    <label className="block text-[11px] text-slate-400">Nama Bank</label>
                    <input
                      type="text"
                      value={acc.bankName}
                      onChange={(e) => {
                        const updated = [...appSettings.paymentMethods.bankTransfer.accounts];
                        updated[idx] = { ...acc, bankName: e.target.value.toUpperCase() };
                        setAppSettings({
                          ...appSettings,
                          paymentMethods: {
                            ...appSettings.paymentMethods,
                            bankTransfer: {
                              ...appSettings.paymentMethods.bankTransfer,
                              accounts: updated,
                            },
                          },
                        });
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-900 border border-slate-800 rounded text-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400">Nomor Rekening</label>
                    <input
                      type="text"
                      value={acc.accountNumber}
                      onChange={(e) => {
                        const updated = [...appSettings.paymentMethods.bankTransfer.accounts];
                        updated[idx] = { ...acc, accountNumber: e.target.value };
                        setAppSettings({
                          ...appSettings,
                          paymentMethods: {
                            ...appSettings.paymentMethods,
                            bankTransfer: {
                              ...appSettings.paymentMethods.bankTransfer,
                              accounts: updated,
                            },
                          },
                        });
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-100"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-slate-400">
                      Atas Nama Rekening & Kantor Cabang
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={acc.accountHolder}
                        onChange={(e) => {
                          const updated = [...appSettings.paymentMethods.bankTransfer.accounts];
                          updated[idx] = { ...acc, accountHolder: e.target.value };
                          setAppSettings({
                            ...appSettings,
                            paymentMethods: {
                              ...appSettings.paymentMethods,
                              bankTransfer: {
                                ...appSettings.paymentMethods.bankTransfer,
                                accounts: updated,
                              },
                            },
                          });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200"
                      />
                      <input
                        type="text"
                        value={acc.branchName}
                        onChange={(e) => {
                          const updated = [...appSettings.paymentMethods.bankTransfer.accounts];
                          updated[idx] = { ...acc, branchName: e.target.value };
                          setAppSettings({
                            ...appSettings,
                            paymentMethods: {
                              ...appSettings.paymentMethods,
                              bankTransfer: {
                                ...appSettings.paymentMethods.bankTransfer,
                                accounts: updated,
                              },
                            },
                          });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-400"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-3">
                    <label className="inline-flex items-center gap-1 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acc.isActive}
                        onChange={(e) => {
                          const updated = [...appSettings.paymentMethods.bankTransfer.accounts];
                          updated[idx] = { ...acc, isActive: e.target.checked };
                          setAppSettings({
                            ...appSettings,
                            paymentMethods: {
                              ...appSettings.paymentMethods,
                              bankTransfer: {
                                ...appSettings.paymentMethods.bankTransfer,
                                accounts: updated,
                              },
                            },
                          });
                        }}
                      />
                      <span>Aktif</span>
                    </label>
                    {appSettings.paymentMethods.bankTransfer.accounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = appSettings.paymentMethods.bankTransfer.accounts.filter(
                            (item) => item.id !== acc.id
                          );
                          setAppSettings({
                            ...appSettings,
                            paymentMethods: {
                              ...appSettings.paymentMethods,
                              bankTransfer: {
                                ...appSettings.paymentMethods.bankTransfer,
                                accounts: updated,
                              },
                            },
                          });
                        }}
                        className="text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Tambah Rekening Bank Baru */}
            <div className="p-3 rounded border border-slate-800/80 bg-slate-950/40 flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Bank</label>
                <input
                  type="text"
                  value={newBankDraft.bankName}
                  onChange={(e) =>
                    setNewBankDraft({ ...newBankDraft, bankName: e.target.value.toUpperCase() })
                  }
                  placeholder="BRI / BSI"
                  className="px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-100 w-24"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">No. Rekening</label>
                <input
                  type="text"
                  value={newBankDraft.accountNumber}
                  onChange={(e) =>
                    setNewBankDraft({ ...newBankDraft, accountNumber: e.target.value })
                  }
                  placeholder="0123456789"
                  className="px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-100 w-36"
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[11px] text-slate-400 mb-1">Atas Nama</label>
                <input
                  type="text"
                  value={newBankDraft.accountHolder}
                  onChange={(e) =>
                    setNewBankDraft({ ...newBankDraft, accountHolder: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Cabang</label>
                <input
                  type="text"
                  value={newBankDraft.branchName}
                  onChange={(e) =>
                    setNewBankDraft({ ...newBankDraft, branchName: e.target.value })
                  }
                  className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-100 w-36"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!newBankDraft.bankName || !newBankDraft.accountNumber) return;
                  setAppSettings({
                    ...appSettings,
                    paymentMethods: {
                      ...appSettings.paymentMethods,
                      bankTransfer: {
                        ...appSettings.paymentMethods.bankTransfer,
                        accounts: [
                          ...appSettings.paymentMethods.bankTransfer.accounts,
                          {
                            id: `bank-${Date.now()}`,
                            bankName: newBankDraft.bankName,
                            accountNumber: newBankDraft.accountNumber,
                            accountHolder: newBankDraft.accountHolder,
                            branchName: newBankDraft.branchName,
                            isActive: true,
                          },
                        ],
                      },
                    },
                  });
                  setNewBankDraft({ ...newBankDraft, accountNumber: '' });
                  notify(`Rekening Bank ${newBankDraft.bankName} ditambahkan ke daftar.`);
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Rekening</span>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  handleSavePaymentAndNotifSettings(
                    'Metode Pembayaran (QRIS, E-Wallet & Transfer Bank)'
                  )
                }
                className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Semua Metode Pembayaran</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: ORGANIZATION PROFILE & OPERATIONAL POLICY */}
      {activeTab === 'organization' && (
        <form onSubmit={handleSaveOrganization} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Card: Identity & Fiscal Year */}
            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/40 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <div className="text-xs font-mono text-amber-400 uppercase">
                  IDENTITAS ORGANISASI & AKUNTANSI
                </div>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                  Profil Resmi Akademi & Periode Fiskal
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Kode Organisasi *</label>
                  <input
                    type="text"
                    required
                    disabled={!canUpdateAdmin}
                    value={orgForm.code}
                    onChange={(e) => setOrgForm({ ...orgForm, code: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Musim Kompetisi / Akademik Aktif
                  </label>
                  <input
                    type="text"
                    value={orgForm.activeSeason}
                    onChange={(e) => setOrgForm({ ...orgForm, activeSeason: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">
                    Nama Akademi Bola Basket *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!canUpdateAdmin}
                    value={orgForm.name}
                    onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">
                    Nama Badan Hukum / PT Resmi (Tercetak di Invoice & Kwitansi) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!canUpdateAdmin}
                    value={orgForm.legalName}
                    onChange={(e) => setOrgForm({ ...orgForm, legalName: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">
                    Bulan Awal Tahun Buku Akuntansi (Fiscal Year Start Month) *
                  </label>
                  <select
                    value={orgForm.fiscalYearStartMonth}
                    disabled={!canUpdateAdmin}
                    onChange={(e) =>
                      setOrgForm({ ...orgForm, fiscalYearStartMonth: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  >
                    {FISCAL_MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Right Card: Default Academy Operational Thresholds */}
            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/40 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <div className="text-xs font-mono text-amber-400 uppercase">
                  PARAMETER OPERASIONAL STANDAR
                </div>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                  Aturan Tagihan, Presensi, Evaluasi & Logistik
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Jatuh Tempo Invoice Default (Hari)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={orgForm.defaultInvoiceDueDays}
                    onChange={(e) =>
                      setOrgForm({ ...orgForm, defaultInvoiceDueDays: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                  <span className="text-[11px] text-slate-500">
                    Digunakan saat menerbitkan tagihan membership otomatis.
                  </span>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Durasi Sesi Latihan Standar (Menit)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={240}
                    value={orgForm.defaultSessionDurationMinutes}
                    onChange={(e) =>
                      setOrgForm({ ...orgForm, defaultSessionDurationMinutes: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                  <span className="text-[11px] text-slate-500">
                    Acuan perhitungan jam latihan dan jadwal lapangan.
                  </span>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Target Kehadiran Minimum Atlet (%)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={100}
                    value={orgForm.minAttendanceEvalPct}
                    onChange={(e) =>
                      setOrgForm({ ...orgForm, minAttendanceEvalPct: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                  <span className="text-[11px] text-slate-500">
                    Syarat kelayakan seleksi roster turnamen resmi.
                  </span>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Ambang Peringatan Stok Minimum (Unit)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={orgForm.defaultInventoryMinStock}
                    onChange={(e) =>
                      setOrgForm({ ...orgForm, defaultInventoryMinStock: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                  <span className="text-[11px] text-slate-500">
                    Memicu peringatan logistik pada Pusat Komando.
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div className="text-xs text-slate-400">
                  Perubahan otomatis dicatat pada <span className="font-mono text-amber-400">audit_logs</span>.
                </div>
                {canUpdateAdmin && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan Pengaturan Organisasi</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: BRANCHES & COURT CAPACITY */}
      {activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Pengaturan Cabang Operasional & Kapasitas Lapangan ({state.branches.length})
              </h3>
              <p className="text-xs text-slate-400">
                Atur alamat arena, nomor telepon cabang, jumlah lapangan (court), serta status operasional cabang.
              </p>
            </div>
            {canUpdateAdmin && (
              <button
                type="button"
                onClick={() => {
                  setBranchForm({
                    id: '',
                    code: '',
                    name: '',
                    city: 'Jakarta',
                    address: '',
                    phone: '',
                    courtsCount: '2',
                    isActive: true,
                  });
                  setModalMode('new_branch');
                }}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Cabang Baru</span>
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Kode & Nama Cabang</th>
                    <th className="py-3 px-4">Kota & Alamat Arena</th>
                    <th className="py-3 px-4">Telepon</th>
                    <th className="py-3 px-4 text-right">Kapasitas Lapangan</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi Pengaturan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {state.branches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-amber-400">{b.code}</div>
                        <div className="font-semibold text-slate-100 text-sm">{b.name}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200 font-medium">{b.city}</div>
                        <div className="text-slate-400">{b.address}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">{b.phone || '-'}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-100">
                        {b.courtsCount} Court
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={b.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {canUpdateAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setBranchForm({
                                id: b.id,
                                code: b.code,
                                name: b.name,
                                city: b.city,
                                address: b.address,
                                phone: b.phone || '',
                                courtsCount: String(b.courtsCount),
                                isActive: b.isActive,
                              });
                              setModalMode('edit_branch');
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Atur Cabang</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MEMBERSHIP PLANS & BILLING RATES */}
      {activeTab === 'membership_plans' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Pengaturan Paket Membership, Biaya Registrasi & Siklus Iuran ({state.membershipPlans.length})
              </h3>
              <p className="text-xs text-slate-400">
                Tarif pada tabel ini digunakan secara otomatis saat pendaftaran atlet baru untuk menerbitkan Invoice dan Jurnal Akrual Double-Entry.
              </p>
            </div>
            {canManageFinance && (
              <button
                type="button"
                onClick={() => {
                  setPlanForm({
                    id: '',
                    code: `PLAN-${Date.now().toString().slice(-4)}`,
                    name: '',
                    billingCycle: 'MONTHLY',
                    feeAmount: '850000',
                    registrationFee: '350000',
                    sessionsPerWeek: '3',
                    isActive: true,
                  });
                  setModalMode('new_plan');
                }}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Paket Membership</span>
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Kode & Nama Paket</th>
                    <th className="py-3 px-4">Siklus Tagihan</th>
                    <th className="py-3 px-4 text-right">Sesi / Minggu</th>
                    <th className="py-3 px-4 text-right">Biaya Iuran (Akun 4102)</th>
                    <th className="py-3 px-4 text-right">Biaya Registrasi (Akun 4101)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {state.membershipPlans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-amber-400">{plan.code}</div>
                        <div className="font-semibold text-slate-100 text-sm">{plan.name}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">{plan.billingCycle}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-200">
                        {plan.sessionsPerWeek}x / Minggu
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-400">
                        {formatIDR(plan.feeAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-200">
                        {formatIDR(plan.registrationFee)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={plan.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {canManageFinance && (
                          <button
                            type="button"
                            onClick={() => {
                              setPlanForm({
                                id: plan.id,
                                code: plan.code,
                                name: plan.name,
                                billingCycle: plan.billingCycle as
                                  | 'MONTHLY'
                                  | 'QUARTERLY'
                                  | 'ANNUAL',
                                feeAmount: String(Number(plan.feeAmount)),
                                registrationFee: String(Number(plan.registrationFee)),
                                sessionsPerWeek: String(plan.sessionsPerWeek),
                                isActive: plan.isActive,
                              });
                              setModalMode('edit_plan');
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Ubah Tarif</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AGE GROUPS & ASSESSMENT CRITERIA */}
      {activeTab === 'curriculum' && (
        <div className="space-y-6">
          {/* Age Groups */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  1. Pengaturan Kelompok Umur / Age Groups ({state.ageGroups.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Menentukan klasifikasi usia atlet (KU-10 s/d KU-18) dan fokus pembinaan kurikulum.
                </p>
              </div>
              {canManageCriteria && (
                <button
                  type="button"
                  onClick={() => {
                    setAgeGroupForm({
                      id: '',
                      code: '',
                      name: '',
                      minAge: '8',
                      maxAge: '10',
                      description: '',
                    });
                    setModalMode('new_age_group');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Kelompok Umur</span>
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Kode KU</th>
                    <th className="py-3 px-4">Nama Kelompok Umur</th>
                    <th className="py-3 px-4">Rentang Usia</th>
                    <th className="py-3 px-4">Fokus Kurikulum</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {state.ageGroups.map((ag) => (
                    <tr key={ag.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono font-bold text-amber-400">{ag.code}</td>
                      <td className="py-3 px-4 font-semibold text-slate-100">{ag.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {ag.minAge} – {ag.maxAge} Tahun
                      </td>
                      <td className="py-3 px-4 text-slate-400">{ag.description || '-'}</td>
                      <td className="py-3 px-4 text-right">
                        {canManageCriteria && (
                          <button
                            type="button"
                            onClick={() => {
                              setAgeGroupForm({
                                id: ag.id,
                                code: ag.code,
                                name: ag.name,
                                minAge: String(ag.minAge),
                                maxAge: String(ag.maxAge),
                                description: ag.description || '',
                              });
                              setModalMode('edit_age_group');
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit KU</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Assessment Criteria & Weights */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  2. Pengaturan Kriteria & Bobot Penilaian Rapor Atlet ({state.assessmentCriteria.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Konfigurasi bobot penilaian untuk kalkulasi skor rata-rata Teknis, Fisik, Mental, dan Overall Score.
                </p>
              </div>
              {canManageCriteria && (
                <button
                  type="button"
                  onClick={() => {
                    setCriteriaForm({
                      id: '',
                      category: 'TECHNICAL',
                      code: '',
                      name: '',
                      minScore: '1',
                      maxScore: '10',
                      weight: '1.00',
                      isActive: true,
                    });
                    setModalMode('new_criteria');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Kriteria Rapor</span>
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Kategori</th>
                    <th className="py-3 px-4">Kode & Nama Indikator</th>
                    <th className="py-3 px-4 text-right">Rentang Skor</th>
                    <th className="py-3 px-4 text-right">Bobot (Weight)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {state.assessmentCriteria.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono text-amber-400">{c.category}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{c.name}</div>
                        <div className="font-mono text-[11px] text-slate-500">{c.code}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {c.minScore} – {c.maxScore}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        ×{c.weight}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={c.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canManageCriteria && (
                          <button
                            type="button"
                            onClick={() => {
                              setCriteriaForm({
                                id: c.id,
                                category: c.category,
                                code: c.code,
                                name: c.name,
                                minScore: String(c.minScore),
                                maxScore: String(c.maxScore),
                                weight: String(c.weight),
                                isActive: c.isActive,
                              });
                              setModalMode('edit_criteria');
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Atur Bobot</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CHART OF ACCOUNTS (COA) */}
      {activeTab === 'accounting' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Pengaturan Bagan Akun Standar / Chart of Accounts Double-Entry ({state.accounting.accounts.length})
              </h3>
              <p className="text-xs text-slate-400">
                Daftar akun buku besar untuk pencatatan otomatis Invoice (1102/4101/4102), Pembayaran (1101), Beban (5103–5108), dan Payroll Pelatih (5101/2101).
              </p>
            </div>
            {canManageAccounting && (
              <button
                type="button"
                onClick={() => {
                  setAccountForm({
                    id: '',
                    code: '',
                    name: '',
                    accountType: 'EXPENSE',
                    normalBalance: 'DEBIT',
                    isActive: true,
                  });
                  setModalMode('new_account');
                }}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Akun COA Baru</span>
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Kode Akun</th>
                    <th className="py-3 px-4">Nama Akun Buku Besar</th>
                    <th className="py-3 px-4">Kategori (Type)</th>
                    <th className="py-3 px-4">Saldo Normal</th>
                    <th className="py-3 px-4 text-right">Saldo Berjalan</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                  {state.accounting.accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-bold text-amber-400">{acc.code}</td>
                      <td className="py-3 px-4 font-sans font-semibold text-slate-100">
                        {acc.name}
                      </td>
                      <td className="py-3 px-4 text-slate-300">{acc.accountType}</td>
                      <td className="py-3 px-4 text-slate-300">{acc.normalBalance}</td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-400">
                        {formatIDR(acc.netBalance)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setAccountForm({
                              id: acc.id,
                              code: acc.code,
                              name: acc.name,
                              accountType: acc.accountType as
                                | 'ASSET'
                                | 'LIABILITY'
                                | 'EQUITY'
                                | 'REVENUE'
                                | 'EXPENSE',
                              normalBalance: acc.normalBalance as 'DEBIT' | 'CREDIT',
                              isActive: true,
                            });
                            setModalMode('edit_account');
                          }}
                          className="px-2.5 py-1 text-xs font-sans font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit Akun</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: WHATSAPP, EMAIL & DIGITAL NOTIFICATIONS + SYSTEM INTEGRITY */}
      {activeTab === 'notifications_system' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-mono uppercase text-emerald-400">
                KONFIGURASI NOTIFIKASI WHATSAPP (WA) & EMAIL RESMI AKADEMI
              </div>
              <div className="text-sm font-bold text-slate-100 mt-0.5">
                Pengaturan Pengiriman Tagihan, Kwitansi Lunas, Presensi & Evaluasi lewat WA dan Email
              </div>
              <p className="text-xs text-slate-400">
                Seluruh nomor pengirim, alamat email, pemicu otomatis, dan template pesan WA/Email disimpan permanen di Pengaturan Aplikasi.
              </p>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                handleSavePaymentAndNotifSettings('Notifikasi WhatsApp (WA) & Email')
              }
              className="px-4 py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>
                {submitting ? 'Menyimpan...' : 'Simpan Pengaturan WA & Email ke Database'}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. PENGATURAN NOTIFIKASI WHATSAPP (WA) */}
            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/40 space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="text-xs font-mono text-emerald-400 uppercase">
                      WHATSAPP NOTIFICATION ENGINE
                    </div>
                    <h3 className="text-sm font-bold text-slate-100">
                      1. Pengaturan Notifikasi WhatsApp (WA Parent & Pemain)
                    </h3>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.notificationChannels.whatsapp.enabled}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            enabled: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  <span>WA Aktif</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Nomor WhatsApp Admin / Pengirim *
                  </label>
                  <input
                    type="text"
                    value={appSettings.notificationChannels.whatsapp.senderNumber}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            senderNumber: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 font-mono bg-slate-950 border border-slate-800 rounded text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Nama Identitas WA Resmi *</label>
                  <input
                    type="text"
                    value={appSettings.notificationChannels.whatsapp.senderName}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            senderName: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-200 pt-1">
                <div className="text-slate-400 font-semibold">
                  Otomasi Pengiriman Pesan WhatsApp:
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.notificationChannels.whatsapp.autoSendInvoice}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            autoSendInvoice: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  <span>Kirim WA Otomatis saat Invoice / Tagihan Baru Terbit</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.notificationChannels.whatsapp.autoSendReceipt}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            autoSendReceipt: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  <span>Kirim WA Otomatis Bukti Lunas / Kwitansi saat Pembayaran Diterima</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.notificationChannels.whatsapp.autoSendAttendance}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            autoSendAttendance: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  <span>Kirim WA Konfirmasi Presensi Latihan Digital</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      appSettings.notificationChannels.whatsapp.autoSendDailyTrainingReminder !==
                      false
                    }
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            autoSendDailyTrainingReminder: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  <span className="text-emerald-300 font-semibold">
                    Kirim WA Otomatis Pengingat Jadwal Latihan Harian ke Nomor WA Orang Tua
                  </span>
                </label>
                <div className="pt-1 flex items-center gap-3">
                  <label className="text-slate-400">
                    Jam Pengiriman Otomatis Pengingat Jadwal Latihan Harian (WIB):
                  </label>
                  <input
                    type="time"
                    value={
                      appSettings.notificationChannels.whatsapp.dailyReminderTimeWib || '07:00'
                    }
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            dailyReminderTimeWib: e.target.value,
                          },
                        },
                      })
                    }
                    className="px-2.5 py-1 font-mono text-xs bg-slate-950 border border-slate-800 rounded text-emerald-400"
                  />
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Template Pesan WA Pengingat Jadwal Latihan Harian (Variabel: {'{parent_name}'},{' '}
                    {'{athlete_name}'}, {'{team_name}'}, {'{session_date}'}, {'{session_time}'},{' '}
                    {'{court_name}'}, {'{coach_name}'}, {'{topic}'})
                  </label>
                  <textarea
                    rows={3}
                    value={
                      appSettings.notificationChannels.whatsapp.trainingReminderTemplate ||
                      'Halo Bapak/Ibu {parent_name}, pengingat jadwal latihan harian ZAMOA CBTC untuk atlet *{athlete_name}* ({team_name}) pada *{session_date}* pukul *{session_time} WIB* di *{court_name}* bersama Coach {coach_name}. Topik: _{topic}_. Mohon hadir 15 menit sebelum sesi dimulai.'
                    }
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            trainingReminderTemplate: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 font-mono bg-slate-950 border border-slate-800 rounded text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Template Pesan WA Tagihan Baru (Variabel: {'{athlete_name}'},{' '}
                    {'{invoice_number}'}, {'{amount}'}, {'{due_date}'})
                  </label>
                  <textarea
                    rows={3}
                    value={appSettings.notificationChannels.whatsapp.invoiceTemplate}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            invoiceTemplate: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 font-mono bg-slate-950 border border-slate-800 rounded text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Template Pesan WA Bukti Lunas / Kwitansi (Variabel: {'{athlete_name}'},{' '}
                    {'{invoice_number}'}, {'{receipt_number}'}, {'{amount}'}, {'{payment_method}'})
                  </label>
                  <textarea
                    rows={3}
                    value={appSettings.notificationChannels.whatsapp.receiptTemplate}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          whatsapp: {
                            ...appSettings.notificationChannels.whatsapp,
                            receiptTemplate: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 font-mono bg-slate-950 border border-slate-800 rounded text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiRequest('/api/notifications/dispatch-wa-email', {
                        method: 'POST',
                        body: JSON.stringify({
                          channel: 'WHATSAPP',
                          recipientPhone: appSettings.notificationChannels.whatsapp.senderNumber,
                          title: 'Uji Kirim Notifikasi WhatsApp Resmi ZAMOA CBTC',
                          message:
                            'Koneksi & Template Notifikasi WhatsApp ZAMOA CBTC aktif dan siap mengirimkan tagihan serta bukti lunas ke Parent & Pemain.',
                          category: 'SYSTEM',
                        }),
                      });
                      notify('Uji pengiriman notifikasi WhatsApp berhasil dicatat.');
                      await onRefresh();
                    } catch {
                      notify('Gagal menguji notifikasi WA', 'error');
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Uji Kirim Notifikasi WA</span>
                </button>
              </div>
            </div>

            {/* 2. PENGATURAN NOTIFIKASI EMAIL RESMI */}
            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/40 space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-xs font-mono text-amber-400 uppercase">
                      OFFICIAL EMAIL NOTIFICATION ENGINE
                    </div>
                    <h3 className="text-sm font-bold text-slate-100">
                      2. Pengaturan Notifikasi Email Resmi (Parent & Pemain)
                    </h3>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.notificationChannels.email.enabled}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          email: {
                            ...appSettings.notificationChannels.email,
                            enabled: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  <span>Email Aktif</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Alamat Email Pengirim *</label>
                  <input
                    type="email"
                    value={appSettings.notificationChannels.email.senderEmail}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          email: {
                            ...appSettings.notificationChannels.email,
                            senderEmail: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 font-mono bg-slate-950 border border-slate-800 rounded text-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Nama Pengirim Email *</label>
                  <input
                    type="text"
                    value={appSettings.notificationChannels.email.senderName}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          email: {
                            ...appSettings.notificationChannels.email,
                            senderName: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Alamat Email Reply-To</label>
                  <input
                    type="email"
                    value={appSettings.notificationChannels.email.replyToEmail}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          email: {
                            ...appSettings.notificationChannels.email,
                            replyToEmail: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 font-mono bg-slate-950 border border-slate-800 rounded text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Server SMTP / Mail Host</label>
                  <input
                    type="text"
                    value={appSettings.notificationChannels.email.smtpHost}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          email: {
                            ...appSettings.notificationChannels.email,
                            smtpHost: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 font-mono bg-slate-950 border border-slate-800 rounded text-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-200 pt-1">
                <div className="text-slate-400 font-semibold">Otomasi Pengiriman Email:</div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.notificationChannels.email.autoSendInvoice}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          email: {
                            ...appSettings.notificationChannels.email,
                            autoSendInvoice: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  <span>Kirim Email Otomatis saat Tagihan / Invoice Terbit</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.notificationChannels.email.autoSendReceipt}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          email: {
                            ...appSettings.notificationChannels.email,
                            autoSendReceipt: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  <span>Kirim Email Otomatis Kwitansi Resmi saat Pembayaran Lunas</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.notificationChannels.email.autoSendEvaluation}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          email: {
                            ...appSettings.notificationChannels.email,
                            autoSendEvaluation: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  <span>Kirim Email Rapor Evaluasi Perkembangan Atlet</span>
                </label>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Template Subjek Email Tagihan Baru:
                  </label>
                  <input
                    type="text"
                    value={appSettings.notificationChannels.email.invoiceSubjectTemplate}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          email: {
                            ...appSettings.notificationChannels.email,
                            invoiceSubjectTemplate: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 font-mono bg-slate-950 border border-slate-800 rounded text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Template Subjek Email Bukti Lunas / Kwitansi:
                  </label>
                  <input
                    type="text"
                    value={appSettings.notificationChannels.email.receiptSubjectTemplate}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        notificationChannels: {
                          ...appSettings.notificationChannels,
                          email: {
                            ...appSettings.notificationChannels.email,
                            receiptSubjectTemplate: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 font-mono bg-slate-950 border border-slate-800 rounded text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiRequest('/api/notifications/dispatch-wa-email', {
                        method: 'POST',
                        body: JSON.stringify({
                          channel: 'EMAIL',
                          recipientEmail: state.currentUser.email,
                          title: 'Uji Kirim Notifikasi Email Resmi ZAMOA CBTC',
                          message: `Konfigurasi Email (${appSettings.notificationChannels.email.senderEmail}) melalui host ${appSettings.notificationChannels.email.smtpHost} aktif dan siap mengirimkan invoice serta kwitansi resmi.`,
                          category: 'SYSTEM',
                        }),
                      });
                      notify('Uji pengiriman notifikasi Email berhasil dicatat.');
                      await onRefresh();
                    } catch {
                      notify('Gagal menguji notifikasi Email', 'error');
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Uji Kirim Notifikasi Email</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Digital Notification Preferences */}
          <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/40 space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-amber-400 uppercase">
                  DIGITAL NOTIFICATION & WEB PUSH ENGINE
                </div>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                  Pengaturan Kanal Notifikasi Digital & Push Browser
                </h3>
              </div>
              <span className="font-mono text-xs text-emerald-400">
                PUSH: {pushStatus.toUpperCase()}
              </span>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3.5 rounded border border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-100">
                    1. In-App Real-Time Notification Drawer (Topbar)
                  </div>
                  <div className="text-slate-400">
                    Aktif otomatis untuk seluruh 12 role RBAC dan tersimpan di tabel PostgreSQL{' '}
                    <span className="font-mono text-amber-400">notifications</span>.
                  </div>
                </div>
                <span className="font-mono text-emerald-400 font-semibold">AKTIF</span>
              </div>

              <div className="p-3.5 rounded border border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">
                    2. Native Browser Web Push Notification
                  </div>
                  <div className="text-slate-400">
                    Menampilkan pop-up notifikasi langsung di layar perangkat saat ada tagihan, jadwal latihan, atau evaluasi baru.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const status = await requestBrowserNotificationPermission();
                    setPushStatus(status);
                    if (status === 'granted') {
                      sendBrowserDigitalNotification(
                        'Uji Notifikasi Digital ZAMOA CBTC',
                        'Konfigurasi Web Push Browser aktif dan siap menerima siaran akademi.',
                        'SYSTEM'
                      );
                      notify('Web Push Browser berhasil diaktifkan dan diuji.');
                    } else {
                      notify(
                        'Izin notifikasi browser belum diberikan atau diblokir oleh pengaturan browser.',
                        'error'
                      );
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded shrink-0"
                >
                  {pushStatus === 'granted' ? 'Uji Push Browser' : 'Aktifkan Push Browser'}
                </button>
              </div>

              <div className="p-3.5 rounded border border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-100">
                    3. Generator Kartu Pemberitahuan Digital Resmi (.TXT / Clipboard)
                  </div>
                  <div className="text-slate-400">
                    Memformat bukti pemberitahuan resmi dengan kode verifikasi unik untuk dibagikan ke wali/atlet.
                  </div>
                </div>
                <span className="font-mono text-emerald-400 font-semibold">SIAP</span>
              </div>
            </div>
          </div>

          {/* Database & Ledger Consistency Verification */}
          <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/40 space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-amber-400 uppercase">
                  TRANSACTIONAL INVARIANTS & LEDGER HEALTH
                </div>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                  Verifikasi Konsistensi Database & Akuntansi Double-Entry
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRunConsistencyCheck}
                disabled={checkingConsistency}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded flex items-center gap-1.5"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    checkingConsistency ? 'animate-spin text-amber-400' : ''
                  }`}
                />
                <span>Jalankan Pemeriksaan</span>
              </button>
            </div>

            {consistencyResult ? (
              <div className="space-y-2.5">
                {consistencyResult.checks.map((chk) => (
                  <div
                    key={chk.code}
                    className="p-3 rounded border border-slate-800 bg-slate-950/60 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-100">{chk.name}</div>
                      <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                        {chk.detail}
                      </div>
                    </div>
                    <span
                      className={`font-mono font-bold shrink-0 ${
                        chk.passed ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {chk.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded border border-slate-800/80 bg-slate-950/40 text-center space-y-2">
                <ShieldCheck className="w-6 h-6 text-amber-400 mx-auto" />
                <div className="text-xs font-semibold text-slate-200">
                  Siap Memeriksa 4 Invarian Utama Sistem
                </div>
                <p className="text-xs text-slate-400">
                  Klik tombol <strong>Jalankan Pemeriksaan</strong> untuk memvalidasi keseimbangan Debit = Kredit jurnal umum, anti-duplikasi presensi latihan, saldo non-negatif inventaris, dan rekonsiliasi piutang invoice.
                </p>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* MODALS FOR ADDING / EDITING SETTINGS */}
      <Modal
        open={modalMode !== null}
        onClose={() => setModalMode(null)}
        title={
          modalMode === 'new_branch'
            ? 'Tambah Cabang Operasional Baru'
            : modalMode === 'edit_branch'
            ? `Pengaturan Cabang: ${branchForm.code}`
            : modalMode === 'new_plan'
            ? 'Tambah Paket Membership Baru'
            : modalMode === 'edit_plan'
            ? `Ubah Tarif Paket: ${planForm.code}`
            : modalMode === 'new_age_group'
            ? 'Tambah Kelompok Umur (KU)'
            : modalMode === 'edit_age_group'
            ? `Edit Kelompok Umur: ${ageGroupForm.code}`
            : modalMode === 'new_criteria'
            ? 'Tambah Kriteria Evaluasi Rapor'
            : modalMode === 'edit_criteria'
            ? `Atur Bobot Kriteria: ${criteriaForm.code}`
            : modalMode === 'edit_account'
            ? `Edit Akun COA: ${accountForm.code}`
            : 'Tambah Akun Buku Besar (COA)'
        }
      >
        {(modalMode === 'new_branch' || modalMode === 'edit_branch') && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                if (modalMode === 'new_branch') {
                  await apiRequest('/api/branches', {
                    method: 'POST',
                    body: JSON.stringify({
                      code: branchForm.code,
                      name: branchForm.name,
                      city: branchForm.city,
                      address: branchForm.address,
                      phone: branchForm.phone,
                      courtsCount: Number(branchForm.courtsCount),
                    }),
                  });
                  notify('Cabang baru berhasil ditambahkan.');
                } else {
                  await apiRequest(`/api/branches/${branchForm.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: branchForm.name,
                      city: branchForm.city,
                      address: branchForm.address,
                      phone: branchForm.phone || null,
                      courtsCount: Number(branchForm.courtsCount),
                      isActive: branchForm.isActive,
                    }),
                  });
                  notify('Pengaturan cabang berhasil diperbarui.');
                }
                setModalMode(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menyimpan cabang', 'error');
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
                  disabled={modalMode === 'edit_branch'}
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                  placeholder="CBTC-SMG"
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
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
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Nama Cabang *</label>
                <input
                  type="text"
                  required
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Alamat Lengkap Arena *</label>
                <input
                  type="text"
                  required
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nomor Telepon</label>
                <input
                  type="text"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Jumlah Lapangan (Court) *</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={branchForm.courtsCount}
                  onChange={(e) => setBranchForm({ ...branchForm, courtsCount: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              {modalMode === 'edit_branch' && (
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <input
                    id="branch-active-toggle"
                    type="checkbox"
                    checked={branchForm.isActive}
                    onChange={(e) => setBranchForm({ ...branchForm, isActive: e.target.checked })}
                  />
                  <label htmlFor="branch-active-toggle" className="text-xs text-slate-200">
                    Cabang Aktif Beroperasi
                  </label>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Simpan Pengaturan Cabang
              </button>
            </div>
          </form>
        )}

        {(modalMode === 'new_plan' || modalMode === 'edit_plan') && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                if (modalMode === 'new_plan') {
                  await apiRequest('/api/settings/membership-plans', {
                    method: 'POST',
                    body: JSON.stringify({
                      code: planForm.code,
                      name: planForm.name,
                      billingCycle: planForm.billingCycle,
                      feeAmount: Number(planForm.feeAmount),
                      registrationFee: Number(planForm.registrationFee),
                      sessionsPerWeek: Number(planForm.sessionsPerWeek),
                    }),
                  });
                  notify('Paket membership baru berhasil dibuat.');
                } else {
                  await apiRequest(`/api/settings/membership-plans/${planForm.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: planForm.name,
                      billingCycle: planForm.billingCycle,
                      feeAmount: Number(planForm.feeAmount),
                      registrationFee: Number(planForm.registrationFee),
                      sessionsPerWeek: Number(planForm.sessionsPerWeek),
                      isActive: planForm.isActive,
                    }),
                  });
                  notify('Tarif paket membership berhasil diperbarui.');
                }
                setModalMode(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(
                  err instanceof Error ? err.message : 'Gagal menyimpan paket membership',
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
                <label className="block text-xs text-slate-400 mb-1">Kode Paket *</label>
                <input
                  type="text"
                  required
                  disabled={modalMode === 'edit_plan'}
                  value={planForm.code}
                  onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Siklus Tagihan *</label>
                <select
                  value={planForm.billingCycle}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      billingCycle: e.target.value as 'MONTHLY' | 'QUARTERLY' | 'ANNUAL',
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="MONTHLY">MONTHLY (Bulanan)</option>
                  <option value="QUARTERLY">QUARTERLY (Triwulan)</option>
                  <option value="ANNUAL">ANNUAL (Tahunan)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Nama Paket Membership *</label>
                <input
                  type="text"
                  required
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  placeholder="Program Intensif Kompetisi (4x Sesi / Minggu)"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Biaya Iuran (Rp) *</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={planForm.feeAmount}
                  onChange={(e) => setPlanForm({ ...planForm, feeAmount: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Biaya Registrasi Awal (Rp) *
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={planForm.registrationFee}
                  onChange={(e) => setPlanForm({ ...planForm, registrationFee: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Kuota Sesi Latihan / Minggu *
                </label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  required
                  value={planForm.sessionsPerWeek}
                  onChange={(e) => setPlanForm({ ...planForm, sessionsPerWeek: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              {modalMode === 'edit_plan' && (
                <div className="flex items-center gap-2 pt-5">
                  <input
                    id="plan-active-toggle"
                    type="checkbox"
                    checked={planForm.isActive}
                    onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })}
                  />
                  <label htmlFor="plan-active-toggle" className="text-xs text-slate-200">
                    Paket Aktif Ditawarkan
                  </label>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Simpan Paket Membership
              </button>
            </div>
          </form>
        )}

        {(modalMode === 'new_age_group' || modalMode === 'edit_age_group') && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                if (modalMode === 'new_age_group') {
                  await apiRequest('/api/age-groups', {
                    method: 'POST',
                    body: JSON.stringify({
                      code: ageGroupForm.code,
                      name: ageGroupForm.name,
                      minAge: Number(ageGroupForm.minAge),
                      maxAge: Number(ageGroupForm.maxAge),
                      description: ageGroupForm.description,
                    }),
                  });
                  notify('Kelompok umur baru berhasil ditambahkan.');
                } else {
                  await apiRequest(`/api/age-groups/${ageGroupForm.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: ageGroupForm.name,
                      minAge: Number(ageGroupForm.minAge),
                      maxAge: Number(ageGroupForm.maxAge),
                      description: ageGroupForm.description,
                    }),
                  });
                  notify('Kelompok umur berhasil diperbarui.');
                }
                setModalMode(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menyimpan kelompok umur', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kode KU *</label>
                <input
                  type="text"
                  required
                  disabled={modalMode === 'edit_age_group'}
                  value={ageGroupForm.code}
                  onChange={(e) => setAgeGroupForm({ ...ageGroupForm, code: e.target.value })}
                  placeholder="KU-08"
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Kelompok Umur *</label>
                <input
                  type="text"
                  required
                  value={ageGroupForm.name}
                  onChange={(e) => setAgeGroupForm({ ...ageGroupForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Usia Minimum (Tahun) *</label>
                <input
                  type="number"
                  min={4}
                  max={30}
                  required
                  value={ageGroupForm.minAge}
                  onChange={(e) => setAgeGroupForm({ ...ageGroupForm, minAge: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Usia Maksimum (Tahun) *</label>
                <input
                  type="number"
                  min={4}
                  max={35}
                  required
                  value={ageGroupForm.maxAge}
                  onChange={(e) => setAgeGroupForm({ ...ageGroupForm, maxAge: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Deskripsi Fokus Kurikulum</label>
                <textarea
                  rows={2}
                  value={ageGroupForm.description}
                  onChange={(e) =>
                    setAgeGroupForm({ ...ageGroupForm, description: e.target.value })
                  }
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
                Simpan Kelompok Umur
              </button>
            </div>
          </form>
        )}

        {(modalMode === 'new_criteria' || modalMode === 'edit_criteria') && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                if (modalMode === 'new_criteria') {
                  await apiRequest('/api/assessment-criteria', {
                    method: 'POST',
                    body: JSON.stringify({
                      category: criteriaForm.category,
                      code: criteriaForm.code,
                      name: criteriaForm.name,
                      minScore: Number(criteriaForm.minScore),
                      maxScore: Number(criteriaForm.maxScore),
                      weight: Number(criteriaForm.weight),
                    }),
                  });
                  notify('Kriteria evaluasi baru berhasil ditambahkan.');
                } else {
                  await apiRequest(`/api/assessment-criteria/${criteriaForm.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: criteriaForm.name,
                      minScore: Number(criteriaForm.minScore),
                      maxScore: Number(criteriaForm.maxScore),
                      weight: Number(criteriaForm.weight),
                      isActive: criteriaForm.isActive,
                    }),
                  });
                  notify('Bobot & parameter kriteria evaluasi berhasil diperbarui.');
                }
                setModalMode(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(
                  err instanceof Error ? err.message : 'Gagal menyimpan kriteria evaluasi',
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
                <label className="block text-xs text-slate-400 mb-1">Kategori Evaluasi *</label>
                <select
                  disabled={modalMode === 'edit_criteria'}
                  value={criteriaForm.category}
                  onChange={(e) =>
                    setCriteriaForm({
                      ...criteriaForm,
                      category: e.target.value as 'TECHNICAL' | 'PHYSICAL' | 'MENTAL',
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="TECHNICAL">TECHNICAL</option>
                  <option value="PHYSICAL">PHYSICAL</option>
                  <option value="MENTAL">MENTAL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kode Kriteria *</label>
                <input
                  type="text"
                  required
                  disabled={modalMode === 'edit_criteria'}
                  value={criteriaForm.code}
                  onChange={(e) => setCriteriaForm({ ...criteriaForm, code: e.target.value })}
                  placeholder="TECH_FOOTWORK"
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Nama Indikator Penilaian *</label>
                <input
                  type="text"
                  required
                  value={criteriaForm.name}
                  onChange={(e) => setCriteriaForm({ ...criteriaForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bobot Penilaian (Weight) *</label>
                <input
                  type="number"
                  step="0.05"
                  min={0.1}
                  max={10}
                  required
                  value={criteriaForm.weight}
                  onChange={(e) => setCriteriaForm({ ...criteriaForm, weight: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Skor Maksimum *</label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  required
                  value={criteriaForm.maxScore}
                  onChange={(e) => setCriteriaForm({ ...criteriaForm, maxScore: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              {modalMode === 'edit_criteria' && (
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <input
                    id="criteria-active-toggle"
                    type="checkbox"
                    checked={criteriaForm.isActive}
                    onChange={(e) =>
                      setCriteriaForm({ ...criteriaForm, isActive: e.target.checked })
                    }
                  />
                  <label htmlFor="criteria-active-toggle" className="text-xs text-slate-200">
                    Kriteria Aktif Digunakan pada Form Rapor Evaluasi
                  </label>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Simpan Kriteria Evaluasi
              </button>
            </div>
          </form>
        )}

        {(modalMode === 'new_account' || modalMode === 'edit_account') && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                if (modalMode === 'new_account') {
                  await apiRequest('/api/accounts', {
                    method: 'POST',
                    body: JSON.stringify({
                      code: accountForm.code,
                      name: accountForm.name,
                      accountType: accountForm.accountType,
                      normalBalance: accountForm.normalBalance,
                    }),
                  });
                  notify('Akun Buku Besar (COA) baru berhasil ditambahkan.');
                } else {
                  await apiRequest(`/api/accounts/${accountForm.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: accountForm.name,
                      accountType: accountForm.accountType,
                      normalBalance: accountForm.normalBalance,
                      isActive: accountForm.isActive,
                    }),
                  });
                  notify('Pengaturan Akun Buku Besar (COA) berhasil diperbarui.');
                }
                setModalMode(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menyimpan akun COA', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kode Akun COA *</label>
                <input
                  type="text"
                  required
                  disabled={modalMode === 'edit_account'}
                  value={accountForm.code}
                  onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })}
                  placeholder="5109"
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tipe Akun *</label>
                <select
                  value={accountForm.accountType}
                  onChange={(e) => {
                    const nextType = e.target.value as
                      | 'ASSET'
                      | 'LIABILITY'
                      | 'EQUITY'
                      | 'REVENUE'
                      | 'EXPENSE';
                    setAccountForm({
                      ...accountForm,
                      accountType: nextType,
                      normalBalance:
                        nextType === 'ASSET' || nextType === 'EXPENSE' ? 'DEBIT' : 'CREDIT',
                    });
                  }}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="ASSET">ASSET (Harta)</option>
                  <option value="LIABILITY">LIABILITY (Kewajiban/Utang)</option>
                  <option value="EQUITY">EQUITY (Modal/Ekuitas)</option>
                  <option value="REVENUE">REVENUE (Pendapatan)</option>
                  <option value="EXPENSE">EXPENSE (Beban)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Nama Akun Buku Besar *</label>
                <input
                  type="text"
                  required
                  value={accountForm.name}
                  onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                  placeholder="Beban Konsumsi & Nutrisi Latihan"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Saldo Normal *</label>
                <select
                  value={accountForm.normalBalance}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      normalBalance: e.target.value as 'DEBIT' | 'CREDIT',
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Simpan Akun COA</span>
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
export default AppSettingsView;
