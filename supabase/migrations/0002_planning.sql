-- 0002_planning: exercise catalog, starter templates, routines and scheduling.
--
-- Depends only on Supabase Auth (auth.users, auth.uid()), so it applies cleanly
-- whether or not 0001_identity has run. The CHECK value lists mirror the unions
-- in src/features/catalog/types.ts and src/features/planning/types.ts.
--
-- Access model:
--   * Catalog and templates are public and read-only. Only the seed writes them.
--   * Routines and schedules are private to their owner.
--   * Clients get column-level INSERT/UPDATE grants, so owner_id can't be
--     supplied by a client at all; it always comes from auth.uid().

create function public.planning_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Catalog ---------------------------------------------------------------------

create table public.exercises (
  id uuid primary key,
  slug text not null unique,
  name text not null unique,
  pattern text not null check (pattern in ('push', 'pull', 'squat', 'hinge', 'core')),
  primary_muscles text[] not null check (cardinality(primary_muscles) >= 1),
  secondary_muscles text[] not null default '{}',
  equipment text not null
    check (equipment in ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight')),
  load_convention text not null
    check (load_convention in ('total', 'per_dumbbell', 'machine', 'bodyweight')),
  difficulty smallint not null check (difficulty between 1 and 3),
  summary text not null,
  instructions text[] not null check (cardinality(instructions) >= 3),
  cues text[] not null check (cardinality(cues) = 3),
  mistakes text[] not null check (cardinality(mistakes) >= 2),
  asset_path text not null,
  motion_asset_path text not null,
  asset_alt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_bodyweight_load_matches_equipment
    check ((equipment = 'bodyweight') = (load_convention = 'bodyweight'))
);

create table public.exercise_alternatives (
  source_exercise_id uuid not null references public.exercises (id) on delete cascade,
  target_exercise_id uuid not null references public.exercises (id) on delete cascade,
  kind text not null check (kind in ('substitution', 'regression')),
  rationale text not null,
  position smallint not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_exercise_id, target_exercise_id, kind),
  constraint exercise_alternatives_not_self check (source_exercise_id <> target_exercise_id)
);

create index exercise_alternatives_target_idx
  on public.exercise_alternatives (target_exercise_id);

create table public.routine_templates (
  id uuid primary key,
  slug text not null unique,
  title text not null,
  description text not null,
  position smallint not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routine_template_exercises (
  template_id uuid not null references public.routine_templates (id) on delete cascade,
  position smallint not null check (position >= 0),
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  target_sets smallint not null check (target_sets between 1 and 20),
  target_reps smallint not null check (target_reps between 1 and 100),
  rest_seconds integer not null check (rest_seconds between 0 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (template_id, position)
);

create index routine_template_exercises_exercise_idx
  on public.routine_template_exercises (exercise_id);

-- Routines --------------------------------------------------------------------

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- NULLs stay distinct, so this only constrains creates that carry an ID.
  constraint routines_owner_operation_key unique (owner_id, operation_id)
);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position integer not null check (position >= 0),
  target_sets smallint not null check (target_sets between 1 and 20),
  target_reps smallint not null check (target_reps between 1 and 100),
  -- Canonical kilograms. Three decimals keeps pound entries stable on round trips.
  target_kg numeric(7, 3) check (target_kg between 0 and 1000),
  rest_seconds integer not null check (rest_seconds between 0 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferred so a reorder can swap positions within one transaction.
  constraint routine_exercises_routine_position_key
    unique (routine_id, position) deferrable initially deferred
);

create index routine_exercises_exercise_idx on public.routine_exercises (exercise_id);

-- Scheduling ------------------------------------------------------------------

create table public.scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Cleared when the routine is deleted, so completed history outlives it.
  routine_id uuid references public.routines (id) on delete set null,
  -- Prefer the live routine's title; this covers rows whose routine is gone.
  routine_title text not null,
  local_date date not null,
  -- There is intentionally no 'missed' state: unfinished plans are not judged.
  status text not null default 'planned' check (status in ('planned', 'completed', 'canceled')),
  operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_workouts_owner_operation_key unique (owner_id, operation_id),
  constraint scheduled_workouts_planned_has_routine
    check (status <> 'planned' or routine_id is not null)
);

create index scheduled_workouts_owner_date_idx
  on public.scheduled_workouts (owner_id, local_date);

create index scheduled_workouts_routine_idx on public.scheduled_workouts (routine_id);

create unique index scheduled_workouts_one_planned_per_day_idx
  on public.scheduled_workouts (owner_id, routine_id, local_date)
  where status = 'planned';

-- Runs as the caller, so another user's routine reads as missing here and the
-- insert is then rejected by the row policy.
create function public.scheduled_workouts_snapshot_title()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select routine.title into new.routine_title
  from public.routines as routine
  where routine.id = new.routine_id;
  return new;
end;
$$;

create trigger scheduled_workouts_snapshot_title
  before insert on public.scheduled_workouts
  for each row execute function public.scheduled_workouts_snapshot_title();

-- Keeps history readable once a routine is deleted, and clears upcoming plans.
-- Security definer because completed rows are not updatable by their owner.
create function public.routines_release_scheduled_workouts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.scheduled_workouts
  set routine_title = old.title,
      status = case when status = 'planned' then 'canceled' else status end
  where routine_id = old.id;
  return old;
end;
$$;

revoke all on function public.routines_release_scheduled_workouts() from public, anon, authenticated;

create trigger routines_release_scheduled_workouts
  before delete on public.routines
  for each row execute function public.routines_release_scheduled_workouts();

create trigger exercises_touch_updated_at
  before update on public.exercises
  for each row execute function public.planning_touch_updated_at();

create trigger exercise_alternatives_touch_updated_at
  before update on public.exercise_alternatives
  for each row execute function public.planning_touch_updated_at();

create trigger routine_templates_touch_updated_at
  before update on public.routine_templates
  for each row execute function public.planning_touch_updated_at();

create trigger routine_template_exercises_touch_updated_at
  before update on public.routine_template_exercises
  for each row execute function public.planning_touch_updated_at();

create trigger routines_touch_updated_at
  before update on public.routines
  for each row execute function public.planning_touch_updated_at();

create trigger routine_exercises_touch_updated_at
  before update on public.routine_exercises
  for each row execute function public.planning_touch_updated_at();

create trigger scheduled_workouts_touch_updated_at
  before update on public.scheduled_workouts
  for each row execute function public.planning_touch_updated_at();

-- Row-level security ----------------------------------------------------------

alter table public.exercises enable row level security;
alter table public.exercise_alternatives enable row level security;
alter table public.routine_templates enable row level security;
alter table public.routine_template_exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.scheduled_workouts enable row level security;

create policy exercises_public_read on public.exercises
  for select to anon, authenticated using (true);

create policy exercise_alternatives_public_read on public.exercise_alternatives
  for select to anon, authenticated using (true);

create policy routine_templates_public_read on public.routine_templates
  for select to anon, authenticated using (true);

create policy routine_template_exercises_public_read on public.routine_template_exercises
  for select to anon, authenticated using (true);

create policy routines_owner_select on public.routines
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy routines_owner_insert on public.routines
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy routines_owner_update on public.routines
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy routines_owner_delete on public.routines
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy routine_exercises_owner_select on public.routine_exercises
  for select to authenticated
  using (exists (
    select 1 from public.routines as routine
    where routine.id = routine_id and routine.owner_id = (select auth.uid())
  ));

create policy routine_exercises_owner_insert on public.routine_exercises
  for insert to authenticated
  with check (exists (
    select 1 from public.routines as routine
    where routine.id = routine_id and routine.owner_id = (select auth.uid())
  ));

create policy routine_exercises_owner_update on public.routine_exercises
  for update to authenticated
  using (exists (
    select 1 from public.routines as routine
    where routine.id = routine_id and routine.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.routines as routine
    where routine.id = routine_id and routine.owner_id = (select auth.uid())
  ));

create policy routine_exercises_owner_delete on public.routine_exercises
  for delete to authenticated
  using (exists (
    select 1 from public.routines as routine
    where routine.id = routine_id and routine.owner_id = (select auth.uid())
  ));

create policy scheduled_workouts_owner_select on public.scheduled_workouts
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy scheduled_workouts_owner_insert on public.scheduled_workouts
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'planned'
    and exists (
      select 1 from public.routines as routine
      where routine.id = routine_id and routine.owner_id = (select auth.uid())
    )
  );

-- Only planned rows can change, which makes canceled and completed rows final.
-- There is no delete policy: canceling keeps the record.
create policy scheduled_workouts_owner_update on public.scheduled_workouts
  for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'planned')
  with check (owner_id = (select auth.uid()));

-- Privileges ------------------------------------------------------------------

revoke all on
  public.exercises,
  public.exercise_alternatives,
  public.routine_templates,
  public.routine_template_exercises,
  public.routines,
  public.routine_exercises,
  public.scheduled_workouts
from anon, authenticated;

grant select on
  public.exercises,
  public.exercise_alternatives,
  public.routine_templates,
  public.routine_template_exercises
to anon, authenticated;

grant select, delete on public.routines to authenticated;
grant insert (title, operation_id), update (title) on public.routines to authenticated;

grant select, insert, update, delete on public.routine_exercises to authenticated;

grant select on public.scheduled_workouts to authenticated;
grant insert (routine_id, local_date, operation_id), update (local_date, status)
  on public.scheduled_workouts to authenticated;
