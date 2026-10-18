// Импорт клиенток из JSON (scripts/export-clients.py). Повторный запуск пропускает уже существующих по имени.
// node scripts/import-clients.mjs <clients.json>
import { readFileSync } from 'node:fs';
import { admin, createUser } from './env.mjs';

const db = admin();
const file = process.argv[2];
const { clients, measurements } = JSON.parse(readFileSync(file, 'utf8'));

const { data: existing, error } = await db.from('profiles').select('id, full_name').eq('role', 'client');
if (error) throw error;
const byName = new Map(existing.map((p) => [p.full_name, p.id]));
let created = 0;
for (const c of clients) {
  if (byName.has(c.full_name)) continue;
  const { age, ...profile } = c;
  const id = await createUser(db, { ...profile, role: 'client' });
  byName.set(c.full_name, id);
  created++;
}
const rows = measurements
  .filter((m) => byName.has(m.full_name))
  .map(({ full_name, ...m }) => ({ ...m, client_id: byName.get(full_name) }));
let added = 0;
for (const m of rows) {
  const { count } = await db.from('measurements').select('id', { count: 'exact', head: true }).eq('client_id', m.client_id).eq('date', m.date);
  if (count) continue;
  const { error: me } = await db.from('measurements').insert(m);
  if (me) throw me;
  added++;
}
console.log(`Клиенток создано: ${created}, замеров добавлено: ${added}`);
