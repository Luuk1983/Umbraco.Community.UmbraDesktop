# Remote content viewer: design

> A read-only app that shows the content tree and the properties of any connected instance, using
> Umbraco's own tree and property editors. Requests are redirected to the remote through a GET-only
> proxy, and anything that cannot be shown properly falls back to its raw value.

- **Status:** Built 2026-09-29 as the experimental Remote content app, and checked in a browser against two real instances. The spike's findings are in §9 and §9.1; what the build changed is in §10
- **Date:** 2026-09-29
- **Branch:** `worktree-remote-content-viewer`
- **Issue:** [#105](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/105)
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`
- **Builds on:** Connections (`docs/connections.md`), which already stores API users per instance

---

## 1. Goal and scope

Connections shows that another instance is up and which version it runs. It never shows what is on
it. This adds the next step: browse the content of any connected instance, read-only, from the
desktop, without logging in and out.

**In scope:**

- An experimental app, **Remote content viewer**, in the Experimental launcher group.
- A switcher for the connected instances, the local one included.
- The content tree, and for a selected document its properties per culture.
- Property values shown with the local property editors in read-only mode where that works, and
  as labelled raw values where it does not.

**Out of scope:**

- Any write. Not by design and not by accident: the proxy only performs GET.
- Comparing or syncing instances (uSync and Deploy territory).
- Media library, members, users. Content first.
- Preview and the remote's frontend URLs. They need the remote's site and cookies.
- Search across instances, for the reasons given in the connections design.

## 2. Settled decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Every remote call goes through an **API user**. | Already the connections model. Attribution is moot for reads. |
| D2 | **Read-only**, enforced by the proxy. | A half-working editor that can write wrongly is worse than none. A viewer can only ever show less than it should. |
| D3 | Reuse **Umbraco's tree and property editors**, do not write our own renderers. | Custom editors we have never heard of still render, and no list of supported editors has to be maintained. |
| D4 | **Raw value is always one click away**, on every property. | The one failure the middleware cannot detect is an editor that looks right and is subtly wrong. The raw value is the escape hatch. |
| D5 | An alias with **no local editor** shows its raw value, labelled as such. | The extension registry answers this automatically. |
| D6 | An **Experimental** launcher group app, no settings toggle. | Same as connections: it does not appear until a connection exists. |

## 3. How it works

Each remote gets an iframe of the **local** backoffice. Inside it, a small piece of injected
middleware patches `fetch` and `XMLHttpRequest` and routes each request by path:

- **Stays local:** `security/`, the extension manifests and this package's own controllers. The iframe is genuinely logged in
  through the local session, so there is no fake login and no BroadcastChannel cross-talk with the
  other windows. The remote's editors never load, so the registry is the local one and a missing
  alias is detectable.
- **Goes to the proxy:** the tree, content, document type, data type, language, media-item
  endpoints, and `/media/...` requests.
- **Default:** remote. That is what makes it generic rather than a list of known endpoints.

The proxy is a new endpoint on the hub that performs one authenticated GET against the connection
and streams the body back. It reuses the token handling in `DesktopConnectionApiClient`, and needs
the same guard the status code has: only management API paths (and media), GET only.

### 3.1 Tree

The tree component resolves its data through a repository named in the tree's manifest. So the app
registers its own tree whose repository reads through the proxy, and the stock tree UI shows remote
data with expansion, keyboard handling and theming. The stock document tree item links to the local
workspace and offers entity actions, so this app's item disables both.

### 3.2 Properties

The property editor contract is small: a value, a config and a read-only flag. The app reads the
document and its document type from the remote, and for each property the data type gives the
editor alias and config. Then:

1. The alias is registered locally: mount the editor with the value and config, read-only.
2. The alias is not: show the raw value, labelled.
3. The editor throws or has a request refused: catch it per property and fall back to the raw value.

The spike found that avoiding the document workspace is not needed, and that the workspace is the
better route. See §9.1.

## 4. What it cannot do

- **Media thumbnails.** Images loaded by the browser bypass `fetch`. A service worker or a URL
  rewrite is needed, and this is the weakest point.
- **Custom editors calling their own controllers** work only if the same package is installed
  locally and the remote has the controller.
- **Version skew.** There is no handshake and the API path is always `v1`. Require the same major
  and minor through the server information endpoint, and say so in the docs.
- **Draft versus published.** The by-id endpoint returns the draft, as far as we know. Whether a
  published view is available is open.
- **Permissions on the remote.** The API user needs the Content section and start nodes. That is a
  bigger ask of a client than the status app, since content can hold personal data. The docs say so.

## 5. Risks and unknowns

The spike answers these before anything else is designed.

1. Can the patch be in place before the backoffice captures `fetch`? Fallback: a dedicated entry
   page that patches first and then loads the backoffice.
2. Do editors render in a light container with `umb-property` and stub contexts, or do they need
   the full content workspace?
3. Do thumbnails work at all, and by which route?
4. Does a custom editor that makes a non-GET call fail cleanly?

## 6. Alternatives considered

| Alternative | Why not |
| --- | --- |
| Our own renderers per editor type | A list to maintain, and every custom editor is missing. Kept only as the fallback for pickers if the middleware fails. |
| Local editors editing remote content | Attribution, temporary-file and permissions calls that ignore the base URL, version lock. Half a feature, and it can write wrongly. |
| Remote iframe of the remote's own backoffice | Blocked at the `SameSite=Strict` cookie. See the multi-environment decision. |
| Electron shell | The one version with no stored secrets, and a much larger project. |

## 7. Documentation to write when built

- `README.md`: the app, in the Features list and its own section.
- `docs/connections.md`: the API user now needs the Content section, and why.
- `docs/remote-content-viewer.md`: the routing table, for contributors who add a route.
- Marketplace: a tag. No screenshot until the experimental label comes off.

## 8. The spike

One iframe, one remote, read-only, the tree and three editors: one simple, one picker, one custom.
Success means answers to the four unknowns in §5, not a working app. A spike that shows the
middleware cannot be installed early enough, or that editors need the workspace, ends this design
and the fallback in §6 is reconsidered.

## 9. What the spike found

Two real instances (a local one running this package, a second one playing the remote), a throwaway
Node proxy holding an API user's token, and the code in `desktop/remote-viewer/`. Checked in headless
Chrome against both.

**It works, and further than the design hoped.** The local backoffice content section ran in a frame
with its calls redirected. The tree showed the remote's page names, and opening a document rendered
the remote's real document in the real workspace: text box, textarea, document picker, block grid,
media picker and radio buttons. 65 to 100 calls went through the proxy and none were refused. The
media library listed the remote's folders, and its image thumbnails loaded.

The four unknowns:

1. **Timing: solved, but not the way §3 assumed.** Patching the blank frame first does not work.
   Chrome keeps the window across the first navigation and builds a new JavaScript context, so a
   patched `fetch` is gone (a test records this). The loader instead patches the new window as soon
   as its document exists, polling on a message channel. That is a race the loader can win but not
   guarantee, so the browser's own resource timing is checked afterwards for any remote-bound call
   that got out first (`find-escaped-requests.ts`). None escaped in the runs. A lost race would show
   local data that looks like remote data, which is why the check exists. If it ever proves flaky,
   the deterministic fix is a server-side injection of the shim into the backoffice HTML.
2. **Editors need no light container.** The frame is the whole backoffice, so every editor has
   the contexts it expects. That is simpler than the design's plan, and it means block grid and the
   pickers work, not only the simple editors. The cost is that the frame is a full backoffice per
   remote.
3. **Thumbnails work in this setup, for a reason worth knowing.** The remote's imaging endpoint
   returns absolute URLs to its own public address, and the browser fetched them directly, with no
   proxy involved. That fails when the remote's media is not reachable from the browser (private
   network, protected media). Relative `/media/` paths are rewritten by the shim, which is tested
   but was not exercised against a real remote.
4. **A write is refused safely, but loudly.** The shim answers a PUT with 405 and nothing left the
   frame. The UI reacts with "Error saving content". So it is safe, but the editing chrome is still
   there. A real viewer has to make the workspace read-only rather than rely on the refusal.

**Also learned:**

- `GET document/{id}/published` exists, so a published view is available. §4's open question is
  answered.
- Default-to-remote has a visible cost. A package's own call, here Advanced Permissions asking about
  the local user's key on a remote page, went to the remote and got a meaningless answer. It did no
  harm. A viewer should keep a list of such packages, or an escape hatch per package.
- The frame booted its data calls twice in one run, which is unexplained and worth a look.
- An API user's client ID is stored, and must be sent to the token endpoint, with the prefix
  `umbraco-back-office-`. The backoffice's own create modal adds it. `docs/connections.md` says the
  client ID is "the one you chose", which may leave the prefix out.
- The proxy was a Node script here. The real one is a same-origin C# endpoint and needs the path
  guard the status client already has.

**What is not proven.** A custom package editor that calls its own controller. A real remote on
another network. A remote of another version. The frame's cost with several remotes open at once.
And the whole read-only experience, which is the next real piece of work.

### 9.1 Second round: read-only, and the cover

**Read-only in the interface, for any permission implementation.** Two earlier versions are
superseded and worth knowing about only so they are not tried again. A read-only user group on the
remote worked but depended on each remote's admin. Rewriting the verb lists in permission responses
worked but was per package: Advanced Permissions replaces Umbraco's permission condition under the
same alias (`Umb.Condition.UserPermission.Document`) and keeps its own verbs inside it, so there is
no shared list to rewrite. The verbs live inside whichever condition is registered.

What everything does share is the extension registry and the workspace guard, and the version that
stays (`frame-read-only.ts`) acts only there:

- **Actions and sections, through the registry.** Inside the frame (recognised by its window name,
  which survives navigation), every extension of an action type (workspace, entity, bulk,
  create-option, collection, property, block and tree actions) and every section except Content and
  Media gets one extra condition that always says no. Umbraco shows an extension only when all its
  conditions say yes, so this outvotes any permission logic without knowing it. Hidden by type, not
  by the verbs a manifest asks for, because a package's own action need not ask for any. A short
  list stays: reloading a tree, copying to the local clipboard, and opening a block to read it.
- **Editors, through the guard.** A workspace context with no conditions is created in every
  workspace and keeps a read-only rule on its `readOnlyGuard`, the mechanism Umbraco uses for a
  trashed document.

Verified with the API user as a full administrator and Advanced Permissions installed (its condition
still the one registered): only Content and Media, no Save buttons and no create button, all 15
editors read-only with the Read-only badge, and of 544 action and section manifests, the only ones
without the condition are the reading ones above. No request was refused, because nothing tried.

Two traps, both caught by tests after a real frame showed them:

- **The workspace clears its guard on every load.** `resetState()` in
  `content-detail-workspace-base.ts` calls `readOnlyGuard.clearRules()`, so a rule added once was gone
  before the document appeared. The context watches the guard's rules and puts its rule back.
- **Appending a condition makes the registry emit again, synchronously.** Looping over a few hundred
  actions inside the subscription re-entered it, doubled conditions and hung the frame. A re-entrancy
  guard and a re-read of the manifest before each append fix it. Also, Umbraco remembers an appended
  condition only until it has applied it once, so a package that replaces an extension by alias
  arrives without it, which is why the check is on the manifest and not on a list of aliases.

What this does not reach: interface a package draws itself inside its own view rather than as an
extension (Workflow, Engage and the like show tabs whose contents may have buttons). Those stay
visible, and the GET-only proxy plus the shim's 405 is what stops them. That is the split: this module
is the interface, the proxy is the protection.

**The cover.** The frame is hidden behind a cover until three things are true: the proxy answered a
pre-flight call, the frame has used the proxy and then gone quiet for 1.5 seconds (`has-settled.ts`),
and nothing reached the local instance ahead of the shim. That took about 5 to 6 seconds on the
test instance. A dead proxy shows a failure message and a Try again button, checked. The state where
something escaped shows the offending URLs and the same button. That path is unit tested at the
detection level and was not provoked in a browser.

**Left alone:** the header inside the frame shows a "Local" label. That is Umbraco Deploy's
environment indicator, not ours, and it was decided to leave it. The user badge shows the API user's
initials, which is accurate.

## 10. What the build changed

The spike used a Node stand-in for the proxy and one hardcoded remote. The app has a real proxy, a
switcher and a gate, and building them taught six things the spike could not.

**The proxy is same-origin and authenticated as the person looking.** `ConnectionProxyController`
answers `GET umbradesktop/connection-proxy/{id}/{**path}` on this instance and calls the connection
as its API user through `DesktopConnectionProxy`. So the frame's data calls keep their own credentials
and `Bearer [redacted]` header, the local backoffice authenticates them, and the proxy swaps in the
remote's token. It needs Content section access here, and the app is gated on the same, so a user who
could not read through it is not offered it. The path guard refuses anything but the remote's
management API, on the text and again on the resolved address, including dot segments, encoded dots
and slashes, a second host and the remote's own auth endpoints. It is kept apart from
`DesktopConnectionApiClient`, whose own docs say it must never become a pass-through.

**Media goes straight to the remote, anonymously.** An image element cannot carry the bearer header
the proxy needs, media is public on every instance, and the remote's imaging endpoint already
answers with absolute URLs to itself. So relative `/media/` paths are pointed at the remote's origin.

**The boot's anonymous calls stay local.** `server/status` and `server/configuration` are asked before
the frame has logged in. Sent to the proxy, which needs a login, they were refused and the backoffice
stopped booting. They describe the frame's own runtime, so they now stay local, as do `install/` and
`upgrade/`. `server/information`, the remote's version, still goes remote. The spike never hit this
because its stand-in proxy had no auth.

**The browser keeps only 250 resource timing entries by default.** A booted backoffice makes more
requests than that before its first data call, so every check that reads the frame's timing (settled,
escaped, failed) saw nothing, and a working frame read as one that never used the proxy. The loader
raises the frame's buffer as soon as its document exists. The spike's runs were lucky.

**Quiet is not the same as ready, twice over.** The backoffice asks for the tree only after rendering
the section, after a quiet gap, and the cover lifted on an empty tree. The frame now counts as settled
only once the proxy has answered `tree/document/root` and things have been quiet since. And a frame
whose calls were all refused goes quiet as readily as one whose calls worked, so the viewer also fails
when any proxied call came back 401, 403 or 5xx. 404 does not count; the backoffice asks for things
that may not exist.

**`umbraDesktopApp` conditions were typed too narrowly.** `ManifestUmbraDesktopApp` extended
`ManifestWithDynamicConditions` with its default generic, which knows only `alias`, so a section
condition's `match` did not type-check. It now uses Umbraco's full `UmbExtensionConditionConfig`
union, as Umbraco's own header apps do. That widens what a package author may write, and breaks no
existing manifest.

**The frame was listening to this instance's live events.** SignalR lives outside the management
API, so the routing table left it local, and the frame's backoffice joined this instance's hubs: in
the test instance, five of them (Umbraco's server events, Automate, Deploy's two, Workflow). Keys are
GUIDs two sites can share, and two copies of the Starter Kit do, so a local save of Home reached the
viewer as news about the remote's Home. Now a frame gets no live channel to this instance at all: the
three core hub paths and any SignalR negotiate call (a path ending `/negotiate` with a
`negotiateVersion` parameter, which catches a package's hub without knowing it) are blocked, and any
`WebSocket` or `EventSource` to this origin is refused, for a hub that skips negotiation. Checked both
ways in a browser: five local sockets and a connected event context without the fix, none and
disconnected with it. The price is that the viewer does not update live. Doing that properly means
relaying the remote's own `serverEventHub` to the frame, which an API user can join (it has
`BackOfficeAccess`, and document and media events are authorized by tree access); that was
considered on 2026-09-29 and deliberately left out for now.

Checked in a browser, with the remote API user an administrator and Advanced Permissions installed:
the app appears in the Experimental group only with a connection; the tree shows the remote's pages
when the cover lifts; a document opens with all 15 editors read-only; 23 calls went through the proxy
and none failed; switching to an unreachable connection shows "cannot be reached" with Try again.
Not checked: a user without the Content section (the gate is Umbraco's own condition, and the proxy
refuses regardless), and the version warning against a real remote on another version.
