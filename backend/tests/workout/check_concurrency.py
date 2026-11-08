"""Opt-in real-Postgres concurrency check against a disposable migrated/seeded DB.

Run with ``python backend/tests/workout/check_concurrency.py``. Requires psql
on PATH and standard PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD variables for
the disposable database's migration owner. Never target production/user data.
Creates isolated UUID fixtures and removes them in a finally block.
"""

# All interpolated fixture values below are locally generated UUIDs, not input.
# ruff: noqa: S608

import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4


def sql(query: str) -> str:
    result = subprocess.run(
        ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],  # noqa: S607
        input=query,
        capture_output=True,
        text=True,
        check=True,
        timeout=30,
    )
    return result.stdout.strip()


def check() -> None:
    actor, routine, operation = (str(uuid4()) for _ in range(3))
    claims = json.dumps({"sub": actor, "role": "authenticated"})

    def as_user(query: str) -> str:
        return sql(
            f"begin; set local role authenticated; set local request.jwt.claims = '{claims}';"
            f"set local request.jwt.claim.sub = '{actor}';"
            f"{query}; commit;"
        )

    try:
        sql(
            f"insert into auth.users(id,email) values ('{actor}','{actor}@ifit.test');"
            f"insert into public.routines(id,owner_id,title) values ('{routine}','{actor}','Concurrency fixture');"
            "insert into public.routine_exercises(routine_id,exercise_id,position,target_sets,target_reps,rest_seconds)"
            f"select '{routine}',id,0,3,10,90 from public.exercises where load_convention='total' order by id limit 1;"
        )

        def start(_: int) -> str:
            return as_user(f"select (public.workout_start('{routine}','{uuid4()}')).id")

        with ThreadPoolExecutor(max_workers=8) as pool:
            sessions = list(pool.map(start, range(8)))
        if len(set(sessions)) != 1:
            raise AssertionError("Concurrent start operations created multiple sessions.")
        entry = sql(f"select id from public.session_exercises where owner_id='{actor}';")

        def log(_: int) -> str:
            return as_user(
                f"select (public.workout_log_set('{entry}',10,20,'weighted','{operation}')).id"
            )

        with ThreadPoolExecutor(max_workers=8) as pool:
            logs = list(pool.map(log, range(8)))
        if (
            len(set(logs)) != 1
            or sql(f"select count(*) from public.set_logs where owner_id='{actor}';") != "1"
        ):
            raise AssertionError("Concurrent log retries duplicated a set.")
        print(
            "PASS: eight concurrent starts produce one session; eight identical retries produce one set."
        )
    finally:
        sql(f"delete from auth.users where id='{actor}';")


if __name__ == "__main__":
    check()
