# Optimize Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **No commits.** The owner reviews one uncommitted diff. Where the skill's task template has a
> "Commit" step, this plan has none: leave the work in the working tree and move on. Never commit,
> push, tag or open a pull request unless the owner asks in that message. Built in this session, by
> hand, without subagents (owner's instruction for this issue).

**Goal:** Ship issue #139: one bulk action, Optimize images, that resizes, converts and strips the
metadata of many media library images in a desktop window of its own per run, with the work offered
to other add-ons as Services.Media's `optimizeFile` and `optimizeMedia`.

**Architecture:** Services.Media gains an `optimize/` folder: pure modules (options, resize maths,
metadata walkers, the per-item triage, the title rule), `optimizeFile` on top of them, a run store
that holds every run by id the way the Media add-on's Transfers store does, and one app element,
the Optimize images window, that is a view of a run. The context gets the two published methods and
opens the window through the desktop's window manager. The Media add-on adds only the bulk action,
which finds the context on the desktop page or through the window's frame.

**Tech Stack:** TypeScript, Lit (through `@umbraco-cms/backoffice/external/lit`), Vite 7 lib mode,
web-test-runner in Chrome, Umbraco backoffice 17.5 repositories. No new npm dependency.

**Spec:** [`docs/design/2026-10-20-optimize-images-design.md`](2026-10-20-optimize-images-design.md).
Mocks: [`mockups/optimize-images/optimize-images.html`](mockups/optimize-images/optimize-images.html),
scenes 1, 2B, 2C, 3, 3B, 4A, 4B are the target (2A was rejected). §3 is the decision table and is not
reopened here.

All paths are relative to the worktree root
`D:\github\Umbraco.Community.UmbraDesktop\Worktrees\139-optimize-images`. Short names: **SM** =
`src/Umbraco.Community.UmbraDesktop.Services.Media`, **Media** = `src/Umbraco.Community.UmbraDesktop.Media`.
`backoffice/src` is abbreviated `bo/`. New Services.Media code goes in `SM/bo/optimize/`.

## Global Constraints

- Never commit, push, tag or open a PR. Leave everything uncommitted.
- Test-first on every task: write the test, run it, see it fail for the reason expected, then implement.
- In SM and Media, `npm run build` **and** `npm test` both pass at the end of every task that touches them.
- JSDoc on every type, member and function, private ones included, saying why. Match the density of `media-save.ts` and `transfers-store.ts`.
- Nothing is imported between packages. The Media add-on reaches the service by the alias `'UmbraDesktopMediaContext'` with copied types, as `Media/bo/shared/media-service.ts` does. Services.Media keeps its own copies of the editor's `decodePicture`, `encodeCanvas`, `isAnimatedGif` and `ACCEPT`.
- Published API (developer page, only ever gains optional fields): `optimizeFile(file, options)` and `optimizeMedia(request)` on the context, and the types `OptimizeOptions`, `ImageFacts`, `OptimizeFileResult`, `OptimizeMediaRequest`, `OptimizeItemReport`, `OptimizeReport` exactly as design §8.
- Aliases final once shipped: app `Umbraco.Community.UmbraDesktop.Services.Media.OptimizeImages`; element tag `umbradesktop-media-optimize-images`; bulk action `Umbraco.Community.UmbraDesktop.Media.OptimizeImages`. Localisation areas `umbraDesktopServicesMedia` (SM) and `umbraDesktopMedia` (Media).
- Defaults (D11): Resize on at 2560 × 2560, Convert on to WebP at quality 80, Remove metadata on, Replace the originals. One constant, `OPTIMIZE_DEFAULTS`, read by the store, the window and the tests.
- Remembered settings per user in `localStorage` under `umbradesktop-media-optimize:<user unique>`, every access in try/catch, read defensively.
- Raster extensions: `jpg, jpeg, png, webp, gif, bmp` (the editor's `ACCEPT`). SVG skipped as vector.
- Replace: file named `versionedFileName(base, contentHash(bytes), ext)` from `file-menu/formats.ts`, request `{ file, name, folder, existing, expectedUpdateDate }`, never `force`, never `resetFocalPoint`. Copy: name from the dictionary pattern `%0% (optimized)`, file `<base>-optimized.<ext>`, request `{ file, name, folder, copyOf }`.
- The run uses the opener and saver underneath the context's `open` and `save` (no recent-list entries) but does announce each save (design §7.4, as corrected).
- Disabled, never hidden: Quality is drawn and disabled for PNG; the locked Remove metadata switch is drawn on and disabled; Optimize is drawn and disabled with every switch off.
- A theme may restyle, never remove. Paint with `--umbradesktop-app-*` tokens and `background:` for surfaces, as `file-menu/styles.ts` does.
- Derive numbers: the window's content size, its minimum, and every number its CSS and tests share live in `SM/bo/optimize/constants.ts`.
- Every user-facing string in `en.ts` and `nl.ts` of the package that says it; the parity tests keep them equal.

## Review Focus

Inputs the design implies that no task would otherwise test, most likely to bite first. Each has its
test in the owning task.

1. **A phone photo on its side (EXIF orientation 6) resized or stripped**: the saved image is upright, with width and height swapped, on both paths: the canvas path (decode upright, `resizeWidth` must apply to the upright size) and the strip path (the minimal EXIF keeps the tag). Tests in Tasks 3 and 5.
2. **A transparent PNG converted to JPEG**: the transparent parts come out white, not black. Test in Task 5.
3. **An animated PNG or WebP**: skipped as animated, like a GIF, rather than flattened to its first frame, unless the person confirmed Optimize animated images too. Tests in Tasks 2 and 5.
4. **The same item selected twice in one run, or a run started on items another run is changing**: each is opened afresh just before its save, so the run never saves over a version it did not open. Corrected while building: a repeat is opened after the first save, so it is found already optimized and left unchanged, rather than meeting a conflict. Test in Task 7.
5. **The window closed while its item is mid-save, and the desktop left mid-run**: the save finishes, nothing further starts, the caller's promise resolves `cancelled` with the item that was saving reported as it ended, and the run is dropped once the loop stops. Tests in Tasks 7 and 9.

---

## Phase A: Services.Media, the work

Run every SM step from `SM/` (`npm test`, `npm run build`).

### Task 1: Options, defaults and resize maths

**Files:**
- Create: `SM/bo/optimize/options.ts`, `SM/bo/optimize/resize.ts`
- Test: `SM/bo/optimize/options.test.ts`, `SM/bo/optimize/resize.test.ts`

**Interfaces:**
- Produces: the published types `OptimizeOptions`, `ImageFacts`, `OptimizeFileResult` (design §8.1), with `OptimizeFileResult`'s unchanged `reason` typed `'fits' | 'no-metadata' | 'nothing-asked'` (a string, documented as codes the caller words).
- Produces: `OPTIMIZE_DEFAULTS: Required<Pick<OptimizeOptions,'format'|'quality'|'removeMetadata'>> & { resize: { maxWidth: 2560; maxHeight: 2560 } }`; `normaliseOptions(options?: OptimizeOptions): NormalisedOptions` where `NormalisedOptions = { resize: { maxWidth?: number; maxHeight?: number } | null; format: 'keep'|'jpeg'|'png'|'webp'; quality: number; removeMetadata: boolean; animated: 'skip'|'first-frame' }`, quality clamped to 1..100 and rounded, default 80, absent format `keep`, `removeMetadata` forced true when resizing or converting (D8); `animated` default `'skip'` (owner, 2026-10-21, design §6.1); a resize with neither limit a positive number is `null`.
- Produces: `reencodes(options: NormalisedOptions): boolean` (resize set, or format other than keep).
- Produces: `fitInside(width: number, height: number, box: { maxWidth?: number; maxHeight?: number } | null): { width: number; height: number; scaled: boolean }`.

- [ ] **Step 1: Write the failing tests.** `fitInside`: `(6000,4000,{2560,2560})` → `{2560,1707,scaled:true}`; `(4000,6000,…)` → `{1707,2560}`; `(1800,1200,…)` → unchanged, `scaled:false`; `(3000,10,{maxWidth:2560})` (one side unlimited) → `{2560,9}`; `(5000,1,{100,100})` → height floored at 1; `null` box → unchanged. `normaliseOptions`: `undefined` → keep, 80, no resize, removeMetadata false; `{format:'webp', removeMetadata:false}` → removeMetadata true; quality 0 → 1, 150 → 100, 79.6 → 80; `{resize:{}}` → resize null.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement.** Scale = min(1, maxWidth/width, maxHeight/height) with a missing limit as Infinity; `Math.max(1, Math.round(side * scale))`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 2: Reading a picture file: format, animation, decode and encode

**Files:**
- Create: `SM/bo/optimize/picture.ts`
- Create: `SM/bo/optimize/fixtures/` with `exif-orientation-6.jpg`, `one-frame.gif`, `two-frames.gif` copied from `Media/bo/image-editor/fixtures/`
- Test: `SM/bo/optimize/picture.test.ts`

**Interfaces:**
- Produces: `RASTER_EXTENSIONS: readonly string[]` (the editor's `ACCEPT`, a copy); `formatOfExtension(extension: string): 'jpeg'|'png'|'webp'|'gif'|'bmp'|'svg'|null`.
- Produces: `isAnimated(bytes: Uint8Array, format: 'jpeg'|'png'|'webp'|'gif'|'bmp'): boolean`: GIF by the editor's block walk (copied as `isAnimatedGif`), PNG by an `acTL` chunk before the first `IDAT`, WebP by the `VP8X` flags' animation bit (`0x02`).
- Produces: `decodePicture(blob: Blob, size?: { width: number; height: number }): Promise<ImageBitmap>`, always `imageOrientation: 'from-image'`, and with a size `resizeWidth`, `resizeHeight`, `resizeQuality: 'high'`.
- Produces: `encodePicture(bitmap: ImageBitmap, format: 'jpeg'|'png'|'webp', quality: number): Promise<Blob>`: draws on a canvas of the bitmap's size, white underneath for JPEG, `toBlob` with `quality/100` (none for PNG), then sets the canvas to 0 × 0.

- [ ] **Step 1: Write the failing tests:** `it('finds two frames in an animated GIF and one in a still one')` with the fixtures; `it('finds an animated PNG by its acTL chunk')` and `it('finds an animated WebP by its VP8X animation flag')` on byte arrays the test builds (PNG signature, IHDR, acTL, IDAT, IEND; RIFF/WEBP/VP8X with flags `0x02`), and the same files without the marker as still; `it('decodes a phone photo upright, at the asked size')`: the orientation-6 fixture decoded with no size gives its upright size (sides swapped against its stored size), and decoded at half that upright size gives exactly the asked width and height (Review Focus 1); `it('encodes a transparent picture to JPEG over white')`: a 2 × 2 transparent canvas → bitmap → `encodePicture(…, 'jpeg', 90)` → decoded pixel is near `255,255,255` (Review Focus 2).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** as the interfaces say. Measure the downscale (design §6.2) here: draw the orientation fixture at 1/4 with plain `drawImage` and with `resizeQuality: 'high'`, compare by eye in the test page once; keep `resizeQuality: 'high'` unless it is visibly no better, and write the finding into design §15 (Task 13).
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 3: EXIF orientation and the JPEG metadata walker

**Files:**
- Create: `SM/bo/optimize/metadata/exif.ts`, `SM/bo/optimize/metadata/jpeg.ts`
- Create: `SM/bo/optimize/metadata/fixtures.test-helper.ts` (builders shared by Tasks 3 and 4)
- Test: `SM/bo/optimize/metadata/exif.test.ts`, `SM/bo/optimize/metadata/jpeg.test.ts`

**Interfaces:**
- Produces: `readOrientation(tiff: Uint8Array): number` (the TIFF block after `Exif\0\0`, either byte order, IFD0 tag `0x0112`; 1 when absent or unreadable); `isOrientationOnly(tiff: Uint8Array): boolean` (IFD0 holds only `0x0112` and points to no further IFD); `orientationTiff(orientation: number): Uint8Array` (a minimal little-endian TIFF with that one tag).
- Produces: `StripResult = { bytes: Uint8Array; removed: boolean }`; `stripJpeg(bytes: Uint8Array): StripResult`: walks markers from SOI to SOS, drops APP1 (EXIF and XMP), APP13 and COM, keeps everything else and the rest of the file from SOS byte for byte; when the dropped EXIF had an orientation other than 1, inserts an APP1 `Exif\0\0` + `orientationTiff` after APP0 (or after SOI). `removed` is false, and `bytes` the input itself, when nothing but an orientation-only EXIF was there (design §6.3, "worth removing"). A file that is not a JPEG, or ends early, comes back untouched with `removed: false`.
- Produces in the helper: `exifBlock({ orientation?: number; gps?: boolean; make?: string }): Uint8Array` (a TIFF block with those tags, the GPS IFD pointed at by `0x8825`), `jpegWith(segments: Uint8Array[]): Promise<Uint8Array>` (a canvas-encoded JPEG with the given APPn segments inserted after SOI), `segment(marker: number, payload: Uint8Array): Uint8Array`.

- [ ] **Step 1: Write the failing tests.** exif: orientation read in both byte orders; 1 for a block without the tag; `isOrientationOnly(orientationTiff(6))` true and false with GPS. jpeg: `it('removes EXIF with GPS, XMP, IPTC and comments')`: a JPEG with APP1 EXIF (GPS, make), APP1 XMP, APP13, COM → none of them after, `removed` true; `it('keeps JFIF, the ICC profile and Adobe')`: APP0, APP2 `ICC_PROFILE`, APP14 kept in order; `it('leaves the picture's bytes untouched')`: from the SOS marker to the end the output equals the input; `it('keeps a phone photo upright')`: EXIF with orientation 6 and GPS → output has an APP1 whose orientation is 6 and no GPS, and `decodePicture` of the output has its sides swapped like the input's (Review Focus 1); `it('returns a file with nothing worth removing as it is')`: only an orientation-only EXIF → same bytes, `removed` false; a truncated file → untouched.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules. Segment lengths are big-endian and include their two length bytes; standalone markers `0xD0`–`0xD7` and `0x01` have none.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 4: The PNG and WebP walkers, and one entry point

**Files:**
- Create: `SM/bo/optimize/metadata/png.ts`, `SM/bo/optimize/metadata/webp.ts`, `SM/bo/optimize/metadata/index.ts`
- Modify: `SM/bo/optimize/metadata/fixtures.test-helper.ts` (add `pngWith(chunks)`, `chunk(type, data)`, `webpWith(chunks, flags)`)
- Test: `SM/bo/optimize/metadata/png.test.ts`, `SM/bo/optimize/metadata/webp.test.ts`, `SM/bo/optimize/metadata/index.test.ts`

**Interfaces:**
- Consumes: `StripResult`, `readOrientation`, `isOrientationOnly`, `orientationTiff` (Task 3).
- Produces: `stripPng(bytes): StripResult`: drops `eXIf`, `tEXt`, `zTXt`, `iTXt`, `tIME`; keeps every other chunk in order; an `eXIf` with orientation other than 1 is replaced in place by one holding `orientationTiff`, with a correct CRC-32 (`crc32(bytes: Uint8Array): number` in `png.ts`).
- Produces: `stripWebp(bytes): StripResult`: drops `EXIF` and `XMP ` chunks in a `VP8X` file, clears their `VP8X` flag bits (EXIF `0x08`, XMP `0x04`), keeps `ICCP` and the image chunks, rewrites the RIFF size; an EXIF with orientation other than 1 is kept as a minimal one and its flag stays set; a simple `VP8 `/`VP8L` file has no metadata and comes back untouched.
- Produces: `stripMetadata(bytes: Uint8Array, format: 'jpeg'|'png'|'webp'|'gif'|'bmp'): StripResult` (GIF and BMP: untouched, `removed: false`).

- [ ] **Step 1: Write the failing tests.** png: text chunks and `tIME` gone, `iCCP`, `sRGB`, `gAMA`, `pHYs`, `IHDR`, `IDAT`, `IEND` kept in order; every chunk's CRC valid after; orientation-6 `eXIf` replaced by a minimal one; nothing to remove → same bytes. webp: EXIF and XMP chunks gone, flags cleared, RIFF size equals file length minus 8, `ICCP` kept, still decodes with `createImageBitmap`; orientation kept; a simple VP8 file untouched. index: dispatches by format, GIF untouched.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** WebP chunks are padded to an even length; the pad is not counted in the chunk size.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 5: `optimizeFile`

**Files:**
- Create: `SM/bo/optimize/optimize-file.ts`
- Test: `SM/bo/optimize/optimize-file.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4; `keepFormatFor`, `extensionFor`, `mimeFor` from `SM/bo/file-menu/formats.ts`.
- Produces: `optimizeFile(file: File, options?: OptimizeOptions): Promise<OptimizeFileResult>` (published). The result's `file` is named `<base of file.name>.<extensionFor(target, ext)>` with the target's MIME type; `ImageFacts.format` is the format name (`'jpeg'`, `'png'`, `'webp'`, `'gif'`, `'bmp'`), sizes in bytes, dimensions upright.
- Produces: `planFor(facts: ImageFacts, extension: string, options: NormalisedOptions, hasMetadata: boolean): OptimizePlan` where `OptimizePlan = { kind: 'encode'; size: {width;height}; format: 'jpeg'|'png'|'webp' } | { kind: 'strip' } | { kind: 'unchanged'; reason: 'fits'|'no-metadata'|'nothing-asked' }`. This is the list-of-steps seam (design §6.2) kept as one pure function; an add-on step would extend it later.

- [ ] **Step 1: Write the failing tests.** `planFor`: inside the box and same format with metadata off → `unchanged:'fits'`; only Remove metadata and none present → `unchanged:'no-metadata'`; every switch off → `unchanged:'nothing-asked'`; inside the box, Keep, metadata present (locked on by resize) → `strip`; larger than the box → `encode` at the fitted size; Keep on a GIF with resize → `encode` as PNG; WebP chosen on a WebP inside the box with metadata → `strip`. `optimizeFile` in real Chrome: `it('turns a large JPEG into a smaller WebP at the new size')`: a 3000 × 2000 canvas JPEG at 95, `{resize:{maxWidth:1200,maxHeight:1200}, format:'webp', quality:80}` → `optimized`, `after` 1200 × 800 webp, `after.size < before.size`, the file decodes at 1200 × 800 and is named `.webp`; `it('saves Keep on a GIF as PNG')`; `it('strips a phone photo without encoding it')`: orientation-6 + GPS JPEG, `{removeMetadata:true}` → `optimized`, same dimensions, bytes from SOS equal (Review Focus 1); `it('skips SVG, PDF and an animated GIF with their reasons')` → `vector`, `not-an-image`, `animated`; `it('keeps only the first frame of an animated GIF when asked')`: `animated: 'first-frame'` → `optimized` as PNG; `it('fails, with the browser's words, on a file that will not decode')`: a `.jpg` of random bytes → `failed` with a message.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Order: extension → skip; bytes → `isAnimated` → skip; decode once for facts (close it); plan; encode via `decodePicture(blob, size)` + `encodePicture`, or strip; release every bitmap in `finally`.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: PASS.

## Phase B: Services.Media, the run

### Task 6: Triage, the title rule and remembered settings

**Files:**
- Create: `SM/bo/optimize/triage.ts`, `SM/bo/optimize/remembered.ts`
- Test: `SM/bo/optimize/triage.test.ts`, `SM/bo/optimize/remembered.test.ts`

**Interfaces:**
- Produces: `ItemFacts = { unique: string; name: string; parent: string | null; isTrashed: boolean; mediaType: string; extension?: string; hasUrl: boolean }`.
- Produces: `SkipReason = 'folder' | 'no-file' | 'trashed' | 'not-an-image' | 'vector' | 'animated' | 'missing'` (`missing`: the item repository did not return it).
- Produces: `triage(facts: ItemFacts | undefined, folderTypes: ReadonlySet<string>): SkipReason | null`, the rows of design §6.1 that can be decided before opening.
- Produces: `windowTitle(words: { titled(name: string, count: number): string; mixed(count: number): string }, items: ReadonlyArray<{ parent: string | null }>, folderName: string | undefined, title?: string): string`: one parent (or a caller's `title`) → `titled`, otherwise `mixed`; count = the items passed (the ones not skipped).
- Produces: `RememberedSettings = { options: NormalisedOptions; save: 'replace' | 'copy' }`; `rememberedKeyFor(user: string): string` (`umbradesktop-media-optimize:<user>`); `readRemembered(storage: RecentStorage | null, key: string): RememberedSettings | undefined`, rejecting anything not shaped right; `writeRemembered(storage, key, settings): void`; `startingSettings(request: { options?: OptimizeOptions; save?: 'replace'|'copy' }, remembered: RememberedSettings | undefined): RememberedSettings`, where the request wins, then the remembered, then `OPTIMIZE_DEFAULTS` with `replace`.

- [ ] **Step 1: Write the failing tests:** every `triage` row (folder type, trashed, no URL, `pdf`, `svg`, `JPG` in capitals is raster, missing facts); `windowTitle` for one folder, two folders, root items, and a caller title; remembered: round trip, junk in storage ignored, storage that throws reads nothing and writes nothing, request beats remembered beats defaults.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 7: The run store

**Files:**
- Create: `SM/bo/optimize/run-store.ts`
- Test: `SM/bo/optimize/run-store.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 5, 6; `versionedFileName`, `contentHash` from `file-menu/formats.ts`; `MediaOpenResult`, `MediaSaveRequest`, `MediaSaveResult`.
- Produces: `RunDeps` = `{ facts(uniques: string[]): Promise<Map<string, ItemFacts>>; folderTypes(): Promise<Set<string>>; folderName(unique: string | null): Promise<string | undefined>; references(unique: string): Promise<number | undefined>; open(unique: string): Promise<MediaOpenResult>; save(request: MediaSaveRequest): Promise<MediaSaveResult>; optimize(file: File, options: NormalisedOptions): Promise<OptimizeFileResult>; words: RunWords; newId(): string; remember(settings: RememberedSettings): void }`, where `RunWords` holds the copy-name pattern, the two title forms and the failure texts (conflict, gone, could not read, refused).
- Produces: `RunItemStatus = 'waiting'|'running'|'optimized'|'unchanged'|'skipped'|'failed'|'not-started'`; `RunItem = { unique; name; status; skip?: SkipReason; unchanged?: 'fits'|'no-metadata'|'nothing-asked'; before?: ImageFacts; after?: ImageFacts; copy?: string; message?: string }`; `OptimizeRun = { id; title; phase: 'preparing'|'settings'|'running'|'ended'; settings: RememberedSettings; items: RunItem[]; usage?: { images: number; places: number } | null; outcome?: 'finished'|'cancelled'|'not-started'; cancelling: boolean; pass: number }`.
- Produces: `class OptimizeRunStore` with `runs: Observable<OptimizeRun[]>`; `get(id): OptimizeRun | undefined`; `observe(id): Observable<OptimizeRun | undefined>`; `create(request: OptimizeMediaRequest): { id: string; report: Promise<OptimizeReport> }` (prepares, then `settings`, or `running` at once with `start: true`); `update(id, settings: RememberedSettings): void`; `start(id): void` (remembers the settings); `cancel(id): void`; `retryFailed(id): void`; `runRest(id): void`; `runAnimated(id): void` (the items skipped as animated, again, with `animated: 'first-frame'` for that pass only); `release(id): void` (the window closed: settings → resolves `not-started`; running → cancels and drops when the loop stops; ended → drops); `dispose(): void` (the desktop is leaving: cancels everything).
- Produces: `reportOf(run: OptimizeRun): OptimizeReport` (`saved` = the sum of `before.size - after.size` over optimized items).

- [ ] **Step 1: Write the failing tests**, with fake deps answering from tables and a save that can be held open:
  - `it('prepares the selection: skips a folder, a PDF and a binned image, and names the window after their folder')`.
  - `it('counts the places the images are used in, and gives up quietly when it cannot')` (usage `{images, places}`, `null` when `references` throws).
  - `it('processes items in selection order, one at a time')`: the save log order and never two opens before a save.
  - `it('carries on after a failure, and reports it with Umbraco's words')`: one save `{ok:false, message}`.
  - `it('fails a conflict without forcing it')`: `{ok:false, conflict:true}` → failed with the conflict words, and no second save with `force`.
  - `it('fails an item binned before it is opened, and saves nothing over it')`: open answers `isTrashed: true` → failed, no save.
  - `it('saves over the item with a hashed file name and the date it opened')`: request has `existing`, `expectedUpdateDate`, file name ending `-ud<8 hex>.webp`, no `force`, no `resetFocalPoint`.
  - `it('saves copies next to the original as full copies')`: `copyOf`, folder = the original's, name `Banjo (optimized)`, file `banjo-optimized.webp`, the report's `copy` key.
  - `it('leaves an item with nothing to do alone')`: `unchanged`, no save.
  - `it('lets the item being saved finish, then stops')`: cancel while a save is held → that item ends as it ends, the rest `not-started`, report `cancelled`.
  - `it('runs the failed items again, opening each afresh')` and `it('runs the rest after a cancel')`: a new pass; the first report is not resolved again.
  - `it('runs the animated items again, keeping their first frame, only when asked')`: the pass's options carry `animated: 'first-frame'`, the run's own settings still `skip`.
  - `it('opens each item just before saving it, so a repeat in the selection is found already done')` (Review Focus 4): the same key twice → the second is opened after the first save and comes back unchanged.
  - `it('resolves not-started when the settings are cancelled, and drops the run')`, `it('drops a run when its window closes mid-run, once the item in hand is saved')` (Review Focus 5), `it('cancels every run when the desktop leaves')`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** with `UmbArrayState`, as `transfers-store.ts` does. Lookups batched: one `facts` call for the whole selection, folder types once; reference counts four at a time.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 8: The context's two methods, and the app's registration

**Files:**
- Modify: `SM/bo/context/media.context.ts` (deps gain the run's lookups; `save` split; `optimizeFile`, `optimizeMedia`, the store, the window manager)
- Create: `SM/bo/optimize/lookups.ts` (the real `RunDeps` lookups: `UmbMediaItemRepository.requestItems` for facts and folder names, `UmbMediaUrlRepository.requestItems` for `url` and `extension`, `MediaTypeService.getItemMediaTypeFolders` for folder types as the Media add-on's `media-api.ts` does, `UmbMediaReferenceRepository.requestReferencedBy(unique, 0, 1)` as `createReferenceCount` does)
- Create: `SM/bo/optimize/constants.ts` (app alias, tag, sizes)
- Modify: `SM/bo/umbradesktop-app.d.ts` (add `umbraDesktopApp`, copied from `Media/bo/umbradesktop-app.d.ts`), `SM/bo/bundle.manifests.ts`, `SM/bo/bundle.manifests.test.ts`
- Test: `SM/bo/context/media.context.test.ts`

**Interfaces:**
- Consumes: Tasks 5 to 7.
- Produces on `UmbraDesktopMediaContext`: `optimizeFile(file, options?)`; `optimizeMedia(request: OptimizeMediaRequest): Promise<OptimizeReport>` (creates the run and opens `UMBRADESKTOP_OPTIMIZE_APP` with `{ location: id }`; if the window manager is missing or refuses, the run is released and the report is `not-started`); `optimizeRuns: OptimizeRunStore` (for this package's window, documented as not published).
- Produces: `UMBRADESKTOP_OPTIMIZE_APP = 'Umbraco.Community.UmbraDesktop.Services.Media.OptimizeImages'`, `OPTIMIZE_TAG = 'umbradesktop-media-optimize-images'`, `OPTIMIZE_CONTENT_SIZE`, `OPTIMIZE_MIN_CONTENT_SIZE`.
- Manifest: `umbraDesktopApp`, `meta: { label: '#umbraDesktopServicesMedia_optimizeImages', icon: 'icon-picture', defaultSize: OPTIMIZE_CONTENT_SIZE, minSize: OPTIMIZE_MIN_CONTENT_SIZE, allowMultiple: true, hideFromLauncher: true }`, conditions the Media section, as the Media add-on's apps.

- [ ] **Step 1: Write the failing tests:** `it('opens an Optimize images window at the new run, and resolves with its report')` (a fake window manager provided on the context's host records `openApp`); `it('answers not-started when there is no desktop to open the window on')`; `it('announces a run's saves but keeps them off the recent list')`; `it('still records and announces an app's own save')` (the split changed nothing); manifest test: hidden from the launcher, several windows, the Media section.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Find the window manager with `consumeContext` on the context's host; check in the test whether the desktop provides it on the same element and fall back to the desktop's documented lookup if not. Destroying the context calls `optimizeRuns.dispose()`. Check `UmbMediaUrlRepository`'s model in the installed 17.5 typings (`url`, `extension`) before writing the lookup.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: PASS.

## Phase C: Services.Media, the window

### Task 9: The Optimize images window: settings

**Files:**
- Create: `SM/bo/optimize/optimize-window.element.ts`, `SM/bo/optimize/optimize-window.styles.ts`
- Modify: `SM/bo/localization/en.ts`, `nl.ts`
- Test: `SM/bo/optimize/optimize-window.element.test.ts`

**Interfaces:**
- Consumes: `OptimizeRunStore` through the context (or a `store` property a test sets).
- Produces: element `umbradesktop-media-optimize-images` with `location?: string` (the run id). An unknown id dispatches `umbradesktop-close-request` (a reload, design §5.4). It dispatches `umbradesktop-app-title` with the run's title.

- [ ] **Step 1: Write the failing tests:** heading "Optimize 9 images" and the skip lines ("1 folder in the selection is skipped", "2 files are not images and are skipped"); Remove metadata on and disabled while Resize or Convert is on, with the why-hint, enabled with both off with the lossless hint; Quality disabled for PNG; Optimize disabled with every switch off and labelled "Optimize 9 images" otherwise; the references warning shown for Replace with usage, hidden for copies and when usage is null; Cancel releases the run (report `not-started`) and asks to close; Optimize starts the run; an unknown location asks to close; the title event.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** with `uui-toggle`, `uui-input type=number`, a segmented group of buttons for Format, `uui-slider` and a number for Quality, `uui-radio-group` for Save, as scene 2B and 2C draw them.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 10: The window: the run, progress, ending, closing

**Files:**
- Modify: `SM/bo/optimize/optimize-window.element.ts`, `en.ts`, `nl.ts`
- Test: `SM/bo/optimize/optimize-window.element.test.ts`

- [ ] **Step 1: Write the failing tests:** a row per item in selection order with thumbnail, name and facts ("6000 × 4000 JPEG, 8.4 MB → 2560 × 1707 WebP, 412 KB", the percentage in the success colour, a growth in the warning colour), Saving with a small bar, Waiting, Skipped/Unchanged/Failed with their words; heading "Optimizing 9 images", "4 of 9 · 30.4 MB saved so far", the settings line; `umbradesktop-task` reports: `running` with `completed`, `total` (not skipped), `failed`, `label: 'Optimizing'`, then `failed` when anything failed or `done`; the failure ended (`done`) by `focusin` or `pointerdown` on the window, or by a retry; ended headings "7 optimized, 1 unchanged, 1 failed" and "Cancelled after 5 of 9" with the total saved; Retry failed, Run the rest and Optimize animated images too shown only when they apply, the last asking first through a `confirmAnimated(count)` property a test answers (Umbraco's confirm dialog by default); closing the element while it runs cancels the run and the report resolves `cancelled` (Review Focus 5).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Sizes with the file menu's `formatBytes`, format names with `formatLabel`. Thumbnails through `UmbImagingRepository` as `createThumbnails` in `file-menu/deps.ts`, asked once per run, refreshed after an item saves.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: PASS.

### Task 11: The window under every theme, and the developer page

**Files:**
- Modify: `SM/bo/optimize/constants.ts` (measured heights)
- Test: `SM/bo/optimize/fits.test.ts` (modelled on `file-menu/fits.test.ts`)
- Create: `SM/docs/developer/optimizing-images.md`
- Modify: `SM/docs/developer/README.md`, `SM/docs/developer/opening-and-saving-media.md` (a link, and `optimizeFile`/`optimizeMedia` in §2's interface)

- [ ] **Step 1: Write the failing test:** at `OPTIMIZE_MIN_CONTENT_SIZE`, under every theme id and none, the settings view (Resize and Convert on, WebP, Replace with the warning) has no scroll and every control inside the box with a size and Tab reachable; at `OPTIMIZE_CONTENT_SIZE` a row's facts fit on one line for the mock's longest ("5184 × 3456 PNG, 21.3 MB → 2560 × 1707 WebP, 520 KB").
- [ ] **Step 2: Run** `npm test`. Expected: FAIL until the sizes are measured and written into `constants.ts`.
- [ ] **Step 3: Implement**, then write the developer page following `docs/developer/writing-documentation.md`: front matter with `id: optimizing-images`, depend and reach (link to the opening page), §1 a file in and out with a short example, §2 media items in and a report out with a short example, the types, what is not offered (plug-in steps, design §2).
- [ ] **Step 4: Run** `npm test` and `npm run build` (the build runs the docs check). Expected: PASS.

## Phase D: the Media add-on

Run every Media step from `Media/`.

### Task 12: The bulk action

**Files:**
- Modify: `Media/bo/edit-image/desktop-windows.ts` (add `findOnDesktop<T>(element, token)`, with `findDesktopWindows` on top of it)
- Create: `Media/bo/optimize-images/optimize-images.action.ts`, `Media/bo/shared/optimize-service.ts` (the copied request and report types and the context token)
- Modify: `Media/bo/bundle.manifests.ts`, `Media/bo/bundle.manifests.test.ts`, `Media/bo/localization/en.ts`, `nl.ts`
- Test: `Media/bo/optimize-images/optimize-images.action.test.ts`

**Interfaces:**
- Manifest: `entityBulkAction`, kind `default`, alias `Umbraco.Community.UmbraDesktop.Media.OptimizeImages`, weight 15 (between core's Move to at 20 and Trash at 10, with the Manager's Copy to at 21), label `#umbraDesktopMedia_optimizeImages`, icon `icon-picture`, `forEntityTypes: ['media']`, conditions: collection `Umb.Collection.Media`, `UMBRADESKTOP_ON_DESKTOP_CONDITION`, the Media section.

- [ ] **Step 1: Write the failing tests:** `it('hands the selection, folders and all, to the media service and returns at once')` (a held `optimizeMedia` promise; `execute()` resolves before it); `it('finds the service through the window's frame')` (an iframe on a provider's element, the action's host inside it); `it('does nothing without a desktop')`; manifest: alias, weight, conditions, label in both dictionaries.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** `execute` calls `void service.optimizeMedia({ items: [...this.selection] }).catch(() => undefined)`.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: PASS.

### Task 13: Docs, listing and the real backoffice run

**Files:**
- Create: `Media/docs/user/optimize-images.md` (`id: optimize-images`); link from `Media/docs/user/media-manager.md`
- Modify: `umbraco-marketplace-umbraco.community.umbradesktop.media.json` (`Tags`: "bulk resize", "image optimization", "WebP", "EXIF"); a screenshot in `Media/docs/screenshots/` and the `Screenshots` array only if a finished run earns it
- Modify: `docs/design/2026-10-20-optimize-images-design.md`: status, and a new **§15 What the real run taught**, as the image editor's §13
- Media README: at most one line, decided after the run

- [ ] **Step 1: Write the user guide** per the writing guide: what each switch does, that metadata always goes with a resize or convert, that a replaced image keeps its pages working but gets a new address, so a pasted link to the old file breaks, how to cancel, retry and run the rest; labels in bold from `en.ts`.
- [ ] **Step 2: Run** `npm run build` in Media and SM. Expected: PASS, docs check green.
- [ ] **Step 3: The real run**, with the running-umbraco-instances skill on a per-worktree copy of the test database, a few real camera photos uploaded, driven through the repo's puppeteer-core headless check where the Browser pane cannot render the backoffice. Design §10's list: a mixed selection with a folder and a PDF; replace with WebP and check the extension, bytes, width and height properties and the focal point; copies (full copies, in the original's folder); metadata only on a phone photo (GPS gone, upright, bytes otherwise equal); a conflict from a second tab; a folder that refuses the type, if the database has one; minimise, close the Manager, close the run window mid-run; the Media section window path; Chrome's memory over 50 large photos; whether a window still drags smoothly while it runs; the bulk action's real position in the selection bar.
- [ ] **Step 4: Write §15** with what the run measured and found, fix what it found test-first, and run `npm test` and `npm run build` in both packages once more.

## Decided by the owner (2026-10-20, in the design)

One action with switches (D1); settings as the window's first view, scene 2B (D2); a window per run
with a distinguishing title (D3); not in the launcher (D4); the work public in Services.Media (D6);
no plug-in steps yet (§2); copies are full copies through `copyOf` (§7.2); #137 first, merged.
