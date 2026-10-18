import { coachShift } from '../lib/api.js';
import { today, ddmm, plural, WD, weekday } from '../lib/dates.js';
import { flagsFor, isUsualDay, payText, quietText, waLink } from '../lib/logic.js';
import { Hud, Icon, LoadError, Loading, Offline, useLoad } from '../ui/kit.jsx';

const ORDER = { cycle: 0, pain: 1, pay: 2, quiet: 3, bday: 4 };

export function Shift({ me }) {
  const t = today();
  const { data, loading, stale, reload } = useLoad('shift', () => coachShift(), []);
  if (!data && loading) return <div class="screen"><Loading /></div>;
  if (!data) return <div class="screen"><LoadError onRetry={reload} /></div>;

  const byId = new Map(data.clients.map((c) => [c.id, c]));
  const flags = new Map(data.clients.map((c) => [c.id, flagsFor(c, { ...data, today: t })]));
  const attention = data.clients
    .flatMap((c) => flags.get(c.id).map((f) => ({ ...f, c })))
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const todayW = data.workouts.filter((w) => byId.has(w.client_id));
  const slotOf = (c, w) => (w?.time || c.usual_time || '');
  const rows = todayW.map((w) => ({ c: byId.get(w.client_id), w }));
  for (const c of data.clients) {
    if (isUsualDay(c, t) && !todayW.some((w) => w.client_id === c.id)) rows.push({ c, w: null });
  }
  const slots = {};
  for (const r of rows) (slots[slotOf(r.c, r.w)] = slots[slotOf(r.c, r.w)] || []).push(r);
  const times = Object.keys(slots).sort();
  const absent = new Map(data.absences.map((a) => [a.client_id, a]));
  const inSlot = (id) => {
    const r = rows.find((x) => x.c.id === id);
    return r ? slotOf(r.c, r.w) : null;
  };

  return (
    <div class="screen">
      <Offline stale={stale} />
      <header class="stack" style={{ position: 'relative', gap: '6px' }}>
        <div class="shtrih" style={{ width: '80px', height: '40px', right: '52px' }} />
        <div class="between" style={{ alignItems: 'flex-start' }}>
          <h1 class="udar" style={{ fontSize: '44px', color: 'var(--ogonek)' }}>Анастасия</h1>
          <a href="#/me" aria-label="Мои настройки" style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            <Icon name="person" size={20} />
          </a>
        </div>
        <Hud>{`ТРЕНЕР // ${WD[weekday(t)]} ${ddmm(t)} // ${data.clients.length} ${plural(data.clients.length, 'КЛИЕНТКА', 'КЛИЕНТКИ', 'КЛИЕНТОК')}`}</Hud>
      </header>

      <section aria-labelledby="att-t" class="stack">
        <div class="between" style={{ alignItems: 'baseline' }}>
          <h2 id="att-t" class="h2">Обратить внимание</h2>
          <Hud>{attention.length ? String(attention.length) : 'ВСЁ СПОКОЙНО'}</Hud>
        </div>
        {attention.length === 0 && <p class="muted small">Ни у кого ничего срочного. Хорошей смены.</p>}
        {attention.map((a) => (
          <Attention a={a} slot={inSlot(a.c.id)} />
        ))}
      </section>

      <section aria-labelledby="day-t" class="stack">
        <h2 id="day-t" class="h2">Сегодня в зале</h2>
        {times.length === 0 && <p class="muted small">На сегодня тренировок нет.</p>}
        {times.map((time) => {
          const list = slots[time];
          const personal = list.length === 1 && list[0].c.tariff === 'personal';
          const away = list.filter((r) => absent.has(r.c.id)).length;
          if (personal) {
            const { c, w } = list[0];
            return (
              <a href={`#/client/${c.id}/program`} class="card tight" style={{ display: 'grid', gridTemplateColumns: '60px minmax(0,1fr) 18px', alignItems: 'center', gap: '12px', textDecoration: 'none', color: 'inherit' }}>
                <span class="udar" style={{ fontSize: '28px' }}>{time || '--:--'}</span>
                <span class="stack" style={{ gap: '3px' }}>
                  <span style={{ fontWeight: 500 }}>{c.full_name}</span>
                  <Hud>{`ПЕРСОНАЛЬНАЯ // ТОЛЬКО ОНА // ${absent.has(c.id) ? 'НЕ ПРИДЁТ' : w?.title || 'БЕЗ ПЛАНА'}`}</Hud>
                </span>
                <Icon name="arrow" size={18} color="var(--muted)" />
              </a>
            );
          }
          return (
            <div class="card tight">
              <div style={{ display: 'grid', gridTemplateColumns: '60px minmax(0,1fr)', gap: '12px', alignItems: 'center' }}>
                <span class="udar" style={{ fontSize: '28px' }}>{time || '--:--'}</span>
                <span class="stack" style={{ gap: '3px' }}>
                  <span style={{ fontWeight: 500 }}>{`${list.length} ${list.length === 1 ? 'клиентка' : list.length < 5 ? 'клиентки' : 'человек'}`}</span>
                  <Hud>{`У КАЖДОЙ СВОЯ ПРОГРАММА${away ? ` // ${away} НЕ ПРИДЁТ` : ''}`}</Hud>
                </span>
              </div>
              <div>
                {list.map(({ c, w }) => {
                  const ab = absent.get(c.id);
                  const fl = flags.get(c.id);
                  const mark = ab
                    ? { t: ab.reason ? `«${ab.reason}»` : '', hot: false }
                    : w?.status === 'done'
                    ? { t: 'СДЕЛАНО', hot: false }
                    : fl.find((f) => f.kind === 'cycle')
                    ? { t: '↓ ЦИКЛ', hot: true }
                    : fl.find((f) => f.kind === 'pain')
                    ? { t: 'БОЛЬ', hot: true }
                    : fl.find((f) => f.kind === 'pay' && f.overdue)
                    ? { t: '₸ НАПОМНИТЬ', hot: false }
                    : { t: '', hot: false };
                  return (
                    <a href={`#/client/${c.id}/program`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 92px 96px', gap: '8px', alignItems: 'center', minHeight: '44px', borderTop: '1px solid var(--line)', color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ fontSize: '14px', color: ab ? 'var(--muted)' : 'var(--ink)' }}>{c.full_name}</span>
                      <span style={{ fontSize: '14px', color: ab ? 'var(--ogonek)' : 'var(--muted)' }}>{ab ? 'Не придёт' : w?.title || 'Без плана'}</span>
                      <span class="hud" style={{ textAlign: 'right', color: mark.hot ? 'var(--ogonek)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mark.t}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Tag({ hot, children }) {
  return (
    <span
      class="srez hud"
      style={{ justifySelf: 'start', alignSelf: 'start', background: hot ? 'var(--ogonek)' : 'var(--zhelezo)', color: hot ? '#0a0a0a' : 'var(--ink)', padding: '4px 12px 4px 8px' }}
    >
      {children}
    </span>
  );
}

function Attention({ a, slot }) {
  const withText = a.kind === 'quiet' || (a.kind === 'pay' && a.overdue);
  const text = a.kind === 'quiet' ? quietText(a.c) : a.kind === 'pay' ? payText(a.c) : '';
  const head = (
    <span class="stack" style={{ gap: '3px' }}>
      <span style={{ fontWeight: 500 }}>{a.c.full_name}</span>
      <span class="small muted">{a.text}{slot && withText ? `. Сегодня она в ${slot}` : ''}</span>
    </span>
  );
  if (!withText) {
    return (
      <a href={`#/client/${a.c.id}`} class="card tight" style={{ display: 'grid', gridTemplateColumns: '76px minmax(0,1fr)', gap: '12px', textDecoration: 'none', color: 'inherit' }}>
        <Tag hot={a.hot}>{a.tag}</Tag>
        {head}
      </a>
    );
  }
  return (
    <div class="card tight" style={{ display: 'grid', gridTemplateColumns: '76px minmax(0,1fr)', gap: '12px' }}>
      <Tag hot={a.hot}>{a.tag}</Tag>
      <span class="stack">
        <a href={`#/client/${a.c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{head}</a>
        <span class="small">«{text}»</span>
        <span class="between">
          <Hud>{slot ? `ИЛИ СКАЖИ ЛИЧНО В ${slot}` : ''}</Hud>
          {a.c.phone ? (
            <a class="btn btn-dark btn-sm srez" style={{ width: 'auto', flex: 'none' }} href={waLink(a.c.phone, text)} target="_blank" rel="noopener">Написать</a>
          ) : (
            <Hud>НЕТ НОМЕРА</Hud>
          )}
        </span>
      </span>
    </div>
  );
}
