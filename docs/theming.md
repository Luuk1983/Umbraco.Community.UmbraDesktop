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
palette and no sheets at all — every chrome token carries today's value as its CSS fallback, and an
app token's fallback is carried by the app itself (§3), so setting nothing renders exactly what
shipped before theming existed. Read
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

### Two surfaces a theme does not reach

Four sheets, four elements, and that is the whole of it: the desktop, the taskbar, the launcher and
a window. Two things a user sees are deliberately outside that list and stay Umbraco-modern under
every theme, Windows 98 included. Neither is an oversight, and "a theme may restyle, never remove"
does not apply to them, because there is nothing of yours there to remove.

**The settings panel.** It is a core modal — a `sidebar` opened through Umbraco's modal system —
and it is chrome the backoffice owns rather than chrome this package draws. Themeing it would mean
reimplementing the modal, and every picker it opens on top of it would still be core's.

**The boot splash**, the cover that holds the screen while a desktop loads (see
`desktop/boot/splash.ts`). This one is causal rather than a judgement: the splash goes up during the
bundle module's own evaluation, before anything can say who is signed in, and the theme is one of
the things it is waiting for the settings context to read. A themed splash could not paint until the
moment it is no longer needed.

A Windows 98 boot screen under the Windows 98 theme is an appealing idea, and it was costed rather
than dismissed. It is possible: cache the resolved colours in a browser-level key next to the boot
hint and have the splash read that synchronously. It was **declined on purpose**, twice over.

The splash's defining property is that it depends on nothing — no token, no context, no network, no
font — so there is nothing it can be blocked on and nothing that can make it fail. Every colour in
it is a literal for that reason. Reading a cached value would trade that away for a decoration.

And the cache would never stop being a workaround. The per-user settings are headed for server-side
storage, which makes the theme knowable *later* than it is today, not sooner: a round trip instead of
a synchronous read. So the hint could not be a stepping stone to doing it properly — it would be
kept alive forever solely to colour a splash. The only version of this that would be both free and
always right is a hint rendered into the page by the server, and the page is Umbraco's Razor view,
which a package does not get to touch.

If you find yourself wanting either of these surfaces to follow your theme, the honest answer is a
different feature, not a token.

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

A palette is `Partial<Record<UmbraDesktopPaletteToken, string>>`, so **a typo is a compile error**,
and it covers two token groups rather than one. The normative source is two lists in
[`theme/types.ts`](../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/types.ts):
`UMBRADESKTOP_TOKENS`, the chrome group, and `UMBRADESKTOP_APP_TOKENS`, the app group. Read those
lists rather than a count here, which would only go stale the next time either grows. What each
prefix is for:

| Group | What it covers |
|---|---|
| `desktop-*` | Wallpaper fallback colour and gradient, the image scrim, the watermark's opacity |
| `window-*` | The frame: background, body background, border, radius, resting and active shadows |
| `titlebar-*` | Height, background, bottom border, text colour, the inactive-frame opacity, and the unsaved-changes marker's colour and size |
| `control-*` | The window buttons: width, glyph colour, hover fills, and close's own hover pair |
| `taskbar-*` | The bar itself: height, reserve, margin, radius, background (plus an opaque fallback), backdrop filter, top border, shadow, two text colours |
| `start-*`, `task-*` | The buttons inside the bar: hover and active fills, and the running-window marker |
| `launcher-*` | The panel: geometry, background, backdrop, border, radius, shadow, text — and its contents: search radius, card background/border/radius, hover fills |
| `path-*` | The path strip under a section window's caption: its height, padding, background, bottom border, text and link colours, the hover fill behind a crumb, the separator's colour and the strip's font size |
| `notice-*` | The overwrite guard: the titlebar marker and taskbar badge colours at `info`/`warning`/`error`, the marker and badge sizes, and the banner's own background, text and leading-edge width |
| `app-*` | The surface a self-contained app (a game, a calculator, shipped in another package) paints itself with: surface, raised and sunken surfaces, a two-tone bevel edge and its width, corner radius, two text colours, an accent with the text that reads on it, and the UI font |

The two groups are checked differently, which is why they are two lists rather than one. The
chrome group is checked against the CSS that actually reads it, in `tokens.test.ts` — a token
nothing reads cannot sit there as dead weight. The app group has no reader in this package at all;
its consumers live in the other packages that ship apps, so it is a published contract instead,
checked in `app-tokens.test.ts`. That test also holds the one asymmetry worth knowing before you
touch a palette: every theme other than the Umbraco identity theme must set **all** of the app
tokens, never a subset, because a chrome token's fallback lives in the component that reads it,
but an app token's fallback lives in the app itself (`UMBRADESKTOP_APP_TOKEN_FALLBACKS`, and those
values *are* the Umbraco look). The identity theme leans on exactly that: it answers neither group,
which is what makes "the Umbraco theme is unchanged" a structural guarantee. Any other theme that
answered the chrome group but not the app one would render a correct desktop around an app painted
in the identity theme's colours.

Each token is named for the CSS property it feeds, so `titlebar-border-bottom` sets a
`border-bottom` and `window-border` sets the `border` shorthand. You never have to guess which
sides a value will reach.

That rule does not settle the three `app-surface*` tokens, because `surface` is not a CSS property,
so here is the ruling: **a surface token may carry any valid `background` value, including a
gradient.** Two of the five shipped themes are gradient-based and there is no reason an app ground
should be the one place they cannot be. The consequence is on the reading side, and it is in the
contract doc comment in `types.ts` as well: an app writes
`background: var(--umbradesktop-app-surface)` and **never** `background-color:`, which accepts only
a colour and would drop a gradient value entirely, leaving the element unpainted. The `edge-*`,
`text*` and `accent*` tokens are plain colours, since each feeds a property that takes one.

There is a second ruling on the app group's lengths, and it is the one most likely to look like
pedantry in review. **Write `0px`, never `0`.** A bare zero is a valid `<length>` on its own and is
**invalid inside `calc()`, `min()` or `max()`**, where the invalid value takes the entire
declaration with it and nothing is logged. You are allowed the short spelling in the chrome group —
Win11's `launcher-card-radius` is `0` — because both ends of that contract are in this repository,
so a component that later wraps one in `calc()` is one diff away from being fixed. An app token's
reader is in a package you cannot inspect: four palettes shipped `edge-width: 0` and
`radius: 0`, the first game built against the contract wrote
`max(1px, var(--umbradesktop-app-edge-width))` to floor a grid ruling, and it silently lost its
whole `border` shorthand, `border-style` included, under both of the themes that publish zero.
`app-tokens.test.ts` now fails on any unitless app token value in any palette, so this is enforced
rather than remembered.

Two more things about the app group, both because its readers are in other packages and cannot fix
what you get wrong. `accent-text` exists so you can name the text colour that reads on *your*
accent: white is 16:1 on Win98's navy and 2.52:1 on Umbraco 4's selection blue, so there is no value
an app could have guessed. And the contrast of the pairs an app is entitled to rely on —
`text` on all three surfaces, `text-muted` on `surface`, `accent-text` on `accent` — is asserted at
WCAG AA's 4.5:1 in `app-tokens.test.ts`, per theme and per variant. If your palette lands under it
the test names the pair and the ratio it measured. Fix the colour rather than the threshold: the
whole point is that an app author reads these values on trust.

`--umbradesktop-app-border` is held to WCAG 1.4.11's 3:1 instead, and against **all three** of your
surfaces rather than one, in the same test. It is the colour an app rules a grid or outlines a field
with, so a value that is legible on your panel and invisible in your well is no more usable than no
value at all — which is what shipped: Win11's board was ruled at 1.15:1 and the theme was reported
as unreadable in both variants. Pick it from whatever your source material uses for a boundary that
has to be found rather than felt, and expect it to be a *lighter* line than its surroundings in a
dark palette and a darker one in a light palette. That is the one value in the group that inverts,
and it is why this is not simply a stronger `edge-dark`: doing that in a dark palette would leave a
bevel's shadowed half brighter than its lit half.

If you want to see what your thirteen values are actually being asked to do, read
[`desktop-apps.md`](desktop-apps.md) §4: it is the other side of this contract, written for the
person in another package who consumes them, and it is also where the promise you are making about
`edge-width` and `radius` is spelled out. An app author writes one stylesheet expecting it to be a
bevelled square control under Win98 and a flat rounded one under macOS, with no branch anywhere in
the app, so a palette that sets both to values from the same visual idiom quietly costs them that.

`titlebar-dirty-color` is worth calling out as well: it is the dot marking a window whose content
has unsaved changes, and it defaults to `titlebar-text`, so every theme gets a mark that contrasts
with its own caption without setting anything. Override it only for a colour you can still see — and never to
nothing. A theme may restyle chrome, never remove it, and a marker that has been hidden, sized to
zero or painted in the caption's own colour has been removed as far as the person losing their work
is concerned. `theme/unsaved-marker.test.ts` holds that for all five themes.

The `notice-*` group carries the overwrite guard: a window that changed on the server, or is now in
the recycle bin, or has been deleted for good, while you had unsaved changes.

**Severity is carried by an icon, not by a colour.** `info` is the unsaved-changes dot above, on
`.dirty`, and nothing about it has changed. `warning` and `error` fill that same slot with an
Umbraco icon instead — `icon-alert` and `icon-wrong` — on a different element, `.notice-marker`,
carrying `.notice-warning` or `.notice-error`. Both glyphs are stroked in `currentColor`, so
`notice-warning-color` and `notice-error-color` reach them as an ordinary `color` and colour the
taskbar badge and the banner's own icon with the same two values. `notice-info-color` still chains
to `titlebar-dirty-color`, so a theme that has never heard of notices keeps painting exactly what it
painted before; `notice-marker-size` sizes the severity icon and defaults to `1.15em` of the
caption's own type, so it tracks a theme that resets the caption's font size.

The banner is a light tint of the severity colour with a bar of it on the leading edge, not a wash:
`notice-background` defaults to that tint, `notice-text` to the ordinary text colour, and
`notice-border-width` is the width of the bar. Set `notice-background` and the tint goes away, which
is what four of the five themes do — a translucent sheet on macOS, a ruled strip on Umbraco 4. Its
buttons are real `uui-button`s, so a theme restyles them through UUI's `--uui-button-*` properties
rather than by selecting into them: the sheet is adopted one shadow boundary above the button's own.
Windows 98's `window.css.ts` is the worked example of both halves.

**Your `window` sheet is adopted into the banner strip too.** It has its own shadow root nested
inside the window's, and it adopts the same sheet, because that is where the `.notice` rules live.
So every selector you wrote for the frame also runs against the banner's markup. The banner's own
classes are all namespaced — `.notice`, `.notice-title`, `.notice-body`, `.notice-actions` — so they
cannot be hit by accident, and `components/window-notices.test.ts` holds that. Your own selectors
are not: a bare `strong`, `umb-icon` or `[class]` rule meant for a caption will land in the banner
as well, and nothing will fail. `.title { position: absolute; inset: 0 }`, which is how macOS
centres a window title, is what taught this — it tore the banner's heading out of its column and
laid it across the middle of the strip on the one theme that did it.

`notice-badge-size` sizes the taskbar badge on its own, separately from the marker, and it defaults
to `1em` — the task label's own text size, because that is where the badge sits. See §5's trap about
the two themes for which that is not true.

All three severities reach the taskbar, and shape is what says which: `info` is a dot, the other two
are the glyph. The dot shares the badge's `.notice-badge` class, so whatever your theme does to
position the badge positions the dot too; it adds `.notice-badge-dot`, and the dot itself is a
pseudo-element centred in that box rather than the box's own background. That is what lets a theme
that fills `.notice-badge` with the severity colour carry the dot without writing a second rule —
the fill is switched off at `.notice-badge.notice-badge-dot`, two classes deep, so it survives your
one-class rule. Style it yourself with the same two classes if you want it different. Its colour is
`notice-info-color` and its diameter is `titlebar-dirty-size`: the caption's own dot token, shared
on purpose, so a theme that resizes one dot cannot end up with two sizes of dot on one window.

**If your theme hides its task labels, set `notice-info-color`.** The dot then rides the tile's
corner on top of the app icon — and a task button draws that icon in `taskbar-text`, which is the
last fallback in the dot's own colour chain, so leaving the token unset paints the dot in exactly
the colour of the thing it is sitting on. macOS and Windows 11 both set it to their accent, and each
splits that accent light/dark the way its other markers do. A ring of the bar's own ground was tried
first and reads as a bullseye at 8px, so hue is what does the separating. `theme/notice.test.ts`
fails you if you paint the token in the caption background, the opaque bar ground, or the bar's text
colour, which are the three things the dot has to be seen against.

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
  chromeWidth: 0,              // what your chrome costs an app, horizontally...
  chromeHeight: 31,            // ...and vertically
  pathbarHeight: 28,           // your path strip's height, for the windows that draw one
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

### `chromeWidth` and `chromeHeight`: what your chrome costs an app

These two are not for the drag clamp. A registered app (see
[`desktop-apps.md`](desktop-apps.md)) declares the size of **its own box** and the host adds your
chrome around it, because an app ships in someone else's package and cannot read your titlebar's
height. These are that cost: what a window's declared size loses on the way to the app's box.

They are **not** `titlebarHeight` under another name, and confusing the two is the mistake this
pair exists because of. `titlebarHeight` is measured from the window's *outer* top edge, because a
`rect.y` places the border box and that is the coordinate system the clamp works in.
`chromeHeight` is measured against the box `.frame`'s `width`/`height` actually size, and that is
where `box-sizing` decides everything:

- Leave `.frame` content-box, as four of the five themes do, and its border ring is painted
  *outside* the window's rect: it costs an app nothing, so `chromeWidth` is `0` and `chromeHeight`
  is just your caption band.
- Opt `.frame` into `border-box` and pad it, as Win98 does for its bevel, and that padding comes
  out of the rect on all four sides — a ring below the body as well as above it. Win98 also pads
  `.bodywrap` for its sunken well, which comes out of the same rect, so its numbers are `10` and
  `32` where every other theme's width cost is zero.

Get it wrong and every registered app opens that many pixels too small or too large under your
theme, which shows up as an app's last row of content sitting on your frame's bevel. So measure
this one exactly as you measure the rest — `measureChromeCost` in `themes/mount-themed.ts`
subtracts the app's rendered box from the window's rect for you, and every shipped theme's
`metrics.test.ts` holds its published pair against it.

### `pathbarHeight`: the strip that only some windows carry

A window that hosts a whole section draws a path under its caption — `Media library / Campaigns /
hero.jpg` — because the desktop strips the backoffice header, and the header is where you would
otherwise click the section name to climb back out of a tree.

It is its own metric rather than part of `chromeHeight` because it is not charged to every window.
Only a `full-section` window draws one; a single-workspace window has no ancestors to show, and a
window hosting a self-contained app has no frame at all. Fold it into `chromeHeight` and every game
in the launcher opens that many pixels shorter than it asked for.

So state it here, and state the same number as `--umbradesktop-path-height` in your palette, from
one constant that both read — the strip is drawn at the token's height and paid for at the metric's,
and the two disagreeing is exactly the kind of sum §4 opens by warning about. Windows 98 keeps its
at 22 to match its 11px caption type; the rest sit at or near the shared default of 28.

Your `window` sheet is adopted into the strip as well as the banner, with the same consequence: its
own classes are all namespaced (`.path-bar`, `.path-crumb`, `.path-current`, `.path-separator`, held
by `components/window-path.test.ts`), but a bare `button` or `nav` rule you wrote for the frame will
land in it too.

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

**A backtick in a CSS comment ends the stylesheet.** Every sheet here is a `css` tagged template, so
a comment written in prose that quotes a property name the way this document does terminates the
template literal, and what you get is a parse error further down the file pointing at a word inside
your comment. It cost a build cycle to recognise. Write property and token names plain inside
`/* ... */` — the shipped sheets all do, and that is not a coincidence.

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

**The overwrite guard's taskbar badge has to be drawn inside the button's own box.** `.running`
keeps `overflow: hidden` in the base stylesheet and in every shipped theme, so a badge positioned
outside `.task`'s own box is clipped and simply never appears. The active-window marker answers to
the same constraint, with `position: relative` on the button for the same reason.

**A marker after the label is invisible in two of the five themes.** The macOS and Windows 11 themes
both set `.task-label { display: none }` and draw icon-only tiles, so anything appended to the label
has nowhere to sit. The base draws the badge inline all the same, after the label and at the label's
own text size, because at label height beside the name it reads as part of the button rather than as
decoration on it — and each of those two themes restyles that **same element** into an overlay on
the tile's corner, which is its own notification idiom. If you write a theme that hides the label,
you have to do the same, and `theme/notice.test.ts` will fail you if you do not: it derives the rule
from your own stylesheet rather than from a list of theme names.

Both of them draw it as a filled disc in the severity colour with the glyph punched out in the
taskbar's own ground, which is what a badge is on either platform, and there are two traps in that.
An `umb-icon` paints its glyph edge to edge of a square box, so a `border-radius` alone rounds the
plate *under* corners the glyph still occupies and leaves a triangle poking out of its own disc:
give it padding, enough that the disc's radius clears the glyph box's half-diagonal. And restate the
ink in your `[data-severity='error']` rule as well as the fill, because the base's severity rule
carries an attribute selector and a bare `.notice-badge` of yours loses to it — leaving the error
glyph painted in the same danger colour as the disc under it.

**Do not select an icon in the chrome as `umb-icon`.** A window's caption and a task button each
hold two of them now — the app's own icon and the severity marker or badge — and they answer to
opposite geometry. The app icon is `.app-icon` in the caption and `.task-icon` in the taskbar; the
guard's is `.notice-marker` and `.notice-badge`. This is not tidiness: the macOS theme hides the app
icon in the caption entirely, and while both shared one selector that rule hid the marker with it.

---

## 6. Worked example: where a Windows 98 theme lands

Win98, Windows 11 and GNOME were all worked through on paper before the contract was settled. Two
of the three have since been built against it without a change to the chrome, which is the best
evidence the shape was right. Win98 came first, and these are what it needed:

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
`leadingControlsWidth` stays `0`, because the controls stay at the right end. It is also the only
shipped theme with a non-zero `chromeWidth` (§4), because that bevel is `border-box` padding on the
frame and so comes out of the window's own rect: the two facts are the same fact, and the second
one is the one a registered app feels.

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

**A theme can see identity, through the glyph name.** Umbraco 4 coloured each section
differently, and it is tempting to conclude a stylesheet cannot know which app a tile is. It can:
the base renders every tile's icon as `<umb-icon name=${app.icon}>`, and because that is an
attribute binding the name is in the DOM, so `umb-icon[name='icon-picture']` selects Media
wherever it sits. Umbraco 4's orb hues are keyed that way — see the map in its `launcher.css.ts`,
which groups the catalogue's glyphs by area the way v4 grouped sections.

Two things are worth copying from that map. Put the varying part in custom properties so each
rule states only what changes, and write the geometry once. And match names **exactly**:
`icon-document` is a prefix of `icon-documents`, so `[name^=...]` silently merges the two, and a
name that arrives with a colour suffix appended is better falling through to the default than
matching the wrong rule.

Reach for `:nth-child` only when nothing in the DOM identifies the item, which after this is a
narrower set of cases than it first appears. Check for an attribute before assuming position is
all you have.

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

Run **both** commands. They check different things: `npm test` runs in a browser through esbuild,
which does not type-check, and `npm run build` runs `tsc`, which does not render anything. A theme
has shipped a green test run and a red build, and the reverse.

- [ ] `npm run build` passes — a palette typo is a compile error, so this is a real check
- [ ] `npm test` passes, including `tokens.test.ts`, which fails if you added a `--umbradesktop-*`
      to a component without adding it to `UMBRADESKTOP_TOKENS`, or the reverse, and
      `app-tokens.test.ts`, which fails if your palette answers the chrome group but misses an app
      token — a theme can pass the first and fail the second
- [ ] Every launcher affordance still *works*: search, tiles, pinning, the user button, Desktop
      settings, Exit. A theme may restyle, never remove (design §1.1)
- [ ] Your theme's `metrics` are measured and not merely derived — a `metrics.test.ts` (§4),
      `chromeWidth` and `chromeHeight` included, since those are what every registered app's window
      is sized from
- [ ] Windows dragged hard against all four screen edges stay grabbable
- [ ] Switching to your theme with windows open pulls stranded windows back into reach
- [ ] The backoffice's light, dark and high-contrast settings all render something sane
- [ ] Your theme's swatch is distinguishable from the others in the picker

And the part that is easiest to skip, because the code already works without it:

- [ ] `README.md` lists your theme in **both** places it names them: the Features bullet and the
      Changing the theme section
- [ ] `umbraco-marketplace-umbraco.community.umbradesktop.json`'s `Description` still describes what the package offers. Its
      theme list is the one sentence users read before installing
- [ ] This file gains whatever the build taught you that is not already in it. Every trap in §5
      and §6 is here because a theme hit it first, and the next author should not have to

The wider version of that last group, for any feature rather than a theme, is in
[`CLAUDE.md`](../CLAUDE.md) at the repository root.
