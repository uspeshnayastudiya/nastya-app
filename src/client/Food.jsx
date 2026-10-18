import { useMemo, useState } from 'preact/hooks';
import { addExtra, foodDay, removeExtra, saveFoodDay } from '../lib/api.js';
import { today, ddmm, WD, weekday, hhmm } from '../lib/dates.js';
import { dayTarget, generateMenu, money, shoppingList, swapItem } from '../lib/logic.js';
import { Btn, Hud, Icon, LoadError, Loading, Offline, Seg, Sheet, Udar, useLoad } from '../ui/kit.jsx';

const QUICK = ['Сладкое', 'Выпечка', 'Фастфуд', 'Алкоголь', 'Перекус'];

export function Food({ me, queued }) {
  const t = today();
  const { data, setData, loading, stale, reload } = useLoad('food:' + t, () => foodDay(me.id, t), [me.id, t]);
  const [text, setText] = useState('');
  const [shop, setShop] = useState(false);
  const target = data ? dayTarget(me.nutrition, data.training) : null;

  const menu = useMemo(() => {
    if (!data || !target) return [];
    if (data.day?.menu?.length) return data.day.menu;
    return generateMenu(data.recipes, target, me.id + t);
  }, [data?.day?.menu, data?.recipes, target?.kcal, target?.c]);

  if (!data && loading) return <div class="screen"><Loading /></div>;
  if (!data) return <div class="screen"><LoadError onRetry={reload} /></div>;

  const status = data.day?.status || null;

  function setStatus(s) {
    setData((d) => ({ ...d, day: { ...(d.day || {}), status: s } }));
    saveFoodDay(me.id, t, { status: s });
  }
  function swap(i) {
    const next = swapItem(menu, i, data.recipes, target, me.id + t + Date.now());
    setData((d) => ({ ...d, day: { ...(d.day || {}), menu: next } }));
    saveFoodDay(me.id, t, { menu: next });
  }
  function add(v) {
    const s = String(v || '').trim();
    if (!s) return;
    const row = addExtra(me.id, t, s);
    setData((d) => ({ ...d, extras: [...d.extras, row] }));
    setText('');
  }
  function del(id) {
    setData((d) => ({ ...d, extras: d.extras.filter((x) => x.id !== id) }));
    removeExtra(id);
  }

  return (
    <div class="screen light">
      <Offline stale={stale} queued={queued} />
      <header class="stack">
        <Hud>{`ПИТАНИЕ // ${WD[weekday(t)]} ${ddmm(t)} // НОРМА НА ДЕНЬ`}</Hud>
        {target ? (
          <>
            <div class="row" style={{ alignItems: 'baseline' }}>
              <h1 class="udar" style={{ fontSize: '64px', lineHeight: 0.8 }}>{money(target.kcal)}</h1>
              <span class="wide" style={{ fontSize: '16px' }}>ККАЛ</span>
            </div>
            {target.extraC > 0 && (
              <span class="srez hud" style={{ alignSelf: 'flex-start', background: 'var(--ogonek)', color: '#0a0a0a', padding: '5px 16px 5px 10px' }}>
                ДЕНЬ ТРЕНИРОВКИ // +{target.extraC} Г УГЛЕВОДОВ
              </span>
            )}
          </>
        ) : (
          <>
            <Udar size={48}>Питание</Udar>
            <p class="muted">Анастасия ещё не поставила твою норму. Пока можно отмечать, как прошёл день.</p>
          </>
        )}
      </header>

      {target && (
        <div class="grid3">
          {[['БЕЛКИ', target.p], ['ЖИРЫ', target.f], ['УГЛЕВОДЫ', target.c]].map(([l, v]) => (
            <div class="card tight">
              <Hud>{l}</Hud>
              <span class="row" style={{ alignItems: 'baseline', gap: '4px' }}>
                <span class="udar" style={{ fontSize: '34px' }}>{Math.round(v)}</span>
                <span class="small muted">г</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {target && menu.length > 0 && (
        <section aria-label="Меню на день" class="stack">
          {menu.map((it, i) => (
            <div class="card" style={{ padding: '6px 14px 14px', gap: '4px' }}>
              <div class="between">
                <Hud>{`${it.mealName} // ${it.kcal} ККАЛ`}</Hud>
                <button class="hud hud-btn" style={{ color: 'var(--accent-text)' }} aria-label={`Заменить: ${it.mealName}`} onClick={() => swap(i)}>
                  ЗАМЕНИТЬ
                </button>
              </div>
              <span style={{ fontSize: '16px', fontWeight: 500 }}>{it.name}</span>
              <span class="small muted">{`Б ${it.p} · Ж ${it.f} · У ${it.c} · ${it.grams} г`}</span>
            </div>
          ))}
          <Btn kind="dark" icon="arrow" onClick={() => setShop(true)} style={{ background: 'var(--raised)', fontWeight: 500 }}>
            Список покупок
          </Btn>
        </section>
      )}

      <section aria-labelledby="day-t" class="card" style={{ background: '#0a0a0a', color: '#f4f4f2' }}>
        <h2 id="day-t" class="h2">Как день по еде?</h2>
        <div role="group" aria-labelledby="day-t" class="grid2">
          <button class="opt" style={status === 'plan' ? null : { background: '#2b2b2b', color: '#f4f4f2' }} aria-pressed={String(status === 'plan')} onClick={() => setStatus('plan')}>По плану</button>
          <button class="opt" style={status === 'off' ? null : { background: '#2b2b2b', color: '#f4f4f2' }} aria-pressed={String(status === 'off')} onClick={() => setStatus('off')}>Отклонилась</button>
        </div>
        <p class="small" style={{ color: '#9a9a96' }}>Отклонилась - не провал. Просто отметь, завтра продолжаем.</p>
        {status === 'off' && (
          <div class="stack" style={{ paddingTop: '12px', borderTop: '1px solid #333331' }}>
            <label for="extra" style={{ fontSize: '15px', fontWeight: 700 }}>Что съела вне плана?</label>
            <div class="wrap" role="group" aria-label="Добавить быстро">
              {QUICK.map((q) => (
                <button class="opt" style={{ background: '#2b2b2b', color: '#f4f4f2' }} onClick={() => add(q)}>+ {q}</button>
              ))}
            </div>
            <form
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '6px' }}
              onSubmit={(e) => {
                e.preventDefault();
                add(text);
              }}
            >
              <input id="extra" class="input" style={{ background: '#2b2b2b', color: '#f4f4f2', boxShadow: 'none' }} value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="Кусок торта на дне рождения" />
              <Btn small type="submit" style={{ width: 'auto' }}>Добавить</Btn>
            </form>
            {data.extras.map((x) => (
              <div class="between" style={{ padding: '8px 0', borderBottom: '1px solid #333331' }}>
                <span style={{ fontSize: '14px' }}>{x.text}</span>
                <span class="row" style={{ gap: '4px' }}>
                  <span class="hud" style={{ color: '#9a9a96' }}>{hhmm(new Date(x.created_at))}</span>
                  <button aria-label={`Удалить: ${x.text}`} style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9a96' }} onClick={() => del(x.id)}>
                    <Icon name="net" size={12} />
                  </button>
                </span>
              </div>
            ))}
            <Hud style={{ color: '#9a9a96' }}>АНАСТАСИЯ УВИДИТ // БЕЗ ОЦЕНОК</Hud>
          </div>
        )}
      </section>

      {shop && <ShopSheet menu={menu} recipes={data.recipes} onClose={() => setShop(false)} />}
    </div>
  );
}

function ShopSheet({ menu, recipes, onClose }) {
  const [days, setDays] = useState(3);
  const [got, setGot] = useState({});
  const groups = shoppingList(menu, recipes, days);
  return (
    <Sheet title="Список покупок" onClose={onClose}>
      <Seg label="На сколько дней" value={days} onChange={setDays} options={[1, 2, 3, 5, 7].map((d) => ({ value: d, label: `${d} дн` }))} />
      <p class="small muted">Меню на день повторяется. Вес продуктов сырой, крупы сухие.</p>
      {groups.map((g) => (
        <div class="stack">
          <Hud>{g.dept}</Hud>
          {g.items.map((it) => (
            <label class="check" style={{ minHeight: '36px', alignItems: 'center' }}>
              <input type="checkbox" checked={!!got[it.name]} onChange={(e) => setGot({ ...got, [it.name]: e.currentTarget.checked })} />
              <span class="grow" style={{ textDecoration: got[it.name] ? 'line-through' : 'none', opacity: got[it.name] ? 0.5 : 1 }}>{it.name}</span>
              <span class="muted">{it.g >= 1000 ? `${String(it.g / 1000).replace('.', ',')} кг` : `${it.g} г`}</span>
            </label>
          ))}
        </div>
      ))}
    </Sheet>
  );
}
