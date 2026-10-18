// Чистая логика без сети: форматирование, цикл, прогрессия, флажки, меню. Покрыта тестами в tests/.
import { addDays, diffDays, plural, relDays, today as todayIso, weekday } from './dates.js';

// ---------- Числа и веса ----------
export function num(v) {
  if (v === null || v === undefined || v === '') return '';
  const r = Math.round(Number(v) * 10) / 10;
  return String(r).replace('.', ',');
}

export function parseNum(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim().replace(',', '.').replace(/[^\d.]/g, '');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function money(v) {
  if (v === null || v === undefined) return '';
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function weightText(ex) {
  if (!ex) return '';
  if (ex.unit === 'none' || ex.unit === 'sec') return 'без веса';
  if (ex.weight === null || ex.weight === undefined) return 'задать';
  return ex.per_hand ? `2 × ${num(ex.weight)} кг` : `${num(ex.weight)} кг`;
}

export function repsText(ex) {
  const a = ex.reps_min;
  const b = ex.reps_max;
  if (!a && !b) return '';
  if (!b || a === b) return String(a || b);
  if (!a) return String(b);
  return `${a}-${b}`;
}

export function schemeText(ex) {
  const reps = repsText(ex);
  let s = `${ex.sets} × ${reps}${ex.unit === 'sec' ? ' сек' : ''}`;
  if (ex.step && ex.unit === 'kg') s += ` // шаг ${num(ex.step)} кг`;
  return s;
}

// ---------- Прогрессия ----------
// last = { sets: [{reps}], feel, plannedSets, repsMax }
export function progression(ex, last) {
  if (!last || !last.sets || last.sets.length === 0) return 'none';
  if (last.feel === 'pain') return 'down';
  const top = ex.reps_max || ex.reps_min;
  if (!top) return 'keep';
  const enough = last.sets.length >= (last.plannedSets || ex.sets);
  const allTop = last.sets.every((s) => (s.reps || 0) >= top);
  if (enough && allTop && (last.feel === 'easy' || last.feel === 'ok')) return 'up';
  return 'keep';
}

// ---------- Цикл ----------
// days: [{date, flow}] flow 1 = месячные, 2 = чуть-чуть
export function cycleInfo(days, opts = {}) {
  const today = opts.today || todayIso();
  const flow = new Map(days.map((d) => [d.date, d.flow]));
  const isPeriod = (d) => flow.get(d) === 1;
  const sorted = [...new Set(days.filter((d) => d.flow === 1).map((d) => d.date))].sort();
  const starts = sorted.filter((d) => !isPeriod(addDays(d, -1)));
  const lengths = [];
  for (let i = 1; i < starts.length; i++) {
    const len = diffDays(starts[i], starts[i - 1]);
    if (len >= 18 && len <= 45) lengths.push(len);
  }
  const recent = lengths.slice(-6);
  const avg = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 28;
  const past = starts.filter((d) => d <= today);
  if (!past.length) return { known: false, avg, starts };
  const lastStart = past[past.length - 1];
  const day = diffDays(today, lastStart) + 1;
  let runLen = 0;
  while (isPeriod(addDays(lastStart, runLen))) runLen++;
  const nextStart = addDays(lastStart, avg);
  if (day > 60) return { known: false, avg, starts, lastStart };
  let phase = null;
  if (!opts.contraception) {
    if (isPeriod(today) || day <= Math.max(runLen, 1)) phase = 'menstrual';
    else if (day < avg - 15) phase = 'follicular';
    else if (day <= avg - 12) phase = 'ovulatory';
    else phase = 'luteal';
  }
  const late = day > avg + 7;
  return { known: true, avg, starts, lastStart, day, phase, nextStart, late, periodToday: isPeriod(today) };
}

export const PHASE_NAME = {
  menstrual: 'менструальная фаза',
  follicular: 'фолликулярная фаза',
  ovulatory: 'овуляторная фаза',
  luteal: 'лютеиновая фаза',
};

// Подсказки Анастасии на фазу. Без медицинских советов, только про самочувствие и тренировку.
export const PHASE_TIP = {
  menstrual: 'В эти дни сил может быть меньше. Ориентируйся на самочувствие: можно чуть снизить вес или объём, это нормально.',
  follicular: 'Обычно в эти дни сил больше. Пойдёт легко - добавим вес. Не пойдёт - держим, это тоже нормально.',
  ovulatory: 'Хорошие дни для работы. Разминка и техника как всегда.',
  luteal: 'Ближе к месячным может быть тяжелее и хочется сладкого. Это не провал. Держим режим мягко.',
};

// ---------- Ближайшие тренировки клиентки ----------
// Самая ранняя невыполненная (пропущенная не исчезает), затем следующие.
export function upcoming(workouts, today = todayIso()) {
  const planned = workouts.filter((w) => w.status !== 'done').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const overdue = planned.filter((w) => w.date < today && diffDays(today, w.date) <= 14);
  const future = planned.filter((w) => w.date >= today);
  const current = overdue[0] || future[0] || null;
  const rest = future.filter((w) => !current || w.id !== current.id);
  return { current, next: rest.slice(0, 2), overdue: !!overdue[0] };
}

// ---------- Флажки для смены Насти ----------
// data: { clients, checkins, cycle, pains, today }
export function flagsFor(c, data) {
  const today = data.today || todayIso();
  const out = [];
  const cyc = (data.cycle || []).filter((d) => d.client_id === c.id);
  if (cyc.length) {
    const info = cycleInfo(cyc, { today, contraception: c.contraception });
    if (info.known && info.periodToday) {
      const ci = (data.checkins || []).find((x) => x.client_id === c.id && x.date === today);
      const energy = ci && ci.energy === 0 ? ', энергия «мало»' : '';
      out.push({ kind: 'cycle', tag: 'ЦИКЛ', hot: true, text: `${info.day} день месячных${energy}. Облегчить?` });
    }
  }
  const pain = (data.pains || []).find((p) => p.client_id === c.id);
  if (pain) out.push({ kind: 'pain', tag: 'БОЛЬ', hot: true, text: `Отметила «было больно»: ${pain.name.toLowerCase()}` });
  const lastCheck = (data.checkins || []).filter((x) => x.client_id === c.id).map((x) => x.date).sort().pop();
  const since = lastCheck || (c.created_at ? c.created_at.slice(0, 10) : today);
  const quiet = diffDays(today, since);
  if (quiet >= 5) out.push({ kind: 'quiet', tag: 'ТИШИНА', text: `${quiet} ${plural(quiet, 'день', 'дня', 'дней')} не отмечалась в приложении`, days: quiet });
  if (c.paid_until) {
    const d = diffDays(c.paid_until, today);
    if (d < 0) out.push({ kind: 'pay', tag: 'ОПЛАТА', text: `Оплата была до ${c.paid_until.slice(8, 10)}.${c.paid_until.slice(5, 7)}`, overdue: -d });
    else if (d <= 3) out.push({ kind: 'pay', tag: 'ОПЛАТА', text: `Оплачено до ${c.paid_until.slice(8, 10)}.${c.paid_until.slice(5, 7)}`, overdue: 0 });
  }
  if (c.birthday) {
    const b = birthdayIn(c.birthday, today);
    if (b !== null && b <= 7) out.push({ kind: 'bday', tag: 'ДР', text: `День рождения ${relDays(b)}` });
  }
  return out;
}

export function birthdayIn(birthday, today = todayIso()) {
  if (!birthday) return null;
  const y = Number(today.slice(0, 4));
  let next = `${y}${birthday.slice(4)}`;
  if (birthday.slice(5) === '02-29') next = `${y}-03-01`;
  if (next < today) next = `${y + 1}${birthday.slice(4)}`;
  return diffDays(next, today);
}

export function isUsualDay(c, date) {
  return (c.usual_days || []).includes(weekday(date));
}

// ---------- Мягкие тексты для WhatsApp (без длинных тире) ----------
export function firstName(full) {
  return String(full || '').trim().split(/\s+/)[0] || '';
}

export function payText(c) {
  const sum = c.price ? `, ${money(c.price)} ₸` : '';
  return `${firstName(c.full_name)}, привет. Напоминаю про оплату за тренировки${sum}. Если уже оплатила, не обращай внимания`;
}

export function quietText(c) {
  return `${firstName(c.full_name)}, привет. Не забывай отмечать самочувствие в приложении, так мне проще подстроить тренировку под тебя`;
}

export function inviteText(c, code, url) {
  return `${firstName(c.full_name)}, привет. Это Анастасия. Вот твоё приложение для тренировок: ${url} Открой ссылку, нажми «Поделиться» и «На экран Домой». Потом открой иконку и введи код ${code}`;
}

export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  const p = digits.length === 11 && digits.startsWith('8') ? '7' + digits.slice(1) : digits.length === 10 ? '7' + digits : digits;
  return `https://wa.me/${p}?text=${encodeURIComponent(text || '')}`;
}

// ---------- Питание ----------
export function dayTarget(n, isTraining) {
  if (!n || !n.kcal) return null;
  const extraC = isTraining ? Number(n.train_c || 0) : 0;
  return {
    kcal: Math.round(Number(n.kcal) + extraC * 4),
    p: Number(n.p || 0),
    f: Number(n.f || 0),
    c: Number(n.c || 0) + extraC,
    extraC,
  };
}

export const MEALS = [
  { key: 'breakfast', name: 'Завтрак', role: 'breakfast', share: 0.25 },
  { key: 'lunch', name: 'Обед', role: 'main', share: 0.35 },
  { key: 'snack', name: 'Перекус', role: 'snack', share: 0.15 },
  { key: 'dinner', name: 'Ужин', role: 'main', share: 0.25 },
];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function portion(recipe, kcalWanted) {
  const f = kcalWanted / Number(recipe.kcal);
  return Math.min(2, Math.max(0.5, Math.round(f * 20) / 20));
}

function itemFor(meal, recipe, target) {
  const factor = portion(recipe, target.kcal * meal.share);
  return {
    meal: meal.key,
    mealName: meal.name,
    recipe_id: recipe.id,
    name: recipe.name,
    factor,
    grams: Math.round(recipe.portion_g * factor),
    kcal: Math.round(recipe.kcal * factor),
    p: Math.round(recipe.p * factor),
    f: Math.round(recipe.f * factor),
    c: Math.round(recipe.c * factor),
  };
}

export function menuTotals(items) {
  return items.reduce((t, i) => ({ kcal: t.kcal + i.kcal, p: t.p + i.p, f: t.f + i.f, c: t.c + i.c }), { kcal: 0, p: 0, f: 0, c: 0 });
}

function score(items, target) {
  const t = menuTotals(items);
  const e = (a, b, w) => (b ? w * ((a - b) / b) ** 2 : 0);
  return e(t.kcal, target.kcal, 3) + e(t.p, target.p, 2) + e(t.f, target.f, 1) + e(t.c, target.c, 1);
}

export function generateMenu(recipes, target, seedStr = 'menu') {
  const pools = {};
  for (const r of recipes.filter((x) => x.active !== false)) (pools[r.role] = pools[r.role] || []).push(r);
  if (!MEALS.every((m) => pools[m.role] && pools[m.role].length)) return [];
  const rand = rng(hashSeed(seedStr));
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < 400; i++) {
    const used = new Set();
    const items = MEALS.map((m) => {
      const pool = pools[m.role].filter((r) => !used.has(r.id));
      const r = (pool.length ? pool : pools[m.role])[Math.floor(rand() * (pool.length || pools[m.role].length))];
      used.add(r.id);
      return itemFor(m, r, target);
    });
    const s = score(items, target);
    if (s < bestScore) {
      bestScore = s;
      best = items;
    }
  }
  return best;
}

// Заменить одно блюдо: лучшее из той же роли, кроме текущего и уже стоящих в меню.
export function swapItem(items, idx, recipes, target, seedStr = 'swap') {
  const meal = MEALS.find((m) => m.key === items[idx].meal);
  const taken = new Set(items.map((i) => i.recipe_id));
  const pool = recipes.filter((r) => r.active !== false && r.role === meal.role && !taken.has(r.id));
  if (!pool.length) return items;
  const rand = rng(hashSeed(seedStr));
  const ranked = pool
    .map((r) => {
      const next = items.slice();
      next[idx] = itemFor(meal, r, target);
      return { next, s: score(next, target) + rand() * 0.02 };
    })
    .sort((a, b) => a.s - b.s);
  return ranked[Math.floor(rand() * Math.min(3, ranked.length))].next;
}

export function shoppingList(items, recipes, days) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const acc = new Map();
  for (const it of items) {
    const r = byId.get(it.recipe_id);
    if (!r) continue;
    for (const ing of r.ingredients || []) {
      const key = ing.name;
      const prev = acc.get(key) || { name: ing.name, dept: ing.dept || 'Прочее', g: 0 };
      prev.g += ing.g * it.factor * days;
      acc.set(key, prev);
    }
  }
  const order = ['Мясо и рыба', 'Молочное и яйца', 'Крупы и хлеб', 'Овощи и фрукты', 'Прочее'];
  const groups = order.map((dept) => ({
    dept,
    items: [...acc.values()].filter((x) => x.dept === dept).map((x) => ({ ...x, g: Math.round(x.g / 10) * 10 })).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }));
  return groups.filter((g) => g.items.length);
}
