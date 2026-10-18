import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function firstKey(jsonEnv: string | undefined): string | undefined {
  if (!jsonEnv) return undefined;
  try {
    const obj = JSON.parse(jsonEnv);
    const vals = Object.values(obj);
    return typeof vals[0] === 'string' ? (vals[0] as string) : undefined;
  } catch {
    return undefined;
  }
}

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? firstKey(Deno.env.get('SUPABASE_SECRET_KEYS'))!;
export const ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ?? firstKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'))!;

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function publicClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function code6(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, '0');
}

// Новый код входа: старые коды этого человека гаснут.
export async function newInvite(admin: SupabaseClient, userId: string): Promise<string> {
  await admin.from('invites').delete().eq('user_id', userId);
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  for (let i = 0; i < 30; i++) {
    const code = code6();
    const { error } = await admin.from('invites').insert({ code, user_id: userId, expires_at: expires });
    if (!error) return code;
    if (error.code !== '23505') throw error;
  }
  throw new Error('could not generate code');
}
