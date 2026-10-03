import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { createArcadeApi } from '../api/arcade-api.js';
import type { ArcadeApi, ArcadeBoard, ArcadeProfile, ArcadeSubmitResult } from '../api/arcade-api.js';
import { normaliseGames } from '../games/game-manifest.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { AREA } from '../shared/area.js';
import { formatScore } from '../shared/format.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from './arcade.context-token.js';
import { UMBRADESKTOP_ARCADE_PRIVACY_MODAL } from './privacy-modal.token.js';
import type { ArcadePrivacyModalValue } from './privacy-modal.token.js';

/** What the context needs from outside, injectable so tests need no server, modal or toast container. */
export interface ArcadeContextDeps {
  /** The server. */
  api: ArcadeApi;
  /** Where `umbraDesktopGame` manifests come from. */
  registry: typeof umbExtensionsRegistry;
  /** Ask the one-time question; undefined when closed without an answer. */
  askPrivacy(host: UmbControllerHost, displayName: string): Promise<ArcadePrivacyModalValue | undefined>;
  /** Raise a toast on the desktop, where the notification centre picks it up. */
  toast(host: UmbControllerHost, color: 'positive' | 'warning', message: string): void;
  /** How long the beaten check waits for game manifests, in milliseconds; tests shorten it. */
  gamesWaitMs: number;
}

/** How long the beaten check waits for game manifests to register before naming a game by its alias. */
const GAMES_WAIT_MS = 3000;

/**
 * The Arcade on the desktop: games submit through it, the hub reads through it, and it tells you,
 * once per visit, who took first place from you (design D4, D10).
 *
 * A `umbraDesktopContext`, so the desktop creates it on open and destroys it on leave; never in the
 * plain backoffice or a window's iframe (D3). Constructed by the host with `(host)` only; the second
 * parameter is for tests.
 */
export class UmbraDesktopArcadeContext extends UmbContextBase {
  /** The injected or default collaborators. */
  readonly #deps: ArcadeContextDeps;

  /** Words for toasts, in the backoffice's language. */
  readonly #localize: UmbLocalizationController;

  /** The registered games, by weight. */
  readonly #games = new UmbArrayState<ArcadeGame>([], (g) => g.alias);

  /** The registered games, by weight, as the hub observes them. */
  readonly games = this.#games.asObservable();

  /** The player's settings, once read. */
  readonly #profile = new UmbObjectState<ArcadeProfile | undefined>(undefined);

  /** The player's settings, as the hub observes them. */
  readonly profile = this.#profile.asObservable();

  /** Drops already reported, so a manifest is named in the console once. */
  readonly #reported = new Set<string>();

  /** Set by `destroy()`, so work still in flight neither toasts nor opens a dialog on a desktop that has gone. */
  #destroyed = false;

  /**
   * The one-time question while it is open, so a second first score submitted meanwhile waits for
   * the same answer instead of opening a second dialog. Cleared when the question settles.
   */
  #asking: Promise<ArcadeProfile | undefined> | undefined;

  /**
   * Set once the player has answered this visit. A later submit's result can still say the question
   * is open (it may have been read before the answer was saved), and this stops it being asked again.
   */
  #answered = false;

  /** Stops the games wait early (timer and subscription); undefined when nothing is waiting. */
  #cancelGamesWait: (() => void) | undefined;

  /**
   * @param host The desktop element.
   * @param deps Collaborators; the real ones by default.
   */
  constructor(host: UmbControllerHost, deps: Partial<ArcadeContextDeps> = {}) {
    super(host, UMBRADESKTOP_ARCADE_CONTEXT);
    this.#deps = {
      api: deps.api ?? createArcadeApi(),
      registry: deps.registry ?? umbExtensionsRegistry,
      askPrivacy:
        deps.askPrivacy ??
        ((h, displayName) => umbOpenModal(h, UMBRADESKTOP_ARCADE_PRIVACY_MODAL, { data: { displayName } }).catch(() => undefined)),
      toast: deps.toast ?? ((_host, color, message) => void this.#peek(color, message)),
      gamesWaitMs: deps.gamesWaitMs ?? GAMES_WAIT_MS,
    };
    this.#localize = new UmbLocalizationController(this);
    // The initializer rather than `registry.byType`, which never evaluates a manifest's `conditions`.
    new UmbExtensionsManifestInitializer(this, this.#deps.registry as never, 'umbraDesktopGame', null, (permitted) => {
      const { games, dropped } = normaliseGames(permitted.map((c) => c.manifest));
      for (const drop of dropped) {
        if (this.#reported.has(drop.alias)) continue;
        this.#reported.add(drop.alias);
        console.warn(`[UmbraDesktop Arcade] Game "${drop.alias}" was dropped because it ${drop.reason}.`);
      }
      this.#games.setValue(games);
    });
    void this.#announceBeaten();
  }

  /** The registered games right now. @returns The games. */
  getGames(): ArcadeGame[] {
    return this.#games.getValue();
  }

  /**
   * Submit a score. Asks the one-time question after a first score, and toasts a personal best.
   * Never throws; a game ignores the answer if it has no use for it.
   *
   * The question is asked once per visit however many first scores arrive together: concurrent
   * submits share one dialog and its answer. If the player closes the dialog without answering,
   * nothing is saved and the next submit asks again.
   * @param game The game's `umbraDesktopGame` alias.
   * @param board The board's alias.
   * @param value Points, or milliseconds for a time.
   * @returns How it went, or undefined when the game or board is unknown.
   */
  async submit(game: string, board: string, value: number): Promise<ArcadeSubmitResult | undefined> {
    const found = this.getGames().find((g) => g.alias === game);
    const definition = found?.leaderboards.find((b) => b.alias === board);
    if (!found || !definition) {
      console.warn(`[UmbraDesktop Arcade] A score for "${game}" / "${board}" was ignored: no umbraDesktopGame manifest declares that board.`);
      return undefined;
    }
    const result = await this.#deps.api.submit(game, definition, value);
    if (result.status !== 'accepted') return result;

    let isPublic = result.isPublic;
    if (!result.askedAboutPublic && !this.#destroyed) {
      if (this.#answered) {
        // A stale result: the answer is already in, so use it rather than ask again.
        isPublic = this.#profile.getValue()?.isPublic ?? isPublic;
      } else {
        const saved = await this.#askOnce(result.displayName);
        if (saved) isPublic = saved.isPublic;
      }
    }

    if (result.isPersonalBest) {
      const name = this.#gameName(found, definition.alias);
      const score = formatScore(definition.format, value);
      const message = isPublic
        ? this.#localize.termOrDefault(`${AREA}_newBestRanked`, `New best on ${name}: ${score}, number ${result.rank}`, name, score, result.rank)
        : this.#localize.termOrDefault(`${AREA}_newBest`, `New best on ${name}: ${score}`, name, score);
      this.#toast('positive', message);
    }
    return { ...result, isPublic };
  }

  /** The player's best on a board. @param game Game alias. @param board Board alias. @returns The best, null if unplayed, undefined if unreachable. */
  getBest(game: string, board: string): Promise<number | null | undefined> {
    return this.#deps.api.getBest(game, board);
  }

  /** A board for the hub. @param game Game alias. @param board Board alias. @returns The board. */
  getBoard(game: string, board: string): Promise<ArcadeBoard | undefined> {
    return this.#deps.api.getBoard(game, board);
  }

  /** Read the player's settings into `profile`. */
  async refreshProfile(): Promise<void> {
    const profile = await this.#deps.api.getProfile();
    if (profile) this.#profile.setValue(profile);
  }

  /** Change the player's settings. @param patch The change. @returns Whether it saved. */
  async updateProfile(patch: Parameters<ArcadeApi['updateProfile']>[0]): Promise<boolean> {
    const saved = await this.#deps.api.updateProfile(patch);
    if (saved) this.#profile.setValue(saved);
    return saved !== undefined;
  }

  /** Delete everything about the player. @returns Whether it worked. */
  async deleteMyScores(): Promise<boolean> {
    const done = await this.#deps.api.deleteProfile();
    if (done) await this.refreshProfile();
    return done;
  }

  /** Remove a score (admin). @param game Game. @param board Board. @param userKey Player. @returns Whether it worked. */
  removeScore(game: string, board: string, userKey: string): Promise<boolean> {
    return this.#deps.api.removeScore(game, board, userKey);
  }

  /** Empty a board (admin). @param game Game. @param board Board. @returns Whether it worked. */
  resetBoard(game: string, board: string): Promise<boolean> {
    return this.#deps.api.resetBoard(game, board);
  }

  /** Reset a display name (admin). @param userKey Player. @returns Whether it worked. */
  resetName(userKey: string): Promise<boolean> {
    return this.#deps.api.resetName(userKey);
  }

  /**
   * Marks the context gone, then lets Umbraco tear it down. Idempotent: Umbraco calls `destroy()`
   * twice on its classes (once from the host's controller teardown, once from the class itself), and
   * the second call must neither throw nor undo anything.
   */
  override destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#cancelGamesWait?.();
    super.destroy();
  }

  /**
   * Open the one-time dialog and save the answer, sharing the work with any caller that arrives
   * while it is open (design D7). Remembers a saved answer for the rest of the visit.
   * @param displayName The name the dialog proposes.
   * @returns The saved profile, or undefined when the dialog closed unanswered or saving failed.
   */
  #askOnce(displayName: string): Promise<ArcadeProfile | undefined> {
    if (this.#asking) return this.#asking;
    const asking = (async () => {
      try {
        const answer = await this.#deps.askPrivacy(this._host, displayName);
        if (!answer) return undefined;
        const saved = await this.#deps.api.updateProfile({ isPublic: answer.isPublic, displayName: answer.displayName });
        if (saved) {
          this.#profile.setValue(saved);
          this.#answered = true;
        }
        return saved;
      } finally {
        this.#asking = undefined;
      }
    })();
    this.#asking = asking;
    return asking;
  }

  /**
   * Tell the player who took first place from them since they last looked: once per visit, because
   * this context exists once per visit (D10). A plain warning toast, so the notification centre
   * shows and keeps it; its message says where to look, since a click on it does nothing.
   */
  async #announceBeaten(): Promise<void> {
    const events = await this.#deps.api.takeBeaten();
    if (events.length > 0) await this.#gamesLoaded();
    for (const event of events) {
      const game = this.getGames().find((g) => g.alias === event.game);
      const name = game ? this.#gameName(game, event.board) : event.game;
      const score = formatScore(event.format, event.value);
      this.#toast(
        'warning',
        this.#localize.termOrDefault(
          `${AREA}_beaten`,
          `${event.byDisplayName} took first place on ${name} from you (${score}). Open the Arcade to see the board.`,
          event.byDisplayName,
          name,
          score,
        ),
      );
    }
  }

  /**
   * Wait until at least one game is registered, or give up after a few seconds. Packages register
   * their bundles asynchronously, so on a fresh page the beaten check can answer before the game
   * manifests that name its boards are in; without this the toast would say a manifest alias where
   * the game's name belongs. Giving up is fine: the message then falls back to the alias.
   * @returns Resolves once there are games or the wait is over.
   */
  #gamesLoaded(): Promise<void> {
    if (this.#games.getValue().length > 0) return Promise.resolve();
    return new Promise((resolve) => {
      let subscription: { unsubscribe(): void } | undefined;
      /** Stops waiting, once, and lets the waiting caller carry on (it checks for destruction itself). */
      const done = () => {
        clearTimeout(timer);
        subscription?.unsubscribe();
        this.#cancelGamesWait = undefined;
        resolve();
      };
      const timer = setTimeout(done, this.#deps.gamesWaitMs);
      this.#cancelGamesWait = done;
      // The state replays its current value on subscribe, which is empty here, so `done` never runs before `subscription` is set.
      subscription = this.#games.asObservable().subscribe((games) => {
        if (games.length > 0) done();
      });
    });
  }

  /**
   * Raise a toast unless the desktop has gone, and never let a toast that cannot be raised break a
   * score submit or the beaten check: the score is saved either way.
   * @param color The toast's colour.
   * @param message The text.
   */
  #toast(color: 'positive' | 'warning', message: string): void {
    if (this.#destroyed) return;
    try {
      this.#deps.toast(this._host, color, message);
    } catch (error) {
      console.warn('[UmbraDesktop Arcade] A notification could not be raised.', error);
    }
  }

  /**
   * A board's name for a message: the game's name, plus the board's when the game has several.
   * `localize.string` resolves a `#key` and passes a literal through, so a manifest may use either.
   * @param game The game.
   * @param board The board alias.
   * @returns The name.
   */
  #gameName(game: ArcadeGame, board: string): string {
    const gameName = this.#localize.string(game.label);
    if (game.leaderboards.length < 2) return gameName;
    const label = game.leaderboards.find((b) => b.alias === board)?.label ?? board;
    return `${gameName}, ${this.#localize.string(label)}`;
  }

  /**
   * Raise an ordinary Umbraco toast on the desktop's document; the desktop's notification watcher
   * moves it into the notification centre (`2026-09-27-desktop-notifications-design.md`).
   * `getContext` rejects rather than resolving undefined when no notification context answers, so a
   * missing one is caught here.
   * @param color The toast's colour.
   * @param message The text.
   */
  async #peek(color: 'positive' | 'warning', message: string): Promise<void> {
    try {
      const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);
      notifications?.peek(color, { data: { message } });
    } catch {
      // No notification context (the desktop is gone, or not in a backoffice): the toast is a courtesy.
    }
  }
}

export { UmbraDesktopArcadeContext as api };
