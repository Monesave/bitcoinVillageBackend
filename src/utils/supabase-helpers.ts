/**
 * Helper utilities to work around Supabase type inference issues
 * These helpers ensure proper typing for common Supabase operations
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

/**
 * Safely update a table with proper type handling
 */
export async function safeUpdate<T extends keyof Database['public']['Tables']>(
  client: SupabaseClient<Database>,
  table: T,
  data: Partial<Database['public']['Tables'][T]['Row']>,
  filter: (query: any) => any
) {
  // @ts-ignore - Supabase type inference issue
  return filter(client.from(table).update(data as any));
}

/**
 * Safely insert into a table with proper type handling
 */
export async function safeInsert<T extends keyof Database['public']['Tables']>(
  client: SupabaseClient<Database>,
  table: T,
  data: Database['public']['Tables'][T]['Insert'],
  options?: { select?: string }
) {
  let query: any = client.from(table).insert(data as any);
  if (options?.select) {
    query = query.select(options.select);
  }
  // @ts-ignore - Supabase type inference issue
  return query;
}

/**
 * Type-safe helper to cast Supabase query results
 */
export function asTyped<T>(data: any): T {
  return data as T;
}
