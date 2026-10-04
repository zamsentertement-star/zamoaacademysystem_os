export type RoleCode =
  | 'SUPER_ADMIN'
  | 'OWNER_DIRECTOR'
  | 'INVESTOR'
  | 'OPERATIONS_MANAGER'
  | 'FINANCE'
  | 'ADMIN'
  | 'HEAD_COACH'
  | 'COACH'
  | 'MEDICAL_STAFF'
  | 'EVENT_STAFF'
  | 'PARENT'
  | 'ATHLETE';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'export'
  | 'manage'
  | 'process'
  | 'audit';

export type DomainCode =
  | 'dashboard'
  | 'athletes'
  | 'parents'
  | 'teams'
  | 'age_groups'
  | 'training'
  | 'attendance'
  | 'development'
  | 'competition'
  | 'hr'
  | 'payroll'
  | 'finance'
  | 'accounting'
  | 'inventory'
  | 'medical'
  | 'communication'
  | 'documents'
  | 'reports'
  | 'administration'
  | 'audit';

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  description: string;
  branchScoped: boolean;
}

export const SYSTEM_ROLES: RoleDefinition[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'Otoritas penuh seluruh cabang, konfigurasi sistem, RBAC, dan jejak audit.',
    branchScoped: false,
  },
  {
    code: 'OWNER_DIRECTOR',
    name: 'Owner / Director',
    description: 'Eksekutif akademi dengan akses strategis, persetujuan finansial, payroll, dan audit.',
    branchScoped: false,
  },
  {
    code: 'INVESTOR',
    name: 'Investor',
    description: 'Akses baca pada laporan kinerja, pertumbuhan atlet, turnamen, dan laporan finansial.',
    branchScoped: false,
  },
  {
    code: 'OPERATIONS_MANAGER',
    name: 'Operations Manager',
    description: 'Pengelola operasional akademi, atlet, jadwal latihan, HR, inventaris, dan event.',
    branchScoped: true,
  },
  {
    code: 'FINANCE',
    name: 'Finance',
    description: 'Pengelola tagihan membership, pembayaran, beban, payroll, dan akuntansi double-entry.',
    branchScoped: false,
  },
  {
    code: 'ADMIN',
    name: 'Admin Cabang',
    description: 'Administrasi harian cabang: pendaftaran atlet, presensi, penagihan, dan inventaris.',
    branchScoped: true,
  },
  {
    code: 'HEAD_COACH',
    name: 'Head Coach',
    description: 'Kepala pelatih: kurikulum latihan, manajemen tim, presensi, evaluasi atlet, dan kompetisi.',
    branchScoped: true,
  },
  {
    code: 'COACH',
    name: 'Coach',
    description: 'Pelatih lapangan: sesi latihan, presensi atlet, evaluasi perkembangan, dan statistik tanding.',
    branchScoped: true,
  },
  {
    code: 'MEDICAL_STAFF',
    name: 'Medical Staff',
    description: 'Tim medis & fisioterapi: rekam medis rahasia, penanganan cedera, dan status Return-to-Play.',
    branchScoped: true,
  },
  {
    code: 'EVENT_STAFF',
    name: 'Event Staff',
    description: 'Koordinator turnamen, jadwal pertandingan, logistik event, dan dokumentasi.',
    branchScoped: true,
  },
  {
    code: 'PARENT',
    name: 'Parent / Wali',
    description: 'Orang tua/wali: akses profil, presensi, evaluasi, medis, dan tagihan atlet yang terhubung.',
    branchScoped: true,
  },
  {
    code: 'ATHLETE',
    name: 'Athlete',
    description: 'Atlet akademi: akses jadwal latihan, presensi, rapor evaluasi, statistik, dan pengumuman.',
    branchScoped: true,
  },
];

const ALL_ACTIONS: PermissionAction[] = [
  'view',
  'create',
  'update',
  'delete',
  'approve',
  'export',
  'manage',
  'process',
  'audit',
];

export const ROLE_PERMISSION_MATRIX: Record<RoleCode, Partial<Record<DomainCode, PermissionAction[]>>> = {
  SUPER_ADMIN: {
    dashboard: ALL_ACTIONS,
    athletes: ALL_ACTIONS,
    parents: ALL_ACTIONS,
    teams: ALL_ACTIONS,
    age_groups: ALL_ACTIONS,
    training: ALL_ACTIONS,
    attendance: ALL_ACTIONS,
    development: ALL_ACTIONS,
    competition: ALL_ACTIONS,
    hr: ALL_ACTIONS,
    payroll: ALL_ACTIONS,
    finance: ALL_ACTIONS,
    accounting: ALL_ACTIONS,
    inventory: ALL_ACTIONS,
    medical: ALL_ACTIONS,
    communication: ALL_ACTIONS,
    documents: ALL_ACTIONS,
    reports: ALL_ACTIONS,
    administration: ALL_ACTIONS,
    audit: ALL_ACTIONS,
  },
  OWNER_DIRECTOR: {
    dashboard: ['view', 'export'],
    athletes: ['view', 'export'],
    parents: ['view'],
    teams: ['view'],
    age_groups: ['view'],
    training: ['view'],
    attendance: ['view', 'export'],
    development: ['view', 'export'],
    competition: ['view', 'approve', 'export'],
    hr: ['view', 'approve', 'manage'],
    payroll: ['view', 'approve', 'export'],
    finance: ['view', 'approve', 'export', 'audit'],
    accounting: ['view', 'approve', 'export', 'audit'],
    inventory: ['view', 'export'],
    communication: ['view', 'create'],
    documents: ['view', 'export'],
    reports: ['view', 'export'],
    administration: ['view', 'update', 'audit'],
    audit: ['view', 'audit', 'export'],
  },
  INVESTOR: {
    dashboard: ['view', 'export'],
    athletes: ['view'],
    teams: ['view'],
    age_groups: ['view'],
    training: ['view'],
    attendance: ['view'],
    development: ['view'],
    competition: ['view'],
    finance: ['view', 'export'],
    accounting: ['view', 'export'],
    reports: ['view', 'export'],
  },
  OPERATIONS_MANAGER: {
    dashboard: ['view', 'export'],
    athletes: ['view', 'create', 'update', 'export', 'manage'],
    parents: ['view', 'create', 'update', 'manage'],
    teams: ['view', 'create', 'update', 'delete', 'manage'],
    age_groups: ['view', 'create', 'update', 'manage'],
    training: ['view', 'create', 'update', 'delete', 'manage'],
    attendance: ['view', 'create', 'update', 'process', 'export'],
    development: ['view', 'export'],
    competition: ['view', 'create', 'update', 'process', 'manage'],
    hr: ['view', 'create', 'update', 'manage'],
    payroll: ['view', 'create'],
    finance: ['view', 'create'],
    inventory: ['view', 'create', 'update', 'process', 'export', 'manage'],
    communication: ['view', 'create', 'update', 'delete'],
    documents: ['view', 'create', 'update', 'delete'],
    reports: ['view', 'export'],
    administration: ['view'],
  },
  FINANCE: {
    dashboard: ['view', 'export'],
    athletes: ['view'],
    parents: ['view'],
    hr: ['view'],
    payroll: ['view', 'create', 'update', 'process', 'export'],
    finance: ['view', 'create', 'update', 'approve', 'process', 'export', 'audit'],
    accounting: ['view', 'create', 'update', 'approve', 'process', 'export', 'audit'],
    inventory: ['view', 'audit'],
    documents: ['view', 'create', 'export'],
    reports: ['view', 'export'],
    audit: ['view', 'audit'],
  },
  ADMIN: {
    dashboard: ['view'],
    athletes: ['view', 'create', 'update', 'export'],
    parents: ['view', 'create', 'update'],
    teams: ['view', 'create', 'update'],
    age_groups: ['view'],
    training: ['view', 'create', 'update'],
    attendance: ['view', 'create', 'update', 'process'],
    development: ['view'],
    competition: ['view', 'create', 'update'],
    hr: ['view', 'create', 'update'],
    finance: ['view', 'create', 'process'],
    inventory: ['view', 'create', 'update', 'process'],
    communication: ['view', 'create', 'update'],
    documents: ['view', 'create', 'update'],
    reports: ['view', 'export'],
  },
  HEAD_COACH: {
    dashboard: ['view'],
    athletes: ['view', 'update'],
    parents: ['view'],
    teams: ['view', 'create', 'update', 'manage'],
    age_groups: ['view', 'update'],
    training: ['view', 'create', 'update', 'manage', 'process'],
    attendance: ['view', 'create', 'update', 'process'],
    development: ['view', 'create', 'update', 'approve', 'manage'],
    competition: ['view', 'create', 'update', 'process', 'manage'],
    hr: ['view'],
    inventory: ['view', 'create', 'update', 'process'],
    medical: ['view'],
    communication: ['view', 'create'],
    documents: ['view', 'create'],
    reports: ['view', 'export'],
  },
  COACH: {
    dashboard: ['view'],
    athletes: ['view'],
    parents: ['view'],
    teams: ['view'],
    age_groups: ['view'],
    training: ['view', 'create', 'update', 'process'],
    attendance: ['view', 'create', 'update', 'process'],
    development: ['view', 'create', 'update'],
    competition: ['view', 'create', 'update', 'process'],
    hr: ['view'],
    payroll: ['view'],
    inventory: ['view', 'create', 'update', 'process'],
    medical: ['view'],
    communication: ['view', 'create'],
    documents: ['view', 'create'],
    reports: ['view'],
  },
  MEDICAL_STAFF: {
    dashboard: ['view'],
    athletes: ['view'],
    training: ['view'],
    development: ['view'],
    competition: ['view'],
    medical: ['view', 'create', 'update', 'approve', 'process', 'manage'],
    documents: ['view', 'create'],
    reports: ['view'],
  },
  EVENT_STAFF: {
    dashboard: ['view'],
    athletes: ['view'],
    teams: ['view'],
    competition: ['view', 'create', 'update', 'process', 'manage'],
    finance: ['view', 'create'],
    inventory: ['view', 'create', 'update', 'process'],
    communication: ['view', 'create'],
    documents: ['view', 'create', 'update'],
    reports: ['view'],
  },
  PARENT: {
    dashboard: ['view'],
    athletes: ['view'],
    parents: ['view', 'update'],
    teams: ['view'],
    training: ['view'],
    attendance: ['view'],
    development: ['view'],
    competition: ['view'],
    finance: ['view', 'process'],
    medical: ['view'],
    communication: ['view'],
    documents: ['view'],
  },
  ATHLETE: {
    dashboard: ['view'],
    athletes: ['view'],
    teams: ['view'],
    training: ['view'],
    attendance: ['view'],
    development: ['view'],
    competition: ['view'],
    finance: ['view', 'process'],
    medical: ['view'],
    communication: ['view'],
    documents: ['view'],
  },
};

const ROLE_ALIAS_MAP: Record<string, RoleCode> = {
  ORG_ADMIN: 'OWNER_DIRECTOR',
  BRANCH_MANAGER: 'OPERATIONS_MANAGER',
  ACADEMY_ADMIN: 'ADMIN',
  FINANCE_OFFICER: 'FINANCE',
  ACCOUNTANT: 'FINANCE',
  INVENTORY_STAFF: 'OPERATIONS_MANAGER',
  ASSISTANT_COACH: 'COACH',
  PUBLIC_VISITOR: 'PARENT',
};

export function normalizeRoleCode(roleCode: string): RoleCode {
  if (!roleCode) return 'ATHLETE';
  if (roleCode in ROLE_PERMISSION_MATRIX) return roleCode as RoleCode;
  return ROLE_ALIAS_MAP[roleCode] || 'ATHLETE';
}

export function hasPermission(
  roleCode: string,
  domain: DomainCode,
  action: PermissionAction
): boolean {
  const role = normalizeRoleCode(roleCode);
  if (role === 'SUPER_ADMIN') return true;
  const domainPerms = ROLE_PERMISSION_MATRIX[role]?.[domain];
  if (!domainPerms) return false;
  return domainPerms.includes(action);
}
