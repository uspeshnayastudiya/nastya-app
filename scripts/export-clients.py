# Выгрузка активных клиенток и замеров из «Клиенты и заявки.xlsx» в JSON для импорта.
# python -I scripts/export-clients.py <xlsx> <out.json>
# JSON содержит личные данные: класть только во временную папку, не в git.
import datetime as dt
import json
import re
import sys

import openpyxl

src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, read_only=True, data_only=True)


def rows(name):
    ws = wb[name]
    data = [r for r in ws.iter_rows(values_only=True) if any(v not in (None, '') for v in r)]
    head = [str(h).strip() if h else '' for h in data[0]]
    return [dict(zip(head, r)) for r in data[1:]]


def s(v):
    # Телефон, записанный в ячейку числом, приходит как 7071234556.0: «.0» дало бы лишнюю цифру.
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip() if v not in (None, '') else ''


def date(v):
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    m = re.match(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', s(v))
    return f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}' if m else None


def num(v):
    try:
        return float(str(v).replace(',', '.'))
    except (TypeError, ValueError):
        return None


clients = []
for r in rows('Клиенты'):
    name = s(r.get('Имя Фамилия'))
    if not name or name.startswith('Пример') or s(r.get('Статус')).lower() != 'активна':
        continue
    raw_phone = s(r.get('Телефон / WhatsApp'))
    digits = re.sub(r'\D', '', raw_phone)
    age = num(r.get('Возраст'))
    minor = age is not None and age < 18
    personal = 'персон' in s(r.get('Формат')).lower()
    limits = s(r.get('Ограничения и травмы'))
    limits = None if limits.lower() in ('', 'нет', '-') else limits
    note_parts = []
    if re.search(r'[^\d\s+()-]', raw_phone):
        note_parts.append(f'Телефон в таблице: {raw_phone}')
    if s(r.get('Опыт в зале')):
        note_parts.append(f'Опыт: {s(r.get("Опыт в зале"))}')
    if date(r.get('Дата старта')):
        d = date(r.get('Дата старта'))
        note_parts.append(f'Старт: {d[8:10]}.{d[5:7]}.{d[0:4]}')
    if s(r.get('Instagram')):
        note_parts.append(f'Instagram: {s(r.get("Instagram"))}')
    if s(r.get('Согласие на съёмку')):
        note_parts.append(f'Согласие на съёмку: {s(r.get("Согласие на съёмку"))}')
    if s(r.get('Заметка')):
        note_parts.append(s(r.get('Заметка')))
    clients.append({
        'full_name': name,
        'phone': digits[:11] or None,
        'tariff': 'personal' if personal else 'group',
        'price': 100000 if personal else 35000,
        'paid_until': date(r.get('Оплачено до')),
        'birthday': date(r.get('День рождения')),
        'goal': s(r.get('Цель')) or None,
        'limits': limits,
        'note': '\n'.join(note_parts) or None,
        'is_minor': minor,
        'parent_consent': False,
        'cycle_enabled': not minor,
        'food_enabled': not minor and 'рпп' not in (limits or '').lower(),
        'usual_days': [0, 2, 4],
        'usual_time': '17:00' if personal else '19:00',
        'age': age,
    })

names = {c['full_name'] for c in clients}
FIELDS = {'Вес, кг': 'weight', 'Бицепс см': 'biceps', 'Грудь, см': 'chest', 'Талия завыш, см': 'waist_high', 'Талия (живот), см': 'waist', 'Попа, см': 'glutes', 'Ляшка , см': 'thigh'}
measures = []
for r in rows('Замеры'):
    name = s(r.get('Клиентка'))
    if name not in names or not date(r.get('Дата')):
        continue
    m = {'full_name': name, 'date': date(r.get('Дата')), 'comment': s(r.get('Комментарий')) or None}
    for k, f in FIELDS.items():
        m[f] = num(r.get(k))
    if any(m[f] is not None for f in FIELDS.values()):
        measures.append(m)
    elif m['comment']:
        # Строка без цифр - это не замер, а заметка Насти: переносим её в заметку клиентки.
        c = next(c for c in clients if c['full_name'] == name)
        line = f'Замеры {m["date"][8:10]}.{m["date"][5:7]}: {m["comment"]}'
        c['note'] = f'{c["note"]}\n{line}' if c['note'] else line

json.dump({'clients': clients, 'measurements': measures}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'clients={len(clients)} measurements={len(measures)}')
