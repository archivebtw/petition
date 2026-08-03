-- Выполните этот файл целиком в Supabase Dashboard → SQL Editor.
-- Скрипт создаёт петицию, приватную таблицу подписей и публичный безопасный счётчик.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.petitions (
  slug text primary key,
  title text not null check (char_length(title) between 3 and 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.petition_signatures (
  id uuid primary key default gen_random_uuid(),
  petition_slug text not null references public.petitions(slug) on update cascade on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  email text not null check (char_length(email) between 5 and 254 and position('@' in email) > 1),
  city text check (city is null or char_length(city) <= 120),
  comment text check (comment is null or char_length(comment) <= 500),
  privacy_consent boolean not null check (privacy_consent = true),
  created_at timestamptz not null default now()
);

create unique index if not exists petition_signatures_unique_email
  on public.petition_signatures (petition_slug, lower(btrim(email)));

create index if not exists petition_signatures_created_at_idx
  on public.petition_signatures (petition_slug, created_at desc);

create table if not exists public.petition_stats (
  petition_slug text primary key references public.petitions(slug) on update cascade on delete cascade,
  signature_count bigint not null default 0 check (signature_count >= 0),
  updated_at timestamptz not null default now()
);

insert into public.petitions (slug, title, is_active)
values (
  'uyutnoe-gnezdyshko-tankzora',
  'Остановим цифровую деградацию: закроем «Уютное гнездышко танкзора Chatа»',
  true
)
on conflict (slug) do update
set title = excluded.title;

insert into public.petition_stats (petition_slug, signature_count)
values ('uyutnoe-gnezdyshko-tankzora', 0)
on conflict (petition_slug) do nothing;

-- Пересчитываем счётчик на случай повторного запуска SQL после тестовых вставок.
update public.petition_stats stats
set signature_count = (
  select count(*)
  from public.petition_signatures signatures
  where signatures.petition_slug = stats.petition_slug
), updated_at = now();

create or replace function private.increment_petition_signature_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.petition_stats
  set signature_count = signature_count + 1,
      updated_at = now()
  where petition_slug = new.petition_slug;

  return new;
end;
$$;

revoke all on function private.increment_petition_signature_count() from public, anon, authenticated;

drop trigger if exists increment_petition_signature_count on public.petition_signatures;
create trigger increment_petition_signature_count
after insert on public.petition_signatures
for each row execute function private.increment_petition_signature_count();

alter table public.petitions enable row level security;
alter table public.petition_signatures enable row level security;
alter table public.petition_stats enable row level security;

-- Сначала отзываем всё, затем выдаём минимально необходимые права.
revoke all on public.petitions from anon, authenticated;
revoke all on public.petition_signatures from anon, authenticated;
revoke all on public.petition_stats from anon, authenticated;

grant select on public.petitions to anon, authenticated;
grant insert on public.petition_signatures to anon, authenticated;
grant select on public.petition_stats to anon, authenticated;

drop policy if exists "Public can read active petitions" on public.petitions;
create policy "Public can read active petitions"
on public.petitions
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Public can add valid signatures" on public.petition_signatures;
create policy "Public can add valid signatures"
on public.petition_signatures
for insert
to anon, authenticated
with check (
  privacy_consent = true
  and exists (
    select 1
    from public.petitions
    where petitions.slug = petition_signatures.petition_slug
      and petitions.is_active = true
  )
);

-- Отдельной SELECT-политики для petition_signatures намеренно нет:
-- посетители не могут читать имена, email, города или комментарии.

drop policy if exists "Public can read petition counters" on public.petition_stats;
create policy "Public can read petition counters"
on public.petition_stats
for select
to anon, authenticated
using (true);

commit;
