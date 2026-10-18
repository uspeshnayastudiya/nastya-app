// Читает .env.local (секреты не в git) и даёт служебный клиент Supabase.
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

export function loadEnv(file = new URL('../.env.local', import.meta.url)) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

export const env = { ...loadEnv(), ...process.env };

export function admin() {
  const url = env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Нет VITE_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function code6() {
  return String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
}

export async function makeInvite(db, userId, days = 7) {
  await db.from('invites').delete().eq('user_id', userId);
  for (let i = 0; i < 30; i++) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0');
    const { error } = await db.from('invites').insert({ code, user_id: userId, expires_at: new Date(Date.now() + days * 864e5).toISOString() });
    if (!error) return code;
    if (error.code !== '23505') throw error;
  }
  throw new Error('no code');
}

export async function createUser(db, profile) {
  const email = `${profile.role}-${crypto.randomUUID()}@example.com`;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID() });
  if (error) throw error;
  const { error: pe } = await db.from('profiles').insert({ ...profile, id: data.user.id });
  if (pe) {
    await db.auth.admin.deleteUser(data.user.id);
    throw pe;
  }
  return data.user.id;
}
