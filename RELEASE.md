# Releasing UmbraDesktop

Repo-specific facts a generic checklist cannot know. Read this first, then work the
`nuget-pre-release` checklist against it.

## What ships

Six packages, twice: one set for Umbraco 17 (`17.Y.Z`) and one for Umbraco 18 (`18.Y.Z`), twelve
in all, from **one tag**. Within a set they are always at the **same version** (see
[Versioning](#versioning) for how the two sets' versions relate):

| Package | What it is |
|---|---|
| `Umbraco.Community.UmbraDesktop` | The desktop. The product. |
| `Umbraco.Community.UmbraDesktop.Services.Arcade` | Service package. High scores and the Arcade hub. Never installed on its own: Entertainment, and any game add-on, depends on it. Has server code (EF Core tables and an API) and a C# test project. No Marketplace listing, on purpose. |
| `Umbraco.Community.UmbraDesktop.Services.Media` | Service package. Opening and saving media library files for apps. Never installed on its own: Accessories and Media, and any app that edits media files, depend on it. Also defines the file menu and open view elements the Media add-on's Image Editor uses. Frontend only, no C# test project. No Marketplace listing, on purpose. |
| `Umbraco.Community.UmbraDesktop.Entertainment` | Optional games and media add-on: Minesweeper, Snake, Solitaire and umbraCoffee. |
| `Umbraco.Community.UmbraDesktop.Accessories` | Optional tools add-on. Notepad, Paint, Sticky Notes, Calculator, Character Map, Clock, Screen Saver, Disk Cleanup and System Information. It has server-side code of its own (the Sticky Notes API) and a C# test project beside it. |
| `Umbraco.Community.UmbraDesktop.Media` | Optional media add-on: the Media Manager, which hosts Umbraco's own media library in desktop windows and adds dragging, the clipboard, OS file drops, transfers and undo, and the Image Editor. Frontend only, no C# test project. The one package that bundles npm code (Fabric.js, MIT, for the Image Editor): it packs a `THIRD-PARTY-NOTICES.md`, and its build fails on a bundled package that is not permissively licensed or not listed there. |

Lockstep is a decision, not an accident: design D13 in
[`docs/design/2026-09-06-desktop-apps-design.md`](docs/design/2026-09-06-desktop-apps-design.md)
§8.3, and Accessories and Media follow it unchanged
([`docs/design/2026-09-24-accessories-design.md`](docs/design/2026-09-24-accessories-design.md),
[`docs/design/2026-10-17-image-editor-design.md`](docs/design/2026-10-17-image-editor-design.md)).
All six publish on **every** release, changed or not — a gap in an add-on's version history
reads like a broken pipeline, where a version with no changes reads like Umbraco.

**Every add-on requires this release of the host, or any later version for the same Umbraco
major.** Each add-on references the host as a `ProjectReference`, never a `PackageReference`: it is
then compiled against the host from the same commit, and its packed dependency is
`[<this release>, 17.99999999.0]` in the Umbraco 17 set (`18.99999999.0` in the 18 set). The floor is the
release itself because an add-on registers things only this release's host understands (package
catalogues; for Entertainment also tray items; for Accessories also the unsaved-work attribute and the settings context's
`formatDateTime`; for Media also app titles, the close request, pages attached to an app window and apps hidden from the launcher). The add-ons used to take the host by package range, floored at 17.0.0, which
compiled against 17.0.0 and let consumers keep a host that silently lacked them: on such a host the
Accessories Clock threw on every render and Notepad closed over unsaved work without asking.
Upgrading the host on its own within 17 is still fine; the ceiling is why. There is deliberately no
central `PackageVersion` for the host any more, so an add-on written with a `PackageReference` fails
restore with NU1010 instead of shipping the old range.

A `ProjectReference` does not give that range by itself. NuGet packs it as a bare minimum,
`>= <version built beside it>`, with no ceiling at all, so an add-on would claim to support host 18
and every major after it. The `BoundHostRange` target in `src/Directory.Build.targets` rewrites it
after NuGet computes it, for every project that references the host, so a new add-on gets it
without doing anything. The ceiling is one property, `UmbraDesktopUmbracoMajorCeiling` in
`src/Directory.Build.props`, which the Umbraco ranges in `src/Directory.Packages.props` use too.
The target hooks NuGet's private `_GetProjectReferenceVersions`, which an SDK update can change
without a word, so `.github/actions/build-packages` reads the nuspec of every packed add-on (every
`Umbraco.Community.UmbraDesktop.*` package other than the host) and fails the run unless its host
dependency is exactly `[<host package version>, <that major>.99999999.0]`. The floor comes from the host
project's own MinVer version, the same number as the add-on's because both are versioned off one
tag. Entertainment also requires this release of the Arcade, and Accessories and Media this release of
the media service, bounded the same way, and the same check reads those dependencies too; it fails if a
package depends on a service package that is not in the pack output, because a release has to ship
both. **The ceiling follows the major**: `UmbraDesktopUmbracoMajorCeiling` is
`$(UmbracoMajor).99999999`, so the 17 set is capped at `17.99999999.0` and the 18 set at
`18.99999999.0`, and the action checks each set against its own.

**The Umbraco floor is checked against the bundles.** `UmbraDesktopUmbracoFloor` in
`src/Directory.Packages.props` is the oldest Umbraco each major's packages install on: 17.6.0 for 17,
18.0.0 for 18. 17's was 17.0.0 until a fresh 17.0.0 site showed the desktop never loading: the
bundles import names the backoffice only exports from 17.4, and every test runs against the newest
backoffice, so nothing had noticed. The same sites showed the overwrite guard silent below 17.6, where
core has no `loadWithoutPersist`, so the floor went to 17.6 rather than 17.4.
`.github/actions/build-packages` reads each set's floor from its packed host's
`Umbraco.Cms.StaticAssets` range, fetches that release's backoffice from NuGet, and fails the run if
any packed bundle imports a name it does not export (`backoffice/scripts/check-umbraco-floor.mjs`).
**Using a newer backoffice API means raising the floor**, or importing it so a missing name is
survivable; the check says which. It only sees imported names: a method or property core added
later, as `loadWithoutPersist` was, passes the check and has to be caught by reading core's changes.

The host also depends on `Umbraco.Cms.StaticAssets`, the backoffice itself, at the same range. NuGet
does not refuse an install below a floor: it lifts what the package declares, and only that. On a
17.0 site it lifted Core, Infrastructure and Web.Common to the floor and left the backoffice at 17.0, so
the desktop still failed to load. Declaring the backoffice lifts it too, and the check reads its floor
from that dependency.

`Umbraco.Community.UmbraDesktop.TestInstance` and `.Tests` are never published.

## Versioning

MinVer, from `v*` tags on this repository. `MinVerTagPrefix=v`, `MinVerAutoIncrement=minor` and
`MinVerMinimumMajorMinor=17.0` are set **once, in `src/Directory.Build.props`**, for all six packages.
They used to be repeated in every csproj file, and an add-on that lost its `MinVerTagPrefix` versioned
itself `17.0.0-alpha.0` while the host said `17.0.0`. The `SetJsonVersion` task and the
`SyncUmbracoPackageVersion` target that stamp each `umbraco-package.json` live once in
`src/Directory.Build.targets` too; a package names only its own `UmbracoPackageJsonPath`.

**The package major tracks the Umbraco major**, so the first release was `v17.0.0`, not `v1.0.0`.
One source tree builds for Umbraco 17 and 18
([Building for Umbraco 17 and 18](docs/developer/umbraco-versions.md)), and **one tag versions both**.
The tags keep Umbraco 17's numbers. A tag `v17.Y.Z` builds `17.Y.Z` for Umbraco 17 and `18.Y.Z` for
Umbraco 18, the same features under the same minor and patch, so the first 18 release is
`18.<the 17 minor of the day>.0` rather than `18.0.0`. The `UmbraDesktopVersion` target in
`src/Directory.Build.targets` swaps the major after MinVer has run; a 17 build never enters it.
`UmbraDesktopMajorPreRelease` in `src/Directory.Build.props` ships the 18 set as a prerelease (for
example `rc.1`) from a tag that ships 17 stable.

**Every tag publishes both sets.** `publish.yml` runs the build action with
`umbraco-majors: '17 18'`, as CI does on every pull request. The action builds, tests and packs the
majors one after the other, never at once, because both stamp the same built `umbraco-package.json`.

**18 starts as a release candidate.** `UmbraDesktopMajorPreRelease` is `rc.1` for the 18 set, so the
first tag after the 18 work merged ships 17 stable and 18 as `18.Y.Z-rc.1`. A tag that is itself a
prerelease (`v17.5.0-beta.1`) keeps its own label in both sets. Once a release candidate has held up
on real sites, empty the property in a pull request, and the next tag ships 18 stable. For a second
release candidate instead, make it `rc.2`.

## Cutting a release

1. Everything for the release merged to `main`, including the README, `umbraco-marketplace*.json`
   and `docs/` (see the Definition of done in [`CLAUDE.md`](CLAUDE.md)). `main` is the trunk;
   check `origin/main`, not your local copy.
2. Branch `release/vX.Y.Z` from `origin/main`. From here `main` is free for the next release's
   work. Only this release's finishing touches go on the branch: fixes, and screenshots, which
   need a running backoffice and so usually come last.
3. Tag `vX.Y.Z` on the release branch. A tag push is what publishes, and there are two ways to make
   one:
   - **A version worth announcing:** the owner creates a release on GitHub, with a new tag on the
     release branch and the notes written by hand. Creating the tag there is a tag push like any
     other, so it triggers `publish.yml`. The owner does this step.
   - **A version that is not:** push the tag on its own, with no GitHub release. It publishes to
     NuGet and leaves the repository's Releases list alone. The GitHub UI cannot create a tag
     without a release, so this is done from the command line or GitHub Desktop, and the owner
     asks Claude to do it.
4. `.github/workflows/publish.yml` does the rest: every frontend, every test suite, the C# tests,
   every pack, a payload check and NuGet trusted publishing. It never creates a GitHub release,
   whichever way the tag was made, so a release exists only when someone made one in step 3. It
   also does not attach the packages to that release; they are on nuget.org.
5. Merge the release branch into `main` straight away, with a pull request. The Marketplace reads
   the listing files from `main`'s root and their screenshot URLs point at `main`, so until this
   merge the listing still shows the old screenshots. NuGet does not wait for it: the packed
   README's images are pinned to the tagged commit, which has them.

   This repository allows squash merges only, so the merge brings the changes back but never the
   tagged commit, and `main` never has the release tag in its history. MinVer versions a commit
   from the newest tag among its ancestors, so `main`'s CI packages keep numbering themselves as
   prereleases of the version just shipped (17.3.0-beta.1.N after 17.3.0) until the next release
   is tagged. Nothing ships from those packages, so this is cosmetic. Do not "fix" it by tagging
   `main`: a tag push is a publish. 17.2.0 and earlier were tagged on `main` itself, after
   squash-merging a `release/` branch, which is why their tags are in `main`'s history and later
   ones are not.

### Release notes

The notes are written in the GitHub release screen, and its **Generate release notes** button diffs
against the **previous tag**. If you cut a beta first, the stable release's notes cover only what
happened after the beta and omit the entire feature line. Hand-curate the body of any stable
release that had a prerelease before it.

The generated notes list pull request titles, grouped by `.github/release.yml` into new features, bug
fixes, documentation and other changes. A pull request lands in a group by its `enhancement`, `bug`
or `documentation` label, which `.github/workflows/sync-release-labels.yml` copies from the issue it
closes when it merges. So that it does:

- Link the issue, with "Closes #123" in the body or the Development sidebar. A bare mention is not a
  link.
- A pull request with no issue needs its type label by hand, or `ignore-for-release` when a reader of
  the notes would not care: CI, tests, screenshots, merging a release branch back. Anything left
  unlabelled shows up under **Other changes**, so a missed one is visible in the draft.

The version label (`release/vX.Y.Z`) is for filtering issues, not for the notes, which come from the
commits between the two tags.

**Until 18 has been out a while, every release's notes say these two things,** above the generated
list. The first 18 release's notes lead with them:

- **Install the release for your Umbraco**: 17.x on Umbraco 17, 18.x on Umbraco 18, with the
  commands in [Installation](docs/user/getting-started/installation.md). Once 18 is stable, a plain
  `dotnet add package` on a 17 site picks 18.x and the restore fails.
- **Empty the media recycle bin before upgrading a site to Umbraco 18.** Umbraco 18 protects media
  in the recycle bin, but not media that was already there when the site upgraded: those files stay
  public, and emptying the bin afterwards leaves them on disk
  ([umbraco/Umbraco-CMS#24303](https://github.com/umbraco/Umbraco-CMS/issues/24303)). Drop this
  once a fixed Umbraco release is out. Put it on the pull request or the issue, whichever you have open when
the version is known; the same workflow copies it from the pull request to the issue on merge.

## Owner-only steps

Nothing in CI can do these.

- **nuget.org trusted publishing — already set up, and set up correctly.** Verified 2026-09-09.
  The policy behind the `NUGET_USER` secret trusts `Luuk1983/Umbraco.Community.UmbraDesktop`,
  workflow `publish.yml`, environment `production`, owner `luukpackages`, with the glob pattern
  `*` and the **Push new packages and package versions** scope. Both halves matter for a second
  package: a never-published ID has no package to attach a policy to, so it needs a *pattern*
  rather than a literal ID, and the narrower "Push only new package versions" scope would reject a
  brand-new ID even under a matching pattern. Nothing to do per package. Re-check this only if the
  workflow file is renamed, the `production` environment is dropped, or the pattern is narrowed.

  **Publishing works from any branch, on purpose.** The `production` environment carries no
  required reviewers, no wait timer and no deployment branch policy, and `publish.yml` does not
  check that the tagged commit is on `main`. That looks like an oversight and is not: a hotfix may
  have to ship from its own branch, and any of those restrictions would block exactly the release
  you would most want out quickly. The environment exists to satisfy the trusted-publishing policy's
  environment claim, not as an approval gate. The `v*.*.*` tag pattern is the only guard, which is
  specific enough that publishing by accident means pushing a genuinely release-shaped tag.
- **Screenshots.** Need a running backoffice and a login, which is why they are always the last
  thing. The host's live in `docs/screenshots/`, and each add-on's in its own
  `docs/screenshots/` since #78 split the docs, the way an external add-on's would. The READMEs and docs reference them by relative path,
  which the docs check validates, and packing pins the README's copies to the release commit
  (`PinPackedReadme` in `src/Directory.Build.targets`), so they resolve once that commit is pushed.
  The marketplace files reference them by `raw.githubusercontent.com/.../main/...` URL, so those
  resolve only once the commit is on `main`, and nothing validates them: a filename typo silently
  404s on the live Marketplace, and a broken image is worse than a missing one, so an entry is
  added only after the file exists. Never move or delete a screenshot that has shipped: the NuGet
  pages of versions packed before the pinning point at it on `main`.

  Reviewed for 17.3.0 on 2026-10-03. A feature earns a shot when a still frame explains it faster
  than the README sentence does; most do not. A shot is retaken when its subject changes, not when
  the chrome around it does: the full screen button and the arranged launcher appear on every frame
  with a taskbar or launcher in it, and reshooting the theme and guard shots for that would not
  make any of them explain its subject better.

  Note the ordering rule above cuts both ways. An entry must not reach `main` before its file, but
  preparing the entry on the same branch as the feature is how the two arrive together — what must
  never happen is a merge with one and not the other.

  **Write every caption and alt text for the subject, not for the frame.** Name what the shot is
  *demonstrating* and how it is arranged; never the windows that happen to be open, the number of
  rows in a table, the group names in a list, the identifiers of another package's tool calls, or
  whether the backoffice was in light or dark mode. All of those have already gone stale here: a
  theme retake that opened different windows falsified two alt texts, a wallpaper added to the set
  falsified a count, and the theme rows were still described as "named colour swatches" long after
  they became miniatures. A description that survives a retake is worth more than one that is
  precise about a screen nobody will capture the same way twice.

  | Shot | Notes |
  |---|---|
  | `hero.png` | The opening image of the README and the listing since #78: two windows side by side with the site's name on the wallpaper. Check the alt text, this table and the marketplace `Caption` together, because all three describe the same frame. |
  | `desktop-windows.png` | The opening image until #78, now used only by the Windows page of the user guide and no longer in the listing. Kept, because shipped NuGet pages point at it. |
  | `live-preview.png` | An editor with its page docked beside it, the first attached window. |
  | `notifications.png` | The notification history under the clock. |
  | `theme-gallery.png` | All five themes in one frame, in the README's "Make it yours". The listing keeps the macOS and Windows 98 shots beside it for a closer look at two of them. |
  | `ai-copilot-chat.png` | Umbraco AI's Copilot chat in a window. Needs the TestInstance's Umbraco.AI packages and an API key to retake. |
  | `help.png` | The Help app. Retake when the add-ons' docs change what its contents list shows. |
  | `unsaved-changes-guard.png` | Carries the whole guard story in one frame: the unsaved dot, the "someone else changed this" warning with both buttons, and the recycle-bin error, in three stacked windows with all three markers repeated on the taskbar. A separate overwrite-guard shot was planned and is not needed because this one covers it. Note the file arrived named `unsved-`, which would have 404ed silently on the Marketplace; check new filenames against the `ImageUrl` by eye, since nothing else will. |
  | `launcher.png` | The whole launcher: the Pinned row, every group, the commercial packages, and the add-ons' Games and Accessories groups. Retake when a group is added or the launcher's layout changes; the caption names the Games group, so it must be in the frame. Since 17.3.0 the launcher no longer fits 1920×1080, so it was taken in a 2400×1351 window at normal scale and shrunk to 1920×1081; a fractional device pixel ratio instead changes how labels wrap. The "Minesweepe/r" break in the Games tile is the product's own, not the capture's. |
  | `theme-macos.png`, `theme-win98.png` | Two of the five themes, deliberately not all five. A theme shot sells the idea that the chrome restyles; the Description naming all five does the rest, and five near-identical launchers would pad the listing without adding to it. `theme-win98.png` shows an older launcher and is kept as it is: it is there to show the theme, and the content behind it is not the subject. |
  | `choose-background.png` | Desktop settings with the wallpaper tray open. The one shot that proves any of this is *yours to change*: without it a reader can take the two theme shots for two screenshots of a product rather than a switch they flip, and the Media library button is the only place that capability appears in the gallery at all. Also the only shot that evidences the README's count of shipped backgrounds, since the tray names them all plus None. The theme row is clipped by the tray, so neither the caption nor the alt text claims all five are visible. **Retake when the tile count changes** — it was shot at eight and the package ships ten since Cobalt Beacon and First Light. The README's alt text deliberately names no number, so a stale shot never contradicts the prose, but it is still the shot that has to show them all. |
  | `theme-wallpaper-match.png` | The theme picker with **Match the wallpaper to the theme** on, every preview carrying its own background. The one frame that explains the feature without a caption: Windows 98's bare teal sitting beside macOS's sunrise says what "each theme brings its own wallpaper" means faster than the sentence does. Take it with the toggle **on** — off, the five previews are identical backgrounds and the shot shows nothing. |
  | `background-jobs-viewer.png` | The Distributed table only. The Recurring one is below the fold and the view does not fit a screen at any framing worth having, so the caption does not claim the split and the explanation at the top of the shot carries the point. |
  | `entertainment-games.png` | In the add-on's `docs/screenshots/`. Every game open at once under the Umbraco theme, and since 17.3.0 the add-on's opening image, so its NuGet page too, and first in its listing. It replaced the Minesweeper shot there because that one's alt text had to name every game in a menu and went stale when Solitaire arrived. Retake it when a game is added; the alt text names the games, so check it with the shot. Solitaire freshly dealt, Snake before the first key press, Minesweeper mid-game. |
  | `entertainment-games-minesweeper.png` | In the add-on's `docs/screenshots/`. Windows 98 with the Start menu open to Games. Now the Minesweeper section of the games page and the second listing entry; its alt text names no games, so a new one does not falsify it. The copy left in the host's `docs/screenshots/` is the shipped one and stays. |
  | `entertainment-games-solitaire.png` | In the add-on's `docs/screenshots/`. A game in progress with the settings button visible, in the add-on README and listing. |
  | `entertainment-games-snake.png` | In the add-on's `docs/screenshots/`, listing only. Framed to match Minesweeper's: Windows 98, the Games group open in the launcher. Take it **before** the first key press, so the start message is showing in the middle of the board and the snake is sitting a quarter of the way down above it, since that is the one moment the board says how to play. |
  | `header-entry-point.png` | Small and annotated on purpose. It answers one question, "where is the way in", and showing more screen would not answer it better. |
  | `umbracoffee-live.png`, `umbracoffee-upcoming.png`, `umbracoffee-on-demand.png`, `umbracoffee-search.png`, `umbracoffee-themes.png`, `umbracoffee-reminder.png` | In the add-on's `docs/screenshots/`. umbraCoffee live, before the next show, playing the latest episode, searching by guest, under every theme, and the reminder ten minutes before a show, for the Entertainment listing (live and upcoming) and its umbraCoffee page (all six). The window shots are the window alone at its default size, the reminder a 420×200 corner with the cup. Live and upcoming need a live or upcoming episode: the console commands in [Testing umbraCoffee](src/Umbraco.Community.UmbraDesktop.Entertainment/docs/developer/umbracoffee-testing.md) give one, but name it "Simulated episode", so the 17.x shots answered `next-episode.json` with a real archive episode's id and title instead (puppeteer request interception). Live shows the Episodes tab, because YouTube disables the chat of a past video; retake it during a real show to have the chat in it. |

  **Accessories has one shot**, `accessories-desktop.png` in its own `docs/screenshots/`: a few of
  its tools open side by side under Windows 98. It is the add-on's opening image and its only
  listing entry.

## umbraCoffee's data (Entertainment)

umbraCoffee does not call YouTube from customer sites. A scheduled workflow does, and the editor's
browser reads the result from GitHub. Design:
[`docs/design/2026-09-30-umbracoffee-v2-design.md`](docs/design/2026-09-30-umbracoffee-v2-design.md).
Everything below is an owner step except where it says the workflow does it.

**The workflow.** `.github/workflows/umbracoffee-feed.yml` runs every five minutes and by hand
(Actions tab, "umbraCoffee feed", Run workflow). It runs `tools/umbracoffee-feed/src/run.mjs` on the
branch `data/umbracoffee` and pushes only when a file changed. The client reads `episodes.json` and
`next-episode.json` from `raw.githubusercontent.com/.../data/umbracoffee/umbracoffee/`; the address
is the one constant `UMBRACOFFEE_DATA_BASE_URL`. Scheduled runs only ever use the workflow file on the
default branch, so nothing happens until it is on `main`.

**The files on the data branch**, all in `umbracoffee/`:

| File | Written by | What it is |
| --- | --- | --- |
| `sources.json` | the workflow | Every episode with its title, date and YouTube description |
| `details.json` | you, with `apply-details.mjs` | Summary and guests per episode, made from the description |
| `overrides.json` | you, by hand | Your corrections. Always wins. No tool writes it |
| `episodes.json` | the workflow and `apply-details.mjs` | What the app reads, rebuilt from the three above. No descriptions |
| `next-episode.json` | the workflow | The upcoming or live episode, if any |

The workflow only commits `sources.json`, `episodes.json` and `next-episode.json`. It reads
`details.json` and `overrides.json` but never commits them, so your push is the only way they change.
`tools/umbracoffee-feed/README.md` has every command and the file shapes.

**Fill in new episodes, about once a month.** Summaries and guests are written locally, never by the
workflow and never on a customer's site, so a new episode shows with no summary until you do this.
Run from the repository root, with `<dir>` the `umbracoffee/` folder of a data branch checkout:

1. To get the workflow's latest `sources.json`, pull the data branch.
2. To see what needs doing, run `node tools/umbracoffee-feed/src/pending.mjs <dir> > pending.json`.
   It lists new episodes and ones whose title or description changed. An empty array means nothing
   to do.
3. To write the answers, give a Claude Code session `tools/umbracoffee-feed/prompts/episode-details.md`
   and `pending.json`, and ask it to run the prompt once per episode and write all answers, each with
   its `videoId`, to `results.json`.
4. To save them, run `node tools/umbracoffee-feed/src/apply-details.mjs <dir> results.json`. It
   refuses the whole file if one answer is wrong and names each bad one; fix those and run it again.
5. To check them, read the answers marked uncertain, and run
   `node tools/umbracoffee-feed/src/guests.mjs <dir>` for new spellings of known guests. Put fixes in
   `overrides.json`, then apply again (an empty `[]` results file is enough) or let the workflow
   rebuild `episodes.json`.
6. To publish, commit `details.json`, `episodes.json` and any `overrides.json` change, and push the
   data branch.

**One guest, one name.** The guest filter groups people by name, so "Jesper" and "Jesper
Mayntzhusen" would be two guests. `guestNames` in `overrides.json` maps a spelling to the name it
means, as an exact match, and a guest that becomes a duplicate within an episode is dropped. `guests.mjs`
lists the pairs that look like one person spelled two ways.

```json
{
  "version": 1,
  "guestNames": { "Jesper": "Jesper Mayntzhusen" },
  "episodes": { "<videoId>": { "summary": "...", "guests": [{ "name": "...", "affiliation": null }], "guestsUnnamed": false } }
}
```

Both parts are optional. Under `episodes`, each field you give (`summary`, `guests`, `guestsUnnamed`)
wins over `details.json` for that episode, and the fields you leave out still come from it.

**The data branch.** Nothing to create by hand: if `data/umbracoffee` does not exist, the workflow
creates it as an orphan branch on its first run (the "Check out the data branch" step) and pushes the
first files to it. Protect nothing on it, or the push fails. Run the workflow once by hand after the
merge and look at `raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/data/umbracoffee/umbracoffee/episodes.json`.

**The YouTube key.** Without `YOUTUBE_API_KEY` the workflow still keeps the episode list current, but
`next-episode.json` stays empty, so there is no countdown, cup or reminder. To create the free key:

1. In the Google Cloud console create a project (any name). No billing account is needed.
2. Under APIs and services, Library, enable **YouTube Data API v3** for that project.
3. Under Credentials, create an **API key**. Under its restrictions choose "Restrict key", API
   restrictions, and allow only YouTube Data API v3. Leave application restrictions off: the calls
   come from GitHub's runners, whose addresses change.
4. In the repository, Settings, Secrets and variables, Actions, add a repository secret named
   `YOUTUBE_API_KEY` with the key.

The default quota is 10,000 units a day and the workflow spends one unit per lookup, a few a day
normally and one a run while an episode is coming up or live. The tool never prints the key, and its
tests check that an error message does not contain it.

**Scheduled workflows switch themselves off.** GitHub disables scheduled workflows in a public
repository after 60 days without repository activity. What was
checked: the design's assumption that development on `main` counts, which is the reason no keepalive
was built. What was **not** checked: whether a push to `data/umbracoffee` alone counts, since the
first 60 days have not passed. So do not rely on the data branch. The fallback if the workflow is
found switched off is to enable it again in the Actions tab (a disabled scheduled workflow stays off
until someone does) and run it by hand. A monthly no-op commit to `main` is the next step if that
ever happens twice. The client already copes with a stopped workflow: a stale next-episode file is
ignored and the app falls back to the episode list, which does not go stale in a harmful way.

**Refresh the shipped snapshot before packing.** The package carries a copy of the episode list for
when GitHub cannot be reached (`backoffice/src/umbracoffee/snapshot/episodes.snapshot.json` in the
Entertainment project). Nothing does this in CI, so before tagging:

```bash
curl -L -o episodes.json https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/data/umbracoffee/umbracoffee/episodes.json
node tools/umbracoffee-feed/src/snapshot.mjs episodes.json
```

The snapshot is the version 2 `episodes.json` whole, summaries and guests included; `snapshot.mjs`
refuses an older version. It stamps `snapshotAt` with the file's own date, which is the "showing
episodes up to" date users see when offline. Fill in new episodes first, so the snapshot has their
summaries. Review the diff and commit it with the release. Delete `episodes.json` afterwards.

**The one-off backfill.** The RSS feed stops at the 15 newest videos, so the older episodes are
added once by hand with `backfill.mjs`. The workflow never does this. The order against the
workflow's runs does not matter: for episodes still in the feed, the workflow brings the title and
description up to date itself. Collect the ids with their upload dates as `id,published` lines (an
ISO date, for example `aRkc0fRxQjw,2026-09-25T11:27:38Z`; bare ids are refused, since oEmbed has no
dates) and run
`node tools/umbracoffee-feed/src/backfill.mjs <dir> < ids.csv`. It asks oEmbed for each unknown id's
title, skips ids it already has or oEmbed does not know, adds the rest to `sources.json` with an
empty description and rebuilds `episodes.json`. Commit both and push the data branch. The scrape
itself is not kept in the repository.

The dry run of `run.mjs` against the real feed with no key, and the tool's tests (`node --test` in
`tools/umbracoffee-feed`, also run by the build action), are the checks that exist. The workflow
itself has not run on GitHub yet.

## Traps this repository has actually hit

- **A package with no frontend installs cleanly and does nothing.** `wwwroot/App_Plugins/` is Vite
  output and is **gitignored**, so a clean checkout that runs `dotnet pack` without `npm run build`
  first produces a valid, empty, silent package. Both workflows build the frontend before
  `dotnet build`, and both then assert the packed asset count is non-zero. Do not remove that check
  because it has never fired.
- **Never invoke npm from MSBuild** to "fix" the above. Ordering belongs in the workflow; coupling
  `dotnet build` to a working Node install breaks every machine without one.
- **`Version="0.*"` packs as `>= 0.4.3` with no ceiling** — the resolved version becomes the floor
  and the package claims to support majors that do not exist yet. Every shipped dependency in
  `src/Directory.Packages.props` is a bounded range for that reason. `Umbraco.JsonSchema.Extensions`
  sidesteps it differently: it is build-time only, so it carries `PrivateAssets="all"` and never
  reaches the dependency list at all.
- **`[17.0.0,18.0.0)` admits Umbraco 18's prereleases.** NuGet orders `18.0.0-rc.1` before
  `18.0.0`, so an exclusive `18.0.0` ceiling lets every 18 beta and RC in, which is exactly the
  code a 17 package has never been tested against. Bound Umbraco references at `17.99999999`
  instead (`[17.0.0,17.99999999]`), which stops below every 18 version, prerelease or not, and is
  a plain stable number so it pushes cleanly (see `-0` below). The ceiling is one property,
  `UmbraDesktopUmbracoMajorCeiling` in `src/Directory.Build.props`, shared with the add-ons' host
  dependency. It is the same for every major: `[18.0.0,19.0.0)` admits 19's prereleases, so the 18
  set is capped at `18.99999999` by the same property.
- **`-0` as an upper bound** (`[17.0.0,18.0.0-0)`) packs fine and then fails
  `dotnet nuget push` with `400 BadRequest: invalid Version`. Use plain stable bounds.
- **`dotnet test` against a directory or a solution** silently matches nothing and reports green.
  The workflows name `Umbraco.Community.UmbraDesktop.Tests.csproj` explicitly.
- **`git clean -xdf`** deletes the test instance's SQLite database and `wwwroot/media/`. Dry-run
  with `-xdn` first.
- **`npm ci` with Visual Studio open** fails with `EPERM` after emptying most of `node_modules` —
  the `-vs-binding` entry in both `package.json` files auto-runs `npm run watch`, whose esbuild
  worker holds a lock. Recover with `npm install`.
- **A CI-built package's SourceLink points at a commit that does not exist.** `pull_request` checks
  out an ephemeral merge of the branch into `main`, so that is the commit the nuspec's `repository`
  element records — not the branch tip the run reports. Harmless, because CI packages are
  throwaway and `publish.yml` triggers on a tag push, which checks out the real commit. But never
  try to debug into a package downloaded from a CI run's artifacts.
- **Nothing validates `umbraco-marketplace*.json`.** A typo in a screenshot filename silently 404s
  on the live Marketplace, and a broken image is worse than a missing one. Validate against
  <https://marketplace.umbraco.com/validate>, and check every `ImageUrl` resolves.

## The Marketplace, with two packages in one repository

The Marketplace finds a package by the `umbraco-marketplace` NuGet tag, then looks for its listing
at the **project URL** — for a GitHub project URL, the root of the default branch. One repository
serving several packages suffixes the file with the **lowercased package ID**:

- `umbraco-marketplace-umbraco.community.umbradesktop.json` — the host.
- `umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json` — the games add-on.
- `umbraco-marketplace-umbraco.community.umbradesktop.accessories.json` — the tools add-on.
- `umbraco-marketplace-umbraco.community.umbradesktop.media.json` — the media add-on.

**The Arcade has no listing, on purpose** (design D2,
[`docs/design/2026-10-01-arcade-design.md`](docs/design/2026-10-01-arcade-design.md)). It is
infrastructure that games depend on, not something to choose, so it carries no `umbraco-marketplace`
NuGet tag and no `umbraco-marketplace-*.json`. Do not add one. Entertainment's listing carries the
leaderboard tags instead.

**Both are suffixed, deliberately.** An unsuffixed `umbraco-marketplace.json` is observed to keep
serving the package that has no suffixed file of its own, and the host shipped that way for
17.0.0 — but that fallback is nowhere in the documentation, which says only "create a JSON file for
each package, suffixed with the package ID". Umbraco's own multi-package repo
(`Umbraco.StorageProviders`) suffixes all of its files and keeps no unsuffixed one. Two suffixed
files means neither package depends on undocumented behaviour and no reader has to work out which
file serves which package. Keeping a mirrored unsuffixed copy as well was rejected: JSON has no
comments, so there is no way to mark it as a mirror, and one edit applied to only one of them gives
a listing that silently disagrees with itself.

**The rename is verifiable before the stable tag, and reversible.** The lookup runs against the
repository root on `main`, not against a tag, so the Marketplace picks the rename up on its next
refresh of the host package (every two hours for a known package) as soon as this merges,
regardless of when you tag. Check the host listing still shows its own Description, screenshots,
category and author rather than the bare NuGet-sourced data. If it has gone generic, the suffixed
lookup did not resolve: restore `umbraco-marketplace.json` as the host's filename and force a sync.

The two are cross-linked with `RelatedPackages` rather than merged with `IsSubPackageOf`: the add-on
is a separate thing you choose, not a variant of the desktop.

**Listing requires a dependency on an Umbraco package**, and version detection requires one on
`Umbraco.Cms.*` — direct or **transitive**. Entertainment has no direct Umbraco dependency at all;
it reaches `Umbraco.Cms.Core` transitively through the host. That is documented as sufficient but
has not been observed for that package yet, so **check its listing appears and shows v17 after its
first stable release**. If it does not, a direct `Umbraco.Cms.Core` reference is the fix.
Accessories gets `Umbraco.Cms.Api.Management` and `Umbraco.Cms.Api.Common` for its Sticky Notes API
through the host reference, so it meets the rule the same way.

Note *stable*, not *first publish*: the Marketplace appears to track only stable versions, so a
package whose only published version is a prerelease has nothing for it to list. `17.1.0-rc.1`
therefore proves nothing about the add-on's listing, and force-syncing it at that point is wasted.
The same refresh on the host settles it either way: if `latestVersionNumber` moves to a `-rc`
version, prereleases are indexed after all.

**One listing covers both majors.** The 17 and 18 sets share their package IDs, and the Marketplace
reads supported versions from each release's Umbraco dependencies, so neither the listing files nor
anything else changes for 18. That is the convention Umbraco's own packages follow. While 18 ships as
a release candidate, the note above means the listings show 17 only. **After the first stable 18
release, check every listing shows both 17 and 18.**

New tagged packages are picked up in the daily 04:00 UTC scan; known packages refresh every two
hours. A single package can be forced with a `POST` to
`https://functions.marketplace.umbraco.com/api/InitiateSinglePackageSyncFunction`, throttled to one
request a minute per package ID.

## Scope notes

- The Entertainment design (§8.2) planned **Minesweeper and Solitaire** for its first release.
  Solitaire was descoped then and shipped in 17.3.0 (#116), with Snake added in between.
- A Linux theme is deliberately not built. See `CLAUDE.md`.
