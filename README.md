# iFit — Making Every Workout Count

A mobile-first workout app for beginner gym-goers who want to track sets quickly, find alternatives when equipment is occupied, and access exercise guidance without interrupting their workouts.

## Primary tasks

### 1. Adapt when equipment is unavailable

Open an active exercise, choose **Machine Taken?**, filter alternatives by equipment, and confirm a replacement. Completed sets stay attached to the original exercise; remaining targets carry forward. Loads are reviewed explicitly rather than blindly transferred between equipment types.

### 2. Check form and choose a variation

Access concise movement instructions, technique cues, demonstrations and common mistakes from the active workout. Review easier variations or skip/stop an exercise without losing workout progress. Guidance does not diagnose injuries or guarantee pain-free movement.

### 3. Log sets without breaking focus

Review prefilled reps and load, adjust actual results, and complete a set. Edit completed entries, recover from mistakes, use the rest timer, and finish with a saved summary and history.

## Planned features

- Email/password authentication and private, account-specific workout records.
- Dashboard with today's scheduled workout, start/resume controls and recent activity.
- Routine creation, editing, exercise ordering and planned set/rep/rest targets.
- Flexible scheduling, rescheduling and cancellation.
- Exercise catalog with technique cues, illustrations and curated alternatives.
- Persistent active workouts, quick logging and completed-set corrections.
- Rest timer with pause/resume, additional time and refresh recovery.
- Workout history and personal progress based on saved results.
- Mobile-friendly controls, keyboard navigation and clear loading/error states.

Native smartwatch support, QR equipment installations and social features are outside the two-day implementation scope.

## Shared technology stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js LTS compatible with the pinned Next.js version |
| Application | Next.js App Router, React and Python |
| Styling | Tailwind CSS |
| Backend operations | Next.js Server Actions; Route Handlers for necessary HTTP endpoints/auth callbacks |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Authorization | PostgreSQL Row-Level Security and server-side ownership checks |
| Unit/integration tests | Vitest |
| Browser tests | Playwright |
| Package management | npm with a shared `package-lock.json` |
| Version control | Git and GitHub |

All contributors use the same application and pinned dependencies. No separate Python backend is required.

## Local setup

### Prerequisites

- Git and access to this repository.
- The Node.js version specified by `.nvmrc` and `package.json` once implemented.
- npm.
- A configured Supabase project with email/password authentication enabled.

The Next.js app runs on localhost and can connect to Supabase over the internet. Local execution does not imply offline operation.

### 1. Clone and install

Replace the placeholders with this repository's actual URL and directory:

```bash
git clone <REPOSITORY_URL>
cd <REPOSITORY_DIRECTORY>
npm ci
```

`npm ci` requires the committed package manifest and lockfile. If the application foundation has not been merged yet, these commands will not be available until it is implemented.

### 2. Configure environment variables

Use the repository's `.env.example` as the authoritative list once implemented. Copy it to `.env.local` and fill in your own development values.

The Supabase integration needs the project URL and a browser-safe publishable/anonymous key. Use the exact variable names expected by the code and example file. Never expose a service-role key in browser code or commit credentials.

Configure any required authentication redirects to allow the local application URL, normally `http://localhost:3000`, including the callback path used by the implementation.

### 3. Initialize the database

Apply the repository's versioned SQL migrations in order, followed by its idempotent exercise/template seed. The agreed migration order is:

1. Identity and profiles.
2. Exercise catalog, routines and scheduling.
3. Workout sessions, set logs and history.

Use the database scripts actually committed to the repository. Exact script names and prerequisites must be added when implemented; do not run an invented migration command. Apply development seed/migrations only to the intended development database.

### 4. Start the app

The implementation must provide:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If that port is occupied, use the address printed by the development server and update authentication redirect settings as needed.

For a local production build:

```bash
npm run build
npm start
```

No deployment, hosting account or public application URL is required.

## Development checks

The implementation is expected to expose these scripts:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```