/**
 * ZAMOA CBTC Basketball Academy — Digital Notification & Web Push Engine
 *
 * Menyediakan layanan digitalisasi notifikasi end-to-end:
 * 1. Native Browser Web Notification API (Push Notifikasi Desktop/Perangkat)
 * 2. Generator Kartu Pemberitahuan Digital Resmi (Clipboard & Unduh Bukti Digital)
 */

export type DigitalNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function getBrowserNotificationPermission(): DigitalNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission as DigitalNotificationPermission;
}

export async function requestBrowserNotificationPermission(): Promise<DigitalNotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await window.Notification.requestPermission();
    return result as DigitalNotificationPermission;
  } catch {
    return 'denied';
  }
}

export function sendBrowserDigitalNotification(
  title: string,
  body: string,
  category = 'SYSTEM'
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }
  try {
    new window.Notification(`ZAMOA CBTC [${category}] — ${title}`, {
      body,
      tag: `zamoa-cbtc-${Date.now()}`,
    });
    return true;
  } catch {
    return false;
  }
}

export function formatDigitalNotificationCard(params: {
  id: string;
  category: string;
  title: string;
  message: string;
  createdAt: string;
  organizationName?: string;
}): string {
  const timestamp = new Date(params.createdAt).toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  return [
    '============================================================',
    `PEMBERITAHUAN DIGITAL RESMI — ${params.organizationName || 'ZAMOA CBTC BASKETBALL ACADEMY'}`,
    '============================================================',
    `ID Referensi : ${params.id}`,
    `Kategori     : ${params.category}`,
    `Waktu Terbit : ${timestamp}`,
    '------------------------------------------------------------',
    `JUDUL        : ${params.title}`,
    '',
    params.message,
    '------------------------------------------------------------',
    'Dokumen/Notifikasi ini diterbitkan secara digital melalui',
    'Sistem Informasi Manajemen Terpadu ZAMOA CBTC Academy.',
    '============================================================',
  ].join('\n');
}

export function downloadDigitalNoticeFile(params: {
  id: string;
  category: string;
  title: string;
  message: string;
  createdAt: string;
  organizationName?: string;
}): void {
  const content = formatDigitalNotificationCard(params);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeSlug = params.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  a.href = url;
  a.download = `notifikasi-digital-${params.category.toLowerCase()}-${safeSlug || 'cbtc'}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
