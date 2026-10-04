import React, { useState, useMemo } from 'react';
import {
  Trophy,
  Plus,
  HeartPulse,
  ShieldAlert,
  Award,
  CheckCircle,
  UserPlus,
  Wallet,
  Receipt,
  BellRing,
  Users,
  BookOpen,
} from 'lucide-react';
import { SystemState } from '../types/system.ts';
import { apiRequest, formatIDR } from '../lib/api.ts';
import { hasPermission } from '../lib/rbac.ts';
import { Modal, StatusText } from '../components/ui/Primitives.tsx';

interface CompetitionMedicalViewProps {
  state: SystemState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function CompetitionMedicalView({ state, onRefresh, notify }: CompetitionMedicalViewProps) {
  const [subTab, setSubTab] = useState<'tournaments' | 'matches' | 'achievements' | 'medical'>(
    'tournaments'
  );
  const [modalType, setModalType] = useState<
    | null
    | 'tournament'
    | 'register_tournament_athletes'
    | 'match'
    | 'complete_match'
    | 'achievement'
    | 'medical_record'
    | 'injury'
  >(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const role = state.currentUser.activeRoleCode;
  const canCreateComp = hasPermission(role, 'competition', 'create');
  const canProcessComp = hasPermission(role, 'competition', 'process');
  const canCreateMedical = hasPermission(role, 'medical', 'create');
  const canUpdateMedical = hasPermission(role, 'medical', 'update');

  const [tournamentForm, setTournamentForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    competitionId: state.competitions[0]?.id || '',
    name: '',
    venue: 'GOR Soemantri Brodjonegoro',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    registrationFee: '2500000',
    budgetAmount: '8500000',
    transportPlan: 'Bus Charter Akademi PP',
    accommodationPlan: 'Hotel Atlet Century Park',
    mealsPlan: 'Catering Nutrisi Atlet 3x Sehari',
    participantsCount: '12',
    autoRegisterTeamId: '',
    customFeePerAthlete: '350000',
  });

  const [registerTournamentForm, setRegisterTournamentForm] = useState<{
    tournamentId: string;
    coachId: string;
    feeMode: 'PER_ATHLETE_FIXED' | 'SPLIT_TOURNAMENT_FEE' | 'FULL_TOURNAMENT_FEE';
    customFeePerAthlete: string;
    dueDate: string;
    notes: string;
    selectedAthleteIds: string[];
  }>({
    tournamentId: state.tournaments[0]?.id || '',
    coachId: state.coaches[0]?.id || '',
    feeMode: 'PER_ATHLETE_FIXED',
    customFeePerAthlete: '350000',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    notes: 'Termasuk biaya pendaftaran atlet, ID Card resmi kompetisi & logistik tanding.',
    selectedAthleteIds: state.athletes.slice(0, 2).map((a) => a.id),
  });

  // Compute Parent Balance & Tournament Invoices Lookup
  const athleteParentBalanceMap = useMemo(() => {
    const map = new Map<
      string,
      {
        parentName: string;
        parentPhone: string;
        parentEmail: string;
        currentBalance: number;
      }
    >();

    state.athletes.forEach((ath) => {
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

      const siblingIds = linkedParent
        ? (state.parentAthletes || [])
            .filter((pl) => pl.parentId === linkedParent.id)
            .map((pl) => pl.athleteId)
        : [ath.id];
      const scopeIds = new Set(siblingIds.length > 0 ? siblingIds : [ath.id]);

      const currentBalance = state.invoices
        .filter(
          (inv) =>
            inv.athleteId &&
            scopeIds.has(inv.athleteId) &&
            inv.status !== 'PAID' &&
            inv.status !== 'CANCELLED'
        )
        .reduce(
          (sum, inv) => sum + Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)),
          0
        );

      map.set(ath.id, {
        parentName,
        parentPhone,
        parentEmail,
        currentBalance,
      });
    });

    return map;
  }, [state.athletes, state.parents, state.parentAthletes, state.invoices]);

  const tournamentInvoices = useMemo(
    () => state.invoices.filter((inv) => inv.revenueCategory === 'TOURNAMENT'),
    [state.invoices]
  );

  const [matchForm, setMatchForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    tournamentId: state.tournaments[0]?.id || '',
    teamId: state.teams[0]?.id || '',
    opponentName: '',
    venue: 'Hall Basket A Senayan',
    matchDate: new Date().toISOString().slice(0, 10),
    matchTime: '15:00',
    notes: '',
  });

  const [completeMatchForm, setCompleteMatchForm] = useState({
    ourScore: '78',
    opponentScore: '69',
    mvpAthleteId: state.athletes[0]?.id || '',
    notes: 'Kemenangan solid lewat transisi cepat di kuarter 4.',
    playerStats: state.athletes.slice(0, 3).map((a) => ({
      athleteId: a.id,
      minutesPlayed: 28,
      points: 18,
      rebounds: 7,
      assists: 5,
      steals: 2,
      blocks: 1,
      turnovers: 2,
      fouls: 2,
      fgMade: 7,
      fgAttempted: 14,
      threePtMade: 2,
      threePtAttempted: 5,
      ftMade: 2,
      ftAttempted: 2,
    })),
  });

  const [achievementForm, setAchievementForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    tournamentId: state.tournaments[0]?.id || '',
    teamId: state.teams[0]?.id || '',
    athleteId: state.athletes[0]?.id || '',
    title: '',
    category: 'MVP',
    rankPosition: 'Juara 1 / Gold Medal',
    awardedDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const [medRecordForm, setMedRecordForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    athleteId: state.athletes[0]?.id || '',
    bloodType: 'O+',
    allergies: 'Tidak ada',
    chronicConditions: 'Tidak ada',
    insuranceProvider: 'BPJS Kesehatan & Prudential Sport',
    insuranceNumber: 'PRU-9928172',
    returnToPlayStatus: 'CLEARED',
    medicalNotes: 'Kondisi kardiovaskular dan muskuloskeletal prima.',
  });

  const [injuryForm, setInjuryForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    athleteId: state.athletes[0]?.id || '',
    injuryDate: new Date().toISOString().slice(0, 10),
    bodyPart: 'Ankle Kanan (Lateral Ligament)',
    diagnosis: 'Grade 1 Mild Ankle Sprain',
    severity: 'MINOR',
    treatmentPlan: 'RICE Protocol + Fisioterapi Penguatan Proprioseptif 7 Hari',
    recoveryNote: 'Latihan shooting statis diperbolehkan tanpa kontak.',
    returnToPlayStatus: 'LIMITED_CONTACT',
    expectedRecoveryDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  });

  const handleUpdateInjuryRtp = async (injuryId: string, returnToPlayStatus: string) => {
    try {
      await apiRequest(`/api/medical/injuries/${injuryId}/rtp`, {
        method: 'PATCH',
        body: JSON.stringify({
          returnToPlayStatus,
          recoveryNote: `Status RTP diperbarui menjadi ${returnToPlayStatus}`,
        }),
      });
      notify(`Status Return-to-Play diperbarui menjadi ${returnToPlayStatus}.`);
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal mengubah status RTP', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('tournaments')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'tournaments'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Turnamen & Logistik Event ({state.tournaments.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('matches')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'matches'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Pertandingan & Box Score ({state.matches.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('achievements')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'achievements'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Prestasi & Penghargaan ({state.achievements.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('medical')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'medical'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <HeartPulse className="w-3.5 h-3.5" />
            <span>Rekam Medis & Cedera (Return-to-Play)</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'tournaments' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setRegisterTournamentForm((prev) => ({
                    ...prev,
                    tournamentId: prev.tournamentId || state.tournaments[0]?.id || '',
                  }));
                  setModalType('register_tournament_athletes');
                }}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Daftarkan Atlet ke Kompetisi (Auto-Invoice Finance)</span>
              </button>
              {canCreateComp && (
                <button
                  type="button"
                  onClick={() => setModalType('tournament')}
                  className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Buat Turnamen / Event</span>
                </button>
              )}
            </>
          )}
          {subTab === 'matches' && canCreateComp && (
            <button
              type="button"
              onClick={() => setModalType('match')}
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Jadwalkan Pertandingan</span>
            </button>
          )}
          {subTab === 'achievements' && canCreateComp && (
            <button
              type="button"
              onClick={() => setModalType('achievement')}
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
            >
              <Award className="w-3.5 h-3.5" />
              <span>Catat Prestasi Baru</span>
            </button>
          )}
          {subTab === 'medical' && canCreateMedical && (
            <>
              <button
                type="button"
                onClick={() => setModalType('medical_record')}
                className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Profil Medis Atlet</span>
              </button>
              <button
                type="button"
                onClick={() => setModalType('injury')}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
              >
                <HeartPulse className="w-3.5 h-3.5" />
                <span>Laporan Cedera & RTP</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* SUBTAB 1: TOURNAMENTS */}
      {subTab === 'tournaments' && (
        <div className="space-y-6">
          {/* AUTOMATED TOURNAMENT FEE BILLING & PARENT BALANCE NOTIFICATION BANNER */}
          <div className="p-5 rounded-lg border border-emerald-500/30 bg-slate-900/70 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono uppercase text-emerald-400">
                <Wallet className="w-4 h-4" />
                <span>
                  Integrasi Otomatis: Kompetisi ➔ Modul FinanceAccountingView ➔ Saldo Tagihan Orang Tua
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-100">
                Otomatisasi Biaya Pendaftaran Turnamen & Notifikasi Real-Time ke Saldo Orang Tua
              </h3>
              <p className="text-xs text-slate-400 max-w-3xl">
                Saat pelatih mendaftarkan atlet ke turnamen/kompetisi di bawah ini, sistem secara otomatis menerbitkan Invoice kategori <span className="font-mono text-amber-300">TOURNAMENT</span> di modul <strong>Finance & Accounting</strong>, mem-posting jurnal akuntansi berpasangan (<span className="font-mono text-slate-300">Debit 1102 Piutang / Saldo Wali</span> pada <span className="font-mono text-slate-300">Kredit 4103 Pendapatan Turnamen</span>), dan mengirimkan notifikasi pembaruan saldo tagihan langsung ke orang tua atlet.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div className="px-3.5 py-2 rounded border border-slate-800 bg-slate-950 text-right">
                <div className="text-[10px] font-mono text-slate-400 uppercase">
                  Invoice Turnamen Terbit
                </div>
                <div className="text-sm font-mono font-bold text-amber-400">
                  {tournamentInvoices.length} Tagihan ({formatIDR(
                    tournamentInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0)
                  )})
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRegisterTournamentForm((prev) => ({
                    ...prev,
                    tournamentId: state.tournaments[0]?.id || '',
                  }));
                  setModalType('register_tournament_athletes');
                }}
                className="px-4 py-2.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>Daftarkan Atlet & Tagihkan Otomatis</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {state.tournaments.map((t) => {
              const linkedTournamentInvoices = tournamentInvoices.filter(
                (inv) =>
                  inv.description.toLowerCase().includes(t.name.toLowerCase()) ||
                  inv.description.includes(t.id.slice(0, 8))
              );

              return (
                <div
                  key={t.id}
                  className="p-5 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-slate-100">{t.name}</h3>
                        <p className="text-xs text-slate-400">
                          {t.venue} • {t.startDate} s/d {t.endDate}
                        </p>
                      </div>
                      <StatusText status={t.status} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                      <div>
                        <span className="text-slate-400 block">Biaya Registrasi</span>
                        <span className="font-mono font-semibold text-slate-200">
                          {formatIDR(t.registrationFee)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Anggaran Event</span>
                        <span className="font-mono font-semibold text-amber-400">
                          {formatIDR(t.budgetAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Kuota Pemain</span>
                        <span className="font-mono font-semibold text-slate-200">
                          {t.participantsCount} Atlet
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 space-y-1 bg-slate-950/50 p-3 rounded border border-slate-800/60">
                      <div>
                        <strong className="text-slate-300">Transportasi:</strong>{' '}
                        {t.transportPlan || '-'}
                      </div>
                      <div>
                        <strong className="text-slate-300">Akomodasi:</strong>{' '}
                        {t.accommodationPlan || '-'}
                      </div>
                      <div>
                        <strong className="text-slate-300">Konsumsi:</strong> {t.mealsPlan || '-'}
                      </div>
                    </div>

                    {/* Registered Athletes & Automated Finance Invoices for this Tournament */}
                    <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono uppercase text-amber-400 font-semibold flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5" />
                          <span>
                            Atlet Terdaftar & Tagihan Finance ({linkedTournamentInvoices.length} Atlet)
                          </span>
                        </span>
                        <span className="font-mono text-[11px] text-emerald-400">
                          Total Tagihan:{' '}
                          {formatIDR(
                            linkedTournamentInvoices.reduce(
                              (sum, i) => sum + Number(i.totalAmount || 0),
                              0
                            )
                          )}
                        </span>
                      </div>

                      {linkedTournamentInvoices.length === 0 ? (
                        <div className="text-[11px] text-slate-400 py-1">
                          Belum ada atlet yang didaftarkan ke kompetisi ini. Klik tombol di bawah untuk mendaftarkan atlet & menerbitkan invoice otomatis ke saldo orang tua.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                          {linkedTournamentInvoices.map((inv) => {
                            const ath = state.athletes.find((a) => a.id === inv.athleteId);
                            const parentInfo = ath ? athleteParentBalanceMap.get(ath.id) : undefined;
                            return (
                              <div
                                key={inv.id}
                                className="p-2 rounded border border-slate-800/90 bg-slate-900/70 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-100 truncate">
                                    {ath?.fullName || 'Atlet'} ({ath?.memberCode || '-'})
                                  </div>
                                  <div className="font-mono text-[10px] text-slate-400 truncate">
                                    {inv.invoiceNumber} • Wali: {parentInfo?.parentName || '-'} (Saldo Tagihan:{' '}
                                    <span className="text-amber-300">
                                      {formatIDR(parentInfo?.currentBalance || 0)}
                                    </span>
                                    )
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-mono font-bold text-emerald-400">
                                    {formatIDR(inv.totalAmount)}
                                  </div>
                                  <StatusText status={inv.status} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-slate-400">
                      Akun COA: 1102 Piutang ➔ 4103 Pendapatan Turnamen
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRegisterTournamentForm((prev) => ({
                          ...prev,
                          tournamentId: t.id,
                          dueDate: t.startDate || prev.dueDate,
                        }));
                        setModalType('register_tournament_athletes');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>+ Daftarkan Atlet & Auto-Billing</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBTAB 2: MATCHES & BOX SCORE */}
      {subTab === 'matches' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Tanggal & Venue</th>
                    <th className="py-3 px-4">Pertandingan</th>
                    <th className="py-3 px-4">Skor Akhir</th>
                    <th className="py-3 px-4">MVP Pertandingan</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {state.matches.map((m) => {
                    const team = state.teams.find((t) => t.id === m.teamId);
                    const mvp = state.athletes.find((a) => a.id === m.mvpAthleteId);
                    return (
                      <tr key={m.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-mono text-xs text-slate-200">
                          <div>
                            {m.matchDate} ({m.matchTime})
                          </div>
                          <div className="text-slate-400">{m.venue}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-100">
                            {team?.name || 'ZAMOA CBTC'} vs {m.opponentName}
                          </div>
                          {m.notes && <div className="text-xs text-slate-400">{m.notes}</div>}
                        </td>
                        <td className="py-3 px-4 font-mono text-base font-bold text-amber-400">
                          {m.ourScore} : {m.opponentScore}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-200">
                          {mvp ? `${mvp.fullName} (#${mvp.jerseyNumber})` : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <StatusText status={m.status} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canProcessComp && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMatchId(m.id);
                                setModalType('complete_match');
                              }}
                              className="px-3 py-1.5 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded inline-flex items-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Input Skor & Box Score</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Box Score Stats Table */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">
                Statistik Box Score Individual Atlet (Match Stats)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-2.5 px-4">Atlet</th>
                    <th className="py-2.5 px-4">Pertandingan</th>
                    <th className="py-2.5 px-3 text-right">MIN</th>
                    <th className="py-2.5 px-3 text-right">PTS</th>
                    <th className="py-2.5 px-3 text-right">REB</th>
                    <th className="py-2.5 px-3 text-right">AST</th>
                    <th className="py-2.5 px-3 text-right">STL</th>
                    <th className="py-2.5 px-3 text-right">BLK</th>
                    <th className="py-2.5 px-3 text-right">FG</th>
                    <th className="py-2.5 px-3 text-right">3PT</th>
                    <th className="py-2.5 px-3 text-right">FT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                  {state.matchStats.map((st) => {
                    const athlete = state.athletes.find((a) => a.id === st.athleteId);
                    const match = state.matches.find((m) => m.id === st.matchId);
                    return (
                      <tr key={st.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-sans font-semibold text-slate-100">
                          {athlete?.fullName || '-'}
                        </td>
                        <td className="py-2.5 px-4 font-sans text-slate-400">
                          vs {match?.opponentName || '-'} ({match?.matchDate})
                        </td>
                        <td className="py-2.5 px-3 text-right">{st.minutesPlayed}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-400">
                          {st.points}
                        </td>
                        <td className="py-2.5 px-3 text-right">{st.rebounds}</td>
                        <td className="py-2.5 px-3 text-right">{st.assists}</td>
                        <td className="py-2.5 px-3 text-right">{st.steals}</td>
                        <td className="py-2.5 px-3 text-right">{st.blocks}</td>
                        <td className="py-2.5 px-3 text-right">
                          {st.fgMade}/{st.fgAttempted}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {st.threePtMade}/{st.threePtAttempted}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {st.ftMade}/{st.ftAttempted}
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

      {/* SUBTAB 3: ACHIEVEMENTS */}
      {subTab === 'achievements' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.achievements.map((ach) => {
            const athlete = state.athletes.find((a) => a.id === ach.athleteId);
            const team = state.teams.find((t) => t.id === ach.teamId);
            return (
              <div
                key={ach.id}
                className="p-5 rounded-lg border border-amber-500/30 bg-slate-900/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-amber-400">{ach.category}</span>
                  <span className="text-xs font-mono text-slate-400">{ach.awardedDate}</span>
                </div>
                <h4 className="text-base font-bold text-slate-100">{ach.title}</h4>
                <div className="text-xs font-semibold text-emerald-400">{ach.rankPosition}</div>
                <div className="text-xs text-slate-300 pt-2 border-t border-slate-800">
                  {athlete ? `Atlet: ${athlete.fullName}` : team ? `Tim: ${team.name}` : 'Akademi'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SUBTAB 4: CONFIDENTIAL MEDICAL & INJURY RETURN-TO-PLAY */}
      {subTab === 'medical' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/60 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-xs text-slate-300">
              <strong>Kontrol Kerahasiaan Medis (RBAC):</strong> Detail rekam medis dan diagnosis cedera dilindungi izin{' '}
              <span className="font-mono text-amber-300">medical:view</span> dan hanya terbuka bagi Medical Staff, Super Admin, Pelatih terkait, serta Orang Tua/Atlet yang bersangkutan.
            </p>
          </div>

          {/* Injuries & Return to Play Table */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">
                Log Insiden Cedera & Status Return-to-Play (RTP)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Tanggal & Atlet</th>
                    <th className="py-3 px-4">Bagian Tubuh & Diagnosis</th>
                    <th className="py-3 px-4">Tingkat</th>
                    <th className="py-3 px-4">Rencana Terapi & Pemulihan</th>
                    <th className="py-3 px-4">Status RTP</th>
                    <th className="py-3 px-4 text-right">Update Status RTP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {state.injuries.map((inj) => {
                    const athlete = state.athletes.find((a) => a.id === inj.athleteId);
                    return (
                      <tr key={inj.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-100">
                            {athlete?.fullName || 'Atlet'}
                          </div>
                          <div className="font-mono text-xs text-slate-400">{inj.injuryDate}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-200">{inj.bodyPart}</div>
                          <div className="text-xs text-slate-400">{inj.diagnosis}</div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusText status={inj.severity} />
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-300 max-w-xs">
                          <div>{inj.treatmentPlan}</div>
                          {inj.expectedRecoveryDate && (
                            <div className="text-slate-400 font-mono mt-0.5">
                              Target Pulih: {inj.expectedRecoveryDate}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <StatusText status={inj.returnToPlayStatus} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canUpdateMedical ? (
                            <div className="inline-flex items-center gap-1">
                              {(['OUT', 'REHABILITATION', 'LIMITED_CONTACT', 'CLEARED'] as const).map(
                                (rtp) => (
                                  <button
                                    key={rtp}
                                    type="button"
                                    onClick={() => handleUpdateInjuryRtp(inj.id, rtp)}
                                    className={`px-2 py-1 text-[10px] font-mono rounded border ${
                                      inj.returnToPlayStatus === rtp
                                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                                        : 'bg-slate-900 text-slate-300 border-slate-700'
                                    }`}
                                  >
                                    {rtp}
                                  </button>
                                )
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">Read-only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {state.injuries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                        Tidak ada insiden cedera aktif.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Medical Records */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">Profil Rekam Medis Dasar Atlet</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Atlet</th>
                    <th className="py-3 px-4">Gol. Darah</th>
                    <th className="py-3 px-4">Alergi & Kondisi Kronis</th>
                    <th className="py-3 px-4">Asuransi Kesehatan</th>
                    <th className="py-3 px-4">Status Medis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {state.medicalRecords.map((mr) => {
                    const athlete = state.athletes.find((a) => a.id === mr.athleteId);
                    return (
                      <tr key={mr.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-semibold text-slate-100">
                          {athlete?.fullName || '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-amber-400">
                          {mr.bloodType}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-300">
                          <div>Alergi: {mr.allergies || 'Tidak ada'}</div>
                          <div className="text-slate-400">
                            Kronis: {mr.chronicConditions || 'Tidak ada'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-300">
                          <div>{mr.insuranceProvider || '-'}</div>
                          <div className="font-mono text-slate-400">{mr.insuranceNumber || ''}</div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusText status={mr.returnToPlayStatus} />
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
          modalType === 'tournament'
            ? 'Buat Turnamen & Rencana Logistik Event'
            : modalType === 'register_tournament_athletes'
            ? 'Pendaftaran Atlet ke Kompetisi & Otomatisasi Biaya ke FinanceAccountingView'
            : modalType === 'match'
            ? 'Jadwalkan Pertandingan'
            : modalType === 'complete_match'
            ? 'Input Hasil Pertandingan & Box Score Atlet'
            : modalType === 'achievement'
            ? 'Catat Prestasi Tim / Atlet'
            : modalType === 'medical_record'
            ? 'Simpan Profil Rekam Medis Atlet'
            : 'Catat Laporan Cedera & Return-to-Play'
        }
      >
        {modalType === 'register_tournament_athletes' &&
          (() => {
            const selectedTour =
              state.tournaments.find((t) => t.id === registerTournamentForm.tournamentId) ||
              state.tournaments[0];
            const baseTourFee = Number(selectedTour?.registrationFee || 2500000);
            const selectedCount = registerTournamentForm.selectedAthleteIds.length;
            const computedFeePerAthlete =
              registerTournamentForm.feeMode === 'SPLIT_TOURNAMENT_FEE'
                ? Math.max(150000, Math.round(baseTourFee / Math.max(1, selectedCount)))
                : registerTournamentForm.feeMode === 'FULL_TOURNAMENT_FEE'
                ? baseTourFee
                : Math.max(50000, Number(registerTournamentForm.customFeePerAthlete || 350000));
            const totalBatchAmount = computedFeePerAthlete * selectedCount;

            return (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!selectedTour) return;
                  if (registerTournamentForm.selectedAthleteIds.length === 0) {
                    notify('Pilih minimal 1 atlet untuk didaftarkan ke kompetisi.', 'error');
                    return;
                  }
                  setSubmitting(true);
                  try {
                    const res = await apiRequest<{
                      registeredCount: number;
                      feePerAthlete: number;
                      totalBilledAmount: number;
                      tournamentName: string;
                    }>(`/api/tournaments/${selectedTour.id}/register-athletes`, {
                      method: 'POST',
                      body: JSON.stringify({
                        athleteIds: registerTournamentForm.selectedAthleteIds,
                        feeMode: registerTournamentForm.feeMode,
                        customFeePerAthlete: computedFeePerAthlete,
                        dueDate: registerTournamentForm.dueDate,
                        coachId: registerTournamentForm.coachId,
                        notes: registerTournamentForm.notes,
                      }),
                    });
                    notify(
                      `Berhasil mendaftarkan ${res.registeredCount} atlet ke "${res.tournamentName}". ${res.registeredCount} Invoice (${formatIDR(
                        res.totalBilledAmount
                      )}) otomatis masuk ke FinanceAccountingView & notifikasi saldo dikirim ke orang tua!`
                    );
                    setModalType(null);
                    await onRefresh();
                  } catch (err: unknown) {
                    notify(
                      err instanceof Error
                        ? err.message
                        : 'Gagal memproses pendaftaran atlet dan tagihan turnamen.',
                      'error'
                    );
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="space-y-4 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Pilih Kompetisi / Turnamen *
                    </label>
                    <select
                      value={registerTournamentForm.tournamentId}
                      onChange={(e) =>
                        setRegisterTournamentForm({
                          ...registerTournamentForm,
                          tournamentId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                    >
                      {state.tournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({formatIDR(t.registrationFee)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Pelatih Pendaftar Roster *
                    </label>
                    <select
                      value={registerTournamentForm.coachId}
                      onChange={(e) =>
                        setRegisterTournamentForm({
                          ...registerTournamentForm,
                          coachId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                    >
                      {state.coaches.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName} ({c.licenseLevel})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Skema Perhitungan Biaya Turnamen *
                    </label>
                    <select
                      value={registerTournamentForm.feeMode}
                      onChange={(e) =>
                        setRegisterTournamentForm({
                          ...registerTournamentForm,
                          feeMode: e.target.value as
                            | 'PER_ATHLETE_FIXED'
                            | 'SPLIT_TOURNAMENT_FEE'
                            | 'FULL_TOURNAMENT_FEE',
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
                    >
                      <option value="PER_ATHLETE_FIXED">
                        Tarif Tetap Pendaftaran per Atlet (Custom / Standar)
                      </option>
                      <option value="SPLIT_TOURNAMENT_FEE">
                        Bagi Rata Biaya Registrasi Kolektif Turnamen ({formatIDR(baseTourFee)} / N Atlet)
                      </option>
                      <option value="FULL_TOURNAMENT_FEE">
                        Tagihkan Penuh Biaya Registrasi Turnamen ({formatIDR(baseTourFee)})
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Nominal Biaya per Atlet (IDR) & Jatuh Tempo *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={50000}
                        step={25000}
                        disabled={registerTournamentForm.feeMode !== 'PER_ATHLETE_FIXED'}
                        value={
                          registerTournamentForm.feeMode === 'PER_ATHLETE_FIXED'
                            ? registerTournamentForm.customFeePerAthlete
                            : String(computedFeePerAthlete)
                        }
                        onChange={(e) =>
                          setRegisterTournamentForm({
                            ...registerTournamentForm,
                            customFeePerAthlete: e.target.value,
                          })
                        }
                        className="w-full px-2.5 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-amber-400 font-bold"
                      />
                      <input
                        type="date"
                        required
                        value={registerTournamentForm.dueDate}
                        onChange={(e) =>
                          setRegisterTournamentForm({
                            ...registerTournamentForm,
                            dueDate: e.target.value,
                          })
                        }
                        className="w-full px-2.5 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Athlete Roster Selection with Parent Balance Impact Preview */}
                <div className="border-t border-slate-800 pt-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono uppercase text-amber-400 font-semibold flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>
                        Pilih Atlet Peserta & Simulasi Dampak ke Saldo Tagihan Orang Tua ({selectedCount} Terpilih)
                      </span>
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {state.teams.map((tm) => (
                        <button
                          key={tm.id}
                          type="button"
                          onClick={() => {
                            const teamMemberIds = state.athletes
                              .filter((a) => a.teamId === tm.id)
                              .map((a) => a.id);
                            setRegisterTournamentForm((prev) => ({
                              ...prev,
                              selectedAthleteIds: teamMemberIds,
                            }));
                          }}
                          className="px-2 py-1 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded"
                        >
                          Pilih {tm.name.replace('ZAMOA ', '')}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setRegisterTournamentForm((prev) => ({
                            ...prev,
                            selectedAthleteIds: state.athletes.map((a) => a.id),
                          }))
                        }
                        className="px-2 py-1 text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded"
                      >
                        Semua Atlet
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {state.athletes.map((ath) => {
                      const isChecked = registerTournamentForm.selectedAthleteIds.includes(ath.id);
                      const team = state.teams.find((t) => t.id === ath.teamId);
                      const pInfo = athleteParentBalanceMap.get(ath.id);
                      const prevBalance = pInfo?.currentBalance || 0;
                      const projectedBalance = isChecked
                        ? prevBalance + computedFeePerAthlete
                        : prevBalance;

                      return (
                        <label
                          key={ath.id}
                          className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer transition-colors ${
                            isChecked
                              ? 'border-emerald-500/50 bg-emerald-950/20'
                              : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...registerTournamentForm.selectedAthleteIds, ath.id]
                                  : registerTournamentForm.selectedAthleteIds.filter(
                                      (id) => id !== ath.id
                                    );
                                setRegisterTournamentForm({
                                  ...registerTournamentForm,
                                  selectedAthleteIds: next,
                                });
                              }}
                              className="mt-1 rounded border-slate-700 bg-slate-900 text-emerald-500"
                            />
                            <div>
                              <div className="font-semibold text-slate-100">
                                {ath.fullName}{' '}
                                <span className="font-mono text-[11px] text-amber-400">
                                  ({ath.memberCode} • #{ath.jerseyNumber} {ath.position})
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Tim: {team?.name || '-'} • Orang Tua/Wali:{' '}
                                <strong className="text-slate-200">{pInfo?.parentName}</strong> (
                                {pInfo?.parentEmail})
                              </div>
                            </div>
                          </div>

                          <div className="text-right font-mono text-[11px] shrink-0">
                            <div className="text-slate-400">
                              Saldo Wali Saat Ini: {formatIDR(prevBalance)}
                            </div>
                            {isChecked && (
                              <div className="text-emerald-400 font-bold">
                                + {formatIDR(computedFeePerAthlete)} ➔ Saldo Baru:{' '}
                                {formatIDR(projectedBalance)}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Accounting & Notification Automation Summary */}
                <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono uppercase text-amber-300 font-semibold flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Ringkasan Otomatisasi ke FinanceAccountingView</span>
                    </span>
                    <span className="font-mono text-sm font-bold text-emerald-400">
                      Total Tagihan: {formatIDR(totalBatchAmount)} ({selectedCount} Invoice)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-amber-400 block">DEBIT (1102 - Piutang / Saldo Wali):</span>
                      <span>+{formatIDR(totalBatchAmount)}</span>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-emerald-400 block">
                        KREDIT (4103 - Pendapatan Turnamen):
                      </span>
                      <span>+{formatIDR(totalBatchAmount)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                    <BellRing className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Notifikasi rincian biaya pendaftaran turnamen & pembaruan total saldo tagihan otomatis dikirim ke WA & Email masing-masing orang tua.
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setModalType(null)}
                    className="px-4 py-2 text-xs text-slate-300 border border-slate-700 rounded"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || selectedCount === 0}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded flex items-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>
                      {submitting
                        ? 'Memproses Tagihan & Notifikasi...'
                        : `Daftarkan ${selectedCount} Atlet & Terbitkan Invoice ke Saldo Orang Tua`}
                    </span>
                  </button>
                </div>
              </form>
            );
          })()}

        {modalType === 'tournament' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/tournaments', {
                  method: 'POST',
                  body: JSON.stringify(tournamentForm),
                });
                notify('Turnamen baru berhasil ditambahkan.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal membuat turnamen', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Nama Turnamen *</label>
                <input
                  type="text"
                  required
                  value={tournamentForm.name}
                  onChange={(e) => setTournamentForm({ ...tournamentForm, name: e.target.value })}
                  placeholder="Kejurnas Antar Klub U-16 Jakarta"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Venue *</label>
                <input
                  type="text"
                  required
                  value={tournamentForm.venue}
                  onChange={(e) => setTournamentForm({ ...tournamentForm, venue: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Anggaran Event (Rp) *</label>
                <input
                  type="number"
                  required
                  value={tournamentForm.budgetAmount}
                  onChange={(e) =>
                    setTournamentForm({ ...tournamentForm, budgetAmount: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tanggal Mulai *</label>
                <input
                  type="date"
                  required
                  value={tournamentForm.startDate}
                  onChange={(e) =>
                    setTournamentForm({ ...tournamentForm, startDate: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tanggal Selesai *</label>
                <input
                  type="date"
                  required
                  value={tournamentForm.endDate}
                  onChange={(e) => setTournamentForm({ ...tournamentForm, endDate: e.target.value })}
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
                Simpan Turnamen
              </button>
            </div>
          </form>
        )}

        {modalType === 'match' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/matches', {
                  method: 'POST',
                  body: JSON.stringify(matchForm),
                });
                notify('Jadwal pertandingan berhasil dibuat.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal membuat pertandingan', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Turnamen *</label>
                <select
                  value={matchForm.tournamentId}
                  onChange={(e) => setMatchForm({ ...matchForm, tournamentId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tim Akademi *</label>
                <select
                  value={matchForm.teamId}
                  onChange={(e) => setMatchForm({ ...matchForm, teamId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tim Lawan *</label>
                <input
                  type="text"
                  required
                  value={matchForm.opponentName}
                  onChange={(e) => setMatchForm({ ...matchForm, opponentName: e.target.value })}
                  placeholder="Garuda Muda Basketball"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tanggal Pertandingan *</label>
                <input
                  type="date"
                  required
                  value={matchForm.matchDate}
                  onChange={(e) => setMatchForm({ ...matchForm, matchDate: e.target.value })}
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
                Simpan Pertandingan
              </button>
            </div>
          </form>
        )}

        {modalType === 'complete_match' && selectedMatchId && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest(`/api/matches/${selectedMatchId}/complete`, {
                  method: 'POST',
                  body: JSON.stringify({
                    ourScore: Number(completeMatchForm.ourScore),
                    opponentScore: Number(completeMatchForm.opponentScore),
                    mvpAthleteId: completeMatchForm.mvpAthleteId || undefined,
                    notes: completeMatchForm.notes,
                    playerStats: completeMatchForm.playerStats,
                  }),
                });
                notify('Hasil pertandingan & statistik Box Score berhasil disimpan.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menyimpan hasil tanding', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Skor Tim ZAMOA CBTC *</label>
                <input
                  type="number"
                  required
                  value={completeMatchForm.ourScore}
                  onChange={(e) =>
                    setCompleteMatchForm({ ...completeMatchForm, ourScore: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Skor Tim Lawan *</label>
                <input
                  type="number"
                  required
                  value={completeMatchForm.opponentScore}
                  onChange={(e) =>
                    setCompleteMatchForm({ ...completeMatchForm, opponentScore: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">MVP Pertandingan</label>
                <select
                  value={completeMatchForm.mvpAthleteId}
                  onChange={(e) =>
                    setCompleteMatchForm({ ...completeMatchForm, mvpAthleteId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
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
                Simpan Skor & Box Score
              </button>
            </div>
          </form>
        )}

        {modalType === 'achievement' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/achievements', {
                  method: 'POST',
                  body: JSON.stringify(achievementForm),
                });
                notify('Prestasi berhasil dicatat.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menyimpan prestasi', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Judul Prestasi / Penghargaan *</label>
                <input
                  type="text"
                  required
                  value={achievementForm.title}
                  onChange={(e) =>
                    setAchievementForm({ ...achievementForm, title: e.target.value })
                  }
                  placeholder="Juara 1 Kejuaraan Provinsi DKI Jakarta U-16"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kategori *</label>
                <select
                  value={achievementForm.category}
                  onChange={(e) =>
                    setAchievementForm({ ...achievementForm, category: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="TEAM_CHAMPION">TEAM_CHAMPION</option>
                  <option value="MVP">MVP</option>
                  <option value="TOP_SCORER">TOP_SCORER</option>
                  <option value="ALL_STAR">ALL_STAR</option>
                  <option value="MOST_IMPROVED">MOST_IMPROVED</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Peringkat / Medali *</label>
                <input
                  type="text"
                  required
                  value={achievementForm.rankPosition}
                  onChange={(e) =>
                    setAchievementForm({ ...achievementForm, rankPosition: e.target.value })
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
                Simpan Prestasi
              </button>
            </div>
          </form>
        )}

        {modalType === 'medical_record' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/medical/records', {
                  method: 'POST',
                  body: JSON.stringify(medRecordForm),
                });
                notify('Profil medis atlet berhasil diperbarui.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menyimpan rekam medis', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Atlet *</label>
                <select
                  value={medRecordForm.athleteId}
                  onChange={(e) => setMedRecordForm({ ...medRecordForm, athleteId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Golongan Darah *</label>
                <input
                  type="text"
                  required
                  value={medRecordForm.bloodType}
                  onChange={(e) => setMedRecordForm({ ...medRecordForm, bloodType: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Alergi</label>
                <input
                  type="text"
                  value={medRecordForm.allergies}
                  onChange={(e) => setMedRecordForm({ ...medRecordForm, allergies: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Asuransi</label>
                <input
                  type="text"
                  value={medRecordForm.insuranceProvider}
                  onChange={(e) =>
                    setMedRecordForm({ ...medRecordForm, insuranceProvider: e.target.value })
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
                Simpan Rekam Medis
              </button>
            </div>
          </form>
        )}

        {modalType === 'injury' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/medical/injuries', {
                  method: 'POST',
                  body: JSON.stringify(injuryForm),
                });
                notify('Laporan cedera dan status RTP berhasil dicatat.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menyimpan laporan cedera', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Atlet *</label>
                <select
                  value={injuryForm.athleteId}
                  onChange={(e) => setInjuryForm({ ...injuryForm, athleteId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bagian Tubuh *</label>
                <input
                  type="text"
                  required
                  value={injuryForm.bodyPart}
                  onChange={(e) => setInjuryForm({ ...injuryForm, bodyPart: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Diagnosis Klinis *</label>
                <input
                  type="text"
                  required
                  value={injuryForm.diagnosis}
                  onChange={(e) => setInjuryForm({ ...injuryForm, diagnosis: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Status Return-to-Play *</label>
                <select
                  value={injuryForm.returnToPlayStatus}
                  onChange={(e) =>
                    setInjuryForm({ ...injuryForm, returnToPlayStatus: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="OUT">OUT (Dilarang Latihan)</option>
                  <option value="REHABILITATION">REHABILITATION</option>
                  <option value="LIMITED_CONTACT">LIMITED_CONTACT</option>
                  <option value="CLEARED">CLEARED (Siap Tanding)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Rencana Terapi & Pemulihan *</label>
                <input
                  type="text"
                  required
                  value={injuryForm.treatmentPlan}
                  onChange={(e) => setInjuryForm({ ...injuryForm, treatmentPlan: e.target.value })}
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
                Simpan Laporan Cedera
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
