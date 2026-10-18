import { useState } from 'preact/hooks';
import { supabase } from '../lib/supabase.js';
import { cacheClear, cacheSet, updateProfile } from '../lib/api.js';
import { Back, Btn, errorText, Field, Hud, toast, Udar } from '../ui/kit.jsx';

export function CoachSettings({ me, onMe }) {
  const [name, setName] = useState(me.full_name || '');
  const [phone, setPhone] = useState(me.phone || '');
  const [busy, setBusy] = useState(false);
  return (
    <div class="screen">
      <Back href="#/shift">СМЕНА</Back>
      <Udar size={44} as="h1">Мои данные</Udar>
      <Field label="ИМЯ ДЛЯ КЛИЕНТОК" id="s-name">
        <input id="s-name" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </Field>
      <Field label="МОЙ WHATSAPP" id="s-phone" hint="Клиентки увидят кнопку «Написать Анастасии».">
        <input id="s-phone" class="input" type="tel" value={phone} onInput={(e) => setPhone(e.currentTarget.value)} placeholder="+7 7xx xxx xx xx" />
      </Field>
      <Btn
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const p = await updateProfile(me.id, { full_name: name.trim() || 'Анастасия', phone: phone.trim() || null });
            cacheSet('me', p);
            onMe(p);
            toast('Сохранено.');
          } catch (e) {
            toast(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Сохранить
      </Btn>
      <Hud>ВЕРСИЯ {__APP_VERSION__}</Hud>
      <button
        class="link-btn"
        onClick={async () => {
          if (!confirm('Выйти из приложения? Чтобы войти снова, понадобится новый код.')) return;
          cacheClear();
          await supabase.auth.signOut();
        }}
      >
        Выйти
      </button>
    </div>
  );
}
