# Media Health: design

Issue #141, renamed from "Media Cleanup on top of MediaAudit". Decided 2026-10-26 over the mocks in
[`mockups/media-health/health.html`](mockups/media-health/health.html). Part of the Media add-on
(`Umbraco.Community.UmbraDesktop.Media`), which already has the Media Manager (#144, #158), Edit image
(#137), Optimize images (#139) and the item's file tools (#176). This is the third leg: finding,
editing, and now tidying.

## 1. Intent

Every media library collects what nobody uses, files on disk no item owns, and originals far bigger
than anything that shows them. Umbraco tells you none of this: references one item at a time, no
sizes, no idea what is unused. An add-on that calls itself media management and stops at editing
leaves out the job editors complain about most.

Media Health answers four questions about the whole library, where the space goes, what is unused,
what is orphaned on disk, and what is oversized, and gives each a verb: view, review, delete,
optimize. It does this inside the desktop, with the tools the add-on already has, which is what makes
it worth shipping over "install a cleanup package": the unused list is not a report you read, it is
a place you work in with Edit image, Optimize and the Manager's own selection and Trash.

## 2. The rule behind every decision: nothing until asked

Media work must never slow the backoffice or the site for someone who did not ask for it.

- Nothing is measured until someone presses **Check**. No scan at startup, nothing scheduled, no
  lookups while browsing the Manager, no polling except while a check the person started is running.
- Everything the Manager shows about health is the last check's result. Folder sizes and unused counts
  are sums over that result, computed in the browser. No check, no numbers, and the places that
  would show them show nothing.
- The two per-item facts are one request each, at the moment asked: opening the Info tab fetches
  that item's references; pressing **Save over** in Edit image fetches them once more before the
  dialog. Neither touches the grid.

## 3. Shape: an app that owns the checks, a Manager that carries the facts

Three shapes were drawn: an app on its own, Disk Cleanup style; inside the Manager only; both, with a
split. The split is built.

- **The Media Health app** (a desktop app in the launcher, scenes 1 and 2) owns the library-wide
  checks and the actions. Its window: the library in one line (total size, items, folders), a bar of
  the top-level folders by size, and three rows, each with its own verb. Unused media: **View**,
  **Review**. Orphaned files: **View**, **Delete**. Oversized images: **View**, **Optimize**. The
  footer credits ProWorks MediaAudit, which finds usage and orphaned files.
- **The Manager carries the facts** (scenes 4 and 7): a Health list view with Size and Used on
  columns, a size tag and an unused count on folder cards, and **Properties** on a folder. All read
  the last check; all are absent until one has run.
- **View is the bridge**: from the app it opens a Media Manager window showing that category as a
  virtual place (scene 3), with the category as a token in core's filter box, largest first.
- **The item** (scene 6) already has both halves: core's Info tab shows **Referenced by**, and Edit
  image's Save over already asks when the image is on pages (#137, in Services.Media). Nothing to
  build; see §9.

Rejected: two new places "Unused media" and "Orphaned files" in the Manager's sidebar. The sidebar
is the tree, and the tree stays folders. Also rejected: adding categories to the Accessories
add-on's Disk Cleanup. Coupling two add-ons for one extra row is not worth it.

## 4. MediaAudit: a hard dependency, and we contribute

ProWorks.Umbraco.MediaAudit (MIT, github.com/ProWorksCorporation/ProWorks.Umbraco.MediaAudit) is the
engine for usage classification and orphaned files. The add-on takes it as a NuGet dependency; the
add-on's Health app is a second front for the same engine. Not optional: "optional" was considered
and rejected as a half measure, since the checks are the feature.

What it gives, and why it is not rebuilt: classification from tracked references with a fallback for
folders picked as a whole, and the orphaned-file disk scan with an admin-only delete. Its own delete,
purge and deletion log for media items are not used (§5): core's trash does that job here.

Facts that matter for the build:

- On NuGet as 1.x for Umbraco 17 and 18.x for Umbraco 18, so it covers both of this repository's
  release lines (v17/main and main).
- API under `/umbraco/media-audit/api/v1`, Media section access, delete/purge/disk-delete admin-only.
  Endpoints: `summary`, `run`, `items` (paged, filtered by status, type, folder; sorted by name,
  size or date), `items/{key}/usages`, `folders`, `media-types`, `export`, `delete`, `purge`,
  `deletion-log`, and for disk: `disk-summary`, `disk-scan`, `disk-items`, `disk-delete`. There is
  no published client and no stability promise on the routes. The add-on wraps every call in one
  module (`health/media-audit.client.ts`) so a route change is one file.
- A run reports totals only when it finishes; there is no scanned-so-far count today.
- The result lives in memory in the Umbraco process. A restart forgets it; on a load-balanced site
  each server has its own answer. The app shows "Checked today, 3:12 PM" so stale is visible, and
  "No check yet" after a restart.
- It registers a dashboard of its own in the Media section. It stays; hiding it is theirs to offer.

**Upstream asks, in the order the build needs them.** The author (Janae Cram) is reachable; Luuk
contacts her.

1. A scanned-so-far and total count on `summary` while a run is `Running`, so the taskbar can show a
   real percentage instead of busy.
2. A routes promise or a versioned client package.
3. Persisting the last run (its summary and items), so a restart or a second server does not forget.
4. Keys on `folders` and a parent key on items. MediaAudit identifies folders by integer id and a
   names path; the Manager, core's cards and the tree know folders by GUID only, and nothing in
   core's management API bridges the two without a lookup per folder, which §2 forbids. The folder
   facts (§8) need this, so steps 4 and 5 wait for it, or fall back as §8 says.
5. A setting to hide the dashboard when another front is installed.

**Any problem with MediaAudit is reported to Luuk, not worked around silently.** A route that differs
from its contract, a result that disagrees with core's references, a run that sticks, a delete that
skips for a reason the add-on did not expect: each goes in the session's report, with what was
observed, so he can take it to the author. Working around one is a decision for him.

## 5. The checks

| Check | Source | Verb(s) |
| --- | --- | --- |
| Where the space goes | Sum of MediaAudit's `items` sizes by top-level folder, in the browser | none; it is the bar |
| Unused media | MediaAudit `items?status=Unused` | View, Review, Trash (core's) |
| Orphaned files | MediaAudit `disk-items` | View, Delete (via MediaAudit `disk-delete`) |
| Oversized images | The add-on: images from `items` over a threshold | View, Optimize (via Optimize images, #139) |

**Check** runs MediaAudit's `run` and `disk-scan` (both, one button), then the add-on sums. While it
runs the window shows progress, the taskbar button shows the same through window progress
(`docs/developer/window-progress.md`), and the window can be closed; the check continues on the
server and the app picks the result up when reopened. Polling `summary` every two seconds while
running, nothing otherwise.

**Oversized** means larger than 2 MB, the add-on's call; a setting under Add-ons (`#103`) if anyone
asks. The estimated saving is Optimize images' own estimate over those items.

**Trash is core's, everywhere.** From the app's list, from Review and from a Manager window alike,
trashing a media item is core's trash: the recycle bin, reversible, with core's own confirm that
lists the pages an item is placed on, and the Manager's undo. MediaAudit's `delete` is not used.
What it would add is its deletion log and a second reference check against its own, possibly
stale, run; the log is not worth a second trash behaviour, and core's confirm already does the
check at the moment it matters. Purge is not offered; Accessories' Disk Cleanup empties the bin.

**Delete on orphaned files is MediaAudit's `disk-delete`**, because core has nothing for a file
without an item. Admin-only on its side; non-admins see the button disabled with the reason.

So MediaAudit is used for what it alone can do: classifying the library, scanning the disk, and
deleting from the disk.

## 6. Review: one unused item at a time (scene 5)

A window stepping through the unused list, largest first: the image big enough to judge, folder,
size and dimensions, last changed, "Not placed on any page", and **Keep** / **Trash**, with the
arrow keys and Space to skip. Open item and Edit image are a click away. A strip along the foot shows
what is coming and what is done. The header counts down: "12 of 733 · 94 MB to go".

**Keep** marks the item reviewed, for the whole site, so nobody reviews it again: one editor
reviews for the team. MediaAudit has no such flag and the item's properties are the editor's, so the
add-on stores it. The desktop's package settings store is per user today
(`docs/developer/package-settings.md` §4 and §7), and Luuk's decision is to give that extension
point a site-wide scope rather than build a store for Keep alone: the desktop already keeps some
settings site-wide, and other packages will want the same. That is its own piece of work, in the
host, before step 2; Keep is its first user. A kept item still counts as unused in MediaAudit's
numbers; the app shows "733 unused, 12 kept".

## 7. View: a category as a virtual place in the Manager (scene 3)

The places branch (#158, Manager design §19) lists a non-folder as a virtual folder through a server
decorator of `IMediaListViewService`. View reuses that shape: a virtual place per category, with a
synthetic key the decorator recognises, answered from MediaAudit's last run, ordered by size
descending by default, paged as core pages. Core's collection then lists it, and the whole Manager
comes with it: cards, selection, open beside the window, drag to a folder, Edit image, Trash.

- The tree does not show these places. A window opens one from the app's View, and its caption
  reads "Media Manager" with the category named in a strip of the window's own above the
  collection, where the Manager already draws its chrome (the clipboard strip is the precedent).
  The mock draws it as a token inside core's filter box; that would mean reaching into core's
  shadow DOM, so the strip it is. Closing the strip returns to the tree's root.
- Trash there is core's, like everywhere else (§5). Nothing routes by place.
- Orphaned files are not media items and have no place in the Manager. Their View is the list inside
  the app, with Delete.
- Before this step lands (it is the last), View opens the same list inside the Health window.

## 8. The facts in the Manager (scenes 4 and 7)

- **Health list view**: a collection view of the add-on's own, offered by the view switch beside Grid
  and List, with Name, Size, Used on, and sort on each. Rows come from core's collection; Size and
  Used on come from the last check by key. Absent from the switch until a check has run in this
  session. (Size alone is also possible today with no code: the media list view data type can show
  `umbracoBytes`; the user guide says so.)
- **Folder tags**: a size tag and, when there are any, an unused count on folder cards, overlaid the
  way the Manager already marks cards for drag and cut. Small, grey, bottom corner; never red.
  Absent until a check has run.
- **Matching folders.** Every folder fact above sums MediaAudit's items by folder, and MediaAudit
  names folders by integer id and names path while the Manager knows GUIDs (§4, upstream ask 4).
  With the upstream change, match by key. Without it, match by names path against the folders the
  add-on's tree has already loaded, and show nothing for a folder whose path is not loaded or is
  ambiguous (two siblings with one name). Never look folders up one by one to fill a tag.
- **Properties** on a folder: one entry in core's item menu, marked as the add-on's like Copy to is.
  A small window: size, items and folders, last change, and the folder's own unused and oversized
  counts with View, Review and Optimize scoped to it, plus **Open Media Health**.

## 9. The item (scene 6): already there

Scene 6 was drawn before checking, and both halves exist. Core's media Info tab has a **Referenced
by** box (`Umb.WorkspaceInfoApp.Media.References`), which is why the coherence research (§6, §7)
dropped a File box of our own. Services.Media's file menu already asks before a save over an item
with references (`confirmUsedElsewhere`, from #137), listing the pages in core's confirm modal and
remembering a yes per file. The mock's third button, Save a copy, would change Services.Media's
contract for little; the existing yes/no stays. Optimize for one file is already in the file actions
menu from #176.

So nothing is built for the item. The user guide for Media Health points at core's Referenced by.

## 10. Steps, each its own session

In order; each ends green on both `npm run build` and `npm test`, with the docs page for what it adds.
The base is `v17/main` (Umbraco 17.6 floor), which has everything this builds on (#158, #139, #176);
`main` (Umbraco 18) gets it by merge-up, with MediaAudit pinned 1.x on the 17 line and 18.x on main.

1. **The app**: window, the three checks and the bar, Check with progress, View as a list inside the
   app, core's trash on items and MediaAudit's delete on orphaned files (§5). MediaAudit becomes a
   dependency here, and the docs page for Media Health is written here.
2. **Site-wide package settings** in the host: a site scope on the package settings extension point
   (§6), with its permission check and its page in `docs/developer/package-settings.md`. Not Media
   add-on work, but Review needs it.
3. **Review** (§6), on 2.
4. **Health list view** in the Manager (§8, first bullet). Needs no folder matching.
5. **Folder tags and Properties** (§8, second and third bullets). Best after upstream ask 4 lands;
   otherwise with the names-path fallback.
6. **View as a virtual place** (§7): the server decorator.

Steps 2 to 5 can run in any order once 1 is in, except that 3 follows 2; 6 is last because it is the
dearest and the app's own list covers View until then.

## 11. Non-goals

- A scanner of the add-on's own, duplicate detection, storage statistics beyond the bar.
- Changing how MediaAudit decides what is used.
- Purge, or emptying the recycle bin: core's and Disk Cleanup's.
- Anything scheduled or automatic (§2).

## 12. Definition of done, per step

The repository's list in `CLAUDE.md`, plus: the Media add-on's user guide gets one page,
`docs/user/media-health.md`, grown by each step; the marketplace JSON for the Media add-on gets the
tags `cleanup`, `unused media`, `media health` and a screenshot of the app; `README.md` gets at most one
line, in step 2.

## 13. Open for the build

- Decided 2026-10-26 after the builder check: Keep is per site, through a site-wide scope added to
  the package settings extension point (§6); trash is core's everywhere and MediaAudit's `delete` is
  not used (§5). The reviewer had asked both; the reasoning is in those sections.
- Whether `run` and `disk-scan` can run at the same time or must be sequenced: read MediaAudit's
  service before deciding; sequence if in doubt.
- The virtual place's synthetic key scheme (§7), chosen with the places decorator in front of you.

## 14. Step 1 as built on MediaAudit (2026-10-26, superseded by §15 the same day)

What the build of step 1 settled or found, where it differs from the sections above. Each is the
fact as observed; the sections above are left as designed.

**MediaAudit, as read at 1.1.0 (`d77003b`).** Every call is in `health/media-audit.client.ts`.

- `run` and `disk-scan` are two services with their own locks and no shared state, so they could run
  at once. They are sequenced anyway (§13's "sequence if in doubt"): each pages the whole media table
  through `GetPagedDescendants`, and a check must not load the site twice over (§2). The window names
  the step it is on.
- `POST run` returns the whole `AuditRun`, not the contract's `{ status }`. Harmless; noted as drift.
- While a run is `Running`, `summary` reports `runAt: null` and every total as 0: the previous run's
  summary is replaced, not kept beside the new one. Its items stay until the new run replaces them.
  The contract says "fields omitted"; they are zeros. The app ignores the summary's totals and sums
  the items itself, so this does not show.
- MediaAudit gives no count while a run runs (§4, upstream ask 1), so the task the window reports has
  no `total` and the title bar and taskbar show activity, not the mock's "412 of 1,284".
- Folders: the library line's folder count is one `GET folders` after the check, which is the one
  call §5's table did not list. It walks the library again server-side, inside a check the person
  asked for.
- An image is decided by its file's extension (`health-model.ts`, `isImage`), since MediaAudit does
  not say which editor a type uses and the add-on's is-image condition reads media types one by one,
  which §2 forbids over a whole library. SVG is never an image here.
- `disk-delete` skips with `NotFound` or `NowOwned`; the window names both, with the path.

**The app, where it differs from the mock.**

- Closing the window keeps the check running on the server, as designed, but the taskbar progress
  goes with the window: the host drops an app's tasks when its window closes
  (`window-progress.md` §1). Minimising keeps it. The footer says "You can close this window; the
  check keeps running on the server", not the mock's "and the taskbar shows how far it is".
- Opening the window asks the server once, per desktop session, whether it already holds a check
  (`summary` and `disk-summary`, two reads, no scan), and reads it if so, or follows one still
  running. Without this a check from MediaAudit's own dashboard, or from before a reload, would show
  as "No check yet" while the server had the answer. It is the one read §2 does not list; it measures
  nothing.
- **Review** is shown greyed with "Coming later" rather than left out (step 3): a verb that
  disappears reads as a bug.
- The estimated saving on oversized is a ratio, `OPTIMIZE_SAVING_RATIO` = 0.75 of the images' size,
  said as "about". Services.Media's `optimizeMedia` has no estimate before a run; its report after one
  has each image's new size, which the app takes so the row follows without another check.
- The orphaned list has **Open** (the file's URL, in a new tab) and **Delete** per file beside the
  row's **Delete...** for them all. The unused and oversized lists open an item beside the window
  as the Manager does, with **Edit image** on images; the unused list has core's **Trash** per item,
  through the Manager's operation, so it is undoable and in Transfers.
- Trash asks with core's own `confirmTrash` text, not core's references modal: an unused item has no
  references by MediaAudit's reckoning, and the modal is wired to core's entity action, not callable
  from here.
- The health context is a second `umbraDesktopContext` of the add-on
  (`Umbraco.Community.UmbraDesktop.Media.HealthContext`), beside the Manager's. It keeps the whole
  item list (`result.items`) for steps 4 and 5.

**Measured against a real backoffice (2026-10-26, Umbraco 17.6, MediaAudit 1.1.0, the test instance
on a copy of the main database with its media).** A check of 48 items and 130 files took four
seconds end to end; the window, the taskbar activity, View, open beside, the orphaned list and the
admin gate all behaved. Two things the data showed:

- **Items without `umbracoBytes` count as 0 B.** Umbraco Engage installs 28 images (its persona and
  journey pictures) with neither `umbracoBytes` nor `umbracoExtension` on the item, and core agrees
  (its own detail has neither value), so MediaAudit reports `sizeBytes: null`, the bar shows
  "Engage 0 B" and the unused row says "28 items, 0 B". Honest, but the bar undercounts such
  folders. Reading the file's real size would be one request per item, which §2 forbids over a
  library; left as is, and worth knowing when a folder's size looks too small. The same 28 are the
  only unused items on that database, which is right: nothing places them.
- **The orphaned list was right.** None of the 48 items' own files was listed as orphaned (checked
  item by item against core's `umbracoFile`), so a delete there would have touched nothing an item
  owns. The 82 orphans were leftovers of earlier sessions' copy and paste tests.

And one fix from the run: an item with no extension is an image when it is of core's own Image
type (the Engage pictures above showed as documents without Edit image), and the checked time is
written in the backoffice's culture rather than the browser's, so it matches the taskbar clock.

## 15. The add-on's own engine (decided 2026-10-26)

**Decision.** MediaAudit is out; the Media add-on runs the checks itself, in server code of its own
under `Health/`. Luuk's call, on the evening of step 1, after seeing how much of MediaAudit the
add-on used: five of its fifteen routes, and behind those five about four hundred lines of C# over
core services the add-on already used. Four of the five upstream asks in §4 (a progress count,
persistence, folder keys, a route promise) were structural rather than fixes, each waiting on the
author before the next step could use it, and the dependency brought every installer a second
dashboard, a deletion-log table and a floating 1.x with no route promise. §4 and §14's MediaAudit
notes are left as written; they are what was learned, and the engine keeps the two things worth
keeping from it: the ancestor-folder rule, and the re-check before a delete.

**What it is.** One pass over the library, one query for usage, one walk of the disk, and the result
in tables of its own.

- `UmbracoMediaLibraryReader`: every descendant of the media root, a page of 500 at a time, the
  recycle bin included. Folders go in a map by id, so an item's folder **key** and names path come
  from the map, never a lookup per item: §4's upstream ask 4 is answered by construction, and steps 4
  and 5 match by key. Trashed items give only the files they own, since they keep them until the bin
  is emptied. Then one `GetByRelationTypeAlias("umbMedia")` for the whole site.
- `MediaUsageClassifier`: pure. An item's usage is the distinct pages related to it, or, when there
  are none, the distinct pages related to any folder above it, which is how a picker that takes a
  whole folder records itself. This is MediaAudit's rule and it is the one worth keeping.
- `MediaFilePaths`: the files an item owns, from **every** Upload field and Image Cropper on it, not
  only `umbracoFile`, since a site's own type can hold two files and the other would otherwise be
  listed as orphaned and offered for deletion.
- `MediaDiskScanner`: walks the media folder through Umbraco's `MediaFileManager.FileSystem`, so blob
  storage is walked the same way; orphans are the files whose normalised path no item owns.
- `MediaOrphanDeleter`: re-checks each file against the library as it is at the moment of deleting
  (one pass for the owned paths; a delete is rare and asked for), skips with `NotFound` or
  `NowOwned`, prunes folders left empty but never the root, and writes one entry to Umbraco's audit
  log under the person who asked. No log of its own.
- `MediaHealthStore` over EF Core, the Arcade's way (its design D9): tables
  `umbraDesktopMediaHealthCheck`, `...Item`, `...Folder`, `...Orphan`, with their own migrations
  history table and a migration set per provider. One check at a time across the site, decided by a
  row rather than an instance; progress written per page, so any server answers the poll; a check
  that has said nothing for an hour is given up on at the next start (`StaleAfter`), so a server
  that died mid-check cannot block the next one for ever; a finished check replaces the one before,
  rows and all; a failed one is reported beside the last good one.
- `MediaHealthRunner`: on Umbraco's `IBackgroundTaskQueue`, so the request returns at once and the
  check outlives the window, the tab and the session.
- `MediaHealthController` at `umbradesktop/media/health`: `status`, `check`, `items` (paged, 500),
  `folders`, `orphans`, `orphans/delete`. The Media section policy on the controller; Umbraco's admin
  policy on the delete, which answers 403 so the window can grey the button and say why.

**What changed for the window.** `health/health.client.ts` replaces the MediaAudit client, same
shape, same single-module rule. The progress is real now: "412 of 1,284 items" and a percentage on
the taskbar during the library pass, activity during the disk walk, whose file count is not known
before it. The footer no longer credits anyone; it says what unused and orphaned mean. The result is
a snapshot (§2), and the user guide says so: an item trashed from the window leaves the window's
copy, not the server's, until the next check, and so does anything trashed from the Media section.

**What was measured.** The engine's C# is tested without Umbraco (49 tests: the classifier, the file
paths, the scanner, the deleter, the store on in-memory SQLite through the real migrations, the
runner, the controller and the composer), and the rest is the same headless run as §14, against the
worktree's instance.

**Measured on the engine (2026-10-26, the same instance and database as §14).** The numbers came out
identical to MediaAudit's run: 48 items, 6 folders, 28 unused, 82 orphans, 8,469,525 and 6,465,673
bytes. The check took 1.2 seconds against 48 items and 130 files. Deleting one orphaned file from the
window removed the file and the folder it left empty, dropped the count to 81, and wrote one row to
`umbracoLog` (type Delete, entity type "Media file"). The window opened on the result from the
database without pressing Check, as §15 intends. Two things worth knowing:

- Stored times came back without their UTC marker and the window read them as local, an hour off;
  the store now marks them UTC on the way out, with a test. Neither SQL Server nor SQLite keeps a
  kind, so this is the rule for any time the add-on stores.
- A check pressed in the first seconds after a cold start waits for Umbraco's hosted services:
  `IBackgroundTaskQueue` is drained by a hosted service that starts after the site already answers
  requests, and a check queued in that window ran 30 seconds later, the moment the services
  registered. In steady state it starts at once. The window shows it as "Finding what is used" with
  no count until then, which is honest; nothing to fix, but a reader of a slow first check should
  know.
