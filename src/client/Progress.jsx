import { useState } from 'preact/hooks';
import { addMeasurement, liftSeries, loadProfile, progressData, setCycleSettings, cacheSet } from '../lib/api.js';
import { addDays, ddmm, diffDays, iso, monthName, parse, plural, today, WD } from '../lib/dates.js';
import { cycleInfo, num, parseNum } from '../lib/logic.js';
import { Btn, Field, Hud, LoadError, Loading, Sheet, toast, useLoad } from '../ui/kit.jsx';

export const MEASURES = [
  ['weight', 'Вес, кг'],
  ['waist', 'Талия (живот), см'],
  ['waist_high', 'Талия завышенная, см'],
  ['glutes', 'Ягодицы, см'],
  ['thigh', 'Бедро, см'],
  ['chest', 'Грудь, см'],
  ['biceps', 'Бицепс, см'],
];

export function Progress({ me, onMe }) {
  const { data, setData, loading, reload } = useLoad('progress', () => progressData(me.id), [me.id]);
  const [sel, setSel] = useState(0);
  const [measure, setMeasure] = useState(false);
  const [cycleSet, setCycleSet] = useState(false);

  if (!data && loading) return <div class="screen"><Loading /></div>;
  if (!data) return <div class="screen"><LoadError onRetry={reload} /></div>;

  const series = liftSeries(data.exercises, data.logs).slice(0, 5);
  const s = series[Math.min(sel, series.length - 1)];
  const ms = data.measurements;
  // У перенесённых из таблицы клиенток замеры старше аккаунта: считаем от самого раннего.
  const start = [me.created_at.slice(0, 10), ms[0]?.date].filter(Boolean).sort()[0];
  const weeks = Math.max(1, Math.round(diffDays(today(), start) / 7));
  const firstM = ms[0];
  const lastM = ms[ms.length - 1];
  const nextM = lastM ? addDays(lastM.date, 30) : null;

  return (
    <div class="screen">
      <h1 class="hud" style={{ margin: 0 }}>{`ПРОГРЕСС // ${weeks} ${plural(weeks, 'неделя', 'недели', 'недель')} С АНАСТАСИЕЙ`}</h1>

      {s ? (
        <>
          <div role="group" aria-label="Упражнение" class="wrap">
            {series.map((x, i) => (
              <button class="opt" aria-pressed={String(i === sel)} onClick={() => setSel(i)}>{x.name}</button>
            ))}
          </div>
          <section aria-label="Рабочий вес" class="stack-12">
            <div class="row" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span class="udar" style={{ fontSize: '64px', lineHeight: 0.8, color: 'var(--muted)' }}>{num(s.points[0].weight)}</span>
              <span class="wide" style={{ fontSize: '28px', color: 'var(--ogonek)', fontWeight: 900 }}>→</span>
              <span class="udar" style={{ fontSize: '64px', lineHeight: 0.8 }}>{num(s.points[s.points.length - 1].weight)}</span>
              <span class="wide" style={{ fontSize: '16px' }}>{s.per_hand ? 'КГ × 2' : 'КГ'}</span>
            </div>
            <Hud>{`${s.name} // РАБОЧИЙ ВЕС`}</Hud>
            <Spark points={s.points} />
            <div class="hud between"><span>{ddmm(s.points[0].date)}</span><span>{ddmm(s.points[s.points.length - 1].date)}</span></div>
          </section>
        </>
      ) : (
        <section class="outline">
          <Hud tag="ВЕСА">ПОКА ПУСТО</Hud>
          <p class="muted">После первых тренировок здесь появится рост рабочих весов.</p>
        </section>
      )}

      <section aria-labelledby="m-t" class="card">
        <h2 id="m-t" class="hud" style={{ margin: 0 }}>
          <span class="tag">[ЗАМЕРЫ] </span>РАЗ В МЕСЯЦ{nextM ? ` // СЛЕДУЮЩИЕ ${ddmm(nextM)}` : ''}
        </h2>
        {lastM ? (
          <div>
            {MEASURES.filter(([k]) => lastM[k] != null).map(([k, label]) => {
              const a = firstM[k];
              const b = lastM[k];
              const d = a != null && b != null && firstM !== lastM ? Math.round((b - a) * 10) / 10 : null;
              return (
                <div class="list-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto 52px' }}>
                  <span>{label}</span>
                  <span>{a != null && firstM !== lastM ? `${num(a)} → ${num(b)}` : num(b)}</span>
                  <span class="small muted" style={{ textAlign: 'right' }}>{d === null ? '' : d > 0 ? `+${num(d)}` : num(d) === '0' ? '0' : `-${num(-d)}`}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p class="muted small">Замеров пока нет. Первый замер сделай с Анастасией или сама, по одной и той же линии.</p>
        )}
        <Btn kind="dark" small onClick={() => setMeasure(true)}>Внести замеры</Btn>
      </section>

      {me.is_minor && !me.cycle_enabled ? null : me.cycle_enabled ? (
        <CycleCard me={me} days={data.cycle} onSettings={() => setCycleSet(true)} />
      ) : (
        <section class="outline">
          <Hud tag="ЦИКЛ">ВЫКЛЮЧЕН</Hud>
          <p class="muted small">Можно включить, чтобы видеть фазу и подсказки Анастасии.</p>
          <button class="link-btn" onClick={() => setCycleSet(true)}>Настройки цикла</button>
        </section>
      )}

      {measure && (
        <MeasureSheet
          onClose={() => setMeasure(false)}
          onSave={async (values) => {
            const row = await addMeasurement(me.id, values);
            setData((d) => ({ ...d, measurements: [...d.measurements, row].sort((a, b) => (a.date < b.date ? -1 : 1)) }));
            setMeasure(false);
            toast('Замеры сохранены.');
          }}
        />
      )}
      {cycleSet && (
        <CycleSheet
          me={me}
          onClose={() => setCycleSet(false)}
          onSave={async (en, share, contr) => {
            await setCycleSettings(en, share, contr);
            const p = await loadProfile(me.id);
            cacheSet('me', p);
            onMe(p);
            setCycleSet(false);
          }}
        />
      )}
    </div>
  );
}

function Spark({ points }) {
  const W = 350;
  const H = 100;
  const pad = 6;
  const ws = points.map((p) => p.weight);
  const min = Math.min(...ws);
  const max = Math.max(...ws);
  const xy = points.map((p, i) => [
    points.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (points.length - 1),
    pad + (H - 2 * pad) * (1 - (p.weight - min) / (max - min || 1)),
  ]);
  const last = xy[xy.length - 1];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Рост рабочего веса" style={{ display: 'block' }}>
      {[6, 50, 94].map((y) => (
        <line x1="0" y1={y} x2={W} y2={y} stroke="var(--line)" stroke-width="1" />
      ))}
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--ogonek)" stroke-width="2.5" />
      <circle cx={last[0]} cy={last[1]} r="5" fill="var(--ogonek)" />
    </svg>
  );
}

function CycleCard({ me, days, onSettings }) {
  const t = today();
  const info = cycleInfo(days, { today: t, contraception: me.contraception });
  const flow = new Map(days.map((d) => [d.date, d.flow]));
  const first = t.slice(0, 8) + '01';
  const lead = (parse(first).getDay() + 6) % 7;
  const dim = new Date(parse(first).getFullYear(), parse(first).getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(iso(new Date(parse(first).getFullYear(), parse(first).getMonth(), d)));
  return (
    <section aria-labelledby="c-t" class="card">
      <h2 id="c-t" class="hud" style={{ margin: 0 }}>
        <span class="tag">[ЦИКЛ] </span>
        {monthName(t).toUpperCase()}
        {info.known && !me.contraception ? ` // СРЕДНИЙ ${info.avg} ДНЕЙ` : ''}
      </h2>
      <div class="hud grid7 center">{WD.map((w) => <span>{w}</span>)}</div>
      <div class="cal">
        {cells.map((d) => {
          if (!d) return <span />;
          const f = flow.get(d);
          const cls = f === 1 ? 'p' : f === 2 ? 's' : d === t ? 't' : info.nextStart === d && !me.contraception ? 'n' : '';
          return <span class={cls}>{Number(d.slice(8))}</span>;
        })}
      </div>
      <div class="wrap" style={{ gap: '8px 16px', alignItems: 'center' }}>
        <span class="row small" style={{ gap: '6px' }}><span aria-hidden="true" style={{ width: '12px', height: '12px', background: 'var(--ogonek)' }} />Месячные</span>
        <span class="row small" style={{ gap: '6px' }}><span aria-hidden="true" style={{ width: '12px', height: '12px', boxShadow: 'inset 0 0 0 1px var(--ink)' }} />Сегодня</span>
        {info.known && info.nextStart && !me.contraception && <Hud>{`СЛЕДУЮЩИЕ ~${ddmm(info.nextStart)}`}</Hud>}
      </div>
      <p class="small muted">Отмечай месячные на главном экране. Прогноз примерный и не защищает от беременности.</p>
      <button class="link-btn" onClick={onSettings}>Настройки цикла</button>
    </section>
  );
}

function CycleSheet({ me, onClose, onSave }) {
  const [en, setEn] = useState(me.cycle_enabled);
  const [share, setShare] = useState(me.cycle_share);
  const [contr, setContr] = useState(me.contraception);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Цикл" onClose={onClose}>
      <label class="check"><input type="checkbox" checked={en} onChange={(e) => setEn(e.currentTarget.checked)} /><span>Вести цикл в приложении</span></label>
      <label class="check"><input type="checkbox" checked={share} disabled={!en} onChange={(e) => setShare(e.currentTarget.checked)} /><span>Показывать Анастасии фазу и дни месячных, чтобы она подстраивала тренировки</span></label>
      <label class="check"><input type="checkbox" checked={contr} disabled={!en} onChange={(e) => setContr(e.currentTarget.checked)} /><span>Принимаю гормональные контрацептивы (тогда фазы не считаем)</span></label>
      <Btn
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave(en, share, contr);
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

function MeasureSheet({ onClose, onSave }) {
  const [v, setV] = useState({});
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Замеры" onClose={onClose}>
      <p class="small muted">Заполни, что меряла. Остальное можно оставить пустым.</p>
      <div class="grid2" style={{ gap: '10px' }}>
        {MEASURES.map(([k, label]) => (
          <Field label={label.toUpperCase()} id={'m-' + k}>
            <input id={'m-' + k} class="input" inputMode="decimal" value={v[k] || ''} onInput={(e) => setV({ ...v, [k]: e.currentTarget.value })} />
          </Field>
        ))}
      </div>
      <Field label="КОММЕНТАРИЙ" id="m-c">
        <input id="m-c" class="input" value={v.comment || ''} onInput={(e) => setV({ ...v, comment: e.currentTarget.value })} />
      </Field>
      <Btn
        disabled={busy}
        onClick={async () => {
          const values = { date: today(), comment: v.comment || null };
          let any = false;
          for (const [k] of MEASURES) {
            values[k] = parseNum(v[k]);
            if (values[k] !== null) any = true;
          }
          if (!any) {
            toast('Впиши хотя бы один замер.');
            return;
          }
          setBusy(true);
          try {
            await onSave(values);
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
