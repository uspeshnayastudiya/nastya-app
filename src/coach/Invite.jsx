import { useEffect, useState } from 'preact/hooks';
import { cacheGet, coachClients, newInvite } from '../lib/api.js';
import { APP_URL } from '../lib/supabase.js';
import { WD } from '../lib/dates.js';
import { inviteText, waLink } from '../lib/logic.js';
import { Back, Btn, Corners, errorText, Hud, Icon, toast, Udar } from '../ui/kit.jsx';
import { TARIFF } from './Clients.jsx';

export function Invite({ id }) {
  const [c, setC] = useState(() => (cacheGet('clients') || []).find((x) => x.id === id) || null);
  const [code, setCode] = useState(() => sessionStorage.getItem('invite:' + id));
  const [busy, setBusy] = useState(false);
  const fresh = !!sessionStorage.getItem('invite-new:' + id);

  useEffect(() => {
    coachClients().then((list) => setC(list.find((x) => x.id === id) || null)).catch(() => {});
  }, [id]);

  async function make() {
    setBusy(true);
    try {
      const r = await newInvite(id);
      sessionStorage.setItem('invite:' + id, r.code);
      setCode(r.code);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const text = c && code ? inviteText(c, code, APP_URL) : '';
  const spaced = code ? `${code.slice(0, 3)} ${code.slice(3)}` : '';

  return (
    <div class="screen">
      <Back href={`#/client/${id}`}>КАРТОЧКА</Back>
      {fresh || code ? (
        <Hud style={{ color: 'var(--laym)', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Icon name="da" size={14} /> {code ? 'КОД ГОТОВ' : ''}
        </Hud>
      ) : null}
      <Udar size={52} as="h1">{c ? c.full_name : 'Приглашение'}</Udar>
      {c && (
        <Hud>{[TARIFF[c.tariff], (c.usual_days || []).map((d) => WD[d]).join(' '), c.usual_time].filter(Boolean).join(' // ')}</Hud>
      )}
      {code ? (
        <>
          <Corners>
            <Hud>КОД ДЛЯ ВХОДА // ДЕЙСТВУЕТ 7 ДНЕЙ</Hud>
            <span class="udar" style={{ fontSize: '72px', lineHeight: 0.8, letterSpacing: '.04em' }}>{spaced}</span>
          </Corners>
          <section class="stack">
            <Hud>СООБЩЕНИЕ В WHATSAPP</Hud>
            <p class="card" style={{ fontSize: '14px', lineHeight: 1.45, padding: '14px' }}>{text}</p>
          </section>
          {c?.phone ? (
            <a class="btn btn-primary srez" href={waLink(c.phone, text)} target="_blank" rel="noopener">
              <span>Отправить в WhatsApp</span>
              <Icon name="arrow" size={18} />
            </a>
          ) : (
            <p class="small muted">Номер WhatsApp не указан. Скопируй сообщение и отправь сама.</p>
          )}
          <Btn
            kind="dark"
            small
            center
            srez={false}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                toast('Скопировано.');
              } catch {
                toast('Не получилось скопировать. Выдели текст и скопируй вручную.');
              }
            }}
          >
            Скопировать
          </Btn>
          <Hud>НОВЫЙ ТЕЛЕФОН ИЛИ ПОТЕРЯЛА ВХОД // НОВЫЙ КОД ЗДЕСЬ ЖЕ</Hud>
          <button class="link-btn" disabled={busy} onClick={make}>Сделать новый код (старый перестанет работать)</button>
        </>
      ) : (
        <>
          <p class="muted">Код показывается один раз. Если нужен вход заново, сделай новый код: старый перестанет работать.</p>
          <Btn disabled={busy} onClick={make}>{busy ? 'Создаю...' : 'Сделать код для входа'}</Btn>
        </>
      )}
    </div>
  );
}
