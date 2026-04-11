import { createClient } from 'npm:@supabase/supabase-js@2.101.1';

declare const Deno: {
  env: { get: (key: string) => string | undefined };
};

const getEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

export const supabaseUrl = () => getEnv('SUPABASE_URL');
export const supabaseAnonKey = () => getEnv('SUPABASE_ANON_KEY');
export const supabaseServiceRoleKey = () => getEnv('SUPABASE_SERVICE_ROLE_KEY');

export const createSupabaseServiceClient = () =>
  createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

export const createSupabaseAuthClient = (authorizationHeader: string | null) =>
  createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: authorizationHeader ? { Authorization: authorizationHeader } : {},
    },
  });
