import { auth } from './firebase.ts';

// Store ID Token in memory (never in localStorage per security guidelines)
let inMemoryIdToken: string | null = 'ZAMOA_CBTC_DIRECT_SESSION';
let selectedBranchOverride: string = 'ALL';
let selectedUserOverride: string | null = null;

export function setInMemoryToken(token: string | null) {
  inMemoryIdToken = token;
}

export function setBranchHeader(branchId: string) {
  selectedBranchOverride = branchId;
}

export function getBranchHeader() {
  return selectedBranchOverride;
}

export function setActAsUserHeader(userId: string | null) {
  selectedUserOverride = userId;
}

export function getActAsUserHeader() {
  return selectedUserOverride;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    inMemoryIdToken = await currentUser.getIdToken();
  }

  if (!inMemoryIdToken) {
    throw new Error('Sesi belum terautentikasi. Silakan login terlebih dahulu.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${inMemoryIdToken}`,
    'X-Branch-Id': selectedBranchOverride,
    ...(selectedUserOverride ? { 'X-Act-As-User-Id': selectedUserOverride } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Permintaan gagal (${response.status})`);
  }

  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const ch = new BroadcastChannel('zamoa_cbtc_realtime_bus');
      ch.postMessage({
        table: 'system_state',
        eventType: method === 'DELETE' ? 'DELETE' : method === 'POST' ? 'INSERT' : 'UPDATE',
        timestamp: new Date().toISOString(),
      });
      ch.close();
    } catch {
      // Ignore BroadcastChannel errors
    }
  }

  return data as T;
}

export function formatIDR(value: string | number | undefined | null): string {
  const num = Number(value || 0);
  return `Rp ${num.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function exportRowsToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] === null || row[h] === undefined ? '' : String(row[h]);
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  // Trigger async audit log for export
  apiRequest('/api/audit/export', {
    method: 'POST',
    body: JSON.stringify({ reportName: filename }),
  }).catch(() => {});
}
