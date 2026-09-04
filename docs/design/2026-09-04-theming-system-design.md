# Theming system — Design

> A **theme picker** for UmbraDesktop, and the system behind it: the desktop chrome — launcher,
> taskbar, windows — can be restyled to look like another operating system. Ships with the current
> Umbraco look and a **macOS** theme; shaped so Windows 98, Windows 11 and a Linux theme are each a
> folder of CSS rather than a change to the shell.

- **Status:** Approved design / pre-implementation
- **Date:** 2026-09-04
- **Branch:** `feature/1_theming`
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

The Desktop settings dialog already anticipates this: *"adding the planned skin picker means
appending one [section], not restructuring this element"*
([settings-modal.element.ts](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/settings/components/settings-modal.element.ts)).
This design builds it.

**In scope**

- A **Theme** section in Desktop settings, above Wallpaper.
- Two themes shipped: **Umbraco** (today's look, the default) and **macOS**.
- A theme contract that carries a **palette**, a **metrics** record and a set of **stylesheets**.
- Automatic light/dark variant selection from Umbraco's own theme setting.
- The tokenisation pass that makes any of this possible: hardcoded colours and JS-driven inline
  positions become custom properties.
- Per-user, per-browser persistence, in the existing settings payload.

**Out of scope** — listed in §12. Most notably the macOS menu bar.

**Everything here is frontend.** No C# is added: no controllers, no DTOs, no migrations, no OpenAPI
client regeneration. The global rule "test-first for all backend code" therefore has nothing to bind
to; §10 sets out the frontend testing approach instead.

### 1.1 A theme may restyle, never remove

A theme is CSS, so `display: none` is always within reach — and that is the one way a stylesheet can
break the product. Win98's Start menu has no search field and no footer; the temptation is to hide
the launcher's. Doing so would remove the only route to Search, the user modal, Exit and Desktop
settings — including the theme picker, leaving no way back out of the theme.

**Every affordance the Umbraco theme offers must remain reachable under every theme.** A theme may
move, resize, restyle or re-order them; it may not hide them. Win98's Start menu gets its search and
footer restyled as menu rows, not deleted. This is a review criterion for each theme, and the reason
§10's browser checkpoints walk the full launcher under every theme rather than only looking at it.

### 1.2 The boundary, stated once

A theme styles the **chrome**: the desktop surface, the taskbar/dock, the launcher panel, and the
window frame. It does not style **content**. Window bodies are iframes hosting the real backoffice,
and core modals (search, media picker, current user) are UUI. Both stay Umbraco-looking under every
theme.

So the macOS theme is *Mac chrome around Umbraco content* — which is what a web app on a Mac looks
like anyway. This is a deliberate limit, not a gap to close later.

---

## 2. Settled decisions

| # | Decision | Why |
|---|---|---|
| D1 | A theme **owns its whole palette**; it does not reserve slots for Umbraco branding | Win98 *is* `#c0c0c0`. A theme that can only reshape Umbraco's colours can't be Win98, and barely reads as macOS. |
| D2 | The **Umbraco theme is the identity theme**: its palette maps every token to the `--uui-*` value in use today | Today's look is preserved bit-for-bit, it follows Umbraco light/dark for free, and it needs no special-casing — it is just the theme whose values happen to be `var(--uui-…)`. |
| D3 | Light/dark is a **variant of one theme**, resolved from `UMB_THEME_CONTEXT` — not two picker entries | Verified available in Umbraco 17: the context exposes a reactive `theme` observable carrying `umb-light-theme` / `umb-dark-theme` / `umb-high-contrast-theme`. One "macOS" entry that follows the backoffice beats "macOS Light" and "macOS Dark". |
| D4 | **High contrast forces the Umbraco theme** | Accessibility beats fidelity. The high-contrast stylesheet redefines `--uui-*` tokens, which only the identity theme reads. Handing someone a macOS gradient when they asked for high contrast is a regression. |
| D5 | Theme CSS reaches components via **`adoptedStyleSheets`**, not `::part()` | `::part()` cannot reach the desktop at all: three Umbraco-owned shadow roots sit between the document and `<umbradesktop-desktop>`, none forwarding `exportparts`, and the spec has no wildcard. See §3.1. |
| D6 | Theme CSS lives in **`themes/<id>/*.css.ts`**, never in the components | Five themes inlined into `window.element.ts` (538 lines today) would push it past 1500, and adding a theme would mean editing all four core files. |
| D7 | A **`UmbraDesktopThemeContext`** provided by the desktop element carries theme id, variant, palette and metrics | Same pattern as the window manager, app catalogue and settings contexts. It is also the *only* channel that reaches portalled modals — see §3.3. |
| D8 | Dock-vs-bar and label visibility are **theme-owned CSS**, not user settings | No real OS offers that as a preference, and it keeps the theme contract to one axis. |
| D9 | A theme publishes a small **metrics record** that JavaScript reads | The single exception to "themes are only styling": the bounds clamp needs to know where the window controls are. Four numbers. See §5. |
| D10 | Themes are a **closed set shipped in the package** | Matches the curated app catalogue. Nothing here forecloses opening it up later. |
| D11 | The settings payload stays at **`v: 1`**; `theme` is added as an independently-recovered field | `parseSettings` already recovers each field independently. Bumping the version would reset every existing user's wallpaper and pins for no gain. |
| D12 | The macOS theme is **Level 1 + a fullscreen launcher surface**; the launcher's *content* is unchanged | Restyling the panel's own surface is CSS. Rebuilding the tile grid as true Launchpad would cost the group cards and the pin affordance — a feature traded for a resemblance. |

---

## 3. Architecture

Two channels, because a theme has two kinds of payload.

```
umbradesktop-desktop
  └── provides UmbraDesktopThemeContext
        │   reads: settings.context (chosen theme id)
        │          UMB_THEME_CONTEXT   (umb-light-theme | umb-dark-theme | umb-high-contrast-theme)
        │   publishes: theme · palette · metrics · sheets
        │
        ├── DATA ─── consumeContext(), crosses shadow boundaries and reaches modals
        │     ├── window-manager.context ── metrics ──> clampWindowPosition
        │     ├── desktop.element ── palette ──> custom properties on the root
        │     └── settings-modal ── theme id ──> renders the picker
        │
        └── CSS ──── renderRoot.adoptedStyleSheets, per component
              ├── umbradesktop-desktop   ← themes/<id>/desktop.css.ts
              ├── umbradesktop-taskbar   ← themes/<id>/taskbar.css.ts
              ├── umbradesktop-launcher  ← themes/<id>/launcher.css.ts
              └── umbradesktop-window    ← themes/<id>/window.css.ts
```

### 3.1 Why not `::part()`

Worth recording, because it looks attractive and it is a dead end.

`<umbradesktop-desktop>` is mounted by Umbraco's section router behind `umb-backoffice` →
`umb-section` → `umb-section-main`, each a shadow root Umbraco owns. `::part()` crosses a shadow
boundary only when the host forwards it with `exportparts`, and CSS Shadow Parts has **no
wildcard**. Umbraco core forwards nothing, and we cannot add it.

This is the same wall `findShadowRootWith()` in
[chrome-injector.ts](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/chrome-injector.ts)
was written to climb, and the reason `#setOuterChrome` injects a `<style>` element rather than
shipping CSS.

We could reuse that breadth-first walk to inject a theme sheet into the owning shadow root. But then
the entire theme depends on a timing-sensitive DOM walk — a race there today flashes the outer
header briefly; a race there for theming renders the desktop unstyled — and we would still owe an
`exportparts` chain across our own three levels of nesting, roughly 44 hand-maintained part names.

And it still would not be enough. `::part()` accepts pseudo-*classes*, never a descendant, so
`::part(tile):hover ::part(pin)` is not valid CSS. The rules a theme most wants to change are
exactly that shape: `.tile:hover .pin`, `.frame:not(.active) .title`, `.ctrl.busy .glyph.ring`.

### 3.2 The palette layer costs nothing

Custom properties inherit **through** shadow boundaries. So the palette needs no plumbing at all:
the desktop element sets `--umbradesktop-*` on its root, and all four components — plus anything
nested inside them — inherit. Most of a theme lives here.

The adopted sheets carry only what properties genuinely cannot express: control position, dock
geometry, the fullscreen launcher surface, Win98's bevels.

### 3.3 Why the context is required, not merely tidy

Umbraco portals modals out of the opener's subtree, so palette custom properties set on the desktop
root **do not reach them**. Context does, because modals resolve contexts through the element that
opened them — the fact already documented at
[taskbar.element.ts:117](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/taskbar.element.ts).
Without the theme context the settings dialog has no way to know which theme is active in order to
render the picker.

### 3.4 The style controller

A shared `UmbraDesktopThemeStyles(host, surface)` consumes the theme context, observes `sheets`, and
appends the sheet for its surface to the host's `renderRoot.adoptedStyleSheets`.

Two constraints:

- Lit populates `adoptedStyleSheets` from `static styles` at construction. The controller captures
  that array **once** as the base and always writes `[...base, sheet]`, so repeated theme switches
  never accumulate or drop the component's own styles.
- On switch, the previous sheet stays adopted until the new theme's module resolves, so a lazily
  imported theme never renders a frame of unstyled chrome.

Appending rather than prepending is what gives theme rules their authority: later sheets win at equal
specificity, so a theme can restate a base selector — `.frame:not(.active) .title` — and override it
without `!important` or a specificity arms race. Win98 needs exactly this, since its inactive
titlebar is a different *colour*, not the base theme's reduced opacity.

---

## 4. The theme contract

```ts
/** One theme's palette for one variant: every themeable value, as CSS custom properties. */
export type UmbraDesktopPalette = Readonly<Record<string, string>>;

/** A theme as shipped in the package. */
export interface UmbraDesktopTheme {
  /** Stable id, persisted in settings. */
  id: string;
  /** Display name for the picker. Not localized — these are proper nouns, as with wallpapers (D9 of the wallpapers design). */
  name: string;
  /** Palettes by variant. `light` is mandatory; the others fall back to it. */
  palettes: { light: UmbraDesktopPalette; dark?: UmbraDesktopPalette };
  /** Geometry JavaScript needs. See §5. */
  metrics: UmbraDesktopThemeMetrics;
  /** Lazily imported per-surface stylesheets. Omitted by the Umbraco theme, which needs none. */
  sheets?: () => Promise<UmbraDesktopThemeSheets>;
}
```

Adding a theme is a new folder plus one entry in `themes/index.ts` — the same shape as
`catalogue/index.ts`.

### 4.1 Token groups

Prefixed `--umbradesktop-`, matching the codebase's naming elsewhere. Each token is named for the CSS
property it feeds, so `titlebar-border-bottom` sets a `border-bottom` and `window-border` sets the
`border` shorthand — a theme author never has to guess which sides a value will reach. The
`UmbraDesktopToken` union in `theme/types.ts` is the normative list; the groups below are a summary.

| Group | Examples |
|---|---|
| Desktop | `desktop-background`, `desktop-scrim`, `desktop-watermark-opacity` |
| Window | `window-background`, `window-border`, `window-radius`, `window-shadow`, `window-shadow-active` |
| Titlebar | `titlebar-height`, `titlebar-background`, `titlebar-border-bottom`, `titlebar-text`, `titlebar-inactive-opacity` |
| Controls | `control-color`, `control-hover-background`, `control-close-hover-background`, `control-close-hover-color` |
| Taskbar | `taskbar-background`, `taskbar-border`, `taskbar-shadow`, `taskbar-radius`, `taskbar-blur`, `taskbar-text`, `taskbar-hover-background`, `taskbar-active-marker` |
| Launcher | `launcher-background`, `launcher-surface`, `launcher-card-background`, `launcher-border`, `launcher-radius`, `launcher-shadow`, `launcher-text`, `launcher-text-muted` |
| Type | `font-family`, `font-size-small` |

### 4.2 Validated against the themes not yet built

The contract was checked against Windows 98, Windows 11 and a GNOME/Adwaita-style Linux theme before
being settled, because a contract proven only by macOS would be a contract shaped by macOS.

| Demand | Covered by |
|---|---|
| Win98 double bevels — white/grey/black on four sides, outer and inner | Layered `inset` box-shadows. No extra DOM, so it stays CSS |
| Win98 active titlebar is navy with white text; inactive is grey | A theme sheet restating `.frame:not(.active) .titlebar` and resetting the base opacity rule — see §3.4 on why appended sheets win |
| Win98 Start menu: a narrow vertical list, not a 960px card grid | `:host { width }` plus `grid-template-columns: 1fr` on `.cards` and `.grid`, and `.launch { flex-direction: row }` to turn tiles into rows |
| Win11 centred Start + task buttons, clock pinned right | The `.cluster` wrapper added in §6 |
| Win11 dark mode | The `dark` palette variant (D3) |
| Linux headerbar: centred title, controls right, large radius | Palette and metrics only; no new mechanism |
| macOS traffic lights: close red, minimize amber, maximize green | The per-control classes added in §6 |

Three of these forced changes to the preparation pass rather than to the contract, which is the
outcome to want: §6 grew, §4 did not.

The **Umbraco** theme's light palette is these tokens mapped to the values the components use today
(`--uui-color-surface`, `--uui-shadow-depth-3`, `rgba(16, 20, 46, 0.72)`, and so on). Its dark
palette is the same list — because those `--uui-*` values already follow Umbraco's dark theme, the
identity mapping tracks it automatically.

---

## 5. Metrics — the one thing JavaScript must know

`UMBRADESKTOP_WINDOW_KEEP_VISIBLE` in
[constants.ts](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/constants.ts) is
`{ grab: 80, controls: 138, titlebar: 40 }`, and `clampWindowPosition` assumes the non-draggable
controls sit at the titlebar's **right** end — the draggable strip is computed from the window's left
edge as `w - controls`. macOS puts them on the left, which inverts the math at both edges.

```ts
export interface UmbraDesktopThemeMetrics {
  /** Titlebar height in px. Kept in sync with the theme's own CSS. */
  titlebarHeight: number;
  /** Width in px of non-draggable controls at the titlebar's left end. */
  leadingControlsWidth: number;
  /** Width in px of non-draggable controls at the titlebar's right end. */
  trailingControlsWidth: number;
  /** How much draggable titlebar must stay on screen. */
  grab: number;
  /** Height reserved at the desktop's bottom edge for the taskbar or dock. */
  taskbarReserve: number;
}
```

A *side* enum was the obvious modelling. Two widths are the same size, need no branch in the clamp
(`stripStart = leading`, `stripWidth = w - leading - trailing`), and leave room for a theme that
splits its controls across both ends. No shipped theme does — macOS moves reload left with the
cluster (§7.1) — so `trailingControlsWidth` is `0` for every theme but Umbraco today.

### 5.1 Generalising the clamp

`clampWindowPosition` gains one parameter: `stripStart`, the draggable strip's offset from the
window's left edge, where

```
stripStart = leadingControlsWidth
stripWidth = w - leadingControlsWidth - trailingControlsWidth
```

The strip spans `[x + stripStart, x + stripStart + stripWidth]`, giving

```
lo = grab - stripStart - stripWidth
hi = bounds.w - grab - stripStart
```

- **Umbraco** (`leading 0`, `trailing 138`) → `stripStart = 0`, `stripWidth = w - 138`, so
  `lo = grab - strip` and `hi = bounds.w - grab`. Identical to today, so the existing tests hold
  unchanged.
- **macOS** (`leading 78`, `trailing 46`) → `lo = grab - w + 46` and `hi = bounds.w - grab - 78`.

`clampWindowsToBounds` passes it through. `restoreDragPosition` is unaffected — a proportional grip
does not care which end the controls are at.

Switching theme republishes the metrics, and the window manager re-runs `clampWindowsToBounds`, so
windows placed under one theme are pulled back into reach under the next.

---

## 6. Tokenisation — what must change before any theme works

Two blockers in the current code, both small and both prerequisites.

**Hardcoded colours.** `taskbar.element.ts` hardcodes `rgba(16, 20, 46, 0.72)` and the `#0f1330`
no-backdrop-filter fallback; `desktop.element.ts` hardcodes `#0e1329` and the radial gradient;
`window.element.ts` hardcodes `rgba(0, 0, 0, 0.07)` and the close-button danger red. Each becomes a
token, with the Umbraco theme supplying today's value.

**Inline styles beat stylesheets.** Positions derived from `UMBRADESKTOP_TASKBAR_HEIGHT` are written
as `style` attributes — on `.bar` and the launcher in
[taskbar.element.ts](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/taskbar.element.ts),
and on `.surface` and `.wallpaper-brand` in
[desktop.element.ts](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/desktop.element.ts).
An inline style cannot be overridden by an adopted sheet, so a floating dock and a fullscreen
launcher are both impossible until these become `--umbradesktop-taskbar-reserve`, set once on the
desktop root from the active theme's metrics.

The `.frame` inline style in `window.element.ts` stays — it carries genuinely per-window position,
size and z-index, and no theme needs to override it.

**The window controls are not individually addressable.** Reload, minimize and maximize all render as
bare `class="ctrl"`; only close carries a modifier. macOS needs close red, minimize amber and
maximize green, which is impossible today. Each control gains its own class — `ctrl-reload`,
`ctrl-minimize`, `ctrl-maximize`, `ctrl-close` — alongside the shared `ctrl`. Win98 needs the same
handle to separate close from the `_ □` pair.

**The taskbar has no cluster wrapper.** `.start`, `.running` and `.clock` are flex siblings, so a
theme that wants Start and the task buttons centred together with the clock pinned right — Windows 11,
and any dock-style arrangement — has no element to centre. A `.cluster` wrapper around `.start` and
`.running` makes that a one-line rule instead of a `margin: auto` puzzle.

**Regression criterion:** with the Umbraco theme selected, the desktop must be pixel-identical to
today. That is what makes this pass safe.

---

## 7. The macOS theme

### 7.1 What it changes

| Surface | Treatment |
|---|---|
| Windows | 10px radius, hairline border, deep soft shadow; light titlebar gradient with a bottom hairline |
| Controls | Traffic lights at the **left**: three 12px circles, red/amber/green, glyphs revealed on titlebar hover. Ordered with `order: -1` on `.controls`; the title centres over the full titlebar width |
| Reload | Kept, and moves **with** the cluster to the left, sitting after a gap as a plain glyph button rather than a fourth light. Neither macOS nor Windows has a reload control, so there is no native placement to honour — keeping every control at one end keeps the draggable strip contiguous |
| Taskbar | Centred floating dock: `left: 50%`, translated, auto width, 16px radius, translucent with `backdrop-filter`, 10px above the bottom edge. Labels hidden |
| Clock | Stays as a dock-mounted status item. Unfaithful — macOS puts it in the menu bar — but the menu bar is out of scope, and dropping the clock loses a feature |
| Launcher | Fills the desktop surface above the dock — the dock stays visible, as Launchpad does. Translucent, heavily blurred, no border or radius. **Content unchanged** — search, group cards, Favourites, tiles and pins all keep their structure, restyled |
| Desktop | Retains the wallpaper machinery untouched; only the fallback gradient and scrim are re-tokenised |

### 7.2 Fonts

SF Pro cannot be shipped — licensing. The theme sets
`font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`, which resolves
to real SF on macOS and a sane stack elsewhere. **The macOS theme therefore looks most correct on a
Mac.** Recorded as an accepted limitation, not a defect.

### 7.3 Metrics

```ts
{ titlebarHeight: 30, leadingControlsWidth: 124, trailingControlsWidth: 0, grab: 80, taskbarReserve: 62 }
```

---

## 8. UI — the picker

A **Theme** section in the Desktop settings dialog, appended above Wallpaper, exactly as that
design anticipated.

- A row of preview swatches, one per theme — a miniature of a titlebar and a dock drawn in that
  theme's palette, so the choice is visible without applying it.
- The current theme is marked selected.
- Selecting applies immediately and persists, matching the wallpaper section's no-Save behaviour;
  the dialog is non-modal enough that the change is visible behind it.
- A line of help text where the active variant is not the theme's own: *"Following the backoffice's
  high contrast theme."*

---

## 9. Module layout

```
src/desktop/
  theme/
    types.ts                     UmbraDesktopTheme, Palette, Metrics, Sheets
    theme.context.ts             provides id + variant + palette + metrics + sheets
    theme.context-token.ts
    theme-styles.controller.ts   adoptedStyleSheets plumbing, shared by 4 components
    resolve-variant.ts           (themeId, umbThemeAlias) -> theme + variant   [pure]
    resolve-variant.test.ts
    palette-css.ts               Palette -> custom-property declarations       [pure]
    palette-css.test.ts
    themes/
      index.ts                   the catalogue: id -> UmbraDesktopTheme
      umbraco/{index,palette}.ts        identity theme; no sheets
      macos/
        index.ts palette.ts
        desktop.css.ts taskbar.css.ts launcher.css.ts window.css.ts
```

`settings/types.ts` gains `theme?: string`; `settings-store.ts` gains an `isThemeId` guard beside
`isWallpaperRef` and `isPinnedList`; `settings.context.ts` gains `setTheme(id)`.

---

## 10. Testing

Following the precedent set by the launcher and wallpaper work: **pure modules are unit-tested; UI
is verified in the browser with the maintainer.** Tests are written before the implementation they
cover.

| Module | Cases |
|---|---|
| `resolve-variant` | each Umbraco alias → expected variant; dark falling back to light when a theme has no dark palette; high contrast forcing the Umbraco theme (D4); an unknown stored theme id falling back to Umbraco |
| `palette-css` | tokens rendered as declarations; a partial palette inheriting the rest |
| `window-model` | `clampWindowPosition` with `leading 0 / trailing 138` reproduces every existing expectation; controls at both ends clamp correctly at both edges; a window narrower than its own controls stays wholly on screen |
| `settings-store` | a v1 payload with no `theme` defaults it; an unknown theme id is discarded without costing the user their wallpaper or pins; a payload with `theme` round-trips |

Browser checkpoints: Umbraco theme is visually unchanged after tokenisation; macOS theme applied and
switched back; backoffice light↔dark switching live-updates the desktop; a window dragged to each
edge under macOS stays grabbable; theme survives a reload; and — per §1.1 — every launcher affordance
(search, Favourites, pinning, the user modal, Desktop settings, Exit) is still reachable and working
under each theme, not merely present.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| The tokenisation pass silently changes today's look | Pixel-identical Umbraco theme is an explicit regression criterion (§6), checked before any theme work starts |
| Metrics drift from the theme's own CSS — the same hazard `UMBRADESKTOP_WINDOW_MIN_SIZE` already carries | Metrics live in the theme folder beside its CSS, not in shared constants, so the two are edited together |
| `backdrop-filter` on both dock and fullscreen launcher costs frames with many windows open | Already shipped on the taskbar without trouble; the launcher blur only exists while the panel is open |
| Umbraco's dark theme is marked *Experimental* and its tokens may shift | Only the identity theme reads `--uui-*`; every other theme is insulated by construction |
| macOS theme looks approximate on Windows and Linux because SF Pro is unavailable | Documented (§7.2). The fallback stack is deliberate, not incidental |
| Iframe content stays Umbraco-styled inside a Win98 frame later | The §1.2 boundary, stated up front rather than discovered |

---

## 12. Out of scope

- **The macOS menu bar.** A second chrome surface, a reserved top strip, changes to maximize and to
  the bounds clamp — and Umbraco has no menu model to fill File/Edit/View with, so the menus would be
  decorative, which is worse than absent.
- **A true Launchpad.** The launcher's content keeps its structure (D12).
- **Windows 98, Windows 11 and Linux themes.** The contract is designed for them; none is built.
  Each should be a folder of CSS plus a palette.
- **Third-party themes** as an extension type (D10).
- **Theming window content or core modals** (§1.2).
- **An admin-enforced site-wide default theme.** Per-user only, as with wallpaper.
- **Pairing a theme with a default wallpaper.** Tempting for macOS; a separate decision.
- **Dock magnification, window minimize-to-dock animations,** and other motion work.
