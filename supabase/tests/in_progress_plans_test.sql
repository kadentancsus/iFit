-- pgTAP checks for 0005_planning_in_progress_plans. Run with
-- scripts/verify-database.sh. Everything rolls back at the end.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'progress-a@ifit.test');

insert into public.routines (id, owner_id, title) values
  ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Push day'),
  ('aaaaaaaa-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Leg day');

insert into public.routine_exercises
  (routine_id, exercise_id, position, target_sets, target_reps, target_kg, rest_seconds)
values
  ('aaaaaaaa-0000-4000-8000-0000000000c2', 'e1f17000-0000-4000-8000-000000000001', 0, 3, 8, 40, 90),
  ('aaaaaaaa-0000-4000-8000-0000000000c3', 'e1f17000-0000-4000-8000-000000000001', 0, 3, 8, 40, 90);

insert into public.scheduled_workouts (id, owner_id, routine_id, local_date) values
  -- Started below, so it is in progress.
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-0000000000c1',
   'aaaaaaaa-0000-4000-8000-0000000000c2', '2026-12-01'),
  -- Same routine on another day, never started.
  ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-0000000000c1',
   'aaaaaaaa-0000-4000-8000-0000000000c2', '2026-12-03'),
  -- Its routine is deleted mid-workout.
  ('aaaaaaaa-0000-4000-8000-0000000000d3', 'aaaaaaaa-0000-4000-8000-0000000000c1',
   'aaaaaaaa-0000-4000-8000-0000000000c3', '2026-12-01');

select ok(
  not has_function_privilege('authenticated', 'public.scheduled_workouts_guard_in_progress()', 'execute'),
  'the guard cannot be called directly'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c1","role":"authenticated"}';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-0000000000c1';

-- Before anything starts, the plan moves freely.
select lives_ok(
  $$update public.scheduled_workouts set local_date = '2026-12-02'
    where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  'a plan that has not started can move'
);
update public.scheduled_workouts set local_date = '2026-12-01'
  where id = 'aaaaaaaa-0000-4000-8000-0000000000d1';

select lives_ok(
  $$select public.workout_start('aaaaaaaa-0000-4000-8000-0000000000c2',
    'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000d1')$$,
  'starting the planned workout works'
);

select throws_ok(
  $$update public.scheduled_workouts set local_date = '2026-12-02'
    where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  '55006', null, 'an in-progress plan cannot move to another day'
);

select throws_ok(
  $$update public.scheduled_workouts set status = 'canceled'
    where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  '55006', null, 'an in-progress plan cannot be canceled'
);

select lives_ok(
  $$update public.scheduled_workouts set local_date = '2026-12-04'
    where id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$,
  'other plans for the same routine still move'
);

select lives_ok(
  $$select public.workout_finish(
    (select id from public.workout_sessions where schedule_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'),
    'aaaaaaaa-0000-4000-8000-0000000000e2')$$,
  'finishing the workout works'
);

select results_eq(
  $$select local_date::text, status from public.scheduled_workouts
    where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  $$values ('2026-12-01', 'completed')$$,
  'finishing records the workout on the day it was planned'
);

-- Row policies only let planned rows change, so this update matches nothing.
update public.scheduled_workouts set local_date = '2026-12-02'
  where id = 'aaaaaaaa-0000-4000-8000-0000000000d1';
select is(
  (select local_date::text from public.scheduled_workouts where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'),
  '2026-12-01',
  'the completed plan was not moved'
);

-- Deleting a routine mid-workout still clears its plan.
select lives_ok(
  $$select public.workout_start('aaaaaaaa-0000-4000-8000-0000000000c3',
    'aaaaaaaa-0000-4000-8000-0000000000e3', 'aaaaaaaa-0000-4000-8000-0000000000d3')$$,
  'starting a second planned workout works'
);
select lives_ok(
  $$delete from public.routines where id = 'aaaaaaaa-0000-4000-8000-0000000000c3'$$,
  'a routine can be deleted while its workout runs'
);
select is(
  (select status from public.scheduled_workouts where id = 'aaaaaaaa-0000-4000-8000-0000000000d3'),
  'canceled',
  'deleting the routine cancels its in-progress plan'
);

select * from finish();
rollback;
