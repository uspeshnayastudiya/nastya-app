// Действия тренера, которым нужен служебный доступ: создать клиентку, выдать новый код, удалить по просьбе.
import { adminClient, cors, json, newInvite } from '../_shared/common.ts';

const PROFILE_FIELDS = [
  'full_name', 'phone', 'tariff', 'price', 'usual_days', 'usual_time', 'paid_until',
  'goal', 'limits', 'note', 'birthday', 'is_minor', 'parent_consent', 'nutrition', 'food_enabled',
];

function pickProfile(src: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_FIELDS) {
    if (src[k] !== undefined && src[k] !== '') out[k] = src[k];
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const admin = adminClient();
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
    if (whoErr || !who?.user) return json({ error: 'auth' }, 401);
    const { data: me } = await admin.from('profiles').select('role, archived').eq('id', who.user.id).maybeSingle();
    if (!me || me.role !== 'coach' || me.archived) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));

    if (body.action === 'create_client') {
      const p = pickProfile(body.profile ?? {});
      const name = String(p.full_name ?? '').trim();
      if (!name) return json({ error: 'name_required' }, 400);
      p.full_name = name;
      const email = `client-${crypto.randomUUID()}@example.com`;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        password: crypto.randomUUID() + crypto.randomUUID(),
      });
      if (createErr || !created?.user) throw createErr ?? new Error('create user failed');
      const row = {
        ...p,
        id: created.user.id,
        role: 'client',
        cycle_enabled: !p.is_minor,
        food_enabled: p.food_enabled ?? !p.is_minor,
      };
      const { error: profErr } = await admin.from('profiles').insert(row);
      if (profErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw profErr;
      }
      const code = await newInvite(admin, created.user.id);
      return json({ id: created.user.id, code });
    }

    if (body.action === 'new_invite') {
      const id = String(body.id ?? '');
      const { data: target } = await admin.from('profiles').select('id, archived').eq('id', id).maybeSingle();
      if (!target || target.archived) return json({ error: 'not_found' }, 404);
      const code = await newInvite(admin, id);
      return json({ id, code });
    }

    if (body.action === 'delete_client') {
      const id = String(body.id ?? '');
      const { data: target } = await admin.from('profiles').select('id, role').eq('id', id).maybeSingle();
      if (!target || target.role !== 'client') return json({ error: 'not_found' }, 404);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'server', detail: String((e as Error)?.message ?? e) }, 500);
  }
});
