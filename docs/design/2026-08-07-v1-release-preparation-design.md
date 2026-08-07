# v1.0 Release Preparation — Design

> Turn the working UmbraDesktop package into a publishable v1.0: real documentation, a real
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
| Umbraco range | `[17.0.0,18.0.0)` | Widest honest v17 range (see risk R1) |
| Ownership files | `CODEOWNERS` only | No `CONTRIBUTING.md`, no `CONTRIBUTORS.md` |
| `RELEASE.md` | Not included | — |
| `umbraco-marketplace.json` | Included | Required for the Marketplace listing |
| CI tests | `npm test` only | No C# test project exists; a vacuous `dotnet test` is worse than none |
| Icon | Supplied by the repo owner | House style is a rendered 3D look that cannot be hand-authored here |
| Screenshots | Captured by the repo owner | — |
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

---

## 4. Package metadata — `Umbraco.Community.UmbraDesktop.csproj`

### 4.1 Add

```xml
<Copyright>Copyright (c) Luuk Peters</Copyright>
<PackageLicenseExpression>MIT</PackageLicenseExpression>
<RepositoryType>git</RepositoryType>
<RepositoryUrl>https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop</RepositoryUrl>
<PackageProjectUrl>https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop</PackageProjectUrl>

<!-- Versioning: MinVer derives the version from git tags (e.g. v1.0.0) -->
<MinVerTagPrefix>v</MinVerTagPrefix>
<MinVerAutoIncrement>minor</MinVerAutoIncrement>
<MinVerMinimumMajorMinor>1.0</MinVerMinimumMajorMinor>

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
| `PackageIcon` | `Package-image_128_128.png` | `package_logo_128x128.png` | Reference convention; the old file is the stock Umbraco placeholder and gets deleted. |
| `PackageReadmeFile` | `readme.md` (package-level) | `README.md` via `<None Include="..\..\README.md" Pack="true" PackagePath="\" />` | One readme, one source of truth — the root one, which is also what GitHub renders. |

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
resolves to **17.5.3**, so a v1.0 published as-is would declare `>= 17.5.3` — refusing to install
on Umbraco 17.0–17.4 while simultaneously claiming to support 18, 19 and beyond.

Add `PackageVersion` entries for `MinVer` and `Microsoft.SourceLink.GitHub`.

The test-instance entries (`Umbraco.Cms`, `uSync`) are not published and may keep floating.

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

`prerelease` keys off a hyphen in the tag, so `v1.0.0-beta.1` publishes as a prerelease
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

Structure mirrors the reference: logo image → `# UmbraDesktop` → one-line tagline → NuGet /
downloads / licence badges → sections:

- **Features** — side-by-side windows; the grouped launcher with pinnable favourites; taskbar;
  per-app window chrome; native backoffice styling.
- **How It Works** — each window is a same-origin `<iframe>` deep-linked into the backoffice, so
  it gets its own `window`, `location`, History and event bus. That is what makes independent
  navigation per window possible without touching Umbraco core. Cover the three chrome profiles
  (`full-section`, `workspace-only`, `bare`) and cross-window freshness via Umbraco's own
  observers/server-events rather than a custom sync layer.
- **Installation** — `dotnet add package Umbraco.Community.UmbraDesktop`.
- **Prerequisites** — Umbraco **17**, **.NET 10**.
- **Documentation** — link `docs/design/umbradesktop-design.md`.
- **License** — MIT, link `LICENSE`.

Source material: `docs/design/umbradesktop-design.md` §§1–5 and
`docs/design/2026-07-23-header-app-launcher-design.md`.

### 7.2 `umbraco-marketplace.json` (repo root)

Schema `https://marketplace.umbraco.com/umbraco-marketplace-schema.json`. `Title` *UmbraDesktop*,
`Category` **Editor Tools**, `AlternateCategory` **Developer Tools**, `PackageType` *Package*,
`LicenseTypes` `["Free"]`, `AuthorDetails` for Luuk Peters with
`SyncContributorsFromRepository: true`, `DocumentationUrl` and `IssueTrackerUrl` pointing at the
repo, tags, and the screenshot array below.

### 7.3 Screenshots — `docs/screenshots/`

Captured by the repo owner. Hot-linked from both README and Marketplace listing via
`raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/…`,
which **404s until the repo is public**.

| Filename | Shot |
|---|---|
| `desktop_windows.jpg` | Two app windows open side by side on the navy wallpaper |
| `launcher.jpg` | The launcher: pinned favourites plus grouped tiles |
| `taskbar.jpg` | Taskbar with several running apps |
| `header_app_launcher.jpg` | The gated header-app entry point in the backoffice header |

A `.gitkeep` lands first so the directory exists and the README/Marketplace wiring can be
committed and reviewed while the images are still being captured. The real images must be in
place before the merge to `main` in §10 step 1 — the `.gitkeep` is an intermediate state within
that step, not a shippable one.

---

## 8. Icon

The repo owner supplies `src/Umbraco.Community.UmbraDesktop/package_logo_128x128.png` in the
established house style (glossy 3D isometric object, orange→red gradient, small domain badge
bottom-right, white ground — matching `Umbraco.Community.AdvancedPermissions`).

Wiring: `PackageIcon` in the csproj, the README header image, and deletion of the stock
`Package-image_128_128.png`.

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

1. Land **every file** from §§3–8 on `feature/release_preparation` (including the real icon,
   README and screenshots) and merge to `main`.
2. **Make the repo public.**
3. Apply repo settings + branch protection ruleset (§9).
4. Complete the nuget.org and environment/secret setup (§6.3).
5. Tag **`v1.0.0-beta.1`** — proves trusted publishing, MinVer stamping, the GitHub release and
   the Marketplace tag on a throwaway prerelease.
6. Verify: package installs into the TestInstance, nupkg contents correct, dependency ranges
   correct, `umbraco-package.json` version stamped, Marketplace listing renders.
7. Tag **`v1.0.0`**.

---

## 11. Out of scope

- Any feature, refactoring or UI work.
- A C# test project.
- `CONTRIBUTING.md`, `CONTRIBUTORS.md`, `RELEASE.md`, `CHANGELOG.md`.
- In-app help docs (the reference has them; UmbraDesktop does not, and adding them is a feature).
- Localisation beyond the existing en/nl.

---

## 12. Risks and open items

**R1 — The `[17.0.0,18.0.0)` floor claims untested support.** Development and testing have only
ever run against **17.5.3**. Declaring a 17.0.0 floor asserts compatibility that has not been
exercised, and a backoffice API introduced in, say, 17.3 would install cleanly on 17.0 and then
fail at runtime.
*Mitigation:* audit the `@umbraco-cms/backoffice` imports across `backoffice/src/` against the
17.0 surface. If anything post-dates 17.0, raise the floor to the earliest version that actually
supports it rather than shipping a false claim.

**R2 — `"@umbraco-cms/backoffice": "^*"` in `package.json`.** This spec can resolve to v18 types
on a fresh `npm install`, breaking a build against v17 APIs. CI is insulated because `npm ci`
uses the lockfile. Flagged, not fixed — pinning to `^17` is a one-line change pending the owner's
call.

**R3 — Screenshot URLs 404 while private.** README and Marketplace images resolve only once the
repo is public. Expected during steps 1–2 of §10; verify after step 2.

**R4 — `TreatWarningsAsErrors` plus `GenerateDocumentationFile`.** Any public member missing an
XML doc comment fails the Release build as CS1591. CI will surface this on first run; if it
fires, add the missing docs (consistent with the repo's documentation standard) rather than
relaxing the setting.
