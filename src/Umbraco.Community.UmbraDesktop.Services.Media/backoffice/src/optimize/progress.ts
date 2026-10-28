import type { OptimizeRun, RunItem } from './run-store.js';

/**
 * How far a run is, counted once for everyone who shows it: the Optimize window for the taskbar and
 * its own bar, and a caller of `optimizeMedia` through `onProgress` (Media Health's Done screen). One
 * function, so "38 of 214" on a caller's card and on the taskbar can never disagree.
 */

/** The statuses that count as done, for progress: everything the run has finished with. */
const PROCESSED = new Set<RunItem['status']>(['optimized', 'unchanged', 'failed']);

/**
 * The images a run optimizes: everything not skipped. A skipped file was never an image to work on,
 * so it is in neither figure.
 * @param run The run.
 * @returns Those items.
 */
export function imagesOf(run: Pick<OptimizeRun, 'items'>): RunItem[] {
  return run.items.filter((item) => item.status !== 'skipped');
}

/**
 * How many of a run's images it has finished with, of how many.
 * @param run The run.
 * @returns The two counts.
 */
export function progressOf(run: Pick<OptimizeRun, 'items'>): { completed: number; total: number } {
  const images = imagesOf(run);
  return { completed: images.filter((item) => PROCESSED.has(item.status)).length, total: images.length };
}
