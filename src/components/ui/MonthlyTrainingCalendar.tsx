import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Users,
  UserCheck,
  Plus,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Layers,
  Filter,
  PlayCircle,
} from 'lucide-react';
import { SystemState } from '../../types/system.ts';
import { StatusText } from './Primitives.tsx';

interface MonthlyTrainingCalendarProps {
  state: SystemState;
  canCreateTraining: boolean;
  canProcessTraining: boolean;
  onSelectSessionForAttendance: (sessionId: string) => void;
  onUpdateSessionStatus: (
    sessionId: string,
    status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'
  ) => Promise<void>;
  onOpenScheduleModalWithPrefill: (prefill: {
    sessionDate: string;
    courtName?: string;
    branchId?: string;
    teamId?: string;
  }) => void;
}

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const DAY_HEADERS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const STANDARD_COURTS = [
  {
    name: 'Court A (Main FIBA Wood Flooring)',
    shortLabel: 'Court A • Main FIBA',
    surface: 'FIBA Maple Hardwood',
    capacity: '30 Atlet',
  },
  {
    name: 'Court B (Development Indoor)',
    shortLabel: 'Court B • Dev Indoor',
    surface: 'Pro Acrylic Indoor',
    capacity: '25 Atlet',
  },
  {
    name: 'Court C (Bandung Arena Indoor)',
    shortLabel: 'Court C • Bandung Arena',
    surface: 'FIBA Synthetic Wood',
    capacity: '25 Atlet',
  },
];

function parseYearMonthFromSessions(sessions: SystemState['trainingSessions']): {
  year: number;
  month: number;
} {
  // Default to October 2026 if sessions exist in Oct 2026, otherwise latest session month
  const hasOct2026 = sessions.some((s) => s.sessionDate.startsWith('2026-10'));
  if (hasOct2026) {
    return { year: 2026, month: 9 }; // 0-indexed: 9 = October
  }
  if (sessions.length > 0) {
    const sorted = [...sessions].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
    const [y, m] = sorted[0].sessionDate.split('-').map(Number);
    if (y && m) {
      return { year: y, month: m - 1 };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function formatDateKey(year: number, monthZeroIndexed: number, day: number): string {
  const m = String(monthZeroIndexed + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function MonthlyTrainingCalendar({
  state,
  canCreateTraining,
  canProcessTraining,
  onSelectSessionForAttendance,
  onUpdateSessionStatus,
  onOpenScheduleModalWithPrefill,
}: MonthlyTrainingCalendarProps) {
  const initialYM = useMemo(
    () => parseYearMonthFromSessions(state.trainingSessions),
    [state.trainingSessions]
  );

  const [currentYear, setCurrentYear] = useState<number>(initialYM.year);
  const [currentMonth, setCurrentMonth] = useState<number>(initialYM.month); // 0 = Jan, 9 = Oct
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const defaultOct = state.trainingSessions.find((s) => s.sessionDate === '2026-10-01');
    if (defaultOct) return '2026-10-01';
    const firstInMonth = state.trainingSessions.find((s) =>
      s.sessionDate.startsWith(
        `${initialYM.year}-${String(initialYM.month + 1).padStart(2, '0')}`
      )
    );
    return (
      firstInMonth?.sessionDate ||
      formatDateKey(initialYM.year, initialYM.month, 1)
    );
  });

  // View perspective:
  // 'COACH_COURT' -> Coach & Management view focusing on Court Status, Occupancy & Full Schedule
  // 'ATHLETE_SCHEDULE' -> Athlete & Parent view focusing on personal/team training sessions & attendance status
  const [viewPerspective, setViewPerspective] = useState<'COACH_COURT' | 'ATHLETE_SCHEDULE'>(
    state.currentUser.activeRoleCode === 'ATHLETE' || state.currentUser.activeRoleCode === 'PARENT'
      ? 'ATHLETE_SCHEDULE'
      : 'COACH_COURT'
  );

  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(
    state.athletes[0]?.id || ''
  );
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [courtFilter, setCourtFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [coachFilter, setCoachFilter] = useState<string>('ALL');

  const selectedAthlete = useMemo(
    () => state.athletes.find((a) => a.id === selectedAthleteId) || state.athletes[0],
    [state.athletes, selectedAthleteId]
  );

  // Discover all unique courts from standard list + existing sessions
  const allCourts = useMemo(() => {
    const map = new Map<
      string,
      { name: string; shortLabel: string; surface: string; capacity: string }
    >();
    STANDARD_COURTS.forEach((c) => map.set(c.name, c));
    state.trainingSessions.forEach((s) => {
      if (s.courtName && !map.has(s.courtName)) {
        map.set(s.courtName, {
          name: s.courtName,
          shortLabel: s.courtName,
          surface: 'Indoor Basketball Court',
          capacity: '25 Atlet',
        });
      }
    });
    return Array.from(map.values());
  }, [state.trainingSessions]);

  // Filter sessions according to active perspective & filters
  const filteredSessions = useMemo(() => {
    return state.trainingSessions.filter((s) => {
      if (branchFilter !== 'ALL' && s.branchId !== branchFilter) return false;
      if (courtFilter !== 'ALL' && s.courtName !== courtFilter) return false;
      if (teamFilter !== 'ALL' && s.teamId !== teamFilter) return false;
      if (coachFilter !== 'ALL' && s.coachId !== coachFilter) return false;

      if (viewPerspective === 'ATHLETE_SCHEDULE' && selectedAthlete) {
        // Show sessions belonging to the selected athlete's team (or where athlete has attendance)
        const hasAttendanceRecord = state.attendances.some(
          (att) => att.sessionId === s.id && att.athleteId === selectedAthlete.id
        );
        const matchesAthleteTeam = selectedAthlete.teamId
          ? s.teamId === selectedAthlete.teamId
          : s.branchId === selectedAthlete.branchId;
        if (!matchesAthleteTeam && !hasAttendanceRecord) return false;
      }

      return true;
    });
  }, [
    state.trainingSessions,
    state.attendances,
    branchFilter,
    courtFilter,
    teamFilter,
    coachFilter,
    viewPerspective,
    selectedAthlete,
  ]);

  // Month prefix YYYY-MM
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const monthSessions = useMemo(
    () =>
      filteredSessions
        .filter((s) => s.sessionDate.startsWith(monthPrefix))
        .sort((a, b) =>
          `${a.sessionDate}-${a.startTime}`.localeCompare(`${b.sessionDate}-${b.startTime}`)
        ),
    [filteredSessions, monthPrefix]
  );

  // Build calendar cells (Monday-first 7-column grid)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
    const startWeekdayMondayFirst = (firstDayOfMonth.getDay() + 6) % 7;

    const cells: Array<{
      dateKey: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      sessions: typeof filteredSessions;
    }> = [];

    // Leading days from previous month
    const prevMonthTotalDays = new Date(currentYear, currentMonth, 0).getDate();
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    for (let i = startWeekdayMondayFirst - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      const dateKey = formatDateKey(prevYear, prevMonth, d);
      cells.push({
        dateKey,
        dayNumber: d,
        isCurrentMonth: false,
        sessions: filteredSessions
          .filter((s) => s.sessionDate === dateKey)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      });
    }

    // Current month days
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateKey = formatDateKey(currentYear, currentMonth, d);
      cells.push({
        dateKey,
        dayNumber: d,
        isCurrentMonth: true,
        sessions: filteredSessions
          .filter((s) => s.sessionDate === dateKey)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      });
    }

    // Trailing days to complete 35 or 42 grid cells
    const totalSlots = cells.length <= 35 ? 35 : 42;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    let nextDay = 1;
    while (cells.length < totalSlots) {
      const dateKey = formatDateKey(nextYear, nextMonth, nextDay);
      cells.push({
        dateKey,
        dayNumber: nextDay,
        isCurrentMonth: false,
        sessions: filteredSessions
          .filter((s) => s.sessionDate === dateKey)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      });
      nextDay++;
    }

    return cells;
  }, [currentYear, currentMonth, filteredSessions]);

  // Sessions on the currently clicked date
  const selectedDateSessions = useMemo(
    () =>
      filteredSessions
        .filter((s) => s.sessionDate === selectedDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [filteredSessions, selectedDate]
  );

  // Real-time Court Status Matrix for Coaches on `selectedDate` (plus monthly utilization)
  const courtStatusMatrix = useMemo(() => {
    // All sessions on selectedDate across the academy (ignoring team filter so coach sees true court availability)
    const allSessionsOnDate = state.trainingSessions
      .filter((s) => s.sessionDate === selectedDate && s.status !== 'CANCELLED')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const allSessionsInMonth = state.trainingSessions.filter(
      (s) => s.sessionDate.startsWith(monthPrefix) && s.status !== 'CANCELLED'
    );

    const standardSlots = ['08:00 - 10:00', '13:00 - 15:00', '15:30 - 17:30', '16:00 - 18:30', '19:00 - 21:00'];

    return allCourts.map((court) => {
      const dateBookings = allSessionsOnDate.filter((s) => s.courtName === court.name);
      const monthBookingsCount = allSessionsInMonth.filter((s) => s.courtName === court.name).length;

      // Detect any overlapping time conflict on this court on selectedDate
      let hasConflict = false;
      for (let i = 0; i < dateBookings.length; i++) {
        for (let j = i + 1; j < dateBookings.length; j++) {
          const a = dateBookings[i];
          const b = dateBookings[j];
          if (a.startTime < b.endTime && b.startTime < a.endTime) {
            hasConflict = true;
          }
        }
      }

      const hasOngoing = dateBookings.some((s) => s.status === 'ONGOING');
      const hasScheduled = dateBookings.some((s) => s.status === 'SCHEDULED');

      const courtState: 'ONGOING' | 'BOOKED' | 'COMPLETED' | 'AVAILABLE' = hasOngoing
        ? 'ONGOING'
        : hasScheduled
        ? 'BOOKED'
        : dateBookings.length > 0
        ? 'COMPLETED'
        : 'AVAILABLE';

      const availableSlots = standardSlots.filter((slot) => {
        const [slotStart, slotEnd] = slot.split(' - ');
        return !dateBookings.some((b) => slotStart < b.endTime && b.startTime < slotEnd);
      });

      return {
        ...court,
        courtState,
        hasConflict,
        dateBookings,
        monthBookingsCount,
        availableSlots,
      };
    });
  }, [allCourts, state.trainingSessions, selectedDate, monthPrefix]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
      setSelectedDate(formatDateKey(currentYear - 1, 11, 1));
    } else {
      setCurrentMonth((m) => m - 1);
      setSelectedDate(formatDateKey(currentYear, currentMonth - 1, 1));
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
      setSelectedDate(formatDateKey(currentYear + 1, 0, 1));
    } else {
      setCurrentMonth((m) => m + 1);
      setSelectedDate(formatDateKey(currentYear, currentMonth + 1, 1));
    }
  };

  const handleJumpToOct2026 = () => {
    setCurrentYear(2026);
    setCurrentMonth(9);
    setSelectedDate('2026-10-01');
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden space-y-0">
      {/* TOP BAR: PERSPECTIVE SWITCHER (PELATIH: STATUS LAPANGAN vs ATLET: JADWAL SESI MEREKA) */}
      <div className="p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-mono uppercase tracking-wider text-amber-400">
              Kalender Interaktif Akademi • Jadwal Bulanan & Status Lapangan Real-Time
            </span>
          </div>
          <h3 className="text-base font-bold text-slate-100 mt-1">
            Kalender Jadwal Latihan Bulanan — {INDONESIAN_MONTHS[currentMonth]} {currentYear}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Pelatih dapat memantau okupansi, ketersediaan, & potensi bentrok lapangan secara langsung, sementara atlet dapat memantau jadwal sesi tim mereka beserta status presensi.
          </p>
        </div>

        {/* Interactive Mode Switcher: Coach Court Status vs Athlete Personal Schedule */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setViewPerspective('COACH_COURT')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors ${
                viewPerspective === 'COACH_COURT'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Mode Pelatih: Status Lapangan & Semua Sesi</span>
            </button>
            <button
              type="button"
              onClick={() => setViewPerspective('ATHLETE_SCHEDULE')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors ${
                viewPerspective === 'ATHLETE_SCHEDULE'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Mode Atlet: Jadwal Sesi Latihan Saya</span>
            </button>
          </div>

          {canCreateTraining && (
            <button
              type="button"
              onClick={() =>
                onOpenScheduleModalWithPrefill({
                  sessionDate: selectedDate,
                  courtName: courtFilter !== 'ALL' ? courtFilter : undefined,
                })
              }
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Jadwalkan di {selectedDate}</span>
            </button>
          )}
        </div>
      </div>

      {/* ATHLETE SELECTOR BANNER WHEN IN ATHLETE SCHEDULE PERSPECTIVE */}
      {viewPerspective === 'ATHLETE_SCHEDULE' && selectedAthlete && (
        <div className="px-5 py-3.5 border-b border-emerald-500/30 bg-emerald-950/20 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono uppercase text-emerald-300 font-semibold">
                Jadwal Sesi Personal Atlet:
              </span>
            </div>
            <select
              value={selectedAthlete.id}
              onChange={(e) => setSelectedAthleteId(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-950 border border-emerald-500/40 rounded text-slate-100"
            >
              {state.athletes.map((ath) => {
                const t = state.teams.find((tm) => tm.id === ath.teamId);
                return (
                  <option key={ath.id} value={ath.id}>
                    {ath.fullName} ({ath.memberCode}) — {t?.name || 'Tim Akademi'}
                  </option>
                );
              })}
            </select>
            <div className="text-xs text-slate-300 font-mono">
              Tim:{' '}
              <strong className="text-amber-300">
                {state.teams.find((t) => t.id === selectedAthlete.teamId)?.name || '-'}
              </strong>{' '}
              · Posisi: <strong className="text-slate-100">{selectedAthlete.position}</strong> (#
              {selectedAthlete.jerseyNumber})
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-400">Sesi Bulan Ini: </span>
              <strong className="text-emerald-400">{monthSessions.length} Sesi</strong>
            </div>
            <div>
              <span className="text-slate-400">Terjadwal: </span>
              <strong className="text-amber-400">
                {
                  monthSessions.filter(
                    (s) => s.status === 'SCHEDULED' || s.status === 'ONGOING'
                  ).length
                }{' '}
                Sesi
              </strong>
            </div>
            <div>
              <span className="text-slate-400">Hadir Tercatat: </span>
              <strong className="text-sky-400">
                {
                  state.attendances.filter(
                    (a) =>
                      a.athleteId === selectedAthlete.id &&
                      (a.status === 'PRESENT' || a.status === 'LATE')
                  ).length
                }{' '}
                Sesi
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* COACH COURT STATUS LIVE MATRIX BAR */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-slate-200">
              Status & Okupansi Lapangan pada Tanggal Terpilih ({selectedDate})
            </h4>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>TERSEDIA (AVAILABLE)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>TERJADWAL / DIGUNAKAN</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>SELESAI</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {courtStatusMatrix.map((court) => {
            const isFilteredCourt = courtFilter === court.name;
            return (
              <div
                key={court.name}
                className={`p-3.5 rounded-lg border transition-colors flex flex-col justify-between gap-2.5 ${
                  isFilteredCourt
                    ? 'border-amber-500 bg-amber-500/10'
                    : court.courtState === 'ONGOING'
                    ? 'border-emerald-500/50 bg-emerald-950/15'
                    : court.courtState === 'BOOKED'
                    ? 'border-amber-500/40 bg-slate-900/80'
                    : 'border-slate-800 bg-slate-900/50'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-100">{court.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {court.surface} · Kapasitas {court.capacity}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                        court.courtState === 'ONGOING'
                          ? 'text-emerald-400'
                          : court.courtState === 'BOOKED'
                          ? 'text-amber-400'
                          : court.courtState === 'COMPLETED'
                          ? 'text-sky-400'
                          : 'text-emerald-300'
                      }`}
                    >
                      {court.courtState === 'ONGOING'
                        ? 'SEDANG DIPAKAI'
                        : court.courtState === 'BOOKED'
                        ? `${court.dateBookings.length} SESI TERJADWAL`
                        : court.courtState === 'COMPLETED'
                        ? 'SESI SELESAI'
                        : 'TERSEDIA PENUH'}
                    </span>
                  </div>

                  {court.hasConflict && (
                    <div className="mt-2 p-1.5 rounded bg-rose-500/15 border border-rose-500/40 text-[11px] text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Peringatan: Ada jadwal jam bertabrakan di lapangan ini!</span>
                    </div>
                  )}

                  {/* Bookings on selected date */}
                  <div className="mt-2.5 space-y-1.5">
                    {court.dateBookings.length === 0 ? (
                      <div className="text-[11px] text-emerald-300/90 font-mono py-1">
                        ✓ Lapangan kosong sepanjang hari ({selectedDate}). Siap dijadwalkan.
                      </div>
                    ) : (
                      court.dateBookings.map((b) => {
                        const tm = state.teams.find((t) => t.id === b.teamId);
                        const ch = state.coaches.find((c) => c.id === b.coachId);
                        return (
                          <div
                            key={b.id}
                            className="p-2 rounded bg-slate-950/90 border border-slate-800/90 text-[11px] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="font-mono font-semibold text-amber-300">
                                {b.startTime} - {b.endTime} · {tm?.name || 'Tim'}
                              </div>
                              <div className="text-slate-400 truncate">
                                {ch?.fullName || 'Coach'} — {b.topic}
                              </div>
                            </div>
                            <StatusText status={b.status} />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-slate-400 truncate">
                    Slot Kosong: {court.availableSlots.slice(0, 2).join(', ') || 'Penuh'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setCourtFilter((prev) => (prev === court.name ? 'ALL' : court.name))
                      }
                      className="px-2 py-1 font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                    >
                      {isFilteredCourt ? 'Semua Court' : 'Filter Court'}
                    </button>
                    {canCreateTraining && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenScheduleModalWithPrefill({
                            sessionDate: selectedDate,
                            courtName: court.name,
                          })
                        }
                        className="px-2 py-1 font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded"
                      >
                        + Booking
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MONTH NAVIGATION & FILTER CONTROLS */}
      <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Month Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800"
            title="Bulan Sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-3.5 py-1.5 rounded bg-slate-950 border border-slate-800 font-mono text-xs font-bold text-amber-400 min-w-[165px] text-center">
            {INDONESIAN_MONTHS[currentMonth].toUpperCase()} {currentYear}
          </div>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800"
            title="Bulan Berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleJumpToOct2026}
            className="px-2.5 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded"
          >
            Oktober 2026 ({monthSessions.length} Sesi)
          </button>
        </div>

        {/* Multi-Dimensional Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={courtFilter}
            onChange={(e) => setCourtFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200"
          >
            <option value="ALL">Semua Lapangan ({allCourts.length})</option>
            {allCourts.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200"
          >
            <option value="ALL">Semua Tim ({state.teams.length})</option>
            {state.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={coachFilter}
            onChange={(e) => setCoachFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200"
          >
            <option value="ALL">Semua Pelatih ({state.coaches.length})</option>
            {state.coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </select>

          {(courtFilter !== 'ALL' || teamFilter !== 'ALL' || coachFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setCourtFilter('ALL');
                setTeamFilter('ALL');
                setCoachFilter('ALL');
              }}
              className="px-2.5 py-1.5 text-xs font-mono text-amber-400 hover:text-amber-300 bg-slate-950 border border-slate-800 rounded"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* MAIN CALENDAR WORKSPACE: 7-COLUMN INTERACTIVE GRID + SELECTED DAY INSPECTOR */}
      <div className="grid grid-cols-1 xl:grid-cols-12">
        {/* LEFT 8 COLUMNS: 7-DAY MONTHLY CALENDAR GRID */}
        <div className="xl:col-span-8 border-b xl:border-b-0 xl:border-r border-slate-800 p-4">
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {DAY_HEADERS.map((dayName) => (
              <div
                key={dayName}
                className="py-2 text-center text-[11px] font-mono uppercase tracking-wider text-slate-400 bg-slate-950/70 rounded border border-slate-800/70"
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Calendar Cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((cell) => {
              const isSelected = cell.dateKey === selectedDate;
              const isToday = cell.dateKey === '2026-10-01';
              const hasSessions = cell.sessions.length > 0;

              return (
                <div
                  key={cell.dateKey}
                  onClick={() => setSelectedDate(cell.dateKey)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedDate(cell.dateKey);
                    }
                  }}
                  className={`min-h-[112px] p-2 rounded-md border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/50'
                      : !cell.isCurrentMonth
                      ? 'border-slate-900 bg-slate-950/30 opacity-45 hover:opacity-75'
                      : hasSessions
                      ? 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                      : 'border-slate-800/50 bg-slate-950/40 hover:border-slate-800'
                  }`}
                >
                  {/* Top row of cell: Day number & session count */}
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-xs font-mono font-bold ${
                        isSelected
                          ? 'text-amber-400'
                          : isToday
                          ? 'text-emerald-400 underline'
                          : cell.isCurrentMonth
                          ? 'text-slate-200'
                          : 'text-slate-500'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {hasSessions && (
                      <span className="text-[10px] font-mono text-amber-400">
                        {cell.sessions.length} sesi
                      </span>
                    )}
                  </div>

                  {/* Session items inside day cell */}
                  <div className="my-1.5 space-y-1">
                    {cell.sessions.slice(0, 2).map((sess) => {
                      const team = state.teams.find((t) => t.id === sess.teamId);
                      const shortCourt = sess.courtName.split(' (')[0];
                      const athleteAtt =
                        viewPerspective === 'ATHLETE_SCHEDULE' && selectedAthlete
                          ? state.attendances.find(
                              (a) =>
                                a.sessionId === sess.id && a.athleteId === selectedAthlete.id
                            )
                          : undefined;

                      return (
                        <div
                          key={sess.id}
                          className={`px-1.5 py-1 rounded text-[10px] border leading-tight ${
                            sess.status === 'ONGOING'
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                              : sess.status === 'COMPLETED'
                              ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          }`}
                        >
                          <div className="font-mono font-bold flex items-center justify-between gap-1">
                            <span>{sess.startTime}</span>
                            <span className="truncate">{shortCourt}</span>
                          </div>
                          <div className="truncate text-slate-200 font-medium">
                            {team?.name.replace('ZAMOA ', '') || sess.topic}
                          </div>
                          {viewPerspective === 'ATHLETE_SCHEDULE' && (
                            <div className="font-mono text-[9px] text-emerald-300 mt-0.5">
                              {athleteAtt ? `Presensi: ${athleteAtt.status}` : 'Jadwal Anda'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {cell.sessions.length > 2 && (
                      <div className="text-[10px] font-mono text-slate-400 text-center">
                        +{cell.sessions.length - 2} sesi lainnya
                      </div>
                    )}
                  </div>

                  {/* Bottom court occupancy bar */}
                  <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-800/50">
                    <span className="text-[9px] font-mono text-slate-500 truncate">
                      {hasSessions ? 'Terjadwal' : 'Lapangan Kosong'}
                    </span>
                    {canCreateTraining && cell.isCurrentMonth && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDate(cell.dateKey);
                          onOpenScheduleModalWithPrefill({
                            sessionDate: cell.dateKey,
                            courtName: courtFilter !== 'ALL' ? courtFilter : undefined,
                          });
                        }}
                        className="text-[10px] font-mono text-amber-400 hover:text-amber-300"
                        title={`Tambah sesi pada ${cell.dateKey}`}
                      >
                        +Sesi
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT 4 COLUMNS: SELECTED DAY AGENDA, COURT STATUS & ATHLETE CHECK-IN ACTIONS */}
        <div className="xl:col-span-4 p-4 bg-slate-950/50 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[11px] font-mono uppercase text-amber-400">
                  Detail Jadwal & Lapangan Harian
                </div>
                <h4 className="text-sm font-bold text-slate-100 mt-0.5">
                  Tanggal: {selectedDate} ({selectedDateSessions.length} Sesi)
                </h4>
              </div>
              {canCreateTraining && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenScheduleModalWithPrefill({
                      sessionDate: selectedDate,
                      courtName: courtFilter !== 'ALL' ? courtFilter : undefined,
                    })
                  }
                  className="px-2.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Sesi</span>
                </button>
              )}
            </div>

            {selectedDateSessions.length === 0 ? (
              <div className="p-6 rounded-lg border border-slate-800 bg-slate-900/40 text-center space-y-2">
                <CalendarIcon className="w-7 h-7 text-slate-500 mx-auto" />
                <div className="text-xs font-semibold text-slate-200">
                  Tidak Ada Sesi Latihan pada {selectedDate}
                </div>
                <p className="text-xs text-slate-400">
                  Seluruh lapangan (Court A, Court B, Court C) dalam status TERSEDIA untuk tanggal ini.
                </p>
                {canCreateTraining && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenScheduleModalWithPrefill({
                        sessionDate: selectedDate,
                      })
                    }
                    className="mt-2 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Jadwalkan Sesi di Tanggal Ini</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3 max-h-[470px] overflow-y-auto pr-1">
                {selectedDateSessions.map((sess) => {
                  const team = state.teams.find((t) => t.id === sess.teamId);
                  const coach = state.coaches.find((c) => c.id === sess.coachId);
                  const branch = state.branches.find((b) => b.id === sess.branchId);
                  const sessionAtts = state.attendances.filter((a) => a.sessionId === sess.id);
                  const presentCount = sessionAtts.filter(
                    (a) => a.status === 'PRESENT' || a.status === 'LATE'
                  ).length;
                  const teamAthletes = state.athletes.filter((a) => a.teamId === sess.teamId);
                  const personalAtt = selectedAthlete
                    ? sessionAtts.find((a) => a.athleteId === selectedAthlete.id)
                    : undefined;

                  return (
                    <div
                      key={sess.id}
                      className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/80 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              {sess.startTime} – {sess.endTime} WIB
                            </span>
                          </div>
                          <h5 className="text-sm font-bold text-slate-100 mt-0.5">{sess.topic}</h5>
                        </div>
                        <StatusText status={sess.status} />
                      </div>

                      <div className="space-y-1 text-xs text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-semibold text-emerald-300">{sess.courtName}</span>
                          <span className="text-slate-500">· {branch?.name || '-'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span>
                            Tim: <strong className="text-slate-100">{team?.name || '-'}</strong> (
                            {teamAthletes.length} Atlet)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            Pelatih: <strong className="text-slate-100">{coach?.fullName || '-'}</strong>
                          </span>
                        </div>
                      </div>

                      {sess.trainingNotes && (
                        <p className="text-[11px] text-slate-400 bg-slate-950/70 p-2 rounded border border-slate-800/80">
                          Catatan Kurikulum: {sess.trainingNotes}
                        </p>
                      )}

                      {viewPerspective === 'ATHLETE_SCHEDULE' && selectedAthlete && (
                        <div className="p-2 rounded border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-between text-xs">
                          <span className="text-slate-300">
                            Status Presensi{' '}
                            <strong className="text-slate-100">
                              {selectedAthlete.fullName.split(' ')[0]}
                            </strong>
                            :
                          </span>
                          <span className="font-mono font-bold text-emerald-300">
                            {personalAtt ? personalAtt.status : 'TERJADWAL (BELUM CHECK-IN)'}
                          </span>
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-slate-400">
                          Presensi: {presentCount}/{sessionAtts.length || teamAthletes.length} hadir
                        </span>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectSessionForAttendance(sess.id)}
                            className="px-2.5 py-1 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1"
                          >
                            <QrCode className="w-3 h-3" />
                            <span>Buka Presensi</span>
                          </button>

                          {canProcessTraining && sess.status === 'SCHEDULED' && (
                            <button
                              type="button"
                              onClick={() => onUpdateSessionStatus(sess.id, 'ONGOING')}
                              className="px-2 py-1 text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded flex items-center gap-1"
                            >
                              <PlayCircle className="w-3 h-3" />
                              <span>Mulai</span>
                            </button>
                          )}

                          {canProcessTraining && sess.status !== 'COMPLETED' && (
                            <button
                              type="button"
                              onClick={() => onUpdateSessionStatus(sess.id, 'COMPLETED')}
                              className="px-2 py-1 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Selesai</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Monthly Summary Footer inside Right Inspector */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/60 text-[11px] font-mono text-slate-400 space-y-1">
            <div className="flex items-center justify-between">
              <span>Total Sesi {INDONESIAN_MONTHS[currentMonth]}:</span>
              <strong className="text-slate-100">{monthSessions.length} Sesi Latihan</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Lapangan Aktif:</span>
              <strong className="text-emerald-400">{allCourts.length} Lapangan Standar FIBA</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
