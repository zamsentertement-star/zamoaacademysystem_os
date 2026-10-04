import React, { useState, useMemo } from 'react';
import {
  QrCode,
  Wallet,
  Building2,
  Copy,
  CheckCircle2,
  Download,
  Send,
  Mail,
  MessageSquare,
  CreditCard,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import {
  SystemState,
  getEffectiveAppSettings,
} from '../../types/system.ts';
import { apiRequest, formatIDR } from '../../lib/api.ts';
import { Modal } from './Primitives.tsx';
import { QrCodeSvg } from './DigitalQrPassHub.tsx';

interface EasyPaymentPortalModalProps {
  open: boolean;
  onClose: () => void;
  state: SystemState;
  invoiceId: string;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function formatPhoneForWaLink(rawPhone: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '628119002026';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  return `62${digits}`;
}

export function interpolateNotificationTemplate(
  template: string,
  vars: {
    athleteName: string;
    invoiceNumber: string;
    receiptNumber?: string;
    amount: string;
    dueDate?: string;
    paymentMethod?: string;
  }
): string {
  return template
    .replace(/\{athlete_name\}/g, vars.athleteName)
    .replace(/\{invoice_number\}/g, vars.invoiceNumber)
    .replace(/\{receipt_number\}/g, vars.receiptNumber || '-')
    .replace(/\{amount\}/g, vars.amount)
    .replace(/\{due_date\}/g, vars.dueDate || '-')
    .replace(/\{payment_method\}/g, vars.paymentMethod || 'QRIS / Transfer');
}

export function EasyPaymentPortalModal({
  open,
  onClose,
  state,
  invoiceId,
  onRefresh,
  notify,
}: EasyPaymentPortalModalProps) {
  const settings = useMemo(() => getEffectiveAppSettings(state), [state]);
  const activeBanks = useMemo(
    () => settings.paymentMethods.bankTransfer.accounts.filter((a) => a.isActive),
    [settings]
  );
  const activeWallets = useMemo(
    () => settings.paymentMethods.ewallet.wallets.filter((w) => w.isActive),
    [settings]
  );

  const invoice = useMemo(
    () => state.invoices.find((i) => i.id === invoiceId) || state.invoices[0],
    [state.invoices, invoiceId]
  );

  const athlete = useMemo(
    () => state.athletes.find((a) => a.id === invoice?.athleteId),
    [state.athletes, invoice]
  );

  const parentProfile = useMemo(() => {
    if (!athlete) return null;
    const link = state.parentAthletes.find((pa) => pa.athleteId === athlete.id);
    if (link) {
      return state.parents.find((p) => p.id === link.parentId) || null;
    }
    return null;
  }, [athlete, state.parentAthletes, state.parents]);

  const remainingAmount = invoice
    ? Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount))
    : 0;

  const [selectedChannel, setSelectedChannel] = useState<'QRIS' | 'EWALLET' | 'BANK_TRANSFER'>(
    settings.paymentMethods.qris.enabled
      ? 'QRIS'
      : settings.paymentMethods.ewallet.enabled
      ? 'EWALLET'
      : 'BANK_TRANSFER'
  );
  const [selectedWalletProvider, setSelectedWalletProvider] = useState<string>(
    activeWallets[0]?.provider || 'GOPAY'
  );
  const [selectedBankName, setSelectedBankName] = useState<string>(
    activeBanks[0]?.bankName || 'BCA'
  );
  const [customAmount, setCustomAmount] = useState<string>('');
  const [referenceNote, setReferenceNote] = useState<string>('');
  const [sendWaAfterPay, setSendWaAfterPay] = useState<boolean>(
    settings.notificationChannels.whatsapp.enabled &&
      settings.notificationChannels.whatsapp.autoSendReceipt
  );
  const [sendEmailAfterPay, setSendEmailAfterPay] = useState<boolean>(
    settings.notificationChannels.email.enabled &&
      settings.notificationChannels.email.autoSendReceipt
  );
  const [submitting, setSubmitting] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState<{
    receiptNumber: string;
    amount: number;
    methodLabel: string;
    paidAt: string;
  } | null>(null);

  if (!invoice) return null;

  const effectivePayAmount = customAmount ? Number(customAmount) : remainingAmount;

  const currentWallet =
    activeWallets.find((w) => w.provider === selectedWalletProvider) || activeWallets[0];
  const currentBank =
    activeBanks.find((b) => b.bankName === selectedBankName) || activeBanks[0];

  const qrisDynamicCode = `${settings.paymentMethods.qris.qrisPayload}|INV:${invoice.invoiceNumber}|AMT:${effectivePayAmount}`;

  const recipientPhone =
    parentProfile?.phone ||
    athlete?.parentContactPhone ||
    settings.notificationChannels.whatsapp.senderNumber;
  const recipientEmail =
    parentProfile?.email ||
    state.currentUser.email ||
    settings.notificationChannels.email.replyToEmail;

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} berhasil disalin ke clipboard.`);
    } catch {
      notify(`${label}: ${text}`);
    }
  };

  const handleDownloadQrisSvg = () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="560" viewBox="0 0 440 560">
      <rect width="440" height="560" rx="20" fill="#090D16" stroke="#F59E0B" stroke-width="3"/>
      <rect x="24" y="24" width="392" height="56" rx="10" fill="#1E293B"/>
      <text x="220" y="48" fill="#F59E0B" font-family="monospace" font-size="13" font-weight="bold" text-anchor="middle">QRIS NASIONAL • STANDAR PEMBAYARAN DIGITAL</text>
      <text x="220" y="68" fill="#F8FAFC" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">${settings.paymentMethods.qris.merchantName}</text>
      <text x="220" y="106" fill="#94A3B8" font-family="monospace" font-size="12" text-anchor="middle">NMID: ${settings.paymentMethods.qris.nmid}</text>
      <rect x="95" y="124" width="250" height="250" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
      <text x="220" y="255" fill="#0F172A" font-family="monospace" font-size="13" font-weight="bold" text-anchor="middle">[SCAN QRIS: ${invoice.invoiceNumber}]</text>
      <text x="220" y="410" fill="#F8FAFC" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">${athlete?.fullName || 'Atlet ZAMOA CBTC'}</text>
      <text x="220" y="434" fill="#F59E0B" font-family="monospace" font-size="14" font-weight="bold" text-anchor="middle">${invoice.invoiceNumber}</text>
      <text x="220" y="468" fill="#10B981" font-family="monospace" font-size="22" font-weight="bold" text-anchor="middle">${formatIDR(effectivePayAmount)}</text>
      <text x="220" y="512" fill="#94A3B8" font-family="sans-serif" font-size="11" text-anchor="middle">Menerima GoPay, OVO, DANA, ShopeePay, BCA, Mandiri, BNI, BRI</text>
    </svg>`;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QRIS-${invoice.invoiceNumber}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Kode QRIS Tagihan berhasil diunduh (.SVG).');
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectivePayAmount <= 0) {
      notify('Nominal pembayaran harus lebih dari Rp 0.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const refPrefix =
        selectedChannel === 'QRIS'
          ? `QRIS-${settings.paymentMethods.qris.nmid.slice(-5)}`
          : selectedChannel === 'EWALLET'
          ? `EWALLET-${selectedWalletProvider}`
          : `BANK-${selectedBankName}`;

      const finalRef =
        referenceNote.trim() || `${refPrefix}-${Date.now().toString().slice(-6)}`;

      const createdPayment = await apiRequest<{
        id: string;
        receiptNumber: string;
        amount: string;
        paymentMethod: string;
        paymentDate: string;
      }>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: invoice.id,
          paymentDate: new Date().toISOString().slice(0, 10),
          amount: effectivePayAmount,
          paymentMethod: selectedChannel,
          referenceNumber: finalRef,
        }),
      });

      const methodLabel =
        selectedChannel === 'QRIS'
          ? `QRIS (${settings.paymentMethods.qris.merchantName})`
          : selectedChannel === 'EWALLET'
          ? `E-Wallet ${selectedWalletProvider} (${currentWallet?.phoneNumber || ''})`
          : `Transfer Bank ${selectedBankName} (${currentBank?.accountNumber || ''})`;

      if (sendWaAfterPay || sendEmailAfterPay) {
        const renderedReceiptMsg = interpolateNotificationTemplate(
          settings.notificationChannels.whatsapp.receiptTemplate,
          {
            athleteName: athlete?.fullName || 'Atlet Akademi',
            invoiceNumber: invoice.invoiceNumber,
            receiptNumber: createdPayment.receiptNumber,
            amount: formatIDR(effectivePayAmount),
            paymentMethod: methodLabel,
          }
        );

        await apiRequest('/api/notifications/dispatch-wa-email', {
          method: 'POST',
          body: JSON.stringify({
            channel:
              sendWaAfterPay && sendEmailAfterPay
                ? 'BOTH'
                : sendWaAfterPay
                ? 'WHATSAPP'
                : 'EMAIL',
            recipientPhone,
            recipientEmail,
            title: `Bukti Lunas ${createdPayment.receiptNumber} (${invoice.invoiceNumber})`,
            message: renderedReceiptMsg,
            category: 'BILLING',
          }),
        });
      }

      setCompletedReceipt({
        receiptNumber: createdPayment.receiptNumber,
        amount: effectivePayAmount,
        methodLabel,
        paidAt: new Date().toLocaleString('id-ID'),
      });

      notify(
        `Pembayaran ${formatIDR(effectivePayAmount)} via ${methodLabel} berhasil! Kwitansi & Notifikasi WA/Email telah diterbitkan.`
      );
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memproses pembayaran', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const receiptWaMessage = completedReceipt
    ? interpolateNotificationTemplate(settings.notificationChannels.whatsapp.receiptTemplate, {
        athleteName: athlete?.fullName || 'Atlet Akademi',
        invoiceNumber: invoice.invoiceNumber,
        receiptNumber: completedReceipt.receiptNumber,
        amount: formatIDR(completedReceipt.amount),
        paymentMethod: completedReceipt.methodLabel,
      })
    : '';

  const receiptEmailSubject = completedReceipt
    ? interpolateNotificationTemplate(
        settings.notificationChannels.email.receiptSubjectTemplate,
        {
          athleteName: athlete?.fullName || 'Atlet Akademi',
          invoiceNumber: invoice.invoiceNumber,
          receiptNumber: completedReceipt.receiptNumber,
          amount: formatIDR(completedReceipt.amount),
          paymentMethod: completedReceipt.methodLabel,
        }
      )
    : '';

  const waDirectUrl = `https://wa.me/${formatPhoneForWaLink(
    recipientPhone
  )}?text=${encodeURIComponent(receiptWaMessage)}`;
  const mailtoDirectUrl = `mailto:${encodeURIComponent(
    recipientEmail
  )}?subject=${encodeURIComponent(receiptEmailSubject)}&body=${encodeURIComponent(
    receiptWaMessage
  )}`;

  return (
    <Modal
      open={open}
      onClose={() => {
        setCompletedReceipt(null);
        onClose();
      }}
      title="Portal Pembayaran Mudah (Parent & Pemain — QRIS, E-Wallet & Transfer Bank)"
      subtitle={`Tagihan ${invoice.invoiceNumber} • ${
        athlete?.fullName || 'Atlet ZAMOA CBTC'
      } • Terintegrasi Notifikasi WA & Email`}
    >
      {completedReceipt ? (
        <div className="space-y-5">
          <div className="p-5 rounded-lg border border-emerald-500/40 bg-emerald-950/20 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <div className="text-xs font-mono uppercase text-emerald-400">
              PEMBAYARAN BERHASIL DIVERIFIKASI • KWITANSI RESMI TERBIT
            </div>
            <h4 className="text-lg font-bold text-slate-100">
              {completedReceipt.receiptNumber}
            </h4>
            <div className="text-2xl font-mono font-bold text-amber-400">
              {formatIDR(completedReceipt.amount)}
            </div>
            <div className="text-xs text-slate-300">
              Metode: <strong>{completedReceipt.methodLabel}</strong> • Waktu:{' '}
              {completedReceipt.paidAt}
            </div>
          </div>

          {/* WA & Email Instant Delivery Card */}
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/80 space-y-3">
            <div className="text-xs font-mono uppercase text-amber-400 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" />
              <span>NOTIFIKASI BUKTI LUNAS WHATSAPP & EMAIL (SIAP DIKIRIM / DISALIN)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
              <div className="p-2.5 rounded border border-slate-800 bg-slate-900/60">
                <span className="text-slate-400">Tujuan WhatsApp Parent/Pemain:</span>
                <div className="font-mono font-semibold text-emerald-400 mt-0.5">
                  {recipientPhone}
                </div>
              </div>
              <div className="p-2.5 rounded border border-slate-800 bg-slate-900/60">
                <span className="text-slate-400">Tujuan Email Resmi:</span>
                <div className="font-mono font-semibold text-amber-300 mt-0.5">
                  {recipientEmail}
                </div>
              </div>
            </div>

            <div className="p-3 rounded border border-slate-800 bg-slate-900/90 text-xs font-mono text-slate-200 whitespace-pre-wrap">
              {receiptWaMessage}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={waDirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Kirim ke WhatsApp Sekarang</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={mailtoDirectUrl}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Kirim via Aplikasi Email</span>
              </a>
              <button
                type="button"
                onClick={() => handleCopyText(receiptWaMessage, 'Pesan Bukti Lunas WA/Email')}
                className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Pesan Bukti Lunas</span>
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setCompletedReceipt(null);
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded"
            >
              Selesai & Tutup
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleProcessPayment} className="space-y-5">
          {/* Ringkasan Tagihan */}
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-mono text-amber-400">
                {invoice.invoiceNumber} • {invoice.revenueCategory}
              </div>
              <div className="text-sm font-bold text-slate-100 mt-0.5">
                {athlete?.fullName || 'Umum'} — {invoice.description}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Jatuh Tempo: <span className="font-mono text-slate-300">{invoice.dueDate}</span> •
                Wali: <span className="text-slate-300">{athlete?.parentContactName || '-'}</span>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                Sisa Tagihan Harus Dibayar
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {formatIDR(remainingAmount)}
              </div>
            </div>
          </div>

          {/* Pemilih Metode Pembayaran: QRIS / E-Wallet / Transfer Bank */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              1. Pilih Metode Pembayaran Mudah (Dikonfigurasi di Pengaturan Aplikasi):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedChannel('QRIS')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedChannel === 'QRIS'
                    ? 'bg-amber-500/15 border-amber-500 text-slate-100'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <QrCode className="w-4 h-4 text-amber-400" />
                  <span className="text-[10px] font-mono uppercase text-emerald-400">INSTAN</span>
                </div>
                <div className="text-xs font-bold text-slate-100 mt-1.5">QRIS Nasional</div>
                <div className="text-[11px] text-slate-400">
                  Scan semua M-Banking & E-Wallet
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedChannel('EWALLET')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedChannel === 'EWALLET'
                    ? 'bg-amber-500/15 border-amber-500 text-slate-100'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] font-mono uppercase text-amber-300">
                    {activeWallets.length} DOMPET
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-100 mt-1.5">
                  E-Wallet Digital
                </div>
                <div className="text-[11px] text-slate-400">
                  GoPay, OVO, DANA, ShopeePay
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedChannel('BANK_TRANSFER')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedChannel === 'BANK_TRANSFER'
                    ? 'bg-amber-500/15 border-amber-500 text-slate-100'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Building2 className="w-4 h-4 text-sky-400" />
                  <span className="text-[10px] font-mono uppercase text-sky-300">
                    {activeBanks.length} BANK
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-100 mt-1.5">
                  Transfer Bank
                </div>
                <div className="text-[11px] text-slate-400">
                  BCA, Mandiri, BNI, BRI Resmi
                </div>
              </button>
            </div>
          </div>

          {/* DETAIL METODE 1: QRIS */}
          {selectedChannel === 'QRIS' && (
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/80 space-y-4">
              <div className="flex flex-col md:flex-row items-center gap-5">
                <div className="shrink-0 text-center space-y-2">
                  <QrCodeSvg value={qrisDynamicCode} size={168} />
                  <button
                    type="button"
                    onClick={handleDownloadQrisSvg}
                    className="w-full px-3 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center justify-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Unduh QRIS (.SVG)</span>
                  </button>
                </div>
                <div className="space-y-2.5 text-xs flex-1">
                  <div className="text-[11px] font-mono uppercase text-amber-400">
                    QRIS RESMI AKADEMI • TERVERIFIKASI OTOMATIS
                  </div>
                  <div className="text-sm font-bold text-slate-100">
                    {settings.paymentMethods.qris.merchantName}
                  </div>
                  <div className="font-mono text-slate-300">
                    NMID:{' '}
                    <span className="text-amber-300 font-semibold">
                      {settings.paymentMethods.qris.nmid}
                    </span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    {settings.paymentMethods.qris.instructions}
                  </p>
                  <div className="p-2.5 rounded border border-slate-800 bg-slate-900/70 flex items-center justify-between">
                    <span className="text-slate-400">Nominal Scan QRIS:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-400">
                        {formatIDR(effectivePayAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(String(effectivePayAmount), 'Nominal Tagihan')
                        }
                        className="px-2 py-0.5 text-[11px] bg-slate-800 text-slate-200 rounded flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Salin</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DETAIL METODE 2: E-WALLET */}
          {selectedChannel === 'EWALLET' && (
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/80 space-y-3">
              <div className="text-xs font-semibold text-slate-200">
                Pilih Dompet Digital (E-Wallet) Tujuan:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {activeWallets.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedWalletProvider(w.provider)}
                    className={`p-2.5 rounded border text-left transition-colors ${
                      selectedWalletProvider === w.provider
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-mono text-xs">{w.provider}</div>
                    <div className="text-[11px] text-slate-400 truncate">{w.phoneNumber}</div>
                  </button>
                ))}
              </div>

              {currentWallet && (
                <div className="p-3.5 rounded border border-slate-800 bg-slate-900/70 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-slate-400">
                        Nomor Tujuan {currentWallet.provider} ({currentWallet.accountName}):
                      </div>
                      <div className="text-base font-mono font-bold text-amber-400 mt-0.5">
                        {currentWallet.phoneNumber}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            currentWallet.phoneNumber,
                            `Nomor ${currentWallet.provider}`
                          )
                        }
                        className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Salin Nomor</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(String(effectivePayAmount), 'Nominal Pembayaran')
                        }
                        className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Salin Nominal</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-slate-400">{settings.paymentMethods.ewallet.instructions}</p>
                </div>
              )}
            </div>
          )}

          {/* DETAIL METODE 3: TRANSFER BANK */}
          {selectedChannel === 'BANK_TRANSFER' && (
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/80 space-y-3">
              <div className="text-xs font-semibold text-slate-200">
                Pilih Rekening Bank Resmi Akademi:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {activeBanks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBankName(b.bankName)}
                    className={`p-2.5 rounded border text-left transition-colors ${
                      selectedBankName === b.bankName
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-mono text-xs text-amber-400">{b.bankName}</div>
                    <div className="font-mono text-xs text-slate-100 mt-0.5">
                      {b.accountNumber}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{b.branchName}</div>
                  </button>
                ))}
              </div>

              {currentBank && (
                <div className="p-3.5 rounded border border-slate-800 bg-slate-900/70 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-slate-400">
                        Bank {currentBank.bankName} • {currentBank.branchName}
                      </div>
                      <div className="text-base font-mono font-bold text-amber-400 mt-0.5">
                        {currentBank.accountNumber}
                      </div>
                      <div className="text-slate-200 font-medium">
                        a.n. {currentBank.accountHolder}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            currentBank.accountNumber,
                            `No. Rekening ${currentBank.bankName}`
                          )
                        }
                        className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Salin No. Rek</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(String(effectivePayAmount), 'Nominal Transfer')
                        }
                        className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Salin Nominal</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-slate-400">
                    {settings.paymentMethods.bankTransfer.instructions}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Nominal & Referensi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Nominal Pembayaran (Rp) *
              </label>
              <input
                type="number"
                required
                min={1000}
                max={remainingAmount}
                value={customAmount || String(remainingAmount)}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-emerald-400 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Catatan / No. Referensi (Opsional)
              </label>
              <input
                type="text"
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
                placeholder={`Contoh: Lunas ${invoice.invoiceNumber}`}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
          </div>

          {/* Opsi Kirim Notifikasi WA & Email */}
          <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/60 space-y-2">
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Notifikasi Otomatis Bukti Pembayaran (Sesuai Pengaturan Aplikasi)</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWaAfterPay}
                  onChange={(e) => setSendWaAfterPay(e.target.checked)}
                />
                <span>
                  Kirim Notifikasi WhatsApp ke Wali/Pemain ({recipientPhone})
                </span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmailAfterPay}
                  onChange={(e) => setSendEmailAfterPay(e.target.checked)}
                />
                <span>Kirim Kwitansi ke Email ({recipientEmail})</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-300 border border-slate-700 rounded"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || remainingAmount <= 0}
              className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>
                {submitting
                  ? 'Memproses Pembayaran...'
                  : `Konfirmasi & Bayar Sekarang (${formatIDR(effectivePayAmount)})`}
              </span>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

interface WaEmailDispatchModalProps {
  open: boolean;
  onClose: () => void;
  state: SystemState;
  mode: 'INVOICE' | 'RECEIPT';
  invoiceId: string;
  receiptId?: string;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function WaEmailDispatchModal({
  open,
  onClose,
  state,
  mode,
  invoiceId,
  receiptId,
  onRefresh,
  notify,
}: WaEmailDispatchModalProps) {
  const settings = useMemo(() => getEffectiveAppSettings(state), [state]);
  const invoice = state.invoices.find((i) => i.id === invoiceId);
  const payment = receiptId
    ? state.payments.find((p) => p.id === receiptId)
    : state.payments.find((p) => p.invoiceId === invoiceId);
  const athlete = state.athletes.find((a) => a.id === invoice?.athleteId);
  const parentLink = state.parentAthletes.find((pa) => pa.athleteId === athlete?.id);
  const parent = parentLink ? state.parents.find((p) => p.id === parentLink.parentId) : null;

  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [sending, setSending] = useState(false);

  if (!invoice) return null;

  const defaultPhone =
    parent?.phone ||
    athlete?.parentContactPhone ||
    settings.notificationChannels.whatsapp.senderNumber;
  const defaultEmail =
    parent?.email ||
    state.currentUser.email ||
    settings.notificationChannels.email.replyToEmail;

  const targetPhone = phoneInput || defaultPhone;
  const targetEmail = emailInput || defaultEmail;

  const remaining = Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount));
  const vars = {
    athleteName: athlete?.fullName || 'Atlet Akademi ZAMOA CBTC',
    invoiceNumber: invoice.invoiceNumber,
    receiptNumber: payment?.receiptNumber || `RCP-${invoice.invoiceNumber.slice(-6)}`,
    amount: formatIDR(mode === 'RECEIPT' && payment ? payment.amount : remaining || invoice.totalAmount),
    dueDate: invoice.dueDate,
    paymentMethod: payment?.paymentMethod || 'QRIS / E-Wallet / Transfer Bank',
  };

  const waMessage = interpolateNotificationTemplate(
    mode === 'RECEIPT'
      ? settings.notificationChannels.whatsapp.receiptTemplate
      : settings.notificationChannels.whatsapp.invoiceTemplate,
    vars
  );

  const emailSubject = interpolateNotificationTemplate(
    mode === 'RECEIPT'
      ? settings.notificationChannels.email.receiptSubjectTemplate
      : settings.notificationChannels.email.invoiceSubjectTemplate,
    vars
  );

  const waLink = `https://wa.me/${formatPhoneForWaLink(targetPhone)}?text=${encodeURIComponent(
    waMessage
  )}`;
  const mailtoLink = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(
    emailSubject
  )}&body=${encodeURIComponent(waMessage)}`;

  const handleDispatchLog = async (channel: 'WHATSAPP' | 'EMAIL' | 'BOTH') => {
    setSending(true);
    try {
      await apiRequest('/api/notifications/dispatch-wa-email', {
        method: 'POST',
        body: JSON.stringify({
          channel,
          recipientPhone: targetPhone,
          recipientEmail: targetEmail,
          title: emailSubject,
          message: waMessage,
          category: 'BILLING',
        }),
      });
      notify(
        `Notifikasi ${
          channel === 'BOTH' ? 'WhatsApp & Email' : channel
        } berhasil dikirim & dicatat di pusat notifikasi.`
      );
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal mengirim notifikasi', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === 'RECEIPT'
          ? `Kirim Bukti Lunas / Kwitansi via WhatsApp & Email (${vars.receiptNumber})`
          : `Kirim Pengingat Tagihan via WhatsApp & Email (${invoice.invoiceNumber})`
      }
      subtitle="Menggunakan template resmi yang tersimpan di Pengaturan Aplikasi."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Nomor WhatsApp Parent / Pemain
            </label>
            <input
              type="text"
              value={targetPhone}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Alamat Email Parent / Pemain
            </label>
            <input
              type="email"
              value={targetEmail}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-amber-300"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Subjek Email:</label>
          <div className="px-3 py-2 rounded border border-slate-800 bg-slate-950 text-xs font-mono text-slate-200">
            {emailSubject}
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Isi Pesan WhatsApp & Email (Diformat Otomatis):
          </label>
          <div className="p-3 rounded border border-slate-800 bg-slate-950 text-xs font-mono text-slate-200 whitespace-pre-wrap">
            {waMessage}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleDispatchLog('WHATSAPP')}
              className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Buka & Kirim WhatsApp</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={mailtoLink}
              onClick={() => handleDispatchLog('EMAIL')}
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Buka & Kirim Email</span>
            </a>
          </div>

          <button
            type="button"
            disabled={sending}
            onClick={() => handleDispatchLog('BOTH')}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5 text-amber-400" />
            <span>{sending ? 'Mengirim...' : 'Simpan & Siarkan Notif WA + Email'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
