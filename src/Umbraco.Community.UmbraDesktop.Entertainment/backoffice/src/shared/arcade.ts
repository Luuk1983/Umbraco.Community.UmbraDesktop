import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/** Who a score took first place from. A copy of the Arcade's `ArcadePassed`. */
export interface ArcadePassed {
  /** Their board name. */
  displayName: string;
  /** Their best, which the score beat. */
  value: number;
}

/**
 * What the Arcade answers an accepted score. A field-for-field copy of the Arcade's accepted
 * `ArcadeGameResult`, because nothing is imported from another package (design D4). A game hands it
 * on to the `umbradesktop-arcade-result` card, which reads all of it; a game itself needs little.
 */
export interface ArcadeResult {
  /** Always accepted: anything else comes back as undefined. */
  status: 'accepted';
  /** Whether it replaced the player's best. */
  isPersonalBest: boolean;
  /** The best before this score, null on a first play. */
  previousBest: number | null;
  /** The player's rank, or would-be rank while their scores are hidden. */
  rank: number;
  /** Whether the player is shown on boards. */
  isPublic: boolean;
  /** Whether the one-time "show me on boards" question has been answered. */
  askedAboutPublic: boolean;
  /** The player's board name. */
  displayName: string;
  /** Who this score took first place from, null when it took it from nobody. */
  passed: ArcadePassed | null;
  /** The game's `umbraDesktopGame` alias. */
  game: string;
  /** The board's alias. */
  board: string;
  /** The value submitted. */
  value: number;
  /** The rank in words, in the backoffice language: "1st". */
  rankText: string;
}

/** A player's standing on a board, for a game's own display. A copy of the Arcade's `ArcadeStanding`. */
export interface ArcadeStanding {
  /** Their best. */
  best: number;
  /** Their rank, or would-be rank while hidden. */
  rank: number;
  /** The rank in words. */
  rankText: string;
}

/**
 * The part of the Arcade's context a game uses, declared here because nothing is imported from
 * another package (design D4; the same pattern as the desktop's settings context in desktop-apps.md
 * §7.2). `docs/developer/putting-your-game-on-the-arcade.md` in the Arcade package is the contract.
 */
interface ArcadeForGames extends UmbContextMinimal {
  /** Submit a score. With `showsResult` the game shows the result card, and the Arcade neither asks nor toasts. */
  submit(game: string, board: string, value: number, options?: { showsResult?: boolean }): Promise<{ status: string } | undefined>;
  /** The player's best, null if unplayed, undefined if unreachable. */
  getBest(game: string, board: string): Promise<number | null | undefined>;
  /** The player's best and rank, null if unplayed, undefined if unreachable. */
  getStanding(game: string, board: string): Promise<ArcadeStanding | null | undefined>;
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
   * @param options `showsResult` when the game will show the Arcade's result card for it.
   * @returns The accepted result, for the card; undefined without the Arcade or when it refused.
   */
  async submit(board: string, value: number, options: { showsResult?: boolean } = {}): Promise<ArcadeResult | undefined> {
    try {
      const result = await (await this.#reach())?.submit(this.#game, board, value, options);
      return result?.status === 'accepted' ? (result as ArcadeResult) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The player's standing on a board. Never throws.
   * @param board The board's alias.
   * @returns The standing; null when the Arcade is there but they have not played; undefined without it.
   */
  async standing(board: string): Promise<ArcadeStanding | null | undefined> {
    try {
      return await (await this.#reach())?.getStanding(this.#game, board);
    } catch {
      return undefined;
    }
  }

  /**
   * Whether the Arcade is there, for games that offer the leaderboard only with it.
   * @returns Whether the Arcade answered, waiting as briefly as `submit` does.
   */
  async reachable(): Promise<boolean> {
    return (await this.#reach()) !== undefined;
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
