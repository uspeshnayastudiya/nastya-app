import { useEffect, useState } from 'preact/hooks';
import { applyWeekTemplate, cacheGet, coachClients, deleteTemplate, exerciseNames, fromTemplate, lastWeights, saveTemplate, saveWorkout, templates, usageCounts, weekPlan } from '../lib/api.js';
import { addDays, plural, today, weekStart } from '../lib/dates.js';
import { schemeText } from '../lib/logic.js';
import { Back, Btn, errorText, Field, go, Hud, LoadError, Loading, Seg, Sheet, toast, Udar, useLoad } from '../ui/kit.jsx';
import { ExerciseSheet } from './ExerciseSheet.jsx';

const TITLES = ['Ноги', 'Верх', 'Ягодицы', 'Руки', 'Full body'];

export function Templates() {
  const [tab, setTab] = useState(() => sessionStorage.getItem('tpl-tab') || 'day');
  const [open, setOpen] = useState(0);
  const [applying, setApplying] = useState(null);
  const { data, loading, reload } = useLoad('templates', async () => ({ list: await templates(), usage: await usageCounts() }), []);
  if (!data && loading) return <div class="screen"><Loading /></div>;
  if (!data) return <div class="screen"><LoadError onRetry={reload} /></div>;
  const days = data.list.filter((x) => x.kind === 'day');
  const weeks = data.list.filter((x) => x.kind === 'week');
  const list = tab === 'day' ? days : weeks;
  const meta = (tpl) => {
    const used = data.usage[tpl.name];
    const ne = (tpl.exercises || []).length;
    const nd = (tpl.days || []).length;
    const base = tpl.kind === 'day'
      ? `${ne} ${plural(ne, 'УПРАЖНЕНИЕ', 'УПРАЖНЕНИЯ', 'УПРАЖНЕНИЙ')}`
      : `${nd} ${plural(nd, 'ТРЕНИРОВКА', 'ТРЕНИРОВКИ', 'ТРЕНИРОВОК')} // НА ОБЫЧНЫЕ ДНИ`;
    return used ? `${base} // У ${used} ${plural(used, 'КЛИЕНТКИ', 'КЛИЕНТОК', 'КЛИЕНТОК')}` : base;
  };
  const preview = (tpl) =>
    tpl.kind === 'day'
      ? (tpl.exercises || []).map((e) => e.name).join(', ')
      : (tpl.days || []).map((d) => days.find((x) => x.id === d)?.name || '?').join(', ');

  return (
    <div class="screen">
      <header class="stack" style={{ position: 'relative' }}>
        <div class="shtrih" style={{ width: '80px', height: '40px' }} />
        <Udar size={52} as="h1">Шаблоны</Udar>
        <Hud>ПРИМЕНЯЙ НА ДЕНЬ ИЛИ НА НЕДЕЛЮ // ПОТОМ ПОПРАВЬ ПОД КЛИЕНТКУ</Hud>
      </header>
      <Seg
        label="Тип шаблонов"
        value={tab}
        onChange={(v) => {
          setTab(v);
          setOpen(0);
          sessionStorage.setItem('tpl-tab', v);
        }}
        options={[{ value: 'day', label: `Тренировки (${days.length})` }, { value: 'week', label: `Недели (${weeks.length})` }]}
      />
      <Btn kind="light" icon="plus" href={tab === 'day' ? '#/template/new-day' : '#/template/new-week'}>Новый шаблон</Btn>

      <section aria-label="Список шаблонов" class="stack">
        {list.map((tpl, i) =>
          i === open ? (
            <div class="card hot">
              <button style={{ textAlign: 'left' }} aria-expanded="true" onClick={() => setOpen(-1)}>
                <span class="stack" style={{ gap: '4px' }}>
                  <span class="udar" style={{ fontSize: '28px' }}>{tpl.name}</span>
                  <Hud>{meta(tpl)}</Hud>
                </span>
              </button>
              <div>
                {tpl.kind === 'day'
                  ? (tpl.exercises || []).map((e) => (
                      <div class="list-row"><span>{e.name}</span><Hud>{schemeText(e).split(' // ')[0]}</Hud></div>
                    ))
                  : (tpl.days || []).map((d, k) => (
                      <div class="list-row"><span>День {k + 1}</span><Hud>{days.find((x) => x.id === d)?.name || 'удалён'}</Hud></div>
                    ))}
              </div>
              <div class="grid2">
                <Btn kind="dark" small center href={`#/template/${tpl.id}`}>Изменить</Btn>
                <Btn small center onClick={() => setApplying(tpl)}>Применить</Btn>
              </div>
            </div>
          ) : (
            <button class="card tight" style={{ textAlign: 'left', width: '100%' }} aria-expanded="false" onClick={() => setOpen(i)}>
              <span class="udar" style={{ fontSize: '24px' }}>{tpl.name}</span>
              <Hud>{meta(tpl)}</Hud>
              <span class="small muted">{preview(tpl)}</span>
            </button>
          ),
        )}
        {list.length === 0 && <p class="muted small">Пока пусто. Создай первый шаблон или сохрани тренировку клиентки как шаблон.</p>}
      </section>
      <Hud>ВЕСА ПРИ ПРИМЕНЕНИИ БЕРУТСЯ ИЗ ИСТОРИИ КЛИЕНТКИ</Hud>
      {applying && <ApplySheet tpl={applying} dayTpls={days} onClose={() => setApplying(null)} />}
    </div>
  );
}

function ApplySheet({ tpl, dayTpls, onClose }) {
  const [clients, setClients] = useState(() => (cacheGet('clients') || []).filter((c) => !c.archived));
  const [cid, setCid] = useState('');
  const t = today();
  const [date, setDate] = useState(tpl.kind === 'day' ? t : weekStart(t));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    coachClients().then((l) => setClients(l.filter((c) => !c.archived))).catch(() => {});
  }, []);
  const weekOpts = [0, 1, 2].map((n) => addDays(weekStart(t), 7 * n));
  async function apply() {
    const c = clients.find((x) => x.id === cid);
    if (!c) return toast('Выбери клиентку.');
    setBusy(true);
    try {
      const weights = await lastWeights(c.id);
      if (tpl.kind === 'day') {
        const existing = (await weekPlan(c.id, weekStart(date))).find((w) => w.date === date);
        if (existing && !confirm('На этот день уже есть тренировка. Заменить её шаблоном?')) return;
        await saveWorkout(c.id, { id: existing?.id, date, time: c.usual_time, title: tpl.title, from_template: tpl.name }, fromTemplate(tpl, weights));
        go(`client/${c.id}/program/${weekStart(date)}`);
      } else {
        const existing = await weekPlan(c.id, date);
        if (existing.length && !confirm('На этой неделе уже есть тренировки. Шаблон заменит их на обычные дни. Продолжить?')) return;
        await applyWeekTemplate(c, date, tpl, dayTpls, weights);
        go(`client/${c.id}/program/${date}`);
      }
      toast('Готово. Проверь и поправь под клиентку.');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={`Применить «${tpl.name}»`} onClose={onClose}>
      <Field label="КЛИЕНТКА" id="ap-c">
        <select id="ap-c" class="input" value={cid} onChange={(e) => setCid(e.currentTarget.value)}>
          <option value="">Выбери</option>
          {clients.map((c) => <option value={c.id}>{c.full_name}</option>)}
        </select>
      </Field>
      {tpl.kind === 'day' ? (
        <Field label="ДЕНЬ" id="ap-d">
          <input id="ap-d" class="input" type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </Field>
      ) : (
        <div class="field">
          <span class="hud">НЕДЕЛЯ</span>
          <Seg label="Неделя" value={date} onChange={setDate} options={weekOpts.map((w, i) => ({ value: w, label: ['Эта', 'Следующая', 'Через одну'][i] }))} />
        </div>
      )}
      <Btn disabled={busy || !cid} onClick={apply}>{busy ? 'Применяю...' : 'Применить'}</Btn>
    </Sheet>
  );
}

export function TemplateEdit({ id }) {
  const isNew = id === 'new-day' || id === 'new-week';
  const [all, setAll] = useState(null);
  const [tpl, setTpl] = useState(isNew ? { kind: id === 'new-week' ? 'week' : 'day', name: '', title: '', exercises: [], days: [] } : null);
  const [exEdit, setExEdit] = useState(null);
  const [names, setNames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [addDay, setAddDay] = useState('');

  useEffect(() => {
    templates().then((l) => {
      setAll(l);
      if (!isNew) setTpl(l.find((x) => x.id === id) || null);
    }).catch(() => setAll([]));
    exerciseNames().then(setNames).catch(() => {});
  }, [id]);

  if (!all || !tpl) return <div class="screen">{all && !tpl ? <p>Шаблон не найден.</p> : <Loading />}</div>;
  const dayTpls = all.filter((x) => x.kind === 'day');
  const set = (k, v) => setTpl((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!tpl.name.trim()) return toast('Впиши название шаблона.');
    if (tpl.kind === 'day' && !tpl.exercises.length) return toast('Добавь хотя бы одно упражнение.');
    if (tpl.kind === 'week' && !tpl.days.length) return toast('Добавь хотя бы одну тренировку.');
    setBusy(true);
    try {
      const row = { kind: tpl.kind, name: tpl.name.trim(), title: tpl.title || '', exercises: tpl.exercises, days: tpl.days };
      if (!isNew) row.id = tpl.id;
      await saveTemplate(row);
      sessionStorage.setItem('tpl-tab', tpl.kind);
      toast('Шаблон сохранён.');
      go('templates');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="screen">
      <Back href="#/templates">ШАБЛОНЫ</Back>
      <Udar size={44} as="h1">{isNew ? 'Новый шаблон' : 'Шаблон'}</Udar>
      <Hud>{tpl.kind === 'day' ? 'ТРЕНИРОВКА НА ДЕНЬ' : 'НЕДЕЛЯ: ТРЕНИРОВКИ ПО ПОРЯДКУ НА ОБЫЧНЫЕ ДНИ'}</Hud>
      <Field label="НАЗВАНИЕ ДЛЯ ТЕБЯ" id="t-name">
        <input id="t-name" class="input" value={tpl.name} onInput={(e) => set('name', e.currentTarget.value)} placeholder={tpl.kind === 'day' ? 'Ноги. Новичок' : 'Новичок 3 дня'} />
      </Field>

      {tpl.kind === 'day' ? (
        <>
          <div class="stack">
            <span class="hud">ЗАГОЛОВОК, ЕГО УВИДИТ КЛИЕНТКА</span>
            <div class="wrap">
              {TITLES.map((tt) => <button class="opt" aria-pressed={String(tpl.title === tt)} onClick={() => set('title', tt)}>{tt}</button>)}
            </div>
            <input class="input" aria-label="Свой заголовок" value={TITLES.includes(tpl.title) ? '' : tpl.title} onInput={(e) => set('title', e.currentTarget.value)} placeholder="Или свой" />
          </div>
          <div class="stack">
            {tpl.exercises.map((e, i) => (
              <div class="card tight" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '8px', alignItems: 'center' }}>
                <button style={{ textAlign: 'left' }} onClick={() => setExEdit({ i, ex: e })}>
                  <span class="stack" style={{ gap: '3px' }}>
                    <span style={{ fontWeight: 500 }}>{e.name}</span>
                    <Hud>{schemeText(e)}</Hud>
                  </span>
                </button>
                <span class="row" style={{ gap: '2px' }}>
                  <button class="opt" style={{ width: '40px', padding: 0 }} aria-label="Выше" disabled={i === 0} onClick={() => set('exercises', swap(tpl.exercises, i, i - 1))}>↑</button>
                  <button class="opt" style={{ width: '40px', padding: 0 }} aria-label="Ниже" disabled={i === tpl.exercises.length - 1} onClick={() => set('exercises', swap(tpl.exercises, i, i + 1))}>↓</button>
                </span>
              </div>
            ))}
            <Btn kind="line" small center srez={false} onClick={() => setExEdit({ i: null, ex: null })}>+ Упражнение</Btn>
          </div>
        </>
      ) : (
        <div class="stack">
          {tpl.days.map((d, i) => (
            <div class="card tight" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '8px', alignItems: 'center' }}>
              <span class="stack" style={{ gap: '3px' }}>
                <Hud>{`ДЕНЬ ${i + 1}`}</Hud>
                <span style={{ fontWeight: 500 }}>{dayTpls.find((x) => x.id === d)?.name || 'Шаблон удалён'}</span>
              </span>
              <span class="row" style={{ gap: '2px' }}>
                <button class="opt" style={{ width: '40px', padding: 0 }} aria-label="Выше" disabled={i === 0} onClick={() => set('days', swap(tpl.days, i, i - 1))}>↑</button>
                <button class="opt" style={{ width: '40px', padding: 0 }} aria-label="Убрать" onClick={() => set('days', tpl.days.filter((_, k) => k !== i))}>×</button>
              </span>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '6px' }}>
            <select class="input" aria-label="Тренировка" value={addDay} onChange={(e) => setAddDay(e.currentTarget.value)}>
              <option value="">Выбери тренировку</option>
              {dayTpls.map((x) => <option value={x.id}>{x.name}</option>)}
            </select>
            <Btn small style={{ width: 'auto' }} disabled={!addDay} onClick={() => { set('days', [...tpl.days, addDay]); setAddDay(''); }}>Добавить</Btn>
          </div>
          {dayTpls.length === 0 && <p class="small muted">Сначала создай шаблоны тренировок на день.</p>}
        </div>
      )}

      <Btn icon="da" disabled={busy} onClick={save}>Сохранить шаблон</Btn>
      {!isNew && (
        <button
          class="link-btn"
          style={{ color: 'var(--ogonek)' }}
          onClick={async () => {
            if (!confirm('Удалить шаблон? Тренировки клиенток, уже расписанные по нему, останутся.')) return;
            try {
              await deleteTemplate(tpl.id);
              toast('Шаблон удалён.');
              go('templates');
            } catch (e) {
              toast(errorText(e));
            }
          }}
        >
          Удалить шаблон
        </button>
      )}

      {exEdit && (
        <ExerciseSheet
          ex={exEdit.ex}
          withWeight={false}
          names={names}
          onClose={() => setExEdit(null)}
          onDelete={exEdit.i !== null ? () => { set('exercises', tpl.exercises.filter((_, k) => k !== exEdit.i)); setExEdit(null); } : null}
          onSave={(ex) => {
            const clean = { name: ex.name, sets: ex.sets, reps_min: ex.reps_min, reps_max: ex.reps_max, unit: ex.unit, per_hand: ex.per_hand, step: ex.step };
            const list = tpl.exercises.slice();
            if (exEdit.i === null) list.push(clean);
            else list[exEdit.i] = clean;
            set('exercises', list);
            setExEdit(null);
          }}
        />
      )}
    </div>
  );
}

function swap(arr, a, b) {
  const x = arr.slice();
  [x[a], x[b]] = [x[b], x[a]];
  return x;
}
