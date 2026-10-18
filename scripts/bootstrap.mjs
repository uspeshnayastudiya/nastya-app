// Первичное наполнение: рецепты, стартовые шаблоны, аккаунт тренера. Повторный запуск ничего не дублирует.
// node scripts/bootstrap.mjs [--coach-name "Анастасия"] [--coach-phone "+7..."]
import { admin, createUser, makeInvite } from './env.mjs';
import { RECIPES } from '../src/data/recipes.js';

const db = admin();
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const ex = (name, sets, rmin, rmax, step, extra = {}) => ({ name, sets, reps_min: rmin, reps_max: rmax, unit: 'kg', per_hand: false, step, ...extra });
const DAY = [
  { name: 'Ноги. Новичок', title: 'Ноги', exercises: [ex('Присед со штангой', 4, 10, 12, 2.5), ex('Румынская тяга с гантелями', 3, 10, 12, 2, { per_hand: true }), ex('Ягодичный мост', 4, 12, 12, 5), ex('Разгибание ног в тренажёре', 3, 15, 15, 5)] },
  { name: 'Ноги без выпадов', title: 'Ноги', exercises: [ex('Жим ногами', 4, 12, 12, 5), ex('Ягодичный мост', 4, 12, 12, 5), ex('Румынская тяга с гантелями', 3, 10, 12, 2, { per_hand: true }), ex('Сгибание ног в тренажёре', 3, 15, 15, 2.5)] },
  { name: 'Верх. Новичок', title: 'Верх', exercises: [ex('Тяга верхнего блока', 4, 10, 12, 2.5), ex('Жим гантелей сидя', 3, 10, 12, 1, { per_hand: true }), ex('Тяга гантели в наклоне', 3, 12, 12, 2), ex('Разведения в стороны', 3, 15, 15, 1, { per_hand: true })] },
  { name: 'Ягодицы', title: 'Ягодицы', exercises: [ex('Ягодичный мост', 4, 12, 12, 5), ex('Отведение ноги в кроссовере', 3, 15, 15, 2.5), ex('Гиперэкстензия', 3, 12, 12, 5), ex('Румынская тяга с гантелями', 3, 10, 12, 2, { per_hand: true })] },
  { name: 'Full body. Лёгкая', title: 'Full body', exercises: [ex('Гоблет-присед', 3, 12, 12, 2), ex('Тяга верхнего блока', 3, 12, 12, 2.5), ex('Ягодичный мост', 3, 12, 12, 5), { name: 'Планка', sets: 3, reps_min: 30, reps_max: 30, unit: 'sec', per_hand: false, step: null }] },
];
const WEEK = [
  { name: 'Новичок 3 дня', days: ['Ноги. Новичок', 'Верх. Новичок', 'Ягодицы'] },
  { name: 'Full body 2 дня', days: ['Full body. Лёгкая', 'Full body. Лёгкая'] },
];

async function main() {
  const { count: rc } = await db.from('recipes').select('id', { count: 'exact', head: true });
  if (!rc) {
    const { error } = await db.from('recipes').insert(RECIPES);
    if (error) throw error;
    console.log(`Рецепты: добавлено ${RECIPES.length}`);
  } else console.log(`Рецепты: уже есть ${rc}`);

  const { data: tpls, error: te } = await db.from('templates').select('id, name, kind');
  if (te) throw te;
  if (!tpls.length) {
    const { data: days, error } = await db.from('templates').insert(DAY.map((d) => ({ kind: 'day', ...d }))).select();
    if (error) throw error;
    const id = (n) => days.find((d) => d.name === n).id;
    const { error: we } = await db.from('templates').insert(WEEK.map((w) => ({ kind: 'week', name: w.name, days: w.days.map(id) })));
    if (we) throw we;
    console.log(`Шаблоны: добавлено ${DAY.length + WEEK.length}`);
  } else console.log(`Шаблоны: уже есть ${tpls.length}`);

  const { data: coaches } = await db.from('profiles').select('id, full_name').eq('role', 'coach');
  let coachId = coaches?.[0]?.id;
  if (!coachId) {
    coachId = await createUser(db, { role: 'coach', full_name: arg('--coach-name') || 'Анастасия', phone: arg('--coach-phone') || null, consent_at: new Date().toISOString() });
    console.log('Тренер: создан');
  } else console.log('Тренер: уже есть');
  if (process.argv.includes('--coach-code') || !coaches?.length) {
    const code = await makeInvite(db, coachId, 14);
    console.log(`КОД ВХОДА ТРЕНЕРА: ${code} (14 дней)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
