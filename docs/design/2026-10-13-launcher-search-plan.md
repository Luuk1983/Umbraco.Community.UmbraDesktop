# Launcher search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing in the launcher searches the desktop's apps and Umbraco's own search sources together, and every result opens as a desktop window, replacing the native search modal (issue #6).

**Architecture:** A desktop-lifetime search context turns core's `globalSearch` registrations (plus Help) into a list of sources. A launcher-independent engine turns a query into grouped results (apps, full sections, folded counts, a drilled-down list). A launcher controller draws them into the launcher's own shadow root, as All apps is drawn, and opening goes through one shared "entity window" module that the AI chat's open tool also moves onto.

**Tech Stack:** TypeScript, Lit, Umbraco 17 backoffice extension APIs (`UmbExtensionsManifestInitializer`, `createExtensionApiByAlias`, `UMB_APP_LANGUAGE_CONTEXT`), web-test-runner with `@open-wc/testing` in a real Chrome.

**Spec:** [`2026-10-13-launcher-search-design.md`](2026-10-13-launcher-search-design.md). Read it first: this plan argues from it.

## Global Constraints

- **Never commit.** No `git commit`, `push`, `tag` or PR. Every task ends with the work left uncommitted for the owner to review. This overrides the skill's commit steps.
- **Tests first.** Write the failing test, run it and see it fail, then implement.
- **JSDoc on everything**, private members included, saying why the code exists. Match the density of the surrounding files.
- **Run both** `npm run build` and `npm test` from `src/Umbraco.Community.UmbraDesktop` before calling the work done; the test runner does not type-check and `tsc` renders nothing.
- **One test file:** from `src/Umbraco.Community.UmbraDesktop/backoffice`, `npx web-test-runner "src/desktop/<path>.test.ts" --node-resolve`. Full run: `npm test -- --concurrency 2` from `src/Umbraco.Community.UmbraDesktop`.
- **Known test-runner traps:** a failing `expect(el).to.equal(null)` hangs the run (assert `!!el` instead); fixtures stall in a background tab.
- **A theme may restyle, never remove.** No theme file is changed by this plan. If a theme needs a change, add a token instead.
- Full sections: `Umb.GlobalSearch.Document`, `Umb.GlobalSearch.Media`. Everything else, and Help, is folded.
- Take sizes: apps 6, full sections 5, folded 1, drill page 20. Debounce 300 ms.
- New UI strings go in both `localization/en.ts` and `localization/nl.ts`; `parity.test.ts` enforces it.
- Window opened for a result: `chromeProfile: 'workspace-only'`, size `{ w: 1200, h: 780 }`, min `{ w: 900, h: 540 }`, `allowMultiple: false`.

## Review Focus

1. **A variant document with no name in the current culture** shows the invariant or first variant's name, never a blank row. Pinned in Task 4.
2. **The launcher closes while a search is in flight**: the late answer is dropped without error or a redraw of a gone element. Pinned in Task 3 (`dispose`).
3. **A third-party source returns an external or missing `href`**: the row is shown disabled and nothing navigates. Pinned in Task 6.
4. **A query of only spaces** is treated as empty: the launcher stays as it is and no source is asked. Pinned in Task 3 and Task 6.
5. **Scrolling a drilled-down list past its last page** asks the server no more. Pinned in Task 3 (`more` at the end).

---

## File structure

| File | Responsibility |
| --- | --- |
| Create `backoffice/src/desktop/windows/entity-window.ts` | The one way to build, find and address a window on one entity. Shared by search and the AI tool. |
| Create `backoffice/src/desktop/search/types.ts` | Source, item, page and state types every search unit speaks. |
| Create `backoffice/src/desktop/search/rank-apps.ts` | Local app matching and ranking. |
| Create `backoffice/src/desktop/search/search-engine.ts` | Query → state: debounce, stale answers, failures, drill and paging. Knows nothing of the launcher. |
| Create `backoffice/src/desktop/search/umbraco-sources.ts` | Adapts one core search provider to a source; maps raw items. |
| Create `backoffice/src/desktop/search/help-source.ts` | Help's docs search as a folded source. |
| Create `backoffice/src/desktop/help/help-registry.ts` | `loadHelpProductsFromRegistry`, moved out of `help.element.ts` so search can load docs too. |
| Create `backoffice/src/desktop/search/search.context.ts` + `search.context-token.ts` | Desktop-lifetime list of permitted sources. |
| Create `backoffice/src/desktop/launcher/search.controller.ts` | Draws the field and the results into the launcher; keyboard. |
| Modify `backoffice/src/desktop/ai/open-window.ts` | Uses `entity-window.ts`. |
| Modify `backoffice/src/desktop/help/help.element.ts` | Imports the moved loader. |
| Modify `backoffice/src/desktop/components/launcher.element.ts` | `search` mode, field, opening results, `back()`. |
| Modify `backoffice/src/desktop/launcher/drag-scroller.ts` | `search` mode in the mode type. |
| Modify `backoffice/src/desktop/components/taskbar.element.ts` | Drops the native search modal. |
| Modify `backoffice/src/desktop/components/desktop.element.ts` | Provides the search context. |
| Modify `backoffice/src/desktop/localization/en.ts`, `nl.ts` | Six new strings. |
| Modify tests: `components/launcher.test-helper.ts`, `components/launcher-events.test.ts`, `theme/themes/launcher-geometry.test.ts` | Follow the field change. |
| Create `docs/user/launcher/searching.md` | User guide page. |

All `backoffice/...` paths are under `src/Umbraco.Community.UmbraDesktop/`.

---

### Task 1: Shared entity window

**Files:**
- Create: `backoffice/src/desktop/windows/entity-window.ts`
- Test: `backoffice/src/desktop/windows/entity-window.test.ts`
- Modify: `backoffice/src/desktop/ai/open-window.ts`

**Interfaces:**
- Produces:
  - `UMBRADESKTOP_ENTITY_WINDOW_SIZE: { w: 1200; h: 780 }`, `UMBRADESKTOP_ENTITY_WINDOW_MIN_SIZE: { w: 900; h: 540 }`
  - `backofficeUrl(path: string): string`
  - `sectionUrlFromHref(href: string | undefined): string | undefined`
  - `entityWindowAlias(entityType: string, unique: string): string`
  - `interface UmbraDesktopEntityWindowView { getWindows(): ReadonlyArray<UmbraDesktopWindow>; subjectsOf(id: string): ReadonlyArray<UmbraDesktopWorkspaceSubject> }`
  - `findEntityWindow(desk: UmbraDesktopEntityWindowView, entityType: string, unique: string): string | undefined`
  - `entityWindowApp(target: UmbraDesktopEntityWindowTarget): UmbraDesktopApp` where `UmbraDesktopEntityWindowTarget = { entityType: string; unique: string; name: string; icon: string; url: string; alias?: string; allowMultiple?: boolean }`

- [ ] **Step 1: Write the failing test**

`backoffice/src/desktop/windows/entity-window.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import {
  entityWindowAlias,
  entityWindowApp,
  findEntityWindow,
  sectionUrlFromHref,
  UMBRADESKTOP_ENTITY_WINDOW_MIN_SIZE,
  UMBRADESKTOP_ENTITY_WINDOW_SIZE,
} from './entity-window';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher';

/** A window with only the fields the lookup reads. */
const win = (id: string, alias: string) => ({ id, app: { alias } as UmbraDesktopApp }) as UmbraDesktopWindow;

const KEY = 'aaaaaaaa-1111-2222-3333-444444444444';

describe('sectionUrlFromHref', () => {
  // Every shape core's search data sources produce (v17), including member type's leading slash.
  for (const [href, url] of [
    [`section/content/workspace/document/edit/${KEY}`, `/umbraco/section/content/workspace/document/edit/${KEY}`],
    [`section/media/workspace/media/edit/${KEY}`, `/umbraco/section/media/workspace/media/edit/${KEY}`],
    [`section/member-management/workspace/member/edit/${KEY}`, `/umbraco/section/member-management/workspace/member/edit/${KEY}`],
    [`section/settings/workspace/data-type/edit/${KEY}`, `/umbraco/section/settings/workspace/data-type/edit/${KEY}`],
    [`section/settings/workspace/document-type/edit/${KEY}`, `/umbraco/section/settings/workspace/document-type/edit/${KEY}`],
    [`section/settings/workspace/media-type/edit/${KEY}`, `/umbraco/section/settings/workspace/media-type/edit/${KEY}`],
    [`/section/settings/workspace/member-type/edit/${KEY}`, `/umbraco/section/settings/workspace/member-type/edit/${KEY}`],
    [`section/settings/workspace/template/edit/${KEY}`, `/umbraco/section/settings/workspace/template/edit/${KEY}`],
    [`section/translation/workspace/dictionary/edit/${KEY}`, `/umbraco/section/translation/workspace/dictionary/edit/${KEY}`],
    [`/umbraco/section/content/workspace/document/edit/${KEY}`, `/umbraco/section/content/workspace/document/edit/${KEY}`],
  ]) {
    it(`maps ${href}`, () => expect(sectionUrlFromHref(href)).to.equal(url));
  }

  it('refuses anything that does not land on a backoffice section', () => {
    for (const href of [undefined, '', 'https://example.com/x', '//example.com/section/x', 'dashboard/x', 'section/../../logout']) {
      expect(sectionUrlFromHref(href), String(href)).to.equal(undefined);
    }
  });
});

describe('entityWindowApp', () => {
  it('builds an editor-only window that is focused rather than duplicated', () => {
    const app = entityWindowApp({ entityType: 'document', unique: KEY, name: 'Home', icon: 'icon-home', url: '/umbraco/section/x' });
    expect(app).to.deep.equal({
      alias: entityWindowAlias('document', KEY),
      name: 'Home',
      icon: 'icon-home',
      content: { kind: 'iframe', url: '/umbraco/section/x' },
      chromeProfile: 'workspace-only',
      defaultSize: UMBRADESKTOP_ENTITY_WINDOW_SIZE,
      minSize: UMBRADESKTOP_ENTITY_WINDOW_MIN_SIZE,
      allowMultiple: false,
    });
  });

  it('gives different entities different aliases, so two results are two windows', () => {
    expect(entityWindowAlias('document', KEY)).to.not.equal(entityWindowAlias('media', KEY));
  });
});

describe('findEntityWindow', () => {
  const desk = (windows: UmbraDesktopWindow[], subjects: Record<string, UmbraDesktopWorkspaceSubject[]> = {}) => ({
    getWindows: () => windows,
    subjectsOf: (id: string) => subjects[id] ?? [],
  });

  it('finds a window by what it shows, such as the Content window on that document', () => {
    const found = findEntityWindow(desk([win('w1', 'content')], { w1: [{ entityType: 'document', unique: KEY } as UmbraDesktopWorkspaceSubject] }), 'document', KEY);
    expect(found).to.equal('w1');
  });

  it('finds a window it opened before that frame reported its subject', () => {
    expect(findEntityWindow(desk([win('w2', entityWindowAlias('document', KEY))]), 'document', KEY)).to.equal('w2');
  });

  it('does not mistake media for a document with the same key', () => {
    expect(findEntityWindow(desk([win('w3', entityWindowAlias('media', KEY))]), 'document', KEY)).to.equal(undefined);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx web-test-runner "src/desktop/windows/entity-window.test.ts" --node-resolve`
Expected: FAIL, the module `./entity-window` does not exist.

- [ ] **Step 3: Implement**

`backoffice/src/desktop/windows/entity-window.ts`:

```ts
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher';
import { UMBRADESKTOP_BACKOFFICE_SECTION_PATH } from '../url-inference';

/**
 * A window on one entity: a document, a media item, a data type. Built in one place because two
 * features open them, the AI chat's open tool and the launcher's search, and the same item opened
 * from both must be one window rather than two with different aliases and sizes.
 */

/** Backoffice mount path: core's path patterns and search hrefs are relative to it. */
const BACKOFFICE_PATH = '/umbraco';

/**
 * The size an entity window opens at: one workspace with no section sidebar to lean on, so larger
 * than a section, as the catalogue's `workspace-only` entries open.
 */
export const UMBRADESKTOP_ENTITY_WINDOW_SIZE = { w: 1200, h: 780 };

/** The resize floor below which a workspace's own layout stops working. */
export const UMBRADESKTOP_ENTITY_WINDOW_MIN_SIZE = { w: 900, h: 540 };

/**
 * Mount a core path pattern's output under the backoffice. `generateAbsolute` returns no leading
 * slash, so plain concatenation produces `/umbracosection/...`; normalised rather than assumed, in
 * case a future version corrects that.
 * @param path A path from `UmbPathPattern.generateAbsolute`.
 * @returns The URL to put in a window's iframe.
 */
export function backofficeUrl(path: string): string {
  return `${BACKOFFICE_PATH}/${path.replace(/^\/+/, '')}`;
}

/**
 * The window URL for a search result's `href`, or undefined when it does not land on a backoffice
 * section. Core's hrefs are relative to the backoffice (`section/content/...`), except member
 * type's, whose leading slash means the same thing; both normalise to `/umbraco/section/...`. A
 * third-party source can return anything, so an external address, or one that climbs out of the
 * sections, is refused rather than put in a window.
 * @param href The result's href.
 * @returns The absolute path to open, or undefined.
 */
export function sectionUrlFromHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const base = `${window.location.origin}${BACKOFFICE_PATH}/`;
  const relative = href.startsWith(`${BACKOFFICE_PATH}/`) ? href : href.replace(/^\/+/, '');
  let url: URL;
  try {
    url = new URL(relative, base);
  } catch {
    return undefined;
  }
  if (url.origin !== window.location.origin) return undefined;
  if (!url.pathname.startsWith(`${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/`)) return undefined;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The app alias for a window on one entity. Window identity keys off the alias, so this is what
 * makes the same item opened twice, from anywhere, one window.
 * @param entityType The entity type.
 * @param unique The entity's key.
 * @returns A stable alias.
 */
export function entityWindowAlias(entityType: string, unique: string): string {
  return `umbradesktop-entity:${entityType}:${unique}`;
}

/** The part of the window manager a lookup reads, so a test can hand in a plain object. */
export interface UmbraDesktopEntityWindowView {
  /** The open windows. */
  getWindows(): ReadonlyArray<UmbraDesktopWindow>;
  /**
   * What a window's frame reports it is editing.
   * @param id The window's id.
   */
  subjectsOf(id: string): ReadonlyArray<UmbraDesktopWorkspaceSubject>;
}

/**
 * A window already showing this entity. By subject first, because the user very often has it open
 * in their Content window already, and a second editor on one document is the conflict the
 * overwrite guard warns about. By alias as well, to cover the gap between a window opening and its
 * frame reporting what it loaded.
 * @param desk The desktop.
 * @param entityType The entity type wanted.
 * @param unique The key wanted.
 * @returns The window's id, or undefined.
 */
export function findEntityWindow(desk: UmbraDesktopEntityWindowView, entityType: string, unique: string): string | undefined {
  const alias = entityWindowAlias(entityType, unique);
  for (const win of desk.getWindows()) {
    if (win.app.alias === alias) return win.id;
    if (desk.subjectsOf(win.id).some((s) => s.entityType === entityType && s.unique === unique)) return win.id;
  }
  return undefined;
}

/** What {@link entityWindowApp} needs to build a window. */
export interface UmbraDesktopEntityWindowTarget {
  /** The entity type. */
  entityType: string;
  /** The entity's key. */
  unique: string;
  /** The window title. */
  name: string;
  /** The window icon. */
  icon: string;
  /** The absolute backoffice path the window loads. */
  url: string;
  /** Overrides the alias, for a deliberate second window. */
  alias?: string;
  /** True only for a deliberate second window; otherwise the manager focuses instead of stacking. */
  allowMultiple?: boolean;
}

/**
 * The app for a window on one entity: just its editor (`workspace-only`, since a section's tree
 * beside one item is navigation nobody asked for), at the entity window size.
 * @param target What to open.
 * @returns The app to hand the window manager.
 */
export function entityWindowApp(target: UmbraDesktopEntityWindowTarget): UmbraDesktopApp {
  return {
    alias: target.alias ?? entityWindowAlias(target.entityType, target.unique),
    name: target.name,
    icon: target.icon,
    content: { kind: 'iframe', url: target.url },
    chromeProfile: 'workspace-only',
    defaultSize: UMBRADESKTOP_ENTITY_WINDOW_SIZE,
    minSize: UMBRADESKTOP_ENTITY_WINDOW_MIN_SIZE,
    allowMultiple: target.allowMultiple ?? false,
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx web-test-runner "src/desktop/windows/entity-window.test.ts" --node-resolve`
Expected: PASS.

- [ ] **Step 5: Move the AI tool onto it**

In `backoffice/src/desktop/ai/open-window.ts`:
- Delete `BACKOFFICE_PATH`, `backofficeUrl`, `CONTENT_SIZE`, `CONTENT_MIN_SIZE`, `aliasFor` and `findOpenTarget`, with their JSDoc.
- Import: `import { backofficeUrl, entityWindowAlias, entityWindowApp, findEntityWindow } from '../windows/entity-window';`
- Replace `aliasFor(` with `entityWindowAlias(` (in `freeAlias`'s callers) and `findOpenTarget(` with `findEntityWindow(`.
- Replace the `app: { ... }` object literal at the end of `planOpenWindow` with:

```ts
    app: entityWindowApp({
      entityType,
      unique,
      name: label,
      icon: openable.icon,
      url: backofficeUrl(openable.path(unique)),
      alias,
      // Normally false, so the manager focuses instead of stacking and a repeated call is idempotent
      // even when `findEntityWindow` missed. A deliberate duplicate has to allow itself, or the
      // manager would undo the very thing that was asked for.
      allowMultiple: newWindow,
    }),
```

- Update the comment on `OPENABLE` that mentions `CONTENT_SIZE` to say the size comes from `entity-window.ts`.

- [ ] **Step 6: Run the AI tests and the new ones**

Run: `npx web-test-runner "src/desktop/ai/open-window.test.ts" "src/desktop/windows/entity-window.test.ts" --node-resolve`
Expected: PASS. The AI tests derive aliases from the first plan, so the alias rename needs no test change.

- [ ] **Step 7: Leave uncommitted.**

---

### Task 2: Search types and app ranking

**Files:**
- Create: `backoffice/src/desktop/search/types.ts`
- Create: `backoffice/src/desktop/search/rank-apps.ts`
- Test: `backoffice/src/desktop/search/rank-apps.test.ts`

**Interfaces:**
- Produces (types.ts):

```ts
export type UmbraDesktopSearchProminence = 'full' | 'folded';
export interface UmbraDesktopSearchPaging { skip: number; take: number }
export type UmbraDesktopSearchOpen =
  | { kind: 'entity'; entityType: string; unique: string; href?: string }
  | { kind: 'help'; target: string };
export interface UmbraDesktopSearchItem { key: string; name: string; icon: string; detail?: string; open: UmbraDesktopSearchOpen }
export interface UmbraDesktopSearchPage { items: UmbraDesktopSearchItem[]; total: number }
export interface UmbraDesktopSearchSource {
  alias: string; label: string; weight: number; prominence: UmbraDesktopSearchProminence;
  search(query: string, paging: UmbraDesktopSearchPaging): Promise<UmbraDesktopSearchPage>;
}
export interface UmbraDesktopSearchSection { source: UmbraDesktopSearchSource; items: UmbraDesktopSearchItem[]; total: number }
export interface UmbraDesktopSearchDrill extends UmbraDesktopSearchSection { loading: boolean }
export interface UmbraDesktopSearchState {
  query: string; apps: UmbraDesktopApp[]; sections: UmbraDesktopSearchSection[];
  folded: UmbraDesktopSearchSection[]; pending: boolean; drill?: UmbraDesktopSearchDrill;
}
```

- Produces (rank-apps.ts): `rankApps(apps: ReadonlyArray<UmbraDesktopApp>, nameOf: (app: UmbraDesktopApp) => string, query: string): UmbraDesktopApp[]`

- [ ] **Step 1: Write the failing test**

`backoffice/src/desktop/search/rank-apps.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { rankApps } from './rank-apps';
import type { UmbraDesktopApp } from '../types';

const app = (name: string) => ({ alias: name, name }) as UmbraDesktopApp;
const names = (apps: UmbraDesktopApp[]) => apps.map((a) => a.name);
const APPS = ['Media library', 'Log Viewer', 'Content editor', 'Logs archive', 'Catalogue'].map(app);

it('puts a name starting with the query first, then a word starting with it, then one containing it', () => {
  expect(names(rankApps(APPS, (a) => a.name, 'log'))).to.deep.equal(['Log Viewer', 'Logs archive', 'Catalogue']);
});

it('matches whatever the case', () => {
  expect(names(rankApps(APPS, (a) => a.name, 'MEDIA'))).to.deep.equal(['Media library']);
});

it('matches on the name it is given, which is the translated one', () => {
  expect(names(rankApps([app('#token')], () => 'Inhoud', 'inh'))).to.deep.equal(['#token']);
});

it('matches nothing for an empty or blank query', () => {
  expect(rankApps(APPS, (a) => a.name, '   ')).to.deep.equal([]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx web-test-runner "src/desktop/search/rank-apps.test.ts" --node-resolve`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`backoffice/src/desktop/search/types.ts`: the types listed under Interfaces, each with a JSDoc line. Header comment:

```ts
/**
 * What every part of desktop search speaks: sources answer queries with pages of items, and the
 * engine folds them into one state a view draws. Kept free of Lit and Umbraco imports so the engine
 * and its tests depend on nothing but these shapes.
 */
import type { UmbraDesktopApp } from '../types';
```

On `UmbraDesktopSearchSource.label`, document that it may be a `#`-prefixed localisation key, so a view passes it through `localize.string`. On `UmbraDesktopSearchOpen`, document that `href` is optional because core's `UmbSearchResultItemModel.href` is.

`backoffice/src/desktop/search/rank-apps.ts`:

```ts
import type { UmbraDesktopApp } from '../types';

/**
 * How well a name matches: 0 when it starts with the query, 1 when one of its words does, 2 when it
 * only contains it, and -1 for no match. The order Windows and macOS rank app names in, so "log"
 * finds Log Viewer before a name that merely has "log" somewhere inside it.
 * @param name The name, lowercased.
 * @param query The query, lowercased and trimmed.
 * @returns The rank.
 */
function rankOf(name: string, query: string): number {
  if (name.startsWith(query)) return 0;
  if (name.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query))) return 1;
  return name.includes(query) ? 2 : -1;
}

/**
 * The apps matching a query, best first and alphabetical within a rank. Local and instant: apps
 * are already in memory, so they show on the first keystroke while the server sources wait for
 * the debounce.
 * @param apps Every app the user may open.
 * @param nameOf The app's translated name, which is what the user sees and types.
 * @param query What was typed.
 * @returns The matching apps, ranked.
 */
export function rankApps(
  apps: ReadonlyArray<UmbraDesktopApp>,
  nameOf: (app: UmbraDesktopApp) => string,
  query: string,
): UmbraDesktopApp[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  return apps
    .map((app) => ({ app, name: nameOf(app), rank: rankOf(nameOf(app).toLocaleLowerCase(), q) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map((entry) => entry.app);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx web-test-runner "src/desktop/search/rank-apps.test.ts" --node-resolve`
Expected: PASS.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 3: Search engine

**Files:**
- Create: `backoffice/src/desktop/search/search-engine.ts`
- Test: `backoffice/src/desktop/search/search-engine.test.ts`

**Interfaces:**
- Consumes: Task 2's types and `rankApps`.
- Produces:
  - `UMBRADESKTOP_SEARCH_DEBOUNCE_MS = 300`
  - `UMBRADESKTOP_SEARCH_TAKE = { apps: 6, full: 5, folded: 1, page: 20 } as const`
  - `UMBRADESKTOP_SEARCH_EMPTY_STATE: UmbraDesktopSearchState`
  - `class UmbraDesktopSearchEngine` with `constructor(options: { nameOf(app: UmbraDesktopApp): string; onChange(state: UmbraDesktopSearchState): void; debounceMs?: number })`, `get state()`, `setApps(apps)`, `setSources(sources)`, `setQuery(query: string)`, `drill(alias: string): Promise<void>`, `more(): Promise<void>`, `closeDrill()`, `dispose()`.

- [ ] **Step 1: Write the failing test**

`backoffice/src/desktop/search/search-engine.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { UmbraDesktopSearchEngine, UMBRADESKTOP_SEARCH_TAKE } from './search-engine';
import type { UmbraDesktopSearchItem, UmbraDesktopSearchPaging, UmbraDesktopSearchSource, UmbraDesktopSearchState } from './types';
import type { UmbraDesktopApp } from '../types';

const item = (name: string): UmbraDesktopSearchItem => ({
  key: name,
  name,
  icon: 'icon-document',
  open: { kind: 'entity', entityType: 'document', unique: name, href: `section/content/workspace/document/edit/${name}` },
});

/** A source over a fixed list of names, recording every call. */
function source(alias: string, prominence: 'full' | 'folded', names: string[], weight = 0) {
  const calls: Array<{ query: string; paging: UmbraDesktopSearchPaging }> = [];
  const src: UmbraDesktopSearchSource = {
    alias,
    label: alias,
    weight,
    prominence,
    async search(query, paging) {
      calls.push({ query, paging });
      const hits = names.filter((n) => n.toLowerCase().includes(query.toLowerCase()));
      return { items: hits.slice(paging.skip, paging.skip + paging.take).map(item), total: hits.length };
    },
  };
  return { src, calls };
}

/** An engine with no debounce, collecting every state it reports. */
function engine(debounceMs = 0) {
  const states: UmbraDesktopSearchState[] = [];
  const e = new UmbraDesktopSearchEngine({ nameOf: (a) => a.name, onChange: (s) => states.push(s), debounceMs });
  return { e, states };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check(), 'condition reached').to.equal(true);
};

it('groups prominent sources into sections and folds the rest into counts', async () => {
  const docs = source('docs', 'full', ['Home', 'Homework'], 10);
  const types = source('types', 'folded', ['Home page', 'Home item', 'Other'], 5);
  const { e } = engine();
  e.setSources([types.src, docs.src]);
  e.setQuery('home');
  await until(() => !e.state.pending);
  expect(e.state.sections.map((s) => [s.source.alias, s.items.map((i) => i.name), s.total])).to.deep.equal([['docs', ['Home', 'Homework'], 2]]);
  expect(e.state.folded.map((s) => [s.source.alias, s.total])).to.deep.equal([['types', 2]]);
  expect(docs.calls[0].paging).to.deep.equal({ skip: 0, take: UMBRADESKTOP_SEARCH_TAKE.full });
  expect(types.calls[0].paging).to.deep.equal({ skip: 0, take: UMBRADESKTOP_SEARCH_TAKE.folded });
});

it('orders sections by the source weight, heaviest first', async () => {
  const a = source('a', 'full', ['x'], 1);
  const b = source('b', 'full', ['x'], 9);
  const { e } = engine();
  e.setSources([a.src, b.src]);
  e.setQuery('x');
  await until(() => !e.state.pending);
  expect(e.state.sections.map((s) => s.source.alias)).to.deep.equal(['b', 'a']);
});

it('leaves out a source that found nothing', async () => {
  const docs = source('docs', 'full', ['Other']);
  const { e } = engine();
  e.setSources([docs.src]);
  e.setQuery('home');
  await until(() => !e.state.pending);
  expect(e.state.sections).to.deep.equal([]);
  expect(e.state.folded).to.deep.equal([]);
});

it('matches apps at once, before the sources answer', () => {
  const { e } = engine(1000);
  e.setApps([{ alias: 'log', name: 'Log Viewer' } as UmbraDesktopApp]);
  e.setQuery('log');
  expect(e.state.apps.map((a) => a.alias)).to.deep.equal(['log']);
  expect(e.state.pending).to.equal(true);
  e.dispose();
});

it('asks the sources once for a burst of typing, with the last text', async () => {
  const docs = source('docs', 'full', ['Home']);
  const { e } = engine(30);
  e.setSources([docs.src]);
  e.setQuery('h');
  e.setQuery('ho');
  e.setQuery('home');
  await until(() => !e.state.pending);
  expect(docs.calls.map((c) => c.query)).to.deep.equal(['home']);
});

it('treats text of only spaces as empty and asks no source', async () => {
  const docs = source('docs', 'full', ['Home']);
  const { e } = engine();
  e.setSources([docs.src]);
  e.setQuery('   ');
  await new Promise((r) => setTimeout(r, 20));
  expect(docs.calls).to.deep.equal([]);
  expect(e.state.query).to.equal('');
});

it('drops an answer to a query that is no longer current', async () => {
  let release!: () => void;
  const slow: UmbraDesktopSearchSource = {
    alias: 'slow',
    label: 'slow',
    weight: 0,
    prominence: 'full',
    search: (query) =>
      query === 'old'
        ? new Promise((resolve) => (release = () => resolve({ items: [item('stale')], total: 1 })))
        : Promise.resolve({ items: [item('fresh')], total: 1 }),
  };
  const { e } = engine();
  e.setSources([slow]);
  e.setQuery('old');
  await new Promise((r) => setTimeout(r, 10));
  e.setQuery('new');
  await until(() => !e.state.pending);
  release();
  await new Promise((r) => setTimeout(r, 10));
  expect(e.state.sections[0].items.map((i) => i.name)).to.deep.equal(['fresh']);
});

it('reports nothing after it is disposed, such as when the launcher closes mid-search', async () => {
  let release!: () => void;
  const slow: UmbraDesktopSearchSource = {
    alias: 'slow',
    label: 'slow',
    weight: 0,
    prominence: 'full',
    search: () => new Promise((resolve) => (release = () => resolve({ items: [item('late')], total: 1 }))),
  };
  const { e, states } = engine();
  e.setSources([slow]);
  e.setQuery('x');
  await new Promise((r) => setTimeout(r, 10));
  const seen = states.length;
  e.dispose();
  release();
  await new Promise((r) => setTimeout(r, 10));
  expect(states.length).to.equal(seen);
});

it('shows the other sources when one fails', async () => {
  const docs = source('docs', 'full', ['Home']);
  const broken: UmbraDesktopSearchSource = { alias: 'broken', label: 'b', weight: 0, prominence: 'full', search: () => Promise.reject(new Error('500')) };
  const { e } = engine();
  e.setSources([broken, docs.src]);
  e.setQuery('home');
  await until(() => !e.state.pending);
  expect(e.state.sections.map((s) => s.source.alias)).to.deep.equal(['docs']);
});

it('drills into one source a page at a time, and asks no more past the end', async () => {
  const names = Array.from({ length: 25 }, (_, i) => `Home ${i}`);
  const docs = source('docs', 'full', names);
  const { e } = engine();
  e.setSources([docs.src]);
  e.setQuery('home');
  await until(() => !e.state.pending);
  await e.drill('docs');
  expect(e.state.drill?.items.length).to.equal(UMBRADESKTOP_SEARCH_TAKE.page);
  expect(e.state.drill?.total).to.equal(25);
  await e.more();
  expect(e.state.drill?.items.length).to.equal(25);
  const calls = docs.calls.length;
  await e.more();
  expect(docs.calls.length).to.equal(calls);
  e.closeDrill();
  expect(e.state.drill).to.equal(undefined);
  expect(e.state.query).to.equal('home');
});

it('leaves the drilled-down list when the text changes', async () => {
  const docs = source('docs', 'full', ['Home', 'House']);
  const { e } = engine();
  e.setSources([docs.src]);
  e.setQuery('ho');
  await until(() => !e.state.pending);
  await e.drill('docs');
  e.setQuery('hou');
  expect(e.state.drill).to.equal(undefined);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx web-test-runner "src/desktop/search/search-engine.test.ts" --node-resolve`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`backoffice/src/desktop/search/search-engine.ts`:

```ts
import type { UmbraDesktopApp } from '../types';
import { rankApps } from './rank-apps';
import type { UmbraDesktopSearchSection, UmbraDesktopSearchSource, UmbraDesktopSearchState } from './types';

/** How long to wait after the last keystroke before asking the server, as the native modal does. */
export const UMBRADESKTOP_SEARCH_DEBOUNCE_MS = 300;

/**
 * How many results to ask for. A full section shows its best few; a folded source needs only its
 * total, which every core source returns beside its items; a drilled-down list loads a page at a
 * time. Small on purpose: every source is asked on each search (design D4).
 */
export const UMBRADESKTOP_SEARCH_TAKE = { apps: 6, full: 5, folded: 1, page: 20 } as const;

/** Nothing typed. */
export const UMBRADESKTOP_SEARCH_EMPTY_STATE: UmbraDesktopSearchState = { query: '', apps: [], sections: [], folded: [], pending: false };

/** What the engine needs from its host. */
export interface UmbraDesktopSearchEngineOptions {
  /**
   * An app's translated name, which is what apps are matched on.
   * @param app The app.
   */
  nameOf(app: UmbraDesktopApp): string;
  /**
   * Called with every new state.
   * @param state The state.
   */
  onChange(state: UmbraDesktopSearchState): void;
  /** Overrides {@link UMBRADESKTOP_SEARCH_DEBOUNCE_MS}, for tests. */
  debounceMs?: number;
}

/**
 * Turns what was typed into what a search view draws: matching apps at once, then each source's
 * results once typing pauses, grouped into full sections and folded counts, plus one source's full
 * list while drilled into.
 *
 * It knows nothing of the launcher, which is what lets a taskbar button or a Search app reuse it
 * (design §8). Every query is numbered, and any answer for a number that is no longer current is
 * dropped, so a slow source can never paint results for text that has since changed, and nothing at
 * all is reported after `dispose`.
 */
export class UmbraDesktopSearchEngine {
  /** Every app the user may open. */
  #apps: ReadonlyArray<UmbraDesktopApp> = [];
  /** The sources, heaviest first. */
  #sources: ReadonlyArray<UmbraDesktopSearchSource> = [];
  /** The current query's number; an answer carrying any other is stale. */
  #generation = 0;
  /** The pending debounce. */
  #timer?: ReturnType<typeof setTimeout>;
  /** The latest state. */
  #state = UMBRADESKTOP_SEARCH_EMPTY_STATE;
  /** The host's callbacks. */
  #options: UmbraDesktopSearchEngineOptions;
  /** True once disposed. */
  #disposed = false;

  /**
   * @param options What the engine needs from its host.
   */
  constructor(options: UmbraDesktopSearchEngineOptions) {
    this.#options = options;
  }

  /** @returns The latest state. */
  get state(): UmbraDesktopSearchState {
    return this.#state;
  }

  /**
   * Replace the apps, re-matching the current query against them.
   * @param apps Every app the user may open.
   */
  setApps(apps: ReadonlyArray<UmbraDesktopApp>): void {
    this.#apps = apps;
    if (this.#state.query) this.#emit({ ...this.#state, apps: this.#matchApps(this.#state.query) });
  }

  /**
   * Replace the sources, asking the new ones about the current query. Sources arrive after the
   * launcher opens, because their apis are created asynchronously.
   * @param sources The permitted sources.
   */
  setSources(sources: ReadonlyArray<UmbraDesktopSearchSource>): void {
    this.#sources = [...sources].sort((a, b) => b.weight - a.weight);
    if (!this.#state.query) return;
    this.#generation++;
    this.#emit({ ...this.#state, pending: true, drill: undefined });
    this.#schedule(this.#state.query);
  }

  /**
   * Search for new text. Blank text is no search at all.
   * @param query What was typed.
   */
  setQuery(query: string): void {
    const trimmed = query.trim();
    this.#generation++;
    clearTimeout(this.#timer);
    if (!trimmed) {
      this.#emit(UMBRADESKTOP_SEARCH_EMPTY_STATE);
      return;
    }
    // The previous results stay while the new ones load, so the list does not flash empty on every
    // keystroke.
    this.#emit({ ...this.#state, query: trimmed, apps: this.#matchApps(trimmed), pending: true, drill: undefined });
    this.#schedule(trimmed);
  }

  /**
   * Show one source's full list, from its first page.
   * @param alias The source's alias.
   */
  async drill(alias: string): Promise<void> {
    const source = this.#sources.find((s) => s.alias === alias);
    if (!source || !this.#state.query) return;
    const known = [...this.#state.sections, ...this.#state.folded].find((s) => s.source === source);
    this.#emit({ ...this.#state, drill: { source, items: [], total: known?.total ?? 0, loading: true } });
    await this.#loadPage(source, this.#generation, 0);
  }

  /** Load the drilled-down list's next page; nothing when it is loading or complete. */
  async more(): Promise<void> {
    const drill = this.#state.drill;
    if (!drill || drill.loading || drill.items.length >= drill.total) return;
    this.#emit({ ...this.#state, drill: { ...drill, loading: true } });
    await this.#loadPage(drill.source, this.#generation, drill.items.length);
  }

  /** Back from the drilled-down list to the mixed results, the text kept. */
  closeDrill(): void {
    if (this.#state.drill) this.#emit({ ...this.#state, drill: undefined });
  }

  /** Stop: no timer fires and no late answer is reported. */
  dispose(): void {
    this.#disposed = true;
    this.#generation++;
    clearTimeout(this.#timer);
  }

  /**
   * The apps for a query, capped.
   * @param query The trimmed query.
   * @returns The best apps.
   */
  #matchApps(query: string): UmbraDesktopApp[] {
    return rankApps(this.#apps, this.#options.nameOf, query).slice(0, UMBRADESKTOP_SEARCH_TAKE.apps);
  }

  /**
   * Ask the sources once typing has paused.
   * @param query The trimmed query.
   */
  #schedule(query: string): void {
    clearTimeout(this.#timer);
    const generation = this.#generation;
    this.#timer = setTimeout(() => void this.#run(query, generation), this.#options.debounceMs ?? UMBRADESKTOP_SEARCH_DEBOUNCE_MS);
  }

  /**
   * Ask every source at once, each for its own take. A source that throws or reports an error is
   * left out; the rest still show (design §6).
   * @param query The trimmed query.
   * @param generation The query's number.
   */
  async #run(query: string, generation: number): Promise<void> {
    const answers = await Promise.all(
      this.#sources.map(async (source): Promise<UmbraDesktopSearchSection | undefined> => {
        const take = source.prominence === 'full' ? UMBRADESKTOP_SEARCH_TAKE.full : UMBRADESKTOP_SEARCH_TAKE.folded;
        try {
          const page = await source.search(query, { skip: 0, take });
          return { source, items: page.items, total: page.total };
        } catch {
          return undefined;
        }
      }),
    );
    if (generation !== this.#generation) return;
    const found = answers.filter((a): a is UmbraDesktopSearchSection => !!a && a.total > 0);
    this.#emit({
      ...this.#state,
      sections: found.filter((a) => a.source.prominence === 'full'),
      folded: found.filter((a) => a.source.prominence === 'folded').map((a) => ({ ...a, items: [] })),
      pending: false,
    });
  }

  /**
   * Append one page to the drilled-down list. A failed page ends the list where it is, rather than
   * leaving it loading forever.
   * @param source The drilled-into source.
   * @param generation The query's number when the page was asked for.
   * @param skip How many items are already shown.
   */
  async #loadPage(source: UmbraDesktopSearchSource, generation: number, skip: number): Promise<void> {
    let page;
    try {
      page = await source.search(this.#state.query, { skip, take: UMBRADESKTOP_SEARCH_TAKE.page });
    } catch {
      page = undefined;
    }
    const drill = this.#state.drill;
    if (generation !== this.#generation || drill?.source !== source) return;
    this.#emit({
      ...this.#state,
      drill: page
        ? { source, items: [...drill.items, ...page.items], total: page.total, loading: false }
        : { ...drill, total: drill.items.length, loading: false },
    });
  }

  /**
   * Store and report a state, unless disposed.
   * @param state The new state.
   */
  #emit(state: UmbraDesktopSearchState): void {
    if (this.#disposed) return;
    this.#state = state;
    this.#options.onChange(state);
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx web-test-runner "src/desktop/search/search-engine.test.ts" --node-resolve`
Expected: PASS.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 4: Umbraco and Help sources

**Files:**
- Create: `backoffice/src/desktop/search/umbraco-sources.ts`
- Create: `backoffice/src/desktop/search/help-source.ts`
- Create: `backoffice/src/desktop/help/help-registry.ts`
- Modify: `backoffice/src/desktop/help/help.element.ts` (remove `printed` and `loadFromRegistry`, import the moved function)
- Test: `backoffice/src/desktop/search/umbraco-sources.test.ts`, `backoffice/src/desktop/search/help-source.test.ts`

**Interfaces:**
- Consumes: Task 2's types; `searchHelp` from `help/help-search.ts`; `formatHelpTarget` from `help/help-target.ts`; `buildHelpProduct` from `help/help-product.ts` (tests only).
- Produces:
  - `UMBRADESKTOP_FULL_SEARCH_ALIASES: ReadonlyArray<string>` = `['Umb.GlobalSearch.Document', 'Umb.GlobalSearch.Media']`
  - `interface UmbraDesktopRawSearchItem` (core's item shape, loosely typed)
  - `toSearchItem(raw: UmbraDesktopRawSearchItem, culture?: string): UmbraDesktopSearchItem`
  - `interface UmbraDesktopGlobalSearchManifest { alias: string; weight?: number; meta: { label: string; searchProviderAlias: string } }`
  - `interface UmbraDesktopSearchProviderApi { search(args: { query: string; paging: UmbraDesktopSearchPaging; culture?: string }): Promise<{ data?: { items: UmbraDesktopRawSearchItem[]; total: number }; error?: unknown }> }`
  - `umbracoSearchSource(manifest: UmbraDesktopGlobalSearchManifest, provider: UmbraDesktopSearchProviderApi, culture: () => string | undefined): UmbraDesktopSearchSource`
  - `UMBRADESKTOP_HELP_SEARCH_ALIAS = 'umbraDesktop.search.help'`
  - `helpSearchSource(load: () => Promise<ReadonlyArray<UmbraDesktopHelpProduct>>): UmbraDesktopSearchSource`
  - `loadHelpProductsFromRegistry(host: UmbControllerHost): Promise<UmbraDesktopHelpProduct[]>`

- [ ] **Step 1: Write the failing tests**

`backoffice/src/desktop/search/umbraco-sources.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { toSearchItem, umbracoSearchSource } from './umbraco-sources';
import type { UmbraDesktopSearchProviderApi } from './umbraco-sources';

const KEY = 'aaaaaaaa-1111-2222-3333-444444444444';

it('names a variant document in the current culture', () => {
  const item = toSearchItem(
    { unique: KEY, entityType: 'document', name: 'Home', variants: [{ culture: 'en-US', name: 'Home' }, { culture: 'nl-NL', name: 'Thuis' }] },
    'nl-NL',
  );
  expect(item.name).to.equal('Thuis');
});

it('falls back to the invariant, then the given name, then the first variant, never a blank row', () => {
  expect(toSearchItem({ unique: KEY, entityType: 'document', variants: [{ culture: null, name: 'Invariant' }] }, 'da-DK').name).to.equal('Invariant');
  expect(toSearchItem({ unique: KEY, entityType: 'document', name: 'Given', variants: [{ culture: 'en-US', name: 'English' }] }, 'da-DK').name).to.equal('Given');
  expect(toSearchItem({ unique: KEY, entityType: 'document', variants: [{ culture: 'en-US', name: 'English' }] }, 'da-DK').name).to.equal('English');
  expect(toSearchItem({ unique: KEY, entityType: 'document', variants: [{ culture: 'en-US', name: '' }] }, 'da-DK').name).to.equal(KEY);
});

it('shows where a document lives from its ancestors', () => {
  const item = toSearchItem({ unique: KEY, entityType: 'document', name: 'Post', ancestors: [{ name: 'Home' }, { variants: [{ culture: 'en-US', name: 'News' }] }] }, 'en-US');
  expect(item.detail).to.equal('Home › News');
});

it("takes the icon from the item, else its document or media type's", () => {
  expect(toSearchItem({ unique: KEY, entityType: 'data-type', icon: 'icon-autofill' }).icon).to.equal('icon-autofill');
  expect(toSearchItem({ unique: KEY, entityType: 'document', documentType: { icon: 'icon-home' } }).icon).to.equal('icon-home');
  expect(toSearchItem({ unique: KEY, entityType: 'media', mediaType: { icon: 'icon-picture' } }).icon).to.equal('icon-picture');
});

it('keeps the href for opening, keyed by entity type and key', () => {
  const item = toSearchItem({ unique: KEY, entityType: 'media', name: 'Logo', href: `section/media/workspace/media/edit/${KEY}` });
  expect(item.key).to.equal(`media:${KEY}`);
  expect(item.open).to.deep.equal({ kind: 'entity', entityType: 'media', unique: KEY, href: `section/media/workspace/media/edit/${KEY}` });
});

it('asks the provider for the page and culture, and is full only for documents and media', async () => {
  const seen: unknown[] = [];
  const provider: UmbraDesktopSearchProviderApi = {
    search: async (args) => {
      seen.push(args);
      return { data: { items: [{ unique: KEY, entityType: 'document', name: 'Home' }], total: 7 } };
    },
  };
  const docs = umbracoSearchSource({ alias: 'Umb.GlobalSearch.Document', weight: 800, meta: { label: 'Documents', searchProviderAlias: 'p' } }, provider, () => 'en-US');
  const types = umbracoSearchSource({ alias: 'Umb.GlobalSearch.DataType', meta: { label: 'Data Types', searchProviderAlias: 'p' } }, provider, () => undefined);
  expect([docs.prominence, docs.weight, docs.label]).to.deep.equal(['full', 800, 'Documents']);
  expect([types.prominence, types.weight]).to.deep.equal(['folded', 0]);
  const page = await docs.search('home', { skip: 0, take: 5 });
  expect(seen[0]).to.deep.equal({ query: 'home', paging: { skip: 0, take: 5 }, culture: 'en-US' });
  expect(page.total).to.equal(7);
  expect(page.items.map((i) => i.name)).to.deep.equal(['Home']);
});

it('turns a provider error into a throw, which the engine treats as a failed source', async () => {
  const provider: UmbraDesktopSearchProviderApi = { search: async () => ({ error: new Error('403') }) };
  const src = umbracoSearchSource({ alias: 'x', meta: { label: 'X', searchProviderAlias: 'p' } }, provider, () => undefined);
  let threw = false;
  await src.search('a', { skip: 0, take: 1 }).catch(() => (threw = true));
  expect(threw).to.equal(true);
});
```

`backoffice/src/desktop/search/help-source.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { helpSearchSource } from './help-source';
import { buildHelpProduct } from '../help/help-product';
import type { UmbraDesktopHelpProduct } from '../help/help-product';

/** A product with two user-guide pages, built the way the loader builds one. */
function product(): UmbraDesktopHelpProduct {
  const files = new Map<string, string>([
    ['product.json', JSON.stringify({ id: 'umbradesktop', name: 'UmbraDesktop' })],
    ['user/README.md', '---\nid: user\ntitle: User guide\n---\n\n# User guide\n'],
    ['user/snapping.md', '---\nid: snapping\ntitle: Snapping windows\n---\n\n# Snapping windows\n\nDrag a window to an edge.\n\n## Snap layouts\n\nPick a layout.\n'],
    ['user/themes.md', '---\nid: themes\ntitle: Themes\n---\n\n# Themes\n\nPick a theme.\n'],
  ]);
  return buildHelpProduct('/docs', files)!;
}

it('is a folded source that opens Help on the page and heading found', async () => {
  const src = helpSearchSource(async () => [product()]);
  expect(src.prominence).to.equal('folded');
  const page = await src.search('snap', { skip: 0, take: 10 });
  expect(page.total).to.be.greaterThan(0);
  expect(page.items[0].open.kind).to.equal('help');
  expect((page.items[0].open as { target: string }).target.startsWith('umbradesktop/snapping')).to.equal(true);
});

it('pages through its results and reports the full count', async () => {
  const src = helpSearchSource(async () => [product()]);
  const all = await src.search('pick', { skip: 0, take: 10 });
  const first = await src.search('pick', { skip: 0, take: 1 });
  expect(first.total).to.equal(all.total);
  expect(first.items.length).to.equal(1);
});

it('loads the docs once, on the first search', async () => {
  let loads = 0;
  const src = helpSearchSource(async () => {
    loads++;
    return [product()];
  });
  await src.search('snap', { skip: 0, take: 1 });
  await src.search('theme', { skip: 0, take: 1 });
  expect(loads).to.equal(1);
});
```

If `buildHelpProduct`'s page rules differ from these fixtures (front matter, README requirements), adjust the fixture files to match `help/help-product.test.ts`'s own fixtures rather than changing the product builder.

- [ ] **Step 2: Run them and see them fail**

Run: `npx web-test-runner "src/desktop/search/umbraco-sources.test.ts" "src/desktop/search/help-source.test.ts" --node-resolve`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `umbraco-sources.ts`**

```ts
import type { UmbraDesktopSearchItem, UmbraDesktopSearchPaging, UmbraDesktopSearchSource } from './types';

/**
 * Adapts core's search providers to desktop search sources. The provider is called directly with a
 * page size, not through the `globalSearch` api, whose `search` passes only the query, so the
 * server's default of 100 would apply to every source on every search (design D4). Calling the
 * document global search's api would also wait forever for a `UMB_VARIANT_CONTEXT` the desktop's
 * top frame never provides.
 */

/** The two sources drawn as full sections; every other is folded (design D2). */
export const UMBRADESKTOP_FULL_SEARCH_ALIASES: ReadonlyArray<string> = ['Umb.GlobalSearch.Document', 'Umb.GlobalSearch.Media'];

/** One culture's name, as core's document and media items carry them. */
interface UmbraDesktopRawVariant {
  /** The culture, or null when invariant. */
  culture?: string | null;
  /** The name in it. */
  name?: string;
}

/**
 * A result as core's providers return it: `UmbSearchResultItemModel` plus the fields documents and
 * media add. Loosely typed, because a third-party provider may return any subset.
 */
export interface UmbraDesktopRawSearchItem {
  /** The key. */
  unique: string;
  /** The entity type. */
  entityType: string;
  /** The name; for documents, core's own comment says it is only the first variant's. */
  name?: string;
  /** The icon, when the item has one of its own. */
  icon?: string | null;
  /** Where it opens, relative to the backoffice. */
  href?: string;
  /** Documents and media: the name per culture. */
  variants?: UmbraDesktopRawVariant[];
  /** Documents: the ancestors, root first. */
  ancestors?: Array<{ name?: string; variants?: UmbraDesktopRawVariant[] }>;
  /** Documents: the type, for its icon. */
  documentType?: { icon?: string | null };
  /** Media: the type, for its icon. */
  mediaType?: { icon?: string | null };
}

/**
 * A name in the current culture: that culture's variant, else the invariant one, else the name the
 * item gave, else any variant's. A variant site shows the editor's own language, as the native
 * search's result element does, rather than whichever culture happens to be first.
 * @param item Something with a name and maybe variants.
 * @param culture The current culture.
 * @returns The name, or undefined when there is none at all.
 */
function nameIn(item: { name?: string; variants?: UmbraDesktopRawVariant[] }, culture?: string): string | undefined {
  const variants = item.variants ?? [];
  return (
    (culture ? variants.find((v) => v.culture === culture)?.name : undefined) ||
    variants.find((v) => !v.culture)?.name ||
    item.name ||
    variants.find((v) => v.name)?.name ||
    undefined
  );
}

/**
 * One raw result as a search item. A result with no name anywhere shows its key rather than an
 * empty row.
 * @param raw What the provider returned.
 * @param culture The current culture.
 * @returns The item.
 */
export function toSearchItem(raw: UmbraDesktopRawSearchItem, culture?: string): UmbraDesktopSearchItem {
  const ancestors = (raw.ancestors ?? []).map((a) => nameIn(a, culture)).filter((n): n is string => !!n);
  return {
    key: `${raw.entityType}:${raw.unique}`,
    name: nameIn(raw, culture) || raw.unique,
    icon: raw.icon || raw.documentType?.icon || raw.mediaType?.icon || 'icon-document',
    detail: ancestors.length ? ancestors.join(' › ') : undefined,
    open: { kind: 'entity', entityType: raw.entityType, unique: raw.unique, href: raw.href },
  };
}

/** The fields of a `globalSearch` manifest a source is built from. */
export interface UmbraDesktopGlobalSearchManifest {
  /** The manifest's alias, which becomes the source's. */
  alias: string;
  /** Its weight; heavier sources come first, as in the native modal's tabs. */
  weight?: number;
  /** Its label and the provider it searches with. */
  meta: { label: string; searchProviderAlias: string };
}

/** Core's `UmbSearchProvider`, as far as a source calls it. */
export interface UmbraDesktopSearchProviderApi {
  /**
   * Search one page.
   * @param args The query, the page and the culture; providers ignore what they do not use.
   */
  search(args: {
    query: string;
    paging: UmbraDesktopSearchPaging;
    culture?: string;
  }): Promise<{ data?: { items: UmbraDesktopRawSearchItem[]; total: number }; error?: unknown }>;
}

/**
 * A source over one core provider. The culture is read on each search, so a language switch while
 * the desktop is open applies to the next search.
 * @param manifest The `globalSearch` manifest.
 * @param provider Its provider's api.
 * @param culture The current culture.
 * @returns The source.
 */
export function umbracoSearchSource(
  manifest: UmbraDesktopGlobalSearchManifest,
  provider: UmbraDesktopSearchProviderApi,
  culture: () => string | undefined,
): UmbraDesktopSearchSource {
  return {
    alias: manifest.alias,
    label: manifest.meta.label,
    weight: manifest.weight ?? 0,
    prominence: UMBRADESKTOP_FULL_SEARCH_ALIASES.includes(manifest.alias) ? 'full' : 'folded',
    async search(query, paging) {
      const current = culture();
      const { data, error } = await provider.search({ query, paging, culture: current });
      if (error || !data) throw error ?? new Error(`${manifest.alias} returned no results object`);
      return { items: data.items.map((item) => toSearchItem(item, current)), total: data.total };
    },
  };
}
```

- [ ] **Step 4: Implement `help-source.ts`**

```ts
import { searchHelp } from '../help/help-search';
import { formatHelpTarget } from '../help/help-target';
import type { UmbraDesktopHelpProduct } from '../help/help-product';
import type { UmbraDesktopSearchSource } from './types';

/** The Help source's alias. */
export const UMBRADESKTOP_HELP_SEARCH_ALIAS = 'umbraDesktop.search.help';

/**
 * Help's docs search as a folded source (design D5), over every product's user guide: the
 * developer guide is not what someone searching from the launcher is after. The docs load on the
 * first search rather than when the desktop opens, and only once; a failed load stays failed for
 * the session, which leaves Help out of "Also in" rather than retrying on every keystroke.
 * @param load Loads the installed products' docs.
 * @returns The source.
 */
export function helpSearchSource(load: () => Promise<ReadonlyArray<UmbraDesktopHelpProduct>>): UmbraDesktopSearchSource {
  let products: Promise<ReadonlyArray<UmbraDesktopHelpProduct>> | undefined;
  return {
    alias: UMBRADESKTOP_HELP_SEARCH_ALIAS,
    label: '#umbraDesktop_searchHelp',
    // After every core source, whatever weight a package gives its own.
    weight: Number.MIN_SAFE_INTEGER,
    prominence: 'folded',
    async search(query, { skip, take }) {
      products ??= load();
      const found = (await products).flatMap((product) =>
        searchHelp(product, query, { part: 'user', limit: Number.MAX_SAFE_INTEGER }).map((result) => ({ product, result })),
      );
      return {
        total: found.length,
        items: found.slice(skip, skip + take).map(({ product, result }) => {
          const target = formatHelpTarget({ product: product.id, page: result.page.id, heading: result.heading?.anchor });
          return {
            key: `help:${target}`,
            name: result.heading ? `${result.page.title} › ${result.heading.text}` : result.page.title,
            icon: 'icon-help-alt',
            detail: result.snippet,
            open: { kind: 'help', target },
          };
        }),
      };
    },
  };
}
```

- [ ] **Step 5: Move the Help loader**

Create `backoffice/src/desktop/help/help-registry.ts` holding `printed` and the body of `loadFromRegistry` from `help.element.ts` (lines around 20–56), renamed and typed to a controller host:

```ts
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { normaliseDocsManifests } from './docs-sources';
import { loadHelpProducts, serverDocsFetcher } from './help-loader';
import type { UmbraDesktopHelpProduct } from './help-product';

/** Console lines already printed this visit, so reopening Help, or searching it, does not repeat them. */
const printed = new Set<string>();

/**
 * Loads the products registered through `umbraDesktopDocs`, the only route there is (Help design
 * D3). Resolves on the registry's first answer: docs manifests arrive with their packages' bundles,
 * which are loaded before anyone can open the desktop, so there is no later answer worth waiting for.
 * Shared by the Help app and by desktop search's Help source.
 * @param host The controller that owns the initializer and the requests.
 * @returns The products, in picker order.
 */
export async function loadHelpProductsFromRegistry(host: UmbControllerHost): Promise<UmbraDesktopHelpProduct[]> {
  const manifests = await new Promise<unknown[]>((resolve) => {
    new UmbExtensionsManifestInitializer(
      host,
      umbExtensionsRegistry,
      'umbraDesktopDocs',
      null,
      (permitted) => resolve(permitted.map((controller) => controller.manifest)),
      'umbraDesktopHelpDocs',
    );
  });
  const { sources, reports } = normaliseDocsManifests(manifests, window.location.origin);
  const loaded = await loadHelpProducts(sources, serverDocsFetcher(host));
  for (const report of [...reports, ...loaded.reports]) {
    if (printed.has(report.key)) continue;
    printed.add(report.key);
    console.warn(report.message);
  }
  return loaded.products;
}
```

In `help.element.ts`: delete `printed` and `loadFromRegistry`, replace each `loadFromRegistry(` call with `loadHelpProductsFromRegistry(`, import it from `./help-registry`, and drop the now-unused imports (`UmbExtensionsManifestInitializer`, `umbExtensionsRegistry`, `normaliseDocsManifests`, `loadHelpProducts`, `serverDocsFetcher`) if nothing else in the file uses them. `tsc`'s `noUnusedLocals` will say which. Check `serverDocsFetcher`'s parameter type; if it takes `UmbControllerHost` already, nothing else changes.

- [ ] **Step 6: Run the tests and see them pass**

Run: `npx web-test-runner "src/desktop/search/umbraco-sources.test.ts" "src/desktop/search/help-source.test.ts" "src/desktop/help/help.element.test.ts" --node-resolve`
Expected: PASS.

- [ ] **Step 7: Leave uncommitted.**

---

### Task 5: Search context, provided by the desktop

**Files:**
- Create: `backoffice/src/desktop/search/search.context-token.ts`
- Create: `backoffice/src/desktop/search/search.context.ts`
- Modify: `backoffice/src/desktop/components/desktop.element.ts` (beside `new UmbraDesktopHelpContext`, line ~182)
- Test: `backoffice/src/desktop/search/search.context.test.ts`

**Interfaces:**
- Consumes: Task 4's `umbracoSearchSource`, `helpSearchSource`, `loadHelpProductsFromRegistry`, `UMBRADESKTOP_HELP_SEARCH_ALIAS`.
- Produces: `UMBRADESKTOP_SEARCH_CONTEXT: UmbContextToken<UmbraDesktopSearchContext>`; `class UmbraDesktopSearchContext extends UmbContextBase` with `readonly sources: Observable<ReadonlyArray<UmbraDesktopSearchSource>>`.

- [ ] **Step 1: Write the failing test**

`backoffice/src/desktop/search/search.context.test.ts`:

```ts
import { expect, fixture, html } from '@open-wc/testing';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopSearchContext } from './search.context';
import { UMBRADESKTOP_HELP_SEARCH_ALIAS } from './help-source';
import type { UmbraDesktopSearchSource } from './types';

/** A provider api that answers every search with one item. */
class FakeProvider {
  /** @param _host The host core passes. */
  constructor(_host: unknown) {}
  /** @returns One document. */
  async search() {
    return { data: { items: [{ unique: 'k', entityType: 'document', name: 'Found' }], total: 1 } };
  }
  /** Core calls this on every api. */
  destroy() {}
}

/** A bare host for the context. */
@customElement('umbradesktop-search-context-host')
class SearchContextHost extends UmbLitElement {}

it('turns each permitted global search into a source, Help last', async () => {
  umbExtensionsRegistry.register({ type: 'searchProvider', alias: 'Test.SearchProvider', name: 'Test', api: FakeProvider } as never);
  umbExtensionsRegistry.register({ type: 'globalSearch', alias: 'Test.GlobalSearch', name: 'Test', weight: 5, meta: { label: 'Things', searchProviderAlias: 'Test.SearchProvider' } } as never);
  try {
    const host = await fixture<SearchContextHost>(html`<umbradesktop-search-context-host></umbradesktop-search-context-host>`);
    const context = new UmbraDesktopSearchContext(host);
    let sources: ReadonlyArray<UmbraDesktopSearchSource> = [];
    context.sources.subscribe((s) => (sources = s));
    for (let i = 0; i < 100 && !sources.some((s) => s.alias === 'Test.GlobalSearch'); i++) await new Promise((r) => setTimeout(r, 10));
    const test = sources.find((s) => s.alias === 'Test.GlobalSearch');
    expect(!!test, 'the test source appeared').to.equal(true);
    expect(sources[sources.length - 1].alias).to.equal(UMBRADESKTOP_HELP_SEARCH_ALIAS);
    const page = await test!.search('f', { skip: 0, take: 5 });
    expect(page.items.map((i) => i.name)).to.deep.equal(['Found']);
  } finally {
    umbExtensionsRegistry.unregister('Test.GlobalSearch');
    umbExtensionsRegistry.unregister('Test.SearchProvider');
  }
});
```

If core's registry rejects a class as `api` in this test environment, register `api: () => Promise.resolve({ default: FakeProvider })` instead; `createExtensionApiByAlias` accepts both.

- [ ] **Step 2: Run it and see it fail**

Run: `npx web-test-runner "src/desktop/search/search.context.test.ts" --node-resolve`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`search.context-token.ts`:

```ts
import type { UmbraDesktopSearchContext } from './search.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** The desktop's search sources, for the launcher's search and anything that searches later (design §8). */
export const UMBRADESKTOP_SEARCH_CONTEXT = new UmbContextToken<UmbraDesktopSearchContext>('UmbraDesktopSearchContext');
```

`search.context.ts`:

```ts
import { UMBRADESKTOP_SEARCH_CONTEXT } from './search.context-token';
import { helpSearchSource } from './help-source';
import { umbracoSearchSource } from './umbraco-sources';
import type { UmbraDesktopGlobalSearchManifest, UmbraDesktopSearchProviderApi } from './umbraco-sources';
import type { UmbraDesktopSearchSource } from './types';
import { loadHelpProductsFromRegistry } from '../help/help-registry';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { createExtensionApiByAlias, umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_APP_LANGUAGE_CONTEXT } from '@umbraco-cms/backoffice/language';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The sources desktop search asks, for as long as the desktop is open. Lives on the desktop rather
 * than in the launcher because the launcher is unmounted every time it closes, and creating every
 * provider's api on each open would be work repeated for nothing.
 *
 * The sources are core's `globalSearch` registrations (design D3): the section-permission conditions
 * are on those manifests, not on the providers, so the initializer's permitted list is exactly what
 * the native modal would offer this user, third-party sources included. Help is added last.
 */
export class UmbraDesktopSearchContext extends UmbContextBase {
  /** The current sources. */
  #sources = new UmbArrayState<UmbraDesktopSearchSource>([], (source) => source.alias);

  /** The current sources, Help last. */
  public readonly sources = this.#sources.asObservable();

  /** Help's source, built once so its loaded docs survive a rebuild of the others. */
  #help = helpSearchSource(() => loadHelpProductsFromRegistry(this));

  /** Provider apis by alias, created once each; a rebuild must not create them again. */
  #providers = new Map<string, Promise<UmbraDesktopSearchProviderApi>>();

  /** The app language context, for the culture documents and media are searched in. */
  #appLanguage?: typeof UMB_APP_LANGUAGE_CONTEXT.TYPE;

  /** The latest rebuild's number, so an older one finishing late cannot overwrite it. */
  #build = 0;

  /**
   * @param host The desktop.
   */
  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_SEARCH_CONTEXT);
    this.#sources.setValue([this.#help]);
    this.consumeContext(UMB_APP_LANGUAGE_CONTEXT, (context) => (this.#appLanguage = context ?? undefined));
    new UmbExtensionsManifestInitializer(
      this,
      umbExtensionsRegistry,
      'globalSearch',
      null,
      (permitted) => void this.#rebuild(permitted.map((controller) => controller.manifest as unknown as UmbraDesktopGlobalSearchManifest)),
      'umbraDesktopSearchSources',
    );
  }

  /**
   * Build a source per permitted manifest. A provider that cannot be created is left out, and the
   * rest still search.
   * @param manifests The permitted `globalSearch` manifests.
   */
  async #rebuild(manifests: ReadonlyArray<UmbraDesktopGlobalSearchManifest>): Promise<void> {
    const build = ++this.#build;
    const built = await Promise.all(
      manifests.map(async (manifest) => {
        try {
          const provider = await this.#provider(manifest.meta.searchProviderAlias);
          return umbracoSearchSource(manifest, provider, () => this.#appLanguage?.getAppCulture());
        } catch {
          return undefined;
        }
      }),
    );
    if (build !== this.#build) return;
    this.#sources.setValue([...built.filter((s): s is UmbraDesktopSearchSource => !!s), this.#help]);
  }

  /**
   * One provider's api, created on first use.
   * @param alias The `searchProvider` manifest's alias.
   * @returns The api.
   */
  #provider(alias: string): Promise<UmbraDesktopSearchProviderApi> {
    let provider = this.#providers.get(alias);
    if (!provider) {
      provider = createExtensionApiByAlias<UmbraDesktopSearchProviderApi & { destroy(): void }>(this, alias);
      // A failure is not cached, so a provider whose bundle loads later can still be created.
      provider.catch(() => this.#providers.delete(alias));
      this.#providers.set(alias, provider);
    }
    return provider;
  }
}
```

If `createExtensionApiByAlias`'s type parameter is constrained to `UmbApi`, the intersection with `{ destroy(): void }` satisfies it; adjust the cast if `tsc` disagrees rather than loosening to `any`.

In `desktop.element.ts`, after the Help context line:

```ts
    // The sources the launcher's search asks (launcher search design §5.1). Provided here, for the
    // desktop's lifetime, because the launcher is unmounted on every close.
    new UmbraDesktopSearchContext(this);
```

with `import { UmbraDesktopSearchContext } from '../search/search.context.js';`.

- [ ] **Step 4: Run it and the desktop's own tests**

Run: `npx web-test-runner "src/desktop/search/search.context.test.ts" "src/desktop/components/desktop-boot.test.ts" --node-resolve`
Expected: PASS.

- [ ] **Step 5: Leave uncommitted.**

---

### Task 6: The search field and mixed results in the launcher

**Files:**
- Create: `backoffice/src/desktop/launcher/search.controller.ts`
- Modify: `backoffice/src/desktop/components/launcher.element.ts`
- Modify: `backoffice/src/desktop/launcher/drag-scroller.ts`
- Modify: `backoffice/src/desktop/components/taskbar.element.ts`
- Modify: `backoffice/src/desktop/localization/en.ts`, `nl.ts`
- Modify: `backoffice/src/desktop/components/launcher.test-helper.ts`
- Modify: `backoffice/src/desktop/components/launcher-events.test.ts`
- Modify: `backoffice/src/desktop/theme/themes/launcher-geometry.test.ts`
- Test: `backoffice/src/desktop/components/launcher-search.test.ts`

**Interfaces:**
- Consumes: Task 1 (`sectionUrlFromHref`, `findEntityWindow`, `entityWindowApp`), Task 2 types, Task 3 engine, Task 5 token, `UMBRADESKTOP_HELP_CONTEXT`.
- Produces: `class UmbraDesktopSearchController` with `constructor(host: UmbLitElement, actions: UmbraDesktopSearchActions, debounceMs?: number)`, `get active()`, `get drilled()`, `setApps`, `setSources`, `input(value)`, `clear()`, `closeDrill()`, `focusField()`, `renderField()`, `render()`, `afterRender()`, `dispose()`; `searchStyles`. Launcher mode `'search'`. Mount helper option `searchSources`, `debounceMs` and results `helpOpened`, `focused`.

- [ ] **Step 1: Extend the mount helper**

In `launcher.test-helper.ts`:
- Options: add `searchSources?: UmbraDesktopSearchSource[]`, `windows?: UmbraDesktopWindow[]`, `subjects?: Record<string, UmbraDesktopWorkspaceSubject[]>`, and `searchDebounceMs?: number` (each with a JSDoc line).
- Mount result: add `helpOpened: string[]` and `focused: string[]`.
- Provide two more contexts on the wrapper, before the launcher is created:

```ts
  const sources = new UmbArrayState<UmbraDesktopSearchSource>(options.searchSources ?? [], (s) => s.alias);
  new UmbContextProvider(wrapper, UMBRADESKTOP_SEARCH_CONTEXT, {
    sources: sources.asObservable(),
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const helpOpened: string[] = [];
  new UmbContextProvider(wrapper, UMBRADESKTOP_HELP_CONTEXT, {
    open: (target: string) => helpOpened.push(target) > 0,
    getHostElement: () => wrapper,
  } as never).hostConnected();
```

- Extend the window manager stand-in:

```ts
  const focused: string[] = [];
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, {
    open: (app: UmbraDesktopApp) => launched.push(app),
    focus: (id: string) => focused.push(id),
    getWindows: () => options.windows ?? [],
    subjectsOf: (id: string) => options.subjects?.[id] ?? [],
    getHostElement: () => wrapper,
  } as never).hostConnected();
```

- Set the debounce before the first render: `if (options.searchDebounceMs !== undefined) launcher.searchDebounceMs = options.searchDebounceMs;` right after `createElement`, and add to the launcher a public `searchDebounceMs` property (Step 4).

- [ ] **Step 2: Write the failing tests**

`backoffice/src/desktop/components/launcher-search.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { mountLauncher, stubApp } from './launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';
import type { UmbraDesktopSearchItem, UmbraDesktopSearchSource } from '../search/types.js';
import type { UmbraDesktopWindow, UmbraDesktopApp } from '../types.js';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher.js';

const KEY = 'aaaaaaaa-1111-2222-3333-444444444444';

const doc = (name: string, unique = name, href: string | undefined = `section/content/workspace/document/edit/${unique}`): UmbraDesktopSearchItem => ({
  key: `document:${unique}`,
  name,
  icon: 'icon-document',
  detail: 'Home › News',
  open: { kind: 'entity', entityType: 'document', unique, href },
});

/** A source answering every query with the given items. */
const fixed = (alias: string, prominence: 'full' | 'folded', items: UmbraDesktopSearchItem[], weight = 0, total = items.length): UmbraDesktopSearchSource => ({
  alias,
  label: alias,
  weight,
  prominence,
  search: async (_q, paging) => ({ items: items.slice(paging.skip, paging.skip + paging.take), total }),
});

/** Type into the search field the way a person does. */
async function type(mount: UmbraDesktopLauncherMount, text: string) {
  const input = mount.root.querySelector<HTMLInputElement>('.search-input')!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await mount.settle();
}

/** Wait for the sources to answer and the launcher to draw it. */
async function results(mount: UmbraDesktopLauncherMount) {
  for (let i = 0; i < 50 && mount.root.querySelector('.search-results.pending'); i++) await new Promise((r) => setTimeout(r, 5));
  await mount.settle();
}

const APPS = [stubApp('Log Viewer'), stubApp('Content editor'), stubApp('Media library')];

async function mount(options: Partial<Parameters<typeof mountLauncher>[0]> = {}) {
  return mountLauncher({ apps: APPS, groups: [], searchDebounceMs: 0, ...options });
}

it('puts the cursor in the search field when it opens', async () => {
  const m = await mount();
  try {
    expect(m.root.activeElement?.classList.contains('search-input')).to.equal(true);
  } finally {
    m.remove();
  }
});

it('replaces the groups with results as soon as there is text, and brings them back when it is cleared', async () => {
  const m = await mount();
  try {
    await type(m, 'log');
    expect(!!m.root.querySelector('.search-results')).to.equal(true);
    expect(!!m.root.querySelector('.body .card')).to.equal(false);
    await type(m, '');
    expect(!!m.root.querySelector('.search-results')).to.equal(false);
  } finally {
    m.remove();
  }
});

it('keeps the launcher as it is for text of only spaces', async () => {
  const m = await mount();
  try {
    await type(m, '   ');
    expect(!!m.root.querySelector('.search-results')).to.equal(false);
  } finally {
    m.remove();
  }
});

it('keeps the same field while switching, so typing is not interrupted', async () => {
  const m = await mount();
  try {
    const before = m.root.querySelector('.search-input');
    await type(m, 'l');
    expect(m.root.querySelector('.search-input')).to.equal(before);
  } finally {
    m.remove();
  }
});

it('shows apps, then full sections, then the other sources folded into one line', async () => {
  const m = await mount({
    searchSources: [fixed('Documents', 'full', [doc('Home')], 800), fixed('Data Types', 'folded', [doc('x')], 400, 3)],
  });
  try {
    await type(m, 'o');
    await results(m);
    const groups = [...m.root.querySelectorAll<HTMLElement>('.result-group')].map((g) => g.dataset.source);
    expect(groups).to.deep.equal(['apps', 'Documents']);
    expect(m.root.querySelector('.also-in')?.textContent).to.contain('Data Types');
    expect(m.root.querySelector('.also-in')?.textContent).to.contain('3');
    expect(m.root.querySelector('[data-key="document:Home"] .result-detail')?.textContent).to.equal('Home › News');
  } finally {
    m.remove();
  }
});

it('says so when nothing is found', async () => {
  const m = await mount({ searchSources: [fixed('Documents', 'full', [])] });
  try {
    await type(m, 'zzz');
    await results(m);
    expect(!!m.root.querySelector('.search-results .empty-note')).to.equal(true);
  } finally {
    m.remove();
  }
});

it('launches an app from the results', async () => {
  const m = await mount();
  try {
    await type(m, 'log');
    m.root.querySelector<HTMLElement>('[data-key="app:Log Viewer"]')!.click();
    expect(m.launched.map((a) => a.alias)).to.deep.equal(['Log Viewer']);
  } finally {
    m.remove();
  }
});

it('opens a content result in an editor-only window', async () => {
  const m = await mount({ searchSources: [fixed('Documents', 'full', [doc('Home', KEY)])] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>(`[data-key="document:${KEY}"]`)!.click();
    const app = m.launched[0] as UmbraDesktopApp;
    expect(app.chromeProfile).to.equal('workspace-only');
    expect(app.name).to.equal('Home');
    expect((app.content as { url: string }).url).to.equal(`/umbraco/section/content/workspace/document/edit/${KEY}`);
  } finally {
    m.remove();
  }
});

it('brings forward a window already showing the result rather than opening another', async () => {
  const content = { id: 'w1', app: { alias: 'content' } } as UmbraDesktopWindow;
  const m = await mount({
    searchSources: [fixed('Documents', 'full', [doc('Home', KEY)])],
    windows: [content],
    subjects: { w1: [{ entityType: 'document', unique: KEY } as UmbraDesktopWorkspaceSubject] },
  });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>(`[data-key="document:${KEY}"]`)!.click();
    expect(m.focused).to.deep.equal(['w1']);
    expect(m.launched).to.deep.equal([]);
  } finally {
    m.remove();
  }
});

it('shows a result it cannot open as disabled, and never navigates for it', async () => {
  const m = await mount({ searchSources: [fixed('Things', 'full', [doc('Outside', 'o', 'https://example.com/x'), doc('Nowhere', 'n', undefined)])] });
  try {
    await type(m, 'o');
    await results(m);
    for (const key of ['document:o', 'document:n']) {
      const row = m.root.querySelector<HTMLButtonElement>(`[data-key="${key}"]`)!;
      expect(row.disabled, key).to.equal(true);
      row.click();
    }
    expect(m.launched).to.deep.equal([]);
  } finally {
    m.remove();
  }
});

it('opens Help on the page a Help result names', async () => {
  const help: UmbraDesktopSearchItem = { key: 'help:x', name: 'Snapping', icon: 'icon-help-alt', open: { kind: 'help', target: 'umbradesktop/snapping' } };
  const m = await mount({ searchSources: [fixed('Help', 'full', [help])] });
  try {
    await type(m, 'snap');
    await results(m);
    m.root.querySelector<HTMLElement>('[data-key="help:x"]')!.click();
    expect(m.helpOpened).to.deep.equal(['umbradesktop/snapping']);
  } finally {
    m.remove();
  }
});

it('closes the launcher after opening anything', async () => {
  const m = await mount();
  try {
    let launched = 0;
    m.launcher.addEventListener('launched', () => launched++);
    await type(m, 'log');
    m.root.querySelector<HTMLElement>('.result')!.click();
    expect(launched).to.equal(1);
  } finally {
    m.remove();
  }
});
```

Replace the search test in `launcher-events.test.ts`:

```ts
it('searches in place rather than asking its host to open the native search modal', async () => {
  expect(await clickAndCapture('.search-input')).to.deep.equal([]);
});
```

In `launcher-geometry.test.ts`, replace the placeholder test's measurement (the `label`/`range` block and the `scrollWidth` check) with:

```ts
      // The field is an input now, which never wraps, so the check is that its placeholder is not
      // cut off: measured with the input's own font, against the room the input has.
      const input = mount.root.querySelector<HTMLInputElement>('.hdr .search-input')!;
      const style = getComputedStyle(input);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if (theme !== UMBRADESKTOP_MACOS_THEME) {
        expect(context.measureText(input.placeholder).width, 'all of the placeholder shows').to.be.at.most(input.clientWidth + 1);
      }
```

and rename the test to `the header row fits the search placeholder beside All apps and Arrange`. Keep the `.hdr .ctl` loop.

- [ ] **Step 3: Run them and see them fail**

Run: `npx web-test-runner "src/desktop/components/launcher-search.test.ts" "src/desktop/components/launcher-events.test.ts" --node-resolve`
Expected: FAIL, no `.search-input` exists.

- [ ] **Step 4: Implement**

**Strings.** In `en.ts`, after `noAppsMatch`:

```ts
    searchApps: 'Apps',
    searchAlsoIn: 'Also in',
    searchShowAll: 'Show all (%0%)',
    searchShowMore: 'Show more',
    searchNoResults: 'No results',
    searchHelp: 'Help',
```

In `nl.ts`, after `noAppsMatch`:

```ts
    searchApps: 'Apps',
    searchAlsoIn: 'Ook in',
    searchShowAll: 'Alles tonen (%0%)',
    searchShowMore: 'Meer tonen',
    searchNoResults: 'Geen resultaten',
    searchHelp: 'Help',
```

**Mode.** In `launcher/drag-scroller.ts`: `export type UmbraDesktopLauncherMode = 'launcher' | 'drawer' | 'arrange' | 'search';` and `search: ['.body'],` in `CANDIDATES`.

**Controller.** `backoffice/src/desktop/launcher/search.controller.ts`:

```ts
import type { UmbraDesktopApp } from '../types';
import { UmbraDesktopSearchEngine } from '../search/search-engine';
import type { UmbraDesktopSearchItem, UmbraDesktopSearchSection, UmbraDesktopSearchSource } from '../search/types';
import { sectionUrlFromHref } from '../windows/entity-window';
import { escapeClearsFilter } from './drawer.controller';
import { css, html } from '@umbraco-cms/backoffice/external/lit';
import type { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** What a search result does, which the launcher owns. */
export interface UmbraDesktopSearchActions {
  /**
   * Launch an app.
   * @param app The app.
   */
  launch(app: UmbraDesktopApp): void;
  /**
   * Open a search result.
   * @param item The result.
   */
  open(item: UmbraDesktopSearchItem): void;
  /**
   * Called when the field gains or loses text, which is when the launcher switches body.
   * @param active True when there is text to search for.
   */
  changed(active: boolean): void;
}

/**
 * Whether a result can be opened: a Help result always, a content result only when its href lands
 * on a backoffice section. One with no href, or one pointing off the backoffice, is shown but
 * disabled, as the native modal shows a result with no href (design §4).
 * @param item The result.
 * @returns True when it can be opened.
 */
export function canOpen(item: UmbraDesktopSearchItem): boolean {
  return item.open.kind === 'help' || sectionUrlFromHref(item.open.href) !== undefined;
}

/**
 * The launcher's search (launcher search design §4): the field in the header row and the results
 * that replace the body while it has text.
 *
 * A controller rendering into the launcher's own shadow root, as the drawer does, so the theme's
 * launcher sheet reaches the results without any theme changing. Rows reuse the drawer's `.row`
 * and `.lh` look, which every theme already styles.
 */
export class UmbraDesktopSearchController {
  /** The launcher this renders into. */
  #host: UmbLitElement;
  /** What results do. */
  #actions: UmbraDesktopSearchActions;
  /** Turns the text into results; redraws the host on every change. */
  #engine: UmbraDesktopSearchEngine;
  /** The field's text, untrimmed, so the field shows exactly what was typed. */
  #value = '';
  /** Loads the next page when Show more scrolls into view. */
  #observer?: IntersectionObserver;
  /** The Show more button being watched. */
  #watched?: Element;

  /**
   * @param host The launcher.
   * @param actions What results do.
   * @param debounceMs Overrides the engine's debounce, for tests.
   */
  constructor(host: UmbLitElement, actions: UmbraDesktopSearchActions, debounceMs?: number) {
    this.#host = host;
    this.#actions = actions;
    this.#engine = new UmbraDesktopSearchEngine({
      nameOf: (app) => host.localize.string(app.name),
      onChange: () => host.requestUpdate(),
      debounceMs,
    });
  }

  /** @returns True while there is text to search for. */
  get active(): boolean {
    return this.#value.trim() !== '';
  }

  /** @returns True while one source's full list is shown. */
  get drilled(): boolean {
    return !!this.#engine.state.drill;
  }

  /**
   * @param apps Every app the user may open.
   */
  setApps(apps: ReadonlyArray<UmbraDesktopApp>): void {
    this.#engine.setApps(apps);
  }

  /**
   * @param sources The permitted sources.
   */
  setSources(sources: ReadonlyArray<UmbraDesktopSearchSource>): void {
    this.#engine.setSources(sources);
  }

  /**
   * The field's text changed.
   * @param value The new text.
   */
  input(value: string): void {
    const was = this.active;
    this.#value = value;
    this.#engine.setQuery(value);
    if (was !== this.active) this.#actions.changed(this.active);
    this.#host.requestUpdate();
  }

  /** Empty the field. */
  clear(): void {
    this.input('');
  }

  /** Back from one source's list to the mixed results. */
  closeDrill(): void {
    this.#engine.closeDrill();
  }

  /** Put the caret in the field, once the host has rendered. */
  focusField(): void {
    void this.#host.updateComplete.then(() =>
      this.#host.shadowRoot?.querySelector<HTMLInputElement>('.search-input')?.focus({ preventScroll: true }),
    );
  }

  /** Watch Show more, so scrolling to the end of a list loads the next page. Call after each render. */
  afterRender(): void {
    const more = this.#host.shadowRoot?.querySelector('.search-results .more') ?? undefined;
    if (more === this.#watched) return;
    this.#observer?.disconnect();
    this.#watched = more;
    if (!more) return;
    this.#observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void this.#engine.more();
    });
    this.#observer.observe(more);
  }

  /** Stop: no late answer redraws a launcher that has closed. */
  dispose(): void {
    this.#engine.dispose();
    this.#observer?.disconnect();
  }

  /**
   * The field, which replaces the old search button in the header row. A `label` keeps the `.search`
   * class every theme styles as the pill, with the input inside it.
   * @returns The template.
   */
  renderField() {
    const placeholder = this.#host.localize.term('umbraDesktop_search');
    return html`
      <label class="search">
        <umb-icon name="icon-search"></umb-icon>
        <input
          class="search-input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          .value=${this.#value}
          placeholder=${placeholder}
          aria-label=${placeholder}
          @input=${(e: Event) => this.input((e.target as HTMLInputElement).value)}
          @keydown=${this.#onFieldKeydown} />
      </label>
    `;
  }

  /**
   * The body while searching: the mixed results, or one source's full list.
   * @returns The template.
   */
  render() {
    const state = this.#engine.state;
    if (state.drill) return this.#renderDrill(state.drill);
    const localize = this.#host.localize;
    const nothing = !state.pending && state.apps.length === 0 && state.sections.length === 0 && state.folded.length === 0;
    let first = true;
    /** True for the first row only, which is what Enter in the field opens. */
    const isFirst = () => {
      const was = first;
      first = false;
      return was;
    };
    return html`
      <div class="body search-results ${state.pending ? 'pending' : ''}" @keydown=${this.#onResultsKeydown}>
        ${state.apps.length
          ? html`<section class="result-group" data-source="apps">
              <div class="lh result-head"><span>${localize.term('umbraDesktop_searchApps')}</span></div>
              ${state.apps.map((app) =>
                this.#row(`app:${app.alias}`, app.icon, localize.string(app.name), undefined, true, isFirst(), () => this.#actions.launch(app)),
              )}
            </section>`
          : ''}
        ${state.sections.map(
          (section) => html`<section class="result-group" data-source=${section.source.alias}>
            <div class="lh result-head">
              <span>${localize.string(section.source.label)}</span>
              ${section.total > section.items.length
                ? html`<button class="show-all" @click=${() => void this.#engine.drill(section.source.alias)}>
                    ${localize.term('umbraDesktop_searchShowAll', section.total)}
                  </button>`
                : ''}
            </div>
            ${section.items.map((item) => this.#itemRow(item, isFirst()))}
          </section>`,
        )}
        ${state.folded.length ? this.#renderAlsoIn(state.folded) : ''}
        ${nothing ? html`<p class="empty-note">${localize.term('umbraDesktop_searchNoResults')}</p>` : ''}
      </div>
    `;
  }

  /**
   * The folded sources, one line.
   * @param folded The folded sources that found something.
   * @returns The template.
   */
  #renderAlsoIn(folded: ReadonlyArray<UmbraDesktopSearchSection>) {
    const localize = this.#host.localize;
    return html`
      <div class="also-in">
        <span>${localize.term('umbraDesktop_searchAlsoIn')}</span>
        ${folded.map(
          (section) => html`<button class="also" data-source=${section.source.alias} @click=${() => void this.#engine.drill(section.source.alias)}>
            ${localize.string(section.source.label)} <span class="count">${section.total}</span>
          </button>`,
        )}
      </div>
    `;
  }

  /**
   * One source's full list, with Back and Show more.
   * @param drill The drilled-into source and what has loaded.
   * @returns The template.
   */
  #renderDrill(drill: UmbraDesktopSearchSection & { loading: boolean }) {
    const localize = this.#host.localize;
    return html`
      <div class="body search-results drill" @keydown=${this.#onResultsKeydown}>
        <div class="drill-head">
          <button class="ctl back" @click=${() => this.#back()}>
            <umb-icon name="icon-arrow-left"></umb-icon>
            <span>${localize.term('umbraDesktop_back')}</span>
          </button>
          <span class="lh">${localize.string(drill.source.label)} (${drill.total})</span>
        </div>
        ${drill.items.map((item, index) => this.#itemRow(item, index === 0))}
        ${drill.items.length < drill.total
          ? html`<button class="more" ?disabled=${drill.loading} @click=${() => void this.#engine.more()}>
              ${localize.term('umbraDesktop_searchShowMore')}
            </button>`
          : ''}
      </div>
    `;
  }

  /** Back from the drilled-down list, with the caret back in the field. */
  #back(): void {
    this.closeDrill();
    this.focusField();
  }

  /**
   * A row for a source's result.
   * @param item The result.
   * @param first Whether it is the row Enter opens.
   * @returns The template.
   */
  #itemRow(item: UmbraDesktopSearchItem, first: boolean) {
    return this.#row(item.key, item.icon, item.name, item.detail, canOpen(item), first, () => this.#actions.open(item));
  }

  /**
   * One result row, in the drawer's row look.
   * @param key Identifies the row, for tests and keyboard focus.
   * @param icon Its icon.
   * @param name Its name.
   * @param detail A second line, such as a document's location.
   * @param enabled Whether it can be opened.
   * @param first Whether it is the row Enter opens, which is marked so the user can see that.
   * @param open What a click does.
   * @returns The template.
   */
  #row(key: string, icon: string, name: string, detail: string | undefined, enabled: boolean, first: boolean, open: () => void) {
    return html`
      <button class="row result ${first && enabled ? 'first' : ''}" data-key=${key} ?disabled=${!enabled} @click=${open}>
        <umb-icon name=${icon}></umb-icon>
        <span class="result-text">
          <span class="row-name">${name}</span>
          ${detail ? html`<span class="result-detail">${detail}</span>` : ''}
        </span>
      </button>
    `;
  }

  /**
   * The first result that can be opened, in the order drawn.
   * @returns What Enter in the field opens, or undefined.
   */
  #firstTarget(): (() => void) | undefined {
    const state = this.#engine.state;
    if (state.drill) {
      const item = state.drill.items.find(canOpen);
      return item ? () => this.#actions.open(item) : undefined;
    }
    const app = state.apps[0];
    if (app) return () => this.#actions.launch(app);
    const item = state.sections.flatMap((s) => s.items).find(canOpen);
    return item ? () => this.#actions.open(item) : undefined;
  }

  /**
   * Keys in the field. Escape goes back from a drilled-down list first, then clears the text, and
   * with the field empty lets the key through so the taskbar closes the launcher. Arrow down moves
   * into the results; Enter opens the first one.
   * @param e The key event.
   */
  #onFieldKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.drilled) {
      e.preventDefault();
      e.stopPropagation();
      this.closeDrill();
      return;
    }
    if (e.key === 'Escape') {
      escapeClearsFilter(e, () => this.clear());
      return;
    }
    if (e.key === 'ArrowDown') {
      const first = this.#host.shadowRoot?.querySelector<HTMLElement>('.search-results button:not(:disabled)');
      if (first) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (e.key === 'Enter') {
      const open = this.#firstTarget();
      if (open) {
        e.preventDefault();
        open();
      }
    }
  };

  /**
   * Arrow keys between results, in the order drawn; up from the first goes back to the field.
   * Enter and Space are a focused button's own.
   * @param e The key event.
   */
  #onResultsKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const root = this.#host.shadowRoot;
    if (!root) return;
    const buttons = [...root.querySelectorAll<HTMLElement>('.search-results button:not(:disabled)')];
    const index = buttons.indexOf(root.activeElement as HTMLElement);
    if (index < 0) return;
    e.preventDefault();
    const next = index + (e.key === 'ArrowDown' ? 1 : -1);
    if (next < 0) root.querySelector<HTMLInputElement>('.search-input')?.focus();
    else buttons[Math.min(next, buttons.length - 1)].focus();
  };
}

/** The search's CSS, included in the launcher's `static styles`, after the drawer's. */
export const searchStyles = css`
  .search {
    cursor: text;
  }
  .search:focus-within {
    border-color: var(--umbradesktop-launcher-border-emphasis, var(--uui-color-border-emphasis, var(--uui-color-border)));
  }
  .search-input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .search-input::placeholder {
    color: inherit;
    opacity: 0.7;
  }
  .search-input::-webkit-search-cancel-button {
    display: none;
  }
  .search-results {
    display: flex;
    flex-direction: column;
    gap: var(--uui-size-space-4);
  }
  .result-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--uui-size-space-3);
  }
  .show-all,
  .also,
  .more {
    padding: var(--uui-size-space-1) var(--uui-size-space-2);
    border: none;
    border-radius: var(--uui-border-radius, 3px);
    background: transparent;
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    font-size: var(--uui-type-small-size);
    cursor: pointer;
  }
  .show-all:hover,
  .also:hover,
  .more:hover,
  .row.first {
    background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));
  }
  .more {
    align-self: flex-start;
  }
  .result-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .result-detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.85em;
    opacity: 0.7;
  }
  .row:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .also-in {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--uui-size-space-2);
    color: var(--umbradesktop-launcher-text-muted, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    font-size: var(--uui-type-small-size);
  }
  .also .count {
    opacity: 0.7;
  }
  .drill-head {
    display: flex;
    align-items: center;
    gap: var(--uui-size-space-3);
  }
`;
```

**Launcher.** In `components/launcher.element.ts`:

1. Imports:

```ts
import { UmbraDesktopSearchController, searchStyles } from '../launcher/search.controller.js';
import type { UmbraDesktopSearchItem } from '../search/types.js';
import { UMBRADESKTOP_SEARCH_CONTEXT } from '../search/search.context-token.js';
import { UMBRADESKTOP_HELP_CONTEXT } from '../help/help.context-token.js';
import type { UmbraDesktopHelpContext } from '../help/help.context';
import { entityWindowApp, findEntityWindow, sectionUrlFromHref } from '../windows/entity-window.js';
import { property } from '@umbraco-cms/backoffice/external/lit';
```

(merge `property` into the existing lit import line).

2. Class JSDoc: change "search, the Pinned place" to "a search field that turns the body into results while it has text, the Pinned place", and drop `search` from the footer's list of reported intents.

3. Fields, after `#arrange`:

```ts
  /**
   * Overrides search's debounce, for tests. Read each time a search is scheduled rather than once at
   * construction, so the test helper can set it after `createElement` has run the constructor.
   */
  @property({ attribute: false })
  searchDebounceMs?: number;

  /** The Help context, which a Help result opens Help through. */
  #help?: UmbraDesktopHelpContext;

  /**
   * Search: the field in the header row and the results body. A controller for the same reason as
   * the drawer: the theme's launcher sheet only reaches this shadow root.
   */
  #search = new UmbraDesktopSearchController(
    this,
    {
      launch: (app) => this.#open(app),
      open: (item) => this.#openResult(item),
      changed: (active) => this.#searching(active),
    },
    () => this.searchDebounceMs,
  );
```

For that last argument, the controller's constructor takes `debounceMs: () => number | undefined = () => undefined` (not the plain number shown in the controller code above), and builds its engine with a getter, so the engine's existing per-schedule read of `options.debounceMs` sees the current value:

```ts
    this.#engine = new UmbraDesktopSearchEngine({
      nameOf: (app) => host.localize.string(app.name),
      onChange: () => host.requestUpdate(),
      get debounceMs() {
        return debounceMs();
      },
    });
```

Update the controller's `@param debounceMs` JSDoc to match.

4. Constructor: in the catalogue observer, `this.observe(ctx.apps, (apps) => { this._apps = apps; this.#search.setApps(apps); });`. Then add:

```ts
    this.consumeContext(UMBRADESKTOP_SEARCH_CONTEXT, (ctx) => {
      if (!ctx) return;
      this.observe(ctx.sources, (sources) => this.#search.setSources(sources));
    });
    this.consumeContext(UMBRADESKTOP_HELP_CONTEXT, (ctx) => (this.#help = ctx ?? undefined));
```

5. Methods, after `#open`:

```ts
  /**
   * Open a search result: Help on its page, or a content item in a window of its own, or the window
   * already showing it. Never a navigation of the backoffice, which is what issue #6 was.
   * @param item The result.
   */
  #openResult(item: UmbraDesktopSearchItem) {
    const open = item.open;
    if (open.kind === 'help') {
      this.#help?.open(open.target);
    } else {
      const url = sectionUrlFromHref(open.href);
      if (!url || !this.#manager) return;
      const existing = findEntityWindow(this.#manager, open.entityType, open.unique);
      if (existing) this.#manager.focus(existing);
      else this.#manager.open(entityWindowApp({ entityType: open.entityType, unique: open.unique, name: item.name, icon: item.icon, url }));
    }
    this.dispatchEvent(new CustomEvent('launched'));
  }

  /**
   * Switch between the launcher and search as the field gains and loses text. Not through
   * `#setMode`, which moves focus to the control that opened a mode: here focus has to stay in the
   * field the user is typing in. The height is held as it is for All apps, so results arriving do
   * not make the panel jump.
   * @param active True when the field has text.
   */
  #searching(active: boolean) {
    if (active && this._mode === 'launcher') {
      this.style.setProperty(HELD_HEIGHT, `${this.getBoundingClientRect().height}px`);
      this._mode = 'search';
    } else if (!active && this._mode === 'search') {
      this._mode = 'launcher';
    }
  }

  /** The caret starts in the search field, so opening the launcher and typing searches. */
  override firstUpdated(changed: Map<PropertyKey, unknown>) {
    super.firstUpdated(changed);
    this.#search.focusField();
  }
```

6. `back()`:

```ts
  back(): boolean {
    if (this._mode === 'launcher') return false;
    if (this._mode === 'search') {
      if (this.#search.drilled) this.#search.closeDrill();
      else this.#search.clear();
      this.#search.focusField();
      return true;
    }
    void this.#setMode('launcher');
    return true;
  }
```

Update its JSDoc: "from search's drilled-down list to its results, from search to the launcher, from All apps or arrange mode to the launcher".

7. `updated()`: add `if (this._mode === 'search') this.#search.afterRender();`. `disconnectedCallback()`: add `this.#search.dispose();` before `super`.

8. Delete `#requestSearch`.

9. `render()`: replace the `<button class="search" ...>...</button>` with `${this.#search.renderField()}` and the body line with:

```ts
      ${this._mode === 'search'
        ? this.#search.render()
        : html`<div class="body">${empty ? this.#renderEmpty() : html`${this.#renderPinned(view)} ${this.#renderGroups(view)}`}</div>`}
```

The header stays in the same template literal for both modes, which is what keeps the `<input>` element (and its focus and caret) across the switch.

10. Styles: add `searchStyles` after `drawerStyles` in `static styles`. In the base `.search` rule, leave everything; delete the `.search span` rule and its comment (nothing renders a span there now), and keep `.search umb-icon`.

**Taskbar.** In `components/taskbar.element.ts`: delete the `UMB_SEARCH_MODAL` import, `#onSearch` and its JSDoc, and `@search=${this.#onSearch}`. In the comment near line 68, change "(search/favourites/...)" to "(search, favourites, ...)" only if it now reads wrong; it describes what the launcher holds, which is still true.

- [ ] **Step 5: Run the launcher's tests and see them pass**

Run: `npx web-test-runner "src/desktop/components/launcher-*.test.ts" "src/desktop/localization/parity.test.ts" --node-resolve`
Expected: PASS. If an existing launcher test asserted focus on open (for example on `.ctl.all-apps`), it now sees the field; update that assertion only if the test is about where focus starts, not about returning from All apps.

- [ ] **Step 6: Run the theme tests**

Run: `npx web-test-runner "src/desktop/theme/themes/**/*.test.ts" --node-resolve`
Expected: PASS. `expectPressable(['.search', ...])` still finds the `label.search`.

- [ ] **Step 7: Leave uncommitted.**

---

### Task 7: Drilling down and the keyboard

**Files:**
- Modify: `backoffice/src/desktop/components/launcher-search.test.ts` (add tests)
- Modify, only if a test fails for a reason the design does not intend: `backoffice/src/desktop/launcher/search.controller.ts`, `components/launcher.element.ts`

**Interfaces:**
- Consumes: everything from Task 6.

The behaviour was written in Task 6 so the controller is whole; this task pins it with its own red-green cycle. Before Step 2, temporarily break the behaviour each test targets (for example comment out `#onFieldKeydown`'s ArrowDown branch) to see each test fail, then restore it.

- [ ] **Step 1: Write the tests**

Append to `launcher-search.test.ts`:

```ts
/** Press a key on whatever has focus in the launcher. */
async function press(m: UmbraDesktopLauncherMount, key: string) {
  const target = (m.root.activeElement as HTMLElement) ?? m.launcher;
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
  await m.settle();
}

const many = (n: number) => Array.from({ length: n }, (_, i) => doc(`Home ${i}`, `k${i}`));

it('drills into a section with Show all, and Back returns with the text kept', async () => {
  const m = await mount({ apps: [], searchSources: [fixed('Documents', 'full', many(25))] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>('.show-all')!.click();
    await results(m);
    expect(m.root.querySelectorAll('.drill .result').length).to.equal(20);
    m.root.querySelector<HTMLElement>('.drill .ctl.back')!.click();
    await m.settle();
    expect(!!m.root.querySelector('.drill')).to.equal(false);
    expect(m.root.querySelector<HTMLInputElement>('.search-input')!.value).to.equal('home');
  } finally {
    m.remove();
  }
});

it('drills into a folded source from the Also in line', async () => {
  const m = await mount({ apps: [], searchSources: [fixed('Data Types', 'folded', many(3))] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>('.also[data-source="Data Types"]')!.click();
    await results(m);
    expect(m.root.querySelectorAll('.drill .result').length).to.equal(3);
  } finally {
    m.remove();
  }
});

it('loads the next page with Show more, and offers no more at the end', async () => {
  const m = await mount({ apps: [], searchSources: [fixed('Documents', 'full', many(25))] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>('.show-all')!.click();
    await results(m);
    m.root.querySelector<HTMLElement>('.more')!.click();
    await results(m);
    expect(m.root.querySelectorAll('.drill .result').length).to.equal(25);
    expect(!!m.root.querySelector('.more')).to.equal(false);
  } finally {
    m.remove();
  }
});

it('opens the first result with Enter in the field', async () => {
  const m = await mount();
  try {
    await type(m, 'log');
    await press(m, 'Enter');
    expect(m.launched.map((a) => a.alias)).to.deep.equal(['Log Viewer']);
  } finally {
    m.remove();
  }
});

it('moves through results with the arrow keys, and back up to the field', async () => {
  const m = await mount({ searchSources: [fixed('Documents', 'full', [doc('Log entry', KEY)])] });
  try {
    await type(m, 'log');
    await results(m);
    await press(m, 'ArrowDown');
    expect((m.root.activeElement as HTMLElement).dataset.key).to.equal('app:Log Viewer');
    await press(m, 'ArrowDown');
    expect((m.root.activeElement as HTMLElement).dataset.key).to.equal(`document:${KEY}`);
    await press(m, 'ArrowUp');
    await press(m, 'ArrowUp');
    expect(m.root.activeElement?.classList.contains('search-input')).to.equal(true);
  } finally {
    m.remove();
  }
});

it('clears the text with Escape, back to the launcher, and lets the next Escape through', async () => {
  const m = await mount();
  try {
    await type(m, 'log');
    let escaped = 0;
    document.addEventListener('keydown', function count(e) {
      if (e.key === 'Escape') escaped++;
    });
    await press(m, 'Escape');
    expect(m.root.querySelector<HTMLInputElement>('.search-input')!.value).to.equal('');
    expect(!!m.root.querySelector('.search-results')).to.equal(false);
    expect(escaped, 'the first Escape stops at the field').to.equal(0);
    await press(m, 'Escape');
    expect(escaped, 'the second reaches the taskbar').to.equal(1);
  } finally {
    m.remove();
  }
});

it('goes back from a drilled-down list with Escape before clearing anything', async () => {
  const m = await mount({ apps: [], searchSources: [fixed('Documents', 'full', many(8))] });
  try {
    await type(m, 'home');
    await results(m);
    m.root.querySelector<HTMLElement>('.show-all')!.click();
    await results(m);
    m.root.querySelector<HTMLInputElement>('.search-input')!.focus();
    await press(m, 'Escape');
    expect(!!m.root.querySelector('.drill')).to.equal(false);
    expect(m.root.querySelector<HTMLInputElement>('.search-input')!.value).to.equal('home');
  } finally {
    m.remove();
  }
});

it('steps back through back(), as the taskbar asks on Escape from a result row', async () => {
  const m = await mount();
  try {
    await type(m, 'log');
    expect(m.launcher.back()).to.equal(true);
    await m.settle();
    expect(!!m.root.querySelector('.search-results')).to.equal(false);
    expect(m.launcher.back()).to.equal(false);
  } finally {
    m.remove();
  }
});
```

Remove the `document` keydown listener in the Escape test's `finally` (keep a reference to the function) so it does not leak into later tests.

- [ ] **Step 2: Run them, see each fail once with its target broken, then pass**

Run: `npx web-test-runner "src/desktop/components/launcher-search.test.ts" --node-resolve`
Expected: PASS with the code restored.

- [ ] **Step 3: Leave uncommitted.**

---

### Task 8: Docs, listing, full build and a real backoffice

**Files:**
- Create: `docs/user/launcher/searching.md`
- Modify: `docs/user/launcher/README.md`, `docs/user/launcher/using-the-launcher.md`
- Modify: `umbraco-marketplace-umbraco.community.umbradesktop.json`
- Modify: `docs/design/2026-10-13-launcher-search-design.md` (Status)

- [ ] **Step 1: Read the writing guide**

Read `docs/developer/writing-documentation.md` before writing the page. Procedures are commands with the goal first; UI labels in bold, taken from `localization/en.ts`.

- [ ] **Step 2: Write the page**

`docs/user/launcher/searching.md`:

```markdown
---
id: searching
title: Searching
description: Find apps, content, media and more from the launcher, and open what you find in a window.
sidebar_position: 3
---

# Searching

The search field at the top of the launcher finds apps and things in Umbraco together, and opens
what you pick in a window on the desktop.

- To search, open the launcher and type. The cursor is already in the search field.
- To open a result, select it, or press Enter to open the first one.
- To move through the results with the keyboard, use the arrow keys.
- To go back to your apps and groups, press Escape. Press it again to close the launcher.

## What it finds

Results come in this order:

1. **Apps**, matched by name as you type.
2. **Documents** and **Media**, the best few of each. A document shows where it is in the content
   tree.
3. **Also in**: the other places that found something, such as Document Types, Templates or
   **Help**, with how many each found.

You only see places you have access to. Without the Settings section, for example, there are no
Document Types or Data Types.

## See everything one place found

- To see all of a section's results, select **Show all** beside its heading.
- To see the results of a place under **Also in**, select it.
- To load more, scroll to the end of the list, or select **Show more**.
- To go back to the mixed results, select **Back**, or press Escape.

## Where results open

A document, media item or other result opens in a window with just its editor. If it is already
open in a window, that window comes to the front instead. A Help result opens Help on that page.
```

Check `sidebar_position` against the other pages in the folder (using 1, arranging 2) and the labels against `en.ts`. Run the docs check after.

- [ ] **Step 3: Link it**

- `docs/user/launcher/README.md`: add `- [Searching](searching.md): find apps, content, media and Help pages, and open them in a window.`
- `docs/user/launcher/using-the-launcher.md`, section **Find an app**: replace the first bullet with `- To find an app, or anything else, type in the search field at the top of the launcher. See [Searching](searching.md).`

- [ ] **Step 4: Marketplace tag**

In `umbraco-marketplace-umbraco.community.umbradesktop.json`, add `"search"` to `Tags` after `"launcher"`. No `Description` change, no README change (design §9).

- [ ] **Step 5: Full build and suite**

From `src/Umbraco.Community.UmbraDesktop`:

```bash
npm run build
```

```bash
npm test -- --concurrency 2
```

Expected: both pass. The build includes the docs check, so a broken link in the new page fails here. Restore any test-run artifacts the suite leaves in the tree (`git status` should show only this plan's files).

- [ ] **Step 6: A real backoffice**

Use the `running-umbraco-instances` skill to run the TestInstance from this worktree on its own port and `*.localhost` host. Then, signed in as an admin:

- Open the launcher; the caret is in the field.
- Type part of a document's name: Apps, Documents (with a location line), Media, and an Also in line appear. Note how long the first results take.
- Select a document: a window with only the editor opens. Select it again: the same window comes forward.
- Open the same document from the Content app first, then search and select it: the Content window comes forward.
- Show all on Documents, scroll to the end: more load. Back returns with the text.
- Select a Data Types entry under Also in, then a data type: its editor opens in a window.
- Search for a word in the docs ("snap"): Help is under Also in, and a result opens Help on that page. Judge whether Help's results are useful here (design D5).
- Escape clears, Escape again closes.
- Switch the backoffice language to Dutch on a variant site and search: document names show in the Dutch variant.
- Check each of the five themes quickly: the field, rows and Also in line look like the theme.

Then as a user without the Settings section (create one in Users with only Content and Media):

- No Document Types, Data Types, Media Types, Member Types or Templates in Also in.

Fix what fails, with a failing test first where the fault is in code.

- [ ] **Step 7: Close out the design doc**

Set **Status** to `Implemented` in `docs/design/2026-10-13-launcher-search-design.md`, and add a short section for anything the real backoffice taught that the design did not foresee.

- [ ] **Step 8: Walk the definition of done**

Walk the list in `CLAUDE.md` and say which items did not apply (README: none, by design). Leave everything uncommitted and report the files changed.
