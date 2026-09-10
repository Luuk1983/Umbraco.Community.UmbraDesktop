import { UMBRADESKTOP_BOOT_PARAM } from './constants';
import { readBootHint } from './boot-storage';

/**
 * A trace of the boot, for the console.
 *
 * The boot spans a page load, three awaits, someone else's router and two storage keys, and when it
 * goes wrong it goes wrong *silently* — the user sees a boot screen lift onto the classic
 * backoffice, which looks identical whether the preference was off, the access check failed, or a
 * navigation was swallowed by a router that was not listening yet. Two rounds of debugging went on
 * guessing which of those it was. This says.
 *
 * Deliberately noisy while the feature settles, and deliberately narrow about *when*: it prints
 * only for a browser that expects to boot into the desktop, so nobody who does not use the feature
 * ever sees a line. `?desktop=trace` turns it on regardless, which is the switch to reach for when
 * a boot is *not* happening and you want to know how far it got.
 */

/** The `?desktop=` value that turns the trace on for one load. */
const TRACE_PARAM_VALUE = 'trace';

/**
 * Whether the boot should narrate itself.
 * @param search `location.search`, including the leading `?`.
 * @param hint Whether this browser expects to boot into the desktop.
 * @returns True when trace lines should be written.
 */
export function isBootTraceEnabled(search: string, hint: boolean): boolean {
  if (new URLSearchParams(search).get(UMBRADESKTOP_BOOT_PARAM) === TRACE_PARAM_VALUE) return true;
  return hint;
}

/**
 * Write one step of the boot to the console, if tracing is on.
 * @param step What just happened, in the imperative past — "splash raised", "user resolved".
 * @param detail Anything worth seeing alongside it.
 */
export function bootTrace(step: string, detail?: unknown): void {
  if (!isBootTraceEnabled(window.location.search, readBootHint())) return;
  // eslint-disable-next-line no-console
  if (detail === undefined) console.info(`[UmbraDesktop boot] ${step}`);
  // eslint-disable-next-line no-console
  else console.info(`[UmbraDesktop boot] ${step}`, detail);
}
