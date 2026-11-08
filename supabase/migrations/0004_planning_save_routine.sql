-- 0004_planning_save_routine: saves a routine and its exercises atomically.
--
-- Depends only on 0002_planning. Numbered after 0003_workouts so that 0002 stays
-- unchanged for anyone who has already applied it.
--
-- A reorder rewrites several rows, and each PostgREST call is its own
-- transaction, so doing this from the API could leave a half-saved routine.
-- Running it in one function makes the whole save succeed or fail together.
--
-- Security invoker on purpose: the caller's grants and row policies apply to
-- every statement, so another user's routine simply reads as missing.

create function public.save_routine(
  p_routine_id uuid,
  p_title text,
  p_exercises jsonb,
  p_operation_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if p_routine_id is null then
    insert into public.routines (title, operation_id)
    values (btrim(p_title), p_operation_id)
    on conflict (owner_id, operation_id) do nothing
    returning id into saved_id;

    -- A retry of a create that already committed keeps what was saved.
    if saved_id is null then
      select routine.id into saved_id
      from public.routines as routine
      where routine.owner_id = (select auth.uid())
        and routine.operation_id = p_operation_id;
      return saved_id;
    end if;
  else
    -- Also takes the row lock, so concurrent saves of one routine run in turn.
    update public.routines as routine
    set title = btrim(p_title)
    where routine.id = p_routine_id
    returning routine.id into saved_id;

    if saved_id is null then
      return null;
    end if;
  end if;

  delete from public.routine_exercises as existing
  where existing.routine_id = saved_id
    and not exists (
      select 1
      from jsonb_array_elements(p_exercises) as item (value)
      where (item.value ->> 'id')::uuid = existing.id
    );

  -- Existing rows keep their IDs. An ID that isn't in this routine, such as one
  -- removed in another tab, becomes a new row and never touches the row it names.
  insert into public.routine_exercises
    (id, routine_id, exercise_id, position, target_sets, target_reps, target_kg, rest_seconds)
  select
    coalesce(existing.id, gen_random_uuid()),
    saved_id,
    (item.value ->> 'exerciseId')::uuid,
    item.ordinality - 1,
    (item.value ->> 'targetSets')::smallint,
    (item.value ->> 'targetReps')::smallint,
    (item.value ->> 'targetKg')::numeric,
    (item.value ->> 'restSeconds')::integer
  from jsonb_array_elements(p_exercises) with ordinality as item (value, ordinality)
  left join public.routine_exercises as existing
    on existing.id = (item.value ->> 'id')::uuid
    and existing.routine_id = saved_id
  on conflict (id) do update set
    exercise_id = excluded.exercise_id,
    position = excluded.position,
    target_sets = excluded.target_sets,
    target_reps = excluded.target_reps,
    target_kg = excluded.target_kg,
    rest_seconds = excluded.rest_seconds;

  return saved_id;
end;
$$;

revoke all on function public.save_routine(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.save_routine(uuid, text, jsonb, uuid) to authenticated;
