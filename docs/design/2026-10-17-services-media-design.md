# The media service package: design

> Opening and saving media library files moves out of Accessories into a service package,
> `Umbraco.Community.UmbraDesktop.Services.Media`, built the way the Arcade is. Notepad and Paint use
> it from there with no change in behaviour, and the Media add-on and any outside package can use it
> the same way.

- **Status:** Built 2026-10-17
- **Date:** 2026-10-17
- **Branch:** `146-services-media`
- **Issue:** [#146](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/146). Comes
  before the Media add-on's apps that open and save media: the image editor (#136), Capture (#140)
  and the bulk actions (#139)
- **Target:** Umbraco CMS **v17**, packages `Umbraco.Community.UmbraDesktop.Services.Media` (new) and
  `Umbraco.Community.UmbraDesktop.Accessories`

---

## 1. Why a package

Three places were weighed for code more than one add-on needs. Add-ons import nothing from each
other or from the host, so each was judged by how a second package would reach it.

| Option | Verdict |
| --- | --- |
| A shared source folder each add-on's build bundles | Rejected. One source, but no outside package can use it. And it breaks for elements: two bundles registering the same tag fail on the second, which rules it out for the media player that follows (§6) |
| In the host, as a context | Workable, with no extra package. But the host would carry media editing code it never uses itself |
| A service package, as the Arcade is | **Chosen** (decided with the repository owner, 2026-10-17) |

The service package keeps the option open to other packages, and gives later shared media code a
home. What belongs in it is any media code another package could plausibly want, even when only one
add-on uses it today. Waiting for a second user was proposed and rejected.

## 2. How it is reached

- **D1. A `umbraDesktopContext`, alias `'UmbraDesktopMediaContext'`.** The apps that open and save
  files are elements on the desktop, as games are, so a desktop context reaches all of them and
  starts nowhere else. The alias is published API.
- **D2. Four methods, plain data in and out:** `open()`, `save(request)`, `pickSaveFolder()`,
  `confirmOverwrite(name)`. They are the four functions Notepad and Paint already called, with the
  same types, so the move changes no behaviour and a consumer's copy of the types is short. They were
  not widened, and not merged into one "save with the conflict question" call: an app words its own
  "not saved" message, and Notepad and Paint already did that differently.
- **D3. No host is passed in.** The service opens its pickers and dialogs on the desktop, which reaches
  the same modal manager the app element did, so they look and stack exactly as before.
- **D4. One host per call, destroyed afterwards.** The operations create backoffice repositories and
  a localization controller on the host they are given. On the app element those went when the window
  closed; the context lives as long as the desktop, so each call runs on a child controller that is
  destroyed when the call ends, failed or not. Tested in `media.context.test.ts`.

## 3. What moved and what stayed

Moved, with their tests: `media-open.ts`, `media-save.ts`, `save-location.ts`.

Stayed in Accessories:

- `media-files.ts`: which files Notepad and Paint accept, and how a saved file is named. Those are the
  apps' rules, not the service's: the service opens any file and leaves the judgement to the app. Its
  `extensionOf` is repeated in the service (`files/extension.ts`), four lines being cheaper to repeat
  than to publish.
- `unsaved.ts`: the host's unsaved-work attribute, which Sticky Notes uses too. Nothing to do with media.

The Save As folder remembered for the session is now shared by every app that uses the service, not
only by Notepad and Paint. That is the Windows behaviour it copied.

## 4. Words

The overwrite question moved to the service's own area, `umbraDesktopServicesMedia`, in English and
Dutch, unchanged. Not `umbraDesktopMedia`, which is left for the Media add-on: two packages sharing an
area could each overwrite the other's words. Everything an app says around an open or a save stays in
the app's area, as before. The reasons a file is refused are Umbraco's own `media_` keys.

## 5. When the service is missing

Accessories depends on the package, so the service is there wherever Accessories is. Should its
context not load, Notepad and Paint wait half a second for it and then say the media library cannot
be reached (`mediaUnavailable`, Accessories' area). Save As answers the root in that case so the save
reaches the saver, which gives the reason; nothing is written there. Open reports a failure.

## 6. The media player follows later

The media player stays in Entertainment until the Media Viewer (#145). umbraCoffee builds the YouTube
engine itself and imports the player's layout constants and clock format, so sharing it now would make
its engine interface public API while #145 is known to change it. It goes into this package with #145,
as an element.

## 7. Packaging

A frontend-only Razor class library like the Arcade's, minus the server code. Accessories references it
as a project, so its packed dependency is bounded like the host's by `BoundHostRange` in
`src/Directory.Build.targets`, and the build-packages action checks that range for every service
package (the Arcade check became a loop over both). No Marketplace listing, like the Arcade.
