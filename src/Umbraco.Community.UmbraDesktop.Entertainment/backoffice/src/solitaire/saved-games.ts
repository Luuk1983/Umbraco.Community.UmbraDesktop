/**
 * Unfinished games kept per tab in `sessionStorage` (design D10), so a refresh or a sign-out does
 * not cost the player their game. Each window saves under its own id. A window that opens claims
 * one saved game no other window on this page has claimed. Closing the window removes it; a page
 * going away does not, because the browser does not run `disconnectedCallback` then.
 *
 * One store per page, created at the module level so every Solitaire window on the page shares it.
 * This is important for multi-window coordination: one per window would let the same game be claimed
 * twice.
 */
import { isKlondikeGame } from './rules.js';
import type { KlondikeGame } from './rules.js';
import type { StorageAccess } from './settings.js';

/** Storage key. Final once shipped. */
export const SAVED_GAMES_KEY = 'umbradesktop-entertainment-solitaire-games';

/** One window's game. */
export interface SavedGame {
  readonly game: KlondikeGame;
  readonly elapsedSeconds: number;
}

/** A claimed game and the id its window keeps saving under. */
export interface ClaimedGame {
  readonly id: string;
  readonly saved: SavedGame;
}

/**
 * The saved games of one page. One instance per page, shared by every Solitaire window on it.
 * Tracks which windows have already claimed a game so that the same game is not claimed twice.
 */
export class SavedGameStore {
  /** Ids a window on this page already owns. In memory on purpose: a reload starts it empty. */
  #claimed = new Set<string>();

  /**
   * @param storage How to reach storage; may throw, and every call is guarded.
   */
  constructor(private readonly storage: StorageAccess = () => window.sessionStorage) {}

  /**
   * Take one saved game no window on this page owns. This window holds onto it until it calls
   * `remove()`.
   * @returns The game and its id, or `undefined` if none are available.
   */
  claim(): ClaimedGame | undefined {
    const all = this.#read();
    const id = Object.keys(all).find((key) => !this.#claimed.has(key));
    if (id === undefined) return undefined;
    this.#claimed.add(id);
    return { id, saved: all[id] };
  }

  /**
   * Save a window's game, claiming the id for this page. Overwrites any previous save for this
   * id.
   * @param id The window's id.
   * @param saved Its game.
   */
  save(id: string, saved: SavedGame): void {
    this.#claimed.add(id);
    const all = this.#read();
    all[id] = saved;
    this.#write(all);
  }

  /**
   * Forget a window's game: it was closed, won or replaced by New game. Releases the claim so
   * another window can claim it or a new one can be saved under this id.
   * @param id The window's id.
   */
  remove(id: string): void {
    this.#claimed.delete(id);
    const all = this.#read();
    delete all[id];
    this.#write(all);
  }

  /**
   * Every playable saved game; anything malformed (not a valid KlondikeGame or not playing) is
   * dropped. Field-by-field validation so we can evolve the saved format without breaking old
   * saves.
   */
  #read(): Record<string, SavedGame> {
    try {
      const raw = JSON.parse(
        this.storage().getItem(SAVED_GAMES_KEY) ?? '{}',
      ) as Record<string, Partial<SavedGame>>;
      const out: Record<string, SavedGame> = {};
      for (const [id, entry] of Object.entries(raw ?? {})) {
        if (
          entry &&
          isKlondikeGame(entry.game) &&
          entry.game.status === 'playing' &&
          typeof entry.elapsedSeconds === 'number'
        ) {
          out[id] = { game: entry.game, elapsedSeconds: entry.elapsedSeconds };
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  /**
   * Write them all back, or nothing when storage refuses. The store survives storage failure:
   * it just will not survive a reload.
   */
  #write(all: Record<string, SavedGame>): void {
    try {
      this.storage().setItem(SAVED_GAMES_KEY, JSON.stringify(all));
    } catch {
      // Nothing to tell the player: the game carries on, it just will not survive a reload.
    }
  }
}

/** The page's store, shared by every Solitaire window. */
export const savedGames = new SavedGameStore();
