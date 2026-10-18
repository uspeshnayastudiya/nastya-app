import { TabBar, useRoute } from '../ui/kit.jsx';
import { Shift } from './Shift.jsx';
import { Clients } from './Clients.jsx';
import { ClientForm } from './ClientForm.jsx';
import { Invite } from './Invite.jsx';
import { ClientCard } from './ClientCard.jsx';
import { Program } from './Program.jsx';
import { Templates, TemplateEdit } from './Templates.jsx';
import { CoachSettings } from './CoachSettings.jsx';

const TABS = [
  { path: 'shift', label: 'Смена', icon: 'today' },
  { path: 'clients', label: 'Клиентки', icon: 'person' },
  { path: 'templates', label: 'Шаблоны', icon: 'zal' },
];

export function CoachApp({ me, onMe }) {
  const path = useRoute();
  const parts = path.split('/');
  const [p0, p1, p2] = parts;
  let screen;
  let tab = 'shift';
  if (p0 === 'clients' && p1 === 'new') {
    tab = 'clients';
    screen = <ClientForm />;
  } else if (p0 === 'clients') {
    tab = 'clients';
    screen = <Clients />;
  } else if (p0 === 'client' && p2 === 'edit') {
    tab = 'clients';
    screen = <ClientForm id={p1} />;
  } else if (p0 === 'client' && p2 === 'invite') {
    tab = 'clients';
    screen = <Invite id={p1} />;
  } else if (p0 === 'client' && p2 === 'program') {
    tab = 'clients';
    screen = <Program id={p1} start={parts[3]} />;
  } else if (p0 === 'client' && p1) {
    tab = 'clients';
    screen = <ClientCard id={p1} />;
  } else if (p0 === 'templates') {
    tab = 'templates';
    screen = <Templates />;
  } else if (p0 === 'template' && p1) {
    tab = 'templates';
    screen = <TemplateEdit id={p1} />;
  } else if (p0 === 'me') {
    screen = <CoachSettings me={me} onMe={onMe} />;
  } else {
    screen = <Shift me={me} />;
  }
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {screen}
      <TabBar items={TABS} current={tab} />
    </div>
  );
}
