# Image Editor — Design

> A real image editor on the desktop, and the first app of a new add-on, UmbraDesktop Media. It
> opens an image from the media library, crops, adjusts, marks up and redacts it, and saves it back
> over the same media item or as a copy, so small fixes no longer mean a round trip through the
> editor's own computer. Its file commands live in a "..." menu that Services.Media offers to every
> app that opens and saves media files (§14; it replaced the File page of the first build).

- **Status:** Built 2026-10-17 and verified in a real backoffice (§13). The file menu that replaces
  the File page (§14) was designed and built 2026-10-18, uncommitted, and checked in a real
  backoffice (§14.8)
- **Date:** 2026-10-17
- **Issue:** [#136](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/136)
- **Branch:** `136-image-editor`
- **Mocks:** [`mockups/image-editor/image-editor.html`](mockups/image-editor/image-editor.html)
  (the editor) and [`mockups/image-editor/commands.html`](mockups/image-editor/commands.html) (the
  four command layouts that were compared). Built by `_build/editor.cjs` and `_build/commands.cjs`.
  The file menu that replaced the File page (§14):
  [`mockups/image-editor/file-menu.html`](mockups/image-editor/file-menu.html), built by
  `_build/file-menu.cjs`.

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

- The command used most hidden away. Save is always one click on screen. (The first build put
  nothing in a menu at all; after using it, the owner chose a "..." menu for the rarer commands, §14.)
- A control that one theme drops.
- A redaction that can be undone from the saved file.
- Anything GPL, AGPL or commercial in the shipped bundle.

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Five modes along the top: Crop, Adjust, Markup, Redact, Resize. Each mode has its settings in a panel on the right. | Owner's choice over a Photoshop-style tool rail (mock scene 8). This is for fixing images, not composing them. |
| D2 | ~~File is the first tab of the mode bar and opens a File page over the window.~~ **Replaced by D11 and D12 (§14).** | Owner's choice of four layouts (`commands.html`, option C). After using it in a real backoffice: "'file' doesn't sound right", and File on the left with Save on the right did not feel like one whole. |
| D3 | ~~Save is a button at the right of the mode bar as well, outside File.~~ **Replaced by D11 (§14).** Ctrl+S still saves. | Save drawn in the accent colour looked like the selected mode tab. |
| D4 | Save writes over the item in the same format without asking (except a format that cannot be kept, §6). Save as is a page of File: replace or copy, name and folder for a copy, format, quality, sizes. | One place for every choice, and the quick path stays quick. |
| D5 | Zoom is in the status bar: out, slider, in, percentage, Fit. | Owner's call. Where Word and the Photos apps put it. |
| D6 | The File page is an element in Services.Media, not in the editor and not in the core desktop. The Image Editor is its first user. | It is about media files (recent media, the media picker, saving media items), so any app that opens and saves media is a future user. Games are not, which keeps it apart from #112. Owner: "for now it is". |
| D7 | Issue #112 (a menu bar for the games' button rows) stays separate and is not part of this work. | #112 was filed for Solitaire and the other games, and the File page is not for them. |
| D8 | On a save that crops, rotates or flips the picture, the item's focal point and named crops are reset. Other changes keep them. | Owner's choice of the simplest option. Resize, adjust, markup and redact do not move what the fractions point at, so they keep them. |
| D9 | Our own UI on Fabric.js (MIT) and Cropper.js v2 (MIT). No complete editor library. | §8. The complete MIT editors are archived (TOAST UI) or pull in React (Filerobot), and both have a fixed look no theme can restyle. |
| D10 | MIT notices ship in the package and in the built file, and the build fails on a bundled package that is not permissive or not listed. | Owner: "make sure we adhere to the MIT license". §9. |
| D11 | Save and a "..." button share the right corner of the mode bar. Save is Umbraco's green Save button; "..." opens the file menu. Undo and redo are alone on the left. No File tab and no word "File". | Owner, 2026-10-18, option A of `file-menu.html`: "feels the most Umbraco native". One click to save stays; the rest is one click away, in one corner. |
| D12 | The file menu slides in from the right, inside the editor window, the way Umbraco's own side panels do: Open, Save, Save as, Info, Close. Save acts at once; Open, Save as and Info each slide their own panel over the menu, with an arrow back. | Owner: "not a full screen overlay, but a sliding modal", "almost all options will open a new modal". The panels keep the File page's content, which he liked. |
| D13 | The modes look like Umbraco's tabs: an icon over the name, and a line under the one in use. | Owner: the image manipulation options should look like Umbraco's own tabs. A filled tab is what made Save read as a tab. |
| D14 | With nothing open, the empty canvas shows Open's content: recent images, Browse, Upload. | There is no File page left to start on. My call, shown in scene 6 and accepted with the mock. |

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

> **Replaced by the file menu (§14).** What each page offers (Open's recent images, Browse and
> Upload; Save as's choices; Info) carries over unchanged into the menu's panels. What changed is the
> container: a menu sliding in from the right instead of a page over the window.

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

## 14. The file menu (redesign after the real run)

Decided with the owner on 2026-10-18, after he used the first build in a real backoffice. Mock:
[`mockups/image-editor/file-menu.html`](mockups/image-editor/file-menu.html), bar option A and
scenes 1 to 6. Decisions D11 to D14 in §3; this section is the detail.

His words: "I don't like the save and file buttons separately. And 'file' doesn't sound right. I
think we should have one button with ... at the right corner where the save button is. That should
open the overlay we now have under 'file'. I do like that overlay. It shouldn't be a full screen
overlay though, but only like a sliding modal with open/save/save as/exit etc. options. Almost all
options will open a new modal." And: Save drawn like an active mode tab is weird.

Other editors were looked at for the shape (Windows 11 Photos, macOS Photos, iOS Photos): tools as
a row of tabs, one save button at the right, rarer file commands in a small menu. None has a File
page. The owner wants it moderately simple, not Photoshop.

### 14.1 The bar

Left to right: undo and redo; the five modes, centred; Save and "..." in the right corner.

- **The modes** are tabs in Umbraco's look (D13): the icon above the name, and a line under the
  mode in use. No filled background. Disabled and greyed with nothing open, never hidden.
- **Save** is a text button in Umbraco's Save colours (green in the Umbraco theme). Disabled when
  there is nothing to save. Ctrl+S does the same. It is never drawn like a tab.
- **"..."** is an icon button with Umbraco's own three dots (`uui-symbol-more`, as on its entity
  action menus), and "More" as its label for screen readers. It opens the file menu
  and shows pressed while the menu is open. Enabled with nothing open, for Open and Close.

### 14.2 The menu

A panel that slides in from the window's right edge over the mode's panel, the full height of the
window under the title bar, with the rest of the window dimmed. It stays inside the editor window
and does not use Umbraco's modal manager, whose modals cover the whole backoffice and every other
window (my call; the owner accepted it with the mock). The title bar stays live, so the window can
still be moved and closed.

| Command | Line under it | Key | What it does |
|---|---|---|---|
| Open | Another image from the media library | Ctrl+O | Slides the Open panel over the menu |
| Save | Write over *name* | Ctrl+S | Saves at once and puts the menu away |
| Save as | A copy, or another format | Ctrl+Shift+S | Slides the Save as panel over the menu |
| Info | Size, format, folder, last change | | Slides the Info panel over the menu |
| Close | Close the Image Editor | | Closes the window, through the unsaved-changes guard |

Close sits apart from the other four, as in the mock. "Exit" and "Close" are one command, Close
(my call, accepted with the mock). Save, Save as and Info are disabled with nothing open; Save also
when there is nothing to save.

The menu goes away on Escape, a click on the dimmed window, its own Close menu button, or "..."
again. It is a dialog to assistive technology: focus moves to its first enabled command when it
opens and back to "..." when it closes, and Tab stays inside it. It slides in quickly and simply
appears under `prefers-reduced-motion` (my calls). The keys work without opening it: Ctrl+O opens the menu straight on the Open panel,
Ctrl+Shift+S straight on Save as.

### 14.3 The panels

Open, Save as and Info each slide in over the menu, wider than it, with a back arrow before their
title that returns to the menu. Their content is what the File page's pages had (§5), with their
buttons moved into the panel's footer, where Umbraco puts a side panel's actions:

- **Open**: the recent images, Browse the media library, Upload from this computer. Footer: Cancel.
- **Save as**: Replace or Save a copy, name and folder, format, quality, sizes, the preview, the
  address warning. Footer: Cancel and the green action, which says what it does (Save copy, or
  Replace *name*).
- **Info**: the item's details in one box. Footer: Close.

Escape on a panel puts the whole menu away, back to the picture; the arrow is the way back to the
menu (my call). Opening an image or a successful save puts it away too. A failed save keeps the
panel open with the reason, as the File page did.

An item whose format cannot be kept (§6): Save, by button or Ctrl+S, opens the menu straight on Save
as, on PNG with the warning, as it opened File on Save as before.

### 14.4 Nothing open

The editor starts with the canvas showing Open's content (D14): "Open an image", the recent images,
Browse and Upload. The modes, undo, redo and Save are drawn and greyed; "..." works.

### 14.5 Sizes

The menu is narrower than the panels, and each panel has its own width; every one is capped at the
window's width, so a small window gets a full-width panel rather than a cut one. Save as's content
already fits the old File page's body at the smallest window (520 px), so the editor's smallest
size need not grow. The numbers are the builder's, derived into constants that the CSS and the
size tests both read, as `FILE_PAGE_MIN_SIZE` is now; the mock's 380, 760, 940 and 460 px are a
starting point measured on a 1480 px window.

### 14.6 Themes

Two looks are new to the app tokens: the main action's colours (Save, and the green footer
buttons) and the line under the tab in use. Neither has a token today (`app-accent` is what made
Save look like a tab), so both go into the desktop's app token group and every theme gets them, per
`docs/developer/theming.md`: green and Umbraco's pink line in the Umbraco themes, and each other
theme its own idiom for a default button and a current tab. The panels use the surface, border and
text tokens the File page already used. The menu and every panel are checked under all five themes
in a real backoffice.

### 14.7 What changes in code

- Services.Media: the File page element becomes the file menu element, with the menu and the three
  panels. The element, its tag, `show()` and its events may change name and shape: nothing is
  released. Open's content is reachable on its own as well, for the empty canvas (D14). The types
  copied into the Media package (`shared/file-page.ts`) and the developer page
  (`opening-and-saving-media.md` §7) change in step.
- Media: the mode bar loses the File tab and gains "..."; Save and the tabs get the new look; the
  editor renders the menu instead of the page, and Open's content on the empty canvas.
- The uncommitted hover fix in `mode-bar.ts` (a pressed tab and Save keep their colours under the
  pointer) is kept in spirit: with the tabs no longer filled, its test changes to what the new look
  needs, and Save keeps its colours under the pointer.
- Words: the new labels and lines ("More", each command's line, Close menu, Open an image) go into
  both packages' `en.ts` and `nl.ts`, which their parity tests hold together.
- Docs: the user guide page and its screenshot, the developer page §7, and this section's outcome
  once built.

### 14.8 Outcome (built 2026-10-18)

Built test-first in this branch, uncommitted. Checked in a real backoffice on this worktree's
instance under all five themes: the empty canvas, opening from it, the bar's look (Save in the action
colour, the tab in use underlined and not filled), the menu and its three panels at their widths and
against the window's right edge, the arrow back, Escape, and a real Save from the menu's own Save.

- **Names.** The element is `<umbradesktop-media-file-menu>` (`FILE_MENU_TAG`), in Services.Media's
  `file-menu/`. Open on its own is `<umbradesktop-media-open-view>` (`OPEN_VIEW_TAG`), which fires
  the same `open` and `failed` events. `show(panel = 'menu')` takes `'menu' | 'open' | 'saveAs' |
  'info'`; the Save page is gone, since Save is a command. `-back` became `-hidden`, fired whenever the
  menu goes away, whatever put it away. A `label` property gives the menu its title and Close its
  line ("Close Image Editor").
- **Tokens.** `--umbradesktop-app-action` and `--umbradesktop-app-action-text` (the main action's
  fill and text, held to 4.5:1 in `app-tokens.test.ts` like the accent pair) and
  `--umbradesktop-app-current` (the line under the tab in use). Fallbacks are Umbraco's
  `--uui-color-positive`, `-positive-contrast` and `--uui-color-current`. Umbraco 4 uses a darker
  green, macOS and Windows 11 their accent button, and Windows 98 its plain grey face with the bevel,
  since it had no coloured buttons. The Save copy button in Save as uses the same pair.
- **Sizes.** Menu 380 px, panels 760, 940 and 460 px, each capped at the editor's width.
  `FILE_MENU_MIN_SIZE` is 520 × 542: Save as's form and the narrowest preview across, and its tallest
  content (366 px, a copy, measured) between the panel's two 64 px bars. The editor's smallest box is
  now derived from its own tallest panel (Adjust, 432 px, measured) and the menu's box, which made it
  542 px tall instead of 608.
- **"..."** is `uui-symbol-more`, Umbraco's own three dots. `icon-navigation-horizontal`, the first
  pick, is a double arrow (and already Crop's flip).
- **A command's line** wraps to two lines and is cut after that. One line was cut short under Umbraco
  4, whose Verdana is wider, and the Save line carries the item's name, which can be long.
- The open view is drawn on the canvas over the empty stage; its white page ground is the surface
  token, not the sunken canvas grey of the mock.
