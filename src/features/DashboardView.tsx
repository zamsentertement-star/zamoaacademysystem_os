import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  CalendarCheck,
  Wallet,
  Trophy,
  HeartPulse,
  TrendingUp,
  ArrowUpRight,
  Building2,
  ClipboardCheck,
  AlertCircle,
  Bell,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Globe,
  Landmark,
  CheckCircle2,
  Target,
  Award,
  Clock,
  MapPin,
  UserCheck,
  Package,
  AlertTriangle,
  Boxes,
  Wrench,
  Zap,
  UserPlus,
  FilePlus2,
  ShieldCheck,
  Lock,
  Download,
  CreditCard,
  Megaphone,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Legend,
  ReferenceLine,
} from 'recharts';
import { SystemState, getEffectiveAppSettings } from '../types/system.ts';
import { apiRequest, exportRowsToCsv, formatIDR } from '../lib/api.ts';
import { hasPermission, SYSTEM_ROLES } from '../lib/rbac.ts';
import { StatusText } from '../components/ui/Primitives.tsx';

interface DashboardViewProps {
  state: SystemState;
  onNavigate: (section: string) => void;
  onRefresh?: () => Promise<void> | void;
  notify?: (message: string, type?: 'success' | 'error') => void;
}

const MONTH_NAMES_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const ATTENDANCE_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; description: string }
> = {
  PRESENT: {
    label: 'Hadir Tepat Waktu',
    color: '#10b981',
    description: 'Check-in sesuai jadwal lapangan',
  },
  LATE: {
    label: 'Hadir Terlambat',
    color: '#f59e0b',
    description: 'Check-in >15 menit setelah sesi mulai',
  },
  EXCUSED: {
    label: 'Izin / Sakit Resmi',
    color: '#38bdf8',
    description: 'Konfirmasi orang tua / tim medis',
  },
  ABSENT: {
    label: 'Tanpa Keterangan',
    color: '#ef4444',
    description: 'Tidak hadir tanpa konfirmasi',
  },
};

type QuarterScopeMode = 'ROLLING_QUARTER' | 'Q3_2026' | 'Q4_2026';
type QuarterGranularity = 'BIWEEKLY' | 'MONTHLY';

interface QuarterBucketDef {
  key: string;
  label: string;
  subLabel: string;
  startDate: string;
  endDate: string;
}

function buildQuarterBuckets(
  scope: QuarterScopeMode,
  granularity: QuarterGranularity
): QuarterBucketDef[] {
  if (scope === 'Q3_2026') {
    if (granularity === 'MONTHLY') {
      return [
        {
          key: '2026-07',
          label: "Jul '26",
          subLabel: 'Bulan 1 (Q3)',
          startDate: '2026-07-01',
          endDate: '2026-07-31',
        },
        {
          key: '2026-08',
          label: "Agu '26",
          subLabel: 'Bulan 2 (Q3)',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        },
        {
          key: '2026-09',
          label: "Sep '26",
          subLabel: 'Bulan 3 (Q3)',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
        },
      ];
    }
    return [
      {
        key: 'Q3-P1',
        label: 'Jul M1-2',
        subLabel: '01-15 Jul',
        startDate: '2026-07-01',
        endDate: '2026-07-15',
      },
      {
        key: 'Q3-P2',
        label: 'Jul M3-4',
        subLabel: '16-31 Jul',
        startDate: '2026-07-16',
        endDate: '2026-07-31',
      },
      {
        key: 'Q3-P3',
        label: 'Agu M1-2',
        subLabel: '01-15 Agu',
        startDate: '2026-08-01',
        endDate: '2026-08-15',
      },
      {
        key: 'Q3-P4',
        label: 'Agu M3-4',
        subLabel: '16-31 Agu',
        startDate: '2026-08-16',
        endDate: '2026-08-31',
      },
      {
        key: 'Q3-P5',
        label: 'Sep M1-2',
        subLabel: '01-15 Sep',
        startDate: '2026-09-01',
        endDate: '2026-09-15',
      },
      {
        key: 'Q3-P6',
        label: 'Sep M3-4',
        subLabel: '16-30 Sep',
        startDate: '2026-09-16',
        endDate: '2026-09-30',
      },
    ];
  }

  if (scope === 'Q4_2026') {
    if (granularity === 'MONTHLY') {
      return [
        {
          key: '2026-10',
          label: "Okt '26",
          subLabel: 'Bulan 1 (Q4)',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        },
        {
          key: '2026-11',
          label: "Nov '26",
          subLabel: 'Bulan 2 (Q4)',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
        },
        {
          key: '2026-12',
          label: "Des '26",
          subLabel: 'Bulan 3 (Q4)',
          startDate: '2026-12-01',
          endDate: '2026-12-31',
        },
      ];
    }
    return [
      {
        key: 'Q4-P1',
        label: 'Okt M1',
        subLabel: '01-07 Okt',
        startDate: '2026-10-01',
        endDate: '2026-10-07',
      },
      {
        key: 'Q4-P2',
        label: 'Okt M2',
        subLabel: '08-14 Okt',
        startDate: '2026-10-08',
        endDate: '2026-10-14',
      },
      {
        key: 'Q4-P3',
        label: 'Okt M3',
        subLabel: '15-21 Okt',
        startDate: '2026-10-15',
        endDate: '2026-10-21',
      },
      {
        key: 'Q4-P4',
        label: 'Okt M4',
        subLabel: '22-31 Okt',
        startDate: '2026-10-22',
        endDate: '2026-10-31',
      },
      {
        key: 'Q4-P5',
        label: 'Nov M1-2',
        subLabel: '01-15 Nov',
        startDate: '2026-11-01',
        endDate: '2026-11-15',
      },
      {
        key: 'Q4-P6',
        label: 'Nov-Des',
        subLabel: '16 Nov-31 Des',
        startDate: '2026-11-16',
        endDate: '2026-12-31',
      },
    ];
  }

  // ROLLING_QUARTER (Kuartal Aktif Berjalan: Agu - Sep - Okt 2026)
  if (granularity === 'MONTHLY') {
    return [
      {
        key: '2026-08',
        label: "Agu '26",
        subLabel: 'Awal Kuartal',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      },
      {
        key: '2026-09',
        label: "Sep '26",
        subLabel: 'Tengah Kuartal',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      },
      {
        key: '2026-10',
        label: "Okt '26",
        subLabel: 'Bulan Berjalan',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      },
    ];
  }

  return [
    {
      key: 'RQ-P1',
      label: 'Agu M1-2',
      subLabel: '01-15 Agu',
      startDate: '2026-08-01',
      endDate: '2026-08-15',
    },
    {
      key: 'RQ-P2',
      label: 'Agu M3-4',
      subLabel: '16-31 Agu',
      startDate: '2026-08-16',
      endDate: '2026-08-31',
    },
    {
      key: 'RQ-P3',
      label: 'Sep M1-2',
      subLabel: '01-15 Sep',
      startDate: '2026-09-01',
      endDate: '2026-09-15',
    },
    {
      key: 'RQ-P4',
      label: 'Sep M3-4',
      subLabel: '16-30 Sep',
      startDate: '2026-09-16',
      endDate: '2026-09-30',
    },
    {
      key: 'RQ-P5',
      label: 'Okt M1-2',
      subLabel: '01-15 Okt',
      startDate: '2026-10-01',
      endDate: '2026-10-15',
    },
    {
      key: 'RQ-P6',
      label: 'Okt M3-4',
      subLabel: '16-31 Okt',
      startDate: '2026-10-16',
      endDate: '2026-10-31',
    },
  ];
}

export function DashboardView({
  state,
  onNavigate,
  onRefresh,
  notify,
}: DashboardViewProps) {
  const effectiveSettings = getEffectiveAppSettings(state);
  const kpiConfig = effectiveSettings.masterOperationalConfig?.dashboardKpi;
  const targetKpiPct = kpiConfig?.targetAttendancePct ?? 85;
  const showRealtimeKpiCharts = kpiConfig?.showRealtimeKpiCharts ?? true;

  const [kpiBranchFilter, setKpiBranchFilter] = useState<string>(
    state.currentUser.branchId || 'ALL'
  );
  const [todaySessionFilterMode, setTodaySessionFilterMode] = useState<
    'ACTIVE_TODAY' | 'ALL_TODAY'
  >('ACTIVE_TODAY');
  const [inventoryThresholdMode, setInventoryThresholdMode] = useState<
    'BELOW_MIN' | 'AT_OR_BELOW_MIN'
  >('BELOW_MIN');
  const [criticalInventoryCategoryFilter, setCriticalInventoryCategoryFilter] =
    useState<string>('ALL');

  useEffect(() => {
    setKpiBranchFilter(state.currentUser.branchId || 'ALL');
  }, [state.currentUser.branchId]);
  const [quarterScope, setQuarterScope] = useState<QuarterScopeMode>('ROLLING_QUARTER');
  const [quarterGranularity, setQuarterGranularity] = useState<QuarterGranularity>('BIWEEKLY');
  const [attendanceTrendTab, setAttendanceTrendTab] = useState<
    'QUARTER_TREND' | 'STATUS_STACK' | 'DISTRIBUTION' | 'BY_TEAM'
  >('QUARTER_TREND');
  const [financeChartTab, setFinanceChartTab] = useState<
    'COLLECTION_GROWTH' | 'PAYMENT_CHANNELS' | 'CASHFLOW_MARGIN'
  >('COLLECTION_GROWTH');
  const [growthChartMode, setGrowthChartMode] = useState<'CUMULATIVE' | 'CHANNEL'>('CUMULATIVE');
  const [selectedRevenueMonth, setSelectedRevenueMonth] = useState<string>('2026-10');
  const [goalBasisMode, setGoalBasisMode] = useState<
    'ANNUAL_MEMBERSHIP_GOAL' | 'CONTRACTED_RUN_RATE'
  >('ANNUAL_MEMBERSHIP_GOAL');
  const [revenueWidgetChartMode, setRevenueWidgetChartMode] = useState<
    'BY_PLAN' | 'MONTHLY_TRAJECTORY'
  >('BY_PLAN');

  // Filtered datasets for Real-Time KPI Monitoring
  const scopedAthletes = useMemo(() => {
    if (kpiBranchFilter === 'ALL') return state.athletes;
    return state.athletes.filter((a) => a.branchId === kpiBranchFilter);
  }, [state.athletes, kpiBranchFilter]);

  const scopedSessions = useMemo(() => {
    if (kpiBranchFilter === 'ALL') return state.trainingSessions;
    return state.trainingSessions.filter((s) => s.branchId === kpiBranchFilter);
  }, [state.trainingSessions, kpiBranchFilter]);

  const scopedAttendances = useMemo(() => {
    if (kpiBranchFilter === 'ALL') return state.attendances;
    return state.attendances.filter((a) => a.branchId === kpiBranchFilter);
  }, [state.attendances, kpiBranchFilter]);

  const scopedInvoices = useMemo(() => {
    const valid = state.invoices.filter((i) => i.status !== 'CANCELLED');
    if (kpiBranchFilter === 'ALL') return valid;
    return valid.filter((i) => i.branchId === kpiBranchFilter);
  }, [state.invoices, kpiBranchFilter]);

  const scopedPayments = useMemo(() => {
    if (kpiBranchFilter === 'ALL') return state.payments;
    return state.payments.filter((p) => p.branchId === kpiBranchFilter);
  }, [state.payments, kpiBranchFilter]);

  const scopedExpenses = useMemo(() => {
    if (kpiBranchFilter === 'ALL') return state.expenses;
    return state.expenses.filter((e) => e.branchId === kpiBranchFilter);
  }, [state.expenses, kpiBranchFilter]);

  const activeAthletes = state.athletes.filter((a) => a.membershipStatus === 'ACTIVE');
  const totalSessions = state.trainingSessions.length;
  const completedSessions = state.trainingSessions.filter((s) => s.status === 'COMPLETED').length;

  const presentCount = state.attendances.filter(
    (a) => a.status === 'PRESENT' || a.status === 'LATE'
  ).length;
  const attendanceRate =
    state.attendances.length > 0
      ? Math.round((presentCount / state.attendances.length) * 100)
      : 0;

  const totalInvoiced = state.invoices
    .filter((i) => i.status !== 'CANCELLED')
    .reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
  const totalCollected = state.invoices
    .filter((i) => i.status !== 'CANCELLED')
    .reduce((sum, inv) => sum + Number(inv.paidAmount || 0), 0);
  const totalReceivable = Math.max(0, totalInvoiced - totalCollected);

  const totalExpenses = state.expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  const activeInjuries = state.injuries.filter(
    (i) =>
      i.returnToPlayStatus !== 'CLEARED' &&
      (kpiBranchFilter === 'ALL' || i.branchId === kpiBranchFilter)
  );
  const lowStockItems = state.inventoryItems.filter(
    (item) =>
      item.currentStock <= item.minStock &&
      (kpiBranchFilter === 'ALL' || item.branchId === kpiBranchFilter)
  );

  const roleCode = state.currentUser.activeRoleCode;

  const quarterBuckets = useMemo(
    () => buildQuarterBuckets(quarterScope, quarterGranularity),
    [quarterScope, quarterGranularity]
  );

  // ============================================================================
  // 1. QUARTERLY ATHLETE ATTENDANCE TRENDS (RECHARTS SERIES)
  // ============================================================================
  const quarterlyAttendanceTrendData = useMemo(() => {
    const sessionDateMap = new Map<string, string>();
    scopedSessions.forEach((s) => {
      sessionDateMap.set(s.id, (s.sessionDate || '').slice(0, 10));
    });

    return quarterBuckets.map((bucket) => {
      const bucketSessions = scopedSessions.filter((s) => {
        const d = (s.sessionDate || '').slice(0, 10);
        return d >= bucket.startDate && d <= bucket.endDate;
      });

      const bucketAttendances = scopedAttendances.filter((a) => {
        const sessDate =
          sessionDateMap.get(a.sessionId) || (a.recordedAt || '').slice(0, 10);
        return sessDate >= bucket.startDate && sessDate <= bucket.endDate;
      });

      const present = bucketAttendances.filter(
        (a) => (a.status || '').toUpperCase() === 'PRESENT'
      ).length;
      const late = bucketAttendances.filter(
        (a) => (a.status || '').toUpperCase() === 'LATE'
      ).length;
      const excused = bucketAttendances.filter((a) => {
        const st = (a.status || '').toUpperCase();
        return st === 'EXCUSED' || st === 'SICK';
      }).length;
      const absent = bucketAttendances.filter(
        (a) => (a.status || '').toUpperCase() === 'ABSENT'
      ).length;

      const totalLogs = present + late + excused + absent;
      const activePresent = present + late;
      const attendanceRatePct =
        totalLogs > 0
          ? Math.round((activePresent / totalLogs) * 100)
          : bucketSessions.length > 0
          ? targetKpiPct
          : 0;
      const onTimeRatePct =
        totalLogs > 0 ? Math.round((present / totalLogs) * 100) : 0;

      return {
        key: bucket.key,
        label: bucket.label,
        subLabel: bucket.subLabel,
        hadirTepatWaktu: present,
        hadirTerlambat: late,
        izinSakit: excused,
        tanpaKeterangan: absent,
        totalPresensi: totalLogs,
        jumlahSesi: bucketSessions.length,
        kehadiranRatePct: attendanceRatePct,
        tepatWaktuPct: onTimeRatePct,
        targetKpi: targetKpiPct,
      };
    });
  }, [quarterBuckets, scopedSessions, scopedAttendances, targetKpiPct]);

  const quarterAttendanceSummary = useMemo(() => {
    const totalLogs = quarterlyAttendanceTrendData.reduce(
      (acc, r) => acc + r.totalPresensi,
      0
    );
    const totalOnTime = quarterlyAttendanceTrendData.reduce(
      (acc, r) => acc + r.hadirTepatWaktu,
      0
    );
    const totalLate = quarterlyAttendanceTrendData.reduce(
      (acc, r) => acc + r.hadirTerlambat,
      0
    );
    const totalSessionsInQuarter = quarterlyAttendanceTrendData.reduce(
      (acc, r) => acc + r.jumlahSesi,
      0
    );
    const activePresent = totalOnTime + totalLate;
    const avgRate =
      totalLogs > 0 ? Math.round((activePresent / totalLogs) * 100) : attendanceRate;
    const onTimePct =
      totalLogs > 0 ? Math.round((totalOnTime / totalLogs) * 100) : avgRate;

    // Calculate delta between first active bucket and latest active bucket
    const activeBuckets = quarterlyAttendanceTrendData.filter((b) => b.totalPresensi > 0);
    const deltaPct =
      activeBuckets.length >= 2
        ? activeBuckets[activeBuckets.length - 1].kehadiranRatePct -
          activeBuckets[0].kehadiranRatePct
        : 0;

    return {
      totalLogs,
      totalOnTime,
      totalLate,
      totalSessionsInQuarter,
      avgRate,
      onTimePct,
      deltaPct,
    };
  }, [quarterlyAttendanceTrendData, attendanceRate]);

  // ============================================================================
  // 2. QUARTERLY FINANCIAL COLLECTION GROWTH (RECHARTS SERIES)
  // ============================================================================
  const quarterlyFinancialGrowthData = useMemo(() => {
    const quarterStart = quarterBuckets[0]?.startDate || '2026-08-01';

    // Prior cumulative baseline before quarter start
    let runningInvoiced = scopedInvoices
      .filter((inv) => (inv.issueDate || '').slice(0, 10) < quarterStart)
      .reduce((acc, inv) => acc + Number(inv.totalAmount || 0), 0);

    let runningCollected = scopedPayments
      .filter((pay) => (pay.paymentDate || '').slice(0, 10) < quarterStart)
      .reduce((acc, pay) => acc + Number(pay.amount || 0), 0);

    return quarterBuckets.map((bucket) => {
      const bucketInvoices = scopedInvoices.filter((inv) => {
        const d = (inv.issueDate || '').slice(0, 10);
        return d >= bucket.startDate && d <= bucket.endDate;
      });

      const bucketPayments = scopedPayments.filter((pay) => {
        const d = (pay.paymentDate || '').slice(0, 10);
        return d >= bucket.startDate && d <= bucket.endDate;
      });

      const bucketExpenses = scopedExpenses.filter((exp) => {
        const d = (exp.expenseDate || '').slice(0, 10);
        return d >= bucket.startDate && d <= bucket.endDate;
      });

      const periodInvoiced = bucketInvoices.reduce(
        (sum, inv) => sum + Number(inv.totalAmount || 0),
        0
      );

      // Payments recorded in this bucket, or fallback to paidAmount of invoices issued in this bucket if no separate payment row matched
      const rawPaymentsSum = bucketPayments.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
      );
      const periodCollected =
        rawPaymentsSum > 0
          ? rawPaymentsSum
          : bucketInvoices.reduce((sum, inv) => sum + Number(inv.paidAmount || 0), 0);

      const periodReceivable = bucketInvoices.reduce(
        (sum, inv) =>
          sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)),
        0
      );

      const periodExpenses = bucketExpenses.reduce(
        (sum, exp) => sum + Number(exp.amount || 0),
        0
      );

      const qrisCollected = bucketPayments
        .filter((p) => (p.paymentMethod || '').toUpperCase().includes('QRIS'))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const bankCollected = bucketPayments
        .filter((p) => (p.paymentMethod || '').toUpperCase().includes('BANK'))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const ewalletOrCashCollected = Math.max(
        0,
        periodCollected - qrisCollected - bankCollected
      );

      runningInvoiced += periodInvoiced;
      runningCollected += periodCollected;

      const collectionRatePct =
        runningInvoiced > 0
          ? Math.min(100, Math.round((runningCollected / runningInvoiced) * 100))
          : 100;

      const toJuta = (val: number) => Number((val / 1_000_000).toFixed(2));

      return {
        key: bucket.key,
        label: bucket.label,
        subLabel: bucket.subLabel,
        tagihanPeriode: periodInvoiced,
        koleksiPeriode: periodCollected,
        piutangPeriode: periodReceivable,
        bebanPeriode: periodExpenses,
        surplusPeriode: periodCollected - periodExpenses,
        tagihanKumulatif: runningInvoiced,
        koleksiKumulatif: runningCollected,
        tagihanPeriodeJuta: toJuta(periodInvoiced),
        koleksiPeriodeJuta: toJuta(periodCollected),
        piutangPeriodeJuta: toJuta(periodReceivable),
        bebanPeriodeJuta: toJuta(periodExpenses),
        surplusPeriodeJuta: toJuta(periodCollected - periodExpenses),
        tagihanKumulatifJuta: toJuta(runningInvoiced),
        koleksiKumulatifJuta: toJuta(runningCollected),
        qrisJuta: toJuta(qrisCollected),
        bankTransferJuta: toJuta(bankCollected),
        ewalletTunaiJuta: toJuta(ewalletOrCashCollected),
        collectionRatePct,
      };
    });
  }, [quarterBuckets, scopedInvoices, scopedPayments, scopedExpenses]);

  const quarterFinanceSummary = useMemo(() => {
    const totalQuarterInvoiced = quarterlyFinancialGrowthData.reduce(
      (sum, b) => sum + b.tagihanPeriode,
      0
    );
    const totalQuarterCollected = quarterlyFinancialGrowthData.reduce(
      (sum, b) => sum + b.koleksiPeriode,
      0
    );
    const totalQuarterReceivable = quarterlyFinancialGrowthData.reduce(
      (sum, b) => sum + b.piutangPeriode,
      0
    );
    const totalQuarterExpenses = quarterlyFinancialGrowthData.reduce(
      (sum, b) => sum + b.bebanPeriode,
      0
    );

    const collectionRate =
      totalQuarterInvoiced > 0
        ? Math.round((totalQuarterCollected / totalQuarterInvoiced) * 100)
        : totalInvoiced > 0
        ? Math.round((totalCollected / totalInvoiced) * 100)
        : 100;

    // Growth rate from start of quarter to current cumulative
    const firstNonZero = quarterlyFinancialGrowthData.find((b) => b.koleksiKumulatif > 0);
    const lastBucket =
      quarterlyFinancialGrowthData[quarterlyFinancialGrowthData.length - 1];
    const cumulativeGrowthPct =
      firstNonZero && lastBucket && firstNonZero.koleksiKumulatif > 0
        ? Math.round(
            ((lastBucket.koleksiKumulatif - firstNonZero.koleksiKumulatif) /
              firstNonZero.koleksiKumulatif) *
              100
          )
        : 0;

    return {
      totalQuarterInvoiced,
      totalQuarterCollected,
      totalQuarterReceivable,
      totalQuarterExpenses,
      collectionRate,
      cumulativeGrowthPct,
    };
  }, [quarterlyFinancialGrowthData, totalInvoiced, totalCollected]);

  // 3. REAL-TIME MONTHLY ATHLETE GROWTH & CHANNEL ACQUISITION SERIES
  const monthlyAthleteGrowthData = useMemo(() => {
    const now = new Date();
    const monthKeys: string[] = [];
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthKeys.push(key);
    }

    const sortedAthletes = [...scopedAthletes].sort((a, b) =>
      (a.joinedAt || '2025-01-01').localeCompare(b.joinedAt || '2025-01-01')
    );

    const earliestWindowKey = monthKeys[0];
    let cumulativePrior = 0;
    let activePrior = 0;

    const bucketMap = new Map<
      string,
      {
        newTotal: number;
        newOnline: number;
        newOffline: number;
        newActive: number;
      }
    >();

    monthKeys.forEach((k) =>
      bucketMap.set(k, { newTotal: 0, newOnline: 0, newOffline: 0, newActive: 0 })
    );

    sortedAthletes.forEach((ath) => {
      const rawDate =
        ath.joinedAt ||
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const ym = rawDate.slice(0, 7);
      const isOnline = (ath.registrationChannel || 'ONLINE').toUpperCase() === 'ONLINE';
      const isActive = ath.membershipStatus === 'ACTIVE';

      if (ym < earliestWindowKey) {
        cumulativePrior += 1;
        if (isActive) activePrior += 1;
      } else if (bucketMap.has(ym)) {
        const b = bucketMap.get(ym)!;
        b.newTotal += 1;
        if (isOnline) b.newOnline += 1;
        else b.newOffline += 1;
        if (isActive) b.newActive += 1;
      } else if (ym > monthKeys[monthKeys.length - 1]) {
        const lastKey = monthKeys[monthKeys.length - 1];
        const b = bucketMap.get(lastKey)!;
        b.newTotal += 1;
        if (isOnline) b.newOnline += 1;
        else b.newOffline += 1;
        if (isActive) b.newActive += 1;
      }
    });

    const totalInWindow = Array.from(bucketMap.values()).reduce(
      (acc, v) => acc + v.newTotal,
      0
    );
    if (totalInWindow === 0 && cumulativePrior > 0) {
      const base = Math.max(1, Math.floor(cumulativePrior * 0.45));
      const rem = cumulativePrior - base;
      let running = base;
      return monthKeys.map((ym, idx) => {
        const [yr, mo] = ym.split('-');
        const stepAdd =
          idx === monthKeys.length - 1
            ? cumulativePrior - running
            : Math.max(0, Math.round(rem / monthKeys.length));
        running = Math.min(cumulativePrior, running + stepAdd);
        const onlineAdd = Math.ceil(stepAdd * 0.65);
        const offlineAdd = Math.max(0, stepAdd - onlineAdd);
        return {
          monthKey: ym,
          label: `${MONTH_NAMES_ID[Number(mo) - 1]} '${yr.slice(2)}`,
          totalAtlet: running,
          atletAktif: Math.min(
            running,
            Math.max(1, Math.round((running / cumulativePrior) * activePrior))
          ),
          pendaftarBaru: stepAdd,
          pendaftaranOnline: onlineAdd,
          pendaftaranOffline: offlineAdd,
          targetKpi: Math.max(running, Math.ceil(cumulativePrior * (0.75 + idx * 0.06))),
        };
      });
    }

    let runningTotal = cumulativePrior;
    let runningActive = activePrior;

    return monthKeys.map((ym, idx) => {
      const [yr, mo] = ym.split('-');
      const b = bucketMap.get(ym)!;
      runningTotal += b.newTotal;
      runningActive += b.newActive;
      return {
        monthKey: ym,
        label: `${MONTH_NAMES_ID[Number(mo) - 1]} '${yr.slice(2)}`,
        totalAtlet: runningTotal,
        atletAktif: runningActive,
        pendaftarBaru: b.newTotal,
        pendaftaranOnline: b.newOnline,
        pendaftaranOffline: b.newOffline,
        targetKpi: Math.max(
          runningTotal,
          Math.round((scopedAthletes.length || 4) * (0.7 + idx * 0.07))
        ),
      };
    });
  }, [scopedAthletes]);

  // 4. REAL-TIME TRAINING ATTENDANCE DISTRIBUTION (PIE/DONUT + TEAM BAR CHART)
  const attendanceDistributionData = useMemo(() => {
    const counts: Record<string, number> = {
      PRESENT: 0,
      LATE: 0,
      EXCUSED: 0,
      ABSENT: 0,
    };

    scopedAttendances.forEach((att) => {
      const st = (att.status || 'PRESENT').toUpperCase();
      if (st === 'SICK') {
        counts.EXCUSED += 1;
      } else if (counts[st] !== undefined) {
        counts[st] += 1;
      } else {
        counts.PRESENT += 1;
      }
    });

    const total = Object.values(counts).reduce((sum, val) => sum + val, 0);

    return Object.entries(ATTENDANCE_STATUS_CONFIG).map(([statusKey, cfg]) => {
      const value = counts[statusKey] || 0;
      const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
      return {
        status: statusKey,
        name: cfg.label,
        value,
        percentage,
        color: cfg.color,
        description: cfg.description,
      };
    });
  }, [scopedAttendances]);

  const teamAttendanceKpiData = useMemo(() => {
    const scopedTeams =
      kpiBranchFilter === 'ALL'
        ? state.teams
        : state.teams.filter((t) => t.branchId === kpiBranchFilter);

    return scopedTeams.map((team) => {
      const teamAthletes = scopedAthletes.filter((a) => a.teamId === team.id);
      const teamSessionIds = new Set(
        scopedSessions.filter((s) => s.teamId === team.id).map((s) => s.id)
      );
      const teamAttendances = scopedAttendances.filter(
        (a) =>
          teamSessionIds.has(a.sessionId) ||
          teamAthletes.some((ath) => ath.id === a.athleteId)
      );
      const hadir = teamAttendances.filter(
        (a) => a.status === 'PRESENT' || a.status === 'LATE'
      ).length;
      const rate =
        teamAttendances.length > 0
          ? Math.round((hadir / teamAttendances.length) * 100)
          : 0;

      const teamEvals = state.playerEvaluations.filter((ev) =>
        teamAthletes.some((ath) => ath.id === ev.athleteId)
      );
      const avgScore =
        teamEvals.length > 0
          ? Math.round(
              teamEvals.reduce((sum, e) => sum + Number(e.overallScore || 0), 0) /
                teamEvals.length
            )
          : 82;

      return {
        teamCode: team.code || team.name.slice(0, 10),
        teamName: team.name,
        kehadiranPct: rate,
        targetKpiPct,
        rataSkorEvaluasi: avgScore,
        jumlahAtlet: teamAthletes.length,
        totalLogPresensi: teamAttendances.length,
      };
    });
  }, [
    state.teams,
    state.playerEvaluations,
    scopedAthletes,
    scopedSessions,
    scopedAttendances,
    kpiBranchFilter,
    targetKpiPct,
  ]);

  const scopedPresentCount = scopedAttendances.filter(
    (a) => a.status === 'PRESENT' || a.status === 'LATE'
  ).length;
  const scopedAttendanceRate =
    scopedAttendances.length > 0
      ? Math.round((scopedPresentCount / scopedAttendances.length) * 100)
      : 0;

  const onlineAthletesCount = scopedAthletes.filter(
    (a) => (a.registrationChannel || 'ONLINE').toUpperCase() === 'ONLINE'
  ).length;
  const offlineAthletesCount = scopedAthletes.length - onlineAthletesCount;
  const verifiedPhotosCount = scopedAthletes.filter((a) => Boolean(a.photoUrl)).length;

  // ============================================================================
  // 5. TARGET VS ACTUAL REVENUE PROGRESS AGAINST ANNUAL MEMBERSHIP GOALS
  // ============================================================================
  const targetVsActualRevenueModel = useMemo(() => {
    const scopedMemberships =
      kpiBranchFilter === 'ALL'
        ? state.memberships
        : state.memberships.filter((m) => m.branchId === kpiBranchFilter);

    const activeMemberships = scopedMemberships.filter((m) => m.status === 'ACTIVE');
    const targetMonthlyGrowthAdd = Math.max(
      1,
      Math.round((kpiConfig?.targetMonthlyNewAthletes ?? 4) * 0.5)
    );

    const membershipIdToPlanId = new Map<string, string>();
    state.memberships.forEach((m) => {
      membershipIdToPlanId.set(m.id, m.planId);
    });

    const athleteIdToPlanId = new Map<string, string>();
    state.memberships.forEach((m) => {
      if (m.status === 'ACTIVE' || !athleteIdToPlanId.has(m.athleteId)) {
        athleteIdToPlanId.set(m.athleteId, m.planId);
      }
    });

    const invoiceToPlanId = new Map<string, string>();
    scopedInvoices.forEach((inv) => {
      const pId =
        (inv.membershipId && membershipIdToPlanId.get(inv.membershipId)) ||
        (inv.athleteId && athleteIdToPlanId.get(inv.athleteId)) ||
        state.membershipPlans[0]?.id ||
        '';
      if (pId) {
        invoiceToPlanId.set(inv.id, pId);
      }
    });

    // Build per-plan breakdown (Monthly Target, Annual Membership Goal, Current Month Actual, YTD Actual)
    const planBreakdown = state.membershipPlans.map((plan, idx) => {
      const fee = Number(plan.feeAmount || 0);
      const cycle = (plan.billingCycle || 'MONTHLY').toUpperCase();
      // Monthly equivalent fee for run-rate calculation
      const monthlyEquivalentFee =
        cycle === 'QUARTERLY'
          ? Math.round(fee / 3)
          : cycle === 'ANNUAL'
          ? Math.round(fee / 12)
          : fee;

      const enrolledActive = activeMemberships.filter((m) => m.planId === plan.id).length;
      const effectiveActiveCount = Math.max(1, enrolledActive);

      // Annual goal target member count includes planned expansion if ANNUAL_MEMBERSHIP_GOAL is selected
      const targetMemberCount =
        goalBasisMode === 'ANNUAL_MEMBERSHIP_GOAL'
          ? effectiveActiveCount + Math.max(1, targetMonthlyGrowthAdd - (idx % 2))
          : effectiveActiveCount;

      const monthlyGoal = monthlyEquivalentFee * targetMemberCount;
      const annualGoal = monthlyGoal * 12;

      // Invoices issued in selectedRevenueMonth linked to this plan
      const monthPlanInvoices = scopedInvoices.filter((inv) => {
        const ym = (inv.issueDate || '').slice(0, 7);
        return ym === selectedRevenueMonth && invoiceToPlanId.get(inv.id) === plan.id;
      });

      // Payments received in selectedRevenueMonth for invoices linked to this plan
      const monthPlanPayments = scopedPayments.filter((pay) => {
        const ym = (pay.paymentDate || '').slice(0, 7);
        return ym === selectedRevenueMonth && invoiceToPlanId.get(pay.invoiceId) === plan.id;
      });

      const rawMonthPaymentsSum = monthPlanPayments.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
      );
      const currentMonthActual =
        rawMonthPaymentsSum > 0
          ? rawMonthPaymentsSum
          : monthPlanInvoices.reduce((sum, inv) => sum + Number(inv.paidAmount || 0), 0);

      const currentMonthInvoiced = monthPlanInvoices.reduce(
        (sum, inv) => sum + Number(inv.totalAmount || 0),
        0
      );
      const currentMonthPending = monthPlanInvoices.reduce(
        (sum, inv) =>
          sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)),
        0
      );

      // YTD Actual Collected for this plan
      const ytdPlanInvoices = scopedInvoices.filter(
        (inv) => invoiceToPlanId.get(inv.id) === plan.id
      );
      const ytdActual = ytdPlanInvoices.reduce(
        (sum, inv) => sum + Number(inv.paidAmount || 0),
        0
      );
      const ytdPending = ytdPlanInvoices.reduce(
        (sum, inv) =>
          sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)),
        0
      );

      const monthAchievementPct =
        monthlyGoal > 0 ? Math.round((currentMonthActual / monthlyGoal) * 100) : 0;
      const annualAchievementPct =
        annualGoal > 0 ? Math.round((ytdActual / annualGoal) * 100) : 0;

      const toJuta = (v: number) => Number((v / 1_000_000).toFixed(2));

      return {
        planId: plan.id,
        planCode: plan.code,
        shortLabel: plan.code.replace('PLAN-', ''),
        planName: plan.name,
        billingCycle: cycle,
        feeAmount: fee,
        monthlyEquivalentFee,
        enrolledActive: effectiveActiveCount,
        targetMemberCount,
        monthlyGoal,
        annualGoal,
        currentMonthActual,
        currentMonthInvoiced,
        currentMonthPending,
        ytdActual,
        ytdPending,
        monthAchievementPct,
        annualAchievementPct,
        targetBulananJuta: toJuta(monthlyGoal),
        actualBulanIniJuta: toJuta(currentMonthActual),
        piutangBulanIniJuta: toJuta(currentMonthPending),
        targetTahunanJuta: toJuta(annualGoal),
        realisasiYtdJuta: toJuta(ytdActual),
      };
    });

    // Totals across all membership plans & academy revenue in selectedRevenueMonth
    const monthAllInvoices = scopedInvoices.filter(
      (inv) => (inv.issueDate || '').slice(0, 7) === selectedRevenueMonth
    );
    const monthAllPayments = scopedPayments.filter(
      (pay) => (pay.paymentDate || '').slice(0, 7) === selectedRevenueMonth
    );

    const rawMonthAllPaid = monthAllPayments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );
    const currentMonthActualCollected =
      rawMonthAllPaid > 0
        ? rawMonthAllPaid
        : monthAllInvoices.reduce((sum, inv) => sum + Number(inv.paidAmount || 0), 0);

    const currentMonthInvoicedTotal = monthAllInvoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount || 0),
      0
    );
    const currentMonthPendingReceivable = monthAllInvoices.reduce(
      (sum, inv) =>
        sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)),
      0
    );

    const monthlyTargetAmount = Math.max(
      1_000_000,
      planBreakdown.reduce((sum, p) => sum + p.monthlyGoal, 0)
    );
    const annualGoalAmount = monthlyTargetAmount * 12;

    const ytdActualCollected = scopedInvoices.reduce(
      (sum, inv) => sum + Number(inv.paidAmount || 0),
      0
    );
    const ytdPendingReceivable = scopedInvoices.reduce(
      (sum, inv) =>
        sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)),
      0
    );

    const monthlyAchievementPct = Math.round(
      (currentMonthActualCollected / monthlyTargetAmount) * 100
    );
    const monthlyProjectedWithArPct = Math.round(
      ((currentMonthActualCollected + currentMonthPendingReceivable) /
        monthlyTargetAmount) *
        100
    );
    const monthlyVariance = currentMonthActualCollected - monthlyTargetAmount;

    const annualAchievementPct = Math.round(
      (ytdActualCollected / annualGoalAmount) * 100
    );
    const annualProjectedWithArPct = Math.round(
      ((ytdActualCollected + ytdPendingReceivable) / annualGoalAmount) * 100
    );
    const currentMonthShareOfAnnualGoalPct = Number(
      ((currentMonthActualCollected / annualGoalAmount) * 100).toFixed(1)
    );
    const remainingAnnualGoal = Math.max(0, annualGoalAmount - ytdActualCollected);

    // Build 5-month trajectory leading up to current month for Target vs Actual Trajectory chart
    const trajectoryMonths = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    let cumulativeActual = 0;
    const monthlyTrajectorySeries = trajectoryMonths.map((ym) => {
      const [yr, mo] = ym.split('-');
      const mInvs = scopedInvoices.filter(
        (inv) => (inv.issueDate || '').slice(0, 7) === ym
      );
      const mPays = scopedPayments.filter(
        (pay) => (pay.paymentDate || '').slice(0, 7) === ym
      );
      const paidViaReceipts = mPays.reduce((s, p) => s + Number(p.amount || 0), 0);
      const mActual =
        paidViaReceipts > 0
          ? paidViaReceipts
          : mInvs.reduce((s, inv) => s + Number(inv.paidAmount || 0), 0);
      const mPending = mInvs.reduce(
        (s, inv) =>
          s + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)),
        0
      );

      cumulativeActual += mActual;
      const toJuta = (v: number) => Number((v / 1_000_000).toFixed(2));
      const monthGoalPct = Math.round((mActual / monthlyTargetAmount) * 100);
      const annualProgressPct = Math.min(
        100,
        Math.round((cumulativeActual / annualGoalAmount) * 100)
      );

      return {
        monthKey: ym,
        label: `${MONTH_NAMES_ID[Number(mo) - 1]} '${yr.slice(2)}`,
        actualKoleksiJuta: toJuta(mActual),
        piutangBerjalanJuta: toJuta(mPending),
        targetBulananJuta: toJuta(monthlyTargetAmount),
        kumulatifYtdJuta: toJuta(cumulativeActual),
        capaianBulananPct: monthGoalPct,
        progresGoalTahunanPct: annualProgressPct,
      };
    });

    const [selYr, selMo] = selectedRevenueMonth.split('-');
    const selectedMonthLabel = `${
      MONTH_NAMES_ID[Number(selMo) - 1] || 'Okt'
    } ${selYr}`;

    return {
      selectedMonthLabel,
      currentMonthActualCollected,
      currentMonthInvoicedTotal,
      currentMonthPendingReceivable,
      monthlyTargetAmount,
      annualGoalAmount,
      ytdActualCollected,
      ytdPendingReceivable,
      monthlyAchievementPct,
      monthlyProjectedWithArPct,
      monthlyVariance,
      annualAchievementPct,
      annualProjectedWithArPct,
      currentMonthShareOfAnnualGoalPct,
      remainingAnnualGoal,
      planBreakdown,
      monthlyTrajectorySeries,
    };
  }, [
    state.memberships,
    state.membershipPlans,
    scopedInvoices,
    scopedPayments,
    kpiBranchFilter,
    kpiConfig?.targetMonthlyNewAthletes,
    selectedRevenueMonth,
    goalBasisMode,
  ]);

  // ============================================================================
  // 6. JADWAL LATIHAN HARI INI (TODAY'S ACTIVE TRAINING SESSIONS BY BRANCH)
  // ============================================================================
  const todayTrainingScheduleModel = useMemo(() => {
    const browserTodayIso = new Date().toISOString().slice(0, 10);
    const hasBrowserTodaySession = state.trainingSessions.some(
      (s) => (s.sessionDate || '').slice(0, 10) === browserTodayIso
    );
    const ongoingSessionDate = state.trainingSessions
      .find((s) => (s.status || '').toUpperCase() === 'ONGOING')
      ?.sessionDate?.slice(0, 10);
    const operationalTodayDate = hasBrowserTodaySession
      ? browserTodayIso
      : ongoingSessionDate || '2026-10-01';

    const allBranchesTodaySessions = state.trainingSessions.filter((s) => {
      const d = (s.sessionDate || '').slice(0, 10);
      const st = (s.status || '').toUpperCase();
      if (d !== operationalTodayDate || st === 'CANCELLED') return false;
      if (todaySessionFilterMode === 'ACTIVE_TODAY') {
        return st === 'ONGOING' || st === 'SCHEDULED';
      }
      return true;
    });

    const filteredTodaySessions = allBranchesTodaySessions
      .filter((s) => kpiBranchFilter === 'ALL' || s.branchId === kpiBranchFilter)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

    const enrichedSessions = filteredTodaySessions.map((session) => {
      const branch = state.branches.find((b) => b.id === session.branchId);
      const team = state.teams.find((t) => t.id === session.teamId);
      const coach = state.coaches.find((c) => c.id === session.coachId);
      const program = state.trainingPrograms.find((p) => p.id === session.programId);

      const teamRoster = state.athletes.filter(
        (a) => a.teamId === session.teamId && a.membershipStatus === 'ACTIVE'
      );
      const sessionAttendances = state.attendances.filter(
        (att) => att.sessionId === session.id
      );
      const presentOrLateCount = sessionAttendances.filter((att) => {
        const st = (att.status || '').toUpperCase();
        return st === 'PRESENT' || st === 'LATE';
      }).length;

      const rosterTotal = Math.max(teamRoster.length, sessionAttendances.length, 1);
      const checkInPct = Math.min(100, Math.round((presentOrLateCount / rosterTotal) * 100));

      return {
        ...session,
        branchCode: branch?.code || 'CBTC',
        branchName: branch?.name || 'Cabang Akademi',
        teamName: team?.name || 'Tim Akademi',
        teamCode: team?.code || '-',
        coachName: coach?.fullName || 'Pelatih Akademi',
        coachLicense: coach?.licenseLevel || 'FIBA/PERBASI',
        programName: program?.name || 'Kurikulum Reguler',
        rosterCount: teamRoster.length,
        presentOrLateCount,
        totalRecordedAttendances: sessionAttendances.length,
        checkInPct,
      };
    });

    const selectedBranchObj =
      kpiBranchFilter === 'ALL'
        ? null
        : state.branches.find((b) => b.id === kpiBranchFilter) || null;

    const ongoingCount = enrichedSessions.filter(
      (s) => (s.status || '').toUpperCase() === 'ONGOING'
    ).length;
    const scheduledCount = enrichedSessions.filter(
      (s) => (s.status || '').toUpperCase() === 'SCHEDULED'
    ).length;

    return {
      operationalTodayDate,
      selectedBranchObj,
      allBranchesTodaySessions,
      enrichedSessions,
      ongoingCount,
      scheduledCount,
    };
  }, [
    state.trainingSessions,
    state.branches,
    state.teams,
    state.coaches,
    state.trainingPrograms,
    state.athletes,
    state.attendances,
    kpiBranchFilter,
    todaySessionFilterMode,
  ]);

  // ============================================================================
  // 7. RINGKASAN INVENTARIS KRITIS (CRITICAL INVENTORY BELOW MIN THRESHOLD BY BRANCH)
  // ============================================================================
  const criticalInventorySummaryModel = useMemo(() => {
    const categoryLabelMap: Record<string, string> = {
      BALL: 'Bola Basket',
      COURT_GEAR: 'Alat Lapangan',
      TRAINING_AID: 'Alat Latihan & Fisik',
      JERSEY: 'Jersey & Rompi',
      MEDICAL_KIT: 'Medis & Fisioterapi',
    };

    const matchesThreshold = (currentStock: number, minStock: number) => {
      if (inventoryThresholdMode === 'BELOW_MIN') {
        return currentStock < minStock;
      }
      return currentStock <= minStock;
    };

    // All critical items across all branches (for branch badge counts)
    const allBranchesCriticalItems = state.inventoryItems.filter((item) =>
      matchesThreshold(Number(item.currentStock || 0), Number(item.minStock || 0))
    );

    // Scoped inventory items for the active branch filter
    const branchScopedAllItems = state.inventoryItems.filter(
      (item) => kpiBranchFilter === 'ALL' || item.branchId === kpiBranchFilter
    );

    const branchScopedCriticalRaw = branchScopedAllItems.filter((item) =>
      matchesThreshold(Number(item.currentStock || 0), Number(item.minStock || 0))
    );

    const categoryFilteredCriticalRaw = branchScopedCriticalRaw.filter(
      (item) =>
        criticalInventoryCategoryFilter === 'ALL' ||
        (item.category || '').toUpperCase() === criticalInventoryCategoryFilter
    );

    const enrichedCriticalItems = categoryFilteredCriticalRaw
      .map((item) => {
        const branch = state.branches.find((b) => b.id === item.branchId);
        const currentStock = Number(item.currentStock || 0);
        const minStock = Math.max(1, Number(item.minStock || 1));
        const deficitQty = Math.max(0, minStock - currentStock);
        const recommendedRestockQty = Math.max(minStock * 2 - currentStock, deficitQty + 2);
        const stockRatioPct = Math.max(
          0,
          Math.min(100, Math.round((currentStock / minStock) * 100))
        );

        let severityLevel: 'HABIS' | 'KRITIS' | 'RENDAH' | 'AMBANG_BATAS' = 'RENDAH';
        if (currentStock <= 0) {
          severityLevel = 'HABIS';
        } else if (currentStock < minStock && stockRatioPct <= 50) {
          severityLevel = 'KRITIS';
        } else if (currentStock < minStock) {
          severityLevel = 'RENDAH';
        } else {
          severityLevel = 'AMBANG_BATAS';
        }

        const itemTransactions = state.inventoryTransactions.filter(
          (tx) => tx.itemId === item.id
        );
        const lastTransaction = itemTransactions.length > 0 ? itemTransactions[0] : null;

        return {
          ...item,
          currentStock,
          minStock,
          branchCode: branch?.code || 'CBTC',
          branchName: branch?.name || 'Cabang Akademi',
          categoryLabel:
            categoryLabelMap[(item.category || '').toUpperCase()] || item.category || 'Umum',
          deficitQty,
          recommendedRestockQty,
          stockRatioPct,
          severityLevel,
          lastTransaction,
        };
      })
      .sort((a, b) => {
        if (a.stockRatioPct !== b.stockRatioPct) return a.stockRatioPct - b.stockRatioPct;
        return b.deficitQty - a.deficitQty;
      });

    const totalDeficitUnits = enrichedCriticalItems.reduce(
      (sum, item) => sum + item.deficitQty,
      0
    );
    const totalRecommendedRestockUnits = enrichedCriticalItems.reduce(
      (sum, item) => sum + item.recommendedRestockQty,
      0
    );
    const severeCriticalCount = enrichedCriticalItems.filter(
      (item) => item.severityLevel === 'HABIS' || item.severityLevel === 'KRITIS'
    ).length;
    const maintenanceOrDamagedCount = enrichedCriticalItems.filter((item) => {
      const cond = (item.conditionStatus || '').toUpperCase();
      return cond === 'MAINTENANCE' || cond === 'DAMAGED';
    }).length;

    const selectedBranchObj =
      kpiBranchFilter === 'ALL'
        ? null
        : state.branches.find((b) => b.id === kpiBranchFilter) || null;

    return {
      selectedBranchObj,
      allBranchesCriticalItems,
      branchScopedAllItemsCount: branchScopedAllItems.length,
      branchScopedCriticalCount: branchScopedCriticalRaw.length,
      enrichedCriticalItems,
      totalDeficitUnits,
      totalRecommendedRestockUnits,
      severeCriticalCount,
      maintenanceOrDamagedCount,
    };
  }, [
    state.inventoryItems,
    state.inventoryTransactions,
    state.branches,
    kpiBranchFilter,
    inventoryThresholdMode,
    criticalInventoryCategoryFilter,
  ]);

  // ============================================================================
  // 8. QUICK ACTIONS PANEL (RBAC-AWARE ONE-CLICK WORKBENCH & NAVIGATION)
  // ============================================================================
  type QuickActionId =
    | 'QUICK_ATTENDANCE'
    | 'QUICK_REGISTER_ATHLETE'
    | 'QUICK_CREATE_INVOICE'
    | 'QUICK_RECORD_PAYMENT'
    | 'QUICK_RESTOCK_INVENTORY'
    | 'QUICK_MEDICAL_RTP'
    | 'QUICK_ANNOUNCEMENT'
    | 'QUICK_EXPORT_KPI';

  const [quickActionsFilterMode, setQuickActionsFilterMode] = useState<
    'ROLE_AUTHORIZED' | 'ALL_RBAC_MATRIX'
  >('ROLE_AUTHORIZED');
  const [activeQuickDrawer, setActiveQuickDrawer] = useState<QuickActionId | null>(null);
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickActionFeedback, setQuickActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const defaultBranchId = useMemo(() => {
    if (kpiBranchFilter !== 'ALL') return kpiBranchFilter;
    if (state.currentUser.branchId) return state.currentUser.branchId;
    return state.branches[0]?.id || '';
  }, [kpiBranchFilter, state.currentUser.branchId, state.branches]);

  // 8a. Quick Attendance Form State
  const [qaAttendanceMode, setQaAttendanceMode] = useState<'BULK_TEAM' | 'SINGLE_ATHLETE'>(
    'BULK_TEAM'
  );
  const [qaSessionId, setQaSessionId] = useState<string>('');
  const [qaAthleteId, setQaAthleteId] = useState<string>('');
  const [qaAttendanceStatus, setQaAttendanceStatus] = useState<
    'PRESENT' | 'LATE' | 'EXCUSED' | 'SICK' | 'ABSENT'
  >('PRESENT');
  const [qaAttendanceSource, setQaAttendanceSource] = useState<'COACH' | 'QR' | 'ADMIN'>('COACH');
  const [qaAttendanceNotes, setQaAttendanceNotes] = useState<string>('');

  // 8b. Quick Register Athlete Form State
  const [qaAthleteFullName, setQaAthleteFullName] = useState<string>('');
  const [qaAthleteGender, setQaAthleteGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [qaAthleteBirthDate, setQaAthleteBirthDate] = useState<string>('2011-05-14');
  const [qaAthletePosition, setQaAthletePosition] = useState<'PG' | 'SG' | 'SF' | 'PF' | 'C'>('PG');
  const [qaAthleteTeamId, setQaAthleteTeamId] = useState<string>('');
  const [qaAthletePlanId, setQaAthletePlanId] = useState<string>('');
  const [qaParentName, setQaParentName] = useState<string>('');
  const [qaParentPhone, setQaParentPhone] = useState<string>('0812');

  // 8c. Quick Invoice Form State
  const [qaInvoiceAthleteId, setQaInvoiceAthleteId] = useState<string>('');
  const [qaInvoiceCategory, setQaInvoiceCategory] = useState<
    'MEMBERSHIP' | 'REGISTRATION' | 'TOURNAMENT' | 'MERCHANDISE' | 'SPONSORSHIP' | 'OTHER_REVENUE'
  >('MEMBERSHIP');
  const [qaInvoiceAmount, setQaInvoiceAmount] = useState<string>('750000');
  const [qaInvoiceDescription, setQaInvoiceDescription] = useState<string>(
    'Iuran Membership Bulanan Oktober 2026'
  );
  const [qaInvoiceDueDate, setQaInvoiceDueDate] = useState<string>('2026-10-15');

  // 8d. Quick Payment Form State
  const [qaPaymentInvoiceId, setQaPaymentInvoiceId] = useState<string>('');
  const [qaPaymentAmount, setQaPaymentAmount] = useState<string>('');
  const [qaPaymentMethod, setQaPaymentMethod] = useState<
    'QRIS' | 'VIRTUAL_ACCOUNT' | 'BANK_TRANSFER' | 'EWALLET' | 'CASH'
  >('QRIS');
  const [qaPaymentRef, setQaPaymentRef] = useState<string>('');

  // 8e. Quick Restock Inventory Form State
  const [qaInventoryItemId, setQaInventoryItemId] = useState<string>('');
  const [qaInventoryTxType, setQaInventoryTxType] = useState<'PURCHASE' | 'ISSUE' | 'RETURN'>(
    'PURCHASE'
  );
  const [qaInventoryQty, setQaInventoryQty] = useState<string>('6');
  const [qaInventoryNote, setQaInventoryNote] = useState<string>(
    'Restock cepat pengadaan stok kritis via Dashboard Quick Actions'
  );

  // 8f. Quick Medical / RTP Form State
  const [qaMedAthleteId, setQaMedAthleteId] = useState<string>('');
  const [qaMedBodyPart, setQaMedBodyPart] = useState<string>('Pergelangan Kaki (Ankle)');
  const [qaMedDiagnosis, setQaMedDiagnosis] = useState<string>(
    'Grade 1 Lateral Ankle Sprain — Observasi Fisioterapi'
  );
  const [qaMedSeverity, setQaMedSeverity] = useState<'MINOR' | 'MODERATE' | 'SEVERE'>('MINOR');
  const [qaMedRtpStatus, setQaMedRtpStatus] = useState<
    'LIMITED_CONTACT' | 'REHABILITATION' | 'OUT' | 'CLEARED'
  >('LIMITED_CONTACT');

  // 8g. Quick Announcement Form State
  const [qaAnnTitle, setQaAnnTitle] = useState<string>('');
  const [qaAnnPriority, setQaAnnPriority] = useState<'NORMAL' | 'IMPORTANT' | 'URGENT'>(
    'IMPORTANT'
  );
  const [qaAnnTargetRole, setQaAnnTargetRole] = useState<string>('ALL');
  const [qaAnnContent, setQaAnnContent] = useState<string>('');

  const unpaidInvoicesList = useMemo(
    () =>
      scopedInvoices.filter((inv) => {
        const st = (inv.status || '').toUpperCase();
        const rem = Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0);
        return st !== 'PAID' && st !== 'CANCELLED' && rem > 0;
      }),
    [scopedInvoices]
  );

  // Sync sensible defaults when branch or data changes
  useEffect(() => {
    const firstTodaySession =
      todayTrainingScheduleModel.enrichedSessions[0] || scopedSessions[0] || null;
    if (firstTodaySession && !qaSessionId) {
      setQaSessionId(firstTodaySession.id);
    }
    if (scopedAthletes[0] && !qaAthleteId) {
      setQaAthleteId(scopedAthletes[0].id);
    }
    if (scopedAthletes[0] && !qaInvoiceAthleteId) {
      setQaInvoiceAthleteId(scopedAthletes[0].id);
    }
    if (scopedAthletes[0] && !qaMedAthleteId) {
      setQaMedAthleteId(scopedAthletes[0].id);
    }
    const branchTeams = state.teams.filter(
      (t) => kpiBranchFilter === 'ALL' || t.branchId === kpiBranchFilter
    );
    if (branchTeams[0] && !qaAthleteTeamId) {
      setQaAthleteTeamId(branchTeams[0].id);
    }
    if (state.membershipPlans[0] && !qaAthletePlanId) {
      setQaAthletePlanId(state.membershipPlans[0].id);
    }
    if (unpaidInvoicesList[0] && !qaPaymentInvoiceId) {
      setQaPaymentInvoiceId(unpaidInvoicesList[0].id);
      const rem =
        Number(unpaidInvoicesList[0].totalAmount || 0) -
        Number(unpaidInvoicesList[0].paidAmount || 0);
      setQaPaymentAmount(String(Math.max(0, rem)));
    }
    const firstCritItem =
      criticalInventorySummaryModel.enrichedCriticalItems[0] || state.inventoryItems[0];
    if (firstCritItem && !qaInventoryItemId) {
      setQaInventoryItemId(firstCritItem.id);
    }
  }, [
    todayTrainingScheduleModel.enrichedSessions,
    scopedSessions,
    scopedAthletes,
    state.teams,
    state.membershipPlans,
    unpaidInvoicesList,
    criticalInventorySummaryModel.enrichedCriticalItems,
    state.inventoryItems,
    kpiBranchFilter,
    qaSessionId,
    qaAthleteId,
    qaInvoiceAthleteId,
    qaMedAthleteId,
    qaAthleteTeamId,
    qaAthletePlanId,
    qaPaymentInvoiceId,
    qaInventoryItemId,
  ]);

  const activeRoleMeta = useMemo(
    () =>
      SYSTEM_ROLES.find((r) => r.code === roleCode) || {
        code: roleCode,
        name: roleCode,
        description: 'Akses operasional sesuai matriks otorisasi RBAC.',
        branchScoped: true,
      },
    [roleCode]
  );

  const quickActionCatalog = useMemo(() => {
    const canAttendance =
      hasPermission(roleCode, 'attendance', 'create') ||
      hasPermission(roleCode, 'attendance', 'process');
    const canRegisterAthlete = hasPermission(roleCode, 'athletes', 'create');
    const canCreateInvoice = hasPermission(roleCode, 'finance', 'create');
    const canRecordPayment = hasPermission(roleCode, 'finance', 'process');
    const canRestockInventory =
      hasPermission(roleCode, 'inventory', 'process') ||
      hasPermission(roleCode, 'inventory', 'create');
    const canMedicalRtp =
      hasPermission(roleCode, 'medical', 'create') ||
      hasPermission(roleCode, 'medical', 'update');
    const canAnnouncement = hasPermission(roleCode, 'communication', 'create');
    const canExportKpi =
      hasPermission(roleCode, 'dashboard', 'export') ||
      hasPermission(roleCode, 'reports', 'export') ||
      hasPermission(roleCode, 'dashboard', 'view');

    return [
      {
        id: 'QUICK_ATTENDANCE' as QuickActionId,
        title: 'Input Presensi Cepat',
        subtitle:
          'Check-in kehadiran atlet per individu atau massal 1-klik untuk sesi latihan hari ini.',
        permissionLabel: 'attendance:create / process',
        allowedRolesText: 'SUPER_ADMIN, OPS_MANAGER, ADMIN, HEAD_COACH, COACH',
        targetNav: 'training',
        targetNavLabel: 'Modul Latihan & Presensi',
        metricText: `${todayTrainingScheduleModel.enrichedSessions.length} Sesi Aktif Hari Ini`,
        accentColor: 'emerald',
        isAuthorized: canAttendance,
      },
      {
        id: 'QUICK_REGISTER_ATHLETE' as QuickActionId,
        title: 'Tambah Atlet Baru',
        subtitle:
          'Registrasi cepat atlet baru beserta wali, penempatan tim, dan aktivasi paket membership.',
        permissionLabel: 'athletes:create',
        allowedRolesText: 'SUPER_ADMIN, OPS_MANAGER, ADMIN',
        targetNav: 'athletes',
        targetNavLabel: 'Modul Atlet & Wali',
        metricText: `${scopedAthletes.length} Atlet Terdaftar`,
        accentColor: 'amber',
        isAuthorized: canRegisterAthlete,
      },
      {
        id: 'QUICK_CREATE_INVOICE' as QuickActionId,
        title: 'Penerbitan Invoice Cepat',
        subtitle:
          'Terbitkan tagihan iuran membership, registrasi, atau turnamen beserta jurnal otomatis.',
        permissionLabel: 'finance:create',
        allowedRolesText: 'SUPER_ADMIN, OPS_MANAGER, FINANCE, ADMIN, EVENT_STAFF',
        targetNav: 'finance',
        targetNavLabel: 'Modul Keuangan & Jurnal',
        metricText: `${state.membershipPlans.length} Paket Tarif Aktif`,
        accentColor: 'sky',
        isAuthorized: canCreateInvoice,
      },
      {
        id: 'QUICK_RECORD_PAYMENT' as QuickActionId,
        title: 'Pelunasan & Pembayaran Cepat',
        subtitle:
          'Catat penerimaan kas/QRIS/VA atas tagihan berjalan dan rekonsiliasi buku besar.',
        permissionLabel: 'finance:process',
        allowedRolesText: 'SUPER_ADMIN, FINANCE, ADMIN, PARENT, ATHLETE',
        targetNav: 'finance',
        targetNavLabel: 'Modul Kas & Pelunasan',
        metricText: `${unpaidInvoicesList.length} Tagihan Belum Lunas`,
        accentColor: 'emerald',
        isAuthorized: canRecordPayment,
      },
      {
        id: 'QUICK_RESTOCK_INVENTORY' as QuickActionId,
        title: 'Restock Inventaris Kritis',
        subtitle:
          'Catat pengadaan (Purchase) atau mutasi barang untuk mengatasi defisit stok minimum.',
        permissionLabel: 'inventory:process',
        allowedRolesText: 'SUPER_ADMIN, OPS_MANAGER, ADMIN, HEAD_COACH, COACH, EVENT_STAFF',
        targetNav: 'inventory',
        targetNavLabel: 'Modul Inventaris & Logistik',
        metricText: `${criticalInventorySummaryModel.enrichedCriticalItems.length} SKU Di Bawah Min`,
        accentColor: 'amber',
        isAuthorized: canRestockInventory,
      },
      {
        id: 'QUICK_MEDICAL_RTP' as QuickActionId,
        title: 'Input Cedera & Status RTP',
        subtitle:
          'Catat observasi medis, cedera lapangan, dan pembaruan status Return-to-Play atlet.',
        permissionLabel: 'medical:create / update',
        allowedRolesText: 'SUPER_ADMIN, MEDICAL_STAFF',
        targetNav: 'medical',
        targetNavLabel: 'Modul Medis & Fisioterapi',
        metricText: `${activeInjuries.length} Atensi Medis Aktif`,
        accentColor: 'red',
        isAuthorized: canMedicalRtp,
      },
      {
        id: 'QUICK_ANNOUNCEMENT' as QuickActionId,
        title: 'Broadcast Pengumuman Cepat',
        subtitle:
          'Publikasikan pengumuman resmi ke atlet, orang tua/wali, atau pelatih cabang.',
        permissionLabel: 'communication:create',
        allowedRolesText: 'SUPER_ADMIN, OWNER, OPS_MANAGER, ADMIN, HEAD_COACH, COACH',
        targetNav: 'comm_admin',
        targetNavLabel: 'Modul Komunikasi & Admin',
        metricText: `${state.announcements.length} Pengumuman Terbit`,
        accentColor: 'sky',
        isAuthorized: canAnnouncement,
      },
      {
        id: 'QUICK_EXPORT_KPI' as QuickActionId,
        title: 'Ekspor Ringkasan KPI (CSV)',
        subtitle:
          'Unduh laporan eksekutif KPI kehadiran, koleksi kas, dan stok kritis cabang aktif.',
        permissionLabel: 'dashboard:export / view',
        allowedRolesText: 'SELURUH ROLE RBAC (TERMASUK INVESTOR & OWNER)',
        targetNav: 'comm_admin',
        targetNavLabel: 'Pusat Laporan & Audit',
        metricText: `Periode FY 2026`,
        accentColor: 'amber',
        isAuthorized: canExportKpi,
      },
    ];
  }, [
    roleCode,
    todayTrainingScheduleModel.enrichedSessions.length,
    scopedAthletes.length,
    state.membershipPlans.length,
    unpaidInvoicesList.length,
    criticalInventorySummaryModel.enrichedCriticalItems.length,
    activeInjuries.length,
    state.announcements.length,
  ]);

  const displayedQuickActions = useMemo(() => {
    if (quickActionsFilterMode === 'ALL_RBAC_MATRIX') {
      return quickActionCatalog;
    }
    return quickActionCatalog.filter((item) => item.isAuthorized);
  }, [quickActionCatalog, quickActionsFilterMode]);

  const emitQuickFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setQuickActionFeedback({ type, message });
    if (notify) {
      notify(message, type);
    }
  };

  const handleQuickAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSession =
      state.trainingSessions.find((s) => s.id === qaSessionId) ||
      todayTrainingScheduleModel.enrichedSessions[0];
    if (!targetSession) {
      emitQuickFeedback('Pilih sesi latihan terlebih dahulu.', 'error');
      return;
    }
    setQuickSubmitting(true);
    setQuickActionFeedback(null);
    try {
      if (qaAttendanceMode === 'BULK_TEAM') {
        const teamAthletes = state.athletes.filter(
          (a) => a.teamId === targetSession.teamId && a.membershipStatus === 'ACTIVE'
        );
        const targetIds =
          teamAthletes.length > 0
            ? teamAthletes.map((a) => a.id)
            : scopedAthletes.slice(0, 5).map((a) => a.id);
        if (targetIds.length === 0) {
          throw new Error('Tidak ada atlet aktif pada tim sesi ini.');
        }
        await apiRequest('/api/attendances/bulk', {
          method: 'POST',
          body: JSON.stringify({
            branchId: targetSession.branchId,
            sessionId: targetSession.id,
            athleteIds: targetIds,
            status: qaAttendanceStatus,
            source: qaAttendanceSource,
          }),
        });
        emitQuickFeedback(
          `Presensi massal berhasil dicatat untuk ${targetIds.length} atlet pada sesi "${targetSession.topic}".`
        );
      } else {
        if (!qaAthleteId) {
          throw new Error('Pilih atlet yang akan dicatat presensinya.');
        }
        await apiRequest('/api/attendances', {
          method: 'POST',
          body: JSON.stringify({
            branchId: targetSession.branchId,
            sessionId: targetSession.id,
            athleteId: qaAthleteId,
            status: qaAttendanceStatus,
            source: qaAttendanceSource,
            notes: qaAttendanceNotes || 'Input Presensi Cepat via Dashboard Quick Actions',
          }),
        });
        const ath = state.athletes.find((a) => a.id === qaAthleteId);
        emitQuickFeedback(
          `Presensi ${ath?.fullName || 'Atlet'} (${qaAttendanceStatus}) berhasil disimpan.`
        );
      }
      if (onRefresh) await onRefresh();
    } catch (err: unknown) {
      emitQuickFeedback(
        err instanceof Error ? err.message : 'Gagal menyimpan presensi cepat.',
        'error'
      );
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleQuickRegisterAthleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaAthleteFullName.trim() || !qaParentName.trim()) {
      emitQuickFeedback('Nama lengkap atlet dan nama orang tua/wali wajib diisi.', 'error');
      return;
    }
    setQuickSubmitting(true);
    setQuickActionFeedback(null);
    try {
      const selectedTeam = state.teams.find((t) => t.id === qaAthleteTeamId);
      const targetBranch = selectedTeam?.branchId || defaultBranchId;
      const targetAgeGroup = selectedTeam?.ageGroupId || state.ageGroups[0]?.id || '';

      await apiRequest('/api/athletes', {
        method: 'POST',
        body: JSON.stringify({
          branchId: targetBranch,
          ageGroupId: targetAgeGroup,
          teamId: qaAthleteTeamId || undefined,
          fullName: qaAthleteFullName.trim(),
          gender: qaAthleteGender,
          birthDate: qaAthleteBirthDate,
          position: qaAthletePosition,
          heightCm: 168,
          weightKg: 58,
          jerseySize: 'L',
          jerseyNumber: Math.floor(10 + Math.random() * 85),
          parentContactName: qaParentName.trim(),
          parentContactPhone: qaParentPhone.trim() || '081234567890',
          emergencyContactName: qaParentName.trim(),
          emergencyContactPhone: qaParentPhone.trim() || '081234567890',
          registrationChannel: 'OFFLINE',
          planId: qaAthletePlanId || undefined,
        }),
      });
      emitQuickFeedback(
        `Atlet baru "${qaAthleteFullName.trim()}" berhasil didaftarkan beserta membership dan tagihan awal.`
      );
      setQaAthleteFullName('');
      setQaParentName('');
      if (onRefresh) await onRefresh();
    } catch (err: unknown) {
      emitQuickFeedback(
        err instanceof Error ? err.message : 'Gagal mendaftarkan atlet baru.',
        'error'
      );
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleQuickCreateInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(qaInvoiceAmount);
    if (!numAmount || numAmount <= 0) {
      emitQuickFeedback('Nominal tagihan harus lebih besar dari Rp 0.', 'error');
      return;
    }
    setQuickSubmitting(true);
    setQuickActionFeedback(null);
    try {
      const selectedAthlete = state.athletes.find((a) => a.id === qaInvoiceAthleteId);
      const targetBranch = selectedAthlete?.branchId || defaultBranchId;
      await apiRequest('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          branchId: targetBranch,
          athleteId: qaInvoiceAthleteId || undefined,
          revenueCategory: qaInvoiceCategory,
          description: qaInvoiceDescription.trim() || 'Tagihan Membership ZAMOA CBTC',
          issueDate: '2026-10-01',
          dueDate: qaInvoiceDueDate || '2026-10-15',
          totalAmount: numAmount,
          status: 'ISSUED',
        }),
      });
      emitQuickFeedback(
        `Invoice baru senilai ${formatIDR(numAmount)} berhasil diterbitkan untuk ${
          selectedAthlete?.fullName || 'Cabang'
        } beserta jurnal akuntansi.`
      );
      if (onRefresh) await onRefresh();
    } catch (err: unknown) {
      emitQuickFeedback(
        err instanceof Error ? err.message : 'Gagal menerbitkan invoice cepat.',
        'error'
      );
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleQuickRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaPaymentInvoiceId) {
      emitQuickFeedback('Pilih invoice yang akan dilunasi.', 'error');
      return;
    }
    const numAmount = Number(qaPaymentAmount);
    if (!numAmount || numAmount <= 0) {
      emitQuickFeedback('Nominal pembayaran harus lebih dari Rp 0.', 'error');
      return;
    }
    setQuickSubmitting(true);
    setQuickActionFeedback(null);
    try {
      await apiRequest('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: qaPaymentInvoiceId,
          paymentDate: '2026-10-01',
          amount: numAmount,
          paymentMethod: qaPaymentMethod,
          referenceNumber: qaPaymentRef.trim() || `QA-${Date.now().toString().slice(-6)}`,
        }),
      });
      emitQuickFeedback(
        `Pembayaran ${formatIDR(numAmount)} via ${qaPaymentMethod} berhasil dicatat dan dijurnal.`
      );
      if (onRefresh) await onRefresh();
    } catch (err: unknown) {
      emitQuickFeedback(
        err instanceof Error ? err.message : 'Gagal mencatat pembayaran cepat.',
        'error'
      );
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleQuickRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetItem = state.inventoryItems.find((i) => i.id === qaInventoryItemId);
    if (!targetItem) {
      emitQuickFeedback('Pilih barang inventaris terlebih dahulu.', 'error');
      return;
    }
    const qty = Number(qaInventoryQty);
    if (!qty || qty <= 0) {
      emitQuickFeedback('Kuantitas mutasi harus lebih dari 0.', 'error');
      return;
    }
    setQuickSubmitting(true);
    setQuickActionFeedback(null);
    try {
      await apiRequest('/api/inventory/transactions', {
        method: 'POST',
        body: JSON.stringify({
          branchId: targetItem.branchId,
          itemId: targetItem.id,
          transactionType: qaInventoryTxType,
          quantity: qty,
          conditionAfter: 'GOOD',
          referenceNote:
            qaInventoryNote.trim() ||
            `Mutasi ${qaInventoryTxType} via Quick Actions Dashboard`,
        }),
      });
      emitQuickFeedback(
        `Mutasi ${qaInventoryTxType} (${qty} ${targetItem.unit}) untuk "${targetItem.name}" berhasil dicatat.`
      );
      if (onRefresh) await onRefresh();
    } catch (err: unknown) {
      emitQuickFeedback(
        err instanceof Error ? err.message : 'Gagal mencatat mutasi inventaris.',
        'error'
      );
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleQuickMedicalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ath = state.athletes.find((a) => a.id === qaMedAthleteId);
    if (!ath) {
      emitQuickFeedback('Pilih atlet terlebih dahulu.', 'error');
      return;
    }
    setQuickSubmitting(true);
    setQuickActionFeedback(null);
    try {
      await apiRequest('/api/medical/injuries', {
        method: 'POST',
        body: JSON.stringify({
          branchId: ath.branchId,
          athleteId: ath.id,
          injuryDate: '2026-10-01',
          bodyPart: qaMedBodyPart.trim(),
          diagnosis: qaMedDiagnosis.trim(),
          severity: qaMedSeverity,
          treatmentPlan: 'Fisioterapi terpadu & pemantauan beban latihan harian',
          returnToPlayStatus: qaMedRtpStatus,
        }),
      });
      emitQuickFeedback(
        `Rekam cedera & status RTP (${qaMedRtpStatus}) untuk ${ath.fullName} berhasil disimpan.`
      );
      if (onRefresh) await onRefresh();
    } catch (err: unknown) {
      emitQuickFeedback(
        err instanceof Error ? err.message : 'Gagal mencatat data medis cepat.',
        'error'
      );
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleQuickAnnouncementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaAnnTitle.trim() || !qaAnnContent.trim()) {
      emitQuickFeedback('Judul dan isi pengumuman wajib diisi.', 'error');
      return;
    }
    setQuickSubmitting(true);
    setQuickActionFeedback(null);
    try {
      await apiRequest('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({
          branchId: kpiBranchFilter === 'ALL' ? '' : kpiBranchFilter,
          targetRole: qaAnnTargetRole,
          title: qaAnnTitle.trim(),
          content: qaAnnContent.trim(),
          priority: qaAnnPriority,
        }),
      });
      emitQuickFeedback(`Pengumuman "${qaAnnTitle.trim()}" berhasil dipublikasikan.`);
      setQaAnnTitle('');
      setQaAnnContent('');
      if (onRefresh) await onRefresh();
    } catch (err: unknown) {
      emitQuickFeedback(
        err instanceof Error ? err.message : 'Gagal mempublikasikan pengumuman.',
        'error'
      );
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleQuickExportKpi = () => {
    const branchLabel =
      kpiBranchFilter === 'ALL'
        ? 'ALL_BRANCHES'
        : state.branches.find((b) => b.id === kpiBranchFilter)?.code || 'BRANCH';
    exportRowsToCsv(`ZAMOA_CBTC_KPI_SUMMARY_${branchLabel}_2026`, [
      {
        Cabang: branchLabel,
        Role_Pengguna: roleCode,
        Atlet_Aktif: activeAthletes.length,
        Rata_Kehadiran_Kuartal_Pct: quarterAttendanceSummary.avgRate,
        Koleksi_Kuartal_IDR: quarterFinanceSummary.totalQuarterCollected,
        Piutang_Kuartal_IDR: quarterFinanceSummary.totalQuarterReceivable,
        Target_Bulan_Berjalan_IDR: targetVsActualRevenueModel.monthlyTargetAmount,
        Realisasi_Bulan_Berjalan_IDR: targetVsActualRevenueModel.currentMonthActualCollected,
        Capaian_Target_Bulanan_Pct: targetVsActualRevenueModel.monthlyAchievementPct,
        Sesi_Latihan_Hari_Ini: todayTrainingScheduleModel.enrichedSessions.length,
        SKU_Inventaris_Kritis: criticalInventorySummaryModel.enrichedCriticalItems.length,
        Defisit_Unit_Inventaris: criticalInventorySummaryModel.totalDeficitUnits,
      },
    ]);
    emitQuickFeedback(
      `Laporan Ringkasan KPI (${branchLabel}) berhasil diekspor ke CSV dan tercatat di Audit Log.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Executive Context Banner */}
      <div className="p-6 rounded-lg border border-slate-800 bg-slate-900/70 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 uppercase tracking-wider">
            <span>{state.organization.code}</span>
            <span>•</span>
            <span>ROLE AKTIF: {roleCode}</span>
            <span>•</span>
            <span>
              CABANG:{' '}
              {state.currentUser.branchId
                ? state.branches.find((b) => b.id === state.currentUser.branchId)?.name ||
                  'Cabang Terpilih'
                : 'SELURUH CABANG (MULTI-BRANCH)'}
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mt-1 font-display">
            Pusat Komando Operasional &amp; KPI Eksekutif ZAMOA CBTC
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Single Source of Truth untuk visualisasi tren kehadiran atlet kuartal berjalan, pertumbuhan koleksi keuangan, dan akuntansi double-entry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('athletes')}
            className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Kelola Atlet &amp; Pendaftaran</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('training')}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md transition-colors whitespace-nowrap"
          >
            Jadwal &amp; Presensi
          </button>
          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md transition-colors whitespace-nowrap"
          >
            Keuangan &amp; Jurnal
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="px-3.5 py-2 text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-md transition-colors whitespace-nowrap"
          >
            Pengaturan Aplikasi (Atur Semua)
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (Max 4 cards per row, <= 3 data points per card) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>ATLET AKTIF / TOTAL</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono tabular-nums">
            {activeAthletes.length}{' '}
            <span className="text-sm font-normal text-slate-500">
              / {state.athletes.length}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Tersebar di{' '}
            <span className="text-slate-200 font-mono">{state.teams.length}</span> tim &amp;{' '}
            <span className="text-slate-200 font-mono">{state.branches.length}</span> cabang
          </div>
        </div>

        <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>TREN KEHADIRAN KUARTAL</span>
            <CalendarCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono tabular-nums">
            {quarterAttendanceSummary.avgRate}%
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="text-emerald-400 font-mono">
              {quarterAttendanceSummary.totalOnTime + quarterAttendanceSummary.totalLate}
            </span>
            /{quarterAttendanceSummary.totalLogs} hadir • Target ≥{targetKpiPct}%
          </div>
        </div>

        <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>KOLEKSI TAGIHAN KUARTAL</span>
            <Wallet className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {formatIDR(quarterFinanceSummary.totalQuarterCollected)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Rasio Koleksi:{' '}
            <span className="text-sky-400 font-mono font-semibold">
              {quarterFinanceSummary.collectionRate}%
            </span>{' '}
            • Piutang:{' '}
            <span className="text-amber-300 font-mono">
              {formatIDR(quarterFinanceSummary.totalQuarterReceivable)}
            </span>
          </div>
        </div>

        <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>SURPLUS KAS OPERASIONAL</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono tabular-nums">
            {formatIDR(totalCollected - totalExpenses)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Total Beban:{' '}
            <span className="text-red-300 font-mono">{formatIDR(totalExpenses)}</span>
          </div>
        </div>
      </div>

      {/* ============================================================================
          PANEL QUICK ACTIONS BERBASIS ROLE RBAC (ONE-CLICK WORKBENCH & SHORTCUTS)
          ============================================================================ */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/65 p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-amber-400 uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>QUICK ACTIONS • AKSES SATU-KLIK BERBASIS OTORISASI RBAC</span>
              <span>•</span>
              <span className="text-emerald-400">
                ROLE AKTIF: {activeRoleMeta.code} ({activeRoleMeta.name})
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 mt-0.5 flex flex-wrap items-center gap-2">
              <span>Panel Eksekusi Cepat Operasional &amp; Finansial</span>
              <span className="text-xs font-mono font-semibold text-emerald-400">
                ({quickActionCatalog.filter((a) => a.isAuthorized).length}/
                {quickActionCatalog.length} Aksi Diizinkan untuk {roleCode})
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Akses satu-klik ke fungsi yang paling sering digunakan sesuai hak akses RBAC pengguna aktif — mendukung eksekusi langsung dari dashboard maupun lompatan ke modul penuh.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Authorized Only vs Full RBAC Matrix */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setQuickActionsFilterMode('ROLE_AUTHORIZED')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  quickActionsFilterMode === 'ROLE_AUTHORIZED'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sesuai Role Aktif ({quickActionCatalog.filter((a) => a.isAuthorized).length})
              </button>
              <button
                type="button"
                onClick={() => setQuickActionsFilterMode('ALL_RBAC_MATRIX')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  quickActionsFilterMode === 'ALL_RBAC_MATRIX'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Matriks Semua Role ({quickActionCatalog.length})
              </button>
            </div>

            {activeQuickDrawer && (
              <button
                type="button"
                onClick={() => {
                  setActiveQuickDrawer(null);
                  setQuickActionFeedback(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-colors"
              >
                Tutup Form Cepat ✕
              </button>
            )}
          </div>
        </div>

        {/* Feedback Banner inside Quick Actions */}
        {quickActionFeedback && (
          <div
            className={`px-4 py-2.5 rounded-md border text-xs font-medium flex items-center justify-between ${
              quickActionFeedback.type === 'error'
                ? 'bg-red-950/60 border-red-800 text-red-200'
                : 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
            }`}
          >
            <span>{quickActionFeedback.message}</span>
            <button
              type="button"
              onClick={() => setQuickActionFeedback(null)}
              className="text-slate-400 hover:text-white ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Quick Actions Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {displayedQuickActions.map((action) => {
            const isSelected = activeQuickDrawer === action.id;
            const renderIcon = () => {
              switch (action.id) {
                case 'QUICK_ATTENDANCE':
                  return <CalendarCheck className="w-4 h-4 text-emerald-400 shrink-0" />;
                case 'QUICK_REGISTER_ATHLETE':
                  return <UserPlus className="w-4 h-4 text-amber-400 shrink-0" />;
                case 'QUICK_CREATE_INVOICE':
                  return <FilePlus2 className="w-4 h-4 text-sky-400 shrink-0" />;
                case 'QUICK_RECORD_PAYMENT':
                  return <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />;
                case 'QUICK_RESTOCK_INVENTORY':
                  return <Package className="w-4 h-4 text-amber-400 shrink-0" />;
                case 'QUICK_MEDICAL_RTP':
                  return <HeartPulse className="w-4 h-4 text-red-400 shrink-0" />;
                case 'QUICK_ANNOUNCEMENT':
                  return <Megaphone className="w-4 h-4 text-sky-400 shrink-0" />;
                case 'QUICK_EXPORT_KPI':
                  return <Download className="w-4 h-4 text-amber-400 shrink-0" />;
              }
            };

            return (
              <div
                key={action.id}
                className={`p-4 rounded-lg border flex flex-col justify-between gap-3 transition-colors ${
                  !action.isAuthorized
                    ? 'border-slate-800/60 bg-slate-950/35 opacity-65'
                    : isSelected
                    ? 'border-amber-500 bg-slate-950/95'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                }`}
              >
                <div className="space-y-2">
                  {/* Top Metadata Line (Clean unboxed typography) */}
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <div className="flex items-center gap-1.5 text-slate-400 truncate">
                      {renderIcon()}
                      <span className="truncate">{action.permissionLabel}</span>
                    </div>
                    {action.isAuthorized ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
                        <ShieldCheck className="w-3 h-3" />
                        <span>RBAC OK</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 font-semibold flex items-center gap-1 shrink-0">
                        <Lock className="w-3 h-3" />
                        <span>TERKUNCI</span>
                      </span>
                    )}
                  </div>

                  {/* Action Title & Description */}
                  <div>
                    <div className="text-sm font-bold text-slate-100">{action.title}</div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{action.subtitle}</p>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-800/80 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400">Status Konteks:</span>
                    <span className="text-amber-400 font-semibold">{action.metricText}</span>
                  </div>

                  {action.isAuthorized ? (
                    <div className="flex items-center gap-2">
                      {action.id === 'QUICK_EXPORT_KPI' ? (
                        <button
                          type="button"
                          onClick={handleQuickExportKpi}
                          className="flex-1 py-1.5 px-3 text-xs font-semibold rounded bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Unduh CSV 1-Klik</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setQuickActionFeedback(null);
                            setActiveQuickDrawer(isSelected ? null : action.id);
                          }}
                          className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          }`}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>{isSelected ? 'Form Aktif' : 'Eksekusi Cepat'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onNavigate(action.targetNav)}
                        className="py-1.5 px-2.5 text-xs font-semibold rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1 shrink-0"
                        title={`Buka ${action.targetNavLabel}`}
                      >
                        <span>Modul</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-slate-500">
                      Khusus Role: {action.allowedRolesText}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* INLINE ONE-CLICK EXECUTION WORKBENCH DRAWER */}
        {activeQuickDrawer && (
          <div className="p-4 rounded-lg border border-amber-500/40 bg-slate-950/90 space-y-4">
            {/* 1. QUICK ATTENDANCE FORM */}
            {activeQuickDrawer === 'QUICK_ATTENDANCE' && (
              <form onSubmit={handleQuickAttendanceSubmit} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <div className="text-xs font-mono text-emerald-400 uppercase">
                      EKSEKUSI SATU-KLIK • INPUT PRESENSI CEPAT (attendance:create / process)
                    </div>
                    <h4 className="text-sm font-bold text-slate-100 mt-0.5">
                      Pencatatan Kehadiran Sesi Latihan Langsung dari Dashboard
                    </h4>
                  </div>
                  <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md self-start">
                    <button
                      type="button"
                      onClick={() => setQaAttendanceMode('BULK_TEAM')}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        qaAttendanceMode === 'BULK_TEAM'
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Check-In Massal 1-Klik (Tim)
                    </button>
                    <button
                      type="button"
                      onClick={() => setQaAttendanceMode('SINGLE_ATHLETE')}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        qaAttendanceMode === 'SINGLE_ATHLETE'
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Input Per Atlet
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="md:col-span-2">
                    <label className="block text-slate-400 mb-1">Pilih Sesi Latihan Aktif</label>
                    <select
                      value={qaSessionId}
                      onChange={(e) => setQaSessionId(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      {scopedSessions.map((s) => {
                        const team = state.teams.find((t) => t.id === s.teamId);
                        return (
                          <option key={s.id} value={s.id}>
                            [{s.sessionDate} {s.startTime}] {s.topic} — {team?.name || 'Tim'} (
                            {s.status})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {qaAttendanceMode === 'SINGLE_ATHLETE' && (
                    <div>
                      <label className="block text-slate-400 mb-1">Pilih Atlet</label>
                      <select
                        value={qaAthleteId}
                        onChange={(e) => setQaAthleteId(e.target.value)}
                        className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                      >
                        {scopedAthletes.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.fullName} ({a.memberCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-400 mb-1">Status Kehadiran</label>
                    <select
                      value={qaAttendanceStatus}
                      onChange={(e) =>
                        setQaAttendanceStatus(
                          e.target.value as 'PRESENT' | 'LATE' | 'EXCUSED' | 'SICK' | 'ABSENT'
                        )
                      }
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="PRESENT">PRESENT (Hadir Tepat Waktu)</option>
                      <option value="LATE">LATE (Terlambat)</option>
                      <option value="EXCUSED">EXCUSED (Izin Resmi)</option>
                      <option value="SICK">SICK (Sakit)</option>
                      <option value="ABSENT">ABSENT (Alpa)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Metode Verifikasi</label>
                    <select
                      value={qaAttendanceSource}
                      onChange={(e) =>
                        setQaAttendanceSource(e.target.value as 'COACH' | 'QR' | 'ADMIN')
                      }
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="COACH">COACH (Verifikasi Pelatih)</option>
                      <option value="QR">QR (Scan Kartu QR Digital)</option>
                      <option value="ADMIN">ADMIN (Meja Administrasi)</option>
                    </select>
                  </div>
                </div>

                {qaAttendanceMode === 'SINGLE_ATHLETE' && (
                  <div className="text-xs">
                    <label className="block text-slate-400 mb-1">Catatan Lapangan (Opsional)</label>
                    <input
                      type="text"
                      value={qaAttendanceNotes}
                      onChange={(e) => setQaAttendanceNotes(e.target.value)}
                      placeholder="Contoh: Hadir 15 menit sebelum pemanasan dimulai..."
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveQuickDrawer(null)}
                    className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={quickSubmitting}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md transition-colors"
                  >
                    {quickSubmitting
                      ? 'Menyimpan Presensi...'
                      : qaAttendanceMode === 'BULK_TEAM'
                      ? 'Simpan Presensi Massal Roster Tim'
                      : 'Simpan Presensi Atlet'}
                  </button>
                </div>
              </form>
            )}

            {/* 2. QUICK REGISTER ATHLETE FORM */}
            {activeQuickDrawer === 'QUICK_REGISTER_ATHLETE' && (
              <form onSubmit={handleQuickRegisterAthleteSubmit} className="space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <div className="text-xs font-mono text-amber-400 uppercase">
                    EKSEKUSI SATU-KLIK • TAMBAH ATLET BARU (athletes:create)
                  </div>
                  <h4 className="text-sm font-bold text-slate-100 mt-0.5">
                    Pendaftaran Cepat Atlet Baru + Aktivasi Membership &amp; Tagihan Otomatis
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Nama Lengkap Atlet *</label>
                    <input
                      type="text"
                      required
                      value={qaAthleteFullName}
                      onChange={(e) => setQaAthleteFullName(e.target.value)}
                      placeholder="Contoh: Brandon Wijaya Kusuma"
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Gender &amp; Posisi Utama</label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={qaAthleteGender}
                        onChange={(e) => setQaAthleteGender(e.target.value as 'MALE' | 'FEMALE')}
                        className="w-full px-2.5 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                      >
                        <option value="MALE">Putra (MALE)</option>
                        <option value="FEMALE">Putri (FEMALE)</option>
                      </select>
                      <select
                        value={qaAthletePosition}
                        onChange={(e) =>
                          setQaAthletePosition(
                            e.target.value as 'PG' | 'SG' | 'SF' | 'PF' | 'C'
                          )
                        }
                        className="w-full px-2.5 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                      >
                        <option value="PG">PG (Point Guard)</option>
                        <option value="SG">SG (Shooting Guard)</option>
                        <option value="SF">SF (Small Forward)</option>
                        <option value="PF">PF (Power Forward)</option>
                        <option value="C">C (Center)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Tanggal Lahir</label>
                    <input
                      type="date"
                      value={qaAthleteBirthDate}
                      onChange={(e) => setQaAthleteBirthDate(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Penempatan Tim Cabang</label>
                    <select
                      value={qaAthleteTeamId}
                      onChange={(e) => setQaAthleteTeamId(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      {state.teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-slate-400 mb-1">
                      Paket Membership (Otomatis Terbit Invoice)
                    </label>
                    <select
                      value={qaAthletePlanId}
                      onChange={(e) => setQaAthletePlanId(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      {state.membershipPlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code}) — {formatIDR(p.feeAmount)} / {p.billingCycle}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Nama Orang Tua / Wali *</label>
                    <input
                      type="text"
                      required
                      value={qaParentName}
                      onChange={(e) => setQaParentName(e.target.value)}
                      placeholder="Contoh: Hendra Wijaya"
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">No. WhatsApp Wali *</label>
                    <input
                      type="text"
                      required
                      value={qaParentPhone}
                      onChange={(e) => setQaParentPhone(e.target.value)}
                      placeholder="081234567890"
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveQuickDrawer(null)}
                    className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={quickSubmitting}
                    className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors"
                  >
                    {quickSubmitting
                      ? 'Mendaftarkan Atlet...'
                      : 'Daftarkan Atlet & Terbitkan Tagihan'}
                  </button>
                </div>
              </form>
            )}

            {/* 3. QUICK CREATE INVOICE FORM */}
            {activeQuickDrawer === 'QUICK_CREATE_INVOICE' && (
              <form onSubmit={handleQuickCreateInvoiceSubmit} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <div className="text-xs font-mono text-sky-400 uppercase">
                      EKSEKUSI SATU-KLIK • PENERBITAN INVOICE CEPAT (finance:create)
                    </div>
                    <h4 className="text-sm font-bold text-slate-100 mt-0.5">
                      Terbitkan Invoice Tagihan + Posting Jurnal Piutang Double-Entry Otomatis
                    </h4>
                  </div>

                  {/* Preset Nominal Buttons from Membership Plans */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {state.membershipPlans.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => {
                          setQaInvoiceCategory('MEMBERSHIP');
                          setQaInvoiceAmount(String(Number(plan.feeAmount || 750000)));
                          setQaInvoiceDescription(
                            `Iuran ${plan.name} (${plan.code}) — Periode Oktober 2026`
                          );
                        }}
                        className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700"
                      >
                        Preset {plan.code}: {formatIDR(plan.feeAmount)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Pilih Atlet Tertagih</label>
                    <select
                      value={qaInvoiceAthleteId}
                      onChange={(e) => setQaInvoiceAthleteId(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      {scopedAthletes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.fullName} ({a.memberCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Kategori Pendapatan</label>
                    <select
                      value={qaInvoiceCategory}
                      onChange={(e) =>
                        setQaInvoiceCategory(
                          e.target.value as
                            | 'MEMBERSHIP'
                            | 'REGISTRATION'
                            | 'TOURNAMENT'
                            | 'MERCHANDISE'
                            | 'SPONSORSHIP'
                            | 'OTHER_REVENUE'
                        )
                      }
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="MEMBERSHIP">MEMBERSHIP (Iuran Latihan)</option>
                      <option value="REGISTRATION">REGISTRATION (Biaya Pendaftaran)</option>
                      <option value="TOURNAMENT">TOURNAMENT (Biaya Turnamen)</option>
                      <option value="MERCHANDISE">MERCHANDISE (Jersey &amp; Perlengkapan)</option>
                      <option value="SPONSORSHIP">SPONSORSHIP (Sponsor &amp; Kemitraan)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Nominal Tagihan (IDR) *</label>
                    <input
                      type="number"
                      min={10000}
                      step={5000}
                      required
                      value={qaInvoiceAmount}
                      onChange={(e) => setQaInvoiceAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Jatuh Tempo (Due Date)</label>
                    <input
                      type="date"
                      value={qaInvoiceDueDate}
                      onChange={(e) => setQaInvoiceDueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-slate-400 mb-1">Deskripsi Invoice *</label>
                    <input
                      type="text"
                      required
                      value={qaInvoiceDescription}
                      onChange={(e) => setQaInvoiceDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveQuickDrawer(null)}
                    className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={quickSubmitting}
                    className="px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md transition-colors"
                  >
                    {quickSubmitting
                      ? 'Menerbitkan Invoice...'
                      : 'Terbitkan Invoice & Posting Jurnal'}
                  </button>
                </div>
              </form>
            )}

            {/* 4. QUICK RECORD PAYMENT FORM */}
            {activeQuickDrawer === 'QUICK_RECORD_PAYMENT' && (
              <form onSubmit={handleQuickRecordPaymentSubmit} className="space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <div className="text-xs font-mono text-emerald-400 uppercase">
                    EKSEKUSI SATU-KLIK • PELUNASAN &amp; PEMBAYARAN CEPAT (finance:process)
                  </div>
                  <h4 className="text-sm font-bold text-slate-100 mt-0.5">
                    Catat Penerimaan Kas/QRIS/VA &amp; Rekonsiliasi Piutang Otomatis
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="md:col-span-2">
                    <label className="block text-slate-400 mb-1">Pilih Tagihan Belum Lunas</label>
                    <select
                      value={qaPaymentInvoiceId}
                      onChange={(e) => {
                        const invId = e.target.value;
                        setQaPaymentInvoiceId(invId);
                        const found = unpaidInvoicesList.find((i) => i.id === invId);
                        if (found) {
                          const rem =
                            Number(found.totalAmount || 0) - Number(found.paidAmount || 0);
                          setQaPaymentAmount(String(Math.max(0, rem)));
                        }
                      }}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      {unpaidInvoicesList.map((inv) => {
                        const ath = state.athletes.find((a) => a.id === inv.athleteId);
                        const rem = Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0);
                        return (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoiceNumber} — {ath?.fullName || inv.description} (Sisa:{' '}
                            {formatIDR(rem)})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Nominal Bayar (IDR) *</label>
                    <input
                      type="number"
                      min={1000}
                      required
                      value={qaPaymentAmount}
                      onChange={(e) => setQaPaymentAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Kanal Pembayaran</label>
                    <select
                      value={qaPaymentMethod}
                      onChange={(e) =>
                        setQaPaymentMethod(
                          e.target.value as
                            | 'QRIS'
                            | 'VIRTUAL_ACCOUNT'
                            | 'BANK_TRANSFER'
                            | 'EWALLET'
                            | 'CASH'
                        )
                      }
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="QRIS">QRIS Terpadu</option>
                      <option value="VIRTUAL_ACCOUNT">Virtual Account (VA Bank)</option>
                      <option value="BANK_TRANSFER">Transfer Bank</option>
                      <option value="EWALLET">E-Wallet (GoPay/OVO/Dana)</option>
                      <option value="CASH">Tunai (Kasir Cabang)</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-slate-400 mb-1">
                      Nomor Referensi / Bukti Transaksi (Opsional)
                    </label>
                    <input
                      type="text"
                      value={qaPaymentRef}
                      onChange={(e) => setQaPaymentRef(e.target.value)}
                      placeholder="Contoh: QRIS-20261001-99812"
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveQuickDrawer(null)}
                    className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={quickSubmitting || unpaidInvoicesList.length === 0}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md transition-colors"
                  >
                    {quickSubmitting
                      ? 'Memproses Pembayaran...'
                      : 'Catat Pembayaran & Kwitansi'}
                  </button>
                </div>
              </form>
            )}

            {/* 5. QUICK RESTOCK INVENTORY FORM */}
            {activeQuickDrawer === 'QUICK_RESTOCK_INVENTORY' && (
              <form onSubmit={handleQuickRestockSubmit} className="space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <div className="text-xs font-mono text-amber-400 uppercase">
                    EKSEKUSI SATU-KLIK • RESTOCK &amp; MUTASI INVENTARIS CEPAT (inventory:process)
                  </div>
                  <h4 className="text-sm font-bold text-slate-100 mt-0.5">
                    Penambahan Stok Barang Kritis atau Pencatatan Pemakaian Lapangan
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="md:col-span-2">
                    <label className="block text-slate-400 mb-1">Pilih SKU Barang Inventaris</label>
                    <select
                      value={qaInventoryItemId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setQaInventoryItemId(id);
                        const crit = criticalInventorySummaryModel.enrichedCriticalItems.find(
                          (c) => c.id === id
                        );
                        if (crit) {
                          setQaInventoryQty(String(crit.recommendedRestockQty));
                        }
                      }}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      {state.inventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          [{item.sku}] {item.name} (Stok: {item.currentStock} / Min: {item.minStock}{' '}
                          {item.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Tipe Transaksi</label>
                    <select
                      value={qaInventoryTxType}
                      onChange={(e) =>
                        setQaInventoryTxType(e.target.value as 'PURCHASE' | 'ISSUE' | 'RETURN')
                      }
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="PURCHASE">PURCHASE (+ Pengadaan / Restock)</option>
                      <option value="RETURN">RETURN (+ Pengembalian ke Gudang)</option>
                      <option value="ISSUE">ISSUE (- Pemakaian Lapangan)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Kuantitas Unit *</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={qaInventoryQty}
                      onChange={(e) => setQaInventoryQty(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-slate-400 mb-1">Catatan Referensi Mutasi *</label>
                    <input
                      type="text"
                      required
                      value={qaInventoryNote}
                      onChange={(e) => setQaInventoryNote(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveQuickDrawer(null)}
                    className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={quickSubmitting}
                    className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors"
                  >
                    {quickSubmitting ? 'Menyimpan Mutasi...' : 'Simpan Mutasi Buku Besar Stok'}
                  </button>
                </div>
              </form>
            )}

            {/* 6. QUICK MEDICAL & RTP FORM */}
            {activeQuickDrawer === 'QUICK_MEDICAL_RTP' && (
              <form onSubmit={handleQuickMedicalSubmit} className="space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <div className="text-xs font-mono text-red-400 uppercase">
                    EKSEKUSI SATU-KLIK • INPUT CEDERA &amp; STATUS RTP CEPAT (medical:create)
                  </div>
                  <h4 className="text-sm font-bold text-slate-100 mt-0.5">
                    Pencatatan Cepat Observasi Medis &amp; Status Return-to-Play Atlet
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Pilih Atlet</label>
                    <select
                      value={qaMedAthleteId}
                      onChange={(e) => setQaMedAthleteId(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      {scopedAthletes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.fullName} ({a.memberCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Bagian Tubuh / Lokasi</label>
                    <input
                      type="text"
                      required
                      value={qaMedBodyPart}
                      onChange={(e) => setQaMedBodyPart(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Tingkat Keparahan</label>
                    <select
                      value={qaMedSeverity}
                      onChange={(e) =>
                        setQaMedSeverity(e.target.value as 'MINOR' | 'MODERATE' | 'SEVERE')
                      }
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="MINOR">MINOR (Ringan)</option>
                      <option value="MODERATE">MODERATE (Sedang)</option>
                      <option value="SEVERE">SEVERE (Berat)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Status Return-to-Play (RTP)</label>
                    <select
                      value={qaMedRtpStatus}
                      onChange={(e) =>
                        setQaMedRtpStatus(
                          e.target.value as
                            | 'LIMITED_CONTACT'
                            | 'REHABILITATION'
                            | 'OUT'
                            | 'CLEARED'
                        )
                      }
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="LIMITED_CONTACT">LIMITED_CONTACT (Latihan Terbatas)</option>
                      <option value="REHABILITATION">REHABILITATION (Fisioterapi)</option>
                      <option value="OUT">OUT (Istirahat Total)</option>
                      <option value="CLEARED">CLEARED (Siap Tanding)</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-slate-400 mb-1">Diagnosis &amp; Catatan Medis</label>
                    <input
                      type="text"
                      required
                      value={qaMedDiagnosis}
                      onChange={(e) => setQaMedDiagnosis(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveQuickDrawer(null)}
                    className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={quickSubmitting}
                    className="px-4 py-2 text-xs font-semibold bg-red-500 hover:bg-red-400 text-slate-950 rounded-md transition-colors"
                  >
                    {quickSubmitting ? 'Menyimpan Rekam Medis...' : 'Simpan Laporan Medis & RTP'}
                  </button>
                </div>
              </form>
            )}

            {/* 7. QUICK ANNOUNCEMENT FORM */}
            {activeQuickDrawer === 'QUICK_ANNOUNCEMENT' && (
              <form onSubmit={handleQuickAnnouncementSubmit} className="space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <div className="text-xs font-mono text-sky-400 uppercase">
                    EKSEKUSI SATU-KLIK • BROADCAST PENGUMUMAN AKADEMI (communication:create)
                  </div>
                  <h4 className="text-sm font-bold text-slate-100 mt-0.5">
                    Publikasikan Pengumuman Resmi ke Atlet, Orang Tua, dan Pelatih
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="md:col-span-2">
                    <label className="block text-slate-400 mb-1">Judul Pengumuman *</label>
                    <input
                      type="text"
                      required
                      value={qaAnnTitle}
                      onChange={(e) => setQaAnnTitle(e.target.value)}
                      placeholder="Contoh: Jadwal Scrimmage Game & Evaluasi Kuartal IV"
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Prioritas</label>
                    <select
                      value={qaAnnPriority}
                      onChange={(e) =>
                        setQaAnnPriority(e.target.value as 'NORMAL' | 'IMPORTANT' | 'URGENT')
                      }
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="NORMAL">NORMAL</option>
                      <option value="IMPORTANT">IMPORTANT (Penting)</option>
                      <option value="URGENT">URGENT (Mendesak)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Target Penerima</label>
                    <select
                      value={qaAnnTargetRole}
                      onChange={(e) => setQaAnnTargetRole(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="ALL">Seluruh Anggota Akademi (ALL)</option>
                      <option value="ATHLETE">Khusus Atlet (ATHLETE)</option>
                      <option value="PARENT">Khusus Orang Tua / Wali (PARENT)</option>
                      <option value="COACH">Khusus Tim Pelatih (COACH)</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-slate-400 mb-1">Isi Pengumuman *</label>
                    <input
                      type="text"
                      required
                      value={qaAnnContent}
                      onChange={(e) => setQaAnnContent(e.target.value)}
                      placeholder="Tuliskan informasi jadwal, lokasi lapangan, atau instruksi perlengkapan..."
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveQuickDrawer(null)}
                    className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={quickSubmitting}
                    className="px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md transition-colors"
                  >
                    {quickSubmitting ? 'Mempublikasikan...' : 'Publikasikan Pengumuman'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* ============================================================================
          WIDGET JADWAL LATIHAN HARI INI (TODAY'S ACTIVE TRAINING SCHEDULE BY BRANCH)
          ============================================================================ */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-amber-400 uppercase tracking-wider">
              <CalendarCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>JADWAL LATIHAN HARI INI ({todayTrainingScheduleModel.operationalTodayDate})</span>
              <span>•</span>
              <span className="text-emerald-400">
                CABANG TERPILIH:{' '}
                {todayTrainingScheduleModel.selectedBranchObj
                  ? `${todayTrainingScheduleModel.selectedBranchObj.code} — ${todayTrainingScheduleModel.selectedBranchObj.name}`
                  : 'SEMUA CABANG (KONSOLIDASI)'}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 mt-0.5 flex flex-wrap items-center gap-2.5">
              <span>Daftar Sesi Latihan Aktif Hari Ini</span>
              <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {todayTrainingScheduleModel.enrichedSessions.length} Sesi Aktif
              </span>
              {todayTrainingScheduleModel.ongoingCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {todayTrainingScheduleModel.ongoingCount} Sedang Berlangsung (ONGOING)
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Menampilkan jadwal sesi lapangan aktif hari ini sesuai filter cabang yang sedang dipilih, lengkap dengan status presensi atlet dan pelatih bertugas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Branch Filter Selector synchronized with Dashboard Branch Filter */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setKpiBranchFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  kpiBranchFilter === 'ALL'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Semua Cabang ({todayTrainingScheduleModel.allBranchesTodaySessions.length})
              </button>
              {state.branches.map((b) => {
                const branchTodayCount =
                  todayTrainingScheduleModel.allBranchesTodaySessions.filter(
                    (s) => s.branchId === b.id
                  ).length;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setKpiBranchFilter(b.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      kpiBranchFilter === b.id
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {b.code} ({branchTodayCount})
                  </button>
                );
              })}
            </div>

            {/* Active vs All Today Toggle */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setTodaySessionFilterMode('ACTIVE_TODAY')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  todaySessionFilterMode === 'ACTIVE_TODAY'
                    ? 'bg-slate-800 text-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sesi Aktif
              </button>
              <button
                type="button"
                onClick={() => setTodaySessionFilterMode('ALL_TODAY')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  todaySessionFilterMode === 'ALL_TODAY'
                    ? 'bg-slate-800 text-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Semua Hari Ini
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('training')}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-md transition-colors flex items-center gap-1"
            >
              <span>Kelola Sesi &amp; Presensi</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Today's Active Sessions Cards Grid */}
        {todayTrainingScheduleModel.enrichedSessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {todayTrainingScheduleModel.enrichedSessions.map((session) => {
              const isOngoing = (session.status || '').toUpperCase() === 'ONGOING';
              return (
                <div
                  key={session.id}
                  className={`p-4 rounded-lg border flex flex-col justify-between gap-3 transition-colors ${
                    isOngoing
                      ? 'border-emerald-500/40 bg-slate-950/80'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Top Row: Time Slot & Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-100">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          {session.startTime} – {session.endTime} WIB
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-slate-900 border border-slate-700 text-amber-400">
                          {session.branchCode}
                        </span>
                        <StatusText status={session.status} />
                      </div>
                    </div>

                    {/* Topic & Team Info */}
                    <div>
                      <div className="text-sm font-bold text-slate-100 leading-snug">
                        {session.topic}
                      </div>
                      <div className="text-xs font-semibold text-amber-400 mt-1">
                        {session.teamName}{' '}
                        <span className="font-mono text-[11px] text-slate-400">
                          ({session.teamCode})
                        </span>
                      </div>
                      {session.trainingNotes && (
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                          {session.trainingNotes}
                        </p>
                      )}
                    </div>

                    {/* Venue & Coach Metadata */}
                    <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 gap-1.5 text-xs text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="truncate">
                          {session.courtName} •{' '}
                          <span className="text-slate-400">{session.branchName}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">
                          {session.coachName}{' '}
                          <span className="text-[11px] font-mono text-slate-400">
                            ({session.coachLicense})
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Attendance Check-in Progress & Action */}
                  <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400">
                        Presensi Sesi:{' '}
                        <strong className="text-slate-200">
                          {session.presentOrLateCount}/{session.rosterCount} Atlet
                        </strong>
                      </span>
                      <span className="text-emerald-400 font-semibold">
                        {session.checkInPct}% Check-In
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded bg-slate-900 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${session.checkInPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-mono text-slate-400">
                        {session.programName}
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate('training')}
                        className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                      >
                        <span>Input Presensi</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 rounded-lg border border-slate-800/80 bg-slate-950/50 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-200">
              Tidak ada sesi latihan aktif hari ini untuk filter cabang yang dipilih.
            </div>
            <p className="text-xs text-slate-400">
              Pilih tombol &quot;Semua Cabang&quot; di atas atau buka modul Latihan untuk menjadwalkan sesi lapangan baru hari ini.
            </p>
          </div>
        )}
      </div>

      {/* ============================================================================
          WIDGET RINGKASAN INVENTARIS KRITIS (CRITICAL INVENTORY BELOW MIN THRESHOLD BY BRANCH)
          ============================================================================ */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-amber-400 uppercase tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span>RINGKASAN INVENTARIS KRITIS (STOK &lt; AMBANG BATAS MINIMUM)</span>
              <span>•</span>
              <span className="text-emerald-400">
                CABANG AKTIF:{' '}
                {criticalInventorySummaryModel.selectedBranchObj
                  ? `${criticalInventorySummaryModel.selectedBranchObj.code} — ${criticalInventorySummaryModel.selectedBranchObj.name}`
                  : 'SEMUA CABANG (KONSOLIDASI)'}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 mt-0.5 flex flex-wrap items-center gap-2.5">
              <span>Daftar Barang dengan Stok di Bawah Ambang Batas Minimum</span>
              <span className="text-xs font-mono font-semibold text-red-400">
                ({criticalInventorySummaryModel.enrichedCriticalItems.length} SKU Perlu Restock •{' '}
                Defisit -{criticalInventorySummaryModel.totalDeficitUnits} Unit)
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Memantau logistik peralatan latihan, bola basket, seragam, dan perlengkapan medis yang berada di bawah stok aman minimum sesuai cabang yang sedang aktif.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Branch Filter Selector synchronized with Active Branch */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setKpiBranchFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  kpiBranchFilter === 'ALL'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Semua Cabang ({criticalInventorySummaryModel.allBranchesCriticalItems.length})
              </button>
              {state.branches.map((b) => {
                const branchCriticalCount =
                  criticalInventorySummaryModel.allBranchesCriticalItems.filter(
                    (item) => item.branchId === b.id
                  ).length;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setKpiBranchFilter(b.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      kpiBranchFilter === b.id
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {b.code} ({branchCriticalCount})
                  </button>
                );
              })}
            </div>

            {/* Threshold Mode Filter */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setInventoryThresholdMode('BELOW_MIN')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  inventoryThresholdMode === 'BELOW_MIN'
                    ? 'bg-slate-800 text-red-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Di Bawah Min (&lt; Min)
              </button>
              <button
                type="button"
                onClick={() => setInventoryThresholdMode('AT_OR_BELOW_MIN')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  inventoryThresholdMode === 'AT_OR_BELOW_MIN'
                    ? 'bg-slate-800 text-amber-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ≤ Ambang Minimum
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="px-3 py-1.5 text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-md transition-colors flex items-center gap-1"
            >
              <span>Kelola Inventaris &amp; Restock</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Summary KPI Strip & Category Filter Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                SKU Di Bawah Minimum
              </div>
              <div className="text-lg font-bold font-mono text-red-400 tabular-nums mt-0.5">
                {criticalInventorySummaryModel.enrichedCriticalItems.length}{' '}
                <span className="text-xs font-normal text-slate-400">
                  / {criticalInventorySummaryModel.branchScopedAllItemsCount} SKU
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {criticalInventorySummaryModel.severeCriticalCount} berstatus Kritis (≤50% Min)
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                Total Defisit Stok
              </div>
              <div className="text-lg font-bold font-mono text-amber-400 tabular-nums mt-0.5">
                -{criticalInventorySummaryModel.totalDeficitUnits} Unit
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Selisih terhadap batas minimum
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                Rekomendasi Pengadaan
              </div>
              <div className="text-lg font-bold font-mono text-emerald-400 tabular-nums mt-0.5">
                +{criticalInventorySummaryModel.totalRecommendedRestockUnits} Unit
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Kuota order ke level buffer (2x Min)
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                Perlu Perbaikan / Maintenance
              </div>
              <div className="text-lg font-bold font-mono text-sky-400 tabular-nums mt-0.5">
                {criticalInventorySummaryModel.maintenanceOrDamagedCount} SKU
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Kondisi Maintenance / Rusak
              </div>
            </div>
          </div>

          {/* Category Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md self-start lg:self-center">
            {[
              { key: 'ALL', label: 'Semua Kategori' },
              { key: 'BALL', label: 'Bola' },
              { key: 'COURT_GEAR', label: 'Lapangan' },
              { key: 'TRAINING_AID', label: 'Alat Latihan' },
              { key: 'JERSEY', label: 'Jersey' },
              { key: 'MEDICAL_KIT', label: 'Medis' },
            ].map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCriticalInventoryCategoryFilter(cat.key)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                  criticalInventoryCategoryFilter === cat.key
                    ? 'bg-slate-800 text-amber-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Critical Inventory Items Grid */}
        {criticalInventorySummaryModel.enrichedCriticalItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {criticalInventorySummaryModel.enrichedCriticalItems.map((item) => {
              const isSevere =
                item.severityLevel === 'HABIS' || item.severityLevel === 'KRITIS';
              const isMaintenance =
                (item.conditionStatus || '').toUpperCase() !== 'GOOD';
              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-lg border flex flex-col justify-between gap-3 transition-colors ${
                    isSevere
                      ? 'border-red-500/40 bg-slate-950/85'
                      : 'border-amber-500/35 bg-slate-950/65 hover:border-amber-500/50'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Top Metadata Line (Clean unboxed typography per design constitution) */}
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <div className="flex items-center gap-1.5 text-slate-400 truncate">
                        <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-slate-200 font-semibold">{item.sku}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-400">{item.branchCode}</span>
                      </div>
                      <span
                        className={`font-bold uppercase ${
                          isSevere ? 'text-red-400' : 'text-amber-400'
                        }`}
                      >
                        {item.severityLevel === 'HABIS'
                          ? 'STOK HABIS'
                          : item.severityLevel === 'KRITIS'
                          ? 'KRITIS (≤50% MIN)'
                          : item.severityLevel === 'RENDAH'
                          ? 'DI BAWAH MINIMUM'
                          : 'AMBANG BATAS'}
                      </span>
                    </div>

                    {/* Item Title & Category */}
                    <div>
                      <div className="text-sm font-bold text-slate-100 leading-snug">
                        {item.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-1">
                        <span className="text-sky-400 font-medium">{item.categoryLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.branchName}</span>
                      </div>
                    </div>

                    {/* Storage Location & Condition */}
                    <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 gap-1 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Boxes className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">Lokasi: {item.storageLocation}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Wrench
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isMaintenance ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        />
                        <span className="text-slate-400">
                          Kondisi Fisik:{' '}
                          <strong
                            className={
                              isMaintenance ? 'text-amber-300 font-mono' : 'text-emerald-400 font-mono'
                            }
                          >
                            {item.conditionStatus}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stock vs Minimum Threshold Gauge & Restock Recommendation */}
                  <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-baseline justify-between gap-2 font-mono">
                      <div>
                        <span className="text-xs text-slate-400">Stok Saat Ini: </span>
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            isSevere ? 'text-red-400' : 'text-amber-400'
                          }`}
                        >
                          {item.currentStock} {item.unit}
                        </span>
                        <span className="text-xs text-slate-400">
                          {' '}
                          / Min {item.minStock} {item.unit}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold tabular-nums ${
                          isSevere ? 'text-red-400' : 'text-amber-300'
                        }`}
                      >
                        {item.deficitQty > 0
                          ? `Kurang -${item.deficitQty} ${item.unit}`
                          : 'Batas Minimum'}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full rounded bg-slate-900 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isSevere ? 'bg-red-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${item.stockRatioPct}%` }}
                      />
                    </div>

                    {item.lastTransaction && (
                      <div className="text-[11px] text-slate-400 truncate">
                        Mutasi Terakhir:{' '}
                        <span className="font-mono text-slate-300">
                          {item.lastTransaction.transactionType} (
                          {item.lastTransaction.quantityDelta > 0
                            ? `+${item.lastTransaction.quantityDelta}`
                            : item.lastTransaction.quantityDelta}
                          )
                        </span>{' '}
                        — {item.lastTransaction.referenceNote}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-mono text-emerald-400">
                        Saran Restock: +{item.recommendedRestockQty} {item.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate('inventory')}
                        className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                      >
                        <span>Mutasi / Restock</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 rounded-lg border border-slate-800/80 bg-slate-950/50 text-center space-y-2">
            <div className="text-sm font-semibold text-emerald-400">
              Seluruh stok barang pada cabang dan kategori terpilih berada di atas ambang batas minimum.
            </div>
            <p className="text-xs text-slate-400">
              Ubah filter kategori/cabang di atas atau buka modul Inventaris untuk mencatat mutasi stok baru.
            </p>
          </div>
        )}
      </div>

      {/* ============================================================================
          TARGET VS ACTUAL REVENUE PROGRESS WIDGET (CURRENT MONTH VS ANNUAL MEMBERSHIP GOALS)
          ============================================================================ */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 space-y-5">
        {/* Widget Header & Interactive Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 uppercase tracking-wider">
              <Target className="w-3.5 h-3.5" />
              <span>
                TARGET VS ACTUAL REVENUE PROGRESS • ANNUAL MEMBERSHIP GOALS (FY 2026)
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 mt-0.5">
              Progres Realisasi Koleksi Bulan Berjalan ({targetVsActualRevenueModel.selectedMonthLabel}) terhadap Target Membership Tahunan
            </h3>
            <p className="text-xs text-slate-400">
              Membandingkan penerimaan kas riil bulan berjalan (*Actual Collected*) dan tagihan berjalan (*AR Pipeline*) terhadap kuota iuran bulanan serta target pendapatan membership tahunan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Month Selector */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
              {[
                { key: '2026-10', label: "Okt '26 (Bulan Ini)" },
                { key: '2026-09', label: "Sep '26" },
                { key: '2026-08', label: "Agu '26" },
              ].map((mOpt) => (
                <button
                  key={mOpt.key}
                  type="button"
                  onClick={() => setSelectedRevenueMonth(mOpt.key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    selectedRevenueMonth === mOpt.key
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mOpt.label}
                </button>
              ))}
            </div>

            {/* Goal Basis Toggle */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setGoalBasisMode('ANNUAL_MEMBERSHIP_GOAL')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  goalBasisMode === 'ANNUAL_MEMBERSHIP_GOAL'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Target Ekspansi Tahunan
              </button>
              <button
                type="button"
                onClick={() => setGoalBasisMode('CONTRACTED_RUN_RATE')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  goalBasisMode === 'CONTRACTED_RUN_RATE'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Run-Rate Member Aktif
              </button>
            </div>
          </div>
        </div>

        {/* Main 12-Column Split:
            Left (7 cols): Dual Target vs Actual Progress Gauges + Per-Plan Progress Breakdown
            Right (5 cols): Interactive Recharts Target vs Actual Chart */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* LEFT 7 COLUMNS: PROGRESS BARS & MEMBERSHIP TIER BREAKDOWN */}
          <div className="xl:col-span-7 space-y-4">
            {/* Dual Progress Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* PROGRESS CARD 1: CURRENT MONTH COLLECTION VS MONTHLY GOAL */}
              <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/70 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono uppercase text-slate-400">
                      1. KOLEKSI BULAN INI VS TARGET BULANAN
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded border ${
                        targetVsActualRevenueModel.monthlyAchievementPct >= 100
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                          : targetVsActualRevenueModel.monthlyAchievementPct >= 75
                          ? 'bg-sky-500/15 text-sky-400 border-sky-500/40'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                      }`}
                    >
                      {targetVsActualRevenueModel.monthlyAchievementPct}% TERCAPAI
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <div>
                      <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                        {formatIDR(targetVsActualRevenueModel.currentMonthActualCollected)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Actual Tertagih ({targetVsActualRevenueModel.selectedMonthLabel})
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold font-mono text-slate-200 tabular-nums">
                        {formatIDR(targetVsActualRevenueModel.monthlyTargetAmount)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Target Bulanan (1/12 Tahunan)
                      </div>
                    </div>
                  </div>

                  {/* Multi-Segment Progress Bar (Paid + Pending AR vs Monthly Target) */}
                  <div className="mt-3 space-y-1.5">
                    <div className="h-3 w-full rounded bg-slate-900 border border-slate-800 overflow-hidden flex relative">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            targetVsActualRevenueModel.monthlyAchievementPct
                          )}%`,
                        }}
                        title={`Actual Paid: ${formatIDR(
                          targetVsActualRevenueModel.currentMonthActualCollected
                        )}`}
                      />
                      {targetVsActualRevenueModel.currentMonthPendingReceivable > 0 &&
                        targetVsActualRevenueModel.monthlyAchievementPct < 100 && (
                          <div
                            className="h-full bg-amber-400/80 transition-all duration-500"
                            style={{
                              width: `${Math.min(
                                Math.max(
                                  0,
                                  100 - targetVsActualRevenueModel.monthlyAchievementPct
                                ),
                                Math.max(
                                  0,
                                  targetVsActualRevenueModel.monthlyProjectedWithArPct -
                                    targetVsActualRevenueModel.monthlyAchievementPct
                                )
                              )}%`,
                            }}
                            title={`Piutang Berjalan (AR): ${formatIDR(
                              targetVsActualRevenueModel.currentMonthPendingReceivable
                            )}`}
                          />
                        )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span className="text-emerald-400">
                        ■ Paid: {targetVsActualRevenueModel.monthlyAchievementPct}%
                      </span>
                      <span className="text-amber-400">
                        ■ +Pipeline AR: {targetVsActualRevenueModel.monthlyProjectedWithArPct}%
                      </span>
                      <span>Target: 100%</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    {targetVsActualRevenueModel.monthlyVariance >= 0
                      ? 'Surplus di Atas Target:'
                      : 'Sisa menuju Target Bulanan:'}
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      targetVsActualRevenueModel.monthlyVariance >= 0
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {targetVsActualRevenueModel.monthlyVariance >= 0 ? '+' : ''}
                    {formatIDR(Math.abs(targetVsActualRevenueModel.monthlyVariance))}
                  </span>
                </div>
              </div>

              {/* PROGRESS CARD 2: YTD COLLECTION & CURRENT MONTH CONTRIBUTION VS ANNUAL MEMBERSHIP GOAL */}
              <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/70 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono uppercase text-slate-400">
                      2. REALISASI YTD VS GOAL MEMBERSHIP TAHUNAN
                    </span>
                    <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded border bg-sky-500/15 text-sky-400 border-sky-500/40">
                      {targetVsActualRevenueModel.annualAchievementPct}% DARI GOAL TAHUNAN
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <div>
                      <div className="text-xl font-bold font-mono text-sky-400 tabular-nums">
                        {formatIDR(targetVsActualRevenueModel.ytdActualCollected)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Realisasi Koleksi Kumulatif (YTD)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold font-mono text-slate-200 tabular-nums">
                        {formatIDR(targetVsActualRevenueModel.annualGoalAmount)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Goal Membership Tahunan (12 Bln)
                      </div>
                    </div>
                  </div>

                  {/* Annual Membership Goal Progress Bar with Quarterly Ticks */}
                  <div className="mt-3 space-y-1.5">
                    <div className="h-3 w-full rounded bg-slate-900 border border-slate-800 overflow-hidden flex relative">
                      <div
                        className="h-full bg-sky-500 transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            targetVsActualRevenueModel.annualAchievementPct
                          )}%`,
                        }}
                      />
                      <div
                        className="h-full bg-emerald-400 transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            Math.max(
                              0,
                              100 - targetVsActualRevenueModel.annualAchievementPct
                            ),
                            targetVsActualRevenueModel.currentMonthShareOfAnnualGoalPct
                          )}%`,
                        }}
                        title={`Kontribusi Bulan ${targetVsActualRevenueModel.selectedMonthLabel}: ${targetVsActualRevenueModel.currentMonthShareOfAnnualGoalPct}%`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>Q1 (25%)</span>
                      <span>Q2 (50%)</span>
                      <span>Q3 (75%)</span>
                      <span className="text-emerald-400">
                        Bulan Ini: +{targetVsActualRevenueModel.currentMonthShareOfAnnualGoalPct}%
                      </span>
                      <span>FY (100%)</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Sisa Target Membership Tahunan:</span>
                  <span className="font-mono font-bold text-slate-200 tabular-nums">
                    {formatIDR(targetVsActualRevenueModel.remainingAnnualGoal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Per-Membership Plan Target vs Actual Breakdown Table */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    Rincian Target vs Realisasi per Paket Membership Akademi
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {targetVsActualRevenueModel.planBreakdown.length} Paket Aktif
                </span>
              </div>
              <div className="divide-y divide-slate-800/60">
                {targetVsActualRevenueModel.planBreakdown.map((plan) => (
                  <div key={plan.planId} className="px-4 py-3 space-y-2 hover:bg-slate-900/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-100">
                            {plan.planName}
                          </span>
                          <span className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-900 border border-slate-700 text-amber-400 rounded">
                            {plan.planCode}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Member Aktif: {plan.enrolledActive} / Kuota Target: {plan.targetMemberCount} Atlet • Goal Tahunan:{' '}
                          <span className="text-slate-200">{formatIDR(plan.annualGoal)}</span>
                        </div>
                      </div>
                      <div className="text-left sm:text-right font-mono">
                        <div className="text-xs font-bold text-emerald-400 tabular-nums">
                          {formatIDR(plan.currentMonthActual)}{' '}
                          <span className="text-slate-500 font-normal">
                            / {formatIDR(plan.monthlyGoal)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 tabular-nums">
                          Bulan Ini: {plan.monthAchievementPct}% • YTD: {formatIDR(plan.ytdActual)} ({plan.annualAchievementPct}% Thn)
                        </div>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded bg-slate-900 overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, plan.monthAchievementPct)}%` }}
                      />
                      {plan.currentMonthPending > 0 && plan.monthAchievementPct < 100 && (
                        <div
                          className="h-full bg-amber-400/80"
                          style={{
                            width: `${Math.min(
                              100 - plan.monthAchievementPct,
                              Math.round((plan.currentMonthPending / plan.monthlyGoal) * 100)
                            )}%`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT 5 COLUMNS: RECHARTS TARGET VS ACTUAL VISUALIZATION */}
          <div className="xl:col-span-5 rounded-lg border border-slate-800 bg-slate-950/70 p-4 flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">
                    Grafik Target vs Actual Membership
                  </h4>
                  <p className="text-xs text-slate-400">
                    {revenueWidgetChartMode === 'BY_PLAN'
                      ? `Perbandingan Target Bulanan vs Realisasi (${targetVsActualRevenueModel.selectedMonthLabel}) per Paket`
                      : 'Trajektori Koleksi Bulanan & Capaian Kumulatif terhadap Goal Tahunan'}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md self-start">
                  <button
                    type="button"
                    onClick={() => setRevenueWidgetChartMode('BY_PLAN')}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                      revenueWidgetChartMode === 'BY_PLAN'
                        ? 'bg-slate-800 text-emerald-400 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Per Paket
                  </button>
                  <button
                    type="button"
                    onClick={() => setRevenueWidgetChartMode('MONTHLY_TRAJECTORY')}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                      revenueWidgetChartMode === 'MONTHLY_TRAJECTORY'
                        ? 'bg-slate-800 text-emerald-400 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Trajektori Tahunan
                  </button>
                </div>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {revenueWidgetChartMode === 'BY_PLAN' ? (
                    <BarChart
                      data={targetVsActualRevenueModel.planBreakdown}
                      margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis
                        dataKey="shortLabel"
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <YAxis
                        unit=" Jt"
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <Tooltip
                        formatter={(value: unknown, name: unknown) => [
                          `Rp ${(Number(value || 0) * 1_000_000).toLocaleString('id-ID')} (${value} Jt)`,
                          String(name || ''),
                        ]}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#f8fafc',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar
                        dataKey="targetBulananJuta"
                        name="Target Bulanan (Juta IDR)"
                        fill="#475569"
                        radius={[4, 4, 0, 0]}
                        barSize={22}
                      />
                      <Bar
                        dataKey="actualBulanIniJuta"
                        name="Actual Tertagih (Juta IDR)"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                        barSize={22}
                      />
                      <Bar
                        dataKey="piutangBulanIniJuta"
                        name="Pipeline AR (Juta IDR)"
                        fill="#f59e0b"
                        radius={[4, 4, 0, 0]}
                        barSize={22}
                      />
                    </BarChart>
                  ) : (
                    <ComposedChart
                      data={targetVsActualRevenueModel.monthlyTrajectorySeries}
                      margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <YAxis
                        yAxisId="juta"
                        unit=" Jt"
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <YAxis
                        yAxisId="pct"
                        orientation="right"
                        domain={[0, 100]}
                        unit="%"
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#f8fafc',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar
                        yAxisId="juta"
                        dataKey="actualKoleksiJuta"
                        name="Actual Koleksi Bulanan (Jt)"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                        barSize={22}
                      />
                      <Line
                        yAxisId="juta"
                        type="monotone"
                        dataKey="targetBulananJuta"
                        name="Target Bulanan Membership (Jt)"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                      <Line
                        yAxisId="pct"
                        type="monotone"
                        dataKey="progresGoalTahunanPct"
                        name="Progres Goal Tahunan (%)"
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#38bdf8' }}
                      />
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <div className="text-slate-400">
                Proyeksi Lunas + AR:{' '}
                <span className="font-mono font-bold text-emerald-400">
                  {targetVsActualRevenueModel.monthlyProjectedWithArPct}%
                </span>{' '}
                dari Target Bulan Ini
              </div>
              <button
                type="button"
                onClick={() => onNavigate('finance')}
                className="font-semibold text-amber-400 hover:text-amber-300"
              >
                Buka Billing &amp; Membership →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================================
          QUARTERLY COMMAND CENTER & KPI ANALYTICS HUB (RECHARTS)
          Visualizes Athlete Attendance Trends & Financial Collection Growth over Current Quarter
          ============================================================================ */}
      {showRealtimeKpiCharts && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-5 space-y-6">
          {/* Top Filter & Quarter Scope Control Bar */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-amber-400 uppercase">
                <Activity className="w-3.5 h-3.5" />
                <span>
                  PUSAT KOMANDO &amp; KPI KUARTAL BERJALAN • RECHARTS ANALYTICS ENGINE
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-100 mt-0.5">
                Visualisasi Tren Kehadiran Atlet &amp; Pertumbuhan Koleksi Keuangan Kuartal Berjalan
              </h3>
              <p className="text-xs text-slate-400">
                Analitik terpadu berbasis data riil PostgreSQL untuk memantau disiplin kehadiran latihan, tingkat ketepatan waktu, serta akselerasi penagihan invoice dan arus kas kuartalan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Quarter Scope Selector */}
              <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => setQuarterScope('ROLLING_QUARTER')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    quarterScope === 'ROLLING_QUARTER'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Kuartal Berjalan (Agu–Okt &apos;26)
                </button>
                <button
                  type="button"
                  onClick={() => setQuarterScope('Q3_2026')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    quarterScope === 'Q3_2026'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Q3 2026 (Jul–Sep)
                </button>
                <button
                  type="button"
                  onClick={() => setQuarterScope('Q4_2026')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    quarterScope === 'Q4_2026'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Q4 2026 (Okt–Des)
                </button>
              </div>

              {/* Granularity Toggle */}
              <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => setQuarterGranularity('BIWEEKLY')}
                  className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                    quarterGranularity === 'BIWEEKLY'
                      ? 'bg-slate-800 text-emerald-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Per 2 Minggu
                </button>
                <button
                  type="button"
                  onClick={() => setQuarterGranularity('MONTHLY')}
                  className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                    quarterGranularity === 'MONTHLY'
                      ? 'bg-slate-800 text-emerald-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Per Bulan
                </button>
              </div>

              {/* Branch Filter */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => setKpiBranchFilter('ALL')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    kpiBranchFilter === 'ALL'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Semua Cabang ({state.athletes.length})
                </button>
                {state.branches.map((b) => {
                  const count = state.athletes.filter((a) => a.branchId === b.id).length;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setKpiBranchFilter(b.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                        kpiBranchFilter === b.id
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {b.code} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* PRIMARY 2-COLUMN QUARTERLY RECHARTS ROW:
              Left (6 cols): Athlete Attendance Trends over Current Quarter
              Right (6 cols): Financial Collection Growth over Current Quarter */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* PANEL 1: ATHLETE ATTENDANCE TRENDS OVER CURRENT QUARTER (6 Columns) */}
            <div className="xl:col-span-6 rounded-lg border border-slate-800 bg-slate-950/60 p-4 flex flex-col justify-between">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-sm font-semibold text-slate-100">
                        Tren Kehadiran Atlet Kuartal Berjalan
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Persentase kehadiran latihan terhadap target KPI (≥{targetKpiPct}%), disiplin tepat waktu, dan rincian status presensi
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md self-start">
                    <button
                      type="button"
                      onClick={() => setAttendanceTrendTab('QUARTER_TREND')}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                        attendanceTrendTab === 'QUARTER_TREND'
                          ? 'bg-slate-800 text-emerald-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Kurva Tren (%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTrendTab('STATUS_STACK')}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                        attendanceTrendTab === 'STATUS_STACK'
                          ? 'bg-slate-800 text-emerald-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Komposisi Sesi
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTrendTab('DISTRIBUTION')}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                        attendanceTrendTab === 'DISTRIBUTION'
                          ? 'bg-slate-800 text-emerald-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Proporsi
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTrendTab('BY_TEAM')}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                        attendanceTrendTab === 'BY_TEAM'
                          ? 'bg-slate-800 text-emerald-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Per Tim
                    </button>
                  </div>
                </div>

                {attendanceTrendTab === 'QUARTER_TREND' && (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={quarterlyAttendanceTrendData}
                        margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="gradQuarterAttendance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.38} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <YAxis
                          yAxisId="pct"
                          domain={[0, 100]}
                          unit="%"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <YAxis
                          yAxisId="count"
                          orientation="right"
                          allowDecimals={false}
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#f8fafc',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                        <ReferenceLine
                          yAxisId="pct"
                          y={targetKpiPct}
                          stroke="#f59e0b"
                          strokeDasharray="4 4"
                          label={{
                            value: `Target KPI ${targetKpiPct}%`,
                            fill: '#f59e0b',
                            fontSize: 10,
                            position: 'insideTopRight',
                          }}
                        />
                        <Bar
                          yAxisId="count"
                          dataKey="totalPresensi"
                          name="Total Check-In (Log)"
                          fill="#38bdf8"
                          fillOpacity={0.45}
                          radius={[4, 4, 0, 0]}
                          barSize={24}
                        />
                        <Area
                          yAxisId="pct"
                          type="monotone"
                          dataKey="kehadiranRatePct"
                          name="Tingkat Kehadiran Aktif (%)"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#gradQuarterAttendance)"
                        />
                        <Line
                          yAxisId="pct"
                          type="monotone"
                          dataKey="tepatWaktuPct"
                          name="Rasio Tepat Waktu (%)"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={{ r: 3.5, fill: '#f59e0b' }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {attendanceTrendTab === 'STATUS_STACK' && (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={quarterlyAttendanceTrendData}
                        margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <YAxis
                          allowDecimals={false}
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#f8fafc',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                        <Bar
                          dataKey="hadirTepatWaktu"
                          name="Hadir Tepat Waktu"
                          stackId="att"
                          fill="#10b981"
                          barSize={26}
                        />
                        <Bar
                          dataKey="hadirTerlambat"
                          name="Hadir Terlambat"
                          stackId="att"
                          fill="#f59e0b"
                          barSize={26}
                        />
                        <Bar
                          dataKey="izinSakit"
                          name="Izin / Sakit Resmi"
                          stackId="att"
                          fill="#38bdf8"
                          barSize={26}
                        />
                        <Bar
                          dataKey="tanpaKeterangan"
                          name="Tanpa Keterangan"
                          stackId="att"
                          fill="#ef4444"
                          radius={[4, 4, 0, 0]}
                          barSize={26}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {attendanceTrendTab === 'DISTRIBUTION' && (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center h-72">
                    <div className="sm:col-span-6 h-60 w-full relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={attendanceDistributionData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={78}
                            paddingAngle={3}
                          >
                            {attendanceDistributionData.map((entry) => (
                              <Cell
                                key={entry.status}
                                fill={entry.color}
                                stroke="#0f172a"
                                strokeWidth={2}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '8px',
                              fontSize: '12px',
                              color: '#f8fafc',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-xl font-bold font-mono text-slate-100 tabular-nums">
                          {scopedAttendanceRate}%
                        </span>
                        <span className="text-[10px] font-mono uppercase text-emerald-400">
                          Hadir Aktif
                        </span>
                      </div>
                    </div>

                    <div className="sm:col-span-6 space-y-2.5">
                      {attendanceDistributionData.map((item) => (
                        <div
                          key={item.status}
                          className="p-2.5 rounded border border-slate-800/90 bg-slate-900/50 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-200 truncate">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {item.description}
                              </div>
                            </div>
                          </div>
                          <div className="text-right font-mono shrink-0">
                            <div className="text-xs font-bold text-slate-100 tabular-nums">
                              {item.value} log
                            </div>
                            <div className="text-[10px] text-slate-400 tabular-nums">
                              {item.percentage}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {attendanceTrendTab === 'BY_TEAM' && (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={teamAttendanceKpiData}
                        margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                          dataKey="teamCode"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#f8fafc',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                        <Bar
                          dataKey="kehadiranPct"
                          name="Kehadiran Tim (%)"
                          fill="#10b981"
                          radius={[4, 4, 0, 0]}
                          barSize={22}
                        />
                        <Bar
                          dataKey="rataSkorEvaluasi"
                          name="Rata-rata Evaluasi"
                          fill="#f59e0b"
                          radius={[4, 4, 0, 0]}
                          barSize={22}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Bottom Summary Metrics for Quarterly Attendance */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-slate-400">Rata-rata Kehadiran Kuartal</div>
                  <div
                    className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
                      quarterAttendanceSummary.avgRate >= targetKpiPct
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {quarterAttendanceSummary.avgRate}% (Target ≥{targetKpiPct}%)
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Ketepatan Waktu (On-Time)</div>
                  <div className="text-sm font-bold font-mono text-sky-400 tabular-nums mt-0.5">
                    {quarterAttendanceSummary.onTimePct}% ({quarterAttendanceSummary.totalOnTime} Log)
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Total Sesi &amp; Presensi</div>
                  <div className="text-sm font-bold font-mono text-slate-100 tabular-nums mt-0.5">
                    {quarterAttendanceSummary.totalSessionsInQuarter} Sesi •{' '}
                    {quarterAttendanceSummary.totalLogs} Log
                  </div>
                </div>
                <div className="flex flex-col justify-between">
                  <div className="text-slate-400">Aksi Cepat Lapangan</div>
                  <button
                    type="button"
                    onClick={() => onNavigate('training')}
                    className="text-left font-semibold text-amber-400 hover:text-amber-300 mt-0.5"
                  >
                    Buka Presensi Latihan →
                  </button>
                </div>
              </div>
            </div>

            {/* PANEL 2: FINANCIAL COLLECTION GROWTH OVER CURRENT QUARTER (6 Columns) */}
            <div className="xl:col-span-6 rounded-lg border border-slate-800 bg-slate-950/60 p-4 flex flex-col justify-between">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Landmark className="w-4 h-4 text-sky-400" />
                      <h4 className="text-sm font-semibold text-slate-100">
                        Pertumbuhan Koleksi Keuangan Kuartal Berjalan
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Akselerasi penerimaan pembayaran invoice (Paid), tagihan diterbitkan, serta distribusi kanal pembayaran (Juta IDR)
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md self-start">
                    <button
                      type="button"
                      onClick={() => setFinanceChartTab('COLLECTION_GROWTH')}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                        financeChartTab === 'COLLECTION_GROWTH'
                          ? 'bg-slate-800 text-sky-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Pertumbuhan Koleksi
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinanceChartTab('PAYMENT_CHANNELS')}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                        financeChartTab === 'PAYMENT_CHANNELS'
                          ? 'bg-slate-800 text-sky-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Kanal QRIS &amp; Bank
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinanceChartTab('CASHFLOW_MARGIN')}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                        financeChartTab === 'CASHFLOW_MARGIN'
                          ? 'bg-slate-800 text-sky-400 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Koleksi vs Beban
                    </button>
                  </div>
                </div>

                {financeChartTab === 'COLLECTION_GROWTH' && (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={quarterlyFinancialGrowthData}
                        margin={{ top: 10, right: 16, left: -8, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="gradQuarterCollection" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.38} />
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <YAxis
                          unit=" Jt"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <Tooltip
                          formatter={(value: unknown, name: unknown) => [
                            `Rp ${(Number(value || 0) * 1_000_000).toLocaleString('id-ID')} (${value} Jt)`,
                            String(name || ''),
                          ]}
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#f8fafc',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                        <Area
                          type="monotone"
                          dataKey="koleksiKumulatifJuta"
                          name="Koleksi Kas Kumulatif (Juta IDR)"
                          stroke="#38bdf8"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#gradQuarterCollection)"
                        />
                        <Bar
                          dataKey="koleksiPeriodeJuta"
                          name="Penerimaan Masuk Periode (Juta IDR)"
                          fill="#10b981"
                          radius={[4, 4, 0, 0]}
                          barSize={22}
                        />
                        <Bar
                          dataKey="piutangPeriodeJuta"
                          name="Piutang Tagihan / AR (Juta IDR)"
                          fill="#f59e0b"
                          radius={[4, 4, 0, 0]}
                          barSize={22}
                        />
                        <Line
                          type="monotone"
                          dataKey="tagihanKumulatifJuta"
                          name="Total Tagihan Kumulatif (Juta IDR)"
                          stroke="#a855f7"
                          strokeWidth={2}
                          dot={{ r: 3.5, fill: '#a855f7' }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {financeChartTab === 'PAYMENT_CHANNELS' && (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={quarterlyFinancialGrowthData}
                        margin={{ top: 10, right: 16, left: -8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <YAxis
                          yAxisId="juta"
                          unit=" Jt"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <YAxis
                          yAxisId="rate"
                          orientation="right"
                          domain={[0, 100]}
                          unit="%"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#f8fafc',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                        <Bar
                          yAxisId="juta"
                          dataKey="qrisJuta"
                          name="QRIS Terpadu (Juta IDR)"
                          stackId="pay"
                          fill="#10b981"
                          barSize={26}
                        />
                        <Bar
                          yAxisId="juta"
                          dataKey="bankTransferJuta"
                          name="Transfer Bank VA (Juta IDR)"
                          stackId="pay"
                          fill="#38bdf8"
                          barSize={26}
                        />
                        <Bar
                          yAxisId="juta"
                          dataKey="ewalletTunaiJuta"
                          name="E-Wallet & Lainnya (Juta IDR)"
                          stackId="pay"
                          fill="#f59e0b"
                          radius={[4, 4, 0, 0]}
                          barSize={26}
                        />
                        <Line
                          yAxisId="rate"
                          type="monotone"
                          dataKey="collectionRatePct"
                          name="Rasio Kolektibilitas (%)"
                          stroke="#e2e8f0"
                          strokeWidth={2}
                          dot={{ r: 3.5, fill: '#e2e8f0' }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {financeChartTab === 'CASHFLOW_MARGIN' && (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={quarterlyFinancialGrowthData}
                        margin={{ top: 10, right: 16, left: -8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <YAxis
                          unit=" Jt"
                          stroke="#64748b"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          axisLine={{ stroke: '#334155' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#f8fafc',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                        <Bar
                          dataKey="koleksiPeriodeJuta"
                          name="Koleksi Pendapatan (Juta IDR)"
                          fill="#10b981"
                          radius={[4, 4, 0, 0]}
                          barSize={22}
                        />
                        <Bar
                          dataKey="bebanPeriodeJuta"
                          name="Beban Operasional (Juta IDR)"
                          fill="#ef4444"
                          radius={[4, 4, 0, 0]}
                          barSize={22}
                        />
                        <Line
                          type="monotone"
                          dataKey="surplusPeriodeJuta"
                          name="Surplus Kas Bersih (Juta IDR)"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          dot={{ r: 3.5, fill: '#f59e0b' }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Bottom Summary Metrics for Quarterly Financial Collection Growth */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-slate-400">Koleksi Kuartal (Paid)</div>
                  <div className="text-sm font-bold font-mono text-emerald-400 tabular-nums mt-0.5">
                    {formatIDR(quarterFinanceSummary.totalQuarterCollected)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Pertumbuhan Kumulatif</div>
                  <div className="text-sm font-bold font-mono text-sky-400 tabular-nums mt-0.5">
                    +{quarterFinanceSummary.cumulativeGrowthPct}% ({quarterFinanceSummary.collectionRate}% Lunas)
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Sisa Piutang (AR Kuartal)</div>
                  <div className="text-sm font-bold font-mono text-amber-400 tabular-nums mt-0.5">
                    {formatIDR(quarterFinanceSummary.totalQuarterReceivable)}
                  </div>
                </div>
                <div className="flex flex-col justify-between">
                  <div className="text-slate-400">Buku Besar &amp; Invoice</div>
                  <button
                    type="button"
                    onClick={() => onNavigate('finance')}
                    className="text-left font-semibold text-amber-400 hover:text-amber-300 mt-0.5"
                  >
                    Kelola Tagihan &amp; Kas →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECONDARY RECHARTS ROW: MONTHLY ATHLETE ACQUISITION & REGISTRATION CHANNELS */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-semibold text-slate-100">
                    Tren Akuisisi Atlet Bulanan &amp; Kanal Pendaftaran (6 Bulan Terakhir)
                  </h4>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Perkembangan jumlah atlet kumulatif, retensi atlet aktif, serta pendaftar baru melalui kanal Online vs Offline
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md self-start">
                <button
                  type="button"
                  onClick={() => setGrowthChartMode('CUMULATIVE')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                    growthChartMode === 'CUMULATIVE'
                      ? 'bg-slate-800 text-amber-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Kumulatif &amp; Target
                </button>
                <button
                  type="button"
                  onClick={() => setGrowthChartMode('CHANNEL')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                    growthChartMode === 'CHANNEL'
                      ? 'bg-slate-800 text-amber-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Online vs Offline
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-center">
              <div className="xl:col-span-8 h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {growthChartMode === 'CUMULATIVE' ? (
                    <ComposedChart
                      data={monthlyAthleteGrowthData}
                      margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorTotalAtlet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#f8fafc',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Area
                        type="monotone"
                        dataKey="totalAtlet"
                        name="Total Atlet Kumulatif"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorTotalAtlet)"
                      />
                      <Bar
                        dataKey="pendaftarBaru"
                        name="Pendaftar Baru Bulanan"
                        fill="#38bdf8"
                        radius={[4, 4, 0, 0]}
                        barSize={22}
                      />
                      <Line
                        type="monotone"
                        dataKey="atletAktif"
                        name="Atlet Berstatus Aktif"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3.5, fill: '#10b981' }}
                      />
                    </ComposedChart>
                  ) : (
                    <BarChart
                      data={monthlyAthleteGrowthData}
                      margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#f8fafc',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar
                        dataKey="pendaftaranOnline"
                        name="Pendaftaran Online Mandiri"
                        stackId="channel"
                        fill="#10b981"
                        radius={[0, 0, 0, 0]}
                        barSize={26}
                      />
                      <Bar
                        dataKey="pendaftaranOffline"
                        name="Pendaftaran Offline (Walk-In)"
                        stackId="channel"
                        fill="#f59e0b"
                        radius={[4, 4, 0, 0]}
                        barSize={26}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              <div className="xl:col-span-4 grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded border border-slate-800 bg-slate-900/60">
                  <div className="text-slate-400">Total Atlet Terdaftar</div>
                  <div className="text-base font-bold font-mono text-slate-100 tabular-nums mt-1">
                    {scopedAthletes.length} Atlet
                  </div>
                </div>
                <div className="p-3 rounded border border-slate-800 bg-slate-900/60">
                  <div className="text-slate-400 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-emerald-400" />
                    <span>Kanal Online</span>
                  </div>
                  <div className="text-base font-bold font-mono text-emerald-400 tabular-nums mt-1">
                    {onlineAthletesCount} (
                    {scopedAthletes.length > 0
                      ? Math.round((onlineAthletesCount / scopedAthletes.length) * 100)
                      : 0}
                    %)
                  </div>
                </div>
                <div className="p-3 rounded border border-slate-800 bg-slate-900/60">
                  <div className="text-slate-400">Kanal Offline (Walk-In)</div>
                  <div className="text-base font-bold font-mono text-amber-400 tabular-nums mt-1">
                    {offlineAthletesCount} (
                    {scopedAthletes.length > 0
                      ? Math.round((offlineAthletesCount / scopedAthletes.length) * 100)
                      : 0}
                    %)
                  </div>
                </div>
                <div className="p-3 rounded border border-slate-800 bg-slate-900/60">
                  <div className="text-slate-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-sky-400" />
                    <span>Pas Foto 3x4/4x6</span>
                  </div>
                  <div className="text-base font-bold font-mono text-sky-400 tabular-nums mt-1">
                    {verifiedPhotosCount}/{scopedAthletes.length} Lengkap
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Branch & Operational Status Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Upcoming Training & Recent Evaluations */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Jadwal Latihan & Sesi Lapangan Terkini
                </h3>
                <p className="text-xs text-slate-400">
                  Integrasi langsung dengan presensi atlet dan perhitungan kompensasi sesi pelatih
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('training')}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300"
              >
                Buka Modul Latihan →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/60">
                    <th className="py-3 px-4">Tanggal & Jam</th>
                    <th className="py-3 px-4">Topik / Kurikulum</th>
                    <th className="py-3 px-4">Tim & Lapangan</th>
                    <th className="py-3 px-4">Pelatih</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {scopedSessions.slice(0, 6).map((session) => {
                    const team = state.teams.find((t) => t.id === session.teamId);
                    const coach = state.coaches.find((c) => c.id === session.coachId);
                    return (
                      <tr key={session.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-mono text-xs text-slate-200 whitespace-nowrap">
                          <div>{session.sessionDate}</div>
                          <div className="text-slate-400">
                            {session.startTime} - {session.endTime}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-100">{session.topic}</div>
                          {session.trainingNotes && (
                            <div className="text-xs text-slate-400 truncate max-w-xs">
                              {session.trainingNotes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-300">
                          <div className="font-semibold">{team?.name || '-'}</div>
                          <div className="text-slate-400">{session.courtName}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-300">
                          {coach?.fullName || '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <StatusText status={session.status} />
                        </td>
                      </tr>
                    );
                  })}
                  {scopedSessions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                        Belum ada sesi latihan terjadwal untuk cabang terpilih.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Evaluations & Match Results */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-slate-100">Rapor Evaluasi Atlet Terbaru</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('training')}
                  className="text-xs text-amber-400 hover:underline"
                >
                  Detail
                </button>
              </div>
              <div className="space-y-3">
                {state.playerEvaluations.slice(0, 4).map((ev) => {
                  const athlete = state.athletes.find((a) => a.id === ev.athleteId);
                  return (
                    <div
                      key={ev.id}
                      className="p-3 rounded border border-slate-800/80 bg-slate-950/40 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-100">
                          {athlete?.fullName || 'Atlet'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {ev.periodLabel} • {ev.evaluationDate}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-sm font-bold text-amber-400">{ev.overallScore}</div>
                        <div className="text-[10px] text-slate-400">
                          T:{ev.technicalAvg} P:{ev.physicalAvg} M:{ev.mentalAvg}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {state.playerEvaluations.length === 0 && (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Belum ada rapor evaluasi yang dicatat.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-slate-100">Kompetisi & Pertandingan</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('competition')}
                  className="text-xs text-amber-400 hover:underline"
                >
                  Detail
                </button>
              </div>
              <div className="space-y-3">
                {state.matches.slice(0, 4).map((m) => {
                  const team = state.teams.find((t) => t.id === m.teamId);
                  return (
                    <div
                      key={m.id}
                      className="p-3 rounded border border-slate-800/80 bg-slate-950/40 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-100">
                          {team?.name || 'CBTC'} vs {m.opponentName}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {m.matchDate} • {m.venue}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold text-slate-100">
                          {m.ourScore} : {m.opponentScore}
                        </div>
                        <StatusText status={m.status} />
                      </div>
                    </div>
                  );
                })}
                {state.matches.length === 0 && (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Belum ada pertandingan terdaftar.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Multi-Branch Overview, Medical Alerts, Inventory & Announcements */}
        <div className="space-y-6">
          {/* Branches Card */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-100">Kinerja Multi-Cabang</h3>
              </div>
              <span className="text-xs font-mono text-slate-400">{state.branches.length} Cabang</span>
            </div>
            <div className="space-y-3">
              {state.branches.map((branch) => {
                const branchAthletes = state.athletes.filter((a) => a.branchId === branch.id).length;
                const branchTeams = state.teams.filter((t) => t.branchId === branch.id).length;
                return (
                  <div
                    key={branch.id}
                    className="p-3 rounded border border-slate-800/80 bg-slate-950/50 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-100">
                        {branch.name} <span className="font-mono text-amber-400">({branch.code})</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {branch.city} • {branch.courtsCount} Lapangan
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <div className="text-slate-200">{branchAthletes} Atlet</div>
                      <div className="text-slate-400">{branchTeams} Tim</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Medical & Inventory Operational Alerts */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-slate-100">Peringatan Medis & Logistik</h3>
              </div>
              <span className="font-mono text-xs text-slate-400">
                {activeInjuries.length + lowStockItems.length} Atensi
              </span>
            </div>

            {activeInjuries.map((inj) => {
              const athlete = state.athletes.find((a) => a.id === inj.athleteId);
              return (
                <div
                  key={inj.id}
                  className="p-3 rounded border border-red-900/40 bg-red-950/15 flex items-start justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold text-red-200">
                      {athlete?.fullName || 'Atlet'} — {inj.bodyPart}
                    </div>
                    <div className="text-[11px] text-slate-400">{inj.diagnosis}</div>
                  </div>
                  <StatusText status={inj.returnToPlayStatus} />
                </div>
              );
            })}

            {lowStockItems.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded border border-amber-900/40 bg-amber-950/15 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-amber-200">{item.name}</div>
                    <div className="text-[11px] text-slate-400">
                      Lokasi: {item.storageLocation} (Min: {item.minStock})
                    </div>
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold text-amber-400">
                  Stok: {item.currentStock} {item.unit}
                </span>
              </div>
            ))}

            {activeInjuries.length === 0 && lowStockItems.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-2">
                Seluruh atlet siap tanding (Cleared) dan stok inventaris aman.
              </p>
            )}
          </div>

          {/* Announcements Feed */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-100">Pengumuman Akademi</h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('comm_admin')}
                className="text-xs text-amber-400 hover:underline"
              >
                Semua
              </button>
            </div>
            <div className="space-y-3">
              {state.announcements.slice(0, 3).map((ann) => (
                <div key={ann.id} className="p-3 rounded border border-slate-800/80 bg-slate-950/40">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-100">{ann.title}</span>
                    <StatusText status={ann.priority} />
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2">{ann.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
