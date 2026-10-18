import { useState } from 'preact/hooks';
import { coachClients, coachPayments, markPaid } from '../lib/api.js';
import { addDays, ddmm, diffDays, monthName, plural, relDays, today } from '../lib/dates.js';
import { money, payText, waLink } from '../lib/logic.js';
import { Btn, Hud, LoadError, Loading, Offline, toast, Udar, useLoad } from '../ui/kit.jsx';

export const TARIFF = { group: 'ГРУППОВАЯ', personal: 'ПЕРСОНАЛЬНАЯ' };

export function Clients() {
  const t = today();
  const { data, setData, loading, stale, reload } = useLoad('clients', () => coachClients(), []);
  const monthStart = t.slice(0, 8) + '01';
  const prevStart = addDays(monthStart, -1).slice(0, 8) + '01';
  const monthEnd = addDays(addDays(monthStart, 32).slice(0, 8) + '01', -1);
  const pay = useLoad('payments', () => coachPayments(prevStart), [prevStart]);
  const [showArchive, setShowArchive] = useState(false);
  if (!data && loading) return <div class="screen"><Loading /></div>;
  if (!data) return <div class="screen"><LoadError onRetry={reload} /></div>;

  const active = data.filter((c) => !c.archived);
  const archived = data.filter((c) => c.archived);
  const days = (c) => (c.paid_until ? diffDays(c.paid_until, t) : null);
  const overdue = active.filter((c) => days(c) !== null && days(c) < 0);
  const paid = active.filter((c) => days(c) !== null && days(c) >= 0).length;
  const waiting = overdue.reduce((s, c) => s + (c.price || 0), 0);
  const sorted = [...active].filter((c) => !overdue.includes(c)).sort((a, b) => (a.paid_until || '9999') < (b.paid_until || '9999') ? -1 : 1);
  const nPersonal = active.filter((c) => c.tariff === 'personal').length;
  // Заработок: оплаты, отмеченные кнопкой «Оплатила». «Ожидаем» - просроченные и те, чья оплата кончается в этом месяце.
  const sum = (list) => list.reduce((s, p) => s + (p.amount || 0), 0);
  const pays = pay.data || [];
  const thisMonth = pays.filter((p) => p.paid_at >= monthStart);
  const prevSum = sum(pays.filter((p) => p.paid_at < monthStart));
  const dueLeft = active.filter((c) => c.paid_until && c.paid_until <= monthEnd).reduce((s, c) => s + (c.price || 0), 0);

  async function paidNow(c) {
    try {
      const until = await markPaid(c.id, c.price || null);
      setData((d) => d.map((x) => (x.id === c.id ? { ...x, paid_until: until } : x)));
      pay.reload();
      toast(`${c.full_name}: оплачено до ${ddmm(until)}`);
    } catch {
      toast('Не сохранилось. Проверь интернет.');
    }
  }

  return (
    <div class="screen">
      <Offline stale={stale} />
      <header class="stack">
        <Udar size={52} as="h1">Клиентки</Udar>
        <Hud>
          {`${active.length} ${plural(active.length, 'АКТИВНАЯ', 'АКТИВНЫЕ', 'АКТИВНЫХ')} // ` +
            `${nPersonal} ${plural(nPersonal, 'ПЕРСОНАЛЬНАЯ', 'ПЕРСОНАЛЬНЫЕ', 'ПЕРСОНАЛЬНЫХ')} // ` +
            `${active.length - nPersonal} ${plural(active.length - nPersonal, 'ГРУППОВАЯ', 'ГРУППОВЫЕ', 'ГРУППОВЫХ')}`}
        </Hud>
      </header>
      <Btn kind="light" href="#/clients/new" icon="plus">Добавить клиентку</Btn>

      <section aria-label="Заработок за месяц" class="card" style={{ gap: '8px' }}>
        <Hud tag="ЗАРАБОТОК">{`${monthName(t).toUpperCase()} // ПОЛУЧЕНО`}</Hud>
        <span class="row" style={{ alignItems: 'baseline', gap: '6px' }}>
          <span class="udar" style={{ fontSize: '56px', lineHeight: 0.9 }}>{pay.data ? money(sum(thisMonth)) : '...'}</span>
          <span class="small muted">₸</span>
        </span>
        <Hud>
          {[
            `${thisMonth.length} ${plural(thisMonth.length, 'ОПЛАТА', 'ОПЛАТЫ', 'ОПЛАТ')}`,
            dueLeft ? `ДО ${ddmm(monthEnd)} ОЖИДАЕМ ЕЩЁ ${money(dueLeft)} ₸` : null,
            prevSum ? `${monthName(prevStart).toUpperCase()}: ${money(prevSum)} ₸` : null,
          ].filter(Boolean).join(' // ')}
        </Hud>
      </section>

      <div class="grid2">
        <div class="card tight">
          <Hud>ОПЛАТИЛИ</Hud>
          <span class="row" style={{ alignItems: 'baseline', gap: '6px' }}><span class="udar" style={{ fontSize: '36px' }}>{paid}</span><span class="small muted">из {active.length}</span></span>
        </div>
        <div class="card tight">
          <Hud>ЖДЁМ</Hud>
          <span class="row" style={{ alignItems: 'baseline', gap: '6px' }}><span class="udar" style={{ fontSize: '36px' }}>{money(waiting)}</span><span class="small muted">₸</span></span>
        </div>
      </div>

      {overdue.map((c) => (
        <section aria-label={`Оплата просрочена: ${c.full_name}`} class="card hot">
          <div class="between" style={{ alignItems: 'flex-start' }}>
            <a href={`#/client/${c.id}`} class="stack" style={{ gap: '4px', color: 'inherit', textDecoration: 'none' }}>
              <span style={{ fontSize: '16px', fontWeight: 500 }}>{c.full_name}</span>
              <Hud>{`${TARIFF[c.tariff] || ''}${c.price ? ` // ${money(c.price)} ₸` : ''}`}</Hud>
            </a>
            <Hud style={{ color: 'var(--ogonek)' }}>{`ДО ${ddmm(c.paid_until)} // +${-days(c)} ДН`}</Hud>
          </div>
          <p class="small muted">«{payText(c)}»</p>
          <div class="grid2">
            {c.phone ? (
              <a class="btn btn-dark btn-sm srez center" href={waLink(c.phone, payText(c))} target="_blank" rel="noopener">Написать</a>
            ) : (
              <span class="hud" style={{ alignSelf: 'center' }}>НЕТ НОМЕРА</span>
            )}
            <Btn kind="laym" small center onClick={() => paidNow(c)}>Оплатила</Btn>
          </div>
        </section>
      ))}

      <section aria-labelledby="list-t" class="stack" style={{ gap: '6px' }}>
        <h2 id="list-t" class="hud" style={{ margin: 0 }}>ПО СРОКУ ОПЛАТЫ</h2>
        {sorted.map((c) => {
          const d = days(c);
          return (
            <a href={`#/client/${c.id}`} class="card tight" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '12px', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
              <span class="stack" style={{ gap: '3px' }}>
                <span style={{ fontWeight: 500 }}>{c.full_name}</span>
                <Hud>{`${TARIFF[c.tariff] || 'ТАРИФ НЕ УКАЗАН'}${c.price ? ` // ${money(c.price)} ₸` : ''}`}</Hud>
              </span>
              <span class="stack" style={{ gap: '3px', alignItems: 'flex-end' }}>
                <span class="small">{c.paid_until ? `до ${ddmm(c.paid_until)}` : 'нет даты'}</span>
                {d !== null && d <= 3 && <Hud style={{ color: 'var(--ink)' }}>{relDays(d).toUpperCase()}</Hud>}
                {!c.consent_at && <Hud>НЕ ВОШЛА</Hud>}
              </span>
            </a>
          );
        })}
      </section>

      {archived.length > 0 && (
        <section class="stack">
          <button class="hud hud-btn" onClick={() => setShowArchive(!showArchive)}>{showArchive ? 'СКРЫТЬ АРХИВ' : `АРХИВ (${archived.length})`}</button>
          {showArchive &&
            archived.map((c) => (
              <a href={`#/client/${c.id}`} class="outline" style={{ color: 'var(--muted)', textDecoration: 'none' }}>{c.full_name}</a>
            ))}
        </section>
      )}
    </div>
  );
}
