import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ============================================================================
// 1. ORGANIZATION & MULTI-BRANCH (DOM-B)
// ============================================================================
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull(),
  legalName: varchar('legal_name', { length: 200 }),
  fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1),
  settingsJson: jsonb('settings_json').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    city: varchar('city', { length: 100 }).notNull(),
    address: text('address').notNull(),
    phone: varchar('phone', { length: 30 }),
    courtsCount: integer('courts_count').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_branches_org_code').on(table.organizationId, table.code),
    index('idx_branches_org').on(table.organizationId),
  ]
);

// ============================================================================
// 2. IDENTITY & RBAC (DOM-A)
// ============================================================================
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: varchar('uid', { length: 128 }).notNull().unique(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    email: varchar('email', { length: 255 }).notNull().unique(),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    phone: varchar('phone', { length: 30 }),
    activeRoleCode: varchar('active_role_code', { length: 50 }).notNull().default('SUPER_ADMIN'),
    jobTitle: varchar('job_title', { length: 120 }).default('Executive Super Admin'),
    jobFunction: varchar('job_function', { length: 120 }).default('EXECUTIVE_GOVERNANCE'),
    department: varchar('department', { length: 80 }).default('MANAJEMEN_PUSAT'),
    defaultLandingModule: varchar('default_landing_module', { length: 50 }).notNull().default('dashboard'),
    allowedModulesJson: jsonb('allowed_modules_json').$type<string[]>(),
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_users_org').on(table.organizationId),
    index('idx_users_branch').on(table.branchId),
  ]
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_roles_org_code').on(table.organizationId, table.code)]
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    domain: varchar('domain', { length: 50 }).notNull(),
    action: varchar('action', { length: 30 }).notNull(), // view, create, update, delete, approve, export, manage, process, audit
    description: text('description'),
  },
  (table) => [uniqueIndex('uq_permissions_domain_action').on(table.domain, table.action)]
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('uq_role_permissions').on(table.roleId, table.permissionId)]
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_user_roles_assignment').on(table.userId, table.roleId)]
);

export const jobRoleConfigs = pgTable(
  'job_role_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    roleCode: varchar('role_code', { length: 50 }).notNull(),
    roleName: varchar('role_name', { length: 120 }).notNull(),
    jobTitleDefault: varchar('job_title_default', { length: 120 }).notNull(),
    department: varchar('department', { length: 80 }).notNull(),
    workFunctionSummary: text('work_function_summary').notNull(),
    defaultLandingNav: varchar('default_landing_nav', { length: 50 }).notNull().default('dashboard'),
    allowedNavModules: jsonb('allowed_nav_modules').$type<string[]>().notNull(),
    primaryActionsJson: jsonb('primary_actions_json').$type<string[]>().notNull(),
    canAccessAllBranches: boolean('can_access_all_branches').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_job_role_configs_org_role').on(table.organizationId, table.roleCode),
    index('idx_job_role_configs_org').on(table.organizationId),
  ]
);

// ============================================================================
// 3. ACADEMY STRUCTURE, COACHES & STAFF HR (DOM-E, DOM-H)
// ============================================================================
export const ageGroups = pgTable(
  'age_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 20 }).notNull(), // KU-10, KU-12, KU-14, KU-16, KU-18
    name: varchar('name', { length: 80 }).notNull(),
    minAge: integer('min_age').notNull(),
    maxAge: integer('max_age').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_age_groups_org_code').on(table.organizationId, table.code)]
);

export const coaches = pgTable(
  'coaches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    coachCode: varchar('coach_code', { length: 30 }).notNull(),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    phone: varchar('phone', { length: 30 }).notNull(),
    email: varchar('email', { length: 255 }),
    licenseLevel: varchar('license_level', { length: 60 }).notNull(), // FIBA Level 1, PERBASI A, B, C
    specialization: varchar('specialization', { length: 100 }).notNull(),
    isHeadCoach: boolean('is_head_coach').notNull().default(false),
    coachType: varchar('coach_type', { length: 30 }).notNull().default('FULL_TIME'), // FULL_TIME, FREELANCE
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'), // ACTIVE, INACTIVE, ON_LEAVE
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_coaches_org_code').on(table.organizationId, table.coachCode),
    index('idx_coaches_branch').on(table.branchId),
  ]
);

export const staff = pgTable(
  'staff',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    staffCode: varchar('staff_code', { length: 30 }).notNull(),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    department: varchar('department', { length: 60 }).notNull(), // OPERATIONS, FINANCE, MEDICAL, EVENT, ADMIN
    positionTitle: varchar('position_title', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 30 }).notNull(),
    email: varchar('email', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_staff_org_code').on(table.organizationId, table.staffCode)]
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    ageGroupId: uuid('age_group_id')
      .notNull()
      .references(() => ageGroups.id, { onDelete: 'restrict' }),
    headCoachId: uuid('head_coach_id').references(() => coaches.id, { onDelete: 'set null' }),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    genderDivision: varchar('gender_division', { length: 20 }).notNull().default('PUTRA'), // PUTRA, PUTRI, MIXED
    season: varchar('season', { length: 30 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_teams_org_code').on(table.organizationId, table.code),
    index('idx_teams_branch').on(table.branchId),
  ]
);

// ============================================================================
// 4. ATHLETES & PARENTS (DOM-C, DOM-D)
// ============================================================================
export const athletes = pgTable(
  'athletes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    ageGroupId: uuid('age_group_id').references(() => ageGroups.id, { onDelete: 'set null' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    memberCode: varchar('member_code', { length: 40 }).notNull(),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    nickname: varchar('nickname', { length: 60 }),
    gender: varchar('gender', { length: 10 }).notNull(), // MALE, FEMALE
    birthDate: date('birth_date').notNull(),
    birthPlace: varchar('birth_place', { length: 100 }),
    identityNumber: varchar('identity_number', { length: 50 }),
    photoUrl: text('photo_url'),
    photoSizeSpec: varchar('photo_size_spec', { length: 20 }).notNull().default('3x4'),
    photoBgColor: varchar('photo_bg_color', { length: 20 }).notNull().default('RED'),
    photoVerified: boolean('photo_verified').notNull().default(true),
    registrationChannel: varchar('registration_channel', { length: 20 }).notNull().default('OFFLINE'), // ONLINE, OFFLINE
    registrationNo: varchar('registration_no', { length: 50 }),
    position: varchar('position', { length: 10 }).notNull().default('PG'), // PG, SG, SF, PF, C
    heightCm: numeric('height_cm', { precision: 5, scale: 2 }).notNull(),
    weightKg: numeric('weight_kg', { precision: 5, scale: 2 }).notNull(),
    jerseySize: varchar('jersey_size', { length: 10 }).notNull(),
    jerseyNumber: integer('jersey_number').notNull(),
    parentContactName: varchar('parent_contact_name', { length: 150 }).notNull(),
    parentContactPhone: varchar('parent_contact_phone', { length: 30 }).notNull(),
    emergencyContactName: varchar('emergency_contact_name', { length: 150 }).notNull(),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 30 }).notNull(),
    membershipStatus: varchar('membership_status', { length: 20 }).notNull().default('ACTIVE'), // ACTIVE, INACTIVE, SUSPENDED, ALUMNI
    joinedAt: date('joined_at').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_athletes_org_member_code').on(table.organizationId, table.memberCode),
    index('idx_athletes_branch').on(table.branchId),
    index('idx_athletes_team').on(table.teamId),
  ]
);

export const parents = pgTable(
  'parents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    relationshipType: varchar('relationship_type', { length: 30 }).notNull().default('FATHER'), // FATHER, MOTHER, GUARDIAN
    phone: varchar('phone', { length: 30 }).notNull(),
    email: varchar('email', { length: 255 }),
    occupation: varchar('occupation', { length: 100 }),
    address: text('address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_parents_org').on(table.organizationId)]
);

export const parentAthletes = pgTable(
  'parent_athletes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => parents.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    relationship: varchar('relationship', { length: 30 }).notNull().default('GUARDIAN'),
    isPrimaryGuardian: boolean('is_primary_guardian').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_parent_athlete_link').on(table.parentId, table.athleteId)]
);

// ============================================================================
// 5. TRAINING, ATTENDANCE & PLAYER DEVELOPMENT (DOM-E, DOM-F, DOM-G)
// ============================================================================
export const trainingPrograms = pgTable(
  'training_programs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    ageGroupId: uuid('age_group_id').references(() => ageGroups.id, { onDelete: 'set null' }),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    season: varchar('season', { length: 30 }).notNull(),
    focusArea: text('focus_area').notNull(),
    sessionsPerWeek: integer('sessions_per_week').notNull().default(3),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_training_program_code').on(table.organizationId, table.code)]
);

export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: 'restrict' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    coachId: uuid('coach_id')
      .notNull()
      .references(() => coaches.id, { onDelete: 'restrict' }),
    courtName: varchar('court_name', { length: 100 }).notNull(),
    sessionDate: date('session_date').notNull(),
    startTime: varchar('start_time', { length: 10 }).notNull(), // HH:MM
    endTime: varchar('end_time', { length: 10 }).notNull(), // HH:MM
    topic: varchar('topic', { length: 200 }).notNull(),
    trainingNotes: text('training_notes'),
    status: varchar('status', { length: 20 }).notNull().default('SCHEDULED'), // SCHEDULED, ONGOING, COMPLETED, CANCELLED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_training_sessions_branch_date').on(table.branchId, table.sessionDate),
    index('idx_training_sessions_coach').on(table.coachId),
  ]
);

export const attendances = pgTable(
  'attendances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => trainingSessions.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 20 }).notNull(), // PRESENT, LATE, EXCUSED, SICK, ABSENT
    source: varchar('source', { length: 20 }).notNull().default('COACH'), // QR, COACH, ADMIN
    notes: text('notes'),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Strict constraint: Satu athlete hanya memiliki satu attendance record untuk satu session
    uniqueIndex('uq_attendance_session_athlete').on(table.sessionId, table.athleteId),
    index('idx_attendance_athlete').on(table.athleteId),
  ]
);

export const coachAttendances = pgTable(
  'coach_attendances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => trainingSessions.id, { onDelete: 'cascade' }),
    coachId: uuid('coach_id')
      .notNull()
      .references(() => coaches.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 20 }).notNull().default('PRESENT'), // PRESENT, LATE, SUBSTITUTE, EXCUSED, ABSENT
    checkInMethod: varchar('check_in_method', { length: 30 }).notNull().default('DIGITAL_QR'), // DIGITAL_QR, PIN_TOKEN, COURT_KIOSK, ADMIN_VERIFY
    checkInAt: timestamp('check_in_at', { withTimezone: true }).notNull().defaultNow(),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    digitalSignatureHash: varchar('digital_signature_hash', { length: 120 }),
    notes: text('notes'),
    verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('uq_coach_attendance_session_coach').on(table.sessionId, table.coachId),
    index('idx_coach_attendance_coach').on(table.coachId),
  ]
);

export const staffAttendances = pgTable(
  'staff_attendances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => trainingSessions.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 20 }).notNull().default('PRESENT'), // PRESENT, LATE, ON_DUTY, EXCUSED, ABSENT
    checkInMethod: varchar('check_in_method', { length: 30 }).notNull().default('DIGITAL_QR'),
    checkInAt: timestamp('check_in_at', { withTimezone: true }).notNull().defaultNow(),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    digitalSignatureHash: varchar('digital_signature_hash', { length: 120 }),
    notes: text('notes'),
    verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('uq_staff_attendance_session_staff').on(table.sessionId, table.staffId),
    index('idx_staff_attendance_staff').on(table.staffId),
  ]
);

export const assessmentCriteria = pgTable(
  'assessment_criteria',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 20 }).notNull(), // TECHNICAL, PHYSICAL, MENTAL
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    minScore: integer('min_score').notNull().default(1),
    maxScore: integer('max_score').notNull().default(10),
    weight: numeric('weight', { precision: 5, scale: 2 }).notNull().default('1.00'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_assessment_criteria_org_code').on(table.organizationId, table.code)]
);

export const playerEvaluations = pgTable(
  'player_evaluations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'restrict' }),
    coachId: uuid('coach_id')
      .notNull()
      .references(() => coaches.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id').references(() => trainingSessions.id, { onDelete: 'set null' }),
    evaluationDate: date('evaluation_date').notNull(),
    periodLabel: varchar('period_label', { length: 60 }).notNull(),
    scoresJson: jsonb('scores_json').notNull(), // Keyed by criteria code -> numeric score
    technicalAvg: numeric('technical_avg', { precision: 5, scale: 2 }).notNull(),
    physicalAvg: numeric('physical_avg', { precision: 5, scale: 2 }).notNull(),
    mentalAvg: numeric('mental_avg', { precision: 5, scale: 2 }).notNull(),
    overallScore: numeric('overall_score', { precision: 5, scale: 2 }).notNull(),
    coachRecommendation: text('coach_recommendation').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_player_evaluations_athlete').on(table.athleteId)]
);

export const playerGoals = pgTable('player_goals', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  athleteId: uuid('athlete_id')
    .notNull()
    .references(() => athletes.id, { onDelete: 'cascade' }),
  coachId: uuid('coach_id').references(() => coaches.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 150 }).notNull(),
  category: varchar('category', { length: 30 }).notNull(), // TECHNICAL, PHYSICAL, MENTAL
  targetMetric: varchar('target_metric', { length: 100 }).notNull(),
  currentProgress: integer('current_progress').notNull().default(0),
  targetDate: date('target_date').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('IN_PROGRESS'), // IN_PROGRESS, ACHIEVED, MISSED
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const playerStats = pgTable('player_stats', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  athleteId: uuid('athlete_id')
    .notNull()
    .references(() => athletes.id, { onDelete: 'cascade' }),
  season: varchar('season', { length: 30 }).notNull(),
  gamesPlayed: integer('games_played').notNull().default(0),
  totalPoints: integer('total_points').notNull().default(0),
  totalRebounds: integer('total_rebounds').notNull().default(0),
  totalAssists: integer('total_assists').notNull().default(0),
  totalSteals: integer('total_steals').notNull().default(0),
  totalBlocks: integer('total_blocks').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 6. COMPETITION, TOURNAMENTS, MATCHES & STATS (DOM-K)
// ============================================================================
export const competitions = pgTable('competitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  season: varchar('season', { length: 30 }).notNull(),
  level: varchar('level', { length: 50 }).notNull(), // REGIONAL, NATIONAL, INVITATIONAL, INTERNAL
  organizer: varchar('organizer', { length: 150 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    competitionId: uuid('competition_id').references(() => competitions.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 150 }).notNull(),
    venue: varchar('venue', { length: 150 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    registrationFee: numeric('registration_fee', { precision: 15, scale: 2 }).notNull().default('0.00'),
    budgetAmount: numeric('budget_amount', { precision: 15, scale: 2 }).notNull().default('0.00'),
    transportPlan: text('transport_plan'),
    accommodationPlan: text('accommodation_plan'),
    mealsPlan: text('meals_plan'),
    participantsCount: integer('participants_count').notNull().default(12),
    status: varchar('status', { length: 20 }).notNull().default('UPCOMING'), // UPCOMING, ONGOING, COMPLETED, CANCELLED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_tournaments_branch').on(table.branchId)]
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    opponentName: varchar('opponent_name', { length: 150 }).notNull(),
    venue: varchar('venue', { length: 150 }).notNull(),
    matchDate: date('match_date').notNull(),
    matchTime: varchar('match_time', { length: 10 }).notNull(),
    ourScore: integer('our_score').notNull().default(0),
    opponentScore: integer('opponent_score').notNull().default(0),
    mvpAthleteId: uuid('mvp_athlete_id').references(() => athletes.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 20 }).notNull().default('SCHEDULED'), // SCHEDULED, COMPLETED, CANCELLED
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_matches_tournament').on(table.tournamentId)]
);

export const matchRosters = pgTable(
  'match_rosters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'restrict' }),
    jerseyNumber: integer('jersey_number').notNull(),
    position: varchar('position', { length: 10 }).notNull(),
    isStarter: boolean('is_starter').notNull().default(false),
  },
  (table) => [uniqueIndex('uq_match_roster_athlete').on(table.matchId, table.athleteId)]
);

export const matchStats = pgTable(
  'match_stats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'restrict' }),
    minutesPlayed: integer('minutes_played').notNull().default(0),
    points: integer('points').notNull().default(0),
    rebounds: integer('rebounds').notNull().default(0),
    assists: integer('assists').notNull().default(0),
    steals: integer('steals').notNull().default(0),
    blocks: integer('blocks').notNull().default(0),
    turnovers: integer('turnovers').notNull().default(0),
    fouls: integer('fouls').notNull().default(0),
    fgMade: integer('fg_made').notNull().default(0),
    fgAttempted: integer('fg_attempted').notNull().default(0),
    threePtMade: integer('three_pt_made').notNull().default(0),
    threePtAttempted: integer('three_pt_attempted').notNull().default(0),
    ftMade: integer('ft_made').notNull().default(0),
    ftAttempted: integer('ft_attempted').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_match_stat_athlete').on(table.matchId, table.athleteId)]
);

export const achievements = pgTable('achievements', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id, { onDelete: 'restrict' }),
  tournamentId: uuid('tournament_id').references(() => tournaments.id, { onDelete: 'set null' }),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  athleteId: uuid('athlete_id').references(() => athletes.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 150 }).notNull(),
  category: varchar('category', { length: 40 }).notNull(), // TEAM_CHAMPION, MVP, TOP_SCORER, ALL_STAR, MOST_IMPROVED
  rankPosition: varchar('rank_position', { length: 50 }).notNull(),
  awardedDate: date('awarded_date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 7. MEDICAL & INJURY MANAGEMENT (DOM-L)
// ============================================================================
export const medicalRecords = pgTable('medical_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id, { onDelete: 'restrict' }),
  athleteId: uuid('athlete_id')
    .notNull()
    .unique()
    .references(() => athletes.id, { onDelete: 'cascade' }),
  bloodType: varchar('blood_type', { length: 5 }).notNull(),
  allergies: text('allergies'),
  chronicConditions: text('chronic_conditions'),
  insuranceProvider: varchar('insurance_provider', { length: 100 }),
  insuranceNumber: varchar('insurance_number', { length: 80 }),
  returnToPlayStatus: varchar('return_to_play_status', { length: 30 })
    .notNull()
    .default('CLEARED'), // CLEARED, LIMITED_CONTACT, REHABILITATION, OUT
  medicalNotes: text('medical_notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const injuries = pgTable(
  'injuries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'restrict' }),
    injuryDate: date('injury_date').notNull(),
    bodyPart: varchar('body_part', { length: 80 }).notNull(),
    diagnosis: text('diagnosis').notNull(),
    severity: varchar('severity', { length: 20 }).notNull(), // MINOR, MODERATE, SEVERE
    treatmentPlan: text('treatment_plan').notNull(),
    recoveryNote: text('recovery_note'),
    returnToPlayStatus: varchar('return_to_play_status', { length: 30 })
      .notNull()
      .default('REHABILITATION'), // OUT, REHABILITATION, LIMITED_CONTACT, CLEARED
    expectedRecoveryDate: date('expected_recovery_date'),
    clearedDate: date('cleared_date'),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_injuries_athlete').on(table.athleteId)]
);

// ============================================================================
// 8. FINANCE, BILLING & DOUBLE-ENTRY ACCOUNTING (DOM-J)
// ============================================================================
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    accountType: varchar('account_type', { length: 20 }).notNull(), // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    normalBalance: varchar('normal_balance', { length: 10 }).notNull(), // DEBIT, CREDIT
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_accounts_org_code').on(table.organizationId, table.code)]
);

export const journals = pgTable(
  'journals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    journalNumber: varchar('journal_number', { length: 50 }).notNull(),
    fiscalYear: integer('fiscal_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    entryDate: date('entry_date').notNull(),
    sourceType: varchar('source_type', { length: 30 }).notNull(), // INVOICE, PAYMENT, EXPENSE, PAYROLL, ADJUSTMENT, REVERSAL
    sourceId: uuid('source_id').notNull(),
    description: text('description').notNull(),
    totalDebit: numeric('total_debit', { precision: 15, scale: 2 }).notNull(),
    totalCredit: numeric('total_credit', { precision: 15, scale: 2 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('POSTED'), // POSTED, REVERSED
    reversedByJournalId: uuid('reversed_by_journal_id'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_journals_org_number').on(table.organizationId, table.journalNumber),
    index('idx_journals_branch_date').on(table.branchId, table.entryDate),
  ]
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    journalId: uuid('journal_id')
      .notNull()
      .references(() => journals.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    debit: numeric('debit', { precision: 15, scale: 2 }).notNull().default('0.00'),
    credit: numeric('credit', { precision: 15, scale: 2 }).notNull().default('0.00'),
    memo: varchar('memo', { length: 255 }),
  },
  (table) => [index('idx_journal_entries_journal').on(table.journalId)]
);

export const membershipPlans = pgTable('membership_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  billingCycle: varchar('billing_cycle', { length: 20 }).notNull().default('MONTHLY'), // MONTHLY, QUARTERLY, ANNUAL
  feeAmount: numeric('fee_amount', { precision: 15, scale: 2 }).notNull(),
  registrationFee: numeric('registration_fee', { precision: 15, scale: 2 }).notNull().default('0.00'),
  sessionsPerWeek: integer('sessions_per_week').notNull().default(3),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => membershipPlans.id, { onDelete: 'restrict' }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'), // ACTIVE, PAUSED, EXPIRED, CANCELLED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_memberships_athlete').on(table.athleteId)]
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    athleteId: uuid('athlete_id').references(() => athletes.id, { onDelete: 'restrict' }),
    membershipId: uuid('membership_id').references(() => memberships.id, { onDelete: 'set null' }),
    invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
    revenueCategory: varchar('revenue_category', { length: 30 }).notNull(), // REGISTRATION, MEMBERSHIP, TOURNAMENT, MERCHANDISE, SPONSORSHIP, OTHER_REVENUE
    description: text('description').notNull(),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),
    totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).notNull(),
    paidAmount: numeric('paid_amount', { precision: 15, scale: 2 }).notNull().default('0.00'),
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'), // DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_invoices_org_number').on(table.organizationId, table.invoiceNumber),
    index('idx_invoices_branch_status').on(table.branchId, table.status),
  ]
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    receiptNumber: varchar('receipt_number', { length: 50 }).notNull(),
    paymentDate: date('payment_date').notNull(),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    paymentMethod: varchar('payment_method', { length: 30 }).notNull(), // BANK_TRANSFER, CASH, QRIS, VIRTUAL_ACCOUNT
    referenceNumber: varchar('reference_number', { length: 100 }),
    receivedByUserId: uuid('received_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_payments_org_receipt').on(table.organizationId, table.receiptNumber)]
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    tournamentId: uuid('tournament_id').references(() => tournaments.id, { onDelete: 'set null' }),
    expenseNumber: varchar('expense_number', { length: 50 }).notNull(),
    category: varchar('category', { length: 40 }).notNull(), // COACH_COMPENSATION, STAFF_SALARY, COURT_RENTAL, EQUIPMENT, TRANSPORTATION, ACCOMMODATION, MEDICAL, EVENT, OPERATIONAL
    vendorName: varchar('vendor_name', { length: 150 }).notNull(),
    description: text('description').notNull(),
    expenseDate: date('expense_date').notNull(),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('POSTED'), // DRAFT, APPROVED, POSTED, REVERSED
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_expenses_org_number').on(table.organizationId, table.expenseNumber)]
);

// ============================================================================
// 9. HR EMPLOYMENT, COMPENSATION & PAYROLL (DOM-H, DOM-I)
// ============================================================================
export const employments = pgTable(
  'employments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    coachId: uuid('coach_id').references(() => coaches.id, { onDelete: 'set null' }),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'set null' }),
    personnelName: varchar('personnel_name', { length: 150 }).notNull(),
    employmentType: varchar('employment_type', { length: 30 }).notNull(), // FULL_TIME_COACH, FREELANCE_COACH, STAFF
    contractNumber: varchar('contract_number', { length: 50 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'), // ACTIVE, EXPIRED, TERMINATED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_employments_org_contract').on(table.organizationId, table.contractNumber)]
);

export const compensationRules = pgTable('compensation_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  employmentId: uuid('employment_id')
    .notNull()
    .unique()
    .references(() => employments.id, { onDelete: 'cascade' }),
  monthlySalary: numeric('monthly_salary', { precision: 15, scale: 2 }).notNull().default('0.00'),
  sessionRate: numeric('session_rate', { precision: 15, scale: 2 }).notNull().default('0.00'),
  defaultBonus: numeric('default_bonus', { precision: 15, scale: 2 }).notNull().default('0.00'),
  defaultIncentive: numeric('default_incentive', { precision: 15, scale: 2 })
    .notNull()
    .default('0.00'),
  defaultDeduction: numeric('default_deduction', { precision: 15, scale: 2 })
    .notNull()
    .default('0.00'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payrolls = pgTable(
  'payrolls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    payrollNumber: varchar('payroll_number', { length: 50 }).notNull(),
    periodMonth: integer('period_month').notNull(),
    periodYear: integer('period_year').notNull(),
    totalGross: numeric('total_gross', { precision: 15, scale: 2 }).notNull().default('0.00'),
    totalDeduction: numeric('total_deduction', { precision: 15, scale: 2 })
      .notNull()
      .default('0.00'),
    totalNet: numeric('total_net', { precision: 15, scale: 2 }).notNull().default('0.00'),
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'), // DRAFT, APPROVED, PAID
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_payrolls_org_number').on(table.organizationId, table.payrollNumber)]
);

export const payrollItems = pgTable(
  'payroll_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    payrollId: uuid('payroll_id')
      .notNull()
      .references(() => payrolls.id, { onDelete: 'cascade' }),
    employmentId: uuid('employment_id')
      .notNull()
      .references(() => employments.id, { onDelete: 'restrict' }),
    personnelName: varchar('personnel_name', { length: 150 }).notNull(),
    employmentType: varchar('employment_type', { length: 30 }).notNull(),
    validSessions: integer('valid_sessions').notNull().default(0),
    sessionRate: numeric('session_rate', { precision: 15, scale: 2 }).notNull().default('0.00'),
    monthlySalary: numeric('monthly_salary', { precision: 15, scale: 2 }).notNull().default('0.00'),
    bonus: numeric('bonus', { precision: 15, scale: 2 }).notNull().default('0.00'),
    incentive: numeric('incentive', { precision: 15, scale: 2 }).notNull().default('0.00'),
    deduction: numeric('deduction', { precision: 15, scale: 2 }).notNull().default('0.00'),
    grossCompensation: numeric('gross_compensation', { precision: 15, scale: 2 }).notNull(),
    netCompensation: numeric('net_compensation', { precision: 15, scale: 2 }).notNull(),
  },
  (table) => [uniqueIndex('uq_payroll_item_employment').on(table.payrollId, table.employmentId)]
);

// ============================================================================
// 10. INVENTORY TRANSACTION LEDGER (DOM-M)
// ============================================================================
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    sku: varchar('sku', { length: 50 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(), // BALL, COURT_GEAR, JERSEY, MEDICAL_KIT, TRAINING_AID
    storageLocation: varchar('storage_location', { length: 100 }).notNull(),
    conditionStatus: varchar('condition_status', { length: 30 }).notNull().default('GOOD'), // GOOD, MAINTENANCE, DAMAGED
    unit: varchar('unit', { length: 20 }).notNull().default('PCS'),
    minStock: integer('min_stock').notNull().default(5),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_inventory_branch_sku').on(table.branchId, table.sku)]
);

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'restrict' }),
    transactionType: varchar('transaction_type', { length: 25 }).notNull(), // PURCHASE, ISSUE, RETURN, TRANSFER, MAINTENANCE, DISPOSAL
    quantityDelta: integer('quantity_delta').notNull(), // + for PURCHASE/RETURN, - for ISSUE/TRANSFER/DISPOSAL
    targetLocation: varchar('target_location', { length: 100 }),
    conditionAfter: varchar('condition_after', { length: 30 }).notNull().default('GOOD'),
    referenceNote: text('reference_note').notNull(),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_inventory_tx_item').on(table.itemId)]
);

// ============================================================================
// 11. COMMUNICATION, MEDIA, DOCUMENTS & AUDIT (DOM-N, DOM-O, DOM-Q)
// ============================================================================
export const announcements = pgTable('announcements', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  ageGroupId: uuid('age_group_id').references(() => ageGroups.id, { onDelete: 'cascade' }),
  targetRole: varchar('target_role', { length: 50 }), // ALL, PARENT, ATHLETE, COACH, STAFF
  targetAthleteId: uuid('target_athlete_id').references(() => athletes.id, {
    onDelete: 'cascade',
  }),
  title: varchar('title', { length: 150 }).notNull(),
  content: text('content').notNull(),
  priority: varchar('priority', { length: 20 }).notNull().default('NORMAL'), // NORMAL, IMPORTANT, URGENT
  publishedByUserId: uuid('published_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id').references(() => announcements.id, {
      onDelete: 'cascade',
    }),
    title: varchar('title', { length: 150 }).notNull(),
    message: text('message').notNull(),
    category: varchar('category', { length: 30 }).notNull().default('SYSTEM'), // SYSTEM, BILLING, TRAINING, ANNOUNCEMENT, MEDICAL
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_notifications_user').on(table.userId)]
);

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  entityType: varchar('entity_type', { length: 30 }).notNull(), // ATHLETE, COACH, STAFF, INVOICE, RECEIPT, CONTRACT, TOURNAMENT
  entityId: uuid('entity_id').notNull(),
  documentCategory: varchar('document_category', { length: 30 }).notNull(), // DOCUMENT, CERTIFICATE, CONTRACT, INVOICE, RECEIPT
  title: varchar('title', { length: 150 }).notNull(),
  fileType: varchar('file_type', { length: 30 }).notNull(), // PDF, DOCX, IMAGE
  fileUrl: text('file_url').notNull(),
  visibility: varchar('visibility', { length: 30 }).notNull().default('ROLE_RESTRICTED'), // PUBLIC, BRANCH, ROLE_RESTRICTED, PRIVATE
  accessPermission: varchar('access_permission', { length: 40 }).notNull().default('documents:view'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const media = pgTable('media', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  entityType: varchar('entity_type', { length: 30 }).notNull(), // TRAINING, MATCH, ATHLETE, EVENT
  entityId: uuid('entity_id').notNull(),
  mediaType: varchar('media_type', { length: 20 }).notNull(), // PHOTO, VIDEO
  title: varchar('title', { length: 150 }).notNull(),
  mediaUrl: text('media_url').notNull(),
  visibility: varchar('visibility', { length: 30 }).notNull().default('BRANCH'), // PUBLIC, BRANCH, ROLE_RESTRICTED
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: varchar('actor_name', { length: 150 }).notNull(),
    actorRole: varchar('actor_role', { length: 50 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(), // LOGIN, CREATE, UPDATE, DELETE, APPROVE, PAYMENT, JOURNAL_POSTING, PAYROLL_APPROVAL, PERMISSION_CHANGE, DATA_EXPORT
    entity: varchar('entity', { length: 60 }).notNull(),
    entityId: varchar('entity_id', { length: 100 }).notNull(),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    ipDevice: varchar('ip_device', { length: 150 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_audit_logs_org_created').on(table.organizationId, table.createdAt)]
);
