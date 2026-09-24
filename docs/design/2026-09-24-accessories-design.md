# Accessories: Notepad, Paint, Sticky Notes, Calculator, Clock and Screen Saver

> A third package, `Umbraco.Community.UmbraDesktop.Accessories`, built exactly as Entertainment is,
> holding the small tools Windows kept under Start > Programs > Accessories. It uses nothing but the
> public `umbraDesktopApp` manifest, plus one new launcher group in the host. The screen saver adds
> an ordinary Umbraco `backofficeEntryPoint`, and nothing in the host.

## 1. Why a separate package

[The desktop-apps design](2026-09-06-desktop-apps-design.md) §8.1 settled this before anyone built
a tool: "a tool is not entertainment. A calculator, a notepad or a colour picker would be lying under
this package id ... Windows filed those under Accessories, a level up. If the desktop wants them,
they want their own package." This is that package.

Everything about its layout, versioning and release is Entertainment's, unchanged:

- Razor SDK project, a Vite-built bundle under `App_Plugins/Umbraco.Community.UmbraDesktop.Accessories`,
  and `umbraco-package.json` stamped with the MinVer version at build time.
- Lockstep on one tag (D13): same `v*` tags, same version, published on every release. The host
  dependency is the same `[17.0.0,18.0.0)` range from `src/Directory.Packages.props`, never a
  `ProjectReference`.
- Its own Marketplace listing, `umbraco-marketplace-umbraco.community.umbradesktop.accessories.json`,
  cross-linked with `RelatedPackages` to the host and to Entertainment.
- Built, tested and packed by the shared `build-packages` action, so CI and the release cannot
  disagree about it, and referenced by the TestInstance beside the other two.

## 2. The `accessories` group

The host gains one group, `accessories`, with the same contract as `games`: the host owns the alias,
the label and its localisation, and nothing in the host puts an app in it. Weight 55, after System
(50) and before Games (60). That is where Windows put it, with Games a folder inside Accessories, and
a tool is closer to what an editor came for than a game is.

Dutch is "Bureau-accessoires", the name the Dutch Windows 95 and 98 used.

## 3. The apps

Each is one custom element, as the seam requires, with its rules in a pure module beside it so they
test without a DOM, and its sizes derived in its own `constants.ts` so the manifest can read them
without importing the element. They share one stylesheet (`shared/styles.ts`) and nothing else:
§11 of the apps design warns against a shell several apps live in, and a shared stylesheet is
ordinary reuse rather than that.

| App | Pure module | Decisions worth their reasoning |
|---|---|---|
| Notepad | `text.ts`: caret line/column | Opens and saves text files in the media library, per §4. |
| Paint | `raster.ts`: Bresenham lines, square stamps, scanline flood fill | Pixels are set directly rather than stroked by the canvas, because canvas strokes are antialiased and a fill that stops at "not the clicked colour" then leaves a halo round every line. MS Paint never antialiased, which is why its bucket worked. The paper stays white under every theme: it is the document, not the chrome. |
| Sticky Notes | `board.ts`: folding the server's board into the window's copy | The only app with a server behind it; see §5. |
| Calculator | `engine.ts`: an immutable state machine | Immediate execution, as the Windows calculator does in Standard mode, not precedence. Results are rounded to 15 significant digits, which removes the float noise (`0.1 + 0.2` shows `0.3`) and nothing a person typed. Percent is "of the running total" after an operator, as in Windows. |
| Screen Saver | `savers.ts`: each saver's state and drawing | See §6. |
| Clock | `hands.ts`: hand angles, time to the next second | Ticks on the real second boundary rather than a free-running 1000ms interval, so it turns over with the taskbar clock. Time and date go through `this.localize.date`, so they follow the backoffice culture. |

## 4. Notepad and Paint work on the media library

**Every file lives in the media library** (decided with the repository owner, 2026-09-24, replacing
a first version that saved to the person's machine by default). Open shows Umbraco's own
`UMB_MEDIA_PICKER_MODAL`, the picker a media property uses, so it browses, searches and uploads the
way the rest of the backoffice does; a file on someone's computer gets in through its Upload button.
Save writes the file back over the media item it came from, and renames that item if the name in the
status bar changed. A new document or picture is saved into a folder chosen in **Desktop settings >
Accessories**, the root until one is. There is no download and no local file dialog: a document
here is site content, and the media library already has the folders, permissions and recycle bin
for it.

- **Which files.** `shared/media-files.ts` decides, as pure functions. Notepad takes text by
  extension or by `text/*`, SVG included, since SVG is a drawing written as text. Paint takes raster
  images and refuses SVG, which it could only flatten, destroying the original on save.
- **Paint keeps a picture's format and size.** An opened image is drawn at its own size, up to
  4,096 px on an edge, and saved in its own format where a canvas can write that format (PNG, JPEG,
  WebP), so a photograph stays a JPEG; GIF and BMP save as PNG. Undo keeps whole copies of the
  picture, so its depth comes from a 256 MB budget rather than a fixed twenty.
- **Messages go in the window.** Why an open or a save did not happen, and that a save did, show in
  the app's status bar rather than as a toast, since that is where the person is looking.

**The folder setting lives in the desktop's own settings panel**, which needed a way in. The panel was
curated only, and a curated list cannot name a package this repository does not know about, so the
host gained a second public manifest type, `umbraDesktopSettingsCategory`, modelled on
`umbraDesktopApp`: the host draws the row, heading and navigation, the registering package owns the
element and its values, and `conditions` are honoured through `UmbExtensionsManifestInitializer`.
Registered categories sit after Taskbar and before Connections and Site. The alternative, an
Accessories category built into the host, would have shipped a row that does nothing without the
add-on and coupled the host to the add-on's storage. `docs/desktop-apps.md` §6.1 documents it.

The value is stored per user in `localStorage`, the same scope as every other desktop setting,
under the add-on's own key. Controllers in open windows hear a change through a `window` event,
because `storage` events only reach other documents.

**A media save goes through the backoffice's own repositories**, never a hand-built Management API
call, so authentication, permissions and error messages are the backoffice's. A new item follows the
steps the Media section's drag-and-drop takes: media types that accept the extension, intersected
with what the folder allows, preferring a type that names the extension; then a temporary file and a
create. The drag-and-drop class itself (`UmbMediaDropzoneManager`) is not in the backoffice's public
exports, so `shared/media-save.ts` repeats its steps with the public pieces it is built from. A second
save of the same document overwrites the item it created (a temporary file, `umbracoFile` pointed at
it, and a save) unless that item is gone or trashed, in which case it creates a new one.

**Verified against a running Umbraco 17.7** (see §8 for how): Notepad created `Untitled.txt` as a
File and a second save updated that item; then, through the real media picker, Notepad opened it,
an edit and a rename were saved back (one item, renamed, its file read back with the new text), and
Paint opened `Untitled.png` at its own 480 × 300, drew on it and saved it back (the saved file read
back with the new pixels).

## 5. Sticky Notes: one board for everyone

Sticky Notes is the one app here with a server behind it, and the package's first C#. Decided with
the repository owner: one shared board, no private notes, anyone may edit or delete any note, and
changes reach other people within about fifteen seconds rather than instantly.

- **Storage:** one JSON document in Umbraco's key-value store (`StickyNotes/StickyNoteStore.cs`),
  as the host keeps its connections. No table, no migration, and it travels with a database backup.
  Capped at 100 notes of 2,000 characters, so the row stays small; the caps are sent with the board,
  so the window never holds a copy of either number.
- **API:** `StickyNotesController`, a management API controller under
  `umbradesktop/accessories/sticky-notes`. Any backoffice user reaches the route, and every action
  checks the Desktop section itself, because Umbraco has no policy for a package's own section;
  without that check any backoffice account could read the board.
- **No lost updates.** Every note has a version. An edit names the version it was made against, and
  one against an older version is refused with 409 and the note as it now stands. The window keeps
  its own text on screen and offers "Use theirs" or "Keep mine". A note deleted elsewhere while it
  had unsaved text here is offered back ("Put it back" or "Discard"). While either is unsettled, and
  while text is waiting to save, the window carries `data-umbradesktop-dirty`, so closing asks.
- **Refresh:** every fifteen seconds, and whenever the window is focused or clicked, skipping one
  within three seconds of the last. A refresh never overwrites text somebody is still typing; the
  rules for folding the server's board into the window's copy are `board.ts`, and are tested.
- **Load-balanced sites:** the store's write lock is per process, so two servers can race on the
  same row and the later write wins that race. The version check still catches the common case.
- **C# tests** are a project of their own, `Umbraco.Community.UmbraDesktop.Accessories.Tests`,
  referencing only the add-on so they run against the host as a consumer gets it. CI runs them in
  the shared build action beside the host's.

Running it for real, with two users in two browser sessions (§8), found three bugs every test had
passed:

1. **The backoffice's HTTP client throws on an error status.** Its types describe an `{ error }`
   result; a running backoffice rejects the call instead. The window read a 409 as a thrown error
   and never showed the conflict choice. `api.ts` now catches, and `api.test.ts` stubs the client to
   throw, as the real one does.
2. **It also replaces any error body that is not problem details.** A 409 carrying the bare note
   reached the window as `{ status: 409, title: "Conflict" }`, the other person's text gone. The
   409 is now problem details with the note in a `note` extension. Any management API in this
   repository that returns data on an error status needs the same shape.
3. **Clicking a window does not focus it.** The refresh listened for `focusin`, and clicking a
   window's background or a byline moves no focus, so the second person never saw the first's note
   until they clicked into a text box. It now refreshes on `pointerdown` too.

And one layout bug, fixed on the third attempt: a note with the conflict panel spilled over the row
below. `grid-auto-rows: minmax(170px, auto)` only grows into spare space, which a small window has
none of; `auto` with a `min-height` on the note takes the `min-height` as the row's minimum instead
of the content; and the note's footer shrank to 5px as a flex item besides. What works is
`grid-auto-rows: min-content`, a `min-height` on the note, and `flex-shrink: 0` on everything in it
but the text.

## 6. The screen saver

**The window is Windows 98's Screen Saver tab**, control for control: a monitor running the chosen
saver as a live preview, a list with **(None)** at the top, **Wait _ minutes**, and **Preview**.
(None) is how it is switched off, as it was in Windows, rather than a checkbox beside the list; it
keeps the saver that was chosen, so switching back on is one choice. The same element
(`screensaver-panel.element.ts`) is also the screen saver part of Desktop settings > Accessories,
over the same settings, so the two places it can be set cannot drift apart.

**Off by default.** Something that covers the whole backoffice unasked would read as a fault the
first time it happened after an upgrade.

**Three savers**, in `savers.ts` as pure factories over a canvas size and a random source, so
tests seed them: Starfield, Mystify (two four-cornered shapes with trails and a slow hue drift), and
Flying Umbraco, the Umbraco mark in place of Flying Windows. Each step takes the time since the last
frame, capped at 100ms, so a tab back from the background does not fling every star past the viewer
at once.

**Who starts it: a `backofficeEntryPoint`**, because it has to come on with every window closed,
its own included. The entry point starts one `ScreensaverWatcher`, which checks once a second and
does nothing while the setting is off. It starts the saver only when the setting is on, the page is
showing the desktop (by its path, `/section/umbradesktop`), the tab is visible, and nobody has done
anything for the wait.

**Listening inside the windows.** Most windows are backoffice pages in same-origin iframes, and an
event inside one never reaches the page around it. A watcher listening only to the page would start
the screen saver over someone busy typing in a content editor. So every five seconds the watcher
looks through the desktop's shadow roots for iframes whose current document it has not heard from,
and listens there too (a frame that navigates has a new document). Activity heard in a frame also
ends a running screen saver, which cannot hear it from where it is.

**What wakes it.** Any key, click, scroll or touch, and a pointer movement of more than 8px from
where it first saw the pointer, so a knocked desk leaves it running, as Windows did. A click that
wakes it is swallowed, so it does not also press whatever was underneath. On start it takes focus,
so a key pressed to wake it does not type a letter into the field that had focus.

**Verified live** against the harness (§8): it came on after the one-minute wait, a 3px nudge left
it running, a real movement ended it, keydowns inside a Content window's iframe kept it off for 80
seconds, it came on 56 seconds after they stopped, and one more keydown in that iframe ended it.

## 7. Known gaps

**Closed: closing a Notepad or Paint window now asks about unsaved work.** The host's close guard
reads a window's `dirty` flag, which only the iframe dirty watch used to set. The app contract now
has a channel for it: an app puts `data-umbradesktop-dirty` on its own element while it holds
unsaved work, `<umbradesktop-app-host>` watches that one attribute with a `MutationObserver`, and
the window passes it to the same `setDirty` the iframe path uses. So the titlebar marker, the
taskbar marker, the close guard and the leave-the-desktop prompt all cover app windows with no
app-specific code in any of them. An attribute rather than an event, because it needs nothing
imported from the host and can be read at any moment. Documented in `docs/desktop-apps.md` §7.

**Clock does not follow the desktop's 12/24-hour setting.** That setting lives in a host context a
separate package cannot import, so Clock uses the culture's own hour cycle. The same contract
question as the one above: the host would have to publish the setting to apps.


## 8. What the build taught

- **A real backoffice can run on Linux, and it finds what tests do not.** The TestInstance wants
  SQL Server LocalDB and carries Umbraco Engage, which refuses SQLite, so it cannot boot outside
  Windows. A throwaway site in a scratch folder can: a `Microsoft.NET.Sdk.Web` project with
  `Umbraco.Cms` (same version as the TestInstance), `ProjectReference`s to the host and the add-on,
  the host package with `ExcludeAssets="all"` as in the TestInstance, the TestInstance's
  `Program.cs` minus `UseHttpsRedirection`, and an `appsettings.json` with a SQLite connection
  string (`Microsoft.Data.Sqlite`) and an unattended install. Drive it with `puppeteer-core` from
  any package's `node_modules`, pointed at the preinstalled Chromium with `--no-sandbox`. Two
  things to know: the unattended admin does not have the Desktop section (grant it through the
  user-group API), and rebuilding a frontend renames its hashed chunks, so the site must be rebuilt
  and restarted too or the app window fails to load. In a cloud container the .NET SDK comes from
  Ubuntu's archive (`apt-get update && apt-get install dotnet-sdk-10.0`) when dot.net is blocked.

- **Measure every app at its declared sizes, under every theme id.** `fits.test.ts` mounts each
  one in a box exactly its `defaultSize` and its `minSize` and asserts nothing overflows. Its first
  run found Clock 40px too tall at its minimum under all six cases, with every other test green: an
  in-flow SVG with a `viewBox` sizes itself from its width, so the face asked for a square as wide as
  the window. The face's SVG is now out of flow. The derived sizes were right; the layout ignored
  them.
- **Check an icon alias exists before shipping it.** `icon-eraser` reads like it should exist and
  does not, and the desktop falls back to `icon-box` without a word, so a wrong alias is a quietly
  wrong tile rather than an error. The full list is the keys of
  `@umbraco-cms/backoffice/dist-cms/packages/core/icon-registry/icons.js`; grep it.
- **Not everything the backoffice uses is exported.** `UmbMediaDropzoneManager` is exactly the
  class a media save wants and is not in `@umbraco-cms/backoffice/media`'s exports; `tsc` says so
  with TS2305. Check the `exports` map in the package's `package.json`, not the `dist-cms` tree.
- **Registered settings categories arrive asynchronously.** A test that settles one macrotask and
  then counts rows races the condition evaluation; wait for the row instead.
- **`umbConfirmModal` rejects on cancel rather than resolving false**, and so does `umbOpenModal`.
  Wrap either in `try`/`catch` and return a boolean, as the host's own `_askToDiscard` does.
- **`aria-label` on an element whose text is the content hides the content.** A `<time>` labelled
  "Time" is read as "Time", not as the time, so the digital clock carries no label at all.
- **An app test that records a saved file must record it synchronously.** Awaiting `blob.text()`
  in the fake races the assertion; store the file and read it in the test.
- **An inactive window swallows the first click** to bring itself forward, as the desktop design
  intends. A script driving two windows must press buttons directly (`el.click()` in the page), or
  its first click in the window behind does nothing.
- **The test runner's pages are not all in the foreground.** It runs several test files at once,
  and Chrome treats some of those pages as hidden: no animation frames at all, and
  `document.visibilityState === 'hidden'`. Every screensaver test passed alone and eight failed in
  the full run. Anything that waits on `requestAnimationFrame` or checks visibility takes the
  frame source or the visibility check as an injectable property, and the tests drive it by hand.
  That includes open-wc's `fixture()` for a plain (non-Lit) element, which waits for a frame; build
  such an element with `document.createElement` instead.
- **Importing anything that pulls in the backoffice's module graph takes about 8 seconds** the first
  time in the test runner, longer than the 5-second test timeout. A test that reaches such a module
  through a manifest's lazy loader times out; import the module statically at the top of the test
  file as well, so it loads before the timer starts.
- **Not every activity event has a `view`.** `input` is a plain `Event`, so the watcher tells which
  window activity came from by which listener fired, one per window, not by reading the event.
