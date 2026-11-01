# Add-ons app: design

> An app on the desktop that shows which add-ons exist for it, read live from the Umbraco Marketplace
> by the `umbradesktop` tag, and per add-on what to send to whoever builds the site. It informs and
> never installs.

- **Status:** Built and checked in a real backoffice 2026-10-29, uncommitted. What the run taught is in §11
- **Date:** 2026-10-29
- **Branch:** `claude/188-add-ons-app-209a0a`, to target `v17/main`
- **Issue:** [#188](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/188), the
  approved functional design, with its acceptance criteria and "Not doing" list
- **Mockup:** [`mockups/add-ons/add-ons.html`](mockups/add-ons/add-ons.html), rebuilt from live
  Marketplace data by `mockups/add-ons/_build/add-ons.cjs`. Sections 1 to 7 are decided; section 2's
  "Chosen" card is the one built
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

The owner handed the whole build over, so every open technical question was settled while building.
Those calls are marked **Call** below, each with its reason, so they can be reviewed and reversed one
by one.

---

## 1. Why

People who install the desktop never learn the add-ons exist. Entertainment, Accessories and Media
are mentioned in the READMEs and the docs, and nowhere a user looks, and a third party's add-on had
no way to be found at all.

A NuGet package needs a code change, a build and a deploy, none of which the backoffice can do. So the
app informs and hands over what to send on. It never pretends to install: no Install button, and
nothing about a not-installed add-on anywhere outside the app (no tiles, badges or prompts; the owner
calls that advertising).

## 2. What it is (from the issue)

- An `umbraDesktopApp`, **Add-ons**, in the System group, with no conditions, so every user sees it.
  Desktop settings' **Add-ons** heading links to it.
- The list is every Marketplace package tagged `umbradesktop` that supports the site's Umbraco major,
  in two sections: **From the UmbraDesktop team**, then **From the community**. With no community
  add-ons, an invitation to make one takes that section's place; otherwise it closes the list.
- A card: cover, icon, title, author, description, installed or not, and a permanent **Details ›**.
  The whole card opens the details.
- The cover is the first screenshot of the add-on's marketplace file, filled into 16:9 from the top;
  without screenshots, the icon on its dominant colour (`iconDominantColor`).
- The details page: screenshots with captions, the README, version, licence, downloads, links to the
  Marketplace page, docs and issue tracker, and a side panel in one of three states: installed (with
  its guide in Help), update available, not installed (a version-pinned `dotnet add package` line with
  Copy).
- Offline: a built-in list of ours, with icon covers, and a note that community add-ons cannot be
  shown.

## 3. The Marketplace, as measured

Measured on 2026-10-29 against `https://api.marketplace.umbraco.com/api/v1/packages`:

- It answers any origin (`Access-Control-Allow-Origin: *`), so the browser asks it directly. No
  server code.
- `?tags=umbradesktop` filters; `search` and `query` are ignored.
- **`pageSize` is capped at 50**, whatever is asked for (100 and 500 both return 50), and
  `pageNumber` is 1-based. The list is read page by page, up to ten pages.
- The list call returns `tags`, `umbracoMajorVersionsSupported` and `versionDetails` **empty**, so
  every package needs its own call, `/packages/{packageId}`, which has the rest.
- `versionDetails` has one row per Umbraco version a release line starts at:
  `{ umbracoVersionNumber: "17.0.0", latestPackageVersionNumber: "17.4.0" }`.
- `iconDominantColor` comes with and without its `#` (`#2D508A` on the package, `2D508A` in related
  packages).
- **Tags come from `umbraco-marketplace.json` only.** Umbraco's docs do not say. Measured instead:
  `Limbo.Umbraco.MediaPicker` has seven NuGet tags and no marketplace file, and has no tags on the
  Marketplace; packages with a file show its tags and none of their NuGet-only ones (`umbraco`,
  `umbraco-marketplace`). So the developer guide says the tag must be in the file. This answers the
  issue's first "To find out".
- Umbraco's docs give the timings: new packages are scanned for daily at 04:00 UTC, known packages
  refreshed every two hours. The invitation's "within a day" holds.

## 4. Calls on the data

- **Call: the version row.** The install line names `latestPackageVersionNumber` from the latest row in
  the site's major that the site has reached. A row starting at 17.8 describes releases a 17.6 site
  cannot take. A package with no row for the site's major is left out even if it claims the major,
  since there is no version to pin to.
- **Call: an unknown site version.** If Umbraco's server information cannot be read within five
  seconds, nothing is filtered and versions are each package's latest, and the lines that name a
  major say nothing about one. Listing too much beats an empty app; it should not happen for a
  signed-in user.
- **Call: only `https`.** Screenshot, icon and link addresses that are not absolute `https` are
  dropped; colours that are not three or six hex digits are dropped. All of it is another party's
  text that ends up in `src`, `href` or a style.
- **Call: Documentation falls back to `projectUrl`.** A package with only a README keeps its docs on
  its project page.
- **Call: the order.** Ours in the built-in list's order (the team's choice: Entertainment,
  Accessories, Media), any other of ours after them by title. The community by title: ranking by
  downloads would favour someone, and the app informs.
- **Call: the host is never listed.** `Umbraco.Community.UmbraDesktop` is filtered out, should it
  ever carry the tag. It has none today, and the Services packages are not on the Marketplace, both
  correctly.
- **"Ours"** is a package id starting `Umbraco.Community.UmbraDesktop.`, as the issue says.

## 5. Installed, and at which version

The issue's second "To find out". The extension registry does not keep a package's version. Umbraco's
own **private manifest endpoint**, `GET /umbraco/management/api/v1/manifest/manifest/private`, does:
every package's `id` and `version`, the same answer the backoffice registers extensions from. At the
floor (`release-17.6.0`) it is authorised by `BackOfficeAccess`, so every backoffice user may read it.
The full `/manifest/manifest` the Packages section uses needs access to that section, and the app is
for everyone.

So a package counts as installed exactly when its `umbraco-package.json` declares an `id` matching the
NuGet id; ours all do. The developer guide tells third parties to set `id` and `version`.

- **Call: installed-and-newer is up to date.** A site running a version above the Marketplace's newest
  (its own build, or a release the Marketplace has not picked up) is **Installed**, never "update
  available", which would ask for a downgrade. Versions compare numerically, prerelease before
  release, build metadata ignored.

## 6. How long to keep the answer

The issue's third "To find out".

- **Call: per page load.** The Marketplace answer is kept in module scope for as long as the
  backoffice page is open: a second window, or the app reopened, asks nothing. A failure is not kept,
  so **Try again** really asks again. The list changes when someone publishes, which the Marketplace
  itself only picks up every few hours.
- **Detail calls:** one per tagged package, six at a time. Today that is two. At fifty community
  add-ons it would be fifty small requests once per page load, which is acceptable; if it ever is
  not, the answer is to fetch details only for the first screenful and the rest on scroll.
- Installed versions and the site version are read on every open of the app, since they are this
  site's own and cheap.

## 7. Offline

- **Call: Media is in the built-in list.** The Marketplace had no 17 release of the Media add-on on
  2026-10-29, but our packages are released together at one version (`RELEASE.md`), so the desktop
  that carries this list ships beside a Media add-on of its own version.
- **Call: the offline install line is pinned to the desktop's own version**, read from the same
  manifest answer. Our add-ons are released in lockstep with the desktop, so the matching add-on is at
  that version, and the line can still be pinned without the Marketplace. The note under it says so.
  If releases ever stop being lockstep (deferred to the next major, see
  `2026-10-17-separate-releases-design.md`), this has to change. Without a known desktop version the
  panel says the version cannot be looked up rather than give an unpinned line, which could pull a
  release for another Umbraco major.
- **Call: the offline icon is the desktop's own app icon**, `appicons/icon-192.png`, served from the
  site. Our add-ons share the desktop's package icon, whose Marketplace copy cannot load offline
  either.
- Online, the Marketplace is the truth: a built-in add-on the Marketplace does not list is not
  added back.

## 8. Built from Umbraco's pieces

The owner asked for Umbraco-native and existing pieces wherever they fit.

| Part | Built from |
| --- | --- |
| Installed / Not installed, and the facts | `uui-tag` |
| Side panel | `uui-box`, its headline slot carrying the state dot |
| Copying the install line | `uui-button-copy-text`, with core's `general_copy` label and its `copy` icon. The line itself is a plain wrapping `code`, not core's `umb-code-block`, which never wraps (§11) |
| Back, Try again, guide, invitation, settings link | `uui-button` |
| Loading | `uui-loader` |
| README sanitising | core's DOMPurify (`@umbraco-cms/backoffice/external/dompurify`), with the forbidden-tag list Help already uses |
| Installed packages | core's `ManifestService` with `tryExecute` |
| Site version | core's `UMB_SERVER_CONTEXT.serverInformation` |
| Opening Help | the desktop's published `umbradesktop-open-help` event |
| Finding a guide | the registered `umbraDesktopDocs` folders and their `product.json` `packageId`, as Help reads them |
| Colours and shapes | the desktop's `--umbradesktop-app-*` tokens with UUI fallbacks, so every theme restyles it |

- **Call: the card is our own markup.** UUI's cards were checked. `uui-card` is a base class, not a
  registered element; `uui-card-block-type` has a fixed 150px portrait, a one-line description and no
  author line; `uui-card-media` and `-content-node` are for media and documents. None gives the
  agreed 16:9 cover with a three-line description, so the card is one `<button>` styled like Help's
  landing cards, with UUI tokens.
- **Call: the settings link is a `uui-button`, not a settings row.** The row's chevron promises "a
  screen you come back from" (its own doc comment), and this opens a window and closes the panel. It
  reads **Find more add-ons**, sits below the package rows, and the **Add-ons** heading now always
  shows, since the button lives under it. The button closes the panel, which would otherwise sit over
  the window it just opened.

## 9. Smaller calls

- **One window** (`allowMultiple: false`): a second would show the same list.
- **No routing inside the app.** The list and the details switch in place; **All add-ons** goes back.
  The app does not report a location, so a reopened window starts on the list. Deep links to an
  add-on's details are not needed by anything yet.
- **Screenshots open full size in a new tab** when selected; in the details column they are smaller
  than taken.
- **The README replaces the description under About** online; offline, with no README, the
  description stands there.
- **The invitation opens Help** at `umbradesktop/building-an-add-on` rather than a web page, so it
  works offline and shows the installed version's guide.
- **Icon:** `icon-puzzle-piece`, the conventional add-on mark; Packages already has `icon-box`.
- **Strings** are English and Dutch, like every other desktop string. Package titles and descriptions
  are the Marketplace's, in whatever language their authors wrote.

## 10. Files

- `backoffice/src/desktop/add-ons/`: `marketplace.ts` (the API, the conversion and the rules),
  `readme.ts` (sanitising), `built-in.ts` (offline list), `add-ons-data.ts` (loading, installed
  versions, finding a guide), `add-ons-source.ts` (the real source: Marketplace cache, manifest
  endpoint, server context, docs folders), `add-ons.element.ts` (the app), `manifest.ts`, and a test
  file for each that has logic.
- `settings/components/settings-modal.element.ts`: the heading always shows, and **Find more
  add-ons** under it.
- `docs/user/apps/add-ons.md` and `docs/developer/building-an-add-on.md`, linked from their category
  READMEs and from Desktop settings' and package settings' pages.

## 11. Real run

Checked on 2026-10-29 on this worktree's TestInstance (newest Umbraco 17, a copy of the main
database, the unattended admin), driven by headless Chrome through the repo's `puppeteer-core`.

**What held:**

- The list asked the Marketplace for the tag, then each package: Entertainment and Accessories under
  **From the UmbraDesktop team**, the invitation in the community's place, and "Showing add-ons for
  Umbraco 17". The Media add-on is installed on the TestInstance but not on the Marketplace, so it is
  not listed online, as §7 intends.
- Installed came from the private manifest endpoint, with every package's `id` and version. The
  TestInstance's own builds are `17.5.0-alpha.0.13`, above the Marketplace's 17.4.0, and showed
  **Installed**, not an update (§5).
- **Not on this site yet** and **Update available** were checked by changing Umbraco's manifest answer
  on its way to the page: Entertainment dropped, so its extensions really did not load, and
  Accessories reported as 17.3.0. Both install lines named 17.4.0.
- The README rendered with its links in a new tab with `data-router-slot="disabled"`, with no
  `script` or `style` element and no `style` or `class` attribute left in it.
- **Open its guide in Help** opened Help at the Accessories guide; **Find more add-ons** in Desktop
  settings opened the app and closed the panel.
- With every request to the Marketplace aborted: our three add-ons from the built-in list with the app
  icon as their cover, the community section's notice with **Try again**, the invitation below it,
  and nothing thrown.
- All five themes restyle it through the app tokens; nothing disappears under any of them.
- No console errors from the app. Those in the log are the TestInstance's own (Workflow's SignalR
  404, a token 400 during sign-in).

**What the run found, all fixed and covered by a test where a test can see it:**

1. **A fourth line under the ellipsis.** The description was `flex: 1` so the foot sat at the card's
   bottom, which made the clamped box taller than three lines and showed the next line under the
   "…". The foot's `margin-top: auto` does that job now.
2. **The version scrolled out of sight.** Core's `umb-code-block` sets `white-space: pre` inside its
   shadow root, so in the 300px side panel the line scrolled and the version at its end, the one thing
   the line is for, was hidden. The line is now a plain `code` that wraps, with UUI's
   `uui-button-copy-text` under it.
3. **The update panel promised apps appearing.** It used the not-installed sentence, "its apps appear in
   your launcher", for an add-on whose apps are already there. It has its own sentence now.
4. **Offline, an installed add-on was called up to date.** Without the Marketplace the newest version is
   not known, so offline the panel no longer says "You are on the newest version".

**Not checked in the real run:**

- A user without access to Settings. The app has no conditions and the manifest endpoint needs only
  backoffice access at the floor, so it should work the same; reasoned, not run.
- A real community add-on: there is none yet. The tests cover one, made up, with and without
  screenshots.
- The Dutch strings on screen. The parity test checks every key is translated.
