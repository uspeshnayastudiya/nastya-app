// Сквозная проверка на настоящей базе. Все тестовые люди называются «ТЕСТ ...» и удаляются в конце.
import { test, expect } from '@playwright/test';
import { admin, createUser, makeInvite, env } from '../scripts/env.mjs';

const db = admin();
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

async function cleanup() {
  const { data } = await db.from('profiles').select('id').like('full_name', 'ТЕСТ %');
  for (const p of data || []) await db.auth.admin.deleteUser(p.id);
}

async function login(page, code) {
  await page.goto('/');
  await page.getByLabel('КОД ИЗ ПРИГЛАШЕНИЯ').fill(code);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Войти' }).click();
}

async function tokenOf(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('anastasia-auth')).access_token);
}

async function rest(token, path, init = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

test.describe.configure({ mode: 'serial' });

let coachCode;
let clientCode;
let clientId;
let coachPage;
let clientPage;

test.beforeAll(async ({ browser }) => {
  await cleanup();
  const coachId = await createUser(db, { role: 'coach', full_name: 'ТЕСТ Тренер', phone: '+77010000000', consent_at: new Date().toISOString() });
  coachCode = await makeInvite(db, coachId);
  coachPage = await (await browser.newContext()).newPage();
  clientPage = await (await browser.newContext()).newPage();
});

test.afterAll(async () => {
  await cleanup();
});

test('неверный код не пускает', async ({ page }) => {
  await login(page, '000000');
  await expect(page.getByRole('alert')).toContainText('Код не подошёл');
});

test('Настя входит и заводит клиентку', async () => {
  const p = coachPage;
  await login(p, coachCode);
  await expect(p.getByRole('heading', { name: 'Обратить внимание' })).toBeVisible();
  await p.getByRole('link', { name: 'Клиентки' }).click();
  await p.getByRole('link', { name: 'Добавить клиентку' }).click();
  await p.getByLabel('ИМЯ И ФАМИЛИЯ').fill('ТЕСТ Клиентка');
  await p.getByLabel('WHATSAPP').fill('8 701 111 22 33');
  await p.getByRole('button', { name: 'Создать и пригласить' }).click();
  const codeEl = p.locator('.udar', { hasText: /^\d{3} \d{3}$/ });
  await expect(codeEl).toBeVisible();
  clientCode = (await codeEl.textContent()).replace(/\D/g, '');
  expect(clientCode).toHaveLength(6);
  await expect(p.getByText('Это Анастасия. Вот твоё приложение')).toBeVisible();
  const { data } = await db.from('profiles').select('id').eq('full_name', 'ТЕСТ Клиентка').single();
  clientId = data.id;
});

test('Настя ставит норму и расписывает тренировку из шаблона', async () => {
  const p = coachPage;
  await p.goto(`/#/client/${clientId}`);
  await p.getByRole('button', { name: 'ИЗМЕНИТЬ' }).click();
  await p.getByLabel('БЕЛКИ, Г').fill('110');
  await p.getByLabel('ЖИРЫ, Г').fill('55');
  await p.getByLabel('УГЛЕВОДЫ, Г').fill('170');
  await p.getByLabel('+ УГЛЕВОДЫ В ДЕНЬ ТРЕНИРОВКИ').fill('30');
  await p.getByRole('button', { name: 'Сохранить' }).click();
  await expect(p.getByText('Норма сохранена.')).toBeVisible();
  await p.getByRole('link', { name: 'Программа' }).click();
  await p.getByRole('button', { name: 'Из шаблона', exact: true }).click();
  await p.getByRole('button', { name: /Ноги\. Новичок/ }).click();
  await expect(p.getByText('Присед со штангой')).toBeVisible();
  await p.getByRole('button', { name: 'Сохранить' }).click();
  await expect(p.getByText(/Сохранено\./)).toBeVisible();
  const { data } = await db.from('workouts').select('id, title, workout_exercises(count)').eq('client_id', clientId);
  expect(data).toHaveLength(1);
  expect(data[0].title).toBe('Ноги');
  expect(data[0].workout_exercises[0].count).toBe(4);
});

test('клиентка входит, отмечается и тренируется', async () => {
  const p = clientPage;
  await login(p, clientCode);
  await expect(p.getByText('Привет, ТЕСТ')).toBeVisible();
  await expect(p.getByRole('heading', { name: /Сегодня.*Ноги/i })).toBeVisible();
  await p.getByRole('group', { name: 'Энергия' }).getByRole('button', { name: 'Мало' }).click();
  await p.getByRole('group', { name: 'Месячные' }).getByRole('button', { name: 'Да' }).click();
  await p.getByRole('link', { name: 'Открыть тренировку' }).click();
  await expect(p.getByRole('heading', { name: 'Присед со штангой' })).toBeVisible();
  await p.getByLabel('Повторы в подходе 1').fill('12');
  await p.getByRole('button', { name: 'Подход 1 сделан' }).click();
  await expect(p.getByLabel('Повторы в подходе 2')).toBeVisible();
  await p.getByRole('button', { name: 'Изменить вес' }).click();
  await p.getByLabel('Вес, кг').fill('25');
  await p.getByRole('button', { name: /Сохранить 25 кг/ }).click();
  await expect(p.getByText('[ВЕС ИЗМЕНЁН]')).toBeVisible();
  await p.getByRole('group', { name: 'Как ощущалось упражнение?' }).getByRole('button', { name: 'Легко' }).click();
  await expect.poll(async () => (await db.from('set_logs').select('reps').eq('client_id', clientId)).data.length).toBe(1);
  await expect.poll(async () => (await db.from('checkins').select('energy').eq('client_id', clientId).single()).data?.energy).toBe(0);
  await expect.poll(async () => (await db.from('cycle_days').select('flow').eq('client_id', clientId).single()).data?.flow).toBe(1);
  const { data: ex } = await db.from('workout_exercises').select('weight, weight_change, feel').eq('client_id', clientId).eq('name', 'Присед со штангой').single();
  expect(Number(ex.weight)).toBe(25);
  expect(ex.weight_change.by).toBe('client');
  expect(ex.feel).toBe('easy');
});

test('без связи подход сохраняется позже', async () => {
  const p = clientPage;
  await p.context().setOffline(true);
  await p.getByLabel('Повторы в подходе 2').fill('11');
  await p.getByRole('button', { name: 'Подход 2 сделан' }).click();
  await expect(p.getByText(/ОТПРАВЛЮ ПОЗЖЕ/)).toBeVisible();
  await p.context().setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await db.from('set_logs').select('reps').eq('client_id', clientId)).data.length, { timeout: 40000 }).toBe(2);
});

test('питание: меню, отметка и запись вне плана', async () => {
  const p = clientPage;
  await p.getByRole('link', { name: 'Питание' }).click();
  await expect(p.getByText('ДЕНЬ ТРЕНИРОВКИ // +30 Г УГЛЕВОДОВ')).toBeVisible();
  await expect(p.getByText(/ЗАВТРАК \/\/ \d+ ККАЛ/i)).toBeVisible();
  await p.getByRole('button', { name: 'Отклонилась' }).click();
  await p.getByRole('button', { name: '+ Сладкое' }).click();
  await expect(p.locator('.screen').getByText('Сладкое', { exact: true })).toBeVisible();
  await expect.poll(async () => (await db.from('food_extras').select('text').eq('client_id', clientId)).data.map((x) => x.text)).toEqual(['Сладкое']);
  await p.getByRole('button', { name: 'Список покупок' }).click();
  await expect(p.getByRole('dialog', { name: 'Список покупок' })).toBeVisible();
  await p.getByRole('button', { name: 'ЗАКРЫТЬ' }).click();
});

test('Настя видит флажки и правку веса', async () => {
  const p = coachPage;
  await p.goto('/#/shift');
  await p.reload();
  const card = p.locator('.card', { hasText: 'ТЕСТ Клиентка' }).filter({ hasText: 'ЦИКЛ' });
  await expect(card.first()).toContainText('1 день месячных');
  await p.goto(`/#/client/${clientId}/program`);
  await expect(p.getByText(/ИЗМЕНИЛА ТЕСТ/)).toBeVisible();
  await p.getByRole('button', { name: 'Оставить' }).click();
  await expect(p.getByText('Оставили новый вес.')).toBeVisible();
  const { data } = await db.from('workout_exercises').select('weight_change').eq('client_id', clientId).eq('name', 'Присед со штангой').single();
  expect(data.weight_change).toBe(null);
});

test('чужие данные недоступны', async () => {
  const otherId = await createUser(db, { role: 'client', full_name: 'ТЕСТ Другая', consent_at: new Date().toISOString() });
  const { data: w } = await db.from('workouts').insert({ client_id: otherId, date: '2026-01-01', title: 'Секрет' }).select().single();
  const { data: e } = await db.from('workout_exercises').insert({ workout_id: w.id, client_id: otherId, name: 'Секретное', sets: 3 }).select().single();
  await db.from('checkins').insert({ client_id: otherId, date: '2026-01-01', energy: 2 });
  await db.from('cycle_days').insert({ client_id: otherId, date: '2026-01-01', flow: 1 });

  const token = await tokenOf(clientPage);
  expect((await rest(token, `profiles?id=eq.${otherId}`)).body).toEqual([]);
  expect((await rest(token, `workouts?client_id=eq.${otherId}`)).body).toEqual([]);
  expect((await rest(token, `checkins?client_id=eq.${otherId}`)).body).toEqual([]);
  expect((await rest(token, `cycle_days?client_id=eq.${otherId}`)).body).toEqual([]);
  expect((await rest(token, 'templates')).body).toEqual([]);
  const ins = await rest(token, 'set_logs', { method: 'POST', body: JSON.stringify({ exercise_id: e.id, client_id: otherId, set_no: 1, reps: 5 }) });
  expect(ins.status).toBeGreaterThanOrEqual(400);
  const ins2 = await rest(token, 'checkins', { method: 'POST', body: JSON.stringify({ client_id: otherId, date: '2026-02-02', energy: 1 }) });
  expect(ins2.status).toBeGreaterThanOrEqual(400);
  const upd = await rest(token, `profiles?id=eq.${clientId}`, { method: 'PATCH', body: JSON.stringify({ role: 'coach' }) });
  expect(upd.body).toEqual([]);
  const { data: me } = await db.from('profiles').select('role').eq('id', clientId).single();
  expect(me.role).toBe('client');
  const fn = await fetch(`${URL}/functions/v1/admin`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_client', profile: { full_name: 'ТЕСТ Взлом' } }) });
  expect(fn.status).toBe(403);
  const anon = await rest(ANON, 'profiles?select=id');
  expect(anon.body).toEqual([]);
  const coachToken = await tokenOf(coachPage);
  expect((await rest(coachToken, `checkins?client_id=eq.${otherId}`)).body).toHaveLength(1);
});
