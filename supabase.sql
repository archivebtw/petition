-- Выполните файл целиком в Supabase Dashboard → SQL Editor.
-- Скрипт можно запускать повторно: он обновляет существующую схему.

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
  public_display_consent boolean not null default false,
  public_display_approved boolean not null default false,
  privacy_consent boolean not null check (privacy_consent = true),
  created_at timestamptz not null default now()
);

-- Миграция для первой версии сайта.
alter table public.petition_signatures
  add column if not exists public_display_consent boolean not null default false;
alter table public.petition_signatures
  add column if not exists public_display_approved boolean not null default false;

create unique index if not exists petition_signatures_unique_email
  on public.petition_signatures (petition_slug, lower(btrim(email)));
create index if not exists petition_signatures_created_at_idx
  on public.petition_signatures (petition_slug, created_at desc);
create index if not exists petition_signatures_public_feed_idx
  on public.petition_signatures (petition_slug, public_display_consent, public_display_approved, created_at desc);

create table if not exists public.petition_stats (
  petition_slug text primary key references public.petitions(slug) on update cascade on delete cascade,
  signature_count bigint not null default 0 check (signature_count >= 0),
  updated_at timestamptz not null default now()
);

-- Пользователи Supabase Auth, которым разрешена модерация.
create table if not exists public.petition_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Технические таблицы используются только Edge Functions с service role.
create table if not exists public.petition_submission_limits (
  fingerprint text primary key,
  last_submitted_at timestamptz not null default now()
);

create table if not exists public.signature_deletion_tokens (
  id uuid primary key default gen_random_uuid(),
  signature_id uuid not null references public.petition_signatures(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
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

update public.petition_stats stats
set signature_count = (
  select count(*)
  from public.petition_signatures signatures
  where signatures.petition_slug = stats.petition_slug
), updated_at = now();

create or replace function private.change_petition_signature_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.petition_stats
    set signature_count = signature_count + 1,
        updated_at = now()
    where petition_slug = new.petition_slug;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.petition_stats
    set signature_count = greatest(0, signature_count - 1),
        updated_at = now()
    where petition_slug = old.petition_slug;
    return old;
  end if;

  return null;
end;
$$;

revoke all on function private.change_petition_signature_count() from public, anon, authenticated;

drop trigger if exists increment_petition_signature_count on public.petition_signatures;
drop trigger if exists change_petition_signature_count on public.petition_signatures;
create trigger change_petition_signature_count
after insert or delete on public.petition_signatures
for each row execute function private.change_petition_signature_count();

-- Безопасная публичная лента. Функция возвращает только разрешённые и
-- одобренные поля, не раскрывая email и внутренний UUID подписи.
create or replace function public.get_public_petition_signatures(
  p_petition_slug text,
  p_limit integer default 6
)
returns table (
  display_name text,
  city text,
  comment text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    signatures.display_name,
    signatures.city,
    signatures.comment,
    signatures.created_at
  from public.petition_signatures signatures
  join public.petitions petitions
    on petitions.slug = signatures.petition_slug
  where signatures.petition_slug = p_petition_slug
    and petitions.is_active = true
    and signatures.public_display_consent = true
    and signatures.public_display_approved = true
  order by signatures.created_at desc
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;

revoke all on function public.get_public_petition_signatures(text, integer) from public;
grant execute on function public.get_public_petition_signatures(text, integer) to anon, authenticated;

alter table public.petitions enable row level security;
alter table public.petition_signatures enable row level security;
alter table public.petition_stats enable row level security;
alter table public.petition_admins enable row level security;
alter table public.petition_submission_limits enable row level security;
alter table public.signature_deletion_tokens enable row level security;

revoke all on public.petitions from anon, authenticated;
revoke all on public.petition_signatures from anon, authenticated;
revoke all on public.petition_stats from anon, authenticated;
revoke all on public.petition_admins from anon, authenticated;
revoke all on public.petition_submission_limits from anon, authenticated;
revoke all on public.signature_deletion_tokens from anon, authenticated;

grant select on public.petitions to anon, authenticated;
grant insert on public.petition_signatures to anon, authenticated;
grant select on public.petition_stats to anon, authenticated;

-- Права админ-панели. Доступ всё равно ограничивается RLS-политиками ниже.
grant select, delete on public.petition_signatures to authenticated;
grant update (public_display_approved) on public.petition_signatures to authenticated;
grant select on public.petition_admins to authenticated;

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
  and public_display_approved = false
  and exists (
    select 1
    from public.petitions
    where petitions.slug = petition_signatures.petition_slug
      and petitions.is_active = true
  )
);

-- Для anon нет SELECT-политики: личные данные нельзя прочитать публичным ключом.
drop policy if exists "Public can read petition counters" on public.petition_stats;
create policy "Public can read petition counters"
on public.petition_stats
for select
to anon, authenticated
using (true);

-- Администратор видит только собственную запись в списке админов.
drop policy if exists "Admins can read own admin record" on public.petition_admins;
create policy "Admins can read own admin record"
on public.petition_admins
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Admins can read signatures" on public.petition_signatures;
create policy "Admins can read signatures"
on public.petition_signatures
for select
to authenticated
using (
  exists (
    select 1 from public.petition_admins admins
    where admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can moderate signatures" on public.petition_signatures;
create policy "Admins can moderate signatures"
on public.petition_signatures
for update
to authenticated
using (
  exists (
    select 1 from public.petition_admins admins
    where admins.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.petition_admins admins
    where admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete signatures" on public.petition_signatures;
create policy "Admins can delete signatures"
on public.petition_signatures
for delete
to authenticated
using (
  exists (
    select 1 from public.petition_admins admins
    where admins.user_id = (select auth.uid())
  )
);

commit;

-- КАК ДОБАВИТЬ АДМИНИСТРАТОРА
-- 1. Создайте пользователя в Authentication → Users.
-- 2. Скопируйте его UUID и выполните отдельно:
-- insert into public.petition_admins (user_id)
-- values ('UUID-ПОЛЬЗОВАТЕЛЯ')
-- on conflict (user_id) do nothing;
