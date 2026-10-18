import { useEffect, useState } from 'preact/hooks';
import { cacheGet, coachClients, createClient, deleteClientForever, updateProfile } from '../lib/api.js';
import { WD } from '../lib/dates.js';
import { parseNum } from '../lib/logic.js';
import { Back, Btn, errorText, Field, go, Hud, Seg, toast, Udar } from '../ui/kit.jsx';

const PRICE = { group: 35000, personal: 100000 };

export function ClientForm({ id }) {
  const editing = !!id;
  const [f, setF] = useState(() => {
    const c = editing ? (cacheGet('clients') || []).find((x) => x.id === id) : null;
    return c ? toForm(c) : { full_name: '', phone: '', tariff: 'group', price: '35000', usual_days: [0, 2, 4], usual_time: '19:00', paid_until: '', birthday: '', goal: '', limits: '', note: '', is_minor: false, parent_consent: false, food_enabled: true, archived: false };
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!editing) return;
    coachClients().then((list) => {
      const c = list.find((x) => x.id === id);
      if (c) setF(toForm(c));
    }).catch(() => {});
  }, [id]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggleDay = (d) => set('usual_days', f.usual_days.includes(d) ? f.usual_days.filter((x) => x !== d) : [...f.usual_days, d].sort());

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!f.full_name.trim()) {
      setErr('Впиши имя.');
      return;
    }
    if (f.is_minor && !f.parent_consent) {
      setErr('Клиентке младше 18 нужно согласие родителей.');
      return;
    }
    const profile = {
      full_name: f.full_name.trim(),
      phone: f.phone.trim() || null,
      tariff: f.tariff,
      price: parseNum(f.price),
      usual_days: f.usual_days,
      usual_time: f.usual_time.trim() || null,
      paid_until: f.paid_until || null,
      birthday: f.birthday || null,
      goal: f.goal.trim() || null,
      limits: f.limits.trim() || null,
      note: f.note.trim() || null,
      is_minor: f.is_minor,
      parent_consent: f.parent_consent,
      food_enabled: f.food_enabled,
    };
    setBusy(true);
    try {
      if (editing) {
        await updateProfile(id, profile);
        toast('Сохранено.');
        go('client/' + id);
      } else {
        const r = await createClient(profile);
        sessionStorage.setItem('invite:' + r.id, r.code);
        go(`client/${r.id}/invite`);
      }
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function archive(flag) {
    setBusy(true);
    try {
      await updateProfile(id, { archived: flag });
      toast(flag ? 'Клиентка в архиве, вход закрыт.' : 'Клиентка снова активна.');
      go(flag ? 'clients' : 'client/' + id);
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function removeForever() {
    if (!confirm('Удалить клиентку и все её данные навсегда? Это нельзя отменить.')) return;
    setBusy(true);
    try {
      await deleteClientForever(id);
      toast('Данные удалены.');
      go('clients');
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="screen" onSubmit={submit}>
      <Back href={editing ? `#/client/${id}` : '#/clients'}>{editing ? 'КАРТОЧКА' : 'КЛИЕНТКИ'}</Back>
      <Udar size={44} as="h1">{editing ? 'Данные клиентки' : 'Новая клиентка'}</Udar>
      <Hud>ГЛАВНОЕ СЕЙЧАС // ОСТАЛЬНОЕ МОЖНО ПОТОМ</Hud>

      <Field label="ИМЯ И ФАМИЛИЯ" id="f-name">
        <input id="f-name" class="input" value={f.full_name} onInput={(e) => set('full_name', e.currentTarget.value)} placeholder="Сабина Н." />
      </Field>
      <Field label="WHATSAPP" id="f-phone">
        <input id="f-phone" class="input" type="tel" value={f.phone} onInput={(e) => set('phone', e.currentTarget.value)} placeholder="+7 701 234 56 78" />
      </Field>
      <div class="field">
        <span class="hud">ТАРИФ</span>
        <Seg
          label="Тариф"
          value={f.tariff}
          onChange={(v) => setF((x) => ({ ...x, tariff: v, price: String(PRICE[v]) }))}
          options={[{ value: 'group', label: 'Групповая' }, { value: 'personal', label: 'Персональная' }]}
        />
      </div>
      <div class="grid2" style={{ gap: '10px' }}>
        <Field label="ЦЕНА В МЕСЯЦ, ₸" id="f-price">
          <input id="f-price" class="input" inputMode="numeric" value={f.price} onInput={(e) => set('price', e.currentTarget.value)} />
        </Field>
        <Field label="ОПЛАЧЕНО ДО" id="f-paid">
          <input id="f-paid" class="input" type="date" value={f.paid_until} onInput={(e) => set('paid_until', e.currentTarget.value)} />
        </Field>
      </div>
      <div class="field">
        <span class="hud">ОБЫЧНЫЕ ДНИ</span>
        <div role="group" aria-label="Обычные дни" class="grid7">
          {WD.map((w, i) => (
            <button type="button" class="opt hud" style={{ padding: 0 }} aria-pressed={String(f.usual_days.includes(i))} onClick={() => toggleDay(i)}>{w}</button>
          ))}
        </div>
      </div>
      <div class="grid2" style={{ gap: '10px' }}>
        <Field label="ВРЕМЯ" id="f-time">
          <input id="f-time" class="input" type="time" value={f.usual_time} onInput={(e) => set('usual_time', e.currentTarget.value)} />
        </Field>
        <Field label="ДЕНЬ РОЖДЕНИЯ" id="f-bday">
          <input id="f-bday" class="input" type="date" value={f.birthday} onInput={(e) => set('birthday', e.currentTarget.value)} />
        </Field>
      </div>
      <Field label="ЦЕЛЬ" id="f-goal">
        <input id="f-goal" class="input" value={f.goal} onInput={(e) => set('goal', e.currentTarget.value)} placeholder="Подтянуть тело, набрать мышцы" />
      </Field>
      <Field label="ОГРАНИЧЕНИЯ И ТРАВМЫ" id="f-lim">
        <input id="f-lim" class="input" value={f.limits} onInput={(e) => set('limits', e.currentTarget.value)} placeholder="Если нет, оставь пустым" />
      </Field>
      <Field label="ЗАМЕТКА ДЛЯ СЕБЯ" id="f-note">
        <textarea id="f-note" class="input" value={f.note} onInput={(e) => set('note', e.currentTarget.value)} />
      </Field>
      <label class="check">
        <input type="checkbox" checked={f.is_minor} onChange={(e) => setF((x) => ({ ...x, is_minor: e.currentTarget.checked, food_enabled: e.currentTarget.checked ? false : x.food_enabled }))} />
        <span>Младше 18 лет</span>
      </label>
      {f.is_minor && (
        <label class="check">
          <input type="checkbox" checked={f.parent_consent} onChange={(e) => set('parent_consent', e.currentTarget.checked)} />
          <span>Есть согласие родителей</span>
        </label>
      )}
      <label class="check">
        <input type="checkbox" checked={f.food_enabled} onChange={(e) => set('food_enabled', e.currentTarget.checked)} />
        <span>Раздел питания (норма КБЖУ, меню, отметки). Выключи для подростков и при РПП.</span>
      </label>
      {err && <p class="small" style={{ color: 'var(--ogonek)' }} role="alert">{err}</p>}
      <Btn type="submit" icon="arrow" disabled={busy}>{editing ? 'Сохранить' : 'Создать и пригласить'}</Btn>
      {editing && (
        <div class="stack">
          <button type="button" class="link-btn" onClick={() => archive(!f.archived)}>{f.archived ? 'Вернуть из архива' : 'Перенести в архив (закроет вход)'}</button>
          {f.archived && <button type="button" class="link-btn" style={{ color: 'var(--ogonek)' }} onClick={removeForever}>Удалить все данные навсегда</button>}
        </div>
      )}
    </form>
  );
}

function toForm(c) {
  return {
    full_name: c.full_name || '',
    phone: c.phone || '',
    tariff: c.tariff || 'group',
    price: c.price != null ? String(c.price) : '',
    usual_days: c.usual_days || [],
    usual_time: c.usual_time || '',
    paid_until: c.paid_until || '',
    birthday: c.birthday || '',
    goal: c.goal || '',
    limits: c.limits || '',
    note: c.note || '',
    is_minor: !!c.is_minor,
    parent_consent: !!c.parent_consent,
    food_enabled: c.food_enabled !== false,
    archived: !!c.archived,
  };
}
