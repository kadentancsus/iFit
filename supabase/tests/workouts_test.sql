-- Runs after migrations/seed through the existing database verification runner.
-- Fixtures and mutations roll back. Assertions use real roles, RLS and RPCs.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('dddddddd-0000-4000-8000-000000000001', 'workout-a@ifit.test'),
  ('eeeeeeee-0000-4000-8000-000000000001', 'workout-b@ifit.test');
insert into public.routines(id, owner_id, title) values
  ('dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'Original workout'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000001', 'Private workout');
insert into public.routine_exercises(routine_id, exercise_id, position, target_sets, target_reps, target_kg, rest_seconds)
values
  ('dddddddd-0000-4000-8000-000000000002', 'e1f17000-0000-4000-8000-000000000001', 0, 3, 10, 60, 90),
  ('eeeeeeee-0000-4000-8000-000000000002', 'e1f17000-0000-4000-8000-000000000001', 0, 3, 10, 60, 90);
insert into public.scheduled_workouts(id, owner_id, routine_id, local_date) values
  ('dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000002', '2026-11-07');

select is((select count(*) from pg_class where relnamespace = 'public'::regnamespace
  and relrowsecurity and relname in ('workout_sessions', 'session_exercises', 'set_logs', 'workout_operations')),
  4::bigint, 'RLS enabled on all workout tables');

set local role anon;
set local request.jwt.claims = '{}';
select throws_ok($$select * from public.workout_sessions$$, '42501', null, 'anon cannot read workouts');
select throws_ok($$select public.workout_start(null, null)$$, '42501', null, 'anon cannot call start');

reset role;
set local role authenticated;
set local request.jwt.claims = '{}';
select throws_ok($$select public.workout_start(null, null)$$, '42501', null, 'missing identity rejected');
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.workout_lock_owner()$$, '42501', null, 'internal helper cannot be called directly');
select throws_ok($$select * from public.workout_operations$$, '42501', null, 'operation ledger is private');
select throws_ok($$insert into public.workout_sessions(owner_id) values (auth.uid())$$,
  '42501', null, 'direct session writes forbidden');
select throws_ok($$select public.workout_start('eeeeeeee-0000-4000-8000-000000000002',
  'dddddddd-1000-4000-8000-000000000001')$$, 'P0002', null, 'cannot start another account routine');
select throws_ok($$select public.workout_start('dddddddd-0000-4000-8000-000000000002', null)$$,
  '22023', null, 'operation ID required');

select lives_ok($$select public.workout_start('dddddddd-0000-4000-8000-000000000002',
  'dddddddd-1000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000003')$$,
  'start snapshots owned routine and schedule');
select lives_ok($$select public.workout_start('dddddddd-0000-4000-8000-000000000002',
  'dddddddd-1000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000003')$$, 'start retry succeeds');
select lives_ok($$select public.workout_start('dddddddd-0000-4000-8000-000000000002',
  'dddddddd-1000-4000-8000-000000000002')$$, 'new start operation resumes active session');
select is((select count(*) from public.workout_sessions), 1::bigint, 'only one active session exists');
select is((select count(*) from public.session_exercises), 1::bigint, 'retry does not duplicate snapshots');
select is((select target_kg from public.session_exercises), 60::numeric, 'planned canonical load snapshotted');

-- Store IDs without a fixture table whose privileges could mask RLS behavior.
select set_config('ifit.test.session', (select id::text from public.workout_sessions), true);
select set_config('ifit.test.entry', (select id::text from public.session_exercises), true);
select lives_ok($$select public.workout_log_set(current_setting('ifit.test.entry')::uuid,
  8, 60, 'weighted', 'dddddddd-2000-4000-8000-000000000001')$$, 'actual values saved');
select lives_ok($$select public.workout_log_set(current_setting('ifit.test.entry')::uuid,
  8, 60, 'weighted', 'dddddddd-2000-4000-8000-000000000001')$$, 'identical set retry succeeds');
select is((select count(*) from public.set_logs), 1::bigint, 'retry never duplicates a set');
select is((select reps from public.set_logs), 8, 'actual rather than planned reps stored');
select is((select rest_status from public.workout_sessions), 'running', 'set logging starts persisted rest');
select throws_ok($$select public.workout_log_set(current_setting('ifit.test.entry')::uuid,
  9, 60, 'weighted', 'dddddddd-2000-4000-8000-000000000001')$$, '22023', null, 'conflicting retry rejected');
select throws_ok($$select public.workout_log_set(current_setting('ifit.test.entry')::uuid,
  0, 60, 'weighted', 'dddddddd-2000-4000-8000-000000000002')$$, '23514', null, 'zero reps rejected');
select throws_ok($$select public.workout_log_set(current_setting('ifit.test.entry')::uuid,
  8, 'NaN'::numeric, 'weighted', 'dddddddd-2000-4000-8000-000000000002')$$, '23514', null, 'non-finite weight rejected');
select throws_ok($$select public.workout_log_set(current_setting('ifit.test.entry')::uuid,
  8, null, 'bodyweight', 'dddddddd-2000-4000-8000-000000000002')$$, '22023', null, 'wrong equipment load mode rejected');
select throws_ok($$update public.set_logs set reps = 9$$, '42501', null, 'direct set writes forbidden');

select lives_ok($$select public.workout_save_rest(current_setting('ifit.test.session')::uuid, 'paused', null, 45)$$,
  'pause state saved');
select is((select rest_remaining_seconds from public.workout_sessions), 45, 'paused remainder retained');
select throws_ok($$select public.workout_save_rest(current_setting('ifit.test.session')::uuid, 'idle', null, 30)$$,
  '23514', null, 'invalid timer combination rejected');
select throws_ok($$select public.workout_save_rest(current_setting('ifit.test.session')::uuid,
  'running', clock_timestamp() + interval '601 seconds', 0)$$, '22023', null, 'unbounded timer rejected');

-- The curated alternative of bench press is dumbbell flat bench press.
select set_config('ifit.test.alternative', (select a.target_exercise_id::text
  from public.exercise_alternatives a join public.exercises e on e.id = a.target_exercise_id
  where a.source_exercise_id = 'e1f17000-0000-4000-8000-000000000001'
    and e.load_convention = 'per_dumbbell' order by a.position limit 1), true);
select throws_ok($$select public.workout_swap_exercise(current_setting('ifit.test.entry')::uuid,
  current_setting('ifit.test.alternative')::uuid, 'dddddddd-3000-4000-8000-000000000001',
  '{"targetSets":3,"targetReps":10,"restSeconds":90}')$$, '22023', null, 'stale client targets rejected');
select lives_ok($$select public.workout_swap_exercise(current_setting('ifit.test.entry')::uuid,
  current_setting('ifit.test.alternative')::uuid, 'dddddddd-3000-4000-8000-000000000001',
  '{"targetSets":2,"targetReps":10,"restSeconds":90}')$$, 'swap preserves remaining targets');
select lives_ok($$select public.workout_swap_exercise(current_setting('ifit.test.entry')::uuid,
  current_setting('ifit.test.alternative')::uuid, 'dddddddd-3000-4000-8000-000000000001',
  '{"targetSets":2,"targetReps":10,"restSeconds":90}')$$, 'swap retry is idempotent');
select is((select count(*) from public.session_exercises), 2::bigint, 'one original and one replacement');
select is((select count(*) from public.set_logs where session_exercise_id = current_setting('ifit.test.entry')::uuid),
  1::bigint, 'original logs stay on original entry');
select is((select target_sets from public.session_exercises where replaced_entry_id is not null),
  2, 'only remaining planned sets carried over');
select ok((select target_kg is null from public.session_exercises where replaced_entry_id is not null),
  'barbell weight not copied to dumbbells without own prior performance');
select throws_ok($$select public.workout_log_set(current_setting('ifit.test.entry')::uuid,
  8, 60, 'weighted', 'dddddddd-2000-4000-8000-000000000002')$$, '22023', null, 'cannot append sets to replaced entry');
select throws_ok($$select public.workout_swap_exercise(current_setting('ifit.test.entry')::uuid,
  current_setting('ifit.test.alternative')::uuid, 'dddddddd-3000-4000-8000-000000000002')$$,
  '22023', null, 'cannot swap the original twice');
select lives_ok($$select public.workout_log_set((select id from public.session_exercises where replaced_entry_id is not null),
  10, 15, 'weighted', 'dddddddd-2000-4000-8000-000000000002')$$, 'replacement accepts explicit alternative load');

-- B cannot read or mutate A's session, entries, sets, or timers by direct IDs.
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.workout_sessions), 0::bigint, 'B cannot read A sessions');
select is((select count(*) from public.session_exercises), 0::bigint, 'B cannot read A child entries');
select is((select count(*) from public.set_logs), 0::bigint, 'B cannot read A child sets');
select throws_ok($$select public.workout_finish(current_setting('ifit.test.session')::uuid,
  'eeeeeeee-4000-4000-8000-000000000001')$$, 'P0002', null, 'B cannot finish A workout');
select throws_ok($$select public.workout_log_set(current_setting('ifit.test.entry')::uuid,
  8, 60, 'weighted', 'eeeeeeee-2000-4000-8000-000000000001')$$, 'P0002', null, 'B cannot log to A entry');
select throws_ok($$select public.workout_swap_exercise(current_setting('ifit.test.entry')::uuid,
  current_setting('ifit.test.alternative')::uuid, 'eeeeeeee-3000-4000-8000-000000000001')$$,
  'P0002', null, 'B cannot swap A exercise');
select throws_ok($$select public.workout_save_rest(current_setting('ifit.test.session')::uuid, 'idle')$$,
  'P0002', null, 'B cannot change A timer');
select lives_ok($$select public.workout_start('eeeeeeee-0000-4000-8000-000000000002',
  'dddddddd-1000-4000-8000-000000000001')$$, 'operation IDs scoped to owner, not shared globally');
select is((select count(*) from public.workout_sessions), 1::bigint, 'B sees only own new session');

set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('ifit.test.set', (select id::text from public.set_logs
  where session_exercise_id = current_setting('ifit.test.entry')::uuid), true);
select lives_ok($$select public.workout_finish(current_setting('ifit.test.session')::uuid,
  'dddddddd-4000-4000-8000-000000000001')$$, 'finish commits summary state');
select lives_ok($$select public.workout_finish(current_setting('ifit.test.session')::uuid,
  'dddddddd-4000-4000-8000-000000000001')$$, 'finish retry succeeds');
select set_config('ifit.test.end', (select ended_at::text from public.workout_sessions), true);
select lives_ok($$select public.workout_finish(current_setting('ifit.test.session')::uuid,
  'dddddddd-4000-4000-8000-000000000002')$$, 'finish with another operation remains idempotent');
select is((select ended_at::text from public.workout_sessions), current_setting('ifit.test.end'), 'finish never changes duration twice');
select is((select status from public.scheduled_workouts), 'completed', 'finish completes linked schedule');
select is((select rest_status from public.workout_sessions), 'idle', 'finish clears timer');
select throws_ok($$select public.workout_log_set((select id from public.session_exercises where replaced_entry_id is not null),
  10, 15, 'weighted', 'dddddddd-2000-4000-8000-000000000003')$$, '22023', null, 'closed session rejects new sets');
select lives_ok($$select public.workout_update_set(current_setting('ifit.test.set')::uuid, 9, 55, 'weighted')$$,
  'completed original set remains editable after swapping');
select is((select reps from public.set_logs where id = current_setting('ifit.test.set')::uuid), 9, 'corrected actual reps retained');
select lives_ok($$select public.workout_delete_set(current_setting('ifit.test.set')::uuid)$$, 'delete uses tombstone');
select lives_ok($$select public.workout_log_set(current_setting('ifit.test.entry')::uuid,
  8, 60, 'weighted', 'dddddddd-2000-4000-8000-000000000001')$$, 'old retry after deletion cannot resurrect set');
select ok((select is_deleted from public.set_logs where id = current_setting('ifit.test.set')::uuid), 'retry leaves tombstone intact');
select lives_ok($$select public.workout_delete_set(current_setting('ifit.test.set')::uuid, false)$$, 'undo restores same set');
select is((select weight_kg from public.set_logs where id = current_setting('ifit.test.set')::uuid),
  55::numeric, 'undo preserves corrected load');

set local request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.workout_update_set(current_setting('ifit.test.set')::uuid, 1, 0, 'weighted')$$,
  '22023', null, 'B cannot correct A set');
select throws_ok($$select public.workout_delete_set(current_setting('ifit.test.set')::uuid)$$,
  'P0002', null, 'B cannot delete or undo A set');

set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000001","role":"authenticated"}';
update public.routines set title = 'Renamed workout' where id = 'dddddddd-0000-4000-8000-000000000002';
update public.routine_exercises set target_reps = 5 where routine_id = 'dddddddd-0000-4000-8000-000000000002';
select is((select routine_name_snapshot from public.workout_sessions), 'Original workout', 'routine rename cannot rewrite snapshot');
select is((select target_reps from public.session_exercises where id = current_setting('ifit.test.entry')::uuid),
  10, 'routine edits cannot rewrite historical targets');
delete from public.routines where id = 'dddddddd-0000-4000-8000-000000000002';
select ok((select routine_id is null from public.workout_sessions), 'routine deletion clears only reference');
select is((select count(*) from public.set_logs), 2::bigint, 'history and corrected logs survive routine deletion');
select lives_ok($$select public.workout_start('dddddddd-0000-4000-8000-000000000002',
  'dddddddd-1000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000003')$$,
  'original start retry survives deleted routine');

-- A new routine can reuse A's actual alternative performance, never another
-- equipment's planned load. Finish freed the active-session uniqueness slot.
reset role;
insert into public.routines(id, owner_id, title) values
  ('dddddddd-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000001', 'Second workout');
insert into public.routine_exercises(routine_id, exercise_id, position, target_sets, target_reps, target_kg, rest_seconds)
values ('dddddddd-0000-4000-8000-000000000004', 'e1f17000-0000-4000-8000-000000000001', 0, 3, 10, 80, 90);
set local role authenticated;
select lives_ok($$select public.workout_start('dddddddd-0000-4000-8000-000000000004',
  'dddddddd-1000-4000-8000-000000000003')$$, 'can start again after finish');
select lives_ok($$select public.workout_swap_exercise(
  (select e.id from public.session_exercises e join public.workout_sessions s on s.id = e.session_id where s.status = 'active'),
  current_setting('ifit.test.alternative')::uuid, 'dddddddd-3000-4000-8000-000000000003')$$,
  'swap can prefill own prior performance of identical alternative');
select is((select e.target_kg from public.session_exercises e join public.workout_sessions s on s.id = e.session_id
  where s.status = 'active' and e.replaced_entry_id is not null), 15::numeric,
  'alternative prefill is previous dumbbell actual load, not barbell target');

-- Exercise bodyweight handling using a real catalog entry in its own session.
select lives_ok($$select public.workout_finish((select id from public.workout_sessions where status = 'active'),
  'dddddddd-4000-4000-8000-000000000003')$$, 'second session finishes');
reset role;
insert into public.routines(id, owner_id, title) values
  ('dddddddd-0000-4000-8000-000000000005', 'dddddddd-0000-4000-8000-000000000001', 'Bodyweight workout');
insert into public.routine_exercises(routine_id, exercise_id, position, target_sets, target_reps, rest_seconds)
select 'dddddddd-0000-4000-8000-000000000005', id, 0, 3, 10, 0
  from public.exercises where load_convention = 'bodyweight' order by id limit 1;
set local role authenticated;
select lives_ok($$select public.workout_start('dddddddd-0000-4000-8000-000000000005',
  'dddddddd-1000-4000-8000-000000000004')$$, 'start bodyweight routine');
select set_config('ifit.test.bodyweight', (select e.id::text from public.session_exercises e
  join public.workout_sessions s on s.id = e.session_id where s.status = 'active'), true);
select lives_ok($$select public.workout_log_set(current_setting('ifit.test.bodyweight')::uuid,
  10, null, 'bodyweight', 'dddddddd-2000-4000-8000-000000000004')$$, 'bodyweight uses null load');
select is((select rest_status from public.workout_sessions where status = 'active'), 'idle', 'zero rest does not start timer');
select throws_ok($$select public.workout_log_set(current_setting('ifit.test.bodyweight')::uuid,
  10, 0, 'bodyweight', 'dddddddd-2000-4000-8000-000000000005')$$, '23514', null,
  'bodyweight cannot be mislabeled as zero weighted load');

-- Database constraints also protect against malformed privileged writes.
reset role;
select throws_ok($$insert into public.workout_sessions(owner_id, routine_name_snapshot, operation_id)
  values ('dddddddd-0000-4000-8000-000000000001', 'Duplicate', gen_random_uuid())$$,
  '23505', null, 'partial unique index prevents two active sessions');
select throws_ok($$insert into public.session_exercises(owner_id, session_id, exercise_id,
  exercise_name_snapshot, load_convention_snapshot, position, target_sets, target_reps, rest_seconds)
  values ('eeeeeeee-0000-4000-8000-000000000001', current_setting('ifit.test.session')::uuid,
    'e1f17000-0000-4000-8000-000000000001', 'Cross-owner', 'total', 99, 1, 1, 0)$$,
  '23503', null, 'composite foreign key rejects cross-owner child row');
select lives_ok($$delete from auth.users where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  'account deletion cascades workouts and replacement chains');
select is((select count(*) from public.workout_sessions where owner_id = 'dddddddd-0000-4000-8000-000000000001'),
  0::bigint, 'account deletion removes workout sessions');
select is((select count(*) from public.set_logs where owner_id = 'dddddddd-0000-4000-8000-000000000001'),
  0::bigint, 'account deletion removes child logs');

-- Deferred positions must also be valid at commit, not merely during the RPC.
set constraints all immediate;
select * from finish();
rollback;
