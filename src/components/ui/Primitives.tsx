import React from 'react';
import { X, ShieldAlert, AlertTriangle, Inbox, Loader2 } from 'lucide-react';

// 1. PAGE STATE WRAPPERS (Loading, Empty, Error, Unauthorized)
export function LoadingState({ message = 'Memuat data operasional...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 border border-slate-800/80 rounded-lg bg-slate-900/40">
      <Loader2 className="w-6 h-6 text-amber-500 animate-spin mb-3" />
      <p className="text-sm text-slate-300 font-medium">{message}</p>
      <div className="mt-6 w-full max-w-xl space-y-2.5">
        <div className="h-9 bg-slate-800/60 rounded animate-pulse" />
        <div className="h-9 bg-slate-800/40 rounded animate-pulse" />
        <div className="h-9 bg-slate-800/30 rounded animate-pulse" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 border border-slate-800/80 rounded-lg bg-slate-900/30">
      <Inbox className="w-7 h-7 text-slate-500 mb-3" />
      <h3 className="text-base font-semibold text-slate-100 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-5">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 border border-red-900/60 rounded-lg bg-red-950/20">
      <AlertTriangle className="w-7 h-7 text-red-400 mb-3" />
      <h3 className="text-base font-semibold text-red-200 mb-1">Terjadi Kendala Pemrosesan Data</h3>
      <p className="text-sm text-red-300/80 max-w-md mb-4">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-md transition-colors whitespace-nowrap"
        >
          Muat Ulang Data
        </button>
      )}
    </div>
  );
}

export function UnauthorizedState({
  roleCode,
  domainName,
}: {
  roleCode: string;
  domainName: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 border border-amber-900/50 rounded-lg bg-slate-900/40">
      <ShieldAlert className="w-8 h-8 text-amber-400 mb-3" />
      <h3 className="text-base font-semibold text-slate-100 mb-1">
        Akses Terbatas (Least Privilege RBAC)
      </h3>
      <p className="text-sm text-slate-400 max-w-md">
        Role aktif Anda saat ini (<span className="font-mono text-amber-300">{roleCode}</span>) tidak
        memiliki otorisasi <span className="font-mono text-slate-200">view</span> pada modul{' '}
        <span className="font-semibold text-slate-200">{domainName}</span>.
      </p>
    </div>
  );
}

// 2. MODAL DIALOG
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div
        className={`w-full ${maxWidth} bg-slate-900 border border-slate-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-800 transition-colors"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// 3. DRAWER PANEL (360 DETAIL VIEW)
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-800 transition-colors"
            aria-label="Tutup panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-6">{children}</div>
      </div>
    </div>
  );
}

// 4. CONFIRMATION DIALOG
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  onConfirm,
  onCancel,
  loading = false,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
      <p className="text-sm text-slate-300 mb-6">{description}</p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 rounded-md"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onConfirm}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md"
        >
          {loading ? 'Memproses...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// 5. CLEAN UNBOXED STATUS TEXT (Zero-Pill Discipline)
export function StatusText({ status }: { status: string }) {
  const normalized = (status || '').toUpperCase();
  let colorClass = 'text-slate-300';
  if (
    ['ACTIVE', 'PRESENT', 'PAID', 'COMPLETED', 'POSTED', 'CLEARED', 'APPROVED', 'GOOD', 'ACHIEVED'].includes(
      normalized
    )
  ) {
    colorClass = 'text-emerald-400';
  } else if (
    ['LATE', 'PARTIALLY_PAID', 'ISSUED', 'DRAFT', 'ONGOING', 'IN_PROGRESS', 'LIMITED_CONTACT', 'MAINTENANCE', 'MODERATE', 'UPCOMING', 'SCHEDULED'].includes(
      normalized
    )
  ) {
    colorClass = 'text-amber-400';
  } else if (
    ['ABSENT', 'OVERDUE', 'CANCELLED', 'REVERSED', 'OUT', 'SEVERE', 'DAMAGED', 'SUSPENDED', 'MISSED'].includes(
      normalized
    )
  ) {
    colorClass = 'text-red-400';
  }

  return <span className={`font-mono text-xs font-semibold ${colorClass}`}>{normalized}</span>;
}
