-- A planned workout that someone has started is in progress until that workout
-- ends. Moving or canceling it in the meantime would make finishing record the
-- workout on the wrong day, or not at all, so both are refused until then.
--
-- Only direct changes are checked. Deleting a routine still cancels its plans
-- (that update runs inside routines_release_scheduled_workouts, a trigger), and
-- finishing a workout only marks its plan completed, which is always allowed.

create function public.scheduled_workouts_guard_in_progress()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
    and (new.local_date is distinct from old.local_date or new.status = 'canceled')
    and exists (
      select 1 from public.workout_sessions as session
      where session.schedule_id = old.id and session.status = 'active'
    )
  then
    raise exception 'This workout is in progress.'
      using errcode = '55006',
            hint = 'Finish or stop the workout before moving or canceling its plan.';
  end if;
  return new;
end;
$$;

revoke all on function public.scheduled_workouts_guard_in_progress() from public, anon, authenticated;

create trigger scheduled_workouts_guard_in_progress
  before update on public.scheduled_workouts
  for each row execute function public.scheduled_workouts_guard_in_progress();
