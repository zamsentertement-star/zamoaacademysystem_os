import React, { useState, useMemo } from 'react';
import {
  Search,
  UserPlus,
  Download,
  Eye,
  Users,
  ShieldCheck,
  HeartPulse,
  FileText,
  Trophy,
  Activity,
  QrCode,
  Copy,
  CreditCard,
  Send,
  Globe,
  Building2,
  Camera,
} from 'lucide-react';
import { SystemState, getEffectiveAppSettings } from '../types/system.ts';
import { apiRequest, exportRowsToCsv, formatIDR } from '../lib/api.ts';
import { hasPermission } from '../lib/rbac.ts';
import { Drawer, Modal, StatusText, EmptyState } from '../components/ui/Primitives.tsx';
import {
  QrCodeSvg,
  downloadDigitalQrCardSvg,
} from '../components/ui/DigitalQrPassHub.tsx';
import {
  EasyPaymentPortalModal,
  WaEmailDispatchModal,
} from '../components/ui/EasyPaymentPortalModal.tsx';
import {
  AthletePassportPhotoInput,
  AthletePhotoThumbnail,
  buildDefaultPassportPhotoSvg,
} from '../components/ui/AthletePassportPhotoInput.tsx';

interface AthletesParentsViewProps {
  state: SystemState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function AthletesParentsView({ state, onRefresh, notify }: AthletesParentsViewProps) {
  const [subTab, setSubTab] = useState<'athletes' | 'parents' | 'register'>('athletes');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [editingPhotoInDrawer, setEditingPhotoInDrawer] = useState(false);
  const [parentModalOpen, setParentModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [easyPayInvoiceId, setEasyPayInvoiceId] = useState<string | null>(null);
  const [waEmailModal, setWaEmailModal] = useState<{
    mode: 'INVOICE' | 'RECEIPT';
    invoiceId: string;
  } | null>(null);

  const appSettings = useMemo(() => getEffectiveAppSettings(state), [state]);
  const regConfig = appSettings.registrationAndWorkspace!;

  const role = state.currentUser.activeRoleCode;
  const canCreateAthlete = hasPermission(role, 'athletes', 'create');
  const canRegisterOnline = regConfig.onlineRegistrationEnabled;
  const canAccessRegisterTab = canCreateAthlete || canRegisterOnline;
  const canUpdateAthlete = hasPermission(role, 'athletes', 'update');
  const canExport = hasPermission(role, 'athletes', 'export');
  const canCreateParent = hasPermission(role, 'parents', 'create');

  // Registration Form State (supports both ONLINE & OFFLINE + Pas Foto)
  const defaultRegChannel: 'ONLINE' | 'OFFLINE' = canCreateAthlete ? 'OFFLINE' : 'ONLINE';
  const [regForm, setRegForm] = useState({
    registrationChannel: defaultRegChannel,
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    ageGroupId: state.ageGroups[0]?.id || '',
    teamId: state.teams[0]?.id || '',
    fullName: '',
    nickname: '',
    gender: 'MALE',
    birthDate: '2011-05-15',
    birthPlace: 'Jakarta',
    identityNumber: '',
    photoUrl: '',
    photoSizeSpec: (regConfig.defaultPhotoSizeSpec || '3x4') as '3x4' | '4x6',
    photoBgColor: (regConfig.defaultPhotoBgColor || 'RED') as 'RED' | 'BLUE' | 'WHITE',
    position: 'PG',
    heightCm: '168',
    weightKg: '58',
    jerseySize: 'L',
    jerseyNumber: '11',
    parentContactName: '',
    parentContactPhone: '',
    parentEmail: '',
    parentRelationship: 'FATHER',
    emergencyContactName: '',
    emergencyContactPhone: '',
    planId: state.membershipPlans[0]?.id || '',
  });

  // New Parent Form
  const [parentForm, setParentForm] = useState({
    branchId: state.currentUser.branchId || state.branches[0]?.id || '',
    fullName: '',
    relationshipType: 'FATHER',
    phone: '',
    email: '',
    occupation: '',
    address: '',
    athleteId: state.athletes[0]?.id || '',
  });

  const filteredAthletes = useMemo(() => {
    return state.athletes.filter((a) => {
      const matchesSearch =
        a.fullName.toLowerCase().includes(search.toLowerCase()) ||
        a.memberCode.toLowerCase().includes(search.toLowerCase()) ||
        (a.registrationNo || '').toLowerCase().includes(search.toLowerCase()) ||
        a.parentContactName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || a.membershipStatus === statusFilter;
      const matchesTeam = teamFilter === 'ALL' || a.teamId === teamFilter;
      const matchesChannel =
        channelFilter === 'ALL' || (a.registrationChannel || 'OFFLINE') === channelFilter;
      return matchesSearch && matchesStatus && matchesTeam && matchesChannel;
    });
  }, [state.athletes, search, statusFilter, teamFilter, channelFilter]);

  const selectedAthlete = useMemo(
    () => state.athletes.find((a) => a.id === selectedAthleteId) || null,
    [state.athletes, selectedAthleteId]
  );

  const handleRegisterAthlete = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const finalPhotoUrl =
        regForm.photoUrl && regForm.photoUrl.trim().length > 0
          ? regForm.photoUrl
          : buildDefaultPassportPhotoSvg({
              fullName: regForm.fullName,
              jerseyNumber: regForm.jerseyNumber,
              bgColor: regForm.photoBgColor,
              sizeSpec: regForm.photoSizeSpec,
              channel: regForm.registrationChannel,
            });

      await apiRequest('/api/athletes', {
        method: 'POST',
        body: JSON.stringify({
          ...regForm,
          photoUrl: finalPhotoUrl,
          heightCm: Number(regForm.heightCm),
          weightKg: Number(regForm.weightKg),
          jerseyNumber: Number(regForm.jerseyNumber),
        }),
      });
      notify(
        `Pendaftaran ${regForm.registrationChannel} atlet (${regForm.fullName}) beserta Pas Foto Resmi ${regForm.photoSizeSpec}, akun Wali, Invoice & Jurnal Akuntansi berhasil disimpan!`,
        'success'
      );
      setRegForm((prev) => ({
        ...prev,
        fullName: '',
        nickname: '',
        identityNumber: '',
        photoUrl: '',
        parentContactName: '',
        parentContactPhone: '',
        parentEmail: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
      }));
      await onRefresh();
      setSubTab('athletes');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal mendaftarkan atlet', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateAthleteStatus = async (athleteId: string, membershipStatus: string) => {
    try {
      await apiRequest(`/api/athletes/${athleteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ membershipStatus }),
      });
      notify(`Status membership atlet diperbarui menjadi ${membershipStatus} (histori tetap tersimpan).`);
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memperbarui status', 'error');
    }
  };

  const handleCreateParent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/api/parents', {
        method: 'POST',
        body: JSON.stringify(parentForm),
      });
      notify('Data orang tua/wali berhasil disimpan dan dihubungkan ke atlet.');
      setParentModalOpen(false);
      setParentForm((p) => ({ ...p, fullName: '', phone: '', email: '', occupation: '', address: '' }));
      await onRefresh();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal menambahkan orang tua', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('athletes')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
              subTab === 'athletes'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Direktori Atlet ({state.athletes.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('parents')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
              subTab === 'parents'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Orang Tua & Wali ({state.parents.length})
          </button>
          {canAccessRegisterTab && (
            <button
              type="button"
              onClick={() => setSubTab('register')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                subTab === 'register'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-900 text-amber-400 hover:bg-slate-800 border border-amber-500/40'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Pendaftaran Online & Offline (+Pas Foto)</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'athletes' && canExport && (
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv(
                  'zamoa-cbtc-athletes',
                  filteredAthletes.map((a) => ({
                    memberCode: a.memberCode,
                    fullName: a.fullName,
                    gender: a.gender,
                    birthDate: a.birthDate,
                    position: a.position,
                    heightCm: a.heightCm,
                    weightKg: a.weightKg,
                    jerseyNumber: a.jerseyNumber,
                    membershipStatus: a.membershipStatus,
                    parentContactName: a.parentContactName,
                    parentContactPhone: a.parentContactPhone,
                  }))
                )
              }
              className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor CSV</span>
            </button>
          )}
          {subTab === 'parents' && canCreateParent && (
            <button
              type="button"
              onClick={() => setParentModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Tambah Wali / Hubungkan Atlet</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: ATHLETE DIRECTORY */}
      {subTab === 'athletes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atlet, kode member (CBTC-...), No. Reg, atau wali..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-900 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-900 border border-slate-800 rounded-md text-slate-200 font-mono"
            >
              <option value="ALL">Semua Jalur (Online & Offline)</option>
              <option value="ONLINE">Pendaftaran ONLINE</option>
              <option value="OFFLINE">Pendaftaran OFFLINE</option>
            </select>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-900 border border-slate-800 rounded-md text-slate-200"
            >
              <option value="ALL">Semua Tim</option>
              {state.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-900 border border-slate-800 rounded-md text-slate-200"
            >
              <option value="ALL">Semua Status Membership</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="ALUMNI">ALUMNI</option>
            </select>
          </div>

          {filteredAthletes.length === 0 ? (
            <EmptyState
              title="Tidak ada data atlet yang sesuai filter"
              description="Gunakan kata kunci pencarian lain atau daftarkan atlet baru melalui workflow pendaftaran."
              actionLabel={canCreateAthlete ? 'Daftarkan Atlet Baru' : undefined}
              onAction={canCreateAthlete ? () => setSubTab('register') : undefined}
            />
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                      <th className="py-3 px-4">Kode & Nama Atlet</th>
                      <th className="py-3 px-4">Usia & Tim</th>
                      <th className="py-3 px-4">Pos / Fisik / Jersey</th>
                      <th className="py-3 px-4">Orang Tua & Darurat</th>
                      <th className="py-3 px-4">Membership</th>
                      <th className="py-3 px-4 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {filteredAthletes.map((a) => {
                      const team = state.teams.find((t) => t.id === a.teamId);
                      const ageGroup = state.ageGroups.find((ag) => ag.id === a.ageGroupId);
                      return (
                        <tr key={a.id} className="hover:bg-slate-800/30">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <AthletePhotoThumbnail
                                photoUrl={a.photoUrl}
                                fullName={a.fullName}
                                jerseyNumber={a.jerseyNumber}
                                photoBgColor={a.photoBgColor || 'RED'}
                                photoSizeSpec={a.photoSizeSpec || '3x4'}
                                size="md"
                                onClick={() => setSelectedAthleteId(a.id)}
                              />
                              <div
                                className="cursor-pointer shrink-0"
                                onClick={() => setSelectedAthleteId(a.id)}
                                title="Klik untuk melihat Profil & Kartu QR Pemain"
                              >
                                <QrCodeSvg code={a.memberCode} entityType="ATHLETE" sizePx={54} />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-bold text-amber-400">
                                    {a.memberCode}
                                  </span>
                                  <span
                                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                      a.registrationChannel === 'ONLINE'
                                        ? 'bg-sky-950/60 border-sky-700/60 text-sky-300'
                                        : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                                    }`}
                                  >
                                    {a.registrationChannel || 'OFFLINE'}
                                  </span>
                                </div>
                                <div className="font-semibold text-slate-100">{a.fullName}</div>
                                <div className="text-xs text-slate-400">
                                  {a.gender} • Lahir: {a.birthDate}
                                  {a.registrationNo ? ` • ${a.registrationNo}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="font-semibold text-slate-200">{team?.name || 'Belum masuk tim'}</div>
                            <div className="text-slate-400">{ageGroup?.name || '-'}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-200">
                            <div>
                              Pos: <span className="text-amber-300 font-bold">{a.position}</span> (#
                              {a.jerseyNumber} / Size {a.jerseySize})
                            </div>
                            <div className="text-slate-400">
                              {a.heightCm} cm • {a.weightKg} kg
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="text-slate-200 font-medium">{a.parentContactName}</div>
                            <div className="font-mono text-slate-400">{a.parentContactPhone}</div>
                          </td>
                          <td className="py-3 px-4">
                            <StatusText status={a.membershipStatus} />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const branch = state.branches.find((b) => b.id === a.branchId);
                                  downloadDigitalQrCardSvg(
                                    {
                                      id: a.id,
                                      entityType: 'ATHLETE',
                                      code: a.memberCode,
                                      fullName: a.fullName,
                                      roleTitle: `Pemain / Atlet • Posisi ${a.position} (#${a.jerseyNumber})`,
                                      subtitle: `${team?.name || 'Tim Akademi'} • Jersey ${a.jerseySize}`,
                                      branchId: a.branchId,
                                      branchName: branch?.name || 'Jakarta HQ',
                                      status: a.membershipStatus,
                                      attendanceCount: 0,
                                      lastSignature: `QR-PASS-${a.memberCode}`,
                                    },
                                    state.organization.name
                                  );
                                }}
                                className="px-2.5 py-1.5 text-xs font-mono text-slate-200 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded inline-flex items-center gap-1"
                                title="Unduh Kartu QR Pemain (.SVG)"
                              >
                                <QrCode className="w-3.5 h-3.5 text-amber-400" />
                                <span>Unduh QR</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedAthleteId(a.id)}
                                className="px-3 py-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded inline-flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Profil 360° & QR</span>
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
          )}
        </div>
      )}

      {/* TAB 2: PARENTS & GUARDIANS */}
      {subTab === 'parents' && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/70">
                  <th className="py-3 px-4">Nama Orang Tua / Wali</th>
                  <th className="py-3 px-4">Hubungan</th>
                  <th className="py-3 px-4">Kontak</th>
                  <th className="py-3 px-4">Pekerjaan & Alamat</th>
                  <th className="py-3 px-4">Atlet Terhubung (Multi-Child)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {state.parents.map((p) => {
                  const links = state.parentAthletes.filter((pa) => pa.parentId === p.id);
                  const linkedAthletes = links
                    .map((l) => state.athletes.find((a) => a.id === l.athleteId))
                    .filter(Boolean);
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-semibold text-slate-100">{p.fullName}</td>
                      <td className="py-3 px-4 font-mono text-xs text-amber-400">
                        {p.relationshipType}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-mono text-slate-200">{p.phone}</div>
                        <div className="text-slate-400">{p.email || '-'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-300">
                        <div>{p.occupation || '-'}</div>
                        <div className="text-slate-400">{p.address || '-'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {linkedAthletes.length > 0 ? (
                          <div className="space-y-1">
                            {linkedAthletes.map((ath) => (
                              <div
                                key={ath!.id}
                                className="flex items-center justify-between gap-2 font-medium text-slate-200 bg-slate-950/60 px-2.5 py-1.5 rounded border border-slate-800"
                              >
                                <div>
                                  {ath!.fullName}{' '}
                                  <span className="font-mono text-amber-400">
                                    ({ath!.memberCode})
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedAthleteId(ath!.id)}
                                  className="px-2 py-0.5 text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-amber-300 rounded flex items-center gap-1"
                                >
                                  <QrCode className="w-3 h-3" />
                                  <span>Lihat QR</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500">Belum terhubung</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Portal Pembayaran Mudah Parent & Pemain */}
          <div className="p-5 border-t border-slate-800 bg-slate-950/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-mono uppercase text-amber-400">
                  PORTAL PEMBAYARAN MUDAH ORANG TUA (PARENT) & PEMAIN
                </div>
                <h4 className="text-sm font-bold text-slate-100 mt-0.5">
                  Daftar Tagihan Aktif & Riwayat Pembayaran (Bisa QRIS, E-Wallet & Transfer Bank)
                </h4>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {state.invoices.map((inv) => {
                const ath = state.athletes.find((a) => a.id === inv.athleteId);
                const remaining = Math.max(
                  0,
                  Number(inv.totalAmount) - Number(inv.paidAmount)
                );
                return (
                  <div
                    key={inv.id}
                    className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-amber-400">
                        {inv.invoiceNumber} • {ath?.fullName || 'Atlet Akademi'}
                      </div>
                      <div className="text-slate-300 mt-0.5">{inv.description}</div>
                      <div className="text-slate-400 font-mono mt-0.5">
                        Total: {formatIDR(inv.totalAmount)} • Sisa:{' '}
                        <span className="text-emerald-400 font-bold">
                          {formatIDR(remaining)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <StatusText status={inv.status} />
                      {remaining > 0 && inv.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          onClick={() => setEasyPayInvoiceId(inv.id)}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Bayar (QRIS / E-Wallet / Bank)</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setWaEmailModal({
                            mode: remaining <= 0 ? 'RECEIPT' : 'INVOICE',
                            invoiceId: inv.id,
                          })
                        }
                        className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>WA & Email</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: END-TO-END ATHLETE REGISTRATION WORKFLOW (ONLINE & OFFLINE + PAS FOTO) */}
      {subTab === 'register' && canAccessRegisterTab && (
        <form
          onSubmit={handleRegisterAthlete}
          className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 space-y-6"
        >
          <div className="border-b border-slate-800 pb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-amber-400">
                SISTEM PENDAFTARAN TERPADU • WAJIB PAS FOTO RESMI ATLET
              </div>
              <h3 className="text-base font-semibold text-slate-100 mt-0.5">
                Formulir Pendaftaran Atlet / Pemain Baru ({regForm.registrationChannel})
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Mendukung pendaftaran Online Mandiri maupun Offline (Walk-In Sekretariat) lengkap dengan pengambilan/unggah Pas Foto Resmi ({regForm.photoSizeSpec}), pembuatan akun Orang Tua/Wali, Kartu ID QR, Invoice Membership, dan Jurnal Akuntansi Double-Entry otomatis.
              </p>
            </div>

            {/* Online vs Offline Channel Selector */}
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setRegForm((prev) => ({
                    ...prev,
                    registrationChannel: 'ONLINE',
                  }))
                }
                className={`px-3.5 py-2.5 rounded-lg border text-left transition-colors flex items-center gap-2.5 ${
                  regForm.registrationChannel === 'ONLINE'
                    ? 'bg-sky-500/15 border-sky-400 text-sky-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold">Pendaftaran ONLINE</div>
                  <div className="text-[10px] font-mono opacity-80">
                    Mandiri / Web & HP ({regConfig.onlineRegistrationPrefix})
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={!canCreateAthlete}
                onClick={() =>
                  setRegForm((prev) => ({
                    ...prev,
                    registrationChannel: 'OFFLINE',
                  }))
                }
                className={`px-3.5 py-2.5 rounded-lg border text-left transition-colors flex items-center gap-2.5 ${
                  regForm.registrationChannel === 'OFFLINE'
                    ? 'bg-amber-500/15 border-amber-400 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40'
                }`}
              >
                <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold">Pendaftaran OFFLINE</div>
                  <div className="text-[10px] font-mono opacity-80">
                    Walk-In Loket Cabang ({regConfig.offlineRegistrationPrefix})
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* PAS FOTO ATLET / PEMAIN INPUT SECTION */}
          <AthletePassportPhotoInput
            photoUrl={regForm.photoUrl}
            photoSizeSpec={regForm.photoSizeSpec}
            photoBgColor={regForm.photoBgColor}
            registrationChannel={regForm.registrationChannel}
            fullName={regForm.fullName}
            jerseyNumber={regForm.jerseyNumber}
            required={regConfig.requireAthletePhoto}
            onChange={(nextPhoto) =>
              setRegForm((prev) => ({
                ...prev,
                photoUrl: nextPhoto.photoUrl,
                photoSizeSpec: nextPhoto.photoSizeSpec,
                photoBgColor: nextPhoto.photoBgColor,
              }))
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cabang Akademi *</label>
              <select
                required
                value={regForm.branchId}
                onChange={(e) => setRegForm({ ...regForm, branchId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                {state.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Kelompok Umur (KU)</label>
              <select
                value={regForm.ageGroupId}
                onChange={(e) => setRegForm({ ...regForm, ageGroupId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                <option value="">-- Pilih Kelompok Umur --</option>
                {state.ageGroups.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name} ({ag.minAge}-{ag.maxAge} Thn)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tim penempatan</label>
              <select
                value={regForm.teamId}
                onChange={(e) => setRegForm({ ...regForm, teamId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                <option value="">-- Pilih Tim --</option>
                {state.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Nama Lengkap Atlet *</label>
              <input
                type="text"
                required
                value={regForm.fullName}
                onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                placeholder="Contoh: Brandon Pratama Wijaya"
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nama Panggilan</label>
              <input
                type="text"
                value={regForm.nickname}
                onChange={(e) => setRegForm({ ...regForm, nickname: e.target.value })}
                placeholder="Brandon"
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">NIK / Nomor Identitas</label>
              <input
                type="text"
                value={regForm.identityNumber}
                onChange={(e) => setRegForm({ ...regForm, identityNumber: e.target.value })}
                placeholder="31740..."
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Jenis Kelamin *</label>
              <select
                value={regForm.gender}
                onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                <option value="MALE">Laki-laki (Putra)</option>
                <option value="FEMALE">Perempuan (Putri)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tanggal Lahir *</label>
              <input
                type="date"
                required
                value={regForm.birthDate}
                onChange={(e) => setRegForm({ ...regForm, birthDate: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Posisi Bermain *</label>
              <select
                value={regForm.position}
                onChange={(e) => setRegForm({ ...regForm, position: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                <option value="PG">Point Guard (PG)</option>
                <option value="SG">Shooting Guard (SG)</option>
                <option value="SF">Small Forward (SF)</option>
                <option value="PF">Power Forward (PF)</option>
                <option value="C">Center (C)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Tinggi Badan (cm) *</label>
              <input
                type="number"
                required
                min={80}
                max={250}
                value={regForm.heightCm}
                onChange={(e) => setRegForm({ ...regForm, heightCm: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Berat Badan (kg) *</label>
              <input
                type="number"
                required
                min={15}
                max={180}
                value={regForm.weightKg}
                onChange={(e) => setRegForm({ ...regForm, weightKg: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ukuran Jersey *</label>
                <select
                  value={regForm.jerseySize}
                  onChange={(e) => setRegForm({ ...regForm, jerseySize: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                >
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nomor Punggung *</label>
                <input
                  type="number"
                  required
                  min={0}
                  max={99}
                  value={regForm.jerseyNumber}
                  onChange={(e) => setRegForm({ ...regForm, jerseyNumber: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nama Orang Tua / Wali Utama *</label>
              <input
                type="text"
                required
                value={regForm.parentContactName}
                onChange={(e) => setRegForm({ ...regForm, parentContactName: e.target.value })}
                placeholder="Nama Ayah / Ibu / Wali"
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">No. Telepon Orang Tua *</label>
              <input
                type="text"
                required
                value={regForm.parentContactPhone}
                onChange={(e) => setRegForm({ ...regForm, parentContactPhone: e.target.value })}
                placeholder="0812..."
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hubungan Wali</label>
              <select
                value={regForm.parentRelationship}
                onChange={(e) => setRegForm({ ...regForm, parentRelationship: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                <option value="FATHER">Ayah (FATHER)</option>
                <option value="MOTHER">Ibu (MOTHER)</option>
                <option value="GUARDIAN">Wali (GUARDIAN)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nama Kontak Darurat *</label>
              <input
                type="text"
                required
                value={regForm.emergencyContactName}
                onChange={(e) => setRegForm({ ...regForm, emergencyContactName: e.target.value })}
                placeholder="Kontak darurat medis"
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Telepon Kontak Darurat *</label>
              <input
                type="text"
                required
                value={regForm.emergencyContactPhone}
                onChange={(e) => setRegForm({ ...regForm, emergencyContactPhone: e.target.value })}
                placeholder="0811..."
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Paket Membership Awal (Auto-Invoice)</label>
              <select
                value={regForm.planId}
                onChange={(e) => setRegForm({ ...regForm, planId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                <option value="">-- Tanpa Paket Awal --</option>
                {state.membershipPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {formatIDR(plan.feeAmount)} (+Reg {formatIDR(plan.registrationFee)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setSubTab('athletes')}
              className="px-4 py-2 text-xs font-medium text-slate-300 border border-slate-700 rounded-md"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md disabled:opacity-50"
            >
              {submitting ? 'Memproses Pendaftaran & Jurnal...' : 'Simpan & Aktifkan Atlet'}
            </button>
          </div>
        </form>
      )}

      {/* 360° ATHLETE DETAIL DRAWER */}
      <Drawer
        open={Boolean(selectedAthlete)}
        onClose={() => setSelectedAthleteId(null)}
        title={selectedAthlete ? `${selectedAthlete.fullName} (${selectedAthlete.memberCode})` : ''}
        subtitle="Profil 360° Atlet — Riwayat Latihan, Evaluasi, Statistik, Medis & Keuangan"
      >
        {selectedAthlete && (
          <div className="space-y-6">
            {/* Official Digital QR Pass + Pas Foto Card for Athlete */}
            <div className="p-4 rounded-xl border border-amber-500/30 bg-slate-950 space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <AthletePhotoThumbnail
                    photoUrl={selectedAthlete.photoUrl}
                    fullName={selectedAthlete.fullName}
                    jerseyNumber={selectedAthlete.jerseyNumber}
                    photoBgColor={selectedAthlete.photoBgColor || 'RED'}
                    photoSizeSpec={selectedAthlete.photoSizeSpec || '3x4'}
                    size="lg"
                  />
                  <QrCodeSvg
                    code={selectedAthlete.memberCode}
                    entityType="ATHLETE"
                    sizePx={108}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
                        PAS FOTO & KARTU QR PEMAIN
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                        {selectedAthlete.registrationChannel || 'OFFLINE'}
                      </span>
                    </div>
                    <div className="text-base font-bold text-slate-100 mt-0.5">
                      {selectedAthlete.fullName}
                    </div>
                    <div className="text-xs font-mono font-bold text-amber-400">
                      {selectedAthlete.memberCode}
                    </div>
                    {selectedAthlete.registrationNo && (
                      <div className="text-[11px] font-mono text-slate-400">
                        No. Registrasi: {selectedAthlete.registrationNo}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 mt-1">
                      Posisi {selectedAthlete.position} • Jersey #{selectedAthlete.jerseyNumber} ({selectedAthlete.jerseySize})
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setEditingPhotoInDrawer((prev) => !prev)}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded flex items-center justify-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{editingPhotoInDrawer ? 'Tutup Editor Pas Foto' : 'Ganti Pas Foto 3x4'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(selectedAthlete.memberCode);
                      notify(`Kode QR Pemain ${selectedAthlete.memberCode} disalin.`);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded flex items-center justify-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    <span>Salin Kode QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const branch = state.branches.find((b) => b.id === selectedAthlete.branchId);
                      const team = state.teams.find((t) => t.id === selectedAthlete.teamId);
                      downloadDigitalQrCardSvg(
                        {
                          id: selectedAthlete.id,
                          entityType: 'ATHLETE',
                          code: selectedAthlete.memberCode,
                          fullName: selectedAthlete.fullName,
                          roleTitle: `Pemain / Atlet • Posisi ${selectedAthlete.position} (#${selectedAthlete.jerseyNumber})`,
                          subtitle: `${team?.name || 'Tim Akademi'} • Jersey ${selectedAthlete.jerseySize}`,
                          branchId: selectedAthlete.branchId,
                          branchName: branch?.name || 'Jakarta HQ',
                          status: selectedAthlete.membershipStatus,
                          attendanceCount: 0,
                          lastSignature: `QR-PASS-${selectedAthlete.memberCode}`,
                        },
                        state.organization.name
                      );
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Kartu QR (.SVG)</span>
                  </button>
                </div>
              </div>

              {editingPhotoInDrawer && (
                <div className="pt-3 border-t border-slate-800">
                  <AthletePassportPhotoInput
                    photoUrl={selectedAthlete.photoUrl || ''}
                    photoSizeSpec={(selectedAthlete.photoSizeSpec as '3x4' | '4x6') || '3x4'}
                    photoBgColor={(selectedAthlete.photoBgColor as 'RED' | 'BLUE' | 'WHITE') || 'RED'}
                    registrationChannel={
                      (selectedAthlete.registrationChannel as 'ONLINE' | 'OFFLINE') || 'OFFLINE'
                    }
                    fullName={selectedAthlete.fullName}
                    jerseyNumber={selectedAthlete.jerseyNumber}
                    onChange={async (next) => {
                      try {
                        await apiRequest(`/api/athletes/${selectedAthlete.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            photoUrl: next.photoUrl,
                            photoSizeSpec: next.photoSizeSpec,
                            photoBgColor: next.photoBgColor,
                          }),
                        });
                        notify(`Pas Foto resmi (${next.photoSizeSpec}) untuk ${selectedAthlete.fullName} berhasil diperbarui.`);
                        await onRefresh();
                      } catch (err: unknown) {
                        notify(
                          err instanceof Error ? err.message : 'Gagal memperbarui pas foto atlet',
                          'error'
                        );
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* Status & Quick Actions */}
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400">Status Membership Saat Ini</div>
                <div className="mt-1">
                  <StatusText status={selectedAthlete.membershipStatus} />
                </div>
              </div>
              {canUpdateAthlete && (
                <div className="flex items-center gap-1.5">
                  {(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ALUMNI'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleUpdateAthleteStatus(selectedAthlete.id, st)}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded border ${
                        selectedAthlete.membershipStatus === st
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Biodata & Fisik */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded border border-slate-800 bg-slate-950/40">
                <span className="text-slate-400 block">Posisi & Jersey</span>
                <span className="font-mono font-semibold text-slate-100">
                  {selectedAthlete.position} • #{selectedAthlete.jerseyNumber} ({selectedAthlete.jerseySize})
                </span>
              </div>
              <div className="p-3 rounded border border-slate-800 bg-slate-950/40">
                <span className="text-slate-400 block">Postur Fisik</span>
                <span className="font-mono font-semibold text-slate-100">
                  {selectedAthlete.heightCm} cm / {selectedAthlete.weightKg} kg
                </span>
              </div>
              <div className="p-3 rounded border border-slate-800 bg-slate-950/40">
                <span className="text-slate-400 block">Orang Tua / Wali</span>
                <span className="font-semibold text-slate-100 block">{selectedAthlete.parentContactName}</span>
                <span className="font-mono text-slate-400">{selectedAthlete.parentContactPhone}</span>
              </div>
              <div className="p-3 rounded border border-slate-800 bg-slate-950/40">
                <span className="text-slate-400 block">Kontak Darurat</span>
                <span className="font-semibold text-slate-100 block">
                  {selectedAthlete.emergencyContactName}
                </span>
                <span className="font-mono text-slate-400">{selectedAthlete.emergencyContactPhone}</span>
              </div>
            </div>

            {/* Evaluations */}
            <div>
              <h4 className="text-xs font-mono uppercase text-amber-400 mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                <span>Riwayat Evaluasi Perkembangan</span>
              </h4>
              <div className="space-y-2">
                {state.playerEvaluations
                  .filter((ev) => ev.athleteId === selectedAthlete.id)
                  .map((ev) => (
                    <div key={ev.id} className="p-3 rounded border border-slate-800 bg-slate-950/50 text-xs">
                      <div className="flex items-center justify-between font-semibold text-slate-100">
                        <span>{ev.periodLabel} ({ev.evaluationDate})</span>
                        <span className="font-mono text-amber-400">Skor: {ev.overallScore}</span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-400 mt-1">
                        Technical: {ev.technicalAvg} | Physical: {ev.physicalAvg} | Mental: {ev.mentalAvg}
                      </div>
                      <p className="text-slate-300 mt-1.5">{ev.coachRecommendation}</p>
                    </div>
                  ))}
                {state.playerEvaluations.filter((ev) => ev.athleteId === selectedAthlete.id).length ===
                  0 && <p className="text-xs text-slate-500">Belum ada evaluasi tercatat.</p>}
              </div>
            </div>

            {/* Match Stats & Achievements */}
            <div>
              <h4 className="text-xs font-mono uppercase text-amber-400 mb-2 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                <span>Statistik Pertandingan & Prestasi</span>
              </h4>
              <div className="space-y-2">
                {state.matchStats
                  .filter((ms) => ms.athleteId === selectedAthlete.id)
                  .map((ms) => {
                    const match = state.matches.find((m) => m.id === ms.matchId);
                    return (
                      <div
                        key={ms.id}
                        className="p-3 rounded border border-slate-800 bg-slate-950/50 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-slate-200">
                            vs {match?.opponentName || 'Lawan'}
                          </div>
                          <div className="text-slate-400">{match?.matchDate} ({ms.minutesPlayed} Mnt)</div>
                        </div>
                        <div className="font-mono text-slate-100">
                          {ms.points} PTS • {ms.rebounds} REB • {ms.assists} AST • {ms.steals} STL
                        </div>
                      </div>
                    );
                  })}
                {state.achievements
                  .filter((ach) => ach.athleteId === selectedAthlete.id)
                  .map((ach) => (
                    <div
                      key={ach.id}
                      className="p-2.5 rounded border border-amber-500/30 bg-amber-950/20 text-xs flex items-center justify-between"
                    >
                      <span className="font-semibold text-amber-300">{ach.title}</span>
                      <span className="font-mono text-slate-300">{ach.rankPosition}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Medical & Return to Play */}
            <div>
              <h4 className="text-xs font-mono uppercase text-amber-400 mb-2 flex items-center gap-1.5">
                <HeartPulse className="w-3.5 h-3.5" />
                <span>Rekam Medis & Cedera</span>
              </h4>
              {state.medicalRecords
                .filter((mr) => mr.athleteId === selectedAthlete.id)
                .map((mr) => (
                  <div key={mr.id} className="p-3 rounded border border-slate-800 bg-slate-950/50 text-xs mb-2">
                    <div className="flex justify-between">
                      <span>Gol. Darah: <strong>{mr.bloodType}</strong></span>
                      <StatusText status={mr.returnToPlayStatus} />
                    </div>
                    <div className="text-slate-400 mt-1">
                      Alergi: {mr.allergies || 'Tidak ada'} | Kondisi: {mr.chronicConditions || 'Normal'}
                    </div>
                  </div>
                ))}
            </div>

            {/* Financial Invoices */}
            <div>
              <h4 className="text-xs font-mono uppercase text-amber-400 mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>Riwayat Tagihan & Pembayaran Mudah (QRIS / E-Wallet / Bank)</span>
              </h4>
              <div className="space-y-2">
                {state.invoices
                  .filter((inv) => inv.athleteId === selectedAthlete.id)
                  .map((inv) => {
                    const remaining = Math.max(
                      0,
                      Number(inv.totalAmount) - Number(inv.paidAmount)
                    );
                    return (
                      <div
                        key={inv.id}
                        className="p-3 rounded border border-slate-800 bg-slate-950/50 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-mono text-slate-200">{inv.invoiceNumber}</div>
                          <div className="text-slate-400">{inv.description}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="font-mono font-semibold text-slate-100">
                              {formatIDR(inv.totalAmount)}
                            </div>
                            <StatusText status={inv.status} />
                          </div>
                          {remaining > 0 && inv.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => setEasyPayInvoiceId(inv.id)}
                              className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Bayar Mudah</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setWaEmailModal({
                                mode: remaining <= 0 ? 'RECEIPT' : 'INVOICE',
                                invoiceId: inv.id,
                              })
                            }
                            className="px-2 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>WA/Email</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL ADD PARENT */}
      <Modal
        open={parentModalOpen}
        onClose={() => setParentModalOpen(false)}
        title="Tambah Data Orang Tua / Wali & Hubungkan ke Atlet"
        subtitle="Mendukung relasi multi-anak (satu wali untuk beberapa atlet) dan multi-wali."
      >
        <form onSubmit={handleCreateParent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cabang *</label>
              <select
                value={parentForm.branchId}
                onChange={(e) => setParentForm({ ...parentForm, branchId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                {state.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hubungan Keluarga *</label>
              <select
                value={parentForm.relationshipType}
                onChange={(e) => setParentForm({ ...parentForm, relationshipType: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                <option value="FATHER">FATHER (Ayah)</option>
                <option value="MOTHER">MOTHER (Ibu)</option>
                <option value="GUARDIAN">GUARDIAN (Wali)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nama Lengkap *</label>
              <input
                type="text"
                required
                value={parentForm.fullName}
                onChange={(e) => setParentForm({ ...parentForm, fullName: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nomor Telepon / WhatsApp *</label>
              <input
                type="text"
                required
                value={parentForm.phone}
                onChange={(e) => setParentForm({ ...parentForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={parentForm.email}
                onChange={(e) => setParentForm({ ...parentForm, email: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Pekerjaan</label>
              <input
                type="text"
                value={parentForm.occupation}
                onChange={(e) => setParentForm({ ...parentForm, occupation: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Hubungkan dengan Atlet</label>
              <select
                value={parentForm.athleteId}
                onChange={(e) => setParentForm({ ...parentForm, athleteId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded text-slate-100"
              >
                <option value="">-- Pilih Atlet --</option>
                {state.athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName} ({a.memberCode})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setParentModalOpen(false)}
              className="px-4 py-2 text-xs text-slate-300 border border-slate-700 rounded"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded"
            >
              Simpan Wali
            </button>
          </div>
        </form>
      </Modal>

      {easyPayInvoiceId && (
        <EasyPaymentPortalModal
          open={Boolean(easyPayInvoiceId)}
          onClose={() => setEasyPayInvoiceId(null)}
          state={state}
          invoiceId={easyPayInvoiceId}
          onRefresh={onRefresh}
          notify={notify}
        />
      )}

      {waEmailModal && (
        <WaEmailDispatchModal
          open={Boolean(waEmailModal)}
          onClose={() => setWaEmailModal(null)}
          state={state}
          mode={waEmailModal.mode}
          invoiceId={waEmailModal.invoiceId}
          onRefresh={onRefresh}
          notify={notify}
        />
      )}
    </div>
  );
}
