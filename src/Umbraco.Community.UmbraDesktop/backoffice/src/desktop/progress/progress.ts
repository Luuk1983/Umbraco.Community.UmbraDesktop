/**
 * What a busy window draws, decided once.
 *
 * A window can be doing several things at a time, reported by more than one source: the frame
 * watcher reads core's media uploads, and an element app reports its own work. Every surface that
 * shows it — the title bar, the taskbar button, the close and reload guards, Exit — reads one
 * summary made here, which is what stops two of them disagreeing about whether a window is busy.
 * The same reason `notices.ts` decides the unsaved marker. Design #108 D1 and D2.
 *
 * Pure throughout, so the rules are tested before anything draws them.
 */

/**
 * One piece of work a window is doing, as its source reports it.
 *
 * Finished work is not a state here but an absence: a source stops reporting a task once it is
 * done, which is what clears the marker, including in a window that finished while minimized.
 */
export interface UmbraDesktopTask {
  /** Stable within its source, so a later report replaces the earlier one. */
  id: string;
  /** `running` while the work goes on; `failed` once it has ended and not everything worked. */
  state: 'running' | 'failed';
  /**
   * How much is done, in the same units as {@link total}. May be fractional: a file half uploaded
   * is half an item, which is what keeps a single large upload moving.
   */
  completed?: number;
  /** How much there is to do, when that is known. Absent means nobody knows, never zero. */
  total?: number;
  /** How many items did not make it, for "3 of 50 failed". */
  failed?: number;
  /** What the work is, as text or a `#key` the localizer resolves, e.g. "Uploading". */
  label?: string;
}

/** What a window's tasks add up to. The shape every surface reads. */
export interface UmbraDesktopWindowProgress {
  /**
   * `determinate` draws a proportion, `indeterminate` draws activity with no percentage, and
   * `failed` is the end state a failure leaves. The three values a progress bar's own vocabulary
   * already has, so the attribute a theme selects on reads as what it means.
   */
  state: 'determinate' | 'indeterminate' | 'failed';
  /** 0 to 1. Absent while indeterminate. For a failure, where it stopped. */
  fraction?: number;
  /** Whole items done across the running tasks, for the caption. */
  completed: number;
  /** Items to do across the running tasks, when every one of them knows. */
  total?: number;
  /** Items that failed, across every task. */
  failed: number;
  /** The label every running task agrees on, or absent when they differ or none gave one. */
  label?: string;
}

/**
 * The label core's media uploads are shown under. A `#key`, so `localize.string` resolves it the
 * same way it resolves a key an app passes.
 */
export const UMBRADESKTOP_UPLOAD_TASK_LABEL = '#umbraDesktop_progressUploading';

/**
 * Add a window's tasks up into the one state it draws. Pure.
 *
 * Three rules, each from the issue:
 *
 * - **Counts are summed.** Two uploads of 10 and 40 are "14 of 50", one bar, because the desktop
 *   rather than each app is the thing that knows there are two.
 * - **One unknown total makes the whole window indeterminate.** A proportion of only the work that
 *   can be measured is a false percentage: it reaches the end while the rest is still going.
 * - **Running beats failed.** A failure is an end state, so it shows once nothing is running; until
 *   then its count rides along for the caption.
 * @param tasks Every task the window's sources currently report.
 * @returns The summary, or undefined when the window is doing nothing.
 */
export function summariseTasks(tasks: ReadonlyArray<UmbraDesktopTask>): UmbraDesktopWindowProgress | undefined {
  if (tasks.length === 0) return undefined;
  const failed = tasks.reduce((sum, task) => sum + (task.failed ?? 0), 0);
  const running = tasks.filter((task) => task.state === 'running');
  // The tasks the counts describe: the running ones while there are any, otherwise the failed ones,
  // so a failure's caption can still say "out of how many".
  const counted = running.length > 0 ? running : tasks;
  const known = counted.every((task) => task.total !== undefined);
  const done = counted.reduce((sum, task) => sum + (task.completed ?? 0), 0);
  const total = known ? counted.reduce((sum, task) => sum + (task.total ?? 0), 0) : undefined;
  const labels = new Set(counted.map((task) => task.label));
  const label = labels.size === 1 ? [...labels][0] : undefined;
  const base = { completed: Math.floor(done), total, failed, label };

  if (running.length === 0) {
    // A failure with nothing to count still has to be seen, so it draws as a whole ring in the
    // failure colour rather than as an empty one, which would read as "nothing happened".
    return { ...base, state: 'failed', fraction: total ? clampFraction(done / total) : 1 };
  }
  if (total === undefined) return { ...base, state: 'indeterminate' };
  return { ...base, state: 'determinate', fraction: total > 0 ? clampFraction(done / total) : 0 };
}

/**
 * Whether a window has work in flight, which is what the close, reload and Exit guards ask.
 * A failure is not: nothing is left to stop, so closing it loses nothing. Pure.
 * @param progress The window's summary.
 * @returns True while something is running.
 */
export function isBusy(progress: UmbraDesktopWindowProgress | undefined): boolean {
  return progress !== undefined && progress.state !== 'failed';
}

/** Only what {@link taskFromUploads} reads of one item in core's upload list. */
export interface UmbraDesktopUploadItem {
  /** Core's `UmbFileDropzoneItemStatus` value. */
  status?: string;
  /** Percent uploaded, 0 to 100. Absent until the dropzone first reports it. */
  progress?: number;
}

/** Upload statuses meaning the item will not arrive. `cancelled` is not one: somebody chose it. */
const FAILED_STATUSES = new Set(['error', 'not allowed']);

/**
 * Turn one batch of core's upload items into the one task they amount to. Pure.
 *
 * The items are a media dropzone's `progressItems()`: every file and folder in the drop, nested
 * ones included, each with a status and a percent. A `waiting` item counts its uploaded percent as
 * a fraction of an item, so a single large file moves the bar rather than sitting at nothing until
 * it lands. Every other status is a finished item, and the two that mean "will not arrive" are
 * counted as failures too. A folder is created at once and reports 100, so it counts as one quick
 * item.
 *
 * Returns undefined once nothing is waiting and nothing failed, which is what clears the marker.
 * Deciding which items are "this batch" is the watcher's job, not this function's. Design D3, D4.
 * @param items The batch's upload items.
 * @returns The task, or undefined when there is nothing to show.
 */
export function taskFromUploads(items: ReadonlyArray<UmbraDesktopUploadItem>): UmbraDesktopTask | undefined {
  let waiting = 0;
  let failed = 0;
  let done = 0;
  for (const item of items) {
    if (item.status === 'waiting') {
      waiting += 1;
      done += clampFraction((item.progress ?? 0) / 100);
    } else {
      done += 1;
      if (FAILED_STATUSES.has(item.status ?? '')) failed += 1;
    }
  }
  if (waiting === 0 && failed === 0) return undefined;
  return {
    id: 'media-upload',
    state: waiting > 0 ? 'running' : 'failed',
    completed: done,
    total: items.length,
    failed,
    label: UMBRADESKTOP_UPLOAD_TASK_LABEL,
  };
}

/** The states an app may report; `done` is how it ends a task rather than a state a task has. */
const REPORT_STATES = new Set(['running', 'failed', 'done']);

/**
 * Whether a value is a count a task may carry: a finite, non-negative number, or absent.
 * @param value The value an app sent.
 * @returns True when it is usable.
 */
function isCount(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

/**
 * Apply one report an app sent through `umbradesktop-task` to its task list. Pure.
 *
 * `done` removes the task, which is the only way a failed one goes: a failure stays until the app
 * that reported it says it is over (design D3). Anything else replaces the task with that id, or
 * adds it. A report that cannot be read is ignored and the list handed back unchanged, because the
 * detail comes from code this package does not own, and drawing a ring from `NaN` helps nobody. The
 * fields are copied one by one for the same reason: only what the desktop understands goes on its
 * model.
 * @param tasks The app's current tasks.
 * @param report The event's `detail`, as sent.
 * @returns The new list, or the input list when the report was unreadable.
 */
export function applyTaskReport(
  tasks: ReadonlyArray<UmbraDesktopTask>,
  report: unknown,
): ReadonlyArray<UmbraDesktopTask> {
  const r = report as Record<string, unknown> | null | undefined;
  if (!r || typeof r !== 'object') return tasks;
  if (typeof r.id !== 'string' || r.id === '' || !REPORT_STATES.has(r.state as string)) return tasks;
  if (!isCount(r.completed) || !isCount(r.total) || !isCount(r.failed)) return tasks;
  if (r.label !== undefined && typeof r.label !== 'string') return tasks;
  const others = tasks.filter((task) => task.id !== r.id);
  if (r.state === 'done') return others;
  const task: UmbraDesktopTask = { id: r.id, state: r.state as UmbraDesktopTask['state'] };
  if (r.completed !== undefined) task.completed = r.completed as number;
  if (r.total !== undefined) task.total = r.total as number;
  if (r.failed !== undefined) task.failed = r.failed as number;
  if (r.label !== undefined) task.label = r.label as string;
  // In place when it already existed, so a task's position does not jump each time it reports.
  const at = tasks.findIndex((existing) => existing.id === r.id);
  if (at < 0) return [...others, task];
  return tasks.map((existing, index) => (index === at ? task : existing));
}

/** Whatever a localizer needs to look like here; `this.localize.term` matches it. */
export type UmbraDesktopProgressTerm = (key: string, ...args: unknown[]) => string;

/**
 * The words for a window's progress: the taskbar button's tooltip, the progress bar's accessible
 * value, and the guard dialogs' description of what closing would stop. One function, so all three
 * say the same thing. Pure.
 * @param progress The window's summary.
 * @param term The localizer for this package's keys.
 * @param text The localizer for a label, which may be plain text or a `#key` (`localize.string`).
 * @returns The caption, or an empty string for an idle window.
 */
export function progressCaption(
  progress: UmbraDesktopWindowProgress | undefined,
  term: UmbraDesktopProgressTerm,
  text: (value: string) => string,
): string {
  if (!progress) return '';
  if (progress.state === 'failed') {
    return progress.failed > 0 && progress.total !== undefined
      ? term('umbraDesktop_progressFailedCount', progress.failed, progress.total)
      : term('umbraDesktop_progressFailed');
  }
  const name = progress.label ? text(progress.label) : term('umbraDesktop_progressWorking');
  if (progress.total === undefined) return name;
  return `${name} ${term('umbraDesktop_progressCount', progress.completed, progress.total)}`;
}

/**
 * Clamp a fraction into 0..1. A source reporting more done than there is to do must not draw past
 * the end of a ring.
 * @param value The fraction.
 * @returns The value, clamped.
 */
function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}
