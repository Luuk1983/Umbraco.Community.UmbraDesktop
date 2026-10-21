# Optimize images: design

> Select images in the media library, choose Optimize images, and resize, convert and strip their
> metadata in one run. The run happens in its own desktop window, which can be minimised while the
> run carries on, with progress on its taskbar button. The work itself is a public part of
> Services.Media, so another add-on can optimize a file it holds, or media items it names, with the
> same options and the same window.

- **Status:** Designed 2026-10-20; built 2026-10-21, uncommitted, with the real run in §15
- **Date:** 2026-10-20
- **Issue:** [#139](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/139)
- **Branch:** `139-optimize-images`
- **Mocks:** [`mockups/optimize-images/optimize-images.html`](mockups/optimize-images/optimize-images.html),
  built by `mockups/optimize-images/_build/optimize.cjs` with the Media Manager's mock kit. Scene
  numbers below refer to it.
- **Builds on:** the Image Editor (#136, its decoder and encoder), Services.Media (#146, open and
  save), window progress (#108), and Edit image (#137) for reaching the desktop from the Media
  section's window. #137 is merged (PR 161), with `copyOf`; see §9.

---

## 1. Why

Media libraries fill up with photos straight from a camera: 6000 pixels wide, several megabytes,
with GPS coordinates in their metadata. The fix today happens before upload, in Photoshop or Squoosh
or not at all. This brings that chore into the library, after upload, for a batch at a time.

On the desktop a long job does not have to hold the screen. It runs in its own window, minimised if
you like, while you carry on elsewhere.

## 2. Goals, non-goals, anti-goals

Goals:

- One bulk action, **Optimize images**, on media items selected in a collection on the desktop: a
  Media Manager window or the Media section's window.
- One settings page with three switches: Resize (maximum width and height, never enlarges), Convert
  (Keep, JPEG, PNG, WebP, and a quality), Remove metadata. Then Replace the originals or Save copies.
- A run per window: each row shows the image before and after, the total saved is at the top, and
  progress shows on the title bar and taskbar button. Cancel, Retry failed, Run the rest.
- One item failing never stops the rest. Folders and files that are not raster images are skipped
  and counted, not failed.
- Each item saved through Services.Media's save, so permissions, allowed media types and the conflict
  check apply per item.
- The same work available to other add-ons: a file in and a file out, or media items in and a report
  out (§8), with a developer docs page.

Non-goals:

- Anything that runs on upload (from the issue: that would bend Umbraco's own upload).
- Crop or focal point changes in bulk.
- Steps added by other add-ons, such as a watermark. Owner, 2026-10-20: not now. The run is built
  as a list of steps inside (§6), so this can be opened later without a rewrite.
- The action in the plain backoffice, outside the desktop. As with Edit image (#137 design §2), it is
  hidden there.
- A server-side API. Everything runs in the browser (§12).

Anti-goals: a run that stops at the first failure; an image saved again when nothing about it
changes; a JPEG losing quality just to drop its metadata; a phone photo turning sideways; a closed
window that silently throws away a running job.

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | One action, Optimize images, with the three operations as switches on one settings page. Not three actions. | Owner, 2026-10-20. The usual chore is resize and convert together; as two actions that is two runs, two saves per image, and a JPEG encoded twice. |
| D2 | The settings are the first view of the Optimize images window, which turns into the run when you press Optimize (scene 2B). Not a dialog first. | Owner, 2026-10-20, liked it as a "conversion app". The window you minimise and come back to is already there, and nothing blocks the desktop while you choose. |
| D3 | Every run opens its own window. Its title names what is in it: "Optimize images: Products (9)", or "Optimize images (9 images)" when the images come from more than one folder. | Owner: each run in its own window, and they should be told apart. Title format is my call. |
| D4 | The window is not in the launcher (`meta.hideFromLauncher`). Only code opens it. | Owner: it always starts from a set of images, so starting it empty means nothing. |
| D5 | Images are processed in the browser, one at a time, with the editor's decode and canvas encode. | Keeps memory to one picture, adds no server code, and reuses code the Image Editor's real run already proved (§12). |
| D6 | The run, the options and the window live in **Services.Media**, as a public API with two layers (§8). The Media add-on only adds the bulk action. | Owner: usable by other add-ons, as flexible as possible without getting complex. Services.Media is the package other add-ons already depend on for media. |
| D7 | Closing the window while it runs asks first, then works as Cancel. Closing the window you started it from does not affect it. Leaving the desktop stops it, after the desktop's existing question. | Told to the owner 2026-10-20 and accepted. The run is held in Services.Media's desktop context, not in the window that started it. |
| D8 | Remove metadata on its own strips the bytes from the file without encoding the picture again, and keeps the orientation. With Resize or Convert it is always on and locked, because a canvas encode drops metadata anyway. | Lossless for the case that only wants privacy, and the switch never claims something that is not true (scene 2C). |
| D9 | An image with nothing to do is left alone and reported as unchanged, not saved again. | Saving it again would add a version, change the update date and break nothing but help nothing. |
| D10 | Resize and convert keep the item's focal point and crops, on a replace and on a copy. `resetFocalPoint` is never sent. | Same as the Image Editor's D8: scaling does not move what the fractions point at. |
| D11 | Defaults: Resize on at 2560 × 2560, Convert on to WebP at quality 80, Remove metadata on, Replace the originals. After the first run, each person's last choices are remembered. | My call, shown in the mocks and not objected to. Flagged for the owner to confirm while reading. |
| D12 | A copy is named "*name* (optimized)", its file "*file*-optimized.*ext*", in the original's folder. | My call, shown in scene 2C. |
| D13 | Animated images are skipped by a run, and offered afterwards as Optimize animated images too, behind a confirmation that only the first frame is kept (§6.1). | Owner, 2026-10-21: allow it, with a warning. After the run, because only then are the animated ones known without downloading every file first. |

## 4. The action

- An `entityBulkAction` for `media`, registered by the **Media add-on**, label **Optimize images**,
  weight just after the Manager's Copy to (scene 1). A standard extension type, so nothing of core's
  is overridden.
- Shown when both hold, the same gate as Edit image (#137 design §3): the desktop's window manager
  can be reached, and the user has the Media section. It shows in Media Manager windows and in the
  Media section's own window. It does not use the Manager's `inManagerSelectionBar` condition.
- It reaches Services.Media's context directly in a Manager window, and from the Media section's
  window by #137's frame route (`umb:context-request` dispatched on `window.frameElement`,
  desktop-contexts.md §5). It calls `optimizeMedia({ items: selection })` and returns at once. It
  does not wait for the run, so the selection bar is free again.
- The selection is passed as it is, folders and all. Sorting out what can be optimized is the run's
  job (§6.1), so the count on the settings page and the report agree.

## 5. The window

An element app registered by Services.Media, `meta.hideFromLauncher: true`. Its location is the id
of the run it shows (desktop-apps.md §7.3), handed over by `openApp(alias, { location })`.

### 5.1 Settings (scenes 2B, 2C)

- Heading "Optimize *n* images", and under it what will be skipped: "1 folder in the selection is
  skipped", "2 files are not images and are skipped". Worked out before this is shown, in a few
  batched requests rather than one per item: core's media item repository for names, parents and
  `isTrashed`, `UmbMediaUrlRepository.requestItems` for each file's extension, and the folder media
  types (the Media add-on's `isFolderType` has the rule; Services.Media keeps its own copy). The
  item model alone has no extension and no folder flag.
- **Resize**: switch, Max width and Max height in pixels. Hint: never made larger, an image already
  inside the box keeps its size, the focal point and crops are kept.
- **Convert**: switch, Format (Keep, JPEG, PNG, WebP), Quality 1 to 100 as a slider with a number.
  Quality is disabled for PNG. Hint: the file keeps its name with the new extension, pages that use
  it keep working.
- **Remove metadata**: switch. On and locked while Resize or Convert is on, with the hint that says
  why (D8). On its own, the hint says the quality stays exactly the same.
- **Save**: Replace the originals, or Save copies next to them (D12). Under Replace, when any of the
  images is used elsewhere: "4 of these images are used in 11 places. Replacing changes them
  everywhere." The counts come from `UmbMediaReferenceRepository.requestReferencedBy(unique, 0, 1)`
  per image, a few at a time, while the page is open; if the lookups fail, no warning. This one
  warning replaces #137's per-save question, which lives in the file menu and is not on this path.
- Footer: Cancel closes the window and ends the run as not started. The green button says what it
  does: "Optimize 9 images". With every switch off it is disabled.

A caller that passes `start: true` (§8.2) skips this view.

### 5.2 Running (scene 3)

- The settings view becomes the run: a heading "Optimizing 9 images", a progress bar, "4 of 9 · 30.4
  MB saved so far", one line restating the settings, and a row per item in selection order.
- A row: thumbnail, name, and the facts. Done: "6000 × 4000 JPEG, 8.4 MB → 2560 × 1707 WebP, 412 KB"
  and the percentage saved, in the success colour; a result larger than the original (a photo
  converted to PNG) shows its growth in the warning colour, and is still saved because it was asked
  for. Running: a small bar and "Saving". Waiting, Skipped (with why), Unchanged (with why), Failed
  (with Umbraco's reason, §7.3).
- Progress is reported with `umbradesktop-task` (window-progress.md §1): `completed` counts processed
  items including unchanged and failed ones, `total` the items that are not skipped, `failed` the
  failures, `label` "Optimizing". It ends as `failed` when anything failed, so the failure colour
  stays on the taskbar button until the window is looked at, and as `done` otherwise.
- Header button: Cancel. Cancel lets the item being saved finish, then stops (scene 4B).

### 5.3 Ended (scenes 4A, 4B)

- Heading says what came of it: "7 optimized, 1 unchanged, 1 failed", or "Cancelled after 5 of 9".
  Under it the total saved.
- Buttons: Optimize animated images too (when any were skipped as animated, after a confirmation,
  §6.1), Retry failed (when something failed) and Run the rest (after a cancel), each running
  those items again in the same window with the same settings, each item opened afresh so a conflict
  is retried against the latest version. Close.
- The failure state on the taskbar is ended (`done`) when the window is next activated, or when a
  retry starts. Builder's call which signal "looked at" uses, as long as it matches window-progress.

### 5.4 Closing, reloading, several windows

- While running, the element is busy through window progress, so the desktop asks before Close and
  counts it in the leave-the-desktop question. A confirmed close cancels the run as in §5.2.
- If the desktop reopens the window after a reload (#102), its run no longer exists. The element
  closes itself with `umbradesktop-close-request`.
- Several runs at once are several windows, each with its own run, title and progress (D3). They run
  side by side; nothing queues them.
- Window size: wide enough for a row's facts on one line in the mock, about 640 × 760 for the app's
  box. Builder derives it and checks it under every theme, as the file menu's `fits.test.ts` does.

## 6. Processing an image

### 6.1 What each item gets

Decided per item before it is opened, then refined once its bytes are read:

| Item | Result |
|---|---|
| A folder, or an item without a file | Skipped: "A folder" / "No file" |
| An item in the recycle bin | Skipped: "In the recycle bin" |
| An item gone, or binned, by the time it is opened | Failed: "No longer in the media library" |
| A file whose extension is not jpg, jpeg, png, webp, gif or bmp (the editor's `ACCEPT`) | Skipped: "Not an image this can optimize" |
| An SVG | Skipped: "A vector image" |
| An animated GIF (two or more frames, the editor's `isAnimatedGif`) | Skipped: "Animated; only its first frame would be kept" |
| An animated PNG (an `acTL` chunk) or WebP (the `VP8X` animation flag) | Skipped, the same. Added while planning: a canvas keeps their first frame as it does a GIF's |

**Animated images can still be done, on purpose** (owner, 2026-10-21). A run skips them, and when it
ends with any skipped as animated it offers **Optimize animated images too**. That asks first, in
Umbraco's confirm dialog, that only the first frame of each is kept and the animation is lost, and on
a yes runs just those items again in the same window with `animated: 'first-frame'`. Not asked on the
settings page: knowing which files are animated means downloading every GIF, PNG and WebP before the
page can show, which for fifty photos is a slow page for one warning.
| Nothing to do (below) | Unchanged, with why |
| Anything else | Optimized, or failed |

**Nothing to do** means all of these: no resize is needed (inside the box, or Resize off), the target
format is the file's own (Convert off, Keep, or the same format chosen), and either Remove metadata
is off or the file has none worth removing (§6.3).

### 6.2 The steps

1. Open the item through Services.Media's opener, which gives the bytes, the update date, the file
   name and (with #137) `isTrashed`. The run calls the opener and saver underneath the context's
   `open` and `save`, not those two methods, because they record every file in the person's recent
   list and a batch of 50 would push every real entry out of Open recent in the Image Editor,
   Notepad and Paint. A binned item is failed here, before anything is saved: Services.Media's save
   over a binned or deleted item quietly creates a new one instead (`media-save.ts`), which a run
   must never do. The moment between this check and the save is left open; it needs someone to bin
   the image during its own few hundred milliseconds, and closing it would change published API.
2. Work out the plan: resize to what, encode as what, strip or not.
3. If resizing or converting: decode upright (`createImageBitmap` with `imageOrientation:
   'from-image'`, the editor's `decodePicture`), draw at the new size, encode with `toBlob`. Keep and
   a GIF or BMP encodes as PNG, as the editor does (image editor design §6), and the row says so.
   A JPEG has no transparency, so the picture is drawn over white for it; a canvas would otherwise
   write transparent pixels as black (added while planning).
4. Otherwise, if only metadata goes: strip it from the bytes (§6.3).
5. Save (§7).
6. Release the bitmap and the canvas before the next item.

Steps 2 to 4 are `optimizeFile` (§8.1), with no knowledge of media items. Inside, the plan is a list
of steps run in order, which is where an add-on's step would go one day (§2, non-goals).

**Resize maths.** Scale = min(1, maxWidth / width, maxHeight / height), on the upright dimensions.
New size rounded to whole pixels, never below 1. One empty field means no limit on that side.

**Quality of the downscale.** A plain `drawImage` from 6000 to 2560 pixels can alias. The builder
measures it on a photo with fine detail and, if it shows, uses `createImageBitmap`'s
`resizeWidth`/`resizeHeight` with `resizeQuality: 'high'`, or steps down by halves.

### 6.3 Removing metadata without encoding

| Format | Removed | Kept |
|---|---|---|
| JPEG | APP1 (EXIF and XMP), APP13 (IPTC), COM | APP0 (JFIF), APP2 (ICC profile, so colours stay right), APP14 (Adobe), everything else |
| PNG | `eXIf`, `tEXt`, `zTXt`, `iTXt`, `tIME` | `iCCP`, `sRGB`, `gAMA`, `cHRM`, `pHYs` and every critical chunk |
| WebP | `EXIF` and `XMP ` chunks, with their flags cleared in `VP8X` and the RIFF size fixed | `ICCP` and the image |
| GIF, BMP | Nothing; treated as having no metadata | |

**Orientation.** A JPEG (or WebP, or PNG `eXIf`) whose EXIF orientation is not 1 gets a minimal
EXIF block back with only the orientation tag, so the photo stays upright. Every other tag goes,
GPS included.

"Has metadata worth removing" (§6.1) means any of the removed parts above is present, apart from a
lone orientation tag.

These are small byte walkers in the style of the editor's `isAnimatedGif`, each with fixtures: a
phone JPEG with GPS and orientation 6, a PNG with text chunks, a WebP with EXIF.

## 7. Saving

### 7.1 Replace the originals

`save({ file, name, folder, existing: unique, expectedUpdateDate })`, with the update date from the
open in step 1, never `force`.

**The file gets a new name on every replace**, `<base>-ud<hash>.<ext>` through #137's `contentHash`
and `versionedFileName` (#137 design §11.4; the `ud` marks the hash as ours, so an earlier one is
replaced rather than added to). The run applies them itself: they live in the file menu's `runSave`
(`file-menu/formats.ts`, the same package, so the run imports them), and the context's `save` writes
whatever name the file has. Keeping the same name, as a
resize-only or metadata-only replace otherwise would, lets every cache keep showing the old picture,
which is the bug #137 measured. So every replace gives the image a new address, not only a format
change: pickers store the key and keep working, a pasted link to the file breaks. The user guide
says so (§11).

A conflict (someone saved the item after it was opened) is a failure for that item: "Someone else
saved this image after you started. It was left alone, so their change is not lost." There is no
per-item question in a bulk run; Retry failed opens it afresh.

### 7.2 Save copies

`save({ file, name: '<name> (optimized)', folder: <the original's folder>, copyOf: unique })`, the
file named `<base>-optimized.<ext>` (D12). The report carries the copy's key.

**A copy is a full copy** (owner, 2026-10-20: "there is no other realistic way"). A save without
`existing` used to create an item holding only the file, its media type picked from the extension,
so it lost the focal point, crops, alt text and every other property, and a custom image type became
plain Image. `copyOf` is a new optional field on Services.Media's save request, added by #137 for the
Image Editor's Save a copy, which had the same gap: the new item takes the original's media type and
every property, with the new file in place of the old one. Umbraco has no copy for media, so it is
built the way the Media Manager's `copyItem` does it (`operations/steps.ts`): read the item's detail,
drop the derived label properties, and create one item with the rest. One create, no second save.
The focal point and crops come with it, so D10 holds for copies too.

### 7.3 Refusals

Any `{ ok: false, message }` is a failure with that message, the same text the Image Editor and
Paint show on a refused save. A missing message gets a generic one. This covers a folder that does
not allow the media type, missing permissions, and a server that does not accept the extension.

### 7.4 After a save

Media windows showing a saved item should show the new picture. #137's design §6 covers how a media
window takes a new image after a save; this follows the same route rather than inventing one.

**Checked on main, 2026-10-20:** that route is the context's private `#announce`, which `save` runs
after a save that worked, in the same method that records the file in the recent list. The run calls
the saver underneath `save` (§6.2), so it would skip the refresh too. The context therefore splits
`save` into the save, the recent record and the announcement, and the run takes the first and the
last. Nothing published changes.

## 8. For other add-ons

Two methods join Services.Media's context (`'UmbraDesktopMediaContext'`), documented on a new
developer page in Services.Media's docs, `optimizing-images.md`, with a short example of each. Like
the rest of the context they are public API that only ever gains optional fields.

### 8.1 A file in, a file out

```ts
interface OptimizeOptions {
  resize?: { maxWidth?: number; maxHeight?: number } | null;  // null or absent: no resize
  format?: 'keep' | 'jpeg' | 'png' | 'webp';                // default 'keep'
  quality?: number;                                          // 1-100, JPEG and WebP; default 80
  removeMetadata?: boolean;                                  // implied when resizing or converting
  animated?: 'skip' | 'first-frame';                         // default 'skip'; see §6.1
}

interface ImageFacts { width: number; height: number; size: number; format: string }

type OptimizeFileResult =
  | { status: 'optimized'; file: File; before: ImageFacts; after: ImageFacts }
  | { status: 'unchanged'; reason: string; before: ImageFacts }
  | { status: 'skipped'; reason: 'not-an-image' | 'vector' | 'animated' }
  | { status: 'failed'; message: string };

optimizeFile(file: File, options: OptimizeOptions): Promise<OptimizeFileResult>;
```

No window, nothing saved, nothing on screen. For an add-on that has an image before it reaches the
library. The run in §6 is built on exactly this.

### 8.2 Media items in, a report out

```ts
interface OptimizeMediaRequest {
  items: string[];                     // media keys, in the order to process them
  options?: OptimizeOptions;           // starting values; the person's remembered ones otherwise
  save?: 'replace' | 'copy';           // starting value; default 'replace'
  start?: boolean;                     // true: skip the settings view and run at once
  title?: string;                      // plain text for the window title instead of the folder name
}

interface OptimizeItemReport {
  unique: string;
  name: string;
  status: 'optimized' | 'unchanged' | 'skipped' | 'failed' | 'not-started';
  before?: ImageFacts;
  after?: ImageFacts;
  copy?: string;                       // the new item's key, when saving copies
  reason?: string;                     // why it was unchanged, skipped or failed
}

interface OptimizeReport {
  status: 'finished' | 'cancelled' | 'not-started';
  items: OptimizeItemReport[];
  saved: number;                       // bytes
}

optimizeMedia(request: OptimizeMediaRequest): Promise<OptimizeReport>;
```

It opens a new Optimize images window and resolves when the run ends: finished, cancelled (Cancel,
or the window closed while running), or not started (Cancel on the settings view). A Retry failed or
Run the rest in the same window after that is a new run and is not reported to the caller.

The bulk action is the first caller. It ignores the report.

### 8.3 Where the run lives

A store in Services.Media's desktop context holds every run by id, the way the Media add-on's
Transfers store holds its transfers (`transfers-store.ts`): the window is a view of a run, not its
owner. `optimizeMedia` creates the run, opens the window with the run's id as its location, and
returns the run's promise. The run is dropped when its window closes.

## 9. Packages

- **Services.Media:** `optimizeFile`, `optimizeMedia`, the run store, the Optimize images window
  app (`hideFromLauncher`), the metadata strippers, its own copies of the editor's `decodePicture`,
  `encodeCanvas` and `isAnimatedGif` (nothing is imported between packages; the file menu's
  `formats.ts` already copies `SaveFormat`), localisation in `en.ts` and `nl.ts`, remembered settings
  per user in local storage keyed like recent media (`recentKeyFor`). A new developer page. Released
  in lockstep, so the Media add-on's dependency range needs no change.
- **Media add-on:** the bulk action and its manifest, its labels, and the user guide page.
- **Core desktop:** nothing new. `openApp(alias, { location })` and `hideFromLauncher` are on main.
  From #137 it needs the documented frame lookup (desktop-contexts.md §5, "From inside a backoffice
  window"), which reaches `'UmbraDesktopMediaContext'` too, since package contexts are hosted on the
  desktop element.

**On #137.** Five things this uses come from #137: the frame lookup, the refresh of media windows
after a save (§7.4, its `#announce` and core's `media-change.controller.ts`),
`contentHash`/`versionedFileName` (§7.1), `isTrashed` on an opened item (§6.2), and `copyOf` on the
save request (§7.2). Owner, 2026-10-20: #137 lands first and this branch is rebased on it, so the two do not both change `media.context.ts`, the localisation
files, the manifests and the Services.Media developer page.

Checked on main (f8776c6) on 2026-10-20 before planning. All five are there as described, with two
details that change how this builds on them, not what it does: the hashed name is `-ud<hash>` (§7.1),
and the refresh runs inside `save` next to the recent record (§7.4). The frame lookup is the Media
add-on's `findDesktopWindows` (`edit-image/desktop-windows.ts`), written for the window manager; it
is generalised to any desktop token so the action reaches `'UmbraDesktopMediaContext'` the same way.
Services.Media registers no app yet, so its `umbradesktop-app.d.ts` gains the `umbraDesktopApp`
type, copied as the Media add-on's is.

## 10. Testing

Test first, as everywhere. Unit tests:

- The plan per item (§6.1): every row of the table, and each reason for "nothing to do".
- Resize maths: never enlarges, one side unlimited, portrait and landscape, rounding.
- The strippers against fixtures: GPS gone, orientation 6 kept and the photo upright when decoded,
  ICC profile kept, the picture's bytes untouched (compare the scan data), a file with nothing to
  remove returned as is.
- `optimizeFile` end to end in a real Chrome: a JPEG to WebP at 80 shrinks and decodes at the new
  size; Keep on a GIF gives PNG.
- The run store: order, one failure does not stop the rest, Cancel lets the current item finish,
  Retry failed and Run the rest, the report, the run dropped on close, an unknown run id.
- The window: settings states (locked switch, disabled quality for PNG, disabled Optimize with every
  switch off, the references warning), the title rule, window progress events, the size under every
  theme.
- The bulk action's conditions: shown on the desktop with the Media section, hidden otherwise.
- Localisation parity for both languages.

Then a real backoffice run, as the Image Editor's §13 did, on a worktree's own copy of the test
database with a few real camera photos uploaded: a mixed selection with a folder and a PDF; replace
with WebP and check the items' extension, size, width and height properties and that the focal point
held; copies; metadata only on a phone photo (GPS gone, still upright, file bytes otherwise equal);
a conflict made from a second tab; a folder that refuses the type if the database has one; minimise,
close the Manager window, close the run window mid-run; the Media section window path; memory in
Chrome's task manager over 50 large photos; whether the desktop stays smooth to drag while it runs.

## 11. Docs and listing

- Media add-on user guide: `docs/user/optimize-images.md` in the add-on's own docs, linked from the
  Media Manager page. Says what each switch does, that metadata goes with any resize or convert, that
  a replaced image keeps its pages working but gets a new address so a pasted link to the old file
  breaks (§7.1), and how to cancel and retry.
- Services.Media developer guide: `optimizing-images.md` (§8), linked from
  `opening-and-saving-media.md`.
- Media marketplace file: tags such as "bulk resize", "WebP", "image optimization", "EXIF". A
  screenshot of a finished run if it earns a place.
- Media README: at most one line, if any.

## 12. Answers to the issue's open points

- **Browser or server.** Browser (D5). The memory worry was a few hundred large images in one tab;
  one at a time, with each bitmap released, holds one picture at once. The real run measures it.
- **Converting changes the extension, and the extension decides the media type.** On a replace the
  item keeps its media type and key; only its file changes. The Image Editor's real run saved a JPEG
  over as PNG and a copy as WebP with the properties updating (image editor design §13). A server
  that refuses the extension answers with a reason, which becomes that item's failure (§7.3).
- **Resizing and the focal point.** Kept (D10), as the editor decided.

## 13. Left to the builder

- The exact wording of every message, in the add-on's voice, Dutch included.
- How "looked at" ends the failure state on the taskbar (§5.3).
- The downscale method (§6.2) and whether encoding needs a worker to keep the desktop smooth.
- The window's measured size (§5.4).
- How many reference lookups run at once (§5.1).

## 14. Alternatives considered

- **Three actions** (Resize, Convert, Remove metadata), as the issue had it. Two saves and two
  encodes for the common case (D1).
- **A dialog before the window** (scene 2A). Blocks the desktop while choosing, and the window you
  will minimise is not there yet (D2).
- **On the server with ImageSharp.** Already in Umbraco and fast, but needs an API of its own,
  progress reporting from the server, and server code in Services.Media, which has none.
- **Steps from other add-ons now.** A settings view per step, an order, and rules on when the picture
  is encoded again: a design of its own (§2).
- **The run in the Media add-on.** Other add-ons could not use it without depending on the Media
  add-on, which is an app package, not a service (D6).

## 15. What the real run taught

Run 2026-10-21 on the worktree's own copy of the test database, from a headless Chrome driving the
desktop by real clicks, with camera-sized test photos made for it: four 6000 × 4000 JPEGs with GPS
and camera tags, a 4032 × 3024 phone photo stored on its side (EXIF orientation 6), a 5184 × 3456
PNG, a 1800 × 1200 WebP, an animated GIF and a PDF. Scripts in that session's scratchpad `run/`.

**What held, as designed.**

- The action sits where it was meant to: Cut, Copy, Copy to, Move to, **Optimize images**, Trash in a
  Media Manager window, and Move to, **Optimize images**, Trash in the Media section's window, where
  it works through the frame route and opens its window on the desktop page. Weight 15 is right.
- A mixed selection of nine (§10): six optimized, the small WebP unchanged ("Already within the
  limits and in that format"), the GIF skipped as animated, the PDF skipped. 95 MB saved in 9 s. Each
  replaced item kept its key and media type, got `-ud<hash>.webp`, and its extension, bytes, width
  and height properties followed; Banjo's focal point held (D10). The phone photo came out upright,
  1920 × 2560.
- Copies are full copies: "Banjo (optimized)" next to the original, with its focal point and media
  type, its file `banjo-optimized.webp`; the originals untouched.
- Metadata only, on the phone photo: EXIF from 342 bytes to 34 (the orientation alone), no GPS, no
  camera, the ICC profile kept, every byte from the scan on identical, still upright when decoded.
- A conflict made while the run held an image (renamed through the management API, as a second tab
  would): that image failed with the conflict words, the rename was kept, and Retry failed then
  optimized it under its new name.
- Closing the run's window mid-run asks the desktop's own question ("This window is still busy:
  Optimizing 1 of 4. If you go ahead, it stops before it finishes."); Stop it ends the run cancelled,
  what was done kept and the rest not started. Minimised, a run goes on with its ring on the taskbar
  button; closing the Manager window that started it changes nothing.
- Fifty 6000 × 4000 photos in one run: all fifty optimized, 608 MB saved, in 83 s (1.7 s each). The
  JavaScript heap rose 68 MB at its peak and Chrome's processes about 220 MB, so one picture at a time
  holds (D5).

**What it changed.**

- **The encode moved into a worker.** The first fifty-photo run had fifty long tasks, one per image,
  median 183 ms and up to 645 ms, and forty frame gaps over 100 ms: a window dragged during a run would
  hitch once per image. Measured step by step on one photo: a canvas's WebP encode blocks the page for
  290 ms and the resized decode for 90; an `OffscreenCanvas` on the page blocks as much; the same
  steps in a worker give the same file in the same time and block nothing. `renderPicture` now
  decodes, resizes and encodes in a worker made from a source string (no worker file, no build
  plugin), one per picture, and falls back to the page where workers, `OffscreenCanvas` or a `blob:`
  worker under the site's content security policy are not there. After the change the same run had
  no long task and two frame gaps over 100 ms, and took 14% longer (73 s to 83 s). §13's open point,
  answered.
- **A shrink is never "−100%".** A 41.7 MB PNG became a 21 KB WebP, which rounded to −100% and read
  as a file that vanished. Anything left shows at most −99%.
- **An encoder that writes another format fails.** Not found in Chrome, which writes all three, but
  found while reading the encoder: Safari's canvas cannot write WebP and hands back a PNG without
  saying so, which would have been saved under a `.webp` name. `checkEncoded` now refuses it, in words
  that say to choose another format.

**Learned, nothing to change.**

- **The downscale does not alias** (§6.2). On a patch of 6-pixel stripes taken from 6000 to 2560,
  Chrome's plain `drawImage` and `resizeQuality: 'high'` band equally little (2.36 and 2.35, the
  spread of column brightness smoothed over 8 pixels). `'high'` stays; it costs nothing in the worker.
- **Remembered settings include Save copies** (D11). A run after a run that saved copies starts on
  Save copies, which surprised the test script into checking an original that had, correctly, been
  copied rather than replaced. Owner, 2026-10-21: keep remembering everything. A remembered Save
  copies at worst makes copies that can be deleted; always starting on Replace could overwrite
  originals someone meant to keep, and Umbraco keeps no history of media files.
- **The title counts what the selection was known to hold.** "Optimize images: Optimize test (8)"
  counts the animated GIF, which is only known to be animated once read, and the heading then goes from
  "Optimizing 8 images" to "Optimizing 7". Honest, and rare enough to leave.
- **A folder named like its neighbours reads oddly in the title**: a folder Umbraco named "Optimize
  test 5 (3)" gave "Optimize images: Optimize test 5 (3) (3)". Left as it is.
- **Umbraco's own upload limit applies.** A 57 MB PNG was refused with a 400 on its way in, before
  any of this ran; a 42 MB one went in. The test photos were made to fit.
- **Driving it from a script:** right after the desktop loads, `openApp` cannot find an app until its
  catalogue is in; puppeteer's selector waits poll on animation frames, which a headless tab gave
  none of until it was brought to the front; a synthetic `click()` on a `uui-button` host does not
  reach the button inside it, a real click does; core's Media section selects through each card's
  checkbox, not Ctrl-click; and the headless profile has to be fresh per script, or the token refresh
  fails with a 400.
