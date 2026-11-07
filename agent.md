# iFit — Shared AI Coding Instructions

Project: CSC 238-01, Group 12  
Team: Sukhdip Sandhu, Kaden Tan, Sina Vaghefi  
Delivery window: two working days from kickoff  
Deliverable: a fully functional mobile-first web app running locally at `http://localhost:3000`, with real authentication and persistent data, locally committed by AI and pushed to the shared repository by users. No deployment, hosting setup, public URL, or hosted demo is required. Work scope: coding and code verification only; no deployment or noncoding assignments.

## 1. Read this first

This is the same instruction file for three AI coding agents. Team-member names identify the agent lanes; the AI performs coding, verification, local commits, and local code integration. Only the user performs remote pushes. AI agents must never run `git push`, push through an API, or use another mechanism to upload commits to a remote repository. No stage assigns implementation or review work to a human team member. Before editing, read the repository, its existing instructions, package scripts, and this file. Work only in your assigned lane. Implement and verify code; do not stop at a proposal, static screens, placeholder handlers, or simulated persistence.

This instruction file exists locally only. Never stage, commit, push, or copy its contents into a repository-tracked file. Do not create a tracked `AGENTS.md` copy. Each team member supplies their own local copy directly to their AI agent at the start of a session. Names such as `agent.md`, `AGENT.md`, and `AGENTS.md` do not change this local-only rule for copies of this document.

Prefer keeping this file outside the repository and instructing the agent to read its absolute local path. If kept inside a checkout, exclude its exact repository-relative path using the local Git exclude file (`git rev-parse --git-path info/exclude`); do not modify the shared `.gitignore` solely for this local instruction file. Before each commit, confirm this document and any copies are absent from the staged diff. If a copy is already tracked, stop before pushing and report the conflict; an ignore rule does not untrack an existing file. Preserve unrelated repository instruction files.

### Start immediately from this file

The member opens the shared repository checkout and gives the AI this local file with one sentence: **“I am Kaden”**, **“I am Sukhdip”**, or **“I am Sina.”** The agent selects that lane below, inspects the checkout/remote, determines the earliest unfinished stage from Git and implemented code, and starts the assigned coding without asking the member to break down tasks or write code. If the lane is already explicit in the session, do not ask again. If it is missing, ask only which of the three members the agent represents. Request a repository location or environment value only when it cannot be obtained from the existing checkout/configuration and blocks execution.

Each member runs their agent in a separate clone/worktree of the same repository. All three agents use this identical file. The member's recurring action is executing the push command provided by the AI and confirming it succeeded. The stage integration owner also pushes the AI-prepared integrated code. No member is assigned manual coding, conflict resolution, test writing, or technical review. Existing repository access and a usable Supabase configuration remain necessary prerequisites; this file cannot supply credentials.

## 2. App context and product direction

**iFit: Making Every Workout Count** helps beginner gym-goers, particularly students aged 18–25, complete workouts despite occupied equipment, uncertainty about exercises, and inconvenient tracking. Research at The WELL and City Sports found reliance on memory/notes, interruptions from logging, improvised substitutions, and frequent use of external technique resources.

The source is the team's Final Design Report and established prototype direction. Match the supplied Figma when available; no live prototype link is supplied in this document. Use a consistent mobile-first interface when an asset or detail is unspecified. Do not block core implementation on missing decorative assets.

Priorities: fast logging, large controls, understandable choices, editable records, private progress, and user control. Editing an already completed set is intentional functionality. Preserve it throughout the workout and in history.

This two-day release implements the three core tasks end to end. Native watch applications, actual watch pairing/haptics, QR equipment installations, social messaging, public feeds, automated form analysis, and predictive training systems are later milestones. A responsive quick-log screen delivers the glanceable interaction on the web. This scope is an implementation decision for the deadline, not a claim that those later concepts are delivered.

## 3. Three primary tasks and acceptance criteria

### Task 1 — Adapt when equipment is unavailable

Flow: Dashboard → Start/resume workout → Exercise → Machine Taken? → Alternatives → Select and confirm → Continue workout.

- Show alternatives from a curated exercise catalog, with equipment, target muscles, and a short reason for the suggestion.
- Allow equipment filtering and handle no matching alternatives with clear recovery controls.
- Carry over remaining planned sets and rep targets; keep completed sets attached to the original exercise.
- Do not transfer a barbell weight directly to dumbbells or machines. Prefill only the user's prior load for the selected alternative; otherwise require an explicit load entry, including valid bodyweight handling.
- Let the user review and cancel before confirming. Persist the choice and resume the session after refresh.

### Task 2 — Check form and choose a variation

Flow: Active exercise → Form & Cues → Read cues/view demonstration → Return, stop/skip, or review a variation → Confirm → Continue.

- Each supported exercise has equipment, movement instructions, three concise cues, common mistakes, and a clear demonstration asset or illustration.
- Use original local diagrams or properly attributed assets; avoid mandatory third-party video availability.
- Show a concise stop-if-pain message. Do not diagnose an injury or promise that any variation eliminates pain.
- Offer easier variations where curated. Explain the difference; the user decides whether to switch or stop.
- Reuse Task 1's substitution operation; preserve logged sets and workout state when opening/closing guidance.

### Task 3 — Record sets without breaking focus

Flow: Active workout → Review prefilled reps/load → Adjust → Complete Set → Save confirmation/rest timer → Next set → Finish → Summary/history.

- Prefill from the same exercise's last logged performance, falling back to routine targets. Show which value is a target versus a prior result.
- Save actual reps and weight, not just planned numbers. Provide edit/delete/undo behavior for mistaken entries.
- Prevent duplicate entries from double taps and network retries. Show pending, success, and failure states; failed input remains available for retry.
- Rest timer supports pause/resume, +30 seconds, and skip. Derive countdown from timestamps so refresh/backgrounding does not restart it. Browser notifications/haptics are optional and must not be promised.
- Finishing creates a persistent summary; history and dashboard reflect saved results. Refreshing must retain the active session and saved edits.

## 4. Required supporting features

- Real email/password sign-up, sign-in, sign-out, protected pages, and account-specific records. Follow the configured authentication provider's email-confirmation behavior; implement configuration validation and clear authentication errors.
- Profile: display name and preferred display unit. Store weights canonically in kilograms; convert at UI boundaries with consistent rounding and distinguish per-dumbbell from total load.
- Dashboard: today's planned workout, start/resume action, recent sessions, and private progress summary based on actual records.
- Routines: create, rename, edit, delete, add/reorder exercises, and set planned sets/reps/rest. Seed usable starter templates without overwriting user data.
- Flexible scheduling: assign a routine to a date and reschedule/cancel without deleting completed history. No guilt-based missed-session prompts.
- Exercise catalog: at least 12 documented exercises spanning push, pull, squat, hinge, and core; enough alternatives and variations to demonstrate all primary flows.
- History: session list/detail, corrected set values, dates, duration, and simple per-exercise progress. Label volume calculations clearly; exclude incompatible/bodyweight-only metrics rather than mixing them misleadingly.
- Responsive navigation, keyboard access, visible focus, labeled inputs, readable contrast, and touch targets around 44px.
- Useful loading, empty, validation, offline/network-failure, and not-found states. Never display a save success before server acknowledgment.

## 5. Required shared technology stack — all three AI lanes

Kaden's AI, Sukhdip's AI, and Sina's AI must use this same stack in the same application repository. These are required technologies, not optional defaults. Do not create separate apps or substitute another framework, language, database, authentication provider, or package manager. If an existing repository conflicts with this stack, report the specific conflict before changing architecture; do not silently adopt a different stack.

| Area | Required technology | Shared implementation rule |
| --- | --- | --- |
| Runtime | Python 3.12 for the backend; compatible Node.js LTS for the frontend | Kaden's AI pins Python in `.python-version` and Node in `.nvmrc`; every lane uses both. |
| Application framework | Next.js App Router frontend + FastAPI Python backend | One repository; `frontend/src/app` for pages and `backend/app` for the API. |
| UI framework | React | Use the React version compatible with the pinned Next.js release. |
| Language | Python backend; TypeScript frontend; SQL migrations | Business rules, authorization and persistence live in Python; React UI stays in TypeScript. |
| Styling | Tailwind CSS | Reuse shared styles and components across all lanes. |
| Backend operations | FastAPI + Pydantic + Uvicorn | Implement validated REST endpoints under `/api/v1`; Next.js must not implement a competing business backend. |
| Database | Supabase PostgreSQL | Real persistent records, versioned SQL migrations and idempotent seed. |
| Authentication | Supabase Auth | Email/password authentication and shared server/browser session helpers. |
| Authorization | PostgreSQL Row-Level Security and server-side ownership checks | Protect all personal data and child records. |
| Unit/integration tests | pytest + HTTPX for Python; Vitest for frontend | Test API ownership, validation and domain logic in Python; UI helpers/components in TypeScript. |
| End-to-end tests | Playwright | Test all three primary journeys against the locally running app. |
| Package management | Python venv + pip; npm for frontend | Pin backend runtime/dev requirements; commit frontend `package-lock.json`. |
| Version control | Git and the team's shared repository | AI commits locally; users alone push code. |
| Execution | Localhost | Frontend on port 3000; Python API on port 8000; run both, no deployment required. |

Kaden's AI establishes compatible dependency versions during Stage 1 and commits the manifest and lockfile. Other agents use those exact resolved versions and do not independently upgrade dependencies or regenerate configuration. Do not change stacks during the two-day build. Python/FastAPI is mandatory for the backend. Do not substitute Flask, Django, Express or Next.js Server Actions for the business API. Keep Supabase Auth/PostgreSQL; no custom password store.

Implement `npm run build` plus `npm start` for a local production run, and support an available port fallback for development. A localhost frontend may use the supplied Supabase instance; a self-contained offline backend is not required. Configure authentication callbacks/redirect handling for localhost and never require a deployed app URL.

### Python API implementation and local commands

Use `backend/app/main.py` with `app = FastAPI()`, feature routers/services under `backend/app/features/{identity,planning,workout}`, shared authentication/configuration under `backend/app/core`, and Python tests under `backend/tests`. Each lane implements its own API endpoints and Pydantic validation along with its frontend routes. Kaden creates the API entrypoint/auth dependency, Sukhdip configures pytest/HTTPX and CI, and Sina configures browser tests to start/check both servers. All changes follow the existing A/B/C push checkpoints; do not add another stage.

Supabase Auth supplies user access tokens. The frontend authenticates with Supabase and calls FastAPI using `Authorization: Bearer <access_token>`. Python validates tokens against the configured Supabase project (including expiry and identity); never merely decode an unverified token. Use a request-scoped Supabase Python client with that user's token for database queries/RPC so RLS applies. Do not share mutable authentication state across users or use a service-role key for normal requests. All workout/routine/profile persistence and business rules go through Python. Supabase authentication itself may use the browser SDK. Restrict API CORS to configured localhost frontend origins.

Kaden's AI defines REST paths and Python schemas in Stage 1 for all operations below; each lane implements its own endpoints. Use standard HTTP methods/status codes with the agreed `{ data, error }` response shape, including validation/auth failures. Keep frontend contracts consistent with FastAPI OpenAPI. SQL RPC functions handle transactional swaps/finish while called with the user's identity.

The implementation must provide `backend/requirements.txt` and `backend/requirements-dev.txt` with compatible pinned dependencies (FastAPI, Uvicorn, Pydantic, Supabase Python SDK, pytest, HTTPX, Ruff and mypy as applicable), `.python-version`, and environment examples for both apps. Do not commit `.venv`, Python caches or secrets. Run from the repository root:

```bash
python -m venv .venv
# Activate: Windows PowerShell .venv\Scripts\Activate.ps1
# Activate: macOS/Linux source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

In another terminal, `cd frontend`, `npm ci`, then `npm run dev`. Configure the frontend API base URL as `http://localhost:8000` via its environment example. Open `http://localhost:3000`; FastAPI docs are at `http://localhost:8000/docs`. Frontend build/start commands run inside `frontend`. Backend checks include `python -m pytest backend/tests`, `python -m ruff check backend`, and `python -m mypy backend/app` with committed configuration. Backend tests must include two-user isolation and concurrent-request identity separation.

Use server-side authorization and database ownership policies for every user-owned table. Never trust a client-supplied user ID. Keep privileged keys server-only; do not require a service-role key for normal user requests. Include `.env.example` with names and descriptions only. Do not commit `.env`, tokens, credentials, build output, or `node_modules`.

Suggested routes:

| Route | Purpose | AI lane |
| --- | --- | --- |
| `/login`, `/signup`, `/profile` | Identity and settings | Kaden’s AI |
| `/` | Dashboard/start/resume | Kaden’s AI |
| `/routines`, `/routines/[id]`, `/schedule` | Planning | Sukhdip’s AI |
| `/exercises`, `/exercises/[id]` | Catalog and cues | Sukhdip’s AI |
| `/workout/[id]` | Active session, quick logging, timer | Sina’s AI |
| `/history`, `/history/[id]` | Completed sessions and progress | Sina’s AI |

### Equal ownership boundaries

Each lane owns its frontend, Python API routers/services/Pydantic schemas, SQL migrations/policies, and automated tests. Backend work is not concentrated on one member.

- **Kaden's AI:** app scaffold, shared navigation/UI, Supabase clients, auth/profile/dashboard, canonical unit/date helpers; identity/profile migrations; Stage 1 integration.
- **Sukhdip's AI:** routines, scheduling, exercise catalog, cues and alternative-selection UI; planning/catalog migrations and seed; Stage 2 integration.
- **Sina's AI:** active sessions, transactional substitution/logging, rest timer, history/progress; workout/history migrations; Stage 3 integration.
- **Shared files:** Kaden's AI initially creates package configuration, lockfile, global layout and `frontend/src/lib/contracts.ts` and Python Pydantic schemas. After Stage 1, only the current stage's integration AI changes shared configuration/contracts as necessary to combine the lane code. Other agents keep changes within owned feature paths and migrations. Do not independently upgrade dependencies.
- **Test infrastructure:** Kaden's AI creates lint/type/build scripts; Sukhdip's AI creates pytest/HTTPX and Vitest configuration plus CI; Sina's AI creates Playwright configuration. Every lane writes and fixes its own behavioral tests and browser journey coverage.

## 6. Shared data and service contracts

During Stage 1, Kaden's AI implements `frontend/src/lib/contracts.ts` and Python Pydantic schemas from the entities and operation names below, with FastAPI OpenAPI as the API contract source. Sukhdip and Sina can immediately code their independent feature models, validators, catalog assets, SQL and domain logic using this document; they do not wait idle or create competing shared contract files. Their feature modules avoid importing unpublished shared files until Stage 1 integration. Kaden's integration AI reconciles the exact types and call sites before that stage passes. From Stage 2 onward all lanes consume the integrated contracts.

All IDs are UUIDs; timestamps are UTC ISO strings; calendar dates use the user's local date. Every mutable record includes `created_at` and `updated_at` where relevant. Ordered migrations are `0001_identity` (Kaden), `0002_planning` (Sukhdip), and `0003_workouts` (Sina), with unique later migration names per lane. Foreign-key order is resolved at integration; never edit a teammate's applied migration in place.

| Entity | Required fields/relationships |
| --- | --- |
| Profile | auth user ID, display name, display unit, timezone |
| Exercise | ID, name, muscles, equipment, load convention, instructions, cues, mistakes, local asset reference |
| Alternative | source exercise ID, target exercise ID, kind (`substitution`/`regression`), rationale |
| Routine | ID, owner user ID, title |
| Routine exercise | ID, routine ID, exercise ID, position, target sets/reps, optional target kg, rest seconds |
| Scheduled workout | ID, owner, routine ID, local date, status |
| Workout session | ID, owner, optional routine/schedule IDs, routine name snapshot, start/end, status |
| Session exercise | ID, session ID, exercise ID, position, target snapshot, optional replaced-entry ID |
| Set log | ID, session-exercise ID, client operation UUID, ordinal, actual reps, kg or bodyweight mode, completed timestamp |

Session entries snapshot targets so later routine edits cannot rewrite history. A substitution keeps the old session entry/logs and inserts a linked replacement for remaining work. Deleting a routine must not cascade into historical workouts. Seed catalog writes are idempotent.

Required operation names (implement as Python services behind FastAPI REST endpoints, with typed frontend API-client wrappers):

- `getDashboard()`, `getProfile()`, `updateProfile(input)`.
- `listExercises(filters)`, `getExercise(id)`, `getAlternatives(exerciseId, kind, equipment)`.
- `listRoutines()`, `getRoutine(id)`, `saveRoutine(input)`, `deleteRoutine(id)`.
- `scheduleRoutine(input)`, `rescheduleWorkout(id, localDate)`, `cancelScheduledWorkout(id)`.
- `startWorkout({routineId, scheduleId?, operationId})`, `getActiveWorkout()`, `getWorkout(id)`.
- `logSet({sessionExerciseId, reps, weightKg, loadMode, operationId})`, `updateSet(id, patch)`, `deleteSet(id)`.
- `swapExercise({sessionExerciseId, replacementExerciseId, remainingTargets, operationId})`.
- `saveRestState(sessionId, state)`, `finishWorkout(id, operationId)`, `listHistory()`, `getProgress(exerciseId)`.

Return a common typed result: `{ data, error }`, with errors carrying a stable code and safe user-facing message. Validate IDs, ownership, positive integer reps, finite nonnegative load, valid rest duration, and session status on the server. Use transactions/database functions for swaps and finish operations; unique owner-scoped operation IDs make creation/retries idempotent. Permit only one active session per user. Define the exact input/output types and update all call sites together when a contract changes.

Keep catalog public/read-only if desired; all personal records are private. Test access through child relationships too, including session exercises and set logs. Migrations, policies, seed, and setup instructions must be reproducible in a fresh database.

## 7. Coding-only execution contract

All coding is performed by AI agents; remote pushes are performed only by users. Kaden, Sukhdip, and Sina are lane labels identifying whose AI owns the code. Humans provide this file, the lane selection, existing access/configuration, and manually push the completed code when prompted; they are not assigned coding, manual testing, reviews, reports, meetings, or handoff documents.

Only implement application code, schema/migrations/seed, code assets, automated tests, dependency/configuration files, and scripts required to run and verify the app. Reading existing code, running checks, resolving code conflicts, making local commits and integrating code locally are part of AI coding execution. Pushing code is a user-only checkpoint. Do not create presentations, design reports, research deliverables, screenshots, review assignments, handoff documents, release reports, or deployment tasks. Do not deploy, provision cloud services, or change hosting access.

A supplied repository and usable authentication/database configuration are execution prerequisites. Implement `.env.example`, startup validation, and migrations in code. If missing access prevents real execution, report the specific blocker; do not invent credentials or replace persistent behavior with fake data.

**Mandatory checkpoint gate:** AI completes one coding checkpoint → runs its available checks and fixes failures → commits locally → provides the exact push command and pauses → user pushes → AI verifies the remote SHA → only then begins the next checkpoint in the same stage. Repeat for checkpoints A, B and C. After every lane has completed and user-pushed all three checkpoints, the integration AI combines/checks the code → its user pushes the integrated result → AI verifies remote main → only then begins the next stage. A local commit, unpushed branch, or incomplete dependency does not satisfy the gate. Do not begin later-stage coding while waiting for an earlier-stage push.

All three AI lanes code in parallel within every stage, including Stage 1, in separate clones/worktrees. The current integration AI combines the three pushed branches only after all users have pushed. Every stage must be integrated and user-pushed to main before any AI begins the next stage. Resume from Git evidence rather than repeating completed work.

## 8. Equal two-day coding assignments

Each lane has the same **16-hour coding budget**, approximately eight hours per day: Stage 1 = 5 hours, Stage 2 = 5 hours, Stage 3 = 6 hours. These are balanced estimates of implementation complexity, not guarantees of identical AI runtime. Each lane performs full-stack feature work and automated checks. Integration rotates so each AI handles it exactly once; approximately one hour of that lane's assigned stage budget is reserved for integration and shared-file fixes. Each lane has three mandatory user push checkpoints inside every stage, plus the assigned integration push; elapsed time never bypasses a gate.

| Stage | Kaden's AI codes | Sukhdip's AI codes | Sina's AI codes | Integration AI | Exit gate |
| --- | --- | --- | --- | --- | --- |
| 1 — Foundation and domain code (Day 1, first 5h) | Scaffold Next.js/TypeScript/Tailwind, shared layout/navigation and components, Python FastAPI entrypoint, Supabase auth dependency, CORS and env validation, shared contracts, identity/profile SQL with RLS, unit/date helpers and lint/type/build scripts. Reserve time to integrate the other lanes' foundation code. | Immediately implement exercise data/assets with 12+ exercises, alternative/regression relationships, routine/schedule models and validators, planning/catalog SQL with RLS and idempotent seed, pytest/HTTPX and Vitest configuration plus CI. Keep initial modules independent of unpublished scaffold files. | Immediately implement session/set/rest/history models and validators, timer math and snapshot rules, workout SQL with RLS, unique operation constraints and transactional logging/swap/finish functions, Playwright configuration. Keep initial modules independent of unpublished scaffold files. | Kaden's AI | All domain/schema code combined; dependency order/types resolved; fresh migrations/seed, relevant domain tests, lint/types/build pass. All three branches and integrated main have been pushed by users. |
| 2 — Functional app journeys (Day 1 last 3h + Day 2 first 2h) | Implement signup/login/logout, protected routes, profile/unit settings, dashboard queries/UI, and today's workout/start/resume connections; add Python API and frontend auth/profile/dashboard tests. | Implement persistent routine CRUD/reorder, schedule/reschedule/cancel, catalog/detail/cues, equipment filtering and alternative/regression selection/confirmation; add planning/guidance tests. Reserve time to integrate shared interfaces and connect callbacks. | Implement session start/resume, actual set log/edit/delete/undo, rest timer UI/persistence, transactional swap wiring, workout finish and basic history screens; add workout tests. | Sukhdip's AI | All three primary journeys work locally with real persistence, including shared substitutions and preserved logs. Lane tests and integrated checks pass; users have pushed all branches and integrated main. |
| 3 — Complete behavior and fix code (Day 2 last 6h) | Complete dashboard/private progress summaries, auth expiry/error recovery, unit/timezone behavior, shared mobile/navigation/accessibility fixes; implement auth and two-account isolation browser coverage; repair own lane failures. | Complete planning/guidance empty/error/cancel paths, load explanations, routine deletion/history compatibility and mobile/accessibility behavior; implement substitution and guidance browser coverage; repair own lane failures. | Complete history/progress corrections, duplicate/retry prevention, failed-save recovery and timer refresh behavior; implement quick-log/history browser coverage and repair own lane failures. Reserve time for final cross-module integration and full suite fixes. | Sina's AI | All required features work on localhost; migrations/seed, lint/types/unit/integration/browser tests and build pass. Every lane is committed and user-pushed; final integrated main is user-pushed and verified. |

**Equal allocation:** Kaden = 5 + 5 + 6 = 16 hours and one integration; Sukhdip = 5 + 5 + 6 = 16 hours and one integration; Sina = 5 + 5 + 6 = 16 hours and one integration. Each lane owns its feature UI, persistence, validation and tests. No lane is assigned the other lanes' entire backend or all testing.

Each AI implements its current table cell in the A/B/C checkpoints below, with a separate local commit, user push and verification pause after each checkpoint. Never implement an entire stage before the first push pause. There are no separate human planning, review, manual QA, reporting, documentation or deployment assignments. Reduce decorative animations, chart complexity and extra templates first if needed; preserve required functional flows. Report genuine blockers rather than claiming a two-day guarantee.

### Mandatory coding checkpoints within each stage

Each cell is a substantive code increment, not a separate planning or reporting task. Complete checkpoints in order within your lane. There are **three distinct user push events per stage per member**, normally **nine lane pushes per member across the project**, plus that member's integration push and any additional fix pushes. Do not batch A/B/C into one push, create empty commits to meet a count, or proceed through checkpoints while waiting for a push.

| Checkpoint | Kaden's AI codes and commits | Sukhdip's AI codes and commits | Sina's AI codes and commits |
| --- | --- | --- | --- |
| 1A | Next.js/TypeScript/Tailwind scaffold, package lock, local run scripts and basic layout. | Exercise catalog data, local cue assets and alternative/regression mappings in owned paths. | Session/set/rest models, validators and timestamp-based timer logic in owned paths. |
| 1B | FastAPI entrypoint, Python dependency files, Supabase request-scoped client/auth dependency, CORS and environment validation, identity/profile migrations and RLS. | Planning/catalog migrations, RLS, idempotent seed and routine/schedule validators. | Workout migrations, RLS, snapshots, operation uniqueness and transaction functions. |
| 1C | Shared contracts/navigation/UI, unit/date helpers and lint/type/build configuration. | pytest/Vitest/CI configuration and catalog/planning domain tests. | Playwright configuration and timer/snapshot/transaction tests. |
| 2A | Signup/login/logout and protected routes with auth tests. | Routine CRUD, ordering and persisted targets with tests. | Start/resume workout and actual set saving with persistence tests. |
| 2B | Profile/unit settings and dashboard data/UI with tests. | Scheduling/rescheduling/cancellation and catalog/detail/form-cue UI with tests. | Set corrections/delete/undo and persistent rest timer UI with tests. |
| 2C | Today's workout and dashboard start/resume wiring with behavior tests. | Equipment filters, alternative/regression confirmation and live-session callbacks with tests. | Transactional substitution wiring, finish workout and basic history UI with tests. |
| 3A | Dashboard/private progress, units/timezones and auth-expiry/error recovery. | Planning/guidance empty/error/cancel paths and alternative-load explanations. | History/progress corrections, duplicate/retry protection and failed-save recovery. |
| 3B | Shared responsive/navigation/accessibility fixes and two-account isolation tests. | Routine deletion/history compatibility, responsive/accessibility fixes and substitution/guidance browser tests. | Timer refresh recovery and quick-log/history/edit-after-log browser tests. |
| 3C | Fix remaining auth/dashboard/ownership failures and run lane regression checks. | Fix remaining planning/guidance failures and run lane regression checks. | Fix remaining workout/history failures and run lane regression checks. |

After each row applicable to your lane: check → local commit → user push → verify → next row. Other lanes do not have to reach the same checkpoint at the same time. Preserve frozen interfaces and do not consume another lane's unfinished code; cross-lane dependency blockers require a verified published prerequisite, never a fabricated replacement.

During early Stage 1, some full-app checks cannot run until the scaffold and test dependencies are integrated. Run available syntax/data/SQL/domain checks and state exactly which checks are blocked; do not invent passing results. Full-stage checks remain mandatory before integration passes. If a checkpoint is already implemented, use its actual distinct remote commit evidence and checks rather than making empty changes; explain any consolidated inherited history without manufacturing pushes.

## 9. Commit and user-push after every checkpoint; integrate after every stage

Use the existing team remote. Do not create unrelated repositories. Every stage has three branches: `<member>/stage-<number>`, where member is `kaden`, `sukhdip` or `sina` and number is 1, 2 or 3. Each assigned integrator prepares a separate local `integration/stage-<number>` branch. Start each stage branch from the verified remote `main` containing the completed previous stage.

The stage's assigned integration AI prepares local integration; that member performs its remote pushes (Stage 1 Kaden, Stage 2 Sukhdip, Stage 3 Sina). Other agents prepare local commits on their lane branches; Sukhdip and Sina push their respective branches themselves. No AI agent may push any branch, merge a remote pull request, or perform an equivalent remote write. Read-only fetch/remote verification and local merges/commits are allowed. If branch protection requires a PR, provide the branch and target to the user; the user handles remote PR creation/merge requirements. Do not bypass repository protection.

For every lane checkpoint (A, B and C in every stage):

1. Fetch the remote and inspect status. Preserve unrelated changes. Verify the prior-stage integration commits are present before branching.
2. Implement only the current assigned checkpoint, not the remaining checkpoints or full stage. Use the frozen contracts and actual persistence services.
3. Run available lint, typecheck, relevant tests and build checks for the checkpoint. Fix failures. Run the integrated browser suite when the stage gate requires it.
4. Stage explicit owned application files; inspect the diff for accidental changes/secrets and confirm this local instruction document and any copies are not staged. Do not use blanket staging such as `git add .` or `git add -A`. Commit with stage, checkpoint and lane identifiers, for example `feat(stage-2A/planning): persist routine editing`.
5. Stop and give the user the exact command for the current branch, such as `git push -u origin sukhdip/stage-2`, plus the local commit SHA and check results. The AI must not execute this command. State the stage/checkpoint ID, completed code, checks, SHA and exact push command, followed by: **Waiting for your push; I will not start the next checkpoint yet.** The same stage branch receives A, B and C as separate verified user pushes.
6. After the user confirms the push, fetch/read the remote and compare the local commit SHA with the remote branch SHA (`git ls-remote origin refs/heads/<branch>`). User confirmation triggers verification; it does not replace it. If read access is unavailable, request the remote SHA or push output and keep advancement blocked until evidence is sufficient. Never treat elapsed time or silence as a completed push. Resume at the next checkpoint only after verifying this push; after C, wait for stage integration instead.

Integration AI, after every active lane's user has separately pushed A, B and C:

1. Fetch all stage branches. Merge them into a local integration branch based on current `origin/main`, in Kaden → Sukhdip → Sina order.
2. Resolve code conflicts without discarding another lane's functionality. Regenerate the lockfile with the agreed package manager if needed.
3. Run integrated checks and fix integration defects. Commit fixes locally. Pause and give the current integration owner the exact push command for the integration branch, or main when permitted. The AI does not execute any remote write.
4. The current integration owner pushes the integrated code and completes any repository-required PR merge. After confirmation, the AI fetches/verifies remote main and confirms every lane's stage commit is included (for squash/rebase merges, verify equivalent changes rather than requiring original commit ancestry).
5. Only now allow the next stage. Other agents fetch main and branch from this integrated commit. Any subsequent code fix creates a new local commit and requires another user push before the gate can pass.

AI agents must never push; users must not force-push shared branches. Never overwrite another lane's work, use destructive resets to hide conflicts, or report a local commit as pushed. A checkpoint or stage with zero needed code changes may reuse an existing pushed commit only when Git and passing checks prove its acceptance criteria already hold; explain that briefly instead of making empty commits.

## 10. Automated coding checks and functional completion

Kaden's AI implements lint/type/build and the ordered database runner; Sukhdip's AI implements pytest/Vitest/CI and catalog seed; Sina's AI implements Playwright scripts. Integration produces runnable `lint`, `typecheck`, `test`, `test:e2e`, `build`, and database migration/seed scripts. Each lane implements its own tests. CI runs Python lint/types/pytest, frontend lint/types/Vitest, and frontend build. Browser tests start/check both local servers. Browser tests use isolated accounts/data against the configured real persistence backend. Test fixtures must not become hardcoded release data.

Required automated coverage and code behavior:

- Sign-up, sign-in/out and protected routes function with configured provider behavior.
- User A cannot access User B's profile, routines, schedule, sessions or child set records through direct IDs.
- Routine create/edit/reorder/delete and schedule/reschedule/cancel persist across reloads.
- Starting/resuming uses one active session and survives refresh.
- Swapping preserves old logs and remaining targets; cancel/no-alternative paths work; loads are not blindly copied between equipment types.
- Guidance opens/closes without losing session state; regression uses the shared swap operation; skip/stop remains available.
- Actual set values save correctly; completed logs can be edited; mistakes can be deleted/undone; invalid input is rejected.
- Double-click/retry does not duplicate sets or sessions; failed saves preserve input for retry.
- Timer pause/resume/+30/skip and refresh recovery use timestamp-based state.
- Finish is idempotent; summary/history/progress retain corrected data after a new login.
- Routine edits/deletion do not rewrite past sessions; canonical units and load conventions remain consistent.
- Browser flows pass at a narrow mobile viewport; labels, keyboard focus and controls are usable; no blocking client errors or dead actions.
- Fresh database migrations/seed succeed; seed is idempotent; lint, types, tests and production build pass.

Use focused tests for ownership, idempotency, substitutions, unit conversion, timer math and snapshots; browser tests cover the three complete journeys and editing a completed set. Never mark skipped, failed or unrun checks as passing.

The finished deliverable is the complete application code, schema/policies/seed, local guidance assets, automated tests, configuration and runnable scripts, all locally committed by AI and manually pushed by users to remote main. It must run with the supplied environment configuration and real saved user data. Completion is assessed on the locally running app: all three primary flows and supporting features must work on localhost with real persisted data. No deployment or hosted URL is required. A successful build alone does not prove the app is functional. If any required feature or check remains incomplete, say so and continue fixing within the assigned stage; do not claim full completion.

The local instruction file remains excluded from every commit and push. User-only pushing is the sole added human execution checkpoint; coding and automated verification remain AI responsibilities.
