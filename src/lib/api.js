// Работа с базой. Чтение кэшируется для офлайна, записи клиентки идут через очередь.
import { supabase, callFn } from './supabase.js';
import { addDays, today, weekday } from './dates.js';

// ---------- Кэш ----------
const CK = 'anc:';
export function cacheGet(key) {
  try {
    const v = localStorage.getItem(CK + key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
export function cacheSet(key, v) {
  try {
    localStorage.setItem(CK + key, JSON.stringify(v));
  } catch {
    // переполнено или приватный режим
  }
}
export function cacheClear() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(CK)).forEach((k) => localStorage.removeItem(k));
  } catch {
    // нет доступа
  }
}

function must(res) {
  if (res.error) throw res.error;
  return res.data;
}

export function isNetworkError(e) {
  const m = String(e?.message || e || '');
  return !navigator.onLine || /fetch|network|load failed|timeout|abort/i.test(m);
}

// ---------- Очередь записей ----------
const QK = CK + 'outbox';
const qListeners = new Set();
let flushing = false;

function readQ() {
  try {
    return JSON.parse(localStorage.getItem(QK) || '[]');
  } catch {
    return [];
  }
}
function writeQ(q) {
  try {
    localStorage.setItem(QK, JSON.stringify(q));
  } catch {
    // ничего
  }
  qListeners.forEach((f) => f(q.length));
}
export function onQueue(fn) {
  qListeners.add(fn);
  fn(readQ().length);
  return () => qListeners.delete(fn);
}

// op: {kind: upsert|insert|update|delete, table, values, match, onConflict, key}
export function enqueue(op) {
  let q = readQ();
  if (op.key) q = q.filter((x) => x.key !== op.key);
  q.push(op);
  writeQ(q);
  return flush();
}

async function runOp(op) {
  let r;
  const t = supabase.from(op.table);
  if (op.kind === 'upsert') r = await t.upsert(op.values, op.onConflict ? { onConflict: op.onConflict } : undefined);
  else if (op.kind === 'insert') r = await t.insert(op.values);
  else if (op.kind === 'update') r = await t.update(op.values).match(op.match);
  else if (op.kind === 'delete') r = await t.delete().match(op.match);
  return r?.error || null;
}

export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const q = readQ();
      if (!q.length) break;
      let err = null;
      try {
        err = await runOp(q[0]);
      } catch (e) {
        err = e;
      }
      if (err && isNetworkError(err)) break;
      if (err) console.warn('Запись не принята базой, пропускаю', q[0], err);
      writeQ(readQ().slice(1));
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flush());
  setInterval(() => flush(), 30000);
}

export const uuid = () => crypto.randomUUID();

// ---------- Общее ----------
export async function loadProfile(uid) {
  return must(await supabase.from('profiles').select('*').eq('id', uid).single());
}

export async function touch() {
  try {
    await supabase.rpc('me_touch');
  } catch {
    // офлайн
  }
}

export async function giveConsent() {
  must(await supabase.rpc('me_consent'));
}

export async function redeem(code) {
  return callFn('redeem', { code });
}

// ---------- Клиентка ----------
export async function clientHome(uid) {
  const t = today();
  const [w, ci, cyc, abs, coach] = await Promise.all([
    supabase.from('workouts').select('id, date, time, title, status, workout_exercises(count)').eq('client_id', uid).gte('date', addDays(t, -14)).lte('date', addDays(t, 28)).order('date'),
    supabase.from('checkins').select('*').eq('client_id', uid).eq('date', t).maybeSingle(),
    supabase.from('cycle_days').select('date, flow').eq('client_id', uid).gte('date', addDays(t, -200)),
    supabase.from('absences').select('*').eq('client_id', uid).gte('date', addDays(t, -14)),
    supabase.rpc('coach_contact'),
  ]);
  return {
    workouts: must(w),
    checkin: must(ci),
    cycle: must(cyc),
    absences: must(abs),
    coach: (must(coach) || [])[0] || null,
  };
}

export function saveCheckin(uid, date, values) {
  return enqueue({
    kind: 'upsert', table: 'checkins', onConflict: 'client_id,date', key: `checkin:${date}`,
    values: { client_id: uid, date, ...values, updated_at: new Date().toISOString() },
  });
}

export function saveFlow(uid, date, flow) {
  return enqueue({ kind: 'upsert', table: 'cycle_days', onConflict: 'client_id,date', key: `flow:${date}`, values: { client_id: uid, date, flow } });
}

export function saveAbsence(uid, date, reason) {
  return enqueue({ kind: 'upsert', table: 'absences', onConflict: 'client_id,date', key: `abs:${date}`, values: { client_id: uid, date, reason: reason || null } });
}

export function removeAbsence(uid, date) {
  return enqueue({ kind: 'delete', table: 'absences', key: `abs:${date}`, match: { client_id: uid, date } });
}

// Тренировка с упражнениями, подходами и прошлой историей для подсказок.
export async function workoutDetail(id) {
  const w = must(await supabase.from('workouts').select('*').eq('id', id).single());
  const ex = must(await supabase.from('workout_exercises').select('*').eq('workout_id', id).order('position'));
  const ids = ex.map((e) => e.id);
  const logs = ids.length ? must(await supabase.from('set_logs').select('*').in('exercise_id', ids)) : [];
  const names = [...new Set(ex.map((e) => e.name))];
  let history = {};
  if (names.length) {
    const prev = must(
      await supabase
        .from('workout_exercises')
        .select('id, name, feel, sets, weight, workout_id, workouts!inner(date, status)')
        .eq('client_id', w.client_id)
        .in('name', names)
        .neq('workout_id', id)
        .eq('workouts.status', 'done')
        .lt('workouts.date', w.date)
        .gte('workouts.date', addDays(w.date, -120)),
    );
    prev.sort((a, b) => (a.workouts.date < b.workouts.date ? 1 : -1));
    const lastByName = {};
    for (const p of prev) if (!lastByName[p.name]) lastByName[p.name] = p;
    const lastIds = Object.values(lastByName).map((p) => p.id);
    const prevLogs = lastIds.length ? must(await supabase.from('set_logs').select('exercise_id, set_no, reps, weight').in('exercise_id', lastIds)) : [];
    history = Object.fromEntries(
      Object.entries(lastByName).map(([name, p]) => [
        name,
        {
          date: p.workouts.date,
          weight: p.weight,
          feel: p.feel,
          plannedSets: p.sets,
          sets: prevLogs.filter((l) => l.exercise_id === p.id).sort((a, b) => a.set_no - b.set_no),
        },
      ]),
    );
  }
  return { workout: w, exercises: ex, logs, history };
}

export function logSet(uid, exerciseId, setNo, reps, weight) {
  return enqueue({
    kind: 'upsert', table: 'set_logs', onConflict: 'exercise_id,set_no', key: `set:${exerciseId}:${setNo}`,
    values: { exercise_id: exerciseId, client_id: uid, set_no: setNo, reps, weight },
  });
}

export function removeSet(exerciseId, setNo) {
  return enqueue({ kind: 'delete', table: 'set_logs', key: `set:${exerciseId}:${setNo}`, match: { exercise_id: exerciseId, set_no: setNo } });
}

export function setFeel(exerciseId, feel) {
  return enqueue({ kind: 'update', table: 'workout_exercises', key: `feel:${exerciseId}`, match: { id: exerciseId }, values: { feel } });
}

export function setWeight(exerciseId, weight) {
  return enqueue({ kind: 'update', table: 'workout_exercises', key: `w:${exerciseId}`, match: { id: exerciseId }, values: { weight } });
}

export function finishWorkout(id, done = true) {
  return enqueue({
    kind: 'update', table: 'workouts', key: `done:${id}`, match: { id },
    values: { status: done ? 'done' : 'planned', done_at: done ? new Date().toISOString() : null },
  });
}

// Питание
export async function foodDay(uid, date) {
  const [fd, ex, rec, w] = await Promise.all([
    supabase.from('food_days').select('*').eq('client_id', uid).eq('date', date).maybeSingle(),
    supabase.from('food_extras').select('*').eq('client_id', uid).eq('date', date).order('created_at'),
    supabase.from('recipes').select('*').eq('active', true).order('name'),
    supabase.from('workouts').select('id').eq('client_id', uid).eq('date', date).limit(1),
  ]);
  return { day: must(fd), extras: must(ex), recipes: must(rec), training: must(w).length > 0 };
}

export function saveFoodDay(uid, date, values) {
  return enqueue({
    kind: 'upsert', table: 'food_days', onConflict: 'client_id,date', key: `food:${date}:${Object.keys(values).join(',')}`,
    values: { client_id: uid, date, ...values },
  });
}

export function addExtra(uid, date, text, id = uuid()) {
  enqueue({ kind: 'insert', table: 'food_extras', key: `extra:${id}`, values: { id, client_id: uid, date, text } });
  return { id, client_id: uid, date, text, created_at: new Date().toISOString() };
}

export function removeExtra(id) {
  return enqueue({ kind: 'delete', table: 'food_extras', key: `extra-del:${id}`, match: { id } });
}

// Прогресс
export async function progressData(uid) {
  const from = addDays(today(), -365);
  const [ex, logs, ms, cyc] = await Promise.all([
    supabase.from('workout_exercises').select('id, name, weight, per_hand, unit, workouts!inner(date, status)').eq('client_id', uid).eq('workouts.status', 'done').gte('workouts.date', from),
    supabase.from('set_logs').select('exercise_id, weight, reps').eq('client_id', uid).gte('created_at', from),
    supabase.from('measurements').select('*').eq('client_id', uid).order('date'),
    supabase.from('cycle_days').select('date, flow').eq('client_id', uid).gte('date', addDays(today(), -200)),
  ]);
  return { exercises: must(ex), logs: must(logs), measurements: must(ms), cycle: must(cyc) };
}

export async function addMeasurement(uid, values) {
  return must(await supabase.from('measurements').insert({ client_id: uid, ...values }).select().single());
}

export async function setCycleSettings(enabled, share, contraception) {
  must(await supabase.rpc('me_cycle_settings', { p_enabled: enabled, p_share: share, p_contraception: contraception }));
}

// Серия рабочих весов по упражнениям: [{name, points: [{date, weight}]}]
export function liftSeries(exercises, logs) {
  const byEx = new Map();
  for (const l of logs) {
    const w = Number(l.weight);
    if (!Number.isFinite(w) || w <= 0) continue;
    byEx.set(l.exercise_id, Math.max(byEx.get(l.exercise_id) || 0, w));
  }
  const series = new Map();
  for (const e of exercises) {
    if (e.unit !== 'kg') continue;
    const w = byEx.get(e.id) || (e.weight ? Number(e.weight) : 0);
    if (!w) continue;
    const s = series.get(e.name) || { name: e.name, per_hand: e.per_hand, points: [] };
    s.points.push({ date: e.workouts.date, weight: w });
    series.set(e.name, s);
  }
  return [...series.values()]
    .map((s) => ({ ...s, points: s.points.sort((a, b) => (a.date < b.date ? -1 : 1)) }))
    .filter((s) => s.points.length > 0)
    .sort((a, b) => b.points.length - a.points.length);
}

// ---------- Тренер ----------
export async function coachShift() {
  const t = today();
  const [clients, workouts, abs, ci, cyc, pains] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'client').eq('archived', false).order('full_name'),
    supabase.from('workouts').select('id, client_id, date, time, title, status').eq('date', t),
    supabase.from('absences').select('*').eq('date', t),
    supabase.from('checkins').select('client_id, date, energy, sleep, doms').gte('date', addDays(t, -30)),
    supabase.from('cycle_days').select('client_id, date, flow').gte('date', addDays(t, -60)),
    supabase
      .from('workout_exercises')
      .select('client_id, name, feel, workouts!inner(date)')
      .eq('feel', 'pain')
      .gte('workouts.date', addDays(t, -7)),
  ]);
  return {
    clients: must(clients),
    workouts: must(workouts),
    absences: must(abs),
    checkins: must(ci),
    cycle: must(cyc),
    pains: must(pains),
  };
}

export async function coachClients() {
  return must(await supabase.from('profiles').select('*').eq('role', 'client').order('full_name'));
}

export async function createClient(profile) {
  return callFn('admin', { action: 'create_client', profile });
}

export async function newInvite(id) {
  return callFn('admin', { action: 'new_invite', id });
}

export async function deleteClientForever(id) {
  return callFn('admin', { action: 'delete_client', id });
}

export async function updateProfile(id, values) {
  return must(await supabase.from('profiles').update(values).eq('id', id).select().single());
}

export async function markPaid(id, amount) {
  return must(await supabase.rpc('coach_mark_paid', { p_client: id, p_amount: amount }));
}

export async function clientCard(id) {
  const t = today();
  const [p, ci, cyc, ex, logs, ms, extras, fdays, pays] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('checkins').select('*').eq('client_id', id).gte('date', addDays(t, -13)),
    supabase.from('cycle_days').select('date, flow').eq('client_id', id).gte('date', addDays(t, -200)),
    supabase.from('workout_exercises').select('id, name, weight, per_hand, unit, workouts!inner(date, status)').eq('client_id', id).eq('workouts.status', 'done'),
    supabase.from('set_logs').select('exercise_id, weight, reps').eq('client_id', id),
    supabase.from('measurements').select('*').eq('client_id', id).order('date'),
    supabase.from('food_extras').select('*').eq('client_id', id).gte('date', addDays(t, -6)).order('created_at'),
    supabase.from('food_days').select('date, status').eq('client_id', id).gte('date', addDays(t, -6)),
    supabase.from('payments').select('*').eq('client_id', id).order('paid_at', { ascending: false }).limit(6),
  ]);
  return {
    profile: must(p),
    checkins: must(ci),
    cycle: must(cyc),
    lifts: liftSeries(must(ex), must(logs)),
    measurements: must(ms),
    extras: must(extras),
    foodDays: must(fdays),
    payments: must(pays),
  };
}

// Программа: неделя клиентки
export async function weekPlan(clientId, start) {
  const end = addDays(start, 6);
  const w = must(await supabase.from('workouts').select('*').eq('client_id', clientId).gte('date', start).lte('date', end).order('date'));
  const ids = w.map((x) => x.id);
  const ex = ids.length ? must(await supabase.from('workout_exercises').select('*').in('workout_id', ids).order('position')) : [];
  return w.map((x) => ({ ...x, exercises: ex.filter((e) => e.workout_id === x.id) }));
}

// Последний вес по каждому упражнению клиентки (для шаблонов).
export async function lastWeights(clientId) {
  const rows = must(
    await supabase
      .from('workout_exercises')
      .select('name, weight, per_hand, workouts!inner(date)')
      .eq('client_id', clientId)
      .not('weight', 'is', null)
      .gte('workouts.date', addDays(today(), -365)),
  );
  rows.sort((a, b) => (a.workouts.date < b.workouts.date ? 1 : -1));
  const out = {};
  for (const r of rows) if (!(r.name in out)) out[r.name] = Number(r.weight);
  return out;
}

const EX_FIELDS = ['name', 'sets', 'reps_min', 'reps_max', 'unit', 'per_hand', 'weight', 'step'];

// Сохранить тренировку дня целиком: шапка и список упражнений (лишние удаляются).
export async function saveWorkout(clientId, workout, exercises) {
  const row = {
    id: workout.id || uuid(),
    client_id: clientId,
    date: workout.date,
    time: workout.time || null,
    title: workout.title || '',
    from_template: workout.from_template || null,
  };
  const saved = must(await supabase.from('workouts').upsert(row).select().single());
  const keep = exercises.map((e, i) => {
    const r = { id: e.id || uuid(), workout_id: saved.id, client_id: clientId, position: i };
    for (const k of EX_FIELDS) r[k] = e[k] ?? null;
    r.sets = r.sets || 3;
    r.unit = r.unit || 'kg';
    r.per_hand = !!r.per_hand;
    if ('weight_change' in e) r.weight_change = e.weight_change;
    return r;
  });
  const existing = must(await supabase.from('workout_exercises').select('id').eq('workout_id', saved.id));
  const keepIds = new Set(keep.map((k) => k.id));
  const drop = existing.map((x) => x.id).filter((x) => !keepIds.has(x));
  if (drop.length) must(await supabase.from('workout_exercises').delete().in('id', drop));
  if (keep.length) must(await supabase.from('workout_exercises').upsert(keep));
  return saved;
}

// Ближайшая невыполненная тренировка клиентки (для «перенести сюда»).
export async function nearestPlanned(clientId, date) {
  const rows = must(
    await supabase
      .from('workouts')
      .select('id, date, title')
      .eq('client_id', clientId)
      .eq('status', 'planned')
      .neq('date', date)
      .gte('date', addDays(date, -14))
      .lte('date', addDays(date, 14)),
  );
  rows.sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(date)) - Math.abs(Date.parse(b.date) - Date.parse(date)) || (a.date < b.date ? -1 : 1));
  return rows[0] || null;
}

export async function moveWorkout(id, date) {
  must(await supabase.from('workouts').update({ date }).eq('id', id));
}

export async function deleteWorkout(id) {
  must(await supabase.from('workouts').delete().eq('id', id));
}

export async function clearWeightChange(exerciseId) {
  must(await supabase.from('workout_exercises').update({ weight_change: null }).eq('id', exerciseId));
}

export async function revertWeight(exerciseId, weight) {
  must(await supabase.from('workout_exercises').update({ weight }).eq('id', exerciseId));
}

// Шаблон дня в упражнения клиентки: вес из её истории.
export function fromTemplate(tpl, weights) {
  return (tpl.exercises || []).map((e) => ({
    ...e,
    id: undefined,
    weight: e.unit === 'kg' && weights[e.name] !== undefined ? weights[e.name] : null,
  }));
}

export async function applyWeekTemplate(client, start, week, dayTemplates, weights) {
  const days = (client.usual_days && client.usual_days.length ? [...client.usual_days].sort() : [0, 2, 4]);
  const ids = week.days || [];
  const existing = await weekPlan(client.id, start);
  for (let i = 0; i < ids.length && i < days.length; i++) {
    const tpl = dayTemplates.find((d) => d.id === ids[i]);
    if (!tpl) continue;
    const date = addDays(start, days[i]);
    const old = existing.find((w) => w.date === date);
    await saveWorkout(
      client.id,
      { id: old?.id, date, time: client.usual_time, title: tpl.title, from_template: week.name },
      fromTemplate(tpl, weights),
    );
  }
}

export async function repeatWeek(clientId, start) {
  const cur = await weekPlan(clientId, start);
  const next = await weekPlan(clientId, addDays(start, 7));
  let n = 0;
  for (const w of cur) {
    const date = addDays(w.date, 7);
    if (next.some((x) => x.date === date)) continue;
    await saveWorkout(
      clientId,
      { date, time: w.time, title: w.title, from_template: w.from_template },
      w.exercises.map((e) => ({ ...e, id: undefined, weight_change: null })),
    );
    n++;
  }
  return n;
}

// Шаблоны
export async function templates() {
  return must(await supabase.from('templates').select('*').order('name'));
}

export async function saveTemplate(t) {
  const row = { ...t, updated_at: new Date().toISOString() };
  if (!row.id) delete row.id;
  return must(await supabase.from('templates').upsert(row).select().single());
}

export async function deleteTemplate(id) {
  must(await supabase.from('templates').delete().eq('id', id));
}

export async function usageCounts() {
  const rows = must(await supabase.from('workouts').select('client_id, from_template').not('from_template', 'is', null));
  const out = {};
  for (const r of rows) {
    out[r.from_template] = out[r.from_template] || new Set();
    out[r.from_template].add(r.client_id);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.size]));
}

export function clientWeekday(date) {
  return weekday(date);
}

// Список названий упражнений для подсказок при вводе.
export async function exerciseNames() {
  const [a, t] = await Promise.all([
    supabase.from('workout_exercises').select('name').limit(2000),
    supabase.from('templates').select('exercises'),
  ]);
  const names = new Set(must(a).map((x) => x.name));
  for (const tpl of must(t)) for (const e of tpl.exercises || []) names.add(e.name);
  return [...names].sort((x, y) => x.localeCompare(y, 'ru'));
}
