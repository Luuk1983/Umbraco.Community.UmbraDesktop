import { findEscapedRequests, findFailedProxyCalls } from './find-escaped-requests';
import { hasSettled } from './has-settled';
import { installRemoteShim, type RemoteShimOptions, type ShimWindow } from './install-shim';

/** A frame that is showing the remote, and how to ask whether the swap was airtight. */
export interface RemoteFrameHandle {
  /** The frame's window, after the shim went in. */
  window: ShimWindow;
  /**
   * The URLs of requests that reached the local instance before the shim was in place. Empty means
   * the swap is airtight; anything else means the frame is showing some local data as if it were
   * remote, and the caller should say so rather than carry on.
   */
  escapedRequests(): string[];
  /**
   * Calls through the proxy that were refused or broke (401, 403, 5xx). Anything here means the frame
   * is not showing the remote, however settled it looks.
   */
  failedProxyCalls(): string[];
  /**
   * Resolves once the frame has stopped booting, judged by its own requests (see `hasSettled`), or
   * with `timeout` if it never goes quiet. The caller covers the frame until this resolves, so
   * nobody sees the backoffice half-built or, worse, half-remote.
   */
  whenSettled(): Promise<'settled' | 'timeout'>;
}

/** How long the frame must go without a request finishing before it counts as loaded. */
const QUIET_MS = 1500;

/**
 * How many resource timing entries the frame keeps. A booted backoffice with the commercial packages
 * makes about 600 requests; this leaves room for a long session of browsing on top.
 */
const RESOURCE_TIMING_BUFFER = 20000;

/**
 * The call the frame's first screen, the content section, cannot be shown without: the document
 * tree's root. The frame is not settled until the proxy has answered it (see `hasSettled`).
 */
const FIRST_SCREEN_CALL = '/tree/document/root';

/** How long to wait for the frame to settle before giving up and saying so. */
const SETTLE_TIMEOUT_MS = 45000;

/**
 * Point a frame at a backoffice URL and patch its window as early as a page can, then hand back a
 * way to check that nothing got in first.
 *
 * Patching the blank frame first does not work: Chrome keeps the window across the first same-origin
 * navigation but builds a new JavaScript context, so the patch is gone (see the test that records
 * this). So the patch goes in after the new document has committed and before its scripts have had
 * the chance to run, which is a race the loader can win but not guarantee. A module script has to be
 * fetched before it runs, and this polls on a message channel rather than a timer, which is the
 * fastest yield the platform offers and is not clamped to four milliseconds.
 * @param frame An iframe already in the document, showing the blank page.
 * @param url The backoffice URL to load, on the local origin.
 * @param options Where the frame's redirected calls go: the proxy, and the remote's own origin for media.
 * @param timeoutMs How long to wait for the new document before giving up.
 * @returns The handle, once the shim is installed.
 * @throws Error when the frame never produced a new document within the timeout.
 */
export function loadRemoteFrame(
  frame: HTMLIFrameElement,
  url: string,
  options: RemoteShimOptions,
  timeoutMs = 10000,
): Promise<RemoteFrameHandle> {
  const blank = frame.contentDocument;
  frame.src = url;

  return new Promise((resolve, reject) => {
    const started = performance.now();
    const channel = new MessageChannel();

    const poll = () => {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      const committed = win && doc && doc !== blank && win.location.href.startsWith('http');
      if (committed) {
        channel.port1.close();
        const shimWindow = win as unknown as ShimWindow;
        installRemoteShim(shimWindow, options);
        // Every check on this frame reads its resource timing, and the browser keeps only 250 entries
        // by default. The backoffice loads more script files than that before its first data call,
        // so with the default the proxy calls are never recorded and a working frame reads as one
        // that never used the proxy. Raised as early as the document exists, before those files load.
        win.performance.setResourceTimingBufferSize(RESOURCE_TIMING_BUFFER);
        // The frame's own clock, because resource timing entries are measured on it.
        const installedAt = win.performance.now();
        resolve({
          window: shimWindow,
          escapedRequests: () =>
            findEscapedRequests(win.performance.getEntriesByType('resource'), installedAt, win.location.origin),
          failedProxyCalls: () =>
            findFailedProxyCalls(win.performance.getEntriesByType('resource') as PerformanceResourceTiming[], options.proxyBase),
          whenSettled: () =>
            new Promise((done) => {
              const startedWaiting = performance.now();
              const look = () => {
                const entries = win.performance.getEntriesByType('resource') as PerformanceResourceTiming[];
                if (hasSettled(entries, win.performance.now(), QUIET_MS, options.proxyBase, FIRST_SCREEN_CALL)) return done('settled');
                if (performance.now() - startedWaiting > SETTLE_TIMEOUT_MS) return done('timeout');
                setTimeout(look, 250);
              };
              look();
            }),
        });
        return;
      }
      if (performance.now() - started > timeoutMs) {
        channel.port1.close();
        reject(new Error('The frame never loaded a document.'));
        return;
      }
      channel.port2.postMessage(0);
    };

    channel.port1.onmessage = poll;
    poll();
  });
}
