# Accessories: Notepad, Paint, Calculator and Clock

> A third package, `Umbraco.Community.UmbraDesktop.Accessories`, built exactly as Entertainment is,
> holding the small tools Windows kept under Start > Programs > Accessories. It uses nothing but the
> public `umbraDesktopApp` manifest, plus one new launcher group in the host.

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

## 3. The four apps

Each is one custom element, as the seam requires, with its rules in a pure module beside it so they
test without a DOM, and its sizes derived in its own `constants.ts` so the manifest can read them
without importing the element. They share one stylesheet (`shared/styles.ts`) and nothing else:
§11 of the apps design warns against a shell several apps live in, and a shared stylesheet is
ordinary reuse rather than that.

| App | Pure module | Decisions worth their reasoning |
|---|---|---|
| Notepad | `text.ts`: caret line/column, save name | Open uses the browser's file picker. Save goes to a download or the media library, per §4, with no C# surface either way. An opened file saves back under its own name. |
| Paint | `raster.ts`: Bresenham lines, square stamps, scanline flood fill | Pixels are set directly rather than stroked by the canvas, because canvas strokes are antialiased and a fill that stops at "not the clicked colour" then leaves a halo round every line. MS Paint never antialiased, which is why its bucket worked. The paper stays white under every theme: it is the document, not the chrome. |
| Calculator | `engine.ts`: an immutable state machine | Immediate execution, as the Windows calculator does in Standard mode, not precedence. Results are rounded to 15 significant digits, which removes the float noise (`0.1 + 0.2` shows `0.3`) and nothing a person typed. Percent is "of the running total" after an operator, as in Windows. |
| Clock | `hands.ts`: hand angles, time to the next second | Ticks on the real second boundary rather than a free-running 1000ms interval, so it turns over with the taskbar clock. Time and date go through `this.localize.date`, so they follow the backoffice culture. |

## 4. Saving to the media library

Notepad and Paint save either to the person's machine (a download) or to the media library (a
media item), chosen in **Desktop settings > Accessories** along with a media folder. That choice is
what Save and Ctrl+S do, and each app keeps a second button for the other destination. Defaults to
the machine, because it is the one destination that always works.

**The setting lives in the desktop's own settings panel**, which needed a way in. The panel was
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

**Not verified against a running Umbraco.** Everything above the media repositories is tested with
a fake saver; the saver itself calls real backoffice classes that need a booted backoffice and a
server, and this was built where neither was available. The two paths to try first are a create in
a folder, and a second save of the same document, which is the overwrite.

## 5. Known gaps

**Closing a Notepad or Paint window does not ask about unsaved work.** The host's close guard
(`window-manager.context.ts`, `confirmDiscard`) reads a window's `dirty` flag, and only the iframe
chrome injector sets it. An app element has no way to report it, because the manifest contract has
no such channel. New and Open ask (with Umbraco's own `UMB_DISCARD_CHANGES_MODAL`, the same wording
a workspace uses), but the titlebar's close button does not. Fixing it means adding a way for an app
element to tell the host it is dirty, for example a documented event or attribute, which is a
change to the public app contract and belongs in its own design rather than in this package.

**Clock does not follow the desktop's 12/24-hour setting.** That setting lives in a host context a
separate package cannot import, so Clock uses the culture's own hour cycle. The same contract
question as the one above: the host would have to publish the setting to apps.

**`packages.lock.json` was not generated for this project** in the session that created it, because
no .NET SDK could be installed there. `RestorePackagesWithLockFile` is on repo-wide, so the first
`dotnet restore` writes it. Commit it then, as the other two projects' are.

## 6. What the build taught

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
- **An app test that records a download must record it synchronously.** Awaiting `blob.text()` in
  the fake downloader races the assertion; store the blob and read it in the test.
