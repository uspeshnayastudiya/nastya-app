import { useEffect, useMemo, useState } from 'preact/hooks';
import { cacheGet, clientHome, finishWorkout, logSet, removeSet, setFeel, setWeight, workoutDetail } from '../lib/api.js';
import { today } from '../lib/dates.js';
import { num, parseNum, progression, repsText, schemeText, upcoming, weightText } from '../lib/logic.js';
import { Btn, Corners, go, Hud, Icon, LoadError, Loading, Offline, Sheet, toast, Udar, useLoad } from '../ui/kit.jsx';

const FEELS = [
  ['easy', 'Легко'],
  ['ok', 'Норм'],
  ['hard', 'Тяжело'],
  ['pain', 'Было больно'],
];

export function Workout({ me, id, queued }) {
  const [wid, setWid] = useState(id || null);
  const [resolving, setResolving] = useState(!id);

  useEffect(() => {
    if (id) {
      setWid(id);
      setResolving(false);
      return;
    }
    const cached = cacheGet('home');
    const pick = (home) => upcoming(home.workouts, today()).current?.id || null;
    if (cached) setWid(pick(cached));
    clientHome(me.id)
      .then((h) => setWid(pick(h)))
      .catch(() => {})
      .finally(() => setResolving(false));
  }, [id]);

  if (!wid) {
    if (resolving) return <div class="screen"><Loading /></div>;
    return (
      <div class="screen">
        <Udar size={48}>Тренировки</Udar>
        <p class="muted">Ближайших тренировок пока нет. Анастасия распишет их, и они появятся здесь.</p>
      </div>
    );
  }
  return <WorkoutView key={wid} me={me} id={wid} queued={queued} />;
}

function WorkoutView({ me, id, queued }) {
  const { data, setData, loading, stale, reload } = useLoad('workout:' + id, () => workoutDetail(id), [id]);
  const [idx, setIdx] = useState(null);
  const [reps, setReps] = useState('');
  const [editW, setEditW] = useState(false);

  const exercises = data?.exercises || [];
  const logsFor = (exId) => (data?.logs || []).filter((l) => l.exercise_id === exId).sort((a, b) => a.set_no - b.set_no);

  const firstOpen = useMemo(() => {
    const i = exercises.findIndex((e) => logsFor(e.id).length < e.sets);
    return i === -1 ? Math.max(exercises.length - 1, 0) : i;
  }, [data?.workout?.id]);
  const cur = idx === null ? firstOpen : idx;
  const ex = exercises[cur];
  const done = ex ? logsFor(ex.id) : [];
  const setNo = done.length + 1;
  const hist = ex ? data.history[ex.name] : null;
  const hint = ex ? progression(ex, hist) : 'none';

  useEffect(() => {
    if (ex) setReps(String(ex.reps_max || ex.reps_min || ''));
  }, [ex?.id, setNo]);

  if (!data && loading) return <div class="screen"><Loading /></div>;
  if (!data) return <div class="screen"><LoadError onRetry={reload} /></div>;
  const w = data.workout;
  if (!exercises.length) {
    return (
      <div class="screen">
        <Udar size={48}>{w.title || 'Тренировка'}</Udar>
        <p class="muted">Анастасия ещё не добавила упражнения в эту тренировку.</p>
      </div>
    );
  }

  const isDone = w.status === 'done';
  const exDone = (e) => logsFor(e.id).length >= e.sets;
  const allDone = exercises.every(exDone);

  function patchExercise(exId, values) {
    setData((d) => ({ ...d, exercises: d.exercises.map((e) => (e.id === exId ? { ...e, ...values } : e)) }));
  }

  function addSet() {
    const r = parseInt(reps, 10);
    if (!Number.isFinite(r) || r <= 0) {
      toast('Впиши, сколько повторов получилось.');
      return;
    }
    const weight = ex.unit === 'kg' ? ex.weight : null;
    const row = { exercise_id: ex.id, set_no: setNo, reps: r, weight };
    setData((d) => ({ ...d, logs: [...d.logs.filter((l) => !(l.exercise_id === ex.id && l.set_no === setNo)), row] }));
    logSet(me.id, ex.id, setNo, r, weight);
    if (setNo >= ex.sets) {
      toast('Упражнение сделано. Отметь, как ощущалось.');
    }
  }

  function undoSet() {
    const last = done[done.length - 1];
    if (!last) return;
    setData((d) => ({ ...d, logs: d.logs.filter((l) => !(l.exercise_id === ex.id && l.set_no === last.set_no)) }));
    removeSet(ex.id, last.set_no);
  }

  function chooseFeel(f) {
    patchExercise(ex.id, { feel: f });
    setFeel(ex.id, f);
  }

  function applyWeight(v) {
    const prev = ex.weight;
    const change = { by: 'client', from: ex.weight_change?.from ?? prev, to: v, at: new Date().toISOString() };
    patchExercise(ex.id, { weight: v, weight_change: Number(change.from) === Number(v) ? null : change });
    setWeight(ex.id, v);
    setEditW(false);
  }

  function finish() {
    setData((d) => ({ ...d, workout: { ...d.workout, status: isDone ? 'planned' : 'done' } }));
    finishWorkout(w.id, !isDone);
    if (!isDone) {
      toast('Тренировка сохранена. Отличная работа.');
      go('today');
    }
  }

  const delta = hist && hist.weight != null && ex.weight != null ? Number(ex.weight) - Number(hist.weight) : 0;
  const lastSummary = hist && hist.sets.length ? `${hist.sets.length} × ${Math.max(...hist.sets.map((s) => s.reps || 0))} на ${num(hist.weight)} кг` : null;

  return (
    <div class="screen">
      <Offline stale={stale} queued={queued} />
      <header class="stack">
        <div class="between">
          <Hud>{`${w.title || 'ТРЕНИРОВКА'} // УПРАЖНЕНИЕ ${cur + 1} ИЗ ${exercises.length}`}</Hud>
          <button class="hud hud-btn" onClick={finish}>{isDone ? 'ОТКРЫТЬ СНОВА' : 'ЗАВЕРШИТЬ'}</button>
        </div>
        <div aria-label="Упражнения" style={{ display: 'grid', gridTemplateColumns: `repeat(${exercises.length}, minmax(0, 1fr))`, gap: '4px' }}>
          {exercises.map((e, i) => (
            <button
              aria-label={`Упражнение ${i + 1}: ${e.name}`}
              onClick={() => setIdx(i)}
              style={{ height: '18px', display: 'flex', alignItems: 'center' }}
            >
              <span style={{ display: 'block', width: '100%', height: i === cur ? '6px' : '4px', background: exDone(e) || i === cur ? 'var(--ogonek)' : 'var(--zhelezo)', opacity: i === cur || exDone(e) ? 1 : 1 }} />
            </button>
          ))}
        </div>
      </header>

      <div class="stack">
        <h1 class="udar" style={{ fontSize: ex.name.length > 22 ? '40px' : '48px' }}>{ex.name}</h1>
        <Hud>{schemeText(ex)}</Hud>
      </div>

      {ex.unit === 'kg' && (
        <Corners>
          <Hud>ВЕС НА СЕГОДНЯ</Hud>
          <div class="row" style={{ alignItems: 'baseline' }}>
            {ex.weight != null ? (
              <>
                {ex.per_hand && <span class="udar" style={{ fontSize: '40px' }}>2 ×</span>}
                <span class="udar" style={{ fontSize: '92px', lineHeight: 0.8 }}>{num(ex.weight)}</span>
                <span class="wide" style={{ fontSize: '18px' }}>КГ</span>
              </>
            ) : (
              <span class="udar" style={{ fontSize: '44px' }}>Задать</span>
            )}
          </div>
          {delta > 0 && (
            <span class="srez hud" style={{ alignSelf: 'flex-start', background: 'var(--laym)', color: '#0a0a0a', padding: '6px 16px 6px 10px', display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
              <Icon name="arrow" size={12} rotate={-90} />+{num(delta)} КГ К ПРОШЛОМУ РАЗУ
            </span>
          )}
          {lastSummary && (
            <p class="small muted">
              В прошлый раз {lastSummary}
              {hint === 'up' && delta <= 0 && ex.step ? `, и было ${hist.feel === 'easy' ? 'легко' : 'нормально'}. Можно добавить ${num(ex.step)} кг.` : ''}
              {hint === 'up' && delta > 0 ? '.' : ''}
              {hint === 'keep' ? '. Держим вес.' : ''}
              {hint === 'down' ? '. Было больно: снизь вес и скажи Анастасии.' : ''}
            </p>
          )}
          {hint === 'up' && delta <= 0 && ex.step && ex.weight != null && (
            <Btn kind="laym" small onClick={() => applyWeight(Number(ex.weight) + Number(ex.step))}>
              Добавить {num(ex.step)} кг
            </Btn>
          )}
        </Corners>
      )}

      {ex.unit === 'kg' && (
        <div class="between" style={{ background: 'var(--raised)', padding: '12px 14px' }}>
          <div class="stack" style={{ gap: '4px' }}>
            {ex.weight_change?.by === 'client' ? (
              <>
                <Hud tag="ВЕС ИЗМЕНЁН">{`${num(ex.weight_change.from)} → ${num(ex.weight_change.to)} КГ`}</Hud>
                <span class="small muted">Анастасия увидит и поправит, если что</span>
              </>
            ) : (
              <>
                <Hud>ВЕС ОТ АНАСТАСИИ</Hud>
                <span class="small muted">Тяжело или легко? Можно поменять</span>
              </>
            )}
          </div>
          <Btn kind="dark" small srez style={{ width: 'auto', flex: 'none' }} onClick={() => setEditW(true)}>Изменить вес</Btn>
        </div>
      )}

      <section aria-label="Подходы" class="stack" style={{ gap: '6px' }}>
        <div class="hud" style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) minmax(0,1fr) 52px', gap: '8px', padding: '0 12px' }}>
          <span>№</span>
          <span>{ex.unit === 'sec' ? 'СЕКУНДЫ' : 'ПОВТОРЫ'}</span>
          <span>{ex.unit === 'kg' ? 'ВЕС' : ''}</span>
          <span />
        </div>
        {Array.from({ length: ex.sets }, (_, i) => {
          const n = i + 1;
          const log = done.find((l) => l.set_no === n);
          const active = !log && n === setNo;
          return (
            <div
              style={{
                display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) minmax(0,1fr) 52px', gap: '8px', alignItems: 'center',
                minHeight: '52px', padding: '0 12px',
                background: log || active ? 'var(--raised)' : 'transparent',
                boxShadow: active ? 'inset 0 0 0 1px var(--ogonek)' : log ? 'none' : 'inset 0 0 0 1px var(--line)',
              }}
            >
              <span class="udar" style={{ fontSize: '26px', color: active ? 'var(--ogonek)' : 'var(--muted)' }}>{n}</span>
              {active ? (
                <input
                  class="input"
                  inputMode="numeric"
                  aria-label={`Повторы в подходе ${n}`}
                  value={reps}
                  onInput={(e) => setReps(e.currentTarget.value.replace(/\D/g, ''))}
                  style={{ width: '72px', minHeight: '40px', background: 'var(--zhelezo)', boxShadow: 'none' }}
                />
              ) : (
                <span style={{ color: log ? 'var(--ink)' : 'var(--muted)' }}>{log ? log.reps : repsText(ex)}</span>
              )}
              <span style={{ color: log ? 'var(--ink)' : 'var(--muted)' }}>{ex.unit === 'kg' ? weightText(log ? { ...ex, weight: log.weight ?? ex.weight } : ex) : ''}</span>
              <span style={{ justifySelf: 'end' }}>
                {log ? <Icon name="da" size={20} color="var(--laym)" label="Сделано" /> : active ? <Hud style={{ color: 'var(--ogonek)' }}>СЕЙЧАС</Hud> : null}
              </span>
            </div>
          );
        })}
        {done.length > 0 && (
          <button class="link-btn" onClick={undoSet}>Отменить последний подход</button>
        )}
      </section>

      {setNo <= ex.sets ? (
        <Btn icon="da" onClick={addSet}>Подход {setNo} сделан</Btn>
      ) : cur < exercises.length - 1 ? (
        <Btn icon="arrow" onClick={() => setIdx(cur + 1)}>Следующее упражнение</Btn>
      ) : (
        <Btn icon="da" onClick={finish}>{isDone ? 'Тренировка сохранена' : 'Завершить тренировку'}</Btn>
      )}

      <section aria-labelledby="feel-t" class="stack">
        <h2 id="feel-t" class="h3">Как ощущалось упражнение?</h2>
        <div role="group" aria-labelledby="feel-t" class="grid2">
          {FEELS.map(([k, label]) => (
            <button class="opt" aria-pressed={String(ex.feel === k)} onClick={() => chooseFeel(k)}>{label}</button>
          ))}
        </div>
        <Hud>ЛЕГКО ИЛИ НОРМ НА ВСЕХ ПОДХОДАХ // В СЛЕДУЮЩИЙ РАЗ МОЖНО ДОБАВИТЬ ВЕС</Hud>
      </section>

      <div class="between">
        <button class="hud hud-btn" disabled={cur === 0} onClick={() => setIdx(cur - 1)}>
          <Icon name="arrow" size={12} rotate={180} /> НАЗАД
        </button>
        <button class="hud hud-btn" disabled={cur === exercises.length - 1} onClick={() => setIdx(cur + 1)}>
          ДАЛЬШЕ <Icon name="arrow" size={12} />
        </button>
      </div>

      {editW && <WeightSheet ex={ex} onClose={() => setEditW(false)} onSave={applyWeight} />}
    </div>
  );
}

function WeightSheet({ ex, onClose, onSave }) {
  const [v, setV] = useState(ex.weight != null ? num(ex.weight) : '');
  const step = Number(ex.step) || (ex.per_hand ? 1 : 2.5);
  const val = parseNum(v);
  const bump = (d) => setV(num(Math.max(0, (val || 0) + d)));
  return (
    <Sheet title="Вес на сегодня" onClose={onClose}>
      <p class="small muted">{ex.per_hand ? 'Вес одной гантели.' : 'Вес на снаряде.'} Анастасия увидит, что ты поменяла вес.</p>
      <div class="row">
        <button class="opt" style={{ width: '64px', fontSize: '22px' }} aria-label="Меньше" onClick={() => bump(-step)}>−</button>
        <input class="input input-code" style={{ fontSize: '36px', letterSpacing: 0 }} inputMode="decimal" value={v} onInput={(e) => setV(e.currentTarget.value)} aria-label="Вес, кг" />
        <button class="opt" style={{ width: '64px', fontSize: '22px' }} aria-label="Больше" onClick={() => bump(step)}>+</button>
      </div>
      <Btn disabled={val === null} onClick={() => onSave(val)}>Сохранить {val !== null ? num(val) + ' кг' : ''}</Btn>
    </Sheet>
  );
}
