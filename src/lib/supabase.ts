import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import firebaseConfig from '../../firebase-applet-config.json';

/**
 * ZAMOA CBTC Basketball Academy — Cloud SQL Pool & Supabase Client Initialization
 *
 * Uses the platform-provided Cloud SQL environment variables (SQL_HOST, SQL_USER,
 * SQL_PASSWORD, SQL_DB_NAME) via the Object Method and initializes the Supabase client
 * using firebase-applet-config.json and environment variables.
 */

declare global {
  var _postgresPool: Pool | undefined;
}

const nodeEnv: Record<string, string | undefined> =
  typeof process !== 'undefined' && process.env ? process.env : {};

const viteEnv: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ? (import.meta as unknown as { env: Record<string, string | undefined> }).env
    : {};

export const createPool = (): Pool => {
  if (!globalThis._postgresPool) {
    globalThis._postgresPool = new Pool({
      host: nodeEnv.SQL_HOST,
      user: nodeEnv.SQL_USER,
      password: nodeEnv.SQL_PASSWORD,
      database: nodeEnv.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    globalThis._postgresPool.on('error', (err: Error) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return globalThis._postgresPool;
};

export const pool: Pool = createPool();

/**
 * Executes a parameterized SQL query lazily against the Cloud SQL connection pool.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

/**
 * Executes provided schema SQL statements on-demand within a transaction.
 */
export async function executeSchemaSql(schemaSql?: string): Promise<{
  ok: boolean;
  extensionsEnabled: string[];
  executedStatements: number;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    let executedStatements = 2;
    if (schemaSql && schemaSql.trim().length > 0) {
      await client.query(schemaSql);
      executedStatements += 1;
    }

    await client.query('COMMIT');
    return {
      ok: true,
      extensionsEnabled: ['uuid-ossp', 'pgcrypto'],
      executedStatements,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Schema SQL execution failed:', error);
    throw new Error('Schema SQL execution failed.', { cause: error });
  } finally {
    client.release();
  }
}

// ============================================================================
// SUPABASE CLIENT INITIALIZATION
// ============================================================================

const envSupabaseUrl = viteEnv.VITE_SUPABASE_URL || nodeEnv.VITE_SUPABASE_URL;
const envSupabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY || nodeEnv.VITE_SUPABASE_ANON_KEY;

export const isSupabaseExternallyConfigured = Boolean(
  envSupabaseUrl &&
    envSupabaseAnonKey &&
    !envSupabaseUrl.includes('MY_SUPABASE') &&
    !envSupabaseAnonKey.includes('MY_SUPABASE')
);

const resolvedSupabaseUrl =
  envSupabaseUrl && envSupabaseUrl.startsWith('http')
    ? envSupabaseUrl
    : `https://${firebaseConfig.projectId || 'zamoa-cbtc'}.supabase.co`;

const resolvedSupabaseKey =
  envSupabaseAnonKey && envSupabaseAnonKey.length > 0
    ? envSupabaseAnonKey
    : firebaseConfig.apiKey || 'public-anon-key-placeholder';

export const supabaseConfig = {
  url: resolvedSupabaseUrl,
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket,
  configuredFromEnv: isSupabaseExternallyConfigured,
};

export const supabase: SupabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      'x-application-name': 'zamoa-cbtc-academy',
      'x-firebase-project-id': firebaseConfig.projectId || '',
    },
  },
});

export const supabaseClient = supabase;
export const isSupabaseConfigured = isSupabaseExternallyConfigured;

export interface CentralizedServiceStatus {
  supabaseConfigured: boolean;
  projectId: string;
  authDomain: string;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  fullName?: string;
  roleCode?: string;
}

export type QueryFilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike';

export interface TableQueryOptions {
  filters?: Array<{ column: string; operator: QueryFilterOperator; value: unknown }>;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
}

export interface RealtimeDomainEvent<T = unknown> {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newRecord?: T;
  oldRecord?: T;
  timestamp: string;
}

export function getCentralizedServiceStatus(): CentralizedServiceStatus {
  return {
    supabaseConfigured: isSupabaseExternallyConfigured,
    projectId: firebaseConfig.projectId || '',
    authDomain: firebaseConfig.authDomain || '',
  };
}

export const centralizedAuthService = {
  getClient: () => supabase.auth,
  getStatus: getCentralizedServiceStatus,
};

export const centralizedDatabaseService = {
  from: (table: string) => supabase.from(table),
  query,
  executeSchemaSql,
  pool,
};

export const centralizedRealtimeService = {
  channel: (name: string) => supabase.channel(name),
};

export default supabase;
