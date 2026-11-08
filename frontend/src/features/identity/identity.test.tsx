import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import type { Dashboard, Profile, WorkoutSummary } from '@/lib/contracts';

import { identityApi } from './api';
import { DashboardContent } from './components/DashboardView';
import { ProfileForm } from './components/ProfileSettings';
import { progressTiles, sessionDetails, sessionStatusLabel } from './dashboard-view';
import { changedFields, draftFrom, timeZoneOptions, validateDraft } from './profile-form-state';

const PROFILE: Profile = {
  userId: 'aaaaaaaa-0000-4000-8000-000000000001',
  displayName: 'Alex',
  displayUnit: 'lb',
  timezone: 'America/Los_Angeles',
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
};

const SESSION: WorkoutSummary = {
  id: 's1',
  routineNameSnapshot: 'Push day',
  status: 'completed',
  // 02:30 UTC on Nov 6 is the evening of Nov 5 in Los Angeles.
  startedAt: '2026-11-06T02:30:00Z',
  endedAt: '2026-11-06T03:10:00Z',
  durationSeconds: 2400,
  exerciseCount: 2,
  setCount: 12,
  weightedVolumeKg: 1000,
};

describe('profile form state', () => {
  it('sends only what changed, with the name trimmed', () => {
    const draft = { ...draftFrom(PROFILE), displayName: '  Alex  ' };
    expect(changedFields(PROFILE, draft)).toEqual({});
    expect(changedFields(PROFILE, { ...draft, displayName: ' Sam ', displayUnit: 'kg' })).toEqual({
      displayName: 'Sam',
      displayUnit: 'kg',
    });
  });

  it('validates the name and time zone', () => {
    expect(validateDraft(draftFrom(PROFILE))).toEqual({});
    expect(validateDraft({ ...draftFrom(PROFILE), displayName: '   ' }).displayName).toBe(
      'Enter a name.',
    );
    expect(validateDraft({ ...draftFrom(PROFILE), displayName: 'x'.repeat(51) }).displayName).toBe(
      'Use at most 50 characters.',
    );
    expect(validateDraft({ ...draftFrom(PROFILE), timezone: 'Mars/Olympus' }).timezone).toBeTruthy();
  });

  it('always offers the saved time zone and UTC', () => {
    expect(timeZoneOptions('Etc/GMT+5', ['Europe/London'])).toEqual([
      'Etc/GMT+5',
      'Europe/London',
      'UTC',
    ]);
    expect(timeZoneOptions('UTC').length).toBeGreaterThan(100);
  });
});

describe('dashboard wording', () => {
  it('describes a session in the user unit and labels volume', () => {
    expect(sessionDetails(SESSION, 'lb')).toBe('40 min · 2 exercises · 12 sets · 2,204.6 lb lifted');
    expect(sessionDetails(SESSION, 'kg')).toBe('40 min · 2 exercises · 12 sets · 1,000 kg lifted');
  });

  it('leaves out volume for bodyweight-only sessions instead of showing zero', () => {
    expect(
      sessionDetails({ ...SESSION, weightedVolumeKg: null, exerciseCount: 1, setCount: 1 }, 'kg'),
    ).toBe('40 min · 1 exercise · 1 set');
  });

  it('labels stopped sessions without judging them', () => {
    expect(sessionStatusLabel({ ...SESSION, status: 'stopped' })).toBe('Ended early');
    expect(sessionStatusLabel(SESSION)).toBeNull();
  });

  it('shows plain counts', () => {
    expect(progressTiles({ sessionsLast7Days: 2, sessionsLast30Days: 9, setsLast7Days: 40 })).toEqual([
      { label: 'Workouts this week', value: '2' },
      { label: 'Workouts in 30 days', value: '9' },
      { label: 'Sets this week', value: '40' },
    ]);
  });
});

const DASHBOARD: Dashboard = {
  profile: PROFILE,
  today: '2026-11-07',
  todaysWorkouts: [
    {
      id: 'p1',
      ownerId: PROFILE.userId,
      routineId: 'r1',
      routineTitle: 'Legs',
      localDate: '2026-11-07',
      status: 'planned',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    },
  ],
  upcomingWorkouts: [],
  activeWorkout: { id: 'w1', routineNameSnapshot: 'Pull day', startedAt: '2026-11-07T18:05:00Z' },
  recentSessions: [SESSION],
  progress: { sessionsLast7Days: 1, sessionsLast30Days: 3, setsLast7Days: 12 },
};

describe('DashboardContent', () => {
  const html = renderToStaticMarkup(<DashboardContent data={DASHBOARD} />);

  it('greets the user and shows their local date', () => {
    expect(html).toContain('Hi, Alex');
    expect(html).toContain('Saturday, November 7, 2026');
  });

  it('shows the workout in progress in their time zone', () => {
    expect(html).toContain('Pull day, started at 10:05 AM');
  });

  it("lists today's plan, progress and recent workouts in their unit and day", () => {
    expect(html).toContain('Legs');
    expect(html).toContain('Today');
    expect(html).toContain('Workouts in 30 days');
    expect(html).toContain('2,204.6 lb lifted');
    expect(html).toContain('Thu, Nov 5');
    expect(html).toContain('bodyweight sets');
  });

  it('offers a way forward when nothing is planned and nothing is finished', () => {
    const empty = renderToStaticMarkup(
      <DashboardContent
        data={{ ...DASHBOARD, todaysWorkouts: [], activeWorkout: null, recentSessions: [] }}
      />,
    );
    expect(empty).toContain('Nothing planned today');
    expect(empty).toContain('href="/schedule"');
    expect(empty).toContain('Finished workouts will show up here.');
    expect(empty).not.toContain('Workout in progress');
    expect(empty).not.toContain('bodyweight sets');
  });
});

describe('ProfileForm', () => {
  it('labels every setting and preselects the saved values', () => {
    const html = renderToStaticMarkup(<ProfileForm profile={PROFILE} onSaved={() => {}} />);
    expect(html).toMatch(/<label[^>]*>Display name<\/label>/);
    expect(html).toContain('<legend');
    expect(html).toContain('Weight unit');
    expect(html.match(/<input[^>]*value="lb"[^>]*>/)?.[0]).toMatch(/checked=""/);
    expect(html.match(/<input[^>]*value="kg"[^>]*>/)?.[0]).not.toMatch(/checked/);
    expect(html).toMatch(/<label[^>]*>Time zone<\/label>/);
    expect(html.match(/<option[^>]*value="America\/Los_Angeles"[^>]*>/)?.[0]).toMatch(/selected/);
    expect(html).toContain('20 kg shows as 44.1 lb');
  });
});

describe('identityApi', () => {
  it('does not call the API when signed out', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const result = await identityApi(async () => null, fetch).getDashboard();
    expect(result.error?.code).toBe('not_authenticated');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the token and only the changed fields', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ data: PROFILE, error: null })),
    );
    await identityApi(async () => 'tok', fetch).updateProfile({ displayUnit: 'kg' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/v1\/profile$/);
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe('{"displayUnit":"kg"}');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });
});

describe('dashboard start and resume', () => {
  const plan = DASHBOARD.todaysWorkouts[0]!;
  const done = { ...plan, id: 'p2', routineTitle: 'Done already', status: 'completed' as const };
  const orphan = { ...plan, id: 'p3', routineId: null, routineTitle: 'Old routine' };

  it('offers Start on planned workouts only when nothing is running', () => {
    const html = renderToStaticMarkup(
      <DashboardContent
        data={{ ...DASHBOARD, activeWorkout: null, todaysWorkouts: [plan, done, orphan] }}
      />,
    );
    expect(html.match(/>Start</g)).toHaveLength(1);
    expect(html).toContain('<span class="sr-only">: Legs</span>');
    expect(html).toContain('Routine was deleted');
    expect(html).not.toContain('Resume workout');
  });

  it('offers Resume, and no second Start, while a workout is running', () => {
    const html = renderToStaticMarkup(<DashboardContent data={DASHBOARD} />);
    expect(html).toMatch(/<a[^>]*href="\/workout\/w1"[^>]*>Resume workout<\/a>/);
    expect(html).not.toContain('>Start<');
    expect(html).toContain('Finish or resume your current workout before starting another.');
  });
});
