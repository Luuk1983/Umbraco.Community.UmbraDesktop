# Desktop apps — Design

> A second kind of desktop app: a **self-contained element** in a window, rather than a deep link
> into the backoffice. Registered by any package as an extension manifest, themed by the desktop
> around it, and gated by nothing. The first consumer is an optional **entertainment** package
> (Minesweeper, Solitaire), a second package in this repository that ships on the desktop's own
> release tag.

- **Status:** Proposed
- **Date:** 2026-09-06
- **Branch:** `8_games_package`
- **Issue:** [#8 Add games to the desktop](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/8)
- **Target:** Umbraco CMS **v17**, packages `Umbraco.Community.UmbraDesktop` and
  `Umbraco.Community.UmbraDesktop.Entertainment`

---

## 1. Goal & scope

Every app the desktop can launch today is a backoffice deep link in an iframe. That is the right
model for Content, Log Viewer and Webhooks, and the wrong model for a calculator. A game has no
section, no permission to gate on, no URL to infer and no chrome to strip; it is a self-contained
thing that wants a box to run in.

This design adds that second kind, and the seam a separate package needs in order to ship one.

**In scope**

- A `umbraDesktopApp` extension manifest type any package may register.
- A window body that can be a **native element** as well as an iframe.
- An **app token group** in the theme contract, so an app can look native under all five themes
  without knowing they exist.
- Derivation and placement for registered apps: ungated, curated groups, existing pin behaviour.
- The `Umbraco.Community.UmbraDesktop.Entertainment` package: layout, versioning, Marketplace listing.

**Out of scope** — §11. Most notably third-party entries pointing at backoffice surfaces (D1).

**Everything here is frontend**, except the new project's packaging. No controllers, no DTOs, no
migrations. The global "test-first for all backend code" rule has nothing to bind to; §9 sets out
the frontend approach the repo already uses.

**Three implementation plans, in order.** The host seam (§4 to §7) ships first and is independently
valuable: it opens the manifest type and the app token group without any app existing to use them.
Minesweeper follows, against a contract that is already released, and settles the token group on the
evidence of a real app. Solitaire follows that, and is much the largest of the three for reasons that
are mostly not the card game (§8.2).

Building the seam and a game as one plan would mean designing the token group against a game being
written at the same time, which is how a contract ends up shaped like its first consumer.

The ordering is safe because the token group has **no consumers until the entertainment package exists**.
It ships provisional, gets its real validation from the first game (§9), and can be corrected in a
host minor without breaking anyone, since adding tokens is additive by construction.

### 1.1 The boundary: registerable versus curated

The Phase 2 pivot rejected exactly this manifest type
([2026-07-20](2026-07-20-phase-2-app-model-design.md)), for two reasons: package authors
realistically will not self-register, and curation lets the maintainer certify that a deep link plus
a chrome profile actually works. That doc also left the hatch open, in as many words: *"Internal app
model stays source-agnostic so a manifest-based source can be added later."*

Both original reasons are about **backoffice deep links**, and neither survives contact with a
self-contained app. We will certainly register our own games, so the adoption argument is moot. And
there is nothing to certify: no URL to verify, no chrome profile to get wrong, no section shell that
might render its sidebar in the wrong place. A game is an element in a box, and the worst it can do
is be a bad game.

So the boundary is drawn by *what an entry points at*, not by who wrote it:

| | Registerable by any package | Curated in this repository |
|---|---|---|
| Self-contained app (own element) | ✅ | n/a — a catalogue entry has no element to point at |
| Backoffice surface (`ref` / `url`) | ❌ | ✅ |

A third party wanting their own tool in the launcher still opens a PR against `catalogue/`, which is
where verification belongs and which the fragment-file layout was built for. A third party wanting
to ship a desktop calculator registers it and never talks to us. That is a better ecosystem story
than third-party catalogue entries ever was, and it costs nothing to police.

### 1.2 An app must work under a theme it has never heard of

The chrome contract already has this rule, from the other side: *a theme may restyle, never remove*
([2026-09-04 §1.1](2026-09-04-theming-system-design.md)). CLAUDE.md states its corollary: if a theme
needs a change to a chrome component, the contract is missing a token, so add the token and let every
theme have it.

An app is just another consumer of that contract, so it inherits the mirror-image rule. **An app
must render correctly under a theme that did not exist when the app was written.** Not
pixel-perfectly; correctly. That is what makes the token group (§6) the guarantee and per-theme
refinement (§6.2) merely polish, and it is not negotiable once a third party can ship an app: they
will not track our theme releases, and theme six must not break their calculator.

---

## 2. Settled decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Registerable for self-contained apps; curated for anything pointing at a backoffice surface** | The pivot's two reasons for rejecting a manifest type are both about deep links (§1.1). A self-registered `chromeProfile: 'bare'` that is wrong ships a broken window and the blame lands here, not on its author. |
| D2 | The boundary is enforced by the **manifest's shape**, not by documentation | `umbraDesktopApp` has no `url`, `section` or `chromeProfile` field, so a package cannot express a deep-linked entry even if it wants to. A rule you can only break by editing the host's types is a rule that holds. |
| D3 | The window body becomes a **discriminated union**: `{ kind: 'iframe'; url }` or `{ kind: 'element'; element }` | The alternative (optional `url` plus optional `element`) makes both "neither" and "both" representable. A union gives an exhaustive switch and no invalid states, at the cost of touching every `app.url` site once. |
| D4 | Registered apps are tagged **`certified`** | The tier means "this will work", and a self-contained element cannot get a deep link or a chrome profile wrong. Nothing surfaces the tier today (§10 risk); a third tier for a distinction with no consequence is complexity for its own sake. |
| D5 | **Groups stay host-curated.** The host reserves a `games` group; a registered app naming an unknown group falls into "More" | Grouping is the single curatorial level the host owns, per the flat app model. A group *label* in the host is not a game *list*, so this introduces no release lockstep. Falling into "More" is the existing behaviour for uncurated apps and is honest. |
| D6 | Element windows have **no chrome injector, ~~no loading state~~, no theme sync, no reload-in-place** | All four exist to manage a booting second backoffice. For these windows the feature is subtraction: reload means recreate the element, and the body is painted the moment it is mounted. *Refined while implementing the host: "the moment it is mounted" is one network hop after the window opens, because the loader is a dynamic import. What D6 rules out is the overlay that hides a **booting backoffice**, and that stands; the host does show a spinner for the import itself, and gives it the same 12-second patience the iframe path allows before showing the load-failure message ([app-host.element.ts](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/app-host.element.ts)). A window the user has already opened staying blank forever is the broken-desktop reading that message exists to prevent.* |
| D7 | Apps are themed by **inheritance**, not by a channel | The palette is already an inline style on `.desktop` ([desktop.element.ts:136](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/desktop.element.ts)), custom properties are inherited, and inheritance crosses shadow boundaries. An element in a window's shadow root already sees every token. Nothing to build. |
| D8 | App tokens live in a **separate `UMBRADESKTOP_APP_TOKENS` list** | `tokens.test.ts` asserts `UMBRADESKTOP_TOKENS` is *exactly* what the four chrome components read or write, to catch dead entries. App tokens have no host reader **by design** and would read as drift. Two lists, two rules. |
| D9 | The active theme id is **stamped on the app element** as `data-umbradesktop-theme` | Lets an app branch per theme with `:host([data-umbradesktop-theme='win98'])`. The ancestor-selector alternative, `:host-context`, has never shipped in Firefox. |
| D10 | Per-theme refinement is **optional polish**; the tokens are the guarantee | §1.2. An app that reads only tokens is correct everywhere forever; an app that also branches is pretty in the themes it bothered with. The fallback must be correct on its own, not a compromise. |
| D11 | Games ship in a separate `.Entertainment` package in this repository, ~~`MinVerTagPrefix=entertainment-v` and an independent release cadence~~ → **on the desktop's own `v*` tag, in lockstep** | *Reversed before any code was written — see D13.* The separate package stands; only its versioning changed. |
| D12 | Games are **written, not vendored** | The minesweeper that prompted this is GPLv3 against an MIT package. A minesweeper is a couple of hundred lines, so the licensing conversation is more expensive than the code. |
| D13 | **Lockstep versions on one tag** — both packages build from `v*`, both publish every release, the dependency stays a **range** — reversing D11 | D11 assumed release independence was worth paying for. Nothing buys it: the only thing Entertainment depends on is the host, so nothing outside this repository can force it onto its own schedule. That is the test, and it is what separates this from the Advanced Permissions AI add-on, which *is* in its own repo because AI SDKs and model deprecations move without asking. Lockstep also pays for itself three ways: one tag means one GitHub release rather than two prefixes interleaved in a flat list; the contract (§4, §6.1) can change on both sides in a single commit during exactly the period it is least stable; and matching versions *become* the compatibility answer instead of a matrix somebody has to maintain. The cost is changelog entries that say nothing, which is what `Umbraco.Cms.Api.Delivery` does every release. |
| D14 | ~~The titlebar's reload button reads **"Restart" on an element body** and "Reload" on an iframe~~ — **superseded by D23: there is no reload button on an element body** | D6 settled that reload *means* recreate the element, and left what the button is **called** unsaid, so it shipped saying "Reload" for a destructive action: four minutes into Minesweeper, one click and the board is gone. The button stays, and stays unguarded, because F5 destroys a browser game's state too and people understand that. What has to change is the promise. "Restart" is generic enough that the shell still does not claim to know the app is a game, and the titlebar already switches a label this way for `Restore`/`Maximize`, so this is local convention rather than a new idea. |
| D15 | A manifest's `element` carries Umbraco's **`ElementLoaderProperty`** unchanged, and is resolved with Umbraco's own `loadManifestElement` | Found by review, after the first version hand-rolled it. Because the manifest extends `ManifestElement`, that field is already a union: a module path string, a loader, a module's exports, or a class constructor. Accepting only a function dropped the string silently, and a **static `umbraco-package.json` can express nothing else**, so the packages likeliest to hit it were exactly the audience the feature exists for. A class constructor was worse than dropped: it passed a `typeof` check, then threw `Class constructor cannot be invoked without 'new'`, giving a tile that permanently read "could not be loaded". Carrying the platform's type and calling the platform's resolver removes both, and removes a third hazard for free: the value stays the manifest's own property, so nothing is synthesised per derivation and there is no closure identity to memoise. |
| D16 | A registered app's **`weight` follows Umbraco's convention (higher sorts first)**, negated when normalised into the desktop's own ascending scale | Umbraco's registry sorts manifests weight-descending; `groupApps` sorts ascending. Carried across unchanged, an author writing `weight: 1000` to mean "first", which is what it means everywhere else in Umbraco, landed **last** in their launcher group with nothing to warn them. Honouring the platform's meaning beats introducing a second `meta.weight` knob for one thing, since authors set the root `weight` reflexively, and beats documenting the inversion without fixing it, which is a contract trap that reads as a bug. |
| D17 | An app token's value is **usable without arithmetic**: every length carries a unit (`0px`, never `0`), and the three surface fallbacks are three distinct values | Both found by the first real consumer, both defects in the contract's own data rather than in the game. A bare `0` is a valid `<length>` alone and **invalid inside `calc()`/`min()`/`max()`**, where the invalid value takes the whole declaration with it and nothing is logged: `max(1px, var(--umbradesktop-app-edge-width))` cost the game its entire `border` shorthand, `border-style` included, under the two themes that publish zero. The chrome group is allowed the short spelling because both of its ends are in this repository; this group's readers are in packages it cannot inspect, which is the whole difference between a shorthand and a trap. Same reasoning for the surfaces: `surface` and `surface-raised` both resolving to `var(--uui-color-surface)` meant two documented roles were one colour under the default theme, and an app author had no way to know or to fix it. Enforced in `app-tokens.test.ts` rather than commented, since the comment would sit in six palette files that a seventh theme's author has not read. |
| D18 | A **tiled grid is ruled by the grid's own ground showing through a 1px `gap`**, not by flooring `edge-width` or by a new elevation token | The answer to §6.1's open question, settled in a browser rather than from hex codes, and neither of the two candidates that section proposed. The measurement is in §6.1: for one control a 1.1:1 fill step is a nit, and for eighty-one cells whose state *is* the game a 1.03:1 step with `edge-width: 0` is unplayable, so the question was never "is the step enough" but "enough for how many controls". The gap costs no arithmetic on a token and no per-theme branch for the four themes that keep it, and it leaves the cells still reading `edge-width` for whatever edge the theme does want on top. A sixth theme is ruled correctly without knowing the technique exists, which is D10 holding. **Amended by D20 in two places.** The technique holds; the *colour* in the gap was wrong, because `edge-dark` is a bevel's shadowed half and a theme may make it as subtle as its own controls are. And "no thirteenth token" was decided one browser run too early: this row's own measurements are of a board ruled at 1.15:1 under Win11, which the next run had reported back within the day. |
| D19 | **`meta.defaultSize` and `meta.minSize` are the app's *content* size, not its window size**, and the host adds the active theme's chrome — flooring the result at what the chrome itself needs | A **semantic change to two fields that already existed**, found the first time this contract met a browser, and made now because the alternative is making it after the contract ships. A window size obliges the app to subtract chrome it cannot measure: each theme's titlebar is its own height, Win98's frame ring is `border-box` padding at the bottom as well as the top, and its client area is a sunken well inside that — none of it readable from another package, and all of it already published to the host as theme `metrics`. So the first consumer did what any author would and guessed: `TITLEBAR_ALLOWANCE_PX = 44`, "the tallest of the five", plus an `EDGE_SLACK_PX = 8` for the bevels. It came out 32px short under Windows 98, where the app's last row landed on the bottom bevel, and the same guess is wrong differently under every theme a sixth one would add. The floor is the other half and the same defect from the other side: an app's honestly derived 282px minimum was written into the window frame's inline `min-width`, which beats the chrome's own CSS minimum, and pushed the close button off the titlebar — "an affordance that disappears is a bug, not a style", read from the direction nobody had tested, where the thing removing it is an *app*. So the effective minimum is `max(content minimum + chrome, leading + trailing + grab)` on the width and `max(content minimum + chrome, chrome height)` on the height, all four terms from the active theme. One meaning for both sources, so a curated entry's numbers are content sizes too: its windows open a caption taller than before, and two semantics for one field would have been the worse outcome. Cost: two new `metrics` fields (`chromeWidth`, `chromeHeight`), each derived per theme from the constants its own stylesheet interpolates and each measured against the rendered chrome in that theme's `metrics.test.ts`, which is what stops this becoming the hand-computed literal `leadingControlsWidth` once was. |
| D20 | A **thirteenth app token, `--umbradesktop-app-border`**: the one colour in the group with a guaranteed contrast, 3:1 against all three of its own palette's surfaces | D18 said the group stayed at twelve and the game confirmed it. The next browser run said otherwise, in the same words the user used: *the contrast is way too low*. The gap technique was right and its colour was not — `edge-dark` is a bevel's shadowed half, a theme is entitled to make that as subtle as its own controls are, and Win11's 8% black ruled the board at 1.15:1 in light mode and 1.33:1 in dark. So the board was still one undivided sheet, now with an invisible grid drawn on it. It cannot be fixed by strengthening `edge-dark`, and that is what makes this a token rather than a palette edit: on a dark palette a visible boundary is a *lighter* line than what it separates, so a Win11-dark `edge-dark` strong enough to see would be lighter than `edge-light` and would invert every bevel an app drew from the pair. A separate token also keeps the two jobs honest — a 16% wash is the right hairline between two rows of text and the wrong one around a control — and `app-tokens.test.ts` measures the 3:1 per theme and per variant, WCAG 1.4.11's ratio for the boundary of a component, so a sixth theme cannot repeat this. The same token also replaced `edge-width` as the width of a recessed field's ring in the game: tying a boundary's existence to a bevel's thickness meant the two themes publishing `0px` drew a well with no edge at all. |
| D21 | **A theme branch in an app may change how it looks, never how big it is** | The app-side twin of "a theme may restyle, never remove", and the second half of the same report. Minesweeper switched its grid ruling off under Windows 98 with `gap: 0`, correctly wanting butted bevels — but a `gap` is a term in the content size the manifest declares, that size is one number for all five themes (D19), and so this one theme rendered a board eight pixels smaller in each axis than the window the host had opened for it, leaving a dead band inside the tightest frame of the five. The branch now paints the gap in the face colour instead of removing it: same look, same geometry. What makes this a decision rather than a bug fix is that nothing catches it except measuring under each theme, which no test did — the fit test ran with no theme attribute at all, where every branch is inert — so the rule is written down and the guide's §4 says it beside the branch it applies to. |

| D23 | **An element window draws no reload control**: three titlebar buttons where an iframe window draws four | Reversing the half of D14 that kept the button and renamed it. Two things it did not weigh. For an element body, reload and close-and-reopen are the *same operation* — the element is destroyed and a fresh one constructed either way — so the button's only distinction was keeping the window's rect, which is not worth a permanently destructive control next to Close; where for an iframe it re-fetches a remote document in place and keeps the route inside the frame, which nothing else in the shell can do. And it is not free: four controls are a fixed 185px of titlebar, and a nine-by-nine game asks for a 274px window, so the caption had nowhere to go (D22 is the clipping this caused, and dropping the fourth button is what gives the app's own name room to be read rather than truncated). An app that wants "start over" offers it in its own body, where it can name the thing in its own words — Minesweeper's "New game" — instead of the shell offering a generic Restart it cannot describe. The mechanism goes with the button: `_appInstance` and the `keyed` wrapper in `#renderBody` existed only to serve it, and a key nothing changes is a key. |
| D22 | **The caption yields before a window control does**, and the chrome's published minimum is measured rather than only computed | D19 made the resize floor `max(app content + chrome, leading + trailing + grab)` so an app could not declare a window too small to draw the chrome in, and said in as many words that a close button could no longer be pushed off a titlebar. It could, and was, reported from a browser a second time on the same game. The floor was right and the layout did not honour it: `.title` is a flex item whose `min-width` is `auto`, meaning at least its min-content, and a caption is one unbreakable word as far as min-content is concerned — so the title held the row open at its natural width and the controls went past the frame's right edge. At the 274px window a nine-by-nine board asks for, 37px of the 46px close button was outside the frame; at the chrome's own 265px minimum it is 86px. The fix is three declarations (`min-width: 0` on the title, `overflow`/`text-overflow` on its text, `flex: 0 0 auto` on the controls) and the rule they encode is worth more than the fix: a caption that truncates still reads, a control that is not there does not, so **the caption is the term that absorbs a narrow window**. The lesson about the process is the same one §9 records: every check on this geometry either read a published number or rendered a window big enough that no minimum was in force, which is exactly how a minimum the layout cannot honour stays green for two rounds. `components/window-titlebar.test.ts` renders one at the floor and measures the buttons. |

---

## 3. Architecture

The app catalogue gains a second **source**. Everything downstream of derivation is unchanged,
which is what "source-agnostic" bought us.

```
app-catalogue.context
  │
  ├── SOURCE 1 ── the curated catalogue (unchanged)
  │     catalogue/*.ts → #resolveEntry → ref inference / explicit url + section gate
  │                                     └─> { kind: 'iframe', url }
  │
  ├── SOURCE 2 ── registered manifests (new)
  │     umbExtensionsRegistry, type 'umbraDesktopApp'
  │       conditions evaluated by Umbraco  → no section gate of our own
  │                                     └─> { kind: 'element', element }
  │
  └── deriveApps() ── three passes ──> UmbraDesktopApp[] ──> groupApps() ──> launcher
        1. curated, gate-filtered      (certified)
        2. registered, ungated         (certified — D4)
        3. section fallback            (uncertified)
```

Pass 2 sits before the fallback deliberately: a registered app is a real app, not a guess, so it
should not land beside the uncurated section tiles.

### 3.1 Why registered apps need no gate of their own

A curated entry is gated on its section because the thing behind it *is* a section surface: if the
user cannot reach Log Viewer in the backoffice, a window onto it would only show them an error. A
self-contained app has no such backing surface, so there is nothing to be permitted to.

Availability instead comes from two places already in the stack. Umbraco evaluates the manifest's
`conditions` array, which is the actual mechanism for "is this extension available to this user" and
a strictly better answer than a section gate. And reaching the desktop at all is already gated by
the desktop section's own permission, so "anyone who can open the desktop can play Minesweeper" is
the sensible default rather than a hole.

> **Verified, and this is the answer.** `umbExtensionsRegistry.byType()` returns raw manifests and
> never evaluates `conditions`, so observing through it would have made every registered app
> unconditionally visible while this design claimed the opposite. Condition evaluation lives in
> `UmbBaseExtensionInitializer`, where `permitted` is computed from the manifest's `conditions` and
> *no conditions means permitted*. The public route to condition-evaluated manifests is
> **`UmbExtensionsManifestInitializer`**, exported from `@umbraco-cms/backoffice/extension-api`, and
> it is what shipped: it hands back only the permitted manifests and re-fires whenever a condition
> flips. See
> [`app-catalogue.context.ts`](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/app-catalogue.context.ts),
> and the two cases in its test file that hold it (a manifest with an unsatisfiable condition never
> appears; one with an empty `conditions` array does).
>
> One test-environment consequence, recorded because it will otherwise cost the next person an hour:
> the initializer coalesces its notifications through `requestAnimationFrame`, and web-test-runner's
> page is backgrounded, so it never gets a frame and the callback never fires. Any test observing an
> extension type through an initializer has to patch `requestAnimationFrame` **and**
> `cancelAnimationFrame`, since the initializer's teardown calls the real one with the fake handles.

---

## 4. The app manifest contract

```ts
{
  type: 'umbraDesktopApp',
  alias: 'UmbraDesktop.Entertainment.Minesweeper',
  name: 'Minesweeper',                        // developer-facing
  element: () => import('./minesweeper.element.js'),
  weight: 10,
  meta: {
    label: '#umbraDesktopEntertainment_minesweeper',  // localisation token
    icon: 'icon-bomb',                        // native icon-* only
    group: 'games',
    defaultSize: { w: 360, h: 460 },          // the app's *content* box — D19
    minSize: { w: 320, h: 400 },              // ditto; the host floors it at what its chrome needs
    allowMultiple: true,
  },
  conditions: [],
}
```

What is *absent* is the design (D2). There is no `url`, no `section`, no `chromeProfile`, because
none of them mean anything for an element in a box, and their absence is what keeps the §1.1
boundary structural rather than advisory.

`label` and `icon` follow the existing conventions exactly: localisation tokens for names, native
`icon-*` aliases only, `icon-box` as the fallback. The registering package ships its own
localisation manifests, so game names translate without touching this repository.

**`defaultSize` and `minSize` are the app's own box, and the host adds the chrome** (D19). This is a
change of meaning to two fields that were originally window sizes, made after the first consumer
shipped and before the contract did, because an app cannot do the arithmetic a window size demands
of it: the titlebar's height is the active theme's, Windows 98 spends a frame ring below the body as
well as above it and a sunken well inside that, and none of it is readable from another package. The
themes already publish what their chrome costs as `metrics.chromeWidth` / `metrics.chromeHeight`,
and `window-chrome.ts` is the whole of the arithmetic:

```
window       = content + chrome
window min   = max(content min + chrome, chrome's own minimum)
chrome's min = { w: leading + trailing + grab, h: chrome height }
```

The floor is not a courtesy. An app's minimum is written into the window frame's inline
`min-width`, which beats the frame's own CSS minimum, so before it existed a game asking for 282px
got a titlebar too narrow to hold its own close button. An app may ask for a small box; it may not
remove one of the desktop's affordances.

`allowMultiple` is left at its default here, which allows a second window. Minesweeper shipped
`false` and it was wrong: §7 said "games will generally set it false", which is an opinion about a
game rather than about the shell, and every other app on the desktop opens as many windows as the
user asks for. A game with no state outside its own element has nothing to protect by refusing.

---

## 5. Content kinds

`UmbraDesktopApp.url` is today a required string. It becomes:

```ts
export type UmbraDesktopAppContent =
  | { kind: 'iframe'; url: string }
  | { kind: 'element'; element: ElementLoaderProperty };
```

`ElementLoaderProperty` is Umbraco's own type, carried unchanged rather than narrowed to the
`() => Promise<unknown>` this section first wrote, which is D15 and was found by review after the
narrow version had shipped: it silently dropped a module path string, the only form a static
`umbraco-package.json` can express, and it mis-accepted a class constructor. Nothing here resolves
the union either; `loadManifestElement` does.

This is the largest change in the design and the only one that touches existing behaviour. Sites to
update: `types.ts`, both passes of `derive-apps.ts`, and in `window.element.ts` the render body,
`#onReload`, `#onIframeLoad`, `#frameDocument` and `#applyFrameTheme` (the last two become
iframe-only by construction).

For an element window the body is one mounted custom element and the surrounding machinery falls
away (D6). Worth stating plainly because it inverts the usual expectation: adding this kind removes
per-window complexity rather than adding it. No shadow-root walk waiting for a backoffice header to
strip, no loading overlay hiding a boot, no stylesheet mirroring across a document boundary, and no
`location.reload()` with a cross-origin fallback, and — since D23 — no reload control at all.

---

## 6. Theming for apps

Two layers, and an app opts into each independently. The first is free and already works; the second
is one line in the host.

### 6.1 The app token group

An app inside a window's shadow root already inherits every `--umbradesktop-*` custom property
(D7), so the mechanism needs nothing. What is missing is anything worth reading: of the 53 tokens in
`UMBRADESKTOP_TOKENS`, 52 describe chrome, and only `--umbradesktop-window-body-background` is of
any use to an app.

The proposed group, to be added to every theme:

| Token | Purpose |
|---|---|
| `--umbradesktop-app-surface` | The app's own panel ground, distinct from the window body behind it |
| `--umbradesktop-app-surface-raised` | A control face: a Minesweeper cell, a calculator key |
| `--umbradesktop-app-surface-sunken` | A recessed field: the minefield well, a numeric display |
| `--umbradesktop-app-edge-light` | The light edge of a bevel, or a top border |
| `--umbradesktop-app-edge-dark` | The dark edge |
| `--umbradesktop-app-edge-width` | Bevel thickness: wide enough to chisel an edge on a theme whose controls are bevelled, down to zero on one whose controls are flat |
| `--umbradesktop-app-radius` | Corner rounding: zero on a theme whose controls are square-cornered, non-zero on one whose controls are rounded |
| `--umbradesktop-app-text` | Primary text |
| `--umbradesktop-app-text-muted` | Secondary text |
| `--umbradesktop-app-accent` | Selection and focus |
| `--umbradesktop-app-accent-text` | Text and icons on an `accent` fill. A theme sets whichever of light or dark actually reads on its own accent |
| `--umbradesktop-app-font` | The theme's UI font stack |

Those first two rows named values when this was written — `2px`/`0` on Win98, `6px` on macOS and
Win11 — and the prediction was already wrong by the time the palettes landed: Win11 ships `4px`. The
rows describe the *shape* contrast instead, since a design doc that states a number the shipped code
contradicts is worse than one that states none.

The pair that does the real work is `edge-width` and `radius`. One app stylesheet, written once, is a
bevelled control at a non-zero width with no rounding, and a flat rounded one at zero width with a
rounding, with no branch anywhere in the app. That is the mechanism behind "correct under a theme it
has never heard of" (§1.2), and the reason the group is worth designing rather than growing by
accident. `accent-text` was added for the same reason once the values existed: no single text colour
reads on every theme's accent (white is 16:1 on Win98's navy and 2.52:1 on Umbraco 4's selection
blue, and Win11 flips direction between its own two variants), so the alternative was the per-theme
branch in the app that this group exists to prevent.

The three `surface` tokens may carry any valid `background` value, a gradient included, so an app
writes `background: var(--umbradesktop-app-surface)` and never `background-color:`. Two of the five
themes are gradient-based, and `background-color` would drop such a value entirely.

Deliberately absent: anything semantic to a particular app. No mine colour, no flag red. An app owns
its own domain palette; the theme owns the surface it sits on.

**App tokens have no host-side fallbacks, and cannot have.** This was found while implementing and
is the one place the chrome contract does not carry over. A chrome token's fallback lives in the CSS
of the component that reads it, which is exactly what lets the Umbraco identity theme ship
`palettes: { light: {} }` and still render today's look. An app token's reader is in another package,
so there is nowhere in the host to put its fallback, and putting one anywhere reachable would be
worse than useless: a host component declaring `--umbradesktop-app-surface` on a descendant of
`.desktop` would **beat** the theme palette it inherits and make the token unthemeable.

So the fallback chain is documented contract, and it lives in the host as **type-checked data**
rather than prose: `UMBRADESKTOP_APP_TOKEN_FALLBACKS` in
[`theme/types.ts`](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/types.ts),
declared `satisfies Record<UmbraDesktopAppToken, string>` so a missing or extra key is a compile
error, with `app-tokens.test.ts` asserting the same at runtime because the test runner does not
type-check. Each app writes those values itself:
`var(--umbradesktop-app-surface, var(--uui-color-surface))`, exactly as the chrome does it. **The
documented fallback set is the Umbraco look**, which is the other half of why the identity theme's
palette can be empty: the chrome side is empty because each component already carries the Umbraco
fallback, and the app side is empty because every app already carries this one.

Which corrects what this section used to say. **Not every theme answers all of them: the identity
theme answers none, on purpose.** Every theme that paints a palette of its own answers all thirteen,
never a subset, since a theme answering the chrome group but only part of the app group would render
a correct desktop around an app painted half in its colours and half in Umbraco's. `app-tokens.test.ts`
enforces exactly that, and exempts the identity theme by id rather than by "is the palette empty",
so the day that theme sets one chrome token it does not silently start demanding thirteen app tokens
from the one theme that must answer none.

Two documents follow from this, one per audience, and each is the place to go from here.
[`docs/theming.md`](../theming.md) §3 is the theme author's: what the two lists are, why they are
checked differently, and that a palette must answer the app group in full or not at all.
[`docs/desktop-apps.md`](../desktop-apps.md) §4 is the app author's: the same thirteen tokens with the
fallback to write beside each one, and the three guarantees an app may rely on.

**Answered: how a raised control gets a boundary on the flat themes.** This was left open because
the question is not one hex codes answer, and it went to the §9 browser checkpoint to be judged
against a real app. It has been. Minesweeper is the honest test for the reason this section
predicted, being nothing but raised control faces edge to edge, and it was measured in a browser
under all five themes:

| Theme | closed cell vs app ground | closed vs revealed |
|---|---|---|
| Umbraco (the fallbacks) | 1.00:1 | 1.07:1 |
| Windows 98 | 1.00 (the bevel carries it) | 1.82:1 |
| macOS | 1.09:1 | 1.22:1 |
| Windows 11 | 1.07:1 | 1.03:1 |

**The finding is that the answer depends on how many controls there are, which is why hex codes
could not settle it.** For a single control a 1.1:1 fill step is a nit: a calculator key at that
step, with a soft shadow or none, reads as a key because it is where a key goes and there is nothing
next to it to confuse it with. For a grid of eighty-one, *is this one still closed?* is not a
cosmetic question, it is the game, and `edge-width: 0` with a 1.03:1 step between the two states
makes it unanswerable. So the concern this section raised is real in practice, and a grid is the
place it shows. Neither of the two candidates above is what fixed it.

**The app-side answer is the grid `gap`, and it is now the worked example in
[`docs/desktop-apps.md`](../desktop-apps.md) §4.** The grid's own background shows through a 1px
`gap`, so the board is ruled under every theme. It needs no arithmetic on a token and no per-theme
branch for the four themes that keep the gap, which is the property that makes it the answer rather
than a workaround: a sixth theme is ruled correctly without knowing this exists. What it explicitly
is **not** is `max(1px, var(--umbradesktop-app-edge-width))`, which was the first thing the game
tried and which failed in a way worth recording separately (D17): four palettes published a unitless
`0`, which is invalid inside a math function, and the whole `border` shorthand was dropped silently.

**Two corrections to that paragraph, both from the next browser run** (D20, D21), because it shipped
as written and came straight back. The gap was ruled in `--umbradesktop-app-edge-dark`, which is a
bevel's shadowed half and which Win11 publishes as 8% black: the ruling measured 1.15:1 against a
cell in light mode and 1.33:1 in dark, so the board was still one sheet with an invisible grid on
it. It is now `--umbradesktop-app-border`, the thirteenth token, which is the one colour in the
group with a guaranteed 3:1 against all three surfaces. And the `win98` branch said `gap: 0`, which
removed a term from the content size the manifest declares and made that one theme's window eight
pixels too big in each axis; it now paints the gap in the face colour instead, which is the same
look with the geometry left alone.

Two host-side fixes came out of the same measurement, and one deferral:

- The `Umbraco` row's 1.00:1 was a defect in `UMBRADESKTOP_APP_TOKEN_FALLBACKS`, not a thin step:
  `surface` and `surface-raised` were both `var(--uui-color-surface)`, so under the identity theme,
  whose values *are* the fallbacks, a control face and the panel behind it were one colour separated
  by a 1.43:1 hairline. `surface-raised` is now `var(--uui-color-surface-emphasis)`, the only member
  of Umbraco's surface family that differs from `--uui-color-surface` in all three of its themes.
  That moves the row to 1.04:1, which is a different number and the same problem, and is the point:
  making the three surfaces three values is a floor under the contract's own coherence, not a
  boundary. Umbraco publishes no surface trio wider than 1.07:1, so no fallback set can supply one
  and still be the Umbraco look. `app-tokens.test.ts` now asserts the three are distinct.
- The unit rule of D17, with a test.
- ~~**Windows 11's 1.03:1 closed-versus-revealed step is a host palette fix, deferred.**~~
  **Closed, and it was not survivable after all.** It was deferred on the grounds that the board is
  ruled and doing the palette badly costs more than 1.03:1 does. The ruling was 1.15:1 (D20), so the
  board was not in fact ruled, and the next browser run reported the theme in both variants before
  this deferral was a week old. The judgement being deferred is also the one thing hex codes *could*
  have settled, and the reasoning that looked correct is where it went wrong: a light-mode Win11
  well being lighter than its ground is authentic, and it makes the recess the **brightest** plane
  in the palette, so a control standing in one has nowhere lighter to go. In light mode there is
  nothing above `#ffffff`; the app could not have worked around it at any effort. So the face takes
  the white (`#ffffff`) and the well takes a grey from Win11's own track family (`#e6e6e6`), which
  is the one recess this design language does draw darker than its ground, and the dark variant's
  card fill moves from `#2b2b2b` to `#3a3a3a`. That is 1.25:1 and 1.50:1 of fill, under a ruling
  that is now 3.9:1 and 3.3:1. The lesson worth keeping is not about Win11: **a deferral whose
  premise is another number in the same table needs that number checked first.**
- **Open: Umbraco 4 has the same defect, and it is the theme owner's call.** Found by rendering the
  board under all five palettes rather than by a report, in the round that closed Win11's. `#fbfaf7`
  in a `#ffffff` well is 1.03:1, so a revealed blank cell is indistinguishable from a closed one —
  the grid reads, since `border` is `U4_EDGE_STRONG` there, but the two *states* do not. The shape
  of the fix is Win11's: the well takes `U4_FACE_DIM` (`#ddd9d0`) instead of white, and `border`
  then has to go darker than `#8f8a80`, which manages only 2.44:1 on that grey. It is left open
  rather than done because it is two values and it changes how every app's recessed field looks
  under that theme, which is a judgement about v4's look and not about this contract. Recorded here
  so it is not rediscovered: the row in §6.1's table reading 1.03:1 for Windows 11 read the same for
  Umbraco 4 all along, and nobody looked. The identity theme's 1.04:1 is the same pair again and is
  the one instance that cannot be fixed — Umbraco publishes no surface trio wider than 1.07:1, so no
  fallback set can supply one and still be the Umbraco look.

### 6.2 Branching on the theme, for apps that care

Tokens say what colour to be. They do not say *you are Win98 now, draw two-pixel bevels rather than
a border radius* in cases where the difference is structural rather than a value. For that the app
needs the theme's identity, so it is stamped on the app's own element as `data-umbradesktop-theme`
(D9), and this is the selector an app writes:

```css
:host([data-umbradesktop-theme='win98']) .cell { /* hand-tuned bevels */ }
```

That example is the whole promise of this section, and it is worth being precise about the mechanism
because getting it wrong made the example unreadable once mid-build: the attribute shipped on the
app element's *parent*, where `:host` can never see it and where the only selector that could,
`:host-context`, is the one D9 rejects for never having shipped in Firefox. So it went unnoticed by
every test asserting the attribute's final state, and every worked example above would have silently
matched nothing.

Three facts about the stamp, all now pinned by node identity in `window-body.test.ts` rather than
inferred:

- **It lands on the app's own element**, forwarded there by `umbradesktop-app-host`, which keeps a
  copy on itself as well for an app that renders into light DOM and so has no `:host` to write.
- **Before the app's first render**, while the element is still detached, so an app that branches
  paints correctly the first time instead of painting unstyled and correcting itself a frame later.
- **A theme change rewrites it in place and never remounts**, because a remount is how a game loses
  its board. Only a change of `element` identity remounts. And a theme that stops being in force has
  the attribute *removed* rather than left stale, since an app can detect a missing attribute and
  cannot detect an out-of-date one.

Opt-in by construction: an app that never writes that selector never learns the attribute exists.
Win98 Minesweeper earns the hand-tuning because it is the one everybody will recognise; every other
combination is correct from tokens alone, and a sixth theme breaks nothing (D10). The app author's
version of all of this is [`docs/desktop-apps.md`](../desktop-apps.md) §5.

### 6.3 What this does to `tokens.test.ts`

Adding app tokens to `UMBRADESKTOP_TOKENS` would fail that test, and the test would be right: it
asserts the list is exactly what the four chrome components read or write, precisely so a token no
component reads cannot sit there as dead weight. App tokens have no host reader **by design**.

Hence the second list (D8), with its own rule. `UMBRADESKTOP_TOKENS` stays "exactly what the chrome
reads"; `UMBRADESKTOP_APP_TOKENS` is "a published contract with no local reader", checked instead
against the themes (§9) so a theme that forgets one is still caught. Recording this here because
whoever adds the first app token will otherwise spend an hour deciding the test is wrong.

---

## 7. Placement and behaviour

Registered apps reuse everything the launcher and taskbar already do. Tiles, search, pinning, the
window manager and its z-order all key off `alias`, which a registered app has like any other.

The host reserves a `games` group in `catalogue/groups.ts` with a localised label (D5), and a
registered app naming an unknown group falls into "More". The `games` group is a curated label in
the host, not a list of games, so adding Solitaire touches only the entertainment package.

`allowMultiple` behaves as it does today. ~~Games will generally set it false: two Minesweeper
windows is a novelty, not a feature.~~ **Reversed once a game shipped it** (D19's last paragraph):
that is an opinion about a game rather than about the shell, and it made Minesweeper the one tile on
the desktop that silently refocuses the window you already had while every curated app opens as
many as you like. A game whose state lives entirely in its own element has nothing to protect by
saying no, so the default — allowed — is what a game should use too, and the field stays for the app
that genuinely cannot run twice.

Window **sizing** is not "as it does today" either, and it is the one place a registered app's
window differs from a curated one in kind rather than in numbers: `defaultSize` and `minSize` are
the app's content box and the host adds the theme's chrome (D19, §4). It applies to a curated
entry's sizes as well, deliberately — one field, one meaning — so those windows open a caption
taller than they used to.

---

## 8. The entertainment package

A second project, `src/Umbraco.Community.UmbraDesktop.Entertainment/`, built the same way as the first:
Razor SDK, static assets under `App_Plugins`, a Vite-built bundle, its own
`umbraco-package.json` stamped at build time by the same MSBuild target.

### 8.1 Why "Entertainment", and what it excludes

The name is a Windows 98 quotation, not a category invented here. Media Player, CD Player and Sound
Recorder lived in **Start > Programs > Accessories > Entertainment**, and Games was its sibling
folder under the same Accessories parent. So Entertainment is period-correct vocabulary, it reads as
"the fun drawer" to anyone who never saw that menu, and games sit under it comfortably even though
Windows filed them next door.

"Multimedia" was the first choice and was dropped: it points at audio and video, which is precisely
what games are not, and games are what ships first.

**The package is Entertainment; the launcher group is Games.** Deliberately not the same word. The
package is a delivery vehicle, and a media player added later should not land under a heading that
says "Games". So the group alias stays `games` (D5), the package name says nothing about which
groups its apps land in, and a media player simply names a different group.

The name does draw one real boundary, worth writing down before someone tests it: **a tool is not
entertainment.** A calculator, a notepad or a colour picker would be lying under this package id,
however tempting the empty project is. Windows filed those under Accessories, a level up. If the
desktop wants them, they want their own package, and this one stays honest.

### 8.2 The two games, and why they are not the same size

Issue #8 asks for Minesweeper and Solitaire, and both are in the first release. They are not
comparable pieces of work, so the plan should not treat them as a pair.

**Minesweeper is the contract validator.** A grid, a flood fill, three colours of bevel. It reads
almost nothing but the app tokens (§6.1), which is exactly what makes it the right first consumer:
if the token group is insufficient, Minesweeper is where that shows up cheaply. Build it first,
promote the token group on the strength of it, then build the other one.

**Solitaire is several times the work, and most of it is not the game.** The rules are trivial; what
is not trivial is that it needs **52 card faces plus backs**, and that decision is its own. Inline
SVG scales and themes but is 52 sets of paths to draw or find. A sprite sheet is how the original
did it and gives that look exactly, at a fixed resolution and with the licensing question attached
to whatever deck art it came from. Unicode playing cards render at the mercy of the user's fonts.
None of these is obviously right, and none of them should be picked halfway through building the
game. **This design does not settle it**; it names it as the first decision in the Solitaire plan,
because it determines the game's whole rendering approach and, less obviously, whether cards
participate in theming at all.

Solitaire is also the first app to need **real pointer interaction inside the window body**, which
is worth checking rather than assuming. The window's own drag and resize use `setPointerCapture` on
the titlebar and the resize handles, never on the body, so a game dragging inside the body does not
contend with them. The one behaviour to leave alone is the `focus-catcher` overlay an inactive window
renders: it swallows the first pointerdown to focus the window instead of passing it through. On a
card table that is correct, the same as every real OS, and someone will eventually mistake it for a
bug.

### 8.3 Versioning: lockstep on one tag (D13)

- **No `MinVerTagPrefix` of its own.** Both projects build from `v*` and therefore carry the same
  version. There is no second prefix to configure and no second release job.
- **Both publish on every release**, changed or not. Publishing only what changed would leave gaps
  in Entertainment's version history, and a missing 17.3.0 reads like a broken pipeline where a
  17.3.0 with no changes reads like Umbraco.
- **The dependency on the host is a range** (`[17.0.0,18.0.0)`), never the exact version a
  `ProjectReference` packs. This is the one place lockstep must not leak into the metadata: an exact
  pin would force an Entertainment publish for every host release and would break anyone who
  upgraded the host between add-on releases.
- **Its own Marketplace listing**, as `umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json`
  beside the existing file. The Marketplace resolves multiple packages from one repository root by
  package-id suffix, and GitHub roots are explicitly supported
  ([Listing Your Package](https://docs.umbraco.com/umbraco-dxp/marketplace/listing-your-package)).
  Verify the listing appears before assuming the unsuffixed file still serves the host package; if
  it does not, both files get suffixed.

The packaging plumbing is duplicated once, maybe fifty lines of MSBuild copied from a project that
already works, and the release plumbing is not duplicated at all.

---

## 9. Testing

Repo convention: write the failing test, watch it fail. Both `npm run build` and `npm test`, since
neither subsumes the other.

- **`derive-apps`** — registered manifests become apps with no section gate; a registered app naming
  an unknown group lands in "More"; pass ordering puts registered apps ahead of the section
  fallback; an app whose conditions exclude it never appears.
- **The content discriminator** — an iframe-kind window renders an iframe and injects chrome; an
  element-kind window renders the element and injects nothing. The negative half matters more than
  the positive: chrome injection against a game would poll for ten seconds and find nothing.
- **App tokens** — every theme answers every entry in `UMBRADESKTOP_APP_TOKENS`, or declares the
  omission. This replaces the coverage `tokens.test.ts` gives the chrome group, which cannot apply
  here (§6.3).
- **App token contrast** — every theme's `text` on all three surfaces, `text-muted` on `surface`, and
  `accent-text` on `accent`, at WCAG AA's 4.5:1, per variant, accumulated so one run reports every
  failure. This is machine-checked because a human reading hex codes in a diff is what caught the
  three that shipped, and that does not scale to a sixth theme.
- **Browser checkpoint** — Minesweeper under all five themes, then Solitaire under all five. The
  first has now run, and it carried §6.1's open question: whether a raised control reads as raised on
  the flat themes on a fill step of 1.03:1 to 1.20:1. The measurements and the answer are in §6.1
  (D18): for one control the step is a nit, for a grid it is not, and the fix is the grid's own
  ground through a 1px `gap` rather than either candidate this doc proposed. It also found the two
  contract-data defects behind D17 and one deferred Win11 palette step, so it did what it was for.
  That promoted the token group from provisional (§1) to settled (§8.2) at twelve tokens: the run
  needed no thirteenth. Solitaire is the harder check still outstanding, because a card table
  exercises surfaces the token group was not designed against.
- **The second browser run, and what it says about the first.** The same game, driven by a person
  rather than by its own tests, in the light and dark Win11 variants and under Win98. It found four
  window-geometry bugs (D19), then, once those were fixed, the two in D20 and D21 — so "settled at
  twelve tokens" lasted exactly one run, and the deferred Win11 step in §6.1 turned out to be the
  reported bug rather than a nit. The pattern in both rounds is the same and is worth more than
  either finding: **every defect in this contract has been found by looking at it, and none by the
  test suite that grew around it.** The suite is what keeps them fixed. It is not what finds them,
  and a third game is still the way to learn what a card table needs.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| ~~`byType` does not evaluate `conditions`, quietly making every registered app unconditionally visible~~ | **Closed.** Answered in §3 before the observation was written: it does not, so the implementation observes through `UmbExtensionsManifestInitializer`, which does. Held by two tests |
| The app token group turns out too thin once a real game is built against it | Minesweeper is built against all five themes *before* the list is called stable (§9). The group is additive, so being wrong is cheap; being wrong publicly is not |
| A third-party app hardcodes its colours and looks foreign under four themes | Documented, and ultimately the author's call. The §1.1 boundary contains the damage to that app's own window |
| The `url` → `content` refactor changes existing iframe window behaviour | Every current app is iframe-kind, so the existing window tests are the regression suite. Exhaustive switch means the compiler finds the sites, not review |
| `certified` comes to mean "we vouch for this" once third parties register apps | The tier is unread by any component today (D4). If it is ever surfaced, it needs a third value first, and that is the moment to add one |
| Lockstep publishes Entertainment releases that changed nothing, and users see update prompts for them | Accepted (D13), and the same trade Umbraco makes across its own package set. The alternative costs a compatibility matrix |
| Someone later wants Entertainment on its own cadence after all, and lockstep has to be undone | Cheap in this direction: adding a `MinVerTagPrefix` and a second release job is the D11 setup, still written above. The expensive direction would have been starting split and merging back |

---

## 11. Out of scope

- **Third-party catalogue entries pointing at backoffice surfaces.** D1, and the one line in this
  design that is hard to move later: loosening it is easy, tightening it would break packages.
- **Surfacing the confidence tier in the launcher.** `uncertified` is a field nothing reads. Making
  it visible is a launcher design question of its own, and this design does not depend on it.
- **App storage beyond `localStorage`.** High scores in `localStorage` are per-browser and that is
  fine for a game. Anything server-side means a C# surface in the entertainment package, which is a
  different design.
- **Vendoring existing games.** D12. If it ever becomes attractive, the iframe kind already exists
  and would need only a chrome-injection bypass and the palette written into the frame document.
- **A games launcher, scores UI or cross-game shell.** Each game is one app, registered on its own
  and opening in its own window. With two games shipping together the temptation to build a shared
  frame around them is real and should be resisted: sharing a module between them inside the package
  is ordinary code reuse, but a shell they both live in would make them one app wearing two names.
- **The Solitaire card deck.** Named as the first decision of the Solitaire plan (§8.2), deliberately
  not settled here. It governs that game's rendering and whether cards theme at all, and it deserves
  its own short design rather than a paragraph in this one.
- **Fixed-size app windows.** Raised the moment D23 dropped the reload button, because the next
  question is obvious: maximizing Minesweeper is useless, so should an app be able to say so? Not
  yet, and when it comes it should be **`meta.resizable: false` and not `maximizable: false`**. One
  flag saying "this app's window has one size" is a concept every desktop OS already has, and it
  answers both halves — the shell drops the maximize button *and* the resize handles, and a
  titlebar double-click does nothing. Dropping only the button is the worst version available: the
  window can still be dragged to a size the app cannot fill, which is the empty space around a
  centred board arrived at by another route.

  Deferred for two reasons rather than one. Nothing is broken — the caption fits with three
  controls (D23) and maximize is harmless now that an oversized window centres the app's content
  rather than pinning it to a corner — and Minesweeper's own future is undecided: a board that
  scaled with its window would make maximize genuinely useful, so a flag set today would encode
  *"not responsive yet"* into a published manifest contract, where the next reader takes it for a
  fact about the app rather than a to-do. **The trigger is a second app that wants it**, since one
  app is a preference and two is a shape — and the second one will likely want it for a different
  reason (a calculator is fixed-size because a keypad has a natural size, not because nobody has
  made it responsive), which is the information that says whether `resizable` is even the right
  name.
