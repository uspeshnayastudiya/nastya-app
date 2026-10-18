import { useEffect, useRef, useState } from 'preact/hooks';
import {
  applyWeekTemplate, clearWeightChange, deleteWorkout, exerciseNames, fromTemplate, lastWeights, loadProfile,
  moveWorkout, nearestPlanned, repeatWeek, revertWeight, saveTemplate, saveWorkout, templates, weekPlan,
} from '../lib/api.js';
import { addDays, ddmm, today, WD, weekday, weekLabel, weekStart } from '../lib/dates.js';
import { firstName, num, schemeText, weightText } from '../lib/logic.js';
import { Back, Btn, Corners, errorText, Field, Hud, Icon, LoadError, Loading, Sheet, toast, Udar, useLoad } from '../ui/kit.jsx';
import { ExerciseSheet } from './ExerciseSheet.jsx';

const TITLES = ['Ноги', 'Верх', 'Ягодицы', 'Руки', 'Full body'];

export function Program({ id, start: startParam }) {
  const t = today();
  const [start, setStart] = useState(startParam || weekStart(t));
  const [sel, setSel] = useState(() => (weekStart(t) === (startParam || weekStart(t)) ? t : startParam));
  const { data, loading, reload } = useLoad(
    'week:' + id + ':' + start,
    async () => {
      const [c, week, tpls] = await Promise.all([loadProfile(id), weekPlan(id, start), templates()]);
      return { c, week, tpls };
    },
    [id, start],
  );
  const [draft, setDraft] = useState(null);
  const dirty = useRef(false);
  const [picker, setPicker] = useState(null);
  const [exEdit, setExEdit] = useState(null);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState([]);

  useEffect(() => {
    exerciseNames().then(setNames).catch(() => {});
  }, []);

  useEffect(() => {
    if (!data || dirty.current) return;
    const w = data.week.find((x) => x.date === sel);
    setDraft(w ? { ...w, exercises: w.exercises.map((e) => ({ ...e })) } : null);
  }, [data, sel]);

  if (!data && loading) return <div class="screen"><Loading /></div>;
  if (!data) return <div class="screen"><LoadError onRetry={reload} /></div>;

  const c = data.c;
  const dayTpls = data.tpls.filter((x) => x.kind === 'day');
  const weekTpls = data.tpls.filter((x) => x.kind === 'week');
  const planned = data.week.map((w) => `${WD[weekday(w.date)]} ${w.title || '...'}`);

  function edit(fn) {
    dirty.current = true;
    setDraft((d) => fn(d));
  }
  function pick(date) {
    if (dirty.current && !confirm('Изменения в этом дне не сохранены. Перейти без сохранения?')) return;
    dirty.current = false;
    setPicker(null);
    setSel(date);
    const w = data.week.find((x) => x.date === date);
    setDraft(w ? { ...w, exercises: w.exercises.map((e) => ({ ...e })) } : null);
  }
  function shiftWeek(n) {
    if (dirty.current && !confirm('Изменения не сохранены. Перейти без сохранения?')) return;
    dirty.current = false;
    const ns = addDays(start, 7 * n);
    setStart(ns);
    setSel(addDays(ns, weekday(sel)));
    setDraft(null);
  }
  async function afterChange(msg, date = sel) {
    dirty.current = false;
    await reload();
    if (date !== sel) setSel(date);
    if (msg) toast(msg);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      await saveWorkout(id, { ...draft, date: sel, time: draft.time || c.usual_time }, draft.exercises);
      await afterChange(`Сохранено. ${firstName(c.full_name)} увидит сразу.`);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function applyDay(tpl) {
    setBusy(true);
    try {
      const weights = await lastWeights(id);
      edit((d) => ({
        ...(d || {}),
        date: sel,
        time: d?.time || c.usual_time,
        title: tpl.title,
        from_template: tpl.name,
        exercises: fromTemplate(tpl, weights),
      }));
      setPicker(null);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function applyWeek(tpl) {
    if (data.week.length && !confirm('На этой неделе уже есть тренировки. Шаблон заменит их на обычные дни клиентки. Продолжить?')) return;
    setBusy(true);
    try {
      const weights = await lastWeights(id);
      await applyWeekTemplate(c, start, tpl, dayTpls, weights);
      setPicker(null);
      const first = addDays(start, [...(c.usual_days?.length ? c.usual_days : [0, 2, 4])].sort()[0]);
      await afterChange('Неделя расписана по шаблону.', first);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function repeat() {
    setBusy(true);
    try {
      const n = await repeatWeek(id, start);
      toast(n ? `Скопировано на следующую неделю: ${n}.` : 'На следующей неделе эти дни уже заняты.');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function moveHere() {
    setBusy(true);
    try {
      const w = await nearestPlanned(id, sel);
      if (!w) {
        toast('Рядом нет невыполненных тренировок.');
        return;
      }
      if (!confirm(`Перенести «${w.title || 'тренировку'}» с ${ddmm(w.date)} на ${ddmm(sel)}?`)) return;
      await moveWorkout(w.id, sel);
      await afterChange('Перенесено.');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function keepChange(ex) {
    try {
      await clearWeightChange(ex.id);
      setDraft((d) => ({ ...d, exercises: d.exercises.map((e) => (e.id === ex.id ? { ...e, weight_change: null } : e)) }));
      toast('Оставили новый вес.');
    } catch (e) {
      toast(errorText(e));
    }
  }
  async function revertChange(ex) {
    const from = Number(ex.weight_change.from);
    try {
      await revertWeight(ex.id, from);
      setDraft((d) => ({ ...d, exercises: d.exercises.map((e) => (e.id === ex.id ? { ...e, weight: from, weight_change: null } : e)) }));
      toast(`Вернули ${num(from)} кг.`);
    } catch (e) {
      toast(errorText(e));
    }
  }

  async function saveAsTemplate() {
    const name = prompt('Название шаблона', draft.title ? `${draft.title}. ${firstName(c.full_name)}` : '');
    if (!name || !name.trim()) return;
    try {
      await saveTemplate({
        kind: 'day',
        name: name.trim(),
        title: draft.title || '',
        exercises: draft.exercises.map(({ name: n, sets, reps_min, reps_max, unit, per_hand, step }) => ({ name: n, sets, reps_min, reps_max, unit, per_hand, step })),
      });
      toast('Шаблон сохранён.');
    } catch (e) {
      toast(errorText(e));
    }
  }

  function bumpWeight(i, dir) {
    edit((d) => {
      const ex = d.exercises[i];
      const step = Number(ex.step) || (ex.per_hand ? 1 : 2.5);
      const w = Math.max(0, Math.round(((Number(ex.weight) || 0) + dir * step) * 100) / 100);
      const list = d.exercises.slice();
      list[i] = { ...ex, weight: w };
      return { ...d, exercises: list };
    });
  }

  const usual = (i) => (c.usual_days || []).includes(i);

  return (
    <div class="screen">
      <Back href={`#/client/${id}`}>{c.full_name}</Back>
      <Udar size={52} as="h1">Программа</Udar>
      <Hud>{[c.full_name, (c.usual_days || []).length ? 'ОБЫЧНО ' + c.usual_days.map((d) => WD[d]).join(' ') : '', c.usual_time].filter(Boolean).join(' // ')}</Hud>

      <section aria-label="Неделя" class="stack">
        <div class="between">
          <button aria-label="Прошлая неделя" class="hud-btn" style={{ width: '44px', justifyContent: 'center' }} onClick={() => shiftWeek(-1)}><Icon name="arrow" size={16} rotate={180} /></button>
          <Hud style={{ color: 'var(--ink)' }}>{weekLabel(start).toUpperCase()}</Hud>
          <button aria-label="Следующая неделя" class="hud-btn" style={{ width: '44px', justifyContent: 'center' }} onClick={() => shiftWeek(1)}><Icon name="arrow" size={16} /></button>
        </div>
        <div class="grid7">
          {WD.map((wd, i) => {
            const date = addDays(start, i);
            const w = data.week.find((x) => x.date === date);
            return (
              <button
                class={'day' + (usual(i) ? ' usual' : '')}
                aria-pressed={String(date === sel)}
                aria-label={`${wd} ${ddmm(date)}${w ? ', ' + (w.title || 'тренировка') : ', нет тренировки'}`}
                onClick={() => pick(date)}
              >
                <span class="hud">{wd}</span>
                <span class="udar" style={{ fontSize: '24px' }}>{Number(date.slice(8))}</span>
                {w && <span class="mark" style={w.status === 'done' ? { background: 'var(--laym)' } : null} />}
              </button>
            );
          })}
        </div>
        <div class="wrap" style={{ gap: '8px 16px', alignItems: 'center' }}>
          <span class="row small" style={{ gap: '6px' }}><span aria-hidden="true" style={{ width: '14px', height: '14px', background: 'var(--raised)', boxShadow: 'inset 0 0 0 1px var(--dim)' }} />Обычно ходит</span>
          <span class="row small" style={{ gap: '6px' }}><span aria-hidden="true" style={{ width: '14px', height: '3px', background: 'var(--ogonek)' }} />Тренировка</span>
          <span class="row small" style={{ gap: '6px' }}><span aria-hidden="true" style={{ width: '14px', height: '3px', background: 'var(--laym)' }} />Сделана</span>
        </div>
        <Hud style={{ color: 'var(--ink)' }}>{'На неделе: ' + (planned.length ? planned.join(' // ') : 'пусто')}</Hud>
        <div class="wrap" style={{ gap: '0 18px' }}>
          <button class="hud hud-btn" style={{ color: 'var(--ogonek)' }} disabled={busy} onClick={() => setPicker('week')}>НЕДЕЛЯ ИЗ ШАБЛОНА</button>
          <button class="hud hud-btn" style={{ color: 'var(--muted)' }} disabled={busy || !data.week.length} onClick={repeat}>ПОВТОРИТЬ НА СЛЕДУЮЩЕЙ</button>
        </div>
      </section>

      {picker && (
        <section class="card hot" aria-label="Выбор шаблона">
          <div class="between">
            <h2 class="h3">{picker === 'day' ? `Шаблон на ${WD[weekday(sel)]} ${ddmm(sel)}` : 'Шаблон на неделю'}</h2>
            <button class="hud hud-btn" onClick={() => setPicker(null)}>ОТМЕНА</button>
          </div>
          {(picker === 'day' ? dayTpls : weekTpls).map((tpl) => (
            <button
              disabled={busy}
              onClick={() => (picker === 'day' ? applyDay(tpl) : applyWeek(tpl))}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '12px', alignItems: 'center', textAlign: 'left', minHeight: '52px', padding: '8px 12px', background: 'var(--zhelezo)' }}
            >
              <span class="stack" style={{ gap: '3px' }}>
                <span style={{ fontWeight: 500 }}>{tpl.name}</span>
                <Hud>
                  {picker === 'day'
                    ? `${(tpl.exercises || []).length} УПР // ЗАГОЛОВОК: ${tpl.title || 'НЕТ'}`
                    : (tpl.days || []).map((d) => dayTpls.find((x) => x.id === d)?.title || '?').join(' // ')}
                </Hud>
              </span>
              <Icon name="arrow" size={14} color="var(--muted)" />
            </button>
          ))}
          {(picker === 'day' ? dayTpls : weekTpls).length === 0 && <p class="small muted">Шаблонов пока нет. Создай их во вкладке «Шаблоны».</p>}
          <Hud>{picker === 'day' ? 'ВЕСА ПОДСТАВЯТСЯ ИЗ ИСТОРИИ КЛИЕНТКИ' : 'ЛЯЖЕТ НА ОБЫЧНЫЕ ДНИ // ВЕСА ИЗ ИСТОРИИ'}</Hud>
        </section>
      )}

      {!picker && draft && (
        <section aria-label="Тренировка дня" class="stack-12">
          <div class="stack" style={{ gap: '6px' }}>
            <div class="between">
              <Hud>{`${WD[weekday(sel)]} ${ddmm(sel)}${draft.status === 'done' ? ' // СДЕЛАНА' : ''}`}</Hud>
              <input
                type="time"
                aria-label="Время"
                class="input"
                style={{ width: '120px', minHeight: '36px' }}
                value={draft.time || c.usual_time || ''}
                onInput={(e) => edit((d) => ({ ...d, time: e.currentTarget.value }))}
              />
            </div>
            <h2 class="udar" style={{ fontSize: '44px' }}>{draft.title || 'Без заголовка'}</h2>
            {draft.from_template && <Hud style={{ color: 'var(--laym)' }}>{`ИЗ ШАБЛОНА «${draft.from_template}»`}</Hud>}
          </div>
          <div class="stack">
            <span id="tt" class="hud">ЗАГОЛОВОК, ЕГО УВИДИТ КЛИЕНТКА</span>
            <div role="group" aria-labelledby="tt" class="wrap">
              {TITLES.map((tt) => (
                <button class="opt" aria-pressed={String(draft.title === tt)} onClick={() => edit((d) => ({ ...d, title: tt }))}>{tt}</button>
              ))}
            </div>
            <input
              class="input"
              aria-label="Свой заголовок"
              value={TITLES.includes(draft.title) ? '' : draft.title || ''}
              onInput={(e) => edit((d) => ({ ...d, title: e.currentTarget.value }))}
              placeholder="Или свой: Спина и плечи"
            />
          </div>

          <div class="stack">
            {draft.exercises.map((ex, i) => {
              const changed = ex.weight_change?.by === 'client';
              const body = (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '12px', alignItems: 'center' }}>
                    <button style={{ textAlign: 'left' }} onClick={() => setExEdit({ i, ex })} aria-label={`Изменить: ${ex.name}`}>
                      <span class="stack" style={{ gap: '4px' }}>
                        <span style={{ fontWeight: 500 }}>{ex.name}</span>
                        <Hud>{schemeText(ex)}</Hud>
                      </span>
                    </button>
                    {ex.unit === 'kg' ? (
                      <span class="row" style={{ gap: 0 }}>
                        <button class="opt" style={{ width: '40px', padding: 0, fontSize: '18px' }} aria-label="Уменьшить вес" onClick={() => bumpWeight(i, -1)}>−</button>
                        <span style={{ minWidth: '76px', textAlign: 'center', fontWeight: 700 }}>{weightText(ex)}</span>
                        <button class="opt" style={{ width: '40px', padding: 0, fontSize: '18px' }} aria-label="Увеличить вес" onClick={() => bumpWeight(i, 1)}>+</button>
                      </span>
                    ) : (
                      <Hud>{weightText(ex)}</Hud>
                    )}
                  </div>
                  {changed && (
                    <div style={{ background: 'var(--zhelezo)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <Hud style={{ color: 'var(--ink)' }}>
                        <span class="tag">{`[ИЗМЕНИЛА ${firstName(c.full_name).toUpperCase()}] `}</span>
                        {`${num(ex.weight_change.from)} → ${num(ex.weight_change.to)} // ${ddmm(String(ex.weight_change.at).slice(0, 10))}`}
                      </Hud>
                      <div class="grid2">
                        <Btn kind="laym" small center onClick={() => keepChange(ex)}>Оставить</Btn>
                        <Btn kind="black" small center onClick={() => revertChange(ex)}>Вернуть {num(ex.weight_change.from)} кг</Btn>
                      </div>
                    </div>
                  )}
                </>
              );
              return changed ? (
                <Corners style={{ background: 'var(--raised)', padding: '16px', margin: '6px 0' }}>{body}</Corners>
              ) : (
                <div class="card tight">{body}</div>
              );
            })}
            {draft.exercises.length === 0 && <Hud style={{ padding: '8px 0' }}>ДОБАВЬ УПРАЖНЕНИЯ ИЛИ ВОЗЬМИ ИЗ ШАБЛОНА</Hud>}
          </div>

          <div class="grid3">
            <Btn kind="line" small center srez={false} onClick={() => setExEdit({ i: null, ex: null })}>+ Упражнение</Btn>
            <Btn kind="line" small center srez={false} style={{ boxShadow: 'inset 0 0 0 1px var(--ogonek)' }} onClick={() => setPicker('day')}>Из шаблона</Btn>
            <Btn kind="line" small center srez={false} disabled={!draft.id} onClick={() => setMoving(true)}>Перенести</Btn>
          </div>

          <div class="stack">
            <Btn icon="da" disabled={busy} onClick={save}>{busy ? 'Сохраняю...' : 'Сохранить'}</Btn>
            <div class="between">
              <Hud style={dirty.current ? { color: 'var(--ogonek)' } : null}>{dirty.current ? 'ЕСТЬ НЕСОХРАНЁННЫЕ ИЗМЕНЕНИЯ' : `${firstName(c.full_name).toUpperCase()} УВИДИТ СРАЗУ`}</Hud>
              <button class="hud hud-btn" disabled={!draft.exercises.length} onClick={saveAsTemplate}>В ШАБЛОНЫ</button>
            </div>
            {draft.id && (
              <button
                class="link-btn"
                onClick={async () => {
                  if (!confirm('Удалить тренировку этого дня?')) return;
                  try {
                    await deleteWorkout(draft.id);
                    setDraft(null);
                    await afterChange('Тренировка удалена.');
                  } catch (e) {
                    toast(errorText(e));
                  }
                }}
              >
                Удалить тренировку
              </button>
            )}
          </div>
        </section>
      )}

      {!picker && !draft && (
        <section aria-label="День без тренировки" class="card">
          <Hud>{`${WD[weekday(sel)]} ${ddmm(sel)}`}</Hud>
          <span class="h2">Тренировки нет</span>
          <p class="small muted">Если {firstName(c.full_name)} придёт в этот день, возьми шаблон, назначь пустую или перенеси сюда ближайшую.</p>
          <Btn onClick={() => setPicker('day')}>Из шаблона</Btn>
          <div class="grid2">
            <Btn kind="dark" small center srez={false} onClick={() => edit(() => ({ date: sel, time: c.usual_time, title: '', exercises: [] }))}>Пустая</Btn>
            <Btn kind="dark" small center srez={false} disabled={busy} onClick={moveHere}>Перенести сюда</Btn>
          </div>
        </section>
      )}

      {exEdit && (
        <ExerciseSheet
          ex={exEdit.ex}
          names={names}
          onClose={() => setExEdit(null)}
          onDelete={exEdit.i !== null ? () => {
            edit((d) => ({ ...d, exercises: d.exercises.filter((_, k) => k !== exEdit.i) }));
            setExEdit(null);
          } : null}
          onSave={(ex) => {
            edit((d) => {
              const list = d.exercises.slice();
              if (exEdit.i === null) list.push(ex);
              else list[exEdit.i] = ex;
              return { ...d, exercises: list };
            });
            setExEdit(null);
          }}
        />
      )}
      {moving && (
        <MoveSheet
          from={sel}
          busy={busy}
          onClose={() => setMoving(false)}
          onMove={async (date) => {
            if (data.week.some((w) => w.date === date)) {
              toast('На эту дату уже есть тренировка.');
              return;
            }
            setBusy(true);
            try {
              await moveWorkout(draft.id, date);
              setMoving(false);
              const ns = weekStart(date);
              dirty.current = false;
              if (ns !== start) {
                setStart(ns);
                setSel(date);
                toast(`Перенесено на ${ddmm(date)}.`);
              } else {
                await afterChange(`Перенесено на ${ddmm(date)}.`, date);
              }
            } catch (e) {
              toast(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function MoveSheet({ from, onClose, onMove, busy }) {
  const [date, setDate] = useState(addDays(from, 1));
  return (
    <Sheet title="Перенести тренировку" onClose={onClose}>
      <Field label="НА КАКОЙ ДЕНЬ" id="mv-date">
        <input id="mv-date" class="input" type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
      </Field>
      <Btn disabled={busy || !date || date === from} onClick={() => onMove(date)}>Перенести на {ddmm(date)}</Btn>
    </Sheet>
  );
}
