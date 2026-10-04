import React, { useState, useMemo } from 'react';
import {
  Plus,
  Calculator,
  CheckCircle2,
  Package,
  ArrowRightLeft,
  AlertTriangle,
  QrCode,
  Download,
  Copy,
  ClipboardCheck,
  RotateCcw,
  Wrench,
  ShieldAlert,
  Search,
  UserCheck,
  MapPin,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { SystemState } from '../types/system.ts';
import { apiRequest, formatIDR } from '../lib/api.ts';
import { hasPermission } from '../lib/rbac.ts';
import { Modal, StatusText } from '../components/ui/Primitives.tsx';
import {
  QrCodeSvg,
  QrPersonIdentity,
  downloadDigitalQrCardSvg,
} from '../components/ui/DigitalQrPassHub.tsx';

interface HrPayrollInventoryViewProps {
  state: SystemState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function HrPayrollInventoryView({
  state,
  onRefresh,
  notify,
}: HrPayrollInventoryViewProps) {
  const [subTab, setSubTab] = useState<'personnel' | 'contracts' | 'payroll' | 'inventory'>(
    'inventory'
  );
  const [modalType, setModalType] = useState<
    | null
    | 'coach'
    | 'staff'
    | 'employment'
    | 'generate_payroll'
    | 'inv_item'
    | 'inv_tx'
    | 'coach_loan'
    | 'return_loan'
    | 'inspect_condition'
  >(null);
  const [selectedQrPerson, setSelectedQrPerson] = useState<QrPersonIdentity | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filters for Inventory & Asset Management
  const [invCategoryFilter, setInvCategoryFilter] = useState<
    'ALL' | 'BALL' | 'JERSEY' | 'TRAINING_AID' | 'COURT_GEAR' | 'MEDICAL_KIT'
  >('ALL');
  const [invConditionFilter, setInvConditionFilter] = useState<
    'ALL' | 'GOOD' | 'MAINTENANCE' | 'DAMAGED'
  >('ALL');
  const [invSearchQuery, setInvSearchQuery] = useState('');
  const [loanStatusFilter, setLoanStatusFilter] = useState<'ALL' | 'BORROWED' | 'RETURNED'>(
    'ALL'
  );

  const role = state.currentUser.activeRoleCode;
  const canCreateHr = hasPermission(role, 'hr', 'create');
  const canCreatePayroll = hasPermission(role, 'payroll', 'create');
  const canApprovePayroll = hasPermission(role, 'payroll', 'approve');
  const canCreateInventory = hasPermission(role, 'inventory', 'create');
  const canProcessInventory = hasPermission(role, 'inventory', 'process');
  const canUpdateInventory = hasPermission(role, 'inventory', 'update');

  const [coachForm, setCoachForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    fullName: '',
    phone: '',
    email: '',
    licenseLevel: 'FIBA Level 1 / PERBASI A',
    specialization: 'Player Development & Tactical Offense',
    isHeadCoach: false,
    coachType: 'FULL_TIME',
  });

  const [staffForm, setStaffForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    fullName: '',
    department: 'OPERATIONS',
    positionTitle: 'Koordinator Operasional Lapangan',
    phone: '',
    email: '',
  });

  const [employmentForm, setEmploymentForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    coachId: state.coaches[0]?.id || '',
    staffId: '',
    personnelName: state.coaches[0]?.fullName || '',
    employmentType: 'FULL_TIME_COACH',
    contractNumber: `CTR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    startDate: '2026-01-01',
    monthlySalary: '6500000',
    sessionRate: '250000',
    defaultBonus: '500000',
    defaultIncentive: '250000',
    defaultDeduction: '0',
  });

  const [payrollGenForm, setPayrollGenForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    periodMonth: String(new Date().getMonth() + 1),
    periodYear: String(new Date().getFullYear()),
  });

  const [invItemForm, setInvItemForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    sku: '',
    name: '',
    category: 'BALL',
    storageLocation: 'Gudang Utama Court A',
    unit: 'PCS',
    minStock: '5',
    initialPurchaseQty: '20',
  });

  const [invTxForm, setInvTxForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    itemId: state.inventoryItems[0]?.id || '',
    transactionType: 'ISSUE',
    quantity: '2',
    targetLocation: 'Court A Session',
    conditionAfter: 'GOOD',
    referenceNote: 'Pemakaian latihan reguler U-16',
  });

  // Coach Equipment Borrowing Form (Multi-Item / Single-Item for Bola, Seragam, Peralatan Latihan)
  const [coachLoanForm, setCoachLoanForm] = useState<{
    branchId: string;
    coachName: string;
    teamName: string;
    courtLocation: string;
    expectedReturnTime: string;
    purposeNote: string;
    items: Array<{
      itemId: string;
      quantity: number;
      conditionOut: 'GOOD' | 'MAINTENANCE' | 'DAMAGED';
    }>;
  }>({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    coachName: state.coaches[0]?.fullName || 'Coach Budi Santoso',
    teamName: state.teams[0]?.name || 'Garuda U-16 Putra',
    courtLocation: 'Court A • Main FIBA Wood Flooring',
    expectedReturnTime: '18:30 WIB',
    purposeNote: 'Sesi Latihan Taktikal, Scrimmage 5v5 & Fundamental Shooting',
    items: [
      {
        itemId:
          state.inventoryItems.find((i) => i.category === 'BALL')?.id ||
          state.inventoryItems[0]?.id ||
          '',
        quantity: 6,
        conditionOut: 'GOOD',
      },
    ],
  });

  // Return Borrowed Equipment & Post-Session Condition Check Form
  const [returnLoanForm, setReturnLoanForm] = useState<{
    txId: string;
    loanCode: string;
    itemName: string;
    sku: string;
    coachName: string;
    teamName: string;
    borrowedQty: number;
    returnedQty: string;
    conditionAfter: 'GOOD' | 'MAINTENANCE' | 'DAMAGED';
    storageLocation: string;
    returnNotes: string;
  }>({
    txId: '',
    loanCode: '',
    itemName: '',
    sku: '',
    coachName: '',
    teamName: '',
    borrowedQty: 1,
    returnedQty: '1',
    conditionAfter: 'GOOD',
    storageLocation: 'Gudang Utama Court A Senayan',
    returnNotes: 'Seluruh peralatan dikembalikan lengkap dan telah diperiksa kondisinya.',
  });

  // Direct Asset Condition Inspection Form
  const [inspectForm, setInspectForm] = useState<{
    itemId: string;
    sku: string;
    itemName: string;
    category: string;
    conditionStatus: 'GOOD' | 'MAINTENANCE' | 'DAMAGED';
    storageLocation: string;
    minStock: string;
    inspectionNote: string;
  }>({
    itemId: '',
    sku: '',
    itemName: '',
    category: 'BALL',
    conditionStatus: 'GOOD',
    storageLocation: '',
    minStock: '5',
    inspectionNote: 'Inspeksi rutin berkala peralatan latihan & seragam akademi.',
  });

  // Parse Structured Coach Equipment Loans from Inventory Transactions Ledger
  const parsedEquipmentLoans = useMemo(() => {
    return state.inventoryTransactions
      .filter(
        (tx) =>
          tx.transactionType === 'ISSUE' &&
          (tx.referenceNote.includes('LOAN#') || tx.quantityDelta < 0)
      )
      .map((tx) => {
        const item = state.inventoryItems.find((i) => i.id === tx.itemId);
        const raw = tx.referenceNote || '';
        const loanMatch = raw.match(/LOAN#([A-Z0-9-]+)/);
        const coachMatch = raw.match(/COACH:([^|\]]+)/);
        const teamMatch = raw.match(/TEAM:([^|\]]+)/);
        const dueMatch = raw.match(/DUE:([^|\]]+)/);
        const condOutMatch = raw.match(/COND_OUT:([^|\]]+)/);
        const statusMatch = raw.match(/STATUS:([^|\]]+)/);
        const condInMatch = raw.match(/COND_IN:([^|\]]+)/);
        const returnNoteMatch = raw.match(/RETURN_NOTE:([^|\]]+)/);

        const cleanPurpose = raw.replace(/^\[[^\]]+\]\s*/, '').trim() || raw;
        const status: 'BORROWED' | 'RETURNED' =
          statusMatch?.[1]?.trim() === 'RETURNED' ? 'RETURNED' : 'BORROWED';

        return {
          txId: tx.id,
          loanCode: loanMatch ? loanMatch[1].trim() : `LN-${tx.id.slice(0, 6).toUpperCase()}`,
          itemId: tx.itemId,
          itemName: item?.name || 'Barang Inventaris',
          sku: item?.sku || '-',
          category: item?.category || 'TRAINING_AID',
          unit: item?.unit || 'PCS',
          storageLocation: item?.storageLocation || 'Gudang Utama',
          borrowedQty: Math.abs(Number(tx.quantityDelta || 1)),
          coachName: coachMatch ? coachMatch[1].trim() : 'Pelatih Lapangan',
          teamName: teamMatch ? teamMatch[1].trim() : 'Tim Latihan Akademi',
          courtLocation: tx.targetLocation || 'Court A • Main FIBA Wood Flooring',
          expectedReturnTime: dueMatch ? dueMatch[1].trim() : 'Selesai Sesi',
          conditionOut: (condOutMatch ? condOutMatch[1].trim() : tx.conditionAfter || 'GOOD') as
            | 'GOOD'
            | 'MAINTENANCE'
            | 'DAMAGED',
          conditionIn: (condInMatch ? condInMatch[1].trim() : null) as
            | null
            | 'GOOD'
            | 'MAINTENANCE'
            | 'DAMAGED',
          returnNote: returnNoteMatch ? returnNoteMatch[1].trim() : null,
          status,
          purposeNote: cleanPurpose,
          createdAt: tx.createdAt,
        };
      });
  }, [state.inventoryTransactions, state.inventoryItems]);

  // Compute how many units of each item are currently actively borrowed
  const activeBorrowedByItemMap = useMemo(() => {
    const map = new Map<string, number>();
    parsedEquipmentLoans.forEach((loan) => {
      if (loan.status === 'BORROWED') {
        map.set(loan.itemId, (map.get(loan.itemId) || 0) + loan.borrowedQty);
      }
    });
    return map;
  }, [parsedEquipmentLoans]);

  const filteredInventoryItems = useMemo(() => {
    return state.inventoryItems.filter((item) => {
      if (invCategoryFilter !== 'ALL' && item.category !== invCategoryFilter) return false;
      if (invConditionFilter !== 'ALL' && item.conditionStatus !== invConditionFilter) return false;
      if (invSearchQuery.trim()) {
        const q = invSearchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchLoc = item.storageLocation.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchLoc) return false;
      }
      return true;
    });
  }, [state.inventoryItems, invCategoryFilter, invConditionFilter, invSearchQuery]);

  const filteredEquipmentLoans = useMemo(() => {
    return parsedEquipmentLoans.filter((loan) => {
      if (loanStatusFilter !== 'ALL' && loan.status !== loanStatusFilter) return false;
      if (invCategoryFilter !== 'ALL' && loan.category !== invCategoryFilter) return false;
      if (invSearchQuery.trim()) {
        const q = invSearchQuery.toLowerCase();
        const match =
          loan.itemName.toLowerCase().includes(q) ||
          loan.sku.toLowerCase().includes(q) ||
          loan.coachName.toLowerCase().includes(q) ||
          loan.teamName.toLowerCase().includes(q) ||
          loan.loanCode.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [parsedEquipmentLoans, loanStatusFilter, invCategoryFilter, invSearchQuery]);

  const inventorySummary = useMemo(() => {
    const totalAvailableUnits = state.inventoryItems.reduce(
      (sum, i) => sum + Math.max(0, Number(i.currentStock || 0)),
      0
    );
    const activeLoans = parsedEquipmentLoans.filter((l) => l.status === 'BORROWED');
    const totalBorrowedUnits = activeLoans.reduce((sum, l) => sum + l.borrowedQty, 0);
    const ballsBorrowed = activeLoans
      .filter((l) => l.category === 'BALL')
      .reduce((sum, l) => sum + l.borrowedQty, 0);
    const jerseysBorrowed = activeLoans
      .filter((l) => l.category === 'JERSEY')
      .reduce((sum, l) => sum + l.borrowedQty, 0);
    const gearBorrowed = activeLoans
      .filter((l) => ['TRAINING_AID', 'COURT_GEAR', 'MEDICAL_KIT'].includes(l.category))
      .reduce((sum, l) => sum + l.borrowedQty, 0);

    const goodCount = state.inventoryItems.filter((i) => i.conditionStatus === 'GOOD').length;
    const maintenanceCount = state.inventoryItems.filter(
      (i) => i.conditionStatus === 'MAINTENANCE'
    ).length;
    const damagedCount = state.inventoryItems.filter((i) => i.conditionStatus === 'DAMAGED').length;
    const lowStockCount = state.inventoryItems.filter((i) => i.currentStock <= i.minStock).length;

    return {
      totalAvailableUnits,
      activeLoansCount: activeLoans.length,
      totalBorrowedUnits,
      ballsBorrowed,
      jerseysBorrowed,
      gearBorrowed,
      goodCount,
      maintenanceCount,
      damagedCount,
      lowStockCount,
    };
  }, [state.inventoryItems, parsedEquipmentLoans]);

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'BALL':
        return 'Bola Basket';
      case 'JERSEY':
        return 'Seragam & Jersey';
      case 'TRAINING_AID':
        return 'Alat Latihan (Drill)';
      case 'COURT_GEAR':
        return 'Peralatan Lapangan';
      case 'MEDICAL_KIT':
        return 'Perlengkapan Medis';
      default:
        return category;
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'BALL':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'JERSEY':
        return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
      case 'TRAINING_AID':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'COURT_GEAR':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'MEDICAL_KIT':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const handleApprovePayroll = async (payrollId: string) => {
    try {
      await apiRequest(`/api/payrolls/${payrollId}/approve`, {
        method: 'POST',
      });
      notify(
        'Payroll berhasil disetujui! Jurnal Beban Gaji/Kompensasi (Double-Entry) dan dokumen Slip Gaji otomatis diterbitkan.'
      );
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal menyetujui payroll', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('payroll')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'payroll'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Payroll & Kompensasi Sesi ({state.payrolls.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('personnel')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'personnel'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Pelatih & Staf ({state.coaches.length + state.staff.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('contracts')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'contracts'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Kontrak & Aturan Kompensasi ({state.employments.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('inventory')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'inventory'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>
              Manajemen Inventaris & Aset ({state.inventoryItems.length} SKU •{' '}
              {inventorySummary.activeLoansCount} Pinjaman Aktif)
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'personnel' && canCreateHr && (
            <>
              <button
                type="button"
                onClick={() => setModalType('staff')}
                className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Staf</span>
              </button>
              <button
                type="button"
                onClick={() => setModalType('coach')}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Pelatih</span>
              </button>
            </>
          )}
          {subTab === 'contracts' && canCreateHr && (
            <button
              type="button"
              onClick={() => setModalType('employment')}
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Kontrak & Aturan Kompensasi</span>
            </button>
          )}
          {subTab === 'payroll' && canCreatePayroll && (
            <button
              type="button"
              onClick={() => setModalType('generate_payroll')}
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Hitung / Generate Payroll Bulanan</span>
            </button>
          )}
          {subTab === 'inventory' && (
            <>
              {canProcessInventory && (
                <button
                  type="button"
                  onClick={() => setModalType('coach_loan')}
                  className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md flex items-center gap-1.5"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  <span>+ Pinjam Bola, Seragam & Alat Latihan (Pelatih)</span>
                </button>
              )}
              {canCreateInventory && (
                <button
                  type="button"
                  onClick={() => setModalType('inv_item')}
                  className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Master Aset Baru</span>
                </button>
              )}
              {canProcessInventory && (
                <button
                  type="button"
                  onClick={() => setModalType('inv_tx')}
                  className="px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Mutasi Stok Gudang</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* SUBTAB 1: PAYROLL & COMPENSATION */}
      {subTab === 'payroll' && (
        <div className="space-y-6">
          {state.payrolls.map((pr) => (
            <div
              key={pr.id}
              className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-amber-400">{pr.payrollNumber}</span>
                    <StatusText status={pr.status} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100 mt-0.5">
                    Periode Payroll: Bulan {pr.periodMonth} / {pr.periodYear}
                  </h3>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right font-mono">
                    <div className="text-[11px] text-slate-400">TOTAL TAKE HOME PAY (NET)</div>
                    <div className="text-base font-bold text-emerald-400">
                      {formatIDR(pr.totalNet)}
                    </div>
                  </div>
                  {canApprovePayroll && pr.status === 'DRAFT' && (
                    <button
                      type="button"
                      onClick={() => handleApprovePayroll(pr.id)}
                      className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve & Posting Jurnal</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-950/40">
                      <th className="py-2.5 px-4">Nama Personel</th>
                      <th className="py-2.5 px-4">Tipe Kontrak</th>
                      <th className="py-2.5 px-4 text-right">Sesi Valid</th>
                      <th className="py-2.5 px-4 text-right">Tarif / Sesi</th>
                      <th className="py-2.5 px-4 text-right">Gaji Pokok</th>
                      <th className="py-2.5 px-4 text-right">Bonus + Insentif</th>
                      <th className="py-2.5 px-4 text-right">Potongan</th>
                      <th className="py-2.5 px-4 text-right">Net Take Home Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                    {pr.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-sans font-semibold text-slate-100">
                          {item.personnelName}
                        </td>
                        <td className="py-2.5 px-4 text-amber-300">{item.employmentType}</td>
                        <td className="py-2.5 px-4 text-right">{item.validSessions} Sesi</td>
                        <td className="py-2.5 px-4 text-right">{formatIDR(item.sessionRate)}</td>
                        <td className="py-2.5 px-4 text-right">{formatIDR(item.monthlySalary)}</td>
                        <td className="py-2.5 px-4 text-right text-emerald-300">
                          {formatIDR(Number(item.bonus) + Number(item.incentive))}
                        </td>
                        <td className="py-2.5 px-4 text-right text-red-300">
                          {formatIDR(item.deduction)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-100">
                          {formatIDR(item.netCompensation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUBTAB 2: COACHES & STAFF WITH DIGITAL QR CODES */}
      {subTab === 'personnel' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Daftar Pelatih Akademi & Kode QR Digital
              </h3>
              <span className="text-[11px] font-mono text-amber-400">
                {state.coaches.length} Pelatih
              </span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {state.coaches.map((c, idx) => {
                const code = c.coachCode || `COACH-CBTC-0${idx + 1}`;
                const branch = state.branches.find((b) => b.id === c.branchId);
                const coachAtts = (state.coachAttendances || []).filter(
                  (ca) =>
                    ca.coachId === c.id &&
                    ['PRESENT', 'LATE', 'SUBSTITUTE'].includes(ca.status)
                );
                const qrPerson: QrPersonIdentity = {
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
                  lastSignature: coachAtts[0]?.digitalSignatureHash || `SIG-COACH-${code}`,
                };
                return (
                  <div key={c.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="cursor-pointer shrink-0"
                        onClick={() => setSelectedQrPerson(qrPerson)}
                        title="Klik untuk memperbesar Kartu QR Coach"
                      >
                        <QrCodeSvg code={code} entityType="COACH" sizePx={76} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-amber-400">
                            {code}
                          </span>
                          {c.isHeadCoach && (
                            <span className="font-mono text-[10px] text-emerald-400">
                              HEAD COACH
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-slate-100 truncate">
                          {c.fullName}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {c.licenseLevel} • {c.specialization}
                        </div>
                        <div className="text-[11px] font-mono text-emerald-400 mt-1">
                          Presensi Digital: {coachAtts.length} sesi terverifikasi
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs space-y-1.5 shrink-0">
                      <div className="text-slate-200">{c.coachType}</div>
                      <StatusText status={c.status} />
                      <div className="flex items-center justify-end gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedQrPerson(qrPerson)}
                          className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>Kartu QR</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadDigitalQrCardSvg(qrPerson, state.organization.name)
                          }
                          className="px-2 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded flex items-center gap-1"
                          title="Unduh Kartu QR (.SVG)"
                        >
                          <Download className="w-3 h-3 text-amber-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Daftar Staf Akademi (Medis, Operasional, Finance, Admin) & Kode QR
              </h3>
              <span className="text-[11px] font-mono text-amber-400">
                {state.staff.length} Staf
              </span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {state.staff.map((s, idx) => {
                const code = s.staffCode || `STF-CBTC-0${idx + 1}`;
                const branch = state.branches.find((b) => b.id === s.branchId);
                const staffAtts = (state.staffAttendances || []).filter(
                  (sa) =>
                    sa.staffId === s.id &&
                    ['PRESENT', 'LATE', 'ON_DUTY'].includes(sa.status)
                );
                const qrPerson: QrPersonIdentity = {
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
                  lastSignature: staffAtts[0]?.digitalSignatureHash || `SIG-STF-${code}`,
                };
                return (
                  <div key={s.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="cursor-pointer shrink-0"
                        onClick={() => setSelectedQrPerson(qrPerson)}
                        title="Klik untuk memperbesar Kartu QR Staf"
                      >
                        <QrCodeSvg code={code} entityType="STAFF" sizePx={76} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-bold text-amber-400">
                          {code} • {s.department}
                        </div>
                        <div className="text-sm font-semibold text-slate-100 truncate">
                          {s.fullName}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{s.positionTitle}</div>
                        <div className="text-[11px] font-mono text-emerald-400 mt-1">
                          Presensi Digital: {staffAtts.length} sesi terverifikasi
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs space-y-1.5 shrink-0">
                      <div className="text-slate-300">{s.phone}</div>
                      <StatusText status={s.status} />
                      <div className="flex items-center justify-end gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedQrPerson(qrPerson)}
                          className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>Kartu QR</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadDigitalQrCardSvg(qrPerson, state.organization.name)
                          }
                          className="px-2 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded flex items-center gap-1"
                          title="Unduh Kartu QR (.SVG)"
                        >
                          <Download className="w-3 h-3 text-amber-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Modal
            open={Boolean(selectedQrPerson)}
            onClose={() => setSelectedQrPerson(null)}
            title={`Kartu ID & Kode QR Digital — ${selectedQrPerson?.fullName || ''}`}
            subtitle="Dapat dilihat, diunduh (.SVG), dan dipindai pada terminal presensi digital."
          >
            {selectedQrPerson && (
              <div className="space-y-4">
                <div className="p-6 rounded-xl border border-slate-800 bg-slate-950 text-center space-y-3">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-amber-400">
                    {state.organization.name} • DIGITAL QR PASS
                  </div>
                  <QrCodeSvg
                    code={selectedQrPerson.code}
                    entityType={selectedQrPerson.entityType}
                    sizePx={192}
                  />
                  <div>
                    <div className="text-lg font-bold text-slate-100">
                      {selectedQrPerson.fullName}
                    </div>
                    <div className="text-sm font-mono font-bold text-amber-400 mt-0.5">
                      {selectedQrPerson.code}
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      {selectedQrPerson.roleTitle}
                    </div>
                    <div className="text-xs text-slate-400">{selectedQrPerson.subtitle}</div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(selectedQrPerson.code);
                      notify(`Kode QR ${selectedQrPerson.code} disalin.`);
                    }}
                    className="px-3 py-2 text-xs font-semibold bg-slate-900 text-slate-200 border border-slate-700 rounded flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Kode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadDigitalQrCardSvg(selectedQrPerson, state.organization.name)
                    }
                    className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Kartu QR (.SVG)</span>
                  </button>
                </div>
              </div>
            )}
          </Modal>
        </div>
      )}

      {/* SUBTAB 3: EMPLOYMENT CONTRACTS & COMPENSATION RULES */}
      {subTab === 'contracts' && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                  <th className="py-3 px-4">No. Kontrak & Personel</th>
                  <th className="py-3 px-4">Skema Kerja</th>
                  <th className="py-3 px-4 text-right">Gaji Bulanan</th>
                  <th className="py-3 px-4 text-right">Fee Per Sesi</th>
                  <th className="py-3 px-4 text-right">Bonus & Insentif</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {state.employments.map((emp) => {
                  const rule = state.compensationRules.find((r) => r.employmentId === emp.id);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs text-amber-400">{emp.contractNumber}</div>
                        <div className="font-semibold text-slate-100">{emp.personnelName}</div>
                        <div className="text-xs text-slate-400">Mulai: {emp.startDate}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-200">
                        {emp.employmentType}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-200">
                        {formatIDR(rule?.monthlySalary)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-amber-300">
                        {formatIDR(rule?.sessionRate)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-300">
                        {formatIDR(
                          Number(rule?.defaultBonus || 0) + Number(rule?.defaultIncentive || 0)
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={emp.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 4: MANAJEMEN INVENTARIS & ASET (PEMINJAMAN BOLA, SERAGAM & ALAT LATIHAN + PELACAKAN KONDISI) */}
      {subTab === 'inventory' && (
        <div className="space-y-6">
          {/* 1. EXECUTIVE ASSET & CONDITION KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                TOTAL ASET & STOK SIAP PAKAI
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                {inventorySummary.totalAvailableUnits} Unit
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Dari {state.inventoryItems.length} SKU terdaftar di gudang cabang
              </div>
            </div>

            <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-950/15">
              <div className="text-[11px] font-mono uppercase text-amber-300">
                SEDANG DIPINJAM PELATIH DI LAPANGAN
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                {inventorySummary.totalBorrowedUnits} Unit ({inventorySummary.activeLoansCount}{' '}
                Sesi)
              </div>
              <div className="text-xs text-slate-300 mt-1 font-mono">
                Bola: {inventorySummary.ballsBorrowed} • Seragam: {inventorySummary.jerseysBorrowed}{' '}
                • Alat: {inventorySummary.gearBorrowed}
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                PELACAKAN STATUS KONDISI BARANG
              </div>
              <div className="flex items-center gap-3 mt-1.5 font-mono text-xs">
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                  GOOD: {inventorySummary.goodCount}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                  MAINT: {inventorySummary.maintenanceCount}
                </span>
                <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 font-bold">
                  DAMAGED: {inventorySummary.damagedCount}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1.5">
                Inspeksi kondisi pra-pinjam & pasca-latihan
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                PERINGATAN STOK MINIMUM & SERVIS
              </div>
              <div className="text-2xl font-bold font-mono text-sky-400 mt-1">
                {inventorySummary.lowStockCount} SKU Low Stock
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {inventorySummary.maintenanceCount + inventorySummary.damagedCount} item butuh
                perawatan / penggantian
              </div>
            </div>
          </div>

          {/* 2. FILTER & SEARCH BAR FOR ASSETS AND COACH LOANS */}
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-mono text-slate-400 mr-1">Kategori Aset:</span>
              {(
                [
                  { id: 'ALL', label: 'Semua Kategori' },
                  { id: 'BALL', label: '🏀 Bola Basket' },
                  { id: 'JERSEY', label: '🎽 Seragam & Jersey' },
                  { id: 'TRAINING_AID', label: '⚡ Peralatan Latihan' },
                  { id: 'COURT_GEAR', label: '⏱️ Perangkat Lapangan' },
                  { id: 'MEDICAL_KIT', label: '🩹 Kit Medis' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setInvCategoryFilter(cat.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded border ${
                    invCategoryFilter === cat.id
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={invConditionFilter}
                onChange={(e) =>
                  setInvConditionFilter(
                    e.target.value as 'ALL' | 'GOOD' | 'MAINTENANCE' | 'DAMAGED'
                  )
                }
                className="px-2.5 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-200"
              >
                <option value="ALL">Semua Kondisi (GOOD / MAINT / DAMAGED)</option>
                <option value="GOOD">Kondisi: GOOD (Layak Pakai)</option>
                <option value="MAINTENANCE">Kondisi: MAINTENANCE (Perlu Servis)</option>
                <option value="DAMAGED">Kondisi: DAMAGED (Rusak)</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={invSearchQuery}
                  onChange={(e) => setInvSearchQuery(e.target.value)}
                  placeholder="Cari bola, jersey, alat, pelatih..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 w-56"
                />
              </div>
            </div>
          </div>

          {/* 3. PANEL PEMINJAMAN BOLA, SERAGAM & PERALATAN LATIHAN OLEH PELATIH */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/90 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono uppercase text-emerald-400">
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  <span>
                    Log Peminjaman & Pengembalian Peralatan Latihan Pelatih (Real-Time Condition Tracking)
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                  Daftar Peminjaman Bola, Seragam & Alat Latihan oleh Pelatih
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'ALL', label: `Semua Pinjaman (${parsedEquipmentLoans.length})` },
                    {
                      id: 'BORROWED',
                      label: `Sedang Dipinjam (${
                        parsedEquipmentLoans.filter((l) => l.status === 'BORROWED').length
                      })`,
                    },
                    {
                      id: 'RETURNED',
                      label: `Sudah Dikembalikan (${
                        parsedEquipmentLoans.filter((l) => l.status === 'RETURNED').length
                      })`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLoanStatusFilter(tab.id)}
                    className={`px-2.5 py-1 text-xs font-mono rounded border ${
                      loanStatusFilter === tab.id
                        ? 'bg-emerald-500 text-slate-950 border-emerald-500 font-bold'
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}

                {canProcessInventory && (
                  <button
                    type="button"
                    onClick={() => setModalType('coach_loan')}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Catat Peminjaman Baru</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-950/60">
                    <th className="py-3 px-4">Kode Pinjam & Waktu</th>
                    <th className="py-3 px-4">Barang (Bola / Seragam / Alat)</th>
                    <th className="py-3 px-4">Pelatih Peminjam & Tim</th>
                    <th className="py-3 px-4">Lapangan & Keperluan</th>
                    <th className="py-3 px-4 text-center">Jml Dipinjam</th>
                    <th className="py-3 px-4">Pelacakan Kondisi Barang</th>
                    <th className="py-3 px-4">Status Pinjam</th>
                    <th className="py-3 px-4 text-right">Aksi Pengembalian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredEquipmentLoans.map((loan) => (
                    <tr key={loan.txId} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-amber-400">{loan.loanCode}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(loan.createdAt).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>Target: {loan.expectedReturnTime}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border ${getCategoryBadgeClass(
                              loan.category
                            )}`}
                          >
                            {getCategoryLabel(loan.category)}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">{loan.sku}</span>
                        </div>
                        <div className="font-semibold text-slate-100 mt-1">{loan.itemName}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{loan.coachName}</span>
                        </div>
                        <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                          Tim: {loan.teamName}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="text-slate-200 font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>{loan.courtLocation}</span>
                        </div>
                        <div className="text-slate-400 text-[11px] mt-0.5 line-clamp-2">
                          {loan.purposeNote}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center font-mono">
                        <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-sm font-bold text-amber-300">
                          {loan.borrowedQty} {loan.unit}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Saat Keluar:</span>
                            <StatusText status={loan.conditionOut} />
                          </div>
                          {loan.conditionIn ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Saat Kembali:</span>
                              <StatusText status={loan.conditionIn} />
                            </div>
                          ) : (
                            <div className="text-amber-300/90">
                              Menunggu inspeksi pengembalian
                            </div>
                          )}
                          {loan.returnNote && (
                            <div className="font-sans text-[11px] text-emerald-300/90">
                              Catatan: {loan.returnNote}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {loan.status === 'BORROWED' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            DIPINJAM DI LAPANGAN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            ✓ DIKEMBALIKAN
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {loan.status === 'BORROWED' && canProcessInventory ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReturnLoanForm({
                                txId: loan.txId,
                                loanCode: loan.loanCode,
                                itemName: loan.itemName,
                                sku: loan.sku,
                                coachName: loan.coachName,
                                teamName: loan.teamName,
                                borrowedQty: loan.borrowedQty,
                                returnedQty: String(loan.borrowedQty),
                                conditionAfter: loan.conditionOut,
                                storageLocation: loan.storageLocation,
                                returnNotes: `Seluruh ${loan.borrowedQty} ${loan.unit} ${loan.itemName} telah dikembalikan oleh ${loan.coachName} setelah sesi latihan selesai.`,
                              });
                              setModalType('return_loan');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Kembalikan & Cek Kondisi</span>
                          </button>
                        ) : (
                          <span className="font-mono text-[11px] text-slate-400">
                            Selesai Diinspeksi
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredEquipmentLoans.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-xs text-slate-400">
                        Tidak ada data peminjaman peralatan latihan untuk filter yang dipilih.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. MASTER KATALOG INVENTARIS & PELACAKAN STATUS KONDISI BARANG */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Katalog Master Inventaris & Pelacakan Status Kondisi Aset ({filteredInventoryItems.length} SKU)
                </h3>
                <p className="text-xs text-slate-400">
                  Kelola ketersediaan bola basket, seragam tanding/latihan, dan peralatan latihan beserta status kondisi fisik (GOOD, MAINTENANCE, DAMAGED).
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">SKU & Nama Barang</th>
                    <th className="py-3 px-4">Kategori & Lokasi Gudang</th>
                    <th className="py-3 px-4">Status Kondisi Barang</th>
                    <th className="py-3 px-4 text-right">Sedang Dipinjam</th>
                    <th className="py-3 px-4 text-right">Batas Min.</th>
                    <th className="py-3 px-4 text-right">Stok Tersedia</th>
                    <th className="py-3 px-4 text-right">Aksi Pelatih & Inspeksi Kondisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {filteredInventoryItems.map((item) => {
                    const isLow = item.currentStock <= item.minStock;
                    const activeBorrowed = activeBorrowedByItemMap.get(item.id) || 0;
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4">
                          <div className="font-mono text-xs text-amber-400">{item.sku}</div>
                          <div className="font-semibold text-slate-100">{item.name}</div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <span
                            className={`inline-block px-2 py-0.5 text-[10px] font-mono font-semibold rounded border ${getCategoryBadgeClass(
                              item.category
                            )}`}
                          >
                            {getCategoryLabel(item.category)}
                          </span>
                          <div className="text-slate-400 mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-500" />
                            <span>{item.storageLocation}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <StatusText status={item.conditionStatus} />
                            {item.conditionStatus === 'MAINTENANCE' && (
                              <span className="text-[11px] text-amber-300 font-mono">
                                (Perlu Servis / Reparasi)
                              </span>
                            )}
                            {item.conditionStatus === 'DAMAGED' && (
                              <span className="text-[11px] text-red-300 font-mono">
                                (Rusak / Ganti Unit)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs">
                          {activeBorrowed > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                              {activeBorrowed} {item.unit} Dipinjam
                            </span>
                          ) : (
                            <span className="text-slate-500">0 {item.unit}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-400">
                          {item.minStock} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-sm font-bold">
                          <span className={isLow ? 'text-amber-400' : 'text-emerald-400'}>
                            {item.currentStock} {item.unit}
                          </span>
                          {isLow && (
                            <span className="ml-2 inline-flex items-center text-[10px] text-amber-400">
                              <AlertTriangle className="w-3 h-3 mr-0.5" /> LOW
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {canProcessInventory && item.currentStock > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCoachLoanForm({
                                    ...coachLoanForm,
                                    branchId: item.branchId,
                                    items: [
                                      {
                                        itemId: item.id,
                                        quantity: Math.min(4, item.currentStock),
                                        conditionOut: item.conditionStatus as
                                          | 'GOOD'
                                          | 'MAINTENANCE'
                                          | 'DAMAGED',
                                      },
                                    ],
                                  });
                                  setModalType('coach_loan');
                                }}
                                className="px-2.5 py-1 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1"
                              >
                                <ClipboardCheck className="w-3 h-3" />
                                <span>Pinjam</span>
                              </button>
                            )}
                            {canUpdateInventory && (
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectForm({
                                    itemId: item.id,
                                    sku: item.sku,
                                    itemName: item.name,
                                    category: item.category,
                                    conditionStatus: item.conditionStatus as
                                      | 'GOOD'
                                      | 'MAINTENANCE'
                                      | 'DAMAGED',
                                    storageLocation: item.storageLocation,
                                    minStock: String(item.minStock),
                                    inspectionNote: `Update inspeksi kondisi fisik ${item.name}`,
                                  });
                                  setModalType('inspect_condition');
                                }}
                                className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                              >
                                <Wrench className="w-3 h-3" />
                                <span>Status Kondisi</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. RIWAYAT MUTASI INVENTARIS (IMMUTABLE LEDGER) */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Buku Besar Riwayat Mutasi Stok & Inspeksi Kondisi (Inventory Transactions Ledger)
              </h3>
              <span className="text-xs font-mono text-slate-400">
                {state.inventoryTransactions.length} Transaksi Tercatat
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-2.5 px-4">Waktu</th>
                    <th className="py-2.5 px-4">Barang & Kategori</th>
                    <th className="py-2.5 px-4">Tipe Mutasi</th>
                    <th className="py-2.5 px-4">Kondisi Tercatat</th>
                    <th className="py-2.5 px-4 text-right">Delta Kuantitas</th>
                    <th className="py-2.5 px-4">Lokasi & Catatan Referensi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {state.inventoryTransactions.map((tx) => {
                    const item = state.inventoryItems.find((i) => i.id === tx.itemId);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-100">{item?.name || '-'}</div>
                          <div className="font-mono text-[10px] text-amber-400">
                            {item?.sku || ''} • {getCategoryLabel(item?.category || '')}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-amber-400">
                          {tx.transactionType}
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusText status={tx.conditionAfter || 'GOOD'} />
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono font-bold ${
                            tx.quantityDelta >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {tx.quantityDelta >= 0 ? `+${tx.quantityDelta}` : tx.quantityDelta}{' '}
                          {item?.unit || 'PCS'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">
                          {tx.targetLocation && (
                            <span className="font-mono text-[11px] text-sky-300 mr-2">
                              [{tx.targetLocation}]
                            </span>
                          )}
                          <span>{tx.referenceNote}</span>
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

      {/* MODALS */}
      <Modal
        open={modalType !== null}
        onClose={() => setModalType(null)}
        title={
          modalType === 'coach'
            ? 'Tambah Pelatih Baru'
            : modalType === 'staff'
            ? 'Tambah Staf Operasional'
            : modalType === 'employment'
            ? 'Buat Kontrak Kerja & Aturan Kompensasi'
            : modalType === 'generate_payroll'
            ? 'Hitung & Generate Payroll Bulanan'
            : modalType === 'inv_item'
            ? 'Tambah Master Barang Inventaris & Aset'
            : modalType === 'coach_loan'
            ? 'Formulir Peminjaman Bola, Seragam & Peralatan Latihan (Pelatih)'
            : modalType === 'return_loan'
            ? 'Pengembalian Peralatan Latihan & Inspeksi Kondisi Barang'
            : modalType === 'inspect_condition'
            ? 'Inspeksi & Pembaruan Status Kondisi Aset Inventaris'
            : 'Catat Transaksi Mutasi Inventaris (Ledger)'
        }
      >
        {modalType === 'coach_loan' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (coachLoanForm.items.length === 0) {
                notify('Pilih minimal 1 peralatan/barang untuk dipinjam.', 'error');
                return;
              }
              setSubmitting(true);
              try {
                const res = await apiRequest<{ borrowedCount: number }>(
                  '/api/inventory/loans/checkout',
                  {
                    method: 'POST',
                    body: JSON.stringify(coachLoanForm),
                  }
                );
                notify(
                  `Peminjaman ${res.borrowedCount} jenis peralatan latihan oleh ${coachLoanForm.coachName} berhasil dicatat di ledger inventaris!`
                );
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(
                  err instanceof Error ? err.message : 'Gagal mencatat peminjaman peralatan.',
                  'error'
                );
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4 text-xs"
          >
            {/* Preset Quick Kit Buttons */}
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-amber-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Preset Paket Pinjam Cepat Pelatih:</span>
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const ball = state.inventoryItems.find((i) => i.category === 'BALL');
                    const aid = state.inventoryItems.find((i) => i.category === 'TRAINING_AID');
                    const nextItems: Array<{
                      itemId: string;
                      quantity: number;
                      conditionOut: 'GOOD' | 'MAINTENANCE' | 'DAMAGED';
                    }> = [];
                    if (ball)
                      nextItems.push({ itemId: ball.id, quantity: 6, conditionOut: 'GOOD' });
                    if (aid) nextItems.push({ itemId: aid.id, quantity: 2, conditionOut: 'GOOD' });
                    if (nextItems.length > 0) {
                      setCoachLoanForm({
                        ...coachLoanForm,
                        purposeNote: 'Sesi Fundamental Drill, Ball Handling & Agility Conditioning',
                        items: nextItems,
                      });
                    }
                  }}
                  className="px-2.5 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-slate-700 rounded"
                >
                  🏀 Paket Latihan Reguler (Bola + Alat Drill)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ball = state.inventoryItems.find((i) => i.category === 'BALL');
                    const jersey = state.inventoryItems.find((i) => i.category === 'JERSEY');
                    const clock = state.inventoryItems.find((i) => i.category === 'COURT_GEAR');
                    const nextItems: Array<{
                      itemId: string;
                      quantity: number;
                      conditionOut: 'GOOD' | 'MAINTENANCE' | 'DAMAGED';
                    }> = [];
                    if (ball)
                      nextItems.push({ itemId: ball.id, quantity: 4, conditionOut: 'GOOD' });
                    if (jersey)
                      nextItems.push({ itemId: jersey.id, quantity: 10, conditionOut: 'GOOD' });
                    if (clock)
                      nextItems.push({ itemId: clock.id, quantity: 1, conditionOut: 'GOOD' });
                    if (nextItems.length > 0) {
                      setCoachLoanForm({
                        ...coachLoanForm,
                        purposeNote:
                          'Simulasi Pertandingan Scrimmage 5v5 Full-Court & Evaluasi Taktik',
                        items: nextItems,
                      });
                    }
                  }}
                  className="px-2.5 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded"
                >
                  🎽 Paket Scrimmage 5v5 (Bola + 10 Seragam + Shot Clock)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Pelatih Penanggung Jawab *
                </label>
                <select
                  value={coachLoanForm.coachName}
                  onChange={(e) =>
                    setCoachLoanForm({ ...coachLoanForm, coachName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.coaches.map((c) => (
                    <option key={c.id} value={c.fullName}>
                      {c.fullName} ({c.licenseLevel})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Tim / Kelompok Latihan Pengguna *
                </label>
                <select
                  value={coachLoanForm.teamName}
                  onChange={(e) => setCoachLoanForm({ ...coachLoanForm, teamName: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.teams.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                  <option value="Seluruh Tim Akademi (Gabungan)">
                    Seluruh Tim Akademi (Gabungan)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Lokasi Lapangan Pemakaian *
                </label>
                <select
                  value={coachLoanForm.courtLocation}
                  onChange={(e) =>
                    setCoachLoanForm({ ...coachLoanForm, courtLocation: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="Court A • Main FIBA Wood Flooring">
                    Court A • Main FIBA Wood Flooring
                  </option>
                  <option value="Court B • Development Indoor">
                    Court B • Development Indoor
                  </option>
                  <option value="Court C • Bandung Arena Indoor">
                    Court C • Bandung Arena Indoor
                  </option>
                  <option value="Strength & Conditioning Gym Area">
                    Strength & Conditioning Gym Area
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Estimasi Waktu Pengembalian *
                </label>
                <input
                  type="text"
                  required
                  value={coachLoanForm.expectedReturnTime}
                  onChange={(e) =>
                    setCoachLoanForm({ ...coachLoanForm, expectedReturnTime: e.target.value })
                  }
                  placeholder="18:30 WIB"
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
            </div>

            {/* Dynamic List of Borrowed Items */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">
                  Daftar Bola, Seragam & Peralatan yang Dipinjam ({coachLoanForm.items.length} Item)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const fallback = state.inventoryItems[0];
                    if (!fallback) return;
                    setCoachLoanForm({
                      ...coachLoanForm,
                      items: [
                        ...coachLoanForm.items,
                        { itemId: fallback.id, quantity: 2, conditionOut: 'GOOD' },
                      ],
                    });
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Tambah Barang</span>
                </button>
              </div>

              {coachLoanForm.items.map((row, idx) => {
                const selectedItem = state.inventoryItems.find((i) => i.id === row.itemId);
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2 rounded border border-slate-800/80 bg-slate-900/60"
                  >
                    <div className="sm:col-span-6">
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5">
                        Pilih Barang (Bola / Seragam / Alat)
                      </label>
                      <select
                        value={row.itemId}
                        onChange={(e) => {
                          const next = [...coachLoanForm.items];
                          next[idx] = { ...next[idx], itemId: e.target.value };
                          setCoachLoanForm({ ...coachLoanForm, items: next });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
                      >
                        {state.inventoryItems.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            [{getCategoryLabel(inv.category)}] {inv.name} (Stok: {inv.currentStock}{' '}
                            {inv.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5">
                        Jumlah ({selectedItem?.unit || 'PCS'})
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, selectedItem?.currentStock || 99)}
                        required
                        value={row.quantity}
                        onChange={(e) => {
                          const next = [...coachLoanForm.items];
                          next[idx] = {
                            ...next[idx],
                            quantity: Math.max(1, Number(e.target.value || 1)),
                          };
                          setCoachLoanForm({ ...coachLoanForm, items: next });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-950 border border-slate-800 rounded text-amber-400"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5">
                        Kondisi Saat Diambil
                      </label>
                      <select
                        value={row.conditionOut}
                        onChange={(e) => {
                          const next = [...coachLoanForm.items];
                          next[idx] = {
                            ...next[idx],
                            conditionOut: e.target.value as 'GOOD' | 'MAINTENANCE' | 'DAMAGED',
                          };
                          setCoachLoanForm({ ...coachLoanForm, items: next });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                      >
                        <option value="GOOD">GOOD (Prima)</option>
                        <option value="MAINTENANCE">MAINTENANCE (Perlu Cek)</option>
                        <option value="DAMAGED">DAMAGED (Catatan Rusak)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-1 flex justify-end pt-3">
                      {coachLoanForm.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCoachLoanForm({
                              ...coachLoanForm,
                              items: coachLoanForm.items.filter((_, i) => i !== idx),
                            });
                          }}
                          className="px-2 py-1 text-xs text-red-400 hover:bg-red-950/50 rounded"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Keperluan Sesi Latihan / Catatan Peminjaman *
              </label>
              <input
                type="text"
                required
                value={coachLoanForm.purposeNote}
                onChange={(e) =>
                  setCoachLoanForm({ ...coachLoanForm, purposeNote: e.target.value })
                }
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-900 text-slate-300 border border-slate-800 rounded"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded"
              >
                {submitting
                  ? 'Memproses Peminjaman...'
                  : 'Konfirmasi Peminjaman & Kurangi Stok Gudang'}
              </button>
            </div>
          </form>
        )}

        {modalType === 'return_loan' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest(`/api/inventory/loans/${returnLoanForm.txId}/return`, {
                  method: 'POST',
                  body: JSON.stringify({
                    returnedQty: Number(returnLoanForm.returnedQty),
                    conditionAfter: returnLoanForm.conditionAfter,
                    storageLocation: returnLoanForm.storageLocation,
                    returnNotes: returnLoanForm.returnNotes,
                  }),
                });
                notify(
                  `Pengembalian ${returnLoanForm.returnedQty} unit ${returnLoanForm.itemName} (${returnLoanForm.loanCode}) berhasil dicatat dengan status kondisi ${returnLoanForm.conditionAfter}!`
                );
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(
                  err instanceof Error ? err.message : 'Gagal memproses pengembalian barang.',
                  'error'
                );
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4 text-xs"
          >
            <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/70 space-y-1">
              <div className="font-mono text-amber-400 font-bold">
                Kode Peminjaman: {returnLoanForm.loanCode} • SKU: {returnLoanForm.sku}
              </div>
              <div className="text-sm font-bold text-slate-100">{returnLoanForm.itemName}</div>
              <div className="text-slate-400">
                Peminjam: <span className="text-slate-200">{returnLoanForm.coachName}</span> • Tim:{' '}
                <span className="text-slate-200">{returnLoanForm.teamName}</span> • Dipinjam:{' '}
                <span className="font-mono font-bold text-amber-300">
                  {returnLoanForm.borrowedQty} Unit
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Kuantitas Dikembalikan *
                </label>
                <input
                  type="number"
                  min={1}
                  max={returnLoanForm.borrowedQty}
                  required
                  value={returnLoanForm.returnedQty}
                  onChange={(e) =>
                    setReturnLoanForm({ ...returnLoanForm, returnedQty: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-slate-950 border border-slate-800 rounded text-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Kondisi Barang Saat Kembali *
                </label>
                <select
                  value={returnLoanForm.conditionAfter}
                  onChange={(e) =>
                    setReturnLoanForm({
                      ...returnLoanForm,
                      conditionAfter: e.target.value as 'GOOD' | 'MAINTENANCE' | 'DAMAGED',
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="GOOD">GOOD (Lengkap & Layak Pakai)</option>
                  <option value="MAINTENANCE">MAINTENANCE (Perlu Pompa / Cuci / Servis)</option>
                  <option value="DAMAGED">DAMAGED (Rusak / Sobek / Bocor)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Lokasi Rak Penyimpanan Kembali *
                </label>
                <input
                  type="text"
                  required
                  value={returnLoanForm.storageLocation}
                  onChange={(e) =>
                    setReturnLoanForm({ ...returnLoanForm, storageLocation: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Catatan Inspeksi Kondisi Fisik Barang *
              </label>
              <textarea
                rows={2}
                required
                value={returnLoanForm.returnNotes}
                onChange={(e) =>
                  setReturnLoanForm({ ...returnLoanForm, returnNotes: e.target.value })
                }
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-900 text-slate-300 border border-slate-800 rounded"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded"
              >
                {submitting
                  ? 'Menyimpan...'
                  : 'Simpan Pengembalian & Perbarui Status Kondisi Barang'}
              </button>
            </div>
          </form>
        )}

        {modalType === 'inspect_condition' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest(`/api/inventory/items/${inspectForm.itemId}/condition`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    conditionStatus: inspectForm.conditionStatus,
                    storageLocation: inspectForm.storageLocation,
                    minStock: Number(inspectForm.minStock),
                    inspectionNote: inspectForm.inspectionNote,
                  }),
                });
                notify(
                  `Status kondisi aset "${inspectForm.itemName}" berhasil diperbarui menjadi ${inspectForm.conditionStatus}.`
                );
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(
                  err instanceof Error ? err.message : 'Gagal memperbarui kondisi barang.',
                  'error'
                );
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4 text-xs"
          >
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/70">
              <div className="font-mono text-xs text-amber-400">{inspectForm.sku}</div>
              <div className="text-sm font-bold text-slate-100">{inspectForm.itemName}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Status Kondisi Fisik *</label>
                <select
                  value={inspectForm.conditionStatus}
                  onChange={(e) =>
                    setInspectForm({
                      ...inspectForm,
                      conditionStatus: e.target.value as 'GOOD' | 'MAINTENANCE' | 'DAMAGED',
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="GOOD">GOOD (Prima / Siap Pakai)</option>
                  <option value="MAINTENANCE">MAINTENANCE (Perlu Perawatan)</option>
                  <option value="DAMAGED">DAMAGED (Rusak / Afkir)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Lokasi Penyimpanan *</label>
                <input
                  type="text"
                  required
                  value={inspectForm.storageLocation}
                  onChange={(e) =>
                    setInspectForm({ ...inspectForm, storageLocation: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Batas Stok Minimum *</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={inspectForm.minStock}
                  onChange={(e) => setInspectForm({ ...inspectForm, minStock: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Catatan Hasil Inspeksi *</label>
              <input
                type="text"
                required
                value={inspectForm.inspectionNote}
                onChange={(e) =>
                  setInspectForm({ ...inspectForm, inspectionNote: e.target.value })
                }
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-900 text-slate-300 border border-slate-800 rounded"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded"
              >
                Simpan Perubahan Kondisi
              </button>
            </div>
          </form>
        )}
        {modalType === 'coach' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/coaches', {
                  method: 'POST',
                  body: JSON.stringify(coachForm),
                });
                notify('Data pelatih berhasil disimpan.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menambah pelatih', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Lengkap Pelatih *</label>
                <input
                  type="text"
                  required
                  value={coachForm.fullName}
                  onChange={(e) => setCoachForm({ ...coachForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nomor Telepon *</label>
                <input
                  type="text"
                  required
                  value={coachForm.phone}
                  onChange={(e) => setCoachForm({ ...coachForm, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Lisensi Kepelatihan *</label>
                <input
                  type="text"
                  required
                  value={coachForm.licenseLevel}
                  onChange={(e) => setCoachForm({ ...coachForm, licenseLevel: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tipe Kontrak Pelatih *</label>
                <select
                  value={coachForm.coachType}
                  onChange={(e) => setCoachForm({ ...coachForm, coachType: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="FULL_TIME">FULL_TIME</option>
                  <option value="FREELANCE">FREELANCE</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Simpan Pelatih
              </button>
            </div>
          </form>
        )}

        {modalType === 'staff' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/staff', {
                  method: 'POST',
                  body: JSON.stringify(staffForm),
                });
                notify('Data staf berhasil disimpan.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menambah staf', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Lengkap Staf *</label>
                <input
                  type="text"
                  required
                  value={staffForm.fullName}
                  onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Departemen *</label>
                <select
                  value={staffForm.department}
                  onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="OPERATIONS">OPERATIONS</option>
                  <option value="FINANCE">FINANCE</option>
                  <option value="MEDICAL">MEDICAL</option>
                  <option value="EVENT">EVENT</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Jabatan *</label>
                <input
                  type="text"
                  required
                  value={staffForm.positionTitle}
                  onChange={(e) => setStaffForm({ ...staffForm, positionTitle: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Telepon *</label>
                <input
                  type="text"
                  required
                  value={staffForm.phone}
                  onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
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
                Simpan Staf
              </button>
            </div>
          </form>
        )}

        {modalType === 'employment' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/employments', {
                  method: 'POST',
                  body: JSON.stringify(employmentForm),
                });
                notify('Kontrak kerja & aturan kompensasi berhasil dibuat.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal membuat kontrak', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Personel *</label>
                <input
                  type="text"
                  required
                  value={employmentForm.personnelName}
                  onChange={(e) =>
                    setEmploymentForm({ ...employmentForm, personnelName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tipe Kontrak *</label>
                <select
                  value={employmentForm.employmentType}
                  onChange={(e) =>
                    setEmploymentForm({ ...employmentForm, employmentType: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="FULL_TIME_COACH">FULL_TIME_COACH</option>
                  <option value="FREELANCE_COACH">FREELANCE_COACH</option>
                  <option value="STAFF">STAFF</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Gaji Bulanan (Rp) *</label>
                <input
                  type="number"
                  required
                  value={employmentForm.monthlySalary}
                  onChange={(e) =>
                    setEmploymentForm({ ...employmentForm, monthlySalary: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tarif Per Sesi Valid (Rp) *</label>
                <input
                  type="number"
                  required
                  value={employmentForm.sessionRate}
                  onChange={(e) =>
                    setEmploymentForm({ ...employmentForm, sessionRate: e.target.value })
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
                Simpan Kontrak
              </button>
            </div>
          </form>
        )}

        {modalType === 'generate_payroll' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/payrolls/generate', {
                  method: 'POST',
                  body: JSON.stringify(payrollGenForm),
                });
                notify(
                  'Payroll berhasil dihitung otomatis berdasarkan kontrak aktif dan jumlah sesi latihan COMPLETED!'
                );
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal generate payroll', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cabang *</label>
                <select
                  value={payrollGenForm.branchId}
                  onChange={(e) =>
                    setPayrollGenForm({ ...payrollGenForm, branchId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bulan (1-12) *</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  required
                  value={payrollGenForm.periodMonth}
                  onChange={(e) =>
                    setPayrollGenForm({ ...payrollGenForm, periodMonth: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tahun *</label>
                <input
                  type="number"
                  required
                  value={payrollGenForm.periodYear}
                  onChange={(e) =>
                    setPayrollGenForm({ ...payrollGenForm, periodYear: e.target.value })
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
                Kalkulasi Payroll
              </button>
            </div>
          </form>
        )}

        {modalType === 'inv_item' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/inventory/items', {
                  method: 'POST',
                  body: JSON.stringify(invItemForm),
                });
                notify('Master barang inventaris & saldo awal berhasil dicatat.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menambah barang', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kode SKU *</label>
                <input
                  type="text"
                  required
                  value={invItemForm.sku}
                  onChange={(e) => setInvItemForm({ ...invItemForm, sku: e.target.value })}
                  placeholder="EQ-MOLTEN-BG4500"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Barang *</label>
                <input
                  type="text"
                  required
                  value={invItemForm.name}
                  onChange={(e) => setInvItemForm({ ...invItemForm, name: e.target.value })}
                  placeholder="Bola Basket Molten BG4500 FIBA Size 7"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kategori *</label>
                <select
                  value={invItemForm.category}
                  onChange={(e) => setInvItemForm({ ...invItemForm, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="BALL">BALL</option>
                  <option value="COURT_GEAR">COURT_GEAR</option>
                  <option value="JERSEY">JERSEY</option>
                  <option value="MEDICAL_KIT">MEDICAL_KIT</option>
                  <option value="TRAINING_AID">TRAINING_AID</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kuantitas Pengadaan Awal</label>
                <input
                  type="number"
                  min={0}
                  value={invItemForm.initialPurchaseQty}
                  onChange={(e) =>
                    setInvItemForm({ ...invItemForm, initialPurchaseQty: e.target.value })
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
                Simpan Barang
              </button>
            </div>
          </form>
        )}

        {modalType === 'inv_tx' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/inventory/transactions', {
                  method: 'POST',
                  body: JSON.stringify(invTxForm),
                });
                notify('Mutasi inventaris berhasil dicatat di ledger.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal mencatat mutasi', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Barang Inventaris *</label>
                <select
                  value={invTxForm.itemId}
                  onChange={(e) => setInvTxForm({ ...invTxForm, itemId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.inventoryItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (Stok: {i.currentStock})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tipe Transaksi *</label>
                <select
                  value={invTxForm.transactionType}
                  onChange={(e) =>
                    setInvTxForm({ ...invTxForm, transactionType: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="PURCHASE">PURCHASE (+ Barang Masuk)</option>
                  <option value="RETURN">RETURN (+ Pengembalian)</option>
                  <option value="ISSUE">ISSUE (- Pemakaian)</option>
                  <option value="TRANSFER">TRANSFER (- Transfer Lokasi)</option>
                  <option value="MAINTENANCE">MAINTENANCE (- Perawatan)</option>
                  <option value="DISPOSAL">DISPOSAL (- Penghapusan)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kuantitas *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={invTxForm.quantity}
                  onChange={(e) => setInvTxForm({ ...invTxForm, quantity: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kondisi Barang</label>
                <select
                  value={invTxForm.conditionAfter}
                  onChange={(e) => setInvTxForm({ ...invTxForm, conditionAfter: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="GOOD">GOOD</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="DAMAGED">DAMAGED</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Catatan Referensi *</label>
                <input
                  type="text"
                  required
                  value={invTxForm.referenceNote}
                  onChange={(e) => setInvTxForm({ ...invTxForm, referenceNote: e.target.value })}
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
                Simpan Mutasi
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
