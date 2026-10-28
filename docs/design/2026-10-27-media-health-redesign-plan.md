# Media Health redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking. **Luuk's rule overrides the skills: never commit, push or open a PR unless he
> asks in that message.** Every task ends with the work left uncommitted.

**Goal:** Rebuild the Media Health app (#141) as designed on 2026-10-27: an overview cut by health
with one Clean up, a grid with a fast preview, and Keep with a note and an end date. Review (One by
one) is dropped: the preview's arrows and buttons already go through a list one item at a time
(Decision 11).

**Architecture:** The engine of §15 stays: one server pass writes the last check to the add-on's own
tables, and the browser sums. The server gains a few facts per item (URL, dimensions, last change),
the media count, and a Keep table with its routes. The window is split from one 718-line element
into one element per screen, each fed by pure model functions that carry all the arithmetic, so the
tests that matter run without rendering.

**Tech Stack:** C# / EF Core 9 (SQL Server and SQLite migration sets), xUnit + NSubstitute + in-memory
SQLite; TypeScript, Lit, `@umbraco-cms/backoffice` 17.6.0, UUI 2.0.2, web-test-runner in Chrome.

**Spec:** [`2026-10-26-media-health-design.md`](2026-10-26-media-health-design.md) §16 (redesign) on
§15 (the engine); the mock is [`mockups/media-health/redesign.html`](mockups/media-health/redesign.html),
scenes 0 to 9. Read both before any task.

## What exists, checked 2026-10-27

- **Server** (`src/Umbraco.Community.UmbraDesktop.Media/Health/`): `UmbracoMediaLibraryReader`,
  `MediaUsageClassifier`, `MediaFilePaths`, `MediaDiskScanner`, `MediaOrphanDeleter`,
  `MediaHealthStore`, `MediaHealthRunner`, `Api/MediaHealthController.cs` (routes `status`, `check`,
  `items`, `folders`, `orphans`, `orphans/delete`), `Data/` with `InitialCreate` per provider and
  design-time factories in `Data/MediaHealthDatabase.cs`. Tests in `...Media.Tests/Health/`; 
  `MigrationsTests` checks only SQLite for pending model changes.
- **Window** (`backoffice/src/health/`): `health.client.ts` (one module for every route),
  `health-model.ts` (pure sums; `OVERSIZED_BYTES` = 2 MB and `OPTIMIZE_SAVING_RATIO` = 0.75 live
  here, so the oversized list is decided in the browser, not on the server), `media-health.context.ts`
  (follows a check, holds the result, trashes through the Manager), `media-health.element.ts` (718
  lines, all screens).
- **Trash** goes through `UmbraDesktopMediaManagerContext.trash(refs)`, which has undo and a Transfers
  row. `#trashThroughManager` reads refs **one request per key**; `api.items(uniques)` already does it
  in one, and Clean up of 733 items must use that.
- **Undo** is already there: `context.restore(refs, target)` calls core's
  `PUT /recycle-bin/media/{id}/restore` with `{ target }`, and `undo/inverse.ts`'s
  `undoOf({ kind: 'trash', items })` groups refs by their `parent` into restore actions. At the
  floor (`release-17.6.0`, `RestoreMediaRecycleBinController`) a null target is the **root**, not the
  original folder, so Undo must pass each ref's own parent, which `undoOf` does. Core also has
  `GET recycle-bin/media/{id}/original-parent`; not needed, since Clean up knows each item's parent.
- **Manager location** (`manager/location.ts`): `folder=<key|root|bin>&view=<alias>`, opened with
  `openApp(UMBRADESKTOP_MEDIA_MANAGER_APP, { location })`. `manager.element.ts` reads it once
  (`#placed`) and already has `#selectWhenShown(keys)`, which retries until core's collection shows
  the keys and selects and scrolls to them.
- **Media count**: `IMediaService.CountNotTrashed(string? contentTypeAlias)` exists at the floor.
- **Admin**: the element already reads `UMB_CURRENT_USER_CONTEXT`'s `isAdmin`.
- **Optimize images**: `OPTIMIZE_SERVICE_CONTEXT.optimizeMedia({ items, title })` resolves with the
  report when the run ends, and gives no progress to the caller. The run itself knows it: Services.Media's
  `OptimizeRunStore.observe(id)` feeds the Optimize window, which already reports "n of m" to the
  taskbar and its title bar. Task 1.3a passes that on to the caller.
- **Window progress for the check** exists since step 1: `media-health.element.ts` reports the task
  `check` (`umbradesktop-app-progress`, `docs/developer/window-progress.md`) with the real count
  during the library pass. The rebuild must keep it, and adds Clean up as a second task.

## Decisions this plan makes

Where §16 leaves a choice, or where the code above forces one. Each is written into design §16 as
§16.9 during step 1 (Task 1.7).

1. **Item facts in one migration.** `Url`, `Width`, `Height` and `UpdatedUtc` are added to the item
   row together in step 1 (`ItemFacts`), since the reader reads them in the same pass for free and
   the preview (step 2) shows the last three. One migration rather than three.
2. **An item's URL is its first owned path as stored** (`/media/abc123/photo.jpg`), the same string
   core serves. It is also the keep fingerprint for items (§16.6). It is never sent to the resizer
   unsigned: a site with an HMAC secret refuses that (found in the step 1 run). Items' thumbnails and
   previews come signed from core's `imaging/resize/urls` by key; orphaned files' from the add-on's
   `orphans/thumbnails`, which signs only the last check's orphaned files (§16.7, Luuk 2026-10-28).
3. **Health colour per item, one each**: unused before oversized before fine. An unused image over
   2 MB is in Unused only, since it goes to the bin and optimizing it is wasted. Orphans are their own
   segment and belong to no folder, so Where the space goes covers items only.
4. **The oversized segment and row show the images' size; the freed figures use the estimate.**
   "5.8 GB can be freed" and **Clean up** add unused + orphaned + `estimateSaving(oversized)`, said as
   "about" when the oversized row is ticked. Optimizing does not free the whole image.
5. **Keeps are filtered in the browser.** The server stores and returns keeps with their state; the
   browser takes kept things out of the lists, since the oversized list is decided there and one rule
   belongs in one place. The one server-side exclusion is the orphan delete, which skips a file with
   an active keep (`Kept`), because a colleague may have kept it after this window loaded.
6. **A keep applies to every list** (Luuk, 2026-10-27: "you obviously want to keep it, so keep
   it"). One keep per item or file; keeping again replaces it. The list it was kept from is stored
   only to show it in Kept ("unused", "oversized").
7. **Ended keeps** (time passed, or the file changed since the keep) are computed when read, not
   stored. They show as the badge while the thing is in its list. The server deletes a keep only when
   its target is gone from the library at a check, or on Stop keeping.
8. **Show in Media Manager selects only what core's first page shows.** The location gains
   `select=<key>`; the Manager selects through `#selectWhenShown`. An item past the first page opens
   its folder unselected, which §16.5 allows; paging to it is a follow-up.
9. **Optimize images reports progress to whoever started it** (Luuk, 2026-10-27), so the Done
   screen's card reads "38 of 214 done" (Task 1.3a).
10. **Only what is on screen is drawn** through `content-visibility: auto` on each group's rows, with
    `contain-intrinsic-size` from the same thumbnail constant the resizer URL uses. No virtual
    scroller.
11. **No Review, no One by one** (Luuk, 2026-10-27, replacing §16.5's Review and §16.8's step 4).
    The grid is the overview you check, and the preview is the one-by-one: its arrows step through
    the grid, it shows the facts that decide (last change included), and its buttons act on the item
    and move on to the next. Selecting in the grid and pressing one verb covers the many; the
    countdown, tally and Skip of scene 7 were the only extras, not worth a second way to do the same
    thing. The grid has no Grid / One by one switch.

## Global Constraints

- Build and test against the floor: `@umbraco-cms/backoffice` 17.6.0, UUI 2.0.2; read core at
  `release-17.6.0`.
- Tests first, watched red, then green. C#: `dotnet test src/Umbraco.Community.UmbraDesktop.Media.Tests/Umbraco.Community.UmbraDesktop.Media.Tests.csproj`.
  Frontend, from `src/Umbraco.Community.UmbraDesktop.Media`: `npm test` **and** `npm run build`, both,
  every task. Never pass `--concurrency`.
- JSDoc on every TypeScript member, XML docs on every C# member, private ones included; say why.
- C#: records and primary constructors (entities stay classes, as `MediaHealthEntities.cs` explains),
  `var`.
- Derive numbers: a size used in CSS and a URL or a sum (thumbnail edge, preview width step, ring
  size) is one exported constant both read.
- `[ProducesResponseType(403)]` on a management API action 500s core's swagger (step 2 session's
  finding); do not add new ones. The existing one on `DeleteOrphans` is checked in Task 3.1.
- Stored times come back `DateTime.SpecifyKind(..., Utc)` (§15).
- Never show or rely on a keyboard shortcut (§16.5). Every action is a visible control.
- No edit view and no Image Editor anywhere in Media Health (§16.5).
- UI words in `backoffice/src/localization/en.ts` and `nl.ts`; `parity.test.ts` keeps them paired.
  Sentence case, no uppercase eyebrow headings.
- A theme may restyle, never remove: check each new screen under all five themes.
- Never commit.

## Review Focus

1. **An item without a file** (Engage's 28 images: no `umbracoBytes`, no extension, no URL). It
   must show an icon, not a broken thumbnail, and count as 0 B everywhere. Test in Tasks 1.4 and 2.1.
2. **A non-administrator presses Clean up.** The orphan row is unticked and disabled with the reason,
   the sheet says so, and nothing is sent to `orphans/delete`. Test in Task 1.4.
3. **Clean up partly fails** (core refuses a trash, a file is now owned). Done shows what went, not
   what was asked; Undo restores only what went. Test in Task 1.3.
4. **The second provider.** A migration added for SQLite only leaves SQL Server sites without the
   table. Task 1.1 adds a SQL Server pending-model-changes test.
5. **A keep made by someone else after the window loaded.** Delete skips that orphan as `Kept`;
   trash cannot check, so the window refreshes keeps before Clean up opens its sheet. Tests in Tasks
   3.1 and 3.3.

---

## Step 1: Overview rebuild (§16.2, §16.3)

Scenes 0, 1, 3, 4, 4b. One session.

### Task 1.1: Item facts and the media count on the server

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop.Media/Health/MediaHealthModels.cs` (`MediaHealthItem`,
  `MediaHealthStatus`)
- Modify: `Health/UmbracoMediaLibraryReader.cs`, `Health/Data/MediaHealthEntities.cs`,
  `Health/Data/MediaHealthDbContext.cs`, `Health/MediaHealthStore.cs`,
  `Health/Api/MediaHealthApiModels.cs`, `Health/Api/MediaHealthController.cs`,
  `Health/Composing/MediaHealthComposer.cs`
- Create: `Health/Data/Migrations/SqlServer/<stamp>_ItemFacts.cs` (+ Designer, snapshot updated),
  `Health/Data/Migrations/Sqlite/<stamp>_ItemFacts.cs` (+ Designer, snapshot updated)
- Create: `Health/IMediaCounter.cs`
- Test: `...Media.Tests/Health/UmbracoMediaLibraryReaderTests.cs`, `MediaHealthStoreTests.cs`,
  `MediaHealthControllerTests.cs`, `MigrationsTests.cs`

**Interfaces:**
- Produces: `MediaHealthItem(Guid Key, string Name, string MediaTypeAlias, string? Extension, long? SizeBytes, Guid? ParentKey, string Path, int UsageCount, string? Url, int? Width, int? Height, DateTime UpdatedUtc)`;
  `IMediaCounter.Count(): int` (items not trashed, folders excluded);
  status response gains `MediaCount: int`; item response gains `Url`, `Width`, `Height`, `UpdatedUtc`.

- [ ] **Step 1: Write the failing tests**
  - Reader: `Gives_each_item_its_first_owned_path_as_url` — an item with an Upload field
    `/media/a1/photo.jpg` and an Image Cropper `{"src":"/media/b2/x.png"}` in that property order
    gets `Url == "/media/a1/photo.jpg"`; an item with no file gets `Url == null`.
  - Reader: `Reads_width_height_and_last_change` — `umbracoWidth` "5472", `umbracoHeight` "3648"
    give 5472 and 3648; missing or not a number gives null; `UpdatedUtc == media.UpdateDate` as UTC.
  - Store: `Round_trips_the_item_facts` — finish a check with those facts, `GetItemsAsync` returns
    them, `UpdatedUtc.Kind == DateTimeKind.Utc`, a 2,001-character URL is cut to 2,000.
  - Controller: `Status_carries_the_media_count` — `IMediaCounter` substitute returning 18240 gives
    `MediaCount == 18240` on both `status` and `check`.
  - Migrations: `SqlServer_model_has_nothing_pending` — build `SqlServerMediaHealthDbContextFactory`'s
    context and assert `HasPendingModelChanges()` is false (no connection opens).
- [ ] **Step 2: Run and watch them fail** (compile errors count as red).
- [ ] **Step 3: Implement.** Columns `Url` (max 2000, null), `Width`/`Height` (int, null),
  `UpdatedUtc` (datetime). Reader uses `Constants.Conventions.Media.Width`/`Height` through the
  existing `TextOf`. `UmbracoMediaCounter(IMediaService)`: `CountNotTrashed() - CountNotTrashed(Constants.Conventions.MediaTypes.Folder)`,
  registered as a singleton. The count is read on every `status`, which is two `COUNT` queries; the
  poll asks every two seconds only while a check runs (§15), so that is acceptable.
- [ ] **Step 4: Add the migrations**, from `src/Umbraco.Community.UmbraDesktop.Media`:
  ```bash
  dotnet ef migrations add ItemFacts --context SqlServerMediaHealthDbContext --output-dir Health/Data/Migrations/SqlServer
  dotnet ef migrations add ItemFacts --context SqliteMediaHealthDbContext --output-dir Health/Data/Migrations/Sqlite
  ```
- [ ] **Step 5: Run the C# tests; all pass**, the 49 existing ones too.

### Task 1.2: Client and model for the overview

**Files:**
- Modify: `backoffice/src/health/health.client.ts` (+ `.test.ts`)
- Modify: `backoffice/src/health/health-model.ts` (+ `.test.ts`)
- Create: `backoffice/src/health/health-media.ts` (+ `.test.ts`): URLs for thumbnails and preview

**Interfaces:**
- Consumes: Task 1.1's response fields.
- Produces:
  - `HealthItem` gains `url: string | null; width: number | null; height: number | null; updatedUtc: string`;
    `HealthStatus` gains `mediaCount: number`.
  - `type HealthKind = 'unused' | 'orphaned' | 'oversized'`.
  - `healthOf(item: HealthItem): HealthKind | 'fine'`, unused before oversized (Decision 3).
  - `listsOf(items: HealthItem[], orphans: HealthOrphan[]): { unused: HealthItem[]; orphaned: HealthOrphan[]; oversized: HealthItem[] }`,
    each largest first; `oversized` excludes unused items. Replaces `unusedOf`/`oversizedOf` callers.
  - `barOf(lists, libraryBytes: number): HealthBar` with
    `HealthBar = { unused: number; orphaned: number; oversized: number; fine: number; freeable: number }`,
    bytes; `fine = libraryBytes - unused - oversized`; `freeable = unused + orphaned + estimateSaving(oversized)`.
  - `cleanupOf(lists, ticked: ReadonlySet<HealthKind>, admin: boolean): HealthCleanup` with
    `HealthCleanup = { rows: Array<{ kind: HealthKind; count: number; bytes: number; estimate: boolean }>; bytes: number }`;
    `orphaned` dropped when `!admin`.
  - `foldersOf(items: HealthItem[], top = SPACE_FOLDERS): { folders: HealthFolderShare[]; more: number }`
    with `HealthFolderShare = { name: string; key: string | null; bytes: number; unused: number; oversized: number }`,
    by top-level folder, largest first; `SPACE_FOLDERS = 3`. `topFoldersOf` and `TOP_FOLDERS` go.
  - `health-media.ts`: `THUMB_EDGE = 120` (CSS px), `thumbUrl(url: string | null, dpr: number): string | null`
    → `${url}?width=${THUMB_EDGE*dpr}&height=${THUMB_EDGE*dpr}&rmode=crop`, null for no URL or a
    non-image extension; `PREVIEW_STEP = 400`, `previewUrl(url, cssWidth, dpr)` → width rounded **up**
    to a multiple of `PREVIEW_STEP` so the resizer's cache is reused; `isPreviewable(nameOrUrl)`
    (image extensions from `health-model.ts`'s set, never SVG).

- [ ] **Step 1: Write the failing tests.** Exact values:
  - `healthOf`: unused 3 MB jpg → `'unused'`; used 3 MB jpg → `'oversized'`; used 2 MB exactly →
    `'fine'` (over, not at); used 3 MB pdf → `'fine'`.
  - `barOf` on unused 500, orphans 30 + 10, used 3 MB jpg, library 3 MB + 1450:
    `{ unused: 500+900, orphaned: 40, oversized: 3 MB, fine: 50, freeable: 1440 + round(3 MB × 0.75) }`.
  - `cleanupOf` with all ticked and `admin: false` has no orphaned row and does not count its 40 bytes.
  - `foldersOf` with four top folders returns three and `more: 1`; an item at `/` counts under a
    share with `key: null`.
  - `thumbUrl('/media/a/x.jpg', 2)` → `'/media/a/x.jpg?width=240&height=240&rmode=crop'`;
    `thumbUrl(null, 1)` and `thumbUrl('/media/a/x.svg', 1)` → `null`;
    `previewUrl('/media/a/x.jpg', 700, 2)` → `?width=1600`.
  - **As built (step 1):** no URL is built in the browser, since unsigned resizer URLs fail (Decision
    2). `health-media.ts` exports `thumbEdge(dpr)`, `previewWidth(cssWidth, dpr)` and
    `isPreviewable(nameOrUrl)`; the context's `thumbnails(subjects, edge)` signs through core for items
    and `orphans/thumbnails` for orphaned files, and caches.
  - Client: `status()` passes `mediaCount` through; items carry the four new fields.
- [ ] **Step 2: Watch them fail.** `npm test`.
- [ ] **Step 3: Implement** the signatures above.
- [ ] **Step 4: `npm test` and `npm run build` pass.**

### Task 1.3a: Optimize images tells the caller how far it is

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop.Services.Media/backoffice/src/optimize/types.ts`
  (`OptimizeMediaRequest`), `context/media.context.ts` (`optimizeMedia`) (+ `media.context.test.ts`)
- Modify: `src/Umbraco.Community.UmbraDesktop.Media/backoffice/src/shared/optimize-service.ts` (the
  copied request type)
- Modify: `src/Umbraco.Community.UmbraDesktop.Services.Media/docs/developer/optimizing-images.md`

**Interfaces:**
- Produces: `OptimizeMediaRequest.onProgress?: (progress: { completed: number; total: number }) => void`,
  called whenever the count changes while the run runs. `completed` and `total` are counted exactly
  as the Optimize window counts them for the taskbar (images not skipped; processed statuses), from
  one exported function both use, so the card and the taskbar can never disagree.

- [ ] **Step 1: Failing tests:** with a run of three images, one skipped, `onProgress` is called with
  `{ completed: 0, total: 2 }`, then `1/2`, then `2/2`, never twice with the same value; a request
  without `onProgress` behaves as today; the Optimize window's reported `completed`/`total` come from
  the same function (move `#images` and `PROCESSED` out of `optimize-window.element.ts` into
  `optimize/progress.ts` as `progressOf(run): { completed: number; total: number }`).
- [ ] **Step 2: Watch them fail. Step 3: Implement** by observing `optimizeRuns.observe(id)` in
  `optimizeMedia` until the report resolves. **Step 4:** `npm test` and `npm run build` in
  Services.Media and in the Media add-on.
- [ ] **Step 5:** the developer page gets `onProgress` in its request table, one sentence.

### Task 1.3: Context: count, Clean up, Undo

**Files:**
- Modify: `backoffice/src/health/media-health.context.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `listsOf`, `cleanupOf` (Task 1.2); `UmbraDesktopMediaManagerContext.api.items`,
  `.trash`, `.restore`; `undoOf` from `undo/inverse.ts`; `OPTIMIZE_SERVICE_CONTEXT`.
- Produces:
  - State gains `mediaCount: number | undefined` (from every status read) and
    `cleanup: UmbraDesktopMediaHealthCleanupState | undefined`.
  - `UmbraDesktopMediaHealthResult` keeps `checkedAt`, `items`, and gains
    `lists: { unused; orphaned; oversized }` and `bar: HealthBar`; `library`, `segments`, `unused`,
    `orphaned`, `oversized` go.
  - `cleanUp(kinds: ReadonlySet<HealthKind>): Promise<UmbraDesktopMediaHealthCleanupState>` where
    `UmbraDesktopMediaHealthCleanupState = { phase: 'running' | 'done'; done: number; total: number; freedBytes: number; beforeBytes: number; afterBytes: number; trashed: UmbraDesktopMediaRef[]; deleted: number; skipped: Array<{ relativePath: string; reason: string }>; failed: string[]; optimizing: { completed: number; total: number } | undefined }`.
    `done`/`total` count trashed items and deleted files as they go, for the window's progress.
    Order: trash unused, delete orphaned, then open Optimize images for oversized with `onProgress`
    (Task 1.3a) writing `optimizing`, and do **not** await its report before `done` (its `resized`
    still applies when it resolves; `optimizing` turns undefined then).
  - `undoCleanup(): Promise<{ failed: string[] }>`: runs `undoOf({ kind: 'trash', items: trashed })`
    through `manager.restore(items, target)`, puts restored items back in the result, clears
    `trashed`.
  - `dismissCleanup(): void` returns to the overview.
  - `#trashThroughManager` reads refs with one `manager.api.items(keys)` call.

- [ ] **Step 1: Write the failing tests:**
  - `Reads refs in one call`: trashing 3 keys calls `api.items` once with all 3 and `api.item` never.
  - `Clean up runs only the ticked kinds`: with `{'unused'}` only, `deleteOrphans` and
    `optimizeMedia` are not called.
  - `Done reports what went, not what was asked`: trash fails one of two (`failed: ['b']`), delete
    skips one as `NowOwned`; `freedBytes` counts only the trashed item and the deleted file;
    `trashed` holds one ref.
  - `Undo restores each item to its own folder`: two refs with parents `f1` and `null` give two
    `restore` calls, `(…, 'f1')` and `(…, null)`; the items are back in `lists.unused`.
  - `Done does not wait for Optimize images`: with an `optimizeMedia` that never resolves, `cleanUp`
    resolves; after the stub calls `onProgress({ completed: 38, total: 214 })`, `optimizing` is
    exactly that.
  - `Status carries the media count`: `sync()` with `mediaCount: 18240` sets it even when there is
    no check yet.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement.** Keep the existing polling, `sync`, `check` and `resized` as they are.
- [ ] **Step 4: `npm test`, `npm run build` pass.**

### Task 1.4: The screens

**Files:**
- Modify: `backoffice/src/health/media-health.element.ts` (+ `.test.ts`): becomes the screen switch
  only (start, checking, overview, sheet, done; step 2 adds grid)
- Create, each with a `.test.ts`:
  - `health-ring.element.ts`: the ring, dashed when empty, filled by `fraction`; `RING_SIZE` and
    `RING_STROKE` exported, the SVG's viewBox and the CSS read them
  - `health-start.element.ts`: scene 0 (no check yet) and scene 3 (checking: ring with real
    progress, the three steps ticking; no streamed thumbnails, §16.3)
  - `health-overview.element.ts`: scene 1 (library line, **Check again**, the bar, three rows with
    checkboxes and thumbnail strips, **Clean up**, Where the space goes)
  - `health-cleanup-sheet.element.ts`: scene 4, over the overview
  - `health-done.element.ts`: scene 4b
- Modify: `backoffice/src/health/health-app.ts`: `MEDIA_HEALTH_CONTENT_SIZE` re-measured for the
  new overview (Step 5)
- Modify: `backoffice/src/localization/en.ts`, `nl.ts`: new words; drop `healthReview`,
  `healthComingLater` and anything else no longer rendered

**Interfaces:**
- Consumes: Task 1.3's context; `thumbUrl` (Task 1.2).
- Produces: events the switch handles, all `bubbles: true, composed: true`:
  `health-open-grid` `{ kind?: HealthKind; folderKey?: string | null }` (step 2 listens; in step 1
  nothing opens and the chevrons and folder rows are not drawn yet, rather than drawn dead),
  `health-cleanup` `{ kinds: HealthKind[] }`.

- [ ] **Step 1: Write the failing tests** (render with a stub context, as the current element test
  does):
  - No check: the button **Check my media library** is present and the count line reads the
    `mediaCount` formatted in the backoffice culture.
  - Checking: ring `fraction` = scanned / total in the Usage phase; step two and three unticked;
    Disk phase ticks step one and two; total 0 shows the ring indeterminate, not 0%.
  - Overview: three rows, all ticked; the Clean up label's figure equals `cleanupOf(...).bytes`
    formatted; unticking Unused lowers it by exactly that row's bytes.
  - Overview, `isAdmin: false`: the Orphaned checkbox is unticked and disabled and the row says why.
  - Row strip: an item with `url: null` renders an icon, not an `<img>` (Review Focus 1).
  - **Check again** is a `uui-button`, not a link.
  - Sheet: lists only ticked rows; with a non-admin it carries the admin line; Cancel fires nothing.
  - Done: shows `freedBytes`, before and after; **Undo** calls `undoCleanup`; the Optimize card
    shows only while `optimizing` is set, reads "38 of 214 done", and **Show** focuses the Optimize
    window through `findDesktopWindows`.
  - Window progress: while checking, the element dispatches `umbradesktop-app-progress` for task
    `check` with `completed`/`total` from the server's count (activity when total is 0), and `done`
    after; while Clean up runs it reports task `cleanup` with `done`/`total`, and `failed` when
    anything failed. The existing step 1 test for `check` stays and passes.
  - No rendered text in any screen contains a key name (`/\b(Space|Enter|Esc|Ctrl|⌘)\b/`).
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement.** Bar and row colours are four tokens declared once on `:host` of
  `media-health.element.ts` (`--umbradesktop-health-unused`, `-orphaned`, `-oversized`, `-fine`) from
  UUI colour variables, so all five themes restyle them; each child reads them.
- [ ] **Step 4: `npm test`, `npm run build` pass.**
- [ ] **Step 5: Measure the window.** In the real backoffice (Task 1.6), with three rows and three
  folders, read the overview's `scrollHeight` under the Umbraco theme and the tallest theme; set
  `MEDIA_HEALTH_CONTENT_SIZE` from that, not from the mock, and write the measured numbers in its
  JSDoc.

### Task 1.5: The disabled primary button, as a theme bug

**Files:**
- Create: `src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/theme/disabled-buttons.test.ts`
- Modify: whichever theme's palette or window sheet the test convicts, under
  `theme/themes/<id>/`, or `theme/palette-css.ts` when it is every theme

- [ ] **Step 1: Write the failing test.** For each entry of `UMBRADESKTOP_THEMES`, mount a window
  with `mount-themed.ts` and render `<uui-button look="primary">` beside the same with `disabled`
  inside its content; assert the two differ in computed `background-color` **or** `opacity` by a
  visible amount (the contrast helper in `theme/contrast.ts`, ratio ≥ 1.5 between the two fills, or
  opacity ≤ 0.6). Read the mounting rules in `mount-themed.ts` first (one mount per file, timeout in
  each test body).
- [ ] **Step 2: Run** (`npm test` in `src/Umbraco.Community.UmbraDesktop`). It fails for the theme
  Luuk saw (step 1 had Review greyed in code but pressable-looking). If it passes everywhere, the
  bug is in the backoffice theme under the desktop theme: add the backoffice light and dark variants
  from `backoffice-themes.ts` to the loop and run again.
- [ ] **Step 3: Fix with a token**, never by restyling the button in Media Health: the convicted
  theme sets `--uui-color-disabled` / `--uui-color-disabled-contrast` (or its own disabled rule)
  so a disabled primary reads as disabled. Every theme keeps the affordance.
- [ ] **Step 4: Both test runs and both builds pass** (host and Media add-on).

### Task 1.6: Verify in a real backoffice

- [ ] Use the running-umbraco-instances skill and the worktree recipe (memory: DB copy per task,
  `npm run build` before `dotnet build`, revert the TestInstance lock-file bump). Do not touch an
  instance someone else started on port 23822; start your own, on `<task>.localhost:<port>`.
- [ ] Headless Chrome via the repo's puppeteer-core (hidden Browser pane never renders the
  backoffice). Script: open Media Health on a fresh DB → scene 0 shows the media count; press
  **Check my media library** → ring fills, steps tick, and the taskbar button and title bar show the
  same count; overview numbers equal §15's measured run
  (48 items, 28 unused, 82 orphans on the copied DB); thumbnails load from the resizer (network shows
  `?width=` requests, none for the 28 Engage items); **Clean up** as admin → Done shows the freed
  size, the items are in core's recycle bin; **Undo** → each is back in its own folder (check two
  items from different folders in the Media section); repeat as a non-admin editor with the Media
  section: orphan row disabled, nothing deleted.
- [ ] Screenshot scenes 0, 1, 4, 4b under all five themes; check the disabled Clean up (nothing
  ticked) reads as disabled in each.

### Task 1.7: Docs for step 1

- [ ] `src/Umbraco.Community.UmbraDesktop.Media/docs/user/media-health.md`: rewrite for the
  overview, Clean up and Undo, following `docs/developer/writing-documentation.md` (goal first, UI
  labels in bold from `en.ts`). Say what each row does to things and that the result is a snapshot.
- [ ] Design doc: add §16.9 "As planned" with the eleven Decisions above, and §16.10 "Step 1 as built"
  with what the real run measured.
- [ ] Marketplace: `umbraco-marketplace-umbraco.community.umbradesktop.media.json` gets a Media
  Health screenshot (scene 1, captured at the size it should show) in `Screenshots`; tags exist.
  README: no change.

---

## Step 2: The grid and the preview (§16.4, §16.5 without Review)

Scenes 5 and 6. One session, after step 1.

### Task 2.1: Grid model

**Files:**
- Create: `backoffice/src/health/health-grid.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `listsOf`, `HealthKind` (Task 1.2).
- Produces:
  - `type HealthEntry = { id: string; kind: HealthKind; name: string; bytes: number; url: string | null; folderKey: string | null; folderPath: string; item?: HealthItem; orphan?: HealthOrphan }`;
    `id` is the item key, or `orphan:<relativePath>`. Orphans group by the directory of their
    relative path, labelled with it.
  - `type HealthChip = HealthKind | 'kept'` (`'kept'` is empty until step 3).
  - `type HealthSort = 'largest' | 'smallest' | 'name'`.
  - `gridOf(entries: HealthEntry[], query: { chip: HealthChip; folderKey?: string | null; search: string; sort: HealthSort }): HealthGroup[]`
    with `HealthGroup = { key: string; label: string; entries: HealthEntry[]; bytes: number }`,
    groups largest first, entries sorted within. A `folderKey` filter includes the folder's
    descendants (match on the folder's path prefix from the folders list).
  - `HealthSelection` (pure, immutable): `toggle(id)`, `toggleGroup(group)`, `groupState(group): 'all' | 'some' | 'none'`,
    `bytes(entries)`, `ids`.
  - `GROUP_PREVIEW_ROWS = 1` rows shown before "+N more".

- [ ] **Step 1: Failing tests:** groups are largest first; search is case-insensitive on name;
  `folderKey` of `/Products` includes `/Products/Archive`; `toggleGroup` on a group in state
  `'some'` selects all; `bytes` sums only selected; an orphan `2/y.png` groups under `2`; a
  `HealthEntry` built from an Engage item has `url: null` and `bytes: 0`.
- [ ] **Step 2: Watch them fail. Step 3: Implement. Step 4: `npm test`, `npm run build`.**

### Task 2.2: Grid element and selection bar

**Files:**
- Create: `backoffice/src/health/health-grid.element.ts` (+ `.test.ts`)
- Modify: `media-health.element.ts` (screen `grid`, opened by `health-open-grid`; **Back** returns),
  `health-overview.element.ts` (draw the chevrons, folder rows and **All folders** now), `en.ts`, `nl.ts`

**Interfaces:**
- Consumes: Task 2.1; `thumbUrl`, `THUMB_EDGE`; the context's `trash`, `deleteOrphaned`, and a new
  `optimize(keys: string[]): Promise<void>` moved from the element into the context.
- Produces: event `health-preview` `{ id: string; ids: string[] }` (the visible order, for the
  arrows).

- [ ] **Step 1: Failing tests:** chips show counts per kind; there is no Grid / One by one switch
  (Decision 11); ticking a card's checkbox selects without firing `health-preview`; clicking the picture fires it; a group
  checkbox reflects `groupState`; the selection bar reads "n selected · size" and its verb matches
  the chip (**Move to recycle bin**, **Delete**, **Optimize**); **Delete** is disabled for a
  non-admin with the reason; each group's row container has `content-visibility: auto` and a
  `contain-intrinsic-size` computed from `THUMB_EDGE` (assert the computed style, not the CSS text).
- [ ] **Step 2–4 as before.** After a verb, the entries leave the grid from the context's result;
  the selection clears.

### Task 2.3: Preview

**Files:**
- Create: `backoffice/src/health/health-preview.element.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `previewUrl`, `isPreviewable`; `HealthEntry`.
- Produces: events `health-show-in-manager` `{ entry }`; the verb and **Keep…** (step 3) buttons
  fire the same events the selection bar does, for one entry.

- [ ] **Step 1: Failing tests:** an image entry renders one `<img>` whose `src` is the signed URL
  for `previewWidth(hostWidth, devicePixelRatio)` (stub both; signed as thumbnails are, after step 1:
  core's `imaging/resize/urls` for an item, `orphans/thumbnails` for an orphaned file, which then needs
  a width without the square crop); the arrows move to the previous and
  next id in the given order and are disabled at the ends; a click on the backdrop closes it, a
  click on the picture does not; a PDF renders an `<object type="application/pdf">` on the raw URL;
  another file renders an icon and its facts; the facts line reads name, folder, `width × height`
  (left out when null), "last changed <month year>" from `updatedUtc`, size, and "not used on any
  page" for unused; no edit or Image Editor button exists.
  - After **Move to recycle bin** in the preview, it shows the next entry at once (the previous one
    at the end, closed when none is left), so it works as a quick one-by-one (Decision 11).
  - **Delete** on an orphan asks once, in the same words as the sheet, since it is for good; then
    moves on the same way. **Optimize** opens Optimize images for that one image and moves on.
- [ ] **Step 2–4 as before.**

### Task 2.4: Show in Media Manager

**Files:**
- Modify: `backoffice/src/manager/location.ts` (+ `location.test.ts`)
- Modify: `backoffice/src/manager/manager.element.ts` (+ `manager.element.test.ts`)
- Modify: `backoffice/src/health/media-health.context.ts`: `showInManager(entry: HealthEntry): boolean`

**Interfaces:**
- Produces: `UmbraDesktopMediaLocation` gains `select?: string`; `printLocation(place, view?, select?)`;
  `parseLocation` accepts `select` only when it matches the key pattern.

- [ ] **Step 1: Failing tests:** `printLocation({kind:'folder',unique:K}, undefined, S)` →
  `folder=K&select=S`; `parseLocation('folder=K&select=<script>')` has no `select`; the manager
  element given `location: 'folder=K&select=S'` calls its select-when-shown path with `[S]` once,
  and the location it reports back afterwards has no `select` (it is a one-time instruction, not a
  place); `showInManager` for an item at the root opens `folder=root&select=S`; for an orphan it is
  not offered (no item to select).
- [ ] **Step 2–4 as before.** Decision 8: past core's first page the folder opens unselected.

### Task 2.5: Verify and document step 2

- [ ] Real backoffice: open the grid from each row, a folder and **All folders**; tick a whole
  group, trash it, check the recycle bin; preview a large image and read the network panel: one
  request with `width=`, a few hundred KB; preview the PDF and an Engage item; **Show in Media
  Manager** for an item on the first page (selected) and one deep in a big folder (folder only).
  All five themes.
- [ ] `docs/user/media-health.md`: the grid and the preview. Design doc §16.14 "Step 2 as built".
- [ ] Decide §7 (View as a virtual place) with Luuk, as §16.8 says: record the answer in the design
  doc.

---

## Step 3: Keep (§16.6)

Scenes 8 and 9. One session, after step 2.

### Task 3.1: Keep store, migration, routes

**Files:**
- Create: `Health/Keep/MediaKeepModels.cs`, `Health/Keep/MediaKeepStore.cs`
- Modify: `Health/Data/MediaHealthEntities.cs` (`MediaHealthKeepEntity`),
  `Health/Data/MediaHealthDbContext.cs` (`Keeps`, table `umbraDesktopMediaHealthKeep`, no index
  beyond the key: keeps are tens, not thousands, and a 2,000-character `Target` cannot be indexed on
  SQL Server), `Health/MediaHealthRunner.cs` (prune after finish), `Health/MediaOrphanDeleter.cs`
  (skip `Kept`), `Health/MediaHealthModels.cs` (`MediaOrphanSkipReason.Kept`),
  `Health/Api/MediaHealthController.cs`, `Health/Api/MediaHealthApiModels.cs`,
  `Health/Composing/MediaHealthComposer.cs`
- Create: `Health/Data/Migrations/{SqlServer,Sqlite}/<stamp>_Keeps.cs` (+ Designer, snapshots)
- Test: `...Media.Tests/Health/MediaKeepStoreTests.cs`, `MediaOrphanDeleterTests.cs`,
  `MediaHealthControllerTests.cs`, `MediaHealthRunnerTests.cs`, `MigrationsTests.cs`

**Interfaces:**
- Produces:
  - `enum MediaKeepKind { Unused, Orphaned, Oversized }`; `enum MediaKeepDuration { ThreeMonths, Year, Always }`;
    `enum MediaKeepEnd { Expired, Changed }`.
  - `record MediaKeep(int Id, MediaKeepKind Kind, string Target, string? Note, DateTime? UntilUtc, Guid KeptBy, string KeptByName, DateTime KeptUtc, MediaKeepEnd? Ended)`;
    `Target` is the item key (`"D"` format, lower case) or the normalised relative path.
  - `MediaKeepStore(IMediaHealthDatabase database, TimeProvider timeProvider)`:
    `KeepAsync(MediaKeepKind keptFrom, IReadOnlyList<string> targets, string? note, MediaKeepDuration duration, Guid by, string byName): Task<IReadOnlyList<MediaKeep>>`
    (replaces any existing keep of the same target, whatever list it came from; fingerprint taken
    from the last check's row: the item's `Url`, or the orphan's `LastModifiedUtc` as round-trip
    `"O"`; targets not in the last check are skipped), `ListAsync(): Task<IReadOnlyList<MediaKeep>>`
    (with `Ended` computed against now and the last check; newest row wins per target),
    `StopAsync(IReadOnlyList<int> ids): Task` (removes every row of each id's target),
    `PruneAsync(): Task` (removes keeps whose target is in neither the last check's items nor its
    orphans), `ActiveOrphanPathsAsync(): Task<ISet<string>>`. `Kind` on the record is the list it
    was kept from, for display only (Decision 6).
  - Columns: `Id`, `Kind` (10), `Target` (2000), `Fingerprint` (2000, null), `Note` (500, null),
    `UntilUtc` (null), `KeptBy`, `KeptByName` (255), `KeptUtc`.
  - Routes on `umbradesktop/media/health`: `GET keeps` → `{ keeps: MediaKeepResponseModel[] }`;
    `POST keeps` body `{ kind, targets, note, duration }` → the keeps made; `POST keeps/stop` body
    `{ ids }` → 200. Media section policy, as the controller. Who comes from
    `IBackOfficeSecurityAccessor` (`Key`, `Name`). A note over 500 characters is a 400.

- [ ] **Step 1: Failing tests** (store on the in-memory SQLite of `SqliteTestDatabase`, clock a
  `FakeTimeProvider` at 2026-10-27T12:00Z):
  - `Year_ends_a_year_later` → `UntilUtc == 2027-10-27T12:00Z`; `ThreeMonths` → 2027-01-27;
    `Always` → null.
  - `Expired_after_its_time` → at 2027-10-27T12:00:01Z `Ended == Expired`.
  - `Changed_when_the_file_changes` → keep an item with `Url` A, finish a new check where it has
    `Url` B → `Ended == Changed`; an orphan whose `LastModifiedUtc` moved → `Changed`.
  - `Keeping_again_replaces` → two keeps of the same target, even from different lists, leave one
    row with the second's note and list (Decision 6).
  - `Stop_removes_every_row_of_that_target`.
  - `Prune_keeps_a_used_item_but_drops_a_deleted_one` (Decision 7).
  - `Times_come_back_utc`.
  - Deleter: `Skips_a_kept_orphan` → reason `Kept`, the file stays (Review Focus 5).
  - Runner: `Prunes_after_a_finished_check`, not after a failed one.
  - Controller: `Keep_records_who` (key and name from the security accessor); `Long_note_is_400`;
    `Stop_needs_only_the_media_section`.
  - Migrations: both providers have nothing pending.
  - The new actions carry no `ProducesResponseType(403)`; Task 3.4 loads `swagger.json` to prove it.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement**, then the migrations as in Task 1.1 Step 4 with the name `Keeps`.
- [ ] **Step 4: C# tests pass.**

### Task 3.2: Keeps in the client, context and model

**Files:**
- Modify: `health.client.ts`, `media-health.context.ts`, `health-model.ts`, `health-grid.ts` (each + test)

**Interfaces:**
- Produces:
  - Client: `keeps(): Promise<HealthResult<HealthKeep[]>>`, `keep(request: HealthKeepRequest)`,
    `stopKeeping(ids: number[])`; `HealthKeep` mirrors `MediaKeepResponseModel` with
    `kind: 'Unused' | 'Orphaned' | 'Oversized'` and `ended: 'Expired' | 'Changed' | null`.
  - Model: `withKeeps(lists, keeps: HealthKeep[]): { lists; kept: HealthKeep[]; endedBy: Map<string, HealthKeep>; keptCount: Record<HealthKind, number> }`:
    an active keep takes its item or file out of every list; ended ones stay in their lists and are
    reachable by entry id for the badge. `keptCount` counts, per list, the kept things that would
    otherwise be in it, so the unused row's "12 kept" stays true.
  - Context: state gains `keeps: HealthKeep[]`; `loadKeeps()` on every result load and before the
    Clean up sheet opens (Review Focus 5); `keep(entries, note, duration)` and `stopKeeping(ids)`
    update state from the server's answer. `barOf` and `cleanupOf` take the filtered lists, so kept
    things are never in Clean up or "can be freed".
  - `HealthChip 'kept'` lists `kept`, ends soonest first, `Always` last.

- [ ] **Step 1: Failing tests:** an active keep made from Oversized on a used 3 MB image removes it
  from `lists.oversized`; the same keep on that image after it becomes unused keeps it out of
  `lists.unused` too, and `keptCount.unused` is 1; an active keep removes an orphan from
  `lists.orphaned`; an ended keep leaves the item
  in its list and in `endedBy`; `keptCount.unused` counts active keeps only; `cleanupOf` after a keep
  is smaller by exactly that item's bytes; opening the sheet calls `keeps()` first.
- [ ] **Step 2–4 as before.**

### Task 3.3: Keep dialog, Kept chip, badges

**Files:**
- Create: `backoffice/src/health/health-keep-sheet.element.ts`, `health-kept.element.ts` (each + test)
- Modify: `health-grid.element.ts`, `health-preview.element.ts`, `health-overview.element.ts`, `en.ts`, `nl.ts`

- [ ] **Step 1: Failing tests:**
  - Sheet: "Keep <name>?" for one, "Keep <n> items?" for many; note optional, `maxlength` from one
    exported `KEEP_NOTE_MAX = 500` that matches the server's column (a C# test and a TS test each pin
    500); duration defaults to **A year**; the line under it says it comes back when the time is up;
    **Keep** calls `context.keep` with the chip's kind as the list it was kept from.
  - Kept chip: rows show thumbnail, name, kind, size, the note in quotes or "No note", "Kept by
    <name> on <date>", "ends in …" or "always", in the backoffice culture; **Stop keeping** calls
    `stopKeeping([id])` and the entry is back in its chip's count at once.
  - Badge: an entry with an ended keep shows "kept until <date>" and the old note on hover/focus.
  - Overview: the unused row reads "733 items no page uses, 12 kept" from `keptCount`.
  - **Keep…** in the selection bar and in the preview open the sheet.
- [ ] **Step 2–4 as before.**

### Task 3.4: Verify and document step 3

- [ ] Real backoffice with **two users** (an admin and an editor with only the Media section): the
  editor keeps an unused item with a note; the admin sees it under Kept with the editor's name and
  the note; the admin's Clean up does not trash it; the editor keeps an orphan while the admin's
  window is already open; the admin's Clean up skips it and Done says why. Stop keeping returns it.
  Change a kept item's file in the Media section, check again: it is back with the badge. Read
  `swagger.json` once: it must load.
- [ ] `docs/user/media-health.md`: Keep and Kept. Design doc §16.15 "Step 3 as built".

---

## Step 4: Facts in the Manager (outline only; §16.8's step 5)

§10's steps 4 and 5, unchanged except that folders match by key (§15). Plan it in its own session.

- **Health list view**: a collection view of the add-on's, beside Grid and List, with Name, Size,
  Used on; values from `UMBRADESKTOP_MEDIA_HEALTH_CONTEXT`'s `result.items` by key; absent until a
  check has been loaded in this session.
- **Folder tags**: size and unused count on folder cards, by key from `foldersOf`-style sums over
  every level, not only top-level; drawn the way the Manager marks cut and drag.
- **Properties** on a folder: one item menu entry; size, items, folders, last change, the folder's
  own unused and oversized counts, and **Open Media Health** opening the grid filtered to it (the
  `health-open-grid` shape of Task 1.4 through a location string for the Health app).
- Tests first as above; verify in a real backoffice on a library with nested folders.

## Definition of done, per step

The repository list in `CLAUDE.md`, walked and said aloud at the end of each step. In short: both
`npm run build` and `npm test` in the Media add-on (and the host for Task 1.5), the Media tests
project green, `docs/user/media-health.md` grown, the design doc's "as built" section written, the
marketplace JSON's screenshot after step 1, README unchanged. Nothing committed.

## Summary

- We rebuild Media Health in three sessions. First the overview: one bar showing what is wrong, three
  ticked rows, one Clean up that asks once, a Done screen with Undo, and a real start screen.
- Then the grid: everything grouped by folder with thumbnails, a quick picture preview you can step
  through, and Show in Media Manager.
- Then Keep: a note and an end date, stored in Media Health's own table, with Kept as a fourth tab.
  A kept item leaves every list.
- No separate Review screen: the grid is the overview, and the preview already goes one by one.
- The server changes are small: a few facts per item, the media count, and one Keep table. Undo
  reuses the Manager's existing restore. Optimize images learns to tell its caller how far it is.
- The check and Clean up both show their progress on the taskbar and title bar.
- Facts inside the Manager are only outlined; they get their own plan.

Decided by Luuk on 2026-10-27: a keep applies to every list; Optimize images reports progress; no
Review.

No choices left open.
