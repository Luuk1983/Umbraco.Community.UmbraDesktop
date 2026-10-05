import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { customElement, html } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_MODAL_MANAGER_CONTEXT } from '@umbraco-cms/backoffice/modal';
import { UmbArrayState, UmbNumberState, UmbObjectState, UmbStringState } from '@umbraco-cms/backoffice/observable-api';
import type { ArcadeBoard, ArcadeOverview, ArcadeProfile } from '../api/arcade-api.js';
import type { ArcadeHubRequest } from '../context/arcade.context.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { ArcadeGame } from '../games/game-manifest.js';

/** A bare element that hosts the fake contexts, as the desktop element does in production. */
@customElement('umbradesktop-arcade-test-wrapper')
export class UmbraDesktopArcadeTestWrapper extends UmbLitElement {
  /** @returns A slot, so what a test mounts under the wrapper is laid out and can be measured. */
  override render() {
    return html`<slot></slot>`;
  }
}

/** What a test wants the fake Arcade to answer. */
export interface ArcadeHarnessOptions {
  /** What `getBoard` answers. */
  board?: ArcadeBoard;
  /** Answers `getBoard` per game and board alias; wins over `board` when given. */
  boardFor?: (game: string, board: string) => ArcadeBoard | undefined;
  /** Makes every write answer false, as the API does when the server refuses. */
  failWrites?: boolean;
  /** How the fake modal manager answers a confirm; defaults to confirming. */
  confirmAnswer?: 'confirm' | 'cancel';
  /** The registered games. */
  games?: ArcadeGame[];
  /** The player's settings. */
  profile?: ArcadeProfile;
  /** What `getOverview` answers. */
  overview?: ArcadeOverview;
  /** The board last played, per game alias. */
  lastBoard?: Record<string, string>;
  /** The theme id a fake desktop settings context publishes; no settings context when undefined. */
  theme?: string;
  /** A request already waiting when the hub opens. */
  hubRequest?: ArcadeHubRequest;
  /** What `showBoard` answers, as the real one does when the hub cannot be opened; defaults to true. */
  showBoardOpens?: boolean;
}

/**
 * Mount a wrapper that provides a fake Arcade context and a fake window manager, recording every
 * call as a string so a test asserts on what the element asked for. With `theme` set it also
 * provides a fake desktop settings context, so a piece's theme controller has something to read.
 *
 * Shared by the hub's tests and the pieces' tests, which is why it lives in `shared/`.
 * @param options What the fakes answer.
 * @returns The wrapper to mount the element under, the recorded calls, and the states behind the
 *   fake's observables (games, profile, theme, hub request, scores changed), so a test can change them mid-test.
 */
export async function arcadeHarness(options: ArcadeHarnessOptions = {}) {
  const calls: string[] = [];
  const wrapper = document.createElement('umbradesktop-arcade-test-wrapper') as UmbraDesktopArcadeTestWrapper;
  document.body.append(wrapper);
  after(() => wrapper.remove());
  const games = new UmbArrayState<ArcadeGame>(options.games ?? [], (g) => g.alias);
  const profile = new UmbObjectState<ArcadeProfile | undefined>(options.profile);
  const theme = new UmbStringState(options.theme ?? '');
  const request = new UmbObjectState<ArcadeHubRequest | undefined>(options.hubRequest);
  const scoresChanged = new UmbNumberState(0);
  /**
   * A write's answer, bumping `scoresChanged` when it is accepted, as the real context does after a
   * write that changes boards; so a hub piece that reloads on the signal is tested against the fake.
   * @returns Whether the write was accepted.
   */
  const changed = () => {
    if (options.failWrites) return false;
    scoresChanged.setValue(scoresChanged.getValue() + 1);
    return true;
  };
  const fake = {
    getHostElement: () => wrapper,
    games: games.asObservable(),
    profile: profile.asObservable(),
    scoresChanged: scoresChanged.asObservable(),
    getGames: () => games.getValue(),
    getOverview: async () => { calls.push('getOverview'); return options.overview; },
    setScoresShown: async (shown: boolean) => {
      calls.push(`shown:${shown}`);
      if (options.failWrites) return false;
      const before = profile.getValue();
      profile.setValue({ displayName: before?.displayName ?? 'Ada', notifyWhenBeaten: before?.notifyWhenBeaten ?? true, isPublic: shown, askedAboutPublic: true });
      return changed();
    },
    lastBoard: (game: string) => options.lastBoard?.[game],
    showBoard: (game: string, board?: string) => { calls.push(`show:${game}:${board ?? ''}`); return options.showBoardOpens ?? true; },
    hubRequest: request.asObservable(),
    clearHubRequest: () => { calls.push('clearHubRequest'); request.setValue(undefined); },
    getBoard: async (game: string, board: string) => { calls.push(`getBoard:${game}:${board}`); return options.boardFor ? options.boardFor(game, board) : options.board; },
    refreshProfile: async () => { calls.push('refreshProfile'); },
    // Applies the change to `profile` as the real context does, so the profile sees the emission (or,
    // for a change to the same values, the lack of one) that it would see in production. The keys keep
    // their order, as the server's answer does: the state compares by JSON, so a reordered copy of the
    // same settings would emit where production does not.
    updateProfile: async (patch: Partial<Pick<ArcadeProfile, 'displayName' | 'isPublic' | 'notifyWhenBeaten'>>) => {
      calls.push(`updateProfile:${JSON.stringify(patch)}`);
      if (options.failWrites) return false;
      const before = profile.getValue() ?? { displayName: 'Ada', isPublic: true, notifyWhenBeaten: true, askedAboutPublic: true };
      profile.setValue({ ...before, ...patch });
      return true;
    },
    deleteMyScores: async () => { calls.push('deleteMyScores'); return changed(); },
    removeScore: async (game: string, board: string, key: string) => { calls.push(`removeScore:${game}:${board}:${key}`); return changed(); },
    resetBoard: async (game: string, board: string) => { calls.push(`resetBoard:${game}:${board}`); return changed(); },
    resetName: async (key: string) => { calls.push(`resetName:${key}`); return changed(); },
  };
  wrapper.provideContext(UMBRADESKTOP_ARCADE_CONTEXT, fake as never);
  wrapper.provideContext(new UmbContextToken<UmbContextMinimal>('UmbraDesktopWindowManagerContext'), {
    getHostElement: () => wrapper,
    openApp: (alias: string) => { calls.push(`open:${alias}`); return true; },
  } as never);
  wrapper.provideContext(UMB_MODAL_MANAGER_CONTEXT, {
    getHostElement: () => wrapper,
    open: (_host: unknown, _token: unknown, args: { data: { headline: string } }) => {
      calls.push(`confirm:${args.data.headline}`);
      return { onSubmit: () => (options.confirmAnswer === 'cancel' ? Promise.reject(new Error('cancelled')) : Promise.resolve()) };
    },
  } as never);
  if (options.theme !== undefined) {
    wrapper.provideContext(new UmbContextToken<UmbContextMinimal>('UmbraDesktopSettingsContext'), {
      getHostElement: () => wrapper,
      theme: theme.asObservable(),
    } as never);
  }
  await wrapper.updateComplete;
  return { wrapper, calls, games, profile, theme, request, scoresChanged };
}
