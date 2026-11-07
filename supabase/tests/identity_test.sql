-- pgTAP checks for 0001_identity. Run with scripts/verify-database.sh, which
-- applies every migration and the seed first. Everything rolls back at the end.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

-- Fixtures, created as the migration owner. A and B are two separate accounts.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-1111-4000-8000-000000000001', 'alex@ifit.test',
   '{"display_name": "  Alex  ", "timezone": "America/Los_Angeles"}'),
  ('bbbbbbbb-1111-4000-8000-000000000001', 'bailey@ifit.test', '{}'),
  ('cccccccc-1111-4000-8000-000000000001', 'casey@ifit.test',
   '{"timezone": "Mars/Olympus_Mons"}'),
  ('dddddddd-1111-4000-8000-000000000001', null, null);

-- Structure and sign-up ---------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'row-level security is enabled on profiles'
);

select results_eq(
  $$select display_name, display_unit, timezone from public.profiles
    where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'$$,
  $$values ('Alex'::text, 'kg'::text, 'America/Los_Angeles'::text)$$,
  'sign-up creates a profile from the trimmed name and time zone sent at sign-up'
);

select is(
  (select display_name from public.profiles where user_id = 'bbbbbbbb-1111-4000-8000-000000000001'),
  'bailey', 'without a name, the profile uses the part of the email before the @'
);

select is(
  (select timezone from public.profiles where user_id = 'cccccccc-1111-4000-8000-000000000001'),
  'UTC', 'an unknown time zone sent at sign-up falls back to UTC'
);

select is(
  (select display_name from public.profiles where user_id = 'dddddddd-1111-4000-8000-000000000001'),
  'Athlete', 'an account with no name or email still gets a profile'
);

select throws_ok(
  $$update public.profiles set display_unit = 'stone'
    where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'$$,
  '23514', null, 'only kg and lb are valid display units'
);

select throws_ok(
  $$update public.profiles set display_name = ''
    where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'$$,
  '23514', null, 'a display name cannot be empty'
);

select throws_ok(
  $$update public.profiles set display_name = repeat('x', 51)
    where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'$$,
  '23514', null, 'a display name is at most 50 characters'
);

select throws_ok(
  $$update public.profiles set timezone = 'Not/AZone'
    where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'$$,
  '23514', null, 'an unknown time zone is rejected'
);

-- Anonymous access --------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select * from public.profiles$$,
  '42501', null, 'anon cannot read profiles at all'
);

-- Signed in as A ----------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1111-4000-8000-000000000001","role":"authenticated"}';
set local request.jwt.claim.sub = 'aaaaaaaa-1111-4000-8000-000000000001';

select results_eq(
  $$select user_id from public.profiles$$,
  $$values ('aaaaaaaa-1111-4000-8000-000000000001'::uuid)$$,
  'A sees only their own profile'
);

select is_empty(
  $$select 1 from public.profiles where user_id = 'bbbbbbbb-1111-4000-8000-000000000001'$$,
  'A cannot read B''s profile by ID'
);

select lives_ok(
  $$update public.profiles
    set display_name = 'Alex P', display_unit = 'lb', timezone = 'Europe/London'
    where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'$$,
  'A can update their own name, unit and time zone'
);

select results_eq(
  $$select display_name, display_unit, timezone from public.profiles$$,
  $$values ('Alex P'::text, 'lb'::text, 'Europe/London'::text)$$,
  'A''s changes are saved'
);

select ok(
  (select updated_at >= created_at from public.profiles),
  'updated_at is maintained on update'
);

select is_empty(
  $$update public.profiles set display_name = 'Taken over'
    where user_id = 'bbbbbbbb-1111-4000-8000-000000000001' returning user_id$$,
  'A cannot edit B''s profile'
);

select throws_ok(
  $$update public.profiles set user_id = 'bbbbbbbb-1111-4000-8000-000000000001'$$,
  '42501', null, 'A cannot change which account a profile belongs to'
);

select throws_ok(
  $$update public.profiles set created_at = now() - interval '1 year'$$,
  '42501', null, 'A cannot rewrite created_at'
);

select throws_ok(
  $$insert into public.profiles (user_id, display_name)
    values ('bbbbbbbb-1111-4000-8000-000000000001', 'Fake B')$$,
  '42501', null, 'A cannot create a profile for another user ID'
);

select throws_ok(
  $$insert into public.profiles (display_name) values ('Second A')$$,
  '23505', null, 'A cannot create a second profile'
);

select throws_ok(
  $$delete from public.profiles$$,
  '42501', null, 'A cannot delete a profile directly'
);

select throws_ok(
  $$select public.identity_create_profile()$$,
  '42501', null, 'clients cannot call the sign-up trigger function'
);

-- Signed in as B ----------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-1111-4000-8000-000000000001","role":"authenticated"}';
set local request.jwt.claim.sub = 'bbbbbbbb-1111-4000-8000-000000000001';

select results_eq(
  $$select display_name from public.profiles$$,
  $$values ('bailey'::text)$$,
  'B sees only their own, unchanged profile'
);

-- A restored profile: an account whose profile row is missing can recreate it.
reset role;
delete from public.profiles where user_id = 'cccccccc-1111-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-1111-4000-8000-000000000001","role":"authenticated"}';
set local request.jwt.claim.sub = 'cccccccc-1111-4000-8000-000000000001';

select lives_ok(
  $$insert into public.profiles (display_name) values ('Casey')$$,
  'a user with no profile can create their own; user_id comes from the session'
);

select results_eq(
  $$select user_id, display_unit, timezone from public.profiles$$,
  $$values ('cccccccc-1111-4000-8000-000000000001'::uuid, 'kg'::text, 'UTC'::text)$$,
  'the restored profile belongs to the signed-in user with default settings'
);

-- Account deletion --------------------------------------------------------------

reset role;

select lives_ok(
  $$delete from auth.users where id = 'bbbbbbbb-1111-4000-8000-000000000001'$$,
  'an account can be deleted'
);

select is_empty(
  $$select 1 from public.profiles where user_id = 'bbbbbbbb-1111-4000-8000-000000000001'$$,
  'deleting an account removes its profile'
);

select * from finish();
rollback;
