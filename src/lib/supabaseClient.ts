import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let configuredUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
let configuredAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

let client: SupabaseClient | null = null;

export function configureSupabaseClient(publicUrl?: string | null, publicAnonKey?: string | null) {
  const nextUrl = publicUrl?.trim() || '';
  const nextKey = publicAnonKey?.trim() || '';
  if (!nextUrl || !nextKey) return;
  if (nextUrl !== configuredUrl || nextKey !== configuredAnonKey) {
    configuredUrl = nextUrl;
    configuredAnonKey = nextKey;
    client = createClient(configuredUrl, configuredAnonKey);
  }
}

export function isClientSupabaseEnabled(): boolean {
  return Boolean(configuredUrl && configuredAnonKey);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isClientSupabaseEnabled()) return null;
  if (!client) {
    client = createClient(configuredUrl, configuredAnonKey);
  }
  return client;
}
