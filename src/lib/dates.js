// Даты храним строкой 'YYYY-MM-DD' в местном времени телефона.

export const pad = (n) => String(n).padStart(2, '0');

export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today() {
  return iso(new Date());
}

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function addMonths(s, n) {
  const d = parse(s);
  d.setMonth(d.getMonth() + n);
  return iso(d);
}

// a - b в днях
export function diffDays(a, b) {
  return Math.round((parse(a) - parse(b)) / 86400000);
}

// 0 = понедельник ... 6 = воскресенье
export function weekday(s) {
  return (parse(s).getDay() + 6) % 7;
}

export function weekStart(s) {
  return addDays(s, -weekday(s));
}

export const WD = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
export const WD_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export function ddmm(s) {
  if (!s) return '';
  const d = parse(s);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

export function monthName(s) {
  return MONTHS[parse(s).getMonth()];
}

// «19-25 ОКТЯБРЯ» или «29 СЕНТЯБРЯ - 5 ОКТЯБРЯ»
export function weekLabel(start) {
  const end = addDays(start, 6);
  const a = parse(start);
  const b = parse(end);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}-${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} - ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}

export function hhmm(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// «через 3 дня», «завтра», «сегодня», «2 дня назад»
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function relDays(n) {
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчера';
  const w = plural(n, 'день', 'дня', 'дней');
  return n > 0 ? `через ${n} ${w}` : `${-n} ${w} назад`;
}
