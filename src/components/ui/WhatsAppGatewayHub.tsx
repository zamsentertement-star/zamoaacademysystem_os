import React, { useState, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Calendar,
  Clock,
  MapPin,
  Receipt,
  CreditCard,
  Phone,
  Sparkles,
  Copy,
  RefreshCw,
  UserCheck,
  ShieldCheck,
  BellRing,
  Eye,
} from 'lucide-react';
import { SystemState, getEffectiveAppSettings } from '../../types/system.ts';
import { apiRequest, formatIDR } from '../../lib/api.ts';
import { Modal, StatusText } from './Primitives.tsx';

interface WhatsAppGatewayHubProps {
  state: SystemState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
  defaultTab?: 'training_reminders' | 'invoice_payments' | 'gateway_logs';
  defaultView?: 'training' | 'invoices' | 'logs';
}

export function normalizeWaPhoneDisplay(rawPhone?: string | null): string {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '628119002026';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

export function WhatsAppGatewayHub({
  state,
  onRefresh,
  notify,
  defaultTab,
  defaultView,
}: WhatsAppGatewayHubProps) {
  const resolvedDefaultTab =
    defaultTab ||
    (defaultView === 'invoices'
      ? 'invoice_payments'
      : defaultView === 'logs'
      ? 'gateway_logs'
      : 'training_reminders');
  const settings = useMemo(() => getEffectiveAppSettings(state), [state]);
  const waCfg = settings.notificationChannels.whatsapp;

  const availableSessionDates = useMemo(() => {
    const dates = Array.from(
      new Set(
        state.trainingSessions
          .filter((s) => s.status !== 'CANCELLED')
          .map((s) => s.sessionDate)
      )
    ).sort();
    return dates;
  }, [state.trainingSessions]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const initialDate = useMemo(() => {
    if (availableSessionDates.includes(todayStr)) return todayStr;
    return availableSessionDates[0] || todayStr;
  }, [availableSessionDates, todayStr]);

  const [activeTab, setActiveTab] = useState<
    'training_reminders' | 'invoice_payments' | 'gateway_logs'
  >(resolvedDefaultTab);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('ALL');
  const [customPhoneOverride, setCustomPhoneOverride] = useState<string>('');
  const [dispatching, setDispatching] = useState<boolean>(false);
  const [previewModal, setPreviewModal] = useState<{
    title: string;
    recipientParent: string;
    recipientPhone: string;
    messageBody: string;
    onSendAction?: () => Promise<void>;
  } | null>(null);

  // Map each athlete to their parent's name & normalized WhatsApp phone
  const athleteParentWaMap = useMemo(() => {
    const map = new Map<
      string,
      {
        parentName: string;
        rawPhone: string;
        waPhone: string;
      }
    >();

    state.athletes.forEach((ath) => {
      const pLinks = (state.parentAthletes || []).filter((pa) => pa.athleteId === ath.id);
      const primaryLink = pLinks.find((pa) => pa.isPrimaryGuardian) || pLinks[0];
      const linkedParent = primaryLink
        ? (state.parents || []).find((p) => p.id === primaryLink.parentId)
        : (state.parents || []).find(
            (p) =>
              p.fullName.toLowerCase() === (ath.parentContactName || '').toLowerCase() ||
              p.phone === ath.parentContactPhone
          );

      const parentName = linkedParent?.fullName || ath.parentContactName || 'Orang Tua / Wali';
      const rawPhone =
        linkedParent?.phone || ath.parentContactPhone || waCfg.senderNumber || '081288001101';
      map.set(ath.id, {
        parentName,
        rawPhone,
        waPhone: normalizeWaPhoneDisplay(rawPhone),
      });
    });

    return map;
  }, [state.athletes, state.parents, state.parentAthletes, waCfg.senderNumber]);

  // Filter sessions for the selected date
  const sessionsForDate = useMemo(() => {
    const byDate = state.trainingSessions.filter(
      (s) => s.status !== 'CANCELLED' && s.sessionDate === selectedDate
    );
    const base = byDate.length > 0 ? byDate : state.trainingSessions.slice(0, 4);
    if (selectedSessionId !== 'ALL') {
      return base.filter((s) => s.id === selectedSessionId);
    }
    return base;
  }, [state.trainingSessions, selectedDate, selectedSessionId]);

  // Build recipient rows for Daily Training Schedule Reminders
  const dailyTrainingReminderRows = useMemo(() => {
    const rows: Array<{
      sessionId: string;
      sessionDate: string;
      startTime: string;
      endTime: string;
      courtName: string;
      topic: string;
      teamName: string;
      coachName: string;
      athleteId: string;
      athleteName: string;
      memberCode: string;
      parentName: string;
      waPhone: string;
      renderedMessage: string;
    }> = [];

    const tpl =
      waCfg.trainingReminderTemplate ||
      'Halo Bapak/Ibu *{parent_name}* (Wali dari *{athlete_name}*),\n\n🏀 *PENGINGAT JADWAL LATIHAN HARIAN ZAMOA CBTC*\n📅 Tanggal: *{session_date}*\n⏰ Waktu: *{start_time} – {end_time} WIB*\n📍 Lapangan: *{court_name}*\n🎽 Tim: *{team_name}*\n👨‍🏫 Pelatih: *{coach_name}*\n📋 Materi: *{topic}*\n\nMohon hadir 15 menit sebelum sesi dimulai dan siapkan QR Pass Presensi Atlet.';

    sessionsForDate.forEach((sess) => {
      const team = state.teams.find((t) => t.id === sess.teamId);
      const coach = state.coaches.find((c) => c.id === sess.coachId);
      let teamAthletes = state.athletes.filter((a) => a.teamId === sess.teamId);
      if (teamAthletes.length === 0) {
        teamAthletes = state.athletes.filter((a) => a.branchId === sess.branchId);
      }
      if (teamAthletes.length === 0) {
        teamAthletes = state.athletes.slice(0, 3);
      }

      teamAthletes.forEach((ath) => {
        const pInfo = athleteParentWaMap.get(ath.id) || {
          parentName: ath.parentContactName || 'Orang Tua / Wali',
          rawPhone: ath.parentContactPhone || waCfg.senderNumber,
          waPhone: normalizeWaPhoneDisplay(ath.parentContactPhone || waCfg.senderNumber),
        };
        const effectivePhone = customPhoneOverride.trim()
          ? normalizeWaPhoneDisplay(customPhoneOverride)
          : pInfo.waPhone;

        const renderedMessage = tpl
          .replace(/\{parent_name\}/g, pInfo.parentName)
          .replace(/\{athlete_name\}/g, ath.fullName)
          .replace(/\{session_date\}/g, sess.sessionDate)
          .replace(/\{start_time\}/g, sess.startTime)
          .replace(/\{end_time\}/g, sess.endTime)
          .replace(/\{court_name\}/g, sess.courtName)
          .replace(/\{team_name\}/g, team?.name || 'Tim Akademi CBTC')
          .replace(/\{coach_name\}/g, coach?.fullName || 'Pelatih Akademi')
          .replace(/\{topic\}/g, sess.topic);

        rows.push({
          sessionId: sess.id,
          sessionDate: sess.sessionDate,
          startTime: sess.startTime,
          endTime: sess.endTime,
          courtName: sess.courtName,
          topic: sess.topic,
          teamName: team?.name || 'Tim Akademi CBTC',
          coachName: coach?.fullName || 'Pelatih Akademi',
          athleteId: ath.id,
          athleteName: ath.fullName,
          memberCode: ath.memberCode,
          parentName: pInfo.parentName,
          waPhone: effectivePhone,
          renderedMessage,
        });
      });
    });

    return rows;
  }, [
    sessionsForDate,
    state.teams,
    state.coaches,
    state.athletes,
    athleteParentWaMap,
    waCfg.trainingReminderTemplate,
    waCfg.senderNumber,
    customPhoneOverride,
  ]);

  // Filter WhatsApp Gateway logs from state.notifications
  const waGatewayLogs = useMemo(() => {
    return state.notifications.filter(
      (n) =>
        n.title.includes('WA-GATEWAY') ||
        n.title.includes('WA (') ||
        n.message.includes('WhatsApp Otomatis')
    );
  }, [state.notifications]);

  const handleDispatchDailyTrainingReminders = async (sessionId?: string) => {
    setDispatching(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        dispatchedCount: number;
        sessionsCount: number;
      }>('/api/whatsapp-gateway/send-daily-training-reminders', {
        method: 'POST',
        body: JSON.stringify({
          sessionDate: selectedDate,
          sessionId: sessionId || (selectedSessionId !== 'ALL' ? selectedSessionId : undefined),
          customPhoneOverride: customPhoneOverride.trim() || undefined,
        }),
      });
      notify(
        `Gateway WhatsApp berhasil mengirim ${res.dispatchedCount} pesan pengingat jadwal latihan harian (${res.sessionsCount} sesi) ke nomor WhatsApp orang tua!`
      );
      await onRefresh();
    } catch (err: unknown) {
      notify(
        err instanceof Error
          ? err.message
          : 'Gagal mengirim pengingat jadwal latihan via WhatsApp Gateway.',
        'error'
      );
    } finally {
      setDispatching(false);
    }
  };

  const handleDispatchInvoiceWhatsApp = async (params: {
    invoiceId?: string;
    paymentId?: string;
    mode: 'PAYMENT_RECEIPT' | 'INVOICE_REMINDER' | 'BULK_UNPAID_INVOICES';
  }) => {
    setDispatching(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        dispatchedCount: number;
      }>('/api/whatsapp-gateway/send-invoice-notification', {
        method: 'POST',
        body: JSON.stringify({
          ...params,
          customPhoneOverride: customPhoneOverride.trim() || undefined,
        }),
      });
      notify(
        `Gateway WhatsApp berhasil mengirim ${res.dispatchedCount} notifikasi ${
          params.mode === 'PAYMENT_RECEIPT'
            ? 'bukti pembayaran / kwitansi lunas'
            : 'tagihan invoice'
        } ke nomor WhatsApp orang tua!`
      );
      await onRefresh();
    } catch (err: unknown) {
      notify(
        err instanceof Error
          ? err.message
          : 'Gagal mengirim notifikasi pembayaran invoice via WhatsApp Gateway.',
        'error'
      );
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. WHATSAPP GATEWAY ENGINE STATUS & GLOBAL ACTION BAR */}
      <div className="rounded-lg border border-emerald-500/30 bg-slate-900/70 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <ShieldCheck className="w-3.5 h-3.5" />
                WHATSAPP GATEWAY CONNECTED
              </span>
              <span className="font-mono text-xs text-amber-400">
                Sender Resmi: +{normalizeWaPhoneDisplay(waCfg.senderNumber)} ({waCfg.senderName})
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                • Mode: {waCfg.gatewayMode || 'ZAMOA_WA_CLOUD_GATEWAY_ENGINE'}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100">
              Integrasi Gateway WhatsApp Otomatis — Pengingat Latihan Harian & Pembayaran Invoice Orang Tua
            </h3>
            <p className="text-xs text-slate-400">
              Mengirim pengingat jadwal latihan harian berdasarkan roster tim serta bukti pembayaran kwitansi/invoice secara otomatis ke nomor WhatsApp masing-masing orang tua atlet.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={dispatching}
              onClick={() => handleDispatchDailyTrainingReminders()}
              className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Kirim WA Pengingat Latihan Harian ({dailyTrainingReminderRows.length} Wali)</span>
            </button>
            <button
              type="button"
              disabled={dispatching}
              onClick={() =>
                handleDispatchInvoiceWhatsApp({ mode: 'BULK_UNPAID_INVOICES' })
              }
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Blast WA Tagihan Belum Lunas</span>
            </button>
          </div>
        </div>

        {/* Gateway Metrics & Override Phone Input */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80 text-xs">
          <div className="p-3 rounded border border-slate-800 bg-slate-950/60">
            <div className="text-[10px] font-mono uppercase text-slate-400">
              AUTO-REMINDER JADWAL LATIHAN
            </div>
            <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
              AKTIF ({waCfg.dailyReminderTimeWib || '07:00'} WIB & Saat Sesi Dibuat)
            </div>
          </div>

          <div className="p-3 rounded border border-slate-800 bg-slate-950/60">
            <div className="text-[10px] font-mono uppercase text-slate-400">
              AUTO-NOTIF PEMBAYARAN INVOICE
            </div>
            <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
              AKTIF (Otomatis Saat Bayar / Terbit Invoice)
            </div>
          </div>

          <div className="p-3 rounded border border-slate-800 bg-slate-950/60">
            <div className="text-[10px] font-mono uppercase text-slate-400">
              TOTAL PESAN WA TERKIRIM (GATEWAY LOG)
            </div>
            <div className="text-sm font-bold text-amber-400 font-mono mt-0.5">
              {waGatewayLogs.length} Pesan Terverifikasi
            </div>
          </div>

          <div className="p-3 rounded border border-slate-800 bg-slate-950/60">
            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
              Override Nomor WA Tujuan Uji Coba (Opsional)
            </label>
            <input
              type="text"
              value={customPhoneOverride}
              onChange={(e) => setCustomPhoneOverride(e.target.value)}
              placeholder="Kosongkan = No. WA Wali di DB"
              className="w-full px-2.5 py-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* 2. SUB-TABS FOR WHATSAPP GATEWAY HUB */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('training_reminders')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              activeTab === 'training_reminders'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>
              1. Pengingat Jadwal Latihan Harian ({dailyTrainingReminderRows.length} Target WA Wali)
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('invoice_payments')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              activeTab === 'invoice_payments'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>
              2. Notifikasi Pembayaran Invoice & Kwitansi ({state.invoices.length} Invoice •{' '}
              {state.payments.length} Pembayaran)
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gateway_logs')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              activeTab === 'gateway_logs'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>3. Log Pengiriman Gateway WhatsApp ({waGatewayLogs.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DAILY TRAINING SCHEDULE REMINDERS */}
      {activeTab === 'training_reminders' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Pilih Tanggal Latihan:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSessionId('ALL');
                }}
                className="px-2.5 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
              {availableSessionDates.slice(0, 5).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSelectedDate(d);
                    setSelectedSessionId('ALL');
                  }}
                  className={`px-2.5 py-1 text-xs font-mono rounded border ${
                    selectedDate === d
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                      : 'bg-slate-950 text-slate-300 border-slate-800'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                <option value="ALL">Semua Sesi Latihan pada Tanggal Ini</option>
                {state.trainingSessions
                  .filter((s) => s.status !== 'CANCELLED')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sessionDate} ({s.startTime}–{s.endTime}) • {s.courtName} — {s.topic}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-100">
                  Daftar Antrean Pengingat Jadwal Latihan Harian ke Nomor WhatsApp Orang Tua
                </h4>
                <p className="text-xs text-slate-400">
                  Setiap baris menampilkan atlet peserta sesi, nama orang tua/wali, nomor WhatsApp terformat E.164, dan pratinjau pesan otomatis.
                </p>
              </div>
              <button
                type="button"
                disabled={dispatching}
                onClick={() => handleDispatchDailyTrainingReminders()}
                className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {dispatching
                    ? 'Mengirim via Gateway...'
                    : `Kirim Semua Pengingat Latihan (${dailyTrainingReminderRows.length} WA)`}
                </span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-950/60">
                    <th className="py-2.5 px-4">Jadwal & Lapangan</th>
                    <th className="py-2.5 px-4">Tim, Pelatih & Materi</th>
                    <th className="py-2.5 px-4">Atlet</th>
                    <th className="py-2.5 px-4">Orang Tua / Wali & Nomor WhatsApp</th>
                    <th className="py-2.5 px-4 text-right">Aksi Gateway WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {dailyTrainingReminderRows.map((row, idx) => (
                    <tr key={`${row.sessionId}-${row.athleteId}-${idx}`} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-amber-400">{row.sessionDate}</div>
                        <div className="text-slate-200">
                          {row.startTime} – {row.endTime} WIB
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-emerald-400" />
                          <span>{row.courtName}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{row.teamName}</div>
                        <div className="text-slate-300 text-[11px]">Pelatih: {row.coachName}</div>
                        <div className="text-slate-400 text-[11px] truncate max-w-xs">
                          Materi: {row.topic}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{row.athleteName}</div>
                        <div className="font-mono text-[11px] text-amber-400">{row.memberCode}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{row.parentName}</div>
                        <div className="font-mono text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          <span>+{row.waPhone}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewModal({
                                title: `Pratinjau WA Pengingat Latihan — ${row.athleteName}`,
                                recipientParent: row.parentName,
                                recipientPhone: row.waPhone,
                                messageBody: row.renderedMessage,
                                onSendAction: () =>
                                  handleDispatchDailyTrainingReminders(row.sessionId),
                              })
                            }
                            className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3 text-amber-400" />
                            <span>Pratinjau</span>
                          </button>
                          <button
                            type="button"
                            disabled={dispatching}
                            onClick={() => handleDispatchDailyTrainingReminders(row.sessionId)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>Kirim WA</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INVOICE PAYMENT & BILLING WHATSAPP NOTIFICATIONS */}
      {activeTab === 'invoice_payments' && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-100">
                Otomatisasi Notifikasi Pembayaran Invoice & Kwitansi Lunas ke Nomor WhatsApp Orang Tua
              </h4>
              <p className="text-xs text-slate-400">
                Saat kasir/admin mencatat pembayaran di FinanceAccountingView, sistem otomatis mengirim kwitansi lunas ke WhatsApp orang tua. Anda juga dapat mengirim ulang atau mengirim pengingat tagihan di bawah ini.
              </p>
            </div>
            <button
              type="button"
              disabled={dispatching}
              onClick={() => handleDispatchInvoiceWhatsApp({ mode: 'BULK_UNPAID_INVOICES' })}
              className="px-3.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Kirim Pengingat Semua Invoice Belum Lunas via WA Gateway</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-950/60">
                  <th className="py-2.5 px-4">No. Invoice & Kwitansi</th>
                  <th className="py-2.5 px-4">Atlet & Deskripsi Tagihan</th>
                  <th className="py-2.5 px-4">Orang Tua / Wali & No. WhatsApp</th>
                  <th className="py-2.5 px-4 text-right">Total / Terbayar</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Kirim Otomatis via WA Gateway</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {state.invoices.map((inv) => {
                  const ath = state.athletes.find((a) => a.id === inv.athleteId);
                  const pInfo = ath ? athleteParentWaMap.get(ath.id) : undefined;
                  const parentName =
                    pInfo?.parentName || ath?.parentContactName || 'Orang Tua / Wali';
                  const waPhone = customPhoneOverride.trim()
                    ? normalizeWaPhoneDisplay(customPhoneOverride)
                    : pInfo?.waPhone || normalizeWaPhoneDisplay(waCfg.senderNumber);
                  const payment = state.payments.find((p) => p.invoiceId === inv.id);
                  const remaining = Math.max(
                    0,
                    Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)
                  );
                  const isPaid = inv.status === 'PAID' || remaining <= 0;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-amber-400">{inv.invoiceNumber}</div>
                        <div className="text-[11px] text-slate-400">{inv.revenueCategory}</div>
                        {payment && (
                          <div className="text-[11px] text-emerald-400 mt-0.5">
                            Kwitansi: {payment.receiptNumber} ({payment.paymentMethod})
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">
                          {ath?.fullName || 'Atlet Akademi'}
                        </div>
                        <div className="text-slate-400 text-[11px]">{inv.description}</div>
                        <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                          Jatuh Tempo: {inv.dueDate}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{parentName}</div>
                        <div className="font-mono text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          <span>+{waPhone}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono">
                        <div className="text-slate-100 font-bold">
                          Total: {formatIDR(inv.totalAmount)}
                        </div>
                        <div className="text-emerald-400 text-[11px]">
                          Dibayar: {formatIDR(inv.paidAmount)}
                        </div>
                        {remaining > 0 && (
                          <div className="text-amber-300 text-[11px]">
                            Sisa: {formatIDR(remaining)}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <StatusText status={inv.status} />
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={dispatching}
                          onClick={() =>
                            handleDispatchInvoiceWhatsApp({
                              invoiceId: inv.id,
                              paymentId: payment?.id,
                              mode: isPaid ? 'PAYMENT_RECEIPT' : 'INVOICE_REMINDER',
                            })
                          }
                          className={`px-3 py-1.5 text-xs font-semibold rounded inline-flex items-center gap-1.5 ${
                            isPaid
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          }`}
                        >
                          <Send className="w-3 h-3" />
                          <span>
                            {isPaid
                              ? 'Kirim WA Kwitansi Pembayaran'
                              : 'Kirim WA Tagihan Invoice'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: WHATSAPP GATEWAY DELIVERY LOGS */}
      {activeTab === 'gateway_logs' && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-100">
                Riwayat Pengiriman Gateway WhatsApp (Delivery Receipt Log)
              </h4>
              <p className="text-xs text-slate-400">
                Jejak audit pengiriman pengingat latihan harian & notifikasi pembayaran invoice ke nomor WhatsApp orang tua.
              </p>
            </div>
            <span className="font-mono text-xs text-emerald-400">
              {waGatewayLogs.length} Pesan Terkirim
            </span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {waGatewayLogs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-slate-800/30 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                        log.category === 'TRAINING'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {log.category === 'TRAINING' ? 'TRAINING REMINDER' : 'INVOICE / PAYMENT'}
                    </span>
                    <span className="font-semibold text-xs text-slate-100">{log.title}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {new Date(log.createdAt).toLocaleString('id-ID')}
                  </span>
                </div>
                <pre className="text-xs text-slate-300 font-sans whitespace-pre-wrap bg-slate-950/70 p-3 rounded border border-slate-800/80">
                  {log.message}
                </pre>
              </div>
            ))}
            {waGatewayLogs.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada riwayat pengiriman WhatsApp Gateway.
              </div>
            )}
          </div>
        </div>
      )}

      {/* PREVIEW MODAL */}
      <Modal
        open={Boolean(previewModal)}
        onClose={() => setPreviewModal(null)}
        title={previewModal?.title || 'Pratinjau Pesan WhatsApp Gateway'}
      >
        {previewModal && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/70 flex items-center justify-between">
              <div>
                <div className="text-slate-400">Penerima Orang Tua / Wali:</div>
                <div className="text-sm font-bold text-slate-100">
                  {previewModal.recipientParent}
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-slate-400">Nomor WhatsApp Tujuan:</div>
                <div className="text-sm font-bold text-emerald-400">
                  +{previewModal.recipientPhone}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Isi Pesan WhatsApp Otomatis:
              </label>
              <pre className="p-3.5 rounded-lg border border-emerald-500/30 bg-slate-950 text-slate-100 font-sans text-xs whitespace-pre-wrap leading-relaxed">
                {previewModal.messageBody}
              </pre>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(previewModal.messageBody);
                  notify('Isi pesan WhatsApp berhasil disalin.');
                }}
                className="px-3 py-2 text-xs font-semibold bg-slate-900 text-slate-200 border border-slate-700 rounded flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Pesan</span>
              </button>
              {previewModal.onSendAction && (
                <button
                  type="button"
                  onClick={async () => {
                    const action = previewModal.onSendAction;
                    setPreviewModal(null);
                    if (action) await action();
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Kirim Sekarang via WhatsApp Gateway</span>
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
