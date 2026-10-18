import { describe, expect, it } from 'vitest';
import { addDays, diffDays, weekday, weekStart, weekLabel, relDays } from '../src/lib/dates.js';
import {
  num, parseNum, money, weightText, schemeText, progression, cycleInfo, upcoming, flagsFor,
  birthdayIn, dayTarget, generateMenu, swapItem, shoppingList, menuTotals, waLink, payText, inviteText,
} from '../src/lib/logic.js';
import { RECIPES } from '../src/data/recipes.js';

describe('даты', () => {
  it('сдвиг и разница дней через границу месяца', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(diffDays('2026-11-02', '2026-10-30')).toBe(3);
  });
  it('понедельник = 0', () => {
    expect(weekday('2026-10-19')).toBe(0);
    expect(weekday('2026-10-25')).toBe(6);
    expect(weekStart('2026-10-22')).toBe('2026-10-19');
  });
  it('подпись недели', () => {
    expect(weekLabel('2026-10-19')).toBe('19-25 октября');
    expect(weekLabel('2026-09-28')).toBe('28 сентября - 4 октября');
  });
  it('относительные дни', () => {
    expect(relDays(0)).toBe('сегодня');
    expect(relDays(3)).toBe('через 3 дня');
    expect(relDays(5)).toBe('через 5 дней');
  });
});

describe('числа и веса', () => {
  it('запятая вместо точки', () => {
    expect(num(32.5)).toBe('32,5');
    expect(num(30)).toBe('30');
    expect(parseNum('32,5 кг')).toBe(32.5);
    expect(parseNum('')).toBe(null);
    expect(money(100000)).toBe('100 000');
  });
  it('подписи веса', () => {
    expect(weightText({ unit: 'kg', weight: 14, per_hand: true })).toBe('2 × 14 кг');
    expect(weightText({ unit: 'kg', weight: null })).toBe('задать');
    expect(weightText({ unit: 'sec' })).toBe('без веса');
    expect(schemeText({ sets: 4, reps_min: 10, reps_max: 12, unit: 'kg', step: 2.5 })).toBe('4 × 10-12 // шаг 2,5 кг');
    expect(schemeText({ sets: 3, reps_min: 30, reps_max: 30, unit: 'sec' })).toBe('3 × 30 сек');
  });
});

describe('прогрессия', () => {
  const ex = { sets: 4, reps_min: 10, reps_max: 12 };
  it('все подходы на верх диапазона и легко = добавить', () => {
    expect(progression(ex, { sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }, { reps: 12 }], feel: 'easy' })).toBe('up');
  });
  it('не добрала повторы = держать', () => {
    expect(progression(ex, { sets: [{ reps: 12 }, { reps: 11 }, { reps: 12 }, { reps: 12 }], feel: 'easy' })).toBe('keep');
  });
  it('тяжело = держать, больно = снизить', () => {
    expect(progression(ex, { sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }, { reps: 12 }], feel: 'hard' })).toBe('keep');
    expect(progression(ex, { sets: [{ reps: 12 }], feel: 'pain' })).toBe('down');
  });
  it('нет истории = нет подсказки', () => {
    expect(progression(ex, null)).toBe('none');
  });
});

describe('цикл', () => {
  const days = [];
  for (const start of ['2026-08-17', '2026-09-14', '2026-10-12']) {
    for (let i = 0; i < 5; i++) days.push({ date: addDays(start, i), flow: 1 });
  }
  it('день и фаза', () => {
    const c = cycleInfo(days, { today: '2026-10-19' });
    expect(c.known).toBe(true);
    expect(c.avg).toBe(28);
    expect(c.day).toBe(8);
    expect(c.phase).toBe('follicular');
    expect(c.nextStart).toBe('2026-11-09');
  });
  it('в дни месячных', () => {
    const c = cycleInfo(days, { today: '2026-10-13' });
    expect(c.phase).toBe('menstrual');
    expect(c.periodToday).toBe(true);
  });
  it('на контрацепции фазу не считаем', () => {
    expect(cycleInfo(days, { today: '2026-10-19', contraception: true }).phase).toBe(null);
  });
  it('нет данных', () => {
    expect(cycleInfo([], { today: '2026-10-19' }).known).toBe(false);
  });
});

describe('ближайшие тренировки', () => {
  const w = [
    { id: 'a', date: '2026-10-19', status: 'planned' },
    { id: 'b', date: '2026-10-21', status: 'planned' },
    { id: 'c', date: '2026-10-23', status: 'planned' },
    { id: 'z', date: '2026-10-16', status: 'done' },
  ];
  it('пропущенная остаётся первой', () => {
    const u = upcoming(w, '2026-10-20');
    expect(u.current.id).toBe('a');
    expect(u.overdue).toBe(true);
    expect(u.next.map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('сегодняшняя', () => {
    const u = upcoming(w.slice(1), '2026-10-21');
    expect(u.current.id).toBe('b');
    expect(u.overdue).toBe(false);
  });
});

describe('флажки смены', () => {
  const today = '2026-10-19';
  it('оплата, тишина, ДР', () => {
    const c = { id: '1', full_name: 'Жанна О.', paid_until: '2026-10-17', birthday: '1998-10-22', created_at: '2026-09-01T00:00:00Z' };
    const f = flagsFor(c, { today, checkins: [{ client_id: '1', date: '2026-10-13' }], cycle: [], pains: [] });
    expect(f.map((x) => x.kind)).toEqual(['quiet', 'pay', 'bday']);
    expect(f[0].text).toBe('6 дней не отмечалась в приложении');
    expect(f[1].overdue).toBe(2);
    expect(f[2].text).toBe('День рождения через 3 дня');
  });
  it('месячные сегодня', () => {
    const c = { id: '2', full_name: 'Дана С.' };
    const f = flagsFor(c, { today, checkins: [{ client_id: '2', date: today, energy: 0 }], cycle: [{ client_id: '2', date: '2026-10-18', flow: 1 }, { client_id: '2', date: today, flow: 1 }], pains: [] });
    expect(f[0].kind).toBe('cycle');
    expect(f[0].text).toContain('2 день месячных');
  });
  it('день рождения через год', () => {
    expect(birthdayIn('1990-01-05', '2026-12-30')).toBe(6);
  });
});

describe('тексты', () => {
  it('без длинных тире', () => {
    const c = { full_name: 'Сабина Н.', price: 35000 };
    for (const t of [payText(c), inviteText(c, '482913', 'https://x.y/')]) {
      expect(t).not.toMatch(/[—–]/);
    }
  });
  it('ссылка WhatsApp нормализует номер', () => {
    expect(waLink('8 701 234 56 78', 'привет')).toBe('https://wa.me/77012345678?text=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82');
  });
});

describe('питание', () => {
  const recipes = RECIPES.map((r, i) => ({ ...r, id: 'r' + i }));
  const target = dayTarget({ kcal: 1650, p: 120, f: 55, c: 165, train_c: 30 }, true);
  it('норма в день тренировки', () => {
    expect(target).toEqual({ kcal: 1770, p: 120, f: 55, c: 195, extraC: 30 });
  });
  it('у каждого рецепта КБЖУ сходится с калориями', () => {
    for (const r of RECIPES) {
      const k = r.p * 4 + r.f * 9 + r.c * 4;
      expect(Math.abs(k - r.kcal) / r.kcal).toBeLessThan(0.12);
    }
  });
  it('меню попадает в норму с точностью 7%', () => {
    const menu = generateMenu(recipes, target, 'test');
    expect(menu).toHaveLength(4);
    const t = menuTotals(menu);
    expect(Math.abs(t.kcal - target.kcal) / target.kcal).toBeLessThan(0.07);
    expect(new Set(menu.map((m) => m.recipe_id)).size).toBe(4);
  });
  it('замена меняет блюдо той же роли', () => {
    const menu = generateMenu(recipes, target, 'test');
    const next = swapItem(menu, 1, recipes, target, 's1');
    expect(next[1].recipe_id).not.toBe(menu[1].recipe_id);
    expect(next[1].meal).toBe('lunch');
  });
  it('список покупок по отделам', () => {
    const menu = generateMenu(recipes, target, 'test');
    const list = shoppingList(menu, recipes, 3);
    expect(list.length).toBeGreaterThan(1);
    expect(list.every((g) => g.items.every((i) => i.g > 0))).toBe(true);
  });
});
