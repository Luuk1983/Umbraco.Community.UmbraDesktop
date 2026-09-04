# Theming System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pick a visual theme for the UmbraDesktop chrome — launcher, taskbar and windows — shipping the current Umbraco look plus a macOS theme, with Windows 98, Windows 11 and Linux reduced to a folder of CSS each.

**Architecture:** A theme is a **palette** (CSS custom properties, inherited through shadow boundaries for free), a **metrics** record (the geometry the window bounds clamp needs), and four **stylesheets** adopted into the four chrome components' shadow roots. A `UmbraDesktopThemeContext` provided by the desktop element resolves the stored theme id against Umbraco's own light/dark setting and publishes all three. Design: [2026-09-04-theming-system-design.md](../design/2026-09-04-theming-system-design.md).

**Tech Stack:** TypeScript, Lit 3, `@umbraco-cms/backoffice` v17, `@web/test-runner` + `@open-wc/testing` (Chai `expect`), Vite.

---

## Working agreements

- **Run all commands from the repository root** unless a step says otherwise.
- **Full test suite:** `cd src/Umbraco.Community.UmbraDesktop && npm test`
- **One test file:** `cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/<path>.test.ts" --node-resolve`
- **Build:** `cd src/Umbraco.Community.UmbraDesktop && npm run build`
- **The test runner does not type-check.** It transpiles through esbuild, which strips types without
  checking them, so a type error surfaces only in `npm run build` (which runs `tsc` first). Where a
  step below predicts a test failing on a type error, expect a *runtime* failure instead — usually
  `undefined` propagating into arithmetic as `NaN`. Run the build to see type errors.
- **Every type, method and property gets an XML-style JSDoc comment** (`/** … */` with `@param` / `@returns`), matching the surrounding code. This codebase documents `private` members too.
- **Use `const`/`let` for locals, never `var`.** The global CLAUDE.md's "use `var`" rule is a
  C# rule about type inference; in TypeScript `var` is legacy function-scoped and this codebase uses
  `const`/`let` exclusively. Prefer `interface`/`type` over classes for data.
- **No component tests.** This project unit-tests pure modules and verifies UI in the browser with the maintainer — the convention set by the launcher and wallpaper work.

### A refinement on the design, adopted here

The design (§6) requires the Umbraco theme to be pixel-identical to today. Rather than prove that by review, Milestone 1 makes it **structural**: every extracted value becomes `var(--umbradesktop-token, <today's exact value>)`. With no palette set, every fallback fires and the rendering is unchanged by construction. The Umbraco theme is therefore the **empty palette** — still the identity theme of design D2, now with nothing to get wrong.

---

## File structure

| File | Responsibility |
|---|---|
| `src/desktop/theme/types.ts` | `UmbraDesktopToken`, `UmbraDesktopPalette`, `UmbraDesktopThemeMetrics`, `UmbraDesktopTheme`, `UmbraDesktopThemeSheets` |
| `src/desktop/theme/resolve-variant.ts` | `(themeId, umbAlias) → { theme, palette }`. Pure |
| `src/desktop/theme/palette-css.ts` | `UmbraDesktopPalette → CSS declaration string`. Pure |
| `src/desktop/theme/theme.context.ts` | Owns the resolved theme; publishes palette, metrics, sheets |
| `src/desktop/theme/theme.context-token.ts` | `UMBRADESKTOP_THEME_CONTEXT` |
| `src/desktop/theme/theme-styles.controller.ts` | Adopts a surface's sheet into a host's `renderRoot` |
| `src/desktop/theme/themes/index.ts` | The catalogue: id → `UmbraDesktopTheme` |
| `src/desktop/theme/themes/umbraco/index.ts` | Identity theme: empty palettes, today's metrics, no sheets |
| `src/desktop/theme/themes/macos/index.ts` | macOS theme entry + metrics |
| `src/desktop/theme/themes/macos/palette.ts` | macOS light + dark palettes |
| `src/desktop/theme/themes/macos/{desktop,taskbar,launcher,window}.css.ts` | macOS per-surface stylesheets |

Modified: the four chrome components, `constants.ts`, `window-model.ts`, `window-manager.context.ts`, `settings/{types,settings-store,settings.context}.ts`, `settings/components/settings-modal.element.ts`, `localization/{en,nl}.ts`.

---

# Milestone 1 — Tokenisation (the gate)

No new features and no visible change. This milestone ends with a maintainer confirming the desktop is pixel-identical to `main`. Nothing in Milestone 2 starts until that gate passes.

---

### Task 1: Window controls — per-control classes and tokens

The window controls are not individually addressable: reload, minimize and maximize all render as bare `class="ctrl"`, and only close carries a modifier. macOS needs close red, minimize amber and maximize green, so each control needs its own class.

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/window.element.ts`

- [ ] **Step 1: Add a per-control class to each button**

In `render()`, change the four control buttons' `class` attributes. Reload currently reads `class="ctrl ${this._loading ? 'busy' : ''}"`; the other three read `class="ctrl"` and `class="ctrl close"`.

```ts
            <button
              class="ctrl ctrl-reload ${this._loading ? 'busy' : ''}"
              title="Reload"
              aria-label="Reload"
              @click=${() => this.#onReload()}>
              ${this.#controlGlyph('reload')}
            </button>
            <button
              class="ctrl ctrl-minimize"
              title="Minimize"
              aria-label="Minimize"
              @click=${() => this.#manager?.setState(w.id, 'minimized')}>
              ${this.#controlGlyph('minimize')}
            </button>
            <button
              class="ctrl ctrl-maximize"
              title=${maximized ? 'Restore' : 'Maximize'}
              aria-label=${maximized ? 'Restore' : 'Maximize'}
              @click=${() => this.#manager?.setState(w.id, maximized ? 'normal' : 'maximized')}>
              ${this.#controlGlyph(maximized ? 'restore' : 'maximize')}
            </button>
            <button
              class="ctrl ctrl-close close"
              title="Close"
              aria-label="Close"
              @click=${() => this.#manager?.close(w.id)}>
              ${this.#controlGlyph('close')}
            </button>
```

`close` is kept alongside `ctrl-close` so the existing `.ctrl.close:hover` rule keeps working untouched in this step.

- [ ] **Step 2: Replace hardcoded values in `static styles` with tokens**

Each replacement keeps today's value as the fallback, so rendering cannot change. Edit these declarations only:

```css
      .frame {
        background: var(--umbradesktop-window-background, var(--uui-color-surface));
        border: var(--umbradesktop-window-border, 1px solid var(--uui-color-border));
        border-radius: var(--umbradesktop-window-radius, var(--uui-border-radius, 3px));
        box-shadow: var(--umbradesktop-window-shadow, var(--uui-shadow-depth-3));
      }
      .frame.active {
        box-shadow: var(--umbradesktop-window-shadow-active, var(--uui-shadow-depth-5));
      }
      .titlebar {
        min-height: var(--umbradesktop-titlebar-height, 40px);
        background: var(--umbradesktop-titlebar-background, var(--uui-color-surface));
        border-bottom: var(--umbradesktop-titlebar-border-bottom, 1px solid var(--uui-color-border));
      }
      .frame:not(.active) .title,
      .frame:not(.active) .controls {
        opacity: var(--umbradesktop-titlebar-inactive-opacity, 0.5);
      }
      .title {
        color: var(--umbradesktop-titlebar-text, var(--uui-color-text));
      }
      .ctrl {
        width: var(--umbradesktop-control-width, 46px);
        color: var(--umbradesktop-control-color, var(--uui-color-text));
      }
      .ctrl:hover {
        background: var(--umbradesktop-control-hover-background, rgba(0, 0, 0, 0.07));
      }
      .ctrl.close:hover {
        background: var(--umbradesktop-control-close-hover-background, var(--uui-color-danger, #d42054));
        color: var(--umbradesktop-control-close-hover-color, #fff);
      }
      .body {
        background: var(--umbradesktop-window-body-background, var(--uui-color-background));
      }
      .loading {
        background: var(--umbradesktop-window-background, var(--uui-color-surface));
      }
```

Leave every other declaration — the layout, the resize handles, the glyph geometry, the spin animation — exactly as it is.

- [ ] **Step 3: Build to verify nothing broke**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Run the full test suite**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm test`
Expected: all tests pass. No test covers this element; this confirms nothing else regressed.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/window.element.ts
git commit -m "refactor: tokenise the window frame and address controls individually"
```

---

### Task 2: Taskbar — cluster wrapper, tokens, and the height custom property

`.start`, `.running` and `.clock` are flex siblings, so a theme that centres Start and the task buttons together with the clock pinned right — Windows 11, and any dock arrangement — has no element to centre. The bar's height is also written as an inline `style`, which no adopted stylesheet can override.

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/taskbar.element.ts`

- [ ] **Step 1: Wrap start + running in a cluster, and drop the inline height**

In `render()`, replace the `.bar` div and its children:

```ts
      <div class="bar">
        <div class="cluster">
          <button
            class="start ${this._launcherOpen ? 'active' : ''}"
            title="Open apps"
            aria-label="Open apps"
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
                  title=${this.localize.string(w.app.name)}
                  @click=${() => this.#onTaskClick(w)}>
                  <umb-icon name=${w.app.icon}></umb-icon>
                  <span class="task-label">${this.localize.string(w.app.name)}</span>
                </button>
              `,
            )}
          </div>
        </div>
        <div class="clock">${this._clock}</div>
      </div>
```

- [ ] **Step 2: Drop the inline offset from the launcher**

In `#renderLauncher()`, remove the `style` attribute — the launcher's own stylesheet will position it:

```ts
      <umbradesktop-launcher
        class="launcher"
        @launched=${() => this.#setLauncherOpen(false)}
        @search=${this.#onSearch}
        @profile=${this.#onProfile}
        @settings=${this.#onSettings}
        @exit=${this.#onExit}></umbradesktop-launcher>
```

- [ ] **Step 3: Tokenise `static styles` and give the cluster its own rule**

`UMBRADESKTOP_TASKBAR_HEIGHT` is no longer used in this element's template, so remove it from the import list at the top of the file (`import { UMBRADESKTOP_TASKBAR_HEIGHT } from '../constants';` — delete the line; the `taskActivation` and other imports stay).

```css
      .bar {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: 0 var(--uui-size-space-2);
        height: var(--umbradesktop-taskbar-height, 50px);
        margin: var(--umbradesktop-taskbar-margin, 0);
        border-radius: var(--umbradesktop-taskbar-radius, 0);
        background: var(--umbradesktop-taskbar-background, rgba(16, 20, 46, 0.72));
        backdrop-filter: var(--umbradesktop-taskbar-backdrop, blur(18px) saturate(140%));
        -webkit-backdrop-filter: var(--umbradesktop-taskbar-backdrop, blur(18px) saturate(140%));
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
        border-top: var(--umbradesktop-taskbar-border-top, 1px solid rgba(255, 255, 255, 0.14));
        box-shadow: var(--umbradesktop-taskbar-shadow, 0 -4px 18px rgba(0, 0, 0, 0.4));
      }
      @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
        .bar {
          background: var(--umbradesktop-taskbar-background-opaque, #0f1330);
        }
      }
      /* Start + running windows travel together, so a theme can centre them as one group
         (Windows 11, macOS) while the clock stays pinned to its own edge. The gap is
         inherited from what `.bar` used to apply between them directly: wrapping the two in
         a cluster takes them out of the bar's flex flow, so it has to be restated here or
         the start button ends up sitting against the first task button. */
      .cluster {
        display: flex;
        align-items: stretch;
        height: 100%;
        flex: 1;
        min-width: 0;
        gap: var(--uui-size-space-2);
      }
      .start {
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
      }
      .start:hover {
        background: var(--umbradesktop-start-hover-background, rgba(255, 255, 255, 0.12));
      }
      .start.active {
        background: var(--umbradesktop-start-active-background, rgba(255, 255, 255, 0.16));
      }
      .task {
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
      }
      .task:hover {
        color: var(--umbradesktop-taskbar-text-emphasis, var(--uui-color-header-contrast-emphasis));
        background: var(--umbradesktop-task-hover-background, rgba(255, 255, 255, 0.08));
      }
      .task.active {
        color: var(--umbradesktop-taskbar-text-emphasis, var(--uui-color-header-contrast-emphasis));
        box-shadow: inset 0 -3px 0 var(--umbradesktop-task-active-marker, var(--uui-color-current, #f5c1bc));
      }
      .clock {
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
      }
      .launcher {
        position: absolute;
        left: var(--umbradesktop-launcher-left, var(--uui-size-space-3));
        bottom: var(--umbradesktop-launcher-bottom, var(--umbradesktop-taskbar-reserve, 50px));
      }
```

`.running` keeps `flex: 1` so it still fills the cluster. Every other declaration stays as-is.

- [ ] **Step 4: Build and run the tests**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/taskbar.element.ts
git commit -m "refactor: tokenise the taskbar and group start + running into a cluster"
```

---

### Task 3: Desktop surface — tokens and the reserved strip

`.surface` and `.wallpaper-brand` carry `style="bottom:${UMBRADESKTOP_TASKBAR_HEIGHT}px"`, which an adopted stylesheet cannot override — so a floating dock is impossible until the offset comes from a custom property.

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/desktop.element.ts`

- [ ] **Step 1: Remove the inline offsets from the template**

In `render()`, drop both `style` attributes:

```ts
      <div class="desktop ${hasImage ? 'has-image' : ''}" style=${this.#wallpaperStyle()}>
        <div class="wallpaper-brand" aria-hidden="true">
          <umb-icon name="icon-umbraco"></umb-icon>
        </div>
        <div class="surface">
          ${repeat(
            this._windows,
            (w) => w.id,
            (w) => html`<umbradesktop-window .window=${w}></umbradesktop-window>`,
          )}
        </div>
        <umbradesktop-taskbar></umbradesktop-taskbar>
      </div>
```

`UMBRADESKTOP_TASKBAR_HEIGHT` is now unused in this file. Change the import to keep only what remains: `import { UMBRADESKTOP_SECTION_ALIAS } from '../constants';`

- [ ] **Step 2: Declare the reserve on `.desktop` and consume it in `static styles`**

```css
      .desktop {
        position: relative;
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        /* How much of the bottom edge the taskbar or dock occupies. Themes override this;
           a floating dock reserves more than its own height so windows clear it. */
        --umbradesktop-taskbar-reserve: var(--umbradesktop-taskbar-height, 50px);
        background-color: var(--umbradesktop-desktop-background-color, #0e1329);
        background-image: var(
          --umbradesktop-desktop-background-image,
          radial-gradient(
            130% 130% at 25% 8%,
            var(--uui-color-header-background, #1b264f),
            color-mix(in srgb, var(--uui-color-header-background, #1b264f) 50%, black) 70%
          )
        );
      }
      /* Kept as a separate rule so the color-mix upgrade still applies over the token's
         solid-colour default, exactly as it did before tokenisation. */
      @supports (background-color: color-mix(in srgb, red 50%, black)) {
        .desktop {
          background-color: var(
            --umbradesktop-desktop-background-color,
            color-mix(in srgb, var(--uui-color-header-background, #1b264f) 58%, black)
          );
        }
      }
      .desktop.has-image::before {
        background: var(--umbradesktop-desktop-scrim, rgba(0, 0, 0, 0.12));
      }
      .wallpaper-brand {
        position: absolute;
        right: -4%;
        bottom: var(--umbradesktop-taskbar-reserve, 50px);
        pointer-events: none;
        color: var(--uui-color-header-contrast, #ffffff);
        opacity: var(--umbradesktop-desktop-watermark-opacity, 0.06);
      }
      .surface {
        position: absolute;
        inset: 0;
        bottom: var(--umbradesktop-taskbar-reserve, 50px);
        overflow: hidden;
      }
```

Keep the existing `content`, `inset`, `position` and `pointer-events` declarations on `.desktop.has-image::before`, and the `umbradesktop-taskbar` positioning rule, unchanged.

- [ ] **Step 3: Build and run the tests**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/desktop.element.ts
git commit -m "refactor: tokenise the desktop surface and reserve the taskbar strip via a property"
```

---

### Task 4: Launcher — tokens

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/launcher.element.ts`

- [ ] **Step 1: Tokenise `static styles`**

Edit these declarations only; everything else — the grid columns, the tile geometry, the pin badge positioning — stays as it is.

```css
      :host {
        display: flex;
        flex-direction: column;
        width: var(--umbradesktop-launcher-width, min(960px, 92vw));
        height: var(--umbradesktop-launcher-height, auto);
        max-height: var(--umbradesktop-launcher-max-height, calc(100vh - 66px));
        overflow: hidden;
        background: var(
          --umbradesktop-launcher-background,
          var(--uui-color-surface-alt, var(--uui-color-background))
        );
        backdrop-filter: var(--umbradesktop-launcher-backdrop, none);
        -webkit-backdrop-filter: var(--umbradesktop-launcher-backdrop, none);
        border: var(--umbradesktop-launcher-border, 1px solid var(--uui-color-border));
        border-radius: var(--umbradesktop-launcher-radius, var(--uui-border-radius, 3px));
        box-shadow: var(--umbradesktop-launcher-shadow, var(--uui-shadow-depth-4));
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
      }
      .search {
        border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
        /* Its own radius token, not the cards': the search field follows the panel's radius
           (3px) while the group cards are deliberately rounder (6px). One token with two
           different defaults would silently reshape both the first time a theme set it. */
        border-radius: var(--umbradesktop-launcher-search-radius, var(--uui-border-radius, 3px));
        background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
      }
      .search:hover {
        border-color: var(--umbradesktop-launcher-border-emphasis, var(--uui-color-border-emphasis, var(--uui-color-border)));
      }
      .card {
        background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
        border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
        border-radius: var(--umbradesktop-launcher-card-radius, 6px);
      }
      .launch {
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
      }
      .tile:hover .launch {
        background: var(
          --umbradesktop-launcher-hover-background,
          var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05))
        );
      }
      .pin {
        border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
        background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
      }
      /* Tokenised alongside the resting state, or a themed badge would snap back to Umbraco's
         palette the moment you hovered it. */
      .pin:hover {
        border-color: var(--umbradesktop-launcher-border-emphasis, var(--uui-color-border-emphasis, var(--uui-color-border)));
        background: var(--umbradesktop-launcher-pin-hover-background, var(--uui-color-surface-alt, var(--uui-color-surface)));
      }
      .footer {
        background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
        border-top: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
      }
      .user,
      .fbtn {
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
      }
      .user:hover,
      .fbtn:hover {
        background: var(
          --umbradesktop-launcher-hover-background,
          var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05))
        );
      }
```

`.user` and `.fbtn` already exist as separate rules carrying their own layout. Do not replace them with the grouped selectors above — instead change the single `color:` declaration inside each existing rule to `color: var(--umbradesktop-launcher-text, var(--uui-color-text));`, and the single `background:` declaration inside each existing `:hover` rule to `background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));`. Every other declaration in those four rules stays exactly as it is.

- [ ] **Step 2: Build and run the tests**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/launcher.element.ts
git commit -m "refactor: tokenise the launcher panel"
```

---

### Task 5: Generalise the bounds clamp to controls at either end

`clampWindowPosition` assumes the non-draggable controls sit at the titlebar's right end. macOS puts them on the left, which inverts the math at both edges.

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/window-model.ts`
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/constants.ts`
- Test: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/window-model.test.ts`

- [ ] **Step 1: Update the existing tests to the new `keep` shape and add the left-side cases**

In `window-model.test.ts`, replace the `KEEP` constant and add three tests. **Every existing expectation keeps its exact numbers** — only the shape of `KEEP` changes, which is the proof that the generalisation is behaviour-preserving.

```ts
const BOUNDS = { w: 1000, h: 700 };
const KEEP = { grab: 80, leading: 0, trailing: 138, titlebar: 40 };
const KEEP_LEFT = { grab: 80, leading: 124, trailing: 0, titlebar: 40 };
const DRAGGED: import('./types').Rect = { x: 100, y: 100, w: 400, h: 300 };
```

Then update the one test that reads the old field name:

```ts
it('clampWindowPosition leaves something to grab however far left it is thrown', () => {
  const { x } = clampWindowPosition({ ...DRAGGED, x: -5000 }, BOUNDS, KEEP);
  const visible = DRAGGED.w + x;
  expect(visible - KEEP.trailing).to.be.at.least(KEEP.grab);
});
```

And append the new cases:

```ts
it('clampWindowPosition keeps a grab strip on screen with controls at the left edge', () => {
  // Controls lead the bar, so the draggable strip is the window's right end. Thrown off the
  // left, the strip's right edge (x + w) must stay 80px on screen: x pins at 80 - 400.
  expect(clampWindowPosition({ ...DRAGGED, x: -900 }, BOUNDS, KEEP_LEFT)).to.deep.equal({ x: -320, y: 100 });
});

it('clampWindowPosition spares the leading controls when dragged off the right edge', () => {
  // The strip starts 124px into the window, so the window may only advance until that point
  // is 80px from the right edge: x pins at 1000 - 80 - 124.
  expect(clampWindowPosition({ ...DRAGGED, x: 5000 }, BOUNDS, KEEP_LEFT)).to.deep.equal({ x: 796, y: 100 });
});

it('clampWindowPosition keeps a window narrower than its own controls wholly on screen', () => {
  // 100px window against 124px of leading controls: no strip exists, so it is not shunted.
  expect(clampWindowPosition({ x: 0, y: 0, w: 100, h: 100 }, BOUNDS, KEEP_LEFT)).to.deep.equal({ x: 0, y: 0 });
  expect(clampWindowPosition({ x: -40, y: 0, w: 100, h: 100 }, BOUNDS, KEEP_LEFT)).to.deep.equal({ x: 0, y: 0 });
});

it('clampWindowPosition honours controls at both ends at once', () => {
  // The case the two-width model exists for, and the reason a side enum was rejected. Each
  // edge is governed by the controls at the OPPOSITE end, because those are what is left on
  // screen: lo = grab - w + trailing = 80 - 400 + 46, hi = bounds.w - grab - leading.
  expect(clampWindowPosition({ ...DRAGGED, x: -900 }, BOUNDS, KEEP_SPLIT)).to.deep.equal({ x: -274, y: 100 });
  expect(clampWindowPosition({ ...DRAGGED, x: 5000 }, BOUNDS, KEEP_SPLIT)).to.deep.equal({ x: 796, y: 100 });
});

it('clampWindowPosition takes its right-edge limit from the leading controls alone', () => {
  // Adding trailing controls must not move the right-edge limit — the leading ones are the
  // part still on screen there. Guards the algebra against a future "simplification".
  const left = clampWindowPosition({ ...DRAGGED, x: 5000 }, BOUNDS, KEEP_LEFT);
  const split = clampWindowPosition({ ...DRAGGED, x: 5000 }, BOUNDS, KEEP_SPLIT);
  expect(split.x).to.equal(left.x);
});
```

`KEEP_SPLIT` goes beside the other two fixtures:

```ts
const KEEP_SPLIT = { grab: 80, leading: 124, trailing: 46, titlebar: 40 };
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/window-model.test.ts" --node-resolve`
Expected: FAIL — TypeScript rejects `leading`/`trailing` against the current `keep` parameter type.

- [ ] **Step 3: Generalise `clampWindowPosition`**

In `window-model.ts`, replace `clampWindowPosition` and update the two functions that pass `keep` through.

```ts
/**
 * How much of a window must stay reachable while it is dragged.
 *
 * Controls swallow `pointerdown` so their buttons stay clickable, which makes them useless as a
 * grab handle: what has to stay on screen is the *draggable* strip of titlebar between them.
 * Themes place controls at either end — Umbraco trails them, macOS leads them — so both ends are
 * described, and a theme that split them across both would be expressed here too.
 */
export interface UmbraDesktopKeepVisible {
  /** Draggable titlebar, in px, that must remain on screen. */
  grab: number;
  /** Width in px of non-draggable controls at the titlebar's left end. */
  leading: number;
  /** Width in px of non-draggable controls at the titlebar's right end. */
  trailing: number;
  /** Titlebar height in px, which must stay above the desktop's bottom edge. */
  titlebar: number;
}

/**
 * Clamp a proposed window position so the window can always be dragged back: every real window
 * manager refuses to let a window be lost off-screen. What has to stay reachable is not "some of
 * the window" but the part you can actually grab — the titlebar minus the controls at either end.
 * Keeping only the control end on screen would leave nothing but those buttons: visible, but
 * undraggable. Pure.
 * @param proposed The rectangle the drag is asking for (its `w` decides how far it may hang).
 * @param bounds The desktop surface size in px.
 * @param keep The margins to honour; see {@link UmbraDesktopKeepVisible}.
 * @returns The clamped position.
 */
export function clampWindowPosition(
  proposed: Rect,
  bounds: { w: number; h: number },
  keep: UmbraDesktopKeepVisible,
): { x: number; y: number } {
  // Where the draggable strip begins, measured from the window's left edge, and how wide it is.
  const stripStart = keep.leading;
  const stripWidth = Math.max(0, proposed.w - keep.leading - keep.trailing);
  // Never ask for more than exists: a window narrower than its own controls has no strip at all
  // and simply stays wholly on screen rather than being shunted by an impossible margin.
  const grab = Math.min(keep.grab, stripWidth);
  const lo = stripWidth > 0 ? grab - stripStart - stripWidth : 0;
  const hi = stripWidth > 0 ? bounds.w - grab - stripStart : bounds.w - proposed.w;
  return {
    x: clamp(proposed.x, lo, hi),
    y: clamp(proposed.y, 0, bounds.h - Math.min(keep.titlebar, proposed.h)),
  };
}
```

Then change the `keep` parameter type on `clampWindowsToBounds` from its inline object type to `UmbraDesktopKeepVisible`, leaving its body untouched.

- [ ] **Step 4: Update the constant to the new shape**

In `constants.ts`, replace `UMBRADESKTOP_WINDOW_KEEP_VISIBLE`:

```ts
/**
 * What must stay inside the desktop while dragging, under the Umbraco theme. `trailing` is the
 * width of the three window buttons (3 × 46px) at the titlebar's right end, which are not
 * draggable; `titlebar` is the bar's own height. A theme publishes its own values through the
 * theme context — these are the defaults used until one is resolved.
 */
export const UMBRADESKTOP_WINDOW_KEEP_VISIBLE = { grab: 80, leading: 0, trailing: 138, titlebar: 40 };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/window-model.test.ts" --node-resolve`
Expected: PASS — including every pre-existing expectation, unchanged.

- [ ] **Step 6: Build and run the full suite**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/window-model.ts \
        src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/window-model.test.ts \
        src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/constants.ts
git commit -m "feat: clamp windows with controls at either end of the titlebar"
```

---

### Task 6: 🚦 Milestone 1 gate — pixel-identical browser verification

**Nothing in Milestone 2 begins until this passes.** Stop here and hand over to the maintainer.

- [ ] **Step 1: Build and start the test instance**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build`
Expected: build succeeds. The maintainer then runs their Umbraco Test Instance and opens the Desktop section.

- [ ] **Step 2: Maintainer confirms each of these against `main`**

- Desktop gradient, wallpaper and the Umbraco watermark are unchanged.
- Taskbar colour, blur, height and the coral active-task underline are unchanged.
- Start button hover and active states are unchanged.
- The launcher panel opens at the same size and position, with the same card, tile, pin and footer styling.
- A window's titlebar, borders, shadow, control hover and the red close hover are unchanged.
- An inactive window still dims its title and controls.
- Dragging a window off each of the four edges still leaves it grabbable.
- Resizing from all eight handles behaves as before.
- Shrinking the browser window still pulls stranded windows back.

- [ ] **Step 3: Tag the gate**

```bash
git tag -a theming-m1-gate -m "Tokenisation complete; desktop verified pixel-identical"
```

---

# Milestone 2 — The theme contract and context

Still no visible change: this milestone ends with the Umbraco theme selected and applied through the new machinery, rendering exactly as Milestone 1 left it.

---

### Task 7: Theme types

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/types.ts`

- [ ] **Step 1: Write the types**

```ts
import type { CSSResult } from '@umbraco-cms/backoffice/external/lit';

/**
 * Every custom property a theme may set, as a runtime list so it can be checked against the CSS
 * that actually reads them — see `tokens.test.ts`. The type below is derived from it, so a typo in
 * a palette is still a compile error.
 */
export const UMBRADESKTOP_TOKENS = [
  '--umbradesktop-window-background',
  '--umbradesktop-window-body-background',
  '--umbradesktop-window-border',
  '--umbradesktop-window-radius',
  '--umbradesktop-window-shadow',
  '--umbradesktop-window-shadow-active',
  '--umbradesktop-titlebar-height',
  '--umbradesktop-titlebar-background',
  '--umbradesktop-titlebar-border-bottom',
  '--umbradesktop-titlebar-text',
  '--umbradesktop-titlebar-inactive-opacity',
  '--umbradesktop-control-width',
  '--umbradesktop-control-color',
  '--umbradesktop-control-hover-background',
  '--umbradesktop-control-close-hover-background',
  '--umbradesktop-control-close-hover-color',
  '--umbradesktop-taskbar-height',
  '--umbradesktop-taskbar-reserve',
  '--umbradesktop-taskbar-margin',
  '--umbradesktop-taskbar-radius',
  '--umbradesktop-taskbar-background',
  '--umbradesktop-taskbar-background-opaque',
  '--umbradesktop-taskbar-backdrop',
  '--umbradesktop-taskbar-border-top',
  '--umbradesktop-taskbar-shadow',
  '--umbradesktop-taskbar-text',
  '--umbradesktop-taskbar-text-emphasis',
  '--umbradesktop-task-hover-background',
  '--umbradesktop-start-hover-background',
  '--umbradesktop-start-active-background',
  '--umbradesktop-task-active-marker',
  '--umbradesktop-launcher-width',
  '--umbradesktop-launcher-height',
  '--umbradesktop-launcher-max-height',
  '--umbradesktop-launcher-left',
  '--umbradesktop-launcher-bottom',
  '--umbradesktop-launcher-background',
  '--umbradesktop-launcher-backdrop',
  '--umbradesktop-launcher-border',
  '--umbradesktop-launcher-radius',
  '--umbradesktop-launcher-shadow',
  '--umbradesktop-launcher-text',
  '--umbradesktop-launcher-hover-background',
  '--umbradesktop-launcher-border-emphasis',
  '--umbradesktop-launcher-search-radius',
  '--umbradesktop-launcher-card-background',
  '--umbradesktop-launcher-card-border',
  '--umbradesktop-launcher-card-radius',
  '--umbradesktop-launcher-pin-hover-background',
  '--umbradesktop-desktop-background-color',
  '--umbradesktop-desktop-background-image',
  '--umbradesktop-desktop-scrim',
  '--umbradesktop-desktop-watermark-opacity',
] as const;

/** Every custom property a theme may set. */
export type UmbraDesktopToken = (typeof UMBRADESKTOP_TOKENS)[number];

/**
 * One theme's values for one variant. Partial by design: every token has a fallback baked into
 * the component that reads it, so a theme sets only what it wants to change.
 */
export type UmbraDesktopPalette = Partial<Record<UmbraDesktopToken, string>>;

/**
 * The geometry a theme has to publish because JavaScript — not CSS — needs it: the window bounds
 * clamp must know where the non-draggable controls are, and the desktop must know how much of its
 * bottom edge the taskbar or dock occupies.
 */
export interface UmbraDesktopThemeMetrics {
  /** Titlebar height in px. Kept in sync with the theme's own CSS. */
  titlebarHeight: number;
  /** Width in px of non-draggable controls at the titlebar's left end. */
  leadingControlsWidth: number;
  /** Width in px of non-draggable controls at the titlebar's right end. */
  trailingControlsWidth: number;
  /** Draggable titlebar, in px, that must stay on screen while dragging. */
  grab: number;
  /** Height in px reserved at the desktop's bottom edge for the taskbar or dock. */
  taskbarReserve: number;
}

/** A theme's per-surface stylesheets. Every surface is optional; a theme styles what it needs. */
export interface UmbraDesktopThemeSheets {
  /** Rules adopted into `umbradesktop-desktop`. */
  desktop?: CSSResult;
  /** Rules adopted into `umbradesktop-taskbar`. */
  taskbar?: CSSResult;
  /** Rules adopted into `umbradesktop-launcher`. */
  launcher?: CSSResult;
  /** Rules adopted into `umbradesktop-window`. */
  window?: CSSResult;
}

/** Which chrome component a stylesheet belongs to. */
export type UmbraDesktopSurface = keyof UmbraDesktopThemeSheets;

/**
 * The three colours the settings picker paints as a theme's preview. Named rather than a
 * positional triple: a theme author writing a Win98 or macOS palette has to map these onto a
 * design language that has no such words, and a swapped tuple would be invisible.
 */
export interface UmbraDesktopSwatch {
  /** The dominant colour of the chrome itself — the taskbar or dock. */
  chrome: string;
  /** The colour this theme marks the active or selected thing with. */
  accent: string;
  /** The colour a window's own surface is painted. */
  surface: string;
}

/** A theme as shipped in the package. */
export interface UmbraDesktopTheme {
  /** Stable id, persisted in settings. */
  id: string;
  /** Display name for the picker. Not localized — these are proper nouns, as with wallpapers. */
  name: string;
  /** The colours the picker draws its preview from. */
  swatch: UmbraDesktopSwatch;
  /** Palettes by variant. `light` is mandatory; `dark` falls back to it when absent. */
  palettes: { light: UmbraDesktopPalette; dark?: UmbraDesktopPalette };
  /** Geometry JavaScript needs. */
  metrics: UmbraDesktopThemeMetrics;
  /** Lazily imported stylesheets. Omitted by a theme that needs none. */
  sheets?: () => Promise<UmbraDesktopThemeSheets>;
}
```

- [ ] **Step 2: Add the drift test**

Create `theme/tokens.test.ts`. Import the four element modules (existing tests already do this —
see `components/desktop-chrome.test.ts` for the idiom), flatten each class's `static styles`
`CSSResultGroup`, join the `cssText`, extract every `--umbradesktop-*` occurrence, and assert the
set equals `UMBRADESKTOP_TOKENS` **in both directions**, with distinct messages saying which way it
drifted. The list is maintained by hand against CSS in four files and drift is otherwise silent: a
name with no CSS is dead, and a property missing from the list can never be themed.

Note `CSSResultGroup` leaves may be native `CSSStyleSheet`, which has no `cssText` — guard the access.

- [ ] **Step 3: Build and test**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test`
Expected: build succeeds; 142 tests pass (141 plus the drift test).

- [ ] **Step 3: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/types.ts
git commit -m "feat: theme contract types"
```

---

### Task 8: The Umbraco theme and the catalogue

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/umbraco/index.ts`
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/index.ts`

- [ ] **Step 1: Write the Umbraco theme**

```ts
import type { UmbraDesktopTheme } from '../../types';
import { UMBRADESKTOP_TASKBAR_HEIGHT, UMBRADESKTOP_WINDOW_KEEP_VISIBLE } from '../../../constants';

/**
 * The desktop as it has always looked. Its palettes are deliberately **empty**: every token in the
 * chrome components carries today's value as its CSS fallback, so setting nothing renders exactly
 * what shipped before theming existed. That makes "the Umbraco theme is unchanged" a structural
 * guarantee rather than something to re-check by eye — and it follows the backoffice's own
 * light/dark setting for free, because those fallbacks are `--uui-*` values.
 *
 * Its metrics come from the constants the shell used before theming existed, rather than being
 * retyped here: those constants are still what the CSS fallbacks resolve to, so single-sourcing
 * them is what stops the two drifting apart.
 */
export const UMBRADESKTOP_UMBRACO_THEME: UmbraDesktopTheme = {
  id: 'umbraco',
  name: 'Umbraco',
  swatch: { chrome: '#1b264f', accent: '#f5c1bc', surface: '#ffffff' },
  palettes: { light: {} },
  metrics: {
    titlebarHeight: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.titlebar,
    leadingControlsWidth: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.leading,
    trailingControlsWidth: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.trailing,
    grab: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.grab,
    taskbarReserve: UMBRADESKTOP_TASKBAR_HEIGHT,
  },
};
```

> **Note for whoever runs Task 3 before this one:** `UMBRADESKTOP_TASKBAR_HEIGHT` has no importer
> between the end of Task 3 and this task. That is expected and transient — this is the task that
> revives it. Do not delete it as dead code in the meantime.

- [ ] **Step 2: Write the catalogue**

```ts
import type { UmbraDesktopTheme } from '../types';
import { UMBRADESKTOP_UMBRACO_THEME } from './umbraco/index.js';

/** Id of the theme a user gets before they have chosen one, and whenever a stored id is unknown. */
export const UMBRADESKTOP_DEFAULT_THEME_ID = UMBRADESKTOP_UMBRACO_THEME.id;

/**
 * Every theme the package ships, in picker order. Curated rather than an extension point, the same
 * way the app catalogue is: adding a theme means adding a folder and one entry here.
 */
export const UMBRADESKTOP_THEMES: ReadonlyArray<UmbraDesktopTheme> = [UMBRADESKTOP_UMBRACO_THEME];

```

No `findTheme` helper: the resolver in Task 9 takes an injectable catalogue so its tests can pass a
fixture, so it does its own `find`. A second lookup hardwired to the global list would be a trap for
whoever reaches for it instead.

- [ ] **Step 3: Build**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/
git commit -m "feat: the Umbraco identity theme and the theme catalogue"
```

---

### Task 9: Resolve a stored id and Umbraco's theme alias into a variant

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/resolve-variant.ts`
- Test: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/resolve-variant.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect } from '@open-wc/testing';
import { resolveTheme } from './resolve-variant';
import { UMBRADESKTOP_UMBRACO_THEME } from './themes/umbraco/index';
import type { UmbraDesktopTheme } from './types';

const dual: UmbraDesktopTheme = {
  id: 'dual',
  name: 'Dual',
  swatch: ['#000', '#111', '#222'],
  palettes: {
    light: { '--umbradesktop-window-background': 'white' },
    dark: { '--umbradesktop-window-background': 'black' },
  },
  metrics: {
    titlebarHeight: 30, leadingControlsWidth: 124, trailingControlsWidth: 0,
    grab: 80, taskbarReserve: 62,
  },
};

const lightOnly: UmbraDesktopTheme = { ...dual, id: 'light-only', palettes: { light: dual.palettes.light } };
const catalogue = [UMBRADESKTOP_UMBRACO_THEME, dual, lightOnly];

it('picks the light palette under the light backoffice theme', () => {
  const result = resolveTheme('dual', 'umb-light-theme', catalogue);
  expect(result.theme).to.equal(dual);
  expect(result.palette).to.equal(dual.palettes.light);
  expect(result.variant).to.equal('light');
});

it('picks the dark palette under the dark backoffice theme', () => {
  const result = resolveTheme('dual', 'umb-dark-theme', catalogue);
  expect(result.palette).to.equal(dual.palettes.dark);
  expect(result.variant).to.equal('dark');
});

it('falls back to light when a theme ships no dark palette', () => {
  const result = resolveTheme('light-only', 'umb-dark-theme', catalogue);
  expect(result.theme).to.equal(lightOnly);
  expect(result.palette).to.equal(lightOnly.palettes.light);
  expect(result.variant).to.equal('light');
});

it('forces the Umbraco theme under high contrast, whatever was chosen', () => {
  // Accessibility beats fidelity: the high-contrast stylesheet redefines --uui-* tokens, which
  // only the identity theme reads.
  const result = resolveTheme('dual', 'umb-high-contrast-theme', catalogue);
  expect(result.theme).to.equal(UMBRADESKTOP_UMBRACO_THEME);
  expect(result.forcedByContrast).to.equal(true);
});

it('falls back to the Umbraco theme when the stored id is unknown', () => {
  const result = resolveTheme('removed-in-an-upgrade', 'umb-light-theme', catalogue);
  expect(result.theme).to.equal(UMBRADESKTOP_UMBRACO_THEME);
  expect(result.forcedByContrast).to.equal(false);
});

it('reports no forcing under a normal backoffice theme', () => {
  expect(resolveTheme('dual', 'umb-light-theme', catalogue).forcedByContrast).to.equal(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/theme/resolve-variant.test.ts" --node-resolve`
Expected: FAIL — `resolve-variant` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
import type { UmbraDesktopPalette, UmbraDesktopTheme } from './types';
import { UMBRADESKTOP_THEMES } from './themes/index.js';
import { UMBRADESKTOP_UMBRACO_THEME } from './themes/umbraco/index.js';
import { UMB_THEME_DARK_ALIAS, UMB_THEME_HIGH_CONTRAST_ALIAS } from '@umbraco-cms/backoffice/themes';

/** Which of a theme's palettes is in use. */
export type UmbraDesktopVariant = 'light' | 'dark';

/** A resolved theme: what to paint, and why. */
export interface UmbraDesktopResolvedTheme {
  /** The theme actually in force — not necessarily the one the user chose. */
  theme: UmbraDesktopTheme;
  /** Which variant of it. */
  variant: UmbraDesktopVariant;
  /** The palette to apply. */
  palette: UmbraDesktopPalette;
  /** True when the user's choice was overridden because the backoffice is in high contrast. */
  forcedByContrast: boolean;
}

/**
 * Decide which theme and variant to paint, from the user's stored choice and the backoffice's own
 * theme.
 *
 * Two overrides are deliberate. **High contrast wins over any choice**: that stylesheet works by
 * redefining `--uui-*` tokens, which only the Umbraco identity theme reads, so honouring a macOS
 * palette there would quietly undo an accessibility setting. And an **unknown id** — a theme
 * dropped in an upgrade — falls back rather than leaving the desktop unstyled.
 * @param themeId The user's stored theme id.
 * @param umbThemeAlias The alias from Umbraco's own theme context.
 * @param catalogue The themes to choose from; defaults to everything the package ships.
 * @returns The theme, variant and palette to apply.
 */
export function resolveTheme(
  themeId: string,
  umbThemeAlias: string,
  catalogue: ReadonlyArray<UmbraDesktopTheme> = UMBRADESKTOP_THEMES,
): UmbraDesktopResolvedTheme {
  if (umbThemeAlias === UMB_THEME_HIGH_CONTRAST_ALIAS) {
    return {
      theme: UMBRADESKTOP_UMBRACO_THEME,
      variant: 'light',
      palette: UMBRADESKTOP_UMBRACO_THEME.palettes.light,
      forcedByContrast: true,
    };
  }

  const theme = catalogue.find((entry) => entry.id === themeId) ?? UMBRADESKTOP_UMBRACO_THEME;
  const wantsDark = umbThemeAlias === UMB_THEME_DARK_ALIAS;
  const dark = theme.palettes.dark;

  return wantsDark && dark
    ? { theme, variant: 'dark', palette: dark, forcedByContrast: false }
    : { theme, variant: 'light', palette: theme.palettes.light, forcedByContrast: false };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/theme/resolve-variant.test.ts" --node-resolve`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/resolve-variant.ts \
        src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/resolve-variant.test.ts
git commit -m "feat: resolve a theme and variant from the backoffice theme setting"
```

---

### Task 10: Render a palette as CSS declarations

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/palette-css.ts`
- Test: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/palette-css.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect } from '@open-wc/testing';
import { paletteCss } from './palette-css';

it('renders each token as a declaration', () => {
  expect(
    paletteCss({
      '--umbradesktop-window-radius': '10px',
      '--umbradesktop-taskbar-height': '44px',
    }),
  ).to.equal('--umbradesktop-window-radius:10px;--umbradesktop-taskbar-height:44px;');
});

it('renders an empty palette as an empty string, so the identity theme sets nothing', () => {
  expect(paletteCss({})).to.equal('');
});

it('skips a token whose value is undefined rather than emitting "undefined"', () => {
  expect(paletteCss({ '--umbradesktop-window-radius': undefined })).to.equal('');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/theme/palette-css.test.ts" --node-resolve`
Expected: FAIL — `palette-css` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
import type { UmbraDesktopPalette } from './types';

/**
 * Render a palette as a declaration string for a `style` attribute.
 *
 * Emitted as one string, and applied by replacing the whole attribute, so that switching to a
 * theme which does not set a token clears the previous theme's value instead of leaving it
 * stranded. An empty palette therefore renders an empty string, which is exactly what the Umbraco
 * identity theme needs.
 * @param palette The palette to render.
 * @returns The declarations, or an empty string when the palette sets nothing.
 */
export function paletteCss(palette: UmbraDesktopPalette): string {
  return Object.entries(palette)
    .filter(([, value]) => value !== undefined)
    .map(([token, value]) => `${token}:${value};`)
    .join('');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/theme/palette-css.test.ts" --node-resolve`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/palette-css.ts \
        src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/palette-css.test.ts
git commit -m "feat: render a theme palette as custom-property declarations"
```

---

### Task 11: Persist the chosen theme

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/settings/types.ts`
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/settings/settings-store.ts`
- Test: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/settings/settings-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `settings-store.test.ts`:

```ts
it('defaults the theme when a stored payload predates theming', () => {
  const settings = parseSettings(JSON.stringify({ v: 1, wallpaper: { kind: 'none' }, pinned: ['content'] }));
  expect(settings.theme).to.equal(UMBRADESKTOP_DEFAULT_SETTINGS.theme);
  // The pre-theming fields survive untouched — the point of recovering fields independently.
  expect(settings.wallpaper).to.deep.equal({ kind: 'none' });
  expect(settings.pinned).to.deep.equal(['content']);
});

it('keeps a stored theme id', () => {
  const settings = parseSettings(JSON.stringify({ v: 1, wallpaper: { kind: 'none' }, pinned: [], theme: 'macos' }));
  expect(settings.theme).to.equal('macos');
});

it('discards a malformed theme id without costing the user their wallpaper or pins', () => {
  const settings = parseSettings(JSON.stringify({ v: 1, wallpaper: { kind: 'none' }, pinned: ['media'], theme: 42 }));
  expect(settings.theme).to.equal(UMBRADESKTOP_DEFAULT_SETTINGS.theme);
  expect(settings.wallpaper).to.deep.equal({ kind: 'none' });
  expect(settings.pinned).to.deep.equal(['media']);
});

it('round-trips a theme through serialise and parse', () => {
  const settings = { ...UMBRADESKTOP_DEFAULT_SETTINGS, theme: 'macos' };
  expect(parseSettings(serialiseSettings(settings)).theme).to.equal('macos');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/settings/settings-store.test.ts" --node-resolve`
Expected: FAIL — `theme` is not a property of `UmbraDesktopSettings`.

- [ ] **Step 3: Add the field to the settings type**

In `settings/types.ts`, add to the `UmbraDesktopSettings` interface, after `wallpaper`:

```ts
  /** Id of the user's chosen chrome theme. */
  theme: string;
```

The payload version stays `v: 1`: `parseSettings` already recovers each field independently, so an
older payload without `theme` simply takes the default, and bumping the version would reset every
existing user's wallpaper and pins for nothing.

- [ ] **Step 4: Parse and default the field**

In `settings-store.ts`, add the import, the guard, the default, and the recovery line.

```ts
import { UMBRADESKTOP_DEFAULT_THEME_ID } from '../theme/themes/index';
```

```ts
/** What a user gets before they have chosen anything, and whenever their stored payload is unreadable. */
export const UMBRADESKTOP_DEFAULT_SETTINGS: UmbraDesktopSettings = {
  v: 1,
  wallpaper: { kind: 'builtin', id: UMBRADESKTOP_DEFAULT_WALLPAPER_ID },
  theme: UMBRADESKTOP_DEFAULT_THEME_ID,
  pinned: [...UMBRADESKTOP_DEFAULT_PINNED],
};

/**
 * Whether a decoded value is a theme id this version can store. A id naming a theme that no longer
 * exists still passes here — that is resolved against the catalogue when the theme is applied, not
 * when it is read, exactly as with wallpaper references.
 * @param value The decoded `theme` property.
 * @returns True when the value is a usable id.
 */
function isThemeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
```

In `parseSettings`, extend the `fallback` factory and the payload destructuring, then add the recovery line beside the existing two:

```ts
  const fallback = (): UmbraDesktopSettings => ({
    v: 1,
    wallpaper: { ...UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper },
    theme: UMBRADESKTOP_DEFAULT_SETTINGS.theme,
    pinned: [...UMBRADESKTOP_DEFAULT_PINNED],
  });
```

```ts
  const payload = decoded as { v?: unknown; wallpaper?: unknown; theme?: unknown; pinned?: unknown };
  if (payload.v !== 1) return fallback();

  const settings = fallback();
  if (isWallpaperRef(payload.wallpaper)) settings.wallpaper = payload.wallpaper;
  if (isThemeId(payload.theme)) settings.theme = payload.theme;
  if (isPinnedList(payload.pinned)) settings.pinned = payload.pinned;
  return settings;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd src/Umbraco.Community.UmbraDesktop/backoffice && npx web-test-runner "src/desktop/settings/settings-store.test.ts" --node-resolve`
Expected: PASS — including every pre-existing test in the file.

- [ ] **Step 6: Add the setter to the settings context**

In `settings/settings.context.ts`, add beside `togglePin`:

```ts
  /**
   * Choose a chrome theme. Applies immediately and persists; the theme context observes this and
   * resolves it against the backoffice's light/dark setting.
   * @param id The theme id to use.
   */
  public setTheme(id: string): void {
    this.#update({ theme: id });
  }
```

And expose it as an observable part, beside `pinned`:

```ts
  /** Id of the user's chosen chrome theme. */
  public readonly theme = this.#settings.asObservablePart((settings) => settings.theme);
```

- [ ] **Step 7: Build and run the full suite**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/settings/
git commit -m "feat: persist the chosen chrome theme in desktop settings"
```

---

### Task 12: The theme context

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/theme.context-token.ts`
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/theme.context.ts`

- [ ] **Step 1: Write the context token**

```ts
import type { UmbraDesktopThemeContext } from './theme.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** Context token for the active chrome theme. */
export const UMBRADESKTOP_THEME_CONTEXT = new UmbContextToken<UmbraDesktopThemeContext>(
  'UmbraDesktopThemeContext',
);
```

- [ ] **Step 2: Write the context**

```ts
import type { UmbraDesktopResolvedTheme } from './resolve-variant';
import type { UmbraDesktopThemeSheets } from './types';
import { resolveTheme } from './resolve-variant.js';
import { paletteCss } from './palette-css.js';
import { UMBRADESKTOP_DEFAULT_THEME_ID } from './themes/index.js';
import { UMBRADESKTOP_THEME_CONTEXT } from './theme.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_THEME_CONTEXT, UMB_THEME_LIGHT_ALIAS } from '@umbraco-cms/backoffice/themes';

/**
 * Owns the chrome theme in force: the user's stored choice resolved against the backoffice's own
 * light/dark setting, and everything the desktop needs in order to paint it. Provided by the
 * desktop element, so it is scoped to the desktop subtree the same way the window manager, app
 * catalogue and settings contexts are.
 *
 * This is also the only channel that reaches a modal. Umbraco portals modals out of the opener's
 * subtree, so the palette custom properties the desktop sets on its own root never inherit into
 * one — but a modal resolves contexts through the element that opened it, which is why the
 * settings dialog can consume this to render the theme picker.
 */
export class UmbraDesktopThemeContext extends UmbContextBase {
  #resolved = new UmbObjectState<UmbraDesktopResolvedTheme>(
    resolveTheme(UMBRADESKTOP_DEFAULT_THEME_ID, UMB_THEME_LIGHT_ALIAS),
  );

  #sheets = new UmbObjectState<UmbraDesktopThemeSheets>({});

  /** The theme, variant and palette in force. */
  public readonly resolved = this.#resolved.asObservable();

  /** The active theme's palette, rendered as declarations for a `style` attribute. */
  public readonly paletteStyle = this.#resolved.asObservablePart((resolved) => paletteCss(resolved.palette));

  /** The geometry the window manager and desktop surface need. */
  public readonly metrics = this.#resolved.asObservablePart((resolved) => resolved.theme.metrics);

  /**
   * The active theme's stylesheets, per surface. Starts empty and is replaced once the theme's
   * module resolves, so a lazily imported theme never renders a frame of unstyled chrome — the
   * previous theme's sheets stay adopted until the new ones arrive.
   */
  public readonly sheets = this.#sheets.asObservable();

  /** The id the user chose, which may differ from what is in force under high contrast. */
  #chosenId = UMBRADESKTOP_DEFAULT_THEME_ID;

  /** The backoffice's current theme alias. */
  #umbAlias = UMB_THEME_LIGHT_ALIAS;

  /** Guards against a slow import of an abandoned theme overwriting a newer selection. */
  #pending = 0;

  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_THEME_CONTEXT);

    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.theme, (id) => {
        this.#chosenId = id ?? UMBRADESKTOP_DEFAULT_THEME_ID;
        this.#apply();
      });
    });

    this.consumeContext(UMB_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.theme, (alias) => {
        this.#umbAlias = alias || UMB_THEME_LIGHT_ALIAS;
        this.#apply();
      });
    });
  }

  /**
   * Re-resolve the theme and load its stylesheets. Cheap when nothing changed: resolving is pure,
   * and a theme's module is only imported when the theme in force actually differs.
   */
  #apply(): void {
    const previous = this.#resolved.getValue();
    const next = resolveTheme(this.#chosenId, this.#umbAlias);
    this.#resolved.setValue(next);
    if (previous.theme.id !== next.theme.id) void this.#loadSheets(next);
  }

  /**
   * Import the resolved theme's stylesheets and publish them.
   *
   * A theme with no `sheets` — the Umbraco identity theme — publishes an empty set immediately,
   * which is what un-adopts the previous theme's rules.
   * @param resolved The theme now in force.
   */
  async #loadSheets(resolved: UmbraDesktopResolvedTheme): Promise<void> {
    const ticket = ++this.#pending;
    if (!resolved.theme.sheets) {
      this.#sheets.setValue({});
      return;
    }
    try {
      const sheets = await resolved.theme.sheets();
      // A newer selection landed while this import was in flight; its sheets win.
      if (ticket === this.#pending) this.#sheets.setValue(sheets);
    } catch {
      // A theme whose module fails to load leaves the chrome on its palette alone rather than
      // taking the desktop down: the fallbacks in every component still render something usable.
      if (ticket === this.#pending) this.#sheets.setValue({});
    }
  }
}

export default UmbraDesktopThemeContext;
```

- [ ] **Step 3: Build**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/theme.context.ts \
        src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/theme.context-token.ts
git commit -m "feat: theme context resolving the chosen theme against the backoffice setting"
```

---

### Task 13: The style controller

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/theme-styles.controller.ts`

- [ ] **Step 1: Write the controller**

```ts
import type { UmbraDesktopSurface } from './types';
import { UMBRADESKTOP_THEME_CONTEXT } from './theme.context-token.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * Adopts the active theme's stylesheet for one surface into its host component's shadow root.
 *
 * Lit populates `adoptedStyleSheets` from the element's `static styles` when it first renders, so
 * the component's own rules are captured **once** as a base and the theme sheet is always appended
 * to a fresh copy of it. Appending, rather than prepending, is what gives theme rules their
 * authority: later sheets win at equal specificity, so a theme can restate a base selector —
 * `.frame:not(.active) .title` — and override it without `!important`.
 */
export class UmbraDesktopThemeStyles extends UmbControllerBase {
  /** The component's own stylesheets, captured before any theme sheet is added. */
  #base?: ReadonlyArray<CSSStyleSheet>;

  /**
   * @param host The element whose shadow root receives the sheet.
   * @param surface Which of the theme's stylesheets this host wants.
   */
  constructor(
    host: UmbControllerHost & { renderRoot?: ParentNode },
    private readonly surface: UmbraDesktopSurface,
  ) {
    super(host);
    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.sheets, (sheets) => this.#adopt(host, sheets?.[this.surface]?.styleSheet));
    });
  }

  /**
   * Replace whatever theme sheet is adopted with this one.
   * @param host The element to style.
   * @param sheet The theme's sheet for this surface, or `undefined` when it styles nothing here.
   */
  #adopt(host: { renderRoot?: ParentNode }, sheet?: CSSStyleSheet): void {
    const root = host.renderRoot as ShadowRoot | undefined;
    if (!root || !('adoptedStyleSheets' in root)) return;
    this.#base ??= [...root.adoptedStyleSheets];
    root.adoptedStyleSheets = sheet ? [...this.#base, sheet] : [...this.#base];
  }
}
```

- [ ] **Step 2: Build**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/theme-styles.controller.ts
git commit -m "feat: controller adopting a theme's stylesheet into a component"
```

---

### Task 14: Wire the context and controller into the four components

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/desktop.element.ts`
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/taskbar.element.ts`
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/launcher.element.ts`
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/window.element.ts`
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/window-manager.context.ts`

- [ ] **Step 1: Provide the context and apply the palette in the desktop element**

Add the imports:

```ts
import { UmbraDesktopThemeContext } from '../theme/theme.context.js';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
```

In the class, add the context field beside `#settings`, a state for the palette, and the controller:

```ts
  #theme = new UmbraDesktopThemeContext(this);

  @state()
  private _paletteCss = '';
```

In the constructor, after the existing observes:

```ts
    new UmbraDesktopThemeStyles(this, 'desktop');
    this.observe(this.#theme.paletteStyle, (style) => (this._paletteCss = style ?? ''));
    this.observe(this.#theme.metrics, (metrics) => this.#manager.setMetrics(metrics));
```

`#settings` must be constructed **before** `#theme`, because the theme context consumes the settings context; field initialisers run in declaration order, so declare `#theme` after `#settings`.

In `render()`, prepend the palette to the `.desktop` style attribute:

```ts
      <div class="desktop ${hasImage ? 'has-image' : ''}" style=${this._paletteCss + this.#wallpaperStyle()}>
```

- [ ] **Step 2: Attach the controller in the other three components**

In each of `taskbar.element.ts`, `launcher.element.ts` and `window.element.ts`, add the import:

```ts
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
```

and one line in the constructor, with the matching surface name — `'taskbar'`, `'launcher'` and `'window'` respectively:

```ts
    new UmbraDesktopThemeStyles(this, 'taskbar');
```

`launcher.element.ts` has no constructor today; add one that calls `super()` first, then the controller.

- [ ] **Step 3: Let the window manager take metrics from the theme**

In `window-manager.context.ts`, add these two imports beside the existing ones:

```ts
import type { UmbraDesktopThemeMetrics } from '../theme/types';
import type { UmbraDesktopKeepVisible } from './window-model';
```

Add the two fields and the getter directly after the `windows` observable:

```ts
  /**
   * What must stay reachable while dragging, under the active theme. Defaults to the Umbraco
   * theme's geometry until the theme context resolves one.
   */
  #keep: UmbraDesktopKeepVisible = UMBRADESKTOP_WINDOW_KEEP_VISIBLE;

  /** The last desktop size seen, so a theme change can re-clamp without waiting for a resize. */
  #bounds?: { w: number; h: number };

  /**
   * The active theme's keep-visible margins. Read by the window element, which clamps live during
   * a drag rather than going through this context.
   * @returns The margins in force.
   */
  public get keep(): UmbraDesktopKeepVisible {
    return this.#keep;
  }

  /**
   * Adopt the active theme's geometry, then pull any window the new chrome has stranded back into
   * reach — a window parked against the right edge under trailing controls sits outside the clamp
   * once those controls move to the left.
   * @param metrics The active theme's metrics.
   */
  public setMetrics(metrics: UmbraDesktopThemeMetrics): void {
    this.#keep = {
      grab: metrics.grab,
      leading: metrics.leadingControlsWidth,
      trailing: metrics.trailingControlsWidth,
      titlebar: metrics.titlebarHeight,
    };
    if (this.#bounds) this.clampToBounds(this.#bounds);
  }
```

Then replace the body of `clampToBounds` so it remembers the bounds and uses the theme's margins:

```ts
  public clampToBounds(bounds: { w: number; h: number }): void {
    this.#bounds = bounds;
    const current = this.#windows.getValue();
    const next = clampWindowsToBounds(current, bounds, this.#keep);
    if (next !== current) this.#windows.setValue(next);
  }
```

Leave its JSDoc comment in place.

- [ ] **Step 4: Let the window element clamp with the theme's margins too**

`window.element.ts` clamps live during a drag and reads the constant directly. In `#onTitlePointerMove`, change the third argument:

```ts
    const { x, y } = clampWindowPosition(
      { ...this.window.rect, x: this.#startRect.x + dx, y: this.#startRect.y + dy },
      this.#startSurface,
      this.#manager?.keep ?? UMBRADESKTOP_WINDOW_KEEP_VISIBLE,
    );
```

The import of `UMBRADESKTOP_WINDOW_KEEP_VISIBLE` stays — it is now the fallback for the moment before the manager context resolves.

- [ ] **Step 5: Build and run the full suite**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 6: Browser-verify the Umbraco theme is still unchanged**

The maintainer confirms in the Test Instance: the desktop renders exactly as it did at the Milestone 1 gate, and switching the backoffice between Light, Dark and High contrast does not throw (the desktop's own appearance still comes from `--uui-*`, so it follows along as it always has).

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/
git commit -m "feat: provide the theme context and adopt theme styles across the chrome"
```

---

# Milestone 3 — The macOS theme

---

### Task 15: macOS palette and theme entry

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/macos/palette.ts`
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/macos/index.ts`
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/index.ts`

- [ ] **Step 1: Write the palettes**

```ts
import type { UmbraDesktopPalette } from '../../types';

/**
 * SF Pro cannot be shipped — licensing — so the stack resolves to the real thing on macOS and to
 * a sane system face elsewhere. The theme therefore looks most correct on a Mac, which is an
 * accepted limitation rather than a defect.
 */
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

/** macOS in its light appearance. */
export const MACOS_LIGHT: UmbraDesktopPalette = {
  '--umbradesktop-window-background': '#ffffff',
  '--umbradesktop-window-body-background': '#ffffff',
  '--umbradesktop-window-border': '1px solid rgba(0, 0, 0, 0.16)',
  '--umbradesktop-window-radius': '10px',
  '--umbradesktop-window-shadow': '0 8px 24px rgba(0, 0, 0, 0.22)',
  '--umbradesktop-window-shadow-active': '0 16px 40px rgba(0, 0, 0, 0.34)',
  '--umbradesktop-titlebar-height': '30px',
  '--umbradesktop-titlebar-background': 'linear-gradient(#f8f8f8, #e8e8e8)',
  '--umbradesktop-titlebar-border-bottom': '1px solid #cfcfcf',
  '--umbradesktop-titlebar-text': '#4d4d4d',
  '--umbradesktop-titlebar-inactive-opacity': '0.55',
  '--umbradesktop-control-color': '#4d4d4d',
  '--umbradesktop-taskbar-height': '44px',
  '--umbradesktop-taskbar-reserve': '62px',
  '--umbradesktop-taskbar-margin': '0 auto 10px',
  '--umbradesktop-taskbar-radius': '16px',
  '--umbradesktop-taskbar-background': 'rgba(255, 255, 255, 0.4)',
  '--umbradesktop-taskbar-background-opaque': '#e9e9ef',
  '--umbradesktop-taskbar-backdrop': 'blur(20px) saturate(180%)',
  '--umbradesktop-taskbar-border-top': '1px solid rgba(255, 255, 255, 0.55)',
  '--umbradesktop-taskbar-shadow': '0 8px 22px rgba(0, 0, 0, 0.28)',
  '--umbradesktop-taskbar-text': '#2c2c2e',
  '--umbradesktop-taskbar-text-emphasis': '#000000',
  '--umbradesktop-task-hover-background': 'rgba(0, 0, 0, 0.08)',
  '--umbradesktop-start-hover-background': 'rgba(0, 0, 0, 0.08)',
  '--umbradesktop-start-active-background': 'rgba(0, 0, 0, 0.12)',
  '--umbradesktop-task-active-marker': '#3c3c3e',
  '--umbradesktop-launcher-background': 'rgba(40, 36, 60, 0.62)',
  '--umbradesktop-launcher-backdrop': 'blur(28px) saturate(160%)',
  '--umbradesktop-launcher-border': 'none',
  '--umbradesktop-launcher-radius': '0',
  '--umbradesktop-launcher-shadow': 'none',
  '--umbradesktop-launcher-text': '#ffffff',
  '--umbradesktop-launcher-hover-background': 'rgba(255, 255, 255, 0.14)',
  '--umbradesktop-launcher-card-background': 'rgba(255, 255, 255, 0.1)',
  '--umbradesktop-launcher-card-border': '1px solid rgba(255, 255, 255, 0.16)',
  '--umbradesktop-launcher-card-radius': '12px',
  '--umbradesktop-desktop-background-color': '#3b6ea5',
  '--umbradesktop-desktop-background-image':
    'linear-gradient(155deg, #4a3f78 0%, #3b6ea5 55%, #2f8f96 100%)',
  '--umbradesktop-desktop-scrim': 'rgba(0, 0, 0, 0.1)',
  '--umbradesktop-desktop-watermark-opacity': '0.05',
};

/** macOS in its dark appearance, applied when the backoffice is in dark mode. */
export const MACOS_DARK: UmbraDesktopPalette = {
  ...MACOS_LIGHT,
  '--umbradesktop-window-background': '#2b2b2e',
  '--umbradesktop-window-body-background': '#242427',
  '--umbradesktop-window-border': '1px solid rgba(255, 255, 255, 0.12)',
  '--umbradesktop-window-shadow': '0 8px 24px rgba(0, 0, 0, 0.45)',
  '--umbradesktop-window-shadow-active': '0 16px 40px rgba(0, 0, 0, 0.6)',
  '--umbradesktop-titlebar-background': 'linear-gradient(#3a3a3d, #323235)',
  '--umbradesktop-titlebar-border-bottom': '1px solid rgba(0, 0, 0, 0.5)',
  '--umbradesktop-titlebar-text': '#d0d0d2',
  '--umbradesktop-control-color': '#d0d0d2',
  '--umbradesktop-taskbar-background': 'rgba(28, 28, 32, 0.7)',
  '--umbradesktop-taskbar-background-opaque': '#1c1c20',
  '--umbradesktop-taskbar-border-top': '1px solid rgba(255, 255, 255, 0.18)',
  '--umbradesktop-taskbar-text': '#e8e8ea',
  '--umbradesktop-taskbar-text-emphasis': '#ffffff',
  '--umbradesktop-task-hover-background': 'rgba(255, 255, 255, 0.12)',
  '--umbradesktop-start-hover-background': 'rgba(255, 255, 255, 0.12)',
  '--umbradesktop-start-active-background': 'rgba(255, 255, 255, 0.18)',
  '--umbradesktop-task-active-marker': '#ffffff',
  '--umbradesktop-desktop-background-color': '#1d3550',
  '--umbradesktop-desktop-background-image':
    'linear-gradient(155deg, #2a2340 0%, #1d3550 55%, #17414a 100%)',
};

/** The font stack both variants use. */
export const MACOS_FONT = FONT;
```

- [ ] **Step 2: Write the theme entry**

```ts
import type { UmbraDesktopTheme } from '../../types';
import { MACOS_DARK, MACOS_LIGHT } from './palette.js';

/**
 * macOS chrome around Umbraco content: traffic lights, a floating dock, a Launchpad-style
 * fullscreen launcher. Window bodies stay Umbraco-styled, which is what a web app on a Mac looks
 * like anyway.
 */
export const UMBRADESKTOP_MACOS_THEME: UmbraDesktopTheme = {
  id: 'macos',
  name: 'macOS',
  swatch: { chrome: '#e8e8ea', accent: '#ff5f57', surface: '#ffffff' },
  palettes: { light: MACOS_LIGHT, dark: MACOS_DARK },
  metrics: {
    titlebarHeight: 30,
    // Three 12px lights with 8px gaps and 10px of padding, then the reload button after a gap.
    leadingControlsWidth: 124,
    trailingControlsWidth: 0,
    grab: 80,
    // 44px dock plus its 10px bottom margin and a little clearance.
    taskbarReserve: 62,
  },
  sheets: async () => {
    const [desktop, taskbar, launcher, window] = await Promise.all([
      import('./desktop.css.js'),
      import('./taskbar.css.js'),
      import('./launcher.css.js'),
      import('./window.css.js'),
    ]);
    return {
      desktop: desktop.default,
      taskbar: taskbar.default,
      launcher: launcher.default,
      window: window.default,
    };
  },
};
```

- [ ] **Step 3: Register it in the catalogue**

In `themes/index.ts`, add the import and extend the array:

```ts
import { UMBRADESKTOP_MACOS_THEME } from './macos/index.js';
```

```ts
export const UMBRADESKTOP_THEMES: ReadonlyArray<UmbraDesktopTheme> = [
  UMBRADESKTOP_UMBRACO_THEME,
  UMBRADESKTOP_MACOS_THEME,
];
```

- [ ] **Step 4: Commit**

The build will not succeed until Task 16 adds the four stylesheets, so commit without building.

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/
git commit -m "feat: macOS theme palettes, metrics and catalogue entry"
```

---

### Task 16: The macOS stylesheets

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/macos/window.css.ts`
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/macos/taskbar.css.ts`
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/macos/launcher.css.ts`
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/macos/desktop.css.ts`

- [ ] **Step 1: Write `window.css.ts`**

```ts
import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { MACOS_FONT } from './palette.js';

/**
 * macOS window chrome: traffic lights leading the titlebar, the title centred across it, and the
 * reload control travelling with the cluster rather than sitting opposite it — keeping every
 * control at one end is what leaves the draggable strip contiguous for the bounds clamp.
 */
export default css`
  .titlebar {
    font-family: ${unsafeCSS(MACOS_FONT)};
    padding: 0 10px;
  }
  /* Controls lead the bar; the title then centres over the bar's full width rather than the
     space left beside them. */
  .controls {
    order: -1;
    align-items: center;
    align-self: center;
    gap: 8px;
    margin-right: 8px;
  }
  .title {
    position: absolute;
    left: 0;
    right: 0;
    justify-content: center;
    pointer-events: none;
    font-size: 11px;
    font-weight: 600;
  }
  .title umb-icon {
    display: none;
  }
  .title-text {
    transform: none;
  }
  /* The three lights: colour at rest, glyph only once the pointer is over the bar. */
  .ctrl-close,
  .ctrl-minimize,
  .ctrl-maximize {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 0.5px solid rgba(0, 0, 0, 0.16);
  }
  .ctrl-close {
    background: #ff5f57;
  }
  .ctrl-minimize {
    background: #febc2e;
  }
  .ctrl-maximize {
    background: #28c840;
  }
  .frame:not(.active) .ctrl-close,
  .frame:not(.active) .ctrl-minimize,
  .frame:not(.active) .ctrl-maximize {
    background: #d6d6d8;
  }
  .ctrl-close:hover,
  .ctrl-minimize:hover,
  .ctrl-maximize:hover {
    background: var(--light, currentColor);
  }
  .ctrl-close:hover {
    --light: #ff5f57;
    color: rgba(0, 0, 0, 0.6);
  }
  .ctrl-minimize:hover {
    --light: #febc2e;
    color: rgba(0, 0, 0, 0.6);
  }
  .ctrl-maximize:hover {
    --light: #28c840;
    color: rgba(0, 0, 0, 0.6);
  }
  .ctrl-close .glyph,
  .ctrl-minimize .glyph,
  .ctrl-maximize .glyph {
    width: 8px;
    height: 8px;
    stroke-width: 1.6;
    opacity: 0;
    transition: opacity 80ms;
  }
  .titlebar:hover .ctrl-close .glyph,
  .titlebar:hover .ctrl-minimize .glyph,
  .titlebar:hover .ctrl-maximize .glyph {
    opacity: 1;
  }
  /* Reload is not a native macOS control, so it stays a plain glyph button — set apart from the
     cluster by a gap rather than pretending to be a fourth light. */
  .ctrl-reload {
    width: 22px;
    height: 22px;
    margin-left: 10px;
    border-radius: 50%;
  }
  .ctrl-reload:hover {
    background: rgba(0, 0, 0, 0.08);
  }
  .ctrl-reload .glyph.ring {
    width: 13px;
    height: 13px;
  }
`;
```

- [ ] **Step 2: Write `taskbar.css.ts`**

```ts
import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { MACOS_FONT } from './palette.js';

/**
 * The Dock: a centred floating slab rather than a full-width bar. The cluster added during
 * tokenisation is what makes centring possible — start and the running windows travel together
 * while the clock keeps its own edge.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(MACOS_FONT)};
  }
  .bar {
    width: max-content;
    max-width: calc(100% - 24px);
    padding: 0 10px;
    gap: 6px;
  }
  .cluster {
    flex: 0 1 auto;
    align-items: center;
    gap: 6px;
  }
  .running {
    flex: 0 1 auto;
    gap: 6px;
    align-items: center;
  }
  /* Dock tiles: square icons, no labels, and the running indicator as a dot beneath rather than
     an underline across. */
  .start,
  .task {
    height: 34px;
    min-width: 34px;
    padding: 0 6px;
    border-radius: 8px;
  }
  .start umb-icon,
  .task umb-icon {
    font-size: 24px;
    margin-left: 0;
  }
  .task-label {
    display: none;
  }
  .task.active {
    box-shadow: none;
    position: relative;
  }
  .task.active::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -5px;
    width: 4px;
    height: 4px;
    margin-left: -2px;
    border-radius: 50%;
    background: var(--umbradesktop-task-active-marker, #3c3c3e);
  }
  .clock {
    padding: 0 4px 0 10px;
    border-left: 1px solid rgba(0, 0, 0, 0.16);
    font-size: 11px;
    font-weight: 500;
    opacity: 1;
  }
  /* The launcher fills the surface above the dock, so it is positioned by the sheet rather than
     offset from the bar. */
  .launcher {
    left: 0;
    right: 0;
    bottom: var(--umbradesktop-taskbar-reserve, 62px);
  }
`;
```

- [ ] **Step 3: Write `launcher.css.ts`**

```ts
import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { MACOS_FONT } from './palette.js';

/**
 * A Launchpad-style surface: the panel fills the desktop above the dock, blurred over whatever is
 * behind it. Only the *surface* changes — search, group cards, Favourites, tiles and pins keep
 * their structure, because a theme may restyle but never remove.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(MACOS_FONT)};
    width: 100%;
    height: 100%;
    max-height: none;
  }
  .search {
    align-self: center;
    width: min(420px, 80%);
    margin: 28px 0 8px;
    border-radius: 999px;
    justify-content: center;
    color: rgba(255, 255, 255, 0.85);
  }
  .body {
    align-items: center;
    padding: 12px 40px 32px;
  }
  .cards {
    width: min(1100px, 100%);
    gap: 22px;
  }
  .ch {
    color: rgba(255, 255, 255, 0.75);
    opacity: 1;
  }
  .launch umb-icon {
    font-size: 44px;
  }
  .tlb {
    font-size: 12px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  .tile:hover .launch {
    border-radius: 12px;
  }
  .footer {
    align-self: stretch;
    background: rgba(0, 0, 0, 0.22);
    border-top: 1px solid rgba(255, 255, 255, 0.14);
  }
`;
```

- [ ] **Step 4: Write `desktop.css.ts`**

```ts
import { css } from '@umbraco-cms/backoffice/external/lit';

/**
 * The desktop surface under macOS. The dock floats, so the taskbar is centred on the bottom edge
 * rather than stretched across it — everything else the palette already handles.
 */
export default css`
  umbradesktop-taskbar {
    display: flex;
    justify-content: center;
  }
  .wallpaper-brand {
    display: none;
  }
`;
```

- [ ] **Step 5: Build and run the full suite**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/macos/
git commit -m "feat: macOS stylesheets for the window, dock, launcher and desktop"
```

---

# Milestone 4 — The picker

---

### Task 17: Localization strings

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/localization/en.ts`
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/localization/nl.ts`

- [ ] **Step 1: Add the English strings**

In `en.ts`, add beside the existing desktop-settings entries, before the wallpaper block:

```ts
    // desktop settings — theme
    theme: 'Theme',
    themeDescription: 'Changes the look of the desktop, taskbar and windows. Your content stays the same.',
    themeHighContrast: 'The backoffice is in high contrast, so the Umbraco theme is being used.',
```

- [ ] **Step 2: Add the Dutch strings**

In `nl.ts`, in the same position:

```ts
    // desktop settings — theme
    theme: 'Thema',
    themeDescription: 'Verandert het uiterlijk van het bureaublad, de taakbalk en de vensters. Je content blijft hetzelfde.',
    themeHighContrast: 'De backoffice staat op hoog contrast, dus het Umbraco-thema wordt gebruikt.',
```

- [ ] **Step 3: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/localization/
git commit -m "feat: localization strings for the theme picker"
```

---

### Task 18: The Theme section in Desktop settings

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/settings/components/settings-modal.element.ts`

- [ ] **Step 1: Consume the theme context and track the resolved theme**

Add the imports:

```ts
import type { UmbraDesktopResolvedTheme } from '../../theme/resolve-variant';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../theme/theme.context-token';
import { UMBRADESKTOP_THEMES } from '../../theme/themes/index';
```

Add two state fields beside `_wallpaper`:

```ts
  @state()
  private _theme?: UmbraDesktopResolvedTheme;

  /**
   * The theme the user *chose*, which is not always the one in force: high contrast overrides the
   * choice without discarding it. The picker marks this one, so switching the backoffice to high
   * contrast never looks like it silently reset the user's selection — the hint below explains the
   * override instead.
   */
  @state()
  private _chosenThemeId?: string;
```

In the existing `UMBRADESKTOP_SETTINGS_CONTEXT` callback, add one more observe beside the wallpaper one:

```ts
      this.observe(context.theme, (id) => (this._chosenThemeId = id));
```

And in the constructor, after the settings context is consumed:

```ts
    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.resolved, (resolved) => (this._theme = resolved));
    });
```

- [ ] **Step 2: Render the Theme section**

Add this method to the class:

```ts
  /**
   * The theme picker: one swatch per shipped theme, marking whichever is in force. Selecting
   * applies immediately and persists, matching the wallpaper section's no-Save behaviour.
   * @returns The Theme section template.
   */
  #renderThemes() {
    // The user's choice, not the theme in force — see `_chosenThemeId`.
    const activeId = this._chosenThemeId ?? this._theme?.theme.id;
    return html`
      <uui-box headline=${this.localize.term('umbraDesktop_theme')}>
        <p class="hint">${this.localize.term('umbraDesktop_themeDescription')}</p>
        <div class="themes">
          ${UMBRADESKTOP_THEMES.map(
            (theme) => html`
              <button
                class="theme ${theme.id === activeId ? 'selected' : ''}"
                aria-pressed=${theme.id === activeId}
                @click=${() => this.#settings?.setTheme(theme.id)}>
                <span class="swatch" aria-hidden="true">
                  ${[theme.swatch.chrome, theme.swatch.accent, theme.swatch.surface].map(
                    (colour) => html`<i style="background:${colour}"></i>`,
                  )}
                </span>
                <span class="theme-name">${theme.name}</span>
              </button>
            `,
          )}
        </div>
        ${this._theme?.forcedByContrast
          ? html`<p class="hint warn">${this.localize.term('umbraDesktop_themeHighContrast')}</p>`
          : ''}
      </uui-box>
    `;
  }
```

And call it in `render()`, above the existing wallpaper `uui-box`:

```ts
      <umb-body-layout headline=${this.localize.term('umbraDesktop_desktopSettings')}>
        ${this.#renderThemes()}
        <uui-box headline=${this.localize.term('umbraDesktop_wallpaper')}>
```

- [ ] **Step 3: Style the section**

Append to `static styles`:

```css
      .hint {
        margin: 0 0 var(--uui-size-space-4);
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .hint.warn {
        margin: var(--uui-size-space-4) 0 0;
      }
      .themes {
        display: flex;
        flex-wrap: wrap;
        gap: var(--uui-size-space-3);
      }
      .theme {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-2);
        border: 2px solid transparent;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--uui-color-text);
        cursor: pointer;
        font-family: inherit;
      }
      .theme:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05));
      }
      .theme.selected {
        border-color: var(--uui-color-selected, var(--uui-color-focus));
      }
      .swatch {
        display: flex;
        width: 96px;
        height: 54px;
        overflow: hidden;
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }
      .swatch i {
        flex: 1;
        display: block;
      }
      .theme-name {
        font-size: var(--uui-type-small-size);
      }
```

- [ ] **Step 4: Build and run the full suite**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/settings/components/settings-modal.element.ts
git commit -m "feat: theme picker in the desktop settings dialog"
```

---

### Task 19: 🚦 Final browser verification

- [ ] **Step 1: Build and hand over**

Run: `cd src/Umbraco.Community.UmbraDesktop && npm run build`
Expected: build succeeds. The maintainer runs the Test Instance.

- [ ] **Step 2: Maintainer confirms**

- Desktop settings shows a Theme section with an Umbraco and a macOS swatch; the active one is marked.
- Selecting macOS applies immediately: dock, traffic lights, rounded windows, fullscreen launcher.
- Selecting Umbraco returns the desktop to exactly its Milestone 1 appearance — the dock, traffic lights and blurred launcher are all gone, not merely recoloured.
- Switching the backoffice between Light and Dark live-updates the macOS chrome.
- Switching the backoffice to High contrast forces the Umbraco theme and shows the explanatory line, while the picker still marks **macOS** as the user's choice; leaving high contrast restores macOS without the user re-picking it.
- **Per design §1.1, every launcher affordance still works under macOS**, not merely appears: search opens the search modal, tiles launch windows, pinning and unpinning work, the user button opens the current-user modal, Desktop settings reopens this dialog, and Exit leaves the section.
- Under macOS, a window dragged hard against each of the four edges stays grabbable by its titlebar.
- Switching themes with several windows open pulls any stranded window back into reach.
- The chosen theme survives a page reload.

- [ ] **Step 3: Tag the release candidate**

```bash
git tag -a theming-complete -m "Theming system: Umbraco and macOS themes"
```

---

## Deferred to a follow-up

Recorded in design §12 and not built here: the macOS menu bar; a true Launchpad that restructures the launcher's content; the Windows 98, Windows 11 and Linux themes; third-party themes as an extension type; theming window content or core modals; an admin-enforced site-wide default; pairing a theme with a default wallpaper; and dock magnification or minimize animations.
