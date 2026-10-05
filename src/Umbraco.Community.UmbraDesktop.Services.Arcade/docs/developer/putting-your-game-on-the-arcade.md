---
id: putting-your-game-on-the-arcade
title: Putting your game on the Arcade
description: Describe your game's boards with a manifest, submit scores from the game, show them inside it, and what the Arcade does with them.
sidebar_position: 1
---

# Putting your game on the Arcade

The Arcade keeps each player's best score on every board your game declares, shows the boards in
its hub, and tells a player when somebody takes first place from them. A game gets all of that from
one manifest and one call, and can show the scores inside its own window with two elements.

## 1. What you get

- **Boards.** Each is a ranking, such as "fastest time" or "highest score". A game has one or more.
  Solitaire has one per draw mode.
- **A result card and a leaderboard panel**, two elements your game places in its own window: the
  card shows the score just played and where it stands, and the panel shows the whole board while
  the game waits underneath. Both are optional; section 5 shows how.
- **Without them, a dialog and toasts.** The first time a player submits a score, the Arcade asks in
  a dialog whether their scores may appear on the leaderboards, and it raises a toast when a score
  is a new personal best. Your game does nothing for either.
- **A notification** on the player's next visit to the desktop, when somebody took first place from
  them.
- **A tile in the hub** with a **Play** button that opens your game, and a page with its
  leaderboards.

The Arcade a player has is the one your game's package depends on. Nothing else installs it.

## 2. Depend on the package

Your add-on must depend on the Arcade package, so that installing your game installs the Arcade:

```xml
<PackageReference Include="Umbraco.Community.UmbraDesktop.Services.Arcade" Version="[17.0.0, 18.0.0)" />
```

Use the same range as you use for UmbraDesktop itself. The Arcade is released with the desktop and
shares its version number.

Your game's code never imports the Arcade. It reaches it by a context token, as section 4 shows.

## 3. The manifest

A `umbraDesktopGame` manifest says what to keep score of. It sits beside your `umbraDesktopApp`
manifest, which is the game itself. This is Entertainment's Solitaire:

```ts
{
  type: 'umbraDesktopGame',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Game',
  name: 'Solitaire scores',
  weight: 800,
  meta: {
    app: 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire',
    label: '#umbraDesktopEntertainment_solitaire',
    icon: 'icon-playing-cards',
    rule: '#umbraDesktopEntertainment_solitaireRule',
    leaderboards: [
      { alias: 'draw-1', label: '#umbraDesktopEntertainment_solitaireDrawOne', better: 'higher', format: 'points' },
      { alias: 'draw-3', label: '#umbraDesktopEntertainment_solitaireDrawThree', better: 'higher', format: 'points' },
    ],
  },
}
```

| Field | Meaning |
| --- | --- |
| `alias` | The game's identity on the server. Up to 200 letters, digits, dots, dashes and underscores |
| `weight` | Orders the games in the hub, highest first. Optional |
| `meta.app` | The alias of the `umbraDesktopApp` that plays the game. The **Play** button opens it |
| `meta.label` | The game's name in the hub. A literal, or a `#` localization key |
| `meta.icon` | An Umbraco icon alias. Optional |
| `meta.rule` | How to win, as the hub and the panel say it. A literal, or a `#` localization key. Optional |
| `meta.leaderboards` | The boards, at least one |

Without `rule`, the Arcade says how to win for each board from its `better` and `format`, such as
"Fastest time wins" or "Highest score wins". Give one when that would mislead. Solitaire's is
"Highest score wins, time bonus included", because the time bonus decides most games and the
derived rule would leave it out.

Each board:

| Field | Meaning |
| --- | --- |
| `alias` | The board's identity within the game. Up to 64 lower case letters, digits and dashes |
| `label` | The board's name, such as a mode's. A literal, or a `#` localization key |
| `better` | `'higher'` or `'lower'`: which way a better score goes |
| `format` | `'points'`, or `'time'` for milliseconds |
| `min`, `max` | The smallest and largest value the server accepts. Optional |

The manifest type is **public API** and only ever gains optional fields.

**Aliases are final once shipped.** The game alias and each board alias are the keys of every
player's saved scores. Rename one and the scores stay where they were, under a name nothing reads.
To add a board later, add an entry to `leaderboards`; nobody's existing scores move.

A board described differently later is refused. The first submit creates the board from your
manifest, and a later submit that disagrees on `better`, `format`, `min` or `max` gets a 409 from
the server. To change a board, give it a new alias.

## 4. Submitting a score

A game reaches the Arcade by consuming a context token built from the string
`'UmbraDesktopArcadeContext'`, and declares the small interface it uses:

```ts
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

interface ArcadeStanding {
  best: number;
  rank: number;
  /** The rank in words, in the backoffice language: "1st". */
  rankText: string;
}

interface ArcadeForGames extends UmbContextMinimal {
  /**
   * Submit a score. Without options the Arcade asks the privacy question and raises the toast; with
   * `showsResult` your game shows the result card, which does both, and the Arcade does neither.
   */
  submit(game: string, board: string, value: number, options?: { showsResult?: boolean }): Promise<{ status: string } | undefined>;
  /** The player's best: null if unplayed, undefined if the Arcade could not be reached. */
  getBest(game: string, board: string): Promise<number | null | undefined>;
  /** The player's best and rank: null if unplayed, undefined if the Arcade could not be reached. */
  getStanding(game: string, board: string): Promise<ArcadeStanding | null | undefined>;
}

export const ARCADE_CONTEXT = new UmbContextToken<ArcadeForGames>('UmbraDesktopArcadeContext');
```

Nothing is imported from the Arcade, so your game builds and runs without it.

Use `consumeContext`, **not** `getContext`. Umbraco 17's `getContext` gives up on an animation frame,
a hidden browser tab runs none, and the Arcade's context can finish loading after your game has
opened. A consumer has no timer, and is called again when the context arrives. The reference
implementation, which wraps this in a small class and never throws, is
[`shared/arcade.ts`](../../../Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/shared/arcade.ts)
in Entertainment. Its core is:

```ts
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

export class ArcadeScores extends UmbControllerBase {
  readonly #game: string;
  #arcade?: ArcadeForGames;

  constructor(host: UmbControllerHost, game: string) {
    super(host);
    this.#game = game;
    this.consumeContext(ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
    });
  }

  /** The accepted result, for the result card; undefined without the Arcade or when it refused. */
  async submit(board: string, value: number, options: { showsResult?: boolean } = {}) {
    try {
      const result = await this.#arcade?.submit(this.#game, board, value, options);
      return result?.status === 'accepted' ? result : undefined;
    } catch {
      return undefined;
    }
  }
}
```

The version in Entertainment also waits half a second for an Arcade that has not been provided yet.
Copy that as well if your game can end within moments of opening. It also types the accepted result
as `ArcadeResult`, a copy of every field the Arcade hands back, and adds `standing`, `best` and
`reachable`, the last for offering a leaderboard button only when the Arcade is there.

Call `submit` when a game ends, with the game's manifest alias, the board's alias and the value.
Do not decide whether a score is a personal best: the server keeps the better of the two, and the
Arcade or the card says so only when the score is one.

**Keep the fallback.** The Arcade is missing in your own tests, in a backoffice where the desktop
is not open, and under an Arcade that failed to load. Your game must behave as it did before, so a
score is a courtesy and a game never fails over one. `getBest` and `getStanding` return `undefined`
in that case. Snake shows its best and rank from the Arcade with `getStanding`, and falls back to
the browser's local storage.

## 5. Showing scores in your game

### The two elements

The Arcade defines two elements, and both tag names are **published API**:

| Tag | What it is |
| --- | --- |
| `umbradesktop-arcade-result` | The result card: the score just played, how good it is, and the top of the board |
| `umbradesktop-arcade-leaderboard` | The leaderboard panel: one game's whole board, as a sheet over the game |

Place them by tag name in your template and import nothing. Without the Arcade, the tag is an
element nobody defined, and it renders nothing, so a game needs no check to place one.

Both read the desktop's theme themselves, so your game does not pass it on.

### Where they go

Each fills its nearest positioned ancestor (`position: absolute; inset: 0`) and dims what it
covers. So put it inside a positioned element that has the size of the area it should cover, such
as your whole game area, header included. A positioned parent with no height of its own hides the
dimming, and the card hangs outside it.

That box also decides the form. In a box narrower than 292 pixels (the full card's 268 plus 12 on
each side), a piece draws its compact form; at 292 or wider, its full one. The `compact` attribute
forces the compact form whatever the box. Minesweeper and Snake both cover their whole game area:
Minesweeper's is 274 pixels wide and gets the compact card, Snake's is 312 and gets the full one.

Give the card a box tall enough for its longest state, about 290 pixels high for the compact card
and 350 for the full one. Those are what the Arcade's own layout test measures for the tallest
states: the compact card's failed-save line under the question, and the full card's hidden player
below third, with the short board and the line about hidden scores. A shorter box makes the card
scroll.

### The result card

Submit with `{ showsResult: true }`, then render the card with the result `submit` handed back:

```ts
html`<div class="game">
  <div class="header">…</div>
  <div class="playfield">…</div>
  ${this.result
    ? html`<umbradesktop-arcade-result
        .result=${this.result}
        outcome="over"
        @leaderboard=${() => (this.panelOpen = true)}
        @play-again=${() => this.newGame()}
      ></umbradesktop-arcade-result>`
    : nothing}
</div>`;
```

- `outcome` is `won`, the default, or `over`.
- A `detail` slot takes one short line of your own, such as Solitaire's time bonus. It shows only in
  the full form, once the player has answered the question below.
- It fires `leaderboard`, with detail `{ game, board }`, and `play-again`.
- It never removes itself. Drop it when a new game starts.

With `showsResult`, the Arcade neither asks the privacy question nor raises the "New best" toast,
because the card does both. The first time, the card asks in place of its standing and its buttons,
and shows "Your changes could not be saved." when the answer fails to save, keeping the question
for another try.

### The leaderboard panel

```ts
html`<umbradesktop-arcade-leaderboard
  game="Umbraco.Community.UmbraDesktop.Entertainment.Snake.Game"
  board="default"
  ?open=${this.panelOpen}
  @open=${() => this.pause()}
  @close=${() => this.onPanelClose()}
></umbradesktop-arcade-leaderboard>`;
```

- `game` is your `umbraDesktopGame` alias. `board` is the board to open on; without it the panel
  opens on the board the player last played.
- Set `open` to show it. It fires `open` and `close` whenever that changes.
- The player closes it with Esc, its ✕, or a click on the dimmed game around it. Setting `open` to
  false closes it too.
- **Open in the Arcade ›** opens the hub on the same board and leaves the panel open.

So `close` always means the player is done with the leaderboard. Three things follow:

- **Resume on `close`**, if your game runs underneath. Pause on `open`, or where your own code opens
  the panel.
- **Mirror `close` into your own state.** The panel sets its own `open` to false when the player
  closes it. If your `panelOpen` stays true, the next `?open=${true}` changes nothing and the panel
  never opens again.
- **Give focus back to your game on `close`.** The panel's close button had it and is gone.

### Listening to the events

Every event both elements fire bubbles but is not composed: it does not leave your game's shadow
root. Listen on the element itself, as above, or inside your shadow root, never on your game's host
element.

### The worked examples

The three games in Entertainment use the pieces three ways:

- [Minesweeper](../../../Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/minesweeper/minesweeper.element.ts)
  shows the compact card over the whole game after a win, its header dimmed under it, and its
  **Leaderboard ›** opens the panel over the whole game.
- [Snake](../../../Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/snake/snake.element.ts)
  shows the full card at game over, and turns its best score into a button showing the crown, the
  Arcade best and the rank, which pauses the game and opens the panel.
- [Solitaire](../../../Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/solitaire/solitaire.element.ts)
  shows the card in place of its own win screen, with the time bonus in the `detail` slot, and opens
  the panel from the card and from its settings, stopping its clock while the panel is open.

### Using neither

A game that places neither element keeps the first behaviour: its scores are stored, the dialog
asks the first time, and a toast says when a score is a new best. Submit without `showsResult`.

## 6. What counts

- A value is a whole number. A time is whole **milliseconds**, so a game that shows seconds still
  submits the exact elapsed milliseconds, which stops ties.
- It must be positive.
- It must be inside the board's `min` and `max`, when you gave them.
- Only a player's best on a board is kept. A tie keeps the earlier score.

A submit that breaks these is refused, and the player sees nothing.

## 7. Honesty about cheating

Your game runs in the browser, so anyone with the developer tools can submit anything. The server
refuses values that are not positive or fall outside a board's `min` and `max`, and that is the
whole of the protection. It is a sanity check, not security. Do not attach a prize to a board.

The remedy is a person: an administrator, meaning a user with the **Users** section, can remove a
score, reset a board or reset a display name from a game's page in the hub. Setting a realistic
`max` on a board keeps out the most obvious junk entries.

## 8. What the console tells you

| Console | Cause |
| --- | --- |
| `[UmbraDesktop Arcade] Game "..." was dropped because it ...` | The manifest is malformed: a bad alias, no `meta.app`, no leaderboards, two boards with one alias, or a `better` or `format` that is not one of the allowed words. The game never appears in the hub |
| `[UmbraDesktop Arcade] A score for "..." / "..." was ignored: no umbraDesktopGame manifest declares that board` | The game submitted to a game or board alias that no manifest declares. Check the spelling against the manifest |
| A request failing with 409 | The board exists with a different description than your manifest gives |
| A request failing with 400 | The value failed the checks in section 6 |

## 9. Checklist before you ship

- [ ] The add-on depends on the Arcade package.
- [ ] Game and board aliases are the ones you mean to keep for good.
- [ ] `better` and `format` are right, and a time is in milliseconds.
- [ ] The game consumes the context with `consumeContext` and never imports the Arcade.
- [ ] The game still plays with no Arcade.
- [ ] `min` and `max` are set where there is a sensible limit.
- [ ] If you show the card, you submit with `showsResult`.
- [ ] Your card or panel sits inside a positioned element the size of what it covers.
- [ ] You listen to the pieces' events on the elements, and mirror the panel's `close` into your
      own state.

For how the Arcade's context comes to exist, see
[Desktop contexts](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/developer/desktop-contexts.md)
in the UmbraDesktop developer guide.
