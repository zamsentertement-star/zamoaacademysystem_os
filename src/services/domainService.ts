import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  organizations,
  branches,
  users,
  roles,
  jobRoleConfigs,
  ageGroups,
  teams,
  athletes,
  parents,
  parentAthletes,
  coaches,
  staff,
  employments,
  compensationRules,
  trainingPrograms,
  trainingSessions,
  attendances,
  coachAttendances,
  staffAttendances,
  assessmentCriteria,
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
  membershipPlans,
  memberships,
  invoices,
  payments,
  expenses,
  payrolls,
  payrollItems,
  inventoryItems,
  inventoryTransactions,
  announcements,
  notifications,
  documents,
  media,
  auditLogs,
} from '../db/schema.ts';
import { AuthenticatedUser } from '../middleware/auth.ts';
import { getAccountingSnapshot } from './accountingService.ts';
import { hasPermission } from '../lib/rbac.ts';

export async function getSystemStateForUser(user: AuthenticatedUser) {
  try {
    const orgId = user.organizationId;
    const branchFilter = user.branchId;

    const [
      orgRows,
      branchRows,
      roleRows,
      jobRoleConfigRows,
      userRows,
      ageGroupRows,
      teamRows,
      athleteRows,
      parentRows,
      parentAthleteRows,
      coachRows,
      staffRows,
      employmentRows,
      compRuleRows,
      programRows,
      sessionRows,
      attendanceRows,
      coachAttendanceRows,
      staffAttendanceRows,
      criteriaRows,
      evaluationRows,
      goalRows,
      playerStatRows,
      competitionRows,
      tournamentRows,
      matchRows,
      matchRosterRows,
      matchStatRows,
      achievementRows,
      planRows,
      membershipRows,
      invoiceRows,
      paymentRows,
      expenseRows,
      payrollRows,
      payrollItemRows,
      invItemRows,
      invTxRows,
      announcementRows,
      notificationRows,
      documentRows,
      mediaRows,
      auditRows,
    ] = await Promise.all([
      db.select().from(organizations).where(eq(organizations.id, orgId)),
      db.select().from(branches).where(eq(branches.organizationId, orgId)),
      db.select().from(roles).where(eq(roles.organizationId, orgId)),
      db.select().from(jobRoleConfigs).where(eq(jobRoleConfigs.organizationId, orgId)),
      db.select().from(users).where(eq(users.organizationId, orgId)),
      db.select().from(ageGroups).where(eq(ageGroups.organizationId, orgId)),
      db
        .select()
        .from(teams)
        .where(
          branchFilter
            ? and(eq(teams.organizationId, orgId), eq(teams.branchId, branchFilter))
            : eq(teams.organizationId, orgId)
        ),
      db
        .select()
        .from(athletes)
        .where(
          branchFilter
            ? and(eq(athletes.organizationId, orgId), eq(athletes.branchId, branchFilter))
            : eq(athletes.organizationId, orgId)
        )
        .orderBy(desc(athletes.createdAt)),
      db
        .select()
        .from(parents)
        .where(
          branchFilter
            ? and(eq(parents.organizationId, orgId), eq(parents.branchId, branchFilter))
            : eq(parents.organizationId, orgId)
        ),
      db.select().from(parentAthletes),
      db
        .select()
        .from(coaches)
        .where(
          branchFilter
            ? and(eq(coaches.organizationId, orgId), eq(coaches.branchId, branchFilter))
            : eq(coaches.organizationId, orgId)
        ),
      db
        .select()
        .from(staff)
        .where(
          branchFilter
            ? and(eq(staff.organizationId, orgId), eq(staff.branchId, branchFilter))
            : eq(staff.organizationId, orgId)
        ),
      db
        .select()
        .from(employments)
        .where(
          branchFilter
            ? and(eq(employments.organizationId, orgId), eq(employments.branchId, branchFilter))
            : eq(employments.organizationId, orgId)
        ),
      db.select().from(compensationRules).where(eq(compensationRules.organizationId, orgId)),
      db
        .select()
        .from(trainingPrograms)
        .where(
          branchFilter
            ? and(
                eq(trainingPrograms.organizationId, orgId),
                eq(trainingPrograms.branchId, branchFilter)
              )
            : eq(trainingPrograms.organizationId, orgId)
        ),
      db
        .select()
        .from(trainingSessions)
        .where(
          branchFilter
            ? and(
                eq(trainingSessions.organizationId, orgId),
                eq(trainingSessions.branchId, branchFilter)
              )
            : eq(trainingSessions.organizationId, orgId)
        )
        .orderBy(desc(trainingSessions.sessionDate)),
      db
        .select()
        .from(attendances)
        .where(
          branchFilter
            ? and(eq(attendances.organizationId, orgId), eq(attendances.branchId, branchFilter))
            : eq(attendances.organizationId, orgId)
        ),
      db
        .select()
        .from(coachAttendances)
        .where(
          branchFilter
            ? and(
                eq(coachAttendances.organizationId, orgId),
                eq(coachAttendances.branchId, branchFilter)
              )
            : eq(coachAttendances.organizationId, orgId)
        ),
      db
        .select()
        .from(staffAttendances)
        .where(
          branchFilter
            ? and(
                eq(staffAttendances.organizationId, orgId),
                eq(staffAttendances.branchId, branchFilter)
              )
            : eq(staffAttendances.organizationId, orgId)
        ),
      db.select().from(assessmentCriteria).where(eq(assessmentCriteria.organizationId, orgId)),
      db
        .select()
        .from(playerEvaluations)
        .where(
          branchFilter
            ? and(
                eq(playerEvaluations.organizationId, orgId),
                eq(playerEvaluations.branchId, branchFilter)
              )
            : eq(playerEvaluations.organizationId, orgId)
        )
        .orderBy(desc(playerEvaluations.evaluationDate)),
      db.select().from(playerGoals).where(eq(playerGoals.organizationId, orgId)),
      db.select().from(playerStats).where(eq(playerStats.organizationId, orgId)),
      db.select().from(competitions).where(eq(competitions.organizationId, orgId)),
      db
        .select()
        .from(tournaments)
        .where(
          branchFilter
            ? and(eq(tournaments.organizationId, orgId), eq(tournaments.branchId, branchFilter))
            : eq(tournaments.organizationId, orgId)
        )
        .orderBy(desc(tournaments.startDate)),
      db
        .select()
        .from(matches)
        .where(
          branchFilter
            ? and(eq(matches.organizationId, orgId), eq(matches.branchId, branchFilter))
            : eq(matches.organizationId, orgId)
        )
        .orderBy(desc(matches.matchDate)),
      db.select().from(matchRosters),
      db.select().from(matchStats),
      db
        .select()
        .from(achievements)
        .where(
          branchFilter
            ? and(eq(achievements.organizationId, orgId), eq(achievements.branchId, branchFilter))
            : eq(achievements.organizationId, orgId)
        )
        .orderBy(desc(achievements.awardedDate)),
      db.select().from(membershipPlans).where(eq(membershipPlans.organizationId, orgId)),
      db
        .select()
        .from(memberships)
        .where(
          branchFilter
            ? and(eq(memberships.organizationId, orgId), eq(memberships.branchId, branchFilter))
            : eq(memberships.organizationId, orgId)
        ),
      db
        .select()
        .from(invoices)
        .where(
          branchFilter
            ? and(eq(invoices.organizationId, orgId), eq(invoices.branchId, branchFilter))
            : eq(invoices.organizationId, orgId)
        )
        .orderBy(desc(invoices.createdAt)),
      db
        .select()
        .from(payments)
        .where(
          branchFilter
            ? and(eq(payments.organizationId, orgId), eq(payments.branchId, branchFilter))
            : eq(payments.organizationId, orgId)
        )
        .orderBy(desc(payments.paymentDate)),
      db
        .select()
        .from(expenses)
        .where(
          branchFilter
            ? and(eq(expenses.organizationId, orgId), eq(expenses.branchId, branchFilter))
            : eq(expenses.organizationId, orgId)
        )
        .orderBy(desc(expenses.expenseDate)),
      db
        .select()
        .from(payrolls)
        .where(
          branchFilter
            ? and(eq(payrolls.organizationId, orgId), eq(payrolls.branchId, branchFilter))
            : eq(payrolls.organizationId, orgId)
        )
        .orderBy(desc(payrolls.createdAt)),
      db.select().from(payrollItems),
      db
        .select()
        .from(inventoryItems)
        .where(
          branchFilter
            ? and(
                eq(inventoryItems.organizationId, orgId),
                eq(inventoryItems.branchId, branchFilter)
              )
            : eq(inventoryItems.organizationId, orgId)
        ),
      db
        .select()
        .from(inventoryTransactions)
        .where(
          branchFilter
            ? and(
                eq(inventoryTransactions.organizationId, orgId),
                eq(inventoryTransactions.branchId, branchFilter)
              )
            : eq(inventoryTransactions.organizationId, orgId)
        )
        .orderBy(desc(inventoryTransactions.createdAt)),
      db
        .select()
        .from(announcements)
        .where(eq(announcements.organizationId, orgId))
        .orderBy(desc(announcements.createdAt)),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.organizationId, orgId))
        .orderBy(desc(notifications.createdAt)),
      db
        .select()
        .from(documents)
        .where(eq(documents.organizationId, orgId))
        .orderBy(desc(documents.uploadedAt)),
      db
        .select()
        .from(media)
        .where(eq(media.organizationId, orgId))
        .orderBy(desc(media.uploadedAt)),
      db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.organizationId, orgId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(150),
    ]);

    // Medical records strictly gated by RBAC permission
    let medicalRecordRows: typeof medicalRecords.$inferSelect[] = [];
    let injuryRows: typeof injuries.$inferSelect[] = [];
    if (hasPermission(user.activeRoleCode, 'medical', 'view')) {
      medicalRecordRows = await db
        .select()
        .from(medicalRecords)
        .where(
          branchFilter
            ? and(
                eq(medicalRecords.organizationId, orgId),
                eq(medicalRecords.branchId, branchFilter)
              )
            : eq(medicalRecords.organizationId, orgId)
        );
      injuryRows = await db
        .select()
        .from(injuries)
        .where(
          branchFilter
            ? and(eq(injuries.organizationId, orgId), eq(injuries.branchId, branchFilter))
            : eq(injuries.organizationId, orgId)
        )
        .orderBy(desc(injuries.injuryDate));
    }

    // Compute Inventory Stock from Ledger
    const inventoryWithStock = invItemRows.map((item) => {
      const itemTxs = invTxRows.filter((tx) => tx.itemId === item.id);
      const currentStock = itemTxs.reduce((sum, tx) => sum + Number(tx.quantityDelta || 0), 0);
      return {
        ...item,
        currentStock,
      };
    });

    const accounting = await getAccountingSnapshot(orgId, branchFilter);

    // Parent role scoping: Parent only sees linked athletes if a parent profile matches their email/userId
    let scopedAthletes = athleteRows;
    if (user.activeRoleCode === 'PARENT') {
      const matchingParents = parentRows.filter(
        (p) => p.userId === user.id || (p.email && p.email.toLowerCase() === user.email.toLowerCase())
      );
      if (matchingParents.length > 0) {
        const parentIds = new Set(matchingParents.map((p) => p.id));
        const linkedAthleteIds = new Set(
          parentAthleteRows.filter((pa) => parentIds.has(pa.parentId)).map((pa) => pa.athleteId)
        );
        scopedAthletes = athleteRows.filter((a) => linkedAthleteIds.has(a.id));
      }
    }

    return {
      currentUser: user,
      organization: orgRows[0],
      branches: branchRows,
      roles: roleRows,
      jobRoleConfigs: jobRoleConfigRows,
      users: userRows,
      ageGroups: ageGroupRows,
      teams: teamRows,
      athletes: scopedAthletes,
      parents: parentRows,
      parentAthletes: parentAthleteRows,
      coaches: coachRows,
      staff: staffRows,
      employments: employmentRows,
      compensationRules: compRuleRows,
      trainingPrograms: programRows,
      trainingSessions: sessionRows,
      attendances: attendanceRows,
      coachAttendances: coachAttendanceRows,
      staffAttendances: staffAttendanceRows,
      assessmentCriteria: criteriaRows,
      playerEvaluations: evaluationRows,
      playerGoals: goalRows,
      playerStats: playerStatRows,
      competitions: competitionRows,
      tournaments: tournamentRows,
      matches: matchRows,
      matchRosters: matchRosterRows,
      matchStats: matchStatRows,
      achievements: achievementRows,
      medicalRecords: medicalRecordRows,
      injuries: injuryRows,
      membershipPlans: planRows,
      memberships: membershipRows,
      invoices: invoiceRows,
      payments: paymentRows,
      expenses: expenseRows,
      accounting,
      payrolls: payrollRows.map((p) => ({
        ...p,
        items: payrollItemRows.filter((item) => item.payrollId === p.id),
      })),
      inventoryItems: inventoryWithStock,
      inventoryTransactions: invTxRows,
      announcements: announcementRows,
      notifications: notificationRows,
      documents: documentRows,
      media: mediaRows,
      auditLogs: auditRows,
    };
  } catch (error) {
    console.error('Failed to load full system state:', error);
    throw new Error('Gagal mengambil state operasional akademi dari database.', { cause: error });
  }
}
