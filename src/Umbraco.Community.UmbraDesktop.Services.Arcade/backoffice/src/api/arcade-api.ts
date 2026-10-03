import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { attempt, SECURITY, statusOf } from '../shared/http.js';
import type { UmbraDesktopGameLeaderboard } from '../games/game-manifest.js';

/**
 * The Arcade API, as the desktop sees it. The server half is `Api/ArcadeController.cs`; the shapes
 * are its response models, written out by hand, as Sticky Notes does, rather than a generated client
 * for ten calls. Every failure is an answer, never an exception: a game must never break because the
 * scoreboard is down.
 */

/** A player's settings. */
export interface ArcadeProfile {
  /** Their board name. */
  displayName: string;
  /** Whether they are shown on boards. */
  isPublic: boolean;
  /** Whether they are told when beaten. */
  notifyWhenBeaten: boolean;
  /** Whether the one-time question has been answered. */
  askedAboutPublic: boolean;
}

/** How a submit went. */
export type ArcadeSubmitResult =
  | { status: 'accepted'; isPersonalBest: boolean; previousBest: number | null; rank: number; isPublic: boolean; askedAboutPublic: boolean; displayName: string }
  | { status: 'rejected' }
  | { status: 'conflict' }
  | { status: 'failed' };

/** One row on a board. */
export interface ArcadeBoardEntry {
  /** Position. */
  rank: number;
  /** The player, for moderation. */
  userKey: string;
  /** Their name. */
  displayName: string;
  /** Their best. */
  value: number;
  /** When, ISO. */
  achievedAtUtc: string;
  /** Whether it is the viewer. */
  isViewer: boolean;
}

/** A board for the viewer. */
export interface ArcadeBoard {
  /** Whether anybody has played it. */
  played: boolean;
  /** The top public rows. */
  top: ArcadeBoardEntry[];
  /** The viewer's own row. */
  viewer: ArcadeBoardEntry | null;
  /** Whether the viewer is shown. */
  viewerIsPublic: boolean;
  /** Whether the viewer may moderate. */
  canModerate: boolean;
}

/** "Somebody took first place from you." */
export interface ArcadeBeatenEvent {
  /** The game's manifest alias. */
  game: string;
  /** The board's alias. */
  board: string;
  /** Who. */
  byDisplayName: string;
  /** With what. */
  value: number;
  /** How to show the value. */
  format: 'points' | 'time';
}

/** Everything the desktop asks the server. An interface so tests can answer it. */
export interface ArcadeApi {
  /** The caller's settings. */
  getProfile(): Promise<ArcadeProfile | undefined>;
  /** Change the caller's settings; undefined fields are left alone. @param patch The change. */
  updateProfile(patch: Partial<Pick<ArcadeProfile, 'displayName' | 'isPublic' | 'notifyWhenBeaten'>>): Promise<ArcadeProfile | undefined>;
  /** Delete everything about the caller. */
  deleteProfile(): Promise<boolean>;
  /** Submit a score. @param game The game alias. @param board The board. @param value The score. */
  submit(game: string, board: UmbraDesktopGameLeaderboard, value: number): Promise<ArcadeSubmitResult>;
  /** A board. @param game The game alias. @param board The board alias. */
  getBoard(game: string, board: string): Promise<ArcadeBoard | undefined>;
  /** The caller's best. @param game The game alias. @param board The board alias. */
  getBest(game: string, board: string): Promise<number | null | undefined>;
  /** The caller's unread beaten events, handed out once. */
  takeBeaten(): Promise<ArcadeBeatenEvent[]>;
  /** Remove one score (admin). @param game Game. @param board Board. @param userKey Player. */
  removeScore(game: string, board: string, userKey: string): Promise<boolean>;
  /** Empty a board (admin). @param game Game. @param board Board. */
  resetBoard(game: string, board: string): Promise<boolean>;
  /** Reset a display name (admin). @param userKey Player. */
  resetName(userKey: string): Promise<boolean>;
}

/** Where the controller is routed. */
const BASE = '/umbraco/management/api/v1/umbradesktop/services/arcade';

/** JSON request headers. */
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * The real API, over the backoffice's own HTTP client, which already carries the user's token.
 * @returns The API.
 */
export function createArcadeApi(): ArcadeApi {
  const enc = encodeURIComponent;
  return {
    async getProfile() {
      return (await attempt<ArcadeProfile>(() => umbHttpClient.get({ url: `${BASE}/profile`, security: [...SECURITY] }))).data;
    },
    async updateProfile(patch) {
      return (await attempt<ArcadeProfile>(() => umbHttpClient.put({ url: `${BASE}/profile`, security: [...SECURITY], body: patch, headers: JSON_HEADERS }))).data;
    },
    async deleteProfile() {
      return !(await attempt(() => umbHttpClient.delete({ url: `${BASE}/profile`, security: [...SECURITY] }))).error;
    },
    async submit(game, board, value) {
      const body = { game, board: board.alias, better: board.better, format: board.format, min: board.min ?? null, max: board.max ?? null, value: Math.round(value) };
      const { data, error } = await attempt<Omit<Extract<ArcadeSubmitResult, { status: 'accepted' }>, 'status'>>(() =>
        umbHttpClient.post({ url: `${BASE}/scores`, security: [...SECURITY], body, headers: JSON_HEADERS }),
      );
      if (data) return { status: 'accepted', ...data };
      // The status may sit on the error or on its problem details, as `isDenied` also allows for.
      const status = statusOf(error) ?? statusOf((error as { problemDetails?: unknown } | null)?.problemDetails);
      if (status === 409) return { status: 'conflict' };
      if (status === 400) return { status: 'rejected' };
      return { status: 'failed' };
    },
    async getBoard(game, board) {
      return (await attempt<ArcadeBoard>(() => umbHttpClient.get({ url: `${BASE}/boards/${enc(game)}/${enc(board)}`, security: [...SECURITY] }))).data;
    },
    async getBest(game, board) {
      const { data } = await attempt<{ value: number | null }>(() => umbHttpClient.get({ url: `${BASE}/best/${enc(game)}/${enc(board)}`, security: [...SECURITY] }));
      return data ? data.value : undefined;
    },
    async takeBeaten() {
      return (await attempt<ArcadeBeatenEvent[]>(() => umbHttpClient.post({ url: `${BASE}/beaten/take`, security: [...SECURITY] }))).data ?? [];
    },
    async removeScore(game, board, userKey) {
      return !(await attempt(() => umbHttpClient.delete({ url: `${BASE}/boards/${enc(game)}/${enc(board)}/scores/${enc(userKey)}`, security: [...SECURITY] }))).error;
    },
    async resetBoard(game, board) {
      return !(await attempt(() => umbHttpClient.delete({ url: `${BASE}/boards/${enc(game)}/${enc(board)}`, security: [...SECURITY] }))).error;
    },
    async resetName(userKey) {
      return !(await attempt(() => umbHttpClient.post({ url: `${BASE}/profiles/${enc(userKey)}/reset-name`, security: [...SECURITY] }))).error;
    },
  };
}
