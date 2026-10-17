# Image Editor — Design

> A real image editor on the desktop, and the first app of a new add-on, UmbraDesktop Media. It
> opens an image from the media library, crops, adjusts, marks up and redacts it, and saves it back
> over the same media item or as a copy, so small fixes no longer mean a round trip through the
> editor's own computer. Its file commands live on a File page that Services.Media offers to every
> app that opens and saves media files.

- **Status:** Built 2026-10-17, uncommitted on `136-image-editor`; verified in a real backoffice (§13)
- **Date:** 2026-10-17
- **Issue:** [#136](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/136)
- **Branch:** `136-image-editor`
- **Mocks:** [`mockups/image-editor/image-editor.html`](mockups/image-editor/image-editor.html)
  (the editor) and [`mockups/image-editor/commands.html`](mockups/image-editor/commands.html) (the
  four command layouts that were compared). Built by `_build/editor.cjs` and `_build/commands.cjs`.

---

## 1. Why

Editors who need to crop a photo, fix its exposure, blur a face or shrink a 6 MB upload leave the
backoffice today: download, edit in another tool, upload again, and end up with two media items.
Paint in Accessories proved that a desktop app can open a media item, change it and save it back
through Umbraco's own save. Paint is a joke on purpose; this is the serious version.

## 2. Goals, non-goals, anti-goals

Goals, from the issue, agreed with the owner on 2026-10-17:

- A new add-on package, UmbraDesktop Media, built the way Accessories and Entertainment are.
- An Image Editor app in the launcher.
- Crop (free and fixed ratio), rotate, flip, resize.
- Exposure, brightness, contrast and saturation, with a live preview.
- Markup: text, arrows, rectangles, freehand.
- Redact: blur or pixelate a region.
- Undo and redo for every change, and zoom.
- Save over the same media item, or save a copy next to it, with format (keep, JPEG, PNG, WebP),
  quality, and the file size before and after.
- Unsaved work, someone else's change and save errors behave as the shared media service makes
  them behave everywhere.
- Every theme draws every control.

Non-goals (the issue's out of scope): opening the editor from a media item or a property (#137),
layers as a user-facing idea, video and PDF, background removal (worth a spike later; BG0 is
Apache-2.0 with separately licensed weights, `@imgly/background-removal` is AGPL and out).

Anti-goals, things that would make it a failure even if it worked:

- Commands hidden away. The owner chose the layout in §4 because nothing is in a menu.
- A control that one theme drops.
- A redaction that can be undone from the saved file.
- Anything GPL, AGPL or commercial in the shipped bundle.

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Five modes along the top: Crop, Adjust, Markup, Redact, Resize. Each mode has its settings in a panel on the right. | Owner's choice over a Photoshop-style tool rail (mock scene 8). This is for fixing images, not composing them. |
| D2 | File is the first tab of the mode bar and opens a File page over the window: Open, Save, Save as, Info, Close. No menu bar. | Owner's choice of four layouts (`commands.html`, option C): "the easiest, and fewer things hidden away". Big targets, so it works with a finger. |
| D3 | Save is a button at the right of the mode bar as well, outside File. Ctrl+S does the same. | The command used most stays on screen. Owner agreed. |
| D4 | Save writes over the item in the same format without asking (except a format that cannot be kept, §6). Save as is a page of File: replace or copy, name and folder for a copy, format, quality, sizes. | One place for every choice, and the quick path stays quick. |
| D5 | Zoom is in the status bar: out, slider, in, percentage, Fit. | Owner's call. Where Word and the Photos apps put it. |
| D6 | The File page is an element in Services.Media, not in the editor and not in the core desktop. The Image Editor is its first user. | It is about media files (recent media, the media picker, saving media items), so any app that opens and saves media is a future user. Games are not, which keeps it apart from #112. Owner: "for now it is". |
| D7 | Issue #112 (a menu bar for the games' button rows) stays separate and is not part of this work. | #112 was filed for Solitaire and the other games, and the File page is not for them. |
| D8 | On a save that crops, rotates or flips the picture, the item's focal point and named crops are reset. Other changes keep them. | Owner's choice of the simplest option. Resize, adjust, markup and redact do not move what the fractions point at, so they keep them. |
| D9 | Our own UI on Fabric.js (MIT) and Cropper.js v2 (MIT). No complete editor library. | §8. The complete MIT editors are archived (TOAST UI) or pull in React (Filerobot), and both have a fixed look no theme can restyle. |
| D10 | MIT notices ship in the package and in the built file, and the build fails on a bundled package that is not permissive or not listed. | Owner: "make sure we adhere to the MIT license". §9. |

## 4. The window

From top to bottom (mock scenes 2 to 6):

- **Title bar**: the desktop's own. The title is the open item's name, with the unsaved dot.
- **Mode bar**: the File tab, undo and redo, the five modes in the middle, Save at the right.
- **Canvas** on the left, and the active mode's **panel** (320px) on the right.
- **Status bar**: the item's name (editable, it renames the item on save), its folder, its
  dimensions (before → after while a resize is pending), its size and format, and zoom at the right.

With nothing open, the modes, undo, redo and Save are drawn and disabled, never hidden.

### 4.1 The modes

- **Crop.** A crop frame with rule-of-thirds lines and eight handles, and its size in real pixels
  under it. Ratios: Free, Original, 1:1, 4:3, 3:2, 16:9, with a Portrait/Landscape switch. Rotate
  left and right (90°) and flip horizontal and vertical are buttons in this panel and apply at once.
  The item's current focal point is drawn on the picture in this mode, so the editor can see it,
  with a line in the panel saying a crop, rotate or flip resets it on save (D8). Apply crop, Enter
  or switching mode applies the frame; Escape or Reset throws it away.
- **Adjust.** Exposure, brightness, contrast, saturation. Each slider is zero in the middle, and a
  double-click puts it back. The picture updates while dragging. Hold to compare shows the original;
  Split view shows original and adjusted side by side with a line to drag. One drag is one undo step.
- **Markup.** Select, Text, Arrow, Box, Pen. Six colours, a line width. Marks stay objects (move,
  restyle, delete) until the picture is saved, then they are part of the pixels.
- **Redact.** Pixelate or Blur, and a strength. Drag over what should not be seen; each region keeps
  its own style and stays editable until save. Defaults are strong, because a light blur can be
  reversed by software. The saved file contains none of the original pixels under a region.
- **Resize.** Width and height in pixels or percent, linked by default. Common widths (2560, 1920,
  1280, 800, Half) only shrink; enlarging is allowed by typing. Apply size, or switching mode, applies.

### 4.2 Undo, redo, zoom

Every change is an undo step: a crop, a rotate, one slider drag, one mark, one region. Undo and redo
are in the mode bar and on Ctrl+Z and Ctrl+Y. Zoom: Ctrl+plus, Ctrl+minus, Ctrl+0 (Fit), Ctrl+1
(100%), the wheel with Ctrl, and pinch. Space-drag or two fingers pan.

Saving does not end the history (builder check, settled as my call). As in every desktop editor,
undo can step back past a save, and the unsaved dot comes back when it does; the dot tracks the
point in the history that was saved. Marks and regions are flattened into the saved file, never
into the document being edited. This keeps the original pixels in memory for the session, which is
fine: the redaction anti-goal is about the saved file, and the user has the original anyway.

## 5. The File page (Services.Media)

Mock scenes 1, 7a and 7b, and the theme section. A page over the window under the mode bar: a list
of pages on the left, the chosen page on the right. "Back to the picture" closes it.

- **Open.** The images recently opened or saved through the media service, as big thumbnails with
  name and folder; one tap opens one. Under them, Browse the media library (Umbraco's media picker,
  as today) and Upload from this computer (the picker's own Upload). The editor starts on this page
  when nothing is open.
- **Save.** Saves as the Save button does, and says so.
- **Save as.** Two big choices, Replace *name* and Save a copy. A copy gets a name (default: the
  original's name with a suffix) and goes next to the original; Change... opens Umbraco's folder
  picker. Then format (Keep, JPEG, PNG, WebP), quality, and Now → After sizes, where After is
  measured by encoding the picture, not estimated. Choosing another format than the item's own shows
  the warning that the file's address changes. The picture is shown as it will be saved. After a
  copy is saved, the editor is on the copy.
- **Info.** Name, folder, dimensions, size, format, last updated. Where the image is used is a later
  addition, not this version.
- **Close.** Closes the window, through the unsaved-changes guard.

Saving, conflicts and errors are the media service's existing behaviour: the unsaved dot, the
Overwrite question when someone else changed the item, the reason in the status bar on failure.

Pages that need an open file are disabled while none is open. Keys: Ctrl+O opens File on Open,
Ctrl+Shift+S opens File on Save as.

### 5.1 What the element needs from an app

Services.Media's API is published and plain-data (its developer page): an outside package declares
the part it uses and imports nothing. The File page follows that: it is a custom element registered
by the Services.Media bundle, and an app uses it by tag name. Roughly, an app gives it:

- what is open (the media item's key, name, folder, update date) and whether it is dirty;
- which file types it can open, so Open's recent list and picker offer only those;
- a function that encodes the current document in a given format and quality and returns the bytes,
  which Save as uses for the size and for saving;
- a preview (an image URL or a canvas) for Save as.

And it hears back: open this item, saved (with the new item), closed. The exact shape is the
builder's, and it goes on the Services.Media developer page.

**Built shape:** the element takes `document`, `dirty`, `accept`, `encode`, `preview` and
`resetFocalPoint`; it has `show(page)`, `hide()` and `save()`; it fires `umbradesktop-media-file-open`,
`-saved`, `-failed`, `-back` and `-close`. The types are on the developer page
(`src/Umbraco.Community.UmbraDesktop.Services.Media/docs/developer/opening-and-saving-media.md` §7).
Two fields were added during the build: `bytes` on the saved detail, so the status bar shows the size
saved, and `fileName` on the document and the opened file, so a save keeps the file's address (§13). The recent list is kept by the media
context, per backoffice user, in the browser's storage; it lists what was opened or saved through
the context by any app, filtered by the app's file types.

The page styles itself with the desktop's `--umbradesktop-app-*` tokens, as the add-ons already do.
If a theme cannot draw it natively with those (the page list's selected state is the likely gap),
the missing token goes into the desktop's app token group and every theme gets it, per
`docs/developer/theming.md`.

**Outcome (built):** no token was missing. The selected page is `--umbradesktop-app-accent` with
`--umbradesktop-app-accent-text`, and all five themes draw it in their own idiom (checked in a real
backoffice, §13). The page list is 200px, not the mocks' 180: "Back to the picture" was cut short at
180. The page's smallest box is 720 × 560 (`FILE_PAGE_MIN_SIZE`), its height measured, its width
derived, both held by `fits.test.ts` under every theme id.

## 6. Saving the picture

- **Encoding.** The picture is drawn at full resolution to a canvas and encoded with `toBlob`. Keep
  means the item's own format when that is JPEG, PNG or WebP; any other source format (GIF, BMP)
  defaults to PNG. Default quality for JPEG and WebP is 90. AVIF is not offered: canvas cannot encode
  it in every browser. SVG is refused on open with a message, since this is a raster editor.
- **An item whose format cannot be kept** (GIF, BMP; settled as my call after the builder check).
  Save, the button or Ctrl+S, does not convert it silently: it opens File on Save as, with the
  format set to PNG and the address warning showing. After that first save the item is a PNG and
  Save is quick again. An animated GIF opens with a notice in the status bar that saving keeps only
  the first frame.
- **Metadata.** Re-encoding through a canvas drops EXIF, so location and camera data go. That is
  welcome for redaction and said in the user guide. The browser applies EXIF orientation when it
  decodes, so a phone photo is upright in the editor and saved upright.
- **Overwrite.** Through the media service's `save` with `existing` and `expectedUpdateDate`. Its
  overwrite already keeps everything in the `umbracoFile` value except the file. D8 needs a new
  optional request field, for example `resetFocalPoint: true`, which makes it drop the focal point
  and every named crop's coordinates. Optional, so the published API only gains a field.
- **Copy.** `save` without `existing`, in the original's folder unless another is chosen.
- **Format change on overwrite.** The new file has a new extension and so a new path. Pickers store
  the item's key and keep working; a pasted link to the old file breaks, which Save as warns about.
  The builder checks in a real backoffice that the item's extension, size and dimensions properties
  update.

## 7. The package

`src/Umbraco.Community.UmbraDesktop.Media/`, modelled on Accessories: its own csproj, backoffice
(Vite, Lit, web-test-runner), `docs/` with `product.json` and a user guide page, the Help manifest,
localisation in English and Dutch with the parity test, and
`umbraco-marketplace-umbraco.community.umbradesktop.media.json` at the root. A NuGet dependency on
Services.Media, as Accessories has. No server code, so no `.Tests` C# project. Added to
`.github/actions/build-packages/action.yml` and `RELEASE.md`.

The File page element, the `resetFocalPoint` field and the recent list go in Services.Media, with
its developer page updated.

## 8. Libraries

Checked 2026-10-17 (npm, the repositories' LICENSE files, bundlephobia).

- **Fabric.js 7.4**, MIT, Printio (Juriy Zaytsev, Maxim Chernyak). About 92 KB gzipped. Objects for
  the marks and redaction regions, text editing, freehand, WebGL filters for a fast live preview,
  zoom and pan, export with quality. Its optional dependencies (`jsdom`, `canvas`) are for Node and
  are not bundled.
- **Cropper.js 2.3**, MIT, Chen Fengyuan. About 15 KB. Web components (`cropper-canvas`,
  `cropper-selection` and so on), so the crop frame themes like everything else. All eleven
  `@cropper/*` packages it pulls in are MIT. If Fabric draws the crop frame with less code than
  wiring Cropper in, dropping Cropper is the builder's call.
- Considered and rejected: TOAST UI Image Editor (MIT, archived 2022, pins Fabric 4, fixed UI),
  Filerobot (MIT, React 19 and styled-components, v5 in beta for over a year, fixed UI), Konva (MIT,
  fine, but CPU filters are slow live on large photos), marker.js (linkware: a visible link back or a
  paid licence), Pintura and Photopea (commercial), Painterro and miniPaint (fixed UIs).

Large photos: preview at screen resolution, export at full resolution. The builder measures a 6000 ×
4000 JPEG for memory and for the time a slider takes to update, and writes the numbers here.

**Measured 2026-10-17** (headless Chrome with WebGL, a generated 6000 × 4000 JPEG of 1.7 MB): opening,
decoding and the first view took 146ms; the JavaScript heap went from 18 MB to 115 MB (the decoded
picture itself is held by the browser outside that heap); a slider move reached the screen in the
next frame (33ms between two frames, 50ms for the first move); rendering the file at full size with
an adjustment and encoding it as JPEG at 90 took 388ms. The full-size render keeps 6000 × 4000 and
adjusts every pixel: the colour matrix runs on the CPU in strips for the file, so a GPU texture limit
can never shrink or skip it; the view uses Fabric's WebGL filter with the same matrix. The view
stays within Fabric's own texture size of 4096: raising it to the GPU's 8192 sharpened a 100% view
of a 6000 px photo, but Fabric keeps a square canvas of that size for the page's whole life, 256 MB
of GPU memory against 64 MB (found by the final review).

**Cropper.js was dropped.** The crop frame is a Fabric rectangle on the same canvas as the picture,
so it zooms and pans with it; Cropper's elements would have been a second canvas over the first,
fighting it for the same pointer and transform. Only Fabric is bundled.

## 9. Licences

MIT asks for the copyright line and the licence text in every copy, and the built JavaScript is a
copy. So:

1. `THIRD-PARTY-NOTICES.md` in the Media package, packed into the nupkg at its root, with each
   bundled library's name, version, copyright line and full licence. Entertainment's file and csproj
   entry are the model.
2. The built file that contains a library carries its notice at its top, because minifying strips
   licence comments. Entertainment's Vite plugin that stamps the Roboto Slab notice, and fails the
   build when it cannot, is the model: `umbradesktop-rank-outline-notice` in
   `src/Umbraco.Community.UmbraDesktop.Entertainment/backoffice/vite.config.ts`.
3. A build check: the Vite build lists every `node_modules` package in the output, reads each one's
   licence, and fails if one is not MIT, Apache-2.0, BSD or ISC, or is not named in the notices file.
   An update that brings in a new package, or a copyleft one, then stops the build.

The same applies to Services.Media if the File page bundles anything from npm besides Lit.

**Result:** the check is the `umbradesktop-licences` plugin in the Media add-on's `vite.config.ts`,
with its rules in `backoffice/scripts/licences.mjs` and tested. The first build that bundled Fabric
failed with "fabric@7.4.0 is bundled but THIRD-PARTY-NOTICES.md does not name it", before the notices
were written; a notices file naming 7.3.0 fails the same way. The built chunk starts with
`/*! fabric@7.4.0 | MIT` and the full licence, `THIRD-PARTY-NOTICES.md` is at the nupkg's root, and
neither `jsdom` nor `canvas` is in the output. Services.Media bundles nothing from npm (its four
chunks' source maps list no `node_modules` file), so it needs no check of its own.

## 10. Testing

Test-first, per the repo. Unit tests for: the geometry (crop rectangles, rotate and flip, resize
with the link, zoom fit), the D8 rule (which operations reset the focal point), the undo history
(one step per drag), the format and quality defaults, the File page's states (disabled pages with
nothing open, Save as choices, recent list filtering), and the licence check (a fake bundle with a
GPL package fails). Theme tests that every control is visible and reachable in all five themes, as
the existing theme tests measure. A real-backoffice run, per `docs/design/2026-09-24-accessories-design.md`
§9: open, crop, save over, save a copy in WebP, the conflict path, and the properties that update.

## 11. Docs and listing

- User guide page in the Media add-on's `docs/user/`, one page for the editor, following
  `docs/developer/writing-documentation.md`. It says that saving strips camera and location data and
  that a crop, rotate or flip resets the focal point.
- Services.Media developer page: the File page element and `resetFocalPoint`.
- Media add-on README and marketplace file (tags: image editor, crop, resize, redact, blur, WebP;
  a screenshot of the editor).
- The core README gets at most one line, if any, pointing at the new add-on.

## 12. Alternatives considered

- **Command layouts** (`commands.html`): a menu bar (recognisable, but small targets and hidden
  commands, bad for touch); commands in the title bar with one app menu (GNOME, Chrome, Windows 11
  Photos; most room for the picture, would also have unlocked the parked Linux theme); one menu that
  adapts to touch (iPadOS 26; safe but two layouts of everything). The owner chose the File page.
- **A tool rail instead of modes** (mock scene 8): faster for experts, invites "where are my layers".
- **Save asking for format every time**, as a popover: replaced by D4.
- **Moving the focal point and crops with the picture** instead of resetting them: keeps the
  editor's work, but more code and more to explain. The owner chose reset (D8).
- **Putting the File page in the core desktop**: it would serve apps that never touch media.
  Services.Media is the home "for now"; if a non-media app needs it later, it moves.

## 13. What the real backoffice run found

Run 2026-10-17 on this worktree's own copy of the test database, with its media, at
`https://136-image-editor.dev.localhost:24016`, driven by headless Chrome. Everything in §10 passed
except where noted:

- Opened from the recent list and through Umbraco's own media picker. Crop and Save over: width,
  height, size and extension updated, the focal point cleared. Resize only and Save over: the focal
  point kept.
- Save a copy as WebP into another folder through Umbraco's folder picker: the editor moved onto the
  copy, the next Save wrote over the copy, and the original was untouched.
- A format change on overwrite (JPEG to PNG) kept the item's key, with the address warning showing.
- Changed in the Media section after opening: Save asked the Overwrite question, and Cancel wrote
  nothing. A GIF (uploaded for the run) opened with the animation notice, and Save opened Save as on
  PNG with the warning. Close with unsaved work asked first.
- The File page and all five modes under all five themes.
- Not run: a folder that refuses the media type. The test database has none; the reason reaching the
  status bar is covered by the unit tests.

It found five bugs every test had passed, each now fixed with a test that failed first:

1. **Every save renamed the file after the item**, so even a save in the same format changed the
   file's address and broke a pasted link. A save over an item now keeps the file's own name and
   changes only the extension for a new format (`fileName`, §5.1).
2. **Keeping the address meant the browser's cache served the old file**: a picture saved turned
   reopened upright. The opener now revalidates (`cache: 'no-cache'`).
3. **The File tab was invisible**: it shared its class name with the File page's positioning class,
   so it was laid out under the page.
4. **The white swatch vanished** under macOS and Windows 11, whose control edges are invisible on a
   white panel. Swatches now ring themselves in the border token.
5. **The crop size label ran off the canvas** when the frame reached its edge; it is now kept on it.

Two more were found by tests that drove real input rather than Fabric's own events: Fabric 7 listens
for mouse and touch events unless `enablePointerEvents` is on, so a pen or a finger took another path
than the mouse (now on), and the stage never forgot a single finger, so the next touch looked like a
pinch.
