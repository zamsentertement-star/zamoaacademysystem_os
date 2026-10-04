import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';
import { createPool, pool, executeSchemaSql } from '../lib/supabase.ts';

export { createPool, pool, executeSchemaSql };

export interface CapturedDatabaseQuery {
  id: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL';
  targetTable: string;
  sqlStatement: string;
  paramsPreview: string;
  executedAt: string;
  source: string;
}

const MAX_RECENT_QUERIES = 120;
const recentDatabaseQueries: CapturedDatabaseQuery[] = [];
let querySeq = 1;

function parseSqlOperation(sqlText: string): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL' {
  const trimmed = sqlText.trim().toUpperCase();
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  return 'DDL';
}

function parseTargetTable(sqlText: string): string {
  const fromMatch = sqlText.match(/\bfrom\s+"?([a-zA-Z0-9_]+)"?/i);
  if (fromMatch?.[1]) return fromMatch[1];
  const intoMatch = sqlText.match(/\binto\s+"?([a-zA-Z0-9_]+)"?/i);
  if (intoMatch?.[1]) return intoMatch[1];
  const updateMatch = sqlText.match(/\bupdate\s+"?([a-zA-Z0-9_]+)"?/i);
  if (updateMatch?.[1]) return updateMatch[1];
  return 'public';
}

export function recordCapturedDatabaseQuery(
  query: string,
  params: unknown[] = [],
  source = 'DRIZZLE_POSTGRES_POOL'
) {
  const operation = parseSqlOperation(query);
  const targetTable = parseTargetTable(query);
  const safeParams = params.slice(0, 8).map((p) => {
    const str = typeof p === 'string' ? p : JSON.stringify(p);
    return str && str.length > 60 ? `${str.slice(0, 57)}...` : str;
  });

  recentDatabaseQueries.unshift({
    id: `pg-q-${Date.now()}-${querySeq++}`,
    operation,
    targetTable,
    sqlStatement: query.length > 550 ? `${query.slice(0, 547)}...` : query,
    paramsPreview: safeParams.length > 0 ? JSON.stringify(safeParams) : '[]',
    executedAt: new Date().toISOString(),
    source,
  });

  if (recentDatabaseQueries.length > MAX_RECENT_QUERIES) {
    recentDatabaseQueries.length = MAX_RECENT_QUERIES;
  }
}

export function getRecentDatabaseQueries(): CapturedDatabaseQuery[] {
  return [...recentDatabaseQueries];
}

export const db = drizzle(pool, {
  schema,
  logger: {
    logQuery(query: string, params: unknown[]) {
      recordCapturedDatabaseQuery(query, params, 'DRIZZLE_POSTGRES_POOL');
    },
  },
});

