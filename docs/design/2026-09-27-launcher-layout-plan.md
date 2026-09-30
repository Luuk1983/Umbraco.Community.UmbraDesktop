# A launcher you arrange yourself: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** the launcher stays today's launcher until the user changes it; tiles drag to move, pin
and remove in normal mode; an All apps drawer lists everything alphabetically; arrange mode edits
groups, holds a palette of what is off the launcher, and has a visible button for every drag.

**Architecture:** the user's changes are stored as an optional `layout` on the existing settings
payload, beside the unchanged `pinned`. Three pure units do the thinking: `resolve-launcher.ts`
builds what the launcher shows from the catalogue plus the stored changes, `layout-edits.ts` turns
one user action into a new `{ pinned, layout }`, and `group-labels.ts` names a group. The launcher
element becomes a shell over three modes; the drawer and arrange mode are their own elements; one
pointer-events drag controller serves both the shell and arrange mode.

**Tech stack:** TypeScript, Lit, the Umbraco 17 backoffice (`UmbLitElement`, `UmbObjectState`,
context API), web-test-runner with `@open-wc/testing` in a real Chrome, Vite.

**Spec:** [2026-09-27-launcher-layout-design.md](2026-09-27-launcher-layout-design.md). Decision
numbers (D1 to D14) and section numbers (§) below are that document's. **Issue:**
[#59](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/59).

---

## Rules that override the skill's defaults

- **No commits, no pushes.** The owner reviews one diff. Every task ends by running its checks, not
  by committing. Offer a commit at the very end as a question, never as a done thing.
- **Both gates, always.** `npm run build` (wallpapers, app icons, `tsc`, Vite) and `npm test`
  (web-test-runner). The test runner transpiles through esbuild and does **not** type-check; `tsc`
  renders nothing. A task is not green until both are.
- **Tests first.** Write the failing test, run it, see it fail for the reason you expect, then write
  the code.
- **JSDoc on everything**, private members included, saying why the code exists. Match the density of
  the file you are in. The code blocks below carry the JSDoc that must ship.
- **Derive, never retype.** A value two files need is one exported constant.
- **A theme may restyle, never remove.** Every new control has to survive all five themes.
- **The launcher opens no modal.** Everything is inline (see the top of `launcher.element.ts`).
- **Prose for the owner** (docs, README, messages): short and plain, no em-dashes.

## Commands

All from `src/Umbraco.Community.UmbraDesktop`:

```bash
npm run build
npm test
```

One test file, from `src/Umbraco.Community.UmbraDesktop/backoffice`:

```bash
npx web-test-runner "src/desktop/launcher/resolve-launcher.test.ts" --node-resolve
```

`npm run build` rewrites the line endings of `backoffice/src/desktop/settings/wallpapers.generated.ts`.
Restore it with `git checkout -- <path>` before handing over the diff.

## Who does what

Tasks 1 to 6 and 9 are pure units with their own tests: subagent-sized, one subagent each. Tasks 7,
8, 10 and 11 change the launcher element and are best done by one subagent in sequence, because each
builds on the element the previous one left. Task 12 (themes) is one subagent. Task 13 needs the test
instance on the owner's machine and is inline, as are 14 and 15. Task 16 is a reviewer.

Task 10 starts with a touch spike. If it fails, stop there and ask the owner: the fallback changes the
design, not just the code.

---

## File map

Paths below are relative to `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/` unless they
start with `docs/`, `README.md` or `umbraco-marketplace-`.

**New:**

| File | Responsibility |
|---|---|
| `launcher/group-labels.ts` | Names a layout group: a user's literal text, or a catalogue label to translate (§4.4) |
| `launcher/resolve-launcher.ts` | The effective layout and the view: pinned apps, groups, palette (§4.2) |
| `launcher/layout-edits.ts` | One pure function per user action (§4.3) |
| `launcher/alphabet.ts` | The drawer's sort, letter headings and filter (§3.2) |
| `launcher/geometry.ts` | The palette width and the split breakpoint (§6.3) |
| `launcher/drop-target.ts` | Reads a drop target from the element under the pointer; `dropClassFor`, the landing highlight both modes share |
| `launcher/apply-drop.ts` | Turns a drop into an edit, for both modes |
| `launcher/tile-drag.controller.ts` | Pointer-events drag: threshold, long press, ghost, scroll, Esc (§5) |
| `launcher/drawer.controller.ts` | All apps (§3.2), rendered into the launcher's shadow root |
| `launcher/arrange.controller.ts` | Arrange mode (§3.3): banner, layout editor, Move to, palette |
| `components/launcher.test-helper.ts` | Mounts a launcher with stubbed contexts, optionally under a theme |
| `theme/themes/launcher-controls.test.ts` | No theme hides a new control, in any mode |
| Tests beside each | `*.test.ts` |

**Modified:**

| File | Change |
|---|---|
| `settings/types.ts` | `UmbraDesktopLauncherLayout`, `layout?` |
| `settings/settings-store.ts` | `readLayout` |
| `settings/settings.context.ts` | `layout` observable, `setLauncherArrangement` |
| `settings/pinned.ts` | `resolveAppAlias`, `withoutApp`, `pinAppBefore` |
| `group-apps.ts` | `launcherGroupOrder`, `catalogueGroupOf` exported |
| `app-catalogue.context.ts` | `catalogueGroups` observable |
| `components/launcher.element.ts` | The shell: modes, the view, normal-mode drag, remove pane; the pin badge goes |
| `localization/en.ts`, `localization/nl.ts` | New terms |
| `theme/types.ts` | New tokens, one removed |
| `theme/themes/*/palette.ts`, `theme/themes/*/launcher.css.ts` | Token values, `.pin` rules removed, arrange styling |
| `theme/themes/*/launcher.test.ts` | Prose about the pin toggle |
| `components/launcher-long-names.test.ts` | Its catalogue stub gains `catalogueGroups` |
| `README.md`, `umbraco-marketplace-umbraco.community.umbradesktop.json`, `docs/developer/theming.md`, the design doc | Task 14 |

---

### Task 0: Baseline

- [ ] **Step 1: Confirm the branch is current and clean apart from the design files**

Run: `git status --short && git log --oneline -1 && git log --oneline -1 origin/main`
Expected: only `docs/design/2026-09-27-launcher-layout-*` and `docs/design/mockups/*` changes; HEAD
equals `origin/main` (`c241861` or later).

- [ ] **Step 2: Run both gates before touching anything**

Run: `npm run build && npm test` from `src/Umbraco.Community.UmbraDesktop`.
Expected: both pass. If either fails on a clean tree, stop and report it; do not build on a red
baseline. Restore `wallpapers.generated.ts` afterwards.

---

### Task 1: The stored layout

**Files:**
- Modify: `settings/types.ts` (after `UmbraDesktopLocaleSettings`, and inside `UmbraDesktopSettings`)
- Modify: `settings/settings-store.ts` (`parseSettings`, new `readLayout`)
- Test: `settings/settings-store.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `settings/settings-store.test.ts`:

```ts
describe('the launcher layout', () => {
  /** A layout with one of everything, for the round trip. */
  const LAYOUT = {
    groups: [
      { id: 'editing', label: null, apps: ['content', 'media'] },
      { id: 'custom-abc', label: 'Daily', apps: ['forms'] },
    ],
    removed: ['profiling'],
    deletedGroups: ['advanced-security'],
  };

  it('has no layout when nothing is stored, so the launcher is built from the catalogue', () => {
    expect(parseSettings(null).layout).to.equal(undefined);
  });

  it('round-trips a layout through serialise and parse', () => {
    const settings = { ...parseSettings(null), layout: LAYOUT };
    expect(parseSettings(serialiseSettings(settings)).layout).to.deep.equal(LAYOUT);
  });

  it('reads a layout that is not an object as absent, and keeps every other field', () => {
    const raw = JSON.stringify({ v: 1, theme: 'win98', pinned: ['media'], layout: 'nonsense' });
    const settings = parseSettings(raw);
    expect(settings.layout).to.equal(undefined);
    expect(settings.theme).to.equal('win98');
    expect(settings.pinned).to.deep.equal(['media']);
  });

  it('reads a layout whose groups are not a list as absent', () => {
    const raw = JSON.stringify({ v: 1, layout: { groups: {}, removed: [], deletedGroups: [] } });
    expect(parseSettings(raw).layout).to.equal(undefined);
  });

  it('drops a group without a usable id or label, and keeps the rest', () => {
    const raw = JSON.stringify({
      v: 1,
      layout: {
        groups: [
          { id: '', label: null, apps: [] },
          { label: null, apps: ['a'] },
          { id: 'labelled-wrong', label: 7, apps: ['b'] },
          { id: 'no-label', apps: ['c'] },
          { id: 'kept', label: null, apps: ['d'] },
        ],
      },
    });
    expect(parseSettings(raw).layout?.groups).to.deep.equal([{ id: 'kept', label: null, apps: ['d'] }]);
  });

  it('keeps the first of two groups with the same id', () => {
    const raw = JSON.stringify({
      v: 1,
      layout: {
        groups: [
          { id: 'editing', label: null, apps: ['content'] },
          { id: 'editing', label: 'Again', apps: ['media'] },
        ],
      },
    });
    expect(parseSettings(raw).layout?.groups).to.deep.equal([{ id: 'editing', label: null, apps: ['content'] }]);
  });

  it('filters non-strings out of every list and treats a missing list as empty', () => {
    const raw = JSON.stringify({
      v: 1,
      layout: { groups: [{ id: 'editing', label: null, apps: ['content', 3, null] }], removed: ['a', {}] },
    });
    expect(parseSettings(raw).layout).to.deep.equal({
      groups: [{ id: 'editing', label: null, apps: ['content'] }],
      removed: ['a'],
      deletedGroups: [],
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx web-test-runner "src/desktop/settings/settings-store.test.ts" --node-resolve` from `backoffice`.
Expected: the round-trip and the filtering cases FAIL (`layout` is dropped by `parseSettings`); the
"absent" cases may already pass.

- [ ] **Step 3: Add the types**

In `settings/types.ts`, before `UmbraDesktopSettings`:

```ts
/**
 * One group on a launcher the user has arranged.
 *
 * A group that came from the catalogue keeps the catalogue group's alias as its `id` and a `null`
 * label, so its name is looked up (see `launcher/group-labels.ts`) and follows the backoffice
 * language. Only a group the user named carries literal text.
 */
export interface UmbraDesktopLauncherLayoutGroup {
  /** A catalogue group alias, or `custom-…` for a group the user created. */
  id: string;
  /** `null` to look the name up by `id`; otherwise the user's own text. */
  label: string | null;
  /**
   * App aliases in the user's order. Never pruned: an alias this user cannot open right now is
   * skipped when the launcher is drawn and comes back in the same place when they can.
   */
  apps: string[];
}

/**
 * The user's changes to the launcher, and only those (design D2).
 *
 * Absent until the user first changes a group, so a launcher nobody has arranged is always the
 * catalogue's own grouping and follows it when a release regroups apps. New apps are placed by
 * `launcher/resolve-launcher.ts`, not stored here, which is what lets them keep arriving (D3).
 */
export interface UmbraDesktopLauncherLayout {
  /** The user's groups, in their order. */
  groups: UmbraDesktopLauncherLayoutGroup[];
  /** Apps the user took off the launcher. They wait in the palette and in All apps. */
  removed: string[];
  /** Catalogue groups the user deleted, so their new apps wait in the palette instead of returning. */
  deletedGroups: string[];
}
```

Inside `UmbraDesktopSettings`, after `locale`:

```ts
  /**
   * The user's changes to the launcher. Absent means never arranged: the launcher is the catalogue's
   * grouping. Optional rather than defaulted, and the payload stays at `v: 1`, for the reason
   * `parseSettings` gives: an unknown optional field costs an older build nothing (design D14).
   */
  layout?: UmbraDesktopLauncherLayout;
```

- [ ] **Step 4: Write `readLayout` and call it**

In `settings/settings-store.ts`, extend the type import to
`import type { UmbraDesktopLauncherLayout, UmbraDesktopLauncherLayoutGroup, UmbraDesktopLocaleSettings, UmbraDesktopSettings, UmbraDesktopWallpaperRef } from './types';`
and add after `readLocale`:

```ts
/**
 * The strings in a decoded list, or an empty list when it is not one.
 * @param value A decoded property that should be a list of strings.
 * @returns Its string entries, in order.
 */
function stringsIn(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Read a stored launcher layout, recovering what it can.
 *
 * Anything that is not an object with a list of groups is **absent**, which costs the user their
 * arrangement and nothing else: the launcher falls back to the catalogue's grouping, and the
 * wallpaper, theme and pins beside it are read independently. Within a readable layout a broken
 * group is dropped on its own and a stray non-string is filtered out on its own, so one bad entry
 * never costs the rest.
 * @param value The decoded `layout` property.
 * @returns A usable layout, or `undefined`.
 */
function readLayout(value: unknown): UmbraDesktopLauncherLayout | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const stored = value as { groups?: unknown; removed?: unknown; deletedGroups?: unknown };
  if (!Array.isArray(stored.groups)) return undefined;

  const seen = new Set<string>();
  const groups: UmbraDesktopLauncherLayoutGroup[] = [];
  for (const candidate of stored.groups) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const group = candidate as { id?: unknown; label?: unknown; apps?: unknown };
    if (typeof group.id !== 'string' || group.id.length === 0 || seen.has(group.id)) continue;
    if (group.label !== null && typeof group.label !== 'string') continue;
    seen.add(group.id);
    groups.push({ id: group.id, label: group.label, apps: stringsIn(group.apps) });
  }
  return { groups, removed: stringsIn(stored.removed), deletedGroups: stringsIn(stored.deletedGroups) };
}
```

In `parseSettings`, add `layout?: unknown;` to the `payload` cast, and after the `readLocale` line:

```ts
  // Assigned only when readable: an absent layout is the ordinary case, not a default to write.
  const layout = readLayout(payload.layout);
  if (layout) settings.layout = layout;
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx web-test-runner "src/desktop/settings/settings-store.test.ts" --node-resolve`
Expected: PASS, including every existing case.

- [ ] **Step 6: Both gates**

Run: `npm run build && npm test`. Expected: both pass.

---

### Task 2: One alias resolver, and pin placement

**Files:**
- Modify: `settings/pinned.ts`
- Test: `settings/pinned.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `settings/pinned.test.ts` (extend the import to
`import { pinAppBefore, pinKeysFor, resolveAppAlias, resolvePinned, togglePinnedApp, withoutApp } from './pinned';`):

```ts
describe('resolving one stored alias', () => {
  const content = plain('content');
  const pkg = { ...plain('pkg-app'), coversSection: 'Pkg.Section' };

  it('finds an app by its own alias', () => {
    expect(resolveAppAlias([content, pkg], 'content')).to.equal(content);
  });

  it("follows a section's fallback alias to the app that now covers the section", () => {
    expect(resolveAppAlias([content, pkg], 'section:Pkg.Section')).to.equal(pkg);
  });

  it('finds nothing for an alias no app answers to', () => {
    expect(resolveAppAlias([content], 'gone')).to.equal(undefined);
  });
});

describe('placing a pin', () => {
  const a = plain('a');
  const b = plain('b');
  const c = plain('c');

  it('appends when no position is given', () => {
    expect(pinAppBefore(['a', 'b'], c)).to.deep.equal(['a', 'b', 'c']);
  });

  it('inserts before the app it is dropped on', () => {
    expect(pinAppBefore(['a', 'b'], c, b)).to.deep.equal(['a', 'c', 'b']);
  });

  it('moves an app that is already pinned rather than pinning it twice', () => {
    expect(pinAppBefore(['a', 'b', 'c'], c, a)).to.deep.equal(['c', 'a', 'b']);
  });

  it('appends when the app it is dropped before is itself', () => {
    expect(pinAppBefore(['a', 'b'], a, a)).to.deep.equal(['b', 'a']);
  });

  it('finds the position through a fallback alias', () => {
    const pkg = { ...plain('pkg-app'), coversSection: 'Pkg.Section' };
    expect(pinAppBefore(['section:Pkg.Section'], a, pkg)).to.deep.equal(['a', 'section:Pkg.Section']);
  });

  it('removes every key that stands for an app', () => {
    const pkg = { ...plain('pkg-app'), coversSection: 'Pkg.Section' };
    expect(withoutApp(['section:Pkg.Section', 'a', 'pkg-app'], pkg)).to.deep.equal(['a']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx web-test-runner "src/desktop/settings/pinned.test.ts" --node-resolve`
Expected: FAIL, `resolveAppAlias` / `pinAppBefore` / `withoutApp` are not exported.

- [ ] **Step 3: Implement**

In `settings/pinned.ts`, add after `togglePinnedApp`:

```ts
/**
 * The app a stored alias stands for: the app with that alias, or, for a section's fallback alias
 * (`section:<alias>`), the app that covers that section now (design D15 of the package catalogues
 * design).
 *
 * Shared by pins and by the launcher layout, which store aliases the same way and have to resolve
 * them the same way. Two copies of this rule would disagree the first time a package replaced a
 * fallback tile.
 * @param apps The apps this user may launch.
 * @param alias A stored alias.
 * @returns The app, or `undefined` when nothing answers to it.
 */
export function resolveAppAlias(apps: ReadonlyArray<UmbraDesktopApp>, alias: string): UmbraDesktopApp | undefined {
  return apps.find((candidate) => candidate.alias === alias) ?? coveringApp(apps, alias);
}

/**
 * The pinned list without an app: every key that stands for it, fallback alias included.
 * @param pinned The pinned aliases.
 * @param app The app to take out.
 * @returns A new list; the input is left untouched.
 */
export function withoutApp(pinned: ReadonlyArray<string>, app: UmbraDesktopApp): string[] {
  const keys = pinKeysFor(app, pinned);
  return pinned.filter((alias) => !keys.includes(alias));
}

/**
 * Pin an app at a position: before another pinned app, or at the end.
 *
 * Used by the launcher's drag and Move to, which say where a pin lands. An app that is already
 * pinned moves rather than appearing twice. `before` is matched through `pinKeysFor`, so a pin held
 * under a section's fallback alias is still a valid position.
 * @param pinned The pinned aliases.
 * @param app The app to pin.
 * @param before The pinned app it lands in front of; omitted, or the app itself, means the end.
 * @returns A new list; the input is left untouched.
 */
export function pinAppBefore(
  pinned: ReadonlyArray<string>,
  app: UmbraDesktopApp,
  before?: UmbraDesktopApp,
): string[] {
  const list = withoutApp(pinned, app);
  const at = before && before !== app ? list.findIndex((alias) => pinKeysFor(before, [alias]).length > 0) : -1;
  if (at === -1) list.push(app.alias);
  else list.splice(at, 0, app.alias);
  return list;
}
```

And make `resolvePinned` use the shared resolver: replace its loop body's first line with

```ts
    const app = resolveAppAlias(apps, alias);
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx web-test-runner "src/desktop/settings/pinned.test.ts" --node-resolve`
Expected: PASS, including every existing case.

- [ ] **Step 5: Both gates**

Run: `npm run build && npm test`. Expected: both pass.

---

### Task 3: Group order, group labels, and the catalogue's groups

**Files:**
- Modify: `group-apps.ts`
- Create: `launcher/group-labels.ts`
- Modify: `app-catalogue.context.ts`
- Test: `group-apps.test.ts` (append), `launcher/group-labels.test.ts` (new),
  `app-catalogue.context.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `group-apps.test.ts` (extend the import to `import { catalogueGroupOf, groupApps, launcherGroupOrder } from './group-apps';`):

```ts
it('orders the catalogue groups by weight with the reserved More group last', () => {
  const order = launcherGroupOrder([
    { alias: 'late', label: 'Late', weight: 50 },
    { alias: 'early', label: 'Early', weight: 5 },
  ]);
  expect(order.map((g) => g.alias)).to.deep.equal(['early', 'late', UMBRADESKTOP_MORE_GROUP_ALIAS]);
});

it("names an app's catalogue group, and More when its group is unset or unknown", () => {
  expect(catalogueGroupOf(app('logs', { group: 'diagnostics' }), groups)).to.equal('diagnostics');
  expect(catalogueGroupOf(app('stray', { group: 'nowhere' }), groups)).to.equal(UMBRADESKTOP_MORE_GROUP_ALIAS);
  expect(catalogueGroupOf(app('bare'), groups)).to.equal(UMBRADESKTOP_MORE_GROUP_ALIAS);
});
```

Create `launcher/group-labels.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { groupLabel } from './group-labels';
import { UMBRADESKTOP_MORE_GROUP_ALIAS, UMBRADESKTOP_MORE_GROUP_LABEL } from '../constants';
import type { UmbraDesktopGroup } from '../types';

/** The catalogue groups these cases name against, one curated and one from a package. */
const GROUPS: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#umbraDesktop_groupEditing', weight: 10 },
  { alias: 'games', label: 'Games', weight: 60 },
];

it("translates a catalogue group's label when the user has not renamed it", () => {
  expect(groupLabel('editing', null, GROUPS)).to.deep.equal({ text: '#umbraDesktop_groupEditing', translate: true });
});

it('names a group a package brought, not only the curated ones', () => {
  expect(groupLabel('games', null, GROUPS)).to.deep.equal({ text: 'Games', translate: true });
});

it('names the reserved More group', () => {
  expect(groupLabel(UMBRADESKTOP_MORE_GROUP_ALIAS, null, GROUPS)).to.deep.equal({
    text: UMBRADESKTOP_MORE_GROUP_LABEL,
    translate: true,
  });
});

it("shows the user's own text as it is, never through the translator", () => {
  expect(groupLabel('editing', '#not a token', GROUPS)).to.deep.equal({ text: '#not a token', translate: false });
});

it('falls back to the id for a group nobody knows any more', () => {
  expect(groupLabel('uninstalled', null, GROUPS)).to.deep.equal({ text: 'uninstalled', translate: false });
});
```

Append to `app-catalogue.context.test.ts`:

```ts
it('publishes the merged catalogue groups, including groups a package brings', async () => {
  const { context, registry, teardown } = await setup();
  try {
    registerCatalogue(registry, 'Pkg.Catalogue', { groups: [{ alias: 'pkg', label: 'Package', weight: 80 }], entries: [] });
    await settle();
    await settle();
    let groups: ReadonlyArray<{ alias: string }> = [];
    context.catalogueGroups.subscribe((value) => (groups = value)).unsubscribe();
    expect(groups.map((g) => g.alias)).to.include.members(['synchronisation', 'pkg']);
  } finally {
    teardown();
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run each file with `npx web-test-runner "<path>" --node-resolve`.
Expected: FAIL: the two new `group-apps` exports, `group-labels.ts` and `catalogueGroups` do not exist.

- [ ] **Step 3: Export the order and the group lookup from `group-apps.ts`**

Replace the body of `groupApps` and add two exports, so the one ordering rule serves both the
launcher's grouping and the layout's insertion rule:

```ts
/**
 * The catalogue groups in launcher order: by weight, then label, with the reserved "More" group
 * always last. Exported because the launcher layout inserts a returning catalogue group by this
 * order (design §4.2 step 4), and a second copy of the sort would drift from this one.
 * @param groups Curated and package groups, merged.
 * @returns A new list, More included.
 */
export function launcherGroupOrder(groups: ReadonlyArray<UmbraDesktopGroup>): UmbraDesktopGroup[] {
  const moreGroup: UmbraDesktopGroup = {
    alias: UMBRADESKTOP_MORE_GROUP_ALIAS,
    label: UMBRADESKTOP_MORE_GROUP_LABEL,
    weight: UMBRADESKTOP_MORE_GROUP_WEIGHT,
    auto: true,
  };
  return [...groups, moreGroup].sort((a, b) => byWeightThenKey(a.weight ?? 0, a.label, b.weight ?? 0, b.label));
}

/**
 * The catalogue group an app belongs to: its own `group` when that group exists, otherwise More.
 * @param app The app.
 * @param groups Curated and package groups, merged.
 * @returns A group alias.
 */
export function catalogueGroupOf(app: UmbraDesktopApp, groups: ReadonlyArray<UmbraDesktopGroup>): string {
  return app.group && groups.some((g) => g.alias === app.group) ? app.group : UMBRADESKTOP_MORE_GROUP_ALIAS;
}

export function groupApps(
  apps: ReadonlyArray<UmbraDesktopApp>,
  groups: ReadonlyArray<UmbraDesktopGroup>,
): UmbraDesktopLauncherGroup[] {
  return launcherGroupOrder(groups)
    .map((group) => ({
      group,
      apps: apps
        .filter((a) => catalogueGroupOf(a, groups) === group.alias)
        .slice()
        .sort((a, b) => byWeightThenKey(a.weight ?? 0, a.name, b.weight ?? 0, b.name)),
    }))
    .filter((lg) => lg.apps.length > 0);
}
```

Keep `groupApps`'s existing JSDoc above it.

- [ ] **Step 4: Create `launcher/group-labels.ts`**

```ts
import type { UmbraDesktopGroup } from '../types';
import { launcherGroupOrder } from '../group-apps';

/**
 * What a layout group is called, and whether that text goes through the translator.
 *
 * Two kinds of text reach a group heading. A catalogue label is a localisation token (or a package's
 * literal, which the translator passes through), so it follows the backoffice language. A name the
 * user typed is theirs and is shown exactly as typed: sending "#1 priorities" through the translator
 * would look it up as a token.
 */
export interface UmbraDesktopGroupLabel {
  /** A label to translate, or literal text. */
  text: string;
  /** Whether {@link text} goes through `localize.string`. */
  translate: boolean;
}

/**
 * Name a layout group (design §4.4).
 *
 * A `null` label is looked up by id among the merged catalogue groups plus the reserved More group,
 * so a group a package brings is named as well as a curated one. This is the registry the role
 * presets will extend: they pass their own groups alongside the catalogue's. A `null` label on an id
 * nobody knows shows the id, which only happens when a package's group is gone and the user had
 * moved other apps into it.
 * @param id The layout group's id.
 * @param label The stored label: `null` to look up, or the user's text.
 * @param groups The merged catalogue groups.
 * @returns The heading text, and whether to translate it.
 */
export function groupLabel(
  id: string,
  label: string | null,
  groups: ReadonlyArray<UmbraDesktopGroup>,
): UmbraDesktopGroupLabel {
  if (label !== null) return { text: label, translate: false };
  const known = launcherGroupOrder(groups).find((group) => group.alias === id);
  return known ? { text: known.label, translate: true } : { text: id, translate: false };
}
```

- [ ] **Step 5: Publish `catalogueGroups` from the catalogue context**

In `app-catalogue.context.ts`, add `UmbraDesktopGroup` to the `./types` import, and after the
`groups` declaration:

```ts
  #catalogueGroups = new UmbArrayState<UmbraDesktopGroup>([], (g) => g.alias);
  /**
   * Every group in the merged catalogue, curated and package, whether or not it holds an app for
   * this user. `groups` above holds only the ones with apps; the launcher layout needs all of them,
   * to name a group and to put a returning one back in catalogue order.
   */
  public readonly catalogueGroups = this.#catalogueGroups.asObservable();
```

In `#recompute`, after `this.#groups.setValue(...)`:

```ts
    this.#catalogueGroups.setValue(merged.catalogue.groups);
```

- [ ] **Step 6: Run the tests to see them pass**

Run the three files. Expected: PASS, including every existing `group-apps` case.

- [ ] **Step 7: Both gates**

Run: `npm run build && npm test`. Expected: both pass.

---

### Task 4: Building the view

**Files:**
- Create: `launcher/resolve-launcher.ts`
- Test: `launcher/resolve-launcher.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `launcher/resolve-launcher.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { effectiveLayout, resolveLauncher } from './resolve-launcher';
import type { UmbraDesktopLauncherInputs } from './resolve-launcher';
import { UMBRADESKTOP_MORE_GROUP_ALIAS } from '../constants';
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types';

/** Three catalogue groups, in weight order editing, diagnostics, system. */
const GROUPS: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#g_editing', weight: 10 },
  { alias: 'diagnostics', label: '#g_diagnostics', weight: 40 },
  { alias: 'system', label: '#g_system', weight: 50 },
];

/**
 * A stand-in app.
 * @param alias The alias.
 * @param group Its catalogue group.
 * @param weight Its weight within the group.
 * @returns The app.
 */
function app(alias: string, group?: string, weight = 0): UmbraDesktopApp {
  return { alias, name: alias, icon: 'icon-box', content: { kind: 'iframe', url: '/x' }, chromeProfile: 'bare', group, weight };
}

const content = app('content', 'editing', 10);
const media = app('media', 'editing', 20);
const logs = app('logs', 'diagnostics', 10);
const profiling = app('profiling', 'diagnostics', 20);
const settings = app('settings', 'system', 10);

/**
 * The catalogue inputs for a set of apps.
 * @param apps The apps this user may open.
 * @returns The inputs.
 */
const inputs = (apps: UmbraDesktopApp[]): UmbraDesktopLauncherInputs => ({ apps, catalogueGroups: GROUPS });

/**
 * The aliases in each view group, for compact assertions.
 * @param view The view.
 * @returns `[id, aliases]` pairs.
 */
const shape = (view: ReturnType<typeof resolveLauncher>) => view.groups.map((g) => [g.id, g.apps.map((a) => a.alias)]);

describe('with no stored layout', () => {
  it("is the catalogue's grouping, which is today's launcher", () => {
    const view = resolveLauncher(inputs([content, media, logs, settings]), { pinned: [] });
    expect(shape(view)).to.deep.equal([
      ['editing', ['content', 'media']],
      ['diagnostics', ['logs']],
      ['system', ['settings']],
    ]);
  });

  it('leaves a pinned app out of its group, because Pinned is a place (D4)', () => {
    const view = resolveLauncher(inputs([content, media, logs]), { pinned: ['content'] });
    expect(view.pinned.map((a) => a.alias)).to.deep.equal(['content']);
    expect(shape(view)).to.deep.equal([
      ['editing', ['media']],
      ['diagnostics', ['logs']],
    ]);
  });

  it('has an empty palette, because everything is on the launcher', () => {
    expect(resolveLauncher(inputs([content, logs]), { pinned: [] }).palette).to.deep.equal([]);
  });
});

describe('with a stored layout', () => {
  it("draws the user's groups in the user's order", () => {
    const layout = {
      groups: [
        { id: 'custom-1', label: 'Daily', apps: ['logs', 'content'] },
        { id: 'editing', label: null, apps: ['media'] },
      ],
      removed: [],
      deletedGroups: ['diagnostics'],
    };
    const view = resolveLauncher(inputs([content, media, logs]), { pinned: [], layout });
    expect(shape(view)).to.deep.equal([
      ['custom-1', ['logs', 'content']],
      ['editing', ['media']],
    ]);
    expect(view.groups[0].label).to.deep.equal({ text: 'Daily', translate: false });
    expect(view.groups[0].custom).to.equal(true);
    expect(view.groups[1].label).to.deep.equal({ text: '#g_editing', translate: true });
  });

  it('skips an app this user cannot open, keeps it stored, and shows it in place when it returns', () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['content', 'media'] }], removed: [], deletedGroups: [] };
    const without = { pinned: [], layout };
    expect(shape(resolveLauncher(inputs([media]), without))).to.deep.equal([['editing', ['media']]]);
    expect(effectiveLayout(inputs([media]), without).groups[0].apps).to.deep.equal(['content', 'media']);
    expect(shape(resolveLauncher(inputs([content, media]), without))).to.deep.equal([['editing', ['content', 'media']]]);
  });

  it('appends a new app to the end of its catalogue group (D3)', () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: [], deletedGroups: [] };
    const view = resolveLauncher(inputs([content, media]), { pinned: [], layout });
    expect(shape(view)).to.deep.equal([['editing', ['media', 'content']]]);
  });

  it("puts a new package group directly after the nearest catalogue group before it that the user still has", () => {
    const layout = {
      groups: [
        { id: 'system', label: null, apps: ['settings'] },
        { id: 'custom-1', label: 'Mine', apps: [] },
        { id: 'editing', label: null, apps: ['content'] },
      ],
      removed: [],
      deletedGroups: [],
    };
    const view = resolveLauncher(inputs([content, logs, settings]), { pinned: [], layout });
    expect(view.groups.map((g) => g.id)).to.deep.equal(['system', 'custom-1', 'editing', 'diagnostics']);
  });

  it('puts a new group first when no catalogue group before it is on the launcher', () => {
    const layout = { groups: [{ id: 'system', label: null, apps: ['settings'] }], removed: [], deletedGroups: [] };
    const view = resolveLauncher(inputs([content, settings]), { pinned: [], layout });
    expect(view.groups.map((g) => g.id)).to.deep.equal(['editing', 'system']);
  });

  it("keeps a deleted group's new apps in the palette instead of bringing the group back", () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['content'] }], removed: [], deletedGroups: ['diagnostics'] };
    const view = resolveLauncher(inputs([content, logs]), { pinned: [], layout });
    expect(view.groups.map((g) => g.id)).to.deep.equal(['editing']);
    expect(view.palette.map((p) => [p.group.alias, p.apps.map((a) => a.alias), p.onLauncher])).to.deep.equal([
      ['diagnostics', ['logs'], false],
    ]);
  });

  it('keeps a removed app off the launcher and in the palette, marked as belonging to a group that is there', () => {
    const layout = { groups: [{ id: 'diagnostics', label: null, apps: ['logs'] }], removed: ['profiling'], deletedGroups: [] };
    const view = resolveLauncher(inputs([logs, profiling]), { pinned: [], layout });
    expect(shape(view)).to.deep.equal([['diagnostics', ['logs']]]);
    expect(view.palette.map((p) => [p.group.alias, p.apps.map((a) => a.alias), p.onLauncher])).to.deep.equal([
      ['diagnostics', ['profiling'], true],
    ]);
  });

  it('returns an unpinned app with nowhere else to go to its catalogue group', () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: [], deletedGroups: [] };
    expect(shape(resolveLauncher(inputs([content, media]), { pinned: [], layout }))).to.deep.equal([
      ['editing', ['media', 'content']],
    ]);
  });

  it('shows an app listed twice only where it first appears', () => {
    const layout = {
      groups: [
        { id: 'editing', label: null, apps: ['content'] },
        { id: 'custom-1', label: 'Again', apps: ['content'] },
      ],
      removed: [],
      deletedGroups: [],
    };
    expect(shape(resolveLauncher(inputs([content]), { pinned: [], layout }))).to.deep.equal([
      ['editing', ['content']],
      ['custom-1', []],
    ]);
  });

  it("follows a section's fallback alias to the app that now covers the section", () => {
    const pkg = { ...app('pkg-app', 'system'), coversSection: 'Pkg.Section' };
    const layout = { groups: [{ id: 'custom-1', label: 'Mine', apps: ['section:Pkg.Section'] }], removed: [], deletedGroups: [] };
    expect(shape(resolveLauncher(inputs([pkg]), { pinned: [], layout }))).to.deep.equal([['custom-1', ['pkg-app']]]);
  });

  it('keeps empty groups in the view, so arrange mode can draw them as drop targets', () => {
    const layout = { groups: [{ id: 'custom-1', label: 'Empty', apps: [] }], removed: [], deletedGroups: [] };
    expect(shape(resolveLauncher(inputs([]), { pinned: [], layout }))).to.deep.equal([['custom-1', []]]);
  });

  it('files an app with no known group under More', () => {
    const stray = app('stray');
    const layout = { groups: [], removed: [], deletedGroups: [] };
    expect(shape(resolveLauncher(inputs([stray]), { pinned: [], layout }))).to.deep.equal([
      [UMBRADESKTOP_MORE_GROUP_ALIAS, ['stray']],
    ]);
  });

  it('never changes the stored layout it is given', () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: [], deletedGroups: [] };
    resolveLauncher(inputs([content, media, logs]), { pinned: [], layout });
    expect(layout).to.deep.equal({ groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: [], deletedGroups: [] });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx web-test-runner "src/desktop/launcher/resolve-launcher.test.ts" --node-resolve`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `launcher/resolve-launcher.ts`**

```ts
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types';
import type { UmbraDesktopLauncherLayout, UmbraDesktopLauncherLayoutGroup } from '../settings/types';
import { groupApps, launcherGroupOrder } from '../group-apps';
import { resolveAppAlias, resolvePinned } from '../settings/pinned';
import { groupLabel } from './group-labels';
import type { UmbraDesktopGroupLabel } from './group-labels';

/**
 * Building what the launcher shows (design §4.2). Pure: no DOM, no storage, no contexts.
 *
 * The launcher is always built from the catalogue. A stored layout is only the user's changes to it,
 * and anything the catalogue has that the layout does not mention is placed here, on every build,
 * rather than written into storage. That is what lets a package install keep showing up after the
 * user has arranged their launcher (design D2, D3).
 */

/** What the catalogue says exists for this user. */
export interface UmbraDesktopLauncherInputs {
  /** The apps this user may open, as the catalogue context publishes them (permissions applied). */
  apps: ReadonlyArray<UmbraDesktopApp>;
  /** Every group in the merged catalogue, curated and package. */
  catalogueGroups: ReadonlyArray<UmbraDesktopGroup>;
}

/** What the user has chosen: the pins, and their changes to the groups. */
export interface UmbraDesktopLauncherArrangement {
  /** The pinned aliases, which are the Pinned place (design D5). */
  pinned: ReadonlyArray<string>;
  /** The user's changes to the groups; absent when they have never arranged. */
  layout?: UmbraDesktopLauncherLayout;
}

/** One group as drawn. */
export interface UmbraDesktopLauncherViewGroup {
  /** The layout group's id. */
  id: string;
  /** Its heading. */
  label: UmbraDesktopGroupLabel;
  /** The apps it shows, in order. Empty groups are kept; normal mode skips them, arrange mode draws them. */
  apps: UmbraDesktopApp[];
  /** Whether it is the user's own group rather than a catalogue group. */
  custom: boolean;
}

/** One catalogue group's worth of apps that are not on the launcher. */
export interface UmbraDesktopPaletteGroup {
  /** The catalogue group. */
  group: UmbraDesktopGroup;
  /** Its apps that are not shown, in catalogue order. */
  apps: UmbraDesktopApp[];
  /** Whether the group itself is on the launcher: "Add all" when it is, "Add group" when not. */
  onLauncher: boolean;
}

/** Everything the launcher draws. */
export interface UmbraDesktopLauncherView {
  /** The Pinned place, in pin order. */
  pinned: UmbraDesktopApp[];
  /** The groups, in order. */
  groups: UmbraDesktopLauncherViewGroup[];
  /** What is not on the launcher, for arrange mode's palette. */
  palette: UmbraDesktopPaletteGroup[];
}

/**
 * A deep copy of a layout, so an edit never reaches back into the settings state it was read from.
 * @param layout The layout.
 * @returns An unshared copy.
 */
export function cloneLayout(layout: UmbraDesktopLauncherLayout): UmbraDesktopLauncherLayout {
  return {
    groups: layout.groups.map((group) => ({ ...group, apps: [...group.apps] })),
    removed: [...layout.removed],
    deletedGroups: [...layout.deletedGroups],
  };
}

/**
 * Insert a catalogue group where it belongs among the user's groups: directly after the nearest
 * catalogue group before it, in catalogue order, that the layout still holds, or first when there
 * is none. User groups have no catalogue position, so they only ever move with their neighbours.
 * @param groups The layout's groups; changed in place.
 * @param group The group to insert.
 * @param catalogueGroups The merged catalogue groups.
 */
export function insertCatalogueGroup(
  groups: UmbraDesktopLauncherLayoutGroup[],
  group: UmbraDesktopLauncherLayoutGroup,
  catalogueGroups: ReadonlyArray<UmbraDesktopGroup>,
): void {
  const order = launcherGroupOrder(catalogueGroups).map((g) => g.alias);
  const predecessors = order.slice(0, Math.max(order.indexOf(group.id), 0)).reverse();
  for (const predecessor of predecessors) {
    const at = groups.findIndex((g) => g.id === predecessor);
    if (at !== -1) {
      groups.splice(at + 1, 0, group);
      return;
    }
  }
  groups.unshift(group);
}

/**
 * The layout a launcher nobody has arranged is equivalent to: the catalogue's grouping over every
 * app that is not pinned, each group keeping its catalogue id and a `null` label.
 * @param inputs The catalogue.
 * @param pinned The pinned aliases.
 * @returns A fresh layout.
 */
function seedLayout(inputs: UmbraDesktopLauncherInputs, pinned: ReadonlyArray<string>): UmbraDesktopLauncherLayout {
  const pinnedApps = new Set(resolvePinned(inputs.apps, pinned));
  const unpinned = inputs.apps.filter((app) => !pinnedApps.has(app));
  return {
    groups: groupApps(unpinned, inputs.catalogueGroups).map((g) => ({
      id: g.group.alias,
      label: null,
      apps: g.apps.map((a) => a.alias),
    })),
    removed: [],
    deletedGroups: [],
  };
}

/**
 * The stored layout with every unplaced app written in (design §4.2 step 4), or the seed when
 * nothing is stored. This is what an edit starts from, so what the user sees is what gets saved,
 * and an alias they cannot open right now keeps its position.
 *
 * An unplaced app is one that is not pinned, not in any group and not removed: a new install, a
 * newly granted permission, or an app just unpinned. It goes to the end of its catalogue group; a
 * group the layout lacks is inserted by {@link insertCatalogueGroup}, unless the user deleted it, in
 * which case the app waits in the palette.
 * @param inputs The catalogue.
 * @param arrangement The pins and the stored layout.
 * @returns A fresh layout; nothing passed in is changed.
 */
export function effectiveLayout(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
): UmbraDesktopLauncherLayout {
  if (!arrangement.layout) return seedLayout(inputs, arrangement.pinned);
  const layout = cloneLayout(arrangement.layout);
  const pinnedApps = new Set(resolvePinned(inputs.apps, arrangement.pinned));
  const placed = new Set<UmbraDesktopApp>();
  for (const group of layout.groups) {
    for (const alias of group.apps) {
      const app = resolveAppAlias(inputs.apps, alias);
      if (app) placed.add(app);
    }
  }
  const removed = new Set(
    layout.removed.map((alias) => resolveAppAlias(inputs.apps, alias)).filter((a): a is UmbraDesktopApp => !!a),
  );

  // Walked in catalogue order, so two new groups arriving together are inserted in the right order
  // and the apps of one new group arrive sorted by weight.
  for (const catalogueGroup of groupApps(inputs.apps, inputs.catalogueGroups)) {
    const id = catalogueGroup.group.alias;
    for (const app of catalogueGroup.apps) {
      if (pinnedApps.has(app) || placed.has(app) || removed.has(app)) continue;
      const existing = layout.groups.find((g) => g.id === id);
      if (existing) existing.apps.push(app.alias);
      else if (!layout.deletedGroups.includes(id)) {
        insertCatalogueGroup(layout.groups, { id, label: null, apps: [app.alias] }, inputs.catalogueGroups);
      }
    }
  }
  return layout;
}

/**
 * Everything the launcher draws: the Pinned place, the groups, and the palette.
 *
 * An app is shown once at most: pinned apps are left out of every group, and an app listed twice
 * shows where it first appears. Aliases with no app behind them are skipped, never removed.
 * @param inputs The catalogue.
 * @param arrangement The pins and the stored layout.
 * @returns The view.
 */
export function resolveLauncher(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
): UmbraDesktopLauncherView {
  const pinned = resolvePinned(inputs.apps, arrangement.pinned);
  const pinnedApps = new Set(pinned);
  const layout = effectiveLayout(inputs, arrangement);
  const catalogueIds = new Set(launcherGroupOrder(inputs.catalogueGroups).map((g) => g.alias));
  const shown = new Set<UmbraDesktopApp>();

  const groups = layout.groups.map((group) => {
    const apps: UmbraDesktopApp[] = [];
    for (const alias of group.apps) {
      const app = resolveAppAlias(inputs.apps, alias);
      if (!app || pinnedApps.has(app) || shown.has(app)) continue;
      shown.add(app);
      apps.push(app);
    }
    return {
      id: group.id,
      label: groupLabel(group.id, group.label, inputs.catalogueGroups),
      apps,
      custom: !catalogueIds.has(group.id),
    };
  });

  const onLauncher = new Set(layout.groups.map((g) => g.id));
  const palette = groupApps(
    inputs.apps.filter((app) => !pinnedApps.has(app) && !shown.has(app)),
    inputs.catalogueGroups,
  ).map((g) => ({ group: g.group, apps: g.apps, onLauncher: onLauncher.has(g.group.alias) }));

  return { pinned, groups, palette };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx web-test-runner "src/desktop/launcher/resolve-launcher.test.ts" --node-resolve`
Expected: PASS.

- [ ] **Step 5: Both gates**

Run: `npm run build && npm test`. Expected: both pass.

---

### Task 5: The edits

**Files:**
- Create: `launcher/layout-edits.ts`
- Test: `launcher/layout-edits.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `launcher/layout-edits.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import {
  addApp,
  addGroup,
  createGroup,
  deleteGroup,
  moveApp,
  moveGroup,
  pinApp,
  removeApp,
  renameGroup,
  resetLayout,
} from './layout-edits';
import { resolveLauncher } from './resolve-launcher';
import type { UmbraDesktopLauncherArrangement, UmbraDesktopLauncherInputs } from './resolve-launcher';
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types';

const GROUPS: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#g_editing', weight: 10 },
  { alias: 'diagnostics', label: '#g_diagnostics', weight: 40 },
];

/**
 * A stand-in app.
 * @param alias The alias.
 * @param group Its catalogue group.
 * @param weight Its weight.
 * @returns The app.
 */
function app(alias: string, group: string, weight = 0): UmbraDesktopApp {
  return { alias, name: alias, icon: 'icon-box', content: { kind: 'iframe', url: '/x' }, chromeProfile: 'bare', group, weight };
}

const content = app('content', 'editing', 10);
const media = app('media', 'editing', 20);
const logs = app('logs', 'diagnostics', 10);
const profiling = app('profiling', 'diagnostics', 20);
const INPUTS: UmbraDesktopLauncherInputs = { apps: [content, media, logs, profiling], catalogueGroups: GROUPS };
const UNTOUCHED: UmbraDesktopLauncherArrangement = { pinned: [] };

/**
 * The launcher an arrangement draws, as `[id, aliases]` pairs.
 * @param arrangement The arrangement.
 * @returns The shape.
 */
const drawn = (arrangement: UmbraDesktopLauncherArrangement) =>
  resolveLauncher(INPUTS, arrangement).groups.map((g) => [g.id, g.apps.map((a) => a.alias)]);

describe('pinning', () => {
  it('stores no layout for a pin on an unarranged launcher, so the catalogue order keeps reaching the user', () => {
    const result = pinApp(INPUTS, UNTOUCHED, logs);
    expect(result).to.deep.equal({ pinned: ['logs'], layout: undefined });
  });

  it('takes the app out of its group on an arranged launcher', () => {
    const arranged = moveApp(INPUTS, UNTOUCHED, media, 'editing', content);
    const result = pinApp(INPUTS, arranged, media);
    expect(result.pinned).to.deep.equal(['media']);
    expect(result.layout?.groups.find((g) => g.id === 'editing')?.apps).to.deep.equal(['content']);
  });

  it('pins before another pinned app', () => {
    expect(pinApp(INPUTS, { pinned: ['content'] }, logs, content).pinned).to.deep.equal(['logs', 'content']);
  });
});

describe('moving', () => {
  it('moves an app between groups and stores the layout', () => {
    const result = moveApp(INPUTS, UNTOUCHED, logs, 'editing', media);
    expect(drawn(result)).to.deep.equal([
      ['editing', ['content', 'logs', 'media']],
      ['diagnostics', ['profiling']],
    ]);
  });

  it('unpins an app moved out of Pinned', () => {
    const result = moveApp(INPUTS, { pinned: ['content'] }, content, 'diagnostics');
    expect(result.pinned).to.deep.equal([]);
    expect(drawn(result)[1]).to.deep.equal(['diagnostics', ['logs', 'profiling', 'content']]);
  });

  it('keeps a hidden alias in place when the group around it changes', () => {
    const arrangement = {
      pinned: [],
      layout: { groups: [{ id: 'editing', label: null, apps: ['hidden', 'content', 'media'] }], removed: [], deletedGroups: [] },
    };
    const result = moveApp(INPUTS, arrangement, media, 'editing', content);
    expect(result.layout?.groups[0].apps).to.deep.equal(['hidden', 'media', 'content']);
  });

  it('changes nothing when an app is dropped before itself', () => {
    const result = moveApp(INPUTS, UNTOUCHED, content, 'editing', content);
    expect(result).to.deep.equal({ pinned: [], layout: undefined });
  });
});

describe('removing and adding back', () => {
  it('removes an app into the removed list and the palette', () => {
    const result = removeApp(INPUTS, UNTOUCHED, profiling);
    expect(result.layout?.removed).to.deep.equal(['profiling']);
    expect(resolveLauncher(INPUTS, result).palette[0].apps.map((a) => a.alias)).to.deep.equal(['profiling']);
  });

  it('unpins an app removed from Pinned', () => {
    expect(removeApp(INPUTS, { pinned: ['logs'] }, logs).pinned).to.deep.equal([]);
  });

  it('adds an app back to the end of its catalogue group', () => {
    const removed = removeApp(INPUTS, removeApp(INPUTS, UNTOUCHED, logs), profiling);
    const result = addApp(INPUTS, removed, logs);
    expect(drawn(result)).to.deep.equal([
      ['editing', ['content', 'media']],
      ['diagnostics', ['logs']],
    ]);
  });

  it('brings a deleted group back when one of its apps is added', () => {
    const deleted = deleteGroup(INPUTS, UNTOUCHED, 'diagnostics');
    const result = addApp(INPUTS, deleted, profiling);
    expect(result.layout?.deletedGroups).to.deep.equal([]);
    expect(drawn(result)).to.deep.equal([
      ['editing', ['content', 'media']],
      ['diagnostics', ['profiling']],
    ]);
  });

  it('adds a whole deleted group back with every app waiting for it', () => {
    const result = addGroup(INPUTS, deleteGroup(INPUTS, UNTOUCHED, 'diagnostics'), 'diagnostics');
    expect(drawn(result)).to.deep.equal([
      ['editing', ['content', 'media']],
      ['diagnostics', ['logs', 'profiling']],
    ]);
    expect(result.layout?.removed).to.deep.equal([]);
  });
});

describe('groups', () => {
  it("deletes a catalogue group: its apps are removed and its id remembered, so it does not come back", () => {
    const result = deleteGroup(INPUTS, UNTOUCHED, 'diagnostics');
    expect(result.layout?.removed).to.deep.equal(['logs', 'profiling']);
    expect(result.layout?.deletedGroups).to.deep.equal(['diagnostics']);
    expect(drawn(result)).to.deep.equal([['editing', ['content', 'media']]]);
  });

  it("deletes a user's group without recording it as a deleted catalogue group", () => {
    const created = createGroup(INPUTS, UNTOUCHED, 'custom-1', 'Mine');
    const moved = moveApp(INPUTS, created, logs, 'custom-1');
    const result = deleteGroup(INPUTS, moved, 'custom-1');
    expect(result.layout?.deletedGroups).to.deep.equal([]);
    expect(result.layout?.removed).to.deep.equal(['logs']);
  });

  it('creates an empty group at the end', () => {
    const result = createGroup(INPUTS, UNTOUCHED, 'custom-1', 'Mine');
    expect(result.layout?.groups.at(-1)).to.deep.equal({ id: 'custom-1', label: 'Mine', apps: [] });
  });

  it('renames a group to literal text', () => {
    const result = renameGroup(INPUTS, UNTOUCHED, 'editing', '  Writing  ');
    expect(result.layout?.groups[0].label).to.equal('Writing');
  });

  it("restores a catalogue group's translated name when its name is cleared", () => {
    const renamed = renameGroup(INPUTS, UNTOUCHED, 'editing', 'Writing');
    expect(renameGroup(INPUTS, renamed, 'editing', '   ').layout?.groups[0].label).to.equal(null);
  });

  it("keeps a user's group's name when it is cleared", () => {
    const created = createGroup(INPUTS, UNTOUCHED, 'custom-1', 'Mine');
    expect(renameGroup(INPUTS, created, 'custom-1', '').layout?.groups.at(-1)?.label).to.equal('Mine');
  });

  it('moves a group before another, or to the end', () => {
    expect(drawn(moveGroup(INPUTS, UNTOUCHED, 'diagnostics', 'editing')).map(([id]) => id)).to.deep.equal([
      'diagnostics',
      'editing',
    ]);
    expect(drawn(moveGroup(INPUTS, UNTOUCHED, 'editing')).map(([id]) => id)).to.deep.equal(['diagnostics', 'editing']);
  });
});

describe('reset', () => {
  it('deletes the layout and keeps the pins (D10)', () => {
    const arranged = removeApp(INPUTS, { pinned: ['content'] }, logs);
    expect(resetLayout(arranged)).to.deep.equal({ pinned: ['content'], layout: undefined });
  });
});

it('never changes the arrangement it is given', () => {
  const arrangement = {
    pinned: ['content'],
    layout: { groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: [], deletedGroups: [] },
  };
  const before = JSON.stringify(arrangement);
  removeApp(INPUTS, arrangement, media);
  moveApp(INPUTS, arrangement, logs, 'editing');
  pinApp(INPUTS, arrangement, media);
  deleteGroup(INPUTS, arrangement, 'editing');
  expect(JSON.stringify(arrangement)).to.equal(before);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx web-test-runner "src/desktop/launcher/layout-edits.test.ts" --node-resolve`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `launcher/layout-edits.ts`**

```ts
import type { UmbraDesktopApp } from '../types';
import type { UmbraDesktopLauncherLayout, UmbraDesktopLauncherLayoutGroup } from '../settings/types';
import { catalogueGroupOf, launcherGroupOrder } from '../group-apps';
import { pinAppBefore, resolveAppAlias, withoutApp } from '../settings/pinned';
import { cloneLayout, effectiveLayout, insertCatalogueGroup, resolveLauncher } from './resolve-launcher';
import type { UmbraDesktopLauncherArrangement, UmbraDesktopLauncherInputs } from './resolve-launcher';

/**
 * One pure function per thing a user can do to the launcher (design §4.3).
 *
 * Every edit starts from the **effective** layout, the stored one with new apps written in, so what
 * the user sees is what is saved. Positions are "before this app" or "at the end", never an index,
 * because an index counts differently once aliases this user cannot open are interleaved.
 *
 * Nothing passed in is changed. Each edit returns a new `{ pinned, layout }` for
 * `setLauncherArrangement`, one settings write per user action.
 */

/**
 * An unshared copy of an arrangement, for the edits that turn out to change nothing.
 * @param arrangement The arrangement.
 * @returns A copy.
 */
function unchanged(arrangement: UmbraDesktopLauncherArrangement): UmbraDesktopLauncherArrangement {
  return { pinned: [...arrangement.pinned], layout: arrangement.layout ? cloneLayout(arrangement.layout) : undefined };
}

/**
 * Whether a stored alias stands for an app.
 * @param inputs The catalogue.
 * @param alias A stored alias.
 * @param app The app.
 * @returns True when the alias resolves to it.
 */
function standsFor(inputs: UmbraDesktopLauncherInputs, alias: string, app: UmbraDesktopApp): boolean {
  return resolveAppAlias(inputs.apps, alias) === app;
}

/**
 * Take an app out of every group and out of the removed list, so it can be put somewhere once.
 * @param inputs The catalogue.
 * @param layout The layout; changed in place.
 * @param app The app.
 */
function lift(inputs: UmbraDesktopLauncherInputs, layout: UmbraDesktopLauncherLayout, app: UmbraDesktopApp): void {
  for (const group of layout.groups) group.apps = group.apps.filter((alias) => !standsFor(inputs, alias, app));
  layout.removed = layout.removed.filter((alias) => !standsFor(inputs, alias, app));
}

/**
 * Put an alias into a list before the alias standing for another app, or at the end.
 * @param inputs The catalogue.
 * @param list The list; changed in place.
 * @param alias The alias to insert.
 * @param before The app it lands in front of, if any.
 */
function insertBefore(inputs: UmbraDesktopLauncherInputs, list: string[], alias: string, before?: UmbraDesktopApp): void {
  const at = before ? list.findIndex((candidate) => standsFor(inputs, candidate, before)) : -1;
  if (at === -1) list.push(alias);
  else list.splice(at, 0, alias);
}

/**
 * Whether an id names a catalogue group (curated, package, or More) rather than one the user made.
 * @param inputs The catalogue.
 * @param id A layout group id.
 * @returns True for a catalogue group.
 */
function isCatalogueGroup(inputs: UmbraDesktopLauncherInputs, id: string): boolean {
  return launcherGroupOrder(inputs.catalogueGroups).some((group) => group.alias === id);
}

/**
 * The layout's group for a catalogue group, brought back first if the user deleted it or it is
 * missing, at its catalogue position.
 * @param inputs The catalogue.
 * @param layout The layout; changed in place.
 * @param id The catalogue group's alias.
 * @returns The group.
 */
function ensureCatalogueGroup(
  inputs: UmbraDesktopLauncherInputs,
  layout: UmbraDesktopLauncherLayout,
  id: string,
): UmbraDesktopLauncherLayoutGroup {
  layout.deletedGroups = layout.deletedGroups.filter((deleted) => deleted !== id);
  let group = layout.groups.find((g) => g.id === id);
  if (!group) {
    group = { id, label: null, apps: [] };
    insertCatalogueGroup(layout.groups, group, inputs.catalogueGroups);
  }
  return group;
}

/**
 * A fresh id for a group the user creates. Not `crypto.randomUUID`, which only exists in a secure
 * context, and a backoffice on plain http on an intranet host is not one.
 * @returns A `custom-` id.
 */
export function newGroupId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Move an app into a group, before another app or at the end. Unpins it if it was pinned.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param app The app being moved.
 * @param groupId The target group.
 * @param before The app it lands in front of; omitted means the end.
 * @returns The new arrangement.
 */
export function moveApp(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  app: UmbraDesktopApp,
  groupId: string,
  before?: UmbraDesktopApp,
): UmbraDesktopLauncherArrangement {
  if (before === app) return unchanged(arrangement);
  const layout = effectiveLayout(inputs, arrangement);
  const target = layout.groups.find((g) => g.id === groupId);
  if (!target) return unchanged(arrangement);
  lift(inputs, layout, app);
  insertBefore(inputs, target.apps, app.alias, before);
  return { pinned: withoutApp(arrangement.pinned, app), layout };
}

/**
 * Pin an app, before another pinned app or at the end. On a launcher nobody has arranged this
 * changes the pins alone: a pinned app is left out of the groups anyway, and storing a layout for a
 * pin would freeze the catalogue order for this user (design §4.3).
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param app The app being pinned.
 * @param before The pinned app it lands in front of; omitted means the end.
 * @returns The new arrangement.
 */
export function pinApp(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  app: UmbraDesktopApp,
  before?: UmbraDesktopApp,
): UmbraDesktopLauncherArrangement {
  const pinned = pinAppBefore(arrangement.pinned, app, before);
  if (!arrangement.layout) return { pinned, layout: undefined };
  const layout = effectiveLayout(inputs, arrangement);
  lift(inputs, layout, app);
  return { pinned, layout };
}

/**
 * Take an app off the launcher. It waits in the palette and in All apps. Unpins it if pinned.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param app The app.
 * @returns The new arrangement.
 */
export function removeApp(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  app: UmbraDesktopApp,
): UmbraDesktopLauncherArrangement {
  const layout = effectiveLayout(inputs, arrangement);
  lift(inputs, layout, app);
  layout.removed.push(app.alias);
  return { pinned: withoutApp(arrangement.pinned, app), layout };
}

/**
 * Put an app from the palette back at the end of its catalogue group, bringing the group back if
 * it had been deleted.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param app The app.
 * @returns The new arrangement.
 */
export function addApp(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  app: UmbraDesktopApp,
): UmbraDesktopLauncherArrangement {
  const layout = effectiveLayout(inputs, arrangement);
  lift(inputs, layout, app);
  ensureCatalogueGroup(inputs, layout, catalogueGroupOf(app, inputs.catalogueGroups)).apps.push(app.alias);
  return { pinned: [...arrangement.pinned], layout };
}

/**
 * Put a whole catalogue group back with every palette app that belongs to it ("Add group" and
 * "Add all").
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param groupId The catalogue group's alias.
 * @returns The new arrangement.
 */
export function addGroup(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  groupId: string,
): UmbraDesktopLauncherArrangement {
  const waiting = resolveLauncher(inputs, arrangement).palette.find((p) => p.group.alias === groupId)?.apps ?? [];
  const layout = effectiveLayout(inputs, arrangement);
  const group = ensureCatalogueGroup(inputs, layout, groupId);
  for (const app of waiting) {
    lift(inputs, layout, app);
    group.apps.push(app.alias);
  }
  return { pinned: [...arrangement.pinned], layout };
}

/**
 * Delete a group. Its apps go to the palette, hidden aliases included, so they stay off when access
 * returns. A catalogue group is remembered as deleted, so its new apps wait in the palette rather
 * than bringing it back (design D3).
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param groupId The group.
 * @returns The new arrangement.
 */
export function deleteGroup(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  groupId: string,
): UmbraDesktopLauncherArrangement {
  const layout = effectiveLayout(inputs, arrangement);
  const group = layout.groups.find((g) => g.id === groupId);
  if (!group) return unchanged(arrangement);
  layout.groups = layout.groups.filter((g) => g !== group);
  for (const alias of group.apps) if (!layout.removed.includes(alias)) layout.removed.push(alias);
  if (isCatalogueGroup(inputs, groupId) && !layout.deletedGroups.includes(groupId)) layout.deletedGroups.push(groupId);
  return { pinned: [...arrangement.pinned], layout };
}

/**
 * Create an empty group at the end.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param id Its id, from {@link newGroupId}; a parameter so a test can name it.
 * @param label Its name.
 * @returns The new arrangement.
 */
export function createGroup(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  id: string,
  label: string,
): UmbraDesktopLauncherArrangement {
  const layout = effectiveLayout(inputs, arrangement);
  layout.groups.push({ id, label, apps: [] });
  return { pinned: [...arrangement.pinned], layout };
}

/**
 * Rename a group. Clearing a catalogue group's name gives it back its translated name; a group the
 * user made cannot be left nameless, so clearing it changes nothing.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param groupId The group.
 * @param text What the user typed.
 * @returns The new arrangement.
 */
export function renameGroup(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  groupId: string,
  text: string,
): UmbraDesktopLauncherArrangement {
  const layout = effectiveLayout(inputs, arrangement);
  const group = layout.groups.find((g) => g.id === groupId);
  if (!group) return unchanged(arrangement);
  const trimmed = text.trim();
  if (trimmed) group.label = trimmed;
  else if (isCatalogueGroup(inputs, groupId)) group.label = null;
  else return unchanged(arrangement);
  return { pinned: [...arrangement.pinned], layout };
}

/**
 * Move a group before another group, or to the end.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param groupId The group being moved.
 * @param beforeId The group it lands in front of; omitted means the end.
 * @returns The new arrangement.
 */
export function moveGroup(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  groupId: string,
  beforeId?: string,
): UmbraDesktopLauncherArrangement {
  if (beforeId === groupId) return unchanged(arrangement);
  const layout = effectiveLayout(inputs, arrangement);
  const group = layout.groups.find((g) => g.id === groupId);
  if (!group) return unchanged(arrangement);
  layout.groups = layout.groups.filter((g) => g !== group);
  const at = beforeId ? layout.groups.findIndex((g) => g.id === beforeId) : -1;
  if (at === -1) layout.groups.push(group);
  else layout.groups.splice(at, 0, group);
  return { pinned: [...arrangement.pinned], layout };
}

/**
 * Back to the catalogue's grouping. Pins stay: a button in the launcher should not rearrange the
 * taskbar (design D10).
 * @param arrangement The current arrangement.
 * @returns The arrangement without a layout.
 */
export function resetLayout(arrangement: UmbraDesktopLauncherArrangement): UmbraDesktopLauncherArrangement {
  return { pinned: [...arrangement.pinned], layout: undefined };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx web-test-runner "src/desktop/launcher/layout-edits.test.ts" --node-resolve`
Expected: PASS. If "moves an app between groups" fails on order, check that `insertBefore` finds
`before` through `standsFor` after `lift` has run, not before.

- [ ] **Step 5: Both gates**

Run: `npm run build && npm test`. Expected: both pass.

---

### Task 6: One settings write per launcher action

**Files:**
- Modify: `settings/settings.context.ts`
- Test: `settings/settings.context.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `settings/settings.context.test.ts`:

```ts
describe('the launcher arrangement', () => {
  const LAYOUT = { groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: ['profiling'], deletedGroups: [] };

  it('writes the pins and the layout together', async () => {
    const context = await contextOnHost();
    context.setLauncherArrangement(['content'], LAYOUT);
    let seen: { pinned: string[]; layout?: unknown } | undefined;
    context.settings.subscribe((s) => (seen = { pinned: s.pinned, layout: s.layout })).unsubscribe();
    expect(seen).to.deep.equal({ pinned: ['content'], layout: LAYOUT });
  });

  it('clears the layout and keeps the pins when handed no layout, which is Reset', async () => {
    const context = await contextOnHost();
    context.setLauncherArrangement(['content'], LAYOUT);
    context.setLauncherArrangement(['content'], undefined);
    let layout: unknown = 'unset';
    let pinned: string[] = [];
    context.layout.subscribe((value) => (layout = value)).unsubscribe();
    context.pinned.subscribe((value) => (pinned = value)).unsubscribe();
    expect(layout).to.equal(undefined);
    expect(pinned).to.deep.equal(['content']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx web-test-runner "src/desktop/settings/settings.context.test.ts" --node-resolve`
Expected: FAIL, `setLauncherArrangement` and `layout` do not exist.

- [ ] **Step 3: Implement**

In `settings/settings.context.ts`, add `UmbraDesktopLauncherLayout` to the `./types` import. After
the `pinned` observable:

```ts
  /** The user's changes to the launcher; `undefined` when they have never arranged it. */
  public readonly layout = this.#settings.asObservablePart((settings) => settings.layout);
```

After `togglePin`:

```ts
  /**
   * Store the result of one launcher action: the pins and the layout, in one write.
   *
   * One method for both because a single drag can change both (pinning an app takes it out of its
   * group), and two writes would put two round trips on the account for one gesture. The launcher
   * computes the result with `launcher/layout-edits.ts`, since it has the catalogue and this context
   * deliberately does not. Passing `undefined` as the layout is Reset.
   * @param pinned The new pinned aliases.
   * @param layout The new layout, or `undefined` for the catalogue's grouping.
   */
  public setLauncherArrangement(pinned: ReadonlyArray<string>, layout: UmbraDesktopLauncherLayout | undefined): void {
    this.#update({ pinned: [...pinned], layout });
  }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx web-test-runner "src/desktop/settings/settings.context.test.ts" --node-resolve`
Expected: PASS.

- [ ] **Step 5: Both gates**

Run: `npm run build && npm test`. Expected: both pass.

---

## Why the drawer and arrange mode are not their own elements

The design's §7 table lists `launcher-drawer.element.ts` and `launcher-arrange.element.ts`. Planning
found that would break every theme: `UmbraDesktopThemeStyles` adopts a theme's `launcher` sheet into
the launcher's **own** shadow root, so anything rendered inside a child element's shadow root is out
of every theme's reach, and adopting the same sheet into the children would apply its `:host` rules
(Windows 98's bevel padding, for one) twice. So both are **controllers** that render into the
launcher's shadow root and export their CSS for the launcher's `static styles`:
`launcher/drawer.controller.ts` and `launcher/arrange.controller.ts`. That also gives drag one
shadow root to hit-test, and keeps `tokens.test.ts` scanning one element. Task 14 corrects the design
doc to match.

---

### Task 7: The launcher draws the model

Normal mode renders `resolveLauncher`'s view. The pin badge stays until Task 10, so pinning never
becomes impossible halfway through the branch.

**Files:**
- Modify: `constants.ts` (one constant)
- Modify: `components/launcher.element.ts`
- Create: `components/launcher.test-helper.ts`
- Create: `components/launcher-layout.test.ts`
- Modify: `components/launcher-long-names.test.ts` (its catalogue stub gains `catalogueGroups`)

- [ ] **Step 1: Add the Pinned target id**

Append to `constants.ts`:

```ts
/**
 * The id the launcher uses for the Pinned place wherever it needs a group-shaped id: drop targets
 * and Move to. Starts with `@` because a layout group id is a catalogue alias or `custom-…`, and a
 * package could otherwise register a group called `pinned`.
 */
export const UMBRADESKTOP_PINNED_GROUP_ID = '@pinned';
```

- [ ] **Step 2: Write the shared mount helper**

Create `components/launcher.test-helper.ts`:

```ts
import './launcher.element.js';
import type { UmbraDesktopLauncherElement } from './launcher.element.js';
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types.js';
import type { UmbraDesktopLauncherLayout } from '../settings/types.js';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';

/**
 * Mounting a launcher with the three contexts it reads, stubbed to the parts it uses.
 *
 * A plain host appended to the body rather than an open-wc `fixture`, for the reason
 * `launcher-long-names.test.ts` gives: a fixture belongs to mocha's per-test teardown, and a mount
 * made in a `before` hook has to outlive it. Callers remove the mount themselves.
 */

/** One stored write, as the settings context would receive it. */
export interface UmbraDesktopLauncherWrite {
  pinned: string[];
  layout?: UmbraDesktopLauncherLayout;
}

/** A mounted launcher and what it did. */
export interface UmbraDesktopLauncherMount {
  /** The element. */
  launcher: UmbraDesktopLauncherElement;
  /** Its shadow root, for queries. */
  root: ShadowRoot;
  /** Every `setLauncherArrangement` call, in order. The stub applies each one, like the real context. */
  writes: UmbraDesktopLauncherWrite[];
  /** Every app the launcher asked the window manager to open. */
  launched: UmbraDesktopApp[];
  /** Wait for the launcher to render whatever the last action changed. */
  settle(): Promise<void>;
  /** Take the mount out of the page. */
  remove(): void;
}

/** What to mount. */
export interface UmbraDesktopLauncherMountOptions {
  apps: UmbraDesktopApp[];
  groups: UmbraDesktopGroup[];
  pinned?: string[];
  layout?: UmbraDesktopLauncherLayout;
  /** The wrapper's width in px; the launcher's own width token still applies inside it. */
  width?: number;
}

/**
 * Mount a launcher.
 * @param options The catalogue and the stored arrangement.
 * @returns The mount.
 */
export async function mountLauncher(options: UmbraDesktopLauncherMountOptions): Promise<UmbraDesktopLauncherMount> {
  const wrapper = document.createElement('div');
  wrapper.style.width = `${options.width ?? 1180}px`;
  document.body.appendChild(wrapper);

  const apps = new UmbArrayState<UmbraDesktopApp>(options.apps, (a) => a.alias);
  const catalogueGroups = new UmbArrayState<UmbraDesktopGroup>(options.groups, (g) => g.alias);
  new UmbContextProvider(wrapper, UMBRADESKTOP_APP_CATALOGUE_CONTEXT, {
    apps: apps.asObservable(),
    catalogueGroups: catalogueGroups.asObservable(),
    isRefRegistered: () => true,
    getEntryRef: () => undefined,
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const settings = new UmbObjectState<UmbraDesktopLauncherWrite>({ pinned: options.pinned ?? [], layout: options.layout });
  const writes: UmbraDesktopLauncherWrite[] = [];
  new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
    pinned: settings.asObservablePart((s) => s.pinned),
    layout: settings.asObservablePart((s) => s.layout),
    setLauncherArrangement: (pinned: ReadonlyArray<string>, layout?: UmbraDesktopLauncherLayout) => {
      const write = { pinned: [...pinned], layout };
      writes.push(write);
      settings.setValue(write);
    },
    togglePin: () => undefined,
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const launched: UmbraDesktopApp[] = [];
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, {
    open: (app: UmbraDesktopApp) => launched.push(app),
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const launcher = document.createElement('umbradesktop-launcher') as UmbraDesktopLauncherElement;
  wrapper.appendChild(launcher);
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await launcher.updateComplete;
  };
  await settle();
  return { launcher, root: launcher.shadowRoot!, writes, launched, settle, remove: () => wrapper.remove() };
}

/**
 * A stand-in app.
 * @param alias The alias, also used as the name.
 * @param group Its catalogue group.
 * @param weight Its weight within the group.
 * @returns The app.
 */
export function stubApp(alias: string, group?: string, weight = 0): UmbraDesktopApp {
  return { alias, name: alias, icon: 'icon-box', content: { kind: 'iframe', url: '/umbraco' }, chromeProfile: 'bare', group, weight };
}

/**
 * The aliases a launcher shows per card, keyed by the card's group id (the Pinned id for Pinned),
 * for compact assertions. Keyed by id rather than heading because tests do not load the
 * localization files, so a heading drawn from a term would read as its raw key.
 * @param root The launcher's shadow root.
 * @returns `[group id, aliases]` per card, in order.
 */
export function cardsOf(root: ShadowRoot): Array<[string, string[]]> {
  return [...root.querySelectorAll<HTMLElement>('.body .card[data-group]')].map((card) => [
    card.dataset.group ?? '',
    [...card.querySelectorAll<HTMLElement>('.tile[data-alias]')].map((tile) => tile.dataset.alias!),
  ]);
}

/**
 * The group headings in normal mode, for the cases about names rather than contents.
 * @param root The launcher's shadow root.
 * @returns The heading texts, in order.
 */
export function headingsOf(root: ShadowRoot): string[] {
  return [...root.querySelectorAll<HTMLElement>('.body .card .ch')].map((heading) => heading.textContent?.trim() ?? '');
}

/**
 * Drive a mouse drag from one element to another through the launcher's drag controller: press on
 * the source, move past the threshold, move onto the target, release there.
 * @param source The element to press on (its `pointerdown` handler starts the drag).
 * @param target The element to release over; its centre is used.
 */
export function dragOnto(source: Element, target: Element): void {
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const at = (type: string, x: number, y: number, on: EventTarget) =>
    on.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: y, pointerId: 11, pointerType: 'mouse', button: 0, bubbles: true, composed: true }),
    );
  const x0 = from.left + from.width / 2;
  const y0 = from.top + from.height / 2;
  at('pointerdown', x0, y0, source);
  at('pointermove', x0 + 10, y0, window);
  at('pointermove', to.left + to.width / 2, to.top + to.height / 2, window);
  at('pointerup', to.left + to.width / 2, to.top + to.height / 2, window);
}
```

- [ ] **Step 3: Write the failing tests**

Create `components/launcher-layout.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { cardsOf, headingsOf, mountLauncher, stubApp } from './launcher.test-helper.js';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';
import type { UmbraDesktopGroup } from '../types.js';

/**
 * The launcher draws `resolveLauncher`'s view: the catalogue's grouping by default, the user's
 * changes when there are some, and each app in one place only.
 */

const TIMEOUT_MS = 20_000;
const GROUPS: UmbraDesktopGroup[] = [
  { alias: 'editing', label: 'Editing', weight: 10 },
  { alias: 'diagnostics', label: 'Diagnostics', weight: 40 },
];
const APPS = [stubApp('content', 'editing', 10), stubApp('media', 'editing', 20), stubApp('logs', 'diagnostics', 10)];

let mount: UmbraDesktopLauncherMount | undefined;
afterEach(() => {
  mount?.remove();
  mount = undefined;
});

it("draws the catalogue's grouping when nothing is arranged", async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  expect(cardsOf(mount.root)).to.deep.equal([
    ['editing', ['content', 'media']],
    ['diagnostics', ['logs']],
  ]);
});

it('draws a pinned app in Pinned only, not also in its group', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS, pinned: ['logs'] });
  expect(cardsOf(mount.root)).to.deep.equal([
    [UMBRADESKTOP_PINNED_GROUP_ID, ['logs']],
    ['editing', ['content', 'media']],
  ]);
});

it("draws the user's groups in their order, with their own names shown as typed", async function () {
  this.timeout(TIMEOUT_MS);
  const layout = {
    groups: [
      { id: 'custom-1', label: 'Daily', apps: ['logs'] },
      { id: 'editing', label: null, apps: ['media', 'content'] },
    ],
    removed: [],
    deletedGroups: ['diagnostics'],
  };
  mount = await mountLauncher({ apps: APPS, groups: GROUPS, layout });
  expect(cardsOf(mount.root)).to.deep.equal([
    ['custom-1', ['logs']],
    ['editing', ['media', 'content']],
  ]);
  expect(headingsOf(mount.root)).to.deep.equal(['Daily', 'Editing']);
});

it('draws no card for a group with nothing in it', async function () {
  this.timeout(TIMEOUT_MS);
  const layout = { groups: [{ id: 'custom-1', label: 'Empty', apps: [] }], removed: ['content', 'media', 'logs'], deletedGroups: [] };
  mount = await mountLauncher({ apps: APPS, groups: GROUPS, layout });
  expect(cardsOf(mount.root).map(([id]) => id)).to.not.include('custom-1');
});

it('launches an app when its tile is clicked', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  mount.root.querySelector<HTMLElement>('.tile[data-alias="media"] .launch')!.click();
  expect(mount.launched.map((a) => a.alias)).to.deep.equal(['media']);
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx web-test-runner "src/desktop/components/launcher-layout.test.ts" --node-resolve`
Expected: FAIL. Tiles have no `data-alias` yet, the launcher reads `groups` rather than
`catalogueGroups`, and a pinned app still shows in its group.

- [ ] **Step 5: Rewire the launcher onto the view**

In `components/launcher.element.ts`:

Replace the imports above `UmbraDesktopThemeStyles` with:

```ts
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types';
import type { UmbraDesktopLauncherLayout } from '../settings/types';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants.js';
import { pinKeysFor } from '../settings/pinned.js';
import { resolveLauncher } from '../launcher/resolve-launcher.js';
import type {
  UmbraDesktopLauncherArrangement,
  UmbraDesktopLauncherInputs,
  UmbraDesktopLauncherView,
} from '../launcher/resolve-launcher.js';
import type { UmbraDesktopGroupLabel } from '../launcher/group-labels.js';
import type { UmbraDesktopSettingsContext } from '../settings/settings.context';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
```

Replace the class JSDoc's first paragraph with:

```ts
/**
 * The start-menu-style launcher panel: search, the Pinned place, the user's groups as cards of
 * icon tiles, and a footer (user, desktop settings, log out, exit). What it draws is
 * `resolveLauncher`'s view of the catalogue plus the user's changes to it (see the 2026-09-27
 * launcher layout design). Mounted by `<umbradesktop-taskbar>`, which owns the panel's open/close
 * state and outside-click/Escape dismissal.
```

(keep the "never opens a modal" paragraph as it is.)

Replace the `_groups`, `_apps` and `_pinned` state fields with:

```ts
  /** The apps this user may open, from the catalogue. */
  @state()
  private _apps: UmbraDesktopApp[] = [];

  /** Every group in the merged catalogue, to name groups and place new ones. */
  @state()
  private _catalogueGroups: UmbraDesktopGroup[] = [];

  /** The pinned aliases, which are the Pinned place. */
  @state()
  private _pinned: ReadonlyArray<string> = [];

  /** The user's changes to the groups; `undefined` when they have never arranged. */
  @state()
  private _layout?: UmbraDesktopLauncherLayout;
```

In the constructor, replace the catalogue and settings consumers with:

```ts
    this.consumeContext(UMBRADESKTOP_APP_CATALOGUE_CONTEXT, (ctx) => {
      if (!ctx) return;
      this.observe(ctx.apps, (apps) => (this._apps = apps));
      this.observe(ctx.catalogueGroups, (groups) => (this._catalogueGroups = groups));
    });
```

```ts
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (ctx) => {
      this.#settings = ctx ?? undefined;
      if (!ctx) return;
      this.observe(ctx.pinned, (pinned) => (this._pinned = pinned));
      this.observe(ctx.layout, (layout) => (this._layout = layout));
    });
```

Delete the `#favourites` getter and add in its place:

```ts
  /** What the catalogue says exists, in the shape the layout functions take. */
  get #inputs(): UmbraDesktopLauncherInputs {
    return { apps: this._apps, catalogueGroups: this._catalogueGroups };
  }

  /** What the user has chosen, in the shape the layout functions take. */
  get #arrangement(): UmbraDesktopLauncherArrangement {
    return { pinned: this._pinned, layout: this._layout };
  }

  /**
   * A group heading's text: a catalogue label through the translator, the user's own name as typed.
   * @param label The label from the view.
   * @returns The text to show.
   */
  #label(label: UmbraDesktopGroupLabel): string {
    return label.translate ? this.localize.string(label.text) : label.text;
  }
```

Replace `#tile`, `#grid` and `#renderFavourites` with:

```ts
  /**
   * One app tile. `data-group` and `data-alias` identify it to tests now and to the drag's drop
   * targets from Task 10 on. The pin control is still here and goes in Task 10.
   * @param app The app.
   * @param groupId The group it is drawn in, or the Pinned id.
   * @returns The tile template.
   */
  #tile(app: UmbraDesktopApp, groupId: string) {
    // Through `pinKeysFor`, not `includes(app.alias)`: a pin that followed its section to this app is
    // stored under the section's fallback alias, and has to read as pinned here to be unpinnable.
    const pinned = pinKeysFor(app, this._pinned).length > 0;
    const pinLabel = this.localize.term(pinned ? 'umbraDesktop_unpin' : 'umbraDesktop_pin');
    return html`
      <div class="tile" data-drop="tile" data-group=${groupId} data-alias=${app.alias}>
        <button class="launch" title=${this.localize.string(app.name)} @click=${() => this.#open(app)}>
          <umb-icon name=${app.icon}></umb-icon>
          <span class="tlb">${this.localize.string(app.name)}</span>
        </button>
        <button
          class="pin ${pinned ? 'on' : ''}"
          title=${pinLabel}
          aria-label=${pinLabel}
          aria-pressed=${pinned ? 'true' : 'false'}
          @click=${(e: Event) => this.#togglePin(e, app)}>
          ${this.#pinGlyph(pinned)}
        </button>
      </div>
    `;
  }

  /**
   * A grid of app tiles.
   * @param apps The apps.
   * @param groupId The group they are drawn in, or the Pinned id.
   * @returns The grid template.
   */
  #grid(apps: ReadonlyArray<UmbraDesktopApp>, groupId: string) {
    return html`<div class="grid">${repeat(apps, (a) => a.alias, (a) => this.#tile(a, groupId))}</div>`;
  }

  /**
   * The Pinned place: the full-width hero card above the groups, drawn only when it holds anything.
   * @param view The launcher view.
   * @returns The card, or nothing.
   */
  #renderPinned(view: UmbraDesktopLauncherView) {
    if (view.pinned.length === 0) return '';
    return html`
      <div class="card fav" data-drop="group" data-group=${UMBRADESKTOP_PINNED_GROUP_ID}>
        <div class="ch">${this.localize.term('umbraDesktop_favourites')}</div>
        ${this.#grid(view.pinned, UMBRADESKTOP_PINNED_GROUP_ID)}
      </div>
    `;
  }

  /**
   * The groups as cards, skipping any with nothing to show (design §4.2 step 6).
   * @param view The launcher view.
   * @returns The cards template.
   */
  #renderGroups(view: UmbraDesktopLauncherView) {
    const groups = view.groups.filter((group) => group.apps.length > 0);
    return html`
      <div class="cards">
        ${repeat(
          groups,
          (g) => g.id,
          (g) => html`
            <div class="card" data-drop="group" data-group=${g.id}>
              <div class="ch">${this.#label(g.label)}</div>
              ${this.#grid(g.apps, g.id)}
            </div>
          `,
        )}
      </div>
    `;
  }
```

Replace `render()` with:

```ts
  override render() {
    const view = resolveLauncher(this.#inputs, this.#arrangement);
    return html`
      <button class="search" @click=${this.#requestSearch}>
        <umb-icon name="icon-search"></umb-icon>
        <span>${this.localize.term('umbraDesktop_search')}</span>
      </button>
      <div class="body">${this.#renderPinned(view)} ${this.#renderGroups(view)}</div>
      ${this.#renderFooter()}
    `;
  }
```

- [ ] **Step 6: Give the long-names stub the new observable**

In `components/launcher-long-names.test.ts`, inside `launcherWithLongName`, add a groups state and
pass it as `catalogueGroups` in the provider object (the apps carry no `group`, so they land in More
and still render as one card of three):

```ts
  const catalogueGroups = new UmbArrayState<UmbraDesktopGroup>([], (g) => g.alias);
```

```ts
    catalogueGroups: catalogueGroups.asObservable(),
```

and import `UmbraDesktopGroup` beside `UmbraDesktopApp`. Its old `groups` stub is now unused; delete
it and the `UmbraDesktopLauncherGroup` import with it.

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx web-test-runner "src/desktop/components/launcher-*.test.ts" --node-resolve`
Expected: PASS: the new file, long names, and launcher events.

- [ ] **Step 8: Both gates**

Run: `npm run build && npm test`. Expected: both pass, including every theme's launcher test.

---

### Task 8: All apps

**Files:**
- Create: `launcher/alphabet.ts`, `launcher/alphabet.test.ts`
- Create: `launcher/drawer.controller.ts`
- Modify: `components/launcher.element.ts`
- Modify: `localization/en.ts`, `localization/nl.ts`
- Create: `components/launcher-drawer.test.ts`

- [ ] **Step 1: Write the failing pure tests**

Create `launcher/alphabet.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { alphabetise, filterApps, letterOf } from './alphabet';
import type { UmbraDesktopApp } from '../types';

/**
 * A stand-in app whose name is the thing under test.
 * @param name The display name.
 * @returns The app.
 */
const named = (name: string): UmbraDesktopApp => ({
  alias: name.toLowerCase(),
  name,
  icon: 'icon-box',
  content: { kind: 'iframe', url: '/x' },
  chromeProfile: 'bare',
});
const nameOf = (app: UmbraDesktopApp) => app.name;

it('files a name under its first letter, uppercased, without its accent', () => {
  expect(letterOf('media', 'en-us')).to.equal('M');
  expect(letterOf('Éditeur', 'fr-fr')).to.equal('E');
});

it('files a name that does not start with a letter under #', () => {
  expect(letterOf('3D viewer', 'en-us')).to.equal('#');
  expect(letterOf('', 'en-us')).to.equal('#');
});

it('sorts by name in the culture and groups consecutive names under one letter', () => {
  const sections = alphabetise([named('Media'), named('Content'), named('members'), named('Deploy')], nameOf, 'en-us');
  expect(sections.map((s) => [s.letter, s.apps.map((a) => a.name)])).to.deep.equal([
    ['C', ['Content']],
    ['D', ['Deploy']],
    ['M', ['Media', 'members']],
  ]);
});

it('does not throw on a culture the browser does not know', () => {
  expect(() => alphabetise([named('Content')], nameOf, 'not-a-culture!!')).to.not.throw();
});

it('matches anywhere in the name, ignoring case, and returns everything for an empty filter', () => {
  const apps = [named('Log Viewer'), named('Content'), named('Webhooks')];
  expect(filterApps(apps, nameOf, 'VIEW').map((a) => a.name)).to.deep.equal(['Log Viewer']);
  expect(filterApps(apps, nameOf, '   ').map((a) => a.name)).to.deep.equal(['Log Viewer', 'Content', 'Webhooks']);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx web-test-runner "src/desktop/launcher/alphabet.test.ts" --node-resolve`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `launcher/alphabet.ts`**

```ts
import type { UmbraDesktopApp } from '../types';

/**
 * The All apps drawer's ordering (design §3.2, D8): by translated name, in the backoffice culture,
 * under letter headings. Pure, and given the name function rather than a localizer so it can be
 * tested without one.
 */

/** One letter heading and the apps under it. */
export interface UmbraDesktopLetterSection {
  /** The heading: an uppercase letter without its accent, or `#`. */
  letter: string;
  /** The apps, in collation order. */
  apps: UmbraDesktopApp[];
}

/**
 * A collator for a culture, or for the runtime's default when the culture is one the browser
 * rejects: `Intl` throws a `RangeError` for a malformed tag, and a drawer that cannot open is a far
 * worse failure than one sorted in the wrong language.
 * @param locale The backoffice culture, e.g. `en-us`.
 * @returns A collator.
 */
function collatorFor(locale: string): Intl.Collator {
  try {
    return new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  } catch {
    return new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  }
}

/**
 * The heading a name files under. Accents are stripped so "Éditeur" sits with the other Es, which is
 * how a phone's contact list does it; anything that does not start with a letter goes under `#`.
 * @param name The translated name.
 * @param locale The backoffice culture.
 * @returns The heading.
 */
export function letterOf(name: string, locale: string): string {
  const first = [...name.trim()][0] ?? '';
  const base = first.normalize('NFD').replace(/\p{M}/gu, '');
  let upper: string;
  try {
    upper = base.toLocaleUpperCase(locale);
  } catch {
    upper = base.toUpperCase();
  }
  return /\p{L}/u.test(upper) ? upper : '#';
}

/**
 * Sort apps by name and group them under letter headings.
 * @param apps The apps.
 * @param nameOf Their translated name.
 * @param locale The backoffice culture.
 * @returns The sections, in order.
 */
export function alphabetise(
  apps: ReadonlyArray<UmbraDesktopApp>,
  nameOf: (app: UmbraDesktopApp) => string,
  locale: string,
): UmbraDesktopLetterSection[] {
  const collator = collatorFor(locale);
  const sorted = [...apps].sort((a, b) => collator.compare(nameOf(a), nameOf(b)));
  const sections: UmbraDesktopLetterSection[] = [];
  for (const app of sorted) {
    const letter = letterOf(nameOf(app), locale);
    const last = sections[sections.length - 1];
    if (last && last.letter === letter) last.apps.push(app);
    else sections.push({ letter, apps: [app] });
  }
  return sections;
}

/**
 * The apps whose name contains the filter text anywhere, ignoring case.
 * @param apps The apps.
 * @param nameOf Their translated name.
 * @param query What the user typed.
 * @returns The matching apps, in the order given; all of them for an empty filter.
 */
export function filterApps(
  apps: ReadonlyArray<UmbraDesktopApp>,
  nameOf: (app: UmbraDesktopApp) => string,
  query: string,
): UmbraDesktopApp[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...apps];
  return apps.filter((app) => nameOf(app).toLocaleLowerCase().includes(needle));
}
```

- [ ] **Step 4: Run the pure tests to see them pass**

Run: `npx web-test-runner "src/desktop/launcher/alphabet.test.ts" --node-resolve`. Expected: PASS.

- [ ] **Step 5: Add the terms**

In `localization/en.ts`, under `// launcher chrome`:

```ts
    allApps: 'All apps',
    back: 'Back',
    filterApps: 'Filter apps',
    noAppsMatch: 'No apps match',
```

In `localization/nl.ts`, at the same place:

```ts
    allApps: 'Alle apps',
    back: 'Terug',
    filterApps: 'Apps filteren',
    noAppsMatch: 'Geen apps gevonden',
```

- [ ] **Step 6: Write the failing element tests**

Create `components/launcher-drawer.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { mountLauncher, stubApp } from './launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';

/** All apps: every app, alphabetical, filterable, and a way back (design §3.2). */

const TIMEOUT_MS = 20_000;
const APPS = [stubApp('Media', 'editing'), stubApp('Content', 'editing'), stubApp('Logs', 'diagnostics')];
const GROUPS = [
  { alias: 'editing', label: 'Editing', weight: 10 },
  { alias: 'diagnostics', label: 'Diagnostics', weight: 40 },
];

let mount: UmbraDesktopLauncherMount | undefined;
afterEach(() => {
  mount?.remove();
  mount = undefined;
});

/**
 * Mount a launcher with one app pinned and open All apps.
 * @returns The mount, showing the drawer.
 */
async function openDrawer(): Promise<UmbraDesktopLauncherMount> {
  const m = await mountLauncher({ apps: APPS, groups: GROUPS, pinned: ['Logs'] });
  m.root.querySelector<HTMLElement>('.ctl.all-apps')!.click();
  await m.settle();
  return m;
}

/**
 * The drawer's rows as `[letter, aliases]` per section.
 * @param root The launcher's shadow root.
 * @returns The sections.
 */
const sections = (root: ShadowRoot) =>
  [...root.querySelectorAll<HTMLElement>('.letter')].map((section) => [
    section.querySelector('.lh')!.textContent!.trim(),
    [...section.querySelectorAll<HTMLElement>('.row')].map((row) => row.dataset.alias),
  ]);

it('lists every app alphabetically under letters, pinned ones included', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  expect(sections(mount.root)).to.deep.equal([
    ['C', ['Content']],
    ['L', ['Logs']],
    ['M', ['Media']],
  ]);
});

it('narrows the list as the filter is typed into', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  const filter = mount.root.querySelector<HTMLInputElement>('.drawer-filter')!;
  filter.value = 'med';
  filter.dispatchEvent(new Event('input'));
  await mount.settle();
  expect(sections(mount.root)).to.deep.equal([['M', ['Media']]]);
});

it('launches from a row', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  mount.root.querySelector<HTMLElement>('.row[data-alias="Media"]')!.click();
  expect(mount.launched.map((a) => a.alias)).to.deep.equal(['Media']);
});

it('goes back to the launcher', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  mount.root.querySelector<HTMLElement>('.ctl.back')!.click();
  await mount.settle();
  expect(mount.root.querySelector('.drawer')).to.equal(null);
  expect(mount.root.querySelector('.cards')).to.not.equal(null);
});

it('focuses the filter when it opens', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await openDrawer();
  expect(mount.root.activeElement?.classList.contains('drawer-filter')).to.equal(true);
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `npx web-test-runner "src/desktop/components/launcher-drawer.test.ts" --node-resolve`
Expected: FAIL, there is no `.ctl.all-apps`.

- [ ] **Step 8: Implement `launcher/drawer.controller.ts`**

```ts
import type { UmbraDesktopApp } from '../types';
import { alphabetise, filterApps } from './alphabet';
import { css, html } from '@umbraco-cms/backoffice/external/lit';
import type { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * All apps (design §3.2): the drawer that replaces the launcher's body with every app the user may
 * open, alphabetical and filterable.
 *
 * A controller rendering into the launcher's own shadow root rather than an element of its own, so
 * the theme's launcher sheet reaches it (see "Why the drawer and arrange mode are not their own
 * elements" in the plan, and `theme/theme-styles.controller.ts`).
 */
export class UmbraDesktopDrawerController {
  /** The launcher this renders into. */
  #host: UmbLitElement;

  /** What the user has typed into the filter. Cleared each time the drawer opens. */
  #query = '';

  /** What a row and the Back button do; the launcher owns both. */
  #actions: { launch(app: UmbraDesktopApp): void; back(): void };

  /**
   * @param host The launcher.
   * @param actions What a row click and Back do.
   */
  constructor(host: UmbLitElement, actions: { launch(app: UmbraDesktopApp): void; back(): void }) {
    this.#host = host;
    this.#actions = actions;
  }

  /** Start fresh: an empty filter each time the drawer is opened. */
  reset(): void {
    this.#query = '';
  }

  /** Put the caret in the filter, so typing filters straight away. Call after the host has rendered. */
  focus(): void {
    this.#host.shadowRoot?.querySelector<HTMLInputElement>('.drawer-filter')?.focus();
  }

  /**
   * The translated name, which is what the drawer sorts and filters on.
   * @param app The app.
   * @returns Its name in the backoffice language.
   */
  #nameOf = (app: UmbraDesktopApp): string => this.#host.localize.string(app.name);

  /**
   * The header row and body for drawer mode.
   * @param apps Every app the user may open.
   * @returns The template.
   */
  render(apps: ReadonlyArray<UmbraDesktopApp>) {
    const localize = this.#host.localize;
    const sections = alphabetise(filterApps(apps, this.#nameOf, this.#query), this.#nameOf, localize.lang());
    return html`
      <div class="hdr">
        <button class="ctl back" @click=${() => this.#actions.back()}>
          <umb-icon name="icon-arrow-left"></umb-icon>
          <span>${localize.term('umbraDesktop_back')}</span>
        </button>
        <input
          class="search drawer-filter"
          type="search"
          .value=${this.#query}
          placeholder=${localize.term('umbraDesktop_filterApps')}
          aria-label=${localize.term('umbraDesktop_filterApps')}
          @input=${(e: Event) => {
            this.#query = (e.target as HTMLInputElement).value;
            this.#host.requestUpdate();
          }} />
      </div>
      <div class="body drawer">
        ${sections.length === 0 ? html`<p class="empty-note">${localize.term('umbraDesktop_noAppsMatch')}</p>` : ''}
        <div class="alpha">
          ${sections.map(
            (section) => html`
              <div class="letter">
                <div class="lh">${section.letter}</div>
                ${section.apps.map(
                  (app) => html`
                    <button class="row" data-alias=${app.alias} @click=${() => this.#actions.launch(app)}>
                      <umb-icon name=${app.icon}></umb-icon>
                      <span class="row-name">${this.#nameOf(app)}</span>
                    </button>
                  `,
                )}
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }
}

/**
 * The drawer's CSS, included in the launcher's `static styles`. Columns flow like a phone's contact
 * list: as many as fit, each letter kept together.
 */
export const drawerStyles = css`
  .alpha {
    columns: 4 200px;
    column-gap: var(--uui-size-space-5);
  }
  .letter {
    break-inside: avoid;
    margin-bottom: var(--uui-size-space-3);
  }
  .lh {
    padding: var(--uui-size-space-1) var(--uui-size-space-2);
    margin-bottom: var(--uui-size-space-1);
    border-bottom: var(--umbradesktop-launcher-letter-border, var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border)));
    color: var(--umbradesktop-launcher-letter-text, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    font-weight: 700;
    font-size: var(--uui-type-small-size);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--uui-size-space-3);
    width: 100%;
    padding: var(--uui-size-space-2);
    border: none;
    border-radius: var(--uui-border-radius, 3px);
    background: transparent;
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    font-size: var(--uui-type-small-size);
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));
  }
  .row umb-icon {
    flex-shrink: 0;
    font-size: 20px;
  }
  .row-name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .empty-note {
    color: var(--umbradesktop-launcher-text-muted, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    font-size: var(--uui-type-small-size);
  }
`;
```

- [ ] **Step 9: Give the launcher modes, a header row and the All apps control**

In `components/launcher.element.ts`:

Add the import:

```ts
import { UmbraDesktopDrawerController, drawerStyles } from '../launcher/drawer.controller.js';
```

Add state and the controller beside the other fields:

```ts
  /**
   * Which body the panel shows. Back to the launcher every time it opens, because the taskbar
   * unmounts this element on close.
   */
  @state()
  private _mode: 'launcher' | 'drawer' | 'arrange' = 'launcher';

  /** All apps. */
  #drawer = new UmbraDesktopDrawerController(this, {
    launch: (app) => this.#open(app),
    back: () => void this.#setMode('launcher'),
  });
```

Add after `#open`:

```ts
  /**
   * Switch the panel's body, and put focus where the new body wants it.
   * @param mode The body to show.
   */
  async #setMode(mode: 'launcher' | 'drawer' | 'arrange') {
    if (mode === 'drawer') this.#drawer.reset();
    this._mode = mode;
    await this.updateComplete;
    if (mode === 'drawer') this.#drawer.focus();
  }
```

Replace `render()` with:

```ts
  override render() {
    if (this._mode === 'drawer') return html`${this.#drawer.render(this._apps)} ${this.#renderFooter()}`;
    const view = resolveLauncher(this.#inputs, this.#arrangement);
    return html`
      <div class="hdr">
        <button class="search" @click=${this.#requestSearch}>
          <umb-icon name="icon-search"></umb-icon>
          <span>${this.localize.term('umbraDesktop_search')}</span>
        </button>
        <button class="ctl all-apps" @click=${() => this.#setMode('drawer')}>
          <span>${this.localize.term('umbraDesktop_allApps')}</span>
        </button>
      </div>
      <div class="body">${this.#renderPinned(view)} ${this.#renderGroups(view)}</div>
      ${this.#renderFooter()}
    `;
  }
```

Change `static override styles = [css\`...\`]` to `static override styles = [css\`...\`, drawerStyles]`.
Inside the first `css` block, in the existing `.search` rule replace `flex-shrink: 0;` and the `margin`
line with `flex: 1; min-width: 0; margin: 0;`, and add after the `.search umb-icon` rule:

```css
      /* The header row: search, then the panel's own controls. Its margin is what the search field
         used to carry on its own, so the panel's top edge is where it was. */
      .hdr {
        flex-shrink: 0;
        display: flex;
        align-items: stretch;
        gap: var(--uui-size-space-2);
        margin: var(--uui-size-space-4) var(--uui-size-space-4) 0;
      }
      /* One look for every button the launcher adds: All apps, Arrange, Back, the arrange banner's
         buttons and the palette's. Tokenised in full, so a theme restyles all of them in one place. */
      .ctl {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--uui-size-space-2);
        min-height: 32px;
        padding: 0 var(--uui-size-space-4);
        border: var(--umbradesktop-launcher-control-border, var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border)));
        border-radius: var(--umbradesktop-launcher-search-radius, var(--uui-border-radius, 3px));
        background: var(--umbradesktop-launcher-control-background, var(--umbradesktop-launcher-card-background, var(--uui-color-surface)));
        color: var(--umbradesktop-launcher-control-text, var(--umbradesktop-launcher-text, var(--uui-color-text)));
        font-family: inherit;
        font-size: var(--uui-type-small-size);
        white-space: nowrap;
        cursor: pointer;
      }
      .ctl:hover {
        background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));
      }
      .ctl[aria-pressed='true'],
      .ctl.primary {
        background: var(--umbradesktop-launcher-control-active-background, var(--uui-color-selected, #3544b1));
        color: var(--uui-color-selected-contrast, #fff);
      }
      .ctl umb-icon {
        font-size: 16px;
      }
```

The new tokens (`--umbradesktop-launcher-control-*`, `-letter-*`, `-text-muted`) now appear in the
launcher's CSS, so `theme/tokens.test.ts` will fail until they are in `UMBRADESKTOP_TOKENS`. Add them
now to `theme/types.ts`, after `'--umbradesktop-launcher-card-radius'`:

```ts
  '--umbradesktop-launcher-control-background',
  '--umbradesktop-launcher-control-border',
  '--umbradesktop-launcher-control-text',
  '--umbradesktop-launcher-control-active-background',
  '--umbradesktop-launcher-letter-text',
  '--umbradesktop-launcher-letter-border',
  '--umbradesktop-launcher-text-muted',
```

- [ ] **Step 10: Run the tests to see them pass**

Run: `npx web-test-runner "src/desktop/components/launcher-*.test.ts" --node-resolve`
Expected: PASS. `launcher-events.test.ts` still clicks `.search`, which is now inside `.hdr`.

- [ ] **Step 11: Both gates**

Run: `npm run build && npm test`. Expected: both pass. If a theme's launcher test now fails on the
search field, that theme set a margin on `.search` that the header row owns now: move it to a `.hdr`
rule in that theme's `launcher.css.ts` (Task 12 revisits every theme anyway).

---

### Task 9: The drag controller and drop targets

**Files:**
- Create: `launcher/drop-target.ts`, `launcher/drop-target.test.ts`
- Create: `launcher/apply-drop.ts`, `launcher/apply-drop.test.ts`
- Create: `launcher/tile-drag.controller.ts`, `launcher/tile-drag.controller.test.ts`

- [ ] **Step 1: Write the failing tests for applying a drop**

Create `launcher/apply-drop.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { applyAppDrop, applyGroupDrop } from './apply-drop';
import { resolveLauncher } from './resolve-launcher';
import type { UmbraDesktopLauncherArrangement, UmbraDesktopLauncherInputs } from './resolve-launcher';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants';
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types';

const GROUPS: UmbraDesktopGroup[] = [
  { alias: 'editing', label: 'E', weight: 10 },
  { alias: 'diagnostics', label: 'D', weight: 40 },
];

/**
 * A stand-in app.
 * @param alias The alias.
 * @param group Its group.
 * @param weight Its weight.
 * @returns The app.
 */
const app = (alias: string, group: string, weight: number): UmbraDesktopApp => ({
  alias,
  name: alias,
  icon: 'icon-box',
  content: { kind: 'iframe', url: '/x' },
  chromeProfile: 'bare',
  group,
  weight,
});
const content = app('content', 'editing', 10);
const media = app('media', 'editing', 20);
const logs = app('logs', 'diagnostics', 10);
const INPUTS: UmbraDesktopLauncherInputs = { apps: [content, media, logs], catalogueGroups: GROUPS };
const UNTOUCHED: UmbraDesktopLauncherArrangement = { pinned: [] };

/**
 * The launcher an arrangement draws.
 * @param a The arrangement.
 * @returns `[id, aliases]` pairs.
 */
const drawn = (a: UmbraDesktopLauncherArrangement) =>
  resolveLauncher(INPUTS, a).groups.map((g) => [g.id, g.apps.map((x) => x.alias)]);

it('drops before a tile, or after it by which half the pointer is over', () => {
  const before = applyAppDrop(INPUTS, UNTOUCHED, logs, { kind: 'tile', groupId: 'editing', alias: 'media', after: false })!;
  expect(drawn(before)[0]).to.deep.equal(['editing', ['content', 'logs', 'media']]);
  const after = applyAppDrop(INPUTS, UNTOUCHED, logs, { kind: 'tile', groupId: 'editing', alias: 'media', after: true })!;
  expect(drawn(after)[0]).to.deep.equal(['editing', ['content', 'media', 'logs']]);
});

it('appends when dropped on a group card', () => {
  const result = applyAppDrop(INPUTS, UNTOUCHED, content, { kind: 'group', groupId: 'diagnostics', after: false })!;
  expect(drawn(result)[1]).to.deep.equal(['diagnostics', ['logs', 'content']]);
});

it('pins when dropped on Pinned or on a pinned tile', () => {
  const onCard = applyAppDrop(INPUTS, UNTOUCHED, logs, { kind: 'group', groupId: UMBRADESKTOP_PINNED_GROUP_ID, after: false })!;
  expect(onCard.pinned).to.deep.equal(['logs']);
  const onTile = applyAppDrop(INPUTS, { pinned: ['content'] }, logs, {
    kind: 'tile',
    groupId: UMBRADESKTOP_PINNED_GROUP_ID,
    alias: 'content',
    after: false,
  })!;
  expect(onTile.pinned).to.deep.equal(['logs', 'content']);
});

it('removes when dropped on the remove pane or the palette', () => {
  expect(applyAppDrop(INPUTS, UNTOUCHED, logs, { kind: 'remove' })!.layout?.removed).to.deep.equal(['logs']);
  expect(applyAppDrop(INPUTS, UNTOUCHED, logs, { kind: 'palette' })!.layout?.removed).to.deep.equal(['logs']);
});

it('does nothing when a tile is dropped on itself', () => {
  expect(applyAppDrop(INPUTS, UNTOUCHED, media, { kind: 'tile', groupId: 'editing', alias: 'media', after: false })).to.equal(undefined);
});

it('moves a group before or after the group it is dropped on, and ignores anything else', () => {
  const result = applyGroupDrop(INPUTS, UNTOUCHED, 'diagnostics', { kind: 'group', groupId: 'editing', after: false })!;
  expect(drawn(result).map(([id]) => id)).to.deep.equal(['diagnostics', 'editing']);
  expect(applyGroupDrop(INPUTS, UNTOUCHED, 'editing', { kind: 'group', groupId: 'editing', after: true })).to.equal(undefined);
  expect(applyGroupDrop(INPUTS, UNTOUCHED, 'editing', { kind: 'remove' })).to.equal(undefined);
});
```

- [ ] **Step 2: Write the failing tests for reading a drop target**

Create `launcher/drop-target.test.ts`:

```ts
import { expect, fixture, html } from '@open-wc/testing';
import { dropTargetAt } from './drop-target';

/**
 * A tiny shadow root laid out at known coordinates: one group card, 400x200 at the top left, with
 * one 100x60 tile inside it, and a remove pane below.
 * @returns The shadow root.
 */
async function board(): Promise<ShadowRoot> {
  const host = await fixture<HTMLDivElement>(html`<div style="position:fixed; left:0; top:0;"></div>`);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <div data-drop="group" data-group="editing" style="position:absolute; left:0; top:0; width:400px; height:200px;">
      <div data-drop="tile" data-group="editing" data-alias="media" style="position:absolute; left:10px; top:10px; width:100px; height:60px;"><span>Media</span></div>
    </div>
    <div data-drop="remove" style="position:absolute; left:0; top:220px; width:400px; height:40px;"></div>`;
  return root;
}

it('reads a tile, with the half the pointer is over', async () => {
  const root = await board();
  expect(dropTargetAt(root, 30, 30, 'app')).to.deep.equal({ kind: 'tile', groupId: 'editing', alias: 'media', after: false });
  expect(dropTargetAt(root, 100, 30, 'app')).to.deep.equal({ kind: 'tile', groupId: 'editing', alias: 'media', after: true });
});

it("reads a group card's empty area", async () => {
  const root = await board();
  expect(dropTargetAt(root, 300, 150, 'app')).to.deep.equal({ kind: 'group', groupId: 'editing', after: true });
});

it('reads the remove pane, and nothing where there is no target', async () => {
  const root = await board();
  expect(dropTargetAt(root, 100, 240, 'app')).to.deep.equal({ kind: 'remove' });
  expect(dropTargetAt(root, 600, 600, 'app')).to.equal(undefined);
});

it('looks through tiles to their group when a group is being dragged', async () => {
  const root = await board();
  expect(dropTargetAt(root, 30, 30, 'group')).to.deep.equal({ kind: 'group', groupId: 'editing', after: false });
});
```

- [ ] **Step 3: Run both to see them fail**

Run each with `npx web-test-runner "<path>" --node-resolve`. Expected: FAIL, the modules do not exist.

- [ ] **Step 4: Implement `launcher/drop-target.ts`**

```ts
/**
 * What is under the pointer during a drag, read from `data-drop` attributes the launcher renders:
 *
 * - `data-drop="tile" data-group data-alias` on a tile
 * - `data-drop="group" data-group` on a group card, and on Pinned with the Pinned id
 * - `data-drop="remove"` on the remove pane, `data-drop="palette"` on arrange mode's palette
 *
 * Attributes rather than a map of elements, so the drag controller needs nothing from the templates
 * beyond what they already render, and a test can build a board out of plain divs.
 */

/** Where a drop would land. */
export type UmbraDesktopDropTarget =
  | { kind: 'tile'; groupId: string; alias: string; after: boolean }
  | { kind: 'group'; groupId: string; after: boolean }
  | { kind: 'remove' }
  | { kind: 'palette' };

/** What is being dragged, which decides whether tiles are targets or only their groups are. */
export type UmbraDesktopDragAccept = 'app' | 'group';

/**
 * Whether the pointer is in the second half of an element: the right half of a tile in a grid, the
 * lower half of a row in a single column. A box more than twice as wide as it is tall is a row,
 * which is what Windows 98 and Umbraco 4 turn tiles and groups into.
 * @param element The element.
 * @param x The pointer's client x.
 * @param y The pointer's client y.
 * @returns True for the second half.
 */
function inSecondHalf(element: Element, x: number, y: number): boolean {
  const box = element.getBoundingClientRect();
  return box.width > box.height * 2 ? y > box.top + box.height / 2 : x > box.left + box.width / 2;
}

/**
 * The drop target at a point in one shadow root.
 * @param root The launcher's shadow root.
 * @param x The pointer's client x.
 * @param y The pointer's client y.
 * @param accept `app` to land on tiles, `group` to look through tiles to their group.
 * @returns The target, or `undefined` over nothing that takes a drop.
 */
export function dropTargetAt(
  root: ShadowRoot,
  x: number,
  y: number,
  accept: UmbraDesktopDragAccept,
): UmbraDesktopDropTarget | undefined {
  const selector = accept === 'group' ? '[data-drop="group"]' : '[data-drop]';
  for (const hit of root.elementsFromPoint(x, y)) {
    const element = hit.closest<HTMLElement>(selector);
    if (!element || !root.contains(element)) continue;
    const { drop, group, alias } = element.dataset;
    if (drop === 'tile' && group && alias) return { kind: 'tile', groupId: group, alias, after: inSecondHalf(element, x, y) };
    if (drop === 'group' && group) return { kind: 'group', groupId: group, after: inSecondHalf(element, x, y) };
    if (drop === 'remove') return { kind: 'remove' };
    if (drop === 'palette') return { kind: 'palette' };
  }
  return undefined;
}
```

- [ ] **Step 5: Implement `launcher/apply-drop.ts`**

```ts
import type { UmbraDesktopApp } from '../types';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants';
import { moveApp, moveGroup, pinApp, removeApp } from './layout-edits';
import { resolveLauncher } from './resolve-launcher';
import type { UmbraDesktopLauncherArrangement, UmbraDesktopLauncherInputs } from './resolve-launcher';
import type { UmbraDesktopDropTarget } from './drop-target';

/**
 * Turning a drop into an edit. One place for both normal mode and arrange mode, since a drop means
 * the same thing in both: only which targets are on screen differs.
 */

/**
 * The edit an app drop makes.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param app The dragged app.
 * @param target Where it was dropped.
 * @returns The new arrangement, or `undefined` when the drop changes nothing.
 */
export function applyAppDrop(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  app: UmbraDesktopApp,
  target: UmbraDesktopDropTarget,
): UmbraDesktopLauncherArrangement | undefined {
  switch (target.kind) {
    case 'remove':
    case 'palette':
      return removeApp(inputs, arrangement, app);
    case 'group':
      return target.groupId === UMBRADESKTOP_PINNED_GROUP_ID
        ? pinApp(inputs, arrangement, app)
        : moveApp(inputs, arrangement, app, target.groupId);
    case 'tile': {
      const view = resolveLauncher(inputs, arrangement);
      const pinned = target.groupId === UMBRADESKTOP_PINNED_GROUP_ID;
      const list = pinned ? view.pinned : (view.groups.find((g) => g.id === target.groupId)?.apps ?? []);
      const at = list.findIndex((candidate) => candidate.alias === target.alias);
      if (at === -1) return undefined;
      const before = target.after ? list.slice(at + 1).find((candidate) => candidate !== app) : list[at];
      if (before === app) return undefined;
      return pinned ? pinApp(inputs, arrangement, app, before) : moveApp(inputs, arrangement, app, target.groupId, before);
    }
  }
}

/**
 * The edit a group drop makes: before the group it lands on, or after it.
 * @param inputs The catalogue.
 * @param arrangement The current arrangement.
 * @param groupId The dragged group.
 * @param target Where it was dropped.
 * @returns The new arrangement, or `undefined` when the drop changes nothing.
 */
export function applyGroupDrop(
  inputs: UmbraDesktopLauncherInputs,
  arrangement: UmbraDesktopLauncherArrangement,
  groupId: string,
  target: UmbraDesktopDropTarget,
): UmbraDesktopLauncherArrangement | undefined {
  if (target.kind !== 'group' || target.groupId === groupId || target.groupId === UMBRADESKTOP_PINNED_GROUP_ID) {
    return undefined;
  }
  const ids = resolveLauncher(inputs, arrangement).groups.map((g) => g.id);
  const at = ids.indexOf(target.groupId);
  if (at === -1) return undefined;
  const before = target.after ? ids.slice(at + 1).find((id) => id !== groupId) : ids[at];
  return moveGroup(inputs, arrangement, groupId, before);
}
```

- [ ] **Step 6: Write the failing controller tests**

Create `launcher/tile-drag.controller.test.ts`:

```ts
import { expect, fixture, html } from '@open-wc/testing';
import { UMBRADESKTOP_DRAG_LONG_PRESS_MS, UmbraDesktopTileDragController } from './tile-drag.controller';
import type { UmbraDesktopDragSource } from './tile-drag.controller';
import type { UmbraDesktopDropTarget } from './drop-target';

/**
 * The drag's gesture rules, driven with synthetic pointer events. What these cannot show is the
 * browser's own touch scrolling, which only a real touch sequence triggers; Task 10 checks that
 * under Chrome's touch emulation.
 */

/**
 * A host with one tile to drag and a record of what the controller reported.
 * @returns The pieces a case needs.
 */
async function setup() {
  const host = await fixture<HTMLDivElement>(html`<div style="position:fixed; left:0; top:0; width:400px; height:300px;"></div>`);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<div class="body" style="height:300px; overflow:auto;"><button class="tile" style="width:100px; height:60px;">Tile</button></div>`;
  const tile = root.querySelector<HTMLElement>('.tile')!;
  const log: string[] = [];
  let clicks = 0;
  tile.addEventListener('click', () => clicks++);
  const target: UmbraDesktopDropTarget = { kind: 'remove' };
  const source: UmbraDesktopDragSource = { kind: 'group', groupId: 'editing' };
  const controller = new UmbraDesktopTileDragController(() => root, {
    targetAt: () => target,
    onStart: () => log.push('start'),
    onOver: () => log.push('over'),
    onDrop: (s, t) => log.push(`drop:${s.kind}:${t.kind}`),
    onEnd: () => log.push('end'),
    scroller: () => root.querySelector('.body'),
  });
  tile.addEventListener('pointerdown', (e) => controller.begin(e, source));
  /**
   * Dispatch one pointer event: `pointerdown` at the tile, the rest at the window, the way a real
   * uncaptured pointer's moves arrive.
   * @param type The event type.
   * @param x Client x.
   * @param y Client y.
   * @param pointerType mouse, pen or touch.
   */
  const pointer = (type: string, x: number, y: number, pointerType = 'mouse') => {
    const event = new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, pointerType, button: 0, bubbles: true, composed: true });
    (type === 'pointerdown' ? tile : window).dispatchEvent(event);
  };
  return { root, tile, log, controller, pointer, clicks: () => clicks };
}

it('leaves a click alone: no drag, and the click reaches the tile', async () => {
  const { tile, log, pointer, clicks } = await setup();
  pointer('pointerdown', 20, 20);
  pointer('pointerup', 21, 20);
  tile.click();
  expect(log).to.deep.equal([]);
  expect(clicks()).to.equal(1);
});

it('starts a mouse drag past the threshold, drops, and swallows the click that follows', async () => {
  const { tile, log, pointer, clicks } = await setup();
  pointer('pointerdown', 20, 20);
  pointer('pointermove', 30, 20);
  pointer('pointerup', 60, 80);
  tile.click();
  expect(log).to.include.members(['start', 'drop:group:remove', 'end']);
  expect(clicks()).to.equal(0);
});

it('draws a ghost while dragging and removes it afterwards', async () => {
  const { root, pointer } = await setup();
  pointer('pointerdown', 20, 20);
  pointer('pointermove', 30, 20);
  expect(root.querySelector('.drag-ghost')).to.not.equal(null);
  pointer('pointerup', 30, 20);
  expect(root.querySelector('.drag-ghost')).to.equal(null);
});

it('cancels on Escape without dropping, and keeps the Escape from closing the launcher', async () => {
  const { log, pointer } = await setup();
  let reachedDocument = false;
  const listener = () => (reachedDocument = true);
  document.addEventListener('keydown', listener);
  pointer('pointerdown', 20, 20);
  pointer('pointermove', 30, 20);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.removeEventListener('keydown', listener);
  expect(log).to.include('end');
  expect(log.some((entry) => entry.startsWith('drop'))).to.equal(false);
  expect(reachedDocument).to.equal(false);
});

it('starts a touch drag only after a long press', async () => {
  const { log, pointer } = await setup();
  pointer('pointerdown', 20, 20, 'touch');
  pointer('pointermove', 22, 20, 'touch');
  expect(log).to.not.include('start');
  await new Promise((resolve) => setTimeout(resolve, UMBRADESKTOP_DRAG_LONG_PRESS_MS + 50));
  expect(log).to.include('start');
  pointer('pointerup', 22, 20, 'touch');
  expect(log).to.include('end');
});

it('gives a touch that moves before the long press back to the page, so it scrolls', async () => {
  const { log, pointer } = await setup();
  pointer('pointerdown', 20, 20, 'touch');
  pointer('pointermove', 20, 60, 'touch');
  await new Promise((resolve) => setTimeout(resolve, UMBRADESKTOP_DRAG_LONG_PRESS_MS + 50));
  expect(log).to.deep.equal([]);
});

it('ignores a right-button press', async () => {
  const { log, tile } = await setup();
  tile.dispatchEvent(new PointerEvent('pointerdown', { clientX: 20, clientY: 20, pointerId: 8, pointerType: 'mouse', button: 2, bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 60, pointerId: 8, pointerType: 'mouse' }));
  expect(log).to.deep.equal([]);
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `npx web-test-runner "src/desktop/launcher/tile-drag.controller.test.ts" --node-resolve`
Expected: FAIL, the module does not exist.

- [ ] **Step 8: Implement `launcher/tile-drag.controller.ts`**

```ts
import type { UmbraDesktopApp } from '../types';
import type { UmbraDesktopDropTarget } from './drop-target';

/**
 * Dragging a tile or a group inside the launcher (design §5, D13).
 *
 * Hand-rolled on pointer events rather than `UmbSorterController`, which uses native HTML5 drag and
 * drop: that has no keyboard path and does not fire under touch emulation. One controller per
 * launcher, shared by normal mode and arrange mode, because both render into the same shadow root.
 *
 * The gesture rules:
 * - **Mouse and pen** start past {@link UMBRADESKTOP_DRAG_THRESHOLD_PX}, so a click still launches.
 * - **Touch** starts after {@link UMBRADESKTOP_DRAG_LONG_PRESS_MS} without moving more than
 *   {@link UMBRADESKTOP_DRAG_TOUCH_SLOP_PX}, so a swipe still scrolls. A touch that moves first is
 *   left to the browser, which scrolls and cancels the pointer.
 * - Once a touch drag has started, the element's `touchmove` is prevented. Chrome only honours that
 *   on the first move of a sequence, and a long press has no moves, so the first move is the drag's
 *   own and the page does not scroll under it.
 *
 * Until the drag starts nothing is captured and the moves are read on `window`. Capturing on
 * `pointerdown` would retarget the `click` of an ordinary tap to the tile's wrapper instead of its
 * button, which silently stops tiles launching. Capture is taken when the drag starts, and the one
 * click the release then produces is swallowed.
 */

/** Movement, in px, that turns a mouse or pen press into a drag. */
export const UMBRADESKTOP_DRAG_THRESHOLD_PX = 4;

/** How long, in ms, a touch has to rest before it becomes a drag. */
export const UMBRADESKTOP_DRAG_LONG_PRESS_MS = 400;

/** Movement, in px, that makes a resting touch a scroll instead of a drag. */
export const UMBRADESKTOP_DRAG_TOUCH_SLOP_PX = 8;

/** Distance, in px, from the scroller's top or bottom edge at which a drag scrolls it. */
export const UMBRADESKTOP_DRAG_SCROLL_BAND_PX = 40;

/** How far, in px, the scroller moves per animation frame while the pointer is in the band. */
export const UMBRADESKTOP_DRAG_SCROLL_STEP_PX = 12;

/** What is being dragged. */
export type UmbraDesktopDragSource = { kind: 'app'; app: UmbraDesktopApp } | { kind: 'group'; groupId: string };

/** What the launcher does with the drag. */
export interface UmbraDesktopTileDragOptions {
  /** The drop target under a point, given what is being dragged. */
  targetAt(x: number, y: number, source: UmbraDesktopDragSource): UmbraDesktopDropTarget | undefined;
  /** The drag has started; show the remove pane and Pinned. */
  onStart(source: UmbraDesktopDragSource): void;
  /** The target under the pointer changed; show where the drop would land. */
  onOver(target: UmbraDesktopDropTarget | undefined): void;
  /** The pointer was released over a target. */
  onDrop(source: UmbraDesktopDragSource, target: UmbraDesktopDropTarget): void;
  /** The drag is over, dropped or cancelled. Always called last. */
  onEnd(): void;
  /** The element to scroll near its edges. */
  scroller(): HTMLElement | null;
}

/** A press that has not yet become a drag. */
interface UmbraDesktopPendingDrag {
  /** What it stands for. */
  source: UmbraDesktopDragSource;
  /** The pressed element, which the ghost copies and which takes capture. */
  element: HTMLElement;
  /** The pointer, so a second finger is ignored. */
  pointerId: number;
  /** mouse, pen or touch, which decides the gesture rule. */
  pointerType: string;
  /** Where the press began. */
  startX: number;
  /** Where the press began. */
  startY: number;
  /** The long-press timer, for touch. */
  timer?: number;
}

/** A drag under way. */
interface UmbraDesktopActiveDrag extends UmbraDesktopPendingDrag {
  /** The copy that follows the pointer. */
  ghost: HTMLElement;
  /** The pointer now. */
  x: number;
  /** The pointer now. */
  y: number;
  /** The target last reported, so `onOver` fires on change only. */
  target?: UmbraDesktopDropTarget;
  /** The edge-scroll animation frame. */
  frame?: number;
}

export class UmbraDesktopTileDragController {
  /** The shadow root the ghost is drawn in; a function because the host renders it after construction. */
  #root: () => ShadowRoot | null;

  /** The launcher's side of the drag. */
  #options: UmbraDesktopTileDragOptions;

  /** A press waiting to become a drag. */
  #pending?: UmbraDesktopPendingDrag;

  /** The drag under way. */
  #active?: UmbraDesktopActiveDrag;

  /**
   * @param root The launcher's shadow root.
   * @param options What the launcher does with the drag.
   */
  constructor(root: () => ShadowRoot | null, options: UmbraDesktopTileDragOptions) {
    this.#root = root;
    this.#options = options;
  }

  /** Whether a drag is under way. */
  get dragging(): boolean {
    return this.#active !== undefined;
  }

  /**
   * A press on something draggable. Call from its `pointerdown`.
   * @param e The pointer event; its `currentTarget` is what gets dragged.
   * @param source What it stands for.
   */
  begin(e: PointerEvent, source: UmbraDesktopDragSource): void {
    if (this.#pending || this.#active) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const element = e.currentTarget as HTMLElement | null;
    if (!element) return;
    this.#pending = {
      source,
      element,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
    };
    window.addEventListener('pointermove', this.#onMove, true);
    window.addEventListener('pointerup', this.#onUp, true);
    window.addEventListener('pointercancel', this.#onPointerCancel, true);
    if (e.pointerType === 'touch') {
      element.addEventListener('touchmove', this.#onTouchMove, { passive: false });
      element.addEventListener('contextmenu', this.#onContextMenu);
      this.#pending.timer = window.setTimeout(() => this.#start(), UMBRADESKTOP_DRAG_LONG_PRESS_MS);
    }
  }

  /** Abandon anything under way, e.g. because the launcher is being unmounted. */
  cancel(): void {
    const wasActive = this.#active !== undefined;
    this.#cleanup();
    if (wasActive) this.#options.onEnd();
  }

  /** Pointer moves, read on `window` until the drag captures. */
  #onMove = (e: PointerEvent) => {
    const drag = this.#active ?? this.#pending;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!this.#active) {
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (drag.pointerType === 'touch') {
        if (moved > UMBRADESKTOP_DRAG_TOUCH_SLOP_PX) this.#cleanup();
        return;
      }
      if (moved < UMBRADESKTOP_DRAG_THRESHOLD_PX) return;
      this.#start();
    }
    if (!this.#active) return;
    this.#active.x = e.clientX;
    this.#active.y = e.clientY;
    this.#track();
  };

  /** Release: a drop if a drag is under way, otherwise nothing, and the click goes through. */
  #onUp = (e: PointerEvent) => {
    const drag = this.#active ?? this.#pending;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!this.#active) {
      this.#cleanup();
      return;
    }
    const source = this.#active.source;
    const target = this.#options.targetAt(e.clientX, e.clientY, source);
    this.#swallowNextClick();
    this.#cleanup();
    if (target) this.#options.onDrop(source, target);
    this.#options.onEnd();
  };

  /** The browser took the pointer, usually to scroll. */
  #onPointerCancel = (e: PointerEvent) => {
    const drag = this.#active ?? this.#pending;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.cancel();
  };

  /** Stop the page scrolling under a touch drag. See the class comment for why this is enough. */
  #onTouchMove = (e: TouchEvent) => {
    if (this.#active) e.preventDefault();
  };

  /** A long press opens a context menu on some platforms; not on a draggable tile. */
  #onContextMenu = (e: Event) => {
    e.preventDefault();
  };

  /** Escape cancels, and stops there, so the taskbar does not also close the launcher. */
  #onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.cancel();
  };

  /** Turn the pending press into a drag: capture, draw the ghost, tell the launcher. */
  #start(): void {
    const pending = this.#pending;
    const root = this.#root();
    if (!pending || !root) return;
    const box = pending.element.getBoundingClientRect();
    const ghost = pending.element.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-drop');
    ghost.style.width = `${box.width}px`;
    root.appendChild(ghost);
    pending.element.toggleAttribute('data-lifted', true);
    try {
      pending.element.setPointerCapture(pending.pointerId);
    } catch {
      // A synthetic or already-released pointer: the drag still gets its moves on `window`.
    }
    this.#active = { ...pending, ghost, x: pending.startX, y: pending.startY };
    this.#pending = undefined;
    document.addEventListener('keydown', this.#onKey, true);
    this.#options.onStart(this.#active.source);
    this.#track();
    this.#active.frame = requestAnimationFrame(this.#scrollFrame);
  }

  /** Move the ghost and report the target under it when it changes. */
  #track(): void {
    const active = this.#active;
    if (!active) return;
    active.ghost.style.left = `${active.x}px`;
    active.ghost.style.top = `${active.y}px`;
    const target = this.#options.targetAt(active.x, active.y, active.source);
    if (JSON.stringify(target) !== JSON.stringify(active.target)) {
      active.target = target;
      this.#options.onOver(target);
    }
  }

  /** Scroll near the scroller's edges, once per frame, for as long as the drag lasts. */
  #scrollFrame = () => {
    const active = this.#active;
    if (!active) return;
    const scroller = this.#options.scroller();
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      const before = scroller.scrollTop;
      if (active.y < box.top + UMBRADESKTOP_DRAG_SCROLL_BAND_PX) scroller.scrollTop -= UMBRADESKTOP_DRAG_SCROLL_STEP_PX;
      else if (active.y > box.bottom - UMBRADESKTOP_DRAG_SCROLL_BAND_PX) scroller.scrollTop += UMBRADESKTOP_DRAG_SCROLL_STEP_PX;
      if (scroller.scrollTop !== before) this.#track();
    }
    active.frame = requestAnimationFrame(this.#scrollFrame);
  };

  /** Swallow the one click the release of a captured drag produces, so the tile does not launch. */
  #swallowNextClick(): void {
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    // The click, if any, is dispatched with the release; anything later is a new click.
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
  }

  /** Remove every listener, the timer, the frame and the ghost. */
  #cleanup(): void {
    const drag = this.#active ?? this.#pending;
    if (drag) {
      if (drag.timer !== undefined) clearTimeout(drag.timer);
      drag.element.removeEventListener('touchmove', this.#onTouchMove);
      drag.element.removeEventListener('contextmenu', this.#onContextMenu);
      drag.element.removeAttribute('data-lifted');
    }
    if (this.#active) {
      if (this.#active.frame !== undefined) cancelAnimationFrame(this.#active.frame);
      this.#active.ghost.remove();
      try {
        this.#active.element.releasePointerCapture(this.#active.pointerId);
      } catch {
        // Nothing was captured.
      }
    }
    window.removeEventListener('pointermove', this.#onMove, true);
    window.removeEventListener('pointerup', this.#onUp, true);
    window.removeEventListener('pointercancel', this.#onPointerCancel, true);
    document.removeEventListener('keydown', this.#onKey, true);
    this.#pending = undefined;
    this.#active = undefined;
  }
}
```

- [ ] **Step 9: Run the three test files to see them pass**

Run each with `npx web-test-runner "<path>" --node-resolve`. Expected: PASS. Two likely snags:
- The swallowed-click case: in the test the `tile.click()` runs after `pointerup` in the same task,
  before the `setTimeout(0)` removes the swallow, which matches a real release.
- The Escape case: `#onKey` has to be registered in the **capture** phase on `document`, which runs
  before any bubble listener on `document`.

- [ ] **Step 10: Both gates**

Run: `npm run build && npm test`. Expected: both pass.

---

### Task 10: Drag in normal mode, and the pin badge goes

**Files:**
- Modify: `launcher/drop-target.ts` (+ test): `dropClassFor`
- Modify: `components/launcher.element.ts`
- Modify: `components/launcher.test-helper.ts`: a stepwise drag
- Create: `components/launcher-drag.test.ts`
- Modify: `settings/settings.context.ts`, `settings/pinned.ts`, `settings/pinned.test.ts`: `togglePin` and `togglePinnedApp` go
- Modify: `theme/types.ts`, the three theme palettes and sheets that style `.pin`
- Modify: `localization/en.ts`, `localization/nl.ts`
- Create (scratchpad, not the repo): the touch check

- [ ] **Step 1: The touch spike first**

This is the risk §5 names, so prove it before building on it. Bundle the controller and drive a real
touch sequence at it in headless Chrome with touch emulation. Nothing here goes in the repo.

From the worktree root, bundle:

```bash
npx --prefix src/Umbraco.Community.UmbraDesktop esbuild src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/launcher/tile-drag.controller.ts --bundle --format=iife --global-name=Drag --outfile=<scratchpad>/drag.js
```

Write `<scratchpad>/touch-drag-check.cjs` with the Write tool:

```js
// Drives a real touch sequence (CDP Input.dispatchTouchEvent, via puppeteer's touchscreen) at the
// bundled drag controller, to answer the one question synthetic pointer events cannot: does a long
// press start a drag without the page scrolling, and does a quick swipe still scroll?
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.resolve('src/Umbraco.Community.UmbraDesktop/package.json'));
const puppeteer = req('puppeteer-core');
const { Launcher } = req('chrome-launcher');

const [bundlePath, profileDir] = process.argv.slice(2);
const tiles = Array.from({ length: 20 }, (_, i) => `<div class="tile" id="t${i}">Tile ${i}</div>`).join('');
const html = `<!doctype html><meta name="viewport" content="width=device-width"><div id="host"></div>
<script>${fs.readFileSync(bundlePath, 'utf8')}</script>
<script>
  window.log = [];
  const root = document.getElementById('host').attachShadow({ mode: 'open' });
  root.innerHTML = '<style>#scroller{height:300px;overflow:auto} .tile{height:60px;margin:8px;background:#ddd;touch-action:manipulation;user-select:none;-webkit-touch-callout:none} #target{height:60px;background:#fcc} .drag-ghost{position:fixed;pointer-events:none}</style>'
    + '<div id="scroller"><div id="target">drop here</div>${tiles}</div>';
  const controller = new Drag.UmbraDesktopTileDragController(() => root, {
    targetAt: (x, y) => (root.elementsFromPoint(x, y).some((e) => e.id === 'target') ? { kind: 'remove' } : undefined),
    onStart: () => log.push('start'),
    onOver: () => {},
    onDrop: () => log.push('drop'),
    onEnd: () => log.push('end'),
    scroller: () => root.getElementById('scroller'),
  });
  root.querySelectorAll('.tile').forEach((t) => t.addEventListener('pointerdown', (e) => controller.begin(e, { kind: 'group', groupId: t.id })));
</script>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: Launcher.getInstallations()[0], headless: true, userDataDir: profileDir });
  const page = await browser.newPage();
  await page.emulate(puppeteer.KnownDevices['iPad Pro 11']);
  await page.setContent(html);
  const centre = (id) => page.evaluate((i) => {
    const r = document.getElementById('host').shadowRoot.getElementById(i).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
  const state = () => page.evaluate(() => ({ log: [...window.log], scrollTop: document.getElementById('host').shadowRoot.getElementById('scroller').scrollTop }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. Long press on a tile, then drag it up onto the target.
  const from = await centre('t2');
  const to = await centre('target');
  await page.touchscreen.touchStart(from.x, from.y);
  await wait(600);
  for (let i = 1; i <= 10; i++) await page.touchscreen.touchMove(from.x, from.y + ((to.y - from.y) * i) / 10);
  await page.touchscreen.touchEnd();
  const longPress = await state();

  // 2. A quick swipe on a tile, which must scroll and must not drag.
  await page.evaluate(() => (window.log.length = 0));
  const swipe = await centre('t1');
  await page.touchscreen.touchStart(swipe.x, swipe.y);
  for (let i = 1; i <= 10; i++) await page.touchscreen.touchMove(swipe.x, swipe.y - 20 * i);
  await page.touchscreen.touchEnd();
  await wait(300);
  const quickSwipe = await state();

  console.log(JSON.stringify({ longPress, quickSwipe }, null, 2));
  await browser.close();
})();
```

Run it with a short profile directory (a long scratchpad path overflows Windows' MAX_PATH for
Chrome's profile):

```bash
node <scratchpad>/touch-drag-check.cjs <scratchpad>/drag.js C:/tmp/ud-touch
```

Expected: `longPress.log` contains `start`, `drop` and `end`, and `longPress.scrollTop` is `0`;
`quickSwipe.log` is empty and `quickSwipe.scrollTop` is greater than `0`.

**If it does not come out that way, stop and report to the owner** with the output. The design's
fallback (§12) is that touch uses arrange mode's buttons only; that is the owner's call, not this
task's. Delete `C:/tmp/ud-touch` afterwards.

- [ ] **Step 2: Write the failing test for the drop highlight helper**

Append to `launcher/drop-target.test.ts` (extend the import to `import { dropClassFor, dropTargetAt } from './drop-target';`):

```ts
it('names the highlight a tile or a card gets from the target under the pointer', () => {
  const overTile = { kind: 'tile' as const, groupId: 'editing', alias: 'media', after: true };
  expect(dropClassFor(overTile, 'editing', 'media')).to.equal('drop-after');
  expect(dropClassFor({ ...overTile, after: false }, 'editing', 'media')).to.equal('drop-before');
  expect(dropClassFor(overTile, 'editing', 'content')).to.equal('');
  expect(dropClassFor(overTile, 'editing')).to.equal('drop');
  expect(dropClassFor({ kind: 'group', groupId: 'editing', after: false }, 'editing')).to.equal('drop');
  expect(dropClassFor({ kind: 'remove' }, 'editing')).to.equal('');
  expect(dropClassFor(undefined, 'editing')).to.equal('');
});
```

Run it: FAIL, `dropClassFor` is not exported.

- [ ] **Step 3: Implement `dropClassFor`**

Append to `launcher/drop-target.ts`:

```ts
/**
 * The class that shows where a drop would land: a bar before or after a tile, or a highlighted card.
 * Shared by normal mode and arrange mode so the two cannot disagree about what "over" means.
 * @param over The target under the pointer, if any.
 * @param groupId The group being drawn, or the Pinned id.
 * @param alias The tile being drawn; omitted for the card itself.
 * @returns `drop-before`, `drop-after`, `drop`, or an empty string.
 */
export function dropClassFor(over: UmbraDesktopDropTarget | undefined, groupId: string, alias?: string): string {
  if (!over || (over.kind !== 'tile' && over.kind !== 'group') || over.groupId !== groupId) return '';
  if (alias === undefined) return 'drop';
  return over.kind === 'tile' && over.alias === alias ? (over.after ? 'drop-after' : 'drop-before') : '';
}
```

Run the drop-target tests: PASS.

- [ ] **Step 4: Make the helper's drag stepwise**

Pinned and the remove pane only render once a drag has started, so a test has to let the launcher
render between the press and the drop. Replace `dragOnto` in `components/launcher.test-helper.ts`:

```ts
/**
 * Drive a mouse drag through the launcher's drag controller: press on the source, move past the
 * threshold, let the launcher render (Pinned and the remove pane only appear once a drag starts),
 * then move onto the target and release there.
 * @param mount The mounted launcher, for its `settle`.
 * @param source The element to press on.
 * @param target Finds the element to release over, after the drag has started.
 */
export async function dragOnto(mount: UmbraDesktopLauncherMount, source: Element, target: () => Element | null): Promise<void> {
  const at = (type: string, x: number, y: number, on: EventTarget) =>
    on.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: y, pointerId: 11, pointerType: 'mouse', button: 0, bubbles: true, composed: true }),
    );
  const from = source.getBoundingClientRect();
  const x0 = from.left + from.width / 2;
  const y0 = from.top + from.height / 2;
  at('pointerdown', x0, y0, source);
  at('pointermove', x0 + 10, y0, window);
  await mount.settle();
  const element = target();
  if (!element) throw new Error('The drop target did not render once the drag started.');
  const to = element.getBoundingClientRect();
  const x1 = to.left + Math.min(to.width / 2, 20);
  const y1 = to.top + to.height / 2;
  at('pointermove', x1, y1, window);
  at('pointerup', x1, y1, window);
  await mount.settle();
}
```

(`x1` sits near the left edge so a drop on a card lands on its empty area before the first tile only
when the card is wider than its tiles; the cases below pick targets that make the landing
unambiguous.)

- [ ] **Step 5: Write the failing drag tests**

Create `components/launcher-drag.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { cardsOf, dragOnto, mountLauncher, stubApp } from './launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants.js';

/** Dragging in normal mode: move, pin and remove, and nothing else (design §3.1, D6). */

const TIMEOUT_MS = 20_000;
const GROUPS = [
  { alias: 'editing', label: 'Editing', weight: 10 },
  { alias: 'diagnostics', label: 'Diagnostics', weight: 40 },
];
const APPS = [stubApp('content', 'editing', 10), stubApp('media', 'editing', 20), stubApp('logs', 'diagnostics', 10)];

let mount: UmbraDesktopLauncherMount | undefined;
afterEach(() => {
  mount?.remove();
  mount = undefined;
});

/**
 * A tile in the mounted launcher.
 * @param m The mount.
 * @param alias The app's alias.
 * @returns The tile.
 */
const tile = (m: UmbraDesktopLauncherMount, alias: string) => m.root.querySelector<HTMLElement>(`.tile[data-alias="${alias}"]`)!;

it('moves a tile onto a tile in another group', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  await dragOnto(mount, tile(mount, 'content'), () => tile(mount!, 'logs'));
  expect(cardsOf(mount.root)).to.deep.equal([
    ['editing', ['media']],
    ['diagnostics', ['content', 'logs']],
  ]);
});

it('shows Pinned as a target during a drag, even with nothing pinned, and pins on drop', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  expect(mount.root.querySelector(`.card[data-group="${UMBRADESKTOP_PINNED_GROUP_ID}"]`)).to.equal(null);
  await dragOnto(mount, tile(mount, 'logs'), () => mount!.root.querySelector(`.card[data-group="${UMBRADESKTOP_PINNED_GROUP_ID}"]`));
  expect(mount.writes[mount.writes.length - 1]?.pinned).to.deep.equal(['logs']);
  expect(cardsOf(mount.root)[0]).to.deep.equal([UMBRADESKTOP_PINNED_GROUP_ID, ['logs']]);
});

it('replaces the footer with the remove pane during a drag, and removes on drop', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  await dragOnto(mount, tile(mount, 'media'), () => mount!.root.querySelector('.removepane'));
  expect(mount.writes[mount.writes.length - 1]?.layout?.removed).to.deep.equal(['media']);
  expect(mount.root.querySelector('.removepane')).to.equal(null);
  expect(mount.root.querySelector('.footer')).to.not.equal(null);
});

it('does not launch the dragged app, and tiles still launch after a drag', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  await dragOnto(mount, tile(mount, 'content'), () => tile(mount!, 'logs'));
  expect(mount.launched).to.deep.equal([]);
  // A later click is a new one: the controller swallows only the click the release produces.
  tile(mount, 'content').querySelector<HTMLElement>('.launch')!.click();
  expect(mount.launched.map((a) => a.alias)).to.deep.equal(['content']);
});

it('has no pin control on a tile any more', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS });
  expect(mount.root.querySelector('.pin')).to.equal(null);
});
```

Run: `npx web-test-runner "src/desktop/components/launcher-drag.test.ts" --node-resolve`
Expected: FAIL, tiles have no `pointerdown` yet and `.pin` still renders.

- [ ] **Step 6: Wire the drag into the launcher and take the pin badge out**

In `components/launcher.element.ts`:

Replace the `pinKeysFor` import with:

```ts
import { UmbraDesktopTileDragController } from '../launcher/tile-drag.controller.js';
import { dropClassFor, dropTargetAt } from '../launcher/drop-target.js';
import type { UmbraDesktopDropTarget } from '../launcher/drop-target.js';
import { applyAppDrop, applyGroupDrop } from '../launcher/apply-drop.js';
```

Update the class JSDoc: drop "Each tile carries a pin control" wording if present, and add after the
first paragraph:

```ts
 *
 * Tiles only launch. A drag moves, pins or removes an app (design D6): it takes movement past a
 * threshold to start, and removing takes a drop on a pane that only exists during a drag, so none of
 * it can happen by accident. That is what replaced the hover pin badge, which sat over the corner of
 * the tile you were aiming at.
```

Add fields:

```ts
  /** Whether a drag is under way; shows Pinned as a target and the remove pane. */
  @state()
  private _dragging = false;

  /** The drop target under the pointer, for the landing highlight. */
  @state()
  private _over?: UmbraDesktopDropTarget;

  /** The one drag controller, shared with arrange mode (Task 11). */
  #drag = new UmbraDesktopTileDragController(() => this.shadowRoot, {
    targetAt: (x, y, source) => (this.shadowRoot ? dropTargetAt(this.shadowRoot, x, y, source.kind) : undefined),
    onStart: () => (this._dragging = true),
    onOver: (target) => (this._over = target),
    onDrop: (source, target) =>
      this.#commit(
        source.kind === 'app'
          ? applyAppDrop(this.#inputs, this.#arrangement, source.app, target)
          : applyGroupDrop(this.#inputs, this.#arrangement, source.groupId, target),
      ),
    onEnd: () => {
      this._dragging = false;
      this._over = undefined;
    },
    scroller: () => this.shadowRoot?.querySelector<HTMLElement>('.body') ?? null,
  });
```

Add methods:

```ts
  /**
   * Store the result of one launcher action. Nothing to store is a no-op, which is what a drop
   * that changes nothing returns.
   * @param result The new arrangement, or `undefined`.
   */
  #commit(result: UmbraDesktopLauncherArrangement | undefined) {
    if (result) this.#settings?.setLauncherArrangement(result.pinned, result.layout);
  }

  /** A drag in flight when the taskbar unmounts the launcher is abandoned, listeners and all. */
  override disconnectedCallback() {
    this.#drag.cancel();
    super.disconnectedCallback();
  }
```

Delete `#togglePin` and `#pinGlyph`. Replace `#tile` with:

```ts
  /**
   * One app tile: launches on click, drags on a press that moves (design D6).
   * @param app The app.
   * @param groupId The group it is drawn in, or the Pinned id.
   * @returns The tile template.
   */
  #tile(app: UmbraDesktopApp, groupId: string) {
    return html`
      <div
        class="tile ${dropClassFor(this._over, groupId, app.alias)}"
        data-drop="tile"
        data-group=${groupId}
        data-alias=${app.alias}
        @pointerdown=${(e: PointerEvent) => this.#drag.begin(e, { kind: 'app', app })}>
        <button class="launch" title=${this.localize.string(app.name)} @click=${() => this.#open(app)}>
          <umb-icon name=${app.icon}></umb-icon>
          <span class="tlb">${this.localize.string(app.name)}</span>
        </button>
      </div>
    `;
  }
```

In `#renderPinned`, replace the early return and the card's opening tag:

```ts
    // Drawn while dragging even when empty, or there would be no way to pin by dragging on a fresh
    // launcher (design §3.1).
    if (view.pinned.length === 0 && !this._dragging) return '';
    return html`
      <div class="card fav ${dropClassFor(this._over, UMBRADESKTOP_PINNED_GROUP_ID)}" data-drop="group" data-group=${UMBRADESKTOP_PINNED_GROUP_ID}>
```

and in `#renderGroups` give the card its highlight:

```ts
            <div class="card ${dropClassFor(this._over, g.id)}" data-drop="group" data-group=${g.id}>
```

Add the remove pane:

```ts
  /**
   * The remove pane, in place of the footer for as long as a drag lasts. It exists only then, so a
   * removal can only ever be a deliberate drop on it.
   * @returns The pane template.
   */
  #renderRemovePane() {
    return html`
      <div class="removepane ${this._over?.kind === 'remove' ? 'drop' : ''}" data-drop="remove">
        <umb-icon name="icon-trash"></umb-icon>
        <span class="remove-title">${this.localize.term('umbraDesktop_removeFromLauncher')}</span>
        <span class="remove-hint">${this.localize.term('umbraDesktop_removeFromLauncherHint')}</span>
      </div>
    `;
  }
```

In `render()`, replace the final `${this.#renderFooter()}` of the launcher branch with
`${this._dragging ? this.#renderRemovePane() : this.#renderFooter()}`.

In `static styles`, delete the four `.pin` rules and the comment above them, and add:

```css
      /* A press on a tile may become a drag, so the platform's own long-press behaviours (text
         selection, the iOS callout) must not start instead. */
      .tile {
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
      /* The tile being dragged stays in place, faded, so the gap it leaves reads as where it was. */
      [data-lifted] {
        opacity: 0.35;
      }
      /* The copy that follows the pointer. Fixed, centred on the pointer, and out of hit-testing so
         the drop target underneath it is what the pointer finds. */
      .drag-ghost {
        position: fixed;
        z-index: 1000;
        pointer-events: none;
        transform: translate(-50%, -50%) rotate(-3deg);
        background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
        border-radius: var(--uui-border-radius, 3px);
        box-shadow: var(--umbradesktop-launcher-ghost-shadow, var(--uui-shadow-depth-3));
      }
      /* Where a drop lands: a highlighted card, or a bar before or after a tile. */
      .card.drop,
      .palette.drop {
        background: var(--umbradesktop-launcher-drop-background, color-mix(in srgb, var(--uui-color-focus, #3544b1) 8%, transparent));
        outline: var(--umbradesktop-launcher-drop-outline, 2px solid var(--uui-color-focus, #3544b1));
        outline-offset: 2px;
      }
      .tile.drop-before::before,
      .tile.drop-after::after {
        content: '';
        position: absolute;
        top: 4px;
        bottom: 4px;
        border-left: var(--umbradesktop-launcher-drop-outline, 2px solid var(--uui-color-focus, #3544b1));
      }
      .tile.drop-before::before {
        left: calc(var(--uui-size-space-3) / -2 - 1px);
      }
      .tile.drop-after::after {
        right: calc(var(--uui-size-space-3) / -2 - 1px);
      }
      /* The remove pane replaces the footer during a drag, at the footer's place and height. */
      .removepane {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--uui-size-space-1);
        padding: var(--uui-size-space-4);
        background: var(--umbradesktop-launcher-remove-background, color-mix(in srgb, var(--uui-color-danger, #d42054) 10%, transparent));
        border-top: var(--umbradesktop-launcher-remove-border, 2px dashed var(--uui-color-danger, #d42054));
        color: var(--umbradesktop-launcher-remove-text, var(--uui-color-danger, #d42054));
        font-weight: 700;
      }
      .removepane.drop {
        outline: var(--umbradesktop-launcher-drop-outline, 2px solid var(--uui-color-focus, #3544b1));
        outline-offset: -4px;
      }
      .removepane umb-icon {
        font-size: 20px;
      }
      .remove-hint {
        font-weight: 400;
        font-size: var(--uui-type-small-size);
      }
```

- [ ] **Step 7: Retire the pin toggle everywhere**

- `settings/settings.context.ts`: delete `togglePin` and the `togglePinnedApp` import.
- `settings/pinned.ts`: delete `togglePinnedApp`; `pinAppBefore` and `withoutApp` replace it.
- `settings/pinned.test.ts`: delete the six top-level `togglePinnedApp` cases and drop it from the
  import.
- `components/launcher.test-helper.ts`: delete `togglePin: () => undefined,` from the settings stub.
- `localization/en.ts` and `nl.ts`: delete `pin` and `unpin`, and add under `// launcher chrome`:

  en:
  ```ts
    removeFromLauncher: 'Drop here to remove from your launcher',
    removeFromLauncherHint: 'It stays in All apps, and Arrange can put it back',
  ```
  nl:
  ```ts
    removeFromLauncher: 'Laat hier los om van je launcher te halen',
    removeFromLauncherHint: 'Hij blijft in Alle apps, en met Indelen zet je hem terug',
  ```

- `theme/types.ts`: delete `'--umbradesktop-launcher-pin-hover-background'` and add after the
  tokens Task 8 added:

  ```ts
  '--umbradesktop-launcher-drop-background',
  '--umbradesktop-launcher-drop-outline',
  '--umbradesktop-launcher-ghost-shadow',
  '--umbradesktop-launcher-remove-background',
  '--umbradesktop-launcher-remove-border',
  '--umbradesktop-launcher-remove-text',
  ```

- `theme/themes/umbraco4/palette.ts`, `theme/themes/win11/palette.ts` (both variants) and
  `theme/themes/win98/palette.ts`: delete the `--umbradesktop-launcher-pin-hover-background` line.
- `theme/themes/umbraco4/launcher.css.ts`, `win11/launcher.css.ts`, `win98/launcher.css.ts`:
  delete every `.pin` rule and the comment above it, and change the prose that describes the pin
  badge. In Windows 98 and Umbraco 4, the `.launch` rule's right padding existed only to make room
  for the pin toggle ("The trailing padding is the space the pin toggle occupies"): set it to match
  the left padding and delete that sentence. The file-level JSDoc of each (and `macos/launcher.css.ts`
  line 6) lists "pin badges" among what survives the restyle; replace it with "the All apps and
  Arrange controls".
- `theme/themes/win98/launcher.test.ts` and `umbraco4/launcher.test.ts`: their JSDoc says "the app
  tiles and their pin toggles need the app catalogue"; make it "the app tiles need the app
  catalogue".

Run `grep -rn "pin-hover\|\.pin\b\|pin toggle\|pin badge\|umbraDesktop_pin\|umbraDesktop_unpin" src`
from `backoffice`: expected no hits outside comments you have just rewritten.

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx web-test-runner "src/desktop/components/launcher-*.test.ts" --node-resolve`, then
`npx web-test-runner "src/desktop/settings/*.test.ts" --node-resolve`. Expected: PASS.

- [ ] **Step 9: Both gates**

Run: `npm run build && npm test`. Expected: both pass, the tokens test included.

---

### Task 11: Arrange mode

**Files:**
- Create: `launcher/geometry.ts`, `launcher/geometry.test.ts`
- Create: `launcher/arrange.controller.ts`
- Modify: `components/launcher.element.ts`
- Modify: `components/launcher.test-helper.ts`: a launcher width option
- Create: `components/launcher-arrange.test.ts`
- Modify: `localization/en.ts`, `localization/nl.ts`
- Modify: `theme/types.ts`

- [ ] **Step 1: The terms**

In `localization/en.ts` under `// launcher chrome`:

```ts
    arrange: 'Arrange',
    arrangeBanner: 'Arranging your launcher. Tiles do not open while you arrange.',
    arrangeDone: 'Done',
    arrangeReset: 'Reset to default',
    arrangeResetConfirm: 'Put your groups back to the default? Your pinned apps stay.',
    arrangeCancel: 'Cancel',
    arrangeAddApps: 'Add apps',
    arrangeBackToLayout: 'Back to your launcher',
    arrangePinnedHint: 'Fixed. Drop here to pin',
    arrangeMoveGroup: 'Move group. Drag it, or use the arrow keys',
    arrangeRename: 'Group name',
    arrangeDeleteGroup: 'Delete group. Its apps wait under Not on your launcher',
    arrangeRemoveApp: 'Remove from launcher',
    arrangeMoveTo: 'Move to',
    arrangeMoveToTitle: 'Move %0% to',
    arrangeNewGroup: 'New group',
    arrangeNotOnLauncher: 'Not on your launcher',
    arrangeAddApp: 'Add to launcher',
    arrangeAddAll: 'Add all',
    arrangeAddGroup: 'Add group',
    arrangePaletteEmpty: 'Every app you can open is on your launcher. Remove a tile or a group and it waits here.',
    launcherEmpty: 'Your launcher is empty.',
```

In `localization/nl.ts`:

```ts
    arrange: 'Indelen',
    arrangeBanner: 'Je launcher indelen. Tegels openen niet tijdens het indelen.',
    arrangeDone: 'Klaar',
    arrangeReset: 'Standaard herstellen',
    arrangeResetConfirm: 'Je groepen terugzetten naar de standaard? Je vastgemaakte apps blijven.',
    arrangeCancel: 'Annuleren',
    arrangeAddApps: 'Apps toevoegen',
    arrangeBackToLayout: 'Terug naar je launcher',
    arrangePinnedHint: 'Vast. Laat hier los om vast te maken',
    arrangeMoveGroup: 'Groep verplaatsen. Sleep hem, of gebruik de pijltjestoetsen',
    arrangeRename: 'Groepsnaam',
    arrangeDeleteGroup: 'Groep verwijderen. De apps wachten onder Niet op je launcher',
    arrangeRemoveApp: 'Van launcher halen',
    arrangeMoveTo: 'Verplaatsen naar',
    arrangeMoveToTitle: '%0% verplaatsen naar',
    arrangeNewGroup: 'Nieuwe groep',
    arrangeNotOnLauncher: 'Niet op je launcher',
    arrangeAddApp: 'Aan launcher toevoegen',
    arrangeAddAll: 'Alles toevoegen',
    arrangeAddGroup: 'Groep toevoegen',
    arrangePaletteEmpty: 'Elke app die je kunt openen staat op je launcher. Haal een tegel of groep weg en hij wacht hier.',
    launcherEmpty: 'Je launcher is leeg.',
```

- [ ] **Step 2: Write the failing geometry test**

Create `launcher/geometry.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_LAUNCHER_BODY_PADDING,
  UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH,
  UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH,
  UMBRADESKTOP_LAUNCHER_SPLIT_MIN,
} from './geometry';

it('splits only where one card column fits beside the palette', () => {
  expect(UMBRADESKTOP_LAUNCHER_SPLIT_MIN).to.equal(
    UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH + 2 * UMBRADESKTOP_LAUNCHER_BODY_PADDING + UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH,
  );
});

it("states the body padding the launcher's CSS really has", () => {
  // The constant restates --uui-size-space-4 so the breakpoint can be computed; this is the check
  // that the two still agree, measured rather than assumed (docs/developer/theming.md §4).
  const probe = document.createElement('div');
  probe.style.padding = 'var(--uui-size-space-4, 12px)';
  document.body.appendChild(probe);
  const measured = parseFloat(getComputedStyle(probe).paddingLeft);
  probe.remove();
  expect(measured).to.equal(UMBRADESKTOP_LAUNCHER_BODY_PADDING);
});
```

Run: FAIL, the module does not exist.

- [ ] **Step 3: Implement `launcher/geometry.ts`**

```ts
/**
 * The launcher's widths that both CSS and tests read (design §6.3). Derived here once, per
 * `docs/developer/theming.md` §4, then measured in a browser (Task 13), because deriving only makes a sum
 * consistent with itself.
 */

/** The narrowest a group card may be; the launcher's `.cards` grid reads it as its `minmax` floor. */
export const UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH = 260;

/**
 * The launcher body's padding on each side, in px. Restates `--uui-size-space-4`, which is what the
 * CSS actually uses; `geometry.test.ts` checks that the two agree.
 */
export const UMBRADESKTOP_LAUNCHER_BODY_PADDING = 12;

/** The palette's width in arrange mode when it sits beside the layout. */
export const UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH = 300;

/**
 * The narrowest arrange area that fits one card column beside the palette: below this the palette
 * becomes its own view behind "Add apps" (design D12). The container query and the tests both read
 * it. The arrange area is the launcher's content box, so the launcher's own border is outside it.
 */
export const UMBRADESKTOP_LAUNCHER_SPLIT_MIN =
  UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH + 2 * UMBRADESKTOP_LAUNCHER_BODY_PADDING + UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH;
```

Run the geometry test: PASS. In `components/launcher.element.ts`, change the `.cards` rule's
`minmax(260px, 1fr)` to `minmax(${unsafeCSS(UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH)}px, 1fr)` (import
`unsafeCSS` from `@umbraco-cms/backoffice/external/lit` and the constant from
`../launcher/geometry.js`), and in the `:host` width comment replace "minmax(260px, 1fr)" with
"minmax(UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH, 1fr)".

- [ ] **Step 4: Let the helper set the launcher's width**

In `components/launcher.test-helper.ts`, add to `UmbraDesktopLauncherMountOptions`:

```ts
  /**
   * The launcher's own width in px, set through `--umbradesktop-launcher-width` the way a theme
   * does. The wrapper's width does not size the launcher; this does.
   */
  launcherWidth?: number;
```

and after creating the element in `mountLauncher`:

```ts
  if (options.launcherWidth !== undefined) {
    launcher.style.setProperty('--umbradesktop-launcher-width', `${options.launcherWidth}px`);
  }
```

- [ ] **Step 5: Write the failing arrange tests**

Create `components/launcher-arrange.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { dragOnto, mountLauncher, stubApp } from './launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from './launcher.test-helper.js';
import { UMBRADESKTOP_LAUNCHER_SPLIT_MIN } from '../launcher/geometry.js';

/** Arrange mode (design §3.3): every drag has a button, groups are edited here, and tiles do not launch. */

const TIMEOUT_MS = 20_000;
const GROUPS = [
  { alias: 'editing', label: 'Editing', weight: 10 },
  { alias: 'diagnostics', label: 'Diagnostics', weight: 40 },
];
const APPS = [
  stubApp('content', 'editing', 10),
  stubApp('media', 'editing', 20),
  stubApp('logs', 'diagnostics', 10),
  stubApp('profiling', 'diagnostics', 20),
];
let mount: UmbraDesktopLauncherMount | undefined;
afterEach(() => {
  mount?.remove();
  mount = undefined;
});

/**
 * Mount a launcher and enter arrange mode.
 * @param options Anything to pass to the mount.
 * @returns The mount, arranging.
 */
async function arranging(options: Partial<Parameters<typeof mountLauncher>[0]> = {}): Promise<UmbraDesktopLauncherMount> {
  const m = await mountLauncher({ apps: APPS, groups: GROUPS, launcherWidth: 1180, ...options });
  m.root.querySelector<HTMLElement>('.ctl.arrange')!.click();
  await m.settle();
  return m;
}

/**
 * An element in the launcher.
 * @param m The mount.
 * @param selector A selector.
 * @returns The element.
 */
const $ = (m: UmbraDesktopLauncherMount, selector: string) => m.root.querySelector<HTMLElement>(selector)!;

/**
 * An arrange tile.
 * @param m The mount.
 * @param groupId The group it is in.
 * @param alias The app.
 * @returns The tile.
 */
const arrTile = (m: UmbraDesktopLauncherMount, groupId: string, alias: string) =>
  $(m, `.tile.arr[data-group="${groupId}"][data-alias="${alias}"]`);

/**
 * The aliases each arrange group shows, empty groups included. Pinned is drawn above `.cards` and so
 * is not in this list.
 * @param m The mount.
 * @returns `[group id, aliases]` pairs.
 */
const arranged = (m: UmbraDesktopLauncherMount) =>
  [...m.root.querySelectorAll<HTMLElement>('.layout-pane .cards .agroup[data-group]')].map((card) => [
    card.dataset.group,
    [...card.querySelectorAll<HTMLElement>('.tile.arr')].map((t) => t.dataset.alias),
  ]);

it('shows the banner, and tiles do not launch', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  expect($(mount, '.banner')).to.not.equal(null);
  arrTile(mount, 'editing', 'content').click();
  expect(mount.launched).to.deep.equal([]);
});

it('removes an app with its − button, and adds it back from the palette with +', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.tile.arr[data-alias="profiling"] .rm').click();
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.layout?.removed).to.deep.equal(['profiling']);
  $(mount, '.prow[data-alias="profiling"] .add').click();
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.layout?.removed).to.deep.equal([]);
  expect(arranged(mount)).to.deep.equal([
    ['editing', ['content', 'media']],
    ['diagnostics', ['logs', 'profiling']],
  ]);
});

it('deletes a group without asking, and brings it back whole with Add group', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.agroup[data-group="diagnostics"] .gdel').click();
  await mount.settle();
  expect(arranged(mount).map(([id]) => id)).to.deep.equal(['editing']);
  $(mount, '.addall[data-addall="diagnostics"]').click();
  await mount.settle();
  expect(arranged(mount)).to.deep.equal([
    ['editing', ['content', 'media']],
    ['diagnostics', ['logs', 'profiling']],
  ]);
});

it('pins through Move to', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.tile.arr[data-alias="logs"] .mv').click();
  await mount.settle();
  [...mount.root.querySelectorAll<HTMLElement>('.movemenu .mmi')][0].click();
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.pinned).to.deep.equal(['logs']);
  expect(mount.root.querySelector('.movemenu')).to.equal(null);
});

it('moves an app into a new group through Move to, and focuses the new name', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.tile.arr[data-alias="logs"] .mv').click();
  await mount.settle();
  $(mount, '.movemenu .mmi.new').click();
  await mount.settle();
  await mount.settle();
  const groups = mount.writes[mount.writes.length - 1].layout!.groups;
  const created = groups[groups.length - 1];
  expect(created.id.startsWith('custom-')).to.equal(true);
  expect(created.apps).to.deep.equal(['logs']);
  expect((mount.root.activeElement as HTMLInputElement | null)?.dataset.rename).to.equal(created.id);
});

it('closes Move to on Escape and keeps the Escape from closing the launcher', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.tile.arr[data-alias="logs"] .mv').click();
  await mount.settle();
  let reachedDocument = false;
  const listener = () => (reachedDocument = true);
  document.addEventListener('keydown', listener);
  $(mount, '.movemenu .mmi').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  document.removeEventListener('keydown', listener);
  await mount.settle();
  expect(mount.root.querySelector('.movemenu')).to.equal(null);
  expect(reachedDocument).to.equal(false);
});

it('renames a group, and clearing a catalogue group gives its name back', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  const input = $(mount, '.rename[data-rename="editing"]') as HTMLInputElement;
  input.value = 'Writing';
  input.dispatchEvent(new Event('change'));
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.layout?.groups.find((g) => g.id === 'editing')?.label).to.equal('Writing');
  const again = $(mount, '.rename[data-rename="editing"]') as HTMLInputElement;
  again.value = '';
  again.dispatchEvent(new Event('change'));
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.layout?.groups.find((g) => g.id === 'editing')?.label).to.equal(null);
});

it('moves a focused tile with the arrow keys and keeps focus on it', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  const tile = arrTile(mount, 'editing', 'media');
  tile.focus();
  tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true }));
  await mount.settle();
  await mount.settle();
  expect(arranged(mount)[0]).to.deep.equal(['editing', ['media', 'content']]);
  expect((mount.root.activeElement as HTMLElement | null)?.dataset.alias).to.equal('media');
});

it('moves a group with the arrow keys on its handle', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.handle[data-handle="diagnostics"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }));
  await mount.settle();
  expect(arranged(mount).map(([id]) => id)).to.deep.equal(['diagnostics', 'editing']);
});

it('asks before Reset, and Reset keeps the pins', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging({ pinned: ['logs'] });
  $(mount, '.tile.arr[data-alias="profiling"] .rm').click();
  await mount.settle();
  $(mount, '.ctl.reset').click();
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]?.layout).to.not.equal(undefined);
  $(mount, '.ctl.reset-yes').click();
  await mount.settle();
  expect(mount.writes[mount.writes.length - 1]).to.deep.equal({ pinned: ['logs'], layout: undefined });
});

it('goes back to normal mode on Done', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  $(mount, '.ctl.done').click();
  await mount.settle();
  expect(mount.root.querySelector('.banner')).to.equal(null);
  expect(mount.root.querySelector('.ctl.arrange')).to.not.equal(null);
});

it('adds by dragging a palette row into a group, and removes by dragging a tile onto the palette', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  await dragOnto(mount, arrTile(mount, 'diagnostics', 'profiling'), () => mount!.root.querySelector('.palette'));
  expect(mount.writes[mount.writes.length - 1]?.layout?.removed).to.deep.equal(['profiling']);
  await dragOnto(mount, $(mount, '.prow[data-alias="profiling"]'), () => arrTile(mount!, 'editing', 'content'));
  expect(arranged(mount)[0]).to.deep.equal(['editing', ['profiling', 'content', 'media']]);
});

it('reorders groups by dragging a handle', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await arranging();
  await dragOnto(mount, $(mount, '.handle[data-handle="diagnostics"]'), () => $(mount!, '.agroup[data-group="editing"] .gh'));
  expect(arranged(mount).map(([id]) => id)).to.deep.equal(['diagnostics', 'editing']);
});

describe('the container query (design D12)', () => {
  /**
   * Whether an element is drawn at all.
   * @param element The element.
   * @returns True unless it or an ancestor is `display: none`.
   */
  const drawn = (element: HTMLElement | null) => !!element && element.getClientRects().length > 0;

  /**
   * Enter arrange mode with the arrange area exactly this wide. Measured and corrected rather than
   * computed, because whether the launcher's border and padding come out of its width token depends
   * on the theme's box-sizing, and the container query only sees the arrange area.
   * @param width The arrange area's width in px.
   * @returns The mount.
   */
  async function arrangeAt(width: number): Promise<UmbraDesktopLauncherMount> {
    const m = await arranging({ launcherWidth: width });
    const actual = m.root.querySelector<HTMLElement>('.arrange')!.getBoundingClientRect().width;
    if (actual !== width) {
      m.launcher.style.setProperty('--umbradesktop-launcher-width', `${2 * width - actual}px`);
      await m.settle();
    }
    return m;
  }

  it('puts the palette beside the layout when one card column fits beside it', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arrangeAt(UMBRADESKTOP_LAUNCHER_SPLIT_MIN);
    expect(drawn(mount.root.querySelector('.palette'))).to.equal(true);
    expect(drawn(mount.root.querySelector('.layout-pane'))).to.equal(true);
    expect(drawn(mount.root.querySelector('.ctl.add-apps'))).to.equal(false);
  });

  it('makes the palette its own view behind Add apps one pixel narrower', async function () {
    this.timeout(TIMEOUT_MS);
    mount = await arrangeAt(UMBRADESKTOP_LAUNCHER_SPLIT_MIN - 1);
    expect(drawn(mount.root.querySelector('.palette'))).to.equal(false);
    $(mount, '.ctl.add-apps').click();
    await mount.settle();
    expect(drawn(mount.root.querySelector('.palette'))).to.equal(true);
    expect(drawn(mount.root.querySelector('.layout-pane'))).to.equal(false);
  });
});

it('offers Arrange and All apps from an empty launcher', async function () {
  this.timeout(TIMEOUT_MS);
  mount = await mountLauncher({ apps: APPS, groups: GROUPS, layout: { groups: [], removed: APPS.map((a) => a.alias), deletedGroups: [] } });
  expect(mount.root.querySelector('.empty .ctl.arrange')).to.not.equal(null);
  expect(mount.root.querySelector('.empty .ctl.all-apps')).to.not.equal(null);
});
```

Run: `npx web-test-runner "src/desktop/components/launcher-arrange.test.ts" --node-resolve`
Expected: FAIL, there is no Arrange control.

- [ ] **Step 6: Implement `launcher/arrange.controller.ts`**

```ts
import type { UmbraDesktopApp } from '../types';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants';
import { filterApps } from './alphabet';
import { dropClassFor } from './drop-target';
import type { UmbraDesktopDropTarget } from './drop-target';
import type { UmbraDesktopDragSource } from './tile-drag.controller';
import type { UmbraDesktopGroupLabel } from './group-labels';
import {
  addApp,
  addGroup,
  createGroup,
  deleteGroup,
  moveApp,
  moveGroup,
  newGroupId,
  pinApp,
  removeApp,
  renameGroup,
  resetLayout,
} from './layout-edits';
import type {
  UmbraDesktopLauncherArrangement,
  UmbraDesktopLauncherInputs,
  UmbraDesktopLauncherView,
  UmbraDesktopLauncherViewGroup,
} from './resolve-launcher';
import { UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH, UMBRADESKTOP_LAUNCHER_SPLIT_MIN } from './geometry';
import { css, html, repeat, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import type { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Arrange mode (design §3.3): the banner, the layout with a button for every drag, Move to, and the
 * palette of what is not on the launcher.
 *
 * A controller rendering into the launcher's shadow root, like the drawer, so theme sheets reach it
 * and the one drag controller can hit-test it. Every edit goes through `layout-edits.ts` and is
 * handed to the launcher to store, one write per action. The launcher opens no modal, so Move to,
 * the rename field and the Reset confirm are all inline.
 */

/** What arrange mode asks of the launcher. */
export interface UmbraDesktopArrangeActions {
  /** Store an edit's result; `undefined` is a no-op. */
  commit(result: UmbraDesktopLauncherArrangement | undefined): void;
  /** Start a drag from a tile, a palette row or a group handle. */
  beginDrag(e: PointerEvent, source: UmbraDesktopDragSource): void;
  /** Leave arrange mode. */
  done(): void;
}

/** What arrange mode draws from, handed in on every render so handlers act on the latest. */
export interface UmbraDesktopArrangeState {
  inputs: UmbraDesktopLauncherInputs;
  arrangement: UmbraDesktopLauncherArrangement;
  view: UmbraDesktopLauncherView;
  /** The drop target under the pointer during a drag. */
  over?: UmbraDesktopDropTarget;
  /** A group heading's text, translated or literal. */
  label(label: UmbraDesktopGroupLabel): string;
}

/** The − glyph. Chrome, like the window controls, so inline rather than an icon font. */
const MINUS = html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"></path></svg>`;

/** The + glyph. */
const PLUS = html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"></path></svg>`;

/** The ⋯ glyph. Umbraco's icon set has no "more" icon. */
const DOTS = html`<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.5" fill="currentColor"></circle><circle cx="8" cy="8" r="1.5" fill="currentColor"></circle><circle cx="13" cy="8" r="1.5" fill="currentColor"></circle></svg>`;

export class UmbraDesktopArrangeController {
  /** The launcher. */
  #host: UmbLitElement;

  /** What arrange mode asks of the launcher. */
  #actions: UmbraDesktopArrangeActions;

  /** The state of the last render, which every handler acts on. */
  #state?: UmbraDesktopArrangeState;

  /** Whether the banner is asking to confirm Reset. */
  #confirmReset = false;

  /** Whether the narrow layout is showing the palette instead of the layout. */
  #showPalette = false;

  /** The palette's filter text. */
  #paletteQuery = '';

  /** The tile whose Move to list is open, as `group|alias`. */
  #menuFor?: string;

  /**
   * A selector to focus once it exists. Kept until found, because an edit lands through the
   * settings context and the render that draws its result can come a frame later.
   */
  #focusNext?: string;

  /**
   * @param host The launcher.
   * @param actions What arrange mode asks of it.
   */
  constructor(host: UmbLitElement, actions: UmbraDesktopArrangeActions) {
    this.#host = host;
    this.#actions = actions;
  }

  /** Start fresh each time arrange mode is entered. */
  reset(): void {
    this.#confirmReset = false;
    this.#showPalette = false;
    this.#paletteQuery = '';
    this.#menuFor = undefined;
    this.#focusNext = undefined;
  }

  /** Put focus where the last action asked for it. Call from the launcher's `updated()`. */
  afterRender(): void {
    if (!this.#focusNext) return;
    const element = this.#host.shadowRoot?.querySelector<HTMLElement>(this.#focusNext);
    if (!element) return;
    this.#focusNext = undefined;
    element.focus();
    if (element instanceof HTMLInputElement) element.select();
  }

  /**
   * A term in the backoffice language.
   * @param key The term's key.
   * @returns The text.
   */
  #t(key: string): string {
    return this.#host.localize.term(key);
  }

  /**
   * An app's translated name.
   * @param app The app.
   * @returns The name.
   */
  #name(app: UmbraDesktopApp): string {
    return this.#host.localize.string(app.name);
  }

  /**
   * Change local state and redraw.
   * @param change The change.
   */
  #set(change: () => void): void {
    change();
    this.#host.requestUpdate();
  }

  /**
   * The whole of arrange mode.
   * @param state What to draw from.
   * @returns The template.
   */
  render(state: UmbraDesktopArrangeState) {
    this.#state = state;
    return html`
      <div class="arrange" @pointerdown=${this.#closeMenuOutside}>
        ${this.#banner()}
        <div class="split ${this.#showPalette ? 'show-palette' : ''}">
          <div class="body layout-pane">
            ${this.#pinnedCard(state)}
            <div class="cards">
              ${repeat(state.view.groups, (g) => g.id, (g) => this.#groupCard(g))}
              <button class="card newgroup" @click=${this.#newGroup}>
                <umb-icon name="icon-add"></umb-icon>
                <span>${this.#t('umbraDesktop_arrangeNewGroup')}</span>
              </button>
            </div>
          </div>
          <div class="palette ${state.over?.kind === 'palette' ? 'drop' : ''}" data-drop="palette">${this.#palette(state)}</div>
        </div>
      </div>
    `;
  }

  /** The banner, or the Reset confirm in its place. */
  #banner() {
    if (this.#confirmReset) {
      return html`
        <div class="banner" role="alertdialog" aria-label=${this.#t('umbraDesktop_arrangeResetConfirm')}>
          <span class="banner-text">${this.#t('umbraDesktop_arrangeResetConfirm')}</span>
          <button class="ctl primary reset-yes" @click=${this.#reset}>${this.#t('umbraDesktop_arrangeReset')}</button>
          <button class="ctl reset-no" @click=${() => this.#set(() => (this.#confirmReset = false))}>
            ${this.#t('umbraDesktop_arrangeCancel')}
          </button>
        </div>
      `;
    }
    return html`
      <div class="banner">
        <span class="banner-text">${this.#t('umbraDesktop_arrangeBanner')}</span>
        <button
          class="ctl add-apps"
          aria-pressed=${this.#showPalette ? 'true' : 'false'}
          @click=${() => this.#set(() => (this.#showPalette = !this.#showPalette))}>
          ${this.#t(this.#showPalette ? 'umbraDesktop_arrangeBackToLayout' : 'umbraDesktop_arrangeAddApps')}
        </button>
        <button class="ctl reset" @click=${() => this.#set(() => (this.#confirmReset = true))}>${this.#t('umbraDesktop_arrangeReset')}</button>
        <button class="ctl primary done" @click=${() => this.#actions.done()}>${this.#t('umbraDesktop_arrangeDone')}</button>
      </div>
    `;
  }

  /** Reset, after the confirm. Pins stay (design D10). */
  #reset = () => {
    this.#confirmReset = false;
    this.#actions.commit(resetLayout(this.#state!.arrangement));
    this.#host.requestUpdate();
  };

  /**
   * Pinned, as a fixed place: a drop target with tiles, and no handle, rename or delete (design D5).
   * @param state What to draw from.
   * @returns The card.
   */
  #pinnedCard(state: UmbraDesktopArrangeState) {
    return html`
      <div class="card fav agroup ${dropClassFor(state.over, UMBRADESKTOP_PINNED_GROUP_ID)}" data-drop="group" data-group=${UMBRADESKTOP_PINNED_GROUP_ID}>
        <div class="gh">
          <umb-icon name="icon-pushpin"></umb-icon>
          <span class="gname">${this.#t('umbraDesktop_favourites')}</span>
          <span class="hint">${this.#t('umbraDesktop_arrangePinnedHint')}</span>
        </div>
        <div class="grid">
          ${repeat(state.view.pinned, (a) => a.alias, (a) => this.#tile(a, UMBRADESKTOP_PINNED_GROUP_ID, state.view.pinned))}
        </div>
      </div>
    `;
  }

  /**
   * One group, drawn even when empty so it can take a drop.
   * @param group The group.
   * @returns The card.
   */
  #groupCard(group: UmbraDesktopLauncherViewGroup) {
    const state = this.#state!;
    const name = state.label(group.label);
    return html`
      <div class="card agroup ${dropClassFor(state.over, group.id)}" data-drop="group" data-group=${group.id}>
        <div class="gh">
          <button
            class="handle"
            data-handle=${group.id}
            title=${this.#t('umbraDesktop_arrangeMoveGroup')}
            aria-label=${`${this.#t('umbraDesktop_arrangeMoveGroup')}: ${name}`}
            @pointerdown=${(e: PointerEvent) => this.#actions.beginDrag(e, { kind: 'group', groupId: group.id })}
            @keydown=${(e: KeyboardEvent) => this.#groupKey(e, group.id)}>
            <umb-icon name="icon-grip"></umb-icon>
          </button>
          <input
            class="rename"
            data-rename=${group.id}
            .value=${name}
            aria-label=${this.#t('umbraDesktop_arrangeRename')}
            @change=${(e: Event) => this.#rename(group, e.target as HTMLInputElement)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }} />
          <button
            class="gdel"
            title=${this.#t('umbraDesktop_arrangeDeleteGroup')}
            aria-label=${`${this.#t('umbraDesktop_arrangeDeleteGroup')}: ${name}`}
            @click=${() => this.#actions.commit(deleteGroup(state.inputs, state.arrangement, group.id))}>
            <umb-icon name="icon-trash"></umb-icon>
          </button>
        </div>
        <div class="grid">${repeat(group.apps, (a) => a.alias, (a) => this.#tile(a, group.id, group.apps))}</div>
      </div>
    `;
  }

  /**
   * One tile in arrange mode: it does not launch; it drags, and carries − and ⋯.
   * @param app The app.
   * @param groupId Its group, or the Pinned id.
   * @param siblings The apps drawn beside it, for the arrow keys.
   * @returns The tile.
   */
  #tile(app: UmbraDesktopApp, groupId: string, siblings: ReadonlyArray<UmbraDesktopApp>) {
    const state = this.#state!;
    const name = this.#name(app);
    const key = `${groupId}|${app.alias}`;
    const open = this.#menuFor === key;
    return html`
      <div
        class="tile arr ${dropClassFor(state.over, groupId, app.alias)}"
        tabindex="0"
        role="group"
        aria-label=${name}
        data-drop="tile"
        data-group=${groupId}
        data-alias=${app.alias}
        @pointerdown=${(e: PointerEvent) => {
          if ((e.target as Element).closest('button, .movemenu')) return;
          this.#actions.beginDrag(e, { kind: 'app', app });
        }}
        @keydown=${(e: KeyboardEvent) => this.#tileKey(e, app, groupId, siblings)}>
        <umb-icon name=${app.icon}></umb-icon>
        <span class="tlb">${name}</span>
        <button
          class="edit rm"
          title=${this.#t('umbraDesktop_arrangeRemoveApp')}
          aria-label=${`${this.#t('umbraDesktop_arrangeRemoveApp')}: ${name}`}
          @click=${() => this.#actions.commit(removeApp(state.inputs, state.arrangement, app))}>
          ${MINUS}
        </button>
        <button
          class="edit mv"
          data-menu=${key}
          title=${this.#t('umbraDesktop_arrangeMoveTo')}
          aria-label=${`${this.#t('umbraDesktop_arrangeMoveTo')}: ${name}`}
          aria-haspopup="menu"
          aria-expanded=${open ? 'true' : 'false'}
          @click=${() => this.#toggleMenu(key)}>
          ${DOTS}
        </button>
        ${open ? this.#menu(app, groupId) : ''}
      </div>
    `;
  }

  /**
   * Move to: Pinned, every other group, a new group, or off the launcher.
   * @param app The app.
   * @param groupId Where it is now.
   * @returns The list.
   */
  #menu(app: UmbraDesktopApp, groupId: string) {
    const state = this.#state!;
    const title = this.#host.localize.term('umbraDesktop_arrangeMoveToTitle', this.#name(app));
    return html`
      <div class="movemenu" role="menu" aria-label=${title} @keydown=${this.#menuKey}>
        <div class="mmh">${title}</div>
        ${groupId !== UMBRADESKTOP_PINNED_GROUP_ID
          ? html`<button class="mmi" role="menuitem" @click=${() => this.#fromMenu(pinApp(state.inputs, state.arrangement, app))}>
              ${this.#t('umbraDesktop_favourites')}
            </button>`
          : ''}
        ${state.view.groups
          .filter((g) => g.id !== groupId)
          .map(
            (g) => html`<button class="mmi" role="menuitem" @click=${() => this.#fromMenu(moveApp(state.inputs, state.arrangement, app, g.id))}>
              ${state.label(g.label)}
            </button>`,
          )}
        <button class="mmi new" role="menuitem" @click=${() => this.#moveToNewGroup(app)}>${this.#t('umbraDesktop_arrangeNewGroup')}</button>
        <button class="mmi rmv" role="menuitem" @click=${() => this.#fromMenu(removeApp(state.inputs, state.arrangement, app))}>
          ${this.#t('umbraDesktop_arrangeRemoveApp')}
        </button>
      </div>
    `;
  }

  /**
   * Open or close a tile's Move to list, focusing its first item when it opens.
   * @param key The tile, as `group|alias`.
   */
  #toggleMenu(key: string): void {
    this.#set(() => {
      this.#menuFor = this.#menuFor === key ? undefined : key;
      if (this.#menuFor) this.#focusNext = '.movemenu .mmi';
    });
  }

  /**
   * Close Move to and store what was chosen.
   * @param result The edit's result.
   */
  #fromMenu(result: UmbraDesktopLauncherArrangement): void {
    this.#menuFor = undefined;
    this.#actions.commit(result);
    this.#host.requestUpdate();
  }

  /**
   * Keys inside Move to: Escape closes it and returns focus to its button, the arrows walk the
   * items. Every handled key stops here, so it neither moves the tile around it nor, for Escape,
   * reaches the taskbar, which would close the whole launcher.
   * @param e The key event.
   */
  #menuKey = (e: KeyboardEvent) => {
    const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.mmi')];
    const at = items.indexOf(this.#host.shadowRoot?.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      const key = this.#menuFor;
      this.#set(() => {
        this.#menuFor = undefined;
        if (key) this.#focusNext = `[data-menu="${CSS.escape(key)}"]`;
      });
    } else if (e.key === 'ArrowDown') {
      items[(at + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      items[(at - 1 + items.length) % items.length]?.focus();
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  /** A press anywhere outside an open Move to list closes it. */
  #closeMenuOutside = (e: PointerEvent) => {
    if (this.#menuFor && !(e.target as Element).closest('.movemenu, .mv')) this.#set(() => (this.#menuFor = undefined));
  };

  /**
   * Arrow keys on a focused tile move it within its group: back one, or forward one.
   * @param e The key event.
   * @param app The app.
   * @param groupId Its group, or the Pinned id.
   * @param siblings The apps drawn beside it.
   */
  #tileKey(e: KeyboardEvent, app: UmbraDesktopApp, groupId: string, siblings: ReadonlyArray<UmbraDesktopApp>): void {
    if (e.target !== e.currentTarget) return;
    const at = siblings.indexOf(app);
    let before: UmbraDesktopApp | undefined;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (at <= 0) return;
      before = siblings[at - 1];
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (at === -1 || at >= siblings.length - 1) return;
      before = siblings[at + 2];
    } else {
      return;
    }
    e.preventDefault();
    const state = this.#state!;
    this.#focusNext = `.tile.arr[data-group="${CSS.escape(groupId)}"][data-alias="${CSS.escape(app.alias)}"]`;
    this.#actions.commit(
      groupId === UMBRADESKTOP_PINNED_GROUP_ID
        ? pinApp(state.inputs, state.arrangement, app, before)
        : moveApp(state.inputs, state.arrangement, app, groupId, before),
    );
  }

  /**
   * Arrow keys on a focused group handle move the group: back one, or forward one.
   * @param e The key event.
   * @param groupId The group.
   */
  #groupKey(e: KeyboardEvent, groupId: string): void {
    const state = this.#state!;
    const ids = state.view.groups.map((g) => g.id);
    const at = ids.indexOf(groupId);
    let before: string | undefined;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (at <= 0) return;
      before = ids[at - 1];
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (at === -1 || at >= ids.length - 1) return;
      before = ids[at + 2];
    } else {
      return;
    }
    e.preventDefault();
    this.#focusNext = `[data-handle="${CSS.escape(groupId)}"]`;
    this.#actions.commit(moveGroup(state.inputs, state.arrangement, groupId, before));
  }

  /**
   * Store a rename. Unchanged text stores nothing, so a translated name is not frozen into a literal
   * by tabbing through it; a user group cleared to nothing gets its name back in the field.
   * @param group The group.
   * @param input The rename field.
   */
  #rename(group: UmbraDesktopLauncherViewGroup, input: HTMLInputElement): void {
    const state = this.#state!;
    const shown = state.label(group.label);
    if (input.value.trim() === shown) return;
    if (!input.value.trim() && group.custom) {
      input.value = shown;
      return;
    }
    this.#actions.commit(renameGroup(state.inputs, state.arrangement, group.id, input.value));
  }

  /** New group: an empty group at the end, with its name selected for typing over. */
  #newGroup = () => {
    const state = this.#state!;
    const id = newGroupId();
    this.#focusNext = `[data-rename="${CSS.escape(id)}"]`;
    this.#actions.commit(createGroup(state.inputs, state.arrangement, id, this.#t('umbraDesktop_arrangeNewGroup')));
  };

  /**
   * Move to > New group: a new group holding this app, with its name selected for typing over.
   * @param app The app.
   */
  #moveToNewGroup(app: UmbraDesktopApp): void {
    const state = this.#state!;
    const id = newGroupId();
    const created = createGroup(state.inputs, state.arrangement, id, this.#t('umbraDesktop_arrangeNewGroup'));
    this.#focusNext = `[data-rename="${CSS.escape(id)}"]`;
    this.#fromMenu(moveApp(state.inputs, created, app, id));
  }

  /**
   * The palette: what is not on the launcher, by catalogue group, with Add / Add all / Add group.
   * @param state What to draw from.
   * @returns The palette's contents.
   */
  #palette(state: UmbraDesktopArrangeState) {
    const nameOf = (app: UmbraDesktopApp) => this.#name(app);
    const groups = state.view.palette
      .map((p) => ({ ...p, apps: filterApps(p.apps, nameOf, this.#paletteQuery) }))
      .filter((p) => p.apps.length > 0);
    return html`
      <div class="ph">${this.#t('umbraDesktop_arrangeNotOnLauncher')}</div>
      <input
        class="search palette-filter"
        type="search"
        .value=${this.#paletteQuery}
        placeholder=${this.#t('umbraDesktop_filterApps')}
        aria-label=${this.#t('umbraDesktop_filterApps')}
        @input=${(e: Event) => this.#set(() => (this.#paletteQuery = (e.target as HTMLInputElement).value))} />
      <div class="plist">
        ${state.view.palette.length === 0 ? html`<p class="empty-note">${this.#t('umbraDesktop_arrangePaletteEmpty')}</p>` : ''}
        ${groups.map(
          (p) => html`
            <div class="pgroup">
              <div class="pgh">
                <span class="pgname">${this.#host.localize.string(p.group.label)}</span>
                <button
                  class="ctl addall"
                  data-addall=${p.group.alias}
                  @click=${() => this.#actions.commit(addGroup(state.inputs, state.arrangement, p.group.alias))}>
                  ${this.#t(p.onLauncher ? 'umbraDesktop_arrangeAddAll' : 'umbraDesktop_arrangeAddGroup')}
                </button>
              </div>
              ${p.apps.map(
                (app) => html`
                  <div
                    class="prow"
                    data-alias=${app.alias}
                    @pointerdown=${(e: PointerEvent) => {
                      if ((e.target as Element).closest('button')) return;
                      this.#actions.beginDrag(e, { kind: 'app', app });
                    }}>
                    <umb-icon name=${app.icon}></umb-icon>
                    <span class="pname">${nameOf(app)}</span>
                    <button
                      class="edit add"
                      title=${this.#t('umbraDesktop_arrangeAddApp')}
                      aria-label=${`${this.#t('umbraDesktop_arrangeAddApp')}: ${nameOf(app)}`}
                      @click=${() => this.#actions.commit(addApp(state.inputs, state.arrangement, app))}>
                      ${PLUS}
                    </button>
                  </div>
                `,
              )}
            </div>
          `,
        )}
      </div>
    `;
  }
}

/**
 * Arrange mode's CSS, included in the launcher's `static styles`. The split is a container query on
 * the arrange area itself (design D12), so it follows whatever width the theme gives the panel.
 */
export const arrangeStyles = css`
  .arrange {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    container-type: inline-size;
  }
  .banner {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--uui-size-space-2);
    margin: var(--uui-size-space-4) var(--uui-size-space-4) 0;
    padding: var(--uui-size-space-2) var(--uui-size-space-3);
    background: var(--umbradesktop-launcher-banner-background, var(--umbradesktop-launcher-card-background, var(--uui-color-surface)));
    border: var(--umbradesktop-launcher-banner-border, 1px solid var(--umbradesktop-launcher-border-emphasis, var(--uui-color-border-emphasis, var(--uui-color-border))));
    border-radius: var(--umbradesktop-launcher-search-radius, var(--uui-border-radius, 3px));
    color: var(--umbradesktop-launcher-banner-text, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    font-size: var(--uui-type-small-size);
  }
  .banner-text {
    flex: 1 1 12em;
    min-width: 0;
  }
  .split {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .split > .layout-pane,
  .split > .palette {
    min-height: 0;
  }
  .palette {
    display: none;
    flex-direction: column;
    gap: var(--uui-size-space-2);
    padding: var(--uui-size-space-4);
    overflow: auto;
  }
  .split.show-palette > .layout-pane {
    display: none;
  }
  .split.show-palette > .palette {
    display: flex;
  }
  @container (min-width: ${unsafeCSS(UMBRADESKTOP_LAUNCHER_SPLIT_MIN)}px) {
    .split,
    .split.show-palette {
      grid-template-columns: minmax(0, 1fr) ${unsafeCSS(UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH)}px;
    }
    .split > .layout-pane,
    .split.show-palette > .layout-pane {
      display: flex;
    }
    .split > .palette {
      display: flex;
      border-left: var(--umbradesktop-launcher-divider, 1px solid var(--uui-color-border));
    }
    .banner .add-apps {
      display: none;
    }
  }
  .gh {
    display: flex;
    align-items: center;
    gap: var(--uui-size-space-2);
    margin: 0 0 var(--uui-size-space-3);
  }
  .gname {
    flex: 1;
    min-width: 0;
    font-size: var(--uui-type-h5-size, 16px);
  }
  .hint,
  .mmh {
    color: var(--umbradesktop-launcher-text-muted, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    font-size: var(--uui-type-small-size);
  }
  .handle,
  .gdel,
  .edit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    padding: 0;
    border: var(--umbradesktop-launcher-control-border, var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border)));
    border-radius: 50%;
    background: var(--umbradesktop-launcher-control-background, var(--umbradesktop-launcher-card-background, var(--uui-color-surface)));
    color: var(--umbradesktop-launcher-control-text, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    cursor: pointer;
  }
  .handle {
    border: none;
    background: transparent;
    color: var(--umbradesktop-launcher-text-muted, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    cursor: grab;
  }
  .handle:hover,
  .gdel:hover,
  .edit:hover {
    background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));
  }
  .edit svg {
    width: 12px;
    height: 12px;
  }
  .rename {
    flex: 1;
    min-width: 0;
    padding: 2px var(--uui-size-space-2);
    border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
    border-radius: var(--umbradesktop-launcher-search-radius, var(--uui-border-radius, 3px));
    background: var(--umbradesktop-launcher-control-background, var(--umbradesktop-launcher-card-background, var(--uui-color-surface)));
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    font-size: var(--uui-type-default-size, 14px);
  }
  .tile.arr {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--uui-size-space-1);
    padding: var(--uui-size-space-2) var(--uui-size-space-1);
    border: 1px dashed var(--umbradesktop-launcher-text-muted, var(--uui-color-border));
    border-radius: var(--uui-border-radius, 3px);
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    text-align: center;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .tile.arr:focus-visible {
    outline: 2px solid var(--uui-color-focus, #3544b1);
    outline-offset: 1px;
  }
  .tile.arr umb-icon {
    font-size: 26px;
  }
  .tile.arr .edit {
    position: absolute;
    top: 2px;
    width: 22px;
    height: 22px;
  }
  .tile.arr .rm {
    left: 2px;
  }
  .tile.arr .mv {
    right: 2px;
  }
  .movemenu {
    position: absolute;
    top: 28px;
    right: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 180px;
    padding: var(--uui-size-space-1) 0;
    background: var(--umbradesktop-launcher-background, var(--uui-color-surface));
    border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
    border-radius: var(--uui-border-radius, 3px);
    box-shadow: var(--umbradesktop-launcher-shadow, var(--uui-shadow-depth-3));
    text-align: left;
    cursor: default;
  }
  .mmh {
    padding: var(--uui-size-space-1) var(--uui-size-space-3);
  }
  .mmi {
    padding: var(--uui-size-space-2) var(--uui-size-space-3);
    border: none;
    background: transparent;
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    font-size: var(--uui-type-small-size);
    text-align: left;
    cursor: pointer;
  }
  .mmi:hover,
  .mmi:focus-visible {
    background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));
    outline: none;
  }
  .mmi.new {
    border-top: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
  }
  .mmi.rmv {
    color: var(--umbradesktop-launcher-remove-text, var(--uui-color-danger, #d42054));
  }
  .newgroup {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--uui-size-space-2);
    min-height: 96px;
    border-style: dashed;
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    cursor: pointer;
  }
  .ph,
  .pgh {
    font-weight: 700;
    font-size: var(--uui-type-small-size);
  }
  .palette .search {
    flex: none;
  }
  .pgroup {
    display: flex;
    flex-direction: column;
    gap: var(--uui-size-space-1);
  }
  .pgh {
    display: flex;
    align-items: center;
    gap: var(--uui-size-space-2);
    margin-top: var(--uui-size-space-2);
  }
  .pgname {
    flex: 1;
    min-width: 0;
  }
  .addall {
    min-height: 24px;
    padding: 0 var(--uui-size-space-2);
  }
  .prow {
    display: flex;
    align-items: center;
    gap: var(--uui-size-space-2);
    padding: var(--uui-size-space-1) var(--uui-size-space-2);
    border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
    border-radius: var(--uui-border-radius, 3px);
    background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-size: var(--uui-type-small-size);
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .prow umb-icon {
    flex-shrink: 0;
    font-size: 18px;
  }
  .pname {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;
```

Note the Move to list uses the **panel's** background token, not the card's: Windows 11 and macOS
make cards transparent or nearly so, and a list drawn over tiles must be opaque enough to read.

- [ ] **Step 7: Put arrange mode into the launcher**

In `components/launcher.element.ts`:

```ts
import { UmbraDesktopArrangeController, arrangeStyles } from '../launcher/arrange.controller.js';
```

Add the controller:

```ts
  /** Arrange mode. */
  #arrange = new UmbraDesktopArrangeController(this, {
    commit: (result) => this.#commit(result),
    beginDrag: (e, source) => this.#drag.begin(e, source),
    done: () => void this.#setMode('launcher'),
  });
```

In `#setMode`, add `if (mode === 'arrange') this.#arrange.reset();` beside the drawer reset.

Add:

```ts
  /** Arrange mode puts focus where its last action asked, once the result has rendered. */
  override updated(changed: Map<PropertyKey, unknown>) {
    super.updated(changed);
    if (this._mode === 'arrange') this.#arrange.afterRender();
  }

  /**
   * What the launcher shows when nothing is pinned and every group is empty: a way back to Arrange
   * and to All apps, rather than a blank panel.
   * @returns The empty state.
   */
  #renderEmpty() {
    return html`
      <div class="empty">
        <p>${this.localize.term('umbraDesktop_launcherEmpty')}</p>
        <button class="ctl arrange" @click=${() => this.#setMode('arrange')}>${this.localize.term('umbraDesktop_arrange')}</button>
        <button class="ctl all-apps" @click=${() => this.#setMode('drawer')}>${this.localize.term('umbraDesktop_allApps')}</button>
      </div>
    `;
  }
```

Replace `render()` with:

```ts
  override render() {
    if (this._mode === 'drawer') return html`${this.#drawer.render(this._apps)} ${this.#renderFooter()}`;
    const view = resolveLauncher(this.#inputs, this.#arrangement);
    if (this._mode === 'arrange') {
      return html`
        ${this.#arrange.render({
          inputs: this.#inputs,
          arrangement: this.#arrangement,
          view,
          over: this._over,
          label: (label) => this.#label(label),
        })}
        ${this.#renderFooter()}
      `;
    }
    const empty = view.pinned.length === 0 && view.groups.every((g) => g.apps.length === 0) && !this._dragging;
    return html`
      <div class="hdr">
        <button class="search" @click=${this.#requestSearch}>
          <umb-icon name="icon-search"></umb-icon>
          <span>${this.localize.term('umbraDesktop_search')}</span>
        </button>
        <button class="ctl all-apps" @click=${() => this.#setMode('drawer')}>
          <span>${this.localize.term('umbraDesktop_allApps')}</span>
        </button>
        <button class="ctl arrange" @click=${() => this.#setMode('arrange')}>
          <umb-icon name="icon-grip"></umb-icon>
          <span>${this.localize.term('umbraDesktop_arrange')}</span>
        </button>
      </div>
      <div class="body">${empty ? this.#renderEmpty() : html`${this.#renderPinned(view)} ${this.#renderGroups(view)}`}</div>
      ${this._dragging ? this.#renderRemovePane() : this.#renderFooter()}
    `;
  }
```

Add `arrangeStyles` to `static styles` after `drawerStyles`, and to the first `css` block:

```css
      .empty {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-6, 24px);
        text-align: center;
      }
      .empty p {
        flex-basis: 100%;
        margin: 0;
      }
```

Add to `theme/types.ts` after the Task 10 tokens:

```ts
  '--umbradesktop-launcher-banner-background',
  '--umbradesktop-launcher-banner-border',
  '--umbradesktop-launcher-banner-text',
  '--umbradesktop-launcher-divider',
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx web-test-runner "src/desktop/components/launcher-*.test.ts" --node-resolve`. Expected: PASS.

- [ ] **Step 9: Both gates**

Run: `npm run build && npm test`. Expected: both pass.

---

### Task 12: Themes

Every theme gets a value for every new token, the two menu-row themes get arrange-mode styling, the
pin rules are already gone (Task 10), and a cross-theme test proves no theme hides a new control.
Read `docs/developer/theming.md` §5 and §6.3 first: a backtick inside a CSS comment ends the stylesheet.

**Files:**
- Modify: `theme/themes/macos/palette.ts`, `win11/palette.ts` (light and dark), `win98/palette.ts`, `umbraco4/palette.ts`
- Modify: `theme/themes/win98/launcher.css.ts`, `theme/themes/umbraco4/launcher.css.ts`
- Modify: `components/launcher.test-helper.ts`: a theme option
- Create: `theme/themes/launcher-controls.test.ts`

- [ ] **Step 1: Let the helper mount under a theme**

In `components/launcher.test-helper.ts`, import `paletteCss` from `../theme/palette-css.js` and the
`UmbraDesktopTheme` type from `../theme/types.js`, add to the options:

```ts
  /** Mount under a theme: its light palette on the wrapper and its launcher sheet adopted. */
  theme?: UmbraDesktopTheme;
```

set the wrapper's style with the palette when a theme is given (keeping the width):

```ts
  wrapper.setAttribute('style', `${options.theme ? paletteCss(options.theme.palettes.light) : ''} width: ${options.width ?? 1180}px;`);
```

(replacing the `wrapper.style.width = …` line), and after the first `settle()`:

```ts
  if (options.theme?.sheets) {
    const sheet = (await options.theme.sheets()).launcher?.styleSheet;
    if (sheet) launcher.shadowRoot!.adoptedStyleSheets = [...launcher.shadowRoot!.adoptedStyleSheets, sheet];
    await settle();
  }
```

- [ ] **Step 2: Write the failing cross-theme test**

Create `theme/themes/launcher-controls.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './index.js';
import { mountLauncher, stubApp } from '../../components/launcher.test-helper.js';

/**
 * A theme may restyle every new launcher control and may remove none (CLAUDE.md). Checked for all
 * five themes in the three modes, with apps on the launcher so arrange mode has tiles to draw
 * buttons on.
 */

const TIMEOUT_MS = 30_000;
const GROUPS = [{ alias: 'editing', label: 'Editing', weight: 10 }];
const APPS = [stubApp('content', 'editing', 10), stubApp('media', 'editing', 20)];

/**
 * Whether an element is really on screen: laid out, not hidden, not transparent.
 * @param element The element.
 * @returns True when a user could see it.
 */
function visible(element: Element | null): boolean {
  if (!element) return false;
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0;
}

for (const theme of UMBRADESKTOP_THEMES) {
  describe(`${theme.name} keeps every launcher control`, () => {
    it('in normal mode, in All apps, and in arrange mode', async function () {
      this.timeout(TIMEOUT_MS);
      const mount = await mountLauncher({ apps: APPS, groups: GROUPS, theme });
      try {
        const $ = (selector: string) => mount.root.querySelector(selector);
        for (const selector of ['.ctl.all-apps', '.ctl.arrange']) {
          expect(visible($(selector)), `${selector} in normal mode`).to.equal(true);
        }

        ($('.ctl.all-apps') as HTMLElement).click();
        await mount.settle();
        for (const selector of ['.ctl.back', '.drawer-filter', '.row']) {
          expect(visible($(selector)), `${selector} in All apps`).to.equal(true);
        }
        ($('.ctl.back') as HTMLElement).click();
        await mount.settle();

        ($('.ctl.arrange') as HTMLElement).click();
        await mount.settle();
        for (const selector of ['.ctl.reset', '.ctl.done', '.handle', '.rename', '.gdel', '.tile.arr .rm', '.tile.arr .mv', '.newgroup']) {
          expect(visible($(selector)), `${selector} in arrange mode`).to.equal(true);
        }
        // Side by side or behind Add apps, depending on the theme's width, but reachable either way.
        expect(visible($('.palette')) || visible($('.ctl.add-apps')), 'the palette or Add apps').to.equal(true);
      } finally {
        mount.remove();
      }
    });
  });
}
```

Run: `npx web-test-runner "src/desktop/theme/themes/launcher-controls.test.ts" --node-resolve`.
Expected: whichever themes hide or collapse a control fail. Windows 98 and Umbraco 4 are the likely
ones; note which, since Step 3 has to fix exactly those.

- [ ] **Step 3: Palette values**

Add these to each palette object, beside its other launcher tokens. The Umbraco theme ships no
palette overrides for the launcher and keeps the defaults.

macOS (`macos/palette.ts`):

```ts
  '--umbradesktop-launcher-control-background': 'rgba(255, 255, 255, 0.12)',
  '--umbradesktop-launcher-control-border': '1px solid rgba(255, 255, 255, 0.18)',
  '--umbradesktop-launcher-control-text': '#ffffff',
  '--umbradesktop-launcher-control-active-background': '#0a84ff',
  '--umbradesktop-launcher-letter-text': '#ffffff',
  '--umbradesktop-launcher-letter-border': '1px solid rgba(255, 255, 255, 0.16)',
  '--umbradesktop-launcher-text-muted': 'rgba(255, 255, 255, 0.6)',
  '--umbradesktop-launcher-banner-background': 'rgba(255, 255, 255, 0.14)',
  '--umbradesktop-launcher-banner-border': '1px solid rgba(255, 255, 255, 0.22)',
  '--umbradesktop-launcher-banner-text': '#ffffff',
  '--umbradesktop-launcher-divider': '1px solid rgba(255, 255, 255, 0.16)',
  '--umbradesktop-launcher-drop-background': 'rgba(10, 132, 255, 0.18)',
  '--umbradesktop-launcher-drop-outline': '2px solid #0a84ff',
  '--umbradesktop-launcher-ghost-shadow': '0 12px 32px rgba(0, 0, 0, 0.45)',
  '--umbradesktop-launcher-remove-background': 'rgba(255, 69, 58, 0.22)',
  '--umbradesktop-launcher-remove-border': '2px dashed #ff453a',
  '--umbradesktop-launcher-remove-text': '#ffffff',
```

Windows 11 light (`win11/palette.ts`, the light object):

```ts
  '--umbradesktop-launcher-control-background': 'rgba(255, 255, 255, 0.7)',
  '--umbradesktop-launcher-control-border': '1px solid rgba(0, 0, 0, 0.08)',
  '--umbradesktop-launcher-control-text': '#1a1a1a',
  '--umbradesktop-launcher-control-active-background': W11_ACCENT,
  '--umbradesktop-launcher-letter-text': '#1a1a1a',
  '--umbradesktop-launcher-letter-border': 'none',
  '--umbradesktop-launcher-text-muted': 'rgba(0, 0, 0, 0.6)',
  '--umbradesktop-launcher-banner-background': 'rgba(255, 255, 255, 0.7)',
  '--umbradesktop-launcher-banner-border': '1px solid rgba(0, 0, 0, 0.08)',
  '--umbradesktop-launcher-banner-text': '#1a1a1a',
  '--umbradesktop-launcher-divider': '1px solid rgba(0, 0, 0, 0.08)',
  '--umbradesktop-launcher-drop-background': 'rgba(0, 0, 0, 0.04)',
  '--umbradesktop-launcher-drop-outline': `2px solid ${W11_ACCENT}`,
  '--umbradesktop-launcher-ghost-shadow': '0 8px 24px rgba(0, 0, 0, 0.22)',
  '--umbradesktop-launcher-remove-background': 'rgba(196, 43, 28, 0.08)',
  '--umbradesktop-launcher-remove-border': '2px dashed #c42b1c',
  '--umbradesktop-launcher-remove-text': '#c42b1c',
```

Windows 11 dark (the dark object, which overrides only what differs):

```ts
  '--umbradesktop-launcher-control-background': 'rgba(255, 255, 255, 0.06)',
  '--umbradesktop-launcher-control-border': '1px solid rgba(255, 255, 255, 0.08)',
  '--umbradesktop-launcher-control-text': '#ffffff',
  '--umbradesktop-launcher-control-active-background': W11_ACCENT_DARK,
  '--umbradesktop-launcher-letter-text': '#ffffff',
  '--umbradesktop-launcher-text-muted': 'rgba(255, 255, 255, 0.6)',
  '--umbradesktop-launcher-banner-background': 'rgba(255, 255, 255, 0.06)',
  '--umbradesktop-launcher-banner-border': '1px solid rgba(255, 255, 255, 0.08)',
  '--umbradesktop-launcher-banner-text': '#ffffff',
  '--umbradesktop-launcher-divider': '1px solid rgba(255, 255, 255, 0.08)',
  '--umbradesktop-launcher-drop-background': 'rgba(255, 255, 255, 0.06)',
  '--umbradesktop-launcher-drop-outline': `2px solid ${W11_ACCENT_DARK}`,
  '--umbradesktop-launcher-remove-background': 'rgba(255, 153, 164, 0.12)',
  '--umbradesktop-launcher-remove-border': '2px dashed #ff99a4',
  '--umbradesktop-launcher-remove-text': '#ff99a4',
```

Windows 98 (`win98/palette.ts`); bevels are drawn by the sheet, so borders here are `none`:

```ts
  '--umbradesktop-launcher-control-background': WIN98_FACE,
  '--umbradesktop-launcher-control-border': 'none',
  '--umbradesktop-launcher-control-text': WIN98_TEXT,
  '--umbradesktop-launcher-control-active-background': WIN98_FACE,
  '--umbradesktop-launcher-letter-text': WIN98_TEXT,
  '--umbradesktop-launcher-letter-border': 'none',
  '--umbradesktop-launcher-text-muted': WIN98_SHADOW,
  '--umbradesktop-launcher-banner-background': '#ffffe1',
  '--umbradesktop-launcher-banner-border': `1px solid ${WIN98_TEXT}`,
  '--umbradesktop-launcher-banner-text': WIN98_TEXT,
  '--umbradesktop-launcher-divider': `1px solid ${WIN98_SHADOW}`,
  '--umbradesktop-launcher-drop-background': 'transparent',
  '--umbradesktop-launcher-drop-outline': `1px dotted ${WIN98_TEXT}`,
  '--umbradesktop-launcher-ghost-shadow': 'none',
  '--umbradesktop-launcher-remove-background': WIN98_FACE,
  '--umbradesktop-launcher-remove-border': `2px dotted ${WIN98_TEXT}`,
  '--umbradesktop-launcher-remove-text': WIN98_TEXT,
```

(`#ffffe1` is the Windows 98 tooltip yellow; if the palette file already names it, use that constant.)

Umbraco 4 (`umbraco4/palette.ts`):

```ts
  '--umbradesktop-launcher-control-background': U4_FACE,
  '--umbradesktop-launcher-control-border': `1px solid ${U4_EDGE_STRONG}`,
  '--umbradesktop-launcher-control-text': U4_TEXT,
  '--umbradesktop-launcher-control-active-background': U4_SELECT,
  '--umbradesktop-launcher-letter-text': U4_TEXT,
  '--umbradesktop-launcher-letter-border': `1px solid ${U4_LINE_SOFT}`,
  '--umbradesktop-launcher-text-muted': U4_EDGE_STRONG,
  '--umbradesktop-launcher-banner-background': U4_SELECT,
  '--umbradesktop-launcher-banner-border': `1px solid ${U4_SELECT_LINE}`,
  '--umbradesktop-launcher-banner-text': U4_TEXT,
  '--umbradesktop-launcher-divider': `1px solid ${U4_LINE_SOFT}`,
  '--umbradesktop-launcher-drop-background': U4_SELECT,
  '--umbradesktop-launcher-drop-outline': `2px solid ${U4_SELECT_LINE}`,
  '--umbradesktop-launcher-ghost-shadow': '0 4px 12px rgba(25, 35, 50, 0.3)',
  '--umbradesktop-launcher-remove-background': '#fbe9e7',
  '--umbradesktop-launcher-remove-border': '2px dashed #c0392b',
  '--umbradesktop-launcher-remove-text': '#8e2a1f',
```

`control-active-background` for macOS, Windows 98 and Umbraco 4 pairs with the base rule's
`color: var(--uui-color-selected-contrast, #fff)`. White on `U4_SELECT` (a pale blue) and on
`WIN98_FACE` is unreadable, so the sheets below restate the active text for those two themes.

- [ ] **Step 4: Windows 98 arrange styling**

Append to the template in `win98/launcher.css.ts` (import `WIN98_BEVEL_PRESSED`, `WIN98_BEVEL_RAISED`,
`WIN98_BEVEL_SUNKEN`, `WIN98_FACE`, `WIN98_HILIGHT`, `WIN98_MENU_HILIGHT_TEXT`, `WIN98_SHADOW`,
`WIN98_TEXT`, `WIN98_WINDOW` from `./palette.js`; most already are). No backticks in comments.

```css
  /* The header row carries the margin the search field used to, at the menu's bevel depth. */
  .hdr {
    margin: ${WIN98_BEVEL_DEPTH}px;
    gap: ${WIN98_BEVEL_DEPTH}px;
  }
  /* Every launcher button is a Win98 push button: raised, square, pressed while held or on. */
  .ctl,
  .handle,
  .gdel,
  .edit {
    border: none;
    border-radius: 0;
    background: ${unsafeCSS(WIN98_FACE)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_RAISED)};
    color: ${unsafeCSS(WIN98_TEXT)};
    font-size: 11px;
  }
  .ctl {
    min-height: 22px;
    padding: 0 8px;
  }
  .ctl:active,
  .handle:active,
  .gdel:active,
  .edit:active,
  .ctl[aria-pressed='true'] {
    box-shadow: ${unsafeCSS(WIN98_BEVEL_PRESSED)};
  }
  /* The default button of a Win98 dialog has a black frame; Done and the Reset confirm are those. */
  .ctl.primary,
  .ctl[aria-pressed='true'] {
    color: ${unsafeCSS(WIN98_TEXT)};
    outline: 1px solid ${unsafeCSS(WIN98_TEXT)};
    outline-offset: -1px;
  }
  .banner {
    margin: ${WIN98_BEVEL_DEPTH}px;
    border-radius: 0;
    font-size: 11px;
  }
  .rename,
  .drawer-filter,
  .palette-filter {
    border: none;
    border-radius: 0;
    background: ${unsafeCSS(WIN98_WINDOW)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_SUNKEN)};
    font-size: 11px;
  }
  /* All apps is one menu column too, with its letters drawn as grooves like the group headings. */
  .alpha {
    columns: 1;
  }
  .lh {
    padding: 0 4px 2px;
    font-size: 11px;
    border-bottom: 1px solid ${unsafeCSS(WIN98_SHADOW)};
    box-shadow: 0 1px 0 ${unsafeCSS(WIN98_HILIGHT)};
  }
  .row {
    padding: 3px 6px;
    border-radius: 0;
    font-size: 11px;
  }
  .row:hover {
    color: ${unsafeCSS(WIN98_MENU_HILIGHT_TEXT)};
  }
  /* In arrange mode a tile is a menu row, so its two buttons sit at the row's end, where the old
     pin toggle was, and the landing bar runs across the row instead of down its side. */
  .tile.arr {
    flex-direction: row;
    justify-content: flex-start;
    gap: 6px;
    padding: 3px 50px 3px 6px;
    border: none;
    border-radius: 0;
    font-size: 11px;
    text-align: left;
  }
  .tile.arr umb-icon {
    font-size: 16px;
  }
  .tile.arr .edit {
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
  }
  .tile.arr .rm {
    left: auto;
    right: 24px;
  }
  .tile.arr .mv {
    right: ${WIN98_BEVEL_DEPTH}px;
  }
  .tile.drop-before::before,
  .tile.drop-after::after {
    top: auto;
    bottom: auto;
    left: 4px;
    right: 4px;
    border-left: none;
    border-top: var(--umbradesktop-launcher-drop-outline, 1px dotted ${unsafeCSS(WIN98_TEXT)});
  }
  .tile.drop-before::before {
    top: -1px;
  }
  .tile.drop-after::after {
    bottom: -1px;
  }
  .movemenu {
    border: none;
    border-radius: 0;
    background: ${unsafeCSS(WIN98_FACE)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_RAISED)};
  }
  .mmi,
  .mmh {
    font-size: 11px;
  }
  .mmi:hover,
  .mmi:focus-visible {
    color: ${unsafeCSS(WIN98_MENU_HILIGHT_TEXT)};
  }
  .newgroup {
    justify-content: flex-start;
    min-height: 0;
    padding: 3px 6px;
    border: none;
    font-size: 11px;
  }
  .prow {
    border: none;
    border-radius: 0;
    background: transparent;
    font-size: 11px;
  }
  .removepane {
    border-top: 1px solid ${unsafeCSS(WIN98_SHADOW)};
    box-shadow: inset 0 1px 0 ${unsafeCSS(WIN98_HILIGHT)};
    font-size: 11px;
  }
```

- [ ] **Step 5: Umbraco 4 arrange styling**

Append to the template in `umbraco4/launcher.css.ts` (import `U4_EDGE_STRONG`, `U4_FACE`,
`U4_LINE_SOFT`, `U4_PANEL`, `U4_SELECT`, `U4_SELECT_LINE`, `U4_TEXT` from `./palette.js`; check which it
already imports). Umbraco 4's launcher is a 320px column of rows with square edges, so the same row
treatment as Windows 98 applies, in its own palette:

```css
  .hdr {
    margin: 6px 6px 0;
    gap: 4px;
  }
  .ctl,
  .handle,
  .gdel,
  .edit {
    border-radius: 0;
  }
  /* The pressed and default states read as v4's pale blue selection, with dark text on it. */
  .ctl[aria-pressed='true'],
  .ctl.primary {
    color: ${unsafeCSS(U4_TEXT)};
    border-color: ${unsafeCSS(U4_SELECT_LINE)};
  }
  .banner,
  .rename,
  .drawer-filter,
  .palette-filter,
  .movemenu,
  .prow {
    border-radius: 0;
  }
  .alpha {
    columns: 1;
  }
  .tile.arr {
    flex-direction: row;
    justify-content: flex-start;
    gap: 6px;
    padding: 3px 54px 3px 6px;
    border: 1px dashed ${unsafeCSS(U4_LINE_SOFT)};
    border-radius: 0;
    text-align: left;
  }
  .tile.arr umb-icon {
    font-size: 16px;
  }
  .tile.arr .edit {
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
  }
  .tile.arr .rm {
    left: auto;
    right: 26px;
  }
  .tile.arr .mv {
    right: 3px;
  }
  .tile.drop-before::before,
  .tile.drop-after::after {
    top: auto;
    bottom: auto;
    left: 4px;
    right: 4px;
    border-left: none;
    border-top: var(--umbradesktop-launcher-drop-outline, 2px solid ${unsafeCSS(U4_SELECT_LINE)});
  }
  .tile.drop-before::before {
    top: -2px;
  }
  .tile.drop-after::after {
    bottom: -2px;
  }
  .newgroup {
    justify-content: flex-start;
    min-height: 0;
    padding: 4px 6px;
  }
  .movemenu {
    background: ${unsafeCSS(U4_PANEL)};
    border: 1px solid ${unsafeCSS(U4_EDGE_STRONG)};
  }
```

If Umbraco 4's existing `.launch` padding or `.tile` rules differ from Windows 98's, match its values
rather than these; the point is the row shape and the buttons at the row's end.

- [ ] **Step 6: Run the cross-theme test and every theme's own launcher test**

Run: `npx web-test-runner "src/desktop/theme/**/*.test.ts" --node-resolve`. Expected: PASS, including
`launcher-labels.test.ts` (none of the rules above sets `min-width`, `white-space`, `overflow-wrap` or
`word-break` on a tile) and `tokens.test.ts`.

- [ ] **Step 7: Both gates**

Run: `npm run build && npm test`. Expected: both pass.

---

### Task 13: Measure in a real backoffice

Deriving only makes a sum consistent with itself (`docs/developer/theming.md` §4). This task looks.

- [ ] **Step 1: Run the test instance**

Follow the memory recipe for a worktree test instance: a database copy for this task, `npm run build`
before `dotnet build`, browse `127.0.0.1`, grant the desktop section on a fresh database, and revert
the TestInstance lock-file bump afterwards. The Browser pane cannot render the backoffice while hidden;
drive the repo's `puppeteer-core` headless instead (memory: headless browser check).

- [ ] **Step 2: For each of the five themes, at 1920x1080 and at 768x1024 (a tablet)**

Open the launcher, then capture and check:

1. Normal mode: the header row fits; All apps and Arrange are on one line with search.
2. All apps: letters and rows readable; the filter works.
3. Arrange mode: record whether the palette is beside the layout or behind Add apps, and check the
   Move to list opens fully inside the panel for a tile in the rightmost column. Windows 11's 640px
   panel is `UMBRADESKTOP_LAUNCHER_SPLIT_MIN + 2`-ish: note which side of the breakpoint it lands.
4. A drag in normal mode: the remove pane replaces the footer, Pinned appears.

Save screenshots in the scratchpad. Report anything cramped to the owner with the screenshot rather
than fixing it silently: Windows 98's narrow arrange view is the case the design (§6, §12) expects a
decision on.

- [ ] **Step 3: Restore what a test-instance run dirties**

`Views/*.cshtml` line endings, `TriggerDeploy.ps1`, `packages.lock.json`, the untracked
`umbraco/Deploy/`, and `wallpapers.generated.ts`. `git status --short` should show only this plan's
files afterwards.

---

### Task 14: Documentation

- [ ] **Step 1: README.md**

Find every place the launcher is described (`grep -n -i "launcher\|pin\|favourite" README.md`). In the
Features list, replace the pinning line with one bullet in the file's voice covering: drag tiles to
move and pin them, drop one on the remove pane to take it off, Arrange for groups and to put things
back, All apps for everything A to Z, and new apps turning up by themselves. Update any other mention
of the pin badge. Markdown only, no HTML (the README is the NuGet readme).

- [ ] **Step 2: Marketplace listing**

In `umbraco-marketplace-umbraco.community.umbradesktop.json`, add to `Tags`: `"Customisable launcher"`,
`"Drag and drop"`. Take one arrange-mode screenshot at a width that shows the palette beside the
layout (Umbraco theme), save it to `docs/screenshots/launcher-arrange.png`, and add it to
`Screenshots` in the same shape as the existing entries. Leave `Description` alone.

- [ ] **Step 3: docs/developer/theming.md**

Add the new tokens wherever the launcher tokens are listed, remove
`--umbradesktop-launcher-pin-hover-background`, and add a short subsection under §6 on arrange mode in
a narrow theme: the container query, `UMBRADESKTOP_LAUNCHER_SPLIT_MIN`, the palette behind Add apps,
and that a menu-row theme moves `.tile.arr .edit` to the row's end as Windows 98 does. Plain prose, no
backticks inside any CSS comment it quotes.

- [ ] **Step 4: The design doc**

In `docs/design/2026-09-27-launcher-layout-design.md`:
- **Status:** "Implemented 2026-MM-DD" with anything Task 13 left open.
- §4.3: `setLauncherArrangement(pinned, undefined)` is Reset; there is no separate `resetLayout()` on
  the settings context (the pure `resetLayout` in `layout-edits.ts` returns the arrangement to store).
- §7: replace the two element rows with `launcher/drawer.controller.ts` and
  `launcher/arrange.controller.ts`, and add one paragraph with the reason from this plan's "Why the
  drawer and arrange mode are not their own elements".
- §6.2: Windows 11's measured side of the breakpoint.
- A "Notes from the build" section for anything the build taught that is not obvious from the code,
  as the desktop label design has.

- [ ] **Step 5: Both gates once more**

Run: `npm run build && npm test`. Expected: both pass. Restore `wallpapers.generated.ts`.

---

### Task 15: Verify

- [ ] **Step 1: Walk the definition of done in `CLAUDE.md`** and say, item by item, which were done
  and which did not apply (`umbraco-package.json` did not change).
- [ ] **Step 2: Spec coverage.** For each acceptance point in the design's §3, §4 and §8, name the test
  that covers it. Anything without one gets a test or a sentence saying why not.
- [ ] **Step 3: `git status --short`** shows only files this plan names. No commit.

---

### Task 16: A whole-branch review

- [ ] Dispatch a reviewer (superpowers:requesting-code-review) over the whole diff against
  `origin/main`, with the design doc and this plan as context, asking specifically about: the
  intersection rule (a hidden alias surviving every edit), drag listeners left behind on an unmount
  mid-drag, focus handling after edits, and any theme that hides a control. Fix what it confirms, re-run
  both gates, and report to the owner. Offer a commit as a question.
