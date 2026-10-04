import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { eq, and, desc, gte, lte, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  getRecentDatabaseQueries,
  recordCapturedDatabaseQuery,
} from './src/db/index.ts';
import { pool, executeSchemaSql } from './src/lib/supabase.ts';
import {
  organizations,
  branches,
  users,
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
  assessmentCriteria,
  playerEvaluations,
  playerGoals,
  competitions,
  tournaments,
  matches,
  matchRosters,
  achievements,
  medicalRecords,
  injuries,
  membershipPlans,
  invoices,
  accounts,
  inventoryItems,
  inventoryTransactions,
  announcements,
  notifications,
  documents,
  media,
  auditLogs,
} from './src/db/schema.ts';
import {
  requireAuth,
  requirePermission,
  AuthRequest,
  recordAuditLog,
} from './src/middleware/auth.ts';
import { getSystemStateForUser } from './src/services/domainService.ts';
import {
  registerAthleteWorkflow,
  updateAthleteStatusWorkflow,
  recordAttendanceWorkflow,
  recordCoachAttendanceWorkflow,
  checkoutCoachAttendanceWorkflow,
  recordStaffAttendanceWorkflow,
  checkoutStaffAttendanceWorkflow,
  createPlayerEvaluationWorkflow,
  compileAndDispatchMonthlyAthleteReportEmail,
  recordPaymentWorkflow,
  createInvoiceWorkflow,
  createExpenseWorkflow,
  generatePayrollWorkflow,
  approvePayrollWorkflow,
  recordInventoryTransactionWorkflow,
  completeMatchAndStatsWorkflow,
  registerAthletesToTournamentWorkflow,
  dispatchDailyTrainingWhatsAppRemindersWorkflow,
  dispatchInvoiceWhatsAppNotificationWorkflow,
} from './src/services/workflowService.ts';
import { postDoubleEntryJournal, reversePostedJournal } from './src/services/accountingService.ts';
import { hasPermission } from './src/lib/rbac.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // ==========================================================================
  // CORE SYSTEM STATE & CONTEXT SWITCHING
  // ==========================================================================
  app.get('/api/state', requireAuth, async (req: AuthRequest, res) => {
    try {
      const state = await getSystemStateForUser(req.currentUser!);
      res.json(state);
    } catch (error: unknown) {
      console.error('GET /api/state failed:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Gagal memuat data sistem.',
      });
    }
  });

  app.post('/api/context/switch', requireAuth, async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        activeRoleCode: z.string().optional(),
        branchId: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);
      const currentUser = req.currentUser!;

      const updates: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (parsed.activeRoleCode) {
        updates.activeRoleCode = parsed.activeRoleCode;
      }
      if (parsed.branchId !== undefined) {
        updates.branchId = parsed.branchId === 'ALL' ? null : parsed.branchId;
      }

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, currentUser.id))
        .returning();

      await recordAuditLog({
        user: currentUser,
        action: 'PERMISSION_CHANGE',
        entity: 'users',
        entityId: currentUser.id,
        beforeState: {
          activeRoleCode: currentUser.activeRoleCode,
          branchId: currentUser.branchId,
        },
        afterState: {
          activeRoleCode: updated.activeRoleCode,
          branchId: updated.branchId,
        },
        req,
      });

      res.json(updated);
    } catch (error: unknown) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Gagal mengubah konteks role/cabang.',
      });
    }
  });

  // ==========================================================================
  // ATHLETE & PARENT MANAGEMENT (DOM-C, DOM-D)
  // ==========================================================================
  app.post(
    '/api/athletes',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const user = req.currentUser!;
        const isOnlineSelfReg = req.body?.registrationChannel === 'ONLINE';
        if (!hasPermission(user.activeRoleCode, 'athletes', 'create') && !isOnlineSelfReg) {
          return res.status(403).json({
            error: `Akses ditolak: Role '${user.activeRoleCode}' tidak memiliki izin pendaftaran Offline. Gunakan mode Pendaftaran Online Mandiri.`,
          });
        }

        const schema = z.object({
          branchId: z.string().uuid(),
          ageGroupId: z.string().uuid().optional().or(z.literal('')),
          teamId: z.string().uuid().optional().or(z.literal('')),
          fullName: z.string().min(2),
          nickname: z.string().optional(),
          gender: z.enum(['MALE', 'FEMALE']),
          birthDate: z.string().min(8),
          birthPlace: z.string().optional(),
          identityNumber: z.string().optional(),
          photoUrl: z.string().optional(),
          photoSizeSpec: z.enum(['3x4', '4x6', '1x1']).optional(),
          photoBgColor: z.enum(['RED', 'BLUE', 'WHITE']).optional(),
          photoVerified: z.boolean().optional(),
          registrationChannel: z.enum(['ONLINE', 'OFFLINE']).optional(),
          position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']),
          heightCm: z.coerce.number().min(80).max(250),
          weightKg: z.coerce.number().min(15).max(180),
          jerseySize: z.string().min(1),
          jerseyNumber: z.coerce.number().min(0).max(99),
          parentContactName: z.string().min(2),
          parentContactPhone: z.string().min(6),
          parentEmail: z.string().optional(),
          parentRelationship: z.enum(['FATHER', 'MOTHER', 'GUARDIAN']).optional(),
          emergencyContactName: z.string().min(2),
          emergencyContactPhone: z.string().min(6),
          planId: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const result = await registerAthleteWorkflow(user, {
          ...data,
          ageGroupId: data.ageGroupId || undefined,
          teamId: data.teamId || undefined,
          planId: data.planId || undefined,
        });
        res.status(201).json(result);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Validasi pendaftaran atlet gagal.',
        });
      }
    }
  );

  app.patch(
    '/api/athletes/:id',
    requireAuth,
    requirePermission('athletes', 'update'),
    async (req: AuthRequest, res) => {
      try {
        const result = await updateAthleteStatusWorkflow(
          req.currentUser!,
          req.params.id,
          req.body
        );
        res.json(result);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui atlet.',
        });
      }
    }
  );

  app.post(
    '/api/parents',
    requireAuth,
    requirePermission('parents', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          fullName: z.string().min(2),
          relationshipType: z.enum(['FATHER', 'MOTHER', 'GUARDIAN']),
          phone: z.string().min(6),
          email: z.string().optional(),
          occupation: z.string().optional(),
          address: z.string().optional(),
          athleteId: z.string().uuid().optional().or(z.literal('')),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [parent] = await db
          .insert(parents)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId,
            fullName: data.fullName,
            relationshipType: data.relationshipType,
            phone: data.phone,
            email: data.email || null,
            occupation: data.occupation || null,
            address: data.address || null,
          })
          .returning();

        if (data.athleteId) {
          await db
            .insert(parentAthletes)
            .values({
              parentId: parent.id,
              athleteId: data.athleteId,
              relationship: data.relationshipType,
              isPrimaryGuardian: false,
            })
            .onConflictDoNothing();
        }

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'parents',
          entityId: parent.id,
          afterState: parent,
          req,
        });

        res.status(201).json(parent);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menambahkan data orang tua/wali.',
        });
      }
    }
  );

  // ==========================================================================
  // ACADEMY, TEAMS, TRAINING, ATTENDANCE & PLAYER DEVELOPMENT (DOM-E, F, G)
  // ==========================================================================
  app.post(
    '/api/age-groups',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          code: z.string().min(2),
          name: z.string().min(2),
          minAge: z.coerce.number().min(4),
          maxAge: z.coerce.number().max(35),
          description: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const [created] = await db
          .insert(ageGroups)
          .values({
            organizationId: user.organizationId,
            code: data.code.toUpperCase(),
            name: data.name,
            minAge: data.minAge,
            maxAge: data.maxAge,
            description: data.description || null,
          })
          .returning();
        res.status(201).json(created);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat kelompok umur.',
        });
      }
    }
  );

  app.post(
    '/api/teams',
    requireAuth,
    requirePermission('teams', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          ageGroupId: z.string().uuid(),
          headCoachId: z.string().uuid().optional().or(z.literal('')),
          code: z.string().min(2),
          name: z.string().min(2),
          genderDivision: z.enum(['PUTRA', 'PUTRI', 'MIXED']),
          season: z.string().min(4),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const [team] = await db
          .insert(teams)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId,
            ageGroupId: data.ageGroupId,
            headCoachId: data.headCoachId || null,
            code: data.code.toUpperCase(),
            name: data.name,
            genderDivision: data.genderDivision,
            season: data.season,
          })
          .returning();

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'teams',
          entityId: team.id,
          afterState: team,
          req,
        });
        res.status(201).json(team);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat tim.',
        });
      }
    }
  );

  app.post(
    '/api/training-programs',
    requireAuth,
    requirePermission('training', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          ageGroupId: z.string().uuid().optional().or(z.literal('')),
          code: z.string().min(2),
          name: z.string().min(2),
          season: z.string().min(4),
          focusArea: z.string().min(3),
          sessionsPerWeek: z.coerce.number().min(1).max(14),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const [program] = await db
          .insert(trainingPrograms)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId,
            ageGroupId: data.ageGroupId || null,
            code: data.code.toUpperCase(),
            name: data.name,
            season: data.season,
            focusArea: data.focusArea,
            sessionsPerWeek: data.sessionsPerWeek,
          })
          .returning();
        res.status(201).json(program);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat program latihan.',
        });
      }
    }
  );

  app.post(
    '/api/training-sessions',
    requireAuth,
    requirePermission('training', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          programId: z.string().uuid(),
          teamId: z.string().uuid(),
          coachId: z.string().uuid(),
          courtName: z.string().min(2),
          sessionDate: z.string().min(8),
          startTime: z.string().min(4),
          endTime: z.string().min(4),
          topic: z.string().min(2),
          trainingNotes: z.string().optional(),
          status: z.enum(['SCHEDULED', 'ONGOING']).optional().default('SCHEDULED'),
          sendWaReminder: z.boolean().optional(),
          autoSendWhatsAppReminder: z.boolean().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const [session] = await db
          .insert(trainingSessions)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId,
            programId: data.programId,
            teamId: data.teamId,
            coachId: data.coachId,
            courtName: data.courtName,
            sessionDate: data.sessionDate,
            startTime: data.startTime,
            endTime: data.endTime,
            topic: data.topic,
            trainingNotes: data.trainingNotes || null,
            status: data.status || 'SCHEDULED',
          })
          .returning();

        // Automatically dispatch WhatsApp Gateway daily training schedule reminders to parents of the team's athletes
        let waDispatchedCount = 0;
        const shouldSendWa =
          data.sendWaReminder !== false && data.autoSendWhatsAppReminder !== false;
        if (shouldSendWa) {
          try {
            const waRes = await dispatchDailyTrainingWhatsAppRemindersWorkflow(user, {
              sessionId: session.id,
            });
            waDispatchedCount = waRes.dispatchedCount;
          } catch (waErr) {
            console.warn('Auto WA reminder on session create warning:', waErr);
          }
        }

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'training_sessions',
          entityId: session.id,
          afterState: { ...session, waDispatchedCount },
          req,
        });
        res.status(201).json({
          ...session,
          waDispatchedCount,
          whatsappDispatchedCount: waDispatchedCount,
        });
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menjadwalkan sesi latihan.',
        });
      }
    }
  );

  app.patch(
    '/api/training-sessions/:id/status',
    requireAuth,
    requirePermission('training', 'process'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          status: z.enum(['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED']),
          trainingNotes: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const [updated] = await db
          .update(trainingSessions)
          .set({
            status: data.status,
            ...(data.trainingNotes !== undefined ? { trainingNotes: data.trainingNotes } : {}),
          })
          .where(
            and(
              eq(trainingSessions.id, req.params.id),
              eq(trainingSessions.organizationId, user.organizationId)
            )
          )
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'training_sessions',
          entityId: req.params.id,
          afterState: updated,
          req,
        });
        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui status sesi latihan.',
        });
      }
    }
  );

  app.post(
    '/api/attendances',
    requireAuth,
    requirePermission('attendance', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          sessionId: z.string().uuid(),
          athleteId: z.string().uuid(),
          status: z.enum(['PRESENT', 'LATE', 'EXCUSED', 'SICK', 'ABSENT']),
          source: z.enum(['QR', 'COACH', 'ADMIN']),
          notes: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const record = await recordAttendanceWorkflow(req.currentUser!, data);
        res.status(201).json(record);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal mencatat presensi.',
        });
      }
    }
  );

  app.post(
    '/api/attendances/bulk',
    requireAuth,
    requirePermission('attendance', 'process'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          sessionId: z.string().uuid(),
          athleteIds: z.array(z.string().uuid()).min(1),
          status: z.enum(['PRESENT', 'LATE', 'EXCUSED', 'SICK', 'ABSENT']).default('PRESENT'),
          source: z.enum(['QR', 'COACH', 'ADMIN']).default('COACH'),
        });
        const data = schema.parse(req.body);
        const results = [];
        for (const athleteId of data.athleteIds) {
          const rec = await recordAttendanceWorkflow(req.currentUser!, {
            branchId: data.branchId,
            sessionId: data.sessionId,
            athleteId,
            status: data.status,
            source: data.source,
            notes: `Bulk presensi (${data.status}) via ${data.source}`,
          });
          results.push(rec);
        }
        res.status(201).json({ count: results.length, records: results });
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal mencatat presensi massal.',
        });
      }
    }
  );

  app.post(
    '/api/coach-attendances',
    requireAuth,
    requirePermission('attendance', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          sessionId: z.string().uuid(),
          coachId: z.string().uuid(),
          status: z.enum(['PRESENT', 'LATE', 'SUBSTITUTE', 'EXCUSED', 'ABSENT']),
          checkInMethod: z
            .enum(['DIGITAL_QR', 'DIGITAL_PIN', 'COURT_KIOSK', 'ADMIN_VERIFIED'])
            .default('DIGITAL_QR'),
          notes: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const record = await recordCoachAttendanceWorkflow(req.currentUser!, data);
        res.status(201).json(record);
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error ? error.message : 'Gagal mencatat presensi digital pelatih.',
        });
      }
    }
  );

  app.patch(
    '/api/coach-attendances/:id/checkout',
    requireAuth,
    requirePermission('attendance', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          notes: z.string().optional(),
        });
        const data = schema.parse(req.body || {});
        const updated = await checkoutCoachAttendanceWorkflow(
          req.currentUser!,
          req.params.id,
          data.notes
        );
        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error ? error.message : 'Gagal mencatat check-out digital pelatih.',
        });
      }
    }
  );

  app.post(
    '/api/staff-attendances',
    requireAuth,
    requirePermission('attendance', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          sessionId: z.string().uuid(),
          staffId: z.string().uuid(),
          status: z.enum(['PRESENT', 'LATE', 'ON_DUTY', 'EXCUSED', 'ABSENT']),
          checkInMethod: z
            .enum(['DIGITAL_QR', 'DIGITAL_PIN', 'COURT_KIOSK', 'ADMIN_VERIFIED'])
            .default('DIGITAL_QR'),
          notes: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const record = await recordStaffAttendanceWorkflow(req.currentUser!, data);
        res.status(201).json(record);
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error ? error.message : 'Gagal mencatat presensi digital staf.',
        });
      }
    }
  );

  app.patch(
    '/api/staff-attendances/:id/checkout',
    requireAuth,
    requirePermission('attendance', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          notes: z.string().optional(),
        });
        const data = schema.parse(req.body || {});
        const updated = await checkoutStaffAttendanceWorkflow(
          req.currentUser!,
          req.params.id,
          data.notes
        );
        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error ? error.message : 'Gagal mencatat check-out digital staf.',
        });
      }
    }
  );

  app.post(
    '/api/assessment-criteria',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          category: z.enum(['TECHNICAL', 'PHYSICAL', 'MENTAL']),
          code: z.string().min(2),
          name: z.string().min(2),
          minScore: z.coerce.number().default(1),
          maxScore: z.coerce.number().default(10),
          weight: z.coerce.number().default(1),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const [created] = await db
          .insert(assessmentCriteria)
          .values({
            organizationId: user.organizationId,
            category: data.category,
            code: data.code.toUpperCase().replace(/\s+/g, '_'),
            name: data.name,
            minScore: data.minScore,
            maxScore: data.maxScore,
            weight: data.weight.toFixed(2),
            isActive: true,
          })
          .returning();
        res.status(201).json(created);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menambahkan indikator evaluasi.',
        });
      }
    }
  );

  app.post(
    '/api/evaluations',
    requireAuth,
    requirePermission('development', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          athleteId: z.string().uuid(),
          coachId: z.string().uuid(),
          sessionId: z.string().uuid().optional().or(z.literal('')),
          evaluationDate: z.string().min(8),
          periodLabel: z.string().min(2),
          scores: z.record(z.string(), z.coerce.number()),
          coachRecommendation: z.string().min(3),
          autoSendParentEmail: z.boolean().optional(),
          recipientEmailOverride: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const created = await createPlayerEvaluationWorkflow(req.currentUser!, {
          ...data,
          sessionId: data.sessionId || undefined,
        });
        res.status(201).json(created);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menyimpan evaluasi atlet.',
        });
      }
    }
  );

  // ==========================================================================
  // MONTHLY ATHLETE REPORT CARD (RAPOR BULANAN ATLET) & AUTO-EMAIL PARENT
  // ==========================================================================
  app.post(
    '/api/reports/monthly-athlete-cards/send-email',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          athleteId: z.string().uuid().optional(),
          athleteIds: z.array(z.string().uuid()).optional(),
          sendAll: z.boolean().optional(),
          branchId: z.string().optional(),
          evaluationId: z.string().uuid().optional(),
          periodLabel: z.string().optional(),
          recipientEmailOverride: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        let targetAthleteIds: string[] = [];
        if (data.athleteId) {
          targetAthleteIds = [data.athleteId];
        } else if (data.athleteIds && data.athleteIds.length > 0) {
          targetAthleteIds = data.athleteIds;
        } else if (data.sendAll) {
          const allAthletes = await db
            .select()
            .from(athletes)
            .where(
              data.branchId && data.branchId !== 'ALL'
                ? and(
                    eq(athletes.organizationId, user.organizationId),
                    eq(athletes.branchId, data.branchId)
                  )
                : eq(athletes.organizationId, user.organizationId)
            );
          targetAthleteIds = allAthletes
            .filter((a) => a.membershipStatus === 'ACTIVE')
            .map((a) => a.id);
        }

        if (targetAthleteIds.length === 0) {
          return res.status(400).json({
            error: 'Tidak ada atlet aktif yang dipilih untuk pengiriman Rapor Bulanan.',
          });
        }

        const results = [];
        for (const athId of targetAthleteIds) {
          const dispatched = await compileAndDispatchMonthlyAthleteReportEmail(user, {
            athleteId: athId,
            evaluationId: targetAthleteIds.length === 1 ? data.evaluationId : undefined,
            periodLabel: data.periodLabel,
            recipientEmailOverride:
              targetAthleteIds.length === 1 ? data.recipientEmailOverride : undefined,
            triggerSource: targetAthleteIds.length > 1 ? 'BULK_MONTHLY_AUTO' : 'MANUAL_SINGLE',
          });
          results.push(dispatched);
        }

        res.status(201).json({
          ok: true,
          dispatchedCount: results.length,
          reports: results,
        });
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal mengompilasi dan mengirim Rapor Bulanan Atlet ke email orang tua.',
        });
      }
    }
  );

  app.post(
    '/api/player-goals',
    requireAuth,
    requirePermission('development', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          athleteId: z.string().uuid(),
          coachId: z.string().uuid().optional().or(z.literal('')),
          title: z.string().min(2),
          category: z.enum(['TECHNICAL', 'PHYSICAL', 'MENTAL']),
          targetMetric: z.string().min(2),
          currentProgress: z.coerce.number().min(0).max(100),
          targetDate: z.string().min(8),
          status: z.enum(['IN_PROGRESS', 'ACHIEVED', 'MISSED']).default('IN_PROGRESS'),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const [goal] = await db
          .insert(playerGoals)
          .values({
            organizationId: user.organizationId,
            athleteId: data.athleteId,
            coachId: data.coachId || null,
            title: data.title,
            category: data.category,
            targetMetric: data.targetMetric,
            currentProgress: data.currentProgress,
            targetDate: data.targetDate,
            status: data.status,
          })
          .returning();
        res.status(201).json(goal);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat target perkembangan atlet.',
        });
      }
    }
  );

  app.patch(
    '/api/player-goals/:id',
    requireAuth,
    requirePermission('development', 'update'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          currentProgress: z.coerce.number().min(0).max(100),
          status: z.enum(['IN_PROGRESS', 'ACHIEVED', 'MISSED']).optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const autoStatus =
          data.status || (data.currentProgress >= 100 ? 'ACHIEVED' : 'IN_PROGRESS');
        const [updated] = await db
          .update(playerGoals)
          .set({
            currentProgress: data.currentProgress,
            status: autoStatus,
          })
          .where(
            and(
              eq(playerGoals.id, req.params.id),
              eq(playerGoals.organizationId, user.organizationId)
            )
          )
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'player_goals',
          entityId: req.params.id,
          afterState: updated,
          req,
        });
        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui progres target atlet.',
        });
      }
    }
  );

  // ==========================================================================
  // COMPETITION, TOURNAMENTS, MATCHES & STATS (DOM-K)
  // ==========================================================================
  app.post(
    '/api/competitions',
    requireAuth,
    requirePermission('competition', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          name: z.string().min(2),
          season: z.string().min(4),
          level: z.enum(['REGIONAL', 'NATIONAL', 'INVITATIONAL', 'INTERNAL']),
          organizer: z.string().min(2),
        });
        const data = schema.parse(req.body);
        const [comp] = await db
          .insert(competitions)
          .values({
            organizationId: req.currentUser!.organizationId,
            ...data,
          })
          .returning();
        res.status(201).json(comp);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat kompetisi.',
        });
      }
    }
  );

  app.post(
    '/api/tournaments',
    requireAuth,
    requirePermission('competition', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          competitionId: z.string().uuid().optional().or(z.literal('')),
          name: z.string().min(2),
          venue: z.string().min(2),
          startDate: z.string().min(8),
          endDate: z.string().min(8),
          registrationFee: z.coerce.number().min(0).default(0),
          budgetAmount: z.coerce.number().min(0).default(0),
          transportPlan: z.string().optional(),
          accommodationPlan: z.string().optional(),
          mealsPlan: z.string().optional(),
          participantsCount: z.coerce.number().min(1).default(12),
          athleteIds: z.array(z.string().uuid()).optional(),
          feeMode: z
            .enum(['PER_ATHLETE_FIXED', 'SPLIT_TOURNAMENT_FEE', 'FULL_TOURNAMENT_FEE'])
            .optional(),
          customFeePerAthlete: z.coerce.number().optional(),
          coachId: z.string().uuid().optional().or(z.literal('')),
        });
        const data = schema.parse(req.body);
        const [tournament] = await db
          .insert(tournaments)
          .values({
            organizationId: req.currentUser!.organizationId,
            branchId: data.branchId,
            competitionId: data.competitionId || null,
            name: data.name,
            venue: data.venue,
            startDate: data.startDate,
            endDate: data.endDate,
            registrationFee: data.registrationFee.toFixed(2),
            budgetAmount: data.budgetAmount.toFixed(2),
            transportPlan: data.transportPlan || null,
            accommodationPlan: data.accommodationPlan || null,
            mealsPlan: data.mealsPlan || null,
            participantsCount: data.participantsCount,
            status: 'UPCOMING',
          })
          .returning();

        let autoBillingResult = null;
        if (data.athleteIds && data.athleteIds.length > 0) {
          autoBillingResult = await registerAthletesToTournamentWorkflow(req.currentUser!, {
            tournamentId: tournament.id,
            athleteIds: data.athleteIds,
            feeMode: data.feeMode,
            customFeePerAthlete: data.customFeePerAthlete,
            coachId: data.coachId || undefined,
          });
        }

        res.status(201).json({
          ...tournament,
          autoBillingResult,
        });
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat turnamen/event.',
        });
      }
    }
  );

  app.post(
    '/api/tournaments/:id/register-athletes',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          athleteIds: z.array(z.string().uuid()).min(1),
          feeMode: z
            .enum(['PER_ATHLETE_FIXED', 'SPLIT_TOURNAMENT_FEE', 'FULL_TOURNAMENT_FEE'])
            .optional(),
          customFeePerAthlete: z.coerce.number().optional(),
          dueDate: z.string().optional(),
          coachId: z.string().uuid().optional().or(z.literal('')),
          notes: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const result = await registerAthletesToTournamentWorkflow(req.currentUser!, {
          tournamentId: req.params.id,
          athleteIds: data.athleteIds,
          feeMode: data.feeMode,
          customFeePerAthlete: data.customFeePerAthlete,
          dueDate: data.dueDate,
          coachId: data.coachId || undefined,
          notes: data.notes,
        });
        res.status(201).json(result);
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal mendaftarkan atlet ke turnamen dan menerbitkan tagihan otomatis.',
        });
      }
    }
  );

  app.post(
    '/api/matches',
    requireAuth,
    requirePermission('competition', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          tournamentId: z.string().uuid(),
          teamId: z.string().uuid(),
          opponentName: z.string().min(2),
          venue: z.string().min(2),
          matchDate: z.string().min(8),
          matchTime: z.string().min(4),
          notes: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const [match] = await db
          .insert(matches)
          .values({
            organizationId: req.currentUser!.organizationId,
            branchId: data.branchId,
            tournamentId: data.tournamentId,
            teamId: data.teamId,
            opponentName: data.opponentName,
            venue: data.venue,
            matchDate: data.matchDate,
            matchTime: data.matchTime,
            notes: data.notes || null,
            status: 'SCHEDULED',
          })
          .returning();
        res.status(201).json(match);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menjadwalkan pertandingan.',
        });
      }
    }
  );

  app.post(
    '/api/matches/:id/rosters',
    requireAuth,
    requirePermission('competition', 'update'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          athleteId: z.string().uuid(),
          jerseyNumber: z.coerce.number().min(0).max(99),
          position: z.string().min(1),
          isStarter: z.boolean().default(false),
        });
        const data = schema.parse(req.body);
        const [roster] = await db
          .insert(matchRosters)
          .values({
            matchId: req.params.id,
            athleteId: data.athleteId,
            jerseyNumber: data.jerseyNumber,
            position: data.position,
            isStarter: data.isStarter,
          })
          .onConflictDoNothing()
          .returning();
        res.status(201).json(roster);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menambahkan pemain ke roster.',
        });
      }
    }
  );

  app.post(
    '/api/matches/:id/complete',
    requireAuth,
    requirePermission('competition', 'process'),
    async (req: AuthRequest, res) => {
      try {
        const updated = await completeMatchAndStatsWorkflow(
          req.currentUser!,
          req.params.id,
          req.body
        );
        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menyimpan hasil pertandingan.',
        });
      }
    }
  );

  app.post(
    '/api/achievements',
    requireAuth,
    requirePermission('competition', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          tournamentId: z.string().uuid().optional().or(z.literal('')),
          teamId: z.string().uuid().optional().or(z.literal('')),
          athleteId: z.string().uuid().optional().or(z.literal('')),
          title: z.string().min(2),
          category: z.enum(['TEAM_CHAMPION', 'MVP', 'TOP_SCORER', 'ALL_STAR', 'MOST_IMPROVED']),
          rankPosition: z.string().min(1),
          awardedDate: z.string().min(8),
          notes: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const [ach] = await db
          .insert(achievements)
          .values({
            organizationId: req.currentUser!.organizationId,
            branchId: data.branchId,
            tournamentId: data.tournamentId || null,
            teamId: data.teamId || null,
            athleteId: data.athleteId || null,
            title: data.title,
            category: data.category,
            rankPosition: data.rankPosition,
            awardedDate: data.awardedDate,
            notes: data.notes || null,
          })
          .returning();
        res.status(201).json(ach);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menyimpan prestasi.',
        });
      }
    }
  );

  // ==========================================================================
  // HR, COACHES, STAFF, CONTRACTS & PAYROLL (DOM-H, DOM-I)
  // ==========================================================================
  app.post(
    '/api/coaches',
    requireAuth,
    requirePermission('hr', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          fullName: z.string().min(2),
          phone: z.string().min(6),
          email: z.string().optional(),
          licenseLevel: z.string().min(2),
          specialization: z.string().min(2),
          isHeadCoach: z.boolean().default(false),
          coachType: z.enum(['FULL_TIME', 'FREELANCE']),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const coachCode = `COA-${Date.now().toString().slice(-5)}`;
        const [coach] = await db
          .insert(coaches)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId,
            coachCode,
            fullName: data.fullName,
            phone: data.phone,
            email: data.email || null,
            licenseLevel: data.licenseLevel,
            specialization: data.specialization,
            isHeadCoach: data.isHeadCoach,
            coachType: data.coachType,
            status: 'ACTIVE',
          })
          .returning();

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'coaches',
          entityId: coach.id,
          afterState: coach,
          req,
        });
        res.status(201).json(coach);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menambahkan pelatih.',
        });
      }
    }
  );

  app.post(
    '/api/staff',
    requireAuth,
    requirePermission('hr', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          fullName: z.string().min(2),
          department: z.enum(['OPERATIONS', 'FINANCE', 'MEDICAL', 'EVENT', 'ADMIN']),
          positionTitle: z.string().min(2),
          phone: z.string().min(6),
          email: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const staffCode = `STF-${Date.now().toString().slice(-5)}`;
        const [member] = await db
          .insert(staff)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId,
            staffCode,
            fullName: data.fullName,
            department: data.department,
            positionTitle: data.positionTitle,
            phone: data.phone,
            email: data.email || null,
            status: 'ACTIVE',
          })
          .returning();
        res.status(201).json(member);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menambahkan staf.',
        });
      }
    }
  );

  app.post(
    '/api/employments',
    requireAuth,
    requirePermission('hr', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          coachId: z.string().uuid().optional().or(z.literal('')),
          staffId: z.string().uuid().optional().or(z.literal('')),
          personnelName: z.string().min(2),
          employmentType: z.enum(['FULL_TIME_COACH', 'FREELANCE_COACH', 'STAFF']),
          contractNumber: z.string().min(3),
          startDate: z.string().min(8),
          endDate: z.string().optional(),
          monthlySalary: z.coerce.number().min(0),
          sessionRate: z.coerce.number().min(0),
          defaultBonus: z.coerce.number().min(0).default(0),
          defaultIncentive: z.coerce.number().min(0).default(0),
          defaultDeduction: z.coerce.number().min(0).default(0),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [employment] = await db
          .insert(employments)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId,
            coachId: data.coachId || null,
            staffId: data.staffId || null,
            personnelName: data.personnelName,
            employmentType: data.employmentType,
            contractNumber: data.contractNumber,
            startDate: data.startDate,
            endDate: data.endDate || null,
            status: 'ACTIVE',
          })
          .returning();

        const [rule] = await db
          .insert(compensationRules)
          .values({
            organizationId: user.organizationId,
            employmentId: employment.id,
            monthlySalary: data.monthlySalary.toFixed(2),
            sessionRate: data.sessionRate.toFixed(2),
            defaultBonus: data.defaultBonus.toFixed(2),
            defaultIncentive: data.defaultIncentive.toFixed(2),
            defaultDeduction: data.defaultDeduction.toFixed(2),
          })
          .returning();

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'employments',
          entityId: employment.id,
          afterState: { employment, rule },
          req,
        });

        res.status(201).json({ employment, rule });
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat kontrak kerja & kompensasi.',
        });
      }
    }
  );

  app.post(
    '/api/payrolls/generate',
    requireAuth,
    requirePermission('payroll', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          periodMonth: z.coerce.number().min(1).max(12),
          periodYear: z.coerce.number().min(2020).max(2050),
        });
        const data = schema.parse(req.body);
        const payroll = await generatePayrollWorkflow(req.currentUser!, data);
        res.status(201).json(payroll);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menghitung payroll.',
        });
      }
    }
  );

  app.post(
    '/api/payrolls/:id/approve',
    requireAuth,
    requirePermission('payroll', 'approve'),
    async (req: AuthRequest, res) => {
      try {
        const approved = await approvePayrollWorkflow(req.currentUser!, req.params.id);
        res.json(approved);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menyetujui payroll.',
        });
      }
    }
  );

  // ==========================================================================
  // FINANCE, BILLING & DOUBLE-ENTRY ACCOUNTING (DOM-J)
  // ==========================================================================
  app.post(
    '/api/membership-plans',
    requireAuth,
    requirePermission('finance', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          code: z.string().min(2),
          name: z.string().min(2),
          billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
          feeAmount: z.coerce.number().min(0),
          registrationFee: z.coerce.number().min(0).default(0),
          sessionsPerWeek: z.coerce.number().min(1).max(14),
        });
        const data = schema.parse(req.body);
        const [plan] = await db
          .insert(membershipPlans)
          .values({
            organizationId: req.currentUser!.organizationId,
            code: data.code.toUpperCase(),
            name: data.name,
            billingCycle: data.billingCycle,
            feeAmount: data.feeAmount.toFixed(2),
            registrationFee: data.registrationFee.toFixed(2),
            sessionsPerWeek: data.sessionsPerWeek,
            isActive: true,
          })
          .returning();
        res.status(201).json(plan);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat paket membership.',
        });
      }
    }
  );

  app.post(
    '/api/invoices',
    requireAuth,
    requirePermission('finance', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          athleteId: z.string().uuid().optional().or(z.literal('')),
          revenueCategory: z.enum([
            'REGISTRATION',
            'MEMBERSHIP',
            'TOURNAMENT',
            'MERCHANDISE',
            'SPONSORSHIP',
            'OTHER_REVENUE',
          ]),
          description: z.string().min(3),
          issueDate: z.string().min(8),
          dueDate: z.string().min(8),
          totalAmount: z.coerce.number().positive(),
          status: z.enum(['DRAFT', 'ISSUED']).default('ISSUED'),
        });
        const data = schema.parse(req.body);
        const invoice = await createInvoiceWorkflow(req.currentUser!, {
          ...data,
          athleteId: data.athleteId || undefined,
        });
        res.status(201).json(invoice);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat invoice.',
        });
      }
    }
  );

  app.post(
    '/api/payments',
    requireAuth,
    requirePermission('finance', 'process'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          invoiceId: z.string().uuid(),
          paymentDate: z.string().min(8),
          amount: z.coerce.number().positive(),
          paymentMethod: z.enum([
            'BANK_TRANSFER',
            'CASH',
            'QRIS',
            'EWALLET',
            'VIRTUAL_ACCOUNT',
          ]),
          referenceNumber: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const payment = await recordPaymentWorkflow(req.currentUser!, data);
        res.status(201).json(payment);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal mencatat pembayaran.',
        });
      }
    }
  );

  app.post(
    '/api/expenses',
    requireAuth,
    requirePermission('finance', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          tournamentId: z.string().uuid().optional().or(z.literal('')),
          category: z.enum([
            'COACH_COMPENSATION',
            'STAFF_SALARY',
            'COURT_RENTAL',
            'EQUIPMENT',
            'TRANSPORTATION',
            'ACCOMMODATION',
            'MEDICAL',
            'EVENT',
            'OPERATIONAL',
          ]),
          vendorName: z.string().min(2),
          description: z.string().min(3),
          expenseDate: z.string().min(8),
          amount: z.coerce.number().positive(),
        });
        const data = schema.parse(req.body);
        const expense = await createExpenseWorkflow(req.currentUser!, {
          ...data,
          tournamentId: data.tournamentId || undefined,
        });
        res.status(201).json(expense);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal mencatat pengeluaran.',
        });
      }
    }
  );

  app.post(
    '/api/accounts',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          code: z.string().min(3),
          name: z.string().min(2),
          accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
          normalBalance: z.enum(['DEBIT', 'CREDIT']).optional(),
        });
        const data = schema.parse(req.body);
        const normalBalance =
          data.normalBalance ||
          (data.accountType === 'ASSET' || data.accountType === 'EXPENSE' ? 'DEBIT' : 'CREDIT');
        const [acc] = await db
          .insert(accounts)
          .values({
            organizationId: req.currentUser!.organizationId,
            code: data.code,
            name: data.name,
            accountType: data.accountType,
            normalBalance,
            isActive: true,
          })
          .returning();
        res.status(201).json(acc);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat akun COA.',
        });
      }
    }
  );

  app.post(
    '/api/journals/manual',
    requireAuth,
    requirePermission('accounting', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          entryDate: z.string().min(8),
          description: z.string().min(3),
          lines: z
            .array(
              z.object({
                accountCode: z.string().min(1),
                debit: z.coerce.number().min(0),
                credit: z.coerce.number().min(0),
                memo: z.string().optional(),
              })
            )
            .min(2),
        });
        const data = schema.parse(req.body);
        const journal = await postDoubleEntryJournal({
          user: req.currentUser!,
          branchId: data.branchId,
          entryDate: data.entryDate,
          sourceType: 'ADJUSTMENT',
          sourceId: req.currentUser!.id,
          description: data.description,
          lines: data.lines,
        });
        res.status(201).json(journal);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memposting jurnal penyesuaian.',
        });
      }
    }
  );

  app.post(
    '/api/journals/:id/reverse',
    requireAuth,
    requirePermission('accounting', 'approve'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          reason: z.string().min(3),
        });
        const data = schema.parse(req.body);
        const reversed = await reversePostedJournal({
          user: req.currentUser!,
          journalId: req.params.id,
          reason: data.reason,
        });
        res.json(reversed);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal melakukan reversal jurnal.',
        });
      }
    }
  );

  // ==========================================================================
  // INVENTORY TRANSACTION LEDGER (DOM-M)
  // ==========================================================================
  app.post(
    '/api/inventory/items',
    requireAuth,
    requirePermission('inventory', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          sku: z.string().min(2),
          name: z.string().min(2),
          category: z.enum(['BALL', 'COURT_GEAR', 'JERSEY', 'MEDICAL_KIT', 'TRAINING_AID']),
          storageLocation: z.string().min(2),
          unit: z.string().default('PCS'),
          minStock: z.coerce.number().min(0).default(5),
          initialPurchaseQty: z.coerce.number().min(0).default(0),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [item] = await db
          .insert(inventoryItems)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId,
            sku: data.sku.toUpperCase(),
            name: data.name,
            category: data.category,
            storageLocation: data.storageLocation,
            conditionStatus: 'GOOD',
            unit: data.unit,
            minStock: data.minStock,
          })
          .returning();

        if (data.initialPurchaseQty > 0) {
          await recordInventoryTransactionWorkflow(user, {
            branchId: data.branchId,
            itemId: item.id,
            transactionType: 'PURCHASE',
            quantity: data.initialPurchaseQty,
            referenceNote: 'Saldo awal pengadaan barang baru',
          });
        }

        res.status(201).json(item);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menambahkan master barang.',
        });
      }
    }
  );

  app.post(
    '/api/inventory/transactions',
    requireAuth,
    requirePermission('inventory', 'process'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          itemId: z.string().uuid(),
          transactionType: z.enum([
            'PURCHASE',
            'ISSUE',
            'RETURN',
            'TRANSFER',
            'MAINTENANCE',
            'DISPOSAL',
          ]),
          quantity: z.coerce.number().positive(),
          targetLocation: z.string().optional(),
          conditionAfter: z.enum(['GOOD', 'MAINTENANCE', 'DAMAGED']).optional(),
          referenceNote: z.string().min(2),
        });
        const data = schema.parse(req.body);
        const tx = await recordInventoryTransactionWorkflow(req.currentUser!, data);
        res.status(201).json(tx);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal mencatat transaksi inventaris.',
        });
      }
    }
  );

  // Coach Equipment Borrowing (Bola, Seragam, Peralatan Latihan) Checkout
  app.post(
    '/api/inventory/loans/checkout',
    requireAuth,
    requirePermission('inventory', 'process'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          coachName: z.string().min(2),
          teamName: z.string().min(1),
          courtLocation: z.string().min(2),
          expectedReturnTime: z.string().default('18:30 WIB'),
          purposeNote: z.string().min(2),
          items: z
            .array(
              z.object({
                itemId: z.string().uuid(),
                quantity: z.coerce.number().positive(),
                conditionOut: z.enum(['GOOD', 'MAINTENANCE', 'DAMAGED']).default('GOOD'),
              })
            )
            .min(1),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const createdTransactions = [];

        for (let i = 0; i < data.items.length; i++) {
          const entry = data.items[i];
          const loanCode = `LN-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}${i + 1}`;
          const structuredRef = `[LOAN#${loanCode} | COACH:${data.coachName} | TEAM:${data.teamName} | DUE:${data.expectedReturnTime} | COND_OUT:${entry.conditionOut} | STATUS:BORROWED] ${data.purposeNote}`;
          const tx = await recordInventoryTransactionWorkflow(user, {
            branchId: data.branchId,
            itemId: entry.itemId,
            transactionType: 'ISSUE',
            quantity: entry.quantity,
            targetLocation: data.courtLocation,
            conditionAfter: entry.conditionOut,
            referenceNote: structuredRef,
          });
          createdTransactions.push(tx);
        }

        res.status(201).json({
          borrowedCount: createdTransactions.length,
          transactions: createdTransactions,
        });
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal mencatat peminjaman peralatan latihan oleh pelatih.',
        });
      }
    }
  );

  // Coach Equipment Return & Post-Session Condition Inspection
  app.post(
    '/api/inventory/loans/:txId/return',
    requireAuth,
    requirePermission('inventory', 'process'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          returnedQty: z.coerce.number().positive(),
          conditionAfter: z.enum(['GOOD', 'MAINTENANCE', 'DAMAGED']),
          storageLocation: z.string().optional(),
          returnNotes: z.string().min(2),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const origRows = await db
          .select()
          .from(inventoryTransactions)
          .where(
            and(
              eq(inventoryTransactions.id, req.params.txId),
              eq(inventoryTransactions.organizationId, user.organizationId)
            )
          );
        const origTx = origRows[0];
        if (!origTx) {
          return res.status(404).json({ error: 'Data peminjaman tidak ditemukan.' });
        }

        const loanCodeMatch = origTx.referenceNote.match(/LOAN#([A-Z0-9-]+)/);
        const loanCode = loanCodeMatch ? loanCodeMatch[1] : origTx.id.slice(0, 8).toUpperCase();
        const coachMatch = origTx.referenceNote.match(/COACH:([^|\]]+)/);
        const coachName = coachMatch ? coachMatch[1].trim() : user.fullName;

        const itemRows = await db
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, origTx.itemId));
        const item = itemRows[0];
        const targetStorage = data.storageLocation || item?.storageLocation || 'Gudang Utama';

        // 1. Record RETURN transaction into ledger
        const returnTx = await recordInventoryTransactionWorkflow(user, {
          branchId: origTx.branchId,
          itemId: origTx.itemId,
          transactionType: 'RETURN',
          quantity: data.returnedQty,
          targetLocation: targetStorage,
          conditionAfter: data.conditionAfter,
          referenceNote: `[RETURN_OF#${loanCode} | COACH:${coachName} | COND_IN:${data.conditionAfter}] ${data.returnNotes}`,
        });

        // 2. Update original loan transaction referenceNote so STATUS:BORROWED becomes STATUS:RETURNED
        let updatedRef = origTx.referenceNote.replace('STATUS:BORROWED', 'STATUS:RETURNED');
        if (!updatedRef.includes('COND_IN:')) {
          updatedRef = updatedRef.replace(
            'STATUS:RETURNED',
            `STATUS:RETURNED | COND_IN:${data.conditionAfter} | RETURN_NOTE:${data.returnNotes.replace(/[|\]]/g, ' ')}`
          );
        }
        await db
          .update(inventoryTransactions)
          .set({ referenceNote: updatedRef })
          .where(eq(inventoryTransactions.id, origTx.id));

        res.json({ returnTx, updatedLoanId: origTx.id });
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal memproses pengembalian barang inventaris.',
        });
      }
    }
  );

  // Direct Asset Condition & Storage Location Inspection Update
  app.patch(
    '/api/inventory/items/:id/condition',
    requireAuth,
    requirePermission('inventory', 'update'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          conditionStatus: z.enum(['GOOD', 'MAINTENANCE', 'DAMAGED']),
          storageLocation: z.string().min(2).optional(),
          minStock: z.coerce.number().min(0).optional(),
          inspectionNote: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const existingRows = await db
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.id, req.params.id),
              eq(inventoryItems.organizationId, user.organizationId)
            )
          );
        const existing = existingRows[0];
        if (!existing) {
          return res.status(404).json({ error: 'Barang inventaris tidak ditemukan.' });
        }

        const [updated] = await db
          .update(inventoryItems)
          .set({
            conditionStatus: data.conditionStatus,
            storageLocation: data.storageLocation || existing.storageLocation,
            minStock: data.minStock !== undefined ? data.minStock : existing.minStock,
          })
          .where(eq(inventoryItems.id, existing.id))
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'inventory_items',
          entityId: existing.id,
          beforeState: existing,
          afterState: { ...updated, inspectionNote: data.inspectionNote },
          req,
        });

        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error ? error.message : 'Gagal memperbarui status kondisi barang.',
        });
      }
    }
  );

  // ==========================================================================
  // MEDICAL & INJURY MANAGEMENT (DOM-L)
  // ==========================================================================
  app.post(
    '/api/medical/records',
    requireAuth,
    requirePermission('medical', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          athleteId: z.string().uuid(),
          bloodType: z.string().min(1),
          allergies: z.string().optional(),
          chronicConditions: z.string().optional(),
          insuranceProvider: z.string().optional(),
          insuranceNumber: z.string().optional(),
          returnToPlayStatus: z.enum(['CLEARED', 'LIMITED_CONTACT', 'REHABILITATION', 'OUT']),
          medicalNotes: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [record] = await db
          .insert(medicalRecords)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId,
            athleteId: data.athleteId,
            bloodType: data.bloodType,
            allergies: data.allergies || null,
            chronicConditions: data.chronicConditions || null,
            insuranceProvider: data.insuranceProvider || null,
            insuranceNumber: data.insuranceNumber || null,
            returnToPlayStatus: data.returnToPlayStatus,
            medicalNotes: data.medicalNotes || null,
            updatedByUserId: user.id,
          })
          .onConflictDoUpdate({
            target: medicalRecords.athleteId,
            set: {
              bloodType: data.bloodType,
              allergies: data.allergies || null,
              chronicConditions: data.chronicConditions || null,
              insuranceProvider: data.insuranceProvider || null,
              insuranceNumber: data.insuranceNumber || null,
              returnToPlayStatus: data.returnToPlayStatus,
              medicalNotes: data.medicalNotes || null,
              updatedByUserId: user.id,
              updatedAt: new Date(),
            },
          })
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'medical_records',
          entityId: record.id,
          afterState: record,
          req,
        });
        res.status(201).json(record);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menyimpan profil medis atlet.',
        });
      }
    }
  );

  app.post(
    '/api/medical/injuries',
    requireAuth,
    requirePermission('medical', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid(),
          athleteId: z.string().uuid(),
          injuryDate: z.string().min(8),
          bodyPart: z.string().min(2),
          diagnosis: z.string().min(3),
          severity: z.enum(['MINOR', 'MODERATE', 'SEVERE']),
          treatmentPlan: z.string().min(3),
          recoveryNote: z.string().optional(),
          returnToPlayStatus: z.enum(['OUT', 'REHABILITATION', 'LIMITED_CONTACT', 'CLEARED']),
          expectedRecoveryDate: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [injury] = await db
          .insert(injuries)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId,
            athleteId: data.athleteId,
            injuryDate: data.injuryDate,
            bodyPart: data.bodyPart,
            diagnosis: data.diagnosis,
            severity: data.severity,
            treatmentPlan: data.treatmentPlan,
            recoveryNote: data.recoveryNote || null,
            returnToPlayStatus: data.returnToPlayStatus,
            expectedRecoveryDate: data.expectedRecoveryDate || null,
            recordedByUserId: user.id,
          })
          .returning();

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'injuries',
          entityId: injury.id,
          afterState: injury,
          req,
        });
        res.status(201).json(injury);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal mencatat laporan cedera.',
        });
      }
    }
  );

  app.patch(
    '/api/medical/injuries/:id/rtp',
    requireAuth,
    requirePermission('medical', 'update'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          returnToPlayStatus: z.enum(['OUT', 'REHABILITATION', 'LIMITED_CONTACT', 'CLEARED']),
          recoveryNote: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const today = new Date().toISOString().slice(0, 10);

        const [updated] = await db
          .update(injuries)
          .set({
            returnToPlayStatus: data.returnToPlayStatus,
            recoveryNote: data.recoveryNote || null,
            clearedDate: data.returnToPlayStatus === 'CLEARED' ? today : null,
          })
          .where(
            and(eq(injuries.id, req.params.id), eq(injuries.organizationId, user.organizationId))
          )
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'injuries',
          entityId: req.params.id,
          afterState: updated,
          req,
        });
        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui status Return-to-Play.',
        });
      }
    }
  );

  // ==========================================================================
  // COMMUNICATION, MEDIA, DOCUMENTS & ADMINISTRATION (DOM-N, O, Q)
  // ==========================================================================
  app.post(
    '/api/announcements',
    requireAuth,
    requirePermission('communication', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid().optional().or(z.literal('')),
          teamId: z.string().uuid().optional().or(z.literal('')),
          ageGroupId: z.string().uuid().optional().or(z.literal('')),
          targetRole: z.string().optional(),
          targetAthleteId: z.string().uuid().optional().or(z.literal('')),
          title: z.string().min(3),
          content: z.string().min(5),
          priority: z.enum(['NORMAL', 'IMPORTANT', 'URGENT']).default('NORMAL'),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [announcement] = await db
          .insert(announcements)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId || null,
            teamId: data.teamId || null,
            ageGroupId: data.ageGroupId || null,
            targetRole: data.targetRole || 'ALL',
            targetAthleteId: data.targetAthleteId || null,
            title: data.title,
            content: data.content,
            priority: data.priority,
            publishedByUserId: user.id,
          })
          .returning();

        const orgUsers = await db
          .select()
          .from(users)
          .where(eq(users.organizationId, user.organizationId));

        const targetRecipients = orgUsers.filter((u) => {
          if (u.id === user.id) return true;
          if (data.targetRole && data.targetRole !== 'ALL' && u.activeRoleCode !== data.targetRole) {
            return false;
          }
          if (data.branchId && u.branchId && u.branchId !== data.branchId) {
            return false;
          }
          return true;
        });

        const recipientIds = Array.from(new Set([user.id, ...targetRecipients.map((u) => u.id)]));

        await db.insert(notifications).values(
          recipientIds.map((uid) => ({
            organizationId: user.organizationId,
            userId: uid,
            announcementId: announcement.id,
            title: `[Pengumuman ${announcement.priority}] ${announcement.title}`,
            message: announcement.content,
            category: 'ANNOUNCEMENT',
          }))
        );

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'announcements',
          entityId: announcement.id,
          afterState: {
            title: announcement.title,
            targetRole: announcement.targetRole,
            priority: announcement.priority,
            digitalRecipientsCount: recipientIds.length,
          },
          req,
        });

        res.status(201).json(announcement);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal mempublikasikan pengumuman.',
        });
      }
    }
  );

  app.patch('/api/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
    try {
      const [updated] = await db
        .update(notifications)
        .set({
          isRead: true,
          readAt: new Date(),
        })
        .where(eq(notifications.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error: unknown) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Gagal memperbarui status baca notifikasi.',
      });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.currentUser!;
      await db
        .update(notifications)
        .set({
          isRead: true,
          readAt: new Date(),
        })
        .where(
          and(
            eq(notifications.organizationId, user.organizationId),
            eq(notifications.isRead, false)
          )
        );
      res.json({ ok: true });
    } catch (error: unknown) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Gagal menandai semua notifikasi.',
      });
    }
  });

  app.post(
    '/api/notifications/send-direct',
    requireAuth,
    requirePermission('communication', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          category: z
            .enum(['BILLING', 'TRAINING', 'MEDICAL', 'EVALUATION', 'ANNOUNCEMENT', 'SYSTEM'])
            .default('SYSTEM'),
          targetRole: z.string().default('ALL'),
          title: z.string().min(3),
          message: z.string().min(5),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const orgUsers = await db
          .select()
          .from(users)
          .where(eq(users.organizationId, user.organizationId));

        const matchedUsers = orgUsers.filter(
          (u) =>
            u.id === user.id ||
            data.targetRole === 'ALL' ||
            u.activeRoleCode === data.targetRole
        );

        const recipientIds = Array.from(new Set([user.id, ...matchedUsers.map((u) => u.id)]));

        const inserted = await db
          .insert(notifications)
          .values(
            recipientIds.map((uid) => ({
              organizationId: user.organizationId,
              userId: uid,
              title: data.title,
              message: data.message,
              category: data.category,
            }))
          )
          .returning();

        await recordAuditLog({
          user,
          action: 'DIGITAL_BROADCAST',
          entity: 'notifications',
          entityId: inserted[0]?.id || 'direct-broadcast',
          afterState: {
            category: data.category,
            targetRole: data.targetRole,
            title: data.title,
            recipientsCount: recipientIds.length,
          },
          req,
        });

        res.status(201).json({
          ok: true,
          dispatchedCount: inserted.length,
          notification: inserted[0],
        });
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal mengirim notifikasi digital.',
        });
      }
    }
  );

  app.post(
    '/api/notifications/auto-dispatch',
    requireAuth,
    requirePermission('communication', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          triggerType: z.enum([
            'BILLING_REMINDER',
            'TRAINING_SCHEDULE',
            'MEDICAL_ALERT',
            'EVALUATION_REPORT',
          ]),
        });
        const { triggerType } = schema.parse(req.body);
        const user = req.currentUser!;

        const generatedPayloads: Array<{
          organizationId: string;
          userId: string;
          title: string;
          message: string;
          category: string;
        }> = [];

        if (triggerType === 'BILLING_REMINDER') {
          const waBillRes = await dispatchInvoiceWhatsAppNotificationWorkflow(user, {
            mode: 'BULK_UNPAID_INVOICES',
          });
          return res.status(201).json({
            ok: true,
            triggerType,
            dispatchedCount: waBillRes.dispatchedCount,
            items: waBillRes.receipts,
          });
        } else if (triggerType === 'TRAINING_SCHEDULE') {
          const waTrainRes = await dispatchDailyTrainingWhatsAppRemindersWorkflow(user, {});
          return res.status(201).json({
            ok: true,
            triggerType,
            dispatchedCount: waTrainRes.dispatchedCount,
            items: waTrainRes.receipts,
          });
        } else if (triggerType === 'MEDICAL_ALERT') {
          const [injRows, athRows] = await Promise.all([
            db.select().from(injuries).where(eq(injuries.organizationId, user.organizationId)),
            db.select().from(athletes).where(eq(athletes.organizationId, user.organizationId)),
          ]);
          const athMap = new Map(athRows.map((a) => [a.id, a]));
          const activeInjuries = injRows.filter((inj) => inj.returnToPlayStatus !== 'CLEARED');

          for (const inj of activeInjuries.slice(0, 6)) {
            const ath = athMap.get(inj.athleteId);
            generatedPayloads.push({
              organizationId: user.organizationId,
              userId: user.id,
              category: 'MEDICAL',
              title: `[Alert Medis Return-to-Play] ${ath?.fullName || 'Atlet'} (${inj.returnToPlayStatus})`,
              message: `Status medis atlet ${ath?.fullName || '-'} (${ath?.memberCode || '-'}): Diagnosis ${inj.diagnosis} pada ${inj.bodyPart} (${inj.severity}). Status Return-to-Play: ${inj.returnToPlayStatus}. Rencana penanganan: ${inj.treatmentPlan}.`,
            });
          }
        } else if (triggerType === 'EVALUATION_REPORT') {
          const [evalRows, athRows] = await Promise.all([
            db
              .select()
              .from(playerEvaluations)
              .where(eq(playerEvaluations.organizationId, user.organizationId)),
            db.select().from(athletes).where(eq(athletes.organizationId, user.organizationId)),
          ]);
          const athMap = new Map(athRows.map((a) => [a.id, a]));

          for (const ev of evalRows.slice(0, 6)) {
            const ath = athMap.get(ev.athleteId);
            generatedPayloads.push({
              organizationId: user.organizationId,
              userId: user.id,
              category: 'EVALUATION',
              title: `[Rapor Evaluasi Digital] ${ath?.fullName || 'Atlet'} — ${ev.periodLabel}`,
              message: `Rapor perkembangan periode ${ev.periodLabel} telah terbit dengan Skor Akhir ${ev.overallScore} (Teknis: ${ev.technicalAvg}, Fisik: ${ev.physicalAvg}, Mental: ${ev.mentalAvg}). Rekomendasi Pelatih: ${ev.coachRecommendation}`,
            });
          }
        }

        if (generatedPayloads.length === 0) {
          generatedPayloads.push({
            organizationId: user.organizationId,
            userId: user.id,
            category: 'SYSTEM',
            title: `[Notifikasi Digital Otomatis] ${triggerType}`,
            message: `Pemindaian otomatis selesai pada ${new Date().toLocaleString('id-ID')}. Seluruh item pada kategori ${triggerType} telah terverifikasi.`,
          });
        }

        const inserted = await db.insert(notifications).values(generatedPayloads).returning();

        await recordAuditLog({
          user,
          action: 'AUTO_DIGITAL_NOTIFICATION',
          entity: 'notifications',
          entityId: triggerType,
          afterState: {
            triggerType,
            dispatchedCount: inserted.length,
          },
          req,
        });

        res.status(201).json({
          ok: true,
          triggerType,
          dispatchedCount: inserted.length,
          items: inserted,
        });
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal menjalankan otomasi notifikasi digital.',
        });
      }
    }
  );

  // ==========================================================================
  // WHATSAPP GATEWAY AUTOMATION ENDPOINTS (DAILY TRAINING & INVOICE PAYMENTS)
  // ==========================================================================
  app.post(
    [
      '/api/whatsapp-gateway/send-daily-training-reminders',
      '/api/whatsapp-gateway/dispatch-daily-training',
    ],
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          sessionDate: z.string().optional(),
          sessionId: z.string().uuid().optional().or(z.literal('')),
          branchId: z.string().uuid().optional().or(z.literal('')),
          customPhoneOverride: z.string().optional(),
        });
        const data = schema.parse(req.body || {});
        const result = await dispatchDailyTrainingWhatsAppRemindersWorkflow(req.currentUser!, {
          sessionDate: data.sessionDate || undefined,
          sessionId: data.sessionId || undefined,
          branchId: data.branchId || undefined,
          customPhoneOverride: data.customPhoneOverride || undefined,
        });
        res.status(201).json(result);
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal mengirim pengingat jadwal latihan harian via WhatsApp Gateway.',
        });
      }
    }
  );

  app.post(
    [
      '/api/whatsapp-gateway/send-invoice-notification',
      '/api/whatsapp-gateway/dispatch-invoice-notification',
    ],
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          invoiceId: z.string().uuid().optional().or(z.literal('')),
          paymentId: z.string().uuid().optional().or(z.literal('')),
          mode: z
            .enum(['PAYMENT_RECEIPT', 'INVOICE_REMINDER', 'BULK_UNPAID_INVOICES'])
            .optional(),
          notificationType: z
            .enum(['PAYMENT_RECEIPT', 'INVOICE_REMINDER', 'BULK_UNPAID_INVOICES'])
            .optional(),
          customPhoneOverride: z.string().optional(),
        });
        const data = schema.parse(req.body || {});
        const resolvedMode = data.mode || data.notificationType || 'INVOICE_REMINDER';
        const result = await dispatchInvoiceWhatsAppNotificationWorkflow(req.currentUser!, {
          invoiceId: data.invoiceId || undefined,
          paymentId: data.paymentId || undefined,
          mode: resolvedMode,
          customPhoneOverride: data.customPhoneOverride || undefined,
        });
        const firstReceipt = result.receipts?.[0];
        res.status(201).json({
          ...result,
          parentName: firstReceipt?.parentName || 'Orang Tua / Wali',
          parentPhone: firstReceipt?.recipientPhone || '',
          receiptNumber: firstReceipt?.receiptNumber || firstReceipt?.invoiceNumber || '',
        });
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal mengirim notifikasi pembayaran/invoice via WhatsApp Gateway.',
        });
      }
    }
  );

  app.post(
    '/api/documents',
    requireAuth,
    requirePermission('documents', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid().optional().or(z.literal('')),
          entityType: z.enum([
            'ATHLETE',
            'COACH',
            'STAFF',
            'INVOICE',
            'RECEIPT',
            'CONTRACT',
            'TOURNAMENT',
          ]),
          entityId: z.string().uuid(),
          documentCategory: z.enum(['DOCUMENT', 'CERTIFICATE', 'CONTRACT', 'INVOICE', 'RECEIPT']),
          title: z.string().min(2),
          fileType: z.enum(['PDF', 'DOCX', 'IMAGE']),
          fileUrl: z.string().min(3),
          visibility: z.enum(['PUBLIC', 'BRANCH', 'ROLE_RESTRICTED', 'PRIVATE']),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [doc] = await db
          .insert(documents)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId || null,
            ownerUserId: user.id,
            entityType: data.entityType,
            entityId: data.entityId,
            documentCategory: data.documentCategory,
            title: data.title,
            fileType: data.fileType,
            fileUrl: data.fileUrl,
            visibility: data.visibility,
          })
          .returning();

        res.status(201).json(doc);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menyimpan metadata dokumen.',
        });
      }
    }
  );

  app.post(
    '/api/media',
    requireAuth,
    requirePermission('documents', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          branchId: z.string().uuid().optional().or(z.literal('')),
          entityType: z.enum(['TRAINING', 'MATCH', 'ATHLETE', 'EVENT']),
          entityId: z.string().uuid(),
          mediaType: z.enum(['PHOTO', 'VIDEO']),
          title: z.string().min(2),
          mediaUrl: z.string().min(3),
          visibility: z.enum(['PUBLIC', 'BRANCH', 'ROLE_RESTRICTED']),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [item] = await db
          .insert(media)
          .values({
            organizationId: user.organizationId,
            branchId: data.branchId || null,
            ownerUserId: user.id,
            entityType: data.entityType,
            entityId: data.entityId,
            mediaType: data.mediaType,
            title: data.title,
            mediaUrl: data.mediaUrl,
            visibility: data.visibility,
          })
          .returning();

        res.status(201).json(item);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menyimpan metadata media.',
        });
      }
    }
  );

  app.post(
    '/api/branches',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          code: z.string().min(2),
          name: z.string().min(3),
          city: z.string().min(2),
          address: z.string().min(5),
          phone: z.string().optional(),
          courtsCount: z.coerce.number().min(1).default(1),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const [branch] = await db
          .insert(branches)
          .values({
            organizationId: user.organizationId,
            code: data.code.toUpperCase(),
            name: data.name,
            city: data.city,
            address: data.address,
            phone: data.phone || null,
            courtsCount: data.courtsCount,
            isActive: true,
          })
          .returning();

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'branches',
          entityId: branch.id,
          afterState: branch,
          req,
        });
        res.status(201).json(branch);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menambahkan cabang baru.',
        });
      }
    }
  );

  app.get(
    '/api/audit-logs',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const user = req.currentUser!;
        const actor = typeof req.query.actor === 'string' ? req.query.actor.trim() : '';
        const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
        const entity = typeof req.query.entity === 'string' ? req.query.entity.trim() : '';
        const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
        const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const limit = Math.min(Number(req.query.limit) || 250, 500);

        const conditions = [eq(auditLogs.organizationId, user.organizationId)];

        if (actor && actor !== 'ALL') {
          conditions.push(
            or(
              ilike(auditLogs.actorName, `%${actor}%`),
              ilike(auditLogs.actorRole, `%${actor}%`)
            )!
          );
        }

        if (action && action !== 'ALL') {
          conditions.push(eq(auditLogs.action, action));
        }

        if (entity && entity !== 'ALL') {
          conditions.push(eq(auditLogs.entity, entity));
        }

        if (startDate) {
          const fromDate = new Date(`${startDate}T00:00:00.000Z`);
          if (!Number.isNaN(fromDate.getTime())) {
            conditions.push(gte(auditLogs.createdAt, fromDate));
          }
        }

        if (endDate) {
          const toDate = new Date(`${endDate}T23:59:59.999Z`);
          if (!Number.isNaN(toDate.getTime())) {
            conditions.push(lte(auditLogs.createdAt, toDate));
          }
        }

        if (search) {
          conditions.push(
            or(
              ilike(auditLogs.actorName, `%${search}%`),
              ilike(auditLogs.actorRole, `%${search}%`),
              ilike(auditLogs.action, `%${search}%`),
              ilike(auditLogs.entity, `%${search}%`),
              ilike(auditLogs.entityId, `%${search}%`)
            )!
          );
        }

        const rows = await db
          .select()
          .from(auditLogs)
          .where(and(...conditions))
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit);

        const allOrgLogs = await db
          .select({
            actorName: auditLogs.actorName,
            actorRole: auditLogs.actorRole,
            action: auditLogs.action,
            entity: auditLogs.entity,
          })
          .from(auditLogs)
          .where(eq(auditLogs.organizationId, user.organizationId))
          .limit(500);

        const distinctActors = Array.from(
          new Set(allOrgLogs.map((l) => l.actorName).filter(Boolean))
        ).sort();
        const distinctRoles = Array.from(
          new Set(allOrgLogs.map((l) => l.actorRole).filter(Boolean))
        ).sort();
        const distinctActions = Array.from(
          new Set(allOrgLogs.map((l) => l.action).filter(Boolean))
        ).sort();
        const distinctEntities = Array.from(
          new Set(allOrgLogs.map((l) => l.entity).filter(Boolean))
        ).sort();

        // Reconstruct SQL statement representation for each audit event
        const synthesizeSqlForAuditRow = (r: typeof rows[number]) => {
          const act = (r.action || '').toUpperCase();
          const tbl = r.entity || 'audit_logs';
          const afterObj =
            r.afterState && typeof r.afterState === 'object'
              ? (r.afterState as Record<string, unknown>)
              : {};
          const cols = Object.keys(afterObj).slice(0, 6);
          if (act.includes('CREATE') || act.includes('POST') || act.includes('CHECKOUT') || act.includes('DISPATCH') || act.includes('AUTOMATION')) {
            const colList = cols.length > 0 ? cols.map((c) => `"${c}"`).join(', ') : '"id", "organization_id", "created_at"';
            const valList = cols.length > 0
              ? cols.map((c) => `'${String(afterObj[c] ?? '').slice(0, 28)}'`).join(', ')
              : `'${r.entityId}', '${user.organizationId}', NOW()`;
            return `INSERT INTO "public"."${tbl}" (${colList}) VALUES (${valList}) RETURNING *;`;
          }
          if (act.includes('DELETE') || act.includes('REVERSAL')) {
            return `UPDATE "public"."${tbl}" SET "status" = 'REVERSED', "updated_at" = NOW() WHERE "id" = '${r.entityId}';`;
          }
          const setClauses =
            cols.length > 0
              ? cols.map((c) => `"${c}" = '${String(afterObj[c] ?? '').slice(0, 30)}'`).join(', ')
              : `"updated_at" = NOW()`;
          return `UPDATE "public"."${tbl}" SET ${setClauses} WHERE "id" = '${r.entityId}' RETURNING *;`;
        };

        // Fetch PostgreSQL table activity telemetry from pg_stat_user_tables
        let tableStats: Array<{
          tableName: string;
          seqScan: number;
          idxScan: number;
          inserts: number;
          updates: number;
          deletes: number;
          liveRows: number;
        }> = [];
        try {
          const statRes = await pool.query(
            `SELECT relname AS table_name,
                    COALESCE(seq_scan, 0)::int AS seq_scan,
                    COALESCE(idx_scan, 0)::int AS idx_scan,
                    COALESCE(n_tup_ins, 0)::int AS inserts,
                    COALESCE(n_tup_upd, 0)::int AS updates,
                    COALESCE(n_tup_del, 0)::int AS deletes,
                    COALESCE(n_live_tup, 0)::int AS live_rows
             FROM pg_stat_user_tables
             ORDER BY (COALESCE(n_tup_ins, 0) + COALESCE(n_tup_upd, 0) + COALESCE(n_tup_del, 0) + COALESCE(seq_scan, 0)) DESC
             LIMIT 18;`
          );
          tableStats = statRes.rows.map((sr: Record<string, unknown>) => ({
            tableName: String(sr.table_name || ''),
            seqScan: Number(sr.seq_scan || 0),
            idxScan: Number(sr.idx_scan || 0),
            inserts: Number(sr.inserts || 0),
            updates: Number(sr.updates || 0),
            deletes: Number(sr.deletes || 0),
            liveRows: Number(sr.live_rows || 0),
          }));
        } catch {
          // fallback if pg_stat_user_tables is unavailable
        }

        const capturedQueries = getRecentDatabaseQueries();
        const synthesizedDmlQueries = rows.slice(0, 25).map((r) => ({
          id: `dml-${r.id}`,
          operation: (
            r.action.includes('CREATE') ||
            r.action.includes('POST') ||
            r.action.includes('DISPATCH') ||
            r.action.includes('CHECKOUT') ||
            r.action.includes('AUTOMATION')
              ? 'INSERT'
              : r.action.includes('DELETE')
              ? 'DELETE'
              : 'UPDATE'
          ) as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL',
          targetTable: r.entity,
          sqlStatement: synthesizeSqlForAuditRow(r),
          paramsPreview: JSON.stringify([r.entityId, r.actorName, r.actorRole]),
          executedAt: r.createdAt.toISOString(),
          source: `ADMIN_TX (${r.actorRole})`,
        }));

        const recentQueries = [...synthesizedDmlQueries, ...capturedQueries]
          .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
          .slice(0, 100);

        res.json({
          logs: rows.map((r) => ({
            id: r.id,
            actorUserId: r.actorUserId,
            actorName: r.actorName,
            actorRole: r.actorRole,
            action: r.action,
            entity: r.entity,
            entityId: r.entityId,
            beforeState: r.beforeState,
            afterState: r.afterState,
            ipDevice: r.ipDevice,
            sqlQuery: synthesizeSqlForAuditRow(r),
            createdAt: r.createdAt.toISOString(),
          })),
          recentQueries,
          tableStats,
          meta: {
            total: rows.length,
            distinctActors,
            distinctRoles,
            distinctActions,
            distinctEntities,
          },
        });
      } catch (error: unknown) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Gagal memuat data audit_logs.',
        });
      }
    }
  );

  app.post(
    '/api/audit-logs/record-event',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          action: z.string().min(2).default('ADMIN_SYSTEM_CHECKPOINT'),
          entity: z.string().min(2).default('system_diagnostics'),
          entityId: z.string().optional(),
          note: z.string().optional(),
        });
        const data = schema.parse(req.body || {});
        const user = req.currentUser!;
        const targetId = data.entityId || `CHK-${Date.now().toString().slice(-6)}`;

        recordCapturedDatabaseQuery(
          `INSERT INTO "public"."audit_logs" ("organization_id", "actor_name", "actor_role", "action", "entity", "entity_id") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;`,
          [user.organizationId, user.fullName, user.activeRoleCode, data.action, data.entity, targetId],
          `MANUAL_AUDIT_CHECKPOINT (${user.activeRoleCode})`
        );

        await recordAuditLog({
          user,
          action: data.action.toUpperCase(),
          entity: data.entity,
          entityId: targetId,
          beforeState: { checkpointStatus: 'PENDING_VERIFICATION' },
          afterState: {
            checkpointStatus: 'VERIFIED_OK',
            note:
              data.note ||
              'Inspeksi diagnostik database & verifikasi jejak tindakan administratif sistem.',
            verifiedBy: user.fullName,
            role: user.activeRoleCode,
            timestamp: new Date().toISOString(),
          },
          req,
        });

        res.status(201).json({ ok: true, entityId: targetId });
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal mencatat event audit sistem.',
        });
      }
    }
  );

  app.post(
    '/api/users',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          fullName: z.string().min(2),
          email: z.string().email(),
          phone: z.string().optional(),
          activeRoleCode: z.string().min(2),
          branchId: z.string().uuid().nullable().optional().or(z.literal('')).or(z.literal('ALL')),
          jobTitle: z.string().optional(),
          jobFunction: z.string().optional(),
          department: z.string().optional(),
          defaultLandingModule: z.string().optional(),
          allowedModulesJson: z.array(z.string()).optional(),
          avatarUrl: z.string().optional(),
        });
        const data = schema.parse(req.body);
        const actor = req.currentUser!;

        // Look up role defaults from job_role_configs if not explicitly provided
        const [roleCfg] = await db
          .select()
          .from(jobRoleConfigs)
          .where(
            and(
              eq(jobRoleConfigs.organizationId, actor.organizationId),
              eq(jobRoleConfigs.roleCode, data.activeRoleCode)
            )
          );

        const resolvedBranchId =
          !data.branchId || data.branchId === 'ALL' ? null : data.branchId;
        const resolvedJobTitle = data.jobTitle || roleCfg?.jobTitleDefault || data.activeRoleCode;
        const resolvedJobFunction =
          data.jobFunction || roleCfg?.workFunctionSummary || 'Operasional Akademi';
        const resolvedDepartment = data.department || roleCfg?.department || 'OPERASIONAL';
        const resolvedLanding =
          data.defaultLandingModule || roleCfg?.defaultLandingNav || 'dashboard';
        const resolvedAllowedModules =
          data.allowedModulesJson ||
          roleCfg?.allowedNavModules || [
            'dashboard',
            'athletes',
            'training',
            'competition',
            'hr_inventory',
            'finance',
            'comm_admin',
          ];

        const [newUser] = await db
          .insert(users)
          .values({
            organizationId: actor.organizationId,
            branchId: resolvedBranchId,
            uid: `usr-${Date.now()}`,
            email: data.email.toLowerCase().trim(),
            fullName: data.fullName,
            phone: data.phone || null,
            activeRoleCode: data.activeRoleCode,
            jobTitle: resolvedJobTitle,
            jobFunction: resolvedJobFunction,
            department: resolvedDepartment,
            defaultLandingModule: resolvedLanding,
            allowedModulesJson: resolvedAllowedModules,
            avatarUrl: data.avatarUrl || null,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: users.email,
            set: {
              fullName: data.fullName,
              phone: data.phone || null,
              activeRoleCode: data.activeRoleCode,
              branchId: resolvedBranchId,
              jobTitle: resolvedJobTitle,
              jobFunction: resolvedJobFunction,
              department: resolvedDepartment,
              defaultLandingModule: resolvedLanding,
              allowedModulesJson: resolvedAllowedModules,
              ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
              isActive: true,
              updatedAt: new Date(),
            },
          })
          .returning();

        await recordAuditLog({
          user: actor,
          action: 'CREATE',
          entity: 'users',
          entityId: newUser.id,
          afterState: newUser,
          req,
        });
        res.status(201).json(newUser);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat akun pengguna baru.',
        });
      }
    }
  );

  app.patch(
    '/api/users/:id/role',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          activeRoleCode: z.string().min(2),
          branchId: z.string().nullable().optional(),
          jobTitle: z.string().optional(),
          jobFunction: z.string().optional(),
          department: z.string().optional(),
          defaultLandingModule: z.string().optional(),
          allowedModulesJson: z.array(z.string()).optional(),
          isActive: z.boolean().optional(),
        });
        const data = schema.parse(req.body);
        const actor = req.currentUser!;

        const [existing] = await db
          .select()
          .from(users)
          .where(
            and(eq(users.id, req.params.id), eq(users.organizationId, actor.organizationId))
          );

        if (!existing) {
          return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
        }

        // If role changed and jobTitle/landing not explicitly sent, sync from job_role_configs
        const [roleCfg] = await db
          .select()
          .from(jobRoleConfigs)
          .where(
            and(
              eq(jobRoleConfigs.organizationId, actor.organizationId),
              eq(jobRoleConfigs.roleCode, data.activeRoleCode)
            )
          );

        const roleChanged = existing.activeRoleCode !== data.activeRoleCode;

        const [updated] = await db
          .update(users)
          .set({
            activeRoleCode: data.activeRoleCode,
            ...(data.branchId !== undefined
              ? { branchId: data.branchId === 'ALL' || data.branchId === '' ? null : data.branchId }
              : {}),
            jobTitle:
              data.jobTitle ??
              (roleChanged && roleCfg ? roleCfg.jobTitleDefault : existing.jobTitle),
            jobFunction:
              data.jobFunction ??
              (roleChanged && roleCfg ? roleCfg.workFunctionSummary : existing.jobFunction),
            department:
              data.department ?? (roleChanged && roleCfg ? roleCfg.department : existing.department),
            defaultLandingModule:
              data.defaultLandingModule ??
              (roleChanged && roleCfg ? roleCfg.defaultLandingNav : existing.defaultLandingModule),
            allowedModulesJson:
              data.allowedModulesJson ??
              (roleChanged && roleCfg ? roleCfg.allowedNavModules : existing.allowedModulesJson),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, req.params.id))
          .returning();

        await recordAuditLog({
          user: actor,
          action: 'PERMISSION_CHANGE',
          entity: 'users',
          entityId: updated.id,
          beforeState: {
            activeRoleCode: existing.activeRoleCode,
            branchId: existing.branchId,
            isActive: existing.isActive,
          },
          afterState: {
            activeRoleCode: updated.activeRoleCode,
            branchId: updated.branchId,
            isActive: updated.isActive,
          },
          req,
        });

        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui role pengguna.',
        });
      }
    }
  );

  app.get(
    '/api/system/consistency-check',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const user = req.currentUser!;

        // 1. Check Double-Entry Journal Equilibrium (SUM(debit) == SUM(credit))
        const journalCheck = await pool.query(
          `SELECT j.id, j.journal_number, j.total_debit, j.total_credit,
                  COALESCE(SUM(je.debit), 0) AS lines_debit,
                  COALESCE(SUM(je.credit), 0) AS lines_credit
           FROM journals j
           LEFT JOIN journal_entries je ON je.journal_id = j.id
           WHERE j.organization_id = $1
           GROUP BY j.id, j.journal_number, j.total_debit, j.total_credit`,
          [user.organizationId]
        );

        const unbalancedJournals = journalCheck.rows.filter(
          (r) =>
            Math.abs(Number(r.total_debit) - Number(r.total_credit)) > 0.001 ||
            Math.abs(Number(r.lines_debit) - Number(r.lines_credit)) > 0.001
        );

        // 2. Check Attendance Uniqueness (zero duplicate (session_id, athlete_id))
        const dupAttendanceCheck = await pool.query(
          `SELECT session_id, athlete_id, COUNT(*) AS cnt
           FROM attendances
           WHERE organization_id = $1
           GROUP BY session_id, athlete_id
           HAVING COUNT(*) > 1`,
          [user.organizationId]
        );

        // 3. Check Inventory Non-Negative Stock Ledger
        const negInventoryCheck = await pool.query(
          `SELECT i.id, i.sku, i.name, COALESCE(SUM(tx.quantity_delta), 0) AS net_stock
           FROM inventory_items i
           LEFT JOIN inventory_transactions tx ON tx.item_id = i.id
           WHERE i.organization_id = $1
           GROUP BY i.id, i.sku, i.name
           HAVING COALESCE(SUM(tx.quantity_delta), 0) < 0`,
          [user.organizationId]
        );

        // 4. Check Invoice vs Payment Overpayment Integrity
        const invoiceOverpayCheck = await pool.query(
          `SELECT id, invoice_number, total_amount, paid_amount
           FROM invoices
           WHERE organization_id = $1 AND paid_amount > total_amount`,
          [user.organizationId]
        );

        const checks = [
          {
            code: 'DOUBLE_ENTRY_EQUILIBRIUM',
            name: 'Keseimbangan Jurnal Akuntansi Double-Entry (Debit = Kredit)',
            passed: unbalancedJournals.length === 0,
            detail: `${journalCheck.rows.length} jurnal terverifikasi, ${unbalancedJournals.length} tidak seimbang`,
          },
          {
            code: 'ATTENDANCE_ANTI_DUPLICATION',
            name: 'Anti-Duplikasi Presensi Sesi Latihan UNIQUE(session_id, athlete_id)',
            passed: dupAttendanceCheck.rows.length === 0,
            detail: `0 duplikasi ditemukan pada tabel attendances`,
          },
          {
            code: 'INVENTORY_NON_NEGATIVE_LEDGER',
            name: 'Validasi Saldo Non-Negatif Ledger Transaksi Inventaris',
            passed: negInventoryCheck.rows.length === 0,
            detail: `Seluruh SKU memiliki saldo ledger >= 0`,
          },
          {
            code: 'INVOICE_PAYMENT_RECONCILIATION',
            name: 'Rekonsiliasi Piutang Invoice vs Pembayaran (paid_amount <= total_amount)',
            passed: invoiceOverpayCheck.rows.length === 0,
            detail: `0 kelebihan bayar (overpayment) ditemukan`,
          },
        ];

        res.json({
          healthy: checks.every((c) => c.passed),
          checkedAt: new Date().toISOString(),
          checks,
        });
      } catch (error: unknown) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Gagal menjalankan consistency check.',
        });
      }
    }
  );

  app.post(
    '/api/system/execute-schema',
    requireAuth,
    requirePermission('administration', 'update'),
    async (req: AuthRequest, res) => {
      try {
        const schemaSql =
          typeof req.body?.schemaSql === 'string' ? req.body.schemaSql.trim() : undefined;
        const result = await executeSchemaSql(schemaSql);
        await recordAuditLog({
          user: req.currentUser!,
          action: 'SCHEMA_VERIFICATION',
          entity: 'cloudsql_extensions',
          entityId: 'uuid-ossp,pgcrypto',
          afterState: result,
          req,
        });
        res.json(result);
      } catch (error: unknown) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Gagal mengeksekusi verifikasi skema SQL.',
        });
      }
    }
  );

  app.post('/api/audit/export', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { reportName } = req.body;
      await recordAuditLog({
        user: req.currentUser!,
        action: 'DATA_EXPORT',
        entity: 'reports',
        entityId: reportName || 'csv_export',
        afterState: { exportedAt: new Date().toISOString() },
        req,
      });
      res.json({ ok: true });
    } catch {
      res.status(400).json({ error: 'Gagal mencatat log ekspor.' });
    }
  });

  // ==========================================================================
  // APPLICATION SETTINGS & SYSTEM CONFIGURATION ENDPOINTS
  // ==========================================================================
  app.patch(
    '/api/settings/organization',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          code: z.string().min(2).max(30).optional(),
          name: z.string().min(2).max(150),
          legalName: z.string().max(200).optional(),
          fiscalYearStartMonth: z.coerce.number().min(1).max(12),
          settingsJson: z.record(z.string(), z.unknown()).optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [before] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, user.organizationId));

        const currentSettings = (before?.settingsJson || {}) as Record<string, unknown>;
        const nextSettings =
          data.settingsJson !== undefined
            ? { ...currentSettings, ...data.settingsJson }
            : currentSettings;

        const [updated] = await db
          .update(organizations)
          .set({
            ...(data.code ? { code: data.code.toUpperCase().trim() } : {}),
            name: data.name.trim(),
            legalName: data.legalName ? data.legalName.trim() : before?.legalName ?? null,
            fiscalYearStartMonth: data.fiscalYearStartMonth,
            settingsJson: nextSettings,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, user.organizationId))
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'organizations',
          entityId: user.organizationId,
          beforeState: before,
          afterState: updated,
          req,
        });

        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui pengaturan organisasi.',
        });
      }
    }
  );

  app.patch(
    '/api/settings/payment-and-notifications',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const user = req.currentUser!;

        const [before] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, user.organizationId));

        const currentSettings = (before?.settingsJson || {}) as Record<string, unknown>;
        const mergedSettings = {
          ...currentSettings,
          ...(req.body?.paymentMethods ? { paymentMethods: req.body.paymentMethods } : {}),
          ...(req.body?.notificationChannels
            ? { notificationChannels: req.body.notificationChannels }
            : {}),
          ...(req.body?.registrationAndWorkspace
            ? { registrationAndWorkspace: req.body.registrationAndWorkspace }
            : {}),
          ...(req.body?.masterOperationalConfig
            ? { masterOperationalConfig: req.body.masterOperationalConfig }
            : {}),
        };

        const [updated] = await db
          .update(organizations)
          .set({
            settingsJson: mergedSettings,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, user.organizationId))
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'organization_settings_payment_notif',
          entityId: user.organizationId,
          beforeState: before?.settingsJson || null,
          afterState: mergedSettings,
          req,
        });

        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal menyimpan pengaturan metode pembayaran & notifikasi WA/Email.',
        });
      }
    }
  );

  app.put(
    '/api/settings/job-role-configs/:roleCode',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          roleName: z.string().min(2),
          jobTitleDefault: z.string().min(2),
          department: z.string().min(2),
          workFunctionSummary: z.string().min(4),
          defaultLandingNav: z.string().min(2),
          allowedNavModules: z.array(z.string()).min(1),
          primaryActionsJson: z.array(z.string()).optional(),
          canAccessAllBranches: z.boolean().default(false),
          syncUsersOfRole: z.boolean().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;
        const roleCode = req.params.roleCode;

        const [upserted] = await db
          .insert(jobRoleConfigs)
          .values({
            organizationId: user.organizationId,
            roleCode,
            roleName: data.roleName,
            jobTitleDefault: data.jobTitleDefault,
            department: data.department,
            workFunctionSummary: data.workFunctionSummary,
            defaultLandingNav: data.defaultLandingNav,
            allowedNavModules: data.allowedNavModules,
            primaryActionsJson: data.primaryActionsJson || [
              'Buka Modul Utama',
              'Proses Tugas Harian',
            ],
            canAccessAllBranches: data.canAccessAllBranches,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [jobRoleConfigs.organizationId, jobRoleConfigs.roleCode],
            set: {
              roleName: data.roleName,
              jobTitleDefault: data.jobTitleDefault,
              department: data.department,
              workFunctionSummary: data.workFunctionSummary,
              defaultLandingNav: data.defaultLandingNav,
              allowedNavModules: data.allowedNavModules,
              ...(data.primaryActionsJson ? { primaryActionsJson: data.primaryActionsJson } : {}),
              canAccessAllBranches: data.canAccessAllBranches,
              updatedAt: new Date(),
            },
          })
          .returning();

        if (data.syncUsersOfRole !== false) {
          await db
            .update(users)
            .set({
              jobTitle: data.jobTitleDefault,
              jobFunction: data.workFunctionSummary,
              department: data.department,
              defaultLandingModule: data.defaultLandingNav,
              allowedModulesJson: data.allowedNavModules,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(users.organizationId, user.organizationId),
                eq(users.activeRoleCode, roleCode)
              )
            );
        }

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'job_role_configs',
          entityId: upserted.id,
          afterState: upserted,
          req,
        });

        res.json(upserted);
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal menyimpan konfigurasi kerja & fungsi role.',
        });
      }
    }
  );

  app.post(
    '/api/notifications/dispatch-wa-email',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          channel: z.enum(['WHATSAPP', 'EMAIL', 'BOTH']).default('BOTH'),
          recipientPhone: z.string().optional(),
          recipientEmail: z.string().optional(),
          title: z.string().min(2),
          message: z.string().min(3),
          category: z
            .enum(['BILLING', 'TRAINING', 'MEDICAL', 'EVALUATION', 'ANNOUNCEMENT', 'SYSTEM'])
            .default('BILLING'),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const channelTag =
          data.channel === 'BOTH'
            ? `WA (${data.recipientPhone || 'Registered'}) + EMAIL (${data.recipientEmail || 'Registered'})`
            : data.channel === 'WHATSAPP'
            ? `WA (${data.recipientPhone || 'Registered'})`
            : `EMAIL (${data.recipientEmail || 'Registered'})`;

        const [createdNotif] = await db
          .insert(notifications)
          .values({
            organizationId: user.organizationId,
            userId: user.id,
            title: `[${channelTag}] ${data.title}`,
            message: data.message,
            category: data.category,
          })
          .returning();

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'wa_email_notification_dispatch',
          entityId: createdNotif.id,
          afterState: {
            channel: data.channel,
            recipientPhone: data.recipientPhone,
            recipientEmail: data.recipientEmail,
            title: data.title,
          },
          req,
        });

        res.status(201).json({
          ok: true,
          notification: createdNotif,
        });
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal mencatat pengiriman notifikasi WhatsApp & Email.',
        });
      }
    }
  );

  app.patch(
    '/api/branches/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          name: z.string().min(2).optional(),
          city: z.string().min(2).optional(),
          address: z.string().min(4).optional(),
          phone: z.string().nullable().optional(),
          courtsCount: z.coerce.number().min(1).max(30).optional(),
          isActive: z.boolean().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [before] = await db
          .select()
          .from(branches)
          .where(and(eq(branches.id, req.params.id), eq(branches.organizationId, user.organizationId)));

        if (!before) {
          return res.status(404).json({ error: 'Cabang tidak ditemukan.' });
        }

        const [updated] = await db
          .update(branches)
          .set({
            name: data.name ?? before.name,
            city: data.city ?? before.city,
            address: data.address ?? before.address,
            phone: data.phone !== undefined ? data.phone : before.phone,
            courtsCount: data.courtsCount ?? before.courtsCount,
            isActive: data.isActive !== undefined ? data.isActive : before.isActive,
            updatedAt: new Date(),
          })
          .where(eq(branches.id, req.params.id))
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'branches',
          entityId: updated.id,
          beforeState: before,
          afterState: updated,
          req,
        });

        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui pengaturan cabang.',
        });
      }
    }
  );

  app.post(
    '/api/settings/membership-plans',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          code: z.string().min(2).max(30),
          name: z.string().min(2).max(120),
          billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
          feeAmount: z.coerce.number().min(0),
          registrationFee: z.coerce.number().min(0),
          sessionsPerWeek: z.coerce.number().min(1).max(14),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [created] = await db
          .insert(membershipPlans)
          .values({
            organizationId: user.organizationId,
            code: data.code.toUpperCase().trim(),
            name: data.name.trim(),
            billingCycle: data.billingCycle,
            feeAmount: data.feeAmount.toFixed(2),
            registrationFee: data.registrationFee.toFixed(2),
            sessionsPerWeek: data.sessionsPerWeek,
            isActive: true,
          })
          .returning();

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'membership_plans',
          entityId: created.id,
          afterState: created,
          req,
        });

        res.status(201).json(created);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal membuat paket membership baru.',
        });
      }
    }
  );

  app.patch(
    '/api/settings/membership-plans/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          name: z.string().min(2).max(120).optional(),
          billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).optional(),
          feeAmount: z.coerce.number().min(0).optional(),
          registrationFee: z.coerce.number().min(0).optional(),
          sessionsPerWeek: z.coerce.number().min(1).max(14).optional(),
          isActive: z.boolean().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [before] = await db
          .select()
          .from(membershipPlans)
          .where(
            and(
              eq(membershipPlans.id, req.params.id),
              eq(membershipPlans.organizationId, user.organizationId)
            )
          );

        if (!before) {
          return res.status(404).json({ error: 'Paket membership tidak ditemukan.' });
        }

        const [updated] = await db
          .update(membershipPlans)
          .set({
            name: data.name ?? before.name,
            billingCycle: data.billingCycle ?? before.billingCycle,
            feeAmount:
              data.feeAmount !== undefined ? data.feeAmount.toFixed(2) : before.feeAmount,
            registrationFee:
              data.registrationFee !== undefined
                ? data.registrationFee.toFixed(2)
                : before.registrationFee,
            sessionsPerWeek: data.sessionsPerWeek ?? before.sessionsPerWeek,
            isActive: data.isActive !== undefined ? data.isActive : before.isActive,
          })
          .where(eq(membershipPlans.id, req.params.id))
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'membership_plans',
          entityId: updated.id,
          beforeState: before,
          afterState: updated,
          req,
        });

        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui paket membership.',
        });
      }
    }
  );

  app.patch(
    '/api/age-groups/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          name: z.string().min(2).optional(),
          minAge: z.coerce.number().min(4).max(30).optional(),
          maxAge: z.coerce.number().min(4).max(35).optional(),
          description: z.string().nullable().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [before] = await db
          .select()
          .from(ageGroups)
          .where(
            and(eq(ageGroups.id, req.params.id), eq(ageGroups.organizationId, user.organizationId))
          );

        if (!before) {
          return res.status(404).json({ error: 'Kelompok umur tidak ditemukan.' });
        }

        const [updated] = await db
          .update(ageGroups)
          .set({
            name: data.name ?? before.name,
            minAge: data.minAge ?? before.minAge,
            maxAge: data.maxAge ?? before.maxAge,
            description: data.description !== undefined ? data.description : before.description,
          })
          .where(eq(ageGroups.id, req.params.id))
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'age_groups',
          entityId: updated.id,
          beforeState: before,
          afterState: updated,
          req,
        });

        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui kelompok umur.',
        });
      }
    }
  );

  app.patch(
    '/api/assessment-criteria/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          name: z.string().min(2).optional(),
          weight: z.coerce.number().min(0.1).max(10).optional(),
          minScore: z.coerce.number().min(0).max(10).optional(),
          maxScore: z.coerce.number().min(1).max(100).optional(),
          isActive: z.boolean().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [before] = await db
          .select()
          .from(assessmentCriteria)
          .where(
            and(
              eq(assessmentCriteria.id, req.params.id),
              eq(assessmentCriteria.organizationId, user.organizationId)
            )
          );

        if (!before) {
          return res.status(404).json({ error: 'Kriteria evaluasi tidak ditemukan.' });
        }

        const [updated] = await db
          .update(assessmentCriteria)
          .set({
            name: data.name ?? before.name,
            weight: data.weight !== undefined ? data.weight.toFixed(2) : before.weight,
            minScore: data.minScore ?? before.minScore,
            maxScore: data.maxScore ?? before.maxScore,
            isActive: data.isActive !== undefined ? data.isActive : before.isActive,
          })
          .where(eq(assessmentCriteria.id, req.params.id))
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'assessment_criteria',
          entityId: updated.id,
          beforeState: before,
          afterState: updated,
          req,
        });

        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui kriteria evaluasi.',
        });
      }
    }
  );

  app.post(
    '/api/accounts',
    requireAuth,
    requirePermission('accounting', 'create'),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          code: z.string().min(3).max(30),
          name: z.string().min(3).max(150),
          accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
          normalBalance: z.enum(['DEBIT', 'CREDIT']),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [created] = await db
          .insert(accounts)
          .values({
            organizationId: user.organizationId,
            code: data.code.trim(),
            name: data.name.trim(),
            accountType: data.accountType,
            normalBalance: data.normalBalance,
            isActive: true,
          })
          .returning();

        await recordAuditLog({
          user,
          action: 'CREATE',
          entity: 'accounts',
          entityId: created.id,
          afterState: created,
          req,
        });

        res.status(201).json(created);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal menambahkan akun COA baru.',
        });
      }
    }
  );

  app.patch(
    '/api/accounts/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          name: z.string().min(3).max(150).optional(),
          accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).optional(),
          normalBalance: z.enum(['DEBIT', 'CREDIT']).optional(),
          isActive: z.boolean().optional(),
        });
        const data = schema.parse(req.body);
        const user = req.currentUser!;

        const [before] = await db
          .select()
          .from(accounts)
          .where(and(eq(accounts.id, req.params.id), eq(accounts.organizationId, user.organizationId)));

        if (!before) {
          return res.status(404).json({ error: 'Akun COA tidak ditemukan.' });
        }

        const [updated] = await db
          .update(accounts)
          .set({
            name: data.name ?? before.name,
            accountType: data.accountType ?? before.accountType,
            normalBalance: data.normalBalance ?? before.normalBalance,
            isActive: data.isActive !== undefined ? data.isActive : before.isActive,
          })
          .where(eq(accounts.id, req.params.id))
          .returning();

        await recordAuditLog({
          user,
          action: 'UPDATE',
          entity: 'accounts',
          entityId: updated.id,
          beforeState: before,
          afterState: updated,
          req,
        });

        res.json(updated);
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Gagal memperbarui akun COA.',
        });
      }
    }
  );

  // ==========================================================================
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC ASSETS
  // ==========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZAMOA CBTC Basketball Academy Server running on http://localhost:${PORT}`);
  });
}

startServer();
