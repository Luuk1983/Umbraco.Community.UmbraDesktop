# Media Health: design

Issue #141, renamed from "Media Cleanup on top of MediaAudit". Decided 2026-10-26 over the mocks in
[`mockups/media-health/health.html`](mockups/media-health/health.html). Part of the Media add-on
(`Umbraco.Community.UmbraDesktop.Media`), which already has the Media Manager (#144, #158), Edit image
(#137), Optimize images (#139) and the item's file tools (#176). This is the third leg: finding,
editing, and now tidying.

> **Redesigned 2026-10-27 (§16).** After the first real use, the window, View and Review were
> redrawn in [`mockups/media-health/redesign.html`](mockups/media-health/redesign.html). Where §3,
> §6, §7 or §10 disagree with §16, §16 wins.

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

> Superseded 2026-10-27 by §16.5 and §16.6: Review is the grid's One by one, nothing names a key,
> and Keep lives in Media Health's own tables with a note and an end date.

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

> Dropped 2026-10-28 (Luuk, after step 2 was built and run, §16.14): the list in the app (§16.4) is
> where View went, and Show in Media Manager (§16.5) covers going to the Manager. Not built.

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

> Revised 2026-10-27 by §16.8. Step 1 is built, step 2 is built on its own branch, and the rest is
> replaced by the list there.

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

## 16. Redesign after the first real use (decided 2026-10-27)

Luuk used step 1 on the test instance and found it not yet professional, in look or in use. The
redesign is drawn in [`mockups/media-health/redesign.html`](mockups/media-health/redesign.html),
after macOS Storage, the iPhone's storage screen, Windows 11's Cleanup recommendations, Files by
Google and CleanMyMac. It supersedes §3's window, §6, and §7 where they disagree; §15's engine
stays, with the additions in §16.7.

### 16.1 What was wrong with step 1

- **Information and actions fought.** The top was the library by folder, the bottom was health, and
  the two did not connect: "8.1 MB, 48 items" said nothing about what to do.
- **It assumed people inspect.** Most people will not look through 1,312 orphaned files or 733 unused
  items. They want one button, and confidence that it is safe.
- **View did not scale.** A flat list of names works for 28 and not for 733.
- **Preview was slow.** A name opened core's media editor in an attached window, which boots a whole
  backoffice in an iframe to show one picture. The edit view and Image Editor do not belong in a tool
  for deciding what goes.
- **Review looked pressable and did nothing.** It was disabled in code, but a disabled primary button
  does not look disabled in every theme, and "Coming later" showed only on hover. A theme bug in its
  own right (CLAUDE.md: a theme may restyle, never remove; this one hides a state).
- **Check again was a faint link**, and there was no real screen for "no check yet".
- **Review and the rows overlapped.** Review unused and the unused row's View opened the same items
  two ways.

### 16.2 The overview (mock scene 1)

One window, top to bottom:

1. **The library and its health in one bar.** "Media library · 18,240 items", the size large, and
   **Check again** as a real button top right under "Checked today, 10:02 PM". Under it a bar cut by
   health, not by folder: unused, orphaned, could be smaller, in use and fine. Under the bar, "5.8 GB
   can be freed" and "6.6 GB in use and fine".
2. **Three rows in the bar's colours**: Unused items, Orphaned files, Oversized images. Each has a
   checkbox (ticked by default), a coloured edge, one line saying what happens to it ("To the recycle
   bin, so they can come back", "Deleted for good", "Resized and turned into WebP"), a strip of three
   thumbnails and a count of the rest, its size, and a chevron. Clicking a row opens the grid (§16.4).
   The unused row counts keeps: "733 items no page uses, 12 kept".
3. **Clean up 5.8 GB**, the one primary button, under the rows it acts on. Its figure is the sum of
   the ticked rows.
4. **Where the space goes**: the three largest top-level folders, each bar split by the same health
   colours, then "309 more" and **All folders**. Kept on purpose: people come with "why is it so big"
   as often as "what can I clean", and only folders answer that, since most space is usually in media
   that is used. Clicking a folder opens the grid filtered to it.

Rejected in the conversation: the ring (direction 1's headline; Luuk preferred the bar) and the
three-tile mosaic (direction 2's middle; the rows read better). Both are in the mock's history only.

### 16.3 No check yet, checking, cleaning, done (scenes 0, 3, 4, 4b)

- **No check yet**: an empty dashed ring, "How healthy is your media library?", a line saying the
  check reads everything once and changes nothing, three small tiles naming the three checks, one big
  **Check my media library** button, and under it the item count and "you can close the window
  meanwhile". The item count is `IMediaService.Count()`, cheap, returned with the status.
- **Checking**: a ring filling with the real progress, and the three steps ticking off (reading
  items, finding which pages use them, scanning files on disk). The mock also streams thumbnails of
  what is found so far; the engine cannot, since nothing is known to be unused until the usage query
  after the library pass. Leave that out rather than fake it.
- **Clean up** asks once, in a sheet that says per kind what happens, with its count and size: items
  to the recycle bin (restorable from the Media section), orphaned files deleted for good (each
  checked again first, §15), images opened in Optimize images. Unticked rows are not in it. For
  someone who is not an administrator, the orphaned row is unticked and disabled with the reason, and
  the sheet says so.
- **Done**: the size freed, large, and the library's before and after. Under it a card for the items
  in the recycle bin with **Undo** (restores them all, through core's restore), and one for the
  Optimize images window while it runs, with **Show**.

### 16.4 The grid (scene 5)

Clicking a row, a folder, or **All folders** opens one place to work in, replacing step 1's three
lists:

- **Chips** at the top: Unused, Orphaned, Too big, Kept (§16.6), each with its count; a name search;
  a sort (largest first by default).
- **A Grid / One by one switch.** One by one is Review (§16.5), on whatever the grid shows.
- **Grouped by folder**, largest group first, each group with its own checkbox and its count and
  size. Clutter comes in folders (an old campaign, an archive), so one tick takes a whole folder. This
  is the answer to scale, more than paging.
- **Thumbnails, not rows**, with name and size under each. Ticking the checkbox selects; clicking the
  picture previews (§16.5). A group shows its first row and "+208 more"; only what is on screen is
  drawn.
- **A selection bar** at the foot: "214 selected · 1.4 GB", **Keep…**, and the kind's verb (**Move
  to recycle bin**, **Delete**, **Optimize**).

### 16.5 Preview and Review (scenes 6 and 7)

> Review dropped 2026-10-27, while planning: the grid is the overview people check, and the
> preview already steps through it one item at a time with the buttons that decide. Each verb in
> the preview moves on to the next item. Scene 7 and the Grid / One by one switch are not built.
> The plan is [`2026-10-27-media-health-redesign-plan.md`](2026-10-27-media-health-redesign-plan.md),
> Decision 11.

- **Preview** opens over the grid at a click on a thumbnail: one image, asked from Umbraco's image
  resizer at the window's size (for example `?width=1200`), so a 14 MB original arrives as a few
  hundred KB and shows at once. Arrows on either side step through the grid; a click outside closes.
  Under it the name, folder, dimensions, size and "not used on any page", then **Show in Media
  Manager**, **Keep…** and the kind's verb. PDFs show where the browser can; other files show an
  icon and their details.
- **Show in Media Manager** opens a Manager window in the item's folder with the item selected, like
  Show in Finder. Opening at a folder exists already (the Manager's location, as Open in new window
  uses it). Selecting the item is new, and core's collection is paged, so the item's page has to be
  loaded and scrolled to first. If selecting proves messy, the folder alone ships first.
- **No edit view and no Image Editor** anywhere in Media Health.
- **Review** is the grid's One by one: the picture large, the facts that decide it, and three big
  buttons, **Keep…**, **Skip**, **Trash**. A strip at the foot shows what is done and what is coming;
  the header counts down ("12 of 733 · 2.6 GB to go") and keeps a tally ("Freed 96 MB · kept 3").
  It works on any chip, not only unused.
- **No keyboard shortcuts are shown or needed** (Luuk, 2026-10-27). Everything is a visible control.
  Keys may exist as an extra, but the UI never names them and never relies on them.

### 16.6 Keep (scenes 8 and 9)

Keep marks something as wanted, so it leaves its list, for the whole site: one person reviews for
the team, and nobody else's check overrides it.

- **Stored in Media Health's own tables** (§15), not the site-wide package settings of step 2 (§6 is
  superseded here). They are the tool's own data, not a setting, and they sit beside the check
  results they filter. Step 2 stays useful for real settings; Review no longer waits for it.
- **Keep… asks two things**, both with defaults so it stays one click: an optional note ("Why keep
  it?") and for how long: 3 months, **a year** (default), or always.
- **Keeps end.** When a keep's time is up, the item comes back to its list with a small "kept until
  27 Oct" badge and the old note, so judging it again is quick. A keep on an item also ends when its
  file changes (the owned path differs at the next check), and a keep on an orphaned file ends when
  the file's last-written time changes: what was kept is no longer what is there. A kept item that a
  page starts using simply stops being unused.
- **Keep works on all three kinds**: an unused item, an orphaned file (a PDF linked straight from a
  newsletter), an oversized image (a hi-res download meant to be big). Kept things are never in
  Clean up and never in the "can be freed" figure.
- **Kept is a fourth chip** in the grid: every keep with its thumbnail, kind and size, its note, who
  kept it and when, and when it ends, soonest first. **Stop keeping** returns it to its list at once;
  that is how a colleague overrules a keep, openly, with the note in front of them.

### 16.7 What the engine needs for this

- **A URL per item**, for thumbnails and the preview. Items carry none today; the reader has the file
  paths already (`MediaFilePaths`), so the first owned path becomes the URL.
- **Thumbnails** are the resizer on that URL (`?width=240&height=240&rmode=crop`); orphaned files
  have a URL already. Nothing generated or stored. **Signed, split by kind** (Luuk, 2026-10-28, after
  §16.10's first run): a site with an HMAC secret refuses an unsigned resizer URL, so the window never
  builds one. An item's picture comes from core's own `imaging/resize/urls`, by key: Umbraco where it
  can, and core checks there that the person may see the item. An orphaned file is no item, so core
  cannot sign it; the add-on's `orphans/thumbnails` signs it with Umbraco's `IImageUrlGenerator`,
  and only paths that are orphaned files of the last check, so it is never an open signer. The
  preview (step 2) is signed the same two ways.
- **The media count** for the "no check yet" screen (§16.3).
- **Keep tables and routes**: a keep per item key or per orphan path, with kind, note, until (null
  for always), who, when, and the file fingerprint it was kept against; routes to list, add and stop
  keeping; the status and lists leave out kept things and report the kept count; ended keeps stay as
  the badge until the thing leaves its list or is kept again.
- **Folder sums by health** are computed in the browser from the items and folders already returned.
- **Undo** after Clean up is core's restore from the recycle bin, for the items that Clean up moved.

### 16.8 The steps, revised

Replaces §10's steps 3 and 6; step 1 stands as built, step 2 is built on its own branch.

1. **Overview rebuild** (§16.2, §16.3): no check yet, checking, the bar and rows, Clean up with its
   sheet and done screen, Check again, Where the space goes. Engine: item URLs, media count. Fixes
   the disabled-button look as a theme bug.
2. **The grid and the preview** (§16.4, §16.5 without Review): chips, folder groups, selection bar,
   preview, Show in Media Manager.
3. **Keep** (§16.6): tables, routes, the dialog, the Kept chip, the exclusions.
4. ~~**Review**: One by one, on 2 and 3.~~ Dropped 2026-10-27 (§16.5's note).
5. §10's step 4 (Health list view in the Manager) and step 5 (folder tags and Properties), unchanged,
   except that folders match by key (§15).

§10's step 6, View as a virtual place in the Manager (§7), is dropped (Luuk, 2026-10-28, after step 2
of this list): the grid is a better place to judge clutter than core's collection, and Show in Media
Manager covers going there.

### 16.9 As planned (2026-10-27)

The plan, [`2026-10-27-media-health-redesign-plan.md`](2026-10-27-media-health-redesign-plan.md),
made eleven decisions where this section left a choice or the code forced one:

1. **Item facts in one migration.** URL, width, height and last change are added to the item row
   together (`ItemFacts`), since the reader reads them in the same pass.
2. **An item's URL is its first owned path as stored** (`/media/abc123/photo.jpg`), the string core
   serves. It is also what a keep on an item is fingerprinted by (§16.6).
3. **One health per item**: unused before oversized before fine. An unused image over 2 MB is under
   Unused only, since it goes to the bin. Orphans belong to no folder, so Where the space goes covers
   items only.
4. **The oversized row shows the images' size; the freed figures use the estimate**: "can be freed"
   and Clean up add unused, orphaned and three quarters of oversized, said as "about" when the
   oversized row is ticked.
5. **Keeps are filtered in the browser**, where the oversized list is decided; the one server-side
   exclusion is the orphan delete, which skips a file kept after the window loaded.
6. **A keep applies to every list** (Luuk). One keep per item or file; keeping again replaces it.
7. **Ended keeps are computed when read**, not stored; the server deletes a keep only when its target
   is gone from the library, or on Stop keeping.
8. **Show in Media Manager selects only what core's first page shows**; past it the folder opens
   unselected.
9. **Optimize images reports its progress to whoever started it** (Luuk), so Done can say "38 of 214
   done".
10. **Only what is on screen is drawn**, through `content-visibility: auto`, not a virtual scroller.
11. **No Review, no One by one** (Luuk): the preview's arrows and buttons already go through a list
    one item at a time.

### 16.10 Step 1 as built (2026-10-28)

The overview rebuild of the plan's step 1: No check yet, Checking, the overview, the Clean up sheet,
Done with Undo, and the disabled-button fix. Run in a real backoffice (newest Umbraco 17) on a copy of
the worktree's database: 48 items, 6 folders, 28 unused, 81 orphaned files (step 1 had deleted one of
the 82 §15 measured), 8,469,525 and 6,463,701 bytes, the same figures as §15. Four things differ from
the plan, each found by building or by the run:

- **Thumbnails are signed on the server.** Every thumbnail came back 400 on the first run: a site with
  an `HMACSecretKey`, which Umbraco writes at install, refuses an unsigned resizer URL, so Decision 2's
  "the string the resizer answers" holds only with a signature. As decided in §16.7: items through
  core's `imaging/resize/urls`, orphaned files through `POST health/orphans/thumbnails`, which signs
  with `IImageUrlGenerator`, cropped square, only the last check's orphaned files (an item's path is
  refused, tested), at most 2,400 px and 200 URLs a request. The context caches what it signed. On the
  real run the strips' requests were all 200 and a few KB to 23 KB each (measured below).
- **A disabled primary button looked enabled in every theme, and in the backoffice itself.** UUI
  2.0.2's primary-colour rule outranks its disabled rule, so a disabled primary paints its enabled
  fill; measured in the newest 17 too (`rgb(40, 58, 151)` both). Not one theme's bug: the desktop now
  writes UUI's three public `--uui-button-*-disabled` properties before every palette
  (`palette-css.ts`), and `disabled-buttons.test.ts` holds all five themes, each variant, over UUI's
  three colour sets. A disabled default or outline button gets the faint disabled fill as well.
- **Optimize images tells the caller its window's location** with the progress, not only the counts,
  since Done's **Show** has to bring that run's window forward and `openApp` needs the location to.
- **UUI 2.0.2's checkbox cannot hide its label**, so each row's checkbox is labelled with the row's
  title, which also makes the title tick the row.

Smaller choices: the result keeps the folders, since Where the space goes finds a top-level folder by
walking parents by key; the Manager's operations take an `onProgress` option, so Clean up can count
the bin on the taskbar; the folder lines are plain until step 2 makes them open the grid, and **All
folders** comes with it. The window reports its tasks with `umbradesktop-task`, as step 1 did.

**Measured.**

- No check yet showed "48 items" from the status. A check pressed in the first seconds after a start
  waited 25 seconds for the hosted services (§15), then finished inside one 2-second poll: on 48 items
  the server never reports a count mid-pass, so the ring turned and the taskbar and title bar showed
  activity with "Checking your media library". The real count is covered by the tests, not this run.
- The overview's scroll height was 612 to 613 px at 640 wide under all five themes, now the window's
  opening size (`MEDIA_HEALTH_CONTENT_SIZE`); in each theme the window then opened with no scrollbar.
- Nothing ticked: **Clean up** painted `rgb(247, 247, 248)` with `rgb(196, 196, 196)` text under every
  theme, which reads as disabled.
- An administrator's Clean up of 28 items and 81 files took 1.8 seconds, counted 0 to 109 on the
  taskbar, freed 6.2 MB (14 MB to 8.1 MB), left 28 items in core's recycle bin and 0 orphans on the
  server. **Undo** put both probe items back in their own folders (`/Engage/Persona` and
  `/Engage/Customer Journey`, which core's null target would have sent to the root), and the bin was
  empty again.
- An editor with the Media section: the orphaned row unticked and disabled with the reason, the sheet
  saying the files stay, 28 items to the bin and back, and no request to `orphans/delete`.
- The 28 unused items are Engage's, with no size, so the unused row read 0 B, as §15 found. Luuk,
  checking it: "that doesn't make sense". Changed the same day: a row (and its line in the Clean up
  sheet) whose items all lack a size says **Size unknown**, one where some do says **at least** the
  known size with "3 of unknown size" under it (`sizeOfList`, `sizeText`, `sizeNote`; Luuk asked for
  the count). No note under Size unknown, where the row's line already counts them. The bar still
  cannot draw them.
- **The bar's order was turned round** (Luuk, 2026-10-28): what Clean up empties now sits at the right
  end, fine, oversized, orphaned, unused from left to right, with "in use and fine" under the left
  and "can be freed" under the right. The folder bars follow the same order. §16.2 listed the
  segments the other way; this replaces it.

**Not measured here**: the oversized row and Optimize images' card, since the library has no image
over 2 MB; both are covered by tests only. A first sign-in of a new user shows the welcome wizard over
the launcher, which a script has to close before it can open an app.

### 16.11 Renamed to Media Cleanup (2026-10-28)

The app's name, as people see it, is **Media Cleanup** (Dutch: **Media opschonen**); Luuk: "yes cleanup
is awesome". Umbraco's own Health Check is a developer tool, and "Health" promises a report, while the
app is now about one Clean up; Media Cleanup was also the issue's first name. "Maintenance" was
considered and rejected: editors read it as IT work or as maintenance mode. Only what people see
changed: the label, the user guide's title and words (its file name and `id` stay, so links hold),
the README line and the marketplace caption; `media health` stays a marketplace tag so old searches
still find it. Code names, aliases, routes, tables and context tokens keep "Media Health". The
launcher search has no keywords for an app to add, so "health", "unused" and "storage" were not added.

### 16.12 The last result, kept true (2026-10-28)

Luuk, checking step 1, asked whether the app should start fresh on every open, as a phone's storage
screen does. Decided instead, with him:

- **Opening shows the last result, never starts a check.** Someone may open the app out of curiosity,
  and a check is the heavy part. Before the first check the window explains the app and offers the
  button, as before.
- **A result over a day old gets a warning, and Clean up waits** (`HEALTH_STALE_MS`, 24 hours; Luuk:
  "24h sounds alright"). The result is still worth reading; acting on it is not. The warning carries
  its own **Check again**.
- **The stored result follows a Clean up.** It was a snapshot the window edited in its own copy only,
  so reopening the window, or a colleague's, showed trashed items as still unused, and a second Clean
  up would have trashed them again. Now the window names the items it trashed, restored or optimized
  (`POST items/refresh`), and the server reads them from Umbraco itself (`ReadStatesAsync`, one
  `GetByIds`), never trusting the window's copy. A trashed item's row stays, marked `Trashed`
  (migration `ItemTrashed`), so Undo brings it back with the usage and folder the check saw; one
  deleted for good is dropped.
- **An open window watches** every 30 seconds (`HEALTH_WATCH_MS`), only while it can be seen and no
  check or Clean up runs. Luuk: "not a critical application that will be used by a lot of users
  constantly", so polling, not SignalR. A colleague's check is followed, a newer result read.
- **Clean up asks the server first.** The watch looks only every 30 seconds, so Clean up reads the
  status just before acting and refuses when a newer check finished or one runs, loading it instead.
  This guard is in the window, not on the server: the trash goes through core's own API (the
  Manager's trash), which the add-on cannot gate, and orphaned files are already re-checked per file
  on the server at the moment of deleting.
- **Stop** (`POST check/stop`) for a check started by mistake. A stopped check is its own phase, not
  a failure, so the last result stands with nothing to explain. The runner learns at its next beat.
- **The runner beats** every 20 seconds (`HeartbeatEvery`) whatever the phase, since the disk walk
  reports nothing until it ends; a check silent for 2 minutes (`StaleAfter`, was an hour) is dead, so
  a restart mid-check no longer leaves the next press joining a check nobody runs for up to an hour.
- **Two presses at once start one check.** The look for a running check and the insert were separate
  steps; a lock in the store (a singleton) makes them one per server. Across servers the gap remains,
  a few milliseconds wide and costing at most one wasted run; a database lock was not worth it here.
- **Status reads each part on its own.** It read the last five checks and picked from them, which a
  run of stopped checks could have pushed the last good result out of.

Measured on the worktree's copy (48 items, 81 orphaned files):

- Opening showed the last result (check 7) with no request but the status and the result's reads.
- A check started and stopped through the API: the status had none running, the last result still 7,
  no failure, and 25 seconds later the same; the runner's late progress and finish were refused.
- A check started through the API, as a colleague's would be: the open window showed its result
  (check 9) after 30 seconds, one watch.
- Clean up of the 28 unused items: the stored result then counted 20 items and no unused ones; Undo
  brought it back to 48 items, 28 unused, from Umbraco's own word.
- With the result aged two days in the database: the warning showed with **Check again**, **Clean up**
  was greyed, and the context refused a Clean up as `stale`.

### 16.13 Polish after §16.12 (2026-10-28)

Luuk, checking the instance: "I like correct alignment and consistency." Four changes:

- **"in use", not "in use and fine".** The rest of the bar already says what is not fine.
- **The warning is the desktop's own notice.** The first one was a yellow box of the app's own, in
  UUI's warning fill, which is unreadable on a light surface, with a second **Check again** beside
  the one at the top. The window's banner (the one a window shows when a page changed while you edit
  it) already solved both, under every theme, so it became a component of its own,
  `<umbradesktop-notice>` in the host, which the window's notice stack now draws too. Media Cleanup
  draws it by its tag name for a check over a day old, a refused Clean up and a failed check, with no
  button: **Check again** at the top is the one way. Luuk turned down the warning icon on the title
  bar and taskbar button for an app's notice: "it has a different meaning" (unsaved work in trouble),
  so the component is content only. `docs/developer/notices.md` is the contract.
- **Thumbnails under each row's words**, as many as the width takes (`stripCount`), so they start at
  the same place on every row whatever the size column says. Every strip gets the narrowest row's
  room, so they also end together; measured under all five themes: 12 places on both rows (11 under
  Umbraco 4 and Windows 98's wider type). Strip widths are taken a frame late, since drawing a strip
  changes its column's height, and answering that in the same frame is the browser's
  "ResizeObserver loop" error, which failed every test until fixed.
- **The window opens taller**, 640 by 676 (was 613), measured: the strips' own line made the overview
  676 high under four themes and 675 under Umbraco. A notice over it scrolls, which is rare.


### 16.14 Step 2 as built (2026-10-28)

The grid and the preview of the plan's step 2 (§16.4, §16.5 without Review): a tab per kind with its
count, a name search and a sort, the kind's entries grouped by folder with a checkbox per group, a
selection bar with the kind's verb, a preview over the grid that steps through it, and **Show in Media
Manager**. The model is `health-grid.ts` (entries, groups, the selection, all pure); the screens are
`health-grid.element.ts` and `health-preview.element.ts`; the window switches to them on
`health-open-grid`. Run in a real backoffice (newest Umbraco 17) on the worktree's copy, 48 items, 28
unused, 81 orphaned files. Where the build differs from the plan:

- **The cards are core's own media card**, `uui-card-media`, as core's media grid and so the Media
  Manager draw them: a click on the picture opens it (here, the preview), its checkbox selects, which
  is the plan's "ticking selects, clicking previews" for free, and themes already style it. The card
  lays its name and size over its foot, so a cell is square at the thumbnail's edge (`CELL_HEIGHT =
  THUMB_EDGE`), the size the resizer is asked for. Core's file symbol sat half under that caption at
  120 px, so a file that is no picture draws an icon with its extension above it; the caption measured
  58 px under all five themes (`CARD_CAPTION`). "+n more" is drawn as an empty card (surface, border,
  the card's radius): the overview's strip tile vanished on the grid's background.
- **Orphaned files are one group, Files on disk.** The plan grouped them by directory; Umbraco keeps
  every file in a folder of its own with a random name (`/media/1pjnlrr4/…`), so the first run drew 81
  groups of one. The preview says where an orphaned file is on disk (`/media/1pjnlrr4`) instead.
- **The preview is signed uncropped.** Core's `imaging/resize/urls` is asked with `mode: 'Max'` and
  the add-on's `orphans/thumbnails` gained `fit` (Umbraco's `ImageCropMode.Max`), each with the edge as
  both sides, so the whole picture fits the box; the context caches fitted and cropped apart. The
  width is `previewWidth` and never more than the picture's own larger side, so a small image is not
  blown up.
- **Delete asks with the Clean up sheet**, which takes its own heading and button now ("Delete 30 B for
  good?", **Delete**), so a delete for good is said in the same words wherever it is asked. Move to
  recycle bin and Optimize act at once, as Clean up's own rows do once confirmed; the bin has Undo in
  the Manager and Optimize asks in its own window.
- **No Kept tab and no Keep… yet**: they come with step 3 rather than drawn dead now, as step 1 left
  the grid's openings undrawn.
- **The openings on the overview**: each row has an arrow button (**See all**), greyed when the row is
  empty, and its strip opens the grid too; each folder of Where the space goes is a button; **All
  folders** sits beside "n more". A folder opens on its first tab with anything in it. That button
  made the overview 2 to 17 px taller than the window (17 under Umbraco 4's larger type), so the window
  opens at 640 by 693; measured again, every theme's scroll height then equals its visible height.
- **The day-old warning shows over the grid too**, since its verbs act on the same result, but they do
  not wait for a new check as Clean up does: each acts on something the person looked at and chose,
  one picture or one group at a time.
- **Show in Media Manager** adds `select=<key>` to the Manager's location; the window selects it
  through the existing select-when-shown path and at once reports its location without it, so a reload
  does not select it again. Not offered for an orphaned file, which is no item.
- `optimize(keys)` moved into the context, as the plan said; Clean up's oversized row goes through it.

**Measured.**

- Opened from each row, a folder and All folders: the right tab and counts (Unused items 28, Orphaned
  files 81, Oversized images 0 with its **See all** greyed), Engage's two folders as groups with "Size unknown", the first row of
  each (four places at 640 wide) with "+9 more" and "+13 more". Every thumbnail request was signed and
  200; none unsigned. Each row reports `content-visibility: auto` and `contain-intrinsic-size: auto
  120px`.
- A whole group ticked (Engage / Persona, 16 items): "16 selected · Size unknown", **Move to recycle
  bin** emptied the group in 1.8 seconds, all 16 were in core's recycle bin, and the stored result no
  longer listed them as unused (`items/refresh`). Restored afterwards, each to its folder.
- The preview of the largest picture, a 1.5 MB orphaned PNG, drawn 509 px wide: one request,
  `?rmode=max&width=800&height=800&hmac=…`, 200, 460 KB, 800 by 534. **Next** stepped to the next; a
  click beside it closed it.
- A PDF (created in this copy for the run, "Cleanup check PDF", still there): the card draws the icon
  with PDF, the preview shows it in Chrome's own viewer, with **Show in Media Manager** and **Move to
  recycle bin**.
- **Show in Media Manager** on an item in Engage / Persona opened a Manager window at that folder with
  the item selected and scrolled to.
- Everything above under all five themes.

**Not measured here**: an item past core's first page (no folder of this library holds more than one
page), so Decision 8's "folder only" is covered by its reasoning, not a run; an item without a file
(core refuses to create one, and Engage's items have files on this copy); oversized images (none over
2 MB); and an editor who is not an administrator (the editor of §16.10 is not in this database copy).
Each is covered by tests.

**§7 decided** (Luuk, 2026-10-28, asked once this step was built and run): View as a virtual place in
the Manager is dropped, not built. The list groups by folder, previews and acts, Show in Media Manager
covers going to the Manager, and orphaned files could never have had a place there.

### 16.15 Step 2 reworked (decided 2026-10-29)

Luuk, testing step 2 on the instance: "visually I'm pretty underwhelmed". The overview did not use a
wide window, Where the space goes opened a cleanup list instead of a breakdown, the lists had no drag
to select, the cards cut names at 120 px, the window opened cramped, and the preview overlay looked
like nothing in Umbraco and opened at a stray click. Mocked in
[`mockups/media-health/step2-rework.html`](mockups/media-health/step2-rework.html), scenes 1 to 4;
Luuk: "the design looks good", and drop the card view.

1. **The overview follows the window's width.** From about 900 px the three kinds are cards side by
   side (figure large, line, four thumbnails, See all), with Where the space goes beside them; below
   that, compact rows without thumbnail strips. The window opens at about 960 by 720, measured, not
   taken from the mock.
2. **Where the space goes is a folder breakdown**, its own view, one level at a time like macOS
   Storage: the folder's bar, then the folders under it largest first, each with a bar in the health
   colours and tags of what can go, a path back up, and Open in Media Manager for the folder shown.
   The tags open the cleanup list for that folder and below. This replaces a tree for unused items.
   Browse all folders opens the top level.
3. **The cleanup list is a table**: small thumbnail, the whole name, folder, size, last changed,
   grouped by folder with the group's checkbox, count and size. **No card view** (Luuk).
4. **Details beside the list, in the desktop's attached pane** (Luuk: "use our existing details
   pane"), the one Preview, the views beside the editor and the Media Manager's item use
   (`docs/developer/attached-windows.md`): docked behind a splitter with its own header, pop out and
   close, or floating grouped with the window when there is no room. A click on a row makes it the
   current one and the pane shows it; nothing covers the list. The pane's actions work on the current
   row and move to the next; Previous and Next walk the list. The overlay goes.
5. **Drag to select**, a box over rows from their empty part, or down the checkbox column, scrolling
   at the edges; a click without a drag only makes a row current.

**Reuse, not new** (Luuk: "use what is already available in Umbraco and in UmbraDesktop and don't
create something new every time"). Each piece starts from what exists, and is only built new when
nothing fits, said so in the as-built section:

- The details pane: `openAttached` with an element app, as Preview does; the pane, its header,
  splitter, pop out and floating form are the desktop's. The current row lives in the health context,
  so the list and the pane follow the same state.
- Drag to select: the Media Manager's box (`selection/box.ts`, `selection/box.element.ts`) and its
  range rule (`selection/range.ts`).
- The table: core's `umb-table`, as core's own table view uses it, where its columns and selection
  fit; UUI's table elements under it only where a group row needs them.
- The selection bar: core's collection selection bar where it can run on our state, otherwise its
  look from UUI buttons, as the Media Manager shows it.
- Cards, boxes, tabs, tags, inputs, selects: UUI (`uui-box`, `uui-tab-group`, `uui-tag`,
  `uui-input`, `uui-select`).
- Open in Media Manager: the Manager's location and `openApp`, as Show in Media Manager already does.

### 16.16 Rework as built (2026-10-29)

The five points of §16.15, built test-first and run in a real backoffice (newest Umbraco 17) on the
worktree's copy: 49 items, 29 unused (28 of them Engage's, with no size), 81 orphaned files, no
oversized image. The overview (`health-overview`), Where the space goes as a breakdown
(`health-folders`, sums in `health-folders.ts`), the list as a table (`health-list`, which replaces
`health-grid.element.ts`; the pure `health-grid.ts` stays), and the details pane (`health-details`,
which replaces `health-preview`). The current row, the list's order and a Delete being asked live in
the health context (`browse`, `setCurrent`, `step`, `act`, `confirmDelete`), so the list and the pane
read one state.

**Reuse, and where nothing fit.**

- **The pane is the desktop's attached pane, but the host had to learn one thing.** A package cannot
  call `openAttached`: its only way to attach content was `umbradesktop-open-attached`, which took a
  backoffice page's path. The event now also takes `app`, an `umbraDesktopApp` alias; the window looks
  it up among the apps the person can launch (`findApp`) and attaches its element under the same
  per-key alias, sized by its manifest, with `ownerId` and `appAlias` as props (`attached-page.ts`,
  `createAttachedAppApp`). The details pane is such an app, hidden from the launcher. Everything else
  (header, splitter, pop out, floating, docking, theming, closing with the owner) is the desktop's
  unchanged. `desktop-apps.md` §7.5 and `attached-windows.md` §9 say how; an older desktop ignores the
  request, since it has no path.
- **The box is the Media Manager's** (`selection/box.ts`, its element) **and so is the range**
  (`selection/range.ts`, for the checkbox column). Edge scrolling had nothing to reuse (the Manager's
  box does not scroll, core's collection scrolls its own way), so it is new and pure:
  `selection/edge-scroll.ts`, 32 px zones, up to 18 px a frame.
- **The table is UUI's rows and cells, not core's `umb-table`.** Core's table has no group rows, and
  selects a row when the row is clicked, where a click here only makes it current. The rows sit on a
  grid of the list's own, each row on its subgrid, so a group row's label runs across the columns. The
  first build put that grid on `uui-table`: green in the tests on UUI 2.0.2, a single 44 px column in
  the real backoffice, because the newest UUI wraps the table's slot in a `display: table` box of its
  own that a grid on the host never reaches. The grid is now a plain `role="table"` element.
- **The selection bar is core's collection bar's look from UUI** (its selected fill and contrast text,
  Clear selection, "n of m selected"): core's bar runs on a collection context and its bulk actions,
  not on this list. Optimize is `positive` on it, since a primary default button is the bar's own navy.
- **Tags are `uui-tag` in UUI's danger and positive**, the colours the health tokens take for unused
  and oversized; a hand-drawn coloured edge was tried first and looked like nothing in Umbraco.
- **Open in Media Manager** is the Manager's location and `openApp` (`showFolderInManager`).

**Choices the build made.**

- **The overview measures its own width** against `OVERVIEW_WIDE_FROM` (900) and reflects `wide` for
  the CSS, a frame late as the strips' observer is; the narrow rows draw no strip and ask for no
  thumbnail. Wide, Where the space goes names five folders (`SPACE_FOLDERS_WIDE`), narrow three.
- **A folder line opens the breakdown, never the list**; the root's share opens the library's, which
  has a line for the items at the root. **Browse all folders** opens the library. Orphaned files are
  in no folder, so the breakdown leaves them out and the library's figure is the items' alone.
- **The line of items directly in a folder opens the list on those alone**: the list query gained
  `exact`, since "the folder and everything under it" would have shown the folders below too.
- **Back returns to where the list was opened from**, the breakdown or the overview.
- **A group shows 50 rows** (`GROUP_ROWS`) and **Show n more** the rest. Step 2 left drawing to
  `content-visibility` on its rows of cards; a subgrid row was not given it, since the layout
  containment it brings may cut the row off its parent grid (not measured), so the cap does that work.
- **Drag rules**: a box from a row's empty part or the space under the rows adds what it touches; a
  press on a name starts no box and a click on it only makes the row current; a drag down the checkbox
  column ticks the range it passes, or unticks it when it started on a ticked row, which is what a
  checkbox column can offer without a key held down. A click without a drag never selects or clears.
- **The pane opens on a row click and closes when the list goes**, whatever took it away (Back, a
  check, Clean up). It is named **Details** with the info icon; no toggle button was added, since a
  click on any row opens it again. Its actions go through the context's `act`, which trashes, opens
  Optimize images, or asks the window to ask before a Delete, and moves the current row on with
  `nextAfter`.
- **The window opens at 960 by 720** (`MEDIA_HEALTH_CONTENT_SIZE`). Measured: the wide overview needs
  474 px under Umbraco, macOS, Windows 11 and Windows 98 and 502 under Umbraco 4 at 960 wide; the
  narrow one 603 to 604 at 640.
- **A test-only "ResizeObserver loop".** In the list's tests UUI 2.0.2's tab group reports it on its
  first layout (it sets its tabs' display inside its own observer). Step 2's grid had the same tab
  group and never hit it, and bisecting found nothing of the list's own, down to a list with no table.
  The browser delivers the notification a frame later; the list's and the window's tests let that one
  message pass (`allowResizeObserverLoop`), in a `before` hook since mocha sets its own `onerror` when
  the run starts.

**Measured** (a headless Chrome on the instance, real mouse input for the drags):

- Overview at 960 and 640 under all five themes: cards with Where the space goes beside them, and
  rows with the folders under them.
- The breakdown at the library and at People; a tag opened the list on 28 unused rows; Back returned
  to the breakdown, then to the overview.
- The orphaned list: 50 rows and Show more. A click on a name made the row current and the desktop
  docked the pane (320 px, the window widened to 1290 including chrome); Next moved to the next row;
  the picture was signed (`rmode=max`, 200). A box from a size cell over four rows selected four, the
  Media Manager's box drawn over them. A drag down the checkbox column held at the bottom edge ticked
  37 rows while the list scrolled to 1,566 px, then 39. No request failed.
- The pane's Delete asked in the Clean up sheet's words over the window; Cancel sent no delete. Show in
  Media Manager opened a Manager at the root with the item selected; the breakdown's Open in Media
  Manager opened one at the folder. Back from the list closed the pane.
- The list with its docked pane under all five themes.

**Not measured here**: oversized images (none over 2 MB) and an editor who is not an administrator,
as in §16.14; Move to recycle bin from the pane, since uSync writes a trashed item's config into the
checkout's TestInstance (both covered by tests); the pane floating, which is the desktop's own and
tested there.

### 16.17 After Luuk tried the rework (2026-10-29)

Luuk, trying §16.16 on the instance: the cards came side by side too soon and crowded with the folders
beside them; Clean up and Where the space goes serve different purposes; a drag started only from a
row's empty part; a click did not clear a selection; a list of thousands would draw them all; the
details pane looked thrown together, its type too small; the search field's magnifier sat badly; and
in the breakdown a folder with no folders under it opened onto one line. Also: a folder means nothing
but its icon and that it may hold items, which is why the Media Manager's tree counts any item that
holds items as a place. Decided with him, and built:

- **Cards from 760 wide, the folders under them.** `OVERVIEW_WIDE_FROM` is the overview's own width
  (724, a window of about 760: the overview sits in 18 px of padding a side); Where the space goes is
  a section of its own in UUI's box with its headline, under Clean up, and moves beside the cards only
  from `OVERVIEW_BESIDE_FROM` (1264, a window of about 1300). Measured: 640 rows, 760 and 960 cards
  with the folders under them, 1300 beside. The window opens at 960 by 728: the overview needed 726 at
  960 under all five themes.
- **Where the space goes is a tree** (`health-folders.element.ts`), expanded in place rather than
  clicked into, the way down to a place opened from the overview already expanded. A place is a
  folder or any item with items under it (`placesOf`, the Manager's `isPlace` rule), so the list, its
  filter and the overview's folders count them too. Only a place with places under it has an arrow
  (core's `uui-symbol-expand`); a click on its row opens it too. Open in Media Manager is a button on
  every row, and one at the top for the library; the path and the pages are gone.
- **A drag starts anywhere in the table** but a checkbox (the column drag) or a button: a name, a
  group row, the header, the space under the rows. **A click on empty space clears the selection**,
  as in a file manager; a click on a row never does, since rows are ticked by their checkbox, not by
  Ctrl-click, and a row click that cleared would lose them.
- **Pages of 100 rows** (`PAGE_ROWS`, `pageOf`), as core's collections page theirs, with UUI's
  pagination drawn as core's collection pagination draws it. A group going on over a page is headed
  again, its row counting the whole group, whose checkbox ticks all of it. The context's order is every
  row over every page, and the list turns to the current row's page, so the pane's Next walks on. The
  per-group Show more went.
- **The pane is laid out as core's media Info view**: on the background, the picture with the name and
  why it is listed in one `uui-box`, the facts in a second with core's own `general_general` headline
  and its general items (the label bold above the value, `space-6` between), at the default type size,
  then the actions. 380 wide (`MEDIA_HEALTH_DETAILS_SIZE`), core's side column being 350. The first
  build of this let the boxes shrink in the pane's flex column and squeezed the name out of its box;
  the boxes are `flex: none` and the pane scrolls.
- **No magnifier** in the search field; its placeholder says what it is.

Measured on the instance, under all five themes: the overview at 640, 760, 960 and 1300; the tree
opened from Engage with it expanded and Persona and Customer Journey under it; a drag from a name over
four rows selected four, one from a group row added the next two; a row click kept them and docked the
pane. Not measured here: a click on empty space (the list on this library is taller than the window,
so there is none; covered by tests) and paging (81 rows at most; covered by tests).

### 16.18 Storage by folder, and the pane's footer (2026-10-29)

Luuk, trying §16.17: in the folder view the root had no Open in Media Manager; a tag looked like part
of the row it sat on, though it does something else; "Can go" is a poor heading and "nothing" says
nothing, in small type; the library's "at least" bar over the table repeats the overview; the title
was small and "Where the space goes" not professional enough. Back floated, with no border and not
aligned. In the pane the buttons fell below a short window, and Show in Media Manager was far too
large a button. Decided with him, and built:

- **Storage by folder** is the name (Dutch **Opslag per map**), as the operating systems call such a
  view, on the overview's section and as the view's title, now a heading (`h2`, UUI's h4 size).
- **The library is the tree's root row**, with its bar, its size, its buttons for the whole library and
  its own Open in Media Manager; the places start under it. The bar and figure over the table went.
- **What can go is a button per kind**, UUI's compact secondary button in danger or positive with an
  arrow ("28 unused →"), so it reads as going somewhere; a click on a row only opens it. **The column
  has no heading, and a row with nothing to clean up has an empty cell** (Luuk: "the '28 unused'
  button already just tells the story"). "Nothing to clean up" was proposed and turned down as too
  long.
- **Open in Media Manager is an icon** at the end of every row.
- **Back has a border and a background** (`look="outline"`) in the folder view and the list, as the
  buttons beside it.
- **The pane's actions are a footer** at the foot of the pane, on the surface with a border above, and
  only the boxes above it scroll: measured in a 520-tall window, the footer's bottom is the pane's.
  The kind's action sits in a grid of equal columns, so **Keep…** (step 3) joins it side by side
  without moving anything; the list's selection bar already has room for it.
- **Show in Media Manager is an icon** on the picture's corner.
- **The end of the list** says **Nothing left in this list.** when the last row went, instead of the
  "select a row" the pane shows before one is chosen. (Asked: the pane's action moves on to the next
  row, or to the one before at the end, as §16.15 decided.)

Measured on the instance under all five themes: Storage by folder with Engage open, and the list with
its pane in a 960 by 520 window, the footer in view.

### 16.19 Step 3 as built: Keep (2026-10-29)

§16.6 built test-first on the reworked screens of §16.15 to §16.18, so where the plan's Tasks 3.1 to
3.4 say grid, chip or preview, it is the list, a tab and the details pane.

**Server** (`Health/Keep/`). A keep is a row of its own table, `umbraDesktopMediaHealthKeep`
(migration `Keeps` for SQL Server and SQLite), not tied to a check: kind (the list it was kept from),
target (the item's key, or the orphaned file's path), fingerprint, note (500, `MediaKeepStore.NoteLength`,
pinned by a C# and a TypeScript test), until, who and when. `MediaKeepStore` keeps, lists, stops and
gives the orphaned files kept now. Routes on the controller: `GET keeps`, `POST keeps`, `POST
keeps/stop`, under the Media section like the rest; who comes from the login, never the request; a
longer note, or a kind or duration it does not know, is a 400.

**Choices the build made.**

- **Pruned inside `MediaHealthStore.FinishAsync`**, in the same unit of work as the result it checks
  against, not in the runner as the plan had it: no read can see a keep of something the stored result
  no longer has.
- **The delete skips kept files in the controller**, before the deleter sees the list, with the reason
  `Kept`; the deleter's constructor is unchanged. Done and the list's notice name the reason ("someone
  keeps it").
- **One keep per thing, replaced by keeping again**, whatever list (plan Decision 6). Keep… over a
  selection from two lists sends one request per list, so Kept can say which.
- **The fingerprint** is an item's URL, or an orphaned file's last-written time in round-trip form.
  The end is worked out when read (Decision 7): `Expired` once the time is up, `Changed` once the last
  check has another fingerprint.
- **In the browser** (`health-keep.ts`, pure): `keepingOf` takes kept things out of every list, makes
  an entry per keep that holds for the Kept tab, puts each ended keep on its row, and counts per list
  what keeps took out. The context's result keeps the orphaned files whole (`orphans`), since the
  lists now leave kept ones out and the library's size must not shrink by a keep.
- **Keep… is asked by the window**, as a Delete is: the list and the pane only name the rows
  (`askKeep`), since the pane is not inside the window. `health-keep-sheet` has the Clean up sheet's
  frame, UUI's textarea and radio group, a year chosen, and a line that says the thing comes back when
  the time is up, or for Always, that it stays out until someone stops keeping it.
- **Kept is the fourth tab**, grouped by folder and sorted like the others, with **Kept until** (the
  date, or Always) in the last column and **Stop keeping** as its one verb. The plan's "ends soonest
  first" was not built: the table's own sort already orders it, and one sort rule per table is simpler.
- **Every other tab offers Keep…** in its selection bar, beside the verb, for anyone, an orphaned file
  too: a non-administrator who may not delete may still say a file is wanted.
- **An ended keep is a tag on its row**, UUI's secondary `uui-tag`, "Kept until 27 Oct 2027", or
  "Kept" for one that was Always, with the note as its title. The pane shows the old keep in its own
  box and says "but the file changed since" when that is why it ended.
- **The pane** shows a kept row's note, who kept it and when, and until when, in a **Kept** box above
  **General**; its footer is **Stop keeping** alone. Otherwise the footer's grid holds the action and
  **Keep…** side by side, as §16.18 left room for.
- **The overview** says "n kept" after a card's line, for every kind, not only unused.
- **Review Focus 5**: the window reads the keeps again before the Clean up sheet opens, so a keep made
  since it loaded is left out of the sheet and of the trash; the server's delete skips a kept file
  whatever the window sent. A failed read of the keeps shows the result without them rather than none.

**Found on the run, both fixed with a test first.**

- **Core's management swagger answered 500**, since step 1: the `[ProducesResponseType(403)]` on
  `DeleteOrphans` is added a second time by core's security filter, a duplicate key. The plan said to
  check it in Task 3.1; it was the one already there. Removed, and a test now holds that no action of
  the controller declares 403.
- **A row reused for another entry never got its thumbnail.** Lit keeps the table's row elements when
  the tab or the page changes, and the list observed each element once, so the Kept tab's orphaned
  file showed a blank tile. The list now remembers which entry it observed each row for. This was in
  step 2 already for any tab change; Kept made it visible.

**Measured** on a copy of the step 2 instance's database (`UmbraDesktop-MH141Keep`, port 23901), with
an administrator and an editor made for the run with only the Media and Desktop sections:

- The editor kept an unused item with a note for a year, and an orphaned file for always, from the
  list's bar and the sheet. The server listed both with the editor's name.
- The administrator's window, open from before, still listed the item until Clean up was pressed; the
  sheet then read the keeps again and counted 27 unused instead of 28.
- The administrator's delete of the kept file answered `Kept` and the file stayed on disk; the
  editor's delete answered 403.
- The overview said "1 kept" on the unused and orphaned cards, and **Clean up** left the kept file out
  (4.7 MB, 80 files).
- Kept listed both with "Always" and the date; the pane showed the note, "Kim Editor on Oct 29, 2026"
  and the end, with **Stop keeping**.
- After the kept file's last-written time was moved and a check run, its keep was `Changed`, the
  file was back among the orphaned files with its tag and the note as the tag's title, and the pane
  said "Always, but the file changed since".
- **Stop keeping** from the pane put the item back among the unused at once; the server had one keep
  left.
- Under all five themes: the overview, the Kept tab with its pane, the Keep sheet, and a row with an
  ended keep.

**Not measured here**: a keep running out (a year; covered by the store's tests with a fake clock); an
item's own file changing (only an orphaned file's was changed; covered by the store's tests); a real
Clean up with a keep in it (the trash would make uSync write configs into the checkout; the sheet's
count and the tests cover it); the Dutch words on screen.
