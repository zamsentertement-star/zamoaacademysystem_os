import { eq, or } from 'drizzle-orm';
import { db } from './index.ts';
import {
  organizations,
  branches,
  roles,
  permissions,
  ageGroups,
  accounts,
  assessmentCriteria,
  membershipPlans,
  users,
} from './schema.ts';
import { SYSTEM_ROLES, DomainCode, PermissionAction } from '../lib/rbac.ts';
import { ensureOperationalDataSeeded } from './operationalBootstrap.ts';

let isBootstrapped = false;

export async function ensureSystemBootstrap(uid: string, email: string, displayName?: string) {
  try {
    // 1. Ensure primary Organization exists
    let orgList = await db
      .select()
      .from(organizations)
      .where(eq(organizations.code, 'ZAMOA-CBTC'));

    let org = orgList[0];
    if (!org) {
      const inserted = await db
        .insert(organizations)
        .values({
          code: 'ZAMOA-CBTC',
          name: 'ZAMOA CBTC Basketball Academy',
          legalName: 'PT Zamoa Cakra Basket Terpadu Center',
          fiscalYearStartMonth: 1,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted[0]) {
        org = inserted[0];
      } else {
        const refetched = await db
          .select()
          .from(organizations)
          .where(eq(organizations.code, 'ZAMOA-CBTC'));
        org = refetched[0];
      }
    }

    // 2. Ensure default Branches exist
    let existingBranches = await db
      .select()
      .from(branches)
      .where(eq(branches.organizationId, org.id));

    if (existingBranches.length === 0) {
      await db
        .insert(branches)
        .values([
          {
            organizationId: org.id,
            code: 'CBTC-JKT',
            name: 'ZAMOA CBTC Arena Jakarta Pusat',
            city: 'Jakarta',
            address: 'Jl. Gelora Senayan No. 18, Jakarta Pusat',
            phone: '021-57901234',
            courtsCount: 3,
            isActive: true,
          },
          {
            organizationId: org.id,
            code: 'CBTC-BDG',
            name: 'ZAMOA CBTC Training Center Bandung',
            city: 'Bandung',
            address: 'Jl. Pajajaran Arena No. 45, Bandung',
            phone: '022-42309876',
            courtsCount: 2,
            isActive: true,
          },
          {
            organizationId: org.id,
            code: 'CBTC-SBY',
            name: 'ZAMOA CBTC East Hub Surabaya',
            city: 'Surabaya',
            address: 'Jl. Kertajaya Indah Olahraga No. 9, Surabaya',
            phone: '031-59401122',
            courtsCount: 2,
            isActive: true,
          },
        ])
        .onConflictDoNothing();

      existingBranches = await db
        .select()
        .from(branches)
        .where(eq(branches.organizationId, org.id));
    }

    const primaryBranch = existingBranches[0];

    if (!isBootstrapped) {
      // 3. Ensure System Roles exist
      const existingRoles = await db
        .select()
        .from(roles)
        .where(eq(roles.organizationId, org.id));

      if (existingRoles.length === 0) {
        await db
          .insert(roles)
          .values(
            SYSTEM_ROLES.map((r) => ({
              organizationId: org.id,
              code: r.code,
              name: r.name,
              description: r.description,
              isSystem: true,
            }))
          )
          .onConflictDoNothing();
      }

      // 4. Ensure Base Permissions exist
      const existingPerms = await db.select().from(permissions);
      if (existingPerms.length === 0) {
        const domains: DomainCode[] = [
          'dashboard',
          'athletes',
          'parents',
          'teams',
          'age_groups',
          'training',
          'attendance',
          'development',
          'competition',
          'hr',
          'payroll',
          'finance',
          'accounting',
          'inventory',
          'medical',
          'communication',
          'documents',
          'reports',
          'administration',
          'audit',
        ];
        const actions: PermissionAction[] = [
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
        const permValues = [];
        for (const d of domains) {
          for (const a of actions) {
            permValues.push({
              domain: d,
              action: a,
              description: `Izin ${a} pada modul ${d}`,
            });
          }
        }
        await db.insert(permissions).values(permValues).onConflictDoNothing();
      }

      // 5. Ensure Age Groups exist
      const existingAgeGroups = await db
        .select()
        .from(ageGroups)
        .where(eq(ageGroups.organizationId, org.id));

      if (existingAgeGroups.length === 0) {
        await db
          .insert(ageGroups)
          .values([
            {
              organizationId: org.id,
              code: 'KU-10',
              name: 'Kelompok Umur 10 (Rookie)',
              minAge: 8,
              maxAge: 10,
              description: 'Fundamental motorik, ball familiarity, dan koordinasi dasar.',
            },
            {
              organizationId: org.id,
              code: 'KU-12',
              name: 'Kelompok Umur 12 (Minibasket)',
              minAge: 11,
              maxAge: 12,
              description: 'Fundamental dribbling, passing, layup, dan pengenalan konsep ruang.',
            },
            {
              organizationId: org.id,
              code: 'KU-14',
              name: 'Kelompok Umur 14 (Junior Development)',
              minAge: 13,
              maxAge: 14,
              description: 'Transisi taktikal 5-on-5, man-to-man defense, dan mekanika tembakan.',
            },
            {
              organizationId: org.id,
              code: 'KU-16',
              name: 'Kelompok Umur 16 (Youth Competitive)',
              minAge: 15,
              maxAge: 16,
              description: 'Sistem offense/defense kompetitif, conditioning fisik, dan spesialis posisi.',
            },
            {
              organizationId: org.id,
              code: 'KU-18',
              name: 'Kelompok Umur 18 (Elite Prep)',
              minAge: 17,
              maxAge: 18,
              description: 'Persiapan liga mahasiswa/profesional, IQ basket tingkat lanjut, dan kekuatan.',
            },
          ])
          .onConflictDoNothing();
      }

      // 6. Ensure Standard Double-Entry Chart of Accounts (COA) exists
      const existingAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.organizationId, org.id));

      if (existingAccounts.length === 0) {
        await db
          .insert(accounts)
          .values([
            {
              organizationId: org.id,
              code: '1101',
              name: 'Kas & Bank Operasional Akademi',
              accountType: 'ASSET',
              normalBalance: 'DEBIT',
            },
            {
              organizationId: org.id,
              code: '1102',
              name: 'Piutang Iuran & Membership Atlet',
              accountType: 'ASSET',
              normalBalance: 'DEBIT',
            },
            {
              organizationId: org.id,
              code: '1201',
              name: 'Persediaan Perlengkapan & Inventaris Latihan',
              accountType: 'ASSET',
              normalBalance: 'DEBIT',
            },
            {
              organizationId: org.id,
              code: '2101',
              name: 'Utang Gaji & Honor Pelatih',
              accountType: 'LIABILITY',
              normalBalance: 'CREDIT',
            },
            {
              organizationId: org.id,
              code: '2102',
              name: 'Pendapatan Diterima di Muka',
              accountType: 'LIABILITY',
              normalBalance: 'CREDIT',
            },
            {
              organizationId: org.id,
              code: '3101',
              name: 'Modal Disetor & Ekuitas Akademi',
              accountType: 'EQUITY',
              normalBalance: 'CREDIT',
            },
            {
              organizationId: org.id,
              code: '4101',
              name: 'Pendapatan Registrasi Atlet Baru',
              accountType: 'REVENUE',
              normalBalance: 'CREDIT',
            },
            {
              organizationId: org.id,
              code: '4102',
              name: 'Pendapatan Iuran Membership',
              accountType: 'REVENUE',
              normalBalance: 'CREDIT',
            },
            {
              organizationId: org.id,
              code: '4103',
              name: 'Pendapatan Turnamen & Event',
              accountType: 'REVENUE',
              normalBalance: 'CREDIT',
            },
            {
              organizationId: org.id,
              code: '4104',
              name: 'Pendapatan Merchandise & Seragam',
              accountType: 'REVENUE',
              normalBalance: 'CREDIT',
            },
            {
              organizationId: org.id,
              code: '4105',
              name: 'Pendapatan Sponsorship & Kemitraan',
              accountType: 'REVENUE',
              normalBalance: 'CREDIT',
            },
            {
              organizationId: org.id,
              code: '4106',
              name: 'Pendapatan Operasional Lainnya',
              accountType: 'REVENUE',
              normalBalance: 'CREDIT',
            },
            {
              organizationId: org.id,
              code: '5101',
              name: 'Beban Kompensasi & Honor Pelatih',
              accountType: 'EXPENSE',
              normalBalance: 'DEBIT',
            },
            {
              organizationId: org.id,
              code: '5102',
              name: 'Beban Gaji Staf Operasional',
              accountType: 'EXPENSE',
              normalBalance: 'DEBIT',
            },
            {
              organizationId: org.id,
              code: '5103',
              name: 'Beban Sewa Lapangan (Court Rental)',
              accountType: 'EXPENSE',
              normalBalance: 'DEBIT',
            },
            {
              organizationId: org.id,
              code: '5104',
              name: 'Beban Peralatan & Perlengkapan Latihan',
              accountType: 'EXPENSE',
              normalBalance: 'DEBIT',
            },
            {
              organizationId: org.id,
              code: '5105',
              name: 'Beban Transportasi & Akomodasi Tanding',
              accountType: 'EXPENSE',
              normalBalance: 'DEBIT',
            },
            {
              organizationId: org.id,
              code: '5106',
              name: 'Beban Medis & Fisioterapi',
              accountType: 'EXPENSE',
              normalBalance: 'DEBIT',
            },
            {
              organizationId: org.id,
              code: '5107',
              name: 'Beban Penyelenggaraan Event & Turnamen',
              accountType: 'EXPENSE',
              normalBalance: 'DEBIT',
            },
            {
              organizationId: org.id,
              code: '5108',
              name: 'Beban Operasional Umum Cabang',
              accountType: 'EXPENSE',
              normalBalance: 'DEBIT',
            },
          ])
          .onConflictDoNothing();
      }

      // 7. Ensure Configurable Assessment Criteria exist
      const existingCriteria = await db
        .select()
        .from(assessmentCriteria)
        .where(eq(assessmentCriteria.organizationId, org.id));

      if (existingCriteria.length === 0) {
        await db
          .insert(assessmentCriteria)
          .values([
            // Technical
            { organizationId: org.id, category: 'TECHNICAL', code: 'TECH_PASSING', name: 'Passing', minScore: 1, maxScore: 10, weight: '1.00' },
            { organizationId: org.id, category: 'TECHNICAL', code: 'TECH_DRIBBLING', name: 'Dribbling', minScore: 1, maxScore: 10, weight: '1.00' },
            { organizationId: org.id, category: 'TECHNICAL', code: 'TECH_SHOOTING', name: 'Shooting', minScore: 1, maxScore: 10, weight: '1.20' },
            { organizationId: org.id, category: 'TECHNICAL', code: 'TECH_BALL_HANDLING', name: 'Ball Handling', minScore: 1, maxScore: 10, weight: '1.10' },
            { organizationId: org.id, category: 'TECHNICAL', code: 'TECH_DEFENSE', name: 'Defense', minScore: 1, maxScore: 10, weight: '1.10' },
            { organizationId: org.id, category: 'TECHNICAL', code: 'TECH_REBOUNDING', name: 'Rebounding', minScore: 1, maxScore: 10, weight: '1.00' },
            // Physical
            { organizationId: org.id, category: 'PHYSICAL', code: 'PHYS_SPEED', name: 'Speed', minScore: 1, maxScore: 10, weight: '1.00' },
            { organizationId: org.id, category: 'PHYSICAL', code: 'PHYS_AGILITY', name: 'Agility', minScore: 1, maxScore: 10, weight: '1.00' },
            { organizationId: org.id, category: 'PHYSICAL', code: 'PHYS_STRENGTH', name: 'Strength', minScore: 1, maxScore: 10, weight: '1.00' },
            { organizationId: org.id, category: 'PHYSICAL', code: 'PHYS_ENDURANCE', name: 'Endurance', minScore: 1, maxScore: 10, weight: '1.00' },
            { organizationId: org.id, category: 'PHYSICAL', code: 'PHYS_COORDINATION', name: 'Coordination', minScore: 1, maxScore: 10, weight: '1.00' },
            // Mental
            { organizationId: org.id, category: 'MENTAL', code: 'MENT_DISCIPLINE', name: 'Discipline', minScore: 1, maxScore: 10, weight: '1.00' },
            { organizationId: org.id, category: 'MENTAL', code: 'MENT_FOCUS', name: 'Focus', minScore: 1, maxScore: 10, weight: '1.00' },
            { organizationId: org.id, category: 'MENTAL', code: 'MENT_TEAMWORK', name: 'Teamwork', minScore: 1, maxScore: 10, weight: '1.00' },
            { organizationId: org.id, category: 'MENTAL', code: 'MENT_ATTITUDE', name: 'Attitude', minScore: 1, maxScore: 10, weight: '1.00' },
          ])
          .onConflictDoNothing();
      }

      // 8. Ensure Default Membership Plans exist
      const existingPlans = await db
        .select()
        .from(membershipPlans)
        .where(eq(membershipPlans.organizationId, org.id));

      if (existingPlans.length === 0) {
        await db
          .insert(membershipPlans)
          .values([
            {
              organizationId: org.id,
              code: 'PLAN-REG-MONTHLY',
              name: 'Program Reguler (3x Sesi / Minggu)',
              billingCycle: 'MONTHLY',
              feeAmount: '750000.00',
              registrationFee: '350000.00',
              sessionsPerWeek: 3,
              isActive: true,
            },
            {
              organizationId: org.id,
              code: 'PLAN-ELITE-MONTHLY',
              name: 'Program Elite Kompetisi (5x Sesi / Minggu)',
              billingCycle: 'MONTHLY',
              feeAmount: '1250000.00',
              registrationFee: '500000.00',
              sessionsPerWeek: 5,
              isActive: true,
            },
            {
              organizationId: org.id,
              code: 'PLAN-QUARTERLY',
              name: 'Paket Triwulan Reguler (3 Bulan)',
              billingCycle: 'QUARTERLY',
              feeAmount: '2100000.00',
              registrationFee: '250000.00',
              sessionsPerWeek: 3,
              isActive: true,
            },
          ])
          .onConflictDoNothing();
      }

      isBootstrapped = true;
    }

    // 9. Reconcile or upsert current user safely across both unique uid and unique email constraints
    const normalizedEmail = (email || `${uid}@zamoa-cbtc.id`).toLowerCase().trim();
    const resolvedFullName =
      displayName || normalizedEmail.split('@')[0] || 'Administrator ZAMOA CBTC';

    const existingMatchingUsers = await db
      .select()
      .from(users)
      .where(or(eq(users.uid, uid), eq(users.email, normalizedEmail)));

    let currentUserRecord = existingMatchingUsers.find((u) => u.uid === uid);
    const emailOwnerRecord = existingMatchingUsers.find(
      (u) => u.email.toLowerCase() === normalizedEmail
    );

    if (currentUserRecord) {
      const canUpdateEmail =
        !emailOwnerRecord || emailOwnerRecord.id === currentUserRecord.id;
      const [updated] = await db
        .update(users)
        .set({
          ...(canUpdateEmail ? { email: normalizedEmail } : {}),
          ...(displayName ? { fullName: displayName } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, currentUserRecord.id))
        .returning();
      currentUserRecord = updated || currentUserRecord;
    } else if (emailOwnerRecord) {
      // Existing user found by email (e.g. pre-seeded admin account); link their Firebase UID
      const [updated] = await db
        .update(users)
        .set({
          uid,
          ...(displayName ? { fullName: displayName } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, emailOwnerRecord.id))
        .returning();
      currentUserRecord = updated || emailOwnerRecord;
    } else {
      const inserted = await db
        .insert(users)
        .values({
          uid,
          organizationId: org.id,
          branchId: primaryBranch?.id ?? null,
          email: normalizedEmail,
          fullName: resolvedFullName,
          activeRoleCode: 'SUPER_ADMIN',
          isActive: true,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted[0]) {
        currentUserRecord = inserted[0];
      } else {
        const refetched = await db
          .select()
          .from(users)
          .where(or(eq(users.uid, uid), eq(users.email, normalizedEmail)));
        currentUserRecord = refetched[0];
      }
    }

    if (currentUserRecord) {
      await ensureOperationalDataSeeded(org.id, existingBranches, currentUserRecord);
    }

    return {
      user: currentUserRecord,
      organization: org,
      branches: existingBranches,
    };
  } catch (error) {
    console.error('Failed to bootstrap system or upsert user:', error);
    throw new Error('Gagal menginisialisasi pengguna dan konfigurasi organisasi.', {
      cause: error,
    });
  }
}
