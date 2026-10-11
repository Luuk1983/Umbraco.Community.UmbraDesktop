> **Superseded, 2026-09-30:** the data source and the window this plan builds were replaced by v2. See [2026-09-30-umbracoffee-v2-plan.md](2026-09-30-umbracoffee-v2-plan.md). The host tasks (tray, tray context, toasts with buttons) still describe what shipped.

# umbraCoffee on the desktop — Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** an umbraCoffee app in the Entertainment package that shows the stream and its chat when the
show is live, a countdown when it is coming up and the latest episodes otherwise, with a tray cup and
two reminders per episode, all driven by what YouTube actually publishes.

**Architecture:** three host changes land first, because the app sits on them: the taskbar gains a
tray container every theme styles (D16), packages can register `umbraDesktopTrayItem` manifests that
become tray features ordered by appearance (D9, D14) behind a small public `UmbraDesktopTrayContext`,
and a desktop toast draws the element of a notification the desktop raised itself (D15). Then
Entertainment gets its first server code (a keyless YouTube reader with a five-minute cache and a
"stale, never wrong" rule, D2 to D5) and the client: one store per desktop, a pure module that decides
what to show and when to remind, the window, the cup and the reminder element.

**Tech stack:** TypeScript, Lit, the Umbraco 17 backoffice extension registry, web-test-runner with
`@open-wc/testing` in a real Chrome, Vite; C# on .NET 10 with xUnit and `FakeTimeProvider`.

**Spec:** [2026-09-27-umbracoffee-design.md](2026-09-27-umbracoffee-design.md). Decision numbers
(D1 to D16) and section numbers below are that document's.

**Sequencing:** Part A (host) before Part C (client), because the client consumes the tray manifest,
the tray context and the toast change. Part B (server) is independent and can run beside Part A.
Nothing here touches [PR #88](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/pull/88);
where a task would like something #88 adds, it says so and uses what is on `main`.

---

## Rules that override the skill's defaults

- **No commits, no pushes.** The owner reviews one diff. Every task ends by running its checks, not by
  committing. Offer a commit at the very end as a question.
- **Both gates, always.** `npm run build` and `npm test` in every package a task touched; `dotnet test`
  for every C# project it touched. The test runner does not type-check and `tsc` renders nothing.
- **Tests first.** Write the failing test, run it, see it fail for the reason you expect, then write
  the code.
- **JSDoc and XML docs on everything**, private members included, saying why the code exists. Match
  the density of the file you are in. In C#, primary constructors, `var`, and `record` unless a type
  needs mutable state (the service does, and says so).
- **Derive, never retype.** A value two files need is one exported constant.
- **A theme may restyle, never remove.** An empty tray must look exactly like today's clock.
- **Prose for the owner** (docs, README): short and plain, no em-dashes.

## Commands

Host, from `src/Umbraco.Community.UmbraDesktop`: `npm run build` and `npm test`.
One host test file, from `src/Umbraco.Community.UmbraDesktop/backoffice`:

```bash
npx web-test-runner "src/desktop/taskbar/tray/tray-order.test.ts" --node-resolve
```

Entertainment, from `src/Umbraco.Community.UmbraDesktop.Entertainment`: `npm run build` and
`npm test`. One file: `cd backoffice && npx web-test-runner "src/umbracoffee/schedule.test.ts" --node-resolve`.

C#, from the repository root:

```bash
dotnet test src/Umbraco.Community.UmbraDesktop.Entertainment.Tests/Umbraco.Community.UmbraDesktop.Entertainment.Tests.csproj
```

## Who does what

Under about twenty lines across files you can already name is done inline; a subagent is for a unit
with its own tests. Subagent-sized: Tasks 1, 4, 7, 9, 10, 13, 15, 16. Inline: 2, 3, 5, 6, 8, 11, 12,
14, 17. Task 18 is the browser pass and Task 19 a reviewer.

---

## File map

**Host** (`src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/`):

| File | New? | Responsibility |
|---|---|---|
| `components/taskbar.element.ts` | modify | Renders `.tray`: package items, host tray features, clock |
| `theme/themes/{win98,umbraco4,win11,macos}/taskbar.css.ts` | modify | Move the well/push/separator from `.clock` to `.tray` |
| `theme/themes/*/taskbar.test.ts` | modify | The well is on `.tray`; an empty tray is the old clock box |
| `tray.extension.ts` | new | The published `umbraDesktopTrayItem` manifest type |
| `taskbar/tray/tray-items.ts` | new | Validates tray manifests, pure, never throws |
| `taskbar/tray/tray-order.ts` | new | Order by appearance (D14), pure |
| `taskbar/tray/tray.context.ts`, `tray.context-token.ts` | new | Public context: items, `openApp`, `setTrayItemEnabled` |
| `taskbar/tray/tray-items.controller.ts` | new | Loads item elements, watches `hidden`, applies order |
| `taskbar/features/enabled.ts` | modify | `isFeatureEnabled` takes `{ id, defaultEnabled }` |
| `settings/categories/taskbar/taskbar.element.ts` | modify | Package items under the tray heading |
| `components/desktop.element.ts` | modify | Provides the tray context; keeps the catalogue as a field |
| `components/desktop-toasts.element.ts` | modify | Draws a desktop-sourced notification's own element (D15) |
| `notifications/notification-centre.context.ts` | modify | Scrollback click on such an entry shows it again as a desktop toast |
| `docs/desktop-apps.md` (repo root docs) | modify | Tray items and the tray context |

**Entertainment server** (`src/Umbraco.Community.UmbraDesktop.Entertainment/`):

| File | Responsibility |
|---|---|
| `UmbraCoffee/UmbraCoffeeParser.cs` | Feed XML and watch-page player response to plain records. No I/O |
| `UmbraCoffee/UmbraCoffeeModels.cs` | The records the parser and service hand out |
| `UmbraCoffee/UmbraCoffeeService.cs` | Fetch, classify, cache five minutes, stale on failure |
| `Api/UmbraCoffeeController.cs` | `GET /umbraco/management/api/v1/umbracoffee` |
| `Composing/UmbraCoffeeComposer.cs` | Registers the named HttpClient and the service |

**Entertainment tests** (`src/Umbraco.Community.UmbraDesktop.Entertainment.Tests/`), new project.
`UmbraCoffee/Fixtures/` already holds four captures from 2026-09-27: `feed-umbracoffee.xml`,
`feed-nasa.xml`, `player-upcoming-nasa.html` (NASA's stream scheduled 2026-09-28 19:00 UTC, the only
real upcoming page we have) and `player-ended-umbracoffee.html` (September's episode). The two HTML
files are the page's real `ytInitialPlayerResponse` JSON in a minimal wrapper, 13 KB and 39 KB instead
of 1.2 MB. Do not recapture the NASA one: after its start time it is no longer upcoming.

**Entertainment client** (`src/Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/`):

| File | Responsibility |
|---|---|
| `umbradesktop-app.d.ts` | Adds the local copy of the tray manifest type |
| `umbracoffee/types.ts` | Endpoint response types and a runtime guard |
| `umbracoffee/constants.ts` | App alias, endpoint path, window sizes, poll interval, reminder lead |
| `umbracoffee/schedule.ts` | What to show, the cup's state, which reminders are due. Pure |
| `umbracoffee/reminder-record.ts` | Which reminders this browser has shown, in `localStorage` |
| `umbracoffee/store.ts` | One poller per desktop, shared by cup and windows |
| `umbracoffee/tray-context.ts` | Local token and interface for the host's `UmbraDesktopTrayContext` |
| `umbracoffee/umbracoffee.element.ts` | The window |
| `umbracoffee/tray-cup.element.ts` | The tray item; also raises the reminders |
| `umbracoffee/reminder-notification.element.ts` | The reminder, with Watch and Stop reminding me |
| `bundle.manifests.ts` | Media group, app, tray item |
| `localization/en.ts`, `nl.ts` | Strings |

---

# Part A — Host

### Task 1: A tray that exists (D16)

**Files:**
- Modify: `components/taskbar.element.ts` (render and base styles)
- Modify: `theme/themes/win98/taskbar.css.ts`, `umbraco4/taskbar.css.ts`, `win11/taskbar.css.ts`, `macos/taskbar.css.ts`
- Test: `theme/themes/win98/taskbar.test.ts`, `umbraco4/taskbar.test.ts`, `win11/taskbar.test.ts`, `macos/taskbar.test.ts`, and a new `components/taskbar-tray.test.ts`

Today `.clock` is the whole tray: Windows 98 and Umbraco 4 draw the well on it, Windows 11 pushes it
right with `margin-left: auto`, macOS hangs the dock's second separator on it. Each of those moves to a
new `.tray` wrapper. The clock keeps its own padding, font and hover, so a tray holding only the clock
has exactly the old box.

- [ ] **Step 1: Write the failing base test**

Create `components/taskbar-tray.test.ts`. Follow the mounting helper the theme tests use
(`theme/themes/mount-themed.ts`); read one of them first and mount the same way.

```ts
import { expect } from '@open-wc/testing';
import { mountThemedTaskbar } from '../theme/themes/mount-themed.js';

it('wraps the clock in a tray, clock last', async () => {
  const bar = await mountThemedTaskbar('umbraco');
  const tray = bar.root.querySelector('.bar > .tray');
  expect(tray, 'the taskbar should render a tray container').to.not.equal(null);
  expect(tray!.lastElementChild?.classList.contains('clock'), 'the clock is the last thing in the tray').to.equal(true);
});

it('hides a tray child that carries hidden, whatever its own display says', async () => {
  const bar = await mountThemedTaskbar('umbraco');
  const tray = bar.root.querySelector('.tray') as HTMLElement;
  const item = document.createElement('span');
  item.style.display = 'inline-flex';
  item.hidden = true;
  tray.prepend(item);
  expect(getComputedStyle(item).display).to.equal('none');
});
```

If `mount-themed.ts` exports a differently named helper, use that name here and in every later test.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx web-test-runner "src/desktop/components/taskbar-tray.test.ts" --node-resolve`
Expected: FAIL, "the taskbar should render a tray container".

- [ ] **Step 3: Render the tray**

In `taskbar.element.ts`, replace `${this.#renderClock()}` in `render()` with `${this.#renderTray()}`
and add:

```ts
  /**
   * The system tray: package tray items, then the host's own tray features, then the clock nearest
   * the corner. Windows lays its corner out the same way, clock and notifications at the edge, quick
   * settings next, everything else beyond (design D14).
   *
   * One box for all of it because every theme that draws a tray draws one box: Windows 98's sunken
   * well holds the icons and the time together, and a well around the clock alone would leave the
   * icons outside it. An empty tray renders the clock alone, and must look exactly like the clock did
   * before the tray existed.
   * @returns The tray's template.
   */
  #renderTray() {
    const context = this.#featureContext;
    const host = taskbarRowFeatures('tray', this._features, context).flatMap((feature) => feature.render(context));
    return html`<div class="tray">${this.#trayItems.elements}${host}${this.#renderClock()}</div>`;
  }
```

`this.#trayItems` arrives in Task 4. For this task add a stand-in field so it compiles:
`#trayItems = { elements: [] as HTMLElement[] };` with a JSDoc line saying Task 4 replaces it.

Add to the base styles, before the `.clock` rule:

```css
      /* The tray: package items, host tray features, then the clock. It owns the tray's box so a
         theme can draw one well around all of it; the clock keeps its own padding and hover, which
         is what makes a tray holding only the clock the same box the clock used to be. */
      .tray {
        flex-shrink: 0;
        display: flex;
        align-items: stretch;
        align-self: stretch;
        gap: var(--umbradesktop-tray-gap, var(--uui-size-space-1));
      }
      /* A tray item says it has nothing to show by setting 'hidden' on itself. A Lit element's
         ':host { display: ... }' outranks the UA's '[hidden]', so this has to insist. */
      .tray > [hidden] {
        display: none !important;
      }
```

- [ ] **Step 4: Run it and watch it pass**

Same command. Expected: PASS.

- [ ] **Step 5: Change each theme test to find the tray, and add the empty-tray invariant**

In each of the four theme tests, the assertions that read the well, the push or the separator off
`.clock` move to `.tray` (for example Umbraco 4's "the tray is a white well" now reads
`getComputedStyle(tray).backgroundColor`). Then add, per theme:

```ts
it('draws an empty tray as exactly the clock', async () => {
  const bar = await mountThemedTaskbar('<theme id>');
  const tray = bar.root.querySelector('.tray') as HTMLElement;
  const clock = bar.root.querySelector('.clock') as HTMLElement;
  const t = tray.getBoundingClientRect();
  const c = clock.getBoundingClientRect();
  expect(t.width - c.width, 'no padding of its own around the clock').to.be.at.most(<border allowance>);
  expect(t.right).to.be.closeTo(c.right + <right edge allowance>, 0.5);
});
```

The allowances are derived, not typed: Windows 98's is the bevel width already exported beside
`WIN98_BEVEL_SUNKEN`, Umbraco 4's is its 1px border on each side, macOS's is the separator's 1px plus
the padding moved off the clock (below), Windows 11's is zero. If a constant does not exist yet, add
it to that theme's metrics file and use it in both the CSS and the test.

- [ ] **Step 6: Run the theme tests and watch them fail**

Run: `npx web-test-runner "src/desktop/theme/themes/*/taskbar.test.ts" --node-resolve`
Expected: FAIL on the moved assertions.

- [ ] **Step 7: Move the rules**

`win98/taskbar.css.ts`: move `margin-left: ${WIN98_TASKBAR_PADDING}px` and
`box-shadow: ${unsafeCSS(WIN98_BEVEL_SUNKEN)}` from `.clock` to a new `.tray` rule, add
`align-items: center` there, and leave `.clock` its padding, font size and opacity. Update the comment:
the sunken well is the tray, and in Windows 98 the icons sat in it beside the time.

`umbraco4/taskbar.css.ts`: move `margin-left`, `border`, `border-radius`, `background` and
`box-shadow` to `.tray`, with `align-items: center`. `.clock` keeps padding, font size, opacity.

`win11/taskbar.css.ts`: move `margin-left: auto`, `position: relative` and `z-index: 1` to `.tray`.
`.clock` keeps padding, font size, opacity.

`macos/taskbar.css.ts`: move `align-self: center`, `height: ${MACOS_DOCK_ICON}px` and
`border-left: 1px solid ${unsafeCSS(MACOS_DOCK_SEPARATOR)}` to `.tray`, with `align-items: center` and
`padding-left: 6px`; change `.clock` padding to `0 4px`. The sum is the old `0 4px 0 10px`, so the
empty tray is the same box. Keep the comment about there being no original to be accurate to.

Umbraco (the default theme) has no clock rule and needs nothing.

- [ ] **Step 8: Run both gates**

`npm run build` and `npm test` in the host. Expected: both green.

---

### Task 2: The `umbraDesktopTrayItem` manifest and its validator

**Files:**
- Create: `tray.extension.ts`
- Create: `taskbar/tray/tray-items.ts`
- Test: `taskbar/tray/tray-items.test.ts`

- [ ] **Step 1: Write the manifest type**

```ts
import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * What a `umbraDesktopTrayItem` manifest carries beyond the extension basics.
 *
 * No weight, on purpose (design D14): package items sit in the order they appeared, the way Windows
 * adds a tray icon at the far end when its program starts, so no package can claim a place nearer the
 * clock than one that was there first.
 */
export interface MetaUmbraDesktopTrayItem {
  /** The switch's name in Desktop settings. A localisation token (`#area_key`) or a literal. */
  label: string;
  /** The line under that switch: what the item puts in the tray. A token or a literal. */
  description: string;
  /** Whether the item is on for a user who has never said otherwise. Defaults to true. */
  defaultEnabled?: boolean;
}

/**
 * An icon in the taskbar's system tray, registered by any package (design §7).
 *
 * The element is drawn in the tray while the user has the item switched on, and sets `hidden` on
 * itself while it has nothing to show. Its alias is also the key its on/off choice is stored under,
 * so it must never change.
 */
export interface ManifestUmbraDesktopTrayItem extends ManifestElement<HTMLElement>, ManifestWithDynamicConditions {
  type: 'umbraDesktopTrayItem';
  meta: MetaUmbraDesktopTrayItem;
}

declare global {
  /** Registers the type with Umbraco's manifest map, as `app.extension.ts` does for apps. */
  interface UmbExtensionManifestMap {
    umbraDesktopTrayItem: ManifestUmbraDesktopTrayItem;
  }
}
```

- [ ] **Step 2: Write the failing validator tests**

```ts
import { expect } from '@open-wc/testing';
import { normaliseTrayItems } from './tray-items.js';
import type { ManifestUmbraDesktopTrayItem } from '../../tray.extension.js';

const valid = (over: Partial<ManifestUmbraDesktopTrayItem> = {}): ManifestUmbraDesktopTrayItem => ({
  type: 'umbraDesktopTrayItem',
  alias: 'My.Tray',
  name: 'My tray',
  element: () => Promise.resolve({} as never),
  meta: { label: '#my_label', description: '#my_about' },
  ...over,
});

it('keeps a valid item, defaulting it on', () => {
  const { items, dropped } = normaliseTrayItems([valid()]);
  expect(dropped).to.deep.equal([]);
  expect(items).to.have.length(1);
  expect(items[0].alias).to.equal('My.Tray');
  expect(items[0].defaultEnabled).to.equal(true);
});

it('honours defaultEnabled: false', () => {
  const { items } = normaliseTrayItems([valid({ meta: { label: 'L', description: 'D', defaultEnabled: false } })]);
  expect(items[0].defaultEnabled).to.equal(false);
});

it('drops an item with no element, saying why', () => {
  const { items, dropped } = normaliseTrayItems([valid({ element: undefined })]);
  expect(items).to.deep.equal([]);
  expect(dropped[0].alias).to.equal('My.Tray');
  expect(dropped[0].reason).to.contain('element');
});

it('drops an item without a label or description', () => {
  const noLabel = valid({ meta: { description: 'D' } as never });
  const noAbout = valid({ alias: 'B', meta: { label: 'L' } as never });
  expect(normaliseTrayItems([noLabel, noAbout]).items).to.deep.equal([]);
});

it('drops an item whose alias is a host feature id, which would share its stored switch', () => {
  const { items, dropped } = normaliseTrayItems([valid({ alias: 'fullscreen' })]);
  expect(items).to.deep.equal([]);
  expect(dropped[0].reason).to.contain('fullscreen');
});

it('keeps the first of two items with one alias', () => {
  const { items } = normaliseTrayItems([valid(), valid({ name: 'Second' })]);
  expect(items).to.have.length(1);
});

it('never throws on junk', () => {
  expect(() => normaliseTrayItems([null as never, { meta: 5 } as never])).to.not.throw();
});
```

- [ ] **Step 3: Run and watch them fail**

Run: `npx web-test-runner "src/desktop/taskbar/tray/tray-items.test.ts" --node-resolve`
Expected: FAIL, module not found.

- [ ] **Step 4: Write the validator**

```ts
import type { ManifestUmbraDesktopTrayItem } from '../../tray.extension';
import { UMBRADESKTOP_TASKBAR_FEATURES } from '../features/index.js';
import { isBoolean, isNonEmptyString, isRecord } from '../../manifest-values.js';

/**
 * A package's tray item, reduced to what the tray and Desktop settings need.
 *
 * Plain data plus the manifest by reference: the manifest is what `createExtensionElement` loads, and
 * passing it through unexamined leaves telling its element forms apart to Umbraco, as
 * `registered-apps.ts` explains for apps.
 */
export interface UmbraDesktopTrayItem {
  /** The manifest alias. Also the key the user's on/off choice is stored under. */
  alias: string;
  /** Switch name, a `#token` or a literal. */
  label: string;
  /** Switch description, a `#token` or a literal. */
  description: string;
  /** Whether it is on before the user says otherwise. */
  defaultEnabled: boolean;
  /** The manifest, for loading the element. */
  manifest: ManifestUmbraDesktopTrayItem;
}

/** One manifest this pass refused, and why, as a phrase completing "…was dropped because …". */
export interface UmbraDesktopDroppedTrayItem {
  /** The manifest alias, or `(no alias)`. */
  alias: string;
  /** Why. */
  reason: string;
}

/**
 * Validate condition-evaluated tray manifests, which a static `umbraco-package.json` can get wrong in
 * any field. Pure and never throws, like `normaliseRegisteredApps`: one throw during a registry
 * emission would stop the tray updating for everyone on the install.
 *
 * An alias equal to a host feature id is refused, because the two would share one stored switch and
 * turning either off would turn off both.
 * @param manifests The permitted manifests, in registry order.
 * @returns The items kept, in the same order, and the manifests refused.
 */
export function normaliseTrayItems(manifests: ReadonlyArray<ManifestUmbraDesktopTrayItem>): {
  items: UmbraDesktopTrayItem[];
  dropped: UmbraDesktopDroppedTrayItem[];
} {
  const hostIds = new Set(UMBRADESKTOP_TASKBAR_FEATURES.map((feature) => feature.id));
  const seen = new Set<string>();
  const items: UmbraDesktopTrayItem[] = [];
  const dropped: UmbraDesktopDroppedTrayItem[] = [];
  for (const manifest of manifests) {
    if (!isRecord(manifest)) continue;
    const alias = isNonEmptyString(manifest.alias) ? manifest.alias : '(no alias)';
    const meta = isRecord(manifest.meta) ? manifest.meta : {};
    if (!manifest.element) {
      dropped.push({ alias, reason: 'it has no element to draw' });
    } else if (!isNonEmptyString(meta.label) || !isNonEmptyString(meta.description)) {
      dropped.push({ alias, reason: 'its meta needs both a label and a description for Desktop settings' });
    } else if (hostIds.has(alias)) {
      dropped.push({ alias, reason: `its alias is the id of the desktop's own "${alias}" feature` });
    } else if (seen.has(alias)) {
      dropped.push({ alias, reason: 'another tray item already uses that alias' });
    } else {
      seen.add(alias);
      items.push({
        alias,
        label: meta.label,
        description: meta.description,
        defaultEnabled: isBoolean(meta.defaultEnabled) ? meta.defaultEnabled : true,
        manifest,
      });
    }
  }
  return { items, dropped };
}
```

Check the names exported by `manifest-values.ts` first and use them; if `isBoolean` is absent, add it
there with a test beside the others.

- [ ] **Step 5: Widen `isFeatureEnabled`**

In `taskbar/features/enabled.ts`, change the parameter type to
`feature: Pick<UmbraDesktopTaskbarFeature, 'id' | 'defaultEnabled'>` so a tray item can be asked the
same question. Add a case to `enabled.test.ts` passing a plain `{ id, defaultEnabled }`.

- [ ] **Step 6: Run and watch them pass, then both gates**

---

### Task 3: Order by appearance (D14)

**Files:**
- Create: `taskbar/tray/tray-order.ts`
- Test: `taskbar/tray/tray-order.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect } from '@open-wc/testing';
import { nextTrayOrder, trayFlexOrder } from './tray-order.js';

it('adds a newly visible item at the far end', () => {
  expect(nextTrayOrder(['a'], ['a', 'b'])).to.deep.equal(['a', 'b']);
});

it('keeps places while items stay visible, whatever order they are reported in', () => {
  expect(nextTrayOrder(['a', 'b'], ['b', 'a'])).to.deep.equal(['a', 'b']);
});

it('drops an item that hides, and it rejoins at the far end', () => {
  const hidden = nextTrayOrder(['a', 'b'], ['b']);
  expect(hidden).to.deep.equal(['b']);
  expect(nextTrayOrder(hidden, ['a', 'b'])).to.deep.equal(['b', 'a']);
});

it('puts the oldest nearest the clock', () => {
  // The tray is a row ending in the clock; a lower flex order sits further from it.
  expect(trayFlexOrder(['a', 'b'], 'a')).to.be.greaterThan(trayFlexOrder(['a', 'b'], 'b'));
  expect(trayFlexOrder(['a', 'b'], 'a')).to.be.lessThan(0);
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

```ts
/**
 * The tray's order of appearance (design D14): oldest first, which is nearest the clock.
 *
 * Not stored: after a reload items take their places as they appear again, which is what Windows does
 * after a restart too.
 */

/**
 * The order after a change in which items are visible.
 * @param order The current order, oldest first.
 * @param visible The aliases visible now, in registry order. Simultaneous arrivals keep that order.
 * @returns The new order: survivors in place, newcomers appended at the far end.
 */
export function nextTrayOrder(order: ReadonlyArray<string>, visible: ReadonlyArray<string>): string[] {
  const kept = order.filter((alias) => visible.includes(alias));
  return [...kept, ...visible.filter((alias) => !kept.includes(alias))];
}

/**
 * The CSS `order` for an item. The tray renders items in DOM order followed by the host's features
 * and the clock at `order: 0`; negative numbers put package items before them, and the newest gets
 * the most negative, which is furthest from the clock. Reordering with `order` instead of moving DOM
 * nodes matters: moving a node disconnects and reconnects it, which would restart a tray item.
 * @param order The current order, oldest first.
 * @param alias The item.
 * @returns Its flex order.
 */
export function trayFlexOrder(order: ReadonlyArray<string>, alias: string): number {
  return -(order.indexOf(alias) + 1);
}
```

- [ ] **Step 4: Run and watch them pass**

---

### Task 4: The public tray context and the tray items controller

**Files:**
- Create: `taskbar/tray/tray.context-token.ts`, `taskbar/tray/tray.context.ts`
- Create: `taskbar/tray/tray-items.controller.ts`
- Modify: `components/desktop.element.ts`, `components/taskbar.element.ts`
- Test: `taskbar/tray/tray.context.test.ts`, `taskbar/tray/tray-items.controller.test.ts`

The context is the public contract, reached by packages through its alias, so the alias
`UmbraDesktopTrayContext` is fixed from here on. It holds the validated items (so the taskbar and
Desktop settings read one list) and the two calls packages get. The controller lives in the taskbar and
does the element work.

- [ ] **Step 1: Write the failing context tests**

```ts
import { expect } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbraDesktopTrayContext } from './tray.context.js';

/** A fixture host element, as the other context tests build one. */
function host() {
  const el = document.createElement('div');
  document.body.append(el);
  return el as never;
}

it('lists registered tray items', async () => {
  const registry = new UmbExtensionRegistry();
  registry.register({
    type: 'umbraDesktopTrayItem',
    alias: 'My.Tray',
    name: 'Tray',
    element: () => Promise.resolve({} as never),
    meta: { label: 'L', description: 'D' },
  } as never);
  const ctx = new UmbraDesktopTrayContext(host(), { open: () => {}, getApps: () => [], setFeature: () => {} }, registry as never);
  const items = await new Promise<ReadonlyArray<{ alias: string }>>((resolve) =>
    ctx.items.subscribe((list) => list.length && resolve(list)),
  );
  expect(items.map((i) => i.alias)).to.deep.equal(['My.Tray']);
});

it('opens a registered app by alias, and refuses one it does not know', () => {
  const opened: string[] = [];
  const app = { alias: 'Pkg.App' } as never;
  const ctx = new UmbraDesktopTrayContext(
    host(),
    { open: (a) => opened.push(a.alias), getApps: () => [app], setFeature: () => {} },
    new UmbExtensionRegistry() as never,
  );
  expect(ctx.openApp('Pkg.App')).to.equal(true);
  expect(ctx.openApp('Nope')).to.equal(false);
  expect(opened).to.deep.equal(['Pkg.App']);
});

it('switches a tray item off, and nothing that is not a tray item', async () => {
  const set: Array<[string, boolean]> = [];
  const registry = new UmbExtensionRegistry();
  registry.register({
    type: 'umbraDesktopTrayItem', alias: 'My.Tray', name: 'Tray',
    element: () => Promise.resolve({} as never), meta: { label: 'L', description: 'D' },
  } as never);
  const ctx = new UmbraDesktopTrayContext(
    host(), { open: () => {}, getApps: () => [], setFeature: (id, on) => set.push([id, on]) }, registry as never,
  );
  await new Promise((r) => ctx.items.subscribe((l) => l.length && r(l)));
  expect(ctx.setTrayItemEnabled('fullscreen', false)).to.equal(false);
  expect(ctx.setTrayItemEnabled('My.Tray', false)).to.equal(true);
  expect(set).to.deep.equal([['My.Tray', false]]);
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Write the token and context**

`tray.context-token.ts`:

```ts
import type { UmbraDesktopTrayContext } from './tray.context.js';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/**
 * The tray context. **The alias is public API**: packages consume it by this string with a local
 * token of their own, as Entertainment does, so it must never be renamed.
 */
export const UMBRADESKTOP_TRAY_CONTEXT = new UmbContextToken<UmbraDesktopTrayContext>('UmbraDesktopTrayContext');
```

`tray.context.ts`:

```ts
import { UMBRADESKTOP_TRAY_CONTEXT } from './tray.context-token.js';
import { normaliseTrayItems, type UmbraDesktopTrayItem } from './tray-items.js';
import type { UmbraDesktopApp } from '../../types';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';

/** What the context needs of the rest of the desktop, passed in so a test can replace it. */
export interface UmbraDesktopTrayDependencies {
  /** Launch an app as its launcher tile does. */
  open(app: UmbraDesktopApp): void;
  /** The apps this user may launch now. */
  getApps(): ReadonlyArray<UmbraDesktopApp>;
  /** Store a taskbar feature's on/off choice. */
  setFeature(id: string, enabled: boolean): void;
}

/**
 * The system tray's public face (design §7): the validated tray items, and exactly two things a
 * package's own code may do. Anything else in the desktop stays out of reach.
 */
export class UmbraDesktopTrayContext extends UmbContextBase {
  /** The items, validated, in registry order. */
  #items = new UmbArrayState<UmbraDesktopTrayItem>([], (item) => item.alias);

  /** The items, validated, in registry order. Read by the taskbar and by Desktop settings. */
  public readonly items = this.#items.asObservable();

  /** The rest of the desktop, reduced to what this needs. */
  #deps: UmbraDesktopTrayDependencies;

  /** Refused manifests already reported, so each is said once per page. */
  #reported = new Set<string>();

  /**
   * @param host The desktop.
   * @param deps What this needs of the window manager, catalogue and settings.
   * @param registry The extension registry; the backoffice's own unless a test passes one.
   */
  constructor(host: UmbControllerHost, deps: UmbraDesktopTrayDependencies, registry = umbExtensionsRegistry) {
    super(host, UMBRADESKTOP_TRAY_CONTEXT);
    this.#deps = deps;
    // Through the initializer rather than `byType`, so a manifest's conditions are honoured, as the
    // app catalogue does for `umbraDesktopApp` (see the comment there).
    new UmbExtensionsManifestInitializer(
      this,
      registry as never,
      'umbraDesktopTrayItem',
      null,
      (permitted) => {
        const { items, dropped } = normaliseTrayItems(permitted.map((controller) => controller.manifest) as never);
        for (const { alias, reason } of dropped) {
          const key = `${alias}:${reason}`;
          if (this.#reported.has(key)) continue;
          this.#reported.add(key);
          console.warn(`[UmbraDesktop] The tray item "${alias}" was dropped because ${reason}.`);
        }
        this.#items.setValue(items);
      },
      'observeTrayItems',
    );
  }

  /**
   * Open a registered app, as its launcher tile does.
   * @param alias The app's alias.
   * @returns False when this user has no such app, so the caller can say so rather than do nothing.
   */
  public openApp(alias: string): boolean {
    const app = this.#deps.getApps().find((candidate) => candidate.alias === alias);
    if (!app) return false;
    this.#deps.open(app);
    return true;
  }

  /**
   * Switch a tray item on or off for this user, as its switch in Desktop settings does. Refuses any
   * id that is not a registered tray item, so a package cannot reach the host's own features.
   * @param alias The tray item's alias.
   * @param enabled Whether it should be on.
   * @returns False when the alias is not a tray item.
   */
  public setTrayItemEnabled(alias: string, enabled: boolean): boolean {
    if (!this.#items.getValue().some((item) => item.alias === alias)) return false;
    this.#deps.setFeature(alias, enabled);
    return true;
  }
}
```

Match the `UmbExtensionsManifestInitializer` call to `app-catalogue.context.ts:342` exactly,
including how it types the registry; the `as never` casts above are placeholders for whatever that
file does.

- [ ] **Step 4: Provide it**

In `desktop.element.ts`: keep the catalogue as a field (`#catalogue = new UmbraDesktopAppCatalogueContext(this);`
replacing the bare `new` in the constructor, and update that comment), then after `#notifications`:

```ts
  /**
   * The system tray's public face: package tray items and the two calls packages get (design §7).
   * Declared after the manager, settings and catalogue because it is handed all three.
   */
  #tray = new UmbraDesktopTrayContext(this, {
    open: (app) => this.#manager.open(app),
    getApps: () => this.#catalogue.getApps(),
    setFeature: (id, enabled) => this.#settings.setTaskbarFeature(id, enabled),
  });
```

`#catalogue` must be declared above `#tray`; class fields initialise in order.

- [ ] **Step 5: Run the context tests and watch them pass**

- [ ] **Step 6: Write the failing controller tests**

`tray-items.controller.test.ts` drives the controller with a fake items list and a real element
class, and asserts:

```ts
import { expect, fixture, html } from '@open-wc/testing';
import { UmbraDesktopTrayItemsController } from './tray-items.controller.js';

/** A tray item that can be told to hide. */
class TestTrayItem extends HTMLElement {}
customElements.define('test-tray-item', TestTrayItem);

const item = (alias: string) => ({
  alias, label: 'L', description: 'D', defaultEnabled: true,
  manifest: { type: 'umbraDesktopTrayItem', alias, name: alias, element: TestTrayItem, meta: { label: 'L', description: 'D' } },
});

it('creates an element per enabled item and none for a disabled one', async () => {
  const host = await fixture<HTMLElement & { requestUpdate(): void }>(html`<div></div>`);
  host.requestUpdate = () => {};
  const c = new UmbraDesktopTrayItemsController(host as never);
  await c.sync([item('a') as never, item('b') as never], { b: false });
  expect(c.elements.map((e) => e.localName)).to.deep.equal(['test-tray-item']);
});

it('orders by appearance through the flex order, newest furthest from the clock', async () => {
  const host = await fixture<HTMLElement & { requestUpdate(): void }>(html`<div></div>`);
  host.requestUpdate = () => {};
  const c = new UmbraDesktopTrayItemsController(host as never);
  await c.sync([item('a') as never, item('b') as never], {});
  const [a, b] = c.elements;
  b.hidden = true;
  await Promise.resolve();
  b.hidden = false;
  await Promise.resolve();
  expect(Number(b.style.order)).to.be.lessThan(Number(a.style.order));
});

it('forgets an item switched off, and makes a fresh element when it comes back', async () => {
  const host = await fixture<HTMLElement & { requestUpdate(): void }>(html`<div></div>`);
  host.requestUpdate = () => {};
  const c = new UmbraDesktopTrayItemsController(host as never);
  await c.sync([item('a') as never], {});
  const first = c.elements[0];
  await c.sync([item('a') as never], { a: false });
  expect(c.elements).to.deep.equal([]);
  await c.sync([item('a') as never], { a: true });
  expect(c.elements[0]).to.not.equal(first);
});
```

A `MutationObserver` callback runs as a microtask, so `await Promise.resolve()` after toggling
`hidden` is enough; if it proves flaky, await `new Promise((r) => setTimeout(r))`.

- [ ] **Step 7: Run and watch them fail**

- [ ] **Step 8: Write the controller**

```ts
import { nextTrayOrder, trayFlexOrder } from './tray-order.js';
import { isFeatureEnabled } from '../features/enabled.js';
import type { UmbraDesktopTrayItem } from './tray-items.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { createExtensionElement } from '@umbraco-cms/backoffice/extension-api';

/**
 * Turns the tray context's items into elements in the taskbar's tray: one element per switched-on
 * item, created once and kept, ordered by when each became visible (design D14).
 *
 * Elements are kept rather than rebuilt on every render because an item holds state (the cup polls
 * and remembers what it has reminded), and they are reordered with CSS `order` rather than moved,
 * because moving a node disconnects it.
 */
export class UmbraDesktopTrayItemsController extends UmbControllerBase {
  /** The element for each switched-on item, by alias, in registry order. */
  #elements = new Map<string, HTMLElement>();

  /** A `hidden` watcher per element. */
  #watchers = new Map<string, MutationObserver>();

  /** Aliases in order of appearance, oldest first. */
  #order: string[] = [];

  /** The host, asked to re-render when the set of elements changes. */
  #host: UmbControllerHost & { requestUpdate(): void };

  /** Bumped on every sync so a slow element load from an older sync is discarded. */
  #generation = 0;

  /** @param host The taskbar. */
  constructor(host: UmbControllerHost & { requestUpdate(): void }) {
    super(host);
    this.#host = host;
  }

  /** The elements to put in the tray, in registry order; their flex order does the ordering. */
  public get elements(): HTMLElement[] {
    return [...this.#elements.values()];
  }

  /**
   * Bring the elements in line with the items and the user's switches.
   * @param items The tray context's items.
   * @param stored The user's stored taskbar choices.
   */
  public async sync(items: ReadonlyArray<UmbraDesktopTrayItem>, stored: Readonly<Record<string, boolean>>) {
    const generation = (this.#generation += 1);
    const wanted = items.filter((item) => isFeatureEnabled(stored, { id: item.alias, defaultEnabled: item.defaultEnabled }));
    for (const alias of [...this.#elements.keys()]) {
      if (!wanted.some((item) => item.alias === alias)) this.#forget(alias);
    }
    for (const item of wanted) {
      if (this.#elements.has(item.alias)) continue;
      const element = await createExtensionElement(item.manifest);
      if (generation !== this.#generation || !element || this.#elements.has(item.alias)) continue;
      this.#elements.set(item.alias, element);
      const watcher = new MutationObserver(() => this.#reorder());
      watcher.observe(element, { attributes: true, attributeFilter: ['hidden'] });
      this.#watchers.set(item.alias, watcher);
    }
    this.#reorder();
    this.#host.requestUpdate();
  }

  /** Recompute the order from who is visible now, and write it onto the elements. */
  #reorder() {
    const visible = [...this.#elements].filter(([, el]) => !el.hidden).map(([alias]) => alias);
    this.#order = nextTrayOrder(this.#order, visible);
    for (const [alias, element] of this.#elements) {
      element.style.order = this.#order.includes(alias) ? String(trayFlexOrder(this.#order, alias)) : '';
    }
  }

  /**
   * Drop an item's element and watcher.
   * @param alias The item.
   */
  #forget(alias: string) {
    this.#watchers.get(alias)?.disconnect();
    this.#watchers.delete(alias);
    this.#elements.delete(alias);
  }

  override hostDisconnected() {
    super.hostDisconnected();
    for (const watcher of this.#watchers.values()) watcher.disconnect();
  }
}
```

- [ ] **Step 9: Wire it into the taskbar**

Replace Task 1's stand-in with `#trayItems = new UmbraDesktopTrayItemsController(this);`, consume
`UMBRADESKTOP_TRAY_CONTEXT` in the constructor beside the other contexts, keep the latest items in a
field, and call `this.#trayItems.sync(items, this._features)` whenever either the items or
`this._features` change.

- [ ] **Step 10: Run the controller tests, then both gates**

---

### Task 5: Package tray items in Desktop settings

**Files:**
- Modify: `settings/categories/taskbar/taskbar.element.ts`
- Test: its existing test file (find it with `ls settings/categories/taskbar`)

- [ ] **Step 1: Write the failing test**: with a tray context providing one item `{ alias: 'My.Tray', label: 'Cup', description: 'About the cup' }`, the screen shows a tray heading, a toggle labelled "Cup", the hint "About the cup", checked by default; toggling it calls the settings context's `setTaskbarFeature('My.Tray', false)`.

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement**: consume `UMBRADESKTOP_TRAY_CONTEXT`, observe `items` into `@state() _trayItems`. In `#renderRegion`, for `region.id === 'tray'` render `taskbarFeaturesIn('tray')` and then each tray item through a `#renderTrayItem(item)` that mirrors `#renderFeature` but localises with `this.localize.string(item.label)` (package labels are `#token` or literal, host ones are bare keys) and is never disabled (a package item has no availability). The region's empty check becomes "no host features and no tray items".

- [ ] **Step 4: Run, then both gates**

---

### Task 6: Buttons on a desktop notification (D15)

**Files:**
- Modify: `components/desktop-toasts.element.ts`
- Modify: `notifications/notification-centre.context.ts`
- Test: `components/desktop-toasts.test.ts` (create if absent), `notifications/notification-centre.context.test.ts`

- [ ] **Step 1: Write the failing toast test**

```ts
it('draws the element of a notification the desktop raised itself, and not one from a window', async () => {
  customElements.define('test-note', class extends HTMLElement {
    data: unknown; notificationHandler?: { close(): void };
  });
  // Mount <umbradesktop-toasts> under a host providing a centre, as the existing tests do, then:
  centre.raise(
    { key: 'k1', color: 'default', duration: null, message: 'm', element: { name: 'test-note', data: { x: 1 } } },
    { sourceId: 'desktop', source: 'Desktop' },
  );
  centre.raise(
    { key: 'k2', color: 'default', duration: null, message: 'n', element: { name: 'test-note', data: { x: 2 } } },
    { sourceId: 'window-1', source: 'Content' },
  );
  await el.updateComplete;
  const notes = el.shadowRoot!.querySelectorAll('test-note');
  expect(notes).to.have.length(1);
  expect((notes[0] as never as { data: unknown }).data).to.deep.equal({ x: 1 });
});

it('dismisses the toast when its element closes its handler', async () => {
  // …raise as above from 'desktop', then:
  (el.shadowRoot!.querySelector('test-note') as never as { notificationHandler: { close(): void } }).notificationHandler.close();
  await el.updateComplete;
  expect(el.shadowRoot!.querySelector('test-note')).to.equal(null);
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement in the toasts element**

```ts
  /**
   * The element each desktop-sourced toast draws, kept per toast so a re-render does not recreate it
   * and lose what it holds.
   */
  #ownElements = new Map<string, HTMLElement>();

  /**
   * The element to draw for a toast, when it gets one (design D15).
   *
   * Only for a notification the desktop raised in its own document. Everything from a window stays
   * plain data, because a window's document can close and nothing here may hold on to it
   * (notifications design D5). The desktop's own document lives as long as the desktop, so that
   * reason does not apply, and drawing the element is what puts its buttons where they are seen.
   *
   * It gets what Umbraco's container gives a notification layout: `data`, and a handler whose
   * `close()` takes the toast down.
   * @param toast The toast.
   * @returns The element, or undefined for a plain toast.
   */
  #ownElementFor(toast: UmbraDesktopToast): HTMLElement | undefined {
    const spec = toast.notification.element;
    if (toast.sourceId !== UMBRADESKTOP_DESKTOP_SOURCE_ID || !spec || !customElements.get(spec.name)) return undefined;
    let element = this.#ownElements.get(toast.id);
    if (!element || element.localName !== spec.name) {
      element = document.createElement(spec.name);
      this.#ownElements.set(toast.id, element);
    }
    Object.assign(element, { data: spec.data, notificationHandler: { close: () => this.#centre?.dismiss(toast.id) } });
    return element;
  }
```

In `#renderToast`, when `#ownElementFor(toast)` returns an element, render
`<div class="toast own" data-color=… role="status">${element}${closeButton}</div>` instead of the body
button (factor the close button out of `#renderToast` into `#renderClose(toast)` so both use it).
Where the toasts are observed, delete map entries whose toast is gone. Style `.toast.own` so the
element takes the body's place and padding.

- [ ] **Step 4: Write the failing centre test**: activating a scrollback entry whose `sourceId` is `desktop` and which has an element appends a toast with that element and leaves the entry's `count` unchanged; one from a window still goes through the source's `reraise`.

- [ ] **Step 5: Implement in the centre**: in `activate`, before the window lookup:

```ts
    // A desktop notification with an element is drawn by the desktop now (D15), so showing it again
    // means a desktop toast, not a re-raise inside the document, and not a second scrollback entry.
    if (isDesktop && notification.element) {
      this.#showAgain(notification, target);
      return;
    }
```

with `#showAgain` building a toast exactly as `raise` does but without calling `recordNotification`.
Factor the toast construction in `raise` into a private `#show(notification, origin)` both use.

- [ ] **Step 6: Run, then both gates**

---

### Task 7: Host documentation

**Files:** Modify `docs/desktop-apps.md`.

- [ ] **Step 1:** Add a section "Tray items" after the section on registering an app: the manifest table from the design §7, the `hidden` contract, the order rule (no weight, appearance order, host features nearest the clock), that the switch appears in Desktop settings under the tray heading, and the tray context: alias `UmbraDesktopTrayContext` is public API, `openApp(alias)` and `setTrayItemEnabled(alias, enabled)`, with Entertainment's cup as the worked example. Add a short "A notification with buttons" subsection: raise it from the desktop's own document with `elementName` and `data`, and the desktop toast draws the element; from a window it stays text.

- [ ] **Step 2:** Re-read it as someone outside the repo. Every name it mentions must exist.

---

# Part B — Entertainment server

### Task 8: The test project

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop.Entertainment.Tests/Umbraco.Community.UmbraDesktop.Entertainment.Tests.csproj`
- Modify: `Umbraco.Community.UmbraDesktop.app.slnx`, `.github/actions/build-packages/action.yml`

- [ ] **Step 1: Create the project**

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
    <!-- The global XML-doc rule applies to tests too, by explicit decision of the repo owner. -->
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" />
    <PackageReference Include="xunit" />
    <PackageReference Include="xunit.runner.visualstudio" />
    <PackageReference Include="Microsoft.Extensions.TimeProvider.Testing" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\Umbraco.Community.UmbraDesktop.Entertainment\Umbraco.Community.UmbraDesktop.Entertainment.csproj" />
  </ItemGroup>

  <ItemGroup>
    <!-- Real captures from YouTube, 2026-09-27. See the design doc §3. -->
    <None Update="UmbraCoffee\Fixtures\**" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>

</Project>
```

- [ ] **Step 2: Add it to the solution** beside the host test project in the `.slnx`.

- [ ] **Step 3: Add it to the build action**: a `dotnet restore` line for it in "Restore", its
`packages.lock.json` in the NuGet cache key, and in "Test backend" a second
`dotnet test src/Umbraco.Community.UmbraDesktop.Entertainment.Tests/Umbraco.Community.UmbraDesktop.Entertainment.Tests.csproj --configuration Release --no-restore`.
Named by project file, per the comment already there.

- [ ] **Step 4: Restore** so the lock file is generated:
`dotnet restore src/Umbraco.Community.UmbraDesktop.Entertainment.Tests`. Expected: a new
`packages.lock.json`. Leave it in the diff.

---

### Task 9: The parser

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop.Entertainment/UmbraCoffee/UmbraCoffeeModels.cs`
- Create: `src/Umbraco.Community.UmbraDesktop.Entertainment/UmbraCoffee/UmbraCoffeeParser.cs`
- Test: `src/Umbraco.Community.UmbraDesktop.Entertainment.Tests/UmbraCoffee/UmbraCoffeeParserTests.cs`

- [ ] **Step 1: Write the failing tests**

```csharp
using Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffee;

namespace Umbraco.Community.UmbraDesktop.Entertainment.Tests.UmbraCoffee;

/// <summary>
/// The parser against real YouTube captures. If YouTube changes its markup, these are the tests
/// that say so, and the fix is the parser plus a fresh capture.
/// </summary>
public class UmbraCoffeeParserTests
{
    /// <summary>Reads a fixture copied next to the test assembly.</summary>
    /// <param name="name">The fixture's file name.</param>
    /// <returns>Its text.</returns>
    private static string Fixture(string name) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "UmbraCoffee", "Fixtures", name));

    /// <summary>The feed gives the fifteen newest videos, newest first.</summary>
    [Fact]
    public void Feed_lists_the_newest_videos_first()
    {
        var entries = UmbraCoffeeParser.ParseFeed(Fixture("feed-umbracoffee.xml"));

        Assert.NotNull(entries);
        Assert.Equal(15, entries.Count);
        Assert.Equal("aRkc0fRxQjw", entries[0].VideoId);
        Assert.Equal("umbraCoffee - The September Shift", entries[0].Title);
    }

    /// <summary>A scheduled stream is in the feed before it airs. NASA's was, on 2026-09-27.</summary>
    [Fact]
    public void Feed_includes_a_scheduled_stream()
    {
        var entries = UmbraCoffeeParser.ParseFeed(Fixture("feed-nasa.xml"));

        Assert.Equal("j9epFget1W8", entries![0].VideoId);
    }

    /// <summary>A feed that is not XML is unreadable, not empty.</summary>
    [Fact]
    public void Feed_that_is_not_xml_is_null() => Assert.Null(UmbraCoffeeParser.ParseFeed("<html>consent</html"));

    /// <summary>An upcoming stream's page says so and gives the scheduled start.</summary>
    [Fact]
    public void Upcoming_page_gives_the_scheduled_start()
    {
        var state = UmbraCoffeeParser.ParseWatchPage(Fixture("player-upcoming-nasa.html"));

        Assert.Equal(UmbraCoffeeVideoState.Upcoming, state.State);
        Assert.Equal(new DateTimeOffset(2026, 9, 28, 19, 0, 0, TimeSpan.Zero), state.Start);
    }

    /// <summary>An ended stream has a start and an end.</summary>
    [Fact]
    public void Ended_page_gives_start_and_end()
    {
        var state = UmbraCoffeeParser.ParseWatchPage(Fixture("player-ended-umbracoffee.html"));

        Assert.Equal(UmbraCoffeeVideoState.Ended, state.State);
        Assert.Equal(new DateTimeOffset(2026, 9, 25, 10, 30, 9, TimeSpan.Zero), state.Start);
        Assert.Equal(new DateTimeOffset(2026, 9, 25, 11, 24, 22, TimeSpan.Zero), state.End);
    }

    /// <summary>
    /// A live page. Synthesised from the upcoming capture by flipping the two flags YouTube flips,
    /// because no live capture exists yet. Replace it with a real one when one is taken.
    /// </summary>
    [Fact]
    public void Live_page_is_live()
    {
        var live = Fixture("player-upcoming-nasa.html")
            .Replace("\"isUpcoming\":true", "\"isLive\":true", StringComparison.Ordinal)
            .Replace("\"isLiveNow\":false", "\"isLiveNow\":true", StringComparison.Ordinal);

        Assert.Equal(UmbraCoffeeVideoState.Live, UmbraCoffeeParser.ParseWatchPage(live).State);
    }

    /// <summary>A page without the player response is unknown, never a guess.</summary>
    [Fact]
    public void Page_without_player_response_is_unknown() =>
        Assert.Equal(UmbraCoffeeVideoState.Unknown, UmbraCoffeeParser.ParseWatchPage("<html></html>").State);

    /// <summary>Broken JSON is unknown too.</summary>
    [Fact]
    public void Broken_player_response_is_unknown() =>
        Assert.Equal(
            UmbraCoffeeVideoState.Unknown,
            UmbraCoffeeParser.ParseWatchPage("var ytInitialPlayerResponse = {\"videoDetails\":").State);

    /// <summary>A plain upload, not a stream, has video details and no broadcast details.</summary>
    [Fact]
    public void Plain_video_is_a_video() =>
        Assert.Equal(
            UmbraCoffeeVideoState.Video,
            UmbraCoffeeParser.ParseWatchPage("var ytInitialPlayerResponse = {\"videoDetails\":{\"videoId\":\"x\"}};").State);
}
```

- [ ] **Step 2: Run and watch them fail**: `dotnet test …Entertainment.Tests.csproj`. Expected: build error, types not found.

- [ ] **Step 3: Write the models**

```csharp
namespace Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffee;

/// <summary>One video in the channel's RSS feed.</summary>
/// <param name="VideoId">YouTube's id for it.</param>
/// <param name="Title">Its title.</param>
/// <param name="Published">The feed's publish time. Misleading for streams (design §3), so only shown, never reasoned about.</param>
public sealed record UmbraCoffeeFeedEntry(string VideoId, string Title, DateTimeOffset Published);

/// <summary>What a watch page says a video is.</summary>
public enum UmbraCoffeeVideoState
{
    /// <summary>The page could not be read. Treated as a failure, never as an answer.</summary>
    Unknown,
    /// <summary>A scheduled stream that has not started.</summary>
    Upcoming,
    /// <summary>A stream that is live now.</summary>
    Live,
    /// <summary>A stream that has ended.</summary>
    Ended,
    /// <summary>An ordinary upload, never a stream.</summary>
    Video,
}

/// <summary>A watch page, read.</summary>
/// <param name="State">What the video is.</param>
/// <param name="Start">The scheduled start for an upcoming stream, the actual start otherwise.</param>
/// <param name="End">When an ended stream ended.</param>
public sealed record UmbraCoffeeWatchState(UmbraCoffeeVideoState State, DateTimeOffset? Start, DateTimeOffset? End)
{
    /// <summary>The unreadable answer.</summary>
    public static readonly UmbraCoffeeWatchState Unknown = new(UmbraCoffeeVideoState.Unknown, null, null);
}
```

- [ ] **Step 4: Write the parser**

```csharp
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Xml;
using System.Xml.Linq;

namespace Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffee;

/// <summary>
/// Reads YouTube's RSS feed and watch pages into plain records. No I/O, so every rule is testable
/// against a captured page, and a change on YouTube's side is this file and its fixtures.
/// </summary>
/// <remarks>
/// A watch page carries the video's state in its <c>ytInitialPlayerResponse</c> JSON: whether it is
/// upcoming (<c>videoDetails.isUpcoming</c>) and the broadcast times
/// (<c>microformat.playerMicroformatRenderer.liveBroadcastDetails</c>). Reading that JSON properly,
/// rather than matching fields with patterns, is what keeps an unrelated field with the same name
/// elsewhere on the page from being read.
/// </remarks>
public static class UmbraCoffeeParser
{
    /// <summary>The Atom namespace the feed uses.</summary>
    private static readonly XNamespace Atom = "http://www.w3.org/2005/Atom";

    /// <summary>YouTube's own namespace in the feed, for the video id.</summary>
    private static readonly XNamespace Yt = "http://www.youtube.com/xml/schemas/2015";

    /// <summary>What precedes the player response JSON in a watch page.</summary>
    private const string PlayerResponseMarker = "var ytInitialPlayerResponse = ";

    /// <summary>Reads the channel feed.</summary>
    /// <param name="xml">The feed as fetched.</param>
    /// <returns>The entries newest first, or null when the text is not a feed (a consent page, say).</returns>
    public static IReadOnlyList<UmbraCoffeeFeedEntry>? ParseFeed(string xml)
    {
        XDocument doc;
        try
        {
            doc = XDocument.Parse(xml);
        }
        catch (XmlException)
        {
            return null;
        }

        if (doc.Root?.Name != Atom + "feed")
        {
            return null;
        }

        var entries = new List<UmbraCoffeeFeedEntry>();
        foreach (var entry in doc.Root.Elements(Atom + "entry"))
        {
            var id = (string?)entry.Element(Yt + "videoId");
            var title = (string?)entry.Element(Atom + "title");
            var published = (string?)entry.Element(Atom + "published");
            if (string.IsNullOrEmpty(id) || title is null
                || !DateTimeOffset.TryParse(published, CultureInfo.InvariantCulture, DateTimeStyles.None, out var when))
            {
                continue;
            }

            entries.Add(new UmbraCoffeeFeedEntry(id, title, when));
        }

        return entries;
    }

    /// <summary>Reads what a watch page says about its video.</summary>
    /// <param name="html">The page as fetched.</param>
    /// <returns>The state, or <see cref="UmbraCoffeeWatchState.Unknown"/> when it cannot be read.</returns>
    public static UmbraCoffeeWatchState ParseWatchPage(string html)
    {
        var at = html.IndexOf(PlayerResponseMarker, StringComparison.Ordinal);
        if (at < 0)
        {
            return UmbraCoffeeWatchState.Unknown;
        }

        // ParseValue reads exactly one JSON value and stops, so the script after it does not matter.
        var reader = new Utf8JsonReader(Encoding.UTF8.GetBytes(html[(at + PlayerResponseMarker.Length)..]));
        try
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            return Classify(doc.RootElement);
        }
        catch (JsonException)
        {
            return UmbraCoffeeWatchState.Unknown;
        }
    }

    /// <summary>Turns a player response into a state.</summary>
    /// <param name="root">The player response.</param>
    /// <returns>The state.</returns>
    private static UmbraCoffeeWatchState Classify(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("videoDetails", out var video))
        {
            return UmbraCoffeeWatchState.Unknown;
        }

        if (!root.TryGetProperty("microformat", out var microformat)
            || !microformat.TryGetProperty("playerMicroformatRenderer", out var renderer)
            || !renderer.TryGetProperty("liveBroadcastDetails", out var details))
        {
            return new UmbraCoffeeWatchState(UmbraCoffeeVideoState.Video, null, null);
        }

        var start = ReadTime(details, "startTimestamp");
        var end = ReadTime(details, "endTimestamp");
        if (end is not null)
        {
            return new UmbraCoffeeWatchState(UmbraCoffeeVideoState.Ended, start, end);
        }

        if (details.TryGetProperty("isLiveNow", out var live) && live.ValueKind == JsonValueKind.True)
        {
            return new UmbraCoffeeWatchState(UmbraCoffeeVideoState.Live, start, null);
        }

        // Upcoming needs a start: an upcoming stream with no time is nothing a countdown can use.
        var upcoming = video.TryGetProperty("isUpcoming", out var flag) && flag.ValueKind == JsonValueKind.True;
        return upcoming && start is not null
            ? new UmbraCoffeeWatchState(UmbraCoffeeVideoState.Upcoming, start, null)
            : UmbraCoffeeWatchState.Unknown;
    }

    /// <summary>Reads an ISO 8601 time property.</summary>
    /// <param name="parent">The object holding it.</param>
    /// <param name="name">The property.</param>
    /// <returns>The time, or null when absent or unreadable.</returns>
    private static DateTimeOffset? ReadTime(JsonElement parent, string name) =>
        parent.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String
        && DateTimeOffset.TryParse(value.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var time)
            ? time
            : null;
}
```

- [ ] **Step 5: Run and watch them pass**

---

### Task 10: The service

**Files:**
- Modify: `UmbraCoffee/UmbraCoffeeModels.cs` (status records)
- Create: `UmbraCoffee/UmbraCoffeeService.cs`
- Test: `…Tests/UmbraCoffee/UmbraCoffeeServiceTests.cs`

- [ ] **Step 1: Add the status records** to `UmbraCoffeeModels.cs`:

```csharp
/// <summary>The two states the desktop acts on, as the strings the endpoint sends.</summary>
public static class UmbraCoffeeCurrentState
{
    /// <summary>Scheduled and not started.</summary>
    public const string Upcoming = "upcoming";
    /// <summary>Live now.</summary>
    public const string Live = "live";
}

/// <summary>The episode that is upcoming or live.</summary>
/// <param name="VideoId">YouTube's id.</param>
/// <param name="Title">Its title.</param>
/// <param name="State">One of <see cref="UmbraCoffeeCurrentState"/>.</param>
/// <param name="ScheduledStart">The scheduled start, or the actual start once live when YouTube gives only that.</param>
public sealed record UmbraCoffeeCurrent(string VideoId, string Title, string State, DateTimeOffset? ScheduledStart);

/// <summary>One episode in the list.</summary>
/// <param name="VideoId">YouTube's id.</param>
/// <param name="Title">Its title.</param>
/// <param name="Published">When the feed says it was published.</param>
public sealed record UmbraCoffeeEpisode(string VideoId, string Title, DateTimeOffset Published);

/// <summary>What the endpoint returns.</summary>
/// <param name="Current">The upcoming or live episode, or null.</param>
/// <param name="Episodes">The feed's episodes, newest first.</param>
/// <param name="FetchedAt">When this was last read from YouTube successfully, or null if never.</param>
/// <param name="Stale">True when the last attempt failed and this is the last good answer (design D4).</param>
public sealed record UmbraCoffeeStatus(
    UmbraCoffeeCurrent? Current,
    IReadOnlyList<UmbraCoffeeEpisode> Episodes,
    DateTimeOffset? FetchedAt,
    bool Stale)
{
    /// <summary>Nothing known yet, and the attempt to find out failed.</summary>
    public static readonly UmbraCoffeeStatus Unavailable = new(null, [], null, true);
}
```

- [ ] **Step 2: Write the failing tests**

```csharp
using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffee;

namespace Umbraco.Community.UmbraDesktop.Entertainment.Tests.UmbraCoffee;

/// <summary>The service's rules: classify, cache, abandon, and stale rather than wrong.</summary>
public class UmbraCoffeeServiceTests
{
    /// <summary>Answers requests from a URL-to-body table and counts them.</summary>
    private sealed class FakeYouTube : HttpMessageHandler
    {
        /// <summary>Response bodies by the URL's path and query.</summary>
        public Dictionary<string, string> Pages { get; } = [];

        /// <summary>When set, every request fails as a blocked network would.</summary>
        public bool Offline { get; set; }

        /// <summary>How many requests arrived.</summary>
        public int Requests { get; private set; }

        /// <inheritdoc />
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests++;
            if (Offline)
            {
                throw new HttpRequestException("offline");
            }

            return Task.FromResult(Pages.TryGetValue(request.RequestUri!.PathAndQuery, out var body)
                ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) }
                : new HttpResponseMessage(HttpStatusCode.NotFound));
        }
    }

    /// <summary>Hands out clients over the fake.</summary>
    /// <param name="handler">The fake.</param>
    private sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
    {
        /// <inheritdoc />
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false) { BaseAddress = new Uri("https://www.youtube.com") };
    }

    /// <summary>Reads a fixture.</summary>
    /// <param name="name">Its file name.</param>
    /// <returns>Its text.</returns>
    private static string Fixture(string name) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "UmbraCoffee", "Fixtures", name));

    /// <summary>A service over a fake YouTube serving NASA's feed, upcoming first, the rest ended.</summary>
    /// <param name="now">The clock's starting time.</param>
    /// <returns>The service, the fake and the clock.</returns>
    private static (UmbraCoffeeService Service, FakeYouTube YouTube, FakeTimeProvider Time) Build(DateTimeOffset now)
    {
        var youtube = new FakeYouTube();
        // NASA's feed served where umbraCoffee's is asked for: the service does not care whose feed it
        // reads, and NASA's is the only capture with a real upcoming stream in it.
        var feed = Fixture("feed-nasa.xml");
        youtube.Pages[UmbraCoffeeService.FeedPath] = feed;
        var ids = UmbraCoffeeParser.ParseFeed(feed)!.Select(e => e.VideoId).ToList();
        youtube.Pages[UmbraCoffeeService.WatchPath(ids[0])] = Fixture("player-upcoming-nasa.html");
        foreach (var id in ids.Skip(1))
        {
            youtube.Pages[UmbraCoffeeService.WatchPath(id)] = Fixture("player-ended-umbracoffee.html");
        }

        var time = new FakeTimeProvider(now);
        return (new UmbraCoffeeService(new Factory(youtube), time, NullLogger<UmbraCoffeeService>.Instance), youtube, time);
    }

    /// <summary>The day before NASA's stream.</summary>
    private static readonly DateTimeOffset DayBefore = new(2026, 9, 27, 20, 0, 0, TimeSpan.Zero);

    /// <summary>An upcoming stream in the feed becomes the current episode with its start.</summary>
    [Fact]
    public async Task Upcoming_stream_is_current()
    {
        var (service, _, _) = Build(DayBefore);

        var status = await service.GetStatusAsync(CancellationToken.None);

        Assert.False(status.Stale);
        Assert.Equal(UmbraCoffeeCurrentState.Upcoming, status.Current?.State);
        Assert.Equal(new DateTimeOffset(2026, 9, 28, 19, 0, 0, TimeSpan.Zero), status.Current?.ScheduledStart);
        Assert.Equal(15, status.Episodes.Count);
    }

    /// <summary>Within five minutes the cache answers and YouTube is not asked.</summary>
    [Fact]
    public async Task Cached_for_five_minutes()
    {
        var (service, youtube, time) = Build(DayBefore);
        await service.GetStatusAsync(CancellationToken.None);
        var first = youtube.Requests;

        time.Advance(TimeSpan.FromMinutes(4));
        await service.GetStatusAsync(CancellationToken.None);
        Assert.Equal(first, youtube.Requests);

        time.Advance(TimeSpan.FromMinutes(2));
        await service.GetStatusAsync(CancellationToken.None);
        Assert.True(youtube.Requests > first);
    }

    /// <summary>A finished video's page is fetched once for the life of the process.</summary>
    [Fact]
    public async Task Finished_videos_are_not_fetched_again()
    {
        var (service, youtube, time) = Build(DayBefore);
        await service.GetStatusAsync(CancellationToken.None);
        var first = youtube.Requests;

        time.Advance(TimeSpan.FromMinutes(6));
        await service.GetStatusAsync(CancellationToken.None);

        // The feed, and the one upcoming page. Nothing else.
        Assert.Equal(first + 2, youtube.Requests);
    }

    /// <summary>A scheduled start more than six hours gone is an abandoned stream, like umbraCoffee #114.</summary>
    [Fact]
    public async Task Long_passed_upcoming_is_abandoned()
    {
        var (service, _, _) = Build(new DateTimeOffset(2026, 9, 29, 2, 0, 0, TimeSpan.Zero));

        var status = await service.GetStatusAsync(CancellationToken.None);

        Assert.Null(status.Current);
    }

    /// <summary>When YouTube cannot be reached, the last good answer comes back marked stale.</summary>
    [Fact]
    public async Task Offline_returns_last_good_as_stale()
    {
        var (service, youtube, time) = Build(DayBefore);
        await service.GetStatusAsync(CancellationToken.None);

        youtube.Offline = true;
        time.Advance(TimeSpan.FromMinutes(6));
        var status = await service.GetStatusAsync(CancellationToken.None);

        Assert.True(status.Stale);
        Assert.Equal(15, status.Episodes.Count);
    }

    /// <summary>Offline from the start is an empty stale answer, not an exception.</summary>
    [Fact]
    public async Task Offline_from_the_start_is_unavailable()
    {
        var (service, youtube, _) = Build(DayBefore);
        youtube.Offline = true;

        var status = await service.GetStatusAsync(CancellationToken.None);

        Assert.Same(UmbraCoffeeStatus.Unavailable, status);
    }

    /// <summary>An unreadable page (markup changed) is a failure, so stale, never a wrong answer.</summary>
    [Fact]
    public async Task Unreadable_page_is_stale()
    {
        var (service, youtube, _) = Build(DayBefore);
        var ids = UmbraCoffeeParser.ParseFeed(Fixture("feed-nasa.xml"))!.Select(e => e.VideoId).ToList();
        youtube.Pages[UmbraCoffeeService.WatchPath(ids[0])] = "<html>changed</html>";

        var status = await service.GetStatusAsync(CancellationToken.None);

        Assert.True(status.Stale);
        Assert.Null(status.Current);
    }

    /// <summary>The client sends the consent cookie and English, or an EU server meets a consent page (design §5).</summary>
    [Fact]
    public void Client_sends_consent_and_language()
    {
        var client = new HttpClient();
        UmbraCoffeeService.ConfigureClient(client);

        Assert.Contains("SOCS=CAI", client.DefaultRequestHeaders.GetValues("Cookie"));
        Assert.Equal("en", client.DefaultRequestHeaders.AcceptLanguage.Single().Value);
    }
}
```

- [ ] **Step 3: Run and watch them fail**

- [ ] **Step 4: Write the service**

```csharp
using System.Net.Http.Headers;
using Microsoft.Extensions.Logging;

namespace Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffee;

/// <summary>Reads the umbraCoffee channel.</summary>
public interface IUmbraCoffeeService
{
    /// <summary>The current status, from the cache when it is fresh.</summary>
    /// <param name="cancellationToken">Cancels the wait, not a fetch already shared with other callers.</param>
    /// <returns>The status. Never throws for a YouTube failure; that is <see cref="UmbraCoffeeStatus.Stale"/>.</returns>
    Task<UmbraCoffeeStatus> GetStatusAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Reads the channel's feed and the pages of its unfinished videos, keylessly (design D2), caches the
/// answer for five minutes (D3), and on any failure returns the last good answer marked stale (D4).
/// </summary>
/// <remarks>
/// A class rather than a record, against the repository default, because it holds mutable state
/// shared across requests: the cache, the set of finished videos, and whether it is mid-failure.
/// </remarks>
/// <param name="httpClientFactory">Supplies the named client configured by <see cref="ConfigureClient"/>.</param>
/// <param name="time">The clock.</param>
/// <param name="logger">Where a failure streak is reported, once.</param>
public sealed class UmbraCoffeeService(
    IHttpClientFactory httpClientFactory,
    TimeProvider time,
    ILogger<UmbraCoffeeService> logger) : IUmbraCoffeeService
{
    /// <summary>The umbraCoffee channel (<c>@umbraCoffee</c>). A constant: nothing to configure (D5).</summary>
    public const string UmbraCoffeeChannelId = "UCF_Ene5-58a3Z55aw8O6Djg";

    /// <summary>The named HttpClient this uses.</summary>
    public const string HttpClientName = "UmbraDesktop.Entertainment.UmbraCoffee";

    /// <summary>How long an answer is reused.</summary>
    public static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(5);

    /// <summary>How long after its scheduled start an upcoming stream counts as abandoned.</summary>
    public static readonly TimeSpan AbandonAfter = TimeSpan.FromHours(6);

    /// <summary>How many of the newest entries may cost a page request per refresh.</summary>
    private const int PagesPerRefresh = 3;

    /// <summary>The channel feed's path and query.</summary>
    public const string FeedPath = $"/feeds/videos.xml?channel_id={UmbraCoffeeChannelId}";

    /// <summary>A watch page's path and query.</summary>
    /// <param name="videoId">The video.</param>
    /// <returns>The path and query.</returns>
    public static string WatchPath(string videoId) => $"/watch?v={videoId}";

    /// <summary>Serialises refreshes, so a burst of desktops causes one fetch.</summary>
    private readonly SemaphoreSlim _gate = new(1, 1);

    /// <summary>States of videos that will not change again, by id.</summary>
    private readonly Dictionary<string, UmbraCoffeeWatchState> _finished = [];

    /// <summary>The last answer handed out.</summary>
    private UmbraCoffeeStatus? _last;

    /// <summary>When <see cref="_last"/> stops being reused.</summary>
    private DateTimeOffset _expires = DateTimeOffset.MinValue;

    /// <summary>Whether the previous refresh failed, so a streak is logged once.</summary>
    private bool _failing;

    /// <summary>Sets what every request sends. Used by the composer, and tested.</summary>
    /// <param name="client">The client to configure.</param>
    public static void ConfigureClient(HttpClient client)
    {
        client.BaseAddress = new Uri("https://www.youtube.com");
        client.Timeout = TimeSpan.FromSeconds(10);
        // Without these a server in the EU can be sent to YouTube's consent page (design §5).
        client.DefaultRequestHeaders.Add("Cookie", "SOCS=CAI");
        client.DefaultRequestHeaders.AcceptLanguage.Add(new StringWithQualityHeaderValue("en"));
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0");
    }

    /// <inheritdoc />
    public async Task<UmbraCoffeeStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        if (_last is not null && time.GetUtcNow() < _expires)
        {
            return _last;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            var now = time.GetUtcNow();
            if (_last is not null && now < _expires)
            {
                return _last;
            }

            try
            {
                // Not the caller's token: the fetch is shared, and one caller leaving must not fail it for the rest.
                _last = await FetchAsync(now, CancellationToken.None);
                _failing = false;
            }
            catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or FormatException)
            {
                if (!_failing)
                {
                    logger.LogWarning(exception, "umbraCoffee could not be read from YouTube; serving the last known status as stale.");
                }

                _failing = true;
                _last = _last is null ? UmbraCoffeeStatus.Unavailable : _last with { Stale = true };
            }

            _expires = now + CacheFor;
            return _last;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>One refresh from YouTube.</summary>
    /// <param name="now">The time of this refresh.</param>
    /// <param name="cancellationToken">Cancels the requests.</param>
    /// <returns>A fresh status.</returns>
    /// <exception cref="FormatException">The feed or a page could not be read.</exception>
    private async Task<UmbraCoffeeStatus> FetchAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient(HttpClientName);
        var feed = await client.GetStringAsync(FeedPath, cancellationToken);
        var entries = UmbraCoffeeParser.ParseFeed(feed) ?? throw new FormatException("The feed could not be read.");

        UmbraCoffeeCurrent? live = null;
        UmbraCoffeeCurrent? upcoming = null;
        foreach (var entry in entries.Take(PagesPerRefresh))
        {
            if (_finished.ContainsKey(entry.VideoId))
            {
                continue;
            }

            var page = await client.GetStringAsync(WatchPath(entry.VideoId), cancellationToken);
            var state = UmbraCoffeeParser.ParseWatchPage(page);
            switch (state.State)
            {
                case UmbraCoffeeVideoState.Unknown:
                    throw new FormatException($"The page of {entry.VideoId} could not be read.");
                case UmbraCoffeeVideoState.Ended or UmbraCoffeeVideoState.Video:
                    _finished[entry.VideoId] = state;
                    break;
                case UmbraCoffeeVideoState.Live:
                    live ??= new UmbraCoffeeCurrent(entry.VideoId, entry.Title, UmbraCoffeeCurrentState.Live, state.Start);
                    break;
                case UmbraCoffeeVideoState.Upcoming when state.Start < now - AbandonAfter:
                    _finished[entry.VideoId] = state;
                    break;
                case UmbraCoffeeVideoState.Upcoming:
                    upcoming ??= new UmbraCoffeeCurrent(entry.VideoId, entry.Title, UmbraCoffeeCurrentState.Upcoming, state.Start);
                    break;
            }
        }

        var episodes = entries.Select(e => new UmbraCoffeeEpisode(e.VideoId, e.Title, e.Published)).ToList();
        return new UmbraCoffeeStatus(live ?? upcoming, episodes, now, false);
    }
}
```

Note the abandoned test: NASA's start is 2026-09-28 19:00 and the test runs at 2026-09-29 02:00,
seven hours on. `Finished_videos_are_not_fetched_again` counts feed plus the one upcoming page on the
second refresh; if an ended fixture reused for several ids breaks that count, check `_finished` first.

- [ ] **Step 5: Run and watch them pass**

---

### Task 11: Controller and composer

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop.Entertainment/Api/UmbraCoffeeController.cs`
- Create: `src/Umbraco.Community.UmbraDesktop.Entertainment/Composing/UmbraCoffeeComposer.cs`
- Test: `…Tests/UmbraCoffee/UmbraCoffeeControllerTests.cs`

Two traps from the host, both verified 2026-09-27:

- The host's `generate-openapi.js` keeps every path starting with
  `/umbraco/management/api/v1/umbradesktop`, as a plain string prefix. A route like
  `umbradesktop-entertainment/…` would leak into the host's generated client whenever it is generated
  against an instance with Entertainment installed. So the route is `umbracoffee`.
- The host's `PackageOperationIdHandler` claims every namespace starting with
  `Umbraco.Community.UmbraDesktop`, which includes this one, and names an operation by its action alone.
  So the action is `GetUmbraCoffeeStatus` and the response type `UmbraCoffeeStatus`, both unique.

- [ ] **Step 1: Write the failing tests**

```csharp
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Entertainment.Api;

namespace Umbraco.Community.UmbraDesktop.Entertainment.Tests.UmbraCoffee;

/// <summary>The endpoint's gate and route, which are decisions (design §4), not accidents.</summary>
public class UmbraCoffeeControllerTests
{
    /// <summary>Open to any backoffice user, no section policy.</summary>
    [Fact]
    public void Requires_backoffice_access_only()
    {
        var policies = typeof(UmbraCoffeeController).GetCustomAttributes<AuthorizeAttribute>().Select(a => a.Policy).ToList();

        Assert.Equal([AuthorizationPolicies.BackOfficeAccess], policies);
    }

    /// <summary>Not under the host's <c>umbradesktop</c> prefix, which its client generator keeps.</summary>
    [Fact]
    public void Route_is_outside_the_host_client_prefix()
    {
        var route = typeof(UmbraCoffeeController).GetCustomAttributes().OfType<Umbraco.Cms.Api.Management.Routing.VersionedApiBackOfficeRouteAttribute>().Single();

        Assert.False(route.Template.Contains("umbradesktop", StringComparison.OrdinalIgnoreCase));
    }
}
```

If `VersionedApiBackOfficeRouteAttribute` does not expose `Template` under that name, read the
template through `RouteAttribute`, which it derives from.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Write the controller**

```csharp
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffee;

namespace Umbraco.Community.UmbraDesktop.Entertainment.Api;

/// <summary>
/// What the desktop needs to show umbraCoffee: the upcoming or live episode and the latest ones.
/// </summary>
/// <remarks>
/// Backoffice access only, like the host's desktop label: the data is public YouTube data, and a
/// section policy would only hide the show from editors who can reach the desktop. The route stays
/// out of the host's <c>umbradesktop</c> prefix; see the implementation plan, Task 11.
/// </remarks>
/// <param name="service">Reads and caches the channel.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbracoffee")]
[ApiExplorerSettings(GroupName = "UmbraDesktop Entertainment")]
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
public class UmbraCoffeeController(IUmbraCoffeeService service) : ManagementApiControllerBase
{
    /// <summary>Gets the umbraCoffee status.</summary>
    /// <param name="cancellationToken">The request's cancellation.</param>
    /// <returns>The status, possibly stale, never an error for a YouTube failure.</returns>
    [HttpGet]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(UmbraCoffeeStatus), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUmbraCoffeeStatus(CancellationToken cancellationToken) =>
        Ok(await service.GetStatusAsync(cancellationToken));
}
```

- [ ] **Step 4: Write the composer**

```csharp
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffee;

namespace Umbraco.Community.UmbraDesktop.Entertainment.Composing;

/// <summary>Registers umbraCoffee's YouTube client and service.</summary>
public sealed class UmbraCoffeeComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddHttpClient(UmbraCoffeeService.HttpClientName, UmbraCoffeeService.ConfigureClient);
        // Singleton, because the cache and the finished set are the point: one fetch per five minutes
        // for the whole site.
        builder.Services.AddSingleton<IUmbraCoffeeService, UmbraCoffeeService>();
        builder.Services.AddSingleton(TimeProvider.System);
    }
}
```

`AddSingleton(TimeProvider.System)` may duplicate a registration Umbraco already makes; use
`TryAddSingleton` from `Microsoft.Extensions.DependencyInjection.Extensions` instead.

- [ ] **Step 5: Run the C# tests, then build the solution**

`dotnet test …Entertainment.Tests.csproj` green, and
`dotnet build Umbraco.Community.UmbraDesktop.app.slnx` with no warnings (they are errors here).

---

# Part C — Entertainment client

### Task 12: Manifests, constants and strings

**Files:**
- Create: `umbracoffee/constants.ts`
- Modify: `bundle.manifests.ts`, `bundle.manifests.test.ts`, `umbradesktop-app.d.ts`, `localization/en.ts`, `localization/nl.ts`

- [ ] **Step 1: Write the constants**

```ts
/** The umbraCoffee app's alias. The tray cup and the reminder open it by this. */
export const UMBRACOFFEE_APP_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffee';

/** The tray item's alias. Also the key its on/off switch is stored under: never change it. */
export const UMBRACOFFEE_TRAY_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffeeTray';

/** The endpoint, `UmbraCoffeeController`'s route under the management API. */
export const UMBRACOFFEE_ENDPOINT = '/umbraco/management/api/v1/umbracoffee';

/** How often a desktop asks. Matches the server's five-minute cache (design D3). */
export const UMBRACOFFEE_POLL_MS = 5 * 60 * 1000;

/** How long before the start the first reminder comes (design D7). */
export const UMBRACOFFEE_REMINDER_LEAD_MS = 10 * 60 * 1000;

/** How long the live reminder stays up. It clears its hidden original in the desktop's document too. */
export const UMBRACOFFEE_LIVE_REMINDER_MS = 15 * 60 * 1000;

/** Width of the chat beside the player. */
export const UMBRACOFFEE_CHAT_WIDTH = 320;

/** The opening content box: a 16:9 player 640 wide, the chat beside it, the episode list under. */
export const UMBRACOFFEE_CONTENT_SIZE = { w: 640 + UMBRACOFFEE_CHAT_WIDTH, h: 600 };

/** The smallest content box the window works in, chat hidden. */
export const UMBRACOFFEE_MIN_CONTENT_SIZE = { w: 480, h: 400 };

/** The channel, for the "all episodes" link. */
export const UMBRACOFFEE_CHANNEL_URL = 'https://www.youtube.com/@umbraCoffee/videos';
```

- [ ] **Step 2: Update the manifest tests (failing)**

The existing tests assume every `umbraDesktopApp` is a game; change their filter from
`manifest.type === 'umbraDesktopApp'` to the games' aliases (Minesweeper, Snake) so they keep meaning
what they say. Then add:

```ts
it('defines a media group after Games and before Experimental', () => {
  const groups = (catalogue as { meta?: { groups?: Array<{ alias: string; label: string; weight?: number }> } })?.meta?.groups ?? [];
  const media = groups.find((group) => group.alias === 'media');
  expect(media?.label).to.equal('#umbraDesktopEntertainment_groupMedia');
  expect(media!.weight).to.equal(65);
});

it('registers umbraCoffee in the media group, resizable', () => {
  const app = manifests.find((m) => m.alias === UMBRACOFFEE_APP_ALIAS) as { type: string; meta: { group: string; resizable?: boolean } };
  expect(app.type).to.equal('umbraDesktopApp');
  expect(app.meta.group).to.equal('media');
  expect(app.meta.resizable).to.not.equal(false);
});

it('registers the umbraCoffee tray item, on by default', () => {
  const tray = manifests.find((m) => m.alias === UMBRACOFFEE_TRAY_ALIAS) as { type: string; element: unknown; meta: { defaultEnabled?: boolean } };
  expect(tray.type).to.equal('umbraDesktopTrayItem');
  expect(typeof tray.element).to.equal('function');
  expect(tray.meta.defaultEnabled).to.not.equal(false);
});
```

- [ ] **Step 3: Run and watch them fail**

- [ ] **Step 4: Add the manifests**

Add `{ alias: 'media', label: '#umbraDesktopEntertainment_groupMedia', weight: 65 }` to the catalogue's
`groups`, with a comment that Winamp and the video player will join it. Add:

```ts
/** umbraCoffee: the community's monthly live show, watched in a window (design §6.1). */
const umbraCoffee: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: UMBRACOFFEE_APP_ALIAS,
  name: 'umbraCoffee',
  element: () => import('./umbracoffee/umbracoffee.element.js'),
  weight: 1000,
  meta: {
    label: '#umbraDesktopEntertainment_umbraCoffee',
    icon: 'icon-coffee',
    group: 'media',
    defaultSize: UMBRACOFFEE_CONTENT_SIZE,
    minSize: UMBRACOFFEE_MIN_CONTENT_SIZE,
  },
};

/** The coffee cup in the tray, and the reminders it raises (design §6.2, §6.3). */
const umbraCoffeeTray: UmbExtensionManifest = {
  type: 'umbraDesktopTrayItem',
  alias: UMBRACOFFEE_TRAY_ALIAS,
  name: 'umbraCoffee tray cup',
  element: () => import('./umbracoffee/tray-cup.element.js'),
  meta: {
    label: '#umbraDesktopEntertainment_umbraCoffeeTray',
    description: '#umbraDesktopEntertainment_umbraCoffeeTrayAbout',
  },
};
```

and include both in `manifests`. Check `icon-coffee` exists in Umbraco's icon set
(`node_modules/@umbraco-cms/backoffice/dist-cms/assets/icons/`); if not, use the closest native icon.
In `umbradesktop-app.d.ts`, add a local copy of `ManifestUmbraDesktopTrayItem` and its `meta`, and
register it in `UmbExtensionManifestMap`, following the pattern already there for apps.

- [ ] **Step 5: Add the strings** (both files; Dutch in brackets):

| Key | English | Dutch |
|---|---|---|
| `groupMedia` | Media | Media |
| `umbraCoffee` | umbraCoffee | umbraCoffee |
| `umbraCoffeeTray` | umbraCoffee | umbraCoffee |
| `umbraCoffeeTrayAbout` | A coffee cup by the clock when umbraCoffee is about to start or live, and a reminder ten minutes before and when it goes live. | Een kopje koffie bij de klok als umbraCoffee bijna begint of live is, en een herinnering tien minuten vooraf en als de uitzending begint. |
| `umbraCoffeeLive` | Live now | Nu live |
| `umbraCoffeeStartsIn` | Starts in %0% min | Begint over %0% min |
| `umbraCoffeeStartsAt` | Starts at %0% | Begint om %0% |
| `umbraCoffeeLatest` | Latest episode | Nieuwste aflevering |
| `umbraCoffeeEpisodes` | Episodes | Afleveringen |
| `umbraCoffeeAllEpisodes` | All episodes on YouTube | Alle afleveringen op YouTube |
| `umbraCoffeeChat` | Chat | Chat |
| `umbraCoffeeHideChat` | Hide chat | Chat verbergen |
| `umbraCoffeeUnavailable` | umbraCoffee could not be reached just now. | umbraCoffee is nu niet bereikbaar. |
| `umbraCoffeeRemindersWhere` | The tray cup and the reminders can be switched off under Taskbar in Desktop settings. | Het kopje in het systeemvak en de herinneringen zet je uit onder Taakbalk in de bureaubladinstellingen. |
| `umbraCoffeeSoonHeadline` | umbraCoffee starts soon | umbraCoffee begint zo |
| `umbraCoffeeLiveHeadline` | umbraCoffee is live | umbraCoffee is live |
| `umbraCoffeeWatch` | Watch | Kijken |
| `umbraCoffeeStopReminding` | Stop reminding me | Niet meer herinneren |
| `umbraCoffeeTrayUpcoming` | umbraCoffee in %0% min: %1% | umbraCoffee over %0% min: %1% |
| `umbraCoffeeTrayLive` | umbraCoffee is live: %0% | umbraCoffee is live: %0% |

Check that the Taskbar category is called "Taskbar" / "Taakbalk" in the host's dictionaries and match it.

- [ ] **Step 6: Run the tests (the manifest tests pass once Tasks 15 and 16 create the element files; stub each with an empty `customElements.define` until then) and `npm run build`**

---

### Task 13: The schedule, pure

**Files:**
- Create: `umbracoffee/types.ts`, `umbracoffee/schedule.ts`, `umbracoffee/reminder-record.ts`
- Test: `umbracoffee/schedule.test.ts`, `umbracoffee/reminder-record.test.ts`, `umbracoffee/types.test.ts`

- [ ] **Step 1: Write the types and guard**

```ts
/** The episode that is upcoming or live, as the endpoint sends it. */
export interface UmbraCoffeeCurrent {
  videoId: string;
  title: string;
  state: 'upcoming' | 'live';
  /** ISO time: the scheduled start, or the actual start once live. */
  scheduledStart: string | null;
}

/** One episode in the list. */
export interface UmbraCoffeeEpisode {
  videoId: string;
  title: string;
  /** ISO time the feed gives. */
  published: string;
}

/** What `GET /umbraco/management/api/v1/umbracoffee` returns. */
export interface UmbraCoffeeStatus {
  current: UmbraCoffeeCurrent | null;
  episodes: UmbraCoffeeEpisode[];
  fetchedAt: string | null;
  /** True when the server's last try failed and this is its last good answer (design D4). */
  stale: boolean;
}

/**
 * Whether a response body is a status. The body crosses a network, so the shape is checked rather
 * than trusted: anything else is treated like no answer at all.
 * @param value The parsed body.
 * @returns True when it can be used.
 */
export function isUmbraCoffeeStatus(value: unknown): value is UmbraCoffeeStatus {
  const v = value as Partial<UmbraCoffeeStatus> | null;
  return (
    !!v &&
    typeof v.stale === 'boolean' &&
    Array.isArray(v.episodes) &&
    v.episodes.every((e) => typeof e?.videoId === 'string' && typeof e?.title === 'string') &&
    (v.current === null ||
      (typeof v.current?.videoId === 'string' && (v.current.state === 'upcoming' || v.current.state === 'live')))
  );
}
```

`types.test.ts`: a real-shaped body passes; `null`, `{}`, a body with `current.state: 'ended'` fail.

- [ ] **Step 2: Write the failing schedule tests**

```ts
import { expect } from '@open-wc/testing';
import { dueReminders, trayStateFor, viewFor } from './schedule.js';
import type { UmbraCoffeeStatus } from './types.js';

const START = Date.parse('2026-10-30T11:30:00Z');
const MIN = 60_000;

const status = (over: Partial<UmbraCoffeeStatus> = {}): UmbraCoffeeStatus => ({
  current: { videoId: 'v1', title: 'October', state: 'upcoming', scheduledStart: new Date(START).toISOString() },
  episodes: [{ videoId: 'v0', title: 'September', published: '2026-09-25T11:27:38Z' }],
  fetchedAt: '2026-10-30T11:00:00Z',
  stale: false,
  ...over,
});
const live = () => status({ current: { videoId: 'v1', title: 'October', state: 'live', scheduledStart: null } });
const none = () => new Set<string>();

it('shows an upcoming episode with minutes left, rounded up', () => {
  const view = viewFor(status(), START - 25 * MIN + 1);
  expect(view.kind).to.equal('upcoming');
  expect(view.kind === 'upcoming' && view.minutesLeft).to.equal(25);
});

it('shows the live episode', () => expect(viewFor(live(), START).kind).to.equal('live'));

it('shows the latest episode when nothing is on', () => {
  const view = viewFor(status({ current: null }), START);
  expect(view.kind === 'latest' && view.episode.videoId).to.equal('v0');
});

it('shows nothing current when stale, only the latest episode (D4)', () => {
  expect(viewFor(status({ stale: true }), START - 5 * MIN).kind).to.equal('latest');
});

it('is empty with no status or no episodes', () => {
  expect(viewFor(undefined, START).kind).to.equal('empty');
  expect(viewFor(status({ current: null, episodes: [] }), START).kind).to.equal('empty');
});

it('hides the cup unless upcoming or live, and when stale (D6)', () => {
  expect(trayStateFor(status(), START - 60 * MIN)).to.equal('upcoming');
  expect(trayStateFor(live(), START)).to.equal('live');
  expect(trayStateFor(status({ current: null }), START)).to.equal('hidden');
  expect(trayStateFor(status({ stale: true }), START)).to.equal('hidden');
  expect(trayStateFor(undefined, START)).to.equal('hidden');
});

it('reminds ten minutes before, not earlier (D7)', () => {
  expect(dueReminders(status(), START - 11 * MIN, none())).to.deep.equal([]);
  expect(dueReminders(status(), START - 10 * MIN, none()).map((r) => r.kind)).to.deep.equal(['soon']);
});

it('reminds on first sighting when already inside the ten minutes', () => {
  expect(dueReminders(status(), START - 3 * MIN, none()).map((r) => r.kind)).to.deep.equal(['soon']);
});

it('still reminds when the start has passed but it is not live yet', () => {
  expect(dueReminders(status(), START + 2 * MIN, none()).map((r) => r.kind)).to.deep.equal(['soon']);
});

it('reminds once when live, and first seen live means only that one', () => {
  expect(dueReminders(live(), START, none()).map((r) => r.kind)).to.deep.equal(['live']);
});

it('never repeats a reminder already shown', () => {
  expect(dueReminders(status(), START - 5 * MIN, new Set(['v1:soon']))).to.deep.equal([]);
  expect(dueReminders(live(), START, new Set(['v1:live']))).to.deep.equal([]);
});

it('never reminds from a stale answer', () => {
  expect(dueReminders(status({ stale: true }), START - 5 * MIN, none())).to.deep.equal([]);
});
```

- [ ] **Step 3: Run and watch them fail**

- [ ] **Step 4: Write the schedule**

```ts
import { UMBRACOFFEE_REMINDER_LEAD_MS } from './constants.js';
import type { UmbraCoffeeCurrent, UmbraCoffeeEpisode, UmbraCoffeeStatus } from './types.js';

/**
 * Every decision umbraCoffee's client makes, as functions of the endpoint's answer and the clock, so
 * the rules in the design (§6, D4, D6, D7) are tested by calling them.
 */

/** What the window leads with. */
export type UmbraCoffeeView =
  | { kind: 'live'; episode: UmbraCoffeeCurrent }
  | { kind: 'upcoming'; episode: UmbraCoffeeCurrent; start: Date; minutesLeft: number }
  | { kind: 'latest'; episode: UmbraCoffeeEpisode }
  | { kind: 'empty' };

/** The cup's three looks. */
export type UmbraCoffeeTrayState = 'hidden' | 'upcoming' | 'live';

/** The two reminders. */
export type UmbraCoffeeReminderKind = 'soon' | 'live';

/** A reminder that should be raised now. */
export interface UmbraCoffeeDueReminder {
  kind: UmbraCoffeeReminderKind;
  episode: UmbraCoffeeCurrent;
}

/**
 * The current episode, unless the answer is stale. A stale answer's "upcoming" may be long over,
 * and the rule is a missed reminder, never a wrong one (design D4).
 * @param status The answer, if any.
 * @returns The trustworthy current episode, or null.
 */
function trusted(status: UmbraCoffeeStatus | undefined): UmbraCoffeeCurrent | null {
  if (!status || status.stale || !status.current) return null;
  if (status.current.state === 'upcoming' && !status.current.scheduledStart) return null;
  return status.current;
}

/**
 * The key a shown reminder is recorded under.
 * @param videoId The episode.
 * @param kind Which reminder.
 * @returns The key.
 */
export function reminderKey(videoId: string, kind: UmbraCoffeeReminderKind): string {
  return `${videoId}:${kind}`;
}

/**
 * What the window leads with.
 * @param status The answer, if any.
 * @param now Epoch ms.
 * @returns The view.
 */
export function viewFor(status: UmbraCoffeeStatus | undefined, now: number): UmbraCoffeeView {
  const current = trusted(status);
  if (current?.state === 'live') return { kind: 'live', episode: current };
  if (current?.state === 'upcoming') {
    const start = new Date(current.scheduledStart!);
    return { kind: 'upcoming', episode: current, start, minutesLeft: Math.max(0, Math.ceil((start.getTime() - now) / 60_000)) };
  }
  const latest = status?.episodes[0];
  return latest ? { kind: 'latest', episode: latest } : { kind: 'empty' };
}

/**
 * The cup's look (design D6): only while something is upcoming or live.
 * @param status The answer, if any.
 * @param now Epoch ms. Unused today; taken so the cup's rule can depend on time without a signature change.
 * @returns The state.
 */
export function trayStateFor(status: UmbraCoffeeStatus | undefined, now: number): UmbraCoffeeTrayState {
  void now;
  return trusted(status)?.state ?? 'hidden';
}

/**
 * The reminders due now that have not been shown (design D7).
 * @param status The answer, if any.
 * @param now Epoch ms.
 * @param shown Keys of reminders this browser has already shown.
 * @returns Zero or one reminder.
 */
export function dueReminders(
  status: UmbraCoffeeStatus | undefined,
  now: number,
  shown: ReadonlySet<string>,
): UmbraCoffeeDueReminder[] {
  const current = trusted(status);
  if (!current) return [];
  if (current.state === 'live') {
    return shown.has(reminderKey(current.videoId, 'live')) ? [] : [{ kind: 'live', episode: current }];
  }
  const start = Date.parse(current.scheduledStart!);
  if (start - now > UMBRACOFFEE_REMINDER_LEAD_MS) return [];
  return shown.has(reminderKey(current.videoId, 'soon')) ? [] : [{ kind: 'soon', episode: current }];
}
```

- [ ] **Step 5: Write the reminder record, test-first**

Tests: reading from empty storage gives an empty set; after `markReminded(storage, 'v1:soon')` the
set has it; junk in storage reads as empty; a storage that throws on access reads as empty and marking
does not throw; only the newest 20 keys are kept.

```ts
/** Where this browser remembers which reminders it has shown. */
const STORAGE_KEY = 'umbraDesktopEntertainment.umbraCoffee.reminded';

/** How many keys to keep. Two per episode, so ten episodes of history. */
const KEEP = 20;

/**
 * The reminders this browser has shown, so two desktop tabs or a reload do not repeat one (design
 * §6.3). Per browser, not per user account: a second device may show one again, which is accepted.
 * Every access is guarded, because storage can be blocked or throw, and a reminder system that
 * breaks the cup when it does would be worse than a repeated reminder.
 * @param storage Usually `localStorage`.
 * @returns The shown keys.
 */
export function readReminded(storage: Storage | undefined): Set<string> {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Record a reminder as shown.
 * @param storage Usually `localStorage`.
 * @param key From `reminderKey`.
 */
export function markReminded(storage: Storage | undefined, key: string): void {
  try {
    const keys = [...readReminded(storage)].filter((k) => k !== key);
    storage?.setItem(STORAGE_KEY, JSON.stringify([...keys, key].slice(-KEEP)));
  } catch {
    // Blocked storage: the reminder may repeat. That is the whole cost.
  }
}
```

- [ ] **Step 6: Run and watch everything pass**

---

### Task 14: The store

**Files:**
- Create: `umbracoffee/store.ts`
- Test: `umbracoffee/store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect } from '@open-wc/testing';
import { UmbraCoffeeStore } from './store.js';

const answer = { current: null, episodes: [], fetchedAt: null, stale: false };

/** Timers the test drives. */
function timers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    set: (fn: () => void) => (pending.set(next, fn), next++),
    clear: (id: number) => pending.delete(id),
    fire: () => [...pending.values()].forEach((fn) => fn()),
    get count() { return pending.size; },
  };
}

it('fetches once on the first subscriber and hands the answer to later ones', async () => {
  let calls = 0;
  const t = timers();
  const store = new UmbraCoffeeStore(async () => (calls++, answer), { setInterval: t.set, clearInterval: t.clear });
  const seen: unknown[] = [];
  store.subscribe((s) => seen.push(s));
  await store.settled;
  store.subscribe((s) => seen.push(s));
  expect(calls).to.equal(1);
  expect(seen).to.deep.equal([answer, answer]);
});

it('polls while anyone listens and stops when the last one leaves', async () => {
  let calls = 0;
  const t = timers();
  const store = new UmbraCoffeeStore(async () => (calls++, answer), { setInterval: t.set, clearInterval: t.clear });
  const off = store.subscribe(() => {});
  await store.settled;
  t.fire();
  await store.settled;
  expect(calls).to.equal(2);
  off();
  expect(t.count).to.equal(0);
});

it('keeps the last answer when a fetch fails', async () => {
  let fail = false;
  const t = timers();
  const store = new UmbraCoffeeStore(async () => (fail ? undefined : answer), { setInterval: t.set, clearInterval: t.clear });
  store.subscribe(() => {});
  await store.settled;
  fail = true;
  t.fire();
  await store.settled;
  expect(store.value).to.deep.equal(answer);
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Write the store**

```ts
import { UMBRACOFFEE_ENDPOINT, UMBRACOFFEE_POLL_MS } from './constants.js';
import { isUmbraCoffeeStatus, type UmbraCoffeeStatus } from './types.js';
import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';

/** Fetches one answer, or undefined when there was none to be had. */
export type UmbraCoffeeFetcher = () => Promise<UmbraCoffeeStatus | undefined>;

/** Timer functions, injectable for tests. */
export interface UmbraCoffeeStoreTimers {
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

/**
 * One poller per desktop document (design §4): the cup, the reminders and every open umbraCoffee
 * window read this, so nothing polls twice. It polls only while something listens, which means only
 * while the tray item is switched on or a window is open.
 */
export class UmbraCoffeeStore {
  /** The latest good answer. */
  #value?: UmbraCoffeeStatus;
  /** Who listens. */
  #listeners = new Set<(status: UmbraCoffeeStatus) => void>();
  /** The polling timer, while anyone listens. */
  #timer?: number;
  /** The fetch in flight, so tests and callers can await it. */
  #inflight: Promise<void> = Promise.resolve();

  /**
   * @param fetcher Fetches one answer.
   * @param timers Timer functions; the window's unless a test passes its own.
   */
  constructor(
    private readonly fetcher: UmbraCoffeeFetcher,
    private readonly timers: UmbraCoffeeStoreTimers = {
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (id) => window.clearInterval(id),
    },
  ) {}

  /** The latest good answer, if any. */
  public get value(): UmbraCoffeeStatus | undefined {
    return this.#value;
  }

  /** Resolves when the fetch in flight has finished. */
  public get settled(): Promise<void> {
    return this.#inflight;
  }

  /**
   * Listen. The first listener starts polling; a listener that arrives after an answer gets it at once.
   * @param listener Called with each new answer.
   * @returns Stops listening; the last one to stop stops the polling.
   */
  public subscribe(listener: (status: UmbraCoffeeStatus) => void): () => void {
    this.#listeners.add(listener);
    if (this.#value) listener(this.#value);
    if (this.#timer === undefined) {
      this.#refresh();
      this.#timer = this.timers.setInterval(() => this.#refresh(), UMBRACOFFEE_POLL_MS);
    }
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0 && this.#timer !== undefined) {
        this.timers.clearInterval(this.#timer);
        this.#timer = undefined;
      }
    };
  }

  /** Fetch once and tell everyone, keeping the last answer when this one fails. */
  #refresh() {
    this.#inflight = this.fetcher()
      .catch(() => undefined)
      .then((status) => {
        if (!status) return;
        this.#value = status;
        for (const listener of this.#listeners) listener(status);
      });
  }
}

/**
 * Asks the endpoint through the backoffice's own HTTP client, which already carries the user's token
 * and refreshes it. The `security` entry is what makes the client attach the token.
 * @returns The answer, or undefined.
 */
async function fetchStatus(): Promise<UmbraCoffeeStatus | undefined> {
  const { data } = await umbHttpClient.get({ url: UMBRACOFFEE_ENDPOINT, security: [{ scheme: 'bearer', type: 'http' }] });
  return isUmbraCoffeeStatus(data) ? data : undefined;
}

/** The store every umbraCoffee element in this document shares. */
export const umbraCoffeeStore = new UmbraCoffeeStore(fetchStatus);
```

Check `umbHttpClient.get`'s option names against
`node_modules/@umbraco-cms/backoffice/dist-cms/packages/core/http-client/index.d.ts` before relying on
`security`.

- [ ] **Step 4: Run and watch them pass**

---

### Task 15: The window

**Files:**
- Create: `umbracoffee/umbracoffee.element.ts`
- Test: `umbracoffee/umbracoffee.element.test.ts`

- [ ] **Step 1: Write the failing element tests**, with the element's store replaced by a `UmbraCoffeeStore` over a fixed answer (give the element an optional `store` property that defaults to `umbraCoffeeStore`):

1. Live answer: renders an iframe whose `src` starts with `https://www.youtube-nocookie.com/embed/v1` and a chat iframe whose `src` contains `live_chat?v=v1&embed_domain=` + `location.hostname`.
2. The Hide chat button removes the chat iframe.
3. Upcoming answer: no player iframe; the text contains the title and "25".
4. No current: a player for the latest episode (`embed/v0`), no chat.
5. The episode list renders one button per episode and a link to `UMBRACOFFEE_CHANNEL_URL` with `target="_blank"` and `rel="noopener"`.
6. Clicking an episode puts it in the player.
7. Stale answer: shows `umbraCoffeeUnavailable` text and the episodes, and no countdown.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Write the element**

The skeleton, with every behaviour the tests name:

```ts
import { UMBRACOFFEE_CHANNEL_URL, UMBRACOFFEE_CHAT_WIDTH } from './constants.js';
import { viewFor } from './schedule.js';
import { umbraCoffeeStore, type UmbraCoffeeStore } from './store.js';
import type { UmbraCoffeeStatus } from './types.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The umbraCoffee window (design §6.1): the stream and its chat when live, a countdown when coming
 * up, the latest episode otherwise, and the feed's episodes under it.
 *
 * The player and the chat are YouTube's embeds, the privacy-enhanced player and the live chat frame;
 * everything else is drawn here, from the desktop's tokens, so it follows the theme like the games.
 */
@customElement('umbracoffee-app')
export class UmbraCoffeeAppElement extends UmbLitElement {
  /** The store to read. The shared one unless a test passes its own. */
  @property({ attribute: false })
  store: UmbraCoffeeStore = umbraCoffeeStore;

  /** The latest answer. */
  @state() private _status?: UmbraCoffeeStatus;
  /** The clock, ticked while a countdown shows. */
  @state() private _now = Date.now();
  /** An episode the user picked from the list, which overrides what leads. */
  @state() private _picked?: string;
  /** Whether the chat is showing. */
  @state() private _chat = true;

  /** Stops listening to the store. */
  #unsubscribe?: () => void;
  /** Ticks the countdown. */
  #tick?: number;

  override connectedCallback() {
    super.connectedCallback();
    this.#unsubscribe = this.store.subscribe((status) => (this._status = status));
    this.#tick = window.setInterval(() => (this._now = Date.now()), 30_000);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#unsubscribe?.();
    window.clearInterval(this.#tick);
  }

  /**
   * The player for a video.
   * @param videoId The video.
   * @returns The iframe.
   */
  #player(videoId: string) {
    return html`<iframe
      class="player"
      src="https://www.youtube-nocookie.com/embed/${videoId}"
      title=${this.localize.term('umbraDesktopEntertainment_umbraCoffee')}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen></iframe>`;
  }

  /**
   * The live chat. Reading needs nothing; posting needs a YouTube sign-in in this browser.
   * @param videoId The live video.
   * @returns The iframe.
   */
  #chat(videoId: string) {
    return html`<iframe
      class="chat"
      src="https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${location.hostname}"
      title=${this.localize.term('umbraDesktopEntertainment_umbraCoffeeChat')}></iframe>`;
  }

  override render() {
    const view = viewFor(this._status, this._now);
    const picked = this._picked;
    // …lead area: picked ? player(picked)
    //   : view.kind === 'live' ? player + (this._chat ? chat : nothing) + a Hide chat / Chat toggle
    //   : view.kind === 'upcoming' ? card with title, "Starts in N min" and "Starts at <time>"
    //       (time through this.localize.date(view.start, { timeStyle: 'short' }))
    //   : view.kind === 'latest' ? player(view.episode.videoId)
    //   : nothing
    // …stale notice when this._status?.stale
    // …episode list: one <button> per episode setting this._picked, then the channel link
    // …footer line: umbraCoffeeRemindersWhere
    return html`…`;
  }

  static override styles = css`
    :host {
      display: grid;
      grid-template-rows: auto 1fr auto;
      height: 100%;
      overflow: hidden;
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      background: var(--umbradesktop-app-background, var(--uui-color-surface));
    }
    .lead {
      display: grid;
      grid-template-columns: 1fr auto;
    }
    .player {
      width: 100%;
      aspect-ratio: 16 / 9;
      border: 0;
    }
    .chat {
      width: ${UMBRACOFFEE_CHAT_WIDTH}px;
      height: 100%;
      border: 0;
    }
  `;
}

export default UmbraCoffeeAppElement;
```

Fill `render()` from the comment, one test at a time. The time format uses the backoffice locale
through `localize.date` for now; when #88 lands, switch to the settings context's `formatDateTime` so
it follows the desktop's 12/24-hour choice, as the design asks. Check which token names the games use
for their surfaces (`grep -r "umbradesktop-app" backoffice/src`) and use the same ones.

The footer line (D8) says where the switch is, not whether it is on: the user's choice lives in the
settings context, which is not public, and one line of text is not worth new host API.

- [ ] **Step 4: Run and watch them pass, then both gates**

---

### Task 16: The tray cup and the reminder

**Files:**
- Create: `umbracoffee/tray-context.ts`, `umbracoffee/tray-cup.element.ts`, `umbracoffee/reminder-notification.element.ts`
- Test: `umbracoffee/tray-cup.element.test.ts`, `umbracoffee/reminder-notification.element.test.ts`

- [ ] **Step 1: Write the local tray context token**

```ts
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/**
 * The part of the host's tray context this package uses. A local copy, as `umbradesktop-app.d.ts`
 * copies the manifest types: this package may not import the host's source. The alias is the host's
 * public contract (`docs/desktop-apps.md`, Tray items).
 */
export interface UmbraDesktopTrayContextLike {
  /** Open a registered app by alias. False when this user has no such app. */
  openApp(alias: string): boolean;
  /** Switch a tray item on or off. False when the alias is not a tray item. */
  setTrayItemEnabled(alias: string, enabled: boolean): boolean;
}

/** The host's tray context, by its public alias. */
export const UMBRADESKTOP_TRAY_CONTEXT = new UmbContextToken<UmbraDesktopTrayContextLike>('UmbraDesktopTrayContext');
```

- [ ] **Step 2: Write the failing cup tests**, with an injected store and a fake notification context:

1. With no current episode the element has `hidden`.
2. Upcoming: not hidden; its button's title reads the upcoming tooltip with minutes and title.
3. Live: not hidden; it carries `data-state="live"`.
4. Clicking the button calls the tray context's `openApp(UMBRACOFFEE_APP_ALIAS)`.
5. Upcoming at nine minutes: one `peek` with `elementName: 'umbracoffee-reminder-notification'`, `data.kind: 'soon'`, and a duration equal to the time left; a second tick raises nothing more; the key is in the reminder record.
6. Live: one `peek` with `data.kind: 'live'` and `duration: UMBRACOFFEE_LIVE_REMINDER_MS`.

- [ ] **Step 3: Run and watch them fail**

- [ ] **Step 4: Write the cup**

```ts
import { UMBRACOFFEE_APP_ALIAS, UMBRACOFFEE_LIVE_REMINDER_MS } from './constants.js';
import { markReminded, readReminded } from './reminder-record.js';
import { dueReminders, reminderKey, trayStateFor, viewFor, type UmbraCoffeeDueReminder } from './schedule.js';
import { umbraCoffeeStore, type UmbraCoffeeStore } from './store.js';
import { UMBRADESKTOP_TRAY_CONTEXT, type UmbraDesktopTrayContextLike } from './tray-context.js';
import type { UmbraCoffeeStatus } from './types.js';
import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';

/**
 * The umbraCoffee cup in the tray (design §6.2), and the one place reminders are raised (§6.3).
 *
 * Reminders live here rather than in a service of their own because the switch that turns the cup
 * off must turn the reminders off too (D1, D8): switched off, this element is not in the tray at all,
 * so nothing here runs.
 */
@customElement('umbracoffee-tray-cup')
export class UmbraCoffeeTrayCupElement extends UmbLitElement {
  /** The store to read. The shared one unless a test passes its own. */
  @property({ attribute: false })
  store: UmbraCoffeeStore = umbraCoffeeStore;

  /** The latest answer. */
  @state() private _status?: UmbraCoffeeStatus;
  /** The clock. */
  @state() private _now = Date.now();

  /** The tray context, for opening the app. */
  #tray?: UmbraDesktopTrayContextLike;
  /** Where reminders are raised: the desktop's own document, so the desktop draws them (D15). */
  #notifications?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;
  /** Stops listening to the store. */
  #unsubscribe?: () => void;
  /** Ticks the clock so a reminder can fall due between two polls. */
  #tick?: number;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_TRAY_CONTEXT, (tray) => (this.#tray = tray));
    this.consumeContext(UMB_NOTIFICATION_CONTEXT, (notifications) => (this.#notifications = notifications));
  }

  override connectedCallback() {
    super.connectedCallback();
    this.#unsubscribe = this.store.subscribe((status) => (this._status = status));
    this.#tick = window.setInterval(() => (this._now = Date.now()), 30_000);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#unsubscribe?.();
    window.clearInterval(this.#tick);
  }

  /** Hide when there is nothing to show, and raise what has fallen due. */
  override willUpdate() {
    const state = trayStateFor(this._status, this._now);
    this.hidden = state === 'hidden';
    this.dataset.state = state;
    this.#remind();
  }

  /** Raise each due reminder once, and record it. */
  #remind() {
    if (!this.#notifications) return;
    const shown = readReminded(window.localStorage);
    for (const due of dueReminders(this._status, this._now, shown)) {
      markReminded(window.localStorage, reminderKey(due.episode.videoId, due.kind));
      this.#notifications.peek('default', {
        elementName: 'umbracoffee-reminder-notification',
        data: this.#reminderData(due),
        duration: this.#durationOf(due),
      });
    }
  }

  /**
   * How long a reminder stays. Timed rather than staying until closed, because the original raised in
   * the desktop's document is hidden (the desktop draws its own toast), and a timed one clears itself.
   * @param due The reminder.
   * @returns Milliseconds.
   */
  #durationOf(due: UmbraCoffeeDueReminder): number {
    if (due.kind === 'live') return UMBRACOFFEE_LIVE_REMINDER_MS;
    return Math.max(60_000, Date.parse(due.episode.scheduledStart!) - this._now);
  }

  /**
   * The reminder's data. `headline` and `message` are also what the desktop's scrollback shows, so
   * they carry the whole message; the element adds the buttons.
   * @param due The reminder.
   * @returns The data.
   */
  #reminderData(due: UmbraCoffeeDueReminder) {
    const soon = due.kind === 'soon';
    const at = soon ? this.localize.date(new Date(due.episode.scheduledStart!), { timeStyle: 'short' }) : '';
    return {
      headline: this.localize.term(soon ? 'umbraDesktopEntertainment_umbraCoffeeSoonHeadline' : 'umbraDesktopEntertainment_umbraCoffeeLiveHeadline'),
      message: soon ? `${due.episode.title}. ${this.localize.term('umbraDesktopEntertainment_umbraCoffeeStartsAt', at)}` : due.episode.title,
      kind: due.kind,
      videoId: due.episode.videoId,
    };
  }

  override render() {
    const view = viewFor(this._status, this._now);
    const label =
      view.kind === 'live'
        ? this.localize.term('umbraDesktopEntertainment_umbraCoffeeTrayLive', view.episode.title)
        : view.kind === 'upcoming'
          ? this.localize.term('umbraDesktopEntertainment_umbraCoffeeTrayUpcoming', view.minutesLeft, view.episode.title)
          : '';
    return html`<button class="cup" title=${label} aria-label=${label} @click=${() => this.#tray?.openApp(UMBRACOFFEE_APP_ALIAS)}>
      <!-- A cup drawn here: steam while upcoming, a live dot while live. -->
      <svg viewBox="0 0 16 16" aria-hidden="true">…</svg>
    </button>`;
  }

  static override styles = css`
    :host {
      display: inline-flex;
      align-items: center;
    }
    .cup {
      display: inline-flex;
      align-items: center;
      height: 100%;
      padding: 0 var(--uui-size-space-2);
      border: 0;
      background: none;
      color: inherit;
      cursor: pointer;
      border-radius: var(--uui-border-radius);
    }
    .cup:hover {
      background: var(--umbradesktop-task-hover-background, rgba(255, 255, 255, 0.1));
    }
  `;
}

export default UmbraCoffeeTrayCupElement;
```

Draw the SVG with `currentColor` so every theme's tray text colour applies: a cup, two steam curves
shown only under `:host([data-state='upcoming'])` with a slow rise animation (behind
`prefers-reduced-motion: no-preference`), and a small dot in `--umbradesktop-notice-error-color`
shown only under `:host([data-state='live'])`.

- [ ] **Step 5: Write the failing reminder element tests**: given `data` for a soon reminder, it shows the headline, the message, a Watch button and a Stop reminding me button; Watch calls `openApp(UMBRACOFFEE_APP_ALIAS)` and `notificationHandler.close()`; Stop reminding me calls `setTrayItemEnabled(UMBRACOFFEE_TRAY_ALIAS, false)` and `close()`.

- [ ] **Step 6: Write the reminder element**

```ts
import { UMBRACOFFEE_APP_ALIAS, UMBRACOFFEE_TRAY_ALIAS } from './constants.js';
import { UMBRADESKTOP_TRAY_CONTEXT, type UmbraDesktopTrayContextLike } from './tray-context.js';
import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** What the cup raises a reminder with. */
interface UmbraCoffeeReminderData {
  headline: string;
  message: string;
  kind: 'soon' | 'live';
  videoId: string;
}

/**
 * A reminder, drawn on the desktop toast (design D15) with its two buttons: Watch, and Stop reminding
 * me, which switches the tray item off exactly as its switch in Desktop settings does (D8).
 */
@customElement('umbracoffee-reminder-notification')
export class UmbraCoffeeReminderNotificationElement extends UmbLitElement {
  /** Set by the desktop toast, as Umbraco's container sets it on a notification layout. */
  @property({ attribute: false })
  data?: UmbraCoffeeReminderData;

  /** Set by the desktop toast; closing it takes the toast down. */
  @property({ attribute: false })
  notificationHandler?: { close(): void };

  /** The tray context. */
  #tray?: UmbraDesktopTrayContextLike;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_TRAY_CONTEXT, (tray) => (this.#tray = tray));
  }

  /** Open the app and close the reminder. */
  #watch() {
    this.#tray?.openApp(UMBRACOFFEE_APP_ALIAS);
    this.notificationHandler?.close();
  }

  /** Switch the reminders and the cup off, and close the reminder. */
  #stop() {
    this.#tray?.setTrayItemEnabled(UMBRACOFFEE_TRAY_ALIAS, false);
    this.notificationHandler?.close();
  }

  override render() {
    return html`
      <strong class="headline">${this.data?.headline}</strong>
      <span class="message">${this.data?.message}</span>
      <div class="actions">
        <uui-button look="primary" compact @click=${this.#watch}
          >${this.localize.term('umbraDesktopEntertainment_umbraCoffeeWatch')}</uui-button
        >
        <uui-button look="secondary" compact @click=${this.#stop}
          >${this.localize.term('umbraDesktopEntertainment_umbraCoffeeStopReminding')}</uui-button
        >
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: grid;
      gap: var(--uui-size-space-2);
    }
    .actions {
      display: flex;
      gap: var(--uui-size-space-2);
    }
  `;
}

export default UmbraCoffeeReminderNotificationElement;
```

The reminder element must be defined before the desktop toast tries to draw it: the toast checks
`customElements.get`. Import it from `tray-cup.element.ts` (`import './reminder-notification.element.js';`)
so loading the cup defines it.

- [ ] **Step 7: Run and watch them pass, then both gates**

---

### Task 17: Documentation

**Files:** Entertainment `README.md`, root `README.md`, `umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json`, the Entertainment csproj `Description`/`PackageTags`, the design doc.

- [ ] **Step 1:** Entertainment README: umbraCoffee under What's in it (what the window does, the cup, the reminders, the switch in Desktop settings), and a plain note that the site's server contacts YouTube every five minutes while someone has the desktop open, with nothing to configure. Update the opening line, which says the package is games.
- [ ] **Step 2:** Root README: every place that lists what Entertainment brings. Find them with `grep -n -i "entertainment\|minesweeper" README.md`.
- [ ] **Step 3:** Marketplace JSON: tags `umbracoffee`, `youtube`, `community`, `media`. The Description stays a hook; it currently says "Games for UmbraDesktop", which is no longer the whole package, so change "Games" to "Games and media" and nothing else. Mirror that in the csproj `Description`, and add the same tags to `PackageTags`.
- [ ] **Step 4:** Design doc: set Status to implemented with the date, and add a "What the build taught" section for anything this plan did not predict.

---

### Task 18: Browser pass

- [ ] **Step 1:** Build both packages and run the test instance (the memory note on worktree instances applies: build the frontends before `dotnet build`, and revert the TestInstance lock-file change afterwards).
- [ ] **Step 2:** Under each of the five themes, with the cup forced visible (temporarily return a live answer from the service, or set the element's `hidden` off in dev tools): screenshot the tray, and check the empty tray against a screenshot of `main`. The empty tray must match.
- [ ] **Step 3:** Open umbraCoffee at its default and minimum sizes. The player and chat load from `localhost`; the chat's `embed_domain` must be the page's hostname.
- [ ] **Step 4:** Raise a reminder (temporarily lower the lead or fake an upcoming answer) and click Watch and Stop reminding me. Watch opens the window; Stop reminding me turns the switch off in Desktop settings and the cup disappears.
- [ ] **Step 5:** Remove every temporary change. `git diff` must show none of them.

---

### Task 19: Review

- [ ] **Step 1:** Run `superpowers:requesting-code-review` over the whole diff against the design doc.
- [ ] **Step 2:** Walk the repository's definition of done (CLAUDE.md) and say which items did not apply.
- [ ] **Step 3:** Offer a commit, as a question.

---

## Deliberately left for later

- **30 October check (design §8, risk 1):** from 10:45 UK time, watch the feed and the endpoint to see
  when the scheduled stream appears. If it appears later than ten minutes before, the soon reminder
  already fires on sighting; only the design doc needs the observation.
- **A real live fixture.** Capture NASA's or umbraCoffee's page while live and replace the synthesised
  one in `Live_page_is_live`.
- **12/24-hour time from the desktop's settings** once #88 makes `formatDateTime` public.
