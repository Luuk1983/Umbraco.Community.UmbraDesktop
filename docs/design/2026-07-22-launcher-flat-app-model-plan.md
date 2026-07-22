# Flat app-model + new launcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the section→app category/group *tree* with a flat pool of apps grouped by a single curatorial layer, and build the new editor-first launcher UI (search + dummy favourites/recent + grouped app-tiles + user/system footer) that consumes it — with new strings localised (en/nl).

**Architecture:** The flat `apps` observable already exists in `app-catalogue.context`; this plan (Phase A) collapses the two grouping levels (`category`→`group`) into one `group`, renames the gate to `sourceSection`, and reduces `groupApps` to a flat grouper. Phase B adds a minimal `umbraDesktop` localisation area (en/nl) for the strings/names we create. Phase C extracts a new `launcher.element` that renders the flat groups as icon-tiles with dummy Favourites/Recent, wiring Umbraco's native `Umb.Modal.Search` and `Umb.Modal.CurrentUser` and `UMB_AUTH_CONTEXT.signOut()`.

**Tech Stack:** Lit + `@umbraco-cms/backoffice` (UUI, contexts, modal, auth, localization), `@web/test-runner` + `@open-wc/testing` (pure-logic tests). Build: `npm run build`; test: `npm test` — both from `src/Umbraco.Community.UmbraDesktop`.

**Deferred (not this plan):** real favourites/recent persistence (Plan 2 — dummy data here), localising the existing chrome/taskbar/window/exit strings (Plan 3 — only *new* strings localised here), the Games app implementations (separate spec — a dummy Games group of tiles only), drag-to-reorder, desktop-settings panel.

**Testing note:** This codebase unit-tests **pure logic** (`window-model`, `group-apps`, `derive-apps`, `url-inference`) and verifies **UI in the browser** (no component tests exist). Phase A/B tasks are TDD with full code; Phase C tasks are build-green + a browser-verify checkpoint, matching the established loop.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `desktop/types.ts` | Flat model types (`UmbraDesktopGroup`, `UmbraDesktopApp`, `…Entry`, `…Catalogue`, `UmbraDesktopLauncherGroup`) | Modify |
| `desktop/constants.ts` | Reserved "More" group alias/label/weight | Modify |
| `desktop/group-apps.ts` (+`.test.ts`) | Flat grouper: apps → `UmbraDesktopLauncherGroup[]` | Rewrite |
| `desktop/derive-apps.ts` (+`.test.ts`) | Tag apps with `group`/`sourceSection`; `icon-box` fallback | Modify |
| `desktop/catalogue/groups.ts` | Flat curated groups (was `categories.ts`) | Rename/rewrite |
| `desktop/catalogue/content.ts`, `settings.ts` | Friendly-name tokens, `group`, gate | Modify |
| `desktop/catalogue/index.ts` | Collate `{ groups, entries, excludedSections }` | Modify |
| `desktop/app-catalogue.context.ts` | Flat `groupApps`; expose `groups` (was `tree`); set `sourceSection` | Modify |
| `desktop/localization/en.ts`, `nl.ts`, `manifest.ts` | `umbraDesktop` dictionary (new strings only) | Create |
| `bundle.manifests.ts` | Register localization manifests | Modify |
| `desktop/components/launcher.element.ts` | The launcher panel (search/favourites/recent/groups/footer) | Create |
| `desktop/components/taskbar.element.ts` | Render `<umbradesktop-launcher>`; keep dismissal wiring | Modify |

---

## Phase A — Flat app-model refactor

### Task A1: Flatten the types

**Files:** Modify `desktop/types.ts`

- [ ] **Step 1: Replace the grouping + app + catalogue types.** Remove `UmbraDesktopCategory`, the old `UmbraDesktopLauncherCategory`, and the nested `UmbraDesktopLauncherGroup`. Replace with:

```ts
/** A single curatorial group in the launcher. Flat — groups never nest. */
export interface UmbraDesktopGroup {
  /** Stable id, referenced by an app's `group`. */
  alias: string;
  /** Display label — a localization token, e.g. '#umbraDesktop_groupDiagnostics'. */
  label: string;
  /** Sort weight (ascending; lower shows first). */
  weight?: number;
  /** True for the reserved auto-generated "More" group. */
  auto?: boolean;
}

/** A group with its resolved apps, for the launcher display. */
export interface UmbraDesktopLauncherGroup {
  /** The group. */
  group: UmbraDesktopGroup;
  /** Apps in this group, sorted. */
  apps: UmbraDesktopApp[];
}
```

- [ ] **Step 2: Update `UmbraDesktopApp`** — drop `categoryAlias`/`groupAlias`; add `group`/`sourceSection`:

```ts
  /** Curatorial group alias; undefined → the reserved "More" group. */
  group?: string;
  /** Source section alias — permission gate + default-group hint. */
  sourceSection?: string;
```

- [ ] **Step 3: Update `UmbraDesktopCatalogueEntry`** — drop `categoryAlias`/`groupAlias`; add `group` (keep `section` as the gate):

```ts
  /** Curatorial group alias (see catalogue/groups.ts). */
  group?: string;
```

- [ ] **Step 4: Update `UmbraDesktopCatalogue`** — drop `categories`, keep `groups`/`entries`/`excludedSections`:

```ts
export interface UmbraDesktopCatalogue {
  /** Curated flat groups. */
  groups: UmbraDesktopGroup[];
  /** App entries. */
  entries: UmbraDesktopCatalogueEntry[];
  /** Section aliases the fallback must never surface. */
  excludedSections: string[];
}
```

- [ ] **Step 5: Add `sourceSection` to `UmbraDesktopResolvedEntry`** so the adapter can carry the gate onto the app (it already has `gateSectionAlias` — no change needed; the app's `sourceSection` is set from `gateSectionAlias` in derive-apps). Confirm `UmbraDesktopRefDescriptor`, `UmbraDesktopSectionInfo`, `UmbraDesktopResolvedEntry` are otherwise unchanged.

- [ ] **Step 6: Verify it compiles later** (types-only; group-apps/derive-apps/context will be updated in following tasks and the build is run at the end of Phase A).

### Task A2: Reserved "More" group constants

**Files:** Modify `desktop/constants.ts`

- [ ] **Step 1: Rename the uncertified-category constants to the More-group ones:**

```ts
/** Reserved group alias that collects uncurated / fallback apps. */
export const UMBRADESKTOP_MORE_GROUP_ALIAS = 'umbradesktop-more';

/** Localization token for the reserved "More" group label. */
export const UMBRADESKTOP_MORE_GROUP_LABEL = '#umbraDesktop_groupMore';

/** Sort weight that keeps the "More" group last (ascending sort, large value). */
export const UMBRADESKTOP_MORE_GROUP_WEIGHT = 9999;
```

Delete the old `UMBRADESKTOP_UNCERTIFIED_CATEGORY_*` exports.

### Task A3: Flat `groupApps` (TDD)

**Files:** Rewrite `desktop/group-apps.ts` + `desktop/group-apps.test.ts`

- [ ] **Step 1: Rewrite the test** to the flat shape:

```ts
import { expect } from '@open-wc/testing';
import { groupApps } from './group-apps';
import { UMBRADESKTOP_MORE_GROUP_ALIAS } from './constants';
import type { UmbraDesktopApp, UmbraDesktopGroup } from './types';

const groups: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#g_editing', weight: 10 },
  { alias: 'diagnostics', label: '#g_diagnostics', weight: 20 },
];
function app(alias: string, over: Partial<UmbraDesktopApp> = {}): UmbraDesktopApp {
  return { alias, name: `#a_${alias}`, icon: 'icon-box', url: '/x', chromeProfile: 'bare', ...over };
}

it('groups apps by their group alias, sorted by group weight', () => {
  const result = groupApps(
    [app('logs', { group: 'diagnostics', weight: 10 }), app('content', { group: 'editing', weight: 10 })],
    groups,
  );
  expect(result.map((g) => g.group.alias)).to.deep.equal(['editing', 'diagnostics']);
});

it('sorts apps within a group by weight then name token', () => {
  const result = groupApps(
    [app('b', { group: 'editing', weight: 20 }), app('a', { group: 'editing', weight: 10 })],
    groups,
  );
  expect(result[0].apps.map((a) => a.alias)).to.deep.equal(['a', 'b']);
});

it('routes apps with no/unknown group into the reserved More group, always last', () => {
  const result = groupApps(
    [app('x', { group: 'editing', weight: 10 }), app('y'), app('z', { group: 'nope' })],
    groups,
  );
  const last = result[result.length - 1];
  expect(last.group.alias).to.equal(UMBRADESKTOP_MORE_GROUP_ALIAS);
  expect(last.group.auto).to.equal(true);
  expect(last.apps.map((a) => a.alias).sort()).to.deep.equal(['y', 'z']);
});

it('drops empty groups', () => {
  const result = groupApps([app('content', { group: 'editing' })], groups);
  expect(result.map((g) => g.group.alias)).to.deep.equal(['editing']);
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npm test`. Expected: FAIL (`groupApps` signature/shape mismatch).

- [ ] **Step 3: Rewrite the implementation:**

```ts
import type { UmbraDesktopApp, UmbraDesktopGroup, UmbraDesktopLauncherGroup } from './types';
import {
  UMBRADESKTOP_MORE_GROUP_ALIAS,
  UMBRADESKTOP_MORE_GROUP_LABEL,
  UMBRADESKTOP_MORE_GROUP_WEIGHT,
} from './constants';

/** Compare by weight ascending, then a stable string tiebreak (labels/names are loc tokens). */
function byWeightThenKey(aw: number, ak: string, bw: number, bk: string): number {
  return aw - bw || ak.localeCompare(bk);
}

/**
 * Group the flat app list into the launcher's display groups: one flat level, sorted by
 * group weight, empties dropped, the reserved auto "More" group always last. Apps whose
 * `group` is unset or unknown fall into "More". Pure.
 * @param apps The flat, tagged app list from `deriveApps`.
 * @param groups Curated flat groups.
 * @returns The launcher display groups.
 */
export function groupApps(
  apps: ReadonlyArray<UmbraDesktopApp>,
  groups: ReadonlyArray<UmbraDesktopGroup>,
): UmbraDesktopLauncherGroup[] {
  const moreGroup: UmbraDesktopGroup = {
    alias: UMBRADESKTOP_MORE_GROUP_ALIAS,
    label: UMBRADESKTOP_MORE_GROUP_LABEL,
    weight: UMBRADESKTOP_MORE_GROUP_WEIGHT,
    auto: true,
  };
  const allGroups = [...groups, moreGroup];
  const known = new Set(groups.map((g) => g.alias));
  const groupOf = (a: UmbraDesktopApp) =>
    a.group && known.has(a.group) ? a.group : UMBRADESKTOP_MORE_GROUP_ALIAS;

  return allGroups
    .map((group) => ({
      group,
      apps: apps
        .filter((a) => groupOf(a) === group.alias)
        .slice()
        .sort((a, b) => byWeightThenKey(a.weight ?? 0, a.name, b.weight ?? 0, b.name)),
    }))
    .filter((lg) => lg.apps.length > 0)
    .sort((a, b) =>
      byWeightThenKey(a.group.weight ?? 0, a.group.label, b.group.weight ?? 0, b.group.label),
    );
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/group-apps.ts src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/group-apps.test.ts src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/constants.ts src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/types.ts
git commit -m "refactor: flatten launcher grouping to a single curatorial level"
```

### Task A4: `deriveApps` — group + sourceSection + icon-box (TDD)

**Files:** Modify `desktop/derive-apps.ts` + `desktop/derive-apps.test.ts`

- [ ] **Step 1: Update the tests** — assert `group`/`sourceSection` instead of `categoryAlias`, and the More group + `icon-box` fallback for the section fallback. Change the fallback-app assertions to:

```ts
// fallback app expectations:
expect(fallback.group).to.equal(UMBRADESKTOP_MORE_GROUP_ALIAS);
expect(fallback.sourceSection).to.equal('Umb.Section.Members');
expect(fallback.icon).to.equal('icon-box');
```

(Import `UMBRADESKTOP_MORE_GROUP_ALIAS` from `./constants`; adjust any existing `categoryAlias` assertions on certified apps to `group`.)

- [ ] **Step 2: Run to verify it fails.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Update the implementation** — change `DEFAULT_ICON`, the certified push, and the fallback push:

```ts
const DEFAULT_ICON = 'icon-box';
```

Certified push — replace `categoryAlias`/`groupAlias` with:

```ts
      group: e.group,
      sourceSection: r.gateSectionAlias ?? undefined,
      confidence: 'certified',
```

Fallback push — replace `categoryAlias` with:

```ts
      group: UMBRADESKTOP_MORE_GROUP_ALIAS,
      sourceSection: s.alias,
      confidence: 'uncertified',
```

Update the import to `UMBRADESKTOP_MORE_GROUP_ALIAS`.

- [ ] **Step 4: Run to verify it passes.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/derive-apps.ts src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/derive-apps.test.ts
git commit -m "refactor: derive apps with flat group + sourceSection + icon-box fallback"
```

### Task A5: Catalogue data (flat groups + friendly tokens)

**Files:** Create `desktop/catalogue/groups.ts` (from `categories.ts`); modify `content.ts`, `settings.ts`, `index.ts`; delete `categories.ts`

- [ ] **Step 1: Create `catalogue/groups.ts`:**

```ts
import type { UmbraDesktopGroup } from '../types';

/** Curated launcher groups — flat, decoupled from Umbraco sections. Labels are loc tokens. */
export const groups: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#umbraDesktop_groupEditing', weight: 10 },
  { alias: 'diagnostics', label: '#umbraDesktop_groupDiagnostics', weight: 20 },
];
```

- [ ] **Step 2: Delete `catalogue/categories.ts`.**

- [ ] **Step 3: Update `catalogue/content.ts`** — friendly-name tokens + `group: 'editing'`, drop `categoryAlias`:

```ts
  {
    alias: 'content', ref: 'Umb.Section.Content', name: '#umbraDesktop_appContentEditor',
    icon: 'icon-documents', chromeProfile: 'full-section', defaultSize: { w: 960, h: 680 },
    allowMultiple: true, group: 'editing', weight: 10,
  },
  {
    alias: 'media', ref: 'Umb.Section.Media', name: '#umbraDesktop_appMediaLibrary',
    icon: 'icon-picture', chromeProfile: 'full-section', defaultSize: { w: 960, h: 680 },
    allowMultiple: true, group: 'editing', weight: 20,
  },
```

- [ ] **Step 4: Update `catalogue/settings.ts`** — Log Viewer friendly token + `group: 'diagnostics'`; keep the full Settings app but move it out of the way (either drop it, or keep with `name: '#umbraDesktop_appUmbracoSettings'` and no group so it lands in "More"). Recommended: drop the standalone full-Settings entry for now (editors rarely want it; it still appears as an auto "More" fallback), and keep only Log Viewer:

```ts
  {
    alias: 'log-viewer', ref: 'Umb.MenuItem.LogViewer', section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appLogViewer', icon: 'icon-box-alt', chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 }, minSize: { w: 900, h: 540 },
    group: 'diagnostics', weight: 10,
  },
```

- [ ] **Step 5: Update `catalogue/index.ts`:**

```ts
import type { UmbraDesktopCatalogue } from '../types';
import { groups } from './groups';
import { entries as content } from './content';
import { entries as settings } from './settings';
import { excludedSections } from './exclusions';

/** The collated curated catalogue. Add a fragment file exporting `entries` (and optionally `groups`) and spread it in here. */
export const catalogue: UmbraDesktopCatalogue = {
  groups,
  entries: [...content, ...settings],
  excludedSections,
};
```

### Task A6: Adapter context — flat grouping + `groups` observable

**Files:** Modify `desktop/app-catalogue.context.ts` + `desktop/app-catalogue.context-token.ts`

- [ ] **Step 1: Rename the observable `tree` → `groups`** (type `UmbraDesktopLauncherGroup[]`), update its `UmbArrayState` key to `(g) => g.group.alias`, and import `UmbraDesktopLauncherGroup` instead of `UmbraDesktopLauncherCategory`.

- [ ] **Step 2: Update `#recompute`** to call the flat grouper:

```ts
    this.#tree.setValue(groupApps(apps, catalogue.groups));
```

(Rename the field `#tree`→`#groups` for clarity; update `.asObservable()`.)

- [ ] **Step 3: Update `#validateCatalogue`** — validate against `catalogue.groups` (a `group` alias) instead of categories/groups, and drop the `groupAlias` check:

```ts
  #validateCatalogue(): void {
    const known = new Set(catalogue.groups.map((g) => g.alias));
    for (const entry of catalogue.entries) {
      if (entry.group && !known.has(entry.group)) {
        console.warn(`[UmbraDesktop] Catalogue entry "${entry.alias}" references unknown group "${entry.group}"; it will fall into "More".`);
      }
    }
  }
```

- [ ] **Step 4: Confirm the context-token type** (`app-catalogue.context-token.ts`) — if it types the context surface, update `tree`→`groups`. Otherwise no change.

- [ ] **Step 5: Build + test.** Run: `npm run build` then `npm test`. Expected: build succeeds, all tests pass. Fix any remaining `categoryAlias`/`tree` references the compiler flags (notably the taskbar still consumes `tree` — it is rewritten in Phase C; for now, temporarily point it at `groups` and render minimally so the build stays green, or complete Phase C before building).

- [ ] **Step 6: Commit.**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/catalogue src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/app-catalogue.context.ts src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/app-catalogue.context-token.ts
git commit -m "refactor: catalogue as flat groups; context exposes grouped apps"
```

---

## Phase B — Localization scaffold (new strings only)

### Task B1: `umbraDesktop` dictionary (en + nl)

**Files:** Create `desktop/localization/en.ts`, `desktop/localization/nl.ts`, `desktop/localization/manifest.ts`; modify `bundle.manifests.ts`

- [ ] **Step 1: Create `localization/en.ts`** (dictionary keyed by the `umbraDesktop` area; keys resolve via `#umbraDesktop_<key>` / `localize.term('umbraDesktop_<key>')`):

```ts
export default {
  umbraDesktop: {
    // app names
    appContentEditor: 'Content editor',
    appMediaLibrary: 'Media library',
    appLogViewer: 'Log Viewer',
    // group labels
    groupEditing: 'Editing',
    groupDiagnostics: 'Diagnostics',
    groupGames: 'Games',
    groupMore: 'More',
    // launcher chrome
    openApps: 'Open apps',
    search: 'Search apps, tools and content…',
    favourites: 'Favourites',
    recent: 'Recent',
    desktopSettings: 'Desktop settings',
    logout: 'Log out',
    exitDesktop: 'Exit desktop',
  },
};
```

- [ ] **Step 2: Create `localization/nl.ts`** (same keys, Dutch values):

```ts
export default {
  umbraDesktop: {
    appContentEditor: 'Content-editor',
    appMediaLibrary: 'Mediabibliotheek',
    appLogViewer: 'Logboek',
    groupEditing: 'Bewerken',
    groupDiagnostics: 'Diagnostiek',
    groupGames: 'Spellen',
    groupMore: 'Meer',
    openApps: 'Apps openen',
    search: 'Zoek apps, tools en content…',
    favourites: 'Favorieten',
    recent: 'Recent',
    desktopSettings: 'Bureaublad-instellingen',
    logout: 'Uitloggen',
    exitDesktop: 'Bureaublad verlaten',
  },
};
```

- [ ] **Step 3: Create `localization/manifest.ts`** (mirror the shape of a core `localization` manifest — verify against the `umbraco-localization` skill / an existing example if unsure):

```ts
import type { ManifestLocalization } from '@umbraco-cms/backoffice/localization-api';

export const manifests: Array<ManifestLocalization> = [
  { type: 'localization', alias: 'UmbraDesktop.Localization.En', name: 'UmbraDesktop English', meta: { culture: 'en' }, js: () => import('./en.js') },
  { type: 'localization', alias: 'UmbraDesktop.Localization.Nl', name: 'UmbraDesktop Dutch', meta: { culture: 'nl' }, js: () => import('./nl.js') },
];
```

- [ ] **Step 4: Register in `bundle.manifests.ts`** — spread `...localizationManifests` into the bundle's manifest array (import `{ manifests as localizationManifests } from './desktop/localization/manifest.js'`).

- [ ] **Step 5: Build.** Run: `npm run build`. Expected: succeeds. (Localization has no unit test; verified in Phase C browser check by switching backoffice language.)

- [ ] **Step 6: Commit.**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/localization src/Umbraco.Community.UmbraDesktop/backoffice/src/bundle.manifests.ts
git commit -m "feat: add umbraDesktop localization (en/nl) for launcher strings"
```

---

## Phase C — Launcher UI

> UI tasks: no component tests in this project. Each ends with `npm run build` (green) and a **browser-verify checkpoint** (the maintainer confirms in the running Test Instance). Styling reuses the existing `--uui-*` tokens and the launcher patterns already in `taskbar.element`.

### Task C1: New `launcher.element` with dummy Favourites/Recent + grouped tiles

**Files:** Create `desktop/components/launcher.element.ts`

- [ ] **Step 1: Scaffold the element** — a `UmbLitElement` that consumes the catalogue context (`groups` observable) and the window manager, and exposes an `open` state. Core wiring (real code — not a placeholder):

```ts
import type { UmbraDesktopApp, UmbraDesktopLauncherGroup } from '../types';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { css, customElement, html, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbModalToken, umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

const SEARCH_MODAL = new UmbModalToken('Umb.Modal.Search');
const CURRENT_USER_MODAL = new UmbModalToken('Umb.Modal.CurrentUser');

/** Dummy favourites/recent until persistence (Plan 2). Aliases reference real derived apps. */
const DUMMY_FAVOURITE_ALIASES = ['content', 'media', 'log-viewer'];
```

- [ ] **Step 2: Observe catalogue + manager** in the constructor; keep `_groups: UmbraDesktopLauncherGroup[]`, `_apps: UmbraDesktopApp[]` (flat, to resolve dummy favourites/recent by alias), and `#manager`.

- [ ] **Step 3: Render** — search button, Favourites (dummy, resolved from `_apps` by `DUMMY_FAVOURITE_ALIASES`), Recent (dummy = first few `_apps`), each real group as a tile grid, and the footer. Tile + open handler:

```ts
  #open(app: UmbraDesktopApp) { this.#manager?.open(app); this.dispatchEvent(new CustomEvent('launched')); }
  #tile(app: UmbraDesktopApp) {
    return html`<button class="tile" @click=${() => this.#open(app)}>
      <umb-icon name=${app.icon}></umb-icon>
      <span class="tlb">${this.localize.string(app.name)}</span>
    </button>`;
  }
```

Group section:

```ts
  ${repeat(this._groups, (g) => g.group.alias, (g) => html`
    <div class="zone"><div class="zl">${this.localize.string(g.group.label)}</div>
      <div class="grid">${repeat(g.apps, (a) => a.alias, (a) => this.#tile(a))}</div>
    </div>`)}
```

- [ ] **Step 4: Footer + actions** — user avatar/name (open current-user modal), Desktop settings (no-op placeholder, `title` only), Log out (`signOut`), Exit desktop (dispatch an `exit` event the taskbar already handles):

```ts
  async #openSearch() { await umbOpenModal(this, SEARCH_MODAL).catch(() => {}); }
  async #openUser() { await umbOpenModal(this, CURRENT_USER_MODAL).catch(() => {}); }
  async #logout() { const auth = await this.getContext(UMB_AUTH_CONTEXT); await auth?.signOut(); }
```

- [ ] **Step 5: Styles** — reuse the launcher/panel tokens from `taskbar.element` (surface bg, border, `--uui-shadow-depth-4`, radius) and the mock's tile/zone/footer treatment (native icons, `--uui-type-small-size + 1px`, the shared `translateY(1px)` Lato nudge on `.tlb`). Form factor: **anchored panel** (bottom-left, `width: ~360px`, `max-height: 80vh`), per the spec's recommended primary.

- [ ] **Step 6: Build.** Run: `npm run build`. Expected: succeeds.

### Task C2: Mount the launcher from the taskbar

**Files:** Modify `desktop/components/taskbar.element.ts`

- [ ] **Step 1: Replace `#renderLauncher()`'s inner tree markup** with `<umbradesktop-launcher>` (import `./launcher.element.js`), keeping the existing open/close state, the outside-pointerdown/blur/Esc dismissal, and the start-button toggle. Remove the now-unused catalogue `tree` consumption + `#renderApp`/category markup from the taskbar (the launcher owns it now).

- [ ] **Step 2: Wire the launcher's events** — `@launched` and `@exit` from `<umbradesktop-launcher>` close the launcher (`#setLauncherOpen(false)`); `@exit` runs the existing `#onExit` confirm flow.

- [ ] **Step 3: Build.** Run: `npm run build`. Expected: succeeds, no unused-symbol errors.

- [ ] **Step 4: Browser-verify checkpoint.** Run the Test Instance; open the start menu and confirm: search opens the native search modal; grouped app-tiles launch windows; the dummy Favourites/Recent show and launch; the footer user opens the current-user modal; Log out signs out; Exit desktop returns to the classic backoffice; switching the backoffice language to Dutch localises the launcher strings + friendly names. Iterate on styling with the maintainer as usual.

- [ ] **Step 5: Commit.**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/launcher.element.ts src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/taskbar.element.ts
git commit -m "feat: flat-model launcher UI (tiles, dummy favourites/recent, native modals)"
```

---

## Self-review

- **Spec coverage:** flat model (A1–A6), friendly localised names (A5+B1), native icons + `icon-box` fallback (A4/A5), auto "More" group (A3/A4), grouped pinnable tiles + favourites/recent as dummies (C1), search → `Umb.Modal.Search` + user → `Umb.Modal.CurrentUser` + distinct Exit/Logout (C1/C2), en+nl for new strings (B1). Persistence, existing-chrome i18n, and Games implementations are explicitly deferred. ✔
- **Placeholder scan:** the only "no-op" is the Desktop-settings button (reserved by design); dummy favourites/recent are real hardcoded arrays, not TODOs. No vague error-handling steps. ✔
- **Type consistency:** `group`/`sourceSection`/`UmbraDesktopGroup`/`UmbraDesktopLauncherGroup` used consistently A1→A6→C1; `groups` observable name consistent A6→C1. `UMBRADESKTOP_MORE_GROUP_ALIAS` consistent A2→A3→A4. ✔
- **Verify-in-execution flags (not placeholders):** exact `ManifestLocalization` registration shape (B1 Step 3) and the recreated modal-token config (C1) should be confirmed against a core example / browser during execution.
