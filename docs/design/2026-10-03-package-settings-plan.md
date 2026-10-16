# Package settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **No commits.** The repository owner reviews one uncommitted diff (global rule). Where a skill says
> "commit", stop and report instead.

**Goal:** Let a package put its settings in Desktop settings, one row per package with one box per
manifest, with an optional per-user store and an `openSettings` call, and move the Accessories
screensaver onto it.

**Architecture:** A data manifest (`umbraDesktopPackageSettings`) is validated and grouped by a pure
function, rendered by the existing settings modal in a new "From other packages" section, with each
package's screen drawn by a new element that lazy-loads one box per manifest. A global context
(`UmbraDesktop.PackageSettingsContext`) holds a generic store lifted from Accessories and opens the
settings modal on the desktop that registered itself. `umbraDesktopApp` gains `meta.opensSettings`,
honoured in the window manager's `open`.

**Tech Stack:** TypeScript, Lit (through `@umbraco-cms/backoffice/external/lit`), Umbraco 17
backoffice extension API, `@open-wc/testing` under web-test-runner.

**Design:** [`2026-10-03-package-settings-design.md`](2026-10-03-package-settings-design.md). Read it
first; section numbers below refer to it.

---

## Conventions for every task

- Paths are relative to the repository root. `HOST` means
  `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop`, `ACC` means
  `src/Umbraco.Community.UmbraDesktop.Accessories/backoffice/src`.
- **JSDoc on everything**, private members included, saying why. Match the density of the file you
  are in. The code blocks below carry the docs they need; keep them.
- **Tests first.** Each task writes the test, runs it red, then implements.
- Run one test file with, from `src/Umbraco.Community.UmbraDesktop` (or the Accessories folder):
  `npx web-test-runner "backoffice/src/desktop/settings/package-settings.test.ts" --concurrency 2`
  (adjust the path). `npm test` runs everything.
- Test pitfalls in this repository: assert on strings and booleans, never on DOM nodes (a failing
  chai message over a Lit element hangs the run); `fixture()` never settles for modal elements, so
  mount by hand; a `uui-button` click is handled a macrotask late.
- `npm run build` type-checks; the test runner does not. Run both at the end of each phase.

## File map

| File | Responsibility |
|------|----------------|
| `HOST/settings/package-settings.extension.ts` (new) | The manifest type and its `UmbExtensionManifestMap` entry |
| `HOST/settings/package-settings.ts` (new) | `normalisePackageSettings`: validate, group by package, sort, report |
| `HOST/settings/components/package-settings-screen.element.ts` (new) | One package's screen: attribution line, one `uui-box` per manifest, lazy load, failure line |
| `HOST/settings/components/settings-modal.element.ts` | Observe the manifests, render the package section, navigate to a package, deep link by package name |
| `HOST/settings/modal-tokens.ts` | `category` doc: also a package name |
| `HOST/settings/open-settings.ts` (new) | `openDesktopSettings(host, category?)`: the one way code opens the panel at a place |
| `HOST/settings/package-store/package-settings-store.ts` (new) | Generic per-user JSON store, lifted from Accessories |
| `HOST/settings/package-settings.context.ts`, `…context-token.ts` (new) | The global context: `store`, `openSettings`, `attachDesktop` |
| `HOST/settings/manifest.ts` | Register the global context |
| `HOST/components/desktop.element.ts` | Attach itself to the global context |
| `HOST/app.extension.ts`, `registered-apps.ts`, `types.ts`, `derive-apps.ts`, `window-manager.context.ts` | `meta.opensSettings` |
| `HOST/localization/en.ts`, `nl.ts` | Three new terms |
| `ACC/shared/package-settings.ts` (new) | Hand-copied context interfaces and token |
| `ACC/umbradesktop-app.d.ts` | Hand-copied manifest type, `opensSettings` |
| `ACC/settings/settings.ts`, `settings.source.ts` | Parse a decoded value; adapter over the host store |
| `ACC/bundle.manifests.ts` | The settings box, the Screen Saver tile as a shortcut |
| `ACC/screensaver/*` | Panel copy, entry point cleanup |
| Docs | §11 of the design |

---

## Phase 1: the manifest and the panel

### Task 1: The manifest type

**Files:**
- Create: `HOST/settings/package-settings.extension.ts`

Types only, so no test of its own; Task 2's tests import it.

- [ ] **Step 1: Write the type**

```ts
import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * What a `umbraDesktopPackageSettings` manifest carries beyond the extension basics.
 *
 * **These types only ever gain optional fields**, as the catalogue's and the docs' do: packages
 * hand-copy this declaration, and a copy that lags behind must still describe a valid manifest.
 */
export interface MetaUmbraDesktopPackageSettings {
  /**
   * The package's name as people know it, such as `UmbraDesktop Accessories`. Plain text, never a
   * localisation key: it is a proper noun, and it is what manifests are grouped by, so a name that
   * translated differently per language would split one package into two rows (design D4).
   */
  package: string;
  /** The box's heading on the package's screen. A localisation token (`#myPackage_x`) or a literal. */
  label: string;
}

/**
 * One box of a package's settings in Desktop settings (design §3).
 *
 * Every manifest naming the same `meta.package` lands on one row, and each is one box on that row's
 * screen, so a package can never take more than one row however many it registers (design D1). The
 * host draws the row, the screen, the attribution line and the box; the package owns what is inside
 * the box, including where its values are stored.
 *
 * `weight` orders boxes within the package's screen, higher first, Umbraco's convention. It never
 * orders a package against the desktop's own categories, so it is used as Umbraco means it.
 */
export interface ManifestUmbraDesktopPackageSettings
  extends ManifestElement<HTMLElement>,
    ManifestWithDynamicConditions<UmbExtensionConditionConfig> {
  type: 'umbraDesktopPackageSettings';
  meta: MetaUmbraDesktopPackageSettings;
}

declare global {
  /** Registers the manifest with Umbraco's type map, like `umbraDesktopApp`. */
  interface UmbExtensionManifestMap {
    umbraDesktopPackageSettings: ManifestUmbraDesktopPackageSettings;
  }
}
```

### Task 2: Validate and group the manifests

**Files:**
- Create: `HOST/settings/package-settings.ts`
- Test: `HOST/settings/package-settings.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect } from '@open-wc/testing';
import { normalisePackageSettings } from './package-settings.js';

/**
 * Package settings arrive as third-party JSON, from a static `umbraco-package.json` that nothing
 * type-checks or a bundle built against a stale copy of the types. Everything here is about what
 * survives, how it is grouped, and that nothing throws.
 */

const loader = async () => ({});

/** A valid manifest, with anything the case wants changed. */
const manifest = (over: Record<string, unknown> = {}) => ({
  type: 'umbraDesktopPackageSettings',
  alias: 'Pkg.Box',
  name: 'Box',
  element: loader,
  meta: { package: 'My Package', label: 'General' },
  ...over,
});

it('groups manifests with the same package into one package with a box each', () => {
  const { packages } = normalisePackageSettings([
    manifest({ alias: 'A' }),
    manifest({ alias: 'B', meta: { package: 'My Package', label: 'Other' } }),
  ]);
  expect(packages.map((p) => [p.name, p.boxes.map((b) => b.alias)])).to.deep.equal([['My Package', ['A', 'B']]]);
});

it('sorts packages by name', () => {
  const { packages } = normalisePackageSettings([
    manifest({ alias: 'Z', meta: { package: 'Zebra tools', label: 'x' } }),
    manifest({ alias: 'A', meta: { package: 'apple tools', label: 'x' } }),
  ]);
  expect(packages.map((p) => p.name)).to.deep.equal(['apple tools', 'Zebra tools']);
});

it('orders boxes by weight, higher first, then by alias', () => {
  const { packages } = normalisePackageSettings([
    manifest({ alias: 'Low', weight: 1 }),
    manifest({ alias: 'High', weight: 100 }),
    manifest({ alias: 'B-unset' }),
    manifest({ alias: 'A-unset' }),
  ]);
  expect(packages[0].boxes.map((b) => b.alias)).to.deep.equal(['High', 'Low', 'A-unset', 'B-unset']);
});

it('trims the package name, so a stray space does not make a second row', () => {
  const { packages } = normalisePackageSettings([
    manifest({ alias: 'A', meta: { package: 'My Package ', label: 'x' } }),
    manifest({ alias: 'B', meta: { package: 'My Package', label: 'y' } }),
  ]);
  expect(packages.map((p) => p.name)).to.deep.equal(['My Package']);
});

for (const [why, over, reason] of [
  ['no meta', { meta: undefined }, 'no "meta"'],
  ['meta that is not an object', { meta: 'nope' }, 'no "meta"'],
  ['no package', { meta: { label: 'x' } }, '"meta.package"'],
  ['an empty package', { meta: { package: '  ', label: 'x' } }, '"meta.package"'],
  ['no label', { meta: { package: 'P' } }, '"meta.label"'],
  ['no element', { element: undefined }, '"element"'],
  ['the desktop’s own name', { meta: { package: ' umbradesktop ', label: 'x' } }, 'UmbraDesktop'],
] as const) {
  it(`drops a manifest with ${why}, and names it in the report`, () => {
    const { packages, reports } = normalisePackageSettings([manifest(over)]);
    expect(packages).to.deep.equal([]);
    expect(reports.map((r) => r.message).join('\n')).to.contain('"Pkg.Box"').and.to.contain(reason);
  });
}

it('says to rename "js" when a manifest has no element but has a js', () => {
  const { reports } = normalisePackageSettings([manifest({ element: undefined, js: loader })]);
  expect(reports[0].message).to.contain('"js"').and.to.contain('"element"');
});

it('reports a weight that is not a number, and treats it as unset', () => {
  const { packages, reports } = normalisePackageSettings([manifest({ weight: '10' })]);
  expect(packages[0].boxes[0].weight).to.equal(0);
  expect(reports[0].message).to.contain('"weight"');
});

it('never throws, whatever it is handed', () => {
  expect(() => normalisePackageSettings([null, 42, 'x', [], { alias: 1 }, manifest()])).to.not.throw();
});

it('gives each report a stable key, so it prints once', () => {
  const first = normalisePackageSettings([manifest({ meta: undefined })]).reports;
  const second = normalisePackageSettings([manifest({ meta: undefined })]).reports;
  expect(first.map((r) => r.key)).to.deep.equal(second.map((r) => r.key));
});
```

- [ ] **Step 2: Run, expect FAIL** (`normalisePackageSettings` does not exist).

- [ ] **Step 3: Implement**

```ts
import type { ManifestUmbraDesktopPackageSettings } from './package-settings.extension';
import { isFiniteNumber, isNonEmptyString, isRecord } from '../manifest-values';

/**
 * The name no package may use: settings under it would read as the desktop's own, which is the
 * one thing the package section exists to rule out (design §3).
 */
const RESERVED_PACKAGE_NAME = 'umbradesktop';

/** One box on a package's screen: one manifest, validated. */
export interface UmbraDesktopSettingsBox {
  /** The manifest alias, which keys the box's element so it loads once. */
  alias: string;
  /** The heading, a `#` token or a literal, localised when drawn. */
  label: string;
  /** Order within the package, higher first; 0 when unset or not a number. */
  weight: number;
  /** The manifest itself, handed to `createExtensionElement` when the box is first shown. */
  manifest: ManifestUmbraDesktopPackageSettings;
}

/** One package's row and screen: its name and its boxes, in the order they are drawn. */
export interface UmbraDesktopSettingsPackage {
  /** The package's name, trimmed. The row's name, the screen's heading, and the deep-link id. */
  name: string;
  /** Its boxes, higher weight first, then by alias. */
  boxes: UmbraDesktopSettingsBox[];
}

/** One thing worth telling a package author, keyed so the panel prints it once. */
export interface UmbraDesktopSettingsReport {
  /** Stable for the same problem with the same manifest. */
  key: string;
  /** The console line. */
  message: string;
}

/**
 * Validate the permitted `umbraDesktopPackageSettings` manifests and group them by package
 * (design D1, §3). **Never throws**: the input is third-party JSON, and a throw here would leave the
 * settings panel without its list.
 *
 * A manifest missing something required is dropped and reported; a bad `weight` is reported and
 * treated as unset. Unknown fields are left alone, so a manifest written for a newer desktop still
 * works on this one.
 * @param manifests The permitted manifests, typed as unknown on purpose.
 * @returns The packages, sorted by name, and the reports.
 */
export function normalisePackageSettings(manifests: ReadonlyArray<unknown>): {
  packages: UmbraDesktopSettingsPackage[];
  reports: UmbraDesktopSettingsReport[];
} {
  const reports: UmbraDesktopSettingsReport[] = [];
  const byName = new Map<string, UmbraDesktopSettingsBox[]>();
  for (const raw of manifests) {
    if (!isRecord(raw)) continue;
    const alias = String(raw.alias);
    const report = (what: string, text: string) =>
      reports.push({
        key: `package-settings:${alias}:${what}`,
        message: `[UmbraDesktop] Package settings "${alias}" ${text}.`,
      });
    const meta = raw.meta;
    if (!isRecord(meta)) {
      report('meta', 'has no "meta" object, so it was dropped');
      continue;
    }
    const name = isNonEmptyString(meta.package) ? meta.package.trim() : '';
    if (!name) {
      report('package', 'has no usable "meta.package", the package name its row is shown under, so it was dropped');
      continue;
    }
    if (name.toLowerCase() === RESERVED_PACKAGE_NAME) {
      report('reserved', 'names its package "UmbraDesktop", which is the desktop\'s own, so it was dropped');
      continue;
    }
    if (!isNonEmptyString(meta.label)) {
      report('label', 'has no usable "meta.label", the heading of its box, so it was dropped');
      continue;
    }
    if (!raw.element) {
      report(
        'element',
        raw.js
          ? 'has no "element" to load: it points at a module through "js", which the desktop does not read. Rename that field to "element"'
          : 'has no "element" to load, so its box would be empty. It was dropped',
      );
      continue;
    }
    let weight = 0;
    if (raw.weight !== undefined) {
      if (isFiniteNumber(raw.weight)) weight = raw.weight;
      else report('weight', 'has a "weight" that is not a number, so it was ignored');
    }
    const boxes = byName.get(name) ?? [];
    boxes.push({ alias, label: meta.label, weight, manifest: raw as unknown as ManifestUmbraDesktopPackageSettings });
    byName.set(name, boxes);
  }
  const packages = [...byName]
    .map(([name, boxes]) => ({
      name,
      boxes: boxes.sort((a, b) => b.weight - a.weight || (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { packages, reports };
}
```

- [ ] **Step 4: Run, expect PASS.**

### Task 3: The three new terms

**Files:**
- Modify: `HOST/localization/en.ts`, `HOST/localization/nl.ts` (beside `settingsBack`)
- Test: `HOST/localization/parity.test.ts` already checks the two files agree

- [ ] **Step 1: Add to `en.ts`**, next to `settingsBack`:

```ts
    // Package settings (design 2026-10-03). The heading says whose these are before anything else does.
    settingsFromPackages: 'From other packages',
    // Names the package and nothing else. "Not from UmbraDesktop" read oddly for the desktop's own
    // add-ons (Accessories, Connections), and the "From other packages" heading already says it.
    settingsPackageAttribution: 'These settings come from the %0% package.',
    settingsBoxLoadFailed: 'This part of the settings could not be loaded.',
```

- [ ] **Step 2: Add to `nl.ts`**, in the same place:

```ts
    settingsFromPackages: 'Van andere pakketten',
    settingsPackageAttribution: 'Deze instellingen komen uit het pakket %0%.',
    settingsBoxLoadFailed: 'Dit deel van de instellingen kon niet worden geladen.',
```

- [ ] **Step 3: Run `parity.test.ts`, expect PASS.**

### Task 4: One package's screen

**Files:**
- Create: `HOST/settings/components/package-settings-screen.element.ts`
- Test: `HOST/settings/components/package-settings-screen.element.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect } from '@open-wc/testing';
import './package-settings-screen.element.js';
import type { UmbraDesktopSettingsPackage } from '../package-settings.js';
import type { ManifestUmbraDesktopPackageSettings } from '../package-settings.extension.js';

/**
 * A package's screen: who the settings are from, then one box per manifest with the package's own
 * element inside. Strings and booleans only in assertions; see `settings-modal.test.ts` for why.
 */

class BoxA extends HTMLElement {}
class BoxB extends HTMLElement {}
if (!customElements.get('test-box-a')) customElements.define('test-box-a', BoxA);
if (!customElements.get('test-box-b')) customElements.define('test-box-b', BoxB);

/** A package with the given boxes, already in drawing order. */
function pkg(...boxes: Array<{ alias: string; label: string; element: unknown }>): UmbraDesktopSettingsPackage {
  return {
    name: 'My Package',
    boxes: boxes.map((box) => ({
      alias: box.alias,
      label: box.label,
      weight: 0,
      manifest: {
        type: 'umbraDesktopPackageSettings',
        alias: box.alias,
        name: box.alias,
        element: box.element,
        meta: { package: 'My Package', label: box.label },
      } as ManifestUmbraDesktopPackageSettings,
    })),
  };
}

/** Mount the screen and wait until `done` holds, or give up after 50 macrotasks. */
async function mount(value: UmbraDesktopSettingsPackage, done: (root: ShadowRoot) => boolean) {
  const element = document.createElement('umbradesktop-settings-package');
  element.package = value;
  document.body.append(element);
  after(() => element.remove());
  await element.updateComplete;
  const root = element.shadowRoot!;
  for (let tries = 0; tries < 50 && !done(root); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;
  }
  return { element, root };
}

it('says whose settings these are, by package name', async () => {
  const { root } = await mount(pkg({ alias: 'A', label: 'General', element: BoxA }), () => true);
  // No dictionary in the runner, so the term renders as its key with the name; in a backoffice it
  // is the sentence. Either way the package is named.
  expect(root.querySelector('.attribution')?.textContent ?? '').to.match(/settingsPackageAttribution|My Package/);
});

it('draws one box per manifest, headed by its label, in the order given', async () => {
  const { root } = await mount(
    pkg({ alias: 'A', label: 'First', element: BoxA }, { alias: 'B', label: 'Second', element: BoxB }),
    (r) => !!r.querySelector('test-box-b'),
  );
  expect([...root.querySelectorAll('uui-box')].map((box) => box.getAttribute('headline'))).to.deep.equal([
    'First',
    'Second',
  ]);
  expect(!!root.querySelector('uui-box[data-box="A"] test-box-a')).to.equal(true);
  expect(!!root.querySelector('uui-box[data-box="B"] test-box-b')).to.equal(true);
});

it('says so in a box whose element cannot be loaded, and still shows the others', async () => {
  const { root } = await mount(
    pkg(
      { alias: 'Broken', label: 'Broken', element: () => Promise.reject(new Error('the chunk is gone')) },
      { alias: 'A', label: 'Fine', element: BoxA },
    ),
    (r) => !!r.querySelector('uui-box[data-box="Broken"] .failed') && !!r.querySelector('test-box-a'),
  );
  expect(root.querySelector('uui-box[data-box="Broken"] .failed')?.textContent ?? '').to.match(
    /settingsBoxLoadFailed|could not be loaded/,
  );
  expect(!!root.querySelector('uui-box[data-box="A"] test-box-a')).to.equal(true);
});

it('keeps a loaded element when the package is handed over again', async () => {
  const value = pkg({ alias: 'A', label: 'First', element: BoxA });
  const { element, root } = await mount(value, (r) => !!r.querySelector('test-box-a'));
  const before = root.querySelector('test-box-a');
  element.package = { ...value, boxes: [...value.boxes] };
  await element.updateComplete;
  expect(root.querySelector('test-box-a') === before, 'the same element, not a fresh one').to.equal(true);
});

it('drops a box that is no longer in the package', async () => {
  const value = pkg({ alias: 'A', label: 'First', element: BoxA }, { alias: 'B', label: 'Second', element: BoxB });
  const { element, root } = await mount(value, (r) => !!r.querySelector('test-box-b'));
  element.package = { ...value, boxes: value.boxes.slice(0, 1) };
  await element.updateComplete;
  expect(!!root.querySelector('uui-box[data-box="B"]')).to.equal(false);
});
```

- [ ] **Step 2: Run, expect FAIL** (element not defined).

- [ ] **Step 3: Implement**

```ts
import type { UmbraDesktopSettingsBox, UmbraDesktopSettingsPackage } from '../package-settings';
import { css, customElement, html, nothing, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { createExtensionElement } from '@umbraco-cms/backoffice/extension-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * One package's screen in Desktop settings (design §4): a line saying whose settings these are, then
 * one `uui-box` per manifest with the package's element inside.
 *
 * The host draws the box and its heading, so every package's screen has the same grouping the
 * desktop's own screens use, and a package cannot draw itself as part of ours. What is inside the box
 * is the package's.
 *
 * A box's element is loaded the first time this screen shows it, not when the panel opens, and kept
 * for as long as this screen exists, so going back to the list and in again does not rebuild it.
 */
@customElement('umbradesktop-settings-package')
export class UmbraDesktopSettingsPackageElement extends UmbLitElement {
  /** The package to show. Handed over again, with fresh objects, whenever its boxes change. */
  @property({ attribute: false })
  package?: UmbraDesktopSettingsPackage;

  /** Bumped when a box finishes loading or fails, to re-render. */
  @state()
  private _loads = 0;

  /** Loaded elements by manifest alias. */
  #elements = new Map<string, HTMLElement>();

  /** Aliases whose load is under way, so a box is asked for once. */
  #loading = new Set<string>();

  /** Aliases whose element could not be loaded. */
  #failed = new Set<string>();

  /**
   * A box's contents: its element once loaded, a loader until then, and a line saying it could not be
   * loaded if it failed, never an empty box.
   * @param box The box.
   * @returns What goes inside the box.
   */
  #content(box: UmbraDesktopSettingsBox) {
    const loaded = this.#elements.get(box.alias);
    if (loaded) return loaded;
    if (this.#failed.has(box.alias)) {
      return html`<p class="failed">${this.localize.term('umbraDesktop_settingsBoxLoadFailed')}</p>`;
    }
    if (!this.#loading.has(box.alias)) {
      this.#loading.add(box.alias);
      createExtensionElement(box.manifest)
        .then((element) => {
          if (element) this.#elements.set(box.alias, element);
          else this.#failed.add(box.alias);
        })
        .catch((error: unknown) => {
          console.error(`[UmbraDesktop] Package settings "${box.alias}" could not be loaded.`, error);
          this.#failed.add(box.alias);
        })
        .finally(() => {
          this.#loading.delete(box.alias);
          this._loads++;
        });
    }
    return html`<uui-loader></uui-loader>`;
  }

  override render() {
    void this._loads;
    const value = this.package;
    if (!value) return nothing;
    return html`
      <p class="attribution">${this.localize.term('umbraDesktop_settingsPackageAttribution', value.name)}</p>
      ${repeat(
        value.boxes,
        (box) => box.alias,
        (box) => html`<uui-box data-box=${box.alias} headline=${this.localize.string(box.label)}>${this.#content(box)}</uui-box>`,
      )}
    `;
  }

  static override styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-5);
      }
      /* Above the boxes and quieter than them: it frames them rather than competing with them. */
      .attribution {
        margin: 0;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .failed {
        margin: 0;
        color: var(--uui-color-danger);
      }
    `,
  ];
}

export default UmbraDesktopSettingsPackageElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-package': UmbraDesktopSettingsPackageElement;
  }
}
```

- [ ] **Step 4: Run, expect PASS.**

### Task 5: The package section in the panel

**Files:**
- Modify: `HOST/settings/components/settings-modal.element.ts`
- Modify: `HOST/settings/modal-tokens.ts` (the `category` doc)
- Test: `HOST/settings/components/settings-modal.test.ts`

- [ ] **Step 1: Extend the test helper and add the failing tests**

In `panel()`, take an optional registry and always set one, so a registration from another test file
cannot add a row:

```ts
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import type {
  UmbConditionConfigBase,
  UmbConditionControllerArguments,
  UmbExtensionCondition,
} from '@umbraco-cms/backoffice/extension-api';
import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

async function panel(data?: { category?: string }, registry?: UmbExtensionRegistry<UmbExtensionManifest>) {
  const element = document.createElement('umbradesktop-settings-modal');
  // Always a registry of the test's own, empty unless the case fills it.
  element.registry = registry ?? new UmbExtensionRegistry<UmbExtensionManifest>();
  // …rest unchanged…
```

Add to the returned queries:

```ts
    headline: (id: string) =>
      root.querySelector(`umbradesktop-settings-row[data-category="${CSS.escape(id)}"]`)?.getAttribute('headline') ?? null,
    detail: (id: string) =>
      root.querySelector(`umbradesktop-settings-row[data-category="${CSS.escape(id)}"]`)?.getAttribute('detail') ?? null,
    sectionHeading: () => root.querySelector('.section')?.textContent?.trim() ?? null,
    headingText: () => root.querySelector('.heading')?.textContent?.trim() ?? null,
```

and change `clickRow` to use `CSS.escape(id)` in its selector. Then append:

```ts
describe('package settings', () => {
  class Box extends HTMLElement {}
  if (!customElements.get('test-package-box')) customElements.define('test-package-box', Box);

  /** A registry holding one box per entry. */
  function registryWith(...boxes: Array<{ alias: string; pkg: string; label: string; conditions?: unknown[] }>) {
    const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
    for (const { alias, pkg, label, conditions } of boxes) {
      registry.register({
        type: 'umbraDesktopPackageSettings',
        alias,
        name: alias,
        element: Box,
        meta: { package: pkg, label },
        ...(conditions ? { conditions } : {}),
      } as UmbExtensionManifest);
    }
    return registry;
  }

  /** Wait until `done` holds; package rows arrive through condition evaluation, which is async. */
  async function until(view: Awaited<ReturnType<typeof panel>>, done: () => boolean) {
    for (let tries = 0; tries < 50 && !done(); tries++) await settle(view.element);
  }

  const row = (name: string) => `package:${name}`;

  it('shows no package section when no package has settings', async () => {
    const view = await panel();
    expect(view.sectionHeading()).to.equal(null);
    expect(view.rowIds()).to.deep.equal(ids);
  });

  it('adds one row per package after our own categories, under a heading', async () => {
    const view = await panel(
      undefined,
      registryWith(
        { alias: 'B1', pkg: 'Beta tools', label: 'One' },
        { alias: 'A1', pkg: 'Alpha tools', label: 'Main' },
        { alias: 'B2', pkg: 'Beta tools', label: 'Two' },
      ),
    );
    await until(view, () => view.rowIds().includes(row('Beta tools')));
    expect(view.rowIds()).to.deep.equal([...ids, row('Alpha tools'), row('Beta tools')]);
    expect(view.sectionHeading()).to.match(/settingsFromPackages|From other packages/);
    expect(view.headline(row('Beta tools'))).to.equal('Beta tools');
    expect(view.detail(row('Beta tools'))).to.equal('One, Two');
  });

  it('opens a package’s screen, headed by its name', async () => {
    const view = await panel(undefined, registryWith({ alias: 'A1', pkg: 'Alpha tools', label: 'Main' }));
    await until(view, () => view.rowIds().includes(row('Alpha tools')));
    view.clickRow(row('Alpha tools'));
    await settle(view.element);
    expect(view.showing('umbradesktop-settings-package')).to.equal(true);
    expect(view.headingText()).to.equal('Alpha tools');
  });

  it('leaves out a box whose conditions are not met, and a package with none left', async () => {
    const registry = registryWith(
      { alias: 'Shown', pkg: 'Shown tools', label: 'x' },
      { alias: 'Hidden', pkg: 'Hidden tools', label: 'x', conditions: [{ alias: 'Test.Condition.Never' }] },
    );
    registry.register({
      type: 'condition',
      alias: 'Test.Condition.Never',
      name: 'Never',
      api: class extends UmbConditionBase<UmbConditionConfigBase> implements UmbExtensionCondition {
        constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbConditionConfigBase>) {
          super(host, args);
          this.permitted = false;
        }
      },
    });
    const view = await panel(undefined, registry);
    await until(view, () => view.rowIds().includes(row('Shown tools')));
    await settle(view.element);
    expect(view.rowIds()).to.deep.equal([...ids, row('Shown tools')]);
  });

  it('opens straight at a package it was asked for by name, even though it arrives late', async () => {
    const view = await panel({ category: 'Alpha tools' }, registryWith({ alias: 'A1', pkg: 'Alpha tools', label: 'x' }));
    await until(view, () => view.showing('umbradesktop-settings-package'));
    expect(view.headingText()).to.equal('Alpha tools');
  });

  it('goes back to the list when the open package goes away', async () => {
    const registry = registryWith({ alias: 'A1', pkg: 'Alpha tools', label: 'x' });
    const view = await panel(undefined, registry);
    await until(view, () => view.rowIds().includes(row('Alpha tools')));
    view.clickRow(row('Alpha tools'));
    await settle(view.element);
    registry.unregister('A1');
    await until(view, () => !view.showing('umbradesktop-settings-package'));
    expect(view.hasHeading()).to.equal(false);
    expect(view.rowIds()).to.deep.equal(ids);
  });

  it('puts focus back on the package row on the way out', async () => {
    const view = await panel(undefined, registryWith({ alias: 'A1', pkg: 'Alpha tools', label: 'x' }));
    await until(view, () => view.rowIds().includes(row('Alpha tools')));
    view.clickRow(row('Alpha tools'));
    await settle(view.element);
    view.clickBack();
    await settle(view.element);
    expect(view.focused()).to.equal(row('Alpha tools'));
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (no `registry` property, no package rows).

- [ ] **Step 3: Implement in `settings-modal.element.ts`**

Imports to add:

```ts
import type { UmbraDesktopSettingsPackage } from '../package-settings';
import { normalisePackageSettings } from '../package-settings.js';
import './package-settings-screen.element.js';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import type { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
```

and add `property` to the lit import. Module-level:

```ts
/**
 * The icon every package row carries. One icon for all of them, rather than one each package
 * chooses, so the row reads as "a package" before its name is read (design §3). `icon-box` is the
 * desktop's own default app icon, so it is known to exist in the shipped set.
 */
const PACKAGE_ROW_ICON = 'icon-box';

/** The prefix of a package row's id, which keeps package names apart from our category ids. */
const PACKAGE_ROW_PREFIX = 'package:';

/** Where the panel is: the list, one of our categories, or a package's screen (by name). */
type PanelPlace =
  | { kind: 'category'; category: UmbraDesktopSettingsCategory }
  | { kind: 'package'; name: string };
```

In the class, replace `_category` and add the registry, the packages and the pending deep link:

```ts
  /**
   * Where package settings come from. The backoffice's registry unless a test says otherwise; read
   * once, when the panel connects.
   */
  @property({ attribute: false })
  registry: UmbExtensionRegistry<UmbExtensionManifest> = umbExtensionsRegistry;

  /** Where the panel is, or undefined at the list. */
  @state()
  private _place?: PanelPlace;

  /** The packages with settings whose conditions are met, grouped and sorted. */
  @state()
  private _packages: UmbraDesktopSettingsPackage[] = [];

  /**
   * A deep link naming something that is not one of our categories. Package settings arrive after
   * the panel connects, once their conditions are evaluated, so the link is held and answered when a
   * package by that name arrives. It never arriving leaves the list showing, as an unknown id did.
   */
  #pending?: string;

  /** Report keys already printed, so a re-evaluation does not print the same line again. */
  #reported = new Set<string>();
```

`connectedCallback` becomes:

```ts
  override connectedCallback() {
    super.connectedCallback();
    const category = findSettingsCategory(this.data?.category);
    this._place = category ? { kind: 'category', category } : undefined;
    if (!category) this.#pending = this.data?.category;

    // `UmbExtensionsManifestInitializer` rather than `byType`, because `byType` never evaluates a
    // manifest's `conditions`, and a box whose author said it should not show would show anyway.
    new UmbExtensionsManifestInitializer(
      this,
      this.registry,
      'umbraDesktopPackageSettings',
      null,
      (permitted) => this.#onPackages(permitted.map((controller) => controller.manifest)),
      'observePackageSettings',
    );
  }

  /**
   * Take the permitted manifests: validate and group them, print what was dropped, answer a held
   * deep link, and leave a package's screen that has nothing left to show.
   * @param manifests The permitted manifests.
   */
  #onPackages(manifests: ReadonlyArray<unknown>) {
    const { packages, reports } = normalisePackageSettings(manifests);
    for (const { key, message } of reports) {
      if (this.#reported.has(key)) continue;
      this.#reported.add(key);
      console.warn(message);
    }
    this._packages = packages;
    const pending = this.#pending && packages.find((value) => value.name === this.#pending);
    if (pending && !this._place) {
      this.#pending = undefined;
      this.#open({ kind: 'package', name: pending.name });
      return;
    }
    const place = this._place;
    if (place?.kind === 'package' && !packages.some((value) => value.name === place.name)) {
      this.#focusAfterRender = undefined;
      this._place = undefined;
    }
  }

  /**
   * A place's id, which is also its row's `data-category`: our category ids as they are, package
   * names behind a prefix so a package cannot take the id of one of ours.
   * @param place The place.
   * @returns The id.
   */
  #idOf(place: PanelPlace): string {
    return place.kind === 'category' ? place.category.id : `${PACKAGE_ROW_PREFIX}${place.name}`;
  }
```

`#open` takes a `PanelPlace`; `#back` stores `this.#idOf(this._place)` (when set) in
`#focusAfterRender` and clears `_place`. In `updated()`, the row query uses
`CSS.escape(target)`:

```ts
    const row = root.querySelector(`umbradesktop-settings-row[data-category="${CSS.escape(target)}"]`) as
```

`#renderList` appends the package section:

```ts
  #renderList() {
    return html`
      <div class="list">
        ${UMBRADESKTOP_SETTINGS_CATEGORIES.map(
          (category) => html`
            <umbradesktop-settings-row
              data-category=${category.id}
              headline=${this.localize.term(category.labelKey)}
              detail=${this.localize.term(category.descriptionKey)}
              @click=${() => this.#open({ kind: 'category', category })}>
              <uui-icon slot="lead" class="icon" name=${category.icon}></uui-icon>
            </umbradesktop-settings-row>
          `,
        )}
        ${this._packages.length
          ? html`
              <h4 class="section">${this.localize.term('umbraDesktop_settingsFromPackages')}</h4>
              ${this._packages.map(
                (value) => html`
                  <umbradesktop-settings-row
                    data-category=${`${PACKAGE_ROW_PREFIX}${value.name}`}
                    headline=${value.name}
                    detail=${value.boxes.map((box) => this.localize.string(box.label)).join(', ')}
                    @click=${() => this.#open({ kind: 'package', name: value.name })}>
                    <uui-icon slot="lead" class="icon" name=${PACKAGE_ROW_ICON}></uui-icon>
                  </umbradesktop-settings-row>
                `,
              )}
            `
          : nothing}
      </div>
    `;
  }
```

Rendering a place:

```ts
  /** Package screens by name, kept like category screens so their loaded boxes survive a visit to the list. */
  #packageScreens = new Map<string, HTMLElement & { package?: UmbraDesktopSettingsPackage }>();

  /**
   * A package's screen, handed the package as it stands now so a box that came or went shows.
   * @param name The package name.
   * @returns The screen element.
   */
  #renderPackage(name: string) {
    let screen = this.#packageScreens.get(name);
    if (!screen) {
      screen = document.createElement('umbradesktop-settings-package');
      this.#packageScreens.set(name, screen);
    }
    screen.package = this._packages.find((value) => value.name === name);
    return screen;
  }
```

In `render()`, the heading becomes
`place.kind === 'category' ? this.localize.term(place.category.labelKey) : place.name`, and the body
`place.kind === 'category' ? this.#renderCategory(place.category) : this.#renderPackage(place.name)`.
Add to the styles:

```css
      /* Sets the package rows apart from ours: these are not UmbraDesktop's (design D2). */
      .section {
        margin: var(--uui-size-space-5) 0 var(--uui-size-space-2);
        font-size: var(--uui-type-small-size);
        font-weight: 700;
        color: var(--uui-color-text-alt, var(--uui-color-text));
      }
```

- [ ] **Step 4: Update the `category` doc in `modal-tokens.ts`**

```ts
export interface UmbraDesktopSettingsModalData {
  /**
   * Id of one of the desktop's categories, or the name of a package with settings, to open at.
   * Unknown or absent opens the list. A package name is held until that package's settings arrive,
   * because they are registered after the panel opens.
   */
  category?: string;
}
```

- [ ] **Step 5: Run `settings-modal.test.ts`, expect PASS** (the old cases too).

### Task 6: Phase 1 gate

- [ ] Run `npm run build` and `npm test` in `src/Umbraco.Community.UmbraDesktop`. Both pass.

---

## Phase 2: the global context and the store

### Task 7: Opening settings from code

**Files:**
- Create: `HOST/settings/open-settings.ts`

A two-line wrapper over Umbraco's modal manager, which only works in a booted backoffice; it is
exercised through the seams in Tasks 9 and 11 and in the browser check (Task 19).

- [ ] **Step 1: Write it**

```ts
import { UMBRADESKTOP_SETTINGS_MODAL } from './modal-tokens.js';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * Open Desktop settings, optionally at a category or a package.
 *
 * The one way code opens the panel at a place, so that when settings becomes a window (design D7)
 * this is the function that changes and its callers do not. The taskbar's own cog keeps its own
 * route, because it also has to close the launcher it was clicked in.
 *
 * The panel rejects when it closes (it has no value to return), which is not an error here.
 * @param host The element or controller to open it from. Its contexts are the ones the panel sees.
 * @param category One of the desktop's category ids, or a package name.
 * @returns When the panel has closed.
 */
export async function openDesktopSettings(host: UmbControllerHost, category?: string): Promise<void> {
  await umbOpenModal(host, UMBRADESKTOP_SETTINGS_MODAL, { data: { category } }).catch(() => undefined);
}
```

### Task 8: The generic store

**Files:**
- Create: `HOST/settings/package-store/package-settings-store.ts`
- Test: `HOST/settings/package-store/package-settings-store.test.ts`

This is `ACC/settings/settings.source.ts`'s `AccessoriesSettingsStore`, made generic: the value is
`unknown`, parsed from JSON, and `undefined` when nothing is stored. The rules are unchanged.

- [ ] **Step 1: Write the failing tests** (ported from `ACC/settings/settings.source.test.ts`)

```ts
import { expect } from '@open-wc/testing';
import { UmbraDesktopPackageSettingsStore } from './package-settings-store.js';

/**
 * One package's settings for the signed-in user, kept in one `umbracoUserData` row and held in the
 * page. The rules were Accessories' and are tested here as they were there: the value is undefined
 * until the stored one arrives, a change applies at once and is written in the background, a failed
 * write is kept and reported, a late read does not undo a change, other tabs follow a stored change.
 */

/** A stored document the test controls: what it holds, whether it answers, and when. */
function fakeDocument(stored: string | null = null) {
  const state = { stored, failing: false, writes: [] as string[], gate: undefined as Promise<void> | undefined };
  const document = {
    async read(): Promise<string | null | undefined> {
      if (state.gate) await state.gate;
      return state.failing ? undefined : state.stored;
    },
    async write(value: string): Promise<boolean> {
      state.writes.push(value);
      if (state.failing) return false;
      state.stored = value;
      return true;
    },
  };
  return { document, state };
}

const ON = { screensaver: { enabled: true } };

let channels = 0;
const channel = () => `package-settings-test-${++channels}-${Math.random()}`;

let made: UmbraDesktopPackageSettingsStore[] = [];
afterEach(() => {
  for (const store of made) store.close();
  made = [];
});

function store(document: ReturnType<typeof fakeDocument>['document'], name?: string) {
  const subject = new UmbraDesktopPackageSettingsStore(document, name);
  made.push(subject);
  return subject;
}

it('reads the stored value from the account, parsed', async () => {
  const subject = store(fakeDocument(JSON.stringify(ON)).document);
  await subject.load();
  expect([subject.value, subject.loaded]).to.deep.equal([ON, true]);
});

it('is undefined until the stored value has loaded', async () => {
  let open!: () => void;
  const { document, state } = fakeDocument(JSON.stringify(ON));
  state.gate = new Promise((resolve) => (open = resolve));
  const subject = store(document);
  const loading = subject.load();
  expect([subject.value, subject.loaded]).to.deep.equal([undefined, false]);
  open();
  await loading;
  expect(subject.value).to.deep.equal(ON);
});

it('is undefined, with nothing wrong, when nothing is stored', async () => {
  const subject = store(fakeDocument(null).document);
  await subject.load();
  expect([subject.value, subject.status]).to.deep.equal([undefined, undefined]);
});

it('is undefined, with nothing wrong, when what is stored is not JSON', async () => {
  const subject = store(fakeDocument('{not json').document);
  await subject.load();
  expect([subject.value, subject.status]).to.deep.equal([undefined, undefined]);
});

it('says so when the account could not be read, and reads again on the next load', async () => {
  const { document, state } = fakeDocument(JSON.stringify(ON));
  state.failing = true;
  const subject = store(document);
  await subject.load();
  expect(subject.status).to.equal('unread');
  state.failing = false;
  await subject.load();
  expect([subject.value, subject.status]).to.deep.equal([ON, undefined]);
});

it('tells its subscribers when the stored value arrives', async () => {
  const subject = store(fakeDocument(JSON.stringify(ON)).document);
  const heard: unknown[] = [];
  subject.subscribe((value) => heard.push(value));
  await subject.load();
  expect(heard).to.deep.equal([ON]);
});

it('applies a change at once, and stores it as JSON', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  subject.set(ON);
  expect(subject.value, 'before the save has answered').to.deep.equal(ON);
  await subject.saved();
  expect(state.stored).to.equal(JSON.stringify(ON));
});

it('keeps a change the account refused, says so, and saves it with the next one', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  state.failing = true;
  subject.set(ON);
  await subject.saved();
  expect([subject.value, subject.status]).to.deep.equal([ON, 'unsaved']);
  state.failing = false;
  subject.set({ screensaver: { enabled: false } });
  await subject.saved();
  expect([state.stored, subject.status]).to.deep.equal([JSON.stringify({ screensaver: { enabled: false } }), undefined]);
});

it('does not let a value that arrives late overwrite a change made meanwhile', async () => {
  let open!: () => void;
  const { document, state } = fakeDocument(JSON.stringify(ON));
  state.gate = new Promise((resolve) => (open = resolve));
  const subject = store(document);
  const loading = subject.load();
  subject.set({ mine: true });
  open();
  await loading;
  await subject.saved();
  expect(subject.value).to.deep.equal({ mine: true });
  expect(state.stored).to.equal(JSON.stringify({ mine: true }));
});

it('writes changes in order, and ends on the last one', async () => {
  const { document, state } = fakeDocument();
  const subject = store(document);
  await subject.load();
  for (const n of [1, 2, 5]) subject.set({ n });
  await subject.saved();
  expect(state.stored).to.equal(JSON.stringify({ n: 5 }));
  expect(state.writes.length).to.be.at.most(3);
});

it('tells other tabs about a saved change, and not about a refused one', async () => {
  const name = channel();
  const { document, state } = fakeDocument();
  const here = store(document, name);
  const there = store(fakeDocument().document, name);
  await Promise.all([here.load(), there.load()]);
  const arrived = new Promise<unknown>((resolve) => there.subscribe(resolve));
  here.set(ON);
  expect(await arrived).to.deep.equal(ON);

  let heard = false;
  there.subscribe(() => (heard = true));
  state.failing = true;
  here.set({ refused: true });
  await here.saved();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(heard).to.equal(false);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Copy `AccessoriesSettingsStore` (and its docs) from
  `ACC/settings/settings.source.ts` lines 82–270 into the new file and make these changes:

```ts
/** Why the value on show may not be the one in the user's account. */
export type UmbraDesktopPackageSettingsStatus = 'unread' | 'unsaved';

/** Where a store reads and writes its one row. `UmbraDesktopUserDataRepository` in the backoffice. */
export interface UmbraDesktopPackageSettingsDocument {
  /** The stored string, null when nothing is stored, undefined when the account could not be read. */
  read(): Promise<string | null | undefined>;
  /** Store the string; false when it could not be. */
  write(value: string): Promise<boolean>;
}

/**
 * Parse a stored string. Not JSON, or nothing stored, is `undefined`: the package checks what it
 * reads anyway, because the value may have been written by an older version of itself.
 * @param raw The stored string, or null.
 * @returns The value, or undefined.
 */
function parse(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
```

- the class is `UmbraDesktopPackageSettingsStore`, its document is `UmbraDesktopPackageSettingsDocument`;
- the held state is the stored **string**, `#raw: string | null = null`, plus a cached
  `#value: unknown` set from `parse(#raw)` whenever `#raw` changes; `value` returns `#value`;
- `get loaded(): boolean { return this.#loaded; }` is added;
- `set(next: unknown)` stores `JSON.stringify(next) ?? 'null'` as the pending raw string;
- `#read` applies `raw` (a string or null) instead of `parseSettings(raw)`;
- `#flush` writes the pending raw string and broadcasts it on success;
- `#onBroadcast` accepts a string and applies it;
- `#apply(raw: string | null, always = false)` compares raw strings, so equal JSON is not
  re-announced;
- listeners receive `unknown`.

- [ ] **Step 4: Run, expect PASS.**

### Task 9: The global context

**Files:**
- Create: `HOST/settings/package-settings.context-token.ts`
- Create: `HOST/settings/package-settings.context.ts`
- Modify: `HOST/settings/manifest.ts`
- Test: `HOST/settings/package-settings.context.test.ts`

- [ ] **Step 1: Write the token**

```ts
import type { UmbraDesktopPackageSettingsContext } from './package-settings.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/**
 * The global context packages reach the desktop through (design §5). **The alias is public API**:
 * packages create their own token with this string, since they cannot import this file.
 */
export const UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT = new UmbContextToken<UmbraDesktopPackageSettingsContext>(
  'UmbraDesktop.PackageSettingsContext',
);
```

- [ ] **Step 2: Write the failing tests**

```ts
import { expect } from '@open-wc/testing';
import { UmbraDesktopPackageSettingsContext } from './package-settings.context.js';
import type { UmbraDesktopPackageSettingsDocument } from './package-store/package-settings-store.js';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/** A context whose storage and modal are recorded instead of real. */
class ProbeContext extends UmbraDesktopPackageSettingsContext {
  public documents: string[] = [];
  public opened: Array<[UmbControllerHost, string]> = [];
  protected override _documentFor(key: string): UmbraDesktopPackageSettingsDocument {
    this.documents.push(key);
    return { read: async () => null, write: async () => true };
  }
  protected override _open(host: UmbControllerHost, packageName: string): void {
    this.opened.push([host, packageName]);
  }
}

let hosts: UmbElementControllerHost[] = [];
afterEach(() => {
  for (const host of hosts) host.destroy();
  hosts = [];
});

function context(): ProbeContext {
  const host = new UmbElementControllerHost(document.createElement('div'));
  hosts.push(host);
  return new ProbeContext(host);
}

const desktop = () => new UmbElementControllerHost(document.createElement('div'));

it('hands out one store per key, so every element in the page shares one value', () => {
  const subject = context();
  expect(subject.store('Pkg.Group') === subject.store('Pkg.Group')).to.equal(true);
  expect(subject.documents).to.deep.equal(['Pkg.Group']);
});

it('refuses the desktop’s own group, and an empty key', () => {
  const subject = context();
  expect(subject.store('Umbraco.Community.UmbraDesktop')).to.equal(undefined);
  expect(subject.store(' umbraco.community.umbradesktop ')).to.equal(undefined);
  expect(subject.store('')).to.equal(undefined);
  expect(subject.documents).to.deep.equal([]);
});

it('cannot open settings while no desktop is showing', () => {
  const subject = context();
  expect(subject.openSettings('My Package')).to.equal(false);
  expect(subject.opened).to.deep.equal([]);
});

it('opens settings on the desktop that attached itself, latest first', () => {
  const subject = context();
  const first = desktop();
  const second = desktop();
  subject.attachDesktop(first);
  const detach = subject.attachDesktop(second);
  expect(subject.openSettings('My Package')).to.equal(true);
  expect(subject.opened[0][0] === second).to.equal(true);
  detach();
  subject.openSettings('My Package');
  expect(subject.opened[1][0] === first).to.equal(true);
});
```

- [ ] **Step 3: Run, expect FAIL.**

- [ ] **Step 4: Implement the context**

```ts
import { UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT } from './package-settings.context-token.js';
import { openDesktopSettings } from './open-settings.js';
import { UmbraDesktopPackageSettingsStore } from './package-store/package-settings-store.js';
import type { UmbraDesktopPackageSettingsDocument } from './package-store/package-settings-store.js';
import { UmbraDesktopUserDataRepository } from '../user-data/user-data.repository.js';
import { UmbraDesktopUserDataServerClient } from '../user-data/server.client.js';
import { UMBRADESKTOP_USER_DATA_GROUP } from '../user-data/constants.js';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';

/**
 * The identifier a package's settings row is stored under, inside the package's own group. The one
 * Accessories already used, so it moved onto the store without a migration (design §5).
 */
const PACKAGE_SETTINGS_IDENTIFIER = 'Settings';

/**
 * What packages reach the desktop through (design §5): a per-user store for their settings, and a
 * way to open Desktop settings at their row.
 *
 * Global rather than provided by the desktop element, because code that runs for the desktop's whole
 * life has nowhere to live but a backoffice entry point, outside the desktop element: the Accessories
 * screensaver's idle watcher is one (design D6). It does nothing until asked; no request is made at
 * boot.
 */
export class UmbraDesktopPackageSettingsContext extends UmbContextBase {
  /** One store per key, so every element in the page reads one value. */
  #stores = new Map<string, UmbraDesktopPackageSettingsStore>();

  /** Desktops showing now, latest last. Several exist briefly when Exit builds a new one. */
  #desktops: UmbControllerHost[] = [];

  /** Whether a signed-in user is known; stores load once there is one. */
  #signedIn = false;

  /**
   * @param host The backoffice element Umbraco hosts global contexts on.
   */
  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT);
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
      this.observe(
        context?.unique,
        (unique) => {
          this.#signedIn = !!unique;
          if (unique) for (const store of this.#stores.values()) void store.load();
        },
        'observeCurrentUserUnique',
      );
    });
  }

  /**
   * The signed-in user's settings for a package, shared by every caller in the page.
   * @param key The package's own user-data group, such as `My.Package`. Not the desktop's.
   * @returns The store, or undefined for an empty key or the desktop's own group.
   */
  store(key: string): UmbraDesktopPackageSettingsStore | undefined {
    const trimmed = typeof key === 'string' ? key.trim() : '';
    if (!trimmed || trimmed.toLowerCase() === UMBRADESKTOP_USER_DATA_GROUP.toLowerCase()) {
      console.warn(`[UmbraDesktop] Package settings store "${key}" refused: use your package's own user-data group.`);
      return undefined;
    }
    let store = this.#stores.get(trimmed);
    if (!store) {
      store = new UmbraDesktopPackageSettingsStore(this._documentFor(trimmed), `${trimmed}.${PACKAGE_SETTINGS_IDENTIFIER}`);
      this.#stores.set(trimmed, store);
      if (this.#signedIn) void store.load();
    }
    return store;
  }

  /**
   * Open Desktop settings at a package's row, on the desktop showing now.
   * @param packageName The package's `meta.package`.
   * @returns False when no desktop is showing, and nothing was opened.
   */
  openSettings(packageName: string): boolean {
    const desktop = this.#desktops.at(-1);
    if (!desktop) return false;
    this._open(desktop, packageName);
    return true;
  }

  /**
   * Called by the desktop element when it connects, so `openSettings` has somewhere to open.
   * @param desktop The desktop element.
   * @returns Call it when the desktop disconnects.
   */
  attachDesktop(desktop: UmbControllerHost): () => void {
    this.#desktops.push(desktop);
    return () => {
      this.#desktops = this.#desktops.filter((candidate) => candidate !== desktop);
    };
  }

  /**
   * Where a key's row lives. The seam tests replace, since the real one needs a backoffice.
   * @param key The package's group.
   * @returns The document.
   */
  protected _documentFor(key: string): UmbraDesktopPackageSettingsDocument {
    const repository = new UmbraDesktopUserDataRepository(key, new UmbraDesktopUserDataServerClient(this));
    return {
      read: () => repository.read(PACKAGE_SETTINGS_IDENTIFIER),
      write: (value) => repository.write(PACKAGE_SETTINGS_IDENTIFIER, value),
    };
  }

  /**
   * Open the panel. The seam tests replace, since the modal manager needs a backoffice.
   * @param desktop The desktop element, whose contexts the panel sees.
   * @param packageName The package to open at.
   */
  protected _open(desktop: UmbControllerHost, packageName: string): void {
    void openDesktopSettings(desktop, packageName);
  }

  /** Stop hearing other tabs. */
  override destroy(): void {
    for (const store of this.#stores.values()) store.close();
    this.#stores.clear();
    super.destroy();
  }
}

export default UmbraDesktopPackageSettingsContext;
```

- [ ] **Step 5: Register it** in `HOST/settings/manifest.ts`, appended to `manifests`:

```ts
  {
    // Global so a package's entry point reaches it too (design D6). Created at boot, idle until asked.
    type: 'globalContext',
    alias: 'Umbraco.Community.UmbraDesktop.GlobalContext.PackageSettings',
    name: 'UmbraDesktop Package Settings Context',
    api: () => import('./package-settings.context.js'),
  },
```

- [ ] **Step 6: Run, expect PASS.**

### Task 10: The desktop attaches itself

**Files:**
- Modify: `HOST/components/desktop.element.ts`

Wiring only; covered by the browser check (Task 19), because a bare test page has no global contexts.

- [ ] **Step 1:** import the token and add to the class:

```ts
  /**
   * Takes this desktop off the package settings context. Set while connected, so a package's
   * `openSettings` opens on the desktop the person is looking at (design §5).
   */
  #detachFromPackageSettings?: () => void;
```

In the constructor (after the existing contexts):

```ts
    this.consumeContext(UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT, (context) => {
      this.#detachFromPackageSettings?.();
      this.#detachFromPackageSettings = context?.attachDesktop(this);
    });
```

In `disconnectedCallback`, before `super.disconnectedCallback()`:

```ts
    this.#detachFromPackageSettings?.();
    this.#detachFromPackageSettings = undefined;
```

(Umbraco re-requests contexts when the element reconnects, which attaches it again.)

### Task 11: `meta.opensSettings`

**Files:**
- Modify: `HOST/app.extension.ts`, `HOST/registered-apps.ts`, `HOST/types.ts`, `HOST/derive-apps.ts`,
  `HOST/window-manager.context.ts`
- Test: `HOST/registered-apps.test.ts`, `HOST/derive-apps.test.ts`, `HOST/window-manager.test.ts`

- [ ] **Step 1: Failing tests.** In `registered-apps.test.ts`:

```ts
it('keeps an app that opens settings, with no element of its own', () => {
  const { apps, dropped } = normaliseRegisteredApps([
    manifest({ element: undefined, meta: { label: 'Screen Saver', opensSettings: 'My Package' } }),
  ]);
  expect(dropped).to.deep.equal([]);
  expect(apps[0].opensSettings).to.equal('My Package');
});

it('reports an opensSettings that is not text, and still needs an element then', () => {
  const { apps, ignored, dropped } = normaliseRegisteredApps([
    manifest({ element: undefined, meta: { label: 'x', opensSettings: 7 as unknown as string } }),
  ]);
  expect(apps).to.deep.equal([]);
  expect(ignored.map((i) => i.field)).to.deep.equal(['meta.opensSettings']);
  expect(dropped.length).to.equal(1);
});
```

In `derive-apps.test.ts`:

```ts
it('carries opensSettings through to the derived app', () => {
  const apps = deriveApps([], [], [], [
    { alias: 'Pkg.Shortcut', name: 'Shortcut', icon: 'icon-box', element: async () => ({}), opensSettings: 'My Package' },
  ]);
  expect(apps.find((app) => app.alias === 'Pkg.Shortcut')?.opensSettings).to.equal('My Package');
});
```

(`deriveApps(resolved, permittedSections, excludedSections, registered)`: the registered apps are
the fourth argument.)

In `window-manager.test.ts`, give `ProbeManager` the seam and add:

```ts
  /** Package names settings were opened at, instead of a modal. */
  public settingsOpened: string[] = [];

  protected override _openSettings(packageName: string): void {
    this.settingsOpened.push(packageName);
  }
```

```ts
it('opens settings instead of a window for an app that opens settings', () => {
  const ctx = manager();
  ctx.open({ ...APP, alias: 'shortcut', opensSettings: 'My Package' });
  expect(windowsOf(ctx)).to.have.lengthOf(0);
  expect(ctx.settingsOpened).to.deep.equal(['My Package']);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**

`app.extension.ts`, in `MetaUmbraDesktopApp`:

```ts
  /**
   * A package name: choosing this tile opens Desktop settings at that package's row instead of a
   * window, and `element` is then not needed (design §6). For a tool whose settings moved into
   * Desktop settings, such as the Accessories Screen Saver, so the tile people know still leads there.
   */
  opensSettings?: string;
```

`types.ts`: add `opensSettings?: string;` with a one-line doc to both `UmbraDesktopRegisteredApp`
and `UmbraDesktopApp` ("Open Desktop settings at this package instead of a window").

`registered-apps.ts`, module level:

```ts
/**
 * The element an app that only opens settings is given, since the type wants one. Never loaded: the
 * window manager opens settings before any window exists. One constant, so its identity is stable
 * across recomputes, which the app host relies on.
 */
const SETTINGS_SHORTCUT_ELEMENT = () => Promise.reject(new Error('This app opens Desktop settings, never a window.'));
```

In the loop, move the two existing declarations `const meta = …` and `const read = …` (with its
JSDoc) from below the `if (!manifest.element)` block to above it, unchanged. Then read
`opensSettings` and let it stand in for an element. The block becomes:

```ts
    const opensSettings = read(meta.opensSettings, isNonEmptyString, 'meta.opensSettings');
    // An app that only opens settings has no window, so it needs no element (design §6).
    if (!manifest.element && !opensSettings) {
      dropped.push({
        alias: manifest.alias,
        reason: manifest.js
          ? 'its manifest has no "element" to load: it points at a module through "js", which the desktop does not read. Rename that field to "element"'
          : 'its manifest has no "element" to load, so its window would open empty',
      });
      continue;
    }
```

and in the object pushed to `apps`, `element: manifest.element,` becomes
`element: manifest.element || SETTINGS_SHORTCUT_ELEMENT,` with `opensSettings,` added after
`resizable`.

`derive-apps.ts`, in the registered loop: `opensSettings: app.opensSettings,`.

`window-manager.context.ts`: import `openDesktopSettings` from `./settings/open-settings.js`, and at
the top of `open()`:

```ts
    // Every route to an app comes through here, so this is the one place a tile that opens settings
    // has to be caught: no window is made, so the taskbar, reopen-windows and allowMultiple never see it.
    if (app.opensSettings) {
      this._openSettings(app.opensSettings);
      return;
    }
```

and the seam:

```ts
  /**
   * Open Desktop settings at a package. A seam, like `_askToDiscard`, so tests need no modal manager.
   * @param packageName The package's name.
   */
  protected _openSettings(packageName: string): void {
    void openDesktopSettings(this, packageName);
  }
```

- [ ] **Step 4: Run the three files, expect PASS.**

### Task 12: Phase 2 gate

- [ ] `npm run build` and `npm test` in `src/Umbraco.Community.UmbraDesktop`. Both pass.

---

## Phase 3: Accessories

All paths under `ACC`. Commands from `src/Umbraco.Community.UmbraDesktop.Accessories`.

### Task 13: Hand-copied types

**Files:**
- Modify: `ACC/umbradesktop-app.d.ts`
- Create: `ACC/shared/package-settings.ts`

- [ ] **Step 1:** In `umbradesktop-app.d.ts`, add `opensSettings?: string;` (with its doc line) to
  `MetaUmbraDesktopApp`, and below the docs manifest:

```ts
/** Copy of the host's `MetaUmbraDesktopPackageSettings`. See the top of this file for why it is a copy. */
interface MetaUmbraDesktopPackageSettings {
  /** The package's name, plain text: the row it is shown under. */
  package: string;
  /** The box's heading, a localisation token or a literal. */
  label: string;
}

/** One box of this package's settings in Desktop settings. */
interface ManifestUmbraDesktopPackageSettings extends ManifestElement<HTMLElement>, ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopPackageSettings';
  /** Its package and heading. */
  meta: MetaUmbraDesktopPackageSettings;
}
```

and `umbraDesktopPackageSettings: ManifestUmbraDesktopPackageSettings;` in the global map. Update the
file's opening sentence to name the fourth type.

- [ ] **Step 2:** `shared/package-settings.ts`:

```ts
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/**
 * The desktop's package settings context, as this package uses it: a hand-written copy of the host's
 * contract, for the reason `umbradesktop-app.d.ts` gives. Only the members used here.
 */
export interface UmbraDesktopPackageSettingsStore {
  /** The stored value, parsed; undefined until read or when nothing is stored. */
  readonly value: unknown;
  /** Why the value may not be the stored one. */
  readonly status?: 'unread' | 'unsaved';
  /** Change it: applies at once, stored in the background. */
  set(value: unknown): void;
  /** Be told about changes and status changes. Returns an unsubscribe. */
  subscribe(listener: (value: unknown) => void): () => void;
}

/** The context itself. */
export interface UmbraDesktopPackageSettingsContext {
  /** The signed-in user's settings for a user-data group of this package's. */
  store(key: string): UmbraDesktopPackageSettingsStore | undefined;
  /** Open Desktop settings at a package. False when no desktop is showing. */
  openSettings(packageName: string): boolean;
}

/** The host's token, by its published alias. */
export const UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT = new UmbContextToken<UmbraDesktopPackageSettingsContext>(
  'UmbraDesktop.PackageSettingsContext',
);

/** This package's name in Desktop settings: the row its settings are under. */
export const ACCESSORIES_PACKAGE_NAME = 'UmbraDesktop Accessories';
```

### Task 14: Parse a decoded value

**Files:**
- Modify: `ACC/settings/settings.ts`
- Test: `ACC/settings/settings.test.ts`

- [ ] **Step 1: Failing test**

```ts
it('reads a value the desktop has already decoded, the same way as a stored string', () => {
  const value = { screensaver: { enabled: true, saver: 'mystify', waitMinutes: 5 } };
  expect(parseSettingsValue(value)).to.deep.equal(parseSettings(JSON.stringify(value)));
  expect(parseSettingsValue(undefined)).to.deep.equal(UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS);
  expect(parseSettingsValue('nonsense')).to.deep.equal(UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3:** Split `parseSettings`:

```ts
/**
 * Read settings the desktop's store has already decoded from JSON. Field by field, so one bad value
 * costs only itself, and anything that is not an object is the default.
 * @param decoded The decoded value, or undefined when nothing is stored.
 * @returns Settings that are always usable.
 */
export function parseSettingsValue(decoded: unknown): AccessoriesSettings {
  if (typeof decoded !== 'object' || decoded === null) return UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS;
  const { screensaver } = decoded as { screensaver?: unknown };
  return { screensaver: parseScreensaver(screensaver) };
}
```

and make `parseSettings(raw)` decode then call `parseSettingsValue`.

- [ ] **Step 4: Run, expect PASS.**

### Task 15: The settings source over the host store

**Files:**
- Modify: `ACC/settings/settings.source.ts`
- Replace: `ACC/settings/settings.source.test.ts`
- Modify: `ACC/screensaver/entrypoint.ts`

- [ ] **Step 1: Replace the test file** (the store's own cases moved to the host in Task 8):

```ts
import { expect } from '@open-wc/testing';
import { AccessoriesHostSettings } from './settings.source.js';
import { UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS } from './settings.js';
import type { UmbraDesktopPackageSettingsStore } from '../shared/package-settings.js';

/**
 * The package's settings now live in the desktop's store (design 2026-10-03 §8); this adapter turns
 * its untyped value into `AccessoriesSettings`, so the screensaver never sees a malformed one.
 */

/** A host store the test drives. */
function fakeStore(value: unknown = undefined, status?: 'unread' | 'unsaved') {
  const listeners = new Set<(value: unknown) => void>();
  const store: UmbraDesktopPackageSettingsStore & { emit(next: unknown): void; sets: unknown[] } = {
    value,
    status,
    sets: [],
    set(next) {
      this.sets.push(next);
      (this as { value: unknown }).value = next;
      for (const listener of listeners) listener(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(next) {
      (this as { value: unknown }).value = next;
      for (const listener of listeners) listener(next);
    },
  };
  return store;
}

const ON = { screensaver: { enabled: true, saver: 'mystify', waitMinutes: 5 } } as const;

it('is the default until there is a store, and says nothing is wrong', () => {
  const subject = new AccessoriesHostSettings();
  expect([subject.value, subject.status]).to.deep.equal([UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS, undefined]);
});

it('reads the store’s value as Accessories settings', () => {
  const subject = new AccessoriesHostSettings();
  subject.use(fakeStore(ON));
  expect(subject.value).to.deep.equal(ON);
});

it('falls back field by field when the stored value is malformed', () => {
  const subject = new AccessoriesHostSettings();
  subject.use(fakeStore({ screensaver: { enabled: 'yes', saver: 'mystify' } }));
  expect(subject.value.screensaver).to.deep.equal({ ...UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS.screensaver, saver: 'mystify' });
});

it('passes the store’s status through', () => {
  const subject = new AccessoriesHostSettings();
  subject.use(fakeStore(ON, 'unsaved'));
  expect(subject.status).to.equal('unsaved');
});

it('writes a change to the store', () => {
  const store = fakeStore();
  const subject = new AccessoriesHostSettings();
  subject.use(store);
  subject.set(ON);
  expect(store.sets).to.deep.equal([ON]);
});

it('tells its subscribers when the store changes, and when it gets a store', () => {
  const store = fakeStore();
  const subject = new AccessoriesHostSettings();
  const heard: unknown[] = [];
  subject.subscribe((value) => heard.push(value.screensaver.enabled));
  subject.use(store);
  store.emit(ON);
  expect(heard).to.deep.equal([false, true]);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Rewrite `settings.source.ts`.** Keep `AccessoriesSettingsStatus`,
  `AccessoriesSettingsSource` and `fixedSettings` exactly as they are. Delete
  `AccessoriesSettingsStore`, `ACCESSORIES_SETTINGS_CHANNEL`, `AccessoriesSettingsDocument`,
  `sharedSettingsStore`, `releaseSharedSettingsStore` and the `SETTINGS_IDENTIFIER` constant, and the
  imports only they used. Add:

```ts
/**
 * Accessories' settings, kept in the desktop's per-user store under this package's own user-data
 * group: the same row they were in before the store moved into the desktop, so nothing was migrated
 * (design 2026-10-03 §8). Turns the store's untyped value into `AccessoriesSettings` on every read,
 * so a malformed or older value can never reach the screensaver.
 *
 * Plain, with the store handed to {@link use}, so it can be tested without a backoffice; the
 * controller below finds the store.
 */
export class AccessoriesHostSettings implements AccessoriesSettingsSource {
  /** The desktop's store, once found. */
  #store?: UmbraDesktopPackageSettingsStore;

  /** Stops listening to it. */
  #unsubscribe?: () => void;

  /** Who is told about a change. */
  #listeners = new Set<(value: AccessoriesSettings) => void>();

  /** The last value read, and the raw value it was read from, so a read parses once per change. */
  #cache?: { raw: unknown; value: AccessoriesSettings };

  /**
   * Start reading from a store, or stop with undefined.
   * @param store The desktop's store for this package.
   */
  use(store: UmbraDesktopPackageSettingsStore | undefined): void {
    this.#unsubscribe?.();
    this.#store = store;
    this.#unsubscribe = store?.subscribe(() => this.#notify());
    this.#notify();
  }

  /** @inheritdoc */
  get value(): AccessoriesSettings {
    const raw = this.#store?.value;
    if (this.#cache?.raw !== raw || !this.#cache) this.#cache = { raw, value: parseSettingsValue(raw) };
    return this.#cache.value;
  }

  /** @inheritdoc */
  get status(): AccessoriesSettingsStatus | undefined {
    return this.#store?.status;
  }

  /** @inheritdoc */
  set(next: AccessoriesSettings): void {
    this.#store?.set(next);
  }

  /** @inheritdoc */
  subscribe(listener: (value: AccessoriesSettings) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stop listening to the store. */
  close(): void {
    this.use(undefined);
  }

  /** Tell every listener the settings as they stand. */
  #notify(): void {
    const value = this.value;
    for (const listener of this.#listeners) listener(value);
  }
}
```

Replace `UmbraDesktopAccessoriesSettingsController` with:

```ts
/**
 * The settings of the signed-in user, for an element or an entry point: finds the desktop's package
 * settings context and reads through {@link AccessoriesHostSettings}. The context is global, so an
 * entry point outside the desktop reaches it as well as a window or a settings box does.
 */
export class UmbraDesktopAccessoriesSettingsController
  extends UmbControllerBase
  implements AccessoriesSettingsSource
{
  /** The adapter that does the work. */
  #settings = new AccessoriesHostSettings();

  /**
   * @param host The element or entry point host whose lifetime this follows.
   */
  constructor(host: UmbControllerHost) {
    super(host);
    this.consumeContext(UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT, (context) => {
      this.#settings.use(context?.store(ACCESSORIES_USER_DATA_GROUP));
    });
  }

  /** @inheritdoc */
  get value(): AccessoriesSettings {
    return this.#settings.value;
  }

  /** @inheritdoc */
  get status(): AccessoriesSettingsStatus | undefined {
    return this.#settings.status;
  }

  /** @inheritdoc */
  set(next: AccessoriesSettings): void {
    this.#settings.set(next);
  }

  /** @inheritdoc */
  subscribe(listener: (value: AccessoriesSettings) => void): () => void {
    return this.#settings.subscribe(listener);
  }

  /** Stop listening to the store with the host. */
  override destroy(): void {
    this.#settings.close();
    super.destroy();
  }
}
```

Imports: `parseSettingsValue` from `./settings.js`, `ACCESSORIES_USER_DATA_GROUP` from
`../shared/user-data.js`, `UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT` and the store type from
`../shared/package-settings.js`.

- [ ] **Step 4:** In `screensaver/entrypoint.ts`, remove `releaseSharedSettingsStore` and its call;
  the store belongs to the desktop now.

- [ ] **Step 5: Run `settings.source.test.ts`, `screensaver-panel.element.test.ts` and
  `watcher.test.ts`, expect PASS** (the last two hand in `fixedSettings`, which is unchanged).

### Task 16: The screensaver box and the Screen Saver tile

**Files:**
- Modify: `ACC/bundle.manifests.ts`, `ACC/bundle.manifests.test.ts`
- Modify: `ACC/screensaver/screensaver-panel.element.ts`, `ACC/localization/en.ts`, `ACC/localization/nl.ts`

- [ ] **Step 1: Failing tests** in `bundle.manifests.test.ts`. Remove `ScreenSaver` from `EXPECTED`
  (it has no sizes any more) and from any loop over sizes, keep it in the launcher order check, and
  add:

```ts
it('registers the screensaver as a box under the package’s own row in Desktop settings', () => {
  const boxes = manifests.filter((manifest) => manifest.type === 'umbraDesktopPackageSettings') as unknown as Array<{
    alias: string;
    element?: unknown;
    meta: { package: string; label: string };
  }>;
  expect(boxes.map((box) => [box.alias, box.meta.package, box.meta.label])).to.deep.equal([
    ['Umbraco.Community.UmbraDesktop.Accessories.Settings.Screensaver', 'UmbraDesktop Accessories', '#umbraDesktopAccessories_screensaver'],
  ]);
  expect(typeof boxes[0].element).to.equal('function');
});

it('keeps the Screen Saver tile, opening Desktop settings instead of a window', () => {
  const tile = apps.find((app) => app.alias.endsWith('.ScreenSaver')) as unknown as {
    element?: unknown;
    meta: { opensSettings?: string };
  };
  expect(tile.meta.opensSettings).to.equal('UmbraDesktop Accessories');
  expect(tile.element).to.equal(undefined);
});
```

(Add `opensSettings?: string` to the test's `App.meta` interface.)

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3:** In `bundle.manifests.ts`, replace the `accessory('ScreenSaver', …)` call with:

```ts
  // Last, as Windows kept it apart from the tools, under Display. Its settings live in Desktop
  // settings now, under this package's row; the tile stays where people know it and opens them there.
  {
    type: 'umbraDesktopApp',
    alias: `${ALIAS}.ScreenSaver`,
    name: 'ScreenSaver',
    weight: 600,
    meta: {
      label: `#${AREA}_screensaver`,
      icon: 'icon-display',
      group: 'accessories',
      opensSettings: ACCESSORIES_PACKAGE_NAME,
    },
  } as UmbExtensionManifest,
```

and add, beside the entry point:

```ts
/**
 * The screensaver's settings, as a box under this package's row in Desktop settings. The watcher
 * reads the same settings from the entry point below.
 */
const screensaverSettings: UmbExtensionManifest = {
  type: 'umbraDesktopPackageSettings',
  alias: `${ALIAS}.Settings.Screensaver`,
  name: 'Accessories screensaver settings',
  element: () => import('./screensaver/screensaver-panel.element.js'),
  meta: { package: ACCESSORIES_PACKAGE_NAME, label: `#${AREA}_screensaver` },
};
```

and include `screensaverSettings` in the exported `manifests`. Remove the now unused
`SCREENSAVER_WINDOW` import if nothing else uses it (the panel still uses its `screen` and `monitor`).

- [ ] **Step 4:** In `screensaver-panel.element.ts`, the class doc's first two paragraphs become:

```ts
/**
 * The screen saver's settings, as a box in Desktop settings under UmbraDesktop Accessories: Windows
 * 98's Screen Saver tab, one control for one control. A monitor running the chosen saver, the list of
 * savers with (None) at the top, "Wait _ minutes", and a Preview button that runs it full screen.
 *
 * Like every other setting on the desktop there is no OK or Apply: a choice applies the moment it is
 * made, and the idle watcher follows it without being told. It is stored in the user's account
 * through the desktop's package settings store; while a save has not gone through, the hint line
 * says so.
```

and `:host` loses its own padding (the box has its own), keeping the gap:

```css
      :host {
        gap: ${SCREENSAVER_PADDING_PX}px;
        align-items: center;
      }
```

- [ ] **Step 5:** `screensaverUnread` in `en.ts` and `nl.ts` no longer talks about a window:

```ts
    screensaverUnread: 'Your saved choice could not be read, so this shows the default. Close Desktop settings and open them again to retry.',
```

```ts
    screensaverUnread: 'Je opgeslagen keuze kon niet worden gelezen, dus dit is de standaard. Sluit de bureaubladinstellingen en open ze opnieuw om het nog eens te proberen.',
```

- [ ] **Step 6: Run `bundle.manifests.test.ts` and `screensaver-panel.element.test.ts`, expect PASS.**
  If the panel test asserts on `:host` padding or on the old hint text, update those assertions to
  the new values.

### Task 17: Phase 3 gate

- [ ] `npm run build` and `npm test` in `src/Umbraco.Community.UmbraDesktop.Accessories`, then again in
  the host. All pass.

---

## Phase 4: docs and verification

### Task 18: Documentation

Follow `docs/developer/writing-documentation.md`: front matter with a stable `id`, relative links,
procedures as commands with the goal first, UI labels in bold taken from the en localization.

- [ ] **Step 1: `docs/developer/package-settings.md`** (new, `id: package-settings`,
  `sidebar_position: 6`). Sections:
  1. *When to use it*: your package has settings for what it adds to the desktop. One row per package,
     below ours; boxes, not categories; nothing inside our categories, with the reason.
  2. *The manifest*: the §3 example and field table from the design, a static `umbraco-package.json`
     version with `"element": "/App_Plugins/My.Package/settings.js"`, and the hand-copy block for
     `ManifestUmbraDesktopPackageSettings` (point at `desktop-apps.md` for why it is copied).
  3. *Your element*: a content box, about 360px wide up to a full window; no modal assumptions (no
     close button, no `UMB_MODAL_CONTEXT`); paint with the app tokens and a `uui` fallback for each,
     as `desktop-apps.md` §4 describes, so the box looks right in today's backoffice-styled panel and
     in a themed settings window later (design §7.10); any link needs
     `data-router-slot="disabled"`; only Umbraco's contexts and ours are contract.
  4. *Storing settings*: the store, with a 20-line example (create a token with
     `'UmbraDesktop.PackageSettingsContext'`, `store('My.Package')`, read `value` defensively,
     `set`, `subscribe`, show `status`); per user only; your own group, never the desktop's; or skip
     it and use Umbraco's `UserDataService` or your own API.
  5. *Opening your settings*: `openSettings('My Package')` from your own screens, false when no desktop
     is showing; and `meta.opensSettings` for a tile.
  6. *What the console tells you*: every report from Task 2.
  7. *Limitations*: design §7, in the guide's voice.
- [ ] **Step 2:** `docs/developer/README.md`: a bullet after Package catalogues, and a row in the design
  table for `2026-10-03-package-settings-design.md`.
- [ ] **Step 3:** `docs/developer/desktop-apps.md` §2 field table: a row for `meta.opensSettings`
  linking to the new page.
- [ ] **Step 4:** `docs/user/settings/desktop-settings.md`: after the table, a short paragraph: other
  packages' settings appear under **From other packages**, one row per package, and the screen says
  which package they come from.
- [ ] **Step 5:** `src/Umbraco.Community.UmbraDesktop.Accessories/docs/user/screen-saver.md`: the
  settings are in Desktop settings under **UmbraDesktop Accessories**; the **Screen Saver** tile opens
  them there. Rewrite the opening sentence that calls it a window.
- [ ] **Step 6:** Check the Accessories `README.md` for a sentence calling Screen Saver a window and fix
  it if present (one line at most). Host README and both marketplace files: no change.
- [ ] **Step 7:** `npm run docs:check` in the host. Passes.

### Task 19: Run it in a real backoffice

Use the worktree test instance recipe (memory: DB copy per task, `npm run build` before
`dotnet build`, revert the TestInstance lock-file bump; browse on `<task>.localhost:<port>`).

- [ ] **Step 1:** With the **current release** of Accessories, set a screensaver (Mystify, 5 minutes).
  Then build this branch and reload. Desktop settings shows **From other packages** with
  **UmbraDesktop Accessories**, its screen shows the attribution line and a **Screen Saver** box with
  Mystify and 5 minutes. That proves no migration was needed.
- [ ] **Step 2:** Change the wait in the box; leave the desktop idle; the screensaver starts after the
  new wait (the watcher reads through the global context from its entry point).
- [ ] **Step 3:** Select the **Screen Saver** tile in the launcher: settings opens at the Accessories
  screen and no window appears; pin it to the taskbar and select it there: same.
- [ ] **Step 4:** Two tabs: change the saver in one, the other's box follows.
- [ ] **Step 5:** Narrow the panel's content check: at the 500px sidebar the box fits with no
  horizontal scroll.
- [ ] **Step 6:** Screenshot the list and the Accessories screen and show them to the repository owner
  for a visual review before calling it done (UI changes are reviewed visually here).

### Task 20: Wrap up

- [ ] Update the design doc's **Status** line to "Built and verified 2026-MM-DD", and add a section for
  anything the build or the browser run taught that is not obvious from the code.
- [ ] Final `npm run build` and `npm test` in the host and Accessories.
- [ ] Report the changed files to the repository owner. **Do not commit.**
