# Media Manager Implementation Plan

> **For agentic workers:** built natively in one session, phase by phase (superpowers:executing-plans). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Media Manager app in a new Media add-on that hosts Umbraco's own media collection, tree and workspace in desktop windows, and adds folder windows, opening items beside, drag, the clipboard, OS files, a Transfers window and undo (issue #144).

**Architecture:** The manager window is an element app on the desktop page. It hosts core's `umb-collection` and media tree for one folder, with a stand-in folder context, and takes over the clicks core would turn into navigation. An opened item is a backoffice page on core's own media workspace route, attached to its manager window; the host learns to draw a backoffice page as attached content and to guard one with unsaved changes. Everything that spans windows (clipboard, undo, operations, transfers) lives in one desktop context of the add-on.

**Tech Stack:** TypeScript, Lit, Umbraco 17 backoffice (`umb-collection`, `umb-tree`, `UmbMediaDropzoneManager`, the management API client), web-test-runner with `@open-wc/testing` in a real Chrome, puppeteer-core against a real TestInstance.

**Spec:** [`2026-10-17-media-manager-design.md`](../design/2026-10-17-media-manager-design.md), with the hosting spike [`2026-10-17-media-manager-hosting-spike.md`](../design/2026-10-17-media-manager-hosting-spike.md) and the September drag and paste spike [`2026-09-29-media-drag-and-paste-spike.md`](../design/2026-09-29-media-drag-and-paste-spike.md). The design doc wins where they disagree (the September spike's "copy is a reference" was overruled: §5 makes a copy a new item).

**Why phases with tasks, and not one plan with every step.** Ten phases, 0 to 9, each building on what the previous one finds in a real backoffice. Phases 0 to 2 are planned to the task; later phases name their files, interfaces and tests, and get their step list written at the top of the phase, from what phases 0 to 2 measured. Writing code-level steps for phase 8 now would be guessing.

## Global Constraints

- **Never commit.** No `git commit`, `push`, `tag` or PR, overriding any skill. Work stays uncommitted for Luuk to review.
- **Tests first.** Failing test, watch it fail, then the code. Pure rules go in their own `.ts` file with a `.test.ts` beside it.
- **JSDoc on everything**, private members included, saying why. C#, if any appears: primary constructors, `var`, records, XML docs on everything.
- **Run both** `npm run build` and `npm test -- --concurrency 2`, in the host (`src/Umbraco.Community.UmbraDesktop`) and in the add-on (`src/Umbraco.Community.UmbraDesktop.Media`), at the end of every phase.
- **Test-runner traps:** a failing `expect(el).to.equal(null)` hangs (assert `!!el`); fixtures stall in a background tab.
- **The Media section is untouched.** No core collection view, route, default or manifest is overridden or unregistered. Our entity and bulk actions carry a condition that is true only inside a manager window.
- **Nothing is imported between packages.** The add-on reaches the host through events, element properties and context aliases, declared in its own `umbradesktop-app.d.ts`, as the other add-ons do. Every host addition below is published API and only ever gains optional fields.
- **A theme may restyle, never remove.** Our own UI uses the app tokens with their fallbacks (`docs/developer/desktop-apps.md` §4). Every phase that draws something checks all five themes.
- **Never navigate the desktop.** Every link click inside a manager window is either ours or stopped; the backoffice address never changes. A link the desktop renders for itself carries `data-router-slot="disabled"`.
- **Strings** in the add-on's `localization/en.ts` and `nl.ts`, parity-tested, as in Accessories.
- **Modifier keys follow the platform:** Ctrl on Windows and Linux, Cmd (and Option for copy) on a Mac. One helper, `platform-keys.ts`, decides; nothing else reads `navigator.platform`.
- **Real backoffice check at the end of each phase**, on a worktree TestInstance browsed at `<task>.localhost:<port>`, driven headless with the repository's puppeteer-core (Luuk's instance and headless notes). Restore any test-run artifacts afterwards.

## Review Focus

1. **Two manager windows on the same folder.** Each keeps its own view and selection; an operation in one shows in both. Pinned in Task 1.4 (refresh by entity event) and Phase 4 (both windows reload after a move).
2. **The open item is moved, trashed or deleted from another window.** The pane follows core: a trashed item shows core's trashed state, a deleted one closes the pane. The pink border moves with the key, not the card position. Pinned in Task 2.5.
3. **A user with a media start node.** The tree and Media root show only what core shows; Open in new window and every drop target outside the start nodes refuse. Pinned in Phase 4's permission rule tests and the phase 1 real-backoffice check with a restricted user.
4. **A drag that leaves the window, or the browser, and comes back or ends outside.** No label, outline or faded card is left behind; Esc and a drop on nothing both clean up. Pinned in Phase 5 (`drag-session.test.ts`: `ends cleanly on dragend without drop`).
5. **A paste with nothing usable on the clipboard** (text, or an image type the folder does not allow). Nothing uploads, nothing throws, and only the not-allowed case says so. Pinned in Phase 6 (`paste-intent.test.ts`).

---

## Decisions this plan makes (design doc §14)

**1. The workspace goes in the pane as a backoffice page, not as an element on the desktop page.** Core's media workspace is routed three levels deep: the workspace (`edit/:unique`, `create/parent/...`), its views (Media, Info) and the content tabs. Every one of those routers reads the page address. On the desktop page they would push the desktop's address and two open items would fight over it, which is the wall the views beside the editor hit (`attached-windows.md` §8: views with a router are not offered). On its own route in a frame, the workspace is exactly core's: launcher search already opens media this way, the desktop already watches such a frame for unsaved changes, and swapping items is a route change inside the frame, so core's own discard guard asks before it leaves a dirty item. The cost is one backoffice boot per manager window, on its first opened item; later items route inside the same frame.

**2. The host learns one new kind of attached content: a backoffice page.** Today a pane draws an element app. It will also draw `content.kind: 'iframe'`, with the same chrome stripping, theme mirroring, unsaved-changes and notification watches a window gives its frame, from shared code rather than a second copy. A floating attached window is already a window, so it already draws one. This is the contract extension the brief names: attached content that holds unsaved changes greys Pop out and Dock ("Save or discard your changes first"), and closing the pane asks with core's discard dialog. It is generic: any package can show a backoffice page beside its own app window.

**3. The add-on reaches the host through seven published additions**, events from the app element, one element property and two optional fields, in the style of `umbradesktop-app-location`:

| Addition | What it does |
| --- | --- |
| `umbradesktop-app-title` event, `{ title }` | Sets this window's title and taskbar label, which become the folder's name. An empty title returns to the app's label |
| `umbradesktop-open-attached` event, `{ key, path, name, icon, floating? }` | Opens a backoffice page (`path` under `/umbraco/section/`) attached to this app's window, one per `key`. If that key is open, routes its frame to `path` through the frame's own router, so a dirty workspace asks first |
| `umbradesktop-close-attached` event, `{ key }` | Closes it, asking first when it holds unsaved changes |
| `attached` property on the app element | `Readonly<Record<string, string>>`: each open key's current frame path, kept up to date as the frame routes, missing once it closes. How the manager knows which card gets the pink border |
| `openApp(alias, { location })` | The published `openApp` gains an optional location, so "Open in new window" opens a manager at a folder |
| `umbradesktop-app-focus` event | Brings this app's window and its group to the front: the drop target after a drop, the window an undo acts in |
| `meta.hideFromLauncher` on `umbraDesktopApp` | The app has no tile and no search result, and opens only through `openApp`. For the Transfers window |

Each is documented in `docs/developer/desktop-apps.md` (§7.5 onwards) and declared in the add-on's `umbradesktop-app.d.ts`.

**4. The Media add-on is created by this work.** No `Umbraco.Community.UmbraDesktop.Media` exists yet in any worktree. #144 creates it, the Image Editor (#136) joins it. Frontend only, like Services.Media, so no C# test project: copy and every other operation use core's repositories and the management API client.

**5. Per-window views.** From 17.7 core keeps a collection's current view in the collection's own interaction memory (`UmbCollectionCurrentView`), and the empty route shows the remembered view. The manager intercepts core's view links and builds that window's collection again with the view in `interactionMemories`, carrying the selection across. Before 17.7 there is no memory, so the rebuilt collection gets its layouts with the chosen view first. **Measured in phase 1:** setting the memory on a live collection does not switch it. Core rebuilds its routes, but `umb-router-slot` ignores new routes whose paths match the old ones, so core only applies a view change on an address change. Hence the rebuild.

**6. Folder or item.** A media item is a folder when its media type has a collection (`mediaType.collection` on core's media tree item): Folder, and any custom type set up as a list. A folder opens in the window; anything else opens beside.

**7. Uploads go through our own `UmbMediaDropzoneManager`**, created by the add-on, as §14 foresaw: core's type rules and its "which type?" question stay, and Pause (start nothing new) and Cancel (`removeOne` aborts in flight) become possible. The hosted collection's placeholders are fed from it, so a quick upload looks as it does in the Media section.

---

## File structure

All add-on paths are under `src/Umbraco.Community.UmbraDesktop.Media/backoffice/src/`; host paths under `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/`.

| File | Responsibility |
| --- | --- |
| **Add-on** | |
| `bundle.manifests.ts` | Every manifest of the add-on |
| `umbradesktop-app.d.ts` | The host contract copy, with this plan's additions |
| `manager/manager.element.ts` | One manager window: tree, collection, our overlays, keys, events to the host |
| `manager/folder-host.element.ts` | Hosts core's `umb-collection` for one folder with the stand-in contexts; rebuilds on folder change |
| `manager/folder-context.ts` | The stand-in `UmbWorkspaceContext` and the `UmbEntityContext` a folder gives core |
| `manager/tree-host.element.ts` | Hosts core's media tree, with the recycle bin at its foot, and takes its clicks |
| `manager/location.ts` | A window's location string (`folder=<key|root|bin>;view=<alias>`): parse and print |
| `manager/link-rule.ts` | What a link click inside a window means: open item, open folder, switch view, create, or stop |
| `manager/view-switch.ts` | Setting a hosted collection's view: memory on 17.7+, rebuild before |
| `manager/folder-rule.ts` | Folder or item, from a media type; cached per type |
| `manager/in-manager.condition.ts` | `UmbraDesktop.Condition.InMediaManager`: true only inside a manager window |
| `manager/actions/*.ts` | Our entity and bulk actions: Open in new window, Cut, Copy, Paste, Copy to |
| `selection/*.ts` | Item under a pointer (the spike's three-rule lookup), keys, range, selection box |
| `operations/*.ts` | Move, copy, trash, restore, rename: one engine with per-item results and progress |
| `clipboard/*.ts` | The manager clipboard, the OS clipboard (PNG), paste intent |
| `drag/*.ts` | Drag session, targets, the label, the drag image |
| `upload/*.ts` | OS file and folder drops, screenshot paste, the dropzone manager |
| `transfers/*.ts` | The Transfers app and its model |
| `undo/*.ts` | One history for the manager |
| `context/media-manager.context.ts` | The add-on's desktop context: clipboard, undo, operations, transfers, window registry |
| `localization/en.ts`, `nl.ts`, `parity.test.ts` | Strings |
| **Host** | |
| `components/window-pane.element.ts` | Draws a backoffice page pane; greys Pop out while dirty |
| `frame-watches.ts` (new) | The watches a backoffice frame gets, shared by a window and a pane |
| `components/window.element.ts` | Uses `frame-watches.ts`; handles the new app events; greys Dock while dirty |
| `window-manager.context.ts` | `openApp` location, pane dirty, `setTitle`, close guard for dirty panes, routing an attached page |
| `types.ts` | `UmbraDesktopPane.dirty`, `UmbraDesktopWindow.title` |
| `app.extension.ts`, `registered-apps.ts`, `derive-apps.ts` | `hideFromLauncher` |
| `windows/layout.ts` | Saves the title so a restored window is named before its app reports |
| **Docs** | |
| `docs/developer/attached-windows.md` | §2 Editing, a new §9 backoffice pages, the checklist |
| `docs/developer/desktop-apps.md` | §7.5 to §7.8 for the new events, property and manifest field |
| `src/Umbraco.Community.UmbraDesktop.Media/docs/user/media-manager.md` | The user guide page |

---

## Phase 0: the Media add-on package

Works on its own: an empty add-on that builds, tests, packs, installs on the TestInstance and shows in Desktop settings' package list.

### Task 0.1: Scaffold the project from Accessories

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop.Media/` with `Umbraco.Community.UmbraDesktop.Media.csproj`, `package.json` (name `umbradesktop-media`), `backoffice/{tsconfig.json,vite.config.ts,web-test-runner.config.mjs}`, `backoffice/public/umbraco-package.json` (id `Umbraco.Community.UmbraDesktop.Media`, bundle `umbradesktop-media.js`), `backoffice/src/{bundle.manifests.ts,umbradesktop-app.d.ts}`, `localization/{en.ts,nl.ts,manifest.ts,parity.test.ts}`, `docs/product.json`, `docs/user/README.md`, `README.md`
- Create: `umbraco-marketplace-umbraco.community.umbradesktop.media.json` (repository root)
- Modify: `Umbraco.Community.UmbraDesktop.app.slnx`, `.github/actions/build-packages/action.yml` (restore, `npm ci`, test, build, pack, the same lines Accessories has), `.github/workflows/ci.yml`, `src/Umbraco.Community.UmbraDesktop.TestInstance/Umbraco.Community.UmbraDesktop.TestInstance.csproj` (project reference), `RELEASE.md` (package table, and the new trusted-publishing policy as an owner step), `CLAUDE.md` (layout block), `src/Directory.Build.targets` only if the host-version pinning lists add-ons by name
- Test: `bundle.manifests.test.ts` (manifests have unique aliases), `parity.test.ts`

- [x] Write `bundle.manifests.test.ts` and `parity.test.ts` as Accessories has them; run, see them fail (no module).
- [x] Copy the Accessories skeleton, rename, empty the manifests; run `npm test`, see green; `npm run build`, see the bundle in `wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop.Media/`.
- [x] `dotnet build` the csproj and the TestInstance; `dotnet pack` the add-on and check the nupkg holds the bundle, the docs and the README.
- [x] Marketplace file: the Accessories file's shape, `Description` one or two sentences, `Tags` `media`, `media manager`, `file manager`, `drag and drop`, `clipboard`, `upload`, `desktop`.

---

## Phase 1: manager windows

Works on its own: Media Manager in the launcher opens a window on Media with core's tree and collection. Folders open in the window; Open in new window and middle-click open another; each window has its own view; the title is the folder; windows come back after a reload at their folder and view; Create and the dropzone land in the open folder; the recycle bin opens like a folder. Clicking an item (not a folder) is stopped and does nothing until phase 2: an add-on has no published way to open a backoffice page in a window, and phase 2 adds exactly that.

**As built (2026-10-17):** done and checked in a real backoffice (17.7, headless Chrome): opening, folder clicks from cards and the tree, Media root and recycle bin from the tree, Create's links pointing at the folder, view switch per window, middle-click and Open in new window, reload restoring every window's folder and view, all five themes, and the Media section's menus unchanged. Differences from the tasks below: core's tree links are built from the section they are in (`section/umbradesktop/...` on the desktop), so the link rule accepts any section and reads the tree's Media root and recycle bin links as places; the per-window context is `manager/manager-window.context.ts` and the add-on's desktop context waits for phase 4; folder lookups go through `manager/media-source.ts`, one seam the elements share.

### Task 1.1: Host, app title and `openApp` at a location

**Files:**
- Modify: `types.ts` (`UmbraDesktopWindow.title?: string`), `window-manager.context.ts` (`setTitle(id, title)`, `openApp(alias, options?: { location?: string })`), `components/window.element.ts` (listen for `umbradesktop-app-title`; the titlebar and taskbar read `w.title ?? app.name`), `components/taskbar.element.ts`, `windows/layout.ts` + `layout-persistence.ts` (save and restore `title`)
- Test: `window-manager.test.ts`, `components/window-app-title.test.ts` (new), `windows/layout.test.ts`

**Interfaces:**
- Produces: `openApp(alias: string, options?: { location?: string }): boolean`; event `umbradesktop-app-title` with `detail: { title: string }`, bubbling and composed from the app element.

Tests (names and assertions):
- `openApp with a location opens a new window at it` → the window's `location` is the string and the element got it as `location` before connecting.
- `an app title replaces the label on the titlebar and the taskbar button`.
- `an empty app title returns to the label`.
- `a restored window shows its saved title before its app reports one`.
- `a title is plain text` → `<b>` in a title renders as text.

### Task 1.2: Folder host with the stand-in context

**Files:**
- Create: `manager/folder-context.ts`, `manager/folder-host.element.ts`, `manager/location.ts`
- Test: `manager/location.test.ts`, `manager/folder-host.element.test.ts`

**Interfaces:**
- Produces: `type UmbraDesktopMediaPlace = { kind: 'root' } | { kind: 'folder'; unique: string } | { kind: 'bin' }`; `parseLocation(value?: string): { place: UmbraDesktopMediaPlace; view?: string }`; `printLocation(place, view?): string`; `<umbradesktop-media-folder-host .place .view>` which fires `umbradesktop-media-folder-loaded` with `{ name: string }` once it knows the folder's name.
- `folder-context.ts`: `class UmbraDesktopMediaFolderContext` provided on the alias `UmbWorkspaceContext`, `entityType` `media`, observables `unique` and `contentTypeUnique`, `getHostElement()`, `getUnique()`, `getEntityType()`. Its JSDoc says it is a stand-in for an internal contract, which release found it working (17.7) and that the upstream fix is for the collection to read its parent from its config.

Tests:
- `parseLocation` round-trips root, a folder key, the bin, with and without a view; rejects garbage to root.
- `the host creates umb-collection for Umb.Collection.Media with config.unique set to the folder`.
- `the host provides the folder context with the folder's key, and media-root at the root`.
- `changing place rebuilds the collection` (a new `umb-collection` element).
- Phase 1 real check: Create's links and the dropzone's `parentUnique` point at the open folder.

### Task 1.3: Clicks become windows, folders and views

**Files:**
- Create: `manager/link-rule.ts`, `manager/view-switch.ts`, `manager/folder-rule.ts`
- Test: `manager/link-rule.test.ts`, `manager/view-switch.test.ts`, `manager/folder-rule.test.ts`

**Interfaces:**
- Produces: `linkIntent(href: string, views: ReadonlyArray<{ alias: string; pathName: string }>): LinkIntent` where `LinkIntent = { kind: 'item'; unique: string } | { kind: 'create'; parent: string | null; mediaType: string; path: string } | { kind: 'view'; alias: string } | { kind: 'section' } | { kind: 'other' }`; `setCollectionView(collection: HTMLElement, alias: string): 'memory' | 'rebuild'`; `isFolderType(mediaType: { collection: unknown | null }): boolean` and `UmbraDesktopFolderTypes.isFolder(mediaTypeUnique): Promise<boolean>` (cached).

Tests:
- `an edit link is an item`: `/umbraco/section/media/workspace/media/edit/<guid>` and the base-relative `section/media/...` form.
- `a create link carries parent and type`: `.../create/parent/media/<guid>/<type>` and `.../parent/media-root/null/<type>`.
- `a view link is a view`: `/umbraco/section/umbradesktop/table` with `table` in the views.
- `an unrelated same-origin link is section`, an external one `other`.
- `setCollectionView uses memory when the collection context has interactionMemory`, `rebuilds when it has not`.
- `a type with a collection is a folder; without one it is not`; the lookup asks once per type.

### Task 1.4: The manager window

**Files:**
- Create: `manager/manager.element.ts`, `manager/tree-host.element.ts`, `manager/in-manager.condition.ts`, `manager/actions/open-in-new-window.action.ts`, `context/media-manager.context.ts` (window registry only for now)
- Modify: `bundle.manifests.ts` (the app: label `Media Manager`, icon `icon-pictures-alt-2`, `allowMultiple: true`, `defaultSize { w: 1100, h: 700 }`, `minSize { w: 640, h: 420 }`; the condition; the entity action with `forEntityTypes: ['media']` and the in-manager condition; the desktop context)
- Test: `manager/manager.element.test.ts`, `manager/tree-host.element.test.ts`, `manager/in-manager.condition.test.ts`

**Interfaces:**
- Consumes: Task 1.1's event and `openApp`, Task 1.2's host and location, Task 1.3's rules.
- Produces: `<umbradesktop-media-manager>` with `location?: string` (host property); fires `umbradesktop-app-location` and `umbradesktop-app-title`. Context alias `UmbraDesktopMediaManagerContext`, token `UMBRADESKTOP_MEDIA_MANAGER_CONTEXT`, with `register(win: UmbraDesktopMediaManagerWindow): () => void` and `windows(): ReadonlyArray<UmbraDesktopMediaManagerWindow>`, where a window is `{ element: HTMLElement; place(): UmbraDesktopMediaPlace }`.

Tests:
- `a link click inside the window never reaches the router`: a click on a core-shaped edit link is `defaultPrevented` and a window-level click listener does not see it.
- `a folder card click opens the folder in this window` and reports location and title.
- `a view link click switches only this window's view` (two managers in one fixture).
- `middle-click on a folder opens it in a new window` (`openApp` called with its location).
- `an item click opens the item in its own window` (the interim behaviour; phase 2 replaces this test).
- `a tree folder click opens the folder in this window; a tree item click opens the item`.
- `the bin at the tree's foot opens the recycle bin collection` (`Umb.Collection.Media.RecycleBin.TreeItemChildren` with entity type `media-recycle-bin-root`).
- `the bin window shows core's own Restore, Delete and Empty recycle bin actions`.
- `the condition is true inside a manager and false outside`.
- `Media Manager from the launcher again opens a second window at Media`.

- [ ] Phase 1 real check: two windows on two folders with different views; the Media section in a window beside them unchanged, same view as before; Create and an upload land in the open folder; reload brings both windows back; a restricted user with a start node sees only that branch.

---

## Phase 2: opening an item beside

Works on its own: a click on an item opens core's media workspace attached to the manager window; another click replaces it after core's question; Pop out and Dock grey while dirty; closing asks; Create opens in the pane; the open card has the pink border.

**As built (2026-10-17):** done and checked in a real backoffice (17.7, headless Chrome at 1920x1080): an item opens in a pane named after it with the pink ring on its card; an unsaved name change marks the window and its taskbar button and greys Pop out; the next item brings core's own discard dialog inside the pane, where Stay keeps the item and Discard moves the pane, with its name and the ring following; closing the pane and closing the window both ask with core's dialog; Shift-click opens a grouped window whose Dock is greyed while dirty; Create, from the toolbar and from a folder's own menu, opens core's create page beside the window in that folder, and the new item's card appears, ringed, once saved; the pane lays out at 560 and 720; all five themes draw it; the desktop's address never changed. Differences from the tasks below:

- Core's app element has `min-width: 920px`, so a narrower frame drew at 920 and lost the Save button and the workspace's views. Frames in attached content get the minimum lifted (`narrow` in `frame-watches.ts`).
- `routeFrame` sends `popstate` only when the push moved the frame. After a push core refused, it made the router navigate again, and core closed its own dialog before anyone saw it.
- Core's "Create an item under" dialog, from a card's or tree item's menu, pushes on the desktop page's history itself, which no link rule sees, and took the whole backoffice to the Media section. `manager/route-guard.ts` cancels a push to a media item or create page and opens it beside the window last pressed in.
- The host also renames an open page when an app asks for the page it is already on (`relabelAttached`): the manager names a new item that way once it is saved. `attached` reaches the app through its own app-host property, so an app's `location` is never assigned again.
- A page is saved in its own backoffice, which the manager's collection never hears from. The manager reloads its collection when the page moves on from an item (another item, a new item saved, closed). A rename saved while the item stays open reaches its card only then.
- The theme mirroring moved into `frame-watches.ts` as `UmbraDesktopFrameThemeController`, so a pane and a window share it. A pane's page reports its address (`setPaneLocation`), so Pop out and Dock open on the page it had reached.
- The item trashed or deleted elsewhere (checked afterwards, the same day): a pane's page reports what it shows under its own id (`setSubjects`), and the server-event router treats it as a window (`serverEventTargets`). A clean page whose item is trashed reloads in place and core shows it read-only, under Recycle Bin; a deleted item closes its pane without asking. A trashed page holding unsaved changes keeps them and shows nothing more, since a pane has no notices.

### Task 2.1: Shared frame watches (host refactor, no behaviour change)

**Files:**
- Create: `frame-watches.ts`
- Modify: `components/window.element.ts` (`#onIframeLoad` delegates to it)
- Test: the existing `window-dirty.test.ts`, `window-location.test.ts`, `window-notifications.test.ts`, `window-body.test.ts`, `window-path.test.ts` stay green unchanged; new `frame-watches.test.ts`

**Interfaces:**
- Produces: `startFrameWatches(iframe: HTMLIFrameElement, sink: UmbraDesktopFrameSink, which: ReadonlyArray<UmbraDesktopFrameWatch>): () => void` where `UmbraDesktopFrameWatch = 'chrome' | 'theme' | 'dirty' | 'location' | 'notifications' | 'help' | 'uploads'` and `UmbraDesktopFrameSink` has `setDirty`, `setSubjects`, `setSaves`, `setLocation`, `setTasks`, `loaded()`, `notifications` (the centre and a source id and name).
- The window keeps the path strip and beside watches itself: they are window-only.

Tests: `starting twice stops the first`, `stop removes every listener` (count listeners on a stub frame), `only the named watches start`.

### Task 2.2: A backoffice page as a pane, and dirty attached content

**Files:**
- Modify: `types.ts` (`UmbraDesktopPane.dirty?: boolean`), `window-manager.context.ts` (`setPaneDirty(ownerId, paneId, dirty)`; `confirmDiscard` and `requestClose` cover the owner's dirty panes; `closeAttached` becomes `requestCloseAttached` for the user's close, asking first; `undock` and `dock` refuse while dirty), `components/window-pane.element.ts` (iframe body via `startFrameWatches(['chrome','theme','dirty','notifications','help','location'])`; Pop out disabled with the title `Save or discard your changes first` while dirty), `components/window.element.ts` (the floating strip's Dock disabled the same way), `localization/en.ts` + `nl.ts`
- Test: `window-manager.test.ts`, `components/window-attached.test.ts`, new `components/window-pane-page.test.ts`

**Interfaces:**
- Produces: `manager.setPaneDirty(ownerId: string, paneId: string, dirty: boolean): void`; `manager.requestCloseAttached(ownerId: string, id: string): Promise<boolean>`; a pane `app.content.kind === 'iframe'` is legal.

Tests:
- `a page pane strips the backoffice chrome to workspace-only` (the frame gets the injected style).
- `a dirty pane marks its owner dirty`: the titlebar dot shows; `requestClose` on the owner asks.
- `closing a dirty pane asks, and No keeps it`.
- `Pop out is disabled while the pane is dirty, with the reason as its title`; `Dock is disabled on a dirty floating attached window`.
- `undock refuses a dirty pane` (the manager, not just the button).
- `a clean page pane pops out and docks, keeping its key`.

### Task 2.3: Apps open pages beside their own window

**Files:**
- Modify: `components/window.element.ts` (handle `umbradesktop-open-attached` and `umbradesktop-close-attached` from an element body; set the app's `attached` property from the window's panes and floating windows of page kind, updated as their frames route), `window-manager.context.ts` (`routeAttached(ownerId, key, path)`: pushes the path in the frame's history and fires `popstate`, so core's guard runs inside the frame)
- Test: new `components/window-app-attached.test.ts`

**Interfaces:**
- Produces: events `umbradesktop-open-attached` `{ key: string; path: string; name: string; icon: string; floating?: boolean }` and `umbradesktop-close-attached` `{ key: string }`; the app element's `attached: Readonly<Record<string, string>>`. Attached alias is `umbradesktop-attached:<window id>:<key>`; app built as `entityWindowApp`'s workspace-only page with pane `defaultSize { w: 720, h: 780 }` and `minSize { w: 560, h: 480 }` (both checked against core's media workspace in the phase 2 real check, and changed there if it lays out badly).
- A path outside `/umbraco/section/` is refused, as `sectionUrlFromHref` refuses one.

Tests:
- `an app opens a page beside its window`; `the same key again routes the open frame instead of opening a second`; `Shift asks for floating`.
- `attached reports the frame's path, then nothing once closed`.
- `a path off the backoffice is refused`.

### Task 2.4: The manager opens items beside

**Files:**
- Modify: `manager/manager.element.ts` (item and create intents dispatch `umbradesktop-open-attached` with key `item`; Shift-click floating; the card for the open key gets the border)
- Create: `manager/open-item.ts` (`openItemBorder` styles, and `openKeyFrom(attached): string | undefined` reading the key off an edit path)
- Test: `manager/open-item.test.ts`, `manager/manager.element.test.ts`

Tests:
- `an item click opens it beside`; `a second item click routes the same pane`.
- `Create opens the create route beside, in the open folder`.
- `the card whose key is open has the pink border; selecting others does not move it`.
- `the border follows a route inside the frame` (the frame moved to another item).

### Task 2.5: Contract docs and the real check

- [x] `attached-windows.md`: §2 Editing rewritten (a backoffice page may hold unsaved work; the desktop guards it), new §9 "A backoffice page beside an app window", the checklist gains the dirty rule. `desktop-apps.md` §7.5 to §7.7 for the events and the property.
- [x] Real check: the open item is renamed without saving, another is clicked, core's dialog asks inside the pane; Pop out greyed; close asks; the item is trashed from another window and the pane shows core's trashed state; the pane at 560 and 720 lays out acceptably (screenshot both).

---

## Phase 3: selecting and keys

Works on its own: Ctrl/Cmd+click, Shift+click, arrows, Space, Enter, F2, Delete, type-ahead and the selection box, over core's grid and table.

**Files:** `selection/item-at.ts` (the spike's rule: `.item.unique`, then `data-sortable-id`, then an `/edit/{key}` link, read from the composed path), `selection/keys.ts` (key to intent, platform-aware), `selection/range.ts` (Shift ranges over the collection's item order), `selection/box.ts` (rubber band geometry: which card rects intersect), `selection/box.element.ts` (drawn over core's grid, tokens `--umbradesktop-app-accent`), `platform-keys.ts`.

**Interfaces:** `itemAt(path: EventTarget[]): { unique: string; entityType: string } | undefined`; `keyIntent(e: KeyboardEvent, platform): 'open' | 'toggle' | 'rename' | 'trash' | 'move-up' | ... | undefined`; `rangeBetween(order: string[], anchor: string, to: string): string[]`; `intersecting(box: DOMRect, cards: Map<string, DOMRect>): string[]`. Selection is written through core's `UMB_COLLECTION_CONTEXT.selection` (`select`, `deselect`, `setSelection`), never a copy.

**Tests:** each pure rule above; `Ctrl+click adds without opening`; `Cmd is the modifier on a Mac and Ctrl is not`; `a drag from empty space draws a box and selects what it covers`; `a press on a card does not start a box`; `Delete runs core's trash action for the selection`; `Enter opens the focused item beside`; `type-ahead selects the next name starting with the letters typed within 1 s`.

**F2 opens a small Rename dialog of ours** (decided 2026-10-17): one text field with the current name selected, Rename and Cancel. Core's cards cannot be edited in place, and a rename of ours can go in the undo history, which a rename saved in the pane cannot. Files: `selection/rename-dialog.element.ts` (a modal through `umbOpenModal`), saved by `operations/rename.ts` (Phase 4; until then the dialog saves through core's media detail repository directly and Phase 4 moves it onto the engine). Tests: `F2 opens the dialog with the name selected`, `an empty or unchanged name saves nothing`, `Esc cancels`.

**Steps** (written 2026-10-17, from what phases 1 and 2 measured):

What phase 2 settled that shapes this phase. Core turns a collection select-only while anything is selected, so a plain click selects then and opens nothing. That reconciles design §3 with §8: **Shift+click with nothing selected opens the item as a window (§8); with a selection it extends the range (§3).** Ctrl/Cmd+click with nothing selected selects without opening; with a selection core's own click already toggles, so ours does nothing more. Arrows move the focus only, and select nothing, so a click still opens afterwards; Shift+arrow extends the selection. Core's views draw grid cards as `umb-entity-collection-item-card` (key in `href`, `.item`) and table rows as `uui-table-row[data-sortable-id]`, each in the view's own shadow root, which is where phase 2's ring is written.

- [x] 3.1 `platform-keys.ts` + test: `isMacPlatform(platform)`, `hasPrimaryModifier(e, mac)` (Cmd on a Mac, Ctrl elsewhere). The only reader of `navigator.platform`.
- [x] 3.2 `selection/item-at.ts` + test: the spike's three rules over a composed path, stopping at the manager.
- [x] 3.3 `selection/range.ts`, `selection/neighbour.ts`, `selection/box.ts`, `selection/typeahead.ts` + tests: range over the item order, the next card in a direction from rects (grid rows and table rows), box geometry and what it covers, type-ahead with a 1 s buffer.
- [x] 3.4 `selection/keys.ts` + test: key to intent (open, toggle, rename, trash, move, extend, select all, clear, type-ahead), ignoring keys typed into a field.
- [x] 3.5 `selection/rendered-items.ts` + test: the cards and rows core has drawn, with key, element and rect, found through shadow roots without entering a card.
- [x] 3.6 The folder host exposes core's collection: item order and names, and its selection manager.
- [x] 3.7 `selection/selection.controller.ts`, wired into the manager: modifier clicks, keys, focus, the box (`selection/box.element.ts`), Delete through core's own bulk trash action (its button in core's selection bar).
- [x] 3.8 `selection/rename-dialog.element.ts`, its modal manifest, `selection/rename.ts` (core's media detail repository), strings in `en.ts` and `nl.ts`.
- [x] 3.9 Real check in grid and table, all five themes for the box and the dialog; user guide; As built.

**As built (2026-10-17):** steps 3.1 to 3.9 done, all ticked, and checked in a real backoffice (17.7, headless Chrome): Ctrl+click selects without opening, Shift+click selects a range in the grid and on any cell of the table, Esc clears, the arrows move the focus and select nothing, Space selects, Enter opens beside, type-ahead moves the focus, F2 opens the Rename dialog with the name selected and saves (renamed and back), Delete brings up core's own trash question (answered Cancel), the box from the gap between cards selects the four cards it crosses, and the box and the dialog draw under all five themes; the desktop's address never changed. Differences from the steps:

- Core's selectable card (uui's `SelectableMixin`) takes Enter as well as Space to toggle its selection, and cancels the key. Space is left to it; Enter is taken in the capture phase, before the card, when pressed on an item or the window itself, so it opens as the design says and Enter on core's buttons still presses them.
- Opening an item hands the keyboard to the pane: core's workspace focuses its name field as it loads. The window takes the keyboard back to the item for 20 s after an open (the first open boots a backoffice in the frame, up to ten seconds headless), until the person presses anywhere.
- Core's grid card carries its link's `href` itself, so the item rule reads `href` on any element, not only on a link.
- The table fills its view, so in the table view there is no empty space to start a box from; in the grid there is (gaps, padding). Phase 5 has a drag from a table cell start a move, so a box from a row would have clashed anyway.
- Pressing empty space focuses core's scroll container, which draws core's own focus ring round the cards; the keys still reach the window.

---

## Phase 4: operations, clipboard and Copy to

Works on its own: Cut, Copy, Paste and Copy to, from menus and keys, between folders and windows; cut items fade; partial moves; refusals by permission and allowed type.

**Files:** `operations/engine.ts` (runs a list of steps with per-item results, progress and a pause and cancel switch), `operations/move.ts` (core's move endpoint), `operations/copy.ts` (new item from the original's file: fetch the detail, download the file, upload a temporary file, create with the values copied and the file value replaced), `operations/trash.ts`, `operations/restore.ts`, `operations/rename.ts`, `operations/rules.ts` (may this item go into that folder: allowed child types from the media type structure, start nodes), `clipboard/clipboard.ts` (the manager clipboard in the context: `{ mode: 'cut' | 'copy'; items }`), `manager/actions/{cut,copy,paste,copy-to}.action.ts`, `manager/cut-fade.ts`.

**Interfaces:** `runOperation(op: UmbraDesktopMediaOperation): UmbraDesktopOperationHandle` where an operation is `{ kind: 'move' | 'copy' | 'trash' | 'restore' | 'rename'; items: Item[]; target?: Place; name?: string }` and the handle exposes `progress: Observable<OperationProgress>`, `pause()`, `resume()`, `cancel()`, `done: Promise<OperationResult>` with `{ succeeded: Item[]; failed: { item; reason: string }[]; created: Item[] }`. Every success raises core's `UmbRequestReloadChildrenOfEntityEvent` for source and target, so every window on those folders reloads.

**Tests:** `split(items, target)` puts allowed and refused apart with the reason; `copy creates a new item with the same values and a new file`; `a failed item does not stop the rest`; `cancel stops new items and keeps what is done`; `pause finishes in-flight and starts nothing`; `Esc empties a cut`; `cut items fade until pasted or emptied`; `paste of a cut moves, of a copy copies`; `pasting a copy into its own folder makes duplicates beside the originals`; `Copy to opens core's folder picker and copies`; `our actions do not appear in the Media section` (condition false outside).

**Steps** (written 2026-10-17, from phases 1 to 3):

What the earlier phases settled. Core's own move (`Move to`) calls `MediaService.putMediaByIdMove` and then raises `UmbRequestReloadChildrenOfEntityEvent` and `UmbRequestReloadStructureForEntityEvent` on `UMB_ACTION_EVENT_CONTEXT`, which every hosted collection and tree on the desktop page hears, so our operations do the same and every window on those folders reloads. A page beside a window saves in a backoffice of its own and is told by the server-event router (phase 2), so the pane needs nothing here. The phase 3 rename saved through core's detail repository; it moves onto the engine here. Copying a folder copies what is in it, as every OS does. A copy keeps its name: where the server refuses or renames a duplicate name, that is Umbraco's answer and wins (design §1); the real check says which.

- [x] 4.1 `operations/media-api.ts`: one seam over the management API (`MediaService`, `MediaTypeService`, `TemporaryFileService` through `tryExecute`, notifications off), each call answering with Umbraco's reason on failure: item, children, detail, create, move, trash, restore, rename, upload a file, download a file, allowed child types.
- [x] 4.2 `operations/rules.ts` + test: `split(items, target, allowed)`: a type the folder does not allow, a folder into itself or below itself, an item already there.
- [x] 4.3 `operations/engine.ts` + test: a list of steps run one at a time, per-item results, progress, pause (in-flight finishes, nothing new starts), resume, cancel (nothing rolled back), `done`.
- [x] 4.4 `operations/{move,copy,trash,restore,rename}.ts` + tests against a stand-in API: each an operation of steps; copy downloads the file, uploads it again and creates the item with its values, recursively for a folder; every success reloads source and target through core's action events.
- [x] 4.5 `context/media-manager.context.ts` (an `umbraDesktopContext`): the clipboard (`{ mode, items }`), running operations, and the place each manager window shows; `clipboard/clipboard.ts` + test for its rules (cut, copy, empty, what Paste would do where).
- [x] 4.6 Actions, each with the in-manager condition and core's not-trashed condition: Cut and Copy on an item's menu, Paste on a folder's menu and the Media root's while something is held, Cut, Copy and Copy to in core's selection bar (Copy to through core's folder picker, `UMB_TREE_PICKER_MODAL`). Strings in `en.ts` and `nl.ts`.
- [x] 4.7 Keys: Ctrl/Cmd+X, C and V in the window; Esc empties a cut once nothing is selected. `manager/cut-fade.ts`: cut items fade in every window that shows them, written as the open ring is.
- [x] 4.8 Failures and refusals: a notification naming what did not go and Umbraco's reason, until Transfers (phase 7) shows them.
- [x] 4.9 Real check: cut and paste, copy and paste (into another folder, into its own), Copy to, a refused type, a paste across two windows, the fade, the Media section's menus unchanged, all five themes for the fade; user guide; As built.

**As built (2026-10-17):** steps 4.1 to 4.9 done, and checked in a real backoffice (17.7, headless Chrome) in throwaway folders created and removed by name, only ever moving copies: Ctrl+C in one window and Ctrl+V in another copied an image as a new item with its own file (a new `/media/...` path); Ctrl+X faded the card to 0.5 and Ctrl+V in a third window moved it, both windows showing the change without a reload; Ctrl+C then Ctrl+V in the same folder made a duplicate, which the server named "Janae Cram (1)" itself, so that is Umbraco's naming and nothing of ours; Copy to through core's own folder picker copied into the chosen folder; the fade draws under all five themes; the Media section's Media root menu shows only core's and Deploy's items. Differences from the steps:

- The operations are in one file, `operations/steps.ts` (move, copy, trash, restore, rename), rather than one file each; copying is most of it.
- A copy leaves out the values whose editor is `Umbraco.Label` (width, height, size, extension), which the server works out from the new file.
- Because Cut and Copy sit at the top of an item's menu, core makes Cut the card's quick button, as "Open in new window" is on a folder card.
- Not checked in the real backoffice: a type a folder refuses (every folder in the test data allows every type; the rule and the partial move are unit-tested), and an item card's own menu in the Media section (the root menu was read; the in-manager condition is unit-tested both ways).
- Failures and refusals show as one desktop notification listing each item and the reason, until Transfers (phase 7).

---

## Phase 5: dragging

Works on its own: drag items between windows, onto folder cards, tree folders and the bin; Ctrl/Option copies; the label; partial drops; after a drop the target comes forward with the items selected; drag out of the bin restores.

**Files:** `drag/drag-session.ts` (state: items, source, modifier, target; pure), `drag/targets.ts` (resolve the target under the pointer: folder card, then tree folder, then a window's folder area, then the bin; one target only), `drag/label.ts` (the text: "Move to People", "Hold Ctrl to copy", "Move 2 of 3 to Design", the refusal reason), `drag/drag-image.ts` (thumbnail or stack with count), `drag/drag.controller.ts` (capture listeners at the document, the private MIME type `application/x-umbradesktop-media`, starting a drag from a table cell that is not the name), `drag/hover-expand.ts` (closed tree folders open after 700 ms).

**Tests:** label text for move, copy, partial, refused, Mac copy key; `one target at a time: a folder card wins over its window`; `a card never opens on hover`; `ends cleanly on dragend without drop`; `Esc cancels`; `copy sets dropEffect copy and leaves the originals unfaded`; `Ctrl+drag within one folder duplicates`; `a press on a selected card drags the selection, on an unselected card just that card`; `after a drop the target window gets umbradesktop-app-focus and the moved items are selected`; `a drag from the bin onto a folder restores there`. Real check: a native drag from core's grid link and table name cell in headed Chrome (puppeteer drag interception), and the drop on the OS desktop makes only a harmless link.

**Steps** (written 2026-10-17, from phases 1 to 4):

What the earlier phases settled. Items are found under the pointer with `selection/item-at.ts` (cards, rows, and the tree's links, whose `href` carries the key). The operations, the folder rules (`operations/rules.ts`) and the reload of every window on a changed folder exist in the desktop context, so a drop is one call there. Phase 3's style writer (`writeViewStyle`) draws a lit folder card and the faded originals the way the open ring and the cut fade are drawn. A drop on the recycle bin trashes through the operations, as an OS recycle bin does, so phase 8 can undo it; it does not ask, as an OS does not.

- [x] 5.1 Host: the `umbradesktop-app-focus` event brings the app's window and its group forward, restoring it when minimised (`components/window.element.ts`, a constant, a test, `desktop-apps.md` §7.6); the add-on's `umbradesktop-app.d.ts`.
- [x] 5.2 `operations/media-api.ts` gains `items(uniques)`, one request for many, so a drag knows which cards are folders and their types.
- [x] 5.3 `drag/drag-session.ts` + `drag/label.ts` + tests: what a drag carries, the copy key by platform (Ctrl, Option on a Mac), and the label for move, copy, partial, refused, the bin and restore.
- [x] 5.4 `drag/targets.ts` + test: the one target under the pointer, from the composed path: a folder card, then a tree folder, then the recycle bin, then a window's folder area.
- [x] 5.5 `drag/drag-image.ts`: a thumbnail of the item grabbed, or a small stack with the count.
- [x] 5.6 `drag/drag.controller.ts`, started by the desktop context, with manager windows registering themselves: capture listeners at the document for `dragstart`, `dragover`, `drop` and `dragend`, the private type `application/x-umbradesktop-media`, a press on a selected card dragging the selection, a press on any table cell starting a drag from its row.
- [x] 5.7 What a drag draws: the target window's folder area outlined, a lit folder card or tree folder, red with the reason when refused, the label under the pointer, the originals faded while moving; all cleared on `dragend`, drop or Esc.
- [x] 5.8 `drag/hover-expand.ts`: a closed tree folder opens after 700 ms under a drag; folder cards never open.
- [x] 5.9 After a drop: the target window comes forward (5.1) with the dropped items selected and in view; a drag out of the bin onto a folder restores there; a drop on the bin trashes.
- [x] 5.10 Real check, with drag events dispatched in the page (headless Chrome cannot start an OS drag): between windows, onto a folder card, a tree folder and the bin, Ctrl to copy, a partial drop, out of the bin; all five themes; user guide; As built.

**As built (2026-10-18):** steps 5.1 to 5.10 done, and checked in a real backoffice (17.7, headless Chrome at 1920x1080) with drag events dispatched in the page, in throwaway folders created and removed by key, only ever moving a copy of an image: a drag from one window faded the card to 0.5, outlined the other window's folder area with "Move to Phase 5 B / Hold Ctrl to copy", and the drop moved it, brought that window to the front and selected the item there; Ctrl changed the label to "Copy to Phase 5 A", left the original unfaded, and the drop made a copy; a folder card lit on its own, without the window's outline, and took the drop; resting on the closed Media root in the tree opened it, and the drop on a folder inside landed there; a selection of two folders over one of them said "Move 1 of 2 to Phase 5 Sub2" with the reason for the other, and moved the one; a folder over itself turned red with the reason and refused the drop; the tree's Recycle Bin trashed; a drag out of the recycle bin window onto a window said "Restore to Phase 5 B" and restored there; all five themes draw the outline, the lit card and the label, red when refused, and clear them after. Differences from the steps:

- The real check found three bugs every unit test had passed, each now with a test: uui's `hasChildren` is a property it never reflects to an attribute, so hover-to-open read the wrong thing and never opened anything; a tree folder that appears during the drag (because the drag opened its parent) was not known to be a folder, so the drop fell through to the Media root around it, which moved a copy to the root before it was caught; and the drag kept what it read about items from one drag to the next, so an item moved by the last drop was taken to still be where it was. A drop now reads anything under the pointer it has not read before deciding, and each drag reads afresh.
- Core's selection keeps the keys of items that have left the folder, so a drag carries only the selected items the window still draws.
- The label's words come back as dictionary keys from `drag/label.ts` and are put into the person's language by the window, with core's `#keys` (the Media root's name, the refusal reasons) translated as arguments.
- The window's half of the drag (outline, label, coming forward, selecting what arrived) is a handle each manager window registers with the desktop context, which owns the one drag controller, since a drag starts in one window and ends in another.
- Chrome ignores `dropEffect` on a `DataTransfer` made outside a real drag, so the unit tests give theirs a plain property.
- Not checked: a drag started with the real mouse. Headless Chrome starts no native drag from mouse input, and puppeteer's drag interception no longer works with current Chrome; that core's cards and table names drag natively was measured in the hosting spike ("Dragging between windows"). A press on a table cell other than the name making the row draggable is unit-tested only.

---

## Phase 6: the OS clipboard and files from the OS

Works on its own: copying one image puts the picture on the OS clipboard; pasting a screenshot uploads "Pasted image <date time>"; pasting our own copied picture copies the item; files and folders dropped from the OS upload into the folder under the pointer with a label naming it.

**Files:** `clipboard/os-image.ts` (to PNG through a canvas; remember what was written), `clipboard/paste-intent.ts` (files on the clipboard, our own picture, nothing usable; reads `items`/`files`, never `types`), `upload/dropzone.ts` (our `UmbMediaDropzoneManager`, feeding the hosted collection's placeholders), `upload/paste-name.ts` (`Pasted image 2026-10-17 14.23.17`, sortable, nothing a file system objects to), `upload/os-drop.controller.ts` (dragover label "Upload to People", drop on a folder card uploads there), `upload/folder-entries.ts` (walk dropped folders).

**Tests:** `paste-intent` for files, our picture, text only, empty; `a JPEG is converted to PNG on copy, the item untouched`; `the pasted name is sortable and has no colon`; `a paste into a folder that refuses images uploads nothing and notifies`; `a dropped folder keeps its structure`; `the OS drop label names the target folder`. Real check: clipboard needs full headless plus `Browser.grantPermissions` with `clipboardReadWrite` (September spike §3).

**Steps** (written 2026-10-18, from phases 1 to 5):

What the earlier phases settled, and what a probe of the real backoffice measured on 2026-10-18. Core's `umb-dropzone-media` in a manager window listens at the document and, during an OS file drag, lays its overlay over the whole window, the tree included (it is positioned against the manager element), so a drop never reaches a folder card or a tree item: what is under the pointer has to be found by hit-testing beneath the overlay. Core's overlay already uploads into the folder the window shows, with its own placeholders, and stays the target there. Ctrl+V is taken on the keydown today, which stops the browser from sending the paste event that carries the OS clipboard, so the key has to let the paste through. The window handles from phase 5 (outline, label, coming forward) serve the OS drop too, and `drag/targets.ts` finds its targets.

- [x] 6.1 `upload/paste-name.ts` + test: `Pasted image 2026-10-17 14.23.17`, in local time, sortable, no colon; only for a pasted picture without a real name (Chrome calls every one `image.png`); a file pasted from the OS keeps its own name.
- [x] 6.2 `clipboard/os-image.ts` + test: a picture to PNG through a canvas (the clipboard takes PNG only, so a JPEG or WebP is converted and the item is untouched); a fingerprint (size plus a small grid of average colours) that survives the browser re-encoding the PNG; writing it to the OS clipboard as a `ClipboardItem` with a promise, so the write starts inside the key press.
- [x] 6.3 `clipboard/paste-intent.ts` + test: from a paste's `items` and `files`, never `types`: our own picture coming back (fingerprint matches what we wrote), files to upload, or nothing usable (text), which pastes what we hold.
- [x] 6.4 The context: copying exactly one image also puts its picture on the OS clipboard and remembers the fingerprint; Cut and copying several leave the OS clipboard alone.
- [x] 6.5 The window: Ctrl+V lets the paste event through and pastes from the paste event: our picture pastes a copy of the item, files upload into the open folder through core's own dropzone in the window (so core picks the type and draws its placeholders), anything else pastes what we hold. When no paste event follows the key (Safari sends none outside editable fields), the key pastes what we hold. Not in the recycle bin.
- [x] 6.6 `upload/folder-entries.ts` + test: dropped folders read into core's `{ files, folders }` shape, keeping their structure; the entries are taken while the drop is being sent, as the browser empties them after.
- [x] 6.7 `upload/os-drop.controller.ts` + test, started by the desktop context beside the drag controller: an OS file drag over a manager window finds the target under core's overlay by hit-testing, shows "Upload to <folder>" in the window, lights a folder card or tree folder, and on a drop there uploads into that folder through core's `UmbMediaDropzoneManager` (core's drop is stopped and its overlay reset); the window's own folder area stays core's; the recycle bin refuses.
- [x] 6.8 Real check in full headless with `Browser.grantPermissions` (`clipboardReadWrite`): copy an image, read the OS clipboard back as PNG, paste it into another folder as a copy; paste a picture that is not ours as "Pasted image ..."; OS drops (a `DataTransfer` built with files) on a folder card, a tree folder and the open area; the label under all five themes; user guide; As built.

**As built (2026-10-18):** steps 6.1 to 6.8 done, and checked in a real backoffice (17.7, headless Chrome) in throwaway folders created and removed by key, only ever copying the original image. Ctrl+C on one image wrote its picture as a 2048x1365 PNG (from a JPEG); that picture pasted into another window made a copy of the item, not an upload; a picture that was not ours uploaded through core's dropzone as "Pasted Image 2026.10.18 01.13.04", with core's placeholders; files from the OS over a window said "Upload to Phase 6 B", over a folder card "Upload to Phase 6 Sub" with the card lit, and the drop uploaded into that folder and put core's overlay away; resting on the closed Media root in the tree opened it, and a drop on a folder inside uploaded there; the tree's recycle bin said "Files cannot go into the recycle bin" and took nothing; the label draws above core's overlay under all five themes and goes once the files leave; the desktop's address never changed. Differences from the steps:

- The page's clipboard write was caught in the page rather than let through, because headless Chrome on this machine may write to the real OS clipboard, which would overwrite whatever was last copied there. So the picture written was checked, and the paste was made with it, but not through the OS.
- Core 17.7 names an upload from its file name, turning dashes and underscores into spaces and capitalising each word ("drop-card.png" becomes "Drop Card"). The planned "Pasted image 2026-10-17 14.23.17" cannot survive that, so the date is written with dots: "Pasted Image 2026.10.17 14.23.17" in 17.7.
- Core 17.7 deprecates its dropzone's `onUpload` (removal in v21). A paste is handed to core's dropzone as the `change` event of the `uui-file-dropzone` inside it, which is exactly what a drop sends.
- The media package exports core's dropzone element but not its upload manager, so `upload/upload.ts` reads the manager's class off one element made for the purpose and taken down at once. Used only for uploads into a folder the window does not show.
- During an OS file drag core's overlay covers the whole window, tree included, and sits in a shadow root below the cards, so the target is found by hit-testing beneath it (`pathAt` in `upload/os-drop.controller.ts`), skipping any element on top only because of the overlay.
- The real check found three bugs the unit tests had passed: core 17.7 stops the event its dropzone is handed, so a plain object crashed the paste; the hit test stopped at the folder host where the overlay alone had put it on top, so the tree's recycle bin read as the window; and a real pointer over a tree item is over uui's own link inside it, so hover-to-open looked for `hasChildren` on the link (which also affected a drag of items with a real mouse). Each now has a test. Resting files on a closed tree folder opens it, as for a drag of items.
- Ctrl+V no longer cancels the key, so the browser sends its paste event, the only way to read the OS clipboard; when none follows within 150 ms (Safari outside a text field), the key pastes what the manager holds. A paste into a text field stays the field's.
- Core shows its own upload list ("Clear file(s)") under the folder after a paste, as after any drop on its dropzone, and its upload arrow shows in every manager window during an OS drag, since each window's dropzone listens at the document. Both are core's.
- Not checked: a drop of real files on the window's open area, which is core's own dropzone: a `DataTransfer` built in a script has no file system entries for uui's dropzone to read, so nothing uploads. The same core path is exercised by the paste. A dropped folder keeping its structure is unit-tested only, for the same reason.
- The first Ctrl+click in an inactive manager window only activates the window; a second one selects. That is the host's focus catcher, a decision since September (`window.element.ts`, pinned by `window-body.test.ts`): click to focus, then act. Luuk kept it for the Media Manager too (2026-10-18).

---

## Phase 7: the Transfers window

Works on its own: an operation still running after 2 s opens one Transfers window for the desktop, a section per operation, with progress, counts, size and time left, Pause and Cancel each, a row per item, failures with Umbraco's reason and Retry, the taskbar ring, self-closing with a notification when all worked, staying folded to failures when not.

**Host:** `meta.hideFromLauncher` (`app.extension.ts`, `registered-apps.ts`, `derive-apps.ts`, the launcher and search skip it, `openApp` still finds it). Tests in `registered-apps.test.ts`, `launcher-search.test.ts`.

**Files:** `transfers/transfers-model.ts` (per operation: totals, rate, time left; the 2 s rule; when to close itself), `transfers/transfers.element.ts` (the app, `allowMultiple: false`, `hideFromLauncher`), `transfers/transfers-section.element.ts`. Progress as `umbradesktop-task` events so the ring and the close guard are the host's own.

**Tests:** `opens at 2 s only for an operation still running`; `time left from the recent rate`; `all worked closes and notifies once`; `a failure keeps it open folded to failures`; `Retry failed reruns only the failures`; `Cancel asks first and rolls nothing back`; `closing while running asks` (host guard via tasks); `keeps going when the source manager closes`; `leaving the desktop warns while a transfer runs` (host exit guard via tasks).

**Steps** (written 2026-10-18, from phases 1 to 6):

What the earlier phases settled. Operations already run in the desktop context, so they outlive the window that started them, through `runOperation`, which reports totals but not yet a row per item. Uploads all go through core: into the folder a window shows through core's own dropzone in that window (a paste, and a drop on the open area), and into a folder card or tree folder through core's upload manager (`upload/upload.ts`). Core's dropzone events do not bubble out of it, but the host already finds a dropzone by the context request it sends as it connects, and reads its `progressItems()` (`progress/upload-watcher.ts`, `window-progress.md` §3); a manager window can do the same for the dropzone in it. The host's `umbradesktop-task` events give the busy ring, the question before closing and the warning before leaving the desktop, so the Transfers window reports its work as tasks and builds none of that.

- [x] 7.1 Host: `meta.hideFromLauncher` on a `umbraDesktopApp`: the launcher and its search leave the app out, `openApp` still opens it. Tests; `desktop-apps.md` §2.
- [x] 7.2 `operations/engine.ts`: a row per item (waiting, running, done, failed with Umbraco's reason, cancelled) and Retry failed, which runs the failed steps again in the same operation.
- [x] 7.3 `upload/upload-watch.ts` + test: core's dropzones in a manager window found by their context requests, as the host's watcher finds them in a frame, and the batch in progress followed through `progressItems()`; an upload into a folder card or tree folder followed through its own manager. Cancel stops what has not gone up. Core has no pause for uploads, so Pause is greyed for them, not hidden.
- [x] 7.4 The context: one transfer per operation or upload batch, with what it is, where it goes, its rows, counts, bytes for uploads, when it started and its state; Pause, Resume, Cancel and Retry failed.
- [x] 7.5 `transfers/transfers-model.ts` + test: the title, the overall bar, the line under it (counts, size for uploads, time left from the recent rate), the 2 s rule, a finished transfer folded to its failures, and when the window closes itself and what the notification says.
- [x] 7.6 The Transfers app: `transfers/transfers.element.ts` and a section element, one window for the desktop (`allowMultiple: false`, `hideFromLauncher`), opened by the context for a transfer still running after 2 s. Pause or Resume, Cancel (asks first with core's dialog, saying how many stop and how many stay), Retry per item, Retry failed, Open folder. Its running transfers are reported as `umbradesktop-task`, so the ring, the question before closing and the warning before leaving are the host's.
- [x] 7.7 When everything worked the window closes itself and the desktop's notification says what went where; with a failure it stays, folded to the failures.
- [x] 7.8 Real check with the network slowed through CDP so a copy runs past 2 s: the window opens, Pause and Resume, Cancel asks and stops, a failure shows Umbraco's reason and Retry, the ring when minimised, the self-close and its notification, an upload shown; all five themes; user guide; As built.

**As built (2026-10-18):** steps 7.1 to 7.8 done, and checked in a real backoffice (17.7, headless Chrome, the network slowed through CDP) in throwaway folders created and removed by key, only ever copying the original image. A copy of four images opened the Transfers window between 1.2 and 3.2 seconds, with a row per item and "about 9 seconds left"; Pause stopped it at "2 of 4 items, Paused" and Resume carried on; minimised, its taskbar button carried the ring; when it finished the window closed itself and the desktop's notification said "Copied 4 items to Phase 7 B"; Cancel brought core's dialog, Stop ended it at 3 of 4 with the last row Cancelled; a copy of an item deleted beforehand kept the window open, folded to that item with Umbraco's "The requested resource was not found." and Retry beside Retry failed; a pasted picture of 1.2 MB showed as "Uploading Pasted image ... to Phase 7 C, 655 KB of 1.2 MB, about 3 seconds left"; under all five themes a copy opened the window and it closed itself; the launcher and its search leave Transfers out. Differences from the steps:

- The real check found one bug: a transfer that finished before the window ever opened stayed in the list, so the window opened on a page of old quick copies, and an old failure among them kept it from ever closing itself. A transfer over before the window opened for it is now forgotten when it ends; its failure is the desktop notification's to say, as in phase 4.
- The Transfers window is one element (`transfers/transfers.element.ts`) with a section per transfer, rather than a separate section element.
- The model's titles name one item, or one uploaded folder, by name ("Copying Banjo to Design"), and the line under a finished transfer says what worked and what failed, as the mock's "41 of 42 files uploaded. 1 failed." does.
- Retry on a row retries that item; Retry failed retries them all; both run again in the same transfer, so it keeps one section. An upload's retry uploads the failed files again through core's manager.
- uui's button clicks asynchronously (its `click()` waits for its own update), which the tests wait for.
- Uploads through core's dropzone in a window (a paste, a drop on the open area) belong to that dropzone and stop if the window closes, against design §7's "keep going". The window reports them as busy, so closing it, or leaving the desktop, asks first. Making them keep going means uploading through the desktop context's own core manager, which keeps core's type rules but loses core's placeholder cards in the window; that is a choice for Luuk. Moves, copies and drops on a folder card or tree folder run in the desktop context and keep going.
- Not checked in the real backoffice: the question on closing the Transfers window, or a manager window, while it runs, and the warning when leaving the desktop; both are the host's own task guards, unit-tested there.

---

## Phase 8: undo

Works on its own: Ctrl/Cmd+Z in any manager window undoes the last move, copy, rename or trash, in one history for the whole manager, silently on success, with a notification and the step dropped when it cannot.

**Files:** `undo/history.ts` (a stack of `{ op, inverse }` with each step's expected state), `undo/inverse.ts` (move → move back; copy → trash the copies; rename → old name; trash → restore), `undo/precheck.ts` (is the item still where the step left it).

**Tests:** each inverse; `an upload is not undoable`; `someone moved it since: refuse, notify, drop the step`; `undo brings the window of the items forward with them selected`; `one history across two windows`.

**Steps** (written 2026-10-18, from phases 1 to 7):

What the earlier phases settled. Every move, copy, rename and trash runs through the desktop context's `#run`, which knows each item as it was before (its folder and its name) and, for a copy, the key of the new top item (a folder's copy is one item with its contents under it). So the context is where the one history lives, fed from what worked. An undo runs as an operation of its own, through the same engine, so a long one shows in Transfers, and it is not recorded itself. Uploads never go through `#run`, so they are never in the history. Phase 5's window handles give coming forward and selecting what arrived.

- [x] 8.1 `undo/inverse.ts` + test: the step to record from what an operation did (move: each item's folder before and after; copy: the copies; rename: the name before and after; trash: each item's folder before), what undoes it (move back; trash the copies; rename back; restore to where it was), and the check that nothing changed since (still in the folder it was moved to; the copy still there and not in the recycle bin; still the name it was given; still in the recycle bin).
- [x] 8.2 `undo/history.ts` + test: one stack for the desktop; a step only for an operation in which something worked; undo takes the last step, checks every item first, and either undoes all of it or nothing, dropping the step either way.
- [x] 8.3 The context: records each operation's step, `undo()` runs the inverse as an unrecorded operation, says nothing when it worked, and raises a desktop notification saying why when it cannot ("Can't undo the move", what changed, "Nothing was changed"). The window showing the folder the items went back to comes forward with them selected.
- [x] 8.4 Keys: Ctrl+Z, Cmd+Z on a Mac, in any manager window, outside text fields, which keep their own undo.
- [x] 8.5 Real check: a move, a copy, a rename and a trash each undone with Ctrl+Z, one of them from the other window; a move changed by someone else first refuses with the notification; user guide (keys table and a section); As built.

**As built (2026-10-18):** steps 8.1 to 8.5 done, and checked in a real backoffice (17.7, headless Chrome, a real Ctrl+Z each time) in throwaway folders created and removed by key, with a copy of the original image. A move from A to B undone in B's window went back to A, and A came to the front with the item selected; a copy undone from the other window went to the recycle bin; a rename was renamed back; an item moved to the recycle bin was restored to its folder; a move that someone else moved again through the API was refused with "Can't undo the move" and "... was moved again after you moved it. Nothing was changed.", and nothing moved. Differences from the steps:

- The undo of a move hands the move each item as it is now, in the folder it went to. Handed the item as it was before, the move refused it as already in its folder; the context's test found that before the real check did.
- Umbraco renames an item that goes into the recycle bin beside another of the same name, so an item trashed and restored can come back as "Name (1)"; the undo restores what Umbraco has.
- Refs from the server now carry `isTrashed`, which the checks for a copy's and a trash's undo read.
- The real check left one copy in the recycle bin, put there by the undo of the copy; it was removed by exact name after confirming it was not the original.

---

## Phase 9: finishing

- [x] All five themes: the manager, the label, the box, the pink border, the pane, Transfers; screenshots of each; nothing hidden under any theme.
- [x] The user guide `media-manager.md` in the add-on's `docs/user/`, following `writing-documentation.md`, added to its README; linked from the host's docs where media is mentioned.
- [x] Marketplace tags confirmed and a screenshot in `docs/screenshots/` plus `Screenshots`; host README gets at most one line, only if Luuk wants one.
- [x] Design doc §14 answered with what was found, and the stand-in context written down for the upstream issue.
- [x] Full real-backoffice walk of the design doc, section by section.
- [x] Ask Luuk before changing #144's text (design §13), and before filing the upstream issue. 2026-10-18: #144 updated; the upstream issue not filed (design §15 says why); the host README got one line; uploads keep asking before a window closes.
- [x] `npm run build` and `npm test` in host and add-on; `dotnet build` and `dotnet pack`.

**As built (2026-10-18):** done, except asking Luuk, which waits on him. Every theme draws everything: each phase's real check ran all five (the selection box and Rename dialog in phase 3, the cut fade in phase 4, the drag outline, lit card and label in phase 5, the upload label in phase 6, the Transfers window in phase 7), and a last pass drew a manager window with an item open beside it and its ring under each. The user guide has a section per feature and is linked from the add-on's README and from the host's Busy windows page; the add-on's docs keep no README of their own, as the other add-ons'. The marketplace file gained "transfers" and "screenshot to media", and a screenshot (`docs/screenshots/media-manager.png` in the add-on, 1440 by 900, also in the add-on's README). Design §14 is answered and §15 holds the upstream issue as a draft; core's restore panel was opened from a recycle bin window and cancelled. The walk of the design doc, section by section, is the phase checks: §2 phase 1, §3 phase 3, §4 phase 5, §5 phases 4 and 6, §6 phase 6, §7 phase 7, §8 phase 2, §9 phases 1 and 5, §10 phase 8, §11 phases 4 and 5. Host 2937 passing and building with no dead links, the add-on 312 passing and building; `dotnet build` in Release and `dotnet pack` of the host and the add-on succeed, each package carrying its frontend (239 and 31 files).

Waiting on Luuk: #144's text (design §13), filing the upstream issue (design §15), whether the host README gets a line, and whether uploads through core's dropzone in a window should keep going when it closes (phase 7's As built).

## Not in this work

- **Edit image** and **View** on images (#144's last "desktop adds" line): they open #136's editor and #145's viewer, which do not exist yet. Each of those issues adds its action to the manager when it is built.
- The shelf (#26), pickers on pages, and the "later" list in design §12.
