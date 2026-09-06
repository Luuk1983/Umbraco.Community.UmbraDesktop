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
| D6 | Element windows have **no chrome injector, no loading state, no theme sync, no reload-in-place** | All four exist to manage a booting second backoffice. For these windows the feature is subtraction: reload means recreate the element, and the body is painted the moment it is mounted. |
| D7 | Apps are themed by **inheritance**, not by a channel | The palette is already an inline style on `.desktop` ([desktop.element.ts:136](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/components/desktop.element.ts)), custom properties are inherited, and inheritance crosses shadow boundaries. An element in a window's shadow root already sees every token. Nothing to build. |
| D8 | App tokens live in a **separate `UMBRADESKTOP_APP_TOKENS` list** | `tokens.test.ts` asserts `UMBRADESKTOP_TOKENS` is *exactly* what the four chrome components read or write, to catch dead entries. App tokens have no host reader **by design** and would read as drift. Two lists, two rules. |
| D9 | The active theme id is **stamped on the app element** as `data-umbradesktop-theme` | Lets an app branch per theme with `:host([data-umbradesktop-theme='win98'])`. The ancestor-selector alternative, `:host-context`, has never shipped in Firefox. |
| D10 | Per-theme refinement is **optional polish**; the tokens are the guarantee | §1.2. An app that reads only tokens is correct everywhere forever; an app that also branches is pretty in the themes it bothered with. The fallback must be correct on its own, not a compromise. |
| D11 | Games ship in a separate `.Entertainment` package in this repository, ~~`MinVerTagPrefix=entertainment-v` and an independent release cadence~~ → **on the desktop's own `v*` tag, in lockstep** | *Reversed before any code was written — see D13.* The separate package stands; only its versioning changed. |
| D12 | Games are **written, not vendored** | The minesweeper that prompted this is GPLv3 against an MIT package. A minesweeper is a couple of hundred lines, so the licensing conversation is more expensive than the code. |
| D13 | **Lockstep versions on one tag** — both packages build from `v*`, both publish every release, the dependency stays a **range** — reversing D11 | D11 assumed release independence was worth paying for. Nothing buys it: the only thing Entertainment depends on is the host, so nothing outside this repository can force it onto its own schedule. That is the test, and it is what separates this from the Advanced Permissions AI add-on, which *is* in its own repo because AI SDKs and model deprecations move without asking. Lockstep also pays for itself three ways: one tag means one GitHub release rather than two prefixes interleaved in a flat list; the contract (§4, §6.1) can change on both sides in a single commit during exactly the period it is least stable; and matching versions *become* the compatibility answer instead of a matrix somebody has to maintain. The cost is changelog entries that say nothing, which is what `Umbraco.Cms.Api.Delivery` does every release. |

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

> **Verify before building.** `umbExtensionsRegistry.byType()` returns raw manifests and does not
> evaluate conditions; condition evaluation lives in the extension-api controllers
> (`extensions-manifest-initializer.controller`). Confirm which of those is publicly exported in the
> pinned Umbraco version before writing the observation, because "conditions are honoured" is a
> claim this design makes and `byType` alone would not deliver it.

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
    defaultSize: { w: 360, h: 460 },
    minSize: { w: 320, h: 400 },
    allowMultiple: false,
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

---

## 5. Content kinds

`UmbraDesktopApp.url` is today a required string. It becomes:

```ts
export type UmbraDesktopAppContent =
  | { kind: 'iframe'; url: string }
  | { kind: 'element'; element: () => Promise<unknown> };
```

This is the largest change in the design and the only one that touches existing behaviour. Sites to
update: `types.ts`, both passes of `derive-apps.ts`, and in `window.element.ts` the render body,
`#onReload`, `#onIframeLoad`, `#frameDocument` and `#applyFrameTheme` (the last two become
iframe-only by construction).

For an element window the body is one mounted custom element and the surrounding machinery falls
away (D6). Worth stating plainly because it inverts the usual expectation: adding this kind removes
per-window complexity rather than adding it. No shadow-root walk waiting for a backoffice header to
strip, no loading overlay hiding a boot, no stylesheet mirroring across a document boundary, and no
`location.reload()` with a cross-origin fallback. Reload recreates the element, which for a game is
exactly "new game".

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

Every theme answers all of them, per the existing contract: a palette is `Partial`, each token has a
fallback in the component that reads it, and a theme sets only what it changes. Here the "component
that reads it" is in another package, which is why the fallbacks must be written down as part of the
contract rather than left implicit in whichever app happens to be first.

**Open: how a raised control gets a boundary on the flat themes.** Text contrast is now an enforced
invariant, asserted per theme and variant in `app-tokens.test.ts` at WCAG AA's 4.5:1. A control's
*boundary* is not, and the fill step between `surface-raised` and `surface` is thin everywhere:
1.07:1 on Win11 light, 1.15:1 on Win11 dark, 1.09:1 on macOS light, 1.20:1 on macOS dark, 1.03:1 on
Umbraco 4. WCAG 1.4.11 asks 3:1 of a control boundary, so no theme's fill step carries one alone, and
macOS light was 1.00:1, literally white on white, until the surfaces were separated.

What each theme has left to lean on differs, which is why this is one open question and not five.
Win98 chisels a two-tone bevel at `edge-width: 2px`. Umbraco 4 draws a 1px hairline, though at
`U4_EDGE` on its own surface that measures 2.68:1 and so is itself under 1.4.11. **macOS and Win11
are the sharp cases**: both ship `edge-width: 0`, so the fill step is genuinely all they have, and an
app drawing a control as `background: var(--app-surface-raised); border: var(--app-edge-width) solid
var(--app-edge-dark)` renders no border at all under them.

Two candidate answers, and picking between them from hex values is precisely the mistake:

- Strengthen `edge-dark` and give the flat themes a non-zero `edge-width`, accepting a hairline where
  the real OS draws none.
- Add an elevation or shadow channel the group does not currently have, which is how macOS and
  Windows 11 actually separate a control face from its ground.

Deliberately **not** decided here. A hairline that reads as a crisp 1px rule at one zoom level is a
grey smudge at another, and whether a 1.20:1 fill step plus a soft shadow reads as a raised control is
not a question hex codes answer. This goes to the §9 browser checkpoint, judged against a real app —
Minesweeper's grid is the honest test, since it is nothing but raised control faces edge to edge.

### 6.2 Branching on the theme, for apps that care

Tokens say what colour to be. They do not say *you are Win98 now, draw two-pixel bevels rather than
a border radius* in cases where the difference is structural rather than a value. For that the app
needs the theme's identity, so the window stamps it on the app element as it mounts (D9):

```css
:host([data-umbradesktop-theme='win98']) .cell { /* hand-tuned bevels */ }
```

Opt-in by construction: an app that never writes that selector never learns the attribute exists.
Win98 Minesweeper earns the hand-tuning because it is the one everybody will recognise; every other
combination is correct from tokens alone, and a sixth theme breaks nothing (D10).

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

`allowMultiple` behaves as it does today. Games will generally set it false: two Minesweeper windows
is a novelty, not a feature.

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
- **Browser checkpoint** — Minesweeper under all five themes, then Solitaire under all five. Carries
  the open question from §6.1: whether a raised control reads as raised on the flat themes on a fill
  step of 1.03:1 to 1.20:1, and if not, whether the answer is a hairline `edge-width` or an elevation
  token the group does not yet have. The
  first belongs to the entertainment plan and is what promotes the token group from provisional (§1)
  to settled (§8.2); a token it turns out to need is a host minor, not a redesign. The second is the
  harder check, because a card table exercises surfaces the token group was not designed against.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| `byType` does not evaluate `conditions`, quietly making every registered app unconditionally visible | Confirmed as an open question in §3, to be answered before the observation is written rather than after |
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
