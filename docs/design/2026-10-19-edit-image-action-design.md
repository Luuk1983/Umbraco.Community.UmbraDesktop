# Edit image from a media item (#137)

Date: 2026-10-19. Status: built 2026-10-20, uncommitted; §11 is what the build found.

## 1. What and why

The Image Editor (#136) is an app in the launcher, and an app in the launcher is easy to miss.
People decide an image needs fixing while they are looking at it: on the media item. This adds an
**Edit image** action to image media items that opens the editor with that image loaded.

The issue as filed also had an action on Media Picker and Image Cropper properties, opening the
editor attached to the document's window. That part is split off into its own issue (§9). The
reasons:

- Umbraco has one place an image lives: the media library. A page points at it. An action on the
  page invites the editor to think they are fixing *this page's* photo, while Save changes it on
  every page that uses it.
- An Image Cropper property has no media item behind it. Its file is stored on the page itself, so
  "save over the media item" does not apply, and the standard Image media type uses the same
  cropper for its own file, so an action on the cropper would also appear inside every media item.
- Nearly all of the new plumbing was for the page path: attaching an app from inside a frame, unsaved
  work in a docked element pane (not wired today), and writing a property value from outside its
  editor.
- A page still has a short route, without any of that: clicking an image in a Media Picker opens its
  media item, and the item's actions menu then has Edit image (to be confirmed, §7).

## 2. Goals, non-goals

Goals:

- **Edit image** on image media items, wherever core shows a media item's actions: the tree, the
  collection (grid and table) and the item's own workspace. In the Media section, in Media Manager
  windows and in the Media Manager's item pane. A Manager window's tree shows folders only (Media
  Manager design §17), so there it is in the collection and the item pane, not the tree.
- It opens the Image Editor in its own desktop window with that image loaded. If an editor window is
  already showing that image, that window comes to the front instead.
- Before saving over an image used elsewhere, the save says so, once (§5), whichever way it was saved.
- A media window showing the item takes the new image after a save, rather than a stale one.

Non-goals:

- Anything on a page's properties (§9).
- Refreshing picker thumbnails in open document windows. Umbraco does not do this across browser tabs
  either; a page shows the new image when it is next opened. (Since §11.5 the desktop's live media
  refresh announces every media change in each window's frame, and core's picker items and thumbnails
  listen to that too, so it probably happens now; not measured in a document window.)
- The action in the plain backoffice, outside the desktop. It is hidden there: the editor lives on
  the desktop, and an action that opens a different page would be a surprise.
- A per-item "can edit" check on the client. Core has none for media (§3).

Anti-goals: a second editor window for the same image; a save that silently changes an image on
other pages; anything that changes how core's own Media section behaves.

## 3. Who sees it, and on what

Shown when all of these hold:

1. **On the desktop.** The desktop's window manager can be reached (§4.2). Answered without a
   request.
2. **Media section access.** `Umb.Condition.SectionUserPermission` matching `Umb.Section.Media`, the
   same gate the Image Editor app already has. Core has no media update permission on the client and
   its own media actions check nothing more. Start folders are enforced by the server, and a refused
   save already shows the server's message.
3. **Not trashed.** `Umb.Condition.EntityIsNotTrashed`, like core's own media actions.
4. **An image.** A new condition: the item's media type stores its file (`umbracoFile`) with the Image
   Cropper property editor. That is how Umbraco itself tells an image type from a file type: the
   built-in Image type uses the cropper, File and Vector Graphics (SVG) use the upload field, and a
   site's own image types copy the Image type. It costs one media type and one data type lookup per
   media type, which core caches, not a request per item. A format the editor cannot open (TIFF in an
   image type, say) is refused by the editor's existing `refusalFor` with its existing message.

The media type comes from `UMB_ENTITY_CONTENT_TYPE_ENTITY_CONTEXT`
(`content/content-type/entity-content-type/context/entity-content-type.context-token.js`), which core provides in the tree, the grid
card and the workspace. Core's **table** view does not provide it, so there the condition falls back
to the media item repository (`mediaType.unique`). Builder: measure that the fallback does not
fetch per row in a way anyone would notice; if it does, accepting "not in table view" is a
fallback to bring back to Luuk, not a decision to take alone.

Why not the file extension, as the issue suggested: core's only way to get it is a server request
per item (`UmbMediaUrlRepository`), and conditions are evaluated for every visible tree item and
card. The media type is cached and answers the same question.

## 4. Opening the editor

### 4.1 The editor opens at an image

The editor gains a location: the media item's key.

- Given `location`, it opens that item on connect through the service context's existing
  `open({ unique })`, then the same path as opening from the file menu (refusal check, decode,
  history).
- It reports its location with `umbradesktop-app-location` whenever what it shows changes: on open,
  and on Save as (it moves onto the copy). When an image fails to open it reports an empty location.
- **Core change, my call:** an empty location clears the window's location. Today core ignores an
  empty one (`window.element.ts`, `setLocation`, `isAppLocation` in `windows/layout.ts`), so an editor
  that failed to open its image would keep the key, `reuse` would bring that broken window forward,
  and every reload would fail again. desktop-apps.md §7.3 says an app may clear its location this way.
- **My call:** this means a reopened editor, after a browser reload, opens at the image it had,
  like every backoffice window reopens at its page. This replaces image-editor design §15.3's "reopens
  empty", which was only because the editor had no location. Unsaved edits are still lost on a reload,
  as they are today. The empty-title-on-start rule stays for an editor reopened with no location.
- An item that is gone or trashed when the editor opens it shows the open view with the existing
  failure message, and the location is cleared. Services.Media's open (`files/media-open.ts`) does
  not check `isTrashed` today, so a binned image would open normally; the editor checks it after the
  open answers, since the item is already fetched. (Whether Services.Media's open should refuse a
  binned item for every app is a separate question, not taken here.)

### 4.2 Reaching the desktop from the action

The action runs in two realms:

- **In a Media Manager window** the tree and collection are on the desktop page itself, so
  `consumeContext('UmbraDesktopWindowManagerContext')` finds the window manager.
- **In the Media section, and in the Manager's item pane**, the action runs inside an iframe window,
  where that context is not visible (desktop-contexts.md §4). The frame reaches it the way core's AI
  tools already do (`host-desktop.ts`, `findHostDesktopContext`): an `umb:context-request` for the
  alias, dispatched on `window.frameElement`, which bubbles to the desktop's provider and is answered
  synchronously.

**Core change, public API:** desktop-contexts.md §5 documents this second route ("From inside a
backoffice window"), with the twenty lines a package needs. The add-on keeps its own copy, since
nothing is imported between packages. The same lookup is what answers condition 1 in §3.

### 4.3 One window per image

**Core change, public API:** `openApp(alias, { location, reuse: true })` focuses a window of that app
already at that location, and only opens a new one when there is none. It is opt-in, because the Media
Manager's "Open in new window" means a new window. This is what Help does inline today
(`help.context.ts`); Help moves onto the option. An older desktop ignores the unknown option and opens
a second window, which is acceptable.

Because the editor reports its location (§4.1), an editor that moved onto another image or a copy is
no longer found for the original, which is correct.

## 5. Saving over an image used elsewhere

There are three ways to save over an image: the editor's Save button (and Ctrl+S), the file menu's
**Save**, and **Replace** in Save as. The last two run inside Services.Media's file menu without the
editor seeing them (`file-menu.element.ts`, `#saveFromMenu` and `#saveAndReport`). So the question
lives in **Services.Media's save flow** (`file-menu/save-flow.ts`, `runSave`, mode `replace`), the one
place all three pass through. Decided with Luuk: putting it in the editor would leave two of the three
unguarded. Every app that saves through the file menu gets it, which is right: saving over a shared
library file is the service's concern, as the overwrite check already is.

The first time an opened image is saved over, and it is referenced anywhere else, the save asks:

> This image is used in 4 places. Saving changes it everywhere. Use Save as to keep the original.
> **Save** / **Cancel**

- Two buttons, core's confirm modal (`UMB_CONFIRM_MODAL` takes a confirm and a cancel label only),
  like the existing overwrite question. No "Save as copy" button: it would need Save as to open in copy
  mode, which it cannot today, and the message names Save as instead.
- The count is `UmbMediaReferenceRepository.requestReferencedBy(unique, 0, 1)`'s `total`. It counts
  every kind of reference (pages, members, other media), so the wording is "places", not "pages".
- Asked once per opened image, not on every save: the answer is kept on the file menu's document and
  cleared when another image is opened. The count is fetched when the image opens, so the save does not
  wait on it; if the lookup fails, the save does not ask. Not used anywhere: no question.
- Cancel cancels the save, as the overwrite question's Cancel does (`{ status: 'cancelled' }`).
- Wording in Services.Media's `localization/en.ts` and `nl.ts`; a parity test holds them together.
- The file menu's Info panel (`file-menu/info-page.ts`) gains a "Used in" row with the count. Its own
  comment already names "where the image is used" as a later addition. Builder's call whether the row
  also lists the places or only counts them.
- Services.Media's developer page, `opening-and-saving-media.md`, says that saving over a used item
  asks first. This is new behaviour of a published package, released in lockstep with the rest.

## 6. After a save

A media window, or the Manager's item pane, showing the item already refreshes in place when it is
clean: the desktop's server-event router reloads a window's subject on `Umbraco:CMS:Media` `Updated`
(`conflict/server-event.router.ts`). A dirty one gets the existing "changed elsewhere" notice.

(Superseded by §11.4: a save over an item now writes a new file name, so this risk is gone.)

The risk is the browser's cache. A save over an item keeps the file's name, so Umbraco writes it to
the same address (the media path is derived from the item and property, not from the upload), and the
refreshed workspace can show the old file from the HTTP cache. The editor's own opener already needs
`cache: 'no-cache'` for this reason. **To measure in the build.** If it shows stale, the fix to try
first: after a successful save over, the editor fetches the file's address with `cache: 'reload'`,
which replaces the browser's cached copy for every window on the origin. Imaging URLs are cached
server-side against the source file and should follow; measure that too.

## 7. To confirm in the build

Each one is a measurement, not a decision:

1. A Media Picker card on a page opens its media item with the workspace's actions menu, and Edit
   image is in it. That is the page route in §1. If it is not, say so in the docs page and tell Luuk;
   it does not change this design.
2. The server event arrives for the saver's own save, so the router refreshes the item's window.
3. The stale-cache question in §6.
4. The table-view fallback in §3.
5. Edit image from the Manager's item pane, where the item is open in the pane beside the window that
   then gets a second, separate editor window.

## 8. What changes, by package

**Core (`src/Umbraco.Community.UmbraDesktop`)**

- `window-manager.context.ts`: `openApp`'s `reuse` option; Help switches to it.
- An empty `umbradesktop-app-location` clears the window's location (`window.element.ts`,
  `setLocation`, `windows/layout.ts`).
- `docs/developer/desktop-contexts.md` §5: `reuse`, and reaching the window manager from inside a
  backoffice window.
- `docs/developer/desktop-apps.md` §7.3: the Image Editor no longer the example of an app that
  reopens empty.

**Media add-on**

- `bundle.manifests.ts`: the entity action, the two conditions (on desktop, is image).
- `bundle.manifests.test.ts`: today it fails any entity action without the in-manager condition, and
  takes the first condition as that one. It becomes an explicit list of manager-only actions, with
  Edit image named as the one that shows everywhere, and finds conditions by alias.
- The image editor: `location`, reporting it, the trashed check.
- `docs/user/image-editor.md`: "Open an image from the media library" as a command with the goal first,
  including from a page through the picker if §7.1 holds.
- `localization/en.ts` and `nl.ts`: the action label.
- Image editor design §15.3: a line pointing here.

**Services.Media**

- `file-menu/save-flow.ts`: the used-elsewhere question before a replace (§5), with tests for each of
  the three save paths.
- `file-menu/info-page.ts`: the "Used in" row.
- `localization/en.ts`, `nl.ts` and `docs/developer/opening-and-saving-media.md`.

**Unchanged**: Entertainment, Accessories, the root README (no line: this does not
change what someone deciding to install would want to know), the Marketplace description. Media's
Marketplace `Tags` gets "edit image" if it is not there.

## 9. Split off: editing from a page

Issue #157, blocked by #137, keeps what was cut: the property action on Media Picker properties, the
editor as attached content of the document's window, Save as copy pointing the property at the copy,
and the Image Cropper case (which saves into the page, not the library). What it will need, so this
is not found twice:

- attaching an element app from inside an iframe window (no API today);
- unsaved-work handling for a docked element pane (`window-pane.element.ts` does not listen for the
  app's dirty, close or title events);
- the property context's `setValue` for repointing, and the temporary-file upload for the cropper;
- picker thumbnails in that document: `clearImagingCache(key)` then `UmbEntityUpdatedEvent` in that
  frame.

## 10. Build order

Test first throughout; `npm run build` and `npm test` in core and in the Media add-on after each step.

1. Core: `openApp` `reuse`, tests in the window manager's suite; Help onto it; docs §5.
2. Media: the two conditions, unit-tested with fake contexts (desktop page, frame, plain backoffice;
   image type, file type, folder, SVG type, own image type, no content-type context).
3. Media: the entity action, opening with `reuse`; the manifest test rewritten.
4. Media: the editor's location in and out; reopening at an image; gone-item handling.
5. Services.Media: the used-elsewhere question and Info's row.
6. Real backoffice run (the worktree instance recipe): the five measurements in §7, all five themes'
   actions menu looks right, a restricted user with a media start folder.
7. Docs, localization, tags; update #137's text to match §2.

## 11. As built

Built 2026-10-20 in the worktree `137-edit-image`, test first throughout. `npm run build` and `npm test`
pass in core, the Media add-on (64 test files) and Services.Media. The real-backoffice run used a copy
of the main checkout's database with its media, driven by headless Chrome.

### 11.1 The five measurements (§7)

1. **The page route is longer than §1 assumed.** Selecting a Media Picker card on a page opens core's
   crop editor for that page ("Select media"), not the media item, so there is no actions menu there.
   Its **Open in Media Library** opens the media item as a workspace over the page, and that
   workspace's actions menu has **Edit image** (checked on the Banjo product page). The user guide
   gives the three steps. Nothing in this design changes.
2. **The server event arrives for the saver's own save.** After a save from the editor, the Media
   window showing the item re-read it (`GET /media/{id}` from that frame) with nothing else done.
3. **The cache is stale, as feared, in two places.** After saving Banjo from 1024 to 512 wide, the
   refreshed workspace still showed 1024×683, and so did the workspace drawn again after routing away
   and back: the browser served the old file from its cache, since the address did not change. The
   fix §6 named works for everything drawn after it: Services.Media's save over now reads the file
   once more with `cache: 'reload'` (`files/media-save.ts`, `refreshCachedFile`), and the workspace
   drawn after that showed 512×342; so did a fresh document. (Built, then removed by §11.4, which makes it unnecessary.) It is in Services.Media rather than the
   editor because all three ways of saving over an item pass through it, and so does every other app.
   Two things it does not fix, both left for Luuk (§11.3):
   - **An image already on screen stays old.** The refreshed workspace keeps its `<img>`, whose
     address did not change, so nothing re-reads it: 512 wide on screen and 256 on the server after
     the second save. Setting that element's `src` to itself in the frame did show the new picture.
   - **Thumbnails stay old for up to a week.** Server-side imaging follows the new file (a new ETag
     for the 300×300 thumbnail), but the browser caches imaging URLs with `max-age=604800`, and the
     grid's thumbnail URL carries no version, so the grid kept the old picture. Re-reading that one URL
     with `cache: 'reload'` fixed it, but every surface asks for its own sizes.
4. **The table view keeps the action.** Core's table rows have no content-type context, so the
   condition asks for each row's item: on a cold load of an 8-image folder, 8 `/item/media` requests
   of 6 to 22 ms, all finished within about 70 ms of the list arriving, only for rows in view (core's
   bundles wait for the viewport), and cached by core afterwards. Not noticeable. The grid made none:
   its cards have the content-type context. "Not in table view" was not needed.
5. **From the Manager's item pane it works.** Edit image in the pane's workspace menu opened a
   separate editor window (not attached to the Manager), active, at that item's key.

Also checked in the same run:

- **Where it shows.** Image items in the Media section's tree, grid, table and workspace, inside a
  backoffice window, and in a Manager window's grid. Not on folders, a File item (`notes.txt`), an SVG
  (`logo.svg`), or an item in the bin (its workspace offers Delete, Restore, Export, Reload).
- **Reuse.** Edit image on Banjo while Banjo's editor was open focused that editor; still two windows.
- **Reload.** After a browser reload the editor reopened at Banjo, with the saved picture. After Banjo
  was binned and the page reloaded, the editor said "Banjo is in the recycle bin. Restore it to edit
  it.", and the window's location and title were cleared. Bowling Ball's editor reopened at its image.
- **The question.** "Save over Banjo? Banjo is used in 1 place. Saving changes it there too. Use Save
  as to keep the original." with Cancel and Save. Asked again after a reload (a new opening); saved
  on Save.
- **Five themes.** The card menu in a Manager window, opened under each theme: Edit image first, then
  Cut, Copy and core's actions, each drawn in the theme's idiom.
- **A restricted user**, in a group with the Media and desktop sections and People as media start
  folder. Edit image on their images; a save inside the start folder asked and saved. An editor sent
  by key to an image outside the start folder said "The image could not be opened." and cleared its
  location (the server answered 403).

### 11.2 Where the code differs from the plan

- **`reuse` lives in `open`, and `openApp` passes it on.** Help keeps its own app from the catalogue
  (it waits for it), so it calls `open(app, { location, reuse: true })`; its tests pass unchanged,
  which is the regression check for the move. Attached content is never the match, as Help had it.
- **The is-image condition asks for the content-type context past alias matches.** Core's context
  request stops at the first element providing anything under the same alias, and the content-type
  context shares `UmbEntityContext` with the actions bundle's own entity context, which sits inside a
  card. So a plain consume never reaches the card's media type. It asks past them and then checks the
  context it found is the item's: not when an entity context for another item is provided on the
  same element, which is how a folder's workspace wraps its table. Both contexts are asked
  synchronously (`edit-image/context-now.ts`), because the answer needed includes "none", which
  `consumeContext` never gives.
- **`OpenedMedia` gained `isTrashed`** in Services.Media, mapped from the detail it already reads, so
  the editor refuses a binned item without a second request. Not in §8's file list. The editor refuses
  a binned item from any open, not only by key, with its own message (`openTrashed`) rather than the
  generic failure, since "could not be opened" would be wrong about a file that opened fine.
- **The editor's open by key goes through its `MediaService` line** (`shared/media-service.ts`,
  `open(unique)`), then the same `#openFile` as the file menu's open. While that open is under way the
  editor reports no empty location, so a second Edit image during loading still finds its window.
- **Weight 1995 puts Edit image first** in an image's menu, so it is the action core shows as the
  card's and row's quick button, in the Media section as well as in Manager windows. That replaced
  core's own first action on image items in the Media section.
- **Info's Used in counts only** (Not used anywhere, 1 place, N places), and is left out while the
  count is unknown. The places are on the item's own Info tab.
- **The question's words name the item** ("Banjo is used in 4 places") rather than "This image",
  since the question is Services.Media's for every app, Notepad's text files included.

### 11.3 For Luuk

- **What core does instead** (checked 2026-10-20, the owner's question; settled in §11.4). Core keeps the folder fixed per item
  and property (`UniqueMediaPathScheme`: item key and property type key, combined) and names the file
  after the file that was uploaded (`ImageCropperPropertyValueEditor.ProcessFile`), deleting the old one.
  Its thumbnail URLs carry no version (`ReziseImageUrlFactory`). Measured through core's own upload and
  Save on Tattoo: a file with a new name went to `/media/obrklfts/tattoo-replaced.jpg`, a new address,
  and core's workspace showed it at once; a second upload with that same name kept the address, and
  core's own workspace went on showing the old 400×200 picture while the server had 200×400. So core
  has the same problem; it rarely shows because people upload a file with another name. The Image
  Editor keeps the name on purpose (#136), which is the one case that hits it.
- **Pictures already on screen and cached thumbnails** (§11.1, item 3). Settled in §11.4, option (c). Options, none built: (a) leave
  it as now, documented in the user guide; (b) after a save over, set `src` to itself on images of
  that address in the desktop's same-origin frames, which reaches into core's DOM; (c) save over under
  a new file name so every cache misses, at the cost of the stable address the Image Editor design
  chose on purpose; (d) also re-read the thumbnail sizes the backoffice is known to ask for.
- **Edit image as the quick button** (§11.2): kept first, owner's choice 2026-10-20.

### 11.4 A new file name on every save over (owner, 2026-10-20)

Core's answer, measured in §11.3, is that a replaced file takes the uploaded file's name, which nearly
always differs, so its address changes and no cache can show the old picture. The editor's save over
now does the same, through Services.Media's file menu, so all three ways of saving over an item get
it: the file is written under its own name with a short hash of the new contents,
`<base>-ud<8 hex>.<ext>` (the `ud` marker since §11.7), the hash an earlier save added replaced rather than stacked
(`file-menu/formats.ts`, `contentHash` and `versionedFileName`; used in `save-flow.ts`).

- **A hash, not a counter** (the owner's suggestion). The same bytes always get the same name, so a
  save that changes nothing (a rename, or the same result again) keeps the address and every cache stays
  right. Two editors saving the same image cannot write different pictures under one name, which a
  counter starting from the same `-v1` would.
- **FNV-1a, 32 bits**, not SHA-256: `crypto.subtle` exists only on https and localhost, and a backoffice
  on plain http must still save. It only has to differ between one image's successive versions.
- **Copies and first saves are not hashed**: they are new items at new addresses anyway.
- **Umbraco deletes the old file** when the address changes (`ImageCropperPropertyValueEditor`), so no
  versions pile up in the folder. Measured on Bowling Ball, three saves: the file of the first save was
  gone after the second. The original file was not, and core's own upload left Tattoo's original the
  same way, because the seed data stores `umbracoFile` as a plain path where core expects JSON: it
  cannot read the old path, so it deletes nothing. Once an item has been saved its value is JSON, so
  this leaves at most the one original behind per item, as a core upload does. Not ours to fix.
- **Measured** (2026-10-20, Bowling Ball, with a Media window open on it): each changed save got a new
  name (`…_b-6918aeff.jpg`, then `…_b-d37b9691.jpg`); the open workspace showed 342×512 and then
  171×256 at once, and the grid thumbnail drawn afterwards showed the new picture; the question was
  asked on the first save only; a rename-only save kept `…_b-d37b9691.jpg`, the same bytes.
- **Dropped**: the `cache: 'reload'` re-fetch after a save over (§11.1, item 3), and Save as's warning
  that another format changes the address, since nearly every save over now does. The user guide says
  once that a pasted link to the file breaks after a save, as it does after an upload.
- **Not changed**: Notepad and Paint (Accessories) save over through the context directly and name the
  file after the document, so a same-named save there still keeps the address. The developer page now
  tells an app saving directly to give new contents a new name.

### 11.5 After Luuk's first run (2026-10-20)

- **A Media Manager window kept the old preview** after the editor saved a rotation, until the folder
  was loaded again. Core clears its thumbnail cache when a media item saves, but a card only asks for a
  new thumbnail when it hears `UmbEntityUpdatedEvent` for its item, which core's media workspace
  dispatches after its save and a repository save does not. Services.Media's `save` now dispatches,
  on the desktop page's action event context: after a save over, `UmbEntityUpdatedEvent` and
  `UmbRequestReloadStructureForEntityEvent` for the item; after a new item,
  `UmbRequestReloadChildrenOfEntityEvent` for its folder. Measured: Rotate right and Save on Jumpsuit
  turned the Manager's card from 300×450 to 450×300, on the new file name, with no reload. Every app
  saving through the service gets it, Notepad and Paint included.
- **A Media section window's grid did not refresh either.** It is a backoffice page in a frame, with
  an action event context of its own, so it hears none of these events, and the desktop's server-event
  router refreshes only the workspace a window has open, not a folder's list. Measured: the same save
  left that window's card on the old file. Built at the owner's request: core's
  `live-media/media-change.controller.ts`, which listens to the page's own server events and, for a
  media item `Updated`, `Trashed` or `Deleted`, clears its thumbnail addresses (`clearImagingCache`)
  and dispatches `UmbEntityUpdatedEvent` (Updated only) and `UmbRequestReloadStructureForEntityEvent`
  on the page's action event context. It has to run in the page it serves, because core's thumbnail
  checks the event with `instanceof` against its own class and every frame has its own copy of core;
  an event built on the desktop page means nothing in a frame. So a `backofficeEntryPoint` starts one
  in every frame that is a window on a desktop (`findHostDesktopContext`), and the desktop element
  starts one on the desktop page. Never in the plain backoffice. This also keeps Manager windows up to
  date with changes made anywhere else (another window, another person, core's own media page).
  Services.Media's own announcement stays: it is immediate and needs no hub connection, at the cost of
  a Manager loading the item twice after a save made through the service. Measured: Rotate right and
  Save on Jumpsuit, with a Manager window and a Media section window both on Products, turned both
  cards from 450×300 to 300×450 on the new file, neither reloaded.
- **The Image Editor's icon** was `icon-picture`, the Media section's own. Now `icon-ruler-alt`
  (owner's choice from `icon-ruler-alt`, `icon-palette` and `icon-brush-alt`, 2026-10-20), on the app
  and on Edit image. Not `icon-palette`, which is Paint's; not a brush, which is the Markup pen's and
  the Appearance settings'; not `icon-crop`, the Crop mode's. Screenshots that show the editor's
  title bar or the launcher tile show the old icon until retaken.

### 11.6 Save a copy is a full copy (owner, 2026-10-20)

A save without `existing` created an item that held only the file, its media type picked from the
extension, so the editor's Save a copy lost the focal point and crops, the alt text and every other
property, and a custom image type became plain Image. The owner decided copies are full copies:
"there is no other realistic way". #139 (Optimize images, its design §7.2) relies on the same field,
so its name is fixed.

- **`copyOf` on Services.Media's save request.** Set without `existing`, the new item takes that
  item's media type and every property value, with the new file in `umbracoFile`, created in `folder`
  under `name`. One create request, no second save (`files/media-save.ts`, `copyItem`).
- **Built as the Media Manager copies**, since Umbraco has no copy for media: read the item's detail,
  leave out the derived labels (`Umbraco.Label`: width, height, size, extension, which the server
  works out from the new file), keep the rest (`files/copy-values.ts`, `copiedValues`). Services.Media
  cannot import the Media add-on, so it has its own copy of that logic. The file value loses its
  `src`, so the copy never points at the original's file. Any other file property is uploaded again,
  as the Manager does, because a shared file would go when the original is deleted.
- **`resetFocalPoint` holds for a copy too.** The focal point and crops it copies were set on the
  picture before a crop, rotate or flip, so a reframed copy gets them reset, as a reframed overwrite
  does. The file menu's copy now sends `copyOf` (the item the document came from) and the reset; a
  document never saved sends neither. The Image Editor clears its own focal point after a reframed
  save only, no longer after every copy.
- **Falls back to a plain new item** when the item is gone, in the recycle bin or holds no file, as
  an overwrite of a gone item does, and also (beyond the brief) when its media type does not accept
  the new file's extension or is not allowed in the chosen folder. Save as lets the person pick any
  folder, and a type that cannot go there would otherwise fail the save. The fallback saves the
  work and loses the properties; refusing with Umbraco's "not allowed here" message is the other
  choice, for Luuk.
- **Measured** (2026-10-20, a media type made for the run: Image plus two text properties, Alt text and
  Credit; one item of it from Banjo's file with the focal point at 0.2, 0.3):
  - Save a copy in WebP: the copy was of the run's type, not Image, with the alt text, the credit and
    the focal point (0.2, 0.3), and its labels were the new file's: `webp`, 10,292 bytes (the size the
    file menu reported), 171×256, the size the file decodes to. Its file has its own address
    (`/media/cvem2aw5/copyof-check-copy.webp`); the original kept its JPEG, its size and its focal point.
  - Rotate right, then Save a copy (a copy of that copy, since the editor moved onto it): the same
    type, alt text and credit, no focal point, and 256×171, the turned picture. The editor dropped its
    own focal point after this save and kept it after the first.
  - The run's items and type were deleted afterwards, and the uSync files and regenerated models the
    run wrote were removed. `npm run build` and `npm test` pass in Services.Media and the Media add-on;
    both suites are green at `--concurrency 1`, while at 2 a different handful of focus and clipboard
    tests timed out on each run, each passing alone (the background-tab stall of the test runner).

### 11.7 After the review (2026-10-20)

A reviewer with no part in the build read the whole diff, then the full-copy batch (§11.6). What it
found, and what was done:

- **The live refresh threw away unsaved edits (high).** For every media `Updated`, live-media
  dispatched `UmbEntityUpdatedEvent` in every frame, and core's media workspace reloads on it with
  `setPersisted` and `setCurrent`, replacing unsaved values and getting around the router's "changed
  elsewhere" banner. Now a frame whose address shows that item (in a section or a modal, as the
  Manager's item pane and Open in Media Library do) is not announced to; the router keeps owning that
  page. Thumbnail addresses are still cleared there.
- **Bursts of reloads.** Umbraco sends one event per item, so sorting fifty images sent fifty. The
  controller now gathers events for 150 ms and acts once per item; an `Updated` item no longer
  reloads lists at all (only its thumbnails and pickers, through `UmbEntityUpdatedEvent`), and a
  binned or deleted one reloads the lists showing it. It reads core's
  `byEventSourcesAndEventTypes` rather than filtering the stream itself.
- **The hash ate dates.** `-` and eight hex digits also ends `scan-20241020`. The marker is now `-ud`
  and eight hex digits (`beach-ud3f9a1c07.jpg`), and only that is replaced.
- **The editor forgot its image after a slow start.** A media library that did not answer in time
  cleared the window's location. Now only a definite answer clears it (gone, refused, binned, not an
  image the editor opens); an unreachable service, or an open that throws, keeps it.
- **Conditions decided once**, in their constructor. Both now decide again when their host connects;
  the is-image condition does nothing when it finds the same contexts again.
- **One media type lookup per card** without the server-event connection: now one per media type per
  page (`isImageMediaTypeCached`); an answer that could not be read is not kept.
- **Tests that could pass without deciding** now assert the decision was read; a test that only
  checked removed code was deleted.
- **Copying, untested and silent.** The copy's decisions moved behind injectable operations
  (`Services.Media/files/copy-media.ts`, `CopyDeps`) and the save's routing likewise (`routeSave`,
  `SaveSteps`), each branch table-tested. Owner's choices, 2026-10-20: a copy that cannot be full
  (format not taken by the original's type, folder not allowing it) is **refused with the reason**,
  checked before anything is uploaded; another file that cannot be copied is **left out and named**.
  A copy of an item gone by then is still a plain new item, now flagged (`copied: 'plain'`) with a
  notice, and the editor drops its focal point for it. `MediaSaveResult` gained `copied` and `notice`,
  `FileSavedDetail` `fullCopy` and `notice`; the editor shows the notice instead of "Saved".
- **Secondary files were read through the cache**: `reupload` now asks with `no-cache`, as an open does.
- **The used-elsewhere question lists the places**, with core's own
  `umb-confirm-action-modal-entity-references`, the list core's trash and delete questions show.
- **Reinvented, now core's**: `contextNow` uses `UmbContextConsumer` (`passContextAliasMatches`,
  `request`, `instance`, `destroy`) instead of a hand-built event; the conditions' aliases moved to
  `edit-image/constants.ts`, so the bundle no longer pulls the conditions into its main chunk.
- **Tidying**: the reformatted return in `replaceFile` restored, `FILE_PROPERTY` used throughout,
  the package's own `extensionOf` reused, a double blank line, stale comments (including "not exported
  by the package", which core does export as `UMB_CONTEXT_REQUEST_EVENT_TYPE`), and
  `desktop-contexts.md` §5, which told readers to wait with `consumeContext`.

Measured after the fixes, in a real backoffice: a Manager window and a Media section window on
Products, and a second Media section window on Jumpsuit with its name typed over (unsaved). Rotate
right and Save in the editor asked the used-elsewhere question with core's references list under it,
saved as `…-ud5f4475f1.jpg`, and turned the Manager's and the first Media window's cards to the new
file. The Jumpsuit window kept its typed name, stayed dirty, and got the "changed elsewhere" banner.
(A file saved before the marker existed, `…_b-c9b59542.jpg`, keeps its old hash in front of the new
one; only test data has such names.)

Left as they are, with the reason:

- **All label properties are left out of a copy**, as the Media Manager's copy does. Umbraco fills its
  own image labels from the new file, so keeping labels would be safe for those; a site's own label
  holding other data is lost in a copy. Both copies should change together if that matters.
- **Files nested inside a property** (an upload inside a block list on a media item) are shared by a
  copy, not copied, in both copies. Rare on media; the server copies them for documents only.
- **A copy is still made in the browser**, by downloading and uploading files again. A server endpoint
  using Umbraco's `MediaFileManager.CopyFile` would avoid the size limit and cover nested files, at the
  cost of new server code.
- **The used-elsewhere question can describe a save that will not happen**, when the item was binned
  after it opened (the save then makes a new item). Rare and harmless.
- **An image type that stores its file with the Upload field** (common after old migrations) gets no
  Edit image.
- **Screenshots** showing the old Image Editor icon are not retaken.
