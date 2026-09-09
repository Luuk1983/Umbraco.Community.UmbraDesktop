import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco AI — the Copilot Workspace, then the section.
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
    /**
     * The Copilot Workspace: Umbraco's own persisted-conversation chat, in a window.
     *
     * Ahead of the section because it is the app people came for, while the section is settings,
     * analytics and logs.
     *
     * `full-section` is not caution. `workspace-only` hides `umb-section-sidebar` and then
     * repositions `umb-section-main` over the grid column the split panel reserved, and this
     * section has no `umb-section-main` — its shell is a bespoke `umb-split-panel` with a
     * `<div slot="end">` — so the sidebar would go and nothing would take its place, leaving an
     * empty 240-460px gutter. Keeping it is the better answer regardless: the conversation list is
     * the tool here, as the tree is in Document Types.
     *
     * `allowMultiple: false` because switching conversations happens in that sidebar, inside the
     * window. A second window would buy a parallel agent *run* and nothing else, and the workspace
     * aborts the run on every conversation switch anyway, server-side — so one window is what
     * Umbraco's own section does rather than a reduction of it.
     *
     * The icon is ours because that section's `meta` is `label` and `pathname` and nothing else,
     * so there is none to inherit. `icon-chat` rather than the section's `icon-wand`, so the two
     * AI tiles are not the same picture twice.
     *
     * Not `icon-conversation`, whose name is a trap: it draws two circular arrows, a refresh
     * glyph, and reads as "sync" on a tile. `icon-chat` is the speech bubble, and it is also what
     * the workspace itself puts on its own empty state. Checked in a browser, because the name is
     * the one thing about an icon you cannot check any other way.
     */
    alias: 'copilot-workspace',
    ref: 'Uai.Section.CopilotWorkspace',
    icon: 'icon-chat',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: false,
    group: 'ai',
    weight: 5,
  },
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
