# Image Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **No commits.** The owner reviews one uncommitted diff. Where the skill's task template has a
> "Commit" step, this plan has none: leave the work in the working tree and move on. Never commit,
> push, tag or open a pull request unless the owner asks in that message.

**Goal:** Ship issue #136: a new UmbraDesktop Media add-on whose Image Editor crops, adjusts, marks
up, redacts and resizes a media library image and saves it back or as a copy, with its file commands
on a File page that Services.Media offers to every media app.

**Architecture:** Services.Media gains three published, plain-data additions (open by key with richer
file facts, a per-user recent list, an optional `resetFocalPoint` on save) and one custom element,
`umbradesktop-media-file-page`, that owns Open, Save, Save as, Info and Close. The new add-on
`Umbraco.Community.UmbraDesktop.Media` holds the editor: pure modules for formats, geometry, history,
the focal-point rule and rendering, under a Lit shell that draws Fabric.js and Cropper.js inside the
desktop's app tokens. The core desktop gains two small published app channels (window title, close
request) that the design's title bar and Close assume.

**Tech Stack:** TypeScript, Lit (through `@umbraco-cms/backoffice/external/lit`), Vite 7 lib mode,
web-test-runner in Chrome, Fabric.js 7.4, Cropper.js 2.3, .NET 10 Razor class library for packing.

**Spec:** [`docs/design/2026-10-17-image-editor-design.md`](2026-10-17-image-editor-design.md).
Mocks: [`mockups/image-editor/image-editor.html`](mockups/image-editor/image-editor.html) (scenes 1 to
7 and the theme section are the target) and `commands.html` option C. Read the design first; §3 is
the decision table and is not reopened here.

All paths below are relative to the worktree root
`D:\github\Umbraco.Community.UmbraDesktop\.claude\worktrees\136-image-editor`. Short names:
**Host** = `src/Umbraco.Community.UmbraDesktop`, **SM** = `src/Umbraco.Community.UmbraDesktop.Services.Media`,
**Media** = `src/Umbraco.Community.UmbraDesktop.Media` (new). `backoffice/src` is abbreviated `bo/`.

## Global Constraints

- Never commit, push, tag or open a PR. Leave everything uncommitted.
- Test-first on every task: write the test, run it and see it fail for the reason expected, then implement.
- In every package touched, `npm run build` **and** `npm test` both pass (they check different things; see `CLAUDE.md`).
- JSDoc on every type, member and function, private ones included, saying why. Match the density of the neighbouring files.
- Nothing is imported between packages. The Media add-on reaches Services.Media by the context alias `'UmbraDesktopMediaContext'` and the element by its tag name, with copied types, as Accessories' `shared/media-service.ts` does.
- `rollupOptions.external: [/^@umbraco/]` in every Vite config. Lit is imported from `@umbraco-cms/backoffice/external/lit`, never from `lit`, so the only bundled npm code is Fabric and Cropper.
- Exact versions in `Media/package.json`: `"fabric": "7.4.x"` pinned to the newest 7.4 patch at install time, written as an exact version (no `^`), and `"cropperjs"` likewise at 2.3.x. Their Node-only optional dependencies (`jsdom`, `canvas`) must not appear in the bundle.
- Bundled npm licences allowed: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC. Anything else fails the build (§9).
- Aliases are final once shipped: prefix `Umbraco.Community.UmbraDesktop.Media`; app alias `Umbraco.Community.UmbraDesktop.Media.ImageEditor`; element tag `umbradesktop-image-editor`; localisation area `umbraDesktopMedia`.
- File page tag `umbradesktop-media-file-page`. Recent list storage key `umbradesktop-media-recent:<user unique>` in `localStorage`, every access in try/catch.
- Default quality 90 for JPEG and WebP. Formats offered: Keep, JPEG, PNG, WebP. AVIF never offered. SVG refused on open.
- Keep = the item's own format when it is JPEG, PNG or WebP; anything else (GIF, BMP) cannot be kept and defaults to PNG.
- D8: a save whose picture was cropped, rotated or flipped since the last save sends `resetFocalPoint: true`. Resize, adjust, markup and redact never do.
- Disabled, never hidden: with nothing open, the modes, undo, redo and Save are drawn and disabled; File pages that need a file are drawn and disabled.
- A theme may restyle, never remove. Everything paints with `--umbradesktop-app-*` tokens and `background:` (never `background-color:`) for surfaces (`docs/developer/theming.md` §4).
- Derive numbers: the 320px panel width, the editor's sizes and every number shared by CSS and JS live in one `constants.ts` constant that both read.
- Any link the editor or File page renders carries `data-router-slot="disabled"`.
- README files are Markdown only, no raw HTML. Images by relative path.
- Every user-facing string in `en.ts` and `nl.ts` of the package that says it; the parity test keeps them equal.

## Review Focus

Inputs the design implies that no task would otherwise test, most likely to bite first. Each has its
test in the owning task.

1. **A very large photo** (6000 × 4000 or more, beyond the default WebGL texture size): the saved file has the full resolution and the adjustments, not a silently downscaled or unfiltered picture. Test in Task 14.
2. **Undo past a save, then save again**: the focal-point reset compares against what was last saved, not against what was opened, and the unsaved dot follows the saved point. Tests in Tasks 12 and 13.
3. **Save a copy, keep editing, press Save**: the second save writes over the copy, with the copy's update date, never over the original. Test in Task 7.
4. **A recent item that was deleted, trashed or is no longer visible to this user**: the Open page leaves it out and forgets it, and never throws. Test in Task 6.
5. **A phone photo with an EXIF orientation**: it is upright in the editor and saved upright, with the dimensions swapped accordingly. Test in Task 14.

---

## Phase A: the core desktop

### Task 1: An app can set its window title and close its own window

The design's title bar shows the open item's name (§4) and File → Close closes the window through the
unsaved guard (§5). Apps have neither channel today: the title is always `meta.label`, and only the
window manager's `requestClose` closes a window. Both are added the way the dirty attribute was, as
published names an app writes without importing anything.

**Files:**
- Modify: `Host/bo/desktop/constants.ts` (next to `UMBRADESKTOP_DIRTY_ATTRIBUTE`, line 61)
- Modify: `Host/bo/desktop/components/app-host.element.ts` (beside the dirty watch, lines 300 to 330)
- Modify: the window element that renders the title from the app host's events (`Host/bo/desktop/components/window.element.ts`) and the taskbar button label that reads the same title
- Test: `Host/bo/desktop/components/window-app-title.test.ts` (new), modelled on `window-app-dirty.test.ts`
- Docs: `docs/developer/desktop-apps.md` §7, two short subsections

**Interfaces:**
- Produces: `UMBRADESKTOP_TITLE_ATTRIBUTE = 'data-umbradesktop-title'`. Its value, when present and non-empty, is the window's title and taskbar label; absent or empty, `meta.label` as today.
- Produces: `UMBRADESKTOP_CLOSE_REQUEST_EVENT = 'umbradesktop-close-request'`. An app dispatches it on its own element (`bubbles: true, composed: true`); the window runs `requestClose(id)`, so the dirty guard asks first.

- [ ] **Step 1: Write the failing tests** in `window-app-title.test.ts`:
  - `it('titles the window with the app's title attribute, and falls back to the label without one')`: mount a window whose app sets `data-umbradesktop-title="beach.jpg"`; expect the titlebar text and the taskbar label `beach.jpg`; remove the attribute; expect the manifest label.
  - `it('closes the window when its app asks, through the unsaved guard')`: app dispatches `umbradesktop-close-request`; window gone. With `data-umbradesktop-dirty` set, the guard's question is asked and a "no" keeps the window.
- [ ] **Step 2: Run** `npm test` in Host. Expected: both fail (title is the label; nothing closes).
- [ ] **Step 3: Implement.** Watch the title attribute with the same `MutationObserver` the dirty watch uses (one observer, two attribute filters) and emit an internal event like `UMBRADESKTOP_APP_DIRTY_EVENT`. Listen for the close request on the app host and call the window manager's `requestClose`.
- [ ] **Step 4: Run** `npm test` and `npm run build` in Host. Expected: PASS, and the docs check is green after the §7 additions.

---

## Phase B: Services.Media

Run every SM step from `SM/`. The context, its types and the developer page are published API: each
change only adds optional fields or new members.

### Task 2: `resetFocalPoint` on save

**Files:**
- Create: `SM/bo/files/file-value.ts`
- Modify: `SM/bo/files/media-save.ts` (`MediaSaveRequest`, `createMediaSaver`, `replaceFile`)
- Test: `SM/bo/files/file-value.test.ts`

**Interfaces:**
- Produces: `MediaSaveRequest.resetFocalPoint?: boolean`.
- Produces: `fileValueFor(current: unknown, temporaryFileId: string, resetFocalPoint: boolean): Record<string, unknown>`, the `umbracoFile` value `replaceFile` saves.

- [ ] **Step 1: Write the failing tests:**

```ts
const value = { src: '/media/a/beach.jpg', focalPoint: { left: 0.3, top: 0.6 },
  crops: [{ alias: 'hero', width: 1600, height: 900, coordinates: { x1: 0.1, y1: 0.2, x2: 0.1, y2: 0.2 } }] };

it('keeps the focal point and every crop when the picture was not reframed', () => {
  expect(fileValueFor(value, 't1', false)).to.deep.equal({ ...value, temporaryFileId: 't1' });
});
it('drops the focal point and every crop\'s coordinates, keeping the crops themselves', () => {
  expect(fileValueFor(value, 't1', true)).to.deep.equal({ src: value.src, temporaryFileId: 't1', focalPoint: null,
    crops: [{ alias: 'hero', width: 1600, height: 900, coordinates: null }] });
});
it('treats a value with no crops or no value at all as empty', () => {
  expect(fileValueFor(null, 't1', true)).to.deep.equal({ temporaryFileId: 't1', focalPoint: null, crops: [] });
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `fileValueFor`, and use it in `replaceFile` in place of the inline spread (line ~243). Pass `resetFocalPoint` from the request through `createMediaSaver`. A new item ignores the field.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 3: Open by key, with the facts the File page and the editor need

The File page's recent list opens an item without the picker, Info shows its folder, and Crop draws
the current focal point. `open()` gains an optional argument; `OpenedMedia` gains optional fields.

**Files:**
- Modify: `SM/bo/files/media-open.ts`, `SM/bo/context/media.context.ts`
- Test: `SM/bo/files/media-open.test.ts` (new), `SM/bo/context/media.context.test.ts`

**Interfaces:**
- Produces: `interface MediaOpenOptions { unique?: string }`; `context.open(options?: MediaOpenOptions): Promise<MediaOpenResult>`; `MediaContextDeps.open(host, options?)`.
- Produces on `OpenedMedia`: `folder?: string | null` (parent key, null at the root), `folderName?: string`, `focalPoint?: { left: number; top: number } | null`.
- Produces: `openedFrom(detail, fileBlob, folder: { unique: string | null; name?: string }): OpenedMedia | null`, the pure mapping `createMediaOpener` uses.

- [ ] **Step 1: Write the failing tests.** In `media-open.test.ts`, `openedFrom` with a hand-built detail model: maps name, extension from `src`, `updateDate`, `focalPoint` from the `umbracoFile` value (null when absent), `folder` and `folderName`; returns null when there is no `src`. In `media.context.test.ts`: `it('passes the key to open, so a recent item opens without the picker')` (the fake records `options.unique`).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** With `options.unique` skip the picker. Read the parent from the media item repository (`UmbMediaItemRepository.requestItems`), whose item model carries the parent; check the installed `@umbraco-cms/backoffice` typings before writing it, and if the detail model already carries the parent use that instead. The folder's name comes from one more item request; the root has no name.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: PASS.

### Task 4: The recent list in the media context

**Files:**
- Create: `SM/bo/recent/recent-media.ts`
- Modify: `SM/bo/context/media.context.ts`
- Test: `SM/bo/recent/recent-media.test.ts`, `SM/bo/context/media.context.test.ts`

**Interfaces:**
- Produces: `interface RecentMediaEntry { unique: string; name: string; extension: string; folder: string | null; folderName?: string; at: number }`.
- Produces: `RECENT_LIMIT = 12`; `recentKeyFor(userUnique: string): string`.
- Produces: `class RecentMediaList { constructor(storage: Pick<Storage, 'getItem' | 'setItem'> | null, key: string, limit?: number); list(accept?: readonly string[]): RecentMediaEntry[]; record(entry: Omit<RecentMediaEntry, 'at'>, now?: number): void; forget(unique: string): void }`.
- Produces on the context: `recent(accept?: readonly string[]): Promise<RecentMediaEntry[]>` and `forgetRecent(unique: string): void`. The context records every `opened` open and every `ok` save, by any app. The user key comes from `UMB_CURRENT_USER_CONTEXT`; until it is known, nothing is recorded or listed.

- [ ] **Step 1: Write the failing tests** in `recent-media.test.ts` (a `Map`-backed fake storage):
  - newest first; recording an item already listed moves it to the top and updates its name, extension and folder;
  - keeps at most `RECENT_LIMIT`, dropping the oldest;
  - `list(['jpg', 'png'])` leaves out a `txt` entry; `list()` lists all;
  - a save over an item records it without a folder (the request has none) and keeps the folder an earlier entry knew;
  - two user keys keep two lists;
  - storage that throws on read or write, or `null` storage, lists nothing and never throws;
  - corrupt JSON in storage lists nothing.
  In `media.context.test.ts`: `it('records what any app opens or saves, and lists it per user')`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `RecentMediaList` and wire it into the context's `open` and `save`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 5: The File page element: frame, pages and states

**Files:**
- Create: `SM/bo/file-page/types.ts`, `SM/bo/file-page/formats.ts`, `SM/bo/file-page/file-page.element.ts`, `SM/bo/file-page/constants.ts`
- Modify: `SM/bo/context/media.context.ts` (one side-effect import of the element module, so the tag is defined whenever the context is), `SM/bo/localization/en.ts`, `nl.ts`
- Test: `SM/bo/file-page/formats.test.ts`, `SM/bo/file-page/file-page.element.test.ts`

**Interfaces (published; copied verbatim into the developer page in Task 8):**

```ts
type FilePageName = 'open' | 'save' | 'saveAs' | 'info';
type SaveFormat = 'jpeg' | 'png' | 'webp';
interface FilePageDocument {
  unique: string | null;          // null: never saved
  name: string;                   // as the person typed it, which a save renames the item to
  folder: string | null;
  folderName?: string;
  updateDate?: string | null;
  extension: string;              // the item's file extension now
  width: number; height: number;  // as it will be saved
  bytes: number;                  // the item's file size now
}
type FileEncoder = (format: SaveFormat, quality: number) => Promise<Blob>;
interface FileSavedDetail { unique: string; updateDate?: string | null; name: string; extension: string;
  folder: string | null; folderName?: string; copy: boolean }
type FileSaveOutcome = { status: 'saved'; saved: FileSavedDetail } | { status: 'needs-save-as' }
  | { status: 'cancelled' } | { status: 'failed'; message?: string };
```

- Element properties: `document: FilePageDocument | null`, `dirty: boolean`, `accept: string[]` (extensions), `encode?: FileEncoder`, `preview?: string` (an image URL of the picture as it will be saved), `resetFocalPoint: boolean`, `open: boolean` (reflected).
- Methods: `show(page: FilePageName, options?: { format?: SaveFormat }): void`, `hide(): void`, `save(): Promise<FileSaveOutcome>`.
- Events, dispatched on the element: `umbradesktop-media-file-open` (detail: `OpenedMedia`), `umbradesktop-media-file-saved` (`FileSavedDetail`), `umbradesktop-media-file-failed` (`{ message?: string }`), `umbradesktop-media-file-back`, `umbradesktop-media-file-close`.
- `formats.ts`: `DEFAULT_QUALITY = 90`; `keepFormatFor(extension: string): SaveFormat | null` (`jpg`/`jpeg` → `jpeg`, `png`, `webp`, else null); `mimeFor(format)`; `extensionFor(format, originalExtension)` (keeps `jpeg` vs `jpg` when the format is unchanged, else `jpg`/`png`/`webp`); `addressChanges(extension, format): boolean`; `copyNameFor(name: string, pattern: string): string` (pattern from the dictionary, `%0% (copy)` / `%0% (kopie)`).
- `constants.ts`: `FILE_PAGE_TAG`, `PAGE_LIST_WIDTH` (the 180px list in scene 1, shared by CSS and the fit test), and `FILE_PAGE_MIN_SIZE` (derived from the list width and the Save as page's widest row; measured in Task 8).

- [ ] **Step 1: Write the failing tests.** `formats.test.ts` covers each mapping above, including `keepFormatFor('gif') === null`, `keepFormatFor('JPG') === 'jpeg'`, `extensionFor('jpeg', 'jpeg') === 'jpeg'`, `extensionFor('jpeg', 'png') === 'jpg'`, `addressChanges('png', 'png') === false`, `addressChanges('jpg', 'webp') === true`, and `copyNameFor('beach', '%0% (copy)') === 'beach (copy)'`. `file-page.element.test.ts`:
  - with `document = null`: Open is enabled; Save, Save as and Info are drawn and `disabled`; Close is enabled;
  - with a document every page is enabled;
  - `show('saveAs')` selects that page and sets `open`; Back to the picture fires `umbradesktop-media-file-back` and clears `open`; Close fires `umbradesktop-media-file-close`;
  - each page button is a real `<button>` reachable by Tab, with its label from the dictionary.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the frame: page list on the left (`PAGE_LIST_WIDTH`), the chosen page on the right, "Back to the picture" at the top of the list. Paint the selected page with `--umbradesktop-app-accent` and `--umbradesktop-app-accent-text`. Big targets, per D2.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: PASS.

### Task 6: The Open page

**Files:**
- Create: `SM/bo/file-page/open-page.ts` (the page's template and logic, used by the element)
- Modify: `SM/bo/file-page/file-page.element.ts`, dictionaries
- Test: `SM/bo/file-page/open-page.test.ts`

**Interfaces:**
- Consumes: `context.recent(accept)`, `context.forgetRecent(unique)`, `context.open(options?)` (Tasks 3 and 4).
- Produces: `interface FilePageDeps { context: Pick<UmbraDesktopMediaContext, 'open' | 'recent' | 'forgetRecent' | 'save' | 'pickSaveFolder' | 'confirmOverwrite'>; thumbnails(uniques: string[]): Promise<Map<string, string>>; confirmDiscard(): Promise<boolean> }`, set on the element by a test; the real one resolves thumbnails through Umbraco's imaging repository and asks with `umbConfirmModal`.

- [ ] **Step 1: Write the failing tests** (fake deps):
  - lists recent entries filtered by `accept`, as tiles with thumbnail, name and folder name;
  - **Review Focus 4:** an entry the thumbnail resolver does not answer for (deleted, trashed, no access) is not shown and `forgetRecent` is called for it; a resolver that rejects shows the list without thumbnails and no error;
  - a tile tap calls `open({ unique })` and fires `umbradesktop-media-file-open` with the result; `cancelled` fires nothing; `failed` fires `umbradesktop-media-file-failed` with the name;
  - with `dirty = true`, a tap asks `confirmDiscard` first and a "no" opens nothing;
  - Browse the media library and Upload from this computer both call `open()` (the picker, which has its own Upload);
  - with no recent entries the page says so and still offers Browse and Upload.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Check the imaging repository's method for thumbnail URLs in the installed typings (`@umbraco-cms/backoffice/imaging`) and wrap it as `thumbnails`. Do not filter the media picker by extension unless its `pickableFilter` item model carries one; the app refuses an unsuitable file after open, as the developer page already says.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 7: Save, Save as and Info

**Files:**
- Create: `SM/bo/file-page/save-flow.ts` (pure decisions and the save call), `SM/bo/file-page/save-as-page.ts`, `SM/bo/file-page/info-page.ts`
- Modify: `SM/bo/file-page/file-page.element.ts`, dictionaries
- Test: `SM/bo/file-page/save-flow.test.ts`, `SM/bo/file-page/save-as-page.test.ts`

**Interfaces:**
- Produces: `interface SaveChoice { mode: 'replace' | 'copy'; name: string; folder: string | null; folderName?: string; format: SaveFormat; quality: number }`.
- Produces: `saveAsDefaults(document: FilePageDocument, copyPattern: string, format?: SaveFormat): SaveChoice` (mode replace, format = the option passed, else `keepFormatFor` or `png`, quality `DEFAULT_QUALITY`, copy name from the pattern, folder = the document's).
- Produces: `runSave(deps: FilePageDeps['context'], document: FilePageDocument, choice: SaveChoice, encode: FileEncoder, resetFocalPoint: boolean): Promise<FileSaveOutcome>`: encodes, builds the `File` (name from `document.name` plus `extensionFor`), saves with `existing` and `expectedUpdateDate` for replace and without them for copy, asks `confirmOverwrite` on a conflict and retries with `force`, and sends `resetFocalPoint` only on replace.
- Element `save()`: when `keepFormatFor(document.extension)` is null, it calls `show('saveAs', { format: 'png' })` and resolves `needs-save-as`; otherwise `runSave` with the Keep choice.

- [ ] **Step 1: Write the failing tests** in `save-flow.test.ts` (fake context recording requests):
  - replace sends `existing`, `expectedUpdateDate`, `resetFocalPoint`; copy sends neither and uses the chosen folder;
  - conflict → `confirmOverwrite` yes → second save with `force: true`; no → `cancelled`, nothing written;
  - a refused save answers `failed` with the backoffice's message;
  - the saved file's name: `beach.jpg` kept as JPEG is `beach.jpg`; as WebP is `beach.webp`; a renamed document `sunset` saves `sunset.jpg` and `name: 'sunset'`;
  - **Review Focus 3:** after a copy, a `FileSavedDetail` with `copy: true` and the copy's key comes back; feeding that into the document and calling `runSave` again with Keep writes over the copy's key with the copy's update date.
  In `save-as-page.test.ts`:
  - the two big choices, Replace *name* and Save a copy; a copy shows the name field and the folder with Change..., which calls `pickSaveFolder`;
  - the format list is Keep, JPEG, PNG, WebP (no AVIF); quality shows only for JPEG and WebP;
  - choosing a format other than the item's shows the address warning; Keep or the same format hides it;
  - After is measured: `encode` is called with the chosen format and quality, debounced, and its `size` is shown; Now is `document.bytes`;
  - opened with `{ format: 'png' }` for a GIF, PNG is chosen and the warning shows;
  - the preview image is the `preview` property.
  Info: name, folder name, dimensions, size, format and last updated from `document`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** The Save page says what it did ("Saved", or the failure) and runs `save()`. Debounce the After measurement by 300ms, and drop a stale result if a newer choice was made.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: PASS.

### Task 8: File page under every theme, and the Services.Media docs

**Files:**
- Create: `SM/bo/file-page/fits.test.ts`
- Modify: `SM/docs/developer/opening-and-saving-media.md` (new §: the File page; `open(options)`, the new `OpenedMedia` fields, `recent`, `resetFocalPoint`), `SM/README.md`, `SM/Umbraco.Community.UmbraDesktop.Services.Media.csproj` `Description` (name the Media add-on beside Accessories), `RELEASE.md` row for Services.Media
- Possibly modify: `Host/bo/desktop/theme/types.ts` and the five palettes, only if Step 3 finds a gap

- [ ] **Step 1: Write the test** `fits.test.ts`, modelled on Accessories' `fits.test.ts`: under no theme and each of `umbraco`, `umbraco4`, `macos`, `win11`, `win98` (as `data-umbradesktop-theme`), at `FILE_PAGE_MIN_SIZE` (a new constant in `SM/bo/file-page/constants.ts`, published on the developer page as the smallest box an app may give the page), every page button, Back, and every control of the Save as page is inside the element's box, non-zero in size, and reachable by Tab. The editor's `IMAGE_EDITOR_MIN_CONTENT_SIZE` (Task 9) must be at least this plus the mode bar's height, since the page covers the window under the mode bar; Task 9 copies the number with a comment naming its source, because nothing is imported between packages.
- [ ] **Step 2: Run** `npm test` first with the box deliberately 100px narrower than `FILE_PAGE_MIN_SIZE`. Expected: FAIL, naming the clipped control. Then at the real size: PASS, or fix the layout until it does.
- [ ] **Step 3: Look at the page in all five themes** on a real desktop (Task 22's instance, or the host's theme preview). If one theme cannot draw the selected page natively with the existing app tokens, add the missing token to the app group per `docs/developer/theming.md` and give it a value in every palette, with `app-tokens.test.ts` green. Write down the outcome either way in design §5.
- [ ] **Step 4: Update the developer page.** Copy the Task 5 interfaces verbatim, show the minimal use (set properties, listen to the five events, call `save()`), and add `resetFocalPoint` to the save table.
- [ ] **Step 5: Run** `npm test` and `npm run build` in SM (and in Host if a token was added). Expected: PASS, docs check green.

---

## Phase C: the Media add-on

Run every Media step from `Media/`.

### Task 9: The package

**Files:**
- Create: `Media/Umbraco.Community.UmbraDesktop.Media.csproj` (copy of Accessories' minus StickyNotes and its API references; `Title` "UmbraDesktop Media Add-on"; `Description` one sentence; `PackageTags` `umbraco;backoffice;desktop;umbradesktop;media;image-editor;crop;resize;redact;umbraco-marketplace`; ProjectReferences to the host and Services.Media with Accessories' comments adapted)
- Create: `Media/package.json` (`name` `umbradesktop-media`, scripts as Accessories, `fabric` and `cropperjs` exact), `Media/README.md`, `Media/THIRD-PARTY-NOTICES.md` (filled in Task 10)
- Create: `Media/backoffice/{tsconfig.json,vite.config.ts,web-test-runner.config.mjs}`, `Media/backoffice/public/umbraco-package.json` (bundle `/App_Plugins/Umbraco.Community.UmbraDesktop.Media/umbradesktop-media.js`)
- Create: `Media/bo/bundle.manifests.ts`, `Media/bo/shared/area.ts` (`AREA = 'umbraDesktopMedia'`), `Media/bo/umbradesktop-app.d.ts` (copy), `Media/bo/localization/{en.ts,nl.ts,manifest.ts,parity.test.ts}`, `Media/bo/image-editor/constants.ts`, a placeholder `Media/bo/image-editor/image-editor.element.ts`
- Create: `Media/docs/product.json` (`id` `media`, `name` "UmbraDesktop Media Add-on", `packageId`, `docsRoot`), `Media/docs/user/image-editor.md` (front matter and a one-paragraph stub; written in full in Task 22)
- Create: `umbraco-marketplace-umbraco.community.umbradesktop.media.json` (root; Accessories' file as the model, `RelatedPackages` Requires the host; no `Screenshots` until the file exists)
- Modify: `Umbraco.Community.UmbraDesktop.app.slnx`, `src/Umbraco.Community.UmbraDesktop.TestInstance/Umbraco.Community.UmbraDesktop.TestInstance.csproj` (ProjectReference), `.github/actions/build-packages/action.yml` (every list: cache-dependency-path, NuGet cache key with `Media/packages.lock.json`, restore, npm ci, test, build, dotnet build, pack), `.github/workflows/ci.yml` (cache-dependency-path, build frontends), `RELEASE.md` ("Six packages", a table row, the lockstep note)
- Test: `Media/bo/bundle.manifests.test.ts`

**Interfaces:**
- Produces: a catalogue group (see choice 2 at the end; default `{ alias: 'media', label: '#umbraDesktopMedia_groupMedia', weight: 52 }`), one `umbraDesktopApp` `Umbraco.Community.UmbraDesktop.Media.ImageEditor` with `element`, `weight: 1000`, `meta: { label: '#umbraDesktopMedia_imageEditor', icon: 'icon-picture', group, defaultSize: IMAGE_EDITOR_CONTENT_SIZE, minSize: IMAGE_EDITOR_MIN_CONTENT_SIZE, allowMultiple: true }`, an `umbraDesktopDocs` manifest, the two localisation manifests.
- Produces in `constants.ts`: `PANEL_WIDTH = 320`, `IMAGE_EDITOR_CONTENT_SIZE`, `IMAGE_EDITOR_MIN_CONTENT_SIZE`, both derived from the mode bar's needs and the panel width (min width = narrowest canvas + `PANEL_WIDTH`), `ACCEPT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']`.

- [ ] **Step 1: Write the failing test** `bundle.manifests.test.ts`, modelled on Accessories': one app with the alias above and `element` (never `js`), its group is defined by this package's catalogue, it registers docs and en+nl dictionaries, no `conditions`. Parity test as Accessories'.
- [ ] **Step 2: Run** `npm install`, then `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the manifests and the scaffolding listed above.
- [ ] **Step 4: Run** `npm test`, `npm run build`, then from the root `dotnet restore` and `dotnet build` of the new csproj (this writes its `packages.lock.json`, which is committed with the rest), and `dotnet pack` to a scratch folder. Expected: PASS; `unzip -l` shows `staticwebassets/App_Plugins/Umbraco.Community.UmbraDesktop.Media/` entries and the nuspec depends on the host and Services.Media with `[<version>, 17.99999999.0]`. Revert any unrelated churn in the TestInstance lock file; keep only the new reference's lines.

### Task 10: Licence compliance in the build

**Files:**
- Create: `Media/backoffice/scripts/licences.mjs` and `licences.d.mts` (pure functions), `Media/bo/tooling/licences.test.ts` (as the host tests its scripts in `bo/tooling/`)
- Modify: `Media/backoffice/vite.config.ts` (plugin `umbradesktop-licences`), `Media/THIRD-PARTY-NOTICES.md`, `Media/Umbraco.Community.UmbraDesktop.Media.csproj` (`<None Update="THIRD-PARTY-NOTICES.md" Pack="true" PackagePath="\" />`, as Entertainment line 110)

**Interfaces:**
- Produces: `ALLOWED_LICENCES = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC']`.
- Produces: `packageOf(moduleId: string): { name: string; root: string } | null` (the last `node_modules` segment, scoped names included; null outside `node_modules`).
- Produces: `interface BundledPackage { name: string; version: string; license: string; licenseText: string }`.
- Produces: `licenceProblems(packages: BundledPackage[], notices: string): string[]` (one message per package whose licence is not allowed, or whose `name@version` is not in the notices file).
- Produces: `noticeBanner(packages: BundledPackage[]): string` (one `/*! name@version | license\n<full licence text>\n*/` block per package, sorted by name).
- The Vite plugin, in `generateBundle`: for each chunk, `packageOf` every module id, read each package's `package.json` and its `LICENSE`/`LICENCE`/`LICENSE.md` file, call `licenceProblems` across the whole bundle and `this.error` with every message if any, and prepend `noticeBanner` of that chunk's packages to that chunk. A missing licence file is an error.

- [ ] **Step 1: Write the failing tests** in `licences.test.ts`:
  - `packageOf('/x/node_modules/fabric/dist/index.mjs')` → `fabric`; `/x/node_modules/@cropper/element/dist/x.js` → `@cropper/element`; nested `node_modules/a/node_modules/b/i.js` → `b`; `/x/src/a.ts` → null;
  - an MIT package listed as `fabric@7.4.0` in the notices passes;
  - a `GPL-3.0` package fails with its name in the message (the design's fake-bundle test);
  - an MIT package missing from the notices fails; a listed package at a different version fails;
  - `(MIT OR Apache-2.0)` passes; `UNLICENSED` and an empty licence fail;
  - `noticeBanner` holds each name, version and the full licence text, and starts with `/*!`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions and the plugin. Fill `THIRD-PARTY-NOTICES.md` in Entertainment's shape: Fabric.js (copyright line from its LICENSE), Cropper.js and each `@cropper/*` package the bundle actually contains, each with name, version, copyright line and the full licence once per distinct text.
- [ ] **Step 4: Verify.** `npm run build` passes; the built chunk holding Fabric starts with its `/*!` block (`head -c 400` of that file); temporarily add a fake GPL entry to the plugin's input in a scratch copy, or edit a notices version, and see the build fail with the message, then undo. `dotnet pack` and `unzip -l` show `THIRD-PARTY-NOTICES.md` at the nupkg root. `grep -l jsdom` over the output finds nothing.
- [ ] **Step 5:** confirm Services.Media still bundles nothing from npm (its output contains no `node_modules` module ids); if it does, give it the same plugin. Record the result in design §9.

### Task 11: Formats on open

**Files:**
- Create: `Media/bo/image-editor/formats.ts`
- Test: `Media/bo/image-editor/formats.test.ts`

**Interfaces:**
- Produces: `refusalFor(extension: string): 'svg' | 'unsupported' | null` (null for every `ACCEPT` extension).
- Produces: `isAnimatedGif(bytes: Uint8Array): boolean` (true when the stream holds more than one image descriptor).

- [ ] **Step 1: Write the failing tests:** `refusalFor('svg') === 'svg'`, `refusalFor('txt') === 'unsupported'`, `refusalFor('JPG') === null`; `isAnimatedGif` on two small GIF fixtures in `Media/bo/image-editor/fixtures/` (one frame, two frames) and on a PNG's bytes (false).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Walk the GIF block structure (header, logical screen, optional colour table, then extension and image blocks), counting image descriptors; stop at the second.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 12: Geometry, zoom and the focal-point rule

**Files:**
- Create: `Media/bo/image-editor/geometry.ts`, `Media/bo/image-editor/state.ts`, `Media/bo/image-editor/focal.ts`
- Test: `geometry.test.ts`, `focal.test.ts`

**Interfaces:**
- Produces in `state.ts`:

```ts
interface Size { w: number; h: number }
interface Rect { x: number; y: number; w: number; h: number }
type Rotation = 0 | 90 | 180 | 270;
interface Adjust { exposure: number; brightness: number; contrast: number; saturation: number } // each -100..100, 0 neutral
type Mark = { id: string; kind: 'text' | 'arrow' | 'box' | 'pen'; colour: string; width: number; data: unknown };
type Region = { id: string; style: 'pixelate' | 'blur'; strength: number; rect: Rect };
interface EditorState {
  source: Size;               // the decoded picture, upright
  rotation: Rotation; flipH: boolean; flipV: boolean;
  crop: Rect | null;          // in oriented space (after rotate and flip), null = whole picture
  size: Size | null;          // output size, null = the cropped size
  adjust: Adjust;
  marks: Mark[]; regions: Region[]; // in oriented space, so a crop never moves them
}
const NEUTRAL_ADJUST: Adjust;
function initialState(source: Size): EditorState;
function outputSize(state: EditorState): Size;
```

- Produces in `geometry.ts`: `orientedSize(source: Size, rotation: Rotation): Size`; `rotate(state, dir: 'left' | 'right'): EditorState` and `flip(state, axis: 'h' | 'v'): EditorState`, which move `crop`, marks and regions with the picture; `type RatioChoice = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9'`; `ratioFor(choice, orientation: 'portrait' | 'landscape', original: Size): number | null`; `constrainCrop(rect: Rect, bounds: Size, ratio: number | null): Rect` (inside bounds, at least 1px, at the ratio, keeping the centre); `linkedResize(size: Size, change: { w?: number; h?: number }, linked: boolean): Size` (rounded, at least 1); `presetSizes(current: Size): Array<{ key: '2560' | '1920' | '1280' | '800' | 'half'; size: Size; enabled: boolean }>` (enabled only when smaller than `current`); `MIN_ZOOM = 0.05`, `MAX_ZOOM = 8`, `ZOOM_STEPS`; `fitZoom(image: Size, viewport: Size): number` (never above 1); `stepZoom(current: number, dir: 1 | -1): number`.
- Produces in `focal.ts`: `resetsFocalPoint(saved: EditorState, current: EditorState): boolean`: true when rotation, either flip, or the crop differ between the two; size, adjust, marks and regions never count.

- [ ] **Step 1: Write the failing tests.** Concrete values:
  - `orientedSize({w: 6000, h: 4000}, 90)` → `{w: 4000, h: 6000}`;
  - on a 600 × 400 source with crop `{x: 0, y: 0, w: 300, h: 200}`: `rotate(right)` gives rotation 90 and crop `{x: 200, y: 0, w: 200, h: 300}`; four rights return the original state; `flip(h)` gives crop `{x: 300, y: 0, w: 300, h: 200}`; flipping twice is the identity; a mark's point moves the same way;
  - `ratioFor('16:9', 'portrait', …)` → 9/16; `ratioFor('original', 'landscape', {w: 600, h: 400})` → 1.5; `'free'` → null;
  - `constrainCrop({x: 500, y: 300, w: 400, h: 400}, {w: 600, h: 400}, 1)` stays inside and is square;
  - `linkedResize({w: 4000, h: 3000}, {w: 1920}, true)` → `{w: 1920, h: 1440}`; unlinked keeps `h: 3000`; `{w: 0}` → `w: 1`;
  - `presetSizes({w: 1600, h: 1200})`: 2560 and 1920 disabled, 1280, 800 and half enabled, half is `{w: 800, h: 600}`;
  - `fitZoom({w: 6000, h: 4000}, {w: 600, h: 400})` → 0.1; a small picture fits at 1; `stepZoom` stays within `MIN_ZOOM`..`MAX_ZOOM`;
  - `resetsFocalPoint`: equal states false; resize only false; adjust, marks or regions only false; crop, rotate or flip true; **Review Focus 2:** a state that was cropped, saved, and undone back to the uncropped original compared with the saved (cropped) state → true; a state rotated right then left compared with an unrotated saved state → false.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pure functions; states are never mutated.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 13: Undo history that survives saves

**Files:**
- Create: `Media/bo/image-editor/history.ts`
- Test: `history.test.ts`

**Interfaces:**
- Produces: `class History<T> { constructor(initial: T); readonly current: T; readonly saved: T; readonly canUndo: boolean; readonly canRedo: boolean; readonly dirty: boolean; push(next: T): void; undo(): void; redo(): void; markSaved(): void; reset(initial: T): void }`. `push` drops the redo branch. `dirty` is whether the current index is not the saved index. `reset` is for opening another file.
- Produces: `class Gesture<T> { constructor(history: History<T>); preview(next: T): void; commit(): void; cancel(): void }`, so a slider drag or a mark drag previews many states and pushes one.

- [ ] **Step 1: Write the failing tests:**
  - push, undo, redo walk the states; push after undo drops redo;
  - `markSaved` then undo → `dirty` true; redo back to the saved point → `dirty` false (**Review Focus 2**);
  - pushing a new branch after undoing past the saved point leaves it dirty even back at the same depth;
  - `Gesture`: 30 `preview` calls then `commit` add exactly one step, and undo returns to the state before the drag; `cancel` restores it and adds none;
  - `reset` clears both stacks and is clean.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 14: Rendering and encoding at full resolution

**Files:**
- Create: `Media/bo/image-editor/render.ts`, `Media/bo/image-editor/adjust.ts`, `Media/bo/image-editor/redact.ts`, `Media/bo/image-editor/encode.ts`, `Media/bo/image-editor/decode.ts`
- Test: `render.test.ts`, `adjust.test.ts`, `redact.test.ts`, `decode.test.ts`, with fixtures in `Media/bo/image-editor/fixtures/`

**Interfaces:**
- Produces: `adjustMatrix(adjust: Adjust): number[]` (a 20-number colour matrix; neutral is the identity). Pinned mapping: exposure multiplies RGB by `2 ** (exposure / 100)`; brightness adds `brightness / 200`; contrast scales around 0.5 by `1 + contrast / 100`; saturation interpolates from luminance (Rec. 709 weights) by `1 + saturation / 100`. The live preview (Fabric `filters.ColorMatrix`) and the export use this same matrix.
- Produces: `redactionBlock(picture: Size, strength: number): number` = `max(8, round(min(picture.w, picture.h) * strength / 200))`; `REDACT_DEFAULT_STRENGTH = 8`, strength 1..10. `redact(ctx: CanvasRenderingContext2D, rect: Rect, style: 'pixelate' | 'blur', block: number): void`: pixelate fills each block with its mean; blur downsamples the region by `block` and draws it back up smoothed, then blurs once more, so it is built only from block means.
- Produces: `renderDocument(picture: ImageBitmap, state: EditorState, options?: { scale?: number; withOverlays?: boolean }): HTMLCanvasElement`, in the fixed order rotate and flip, crop, adjust, redact, marks, resize. Export calls it at `scale: 1` with everything flattened; the editing view never flattens.
- Produces: `encodeCanvas(canvas: HTMLCanvasElement, format: SaveFormat, quality: number): Promise<Blob>` (`toBlob` with `mimeFor(format)` and `quality / 100`, ignored for PNG). `SaveFormat` and `mimeFor` are copied from Task 5.
- Produces: `decodePicture(blob: Blob): Promise<ImageBitmap>` (`createImageBitmap(blob, { imageOrientation: 'from-image' })`).

- [ ] **Step 1: Write the failing tests:**
  - `adjustMatrix(NEUTRAL_ADJUST)` is the identity; exposure 100 doubles the RGB diagonal; saturation −100 makes every row the luminance weights;
  - redaction destroys what it covers: two 64 × 64 sources that differ only in detail inside each 16px block but share every block's mean give byte-identical redacted regions, for both styles; and no redacted pixel of a random-noise source equals its original;
  - redaction and marks are flattened into the export and absent from the view (`withOverlays: false` vs the export);
  - export size equals `outputSize(state)` for a crop plus a resize;
  - **Review Focus 1:** a 6000 × 4000 picture with exposure 50 exports at 6000 × 4000 and its centre pixel matches the adjusted value, not the original. If the browser's WebGL texture size is smaller, the export path falls back to the canvas 2D filter backend rather than downscaling;
  - **Review Focus 5:** `decodePicture` on a small JPEG fixture with EXIF orientation 6 answers width and height swapped against its stored size, and an export of it with no edits keeps that upright size;
  - `encodeCanvas` answers a Blob of the right `type` for each format, and JPEG at 50 is smaller than at 90.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Raise `fabric.config.textureSize` to the GPU's `MAX_TEXTURE_SIZE` when the export is larger than the default, and use Fabric's canvas 2D backend when even that is too small.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Measure** a real 6000 × 4000 JPEG in Chrome: memory after open and the time from a slider input to the preview frame. Write both numbers in design §8.

### Task 15: The editor shell

**Files:**
- Create: `Media/bo/shared/media-service.ts` (Accessories' line to the service, with the Task 3 and Task 4 additions and `resetFocalPoint` copied in), `Media/bo/shared/file-page.ts` (the Task 5 types and `FILE_PAGE_TAG`, copied, plus a `whenFilePage(waitMs)` that resolves once the tag is defined or after 500ms)
- Modify: `Media/bo/image-editor/image-editor.element.ts`
- Create: `Media/bo/image-editor/mode-bar.ts`, `Media/bo/image-editor/status-bar.ts`, `Media/bo/image-editor/stage.ts` (the Fabric canvas: view, zoom, pan, overlays)
- Modify: dictionaries
- Test: `Media/bo/image-editor/image-editor.element.test.ts`

**Interfaces:**
- Consumes: everything in Tasks 1 to 14.
- Produces: `type Mode = 'crop' | 'adjust' | 'markup' | 'redact' | 'resize'`; the element's `@state() mode: Mode`; each mode panel is a Lit template function `(editor: ImageEditorElement) => TemplateResult` in `modes/<mode>.ts`, receiving `history`, `state` and `apply(next: EditorState)`.
- The element: holds `History<EditorState>`; renders `<umbradesktop-media-file-page>` always, `open` when File is chosen; passes `document`, `dirty`, `accept = ACCEPT`, `encode` (`renderDocument` then `encodeCanvas`), `preview` (an object URL of a reduced `renderDocument`, revoked when replaced), and `resetFocalPoint = resetsFocalPoint(history.saved, history.current)`; on `saved` it calls `markSaved`, updates `unique`, `updateDate`, extension, folder and name; on `open` it refuses with `refusalFor`, decodes, shows the animated-GIF notice when `isAnimatedGif`, and `history.reset(initialState(...))`; on `failed` it shows the reason in the status bar; on `close` it dispatches `umbradesktop-close-request`.
- Sets `data-umbradesktop-dirty` from `history.dirty` and `data-umbradesktop-title` to the item's name (Task 1).

- [ ] **Step 1: Write the failing tests** (a fake file page element registered under the tag, and a fake media service):
  - with nothing open the File page is open on Open; the five modes, undo, redo and Save are drawn and `disabled`;
  - the mode bar order is File, undo, redo, Crop, Adjust, Markup, Redact, Resize, Save;
  - an `open` event with a PNG fixture enables everything, sets the title attribute to the item's name, closes the File page, and shows name, folder, dimensions, size and format in the status bar;
  - an SVG `open` is refused with the message and nothing changes;
  - an animated GIF opens with the first-frame notice in the status bar;
  - Save and Ctrl+S call the page's `save()`; for a GIF item `save()` answers `needs-save-as` and the page is shown;
  - Ctrl+O shows File on Open, Ctrl+Shift+S on Save as, Ctrl+Z and Ctrl+Y undo and redo, Ctrl+0 fits, Ctrl+1 is 100%, Ctrl+plus and Ctrl+minus step;
  - a change sets `data-umbradesktop-dirty`; the `saved` event clears it; undo past the save sets it again;
  - `resetFocalPoint` passed to the page is true after a rotate and false after a resize;
  - renaming in the status bar changes `document.name` and the title attribute;
  - the status bar shows "before → after" dimensions while a resize is pending;
  - without the media service or the file page tag, File says the media library cannot be reached and nothing throws;
  - the File tab's close event dispatches `umbradesktop-close-request`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Canvas left, panel `PANEL_WIDTH` right, status bar with zoom out, slider, zoom in, percentage and Fit at its right. Wheel with Ctrl zooms, pinch zooms, Space-drag and two fingers pan. Keys are handled on the element, as Paint does, and ignored while focus is in a text field except Ctrl+S.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: PASS.

### Task 16: Crop mode

**Files:** Create `Media/bo/image-editor/modes/crop.ts`; modify `stage.ts`; test `modes/crop.test.ts`.

**Interfaces:** Consumes `ratioFor`, `constrainCrop`, `rotate`, `flip` (Task 12), `OpenedMedia.focalPoint` (Task 3). Uses Cropper.js v2's `cropper-canvas` and `cropper-selection` for the frame; if Fabric draws the frame with less code, drop Cropper and remove it from `package.json` and the notices (design §8 leaves this to the builder; write the choice in design §8).

- [ ] **Step 1: Write the failing tests:** ratios Free, Original, 1:1, 4:3, 3:2, 16:9 and the Portrait/Landscape switch constrain the frame; the frame's size in real pixels shows under it; Rotate left/right and Flip horizontal/vertical apply at once as one undo step each; Apply crop, Enter and switching mode each apply the frame as one undo step; Escape and Reset throw it away with no step; the focal point is drawn when `focalPoint` is set, at its fraction of the oriented picture; the panel line about the reset on save is present; every control works by keyboard.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Style the frame and handles with app tokens; rule-of-thirds lines; eight handles.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 17: Adjust mode

**Files:** Create `modes/adjust.ts`; test `modes/adjust.test.ts`.

**Interfaces:** Consumes `adjustMatrix` (Task 14), `Gesture` (Task 13).

- [ ] **Step 1: Write the failing tests:** four sliders, Exposure, Brightness, Contrast, Saturation, −100..100 with 0 in the middle; dragging previews without a history step and releasing commits exactly one; a double-click puts a slider back to 0 as one step; holding Hold to compare shows the original and releasing shows the adjusted picture, with no step; Split view draws original and adjusted side by side with a draggable line; each slider has a label and works with the arrow keys.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the preview with Fabric's WebGL `ColorMatrix` filter on the screen-sized view.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 18: Markup mode

**Files:** Create `modes/markup.ts`, `Media/bo/image-editor/marks.ts` (Mark ⇄ Fabric object); test `modes/markup.test.ts`, `marks.test.ts`.

- [ ] **Step 1: Write the failing tests:** tools Select, Text, Arrow, Box, Pen; six colours and a line width; each new mark is one step; moving or restyling a selected mark is one step; Delete removes it as one step; marks round-trip `Mark → Fabric object → Mark` unchanged; marks are in oriented space, so a crop does not move them; after a save the view still holds them as objects (they are flattened only in the saved file, design §4.2).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** with Fabric's `IText`, `Path` (pen), `Rect` and a group for the arrow, as in the mock's arrow.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 19: Redact mode

**Files:** Create `modes/redact.ts`; test `modes/redact.test.ts`.

**Interfaces:** Consumes `redact`, `redactionBlock`, `REDACT_DEFAULT_STRENGTH` (Task 14).

- [ ] **Step 1: Write the failing tests:** Pixelate and Blur with a strength defaulting to `REDACT_DEFAULT_STRENGTH`; a drag draws one region as one step; each region keeps its own style and strength; a selected region moves, resizes and deletes, each one step; the view shows regions redacted live; the export contains no original pixel under a region (reuse Task 14's equal-means check through the element's `encode`).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 20: Resize mode

**Files:** Create `modes/resize.ts`; test `modes/resize.test.ts`.

**Interfaces:** Consumes `linkedResize`, `presetSizes` (Task 12).

- [ ] **Step 1: Write the failing tests:** width and height in pixels or percent, linked by default, unlinking allowed; presets 2560, 1920, 1280, 800 and Half are enabled only when smaller and are drawn disabled otherwise; typing a larger size is allowed; Apply size and switching mode apply as one step; the status bar shows before → after while pending.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 21: Every control under every theme

**Files:** Create `Media/bo/fits.test.ts` (Accessories' `fits.test.ts` as the model).

- [ ] **Step 1: Write the test:** for no theme and the five theme ids, at `defaultSize` and `minSize`: the editor fits its box; in each mode with a picture open, every button, slider, field and colour swatch in the mode bar, the panel and the status bar is inside the box, non-zero in size, and reachable by Tab.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL first against a deliberately narrowed `minSize`, to see it catch an overflow; then against the real sizes.
- [ ] **Step 3: Fix** what it finds by changing the derived constants in `constants.ts`, never a theme-specific hide.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: PASS.

### Task 22: Docs, listing and the real-backoffice run

**Files:**
- Modify: `Media/docs/user/image-editor.md` (full page), `Media/README.md`, `umbraco-marketplace-umbraco.community.umbradesktop.media.json`, root `README.md` (at most one line, pointing at the add-on), `docs/design/2026-10-17-image-editor-design.md` (status, §5.1 exact shape, §8 numbers and the Cropper choice, §9 result, what the run taught)
- Create: `Media/docs/screenshots/image-editor.png`

- [ ] **Step 1: Write the user guide page** per `docs/developer/writing-documentation.md`: front matter with `id: image-editor`; procedures as commands with the goal first (open, crop, adjust, mark up, redact, resize, save over, save a copy, change format); UI labels in bold exactly as in `Media/bo/localization/en.ts`; say that saving removes camera and location data, and that a crop, rotate or flip resets the focal point and the named crops. Link it from the add-on README.
- [ ] **Step 2: Fill the marketplace file:** `Tags` include `image editor`, `crop`, `resize`, `redact`, `blur`, `WebP`, plus the Accessories file's generic tags that apply; `Description` one or two sentences.
- [ ] **Step 3: Run a real backoffice** (the `running-umbraco-instances` skill; a DB copy for this worktree, `npm run build` in Host, SM and Media before `dotnet build`, browse on `<task>.localhost:<port>`). Do each and note the outcome in design §10:
  - open a JPEG from the media library and from the recent list; crop; Save over; the media item's file, width, height, size and extension properties update; its focal point and crops are reset;
  - resize only and Save over; the focal point is kept;
  - Save a copy in WebP into another folder; the editor is now on the copy; a second Save writes over the copy;
  - change an item's format on overwrite; a picker that held it still finds it by key;
  - change the item in the Media section while the editor is open, then Save: the Overwrite question appears, and No writes nothing;
  - a folder that does not allow the media type: the reason shows in the status bar;
  - a GIF: Save opens Save as on PNG with the warning;
  - the File page and every mode in all five themes;
  - Close with unsaved work asks first.
- [ ] **Step 4: Take the screenshot** at the size it is shown (no `width` attributes are possible in README Markdown), save it under `Media/docs/screenshots/`, then add it to the README and the marketplace `Screenshots` array.
- [ ] **Step 5: Run** `npm run build` and `npm test` in Host, SM and Media, and `dotnet build` of the new csproj. Expected: all green, docs check green. Walk the definition-of-done list in `CLAUDE.md` and say which items did not apply.

---

## Decided by the owner (2026-10-17)

1. Task 1 goes ahead: the core desktop gets the app window title attribute and the close request event.
2. A new Media launcher group owned by this add-on, `{ alias: 'media', weight: 52 }`, after System.
3. Built in one session that does every task itself (superpowers:executing-plans), with one review of the whole diff at the end.
