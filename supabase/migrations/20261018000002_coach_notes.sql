-- Личные заметки тренера о клиентке. Клиентка не видит их даже прямым запросом к базе:
-- раньше заметка лежала в profiles.note, а свою строку profiles клиентка читает целиком.
-- Внешний ключ отложенный: триггер ниже пишет заметку ещё до вставки самой строки profiles.
create table public.coach_notes (
  client_id uuid primary key references public.profiles(id) on delete cascade deferrable initially deferred,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.coach_notes enable row level security;
create policy coach_notes_coach on public.coach_notes
  for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

insert into public.coach_notes (client_id, note)
select id, note from public.profiles where note is not null and note <> '';
update public.profiles set note = null where note is not null;

-- profiles.note остаётся (база меняется только добавлением), но текст в нём не задерживается:
-- всё, что туда пишут (старая версия приложения, функция admin, скрипт импорта), уходит в coach_notes.
create or replace function public.move_profile_note()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.note is not null then
    if btrim(new.note) <> '' then
      insert into public.coach_notes (client_id, note) values (new.id, new.note)
      on conflict (client_id) do update set note = excluded.note, updated_at = now();
    end if;
    new.note := null;
  end if;
  return new;
end $$;
revoke all on function public.move_profile_note() from public, anon, authenticated;

create trigger profiles_move_note
  before insert or update of note on public.profiles
  for each row execute function public.move_profile_note();
