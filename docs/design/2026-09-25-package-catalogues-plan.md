# Package catalogues — Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** let any package register a `umbraDesktopCatalogue` manifest carrying launcher groups and
backoffice deep links, merged over the desktop's curated catalogue with the package winning on a
shared alias, and move the Games group into the Entertainment package.

**Architecture:** two new pure units do the work: `package-catalogues.ts` validates untrusted
catalogue JSON and never throws, `merge-catalogues.ts` applies the precedence rules. The existing
`app-catalogue.context.ts` observes the new manifest type through `UmbExtensionsManifestInitializer`,
runs both units on every recompute, and watches refs that package entries introduce under three
invariants that stop it recursing or leaking. Pins learn to follow a section to the entry that
replaces its fallback tile. Everything downstream of derivation is unchanged.

**Tech stack:** TypeScript, Lit, the Umbraco 17 backoffice extension registry, web-test-runner with
`@open-wc/testing` in a real Chrome, Vite.

**Spec:** [2026-09-25-package-catalogues-design.md](2026-09-25-package-catalogues-design.md). Decision
numbers below (D1 to D17) are that document's. **Issue:** [#85](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/85).

**Sequencing:** builds on [PR #82](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/pull/82)
(Snake, and `resizable` on apps and catalogue entries), which is merged and on this branch at
`a692780`. This must merge **before** [PR #88](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/pull/88)
(Accessories), which then registers its own `accessories` group through this manifest (D17). The
owner handles #88; nothing in this plan touches it.

---

## Rules that override the skill's defaults

- **No commits, no pushes.** The owner reviews one diff. Every task ends by running its checks, not
  by committing. Offer a commit at the very end as a question, never as a done thing.
- **Both gates, always.** `npm run build` (wallpapers, `tsc`, Vite) and `npm test` (web-test-runner).
  The test runner transpiles through esbuild and does not type-check; `tsc` renders nothing. A task
  is not green until both are, in every package it touched.
- **Tests first.** Write the failing test, run it, see it fail for the reason you expect, then write
  the code.
- **JSDoc on everything**, private members included, saying why the code exists. Match the density of
  the file you are in.
- **Derive, never retype.** A value two files need is one exported constant.
- **Prose for the owner** (docs, README, messages): short and plain, no em-dashes.

## Commands

Host package, from `src/Umbraco.Community.UmbraDesktop`:

```bash
npm run build
npm test
```

One host test file, from `src/Umbraco.Community.UmbraDesktop/backoffice`:

```bash
npx web-test-runner "src/desktop/package-catalogues.test.ts" --node-resolve
```

Entertainment package, from `src/Umbraco.Community.UmbraDesktop.Entertainment`: the same
`npm run build` and `npm test`.

## Who does what

The memory rule applies per task, not per plan: under about twenty lines across three files you can
already name is done inline, and a subagent is for a unit with its own tests. Tasks 1, 2 and 5 are
subagent-sized. Tasks 3, 4, 6, 7 and 8 are inline. Task 9 is inline. Task 11 is a reviewer.

---

## File map

**New, host** (`src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/`):

| File | Responsibility |
|---|---|
| `manifest-values.ts` | What counts as a valid value in untyped manifest JSON. Shared by both validators |
| `catalogue.extension.ts` | The published contract: `umbraDesktopCatalogue` and its types, registered in `UmbExtensionManifestMap` |
| `package-catalogues.ts` | Validates package catalogue manifests (D9, D14, D15, §3.2). Pure, never throws |
| `package-catalogues.test.ts` | Its tests |
| `merge-catalogues.ts` | Applies precedence (D3 to D7, D13, §4). Pure |
| `merge-catalogues.test.ts` | Its tests |

**Modified, host:**

| File | Change |
|---|---|
| `constants.ts` | `UMBRADESKTOP_FALLBACK_ALIAS_PREFIX` |
| `url-inference.ts` | Export `UMBRADESKTOP_BACKOFFICE_SECTION_PATH` and build URLs from it |
| `types.ts` | `UmbraDesktopCatalogueReport`; `UmbraDesktopApp.coversSection` |
| `registered-apps.ts` (+ test) | Harden against wrong-typed JSON fields (D9) |
| `derive-apps.ts` (+ test) | Set `coversSection`; mint the fallback alias from the constant |
| `settings/pinned.ts` (+ test) | Pins follow the section (D15); unpin removes every key |
| `settings/settings.context.ts` | `togglePin(app)` |
| `components/launcher.element.ts` | Pinned state and toggle through `pinned.ts` |
| `app-catalogue.context.ts` (+ test) | Observe catalogues, merge, dynamic refs (D16), teardown fixes |
| `taskbar/features/types.ts`, `components/taskbar.element.ts`, `settings/categories/taskbar/taskbar.element.ts`, `taskbar/features/ai-chat/index.ts` | The chat's ref comes from the merged catalogue |
| `components/launcher-long-names.test.ts`, `components/taskbar-features.test.ts` | Their catalogue stubs gain `getEntryRef` |
| `catalogue/groups.ts` (+ test), `localization/en.ts`, `localization/nl.ts` | Drop `games` |
| `app.extension.ts` | Header comment no longer claims deep links are curated-only |

**Modified, Entertainment** (`src/Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/`):
`bundle.manifests.ts` (+ test), `umbradesktop-app.d.ts`, `localization/en.ts`, `localization/nl.ts`.

**Docs:** new `docs/package-catalogues.md`; `docs/desktop-apps.md`; `README.md`;
`docs/design/2026-09-06-desktop-apps-design.md`; `umbraco-marketplace-umbraco.community.umbradesktop.json`.

---

### Task 0: Prepare the worktree

The worktree has no `node_modules`.

- [ ] **Step 1: Install both packages**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm ci
cd ../Umbraco.Community.UmbraDesktop.Entertainment && npm ci
```

Expected: both finish without errors.

- [ ] **Step 2: Baseline both gates in both packages**

Run `npm run build` and `npm test` in each. Expected: all green. Write down the host's and
Entertainment's test counts; Task 10 compares against them. If anything is red before you have
changed a line, stop and report it rather than working around it.

---

### Task 1: The contract, and validating what a package sends

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/manifest-values.ts`
- Create: `.../desktop/catalogue.extension.ts`
- Create: `.../desktop/package-catalogues.ts`
- Create: `.../desktop/package-catalogues.test.ts`
- Modify: `.../desktop/constants.ts`, `.../desktop/url-inference.ts`, `.../desktop/types.ts`

- [ ] **Step 1: Add the fallback prefix constant**

In `constants.ts`, directly after `UMBRADESKTOP_SECTION_PATHNAME`:

```ts
/**
 * The alias prefix of a section's uncertified fallback app: `section:<section alias>`.
 *
 * One constant because three places must agree on it. Derivation mints the alias, pin resolution
 * reads it so that a pin can follow its section to the entry that replaces the fallback (design
 * D15), and package catalogue validation reserves it so that no package entry collides with one.
 */
export const UMBRADESKTOP_FALLBACK_ALIAS_PREFIX = 'section:';
```

- [ ] **Step 2: Export the section path from `url-inference.ts`**

Directly after `const BACKOFFICE_PATH = '/umbraco';` add:

```ts
/**
 * Where every backoffice section is routed, and so every screen a window can host. Exported because
 * package catalogue validation accepts a `url` only under it (design D14), and a second spelling of
 * this path would be the one that drifts.
 */
export const UMBRADESKTOP_BACKOFFICE_SECTION_PATH = `${BACKOFFICE_PATH}/section`;
```

Then replace the three `${BACKOFFICE_PATH}/section/` prefixes inside `inferUrl` with
`${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/`. The URLs it returns are byte-identical, which
`url-inference.test.ts` already proves.

- [ ] **Step 3: Add the report type to `types.ts`**

At the end of `types.ts`:

```ts
/**
 * One thing the catalogue pipeline wants a developer to know, keyed so it prints once.
 *
 * Produced by the pure validation and merge units and printed by the context through its
 * quiet-window diagnostics, so the units stay testable by calling them and never touch the console.
 */
export interface UmbraDesktopCatalogueReport {
  /** Deduplication key: a key already printed during this desktop visit is not printed again. */
  key: string;
  /** The whole console line, `[UmbraDesktop]` prefix included. */
  message: string;
}
```

- [ ] **Step 4: Create `manifest-values.ts`**

```ts
/**
 * What counts as a valid value in untyped manifest JSON.
 *
 * A static `umbraco-package.json` is type-checked by nothing, and a bundle can be built against a
 * stale copy of our types, so both manifest types the desktop reads arrive as `unknown` in practice.
 * These are the only checks either validator uses, so "a size" means the same thing everywhere.
 */

/**
 * Whether a value is a plain object: the only shape a manifest, its `meta`, or an item can have.
 * @param value Anything.
 * @returns True for a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is a string with something in it. An empty alias, name or icon is never meant.
 * @param value Anything.
 * @returns True for a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Whether a value is a real number: not `NaN`, not `Infinity`, and not a numeric string.
 * @param value Anything.
 * @returns True for a finite number.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Whether a value is a boolean. `'yes'` and `1` are not, however they read.
 * @param value Anything.
 * @returns True for `true` or `false`.
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Whether a value is a `{ w, h }` box of finite, positive numbers, the shape of every size field.
 * @param value Anything.
 * @returns True for a usable size.
 */
export function isSize(value: unknown): value is { w: number; h: number } {
  return isRecord(value) && isFiniteNumber(value.w) && isFiniteNumber(value.h) && value.w > 0 && value.h > 0;
}

/**
 * Whether a value is a list of non-empty strings, the shape of `evaluateConditions`.
 * @param value Anything.
 * @returns True for an array whose every element is a non-empty string.
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}
```

- [ ] **Step 5: Create `catalogue.extension.ts`**

```ts
import type { ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';
import type { UmbraDesktopCatalogueEntry, UmbraDesktopGroup } from './types';

/**
 * A launcher group a package defines in its catalogue.
 *
 * The curated group's shape without `auto`, which marks the desktop's own reserved More group and is
 * nothing a package can ask for. It has a name of its own rather than being `UmbraDesktopGroup`
 * itself, so that a field the curated side grows for its own reasons does not become public contract
 * by default.
 */
export type UmbraDesktopPackageGroup = Omit<UmbraDesktopGroup, 'auto'>;

/**
 * A deep link into one of a package's backoffice screens: today exactly a curated entry's fields,
 * with the same meaning and resolved by the same code. Named separately for the same reason as
 * {@link UmbraDesktopPackageGroup}.
 */
export type UmbraDesktopPackageEntry = UmbraDesktopCatalogueEntry;

/**
 * What a `umbraDesktopCatalogue` manifest carries: a package's own launcher groups and deep links,
 * in the shape of one of the curated fragment files in `catalogue/`.
 *
 * **These types only ever gain optional fields.** Nothing is removed, narrowed or given a new
 * meaning. Consuming packages hand-copy this declaration, and a copy that lags behind still describes
 * a valid manifest, where one that contradicts this file compiles just as cleanly and fails at
 * runtime.
 *
 * Every weight in here sorts **lower first**, on the launcher's own scale, because a package group
 * has to land between ours and a package entry often shares a group with ours. The manifest's root
 * `weight` is Umbraco's, higher first, and only ranks one package's catalogue against another's
 * (design D2).
 */
export interface MetaUmbraDesktopCatalogue {
  /** Launcher groups this package defines. A group with one of our aliases replaces ours. */
  groups?: UmbraDesktopPackageGroup[];
  /** Deep links into this package's screens. An entry with one of our aliases replaces ours. */
  entries?: UmbraDesktopPackageEntry[];
}

/**
 * A package's catalogue, registered as one extension manifest (design D1).
 *
 * Data only, so there is no `element` or `js`, and a static `umbraco-package.json` can carry it as
 * readily as a bundle. `ManifestWithDynamicConditions` brings `conditions`, which switch the whole
 * catalogue on or off, and `overwrites`, which Umbraco applies between catalogue manifests as it does
 * for any extension type.
 */
export interface ManifestUmbraDesktopCatalogue extends ManifestWithDynamicConditions {
  type: 'umbraDesktopCatalogue';
  meta: MetaUmbraDesktopCatalogue;
}

declare global {
  /**
   * Registers the manifest with Umbraco's own type map, the way `app.extension.ts` registers
   * `umbraDesktopApp`, so a package's `manifests` array accepts it without importing this file.
   */
  interface UmbExtensionManifestMap {
    umbraDesktopCatalogue: ManifestUmbraDesktopCatalogue;
  }
}
```

- [ ] **Step 6: Write the failing tests, `package-catalogues.test.ts`**

```ts
import { expect } from '@open-wc/testing';
import { backofficePath, normalisePackageCatalogues } from './package-catalogues';
import {
  UMBRADESKTOP_FALLBACK_ALIAS_PREFIX,
  UMBRADESKTOP_MORE_GROUP_ALIAS,
  UMBRADESKTOP_MORE_GROUP_WEIGHT,
  UMBRADESKTOP_SECTION_ALIAS,
  UMBRADESKTOP_SECTION_PATHNAME,
} from './constants';

/**
 * Package catalogues are third-party JSON, and a static `umbraco-package.json` is type-checked by
 * nothing, so these cases hand the validator the kinds of wrong a real package ships (design D9).
 * The origin is fixed rather than the test page's own, so the url cases read the same everywhere.
 */
const ORIGIN = 'https://site.test';

/**
 * Validate one catalogue manifest.
 * @param meta What the manifest's `meta` holds, deliberately untyped.
 * @param over Extra manifest fields, such as `weight`.
 * @returns The one catalogue, every report, and the reports' messages.
 */
function one(meta: unknown, over: Record<string, unknown> = {}) {
  const { catalogues, reports } = normalisePackageCatalogues(
    [{ type: 'umbraDesktopCatalogue', alias: 'Pkg.Catalogue', meta, ...over }],
    ORIGIN,
  );
  return { catalogue: catalogues[0], reports, messages: reports.map((report) => report.message) };
}

it('passes a well-formed catalogue through unchanged', () => {
  const entry = {
    alias: 'Pkg.App',
    ref: 'Pkg.MenuItem',
    section: 'Umb.Section.Settings',
    name: '#pkg_app',
    icon: 'icon-rocket',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1100, h: 760 },
    minSize: { w: 600, h: 400 },
    allowMultiple: false,
    resizable: true,
    weight: 30,
    group: 'pkg',
    evaluateConditions: ['Pkg.Condition'],
  };
  const group = { alias: 'pkg', label: '#pkg_group', weight: 22 };
  const { catalogue, reports } = one({ groups: [group], entries: [entry] }, { weight: 5 });
  expect(catalogue).to.deep.equal({ manifestAlias: 'Pkg.Catalogue', manifestWeight: 5, groups: [group], entries: [entry] });
  expect(reports).to.deep.equal([]);
});

/**
 * The blocker the review found: one package whose `entries` was an object instead of a list made
 * every recompute throw, which froze the launcher for every user on the install.
 */
it('never throws, whatever a manifest holds, and names every broken one', () => {
  const broken: unknown[] = [
    null,
    42,
    'catalogue',
    [],
    { alias: 'A' },
    { alias: 'B', meta: null },
    { alias: 'C', meta: 'groups' },
    { alias: 'D', meta: { entries: { alias: 'x', ref: 'y' } } },
    { alias: 'E', meta: { groups: 'games' } },
    { alias: 'F', meta: { entries: [null, 7, 'x', [], { alias: 5 }, { alias: '' }] } },
    { alias: 'G', meta: { groups: [null, { alias: 'g' }, { alias: 'h', label: 3 }, { label: 'x' }] } },
  ];
  let result: ReturnType<typeof normalisePackageCatalogues> | undefined;
  expect(() => (result = normalisePackageCatalogues(broken, ORIGIN))).to.not.throw();
  for (const catalogue of result!.catalogues) {
    expect(catalogue.groups, catalogue.manifestAlias).to.deep.equal([]);
    expect(catalogue.entries, catalogue.manifestAlias).to.deep.equal([]);
  }
  for (const alias of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
    expect(
      result!.reports.some((report) => report.message.includes(`"${alias}"`)),
      `a line naming catalogue ${alias}`,
    ).to.equal(true);
  }
});

it('drops a wrongly typed optional field and keeps the entry', () => {
  const { catalogue, messages } = one({
    entries: [
      {
        alias: 'Pkg.App',
        ref: 'Pkg.MenuItem',
        name: '',
        icon: 42,
        chromeProfile: 'sidebarless',
        defaultSize: { w: 'wide', h: 10 },
        minSize: { w: -1, h: 10 },
        allowMultiple: 'yes',
        resizable: 1,
        weight: '30',
        group: ['pkg'],
        evaluateConditions: 'Pkg.Condition',
      },
    ],
  });
  expect(catalogue.entries).to.deep.equal([{ alias: 'Pkg.App', ref: 'Pkg.MenuItem' }]);
  for (const field of ['name', 'icon', 'chromeProfile', 'defaultSize', 'minSize', 'allowMultiple', 'resizable', 'weight', 'group', 'evaluateConditions']) {
    expect(messages.some((message) => message.includes(`"${field}"`)), field).to.equal(true);
  }
});

describe('a package url', () => {
  it('is kept, as a same-origin path, when it is a backoffice screen on this site', () => {
    expect(backofficePath('/umbraco/section/settings/workspace/pkg-root', ORIGIN)).to.equal(
      '/umbraco/section/settings/workspace/pkg-root',
    );
    expect(backofficePath(`${ORIGIN}/umbraco/section/content?x=1#y`, ORIGIN)).to.equal('/umbraco/section/content?x=1#y');
  });

  it('is refused anywhere a window must not go', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://evil.test/umbraco/section/content',
      '//evil.test/umbraco/section/content',
      '/\\evil.test/umbraco/section/content',
      '/umbraco/management/api/v1/server/status',
      '/umbraco/login',
      '/umbraco/section/../management/api/v1/server/status',
      '/',
      'not a url at all ::',
    ]) {
      expect(backofficePath(url, ORIGIN), url).to.equal(undefined);
    }
  });

  it('costs the entry its only destination, and says what a url must be', () => {
    const { catalogue, messages } = one({
      entries: [{ alias: 'Pkg.Evil', url: 'javascript:alert(1)', section: 'Umb.Section.Settings' }],
    });
    expect(catalogue.entries).to.deep.equal([]);
    expect(messages.some((message) => message.includes('"Pkg.Evil"') && message.includes('/umbraco/section/'))).to.equal(true);
  });
});

it('refuses an entry that would open the desktop inside a desktop window', () => {
  const { catalogue, messages } = one({
    entries: [
      { alias: 'Pkg.A', ref: UMBRADESKTOP_SECTION_ALIAS },
      { alias: 'Pkg.B', ref: 'Pkg.Dashboard', section: UMBRADESKTOP_SECTION_ALIAS },
      { alias: 'Pkg.C', url: `/umbraco/section/${UMBRADESKTOP_SECTION_PATHNAME}`, section: 'Umb.Section.Settings' },
    ],
  });
  expect(catalogue.entries).to.deep.equal([]);
  expect(messages.filter((message) => message.includes('desktop inside'))).to.have.lengthOf(3);
});

it('reserves the fallback alias prefix', () => {
  const { catalogue, messages } = one({
    entries: [{ alias: `${UMBRADESKTOP_FALLBACK_ALIAS_PREFIX}Pkg.Section`, ref: 'Pkg.Section' }],
  });
  expect(catalogue.entries).to.deep.equal([]);
  expect(messages.some((message) => message.includes('reserved'))).to.equal(true);
});

/** Design D2: a number that only makes sense on Umbraco's higher-first scale, in a lower-first field. */
it("keeps a weight that looks like Umbraco's scale, and says so", () => {
  const { catalogue, messages } = one({
    groups: [{ alias: 'pkg', label: '#pkg', weight: 1000 }],
    entries: [{ alias: 'Pkg.App', ref: 'Pkg.Section', weight: 1000 }],
  });
  expect(catalogue.groups[0].weight).to.equal(1000);
  expect(catalogue.entries[0].weight).to.equal(1000);
  expect(messages.filter((message) => message.includes('lower first'))).to.have.lengthOf(2);
});

it('places a group weighted past More just before it', () => {
  const { catalogue, messages } = one({
    groups: [{ alias: 'pkg', label: '#pkg', weight: UMBRADESKTOP_MORE_GROUP_WEIGHT + 1 }],
  });
  expect(catalogue.groups[0].weight).to.equal(UMBRADESKTOP_MORE_GROUP_WEIGHT - 1);
  expect(messages.some((message) => message.includes('before More'))).to.equal(true);
});

it('keeps a group with no weight, and says it will sort first', () => {
  const { catalogue, messages } = one({ groups: [{ alias: 'pkg', label: '#pkg' }] });
  expect(catalogue.groups).to.deep.equal([{ alias: 'pkg', label: '#pkg' }]);
  expect(messages.some((message) => message.includes('"weight"'))).to.equal(true);
});

it('refuses the reserved More alias, and a group with no label', () => {
  const { catalogue, messages } = one({
    groups: [
      { alias: UMBRADESKTOP_MORE_GROUP_ALIAS, label: '#mine', weight: 5 },
      { alias: 'pkg', weight: 5 },
    ],
  });
  expect(catalogue.groups).to.deep.equal([]);
  expect(messages).to.have.lengthOf(2);
});

it('does not carry auto onto a package group', () => {
  const { catalogue, reports } = one({ groups: [{ alias: 'pkg', label: '#pkg', weight: 22, auto: true }] });
  expect(catalogue.groups).to.deep.equal([{ alias: 'pkg', label: '#pkg', weight: 22 }]);
  expect(reports).to.deep.equal([]);
});

it('uses the first of two definitions of one alias in one catalogue', () => {
  const { catalogue, messages } = one({
    entries: [
      { alias: 'Pkg.App', ref: 'Pkg.First' },
      { alias: 'Pkg.App', ref: 'Pkg.Second' },
    ],
  });
  expect(catalogue.entries).to.deep.equal([{ alias: 'Pkg.App', ref: 'Pkg.First' }]);
  expect(messages.some((message) => message.includes('twice'))).to.equal(true);
});

it('warns about a url entry that also asks for conditions it can never evaluate', () => {
  const { catalogue, messages } = one({
    entries: [
      {
        alias: 'Pkg.App',
        url: '/umbraco/section/settings/workspace/pkg-root',
        section: 'Umb.Section.Settings',
        evaluateConditions: ['Pkg.Condition'],
      },
    ],
  });
  expect(catalogue.entries).to.have.lengthOf(1);
  expect(messages.some((message) => message.includes('"evaluateConditions"'))).to.equal(true);
});

it('reads the manifest weight, and treats anything else as zero', () => {
  expect(one({}, { weight: 7 }).catalogue.manifestWeight).to.equal(7);
  expect(one({}, { weight: 'high' }).catalogue.manifestWeight).to.equal(0);
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `npx web-test-runner "src/desktop/package-catalogues.test.ts" --node-resolve`
Expected: FAIL, the module `./package-catalogues` does not exist.

- [ ] **Step 8: Create `package-catalogues.ts`**

```ts
import type { UmbraDesktopPackageEntry, UmbraDesktopPackageGroup } from './catalogue.extension';
import type { UmbraDesktopCatalogueReport, UmbraDesktopChromeProfile } from './types';
import {
  UMBRADESKTOP_FALLBACK_ALIAS_PREFIX,
  UMBRADESKTOP_MORE_GROUP_ALIAS,
  UMBRADESKTOP_MORE_GROUP_WEIGHT,
  UMBRADESKTOP_SECTION_ALIAS,
  UMBRADESKTOP_SECTION_PATHNAME,
} from './constants';
import { UMBRADESKTOP_BACKOFFICE_SECTION_PATH } from './url-inference';
import { isBoolean, isFiniteNumber, isNonEmptyString, isRecord, isSize, isStringArray } from './manifest-values';

/**
 * A weight inside a catalogue at or above this is almost certainly Umbraco's higher-first number
 * written into a field that sorts lower first (design D2). The largest group weight the desktop ships
 * is 70, and an entry's weight only orders it within its group.
 */
const SCALE_MIX_UP_WEIGHT = 1000;

/** The three chrome profiles. Anything else is dropped rather than half-applied (design D9). */
const CHROME_PROFILES: ReadonlySet<string> = new Set<UmbraDesktopChromeProfile>(['full-section', 'workspace-only', 'bare']);

/** The desktop's own section. An entry opening it would put a desktop inside a desktop window. */
const DESKTOP_SECTION_PATH = `${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/${UMBRADESKTOP_SECTION_PATHNAME}`;

/** One package catalogue after validation: what it defines, and how it ranks against the others. */
export interface UmbraDesktopPackageCatalogue {
  /** The manifest alias, which every report about this catalogue names. */
  manifestAlias: string;
  /** The manifest's root weight, on Umbraco's higher-first scale; 0 when unset or not a number. */
  manifestWeight: number;
  /** The groups that survived validation, in the package's own order. */
  groups: UmbraDesktopPackageGroup[];
  /** The entries that survived validation, in the package's own order. */
  entries: UmbraDesktopPackageEntry[];
}

/** What {@link normalisePackageCatalogues} produces. */
export interface UmbraDesktopNormalisedCatalogues {
  /** Every catalogue manifest that is an object, validated, in input order. */
  catalogues: UmbraDesktopPackageCatalogue[];
  /** Everything dropped or doubted on the way, for the context to print. */
  reports: UmbraDesktopCatalogueReport[];
}

/** Formats and collects the reports about one catalogue, so every line names its manifest alike. */
interface CatalogueReporter {
  /**
   * Report something about the catalogue as a whole.
   * @param what A short key for the problem, unique within the catalogue.
   * @param text What completes `Catalogue "<alias>" ...`.
   */
  catalogue(what: string, text: string): void;
  /**
   * Report something about one group or entry in it.
   * @param kind Which list the item is in.
   * @param alias The item's alias.
   * @param what A short key for the problem, unique within the item.
   * @param text What completes `Catalogue "<alias>", <kind> "<item>": ...`.
   */
  item(kind: 'group' | 'entry', alias: string, what: string, text: string): void;
}

/**
 * The same-origin path a package `url` resolves to, when it is somewhere a window may go: http or
 * https on this origin, under `/umbraco/section/` (design D14).
 *
 * The resolved path is returned rather than the author's string, so the window loads exactly what
 * was checked: `/umbraco/section/../x` is judged, and would be loaded, as `/umbraco/x`. `URL` does
 * the parsing because it is what the iframe will do, backslashes, protocol-relative forms and dot
 * segments included.
 * @param url The entry's `url`, absolute or relative.
 * @param origin This page's origin, passed in so the rule is testable.
 * @returns The path, query and hash to load, or `undefined` when the url is refused.
 */
export function backofficePath(url: string, origin: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  if (parsed.origin !== origin) return undefined;
  if (!parsed.pathname.startsWith(`${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/`)) return undefined;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Validate the package catalogue manifests Umbraco has permitted, dropping and reporting whatever
 * cannot be used. **Never throws** (design D9): the input is third-party JSON, and one throw here
 * would stop every later recompute, freezing the launcher for everyone on the install.
 *
 * A bad required field drops the item; a bad optional field drops only that field. Both are
 * reported. Unknown fields are left behind silently, so a package built for a newer desktop still
 * works on this one. Sorting and precedence are not done here: this only decides what is usable.
 * @param manifests The permitted `umbraDesktopCatalogue` manifests, typed as unknown on purpose.
 * @param origin This page's origin, for the url rule.
 * @returns The validated catalogues and the reports.
 */
export function normalisePackageCatalogues(manifests: ReadonlyArray<unknown>, origin: string): UmbraDesktopNormalisedCatalogues {
  const catalogues: UmbraDesktopPackageCatalogue[] = [];
  const reports: UmbraDesktopCatalogueReport[] = [];
  for (const manifest of manifests) {
    // The registry never hands over a non-object, so there is nothing to name and nothing to report.
    if (!isRecord(manifest)) continue;
    const manifestAlias = String(manifest.alias);
    const reporter = reporterFor(manifestAlias, reports);
    const catalogue: UmbraDesktopPackageCatalogue = {
      manifestAlias,
      manifestWeight: isFiniteNumber(manifest.weight) ? manifest.weight : 0,
      groups: [],
      entries: [],
    };
    catalogues.push(catalogue);
    const meta = manifest.meta;
    if (!isRecord(meta)) {
      reporter.catalogue('meta', 'has no "meta" object, so it defines nothing');
      continue;
    }
    catalogue.groups = normaliseList(meta.groups, 'group', reporter, (raw) => normaliseGroup(raw, reporter));
    catalogue.entries = normaliseList(meta.entries, 'entry', reporter, (raw) => normaliseEntry(raw, reporter, origin));
  }
  return { catalogues, reports };
}

/**
 * A reporter that names this catalogue in every line and keys every line so it prints once.
 * @param manifestAlias The catalogue's manifest alias.
 * @param reports Where the reports go.
 * @returns The reporter.
 */
function reporterFor(manifestAlias: string, reports: UmbraDesktopCatalogueReport[]): CatalogueReporter {
  return {
    catalogue: (what, text) =>
      reports.push({ key: `catalogue:${manifestAlias}:${what}`, message: `[UmbraDesktop] Catalogue "${manifestAlias}" ${text}.` }),
    item: (kind, alias, what, text) =>
      reports.push({
        key: `catalogue:${manifestAlias}:${kind}:${alias}:${what}`,
        message: `[UmbraDesktop] Catalogue "${manifestAlias}", ${kind} "${alias}": ${text}.`,
      }),
  };
}

/**
 * Validate a list of groups or entries: absent is empty, anything but an array is reported and
 * ignored, and the second definition of one alias in the same list loses to the first.
 * @param value The `groups` or `entries` value, as sent.
 * @param kind Which list this is, for the reports.
 * @param reporter This catalogue's reporter.
 * @param one Validates a single item, returning it or `undefined`.
 * @returns The usable items, in the package's own order.
 */
function normaliseList<T extends { alias: string }>(
  value: unknown,
  kind: 'group' | 'entry',
  reporter: CatalogueReporter,
  one: (raw: unknown) => T | undefined,
): T[] {
  if (value === undefined) return [];
  const field = kind === 'group' ? 'groups' : 'entries';
  if (!Array.isArray(value)) {
    reporter.catalogue(field, `has "${field}" that is not a list, so it was ignored`);
    return [];
  }
  const kept: T[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const item = one(raw);
    if (!item) continue;
    if (seen.has(item.alias)) {
      reporter.item(kind, item.alias, 'twice', 'is defined twice in this catalogue; the first is used');
      continue;
    }
    seen.add(item.alias);
    kept.push(item);
  }
  return kept;
}

/**
 * A reader for one item's optional fields: the value when it is valid, otherwise `undefined` with a
 * report naming the field. An absent field is simply `undefined`, and says nothing.
 * @param raw The item.
 * @param report Reports one bad field.
 * @returns The reader.
 */
function fieldReader(raw: Record<string, unknown>, report: (field: string, text: string) => void) {
  return <T>(field: string, valid: (value: unknown) => value is T, why = 'has the wrong type'): T | undefined => {
    const value = raw[field];
    if (value === undefined) return undefined;
    if (valid(value)) return value;
    report(field, `"${field}" ${why}, so it was ignored`);
    return undefined;
  };
}

/**
 * Whether a value is one of the three chrome profiles.
 * @param value Anything.
 * @returns True for `full-section`, `workspace-only` or `bare`.
 */
function isChromeProfile(value: unknown): value is UmbraDesktopChromeProfile {
  return typeof value === 'string' && CHROME_PROFILES.has(value);
}

/**
 * Whether a validated backoffice path opens the desktop's own section.
 * @param path A path from {@link backofficePath}.
 * @returns True when the window would hold a desktop.
 */
function opensDesktop(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === DESKTOP_SECTION_PATH || pathname.startsWith(`${DESKTOP_SECTION_PATH}/`);
}

/**
 * The same object without its `undefined` fields, so a validated item carries only what was sent
 * and valid, and compares equal to it.
 * @param value The object.
 * @returns A copy without `undefined` values.
 */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

/**
 * Validate one package entry (design D9, D14, D15).
 * @param raw The entry, as sent.
 * @param reporter This catalogue's reporter.
 * @param origin This page's origin, for the url rule.
 * @returns The usable entry, or `undefined` when it was dropped.
 */
function normaliseEntry(raw: unknown, reporter: CatalogueReporter, origin: string): UmbraDesktopPackageEntry | undefined {
  const alias = isRecord(raw) ? raw.alias : undefined;
  if (!isRecord(raw) || !isNonEmptyString(alias)) {
    reporter.catalogue('entry-without-alias', 'has an entry that is not an object with an "alias", so it was dropped');
    return undefined;
  }
  const report = (what: string, text: string) => reporter.item('entry', alias, what, text);
  if (alias.startsWith(UMBRADESKTOP_FALLBACK_ALIAS_PREFIX)) {
    report('alias', `the alias uses the reserved "${UMBRADESKTOP_FALLBACK_ALIAS_PREFIX}" prefix, so it was dropped`);
    return undefined;
  }
  const read = fieldReader(raw, report);
  const ref = read('ref', isNonEmptyString);
  const sentUrl = read('url', isNonEmptyString);
  const url = sentUrl === undefined ? undefined : backofficePath(sentUrl, origin);
  if (sentUrl !== undefined && url === undefined) {
    report('url', `"url" is not a backoffice screen on this site, so it was ignored. A url must sit under ${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/ on this origin`);
  }
  if (ref === undefined && url === undefined) {
    report('destination', 'it has neither a "ref" nor a usable "url", so it was dropped');
    return undefined;
  }
  const section = read('section', isNonEmptyString);
  if (ref === UMBRADESKTOP_SECTION_ALIAS || section === UMBRADESKTOP_SECTION_ALIAS || (url !== undefined && opensDesktop(url))) {
    report('desktop', 'it would open the desktop inside a desktop window, so it was dropped');
    return undefined;
  }
  const entry = defined<UmbraDesktopPackageEntry>({
    alias,
    ref,
    url,
    section,
    name: read('name', isNonEmptyString),
    icon: read('icon', isNonEmptyString),
    chromeProfile: read('chromeProfile', isChromeProfile, 'is not one of full-section, workspace-only or bare'),
    defaultSize: read('defaultSize', isSize, 'is not a { w, h } of positive numbers'),
    minSize: read('minSize', isSize, 'is not a { w, h } of positive numbers'),
    allowMultiple: read('allowMultiple', isBoolean),
    resizable: read('resizable', isBoolean),
    weight: read('weight', isFiniteNumber),
    group: read('group', isNonEmptyString),
    evaluateConditions: read('evaluateConditions', isStringArray, 'is not a list of condition aliases'),
  });
  if (entry.weight !== undefined && entry.weight >= SCALE_MIX_UP_WEIGHT) {
    report('scale', `"weight" is ${entry.weight}, which sorts it last: weights in a catalogue sort lower first, like the desktop's own`);
  }
  if (entry.url !== undefined && entry.evaluateConditions?.length) {
    report('url-conditions', 'a "url" bypasses registry resolution, so its "evaluateConditions" are never evaluated');
  }
  return entry;
}

/**
 * Validate one package group (design D9, §3.2).
 * @param raw The group, as sent.
 * @param reporter This catalogue's reporter.
 * @returns The usable group, or `undefined` when it was dropped.
 */
function normaliseGroup(raw: unknown, reporter: CatalogueReporter): UmbraDesktopPackageGroup | undefined {
  const alias = isRecord(raw) ? raw.alias : undefined;
  if (!isRecord(raw) || !isNonEmptyString(alias)) {
    reporter.catalogue('group-without-alias', 'has a group that is not an object with an "alias", so it was dropped');
    return undefined;
  }
  const report = (what: string, text: string) => reporter.item('group', alias, what, text);
  if (alias === UMBRADESKTOP_MORE_GROUP_ALIAS) {
    report('reserved', "that alias is the desktop's reserved More group, so it was dropped");
    return undefined;
  }
  const label = raw.label;
  if (!isNonEmptyString(label)) {
    report('label', 'it has no usable "label", so it was dropped');
    return undefined;
  }
  let weight = fieldReader(raw, report)('weight', isFiniteNumber);
  if (weight === undefined) {
    report('weight', 'it has no "weight", so it sorts ahead of every group the desktop ships (Editing is 10, System 50, Experimental 70)');
  } else if (weight >= UMBRADESKTOP_MORE_GROUP_WEIGHT) {
    report('after-more', `"weight" ${weight} would sort it after More, so it is placed just before More instead`);
    weight = UMBRADESKTOP_MORE_GROUP_WEIGHT - 1;
  } else if (weight >= SCALE_MIX_UP_WEIGHT) {
    report('scale', `"weight" is ${weight}: weights in a catalogue sort lower first, like the desktop's own (Editing is 10, System 50)`);
  }
  return weight === undefined ? { alias, label } : { alias, label, weight };
}
```

Note the group's missing-weight report says `"weight"`, which is what the test looks for, and a
present-but-wrong weight reports once through `fieldReader` and once as missing. That is acceptable:
both lines are true.

- [ ] **Step 9: Run the file again, then both gates**

Run: `npx web-test-runner "src/desktop/package-catalogues.test.ts" --node-resolve`
Expected: PASS, all cases.

Then from `src/Umbraco.Community.UmbraDesktop`: `npm run build` (expect `tsc` clean) and `npm test`
(expect everything green, including `url-inference.test.ts` unchanged).

---

### Task 2: The merge

**Files:**
- Create: `.../desktop/merge-catalogues.ts`
- Create: `.../desktop/merge-catalogues.test.ts`

- [ ] **Step 1: Write the failing tests, `merge-catalogues.test.ts`**

```ts
import { expect } from '@open-wc/testing';
import { mergeCatalogues, type UmbraDesktopAppClaim } from './merge-catalogues';
import type { UmbraDesktopPackageCatalogue } from './package-catalogues';
import type { UmbraDesktopCatalogue } from './types';

/** A two-group, two-entry stand-in for the curated catalogue, one entry a core section. */
const CURATED: UmbraDesktopCatalogue = {
  groups: [
    { alias: 'editing', label: '#editing', weight: 10 },
    { alias: 'system', label: '#system', weight: 50 },
  ],
  entries: [
    { alias: 'content', ref: 'Umb.Section.Content', group: 'editing', weight: 10 },
    { alias: 'usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings', group: 'system', weight: 10 },
  ],
  excludedSections: ['Umbraco.Community.UmbraDesktop.Section'],
};

/**
 * A validated package catalogue.
 * @param manifestAlias Its manifest alias.
 * @param over What it defines, and its weight.
 * @returns The catalogue.
 */
function pkg(manifestAlias: string, over: Partial<UmbraDesktopPackageCatalogue> = {}): UmbraDesktopPackageCatalogue {
  return { manifestAlias, manifestWeight: 0, groups: [], entries: [], ...over };
}

/**
 * Merge against {@link CURATED}.
 * @param packages The package catalogues.
 * @param apps Registered apps' claims.
 * @returns The merge's answer.
 */
const merge = (packages: UmbraDesktopPackageCatalogue[] = [], apps: UmbraDesktopAppClaim[] = []) =>
  mergeCatalogues({ curated: CURATED, packages, apps });

it('leaves the curated catalogue alone when no package defines anything', () => {
  const merged = merge();
  expect(merged.catalogue).to.deep.equal(CURATED);
  expect(merged.reports).to.deep.equal([]);
  expect([...merged.entrySources]).to.deep.equal([]);
  expect([...merged.droppedApps]).to.deep.equal([]);
});

it("adds a package's groups and entries after ours, and remembers where each entry came from", () => {
  const merged = merge([
    pkg('Pkg.Catalogue', {
      groups: [{ alias: 'pkg', label: '#pkg', weight: 22 }],
      entries: [{ alias: 'Pkg.App', ref: 'Pkg.Section', group: 'pkg' }],
    }),
  ]);
  expect(merged.catalogue.groups.map((group) => group.alias)).to.deep.equal(['editing', 'system', 'pkg']);
  expect(merged.catalogue.entries.map((entry) => entry.alias)).to.deep.equal(['content', 'usync', 'Pkg.App']);
  expect(merged.entrySources.get('Pkg.App')).to.equal('Pkg.Catalogue');
  expect(merged.reports).to.deep.equal([]);
});

describe('replacing one of ours', () => {
  it('uses the package entry in our entry\'s place, silently when it opens the same screen', () => {
    const replacement = { alias: 'usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings', chromeProfile: 'bare' as const };
    const merged = merge([pkg('Pkg.Catalogue', { entries: [replacement] })]);
    expect(merged.catalogue.entries).to.deep.equal([CURATED.entries[0], replacement]);
    expect(merged.entrySources.get('usync')).to.equal('Pkg.Catalogue');
    expect(merged.reports).to.deep.equal([]);
  });

  /** Design D13: our aliases are bare words, so a takeover that changes the target is often a mistake. */
  it('reports a replacement that opens something else', () => {
    const merged = merge([pkg('Pkg.Catalogue', { entries: [{ alias: 'usync', ref: 'Pkg.Dashboard' }] })]);
    expect(merged.catalogue.entries[1].ref).to.equal('Pkg.Dashboard');
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('replaces the desktop\'s own app "usync"');
  });

  it('uses a package group in our group\'s place, silently when it keeps the weight', () => {
    const merged = merge([pkg('Pkg.Catalogue', { groups: [{ alias: 'system', label: '#pkg_system', weight: 50 }] })]);
    expect(merged.catalogue.groups[1]).to.deep.equal({ alias: 'system', label: '#pkg_system', weight: 50 });
    expect(merged.reports).to.deep.equal([]);
  });

  it('reports a package group that moves one of ours', () => {
    const merged = merge([pkg('Pkg.Catalogue', { groups: [{ alias: 'system', label: '#system', weight: 5 }] })]);
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('"system"');
  });

  /** Design D4: an app takes over a curated alias, and that is never like-for-like. */
  it('lets a registered app take a curated alias, and says so', () => {
    const merged = merge([], [{ alias: 'usync', manifestWeight: 0 }]);
    expect(merged.catalogue.entries.map((entry) => entry.alias)).to.deep.equal(['content']);
    expect([...merged.droppedApps]).to.deep.equal([]);
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('a self-contained app');
  });
});

describe('two packages defining one alias', () => {
  it('uses the higher manifest weight, and names both', () => {
    const merged = merge([
      pkg('Pkg.Low', { manifestWeight: 1, entries: [{ alias: 'Shared.App', ref: 'Pkg.Low.Section' }] }),
      pkg('Pkg.High', { manifestWeight: 9, entries: [{ alias: 'Shared.App', ref: 'Pkg.High.Section' }] }),
    ]);
    expect(merged.catalogue.entries.find((entry) => entry.alias === 'Shared.App')!.ref).to.equal('Pkg.High.Section');
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('"Pkg.High"').and.to.contain('"Pkg.Low"');
  });

  /**
   * Ordinal, not `localeCompare` (design D6). An upper-case letter sorts before every lower-case one
   * ordinally, and after it in most locales, so this pair settles the same way in every browser only
   * because the comparison is `<`.
   */
  it('settles a weight tie by manifest alias, compared ordinally', () => {
    const merged = merge([
      pkg('a.Pkg', { entries: [{ alias: 'Shared.App', ref: 'From.a' }] }),
      pkg('B.Pkg', { entries: [{ alias: 'Shared.App', ref: 'From.B' }] }),
    ]);
    expect(merged.catalogue.entries.find((entry) => entry.alias === 'Shared.App')!.ref).to.equal('From.B');
  });

  it('says nothing when the two agree', () => {
    const merged = merge([
      pkg('Pkg.One', { entries: [{ alias: 'Shared.App', ref: 'Shared.Section' }], groups: [{ alias: 'shared', label: '#one', weight: 30 }] }),
      pkg('Pkg.Two', { entries: [{ alias: 'Shared.App', ref: 'Shared.Section' }], groups: [{ alias: 'shared', label: '#two', weight: 30 }] }),
    ]);
    expect(merged.reports).to.deep.equal([]);
  });

  it('reports two definitions of one group that disagree on weight', () => {
    const merged = merge([
      pkg('Pkg.One', { groups: [{ alias: 'shared', label: '#one', weight: 30 }] }),
      pkg('Pkg.Two', { groups: [{ alias: 'shared', label: '#two', weight: 31 }] }),
    ]);
    expect(merged.reports).to.have.lengthOf(1);
  });

  it('settles an app against a package entry by manifest weight, either way round', () => {
    const entryWins = merge(
      [pkg('Pkg.Catalogue', { manifestWeight: 9, entries: [{ alias: 'Shared.App', ref: 'Pkg.Section' }] })],
      [{ alias: 'Shared.App', manifestWeight: 1 }],
    );
    expect([...entryWins.droppedApps]).to.deep.equal(['Shared.App']);
    expect(entryWins.catalogue.entries.some((entry) => entry.alias === 'Shared.App')).to.equal(true);

    const appWins = merge(
      [pkg('Pkg.Catalogue', { manifestWeight: 1, entries: [{ alias: 'Shared.App', ref: 'Pkg.Section' }] })],
      [{ alias: 'Shared.App', manifestWeight: 9 }],
    );
    expect([...appWins.droppedApps]).to.deep.equal([]);
    expect(appWins.catalogue.entries.some((entry) => entry.alias === 'Shared.App')).to.equal(false);
  });
});

describe('a package entry opening the same screen as ours under another alias', () => {
  it('shows both, and suggests reusing our alias', () => {
    const merged = merge([pkg('Pkg.Catalogue', { entries: [{ alias: 'Pkg.Usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings' }] })]);
    expect(merged.catalogue.entries.map((entry) => entry.alias)).to.deep.equal(['content', 'usync', 'Pkg.Usync']);
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('alias "usync"');
  });

  it('does not invite a package to take over a core tile', () => {
    const merged = merge([pkg('Pkg.Catalogue', { entries: [{ alias: 'Pkg.Content', ref: 'Umb.Section.Content' }] })]);
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('already has').and.not.to.contain('give your entry');
  });
});

it('keeps a fixed order: ours in place, then packages by precedence, each in its own order', () => {
  const merged = merge([
    pkg('Pkg.Second', { manifestWeight: 1, entries: [{ alias: 'S.One', ref: 'S1' }, { alias: 'S.Two', ref: 'S2' }] }),
    pkg('Pkg.First', { manifestWeight: 9, entries: [{ alias: 'F.One', ref: 'F1' }, { alias: 'content', ref: 'Umb.Section.Content' }] }),
  ]);
  expect(merged.catalogue.entries.map((entry) => entry.alias)).to.deep.equal(['content', 'usync', 'F.One', 'S.One', 'S.Two']);
});

it('passes the curated exclusions through', () => {
  expect(merge([pkg('Pkg.Catalogue')]).catalogue.excludedSections).to.deep.equal(CURATED.excludedSections);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx web-test-runner "src/desktop/merge-catalogues.test.ts" --node-resolve`
Expected: FAIL, the module `./merge-catalogues` does not exist.

- [ ] **Step 3: Create `merge-catalogues.ts`**

```ts
import type { UmbraDesktopPackageEntry, UmbraDesktopPackageGroup } from './catalogue.extension';
import type { UmbraDesktopPackageCatalogue } from './package-catalogues';
import type { UmbraDesktopCatalogue, UmbraDesktopCatalogueEntry, UmbraDesktopCatalogueReport, UmbraDesktopGroup } from './types';

/** A registered `umbraDesktopApp`'s claim on an alias in the shared entry namespace. */
export interface UmbraDesktopAppClaim {
  /** The app's alias, which is its manifest alias. */
  alias: string;
  /** The manifest's root weight, on Umbraco's higher-first scale; 0 when unset. */
  manifestWeight: number;
}

/** What {@link mergeCatalogues} is given. */
export interface UmbraDesktopMergeInput {
  /** The desktop's own curated catalogue. */
  curated: UmbraDesktopCatalogue;
  /** The validated package catalogues currently in effect, in any order. */
  packages: ReadonlyArray<UmbraDesktopPackageCatalogue>;
  /** The registered apps that survived normalisation, as claims on their aliases. */
  apps: ReadonlyArray<UmbraDesktopAppClaim>;
}

/** What {@link mergeCatalogues} answers. */
export interface UmbraDesktopMergedCatalogue {
  /** The curated catalogue with every package definition applied, in the fixed order of design §4. */
  catalogue: UmbraDesktopCatalogue;
  /** Which package catalogue each package-defined entry came from, for naming it in diagnostics. */
  entrySources: ReadonlyMap<string, string>;
  /** Aliases of registered apps that lost to a package entry, which derivation must not emit. */
  droppedApps: ReadonlySet<string>;
  /** Clashes between packages, replacements that changed something, and the same-screen hint. */
  reports: UmbraDesktopCatalogueReport[];
}

/** One definition competing for an alias in the shared entry namespace. */
type Claim =
  | { kind: 'entry'; alias: string; source: string; weight: number; entry: UmbraDesktopPackageEntry }
  | { kind: 'app'; alias: string; source: string; weight: number };

/**
 * Order by precedence: higher manifest weight first, then the lower manifest alias, compared
 * ordinally so the answer is the same in every browser and every locale (design D6). Stable, so
 * one package's own items keep their order.
 * @param a One source.
 * @param b The other.
 * @returns A sort comparison.
 */
function byPrecedence(a: { weight: number; source: string }, b: { weight: number; source: string }): number {
  if (a.weight !== b.weight) return b.weight - a.weight;
  return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
}

/**
 * Where an entry actually goes. `url` wins over `ref` because `#resolveEntry` checks it first.
 * @param entry The entry.
 * @returns Its effective destination.
 */
function destination(entry: UmbraDesktopCatalogueEntry): string | undefined {
  return entry.url ?? entry.ref;
}

/**
 * Whether two entries open the same thing, which is what makes a replacement like-for-like (D13).
 * @param a One entry.
 * @param b The other.
 * @returns True when both go to the same destination.
 */
function sameTarget(a: UmbraDesktopCatalogueEntry, b: UmbraDesktopCatalogueEntry): boolean {
  const target = destination(a);
  return target !== undefined && target === destination(b);
}

/**
 * What an entry opens, in words, for a report.
 * @param entry The entry, or `undefined` for a registered app.
 * @returns A phrase such as `ref "Umb.Section.Settings"`.
 */
function describe(entry: UmbraDesktopCatalogueEntry | undefined): string {
  if (!entry) return 'a self-contained app';
  return entry.url ? `url "${entry.url}"` : `ref "${entry.ref}"`;
}

/**
 * Apply every package catalogue in effect, and every registered app, over the curated catalogue
 * (design §4). Pure: the reports are returned, never printed.
 *
 * Groups and entries are separate namespaces, as they always were. Entries and registered apps share
 * one, because an alias is what a pin is stored under and one alias must mean one app. Within each
 * namespace the first definition in precedence order wins; a later one that disagrees is reported.
 * A package definition replaces ours whole (D3), silently only when it is like-for-like (D13).
 * @param input The curated catalogue, the package catalogues and the app claims.
 * @returns The merged catalogue, where each package entry came from, the apps that lost, the reports.
 */
export function mergeCatalogues({ curated, packages, apps }: UmbraDesktopMergeInput): UmbraDesktopMergedCatalogue {
  const reports: UmbraDesktopCatalogueReport[] = [];
  const ordered = [...packages].sort((a, b) =>
    byPrecedence({ weight: a.manifestWeight, source: a.manifestAlias }, { weight: b.manifestWeight, source: b.manifestAlias }),
  );

  const packageGroups = new Map<string, { group: UmbraDesktopPackageGroup; source: string }>();
  for (const pkg of ordered) {
    for (const group of pkg.groups) {
      const winner = packageGroups.get(group.alias);
      if (!winner) {
        packageGroups.set(group.alias, { group, source: pkg.manifestAlias });
      } else if (winner.group.weight !== group.weight) {
        reports.push({
          key: `merge:group-clash:${group.alias}:${pkg.manifestAlias}`,
          message: `[UmbraDesktop] Catalogues "${winner.source}" and "${pkg.manifestAlias}" both define launcher group "${group.alias}", with different weights; "${winner.source}"'s is used. Give them the same weight, or rename one.`,
        });
      }
    }
  }

  const claims: Claim[] = [
    ...ordered.flatMap((pkg) =>
      pkg.entries.map((entry): Claim => ({ kind: 'entry', alias: entry.alias, source: pkg.manifestAlias, weight: pkg.manifestWeight, entry })),
    ),
    ...apps.map((app): Claim => ({ kind: 'app', alias: app.alias, source: app.alias, weight: app.manifestWeight })),
  ].sort(byPrecedence);

  const winners = new Map<string, Claim>();
  const droppedApps = new Set<string>();
  for (const claim of claims) {
    const winner = winners.get(claim.alias);
    if (!winner) {
      winners.set(claim.alias, claim);
      continue;
    }
    if (claim.kind === 'app') droppedApps.add(claim.alias);
    const agree = winner.kind === 'entry' && claim.kind === 'entry' && sameTarget(winner.entry, claim.entry);
    if (!agree) {
      reports.push({
        key: `merge:entry-clash:${claim.alias}:${claim.source}`,
        message: `[UmbraDesktop] "${winner.source}" and "${claim.source}" both define the app "${claim.alias}"; "${winner.source}"'s is used, because its manifest has the higher weight or sorts first. Rename one of them.`,
      });
    }
  }

  const entries: UmbraDesktopCatalogueEntry[] = [];
  const entrySources = new Map<string, string>();
  for (const entry of curated.entries) {
    const winner = winners.get(entry.alias);
    if (!winner) {
      entries.push(entry);
      continue;
    }
    const replacement = winner.kind === 'entry' ? winner.entry : undefined;
    if (replacement) {
      entries.push(replacement);
      entrySources.set(entry.alias, winner.source);
      if (sameTarget(entry, replacement)) continue;
    }
    reports.push({
      key: `merge:replaced:${entry.alias}:${winner.source}`,
      message: `[UmbraDesktop] "${winner.source}" replaces the desktop's own app "${entry.alias}", which opened ${describe(entry)}, with ${describe(replacement)}. If that is not intended, give it a namespaced alias of its own.`,
    });
  }

  const curatedAliases = new Set(curated.entries.map((entry) => entry.alias));
  const curatedByRef = new Map(
    curated.entries.filter((entry) => entry.ref !== undefined).map((entry) => [entry.ref!, entry] as const),
  );
  for (const winner of winners.values()) {
    if (winner.kind !== 'entry' || curatedAliases.has(winner.alias)) continue;
    entries.push(winner.entry);
    entrySources.set(winner.alias, winner.source);
    const twin = winner.entry.ref === undefined ? undefined : curatedByRef.get(winner.entry.ref);
    if (twin && entries.includes(twin)) reports.push(sameScreenHint(winner.source, winner.entry, twin));
  }

  const groups: UmbraDesktopGroup[] = [];
  for (const group of curated.groups) {
    const winner = packageGroups.get(group.alias);
    if (!winner) {
      groups.push(group);
      continue;
    }
    groups.push(winner.group);
    if (winner.group.weight !== group.weight) {
      reports.push({
        key: `merge:group-replaced:${group.alias}:${winner.source}`,
        message: `[UmbraDesktop] "${winner.source}" redefines the desktop's own launcher group "${group.alias}", moving it from weight ${group.weight} to ${winner.group.weight}. Define a group of your own instead: other packages place their groups against ours.`,
      });
    }
  }
  const curatedGroups = new Set(curated.groups.map((group) => group.alias));
  for (const [alias, winner] of packageGroups) if (!curatedGroups.has(alias)) groups.push(winner.group);

  return { catalogue: { groups, entries, excludedSections: curated.excludedSections }, entrySources, droppedApps, reports };
}

/**
 * The design D7 hint: a package entry opening a screen one of ours already opens, under another
 * alias, so both tiles show. For a core `Umb.*` screen it says only that the tile exists, because
 * inviting a package to take over a core tile is rarely what it needed to hear.
 * @param source The package catalogue.
 * @param entry The package entry.
 * @param twin Our entry for the same screen.
 * @returns The report.
 */
function sameScreenHint(source: string, entry: UmbraDesktopPackageEntry, twin: UmbraDesktopCatalogueEntry): UmbraDesktopCatalogueReport {
  const key = `merge:same-screen:${entry.alias}:${source}`;
  if (entry.ref!.startsWith('Umb.')) {
    return {
      key,
      message: `[UmbraDesktop] "${source}" entry "${entry.alias}" opens ref "${entry.ref}", which already has the desktop's own tile "${twin.alias}", so both appear.`,
    };
  }
  return {
    key,
    message: `[UmbraDesktop] "${source}" entry "${entry.alias}" opens the same screen as the desktop's own app "${twin.alias}" (ref "${entry.ref}"), so both appear. To replace ours, give your entry the alias "${twin.alias}", which also keeps users' pins; otherwise remove it.`,
  };
}
```

- [ ] **Step 4: Run the file again, then both gates**

Run: `npx web-test-runner "src/desktop/merge-catalogues.test.ts" --node-resolve`
Expected: PASS. Then `npm run build` and `npm test` from the host package: green.

---

### Task 3: Registered apps survive wrong-typed JSON

Inline. The same `localeCompare` crash D9 fixes for catalogues exists today for a JSON
`umbraDesktopApp` whose `meta.label` is not text.

**Files:**
- Modify: `.../desktop/registered-apps.ts`
- Test: `.../desktop/registered-apps.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `registered-apps.test.ts`)

```ts
/**
 * A static `umbraco-package.json` is type-checked by nothing, so a manifest can carry a number where
 * the type says string. A non-string name used to reach the `localeCompare` tie-break in `groupApps`
 * and throw, which stops every recompute after it (design D9 of the package catalogues design).
 */
it('uses the manifest name when meta.label is not text, and reports the label', () => {
  const { apps, ignored } = normaliseRegisteredApps([
    manifest({ name: 'Minesweeper', meta: { label: 42 as unknown as string } }),
  ]);
  expect(apps[0].name).to.equal('Minesweeper');
  expect(ignored).to.deep.equal([{ alias: 'Pkg.Minesweeper', field: 'meta.label' }]);
});

it('ignores wrongly typed optional fields instead of passing them on', () => {
  const { apps, ignored } = normaliseRegisteredApps([
    manifest({
      weight: '1000' as unknown as number,
      meta: {
        label: '#pkg_minesweeper',
        icon: 7 as unknown as string,
        group: ['games'] as unknown as string,
        defaultSize: { w: 'wide', h: 10 } as unknown as { w: number; h: number },
        allowMultiple: 'yes' as unknown as boolean,
        resizable: 1 as unknown as boolean,
      },
    }),
  ]);
  const app = apps[0];
  expect(app.icon).to.equal('icon-box');
  expect(app.group).to.equal(undefined);
  expect(app.weight).to.equal(undefined);
  expect(app.defaultSize).to.equal(undefined);
  expect(app.allowMultiple).to.equal(undefined);
  expect(app.resizable).to.equal(undefined);
  expect(ignored.map((field) => field.field).sort()).to.deep.equal(
    ['meta.allowMultiple', 'meta.defaultSize', 'meta.group', 'meta.icon', 'meta.resizable', 'weight'],
  );
});

it('never hands the launcher a name it cannot sort', () => {
  const { apps } = normaliseRegisteredApps([
    manifest({ alias: 'Pkg.A', name: 5 as unknown as string, meta: { label: 1 as unknown as string } }),
    manifest({ alias: 'Pkg.B', name: 6 as unknown as string, meta: { label: 2 as unknown as string } }),
  ]);
  expect(() => groupApps(deriveApps([], [], [], apps), [])).to.not.throw();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx web-test-runner "src/desktop/registered-apps.test.ts" --node-resolve`
Expected: FAIL; `ignored` is undefined, and the last case throws `localeCompare is not a function`.

- [ ] **Step 3: Implement**

In `registered-apps.ts`, import the validators:

```ts
import { isBoolean, isFiniteNumber, isNonEmptyString, isRecord, isSize } from './manifest-values';
```

Add the field type beside `UmbraDesktopDroppedApp`:

```ts
/** A field a registered app's manifest carried with the wrong type, which was ignored. */
export interface UmbraDesktopIgnoredField {
  /** The manifest alias. */
  alias: string;
  /** The field as the author wrote it, such as `meta.icon`. */
  field: string;
}
```

Add `ignored` to `UmbraDesktopNormalisedApps`:

```ts
  /** Fields that had the wrong type and were ignored, for the caller to report. */
  ignored: UmbraDesktopIgnoredField[];
```

Add one paragraph to the `normaliseRegisteredApps` JSDoc, before its `@param`:

```ts
 * Every other field is read defensively as well, because a static `umbraco-package.json` is
 * type-checked by nothing. A field with the wrong type is left out and reported rather than passed
 * on: a non-string name used to reach `groupApps`' `localeCompare` tie-break and throw, and one throw
 * there stops every recompute after it, freezing the launcher for everyone on the install.
```

In the function, declare `const ignored: UmbraDesktopIgnoredField[] = [];` beside `dropped`, and
replace the whole `apps.push({ ... })` call (keep the long comment on `weight` exactly where it is)
with:

```ts
    const meta: Record<string, unknown> = isRecord(manifest.meta) ? manifest.meta : {};
    /**
     * One optional field: its value when valid, otherwise `undefined`, reported when it was present.
     * @param value The field's value, as sent.
     * @param valid The check it must pass.
     * @param field The field's name, as the author wrote it.
     * @returns The value, or `undefined`.
     */
    const read = <T>(value: unknown, valid: (candidate: unknown) => candidate is T, field: string): T | undefined => {
      if (value === undefined) return undefined;
      if (valid(value)) return value;
      ignored.push({ alias: manifest.alias, field });
      return undefined;
    };
    const weight = read(manifest.weight, isFiniteNumber, 'weight');
    apps.push({
      alias: manifest.alias,
      name: read(meta.label, isNonEmptyString, 'meta.label') ?? (isNonEmptyString(manifest.name) ? manifest.name : String(manifest.alias)),
      icon: read(meta.icon, isNonEmptyString, 'meta.icon') ?? UMBRADESKTOP_DEFAULT_ICON,
      element: manifest.element,
      group: read(meta.group, isNonEmptyString, 'meta.group'),
      // (the existing comment about negating the weight stays here, unchanged)
      weight: weight === undefined ? undefined : -weight,
      defaultSize: read(meta.defaultSize, isSize, 'meta.defaultSize'),
      minSize: read(meta.minSize, isSize, 'meta.minSize'),
      allowMultiple: read(meta.allowMultiple, isBoolean, 'meta.allowMultiple'),
      resizable: read(meta.resizable, isBoolean, 'meta.resizable'),
    });
```

and return `{ apps, dropped, ignored }`.

- [ ] **Step 4: Run the file, then both gates**

Expected: PASS, then `npm run build` and `npm test` green. The context still ignores `ignored`;
Task 5 prints it.

---

### Task 4: A pin follows its section

Inline. Design D15, plus the gap found while planning: the launcher decides a tile's pinned state
with `pinned.includes(app.alias)`, so a pin that followed its section would show as unpinned and
could never be removed.

**Files:**
- Modify: `.../desktop/types.ts`, `.../desktop/derive-apps.ts`, `.../desktop/settings/pinned.ts`,
  `.../desktop/settings/settings.context.ts`, `.../desktop/components/launcher.element.ts`
- Test: `.../desktop/derive-apps.test.ts`, `.../desktop/settings/pinned.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `derive-apps.test.ts` (add `UMBRADESKTOP_FALLBACK_ALIAS_PREFIX` to its `./constants` import):

```ts
/** Design D15: the one fact pin resolution needs to follow a section to the entry that covers it. */
it('marks a certified section-root app with the section it covers, and no other app', () => {
  const apps = deriveApps(
    [
      resolved({ entry: entry({ alias: 'Pkg.App' }), url: '/umbraco/section/content', gateSectionAlias: 'Umb.Section.Content', isSectionRoot: true }),
      resolved({ entry: entry({ alias: 'Pkg.Tool' }), url: '/umbraco/section/settings/workspace/x', gateSectionAlias: 'Umb.Section.Settings' }),
    ],
    SECTIONS,
  );
  expect(apps.find((a) => a.alias === 'Pkg.App')!.coversSection).to.equal('Umb.Section.Content');
  expect(apps.find((a) => a.alias === 'Pkg.Tool')!.coversSection).to.equal(undefined);
  expect(apps.some((a) => a.alias === `${UMBRADESKTOP_FALLBACK_ALIAS_PREFIX}Umb.Section.Settings`)).to.equal(true);
});
```

Append to `settings/pinned.test.ts` (import `pinKeysFor` and `togglePinnedApp` beside the existing
imports):

```ts
describe('a pin that follows its section', () => {
  /**
   * An app, optionally the section-root app of a section.
   * @param alias The app alias.
   * @param coversSection The section it opens as its root, if any.
   * @returns A stand-in app.
   */
  const app = (alias: string, coversSection?: string): UmbraDesktopApp => ({
    alias,
    name: alias,
    icon: 'icon-document',
    content: { kind: 'iframe', url: '' },
    chromeProfile: 'full-section',
    ...(coversSection ? { coversSection } : {}),
  });

  it('resolves a pin on the fallback tile to the app that now covers the section', () => {
    expect(resolvePinned([app('Pkg.App', 'Pkg.Section')], ['section:Pkg.Section']).map((a) => a.alias)).to.deep.equal(['Pkg.App']);
  });

  it('shows the app once when both of its pins are stored', () => {
    const resolved = resolvePinned([app('Pkg.App', 'Pkg.Section')], ['section:Pkg.Section', 'Pkg.App']);
    expect(resolved.map((a) => a.alias)).to.deep.equal(['Pkg.App']);
  });

  it('knows every stored pin that stands for an app', () => {
    expect(pinKeysFor(app('Pkg.App', 'Pkg.Section'), ['content', 'section:Pkg.Section', 'Pkg.App'])).to.deep.equal([
      'section:Pkg.Section',
      'Pkg.App',
    ]);
  });

  it('unpins every key for the app, so it does not come straight back', () => {
    expect(togglePinnedApp(['content', 'section:Pkg.Section', 'Pkg.App'], app('Pkg.App', 'Pkg.Section'))).to.deep.equal(['content']);
  });

  it('pins an app under its own alias', () => {
    expect(togglePinnedApp(['content'], app('Pkg.App', 'Pkg.Section'))).to.deep.equal(['content', 'Pkg.App']);
  });
});
```

- [ ] **Step 2: Run both files and watch them fail**

Expected: FAIL; `coversSection` is undefined, and `pinKeysFor` / `togglePinnedApp` do not exist.

- [ ] **Step 3: Implement**

`types.ts`, in `UmbraDesktopApp` after `sourceSection`:

```ts
  /**
   * The section this app opens as its root, when it is that section's certified app; absent for
   * everything else. A pin stored on the section's uncertified fallback tile resolves to the app that
   * covers the section now, which is how a pin survives a package shipping its own entry for its
   * section (design D15).
   */
  coversSection?: string;
```

`derive-apps.ts`: import `UMBRADESKTOP_FALLBACK_ALIAS_PREFIX` from `./constants`. In the certified
pass, after `confidence: 'certified',` add:

```ts
      ...(r.isSectionRoot ? { coversSection: r.gateSectionAlias } : {}),
```

and in the fallback pass replace `` alias: `section:${s.alias}`, `` with
`` alias: `${UMBRADESKTOP_FALLBACK_ALIAS_PREFIX}${s.alias}`, ``.

`settings/pinned.ts`: import `UMBRADESKTOP_FALLBACK_ALIAS_PREFIX` from `../constants`, replace
`resolvePinned` and add the two helpers:

```ts
/**
 * Every stored pin that stands for this app: its own alias, and the fallback alias of the section it
 * now covers (design D15). Usually one; two when a user pinned the fallback tile and then pinned the
 * app that replaced it.
 * @param app The app.
 * @param pinned The pinned aliases.
 * @returns The stored aliases that resolve to this app, in pin order.
 */
export function pinKeysFor(app: UmbraDesktopApp, pinned: ReadonlyArray<string>): string[] {
  const fallback = app.coversSection ? `${UMBRADESKTOP_FALLBACK_ALIAS_PREFIX}${app.coversSection}` : undefined;
  return pinned.filter((alias) => alias === app.alias || alias === fallback);
}

/**
 * Pin an app, or unpin it: removing **every** key that stands for it, not only its own alias, or an
 * app pinned through its section's fallback would stay pinned after the user unpinned it.
 * @param pinned The pinned aliases.
 * @param app The app whose pin was clicked.
 * @returns A new list; the input is left untouched.
 */
export function togglePinnedApp(pinned: ReadonlyArray<string>, app: UmbraDesktopApp): string[] {
  const keys = pinKeysFor(app, pinned);
  return keys.length > 0 ? pinned.filter((alias) => !keys.includes(alias)) : [...pinned, app.alias];
}

/**
 * Resolve the pinned aliases against the apps this user may launch, in pin order.
 *
 * (keep the existing paragraphs of this comment, and add:)
 *
 * A pin on a section's fallback tile, `section:<alias>`, that no longer resolves falls back to the
 * app that now covers that section, so a package shipping its own entry for its section does not
 * silently cost the users who pinned the fallback their pin (design D15). An app is listed once even
 * when two stored pins stand for it.
 * @param apps The apps this user may launch.
 * @param pinned The pinned aliases, in pin order.
 * @returns The pinned apps, in pin order.
 */
export function resolvePinned(apps: ReadonlyArray<UmbraDesktopApp>, pinned: ReadonlyArray<string>): UmbraDesktopApp[] {
  const resolved: UmbraDesktopApp[] = [];
  for (const alias of pinned) {
    const app = apps.find((candidate) => candidate.alias === alias) ?? coveringApp(apps, alias);
    if (app && !resolved.includes(app)) resolved.push(app);
  }
  return resolved;
}

/**
 * The app covering the section a fallback alias names, if the alias is one.
 * @param apps The apps this user may launch.
 * @param alias A pinned alias.
 * @returns The covering app, or `undefined`.
 */
function coveringApp(apps: ReadonlyArray<UmbraDesktopApp>, alias: string): UmbraDesktopApp | undefined {
  if (!alias.startsWith(UMBRADESKTOP_FALLBACK_ALIAS_PREFIX)) return undefined;
  const section = alias.slice(UMBRADESKTOP_FALLBACK_ALIAS_PREFIX.length);
  return apps.find((candidate) => candidate.coversSection === section);
}
```

`settings/settings.context.ts`: change the import to `import { togglePinnedApp } from './pinned';`,
add `import type { UmbraDesktopApp } from '../types';`, and replace `togglePin`:

```ts
  /**
   * Pin an app to Favourites, or unpin it if any stored pin stands for it (see `togglePinnedApp`).
   * @param app The app whose pin was clicked.
   */
  public togglePin(app: UmbraDesktopApp): void {
    this.#update({ pinned: togglePinnedApp(this.#settings.getValue().pinned, app) });
  }
```

`components/launcher.element.ts`: import `pinKeysFor` beside `resolvePinned`; in `#togglePin`
replace `this.#settings?.togglePin(app.alias);` with `this.#settings?.togglePin(app);`; in `#tile`
replace `const pinned = this._pinned.includes(app.alias);` with
`const pinned = pinKeysFor(app, this._pinned).length > 0;`.

- [ ] **Step 4: Run both files, then both gates**

Expected: PASS, then `npm run build` and `npm test` green. `togglePinned` stays: its tests still
cover the plain list operation.

---

### Task 5: The catalogue context

Subagent-sized. The largest task, and the one with the traps (D16).

**Files:**
- Modify: `.../desktop/app-catalogue.context.ts`
- Test: `.../desktop/app-catalogue.context.test.ts`

- [ ] **Step 1: Extend the test harness**

In `app-catalogue.context.test.ts`, import `UmbraDesktopLauncherGroup` from `./types` and
`UMBRADESKTOP_SECTION_ALIAS`, `UMBRADESKTOP_SECTION_PATHNAME` from `./constants`. In `setup`,
subscribe to groups beside apps:

```ts
  let groups: UmbraDesktopLauncherGroup[] = [];
  const groupSubscription = context.groups.subscribe((value) => (groups = value));
```

return `groups: () => groups,` from the harness, and add `groupSubscription.unsubscribe();` to
`teardown` beside `subscription.unsubscribe();`. Then add, after `settleDiagnostics`:

```ts
/** A section a test package owns. */
const PKG_SECTION = { type: 'section', alias: 'Pkg.Section', name: 'Pkg', meta: { label: 'Pkg', pathname: 'pkg' } };

/** The desktop's own section, for the cases about not opening a desktop inside itself. */
const DESKTOP_SECTION = {
  type: 'section',
  alias: UMBRADESKTOP_SECTION_ALIAS,
  name: 'Desktop',
  meta: { label: 'Desktop', pathname: UMBRADESKTOP_SECTION_PATHNAME },
};

/**
 * Register a package catalogue the way a package's bundle would.
 * @param registry The registry under test.
 * @param alias The catalogue manifest's alias.
 * @param meta What it defines. Untyped on purpose: several cases send JSON that is wrong.
 * @param over Extra manifest fields, such as `weight` or `conditions`.
 */
function registerCatalogue(
  registry: UmbExtensionRegistry<UmbExtensionManifest>,
  alias: string,
  meta: unknown,
  over: Record<string, unknown> = {},
) {
  registry.register({ type: 'umbraDesktopCatalogue', alias, name: alias, meta, ...over } as unknown as UmbExtensionManifest);
}

/**
 * Register a default-kind menu item, the kind whose URL the desktop infers from an entity type.
 * @param registry The registry under test.
 * @param alias The menu item's alias.
 * @param entityType Its workspace entity type.
 */
function registerMenuItem(registry: UmbExtensionRegistry<UmbExtensionManifest>, alias: string, entityType: string) {
  registry.register({ type: 'menuItem', alias, name: alias, meta: { entityType } } as unknown as UmbExtensionManifest);
}
```

- [ ] **Step 2: Replace the collision test and add the new cases**

Delete the test `drops a registered app whose alias a curated entry already owns, and says so` and
the comment above it, and add:

```ts
/**
 * A registered app that reuses a curated alias now takes it over (design D4), where it used to be
 * dropped. One alias still means one app, since a pin is stored under it, and the console says what
 * was replaced, because an app replacing a deep link is never like-for-like (D13).
 */
it('lets a registered app take over an alias a curated entry owns, and says so', async () => {
  const harness = await setup();
  try {
    registerMenuItem(harness.registry, 'usync.menu.item', 'usync-root');
    harness.registry.register({
      type: 'umbraDesktopApp',
      alias: 'usync',
      element: async () => ({}),
      meta: { label: '#pkg_usync' },
    } as unknown as UmbExtensionManifest);
    await settleDiagnostics();

    expect(harness.aliases().filter((a) => a === 'usync'), 'one alias, one app').to.have.lengthOf(1);
    expect(harness.app('usync')!.content.kind, 'the package wins').to.equal('element');
    expect(harness.desktopWarnings().filter((w) => w.includes('"usync"') && w.includes('replaces'))).to.have.lengthOf(1);
  } finally {
    harness.teardown();
  }
});

describe('package catalogues', () => {
  it('shows the group and section entry a catalogue defines, instead of the fallback tile', async () => {
    const harness = await setup(CATALOGUE, [SETTINGS_SECTION, PKG_SECTION]);
    try {
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        groups: [{ alias: 'pkg', label: '#pkg_group', weight: 22 }],
        entries: [{ alias: 'Pkg.App', ref: 'Pkg.Section', icon: 'icon-rocket', group: 'pkg' }],
      });
      await settle();

      const app = harness.app('Pkg.App');
      expect(app, 'a package entry resolves like a curated one').to.not.equal(undefined);
      expect(app!.content).to.deep.equal({ kind: 'iframe', url: '/umbraco/section/pkg' });
      expect(app!.coversSection).to.equal('Pkg.Section');
      expect(harness.aliases(), 'the section needs no fallback tile any more').to.not.contain('section:Pkg.Section');
      expect(harness.groups().map((group) => group.group.alias)).to.contain('pkg');
    } finally {
      harness.teardown();
    }
  });

  it('replaces a curated entry that shares its alias, silently when it opens the same screen', async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'usync.menu.item', 'usync-root');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings', chromeProfile: 'bare' }],
      });
      await settleDiagnostics();

      expect(harness.app('usync')!.chromeProfile, "the package's definition is used").to.equal('bare');
      expect(harness.desktopWarnings(), 'a like-for-like replacement is the feature working').to.deep.equal([]);
    } finally {
      harness.teardown();
    }
  });

  it('reports a replacement that opens something else', async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'Pkg.MenuItem', 'pkg-root');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'usync', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settleDiagnostics();

      expect(harness.desktopWarnings().some((w) => w.includes('replaces the desktop\'s own app "usync"'))).to.equal(true);
    } finally {
      harness.teardown();
    }
  });

  /**
   * The recursion trap (design D16): a package entry introduces a ref nothing watched, and the
   * context subscribes it from inside a recompute. Marking after subscribing would loop until the
   * stack overflows, so this case finishing at all is half of what it checks.
   */
  it('picks up a catalogue before the extension its entry points at, and again when that registers', async () => {
    const harness = await setup();
    try {
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'Pkg.Tool', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settle();
      expect(harness.aliases(), 'nothing to open yet').to.not.contain('Pkg.Tool');

      registerMenuItem(harness.registry, 'Pkg.MenuItem', 'pkg-tool');
      await settle();
      expect(harness.app('Pkg.Tool')!.content).to.deep.equal({
        kind: 'iframe',
        url: '/umbraco/section/settings/workspace/pkg-tool',
      });
    } finally {
      harness.teardown();
    }
  });

  it("keeps the curated entry while a catalogue's condition is unmet", async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'usync.menu.item', 'usync-root');
      registerCatalogue(
        harness.registry,
        'Pkg.Catalogue',
        { entries: [{ alias: 'usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings', chromeProfile: 'bare' }] },
        { conditions: [{ alias: 'Pkg.Condition.Never' }] },
      );
      await settle();

      expect(harness.app('usync')!.chromeProfile, 'a catalogue not in effect claims nothing (D5)').to.equal('full-section');
    } finally {
      harness.teardown();
    }
  });

  it('gives the curated entry back when the catalogue goes away', async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'usync.menu.item', 'usync-root');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings', chromeProfile: 'bare' }],
      });
      await settle();
      expect(harness.app('usync')!.chromeProfile).to.equal('bare');

      harness.registry.unregister('Pkg.Catalogue');
      await settle();
      expect(harness.app('usync')!.chromeProfile).to.equal('full-section');
    } finally {
      harness.teardown();
    }
  });

  /** The review's blocker, end to end: one broken package must not freeze the launcher (D9). */
  it('never throws on a malformed catalogue, and keeps listening', async () => {
    const harness = await setup();
    try {
      registerCatalogue(harness.registry, 'Pkg.Broken', {
        entries: { alias: 'x', ref: 'y' },
        groups: [null, 7, { alias: 'g', label: 3 }],
      });
      harness.registry.register({
        type: 'umbraDesktopApp',
        alias: 'Pkg.NumberLabel',
        element: async () => ({}),
        meta: { label: 42 },
      } as unknown as UmbExtensionManifest);
      await settle();

      registerMenuItem(harness.registry, 'Pkg.MenuItem', 'pkg-tool');
      registerCatalogue(harness.registry, 'Pkg.Good', {
        entries: [{ alias: 'Pkg.Tool', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settleDiagnostics();

      expect(harness.aliases(), 'the next catalogue still arrives').to.contain('Pkg.Tool');
      expect(harness.desktopWarnings().some((w) => w.includes('"Pkg.Broken"'))).to.equal(true);
    } finally {
      harness.teardown();
    }
  });

  it('refuses a url that leaves the backoffice, and keeps one that does not', async () => {
    const harness = await setup();
    try {
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [
          { alias: 'Pkg.Evil', url: 'javascript:alert(1)', section: 'Umb.Section.Settings' },
          { alias: 'Pkg.Fine', url: '/umbraco/section/settings/workspace/pkg-root', section: 'Umb.Section.Settings' },
        ],
      });
      await settleDiagnostics();

      expect(harness.aliases()).to.not.contain('Pkg.Evil');
      expect(harness.aliases()).to.contain('Pkg.Fine');
      expect(harness.desktopWarnings().some((w) => w.includes('"Pkg.Evil"'))).to.equal(true);
    } finally {
      harness.teardown();
    }
  });

  it("does not open a dashboard that lives in the desktop's own section", async () => {
    const harness = await setup(CATALOGUE, [SETTINGS_SECTION, DESKTOP_SECTION]);
    try {
      harness.registry.register({
        type: 'dashboard',
        alias: 'Pkg.Dashboard',
        name: 'Pkg dashboard',
        meta: { label: 'Pkg', pathname: 'pkg' },
        conditions: [{ alias: 'Umb.Condition.SectionAlias', match: UMBRADESKTOP_SECTION_ALIAS }],
      } as unknown as UmbExtensionManifest);
      registerCatalogue(harness.registry, 'Pkg.Catalogue', { entries: [{ alias: 'Pkg.Dash', ref: 'Pkg.Dashboard' }] });
      await settleDiagnostics();

      expect(harness.aliases()).to.not.contain('Pkg.Dash');
      expect(harness.desktopWarnings().some((w) => w.includes('desktop inside'))).to.equal(true);
    } finally {
      harness.teardown();
    }
  });

  it("brings a section's fallback back when an app replaces its section-root entry", async () => {
    const harness = await setup({ groups: [], entries: [{ alias: 'settings', ref: 'Umb.Section.Settings' }], excludedSections: [] });
    try {
      await settle();
      expect(harness.aliases()).to.not.contain('section:Umb.Section.Settings');

      harness.registry.register({
        type: 'umbraDesktopApp',
        alias: 'settings',
        element: async () => ({}),
        meta: { label: '#pkg_settings' },
      } as unknown as UmbExtensionManifest);
      await settle();

      expect(harness.app('settings')!.content.kind).to.equal('element');
      expect(harness.aliases(), 'nothing else opens the section now').to.contain('section:Umb.Section.Settings');
    } finally {
      harness.teardown();
    }
  });

  it('names the package in a diagnostic about its entry, and asks for a missing section', async () => {
    const harness = await setup();
    try {
      registerMenuItem(harness.registry, 'Pkg.MenuItem', 'pkg-root');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [
          { alias: 'Pkg.Ungated', url: '/umbraco/section/settings/workspace/x' },
          { alias: 'Pkg.Sectionless', ref: 'Pkg.MenuItem' },
        ],
      });
      await settleDiagnostics();

      const warnings = harness.desktopWarnings();
      expect(warnings.some((w) => w.includes('"Pkg.Ungated" from "Pkg.Catalogue"'))).to.equal(true);
      expect(warnings.some((w) => w.includes('"Pkg.Sectionless"') && w.includes('Add "section"'))).to.equal(true);
    } finally {
      harness.teardown();
    }
  });

  it('does nothing once destroyed', async () => {
    const harness = await setup();
    try {
      const before = harness.aliases();
      harness.context.destroy();
      registerCatalogue(harness.registry, 'Pkg.Catalogue', { entries: [{ alias: 'Pkg.App', ref: 'Pkg.Section' }] });
      await settle();
      expect(harness.aliases()).to.deep.equal(before);
    } finally {
      harness.teardown();
    }
  });
});
```

- [ ] **Step 3: Run the file and watch the new cases fail**

Run: `npx web-test-runner "src/desktop/app-catalogue.context.test.ts" --node-resolve`
Expected: the new cases FAIL (no catalogue observation yet; the takeover case sees the old
curated-wins rule). The existing cases still pass. If any existing case asserts the old
`could not be resolved to a URL` wording, it must keep passing: Step 4 changes that message only for
a menu item with no `section`.

- [ ] **Step 4: Change `app-catalogue.context.ts`**

Make these edits, in order. Keep every existing comment that is still true.

**Imports.** Add:

```ts
import type { ManifestUmbraDesktopCatalogue } from './catalogue.extension.js';
import { normalisePackageCatalogues, type UmbraDesktopPackageCatalogue } from './package-catalogues.js';
import { mergeCatalogues, type UmbraDesktopAppClaim } from './merge-catalogues.js';
import { isFiniteNumber } from './manifest-values.js';
import { UMBRADESKTOP_SECTION_ALIAS } from './constants.js';
```

and add `UmbraDesktopCatalogueEntry` to the existing `./types` import if it is not there already.

**Class comment.** After the paragraph that begins "Every input is *observed*", add:

```ts
 * A third input joined the two above with package catalogues: `umbraDesktopCatalogue` manifests any
 * package may register, each carrying groups and deep links in the curated fragments' shape. They
 * are validated and merged over the curated catalogue on every recompute, the package winning on a
 * shared alias (see `merge-catalogues.ts` and the 2026-09-25 package catalogues design). Because a
 * package entry can name a ref nothing watched before, the set of watched refs follows the merged
 * catalogue rather than being fixed at construction; `#watchRefs` says how that avoids recursing.
```

**Fields.** Delete `#curatedAliases` and its comment. Add, beside `#registeredAppManifests`:

```ts
  /**
   * Every registered `umbraDesktopCatalogue` manifest whose conditions are currently met, kept current
   * by the second extension initializer. Manifests rather than validated catalogues, for the same
   * reason as `#registeredAppManifests`: validation, and its reports, happen once, in `#recompute`.
   */
  #packageCatalogueManifests: ReadonlyArray<ManifestUmbraDesktopCatalogue> = [];

  /**
   * The catalogue the last recompute resolved: curated, with every package definition applied.
   * Starts as the curated catalogue, so `getEntryRef` has an answer before the first recompute.
   */
  #merged: UmbraDesktopCatalogue;

  /** Which package catalogue each package-defined entry came from, for naming it in diagnostics. */
  #entrySources: ReadonlyMap<string, string> = new Map();

  /** Refs with an observation, marked before it is created (design D16). */
  #watchedRefs = new Set<string>();

  /** The entry aliases the last recompute resolved, so the gate can forget the ones that leave. */
  #entryAliases: ReadonlySet<string> = new Set();

  /**
   * While true, `#recompute` returns at once: a batch of synchronous emissions is being collected,
   * and exactly one recompute follows it. Construction, reconnection and `#watchRefs` each raise it,
   * which is what turns the forty-odd recomputes construction used to do into one (design D16).
   */
  #batching = false;

  /**
   * Whether `destroy()` has run. `#recompute` is a no-op from then on: the initializers report empty
   * lists from inside `super.destroy()`, and a recompute then would re-track entries on a gate that
   * has already been destroyed, leaving condition checks nothing tears down.
   */
  #destroyed = false;
```

**`isRefRegistered`.** Replace its first comment paragraph's opening with "Whether a `ref` the merged
catalogue names is registered on this install, ..." and add, before `@param`:

```ts
   * A ref first named by a package catalogue is subscribed during the recompute that found it, so a
   * caller asking before that recompute finishes, or on a list emitted by it, gets `false` and the
   * right answer from the next emission. That is the one weakening of the same-pass guarantee above.
```

**`getEntryRef`.** Add after `isRefRegistered` (Task 6 wires it to the taskbar; it lives here):

```ts
  /**
   * The `ref` of the merged catalogue's entry with this alias, if it has one.
   *
   * A package can replace one of our entries with one that points somewhere else, so a host feature
   * that needs a curated entry's ref (the taskbar's AI chat is the one today) asks here rather than
   * reading the static catalogue at module load, which would answer for an entry that no longer
   * exists.
   * @param alias The entry alias.
   * @returns Its ref, or `undefined`.
   */
  public getEntryRef(alias: string): string | undefined {
    return this.#merged.entries.find((entry) => entry.alias === alias)?.ref;
  }
```

**Constructor.** Replace everything from `this.#curatedAliases = ...` to the end of the constructor
with the following, keeping the existing long comments on the app initializer and the section
observation where they are:

```ts
    this.#merged = this.#catalogue;
    this.#validateCatalogue();

    // Everything below emits synchronously as it is set up. Collect it all, then recompute once
    // (design D16). The first recompute is also what starts watching every curated ref.
    this.#batching = true;

    this.#conditionGate = new UmbraDesktopConditionGateController(host, this.#registry, () =>
      this.#recompute(),
    );

    new UmbExtensionsManifestInitializer(
      this,
      this.#registry,
      'umbraDesktopApp',
      null,
      (permitted) => {
        this.#registeredAppManifests = permitted.map((controller) => controller.manifest);
        this.#recompute();
      },
      'observeRegisteredApps',
    );

    // Package catalogues, through the same kind of initializer and for the same reason: it is the
    // route that evaluates a manifest's conditions, so a catalogue whose conditions are unmet never
    // reaches the merge and claims nothing (design D5). It also applies Umbraco's `overwrites`
    // between catalogue manifests before we see them.
    new UmbExtensionsManifestInitializer(
      this,
      this.#registry,
      'umbraDesktopCatalogue',
      null,
      (permitted) => {
        this.#packageCatalogueManifests = permitted.map((controller) => controller.manifest);
        this.#recompute();
      },
      'observePackageCatalogues',
    );

    this.observe(
      this.#registry.byType('section'),
      (sections) => {
        this.#registeredSections = (sections ?? []) as ReadonlyArray<ReferencedManifest>;
        this.#recompute();
      },
      'observeRegisteredSections',
    );

    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (currentUser) => {
      if (!currentUser) return;
      this.observe(
        currentUser.allowedSections,
        (allowed) => {
          this.#allowedSections = allowed ?? [];
          this.#recompute();
        },
        'observeAllowedSections',
      );
    });

    this.#batching = false;
    this.#recompute();
  }
```

The `for (const ref of this.#refs())` loop and `#refs()` itself are deleted: `#watchRefs` replaces
both.

**`destroy`** gains `this.#destroyed = true;` as its first line; add one sentence to its comment:
"`#destroyed` goes up first of all, so the recomputes the initializers trigger from inside
`super.destroy()` do nothing."

**`hostConnected`** batches the re-subscription:

```ts
  override hostConnected(): void {
    this.#stopped = false;
    this.#batching = true;
    super.hostConnected();
    this.#batching = false;
    this.#recompute();
  }
```

and its comment gains: "Re-subscribing makes every observation emit at once, so the batch collects
them and one recompute follows, which is also where any ref that could not be watched while the
desktop was closed gets its observation."

**`#recompute`**, replaced whole:

```ts
  /** Re-merge and re-resolve the catalogue, and publish the derived and grouped apps. */
  #recompute(): void {
    if (this.#destroyed || this.#batching) return;
    this.#pendingDiagnostics.clear();
    this.#sections = this.#resolveSections();
    const registered = this.#normaliseRegisteredApps();
    const merged = mergeCatalogues({
      curated: this.#catalogue,
      packages: this.#normalisePackageCatalogues(),
      apps: this.#appClaims(registered),
    });
    for (const report of merged.reports) this.#diagnose(report.key, report.message);
    this.#merged = merged.catalogue;
    this.#entrySources = merged.entrySources;
    this.#watchRefs(merged.catalogue.entries);
    this.#forgetDepartedEntries(merged.catalogue.entries);
    const resolved = merged.catalogue.entries.map((entry) => this.#resolveEntry(entry));
    const apps = deriveApps(
      resolved,
      this.#sections,
      merged.catalogue.excludedSections,
      registered.filter((app) => !merged.droppedApps.has(app.alias)),
    );
    this.#apps.setValue(apps);
    this.#groups.setValue(groupApps(apps, merged.catalogue.groups));
    this.#scheduleDiagnostics();
  }
```

**New private methods**, after `#recompute`:

```ts
  /**
   * Start watching every `ref` in these entries that nothing watches yet (design D16).
   *
   * Three rules, each for a failure that was found rather than imagined. **Mark before subscribing:**
   * `UmbObserverController` subscribes, and so emits, from inside its own constructor, before it has
   * even registered as a controller, and the callback recomputes, so a ref marked afterwards is found
   * unwatched again by that very recompute and subscribed again, until the stack overflows. **Batch
   * the callbacks:** while subscribing they only record the manifest, and the recompute that called
   * this carries on with every new manifest recorded. **Respect the lifecycle:** nothing is subscribed
   * once destroyed, where it would outlive the context, or while stopped, where an observation created
   * during `hostDisconnected` is never reached by that pass and stays live with the desktop closed.
   * Refs skipped while stopped are simply still unwatched, and the recompute after reconnecting picks
   * them up.
   *
   * A ref that later drops out of the catalogue stays watched. That saves re-subscribing when a
   * condition flips back; the cost is one registry scan per watched ref per registry change, bounded by
   * the refs any catalogue has named this session.
   * @param entries The merged catalogue's entries.
   */
  #watchRefs(entries: ReadonlyArray<UmbraDesktopCatalogueEntry>): void {
    if (this.#destroyed || this.#stopped) return;
    const fresh = [...new Set(entries.map((entry) => entry.ref))].filter(
      (ref): ref is string => !!ref && !this.#watchedRefs.has(ref),
    );
    if (fresh.length === 0) return;
    const batching = this.#batching;
    this.#batching = true;
    try {
      for (const ref of fresh) {
        this.#watchedRefs.add(ref);
        // One observation per distinct ref, each under its own controller alias: `observe` otherwise
        // derives one from the callback's source, identical on every iteration, and each would evict
        // the last. `byAlias` also kind-merges the manifest, so a menu item's `kind` resolves.
        this.observe(
          this.#registry.byAlias(ref),
          (manifest) => {
            this.#manifests.set(ref, manifest as ReferencedManifest | undefined);
            this.#recompute();
          },
          `observeRef:${ref}`,
        );
      }
    } finally {
      this.#batching = batching;
    }
  }

  /**
   * Tell the condition gate to drop every entry that has left the merged catalogue, so its condition
   * checks stop firing. Before package catalogues, an entry could only lose its ref; now it can leave
   * the catalogue altogether, and `#resolveEntry` never sees it again to forget it.
   * @param entries The merged catalogue's entries.
   */
  #forgetDepartedEntries(entries: ReadonlyArray<UmbraDesktopCatalogueEntry>): void {
    const present = new Set(entries.map((entry) => entry.alias));
    for (const alias of this.#entryAliases) if (!present.has(alias)) this.#conditionGate.forget(alias);
    this.#entryAliases = present;
  }

  /**
   * The registered apps' claims on their aliases, carrying each manifest's own root weight: the
   * normalised app's weight has already been inverted onto the launcher's scale, and the merge
   * compares manifests on Umbraco's.
   * @param registered The normalised apps.
   * @returns One claim per app.
   */
  #appClaims(registered: ReadonlyArray<UmbraDesktopRegisteredApp>): UmbraDesktopAppClaim[] {
    const weights = new Map(
      this.#registeredAppManifests.map((manifest) => [manifest.alias, isFiniteNumber(manifest.weight) ? manifest.weight : 0] as const),
    );
    return registered.map((app) => ({ alias: app.alias, manifestWeight: weights.get(app.alias) ?? 0 }));
  }

  /**
   * Validate the permitted package catalogues, reporting what did not survive.
   * @returns The usable catalogues.
   */
  #normalisePackageCatalogues(): UmbraDesktopPackageCatalogue[] {
    const { catalogues, reports } = normalisePackageCatalogues(this.#packageCatalogueManifests, window.location.origin);
    for (const report of reports) this.#diagnose(report.key, report.message);
    return catalogues;
  }

  /**
   * How a diagnostic names an entry: by alias, plus the package catalogue it came from, if any. Two
   * packages can use one alias for different things, so the source goes into the key as well.
   * @param entry The entry.
   * @returns The name to print, such as `"Pkg.App" from "Pkg.Catalogue"`.
   */
  #entryLabel(entry: UmbraDesktopCatalogueEntry): string {
    const source = this.#entrySources.get(entry.alias);
    return source ? `"${entry.alias}" from "${source}"` : `"${entry.alias}"`;
  }
```

**`#resolveRegisteredApps`** is renamed `#normaliseRegisteredApps`, keeps its drop reporting, prints
the new `ignored` fields, and loses the curated-collision filter, which the merge now decides:

```ts
  /**
   * Normalise the permitted `umbraDesktopApp` manifests, reporting what did not survive and which
   * fields were ignored. Which app keeps an alias shared with an entry is the merge's decision now
   * (design D4), so nothing here filters on aliases.
   * @returns The registered apps the merge should see.
   */
  #normaliseRegisteredApps(): UmbraDesktopRegisteredApp[] {
    const { apps, dropped, ignored } = normaliseRegisteredApps(this.#registeredAppManifests);
    for (const drop of dropped) {
      this.#diagnose(
        `registered-dropped:${drop.alias}`,
        `[UmbraDesktop] Registered app "${drop.alias}" was dropped because ${drop.reason}.`,
      );
    }
    for (const { alias, field } of ignored) {
      this.#diagnose(
        `registered-ignored:${alias}:${field}`,
        `[UmbraDesktop] Registered app "${alias}": "${field}" has the wrong type, so it was ignored.`,
      );
    }
    return apps;
  }
```

**`#resolveEntry`**: in the `ungated` diagnostic, use the label and put the source in the key:

```ts
        this.#diagnose(
          `ungated:${this.#entrySources.get(entry.alias) ?? ''}:${entry.alias}`,
          `[UmbraDesktop] Catalogue entry ${this.#entryLabel(entry)} has a "url" but no "section" gate, so it will never appear. Add "section".`,
        );
```

After `const described = this.#describe(manifest, entry);` add the desktop-section guard:

```ts
    // `excludedSections` only guards the fallback, so an entry whose gate is the desktop's own section
    // (a dashboard registered there, say) would open a desktop inside a desktop window (design D14).
    if (described.gateSectionAlias === UMBRADESKTOP_SECTION_ALIAS) {
      this.#diagnose(
        `desktop:${this.#entrySources.get(entry.alias) ?? ''}:${entry.alias}`,
        `[UmbraDesktop] Catalogue entry ${this.#entryLabel(entry)} would open the desktop inside a desktop window, so it is not shown.`,
      );
      return { entry, url: null, gateSectionAlias: null, isSectionRoot: false };
    }
```

and replace the `unresolved` diagnostic with one that asks for the missing section when that is the
problem, and names the package either way:

```ts
    if (!url && gatePermitted) {
      const missingSection = manifest.type === 'menuItem' && !entry.section;
      this.#diagnose(
        `unresolved:${this.#entrySources.get(entry.alias) ?? ''}:${entry.alias}`,
        missingSection
          ? `[UmbraDesktop] Catalogue entry ${this.#entryLabel(entry)} (ref "${entry.ref}") is a menu item with no "section", so its URL cannot be built. Add "section".`
          : `[UmbraDesktop] Catalogue entry ${this.#entryLabel(entry)} (ref "${entry.ref}", type "${manifest.type}") is permitted but could not be resolved to a URL — it may need an explicit "url".`,
      );
    }
```

(The second message keeps the existing wording, dash included, because existing tests may match
it. Do not reword it in this task.)

- [ ] **Step 5: Run the file, then both gates**

Run: `npx web-test-runner "src/desktop/app-catalogue.context.test.ts" --node-resolve`
Expected: every case PASS, old and new. Then `npm run build` and `npm test` from the host package.

If a case hangs rather than fails, suspect the rAF shim first (the harness comment explains it), and
check that the new initializer is created while `#batching` is up, not after.

---

### Task 6: The chat's ref comes from the merged catalogue

Inline. Design §5, review note N2.

**Files:**
- Modify: `.../desktop/taskbar/features/types.ts`, `.../desktop/components/taskbar.element.ts`,
  `.../desktop/settings/categories/taskbar/taskbar.element.ts`,
  `.../desktop/taskbar/features/ai-chat/index.ts`
- Modify (stubs): `.../desktop/components/launcher-long-names.test.ts`,
  `.../desktop/components/taskbar-features.test.ts`
- Test: `.../desktop/app-catalogue.context.test.ts`

- [ ] **Step 1: Write the failing test** (inside the `package catalogues` describe)

```ts
  it("answers an entry's ref from the merged catalogue", async () => {
    const harness = await setup();
    try {
      expect(harness.context.getEntryRef('usync')).to.equal('usync.menu.item');
      registerCatalogue(harness.registry, 'Pkg.Catalogue', {
        entries: [{ alias: 'usync', ref: 'Pkg.MenuItem', section: 'Umb.Section.Settings' }],
      });
      await settle();
      expect(harness.context.getEntryRef('usync')).to.equal('Pkg.MenuItem');
    } finally {
      harness.teardown();
    }
  });
```

Expected before Task 5 lands: FAIL. After it: PASS already, since `getEntryRef` was added there; run
it to confirm.

- [ ] **Step 2: Add `entryRef` to the feature context**

In `taskbar/features/types.ts`, after `isRefRegistered`:

```ts
  /**
   * The `ref` of the catalogue entry with this alias, as the merged catalogue has it now. A package
   * may replace one of our entries with one that points elsewhere, so a feature that needs an entry's
   * ref reads it here rather than from the static curated catalogue.
   * @param alias The entry alias.
   * @returns Its ref, or `undefined`.
   */
  entryRef(alias: string): string | undefined;
```

In both `#featureContext` getters (`components/taskbar.element.ts` and
`settings/categories/taskbar/taskbar.element.ts`), after `isRefRegistered`:

```ts
      entryRef: (alias) => this.#catalogue?.getEntryRef(alias),
```

In `taskbar/features/ai-chat/index.ts`, delete the `catalogue` import, `CHAT_REF` and its comment,
and change `availability` to:

```ts
  // The ref comes from the entry, as the merged catalogue has it now, rather than being written here a
  // second time: two places that must agree about a third party's section is one too many, and a
  // package may since have replaced the entry with one that points elsewhere.
  availability: (context) =>
    aiChatAvailability(context.apps, context.isRefRegistered, context.entryRef(UMBRADESKTOP_AI_CHAT_APP_ALIAS)),
```

In the two test stubs that provide `isRefRegistered: () => true`, add `getEntryRef: () => undefined,`
beside it.

- [ ] **Step 3: Both gates**

Expected: `npm run build` clean (`tsc` catches any feature context literal missing `entryRef`) and
`npm test` green, including `ai-chat/availability.test.ts`, whose function signature did not change.

---

### Task 7: The host stops knowing games exist

Inline. Design D10.

**Files:**
- Modify: `.../desktop/catalogue/groups.ts`, `.../desktop/catalogue/groups.test.ts`,
  `.../desktop/localization/en.ts`, `.../desktop/localization/nl.ts`

- [ ] **Step 1: Rewrite the group tests first**

In `groups.test.ts` delete the three Games cases (`declares a games group ...`, `sorts games after
every other finished group`, `sorts games before the reserved More group ...`) with their comments,
and replace `sorts experimental after games and before the reserved More group` and its comment with:

```ts
/**
 * Experimental is the last real group, immediately before the reserved "More": after everything this
 * repository ships, because an app still working out what it should be is furthest from what anybody
 * came for, and before "More", the bucket for apps nobody curated. Games used to sit between the two;
 * it belongs to the Entertainment package now, which places it at 60 (package catalogues design D10).
 */
it('sorts experimental after every other group and before the reserved More group', () => {
  const experimental = groups.find((g) => g.alias === 'experimental')!;
  for (const group of groups.filter((g) => g.alias !== 'experimental')) {
    expect(experimental.weight!, `experimental must sort after ${group.alias}`).to.be.greaterThan(group.weight!);
  }
  expect(experimental.weight!).to.be.lessThan(UMBRADESKTOP_MORE_GROUP_WEIGHT);
});

/** The host no longer defines a group for another package's apps (package catalogues design D10). */
it('does not define a games group of its own', () => {
  expect(groups.map((g) => g.alias)).to.not.contain('games');
});
```

Run the file: the new games case FAILS (the host still defines it).

- [ ] **Step 2: Remove it**

In `groups.ts` delete the `games` row and its four-line comment. In `localization/en.ts` delete
`groupGames: 'Games',` and in `localization/nl.ts` delete `groupGames: 'Spellen',`.

- [ ] **Step 3: Both gates**

Expected: green. `localization/parity.test.ts` passes because both files lost the same key.

---

### Task 8: Entertainment brings its own Games group

Inline. Design §6.

**Files** (in `src/Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/`):
- Modify: `bundle.manifests.ts`, `umbradesktop-app.d.ts`, `localization/en.ts`, `localization/nl.ts`
- Test: `bundle.manifests.test.ts`

- [ ] **Step 1: Write the failing test** (append to `bundle.manifests.test.ts`)

```ts
/** The one catalogue this package registers. */
const catalogue = manifests.find((manifest) => manifest.type === 'umbraDesktopCatalogue');

/**
 * The Games group is this package's own now, label and all, so this is the only place that says it
 * exists. The bounds are literals because the host's list cannot be imported from here: after its
 * System (50) and before its Experimental (70), the weights the host publishes so packages can place
 * against them (package catalogues design D10, D11).
 */
it('defines the games group itself, between System and Experimental', () => {
  const groups =
    (catalogue as { meta?: { groups?: Array<{ alias: string; label: string; weight?: number }> } } | undefined)?.meta
      ?.groups ?? [];
  const games = groups.find((group) => group.alias === 'games');
  expect(games, 'the package must define the group its games name').to.not.equal(undefined);
  expect(games!.label, "a token from this package's own dictionary").to.equal('#umbraDesktopEntertainment_groupGames');
  expect(games!.weight).to.be.greaterThan(50);
  expect(games!.weight).to.be.lessThan(70);
});
```

Run from the Entertainment package: `npm test`. Expected: this case FAILS; the rest pass.

- [ ] **Step 2: Declare the type in `umbradesktop-app.d.ts`**

Change the first line of its header comment to "The desktop's manifest types, `umbraDesktopApp` and
`umbraDesktopCatalogue`, declared here because a consuming package cannot import them." Then add,
before `declare global`:

```ts
/** A launcher group this package defines. A copy of the host's `UmbraDesktopPackageGroup`. */
interface UmbraDesktopPackageGroup {
  /** Stable id, named by an app's `meta.group` or an entry's `group`. */
  alias: string;
  /** Heading text: a localisation token from this package's dictionary, or a literal. */
  label: string;
  /** Position among the launcher's groups, **lower first**: the host's Editing is 10, System 50, Experimental 70. */
  weight?: number;
}

/** A deep link into one of this package's backoffice screens. A copy of the host's `UmbraDesktopPackageEntry`. */
interface UmbraDesktopPackageEntry {
  /** Stable app id and pin key. Reuse one of the host's aliases to replace that entry. */
  alias: string;
  /** Alias of a registered section, dashboard or default-kind menu item; the URL is inferred from it. */
  ref?: string;
  /** An explicit backoffice path under `/umbraco/section/` on this site, for what `ref` cannot infer. */
  url?: string;
  /** Permission gate; required with a menu-item `ref` or a `url`. */
  section?: string;
  /** Window title and tile text; defaults to the referenced extension's label. */
  name?: string;
  /** Native Umbraco icon alias; defaults to the referenced extension's icon. */
  icon?: string;
  /** How much backoffice chrome the window keeps. Defaults to `full-section`. */
  chromeProfile?: 'full-section' | 'workspace-only' | 'bare';
  /** The window body's opening size in px; the host adds the theme's chrome. */
  defaultSize?: { w: number; h: number };
  /** The smallest body in px; floored at what the theme's chrome needs. */
  minSize?: { w: number; h: number };
  /** Whether two windows of it may be open at once. */
  allowMultiple?: boolean;
  /** Whether the window may be resized or maximized. Default: allowed. */
  resizable?: boolean;
  /** Position within its group, **lower first**, like the host's own entries. */
  weight?: number;
  /** Launcher group alias. */
  group?: string;
  /** Mount-independent condition aliases on the referenced extension to answer before showing it. */
  evaluateConditions?: string[];
}

/** What a `umbraDesktopCatalogue` manifest carries. A copy of the host's `MetaUmbraDesktopCatalogue`. */
interface MetaUmbraDesktopCatalogue {
  /** Launcher groups this package defines. */
  groups?: UmbraDesktopPackageGroup[];
  /** Deep links into this package's backoffice screens. */
  entries?: UmbraDesktopPackageEntry[];
}

/**
 * A package's catalogue: its own launcher groups and backoffice deep links, as data. The host promises
 * these types only ever gain optional fields, which is what keeps this copy correct while it lags.
 */
interface ManifestUmbraDesktopCatalogue extends ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopCatalogue';
  /** The groups and entries. */
  meta: MetaUmbraDesktopCatalogue;
}
```

and inside `UmbExtensionManifestMap`, beside `umbraDesktopApp`:

```ts
    /** This package's launcher groups. */
    umbraDesktopCatalogue: ManifestUmbraDesktopCatalogue;
```

- [ ] **Step 3: Register the catalogue in `bundle.manifests.ts`**

Before `const minesweeper`:

```ts
/**
 * The Games group, defined by the package whose games fill it.
 *
 * The host used to reserve `games` on this package's behalf, which made it the one group on the
 * desktop that existed only for somebody else's apps. A catalogue manifest lets the package own its
 * heading as well as its games, so the host now knows nothing about games at all (design D10 of
 * `docs/design/2026-09-25-package-catalogues-design.md`).
 *
 * This weight is on the launcher's own scale, lower first, unlike the games' root `weight` below,
 * which is Umbraco's. 60 places Games after the host's System (50) and before its Experimental (70),
 * the slot it always had; the host publishes those weights for exactly this (design D11).
 *
 * No `entries`: an entry deep-links one of the package's own backoffice screens, and this package has
 * none.
 */
const catalogue: UmbExtensionManifest = {
  type: 'umbraDesktopCatalogue',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Catalogue',
  name: 'UmbraDesktop Entertainment catalogue',
  meta: {
    groups: [{ alias: 'games', label: '#umbraDesktopEntertainment_groupGames', weight: 60 }],
  },
};
```

In Minesweeper's `meta`, replace the two comment lines above `group: 'games',` with
`// The group this package's catalogue above defines.` Change the export to
`[catalogue, minesweeper, snake, ...localizationManifests]`, and in the comment above it say the
`umbraDesktopApp` **and** `umbraDesktopCatalogue` arms come from `umbradesktop-app.d.ts`.

- [ ] **Step 4: Ship the label**

`localization/en.ts`: replace the header's second paragraph with "This package's own dictionary: the
Games group's heading, which this package's catalogue manifest defines, each game's name, which its
manifest points at through `meta.label`, and everything the games themselves say." and add as the
first key of the area:

```ts
    // The launcher group this package's catalogue manifest defines (bundle.manifests.ts).
    groupGames: 'Games',
```

`localization/nl.ts`: add `groupGames: 'Spellen',` as the first key.

- [ ] **Step 5: Both gates, in the Entertainment package**

Expected: `npm run build` clean (the manifest type-checks through the new declaration) and
`npm test` green.

---

### Task 9: Documentation

Inline. Design §7 and the repo's definition of done. Markdown only in `README.md` (it is the NuGet
readme). No em-dashes in anything written here.

**Files:**
- Create: `docs/package-catalogues.md`
- Modify: `docs/desktop-apps.md`, `README.md`, `docs/design/2026-09-06-desktop-apps-design.md`,
  `umbraco-marketplace-umbraco.community.umbradesktop.json`,
  `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/app.extension.ts`

- [ ] **Step 1: Write `docs/package-catalogues.md`**

```markdown
# Putting your package's screens on the desktop

> How a package gives its own backoffice screens proper tiles, and its own headings in the
> launcher, without a pull request to this repository. For why it is shaped this way, see
> [the design](design/2026-09-25-package-catalogues-design.md).

---

## 1. Is a catalogue what you need?

| You want | Register |
|---|---|
| A tile for a section, dashboard or workspace your package already has | A `umbraDesktopCatalogue` entry |
| A heading of your own in the launcher | A `umbraDesktopCatalogue` group |
| An app that is its own element, with no backoffice route behind it | A `umbraDesktopApp`. See [desktop-apps.md](desktop-apps.md) |
| Your section to appear at all | Nothing: any section a user can reach already shows up under More |

A catalogue is data only. It loads no code, so a static `umbraco-package.json` can carry it as
well as a bundle can.

## 2. The manifest

```ts
{
  type: 'umbraDesktopCatalogue',
  alias: 'My.Package.DesktopCatalogue',
  name: 'My Package desktop catalogue',
  meta: {
    groups: [{ alias: 'my-package', label: '#myPackage_group', weight: 22 }],
    entries: [
      {
        alias: 'My.Package.DesktopApp',
        ref: 'My.Package.Section',
        icon: 'icon-rocket',
        chromeProfile: 'full-section',
        defaultSize: { w: 1100, h: 760 },
        group: 'my-package',
        weight: 10,
      },
    ],
  },
}
```

One manifest per package, holding any number of groups and entries. Register a second one only
if some of your tiles need conditions the others do not (§7).

## 3. Entries

An entry has the same fields as the desktop's own catalogue entries, with the same meaning, and is
resolved by the same code.

| Field | Notes |
|---|---|
| `alias` | Required. The app's id and the key a pin is stored under, so keep it stable. Namespace it like any Umbraco alias. Reusing one of the desktop's aliases replaces that entry (§5) |
| `ref` | The alias of a registered `section`, a `dashboard` with a pathname, or a default-kind `menuItem` with an entity type. The URL is worked out from it, and the tile only appears where that extension is registered |
| `url` | For what `ref` cannot reach. Must be a backoffice path under `/umbraco/section/` on the same site; anything else is refused. Not existence-checked, so prefer `ref` wherever it works |
| `section` | The permission gate. Required with a menu-item `ref` or a `url` |
| `name`, `icon` | Default to the referenced extension's label and icon. Icons are native `icon-*` aliases |
| `chromeProfile` | `full-section` (default) keeps the section's sidebar, `workspace-only` hides it, `bare` also hides a dashboard's tab strip. Anything else is ignored |
| `defaultSize`, `minSize` | The window body's size in px. The desktop adds the theme's chrome |
| `allowMultiple`, `resizable` | Whether a second window may open, and whether the window may be resized or maximized |
| `group`, `weight` | Which group the tile sits in, and its place there, lower first |
| `evaluateConditions` | Conditions on the referenced extension to answer before showing the tile. Only ones that do not depend on where the extension is mounted |

An entry whose `ref` is a section also stops that section's generic tile from appearing under More,
and users who had pinned that tile keep their pin: it moves to your entry.

## 4. Groups

A group is `alias`, `label` and `weight`. Use a label token from your own dictionary. The weight
places your group among the desktop's, which are fixed so you can rely on them:

| Group | Weight |
|---|---|
| Editing | 10 |
| Workflow | 12 |
| Marketing and sales | 15 |
| Development | 20 |
| Synchronisation | 25 |
| Security | 30 |
| Advanced security | 35 |
| Diagnostics | 40 |
| Automation | 43 |
| AI | 45 |
| System | 50 |
| Experimental | 70 |
| More, always last | 9999 |

Games, from the Entertainment add-on, sits at 60. A group without a weight sorts before Editing, so
always give one. An entry naming a group nobody defines lands under More.

## 5. Replacing one of the desktop's tiles

If the desktop already has a tile for your screens, give your entry the same alias and yours is used
instead. That is the intended way for a package to take over its own tiles: your release ships in
step with your screens, and ours does not. Pins stay, because they are stored under the alias.

Replacement is whole. Anything you leave out is gone, so start from the desktop's own entry in
`backoffice/src/desktop/catalogue/` and change what you need, rather than from a blank one.

A replacement that opens the same screen is silent. One that opens something else prints a line, and
so does a group redefined with a different weight: those are how an accident looks. Do not redefine a
group you did not create.

`copilot-workspace` is one the desktop relies on: its taskbar chat button opens it, and assumes one
window. Keep `allowMultiple: false` if you replace it.

## 6. When two packages disagree

If two packages define the same alias, the one whose manifest has the higher `weight` is used, then
the one whose manifest alias sorts first. The console names both. Two definitions that agree, the same
screen for an entry or the same weight for a group, are not reported.

## 7. Two weight scales

Everything inside `meta` sorts **lower first**, like the desktop's own catalogue, because your
numbers have to sit among ours. The manifest's own root `weight` is Umbraco's, **higher first**, and
only matters when two packages clash. A weight of 1000 or more inside `meta` is almost always the two
mixed up, and the console says so.

## 8. Conditions

`conditions` on the manifest switch the whole catalogue on or off. While they are unmet, the desktop
behaves as if your package had no catalogue, so its own tiles, if it has any for you, come back.

A condition that depends on where an extension is mounted, `Umb.Condition.SectionAlias` for
instance, is answered on the desktop, where it never passes. Keep those off the catalogue manifest.

For a single tile, `evaluateConditions` reuses the conditions already on the screen it opens. If that
is not enough, register a second catalogue manifest for the gated tiles.

## 9. What the console tells you

Every problem is one `[UmbraDesktop]` warning, printed once the registry has been quiet for five
seconds and naming your manifest. Nothing you send can break the launcher: a field with the wrong
type is ignored, an item that cannot be used is dropped, and the console says which.

## 10. Types for your package

The desktop's npm package is private, so copy the declaration. The Entertainment add-on's
`umbradesktop-app.d.ts` is a complete one to start from. The desktop promises that these types only
ever gain optional fields, so a copy that falls behind still describes a valid manifest.

## 11. Checklist

- [ ] Every entry alias is namespaced, or deliberately one of ours.
- [ ] Every group has a weight, and a label from your own dictionary.
- [ ] `ref` wherever it can infer the URL; `url` only under `/umbraco/section/`.
- [ ] Each replacement starts from the entry it replaces.
- [ ] The tile opens in a window with the chrome profile you chose, under all five themes.
- [ ] The console has no `[UmbraDesktop]` lines about your manifest.
```

- [ ] **Step 2: Update `docs/desktop-apps.md`**

Section 1: replace the table's second row with

```markdown
| **A backoffice surface**: a section, a dashboard, a workspace, anything with a URL | A `umbraDesktopCatalogue` entry. See [package-catalogues.md](package-catalogues.md) | Your package ships in step with its own screens, so it is the right place for their tiles |
```

and replace the paragraph "The manifest enforces this rather than describing it. ..." with

```markdown
The two manifests split the work by what they describe. `umbraDesktopApp` has no `url`, `section`
or `chromeProfile`, because an element in a box has none of them, and a catalogue entry has no
`element`, because a deep link is a page someone else renders.
```

Change the section's first line to "Two kinds of thing can sit in the launcher, and a package can
register both."

Section 2, the `alias` row's Notes: replace the first sentence with "Unique. If it matches one of the
desktop's own catalogue entries, your app replaces that entry and the console says so."

Section 6: retitle it `## 6. Groups` and replace its first three paragraphs (up to and including "name
a different group and land in More until one exists.") with

```markdown
`meta.group` is a launcher group alias: one of the desktop's own, or one a package defines in its
catalogue. The Entertainment add-on does exactly that for Games, so its games and their heading ship
together and the desktop knows nothing about either. An app naming a group nobody defines lands in the
reserved More group. [package-catalogues.md](package-catalogues.md) §4 lists the desktop's groups
and their weights.
```

Section 8: replace the paragraph "**An alias a curated entry already owns loses.** ..." with

```markdown
**An alias a curated entry already owns is taken over.** The desktop's aliases are one namespace,
shared with its catalogue, because an alias is what a pin is stored under. A manifest whose alias
matches one of the desktop's entries replaces that entry, and the console prints a line saying what
it replaced, since swapping a deep link for an app is rarely an accident you want to miss. If two
packages claim one alias, the higher manifest weight keeps it and the console names both.
```

and in "**Three things can make your app not appear**", change "A colliding alias, this one." to "An
alias another package's manifest also claims, with the higher weight."

- [ ] **Step 3: Update `README.md`**

Features, the launcher bullet: replace "plus Games once a package puts an app there." with "plus any
heading a package brings along, such as the Entertainment add-on's Games."

Features, after the "Room for apps that are not the backoffice." bullet, add:

```markdown
- Tiles your packages bring themselves. A package with backoffice screens of its own can give them proper tiles, the right window and a heading of its own in the launcher, from its own release. If the desktop already has a tile for them, the package's version is used, so the package that owns the screens decides how they open. See [Custom and third-party apps](#custom-and-third-party-apps).
```

"The app catalogue": replace "The second is apps other packages register for themselves, covered
below." with "The second is what other packages register for themselves: self-contained apps, and
catalogues of their own that add tiles and groups or replace ours. Both are covered below."

Games: replace "It reaches the desktop through the same public `umbraDesktopApp` manifest any package
can register" with "It reaches the desktop through the same public manifests any package can
register, a `umbraDesktopApp` for each game and a catalogue for the Games group,".

"Custom and third-party apps": replace the paragraph starting "**Curated placement for a backoffice
surface.**" with

```markdown
**Tiles for your own backoffice screens.** If your app *is* a backoffice page, a section, dashboard or workspace your package registers, register a `umbraDesktopCatalogue` manifest with an entry for it: a name, an icon, a group, a chrome profile and window sizing, resolved exactly like the desktop's own entries. The same manifest can define launcher groups of your own. It ships with your package, so nothing waits on a release of this one. If the desktop already has an entry for your screens, reuse its alias and yours is used instead, pins included. [`docs/package-catalogues.md`](docs/package-catalogues.md) is the guide.
```

and in the next paragraph change "A curated entry for a third-party package points at" to "The
desktop's own entry for a third-party package points at".

Documentation: after the `docs/desktop-apps.md` paragraph add

```markdown
Putting your package's own backoffice screens on the desktop is one catalogue manifest.
[`docs/package-catalogues.md`](docs/package-catalogues.md) is the guide: the entry and group fields,
the desktop's published group weights, how replacing one of its tiles works, and what the console
tells you. The reasoning is in
[`docs/design/2026-09-25-package-catalogues-design.md`](docs/design/2026-09-25-package-catalogues-design.md).
```

- [ ] **Step 4: Point the old design at the new one**

In `docs/design/2026-09-06-desktop-apps-design.md`, wrap the decision text of D1, D2 and D5 in
`~~ ~~` and append to each: ` → **Superseded by the [package catalogues design](2026-09-25-package-catalogues-design.md) (its D1, D3 and D10): packages register deep links and groups too, through umbraDesktopCatalogue.**`
Do the same to the first bullet of §11.

- [ ] **Step 5: The Marketplace listing**

In `umbraco-marketplace-umbraco.community.umbradesktop.json`, add `"package integration"` to `Tags`
after `"extensibility"`. Leave `Description` alone: this does not change what the package is.

- [ ] **Step 6: The `app.extension.ts` header**

Replace the part of `MetaUmbraDesktopApp`'s comment from "Their absence is what keeps the design's
boundary structural" to the end of that paragraph with: "An element in a box has no URL, no section
and no chrome to strip, so none of those fields exist here. A package that wants a tile for one of
its backoffice screens registers a `umbraDesktopCatalogue` instead (`catalogue.extension.ts`), which
is where deep links live."

- [ ] **Step 7: Check the prose**

Run from the repository root:

```bash
grep -n "—" docs/package-catalogues.md README.md
```

Expected: nothing new in the lines this task wrote.

---

### Task 10: Verify

- [ ] **Step 1: Both gates, both packages**

From `src/Umbraco.Community.UmbraDesktop`, then from `src/Umbraco.Community.UmbraDesktop.Entertainment`:
`npm run build` and `npm test`. Expected: both green in both. Compare the test counts with Task 0's:
the host gains the new files' cases, and none of the old ones disappeared except the three Games
group cases and the collision case, which were replaced on purpose.

- [ ] **Step 2: Run it in a browser**

This worktree sits under `.claude/`, and Umbraco cannot create a LocalDB `.mdf` under a
dot-directory, so give the test instance a named catalog instead of its file. Build first:

```bash
dotnet build src/Umbraco.Community.UmbraDesktop.TestInstance
```

Create `.claude/launch.json` in this worktree:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "issue-85-testinstance",
      "runtimeExecutable": "powershell",
      "runtimeArgs": [
        "-NoProfile",
        "-Command",
        "$env:ASPNETCORE_ENVIRONMENT='Development'; $env:ASPNETCORE_URLS='http://127.0.0.1:5085'; $env:ConnectionStrings__umbracoDbDSN='Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=UmbraDesktop-Issue85;Integrated Security=True'; $env:ConnectionStrings__umbracoDbDSN_ProviderName='Microsoft.Data.SqlClient'; Set-Location 'D:\\github\\Umbraco.Community.UmbraDesktop\\.claude\\worktrees\\package-catalogue-manifest-f7eda8\\src\\Umbraco.Community.UmbraDesktop.TestInstance'; dotnet run --no-launch-profile --no-build"
      ],
      "port": 5085,
      "url": "http://127.0.0.1:5085"
    }
  ]
}
```

Start it with `preview_start` (`issue-85-testinstance`). Browse on `127.0.0.1`, never `localhost`,
so the owner's own instance's cookies are not sent. The unattended install creates the admin user
from `appsettings.Development.json`; sign in with that.

Check, and note what you saw for each:

1. The launcher shows **Games** with Minesweeper and Snake, in that order, between System and
   Experimental.
2. With the backoffice language set to Dutch, the heading reads **Spellen**.
3. Pin Minesweeper, reload: still pinned, in the launcher and on the taskbar.
4. The console has no `[UmbraDesktop]` lines.
5. A curated app still opens, for example Log Viewer, with its chrome stripped as before.

Stop the server with `preview_stop` afterwards, and delete `.claude/launch.json` if `git status`
shows it.

---

### Task 11: A whole-branch review

The owner asked for the full change set to be reviewed as a whole, because an add-on package depends
on it. Per-task review does not replace this.

- [ ] **Step 1: Dispatch one reviewer**

Give a fresh agent, read-only: the design doc, this plan, and the whole diff (`git diff origin/main`
plus the new files `git status` lists). Ask it to check that the change does what the design says,
and to look specifically for bugs (re-entrancy, lifecycle, pins, ordering), performance (recomputes
per registry change, observations held), and security (the url rule, anything read into HTML). It
reports findings ranked, each with file:line and a concrete failure scenario.

- [ ] **Step 2: Verify, then fix**

Check every finding against the code before acting on it. Fix the real ones test-first, and re-run
both gates in both packages after the last fix.

- [ ] **Step 3: Walk the definition of done**

From `CLAUDE.md`, and say explicitly which items did not apply:

- [ ] `npm run build` and `npm test` pass, both packages.
- [ ] `README.md` covers it in every place Task 9 lists, Markdown only.
- [ ] The host's Marketplace listing has the new tag; its `Description` is unchanged; the
      Entertainment listing needs nothing.
- [ ] `docs/package-catalogues.md` exists and both `docs/desktop-apps.md` and the old design point at it.
- [ ] Anything the build taught that the code does not show is written where the next person meets it.

- [ ] **Step 4: Report, and ask about a commit**

Tell the owner what changed, file by file, what the browser check showed, and what the review found.
Remind them that #88 has to switch to its own catalogue group before it merges (D17). Then ask whether
to commit. Do not commit.
