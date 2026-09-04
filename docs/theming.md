# Adding a theme

> How to build a new skin for the UmbraDesktop chrome — launcher, taskbar, windows. For *why* the
> system is shaped the way it is, see [the design](design/2026-09-04-theming-system-design.md);
> this document is the practical companion to it.

A theme is a folder of CSS plus one entry in a catalogue. It never touches the four chrome
components, and it cannot change what they render — only how they look. That constraint is the
whole point: five themes that can each restructure the shell would be five shells.

---

## 1. What a theme is made of

```
theme/themes/<id>/
  index.ts          the theme object: id, name, swatch, palettes, metrics, sheets
  palette.ts        custom-property values, per variant
  metrics.ts        the numbers JavaScript needs, derived from the CSS constants
  desktop.css.ts    rules adopted into <umbradesktop-desktop>
  taskbar.css.ts    rules adopted into <umbradesktop-taskbar>
  launcher.css.ts   rules adopted into <umbradesktop-launcher>
  window.css.ts     rules adopted into <umbradesktop-window>
```

Every file except `index.ts` is optional. The **Umbraco** theme is one `index.ts` with an empty
palette and no sheets at all — every token carries today's value as its CSS fallback, so setting
nothing renders exactly what shipped before theming existed. Read
[`themes/umbraco/index.ts`](../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/umbraco/index.ts)
first; it is the shortest complete theme there can be.

Then register it, and that is the only file outside your folder you touch:

```ts
// theme/themes/index.ts
export const UMBRADESKTOP_THEMES: ReadonlyArray<UmbraDesktopTheme> = [
  UMBRADESKTOP_UMBRACO_THEME,
  UMBRADESKTOP_MACOS_THEME,
  UMBRADESKTOP_WIN98_THEME, // <- yours, in picker order
];
```

The `swatch` on your theme object is the three colours the settings picker paints as a preview —
`chrome`, `accent` and `surface`. They are named rather than a positional triple because mapping
them onto a design language that has no such words is a judgement call, and a swapped tuple would
be invisible.

---

## 2. The two channels

A theme reaches the chrome two ways, and knowing which to use for a given change saves a lot of
time.

**The palette** is a set of CSS custom properties, written onto the desktop's root element as a
`style` attribute. It inherits through every shadow boundary for free, and it is the right channel
for anything that is a *value*: a colour, a radius, a shadow, a height.

**The sheets** are real stylesheets adopted into each component's shadow root. They are the right
channel for anything that is *structure*: flex direction, `order`, `position`, hiding an element,
a pseudo-element.

Prefer the palette. A value in the palette is one line, is type-checked, and cannot break layout.
Reach for a sheet when there is no token for what you want — and when you do, consider whether the
component should grow a token instead, so the next theme gets it for free.

### Sheets are appended, so they win

Each component's own `static styles` are captured once, and the theme's sheet is appended after
them. Later sheets win at equal specificity, so you can restate a base selector and override it:

```ts
/* base: .frame:not(.active) .titlebar { opacity: 0.6 } */
.frame:not(.active) .titlebar {
  opacity: 1;
  background: #808080;
}
```

**Never write `!important` in a theme sheet.** If a rule is not winning, the selector does not
match what you think it does — go and read the component.

### Writing a sheet

Sheets are Lit `css` tagged templates, exported as the module default:

```ts
import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { WIN98_FONT } from './palette.js';
import { WIN98_TITLEBAR_HEIGHT } from './metrics.js';

export default css`
  .titlebar {
    font-family: ${unsafeCSS(WIN98_FONT)};
    height: ${WIN98_TITLEBAR_HEIGHT}px;
  }
`;
```

Two things bite here. `css` accepts only `CSSResult` or numbers in `${}` — a plain string needs
`unsafeCSS`, or it throws at import time. And a backtick anywhere inside the template, **including
in a CSS comment**, terminates it and breaks the build.

Load them lazily from `index.ts`, so a theme nobody selected costs nothing:

```ts
sheets: async () => {
  const [desktop, taskbar, launcher, window] = await Promise.all([
    import('./desktop.css.js'),
    import('./taskbar.css.js'),
    import('./launcher.css.js'),
    import('./window.css.js'),
  ]);
  return { desktop: desktop.default, taskbar: taskbar.default, launcher: launcher.default, window: window.default };
},
```

---

## 3. Palettes and variants

`palettes.light` is required; `palettes.dark` is optional and falls back to light. There is no
high-contrast palette: under Umbraco's high-contrast setting a theme is painted with its **darkest
available** palette, and the accessibility work happens inside the windows, which are separate
documents running Umbraco's own high-contrast stylesheet whatever chrome surrounds them (design
D13). A theme with no dark palette therefore looks the same under all three backoffice themes.
That is a fair trade, not a bug.

A palette is `Partial<Record<UmbraDesktopToken, string>>`, so **a typo is a compile error** and you
can only set tokens the chrome actually reads. The normative list is `UMBRADESKTOP_TOKENS` in
[`theme/types.ts`](../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/types.ts) —
53 tokens in these groups:

| Group | What it covers |
|---|---|
| `desktop-*` | Wallpaper fallback colour and gradient, the image scrim, the watermark's opacity |
| `window-*` | The frame: background, body background, border, radius, resting and active shadows |
| `titlebar-*` | Height, background, bottom border, text colour, the inactive-frame opacity |
| `control-*` | The window buttons: width, glyph colour, hover fills, and close's own hover pair |
| `taskbar-*` | The bar itself: height, reserve, margin, radius, background (plus an opaque fallback), backdrop filter, top border, shadow, two text colours |
| `start-*`, `task-*` | The buttons inside the bar: hover and active fills, and the running-window marker |
| `launcher-*` | The panel: geometry, background, backdrop, border, radius, shadow, text — and its contents: search radius, card background/border/radius, hover fills |

Each token is named for the CSS property it feeds, so `titlebar-border-bottom` sets a
`border-bottom` and `window-border` sets the `border` shorthand. You never have to guess which
sides a value will reach.

`taskbar-reserve` deserves a note: it is how much of the bottom edge is unavailable to windows, and
it defaults to the taskbar's own height. A floating dock must set it **higher** than its height,
because it also needs the gap beneath it.

---

## 4. Metrics: the numbers JavaScript needs

CSS cannot tell the window manager where a titlebar stops being draggable. `metrics` does:

```ts
metrics: {
  titlebarHeight: 32,
  leadingControlsWidth: 103,   // non-draggable chrome at the bar's left end
  trailingControlsWidth: 0,    // ...and at its right end
  grab: 80,                    // draggable titlebar that must stay on screen
  taskbarReserve: 67,
}
```

Get these wrong and windows clamp wrong at the screen edges — a window dragged into a corner
becomes unreachable. **Derive them, never type them.** `leadingControlsWidth` shipped once as a
hand-computed `124` describing CSS that rendered `102`; it is now computed in
[`themes/macos/metrics.ts`](../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/macos/metrics.ts)
from the same constants the CSS interpolates:

```ts
export const MACOS_LIGHT_SIZE = 12;
export const MACOS_CONTROL_GAP = 8;
// ...
export const MACOS_LEADING_CONTROLS_WIDTH =
  MACOS_WINDOW_BORDER + MACOS_TITLEBAR_PADDING +
  3 * MACOS_LIGHT_SIZE + 3 * MACOS_CONTROL_GAP +
  MACOS_RELOAD_MARGIN + MACOS_RELOAD_SIZE;
```

Copy that pattern. If a number appears in both a `.css.ts` file and `metrics.ts`, it belongs in
`metrics.ts` and gets interpolated into the CSS — and the same goes for `palette.ts`, which is
where the easiest term to forget lives.

### Then measure it

Deriving makes the sum consistent with itself. It cannot make it consistent with what the browser
paints, because a box you never thought to add is missing from both the sum and your reading of it.
That is not hypothetical either: after `leadingControlsWidth` was derived it still rendered `103`,
because the frame's 1px ring is painted by a **palette token** rather than by the theme's own
stylesheet, so it was not among the constants being summed. `titlebarHeight` was short by the same
ring plus the caption's hairline, and `taskbarReserve` by the dock's, whose `height` token sets a
*content* height.

So each theme with geometry of its own ships a `metrics.test.ts` that mounts the real chrome,
measures the rendered boxes and holds the published metrics against them — see
[`themes/macos/metrics.test.ts`](../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/themes/macos/metrics.test.ts)
and its Win98 and Umbraco counterparts. `themes/mount-themed.ts` does the mounting for you; a
useful habit is to measure one span across the whole band (frame edge to control edge) rather than
summing parts, so a margin nobody folded into the sum cannot hide from the test too.

Changing themes with windows already open re-clamps them, so a window parked under controls that
have just moved to the other end of the titlebar is pulled back into reach. You get that for free;
you only have to be honest in `metrics`.

---

## 5. Traps

Everything below cost real time to find. None of it is obvious from reading the components.

**The launcher's geometry belongs to `taskbar.css.ts`.** The launcher panel is rendered *inside*
`<umbradesktop-taskbar>`'s shadow root, so its position and size are set by a `.launcher` rule in
the taskbar's sheet. `launcher.css.ts` styles the panel's surface and contents only. Setting
`width` or `position` in both means fighting yourself.

**`left` + `right` + an inherited `width` silently drops `right`.** An absolutely positioned box
with all three is over-constrained, and the width wins with no warning. To stretch a panel that
already has a width from the base rule, set `width: auto` as well as `left`/`right`.

**DOM order is not visual order.** The window controls are reload, minimize, maximize, close in the
DOM, because reload was added last. macOS renders close-minimize-maximize-reload using explicit
`order` on each `.ctrl-*` class. Reordering with `order` keeps the pointer handlers and existing
selectors intact; changing the DOM would not.

**Grow hit targets with a transparent `::after`, never with the layout box.** A 12px traffic light
is the right thing to draw and a terrible thing to click. Adding padding would change
`leadingControlsWidth` and desynchronise the drag clamp; an absolutely positioned overlay grows the
target while leaving the box alone. Keep the overlay inside the reserved strip — space that is
already non-draggable — rather than eating into the bar.

**Changing `align-items` collapses siblings that relied on stretch.** Centring the launcher's
`.body` shrank the Pinned card to one tile's width, because it is a sibling of `.cards`, not a cell
inside it, so the base rule's `grid-column: 1 / -1` never applied to it. If you centre a flex
container, give every child an explicit width.

**Grid cells and plain blocks disagree about `width`.** A grid track's width includes the cell's
padding; a block's declared `width` is its content box. Giving both the same number makes the block
wider by its padding. Set `box-sizing: border-box` when two elements sized different ways have to
line up.

**Do not put Lit `CSSResult` objects into an `UmbObjectState`.** It deep-freezes what it holds, and
`CSSResult.styleSheet` memoizes onto itself on first read — which throws on a frozen object,
silently, inside an observer. That defect shipped once and made every theme recolour the chrome
without ever restyling it. The theme context builds its stylesheets before publishing them for
exactly this reason. You should not need to touch that code, but if you add a surface, do not
"tidy" it.

---

## 6. Worked example: where a Windows 98 theme lands

The contract was checked against Win98, Windows 11 and GNOME before it was settled, so these are
answers rather than guesses:

| What Win98 needs | How |
|---|---|
| `#c0c0c0` everywhere | Palette. The chrome reserves nothing for Umbraco branding (design D1) |
| Double bevels — white/grey/black, outer and inner, on four sides | Layered `inset` box-shadows in `window.css.ts`. No extra DOM |
| Navy active titlebar with white text; grey when inactive | `window.css.ts` restating `.frame:not(.active) .titlebar` and resetting the base opacity rule |
| Square everything | Palette: every `*-radius` token to `0` |
| Start menu as a narrow vertical list, not a card grid | `launcher.css.ts`: `grid-template-columns: 1fr` on `.cards` and `.grid`, `.launch { flex-direction: row }`, and a `launcher-width` token |
| Square window buttons at the right, with bevels | Palette for `control-width`; `window.css.ts` for the bevel shadows. No `order` needed — the DOM already puts them right |
| No light/dark variants | Ship `palettes.light` only. Windows still follow the backoffice's own theme |

Its `metrics` differ from the Umbraco theme's in `titlebarHeight`, `trailingControlsWidth` and
`taskbarReserve` — the bar is shorter than Umbraco's — while `grab` is unchanged and
`leadingControlsWidth` stays `0`, because the controls stay at the right end.

### 6.1 When the source is not an operating system

Umbraco 4 is the awkward case worth reading before you theme anything that is not a desktop OS,
because a web application does not have one of everything the chrome needs.

**Some surfaces have no antecedent, and you invent them.** v4 had no taskbar at all. The bar is
assembled from v4's own raised-button vocabulary instead, which keeps it period-correct without
being copied from anything. Say so in the theme's doc comment; the next reader will otherwise go
looking for the original.

**Some are adapted rather than copied.** v4 never shipped a modal with a titlebar, so the window
frame comes from its content-pane header — a title strip above content with controls beside it,
which is the same job even though it was never a window.

**And some are more literal than an OS would give you.** v4 kept its Sections panel in the
bottom-left corner, which is exactly where `--umbradesktop-launcher-left`/`-bottom` already put
the launcher. That surface needed no repositioning whatsoever.

The trap is scale. **A source design was built for the number of things it had, and the catalogue
has more.** v4's Sections panel held six items, which is why it could afford large glossy icons in
a grid; the catalogue holds twenty-five across seven groups, and the same grid becomes eight
headings and nine rows of tiles with most of it below the fold. The fix was not to shrink the
grid but to use a second idiom the source already had — v4's tree — for the long list, and keep
the grid for Favourites where the count still fits. That split is free because the base renders
Favourites as `.card.fav`, a **sibling** of `.cards` rather than a cell inside it, so the two can
be styled apart:

```ts
/* Favourites keeps the grid; the grouped catalogue becomes a scrolling well of rows. */
.card.fav .grid { grid-template-columns: repeat(4, 1fr); }
.cards { display: flex; flex-direction: column; overflow-y: auto; }
.cards .card .launch { flex-direction: row; }
```

If you rely on that seam, test it. A refactor that moved Favourites inside `.cards` would hand it
the row rules and silently delete the grid, with nothing else failing.

### 6.2 Where the launcher can live

Four themes have now answered that question four different ways, which is a reasonable sign the
geometry tokens are the right shape — and between them they cover most of what a fifth will want:

| Theme | Launcher | How |
|---|---|---|
| Umbraco | Corner panel above the bar | The defaults; sets nothing |
| Win98 | Start menu, flush to the corner | `launcher-left: 0`, and `launcher-bottom` left to default to the bar's reserve |
| Umbraco 4 | Corner panel, same anchor | Also just `launcher-left: 0` — v4 kept its Sections panel exactly there |
| macOS | Full-screen surface above the dock | A **sheet** rule in `taskbar.css.ts`, since `left`/`right`/`width`/`height` all have to move together |
| Windows 11 | Fixed-width card centred on the viewport | Palette only: `launcher-left: calc(50vw - <half the width>)` |

The Windows 11 row is the one worth copying. Centring looks like a job for a sheet, and a sheet is
where it goes wrong — set `left`, `right` and inherit a `width` and the browser silently drops
`right` (§5). Computing the offset in `palette.ts` from the width the palette itself declares
avoids the whole problem, and the two values cannot drift because one is derived from the other:

```ts
const W11_LAUNCHER_LEFT = `calc(50vw - ${W11_LAUNCHER_WIDTH / 2}px)`;
```

Reach for a sheet, as macOS does, only when the panel genuinely has to stretch rather than sit at
a computed offset.

### 6.3 Two smaller traps

**A theme sees position, not identity.** Umbraco 4 coloured each section differently, and a
stylesheet has no idea which app a tile is — so the hues rotate on `:nth-child` instead. Not the
original mapping and it cannot be, but better than one flat colour, and stable per tile between
renders. Reach for this whenever a source design varied something per item that the DOM does not
distinguish.

**`min-height` and `height` in the base are content-box.** A hairline you add on top of
`--umbradesktop-titlebar-height` or `--umbradesktop-taskbar-height` therefore paints *outside*
the number your `metrics` publishes, and the caption or the bar comes out a pixel taller than the
clamp believes. Set `box-sizing: border-box` on the surface so the token means the whole band, or
fold the border into the sum explicitly.

This is the single most common way a new theme gets its geometry wrong: it has now caught
Umbraco 4 twice — the caption and the bar — and Windows 11 once, in three consecutive themes, and
in every case the only thing that noticed was `metrics.test.ts`. Write that file first.

---

## 7. Checklist before you open a PR

- [ ] `npm run build` passes — a palette typo is a compile error, so this is a real check
- [ ] `npm test` passes, including `tokens.test.ts`, which fails if you added a `--umbradesktop-*`
      to a component without adding it to `UMBRADESKTOP_TOKENS`, or the reverse
- [ ] Every launcher affordance still *works*: search, tiles, pinning, the user button, Desktop
      settings, Exit. A theme may restyle, never remove (design §1.1)
- [ ] Your theme's `metrics` are measured and not merely derived — a `metrics.test.ts` (§4)
- [ ] Windows dragged hard against all four screen edges stay grabbable
- [ ] Switching to your theme with windows open pulls stranded windows back into reach
- [ ] The backoffice's light, dark and high-contrast settings all render something sane
- [ ] Your theme's swatch is distinguishable from the others in the picker
