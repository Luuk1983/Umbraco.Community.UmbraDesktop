import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { customElement, html } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_MODAL_MANAGER_CONTEXT } from '@umbraco-cms/backoffice/modal';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import type { ArcadeBoard, ArcadeProfile } from '../api/arcade-api.js';
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
}

/**
 * Mount a wrapper that provides a fake Arcade context and a fake window manager, recording every
 * call as a string so a test asserts on what the element asked for.
 * @param options What the fakes answer.
 * @returns The wrapper to mount the element under, and the recorded calls.
 */
export async function arcadeHarness(options: ArcadeHarnessOptions = {}) {
  const calls: string[] = [];
  const wrapper = document.createElement('umbradesktop-arcade-test-wrapper') as UmbraDesktopArcadeTestWrapper;
  document.body.append(wrapper);
  after(() => wrapper.remove());
  const games = new UmbArrayState<ArcadeGame>(options.games ?? [], (g) => g.alias);
  const profile = new UmbObjectState<ArcadeProfile | undefined>(options.profile);
  const fake = {
    getHostElement: () => wrapper,
    games: games.asObservable(),
    profile: profile.asObservable(),
    getBoard: async (game: string, board: string) => { calls.push(`getBoard:${game}:${board}`); return options.boardFor ? options.boardFor(game, board) : options.board; },
    refreshProfile: async () => { calls.push('refreshProfile'); },
    updateProfile: async (patch: unknown) => { calls.push(`updateProfile:${JSON.stringify(patch)}`); return !options.failWrites; },
    deleteMyScores: async () => { calls.push('deleteMyScores'); return !options.failWrites; },
    removeScore: async (game: string, board: string, key: string) => { calls.push(`removeScore:${game}:${board}:${key}`); return !options.failWrites; },
    resetBoard: async (game: string, board: string) => { calls.push(`resetBoard:${game}:${board}`); return !options.failWrites; },
    resetName: async (key: string) => { calls.push(`resetName:${key}`); return !options.failWrites; },
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
  await wrapper.updateComplete;
  return { wrapper, calls };
}
