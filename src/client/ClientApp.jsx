import { useEffect, useState } from 'preact/hooks';
import { onQueue } from '../lib/api.js';
import { TabBar, useRoute } from '../ui/kit.jsx';
import { Today } from './Today.jsx';
import { Workout } from './Workout.jsx';
import { Food } from './Food.jsx';
import { Progress } from './Progress.jsx';

const TABS = [
  { path: 'today', label: 'Сегодня', icon: 'today' },
  { path: 'workout', label: 'Тренировка', icon: 'zal' },
  { path: 'food', label: 'Питание', icon: 'food' },
  { path: 'progress', label: 'Прогресс', icon: 'put' },
];

export function ClientApp({ me, onMe }) {
  const path = useRoute();
  const [queued, setQueued] = useState(0);
  useEffect(() => onQueue(setQueued), []);
  const [p0, p1] = path.split('/');
  let screen;
  let tab = 'today';
  const tabs = me.food_enabled === false ? TABS.filter((x) => x.path !== 'food') : TABS;
  if (p0 === 'workout') {
    tab = 'workout';
    screen = <Workout me={me} id={p1} queued={queued} />;
  } else if (p0 === 'food' && me.food_enabled !== false) {
    tab = 'food';
    screen = <Food me={me} queued={queued} />;
  } else if (p0 === 'progress') {
    tab = 'progress';
    screen = <Progress me={me} onMe={onMe} />;
  } else {
    screen = <Today me={me} queued={queued} />;
  }
  return (
    <div class={tab === 'food' ? 'light' : ''} style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {screen}
      <TabBar items={tabs} current={tab} />
    </div>
  );
}
