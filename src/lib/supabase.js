import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const APP_URL = import.meta.env.VITE_APP_URL || (typeof location !== 'undefined' ? location.origin + location.pathname : '');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'anastasia-auth',
  },
});

// Вызов Edge Function с понятной ошибкой.
export async function callFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = 'server';
    try {
      const j = await error.context?.json?.();
      code = j?.error || code;
    } catch {
      // ответ без тела
    }
    const e = new Error(code);
    e.code = code;
    e.status = error.context?.status;
    throw e;
  }
  return data;
}
