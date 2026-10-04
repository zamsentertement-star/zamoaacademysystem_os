import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { accounts, journals, journalEntries } from '../db/schema.ts';
import { AuthenticatedUser, recordAuditLog } from '../middleware/auth.ts';

export interface JournalLineInput {
  accountCode: string;
  debit: number;
  credit: number;
  memo?: string;
}

export async function postDoubleEntryJournal(params: {
  user: AuthenticatedUser;
  branchId: string;
  entryDate: string;
  sourceType: 'INVOICE' | 'PAYMENT' | 'EXPENSE' | 'PAYROLL' | 'ADJUSTMENT' | 'REVERSAL';
  sourceId: string;
  description: string;
  lines: JournalLineInput[];
}) {
  try {
    const totalDebit = params.lines.reduce((acc, l) => acc + Number(l.debit || 0), 0);
    const totalCredit = params.lines.reduce((acc, l) => acc + Number(l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.009 || totalDebit <= 0) {
      throw new Error(
        `Jurnal tidak seimbang: Total Debit (${totalDebit.toFixed(2)}) harus sama dengan Total Credit (${totalCredit.toFixed(2)}) dan lebih besar dari 0.`
      );
    }

    const orgAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.organizationId, params.user.organizationId));

    const accountMap = new Map(orgAccounts.map((a) => [a.code, a]));

    for (const line of params.lines) {
      if (!accountMap.has(line.accountCode)) {
        throw new Error(`Kode Akun COA '${line.accountCode}' tidak ditemukan.`);
      }
    }

    const dateObj = new Date(params.entryDate);
    const fiscalYear = dateObj.getFullYear();
    const periodMonth = dateObj.getMonth() + 1;
    const journalNumber = `JRN-${fiscalYear}${String(periodMonth).padStart(2, '0')}-${Date.now().toString().slice(-6)}`;

    const [createdJournal] = await db
      .insert(journals)
      .values({
        organizationId: params.user.organizationId,
        branchId: params.branchId,
        journalNumber,
        fiscalYear,
        periodMonth,
        entryDate: params.entryDate,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        description: params.description,
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
        status: 'POSTED',
        createdByUserId: params.user.id,
      })
      .returning();

    const entryValues = params.lines.map((l) => {
      const acc = accountMap.get(l.accountCode)!;
      return {
        journalId: createdJournal.id,
        accountId: acc.id,
        debit: Number(l.debit || 0).toFixed(2),
        credit: Number(l.credit || 0).toFixed(2),
        memo: l.memo || params.description,
      };
    });

    await db.insert(journalEntries).values(entryValues);

    await recordAuditLog({
      user: params.user,
      action: 'JOURNAL_POSTING',
      entity: 'journals',
      entityId: createdJournal.id,
      afterState: { journal: createdJournal, lines: entryValues },
    });

    return createdJournal;
  } catch (error) {
    console.error('Double-entry journal posting failed:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Gagal memposting jurnal akuntansi.',
      { cause: error }
    );
  }
}

export async function reversePostedJournal(params: {
  user: AuthenticatedUser;
  journalId: string;
  reason: string;
}) {
  try {
    const existingJournals = await db
      .select()
      .from(journals)
      .where(
        and(
          eq(journals.id, params.journalId),
          eq(journals.organizationId, params.user.organizationId)
        )
      );

    const original = existingJournals[0];
    if (!original) {
      throw new Error('Jurnal tidak ditemukan.');
    }
    if (original.status === 'REVERSED') {
      throw new Error('Jurnal ini sudah pernah di-reverse sebelumnya.');
    }

    const originalEntries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.journalId, original.id));

    const today = new Date().toISOString().slice(0, 10);
    const dateObj = new Date();
    const reversalNumber = `REV-${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(2, '0')}-${Date.now().toString().slice(-6)}`;

    const [reversalJournal] = await db
      .insert(journals)
      .values({
        organizationId: params.user.organizationId,
        branchId: original.branchId,
        journalNumber: reversalNumber,
        fiscalYear: dateObj.getFullYear(),
        periodMonth: dateObj.getMonth() + 1,
        entryDate: today,
        sourceType: 'REVERSAL',
        sourceId: original.id,
        description: `[REVERSAL ${original.journalNumber}] ${params.reason}`,
        totalDebit: original.totalCredit,
        totalCredit: original.totalDebit,
        status: 'POSTED',
        createdByUserId: params.user.id,
      })
      .returning();

    const reversedEntries = originalEntries.map((entry) => ({
      journalId: reversalJournal.id,
      accountId: entry.accountId,
      debit: entry.credit,
      credit: entry.debit,
      memo: `Reversal dari ${original.journalNumber}: ${entry.memo || ''}`,
    }));

    await db.insert(journalEntries).values(reversedEntries);

    await db
      .update(journals)
      .set({
        status: 'REVERSED',
        reversedByJournalId: reversalJournal.id,
      })
      .where(eq(journals.id, original.id));

    await recordAuditLog({
      user: params.user,
      action: 'JOURNAL_REVERSAL',
      entity: 'journals',
      entityId: original.id,
      beforeState: original,
      afterState: reversalJournal,
    });

    return reversalJournal;
  } catch (error) {
    console.error('Failed to reverse journal:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Gagal melakukan reversal jurnal.',
      { cause: error }
    );
  }
}

export async function getAccountingSnapshot(organizationId: string, branchId?: string | null) {
  try {
    const accountList = await db
      .select()
      .from(accounts)
      .where(eq(accounts.organizationId, organizationId));

    const journalCondition = branchId
      ? and(eq(journals.organizationId, organizationId), eq(journals.branchId, branchId))
      : eq(journals.organizationId, organizationId);

    const journalList = await db
      .select()
      .from(journals)
      .where(journalCondition)
      .orderBy(desc(journals.createdAt));

    const allEntries = await db.select().from(journalEntries);

    const journalIds = new Set(journalList.map((j) => j.id));
    const filteredEntries = allEntries.filter((e) => journalIds.has(e.journalId));

    const accountBalances = accountList.map((acc) => {
      const accEntries = filteredEntries.filter((e) => e.accountId === acc.id);
      const debitSum = accEntries.reduce((s, e) => s + Number(e.debit || 0), 0);
      const creditSum = accEntries.reduce((s, e) => s + Number(e.credit || 0), 0);
      const netBalance =
        acc.normalBalance === 'DEBIT' ? debitSum - creditSum : creditSum - debitSum;
      return {
        ...acc,
        debitSum,
        creditSum,
        netBalance,
      };
    });

    return {
      accounts: accountBalances,
      journals: journalList.map((j) => ({
        ...j,
        entries: filteredEntries.filter((e) => e.journalId === j.id),
      })),
    };
  } catch (error) {
    console.error('Failed to load accounting snapshot:', error);
    throw new Error('Gagal memuat data akuntansi dan buku besar.', { cause: error });
  }
}
