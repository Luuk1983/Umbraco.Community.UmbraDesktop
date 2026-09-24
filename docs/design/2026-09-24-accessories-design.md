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
| Notepad | `text.ts`: caret line/column, save name | Files go through the browser (file picker, download), never the server, so there is no C# surface and no permission to decide. An opened file saves back under its own name. |
| Paint | `raster.ts`: Bresenham lines, square stamps, scanline flood fill | Pixels are set directly rather than stroked by the canvas, because canvas strokes are antialiased and a fill that stops at "not the clicked colour" then leaves a halo round every line. MS Paint never antialiased, which is why its bucket worked. The paper stays white under every theme: it is the document, not the chrome. |
| Calculator | `engine.ts`: an immutable state machine | Immediate execution, as the Windows calculator does in Standard mode, not precedence. Results are rounded to 15 significant digits, which removes the float noise (`0.1 + 0.2` shows `0.3`) and nothing a person typed. Percent is "of the running total" after an operator, as in Windows. |
| Clock | `hands.ts`: hand angles, time to the next second | Ticks on the real second boundary rather than a free-running 1000ms interval, so it turns over with the taskbar clock. Time and date go through `this.localize.date`, so they follow the backoffice culture. |

## 4. Known gaps

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

## 5. What the build taught

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
- **`umbConfirmModal` rejects on cancel rather than resolving false**, and so does `umbOpenModal`.
  Wrap either in `try`/`catch` and return a boolean, as the host's own `_askToDiscard` does.
- **`aria-label` on an element whose text is the content hides the content.** A `<time>` labelled
  "Time" is read as "Time", not as the time, so the digital clock carries no label at all.
- **An app test that records a download must record it synchronously.** Awaiting `blob.text()` in
  the fake downloader races the assertion; store the blob and read it in the test.
