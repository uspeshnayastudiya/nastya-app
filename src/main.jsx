import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './styles.css';
import { supabase } from './lib/supabase.js';
import { cacheGet, cacheSet, cacheClear, flush, giveConsent, loadProfile, touch } from './lib/api.js';
import { Loading, ToastHost } from './ui/kit.jsx';
import { Welcome, Consent } from './client/Welcome.jsx';
import { ClientApp } from './client/ClientApp.jsx';
import { CoachApp } from './coach/CoachApp.jsx';

function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(() => cacheGet('me'));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    loadProfile(session.user.id)
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        cacheSet('me', p);
      })
      .catch((e) => console.error(e));
    touch();
    flush();
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  if (session === undefined) return <Loading />;
  if (!session) return <Welcome onSignedIn={(p) => p && setProfile(p)} />;
  if (!profile || profile.id !== session.user.id) return <Loading />;
  if (profile.archived) return <Archived />;
  if (profile.role === 'coach') return <CoachApp me={profile} onMe={setProfile} />;
  if (!profile.consent_at) {
    return (
      <Consent
        onAgree={async () => {
          await giveConsent();
          const p = await loadProfile(profile.id);
          setProfile(p);
          cacheSet('me', p);
        }}
      />
    );
  }
  return <ClientApp me={profile} onMe={(p) => { setProfile(p); cacheSet('me', p); }} />;
}

function Archived() {
  return (
    <div class="screen notabs">
      <div class="udar" style={{ fontSize: '48px', color: 'var(--ogonek)' }}>Анастасия</div>
      <p>Доступ к приложению закрыт. Если это ошибка, напиши Анастасии.</p>
      <button
        class="link-btn"
        onClick={async () => {
          cacheClear();
          await supabase.auth.signOut();
        }}
      >
        Выйти
      </button>
    </div>
  );
}

render(
  <>
    <App />
    <ToastHost />
  </>,
  document.getElementById('app'),
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
