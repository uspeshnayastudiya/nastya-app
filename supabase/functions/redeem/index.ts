// Вход по коду из приглашения: проверяет код и выдаёт сессию. Защита от подбора: лимит неудачных попыток.
import { adminClient, cors, json, publicClient } from '../_shared/common.ts';

const IP_FAILS_PER_HOUR = 10;
const ALL_FAILS_PER_HOUR = 300;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const admin = adminClient();
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const fail = async (error: string, status = 400) => {
    await admin.from('redeem_attempts').insert({ ip, ok: false });
    return json({ error }, status);
  };
  try {
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count: ipFails } = await admin
      .from('redeem_attempts').select('id', { count: 'exact', head: true })
      .eq('ip', ip).eq('ok', false).gte('at', since);
    if ((ipFails ?? 0) >= IP_FAILS_PER_HOUR) return json({ error: 'too_many' }, 429);
    const { count: allFails } = await admin
      .from('redeem_attempts').select('id', { count: 'exact', head: true })
      .eq('ok', false).gte('at', since);
    if ((allFails ?? 0) >= ALL_FAILS_PER_HOUR) return json({ error: 'too_many' }, 429);

    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? '').replace(/\D/g, '');
    if (code.length !== 6) return await fail('bad_code');

    const { data: inv } = await admin.from('invites').select('*').eq('code', code).maybeSingle();
    if (!inv || new Date(inv.expires_at).getTime() < Date.now() || inv.uses >= inv.max_uses) {
      return await fail('bad_code');
    }
    const { data: prof } = await admin.from('profiles').select('archived').eq('id', inv.user_id).maybeSingle();
    if (!prof || prof.archived) return await fail('bad_code');

    const { data: au, error: auErr } = await admin.auth.admin.getUserById(inv.user_id);
    if (auErr || !au?.user?.email) throw auErr ?? new Error('user not found');
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: au.user.email,
    });
    if (linkErr || !link?.properties?.hashed_token) throw linkErr ?? new Error('no link');

    const pub = publicClient();
    let { data: verified, error: verErr } = await pub.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.properties.hashed_token,
    });
    if (verErr || !verified?.session) {
      ({ data: verified, error: verErr } = await pub.auth.verifyOtp({
        type: 'email',
        token_hash: link.properties.hashed_token,
      }));
    }
    if (verErr || !verified?.session) throw verErr ?? new Error('no session');

    await admin.from('invites').update({ uses: inv.uses + 1 }).eq('code', code);
    await admin.from('redeem_attempts').insert({ ip, ok: true });
    await admin.from('redeem_attempts').delete().lt('at', new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString());

    return json({
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    });
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
});
