# Releasing UmbraDesktop

Repo-specific facts a generic checklist cannot know. Read this first, then work the
`nuget-pre-release` checklist against it.

## What ships

Three packages, from **one tag**, always at the **same version**:

| Package | What it is |
|---|---|
| `Umbraco.Community.UmbraDesktop` | The desktop. The product. |
| `Umbraco.Community.UmbraDesktop.Entertainment` | Optional games add-on. |
| `Umbraco.Community.UmbraDesktop.Accessories` | Optional tools add-on. Notepad, Paint, Sticky Notes, Calculator, Character Map, Clock, Screen Saver, Disk Cleanup and System Information. It has server-side code of its own (the Sticky Notes API) and a C# test project beside it. |

Lockstep is a decision, not an accident: design D13 in
[`docs/design/2026-09-06-desktop-apps-design.md`](docs/design/2026-09-06-desktop-apps-design.md)
§8.3, and Accessories follows it unchanged
([`docs/design/2026-09-24-accessories-design.md`](docs/design/2026-09-24-accessories-design.md)).
All three publish on **every** release, changed or not — a gap in an add-on's version history
reads like a broken pipeline, where a version with no changes reads like Umbraco.

**Every add-on requires this release of the host, or any later 17.** Each add-on references the
host as a `ProjectReference`, never a `PackageReference`: it is then compiled against the host from
the same commit, and its packed dependency is `[<this release>, 17.99999999.0]`. The floor is the
release itself because an add-on registers things only this release's host understands (package
catalogues; for Accessories also the unsaved-work attribute and the settings context's
`formatDateTime`). The add-ons used to take the host by package range, floored at 17.0.0, which
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
dependency is exactly `[<host package version>, 17.99999999.0]`. The floor comes from the host
project's own MinVer version, the same number as the add-on's because both are versioned off one
tag. **Raise the ceiling with the major**: the release that moves to Umbraco 18 changes
`UmbraDesktopUmbracoMajorCeiling` to `18.99999999`, which moves the Umbraco ranges' and the add-ons'
ceilings together.

`Umbraco.Community.UmbraDesktop.TestInstance` and `.Tests` are never published.

## Versioning

MinVer, from `v*` tags on this repository. `MinVerAutoIncrement=minor`,
`MinVerMinimumMajorMinor=17.0`, and all three settings are **repeated verbatim in every csproj
file** — there is no shared props file to inherit them from, and dropping `MinVerTagPrefix` from
an add-on makes MinVer ignore every `v`-prefixed tag and version it `17.0.0-alpha.0` while the host
says `17.0.0`.

**The package major tracks the Umbraco major**, so the first release was `v17.0.0`, not `v1.0.0`.
A release supporting Umbraco 18 starts at `v18.0.0`.

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
  | `launcher.png` | The whole launcher: the Pinned row, every group, the commercial packages, and the add-ons' Games and Accessories groups. Retake when a group is added or the launcher's layout changes; the caption names the Games group, so it must be in the frame. |
  | `theme-macos.png`, `theme-win98.png` | Two of the five themes, deliberately not all five. A theme shot sells the idea that the chrome restyles; the Description naming all five does the rest, and five near-identical launchers would pad the listing without adding to it. `theme-win98.png` shows an older launcher and is kept as it is: it is there to show the theme, and the content behind it is not the subject. |
  | `choose-background.png` | Desktop settings with the wallpaper tray open. The one shot that proves any of this is *yours to change*: without it a reader can take the two theme shots for two screenshots of a product rather than a switch they flip, and the Media library button is the only place that capability appears in the gallery at all. Also the only shot that evidences the README's count of shipped backgrounds, since the tray names them all plus None. The theme row is clipped by the tray, so neither the caption nor the alt text claims all five are visible. **Retake when the tile count changes** — it was shot at eight and the package ships ten since Cobalt Beacon and First Light. The README's alt text deliberately names no number, so a stale shot never contradicts the prose, but it is still the shot that has to show them all. |
  | `theme-wallpaper-match.png` | The theme picker with **Match the wallpaper to the theme** on, every preview carrying its own background. The one frame that explains the feature without a caption: Windows 98's bare teal sitting beside macOS's sunrise says what "each theme brings its own wallpaper" means faster than the sentence does. Take it with the toggle **on** — off, the five previews are identical backgrounds and the shot shows nothing. |
  | `background-jobs-viewer.png` | The Distributed table only. The Recurring one is below the fold and the view does not fit a screen at any framing worth having, so the caption does not claim the split and the explanation at the top of the shot carries the point. |
  | `entertainment-games-minesweeper.png` | In the add-on's `docs/screenshots/`. The add-on's opening image, so its NuGet page too. The alt text names every game in the Games group, so retake it when a game is added, with the group scrolled fully into view. The copy left in the host's `docs/screenshots/` is the shipped one and stays. |
  | `entertainment-games-solitaire.png` | In the add-on's `docs/screenshots/`. A game in progress with the settings button visible, in the add-on README and listing. |
  | `entertainment-games-snake.png` | In the add-on's `docs/screenshots/`, listing only. Framed to match Minesweeper's: Windows 98, the Games group open in the launcher. Take it **before** the first key press, so the start message is showing in the middle of the board and the snake is sitting a quarter of the way down above it, since that is the one moment the board says how to play. |
  | `header-entry-point.png` | Small and annotated on purpose. It answers one question, "where is the way in", and showing more screen would not answer it better. |

  **Accessories has one shot**, `accessories-desktop.png` in its own `docs/screenshots/`: a few of
  its tools open side by side under Windows 98. It is the add-on's opening image and its only
  listing entry.

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
  dependency.
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
Accessories references `Umbraco.Cms.Api.Management` and `Umbraco.Cms.Api.Common` directly, for its
Sticky Notes API, so it meets the rule either way.

Note *stable*, not *first publish*: the Marketplace appears to track only stable versions, so a
package whose only published version is a prerelease has nothing for it to list. `17.1.0-rc.1`
therefore proves nothing about the add-on's listing, and force-syncing it at that point is wasted.
The same refresh on the host settles it either way: if `latestVersionNumber` moves to a `-rc`
version, prereleases are indexed after all.

New tagged packages are picked up in the daily 04:00 UTC scan; known packages refresh every two
hours. A single package can be forced with a `POST` to
`https://functions.marketplace.umbraco.com/api/InitiateSinglePackageSyncFunction`, throttled to one
request a minute per package ID.

## Scope notes

- The Entertainment design (§8.2) planned **Minesweeper and Solitaire** for its first release.
  Solitaire was descoped then and shipped in 17.3.0 (#116), with Snake added in between.
- A Linux theme is deliberately not built. See `CLAUDE.md`.
