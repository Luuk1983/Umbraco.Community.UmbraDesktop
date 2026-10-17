---
id: desktop-apps
title: Building a desktop app
description: Ship an app that opens in a desktop window from your own package.
sidebar_position: 4
---

# Building a desktop app

> How to ship an app that opens in an UmbraDesktop window from your own package, without touching
> this repository. For *why* the seam is shaped this way, see
> [the design](../design/2026-09-06-desktop-apps-design.md); this document is the practical companion
> to it.

A desktop app is one custom element in a window. You register it with an extension manifest, the
desktop opens it, themes it and closes it, and your package never depends on anything here beyond
the manifest type. Minesweeper was the first one and Snake the second, both in the Entertainment package; a
calculator, a colour picker or a notepad would work the same way.

The Accessories package is the fullest example: Notepad, Paint, Sticky Notes, Calculator, Character
Map, Clock, Disk Cleanup and System Information are each one of these. Its Screen Saver tile is an
app too, but one that opens Desktop settings rather than a window (`meta.opensSettings`, below).

A package can also put an icon in the taskbar's system tray, beside the clock, with a
`umbraDesktopTrayItem` manifest. That is §9, together with the small tray context packages may call
and how to raise a notification with buttons on the desktop.

---

## 1. Is your app registerable, or does it belong in the catalogue?

Two kinds of thing can sit in the launcher, and a package can register both.

| Your app is | Path | Why |
|---|---|---|
| **Self-contained**: its own element, its own state, no backoffice route behind it | Register a `umbraDesktopApp` manifest. Nothing to ask anyone | There is nothing to verify. An element in a box cannot point at the wrong URL, and the worst it can do is be a bad app |
| **A backoffice surface**: a section, a dashboard, a workspace, anything with a URL | A `umbraDesktopCatalogue` entry. See [package-catalogues.md](package-catalogues.md) | Your package ships in step with its own screens, so it is the right place for their tiles |

The two manifests split the work by what they describe. `umbraDesktopApp` has no `url`, `section`
or `chromeProfile`, because an element in a box has none of them, and a catalogue entry has no
`element`, because a deep link is a page someone else renders.

If your package registers a *section*, you already appear in the launcher with no work at all: any
section a user can reach shows up automatically in the More group with a generic icon. Registering
an app is for the case where there is no section, because there is no route.

Neither of those puts anything outside the launcher. If what you have is not something to open but
something to report on, a status or a countdown, it belongs in the system tray instead: a
`umbraDesktopTrayItem`, §9. The tray is the one part of the taskbar packages may add to. A package
can register all three.

---

## 2. The manifest

```ts
{
  type: 'umbraDesktopApp',
  alias: 'My.Games.Minesweeper',
  name: 'Minesweeper',                              // developer-facing, shown if meta.label is unset
  element: () => import('./minesweeper.element.js'),
  weight: 100,                                      // higher sorts first (Umbraco's convention)
  meta: {
    label: '#myGames_minesweeper',                  // window title: a localisation token or a literal
    icon: 'icon-bomb',                              // native icon-* only; falls back to icon-box
    group: 'games',
    defaultSize: { w: 360, h: 460 },                  // your app's box. The desktop adds the window
    minSize: { w: 320, h: 400 },                      // your app's box, again
    allowMultiple: true,
    resizable: false,                                 // fixed size: no resizing, no maximize
  },
  conditions: [],
}
```

| Field | Required | Notes |
|---|---|---|
| `type` | yes | Always `'umbraDesktopApp'` |
| `alias` | yes | Unique. If it matches one of the desktop's own catalogue entries, your app replaces that entry and the console says so. It is also what pins a favourite, so it has to be stable across releases, since renaming it loses the pin for every user who made one. Namespace it with your package id and both problems go away |
| `element` | in practice | The app itself. Four forms, all supported, and it is the **only** field the desktop resolves: see §3. Required differently from the rest of this column, see below |
| `name` | yes | Developer-facing, and required by `ManifestBase` rather than by anything here: omit it and `tsc` fails with `TS2741`, and Umbraco's own package schema rejects it too. The desktop reads it only as the window title, if `meta.label` is missing at runtime |
| `weight` | no | **Higher sorts first.** See §8 |
| `meta.label` | yes | The window title, taskbar label and launcher tile text. Required by the type; if it is absent anyway, `name` and then `alias` stand in, so an app never shows up nameless |
| `meta.icon` | no | Falls back to `icon-box` |
| `meta.group` | no | A launcher group alias. Unknown or unset lands you in the reserved More group. See §6 |
| `meta.defaultSize` | no | **Your app's own box** in px, not the window around it. The desktop adds its titlebar, its frame and whatever else the active theme's chrome costs. See §2.1 |
| `meta.minSize` | no | The smallest box your app can work in, again yours rather than the window's. Falls back to the desktop's global minimum, and is **floored** at what the chrome itself needs. See §2.1 |
| `meta.allowMultiple` | no | Whether two windows of your app may be open at once. Defaults to allowed, and leaving it there is almost always right: every other app on this desktop opens as many windows as the user asks for, so `false` makes yours the one tile that quietly refocuses instead. Set it only if a second instance genuinely cannot work — module-level state, an exclusive resource, or a window that could only repeat the first, as a second umbraCoffee window would play the same stream twice — and note that two instances of an app whose state lives in its own element share nothing at all |
| `meta.resizable` | no | Whether the user may resize or maximize your window. Defaults to allowed. `false` keeps the window at `defaultSize` for its whole life, the way Minesweeper's was on every Windows up to XP: no resize handles, no snapping to a screen edge, a titlebar double-click does nothing, and there is no maximize button, which is left out rather than greyed, as Windows does. The window still moves, minimizes and closes. The window manager enforces it, not the titlebar, so every route to a new size is covered. Worth setting only when your content does not reflow and a bigger window would just be empty margin; Minesweeper and Snake set it, while Solitaire stays resizable |
| `meta.opensSettings` | no | A package name. Choosing the tile opens Desktop settings at that package's row instead of a window, and `element` is then not needed. For a tool whose settings live in Desktop settings. See [Package settings](package-settings.md#5-opening-your-settings) |
| `conditions` | no | Umbraco's own conditions, and they are honoured: the desktop observes these manifests through `UmbExtensionsManifestInitializer`, so an app whose conditions are unmet never reaches the launcher, and does so **silently**: nothing is logged, because a condition doing its job is not a fault (§8). **No conditions means always available**, which is usually right: reaching the desktop at all already requires the Desktop section |

**`element` is required in a different sense from everything else marked required here**, and the
distinction is worth a sentence because it decides when you find out. `type`, `alias`, `name` and
`meta.label` are required *by the type*: leave one out of a TypeScript manifest and the build fails
before you ever load the backoffice. `element` is not. Umbraco's `ManifestElement` declares it
optional, so a manifest without it compiles clean, registers happily, and is then dropped by the
desktop at runtime with one console line, because a tile whose window opens empty is worse than no
tile at all. Both outcomes mean your app does not ship. Only one of them is caught before you build.

`meta.label` is passed through Umbraco's localisation, so ship your own localisation manifests and
your app's name translates without anyone touching this repository.

There is no permission gate of the desktop's own. Curated catalogue entries are gated on the section
behind them because a window onto a section the user cannot reach would only show them an error, and
your app has no such backing surface to be permitted to. Use `conditions` if you need one.

### 2.1 Sizes are your app's box, not the window

`defaultSize` and `minSize` describe **the box your element gets**. The desktop puts a window around
it and adds whatever that costs, so you never subtract a titlebar and you must not try:

```
your app declares   360 x 460 of content
Umbraco theme       opens a 360 x 501 window   (a 40px caption and its hairline)
Windows 98          opens a 370 x 492 window   (a 3px frame ring all round, and a 2px sunken well)
```

Those two numbers differ on **both** axes and in different directions, which is the whole reason
this is the host's arithmetic and not yours. There are five themes, they publish their own geometry,
a sixth one may ship after your app does, and none of it is readable from your package. Measure your
own content, declare that, and stop.

This is a change of meaning to two fields that once described the window, and it was made because
the first app to use them could not do the sum: it guessed a 44px allowance for "the tallest
titlebar of the five" and eight pixels of slack for the bevels, and came out 32px short under
Windows 98, where its bottom row of cells landed on the frame's bevel. If you are reading an older
example that subtracts a titlebar, delete the subtraction.

Two consequences worth knowing:

- **`minSize` is a floor, not a veto.** The window's real minimum is your content minimum plus the
  chrome, or what the chrome itself needs — both control strips plus a graspable strip of caption —
  whichever is larger. An app asking for 282px used to get a titlebar too narrow for its own close
  button. So a very small `minSize` is safe to declare and will simply stop mattering.
- **Your app can be given a box larger than it asked for**, because the user can maximize the
  window and `defaultSize` is a starting size rather than a fixed one — unless you set
  `meta.resizable: false`, which is the direct answer for content that cannot use the room. Even
  then, keep a plan for a slightly larger box: the window is floored at what the theme's chrome
  needs, which can be wider than a small app. Decide what a fixed-size app does with the extra
  room. Minesweeper centres its board with `margin: auto` on a single wrapper,
  which is a two-line answer; auto margins never resolve negative, so it also cannot centre the
  board into a clip if the box is ever the tighter of the two.

---

## 3. Every form of `element` works, and only `element`

`element` is Umbraco's own `ElementLoaderProperty`, and the desktop resolves it with Umbraco's own
`loadManifestElement`, so all four forms behave exactly as they do for any other Umbraco extension:

```ts
element: () => import('./minesweeper.element.js')   // a loader (arrow or async function)
element: '/App_Plugins/My.Games/minesweeper.js'     // a module path string
element: await import('./minesweeper.element.js')   // a module's exports
element: MinesweeperElement                         // the class itself
```

For the loader and the string, the module must export the constructor as `element` or as `default`.

**The string form deserves its own example, because it is the only form a static
`umbraco-package.json` can express**, and a static manifest file is how most packages register
things:

```json
{
  "$schema": "../../umbraco-package-schema.json",
  "name": "My.Games",
  "extensions": [
    {
      "type": "umbraDesktopApp",
      "alias": "My.Games.Minesweeper",
      "name": "Minesweeper",
      "element": "/App_Plugins/My.Games/minesweeper.js",
      "weight": 100,
      "meta": {
        "label": "#myGames_minesweeper",
        "icon": "icon-bomb",
        "group": "games",
        "defaultSize": { "w": 360, "h": 460 },
        "minSize": { "w": 320, "h": 400 },
        "allowMultiple": true
      }
    }
  ]
}
```

and the module it points at:

```ts
/** Minesweeper. Registers itself, then publishes its constructor. */
export class MinesweeperElement extends HTMLElement {
  connectedCallback() {
    /* build the board */
  }
}

customElements.define('my-games-minesweeper', MinesweeperElement);

export const element = MinesweeperElement;
```

### `js` and `elementName` are not read

This is the one place where the field you already know from every other Umbraco extension is the
wrong one, and nothing catches it for you.

**`element` is the only field the desktop resolves.** Its two neighbours are inherited from
Umbraco's `ManifestElement`, both are optional there, and both type-check here:

- **`js`** takes the same four forms as `element` and is how a great many packages point at an
  element today, because Umbraco's own `createExtensionElement` resolves
  `manifest.element ?? manifest.js`. So `js` works everywhere else and is ignored here. A manifest
  with a `js` and no `element` compiles, registers, and is dropped, and the console line names `js`
  and tells you to rename it. Rename it: `element` takes exactly the value you already wrote.
- **`elementName`** (`'my-games-minesweeper'`) is not a second route either. Registering the tag
  name is still required of you, see below, but the desktop constructs the class it resolved from
  `element` rather than creating your tag, so a manifest that gives the tag name and nothing else
  has nothing for the desktop to resolve.

`kind` and `overwrites` arrive from the same base types, and unlike `js` they are not the desktop's
to ignore: both are Umbraco's, applied by its registry and its initializer before the app list ever
reaches here, so they behave for a `umbraDesktopApp` as they do for any other extension type. No
`umbraDesktopApp` kind ships, so `kind` has nothing to match against.

Whether the desktop *should* resolve `js` as well is an open question rather than a settled no. It
would mean adopting a slice of Umbraco's element-loading surface into this contract, and the same
argument then arrives for `elementName`. Today it does not, so write `element`.

**Register your custom element.** That `customElements.define` is not decoration, and Lit's
`@customElement('my-games-minesweeper')` decorator counts as doing it. The host constructs the class
it is handed, and constructing an unregistered custom element throws
`TypeError: Failed to construct 'HTMLElement': Illegal constructor`, which lands your app on the
"This app could not be loaded." message. A Lit element with no decorator and no `define` call is the
easiest way to hit this.

### When a load fails

Anything that stops the host getting an element out of your manifest puts that same message in the
window and one line in the console, prefixed `[UmbraDesktop]` and naming your alias. It covers a
loader that throws, a module with neither `element` nor `default`, a path the server does not serve,
a class that constructs something that is not an element, and a loader that never settles at all
(12 seconds, the same patience the iframe windows get). If your app does not appear or its window
shows that message, the console line says which of those it was.

---

## 4. Painting your app: the app tokens

The desktop publishes thirteen custom properties for apps to read. They are inherited, so your element
already sees them wherever it renders, including inside your own shadow root: there is nothing to
wire up and no context to consume.

Read them with a fallback, always. There are no host-side fallbacks for these and there cannot be,
so the fallback in your CSS is what makes your app correct when no theme has set them. The values
below are the contract, they are the Umbraco look, and an app that reads only these renders as the
default theme by construction. They live as type-checked data in
[`theme/types.ts`](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/types.ts)
as `UMBRADESKTOP_APP_TOKEN_FALLBACKS`, so this table cannot quietly go stale against them.

| Token | What it is | Fallback to write |
|---|---|---|
| `--umbradesktop-app-surface` | Your app's panel ground, distinct from the window body behind it | `var(--uui-color-surface)` |
| `--umbradesktop-app-surface-raised` | A control face: a Minesweeper cell, a calculator key | `var(--uui-color-surface-emphasis)` |
| `--umbradesktop-app-surface-sunken` | A recessed field: the minefield well, a numeric display | `var(--uui-color-background)` |
| `--umbradesktop-app-edge-light` | The light edge of a bevel, or a top border | `transparent` |
| `--umbradesktop-app-edge-dark` | The dark edge | `var(--uui-color-border)` |
| `--umbradesktop-app-border` | A boundary line that stays visible on all three surfaces: a field's outline, a grid's ruling, a row separator | `var(--uui-color-text-alt)` |
| `--umbradesktop-app-edge-width` | Bevel thickness. Wide enough to chisel an edge on a theme whose controls are bevelled, down to zero on one whose controls are flat | `1px` |
| `--umbradesktop-app-radius` | Corner rounding. Zero on a theme whose controls are square-cornered, non-zero on one whose controls are rounded | `3px` |
| `--umbradesktop-app-text` | Primary text | `var(--uui-color-text)` |
| `--umbradesktop-app-text-muted` | Secondary text | `var(--uui-color-text-alt)` |
| `--umbradesktop-app-accent` | Selection and focus | `var(--uui-color-selected)` |
| `--umbradesktop-app-accent-text` | Text and icons **on** an `accent` fill | `var(--uui-color-surface)` |
| `--umbradesktop-app-font` | The theme's UI font stack | `inherit` |

The **Fallback** column is that type-checked data, one value per row. The **What it is** column
names no theme's shipped value on purpose, and `theme/types.ts` refuses to state one for the same
reason: it used to say `radius` was `6px` "on macOS and Win11" while Win11 shipped `4px`, and a
number written down in the wrong file is worse than no number, because it reads as authoritative.
The live values are each theme's own `palette.ts` and nowhere else. Read them there if you need
them, but you should not need them: an app written against the shape below is correct under all
five without knowing any of the numbers.

`edge-width` and `radius` are the pair that does the real work, and understanding them is most of
what makes an app look native under five themes without knowing any of them. One stylesheet, written
once:

```css
.cell {
  background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface));
  border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
  border-radius: var(--umbradesktop-app-radius, 3px);
  color: var(--umbradesktop-app-text, var(--uui-color-text));
  font-family: var(--umbradesktop-app-font, inherit);
}
```

is a bevelled square control under a theme whose controls are bevelled (a non-zero width, no
rounding) and a flat rounded one under a theme whose controls are rounded (zero width, a rounding),
with no branch anywhere in your app. The five shipped themes sit at both ends of that and some in
between, which is the whole point: the same two `var()`s draw whichever of them is active.

### That example is a standalone control. A tiled grid needs one more thing

The rule above is correct for a control with space around it, and **not** sufficient for controls
tiled edge to edge. Two of the five themes publish `edge-width` as zero, correctly, because their
controls are flat, and under both of them a grid drawn with the rule above has no boundary between
neighbours at all: Minesweeper's closed board rendered as one undivided rectangle under macOS and
Windows 11 both. The fill step between `surface-raised` and `surface` is roughly 1.1:1 everywhere,
so it is a nit for one control and unreadable for eighty-one.

Do not try to floor it with `max(1px, var(--umbradesktop-app-edge-width))`. That is the first thing
to reach for and it does not work: a unitless zero is a valid length on its own and invalid inside a
math function, and while the host now publishes `0px` rather than `0` for exactly this reason, the
arithmetic still buys you a hairline the theme said it did not want.

Let the grid's own background show through a one-pixel `gap`, in `--umbradesktop-app-border`. No
arithmetic, no per-theme branch, and the cells keep reading `edge-width` for whatever edge the theme
does want on top of it:

```css
.grid {
  display: grid;
  gap: 1px;
  background: var(--umbradesktop-app-border, var(--uui-color-text-alt));
}
```

**`border` and not `edge-dark`, and that is the second half of this trap rather than a detail.** The
gap technique shipped ruled in `edge-dark` and was reported straight back: a theme is entitled to
make its bevel as subtle as its own controls are, and Windows 11's is 8% black, which came out at
1.15:1 against a cell in light mode and 1.33:1 in dark. The board was still one undivided sheet, now
with an invisible grid drawn on it. `border` is the only colour in the group with a *guaranteed*
contrast — 3:1 against all three of that theme's surfaces, which is what WCAG 1.4.11 asks of a
control's boundary — so it is what a ruling, a field's outline and a row separator want. Use
`edge-dark` for a bevel's shadowed half, which is all it promises to be.

Windows 98 is the one theme to change, because there the cells are 2px bevels butted directly
together — that is both what the original did and its own ruling, so a drawn line between them is
one that operating system never drew. Paint the gap in the face colour rather than removing it:

```css
:host([data-umbradesktop-theme='win98']) .grid {
  background: var(--umbradesktop-app-surface, var(--uui-color-surface));
}
```

`gap: 0` is the obvious way to write that branch and it is a bug, which is worth a paragraph because
nothing catches it except measuring. A `gap` is a term in the content size your manifest declares
(§3), that size is one number for all five themes, and a branch that removes the gap therefore makes
your app smaller than the window the host opened for it under exactly one theme. Minesweeper's board
came out eight pixels short in each direction under Windows 98 and left a dead band inside the tight
frame, which is what got reported. Anything a theme branch changes must leave the geometry alone.

Which is §5's pattern used as intended: the unbranched rule is the correct case, and the branch is a
refinement on top.

### And if the fill itself carries meaning, derive it. Do not read it off two surfaces

The ruling above makes a tiled grid legible as a grid. It does **not** make one tile legible as a
*different state* from the tile beside it, and if your app has a state — open against closed,
selected against not, on against off — that is a separate problem with a separate answer.

The obvious answer is `surface-raised` for one state and `surface-sunken` for the other, and it is
wrong twice over. Minesweeper shipped it and both faults were reported:

- **The step can be nothing.** Nothing in this contract says two surfaces are far apart, and the
  list below is the whole list. Umbraco's own surface family spans 1.07:1 at its widest, so under
  the Umbraco theme a closed cell and an opened one came out 1.03:1 apart, which is one colour with
  two names. Umbraco 4 did the same at 1.04:1. The board was unplayable under both.
- **The step can be the wrong way round.** `surface-raised` is *a control face*, and a macOS or
  Windows 11 control face is white, which is correct for a button and backwards for a tile nobody
  has lifted yet. Both themes drew a white closed cell on a grey field — the exact inverse of what
  Windows 98, which is the original, draws.

Derive the state colour from the one token whose contrast **and direction** are fixed. `border`
clears 3:1 against all three surfaces, which by construction makes it darker than a light theme's
ground and lighter than a dark theme's, so mixing a fixed proportion of it into a surface always
moves in the direction that reads as *material* and always moves far enough to see:

```css
.cell {
  /* the plain answer, and what an engine without color-mix keeps */
  background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
}

@supports (background-color: color-mix(in srgb, red 50%, white)) {
  .cell {
    background: color-mix(
      in srgb,
      var(--umbradesktop-app-border, var(--uui-color-text-alt)) 25%,
      var(--umbradesktop-app-surface-sunken, var(--uui-color-background))
    );
  }
}

.cell[data-state='open'] {
  /* the well's ground, undisturbed: an opened cell is a hole, not another tile */
  background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
}
```

Three things about that block are load-bearing rather than style:

**`in srgb`, not `in oklab`.** Perceptual interpolation is the better instinct and the worse answer
here: mixing toward a light colour in `oklab` barely moves a near-black ground, and the dark themes
are where the step is already tightest. Measured in Chrome across the five themes, `srgb` at 25%
gives 1.28:1 to 1.84:1 and `oklab` at 25% gives 1.09:1 on macOS dark.

**A separate `@supports` block, not `var(--token, color-mix(...))`.** The shorthand is tempting and
does the opposite of what it looks like: a function the engine does not know, sitting inside a
`var()` fallback, takes the whole declaration down on exactly the engines the fallback was written
for.

**The two states must differ in specificity, not in source order.** `.cell[data-state='open']` is
(0,2,0) and beats the `.cell` inside `@supports`, so an engine with `color-mix` and one without both
paint an opened cell with the same token and the two states cannot collapse into each other on
either.

Pick your own proportion, and pick it by measuring rather than by eye. 25% is Minesweeper's, chosen
as the smallest round figure that clears, on every shipped theme, the step macOS and Windows 11 were
already shipping unremarked — and it lands within one 8-bit step of `#c0c0c0` under Windows 98,
which is the face colour that theme would have hardcoded.

Three guarantees you may rely on, all machine-checked per theme and per variant in the desktop's own
`app-tokens.test.ts`. Every theme that paints its own palette answers **all thirteen** tokens, never
a subset, so you never get half a theme's colours and half the Umbraco ones. The contrast of the
pairs you would actually use, `text` on all three surfaces, `text-muted` on `surface`, and
`accent-text` on `accent`, meets WCAG AA's 4.5:1 — that is why `accent-text` exists at all: white is
16:1 on Windows 98's navy and 2.52:1 on Umbraco 4's selection blue, so there is no value your app
could have guessed. And `border` clears 3:1 against `surface`, `surface-raised` and
`surface-sunken`, so a line drawn with it is visible wherever you draw it.

Three, and no more. In particular there is **no guarantee about the distance between two surfaces,
nor about which of them is the lighter one**, and both are things an app naturally assumes it has
been told. It has not been: the three surfaces are three *roles*, and a theme is entitled to answer
all three with colours a hair apart, in whatever order its own design puts them. That is the
subsection above, and it is the one thing in this group that has caused a bug in shipped code.

Do not expect anything semantic to your own domain. There is no mine colour and no flag red: your
app owns its domain palette, the theme owns the surface it sits on.

---

## 5. Branching on the theme, if you want to

Tokens say what colour to be. They do not say *you are Windows 98 now, draw two-pixel bevels rather
than a border radius*, for the cases where the difference is structural rather than a value. So the
desktop stamps the active theme's id on your element as `data-umbradesktop-theme`, and you select on
it:

```css
:host([data-umbradesktop-theme='win98']) .cell {
  border: none;
  box-shadow:
    inset -1px -1px #000,
    inset 1px 1px #fff,
    inset -2px -2px #808080,
    inset 2px 2px #dfdfdf;
}
```

`:host` matches **your own element**, which is the node the attribute is on. That is the whole
selector, and it is the only ancestor-free form there is: `:host-context([data-...])`, the selector
that would let you read it from a parent, is deliberately not offered because Firefox has never
shipped it. Do not reach for it.

This is opt-in by construction. An app that never writes that selector never needs to know the
attribute exists, and §4 alone is enough to be correct everywhere.

### Not your app's own element?

The desktop stamps the attribute on app elements only. An element that a package lets apps place
inside their own windows, such as the Arcade's result card and leaderboard panel, is not an app, so
nothing stamps it. It can read the active theme's id from the `theme` observable on the desktop's
settings context (§7.2) and stamp itself, after which the same `:host([data-umbradesktop-theme=...])`
rules work. The Arcade's
[`theme.controller.ts`](../../src/Umbraco.Community.UmbraDesktop.Services.Arcade/backoffice/src/pieces/theme.controller.ts)
is the worked example: a small controller that does exactly that, and stamps nothing outside the
desktop, which leaves the unbranched rules.

### The theme ids are a published API

```
umbraco   umbraco4   macos   win11   win98
```

These are stable, and you may hardcode them in a stylesheet. They are currently discoverable only by
reading `theme/themes/*/index.ts` in this repository, which is why they are written down here.

**Adding a theme adds an id your app will not know about**, and that is a normal event rather than a
break. An app that reads tokens is correct under a theme that did not exist when it was written; an
app that branches is merely prettier under the themes it bothered with. So write your unbranched
rules as the correct case and your `[data-umbradesktop-theme='...']` blocks as refinements on top,
never the other way round. A sixth theme must not be able to break your app.

---

## 6. Groups

`meta.group` is a launcher group alias: one of the desktop's own, or one a package defines in its
catalogue. The Arcade add-on does exactly that for Games, and every game package depends on the
Arcade, so a game and its heading always ship together and the desktop knows nothing about either. An app naming a group nobody defines lands in
the reserved More group, which is honest rather than a failure. [package-catalogues.md](package-catalogues.md)
§4 lists the desktop's groups and their weights, for placing one of your own among them.

The Accessories add-on does the same for its Accessories group, at 55: after System and just before
Games, which is where Windows put Start > Programs > Accessories. A tool of your own may name
`accessories` too, and lands under More wherever that package is not installed.

Most of the launcher then works on your app for nothing. Its tile and its taskbar button come from
being in the app list at all. Pinning does key off `alias`, which is why §2 makes such a point of
that field being stable: a pin is stored as an alias and resolved with a lookup over the app list,
and yours is in that list like any other. That one list is also what puts a pinned app on the
taskbar's fixed row, beside the launcher button, so an app of yours that somebody pins lands there
too with nothing to opt into — the row renders the same pin list the launcher does, resolved the
same way. Window focus and z-order are not about your app in the
first place, since they key off a window's own id rather than the alias, so they behave the same
whatever is in the body.

**Search is the exception, and it will not find your app.** The magnifier in the launcher opens
Umbraco's native backoffice search, which searches *entities*: content, media, members, whatever the
install's search providers index. It has never read the desktop's app list, so no registered app is
findable through it, and no curated one is either. Nothing about registering an app makes it
searchable. Your app is launched from its tile, or from a pin, and that is worth knowing before you
name it something only a search box would ever have found.

---

## 7. Lifecycle: what happens to your element

| Event | What your app sees |
|---|---|
| Window opens | Your element is constructed, stamped with the theme, then inserted. `connectedCallback` fires |
| Theme changes | The attribute is rewritten **in place**. No remount, no reconstruction |
| Window minimized | Nothing. Your element stays in the DOM and keeps running |
| Window maximized, moved, resized | Nothing beyond ordinary CSS. Your box changes size |
| Window closes | Your element is removed. `disconnectedCallback` fires, exactly once |

Two consequences worth designing around.

**A theme change never remounts you, so do not rebuild state on it.** If you cache anything derived
from the theme, recompute it from the attribute rather than assuming a fresh instance. Only a change
of `element` identity remounts, and the desktop holds your manifest's `element` value by reference
precisely so that an unrelated package registering an extension cannot hand the host a new function
and restart your app.

**Minimizing does not unmount, so a game keeps running and keeps its board.** That is usually what
you want. If your app should idle out of sight, watch your own visibility: the desktop hides the
window's frame rather than telling you about it.

A real-time game is the case where it is not what you want. Minesweeper's clock ticking on while
minimised is fair, since the board waits for the player, but Snake's snake does not: left running,
it hits a wall unseen and the player restores the window to a finished game. Snake's answer is to
pause whenever its playfield loses focus. That covers minimising, because minimising takes focus
with it, and it also covers the player clicking into another window, which a visibility check would
not catch. If your app takes keyboard input, the same pattern is the natural fit: make one element
focusable, focus it in `firstUpdated`, and treat `focusout` as "the player has looked away".

Teardown is the browser's own. `disconnectedCallback` is the whole contract: cancel your
`requestAnimationFrame` there, clear your intervals, drop your listeners. There is no desktop signal
to subscribe to and none is needed.

**Tell the desktop about unsaved work with one attribute.** While your app holds work that closing
the window would lose, put `data-umbradesktop-dirty` on your own element, and take it off once the
work is saved or discarded:

```ts
this.toggleAttribute('data-umbradesktop-dirty', this.hasUnsavedWork);
```

That is the whole contract, and it buys everything a backoffice page gets: the unsaved dot on the
titlebar and the taskbar button, a question before the close button throws the work away, and a
count in the prompt before someone leaves the desktop. Presence is what counts, and the value is
ignored. Write it wherever your state changes (Lit's `updated()` is a good place), and never set it
for state that is not lost on close, such as a game in progress: a question nobody needed trains
people to click through the one that matters. Notepad and Paint in the Accessories package are the
worked examples.

**Tell the desktop about long work with one event.** An export, a render or an upload your app runs
can show on its window's title bar and taskbar button, and be guarded the way unsaved work is, by
dispatching `umbradesktop-task` events. See [Showing work in progress](window-progress.md).

**There is no reload or restart control on an app window.** The titlebar draws three buttons —
minimize, maximize, close — where an iframe window draws four. Reload exists for the iframe kind
because re-fetching a booting backoffice in place, with the window keeping the route the user
navigated to inside it, is something nothing else in the shell can do. For your app it would have
meant "throw this instance away and build another", which is what closing the window and opening it
again already does, and it took a fixed 46px of titlebar from exactly the windows least able to
spare it: a nine-by-nine game asks for a 274px window, and four controls plus the app's own name
wanted 311px of one.

So your app's lifetime is opened-to-closed and nothing in the chrome interrupts it. If your app
needs a "start over" — and a game does — **offer it yourself, inside your own body**, where you can
name it in your own words and put it where the player expects. Minesweeper's is the "New game"
button in its status row.

### 7.1 Keyboard focus follows the active window

The desktop gives your app the keyboard whenever its window becomes active, as an operating system
does, by every route: opened from the launcher, clicked back on (the first click is enough; it
lands on the window's focus catcher), brought forward by its titlebar, or restored from its taskbar
button, which would otherwise keep focus and take the next Space or Enter as another press.

| When your window becomes active | What gets focus |
|---|---|
| Something inside your app had focus before | That element again: your playfield, text box or button, however deep in your shadow root |
| Nothing has yet, as when the window has just opened | Your app element itself, after it has loaded, if it is focusable |
| Nothing in your app can take it | Nothing in your app, but focus still leaves the window it was in, so keys go nowhere rather than to the window behind yours |
| Focus is already somewhere inside your app | Nothing changes |

Clicking the window's own chrome (its titlebar, its edges, a resize handle) does not take focus out
of your app, so an app that pauses when it loses focus is not paused by someone moving its window.
If focus was somewhere else, on a taskbar button say, the same click gives it back to your app. A
click inside your app is left entirely to you, and one in a pane attached to your window to the
pane.

So, if your app takes keyboard input:

- **Make something focusable**, and if a particular element should have the keyboard when the window
  first opens, **focus it yourself** when you first render (`firstUpdated` in Lit). The desktop only
  falls back to your app element, which does nothing if it is not focusable: the keyboard then goes
  nowhere until the player clicks something of yours.
- **Pausing on `focusout` is safe**, and is the natural way for a game to stop when the player looks
  away: the way back gives focus to the same element, so "press a key to carry on" works on the
  first press.
- Iframe windows are never handed focus this way: a backoffice window's focus is its frame's own.

### 7.2 Formatting dates and times like the desktop

The taskbar clock follows two of the user's desktop settings: which culture formats times (the
backoffice's or the browser's) and whether to force a 12 or 24 hour clock. An app that shows a time
should follow the same two, or the user who asked for 24 hour sees "2:30 PM" in your window and
"14:30" a few centimetres below it. `this.localize.date` does not know about either setting.

The desktop publishes them through the context it provides to everything inside it, apps included.
**This is public API**: the alias, the members below and their behaviour are kept stable.

| | |
|---|---|
| Context alias | `'UmbraDesktopSettingsContext'` |
| `formatDateTime(date, options)` | Formats `date` with `Intl.DateTimeFormat` options, exactly as the taskbar clock does: the user's culture, their hour override when `options` asks for an hour, and the hour padded to suit the cycle. Returns a string |
| `locale` | An observable that emits whenever either setting changes. Observe it and redraw; its value is the desktop's own and not something to read |
| `theme` | An observable of the active theme's id, one of the ids in §5. Published API since the Arcade's pieces use it to stamp themselves (§5) |

Those two members are the whole contract. The context also carries the user's other settings and
the setters the settings dialog uses. They are not part of it, so do not build on them.

As with the tray context (§9.8), nothing is imported from the host. Declare the shape you use and a
token with the same alias, and consume it:

```ts
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';

// UmbContextMinimal, because UmbContextToken requires it; the desktop's context is one.
// formatDateTime is optional because an older desktop has the context without it.
interface DesktopDateTime extends UmbContextMinimal {
  formatDateTime?(date: Date, options: Intl.DateTimeFormatOptions): string;
  readonly locale: Observable<unknown>;
}

const DESKTOP_SETTINGS = new UmbContextToken<DesktopDateTime>('UmbraDesktopSettingsContext');

// In your element:
this.consumeContext(DESKTOP_SETTINGS, (desktop) => {
  this.#desktop = desktop;
  if (desktop) this.observe(desktop.locale, () => this.requestUpdate());
});
// …and when rendering, falling back to the backoffice's own formatting:
const time = this.#desktop?.formatDateTime?.(now, options) ?? this.localize.date(now, options);
```

**Ask for an hour, not a `timeStyle`.** The 12 or 24 hour override applies only when `options` sets
`hour`. A `timeStyle` has no `hour` in it, so it follows the culture and quietly ignores the Clock
setting. Spell a time out as `{ hour: 'numeric', minute: '2-digit' }`, which is what the taskbar
asks for, and never pass `hour` and `timeStyle` together, because `Intl.DateTimeFormat` throws on
that. A date with no time in it, such as `{ dateStyle: 'medium' }`, has no hour to override and
gets the user's culture alone.

**Keep the fallback.** The context is absent in your own tests. Under a desktop older than this
contract it is there, but without `formatDateTime`, which is why the snippet checks for the method
and not only the context. An app that renders nothing there is worse than one that follows the
backoffice culture alone.

The Accessories Clock and umbraCoffee in the Entertainment package are the worked examples. umbraCoffee's session times pass
`{ hour: 'numeric', minute: '2-digit' }` and its episode dates pass `{ dateStyle: 'medium' }`, both
through one function in `umbracoffee/desktop-format.ts`, so the window and the tray cup cannot
disagree.

A service your app shares with others belongs in a [desktop context](desktop-contexts.md).

### 7.3 Remembering where your app is

A backoffice window reopens at the page it was on after a reload. An app window can do the same for
whatever "where" means to your app: a page, a tab, a document id. Nothing about it is required, and
an app that never reports a location behaves exactly as before.

1. **Report where you are** whenever it changes, with an event from your element:

   ```ts
   this.dispatchEvent(
     new CustomEvent('umbradesktop-app-location', {
       detail: { location: 'reports/2026' },
       bubbles: true,
       composed: true,
     }),
   );
   ```

2. **Read it back** from your element's `location` property. The desktop sets it before your element
   connects, both when the window is reopened after a reload and when another feature opens your app
   at a location. Declare it as a property, and go there when it is set:

   ```ts
   @property({ attribute: false })
   location?: string;
   ```

A location is any short string you choose, up to 1,000 characters on one line; the desktop stores it
and hands it back without reading it. Each window has its own, so an app that allows several windows
can have each one somewhere else. The Help app is the first to use this: its location is the page it
shows, such as `umbradesktop/snapping`.

### 7.4 Opening and saving media files

An app that edits files, as Notepad and Paint do, can leave opening and saving to the media service
package rather than writing it again. It shows Umbraco's media picker, saves a file back as a media
item, asks where a new file goes, and asks before overwriting a file somebody else changed. Depend on
`Umbraco.Community.UmbraDesktop.Services.Media` and reach its context by its alias, as
[Desktop contexts](desktop-contexts.md#services-you-can-use) lists. Its own guide,
[Opening and saving media files](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/src/Umbraco.Community.UmbraDesktop.Services.Media/docs/developer/opening-and-saving-media.md),
has the calls.

### 7.5 Naming your window after what it has open

An editor's window can say which file it has open. Put `data-umbradesktop-title` on your own
element, and the title bar and taskbar button show its value in place of your app's label:

```ts
this.setAttribute('data-umbradesktop-title', 'beach.jpg');
```

Remove the attribute, or set it to an empty string, and the window goes back to your label. The
value is shown as it is and never translated, so give it the file's own name rather than a
dictionary key. The unsaved dot still follows `data-umbradesktop-dirty`, beside whatever title you
set. The Image Editor in the Media add-on is the worked example.

### 7.6 Closing your own window

An app with a Close command of its own, such as one on a File page, closes its window by dispatching
an event from its element:

```ts
this.dispatchEvent(new CustomEvent('umbradesktop-close-request', { bubbles: true, composed: true }));
```

The window closes as if its close button was pressed: if your element carries
`data-umbradesktop-dirty`, the desktop asks before throwing the work away, and a no keeps the
window open. You do not need to ask yourself first.

---

## 8. Traps

Everything below cost real time to find while the seam was built, and none of it is guessable from
outside.

**A theme branch may change how your app looks, never how big it is.** `meta.defaultSize` is one
number for all five themes, so a rule behind `:host([data-umbradesktop-theme='...'])` that changes
a `gap`, a `padding`, a `height` or a `border` width makes your app the wrong size under exactly
one theme — and nothing catches it, because your own tests almost certainly run with no theme
attribute at all, where every branch is inert. Minesweeper switched its grid ruling off under
Windows 98 with `gap: 0`, wanting butted bevels, and gave that one theme a board eight pixels
smaller in each axis than the window the host had opened for it: a dead band inside the tightest
frame of the five, reported as exactly that. Paint your way to the look instead — the gap stayed and
took the face colour — and measure your content box under each of the five ids.

**A backtick inside a `css` comment ends the stylesheet.** Lit's rather than ours, and it costs the
same time every time: `/* prefer `border` over `edge-dark` */` terminates the tagged template at the
first backtick, and the error you get names a token halfway down your CSS, not the comment. Name
tokens bare in a stylesheet comment and keep the backticks for JSDoc.

**`background`, never `background-color`.** A surface token is allowed to carry any valid
`background` value, a gradient included. No shipped theme sets a gradient app surface today, but
four of the five use gradients elsewhere in their chrome, so the first one to reach for it here is a
question of when rather than whether, and your app will meet it without being rebuilt.
`background-color` accepts only a colour and drops a gradient value **entirely**, leaving your
element unpainted rather than falling back to something. This applies to all three `surface` tokens.

**A length token is safe to use, not safe to compute with.** `edge-width` and `radius` are published
with a unit on every theme, zero included, so `border: var(--umbradesktop-app-edge-width, 1px) solid
...` is always valid. Wrapping one in `calc()`, `min()` or `max()` is a different matter: it makes
your app's correctness depend on every present and future theme spelling its zero with a unit, and
the failure mode when one does not is that the browser drops the **whole declaration** with nothing
logged — the first consumer of this contract lost a `border` shorthand, `border-style` and all, and
spent a while looking for a missing `border-style` that was never missing. Four palettes did publish
a bare `0` until the game found it. They no longer do, and `app-tokens.test.ts` fails if one comes
back, but the seam you would be relying on is a host-side test rather than anything CSS guarantees
you. Prefer a technique that needs no arithmetic; §4's grid `gap` is the worked example.

**An edge that takes layout makes your declared size theme-dependent.** This one only bites an app
that declares a size and means it, which is any app whose content does not reflow. If you draw a
panel's edge with `border: var(--umbradesktop-app-edge-width, 1px) solid ...`, that panel's outer
size grows by twice a number the theme owns and you cannot read: two of the five themes publish
`0px` and one publishes `2px`, so the content size you worked out is exact under some of them and
two to four pixels short under the rest, and your last row of anything is then clipped. Minesweeper
papered over it with a slack term — over-declare by the widest bevel it knew about and hope theme
six wants no wider one — before drawing the edge as a **spread shadow** instead:
`box-shadow: 0 0 0 var(--umbradesktop-app-edge-width, 1px) var(--umbradesktop-app-edge-dark, ...)`.
Same ring, follows the same `border-radius`, costs no layout, needs no arithmetic on the token, so
the size you declare is exact under every theme including the ones that do not exist yet. Controls
of a fixed size (`box-sizing: border-box`) are unaffected and should keep using a border, which is
what §4's example does.

**A button the mouse clicked grows a focus ring at the next keypress.** Chrome focuses a clicked
`<button>` and, correctly, shows no `:focus-visible` ring for it. The moment any key is pressed, it
decides the person is using the keyboard and draws the ring after all. Any key counts, Shift, Ctrl
or the Windows key on their own included, so a screenshot shortcut or a switch between windows is
enough. The Accessories apps all shipped with this: a tab or toolbar button someone had clicked wore
the accent ring the next time they touched the keyboard, while nothing on the desktop's own chrome
did, because none of it takes focus on a click. Your `:focus-visible` rule is not wrong, and it
should stay, since it is the keyboard's only way to see where it is. What fixes it is not taking
focus on a mouse press in the first place: cancel the `mousedown` default on your buttons. The click
still fires, `:active` still draws the press, and Tab still reaches the button and still shows its
ring. It also keeps typing where it was, so a Word wrap toggle does not swallow the next keystroke.
Leave a `draggable` button alone, because a cancelled mousedown never starts an HTML drag, and leave
selects and text fields out of it, since they have to take focus to open or to take the caret. They
are worse, not better: Chrome rings a clicked select, text field or text area with no key pressed at
all. Mark one on mousedown, clear the mark on blur, and turn the outline off for a marked field,
Chrome's own `outline: auto` included, with enough weight to beat your own field rules. The Accessories
package does all of this for every app in one function,
`shared/press-focus.ts`. The other half: if your app listens for shortcuts on its host, a click must
leave focus somewhere inside it. A click on something that cannot take focus, such as a canvas, moves
focus to the nearest ancestor that can, and with none it lands on the page. Paint's Ctrl+Z did
nothing after a real stroke until its host got `tabIndex = -1` and `outline: none`. Neither the
ring nor this one shows up when a unit test dispatches its own events. Only real input shows them,
through `sendMouse` and `sendKeys` from `@web/test-runner-commands`.

**Read the theme id in CSS, not in your constructor.** The attribute is set on your element after it
is constructed and before it is inserted. A CSS rule is therefore always safe: CSS is declarative and
applies the moment the attribute exists, so nothing is ever painted unstyled. But
`this.getAttribute('data-umbradesktop-theme')` in your **own constructor** reads nothing, because
your element has to exist before an attribute can be set on it. `connectedCallback` is the earliest
safe point for the imperative route. This is the one way to hold a correctly implemented attribute
wrongly.

**Absent, not empty.** Before a theme resolves there is no attribute at all, rather than an empty
one. So render correctly with no attribute, and never gate anything essential on
`[data-umbradesktop-theme]`: an existence check that fires only once the desktop is ready will leave
your app unstyled in the gap before it is. The desktop goes out of its way to guarantee this, because
`data-umbradesktop-theme=""` would match an existence check and answer it with nothing usable. For
the same reason, an app that had a theme and then loses one has the attribute **removed** rather than
left behind: a stale id is worse than none, because you can detect a missing attribute and cannot
detect an out-of-date one.

**Both nodes carry the id.** It is on your element, and also on the `<umbradesktop-app-host>` that is
its parent. Your element is the one to select on with `:host`. The parent copy is there for an app
that renders into **light DOM**: with no shadow root there is no `:host` to write, so such an app
reads the theme from its parent instead.

**`weight` follows Umbraco's convention: higher sorts first.** `weight: 1000` means "put me at the
front", exactly as it does for a dashboard or a menu item, and Umbraco's registry is where that comes
from. The desktop's internal scale happens to run the other way and the value is negated at the
boundary, which is invisible from out here and is not something to compensate for. Write the number
Umbraco taught you to write.

**Leaving `weight` unset does not opt out of the ordering, it enters at zero.** The launcher sorts
on `weight ?? 0`, and zero is a position rather than an absence, so an unset app lands at one end of
its group rather than politely in the middle. Which end depends on the peer. Against a curated
catalogue entry, whose weights are all positive on the desktop's own ascending scale, unset sorts
**first**. Against another registered app that asked for a weight, unset sorts **last**, because a
positive Umbraco weight is a negative one on that scale, which is the whole point of the paragraph
above. The by-name tiebreak only ever settles peers that are both sitting on zero. So if you ship
more than one app and care about their order, give every one of them a number.

**An alias a curated entry already owns is taken over.** The desktop's aliases are one namespace,
shared with its catalogue, because an alias is what a pin is stored under and one alias must mean
one app. A manifest whose alias matches one of the desktop's entries replaces that entry, and the
console prints a line saying what it replaced, since swapping a deep link for an app is rarely an
accident you want to miss. If two packages claim one alias, the one whose manifest has the higher
weight keeps it and the console names both.

**Three things can make your app not appear, and only two of them say so.** An alias another
package's manifest also claims, with the higher weight. A manifest the desktop found no `element`
in, which includes the case where you wrote `js` instead (§3). Both print a line naming your alias.
An app with `meta.opensSettings` needs no `element`, so the second does not apply to it (see
[Package settings](package-settings.md#5-opening-your-settings)). The third is an **unmet
`condition`** (§2), and it is silent by design: an app whose condition is unmet is doing exactly what the manifest asked, so
there is nothing to warn about, and Umbraco removes it from the list before the desktop sees it.
That makes it the one to suspect first when your tile is missing and the console has nothing in it,
and the reason to reach for `conditions` only when you mean it.

**One `element`, one window body.** There is no chrome injector, no loading overlay of the window's
own, no theme mirroring and no reload-in-place on this path, because all four exist to manage a
booting second backoffice inside an iframe and there is not one here. Your element is the body.

---

## 9. Tray items: an icon beside the clock

The system tray is the box at the trailing end of the taskbar that holds the clock. A package can put
an icon in it with a `umbraDesktopTrayItem` manifest. A tray item reports on something rather than
opens it: a status, a countdown, a sign that something is live. It is one custom element, drawn in the
tray while the user has it switched on.

The worked example is the umbraCoffee cup in the Entertainment package,
`src/Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/umbracoffee/tray-cup.element.ts`.
It shows only while an episode is coming up or live, opens the umbraCoffee app when clicked, and
raises the reminders that §9.9 describes. Everything it uses is in this section, and nothing it does
is privileged.

### 9.1 The manifest

```ts
{
  type: 'umbraDesktopTrayItem',
  alias: 'My.Status.Tray',
  name: 'My status',                                // developer-facing
  element: () => import('./status-tray.element.js'),
  meta: {
    label: '#myStatus_trayLabel',                   // the switch's name in Desktop settings
    description: '#myStatus_trayDescription',       // the line under that switch
    defaultEnabled: true,
  },
  conditions: [],
}
```

| Field | Required | Notes |
|---|---|---|
| `type` | yes | Always `'umbraDesktopTrayItem'` |
| `alias` | yes | Unique, and also the key the user's on/off choice is stored under, in the same place as the desktop's own taskbar switches. **Never change it.** A changed alias reads as an item the user has never had an opinion about, so everyone who switched yours off gets it back. Namespace it with your package id |
| `element` | yes | The icon itself. The same four forms as an app's, §3, and the same rules: `element` is the field that is read, and your module must register its custom element. A manifest with no `element`, including one that wrote `js`, is dropped with a console line (§9.7) |
| `name` | yes | Developer-facing, required by `ManifestBase` as it is for an app |
| `meta.label` | yes | The switch's name in Desktop settings. A localisation token (`#area_key`) or a literal |
| `meta.description` | yes | The line under that switch: what the item puts in the tray. A token or a literal. Required because a switch nobody can decide about is worse than none |
| `meta.defaultEnabled` | no | Whether the item is on for a user who has never said otherwise. Defaults to `true`, the same default the desktop's own taskbar features ship with: an item that arrives switched off is mostly never found |
| `conditions` | no | Umbraco's own conditions, honoured exactly as for a `umbraDesktopApp` (§2). An item whose conditions are unmet is left out of the tray and out of Desktop settings, silently |

There is **no `weight`**, on purpose. §9.3 says why.

Your element sits inside the taskbar and inherits its text colour, so an icon drawn in `currentColor`
(an `umb-icon`, say) follows the theme with no work.

### 9.2 Hide yourself when there is nothing to show

A tray item that has nothing to report sets `hidden` on itself, and removes it when it does:

```ts
this.hidden = !this.#current;
```

The desktop watches that attribute and nothing else. It is what takes your item out of the tray, and
it is also what decides your place in it (§9.3). Rendering an empty template instead leaves a gap the
size of the tray's spacing and keeps your seat as though you were showing.

**Do not declare `:host { display: ... !important }`.** The tray hides a `[hidden]` item with a rule
of its own, which already beats a plain `:host { display: ... }` and an inline `style.display` your
script sets. The one thing it cannot beat is an `!important` display on your own host, and an item
declaring one can never be hidden.

### 9.3 Where your item sits

Reading outwards from the corner of the screen:

1. The clock.
2. The desktop's own tray features, like the quick settings Windows keeps next to its clock. None
   ship yet. Any the desktop adds later sit in its own fixed order, between the clock and every
   package item.
3. Package tray items, in the order they appeared. An item that becomes visible joins at the end
   furthest from the clock and keeps its place while it stays visible. An item that hides and shows
   again rejoins at the far end, like a program that was closed and started again.

So a package cannot claim a place nearer the clock than an item that was there first, and the
desktop's own features always sit closer than any package's. That is why there is no `weight`. The
order is not stored: after a reload, items take their places again as they appear.

### 9.4 Your element lives as long as the desktop

The desktop creates your element when your item is switched on and keeps that same instance while it
stays on and the desktop stays open. Re-renders of the taskbar, other items loading or being switched
off, and your item moving place in the tray do not recreate or move it: reordering is done with CSS
`order`, never by moving the node. So state you hold on the element, a poll or a timer, survives all
of that.

| Event | What your item sees |
|---|---|
| Switched on (or on by default when the desktop opens) | Your element is constructed and inserted. `connectedCallback` fires |
| User leaves the Desktop section | Your element is removed with the whole desktop. `disconnectedCallback` fires and the instance is let go |
| User comes back to the desktop | A **new** desktop is built, and with it a new element of yours: constructed, inserted, `connectedCallback` fires |
| Switched off | Your element is removed and let go. Switching it back on makes a new one |

So start your work in `connectedCallback` and stop it in `disconnectedCallback`. The instance lasts
only as long as the desktop does, so anything that must survive the user leaving and coming back,
such as what you have already reminded them about, belongs in storage, not on the element. The cup
keeps its reminders in `localStorage` for this reason.

### 9.5 The switch in Desktop settings

Every tray item gets a switch in Desktop settings, in the Taskbar group, under the **System tray
icons** heading, with your `meta.label` as its name and `meta.description` under it. The heading
appears as soon as one package registers a tray item. The switch is never disabled: an item this user
may not have is filtered out by its conditions before it gets there.

Your package cannot read that choice. If your app wants to tell the user the icon can be switched
off, say where ("under Taskbar in Desktop settings"), not whether it is on.

### 9.6 Flyouts go in the top layer

If clicking your icon opens a panel, open it in the top layer, with the popover API or a `<dialog>`.
A theme may make the tray a stacking context (Windows 11 does), and anything positioned inside it
with `z-index` alone can end up underneath the windows. The top layer is above all of it under every
theme.

### 9.7 When your item does not appear

A manifest is dropped, with one `console.warn` naming its alias, when:

- it has no `element`. If it has a `js` instead, the line says so and tells you to rename it
- its `meta` is missing `label` or `description`
- its alias is the id of one of the desktop's own taskbar features, since the two would then share one
  stored switch
- another tray item already registered the same alias. The first one keeps it

The line reads `[UmbraDesktop] The tray item "<alias>" was dropped because ...`, once per desktop
rather than on every registry change. An element that fails to load (a module that throws, a path
the server does not serve) prints one `console.error` saying it could not be drawn, and is not tried
again until the page reloads. A module that loads but exports no element gets Umbraco's own console
error rather than this one, and is not retried either. The other items are drawn either way.

The two silent cases are the same as for an app: an unmet condition, and a user who switched your
item off. Check the switch in Desktop settings before you look for a bug.

### 9.8 The tray context

The desktop provides a small context that package code inside the desktop may call: your tray item,
your app's element, and an element drawn on a desktop toast (§9.9) can all reach it.

**The alias `UmbraDesktopTrayContext` is public API**, and it is the only thing you need from this
repository. Consume it with a local `UmbContextToken` of your own, since importing the desktop's token
would mean importing the desktop's bundle:

```ts
import { UmbContextToken, type UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';

/** The three calls the desktop's tray context offers packages. */
interface UmbraDesktopTrayContext extends UmbContextMinimal {
  openApp(alias: string): boolean;
  setTrayItemEnabled(alias: string, enabled: boolean): boolean;
  trayItemEnabled(alias: string): Observable<boolean>;
}

export const UMBRADESKTOP_TRAY_CONTEXT = new UmbContextToken<UmbraDesktopTrayContext>('UmbraDesktopTrayContext');
```

and in your element, `this.consumeContext(UMBRADESKTOP_TRAY_CONTEXT, (tray) => (this.#tray = tray))`.
Keep a fallback for when it never arrives: outside the desktop there is no provider. The `extends
UmbContextMinimal` is not optional: a context token only carries a type that has `getHostElement`,
and without it `tsc` refuses the token. The desktop's context has it from its base class, and you
never call it.

| Call | What it does |
|---|---|
| `openApp(alias)` | Opens an app as its launcher tile does. Only apps this user may launch are found, so it cannot open anything the launcher would not show. Returns `false` when there is no such app |
| `setTrayItemEnabled(alias, enabled)` | Switches a tray item on or off for this user, exactly as its switch in Desktop settings does. Only a registered tray item's alias is accepted, never one of the desktop's own features. Returns `false` for anything else. The cup's "Stop reminding me" button is this call with its own alias and `false` |
| `trayItemEnabled(alias)` | Reads a tray item's switch: emits the current value on subscribe and again whenever it changes, following Desktop settings live, so a switch inside your own app stays in step with the one in Desktop settings. It is the stored choice, else the item's `defaultEnabled`, and it emits `false` for an alias that is not a registered tray item (also until a late-registering item appears, when it flips to its default). Only changes are emitted, never a repeat |

Those three calls are the whole contract. The cup's app-side "Remind me" switch is `trayItemEnabled` to show the state plus `setTrayItemEnabled` to change it. The object also carries members it inherits from Umbraco's
context base class, and an `items` list the desktop reads itself. Neither is part of the contract, so
do not build on them.

### 9.9 A notification with buttons

A notification normally reaches the desktop's toast as text: a headline and a message. A package that
wants buttons on it, like the cup's reminders with **Watch** and **Stop reminding me**, raises it
with an element of its own, and the desktop's toast then draws that element in place of the text.

Raise it through Umbraco's own notification context, from the desktop's own document: from a tray
item, or from an app element, since both live in it. Give it `elementName` and `data`, and raise it
with `peek` and a `duration` rather than `stay`. The desktop draws its own toast from your
notification and hides the original raised in its document, so a notification that stays until
closed would linger there after the toast is gone, while a timed one clears itself:

```ts
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import './reminder-notification.element.js'; // defines the element before it is raised

// In the constructor: keep the context, and raise nothing yet.
this.consumeContext(UMB_NOTIFICATION_CONTEXT, (notifications) => (this.#notifications = notifications));

// Later, when there is something to say:
this.#notifications?.peek('default', {
  elementName: 'my-status-reminder',
  data: { headline: 'Live now', message: 'The stream has started.', videoId: 'abc123' },
  duration: 15 * 60 * 1000,
});
```

The toast creates your element and sets two properties on it, the way Umbraco hands them to a
notification layout: `data`, a JSON copy of what you raised, and `notificationHandler`, with these
members:

| Member | What it is |
|---|---|
| `key` | The notification's key |
| `color` | Its severity: `'default'`, `'positive'`, `'warning'` or `'danger'`. Anything else reads as `'default'` |
| `duration` | How long it stays in milliseconds, or `null` for until closed |
| `close()` | Takes the toast down. Call it from your buttons once they have done their job |
| `onClose()` | A promise that settles once the toast is gone, however it went: your `close()`, the cross, its timer, Clear, a repeat from a window taking the toast over, or the desktop going away |

Nothing else of Umbraco's handler is there, and your element is not wrapped in a
`uui-toast-notification`. A layout written against those five members works; one that reaches for
more does not.

Five rules:

- **Define the element before you raise it.** Import its module in the file that raises the
  notification. If the tag is not defined when the toast is drawn, the toast falls back to text.
- **Build everything from `data`.** Your element can be created again for the same notification:
  clicking it in the list behind the clock shows it again as a new toast with a new element. So hold
  nothing only on the element that the next one would need.
- **Put `headline` and `message` in `data`.** They are what the scrollback behind the clock lists, what
  the text fallback shows, and what a repeat is matched on: a notification with the same severity,
  headline and message as one already showing folds into it, so give two different notifications
  different text.
- **Keep `data` plain JSON.** It is copied through JSON, so a function, an element or a class
  instance in it does not survive. Data that cannot make the trip at all, a cycle or a BigInt, drops
  the element entirely, and the toast shows the headline and message as text. Put what your buttons
  need in as values (an alias, an id) and reach the rest through contexts, which your element can
  consume because it sits inside the desktop. The cup's Watch button calls `openApp` on the tray
  context this way.
- **Only from the desktop's own document.** A notification raised inside a window, an iframe with a
  backoffice of its own, stays text on the desktop, because a window's document can close and the
  desktop must not hold on to anything from it.

---

## 10. Checklist before you ship

- [ ] Your manifest points at your module through `element`, not `js`: `js` compiles and is ignored
- [ ] Your module registers its custom element (`customElements.define`, or Lit's `@customElement`)
- [ ] Every `var(--umbradesktop-app-*)` you read carries the §4 fallback
- [ ] Every `background` reading a surface token is `background`, not `background-color`
- [ ] Every line that separates one control from another is `--umbradesktop-app-border`, not
      `edge-dark`: only the first promises to be visible against the surface you drew it on (§4)
- [ ] Every per-theme branch changes appearance only — measure your content box under all five
      theme ids and get the same number, because `defaultSize` is one number for all of them (§8)
- [ ] Your app renders correctly with **no** `data-umbradesktop-theme` attribute at all
- [ ] Your app renders correctly under an unrecognised theme id, not only the five in §5
- [ ] Your `alias` is namespaced and final: it is what pins a favourite
- [ ] `meta.label` is a localisation token and your package ships the dictionary for it
- [ ] `disconnectedCallback` cancels every timer, frame and listener your app started
- [ ] If closing your window can lose work, your element carries `data-umbradesktop-dirty` while it
      would (§7), and only then
- [ ] Minimizing your window and restoring it leaves your app's state intact
- [ ] Switching theme mid-use recolours your app without resetting it
- [ ] `meta.defaultSize` and `meta.minSize` are **your content box** with no titlebar allowance
      subtracted from either (§2.1)
- [ ] Your app at `meta.minSize` is still usable, since that is the smallest box a user can leave it
- [ ] Your app does something sensible with a box **larger** than `defaultSize`, because a maximized
      window is one — or it sets `meta.resizable: false`, if a bigger window is only empty margin
      (§2.1)

If you ship a tray item as well (§9):

- [ ] Its `alias` is namespaced and final: it is the key the user's on/off choice is stored under
- [ ] `meta.label` and `meta.description` are both set, or the item is dropped
- [ ] It sets `hidden` on itself while it has nothing to show, and declares no
      `:host { display: ... !important }`
- [ ] Its `disconnectedCallback` stops everything its `connectedCallback` started, and anything
      that must outlive the desktop (what it has already reminded about, say) is in storage, not on
      the element
- [ ] A flyout it opens is in the top layer: a popover or a `<dialog>`
- [ ] A notification with buttons has its element defined before it is raised, plain-JSON `data`
      carrying a `headline` and a `message`, and an element that builds everything from that `data`
