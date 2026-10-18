import { useState } from 'preact/hooks';
import { clientCard, markPaid, updateProfile } from '../lib/api.js';
import { addDays, ddmm, diffDays, relDays, today, WD } from '../lib/dates.js';
import { cycleInfo, money, num, parseNum, PHASE_NAME, waLink } from '../lib/logic.js';
import { Back, Btn, Field, Hud, LoadError, Loading, Offline, Sheet, toast, Udar, useLoad } from '../ui/kit.jsx';
import { TARIFF } from './Clients.jsx';
import { MEASURES } from '../client/Progress.jsx';

export function ClientCard({ id }) {
  const t = today();
  const { data, setData, loading, stale, reload } = useLoad('card:' + id, () => clientCard(id), [id]);
  const [norm, setNorm] = useState(false);
  if (!data && loading) return <div class="screen"><Loading /></div>;
  if (!data) return <div class="screen"><LoadError onRetry={reload} /></div>;
  const c = data.profile;
  const payDays = c.paid_until ? diffDays(c.paid_until, t) : null;
  const shares = c.cycle_enabled && c.cycle_share;
  const cyc = shares ? cycleInfo(data.cycle, { today: t, contraception: c.contraception }) : { known: false };
  const flow = new Map(data.cycle.map((d) => [d.date, d.flow]));
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const ci = new Map(data.checkins.map((x) => [x.date, x]));
  const periodLow = days.filter((d) => flow.get(d) === 1);
  const lowInPeriod = periodLow.filter((d) => ci.get(d)?.energy === 0).length;
  const n = c.nutrition || {};
  const lastM = data.measurements[data.measurements.length - 1];
  const firstM = data.measurements[0];

  async function paid() {
    try {
      const until = await markPaid(c.id, c.price || null);
      setData((d) => ({ ...d, profile: { ...d.profile, paid_until: until } }));
      toast(`Оплачено до ${ddmm(until)}`);
    } catch {
      toast('Не сохранилось. Проверь интернет.');
    }
  }

  return (
    <div class="screen">
      <Offline stale={stale} />
      <Back href="#/clients">КЛИЕНТКИ</Back>
      <header class="stack">
        <Udar size={52} as="h1">{c.full_name}</Udar>
        <Hud>{[TARIFF[c.tariff], (c.usual_days || []).map((d) => WD[d]).join(' '), c.usual_time].filter(Boolean).join(' // ')}</Hud>
        {!c.consent_at && <Hud style={{ color: 'var(--ogonek)' }}>ЕЩЁ НЕ ВОШЛА В ПРИЛОЖЕНИЕ</Hud>}
      </header>

      <section aria-label="Оплата" class={'card tight' + (payDays !== null && payDays < 0 ? ' hot' : '')} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: '12px' }}>
        <span class="stack" style={{ gap: '4px' }}>
          <Hud>{`${TARIFF[c.tariff] || 'ТАРИФ'}${c.price ? ` // ${money(c.price)} ₸ В МЕСЯЦ` : ''}`}</Hud>
          <span>{c.paid_until ? `Оплачено до ${ddmm(c.paid_until)}, ${relDays(payDays)}` : 'Дата оплаты не указана'}</span>
        </span>
        <Btn kind="dark" small style={{ width: 'auto' }} onClick={paid}>Оплатила</Btn>
      </section>

      <section aria-label="Профиль" class="card">
        {[['ЦЕЛЬ', c.goal], ['ОГРАНИЧЕНИЯ', c.limits, true], ['ЗАМЕТКА', c.note], ['ДЕНЬ РОЖДЕНИЯ', c.birthday ? ddmm(c.birthday) : null]]
          .filter(([, v]) => v)
          .map(([l, v, hot]) => (
            <div class="stack" style={{ gap: '4px' }}>
              <Hud style={hot ? { color: 'var(--ogonek)' } : null}>{l}</Hud>
              <span style={{ whiteSpace: 'pre-line' }}>{v}</span>
            </div>
          ))}
        {!c.goal && !c.limits && !c.note && <span class="muted small">Цель, ограничения и заметки можно добавить в данных клиентки.</span>}
      </section>

      <section aria-labelledby="feel-t" class="card">
        <div class="between" style={{ alignItems: 'baseline' }}>
          <h2 id="feel-t" class="h3">Самочувствие{shares ? ' и цикл' : ''}</h2>
          <Hud>ЭНЕРГИЯ // 2 НЕДЕЛИ</Hud>
        </div>
        <div class="bars" role="img" aria-label="Энергия по дням за две недели">
          {days.map((d) => {
            const e = ci.get(d)?.energy;
            const h = e === undefined || e === null ? 4 : 22 * (e + 1);
            return <div class={shares && flow.get(d) === 1 ? 'p' : ''} style={{ height: h + 'px', opacity: e === undefined || e === null ? 0.4 : 1 }} />;
          })}
        </div>
        <div class="hud between"><span>{ddmm(days[0])}</span><span>{ddmm(t)}</span></div>
        {shares && (
          <div class="wrap" style={{ gap: '8px 16px', alignItems: 'center' }}>
            <span class="row small" style={{ gap: '6px' }}><span aria-hidden="true" style={{ width: '12px', height: '12px', background: 'var(--ogonek)' }} />Дни месячных</span>
            <span class="row small" style={{ gap: '6px' }}><span aria-hidden="true" style={{ width: '12px', height: '12px', background: 'var(--dim)' }} />Остальные дни</span>
          </div>
        )}
        <p class="small muted">
          {shares
            ? [
                periodLow.length ? `В дни месячных энергия «мало» ${lowInPeriod} из ${periodLow.length}.` : '',
                cyc.known ? `Сейчас день ${cyc.day}${cyc.phase ? ', ' + PHASE_NAME[cyc.phase] : ''}.` : 'Цикл пока не отмечен.',
                c.contraception ? 'Принимает контрацептивы.' : '',
              ].filter(Boolean).join(' ')
            : c.cycle_enabled
            ? 'Цикл клиентка не показывает.'
            : 'Цикл не ведётся.'}
        </p>
      </section>

      <section aria-labelledby="w-t" class="card">
        <h2 id="w-t" class="hud" style={{ margin: 0 }}><span class="tag">[РАБОЧИЕ ВЕСА]</span></h2>
        {data.lifts.length ? (
          <div>
            {data.lifts.slice(0, 6).map((s) => {
              const a = s.points[0].weight;
              const b = s.points[s.points.length - 1].weight;
              return (
                <div class="list-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto 52px' }}>
                  <span>{s.name}</span>
                  <span>{`${num(a)} → ${num(b)} кг`}</span>
                  <span class="small muted" style={{ textAlign: 'right' }}>{b - a > 0 ? `+${num(b - a)}` : ''}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <span class="small muted">Пока нет сделанных тренировок.</span>
        )}
      </section>

      <section class="card tight">
        <Hud tag="ЗАМЕРЫ">{lastM ? ddmm(lastM.date) : 'НЕТ'}</Hud>
        {lastM &&
          MEASURES.filter(([k]) => lastM[k] != null).map(([k, l]) => (
            <div class="between small">
              <span class="muted">{l}</span>
              <span>{firstM !== lastM && firstM[k] != null ? `${num(firstM[k])} → ${num(lastM[k])}` : num(lastM[k])}</span>
            </div>
          ))}
      </section>

      <section aria-labelledby="f-t" class="card">
        <div class="between">
          <h2 id="f-t" class="hud" style={{ margin: 0 }}><span class="tag">[ПИТАНИЕ]</span> НОРМА</h2>
          <button class="hud hud-btn" onClick={() => setNorm(true)}>ИЗМЕНИТЬ</button>
        </div>
        {c.food_enabled === false && <Hud style={{ color: 'var(--ogonek)' }}>РАЗДЕЛ ПИТАНИЯ У КЛИЕНТКИ ВЫКЛЮЧЕН</Hud>}
        {(n.kcal || c.food_enabled !== false) && (
          <span>{n.kcal ? `${money(n.kcal)} ккал · Б ${n.p} · Ж ${n.f} · У ${n.c}${n.train_c ? ` · +${n.train_c} г углеводов в день тренировки` : ''}` : 'Норма не задана. Без неё у клиентки нет меню.'}</span>
        )}
        {data.foodDays.length > 0 && (
          <Hud>{`ЗА НЕДЕЛЮ: ПО ПЛАНУ ${data.foodDays.filter((d) => d.status === 'plan').length} // ОТКЛОНИЛАСЬ ${data.foodDays.filter((d) => d.status === 'off').length}`}</Hud>
        )}
        {data.extras.map((x) => (
          <div class="between small" style={{ borderTop: '1px solid var(--line)', paddingTop: '6px' }}>
            <span>{x.text}</span>
            <span class="hud">{ddmm(x.date)}</span>
          </div>
        ))}
      </section>

      <div class="grid2">
        <Btn href={`#/client/${c.id}/program`} icon="arrow">Программа</Btn>
        {c.phone ? (
          <a class="btn btn-dark srez" href={waLink(c.phone, '')} target="_blank" rel="noopener"><span>Написать</span></a>
        ) : (
          <Btn kind="dark" href={`#/client/${c.id}/edit`}>Добавить номер</Btn>
        )}
      </div>
      <a class="hud hud-btn" style={{ color: 'var(--muted)', textDecoration: 'none' }} href={`#/client/${c.id}/invite`}>КОД ДЛЯ ВХОДА // ЕСЛИ СМЕНИЛА ТЕЛЕФОН</a>
      <a class="hud hud-btn" style={{ color: 'var(--muted)', textDecoration: 'none' }} href={`#/client/${c.id}/edit`}>ИЗМЕНИТЬ ДАННЫЕ</a>

      {norm && (
        <NormSheet
          n={n}
          onClose={() => setNorm(false)}
          onSave={async (v) => {
            const p = await updateProfile(c.id, { nutrition: v });
            setData((d) => ({ ...d, profile: p }));
            setNorm(false);
            toast('Норма сохранена.');
          }}
        />
      )}
    </div>
  );
}

function NormSheet({ n, onClose, onSave }) {
  const [v, setV] = useState({ kcal: n.kcal ?? '', p: n.p ?? '', f: n.f ?? '', c: n.c ?? '', train_c: n.train_c ?? '' });
  const [busy, setBusy] = useState(false);
  const p = parseNum(v.p) || 0;
  const f = parseNum(v.f) || 0;
  const c = parseNum(v.c) || 0;
  const calc = Math.round(p * 4 + f * 9 + c * 4);
  return (
    <Sheet title="Норма на день" onClose={onClose}>
      <div class="grid2" style={{ gap: '10px' }}>
        {[['p', 'БЕЛКИ, Г'], ['f', 'ЖИРЫ, Г'], ['c', 'УГЛЕВОДЫ, Г'], ['train_c', '+ УГЛЕВОДЫ В ДЕНЬ ТРЕНИРОВКИ']].map(([k, l]) => (
          <Field label={l} id={'n-' + k}>
            <input id={'n-' + k} class="input" inputMode="numeric" value={v[k]} onInput={(e) => setV({ ...v, [k]: e.currentTarget.value })} />
          </Field>
        ))}
      </div>
      <Field label="КАЛОРИИ" id="n-kcal" hint={calc ? `По БЖУ выходит ${calc} ккал.` : ''}>
        <input id="n-kcal" class="input" inputMode="numeric" value={v.kcal} onInput={(e) => setV({ ...v, kcal: e.currentTarget.value })} placeholder={calc ? String(calc) : ''} />
      </Field>
      <Btn
        disabled={busy || !(p || f || c)}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave({ kcal: parseNum(v.kcal) || calc, p, f, c, train_c: parseNum(v.train_c) || 0 });
          } catch {
            toast('Не сохранилось. Проверь интернет.');
          } finally {
            setBusy(false);
          }
        }}
      >
        Сохранить
      </Btn>
    </Sheet>
  );
}
