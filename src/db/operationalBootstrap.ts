import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  branches,
  users,
  ageGroups,
  coaches,
  staff,
  teams,
  athletes,
  parents,
  parentAthletes,
  trainingPrograms,
  trainingSessions,
  attendances,
  playerEvaluations,
  playerGoals,
  playerStats,
  competitions,
  tournaments,
  matches,
  matchRosters,
  matchStats,
  achievements,
  medicalRecords,
  injuries,
  accounts,
  journals,
  journalEntries,
  membershipPlans,
  memberships,
  invoices,
  payments,
  expenses,
  employments,
  compensationRules,
  payrolls,
  payrollItems,
  inventoryItems,
  inventoryTransactions,
  announcements,
  notifications,
  documents,
  media,
  auditLogs,
} from './schema.ts';

export async function ensureOperationalDataSeeded(
  organizationId: string,
  branchList: Array<typeof branches.$inferSelect>,
  currentUser: typeof users.$inferSelect
) {
  try {
    const existingAthletes = await db
      .select()
      .from(athletes)
      .where(eq(athletes.organizationId, organizationId));

    if (existingAthletes.length > 0) {
      return;
    }

    const jktBranch = branchList.find((b) => b.code === 'CBTC-JKT') || branchList[0];
    const bdgBranch = branchList.find((b) => b.code === 'CBTC-BDG') || branchList[0];
    if (!jktBranch) return;

    const ageGroupRows = await db
      .select()
      .from(ageGroups)
      .where(eq(ageGroups.organizationId, organizationId));
    const ku12 = ageGroupRows.find((a) => a.code === 'KU-12') || ageGroupRows[0];
    const ku14 = ageGroupRows.find((a) => a.code === 'KU-14') || ageGroupRows[0];
    const ku16 = ageGroupRows.find((a) => a.code === 'KU-16') || ageGroupRows[0];

    const planRows = await db
      .select()
      .from(membershipPlans)
      .where(eq(membershipPlans.organizationId, organizationId));
    const regPlan = planRows.find((p) => p.code === 'PLAN-REG-MONTHLY') || planRows[0];
    const elitePlan = planRows.find((p) => p.code === 'PLAN-ELITE-MONTHLY') || planRows[0];

    const accountRows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.organizationId, organizationId));
    const accMap = new Map(accountRows.map((a) => [a.code, a.id]));

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    const nextThreeDays = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const nextSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const nextFourteenDays = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    // 1. Seed Coaches & Staff
    const insertedCoaches = await db
      .insert(coaches)
      .values([
        {
          organizationId,
          branchId: jktBranch.id,
          coachCode: 'COACH-JKT-01',
          fullName: 'Coach Budi Santoso',
          phone: '08119283741',
          email: 'budi.santoso@zamoa-cbtc.id',
          licenseLevel: 'FIBA Level 2 / PERBASI A',
          specialization: 'Tactical System & Elite Defense',
          isHeadCoach: true,
          coachType: 'FULL_TIME',
          status: 'ACTIVE',
        },
        {
          organizationId,
          branchId: jktBranch.id,
          coachCode: 'COACH-JKT-02',
          fullName: 'Coach Hendra Wijaya',
          phone: '08128374652',
          email: 'hendra.wijaya@zamoa-cbtc.id',
          licenseLevel: 'PERBASI Lisensi A',
          specialization: 'Shooting Mechanics & Ball Handling',
          isHeadCoach: false,
          coachType: 'FULL_TIME',
          status: 'ACTIVE',
        },
        {
          organizationId,
          branchId: bdgBranch.id,
          coachCode: 'COACH-BDG-01',
          fullName: 'Coach Rina Kusuma',
          phone: '08137465912',
          email: 'rina.kusuma@zamoa-cbtc.id',
          licenseLevel: 'FIBA Level 1 / PERBASI B',
          specialization: 'Fundamental Minibasket & Agility',
          isHeadCoach: true,
          coachType: 'FREELANCE',
          status: 'ACTIVE',
        },
      ])
      .onConflictDoNothing()
      .returning();

    const coachBudi = insertedCoaches[0];
    const coachHendra = insertedCoaches[1] || coachBudi;
    const coachRina = insertedCoaches[2] || coachBudi;

    const insertedStaff = await db
      .insert(staff)
      .values([
        {
          organizationId,
          branchId: jktBranch.id,
          staffCode: 'STF-JKT-01',
          fullName: 'dr. Nadia Pratama, Sp.KO',
          department: 'MEDICAL',
          positionTitle: 'Kepala Medis & Fisioterapi Olahraga',
          phone: '08158291034',
          email: 'nadia.medis@zamoa-cbtc.id',
          status: 'ACTIVE',
        },
        {
          organizationId,
          branchId: jktBranch.id,
          staffCode: 'STF-JKT-02',
          fullName: 'Riko Saputra',
          department: 'OPERATIONS',
          positionTitle: 'Koordinator Operasional & Logistik Arena',
          phone: '08167382910',
          email: 'riko.ops@zamoa-cbtc.id',
          status: 'ACTIVE',
        },
      ])
      .onConflictDoNothing()
      .returning();

    const staffRiko = insertedStaff[1] || insertedStaff[0];

    // 2. Employments & Compensation Rules
    if (coachBudi && coachHendra && staffRiko) {
      const empRows = await db
        .insert(employments)
        .values([
          {
            organizationId,
            branchId: jktBranch.id,
            coachId: coachBudi.id,
            personnelName: coachBudi.fullName,
            employmentType: 'FULL_TIME_COACH',
            contractNumber: 'CTR-2026-JKT-001',
            startDate: '2026-01-01',
            status: 'ACTIVE',
          },
          {
            organizationId,
            branchId: jktBranch.id,
            coachId: coachHendra.id,
            personnelName: coachHendra.fullName,
            employmentType: 'FULL_TIME_COACH',
            contractNumber: 'CTR-2026-JKT-002',
            startDate: '2026-01-01',
            status: 'ACTIVE',
          },
          {
            organizationId,
            branchId: jktBranch.id,
            staffId: staffRiko.id,
            personnelName: staffRiko.fullName,
            employmentType: 'STAFF',
            contractNumber: 'CTR-2026-JKT-003',
            startDate: '2026-01-01',
            status: 'ACTIVE',
          },
        ])
        .onConflictDoNothing()
        .returning();

      if (empRows.length >= 3) {
        await db
          .insert(compensationRules)
          .values([
            {
              organizationId,
              employmentId: empRows[0].id,
              monthlySalary: '6500000.00',
              sessionRate: '250000.00',
              defaultBonus: '500000.00',
              defaultIncentive: '250000.00',
              defaultDeduction: '0.00',
            },
            {
              organizationId,
              employmentId: empRows[1].id,
              monthlySalary: '5000000.00',
              sessionRate: '200000.00',
              defaultBonus: '300000.00',
              defaultIncentive: '150000.00',
              defaultDeduction: '0.00',
            },
            {
              organizationId,
              employmentId: empRows[2].id,
              monthlySalary: '4800000.00',
              sessionRate: '0.00',
              defaultBonus: '200000.00',
              defaultIncentive: '0.00',
              defaultDeduction: '0.00',
            },
          ])
          .onConflictDoNothing();
      }
    }

    // 3. Seed Teams
    const insertedTeams = await db
      .insert(teams)
      .values([
        {
          organizationId,
          branchId: jktBranch.id,
          ageGroupId: ku16.id,
          headCoachId: coachBudi?.id ?? null,
          code: 'JKT-KU16-ELITE',
          name: 'ZAMOA Garuda U-16 Putra',
          genderDivision: 'PUTRA',
          season: '2026/2027',
          isActive: true,
        },
        {
          organizationId,
          branchId: jktBranch.id,
          ageGroupId: ku14.id,
          headCoachId: coachHendra?.id ?? null,
          code: 'JKT-KU14-DEV',
          name: 'ZAMOA Cakra U-14 Putra',
          genderDivision: 'PUTRA',
          season: '2026/2027',
          isActive: true,
        },
        {
          organizationId,
          branchId: bdgBranch.id,
          ageGroupId: ku12.id,
          headCoachId: coachRina?.id ?? null,
          code: 'BDG-KU12-ROOKIE',
          name: 'ZAMOA Pasundan Flyers U-12',
          genderDivision: 'MIXED',
          season: '2026/2027',
          isActive: true,
        },
      ])
      .onConflictDoNothing()
      .returning();

    const teamKu16 = insertedTeams[0];
    const teamKu14 = insertedTeams[1] || teamKu16;
    const teamKu12 = insertedTeams[2] || teamKu16;

    // 4. Seed Athletes & Parents
    const insertedAthletes = await db
      .insert(athletes)
      .values([
        {
          organizationId,
          branchId: jktBranch.id,
          ageGroupId: ku16.id,
          teamId: teamKu16.id,
          memberCode: 'CBTC-2026-1001',
          fullName: 'Kevin Pratama Wijaya',
          nickname: 'Kevin',
          gender: 'MALE',
          birthDate: '2010-04-12',
          birthPlace: 'Jakarta',
          identityNumber: '3171041204100001',
          position: 'PG',
          heightCm: '178.00',
          weightKg: '67.00',
          jerseySize: 'L',
          jerseyNumber: 7,
          parentContactName: 'Irwan Wijaya',
          parentContactPhone: '08118822901',
          emergencyContactName: 'Sinta Wijaya',
          emergencyContactPhone: '08118822902',
          membershipStatus: 'ACTIVE',
          joinedAt: '2026-01-10',
        },
        {
          organizationId,
          branchId: jktBranch.id,
          ageGroupId: ku16.id,
          teamId: teamKu16.id,
          memberCode: 'CBTC-2026-1002',
          fullName: 'Rafael Putra Gunawan',
          nickname: 'Rafa',
          gender: 'MALE',
          birthDate: '2010-08-23',
          birthPlace: 'Jakarta',
          identityNumber: '3171082308100002',
          position: 'SG',
          heightCm: '181.00',
          weightKg: '70.00',
          jerseySize: 'XL',
          jerseyNumber: 13,
          parentContactName: 'Haryanto Gunawan',
          parentContactPhone: '08129933401',
          emergencyContactName: 'Lina Gunawan',
          emergencyContactPhone: '08129933402',
          membershipStatus: 'ACTIVE',
          joinedAt: '2026-01-15',
        },
        {
          organizationId,
          branchId: jktBranch.id,
          ageGroupId: ku16.id,
          teamId: teamKu16.id,
          memberCode: 'CBTC-2026-1003',
          fullName: 'Daffa Ramadhan Hakim',
          nickname: 'Daffa',
          gender: 'MALE',
          birthDate: '2010-11-05',
          birthPlace: 'Depok',
          identityNumber: '3276110511100003',
          position: 'C',
          heightCm: '191.00',
          weightKg: '82.00',
          jerseySize: 'XXL',
          jerseyNumber: 34,
          parentContactName: 'Lukman Hakim',
          parentContactPhone: '08137766501',
          emergencyContactName: 'Farida Hakim',
          emergencyContactPhone: '08137766502',
          membershipStatus: 'ACTIVE',
          joinedAt: '2026-02-01',
        },
        {
          organizationId,
          branchId: jktBranch.id,
          ageGroupId: ku14.id,
          teamId: teamKu14.id,
          memberCode: 'CBTC-2026-1004',
          fullName: 'Nathaniel Bagas Saputra',
          nickname: 'Bagas',
          gender: 'MALE',
          birthDate: '2012-03-19',
          birthPlace: 'Tangerang',
          identityNumber: '3671031903120004',
          position: 'SF',
          heightCm: '171.00',
          weightKg: '60.00',
          jerseySize: 'L',
          jerseyNumber: 23,
          parentContactName: 'Yohanes Saputra',
          parentContactPhone: '08156644301',
          emergencyContactName: 'Maria Saputra',
          emergencyContactPhone: '08156644302',
          membershipStatus: 'ACTIVE',
          joinedAt: '2026-02-10',
        },
        {
          organizationId,
          branchId: bdgBranch.id,
          ageGroupId: ku12.id,
          teamId: teamKu12.id,
          memberCode: 'CBTC-2026-1005',
          fullName: 'Kayla Maharani Putri',
          nickname: 'Kayla',
          gender: 'FEMALE',
          birthDate: '2014-06-28',
          birthPlace: 'Bandung',
          identityNumber: '3273062806140005',
          position: 'PG',
          heightCm: '156.00',
          weightKg: '46.00',
          jerseySize: 'M',
          jerseyNumber: 5,
          parentContactName: 'Ridwan Maharani',
          parentContactPhone: '08175544201',
          emergencyContactName: 'Dewi Maharani',
          emergencyContactPhone: '08175544202',
          membershipStatus: 'ACTIVE',
          joinedAt: '2026-03-01',
        },
      ])
      .onConflictDoNothing()
      .returning();

    const athKevin = insertedAthletes[0];
    const athRafa = insertedAthletes[1] || athKevin;
    const athDaffa = insertedAthletes[2] || athKevin;
    const athBagas = insertedAthletes[3] || athKevin;

    // Seed Parents & Links
    for (const ath of insertedAthletes) {
      const [p] = await db
        .insert(parents)
        .values({
          organizationId,
          branchId: ath.branchId,
          fullName: ath.parentContactName,
          relationshipType: 'FATHER',
          phone: ath.parentContactPhone,
          email: `${ath.nickname?.toLowerCase() || 'wali'}.parent@gmail.com`,
          occupation: 'Wiraswasta / Profesional',
          address: 'Jakarta & Sekitarnya',
        })
        .returning();

      if (p) {
        await db
          .insert(parentAthletes)
          .values({
            parentId: p.id,
            athleteId: ath.id,
            relationship: 'FATHER',
            isPrimaryGuardian: true,
          })
          .onConflictDoNothing();
      }
    }

    // 5. Seed Training Programs, Sessions, Attendances, Evaluations & Goals
    const insertedPrograms = await db
      .insert(trainingPrograms)
      .values([
        {
          organizationId,
          branchId: jktBranch.id,
          ageGroupId: ku16.id,
          code: 'PRG-ELITE-U16',
          name: 'Kurikulum Intensif Kompetisi U-16 (Half-Court Offense & Press Break)',
          season: '2026/2027',
          focusArea: 'Pick & Roll Reads, Help-Side Defense, Transition Finishing & Conditioning',
          sessionsPerWeek: 5,
          isActive: true,
        },
        {
          organizationId,
          branchId: jktBranch.id,
          ageGroupId: ku14.id,
          code: 'PRG-DEV-U14',
          name: 'Kurikulum Junior Development U-14 (Mekanika Shooting & Footwork)',
          season: '2026/2027',
          focusArea: 'Catch & Shoot Consistency, Weak-Hand Dribbling, 3-on-3 Spacing',
          sessionsPerWeek: 3,
          isActive: true,
        },
      ])
      .onConflictDoNothing()
      .returning();

    const progU16 = insertedPrograms[0];
    const progU14 = insertedPrograms[1] || progU16;

    if (progU16 && coachBudi && teamKu16) {
      const insertedSessions = await db
        .insert(trainingSessions)
        .values([
          {
            organizationId,
            branchId: jktBranch.id,
            programId: progU16.id,
            teamId: teamKu16.id,
            coachId: coachBudi.id,
            courtName: 'Court A (Main FIBA Wood Flooring)',
            sessionDate: fiveDaysAgo,
            startTime: '16:00',
            endTime: '18:30',
            topic: 'High Pick & Roll Execution + Shell Defense Drill',
            trainingNotes: 'Intensitas tinggi, akurasi perimeter meningkat 14%.',
            status: 'COMPLETED',
          },
          {
            organizationId,
            branchId: jktBranch.id,
            programId: progU16.id,
            teamId: teamKu16.id,
            coachId: coachBudi.id,
            courtName: 'Court A (Main FIBA Wood Flooring)',
            sessionDate: yesterday,
            startTime: '16:00',
            endTime: '18:30',
            topic: 'Full-Court Zone Press Break & Fastbreak Transition',
            trainingNotes: 'Simulasi situasi kuarter 4 melawan full-court press.',
            status: 'COMPLETED',
          },
          {
            organizationId,
            branchId: jktBranch.id,
            programId: progU14.id,
            teamId: teamKu14.id,
            coachId: coachHendra.id,
            courtName: 'Court B (Development Indoor)',
            sessionDate: yesterday,
            startTime: '15:30',
            endTime: '17:30',
            topic: 'Shooting Mechanics Off the Dribble & Closeout Footwork',
            trainingNotes: 'Fokus keseimbangan bahu dan follow-through.',
            status: 'COMPLETED',
          },
          {
            organizationId,
            branchId: jktBranch.id,
            programId: progU16.id,
            teamId: teamKu16.id,
            coachId: coachBudi.id,
            courtName: 'Court A (Main FIBA Wood Flooring)',
            sessionDate: nextThreeDays,
            startTime: '16:00',
            endTime: '18:30',
            topic: 'Scrimmage Evaluasi Taktikal & Set-Play Sideline Out of Bounds',
            trainingNotes: 'Wajib membawa jersey reversible hitam-emas.',
            status: 'SCHEDULED',
          },
        ])
        .returning();

      const sess1 = insertedSessions[0];
      const sess2 = insertedSessions[1];

      if (sess1 && athKevin && athRafa && athDaffa) {
        await db
          .insert(attendances)
          .values([
            {
              organizationId,
              branchId: jktBranch.id,
              sessionId: sess1.id,
              athleteId: athKevin.id,
              status: 'PRESENT',
              source: 'QR',
              notes: 'QR Check-In tepat waktu (15:42 WIB)',
              recordedByUserId: currentUser.id,
            },
            {
              organizationId,
              branchId: jktBranch.id,
              sessionId: sess1.id,
              athleteId: athRafa.id,
              status: 'PRESENT',
              source: 'COACH',
              notes: 'Hadir penuh',
              recordedByUserId: currentUser.id,
            },
            {
              organizationId,
              branchId: jktBranch.id,
              sessionId: sess1.id,
              athleteId: athDaffa.id,
              status: 'LATE',
              source: 'COACH',
              notes: 'Terlambat 10 menit karena hujan deras',
              recordedByUserId: currentUser.id,
            },
          ])
          .onConflictDoNothing();
      }

      if (sess2 && athKevin && athRafa && athDaffa) {
        await db
          .insert(attendances)
          .values([
            {
              organizationId,
              branchId: jktBranch.id,
              sessionId: sess2.id,
              athleteId: athKevin.id,
              status: 'PRESENT',
              source: 'QR',
              notes: 'QR Check-In',
              recordedByUserId: currentUser.id,
            },
            {
              organizationId,
              branchId: jktBranch.id,
              sessionId: sess2.id,
              athleteId: athRafa.id,
              status: 'PRESENT',
              source: 'QR',
              notes: 'QR Check-In',
              recordedByUserId: currentUser.id,
            },
            {
              organizationId,
              branchId: jktBranch.id,
              sessionId: sess2.id,
              athleteId: athDaffa.id,
              status: 'PRESENT',
              source: 'COACH',
              notes: 'Hadir penuh',
              recordedByUserId: currentUser.id,
            },
          ])
          .onConflictDoNothing();
      }

      // Player Evaluations
      await db.insert(playerEvaluations).values([
        {
          organizationId,
          branchId: jktBranch.id,
          athleteId: athKevin.id,
          coachId: coachBudi.id,
          sessionId: sess2?.id ?? null,
          evaluationDate: yesterday,
          periodLabel: 'Rapor Evaluasi Kuartal III 2026',
          scoresJson: {
            TECH_PASSING: 9,
            TECH_DRIBBLING: 9,
            TECH_SHOOTING: 8,
            TECH_BALL_HANDLING: 9,
            TECH_DEFENSE: 8,
            TECH_REBOUNDING: 7,
            PHYS_SPEED: 9,
            PHYS_AGILITY: 9,
            PHYS_STRENGTH: 8,
            PHYS_ENDURANCE: 9,
            PHYS_COORDINATION: 9,
            MENT_DISCIPLINE: 9,
            MENT_FOCUS: 9,
            MENT_TEAMWORK: 10,
            MENT_ATTITUDE: 9,
          },
          technicalAvg: '8.33',
          physicalAvg: '8.80',
          mentalAvg: '9.25',
          overallScore: '8.73',
          coachRecommendation:
            'Visi bermain dan kepemimpinan sebagai Point Guard sangat matang. Pertahankan konsistensi pull-up 3PT saat menghadapi drop coverage.',
        },
        {
          organizationId,
          branchId: jktBranch.id,
          athleteId: athRafa.id,
          coachId: coachBudi.id,
          sessionId: sess2?.id ?? null,
          evaluationDate: yesterday,
          periodLabel: 'Rapor Evaluasi Kuartal III 2026',
          scoresJson: {
            TECH_PASSING: 8,
            TECH_DRIBBLING: 8,
            TECH_SHOOTING: 9,
            TECH_BALL_HANDLING: 8,
            TECH_DEFENSE: 8,
            TECH_REBOUNDING: 8,
            PHYS_SPEED: 8,
            PHYS_AGILITY: 8,
            PHYS_STRENGTH: 8,
            PHYS_ENDURANCE: 8,
            PHYS_COORDINATION: 8,
            MENT_DISCIPLINE: 9,
            MENT_FOCUS: 8,
            MENT_TEAMWORK: 9,
            MENT_ATTITUDE: 9,
          },
          technicalAvg: '8.17',
          physicalAvg: '8.00',
          mentalAvg: '8.75',
          overallScore: '8.27',
          coachRecommendation:
            'Akurasi catch-and-shoot perimeter sangat tajam. Tingkatkan kecepatan lateral saat menjaga wing lawan.',
        },
      ]);

      // Player Goals
      await db.insert(playerGoals).values([
        {
          organizationId,
          athleteId: athKevin.id,
          coachId: coachBudi.id,
          title: 'Akurasi Free Throw Kompetisi >= 85%',
          category: 'TECHNICAL',
          targetMetric: '85% dari 100 tembakan latihan bertekanan',
          currentProgress: 82,
          targetDate: '2026-12-15',
          status: 'IN_PROGRESS',
        },
        {
          organizationId,
          athleteId: athDaffa.id,
          coachId: coachBudi.id,
          title: 'Peningkatan Vertical Jump +5 cm & Box-Out Rebound',
          category: 'PHYSICAL',
          targetMetric: 'Vertical Reach 305 cm & 10+ RPG',
          currentProgress: 70,
          targetDate: '2026-12-20',
          status: 'IN_PROGRESS',
        },
      ]);
    }

    // 6. Competitions, Tournaments, Matches, Box Scores & Achievements
    const [comp] = await db
      .insert(competitions)
      .values({
        organizationId,
        name: 'Kejurda & Liga Basket Junior DKI Jakarta 2026',
        season: '2026/2027',
        level: 'REGIONAL',
        organizer: 'PERBASI DKI Jakarta',
      })
      .returning();

    if (comp && teamKu16 && athKevin && athRafa && athDaffa) {
      const [tourney] = await db
        .insert(tournaments)
        .values({
          organizationId,
          branchId: jktBranch.id,
          competitionId: comp.id,
          name: 'ZAMOA CBTC Governor Cup U-16 Championship 2026',
          venue: 'GOR Soemantri Brodjonegoro, Kuningan',
          startDate: fiveDaysAgo,
          endDate: nextSevenDays,
          registrationFee: '2500000.00',
          budgetAmount: '9500000.00',
          transportPlan: 'Bus Eksekutif Akademi PP (Titik Kumpul Arena Senayan)',
          accommodationPlan: 'Atlet Pulang-Pergi Terjadwal',
          mealsPlan: 'Paket Nutrisi Atlet Sport Catering + Isotonik',
          participantsCount: 12,
          status: 'ONGOING',
        })
        .returning();

      if (tourney) {
        const insertedMatches = await db
          .insert(matches)
          .values([
            {
              organizationId,
              branchId: jktBranch.id,
              tournamentId: tourney.id,
              teamId: teamKu16.id,
              opponentName: 'Jakarta Hawks Basketball Academy',
              venue: 'Hall A GOR Soemantri Brodjonegoro',
              matchDate: threeDaysAgo,
              matchTime: '16:30',
              ourScore: 82,
              opponentScore: 74,
              mvpAthleteId: athKevin.id,
              status: 'COMPLETED',
              notes: 'Kemenangan perdana grup A dengan efisiensi fastbreak tinggi.',
            },
            {
              organizationId,
              branchId: jktBranch.id,
              tournamentId: tourney.id,
              teamId: teamKu16.id,
              opponentName: 'Victoria Elite Basketball Club',
              venue: 'Hall A GOR Soemantri Brodjonegoro',
              matchDate: nextSevenDays,
              matchTime: '18:00',
              ourScore: 0,
              opponentScore: 0,
              status: 'SCHEDULED',
              notes: 'Babak Semifinal Kejurda U-16.',
            },
          ])
          .returning();

        const completedMatch = insertedMatches[0];
        if (completedMatch) {
          await db
            .insert(matchRosters)
            .values([
              {
                matchId: completedMatch.id,
                athleteId: athKevin.id,
                jerseyNumber: 7,
                position: 'PG',
                isStarter: true,
              },
              {
                matchId: completedMatch.id,
                athleteId: athRafa.id,
                jerseyNumber: 13,
                position: 'SG',
                isStarter: true,
              },
              {
                matchId: completedMatch.id,
                athleteId: athDaffa.id,
                jerseyNumber: 34,
                position: 'C',
                isStarter: true,
              },
            ])
            .onConflictDoNothing();

          await db
            .insert(matchStats)
            .values([
              {
                matchId: completedMatch.id,
                athleteId: athKevin.id,
                minutesPlayed: 32,
                points: 24,
                rebounds: 6,
                assists: 9,
                steals: 3,
                blocks: 0,
                turnovers: 2,
                fouls: 2,
                fgMade: 9,
                fgAttempted: 16,
                threePtMade: 3,
                threePtAttempted: 6,
                ftMade: 3,
                ftAttempted: 3,
              },
              {
                matchId: completedMatch.id,
                athleteId: athRafa.id,
                minutesPlayed: 30,
                points: 21,
                rebounds: 5,
                assists: 4,
                steals: 2,
                blocks: 1,
                turnovers: 1,
                fouls: 3,
                fgMade: 8,
                fgAttempted: 15,
                threePtMade: 4,
                threePtAttempted: 8,
                ftMade: 1,
                ftAttempted: 2,
              },
              {
                matchId: completedMatch.id,
                athleteId: athDaffa.id,
                minutesPlayed: 29,
                points: 16,
                rebounds: 14,
                assists: 2,
                steals: 1,
                blocks: 4,
                turnovers: 2,
                fouls: 3,
                fgMade: 7,
                fgAttempted: 11,
                threePtMade: 0,
                threePtAttempted: 0,
                ftMade: 2,
                ftAttempted: 4,
              },
            ])
            .onConflictDoNothing();

          await db.insert(playerStats).values([
            {
              organizationId,
              athleteId: athKevin.id,
              season: '2026/2027',
              gamesPlayed: 1,
              totalPoints: 24,
              totalRebounds: 6,
              totalAssists: 9,
              totalSteals: 3,
              totalBlocks: 0,
            },
            {
              organizationId,
              athleteId: athRafa.id,
              season: '2026/2027',
              gamesPlayed: 1,
              totalPoints: 21,
              totalRebounds: 5,
              totalAssists: 4,
              totalSteals: 2,
              totalBlocks: 1,
            },
            {
              organizationId,
              athleteId: athDaffa.id,
              season: '2026/2027',
              gamesPlayed: 1,
              totalPoints: 16,
              totalRebounds: 14,
              totalAssists: 2,
              totalSteals: 1,
              totalBlocks: 4,
            },
          ]);
        }

        await db.insert(achievements).values([
          {
            organizationId,
            branchId: jktBranch.id,
            tournamentId: tourney.id,
            teamId: teamKu16.id,
            athleteId: athKevin.id,
            title: 'Player of the Game (24 PTS, 9 AST vs Hawks Academy)',
            category: 'MVP',
            rankPosition: 'Game MVP #1',
            awardedDate: threeDaysAgo,
            notes: 'Efisiensi tembakan 56% FG dan 0 turnover di kuarter penentuan.',
          },
          {
            organizationId,
            branchId: jktBranch.id,
            tournamentId: tourney.id,
            teamId: teamKu16.id,
            title: 'Juara Bertahan Regional Youth Invitational DKI Jakarta',
            category: 'TEAM_CHAMPION',
            rankPosition: 'Juara 1 / Gold Trophy',
            awardedDate: fiveDaysAgo,
            notes: 'Rekor tak terkalahkan sepanjang babak penyisihan regional.',
          },
        ]);
      }
    }

    // 7. Medical Records & Injuries (Return-to-Play)
    if (athKevin && athRafa && athBagas) {
      await db
        .insert(medicalRecords)
        .values([
          {
            organizationId,
            branchId: jktBranch.id,
            athleteId: athKevin.id,
            bloodType: 'O+',
            allergies: 'Tidak ada',
            chronicConditions: 'Tidak ada',
            insuranceProvider: 'Prudential Sport Shield & BPJS',
            insuranceNumber: 'PRU-CBTC-882190',
            returnToPlayStatus: 'CLEARED',
            medicalNotes: 'VO2Max sangat prima (56 ml/kg/min), siap tanding penuh.',
            updatedByUserId: currentUser.id,
          },
          {
            organizationId,
            branchId: jktBranch.id,
            athleteId: athBagas.id,
            bloodType: 'A+',
            allergies: 'Debu ekstrem',
            chronicConditions: 'Tidak ada',
            insuranceProvider: 'Allianz Health Care',
            insuranceNumber: 'ALZ-CBTC-119283',
            returnToPlayStatus: 'LIMITED_CONTACT',
            medicalNotes: 'Pemulihan keseimbangan proprioseptif pergelangan kaki kanan.',
            updatedByUserId: currentUser.id,
          },
        ])
        .onConflictDoNothing();

      await db.insert(injuries).values([
        {
          organizationId,
          branchId: jktBranch.id,
          athleteId: athBagas.id,
          injuryDate: threeDaysAgo,
          bodyPart: 'Pergelangan Kaki Kanan (Lateral Ankle)',
          diagnosis: 'Grade 1 Mild Lateral Ankle Sprain saat pendaratan rebound',
          severity: 'MINOR',
          treatmentPlan: 'Fisioterapi kinesio taping + latihan penguatan theraband 5 hari',
          recoveryNote: 'Boleh mengikuti latihan shooting statis & ball handling tanpa kontak.',
          returnToPlayStatus: 'LIMITED_CONTACT',
          expectedRecoveryDate: nextThreeDays,
          recordedByUserId: currentUser.id,
        },
      ]);
    }

    // 8. Memberships, Invoices, Payments, Expenses & Balanced Double-Entry Journals
    const accCash = accMap.get('1101');
    const accAr = accMap.get('1102');
    const accRevReg = accMap.get('4101');
    const accRevMem = accMap.get('4102');
    const accExpCourt = accMap.get('5103');
    const accExpEquip = accMap.get('5104');

    if (elitePlan && regPlan && athKevin && athRafa && athDaffa && accCash && accAr && accRevReg && accRevMem) {
      const insertedMemberships = await db
        .insert(memberships)
        .values([
          {
            organizationId,
            branchId: jktBranch.id,
            athleteId: athKevin.id,
            planId: elitePlan.id,
            startDate: '2026-01-10',
            status: 'ACTIVE',
          },
          {
            organizationId,
            branchId: jktBranch.id,
            athleteId: athRafa.id,
            planId: elitePlan.id,
            startDate: '2026-01-15',
            status: 'ACTIVE',
          },
          {
            organizationId,
            branchId: jktBranch.id,
            athleteId: athDaffa.id,
            planId: regPlan.id,
            startDate: '2026-02-01',
            status: 'ACTIVE',
          },
        ])
        .returning();

      const memKevin = insertedMemberships[0];
      const memRafa = insertedMemberships[1];
      const memDaffa = insertedMemberships[2];

      // Create 3 Invoices (2 PAID, 1 ISSUED)
      const insertedInvoices = await db
        .insert(invoices)
        .values([
          {
            organizationId,
            branchId: jktBranch.id,
            athleteId: athKevin.id,
            membershipId: memKevin?.id ?? null,
            invoiceNumber: 'INV-2026-100101',
            revenueCategory: 'MEMBERSHIP',
            description: `Iuran Program Elite Kompetisi & Registrasi - ${athKevin.fullName}`,
            issueDate: fiveDaysAgo,
            dueDate: nextSevenDays,
            totalAmount: '1750000.00',
            paidAmount: '1750000.00',
            status: 'PAID',
            createdByUserId: currentUser.id,
          },
          {
            organizationId,
            branchId: jktBranch.id,
            athleteId: athRafa.id,
            membershipId: memRafa?.id ?? null,
            invoiceNumber: 'INV-2026-100102',
            revenueCategory: 'MEMBERSHIP',
            description: `Iuran Program Elite Kompetisi Bulanan - ${athRafa.fullName}`,
            issueDate: fiveDaysAgo,
            dueDate: nextSevenDays,
            totalAmount: '1250000.00',
            paidAmount: '1250000.00',
            status: 'PAID',
            createdByUserId: currentUser.id,
          },
          {
            organizationId,
            branchId: jktBranch.id,
            athleteId: athDaffa.id,
            membershipId: memDaffa?.id ?? null,
            invoiceNumber: 'INV-2026-100103',
            revenueCategory: 'MEMBERSHIP',
            description: `Tagihan Iuran Program Reguler Bulanan - ${athDaffa.fullName}`,
            issueDate: yesterday,
            dueDate: nextFourteenDays,
            totalAmount: '750000.00',
            paidAmount: '0.00',
            status: 'ISSUED',
            createdByUserId: currentUser.id,
          },
        ])
        .returning();

      const inv1 = insertedInvoices[0];
      const inv2 = insertedInvoices[1];
      const inv3 = insertedInvoices[2];

      const fiscalYear = new Date().getFullYear();
      const periodMonth = new Date().getMonth() + 1;

      if (inv1 && inv2 && inv3) {
        // Journal 1: Accrual Invoice 1
        const [jInv1] = await db
          .insert(journals)
          .values({
            organizationId,
            branchId: jktBranch.id,
            journalNumber: 'JRN-202609-1001',
            fiscalYear,
            periodMonth,
            entryDate: fiveDaysAgo,
            sourceType: 'INVOICE',
            sourceId: inv1.id,
            description: `Penerbitan Invoice ${inv1.invoiceNumber} - ${athKevin.fullName}`,
            totalDebit: '1750000.00',
            totalCredit: '1750000.00',
            status: 'POSTED',
            createdByUserId: currentUser.id,
          })
          .returning();

        if (jInv1) {
          await db.insert(journalEntries).values([
            {
              journalId: jInv1.id,
              accountId: accAr,
              debit: '1750000.00',
              credit: '0.00',
              memo: `Piutang ${inv1.invoiceNumber}`,
            },
            {
              journalId: jInv1.id,
              accountId: accRevReg,
              debit: '0.00',
              credit: '500000.00',
              memo: `Pendapatan Registrasi ${athKevin.fullName}`,
            },
            {
              journalId: jInv1.id,
              accountId: accRevMem,
              debit: '0.00',
              credit: '1250000.00',
              memo: `Pendapatan Membership Elite ${athKevin.fullName}`,
            },
          ]);
        }

        // Payment 1 & Journal 2
        const [pay1] = await db
          .insert(payments)
          .values({
            organizationId,
            branchId: jktBranch.id,
            invoiceId: inv1.id,
            receiptNumber: 'RCP-2026-100101',
            paymentDate: threeDaysAgo,
            amount: '1750000.00',
            paymentMethod: 'BANK_TRANSFER',
            referenceNumber: 'BCA-TRF-882910',
            receivedByUserId: currentUser.id,
          })
          .returning();

        if (pay1) {
          const [jPay1] = await db
            .insert(journals)
            .values({
              organizationId,
              branchId: jktBranch.id,
              journalNumber: 'JRN-202609-1002',
              fiscalYear,
              periodMonth,
              entryDate: threeDaysAgo,
              sourceType: 'PAYMENT',
              sourceId: pay1.id,
              description: `Penerimaan Kas Pembayaran ${pay1.receiptNumber} (${inv1.invoiceNumber})`,
              totalDebit: '1750000.00',
              totalCredit: '1750000.00',
              status: 'POSTED',
              createdByUserId: currentUser.id,
            })
            .returning();

          if (jPay1) {
            await db.insert(journalEntries).values([
              {
                journalId: jPay1.id,
                accountId: accCash,
                debit: '1750000.00',
                credit: '0.00',
                memo: `Kas Masuk ${pay1.receiptNumber}`,
              },
              {
                journalId: jPay1.id,
                accountId: accAr,
                debit: '0.00',
                credit: '1750000.00',
                memo: `Pelunasan Piutang ${inv1.invoiceNumber}`,
              },
            ]);
          }
        }

        // Journal 3: Accrual Invoice 2
        const [jInv2] = await db
          .insert(journals)
          .values({
            organizationId,
            branchId: jktBranch.id,
            journalNumber: 'JRN-202609-1003',
            fiscalYear,
            periodMonth,
            entryDate: fiveDaysAgo,
            sourceType: 'INVOICE',
            sourceId: inv2.id,
            description: `Penerbitan Invoice ${inv2.invoiceNumber} - ${athRafa.fullName}`,
            totalDebit: '1250000.00',
            totalCredit: '1250000.00',
            status: 'POSTED',
            createdByUserId: currentUser.id,
          })
          .returning();

        if (jInv2) {
          await db.insert(journalEntries).values([
            {
              journalId: jInv2.id,
              accountId: accAr,
              debit: '1250000.00',
              credit: '0.00',
              memo: `Piutang ${inv2.invoiceNumber}`,
            },
            {
              journalId: jInv2.id,
              accountId: accRevMem,
              debit: '0.00',
              credit: '1250000.00',
              memo: `Pendapatan Membership Elite ${athRafa.fullName}`,
            },
          ]);
        }

        // Payment 2 & Journal 4
        const [pay2] = await db
          .insert(payments)
          .values({
            organizationId,
            branchId: jktBranch.id,
            invoiceId: inv2.id,
            receiptNumber: 'RCP-2026-100102',
            paymentDate: yesterday,
            amount: '1250000.00',
            paymentMethod: 'QRIS',
            referenceNumber: 'QRIS-MANDIRI-991201',
            receivedByUserId: currentUser.id,
          })
          .returning();

        if (pay2) {
          const [jPay2] = await db
            .insert(journals)
            .values({
              organizationId,
              branchId: jktBranch.id,
              journalNumber: 'JRN-202609-1004',
              fiscalYear,
              periodMonth,
              entryDate: yesterday,
              sourceType: 'PAYMENT',
              sourceId: pay2.id,
              description: `Penerimaan Kas Pembayaran ${pay2.receiptNumber} (${inv2.invoiceNumber})`,
              totalDebit: '1250000.00',
              totalCredit: '1250000.00',
              status: 'POSTED',
              createdByUserId: currentUser.id,
            })
            .returning();

          if (jPay2) {
            await db.insert(journalEntries).values([
              {
                journalId: jPay2.id,
                accountId: accCash,
                debit: '1250000.00',
                credit: '0.00',
                memo: `Kas Masuk ${pay2.receiptNumber}`,
              },
              {
                journalId: jPay2.id,
                accountId: accAr,
                debit: '0.00',
                credit: '1250000.00',
                memo: `Pelunasan Piutang ${inv2.invoiceNumber}`,
              },
            ]);
          }
        }

        // Journal 5: Accrual Invoice 3 (Unpaid / Receivable)
        const [jInv3] = await db
          .insert(journals)
          .values({
            organizationId,
            branchId: jktBranch.id,
            journalNumber: 'JRN-202609-1005',
            fiscalYear,
            periodMonth,
            entryDate: yesterday,
            sourceType: 'INVOICE',
            sourceId: inv3.id,
            description: `Penerbitan Invoice ${inv3.invoiceNumber} - ${athDaffa.fullName}`,
            totalDebit: '750000.00',
            totalCredit: '750000.00',
            status: 'POSTED',
            createdByUserId: currentUser.id,
          })
          .returning();

        if (jInv3) {
          await db.insert(journalEntries).values([
            {
              journalId: jInv3.id,
              accountId: accAr,
              debit: '750000.00',
              credit: '0.00',
              memo: `Piutang ${inv3.invoiceNumber}`,
            },
            {
              journalId: jInv3.id,
              accountId: accRevMem,
              debit: '0.00',
              credit: '750000.00',
              memo: `Pendapatan Membership Reguler ${athDaffa.fullName}`,
            },
          ]);
        }
      }

      // Expense 1 & Balanced Journal
      if (accExpCourt && accExpEquip) {
        const [exp1] = await db
          .insert(expenses)
          .values({
            organizationId,
            branchId: jktBranch.id,
            expenseNumber: 'EXP-2026-1001',
            category: 'COURT_RENTAL',
            vendorName: 'Pengelola Gelora Indoor Arena Senayan',
            description: 'Sewa Lapangan Utama Wood Flooring & Pencahayaan Latihan Reguler',
            expenseDate: threeDaysAgo,
            amount: '950000.00',
            status: 'POSTED',
            approvedByUserId: currentUser.id,
            createdByUserId: currentUser.id,
          })
          .returning();

        if (exp1) {
          const [jExp1] = await db
            .insert(journals)
            .values({
              organizationId,
              branchId: jktBranch.id,
              journalNumber: 'JRN-202609-1006',
              fiscalYear,
              periodMonth,
              entryDate: threeDaysAgo,
              sourceType: 'EXPENSE',
              sourceId: exp1.id,
              description: `Pengeluaran Beban Sewa Lapangan ${exp1.expenseNumber}`,
              totalDebit: '950000.00',
              totalCredit: '950000.00',
              status: 'POSTED',
              createdByUserId: currentUser.id,
            })
            .returning();

          if (jExp1) {
            await db.insert(journalEntries).values([
              {
                journalId: jExp1.id,
                accountId: accExpCourt,
                debit: '950000.00',
                credit: '0.00',
                memo: exp1.description,
              },
              {
                journalId: jExp1.id,
                accountId: accCash,
                debit: '0.00',
                credit: '950000.00',
                memo: `Kas Keluar ${exp1.expenseNumber}`,
              },
            ]);
          }
        }
      }
    }

    // 9. Inventory Items & Stock Ledger
    const insertedInvItems = await db
      .insert(inventoryItems)
      .values([
        {
          organizationId,
          branchId: jktBranch.id,
          sku: 'BALL-FIBA-BG4500',
          name: 'Bola Basket Molten BG4500 FIBA Official Size 7',
          category: 'BALL',
          storageLocation: 'Gudang Utama Court A Senayan',
          conditionStatus: 'GOOD',
          unit: 'PCS',
          minStock: 10,
        },
        {
          organizationId,
          branchId: jktBranch.id,
          sku: 'JRS-REV-ZAMOA',
          name: 'Jersey Scrimmage Reversible ZAMOA CBTC Gold/Navy',
          category: 'JERSEY',
          storageLocation: 'Lemari Logistik Ruang Pelatih',
          conditionStatus: 'GOOD',
          unit: 'PCS',
          minStock: 15,
        },
        {
          organizationId,
          branchId: jktBranch.id,
          sku: 'MED-KINESIO-PRO',
          name: 'Kinesio Tape & Ethyl Chloride Cold Spray Medis',
          category: 'MEDICAL_KIT',
          storageLocation: 'Ruang Fisioterapi & Medis',
          conditionStatus: 'GOOD',
          unit: 'PAKET',
          minStock: 6,
        },
      ])
      .onConflictDoNothing()
      .returning();

    if (insertedInvItems.length >= 3) {
      await db.insert(inventoryTransactions).values([
        {
          organizationId,
          branchId: jktBranch.id,
          itemId: insertedInvItems[0].id,
          transactionType: 'PURCHASE',
          quantityDelta: 24,
          targetLocation: 'Gudang Utama Court A Senayan',
          conditionAfter: 'GOOD',
          referenceNote: 'Stok awal bola latihan resmi musim 2026/2027',
          recordedByUserId: currentUser.id,
        },
        {
          organizationId,
          branchId: jktBranch.id,
          itemId: insertedInvItems[1].id,
          transactionType: 'PURCHASE',
          quantityDelta: 36,
          targetLocation: 'Lemari Logistik Ruang Pelatih',
          conditionAfter: 'GOOD',
          referenceNote: 'Pengadaan jersey latihan reversible U-14 & U-16',
          recordedByUserId: currentUser.id,
        },
        {
          organizationId,
          branchId: jktBranch.id,
          itemId: insertedInvItems[2].id,
          transactionType: 'PURCHASE',
          quantityDelta: 4,
          targetLocation: 'Ruang Fisioterapi & Medis',
          conditionAfter: 'GOOD',
          referenceNote: 'Sisa stok medis aktif (di bawah batas minimum 6 paket)',
          recordedByUserId: currentUser.id,
        },
      ]);
    }

    // 10. Announcements, Digital Notifications, Documents, Media & Audit Logs
    const insertedAnnouncements = await db
      .insert(announcements)
      .values([
        {
          organizationId,
          branchId: jktBranch.id,
          teamId: teamKu16?.id ?? null,
          targetRole: 'ALL',
          title: 'Persiapan Semifinal Governor Cup U-16 & Jadwal Scrimmage Tambahan',
          content:
            'Seluruh atlet ZAMOA Garuda U-16 wajib hadir 30 menit sebelum sesi latihan untuk sesi video analysis dan pemeriksaan kesiapan fisik bersama tim medis.',
          priority: 'URGENT',
          publishedByUserId: currentUser.id,
        },
        {
          organizationId,
          branchId: jktBranch.id,
          targetRole: 'PARENT',
          title: 'Rilis Rapor Evaluasi Kuartal III & Pembaruan Sistem Notifikasi Digital',
          content:
            'Rapor perkembangan teknis, fisik, dan mental atlet Kuartal III telah tersedia secara digital. Orang tua dapat mengunduh kartu pemberitahuan resmi langsung dari portal.',
          priority: 'IMPORTANT',
          publishedByUserId: currentUser.id,
        },
      ])
      .returning();

    const ann1 = insertedAnnouncements[0];

    await db.insert(notifications).values([
      {
        organizationId,
        userId: currentUser.id,
        announcementId: ann1?.id ?? null,
        title: '[URGENT] Persiapan Semifinal Governor Cup U-16',
        message:
          'Jadwal latihan taktikal berikutnya di Court A Senayan. Pastikan seluruh roster U-16 telah melakukan konfirmasi kehadiran.',
        category: 'ANNOUNCEMENT',
        isRead: false,
      },
      {
        organizationId,
        userId: currentUser.id,
        title: 'Pengingat Tagihan Aktif: INV-2026-100103 (Daffa Ramadhan)',
        message:
          'Terdapat 1 invoice membership berstatus ISSUED senilai Rp 750.000 yang menunggu penyelesaian pembayaran.',
        category: 'BILLING',
        isRead: false,
      },
      {
        organizationId,
        userId: currentUser.id,
        title: 'Atensi Medis Return-to-Play: Nathaniel Bagas Saputra',
        message:
          'Status RTP atlet saat ini LIMITED_CONTACT (Grade 1 Lateral Ankle Sprain). Pantau rekomendasi beban latihan dari dr. Nadia Pratama.',
        category: 'MEDICAL',
        isRead: false,
      },
      {
        organizationId,
        userId: currentUser.id,
        title: 'Rapor Evaluasi Kuartal III Terbit (Skor Rata-Rata: 8.50 / 10)',
        message:
          'Evaluasi berkala untuk Kevin Pratama Wijaya (8.73) dan Rafael Putra Gunawan (8.27) telah disimpan ke rekam jejak akademik.',
        category: 'EVALUATION',
        isRead: true,
        readAt: new Date(),
      },
    ]);

    if (athKevin && coachBudi) {
      await db.insert(documents).values([
        {
          organizationId,
          branchId: jktBranch.id,
          ownerUserId: currentUser.id,
          entityType: 'COACH',
          entityId: coachBudi.id,
          documentCategory: 'CONTRACT',
          title: 'Kontrak Kerja Pelatih Kepala U-16 — Coach Budi Santoso (CTR-2026-JKT-001)',
          fileType: 'PDF',
          fileUrl: 'https://storage.zamoa-cbtc.id/docs/CTR-2026-JKT-001.pdf',
          visibility: 'ROLE_RESTRICTED',
          accessPermission: 'documents:view',
        },
        {
          organizationId,
          branchId: jktBranch.id,
          ownerUserId: currentUser.id,
          entityType: 'ATHLETE',
          entityId: athKevin.id,
          documentCategory: 'CERTIFICATE',
          title: 'Sertifikat Penghargaan MVP Governor Cup U-16 — Kevin Pratama Wijaya',
          fileType: 'PDF',
          fileUrl: 'https://storage.zamoa-cbtc.id/docs/MVP-CERT-KEVIN-2026.pdf',
          visibility: 'PUBLIC',
          accessPermission: 'documents:view',
        },
      ]);

      await db.insert(media).values([
        {
          organizationId,
          branchId: jktBranch.id,
          ownerUserId: currentUser.id,
          entityType: 'MATCH',
          entityId: athKevin.id,
          mediaType: 'PHOTO',
          title: 'Dokumentasi Kemenangan ZAMOA Garuda U-16 vs Hawks Academy (82-74)',
          mediaUrl:
            'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1000&q=80',
          visibility: 'PUBLIC',
        },
        {
          organizationId,
          branchId: jktBranch.id,
          ownerUserId: currentUser.id,
          entityType: 'TRAINING',
          entityId: coachBudi.id,
          mediaType: 'VIDEO',
          title: 'Rekaman Analisis Taktikal Pick & Roll Execution U-16 Court A',
          mediaUrl:
            'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1000&q=80',
          visibility: 'BRANCH',
        },
      ]);
    }

    // Seed rich initial Audit Logs across diverse actors & actions
    await db.insert(auditLogs).values([
      {
        organizationId,
        actorUserId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: 'SUPER_ADMIN',
        action: 'CREATE',
        entity: 'athletes',
        entityId: athKevin?.id || 'CBTC-2026-1001',
        beforeState: null,
        afterState: {
          memberCode: 'CBTC-2026-1001',
          fullName: 'Kevin Pratama Wijaya',
          team: 'ZAMOA Garuda U-16 Putra',
          membershipStatus: 'ACTIVE',
        },
        ipDevice: '10.128.0.14 • Chrome Enterprise Admin',
      },
      {
        organizationId,
        actorUserId: currentUser.id,
        actorName: 'Coach Budi Santoso',
        actorRole: 'HEAD_COACH',
        action: 'CREATE',
        entity: 'player_evaluations',
        entityId: athKevin?.id || 'EVAL-2026-Q3',
        beforeState: { periodLabel: 'Kuartal II 2026', overallScore: '8.40' },
        afterState: {
          periodLabel: 'Rapor Evaluasi Kuartal III 2026',
          technicalAvg: '8.33',
          physicalAvg: '8.80',
          mentalAvg: '9.25',
          overallScore: '8.73',
        },
        ipDevice: '10.128.0.21 • iPad Pro Court-Side',
      },
      {
        organizationId,
        actorUserId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: 'TREASURER',
        action: 'PAYMENT',
        entity: 'payments',
        entityId: 'RCP-2026-100101',
        beforeState: { invoiceNumber: 'INV-2026-100101', status: 'ISSUED', paidAmount: '0.00' },
        afterState: {
          invoiceNumber: 'INV-2026-100101',
          receiptNumber: 'RCP-2026-100101',
          status: 'PAID',
          paidAmount: '1750000.00',
          journalNumber: 'JRN-202609-1002',
        },
        ipDevice: '10.128.0.14 • Finance Workstation',
      },
      {
        organizationId,
        actorUserId: currentUser.id,
        actorName: 'dr. Nadia Pratama, Sp.KO',
        actorRole: 'MEDICAL_STAFF',
        action: 'UPDATE',
        entity: 'injuries',
        entityId: athBagas?.id || 'MED-RTP-01',
        beforeState: { returnToPlayStatus: 'REHABILITATION' },
        afterState: {
          athlete: 'Nathaniel Bagas Saputra',
          diagnosis: 'Grade 1 Mild Lateral Ankle Sprain',
          returnToPlayStatus: 'LIMITED_CONTACT',
        },
        ipDevice: '10.128.0.35 • Medical Clinic Terminal',
      },
    ]);
  } catch (err) {
    console.warn('Non-fatal warning during initial operational data seed:', err);
  }
}
