# Building a desktop app

> How to ship an app that opens in an UmbraDesktop window from your own package, without touching
> this repository. For *why* the seam is shaped this way, see
> [the design](design/2026-09-06-desktop-apps-design.md); this document is the practical companion
> to it.

A desktop app is one custom element in a window. You register it with an extension manifest, the
desktop opens it, themes it and closes it, and your package never depends on anything here beyond
the manifest type. Minesweeper is the first one; a calculator, a colour picker or a notepad would
work the same way.

---

## 1. Is your app registerable, or does it belong in the catalogue?

Two kinds of thing can sit in the launcher, and only one of them is yours to register.

| Your app is | Path | Why |
|---|---|---|
| **Self-contained**: its own element, its own state, no backoffice route behind it | Register a `umbraDesktopApp` manifest. Nothing to ask anyone | There is nothing to verify. An element in a box cannot point at the wrong URL, and the worst it can do is be a bad app |
| **A backoffice surface**: a section, a dashboard, a workspace, anything with a URL | A pull request against `catalogue/` in this repository | A deep link needs its URL checked and a chrome profile chosen, and getting either wrong ships a broken window whose blame lands on the desktop |

The manifest enforces this rather than describing it. `umbraDesktopApp` has no `url`, no `section`
and no `chromeProfile` field, so a deep-linked entry is not expressible through it even if you want
one.

If your package registers a *section*, you already appear in the launcher with no work at all: any
section a user can reach shows up automatically in the More group with a generic icon. Registering
an app is for the case where there is no section, because there is no route.

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
  },
  conditions: [],
}
```

| Field | Required | Notes |
|---|---|---|
| `type` | yes | Always `'umbraDesktopApp'` |
| `alias` | yes | Unique, and it must not collide with a curated catalogue entry's alias: if it does, your app is dropped and the console says so. It is also what pins a favourite, so it has to be stable across releases, since renaming it loses the pin for every user who made one. Namespace it with your package id and both problems go away |
| `element` | in practice | The app itself. Four forms, all supported, and it is the **only** field the desktop resolves: see §3. Required differently from the rest of this column, see below |
| `name` | yes | Developer-facing, and required by `ManifestBase` rather than by anything here: omit it and `tsc` fails with `TS2741`, and Umbraco's own package schema rejects it too. The desktop reads it only as the window title, if `meta.label` is missing at runtime |
| `weight` | no | **Higher sorts first.** See §8 |
| `meta.label` | yes | The window title, taskbar label and launcher tile text. Required by the type; if it is absent anyway, `name` and then `alias` stand in, so an app never shows up nameless |
| `meta.icon` | no | Falls back to `icon-box` |
| `meta.group` | no | A launcher group alias. Unknown or unset lands you in the reserved More group. See §6 |
| `meta.defaultSize` | no | **Your app's own box** in px, not the window around it. The desktop adds its titlebar, its frame and whatever else the active theme's chrome costs. See §2.1 |
| `meta.minSize` | no | The smallest box your app can work in, again yours rather than the window's. Falls back to the desktop's global minimum, and is **floored** at what the chrome itself needs. See §2.1 |
| `meta.allowMultiple` | no | Whether two windows of your app may be open at once. Defaults to allowed, and leaving it there is almost always right: every other app on this desktop opens as many windows as the user asks for, so `false` makes yours the one tile that quietly refocuses instead. Set it only if a second instance genuinely cannot work — module-level state, an exclusive resource — and note that two instances of an app whose state lives in its own element share nothing at all |
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
  window and `defaultSize` is a starting size rather than a fixed one. Decide what a fixed-size app
  does with the extra room. Minesweeper centres its board with `margin: auto` on a single wrapper,
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
[`theme/types.ts`](../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/types.ts)
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

Three guarantees you may rely on, all machine-checked per theme and per variant in the desktop's own
`app-tokens.test.ts`. Every theme that paints its own palette answers **all thirteen** tokens, never
a subset, so you never get half a theme's colours and half the Umbraco ones. The contrast of the
pairs you would actually use, `text` on all three surfaces, `text-muted` on `surface`, and
`accent-text` on `accent`, meets WCAG AA's 4.5:1 — that is why `accent-text` exists at all: white is
16:1 on Windows 98's navy and 2.52:1 on Umbraco 4's selection blue, so there is no value your app
could have guessed. And `border` clears 3:1 against `surface`, `surface-raised` and
`surface-sunken`, so a line drawn with it is visible wherever you draw it.

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

## 6. Groups, and the `games` contract

`meta.group` is a launcher group alias. The host owns the list, and an app naming a group that does
not exist falls into the reserved More group, which is the same thing that happens to any uncurated
app and is honest rather than a failure.

`games` is reserved for exactly this purpose, and the way it is split is worth stating because it is
a contract between two packages:

- **This repository owns the group**: the alias, the label and its localisation.
- **Your package owns the apps in it.** Nothing in this repository puts an app in `games`.

So the host can ship a Games group with no games in it, your package can ship games without the host
knowing which, and neither release has to wait for the other. If you want a different heading,
name a different group and land in More until one exists.

Most of the launcher then works on your app for nothing. Its tile and its taskbar button come from
being in the app list at all. Pinning does key off `alias`, which is why §2 makes such a point of
that field being stable: a pin is stored as an alias and resolved with a lookup over the app list,
and yours is in that list like any other. Window focus and z-order are not about your app in the
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

Teardown is the browser's own. `disconnectedCallback` is the whole contract: cancel your
`requestAnimationFrame` there, clear your intervals, drop your listeners. There is no desktop signal
to subscribe to and none is needed.

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

**An alias a curated entry already owns loses.** Registry uniqueness only holds among registered
extensions, and the desktop's aliases are a single namespace shared with the curated catalogue. A
manifest whose alias matches a catalogue entry's is dropped rather than allowed to produce a second
app with the same alias, because alias is the key a pinned favourite resolves through and two tiles
sharing one would mean a pin silently opening the wrong app. The curated entry wins, and the console
gets a line naming your alias and telling you to rename it.

**Three things can make your app not appear, and only two of them say so.** A colliding alias, this
one. A manifest the desktop found no `element` in, which includes the case where you wrote `js`
instead (§3). Both print a line naming your alias. The third is an **unmet `condition`** (§2), and
it is silent by design: an app whose condition is unmet is doing exactly what the manifest asked, so
there is nothing to warn about, and Umbraco removes it from the list before the desktop sees it.
That makes it the one to suspect first when your tile is missing and the console has nothing in it,
and the reason to reach for `conditions` only when you mean it.

**One `element`, one window body.** There is no chrome injector, no loading overlay of the window's
own, no theme mirroring and no reload-in-place on this path, because all four exist to manage a
booting second backoffice inside an iframe and there is not one here. Your element is the body.

---

## 9. Checklist before you ship

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
- [ ] Minimizing your window and restoring it leaves your app's state intact
- [ ] Switching theme mid-use recolours your app without resetting it
- [ ] `meta.defaultSize` and `meta.minSize` are **your content box** with no titlebar allowance
      subtracted from either (§2.1)
- [ ] Your app at `meta.minSize` is still usable, since that is the smallest box a user can leave it
- [ ] Your app does something sensible with a box **larger** than `defaultSize`, because a maximized
      window is one (§2.1)
