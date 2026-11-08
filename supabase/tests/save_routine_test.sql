-- pgTAP checks for 0004_planning_save_routine. Run with
-- scripts/verify-database.sh. Everything rolls back at the end.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'save-a@ifit.test'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'save-b@ifit.test');

insert into public.routines (id, owner_id, title) values
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'A push'),
  ('bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-0000000000b1', 'B private');

insert into public.routine_exercises
  (id, routine_id, exercise_id, position, target_sets, target_reps, target_kg, rest_seconds)
values
  ('aaaaaaaa-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-0000000000a2',
   'e1f17000-0000-4000-8000-000000000001', 0, 3, 10, 40, 90),
  ('aaaaaaaa-0000-4000-8000-0000000000a4', 'aaaaaaaa-0000-4000-8000-0000000000a2',
   'e1f17000-0000-4000-8000-000000000002', 1, 3, 10, null, 90),
  ('aaaaaaaa-0000-4000-8000-0000000000a5', 'aaaaaaaa-0000-4000-8000-0000000000a2',
   'e1f17000-0000-4000-8000-000000000003', 2, 3, 10, null, 90),
  ('bbbbbbbb-0000-4000-8000-0000000000b3', 'bbbbbbbb-0000-4000-8000-0000000000b2',
   'e1f17000-0000-4000-8000-000000000001', 0, 5, 5, 60, 120);

select ok(
  not has_function_privilege('anon', 'public.save_routine(uuid, text, jsonb, uuid)', 'execute'),
  'signed-out callers cannot save a routine'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.save_routine(uuid, text, jsonb, uuid)'::regprocedure),
  false,
  'save_routine runs as the caller so row policies apply'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a1","role":"authenticated"}';
set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-0000000000a1';

-- Reordering, editing and removing in one save --------------------------------

select is(
  public.save_routine(
    'aaaaaaaa-0000-4000-8000-0000000000a2',
    '  A push renamed  ',
    '[
      {"id":"aaaaaaaa-0000-4000-8000-0000000000a5","exerciseId":"e1f17000-0000-4000-8000-000000000003","targetSets":4,"targetReps":8,"targetKg":null,"restSeconds":60},
      {"id":"aaaaaaaa-0000-4000-8000-0000000000a3","exerciseId":"e1f17000-0000-4000-8000-000000000001","targetSets":3,"targetReps":10,"targetKg":42.5,"restSeconds":90},
      {"exerciseId":"e1f17000-0000-4000-8000-000000000004","targetSets":2,"targetReps":12,"targetKg":null,"restSeconds":30}
    ]'::jsonb
  ),
  'aaaaaaaa-0000-4000-8000-0000000000a2'::uuid,
  'saving an existing routine returns its ID'
);

select is(
  (select title from public.routines where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'),
  'A push renamed',
  'the title is saved trimmed'
);

select results_eq(
  $$select exercise_id::text from public.routine_exercises
    where routine_id = 'aaaaaaaa-0000-4000-8000-0000000000a2' order by position$$,
  array[
    'e1f17000-0000-4000-8000-000000000003',
    'e1f17000-0000-4000-8000-000000000001',
    'e1f17000-0000-4000-8000-000000000004'
  ],
  'positions follow the submitted order, and swapped positions do not collide'
);

select results_eq(
  $$select position from public.routine_exercises
    where routine_id = 'aaaaaaaa-0000-4000-8000-0000000000a2' order by position$$,
  array[0, 1, 2],
  'positions stay contiguous from zero'
);

select is(
  (select target_kg from public.routine_exercises where id = 'aaaaaaaa-0000-4000-8000-0000000000a3'),
  42.5::numeric,
  'an edited row keeps its ID and takes the new target'
);

select is(
  (select count(*) from public.routine_exercises where id = 'aaaaaaaa-0000-4000-8000-0000000000a4'),
  0::bigint,
  'a row left out of the save is removed'
);

-- Atomicity -------------------------------------------------------------------

select throws_ok(
  $$select public.save_routine(
    'aaaaaaaa-0000-4000-8000-0000000000a2',
    'Should not stick',
    '[{"exerciseId":"e1f17000-0000-4000-8000-000000000001","targetSets":99,"targetReps":10,"targetKg":null,"restSeconds":60}]'::jsonb
  )$$,
  '23514',
  null,
  'a target outside its limits is rejected by the database'
);

select is(
  (select title from public.routines where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'),
  'A push renamed',
  'a failed save leaves the title unchanged'
);

select is(
  (select count(*) from public.routine_exercises where routine_id = 'aaaaaaaa-0000-4000-8000-0000000000a2'),
  3::bigint,
  'a failed save keeps every existing exercise'
);

-- Retries ---------------------------------------------------------------------

select lives_ok(
  $$select set_config('test.created', public.save_routine(
    null, 'New', '[{"exerciseId":"e1f17000-0000-4000-8000-000000000001","targetSets":3,"targetReps":10,"targetKg":null,"restSeconds":60}]'::jsonb,
    'cccccccc-0000-4000-8000-000000000001'
  )::text, true)$$,
  'a new routine can be created'
);

select is(
  public.save_routine(null, 'Retry', '[]'::jsonb, 'cccccccc-0000-4000-8000-000000000001')::text,
  current_setting('test.created'),
  'a retry with the same operation ID returns the same routine'
);

select is(
  (select count(*) from public.routine_exercises where routine_id = current_setting('test.created')::uuid),
  1::bigint,
  'a retry does not overwrite what was saved'
);

-- Ownership -------------------------------------------------------------------

select is(
  public.save_routine('bbbbbbbb-0000-4000-8000-0000000000b2', 'Stolen', '[]'::jsonb),
  null::uuid,
  'another user''s routine reads as missing'
);

select lives_ok(
  $$select public.save_routine(
    'aaaaaaaa-0000-4000-8000-0000000000a2',
    'A push renamed',
    '[{"id":"bbbbbbbb-0000-4000-8000-0000000000b3","exerciseId":"e1f17000-0000-4000-8000-000000000002","targetSets":1,"targetReps":1,"targetKg":null,"restSeconds":0}]'::jsonb
  )$$,
  'naming another user''s row ID does not fail the save'
);

reset role;

select is(
  (select array[title, (select target_sets::text from public.routine_exercises
                        where id = 'bbbbbbbb-0000-4000-8000-0000000000b3')]
   from public.routines where id = 'bbbbbbbb-0000-4000-8000-0000000000b2'),
  array['B private', '5'],
  'another user''s routine and rows are untouched'
);

select * from finish();
rollback;
