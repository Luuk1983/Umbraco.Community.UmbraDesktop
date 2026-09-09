/** Storage keys, URL flag and timing for booting straight into the desktop. */

/**
 * Browser-level mirror of the boot preference, read synchronously before the current user is known.
 *
 * Deliberately *not* user-scoped, unlike `settingsStorageKey`. The splash has to go up during the
 * bundle module's own evaluation, and at that point nothing can say who is logged in — the
 * current-user request has not returned. So this answers only one question, "does this browser
 * expect to boot into the desktop", and the worst a wrong answer costs is a splash that lifts onto
 * the classic backoffice. Where we actually navigate is decided later, from the authoritative
 * per-user payload.
 *
 * That also means a shared machine can show user B a brief splash because user A boots into the
 * desktop. A cosmetic splash is the accepted price for a boot with no flash; sending B to the wrong
 * place would not be.
 */
export const UMBRADESKTOP_BOOT_HINT_KEY = 'umbradesktop:boot:hint';

/**
 * Marker written immediately before a boot redirect and cleared once the desktop has actually
 * mounted.
 *
 * Finding one on the next boot means the last attempt never finished, so that boot is skipped. This
 * matters more here than it would elsewhere: the desktop hides the backoffice header as it mounts,
 * so a desktop that breaks *after* mounting leaves no navigation at all, and a boot that repeats
 * would put the user back there on every load.
 */
export const UMBRADESKTOP_BOOT_MARKER_KEY = 'umbradesktop:boot:marker';

/**
 * Session-scoped suppression, written when the user explicitly exits the desktop.
 *
 * In `sessionStorage` rather than `localStorage` so that leaving survives a refresh but not the tab:
 * exiting means "not now", not "turn the setting off".
 */
export const UMBRADESKTOP_BOOT_EXITED_KEY = 'umbradesktop:boot:exited';

/** Query parameter that skips the boot for one load: `/umbraco?desktop=off`. */
export const UMBRADESKTOP_BOOT_PARAM = 'desktop';

/** The value of {@link UMBRADESKTOP_BOOT_PARAM} that skips the boot. */
export const UMBRADESKTOP_BOOT_PARAM_OFF = 'off';

/**
 * How long to wait for the wallpaper image before handing the screen over anyway, in milliseconds.
 *
 * A bound rather than a target: it exists so a hung image request cannot keep the desktop hidden,
 * and in normal use the image wins the race long before this. See `wallpaper-ready.ts`.
 */
export const UMBRADESKTOP_WALLPAPER_WAIT_MS = 8000;

/**
 * How long the splash may cover the backoffice before it lifts regardless, in milliseconds.
 *
 * A **last resort**, not a routine event: the only thing standing between a readiness signal that
 * never arrives and an opaque overlay sitting on top of a working backoffice, since the splash
 * deliberately has no CSS-only expiry.
 *
 * It started at 5 seconds, which was wrong in a way that only showed on a throttled connection: the
 * timeout fired mid-boot and lifted the splash onto a half-built backoffice — header up, section
 * panel empty — which is the exact flash the splash exists to prevent. Anything the desktop's own
 * hand-off has to beat cannot be tuned to a fast machine. So it is now long enough that reaching it
 * means something is actually broken rather than merely slow, and long enough to sit outside
 * {@link UMBRADESKTOP_WALLPAPER_WAIT_MS} on top of a slow boot.
 */
export const UMBRADESKTOP_SPLASH_TIMEOUT_MS = 30000;
