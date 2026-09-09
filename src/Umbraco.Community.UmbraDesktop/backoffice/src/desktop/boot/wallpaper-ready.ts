import { UMBRADESKTOP_WALLPAPER_WAIT_MS } from './constants';

/**
 * Waiting for the wallpaper image before the boot splash is taken down.
 *
 * The desktop paints the wallpaper's stored average colour underneath the image, so it is never
 * *undecorated* while the image decodes — which was the argument for handing over as soon as the
 * settings resolved. In use that argument does not hold up: on a slow connection the splash lifts
 * onto a flat colour and the wallpaper then fades in behind an already-visible desktop, which reads
 * as the boot finishing twice. Waiting costs a little more splash and gives the user one transition
 * instead of two.
 *
 * The average colour keeps its job regardless: it covers a wallpaper that arrives after this wait
 * has given up, and every later wallpaper change, which does not go through here at all.
 */

/**
 * Wait until a wallpaper image is ready to paint, or until it is clear that it will not be.
 *
 * Resolves — never rejects — on all four outcomes: no image to wait for, decoded, failed, or taken
 * too long. The splash is lowered on the back of this promise, so anything that left it pending
 * would hold the screen until the splash's own timeout.
 * @param url The wallpaper image URL, or null when the desktop is showing a gradient.
 * @param timeoutMs How long to wait. Defaults to {@link UMBRADESKTOP_WALLPAPER_WAIT_MS}.
 * @returns A promise that resolves when the desktop is as ready as it is going to get.
 */
export function waitForWallpaper(url: string | null, timeoutMs = UMBRADESKTOP_WALLPAPER_WAIT_MS): Promise<void> {
  if (!url) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(settle, timeoutMs);

    // The same URL is already being fetched by the surface's `background-image`, so this shares
    // that request rather than making a second one.
    const image = new Image();

    // Whichever of the three settles first wins, and all three are attached rather than chosen
    // between. `decode()` is the one that actually promises a bitmap ready to paint — `load` can
    // still be followed by a decode hitch on a large image — but it cannot be relied on alone: on a
    // detached image under load it has been seen not to settle for many seconds, which held this
    // wait open until its bound and failed its own test. The events are the floor under it, and a
    // decode rejection counts as settled rather than as an error, since a browser that will not
    // decode still paints the image or shows the average colour beneath it.
    image.addEventListener('load', settle, { once: true });
    image.addEventListener('error', settle, { once: true });
    image.src = url;
    if (typeof image.decode === 'function') image.decode().then(settle, settle);
  });
}
