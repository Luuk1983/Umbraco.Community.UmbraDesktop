import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import { UmbArrayState, UmbNumberState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { createArcadeApi } from '../api/arcade-api.js';
import type { ArcadeApi, ArcadeBoard, ArcadeOverview, ArcadeProfile, ArcadeSubmitResult } from '../api/arcade-api.js';
import { normaliseGames } from '../games/game-manifest.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { ARCADE_HUB_ALIAS } from '../hub/constants.js';
import { AREA } from '../shared/area.js';
import { formatScore } from '../shared/format.js';
import { rankText, say } from '../shared/phrases.js';
import { DESKTOP_WINDOWS } from '../shared/windows.js';
import type { DesktopWindows } from '../shared/windows.js';
import { clearActiveArcade, setActiveArcade, whileRaising } from './active-arcade.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from './arcade.context-token.js';
// Also defines the element, before any toast needs it.
import { ARCADE_BEATEN_TOAST_ELEMENT } from './beaten-toast.element.js';
import { UMBRADESKTOP_ARCADE_PRIVACY_MODAL } from './privacy-modal.token.js';
import type { ArcadePrivacyModalValue } from './privacy-modal.token.js';
// Defines the result card. Games place its tag and import nothing (design P2), so the Arcade defines
// it as soon as it loads, which is before any game can finish a round; a tag rendered earlier upgrades.
import '../pieces/result.element.js';
import '../pieces/leaderboard.element.js';

/** What the context needs from outside, injectable so tests need no server, modal or toast container. */
export interface ArcadeContextDeps {
  /** The server. */
  api: ArcadeApi;
  /** Where `umbraDesktopGame` manifests come from. */
  registry: typeof umbExtensionsRegistry;
  /** Ask the one-time question; undefined when closed without an answer. */
  askPrivacy(host: UmbControllerHost, displayName: string): Promise<ArcadePrivacyModalValue | undefined>;
  /** Raise a toast on the desktop, where the notification centre picks it up; `element` gives it its own element and data. */
  toast(host: UmbControllerHost, color: 'positive' | 'warning', message: string, element?: { name: string; data: unknown }): void;
  /** How long the beaten check waits for game manifests, in milliseconds; tests shorten it. */
  gamesWaitMs: number;
  /** Where the board last played per game is kept; a function so a locked-down browser's throwing storage is caught. */
  storage: () => Storage;
}

/** How long the beaten check waits for game manifests to register before naming a game by its alias. */
const GAMES_WAIT_MS = 3000;

/** What a game may say when it submits. Published API for games, only ever gains optional fields. */
export interface ArcadeSubmitOptions {
  /**
   * The game shows the Arcade's result card for this score, so the Arcade raises neither the
   * privacy dialog nor the "New best" toast: the card asks and celebrates instead (design P3, P13).
   */
  showsResult?: boolean;
}

/** An accepted submit as the game gets it: the server's answer plus what the result card needs. */
export type ArcadeGameResult = Extract<ArcadeSubmitResult, { status: 'accepted' }> & {
  /** The game's `umbraDesktopGame` alias. */
  game: string;
  /** The board's alias. */
  board: string;
  /** The value submitted. */
  value: number;
  /** The rank in words, in the backoffice language: "3rd". A game cannot import the Arcade's ordinals. */
  rankText: string;
};

/** What `submit` answers: an accepted result, or why not. */
export type ArcadeSubmitAnswer = ArcadeGameResult | Exclude<ArcadeSubmitResult, { status: 'accepted' }>;

/** A player's standing on one board, for a game's own display (Snake's Best chip, design P5). */
export interface ArcadeStanding {
  /** Their best. */
  best: number;
  /** Their rank, or would-be rank while hidden. */
  rank: number;
  /** The rank in words. */
  rankText: string;
}

/** A board the hub should show when it opens, or now if it is open (design §4). */
export interface ArcadeHubRequest {
  /** The game's alias. */
  game: string;
  /** The board's alias; the game's page picks the mode last played without one. */
  board?: string;
}

/** Where the board last played per game is kept, as one JSON object of game alias to board alias. */
export const LAST_BOARD_KEY = 'umbradesktop-arcade-last-board';

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

  /** The window manager, for opening the hub. Found on the desktop element, which hosts this context and provides it. */
  #windows?: DesktopWindows;

  /** The board the hub should show next, until the hub takes it. */
  readonly #hubRequest = new UmbObjectState<ArcadeHubRequest | undefined>(undefined);

  /** The board the hub should show next, as the hub observes it. */
  readonly hubRequest = this.#hubRequest.asObservable();

  /** Counts the writes this visit that changed a board; the value means nothing, only that it moved. */
  readonly #scoresChanged = new UmbNumberState(0);

  /**
   * Moves after every write that changes what a board shows: an accepted score, showing or hiding the
   * player's scores, a moderation, and the player deleting theirs. The hub stays open while the player
   * plays, so without this its overview and game page would go on showing the boards as they were
   * when it opened ("Not played yet" after a win). They observe it and read again quietly.
   */
  readonly scoresChanged = this.#scoresChanged.asObservable();

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
      toast: deps.toast ?? ((_host, color, message, element) => void this.#peek(color, message, element)),
      gamesWaitMs: deps.gamesWaitMs ?? GAMES_WAIT_MS,
      storage: deps.storage ?? (() => window.localStorage),
    };
    // So the beaten toast, which renders outside the desktop, can ask this context to show a board.
    setActiveArcade(this);
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
    this.consumeContext(DESKTOP_WINDOWS, (windows) => (this.#windows = windows));
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
   * @param options Whether the game shows the result card, in which case the Arcade neither asks nor toasts.
   * @returns How it went, with what the card needs when accepted, or undefined when the game or board is unknown.
   */
  async submit(game: string, board: string, value: number, options: ArcadeSubmitOptions = {}): Promise<ArcadeSubmitAnswer | undefined> {
    const found = this.getGames().find((g) => g.alias === game);
    const definition = found?.leaderboards.find((b) => b.alias === board);
    if (!found || !definition) {
      console.warn(`[UmbraDesktop Arcade] A score for "${game}" / "${board}" was ignored: no umbraDesktopGame manifest declares that board.`);
      return undefined;
    }
    const result = await this.#deps.api.submit(game, definition, value);
    if (result.status !== 'accepted') return result;
    this.#rememberBoard(game, board);
    this.#changed();
    const answer: ArcadeGameResult = { ...result, game, board, value, rankText: rankText(this.#localize, result.rank) };
    // The card asks and celebrates, so the Arcade does neither (design P3, P13). Once answered this
    // visit, a result read before the answer was saved is stale: hand the card the answer instead,
    // or it would ask again.
    if (options.showsResult) {
      if (!this.#answered) return answer;
      return { ...answer, askedAboutPublic: true, isPublic: this.#profile.getValue()?.isPublic ?? answer.isPublic };
    }

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
      const score = formatScore(definition.format, value, this.#localize.lang());
      const message = isPublic
        ? this.#localize.termOrDefault(`${AREA}_newBestRanked`, `New best on ${name}: ${score}, number ${result.rank}`, name, score, result.rank)
        : this.#localize.termOrDefault(`${AREA}_newBest`, `New best on ${name}: ${score}`, name, score);
      this.#toast('positive', message);
    }
    return { ...answer, isPublic };
  }

  /**
   * The board the player last submitted to in a game, so a game page and a panel opened without one
   * open on it (design P12). Kept in this browser only: it is a convenience, not data.
   * @param game The game's alias.
   * @returns The board's alias, or undefined when none is remembered.
   */
  lastBoard(game: string): string | undefined {
    try {
      const stored = JSON.parse(this.#deps.storage().getItem(LAST_BOARD_KEY) ?? '{}') as Record<string, unknown>;
      const board = stored?.[game];
      return typeof board === 'string' ? board : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Save the answer to "show your scores?" from a result card, or the quiet line's "Show them"
   * (design P7). Marks the question answered for this visit, as the dialog's answer does.
   * @param shown Whether to show the player's scores.
   * @returns Whether it saved.
   */
  async setScoresShown(shown: boolean): Promise<boolean> {
    const saved = await this.#deps.api.updateProfile({ isPublic: shown });
    if (!saved) return false;
    this.#profile.setValue(saved);
    this.#answered = true;
    this.#changed();
    return true;
  }

  /**
   * The player's standing on a board, for a game's own display.
   * @param game The game's alias.
   * @param board The board's alias.
   * @returns The standing, null when they have not played it, undefined when the server is unreachable.
   */
  async getStanding(game: string, board: string): Promise<ArcadeStanding | null | undefined> {
    const data = await this.#deps.api.getBoard(game, board);
    if (!data) return undefined;
    if (!data.viewer) return null;
    return { best: data.viewer.value, rank: data.viewer.rank, rankText: rankText(this.#localize, data.viewer.rank) };
  }

  /** The hub's overview. @returns Every board as the player sees it, or undefined when unreachable. */
  getOverview(): Promise<ArcadeOverview | undefined> {
    return this.#deps.api.getOverview();
  }

  /**
   * Show a board in the hub: remember it, then open the hub, which takes the request when it opens or
   * at once if it is open already (design §4). Used by the panel's "Open in the Arcade" and the beaten
   * toast. Nothing is kept when the hub cannot be opened, so a later visit does not jump to it.
   * @param game The game's alias.
   * @param board The board's alias, or none for the mode last played.
   * @returns Whether the hub opened.
   */
  showBoard(game: string, board?: string): boolean {
    if (this.#destroyed) return false;
    this.#hubRequest.setValue({ game, board });
    const opened = this.#windows?.openApp(ARCADE_HUB_ALIAS) ?? false;
    if (!opened) this.#hubRequest.setValue(undefined);
    return opened;
  }

  /** The hub has shown the requested board; forget it. */
  clearHubRequest(): void {
    this.#hubRequest.setValue(undefined);
  }

  /**
   * Remember the board just played. Never throws: a browser that refuses storage just forgets.
   * @param game The game's alias.
   * @param board The board's alias.
   */
  #rememberBoard(game: string, board: string): void {
    try {
      const storage = this.#deps.storage();
      const parsed: unknown = JSON.parse(storage.getItem(LAST_BOARD_KEY) ?? '{}');
      const stored = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
      storage.setItem(LAST_BOARD_KEY, JSON.stringify({ ...stored, [game]: board }));
    } catch {
      // A convenience only.
    }
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
    if (done) {
      this.#changed();
      await this.refreshProfile();
    }
    return done;
  }

  /** Remove a score (admin). @param game Game. @param board Board. @param userKey Player. @returns Whether it worked. */
  async removeScore(game: string, board: string, userKey: string): Promise<boolean> {
    return this.#changedIf(await this.#deps.api.removeScore(game, board, userKey));
  }

  /** Empty a board (admin). @param game Game. @param board Board. @returns Whether it worked. */
  async resetBoard(game: string, board: string): Promise<boolean> {
    return this.#changedIf(await this.#deps.api.resetBoard(game, board));
  }

  /** Reset a display name (admin), which every board the player is on shows. @param userKey Player. @returns Whether it worked. */
  async resetName(userKey: string): Promise<boolean> {
    return this.#changedIf(await this.#deps.api.resetName(userKey));
  }

  /** Say a board changed, through {@link scoresChanged}. */
  #changed(): void {
    this.#scoresChanged.setValue(this.#scoresChanged.getValue() + 1);
  }

  /**
   * Say a board changed when a write worked; a moderation's one line.
   * @param done Whether the server accepted the write.
   * @returns `done`, for the caller to pass on.
   */
  #changedIf(done: boolean): boolean {
    if (done) this.#changed();
    return done;
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
    clearActiveArcade(this);
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
          // Shown or hidden, the boards now show the score differently.
          this.#changed();
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
   * this context exists once per visit (D10). A warning toast naming both scores and where the player
   * stands now (design P13), raised with the Arcade's own element: the desktop draws the toast itself
   * from its headline and message, and selecting it raises that element again, which opens the board
   * (settled point 11, `beaten-toast.element.ts`).
   */
  async #announceBeaten(): Promise<void> {
    const events = await this.#deps.api.takeBeaten();
    if (events.length > 0) await this.#gamesLoaded();
    for (const event of events) {
      if (this.#destroyed) return;
      const game = this.getGames().find((g) => g.alias === event.game);
      const name = game ? this.#gameName(game, event.board) : event.game;
      const theirs = formatScore(event.format, event.value, this.#localize.lang());
      const headline = say(this.#localize, 'beatenHeadline', '{0} took first place from you on {1}', event.byDisplayName, name);
      // The player's own row now, for "your 480" and "You are 2nd now". One read per event, and there
      // is at most one event per board.
      const viewer = (await this.#deps.api.getBoard(event.game, event.board))?.viewer;
      const open = say(this.#localize, 'beatenOpen', 'Select to open the leaderboard.');
      const message = viewer
        ? `${say(this.#localize, 'beatenScore', '{0} beats your {1}.', theirs, formatScore(event.format, viewer.value, this.#localize.lang()))} ${say(this.#localize, 'beatenRank', 'You are {0} now.', rankText(this.#localize, viewer.rank))} ${open}`
        : `${say(this.#localize, 'beatenWith', 'With {0}.', theirs)} ${open}`;
      this.#toast('warning', message, {
        name: ARCADE_BEATEN_TOAST_ELEMENT,
        data: { headline, message, game: event.game, board: event.board },
      });
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
   * @param element The toast's own element and its data, for a toast that does something when selected.
   */
  #toast(color: 'positive' | 'warning', message: string, element?: { name: string; data: unknown }): void {
    if (this.#destroyed) return;
    try {
      this.#deps.toast(this._host, color, message, element);
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
   *
   * Raised inside `whileRaising`: core builds the toast's element synchronously inside `peek`, so the
   * beaten toast's element can tell this, the Arcade's own raise, from the desktop raising it again
   * because the player selected it.
   * @param color The toast's colour.
   * @param message The text.
   * @param element The toast's own element and its data, instead of core's default layout.
   */
  async #peek(color: 'positive' | 'warning', message: string, element?: { name: string; data: unknown }): Promise<void> {
    try {
      const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);
      whileRaising(() =>
        notifications?.peek(color, element ? ({ elementName: element.name, data: element.data } as never) : { data: { message } }),
      );
    } catch {
      // No notification context (the desktop is gone, or not in a backoffice): the toast is a courtesy.
    }
  }
}

export { UmbraDesktopArcadeContext as api };
