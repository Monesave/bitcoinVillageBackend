import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

const resolveSupabaseKey = (): string => {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  // Skip truncated/placeholder secret keys and fall back to the publishable key
  if (serviceKey && serviceKey.length >= 40) {
    return serviceKey;
  }

  if (anonKey) {
    return anonKey;
  }

  if (serviceKey) {
    return serviceKey;
  }

  throw new Error(
    'Supabase API key is required. Set SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in your .env file.'
  );
};

const supabaseServiceKey = resolveSupabaseKey();

if (!supabaseUrl) {
  console.error('❌ Missing required Supabase environment variables');
  console.error('Please set SUPABASE_URL in your .env file');
  throw new Error(
    'Supabase configuration is required. Please set SUPABASE_URL in your .env file.'
  );
}

// Service role client for admin operations
export const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Helper to create a client with user token
export const createUserClient = (accessToken: string) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration is required');
  }
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
};
