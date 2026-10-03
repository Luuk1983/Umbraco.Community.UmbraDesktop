import type { ManifestBase } from '@umbraco-cms/backoffice/extension-api';

/** One board a game keeps score on. */
export interface UmbraDesktopGameLeaderboard {
  /** Stable id within the game, lower case and dashes, e.g. `easy` or `draw-1`. Final once shipped. */
  alias: string;
  /** Heading on the hub: a `#` localisation key or a literal. */
  label: string;
  /** Which way is better. */
  better: 'higher' | 'lower';
  /** How the value reads: `points`, or `time` in milliseconds. */
  format: 'points' | 'time';
  /** The smallest value the server accepts, if any. */
  min?: number;
  /** The largest value the server accepts, if any. */
  max?: number;
}

/** What a `umbraDesktopGame` manifest carries. **Published API**: only ever gains optional fields. */
export interface MetaUmbraDesktopGame {
  /** The `umbraDesktopApp` alias that plays this game, for the hub's Play button. */
  app: string;
  /** The game's name on the hub: a `#` key or a literal. */
  label: string;
  /** Umbraco icon alias. */
  icon?: string;
  /** The boards, at least one. */
  leaderboards: UmbraDesktopGameLeaderboard[];
}

/**
 * A game the Arcade keeps score for (design D5). Separate from `umbraDesktopApp` because a game is
 * still just an app; this only says what to keep score of. Its alias is the game's identity in the
 * database, so like an app alias it is final once shipped.
 */
export interface ManifestUmbraDesktopGame extends ManifestBase {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopGame';
  /** The game. */
  meta: MetaUmbraDesktopGame;
}

declare global {
  /** Registers the type with Umbraco's manifest map. */
  interface UmbExtensionManifestMap {
    /** A game on the Arcade. */
    umbraDesktopGame: ManifestUmbraDesktopGame;
  }
}

/** A game as the Arcade uses it, after reading. */
export interface ArcadeGame {
  /** The manifest alias, the game's id on the server. */
  alias: string;
  /** The app that plays it. */
  app: string;
  /** Its name, still a key or a literal. */
  label: string;
  /** Its icon. */
  icon: string;
  /** Umbraco's weight, higher first, for tab order. */
  weight: number;
  /** Its boards. */
  leaderboards: UmbraDesktopGameLeaderboard[];
}

/**
 * Board aliases: what the server accepts (`ScoreRules.BoardAlias`, `MaxBoardAliasLength`). Checked
 * here too so a bad manifest is dropped with a console line at load, rather than every submit failing.
 */
const BOARD_ALIAS = /^[a-z0-9-]{1,64}$/;

/** Game aliases, which are manifest aliases: what the server accepts (`ScoreRules.GameAlias`, `MaxGameAliasLength`). */
const GAME_ALIAS = /^[A-Za-z0-9._-]{1,200}$/;

/** True for a non-empty string. */
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** True for a finite number or nothing. */
const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value));

/**
 * Read one leaderboard, or say what is wrong with it.
 * @param raw The manifest's entry.
 * @returns The board, or a reason.
 */
function readBoard(raw: unknown): UmbraDesktopGameLeaderboard | string {
  if (typeof raw !== 'object' || raw === null) return 'has a leaderboard that is not an object';
  const board = raw as Record<string, unknown>;
  if (!isText(board.alias) || !BOARD_ALIAS.test(board.alias)) return `has a leaderboard alias "${String(board.alias)}" that is not up to 64 lower case letters, digits and dashes`;
  if (!isText(board.label)) return `leaderboard "${board.alias}" has no label`;
  if (board.better !== 'higher' && board.better !== 'lower') return `leaderboard "${board.alias}" says better is "${String(board.better)}", not "higher" or "lower"`;
  if (board.format !== 'points' && board.format !== 'time') return `leaderboard "${board.alias}" says format is "${String(board.format)}", not "points" or "time"`;
  if (!isOptionalNumber(board.min) || !isOptionalNumber(board.max)) return `leaderboard "${board.alias}" has a min or max that is not a number`;
  return { alias: board.alias, label: board.label, better: board.better, format: board.format, min: board.min, max: board.max };
}

/**
 * Read registered `umbraDesktopGame` manifests into games, dropping any that are malformed.
 *
 * **Never throws**: a JSON manifest can hold anything, and one bad game must not take the Arcade
 * down. Pure, so it reports drops rather than logging them; the context does the console.
 * @param manifests The registered manifests.
 * @returns The games, by weight, and what was dropped and why.
 */
export function normaliseGames(manifests: ReadonlyArray<unknown>): {
  games: ArcadeGame[];
  dropped: Array<{ alias: string; reason: string }>;
} {
  const games: ArcadeGame[] = [];
  const dropped: Array<{ alias: string; reason: string }> = [];
  for (const raw of manifests) {
    const manifest = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const alias = isText(manifest.alias) ? manifest.alias : '(no alias)';
    const drop = (reason: string) => dropped.push({ alias, reason });
    if (alias === '(no alias)') { drop('has no alias'); continue; }
    if (!GAME_ALIAS.test(alias)) { drop('has an alias that is not up to 200 letters, digits, dots, dashes and underscores, which the server stores it as'); continue; }
    const meta = manifest.meta as Record<string, unknown> | undefined;
    if (typeof meta !== 'object' || meta === null) { drop('has no "meta" object'); continue; }
    if (!isText(meta.app)) { drop('has no "app", the desktop app that plays it'); continue; }
    if (!isText(meta.label)) { drop('has no "label"'); continue; }
    if (!Array.isArray(meta.leaderboards) || meta.leaderboards.length === 0) { drop('has no leaderboards'); continue; }
    const boards = meta.leaderboards.map(readBoard);
    const problem = boards.find((b): b is string => typeof b === 'string');
    if (problem) { drop(problem); continue; }
    const read = boards as UmbraDesktopGameLeaderboard[];
    if (new Set(read.map((b) => b.alias)).size !== read.length) { drop('has two leaderboards with the same alias'); continue; }
    games.push({
      alias,
      app: meta.app,
      label: meta.label,
      icon: isText(meta.icon) ? meta.icon : 'icon-game',
      weight: typeof manifest.weight === 'number' ? manifest.weight : 0,
      leaderboards: read,
    });
  }
  games.sort((a, b) => b.weight - a.weight);
  return { games, dropped };
}
