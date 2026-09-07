import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco AI — the section alone.
 *
 * **The alias really is the bare string `ai`**, as Commerce's is `commerce`. Asserted in
 * `commercial.test.ts` so nobody expands it into something that resolves to nothing.
 *
 * **The entry alias and the group alias below are both `ai`.** Different namespaces — one keys a
 * catalogue entry, the other a launcher group — colliding by coincidence because both are named
 * for the package. Nobody should "fix" either into matching the other.
 *
 * AI's sidebar mixes three default-kind menu items (Settings, Analytics, Logs) with seven of a kind
 * the package defines itself, `entityContainer`, across the AI, AI Agent and AI Prompt sub-packages.
 * All ten are reachable from the section, so none gets a tile.
 *
 * Worth knowing if that ever changes: the `entityContainer` element builds
 * `section/{pathname}/workspace/{entityType}` — byte-identical to the default kind's route — so
 * `inferUrl` could accept the kind and resolve all seven. It deliberately does not (design D9),
 * because nothing here needs it and it would encode a third-party kind's routing rule on spec.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'ai',
    ref: 'ai',
    // Label is the plain string "AI".
    icon: 'icon-wand',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: true,
    group: 'ai',
    weight: 10,
  },
];
