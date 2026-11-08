import { describe, expect, it } from 'vitest';

import * as catalog from '@/features/catalog/types';
import * as planning from '@/features/planning/types';

import * as contracts from './contracts';

describe('shared contracts', () => {
  it("match the catalog lane's value sets", () => {
    expect(contracts.LOAD_CONVENTIONS).toEqual(catalog.LOAD_CONVENTIONS);
    expect(contracts.ALTERNATIVE_KINDS).toEqual(catalog.ALTERNATIVE_KINDS);
    expect(contracts.EQUIPMENT_TYPES).toEqual(catalog.EQUIPMENT_TYPES);
    expect(contracts.MOVEMENT_PATTERNS).toEqual(catalog.MOVEMENT_PATTERNS);
    expect(contracts.MUSCLES).toEqual(catalog.MUSCLES);
  });

  it("match the planning lane's schedule statuses", () => {
    expect(contracts.SCHEDULE_STATUSES).toEqual(planning.SCHEDULE_STATUSES);
  });

  it('give every operation a unique method and path', () => {
    const keys = Object.values(contracts.API_ROUTES).map(({ method, path }) => `${method} ${path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const { path } of Object.values(contracts.API_ROUTES)) {
      expect(path).toMatch(/^\/[a-z-]+(\/(\{[a-z][A-Za-z]*\}|[a-z-]+))*$/);
    }
  });

  it('keep client-only error codes separate from API codes', () => {
    for (const code of contracts.CLIENT_ERROR_CODES) {
      expect(contracts.ERROR_CODES).not.toContain(code);
    }
  });
});
