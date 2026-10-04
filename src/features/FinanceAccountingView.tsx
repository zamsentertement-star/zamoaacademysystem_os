import React, { useState, useMemo } from 'react';
import {
  Plus,
  CreditCard,
  Receipt,
  BookOpen,
  RotateCcw,
  Download,
  QrCode,
  Wallet,
  Building2,
  MessageSquare,
  Mail,
  Send,
  Trophy,
  UserPlus,
  BellRing,
} from 'lucide-react';
import { SystemState, getEffectiveAppSettings } from '../types/system.ts';
import { apiRequest, exportRowsToCsv, formatIDR } from '../lib/api.ts';
import { hasPermission } from '../lib/rbac.ts';
import { Modal, StatusText } from '../components/ui/Primitives.tsx';
import {
  EasyPaymentPortalModal,
  WaEmailDispatchModal,
} from '../components/ui/EasyPaymentPortalModal.tsx';
import { WhatsAppGatewayHub } from '../components/ui/WhatsAppGatewayHub.tsx';

interface FinanceAccountingViewProps {
  state: SystemState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function FinanceAccountingView({
  state,
  onRefresh,
  notify,
}: FinanceAccountingViewProps) {
  const [subTab, setSubTab] = useState<
    'invoices' | 'payments' | 'expenses' | 'coa' | 'journals' | 'wa_gateway'
  >('invoices');
  const [dispatchingPaymentWaId, setDispatchingPaymentWaId] = useState<string | null>(null);
  const [modalType, setModalType] = useState<
    null | 'invoice' | 'payment' | 'expense' | 'manual_journal' | 'reverse_journal'
  >(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(
    state.invoices[0]?.id || ''
  );
  const [selectedJournalId, setSelectedJournalId] = useState<string>('');
  const [reverseReason, setReverseReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Easy Payment Portal & WA/Email Dispatch Modals
  const [easyPayInvoiceId, setEasyPayInvoiceId] = useState<string | null>(null);
  const [waEmailModal, setWaEmailModal] = useState<{
    mode: 'INVOICE' | 'RECEIPT';
    invoiceId: string;
    receiptId?: string;
  } | null>(null);
  const [invoiceCategoryFilter, setInvoiceCategoryFilter] = useState<
    'ALL' | 'TOURNAMENT' | 'MEMBERSHIP'
  >('ALL');
  const [quickTourModalOpen, setQuickTourModalOpen] = useState<boolean>(false);
  const [quickTourForm, setQuickTourForm] = useState<{
    tournamentId: string;
    coachId: string;
    customFeePerAthlete: string;
    selectedAthleteIds: string[];
  }>({
    tournamentId: state.tournaments[0]?.id || '',
    coachId: state.coaches[0]?.id || '',
    customFeePerAthlete: '350000',
    selectedAthleteIds: state.athletes.slice(0, 2).map((a) => a.id),
  });

  const appSettings = useMemo(() => getEffectiveAppSettings(state), [state]);

  const role = state.currentUser.activeRoleCode;
  const canCreateFinance = hasPermission(role, 'finance', 'create');
  const canProcessFinance = hasPermission(role, 'finance', 'process');
  const canCreateAccounting = hasPermission(role, 'accounting', 'create');
  const canApproveAccounting = hasPermission(role, 'accounting', 'approve');
  const canExportFinance = hasPermission(role, 'finance', 'export');

  const [invoiceForm, setInvoiceForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    athleteId: state.athletes[0]?.id || '',
    revenueCategory: 'MEMBERSHIP',
    description: 'Iuran Membership Bulanan ZAMOA CBTC',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    totalAmount: '850000',
    status: 'ISSUED',
  });

  const [paymentForm, setPaymentForm] = useState({
    invoiceId: state.invoices[0]?.id || '',
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: '850000',
    paymentMethod: 'BANK_TRANSFER',
    referenceNumber: `TRF-${Date.now().toString().slice(-6)}`,
  });

  const [expenseForm, setExpenseForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    tournamentId: '',
    category: 'COURT_RENTAL',
    vendorName: 'Pengelola GOR Basket Indoor',
    description: 'Sewa Lapangan Latihan Reguler Bulan Ini',
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: '3500000',
  });

  const [manualJournalForm, setManualJournalForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    entryDate: new Date().toISOString().slice(0, 10),
    description: 'Penyesuaian Akuntansi Akhir Periode',
    debitAccountCode: '5108',
    creditAccountCode: '1101',
    amount: '500000',
  });

  // Financial Report Calculations from Double-Entry Accounts
  const revenueAccounts = state.accounting.accounts.filter((a) => a.accountType === 'REVENUE');
  const expenseAccounts = state.accounting.accounts.filter((a) => a.accountType === 'EXPENSE');
  const assetAccounts = state.accounting.accounts.filter((a) => a.accountType === 'ASSET');
  const liabilityAccounts = state.accounting.accounts.filter((a) => a.accountType === 'LIABILITY');
  const equityAccounts = state.accounting.accounts.filter((a) => a.accountType === 'EQUITY');

  const totalAccountingRevenue = revenueAccounts.reduce((s, a) => s + a.netBalance, 0);
  const totalAccountingExpense = expenseAccounts.reduce((s, a) => s + a.netBalance, 0);
  const netIncome = totalAccountingRevenue - totalAccountingExpense;

  // Parent Balance Ledger (Saldo Tagihan Orang Tua) & Automated Tournament Fee Summary
  const parentBalanceRows = useMemo(() => {
    return state.athletes.map((ath) => {
      const pLinks = (state.parentAthletes || []).filter((pl) => pl.athleteId === ath.id);
      const primaryLink = pLinks.find((pl) => pl.isPrimaryGuardian) || pLinks[0];
      const linkedParent = primaryLink
        ? (state.parents || []).find((p) => p.id === primaryLink.parentId)
        : (state.parents || []).find(
            (p) =>
              p.fullName.toLowerCase() === (ath.parentContactName || '').toLowerCase() ||
              p.phone === ath.parentContactPhone
          );

      const parentName = linkedParent?.fullName || ath.parentContactName || 'Orang Tua / Wali';
      const parentPhone = linkedParent?.phone || ath.parentContactPhone || '-';
      const parentEmail =
        linkedParent?.email ||
        `${ath.fullName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@parent.cbtc.id`;

      const athInvoices = state.invoices.filter(
        (inv) => inv.athleteId === ath.id && inv.status !== 'CANCELLED'
      );
      const unpaidInvoices = athInvoices.filter((inv) => inv.status !== 'PAID');

      const tournamentUnpaid = unpaidInvoices
        .filter((inv) => inv.revenueCategory === 'TOURNAMENT')
        .reduce(
          (sum, inv) => sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)),
          0
        );

      const membershipUnpaid = unpaidInvoices
        .filter((inv) => inv.revenueCategory !== 'TOURNAMENT')
        .reduce(
          (sum, inv) => sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)),
          0
        );

      const totalPaid = athInvoices.reduce((sum, inv) => sum + Number(inv.paidAmount || 0), 0);
      const totalOutstandingBalance = tournamentUnpaid + membershipUnpaid;
      const latestUnpaidInvoice = unpaidInvoices[0];

      return {
        athleteId: ath.id,
        athleteName: ath.fullName,
        memberCode: ath.memberCode,
        parentName,
        parentPhone,
        parentEmail,
        tournamentUnpaid,
        membershipUnpaid,
        totalPaid,
        totalOutstandingBalance,
        unpaidInvoicesCount: unpaidInvoices.length,
        latestUnpaidInvoiceId: latestUnpaidInvoice?.id || null,
      };
    });
  }, [state.athletes, state.parents, state.parentAthletes, state.invoices]);

  const filteredInvoices = useMemo(() => {
    return state.invoices.filter((inv) => {
      if (invoiceCategoryFilter === 'TOURNAMENT') return inv.revenueCategory === 'TOURNAMENT';
      if (invoiceCategoryFilter === 'MEMBERSHIP') return inv.revenueCategory === 'MEMBERSHIP';
      return true;
    });
  }, [state.invoices, invoiceCategoryFilter]);

  const tournamentInvoicesCount = useMemo(
    () => state.invoices.filter((inv) => inv.revenueCategory === 'TOURNAMENT').length,
    [state.invoices]
  );

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('invoices')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'invoices'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Tagihan / Invoices ({state.invoices.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('payments')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'payments'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Pembayaran & Kwitansi ({state.payments.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('expenses')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'expenses'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Pengeluaran / Expenses ({state.expenses.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('coa')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'coa'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            COA, Neraca & Laba Rugi
          </button>
          <button
            type="button"
            onClick={() => setSubTab('journals')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'journals'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Jurnal Double-Entry ({state.accounting.journals.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('wa_gateway')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'wa_gateway'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-emerald-950/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-950/50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Gateway WA Otomatis (Invoice & Kwitansi)</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canExportFinance && (
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv(
                  'zamoa-cbtc-invoices',
                  state.invoices.map((inv) => ({
                    invoiceNumber: inv.invoiceNumber,
                    category: inv.revenueCategory,
                    description: inv.description,
                    issueDate: inv.issueDate,
                    dueDate: inv.dueDate,
                    totalAmount: inv.totalAmount,
                    paidAmount: inv.paidAmount,
                    status: inv.status,
                  }))
                )
              }
              className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor CSV</span>
            </button>
          )}
          {canCreateFinance && (
            <>
              <button
                type="button"
                onClick={() => setQuickTourModalOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md flex items-center gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Otomatisasi Biaya Turnamen Atlet</span>
              </button>
              <button
                type="button"
                onClick={() => setModalType('invoice')}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Terbitkan Invoice</span>
              </button>
            </>
          )}
          {canProcessFinance && (
            <button
              type="button"
              onClick={() => setModalType('payment')}
              className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md flex items-center gap-1"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Catat Pembayaran</span>
            </button>
          )}
          {canCreateFinance && (
            <button
              type="button"
              onClick={() => setModalType('expense')}
              className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Catat Beban</span>
            </button>
          )}
          {canCreateAccounting && (
            <button
              type="button"
              onClick={() => setModalType('manual_journal')}
              className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Jurnal Penyesuaian</span>
            </button>
          )}
        </div>
      </div>

      {/* Portal Pembayaran Mudah Parent & Pemain + Status Kanal WA & Email */}
      <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div>
            <div className="text-xs font-mono uppercase text-amber-400">
              PORTAL PEMBAYARAN MUDAH PARENT & PEMAIN • TERINTEGRASI PENGATURAN APLIKASI
            </div>
            <h3 className="text-sm font-bold text-slate-100 mt-0.5">
              Metode Pembayaran Aktif: QRIS Nasional, E-Wallet Digital & Transfer Bank Resmi
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="text-emerald-400 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              WA:{' '}
              {appSettings.notificationChannels.whatsapp.enabled
                ? appSettings.notificationChannels.whatsapp.senderNumber
                : 'NONAKTIF'}
            </span>
            <span className="text-amber-300 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" />
              EMAIL:{' '}
              {appSettings.notificationChannels.email.enabled
                ? appSettings.notificationChannels.email.senderEmail
                : 'NONAKTIF'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded border border-slate-800 bg-slate-950/60 flex items-start gap-2.5">
            <QrCode className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-100">
                1. QRIS Instan ({appSettings.paymentMethods.qris.merchantName})
              </div>
              <div className="font-mono text-[11px] text-amber-300">
                NMID: {appSettings.paymentMethods.qris.nmid}
              </div>
              <div className="text-slate-400 mt-0.5">
                Scan langsung dari M-Banking atau dompet digital Parent & Pemain.
              </div>
            </div>
          </div>

          <div className="p-3 rounded border border-slate-800 bg-slate-950/60 flex items-start gap-2.5">
            <Wallet className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-100">
                2. E-Wallet Digital (
                {appSettings.paymentMethods.ewallet.wallets
                  .filter((w) => w.isActive)
                  .map((w) => w.provider)
                  .join(', ')}
                )
              </div>
              <div className="font-mono text-[11px] text-emerald-400">
                No. Resmi:{' '}
                {appSettings.paymentMethods.ewallet.wallets[0]?.phoneNumber || '08119002026'}
              </div>
              <div className="text-slate-400 mt-0.5">
                Salin nomor 1-klik & konfirmasi otomatis.
              </div>
            </div>
          </div>

          <div className="p-3 rounded border border-slate-800 bg-slate-950/60 flex items-start gap-2.5">
            <Building2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-100">
                3. Transfer Bank Resmi (
                {appSettings.paymentMethods.bankTransfer.accounts
                  .filter((b) => b.isActive)
                  .map((b) => `${b.bankName} ${b.accountNumber}`)
                  .join(' • ')}
                )
              </div>
              <div className="text-slate-400 mt-0.5">
                a.n.{' '}
                {appSettings.paymentMethods.bankTransfer.accounts[0]?.accountHolder ||
                  state.organization.legalName}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SUBTAB 1: INVOICES */}
      {subTab === 'invoices' && (
        <div className="space-y-6">
          {/* BUKU SALDO TAGIHAN ORANG TUA & OTOMATISASI BIAYA TURNAMEN */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/90 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono uppercase text-amber-400">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>
                    Integrasi Pendaftaran Kompetisi Pelatih ➔ Otomatisasi Invoice Turnamen ➔ Saldo Orang Tua
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                  Monitoring Saldo Tagihan Orang Tua & Biaya Pendaftaran Turnamen Terotomatisasi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickTourModalOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1.5 shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Daftarkan Atlet ke Kompetisi & Tagihkan ke Saldo Orang Tua</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-950/60">
                    <th className="py-2.5 px-4">Orang Tua / Wali & Kontak</th>
                    <th className="py-2.5 px-4">Atlet Terkait</th>
                    <th className="py-2.5 px-4 text-right">Saldo Biaya Turnamen</th>
                    <th className="py-2.5 px-4 text-right">Saldo Iuran Reguler</th>
                    <th className="py-2.5 px-4 text-right">Total Saldo Tagihan Wali</th>
                    <th className="py-2.5 px-4 text-right">Aksi Saldo & Notifikasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {parentBalanceRows.map((row) => (
                    <tr key={row.athleteId} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-100">{row.parentName}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          WA: {row.parentPhone} • {row.parentEmail}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-200">{row.athleteName}</div>
                        <div className="font-mono text-[11px] text-amber-400">{row.memberCode}</div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-300">
                        {formatIDR(row.tournamentUnpaid)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-300">
                        {formatIDR(row.membershipUnpaid)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm font-bold">
                        <span
                          className={
                            row.totalOutstandingBalance > 0 ? 'text-amber-400' : 'text-emerald-400'
                          }
                        >
                          {formatIDR(row.totalOutstandingBalance)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {row.latestUnpaidInvoiceId ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEasyPayInvoiceId(row.latestUnpaidInvoiceId)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded"
                            >
                              Bayar Saldo
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setWaEmailModal({
                                  mode: 'INVOICE',
                                  invoiceId: row.latestUnpaidInvoiceId!,
                                })
                              }
                              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                            >
                              <BellRing className="w-3 h-3" />
                              <span>Notif Saldo Wali</span>
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-[11px] text-emerald-400">
                            ✓ Saldo Lunas (Rp 0)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            {/* Filter Bar for Invoices Table */}
            <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-200">
                Daftar Tagihan / Invoices ({filteredInvoices.length} Ditampilkan)
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setInvoiceCategoryFilter('ALL')}
                  className={`px-2.5 py-1 text-xs font-mono rounded border ${
                    invoiceCategoryFilter === 'ALL'
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                      : 'bg-slate-950 text-slate-300 border-slate-800'
                  }`}
                >
                  Semua Kategori ({state.invoices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceCategoryFilter('TOURNAMENT')}
                  className={`px-2.5 py-1 text-xs font-mono rounded border ${
                    invoiceCategoryFilter === 'TOURNAMENT'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-500 font-bold'
                      : 'bg-slate-950 text-emerald-300 border-slate-800'
                  }`}
                >
                  Biaya Turnamen Terotomatisasi ({tournamentInvoicesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceCategoryFilter('MEMBERSHIP')}
                  className={`px-2.5 py-1 text-xs font-mono rounded border ${
                    invoiceCategoryFilter === 'MEMBERSHIP'
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                      : 'bg-slate-950 text-slate-300 border-slate-800'
                  }`}
                >
                  Iuran Membership (
                  {state.invoices.filter((i) => i.revenueCategory === 'MEMBERSHIP').length})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">No. Invoice & Kategori</th>
                    <th className="py-3 px-4">Atlet, Wali & Deskripsi</th>
                    <th className="py-3 px-4">Tgl Terbit / Jatuh Tempo</th>
                    <th className="py-3 px-4 text-right">Total Tagihan</th>
                    <th className="py-3 px-4 text-right">Terbayar</th>
                    <th className="py-3 px-4 text-right">Sisa Piutang</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {filteredInvoices.map((inv) => {
                    const athlete = state.athletes.find((a) => a.id === inv.athleteId);
                    const pRow = parentBalanceRows.find((r) => r.athleteId === inv.athleteId);
                    const remaining = Math.max(
                      0,
                      Number(inv.totalAmount) - Number(inv.paidAmount)
                    );
                    return (
                      <tr key={inv.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4">
                          <div className="font-mono text-xs text-amber-400">{inv.invoiceNumber}</div>
                          <div
                            className={`font-mono text-[11px] ${
                              inv.revenueCategory === 'TOURNAMENT'
                                ? 'text-emerald-400 font-bold'
                                : 'text-slate-400'
                            }`}
                          >
                            {inv.revenueCategory}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-100">
                            {athlete?.fullName || 'Umum / Non-Atlet'}
                            {pRow && (
                              <span className="font-mono text-xs text-slate-400 font-normal">
                                {' '}
                                • Wali: {pRow.parentName}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">{inv.description}</div>
                        </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">
                        <div>Terbit: {inv.issueDate}</div>
                        <div className="text-slate-400">Tempo: {inv.dueDate}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-100">
                        {formatIDR(inv.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-400">
                        {formatIDR(inv.paidAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-amber-300">
                        {formatIDR(remaining)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={inv.status} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canProcessFinance && remaining > 0 && inv.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => setEasyPayInvoiceId(inv.id)}
                              className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>Bayar (QRIS / E-Wallet / Bank)</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setWaEmailModal({
                                mode: remaining <= 0 ? 'RECEIPT' : 'INVOICE',
                                invoiceId: inv.id,
                              })
                            }
                            className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>Notif WA & Email</span>
                          </button>
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
      )}

      {/* SUBTAB 2: PAYMENTS */}
      {subTab === 'payments' && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                  <th className="py-3 px-4">No. Kwitansi (Receipt)</th>
                  <th className="py-3 px-4">Invoice Terkait</th>
                  <th className="py-3 px-4">Tanggal Bayar</th>
                  <th className="py-3 px-4">Metode & Referensi</th>
                  <th className="py-3 px-4 text-right">Nominal Pembayaran</th>
                  <th className="py-3 px-4 text-right">Kirim Bukti WA & Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {state.payments.map((p) => {
                  const inv = state.invoices.find((i) => i.id === p.invoiceId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono text-xs text-emerald-400">
                        {p.receiptNumber}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-mono text-slate-200">{inv?.invoiceNumber || '-'}</div>
                        <div className="text-slate-400">{inv?.description || ''}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">
                        {p.paymentDate}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">
                        {p.paymentMethod} ({p.referenceNumber || '-'})
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-bold text-emerald-400">
                        {formatIDR(p.amount)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        {inv && (
                          <>
                            <button
                              type="button"
                              disabled={dispatchingPaymentWaId === p.id}
                              onClick={async () => {
                                setDispatchingPaymentWaId(p.id);
                                try {
                                  const res = await apiRequest<{
                                    ok: boolean;
                                    parentName: string;
                                    parentPhone: string;
                                    receiptNumber: string;
                                  }>('/api/whatsapp-gateway/dispatch-invoice-notification', {
                                    method: 'POST',
                                    body: JSON.stringify({
                                      invoiceId: inv.id,
                                      paymentId: p.id,
                                      notificationType: 'PAYMENT_RECEIPT',
                                    }),
                                  });
                                  notify(
                                    `Gateway WhatsApp berhasil mengirim Bukti Pembayaran (${res.receiptNumber}) ke nomor WA Orang Tua ${res.parentName} (${res.parentPhone}).`
                                  );
                                  await onRefresh();
                                } catch (err: unknown) {
                                  notify(
                                    err instanceof Error
                                      ? err.message
                                      : 'Gagal mengirim kwitansi via Gateway WA',
                                    'error'
                                  );
                                } finally {
                                  setDispatchingPaymentWaId(null);
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded inline-flex items-center gap-1"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>
                                {dispatchingPaymentWaId === p.id
                                  ? 'Mengirim WA...'
                                  : 'Kirim WA Otomatis'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setWaEmailModal({
                                  mode: 'RECEIPT',
                                  invoiceId: inv.id,
                                  receiptId: p.id,
                                })
                              }
                              className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded inline-flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              <span>Preview WA & Email</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB: WHATSAPP GATEWAY FOR INVOICES & PAYMENT RECEIPTS */}
      {subTab === 'wa_gateway' && (
        <WhatsAppGatewayHub
          state={state}
          onRefresh={onRefresh}
          notify={notify}
          defaultView="invoices"
        />
      )}

      {/* SUBTAB 3: EXPENSES */}
      {subTab === 'expenses' && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                  <th className="py-3 px-4">No. Pengeluaran</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Vendor & Deskripsi</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4 text-right">Jumlah (IDR)</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {state.expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-4 font-mono text-xs text-amber-400">
                      {exp.expenseNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-300">{exp.category}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-100">{exp.vendorName}</div>
                      <div className="text-xs text-slate-400">{exp.description}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-300">
                      {exp.expenseDate}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-sm font-bold text-red-300">
                      {formatIDR(exp.amount)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={exp.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 4: COA, INCOME STATEMENT & BALANCE SHEET */}
      {subTab === 'coa' && (
        <div className="space-y-6">
          {/* Income Statement Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50">
              <div className="text-xs text-slate-400">TOTAL PENDAPATAN (REVENUE)</div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                {formatIDR(totalAccountingRevenue)}
              </div>
            </div>
            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50">
              <div className="text-xs text-slate-400">TOTAL BEBAN OPERASIONAL (EXPENSE)</div>
              <div className="text-xl font-bold font-mono text-red-400 mt-1">
                {formatIDR(totalAccountingExpense)}
              </div>
            </div>
            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50">
              <div className="text-xs text-slate-400">LABA / SURPLUS BERSIH (NET INCOME)</div>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                {formatIDR(netIncome)}
              </div>
            </div>
          </div>

          {/* Chart of Accounts & Trial Balance */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">
                Chart of Accounts (COA) & Neraca Saldo (Trial Balance — Double-Entry)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Kode Akun</th>
                    <th className="py-3 px-4">Nama Akun</th>
                    <th className="py-3 px-4">Tipe</th>
                    <th className="py-3 px-4">Saldo Normal</th>
                    <th className="py-3 px-4 text-right">Total Debit</th>
                    <th className="py-3 px-4 text-right">Total Kredit</th>
                    <th className="py-3 px-4 text-right">Saldo Akhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                  {[
                    ...assetAccounts,
                    ...liabilityAccounts,
                    ...equityAccounts,
                    ...revenueAccounts,
                    ...expenseAccounts,
                  ].map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 text-amber-400 font-bold">{acc.code}</td>
                      <td className="py-2.5 px-4 font-sans font-medium text-slate-100">
                        {acc.name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">{acc.accountType}</td>
                      <td className="py-2.5 px-4 text-slate-400">{acc.normalBalance}</td>
                      <td className="py-2.5 px-4 text-right text-slate-300">
                        {formatIDR(acc.debitSum)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-300">
                        {formatIDR(acc.creditSum)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-100">
                        {formatIDR(acc.netBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 5: DOUBLE-ENTRY JOURNALS */}
      {subTab === 'journals' && (
        <div className="space-y-4">
          {state.accounting.journals.map((j) => (
            <div
              key={j.id}
              className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden"
            >
              <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-900/80">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-amber-400">
                      {j.journalNumber}
                    </span>
                    <span className="font-mono text-xs text-slate-400">• {j.entryDate}</span>
                    <span className="font-mono text-xs text-slate-400">• [{j.sourceType}]</span>
                    <StatusText status={j.status} />
                  </div>
                  <div className="text-sm font-medium text-slate-100 mt-0.5">{j.description}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right font-mono text-xs">
                    <span className="text-slate-400">Balance: </span>
                    <span className="font-bold text-emerald-400">{formatIDR(j.totalDebit)}</span>
                  </div>
                  {canApproveAccounting && j.status === 'POSTED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedJournalId(j.id);
                        setModalType('reverse_journal');
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-red-300 hover:text-red-200 bg-red-950/40 border border-red-800/60 rounded flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reverse Jurnal</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400 bg-slate-950/40">
                      <th className="py-2 px-4">Akun COA</th>
                      <th className="py-2 px-4">Memo Baris</th>
                      <th className="py-2 px-4 text-right">Debit</th>
                      <th className="py-2 px-4 text-right">Kredit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-xs font-mono">
                    {j.entries.map((line) => {
                      const acc = state.accounting.accounts.find((a) => a.id === line.accountId);
                      return (
                        <tr key={line.id}>
                          <td className="py-2 px-4 text-slate-200">
                            <span className="text-amber-400">{acc?.code}</span> —{' '}
                            <span className="font-sans">{acc?.name}</span>
                          </td>
                          <td className="py-2 px-4 font-sans text-slate-400">
                            {line.memo || '-'}
                          </td>
                          <td className="py-2 px-4 text-right text-slate-200">
                            {Number(line.debit) > 0 ? formatIDR(line.debit) : '-'}
                          </td>
                          <td className="py-2 px-4 text-right text-slate-200">
                            {Number(line.credit) > 0 ? formatIDR(line.credit) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODALS */}
      <Modal
        open={modalType !== null}
        onClose={() => setModalType(null)}
        title={
          modalType === 'invoice'
            ? 'Terbitkan Invoice Baru (Auto Double-Entry Journal)'
            : modalType === 'payment'
            ? 'Catat Pembayaran & Terbitkan Kwitansi (Auto Journal)'
            : modalType === 'expense'
            ? 'Catat Pengeluaran Operasional (Auto Journal)'
            : modalType === 'manual_journal'
            ? 'Posting Jurnal Penyesuaian Manual (Balanced Debit = Credit)'
            : 'Reversal Jurnal Terposting (Contra-Journal Entry)'
        }
      >
        {modalType === 'invoice' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/invoices', {
                  method: 'POST',
                  body: JSON.stringify(invoiceForm),
                });
                notify('Invoice berhasil diterbitkan dan jurnal Piutang pada Pendapatan otomatis terposting.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal membuat invoice', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Atlet</label>
                <select
                  value={invoiceForm.athleteId}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, athleteId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="">-- Non-Atlet / Sponsorship --</option>
                  {state.athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName} ({a.memberCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kategori Pendapatan *</label>
                <select
                  value={invoiceForm.revenueCategory}
                  onChange={(e) =>
                    setInvoiceForm({ ...invoiceForm, revenueCategory: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="MEMBERSHIP">MEMBERSHIP</option>
                  <option value="REGISTRATION">REGISTRATION</option>
                  <option value="TOURNAMENT">TOURNAMENT</option>
                  <option value="MERCHANDISE">MERCHANDISE</option>
                  <option value="SPONSORSHIP">SPONSORSHIP</option>
                  <option value="OTHER_REVENUE">OTHER_REVENUE</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Deskripsi Tagihan *</label>
                <input
                  type="text"
                  required
                  value={invoiceForm.description}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nominal Tagihan (Rp) *</label>
                <input
                  type="number"
                  required
                  min={1000}
                  value={invoiceForm.totalAmount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, totalAmount: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Jatuh Tempo *</label>
                <input
                  type="date"
                  required
                  value={invoiceForm.dueDate}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
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
                Terbitkan Invoice
              </button>
            </div>
          </form>
        )}

        {modalType === 'payment' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/payments', {
                  method: 'POST',
                  body: JSON.stringify({
                    ...paymentForm,
                    invoiceId: paymentForm.invoiceId || selectedInvoiceId,
                  }),
                });
                notify(
                  'Pembayaran berhasil dicatat! Status invoice diperbarui, kwitansi dibuat, dan jurnal Kas pada Piutang terposting.'
                );
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal mencatat pembayaran', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Pilih Invoice *</label>
                <select
                  value={paymentForm.invoiceId}
                  onChange={(e) => setPaymentForm({ ...paymentForm, invoiceId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.invoices
                    .filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED')
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoiceNumber} — {i.description} (Sisa:{' '}
                        {formatIDR(Number(i.totalAmount) - Number(i.paidAmount))})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nominal Bayar (Rp) *</label>
                <input
                  type="number"
                  required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Metode Pembayaran *</label>
                <select
                  value={paymentForm.paymentMethod}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="QRIS">QRIS (Scan Semua Bank & E-Wallet)</option>
                  <option value="EWALLET">EWALLET (GoPay / OVO / DANA / ShopeePay)</option>
                  <option value="BANK_TRANSFER">BANK_TRANSFER (BCA / Mandiri / BNI)</option>
                  <option value="VIRTUAL_ACCOUNT">VIRTUAL_ACCOUNT</option>
                  <option value="CASH">CASH</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 rounded"
              >
                Simpan Pembayaran
              </button>
            </div>
          </form>
        )}

        {modalType === 'expense' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/expenses', {
                  method: 'POST',
                  body: JSON.stringify(expenseForm),
                });
                notify('Pengeluaran tercatat dan jurnal Beban pada Kas/Bank otomatis terposting.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal mencatat pengeluaran', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kategori Beban *</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="COURT_RENTAL">COURT_RENTAL (Sewa Lapangan)</option>
                  <option value="EQUIPMENT">EQUIPMENT (Peralatan Latihan)</option>
                  <option value="TRANSPORTATION">TRANSPORTATION</option>
                  <option value="ACCOMMODATION">ACCOMMODATION</option>
                  <option value="MEDICAL">MEDICAL</option>
                  <option value="EVENT">EVENT</option>
                  <option value="OPERATIONAL">OPERATIONAL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Vendor / Penerima *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.vendorName}
                  onChange={(e) => setExpenseForm({ ...expenseForm, vendorName: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Deskripsi Pengeluaran *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nominal (Rp) *</label>
                <input
                  type="number"
                  required
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-red-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tanggal *</label>
                <input
                  type="date"
                  required
                  value={expenseForm.expenseDate}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
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
                Simpan Pengeluaran
              </button>
            </div>
          </form>
        )}

        {modalType === 'manual_journal' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                const amt = Number(manualJournalForm.amount);
                await apiRequest('/api/journals/manual', {
                  method: 'POST',
                  body: JSON.stringify({
                    branchId: manualJournalForm.branchId,
                    entryDate: manualJournalForm.entryDate,
                    description: manualJournalForm.description,
                    lines: [
                      {
                        accountCode: manualJournalForm.debitAccountCode,
                        debit: amt,
                        credit: 0,
                        memo: 'Debit Penyesuaian',
                      },
                      {
                        accountCode: manualJournalForm.creditAccountCode,
                        debit: 0,
                        credit: amt,
                        memo: 'Kredit Penyesuaian',
                      },
                    ],
                  }),
                });
                notify('Jurnal penyesuaian seimbang (Debit = Kredit) berhasil diposting.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal memposting jurnal', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Deskripsi Jurnal *</label>
                <input
                  type="text"
                  required
                  value={manualJournalForm.description}
                  onChange={(e) =>
                    setManualJournalForm({ ...manualJournalForm, description: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Akun Debit *</label>
                <select
                  value={manualJournalForm.debitAccountCode}
                  onChange={(e) =>
                    setManualJournalForm({
                      ...manualJournalForm,
                      debitAccountCode: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.accounting.accounts.map((a) => (
                    <option key={a.id} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Akun Kredit *</label>
                <select
                  value={manualJournalForm.creditAccountCode}
                  onChange={(e) =>
                    setManualJournalForm({
                      ...manualJournalForm,
                      creditAccountCode: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.accounting.accounts.map((a) => (
                    <option key={a.id} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">
                  Nominal Seimbang (Debit = Kredit) (Rp) *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={manualJournalForm.amount}
                  onChange={(e) =>
                    setManualJournalForm({ ...manualJournalForm, amount: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-amber-400"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Posting Jurnal
              </button>
            </div>
          </form>
        )}

        {modalType === 'reverse_journal' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest(`/api/journals/${selectedJournalId}/reverse`, {
                  method: 'POST',
                  body: JSON.stringify({ reason: reverseReason }),
                });
                notify(
                  'Jurnal berhasil di-reverse menggunakan jurnal pembalik (contra-entry) tanpa menghapus histori.'
                );
                setReverseReason('');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal melakukan reversal', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <p className="text-xs text-slate-300">
              Sesuai standar audit akuntansi, jurnal yang telah diposting tidak boleh dihapus. Sistem akan menandai jurnal asal sebagai <strong>REVERSED</strong> dan membuat jurnal pembalik otomatis.
            </p>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Alasan Reversal / Koreksi *</label>
              <input
                type="text"
                required
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="Contoh: Koreksi klasifikasi akun beban operasional"
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-red-500 text-white rounded"
              >
                Konfirmasi Reversal Jurnal
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL PORTAL PEMBAYARAN MUDAH (QRIS / E-WALLET / TRANSFER BANK) */}
      {easyPayInvoiceId && (
        <EasyPaymentPortalModal
          open={Boolean(easyPayInvoiceId)}
          onClose={() => setEasyPayInvoiceId(null)}
          state={state}
          invoiceId={easyPayInvoiceId}
          onRefresh={onRefresh}
          notify={notify}
        />
      )}

      {/* MODAL PENGIRIMAN NOTIFIKASI WHATSAPP & EMAIL */}
      {waEmailModal && (
        <WaEmailDispatchModal
          open={Boolean(waEmailModal)}
          onClose={() => setWaEmailModal(null)}
          state={state}
          mode={waEmailModal.mode}
          invoiceId={waEmailModal.invoiceId}
          receiptId={waEmailModal.receiptId}
          onRefresh={onRefresh}
          notify={notify}
        />
      )}
    </div>
  );
}
