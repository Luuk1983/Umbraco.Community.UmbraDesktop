# UmbraDesktop — Phase 1: Desktop shell + window manager + one iframe window — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the smallest end-to-end proof of UmbraDesktop — a "Desktop" backoffice section that fills the screen and can open a hard-coded "Content" app as a draggable iframe window whose Umbraco header is stripped, with an Umbraco-logo start button on a bottom taskbar.

**Architecture:** A `section` extension renders a `<umbradesktop-desktop>` element. That element provides an `UmbraDesktopWindowManagerContext` (an Umbraco context wrapping an `UmbArrayState` of window models) and renders a wallpaper, a window layer, and a `<umbradesktop-taskbar>`. Each open window is a `<umbradesktop-window>` hosting an `<iframe>` deep-linked into the backoffice; on load it injects a same-origin stylesheet that hides the inner `umb-backoffice-header` per a "chrome profile". All window-list math and the injected CSS are pure functions, unit-tested; the Lit elements are verified manually in the running Test Instance.

**Tech Stack:** TypeScript, Lit 3, `@umbraco-cms/backoffice` (UUI components + design tokens, contexts, extension registry), Vite (lib build), `@web/test-runner` + `@open-wc/testing` for unit tests.

---

## Scope

This plan covers **Phase 1 only** (design doc §11.1). It deliberately excludes: the `desktopApp` extension type + auto-derivation (Phase 2/3), the fullscreen app drawer (Phase 3), localStorage persistence (Phase 4), and manual edge-resize of windows (deferred — see "Deferred within Phase 1" at the end). Later phases get their own plans.

**Prerequisite (once, before Task 0):** dependencies must be installed.

```bash
cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop"
npm install
```

The runnable backoffice for manual verification is the scaffolded Test Instance:

```bash
cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop.TestInstance"
dotnet run
```

All frontend paths below are relative to
`src/Umbraco.Community.UmbraDesktop/` (the RCL root, where `package.json` lives). Its
frontend source lives under `backoffice/src/`.

---

## File structure

New `desktop` module under `backoffice/src/desktop/`, one responsibility per file:

| File | Responsibility |
|------|----------------|
| `backoffice/src/desktop/constants.ts` | Section alias, App_Plugins path, element tag names, taskbar height. |
| `backoffice/src/desktop/types.ts` | `UmbraDesktopChromeProfile`, `UmbraDesktopWindow`, `UmbraDesktopApp`, `Rect` types. |
| `backoffice/src/desktop/window-model.ts` | **Pure** window-list functions (nextZIndex, nextWindowRect, focus/remove/move/setState). No Umbraco imports. |
| `backoffice/src/desktop/window-model.test.ts` | Unit tests for `window-model.ts`. |
| `backoffice/src/desktop/chrome-injector.ts` | `buildChromeCss(profile)` (**pure**) + `injectChromeStyles(iframe, profile)` (DOM side-effect). |
| `backoffice/src/desktop/chrome-injector.test.ts` | Unit tests for `buildChromeCss`. |
| `backoffice/src/desktop/apps.ts` | The hard-coded Phase-1 app catalogue (just "Content"). |
| `backoffice/src/desktop/window-manager.context.ts` | Umbraco context: `UmbArrayState<UmbraDesktopWindow>` + methods delegating to `window-model.ts`. |
| `backoffice/src/desktop/window-manager.context-token.ts` | `UMBRADESKTOP_WINDOW_MANAGER_CONTEXT` token. |
| `backoffice/src/desktop/components/window.element.ts` | `<umbradesktop-window>` — title bar (controls right), iframe, drag, min/max/close, focus. |
| `backoffice/src/desktop/components/taskbar.element.ts` | `<umbradesktop-taskbar>` — Umbraco-logo start button, running-window buttons, clock. |
| `backoffice/src/desktop/components/desktop.element.ts` | `<umbradesktop-desktop>` — provides context, renders wallpaper + window layer + taskbar, hides the outer backoffice header while mounted. |
| `backoffice/src/desktop/manifest.ts` | The `section` manifest. |
| `backoffice/src/bundle.manifests.ts` | **Modify** — include the desktop manifests. |
| `backoffice/public/umbraco-package.json` | **Modify** — add the compiled `bundle` extension. |
| `backoffice/web-test-runner.config.mjs` | **Create** — test runner config. |
| `package.json` | **Modify** — add test deps + `test` script. |

---

## Task 0: Frontend test tooling

**Files:**
- Modify: `package.json`
- Create: `backoffice/web-test-runner.config.mjs`
- Create: `backoffice/src/desktop/smoke.test.ts` (throwaway, removed at end of task)

- [ ] **Step 1: Add dev dependencies and a test script**

Edit `package.json` — add to `devDependencies` and `scripts`:

```jsonc
// scripts:
"test": "cd backoffice && web-test-runner \"src/**/*.test.ts\" --node-resolve",
"test:watch": "cd backoffice && web-test-runner \"src/**/*.test.ts\" --node-resolve --watch",
// devDependencies (add):
"@web/test-runner": "^0.20.0",
"@web/dev-server-esbuild": "^1.0.4",
"@open-wc/testing": "^4.0.0",
"@types/mocha": "^10.0.9"
```

- [ ] **Step 2: Create the test runner config**

Create `backoffice/web-test-runner.config.mjs`:

```js
import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: ['src/**/*.test.ts'],
  nodeResolve: true,
  plugins: [esbuildPlugin({ ts: true, target: 'es2020' })],
  testFramework: { config: { timeout: '5000' } },
};
```

- [ ] **Step 3: Install**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm install`
Expected: exits 0; `node_modules/.bin/web-test-runner` exists.

- [ ] **Step 4: Add a throwaway smoke test to prove the runner works**

Create `backoffice/src/desktop/smoke.test.ts`:

```ts
import { expect } from '@open-wc/testing';

it('runs the test runner', () => {
  expect(1 + 1).to.equal(2);
});
```

- [ ] **Step 5: Run the test**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Remove the smoke test**

Delete `backoffice/src/desktop/smoke.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json backoffice/web-test-runner.config.mjs
git commit -m "test: add web-test-runner + open-wc test tooling"
```

---

## Task 1: Types + constants

**Files:**
- Create: `backoffice/src/desktop/constants.ts`
- Create: `backoffice/src/desktop/types.ts`

- [ ] **Step 1: Create constants**

Create `backoffice/src/desktop/constants.ts`:

```ts
/** Alias of the UmbraDesktop backoffice section. */
export const UMBRADESKTOP_SECTION_ALIAS = 'Umbraco.Community.UmbraDesktop.Section';

/** URL segment for the section (…/umbraco/section/<pathname>). */
export const UMBRADESKTOP_SECTION_PATHNAME = 'umbradesktop';

/** Height of the taskbar/panel in pixels. */
export const UMBRADESKTOP_TASKBAR_HEIGHT = 44;
```

- [ ] **Step 2: Create types**

Create `backoffice/src/desktop/types.ts`:

```ts
/**
 * How much of the backoffice shell a window keeps. Lower confidence in an app
 * means keeping more chrome so it still works (see design doc §4.1).
 */
export type UmbraDesktopChromeProfile = 'full-section' | 'workspace-only' | 'bare';

/** A launchable app: a backoffice deep-link plus how to frame it. */
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
}

/** A position/size rectangle in desktop pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Runtime state of a single open window. */
export type UmbraDesktopWindowState = 'normal' | 'minimized' | 'maximized';

/** One open window instance on the desktop. */
export interface UmbraDesktopWindow {
  /** Unique per-instance id. */
  id: string;
  /** The app this window hosts. */
  app: UmbraDesktopApp;
  /** Current rectangle (used when state === 'normal'). */
  rect: Rect;
  /** Stacking order; higher is nearer the front. */
  z: number;
  /** Whether this window currently has focus. */
  active: boolean;
  /** Window state. */
  state: UmbraDesktopWindowState;
}
```

- [ ] **Step 3: Type-check**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backoffice/src/desktop/constants.ts backoffice/src/desktop/types.ts
git commit -m "feat: add UmbraDesktop types and constants"
```

---

## Task 2: Pure window-list logic (TDD)

**Files:**
- Test: `backoffice/src/desktop/window-model.test.ts`
- Create: `backoffice/src/desktop/window-model.ts`

- [ ] **Step 1: Write the failing tests**

Create `backoffice/src/desktop/window-model.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import {
  nextZIndex,
  nextWindowRect,
  focusWindow,
  removeWindow,
  moveWindow,
  setWindowState,
} from './window-model';
import type { UmbraDesktopApp, UmbraDesktopWindow } from './types';

const app: UmbraDesktopApp = {
  alias: 'a', name: 'A', icon: 'icon-umbraco', url: '/x', chromeProfile: 'bare',
};

function win(id: string, z: number, over: Partial<UmbraDesktopWindow> = {}): UmbraDesktopWindow {
  return { id, app, rect: { x: 0, y: 0, w: 100, h: 100 }, z, active: false, state: 'normal', ...over };
}

it('nextZIndex is 1 for an empty desktop', () => {
  expect(nextZIndex([])).to.equal(1);
});

it('nextZIndex is one above the current max', () => {
  expect(nextZIndex([win('a', 3), win('b', 7), win('c', 2)])).to.equal(8);
});

it('nextWindowRect cascades by window count and uses the given size', () => {
  const r0 = nextWindowRect(0, { w: 800, h: 600 });
  const r1 = nextWindowRect(1, { w: 800, h: 600 });
  expect(r0).to.deep.equal({ x: 40, y: 40, w: 800, h: 600 });
  expect(r1.x).to.be.greaterThan(r0.x);
  expect(r1.y).to.be.greaterThan(r0.y);
  expect(r1.w).to.equal(800);
});

it('nextWindowRect wraps the cascade after 6 windows', () => {
  expect(nextWindowRect(6, { w: 800, h: 600 })).to.deep.equal(nextWindowRect(0, { w: 800, h: 600 }));
});

it('focusWindow activates only the target and bumps it to the front', () => {
  const result = focusWindow([win('a', 1, { active: true }), win('b', 2)], 'b');
  const a = result.find((w) => w.id === 'a')!;
  const b = result.find((w) => w.id === 'b')!;
  expect(b.active).to.be.true;
  expect(a.active).to.be.false;
  expect(b.z).to.be.greaterThan(a.z);
});

it('focusWindow un-minimizes the target', () => {
  const result = focusWindow([win('a', 1, { state: 'minimized' })], 'a');
  expect(result[0].state).to.equal('normal');
});

it('removeWindow drops the target', () => {
  const result = removeWindow([win('a', 1), win('b', 2)], 'a');
  expect(result.map((w) => w.id)).to.deep.equal(['b']);
});

it('moveWindow updates only the target rectangle position', () => {
  const result = moveWindow([win('a', 1), win('b', 2)], 'a', 15, 25);
  expect(result.find((w) => w.id === 'a')!.rect).to.include({ x: 15, y: 25 });
  expect(result.find((w) => w.id === 'b')!.rect).to.include({ x: 0, y: 0 });
});

it('setWindowState toggles maximize/minimize/normal on the target only', () => {
  const result = setWindowState([win('a', 1), win('b', 2)], 'a', 'maximized');
  expect(result.find((w) => w.id === 'a')!.state).to.equal('maximized');
  expect(result.find((w) => w.id === 'b')!.state).to.equal('normal');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: FAIL — cannot resolve `./window-model`.

- [ ] **Step 3: Implement the pure functions**

Create `backoffice/src/desktop/window-model.ts`:

```ts
import type { Rect, UmbraDesktopWindow, UmbraDesktopWindowState } from './types';

const CASCADE_STEP = 28;
const CASCADE_WRAP = 6;
const CASCADE_ORIGIN = 40;

/** The z-index a newly focused/opened window should take (front of the stack). */
export function nextZIndex(windows: ReadonlyArray<UmbraDesktopWindow>): number {
  return windows.reduce((max, w) => Math.max(max, w.z), 0) + 1;
}

/** A cascaded rectangle for the Nth opened window, using the app's default size. */
export function nextWindowRect(count: number, size: { w: number; h: number }): Rect {
  const step = (count % CASCADE_WRAP) * CASCADE_STEP;
  return { x: CASCADE_ORIGIN + step, y: CASCADE_ORIGIN + step, w: size.w, h: size.h };
}

/** Return a new list where `id` is active, front-most and un-minimized. */
export function focusWindow(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  id: string,
): UmbraDesktopWindow[] {
  const top = nextZIndex(windows);
  return windows.map((w) =>
    w.id === id
      ? { ...w, active: true, z: top, state: w.state === 'minimized' ? 'normal' : w.state }
      : { ...w, active: false },
  );
}

/** Return a new list without `id`. */
export function removeWindow(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  id: string,
): UmbraDesktopWindow[] {
  return windows.filter((w) => w.id !== id);
}

/** Return a new list with `id`'s rectangle moved to (x, y). */
export function moveWindow(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  id: string,
  x: number,
  y: number,
): UmbraDesktopWindow[] {
  return windows.map((w) => (w.id === id ? { ...w, rect: { ...w.rect, x, y } } : w));
}

/** Return a new list with `id`'s window state set. */
export function setWindowState(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  id: string,
  state: UmbraDesktopWindowState,
): UmbraDesktopWindow[] {
  return windows.map((w) => (w.id === id ? { ...w, state } : w));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: PASS — all `window-model` tests green.

- [ ] **Step 5: Commit**

```bash
git add backoffice/src/desktop/window-model.ts backoffice/src/desktop/window-model.test.ts
git commit -m "feat: add pure window-list logic with tests"
```

---

## Task 3: Chrome injector (TDD for the pure part)

**Files:**
- Test: `backoffice/src/desktop/chrome-injector.test.ts`
- Create: `backoffice/src/desktop/chrome-injector.ts`

- [ ] **Step 1: Write the failing tests**

Create `backoffice/src/desktop/chrome-injector.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { buildChromeCss } from './chrome-injector';

it('every profile hides the outer backoffice header', () => {
  for (const p of ['full-section', 'workspace-only', 'bare'] as const) {
    expect(buildChromeCss(p)).to.contain('umb-backoffice-header');
    expect(buildChromeCss(p)).to.contain('display: none');
  }
});

it('full-section keeps the section sidebar', () => {
  expect(buildChromeCss('full-section')).to.not.contain('umb-section-sidebar');
});

it('workspace-only and bare also hide the section sidebar', () => {
  expect(buildChromeCss('workspace-only')).to.contain('umb-section-sidebar');
  expect(buildChromeCss('bare')).to.contain('umb-section-sidebar');
});

it('makes the main area fill the viewport height', () => {
  expect(buildChromeCss('full-section')).to.contain('umb-backoffice-main');
  expect(buildChromeCss('full-section')).to.contain('height: 100%');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: FAIL — cannot resolve `./chrome-injector`.

- [ ] **Step 3: Implement**

Create `backoffice/src/desktop/chrome-injector.ts`:

```ts
import type { UmbraDesktopChromeProfile } from './types';

const STYLE_ID = 'umbradesktop-injected-chrome';

/**
 * Build the CSS injected into a window's iframe to strip backoffice chrome.
 * Targets stable custom-element tags rather than classes (design doc §4.1).
 * @param profile How much shell to keep.
 * @returns A CSS string.
 */
export function buildChromeCss(profile: UmbraDesktopChromeProfile): string {
  // Always: hide the top header and let the main area take the full height
  // (the shell normally reserves 60px for the header).
  const base = `
    umb-backoffice-header { display: none !important; }
    umb-backoffice-main { height: 100% !important; }
  `;
  if (profile === 'full-section') {
    return base;
  }
  // workspace-only / bare: also drop the section's sidebar (tree/menu).
  return `${base}
    umb-section-sidebar { display: none !important; }
  `;
}

/**
 * Inject (or refresh) the chrome-stripping stylesheet into a same-origin iframe.
 * No-op if the iframe document is not reachable (e.g. cross-origin or not ready).
 * @param iframe The window's iframe.
 * @param profile The chrome profile to apply.
 */
export function injectChromeStyles(
  iframe: HTMLIFrameElement,
  profile: UmbraDesktopChromeProfile,
): void {
  const doc = iframe.contentDocument;
  if (!doc?.head) return;
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = buildChromeCss(profile);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backoffice/src/desktop/chrome-injector.ts backoffice/src/desktop/chrome-injector.test.ts
git commit -m "feat: add iframe chrome-stripping injector with tests"
```

---

## Task 4: Hard-coded app catalogue

**Files:**
- Create: `backoffice/src/desktop/apps.ts`

- [ ] **Step 1: Create the Phase-1 app list**

Create `backoffice/src/desktop/apps.ts`:

```ts
import type { UmbraDesktopApp } from './types';

/**
 * Phase 1 catalogue: a single hard-coded app that proves the iframe + chrome
 * strip end-to-end. Replaced by the desktopApp extension type + auto-derivation
 * in Phase 2/3.
 */
export const UMBRADESKTOP_APPS: UmbraDesktopApp[] = [
  {
    alias: 'content',
    name: 'Content',
    icon: 'icon-documents',
    url: '/umbraco/section/content',
    chromeProfile: 'full-section',
    defaultSize: { w: 900, h: 640 },
  },
];
```

- [ ] **Step 2: Type-check**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backoffice/src/desktop/apps.ts
git commit -m "feat: add hard-coded Phase-1 app catalogue"
```

---

## Task 5: Window manager context + token

**Files:**
- Create: `backoffice/src/desktop/window-manager.context-token.ts`
- Create: `backoffice/src/desktop/window-manager.context.ts`

- [ ] **Step 1: Create the context token**

Create `backoffice/src/desktop/window-manager.context-token.ts`:

```ts
import type { UmbraDesktopWindowManagerContext } from './window-manager.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** Context token for the desktop window manager. */
export const UMBRADESKTOP_WINDOW_MANAGER_CONTEXT =
  new UmbContextToken<UmbraDesktopWindowManagerContext>('UmbraDesktopWindowManagerContext');
```

- [ ] **Step 2: Create the context**

Create `backoffice/src/desktop/window-manager.context.ts`:

```ts
import type { UmbraDesktopApp, UmbraDesktopWindow, UmbraDesktopWindowState } from './types';
import {
  focusWindow,
  moveWindow,
  nextWindowRect,
  nextZIndex,
  removeWindow,
  setWindowState,
} from './window-model';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from './window-manager.context-token';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

const DEFAULT_SIZE = { w: 800, h: 600 };

/**
 * Owns the list of open desktop windows and the operations on it. Provided by
 * the desktop element so it is scoped to the desktop subtree.
 */
export class UmbraDesktopWindowManagerContext extends UmbContextBase {
  #windows = new UmbArrayState<UmbraDesktopWindow>([], (w) => w.id);

  /** Observable list of open windows. */
  public readonly windows = this.#windows.asObservable();

  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT);
  }

  /** Open a new window for the given app and focus it. */
  public open(app: UmbraDesktopApp): void {
    const current = this.#windows.getValue();
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

  /** Bring a window to the front and activate it. */
  public focus(id: string): void {
    this.#windows.setValue(focusWindow(this.#windows.getValue(), id));
  }

  /** Close a window. */
  public close(id: string): void {
    this.#windows.setValue(removeWindow(this.#windows.getValue(), id));
  }

  /** Move a window to an absolute desktop position. */
  public move(id: string, x: number, y: number): void {
    this.#windows.setValue(moveWindow(this.#windows.getValue(), id, x, y));
  }

  /** Set a window's state (normal / minimized / maximized). */
  public setState(id: string, state: UmbraDesktopWindowState): void {
    this.#windows.setValue(setWindowState(this.#windows.getValue(), id, state));
  }
}

export default UmbraDesktopWindowManagerContext;
```

- [ ] **Step 3: Type-check**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors. (If `crypto.randomUUID` is flagged, confirm `lib` includes `DOM` — it does in `tsconfig.json`.)

- [ ] **Step 4: Commit**

```bash
git add backoffice/src/desktop/window-manager.context.ts backoffice/src/desktop/window-manager.context-token.ts
git commit -m "feat: add desktop window manager context"
```

---

## Task 6: The window element

**Files:**
- Create: `backoffice/src/desktop/components/window.element.ts`

- [ ] **Step 1: Implement `<umbradesktop-window>`**

Create `backoffice/src/desktop/components/window.element.ts`:

```ts
import type { UmbraDesktopWindow } from '../types';
import { injectChromeStyles } from '../chrome-injector';
import { UMBRADESKTOP_TASKBAR_HEIGHT } from '../constants';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * A single draggable desktop window hosting a backoffice iframe. Presentational
 * state comes from the `window` property; all mutations go through the manager.
 */
@customElement('umbradesktop-window')
export class UmbraDesktopWindowElement extends UmbLitElement {
  @property({ attribute: false })
  window?: UmbraDesktopWindow;

  @state()
  private _dragging = false;

  #manager?: UmbraDesktopWindowManagerContext;
  #startPointer = { x: 0, y: 0 };
  #startRect = { x: 0, y: 0 };

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
    });
  }

  #onIframeLoad(e: Event) {
    const iframe = e.target as HTMLIFrameElement;
    if (this.window) injectChromeStyles(iframe, this.window.app.chromeProfile);
  }

  #onTitlePointerDown = (e: PointerEvent) => {
    if (!this.window || this.window.state === 'maximized') return;
    this.#manager?.focus(this.window.id);
    this._dragging = true;
    this.#startPointer = { x: e.clientX, y: e.clientY };
    this.#startRect = { x: this.window.rect.x, y: this.window.rect.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  #onTitlePointerMove = (e: PointerEvent) => {
    if (!this._dragging || !this.window) return;
    const dx = e.clientX - this.#startPointer.x;
    const dy = e.clientY - this.#startPointer.y;
    this.#manager?.move(this.window.id, this.#startRect.x + dx, Math.max(0, this.#startRect.y + dy));
  };

  #onTitlePointerUp = (e: PointerEvent) => {
    this._dragging = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  #onFocus = () => {
    if (this.window) this.#manager?.focus(this.window.id);
  };

  override render() {
    const w = this.window;
    if (!w) return null;
    const maximized = w.state === 'maximized';
    const style = maximized
      ? `left:0; top:0; width:100%; height:calc(100% - ${UMBRADESKTOP_TASKBAR_HEIGHT}px); z-index:${w.z};`
      : `left:${w.rect.x}px; top:${w.rect.y}px; width:${w.rect.w}px; height:${w.rect.h}px; z-index:${w.z};`;
    return html`
      <div
        class="frame ${w.active ? 'active' : ''}"
        style=${style}
        ?hidden=${w.state === 'minimized'}
        @pointerdown=${this.#onFocus}>
        <div
          class="titlebar"
          @pointerdown=${this.#onTitlePointerDown}
          @pointermove=${this.#onTitlePointerMove}
          @pointerup=${this.#onTitlePointerUp}>
          <span class="title"><umb-icon name=${w.app.icon}></umb-icon> ${w.app.name}</span>
          <span class="controls">
            <uui-button
              compact
              label="Minimize"
              @click=${() => this.#manager?.setState(w.id, 'minimized')}>&#x2013;</uui-button>
            <uui-button
              compact
              label="Maximize"
              @click=${() => this.#manager?.setState(w.id, maximized ? 'normal' : 'maximized')}>
              &#x25A1;</uui-button>
            <uui-button
              compact
              color="danger"
              label="Close"
              @click=${() => this.#manager?.close(w.id)}>&#x2715;</uui-button>
          </span>
        </div>
        <iframe class="body" src=${w.app.url} @load=${this.#onIframeLoad}></iframe>
      </div>
    `;
  }

  static override styles = [
    css`
      .frame {
        position: absolute;
        display: flex;
        flex-direction: column;
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
        box-shadow: var(--uui-shadow-depth-3);
        overflow: hidden;
        min-width: 320px;
        min-height: 200px;
      }
      .frame.active {
        border-color: var(--uui-color-selected);
        box-shadow: var(--uui-shadow-depth-5);
      }
      .titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-1) var(--uui-size-space-3);
        background: var(--uui-color-surface-alt);
        border-bottom: 1px solid var(--uui-color-border);
        cursor: move;
        user-select: none;
      }
      .title {
        display: inline-flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        font-weight: 700;
        font-size: var(--uui-type-small-size);
      }
      .controls {
        display: inline-flex;
        gap: var(--uui-size-space-1);
      }
      .body {
        flex: 1;
        border: none;
        width: 100%;
        background: var(--uui-color-background);
      }
      [hidden] {
        display: none !important;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-window': UmbraDesktopWindowElement;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backoffice/src/desktop/components/window.element.ts
git commit -m "feat: add draggable desktop window element with iframe + chrome strip"
```

---

## Task 7: The taskbar element

**Files:**
- Create: `backoffice/src/desktop/components/taskbar.element.ts`

- [ ] **Step 1: Implement `<umbradesktop-taskbar>`**

Create `backoffice/src/desktop/components/taskbar.element.ts`. The start button is the
Umbraco logo (design doc §5.2). Phase 1 has no drawer yet, so the start button opens the
single hard-coded Content app directly (a `TODO (Phase 3)` marks where the drawer hooks in).

```ts
import type { UmbraDesktopWindow } from '../types';
import { UMBRADESKTOP_APPS } from '../apps';
import { UMBRADESKTOP_TASKBAR_HEIGHT } from '../constants';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** The bottom panel: Umbraco-logo start button, running-window buttons, clock. */
@customElement('umbradesktop-taskbar')
export class UmbraDesktopTaskbarElement extends UmbLitElement {
  @state()
  private _windows: UmbraDesktopWindow[] = [];

  @state()
  private _clock = '';

  #manager?: UmbraDesktopWindowManagerContext;
  #timer?: number;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
      if (ctx) this.observe(ctx.windows, (list) => (this._windows = list));
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

  // TODO (Phase 3): open the fullscreen app drawer instead of the hard-coded app.
  #onStart() {
    this.#manager?.open(UMBRADESKTOP_APPS[0]);
  }

  override render() {
    return html`
      <div class="bar" style="height:${UMBRADESKTOP_TASKBAR_HEIGHT}px">
        <button class="start" title="Open" @click=${this.#onStart}>
          <umb-icon name="icon-umbraco"></umb-icon>
        </button>
        <div class="running">
          ${this._windows.map(
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
        <div class="clock">${this._clock}</div>
      </div>
    `;
  }

  static override styles = [
    css`
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
      .start:hover {
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
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-taskbar': UmbraDesktopTaskbarElement;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backoffice/src/desktop/components/taskbar.element.ts
git commit -m "feat: add taskbar with Umbraco-logo start button"
```

---

## Task 8: The desktop element (section root)

**Files:**
- Create: `backoffice/src/desktop/components/desktop.element.ts`

- [ ] **Step 1: Implement `<umbradesktop-desktop>`**

Create `backoffice/src/desktop/components/desktop.element.ts`. It provides the manager
context, renders the wallpaper + window layer + taskbar, and — for the fullscreen OS feel
(design doc §5) — hides the **outer** backoffice header while mounted, restoring it on
disconnect. Because the desktop element lives inside the same document as the shell, it walks
up out of its shadow root to toggle a style tag on the main document head.

```ts
import type { UmbraDesktopWindow } from '../types';
import { UMBRADESKTOP_TASKBAR_HEIGHT } from '../constants';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import './window.element.js';
import './taskbar.element.js';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

const OUTER_CHROME_STYLE_ID = 'umbradesktop-outer-chrome';

/** Root element of the Desktop section. Owns the window manager and layout. */
@customElement('umbradesktop-desktop')
export class UmbraDesktopDesktopElement extends UmbLitElement {
  #manager = new UmbraDesktopWindowManagerContext(this);

  @state()
  private _windows: UmbraDesktopWindow[] = [];

  constructor() {
    super();
    this.observe(this.#manager.windows, (list) => (this._windows = list));
  }

  override connectedCallback() {
    super.connectedCallback();
    this.#hideOuterChrome(true);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#hideOuterChrome(false);
  }

  /** Toggle a document-level style that hides the backoffice header for fullscreen. */
  #hideOuterChrome(hide: boolean) {
    const doc = this.ownerDocument;
    let style = doc.getElementById(OUTER_CHROME_STYLE_ID) as HTMLStyleElement | null;
    if (hide) {
      if (!style) {
        style = doc.createElement('style');
        style.id = OUTER_CHROME_STYLE_ID;
        style.textContent = `
          umb-backoffice-header { display: none !important; }
          umb-backoffice-main { height: 100% !important; }
        `;
        doc.head.appendChild(style);
      }
    } else {
      style?.remove();
    }
  }

  override render() {
    return html`
      <div class="desktop">
        <div class="surface" style="bottom:${UMBRADESKTOP_TASKBAR_HEIGHT}px">
          ${this._windows.map(
            (w) => html`<umbradesktop-window .window=${w}></umbradesktop-window>`,
          )}
        </div>
        <umbradesktop-taskbar></umbradesktop-taskbar>
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }
      .desktop {
        position: relative;
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        background:
          radial-gradient(circle at 30% 20%, rgba(28, 35, 58, 0.9), rgba(20, 22, 34, 0.95)),
          var(--uui-color-background);
      }
      .surface {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      umbradesktop-taskbar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
      }
    `,
  ];
}

export default UmbraDesktopDesktopElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-desktop': UmbraDesktopDesktopElement;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/backoffice" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backoffice/src/desktop/components/desktop.element.ts
git commit -m "feat: add desktop section root element with fullscreen chrome hide"
```

---

## Task 9: Register the section and load the bundle

**Files:**
- Create: `backoffice/src/desktop/manifest.ts`
- Modify: `backoffice/src/bundle.manifests.ts`
- Modify: `backoffice/public/umbraco-package.json`

- [ ] **Step 1: Create the section manifest**

Create `backoffice/src/desktop/manifest.ts`:

```ts
import { UMBRADESKTOP_SECTION_ALIAS, UMBRADESKTOP_SECTION_PATHNAME } from './constants';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'section',
    alias: UMBRADESKTOP_SECTION_ALIAS,
    name: 'UmbraDesktop Section',
    weight: 5, // low weight = appears toward the end of the section list
    meta: {
      label: 'Desktop',
      pathname: UMBRADESKTOP_SECTION_PATHNAME,
    },
    element: () => import('./components/desktop.element.js'),
  },
];
```

- [ ] **Step 2: Include the desktop manifests in the bundle**

Modify `backoffice/src/bundle.manifests.ts` to import and spread the desktop manifests:

```ts
import { manifests as entrypoints } from './entrypoints/manifest';
import { manifests as dashboards } from './dashboards/manifest';
import { manifests as propertyeditors } from './propertyeditors/manifest';
import { manifests as desktop } from './desktop/manifest';

// Job of the bundle is to collate all the manifests from different parts of the extension.
export const manifests: Array<UmbExtensionManifest> = [
  ...entrypoints,
  ...dashboards,
  ...propertyeditors,
  ...desktop,
];
```

- [ ] **Step 3: Build and discover the compiled bundle filename**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm run build`
Then list the output:
Run: `ls "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop/wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop"`
Expected: a `*.js` bundle (expected name `umbradesktop.js`), `umbraco-package.json`, and `localization/`. **Note the exact `.js` filename** for the next step.

- [ ] **Step 4: Register the bundle in `umbraco-package.json`**

Modify `backoffice/public/umbraco-package.json` — add a `bundle` extension to the
`extensions` array (use the filename observed in Step 3; `umbradesktop.js` shown here):

```jsonc
{
  "type": "bundle",
  "alias": "Umbraco.Community.UmbraDesktop.Bundle",
  "name": "UmbraDesktop Bundle",
  "js": "/App_Plugins/Umbraco.Community.UmbraDesktop/umbradesktop.js"
}
```

- [ ] **Step 5: Rebuild so the edited package manifest is copied to wwwroot**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop" && npm run build`
Expected: exits 0; `wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop/umbraco-package.json` now contains the bundle entry.

- [ ] **Step 6: Run the Test Instance and grant the section**

Run: `cd "D:/github/Umbraco.Community.UmbraDesktop/src/Umbraco.Community.UmbraDesktop.TestInstance" && dotnet run`
Then, in the backoffice:
1. Log in.
2. A new **Desktop** section only appears once it is granted to your user group — go to
   **Settings → Users → Groups → Administrators → Sections**, enable **Desktop**, save.
3. Open the **Desktop** section.

Expected: the outer backoffice header disappears, a dark desktop with a bottom taskbar shows,
and the taskbar's left button is the Umbraco logo.

- [ ] **Step 7: Manually verify the end-to-end proof**

In the Desktop section:
1. Click the Umbraco-logo start button → a **Content** window opens.
2. The window shows the Content tree + workspace **without** the backoffice top header
   (chrome stripped inside the iframe).
3. Drag the title bar → the window moves.
4. Click the start button again → a second Content window cascades on top and takes focus.
5. Minimize → window hides, still listed in the taskbar; click its taskbar button → it
   restores and comes to front.
6. Maximize → fills the desktop above the taskbar; restore → returns to its rectangle.
7. Close → window disappears and leaves the taskbar.
8. Leave the Desktop section → the backoffice header returns.

- [ ] **Step 8: Commit**

```bash
git add backoffice/src/desktop/manifest.ts backoffice/src/bundle.manifests.ts backoffice/public/umbraco-package.json
git commit -m "feat: register Desktop section and load the compiled bundle"
```

---

## Deferred within Phase 1 (follow-up tasks, not blockers for the proof)

- **Edge/corner resize** of windows (drag handles updating `rect.w/h`). Add a `resize(id, w, h)`
  to the manager + a pure `resizeWindow` in `window-model.ts` (TDD) and resize handles in
  `window.element.ts`.
- **Bounds clamping** so windows can't be dragged fully off-screen.
- **Component tests** for the Lit elements once a backoffice test harness/importmap is wired
  (element imports resolve against the real backoffice at runtime; unit-testing them needs a
  mocked backoffice — see the `umbraco-mocked-backoffice` / `umbraco-msw-testing` skills).

---

## Self-review — spec coverage (Phase 1 slice)

| Spec element (design doc) | Task |
|---|---|
| Desktop **section** (§5) | Task 9 |
| **Fullscreen** — hide outer header while active (§5) | Task 8 (`#hideOuterChrome`) |
| **Window manager**: drag, min/max/restore, focus/z-order, close, multi-instance (§5) | Tasks 2, 5, 6 |
| **Iframe** windows + deep link (§4) | Task 6 |
| **Chrome stripping** via same-origin CSS on stable tags + profiles (§4.1) | Task 3, 6 |
| **Taskbar** + running windows + clock (§5) | Task 7 |
| **Umbraco logo = start button** (§5.2) | Task 7 |
| **Native-first / UUI tokens** (C6, §5.2) | Tasks 6–8 (UUI components, `--uui-*`) |
| Persistence (§8) | **Deferred to Phase 4** (not in this plan) |
| App model / drawer / derivation (§6, §7) | **Deferred to Phase 2/3** (not in this plan) |
