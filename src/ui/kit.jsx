import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { cacheGet, cacheSet, isNetworkError } from '../lib/api.js';

// ---------- Иконки: рубленые глифы бренда (viewBox 96) ----------
const GLYPHS = {
  today: 'M6 6h30v9H15v21H6zM90 6H60v9h21v21h9zM6 90h30v-9H15V60H6zM90 90H60v-9h21V60h9zM48 34 62 48 48 62 34 48z',
  zal: 'M28 43h40v10H28zM18 24h10v48H18zM8 34h10v28H8zM68 24h10v48H68zM78 34h10v28H78z',
  food: 'M10 40h20v46H10zM38 16h20v70H38zM66 54h20v32H66zM6 90h84v4H6z',
  put: 'M12 34 48 10 84 34v12L48 22 12 46zM12 56 48 32 84 56v12L48 44 12 68zM12 78 48 54 84 78v12L48 66 12 90z',
  person: 'M48 8 62 22 48 36 34 22zM20 88 30 46h36l10 42z',
  msg: 'M10 22h32v30L28 78H16l10-26H10zM54 22h32v30L72 78H60l10-26H54z',
  arrow: 'M8 42h56L44 22h18l26 26-26 26H44l20-20H8z',
  da: 'M8 50 20 38 38 56 76 18 88 30 38 80z',
  net: 'M14 26 26 14 48 36 70 14 82 26 60 48 82 70 70 82 48 60 26 82 14 70 36 48z',
  tenge: 'M14 12h68v12H14zM14 32h68v12H54v44H42V44H14z',
  plus: 'M42 10h12v32h32v12H54v32H42V54H10V42h32z',
};

export function Icon({ name, size = 20, rotate = 0, color = 'currentColor', label }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill={color}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      <path d={GLYPHS[name]} />
    </svg>
  );
}

// ---------- Типографика ----------
export function Hud({ tag, children, style, class: cls }) {
  return (
    <span class={'hud' + (cls ? ' ' + cls : '')} style={style}>
      {tag && <span class="tag">[{tag}] </span>}
      {children}
    </span>
  );
}

export function Udar({ size = 48, children, color, style, as: As = 'div' }) {
  return (
    <As class="udar" style={{ fontSize: size + 'px', color, ...style }}>
      {children}
    </As>
  );
}

// ---------- Кнопки ----------
export function Btn({ kind = 'primary', srez = true, small, center, icon, children, href, onClick, disabled, type = 'button', style }) {
  const cls = `btn btn-${kind}${srez ? ' srez' : ''}${small ? ' btn-sm' : ''}${center ? ' center' : ''}`;
  const inner = (
    <>
      <span>{children}</span>
      {icon && <Icon name={icon} size={18} />}
    </>
  );
  if (href) {
    return (
      <a class={cls} href={href} style={style}>
        {inner}
      </a>
    );
  }
  return (
    <button type={type} class={cls} onClick={onClick} disabled={disabled} style={style}>
      {inner}
    </button>
  );
}

export function Seg({ options, value, onChange, cols, label }) {
  return (
    <div role="group" aria-label={label} class="grid3" style={{ gridTemplateColumns: `repeat(${cols || options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button type="button" class="opt" aria-pressed={String(value === o.value)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Corners({ children, style }) {
  return (
    <div class="corners" style={style}>
      <i />
      <i />
      <i />
      <i />
      {children}
    </div>
  );
}

export function Field({ label, id, children, hint }) {
  return (
    <div class="field">
      {label && (
        <label class="hud" for={id}>
          {label}
        </label>
      )}
      {children}
      {hint && <span class="small muted">{hint}</span>}
    </div>
  );
}

// ---------- Нижнее меню ----------
export function TabBar({ items, current }) {
  return (
    <nav class="tabbar" aria-label="Разделы" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <a class="tab" href={'#/' + it.path} aria-current={current === it.path ? 'page' : undefined}>
          <Icon name={it.icon} size={22} />
          <span class="hud">{it.label}</span>
        </a>
      ))}
    </nav>
  );
}

// ---------- Лист снизу ----------
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', esc);
    };
  }, []);
  return (
    <div class="sheet-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="between">
          <h2 class="h2">{title}</h2>
          <button class="hud hud-btn" onClick={onClose}>
            ЗАКРЫТЬ
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Сообщения ----------
let toastSet = null;
export function toast(text) {
  if (toastSet) toastSet(text);
}
export function ToastHost() {
  const [text, setText] = useState(null);
  const timer = useRef();
  useEffect(() => {
    toastSet = (t) => {
      setText(t);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setText(null), 3200);
    };
    return () => (toastSet = null);
  }, []);
  return text ? (
    <div class="toast" role="status">
      {text}
    </div>
  ) : null;
}

export function errorText(e) {
  if (isNetworkError(e)) return 'Нет связи. Попробуй ещё раз, когда появится интернет.';
  const code = e?.code || e?.message;
  if (code === 'bad_code') return 'Код не подошёл. Проверь цифры или попроси у Анастасии новый.';
  if (code === 'too_many') return 'Слишком много попыток. Подожди час и попробуй снова.';
  return 'Что-то пошло не так. Попробуй ещё раз.';
}

// ---------- Загрузка данных с кэшем ----------
export function useLoad(key, fn, deps = []) {
  const [data, setDataState] = useState(() => (key ? cacheGet(key) : null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fn();
      setDataState(d);
      if (key) cacheSet(key, d);
      setError(null);
      setStale(false);
    } catch (e) {
      console.error(e);
      setError(e);
      setStale(true);
    } finally {
      setLoading(false);
    }
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  const setData = useCallback(
    (upd) => {
      setDataState((prev) => {
        const next = typeof upd === 'function' ? upd(prev) : upd;
        if (key) cacheSet(key, next);
        return next;
      });
    },
    [key],
  );
  return { data, setData, loading, error, stale, reload };
}

export function Loading() {
  return (
    <div class="spinner">
      <span class="hud">ЗАГРУЖАЮ</span>
    </div>
  );
}

export function LoadError({ onRetry }) {
  return (
    <div class="outline">
      <span>Не получилось загрузить. Проверь интернет.</span>
      <button class="link-btn" onClick={onRetry}>
        Попробовать ещё раз
      </button>
    </div>
  );
}

export function Offline({ stale, queued }) {
  if (!stale && !queued) return null;
  return (
    <div class="offline hud">
      {stale ? 'НЕТ СВЯЗИ // ПОКАЗЫВАЮ ПОСЛЕДНЕЕ' : 'НЕТ СВЯЗИ'}
      {queued ? ` // ОТПРАВЛЮ ПОЗЖЕ: ${queued}` : ''}
    </div>
  );
}

// ---------- Маршруты ----------
export function useRoute() {
  const get = () => (location.hash || '#/').slice(2);
  const [path, setPath] = useState(get);
  useEffect(() => {
    const on = () => {
      setPath(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export function go(path) {
  location.hash = '#/' + path;
}

export function Back({ href, children }) {
  return (
    <a class="hud hud-btn" href={href} style={{ alignSelf: 'flex-start', color: 'var(--muted)', textDecoration: 'none' }}>
      <Icon name="arrow" size={14} rotate={180} />
      {children}
    </a>
  );
}
