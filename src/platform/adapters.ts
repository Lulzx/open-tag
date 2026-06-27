/**
 * The platform manifest — the ONE place to add a platform.
 *
 * Adding e.g. MS Teams is: a new `src/platform/msteams.ts` exporting an
 * `AdapterFactory`, an import here, and an entry in this array. No edits to the
 * launcher, the runtime, or any other core file.
 *
 * An explicit array (rather than side-effect self-registration) keeps it
 * lint-clean and free of import-order surprises.
 */
import { discordFactory } from './discord.ts';
import type { AdapterFactory } from './registry.ts';
import { telegramFactory } from './telegram.ts';

export const adapterFactories: AdapterFactory[] = [telegramFactory, discordFactory];
