# Arcade: the player experience

> The first Arcade worked and nobody playing a game would know it existed. This redesign puts the
> scores inside the games, at the moment they matter, and rebuilds the hub as a place worth opening.
> The server, the storage and the API stay; this is almost entirely front end.

- **Status:** Designed 2026-10-03 with the owner. Built 2026-10-05; see §8
- **Supersedes:** the player-facing parts of [`2026-10-01-arcade-design.md`](./2026-10-01-arcade-design.md):
  §7 (what players see) entirely, D7 (where the privacy question is asked) and the click on the
  beaten toast in D10. Everything else there stands
- **Mock:** [`mockups/2026-10-03-arcade.html`](./mockups/2026-10-03-arcade.html), every view in this
  document drawn as it should look. Where this text and the mock disagree, the mock's look and this
  text's behaviour win
- **Branch:** `claude/gaming-service-scores-8ffbf2`
- **Issue:** [#27](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/27)

---

## 1. What was wrong

The owner's review of the first build, 2026-10-03:

- Playing Minesweeper, nothing says the Arcade exists. A toast reading "New best on Minesweeper:
  42,3, number 1" appears on the desktop with no context.
- There is no way to see the scores from inside a game.
- The hub is a bare table in an empty window, and its Profile tab sits among the games as if it were
  one.
- "Technically this looks nice, but functionality wise we need to get back to the drawing board."

The cause: the first design was plumbing first, and the player's view was what was left over.

## 2. Decisions

| # | Decision |
| --- | --- |
| P1 | Scores live in the game. The Arcade offers pieces; each game opts in and decides where they go |
| P2 | Two pieces: a result card and a leaderboard panel, custom elements placed by tag name |
| P3 | A game that uses neither still has its scores kept, and gets the fallback dialog and toast |
| P4 | Minesweeper's header is untouched. The card shows on every win, nothing on a loss |
| P5 | Snake's Best chip becomes the Arcade best with rank, and opens the panel |
| P6 | Solitaire's existing win screen becomes the card; its settings menu gets "Leaderboard" |
| P7 | The privacy question moves into the first result card, worded around the would-be rank |
| P8 | One vocabulary: "leaderboard", "show", "hide". Never "private", "public" or "name" |
| P9 | The privacy answers are neutral: two equal outlined buttons |
| P10 | The card and the panel pick compact by themselves from the space they are given |
| P11 | The hub opens on an overview; a game's page has a podium; the profile sits behind your name |
| P12 | Modes are a pill above the board, one board at a time, opening on the mode last played |
| P13 | The "New best" toast goes for games that show a card. The beaten toast stays and opens the board |
| P14 | One look for all Arcade surfaces, taken from Solitaire, restyled per theme |

### P1 to P3: a kit, opted into per game

Considered: Arcade UI the host draws around every game (rejected: a game's look and its moments are
its own, and Minesweeper shows why no universal placement works), and a fixed overlay the Arcade
raises over any game window (rejected for the same reason). Google Play Games is the model: the
platform supplies standard screens, and the game decides when and where to call them.

The pieces are custom elements registered by the Arcade's bundle and placed by tag name. A game
imports nothing (D4 holds). Without the Arcade installed, an unknown tag renders nothing, so a game
needs no check of its own.

| Tag | What it is |
| --- | --- |
| `umbradesktop-arcade-result` | The result card for one submitted score |
| `umbradesktop-arcade-leaderboard` | The leaderboard panel for one game, as a sheet over it |

Both tag names are published API, final once shipped, like the context alias.

A game that places neither keeps working exactly as the first build does: its scores are stored, the
privacy question comes as the fallback dialog (its text rewritten to the P8 vocabulary, with one
sentence saying what the Arcade is), and a personal best raises the toast. That is where a
third-party game starts.

### P4 to P6: per game

**Minesweeper.** The header (mine counter, New game, timer) is the game's identity and stays exactly
as it is: no permanent best, no trophy button (owner, 2026-10-03). On every win, the card rises over
the board, in its compact form because the board is small. A loss shows nothing new. The panel is
reached only through the card's "Leaderboard ›", and from the hub.

**Snake.** It is an arcade game and already shows "Best" in its header. That chip becomes the
player's Arcade best with their rank, styled gold, and clicking it opens the panel. Without the
Arcade it stays the `localStorage` best, as now. Game over shows the card.

**Solitaire.** It already stops for a win with its own screen after the cascade. That screen becomes
the card, so the Arcade adds no dialog. The settings menu gains "Leaderboard", which opens the panel
on the current draw mode. A game abandoned before winning submits nothing, as now.

### P7 to P9: asking, and the words

The first build asked in a modal the moment the first score landed, before the player knew what the
Arcade was. The question now sits in the first result card, where the player's own number explains
the feature:

> That's **3rd of 12**. Show your scores on the Arcade leaderboard, where colleagues can see them?
>
> [ Yes, show my scores ] [ No, only I see them ]

Both answers say their consequence, so neither needs explaining. They are equal, outlined buttons:
the owner wants the choice neutral, and scores stay hidden until someone answers.

Every later card, while scores are hidden, ends with one quiet line: "Your scores are hidden from
the leaderboard. Show them", so the choice stays one click away in the game without being asked
again. The setting itself is in the profile.

The owner found "Private · Show my name" incomprehensible on first read, and was right: two words
for one idea, and neither said where anything shows or who sees it. So the interface uses one set of
words everywhere:

| Says | Never says |
| --- | --- |
| the leaderboard | public |
| show / hidden | private, go public, keep private |
| your scores | your name |
| "Only you see this" (your own row while hidden) | "Private" |

The profile toggle reads "Show my scores on the leaderboards", with "Off: colleagues don't see them;
you still see your own rank."

D7's default stands: hidden until answered. The score is stored either way, and answering "Yes"
shows it at once.

### P10: compact, chosen by the piece

Minesweeper's whole window is about 300 pixels wide; the full card does not fit, and squeezing it
produced a crowded card (owner, 2026-10-03). The pieces have two forms:

- **Result card, full:** what happened (the time or score, large), how good it is (a "New best" or
  "First place" ribbon, your medal and rank of N), a short board of three with your row lit, then
  Leaderboard › and Play again.
- **Result card, compact:** the same first two parts reduced to one line each: the number, the
  ribbon, your medal and rank, and one line naming the person to chase ("3.0 s behind Bram"). No
  board. The privacy question stacks its two buttons full width.
- **Panel, full:** title with the rule ("Highest score wins"), the mode pill, a small podium, the
  list, "N players" and "Open in the Arcade ›".
- **Panel, compact:** no podium; medals, the list and your row only.

The piece picks the form from the box it is given, not the game's say-so, so every game author gets
the right one without thinking about it. A `compact` attribute forces it. The threshold is one
constant read by both the element's CSS and its tests, per the project's derive-don't-type rule.

### P11, P12: the hub

**Overview** (what it opens on). A strip with the player's standing across everything: boards they
lead, boards where they are top three, how many colleagues play. Then a tile per game: art, name, the
rule, Play, and one row per mode with the player's medal and best beside the leader and their crown
(or, when the player leads, who is next). A mode never played says "Not played yet" and still shows
the leader. The tile opens the game's page.

**Game page.** One job per place (owner, 2026-10-03, after the first header was too crowded):

- the top bar navigates ("‹ All games", and the player's name);
- the header names the game and holds its one action, Play, alone on the right;
- the mode pill sits centred above the board it switches;
- the board: a podium for the top three, then the list, the player's row pinned under a divider when
  they are outside the top ten.

There are no separate "your rank" and "your best" boxes: the player's row says both.

**Profile**, behind the player's name in the top bar, not a tab among the games: the leaderboard
name, "Show my scores on the leaderboards", "Tell me when someone takes first place from me", and
Delete my scores.

**Admin** (users with the Users section, D11): a "⋯" menu on each row on hover (remove score, reset
name) and "Reset this board" at the bottom of the game page. Each confirmed.

**Modes.** A game's page and the panel show one board at a time, switched with the pill, opening on
the mode the player played last. A result card's Leaderboard › opens on the mode just played. The
overview shows all of them, one row each; past about four modes a tile would get long, which no game
has.

### P13: notifications

- **New best:** no toast for a game that shows a card; the card said it, better. A game that shows
  none keeps the toast (P3).
- **Beaten** (D10): stays, because it happens while the player is not playing. It names the game,
  both scores and the new rank ("Bram took first place from you on Snake. 510 beats your 480. You
  are 2nd now."), and clicking it opens the hub on that board. That click needs a custom toast
  element, which the first build skipped; it is what makes the toast worth having.

### P14: the look

The owner found the first hub "extremely boring" and asked for flair without being childish, taking
cues from Solitaire. All Arcade surfaces (hub, card, panel, toast) share:

- Solitaire's felt: deep navy lit from above, with its faint grain;
- frosted glass panels and pills; Fraunces for names and headings, Inter for the rest;
- big tabular numerals for scores;
- gold, silver and bronze medals, a crown for first place;
- a soft pink shine on the player's own row, a gold ribbon for "New best" and "First place".

Motion is small and happens once: the card rises in, a new best's row gets one sweep of the shine,
the crown settles. Nothing loops, and `prefers-reduced-motion` turns it all off.

The games keep their own look; only the Arcade's pieces bring this one.

**Themes.** These colours are the Arcade's own and are set per theme the way Solitaire sets its
felt: on the `data-umbradesktop-theme` the desktop stamps on every app. The hub gets the stamp as an
app; a piece inside a game reads the active theme from the desktop's settings context by its token
string. Each of the five themes gets a felt and accents that belong to it (Windows 98: flat, bevelled,
the classic gold). A theme may restyle, never remove.

## 3. What the server needs

The API stays. Four additions, all reads:

| Change | Why |
| --- | --- |
| A board read returns the number of players on it | "3rd of 12". Counts shown players, plus the viewer when hidden |
| A board read returns the entry directly above the viewer | "3.0 s behind Bram" when the viewer is outside the top ten |
| A submit result names the player passed when taking first place | "First place, past Bram's 450" |
| One overview read: per board, the viewer's entry, the leader, the next player, the player count; and the number of distinct players | The hub's overview and standing strip in one call instead of one per board |

The overview returns every board the server knows; the hub keeps only those of installed games, as
the boards are filtered today.

## 4. How the pieces fit

- **Submitting.** A game that shows a card submits through its bridge (`shared/arcade.ts` in
  Entertainment) with an option saying so; the Arcade context then raises neither the privacy dialog
  nor the best toast, and hands back the result. The game renders
  `<umbradesktop-arcade-result .result=${result}>` where it wants it.
- **The card** reads the board once for its short list and the chase line, shows the privacy
  question when the result says the player was never asked, and saves the answer through the
  context. Leaderboard › and Play again are events the game handles: Play again is the game's own
  new game, and Leaderboard opens the panel.
- **The panel** is placed by the game and opened by setting `open`. It fires `open` and `close`
  events; a game running underneath pauses on `open` and resumes on `close`. Esc and ✕ close it.
  "Open in the Arcade ›" asks the context to show that board in the hub.
- **Showing a board in the hub** (from the panel or the beaten toast) goes through the Arcade
  context: it remembers the requested game and mode and opens the hub with the host's `openApp`; the
  hub reads the request on open, and observes it while open. No host change is needed.

## 5. Out of scope

Unchanged from the first design: statistics, daily or weekly boards, challenges, live push, cheat
prevention beyond limits. Also out: a trophy button in Minesweeper (P4), more than about four modes
per game, and avatars beyond initials.

## 6. Tests

- The card: each moment (new best, first place, not a best, first-time question, hidden), compact
  versus full chosen from the box and forced by the attribute, the privacy answers saving through the
  context, Play again and Leaderboard firing.
- The panel: opens on the requested mode, pill switches, compact without a podium, Esc and ✕ close,
  `open`/`close` fire.
- The hub: overview from the overview read, a mode never played, the leader and next, the game page's
  podium and pinned row, the profile behind the name, admin menus only for admins.
- Each game: Minesweeper shows the card on a win and nothing on a loss and leaves its header alone;
  Snake's chip shows the Arcade best and rank and opens the panel, and pauses while it is open;
  Solitaire's win screen is the card and its menu opens the panel.
- The server's four additions, against SQLite.
- Wording: no shipped string in English or Dutch says "private", "public" or "name" for this.
- A real backoffice under all five themes, with screenshots of every view in the mock, as the first
  build's Task 29 did. That run found the bug no unit test did last time.

## 7. Docs

The Arcade's user page is rewritten around what players now see. The developer page "Putting your
game on the Arcade" gains the two pieces: what each shows, the compact rule, the events, and the
fallback when a game uses neither. Entertainment's games page says where each game shows its scores.

## 8. Notes from the build

Built 2026-10-04 and 2026-10-05 from the plan
[`2026-10-03-arcade-player-experience-plan.md`](./2026-10-03-arcade-player-experience-plan.md). Where
the plan and reality disagreed, the code follows reality; each case is below.

### Decided with the owner during the build

- **The card covers the whole game, not just the board.** In a real window the card was taller than
  the area it covered: Snake's full card needs up to 324 px (a hidden player ranked 4th or lower) and
  its playfield is 272 high; Minesweeper's compact card needs up to 261 px and its board is 258 high.
  Minesweeper and Snake now place the card over their whole content (274x316 and 312x354), header
  included, dimmed under the scrim. The width rule is unchanged: Minesweeper stays compact, Snake
  full. The card's spacing was trimmed by 12 px so the tallest full state fits. A layout test checks
  every card state in both boxes, under Lato and Verdana. The developer guide now advises about
  290 px of height for the compact card and 350 px for the full one.
- **"Open in the Arcade" does not close the panel.** Opening the hub is navigating away, not
  dismissing the leaderboard. `close` fires only when the player closes the panel (Esc, ✕, a click
  outside it) or the game sets `open` to false, so `close` always means "the player is done" and any
  game can resume on it. A `reason` on the event was considered and rejected as an API shaped for
  Snake alone.
- **Snake's gold chip drops the word "Best".** It reads "♛ 480 · 1st"; its accessible name keeps
  "Best 480, 1st". The chip was about 54 px wider than the old display, and Snake's header has 296.
  The header can no longer widen the board under any font (`contain: inline-size`); the chip text
  ellipsizes as a last resort. Without the Arcade the plain "Best" display is unchanged.

### Where the plan was wrong

- **A hidden player inside the top ten was pinned under the list with a duplicate rank.** The plan
  pinned any viewer missing from `top`, so a hidden viewer at would-be 2nd showed "··· 2 You" below
  a real 2nd. `listRows` in `pieces/parts.ts` merges a hidden viewer ranked within the board size,
  renumbers by position, and pins only further down; the gap marker shows only when players stand
  between. The panel and the game page both use it, and a hidden viewer on the podium is marked
  **Only you see this**.
- **The re-raised beaten toast stayed on screen for about 6 seconds.** Closing it from
  `connectedCallback` does nothing: uui 2.0.2's `_makeClose` ignores a close while the toast is not
  yet open (`toast-notification.element.js` lines 113-114), and the container then opens it
  (line 51). The `hidden` attribute loses to uui's `:host { display: block }`. Closing between open
  and the next frame leaks the handler in core's list. The element now hides the toast inline and
  closes it on its `opened` event. Its test mounts core's real notification context and container.
- **English ordinals followed the backoffice language's plural rules**, so German read "2th". A key
  `ordinalRules` (`en`, `nl`) now picks the rules that match the words the dictionary answered with.
- **The beaten toast's digits followed the browser**, not the backoffice language. Fixed.
- **A card could ask again** when a stale result arrived after the question was answered this visit.
  The context now marks such a result answered.
- **A failed answer on the card was silent** and left the player on the question with no way on. It
  now says **Your changes could not be saved.** and keeps the question.
- **The hub showed stale data** after a game. The context publishes `scoresChanged`; the overview
  and game page reload quietly. Asking for the board already on show remounts the page.
- **The profile dropped a typed name** when a switch saved. `UmbDeepState` only emits when the JSON
  differs (`observable-api/states/deep-state.js`), which also left Save stuck after saving an
  unchanged name.
- **Small boards lost a player** when a hidden viewer was merged. The list holds up to the board
  size (`ARCADE_BOARD_SIZE`, 10, the server's `ArcadeStore.BoardSize`).
- **Solitaire could end a win with nothing on screen** if the server stalled, and its panel was
  never placed when the Arcade arrived after the window. It now waits at most 4 s for the card and
  treats an accepted result as proof the Arcade is there.
- **The keyboard reached the game under the open panel**, so an arrow key could start Snake behind
  the scrim. The panel keeps Tab inside its sheet, and Snake ignores game keys while it is open.
- **The panel's pinned row sat half under the sheet's edge.** Only the list scrolls now.
- **Test-only corrections**: `waitUntil` resolves with no value; the packages target ES2020, so
  `.at()` fails `tsc`; a failing assertion that prints a DOM node or a whole dictionary hangs the
  runner; Mocha's `after` inside a test attaches to the suite.

### Confirmed in the installed source (backoffice 17.7.0)

- `localization.controller.js` line 171: `termOrDefault` returns the fallback untouched when the
  key is missing, so `say()` fills the English placeholders itself. Line 113: a function term is
  called with the args. `types/localization.d.ts` allows a function value.
- `localization.controller.js` line 67: `lang()` reads the host element's own `lang`, never an
  ancestor's, then `document.documentElement.lang || navigator.language`
  (`localization.manager.js` line 15). Tests on this Dutch machine pin `lang` on the element itself.
- `context-consumer.js` lines 181-182 dispatch from the host element and `context-provider.js`
  lines 36-37 listen on its own host, so the context finds the window manager on the desktop
  element that hosts both.
- `notification-handler.js` lines 12-31 build the layout element synchronously inside `peek`, so a
  flag set around `peek` tells the Arcade's own toast from the desktop's re-raise.
- `class.interface.d.ts`: `UmbControllerBase` has `observe` and `consumeContext`.
- `external/lit/index.d.ts` line 12 re-exports `keyed`.

### Measured in a real backoffice

TestInstance on the LocalDB copy `UmbraDesktop-Arcade`, port 5127, browsed as
`arcade.localhost:5127`, headless Chrome through the host's `puppeteer-core`.

- Card host width at each game's default size, the same under all five themes: Minesweeper 258 at
  first (274 after the card moved to the whole game), compact; Snake 296 (312 after), full;
  Solitaire 840, full. Snake's margin over the 292 threshold was 4 px before the move.
- Snake's chip text under each theme's font, needed / given: Lato 54.4 / 54.4, Verdana 66.5 / 58.1
  (the rank was cut, fixed with a smaller chip under Umbraco 4), Apple system 53.1, Segoe UI
  Variable 50.9, MS Sans Serif 53.4, all fitting.
- The beaten toast: one desktop toast, and selecting it or its entry in the notification list
  opened the hub on Snake once, with no second toast in any frame for 1.5 s.
- Fraunces loads as "UmbraDesktop Arcade Fraunces"; no Arcade calls come from a window's iframe.

Theme values changed against screenshots, all in `pieces/look.ts` unless named:

- Umbraco 4: the pieces' body text uses Tahoma (Verdana's narrow cut) so the compact card does not
  wrap; Snake's chip is slightly smaller (`snake.element.ts`).
- Windows 98: buttons are silver bevels with black text (black on navy was unreadable); podium
  steps are solid bevelled metals with black numbers; links on the teal are white (silver was
  2.6:1); the player's own row keeps "You" visible; the hub's profile button text is black.

How the views were reached: every end state through a seam (Minesweeper's `placer` and `now`,
Snake's `placer` and the wall, a near-won Solitaire deal), the card states by setting the admin's
profile and scores in SQL, and the beaten toast with the admin as the beaten player, because the
test users' passwords are not recorded. Nine test users were created on that instance through the
management API, without passwords: Arcade Carol, Dave, Erin, Frank, Grace, Heidi, Ivan, Judy and
Mallory, in the existing "Arcade Players" group. Screenshots of every view under every theme, and in
Dutch, are in `screenshots/2026-10-03-arcade/`.

### Left as they are

- Ties on value and time fall to database row order, which two queries could read differently.
  Unlikely with `datetime2`.
- `Colleagues playing` counts players on every board the server knows, including games not
  installed here.
- A submit now ranks the board up to four times, each with a user lookup. A cost, not a fault.
- In the compact card, "Your best 35.4 · would be 3rd" can leave "3rd" alone on a line.
- The panel's list gives no visual hint that it scrolls.
