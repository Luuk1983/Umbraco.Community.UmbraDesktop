# First Release Preparation — Design

> Turn the working UmbraDesktop package into a publishable first release (`v17.0.0`): real documentation, a real
> licence, tag-driven versioning, CI, NuGet trusted publishing, an Umbraco Marketplace listing,
> and a protected `main`.

- **Status:** Approved design / pre-implementation
- **Date:** 2026-08-07
- **Branch:** `feature/release_preparation`
- **Modelled on:** [`Umbraco.Community.AdvancedPermissions`](https://github.com/Luuk1983/Umbraco.Community.AdvancedPermissions)

---

## 1. Scope

**Release plumbing only.** The product is feature-complete on `origin/main`: the curated app
catalogue (`catalogue/content.ts`, `development.ts`, `diagnostics.ts`, `system.ts`,
`users-members.ts`, `groups.ts`, `exclusions.ts`), the launcher with pinned favourites, the
window manager, chrome injection, and the gated header-app entry point with the hidden section
tab. Six web-test-runner suites cover the pure logic.

No feature work, no refactoring. Everything below is packaging, documentation and repository
configuration.

### 1.1 Baseline correction (prerequisite)

`feature/release_preparation` was branched from a **stale local `main`** at `2ff2aae`, which is
63 commits behind. The remote is correct — `origin/main` is at `833b03f`, identical to
`origin/feature/phase-2-desktop-app-model`.

Because `feature/release_preparation` has **zero unique commits**, re-pointing it loses nothing,
and `2ff2aae` remains reachable from `origin/main`'s history:

```bash
git branch -f main origin/main
git reset --hard origin/main
```

The untracked `wwwroot/App_Plugins/` output is stale afterwards (built from the old code), so
re-run `npm run build`. Once done, `feature/phase-2-desktop-app-model` is fully merged into
`main` and can be deleted.

**No release work may be committed before this correction**, or the branch diverges from the
real code.

---

## 2. Settled decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Plumbing only | Product complete on `origin/main` |
| Versioning | MinVer from `v*` git tags | Matches the reference; tag *is* the release |
| Version scheme | Package major **tracks the Umbraco major**: first release is `v17.0.0`, first beta `v17.0.0-beta.1`, `MinVerMinimumMajorMinor=17.0` | House convention — both `AdvancedPermissions` (shipping 18.x for Umbraco 18) and `AdvancedPermissions.AI` (floor 17.0) do this. Consumers read compatibility off the major. Supersedes the earlier `v1.0.0` plan; the owner sets tags manually, so the scheme is a labelling convention rather than a build constraint |
| Umbraco range | `[17.0.0,18.0.0)` | Widest honest v17 range (see risk R1) |
| Ownership files | `CODEOWNERS` only | No `CONTRIBUTING.md`, no `CONTRIBUTORS.md` |
| `RELEASE.md` | Not included | — |
| `umbraco-marketplace.json` | Included | Required for the Marketplace listing |
| CI tests | `npm test` only | No C# test project exists; a vacuous `dotnet test` is worse than none |
| Icon | Supplied by the repo owner — **done** | House style is a rendered 3D look that cannot be hand-authored here |
| Screenshots | Deferred until after the repo is public | Don't block the pipeline test on artwork (§7.3) |
| Backoffice types | Pin `^*` → `^17` | Prevents a fresh `npm install` resolving v18 types |
| Repo visibility | Private until all files land, then public | Branch protection and raw image URLs both need public (or Pro) |

---

## 3. Repository hygiene files

| File | Action | Detail |
|---|---|---|
| `LICENSE.txt` → `LICENSE` | Rename **and fill** | Currently ships the unfilled MIT template: literal `Copyright (c) [year] [fullname]`. Becomes `Copyright (c) 2026 Luuk Peters`. |
| `.github/CODEOWNERS` | Create | `* @Luuk1983`, with the reference's explanatory header. |
| `.editorconfig` | Create | Port the reference's: utf-8, LF, final newline, trim trailing whitespace; 4-space `cs`; 2-space `csproj/props/targets/xml`, `ts/js/json/html/css`, `yml`; markdown preserves trailing whitespace. |
| `.gitattributes` | Create | `* text=auto`, without the reference's commented-out VS boilerplate. |
| `Solution files/.github/copilot-instructions.md` | Delete | A physical duplicate of `.github/copilot-instructions.md`. The `.slnx` solution folder already links the real file. |
| `readme.md` → `README.md` | Rename | Convention, and matches the reference. Windows' case-insensitive filesystem needs `git mv readme.md README.tmp && git mv README.tmp README.md`. |
| `src/Umbraco.Community.UmbraDesktop/readme.md` | Delete | Superseded by the root README (see §4). Currently `== TO DO ==`. |

### 3.1 Empty-localization cleanup

Two localization mechanisms are live at once, and one of them is dead:

- `backoffice/public/localization/en.js` and `nl.js` are **empty scaffold leftovers** —
  `export default {};` — yet `umbraco-package.json` still registers them as extensions
  `Umbraco.Community.UmbraDesktop.Localize.En` / `.Nl`.
- `backoffice/src/desktop/localization/en.ts` and `nl.ts` hold the **real** strings
  (`umbraDesktop.*`: app friendly names, group labels, launcher chrome), registered through the
  bundle as `UmbraDesktop.Localization.En` / `.Nl`.

The aliases differ, so nothing collides, and Umbraco merges dictionaries by area/key — this is
dead weight rather than a bug. But shipping a manifest that advertises two localization
extensions containing nothing is not something a first release should do.

**Action:** delete `backoffice/public/localization/` and remove the two `Localize.En`/`Localize.Nl`
entries from `backoffice/public/umbraco-package.json`. The `bundle` entry and the real
`desktop/localization/` dictionaries are untouched.

**Verification:** after the change, `npm run build` must still emit the `en-*.js`/`nl-*.js`
localization chunks (they come from the bundled TS, not `public/`), and the launcher must still
render localized app and group names rather than raw `umbraDesktop.*` keys.

This is the one item that reaches past pure plumbing into the shipped manifest; included
deliberately as release hygiene.

---

## 4. Package metadata — `Umbraco.Community.UmbraDesktop.csproj`

### 4.0 Critical: the package currently ships no frontend

Discovered while planning, on 2026-08-09. `dotnet pack` produces a **13-file package containing
no frontend at all** — no `staticwebassets/`, no `App_Plugins/`. It ships `package-lock.json`
(324KB of a 361KB package), `package.json` and `backoffice/tsconfig.json` in their place.
Installing it would appear to succeed and do nothing whatsoever.

Cause — these two lines strip the built output before the Razor SDK can discover it:

```xml
<Content Remove="wwwroot\App_Plugins\Umbraco.Community.UmbraDesktop\**" />
<None Remove="wwwroot\App_Plugins\Umbraco.Community.UmbraDesktop\**" />
```

Evidence: `obj/Release/net10.0/staticwebassets.build.json` contains **zero** `App_Plugins`
entries, and no `staticwebassets.pack.json` is generated at all.

**Fix (verified during planning):** drop the two `wwwroot\App_Plugins\…` removals, and add
explicit removals for the development-only files that `ContentTargetFolders=.` was packing to the
package root:

```xml
<Content Remove="backoffice\**" />
<Content Remove="package.json" />
<Content Remove="package-lock.json" />
```

Result, confirmed by packing: **33 files**, including 19 assets under
`staticwebassets/App_Plugins/Umbraco.Community.UmbraDesktop/` and none of the dev files.

This supersedes the assumption running through the rest of this document that packaging merely
needed metadata. It is the single highest-priority item in the release, and every other
verification depends on it.

### 4.1 Add

```xml
<Copyright>Copyright (c) Luuk Peters</Copyright>
<PackageLicenseExpression>MIT</PackageLicenseExpression>
<RepositoryType>git</RepositoryType>
<RepositoryUrl>https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop</RepositoryUrl>
<PackageProjectUrl>https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop</PackageProjectUrl>

<!-- Versioning: MinVer derives the version from git tags (e.g. v17.0.0) -->
<MinVerTagPrefix>v</MinVerTagPrefix>
<MinVerAutoIncrement>minor</MinVerAutoIncrement>
<MinVerMinimumMajorMinor>17.0</MinVerMinimumMajorMinor>

<!-- Symbols + SourceLink: consumers can debug into the source at the exact built commit -->
<IncludeSymbols>true</IncludeSymbols>
<SymbolPackageFormat>snupkg</SymbolPackageFormat>
<PublishRepositoryUrl>true</PublishRepositoryUrl>
<EmbedUntrackedSources>true</EmbedUntrackedSources>
<DeterministicSourcePaths Condition="'$(GITHUB_ACTIONS)' == 'true'">true</DeterministicSourcePaths>
```

Plus `PackageReference`s for `MinVer` and `Microsoft.SourceLink.GitHub`, both `PrivateAssets="all"`.

### 4.2 Change

| Property | From | To | Why |
|---|---|---|---|
| `Title` | `Umbraco.Community.UmbraDesktop` | `UmbraDesktop` | This is the human-facing name on NuGet, not the package ID. |
| `Description` | One line | Expanded (see §4.3) | It's the NuGet listing copy. |
| `PackageTags` | `umbraco package backoffice desktop windows` | `umbraco;backoffice;desktop;windows;multitasking;productivity;umbraco-marketplace` | Semicolon-delimited, and **`umbraco-marketplace` is mandatory** or the Marketplace never indexes the package. |
| `PackageReadmeFile` | `readme.md` (package-level) | `README.md` via `<None Include="..\..\README.md" Pack="true" PackagePath="\" />` | One readme, one source of truth — the root one, which is also what GitHub renders. |

`PackageIcon` stays as `Package-image_128_128.png` — see §8.

### 4.3 Remove

- **`<VersionPrefix>1.0.0</VersionPrefix>`** — MinVer owns the version now. Leaving it would let
  the csproj version silently disagree with the git tag.
- **`<GeneratePackageOnBuild>True</GeneratePackageOnBuild>`** — with an explicit `dotnet pack`
  step in CI this packs twice, and it litters dev machines with nupkgs on every build.

### 4.4 Replace the version-sync target

The current `UpdateUmbracoPackageJsonVersion` target uses `JsonPathUpdateValue` against
`$(VersionPrefix)`, which disappears with MinVer. Replace it with the reference's approach: a
`SetJsonVersion` inline task (`RoslynCodeTaskFactory`) that regex-replaces `"version": "..."`,
hooked `AfterTargets="MinVer"` with `Condition="'$(MinVerVersion)' != ''"`.

The source placeholder in `backoffice/public/umbraco-package.json` is `"GetsGenerated"`, which
the regex `"version":\s*"[^"]*"` matches. It stays as-is — vite copies it to
`wwwroot/App_Plugins/…` and the MSBuild target stamps the real version there.

**Ordering:** `npm run build` must run before `dotnet build`, or the target finds no file to
stamp.

### 4.5 Proposed description

> An OS-style windowed desktop for the Umbraco backoffice. Launch content, media, settings and
> other sections as real draggable, resizable windows and work in several of them side by side —
> edit on the left while you watch the result on the right. Includes a grouped app launcher with
> pinnable favourites, a taskbar, and per-app window chrome, all styled to match the backoffice.

---

## 5. Dependency floors — `src/Directory.Packages.props`

`Umbraco.Cms.Api.Common` and `Umbraco.Cms.Core` move from `17.*` to `[17.0.0,18.0.0)`.

**Why this matters.** A floating `17.*` is resolved at restore time and NuGet stamps the
*resolved* version into the published nuspec as the minimum, with **no upper bound**. Today that
resolves to **17.5.3**, so a first release published as-is would declare `>= 17.5.3` — refusing to install
on Umbraco 17.0–17.4 while simultaneously claiming to support 18, 19 and beyond.

Add `PackageVersion` entries for `MinVer` and `Microsoft.SourceLink.GitHub`.

The test-instance entries (`Umbraco.Cms`, `uSync`) are not published and may keep floating.

**Decision on the 17.0.0 floor:** confirmed by the owner on the grounds that Umbraco does not
ship breaking changes within a major, so a v17-wide range is a fair claim even though testing
has only been done on 17.5.3. No import audit is required. See R1.

### 5.1 Pin the backoffice types

`package.json` currently declares `"@umbraco-cms/backoffice": "^*"`. Change to `"^17"`.

`^*` can resolve to v18 types on a fresh `npm install`, silently type-checking the code against
the wrong backoffice major. CI is insulated (`npm ci` uses the lockfile), but a contributor
running `npm install` is not. Regenerate `package-lock.json` with the pin and confirm the
resolved version stays within 17.

---

## 6. CI/CD workflows

Both workflows must build the frontend **before** `dotnet build`/`pack`:
`wwwroot/App_Plugins/` is gitignored (`.gitignore:365`), so a clean checkout otherwise packs an
empty plugin folder — producing a package that installs successfully and silently does nothing.

Both use `fetch-depth: 0`, which MinVer needs to see tags.

### 6.1 `.github/workflows/ci.yml`

Trigger: `pull_request` to `main`. Steps: checkout → .NET 10 → Node 22 → `dotnet restore` →
`npm ci` → **`npm test`** → `npm run build` → `dotnet build -c Release --no-restore` →
`dotnet pack -c Release -o ./artifacts` → upload nupkg artifact (7-day retention).

No `dotnet test` step — there is no C# test project, and a step that matches zero projects
reports green while testing nothing.

npm commands run in `src/Umbraco.Community.UmbraDesktop` (where `package.json` lives; its own
scripts `cd backoffice` internally).

### 6.2 `.github/workflows/publish.yml`

Trigger: `push` tags `v*.*.*`. `permissions: id-token: write` (trusted publishing) and
`contents: write` (GitHub release). `environment: production`.

Same build sequence, then:

```yaml
- name: Login to NuGet (trusted publishing)
  id: nuget-login
  uses: NuGet/login@v1
  with:
    user: ${{ secrets.NUGET_USER }}

- name: Push to NuGet
  run: dotnet nuget push ./artifacts/*.nupkg --api-key ${{ steps.nuget-login.outputs.NUGET_API_KEY }} --source https://api.nuget.org/v3/index.json

- name: Create GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    files: ./artifacts/*.nupkg
    generate_release_notes: true
    prerelease: ${{ contains(github.ref_name, '-') }}
```

`prerelease` keys off a hyphen in the tag, so `v17.0.0-beta.1` publishes as a prerelease
automatically. The `.snupkg` is pushed alongside the `.nupkg` by `dotnet nuget push`.

### 6.3 Manual steps (owner-only; documented, not automated)

1. Create the **`production`** environment in repo settings.
2. Add the **`NUGET_USER`** secret (nuget.org username).
3. Create the **trusted publishing policy on nuget.org** — Account → Trusted Publishing → new
   policy bound to owner `Luuk1983`, repo `Umbraco.Community.UmbraDesktop`, workflow
   `publish.yml`, environment `production`.

   **`Umbraco.Community.UmbraDesktop` does not yet exist on nuget.org**, so there is no package
   to attach a policy to — it must be created in advance using the package-ID-pattern form.
   (`Umbraco.Community.AdvancedPermissions` published successfully on 2026-08-06, confirming the
   `Umbraco.Community.*` prefix is not reserved against this account.)

---

## 7. Documentation

### 7.1 `README.md` (root — also packed into the nupkg)

**Tone: not too technical.** The first two thirds must sell the package and get someone running;
implementation detail is quarantined in the final section. Header: logo image →
`# UmbraDesktop` → one-line tagline → NuGet / downloads / licence badges.

Section order (owner's outline, with install and use swapped — a reader sold by Features wants
to install next, and "how to use it" only makes sense once it's installed):

1. **Introduction** — short. The backoffice shows one section at a time; UmbraDesktop turns it
   into a desktop where tools open as real windows you can put side by side.

2. **Features** — the "why would I want this" section. Side-by-side windows (edit on the left,
   watch the result on the right); drag, resize, minimise, maximise; a grouped launcher with
   pinnable favourites; a taskbar for open windows; styled to match the backoffice rather than
   bolted on.

3. **Installation & configuration**
   - Prerequisites: Umbraco **17**, **.NET 10**.
   - `dotnet add package Umbraco.Community.UmbraDesktop`.
   - **Grant the Desktop section to a user group** — the one required configuration step.
     Nothing appears until this is done. That single grant both makes the desktop reachable and
     reveals the launcher, because the header app is gated on the section-user-permission
     condition for the Desktop section alias (`headerapps/manifest.ts`).
   - **Which apps a user sees follows their existing section permissions** — every app is gated
     on its source section (`deriveApps`), so the desktop grants no access the user didn't
     already have.

4. **How to use it** — short. The launcher lives in the backoffice header, top-right (between
   Help and the user avatar); the Desktop section's own nav tab is deliberately hidden, so the
   header launcher is the way in. Open apps, arrange windows, pin favourites, use the taskbar,
   exit back to the classic backoffice.

5. **Technical explanation** — the only genuinely technical section:
   - **Windows are iframes.** Each window deep-links into the backoffice same-origin, so it gets
     its own `window`, `location`, History and event bus — which is what makes independent
     per-window navigation possible without touching Umbraco core. Cross-window freshness comes
     from Umbraco's own observers/server-events, not a custom sync layer.
   - **The three chrome profiles** (`desktop/types.ts`), framed as the owner put it — an app can
     appear as-is, with the sidebar removed, or stripped right back:
     `full-section` (hides only the top header, keeps the section sidebar/tree) ·
     `workspace-only` (also strips the sidebar) · `bare` (also strips the dashboard tab strip).
   - **The curated catalogue** — `desktop/catalogue/*.ts` entries point at a registered extension
     by `ref` (URL inferred from the registry) or an explicit `url`, and carry presentation:
     name, icon, group, chrome profile, default/min size, `allowMultiple`, weight.
   - **Unregistered apps** — any section the user may access that no catalogue entry covers is
     auto-derived as an *uncertified* fallback app: `full-section` chrome, the generic `icon-box`
     icon, placed in the reserved **More** group. Sections in `catalogue/exclusions.ts` (seeded
     with UmbraDesktop's own) never appear.
   - **Custom / third-party apps** — see §7.1.1; must be written honestly.

6. **Documentation** — link `docs/design/umbradesktop-design.md`.

7. **License** — MIT, link `LICENSE`.

Source material: `docs/design/umbradesktop-design.md` §§1–5,
`docs/design/2026-07-23-header-app-launcher-design.md`, and the code cited above.

#### 7.1.1 The third-party-apps section must not overpromise

The owner's outline asks the README to "explain how to add support for custom apps / external
Umbraco packages". **There is no public extension point in v1.** The catalogue is compiled-in
TypeScript (`catalogue/index.ts` collates static fragments) and there is no `desktopApp`
extension type — `app-catalogue.context.ts` only reads `section` manifests out of the registry.
This is the deliberate outcome of the Phase-2 app-model pivot (curated catalogue over a manifest
type), not an oversight.

So the section states the two real paths:

- **Automatic (no work).** A package that registers a section shows up in the launcher's **More**
  group for users permitted to that section — with default chrome and a generic icon.
- **Curated (needs a PR).** Custom icon, friendly name, group placement, chrome profile or window
  sizing requires an entry in `desktop/catalogue/*.ts` — an upstream contribution to
  UmbraDesktop, not something a third-party package can register at runtime.

**No forward-looking statement.** Do not mention a possible future extension point, roadmap item
or "planned" runtime registration. The section describes only what exists today. (Owner's call:
avoids setting an expectation that may never be met.)

### 7.2 `umbraco-marketplace.json` (repo root)

Schema `https://marketplace.umbraco.com/umbraco-marketplace-schema.json`. `Title` *UmbraDesktop*,
`Category` **Editor Tools**, `AlternateCategory` **Developer Tools**, `PackageType` *Package*,
`LicenseTypes` `["Free"]`, `AuthorDetails` for Luuk Peters with
`SyncContributorsFromRepository: true`, `DocumentationUrl` and `IssueTrackerUrl` pointing at the
repo, tags, and the screenshot array below.

### 7.3 Screenshots — `docs/screenshots/` (deferred)

**The images do not exist yet and do not gate the release-prep work or going public.** The repo
goes public without them so the Actions and versioning pipeline can be tested; the owner uploads
them afterwards.

The directory is created with a `.gitkeep`, and both the README and `umbraco-marketplace.json`
carry explicit `TODO` markers rather than links to files that aren't there:

- **README** — a visible `> **TODO:** screenshots pending.` blockquote where the gallery goes.
  No broken `![]()` image tags: a broken image renders as an error glyph on both GitHub and
  NuGet, which looks worse than an honest note.
- **`umbraco-marketplace.json`** — ship with an **empty `Screenshots` array** plus a TODO comment
  in the design/plan, not entries pointing at non-existent files. Broken `ImageUrl`s are exactly
  the silent-breakage failure mode the reference repo's release notes warn about.

Planned shots, for when they are captured:

| Filename | Shot |
|---|---|
| `desktop_windows.jpg` | Two app windows open side by side on the navy wallpaper |
| `launcher.jpg` | The launcher: pinned favourites plus grouped tiles |
| `taskbar.jpg` | Taskbar with several running apps |
| `header_app_launcher.jpg` | The gated header-app entry point in the backoffice header |

They hot-link via
`raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/…`,
which resolves only once the repo is public — by then it will be.

**Adding the screenshots is a release blocker for `v17.0.0`, not for `v17.0.0-beta.1`.**

---

## 8. Icon — **delivered**

Done. The owner replaced `src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png` with
artwork in the established house style (glossy 3D isometric mark, blue gradient, window badge
bottom-right — the sibling of the `Umbraco.Community.AdvancedPermissions` logo). Currently an
uncommitted working-tree change.

The originally-proposed rename to `package_logo_128x128.png` is **dropped**: the filename is
invisible to consumers, and renaming a file the owner has already placed is pure churn. The
existing `PackageIcon` value in the csproj is correct as-is.

Remaining wiring: reference the same file as the README header image.

---

## 9. GitHub repository settings — after going public

1. Default branch → **`main`** (currently `feature/phase-2-desktop-app-model`).
2. Set the repo **description** and **topics** (`umbraco`, `umbraco-package`, `backoffice`,
   `desktop`).
3. Delete the merged `feature/phase-2-desktop-app-model` branch.
4. Apply a **ruleset on `main`** via `gh api`: require a pull request before merging, require the
   CI status check to pass, block force-pushes, block deletion.

Branch protection currently returns
`403 — Upgrade to GitHub Pro or make this repository public`, so step 4 is only possible once
the repo is public.

---

## 10. Release sequencing

1. Land **every file** from §§3–8 on `feature/release_preparation` — icon (done), README,
   `umbraco-marketplace.json`, licence, CODEOWNERS, workflows, csproj/deps changes — and merge to
   `main`. Screenshots are explicitly **excluded** from this step (§7.3).
2. **Make the repo public.**
3. Apply repo settings + branch protection ruleset (§9).
4. Complete the nuget.org and environment/secret setup (§6.3).
5. Tag **`v17.0.0-beta.1`** — proves trusted publishing, MinVer stamping, the GitHub release and
   the Marketplace tag on a throwaway prerelease.
6. Verify: package installs into the TestInstance, nupkg contents correct, dependency ranges
   correct, `umbraco-package.json` version stamped, Marketplace listing renders.
7. **Capture and commit the screenshots**, then replace the README TODO blockquote and populate
   the Marketplace `Screenshots` array.
8. Tag **`v17.0.0`**.

---

## 11. Out of scope

- Any feature, refactoring or UI work.
- A C# test project.
- `CONTRIBUTING.md`, `CONTRIBUTORS.md`, `RELEASE.md`, `CHANGELOG.md`.
- In-app help docs (the reference has them; UmbraDesktop does not, and adding them is a feature).
- Localisation beyond the existing en/nl.

---

## 12. Risks and open items

**R1 — `[17.0.0,18.0.0)` floor — CLOSED, accepted.** Testing has only ever run against **17.5.3**,
so a 17.0.0 floor asserts compatibility not directly exercised. The owner accepts this on the
grounds that Umbraco does not ship breaking changes within a major. No import audit will be run.
Residual exposure is small and, if a 17.0-incompatible API surfaces, the fix is a patch release
raising the floor.

**R2 — `"@umbraco-cms/backoffice": "^*"` — CLOSED, fixed.** Pinned to `^17` (§5.1).

**R3 — Screenshots deferred — CLOSED, planned.** The repo goes public without screenshots so the
pipeline can be tested; README and Marketplace listing carry TODO markers and an empty
`Screenshots` array rather than broken image links (§7.3). Adding them blocks `v17.0.0` but not
`v17.0.0-beta.1`.

**R5 — The README's third-party section is the easiest place to overpromise.** v1 has no runtime
extension point for custom apps; the catalogue is compiled-in. Wording must describe the
automatic section fallback and the upstream-PR route, and must not imply a `desktopApp` manifest
exists (§7.1.1).

**R4 — `TreatWarningsAsErrors` plus `GenerateDocumentationFile`.** Any public member missing an
XML doc comment fails the Release build as CS1591. CI will surface this on first run; if it
fires, add the missing docs (consistent with the repo's documentation standard) rather than
relaxing the setting.
