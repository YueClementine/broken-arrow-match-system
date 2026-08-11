import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let anonymousSessionPromise: Promise<string> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!isSupabaseConfigured()) throw new Error('SUPABASE_NOT_CONFIGURED');
  client = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } },
  );
  return client;
}

export function ensureAnonymousSession(): Promise<string> {
  if (anonymousSessionPromise) return anonymousSessionPromise;
  anonymousSessionPromise = (async () => {
    const supabase = getSupabase();
    const { data: existing, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (existing.session) return existing.session.user.id;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) throw error ?? new Error('AUTH_REQUIRED');
    return data.user.id;
  })().catch((error: unknown) => {
    anonymousSessionPromise = null;
    throw error;
  });
  return anonymousSessionPromise;
}
