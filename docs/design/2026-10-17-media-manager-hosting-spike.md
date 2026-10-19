# Media Manager: hosting Umbraco's media collection in a window (spike)

Date: 2026-10-17. Issue: #144. Status: spike done, throwaway code not kept.

## Question

The Media Manager has to do at least what the Media section does, and other packages' media
extensions have to keep working in it. Rebuilding that would go stale with every Umbraco release.
So the question was whether a desktop window can host Umbraco's own media collection, and what
breaks when it does.

## What was built

A throwaway accessory window (`umbradesktop-media-spike`) that creates `UmbCollectionElement` with
alias `Umb.Collection.Media` and `config.unique` set to a folder, and provides an `UmbEntityContext`
(`media` or `media-root`, the folder's key). This is what core's own media dashboard does
(`media/media/dashboard/media-dashboard.element.ts`). A stand-in third-party entity action and bulk
action were registered the way another package would register them.

Run against Umbraco 17.7 on the TestInstance database, driven headless with puppeteer-core from the
host's `node_modules`. Worktree: `D:/github/UmbraDesktop-media-spike` (detached, not under
`.claude/worktrees`, because a worktree cleanup removed the first one mid-spike).

## What works with no workarounds

- **The folder's contents.** `config.unique` alone is enough for the listing: Products showed its 8
  items, People its 11. The backoffice URL does not change.
- **Two windows on two folders** side by side, each with its own contents.
- **Views.** Grid and table both render, and any registered collection view would appear, since the
  view manager reads the `collectionView` extensions.
- **Selection and the bulk bar.** Selecting a card shows core's bar with Move to, Trash and the
  stand-in third-party bulk action. The third-party action ran with the right item.
- **The item actions menu.** Each card's "View actions" lists Create, Trash, Move to, Sort children,
  Export, Reload children and the stand-in third-party action, which ran with the right item.
- **Filter** and **Create** render. Create lists every media type, including custom ones (Article).

## What needs a workaround

1. **Create and upload go to the root.** Core's media collection and its Create action read the
   parent folder from `UMB_MEDIA_WORKSPACE_CONTEXT`, not from the collection's config. Without a
   workspace, Create links say `parent/media-root/null` and the dropzone's `parentUnique` is null.
   Providing a stand-in on the context alias `UmbWorkspaceContext` (entity type `media`,
   `getHostElement`, `unique` and `contentTypeUnique` observables) fixed both: Create links pointed
   at the folder and the dropzone's parent was the folder. It is an internal contract, so it can
   break on any release. Worth raising upstream: the collection should take its parent from its
   config or the entity context.
2. **Views switch through the backoffice address.** The view links are
   `/umbraco/section/umbradesktop/table`. Clicking one changes the address, and every hosted
   collection follows it: switching one window to table switched both. The desktop survives it, also
   on reload. Fix in the manager: intercept the view links and set the view per window
   (`UmbCollectionViewManager.setCurrentView`, or the interaction memory 17.7 added). Not verified.
3. **Opening an item does nothing visible.** Clicking a card pushes
   `/section/media/workspace/media/edit/{key}` and the desktop stays as it is, so the address bar
   is wrong and nothing opens. Choosing a type under Create does the same with a create path. The
   manager has to intercept these and open the workspace in a desktop window, as launcher search
   already does for its results (#6).

## Dragging between windows (second round, same day)

The manager's drag has to know which item is under the pointer in views it did not write. It can,
by reading the composed event path from a capture listener at the document, with this rule, first
match wins:

1. an element with `.item.unique`: core's `UmbEntityCollectionItemElement` contract
   (`core/collection/item/entity-collection-item-element.interface.ts`), which grid cards and refs
   implement, with `entityType` alongside;
2. an element with `data-sortable-id`: every `umb-table` row (`core/components/table/table.element.ts`);
3. a link whose `href` matches `/edit/{key}`.

Measured on real presses:

- **Grid.** The press lands on the card's `a#open-part`. The browser starts a native drag from that
  link by itself, and the rule finds the key.
- **Table, name cell.** Same: the name is a link, a native drag starts, the key is found.
- **Table, any other cell.** The rule finds the key on the row's `data-sortable-id`, but no native
  drag starts, because nothing there is draggable. The manager has to start the drag itself from a
  pointer press there (or make the row draggable).

The drop half, tested with in-page `DragEvent`s because puppeteer's own drag-and-drop hangs in
headless Chrome: `dragstart` on core's card link in the Products window, then `dragover` and `drop`
on whatever was at the drop point in the People window (a card's link). Capture listeners at the
document put the key on the `DataTransfer` under a private type, accepted the drop by finding the
target window on the path, and called `MediaService.putMediaByIdMove`. The item moved (200), and
both hosted collections showed it in its new folder after a rebuild. It was moved back afterwards.

The earlier "a `DIV` was on top" result came from the probe dragging a window by its title bar
first, not from core. Worth checking separately whether a title-bar drag can leave something over
window content.

Still to do in the real build: a drop on a folder card moves into that folder rather than into the
window's folder; dragging a selection of several items; Ctrl for copy; a native drag also carries
`text/uri-list`, so dropping it on the OS desktop makes a link, which is harmless. A manual check
in a real browser should confirm the native drag from core's links, since headless only proved the
events.

## Not answered

- Uploading a real file into a folder through the hosted dropzone, with the stand-in context.
- Whether the stand-in workspace context confuses anything else inside the collection.

## Conclusion

Hosting works. Core gives the listing, views, selection, bulk actions, item actions and Create,
including other packages' extensions. The manager then owns three things core cannot do in a
window: the folder context, per-window view switching, and opening items in desktop windows. The
desktop-only layer (drag between windows, clipboard, transfers, undo) sits on top. Drag works on
core's own views: the item comes from core's item contract, the table row's sort id or the item
link, and the move is core's own endpoint.
