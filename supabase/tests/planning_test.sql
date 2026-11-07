-- pgTAP checks for 0002_planning. Run with scripts/verify-database.sh, which
-- applies every migration and the seed first. Everything rolls back at the end.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(45);

-- Fixtures, created as the migration owner. A and B are two separate accounts.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@ifit.test'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'b@ifit.test');

insert into public.routines (id, owner_id, title) values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'A push'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'A legs'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'B private');

insert into public.routine_exercises
  (id, routine_id, exercise_id, position, target_sets, target_reps, rest_seconds)
values
  ('aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002',
   'e1f17000-0000-4000-8000-000000000001', 0, 3, 10, 90),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000002',
   'e1f17000-0000-4000-8000-000000000003', 1, 3, 10, 90),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002',
   'e1f17000-0000-4000-8000-000000000001', 0, 3, 10, 90);

insert into public.scheduled_workouts (id, owner_id, routine_id, local_date) values
  ('bbbbbbbb-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-000000000002', '2026-12-01');

-- Structure -------------------------------------------------------------------

select is(
  (select count(*) from pg_class
   where relnamespace = 'public'::regnamespace and relrowsecurity
     and relname in ('exercises', 'exercise_alternatives', 'routine_templates',
                     'routine_template_exercises', 'routines', 'routine_exercises',
                     'scheduled_workouts')),
  7::bigint,
  'row-level security is enabled on every planning table'
);

select cmp_ok(
  (select count(distinct pattern) from public.exercises), '=', 5::bigint,
  'seed covers all five movement patterns'
);

select cmp_ok(
  (select count(*) from public.exercises), '>=', 12::bigint,
  'seed has at least 12 exercises'
);

select throws_ok(
  $$delete from public.exercises where id = 'e1f17000-0000-4000-8000-000000000001'$$,
  '23503', null, 'an exercise used by a routine cannot be deleted'
);

-- Anonymous access ------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select cmp_ok(
  (select count(*) from public.exercises), '>=', 12::bigint,
  'anon can read the catalog'
);

select throws_ok(
  $$update public.exercises set name = 'Changed'$$, '42501', null,
  'anon cannot change the catalog'
);

select throws_ok($$select * from public.routines$$, '42501', null, 'anon cannot read routines');

select throws_ok(
  $$select * from public.routine_exercises$$, '42501', null, 'anon cannot read routine exercises'
);

select throws_ok(
  $$select * from public.scheduled_workouts$$, '42501', null, 'anon cannot read schedules'
);

-- Isolation between accounts --------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.exercise_alternatives
      (source_exercise_id, target_exercise_id, kind, rationale, position)
    values ('e1f17000-0000-4000-8000-000000000001', 'e1f17000-0000-4000-8000-000000000002',
            'substitution', 'nope', 9)$$,
  '42501', null, 'signed-in users cannot change the catalog'
);

select is((select count(*) from public.routines), 2::bigint, 'A sees only their own routines');

select is(
  (select count(*) from public.routines where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  0::bigint, 'A cannot read B''s routine by direct ID'
);

select is(
  (select count(*) from public.routine_exercises), 2::bigint,
  'A sees only routine exercises under their own routines'
);

select is(
  (select count(*) from public.routine_exercises
   where id = 'bbbbbbbb-0000-4000-8000-000000000004'),
  0::bigint, 'A cannot read B''s child rows by direct ID'
);

select is(
  (select count(*) from public.scheduled_workouts
   where id = 'bbbbbbbb-0000-4000-8000-000000000006'),
  0::bigint, 'A cannot read B''s schedule by direct ID'
);

select is_empty(
  $$update public.routines set title = 'Taken'
    where id = 'bbbbbbbb-0000-4000-8000-000000000002' returning id$$,
  'A cannot rename B''s routine'
);

select is_empty(
  $$delete from public.routines where id = 'bbbbbbbb-0000-4000-8000-000000000002' returning id$$,
  'A cannot delete B''s routine'
);

select is_empty(
  $$update public.routine_exercises set target_sets = 9
    where id = 'bbbbbbbb-0000-4000-8000-000000000004' returning id$$,
  'A cannot edit B''s child rows'
);

select is_empty(
  $$update public.scheduled_workouts set local_date = '2026-12-25'
    where id = 'bbbbbbbb-0000-4000-8000-000000000006' returning id$$,
  'A cannot move B''s scheduled workout'
);

select throws_ok(
  $$insert into public.routines (owner_id, title)
    values ('bbbbbbbb-0000-4000-8000-000000000001', 'Spoofed')$$,
  '42501', null, 'a client cannot supply an owner ID'
);

select throws_ok(
  $$update public.routines set owner_id = 'bbbbbbbb-0000-4000-8000-000000000001'
    where id = 'aaaaaaaa-0000-4000-8000-000000000002'$$,
  '42501', null, 'a client cannot transfer a routine'
);

select throws_ok(
  $$insert into public.routine_exercises
      (routine_id, exercise_id, position, target_sets, target_reps, rest_seconds)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'e1f17000-0000-4000-8000-000000000001',
            5, 3, 10, 90)$$,
  '42501', null, 'A cannot add an exercise to B''s routine'
);

select throws_ok(
  $$update public.routine_exercises set routine_id = 'bbbbbbbb-0000-4000-8000-000000000002'
    where id = 'aaaaaaaa-0000-4000-8000-000000000004'$$,
  '42501', null, 'A cannot move their exercise into B''s routine'
);

select throws_ok(
  $$insert into public.scheduled_workouts (routine_id, local_date)
    values ('bbbbbbbb-0000-4000-8000-000000000002', '2026-12-02')$$,
  '42501', null, 'A cannot schedule B''s routine'
);

-- Routines --------------------------------------------------------------------

select lives_ok(
  $$insert into public.routines (title, operation_id)
    values ('New routine', 'aaaaaaaa-0000-4000-8000-0000000000f1')$$,
  'A can create a routine'
);

select is(
  (select owner_id from public.routines where title = 'New routine'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'a new routine is owned by the signed-in user'
);

select throws_ok(
  $$insert into public.routines (title, operation_id)
    values ('Double tap', 'aaaaaaaa-0000-4000-8000-0000000000f1')$$,
  '23505', null, 'a repeated operation ID cannot create a second routine'
);

select throws_ok(
  $$insert into public.routines (title) values ('   ')$$,
  '23514', null, 'a blank routine title is rejected'
);

select lives_ok(
  $$update public.routine_exercises
    set position = case position when 0 then 1 else 0 end
    where routine_id = 'aaaaaaaa-0000-4000-8000-000000000002'$$,
  'positions can be swapped in one statement'
);

select lives_ok($$set constraints all immediate$$, 'the swapped positions are valid');
set constraints all deferred;

select is(
  (select exercise_id from public.routine_exercises
   where routine_id = 'aaaaaaaa-0000-4000-8000-000000000002' and position = 0),
  'e1f17000-0000-4000-8000-000000000003'::uuid,
  'the new order is saved'
);

select throws_ok(
  $$update public.routine_exercises set target_sets = 0
    where id = 'aaaaaaaa-0000-4000-8000-000000000004'$$,
  '23514', null, 'zero target sets is rejected'
);

select throws_ok(
  $$update public.routine_exercises set target_kg = -1
    where id = 'aaaaaaaa-0000-4000-8000-000000000004'$$,
  '23514', null, 'a negative target load is rejected'
);

select throws_ok(
  $$update public.routine_exercises set rest_seconds = 601
    where id = 'aaaaaaaa-0000-4000-8000-000000000004'$$,
  '23514', null, 'an out-of-range rest time is rejected'
);

-- Scheduling ------------------------------------------------------------------

select lives_ok(
  $$insert into public.scheduled_workouts (routine_id, local_date, operation_id) values
      ('aaaaaaaa-0000-4000-8000-000000000002', '2026-12-10',
       'aaaaaaaa-0000-4000-8000-0000000000f2')$$,
  'A can schedule their routine'
);

select results_eq(
  $$select status, routine_title, owner_id::text from public.scheduled_workouts
    where local_date = '2026-12-10'$$,
  $$values ('planned', 'A push', 'aaaaaaaa-0000-4000-8000-000000000001')$$,
  'a new schedule is planned, with the title and owner set by the database'
);

select throws_ok(
  $$insert into public.scheduled_workouts (routine_id, local_date)
    values ('aaaaaaaa-0000-4000-8000-000000000002', '2026-12-10')$$,
  '23505', null, 'the same routine cannot be planned twice on one date'
);

select lives_ok(
  $$update public.scheduled_workouts set local_date = '2026-12-11'
    where local_date = '2026-12-10'$$,
  'a planned workout can be rescheduled'
);

select throws_ok(
  $$delete from public.scheduled_workouts where local_date = '2026-12-11'$$,
  '42501', null, 'scheduled workouts are canceled, not deleted'
);

select lives_ok(
  $$update public.scheduled_workouts set status = 'canceled' where local_date = '2026-12-11'$$,
  'a planned workout can be canceled'
);

select is_empty(
  $$update public.scheduled_workouts set local_date = '2026-12-20'
    where local_date = '2026-12-11' returning id$$,
  'a canceled workout cannot be moved'
);

-- A completed plan and an upcoming plan, both on the routine about to be deleted.
insert into public.scheduled_workouts (routine_id, local_date) values
  ('aaaaaaaa-0000-4000-8000-000000000003', '2026-12-12'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '2026-12-13');

update public.scheduled_workouts set status = 'completed' where local_date = '2026-12-12';

select is_empty(
  $$update public.scheduled_workouts set status = 'canceled'
    where local_date = '2026-12-12' returning id$$,
  'a completed workout cannot be changed'
);

update public.routines set title = 'A legs renamed'
where id = 'aaaaaaaa-0000-4000-8000-000000000003';

delete from public.routines where id = 'aaaaaaaa-0000-4000-8000-000000000003';

select results_eq(
  $$select status, routine_id::text, routine_title from public.scheduled_workouts
    where local_date = '2026-12-12'$$,
  $$values ('completed', null::text, 'A legs renamed')$$,
  'deleting a routine keeps completed history, with its latest title'
);

select results_eq(
  $$select status, routine_id::text, routine_title from public.scheduled_workouts
    where local_date = '2026-12-13'$$,
  $$values ('canceled', null::text, 'A legs renamed')$$,
  'deleting a routine cancels its upcoming plans'
);

-- Timestamps ------------------------------------------------------------------

reset role;

update public.routines set updated_at = '2000-01-01', title = 'Touched'
where id = 'aaaaaaaa-0000-4000-8000-000000000002';

select cmp_ok(
  (select updated_at from public.routines where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  '>', '2000-01-01'::timestamptz,
  'updates refresh updated_at'
);

select * from finish();

rollback;
