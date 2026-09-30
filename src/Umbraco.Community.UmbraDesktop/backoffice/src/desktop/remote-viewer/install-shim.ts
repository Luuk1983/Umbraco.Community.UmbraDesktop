import { routeRequest } from './route-request';

/**
 * The parts of a `Window` the shim reads and replaces. Typed narrowly so a test can hand in a small
 * fake, and so the shim visibly touches nothing else.
 */
export interface ShimWindow {
  /** The origin of the frame. `location.origin` reads `null` in a blank frame; this does not. */
  origin: string;
  /** Where the frame is, used only to resolve relative URLs. */
  location: { href: string };
  /** The frame's fetch, replaced by one that routes. */
  fetch: typeof fetch;
  /** The frame's XMLHttpRequest, whose prototype is patched. */
  XMLHttpRequest: typeof XMLHttpRequest;
  /** Only present in a real frame. The image patch is skipped without it. */
  HTMLImageElement?: typeof HTMLImageElement;
  /** Only present in a real frame. The image patch is skipped without it. */
  Element?: typeof Element;
  /** Only present in a real frame. Guarded so the frame cannot open a live channel to this instance. */
  WebSocket?: typeof WebSocket;
  /** Only present in a real frame. Guarded for the same reason, being SignalR's other transport. */
  EventSource?: typeof EventSource;
}

/** Where a frame's redirected calls go. */
export interface RemoteShimOptions {
  /**
   * The proxy for this connection, absolute and with no trailing slash:
   * `{origin}/umbraco/management/api/v1/umbradesktop/connection-proxy/{id}`.
   */
  proxyBase: string;
  /** The remote instance's own origin, where its public media is. */
  remoteOrigin: string;
}

/** Set on the patched functions so a test, or a curious developer, can tell they are ours. */
const MARKER = '__remoteViewerShim';

/** Media lives here on every instance, and is public. */
const MEDIA_PREFIX = '/media/';

/**
 * Make one frame's network calls go to a remote instance, wherever the routing table says they
 * should.
 *
 * It patches `fetch`, `XMLHttpRequest` and the `src` of images on the frame's own window, not on the
 * generated API client, because the client is only one of the ways the backoffice reaches the
 * server: some editors call a hardcoded path with a raw fetch, a package brings its own generated
 * client, and the browser fetches images on its own. Patching the window catches all of them, and
 * it is the reason a custom editor calling its own controller follows the swap without knowing.
 *
 * It has to be installed after the frame's document commits, not before: Chrome keeps the window
 * across a frame's first navigation but builds a new JavaScript context, so a patch on the blank
 * frame is lost (the test in `install-shim.test.ts` records this). `frame-loader.ts` installs it as
 * early as a page can and then checks nothing got out first.
 *
 * Two destinations, treated differently on purpose:
 *
 * - **Data calls go to the proxy, as the local user.** The proxy is this instance's own endpoint, so
 *   the call keeps its credentials and its `Bearer [redacted]` header, which is what the local
 *   backoffice authenticates with. The proxy then calls the remote as the connection's API user, a
 *   token the browser never sees.
 * - **Media goes straight to the remote, anonymously.** Media is public on every instance, an image
 *   element cannot carry the bearer header the proxy would need, and the remote's imaging endpoint
 *   already answers with absolute URLs to itself. So relative media paths are pointed at the remote's
 *   origin and sent with no credentials.
 * @param win The frame's window, patched in place.
 * @param options Where to send what.
 */
export function installRemoteShim(win: ShimWindow, options: RemoteShimOptions): void {
  patchFetch(win, options);
  patchXhr(win, options);
  patchImages(win, options);
  patchLiveChannels(win);
}

/**
 * Resolve a URL as the frame would, tolerating a blank frame whose href is not a base.
 * @param win The frame.
 * @param raw What the caller passed.
 * @returns The absolute URL, or undefined when it does not parse at all.
 */
function resolve(win: ShimWindow, raw: string): URL | undefined {
  const base = win.location.href.startsWith('http') ? win.location.href : `${win.origin}/`;
  try {
    return new URL(raw, base);
  } catch {
    return undefined;
  }
}

/**
 * Where a remote-bound path should actually be sent.
 * @param path The path and query on the remote.
 * @param options Where to send what.
 * @returns The absolute URL, and whether it is media (and so anonymous).
 */
function destination(path: string, options: RemoteShimOptions): { url: string; isMedia: boolean } {
  const isMedia = path.startsWith(MEDIA_PREFIX);
  return { url: (isMedia ? options.remoteOrigin : options.proxyBase) + path, isMedia };
}

/**
 * Replace the frame's fetch with one that routes each call.
 * @param win The frame.
 * @param options Where to send what.
 */
function patchFetch(win: ShimWindow, options: RemoteShimOptions): void {
  const original = win.fetch.bind(win);
  const patched = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = typeof input === 'object' && 'url' in input ? (input as Request) : undefined;
    const raw = request ? request.url : String(input);
    const method = init?.method ?? request?.method ?? 'GET';
    const url = resolve(win, raw);
    if (!url) return original(input, init);

    const route = routeRequest(method, url, win.origin);
    if (route.target === 'local') return original(input, init);
    if (route.target === 'blocked') {
      return Promise.resolve(
        new Response(JSON.stringify({ title: 'Not sent from a remote viewer', detail: route.reason, status: 405 }), {
          status: 405,
          headers: { 'content-type': 'application/problem+json' },
        }),
      );
    }

    const target = destination(route.path, options);
    const headers = new Headers(init?.headers ?? request?.headers);
    if (target.isMedia) headers.delete('authorization');
    return original(target.url, {
      method,
      headers,
      credentials: target.isMedia ? 'omit' : (init?.credentials ?? request?.credentials ?? 'include'),
      signal: init?.signal ?? request?.signal,
    });
  };
  (patched as unknown as Record<string, unknown>)[MARKER] = true;
  win.fetch = patched as typeof fetch;
}

/**
 * Patch the frame's XMLHttpRequest the same way: data calls to the proxy with the local
 * credentials, media to the remote without any.
 * @param win The frame.
 * @param options Where to send what.
 */
function patchXhr(win: ShimWindow, options: RemoteShimOptions): void {
  const proto = win.XMLHttpRequest.prototype as XMLHttpRequest & Record<string, unknown>;
  const originalOpen = proto.open as (...args: unknown[]) => void;
  const originalSetHeader = proto.setRequestHeader;
  /** Requests sent anonymously, so their bearer header can be dropped. Weak so it never holds one. */
  const anonymous = new WeakSet<XMLHttpRequest>();

  proto.open = function (this: XMLHttpRequest, method: string, rawUrl: string | URL, ...rest: unknown[]) {
    const url = resolve(win, String(rawUrl));
    const route = url ? routeRequest(method, url, win.origin) : ({ target: 'local' } as const);
    if (route.target === 'blocked') throw new DOMException(route.reason, 'NetworkError');
    if (route.target === 'local') {
      originalOpen.call(this, method, rawUrl, ...rest);
      return;
    }
    const target = destination(route.path, options);
    originalOpen.call(this, method, target.url, ...rest);
    if (target.isMedia) {
      anonymous.add(this);
      this.withCredentials = false;
    }
  } as typeof proto.open;

  proto.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
    if (anonymous.has(this) && name.toLowerCase() === 'authorization') return;
    originalSetHeader.call(this, name, value);
  };
  (proto.open as unknown as Record<string, unknown>)[MARKER] = true;
}

/**
 * Patch the two ways an `<img>` gets its `src` (the property and `setAttribute`) so a relative media
 * path loads from the remote. Images are loaded by the browser, not by `fetch`, so this is the only
 * hook short of a service worker. It does not see CSS `url()` or `srcset`, a known gap.
 * @param win The frame.
 * @param options Where to send what.
 */
function patchImages(win: ShimWindow, options: RemoteShimOptions): void {
  if (!win.HTMLImageElement || !win.Element) return;

  /** Rewrite a media path, leave anything else exactly as it was given. */
  const rewrite = (value: string): string => {
    const url = resolve(win, value);
    if (!url) return value;
    const route = routeRequest('GET', url, win.origin);
    return route.target === 'remote' && route.path.startsWith(MEDIA_PREFIX) ? options.remoteOrigin + route.path : value;
  };

  const descriptor = Object.getOwnPropertyDescriptor(win.HTMLImageElement.prototype, 'src');
  if (descriptor?.set && descriptor.get) {
    const { get, set } = descriptor;
    Object.defineProperty(win.HTMLImageElement.prototype, 'src', {
      configurable: true,
      enumerable: descriptor.enumerable,
      get,
      set(this: HTMLImageElement, value: string) {
        set.call(this, rewrite(String(value)));
      },
    });
  }

  const originalSetAttribute = win.Element.prototype.setAttribute;
  win.Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
    const isImageSrc = this.localName === 'img' && name.toLowerCase() === 'src';
    originalSetAttribute.call(this, name, isImageSrc ? rewrite(String(value)) : value);
  };
}

/**
 * Refuse any `WebSocket` or `EventSource` the frame opens to this instance.
 *
 * The frame's live channels are SignalR connections, and they would reach this instance, whose events
 * are about this instance while the frame shows another. Keys are GUIDs two sites can share, so a
 * local save would read as a remote one. The routing table already refuses the negotiate call that
 * normally comes first; this covers a hub that skips negotiation and goes straight to a socket, and
 * SignalR's server-sent-events fallback. Wrapped in a `Proxy` rather than replaced, so the constants
 * SignalR reads off the constructor (`WebSocket.OPEN` and the rest) and `instanceof` still work.
 * @param win The frame.
 */
function patchLiveChannels(win: ShimWindow): void {
  const ownHost = new URL(win.origin).host;

  /** Throw for a URL on this instance, whatever its scheme. */
  const refuseLocal = (raw: unknown) => {
    const url = resolve(win, String(raw));
    if (url && url.host === ownHost) {
      throw new DOMException("A remote viewer frame does not listen to this instance's live events.", 'SecurityError');
    }
  };

  for (const name of ['WebSocket', 'EventSource'] as const) {
    const original = win[name];
    if (!original) continue;
    (win as unknown as Record<string, unknown>)[name] = new Proxy(original, {
      construct(target, args: unknown[], newTarget) {
        refuseLocal(args[0]);
        return Reflect.construct(target, args, newTarget === win[name] ? target : newTarget);
      },
    });
  }
}
