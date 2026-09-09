# Releasing UmbraDesktop

Repo-specific facts a generic checklist cannot know. Read this first, then work the
`nuget-pre-release` checklist against it.

## What ships

Two packages, from **one tag**, always at the **same version**:

| Package | What it is |
|---|---|
| `Umbraco.Community.UmbraDesktop` | The desktop. The product. |
| `Umbraco.Community.UmbraDesktop.Entertainment` | Optional games add-on. Minesweeper today. |

Lockstep is a decision, not an accident: design D13 in
[`docs/design/2026-09-06-desktop-apps-design.md`](docs/design/2026-09-06-desktop-apps-design.md)
§8.3. Both publish on **every** release, changed or not — a gap in Entertainment's version history
reads like a broken pipeline, where a version with no changes reads like Umbraco. The one place
lockstep must not leak is the dependency: Entertainment depends on the host by **range**
(`[17.0.0,18.0.0)` in `src/Directory.Packages.props`), never as a `ProjectReference`, or every host
release forces an Entertainment release and breaks anyone who upgraded the host in between.

`Umbraco.Community.UmbraDesktop.TestInstance` and `.Tests` are never published.

## Versioning

MinVer, from `v*` tags on this repository. `MinVerAutoIncrement=minor`,
`MinVerMinimumMajorMinor=17.0`, and all three settings are **repeated verbatim in both csproj
files** — there is no shared props file to inherit them from, and dropping `MinVerTagPrefix` from
the add-on makes MinVer ignore every `v`-prefixed tag and version it `17.0.0-alpha.0` while the host
says `17.0.0`.

**The package major tracks the Umbraco major**, so the first release was `v17.0.0`, not `v1.0.0`.
A release supporting Umbraco 18 starts at `v18.0.0`.

## Cutting a release

1. Everything merged to `main`. `main` is the trunk; check `origin/main`, not your local copy.
2. Update the README, `umbraco-marketplace*.json` and `docs/` first — see the Definition of done in
   [`CLAUDE.md`](CLAUDE.md). The Marketplace description is the only thing most people read.
3. Tag `main`: `git tag v17.1.0 && git push origin v17.1.0`.
4. `.github/workflows/publish.yml` does the rest: both frontends, both test suites, the C# tests,
   both packs, a payload check, NuGet trusted publishing, and a GitHub release.

### Release notes

`generate_release_notes: true` diffs against the **previous tag**. If you cut a beta first, the
stable release's notes cover only what happened after the beta and omit the entire feature line.
Hand-curate the body of any stable release that had a prerelease before it.

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
  thing. They live in `docs/screenshots/`, and both the README and the marketplace files reference
  them by `raw.githubusercontent.com/.../main/...` URL, so they resolve only once the commit is on
  `main`. Nothing validates those URLs: a filename typo silently 404s on the live Marketplace, and
  a broken image is worse than a missing one, so an entry is added only after the file exists.

  Settled 2026-09-09. Eight shots, and the set is considered complete:

  | Shot | Notes |
  |---|---|
  | `desktop-windows.png` | Two windows side by side. The opening image. |
  | `unsaved-changes-guard.png` | Carries the whole guard story in one frame: the unsaved dot, the "someone else changed this" warning with both buttons, and the recycle-bin error, in three stacked windows with all three markers repeated on the taskbar. A separate overwrite-guard shot was planned and is not needed because this one covers it. Note the file arrived named `unsved-`, which would have 404ed silently on the Marketplace; check new filenames against the `ImageUrl` by eye, since nothing else will. |
  | `launcher.png` | All twelve groups, Background Jobs under Diagnostics, the commercial packages and the Games group. |
  | `theme-macos.png`, `theme-win98.png` | Two of the five themes, deliberately not all five. A theme shot sells the idea that the chrome restyles; the Description naming all five does the rest, and five near-identical launchers would pad the listing without adding to it. `theme-win98.png` shows an older launcher and is kept as it is: it is there to show the theme, and the content behind it is not the subject. |
  | `choose-background.png` | Desktop settings with the wallpaper tray open. The one shot that proves any of this is *yours to change*: without it a reader can take the two theme shots for two screenshots of a product rather than a switch they flip, and the Media library button is the only place that capability appears in the gallery at all. Also the only shot that evidences the "eight backgrounds" claim, since the tray names all eight plus None. The theme row is clipped by the tray, so neither the caption nor the alt text claims all five are visible. |
  | `background-jobs-viewer.png` | The Distributed table only. The Recurring one is below the fold and the view does not fit a screen at any framing worth having, so the caption does not claim the split and the explanation at the top of the shot carries the point. |
  | `entertainment-games-minesweeper.png` | The add-on's only shot, also used in both readmes. |
  | `header-entry-point.png` | Small and annotated on purpose. It answers one question, "where is the way in", and showing more screen would not answer it better. |

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
- `umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json` — the add-on.

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
has not been observed for this package yet, so **check the Entertainment listing appears and shows
v17 after its first stable release**. If it does not, a direct `Umbraco.Cms.Core` reference is the
fix.

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

- The Entertainment design (§8.2) plans **Minesweeper and Solitaire** for its first release.
  Solitaire was descoped — issue #8 was closed with Minesweeper only. Its first decision, before
  any code, is how card faces are rendered (inline SVG, sprite sheet, or Unicode), because that
  settles the whole rendering approach and whether cards participate in theming at all.
- A Linux theme is deliberately not built. See `CLAUDE.md`.
