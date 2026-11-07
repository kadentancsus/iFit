-- Deleting an account, run without a wrapping transaction on purpose. Postgres
-- re-checks foreign keys on rows inserted by the current transaction, so fixtures
-- must be committed first for this to match a real deletion.
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

insert into auth.users (id, email) values
  ('cccccccc-0000-4000-8000-000000000001', 'c@ifit.test');

insert into public.routines (id, owner_id, title) values
  ('cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001', 'C routine');

insert into public.routine_exercises
  (routine_id, exercise_id, position, target_sets, target_reps, rest_seconds)
values
  ('cccccccc-0000-4000-8000-000000000002', 'e1f17000-0000-4000-8000-000000000001', 0, 3, 10, 90);

insert into public.scheduled_workouts (owner_id, routine_id, local_date, status) values
  ('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002',
   '2026-12-01', 'planned'),
  ('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002',
   '2026-11-01', 'completed');

select plan(4);

select lives_ok(
  $$delete from auth.users where id = 'cccccccc-0000-4000-8000-000000000001'$$,
  'an account with routines, exercises and schedules can be deleted'
);

select is(
  (select count(*) from public.routines
   where owner_id = 'cccccccc-0000-4000-8000-000000000001'),
  0::bigint, 'the account''s routines are removed'
);

select is(
  (select count(*) from public.routine_exercises
   where routine_id = 'cccccccc-0000-4000-8000-000000000002'),
  0::bigint, 'the account''s routine exercises are removed'
);

select is(
  (select count(*) from public.scheduled_workouts
   where owner_id = 'cccccccc-0000-4000-8000-000000000001'),
  0::bigint, 'the account''s schedule is removed'
);

select * from finish();
