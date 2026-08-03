-- Выполните этот файл в Supabase SQL Editor поверх уже установленной схемы.
-- Он запрещает анонимные подписи и разрешает запись только после Email OTP.

begin;

alter table public.petition_signatures
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

alter table public.petition_signatures
  add column if not exists email_verified_at timestamptz;

create unique index if not exists petition_signatures_unique_auth_user
  on public.petition_signatures (petition_slug, auth_user_id)
  where auth_user_id is not null;

revoke insert on public.petition_signatures from anon;
grant insert on public.petition_signatures to authenticated;

drop policy if exists "Public can add valid signatures" on public.petition_signatures;
drop policy if exists "Verified users can add valid signatures" on public.petition_signatures;

create policy "Verified users can add valid signatures"
on public.petition_signatures
for insert
to authenticated
with check (
  privacy_consent = true
  and public_display_approved = false
  and auth_user_id = (select auth.uid())
  and email_verified_at is not null
  and lower(btrim(email)) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and exists (
    select 1
    from public.petitions
    where petitions.slug = petition_signatures.petition_slug
      and petitions.is_active = true
  )
);

commit;
