import { isStale } from '../health/health-model.js';
import type { HealthFolderCleanupAnswer } from '../health/health.client.js';
import type { UmbraDesktopMediaPlace } from './location.js';

/**
 * The one thing the Media Manager says about Media Cleanup (design §16.20): that the folder it shows,
 * with the folders under it, held something to clean up at the last check. Only while that check
 * counts, the rule Clean up uses (`isStale`, a day), since a hint that may be wrong is worse than none:
 * the Manager shows no sizes and no per-item facts for that reason.
 */

/** What the line says. */
export interface CleanupLine {
  /** Items no page uses. */
  unused: number;
  /** Used images over the oversized limit. */
  oversized: number;
  /** Whether it speaks for the whole library, at the root. */
  library: boolean;
  /** The check the counts are from, which Dismiss remembers. */
  checkId: number;
  /** When that check finished. */
  checkedAt: Date;
}

/**
 * The line for a place, or none.
 * @param answer The server's counts per folder, read once when the window opened.
 * @param place The place the window shows.
 * @param now The time now.
 * @param dismissed The check whose line was dismissed in this window, if any.
 * @returns The line, or undefined when there is no check, the check is stale, the place is the
 * recycle bin, it holds nothing to clean up, or its line was dismissed for this check.
 */
export function cleanupLineOf(answer: HealthFolderCleanupAnswer | undefined, place: UmbraDesktopMediaPlace, now: Date, dismissed?: number): CleanupLine | undefined {
  if (!answer || answer.checkId === null || !answer.checkedUtc || place.kind === 'bin') return undefined;
  if (answer.checkId === dismissed) return undefined;
  const checkedAt = new Date(answer.checkedUtc);
  if (isStale(checkedAt, now)) return undefined;
  const key = place.kind === 'folder' ? place.unique.toLowerCase() : null;
  const row = answer.folders.find((each) => (each.key?.toLowerCase() ?? null) === key);
  if (!row || row.unused + row.oversized === 0) return undefined;
  return { unused: row.unused, oversized: row.oversized, library: key === null, checkId: answer.checkId, checkedAt };
}
