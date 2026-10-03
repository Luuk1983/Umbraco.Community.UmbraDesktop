import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The part of the Arcade's context a game uses, declared here because nothing is imported from
 * another package (design D4; the same pattern as the desktop's settings context in desktop-apps.md
 * §7.2). `docs/developer/putting-your-game-on-the-arcade.md` in the Arcade package is the contract.
 */
interface ArcadeForGames extends UmbContextMinimal {
  /** Submit a score; the Arcade handles the question, the toast and the notification. */
  submit(game: string, board: string, value: number): Promise<{ status: string } | undefined>;
  /** The player's best, null if unplayed, undefined if unreachable. */
  getBest(game: string, board: string): Promise<number | null | undefined>;
}

/** The Arcade's context, by its published alias. */
export const ARCADE_CONTEXT = new UmbContextToken<ArcadeForGames>('UmbraDesktopArcadeContext');

/**
 * How long a game waits for an Arcade it has not heard from yet. Covers a game opened in the moment
 * after the desktop loads, before the Arcade's own context has finished loading; short, because
 * without the Arcade the wait is all the player gets.
 */
const ARCADE_WAIT_MS = 500;

/**
 * One game's line to the Arcade. Every game behaves exactly as before when the Arcade is not there:
 * in its own tests, outside the desktop, or under an Arcade that failed to load.
 *
 * Consumes rather than `getContext`: Umbraco 17's `getContext` gives up on an animation frame, and a
 * hidden browser tab runs none, so a game there would hang until the tab was shown. A consumer has
 * no timer, and is also called back when the Arcade's context arrives after the game opened.
 */
export class ArcadeScores extends UmbControllerBase {
  /** The game's `umbraDesktopGame` alias. */
  readonly #game: string;

  /** The Arcade, once and while provided. */
  #arcade?: ArcadeForGames;

  /** Resolves the first time the Arcade is provided, so an early call can wait for it briefly. */
  readonly #found: Promise<void>;

  /**
   * @param host The game element.
   * @param game The game's `umbraDesktopGame` manifest alias.
   */
  constructor(host: UmbControllerHost, game: string) {
    super(host);
    this.#game = game;
    let found: () => void;
    this.#found = new Promise((resolve) => (found = resolve));
    this.consumeContext(ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (arcade) found();
    });
  }

  /**
   * The Arcade, waiting at most {@link ARCADE_WAIT_MS} for one that has not been provided yet.
   * @returns The Arcade, or undefined without one.
   */
  async #reach(): Promise<ArcadeForGames | undefined> {
    if (!this.#arcade) await Promise.race([this.#found, new Promise((resolve) => setTimeout(resolve, ARCADE_WAIT_MS))]);
    return this.#arcade;
  }

  /**
   * Submit a score. Never throws: a score is a courtesy to the player, not something a game may fail over.
   * @param board The board's alias.
   * @param value Points, or milliseconds.
   * @returns Whether the Arcade took it.
   */
  async submit(board: string, value: number): Promise<boolean> {
    try {
      const result = await (await this.#reach())?.submit(this.#game, board, value);
      return result?.status === 'accepted';
    } catch {
      return false;
    }
  }

  /**
   * The player's best from the Arcade. Never throws.
   * @param board The board's alias.
   * @returns The best, or undefined without the Arcade or a best.
   */
  async best(board: string): Promise<number | undefined> {
    try {
      return (await (await this.#reach())?.getBest(this.#game, board)) ?? undefined;
    } catch {
      return undefined;
    }
  }
}
