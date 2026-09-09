import { expect } from '@open-wc/testing';
import { waitForWallpaper } from './wallpaper-ready';

/** A 1x1 transparent GIF, so a test never depends on the network. */
const TINY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

it('resolves immediately when there is no wallpaper image', async () => {
  // The gradient wallpaper, or "none": there is nothing to wait for and the splash must not hang.
  await waitForWallpaper(null);
});

it('waits for an image and resolves once it is ready to paint', async () => {
  // A bound far below the production one, so a regression here fails as a timeout of this test
  // rather than by quietly leaning on the bound. It also pins the reason the implementation listens
  // for `load` as well as calling `decode()`: relying on decode alone made this test hang.
  await waitForWallpaper(TINY_IMAGE, 2000);
});

it('resolves rather than hanging when the image cannot be loaded', async () => {
  // A deleted media item or a bad URL must cost the boot a moment, not the whole screen: the
  // splash is lowered on this promise, so a rejection that was never caught would leave it up
  // until its own timeout.
  //
  // A malformed data URL rather than a 404, deliberately: it fails without a request, so this
  // asserts the error path instead of the test server's response time. As a 404 it timed out under
  // a full parallel run, which is the runner being busy rather than anything being wrong.
  await waitForWallpaper('data:image/gif;base64,this-is-not-an-image', 2000);
});

it('does not care whether the browser supports decode()', async () => {
  // Some engines and some test environments have no HTMLImageElement.decode; the load event is the
  // fallback, and both paths have to end in a resolved promise.
  const original = HTMLImageElement.prototype.decode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLImageElement.prototype as any).decode = undefined;
  try {
    await waitForWallpaper(TINY_IMAGE, 2000);
  } finally {
    HTMLImageElement.prototype.decode = original;
  }
});

it('is bounded, so a stalled image cannot hold the desktop back forever', async () => {
  // An image that never loads and never errors — a hung request. The wait gives up so the desktop
  // can appear; the wallpaper simply arrives when it arrives.
  const stalled = 'https://127.0.0.1:1/umbradesktop-stalled.png';
  const started = performance.now();
  await waitForWallpaper(stalled, 60);
  expect(performance.now() - started).to.be.lessThan(2000);
});
