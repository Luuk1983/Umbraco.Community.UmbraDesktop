/**
 * When the boot splash is allowed to say anything, and what it says.
 *
 * Separate from `splash.ts` because it is timing rather than DOM, and because the splash may depend
 * on nothing at all — see that file's header. This holds the one rule that stops the splash from
 * narrating a boot that is going perfectly well.
 */

/** A status line that holds its tongue until a boot has gone on long enough to deserve one. */
export interface UmbraDesktopBootStatus {
  /**
   * Says something, now or when the delay passes.
   * @param text The already-localized line, or a function returning one.
   *
   * A function is the safer form and the reason this accepts both. The line is set at the start of a
   * load and shown a second and a half later, and Umbraco's localization dictionaries are dynamic
   * imports that may not have arrived when it is set — `term()` returns the key itself when it
   * cannot resolve one. A frozen string therefore risks painting `umbraDesktop_bootLoadingSettings`
   * across a full-screen splash, and on the slow boot, which is the only boot that shows this at
   * all, and also the one most likely to still be loading extensions. A function is resolved at the
   * moment it is shown.
   */
  set(text: string | (() => string)): void;

  /**
   * Stops, clearing anything already said.
   *
   * Called when the desktop is ready, whether or not anything was ever shown. Safe to call twice.
   */
  stop(): void;
}

/** What a delayed status needs. */
export interface UmbraDesktopBootStatusOptions {
  /** How long a boot may run before the splash starts explaining itself, in milliseconds. */
  delayMs: number;

  /** Puts a line on screen, or takes it away when given null. */
  show: (text: string | null) => void;

  /** Arms the delay. Defaults to `window.setTimeout`; injected so tests need not wait. */
  schedule?: (fn: () => void, ms: number) => number;

  /** Disarms the delay. Defaults to `window.clearTimeout`. */
  cancel?: (handle: number) => void;
}

/**
 * A status line that stays quiet for {@link UmbraDesktopBootStatusOptions.delayMs}, then speaks.
 *
 * The delay is the whole feature. A line saying settings are loading is reassuring after a second
 * and a half and faintly alarming after eighty milliseconds, because it announces that something is
 * slow when nothing is. So the first message waits, and only the *latest* one is shown when the wait
 * ends — a boot that passed through three states while nobody was looking has nothing to catch up
 * on. After that it speaks immediately, because by then the splash is already talking and going
 * quiet again would read worse than saying the next thing.
 * @param options How long to wait, and where to put the line.
 * @returns The status line.
 */
export function delayedBootStatus(options: UmbraDesktopBootStatusOptions): UmbraDesktopBootStatus {
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => window.setTimeout(fn, ms));
  const cancel = options.cancel ?? ((handle: number) => window.clearTimeout(handle));

  /** The most recent line, whether or not it has been shown. */
  let latest: (() => string) | undefined;

  /** Whether the delay has passed, after which everything goes straight up. */
  let speaking = false;

  /** The armed timer, so it can be disarmed and so it is only ever armed once. */
  let handle: number | undefined;

  /** Whether {@link UmbraDesktopBootStatus.stop} has been called. */
  let stopped = false;

  return {
    set(text: string | (() => string)): void {
      if (stopped) return;

      latest = typeof text === 'function' ? text : () => text;

      if (speaking) {
        options.show(latest());
        return;
      }

      // Armed by the first message rather than at construction, so a boot that never has anything
      // to say never schedules anything either.
      handle ??= schedule(() => {
        // The timer can still fire after a stop: cancelling is best-effort in a browser and is not
        // guaranteed at all by an injected scheduler.
        if (stopped) return;

        speaking = true;
        if (latest !== undefined) options.show(latest());
      }, options.delayMs);
    },

    stop(): void {
      stopped = true;

      if (handle !== undefined) {
        cancel(handle);
        handle = undefined;
      }

      // Only clears what was actually shown. A boot that finished before the delay leaves the splash
      // exactly as it found it.
      if (speaking) options.show(null);
      speaking = false;
    },
  };
}
