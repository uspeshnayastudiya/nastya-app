import { useState } from 'preact/hooks';
import { supabase } from '../lib/supabase.js';
import { giveConsent, loadProfile, redeem, cacheSet } from '../lib/api.js';
import { Btn, errorText, Field } from '../ui/kit.jsx';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function Welcome({ onSignedIn }) {
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const digits = code.replace(/\D/g, '');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (digits.length !== 6) {
      setErr('Введи 6 цифр из приглашения.');
      return;
    }
    if (!consent) {
      setErr('Поставь галочку согласия, без неё войти нельзя.');
      return;
    }
    setBusy(true);
    try {
      const s = await redeem(digits);
      const { data, error } = await supabase.auth.setSession(s);
      if (error) throw error;
      await giveConsent();
      const p = await loadProfile(data.user.id);
      cacheSet('me', p);
      onSignedIn(p);
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="screen notabs" onSubmit={submit} style={{ minHeight: '100vh' }}>
      <div class="shtrih" style={{ width: '120px', height: '72px' }} />
      <header class="stack">
        <div class="udar" style={{ fontSize: '64px', color: 'var(--ogonek)' }}>Анастасия</div>
        <span class="hud">ТРЕНЕР // АЛМАТЫ</span>
      </header>
      <div style={{ flex: 1, minHeight: '24px' }} />
      {isIOS() && !isStandalone() && (
        <p class="outline small muted">
          Сначала нажми «Поделиться» внизу Safari и «На экран Домой». Потом открой иконку и введи код уже там.
        </p>
      )}
      <div class="stack">
        <h1 style={{ margin: 0, fontSize: '22px', lineHeight: 1.3, fontWeight: 500 }}>
          Привет. Это твоё приложение для тренировок с Анастасией.
        </h1>
        <p class="muted">Здесь план на каждую тренировку, твои веса, питание и самочувствие.</p>
      </div>
      <Field label="КОД ИЗ ПРИГЛАШЕНИЯ" id="code">
        <input
          id="code"
          class="input input-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onInput={(e) => setCode(e.currentTarget.value)}
          placeholder="000000"
        />
      </Field>
      <label class="check muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} />
        <span>
          Согласна, что Анастасия хранит мои данные о тренировках, питании, самочувствии и цикле, чтобы вести меня.
          Данные видишь ты и Анастасия. Технически к базе есть доступ у администратора приложения, он помогает с поддержкой и резервными копиями.
        </span>
      </label>
      {err && <p class="small" style={{ color: 'var(--ogonek)' }} role="alert">{err}</p>}
      <Btn type="submit" icon="arrow" disabled={busy}>
        {busy ? 'Вхожу...' : 'Войти'}
      </Btn>
      <span class="hud center">БЕЗ ПАРОЛЕЙ // ВХОД ОДИН РАЗ</span>
    </form>
  );
}

export function Consent({ onAgree }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div class="screen notabs">
      <div class="udar" style={{ fontSize: '56px', color: 'var(--ogonek)' }}>Анастасия</div>
      <p>Чтобы вести тебя, Анастасии нужно хранить данные о твоих тренировках, питании, самочувствии и цикле.</p>
      <label class="check muted">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.currentTarget.checked)} />
        <span>
          Согласна. Данные видишь ты и Анастасия. Технически к базе есть доступ у администратора приложения, он помогает с поддержкой и резервными копиями.
        </span>
      </label>
      <Btn
        disabled={!ok || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onAgree();
          } finally {
            setBusy(false);
          }
        }}
      >
        Продолжить
      </Btn>
    </div>
  );
}
