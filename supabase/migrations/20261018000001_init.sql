-- Приложение Анастасии: начальная схема.
-- Правило: клиентка видит и меняет только свои строки, тренер (role = 'coach') видит всё.

create extension if not exists pgcrypto;

-- ---------- Профили ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('coach', 'client')),
  full_name text not null,
  phone text,
  tariff text check (tariff in ('group', 'personal')),
  price integer,
  usual_days smallint[] not null default '{}',      -- 0 = понедельник ... 6 = воскресенье
  usual_time text,
  paid_until date,
  goal text,
  limits text,
  note text,
  birthday date,
  is_minor boolean not null default false,
  parent_consent boolean not null default false,
  cycle_enabled boolean not null default true,
  cycle_share boolean not null default true,
  contraception boolean not null default false,
  food_enabled boolean not null default true,
  nutrition jsonb not null default '{}'::jsonb,       -- {kcal, p, f, c, train_c}
  consent_at timestamptz,
  last_seen_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'coach' and not archived
  );
$$;

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_coach());
create policy profiles_update_coach on public.profiles
  for update to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- ---------- Приглашения (только через Edge Functions) ----------
create table public.invites (
  code text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  uses integer not null default 0,
  max_uses integer not null default 5,
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;

create table public.redeem_attempts (
  id bigserial primary key,
  ip text,
  ok boolean not null,
  at timestamptz not null default now()
);
alter table public.redeem_attempts enable row level security;
create index redeem_attempts_at on public.redeem_attempts (at);

-- ---------- Тренировки ----------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  time text,
  title text not null default '',
  from_template text,
  status text not null default 'planned' check (status in ('planned', 'done')),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index workouts_client_date on public.workouts (client_id, date);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null default 0,
  name text not null,
  sets integer not null default 3 check (sets between 1 and 20),
  reps_min integer,
  reps_max integer,
  unit text not null default 'kg' check (unit in ('kg', 'sec', 'none')),
  per_hand boolean not null default false,
  weight numeric(6, 2),
  step numeric(5, 2),
  weight_change jsonb,                                  -- {by, from, to, at}
  feel text check (feel in ('easy', 'ok', 'hard', 'pain')),
  created_at timestamptz not null default now()
);
create index workout_exercises_workout on public.workout_exercises (workout_id);
create index workout_exercises_client on public.workout_exercises (client_id, name);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  set_no integer not null,
  reps integer,
  weight numeric(6, 2),
  created_at timestamptz not null default now(),
  unique (exercise_id, set_no)
);
create index set_logs_client on public.set_logs (client_id, created_at);

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (client_id, date)
);

-- ---------- Самочувствие и цикл ----------
create table public.checkins (
  client_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  energy smallint check (energy between 0 and 2),
  sleep smallint check (sleep between 0 and 2),
  doms smallint check (doms between 0 and 2),
  updated_at timestamptz not null default now(),
  primary key (client_id, date)
);

create table public.cycle_days (
  client_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  flow smallint not null check (flow between 0 and 2),  -- 0 нет, 1 да, 2 чуть-чуть
  primary key (client_id, date)
);

-- ---------- Замеры и оплаты ----------
create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  date date not null default current_date,
  weight numeric(5, 1),
  biceps numeric(5, 1),
  chest numeric(5, 1),
  waist_high numeric(5, 1),
  waist numeric(5, 1),
  glutes numeric(5, 1),
  thigh numeric(5, 1),
  comment text,
  created_at timestamptz not null default now()
);
create index measurements_client on public.measurements (client_id, date);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  paid_at date not null default current_date,
  amount integer,
  until date,
  created_at timestamptz not null default now()
);

-- ---------- Питание ----------
create table public.food_days (
  client_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  status text check (status in ('plan', 'off')),
  menu jsonb,                                           -- сохранённое меню дня
  primary key (client_id, date)
);

create table public.food_extras (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index food_extras_client on public.food_extras (client_id, date);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('breakfast', 'main', 'snack')),
  method text,
  minutes integer,
  portion_g integer not null,
  kcal numeric(6, 1) not null,
  p numeric(5, 1) not null,
  f numeric(5, 1) not null,
  c numeric(5, 1) not null,
  ingredients jsonb not null default '[]'::jsonb,       -- [{name, g, dept}] на базовую порцию
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Шаблоны ----------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('day', 'week')),
  name text not null,
  title text not null default '',
  exercises jsonb not null default '[]'::jsonb,         -- день: [{name, sets, reps_min, reps_max, unit, per_hand, step}]
  days jsonb not null default '[]'::jsonb,              -- неделя: [id шаблона дня, ...]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Права на данные клиенток ----------
do $$
declare t text;
begin
  foreach t in array array[
    'workouts', 'workout_exercises', 'set_logs', 'absences', 'checkins',
    'measurements', 'payments', 'food_days', 'food_extras'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (client_id = auth.uid() or public.is_coach())
         with check (client_id = auth.uid() or public.is_coach())',
      t || '_own_or_coach', t);
  end loop;
end $$;

-- Цикл: клиентка видит своё, тренер только если клиентка делится.
alter table public.cycle_days enable row level security;
create policy cycle_own on public.cycle_days
  for all to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());
create policy cycle_coach_read on public.cycle_days
  for select to authenticated
  using (
    public.is_coach() and exists (
      select 1 from public.profiles p
      where p.id = cycle_days.client_id and p.cycle_share and p.cycle_enabled
    )
  );

-- Оплаты меняет только тренер, клиентка видит свои.
drop policy payments_own_or_coach on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (client_id = auth.uid() or public.is_coach());
create policy payments_coach on public.payments
  for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

alter table public.recipes enable row level security;
create policy recipes_read on public.recipes for select to authenticated using (true);
create policy recipes_coach on public.recipes for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

alter table public.templates enable row level security;
create policy templates_coach on public.templates for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- ---------- Функции для клиентки (меняют только разрешённые поля своего профиля) ----------
create or replace function public.me_touch()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

create or replace function public.me_consent()
returns void language sql security definer set search_path = public as $$
  update public.profiles set consent_at = coalesce(consent_at, now()) where id = auth.uid();
$$;

create or replace function public.me_cycle_settings(p_enabled boolean, p_share boolean, p_contraception boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set cycle_enabled = p_enabled, cycle_share = p_share, contraception = p_contraception
   where id = auth.uid();
$$;

create or replace function public.coach_contact()
returns table (full_name text, phone text)
language sql stable security definer set search_path = public as $$
  select full_name, phone from public.profiles
   where role = 'coach' and not archived
   order by created_at limit 1;
$$;

-- Отметить оплату: месяц от прежней даты (если просрочка до 14 дней) или от сегодня.
create or replace function public.coach_mark_paid(p_client uuid, p_amount integer)
returns date language plpgsql security definer set search_path = public as $$
declare
  v_old date;
  v_from date;
  v_new date;
begin
  if not public.is_coach() then
    raise exception 'only coach';
  end if;
  select paid_until into v_old from public.profiles where id = p_client;
  v_from := case
    when v_old is not null and v_old >= current_date - 14 then v_old
    else current_date
  end;
  v_new := (v_from + interval '1 month')::date;
  update public.profiles set paid_until = v_new where id = p_client;
  insert into public.payments (client_id, amount, until) values (p_client, p_amount, v_new);
  return v_new;
end $$;

-- Лёгкий запрос для ежедневного «пинга», чтобы бесплатный проект не уснул.
create or replace function public.ping()
returns text language sql stable as $$ select 'ok'::text $$;

revoke all on function public.coach_mark_paid(uuid, integer) from public, anon;
revoke all on function public.me_touch() from public, anon;
revoke all on function public.me_consent() from public, anon;
revoke all on function public.me_cycle_settings(boolean, boolean, boolean) from public, anon;
revoke all on function public.coach_contact() from public, anon;
grant execute on function public.coach_mark_paid(uuid, integer) to authenticated;
grant execute on function public.me_touch() to authenticated;
grant execute on function public.me_consent() to authenticated;
grant execute on function public.me_cycle_settings(boolean, boolean, boolean) to authenticated;
grant execute on function public.coach_contact() to authenticated;
grant execute on function public.ping() to anon, authenticated;

-- ---------- Целостность: client_id берётся из родительской строки ----------
create or replace function public.sync_exercise_client()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select w.client_id into new.client_id from public.workouts w where w.id = new.workout_id;
  if new.client_id is null then
    raise exception 'workout not found';
  end if;
  return new;
end $$;
create trigger workout_exercises_client
  before insert or update of workout_id on public.workout_exercises
  for each row execute function public.sync_exercise_client();

create or replace function public.sync_setlog_client()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select e.client_id into new.client_id from public.workout_exercises e where e.id = new.exercise_id;
  if new.client_id is null then
    raise exception 'exercise not found';
  end if;
  return new;
end $$;
create trigger set_logs_client
  before insert or update of exercise_id on public.set_logs
  for each row execute function public.sync_setlog_client();

-- Вес поменяла клиентка: запоминаем, с какого на какой, чтобы Настя решила. Правка тренера отметку снимает.
create or replace function public.track_weight_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.weight is distinct from old.weight then
    if public.is_coach() then
      new.weight_change := null;
    else
      new.weight_change := jsonb_build_object(
        'by', 'client',
        'from', coalesce((old.weight_change ->> 'from')::numeric, old.weight),
        'to', new.weight,
        'at', now()
      );
    end if;
  end if;
  return new;
end $$;
create trigger workout_exercises_weight
  before update on public.workout_exercises
  for each row execute function public.track_weight_change();
