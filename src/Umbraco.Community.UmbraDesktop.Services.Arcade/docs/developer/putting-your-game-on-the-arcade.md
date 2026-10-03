---
id: putting-your-game-on-the-arcade
title: Putting your game on the Arcade
description: Describe your game's boards with a manifest, submit scores from the game, and what the Arcade does with them.
sidebar_position: 1
---

# Putting your game on the Arcade

The Arcade keeps each player's best score on every board your game declares, shows the boards in
its hub, and tells a player when somebody takes first place from them. A game gets all of that from
one manifest and one call.

## 1. What you get

- **Boards.** Each is a ranking, such as "fastest time" or "highest score". A game has one or more.
  Solitaire has one per draw mode.
- **The privacy question.** The first time a player submits a score, the Arcade asks whether their
  scores may appear on the leaderboards. Your game does nothing for this.
- **A toast** when a score is a new personal best, and none when it is not.
- **A notification** on the player's next visit to the desktop, when somebody took first place from
  them.
- **A tab in the hub** with a **Play** button that opens your game.

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
| `weight` | Orders the hub's tabs, highest first. Optional |
| `meta.app` | The alias of the `umbraDesktopApp` that plays the game. The **Play** button opens it |
| `meta.label` | The game's name on its tab. A literal, or a `#` localization key |
| `meta.icon` | An Umbraco icon alias. Optional |
| `meta.leaderboards` | The boards, at least one |

Each board:

| Field | Meaning |
| --- | --- |
| `alias` | The board's identity within the game. Up to 64 lower case letters, digits and dashes |
| `label` | The board's heading. A literal, or a `#` localization key |
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

interface ArcadeForGames extends UmbContextMinimal {
  /** Submit a score. The Arcade asks the privacy question and raises the toast. */
  submit(game: string, board: string, value: number): Promise<{ status: string } | undefined>;
  /** The player's best: null if unplayed, undefined if the Arcade could not be reached. */
  getBest(game: string, board: string): Promise<number | null | undefined>;
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

  async submit(board: string, value: number): Promise<boolean> {
    try {
      const result = await this.#arcade?.submit(this.#game, board, value);
      return result?.status === 'accepted';
    } catch {
      return false;
    }
  }
}
```

The version in Entertainment also waits half a second for an Arcade that has not been provided yet.
Copy that as well if your game can end within moments of opening.

Call `submit` when a game ends, with the game's manifest alias, the board's alias and the value.
Do not decide whether a score is a personal best: the server keeps the better of the two and the
Arcade raises the toast only when the score is one.

**Keep the fallback.** The Arcade is missing in your own tests, in a backoffice where the desktop
is not open, and under an Arcade that failed to load. Your game must behave as it did before, so a
score is a courtesy and a game never fails over one. `getBest` returns `undefined` in that case.
Snake shows its best from the Arcade and falls back to the browser's local storage.

## 5. What counts

- A value is a whole number. A time is whole **milliseconds**, so a game that shows seconds still
  submits the exact elapsed milliseconds, which stops ties.
- It must be positive.
- It must be inside the board's `min` and `max`, when you gave them.
- Only a player's best on a board is kept. A tie keeps the earlier score.

A submit that breaks these is refused, and the player sees nothing.

## 6. Honesty about cheating

Your game runs in the browser, so anyone with the developer tools can submit anything. The server
refuses values that are not positive or fall outside a board's `min` and `max`, and that is the
whole of the protection. It is a sanity check, not security. Do not attach a prize to a board.

The remedy is a person: an administrator, meaning a user with the **Users** section, can remove a
score, reset a board or reset a display name from the hub. Setting a realistic `max` on a board
keeps out the most obvious junk entries.

## 7. What the console tells you

| Console | Cause |
| --- | --- |
| `[UmbraDesktop Arcade] Game "..." was dropped because it ...` | The manifest is malformed: a bad alias, no `meta.app`, no leaderboards, two boards with one alias, or a `better` or `format` that is not one of the allowed words. The game never appears on the hub |
| `[UmbraDesktop Arcade] A score for "..." / "..." was ignored: no umbraDesktopGame manifest declares that board` | The game submitted to a game or board alias that no manifest declares. Check the spelling against the manifest |
| A request failing with 409 | The board exists with a different description than your manifest gives |
| A request failing with 400 | The value failed the checks in section 5 |

## 8. Checklist before you ship

- [ ] The add-on depends on the Arcade package.
- [ ] Game and board aliases are the ones you mean to keep for good.
- [ ] `better` and `format` are right, and a time is in milliseconds.
- [ ] The game consumes the context with `consumeContext` and never imports the Arcade.
- [ ] The game still plays with no Arcade.
- [ ] `min` and `max` are set where there is a sensible limit.

For how the Arcade's context comes to exist, see
[Desktop contexts](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/developer/desktop-contexts.md)
in the UmbraDesktop developer guide.
