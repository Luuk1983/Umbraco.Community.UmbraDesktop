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
