import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Calendar,
  QrCode,
  CheckCircle2,
  ClipboardList,
  Target,
  Sliders,
  ShieldCheck,
  Download,
  LogOut,
  UserCheck,
  Users,
  Fingerprint,
  Briefcase,
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  Trash2,
  Mail,
  MessageSquare,
  Send,
} from 'lucide-react';
import { SystemState } from '../types/system.ts';
import { apiRequest } from '../lib/api.ts';
import {
  OfflineAttendanceQueueItem,
  loadOfflineAttendanceQueue,
  enqueueOfflineAttendance,
  removeOfflineQueueItem,
  clearOfflineAttendanceQueue,
  syncOfflineAttendanceQueueToServer,
  getSimulatedOfflineMode,
  setSimulatedOfflineMode,
  getLastOfflineSyncAt,
  isNetworkDisconnectError,
} from '../lib/offlineAttendanceQueue.ts';
import { hasPermission } from '../lib/rbac.ts';
import { Modal, StatusText } from '../components/ui/Primitives.tsx';
import { DigitalQrPassHub } from '../components/ui/DigitalQrPassHub.tsx';
import { MonthlyAthleteReportHub } from '../components/ui/MonthlyAthleteReportHub.tsx';
import { MonthlyTrainingCalendar } from '../components/ui/MonthlyTrainingCalendar.tsx';
import { WhatsAppGatewayHub } from '../components/ui/WhatsAppGatewayHub.tsx';

function DigitalQrMatrixSvg({ code }: { code: string }) {
  // Deterministic 9x9 matrix from code string
  const size = 9;
  const cells: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      const isCorner =
        (r < 3 && c < 3) || (r < 3 && c >= size - 3) || (r >= size - 3 && c < 3);
      if (isCorner) {
        const isBorder =
          r === 0 ||
          r === 2 ||
          r === size - 1 ||
          r === size - 3 ||
          c === 0 ||
          c === 2 ||
          c === size - 1 ||
          c === size - 3 ||
          (r === 1 && c === 1) ||
          (r === 1 && c === size - 2) ||
          (r === size - 2 && c === 1);
        row.push(isBorder);
      } else {
        const charCode = code.charCodeAt((r * size + c) % code.length) || 65;
        row.push((charCode + r * 7 + c * 13) % 2 === 0);
      }
    }
    cells.push(row);
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-28 h-28 bg-white p-2 rounded border border-slate-300 mx-auto"
      shapeRendering="crispEdges"
    >
      {cells.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? (
            <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width={1} height={1} fill="#0f172a" />
          ) : null
        )
      )}
    </svg>
  );
}

interface AcademyTrainingViewProps {
  state: SystemState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function AcademyTrainingView({ state, onRefresh, notify }: AcademyTrainingViewProps) {
  const [subTab, setSubTab] = useState<
    'teams' | 'sessions' | 'attendance' | 'development' | 'wa_gateway'
  >('sessions');
  const [dispatchingSessionWaId, setDispatchingSessionWaId] = useState<string | null>(null);
  const [attendanceMode, setAttendanceMode] = useState<
    'all' | 'coach' | 'player' | 'staff' | 'qr_cards'
  >('all');
  const [modalType, setModalType] = useState<
    null | 'age_group' | 'team' | 'program' | 'session' | 'evaluation' | 'goal' | 'criteria'
  >(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    state.trainingSessions[0]?.id || ''
  );
  const [attendanceSource, setAttendanceSource] = useState<'QR' | 'COACH' | 'ADMIN'>('QR');
  const [coachCheckInMethod, setCoachCheckInMethod] = useState<
    'DIGITAL_QR' | 'DIGITAL_PIN' | 'COURT_KIOSK' | 'ADMIN_VERIFIED'
  >('DIGITAL_QR');
  const [qrCodeInput, setQrCodeInput] = useState<string>('');
  const [coachQrInput, setCoachQrInput] = useState<string>('');
  const [digitalPassModal, setDigitalPassModal] = useState<
    | null
    | {
        type: 'COACH' | 'ATHLETE';
        id: string;
        code: string;
        name: string;
        subtitle: string;
        branchId: string;
      }
  >(null);
  const [submitting, setSubmitting] = useState(false);

  // Offline-First LocalStorage Attendance Queue & Connectivity State
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(() =>
    getSimulatedOfflineMode()
  );
  const [offlineQueue, setOfflineQueue] = useState<OfflineAttendanceQueueItem[]>(() =>
    loadOfflineAttendanceQueue()
  );
  const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);
  const [lastOfflineSyncAt, setLastOfflineSyncAtState] = useState<string | null>(() =>
    getLastOfflineSyncAt()
  );
  const [showOfflineQueueDetails, setShowOfflineQueueDetails] = useState<boolean>(false);

  const isEffectiveOffline = !isBrowserOnline || simulatedOffline;

  const refreshLocalOfflineState = useCallback(() => {
    setOfflineQueue(loadOfflineAttendanceQueue());
    setSimulatedOffline(getSimulatedOfflineMode());
    setLastOfflineSyncAtState(getLastOfflineSyncAt());
  }, []);

  const handleSyncOfflineQueue = useCallback(
    async (isAutoTrigger = false) => {
      const currentQueue = loadOfflineAttendanceQueue();
      if (currentQueue.length === 0) return;
      if (!navigator.onLine || getSimulatedOfflineMode()) {
        if (!isAutoTrigger) {
          notify(
            'Tidak dapat sinkronisasi saat perangkat dalam kondisi Offline. Matikan Mode Offline atau sambungkan internet terlebih dahulu.',
            'error'
          );
        }
        return;
      }

      setIsSyncingOffline(true);
      try {
        const result = await syncOfflineAttendanceQueueToServer();
        refreshLocalOfflineState();
        if (result.syncedCount > 0) {
          notify(
            `${
              isAutoTrigger ? '[AUTO-SYNC ONLINE]' : '[SINKRONISASI MANUAL]'
            } Berhasil menyinkronkan ${result.syncedCount} data presensi dari LocalStorage ke server PostgreSQL.${
              result.failedCount > 0 ? ` (${result.failedCount} gagal, tetap di antrean)` : ''
            }`
          );
          await onRefresh();
        } else if (result.failedCount > 0 && !isAutoTrigger) {
          notify(
            `Gagal menyinkronkan ${result.failedCount} item presensi. Data tetap aman di LocalStorage.`,
            'error'
          );
        }
      } finally {
        setIsSyncingOffline(false);
      }
    },
    [notify, onRefresh, refreshLocalOfflineState]
  );

  // Listen to browser online/offline events & custom queue storage updates
  useEffect(() => {
    const onOnline = () => {
      setIsBrowserOnline(true);
      if (!getSimulatedOfflineMode() && loadOfflineAttendanceQueue().length > 0) {
        void handleSyncOfflineQueue(true);
      }
    };
    const onOffline = () => {
      setIsBrowserOnline(false);
    };
    const onQueueUpdated = () => {
      refreshLocalOfflineState();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('zamoa-offline-queue-updated', onQueueUpdated);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('zamoa-offline-queue-updated', onQueueUpdated);
    };
  }, [handleSyncOfflineQueue, refreshLocalOfflineState]);

  // Auto-sync when switching from Simulated Offline -> Online
  useEffect(() => {
    if (!isEffectiveOffline && offlineQueue.length > 0 && !isSyncingOffline) {
      void handleSyncOfflineQueue(true);
    }
  }, [isEffectiveOffline, offlineQueue.length, isSyncingOffline, handleSyncOfflineQueue]);

  const handleToggleSimulatedOffline = (nextOffline: boolean) => {
    setSimulatedOfflineMode(nextOffline);
    setSimulatedOffline(nextOffline);
    if (nextOffline) {
      notify(
        'Mode Offline-First Lapangan diaktifkan: Seluruh pencatatan presensi akan disimpan ke LocalStorage dan otomatis disinkronkan saat kembali Online.'
      );
    } else {
      const pendingCount = loadOfflineAttendanceQueue().length;
      if (pendingCount > 0) {
        notify(
          `Kembali Online! Memulai sinkronisasi otomatis untuk ${pendingCount} data presensi dari LocalStorage...`
        );
      } else {
        notify('Mode Online Real-Time aktif.');
      }
    }
  };

  const role = state.currentUser.activeRoleCode;
  const canCreateTeam = hasPermission(role, 'teams', 'create');
  const canCreateTraining = hasPermission(role, 'training', 'create');
  const canProcessTraining = hasPermission(role, 'training', 'process');
  const canRecordAttendance = hasPermission(role, 'attendance', 'create');
  const canCreateEval = hasPermission(role, 'development', 'create');
  const canManageCriteria = hasPermission(role, 'development', 'manage');

  // Forms
  const [ageGroupForm, setAgeGroupForm] = useState({
    code: '',
    name: '',
    minAge: '10',
    maxAge: '12',
    description: '',
  });

  const [teamForm, setTeamForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    ageGroupId: state.ageGroups[0]?.id || '',
    headCoachId: state.coaches[0]?.id || '',
    code: '',
    name: '',
    genderDivision: 'PUTRA',
    season: '2026/2027',
  });

  const [programForm, setProgramForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    ageGroupId: state.ageGroups[0]?.id || '',
    code: '',
    name: '',
    season: '2026/2027',
    focusArea: 'Fundamental Ball Handling, Defense & Transition',
    sessionsPerWeek: '3',
  });

  const [sessionForm, setSessionForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    programId: state.trainingPrograms[0]?.id || '',
    teamId: state.teams[0]?.id || '',
    coachId: state.coaches[0]?.id || '',
    courtName: 'Court A (Main FIBA Wood Flooring)',
    sessionDate: '2026-10-01',
    startTime: '16:00',
    endTime: '18:00',
    topic: '',
    trainingNotes: '',
    status: 'SCHEDULED' as 'SCHEDULED' | 'ONGOING',
    autoSendWhatsAppReminder: true,
  });
  const [filterSessionModalByBranch, setFilterSessionModalByBranch] = useState<boolean>(true);

  const handleSessionBranchChange = (nextBranchId: string) => {
    const branchObj = state.branches.find((b) => b.id === nextBranchId);
    const branchTeams = state.teams.filter((t) => t.branchId === nextBranchId);
    const branchCoaches = state.coaches.filter((c) => c.branchId === nextBranchId);
    const branchPrograms = state.trainingPrograms.filter((p) => p.branchId === nextBranchId);

    const nextTeam = branchTeams[0] || state.teams[0];
    const preferredCoachId =
      nextTeam?.headCoachId &&
      state.coaches.some((c) => c.id === nextTeam.headCoachId)
        ? nextTeam.headCoachId
        : branchCoaches[0]?.id || state.coaches[0]?.id || '';
    const nextProgram = branchPrograms[0] || state.trainingPrograms[0];

    let defaultCourt = 'Court A (Main FIBA Wood Flooring)';
    if (branchObj?.code?.includes('BDG')) {
      defaultCourt = 'Court C (Bandung Arena Indoor)';
    } else if (branchObj?.code?.includes('SBY')) {
      defaultCourt = 'Court D (East Hub Surabaya)';
    }

    setSessionForm((prev) => ({
      ...prev,
      branchId: nextBranchId,
      teamId: nextTeam?.id || prev.teamId,
      coachId: preferredCoachId || prev.coachId,
      programId: nextProgram?.id || prev.programId,
      courtName: defaultCourt,
    }));
  };

  const openNewSessionModal = (prefill?: Partial<typeof sessionForm>) => {
    const targetBranchId =
      prefill?.branchId ||
      sessionForm.branchId ||
      state.currentUser.branchId ||
      state.branches[0]?.id ||
      '';
    const branchTeams = state.teams.filter((t) => t.branchId === targetBranchId);
    const branchCoaches = state.coaches.filter((c) => c.branchId === targetBranchId);
    const branchPrograms = state.trainingPrograms.filter((p) => p.branchId === targetBranchId);

    const resolvedTeamId =
      prefill?.teamId ||
      (branchTeams.some((t) => t.id === sessionForm.teamId)
        ? sessionForm.teamId
        : branchTeams[0]?.id || state.teams[0]?.id || '');
    const selectedTeamObj = state.teams.find((t) => t.id === resolvedTeamId);
    const resolvedCoachId =
      prefill?.coachId ||
      selectedTeamObj?.headCoachId ||
      (branchCoaches.some((c) => c.id === sessionForm.coachId)
        ? sessionForm.coachId
        : branchCoaches[0]?.id || state.coaches[0]?.id || '');
    const resolvedProgramId =
      prefill?.programId ||
      (branchPrograms.some((p) => p.id === sessionForm.programId)
        ? sessionForm.programId
        : branchPrograms[0]?.id || state.trainingPrograms[0]?.id || '');

    setSessionForm((prev) => ({
      ...prev,
      branchId: targetBranchId,
      teamId: resolvedTeamId,
      coachId: resolvedCoachId,
      programId: resolvedProgramId,
      sessionDate: prefill?.sessionDate || prev.sessionDate || '2026-10-01',
      courtName: prefill?.courtName || prev.courtName || 'Court A (Main FIBA Wood Flooring)',
      startTime: prefill?.startTime || prev.startTime || '16:00',
      endTime: prefill?.endTime || prev.endTime || '18:00',
      topic: prefill?.topic ?? prev.topic,
      trainingNotes: prefill?.trainingNotes ?? prev.trainingNotes,
      status: prefill?.status || 'SCHEDULED',
    }));
    setModalType('session');
  };

  // Evaluation dynamic scores
  const defaultScores: Record<string, number> = {};
  state.assessmentCriteria.forEach((c) => {
    defaultScores[c.code] = 8;
  });

  const [evalForm, setEvalForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    athleteId: state.athletes[0]?.id || '',
    coachId: state.coaches[0]?.id || '',
    sessionId: state.trainingSessions[0]?.id || '',
    evaluationDate: new Date().toISOString().slice(0, 10),
    periodLabel: 'Rapor Bulanan Oktober 2026',
    scores: defaultScores,
    coachRecommendation: '',
    autoSendParentEmail: true,
    recipientEmailOverride: '',
  });

  const [goalForm, setGoalForm] = useState({
    athleteId: state.athletes[0]?.id || '',
    coachId: state.coaches[0]?.id || '',
    title: '',
    category: 'TECHNICAL',
    targetMetric: 'Akurasi Free Throw >= 80%',
    currentProgress: '50',
    targetDate: '2026-12-31',
    status: 'IN_PROGRESS',
  });

  const [criteriaForm, setCriteriaForm] = useState({
    category: 'TECHNICAL',
    code: '',
    name: '',
    minScore: '1',
    maxScore: '10',
    weight: '1',
  });

  const handleUpdateSessionStatus = async (sessionId: string, status: string) => {
    try {
      await apiRequest(`/api/training-sessions/${sessionId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify(`Status sesi latihan diperbarui ke ${status}.`);
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memperbarui status sesi', 'error');
    }
  };

  const handleMarkAttendance = async (
    sessionId: string,
    athleteId: string,
    branchId: string,
    status: 'PRESENT' | 'LATE' | 'EXCUSED' | 'SICK' | 'ABSENT'
  ) => {
    const athleteObj = state.athletes.find((a) => a.id === athleteId);
    const saveOffline = () => {
      enqueueOfflineAttendance({
        entityType: 'ATHLETE_SINGLE',
        branchId,
        sessionId,
        targetId: athleteId,
        targetName: athleteObj?.fullName || 'Atlet',
        targetCode: athleteObj?.memberCode,
        status,
        sourceOrMethod: attendanceSource,
        notes: `Dicatat via ${attendanceSource}`,
      });
      refreshLocalOfflineState();
      notify(
        `[OFFLINE-FIRST] Presensi ${athleteObj?.fullName || 'Atlet'} (${status}) disimpan ke LocalStorage. Otomatis sinkron saat kembali online.`
      );
    };

    if (isEffectiveOffline) {
      saveOffline();
      return;
    }

    try {
      await apiRequest('/api/attendances', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          sessionId,
          athleteId,
          status,
          source: attendanceSource,
          notes: `Dicatat via ${attendanceSource}`,
        }),
      });
      notify(`Presensi tercatat (${status} via ${attendanceSource}). Anti-duplikasi aktif.`);
      await onRefresh();
    } catch (err: unknown) {
      if (isNetworkDisconnectError(err)) {
        saveOffline();
      } else {
        notify(err instanceof Error ? err.message : 'Gagal mencatat presensi', 'error');
      }
    }
  };

  const handleBulkPresent = async (sessionId: string, branchId: string, athleteIds: string[]) => {
    if (athleteIds.length === 0) return;

    const saveBulkOffline = () => {
      // Enqueue individual records per athlete so the roster UI updates every player's status immediately
      athleteIds.forEach((aid) => {
        const ath = state.athletes.find((a) => a.id === aid);
        enqueueOfflineAttendance({
          entityType: 'ATHLETE_SINGLE',
          branchId,
          sessionId,
          targetId: aid,
          targetName: ath?.fullName || 'Atlet',
          targetCode: ath?.memberCode,
          status: 'PRESENT',
          sourceOrMethod: attendanceSource,
          notes: `Bulk PRESENT via ${attendanceSource}`,
        });
      });
      refreshLocalOfflineState();
      notify(
        `[OFFLINE-FIRST] Presensi massal ${athleteIds.length} atlet (PRESENT) disimpan di LocalStorage & otomatis sinkron saat kembali online.`
      );
    };

    if (isEffectiveOffline) {
      saveBulkOffline();
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/api/attendances/bulk', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          sessionId,
          athleteIds,
          status: 'PRESENT',
          source: attendanceSource,
        }),
      });
      notify(`Presensi massal berhasil: ${athleteIds.length} atlet ditandai PRESENT via ${attendanceSource}.`);
      await onRefresh();
    } catch (err: unknown) {
      if (isNetworkDisconnectError(err)) {
        saveBulkOffline();
      } else {
        notify(err instanceof Error ? err.message : 'Gagal mencatat presensi massal', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleQrCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !qrCodeInput.trim()) return;
    const code = qrCodeInput.trim().toUpperCase();
    const matchedAthlete = state.athletes.find(
      (a) => a.memberCode.toUpperCase() === code || a.fullName.toUpperCase() === code
    );
    if (!matchedAthlete) {
      notify(`Kode member / nama "${qrCodeInput}" tidak ditemukan di direktori atlet.`, 'error');
      return;
    }

    const saveQrOffline = () => {
      enqueueOfflineAttendance({
        entityType: 'ATHLETE_SINGLE',
        branchId: activeSession.branchId,
        sessionId: activeSession.id,
        targetId: matchedAthlete.id,
        targetName: matchedAthlete.fullName,
        targetCode: matchedAthlete.memberCode,
        status: 'PRESENT',
        sourceOrMethod: 'QR',
        notes: `QR Check-In (${matchedAthlete.memberCode})`,
      });
      setQrCodeInput('');
      refreshLocalOfflineState();
      notify(
        `[OFFLINE-FIRST] QR Check-In ${matchedAthlete.fullName} (${matchedAthlete.memberCode}) disimpan di LocalStorage & otomatis sinkron saat online.`
      );
    };

    if (isEffectiveOffline) {
      saveQrOffline();
      return;
    }

    try {
      await apiRequest('/api/attendances', {
        method: 'POST',
        body: JSON.stringify({
          branchId: activeSession.branchId,
          sessionId: activeSession.id,
          athleteId: matchedAthlete.id,
          status: 'PRESENT',
          source: 'QR',
          notes: `QR Check-In (${matchedAthlete.memberCode})`,
        }),
      });
      setQrCodeInput('');
      notify(`QR Check-In berhasil: ${matchedAthlete.fullName} (${matchedAthlete.memberCode}) tercatat PRESENT.`);
      await onRefresh();
    } catch (err: unknown) {
      if (isNetworkDisconnectError(err)) {
        saveQrOffline();
      } else {
        notify(err instanceof Error ? err.message : 'Gagal QR check-in', 'error');
      }
    }
  };

  const handleMarkCoachAttendance = async (
    sessionId: string,
    coachId: string,
    branchId: string,
    status: 'PRESENT' | 'LATE' | 'SUBSTITUTE' | 'EXCUSED' | 'ABSENT',
    methodOverride?: 'DIGITAL_QR' | 'DIGITAL_PIN' | 'COURT_KIOSK' | 'ADMIN_VERIFIED'
  ) => {
    const method = methodOverride || coachCheckInMethod;
    const coachObj = state.coaches.find((c) => c.id === coachId);

    const saveCoachOffline = () => {
      enqueueOfflineAttendance({
        entityType: 'COACH_SINGLE',
        branchId,
        sessionId,
        targetId: coachId,
        targetName: coachObj?.fullName || 'Coach',
        targetCode: coachObj?.coachCode || undefined,
        status,
        sourceOrMethod: method,
        notes: `Presensi digital coach (${status}) via ${method}`,
      });
      refreshLocalOfflineState();
      notify(
        `[OFFLINE-FIRST] Presensi Coach ${coachObj?.fullName || ''} (${status}) disimpan di LocalStorage & otomatis sinkron saat kembali online.`
      );
    };

    if (isEffectiveOffline) {
      saveCoachOffline();
      return;
    }

    try {
      await apiRequest('/api/coach-attendances', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          sessionId,
          coachId,
          status,
          checkInMethod: method,
          notes: `Presensi digital coach (${status}) via ${method}`,
        }),
      });
      notify(
        `Presensi Digital Coach ${coachObj?.fullName || ''} tercatat (${status} via ${method}) lengkap dengan Signature Hash.`
      );
      await onRefresh();
    } catch (err: unknown) {
      if (isNetworkDisconnectError(err)) {
        saveCoachOffline();
      } else {
        notify(err instanceof Error ? err.message : 'Gagal mencatat presensi coach', 'error');
      }
    }
  };

  const handleCoachCheckOut = async (coachAttendanceId: string, coachName: string) => {
    try {
      await apiRequest(`/api/coach-attendances/${coachAttendanceId}/checkout`, {
        method: 'PATCH',
        body: JSON.stringify({
          notes: 'Selesai memimpin sesi latihan (Digital Check-Out)',
        }),
      });
      notify(`Check-Out Digital berhasil untuk Coach ${coachName}. Durasi sesi telah terekam.`);
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal check-out digital coach', 'error');
    }
  };

  const handleMarkStaffAttendance = async (
    sessionId: string,
    staffId: string,
    branchId: string,
    status: 'PRESENT' | 'LATE' | 'ON_DUTY' | 'EXCUSED' | 'ABSENT',
    methodOverride?: 'DIGITAL_QR' | 'DIGITAL_PIN' | 'COURT_KIOSK' | 'ADMIN_VERIFIED'
  ) => {
    const method = methodOverride || coachCheckInMethod;
    const staffObj = state.staff.find((s) => s.id === staffId);

    const saveStaffOffline = () => {
      enqueueOfflineAttendance({
        entityType: 'STAFF_SINGLE',
        branchId,
        sessionId,
        targetId: staffId,
        targetName: staffObj?.fullName || 'Staf',
        targetCode: staffObj?.staffCode || undefined,
        status,
        sourceOrMethod: method,
        notes: `Presensi digital staf (${status}) via ${method}`,
      });
      refreshLocalOfflineState();
      notify(
        `[OFFLINE-FIRST] Presensi Staf ${staffObj?.fullName || ''} (${status}) disimpan di LocalStorage & otomatis sinkron saat kembali online.`
      );
    };

    if (isEffectiveOffline) {
      saveStaffOffline();
      return;
    }

    try {
      await apiRequest('/api/staff-attendances', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          sessionId,
          staffId,
          status,
          checkInMethod: method,
          notes: `Presensi digital staf (${status}) via ${method}`,
        }),
      });
      notify(
        `Presensi Digital Staf ${staffObj?.fullName || ''} tercatat (${status} via ${method}).`
      );
      await onRefresh();
    } catch (err: unknown) {
      if (isNetworkDisconnectError(err)) {
        saveStaffOffline();
      } else {
        notify(err instanceof Error ? err.message : 'Gagal mencatat presensi staf', 'error');
      }
    }
  };

  const handleStaffCheckOut = async (staffAttendanceId: string, staffName: string) => {
    try {
      await apiRequest(`/api/staff-attendances/${staffAttendanceId}/checkout`, {
        method: 'PATCH',
        body: JSON.stringify({
          notes: 'Selesai bertugas pada sesi latihan (Digital Check-Out)',
        }),
      });
      notify(`Check-Out Digital berhasil untuk Staf ${staffName}.`);
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal check-out digital staf', 'error');
    }
  };

  const handleCoachQrCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !coachQrInput.trim()) return;
    const raw = coachQrInput.trim().toUpperCase();
    const matchedCoach = state.coaches.find((c, idx) => {
      const syntheticCode = `COACH-${idx + 1}`.toUpperCase();
      const idPrefix = `COACH-${c.id.slice(0, 6)}`.toUpperCase();
      return (
        c.fullName.toUpperCase().includes(raw) ||
        syntheticCode === raw ||
        idPrefix === raw ||
        c.licenseLevel.toUpperCase().includes(raw)
      );
    });

    if (!matchedCoach) {
      notify(`Kode QR / nama pelatih "${coachQrInput}" tidak ditemukan.`, 'error');
      return;
    }

    await handleMarkCoachAttendance(
      activeSession.id,
      matchedCoach.id,
      activeSession.branchId,
      'PRESENT',
      'DIGITAL_QR'
    );
    setCoachQrInput('');
  };

  const handleDownloadSessionAttendanceReport = () => {
    if (!activeSession) return;
    const team = state.teams.find((t) => t.id === activeSession.teamId);
    const branch = state.branches.find((b) => b.id === activeSession.branchId);
    const coachAtts = (state.coachAttendances || []).filter(
      (ca) => ca.sessionId === activeSession.id
    );
    const playerAtts = state.attendances.filter((a) => a.sessionId === activeSession.id);

    const lines = [
      '====================================================================',
      '        BERITA ACARA PRESENSI DIGITAL SESI LATIHAN (COACH & PEMAIN) ',
      '                  ZAMOA CBTC BASKETBALL ACADEMY                     ',
      '====================================================================',
      `ID Sesi           : ${activeSession.id}`,
      `Tanggal & Waktu   : ${activeSession.sessionDate} (${activeSession.startTime} - ${activeSession.endTime})`,
      `Cabang & Lapangan : ${branch?.name || '-'} — ${activeSession.courtName}`,
      `Tim               : ${team?.name || '-'}`,
      `Topik Latihan     : ${activeSession.topic}`,
      `Status Sesi       : ${activeSession.status}`,
      '--------------------------------------------------------------------',
      'A. PRESENSI DIGITAL PELATIH (COACH ATTENDANCE & SIGNATURE)',
      '--------------------------------------------------------------------',
      ...(coachAtts.length === 0
        ? ['Belum ada data check-in digital pelatih pada sesi ini.']
        : coachAtts.map((ca, i) => {
            const c = state.coaches.find((x) => x.id === ca.coachId);
            return `${i + 1}. ${c?.fullName || 'Coach'} | Status: ${ca.status} | Metode: ${ca.checkInMethod} | Check-In: ${new Date(ca.checkInAt).toLocaleTimeString('id-ID')} | Check-Out: ${ca.checkOutAt ? new Date(ca.checkOutAt).toLocaleTimeString('id-ID') : 'Aktif'} | Signature: ${ca.digitalSignatureHash || '-'}`;
          })),
      '--------------------------------------------------------------------',
      'B. PRESENSI DIGITAL PEMAIN / ATLET (PLAYER ATTENDANCE)',
      '--------------------------------------------------------------------',
      ...(playerAtts.length === 0
        ? ['Belum ada data check-in digital pemain pada sesi ini.']
        : playerAtts.map((pa, i) => {
            const a = state.athletes.find((x) => x.id === pa.athleteId);
            return `${i + 1}. [${a?.memberCode || '-'}] ${a?.fullName || 'Atlet'} (#${a?.jerseyNumber || '-'} ${a?.position || '-'}) | Status: ${pa.status} | Sumber: ${pa.source} | Waktu: ${new Date(pa.recordedAt).toLocaleTimeString('id-ID')}`;
          })),
      '====================================================================',
      `Dicetak Otomatis Oleh Sistem Digital ZAMOA CBTC: ${new Date().toLocaleString('id-ID')}`,
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Presensi-Digital-Sesi-${activeSession.sessionDate}-${activeSession.id.slice(0, 6)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Berita Acara Presensi Digital (Coach & Pemain) berhasil diunduh (.TXT).');
  };

  const handleUpdateGoalProgress = async (goalId: string, nextProgress: number) => {
    const clamped = Math.max(0, Math.min(100, nextProgress));
    try {
      await apiRequest(`/api/player-goals/${goalId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          currentProgress: clamped,
          status: clamped >= 100 ? 'ACHIEVED' : 'IN_PROGRESS',
        }),
      });
      notify(`Progres target atlet diperbarui menjadi ${clamped}%.`);
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memperbarui target', 'error');
    }
  };

  const activeSession =
    state.trainingSessions.find((s) => s.id === selectedSessionId) || state.trainingSessions[0];

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('sessions')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'sessions'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Kalender Jadwal Bulanan & Status Lapangan ({state.trainingSessions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('attendance')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'attendance'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Presensi Digital (Coach & Pemain)</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('development')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
              subTab === 'development'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Rapor Bulanan Atlet & Evaluasi ({state.playerEvaluations.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('teams')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md ${
              subTab === 'teams'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            Kelompok Umur & Tim ({state.teams.length})
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
            <span>Gateway WA Jadwal Harian</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'teams' && canCreateTeam && (
            <>
              <button
                type="button"
                onClick={() => setModalType('age_group')}
                className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Kelompok Umur</span>
              </button>
              <button
                type="button"
                onClick={() => setModalType('team')}
                className="px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Tim</span>
              </button>
            </>
          )}
          {canCreateTraining && (
            <button
              type="button"
              onClick={() => openNewSessionModal()}
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Input Sesi Latihan Baru</span>
            </button>
          )}
          {subTab === 'sessions' && canCreateTraining && (
            <button
              type="button"
              onClick={() => setModalType('program')}
              className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Program Kurikulum</span>
            </button>
          )}
          {subTab === 'development' && (
            <>
              {canManageCriteria && (
                <button
                  type="button"
                  onClick={() => setModalType('criteria')}
                  className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Indikator Penilaian</span>
                </button>
              )}
              {canCreateEval && (
                <>
                  <button
                    type="button"
                    onClick={() => setModalType('goal')}
                    className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md flex items-center gap-1"
                  >
                    <Target className="w-3.5 h-3.5" />
                    <span>Target Atlet (Goal)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalType('evaluation')}
                    className="px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    <span>Input Evaluasi Atlet</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* SUBTAB: SESSIONS & PROGRAMS */}
      {subTab === 'sessions' && (
        <div className="space-y-6">
          {/* INTERACTIVE MONTHLY TRAINING CALENDAR (COACH COURT STATUS & ATHLETE PERSONAL SESSIONS) */}
          <MonthlyTrainingCalendar
            state={state}
            canCreateTraining={canCreateTraining}
            canProcessTraining={canProcessTraining}
            onSelectSessionForAttendance={(sessionId) => {
              setSelectedSessionId(sessionId);
              setSubTab('attendance');
            }}
            onUpdateSessionStatus={handleUpdateSessionStatus}
            onOpenScheduleModalWithPrefill={(prefill) => {
              openNewSessionModal({
                sessionDate: prefill.sessionDate,
                courtName: prefill.courtName,
                branchId: prefill.branchId,
                teamId: prefill.teamId,
              });
            }}
          />

          {/* Programs summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {state.trainingPrograms.map((prog) => {
              const ag = state.ageGroups.find((g) => g.id === prog.ageGroupId);
              return (
                <div
                  key={prog.id}
                  className="p-4 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono text-amber-400">
                      <span>{prog.code}</span>
                      <span>{prog.season}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-100 mt-1">{prog.name}</h4>
                    <p className="text-xs text-slate-400 mt-1">{prog.focusArea}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
                    <span>{ag?.name || 'Semua KU'}</span>
                    <span className="font-mono">{prog.sessionsPerWeek}x / minggu</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sessions Table */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Daftar Sesi Latihan Terjadwal &amp; Riwayat Lapangan ({state.trainingSessions.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Kelola jadwal sesi latihan per cabang, tim, pelatih, dan jam lapangan beserta pengiriman pengingat WhatsApp.
                </p>
              </div>
              {canCreateTraining && (
                <button
                  type="button"
                  onClick={() => openNewSessionModal()}
                  className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Input Sesi Latihan Baru</span>
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Tanggal & Waktu</th>
                    <th className="py-3 px-4">Topik & Catatan Latihan</th>
                    <th className="py-3 px-4">Tim & Lapangan</th>
                    <th className="py-3 px-4">Pelatih</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Workflow Sesi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {state.trainingSessions.map((s) => {
                    const team = state.teams.find((t) => t.id === s.teamId);
                    const coach = state.coaches.find((c) => c.id === s.coachId);
                    const attCount = state.attendances.filter((a) => a.sessionId === s.id).length;
                    return (
                      <tr key={s.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-mono text-xs text-slate-200 whitespace-nowrap">
                          <div>{s.sessionDate}</div>
                          <div className="text-slate-400">
                            {s.startTime} - {s.endTime}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-100">{s.topic}</div>
                          <div className="text-xs text-slate-400">
                            {s.trainingNotes || 'Tidak ada catatan tambahan'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="font-semibold text-slate-200">{team?.name || '-'}</div>
                          <div className="text-slate-400">{s.courtName}</div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="text-slate-200">{coach?.fullName || '-'}</div>
                          <div className="font-mono text-slate-400">{attCount} presensi tercatat</div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusText status={s.status} />
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={dispatchingSessionWaId === s.id}
                            onClick={async () => {
                              setDispatchingSessionWaId(s.id);
                              try {
                                const res = await apiRequest<{
                                  ok: boolean;
                                  dispatchedCount: number;
                                }>('/api/whatsapp-gateway/dispatch-daily-training', {
                                  method: 'POST',
                                  body: JSON.stringify({ sessionId: s.id }),
                                });
                                notify(
                                  `Gateway WhatsApp berhasil mengirim ${res.dispatchedCount} pengingat jadwal latihan "${s.topic}" ke nomor WA Orang Tua.`
                                );
                                await onRefresh();
                              } catch (err: unknown) {
                                notify(
                                  err instanceof Error
                                    ? err.message
                                    : 'Gagal mengirim pengingat WA jadwal latihan',
                                  'error'
                                );
                              } finally {
                                setDispatchingSessionWaId(null);
                              }
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded inline-flex items-center gap-1"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>
                              {dispatchingSessionWaId === s.id ? 'Mengirim WA...' : 'Kirim WA Wali'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSessionId(s.id);
                              setSubTab('attendance');
                            }}
                            className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded"
                          >
                            Presensi
                          </button>
                          {canProcessTraining && s.status !== 'COMPLETED' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateSessionStatus(s.id, 'COMPLETED')}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded"
                            >
                              Selesaikan Sesi
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
        </div>
      )}

      {/* SUBTAB: WHATSAPP GATEWAY DAILY TRAINING REMINDERS */}
      {subTab === 'wa_gateway' && (
        <WhatsAppGatewayHub
          state={state}
          onRefresh={onRefresh}
          notify={notify}
          defaultView="training"
        />
      )}

      {/* SUBTAB: DIGITAL ATTENDANCE FOR COACHES & PLAYERS */}
      {subTab === 'attendance' && (
        <div className="space-y-5">
          {/* OFFLINE-FIRST ATTENDANCE & LOCALSTORAGE AUTO-SYNC BAR */}
          <div
            className={`p-4 rounded-lg border transition-colors ${
              isEffectiveOffline
                ? 'border-amber-500/60 bg-amber-950/20'
                : offlineQueue.length > 0
                ? 'border-sky-500/50 bg-sky-950/15'
                : 'border-slate-800 bg-slate-900/60'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-md border shrink-0 ${
                    isEffectiveOffline
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  {isEffectiveOffline ? (
                    <WifiOff className="w-5 h-5" />
                  ) : (
                    <Wifi className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider font-bold text-slate-100">
                      {isEffectiveOffline
                        ? 'MODE OFFLINE-FIRST LAPANGAN AKTIF (LOCALSTORAGE QUEUE)'
                        : 'KONEKSI ONLINE • SINKRONISASI REAL-TIME OTOMATIS'}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      · Antrean LocalStorage:{' '}
                      <strong
                        className={
                          offlineQueue.length > 0 ? 'text-amber-400' : 'text-emerald-400'
                        }
                      >
                        {offlineQueue.length} Data Presensi
                      </strong>
                    </span>
                    {lastOfflineSyncAt && (
                      <span className="text-xs font-mono text-slate-400">
                        · Sinkron Terakhir: {new Date(lastOfflineSyncAt).toLocaleTimeString('id-ID')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {isEffectiveOffline
                      ? 'Koneksi terputus / Mode Offline Lapangan aktif. Setiap klik presensi Pemain, Coach, & Staf otomatis disimpan ke LocalStorage browser dan disinkronkan ke server begitu kembali Online.'
                      : 'Mekanisme Offline-First siaga. Jika sinyal lapangan terputus sewaktu-waktu, pencatatan presensi otomatis dialihkan ke LocalStorage tanpa kehilangan data.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Toggle Online / Offline Simulation for Court Testing */}
                <div className="inline-flex rounded-md border border-slate-800 bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => handleToggleSimulatedOffline(false)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors ${
                      !isEffectiveOffline
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span>Online (Auto-Sync)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSimulatedOffline(true)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors ${
                      isEffectiveOffline
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>Simulasi Offline Lapangan</span>
                  </button>
                </div>

                {offlineQueue.length > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={isSyncingOffline || isEffectiveOffline}
                      onClick={() => void handleSyncOfflineQueue(false)}
                      className={`px-3 py-2 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors ${
                        isEffectiveOffline
                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      }`}
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isSyncingOffline ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {isSyncingOffline
                          ? 'Menyinkronkan...'
                          : `Sinkronkan Sekarang (${offlineQueue.length})`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowOfflineQueueDetails((prev) => !prev)}
                      className="px-3 py-2 text-xs font-semibold bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded flex items-center gap-1.5"
                    >
                      <Database className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {showOfflineQueueDetails
                          ? 'Tutup Antrean LocalStorage'
                          : `Lihat LocalStorage (${offlineQueue.length})`}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Expandable LocalStorage Queue Inspector */}
            {showOfflineQueueDetails && offlineQueue.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-mono text-amber-300">
                    DAFTAR PRESENSI TERSIMPAN DI LOCALSTORAGE (KEY: ZAMOA_CBTC_OFFLINE_ATTENDANCE_QUEUE_V1)
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      clearOfflineAttendanceQueue();
                      refreshLocalOfflineState();
                      notify('Antrean presensi LocalStorage telah dibersihkan.');
                    }}
                    className="px-2.5 py-1 text-xs font-semibold bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/50 rounded flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Kosongkan Antrean</span>
                  </button>
                </div>

                <div className="overflow-x-auto rounded border border-slate-800 bg-slate-950/90">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 font-mono text-[11px] uppercase text-slate-400 bg-slate-900/80">
                        <th className="py-2 px-3">Waktu Simpan</th>
                        <th className="py-2 px-3">Kategori</th>
                        <th className="py-2 px-3">Personel (Atlet / Coach / Staf)</th>
                        <th className="py-2 px-3">Status Presensi</th>
                        <th className="py-2 px-3">Metode</th>
                        <th className="py-2 px-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {offlineQueue.map((qItem) => (
                        <tr key={qItem.id} className="hover:bg-slate-900/50">
                          <td className="py-2 px-3 font-mono text-slate-400">
                            {new Date(qItem.queuedAt).toLocaleTimeString('id-ID')}
                          </td>
                          <td className="py-2 px-3 font-mono text-amber-400">
                            {qItem.entityType}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-100">
                            {qItem.targetName}{' '}
                            {qItem.targetCode ? (
                              <span className="font-mono text-slate-400">({qItem.targetCode})</span>
                            ) : null}
                          </td>
                          <td className="py-2 px-3">
                            <StatusText status={qItem.status} />
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-300">
                            {qItem.sourceOrMethod}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                removeOfflineQueueItem(qItem.id);
                                refreshLocalOfflineState();
                              }}
                              className="text-red-400 hover:text-red-300 font-mono text-[11px]"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Top Control Bar: Session Selector + Mode Filter + Export */}
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/50 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex-1">
                <label className="block text-xs font-mono uppercase text-amber-400 mb-1">
                  Pilih Sesi Latihan Aktif (Anti-Duplikasi UNIQUE(session_id, coach_id) & UNIQUE(session_id, athlete_id))
                </label>
                <select
                  value={activeSession?.id || ''}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full max-w-2xl px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.trainingSessions.map((s) => {
                    const team = state.teams.find((t) => t.id === s.teamId);
                    const assignedCoach = state.coaches.find((c) => c.id === s.coachId);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.sessionDate} ({s.startTime}-{s.endTime}) — {s.topic} [{team?.name || 'Tim'}] • Coach: {assignedCoach?.fullName || '-'}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border border-slate-800 bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => setAttendanceMode('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded ${
                      attendanceMode === 'all'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Coach & Pemain (Terpadu)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceMode('coach')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1 ${
                      attendanceMode === 'coach'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Absen Coach</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceMode('player')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1 ${
                      attendanceMode === 'player'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Absen Pemain</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceMode('staff')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1 ${
                      attendanceMode === 'staff'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>Absen Staf</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceMode('qr_cards')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1 ${
                      attendanceMode === 'qr_cards'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-amber-400 hover:text-amber-300'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Kartu QR (Pemain, Pelatih & Staf)</span>
                  </button>
                </div>

                {activeSession && (
                  <button
                    type="button"
                    onClick={handleDownloadSessionAttendanceReport}
                    className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Unduh Berita Acara (.TXT)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Session Digital Summary Metrics */}
            {activeSession && (() => {
              const sessionCoachAtts = (state.coachAttendances || []).filter(
                (ca) => ca.sessionId === activeSession.id
              );
              const offlinePrimaryCoach = offlineQueue.find(
                (q) =>
                  q.sessionId === activeSession.id &&
                  q.entityType === 'COACH_SINGLE' &&
                  q.targetId === activeSession.coachId
              );
              const primaryCoachAtt = offlinePrimaryCoach
                ? {
                    status: offlinePrimaryCoach.status,
                    checkInMethod: `${offlinePrimaryCoach.sourceOrMethod} (OFFLINE)`,
                    digitalSignatureHash: 'PENDING-SYNC-LOCALSTORAGE',
                  }
                : sessionCoachAtts.find((ca) => ca.coachId === activeSession.coachId);
              const sessionRoster = state.athletes.filter(
                (a) =>
                  !activeSession.teamId ||
                  a.teamId === activeSession.teamId ||
                  a.branchId === activeSession.branchId
              );
              const presentPlayersCount = sessionRoster.filter((ath) => {
                const offItem = offlineQueue.find(
                  (q) =>
                    q.sessionId === activeSession.id &&
                    q.entityType === 'ATHLETE_SINGLE' &&
                    q.targetId === ath.id
                );
                const status =
                  offItem?.status ||
                  state.attendances.find(
                    (att) => att.sessionId === activeSession.id && att.athleteId === ath.id
                  )?.status;
                return status ? ['PRESENT', 'LATE'].includes(status) : false;
              }).length;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80">
                  <div className="p-3 rounded border border-slate-800 bg-slate-950/70">
                    <div className="text-[11px] font-mono uppercase text-slate-400">
                      Status Absen Digital Coach Utama
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      {primaryCoachAtt ? (
                        <StatusText status={primaryCoachAtt.status} />
                      ) : (
                        <span className="text-xs font-mono text-amber-400">BELUM CHECK-IN</span>
                      )}
                      <span className="text-[11px] font-mono text-slate-400">
                        {primaryCoachAtt?.checkInMethod || 'DIGITAL_QR'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded border border-slate-800 bg-slate-950/70">
                    <div className="text-[11px] font-mono uppercase text-slate-400">
                      Digital Signature Hash (Coach)
                    </div>
                    <div className="mt-1 text-xs font-mono text-emerald-400 truncate">
                      {primaryCoachAtt?.digitalSignatureHash || 'Menunggu verifikasi QR/PIN...'}
                    </div>
                  </div>

                  <div className="p-3 rounded border border-slate-800 bg-slate-950/70">
                    <div className="text-[11px] font-mono uppercase text-slate-400">
                      Kehadiran Digital Pemain (Atlet)
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-sm font-mono font-bold text-slate-100">
                        {presentPlayersCount} / {sessionRoster.length} Hadir
                      </span>
                      <span className="text-xs font-mono text-amber-400">
                        {sessionRoster.length > 0
                          ? `${Math.round((presentPlayersCount / sessionRoster.length) * 100)}%`
                          : '0%'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded border border-slate-800 bg-slate-950/70">
                    <div className="text-[11px] font-mono uppercase text-slate-400">
                      Integrasi Payroll & Evaluasi
                    </div>
                    <div className="mt-1 text-xs text-slate-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Tersinkronisasi ke Fee Sesi & Rapor</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* =================================================================== */}
          {/* SECTION 1: TERMINAL PRESENSI DIGITAL PELATIH (COACH ATTENDANCE)     */}
          {/* =================================================================== */}
          {activeSession && (attendanceMode === 'all' || attendanceMode === 'coach') && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/80">
                <div>
                  <div className="flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-slate-100">
                      1. Terminal Presensi Digital Pelatih (Coach Digital Check-In & Check-Out)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mencatat kehadiran pelatih secara digital menggunakan QR Pass Coach, Token PIN, atau Kiosk Lapangan beserta Signature Hash untuk perhitungan otomatis Fee Sesi pada Payroll.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-mono text-slate-400 mr-1">Metode Coach:</span>
                  {(
                    [
                      { id: 'DIGITAL_QR', label: 'QR PASS' },
                      { id: 'DIGITAL_PIN', label: 'PIN TOKEN' },
                      { id: 'COURT_KIOSK', label: 'KIOSK LAPANGAN' },
                      { id: 'ADMIN_VERIFIED', label: 'ADMIN' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCoachCheckInMethod(m.id)}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded border ${
                        coachCheckInMethod === m.id
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                          : 'bg-slate-950 text-slate-300 border-slate-800'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Coach QR Scanner Bar & Quick Scan */}
              {canRecordAttendance && (
                <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <form
                    onSubmit={handleCoachQrCheckIn}
                    className="flex items-center gap-2 flex-1 max-w-xl"
                  >
                    <QrCode className="w-4 h-4 text-amber-400 shrink-0" />
                    <input
                      type="text"
                      value={coachQrInput}
                      onChange={(e) => setCoachQrInput(e.target.value)}
                      placeholder="Scan / ketik Kode QR Coach (contoh: COACH-1 atau nama pelatih) lalu Enter..."
                      className="flex-1 px-3 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-100 placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded whitespace-nowrap"
                    >
                      Scan QR Coach
                    </button>
                  </form>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-400">Quick Scan Coach:</span>
                    {state.coaches.map((c, idx) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          handleMarkCoachAttendance(
                            activeSession.id,
                            c.id,
                            activeSession.branchId,
                            'PRESENT',
                            'DIGITAL_QR'
                          )
                        }
                        className="px-2.5 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                      >
                        <QrCode className="w-3 h-3" />
                        <span>
                          COACH-{idx + 1} ({c.fullName.split(' ')[0]})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Coach Attendance Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                      <th className="py-3 px-4">Pelatih & Lisensi</th>
                      <th className="py-3 px-4">Peran Sesi</th>
                      <th className="py-3 px-4">Status Presensi</th>
                      <th className="py-3 px-4">Waktu Check-In & Check-Out Digital</th>
                      <th className="py-3 px-4">Signature Hash Verifikasi</th>
                      <th className="py-3 px-4 text-right">Aksi Presensi Digital Coach</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {state.coaches.map((coach, idx) => {
                      const coachCode = `COACH-CBTC-0${idx + 1}`;
                      const serverExisting = (state.coachAttendances || []).find(
                        (ca) => ca.sessionId === activeSession.id && ca.coachId === coach.id
                      );
                      const offlineQueuedCoach = offlineQueue.find(
                        (q) =>
                          q.sessionId === activeSession.id &&
                          q.entityType === 'COACH_SINGLE' &&
                          q.targetId === coach.id
                      );
                      const existing = offlineQueuedCoach
                        ? {
                            id: offlineQueuedCoach.id,
                            status: offlineQueuedCoach.status,
                            checkInAt: offlineQueuedCoach.queuedAt,
                            checkOutAt: null,
                            checkInMethod: `${offlineQueuedCoach.sourceOrMethod} (OFFLINE)`,
                            digitalSignatureHash: 'PENDING-SYNC-LOCALSTORAGE',
                          }
                        : serverExisting;
                      const isPrimarySessionCoach = activeSession.coachId === coach.id;

                      return (
                        <tr
                          key={coach.id}
                          className={`hover:bg-slate-800/30 ${
                            isPrimarySessionCoach ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-100">{coach.fullName}</div>
                            <div className="font-mono text-xs text-amber-400">
                              {coachCode} • {coach.licenseLevel}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">
                            {isPrimarySessionCoach ? (
                              <span className="text-amber-300 font-bold">
                                PELATIH UTAMA SESI INI
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                {coach.isHeadCoach ? 'HEAD COACH' : 'ASSISTANT / SUB COACH'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {existing ? (
                              <StatusText status={existing.status} />
                            ) : (
                              <span className="font-mono text-xs text-slate-500">
                                BELUM CHECK-IN
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-300">
                            {existing ? (
                              <div>
                                <div>
                                  IN: {new Date(existing.checkInAt).toLocaleTimeString('id-ID')} ({existing.checkInMethod})
                                </div>
                                <div className="text-slate-400">
                                  OUT:{' '}
                                  {existing.checkOutAt
                                    ? new Date(existing.checkOutAt).toLocaleTimeString('id-ID')
                                    : 'Masih Mengajar'}
                                </div>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-emerald-400">
                            {existing?.digitalSignatureHash || '-'}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setDigitalPassModal({
                                    type: 'COACH',
                                    id: coach.id,
                                    code: coachCode,
                                    name: coach.fullName,
                                    subtitle: `${coach.licenseLevel} • ${coach.specialization}`,
                                    branchId: activeSession.branchId,
                                  })
                                }
                                className="px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                              >
                                <QrCode className="w-3 h-3" />
                                <span>QR Card</span>
                              </button>

                              {canRecordAttendance && (
                                <>
                                  {(
                                    ['PRESENT', 'LATE', 'SUBSTITUTE', 'EXCUSED', 'ABSENT'] as const
                                  ).map((st) => (
                                    <button
                                      key={st}
                                      type="button"
                                      onClick={() =>
                                        handleMarkCoachAttendance(
                                          activeSession.id,
                                          coach.id,
                                          activeSession.branchId,
                                          st
                                        )
                                      }
                                      className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors ${
                                        existing?.status === st
                                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                                      }`}
                                    >
                                      {st === 'SUBSTITUTE' ? 'SUB' : st}
                                    </button>
                                  ))}

                                  {existing &&
                                    ['PRESENT', 'LATE', 'SUBSTITUTE'].includes(existing.status) &&
                                    !existing.checkOutAt && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleCoachCheckOut(existing.id, coach.fullName)
                                        }
                                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1"
                                      >
                                        <LogOut className="w-3 h-3" />
                                        <span>Check-Out</span>
                                      </button>
                                    )}
                                </>
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
          )}

          {/* =================================================================== */}
          {/* SECTION 2: TERMINAL PRESENSI DIGITAL PEMAIN / ATLET                 */}
          {/* =================================================================== */}
          {activeSession && (attendanceMode === 'all' || attendanceMode === 'player') && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/80">
                <div>
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-slate-100">
                      2. Terminal Presensi Digital Pemain / Atlet (Player Digital QR & Roster Check-In)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pemindaian Kartu QR Member Atlet atau pencatatan kehadiran digital real-time oleh Coach/Admin dengan proteksi anti-duplikasi.
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-slate-400 mr-1">Sumber Input:</span>
                  {(['QR', 'COACH', 'ADMIN'] as const).map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setAttendanceSource(src)}
                      className={`px-3 py-1 text-[11px] font-mono rounded border flex items-center gap-1 ${
                        attendanceSource === src
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                          : 'bg-slate-950 text-slate-300 border-slate-800'
                      }`}
                    >
                      {src === 'QR' && <QrCode className="w-3 h-3" />}
                      {src === 'COACH' && <CheckCircle2 className="w-3 h-3" />}
                      <span>{src}</span>
                    </button>
                  ))}
                </div>
              </div>

              {canRecordAttendance && (
                <div className="p-4 border-b border-slate-800 bg-slate-950/50 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <form
                      onSubmit={handleQrCheckIn}
                      className="flex items-center gap-2 flex-1 max-w-xl"
                    >
                      <QrCode className="w-4 h-4 text-amber-400 shrink-0" />
                      <input
                        type="text"
                        value={qrCodeInput}
                        onChange={(e) => setQrCodeInput(e.target.value)}
                        placeholder="Scan / ketik Kode Member QR Pemain (contoh: CBTC-2026-1001) lalu Enter..."
                        className="flex-1 px-3 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-100 placeholder:text-slate-500"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded whitespace-nowrap"
                      >
                        Scan QR Pemain
                      </button>
                    </form>

                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        const sessionAthletes = state.athletes
                          .filter(
                            (a) =>
                              !activeSession.teamId ||
                              a.teamId === activeSession.teamId ||
                              a.branchId === activeSession.branchId
                          )
                          .map((a) => a.id);
                        handleBulkPresent(
                          activeSession.id,
                          activeSession.branchId,
                          sessionAthletes
                        );
                      }}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Check-In Digital Semua Pemain (Bulk PRESENT)</span>
                    </button>
                  </div>

                  {/* Quick-Scan Chips for Roster Players */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-400">Quick Scan QR Pemain:</span>
                    {state.athletes
                      .filter(
                        (a) =>
                          !activeSession.teamId ||
                          a.teamId === activeSession.teamId ||
                          a.branchId === activeSession.branchId
                      )
                      .map((ath) => (
                        <button
                          key={ath.id}
                          type="button"
                          onClick={() =>
                            handleMarkAttendance(
                              activeSession.id,
                              ath.id,
                              activeSession.branchId,
                              'PRESENT'
                            )
                          }
                          className="px-2.5 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded flex items-center gap-1"
                        >
                          <QrCode className="w-3 h-3 text-amber-400" />
                          <span>
                            {ath.memberCode} ({ath.fullName.split(' ')[0]})
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                      <th className="py-3 px-4">Atlet & Kode Member QR</th>
                      <th className="py-3 px-4">Posisi & Jersey</th>
                      <th className="py-3 px-4">Status Presensi Sesi</th>
                      <th className="py-3 px-4">Metode Digital & Waktu</th>
                      <th className="py-3 px-4 text-right">Kartu QR & Catat Status Digital</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {state.athletes
                      .filter(
                        (a) =>
                          !activeSession.teamId ||
                          a.teamId === activeSession.teamId ||
                          a.branchId === activeSession.branchId
                      )
                      .map((athlete) => {
                        const serverExisting = state.attendances.find(
                          (att) =>
                            att.sessionId === activeSession.id && att.athleteId === athlete.id
                        );
                        const offlineQueuedAthlete = offlineQueue.find(
                          (q) =>
                            q.sessionId === activeSession.id &&
                            q.entityType === 'ATHLETE_SINGLE' &&
                            q.targetId === athlete.id
                        );
                        const existing = offlineQueuedAthlete
                          ? {
                              id: offlineQueuedAthlete.id,
                              sessionId: activeSession.id,
                              athleteId: athlete.id,
                              status: offlineQueuedAthlete.status,
                              source: `${offlineQueuedAthlete.sourceOrMethod} • LOCALSTORAGE`,
                              recordedAt: offlineQueuedAthlete.queuedAt,
                            }
                          : serverExisting;
                        return (
                          <tr key={athlete.id} className="hover:bg-slate-800/30">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-100">{athlete.fullName}</div>
                              <div className="font-mono text-xs text-amber-400">
                                {athlete.memberCode}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-300">
                              {athlete.position} • #{athlete.jerseyNumber}
                            </td>
                            <td className="py-3 px-4">
                              {existing ? (
                                <StatusText status={existing.status} />
                              ) : (
                                <span className="font-mono text-xs text-slate-500">
                                  BELUM CHECK-IN
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-400">
                              {existing
                                ? `${existing.source} • ${new Date(existing.recordedAt).toLocaleTimeString('id-ID')}`
                                : '-'}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDigitalPassModal({
                                      type: 'ATHLETE',
                                      id: athlete.id,
                                      code: athlete.memberCode,
                                      name: athlete.fullName,
                                      subtitle: `Posisi ${athlete.position} • Jersey #${athlete.jerseyNumber}`,
                                      branchId: activeSession.branchId,
                                    })
                                  }
                                  className="px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                                >
                                  <QrCode className="w-3 h-3" />
                                  <span>QR Pass</span>
                                </button>

                                {canRecordAttendance ? (
                                  <div className="inline-flex items-center gap-1">
                                    {(['PRESENT', 'LATE', 'EXCUSED', 'SICK', 'ABSENT'] as const).map(
                                      (st) => (
                                        <button
                                          key={st}
                                          type="button"
                                          onClick={() =>
                                            handleMarkAttendance(
                                              activeSession.id,
                                              athlete.id,
                                              activeSession.branchId,
                                              st
                                            )
                                          }
                                          className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors ${
                                            existing?.status === st
                                              ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                                          }`}
                                        >
                                          {st}
                                        </button>
                                      )
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-500">Read-only</span>
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
          )}

          {/* =================================================================== */}
          {/* SECTION 3: TERMINAL PRESENSI DIGITAL STAF LAINNYA                   */}
          {/* =================================================================== */}
          {activeSession && (attendanceMode === 'all' || attendanceMode === 'staff') && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/80">
                <div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-slate-100">
                      3. Terminal Presensi Digital Staf Akademi (Medis, Operasional, Finance & Admin)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pencatatan kehadiran digital staf pendukung menggunakan Kartu QR Staf beserta Signature Hash verifikasi.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-mono text-slate-400">Quick Scan QR Staf:</span>
                  {state.staff.map((stf) => (
                    <button
                      key={stf.id}
                      type="button"
                      onClick={() =>
                        handleMarkStaffAttendance(
                          activeSession.id,
                          stf.id,
                          activeSession.branchId,
                          'PRESENT',
                          'DIGITAL_QR'
                        )
                      }
                      className="px-2.5 py-1 text-[11px] font-mono bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                    >
                      <QrCode className="w-3 h-3" />
                      <span>
                        {stf.staffCode} ({stf.fullName.split(' ')[0]})
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                      <th className="py-3 px-4">Staf & Kode QR</th>
                      <th className="py-3 px-4">Departemen & Jabatan</th>
                      <th className="py-3 px-4">Status Presensi</th>
                      <th className="py-3 px-4">Waktu Check-In / Check-Out</th>
                      <th className="py-3 px-4">Signature Hash</th>
                      <th className="py-3 px-4 text-right">Aksi Presensi Digital Staf</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {state.staff.map((stf, idx) => {
                      const code = stf.staffCode || `STF-CBTC-0${idx + 1}`;
                      const serverExisting = (state.staffAttendances || []).find(
                        (sa) => sa.sessionId === activeSession.id && sa.staffId === stf.id
                      );
                      const offlineQueuedStaff = offlineQueue.find(
                        (q) =>
                          q.sessionId === activeSession.id &&
                          q.entityType === 'STAFF_SINGLE' &&
                          q.targetId === stf.id
                      );
                      const existing = offlineQueuedStaff
                        ? {
                            id: offlineQueuedStaff.id,
                            status: offlineQueuedStaff.status,
                            checkInAt: offlineQueuedStaff.queuedAt,
                            checkOutAt: null,
                            checkInMethod: `${offlineQueuedStaff.sourceOrMethod} (OFFLINE)`,
                            digitalSignatureHash: 'PENDING-SYNC-LOCALSTORAGE',
                          }
                        : serverExisting;
                      return (
                        <tr key={stf.id} className="hover:bg-slate-800/30">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-100">{stf.fullName}</div>
                            <div className="font-mono text-xs text-amber-400">{code}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-300">
                            <span className="font-mono text-amber-300">{stf.department}</span> •{' '}
                            {stf.positionTitle}
                          </td>
                          <td className="py-3 px-4">
                            {existing ? (
                              <StatusText status={existing.status} />
                            ) : (
                              <span className="font-mono text-xs text-slate-500">
                                BELUM CHECK-IN
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-300">
                            {existing ? (
                              <div>
                                <div>
                                  IN: {new Date(existing.checkInAt).toLocaleTimeString('id-ID')} ({existing.checkInMethod})
                                </div>
                                <div className="text-slate-400">
                                  OUT:{' '}
                                  {existing.checkOutAt
                                    ? new Date(existing.checkOutAt).toLocaleTimeString('id-ID')
                                    : 'Bertugas'}
                                </div>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-emerald-400">
                            {existing?.digitalSignatureHash || '-'}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {canRecordAttendance && (
                                <>
                                  {(
                                    ['PRESENT', 'LATE', 'ON_DUTY', 'EXCUSED', 'ABSENT'] as const
                                  ).map((st) => (
                                    <button
                                      key={st}
                                      type="button"
                                      onClick={() =>
                                        handleMarkStaffAttendance(
                                          activeSession.id,
                                          stf.id,
                                          activeSession.branchId,
                                          st
                                        )
                                      }
                                      className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors ${
                                        existing?.status === st
                                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                                      }`}
                                    >
                                      {st}
                                    </button>
                                  ))}
                                  {existing &&
                                    ['PRESENT', 'LATE', 'ON_DUTY'].includes(existing.status) &&
                                    !existing.checkOutAt && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStaffCheckOut(existing.id, stf.fullName)
                                        }
                                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1"
                                      >
                                        <LogOut className="w-3 h-3" />
                                        <span>Check-Out</span>
                                      </button>
                                    )}
                                </>
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
          )}

          {/* =================================================================== */}
          {/* SECTION 4: KATALOG & PORTAL KARTU QR (PEMAIN, PELATIH & STAF)       */}
          {/* =================================================================== */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-amber-400" />
                  <span>
                    Portal Kartu ID & Kode QR Digital (Dapat Dilihat & Diunduh oleh Tiap Pemain, Pelatih & Staf)
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pilih tab Kartu QR Saya, Kartu QR Pemain, Kartu QR Pelatih, atau Kartu QR Staf Lainnya untuk melihat kode QR visual masing-masing personel.
                </p>
              </div>
            </div>
            <DigitalQrPassHub
              state={state}
              onRefresh={onRefresh}
              notify={notify}
              defaultTab="my_card"
              activeSessionId={activeSession?.id}
            />
          </div>

          {/* MODAL: DIGITAL QR ID PASS FOR COACH OR ATHLETE */}
          <Modal
            open={Boolean(digitalPassModal)}
            onClose={() => setDigitalPassModal(null)}
            title={
              digitalPassModal?.type === 'COACH'
                ? 'Kartu ID & QR Pass Presensi Digital Pelatih (Coach)'
                : 'Kartu ID & QR Pass Presensi Digital Pemain (Atlet)'
            }
            subtitle="Gunakan QR Pass ini pada Terminal Kiosk Lapangan atau Scan Cepat Sesi Latihan."
          >
            {digitalPassModal && (
              <div className="space-y-4">
                <div className="p-5 rounded-lg border border-slate-800 bg-slate-950 text-center space-y-3">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400">
                    ZAMOA CBTC BASKETBALL ACADEMY • DIGITAL PASS
                  </div>
                  <DigitalQrMatrixSvg code={digitalPassModal.code} />
                  <div>
                    <div className="text-base font-bold text-slate-100">
                      {digitalPassModal.name}
                    </div>
                    <div className="text-xs font-mono text-amber-400 mt-0.5">
                      {digitalPassModal.code}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{digitalPassModal.subtitle}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDigitalPassModal(null)}
                    className="px-3 py-2 text-xs text-slate-300 border border-slate-700 rounded"
                  >
                    Tutup
                  </button>
                  {activeSession && canRecordAttendance && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (digitalPassModal.type === 'COACH') {
                          await handleMarkCoachAttendance(
                            activeSession.id,
                            digitalPassModal.id,
                            digitalPassModal.branchId,
                            'PRESENT',
                            'DIGITAL_QR'
                          );
                        } else {
                          await handleMarkAttendance(
                            activeSession.id,
                            digitalPassModal.id,
                            digitalPassModal.branchId,
                            'PRESENT'
                          );
                        }
                        setDigitalPassModal(null);
                      }}
                      className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Simulasikan Scan QR Sekarang (Check-In PRESENT)</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </Modal>
        </div>
      )}

      {/* SUBTAB: PLAYER DEVELOPMENT & EVALUATIONS */}
      {subTab === 'development' && (
        <div className="space-y-6">
          {/* MONTHLY ATHLETE REPORT CARD & AUTO-EMAIL PARENT HUB */}
          <MonthlyAthleteReportHub
            state={state}
            onRefresh={onRefresh}
            notify={notify}
            onOpenInputEvaluationModal={canCreateEval ? () => setModalType('evaluation') : undefined}
          />

          {/* Configurable Assessment Criteria Matrix */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-1">
              Indikator Penilaian Terkonfigurasi (Configurable Assessment Criteria)
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Digunakan untuk menghitung skor rata-rata Technical, Physical, Mental, dan Overall secara dinamis.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['TECHNICAL', 'PHYSICAL', 'MENTAL'] as const).map((cat) => (
                <div key={cat} className="p-3.5 rounded border border-slate-800 bg-slate-950/50">
                  <div className="text-xs font-mono font-bold text-amber-400 mb-2">{cat}</div>
                  <div className="space-y-1.5">
                    {state.assessmentCriteria
                      .filter((c) => c.category === cat)
                      .map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between text-xs text-slate-200"
                        >
                          <span>{c.name}</span>
                          <span className="font-mono text-slate-400">
                            Skala {c.minScore}-{c.maxScore} (Bobot {c.weight})
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evaluations List */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">Rapor Evaluasi Perkembangan Atlet</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Tanggal & Periode</th>
                    <th className="py-3 px-4">Atlet</th>
                    <th className="py-3 px-4">Pelatih Penilai</th>
                    <th className="py-3 px-4">Tech / Phys / Mental</th>
                    <th className="py-3 px-4">Skor Akhir</th>
                    <th className="py-3 px-4">Rekomendasi Pelatih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {state.playerEvaluations.map((ev) => {
                    const athlete = state.athletes.find((a) => a.id === ev.athleteId);
                    const coach = state.coaches.find((c) => c.id === ev.coachId);
                    return (
                      <tr key={ev.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-mono text-xs text-slate-200">
                          <div>{ev.evaluationDate}</div>
                          <div className="text-slate-400">{ev.periodLabel}</div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-100">
                          {athlete?.fullName || '-'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-300">
                          {coach?.fullName || '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-200">
                          T: {ev.technicalAvg} • P: {ev.physicalAvg} • M: {ev.mentalAvg}
                        </td>
                        <td className="py-3 px-4 font-mono text-sm font-bold text-amber-400">
                          {ev.overallScore}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-300 max-w-md">
                          {ev.coachRecommendation}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Player Goals */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">
              Target Perkembangan Individual Atlet (Player Goals)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {state.playerGoals.map((g) => {
                const athlete = state.athletes.find((a) => a.id === g.athleteId);
                return (
                  <div
                    key={g.id}
                    className="p-3.5 rounded border border-slate-800 bg-slate-950/50 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-xs font-mono text-amber-400">
                        {athlete?.fullName || 'Atlet'} • {g.category}
                      </div>
                      <div className="text-sm font-semibold text-slate-100">{g.title}</div>
                      <div className="text-xs text-slate-400">
                        Target: {g.targetMetric} (Batas: {g.targetDate})
                      </div>
                    </div>
                    <div className="text-right space-y-1.5">
                      <div className="font-mono text-sm font-bold text-slate-100">
                        {g.currentProgress}%
                      </div>
                      <StatusText status={g.status} />
                      {canCreateEval && g.status !== 'ACHIEVED' && (
                        <div className="flex items-center justify-end gap-1 pt-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateGoalProgress(g.id, g.currentProgress + 25)}
                            className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded"
                          >
                            +25%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateGoalProgress(g.id, 100)}
                            className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded"
                          >
                            100%
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB: TEAMS & AGE GROUPS */}
      {subTab === 'teams' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Kelompok Umur (Age Groups)</h3>
            <div className="space-y-2.5">
              {state.ageGroups.map((ag) => (
                <div
                  key={ag.id}
                  className="p-3 rounded border border-slate-800 bg-slate-950/50 flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-mono text-amber-400">{ag.code}</div>
                    <div className="text-sm font-semibold text-slate-100">{ag.name}</div>
                    <div className="text-xs text-slate-400">{ag.description || '-'}</div>
                  </div>
                  <div className="font-mono text-xs text-slate-300">
                    {ag.minAge} - {ag.maxAge} Thn
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">Daftar Tim Akademi</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                    <th className="py-3 px-4">Kode & Nama Tim</th>
                    <th className="py-3 px-4">Kelompok Umur & Divisi</th>
                    <th className="py-3 px-4">Head Coach</th>
                    <th className="py-3 px-4">Jumlah Atlet</th>
                    <th className="py-3 px-4">Season</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {state.teams.map((t) => {
                    const ag = state.ageGroups.find((g) => g.id === t.ageGroupId);
                    const coach = state.coaches.find((c) => c.id === t.headCoachId);
                    const memberCount = state.athletes.filter((a) => a.teamId === t.id).length;
                    return (
                      <tr key={t.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4">
                          <div className="font-mono text-xs text-amber-400">{t.code}</div>
                          <div className="font-semibold text-slate-100">{t.name}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-300">
                          {ag?.name || '-'} • {t.genderDivision}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-300">
                          {coach?.fullName || 'Belum ditentukan'}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-200">
                          {memberCount} Atlet
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-400">{t.season}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SCHEDULE TRAINING SESSION */}
      <Modal
        open={modalType === 'session'}
        onClose={() => setModalType(null)}
        title="Formulir Input Sesi Latihan Baru"
        subtitle="Pilih cabang, tim, pelatih, kurikulum, dan jadwal waktu lapangan. Mendukung deteksi bentrok jadwal & pengingat WhatsApp otomatis."
      >
        {(() => {
          const scopedModalTeams = filterSessionModalByBranch
            ? state.teams.filter((t) => t.branchId === sessionForm.branchId)
            : state.teams;
          const availableTeams =
            scopedModalTeams.length > 0 ? scopedModalTeams : state.teams;

          const scopedModalCoaches = filterSessionModalByBranch
            ? state.coaches.filter((c) => c.branchId === sessionForm.branchId)
            : state.coaches;
          const availableCoaches =
            scopedModalCoaches.length > 0 ? scopedModalCoaches : state.coaches;

          const scopedModalPrograms = filterSessionModalByBranch
            ? state.trainingPrograms.filter((p) => p.branchId === sessionForm.branchId)
            : state.trainingPrograms;
          const availablePrograms =
            scopedModalPrograms.length > 0 ? scopedModalPrograms : state.trainingPrograms;

          const selectedBranchObj = state.branches.find((b) => b.id === sessionForm.branchId);
          const selectedTeamObj = state.teams.find((t) => t.id === sessionForm.teamId);
          const selectedCoachObj = state.coaches.find((c) => c.id === sessionForm.coachId);
          const selectedProgramObj = state.trainingPrograms.find(
            (p) => p.id === sessionForm.programId
          );

          const teamRosterAthletes = state.athletes.filter(
            (a) => a.teamId === sessionForm.teamId && a.membershipStatus === 'ACTIVE'
          );

          // Compute session duration in minutes
          const parseMinutes = (hhmm: string) => {
            const [h, m] = (hhmm || '00:00').split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
          };
          const startMins = parseMinutes(sessionForm.startTime);
          const endMins = parseMinutes(sessionForm.endTime);
          const durationMinutes = Math.max(0, endMins - startMins);

          // Detect court schedule conflict on the same date & court
          const conflictingSessions = state.trainingSessions.filter((existing) => {
            if ((existing.status || '').toUpperCase() === 'CANCELLED') return false;
            if ((existing.sessionDate || '').slice(0, 10) !== sessionForm.sessionDate) return false;
            if (
              (existing.courtName || '').trim().toLowerCase() !==
              (sessionForm.courtName || '').trim().toLowerCase()
            ) {
              return false;
            }
            const exStart = parseMinutes(existing.startTime);
            const exEnd = parseMinutes(existing.endTime);
            return startMins < exEnd && endMins > exStart;
          });

          return (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (durationMinutes <= 0) {
                  notify('Jam selesai harus lebih besar daripada jam mulai latihan.', 'error');
                  return;
                }
                setSubmitting(true);
                try {
                  const res = await apiRequest<{
                    id?: string;
                    waDispatchedCount?: number;
                    whatsappDispatchedCount?: number;
                  }>('/api/training-sessions', {
                    method: 'POST',
                    body: JSON.stringify({
                      ...sessionForm,
                      sendWaReminder: sessionForm.autoSendWhatsAppReminder,
                    }),
                  });
                  const waSent = res?.waDispatchedCount ?? res?.whatsappDispatchedCount ?? 0;
                  if (waSent > 0) {
                    notify(
                      `Sesi latihan "${sessionForm.topic}" berhasil dijadwalkan & Gateway WhatsApp mengirim ${waSent} pengingat otomatis ke nomor WA Orang Tua.`
                    );
                  } else {
                    notify(
                      `Sesi latihan "${sessionForm.topic}" berhasil dijadwalkan untuk ${
                        selectedTeamObj?.name || 'Tim'
                      }.`
                    );
                  }
                  if (res?.id) {
                    setSelectedSessionId(res.id);
                  }
                  setModalType(null);
                  await onRefresh();
                } catch (err: unknown) {
                  notify(
                    err instanceof Error ? err.message : 'Gagal menjadwalkan sesi latihan',
                    'error'
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
              className="space-y-4"
            >
              {/* Top Context & Branch Filter Toggle */}
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-amber-400 font-semibold">
                    {selectedBranchObj?.code || 'CBTC'}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-200 font-medium">
                    {selectedTeamObj?.name || 'Pilih Tim'} ({teamRosterAthletes.length} Atlet Aktif)
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-emerald-400 font-mono">
                    {selectedCoachObj?.fullName || 'Pilih Pelatih'}
                  </span>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={filterSessionModalByBranch}
                    onChange={(e) => setFilterSessionModalByBranch(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span>Filter Tim &amp; Pelatih Sesuai Cabang</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. CABANG */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    1. Cabang Akademi *
                  </label>
                  <select
                    value={sessionForm.branchId}
                    onChange={(e) => handleSessionBranchChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  >
                    {state.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        [{b.code}] {b.name} — {b.city} ({b.courtsCount} Lapangan)
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. TIM */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    2. Tim Akademi *
                  </label>
                  <select
                    value={sessionForm.teamId}
                    onChange={(e) => {
                      const nextTeamId = e.target.value;
                      const teamObj = state.teams.find((t) => t.id === nextTeamId);
                      setSessionForm((prev) => ({
                        ...prev,
                        teamId: nextTeamId,
                        coachId: teamObj?.headCoachId || prev.coachId,
                      }));
                    }}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  >
                    {availableTeams.map((t) => {
                      const rosterCnt = state.athletes.filter(
                        (a) => a.teamId === t.id && a.membershipStatus === 'ACTIVE'
                      ).length;
                      return (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.code}) • {t.genderDivision} • {rosterCnt} Atlet
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 3. PELATIH BERTUGAS */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    3. Pelatih Bertugas *
                  </label>
                  <select
                    value={sessionForm.coachId}
                    onChange={(e) => setSessionForm({ ...sessionForm, coachId: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  >
                    {availableCoaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.licenseLevel}) — {c.specialization}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. PROGRAM KURIKULUM LATIHAN */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    4. Program Kurikulum Latihan *
                  </label>
                  <select
                    value={sessionForm.programId}
                    onChange={(e) => setSessionForm({ ...sessionForm, programId: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  >
                    {availablePrograms.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] {p.name} ({p.sessionsPerWeek}x/Minggu)
                      </option>
                    ))}
                  </select>
                  {selectedProgramObj && (
                    <div className="text-[11px] text-slate-400 mt-1 truncate">
                      Fokus: {selectedProgramObj.focusArea}
                    </div>
                  )}
                </div>

                {/* 5. TANGGAL LATIHAN */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      5. Tanggal Latihan *
                    </label>
                    <div className="flex items-center gap-1">
                      {[
                        { label: 'Hari Ini', date: '2026-10-01' },
                        { label: 'Besok', date: '2026-10-02' },
                        { label: 'Sabtu', date: '2026-10-03' },
                      ].map((dPreset) => (
                        <button
                          key={dPreset.date}
                          type="button"
                          onClick={() =>
                            setSessionForm({ ...sessionForm, sessionDate: dPreset.date })
                          }
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                            sessionForm.sessionDate === dPreset.date
                              ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          {dPreset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="date"
                    required
                    value={sessionForm.sessionDate}
                    onChange={(e) => setSessionForm({ ...sessionForm, sessionDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>

                {/* 6. LAPANGAN (COURT) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    6. Lapangan (Court) *
                  </label>
                  <input
                    type="text"
                    required
                    value={sessionForm.courtName}
                    onChange={(e) => setSessionForm({ ...sessionForm, courtName: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[
                      'Court A (Main FIBA Wood Flooring)',
                      'Court B (Development Indoor)',
                      'Court C (Bandung Arena Indoor)',
                      'Court D (East Hub Surabaya)',
                    ].map((cName) => (
                      <button
                        key={cName}
                        type="button"
                        onClick={() => setSessionForm({ ...sessionForm, courtName: cName })}
                        className={`px-2 py-0.5 text-[10px] font-mono rounded border ${
                          sessionForm.courtName === cName
                            ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {cName.split(' (')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 7. JADWAL WAKTU (JAM MULAI & JAM SELESAI + PRESETS) */}
                <div className="sm:col-span-2 p-3 rounded-lg border border-slate-800 bg-slate-950/60 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-200">
                      7. Jadwal Waktu Sesi &amp; Durasi Lapangan ({durationMinutes} Menit)
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {[
                        { label: 'Pagi 08:00–10:00', start: '08:00', end: '10:00' },
                        { label: 'Siang 14:00–16:00', start: '14:00', end: '16:00' },
                        { label: 'Sore 16:00–18:00', start: '16:00', end: '18:00' },
                        { label: 'Malam 18:30–20:30', start: '18:30', end: '20:30' },
                      ].map((slot) => {
                        const activeSlot =
                          sessionForm.startTime === slot.start &&
                          sessionForm.endTime === slot.end;
                        return (
                          <button
                            key={slot.label}
                            type="button"
                            onClick={() =>
                              setSessionForm({
                                ...sessionForm,
                                startTime: slot.start,
                                endTime: slot.end,
                              })
                            }
                            className={`px-2 py-0.5 text-[10px] font-mono rounded border ${
                              activeSlot
                                ? 'bg-emerald-500 text-slate-950 border-emerald-500 font-bold'
                                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            {slot.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Jam Mulai (WIB) *
                      </label>
                      <input
                        type="time"
                        required
                        value={sessionForm.startTime}
                        onChange={(e) =>
                          setSessionForm({ ...sessionForm, startTime: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm font-mono bg-slate-900 border border-slate-800 rounded text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Jam Selesai (WIB) *
                      </label>
                      <input
                        type="time"
                        required
                        value={sessionForm.endTime}
                        onChange={(e) =>
                          setSessionForm({ ...sessionForm, endTime: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm font-mono bg-slate-900 border border-slate-800 rounded text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Status Awal Sesi
                      </label>
                      <select
                        value={sessionForm.status}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            status: e.target.value as 'SCHEDULED' | 'ONGOING',
                          })
                        }
                        className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-800 rounded text-slate-100"
                      >
                        <option value="SCHEDULED">SCHEDULED (Terjadwal)</option>
                        <option value="ONGOING">ONGOING (Sedang Berlangsung)</option>
                      </select>
                    </div>
                  </div>

                  {/* Court Availability / Conflict Check */}
                  {conflictingSessions.length > 0 ? (
                    <div className="p-2.5 rounded border border-amber-500/40 bg-amber-950/25 text-xs text-amber-300">
                      Perhatian: Terdapat {conflictingSessions.length} sesi lain di{' '}
                      <strong>{sessionForm.courtName}</strong> pada tanggal{' '}
                      <span className="font-mono">{sessionForm.sessionDate}</span> yang beririsan
                      waktu ({conflictingSessions[0].startTime}–{conflictingSessions[0].endTime}:{' '}
                      {conflictingSessions[0].topic}).
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        Slot Lapangan Tersedia: {sessionForm.courtName} pada{' '}
                        {sessionForm.sessionDate} ({sessionForm.startTime}–{sessionForm.endTime}{' '}
                        WIB)
                      </span>
                    </div>
                  )}
                </div>

                {/* 8. TOPIK LATIHAN */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    8. Topik &amp; Materi Utama Latihan *
                  </label>
                  <input
                    type="text"
                    required
                    value={sessionForm.topic}
                    onChange={(e) => setSessionForm({ ...sessionForm, topic: e.target.value })}
                    placeholder="Contoh: Pick & Roll Defense + Fastbreak Finishing"
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[
                      'Pick & Roll Defense + Fastbreak Finishing',
                      'Fundamental Ball Handling & Perimeter Shooting',
                      'Full-Court Press Break & Motion Offense',
                      'Scrimmage Game 5v5 & Tactical Evaluation',
                    ].map((presetTopic) => (
                      <button
                        key={presetTopic}
                        type="button"
                        onClick={() => setSessionForm({ ...sessionForm, topic: presetTopic })}
                        className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                      >
                        + {presetTopic}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 9. CATATAN DRILL & INSTRUKSI PELATIH */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    9. Catatan Drill &amp; Kebutuhan Peralatan Lapangan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={sessionForm.trainingNotes}
                    onChange={(e) =>
                      setSessionForm({ ...sessionForm, trainingNotes: e.target.value })
                    }
                    placeholder="Contoh: Siapkan 12 bola FIBA size 7, rompi scrimmage 2 warna, dan shot clock 24 detik..."
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>

                {/* 10. WHATSAPP REMINDER CHECKBOX */}
                <div className="sm:col-span-2 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sessionForm.autoSendWhatsAppReminder}
                      onChange={(e) =>
                        setSessionForm({
                          ...sessionForm,
                          autoSendWhatsAppReminder: e.target.checked,
                        })
                      }
                      className="mt-0.5 accent-emerald-500"
                    />
                    <div>
                      <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>
                          Kirim Otomatis Pengingat Jadwal Latihan ke Nomor WhatsApp Orang Tua Tim saat Disimpan
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Gateway WhatsApp ZAMOA CBTC akan langsung mengirimkan detail tanggal, jam, lokasi lapangan, dan pelatih ke nomor WA seluruh orang tua atlet dalam tim{' '}
                        <strong className="text-slate-200">
                          {selectedTeamObj?.name || 'terpilih'}
                        </strong>
                        .
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 text-xs text-slate-300 border border-slate-700 rounded hover:bg-slate-900"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded transition-colors"
                >
                  {submitting ? 'Menyimpan Jadwal Sesi...' : 'Simpan & Jadwalkan Sesi Latihan'}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* MODAL: INPUT PLAYER EVALUATION */}
      <Modal
        open={modalType === 'evaluation'}
        onClose={() => setModalType(null)}
        title="Input Rapor Bulanan Atlet & Auto-Email Orang Tua"
        subtitle="Skor Teknis, Fisik, Mental & Kehadiran dikompilasi otomatis dari database dan dikirim ke email orang tua."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            try {
              const res = await apiRequest<{
                emailReportDispatched?: {
                  recipientEmail: string;
                  attendanceStats?: { attendanceRatePct: number };
                } | null;
              }>('/api/evaluations', {
                method: 'POST',
                body: JSON.stringify(evalForm),
              });
              if (res?.emailReportDispatched?.recipientEmail) {
                notify(
                  `Rapor Bulanan Atlet berhasil disimpan & dikirim otomatis ke email orang tua (${res.emailReportDispatched.recipientEmail}).`
                );
              } else {
                notify('Rapor evaluasi perkembangan atlet berhasil disimpan dan notifikasi dikirim.');
              }
              setModalType(null);
              await onRefresh();
            } catch (err: unknown) {
              notify(err instanceof Error ? err.message : 'Gagal menyimpan evaluasi', 'error');
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Atlet *</label>
              <select
                value={evalForm.athleteId}
                onChange={(e) => setEvalForm({ ...evalForm, athleteId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                {state.athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName} ({a.memberCode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Pelatih Penilai *</label>
              <select
                value={evalForm.coachId}
                onChange={(e) => setEvalForm({ ...evalForm, coachId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                {state.coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Periode Evaluasi *</label>
              <input
                type="text"
                required
                value={evalForm.periodLabel}
                onChange={(e) => setEvalForm({ ...evalForm, periodLabel: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tanggal Evaluasi *</label>
              <input
                type="date"
                required
                value={evalForm.evaluationDate}
                onChange={(e) => setEvalForm({ ...evalForm, evaluationDate: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3">
            <div className="text-xs font-mono uppercase text-amber-400 mb-2">
              Skor Indikator (1 - 10)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {state.assessmentCriteria.map((c) => (
                <div key={c.id} className="p-2 rounded border border-slate-800 bg-slate-950">
                  <label className="block text-[11px] text-slate-300 truncate">{c.name}</label>
                  <input
                    type="number"
                    min={c.minScore}
                    max={c.maxScore}
                    value={evalForm.scores[c.code] ?? 8}
                    onChange={(e) =>
                      setEvalForm({
                        ...evalForm,
                        scores: { ...evalForm.scores, [c.code]: Number(e.target.value) },
                      })
                    }
                    className="w-full mt-1 px-2 py-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-amber-300"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Rekomendasi & Catatan Perkembangan Pelatih *
            </label>
            <textarea
              required
              rows={3}
              value={evalForm.coachRecommendation}
              onChange={(e) => setEvalForm({ ...evalForm, coachRecommendation: e.target.value })}
              placeholder="Tuliskan evaluasi kekuatan atlet dan area latihan yang perlu ditingkatkan..."
              className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
            />
          </div>

          {(() => {
            const selAth = state.athletes.find((a) => a.id === evalForm.athleteId);
            const pLink = (state.parentAthletes || []).find((pa) => pa.athleteId === evalForm.athleteId);
            const linkedParent = pLink
              ? (state.parents || []).find((p) => p.id === pLink.parentId)
              : undefined;
            const resolvedParentName =
              linkedParent?.fullName || selAth?.parentContactName || 'Orang Tua / Wali';
            const resolvedParentEmail =
              linkedParent?.email ||
              (selAth
                ? `${selAth.fullName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@parent.cbtc.id`
                : '');
            const athAtts = state.attendances.filter((a) => a.athleteId === evalForm.athleteId);
            const presentOrLate = athAtts.filter(
              (a) => a.status === 'PRESENT' || a.status === 'LATE'
            ).length;
            const attPct = athAtts.length > 0 ? Math.round((presentOrLate / athAtts.length) * 100) : 100;

            return (
              <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={evalForm.autoSendParentEmail}
                      onChange={(e) =>
                        setEvalForm({ ...evalForm, autoSendParentEmail: e.target.checked })
                      }
                      className="mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500"
                    />
                    <div>
                      <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        <span>
                          Kirim Otomatis Rapor Bulanan ke Email Orang Tua saat Disimpan
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Menggabungkan Skor Teknis, Fisik, Mental & Kehadiran Database ({presentOrLate}/{athAtts.length} sesi = {attPct}%) untuk dikirim ke Wali ({resolvedParentName}).
                      </div>
                    </div>
                  </label>
                </div>
                {evalForm.autoSendParentEmail && (
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Email Orang Tua Tujuan (Database: {resolvedParentEmail})
                    </label>
                    <input
                      type="email"
                      value={evalForm.recipientEmailOverride}
                      onChange={(e) =>
                        setEvalForm({ ...evalForm, recipientEmailOverride: e.target.value })
                      }
                      placeholder={resolvedParentEmail}
                      className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                    />
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalType(null)}
              className="px-4 py-2 text-xs text-slate-300 border border-slate-700 rounded"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
            >
              {evalForm.autoSendParentEmail
                ? 'Simpan & Kirim Rapor Bulanan ke Email Orang Tua'
                : 'Simpan Rapor Evaluasi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: ADD TEAM / AGE GROUP / PROGRAM / GOAL / CRITERIA */}
      <Modal
        open={
          modalType === 'team' ||
          modalType === 'age_group' ||
          modalType === 'program' ||
          modalType === 'goal' ||
          modalType === 'criteria'
        }
        onClose={() => setModalType(null)}
        title={
          modalType === 'team'
            ? 'Tambah Tim Akademi'
            : modalType === 'age_group'
            ? 'Tambah Kelompok Umur'
            : modalType === 'program'
            ? 'Tambah Program Kurikulum Latihan'
            : modalType === 'goal'
            ? 'Tambah Target Perkembangan Atlet (Player Goal)'
            : 'Tambah Indikator Penilaian Baru'
        }
      >
        {modalType === 'team' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/teams', {
                  method: 'POST',
                  body: JSON.stringify(teamForm),
                });
                notify('Tim baru berhasil ditambahkan.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal membuat tim', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kode Tim *</label>
                <input
                  type="text"
                  required
                  value={teamForm.code}
                  onChange={(e) => setTeamForm({ ...teamForm, code: e.target.value })}
                  placeholder="CBTC-U16B"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Tim *</label>
                <input
                  type="text"
                  required
                  value={teamForm.name}
                  onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                  placeholder="ZAMOA CBTC Elite U-16 Putra"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kelompok Umur *</label>
                <select
                  value={teamForm.ageGroupId}
                  onChange={(e) => setTeamForm({ ...teamForm, ageGroupId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.ageGroups.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Head Coach</label>
                <select
                  value={teamForm.headCoachId}
                  onChange={(e) => setTeamForm({ ...teamForm, headCoachId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  {state.coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
              >
                Simpan Tim
              </button>
            </div>
          </form>
        )}

        {modalType === 'age_group' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/age-groups', {
                  method: 'POST',
                  body: JSON.stringify(ageGroupForm),
                });
                notify('Kelompok umur berhasil ditambahkan.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal membuat KU', 'error');
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
                  value={ageGroupForm.code}
                  onChange={(e) => setAgeGroupForm({ ...ageGroupForm, code: e.target.value })}
                  placeholder="KU-10"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Kelompok Umur *</label>
                <input
                  type="text"
                  required
                  value={ageGroupForm.name}
                  onChange={(e) => setAgeGroupForm({ ...ageGroupForm, name: e.target.value })}
                  placeholder="Rookie U-10"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Usia Minimum *</label>
                <input
                  type="number"
                  required
                  value={ageGroupForm.minAge}
                  onChange={(e) => setAgeGroupForm({ ...ageGroupForm, minAge: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Usia Maksimum *</label>
                <input
                  type="number"
                  required
                  value={ageGroupForm.maxAge}
                  onChange={(e) => setAgeGroupForm({ ...ageGroupForm, maxAge: e.target.value })}
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

        {modalType === 'program' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/training-programs', {
                  method: 'POST',
                  body: JSON.stringify(programForm),
                });
                notify('Program latihan berhasil dibuat.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal membuat program', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kode Program *</label>
                <input
                  type="text"
                  required
                  value={programForm.code}
                  onChange={(e) => setProgramForm({ ...programForm, code: e.target.value })}
                  placeholder="PRG-ELITE-26"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Program *</label>
                <input
                  type="text"
                  required
                  value={programForm.name}
                  onChange={(e) => setProgramForm({ ...programForm, name: e.target.value })}
                  placeholder="Elite Tactical & Conditioning"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Fokus Kurikulum *</label>
                <input
                  type="text"
                  required
                  value={programForm.focusArea}
                  onChange={(e) => setProgramForm({ ...programForm, focusArea: e.target.value })}
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
                Simpan Program
              </button>
            </div>
          </form>
        )}

        {modalType === 'goal' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/player-goals', {
                  method: 'POST',
                  body: JSON.stringify(goalForm),
                });
                notify('Target perkembangan atlet berhasil dibuat.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menyimpan target', 'error');
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
                  value={goalForm.athleteId}
                  onChange={(e) => setGoalForm({ ...goalForm, athleteId: e.target.value })}
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
                <label className="block text-xs text-slate-400 mb-1">Kategori *</label>
                <select
                  value={goalForm.category}
                  onChange={(e) => setGoalForm({ ...goalForm, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="TECHNICAL">TECHNICAL</option>
                  <option value="PHYSICAL">PHYSICAL</option>
                  <option value="MENTAL">MENTAL</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Judul Target *</label>
                <input
                  type="text"
                  required
                  value={goalForm.title}
                  onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                  placeholder="Peningkatan Akurasi Perimeter Shooting"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Metrik Target *</label>
                <input
                  type="text"
                  required
                  value={goalForm.targetMetric}
                  onChange={(e) => setGoalForm({ ...goalForm, targetMetric: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Progres Saat Ini (%) *</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={goalForm.currentProgress}
                  onChange={(e) => setGoalForm({ ...goalForm, currentProgress: e.target.value })}
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
                Simpan Target
              </button>
            </div>
          </form>
        )}

        {modalType === 'criteria' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                await apiRequest('/api/assessment-criteria', {
                  method: 'POST',
                  body: JSON.stringify(criteriaForm),
                });
                notify('Indikator evaluasi baru berhasil ditambahkan.');
                setModalType(null);
                await onRefresh();
              } catch (err: unknown) {
                notify(err instanceof Error ? err.message : 'Gagal menambah indikator', 'error');
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kategori *</label>
                <select
                  value={criteriaForm.category}
                  onChange={(e) => setCriteriaForm({ ...criteriaForm, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="TECHNICAL">TECHNICAL</option>
                  <option value="PHYSICAL">PHYSICAL</option>
                  <option value="MENTAL">MENTAL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kode Indikator *</label>
                <input
                  type="text"
                  required
                  value={criteriaForm.code}
                  onChange={(e) => setCriteriaForm({ ...criteriaForm, code: e.target.value })}
                  placeholder="COURT_VISION"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Nama Indikator *</label>
                <input
                  type="text"
                  required
                  value={criteriaForm.name}
                  onChange={(e) => setCriteriaForm({ ...criteriaForm, name: e.target.value })}
                  placeholder="Court Vision & Decision Making"
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
                Simpan Indikator
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
