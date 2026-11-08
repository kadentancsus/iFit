'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/layout';
import { TextField } from '@/components/ui/text-field';
import type { ApiResult, DisplayUnit, Profile } from '@/lib/contracts';
import { formatWeight } from '@/lib/units';

import { identityApi } from '../api';
import {
  changedFields,
  deviceTimeZone,
  draftFrom,
  timeZoneOptions,
  validateDraft,
  type ProfileDraft,
  type ProfileErrors,
} from '../profile-form-state';

const api = identityApi();

type SaveState =
  | { type: 'idle' }
  | { type: 'pending' }
  | { type: 'saved' }
  | { type: 'error'; message: string };

const UNITS: { value: DisplayUnit; label: string }[] = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'lb', label: 'Pounds (lb)' },
];

/** The editable form, given a loaded profile. */
export function ProfileForm({
  profile,
  onSaved,
  save = api.updateProfile,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
  save?: typeof api.updateProfile;
}) {
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(profile));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [state, setState] = useState<SaveState>({ type: 'idle' });
  const unitLegendId = useId();
  const zoneId = useId();
  const zones = timeZoneOptions(draft.timezone);
  const device = deviceTimeZone();

  const edit = (changes: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    if (state.type !== 'pending') setState({ type: 'idle' });
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.type === 'pending') return;
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length) return;

    const changes = changedFields(profile, draft);
    if (!Object.keys(changes).length) {
      setState({ type: 'saved' });
      return;
    }
    setState({ type: 'pending' });
    const result = await save(changes);
    if (result.error) {
      const field = result.error.field as keyof ProfileDraft | undefined;
      if (field && field in draft) setErrors({ [field]: result.error.message });
      setState({ type: 'error', message: result.error.message });
      return;
    }
    setDraft(draftFrom(result.data));
    setState({ type: 'saved' });
    onSaved(result.data);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <TextField
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        maxLength={50}
        value={draft.displayName}
        onChange={(event) => edit({ displayName: event.target.value })}
        error={errors.displayName}
      />

      <fieldset className="flex flex-col gap-2" aria-describedby={`${unitLegendId}-hint`}>
        <legend id={unitLegendId} className="text-sm font-semibold">
          Weight unit
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {UNITS.map((unit) => (
            <label
              key={unit.value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 has-[:checked]:border-brand has-[:checked]:bg-surface-muted"
            >
              <input
                type="radio"
                name="displayUnit"
                value={unit.value}
                checked={draft.displayUnit === unit.value}
                onChange={() => edit({ displayUnit: unit.value })}
                className="size-4 accent-[var(--brand)]"
              />
              {unit.label}
            </label>
          ))}
        </div>
        <p id={`${unitLegendId}-hint`} className="text-sm text-muted">
          Weights are always saved in kilograms; this only changes how they&apos;re shown. For
          example, 20 kg shows as {formatWeight(20, draft.displayUnit)}.
        </p>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={zoneId} className="text-sm font-semibold">
          Time zone
        </label>
        <select
          id={zoneId}
          name="timezone"
          value={draft.timezone}
          onChange={(event) => edit({ timezone: event.target.value })}
          aria-invalid={errors.timezone ? true : undefined}
          aria-describedby={`${zoneId}-hint${errors.timezone ? ` ${zoneId}-error` : ''}`}
          className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-foreground"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <p id={`${zoneId}-hint`} className="text-sm text-muted">
          Decides which day counts as &quot;today&quot; for your plans and history.
        </p>
        {errors.timezone ? (
          <p id={`${zoneId}-error`} className="text-sm font-medium text-danger">
            {errors.timezone}
          </p>
        ) : null}
        {device && device !== draft.timezone ? (
          <Button
            variant="ghost"
            className="self-start px-0 text-sm"
            onClick={() => edit({ timezone: device })}
          >
            Use this device&apos;s time zone ({device.replaceAll('_', ' ')})
          </Button>
        ) : null}
      </div>

      {state.type === 'saved' ? <Alert tone="success">Settings saved.</Alert> : null}
      {state.type === 'error' ? (
        <Alert tone="danger" title="Not saved">
          {state.message} Your changes are still here; try again.
        </Alert>
      ) : null}

      <Button type="submit" pending={state.type === 'pending'} pendingLabel="Saving…">
        Save settings
      </Button>
    </form>
  );
}

/** Loads the profile, then shows the form, with loading and error states. */
export function ProfileSettings() {
  const [result, setResult] = useState<ApiResult<Profile> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void api.getProfile().then((next) => {
      if (current) setResult(next);
    });
    return () => {
      current = false;
    };
  }, [attempt]);

  if (!result) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading your settings…</span>
        <div className="h-16 animate-pulse rounded-xl bg-surface-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-surface-muted" />
      </div>
    );
  }
  if (result.error) {
    return (
      <Alert
        tone="danger"
        title="Couldn't load your settings"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        }
      >
        {result.error.message}
      </Alert>
    );
  }
  return (
    <Card>
      <ProfileForm
        key={result.data.userId}
        profile={result.data}
        onSaved={(profile) => setResult({ data: profile, error: null })}
      />
    </Card>
  );
}
