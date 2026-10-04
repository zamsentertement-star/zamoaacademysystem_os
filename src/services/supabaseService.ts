export {
  supabaseClient,
  isSupabaseConfigured,
  getCentralizedServiceStatus,
  centralizedAuthService,
  centralizedDatabaseService,
  centralizedRealtimeService,
  type CentralizedServiceStatus,
  type AuthSessionUser,
  type QueryFilterOperator,
  type TableQueryOptions,
  type RealtimeDomainEvent,
} from '../lib/supabase.ts';
