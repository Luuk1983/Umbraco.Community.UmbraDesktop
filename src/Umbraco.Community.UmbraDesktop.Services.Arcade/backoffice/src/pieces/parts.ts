import { html, nothing } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { formatScore } from '../shared/format.js';
import { ARCADE_BOARD_SIZE } from './constants.js';

/** The crown for first place, from the mock. */
export const CROWN_PATH = 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8zm2.2 13h13.6v1.6H5.2z';

/** The trophy, the Arcade's own mark, from the mock. */
export const TROPHY_PATH =
  'M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1 1.7V7zm10 0v2.7A2 2 0 0 0 18 8V7h-1z';

/**
 * A one-path icon, decorative: every place that draws one says the same thing in words beside it.
 * @param path The path data.
 * @param className Its class, which sizes and colours it.
 * @returns The icon.
 */
export const icon = (path: string, className: string): TemplateResult =>
  html`<svg class=${className} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d=${path}></path></svg>`;

/**
 * Initials for an avatar: first and last word, so "Anna de Vries" is AV. Avatars beyond initials are
 * out of scope (design §5).
 * @param name The display name.
 * @returns One or two letters, or `?` for a blank name.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words[words.length - 1]][0] : '';
  return `${first}${last}`.toLocaleUpperCase();
}

/** How many avatar colours `look.ts` defines (`.av` and `.a1` to `.a4`). */
export const AVATAR_HUES = 5;

/**
 * A player's avatar colour, from their key rather than their name, so a renamed player keeps it.
 * @param key The user key.
 * @returns 0 to {@link AVATAR_HUES} - 1.
 */
export function avatarHue(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % AVATAR_HUES;
}

/**
 * Which medal a rank gets: gold, silver, bronze, or plain.
 * @param rank The rank.
 * @returns The class.
 */
export function medalKind(rank: number): 'g' | 's' | 'b' | 'p' {
  return rank === 1 ? 'g' : rank === 2 ? 's' : rank === 3 ? 'b' : 'p';
}

/**
 * A rank as a medal. The number is the text, so a screen reader reads the rank.
 * @param rank The rank.
 * @returns The medal.
 */
export const medal = (rank: number): TemplateResult => html`<span class="medal ${medalKind(rank)}">${rank}</span>`;

/**
 * A player's avatar.
 * @param entry The row.
 * @returns The avatar.
 */
export const avatar = (entry: Pick<ArcadeBoardEntry, 'userKey' | 'displayName' | 'isViewer'>): TemplateResult => {
  const hue = avatarHue(entry.userKey);
  return html`<span class="av ${hue ? `a${hue}` : ''} ${entry.isViewer ? 'self' : ''}" aria-hidden="true">${initials(entry.displayName)}</span>`;
};

/** How a row is drawn. */
export interface RowOptions {
  /** The board's format. */
  format: 'points' | 'time';
  /** The word for the viewer: "You". */
  you: string;
  /** The backoffice language, for the digits. */
  lang: string;
  /** `replace` writes "You" for the viewer's name (card, panel); `mark` keeps the name and adds "You" (hub). */
  youMode: 'replace' | 'mark';
  /** When set, the viewer's row is a ghost row saying this: their scores are hidden. */
  onlyYou?: string;
  /** The date column, already formatted; none when omitted. */
  date?: string;
  /** Anything after the score: the hub's admin menu, or nothing. */
  extra?: TemplateResult | typeof nothing;
  /** An extra class on the row, for a piece's own rules (the panel hides podium ranks from its full-form list). */
  className?: string;
}

/**
 * One leaderboard row: medal, avatar, name, a crown for first, the score, and optionally the date.
 * @param entry The row.
 * @param options How to draw it.
 * @returns The row, as a list item.
 */
export function entryRow(entry: ArcadeBoardEntry, options: RowOptions): TemplateResult {
  const mine = entry.isViewer;
  const ghost = mine && options.onlyYou !== undefined;
  const name = mine && options.youMode === 'replace' ? options.you : entry.displayName;
  return html`<li class="lr ${mine ? 'mine' : ''} ${ghost ? 'ghost' : ''} ${options.className ?? ''}" data-rank=${entry.rank}>
    ${medal(entry.rank)}
    <span class="name">
      ${avatar(entry)}<span class="who">${name}</span>
      ${mine && options.youMode === 'mark' ? html`<span class="you">${options.you}</span>` : nothing}
      ${ghost ? html`<span class="only">${options.onlyYou}</span>` : nothing}
    </span>
    ${entry.rank === 1 ? icon(CROWN_PATH, 'crown') : nothing}
    <span class="sc">${formatScore(options.format, entry.value, options.lang)}</span>
    ${options.date ? html`<span class="dt">${options.date}</span>` : nothing}
    ${options.extra ?? nothing}
  </li>`;
}

/**
 * The podium: the top three standing second, first, third, as podiums do. Fewer than three leave
 * their step empty rather than closing the gap, so first is always in the middle.
 * @param top The first three rows, in rank order.
 * @param options The format, the word for the viewer and the language; `extra` draws something under
 *   each entry's score, which the hub uses for a moderator's menu, since the top three stand here
 *   rather than in the list. `onlyYou`, as for a row: a hidden viewer standing here is a ghost that
 *   says only they see it, so the podium does not suggest colleagues see them there.
 * @returns The podium.
 */
export function podium(
  top: ReadonlyArray<ArcadeBoardEntry>,
  options: Pick<RowOptions, 'format' | 'you' | 'lang' | 'onlyYou'> & { extra?: (entry: ArcadeBoardEntry) => TemplateResult | typeof nothing },
): TemplateResult {
  const order = [top[1], top[0], top[2]];
  return html`<div class="podium">
    ${order.map((entry) =>
      entry
        ? html`<div class="pod ${entry.isViewer ? 'mine' : ''} ${entry.isViewer && options.onlyYou !== undefined ? 'ghost' : ''}" data-rank=${entry.rank}>
            ${entry.rank === 1 ? icon(CROWN_PATH, 'crown') : nothing}
            ${avatar(entry)}
            <span class="pn">${entry.isViewer ? options.you : entry.displayName}</span>
            ${entry.isViewer && options.onlyYou !== undefined ? html`<span class="only">${options.onlyYou}</span>` : nothing}
            <span class="ps">${formatScore(options.format, entry.value, options.lang)}</span>
            ${options.extra?.(entry) ?? nothing}
            <div class="step s${entry.rank}">${entry.rank}</div>
          </div>`
        : html`<div class="pod empty"></div>`,
    )}
  </div>`;
}

/**
 * A whole board's list as the viewer sees it, their row to pin under it when they are outside it, and
 * whether a gap marker goes between the two.
 *
 * `top` ranks shown players only, while a hidden viewer's rank counts themselves. So a hidden viewer
 * whose rank is within {@link ARCADE_BOARD_SIZE} is merged in at their rank and the rows are
 * renumbered by position, as {@link shortBoardRows} does. The list holds up to the board size, not
 * `top`'s length: on a full board the last shown row drops off, being one place lower as the viewer
 * sees it, and on a short board everyone stays, with the viewer listed rather than pinned under a gap
 * that would suggest players hidden between. Drawing them pinned instead would show their rank twice.
 *
 * The gap is only for players actually standing between the list and the pinned row, so a viewer
 * right under a full list is pinned without one.
 * @param board The board read.
 * @returns The rows to list, the viewer's row to pin if any, and whether a gap goes above it.
 */
export function listRows(board: ArcadeBoard): { rows: ArcadeBoardEntry[]; pinned?: ArcadeBoardEntry; gap: boolean } {
  const viewer = board.viewer;
  if (!viewer || board.top.some((entry) => entry.isViewer)) return { rows: board.top, gap: false };
  if (viewer.rank > ARCADE_BOARD_SIZE) {
    const last = board.top.length ? board.top[board.top.length - 1].rank : 0;
    return { rows: board.top, pinned: viewer, gap: viewer.rank > last + 1 };
  }
  const merged = [...board.top];
  merged.splice(viewer.rank - 1, 0, viewer);
  return { rows: merged.slice(0, ARCADE_BOARD_SIZE).map((entry, index) => ({ ...entry, rank: index + 1 })), gap: false };
}

/**
 * The full card's short board of three (settled point 2): ranks 1 to 3 when the viewer is in the top
 * three, otherwise the leader, the player directly above, and the viewer, with a gap marker when
 * those are not neighbours.
 *
 * `top` is ranked without a hidden viewer, so when the viewer is merged in, the rows are renumbered by
 * position: that is the board as the viewer sees it, which is the rank the card states.
 * @param board The board read.
 * @returns Up to three rows and at most one gap marker.
 */
export function shortBoardRows(board: ArcadeBoard): Array<ArcadeBoardEntry | 'gap'> {
  const viewer = board.viewer;
  const others = board.top.filter((entry) => !entry.isViewer);
  if (!viewer) return board.top.slice(0, 3);
  if (viewer.rank <= 3) {
    const merged = [...others];
    merged.splice(viewer.rank - 1, 0, viewer);
    return merged.slice(0, 3).map((entry, index) => ({ ...entry, rank: index + 1 }));
  }
  const rows: Array<ArcadeBoardEntry | 'gap'> = [];
  const leader = others[0];
  if (leader) rows.push(leader);
  const above = board.above;
  // By player, not rank: a player tied with the leader shares their rank but is still someone else.
  if (above && above.userKey !== leader?.userKey) {
    if (above.rank > 2) rows.push('gap');
    rows.push(above);
  }
  rows.push(viewer);
  return rows;
}
