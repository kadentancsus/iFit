/**
 * Regenerates `supabase/seed.sql` from the TypeScript catalog:
 *
 *   npx tsx scripts/generate-catalog-seed.ts
 *
 * A Vitest check fails if the committed seed falls out of step with the catalog.
 */
import { writeFileSync } from 'node:fs';

import { renderCatalogSeed } from '../src/features/catalog/seed';

writeFileSync(new URL('../supabase/seed.sql', import.meta.url), renderCatalogSeed());
