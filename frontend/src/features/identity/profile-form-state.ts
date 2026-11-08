/** Pure helpers behind the profile form, kept separate so they are easy to test. */
import type { DisplayUnit, Profile, ProfileUpdate } from '@/lib/contracts';
import { isValidTimeZone } from '@/lib/dates';

export interface ProfileDraft {
  displayName: string;
  displayUnit: DisplayUnit;
  timezone: string;
}

export const draftFrom = (profile: Profile): ProfileDraft => ({
  displayName: profile.displayName,
  displayUnit: profile.displayUnit,
  timezone: profile.timezone,
});

export type ProfileErrors = Partial<Record<keyof ProfileDraft, string>>;

export function validateDraft(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = draft.displayName.trim();
  if (!name) errors.displayName = 'Enter a name.';
  else if (name.length > 50) errors.displayName = 'Use at most 50 characters.';
  if (!isValidTimeZone(draft.timezone)) errors.timezone = 'Pick a time zone from the list.';
  return errors;
}

/** Only what changed, so a save never overwrites a field the user left alone. */
export function changedFields(saved: Profile, draft: ProfileDraft): ProfileUpdate {
  const changes: ProfileUpdate = {};
  const name = draft.displayName.trim();
  if (name !== saved.displayName) changes.displayName = name;
  if (draft.displayUnit !== saved.displayUnit) changes.displayUnit = draft.displayUnit;
  if (draft.timezone !== saved.timezone) changes.timezone = draft.timezone;
  return changes;
}

/** Every zone this browser knows, always including the saved one, sorted. */
export function timeZoneOptions(current: string, available?: readonly string[]): string[] {
  let zones = available;
  if (!zones) {
    try {
      zones = Intl.supportedValuesOf('timeZone');
    } catch {
      zones = [];
    }
  }
  return [...new Set(['UTC', current, ...zones])].sort((a, b) => a.localeCompare(b));
}

export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}
