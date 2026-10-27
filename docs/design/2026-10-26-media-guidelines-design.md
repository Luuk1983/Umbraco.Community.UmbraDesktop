# Media guidelines on upload (#179)

Date: 2026-10-26, built 2026-10-26 to 27. Issue: #179. Add-on: Media, with Services.Media's Optimize
images (#139) taught to take files. Mock: [`mockups/upload-guidelines/upload-guidelines.html`](mockups/upload-guidelines/upload-guidelines.html),
scene U2B chosen.

## 1. What it does

Files dropped or pasted into a Media Manager window are checked in the browser against three
site-wide guidelines (Maximum size, Formats, Location) before they reach core's upload. Files that
follow them upload at once. The rest are listed in a sheet inside that window; Optimize hands the
ticked ones to the Optimize images window, which optimizes each in the browser and uploads it into
the folder before starting the next. User guide: [`media-guidelines.md`](../../src/Umbraco.Community.UmbraDesktop.Media/docs/user/media-guidelines.md).

## 2. Decided with the owner before the build

- **Before upload, not after.** Core's upload in 17.6 has no hook to change a file on its way in, so
  this covers only the Media Manager's own drop and paste. The originals stay on the person's disk.
- **The everyday path grows no choices.** A file that follows the guidelines uploads with no question
  (owner, firm).
- **The warning is a sheet inside the window dropped on** (U2B), so only that window waits.
  Changed after the first test: it is a dialog window over that window (§11).
- **Closing the warning uploads none of the listed files**, and the window says so. The mock had
  proposed the opposite; the owner chose this.
- **The optimizer's settings may be changed for the batch**, and are not remembered as the person's.
  Changed after the first test: the run starts at once, with no settings page (§11).
- **Formats is a table**, one row per kind (JPEG, PNG photo, PNG with transparency, WebP, GIF) with
  Keep, JPEG, PNG or WebP, plus one quality. It replaces the mock's "Convert PNG photos" switch. A row
  not on Keep lists the file and is also the format a resized file is saved in. Default: PNG photo to
  WebP, the rest Keep. Animated GIFs are always left alone.
- **A file only gets the fixes for what it breaks.** A JPEG whose only problem is its location is
  stripped, never encoded again.

## 3. Calls made on the issue's open points (for the owner to overrule)

1. **A PNG is a photo when no pixel has an alpha below 255.** A PNG without an alpha channel or
   `tRNS` chunk is settled by its header; one with an alpha channel is decoded, but only when the
   answer decides something: when the two PNG rows ask for different things, or when the file is
   listed anyway and the warning names its kind. A screenshot is opaque, so it counts as a photo and
   is listed under the defaults; the editor unticks it. Above 16 megapixels the decode is taken at a
   reduced size, nearest neighbour, which can miss one stray transparent pixel but not a logo's
   background (`isOpaquePng`).
2. **Size and location come from the header alone.** JPEG frame header and APP1 (EXIF GPS IFD with
   any tag but the version, or XMP with `GPSLatitude`); PNG `IHDR`, `tRNS`, `acTL`, `eXIf`, XMP
   `iTXt`; WebP `VP8X`/`VP8 `/`VP8L` and its `EXIF`/`XMP ` chunks, which come after the picture and
   are reached by walking chunk headers with `Blob.slice`. A GIF is read whole, since its frames are
   spread through it. The format comes from the bytes, not the name. Measured in §8.
3. **The settings box had no mock.** It is built in the style of the desktop label's settings on the
   Site screen: one guideline per row with a hairline between, its switch, a hint, its fields under it
   and greyed while off. Screenshot: [`media-guidelines-settings.png`](../../src/Umbraco.Community.UmbraDesktop.Media/docs/screenshots/media-guidelines-settings.png).

## 4. Where the check hooks in

The brief named `uploadInto` in `upload/upload.ts`. The check runs one step earlier, in
`upload/guided-upload.ts`, called by the Media Manager window, because a drop on the window's own
folder area never reaches `uploadInto`: core's dropzone in the window takes it directly. So:

- The OS drop controller takes a drop on the window's own area too when the window offers `upload`
  on its drag handle, and hands the window the files. Before this, it left that drop to core.
- What passes goes back to core's dropzone in the window through its file dropzone's `change` event,
  the route paste already used, so core still picks the media type, refuses what the folder does not
  allow and draws its placeholders. Into a folder card or tree folder it goes through `uploadInto`.
- Paste goes through the same check.
- `uploadInto` itself stays unchecked: Transfers' re-upload and the optimizer's own uploads call it,
  and checking those again would ask twice.
- One checked upload at a time per window: a second drop while the warning is open waits for its
  answer.
- **Only the files at the top of a drop are checked.** A dropped folder uploads as it is, alongside
  what passes: its files land in a folder core creates during the upload, which does not exist yet
  for the optimizer to upload into. Follow-up if it matters.
- A file whose header cannot be read passes, so a failing check never holds up an upload. A site with
  every guideline off is not checked at all.

The guidelines are read afresh for every drop (one GET), so a change applies to the next drop
without a reload; when the read fails, the last ones read, then the defaults, which are on.

## 5. Optimize images on files (Services.Media)

A third published call beside `optimizeFile` and `optimizeMedia`: `optimizeFiles(request)`, optional
on the context so callers can check for it (developer page §5,
[`optimizing-images.md`](../../src/Umbraco.Community.UmbraDesktop.Services.Media/docs/developer/optimizing-images.md)).

- The request carries each file with its `kind` and `fix` list, starting settings with a `formats`
  table, a `destination` for the window to name, a `note` line, and the caller's own `upload`. The
  service never uploads itself: the Media add-on passes its upload, which follows the folder's rules
  and reloads the folder, so each file appears as it lands.
- The run store gains `createFiles`, `retryOne` and `uploadOriginal`. `file-fixes.ts` decides each
  file's options from its fixes and the run's settings, so a change for the batch applies to every
  file it concerns and no other; `null` means nothing is left to do and the original is uploaded
  without being read.
- A file the optimizer leaves alone (unchanged, animated) is uploaded as it was, since the person
  asked for it to go in. A failure, optimizing or uploading, uploads nothing for that file; its row
  offers Retry and Upload the original (mock U5). The header's Retry failed and the animated pass
  are hidden on files: one way to retry, and an animated file was already uploaded.
- The settings view swaps Convert's single format for a row per kind present in the batch, never
  locks Remove location (a stripped-only file needs the switch), and replaces Where the result goes
  with the folder.
- Progress on the title bar and taskbar is #139's, unchanged. Closing mid-run asks first, as #139
  does; files already uploaded stay.
- The optimizer's uploads are not followed in the Transfers window: its own window shows them, and
  Transfers kept opening over it (§9).

## 6. Server

`Guidelines/` in the Media add-on, its first controller: `MediaGuidelines` records, `MediaGuidelinesStore`
over `IKeyValueService` (key `Umbraco.Community.UmbraDesktop.Media.Guidelines`, formats by name, read
field by field so one unreadable field costs that field), and `MediaGuidelinesController` at
`umbradesktop/media/guidelines`. Reading needs backoffice access only, as the desktop label's does:
every editor who uploads is checked. Writing (PUT) needs the Settings section. A longest side outside
1 to 20,000, a quality outside 1 to 100, an undefined format or a missing part is refused with 400
rather than stored, since the reader would turn it into something else. 19 test cases in
`Media.Tests/Guidelines/`.

## 7. The settings box

Desktop settings, Add-ons, **UmbraDesktop Media**: the add-on's first `umbraDesktopPackageSettings`
box, so it makes the Media row. Its first line says which uploads are checked and which are not. A
change applies at once and is stored 400 ms after the last one, so typing a number stores it once.
Without the Settings section every control is disabled and a line says why; the server refuses the
write regardless. Values out of range put the field back.

## 8. Real run, measured

Worktree TestInstance (Umbraco 17.7.1 with the commercial stack), headless Chrome through the host's
`puppeteer-core`, files dropped through a `DataTransfer` the way an OS drop arrives (dragenter,
dragover, drop at what is under the point). No camera photos were on the machine, so the fixtures are
generated with `sharp`: two 6000 × 4000 JPEGs of 10.9 MB with Nikon EXIF and a GPS position, a 4032 ×
3024 phone photo stored on its side (orientation 6) with GPS, a 1920 × 1280 JPEG with only GPS, a
3200 × 2133 PNG photo of 18.4 MB, a logo with transparency, a WebP, a screenshot PNG, an animated GIF,
plus two real photos from the test instance's media. **Luuk should repeat it with his own phone's
photos.**

Drop to warning on screen (the check, including the decode of every PNG with an alpha channel):

| Drop | Size | Listed | Warning after |
| --- | --- | --- | --- |
| 12 mixed files | 56 MB, then 48 MB | 6 | 362 ms (cold, one 23.6 MB RGBA PNG decoded), then 236 ms |
| 6 listed files | 45 MB | 6 | 54 ms, 68 ms |
| **100 files**: 50 camera JPEGs, 25 small JPEGs, 10 PNG photos, 10 logos, 5 WebPs | **751 MB** | 60 | **795 ms** cold, 433 ms, 408 ms |
| 1 file | under 1 MB | 1 | 162 to 183 ms |

So header-only checking costs well under a second for a hundred camera photos, and the 40 that
passed were uploading through core's dropzone while the warning was up.

The optimizer on five listed files, the screenshot unticked (it uploaded as it was, byte for byte):

| File | Before | After |
| --- | --- | --- |
| DSC_0412.jpg | 6000 × 4000 JPEG, 10.9 MB, GPS | 2560 × 1707 JPEG, 249 KB, no EXIF (−98%) |
| DSC_0415.jpg | 6000 × 4000 JPEG, 10.9 MB, GPS | 2560 × 1707 JPEG, 257 KB (−98%) |
| IMG_2087.jpg | 3024 × 4032 upright, 3.9 MB, GPS | 1920 × 2560 JPEG, 425 KB, upright (−89%) |
| tattoo-shop.jpg | 1920 × 1280 JPEG, 590,364 bytes, GPS | 590,022 bytes, scan data identical, GPS gone |
| team-day.png | 3200 × 2133 PNG photo, 18.4 MB | 2560 × 1706 WebP, 322 KB (−98%) |

7.0 s for the five, optimize and upload, while core was still uploading 120 passing files from the
100-file drops beside it. A PNG with a valid header and corrupt picture data failed with the
browser's "The source image could not be decoded. Nothing was uploaded.", offered Retry and Upload
the original, and the latter uploaded it as it was. Closing the window mid-run asked first; a change
to the guidelines in Desktop settings applied to the next drop without a reload (a 2400 px JPEG was
then listed for 1920 px and JPEG to WebP).

## 9. What the real run found

1. **Fixed, and older than this feature: a strip-only file was encoded again.** The run store hands
   `optimizeFile` options it already normalised, whose quality is always set, and normalising them a
   second time read that quality as asked for. Every metadata-only file was re-encoded at 80 and kept
   when smaller: tattoo-shop.jpg lost 95 KB of picture data. This hits #139's own "Remove location,
   camera and date" on its own as well, against its hint. `normaliseOptions` now keeps an already
   decided `recompress`; tests in `options.test.ts` and `optimize-file.test.ts`.
2. **Fixed: Transfers opened over the optimizer** for every upload over two seconds. The optimizer's
   uploads are no longer followed there.
3. **Fixed: the settings box was too narrow** for its first layout (414 px wide at a 1600 px
   viewport); the label column now takes what the control leaves.
4. **Not a product bug: the first controller in an add-on 404s** on a worktree TestInstance until its
   stale `obj/.../*.MvcApplicationPartsAssemblyInfo.*` is deleted. ASP.NET only looks for controllers
   in the assemblies that file lists, and an incremental build does not regenerate it. A site
   installing or upgrading the package rebuilds it.
5. **Seen once, not reproduced: uploads stalled about 60 s each** during the first optimizer run, all
   bytes sent and waiting for the item, and the last three finished together at the moment the
   access token was refreshed; that browser session had logged two failed token requests at login.
   The same upload called directly took 117 ms, and the second run took 7 s for all five. Watch for
   it in a long session.
6. The stop question's caption is a snapshot ("Optimizing 1 of 4"), and the run carries on while the
   question is open, so a short run can finish before the answer. Existing #139/#108 behaviour.
7. Chrome decodes a JPEG with junk picture data as a grey picture, so only a corrupt PNG reached the
   failure path in the real run. The read-only settings were checked by switching the box's edit
   flag; the server's refusal for a user without Settings is covered by the controller tests.

## 10. Not done, or later

- Files inside a dropped folder are not checked (§4).
- Core's own upload, media pickers and Save as from other apps: out of scope (issue).
- HEIC: Chrome cannot read it (issue).
- The optimizer window opens at #139's height.

## 11. Changed after the owner's first test (2026-10-27)

The owner ran the flow on the instance and asked for five changes. All five are built.

1. **The warning is a dialog window, not a sheet inside the window.** The sheet blocked resizing its
   window, had too little padding, and looked like neither Umbraco nor the desktop. The desktop now
   has dialogs (`openDialog` on the window manager; [desktop-apps.md §7.9](../developer/desktop-apps.md#79-asking-a-question-in-a-dialog-over-your-window)),
   modelled on an OS's modal child window, and the warning is the first one:
   - A dialog is a window with `owner` and `dialog` set, so it reuses the attached-window group's
     rules: it rises, minimizes and closes with its owner, and is left out of the saved layout.
   - It takes the focus whenever its owner would (`focusGroup`). A click on the owner's content hits
     a scrim that brings the dialog forward and flashes it.
   - The owner's content and panes are `inert`, but its title bar and frame still move, resize and
     minimize it, and the dialog moves with it. That is lighter than Windows, where the owner takes
     nothing, and it answers the owner's complaint about resizing.
   - The dialog has no taskbar button, minimize, maximize, reload or resize handles. One dialog per
     owner; a second request is refused, and the app hears that from the event not being cancelled.
   - The flash swaps the theme's own active and inactive titlebar six times at 80 ms, so every theme
     flashes in its own colours with no new tokens. The scrim is one token, `dialog-scrim`.
   - An app asks with `umbradesktop-open-dialog` and its content closes it with
     `umbradesktop-close-dialog`. Its content lives in the dialog's window, so it gets callbacks in
     its props rather than sending events back; a disconnect without an answer means closed.
   - The content follows Umbraco's dialog layout: the message at the top, the buttons at the bottom
     right as `uui-button`s, normal padding.
2. **"Location" became "GPS location".** "Metadata" was the owner's first idea; it was not taken,
   because every file has metadata and the check only looks for GPS coordinates. Removing them still
   removes the camera and date with them, which the settings hint now says.
3. **The guidelines are at the top of the warning**, one tag each, each with an icon. Each file's
   chips carry the same icon, so a chip says which guideline it is without a legend. The long line
   about what Optimize does became one short line above the buttons.
4. **The settings link says it opens settings**: "Guideline settings", with the cog.
5. **Umbraco's upload limit is checked too.** The owner suggested Umbraco's maximum size in pixels.
   That setting, `Umbraco:CMS:Imaging:Resize:MaxWidth`/`MaxHeight`, caps the size a crop or `?width=`
   request may ask for and does not limit uploads (checked in the 17.6.0 XML docs). The limit Umbraco
   enforces on an upload is its size in bytes, `Umbraco:CMS:Runtime:MaxRequestLength`, which core's
   temporary file configuration passes to the backoffice as `maxFileSize` (in KB) and core refuses a
   larger file over. A file over it is now listed (`upload-limit`), only when the site sets a limit,
   with no switch, and its tag shows only when a listed file is over it. Optimizing it saves it anew
   at the quality, in its row's format, which brings a camera's file under any sane limit; one still
   over fails at the upload with Umbraco's own message. Only images are listed for it: a file the
   optimizer cannot touch would gain nothing from the warning, and core's own notification still
   refuses it.
6. **Optimize starts at once** (owner: it felt like doing the same thing twice). The run on files
   never shows a settings page; `createFiles` starts the run as it makes it. The window's files-only
   settings page and its words went with it. The caller's note now sits under the line that says
   what the run does.

Measured on the instance, headless Chrome at 1600 x 1000, with the site's upload limit set to 15000
KB for the run (`Umbraco__CMS__Runtime__MaxRequestLength`):

- Twelve files dropped: the dialog showed 128 ms after the drop, listing six, team-day.png (18.4 MB)
  among them as over 15.4 MB.
- A click on the owner's content flashed the dialog; dragging the owner 60 x 40 px moved the dialog
  by the same.
- Optimize: the optimizer showed its run 109 ms later, with no settings page, and the six files were
  optimized and uploaded in 4.7 s.
- The dialog's fixed height was first set at 300 px; its list came out 6 px short of its six rows, so
  it is 306. With three guidelines on one line instead of two, the list has 33 px to spare.
- Not reproduced: once, after a page reload, the owner window's top was at 0 instead of the 40 it
  had been moved to. It held through the drop, the dialog and Optimize in three later tries, so it
  looks like the reload's window restore racing the move, not the dialog.

## 12. After the owner's second test (2026-10-27)

1. **No pills for the guidelines.** The tags at the top did not say they were the guidelines, and the
   owner does not want pills there. Mocks: [`guidelines-dialog-variants.html`](mockups/upload-guidelines/guidelines-dialog-variants.html)
   (a sentence, a small table, the list's columns) and [`guidelines-dialog-expand.html`](mockups/upload-guidelines/guidelines-dialog-expand.html)
   (a line that opens into the table). Built: a **Media guidelines** heading with the guidelines under
   it at their shortest, on one line, each with its icon: "2560 px", "PNG photo → WebP", "No GPS",
   "15.4 MB". Formats is one item per format converted to, naming the kinds that go there ("JPEG, PNG
   photo → WebP"), so several rules stay short. No table and nothing to open: each file already says
   what happens to it, and **Guideline settings** has the rest.
2. **A file says what Optimize will do**, not what is wrong (owner): "Resize to 2560 px", "Convert to
   WebP", "Remove GPS", in plain words with the guideline's icon, one a line. Over the upload limit
   is said as "Make it smaller than 15.4 MB" only when the file is not resized or converted anyway,
   which already brings it under; the file's line says ", over 15.4 MB" either way. An unticked file
   says "Uploads as it is". A row is at least 60 px and grows by 18 px a line for a third action; the
   dialog asks for its first six rows' heights (`guidelinesDialogSize`).
3. **The optimizer's buttons are in a bar at the bottom**, Close last on the right, as Umbraco's own
   dialogs have them (owner). Cancel moved there too while a run goes, so the buttons are in one place.
   This applies to every Optimize images run, not only a run on files.
4. **The file that grew** in the owner's run, broken.jpg (5 KB to 26 KB), is a test fixture: a
   6000 × 4000 JPEG header with almost no picture data, which Chrome draws as flat grey. Resized to
   2560 it becomes a real 26 KB picture. A photo does not grow.

Measured on the instance as §11: ten files dropped, the dialog after 485 ms with six listed. The
fixed part came out at 290 px (it was 306 with the tags on two lines).
