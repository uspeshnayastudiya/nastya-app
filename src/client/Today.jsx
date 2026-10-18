import { useState } from 'preact/hooks';
import { clientHome, removeAbsence, saveAbsence, saveCheckin, saveFlow } from '../lib/api.js';
import { today, ddmm, WD, weekday, diffDays } from '../lib/dates.js';
import { cycleInfo, firstName, money, PHASE_NAME, PHASE_TIP, upcoming, waLink } from '../lib/logic.js';
import { Btn, Hud, Icon, LoadError, Loading, Offline, Udar, useLoad } from '../ui/kit.jsx';

const ROWS = [
  ['energy', 'Энергия', ['Мало', 'Норм', 'Много']],
  ['sleep', 'Сон', ['Плохо', 'Норм', 'Хорошо']],
  ['doms', 'Крепатура', ['Нет', 'Есть', 'Сильная']],
];
const FLOW = ['Нет', 'Да', 'Чуть-чуть'];

export function Today({ me, queued }) {
  const t = today();
  const { data, setData, loading, error, stale, reload } = useLoad('home', () => clientHome(me.id), [me.id]);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');

  if (!data && loading) return <div class="screen"><Loading /></div>;
  if (!data) return <div class="screen"><LoadError onRetry={reload} /></div>;

  const { current, next, overdue } = upcoming(data.workouts, t);
  const cyc = me.cycle_enabled ? cycleInfo(data.cycle, { today: t, contraception: me.contraception }) : { known: false };
  const flowToday = (data.cycle.find((d) => d.date === t) || {}).flow;
  const checkin = data.checkin || {};
  const absent = data.absences.find((a) => a.date === t);
  const isToday = current && current.date === t;

  const payDays = me.paid_until ? diffDays(me.paid_until, t) : null;
  const showPay = payDays !== null && payDays <= 5;

  function setCheck(field, value) {
    const values = { energy: checkin.energy ?? null, sleep: checkin.sleep ?? null, doms: checkin.doms ?? null, [field]: value };
    setData((d) => ({ ...d, checkin: { ...(d.checkin || {}), ...values, date: t } }));
    saveCheckin(me.id, t, values);
  }
  function setFlow(v) {
    setData((d) => ({ ...d, cycle: [...d.cycle.filter((x) => x.date !== t), { date: t, flow: v }] }));
    saveFlow(me.id, t, v);
  }
  function skip() {
    setData((d) => ({ ...d, absences: [...d.absences.filter((a) => a.date !== t), { date: t, reason }] }));
    saveAbsence(me.id, t, reason.trim());
    setAsking(false);
  }
  function unskip() {
    setData((d) => ({ ...d, absences: d.absences.filter((a) => a.date !== t) }));
    removeAbsence(me.id, t);
    setReason('');
  }

  const headHud = `${WD[weekday(t)]} ${ddmm(t)}${cyc.known && cyc.day ? ` // ДЕНЬ ${cyc.day} ЦИКЛА` : ''}`;
  const exCount = current?.workout_exercises?.[0]?.count;

  return (
    <div class="screen">
      <Offline stale={stale} queued={queued} />
      {showPay && (
        <div class="row" style={{ minHeight: '36px', padding: '0 12px', background: 'var(--raised)', color: 'var(--muted)' }}>
          <Icon name="tenge" size={14} />
          <span class="hud grow">
            {payDays >= 0 ? `ОПЛАТА ЗА ТРЕНИРОВКИ ДО ${ddmm(me.paid_until)}` : `ОПЛАТА ЗА ТРЕНИРОВКИ БЫЛА ДО ${ddmm(me.paid_until)}`}
          </span>
          {me.price ? <span class="hud" style={{ color: 'var(--ink)' }}>{money(me.price)} ₸</span> : null}
        </div>
      )}

      <header class="between" style={{ alignItems: 'flex-start' }}>
        <div class="stack" style={{ gap: '6px' }}>
          <Hud>{headHud}</Hud>
          <span style={{ fontSize: '18px', fontWeight: 500 }}>Привет, {firstName(me.full_name)}</span>
        </div>
        {data.coach?.phone && (
          <a
            href={waLink(data.coach.phone, '')}
            target="_blank"
            rel="noopener"
            aria-label="Написать Анастасии в WhatsApp"
            style={{ width: '44px', height: '44px', background: 'var(--zhelezo)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="msg" size={20} />
          </a>
        )}
      </header>

      <section aria-label="Тренировка" class="card" style={{ position: 'relative', padding: '20px' }}>
        <div class="shtrih" />
        {current ? (
          <>
            <Hud tag="ТРЕНИРОВКА" style={{ paddingRight: '84px' }}>
              {[current.time, 'WORKOUT GYM'].filter(Boolean).join(' // ')}
              {!isToday ? ` // ${WD[weekday(current.date)]} ${ddmm(current.date)}` : ''}
            </Hud>
            <h1 class="udar" style={{ fontSize: '64px', display: 'flex', flexDirection: 'column' }}>
              <span>{isToday ? 'Сегодня' : overdue ? 'Пропущена' : WD_WORD[weekday(current.date)]}</span>
              <span style={{ alignSelf: 'flex-end', color: 'var(--ogonek)' }}>{current.title || 'Тренировка'}</span>
            </h1>
            {isToday && absent ? (
              <>
                <p>Отметила, что не придёшь. Анастасия в курсе.</p>
                <button class="link-btn" onClick={unskip}>Всё-таки приду</button>
              </>
            ) : asking ? (
              <>
                <label for="reason" style={{ fontSize: '15px', fontWeight: 700 }}>Что случилось? Можно не писать</label>
                <input id="reason" class="input" value={reason} onInput={(e) => setReason(e.currentTarget.value)} placeholder="Заболела, задержали на работе" />
                <div class="grid2">
                  <Btn center onClick={skip}>Точно не приду</Btn>
                  <Btn kind="dark" center srez={false} onClick={() => setAsking(false)}>Отмена</Btn>
                </div>
              </>
            ) : (
              <>
                <p class="muted">
                  {exCount ? `${exCount} ${exCount < 5 ? 'упражнения' : 'упражнений'}. ` : ''}
                  {overdue ? 'Тренировка не отмечена сделанной, она ждёт тебя.' : 'Анастасия рядом и смотрит технику.'}
                </p>
                <Btn href={`#/workout/${current.id}`} icon="arrow">Открыть тренировку</Btn>
                {isToday && <button class="link-btn" onClick={() => setAsking(true)}>Не получится прийти</button>}
              </>
            )}
          </>
        ) : (
          <>
            <Hud tag="ТРЕНИРОВКА">ПЛАН</Hud>
            <Udar size={44}>Скоро</Udar>
            <p class="muted">Анастасия распишет тренировки, и они появятся здесь.</p>
          </>
        )}
      </section>

      {next.length > 0 && (
        <section aria-labelledby="next-t" class="stack">
          <h2 id="next-t" class="hud" style={{ margin: 0 }}>ДАЛЬШЕ НА НЕДЕЛЕ</h2>
          <div class="grid2">
            {next.map((w) => (
              <a href={`#/workout/${w.id}`} class="card tight" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Hud>{`${WD[weekday(w.date)]} ${ddmm(w.date)}${w.time ? ' // ' + w.time : ''}`}</Hud>
                <Udar size={30}>{w.title || 'Тренировка'}</Udar>
              </a>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="ci-t" class="card">
        <div class="between" style={{ alignItems: 'baseline' }}>
          <h2 id="ci-t" class="h2">Как ты сегодня?</h2>
          <Hud>10 СЕКУНД</Hud>
        </div>
        {ROWS.map(([key, label, opts]) => (
          <div role="group" aria-label={label} class="stack">
            <span class="small muted">{label}</span>
            <div class="grid3">
              {opts.map((o, i) => (
                <button class="opt" aria-pressed={String(checkin[key] === i)} onClick={() => setCheck(key, i)}>{o}</button>
              ))}
            </div>
          </div>
        ))}
        {me.cycle_enabled && (
          <div role="group" aria-label="Месячные" class="stack">
            <span class="small muted">Месячные</span>
            <div class="grid3">
              {FLOW.map((o, i) => (
                <button class="opt" aria-pressed={String((flowToday ?? -1) === i)} onClick={() => setFlow(i)}>{o}</button>
              ))}
            </div>
          </div>
        )}
        <Hud>СОХРАНЯЕТСЯ САМО // АНАСТАСИЯ ВИДИТ</Hud>
      </section>

      {me.cycle_enabled && cyc.known && cyc.phase && (
        <section class="outline" aria-label="Подсказка Анастасии">
          <Hud tag="ЦИКЛ">{`ДЕНЬ ${cyc.day} // ${PHASE_NAME[cyc.phase]}`}</Hud>
          <p>{PHASE_TIP[cyc.phase]}</p>
          <Hud>АНАСТАСИЯ</Hud>
        </section>
      )}
      {me.cycle_enabled && cyc.known && cyc.late && !me.contraception && (
        <section class="outline">
          <Hud tag="ЦИКЛ">ЗАДЕРЖКА</Hud>
          <p>Месячные задерживаются дольше обычного. Если так бывает не первый раз или что-то беспокоит, покажись гинекологу.</p>
        </section>
      )}
      {me.cycle_enabled && !cyc.known && (
        <section class="outline">
          <Hud tag="ЦИКЛ">НЕТ ДАННЫХ</Hud>
          <p class="muted">Отмечай месячные здесь. Через месяц приложение подскажет фазу, а Анастасия подстроит тренировки.</p>
        </section>
      )}
    </div>
  );
}

const WD_WORD = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
