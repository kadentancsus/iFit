-- 0001_identity: user profiles (display name, display unit, timezone).
--
-- Depends only on Supabase Auth (auth.users, auth.uid()). Every sign-up gets a
-- profile automatically, so the app never has to create one.
--
-- Access model:
--   * A profile is private to its user. There is no way to read another
--     user's profile, even by guessing their ID.
--   * Clients get column-level INSERT/UPDATE grants, so user_id can't be
--     supplied by a client at all; it always comes from auth.uid().
--   * There is no delete policy; a profile is removed only when its account is.
--   * Weights are always stored in kilograms elsewhere. display_unit only
--     controls how the app shows them.

create function public.identity_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 1 and 50 and display_name = btrim(display_name)),
  display_unit text not null default 'kg' check (display_unit in ('kg', 'lb')),
  -- An IANA zone name such as America/Los_Angeles; validated by a trigger
  -- because CHECK constraints cannot look up pg_timezone_names.
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per account: display preferences only. Private to its user.';

create function public.profiles_validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone
      using errcode = 'check_violation', column = 'timezone';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_validate_timezone();

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.identity_touch_updated_at();

-- Create a profile for every new account ----------------------------------------
--
-- Uses the display_name sent at sign-up when present, otherwise the part of
-- the email before the @. A timezone sent at sign-up is used only when valid.
-- Security definer because it writes to public.profiles on behalf of Auth.
create function public.identity_create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  requested_zone text := new.raw_user_meta_data ->> 'timezone';
begin
  if requested_name = '' then
    requested_name := btrim(split_part(coalesce(new.email, ''), '@', 1));
  end if;
  if requested_name = '' then
    requested_name := 'Athlete';
  end if;

  if requested_zone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = requested_zone) then
    requested_zone := 'UTC';
  end if;

  insert into public.profiles (user_id, display_name, timezone)
  values (new.id, btrim(left(requested_name, 50)), requested_zone)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.identity_create_profile() from public, anon, authenticated;

create trigger identity_create_profile
  after insert on auth.users
  for each row execute function public.identity_create_profile();

-- Row-level security ------------------------------------------------------------

alter table public.profiles enable row level security;

create policy profiles_owner_select on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Lets the API restore a missing profile (for accounts created before this
-- migration); the trigger covers every new sign-up.
create policy profiles_owner_insert on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Privileges --------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated;

grant select on public.profiles to authenticated;
grant insert (display_name, display_unit, timezone),
      update (display_name, display_unit, timezone)
  on public.profiles to authenticated;

-- Profiles for accounts that already exist when this migration runs.
insert into public.profiles (user_id, display_name)
select
  users.id,
  coalesce(nullif(btrim(left(split_part(coalesce(users.email, ''), '@', 1), 50)), ''), 'Athlete')
from auth.users as users
on conflict (user_id) do nothing;
