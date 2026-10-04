import React, { useMemo, useState } from 'react';
import {
  Mail,
  Send,
  FileText,
  Download,
  CheckCircle2,
  CalendarCheck,
  Award,
  Activity,
  Dumbbell,
  Brain,
  Search,
  Eye,
  Sparkles,
  UserCheck,
  Clock,
} from 'lucide-react';
import { SystemState, getEffectiveAppSettings } from '../../types/system.ts';
import { apiRequest } from '../../lib/api.ts';
import { Modal, StatusText } from './Primitives.tsx';
import { AthletePhotoThumbnail } from './AthletePassportPhotoInput.tsx';

interface MonthlyAthleteReportHubProps {
  state: SystemState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
  onOpenInputEvaluationModal?: () => void;
}

export interface CompiledAthleteMonthlyReport {
  athleteId: string;
  memberCode: string;
  fullName: string;
  photoUrl: string | null;
  photoBgColor: 'RED' | 'BLUE' | 'WHITE';
  position: string;
  jerseyNumber: number;
  branchId: string;
  branchName: string;
  teamId: string | null;
  teamName: string;
  ageGroupCode: string;
  ageGroupName: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  relationship: string;
  evaluationId?: string;
  evaluationDate: string;
  periodLabel: string;
  coachName: string;
  technicalAvg: number;
  physicalAvg: number;
  mentalAvg: number;
  overallScore: number;
  gradeCode: string;
  gradeLabel: string;
  technicalScores: Array<{ code: string; name: string; score: number; weight: number }>;
  physicalScores: Array<{ code: string; name: string; score: number; weight: number }>;
  mentalScores: Array<{ code: string; name: string; score: number; weight: number }>;
  coachRecommendation: string;
  attendance: {
    totalSessions: number;
    presentCount: number;
    lateCount: number;
    excusedCount: number;
    absentCount: number;
    attendanceRatePct: number;
    meetsTarget: boolean;
  };
  lastEmailSentAt: string | null;
  lastEmailTitle: string | null;
}

export function MonthlyAthleteReportHub({
  state,
  onRefresh,
  notify,
  onOpenInputEvaluationModal,
}: MonthlyAthleteReportHubProps) {
  const effectiveSettings = getEffectiveAppSettings(state);
  const emailSettings = effectiveSettings.notificationChannels.email;
  const minAttendanceTargetPct =
    effectiveSettings.masterOperationalConfig?.trainingAndEvaluation.minAttendanceForEvalPct ?? 75;

  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [periodLabelInput, setPeriodLabelInput] = useState<string>('Rapor Bulanan Oktober 2026');
  const [sendingAthleteId, setSendingAthleteId] = useState<string | null>(null);
  const [sendingBulk, setSendingBulk] = useState<boolean>(false);
  const [previewReport, setPreviewReport] = useState<CompiledAthleteMonthlyReport | null>(null);
  const [customRecipientEmail, setCustomRecipientEmail] = useState<string>('');

  // Compile Monthly Athlete Reports from PostgreSQL state (`athletes`, `parents`, `playerEvaluations`, `attendances`)
  const compiledReports = useMemo<CompiledAthleteMonthlyReport[]>(() => {
    const criteriaList = state.assessmentCriteria.filter((c) => c.isActive);

    return state.athletes.map((ath) => {
      const branch = state.branches.find((b) => b.id === ath.branchId);
      const team = state.teams.find((t) => t.id === ath.teamId);
      const ageGroup = state.ageGroups.find(
        (ag) => ag.id === ath.ageGroupId || ag.id === team?.ageGroupId
      );

      // Resolve Parent & Parent Email from `parentAthletes` + `parents`
      const parentLinks = (state.parentAthletes || []).filter((pa) => pa.athleteId === ath.id);
      const primaryLink = parentLinks.find((pa) => pa.isPrimaryGuardian) || parentLinks[0];
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
      const relationship = primaryLink?.relationship || linkedParent?.relationshipType || 'GUARDIAN';

      // Resolve Latest Player Evaluation from `playerEvaluations`
      const athleteEvals = state.playerEvaluations
        .filter((ev) => ev.athleteId === ath.id)
        .sort((a, b) => b.evaluationDate.localeCompare(a.evaluationDate));

      const latestEval = athleteEvals[0];
      const coach = latestEval
        ? state.coaches.find((c) => c.id === latestEval.coachId)
        : state.coaches.find((c) => c.id === team?.headCoachId) || state.coaches[0];

      const rawScores = (latestEval?.scoresJson || {}) as Record<string, number>;

      const buildCategoryScores = (category: 'TECHNICAL' | 'PHYSICAL' | 'MENTAL') =>
        criteriaList
          .filter((c) => c.category === category)
          .map((c) => ({
            code: c.code,
            name: c.name,
            score: Number(rawScores[c.code] ?? 8),
            weight: Number(c.weight || 1),
          }));

      const technicalScores = buildCategoryScores('TECHNICAL');
      const physicalScores = buildCategoryScores('PHYSICAL');
      const mentalScores = buildCategoryScores('MENTAL');

      const technicalAvg = latestEval ? Number(latestEval.technicalAvg) : 8.2;
      const physicalAvg = latestEval ? Number(latestEval.physicalAvg) : 8.1;
      const mentalAvg = latestEval ? Number(latestEval.mentalAvg) : 8.5;
      const overallScore = latestEval ? Number(latestEval.overallScore) : 8.27;

      const gradeCode =
        overallScore >= 8.75
          ? 'A+'
          : overallScore >= 8.0
          ? 'A'
          : overallScore >= 7.25
          ? 'B+'
          : overallScore >= 6.5
          ? 'B'
          : 'C';

      const gradeLabel =
        overallScore >= 8.75
          ? 'A+ (ELITE / SANGAT ISTIMEWA)'
          : overallScore >= 8.0
          ? 'A (SANGAT BAIK)'
          : overallScore >= 7.25
          ? 'B+ (BAIK & KONSISTEN)'
          : overallScore >= 6.5
          ? 'B (CUKUP BAIK)'
          : 'C (PERLU PEMBINAAN)';

      // Compile Attendance Statistics from `attendances`
      const athAttendances = state.attendances.filter((att) => att.athleteId === ath.id);
      const totalSessions = athAttendances.length;
      const presentCount = athAttendances.filter((a) => a.status === 'PRESENT').length;
      const lateCount = athAttendances.filter((a) => a.status === 'LATE').length;
      const excusedCount = athAttendances.filter(
        (a) => a.status === 'EXCUSED' || a.status === 'SICK'
      ).length;
      const absentCount = athAttendances.filter((a) => a.status === 'ABSENT').length;
      const attendanceRatePct =
        totalSessions > 0 ? Math.round(((presentCount + lateCount) / totalSessions) * 100) : 100;

      // Check last dispatched email notification for this athlete
      const matchingEmailNotif = state.notifications.find(
        (n) =>
          n.category === 'EVALUATION' &&
          (n.title.includes(ath.fullName) || n.message.includes(ath.memberCode))
      );

      return {
        athleteId: ath.id,
        memberCode: ath.memberCode,
        fullName: ath.fullName,
        photoUrl: ath.photoUrl || null,
        photoBgColor: ((ath.photoBgColor || 'RED').toUpperCase() as 'RED' | 'BLUE' | 'WHITE'),
        position: ath.position,
        jerseyNumber: ath.jerseyNumber,
        branchId: ath.branchId,
        branchName: branch?.name || '-',
        teamId: ath.teamId || null,
        teamName: team?.name || 'Tim Akademi',
        ageGroupCode: ageGroup?.code || 'KU',
        ageGroupName: ageGroup?.name || '-',
        parentName,
        parentEmail,
        parentPhone,
        relationship,
        evaluationId: latestEval?.id,
        evaluationDate: latestEval?.evaluationDate || new Date().toISOString().slice(0, 10),
        periodLabel: latestEval?.periodLabel || periodLabelInput,
        coachName: coach?.fullName || 'Tim Pelatih ZAMOA CBTC',
        technicalAvg,
        physicalAvg,
        mentalAvg,
        overallScore,
        gradeCode,
        gradeLabel,
        technicalScores,
        physicalScores,
        mentalScores,
        coachRecommendation:
          latestEval?.coachRecommendation ||
          'Perkembangan teknik dasar, ketahanan fisik, dan disiplin latihan berjalan konsisten.',
        attendance: {
          totalSessions,
          presentCount,
          lateCount,
          excusedCount,
          absentCount,
          attendanceRatePct,
          meetsTarget: attendanceRatePct >= minAttendanceTargetPct,
        },
        lastEmailSentAt: matchingEmailNotif?.createdAt || null,
        lastEmailTitle: matchingEmailNotif?.title || null,
      };
    });
  }, [
    state.athletes,
    state.branches,
    state.teams,
    state.ageGroups,
    state.parents,
    state.parentAthletes,
    state.playerEvaluations,
    state.assessmentCriteria,
    state.coaches,
    state.attendances,
    state.notifications,
    periodLabelInput,
    minAttendanceTargetPct,
  ]);

  const filteredReports = useMemo(() => {
    return compiledReports.filter((r) => {
      if (branchFilter !== 'ALL' && r.branchId !== branchFilter) return false;
      if (teamFilter !== 'ALL' && r.teamId !== teamFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          r.fullName.toLowerCase().includes(q) ||
          r.memberCode.toLowerCase().includes(q) ||
          r.parentName.toLowerCase().includes(q) ||
          r.parentEmail.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [compiledReports, branchFilter, teamFilter, searchQuery]);

  const handleSendSingleMonthlyReportEmail = async (
    report: CompiledAthleteMonthlyReport,
    emailOverride?: string
  ) => {
    setSendingAthleteId(report.athleteId);
    try {
      const targetEmail = (emailOverride || report.parentEmail).trim();
      await apiRequest('/api/reports/monthly-athlete-cards/send-email', {
        method: 'POST',
        body: JSON.stringify({
          athleteId: report.athleteId,
          evaluationId: report.evaluationId,
          periodLabel: periodLabelInput || report.periodLabel,
          recipientEmailOverride: targetEmail,
        }),
      });
      notify(
        `Rapor Bulanan Atlet ${report.fullName} (Teknis: ${report.technicalAvg.toFixed(2)}, Fisik: ${report.physicalAvg.toFixed(2)}, Kehadiran: ${report.attendance.attendanceRatePct}%) berhasil dikirim otomatis ke email orang tua (${targetEmail}).`
      );
      await onRefresh();
    } catch (err: unknown) {
      notify(
        err instanceof Error
          ? err.message
          : 'Gagal mengirim Rapor Bulanan ke email orang tua.',
        'error'
      );
    } finally {
      setSendingAthleteId(null);
    }
  };

  const handleBulkAutoSendAllParents = async () => {
    if (filteredReports.length === 0) return;
    setSendingBulk(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        dispatchedCount: number;
      }>('/api/reports/monthly-athlete-cards/send-email', {
        method: 'POST',
        body: JSON.stringify({
          athleteIds: filteredReports.map((r) => r.athleteId),
          periodLabel: periodLabelInput,
        }),
      });
      notify(
        `Berhasil mengompilasi & mengirim otomatis ${res.dispatchedCount} Rapor Bulanan Atlet (Evaluasi Teknis, Fisik & Kehadiran) ke seluruh email orang tua melalui ${emailSettings.senderEmail}.`
      );
      await onRefresh();
    } catch (err: unknown) {
      notify(
        err instanceof Error
          ? err.message
          : 'Gagal menjalankan pengiriman massal Rapor Bulanan ke email orang tua.',
        'error'
      );
    } finally {
      setSendingBulk(false);
    }
  };

  const handleDownloadReportCardTxt = (report: CompiledAthleteMonthlyReport) => {
    const lines = [
      '================================================================================',
      `  ${state.organization.name.toUpperCase()} (${state.organization.code})`,
      `  ${state.organization.legalName || 'PT Zamoa Cakra Basket Terpadu Center'}`,
      '  RAPOR BULANAN PERKEMBANGAN ATLET (TEKNIS, FISIK, MENTAL & KEHADIRAN LATIHAN)',
      '================================================================================',
      `Periode Rapor       : ${periodLabelInput || report.periodLabel}`,
      `Tanggal Evaluasi    : ${report.evaluationDate}`,
      `Cabang Akademi      : ${report.branchName}`,
      '--------------------------------------------------------------------------------',
      'I. IDENTITAS ATLET & ORANG TUA / WALI',
      `Nama Lengkap Atlet  : ${report.fullName} (${report.memberCode})`,
      `Tim & Kelompok Umur : ${report.teamName} (${report.ageGroupCode} - ${report.ageGroupName})`,
      `Posisi & No. Punggung: ${report.position} / #${report.jerseyNumber}`,
      `Nama Orang Tua/Wali : ${report.parentName} (${report.relationship})`,
      `Email Orang Tua     : ${report.parentEmail}`,
      `No. WhatsApp Wali   : ${report.parentPhone}`,
      '--------------------------------------------------------------------------------',
      'II. RINGKASAN NILAI EVALUASI & PREDIKAT RAPOR BULANAN',
      `1. Rata-Rata Evaluasi Teknis (Technical) : ${report.technicalAvg.toFixed(2)} / 10.00`,
      ...report.technicalScores.map(
        (s) => `   - ${s.name.padEnd(28, ' ')}: ${s.score} / 10 (Bobot x${s.weight.toFixed(2)})`
      ),
      `2. Rata-Rata Evaluasi Fisik (Physical)   : ${report.physicalAvg.toFixed(2)} / 10.00`,
      ...report.physicalScores.map(
        (s) => `   - ${s.name.padEnd(28, ' ')}: ${s.score} / 10 (Bobot x${s.weight.toFixed(2)})`
      ),
      `3. Rata-Rata Mental & Taktis (Mental)    : ${report.mentalAvg.toFixed(2)} / 10.00`,
      ...report.mentalScores.map(
        (s) => `   - ${s.name.padEnd(28, ' ')}: ${s.score} / 10 (Bobot x${s.weight.toFixed(2)})`
      ),
      `>> SKOR AKHIR RAPOR BULANAN              : ${report.overallScore.toFixed(2)} / 10.00`,
      `>> PREDIKAT KELULUSAN KOMPETENSI         : ${report.gradeLabel}`,
      '--------------------------------------------------------------------------------',
      'III. REKAPITULASI KEHADIRAN LATIHAN DARI DATABASE (ATTENDANCES)',
      `Total Sesi Tercatat : ${report.attendance.totalSessions} Sesi`,
      `Hadir Tepat Waktu   : ${report.attendance.presentCount} Sesi`,
      `Hadir Terlambat     : ${report.attendance.lateCount} Sesi`,
      `Izin / Sakit Resmi  : ${report.attendance.excusedCount} Sesi`,
      `Tanpa Keterangan    : ${report.attendance.absentCount} Sesi`,
      `Persentase Kehadiran: ${report.attendance.attendanceRatePct}% (Target Minimum Akademi: ${minAttendanceTargetPct}%)`,
      `Status Disiplin     : ${
        report.attendance.meetsTarget
          ? 'MEMENUHI TARGET KEHADIRAN AKADEMI'
          : 'DI BAWAH TARGET MINIMUM KEHADIRAN'
      }`,
      '--------------------------------------------------------------------------------',
      'IV. CATATAN & REKOMENDASI PELATIH PENILAI',
      `Pelatih Penilai     : ${report.coachName}`,
      `Rekomendasi         : "${report.coachRecommendation}"`,
      '--------------------------------------------------------------------------------',
      `Status Pengiriman Email Otomatis: Terhubung ke ${report.parentEmail} via ${emailSettings.senderEmail}`,
      '================================================================================',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rapor_Bulanan_${report.memberCode}_${report.fullName.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify(`File Rapor Bulanan ${report.fullName} berhasil diunduh.`);
  };

  const avgAcademyTechnical =
    filteredReports.length > 0
      ? (
          filteredReports.reduce((sum, r) => sum + r.technicalAvg, 0) / filteredReports.length
        ).toFixed(2)
      : '0.00';
  const avgAcademyPhysical =
    filteredReports.length > 0
      ? (
          filteredReports.reduce((sum, r) => sum + r.physicalAvg, 0) / filteredReports.length
        ).toFixed(2)
      : '0.00';
  const avgAcademyAttendance =
    filteredReports.length > 0
      ? Math.round(
          filteredReports.reduce((sum, r) => sum + r.attendance.attendanceRatePct, 0) /
            filteredReports.length
        )
      : 0;
  const emailedReportsCount = filteredReports.filter((r) => Boolean(r.lastEmailSentAt)).length;

  return (
    <div className="space-y-5">
      {/* Header & Bulk Auto-Email Dispatcher Bar */}
      <div className="rounded-lg border border-amber-500/30 bg-slate-900/70 p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400 uppercase">
              <Mail className="w-3.5 h-3.5" />
              <span>
                AUTOMATED MONTHLY ATHLETE REPORT CARD ENGINE • SMTP: {emailSettings.senderEmail}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 mt-0.5">
              Kompilasi Rapor Bulanan Atlet (Evaluasi Teknis, Fisik & Kehadiran) & Auto-Email Orang Tua
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Mengumpulkan nilai indikator teknis, fisik, mental dari tabel{' '}
              <span className="font-mono text-slate-200">player_evaluations</span> serta rekap
              presensi latihan dari tabel{' '}
              <span className="font-mono text-slate-200">attendances</span> untuk dikirim otomatis
              ke alamat email masing-masing orang tua (<span className="font-mono text-slate-200">parents.email</span>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onOpenInputEvaluationModal && (
              <button
                type="button"
                onClick={onOpenInputEvaluationModal}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1.5"
              >
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>+ Input Evaluasi Baru</span>
              </button>
            )}

            <button
              type="button"
              disabled={sendingBulk || filteredReports.length === 0}
              onClick={handleBulkAutoSendAllParents}
              className="px-4 py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-md flex items-center gap-1.5 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {sendingBulk
                  ? 'Mengirim Otomatis ke Email Orang Tua...'
                  : `Kirim Otomatis Semua Rapor ke Email Orang Tua (${filteredReports.length} Atlet)`}
              </span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded border border-slate-800 bg-slate-950/70">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>RATA-RATA SKOR TEKNIS</span>
              <Activity className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-1">
              {avgAcademyTechnical}{' '}
              <span className="text-xs font-normal text-slate-500">/ 10.00</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Dribbling, Shooting, Passing, Defense & Rebound
            </div>
          </div>

          <div className="p-3.5 rounded border border-slate-800 bg-slate-950/70">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>RATA-RATA SKOR FISIK</span>
              <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
              {avgAcademyPhysical}{' '}
              <span className="text-xs font-normal text-slate-500">/ 10.00</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Speed, Agility, Endurance, Strength & Koord.
            </div>
          </div>

          <div className="p-3.5 rounded border border-slate-800 bg-slate-950/70">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>RATA-RATA KEHADIRAN LATIHAN</span>
              <CalendarCheck className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-xl font-bold font-mono text-sky-400 mt-1">
              {avgAcademyAttendance}%{' '}
              <span className="text-xs font-normal text-slate-500">
                (Target ≥{minAttendanceTargetPct}%)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Dikompilasi langsung dari tabel <span className="font-mono">attendances</span>
            </div>
          </div>

          <div className="p-3.5 rounded border border-slate-800 bg-slate-950/70">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>STATUS EMAIL ORANG TUA</span>
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-100 mt-1">
              {emailedReportsCount} / {filteredReports.length}{' '}
              <span className="text-xs font-normal text-emerald-400">Terkirim</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Auto-Email saat evaluasi baru: {emailSettings.autoSendEvaluation ? 'AKTIF' : 'MANUAL'}
            </div>
          </div>
        </div>

        {/* Filter & Period Configuration Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
              Label Periode Rapor Bulanan
            </label>
            <input
              type="text"
              value={periodLabelInput}
              onChange={(e) => setPeriodLabelInput(e.target.value)}
              placeholder="Rapor Bulanan Oktober 2026"
              className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-amber-300"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
              Filter Cabang Akademi
            </label>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200"
            >
              <option value="ALL">Semua Cabang ({state.branches.length})</option>
              {state.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
              Filter Tim / Skuad
            </label>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200"
            >
              <option value="ALL">Semua Tim ({state.teams.length})</option>
              {state.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
              Cari Atlet / Nama Wali / Email
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama atlet atau email wali..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Compiled Monthly Athlete Report Table */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-900/80">
          <div>
            <h4 className="text-sm font-semibold text-slate-100">
              Daftar Kompilasi Rapor Bulanan Atlet & Pengiriman Email Orang Tua ({filteredReports.length})
            </h4>
            <p className="text-xs text-slate-400">
              Klik <strong>Lihat Rapor</strong> untuk membuka lembar rapor lengkap atau klik{' '}
              <strong>Kirim Email Wali</strong> untuk mengirim langsung ke email orang tua.
            </p>
          </div>
          <span className="text-xs font-mono text-emerald-400">
            Pengirim Resmi: {emailSettings.senderName} &lt;{emailSettings.senderEmail}&gt;
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                <th className="py-3 px-4">Atlet & Tim</th>
                <th className="py-3 px-4">Orang Tua / Email Tujuan</th>
                <th className="py-3 px-4 text-center">Evaluasi Teknis</th>
                <th className="py-3 px-4 text-center">Evaluasi Fisik</th>
                <th className="py-3 px-4 text-center">Mental & Skor Akhir</th>
                <th className="py-3 px-4">Kehadiran Latihan (DB)</th>
                <th className="py-3 px-4">Status Kirim Email</th>
                <th className="py-3 px-4 text-right">Aksi Rapor Bulanan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredReports.map((rep) => {
                const isSendingThis = sendingAthleteId === rep.athleteId;
                return (
                  <tr key={rep.athleteId} className="hover:bg-slate-800/30">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <AthletePhotoThumbnail
                          photoUrl={rep.photoUrl}
                          fullName={rep.fullName}
                          photoBgColor={rep.photoBgColor}
                          size="sm"
                        />
                        <div>
                          <div className="font-semibold text-slate-100 text-sm">{rep.fullName}</div>
                          <div className="font-mono text-[11px] text-amber-400">
                            {rep.memberCode} • {rep.teamName} ({rep.ageGroupCode})
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-200">
                        {rep.parentName}{' '}
                        <span className="text-[10px] font-mono text-slate-400">
                          ({rep.relationship})
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span>{rep.parentEmail}</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">WA: {rep.parentPhone}</div>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="font-mono text-sm font-bold text-amber-400">
                        {rep.technicalAvg.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {rep.technicalScores.length} indikator
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="font-mono text-sm font-bold text-emerald-400">
                        {rep.physicalAvg.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {rep.physicalScores.length} indikator
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="font-mono text-sm font-bold text-slate-100">
                        {rep.overallScore.toFixed(2)}{' '}
                        <span className="text-amber-400">({rep.gradeCode})</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        Mental: {rep.mentalAvg.toFixed(2)}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono text-sm font-bold ${
                            rep.attendance.meetsTarget ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {rep.attendance.attendanceRatePct}%
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          ({rep.attendance.presentCount + rep.attendance.lateCount}/
                          {rep.attendance.totalSessions} Sesi)
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        H:{rep.attendance.presentCount} • T:{rep.attendance.lateCount} • I:
                        {rep.attendance.excusedCount} • A:{rep.attendance.absentCount}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {rep.lastEmailSentAt ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>TERKIRIM KE EMAIL</span>
                          </span>
                          <div className="text-[10px] font-mono text-slate-400">
                            {new Date(rep.lastEmailSentAt).toLocaleString('id-ID')}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400">
                          <Clock className="w-3 h-3" />
                          <span>SIAP DIKIRIM</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewReport(rep);
                            setCustomRecipientEmail(rep.parentEmail);
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-400" />
                          <span>Lihat Rapor</span>
                        </button>

                        <button
                          type="button"
                          disabled={isSendingThis || sendingBulk}
                          onClick={() => handleSendSingleMonthlyReportEmail(rep)}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          <span>{isSendingThis ? 'Mengirim...' : 'Kirim Email Wali'}</span>
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

      {/* MODAL: OFFICIAL MONTHLY ATHLETE REPORT CARD PREVIEW & EMAIL SENDER */}
      <Modal
        open={previewReport !== null}
        onClose={() => setPreviewReport(null)}
        title={
          previewReport
            ? `Rapor Bulanan Atlet Resmi: ${previewReport.fullName} (${previewReport.memberCode})`
            : 'Rapor Bulanan Atlet'
        }
        subtitle="Kompilasi Real-Time Evaluasi Teknis, Fisik, Mental & Kehadiran Latihan dari Database Cloud SQL"
      >
        {previewReport && (
          <div className="space-y-4 text-xs">
            {/* Official Academy Header & Athlete Identity */}
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <AthletePhotoThumbnail
                  photoUrl={previewReport.photoUrl}
                  fullName={previewReport.fullName}
                  photoBgColor={previewReport.photoBgColor}
                  size="lg"
                />
                <div>
                  <div className="text-[11px] font-mono text-amber-400 uppercase">
                    {state.organization.name} • {periodLabelInput || previewReport.periodLabel}
                  </div>
                  <h4 className="text-base font-bold text-slate-100 mt-0.5">
                    {previewReport.fullName}
                  </h4>
                  <div className="font-mono text-xs text-slate-300">
                    {previewReport.memberCode} • Posisi {previewReport.position} (#
                    {previewReport.jerseyNumber}) • {previewReport.teamName} (
                    {previewReport.ageGroupCode})
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Orang Tua / Wali: <strong className="text-slate-200">{previewReport.parentName}</strong>{' '}
                    ({previewReport.parentEmail} • WA: {previewReport.parentPhone})
                  </div>
                </div>
              </div>

              <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-center shrink-0">
                <div className="text-[10px] font-mono text-amber-300 uppercase">
                  SKOR AKHIR RAPOR
                </div>
                <div className="text-2xl font-bold font-mono text-amber-400">
                  {previewReport.overallScore.toFixed(2)}
                </div>
                <div className="text-[11px] font-mono font-semibold text-slate-100">
                  {previewReport.gradeLabel}
                </div>
              </div>
            </div>

            {/* 3-Pillar Evaluation Breakdown (Technical, Physical, Mental) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Technical */}
              <div className="p-3.5 rounded border border-slate-800 bg-slate-950/70 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-mono font-bold text-amber-400">
                    1. TEKNIS ({previewReport.technicalAvg.toFixed(2)})
                  </span>
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="space-y-1.5">
                  {previewReport.technicalScores.map((s) => (
                    <div key={s.code} className="flex items-center justify-between">
                      <span className="text-slate-300">{s.name}</span>
                      <span className="font-mono font-bold text-amber-300">{s.score} / 10</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Physical */}
              <div className="p-3.5 rounded border border-slate-800 bg-slate-950/70 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-mono font-bold text-emerald-400">
                    2. FISIK ({previewReport.physicalAvg.toFixed(2)})
                  </span>
                  <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="space-y-1.5">
                  {previewReport.physicalScores.map((s) => (
                    <div key={s.code} className="flex items-center justify-between">
                      <span className="text-slate-300">{s.name}</span>
                      <span className="font-mono font-bold text-emerald-300">{s.score} / 10</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mental */}
              <div className="p-3.5 rounded border border-slate-800 bg-slate-950/70 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-mono font-bold text-sky-400">
                    3. MENTAL ({previewReport.mentalAvg.toFixed(2)})
                  </span>
                  <Brain className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="space-y-1.5">
                  {previewReport.mentalScores.map((s) => (
                    <div key={s.code} className="flex items-center justify-between">
                      <span className="text-slate-300">{s.name}</span>
                      <span className="font-mono font-bold text-sky-300">{s.score} / 10</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Attendance Summary from Database */}
            <div className="p-3.5 rounded border border-slate-800 bg-slate-950/70 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="font-mono font-bold text-slate-100">
                  4. REKAPITULASI KEHADIRAN LATIHAN DARI DATABASE ({previewReport.attendance.totalSessions} SESI)
                </div>
                <span
                  className={`font-mono font-bold ${
                    previewReport.attendance.meetsTarget ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  KEHADIRAN: {previewReport.attendance.attendanceRatePct}% (Target ≥
                  {minAttendanceTargetPct}%)
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">HADIR TEPAT WAKTU</div>
                  <div className="text-sm font-mono font-bold text-emerald-400">
                    {previewReport.attendance.presentCount} Sesi
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">HADIR TERLAMBAT</div>
                  <div className="text-sm font-mono font-bold text-amber-400">
                    {previewReport.attendance.lateCount} Sesi
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">IZIN / SAKIT RESMI</div>
                  <div className="text-sm font-mono font-bold text-sky-400">
                    {previewReport.attendance.excusedCount} Sesi
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">TANPA KETERANGAN</div>
                  <div className="text-sm font-mono font-bold text-red-400">
                    {previewReport.attendance.absentCount} Sesi
                  </div>
                </div>
              </div>
            </div>

            {/* Coach Recommendation */}
            <div className="p-3.5 rounded border border-slate-800 bg-slate-950/70 space-y-1">
              <div className="text-[11px] font-mono text-amber-400 uppercase">
                5. CATATAN & REKOMENDASI PELATIH PENILAI ({previewReport.coachName})
              </div>
              <p className="text-slate-200 leading-relaxed italic">
                &ldquo;{previewReport.coachRecommendation}&rdquo;
              </p>
            </div>

            {/* Email Dispatch Control inside Modal */}
            <div className="p-3.5 rounded border border-emerald-500/30 bg-emerald-500/5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-mono text-emerald-400 uppercase">
                    PENGIRIMAN EMAIL OTOMATIS KE ORANG TUA / WALI
                  </div>
                  <div className="text-xs text-slate-300">
                    Rapor bulanan ini akan dikirim melalui{' '}
                    <span className="font-mono text-slate-100">{emailSettings.senderEmail}</span> dan
                    diarsipkan di tabel <span className="font-mono text-slate-100">documents</span>.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={customRecipientEmail}
                    onChange={(e) => setCustomRecipientEmail(e.target.value)}
                    placeholder="Email orang tua..."
                    className="px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-emerald-300 w-56"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => handleDownloadReportCardTxt(previewReport)}
                  className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Unduh Lembar Rapor (.TXT)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewReport(null)}
                    className="px-3 py-2 text-xs text-slate-300 border border-slate-700 rounded"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    disabled={sendingAthleteId === previewReport.athleteId}
                    onClick={async () => {
                      await handleSendSingleMonthlyReportEmail(
                        previewReport,
                        customRecipientEmail
                      );
                      setPreviewReport(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {sendingAthleteId === previewReport.athleteId
                        ? 'Mengirim Email...'
                        : `Kirim Rapor ke ${customRecipientEmail || previewReport.parentEmail}`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
export default MonthlyAthleteReportHub;
