# UmbraDesktop — Phase 2: The app model (curated catalogue) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 1's hard-coded `apps.ts` with a curated, alias-referencing app catalogue whose URLs are inferred from the Umbraco extension registry, filtered to the user's permitted sections, with an automatic uncertified fallback — and feed it into the taskbar launcher.

**Architecture:** A typed catalogue (split into per-area fragment files) lists entries that `ref` a registered `section`/`dashboard`/`menuItem` by alias. A thin impure context (`UmbraDesktopAppCatalogueContext`) reads the current user's permitted sections + the referenced manifests, resolves each entry to a concrete URL, and hands plain data to three **pure, unit-tested** functions — `inferUrl`, `deriveApps`, `groupApps` — that produce the flat app list and the launcher's grouped display tree. The taskbar's start button lists that tree (a Phase-2 placeholder for the Phase-3 fullscreen drawer). Everything resolves lazily on Desktop-section mount, so Umbraco boot is untouched.

**Tech Stack:** TypeScript, Lit 3, `@umbraco-cms/backoffice` (extension registry, current-user context, UUI + design tokens, contexts), Vite (lib build), `@web/test-runner` + `@open-wc/testing` for unit tests.

**Spec:** [`docs/design/2026-07-20-phase-2-app-model-design.md`](../design/2026-07-20-phase-2-app-model-design.md).

---

## Scope

This plan covers **Phase 2 only** — the app *model/catalogue*. It deliberately excludes:
the fullscreen app drawer + fuzzy search + confidence-badge UI (Phase 3), localStorage
persistence (Phase 4), aggressive `workspace-only`/`bare` sidebar stripping (deferred — every
Phase-2 catalogue entry uses `full-section`, which Phase 1 already proved), and a
manifest-based third-party app source (roadmap).

All frontend paths below are relative to `src/Umbraco.Community.UmbraDesktop/` (the RCL root,
where `package.json` lives). Its frontend source lives under `backoffice/src/`. Test tooling
(`web-test-runner`, `@open-wc/testing`) already exists from Phase 1 — no setup task needed.

**Commands used throughout:**
- Unit tests: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
- Type-check: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
- Build: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm run build`
- Test Instance: `cd "D:/github/Umbraco.Community.UmbraDesktop.TestInstance" && dotnet run`

---

## File structure

New/changed files under `backoffice/src/desktop/`, one responsibility per file:

| File | Responsibility |
|------|----------------|
| `types.ts` | **Modify** — add catalogue/app-model types; extend `UmbraDesktopApp`. |
| `constants.ts` | **Modify** — reserved "More" category alias/label/weight. |
| `url-inference.ts` (+ `.test.ts`) | **Create** — **pure** `inferUrl(descriptor)`. |
| `derive-apps.ts` (+ `.test.ts`) | **Create** — **pure** `deriveApps(resolvedEntries, permittedSections)`. |
| `group-apps.ts` (+ `.test.ts`) | **Create** — **pure** `groupApps(apps, categories, groups)`. |
| `window-model.ts` (+ `.test.ts`) | **Modify** — **pure** `findAppWindow` (for `allowMultiple`). |
| `window-manager.context.ts` | **Modify** — respect `allowMultiple` in `open`. |
| `catalogue/categories.ts` | **Create** — curated headers + collapsible groups. |
| `catalogue/content.ts` | **Create** — Content / Media section entries. |
| `catalogue/settings.ts` | **Create** — Settings section entry + Log Viewer menu-item entry. |
| `catalogue/index.ts` | **Create** — collate all fragments into one `UmbraDesktopCatalogue`. |
| `app-catalogue.context-token.ts` | **Create** — context token. |
| `app-catalogue.context.ts` | **Create** — impure adapter: registry → resolve → derive → group. |
| `components/desktop.element.ts` | **Modify** — provide the catalogue context. |
| `components/taskbar.element.ts` | **Modify** — placeholder launcher lists the grouped tree. |
| `apps.ts` | **Delete** — replaced by the catalogue. |

---

## Task 1: Types + constants

**Files:**
- Modify: `backoffice/src/desktop/types.ts`
- Modify: `backoffice/src/desktop/constants.ts`

- [ ] **Step 1: Add the new types**

Append to `backoffice/src/desktop/types.ts` (keep the existing content; the additions below):

```ts
/** Whether an app was maintainer-certified or auto-derived as an untested fallback. */
export type UmbraDesktopConfidence = 'certified' | 'uncertified';

/** A launcher header. Free-form, decoupled from Umbraco's section structure. */
export interface UmbraDesktopCategory {
  /** Stable id, referenced by entries and groups. */
  alias: string;
  /** Display label of the header. */
  label: string;
  /** Sort weight (ascending; lower shows first). */
  weight?: number;
  /** Optional Umbraco icon alias for the header. */
  icon?: string;
}

/** A collapsible sub-group under a category. */
export interface UmbraDesktopGroup {
  /** Stable id, referenced by entries. */
  alias: string;
  /** Display label of the group. */
  label: string;
  /** The category this group belongs to. */
  categoryAlias: string;
  /** Sort weight within the category (ascending). */
  weight?: number;
  /** Whether the group renders collapsed initially (consumed by the Phase 3 drawer). */
  collapsedByDefault?: boolean;
}

/**
 * One curated catalogue entry. Links to a destination via `ref` (URL inferred from
 * the registry) or `url` (explicit escape hatch), plus display placement.
 */
export interface UmbraDesktopCatalogueEntry {
  /** Stable app id. */
  alias: string;
  /** Alias of a registered `section`/`dashboard`/`menuItem`; URL inferred from it. */
  ref?: string;
  /** Explicit hand-verified URL (for surfaces `ref` can't infer). */
  url?: string;
  /** Permission gate + section prefix; required for a menu-item `ref` or a `url` entry. */
  section?: string;
  /** Override window title (defaults to the referenced extension's label). */
  name?: string;
  /** Override icon (defaults to the referenced extension's icon). */
  icon?: string;
  /** Chrome profile (defaults to `full-section`). */
  chromeProfile?: UmbraDesktopChromeProfile;
  /** Default window size in px. */
  defaultSize?: { w: number; h: number };
  /** Whether more than one instance may open. */
  allowMultiple?: boolean;
  /** Sort weight within its group/header (ascending). */
  weight?: number;
  /** Display header. */
  categoryAlias: string;
  /** Optional collapsible sub-group. */
  groupAlias?: string;
}

/** The collated curated catalogue (categories + groups + entries). */
export interface UmbraDesktopCatalogue {
  /** Curated headers. */
  categories: UmbraDesktopCategory[];
  /** Curated collapsible sub-groups. */
  groups: UmbraDesktopGroup[];
  /** App entries. */
  entries: UmbraDesktopCatalogueEntry[];
}

/** Primitives extracted from a referenced manifest, fed to `inferUrl`. */
export interface UmbraDesktopRefDescriptor {
  /** Which registry surface the reference points at. */
  type: 'section' | 'dashboard' | 'menuItem';
  /** Menu-item kind, if any ('tree' | 'link' | 'action'); undefined/'default' = navigable. */
  kind?: string;
  /** The section's own pathname, or a dashboard's own pathname. */
  pathname?: string;
  /** The owning-section pathname (for dashboard / menu-item refs). */
  sectionPathname?: string;
  /** The workspace entity type (for menu-item refs). */
  entityType?: string;
}

/** A catalogue entry after the adapter resolved its URL + gate + inherited presentation. */
export interface UmbraDesktopResolvedEntry {
  /** The original entry. */
  entry: UmbraDesktopCatalogueEntry;
  /** Resolved absolute URL (inferred or explicit), or null when unresolvable. */
  url: string | null;
  /** The section alias that must be permitted for this entry to show. */
  gateSectionAlias: string | null;
  /** True when this entry represents a whole section (suppresses its fallback). */
  isSectionRoot: boolean;
  /** Name inherited from the referenced manifest, if any. */
  inheritedName?: string;
  /** Icon inherited from the referenced manifest, if any. */
  inheritedIcon?: string;
}

/** A section the current user may access, with the primitives needed to build URLs. */
export interface UmbraDesktopSectionInfo {
  /** Section alias, e.g. "Umb.Section.Content". */
  alias: string;
  /** Display label. */
  label: string;
  /** URL pathname, e.g. "content". */
  pathname: string;
}

/** A group with its resolved apps, for the launcher display tree. */
export interface UmbraDesktopLauncherGroup {
  /** The group. */
  group: UmbraDesktopGroup;
  /** Apps in this group, sorted. */
  apps: UmbraDesktopApp[];
}

/** A category with its loose apps + groups, for the launcher display tree. */
export interface UmbraDesktopLauncherCategory {
  /** The category header. */
  category: UmbraDesktopCategory;
  /** Apps directly under the header (no group), sorted. */
  apps: UmbraDesktopApp[];
  /** Collapsible groups under the header, sorted. */
  groups: UmbraDesktopLauncherGroup[];
}
```

- [ ] **Step 2: Extend `UmbraDesktopApp` with the launcher fields**

In `backoffice/src/desktop/types.ts`, replace the existing `UmbraDesktopApp` interface with:

```ts
/** A launchable app: a backoffice deep-link plus how to frame and present it. */
export interface UmbraDesktopApp {
  /** Stable identifier for the app. */
  alias: string;
  /** Human-friendly window title. */
  name: string;
  /** Umbraco icon alias, e.g. "icon-umbraco". */
  icon: string;
  /** Backoffice path the window's iframe loads, e.g. "/umbraco/section/content". */
  url: string;
  /** Default chrome profile for windows of this app. */
  chromeProfile: UmbraDesktopChromeProfile;
  /** Default window size in px. */
  defaultSize?: { w: number; h: number };
  /** Whether more than one instance may open (default: allowed). */
  allowMultiple?: boolean;
  /** Sort weight within its group/header (ascending). */
  weight?: number;
  /** Display header alias (always set by derivation; optional for back-compat). */
  categoryAlias?: string;
  /** Optional collapsible sub-group alias. */
  groupAlias?: string;
  /** Confidence tier (always set by derivation; optional for back-compat). */
  confidence?: UmbraDesktopConfidence;
}
```

- [ ] **Step 3: Add the reserved "More" category constants**

Append to `backoffice/src/desktop/constants.ts`:

```ts
/** Reserved category alias that collects uncertified section-fallback apps. */
export const UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS = 'umbradesktop-more';

/** Display label of the reserved uncertified category. */
export const UMBRADESKTOP_UNCERTIFIED_CATEGORY_LABEL = 'More';

/** Sort weight that keeps the uncertified category last (ascending sort, large value). */
export const UMBRADESKTOP_UNCERTIFIED_CATEGORY_WEIGHT = 9999;
```

- [ ] **Step 4: Type-check**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors. (Existing `apps.ts` and `window-model.test.ts` still compile — the new `UmbraDesktopApp` fields are all optional.)

- [ ] **Step 5: Run the existing tests to confirm nothing broke**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: PASS — all Phase 1 tests still green.

- [ ] **Step 6: Commit**

```bash
git add backoffice/src/desktop/types.ts backoffice/src/desktop/constants.ts
git commit -m "feat: add app-catalogue types and reserved category constants" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: URL inference (TDD)

**Files:**
- Test: `backoffice/src/desktop/url-inference.test.ts`
- Create: `backoffice/src/desktop/url-inference.ts`

- [ ] **Step 1: Write the failing tests**

Create `backoffice/src/desktop/url-inference.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { inferUrl } from './url-inference';

it('infers a section URL from its pathname', () => {
  expect(inferUrl({ type: 'section', pathname: 'content' })).to.equal('/umbraco/section/content');
});

it('returns null for a section with no pathname', () => {
  expect(inferUrl({ type: 'section' })).to.equal(null);
});

it('infers a dashboard URL from section + dashboard pathname', () => {
  expect(
    inferUrl({ type: 'dashboard', sectionPathname: 'settings', pathname: 'welcome' }),
  ).to.equal('/umbraco/section/settings/dashboard/welcome');
});

it('returns null for a dashboard missing its section pathname', () => {
  expect(inferUrl({ type: 'dashboard', pathname: 'welcome' })).to.equal(null);
});

it('infers a default menu-item workspace URL from section + entityType', () => {
  expect(
    inferUrl({ type: 'menuItem', sectionPathname: 'settings', entityType: 'logviewer' }),
  ).to.equal('/umbraco/section/settings/workspace/logviewer');
});

it('treats an explicit "default" kind as navigable', () => {
  expect(
    inferUrl({ type: 'menuItem', kind: 'default', sectionPathname: 'settings', entityType: 'logviewer' }),
  ).to.equal('/umbraco/section/settings/workspace/logviewer');
});

it('returns null for non-default menu-item kinds (tree/link/action)', () => {
  for (const kind of ['tree', 'link', 'action']) {
    expect(
      inferUrl({ type: 'menuItem', kind, sectionPathname: 'settings', entityType: 'logviewer' }),
    ).to.equal(null);
  }
});

it('returns null for a menu item missing its entityType', () => {
  expect(inferUrl({ type: 'menuItem', sectionPathname: 'settings' })).to.equal(null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: FAIL — cannot resolve `./url-inference`.

- [ ] **Step 3: Implement**

Create `backoffice/src/desktop/url-inference.ts`:

```ts
import type { UmbraDesktopRefDescriptor } from './types';

/** Backoffice mount path; deep links are absolute under it. */
const BACKOFFICE_PATH = '/umbraco';

/**
 * Build the backoffice deep-link URL for a referenced extension, or null when the
 * surface isn't inferable by rule (tree/link/action menu items, or missing
 * primitives). Rules confirmed against the v17 backoffice router/menu code — see
 * design §5.1.
 * @param ref Primitives extracted from the referenced manifest.
 * @returns An absolute backoffice URL, or null when it cannot be inferred.
 */
export function inferUrl(ref: UmbraDesktopRefDescriptor): string | null {
  switch (ref.type) {
    case 'section':
      return ref.pathname ? `${BACKOFFICE_PATH}/section/${ref.pathname}` : null;
    case 'dashboard':
      return ref.sectionPathname && ref.pathname
        ? `${BACKOFFICE_PATH}/section/${ref.sectionPathname}/dashboard/${ref.pathname}`
        : null;
    case 'menuItem':
      // Only the default kind maps to a workspace route (menu-item-default.element.ts).
      if (ref.kind && ref.kind !== 'default') return null;
      return ref.sectionPathname && ref.entityType
        ? `${BACKOFFICE_PATH}/section/${ref.sectionPathname}/workspace/${ref.entityType}`
        : null;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backoffice/src/desktop/url-inference.ts backoffice/src/desktop/url-inference.test.ts
git commit -m "feat: add registry URL inference with tests" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `deriveApps` (TDD)

**Files:**
- Test: `backoffice/src/desktop/derive-apps.test.ts`
- Create: `backoffice/src/desktop/derive-apps.ts`

- [ ] **Step 1: Write the failing tests**

Create `backoffice/src/desktop/derive-apps.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { deriveApps } from './derive-apps';
import { UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS } from './constants';
import type {
  UmbraDesktopCatalogueEntry,
  UmbraDesktopResolvedEntry,
  UmbraDesktopSectionInfo,
} from './types';

const SECTIONS: UmbraDesktopSectionInfo[] = [
  { alias: 'Umb.Section.Content', label: 'Content', pathname: 'content' },
  { alias: 'Umb.Section.Settings', label: 'Settings', pathname: 'settings' },
];

function entry(over: Partial<UmbraDesktopCatalogueEntry> = {}): UmbraDesktopCatalogueEntry {
  return { alias: 'e', categoryAlias: 'cat', ...over };
}

function resolved(over: Partial<UmbraDesktopResolvedEntry> = {}): UmbraDesktopResolvedEntry {
  return { entry: entry(), url: '/x', gateSectionAlias: 'Umb.Section.Content', isSectionRoot: false, ...over };
}

it('emits a certified app for a permitted, resolved entry', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'content', categoryAlias: 'content' }), url: '/umbraco/section/content', gateSectionAlias: 'Umb.Section.Content', isSectionRoot: true })],
    SECTIONS,
  );
  const app = apps.find((a) => a.alias === 'content')!;
  expect(app.confidence).to.equal('certified');
  expect(app.url).to.equal('/umbraco/section/content');
  expect(app.categoryAlias).to.equal('content');
});

it('skips an entry whose gate section is not permitted', () => {
  const apps = deriveApps(
    [resolved({ gateSectionAlias: 'Umb.Section.Media' })],
    SECTIONS,
  );
  expect(apps.some((a) => a.confidence === 'certified')).to.be.false;
});

it('skips an entry that did not resolve to a URL', () => {
  const apps = deriveApps([resolved({ url: null })], SECTIONS);
  expect(apps.some((a) => a.confidence === 'certified')).to.be.false;
});

it('adds an uncertified fallback for a permitted section with no section-root entry', () => {
  const apps = deriveApps([], SECTIONS);
  const fallback = apps.filter((a) => a.confidence === 'uncertified');
  expect(fallback.map((a) => a.url)).to.have.members([
    '/umbraco/section/content',
    '/umbraco/section/settings',
  ]);
  expect(fallback.every((a) => a.categoryAlias === UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS)).to.be.true;
});

it('does NOT add a fallback for a section already covered by a section-root entry', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'content' }), gateSectionAlias: 'Umb.Section.Content', url: '/umbraco/section/content', isSectionRoot: true })],
    SECTIONS,
  );
  const contentFallback = apps.filter(
    (a) => a.confidence === 'uncertified' && a.url === '/umbraco/section/content',
  );
  expect(contentFallback).to.have.length(0);
  // Settings still falls back since nothing covered it.
  expect(apps.some((a) => a.confidence === 'uncertified' && a.url === '/umbraco/section/settings')).to.be.true;
});

it('still falls back a section that only has a non-root (e.g. dashboard) certified entry', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'welcome' }), gateSectionAlias: 'Umb.Section.Settings', url: '/umbraco/section/settings/dashboard/welcome', isSectionRoot: false })],
    SECTIONS,
  );
  expect(apps.some((a) => a.alias === 'welcome' && a.confidence === 'certified')).to.be.true;
  expect(apps.some((a) => a.confidence === 'uncertified' && a.url === '/umbraco/section/settings')).to.be.true;
});

it('prefers entry overrides over inherited name/icon', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'c', name: 'Override', icon: 'icon-star' }), inheritedName: 'Inherited', inheritedIcon: 'icon-doc' })],
    SECTIONS,
  );
  const app = apps.find((a) => a.alias === 'c')!;
  expect(app.name).to.equal('Override');
  expect(app.icon).to.equal('icon-star');
});

it('falls back to inherited name/icon when the entry omits them', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'c' }), inheritedName: 'Inherited', inheritedIcon: 'icon-doc' })],
    SECTIONS,
  );
  const app = apps.find((a) => a.alias === 'c')!;
  expect(app.name).to.equal('Inherited');
  expect(app.icon).to.equal('icon-doc');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: FAIL — cannot resolve `./derive-apps`.

- [ ] **Step 3: Implement**

Create `backoffice/src/desktop/derive-apps.ts`:

```ts
import type {
  UmbraDesktopApp,
  UmbraDesktopResolvedEntry,
  UmbraDesktopSectionInfo,
} from './types';
import { inferUrl } from './url-inference';
import { UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS } from './constants';

/** Fallback icon when neither the entry nor its referenced manifest provides one. */
const DEFAULT_ICON = 'icon-application';

/**
 * Turn resolved catalogue entries + the current user's permitted sections into the
 * flat, tagged app list. Certified entries first (gate-filtered), then an
 * uncertified `full-section` fallback for every permitted section not already
 * represented by a section-root entry. Pure — see design §5.2.
 * @param resolved Catalogue entries the adapter has resolved to URL + gate + presentation.
 * @param permittedSections Sections the current user may access.
 * @returns The flat list of launchable apps, each tagged with confidence + placement.
 */
export function deriveApps(
  resolved: ReadonlyArray<UmbraDesktopResolvedEntry>,
  permittedSections: ReadonlyArray<UmbraDesktopSectionInfo>,
): UmbraDesktopApp[] {
  const permitted = new Set(permittedSections.map((s) => s.alias));
  const apps: UmbraDesktopApp[] = [];
  const coveredSections = new Set<string>();

  // Certified pass.
  for (const r of resolved) {
    if (!r.gateSectionAlias || !permitted.has(r.gateSectionAlias)) continue;
    if (!r.url) continue;
    const e = r.entry;
    apps.push({
      alias: e.alias,
      name: e.name ?? r.inheritedName ?? e.alias,
      icon: e.icon ?? r.inheritedIcon ?? DEFAULT_ICON,
      url: r.url,
      chromeProfile: e.chromeProfile ?? 'full-section',
      defaultSize: e.defaultSize,
      allowMultiple: e.allowMultiple,
      weight: e.weight,
      categoryAlias: e.categoryAlias,
      groupAlias: e.groupAlias,
      confidence: 'certified',
    });
    if (r.isSectionRoot) coveredSections.add(r.gateSectionAlias);
  }

  // Uncertified section fallback.
  for (const s of permittedSections) {
    if (coveredSections.has(s.alias)) continue;
    const url = inferUrl({ type: 'section', pathname: s.pathname });
    if (!url) continue;
    apps.push({
      alias: `section:${s.alias}`,
      name: s.label,
      icon: DEFAULT_ICON,
      url,
      chromeProfile: 'full-section',
      categoryAlias: UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS,
      confidence: 'uncertified',
    });
  }

  return apps;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backoffice/src/desktop/derive-apps.ts backoffice/src/desktop/derive-apps.test.ts
git commit -m "feat: add app derivation (certified + section fallback) with tests" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `groupApps` (TDD)

**Files:**
- Test: `backoffice/src/desktop/group-apps.test.ts`
- Create: `backoffice/src/desktop/group-apps.ts`

- [ ] **Step 1: Write the failing tests**

Create `backoffice/src/desktop/group-apps.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { groupApps } from './group-apps';
import { UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS } from './constants';
import type { UmbraDesktopApp, UmbraDesktopCategory, UmbraDesktopGroup } from './types';

function app(over: Partial<UmbraDesktopApp> = {}): UmbraDesktopApp {
  return {
    alias: 'a', name: 'A', icon: 'icon', url: '/x', chromeProfile: 'full-section',
    categoryAlias: 'settings', confidence: 'certified', ...over,
  };
}

const categories: UmbraDesktopCategory[] = [
  { alias: 'content', label: 'Content', weight: 10 },
  { alias: 'settings', label: 'Settings', weight: 20 },
];
const groups: UmbraDesktopGroup[] = [
  { alias: 'diagnostics', label: 'Diagnostics', categoryAlias: 'settings', weight: 10 },
];

it('places apps under their category header', () => {
  const tree = groupApps([app({ alias: 'c', categoryAlias: 'content' })], categories, groups);
  const content = tree.find((c) => c.category.alias === 'content')!;
  expect(content.apps.map((a) => a.alias)).to.deep.equal(['c']);
});

it('drops categories with no apps', () => {
  const tree = groupApps([app({ categoryAlias: 'settings' })], categories, groups);
  expect(tree.some((c) => c.category.alias === 'content')).to.be.false;
});

it('separates loose apps from grouped apps', () => {
  const tree = groupApps(
    [app({ alias: 'loose' }), app({ alias: 'grouped', groupAlias: 'diagnostics' })],
    categories,
    groups,
  );
  const settings = tree.find((c) => c.category.alias === 'settings')!;
  expect(settings.apps.map((a) => a.alias)).to.deep.equal(['loose']);
  expect(settings.groups[0].apps.map((a) => a.alias)).to.deep.equal(['grouped']);
});

it('treats an app whose groupAlias has no matching group as loose', () => {
  const tree = groupApps([app({ alias: 'x', groupAlias: 'nope' })], categories, groups);
  const settings = tree.find((c) => c.category.alias === 'settings')!;
  expect(settings.apps.map((a) => a.alias)).to.deep.equal(['x']);
});

it('sorts categories by weight ascending', () => {
  const tree = groupApps(
    [app({ alias: 'c', categoryAlias: 'content' }), app({ alias: 's', categoryAlias: 'settings' })],
    categories,
    groups,
  );
  expect(tree.map((c) => c.category.alias)).to.deep.equal(['content', 'settings']);
});

it('sorts apps within a category by weight then name', () => {
  const tree = groupApps(
    [
      app({ alias: 'b', name: 'Bravo', weight: 20 }),
      app({ alias: 'a', name: 'Alpha', weight: 10 }),
      app({ alias: 'c', name: 'Charlie', weight: 10 }),
    ],
    categories,
    groups,
  );
  const settings = tree.find((c) => c.category.alias === 'settings')!;
  expect(settings.apps.map((a) => a.alias)).to.deep.equal(['a', 'c', 'b']);
});

it('synthesizes the reserved "More" category and orders it last', () => {
  const tree = groupApps(
    [
      app({ alias: 'more', categoryAlias: UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS, confidence: 'uncertified' }),
      app({ alias: 's', categoryAlias: 'settings' }),
    ],
    categories,
    groups,
  );
  expect(tree[tree.length - 1].category.alias).to.equal(UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS);
  expect(tree[tree.length - 1].category.label).to.equal('More');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: FAIL — cannot resolve `./group-apps`.

- [ ] **Step 3: Implement**

Create `backoffice/src/desktop/group-apps.ts`:

```ts
import type {
  UmbraDesktopApp,
  UmbraDesktopCategory,
  UmbraDesktopGroup,
  UmbraDesktopLauncherCategory,
} from './types';
import {
  UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS,
  UMBRADESKTOP_UNCERTIFIED_CATEGORY_LABEL,
  UMBRADESKTOP_UNCERTIFIED_CATEGORY_WEIGHT,
} from './constants';

/** Compare by weight ascending, then label alphabetically. */
function byWeightThenLabel(aw: number, al: string, bw: number, bl: string): number {
  return aw - bw || al.localeCompare(bl);
}

/**
 * Group derived apps into the launcher's display tree: header → optional collapsible
 * group → apps, sorted by weight then label, empties dropped, the reserved "More"
 * header always last. Pure — see design §5.3.
 * @param apps The flat, tagged app list from `deriveApps`.
 * @param categories Curated headers.
 * @param groups Curated collapsible sub-groups.
 * @returns The launcher display tree.
 */
export function groupApps(
  apps: ReadonlyArray<UmbraDesktopApp>,
  categories: ReadonlyArray<UmbraDesktopCategory>,
  groups: ReadonlyArray<UmbraDesktopGroup>,
): UmbraDesktopLauncherCategory[] {
  // Ensure the reserved "More" category always exists as a home for fallback apps.
  const allCategories: UmbraDesktopCategory[] = [
    ...categories,
    {
      alias: UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS,
      label: UMBRADESKTOP_UNCERTIFIED_CATEGORY_LABEL,
      weight: UMBRADESKTOP_UNCERTIFIED_CATEGORY_WEIGHT,
    },
  ];

  const result: UmbraDesktopLauncherCategory[] = [];

  for (const category of allCategories) {
    const inCategory = apps.filter(
      (a) => (a.categoryAlias ?? UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS) === category.alias,
    );
    if (inCategory.length === 0) continue;

    const categoryGroups = groups
      .filter((g) => g.categoryAlias === category.alias)
      .slice()
      .sort((a, b) => byWeightThenLabel(a.weight ?? 0, a.label, b.weight ?? 0, b.label));

    const launcherGroups = categoryGroups
      .map((group) => ({
        group,
        apps: inCategory
          .filter((a) => a.groupAlias === group.alias)
          .sort((a, b) => byWeightThenLabel(a.weight ?? 0, a.name, b.weight ?? 0, b.name)),
      }))
      .filter((lg) => lg.apps.length > 0);

    const groupedAliases = new Set(categoryGroups.map((g) => g.alias));
    const looseApps = inCategory
      .filter((a) => !a.groupAlias || !groupedAliases.has(a.groupAlias))
      .sort((a, b) => byWeightThenLabel(a.weight ?? 0, a.name, b.weight ?? 0, b.name));

    result.push({ category, apps: looseApps, groups: launcherGroups });
  }

  return result.sort((a, b) =>
    byWeightThenLabel(
      a.category.weight ?? 0,
      a.category.label,
      b.category.weight ?? 0,
      b.category.label,
    ),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backoffice/src/desktop/group-apps.ts backoffice/src/desktop/group-apps.test.ts
git commit -m "feat: add launcher grouping with tests" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `allowMultiple` enforcement (TDD)

**Files:**
- Test: `backoffice/src/desktop/window-model.test.ts` (append)
- Modify: `backoffice/src/desktop/window-model.ts`
- Modify: `backoffice/src/desktop/window-manager.context.ts`

- [ ] **Step 1: Write the failing test**

Append to `backoffice/src/desktop/window-model.test.ts` (add `findAppWindow` to the existing import from `./window-model`):

```ts
it('findAppWindow returns the window hosting the given app alias', () => {
  const windows = [win('w1', 1), win('w2', 2, { app: { ...app, alias: 'other' } })];
  expect(findAppWindow(windows, 'a')!.id).to.equal('w1');
  expect(findAppWindow(windows, 'other')!.id).to.equal('w2');
});

it('findAppWindow returns undefined when no window hosts the alias', () => {
  expect(findAppWindow([win('w1', 1)], 'missing')).to.equal(undefined);
});
```

Update the existing import line at the top of the file to include `findAppWindow`:

```ts
import {
  nextZIndex,
  nextWindowRect,
  focusWindow,
  removeWindow,
  moveWindow,
  setWindowState,
  findAppWindow,
} from './window-model';
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: FAIL — `findAppWindow` is not exported.

- [ ] **Step 3: Implement the pure helper**

Append to `backoffice/src/desktop/window-model.ts`:

```ts
/**
 * The first open window hosting the given app alias, if any. Used to enforce
 * `allowMultiple: false` by focusing an existing instance instead of duplicating.
 * @param windows The current window list.
 * @param appAlias The app alias to look for.
 * @returns The matching window, or undefined.
 */
export function findAppWindow(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  appAlias: string,
): UmbraDesktopWindow | undefined {
  return windows.find((w) => w.app.alias === appAlias);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: PASS.

- [ ] **Step 5: Enforce `allowMultiple` in the window manager**

In `backoffice/src/desktop/window-manager.context.ts`, add `findAppWindow` to the import from `./window-model`:

```ts
import {
  focusWindow,
  moveWindow,
  nextWindowRect,
  nextZIndex,
  removeWindow,
  setWindowState,
  findAppWindow,
} from './window-model';
```

Then replace the `open` method with:

```ts
  /**
   * Open a new window for the given app and focus it. If the app forbids multiple
   * instances and one is already open, focus that instead of opening another.
   * @param app The app to open.
   */
  public open(app: UmbraDesktopApp): void {
    const current = this.#windows.getValue();
    if (app.allowMultiple === false) {
      const existing = findAppWindow(current, app.alias);
      if (existing) {
        this.focus(existing.id);
        return;
      }
    }
    const rect = nextWindowRect(current.length, app.defaultSize ?? DEFAULT_SIZE);
    const win: UmbraDesktopWindow = {
      id: crypto.randomUUID(),
      app,
      rect,
      z: nextZIndex(current),
      active: true,
      state: 'normal',
    };
    this.#windows.setValue(focusWindow([...current, win], win.id));
  }
```

- [ ] **Step 6: Type-check and test**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors.
Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backoffice/src/desktop/window-model.ts backoffice/src/desktop/window-model.test.ts backoffice/src/desktop/window-manager.context.ts
git commit -m "feat: enforce allowMultiple by focusing an existing window" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: The catalogue data

**Files:**
- Create: `backoffice/src/desktop/catalogue/categories.ts`
- Create: `backoffice/src/desktop/catalogue/content.ts`
- Create: `backoffice/src/desktop/catalogue/settings.ts`
- Create: `backoffice/src/desktop/catalogue/index.ts`

> The section aliases used here (`Umb.Section.Content`, `Umb.Section.Media`,
> `Umb.Section.Settings`) and the Log Viewer menu item (`Umb.MenuItem.LogViewer`,
> entityType `logviewer`) are confirmed against the v17 source. They are re-verified live in
> Task 8's manual step — an app that doesn't appear means its alias needs correcting.

- [ ] **Step 1: Create the categories fragment**

Create `backoffice/src/desktop/catalogue/categories.ts`:

```ts
import type { UmbraDesktopCategory, UmbraDesktopGroup } from '../types';

/** Curated launcher headers. Free-form and decoupled from Umbraco sections. */
export const categories: UmbraDesktopCategory[] = [
  { alias: 'content', label: 'Content', weight: 10, icon: 'icon-documents' },
  { alias: 'media', label: 'Media', weight: 20, icon: 'icon-picture' },
  { alias: 'settings', label: 'Settings', weight: 30, icon: 'icon-settings' },
];

/** Curated collapsible sub-groups. */
export const groups: UmbraDesktopGroup[] = [
  { alias: 'diagnostics', label: 'Diagnostics', categoryAlias: 'settings', weight: 10 },
];
```

- [ ] **Step 2: Create the content fragment**

Create `backoffice/src/desktop/catalogue/content.ts`:

```ts
import type { UmbraDesktopCatalogueEntry } from '../types';

/** Content-area apps (Content + Media sections). */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'content',
    ref: 'Umb.Section.Content',
    name: 'Content',
    icon: 'icon-documents',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    allowMultiple: true,
    categoryAlias: 'content',
    weight: 10,
  },
  {
    alias: 'media',
    ref: 'Umb.Section.Media',
    name: 'Media',
    icon: 'icon-picture',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    allowMultiple: true,
    categoryAlias: 'media',
    weight: 10,
  },
];
```

- [ ] **Step 3: Create the settings fragment**

Create `backoffice/src/desktop/catalogue/settings.ts`:

```ts
import type { UmbraDesktopCatalogueEntry } from '../types';

/** Settings-area apps: the whole Settings section + the Log Viewer workspace tool. */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'settings',
    ref: 'Umb.Section.Settings',
    name: 'Settings',
    icon: 'icon-settings',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    categoryAlias: 'settings',
    weight: 10,
  },
  {
    // Log Viewer is a default-kind menu item (entityType 'logviewer'); its URL is
    // inferred as /umbraco/section/settings/workspace/logviewer. `section` gives both
    // the permission gate and the section prefix.
    alias: 'log-viewer',
    ref: 'Umb.MenuItem.LogViewer',
    section: 'Umb.Section.Settings',
    name: 'Log Viewer',
    icon: 'icon-box-alt',
    chromeProfile: 'full-section',
    defaultSize: { w: 900, h: 640 },
    categoryAlias: 'settings',
    groupAlias: 'diagnostics',
    weight: 10,
  },
];
```

- [ ] **Step 4: Create the collating index**

Create `backoffice/src/desktop/catalogue/index.ts`:

```ts
import type { UmbraDesktopCatalogue } from '../types';
import { categories, groups } from './categories';
import { entries as content } from './content';
import { entries as settings } from './settings';

/**
 * The collated curated catalogue. To extend it, add a fragment file exporting
 * `entries` (and optionally `categories`/`groups`) and spread it in here.
 */
export const catalogue: UmbraDesktopCatalogue = {
  categories,
  groups,
  entries: [...content, ...settings],
};
```

- [ ] **Step 5: Type-check**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backoffice/src/desktop/catalogue
git commit -m "feat: add curated app catalogue (Content, Media, Settings, Log Viewer)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: The app-catalogue context (impure adapter)

**Files:**
- Create: `backoffice/src/desktop/app-catalogue.context-token.ts`
- Create: `backoffice/src/desktop/app-catalogue.context.ts`

> This context is impure glue over the registry + current-user context. Its logic is not
> unit-tested here (that needs a mocked backoffice, deferred as in Phase 1); it is verified
> manually in Task 8. All the interesting logic already lives in the pure, tested functions it
> calls.

- [ ] **Step 1: Create the context token**

Create `backoffice/src/desktop/app-catalogue.context-token.ts`:

```ts
import type { UmbraDesktopAppCatalogueContext } from './app-catalogue.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** Context token for the desktop app catalogue. */
export const UMBRADESKTOP_APP_CATALOGUE_CONTEXT =
  new UmbContextToken<UmbraDesktopAppCatalogueContext>('UmbraDesktopAppCatalogueContext');
```

- [ ] **Step 2: Create the context**

Create `backoffice/src/desktop/app-catalogue.context.ts`:

```ts
import type {
  UmbraDesktopApp,
  UmbraDesktopCatalogueEntry,
  UmbraDesktopLauncherCategory,
  UmbraDesktopRefDescriptor,
  UmbraDesktopResolvedEntry,
  UmbraDesktopSectionInfo,
} from './types';
import { catalogue } from './catalogue/index.js';
import { inferUrl } from './url-inference.js';
import { deriveApps } from './derive-apps.js';
import { groupApps } from './group-apps.js';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from './app-catalogue.context-token.js';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/** Condition alias that scopes a dashboard (and similar) to a section. */
const SECTION_ALIAS_CONDITION = 'Umb.Condition.SectionAlias';

/**
 * Resolves the curated catalogue against the current install: reads the user's
 * permitted sections, infers each entry's URL from the registry, then derives and
 * groups the app list. Impure glue around the pure `deriveApps` / `groupApps`
 * (design §6). Provided by the desktop element so it is scoped to the desktop subtree.
 */
export class UmbraDesktopAppCatalogueContext extends UmbContextBase {
  #apps = new UmbArrayState<UmbraDesktopApp>([], (a) => a.alias);
  /** Flat list of launchable apps for the current user. */
  public readonly apps = this.#apps.asObservable();

  #tree = new UmbArrayState<UmbraDesktopLauncherCategory>([], (c) => c.category.alias);
  /** Grouped display tree for the launcher. */
  public readonly tree = this.#tree.asObservable();

  /** Sections the current user may access, resolved to {alias, label, pathname}. */
  #sections: UmbraDesktopSectionInfo[] = [];

  /**
   * @param host The controller host (the desktop element) this context is scoped to.
   */
  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_APP_CATALOGUE_CONTEXT);
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (currentUser) => {
      if (!currentUser) return;
      this.observe(currentUser.allowedSections, (allowed) => {
        this.#sections = this.#resolveSections(allowed ?? []);
        this.#recompute();
      });
    });
  }

  /** Registered sections filtered to the ones the user may access. */
  #resolveSections(allowedAliases: ReadonlyArray<string>): UmbraDesktopSectionInfo[] {
    const allowed = new Set(allowedAliases);
    // Snapshot of registered sections (kind-merged); sections exist by desktop-mount time.
    const sections = umbExtensionsRegistry.getByType('section') as Array<{
      alias: string;
      name?: string;
      meta?: { label?: string; pathname?: string };
    }>;
    return sections
      .filter((s) => allowed.has(s.alias))
      .map((s) => ({
        alias: s.alias,
        label: s.meta?.label ?? s.name ?? s.alias,
        pathname: s.meta?.pathname ?? '',
      }));
  }

  /** Re-resolve the catalogue and publish the derived + grouped apps. */
  #recompute(): void {
    const resolved = catalogue.entries.map((e) => this.#resolveEntry(e));
    const apps = deriveApps(resolved, this.#sections);
    this.#apps.setValue(apps);
    this.#tree.setValue(groupApps(apps, catalogue.categories, catalogue.groups));
  }

  /** Resolve one catalogue entry to a concrete URL + gate + inherited presentation. */
  #resolveEntry(entry: UmbraDesktopCatalogueEntry): UmbraDesktopResolvedEntry {
    // Explicit-URL entry: the gate is the stated section.
    if (entry.url) {
      return { entry, url: entry.url, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    if (!entry.ref) {
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    const manifest = umbExtensionsRegistry.getByAlias(entry.ref) as
      | { type: string; alias: string; kind?: string; name?: string; conditions?: Array<{ alias: string; match?: string }>; meta?: Record<string, unknown> }
      | undefined;
    if (!manifest) {
      return { entry, url: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
    const described = this.#describe(manifest, entry);
    return {
      entry,
      url: described.ref ? inferUrl(described.ref) : null,
      gateSectionAlias: described.gateSectionAlias,
      isSectionRoot: described.isSectionRoot,
      inheritedName: (manifest.meta?.label as string | undefined) ?? manifest.name,
      inheritedIcon: manifest.meta?.icon as string | undefined,
    };
  }

  /** Build a RefDescriptor + gate/root flags from a referenced manifest. */
  #describe(
    manifest: { type: string; alias: string; kind?: string; conditions?: Array<{ alias: string; match?: string }>; meta?: Record<string, unknown> },
    entry: UmbraDesktopCatalogueEntry,
  ): { ref: UmbraDesktopRefDescriptor | null; gateSectionAlias: string | null; isSectionRoot: boolean } {
    switch (manifest.type) {
      case 'section':
        return {
          ref: { type: 'section', pathname: manifest.meta?.pathname as string | undefined },
          gateSectionAlias: manifest.alias,
          isSectionRoot: true,
        };
      case 'dashboard': {
        const sectionAlias = entry.section ?? this.#dashboardSectionAlias(manifest);
        return {
          ref: {
            type: 'dashboard',
            pathname: manifest.meta?.pathname as string | undefined,
            sectionPathname: this.#pathnameOf(sectionAlias),
          },
          gateSectionAlias: sectionAlias,
          isSectionRoot: false,
        };
      }
      case 'menuItem':
        return {
          ref: {
            type: 'menuItem',
            kind: manifest.kind,
            entityType: manifest.meta?.entityType as string | undefined,
            sectionPathname: this.#pathnameOf(entry.section ?? null),
          },
          gateSectionAlias: entry.section ?? null,
          isSectionRoot: false,
        };
      default:
        return { ref: null, gateSectionAlias: entry.section ?? null, isSectionRoot: false };
    }
  }

  /** Pathname of a permitted section alias, or undefined. */
  #pathnameOf(sectionAlias: string | null): string | undefined {
    if (!sectionAlias) return undefined;
    return this.#sections.find((s) => s.alias === sectionAlias)?.pathname;
  }

  /** The section a dashboard is scoped to, read from its section-alias condition. */
  #dashboardSectionAlias(manifest: { conditions?: Array<{ alias: string; match?: string }> }): string | null {
    const condition = (manifest.conditions ?? []).find((c) => c.alias === SECTION_ALIAS_CONDITION);
    return condition?.match ?? null;
  }
}

export default UmbraDesktopAppCatalogueContext;
```

- [ ] **Step 3: Type-check**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors. (If `UMB_CURRENT_USER_CONTEXT` or `umbExtensionsRegistry` import paths are flagged, confirm them against `node_modules/@umbraco-cms/backoffice` — the expected specifiers are `@umbraco-cms/backoffice/current-user` and `@umbraco-cms/backoffice/extension-registry`.)

- [ ] **Step 4: Commit**

```bash
git add backoffice/src/desktop/app-catalogue.context.ts backoffice/src/desktop/app-catalogue.context-token.ts
git commit -m "feat: add app-catalogue context resolving the catalogue against the registry" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Wire the catalogue into the desktop + taskbar, delete `apps.ts`

**Files:**
- Modify: `backoffice/src/desktop/components/desktop.element.ts`
- Modify: `backoffice/src/desktop/components/taskbar.element.ts`
- Delete: `backoffice/src/desktop/apps.ts`

- [ ] **Step 1: Provide the catalogue context from the desktop element**

In `backoffice/src/desktop/components/desktop.element.ts`, add the import and instantiate the
context alongside the window manager.

Add to the imports:

```ts
import { UmbraDesktopAppCatalogueContext } from '../app-catalogue.context.js';
```

Add the field next to `#manager`:

```ts
  #manager = new UmbraDesktopWindowManagerContext(this);
  #catalogue = new UmbraDesktopAppCatalogueContext(this);
```

- [ ] **Step 2: Rewrite the taskbar to launch from the catalogue tree**

Replace the entire contents of `backoffice/src/desktop/components/taskbar.element.ts` with:

```ts
import type { UmbraDesktopApp, UmbraDesktopLauncherCategory, UmbraDesktopWindow } from '../types';
import { UMBRADESKTOP_TASKBAR_HEIGHT } from '../constants';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token';
import type { UmbraDesktopAppCatalogueContext } from '../app-catalogue.context';
import { css, customElement, html, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';

/**
 * The bottom panel: Umbraco-logo start button (opens a placeholder app launcher),
 * running-window buttons, clock, exit. The launcher is a Phase-2 placeholder for the
 * Phase-3 fullscreen drawer — it lists the grouped catalogue tree.
 */
@customElement('umbradesktop-taskbar')
export class UmbraDesktopTaskbarElement extends UmbLitElement {
  @state()
  private _windows: UmbraDesktopWindow[] = [];

  @state()
  private _tree: UmbraDesktopLauncherCategory[] = [];

  @state()
  private _launcherOpen = false;

  @state()
  private _clock = '';

  #manager?: UmbraDesktopWindowManagerContext;
  #catalogue?: UmbraDesktopAppCatalogueContext;
  #timer?: number;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
      if (ctx) this.observe(ctx.windows, (list) => (this._windows = list));
    });
    this.consumeContext(UMBRADESKTOP_APP_CATALOGUE_CONTEXT, (ctx) => {
      this.#catalogue = ctx ?? undefined;
      if (ctx) this.observe(ctx.tree, (tree) => (this._tree = tree));
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    this.#tick();
    this.#timer = window.setInterval(() => this.#tick(), 15000);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#timer) window.clearInterval(this.#timer);
  }

  #tick() {
    this._clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  #toggleLauncher() {
    this._launcherOpen = !this._launcherOpen;
  }

  #launch(app: UmbraDesktopApp) {
    this.#manager?.open(app);
    this._launcherOpen = false;
  }

  /** Confirm, then leave the Desktop section for the classic backoffice. */
  #onExit = async () => {
    try {
      await umbConfirmModal(this, {
        headline: 'Exit desktop mode',
        content: 'Return to the classic Umbraco backoffice? Your open windows will be closed.',
        confirmLabel: 'Exit',
        cancelLabel: 'Stay',
        color: 'danger',
      });
    } catch {
      return; // cancelled
    }
    const path = window.location.pathname.replace(/\/section\/.*$/, '/section/content');
    window.history.pushState(null, '', path);
  };

  #renderApp(app: UmbraDesktopApp) {
    return html`
      <button class="launch-item" @click=${() => this.#launch(app)}>
        <umb-icon name=${app.icon}></umb-icon>
        <span>${app.name}</span>
      </button>
    `;
  }

  #renderLauncher() {
    if (!this._launcherOpen) return '';
    return html`
      <div class="launcher" style="bottom:${UMBRADESKTOP_TASKBAR_HEIGHT}px">
        ${repeat(
          this._tree,
          (c) => c.category.alias,
          (c) => html`
            <div class="launch-category">
              <div class="launch-header">${c.category.label}</div>
              <div class="launch-apps">${c.apps.map((a) => this.#renderApp(a))}</div>
              ${c.groups.map(
                (g) => html`
                  <div class="launch-group">
                    <div class="launch-group-label">${g.group.label}</div>
                    <div class="launch-apps">${g.apps.map((a) => this.#renderApp(a))}</div>
                  </div>
                `,
              )}
            </div>
          `,
        )}
      </div>
    `;
  }

  override render() {
    return html`
      ${this.#renderLauncher()}
      <div class="bar" style="height:${UMBRADESKTOP_TASKBAR_HEIGHT}px">
        <button
          class="start ${this._launcherOpen ? 'active' : ''}"
          title="Open apps"
          @click=${this.#toggleLauncher}>
          <umb-icon name="icon-umbraco"></umb-icon>
        </button>
        <div class="running">
          ${repeat(
            this._windows,
            (w) => w.id,
            (w) => html`
              <button
                class="task ${w.active ? 'active' : ''}"
                @click=${() => this.#manager?.focus(w.id)}>
                <umb-icon name=${w.app.icon}></umb-icon>
                <span>${w.app.name}</span>
              </button>
            `,
          )}
        </div>
        <uui-button
          class="exit"
          compact
          look="secondary"
          label="Exit desktop mode"
          @click=${this.#onExit}>
          Exit
        </uui-button>
        <div class="clock">${this._clock}</div>
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        position: relative;
        display: block;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: 0 var(--uui-size-space-3);
        background: var(--uui-color-header-surface, var(--uui-color-surface-alt));
        border-top: 1px solid var(--uui-color-border);
      }
      .start {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 20px;
      }
      .start:hover,
      .start.active {
        background: var(--uui-color-surface);
      }
      .running {
        display: flex;
        gap: var(--uui-size-space-1);
        flex: 1;
        overflow: hidden;
      }
      .task {
        display: inline-flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        max-width: 180px;
        padding: var(--uui-size-space-1) var(--uui-size-space-3);
        border: 1px solid transparent;
        border-radius: var(--uui-border-radius, 3px);
        background: var(--uui-color-surface);
        cursor: pointer;
        font-size: var(--uui-type-small-size);
        white-space: nowrap;
      }
      .task.active {
        border-color: var(--uui-color-selected);
      }
      .clock {
        font-size: var(--uui-type-small-size);
        opacity: 0.85;
        font-variant-numeric: tabular-nums;
      }
      .launcher {
        position: absolute;
        left: var(--uui-size-space-3);
        width: 320px;
        max-height: 60vh;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-4);
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
        box-shadow: var(--uui-shadow-depth-4);
      }
      .launch-header {
        font-weight: 700;
        font-size: var(--uui-type-small-size);
        text-transform: uppercase;
        opacity: 0.7;
        margin-bottom: var(--uui-size-space-2);
      }
      .launch-group {
        margin-top: var(--uui-size-space-2);
        padding-left: var(--uui-size-space-3);
      }
      .launch-group-label {
        font-size: var(--uui-type-small-size);
        opacity: 0.6;
        margin-bottom: var(--uui-size-space-1);
      }
      .launch-apps {
        display: flex;
        flex-direction: column;
      }
      .launch-item {
        display: inline-flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-2) var(--uui-size-space-2);
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: var(--uui-type-small-size);
        text-align: left;
      }
      .launch-item:hover {
        background: var(--uui-color-surface-alt);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-taskbar': UmbraDesktopTaskbarElement;
  }
}
```

- [ ] **Step 3: Delete the obsolete hard-coded catalogue**

Run: `rm "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/apps.ts"`

- [ ] **Step 4: Type-check, test, and build**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors, and no remaining references to `apps.ts` / `UMBRADESKTOP_APPS`.
Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: PASS — all unit tests green.
Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm run build`
Expected: exits 0; `wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop/umbradesktop.js` rebuilt.

- [ ] **Step 5: Commit**

```bash
git add backoffice/src/desktop/components/desktop.element.ts backoffice/src/desktop/components/taskbar.element.ts
git rm backoffice/src/desktop/apps.ts
git commit -m "feat: launch desktop apps from the derived catalogue; drop hard-coded apps.ts" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual verification in the Test Instance**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop.TestInstance" && dotnet run`
Then, in the backoffice (log in, ensure the Administrators group has the Desktop section enabled), open the **Desktop** section and verify:

1. Click the Umbraco-logo start button → a launcher panel opens above the taskbar.
2. It shows **Content**, **Media**, **Settings** headers (with a **Diagnostics** sub-group under
   Settings containing **Log Viewer**), and a **More** header listing any *other* permitted
   sections (e.g. Users, Members, Translation) as uncertified fallbacks.
3. Click **Content** → a Content window opens with the header stripped (Phase 1 behaviour).
4. Click **Log Viewer** → a window opens at `/umbraco/section/settings/workspace/logviewer`
   showing the Log Viewer (inside the Settings shell — sidebar present, per design §5.1).
5. **allowMultiple:** click **Settings** twice → only one Settings window (it has no
   `allowMultiple`, so a second launch focuses the existing one). Click **Content** twice → two
   Content windows cascade (it sets `allowMultiple: true`).
6. **Permission filtering:** in Settings ▸ Users ▸ Groups, remove a section (e.g. Media) from
   your user group, save, reload the Desktop → the **Media** app is gone from the launcher.
   (Restore it afterwards.)
7. **Boot cost:** the launcher/apps only resolve after entering the Desktop section — the
   classic backoffice loads normally; nothing new runs at boot.

If a certified app is missing, its `ref`/`section` alias is wrong — correct it in the relevant
`catalogue/*.ts` fragment, rebuild, and re-verify.

---

## Self-review — spec coverage (Phase 2)

| Spec element (design doc) | Task |
|---|---|
| Source-agnostic `UmbraDesktopApp` model, two confidence tiers (§2) | Task 1, 3 |
| Catalogue entry `ref`/`url`/`section` + categories/groups (§3.2) | Task 1, 6 |
| Two independent axes: gate vs `categoryAlias` (§3.1) | Task 1, 3 (gate), 4 (display) |
| Two-level grouping; reserved "More" bucket (§3.3, §3.4) | Task 4 |
| Split fragment files collated by an index (§4) | Task 6 |
| URL inference — section / dashboard / default menu-item (§5.1) | Task 2 |
| `deriveApps` — gate filter + section fallback (§5.2) | Task 3 |
| `groupApps` — display tree (§5.3) | Task 4 |
| `allowMultiple` enforcement (§5.4) | Task 5 |
| Runtime resolution — permitted sections, lazy on mount (§6) | Task 7, 8 (desktop mount) |
| Placeholder launcher replaces hard-coded `apps[0]` (§7) | Task 8 |
| Delete `apps.ts` (§7) | Task 8 |
| Testing: pure logic TDD + manual (§8) | Tasks 2–5 (unit), 8 (manual) |
| R6 chrome-strip limit — entries default `full-section` (§9) | Task 6 (all `full-section`) |
| Out of scope: drawer/badges, persistence, manifest source | Not in this plan (correct) |

**Placeholder scan:** none — every step contains concrete code/commands. The only marked
"verify live" item (section/menu-item aliases) is a real discovery/validation action in Task 8,
not a code placeholder; the aliases used are the source-confirmed values.

**Type consistency:** `UmbraDesktopApp`, `UmbraDesktopCatalogueEntry`, `UmbraDesktopResolvedEntry`,
`UmbraDesktopSectionInfo`, `UmbraDesktopRefDescriptor`, `UmbraDesktopLauncher{Category,Group}`
are defined in Task 1 and used with matching field names in Tasks 2–8. Function names
(`inferUrl`, `deriveApps`, `groupApps`, `findAppWindow`) are consistent across their definition,
tests, and call sites (`app-catalogue.context.ts`, `window-manager.context.ts`).
