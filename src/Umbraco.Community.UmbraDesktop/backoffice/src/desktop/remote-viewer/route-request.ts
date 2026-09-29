/**
 * Deciding, for one request made inside a remote viewer frame, whether it belongs to the local
 * instance or to the remote one.
 *
 * The frame is the local backoffice, logged in through the local session, so the shell of it (auth,
 * the extension registry, this package's own controllers, the static bundle) has to keep talking to
 * the local server. The data plane (the tree, content, types, languages, media) is what the frame
 * is there to show, and goes to the remote through the proxy. The table is written as the list of
 * what stays local and treats everything else under the management API as remote, deliberately: a
 * list of remote endpoints would have to know every endpoint, including ones a package adds, and the
 * point of the viewer is that it does not.
 */

/** The management API's root, where every data call and every package controller lives. */
const MANAGEMENT_API = '/umbraco/management/api/';

/** The prefix, below the versioned root, of the media the remote serves publicly. */
const MEDIA_PREFIX = '/media/';

/**
 * Management API areas that stay on the local instance, as a path below `/umbraco/management/api/vN/`.
 * Auth, because the frame's session is the local one. Manifests, because the registry has to be the
 * local one or a missing editor could not be told from a present one. `umbradesktop`, because this
 * package's own controllers exist on no other instance, the connection proxy among them, which is
 * what stops a proxied call being redirected again.
 *
 * `server/status`, `server/configuration`, `install/` and `upgrade/` are asked before the frame has
 * logged in. The proxy needs a login, so sent there they are refused, and a refused `server/status`
 * stops the backoffice booting at all, which is how this was found. They describe the frame's own
 * runtime rather than the remote's content, so the local answer is the right one anyway.
 * `server/information`, the remote's version, is not here: that one is about the remote.
 *
 * The current user is deliberately not here either. Inside the frame it is the remote's API user,
 * whose start nodes, languages and sections are the remote's. Read-only does not depend on it:
 * `frame-read-only.ts` enforces that whatever the user may do.
 */
const LOCAL_AREAS: ReadonlyArray<string> = [
  'security/',
  'manifest/',
  'umbradesktop/',
  'server/status',
  'server/configuration',
  'install/',
  'upgrade/',
];

/** Methods that cannot change anything, and so may be sent to the remote. */
const SAFE_METHODS: ReadonlyArray<string> = ['GET', 'HEAD', 'OPTIONS'];

/** Where a request goes. */
export type RequestRoute =
  /** Leave the request exactly as it is. */
  | { target: 'local' }
  /** Send it to the remote through the proxy. `path` is the path and query on the remote. */
  | { target: 'remote'; path: string }
  /** It would change something on the remote, or listen to the wrong site, so it is never sent. */
  | { target: 'blocked'; reason: string };

/**
 * This instance's SignalR hubs, lower-cased: Umbraco's server events, preview and backoffice hubs.
 * A frame joining one hears about this instance while showing another, and because keys are GUIDs
 * that two sites can share (two copies of the Starter Kit do), a local save of Home reads as news
 * about the remote's Home. So a frame gets none of them. A package's own hub is caught by its
 * negotiate call instead (see `isSignalRNegotiate`).
 */
const LOCAL_HUBS: ReadonlyArray<string> = ['/umbraco/servereventhub', '/umbraco/previewhub', '/umbraco/backofficehub'];

/**
 * Whether a request is a SignalR negotiate call, which every hub connection starts with unless it
 * skips negotiation. Recognised by SignalR's own shape, a path ending in `/negotiate` with a
 * `negotiateVersion` parameter, so a package's hub is caught without knowing its path.
 * @param url The request URL.
 * @returns True for a negotiate call.
 */
function isSignalRNegotiate(url: URL): boolean {
  return url.pathname.endsWith('/negotiate') && url.searchParams.has('negotiateVersion');
}

/**
 * Work out where one request should go.
 * @param method The HTTP method of the request.
 * @param url The absolute URL the request was going to.
 * @param origin The origin of the frame, which is the local instance.
 * @returns The route: local, remote with its path, or blocked.
 */
export function routeRequest(method: string, url: URL, origin: string): RequestRoute {
  if (url.origin !== origin) return { target: 'local' };

  const path = url.pathname;
  const lowered = path.toLowerCase();
  if (LOCAL_HUBS.some((hub) => lowered === hub || lowered.startsWith(`${hub}/`)) || isSignalRNegotiate(url)) {
    return { target: 'blocked', reason: "A remote viewer frame does not listen to this instance's live events." };
  }

  const isMedia = path.startsWith(MEDIA_PREFIX);
  const isManagement = path.startsWith(MANAGEMENT_API);
  if (!isMedia && !isManagement) return { target: 'local' };

  if (isManagement && isLocalManagementPath(path)) return { target: 'local' };

  if (SAFE_METHODS.includes(method.toUpperCase()) === false) {
    return { target: 'blocked', reason: `${method.toUpperCase()} is never sent to a remote instance.` };
  }
  return { target: 'remote', path: path + url.search };
}

/**
 * Whether a management API path is one of the areas that stay local.
 * @param path The URL path, starting with the management API root.
 * @returns True when it belongs to the local instance.
 */
function isLocalManagementPath(path: string): boolean {
  // Strip `/umbraco/management/api/` and the version segment, `v1/`, to get the area.
  const versioned = path.slice(MANAGEMENT_API.length);
  const slash = versioned.indexOf('/');
  const below = slash === -1 ? '' : versioned.slice(slash + 1);
  return LOCAL_AREAS.some((area) => below.startsWith(area));
}
