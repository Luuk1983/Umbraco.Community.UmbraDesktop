# Solitaire: design

> Klondike, the Solitaire everybody pictures, as the third game in the Entertainment package. It
> should look and move like a premium card game: cards that glide, a table in the theme's colours,
> card backs cut from the theme's own wallpaper, and the bouncing-card cascade when you win. Other
> packages can add card backs and card faces of their own.

- **Status:** Built 2026-09-30, refined with the owner 2026-10-01 (corner font, pip alignment, court framing, card backs, easter eggs), verified in a browser. Done
- **Date:** 2026-09-30
- **Branch:** `claude/solitaire-entertainment-package-dbab14`
- **Mock:** [`mockups/2026-09-30-solitaire.html`](./mockups/2026-09-30-solitaire.html). A static
  picture: motion is described here, not shown there. Its court figures are placeholders, see D8
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop.Entertainment`

---

## 1. Goal and scope

Minesweeper and Snake proved that a second package can put an app on the desktop. Solitaire is the
game people actually expect on a desktop, and it is the first one where the look is most of the
point. The bar is "slick": nothing jumps, nothing looks drawn by a programmer.

**In scope:**

- Klondike with Draw 1 and Draw 3, Windows scoring and a timer.
- Smooth card motion, double-click to send home, auto-finish, the win cascade.
- A settings button and modal: draw mode, card back, card faces.
- A table and card backs that follow the theme, with a back that can be overridden.
- Two manifest types so other packages can add card backs and card faces.
- Keeping an unfinished game across a refresh or a sign-out in the same tab.

**Out of scope for this version:**

- Undo. It was offered and not chosen.
- Other games (Spider, FreeCell). The deck, the motion and the cascade are built so a later game
  can reuse them, but nothing here is generalised in advance.
- Vegas scoring, and switches to hide the timer or the score.
- The HQ deck (D9).

## 2. Decisions

### D1. Klondike only, Draw 1 or Draw 3

Seven columns, four foundations, the stock and the waste. The draw mode is a setting (D6), and a
change takes effect at the next deal, so a game in progress is never thrown away. The modal says so
under the control.

### D2. Windows scoring and a timer

Windows Solitaire's standard scoring, including its time penalty, so the score drains while the
player thinks and time counts in every game, won or not. Draw 3 has no recycling penalty here:

| Move | Points |
|---|---|
| Card to a foundation | +10 |
| Waste to a column | +5 |
| Turning a column's face-down card | +5 |
| Foundation back to a column | −15 |
| Recycling the stock, Draw 1 only | −100 |
| Every 10 seconds of play | −2 |

The score does not go below zero. At a win there is a time bonus of `700000 / seconds` when the
game took 30 seconds or more, as in the original. The timer starts at the first move, not at the
deal, and does not run while the game is not on screen for a reason the player did not choose (D10).

The numbers live in one constants file that both the rules and the tests read.

### D3. How cards move

- **Drag** a face-up card, or a run of cards below it. While dragging, the card lifts (a slight
  tilt, a larger shadow) and every legal landing spot glows. An illegal drop glides back.
- **Click** the stock to draw one or three. An empty stock with cards in the waste is clicked to
  recycle.
- **Double-click** a card to send it to its foundation, if it can go there.
- **Auto-finish**: once every card is face up and the stock and waste are empty, a button offers to
  finish. The cards then fly home one by one.

A card cannot move from one foundation to another. It would change nothing on the table, and
since every arrival on a foundation scores +10, allowing it let an ace be moved back and forth
between two empty foundations for unlimited points. Found in review of the rules.

A column's face-down top card turns itself over when it is uncovered, as in Windows, rather than
waiting for a click.

### D4. Motion, and the one technique behind it

Cards are Lit-rendered DOM elements, positioned with CSS transforms. Every move, whatever caused
it, runs through the same step: measure where the cards are, apply the new state so they jump,
then animate each one from its old position to its new one. This is the FLIP technique, and it
means dealing, snapping back, flying home and auto-finish are one code path, not four.

- Durations stay under 400 ms, with a short stagger when several cards move at once, so the game
  never feels slow. Flipping a card is a 3D turn of its own element.
- `prefers-reduced-motion: reduce` makes every move instant. It is read at the moment of each move,
  not once at startup.
- The durations and the stagger are constants, like every number that CSS and script share
  (`CLAUDE.md`, "Derive numbers, never type them").

The win cascade is the one exception: cards bounce off the bottom of the window and leave a trail,
redrawn every frame, which is hundreds of copies. That is a `<canvas>` laid over the table for the
length of the cascade, drawing the same card art as bitmaps. A click or a key ends it early. After
it, a small panel shows score and time with a New game button. With reduced motion the cascade is
skipped and the panel appears at once.

### D5. The window

- `resizable: true`, unlike Minesweeper and Snake: a card table has no fixed pixel size. Cards scale
  with the window's width, between a minimum at which the corner indices stay readable and a
  maximum at which they stop growing. Columns fan down and compress their spacing when a long run
  would overflow the window's height.
- `defaultSize` and `minSize` are derived from the card size and the gaps in a constants file, as
  the other games do, and measured under all five themes.
- `allowMultiple: true`. Every piece of game state is on the element, so two windows are two games.
- Launcher: the Games group, weight 800, after Minesweeper (1000) and Snake (900). Icon: `icon-playing-cards`,
  a native Umbraco icon.

### D6. Settings: a gear in the top-right corner and a modal

The toolbar has New game on the left, score, time and moves in the middle, and a gear button in the
top-right corner, where apps put settings. The gear opens a modal inside the Solitaire window, not
over the whole desktop, since it only concerns this game.

The modal has three parts:

- **Game**: Draw one / Draw three, with the note that it applies to the next game.
- **Card back**: "Match theme" first and selected by default, then every registered back.
- **Card faces**: every registered face set. There is one today, "Classic", and it is shown
  rather than hidden so the next one has an obvious place.

Changes apply as they are made; there is no Save, and Done closes the modal. It is a modal even
though it holds little, because it will grow and because a settings button is where people look.

Settings are stored per browser in `localStorage`, as Snake's best score is. A stored back or face
set that is no longer registered, because its package was uninstalled, reads as the default,
quietly.

### D7. What a deck is: faces and backs are separate choices

A **face set** is the 52 fronts. It looks the same under every theme, the way paper cards look the
same on any table. A **back** is one image. The two combine freely, so a new face set is one set
of 52 fronts, never one per theme, and a new back works with every face set.

"Match theme" is not special in the settings UI: it is a back whose image depends on the theme id,
with a fallback for theme ids it does not know (`docs/desktop-apps.md` §5). A back registered by
another package may do the same.

### D8. The look

**Table.** The felt follows the theme: indigo for Umbraco, green for Umbraco 4, steel blue for
macOS, green-teal for Windows 11, and Windows Solitaire's own green for Windows 98. Each has a soft
vignette and a faint texture. The toolbar sits on the felt as translucent pills in the theme's
font, since theme surfaces laid on a felt read as a panel dropped on the table; under Windows 98
its buttons and the win panel get that theme's bevels through `data-umbradesktop-theme`. The
settings modal reads the app tokens. An unknown theme gets the Umbraco felt.

**Card backs.** The picker offers Match theme, which is the default, and the original backs. There
is no list of five theme backs: they are only Match theme's images, one per theme id, so the
choice reads as "follow my theme" and not as five themes to pick from. The originals are the repository owner's own artwork: Rabbit, Codegarden, CodeCabin and Dutch Umbraco Alliance.
Each is kept as a webp in `art/backs/`
and cropped to the 300 x 434 back by `scripts/build-card-backs.mjs`. Each artwork carries its own
white frame line, some with a coloured line inside it, so the crop keeps only what is inside the
frame; otherwise the game's white card frame would double it.
A future back is one more file and one more manifest.

Match theme's per-theme images, framed in a white border:

- Umbraco and Umbraco 4 are portrait crops of Aurora flow and Retro swoosh, centred on a focal point.
- macOS and Windows 11 are recomposed. A plain crop of First light or Cobalt beacon cut through the
  wallpaper's own logo, so `build-card-backs.mjs` crops a logo-free texture region instead (First light
  at 0.3, 0.62 and zoomed to 130 of 230 of its height; Cobalt beacon at 0.35, 0.5 and 130 of 190) and
  composites a crisp overlay rendered from SVG: a glass disc (white radial gradient from .7 to .18,
  thin white rim) for macOS and a rounded acrylic tile (white .14 fill, .35 rim, radius 9 of 38) for
  Windows 11, each with the white logomark centred. The logomark is read from `suits.ts` by
  `scripts/logomark.mjs`, so the cards and the backs share one copy.
- Windows 98 has no wallpaper, so its back is pixel art: a navy dither, a thin white double border and
  a 16 x 16 pixel logomark, a white disc with the U carved out.

The wallpaper crops are separate image files in the Entertainment package, cut from the host's
wallpapers at card size, not references to the host's files, so the game does not depend on a host
path. The static backs are `viewBox="0 0 90 130"`: the 9:13 area the element shows inside the card's
frame, so `object-fit: cover` crops nothing.

A stored alias of a back that no longer exists, including the five per-theme aliases the first build
registered, reads as Match theme without complaint.

**Card faces.** SVG. Pips in the standard layouts, an outlined rank (Roboto Slab Bold, lining figures) and suit in two corners, red and
ink colours from Umbraco's palette, and the ace of spades carrying the Umbraco logomark, as aces of
spades traditionally carry a maker's mark.

The court cards use Dmitry Fomin's English pattern set from Wikimedia Commons, recoloured to the
Umbraco palette. A licence check on 2026-09-30 found each checked file dedicated CC0 as the
author's own work (for example the King of hearts, Jack of clubs and Queen of spades pages, and
`English_pattern_playing_cards_deck.svg`). CC0 allows changing it and shipping it inside the MIT
package with no attribution and no share-alike. Commons licenses per file, so the page of every
file taken is checked during the build, not only the category, and the source URLs go in the
README's credits anyway. The files are large, so they go through SVGO.

Rejected sources, so nobody reopens them: David Bellot's SVG-cards and Chris Aguilar's Vector
Playing Cards are LGPL and would stay LGPL inside an MIT package; deck-of-cards is MIT code with
Aguilar's art; a set on tekeye.uk that claims public domain is disputed by Aguilar as a copy of
his. Fallbacks if Fomin's files are unworkable: Adrian Kennard's CC0 set traced from Goodall cards
of around 1870, or Byron Knoll's public-domain set.

### D9. The HQ deck comes later, as a face set

Drawn portraits of Umbraco HQ people on the court cards was the original idea. It needs each
person's consent before their face ships in a public package, and artwork a person can recognise
themselves in, which neither this build nor hand-written SVG can provide. So the default deck
ships first and the HQ deck can follow as a second face set once people have agreed and the art
exists. D7 is what makes that a registration rather than a change to the game.

### D10. An unfinished game survives a refresh or a sign-out

Since #102 the desktop reopens windows after a refresh or after signing in again in the same tab,
but only the window, not what was in it. Without this, a player called away until their session
expired would come back to a fresh deal.

- After every move, the element writes its game to `sessionStorage`: the cards' positions, score,
  moves, elapsed time and draw mode. A few kilobytes at most.
- Each window saves under its own key. When a Solitaire window opens, it claims one unfinished
  saved game that no other open window has claimed and continues it; with none, it deals.
- Closing the window, winning or New game deletes that window's save. A refresh or a sign-out does
  not, because the browser does not run `disconnectedCallback` when a page goes away. That
  difference is exactly the one needed, and it is tested.
- The timer resumes from the saved elapsed time, so time signed out does not count.
- `sessionStorage` rather than `localStorage`: it matches the desktop's default "This session", it
  is per tab, and a game from yesterday does not appear in a new tab. Storage that refuses reads as
  nothing saved, inside a `try`, as the rest of the desktop does.

Checked in the build: see the notes at the end of this document.

### D11. Two manifest types for extending it

The Entertainment package declares and registers them. They are its own contract, not the host's.

- `umbraDesktopSolitaireBack`: `alias`, `name`, a label, and the image. Either one image URL, or a
  map from theme id to image URL with a fallback, which is how "Match theme" is itself registered.
  The package registers five: Match theme (1000), Rabbit (900), Codegarden (800), CodeCabin (700) and Dutch Umbraco Alliance (600).
- `umbraDesktopSolitaireFaces`: `alias`, `name`, a label, and a loader for a module that draws a
  card from its rank and suit as SVG. The modal's preview is that set's king of spades, drawn by
  the set itself, so a face set has nothing extra to supply.

The modal lists what is registered, sorted by `weight`. The built-in back and face set are
registered the same way as a third party's, so the path is exercised by the package itself. The
aliases are namespaced and final once shipped, because they are what the stored settings name.

### D12. Built the way the other two games are

- `solitaire/rules.ts` is pure: a state value in, a state value out, and a shuffle that can be
  seeded, the seam Minesweeper's `rules.ts` is built around.
- `solitaire/constants.ts` holds every number: card size range, gaps, fan offsets, durations,
  scores.
- `solitaire/solitaire.element.ts` renders the state and turns gestures into rule calls.
- Motion, the cascade, the settings modal, storage, and the two registries are separate files, so
  each can be understood and tested on its own.
- No library for the rules: Klondike is shorter than Minesweeper's rules, and a library brings
  either its own look or a structure we would work around.

### D13. Easter egg: the coffee ring

One thing on the felt, there to be found, so it is not in the README or the Marketplace listing.

On a fresh deal there is a one in six chance of a faint brown ring with a drip in one of three
places the cards never cover at rest: the gap between the waste and the foundations, and the two
bottom corners. A double-click rubs it out (a fade, instant under reduced motion). The chance comes
from an injectable `random` property so a test can say what the dice rolled.

The rule: it never interferes with play. It is `aria-hidden`, it sits under the table's cards in its
own stacking context, so a click or a drag over a card always reaches the card, and only its painted
ring (`pointer-events: stroke`) takes the pointer, never its box. Tests hit-test a real point over a
card, and double-click a card over a ring to check the card still goes home.

## 3. Tests, written first

**Rules, without a DOM:** the deal is right for a seeded shuffle (28 in the columns, 24 in the
stock, top cards face up); every legal and illegal move to a column and to a foundation; Draw 1 and
Draw 3; recycling, including the Draw 1 penalty; every scoring rule and the floor at zero; the
automatic turn of an uncovered card; when auto-finish is available; winning, and the time bonus.

**Element, in Chrome:** drag and drop with pointer events, including a run of cards and an illegal
drop; double-click to foundation; the stock click; settings saved and restored; an unregistered
stored back or face set falling back; reduced motion making a move instant; the modal opening from
the gear and closing on Done and Escape.

**Keeping the game (D10):** a save after a move; a new element continuing it; two windows each
claiming their own; the save deleted on close, win and New game.

**Registries (D11):** a back and a face set registered from outside appear in the modal; an alias
that goes away falls back.

**In a browser under all five themes:** the window's default and minimum size, card scaling at the
limits, and the felt and modal under each theme, measured rather than assumed.

## 4. Definition of done

- `npm run build` and `npm test` pass in the Entertainment package, and in the host if anything
  there changes (it should not).
- `README.md` and the Entertainment package's own README list Solitaire, with the art credit.
- The Entertainment marketplace file gets tags (solitaire, card game, klondike) and a screenshot in
  `docs/screenshots/`. Its `Description` stays as it is.
- A short guide for adding a card back or a face set, for package authors.
- This doc gets a "Notes from the build" section for what the build teaches.

## 5. Things to watch

- umbraCoffee v1 is uncommitted in another worktree and touches the same files in this package (the
  manifest list, the dictionaries). Whichever lands second merges.
- The win cascade canvas must be sized in device pixels or the cards blur on high-DPI screens.
- Dragging must use pointer capture, as the desktop's own window drag does, so a fast drag does not
  lose the card over another window.

## 6. Notes from the build

What the build taught that the code does not make obvious.

- A woven logomark damask on the felt and a printed #h5yr were tried as easter eggs and removed as
  distracting. Do not add them back; the coffee ring is the only one.
- Two drawn original backs (Friendly and Midnight, SVGs generated by script) were tried and removed;
  the originals are now the owner's artwork.

- Foundation-to-foundation moves were blocked, because review found that they allowed ace farming:
  every arrival on a foundation scores +10, so an ace could be moved between two empty foundations
  for unlimited points. D3 says so, and a rules test holds it.
- The web test runner's background tabs never deliver `requestAnimationFrame`, and a
  `ResizeObserver` can stay silent. So the tests use `fixtureSync` for plain DOM, injectable
  schedulers for the cascade and the clock, a public `relayout()` in place of waiting for a resize,
  and they finish animations explicitly rather than waiting for them.
- The FLIP snapshot has to take each card's visible position, and only the after-measurement may
  cancel animations. Cancel first and a card that is still in flight jumps to its old resting
  place.
- Cards need their own stacking context (`isolation`). Without it a card's `z-index` beats every
  overlay and steals clicks from the settings modal. `element.click()` in a test cannot see this,
  because it skips hit-testing, so a test that hit-tests a real point exists for it.
- Fomin's corner indices sit inside the frame art. `build-courts.mjs` strips them by element id,
  since the game draws its own, and fails loudly if an id goes missing, so a changed source file
  cannot ship with doubled indices.
- Sign-out: Umbraco navigates the page to `/umbraco/logout` without disconnecting the desktop
  first, so `disconnectedCallback` never runs, the saved game survives, and it resumes after
  signing in again in the same tab. That is what D10 needs. Session expiry itself was not tested.
- The win cascade runs until every card has left the window, which takes a while. A click or a key
  ends it.
- The corner font took four tries, each rejected on sight at real card size. Georgia as `<text>`
  has old-style figures, so 6 rose and 7 dropped and the rank-to-suit gap varied. Playfair Display
  outlines fixed that, but its hairlines vanish at corner size. Bitter 800 read well but was too
  heavy, and Bitter's long Q tail pushed its suit down and crowded the court frame. Roboto Slab
  Bold is the pick: lining figures, a J on the baseline, a short Q tail, and a 12.5 cap height that
  leaves the court picture room. Ranks are outlines, never text, so a face stays self-contained.
- The rank outlines are Apache 2.0 inside an MIT package, which is allowed on Apache's terms: the
  licence text ships in `THIRD-PARTY-NOTICES.md`, packed into the NuGet package, and the copyright
  notice with a statement of changes must reach the shipped JavaScript. The bundler drops comments,
  even `/*!` ones above code that compiles away, and drops an `output.banner` during minification,
  so a small plugin in `vite.config.ts` prepends the notice to the chunk holding the outlines in
  `generateBundle` and fails the build if it cannot.
- The coffee ring shipped first at 12% opacity in dark brown, tuned on a static preview, and was
  invisible on every real felt: the owner pressed New game dozens of times and never found it.
  It is now a light coffee tone at `COFFEE_OPACITY` (0.3), checked on the navy and green felts in
  a real backoffice, with loose drops instead of a tail, which made it read as a magnifying glass.
