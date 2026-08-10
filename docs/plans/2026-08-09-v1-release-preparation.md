# First Release Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working UmbraDesktop package into a publishable first release (`v17.0.0`) — a package that actually contains its frontend, with real documentation, MinVer tag-driven versioning, CI, NuGet trusted publishing, an Umbraco Marketplace listing, and a protected `main`.

**Architecture:** No product code changes. This is packaging, documentation and repository configuration, modelled on [`Umbraco.Community.AdvancedPermissions`](https://github.com/Luuk1983/Umbraco.Community.AdvancedPermissions). The design is [`docs/design/2026-08-07-v1-release-preparation-design.md`](../design/2026-08-07-v1-release-preparation-design.md). One critical defect discovered during planning (the package ships no frontend) is fixed first, because every later verification depends on a correct package.

**Tech Stack:** .NET 10 / `Microsoft.NET.Sdk.Razor` RCL · MinVer · SourceLink · Vite + TypeScript + Lit · `@web/test-runner` · GitHub Actions · NuGet trusted publishing

---

## Context for the engineer

You are working on branch `feature/release_preparation`, which currently sits at `origin/main` plus four docs commits.

Three facts that drive almost every task:

1. **`wwwroot/App_Plugins/` is gitignored** (`.gitignore` — the `**/wwwroot/App_Plugins/` rule). The frontend is built by Vite into that folder. Nothing works on a clean checkout until `npm run build` has run.
2. **`npm` lives in `src/Umbraco.Community.UmbraDesktop/`**, not the repo root. Its own scripts `cd backoffice` internally, so always run npm from `src/Umbraco.Community.UmbraDesktop/`.
3. **`RestorePackagesWithLockFile` is `true`** (`src/Directory.Build.props`). Any change to package versions *requires* regenerating `src/Umbraco.Community.UmbraDesktop/packages.lock.json` or restore fails with NU1004. Regenerate with `dotnet restore --force-evaluate`.

**Always `dotnet build` before `dotnet pack`.** A bare `dotnet pack` on a cold `obj/` fails with
`error : Manifest file at 'obj\Release\net10.0\staticwebassets.build.json' not found`. Every pack
command in this plan is therefore `build` followed by `pack --no-build`, which is also what the CI
workflows do.

**Beware stale `obj/` when measuring packaging behaviour.** Static web asset discovery is cached,
so a warm `obj/` can make a broken configuration look healthy. Any before/after comparison of
packaging must `rm -rf src/Umbraco.Community.UmbraDesktop/obj src/Umbraco.Community.UmbraDesktop/bin`
first. This bit us during planning: an incremental build reported 19 static web assets for a
configuration that produces 0 from clean.

Verified working baseline (measured during planning, on 2026-08-09):

- `dotnet build -c Release` → **0 warnings, 0 errors**
- `npm test` → **6 test files, 76 tests, all pass**
- `npm run build` → clean

### The critical defect

`dotnet pack` today produces a **13-file package with no frontend whatsoever** — no `staticwebassets/`, no `App_Plugins/`. It ships `package-lock.json` (324KB of a 361KB package), `package.json` and `backoffice/tsconfig.json` instead. Installing it would appear to succeed and do absolutely nothing.

Cause: these two lines in the csproj strip the built output before the Razor SDK can discover it as a static web asset —

```xml
<Content Remove="wwwroot\App_Plugins\Umbraco.Community.UmbraDesktop\**" />
<None Remove="wwwroot\App_Plugins\Umbraco.Community.UmbraDesktop\**" />
```

Proof: `obj/Release/net10.0/staticwebassets.build.json` contains **zero** `App_Plugins` entries and no `staticwebassets.pack.json` is generated. The fix in Task 1 was verified during planning to produce a correct 33-file package with 19 static web assets.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `.github/CODEOWNERS` | Review ownership |
| `.github/workflows/ci.yml` | PR validation: test, build, pack |
| `.github/workflows/publish.yml` | Tag-triggered publish to NuGet + GitHub release |
| `.editorconfig` | Formatting rules shared by IDE and build |
| `.gitattributes` | Line-ending normalisation |
| `umbraco-marketplace.json` | Umbraco Marketplace listing |
| `docs/screenshots/.gitkeep` | Placeholder for deferred screenshots |

**Modified**

| Path | Change |
|---|---|
| `src/Umbraco.Community.UmbraDesktop/Umbraco.Community.UmbraDesktop.csproj` | Payload fix, metadata, MinVer, SourceLink, version-sync target |
| `src/Directory.Packages.props` | Dependency floors + MinVer/SourceLink versions |
| `src/Umbraco.Community.UmbraDesktop/package.json` | Pin `@umbraco-cms/backoffice` |
| `src/Umbraco.Community.UmbraDesktop/backoffice/public/umbraco-package.json` | Drop dead localization entries |
| `README.md` | Real content (renamed from `readme.md`) |

**Renamed / deleted**

| Path | Action |
|---|---|
| `LICENSE.txt` → `LICENSE` | Rename + fill placeholders |
| `readme.md` → `README.md` | Rename + rewrite |
| `src/Umbraco.Community.UmbraDesktop/readme.md` | Delete |
| `src/Umbraco.Community.UmbraDesktop/backoffice/public/localization/` | Delete (empty scaffolds) |
| `Solution files/.github/copilot-instructions.md` | Delete (duplicate) |

---

## Task 1: Fix the package payload

**This is the highest-priority task. Everything else verifies against the package this produces.**

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/Umbraco.Community.UmbraDesktop.csproj:48-57`

- [ ] **Step 1: Capture the failing state**

Build the frontend, then pack, and count what lands in the package:

```bash
cd src/Umbraco.Community.UmbraDesktop && npm run build && cd ../..
dotnet build src/Umbraco.Community.UmbraDesktop/ -c Release
dotnet pack src/Umbraco.Community.UmbraDesktop/ -c Release --no-build -o ./artifacts
unzip -l ./artifacts/*.nupkg | grep -c "staticwebassets/"
```

Expected: `0` — confirming the frontend is absent. If it prints a non-zero number, someone has already applied part of this fix; still complete Steps 2–4, because the dev-file exclusions are a separate half of the change.

- [ ] **Step 2: Remove the lines that strip the frontend**

In `Umbraco.Community.UmbraDesktop.csproj`, replace this `ItemGroup`:

```xml
  <ItemGroup>
    <Compile Remove="App_Plugins\**" />
    <Compile Remove="wwwroot\App_Plugins\Umbraco.Community.UmbraDesktop\**" />
    <Content Remove="App_Plugins\**" />
    <Content Remove="wwwroot\App_Plugins\Umbraco.Community.UmbraDesktop\**" />
    <EmbeddedResource Remove="App_Plugins\**" />
    <EmbeddedResource Remove="wwwroot\App_Plugins\Umbraco.Community.UmbraDesktop\**" />
    <None Remove="App_Plugins\**" />
    <None Remove="wwwroot\App_Plugins\Umbraco.Community.UmbraDesktop\**" />
  </ItemGroup>
```

with:

```xml
  <ItemGroup>
    <!-- Legacy top-level App_Plugins folder is not part of this project. -->
    <Compile Remove="App_Plugins\**" />
    <Content Remove="App_Plugins\**" />
    <EmbeddedResource Remove="App_Plugins\**" />
    <None Remove="App_Plugins\**" />

    <!-- Development-only files. ContentTargetFolders is ".", so anything left as Content packs
         to the package root; without these the package ships package-lock.json and the
         TypeScript sources' config instead of just the built output. -->
    <Content Remove="backoffice\**" />
    <Content Remove="package.json" />
    <Content Remove="package-lock.json" />
  </ItemGroup>
```

The `wwwroot\App_Plugins\...` removals are gone deliberately: the Razor SDK must see those files as `Content` in order to publish them as static web assets under `staticwebassets/App_Plugins/…`.

- [ ] **Step 3: Repack**

```bash
rm -rf ./artifacts
dotnet build src/Umbraco.Community.UmbraDesktop/ -c Release
dotnet pack src/Umbraco.Community.UmbraDesktop/ -c Release --no-build -o ./artifacts
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`

- [ ] **Step 4: Verify the package payload**

```bash
unzip -l ./artifacts/*.nupkg
```

Expected — **33 files**, including:
- **19** entries under `staticwebassets/App_Plugins/Umbraco.Community.UmbraDesktop/`, among them `umbradesktop.js`, `desktop.element-*.js`, `header-app.element-*.js`, `entrypoint-*.js`, `chrome-injector-*.js`, `bundle.manifests-*.js`, `en-*.js`, `nl-*.js` and `umbraco-package.json`
- `lib/net10.0/Umbraco.Community.UmbraDesktop.dll` and `.xml`
- `appsettings-schema.Umbraco.Community.UmbraDesktop.json`
- `build/`, `buildMultiTargeting/`, `buildTransitive/` props files
- **NOT** `package.json`, `package-lock.json`, `backoffice/tsconfig.json`, or `backoffice/public/umbraco-package.json`

Confirm the dev files are gone:

```bash
unzip -l ./artifacts/*.nupkg | grep -E "package-lock|backoffice/" | wc -l
```

Expected: `0`

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.UmbraDesktop/Umbraco.Community.UmbraDesktop.csproj
git commit -m "fix: pack the built frontend as static web assets

The Content/None Remove entries for wwwroot/App_Plugins stripped the Vite
output before the Razor SDK could discover it, so the package shipped no
frontend at all - it would install and silently do nothing. Also exclude
package.json, package-lock.json and backoffice/** which were packing to the
package root because ContentTargetFolders is '.'."
```

---

## Task 2: Repository hygiene files

**Files:**
- Rename: `LICENSE.txt` → `LICENSE`
- Create: `.github/CODEOWNERS`, `.editorconfig`, `.gitattributes`
- Delete: `Solution files/.github/copilot-instructions.md`

- [ ] **Step 1: Rename and fill the licence**

```bash
git mv LICENSE.txt LICENSE
```

Then in `LICENSE`, replace the placeholder line. It currently reads exactly:

```
Copyright (c) [year] [fullname]
```

Change it to:

```
Copyright (c) 2026 Luuk Peters
```

Verify no placeholders remain:

```bash
grep -n "\[year\]\|\[fullname\]" LICENSE
```

Expected: no output.

- [ ] **Step 2: Create `.github/CODEOWNERS`**

```
# CODEOWNERS for Umbraco.Community.UmbraDesktop
#
# Each line is a pattern followed by one or more owners.
# The LAST matching pattern takes precedence.
# Docs: https://docs.github.com/en/repositories/managing-your-repositories-settings-and-customizations/customizing-your-repository/about-code-owners

# Default owner for everything in the repo
*       @Luuk1983
```

- [ ] **Step 3: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space

# C# / .NET
[*.{cs,csx}]
indent_size = 4

# Project files
[*.{csproj,props,targets,xml}]
indent_size = 2

# Frontend
[*.{ts,tsx,js,jsx,json,html,css}]
indent_size = 2

# Markdown — preserve trailing whitespace (used for line breaks)
[*.md]
trim_trailing_whitespace = false
indent_size = 2

# YAML
[*.{yml,yaml}]
indent_size = 2
```

- [ ] **Step 4: Create `.gitattributes`**

```
# Normalize line endings on checkin; check out native.
* text=auto
```

- [ ] **Step 5: Delete the duplicated copilot instructions**

`Solution files/.github/copilot-instructions.md` is a second physical copy of `.github/copilot-instructions.md`. The `.slnx` solution folder already links the real file, so nothing breaks.

```bash
git rm "Solution files/.github/copilot-instructions.md"
```

- [ ] **Step 6: Verify the solution still loads**

```bash
dotnet build Umbraco.Community.UmbraDesktop.app.slnx -c Release 2>&1 | tail -5
```

Expected: `Build succeeded.` with 0 errors.

- [ ] **Step 7: Commit**

```bash
git add LICENSE .github/CODEOWNERS .editorconfig .gitattributes
git commit -m "chore: add licence, CODEOWNERS, editorconfig and gitattributes

LICENSE.txt shipped an unfilled MIT template with literal [year] and
[fullname] placeholders. Also removes a duplicate copy of the copilot
instructions under 'Solution files/'."
```

---

## Task 3: Remove the dead localization scaffolds

`backoffice/public/localization/en.js` and `nl.js` contain only `export default {};` but are still registered as extensions. The real strings live in `backoffice/src/desktop/localization/`, registered through the bundle under different aliases.

**Files:**
- Delete: `src/Umbraco.Community.UmbraDesktop/backoffice/public/localization/en.js`, `nl.js`
- Modify: `src/Umbraco.Community.UmbraDesktop/backoffice/public/umbraco-package.json`

- [ ] **Step 1: Confirm they are genuinely empty**

```bash
cat src/Umbraco.Community.UmbraDesktop/backoffice/public/localization/en.js
cat src/Umbraco.Community.UmbraDesktop/backoffice/public/localization/nl.js
```

Expected: each is a comment header plus `export default {\n};` — no keys. **If either contains real keys, stop and re-check with the repo owner** rather than deleting translations.

- [ ] **Step 2: Delete the folder**

```bash
git rm -r src/Umbraco.Community.UmbraDesktop/backoffice/public/localization
```

- [ ] **Step 3: Remove the two dead entries from the manifest**

In `backoffice/public/umbraco-package.json`, delete both localization objects, leaving only the bundle. The whole file becomes:

```json
{
	"$schema": "../../umbraco-package-schema.json",
	"id": "Umbraco.Community.UmbraDesktop",
	"name": "UmbraDesktop",
	"version": "GetsGenerated",
	"extensions": [
		{
			"type": "bundle",
			"alias": "Umbraco.Community.UmbraDesktop.Bundle",
			"name": "UmbraDesktop Bundle",
			"js": "/App_Plugins/Umbraco.Community.UmbraDesktop/umbradesktop.js"
		}
	]
}
```

- [ ] **Step 4: Rebuild and verify the real localization still ships**

The `en-*.js` / `nl-*.js` chunks come from the bundled TypeScript, not from `public/`, so they must survive:

```bash
cd src/Umbraco.Community.UmbraDesktop
rm -rf wwwroot/App_Plugins
npm run build
ls wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop/
cd ../..
```

Expected: `en-*.js` and `nl-*.js` present; **no** `localization/` subfolder.

- [ ] **Step 5: Run the tests**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm test; cd ../..
```

Expected: `6/6 test files | 76 passed, 0 failed`

- [ ] **Step 6: Manually confirm the UI is still localized**

Start the TestInstance, open the launcher, and confirm app and group names render as words ("Content editor", "Media library", "Editing", "Development") and **not** as raw tokens like `umbraDesktop_appContentEditor`. This is the one check that automated tests cannot cover.

- [ ] **Step 7: Commit**

```bash
git add -A src/Umbraco.Community.UmbraDesktop/backoffice
git commit -m "chore: drop empty localization scaffolds

public/localization/{en,nl}.js were empty (export default {}) but still
registered as extensions in umbraco-package.json. The real umbraDesktop
strings live in src/desktop/localization/ and ship via the bundle."
```

---

## Task 4: Correct the dependency floors and pin the backoffice types

A floating `17.*` is resolved at restore time and NuGet stamps the **resolved** version into the nuspec as the minimum, with **no upper bound**. Today that means the published package would demand `Umbraco.Cms.Core >= 17.5.3` — refusing to install on 17.0–17.4 while claiming to support 18 and beyond.

**Files:**
- Modify: `src/Directory.Packages.props`
- Modify: `src/Umbraco.Community.UmbraDesktop/package.json`
- Regenerate: `src/Umbraco.Community.UmbraDesktop/packages.lock.json`, `package-lock.json`

- [ ] **Step 1: Confirm the broken range in the current package**

```bash
unzip -p ./artifacts/*.nupkg Umbraco.Community.UmbraDesktop.nuspec | grep dependency
```

Expected: `<dependency id="Umbraco.Cms.Core" version="17.5.3" ... />` — a bare `17.5.3` means "≥ 17.5.3, no ceiling".

- [ ] **Step 2: Set explicit ranges**

In `src/Directory.Packages.props`, change the extension-package entries:

```xml
		<!-- Extension package dependencies -->
		<PackageVersion Include="Umbraco.Cms.Api.Common" Version="[17.0.0,18.0.0)" />
		<PackageVersion Include="Umbraco.Cms.Core" Version="[17.0.0,18.0.0)" />
		<PackageVersion Include="Umbraco.JsonSchema.Extensions" Version="0.*" />
```

Leave the test-instance entries (`Umbraco.Cms`, `Microsoft.ICU.ICU4C.Runtime`, `uSync`) untouched — that project is never published.

- [ ] **Step 3: Add the versions Task 5 will need**

Still in `src/Directory.Packages.props`, add to the same `ItemGroup`:

```xml
		<!-- Build-time only: versioning and source-link -->
		<PackageVersion Include="MinVer" Version="6.0.0" />
		<PackageVersion Include="Microsoft.SourceLink.GitHub" Version="8.0.0" />
```

**Verify these versions before committing** rather than trusting them:

```bash
dotnet package search MinVer --exact-match
dotnet package search Microsoft.SourceLink.GitHub --exact-match
```

Use the latest stable of each; adjust the numbers above if they differ.

**Watch-point on SourceLink.** Since .NET 8 the SDK bundles SourceLink for GitHub repositories, so
the explicit `Microsoft.SourceLink.GitHub` reference is redundant. It is included because the
reference repository uses it and it makes the intent explicit. **But `TreatWarningsAsErrors` is
`true` in this project**, so if the redundant reference produces a warning (e.g. NETSDK1215 about
an implicitly-referenced package), the build will *fail*. If that happens, drop both the
`PackageVersion` and the `PackageReference` for `Microsoft.SourceLink.GitHub` — the SDK provides
the behaviour anyway, and `PublishRepositoryUrl` / `EmbedUntrackedSources` in Task 5 are what
actually matter. Do not suppress the warning.

- [ ] **Step 4: Pin the backoffice types**

In `src/Umbraco.Community.UmbraDesktop/package.json`, change:

```json
		"@umbraco-cms/backoffice": "^*",
```

to:

```json
		"@umbraco-cms/backoffice": "^17",
```

`^*` can resolve to v18 types on a fresh `npm install`, silently type-checking against the wrong backoffice major.

- [ ] **Step 5: Regenerate both lock files**

`RestorePackagesWithLockFile` is on, so a stale `packages.lock.json` fails restore with NU1004:

```bash
dotnet restore src/Umbraco.Community.UmbraDesktop/ --force-evaluate
cd src/Umbraco.Community.UmbraDesktop && npm install && cd ../..
```

- [ ] **Step 6: Verify the resolved versions did not move**

```bash
grep -A3 '"Umbraco.Cms.Core"' src/Umbraco.Community.UmbraDesktop/packages.lock.json | head -5
```

Expected: `"requested": "[17.0.0, 18.0.0)"` and a `"resolved"` still within 17.x.

```bash
cd src/Umbraco.Community.UmbraDesktop && npm ls @umbraco-cms/backoffice; cd ../..
```

Expected: a `17.x` version.

- [ ] **Step 7: Rebuild, retest, repack and check the nuspec**

```bash
cd src/Umbraco.Community.UmbraDesktop && npm test && npm run build && cd ../..
rm -rf ./artifacts
dotnet build src/Umbraco.Community.UmbraDesktop/ -c Release
dotnet pack src/Umbraco.Community.UmbraDesktop/ -c Release --no-build -o ./artifacts
unzip -p ./artifacts/*.nupkg Umbraco.Community.UmbraDesktop.nuspec | grep dependency
```

Expected: `version="[17.0.0, 18.0.0)"` for both `Umbraco.Cms.Core` and `Umbraco.Cms.Api.Common`.

- [ ] **Step 8: Commit**

```bash
git add src/Directory.Packages.props src/Umbraco.Community.UmbraDesktop/package.json src/Umbraco.Community.UmbraDesktop/package-lock.json src/Umbraco.Community.UmbraDesktop/packages.lock.json
git commit -m "fix: declare an explicit Umbraco 17 range and pin backoffice types

Floating 17.* resolved to 17.5.3 and NuGet stamped that as the nuspec floor
with no ceiling, so the package would refuse to install on 17.0-17.4 while
claiming to support 18+. Also pins @umbraco-cms/backoffice from ^* to ^17."
```

---

## Task 5: MinVer versioning and package metadata

**Files:**
- Modify: `src/Umbraco.Community.UmbraDesktop/Umbraco.Community.UmbraDesktop.csproj`

- [ ] **Step 1: Replace the metadata PropertyGroup**

Replace the first `<PropertyGroup>` with:

```xml
  <PropertyGroup>
	  <AddRazorSupportForMvc>true</AddRazorSupportForMvc>
	  <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>

	  <ContentTargetFolders>.</ContentTargetFolders>
	  <Product>Umbraco.Community.UmbraDesktop</Product>
	  <PackageId>Umbraco.Community.UmbraDesktop</PackageId>
	  <Title>UmbraDesktop</Title>
	  <Description>An OS-style windowed desktop for the Umbraco backoffice. Launch content, media, settings and other sections as real draggable, resizable windows and work in several of them side by side — edit on the left while you watch the result on the right. Includes a grouped app launcher with pinnable favourites, a taskbar, and per-app window chrome, all styled to match the backoffice.</Description>
	  <PackageTags>umbraco;backoffice;desktop;windows;multitasking;productivity;umbraco-marketplace</PackageTags>
	  <RootNamespace>Umbraco.Community.UmbraDesktop</RootNamespace>
	  <Authors>Luuk Peters</Authors>
	  <Company>Luuk Peters</Company>
	  <Copyright>Copyright (c) Luuk Peters</Copyright>
	  <PackageLicenseExpression>MIT</PackageLicenseExpression>
	  <RepositoryType>git</RepositoryType>
	  <RepositoryUrl>https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop</RepositoryUrl>
	  <PackageProjectUrl>https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop</PackageProjectUrl>
	  <GenerateDocumentationFile>True</GenerateDocumentationFile>
	  <PackageIcon>Package-image_128_128.png</PackageIcon>
	  <PackageReadmeFile>README.md</PackageReadmeFile>
	  <StaticWebAssetBasePath>/</StaticWebAssetBasePath>

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
  </PropertyGroup>
```

Changes from the original: `Title` is now the human-facing `UmbraDesktop`; `Description` and `PackageTags` expanded (`umbraco-marketplace` is **required** or the Marketplace never indexes the package); licence/repository/copyright metadata added; MinVer, symbols and SourceLink added. **`<VersionPrefix>` and `<GeneratePackageOnBuild>` are deliberately gone** — MinVer owns the version, and auto-pack-on-build would pack twice in CI and litter dev machines.

- [ ] **Step 2: Replace the version-sync target**

The old `UpdateUmbracoPackageJsonVersion` target keys off `$(VersionPrefix)`, which no longer exists. Replace that whole `<Target>` block with:

```xml
	<!-- Sync umbraco-package.json with the MinVer-derived version at build time. The source file
	     keeps "GetsGenerated" as its placeholder; this stamps the built copy in wwwroot. -->
	<UsingTask TaskName="SetJsonVersion"
	           TaskFactory="RoslynCodeTaskFactory"
	           AssemblyFile="$(MSBuildToolsPath)\Microsoft.Build.Tasks.Core.dll">
		<ParameterGroup>
			<FilePath ParameterType="System.String" Required="true" />
			<VersionValue ParameterType="System.String" Required="true" />
		</ParameterGroup>
		<Task>
			<Code Type="Fragment" Language="cs"><![CDATA[
var text = System.IO.File.ReadAllText(FilePath);
text = System.Text.RegularExpressions.Regex.Replace(
    text, @"""version"":\s*""[^""]*""", $@"""version"": ""{VersionValue}""");
System.IO.File.WriteAllText(FilePath, text);
Log.LogMessage(MessageImportance.High, $"Set version in {FilePath} to {VersionValue}");
      ]]></Code>
		</Task>
	</UsingTask>

	<PropertyGroup>
		<UmbracoPackageJsonPath>$(ProjectDir)wwwroot\App_Plugins\Umbraco.Community.UmbraDesktop\umbraco-package.json</UmbracoPackageJsonPath>
	</PropertyGroup>

	<Target Name="SyncUmbracoPackageVersion" AfterTargets="MinVer" Condition="'$(MinVerVersion)' != ''">
		<SetJsonVersion FilePath="$(UmbracoPackageJsonPath)" VersionValue="$(MinVerVersion)"
		                Condition="Exists('$(UmbracoPackageJsonPath)')" />
		<Warning Text="umbraco-package.json not found at $(UmbracoPackageJsonPath) — run 'npm run build' before packing, or the package will ship an unstamped version."
		         Condition="!Exists('$(UmbracoPackageJsonPath)')" />
	</Target>
```

The `Exists` guard and warning are a deliberate improvement over the reference: without them, a fresh clone that hasn't run `npm run build` fails with an opaque `FileNotFoundException` from inside the inline task.

- [ ] **Step 3: Add the MinVer and SourceLink references**

In the `ItemGroup` holding `PackageReference`s, add the two build-time packages:

```xml
	<ItemGroup>
	  <PackageReference Include="MinVer" PrivateAssets="all" />
	  <PackageReference Include="Microsoft.SourceLink.GitHub" PrivateAssets="all" />
	  <PackageReference Include="Umbraco.Cms.Api.Common" />
	  <PackageReference Include="Umbraco.Cms.Core" />
	  <PackageReference Include="Umbraco.JsonSchema.Extensions" />
	</ItemGroup>
```

- [ ] **Step 4: Point the packed readme at the root README**

Replace the `ItemGroup` that packs `readme.md`:

```xml
	<ItemGroup>
		<None Include="readme.md">
			<Pack>True</Pack>
			<PackagePath>\</PackagePath>
		</None>
	</ItemGroup>
```

with:

```xml
	<ItemGroup>
		<None Include="..\..\README.md" Pack="true" PackagePath="\" />
	</ItemGroup>
```

- [ ] **Step 5: Delete the now-unreferenced package-level readme**

```bash
git rm src/Umbraco.Community.UmbraDesktop/readme.md
```

**Note:** the root `README.md` does not exist yet — it is created in Task 6. Until then `dotnet pack` will fail on the missing readme. That is expected; Steps 6–7 handle it.

- [ ] **Step 6: Create a temporary root README so the build can be verified now**

```bash
git mv readme.md README.tmp && git mv README.tmp README.md
```

The two-step rename is required: Windows' filesystem is case-insensitive, so `git mv readme.md README.md` is rejected as "destination exists". Task 6 replaces the contents.

**Also update the solution file.** `Umbraco.Community.UmbraDesktop.app.slnx` lists the readme in its
Solution Items folder as `<File Path="readme.md" />`. Change it to:

```xml
    <File Path="README.md" />
```

Leaving it stale gives a broken entry in the Visual Studio solution explorer. Verify afterwards:

```bash
grep -o 'Path="[^"]*"' Umbraco.Community.UmbraDesktop.app.slnx
dotnet sln Umbraco.Community.UmbraDesktop.app.slnx list
```

Expected: `Path="README.md"` present, no `Path="readme.md"`, and both projects still listed.

- [ ] **Step 7: Regenerate the lock file, build and pack**

MinVer and SourceLink change the dependency graph:

```bash
dotnet restore src/Umbraco.Community.UmbraDesktop/ --force-evaluate
cd src/Umbraco.Community.UmbraDesktop && npm run build && cd ../..
rm -rf ./artifacts
dotnet build src/Umbraco.Community.UmbraDesktop/ -c Release
dotnet pack src/Umbraco.Community.UmbraDesktop/ -c Release --no-build -o ./artifacts
ls ./artifacts/
```

Expected: **two** files — `Umbraco.Community.UmbraDesktop.17.0.0-alpha.0.<n>.nupkg` and a matching `.snupkg`. The `17.0.0-alpha.0.<n>` version is MinVer working correctly: no `v*` tag exists yet, so it floors at `MinVerMinimumMajorMinor` and marks the build as a prerelease.

- [ ] **Step 8: Verify the version was stamped into the manifest**

```bash
unzip -p ./artifacts/*.nupkg staticwebassets/App_Plugins/Umbraco.Community.UmbraDesktop/umbraco-package.json | grep version
```

Expected: `"version": "1.0.0-alpha.0.<n>"` — **not** `"GetsGenerated"`.

- [ ] **Step 9: Verify the rest of the metadata**

```bash
unzip -p ./artifacts/*.nupkg Umbraco.Community.UmbraDesktop.nuspec
```

Expected to contain: `<title>UmbraDesktop</title>`, `<license type="expression">MIT</license>`, `<projectUrl>` and `<repository ... url="https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop" ...>`, `<readme>README.md</readme>`, `<icon>Package-image_128_128.png</icon>`, and `<tags>` containing `umbraco-marketplace`.

- [ ] **Step 10: Commit**

```bash
git add -A src/Umbraco.Community.UmbraDesktop README.md
git commit -m "feat: MinVer tag-driven versioning and complete package metadata

Version now comes from v* git tags instead of a hardcoded VersionPrefix, and
GeneratePackageOnBuild is dropped so packing is explicit. Adds licence,
repository, copyright, symbols and SourceLink metadata, and packs the root
README instead of the placeholder package-level one."
```

---

## Task 6: Write the README

Tone: **not too technical.** The first two thirds sell the package and get someone running; implementation detail is quarantined in the final section.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the file**

````markdown
<img src="https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png" alt="UmbraDesktop" width="128" height="128">

# UmbraDesktop

An OS-style windowed desktop for the Umbraco backoffice — open your tools as real windows and work in several of them side by side.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE)

---

The Umbraco backoffice shows you one thing at a time. One section is active, one workspace fills the screen. That is fine for linear editing, but it fights you the moment two tools are meant to be looked at *together*.

UmbraDesktop turns the backoffice into a desktop. A launcher opens your sections and tools as floating windows you can move, resize and place next to each other — content beside media, or a settings editor beside the thing it affects.

> **TODO:** screenshots pending.

## Features

- **Work side by side.** Open two or more tools at once and arrange them however you like. Edit on the left, watch the result on the right, without navigating back and forth.
- **Real windows.** Drag, resize, minimise, maximise, and double-click a title bar to fill the desktop. Each window remembers its own place.
- **A launcher that stays out of the way.** Apps are grouped into Editing, Development, Users & Members, Diagnostics and System, so you find things by what they do.
- **Pin what you use.** Pin your regulars to Favourites and they sit at the top of the launcher.
- **A taskbar.** Every open window gets a button — click to focus, click again to minimise.
- **Looks like Umbraco.** The desktop, launcher and window chrome are built from Umbraco's own design tokens, so it reads as part of the backoffice rather than bolted on.
- **Nothing new to learn.** The windows contain the backoffice you already know — the same trees, the same editors, the same shortcuts.

## Installation & configuration

### Prerequisites

- Umbraco **17**
- **.NET 10**

### Install

```bash
dotnet add package Umbraco.Community.UmbraDesktop
```

### Grant the Desktop section to a user group

**This step is required — until you do it, nothing appears.**

In **Settings → User Groups**, pick a group and grant it access to the **Desktop** section, then have those users sign out and back in.

That single grant does two things: it makes the desktop reachable, and it reveals the launcher in the backoffice header. Users without it see the backoffice exactly as before.

### What each user sees

UmbraDesktop grants no access of its own. Every app in the launcher is gated on the section it comes from, so a user only ever sees apps for sections they could already reach. Give an editor access to Content and Media and those are the apps they get.

## How to use it

Click the **desktop icon in the backoffice header**, top right, between Help and your avatar. That is the way in — the Desktop section's own tab in the section bar is deliberately hidden, so it does not clutter the list.

From the launcher:

- **Click an app** to open it in a window.
- **Hover an app and click the pin** to add it to Favourites, which sit at the top.
- **Drag a title bar** to move a window; **drag an edge or corner** to resize; **double-click the title bar** to maximise.
- **Use the taskbar** at the bottom to switch between open windows.
- **Exit** from the launcher's footer to return to the classic backoffice.

Several apps can be open at once, and some — like the content editor and media library — can be opened more than once, so you can compare two documents side by side.

## Technical explanation

### Windows are iframes

Each window hosts an `<iframe>` deep-linked into the backoffice on the same origin. That matters because the Umbraco router reads a single global `window.location` and patches History globally, so only one route tree can own the URL. An iframe has its own `window`, `location`, History and event bus — which is what makes genuinely independent navigation per window possible without any change to Umbraco core.

Authentication is shared automatically through the existing secure cookies, so each window boots an authenticated backoffice like an extra tab.

Windows stay fresh through Umbraco's own machinery rather than a custom sync layer: each iframe runs its own observers and server-events connection, so saving in one window causes the others to refresh themselves.

### How much chrome a window keeps

A window should not show the entire backoffice shell inside a small frame. Because the iframe is same-origin, UmbraDesktop injects a stylesheet into it, keyed off stable custom-element tags. Three profiles decide how much survives:

| Profile | Keeps | Typical use |
|---|---|---|
| `full-section` | Section sidebar and tree, without the top header | Tools where the tree *is* the tool — Content, Media, Document Types |
| `workspace-only` | Just the workspace | Self-contained editors — Log Viewer, Webhooks |
| `bare` | The target view only | Single-focus dashboards — Examine, Health Check, Profiling |

### The app catalogue

Which apps appear, and how they present themselves, is defined by a curated catalogue in `backoffice/src/desktop/catalogue/`. Each entry points at a registered extension by alias — its URL is inferred from the registry rather than hardcoded — and carries display detail: name, icon, group, chrome profile, default and minimum window size, whether multiple instances are allowed, and sort weight.

### Apps that aren't in the catalogue

Any section a user can reach that no catalogue entry covers still shows up. It is derived automatically as an *uncertified* app: default `full-section` chrome, a generic icon, and placement in the reserved **More** group. Nothing is hidden from you just because it hasn't been curated.

Sections listed in `catalogue/exclusions.ts` never appear this way — seeded with UmbraDesktop's own section, so you cannot open the desktop inside the desktop.

### Custom and third-party apps

If your package registers a section, it appears in the launcher automatically for users permitted to that section, in the **More** group with default chrome and a generic icon. No work required.

For curated placement — a custom icon, a friendly name, a specific group, a different chrome profile or window sizing — the app needs an entry in `backoffice/src/desktop/catalogue/`. That means opening a pull request against this repository; there is no runtime registration point.

## Documentation

The full design, including the research behind the iframe approach, is in [`docs/design/umbradesktop-design.md`](docs/design/umbradesktop-design.md).

## License

[MIT](LICENSE)
````

- [ ] **Step 2: Check every internal link resolves**

```bash
ls LICENSE docs/design/umbradesktop-design.md src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png
```

Expected: all three exist.

- [ ] **Step 3: Confirm no broken image tags**

```bash
grep -n "!\[" README.md
```

Expected: no output. Screenshots are a `> **TODO:**` blockquote, not `![]()` tags — a broken image renders as an error glyph on GitHub *and* NuGet, which looks worse than an honest note.

- [ ] **Step 4: Verify it packs**

```bash
rm -rf ./artifacts
dotnet build src/Umbraco.Community.UmbraDesktop/ -c Release
dotnet pack src/Umbraco.Community.UmbraDesktop/ -c Release --no-build -o ./artifacts
unzip -p ./artifacts/*.nupkg README.md | head -5
```

Expected: the README content, confirming the root file is the one being packed.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: write the README

Introduction, features, install and configuration, usage, then a technical
section covering the iframe model, chrome profiles, the catalogue and the
uncertified-section fallback. Screenshots are a TODO note rather than broken
image links."
```

---

## Task 7: Marketplace listing and screenshot placeholder

**Files:**
- Create: `umbraco-marketplace.json`, `docs/screenshots/.gitkeep`

- [ ] **Step 1: Create `docs/screenshots/.gitkeep`**

```bash
mkdir -p docs/screenshots && touch docs/screenshots/.gitkeep
```

- [ ] **Step 2: Create `umbraco-marketplace.json` at the repo root**

```json
{
  "$schema": "https://marketplace.umbraco.com/umbraco-marketplace-schema.json",
  "Title": "UmbraDesktop",
  "Category": "Editor Tools",
  "AlternateCategory": "Developer Tools",
  "Description": "An OS-style windowed desktop for the Umbraco backoffice. Open content, media, settings and other sections as real draggable, resizable windows and work in several of them side by side. Includes a grouped app launcher with pinnable favourites, a taskbar, and per-app window chrome, all styled to match the backoffice.",
  "PackageType": "Package",
  "LicenseTypes": ["Free"],
  "AuthorDetails": {
    "Name": "Luuk Peters",
    "Description": "Umbraco developer building packages that extend the CMS with enterprise-grade features.",
    "Url": "https://github.com/Luuk1983",
    "SyncContributorsFromRepository": true
  },
  "DocumentationUrl": "https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop",
  "IssueTrackerUrl": "https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues",
  "Tags": [
    "desktop",
    "windows",
    "multitasking",
    "productivity",
    "backoffice",
    "launcher",
    "side by side",
    "workspace",
    "editor tools"
  ],
  "Screenshots": []
}
```

`"Screenshots": []` is deliberate. Entries pointing at files that do not exist yet produce broken images on the Marketplace with no error anywhere — Task 14 fills this in.

- [ ] **Step 3: Validate the JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('umbraco-marketplace.json','utf8')); console.log('valid JSON')"
```

Expected: `valid JSON`

- [ ] **Step 4: Commit**

```bash
git add umbraco-marketplace.json docs/screenshots/.gitkeep
git commit -m "feat: add Umbraco Marketplace listing

Screenshots array is intentionally empty until the images are captured;
entries pointing at missing files break silently on the Marketplace."
```

---

## Task 8: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history needed for MinVer

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Restore dependencies
        run: dotnet restore src/Umbraco.Community.UmbraDesktop/

      - name: Install frontend dependencies
        working-directory: src/Umbraco.Community.UmbraDesktop
        run: npm ci

      - name: Test frontend
        working-directory: src/Umbraco.Community.UmbraDesktop
        run: npm test

      # Must run before dotnet build/pack: wwwroot/App_Plugins is gitignored, so a clean
      # checkout would otherwise pack a package with no frontend in it at all.
      - name: Build frontend
        working-directory: src/Umbraco.Community.UmbraDesktop
        run: npm run build

      - name: Build
        run: dotnet build src/Umbraco.Community.UmbraDesktop/ --configuration Release --no-restore

      - name: Pack
        run: dotnet pack src/Umbraco.Community.UmbraDesktop/ --configuration Release --no-build --output ./artifacts

      - name: Upload package artifact
        uses: actions/upload-artifact@v4
        with:
          name: nuget-package
          path: ./artifacts/*.nupkg
          retention-days: 7
```

There is no `dotnet test` step: the repo has no C# test project, and a step matching zero projects reports green while testing nothing. The frontend suites are the real tests.

Only the package project is restored and built — the TestInstance pulls the whole Umbraco CMS and is not needed to validate the package.

- [ ] **Step 2: Validate the YAML parses**

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('runs-on'))throw new Error('bad');console.log('read ok')"
```

For real schema validation, rely on GitHub's own parser on first push — a syntax error surfaces immediately as a failed workflow run.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add PR build, test and pack workflow"
```

**Known risk to watch on first run:** `npm test` uses `@web/test-runner`, whose default launcher needs a local Chrome. `ubuntu-latest` ships Chrome, so this is expected to work — but if the run fails with a browser-launch error, install a browser explicitly by adding `- run: npx playwright install --with-deps chromium` and switching the runner to the Playwright launcher. Do not silence the failure by removing the test step.

---

## Task 9: Publish workflow

**Files:**
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Publish to NuGet

on:
  push:
    tags: ['v*.*.*']

permissions:
  id-token: write # Required for NuGet trusted publishing
  contents: write # Required for creating GitHub releases

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history needed for MinVer

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Restore dependencies
        run: dotnet restore src/Umbraco.Community.UmbraDesktop/

      - name: Install frontend dependencies
        working-directory: src/Umbraco.Community.UmbraDesktop
        run: npm ci

      - name: Test frontend
        working-directory: src/Umbraco.Community.UmbraDesktop
        run: npm test

      - name: Build frontend
        working-directory: src/Umbraco.Community.UmbraDesktop
        run: npm run build

      - name: Build
        run: dotnet build src/Umbraco.Community.UmbraDesktop/ --configuration Release --no-restore

      - name: Pack
        run: dotnet pack src/Umbraco.Community.UmbraDesktop/ --configuration Release --no-build --output ./artifacts

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

`prerelease` keys off a hyphen in the tag name, so `v17.0.0-beta.1` is published as a prerelease automatically while `v17.0.0` is not. `dotnet nuget push` uploads the matching `.snupkg` alongside the `.nupkg`.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add tag-triggered NuGet publish via trusted publishing"
```

---

## Task 10: Full clean verification

Everything so far was verified incrementally on a dirty tree. This proves it works from scratch, the way CI will.

**Files:** none modified.

- [ ] **Step 1: Clean the package project's build output**

> **Do NOT use `git clean -xdf` here.** It would also delete
> `src/Umbraco.Community.UmbraDesktop.TestInstance/umbraco/` — the local SQLite database and logs —
> and `TestInstance/wwwroot/media/`, destroying the developer's local test site content. Verified
> by dry run. Clean only the package project's outputs:

```bash
rm -rf src/Umbraco.Community.UmbraDesktop/bin \
       src/Umbraco.Community.UmbraDesktop/obj \
       src/Umbraco.Community.UmbraDesktop/wwwroot \
       ./artifacts
cd src/Umbraco.Community.UmbraDesktop && npm ci && cd ../..
```

`npm ci` deletes and reinstalls `node_modules` from the lockfile, which is what CI does.

> **Close Visual Studio first.** `package.json` contains
> `"-vs-binding": { "ProjectOpened": [ "watch" ] }`, so opening the project in Visual Studio
> auto-starts `npm run watch` (`vite build --watch`). Its esbuild worker holds
> `node_modules/@esbuild/win32-x64/esbuild.exe` open, and `npm ci` then fails with
> `EPERM: operation not permitted, unlink ... esbuild.exe` **after it has already deleted most of
> `node_modules`** — leaving a broken tree missing `lit`, `typescript`, `vite` and `@open-wc`.
> Recover with `npm install` (it repairs in place without needing to unlink the locked binary).
> The watcher processes may be unkillable from a non-elevated shell, so closing VS is the fix.

- [ ] **Step 2: Run the full sequence exactly as CI does**

```bash
dotnet restore src/Umbraco.Community.UmbraDesktop/
cd src/Umbraco.Community.UmbraDesktop && npm test && npm run build && cd ../..
dotnet build src/Umbraco.Community.UmbraDesktop/ --configuration Release --no-restore
dotnet pack src/Umbraco.Community.UmbraDesktop/ --configuration Release --no-build --output ./artifacts
```

Expected: tests `76 passed, 0 failed`; build `0 Warning(s), 0 Error(s)`; two files in `./artifacts`.

- [ ] **Step 3: Verify the package one final time**

```bash
unzip -l ./artifacts/*.nupkg | grep -c staticwebassets/    # expect 17 (19 before Task 3)
unzip -l ./artifacts/*.nupkg | grep -cE "package-lock|backoffice/"  # expect 0
unzip -p ./artifacts/*.nupkg staticwebassets/App_Plugins/Umbraco.Community.UmbraDesktop/umbraco-package.json | grep version
unzip -p ./artifacts/*.nupkg Umbraco.Community.UmbraDesktop.nuspec | grep -E "dependency|title|license|readme|icon"
```

Expected: **17** static web assets; 0 dev files; a real version, not `GetsGenerated`; `[17.0.0, 18.0.0)` ranges; `UmbraDesktop` title; MIT licence; `README.md`; the icon.

(17, not 19: Task 3 removed the two dead `localization/en.js` and `localization/nl.js` assets. The
real localization ships as the hashed `en-*.js` / `nl-*.js` chunks.)

- [ ] **Step 4: Install the package into the TestInstance and smoke-test it**

This is the step that catches a package that builds but does not work.

```bash
dotnet nuget add source "$(pwd)/artifacts" -n local-umbradesktop
cd src/Umbraco.Community.UmbraDesktop.TestInstance
dotnet add package Umbraco.Community.UmbraDesktop --prerelease -s ../../artifacts
```

Then run the TestInstance and confirm, in the browser:
- The desktop icon appears in the backoffice header for a user whose group has the Desktop section.
- The launcher opens and shows grouped apps with **localized names**, not raw `umbraDesktop_*` tokens.
- An app opens in a window; the window drags, resizes and maximises.
- The taskbar shows the open window.
- A user *without* the Desktop section sees no icon and no change to their backoffice.

- [ ] **Step 5: Undo the TestInstance reference**

The TestInstance must keep using the project reference, not the packed version:

```bash
cd src/Umbraco.Community.UmbraDesktop.TestInstance
dotnet remove package Umbraco.Community.UmbraDesktop
cd ../..
dotnet nuget remove source local-umbradesktop
git status --porcelain
```

Expected: no unintended changes to the TestInstance csproj. Revert any that appear.

- [ ] **Step 6: Commit only if something needed fixing**

If Steps 1–5 required changes, commit them with a message describing the fix. If everything passed, there is nothing to commit.

---

## Task 11: Merge to main

**Files:** none modified.

- [ ] **Step 1: Review the whole diff**

```bash
git log --oneline origin/main..HEAD
git diff origin/main..HEAD --stat
```

Expect roughly: the csproj, `Directory.Packages.props`, both lock files, `package.json`, `umbraco-package.json`, `README.md`, `LICENSE`, `.editorconfig`, `.gitattributes`, `CODEOWNERS`, both workflows, `umbraco-marketplace.json`, deleted localization scaffolds, deleted duplicate copilot file, and the design/plan docs.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feature/release_preparation
```

- [ ] **Step 3: Open a PR into `main` and confirm CI runs**

The PR is the first real exercise of `ci.yml`. Watch it: `npm test` on a runner is the most likely first-run failure (see Task 8's note). Fix forward until green.

- [ ] **Step 4: Merge once CI is green**

---

## Task 12: Repository configuration — owner-only

**These steps cannot be automated from here.** They need repository-admin and nuget.org account access. Do them in order.

- [ ] **Step 1: Make the repository public**

GitHub → Settings → General → Danger Zone → Change visibility → Public.

Until this happens, branch protection returns `403 — Upgrade to GitHub Pro or make this repository public`, and the README's logo and badge URLs do not resolve.

- [ ] **Step 2: Set the default branch to `main`**

Settings → General → Default branch. It is currently `feature/phase-2-desktop-app-model`.

```bash
gh repo edit Luuk1983/Umbraco.Community.UmbraDesktop --default-branch main
```

- [ ] **Step 3: Set description and topics**

```bash
gh repo edit Luuk1983/Umbraco.Community.UmbraDesktop \
  --description "An OS-style windowed desktop for the Umbraco backoffice" \
  --homepage "https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop" \
  --add-topic umbraco --add-topic umbraco-package --add-topic backoffice --add-topic desktop
```

- [ ] **Step 4: Delete the merged Phase-2 branch**

```bash
git push origin --delete feature/phase-2-desktop-app-model
git branch -d feature/phase-2-desktop-app-model
```

- [ ] **Step 5: Create the `production` environment**

Settings → Environments → New environment → name it exactly `production`. `publish.yml` references it.

- [ ] **Step 6: Add the `NUGET_USER` secret**

Settings → Secrets and variables → Actions → New repository secret. Name `NUGET_USER`, value your nuget.org username.

- [ ] **Step 7: Create the trusted publishing policy on nuget.org**

nuget.org → Account settings → Trusted Publishing → Add. Because `Umbraco.Community.UmbraDesktop` does **not exist on nuget.org yet**, there is no package to attach a policy to — use the package-ID-pattern form.

| Field | Value |
|---|---|
| Package owner | your nuget.org account |
| Package ID / pattern | `Umbraco.Community.UmbraDesktop` |
| Repository owner | `Luuk1983` |
| Repository | `Umbraco.Community.UmbraDesktop` |
| Workflow file | `publish.yml` |
| Environment | `production` |

- [ ] **Step 8: Apply the branch protection ruleset**

```bash
gh api -X POST repos/Luuk1983/Umbraco.Community.UmbraDesktop/rulesets \
  -f name='main protection' \
  -f target='branch' \
  -f enforcement='active' \
  -F 'conditions[ref_name][include][]=~DEFAULT_BRANCH' \
  -F 'rules[][type]=deletion' \
  -F 'rules[][type]=non_fast_forward' \
  -F 'rules[][type]=pull_request'
```

Then add the required status check in the UI (Settings → Rules → main protection → Require status checks → `build-and-test`). Adding it via the API needs the check's integration ID, which only exists after CI has run at least once — which it has, from Task 11.

- [ ] **Step 9: Verify protection is live**

```bash
gh api repos/Luuk1983/Umbraco.Community.UmbraDesktop/rulesets
```

Expected: the ruleset, `"enforcement": "active"`. A direct push to `main` should now be rejected.

- [ ] **Step 10: Verify the README renders**

Open the repo's public page. The logo and all three badges must load. If the logo 404s, check that the raw URL path matches the icon's real location.

---

## Task 13: Beta release

Proves the whole pipeline on a throwaway prerelease rather than on the 1.0 tag.

- [ ] **Step 1: Tag and push**

```bash
git checkout main && git pull
git tag v17.0.0-beta.1
git push origin v17.0.0-beta.1
```

- [ ] **Step 2: Watch the publish workflow**

```bash
gh run watch
```

Expected: every step green, including `Login to NuGet (trusted publishing)`. A failure there means the nuget.org policy does not match — recheck owner, repo, workflow filename and environment in Task 12 Step 7.

- [ ] **Step 3: Verify MinVer stamped the tag version**

```bash
gh run view --log | grep -i "17.0.0-beta.1"
```

Expected: the package version is exactly `17.0.0-beta.1` — no `-alpha` suffix and no build height.

- [ ] **Step 4: Verify the GitHub release**

```bash
gh release view v17.0.0-beta.1
```

Expected: marked **Pre-release**, with the `.nupkg` attached and auto-generated notes.

- [ ] **Step 5: Verify on nuget.org**

Wait for indexing (usually minutes), then confirm the listing shows: the icon, the README, MIT, the `[17.0.0, 18.0.0)` dependency range, and the `umbraco-marketplace` tag.

```bash
curl -s "https://api.nuget.org/v3/registration5-semver1/umbraco.community.umbradesktop/index.json" | head -c 300
```

Expected: a registration document rather than `BlobNotFound`.

- [ ] **Step 6: Install the published beta into a clean Umbraco 17 site**

The final proof. `dotnet add package Umbraco.Community.UmbraDesktop --prerelease`, grant the Desktop section, and confirm the launcher and windows work — from the real published artifact, not a local build.

---

## Task 14: Screenshots and the 1.0.0 release

- [ ] **Step 1: Capture the four screenshots**

Save as JPEGs in `docs/screenshots/`:

| Filename | Shot |
|---|---|
| `desktop_windows.jpg` | Two app windows open side by side on the navy wallpaper |
| `launcher.jpg` | The launcher: pinned favourites plus grouped tiles |
| `taskbar.jpg` | Taskbar with several running apps |
| `header_app_launcher.jpg` | The desktop icon in the backoffice header |

- [ ] **Step 2: Replace the README TODO with the gallery**

Delete the `> **TODO:** screenshots pending.` line and put in its place:

```markdown
![The desktop with two windows open side by side](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/desktop_windows.jpg)

![The launcher, with pinned favourites and grouped apps](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/launcher.jpg)
```

- [ ] **Step 3: Populate the Marketplace screenshots**

Replace `"Screenshots": []` in `umbraco-marketplace.json`:

```json
  "Screenshots": [
    {
      "ImageUrl": "https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/desktop_windows.jpg",
      "Caption": "Open your tools as real windows and place them side by side — edit on the left, watch the result on the right."
    },
    {
      "ImageUrl": "https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/launcher.jpg",
      "Caption": "A grouped launcher with pinnable favourites, so you find tools by what they do."
    },
    {
      "ImageUrl": "https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/taskbar.jpg",
      "Caption": "A taskbar for every open window — click to focus, click again to minimise."
    },
    {
      "ImageUrl": "https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/header_app_launcher.jpg",
      "Caption": "The desktop launcher sits in the backoffice header, visible only to users granted the Desktop section."
    }
  ]
```

- [ ] **Step 4: Verify every image URL resolves**

Every path must point at a file that exists — a singular/plural typo breaks an image with no error anywhere:

```bash
for f in desktop_windows launcher taskbar header_app_launcher; do
  test -f "docs/screenshots/$f.jpg" && echo "OK  $f" || echo "MISSING  $f"
done
grep -o 'docs/screenshots/[a-z_]*\.jpg' umbraco-marketplace.json README.md | sort -u
```

Expected: four `OK` lines, and every grepped path present in the list above.

- [ ] **Step 5: Commit via PR and merge**

```bash
git checkout -b docs/screenshots
git add docs/screenshots README.md umbraco-marketplace.json
git commit -m "docs: add screenshots to README and Marketplace listing"
git push -u origin docs/screenshots
```

`main` is protected now, so this must go through a PR.

- [ ] **Step 6: Confirm the images render on GitHub**

Check the public repo page. Broken images here mean broken images on NuGet and the Marketplace too.

- [ ] **Step 7: Tag 1.0.0**

```bash
git checkout main && git pull
git tag v17.0.0
git push origin v17.0.0
```

- [ ] **Step 8: Verify the stable release**

```bash
gh run watch
gh release view v17.0.0
```

Expected: the release is **not** marked pre-release, and nuget.org lists `1.0.0` as the latest stable version.

- [ ] **Step 9: Curate the release notes**

Auto-generated notes diff against the previous tag — `v17.0.0-beta.1` — so they will cover only the handful of commits since the beta rather than the whole 1.0 line. Edit the GitHub release body by hand to describe the actual v1.0 feature set, leaving the generated PR list beneath it.

---

## Appendix: verification quick reference

```bash
# Frontend
cd src/Umbraco.Community.UmbraDesktop && npm test && npm run build && cd ../..

# Package — always build first; a bare `dotnet pack` on a cold obj/ fails with
# "Manifest file at 'obj\Release\net10.0\staticwebassets.build.json' not found"
dotnet build src/Umbraco.Community.UmbraDesktop/ -c Release
dotnet pack src/Umbraco.Community.UmbraDesktop/ -c Release --no-build -o ./artifacts

# Payload sanity — these three must always hold
unzip -l ./artifacts/*.nupkg | grep -c staticwebassets/              # 17
unzip -l ./artifacts/*.nupkg | grep -cE "package-lock|backoffice/"   # 0
unzip -p ./artifacts/*.nupkg staticwebassets/App_Plugins/Umbraco.Community.UmbraDesktop/umbraco-package.json | grep version   # not "GetsGenerated"
```

**Verified end-state after Tasks 1–9** (measured 2026-08-09): 31 files total, 17 static web
assets, 0 dev files, version `1.0.0-alpha.0.98` stamped, `.snupkg` produced alongside the
`.nupkg`, `dotnet build -c Release` clean at 0 warnings / 0 errors, 76 frontend tests passing,
and `npm audit --omit=dev` reporting **0 production-dependency vulnerabilities** (the ~17 audit
findings are all devDependencies, which never ship).
