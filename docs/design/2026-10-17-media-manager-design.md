# Media Manager: design

> The Media Manager hosts Umbraco's own media collection, tree and workspace in desktop windows, and
> adds what only a desktop can do around them: many folder windows, dragging between them, the
> clipboard, files from the OS, background transfers and undo. This doc records every UI decision
> agreed on the mocks, with the reason, so #144 can be planned and built from it.

- **Status:** Designed, mocks agreed, planned
- **Plan:** [`../plans/2026-10-17-media-manager-plan.md`](../plans/2026-10-17-media-manager-plan.md), which also answers §14's first question
- **Date:** 2026-10-17
- **Issue:** [#144](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/144)
- **Mocks:** [`mockups/media-manager/`](mockups/media-manager/), four batches plus one page of
  examples, Umbraco theme
- **What core gives and what needs a workaround:** the hosting spike,
  [`2026-10-17-media-manager-hosting-spike.md`](2026-10-17-media-manager-hosting-spike.md)

---

## 1. The rule behind every decision

Inside a manager window, everything core draws stays core's: the collection's toolbar, filter,
views, cards, item menus and selection bar, the tree, and the media workspace. We do not restyle
any of it, so core's features, custom media types and other packages' extensions keep working and
keep up with Umbraco releases. What we design is around it: the windows, the drag feedback, a few
entity and bulk actions of our own, and the Transfers window.

Where a choice came up, the answer was what the OS file managers do (Explorer, the Finder, GNOME
Files), unless Umbraco already had an answer, in which case Umbraco's won. Twice that ruled out an
idea of ours that no OS has: a clipboard strip and a double-click to open.

Our own entity and bulk actions are registered with a condition that shows them only inside the
manager, so the Media section's menus stay exactly as Umbraco ships them.

## 2. Windows and the tree

- One window per folder. The title and the taskbar button are the folder's name, with no "Media
  Manager" prefix: with four windows open, the folder name is what tells them apart.
- The tree is core's media tree, hosted, with its clicks taken over so a folder opens in the
  window. Folders get core's menu and other packages' tree actions for free. The recycle bin sits at
  its foot.
- A folder opens in a new window from "Open in new window" in its menu (ours, on cards and in the
  tree), by middle-click, or by opening Media Manager from the launcher again, which starts at
  Media.
- Each window has its own view. The view picker is core's, but core switches views through the
  backoffice address, which would switch every window, so the manager sets each window's view
  itself.
- Windows come back on the next visit at their folder and view, following the reopen-windows
  setting. The first open starts at Media.

## 3. Clicking and selecting

- A click opens, as everywhere in Umbraco: an item opens beside the cards (§8), a folder opens in the
  window. There is no double-click anywhere. It would be the only place in Umbraco that needs one.
- The checkbox selects. Once anything is selected, core turns the cards select-only, so further
  clicks select. That is core's default (`collection-default.context.js` sets `selectOnly` while the
  selection is not empty), read in code, not yet seen in a hosted window.
- On top of core: Ctrl+click (Cmd on a Mac) adds or removes without opening, Shift+click selects a
  range, arrow keys move, Space selects, Enter opens, F2 renames, Delete trashes.
- Dragging from empty space (padding, gaps, below the last row) draws a selection box. Core has
  none, so this is ours, drawn over core's grid.
- Modifier keys follow the platform: Ctrl on Windows and Linux, Cmd and Option on a Mac.

## 4. Dragging

- The drag image is ours: a thumbnail, or a small stack with a count for a selection, the item you
  grabbed on top. The browser shows it slightly see-through.
- A label under the pointer says what letting go will do and how to change it: "Move to People,
  Hold Ctrl to copy". It switches live with the copy key (Ctrl, or Option on a Mac, where it says
  so). Copy also gives the pointer the OS's copy badge, and the originals do not fade.
- Targets: another window's folder area (outlined), a folder card (lit, icon opens, the window is
  then not outlined, so there is only ever one target), a tree folder, and the recycle bin, which
  trashes through core's action. A target that refuses turns red, the label says why, and the
  pointer gets the not-allowed badge.
- While dragging, only closed tree folders expand on hover. Folder cards never open by themselves:
  a window that changes folder under the pointer surprises people.
- Pressing on a selected card drags the whole selection; pressing on an unselected one drags just
  that card. Esc cancels.
- After a drop, the target window comes to the front with the dropped items selected and scrolled
  into view, so the next Ctrl+Z, Delete or drag acts on them.
- A drag where some items are not allowed moves the ones that fit and leaves the rest selected where
  they were. The label says so before you let go ("Move 2 of 3 to Design", and which one cannot
  go). Same rule as the Transfers window: one item that cannot go does not stop the rest.

## 5. The clipboard

- Cut and Copy are ours, at the top of an item's menu and in the selection bar. Paste is ours on a
  folder's menu, cards and tree, while something is cut or copied. Keys: Ctrl+X, Ctrl+C, Ctrl+V.
- "Copy to" is ours in the selection bar, next to core's Move to, so copying never needs a
  modifier key.
- Cut items stay where they are, faded, until pasted, as Explorer does. Esc empties a cut. There is
  no strip or banner showing the clipboard: no OS shows it. The shelf (#26) is where held items
  could show one day (§12).
- Copying a single image also puts the picture on the OS clipboard, so it pastes into an email or a
  chat. The browser only accepts PNG, so JPEG and WebP are converted on the way. When that same
  picture comes back in a paste, the manager pastes a copy of the media item rather than uploading
  a new one.
- Pasting an image from the OS clipboard (a screenshot) uploads it into the open folder through
  core's upload, so core picks the media type. It is named "Pasted image" with the date and time,
  because the clipboard has no file name.
- A copy is a new item created from the original's file with its properties copied over, since
  Umbraco has no copy for media. Ctrl+drag within one folder makes duplicates next to the originals.

## 6. Files from the OS

- Core's dropzone takes the drop, so the type comes from the extension and core asks when it is
  ambiguous. Dropped folders keep their structure: core creates the folders first.
- Ours: a label in the target window naming the folder the files will land in, because the OS's own
  drag label cannot.
- Dropping onto a folder card uploads into that folder, the same as dragging items onto it.
- The OS draws its own drag image and "+ Copy" label; a page cannot change them.

## 7. The Transfers window

- One Transfers window for the whole desktop, with a section per operation, as Windows, the Finder
  and GNOME have.
- It opens when an operation is still running after 2 seconds, as the OS copy windows do. That is
  time, not a count, because 50 small icons are quick and one big video is not. Quicker operations
  only show core's placeholder cards and loader bar.
- Operations run side by side, each with an overall bar, counts, size and time left, and its own
  Pause and Cancel. Pause finishes what is in flight and waits. Cancel asks first and rolls nothing
  back.
- A row per item with where it is going. A failed item shows Umbraco's reason as Umbraco returns it,
  with Retry, and the rest carries on.
- Minimised, its taskbar button shows the overall progress as the ring busy windows already have.
- When everything worked, the window closes itself and a desktop notification says so. When
  something failed, it stays until you close it, folded to the failures, with Retry failed and
  Open folder.
- Transfers keep going when the manager window they started from closes. Closing the Transfers
  window while it runs asks first; leaving the desktop warns that unfinished transfers stop.

## 8. Opening an item

- An item opens as the desktop's attached content of its manager window, the same as Preview and
  the workspace views beside a document: docked in a pane when the window can make room, floating
  and grouped with it when not, Shift-click for floating, Pop out and Dock to move it. The pane
  header and the floating strip are the attached ones. Inside is Umbraco's own media workspace,
  never a copy.
- One item per manager window, docked or floating, which is the attached rule of one of each kind
  per owner. Clicking another item replaces it. Two items side by side means two manager windows.
- The workspace can hold unsaved changes, which no attached content did before, and moving attached
  content rebuilds it. So while it is dirty, Pop out and Dock are greyed ("Save or discard your
  changes first"), and closing the pane or the window, or opening another item, asks core's own
  unsaved-changes dialog first. The manager asks the workspace whether it has changes before
  swapping. This extends the attached-windows contract, so `docs/developer/attached-windows.md`
  gets it in the build: §2's "Editing" and the checklist.
- The open item's card gets a pink border, Umbraco's current-item colour, the same as the open folder
  in the tree. It is needed because selecting never changes the pane: with several items selected
  the pane keeps the one you opened, and the border says which card that is.
- Create lists the open folder's allowed types (core's list) and opens the new item's workspace in
  the pane, in the open folder.
- Opening, creating and any link never navigate the backoffice or change its address.

## 9. The recycle bin

- A place at the foot of the tree. It opens in the window like a folder, showing core's recycle bin
  with core's Restore, Delete and Empty recycle bin.
- Ours: dragging an item out of the bin onto a folder restores it there, through core's restore.
- Restore opens core's dialog. The mock draws it from memory, so its wording is whatever core's is.

## 10. Undo

- Ctrl+Z (Cmd+Z) undoes a move (moved back), a copy (the copies go to the recycle bin), a rename
  (renamed back) and a trash (restored). Not an upload.
- One undo history for the whole manager, across all its windows, as in Explorer and the Finder.
  That also settles which window a drag between two windows belongs to: Ctrl+Z in either undoes it.
  This changes the issue's "in that window".
- It says nothing when it works: the items reappear where they were, selected, and that window
  comes to the front. An undo that cannot be done (someone moved the item since) gets a desktop
  notification saying why, and that step leaves the history.

## 11. Refusals

- No permission: the target refuses during the drag, and the check is core's, the one that leaves a
  folder out of core's Move to dialog. Folders outside the start nodes are not in the tree at all.
- A type the folder does not allow: partial moves as in §4; when nothing fits, the target refuses.
- Pasting an image into a folder that does not allow images: nothing uploads, and a notification
  says why. Files dropped from the OS are core's to refuse, and a refused one shows in Transfers.

## 12. Later

- **The shelf, #26.** Designing this found the shelf's missing job: parking items while you browse to
  where they go. It was discussed here and parked, because a shelf that only works for media is a
  half feature and #144 does not depend on it. The concept and a drop-target contract are in #26's
  "Findings from the Media Manager design" section, with this manager as its first implementation.
- The other candidates stay as #144 lists them: editable property columns, a "Used on" column,
  replacing a file by dropping on it, name-clash choices, PDF and video thumbnails, an address bar,
  dropping on a taskbar button, copy public link, a status bar, live updates, smart folders, batch
  rename, folder sizes.

## 13. Changes to #144 this implies

- "Ctrl+Z undoes the last move, copy, rename or trash in that window" becomes one history for the
  whole manager (§10).
- "Uploads, moves and copies of more than a handful of items run in a transfer window" becomes
  "operations still running after 2 seconds" (§7).
- Opening an item: the attached rule for unsaved changes (§8).

## 14. Open for the build

- How the workspace gets into the attached pane: an element hosted on the desktop page, as the spike
  hosted the collection, or an iframe on the media edit route, which is what launcher search opens
  and which the desktop already tracks for unsaved changes. Untested either way.
- Pause and Cancel on uploads: core's dropzone may not expose them, in which case the manager drives
  core's `UmbDropzoneManager` itself, which keeps core's type rules.
- Core's dropzone frame and its restore dialog were drawn from code and memory; check both in a real
  browser.
- From the spike, still to build: dragging from table cells other than the name, dropping on a folder
  card, dragging a selection, and a real-browser check of the native drag from core's links.

### Answered in the build (2026-10-18)

- **The workspace in the attached pane** is an iframe on core's media edit route, the same page launcher
  search opens. The host learned to draw a backoffice page as attached content and to guard it with
  unsaved changes (plan phase 2, `attached-windows.md` §9). Core's `umb-app` asks for 920 px, which an
  attached frame lifts.
- **Pause and Cancel on uploads.** Core's upload manager has no pause, so Pause is greyed for an upload
  in Transfers, not hidden. Cancel removes what has not gone up through core's own manager. Uploads are
  followed through the dropzone's `progressItems()`, found by its context request, as the host's
  upload watcher finds one in a frame (plan phase 7).
- **Core's dropzone frame** was measured in a real backoffice: during an OS file drag its overlay
  covers the whole manager window, tree included, at z-index 100, and shows in every manager window
  at once, since each dropzone listens at the document. The manager finds folder cards and tree
  folders beneath it by hit-testing (plan phase 6). **Core's restore dialog** opens from an item's
  own menu in a recycle bin window, as core's side panel ("Restore ... to Root"), and Cancel closes it
  with nothing restored and the desktop's address unchanged (measured 2026-10-18). Restoring by
  dragging out of the recycle bin is the manager's own operation beside it.
- **From the spike:** a drag from any table cell, a drop on a folder card, and dragging a selection are
  built and checked with drag events in the page. The native drag from core's links could not be
  checked: headless Chrome starts no native drag from mouse input, and puppeteer's drag interception no
  longer works with current Chrome. The spike's measurement stands for it.

## 15. Upstream: the collection's folder, and why it was not filed

Decided 2026-10-18 not to file this on Umbraco-CMS. It is not a bug: core's media collection is built
to live inside a folder's workspace, and there it is right. Hosting it elsewhere is this package's
idea, and very few packages would gain from a change, so it would not be a priority for Umbraco.
The protection is ours instead: if a release changes this, Create and uploads in a manager window land
in the media root, and the real-backoffice check catches it. If more packages come to need the same
thing, a discussion on Umbraco-CMS is the place, not an issue. The draft is kept for that:

> **Media collection reads its folder from the media workspace context, not from its configuration**
>
> `umb-media-collection` takes the folder its dropzone uploads into from
> `UMB_MEDIA_WORKSPACE_CONTEXT.unique`, and the Create action builds its links and lists the allowed
> types from the same context's `unique` and `contentTypeUnique`. So a media collection rendered outside
> a media workspace (a package hosting it in a dialog or its own view) uploads and creates in the root,
> whatever folder its collection configuration names.
>
> To host it for a folder today, a package has to provide a stand-in under the
> `UmbWorkspaceContext` alias with `getEntityType()` returning `media`, `unique` and
> `contentTypeUnique`, which is an internal contract that any release can change.
>
> Suggested fix: let the collection read its parent from its own configuration
> (`UmbCollectionConfiguration.unique`) or from `UMB_ENTITY_CONTEXT`, falling back to the workspace
> context as now. Measured on 17.7.

The stand-in is `manager/folder-context.ts` in the Media add-on; its JSDoc says the same.


## 16. After the first hands-on test (2026-10-18)

The owner's first session with the built manager. What changed, and why:

- **A Media group in the launcher.** The add-on defines it, with the alias, label and weight (52) the
  Image Editor's branch gives it, so the two land as one group and the media tools to come join it.
  Entertainment's own `media` group (65, umbraCoffee design D13) became `entertainment`, same place,
  for umbraCoffee and a web radio player later: watching a show is not managing media, and two
  packages defining one group at two weights is a clash the desktop reports.
- **No split view from a drag.** Core's cards are links, so the browser put the item's address on every
  drag, and Chrome offers a link dragged to the edge of its window as a split view. A drag now carries
  the manager's own type and nothing else.
- **The selection box starts anywhere in the view's area**, not only on core's grid, which is no taller
  than its cards: a folder with a few items left almost nothing to start one from.
- **Ctrl+click in the tree opens the folder in a new window**, as a middle-click does, and as Explorer
  and a browser do with that click. It used to select the folder in the collection, where it is not
  shown, so the selection bar counted something nobody could see.
- **The recycle bin stays at the foot of the tree.** The media tree scrolls on its own. (An opened bin
  was first capped at a third of the tree; §17 made it one row that never opens.)

## 17. A folders-only tree (2026-10-18)

The tree beside a window shows folders only, as Explorer's and the Finder's do: the files are in the
window. Images in the tree could be opened but not copied, made the drop targets unclear, and made a
drag rest open a folder that had only images in it. Owner's call, on this advice.

Core's tree cannot do it on its own. Its `filter` setting is stored and never read (17.5.3 and 17.7.1),
and the media tree's API has no folders-only option, since a media folder is just a media type with a
collection. So the manager registers a tree of its own, but only its data: a tree of core's default
kind whose repository asks core's media tree repository and passes on folders only. Core still draws
it, so its look, its item menus, start nodes, reloads after core's actions and everything the drag
code reads stay as they were.

- **A folder is an item whose media type has a collection**, the rule the manager already uses for
  cards.
- **Its arrow shows only when it has a folder inside.** The server's `hasChildren` counts images too,
  and the tree's API lists children of every type. So each question (which folders are in this one,
  and has it any) starts with one page of 200 children read directly, which answers it exactly for
  nearly every folder. For a bigger folder the rest comes from Umbraco's media search, which can be
  limited to a parent and to the media types core calls folders: one request, whatever the folder
  holds (owner's call). Measured 2026-10-18: the search needs some text, and `*` matches everything;
  it reads the Examine index, about a second behind the database, so only a folder bigger than a page
  can briefly show a stale arrow or miss a brand-new subfolder; it cannot be limited to the top level,
  so the top is read directly to the end, as any folder is when the search does not answer. Checked
  on a folder of 205 images with a subfolder last: one direct page and one search, never a second page.
- **The tree never pages.** Every folder of a parent comes back in one answer: paging is for long
  lists of items, and a parent's folders are a short one.
- **Resting a drag on a folder opens it only when it has subfolders**, which follows from the arrow.
- **The recycle bin is one row**, which never expands: what is in it is in the window that shows it.
  Its menu keeps core's Empty recycle bin, and its name says how many items are at its top
  ("Recycle Bin (4)"): core labels a root by translating each `#key` in its name, so the count rides
  in the name. Core reloads a root only on a structure reload, which nothing asks after a trash,
  restore or empty, so the desktop context watches core's reload events for media and asks every bin
  row to reload once they settle.
- **The window's folder is highlighted in the tree** with uui's own `active` attribute. Core sets it
  from the browser's address, which in a desktop window never matches, and Lit leaves an attribute
  alone while its bound value does not change, so the window's mark stays; it is put back as core
  draws new items.
- **Keys in the tree are about the folder they are pressed on**, as in a file manager's folder pane:
  Ctrl+C and Ctrl+X hold it, Ctrl+V pastes into it, Ctrl+Z undoes. No other key there touches the
  view's selection, so Delete in the tree no longer trashes what the view has selected.

## 18. Copy and paste, after the second hands-on test (2026-10-18)

Copy and paste felt unpredictable. Three causes, all measured:

- **A ticked checkbox swallowed every key.** Core's card checkbox is a native `<input>`, and the keys
  were ignored in any `<input>`. Now only inputs people type into count as fields.
- **The picture never reached the OS clipboard.** The browser only accepts a clipboard write that
  starts in the key's own moment, while the page has the keyboard. The copy first read the item from
  the server, and opening an item moves the keyboard into its editor beside the window, so the write
  started late and was refused. The key now starts the write at once, handing the browser the picture
  as a promise (measured: the write starts 0.4 ms after the key).
- **An old screenshot won over the newer copy.** With the write refused, the OS clipboard still held
  the screenshot, and Ctrl+V uploaded it. Now what the manager holds pastes whenever it was copied or
  cut after the page was last left, since another program can only write the clipboard while the
  person is in it. Moving the keyboard into the editor beside the window is not leaving.

After the third test:

- **A copied folder pasted onto itself lands beside it**, in its parent, as "Products (1)" (Umbraco
  names the duplicate), as a file manager copies a folder pasted where it is. A cut onto itself stays
  refused: moving a folder into itself means nothing. One rule (`pasteInto`) for the paste and for the
  feedback below, so both name the same folder.
- **Feedback in the tree for a paste or drop into a folder.** The folder shows uui's loading bar from
  the moment the work starts (measured: 55 ms after Ctrl+V); when it is done the folder opens and the
  folders that arrived are lit in the selection colour for 1.6 s (measured: open at 0.36 s, lit at
  0.45 s for a small folder). A ghost row for what is coming was considered and not built: core draws
  the tree's rows, and a row of ours among them would fight its redraws. Long work also has the
  Transfers window after two seconds.

After the fourth test:

- **Dragging into an inactive window works.** The host covers an inactive window with a focus
  catcher that takes the first click, and a drag over it hit the catcher, not the window, so the drag
  found no target there (the earlier checks fired drag events at elements, which skipped the
  browser's hit-testing). The host now lets drags through its catchers while anything is dragged over
  the page, and clicks are caught as before. Checked with drag events sent to what the browser finds
  at a point: before the drag entered, the catcher; after, the window. Chrome's own drag
  (DevTools drag interception) starts and hovers but never sends a drop back to the page, so it
  cannot check a drop.
- **Drop targets are drawn heavier**: a window's folder area gets a cover, bordered at 3 px and tinted
  (the label above it); a card an outline with a tinted glow outside it; a tree row an outline inside
  and a tinted background, since the tree's scroll area clips anything outside a row. Two pixels read
  as a hint and went unnoticed.
- **Delete on a tree folder** moves it to the recycle bin after core's own question; a window showing
  it goes to its parent.
- **The tree opens down to the window's folder**, when the window opens and whenever it moves, as the
  Media section's tree follows the folder on screen. It never closes anything.

After the fifth test:

- **A selection can be dragged.** Once anything is selected, core draws its cards without their link,
  for select-only clicks, and only a link drags by itself, so no drag started (measured with Chrome's
  own drag). A press on such a card makes the card draggable for that press, as a table row already
  was.
- **A tree folder as a drop target colours its own row only**, as uui draws a selected row, in the drop
  colour through uui's own variables. The outline round the menu item took in the folders open inside
  it, which read as dropping into all of them.
- **A click on empty space clears the selection**, as in every file manager; with Ctrl, Cmd or Shift
  held it keeps it. A press that becomes a box does not clear first unless no key is held, as before.
- **A tree folder can be dragged by its name or icon.** Core slots both into uui's link, and Chrome
  starts no drag from slotted content in a menu item (`user-select: none`), so a press on them stayed
  a click; only the row's empty part dragged. Every check had pressed the link's middle, beside the
  text. Found from the owner's own drag logged in the browser pane, then reproduced headless by
  pressing on the text. Making the pressed span draggable fixed the name but not the icon's SVG, so
  the tree's walk adds `pointer-events: none` to core's `#label` and `#icon-container` in each item,
  and the press reaches the link, which Chrome drags; clicks still open the folder.
