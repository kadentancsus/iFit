-- 0003_workouts: private workout snapshots and transactional mutation RPCs.
-- Requires 0001_identity and 0002_planning. All loads are canonical kilograms.
-- Clients can SELECT their rows through RLS but cannot write tables directly.
-- Definer RPCs bind every lookup/write to auth.uid(); none accepts an owner ID.
-- Internal helpers have no client EXECUTE privilege. All functions pin search_path.
begin;

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  schedule_id uuid references public.scheduled_workouts(id) on delete set null,
  routine_name_snapshot text not null check (char_length(routine_name_snapshot) between 1 and 80),
  operation_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'completed', 'stopped')),
  rest_status text not null default 'idle' check (rest_status in ('running', 'paused', 'idle')),
  rest_ends_at timestamptz,
  rest_remaining_seconds integer not null default 0 check (rest_remaining_seconds between 0 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, operation_id),
  check ((status = 'active') = (ended_at is null)),
  check (ended_at is null or ended_at >= started_at),
  check ((rest_status = 'running') = (rest_ends_at is not null)),
  check (rest_status = 'paused' or rest_remaining_seconds = 0),
  check (status = 'active' or rest_status = 'idle')
);
create unique index workout_one_active_per_owner on public.workout_sessions(owner_id)
  where status = 'active';
create unique index workout_one_session_per_schedule on public.workout_sessions(schedule_id)
  where schedule_id is not null;
create index workout_history_idx on public.workout_sessions(owner_id, started_at desc);
create index workout_routine_idx on public.workout_sessions(routine_id);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  exercise_name_snapshot text not null check (char_length(exercise_name_snapshot) between 1 and 120),
  load_convention_snapshot text not null
    check (load_convention_snapshot in ('total', 'per_dumbbell', 'machine', 'bodyweight')),
  position integer not null check (position >= 0),
  target_sets integer not null check (target_sets between 1 and 20),
  target_reps integer not null check (target_reps between 1 and 100),
  target_kg numeric(7,3) check (target_kg between 0 and 1000),
  rest_seconds integer not null check (rest_seconds between 0 and 600),
  replaced_entry_id uuid,
  is_replaced boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, session_id, owner_id),
  unique (replaced_entry_id),
  constraint session_exercises_position_key unique (session_id, position) deferrable initially deferred,
  foreign key (session_id, owner_id) references public.workout_sessions(id, owner_id) on delete cascade,
  -- The replacement link cannot cross accounts OR sessions.
  foreign key (replaced_entry_id, session_id, owner_id)
    references public.session_exercises(id, session_id, owner_id),
  check (replaced_entry_id is null or replaced_entry_id <> id),
  check (load_convention_snapshot <> 'bodyweight' or target_kg is null)
);
create index session_exercises_exercise_idx on public.session_exercises(exercise_id);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_exercise_id uuid not null,
  operation_id uuid not null,
  ordinal integer not null check (ordinal >= 1),
  reps integer not null check (reps between 1 and 100),
  weight_kg numeric(7,3) check (weight_kg between 0 and 1000),
  load_mode text not null check (load_mode in ('weighted', 'bodyweight')),
  -- Tombstones preserve operation identity on delete/retry and allow undo.
  is_deleted boolean not null default false,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_exercise_id, owner_id)
    references public.session_exercises(id, owner_id) on delete cascade,
  unique (owner_id, operation_id),
  unique (session_exercise_id, ordinal),
  check ((load_mode = 'bodyweight' and weight_kg is null)
    or (load_mode = 'weighted' and weight_kg is not null))
);
create index set_logs_owner_completed_idx on public.set_logs(owner_id, completed_at desc);

-- One namespace across operation kinds. Reusing an ID with another request is
-- an explicit conflict, not a silent success. Rows survive set deletion/undo.
create table public.workout_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  kind text not null check (kind in ('start', 'log', 'swap', 'finish')),
  request jsonb not null,
  result_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, operation_id)
);

create trigger workout_sessions_touch before update on public.workout_sessions
  for each row execute function public.identity_touch_updated_at();
create trigger session_exercises_touch before update on public.session_exercises
  for each row execute function public.identity_touch_updated_at();
create trigger set_logs_touch before update on public.set_logs
  for each row execute function public.identity_touch_updated_at();

alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.set_logs enable row level security;
alter table public.workout_operations enable row level security;
create policy workout_sessions_owner_read on public.workout_sessions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy session_exercises_owner_read on public.session_exercises
  for select to authenticated using (owner_id = (select auth.uid()) and exists (
    select 1 from public.workout_sessions s where s.id = session_id and s.owner_id = (select auth.uid())
  ));
create policy set_logs_owner_read on public.set_logs
  for select to authenticated using (owner_id = (select auth.uid()) and exists (
    select 1 from public.session_exercises e where e.id = session_exercise_id and e.owner_id = (select auth.uid())
  ));
-- The operation ledger is internal, with no read or write policies for clients.
revoke all on public.workout_sessions, public.session_exercises, public.set_logs,
  public.workout_operations from public, anon, authenticated;
grant select on public.workout_sessions, public.session_exercises, public.set_logs to authenticated;

-- All mutations take the same per-account transaction lock. This serializes
-- start/log/swap/finish, so a swap cannot race a set save or workout completion.
create function public.workout_lock_owner() returns uuid
language plpgsql set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ifit-workout:' || actor::text, 0));
  return actor;
end;
$$;

create function public.workout_replay(p_kind text, p_operation_id uuid, p_request jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare previous public.workout_operations;
begin
  if p_operation_id is null then
    raise exception 'An operation ID is required.' using errcode = '22023';
  end if;
  select * into previous from public.workout_operations
    where owner_id = auth.uid() and operation_id = p_operation_id;
  if found then
    if previous.kind <> p_kind or previous.request <> p_request then
      raise exception 'Operation ID already used for another request.' using errcode = '22023';
    end if;
    return previous.result_id;
  end if;
  return null;
end;
$$;

create function public.workout_start(p_routine_id uuid, p_operation_id uuid, p_schedule_id uuid default null)
returns public.workout_sessions language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.workout_lock_owner();
  request jsonb := jsonb_build_object('routineId', p_routine_id, 'scheduleId', p_schedule_id);
  replay_id uuid;
  routine public.routines;
  plan public.scheduled_workouts;
  result public.workout_sessions;
begin
  replay_id := public.workout_replay('start', p_operation_id, request);
  if replay_id is not null then
    select * into result from public.workout_sessions where id = replay_id and owner_id = actor;
    return result;
  end if;
  select * into routine from public.routines where id = p_routine_id and owner_id = actor for share;
  if not found then
    raise exception 'Routine not found.' using errcode = 'P0002';
  end if;
  if p_schedule_id is not null then
    select * into plan from public.scheduled_workouts
      where id = p_schedule_id and owner_id = actor and routine_id = p_routine_id for update;
    if not found or plan.status <> 'planned' then
      raise exception 'Scheduled workout not available.' using errcode = '22023';
    end if;
  end if;
  select * into result from public.workout_sessions where owner_id = actor and status = 'active';
  if found then
    -- Starting again resumes the current workout; it never starts a second one.
    insert into public.workout_operations values (actor, p_operation_id, 'start', request, result.id, now());
    return result;
  end if;
  if not exists (select 1 from public.routine_exercises where routine_id = routine.id) then
    raise exception 'Add an exercise before starting this routine.' using errcode = '22023';
  end if;
  insert into public.workout_sessions(owner_id, routine_id, schedule_id, routine_name_snapshot, operation_id)
    values (actor, routine.id, p_schedule_id, routine.title, p_operation_id) returning * into result;
  insert into public.session_exercises(owner_id, session_id, exercise_id, exercise_name_snapshot,
    load_convention_snapshot, position, target_sets, target_reps, target_kg, rest_seconds)
    select actor, result.id, e.id, e.name, e.load_convention, r.position,
      r.target_sets, r.target_reps, r.target_kg, r.rest_seconds
    from public.routine_exercises r join public.exercises e on e.id = r.exercise_id
    where r.routine_id = routine.id order by r.position;
  insert into public.workout_operations values (actor, p_operation_id, 'start', request, result.id, now());
  return result;
end;
$$;

create function public.workout_log_set(
  p_session_exercise_id uuid, p_reps integer, p_weight_kg numeric, p_load_mode text, p_operation_id uuid
) returns public.set_logs language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.workout_lock_owner();
  request jsonb := jsonb_build_object('sessionExerciseId', p_session_exercise_id,
    'reps', p_reps, 'weightKg', p_weight_kg, 'loadMode', p_load_mode);
  replay_id uuid;
  entry public.session_exercises;
  session public.workout_sessions;
  result public.set_logs;
begin
  replay_id := public.workout_replay('log', p_operation_id, request);
  if replay_id is not null then
    select * into result from public.set_logs where id = replay_id and owner_id = actor;
    return result;
  end if;
  select * into entry from public.session_exercises where id = p_session_exercise_id and owner_id = actor;
  if not found then raise exception 'Exercise not found.' using errcode = 'P0002'; end if;
  select * into session from public.workout_sessions where id = entry.session_id and owner_id = actor;
  if session.status <> 'active' or entry.is_replaced then
    raise exception 'This exercise is no longer active.' using errcode = '22023';
  end if;
  if p_load_mode is distinct from (case when entry.load_convention_snapshot = 'bodyweight'
      then 'bodyweight' else 'weighted' end) then
    raise exception 'Use the load mode for this exercise.' using errcode = '22023';
  end if;
  insert into public.set_logs(owner_id, session_exercise_id, operation_id, ordinal, reps, weight_kg, load_mode)
    select actor, entry.id, p_operation_id, coalesce(max(ordinal), 0) + 1, p_reps, p_weight_kg, p_load_mode
    from public.set_logs where session_exercise_id = entry.id
    returning * into result;
  update public.workout_sessions set
    rest_status = case when entry.rest_seconds = 0 then 'idle' else 'running' end,
    rest_ends_at = case when entry.rest_seconds = 0 then null
      else clock_timestamp() + make_interval(secs => entry.rest_seconds) end,
    rest_remaining_seconds = 0 where id = session.id and owner_id = actor;
  insert into public.workout_operations values (actor, p_operation_id, 'log', request, result.id, now());
  return result;
end;
$$;

create function public.workout_swap_exercise(
  p_session_exercise_id uuid, p_replacement_exercise_id uuid, p_operation_id uuid,
  p_remaining_targets jsonb default null
) returns public.session_exercises language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.workout_lock_owner();
  request jsonb := jsonb_build_object('sessionExerciseId', p_session_exercise_id,
    'replacementExerciseId', p_replacement_exercise_id, 'remainingTargets', p_remaining_targets);
  replay_id uuid;
  entry public.session_exercises;
  replacement public.exercises;
  session public.workout_sessions;
  result public.session_exercises;
  remaining integer;
  prior_kg numeric;
begin
  replay_id := public.workout_replay('swap', p_operation_id, request);
  if replay_id is not null then
    select * into result from public.session_exercises where id = replay_id and owner_id = actor;
    return result;
  end if;
  select * into entry from public.session_exercises where id = p_session_exercise_id and owner_id = actor;
  if not found then raise exception 'Exercise not found.' using errcode = 'P0002'; end if;
  select * into session from public.workout_sessions where id = entry.session_id and owner_id = actor;
  if session.status <> 'active' or entry.is_replaced then
    raise exception 'This exercise is no longer active.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.exercise_alternatives
    where source_exercise_id = entry.exercise_id and target_exercise_id = p_replacement_exercise_id) then
    raise exception 'Choose a curated alternative.' using errcode = '22023';
  end if;
  select * into replacement from public.exercises where id = p_replacement_exercise_id;
  select greatest(0, entry.target_sets - count(*)::integer) into remaining
    from public.set_logs where session_exercise_id = entry.id and not is_deleted;
  if remaining = 0 then raise exception 'No planned sets remain.' using errcode = '22023'; end if;
  -- Remaining targets are computed from persisted data, not trusted from the UI.
  if p_remaining_targets is not null and p_remaining_targets <>
    jsonb_build_object('targetSets', remaining, 'targetReps', entry.target_reps, 'restSeconds', entry.rest_seconds) then
    raise exception 'Workout changed. Review the remaining targets again.' using errcode = '22023';
  end if;
  -- Only this user's history for the SAME alternative may supply its load.
  select l.weight_kg into prior_kg from public.set_logs l
    join public.session_exercises e on e.id = l.session_exercise_id
    where l.owner_id = actor and e.owner_id = actor and e.exercise_id = replacement.id
      and not l.is_deleted and l.load_mode = 'weighted'
      and e.load_convention_snapshot = replacement.load_convention
    order by l.completed_at desc, l.created_at desc, l.id desc limit 1;
  if replacement.load_convention = 'bodyweight' then prior_kg := null; end if;
  update public.session_exercises set position = position + 1
    where session_id = entry.session_id and owner_id = actor and position > entry.position;
  update public.session_exercises set is_replaced = true where id = entry.id and owner_id = actor;
  insert into public.session_exercises(owner_id, session_id, exercise_id, exercise_name_snapshot,
    load_convention_snapshot, position, target_sets, target_reps, target_kg, rest_seconds, replaced_entry_id)
    values (actor, entry.session_id, replacement.id, replacement.name, replacement.load_convention,
      entry.position + 1, remaining, entry.target_reps, prior_kg, entry.rest_seconds, entry.id)
    returning * into result;
  insert into public.workout_operations values (actor, p_operation_id, 'swap', request, result.id, now());
  return result;
end;
$$;

create function public.workout_finish(p_session_id uuid, p_operation_id uuid)
returns public.workout_sessions language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.workout_lock_owner();
  request jsonb := jsonb_build_object('sessionId', p_session_id);
  replay_id uuid;
  result public.workout_sessions;
begin
  replay_id := public.workout_replay('finish', p_operation_id, request);
  select * into result from public.workout_sessions where id = p_session_id and owner_id = actor;
  if not found then raise exception 'Workout not found.' using errcode = 'P0002'; end if;
  if replay_id is not null then return result; end if;
  if result.status = 'stopped' then
    raise exception 'This workout was stopped.' using errcode = '22023';
  end if;
  if result.status = 'active' then
    update public.workout_sessions set status = 'completed', ended_at = clock_timestamp(),
      rest_status = 'idle', rest_ends_at = null, rest_remaining_seconds = 0
      where id = result.id and owner_id = actor returning * into result;
    update public.scheduled_workouts set status = 'completed'
      where id = result.schedule_id and owner_id = actor and status = 'planned';
  end if;
  insert into public.workout_operations values (actor, p_operation_id, 'finish', request, result.id, now());
  return result;
end;
$$;

-- Full-value corrections avoid invalid intermediate weighted/bodyweight states.
-- Corrections intentionally work after completion and on original swapped rows.
create function public.workout_update_set(p_set_id uuid, p_reps integer, p_weight_kg numeric, p_load_mode text)
returns public.set_logs language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.workout_lock_owner(); result public.set_logs;
begin
  update public.set_logs l set reps = p_reps, weight_kg = p_weight_kg, load_mode = p_load_mode
  from public.session_exercises e, public.workout_sessions s
  where l.id = p_set_id and l.owner_id = actor and not l.is_deleted
    and e.id = l.session_exercise_id and e.owner_id = actor
    and s.id = e.session_id and s.owner_id = actor and s.status in ('active', 'completed')
    and p_load_mode = case when e.load_convention_snapshot = 'bodyweight' then 'bodyweight' else 'weighted' end
  returning l.* into result;
  if not found then raise exception 'Set not available or load mode invalid.' using errcode = '22023'; end if;
  return result;
end;
$$;

create function public.workout_delete_set(p_set_id uuid, p_deleted boolean default true)
returns public.set_logs language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.workout_lock_owner(); result public.set_logs;
begin
  update public.set_logs l set is_deleted = p_deleted
  from public.session_exercises e, public.workout_sessions s
  where l.id = p_set_id and l.owner_id = actor
    and e.id = l.session_exercise_id and e.owner_id = actor
    and s.id = e.session_id and s.owner_id = actor and s.status in ('active', 'completed')
  returning l.* into result;
  if not found then raise exception 'Set not found.' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create function public.workout_save_rest(
  p_session_id uuid, p_status text, p_ends_at timestamptz default null, p_remaining_seconds integer default 0
) returns public.workout_sessions language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.workout_lock_owner(); result public.workout_sessions;
begin
  if p_status = 'running' and (p_ends_at is null or not isfinite(p_ends_at)
    or p_ends_at > clock_timestamp() + interval '600 seconds') then
    raise exception 'Rest deadline is invalid.' using errcode = '22023';
  end if;
  update public.workout_sessions set rest_status = p_status,
    rest_ends_at = p_ends_at, rest_remaining_seconds = p_remaining_seconds
    where id = p_session_id and owner_id = actor and status = 'active' returning * into result;
  if not found then raise exception 'Active workout not found.' using errcode = 'P0002'; end if;
  return result;
end;
$$;

revoke all on function public.workout_lock_owner(), public.workout_replay(text, uuid, jsonb),
  public.workout_start(uuid, uuid, uuid), public.workout_log_set(uuid, integer, numeric, text, uuid),
  public.workout_swap_exercise(uuid, uuid, uuid, jsonb), public.workout_finish(uuid, uuid),
  public.workout_update_set(uuid, integer, numeric, text), public.workout_delete_set(uuid, boolean),
  public.workout_save_rest(uuid, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.workout_start(uuid, uuid, uuid),
  public.workout_log_set(uuid, integer, numeric, text, uuid), public.workout_swap_exercise(uuid, uuid, uuid, jsonb),
  public.workout_finish(uuid, uuid), public.workout_update_set(uuid, integer, numeric, text),
  public.workout_delete_set(uuid, boolean), public.workout_save_rest(uuid, text, timestamptz, integer)
  to authenticated;

commit;
