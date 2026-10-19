import type { UmbraDesktopMediaRef } from './media-api.js';

/**
 * Runs an operation: a list of steps, one item each, one at a time (plan task 4.3). One item that fails
 * does not stop the rest, and says why in the server's words (design §4 and §7). Pause finishes the
 * step in flight and starts nothing new; Cancel does the same and ends, rolling nothing back. Retry
 * failed runs only the failed items again, in the same operation (plan task 7.2), so the Transfers
 * window keeps one section for it.
 */

/** What a step answers with. */
export interface UmbraDesktopStepResult {
  /** Umbraco's reason, when the item did not go. */
  error?: string;
  /** The keys of what the step created, as a copy does. */
  created?: string[];
}

/** One item's work. */
export interface UmbraDesktopOperationStep {
  /** The item. */
  item: UmbraDesktopMediaRef;
  /** The folders whose contents the step changes, null for the root, so windows on them reload. */
  affects: ReadonlyArray<string | null>;
  /** Do it. */
  run(): Promise<UmbraDesktopStepResult>;
}

/** Where an operation is. */
export interface UmbraDesktopOperationProgress {
  /** How many steps there are. */
  total: number;
  /** How many have finished, worked or not. */
  done: number;
  /** How many of those failed. */
  failed: number;
  /** The item being worked on. */
  current?: UmbraDesktopMediaRef;
  /** Running, paused, cancelled or finished. */
  state: 'running' | 'paused' | 'cancelled' | 'finished';
}

/** How an operation ended. */
export interface UmbraDesktopOperationResult {
  /** The items that went, with what was created for each. */
  succeeded: Array<{ item: UmbraDesktopMediaRef; created?: string[]; affects: ReadonlyArray<string | null> }>;
  /** The items that did not, with Umbraco's reason. */
  failed: Array<{ item: UmbraDesktopMediaRef; reason: string }>;
  /** Whether it was cancelled before every step ran. */
  cancelled: boolean;
}

/** Where one item of an operation is. */
export type UmbraDesktopOperationRowStatus = 'waiting' | 'running' | 'done' | 'failed' | 'cancelled';

/** One item of an operation, for the Transfers window's row. */
export interface UmbraDesktopOperationRow {
  /** The item. */
  item: UmbraDesktopMediaRef;
  /** Where it is. */
  status: UmbraDesktopOperationRowStatus;
  /** Umbraco's reason, when it failed. */
  reason?: string;
  /** The keys of what it created, as a copy does. */
  created?: string[];
}

/** A running operation. */
export interface UmbraDesktopOperationHandle {
  /** Where it is now. */
  progress(): UmbraDesktopOperationProgress;
  /** Where each item is now, in the order of the steps. */
  rows(): UmbraDesktopOperationRow[];
  /** Finish the step in flight, then wait. */
  pause(): void;
  /** Carry on after a pause. */
  resume(): void;
  /** Finish the step in flight, then end. Nothing done is rolled back. */
  cancel(): void;
  /**
   * Run the failed items again, once the operation has finished.
   * @param only Just these items, as a row's own Retry asks; every failed item when left out.
   * @returns How the whole operation stands after the retry.
   */
  retry(only?: ReadonlyArray<UmbraDesktopMediaRef>): Promise<UmbraDesktopOperationResult>;
  /** How it ended, the first time through. */
  done: Promise<UmbraDesktopOperationResult>;
}

/**
 * Start an operation.
 * @param steps Its steps, in order.
 * @param onProgress Told after every change, with a copy of where it is.
 * @param onStep Told after every step that worked, as it happens, so windows can follow.
 * @returns The running operation.
 */
export function runOperation(
  steps: ReadonlyArray<UmbraDesktopOperationStep>,
  onProgress?: (progress: UmbraDesktopOperationProgress) => void,
  onStep?: (step: UmbraDesktopOperationStep, result: UmbraDesktopStepResult) => void,
): UmbraDesktopOperationHandle {
  const progress: UmbraDesktopOperationProgress = { total: steps.length, done: 0, failed: 0, state: 'running' };
  const rows: UmbraDesktopOperationRow[] = steps.map((step) => ({ item: step.item, status: 'waiting' }));
  const result: UmbraDesktopOperationResult = { succeeded: [], failed: [], cancelled: false };
  let paused = false;
  let cancelled = false;
  let wake: (() => void) | undefined;
  const report = () => onProgress?.({ ...progress });
  const snapshot = (): UmbraDesktopOperationResult => ({ succeeded: [...result.succeeded], failed: [...result.failed], cancelled: result.cancelled });

  /**
   * Run some of the steps, in order: all of them the first time, the failed ones on a retry.
   * @param indices Which steps.
   * @returns How the operation stands after.
   */
  const pass = async (indices: ReadonlyArray<number>): Promise<UmbraDesktopOperationResult> => {
    // Started after the caller has its handle, so a pause or cancel straight away is in time.
    await Promise.resolve();
    for (const index of indices) {
      while (paused && !cancelled) await new Promise<void>((resolve) => (wake = resolve));
      if (cancelled) break;
      const step = steps[index];
      const row = rows[index];
      row.status = 'running';
      progress.current = step.item;
      report();
      let answer: UmbraDesktopStepResult;
      try {
        answer = await step.run();
      } catch (error) {
        answer = { error: (error as Error)?.message ?? String(error) };
      }
      progress.done += 1;
      if (answer.error) {
        progress.failed += 1;
        row.status = 'failed';
        row.reason = answer.error;
        result.failed.push({ item: step.item, reason: answer.error });
      } else {
        row.status = 'done';
        row.created = answer.created;
        result.succeeded.push({ item: step.item, created: answer.created, affects: step.affects });
        onStep?.(step, answer);
      }
      if (paused && !cancelled) {
        progress.state = 'paused';
        report();
      }
    }
    for (const index of indices) if (rows[index].status === 'waiting') rows[index].status = 'cancelled';
    result.cancelled = cancelled && rows.some((row) => row.status === 'cancelled');
    progress.current = undefined;
    progress.state = result.cancelled ? 'cancelled' : 'finished';
    report();
    return snapshot();
  };

  const done = pass(steps.map((_, index) => index));
  return {
    progress: () => ({ ...progress }),
    rows: () => rows.map((row) => ({ ...row })),
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
      progress.state = 'running';
      report();
      wake?.();
    },
    cancel: () => {
      cancelled = true;
      wake?.();
    },
    retry: (only) => {
      const asked = only ? new Set(only.map((item) => item.unique)) : undefined;
      const failed = rows.flatMap((row, index) => (row.status === 'failed' && (!asked || asked.has(row.item.unique)) ? [index] : []));
      if (!failed.length || progress.state === 'running' || progress.state === 'paused') return Promise.resolve(snapshot());
      const again = new Set(failed.map((index) => steps[index].item));
      result.failed = result.failed.filter((each) => !again.has(each.item));
      for (const index of failed) rows[index] = { item: steps[index].item, status: 'waiting' };
      progress.done -= failed.length;
      progress.failed -= failed.length;
      progress.state = 'running';
      paused = false;
      cancelled = false;
      report();
      return pass(failed);
    },
    done,
  };
}
