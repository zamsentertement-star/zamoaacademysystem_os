import { apiRequest } from './api.ts';

export const OFFLINE_ATTENDANCE_STORAGE_KEY = 'ZAMOA_CBTC_OFFLINE_ATTENDANCE_QUEUE_V1';
export const OFFLINE_SIMULATION_STORAGE_KEY = 'ZAMOA_CBTC_SIMULATED_OFFLINE_MODE_V1';
export const OFFLINE_LAST_SYNC_STORAGE_KEY = 'ZAMOA_CBTC_OFFLINE_LAST_SYNC_AT_V1';

export type OfflineAttendanceEntityType =
  | 'ATHLETE_SINGLE'
  | 'ATHLETE_BULK'
  | 'COACH_SINGLE'
  | 'STAFF_SINGLE';

export interface OfflineAttendanceQueueItem {
  id: string;
  entityType: OfflineAttendanceEntityType;
  branchId: string;
  sessionId: string;
  targetId: string; // athleteId, coachId, staffId, or 'BULK'
  targetName: string;
  targetCode?: string;
  athleteIds?: string[];
  status: string;
  sourceOrMethod: string;
  notes: string;
  queuedAt: string;
  syncError?: string | null;
}

export function loadOfflineAttendanceQueue(): OfflineAttendanceQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_ATTENDANCE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfflineAttendanceQueue(items: OfflineAttendanceQueueItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OFFLINE_ATTENDANCE_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('zamoa-offline-queue-updated'));
  } catch {
    // ignore storage quota errors
  }
}

export function getSimulatedOfflineMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(OFFLINE_SIMULATION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSimulatedOfflineMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OFFLINE_SIMULATION_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('zamoa-offline-queue-updated'));
  } catch {
    // ignore
  }
}

export function getLastOfflineSyncAt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(OFFLINE_LAST_SYNC_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLastOfflineSyncAt(isoTimestamp: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OFFLINE_LAST_SYNC_STORAGE_KEY, isoTimestamp);
    window.dispatchEvent(new CustomEvent('zamoa-offline-queue-updated'));
  } catch {
    // ignore
  }
}

export function isCurrentlyOffline(): boolean {
  if (typeof window === 'undefined') return false;
  const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return browserOffline || getSimulatedOfflineMode();
}

export function isNetworkDisconnectError(err: unknown): boolean {
  if (isCurrentlyOffline()) return true;
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('offline')
  );
}

/**
 * Enqueues or updates an attendance record in LocalStorage with anti-duplication
 * per (sessionId, entityType, targetId).
 */
export function enqueueOfflineAttendance(
  item: Omit<OfflineAttendanceQueueItem, 'id' | 'queuedAt'>
): OfflineAttendanceQueueItem {
  const current = loadOfflineAttendanceQueue();
  const nowIso = new Date().toISOString();
  const newEntry: OfflineAttendanceQueueItem = {
    ...item,
    id: `OFFQ-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    queuedAt: nowIso,
    syncError: null,
  };

  // Deduplicate by sessionId + entityType + targetId (except bulk which replaces previous bulk for same session)
  const existingIdx = current.findIndex(
    (q) =>
      q.sessionId === item.sessionId &&
      q.entityType === item.entityType &&
      q.targetId === item.targetId
  );

  if (existingIdx >= 0) {
    current[existingIdx] = {
      ...current[existingIdx],
      ...newEntry,
      id: current[existingIdx].id,
    };
  } else {
    current.push(newEntry);
  }

  saveOfflineAttendanceQueue(current);
  return newEntry;
}

export function removeOfflineQueueItem(id: string): void {
  const current = loadOfflineAttendanceQueue();
  const next = current.filter((item) => item.id !== id);
  saveOfflineAttendanceQueue(next);
}

export function clearOfflineAttendanceQueue(): void {
  saveOfflineAttendanceQueue([]);
}

export async function syncOfflineAttendanceQueueToServer(): Promise<{
  syncedCount: number;
  failedCount: number;
  remainingItems: OfflineAttendanceQueueItem[];
}> {
  const queue = loadOfflineAttendanceQueue();
  if (queue.length === 0) {
    return { syncedCount: 0, failedCount: 0, remainingItems: [] };
  }

  let syncedCount = 0;
  let failedCount = 0;
  const remaining: OfflineAttendanceQueueItem[] = [];

  for (const item of queue) {
    try {
      if (item.entityType === 'ATHLETE_SINGLE') {
        await apiRequest('/api/attendances', {
          method: 'POST',
          body: JSON.stringify({
            branchId: item.branchId,
            sessionId: item.sessionId,
            athleteId: item.targetId,
            status: item.status,
            source: item.sourceOrMethod,
            notes: `${item.notes} [Synced dari Offline LocalStorage pada ${new Date().toLocaleTimeString('id-ID')}]`,
          }),
        });
      } else if (item.entityType === 'ATHLETE_BULK') {
        await apiRequest('/api/attendances/bulk', {
          method: 'POST',
          body: JSON.stringify({
            branchId: item.branchId,
            sessionId: item.sessionId,
            athleteIds: item.athleteIds || [],
            status: item.status,
            source: item.sourceOrMethod,
          }),
        });
      } else if (item.entityType === 'COACH_SINGLE') {
        await apiRequest('/api/coach-attendances', {
          method: 'POST',
          body: JSON.stringify({
            branchId: item.branchId,
            sessionId: item.sessionId,
            coachId: item.targetId,
            status: item.status,
            checkInMethod: item.sourceOrMethod,
            notes: `${item.notes} [Synced dari Offline LocalStorage]`,
          }),
        });
      } else if (item.entityType === 'STAFF_SINGLE') {
        await apiRequest('/api/staff-attendances', {
          method: 'POST',
          body: JSON.stringify({
            branchId: item.branchId,
            sessionId: item.sessionId,
            staffId: item.targetId,
            status: item.status,
            checkInMethod: item.sourceOrMethod,
            notes: `${item.notes} [Synced dari Offline LocalStorage]`,
          }),
        });
      }
      syncedCount += 1;
    } catch (err: unknown) {
      failedCount += 1;
      remaining.push({
        ...item,
        syncError: err instanceof Error ? err.message : 'Gagal sinkronisasi ke server',
      });
    }
  }

  saveOfflineAttendanceQueue(remaining);
  if (syncedCount > 0) {
    setLastOfflineSyncAt(new Date().toISOString());
  }

  return {
    syncedCount,
    failedCount,
    remainingItems: remaining,
  };
}
