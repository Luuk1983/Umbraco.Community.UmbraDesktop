import { esbuildPlugin } from '@web/dev-server-esbuild';

/**
 * Real touch input for the tests that need it, as `touch-drag` and `touch-tap` server commands.
 *
 * A test can dispatch a synthetic `PointerEvent` with `pointerType: 'touch'`, but that goes
 * straight to the listener and never through the browser's gesture handling, which is the part
 * that decides whether a finger drags the element or pans the page. That decision is where touch
 * dragging broke: an element without `touch-action: none` hands the gesture to panning, gets a
 * `pointercancel`, and never sees another move. Only input the browser believes came from a
 * touchscreen reaches that code, so these go through puppeteer's `Touchscreen`, which sends CDP
 * `Input.dispatchTouchEvent`.
 *
 * Coordinates are CSS pixels in the test page's viewport, the same numbers as `clientX`/`clientY`.
 * @returns The test-runner plugin.
 */
function touchPlugin() {
  return {
    name: 'umbradesktop-touch',
    async executeCommand({ command, payload, session }) {
      if (command !== 'touch-drag' && command !== 'touch-tap') return undefined;
      if (session.browser.type !== 'puppeteer') {
        throw new Error(`${command} needs the Chrome launcher, which is the only one configured.`);
      }
      const page = session.browser.getPage(session.id);
      // A full run keeps several test pages open with only one in front. Without this, one full
      // run in two failed all three touch cases with "Input.dispatchTouchEvent: Target closed":
      // the touch was never acknowledged, the test timed out, and the runner closed the page
      // under it. Single-file runs, where the one page is always in front, never failed.
      await page.bringToFront();
      const touch = page.touchscreen;
      if (command === 'touch-tap') {
        await touch.tap(payload.position[0], payload.position[1]);
        return true;
      }
      const [first, ...rest] = payload.points;
      await touch.touchStart(first[0], first[1]);
      for (const [x, y] of rest) await touch.touchMove(x, y);
      // Hold still before lifting, the way a finger does once the window is where it wants it.
      // CDP sends the moves back to back, so a drag lifted straight away leaves at thousands of
      // px/s and Chrome starts a fling. The next touch then cancels that fling, and Chrome
      // swallows the tap that cancels a fling, so whichever test tapped next lost its click.
      // Measured: a tap about 50ms after an unheld drag never clicked, and one 150ms after did.
      await new Promise((resolve) => setTimeout(resolve, 150));
      await touch.touchEnd();
      return true;
    },
  };
}

export default {
  files: ['src/**/*.test.ts'],
  nodeResolve: true,
  // `tsconfig` is what carries `experimentalDecorators` through to esbuild. Without it Lit's
  // @state()/@customElement compile as standard decorators and every element fails to load
  // with "Unsupported decorator location: field".
  plugins: [esbuildPlugin({ ts: true, target: 'es2020', tsconfig: 'tsconfig.json' }), touchPlugin()],
  testFramework: { config: { timeout: '5000' } },
  // One test file at a time, so every file is the foreground tab. Run concurrently, the runner puts
  // files in background tabs, where Chrome gives no animation frames, throttles timers and does not
  // let a page take keyboard focus, and the keyboard-focus tests (window-app-focus.test.ts), which
  // click and type for real, failed there while passing alone. The Accessories package hit the same
  // wall with a test that waits on a frame. The whole suite takes about a minute this way.
  concurrency: 1,
};
