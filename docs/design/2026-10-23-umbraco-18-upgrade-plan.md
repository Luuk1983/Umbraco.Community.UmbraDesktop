# Umbraco 18 Support Plan

> **No commits.** The owner reviews one uncommitted diff per phase. Never commit, push, tag or open a
> pull request unless the owner asks in that message.

**Goal:** One source tree and one build that produce the six packages twice: once for Umbraco 17,
versioned `17.y.z`, and once for Umbraco 18, versioned `18.y.z`. Umbraco 17 keeps getting fixes and
new features throughout, and a 17 release is already planned during this work. So nothing here may
hold up or change what the 17 build ships until the owner chooses.

**Branch:** `dev/v18`, cut from `main` at `f8776c6` on 2026-10-23. It lives in parallel with `main`
and takes `main` in by merge regularly. Anything that is a no-op for the 17 build lands on `main`
early, in small pull requests (see "How this stays parallel").

**Target:** Umbraco CMS 18, GA since 2026-06-25. Today 18.2.1 is current and 18.3.0-rc is out.
Still `net10.0`. It is an STS release: security-only from 2027-03-25, end of life 2027-06-25.
Umbraco 19 is expected in Q4 2026.

Short names used below: **Host** = `src/Umbraco.Community.UmbraDesktop`, **Acc** = `.Accessories`,
**Ent** = `.Entertainment`, **Media** = `.Media`, **Arcade** = `.Services.Arcade`, **SM** =
`.Services.Media`. `bo/` is `backoffice/src/`.

## Owner decisions (2026-10-23)

1. Umbraco 17 keeps getting fixes **and features**, in parallel with this work. One build serving both
   majors is preferred, with separate NuGet packages per major.
2. A floor above `18.0.0` is acceptable if the Media manager needs a later 18 minor.
3. The 18 work is compatibility only, with no new features, so that it carries straight on to 19.
4. One tag ships both majors with the same minor and patch (D3), so the first 18 release is
   `18.<current 17 minor>.0`, not `18.0.0`.
5. The six package IDs stay the same for both majors, and the major is in the version (D1).

## Why one build is realistic

The bundle that runs in the browser contains no Umbraco code: every package's `vite.config.ts`
externalises `/^@umbraco/`. So one built bundle can serve both majors as long as the code it calls
exists on both. And **Umbraco 17.7 already sits on the same client platform as 18**:

| `@umbraco-cms/backoffice` peer | 17.0.0 | 17.7.0 | 18.2.1 |
|---|---|---|---|
| `@umbraco-ui/uui` | `^1.16.0` | `^2.0.2` | `^2.0.2` |
| `@hey-api/openapi-ts` | `^0.85.0` | `>=0.99.0` | `>=0.99.0` |
| Node / npm engines | 22.17 / 10.9 | 24.13 / 11 | 24.13 / 11 |

So the UI Library 2.0 risk is already live for 17.7 users today. The client code Umbraco 18 removed
(#21984) has a single hit here. The real divergence is on the server, and it is small: the OpenAPI
registration, plus EF Core type renames in the Arcade.

## What Umbraco 18 changes, and what of it reaches us

The sources are the [v18 breaking changes page](https://docs.umbraco.com/umbraco-cms/18.latest/get-started/upgrading-and-migrating/version-specific),
the [18.0.0 release notes](https://releases.umbraco.com/release/umbraco/Umbraco-CMS/18.0.0), and
[#21984](https://github.com/umbraco/Umbraco-CMS/pull/21984). Each item was checked against this
repository on 2026-10-23.

| Umbraco 18 change | Hits here | Handling in a dual build |
|---|---|---|
| Swashbuckle replaced by `Microsoft.AspNetCore.OpenApi`. `ISchemaIdHandler`/`SchemaIdHandler` and `IOperationIdHandler`/`OperationIdHandler` removed. `/umbraco/swagger` is now `/umbraco/openapi`, and documents are OpenAPI 3.1 | `Host/Api/Handlers/*`, registered in `Host/Composing/BackgroundJobsComposer.cs:44-45`, and the `generate-client` URL | **Per-major source**: 17 keeps the handlers, and 18 registers its own document (D5) |
| EF Core types renamed to uppercase `EF` | Arcade | Per-major source, or a per-major `global using` alias |
| `RecurringBackgroundJobBase` refined (#22966) | `ArcadeBeatenPruneJob` implements the interface directly, in the 17.0 shape | Check it compiles on 18. The 17 floor keeps the 17.0 shape |
| Deprecated client code removed (#21984) | `Media/bo/tree/bin-tree.repository.ts:27-28` (top-level `skip`/`take`, `UmbTreeRepository` observables) | Write it the way both majors accept: `paging` only |
| `MigrationBase`, `ILocalizationService`, `IFileService`, sync service methods removed | None found | None expected. Confirmed when the 18 build compiles |
| `EnableMediaRecycleBinProtection` now defaults to `true` | Acc Disk Cleanup, Media manager's bin row, restore, thumbnails of trashed items, Image Editor | Must work with the setting on **and** off, since a 17 site can turn it on too |
| `HideBackOfficeLogo` removed, `ConfigureSecurityStampOptions` not registered | Possibly TestInstance config | Per-major TestInstance settings (A4) |

`@umbraco-cms/backoffice` exports, contexts, router and the element tree are not covered by any
Umbraco list, and they are where this package is most exposed (risk register). Only a running
backoffice of each major can check them.

## Decisions

**D1. One build, two package sets, selected by one MSBuild property.** `UmbracoMajor` (17 or 18)
picks:

- the Umbraco package versions and ceiling;
- the version major (D3);
- a `UMBRACO_17` / `UMBRACO_18` compilation symbol;
- the per-major source folders.

The six package IDs stay the same, and the major is in the version: `Umbraco.Community.UmbraDesktop`
`17.y.z` for Umbraco 17 and `18.y.z` for Umbraco 18. This is the convention Umbraco's own packages
follow, so the Marketplace shows one listing that supports both.

Restore output must not collide between majors, so `src/Directory.Build.props` sets:

- `BaseIntermediateOutputPath` to `obj/umbraco$(UmbracoMajor)/`;
- `OutputPath` likewise;
- `NuGetLockFilePath` to `packages.umbraco$(UmbracoMajor).lock.json`.

The existing lock files become the 17 ones. The default stays `17` until the owner flips it, so
Visual Studio, `main`'s workflows and the planned 17 release behave exactly as today.

The alternative was a `v17/main` branch with cherry-picks, which is what `ci.yml`'s `**/main` filter
was written for. It is kept only as the fallback if Phase 0 finds the majors diverge too far. With
17 getting features, every feature would otherwise be built twice.

**D2. Major-specific code lives in one place per package, never scattered.**
- C#: `Compat/Umbraco17/` and `Compat/Umbraco18/` folders, each compiled only for its major
  (`<Compile Remove>` by condition). Write `#if UMBRACO_18` only where a folder would be absurd.
- TypeScript: the bundle is shared, so differences are found at runtime. Feature-detect first (does
  the export, element or context exist?). Compare version numbers only as a last resort, through
  `UMB_SERVER_CONTEXT`. Each package keeps every such branch in one `bo/umbraco-compat.ts`.

The reason is the day 17 is dropped. That should be a matter of deleting two folders and one module
per package, not a hunt through the codebase.

**D3. One tag, both majors, the same minor and patch.** A tag `v17.Y.Z` builds `17.Y.Z` and
`18.Y.Z`. MinVer computes the version from the tag as today. A target running `AfterTargets="MinVer"`
then sets `Version`/`PackageVersion` to `$(UmbracoMajor).$(MinVerMinor).$(MinVerPatch)` plus the
prerelease, and `SyncUmbracoPackageVersion` stamps that rather than `$(MinVerVersion)`.

So `17.5.0` and `18.5.0` are the same features, which is the promise that lockstep within a release
already makes across the six packages (D13), extended across majors. The first 18 release is
therefore `18.<the 17 minor of that day>.0`, not `18.0.0`. RELEASE.md says otherwise today and
changes with this.

A property `UmbraDesktopUmbraco18PreRelease` (for example `rc.1`) lets 18 ship as a prerelease
from the same tag that ships 17 stable, until 18 is trusted.

The tag scheme and `publish.yml`'s `v*.*.*` trigger stay as they are. Separate tag prefixes per
major were considered and rejected: two tags for one commit, and MinVer on either line would see the
other's tags.

**D4. Floors.** The 17 floor stays `17.0.0`, and the 18 floor is `18.0.0` (settled in Phase 0, see
its findings). The Media add-on leans on behaviour first measured on 17.7, and the view memory only
reaches 18 in 18.2. But the add-on already falls back without it, as it must on 17.0. So Phase D
proves that fallback on a real 18.0.x and 18.1.x rather than raising the floor.

NuGet compiles against a range's floor, while npm's caret resolves to the latest, so CI tests both
ends (Phase A).

**D5. OpenAPI: both majors must produce the same client.** There is one generated TypeScript client
(`Host/bo/api/*.gen.ts`, bundled) for both majors. So the 18 document must yield exactly the
operation IDs and schema names that the 17 handlers produce:

- **17:** keeps `PackageOperationIdHandler` and `PackageSchemaIdHandler`, moved to `Compat/Umbraco17/`.
- **18:** registers an `umbradesktop` backoffice document (`AddBackOfficeOpenApiDocument`) in
  `Compat/Umbraco18/`:
  - `ShouldInclude` matches the host's own controllers only. The old handlers' namespace prefix also
    caught the Acc and Arcade controllers.
  - An `IOpenApiOperationTransformer` keeps the action-name operation IDs.
  - `CreateSchemaReferenceId` names our schemas, with a namespace check that falls back to the
    default.
  - Add the `InterceptorsNamespaces` csproj line, which is harmless on 17.

A C# test runs in both majors and asserts the same expected list of operation IDs and schema names.
That test is the contract. Upgrading `@hey-api/openapi-ts` to `>=0.99` is needed for 17.7 anyway
(the Host lock is still on 17.6), so it lands on `main` first.

## How this stays parallel

- **Lands on `main` early**, each as its own small pull request, each proven a no-op for the 17
  packages by diffing the packed nuspecs and file lists before and after:
  - the `UmbracoMajor` property and the per-major `obj`/lock paths;
  - the version target (D3);
  - Node 24 in CI;
  - `@hey-api/openapi-ts >=0.99`;
  - moving the handlers to `Compat/Umbraco17/`;
  - the `bin-tree.repository.ts` paging fix.
- **Stays on `dev/v18`** until the 18 build is green: `Compat/Umbraco18/`, the 18 package versions,
  the 18 CI job, and any `umbraco-compat.ts` branches.
- **`main` into `dev/v18`** by merge at least weekly, and always right after a 17 release. A 17
  feature that touches a risk-register area should be tried on the 18 TestInstance before its pull
  request merges, once Phase C has one running.
- **No 18 package is published** until Phase E. CI builds the 18 set from Phase A onwards, but only
  as an artifact.

## Risk register

These are runtime risks, invisible to `tsc`. Each now needs checking on **both** majors.

1. **Shell surgery** (Host): `desktop/chrome-injector.ts`, which hides the header and sidebar,
   positions `umb-section-main`, and walks `umb-section-main-views` → `umb-body-layout` shadow roots.
   Also `components/desktop.element.ts:453`, `frame-watches.ts:166`, `beside/frame-views.ts:14-110`
   (`umb-router-slot` → `router-slot` children) and `notifications/notification-watcher.ts`.
2. **Router and history**: boot `pushState` and `navigationend` (`entrypoints/entrypoint.ts`,
   `boot/router-ready.ts`, `boot/boot-decision.ts`), and the synthetic `popstate` in
   `components/window.element.ts:674`. Also `beside/*` router events, Media's `willchangestate`
   guard, and `desktop/url-inference.ts` ("confirmed against the v17 router").
3. **The context protocol at the event level**: `'umb:context-request'` / `-provide` / `-unprovided`
   and token-string parsing (`frame-context.ts`, `host-desktop.ts`, `progress/upload-watcher.ts`,
   Media `upload/upload-watch.ts`). Also the `Symbol.hasInstance` patch on `UmbModalToken`
   (`beside/bridge.ts:128`).
4. **Media add-on on core internals**: collection cards and table rows, tree `#caret-button`, the
   dropzone, the stand-in `'UmbWorkspaceContext'` (`manager/folder-context.ts`), and the
   `UmbCollectionCurrentView` key. Twelve comments in Media name 17.7 behaviour.
5. **Hard-coded core aliases** (`Umb.Section.*`, `Umb.CollectionView.Media.Table`,
   `Umb.WorkspaceAction.Document.Save`, `Umb.Dashboard.*` and others) in `desktop/catalogue/*`,
   `remote-viewer/*` and `search/umbraco-sources.ts`. A rename makes an app silently vanish from the
   launcher. The catalogue already carries both majors' surfaces side by side (Deploy, Advanced
   Permissions, Automate), which is the pattern to keep. The v17 entries stay.
6. **The remote viewer across majors**: a 17 site connecting to an 18 site, and the other way round.
   `remote-viewer.model.ts:42-68` checks major.minor, and `route-request.ts` rewrites management,
   SignalR hub and `v1/` paths. Now that both majors are first-class, decide whether cross-major
   connections are allowed (the more useful answer), and test both directions.

## Phase 0: spike (one day, throwaway, on a scratch branch off `dev/v18`)

- [ ] Baseline: `npm run build` and `npm test` in all six packages, and the four `*.Tests.csproj` by
      project file. Record that it is green.
- [ ] **Server divergence.** Point the C# projects at Umbraco 18 by hand and list every compile error.
      If the list goes well beyond the OpenAPI handlers and the EF renames, stop and bring it to the
      owner: D1 is then in question.
- [ ] **Client divergence.** In each package, run `npm install --no-save --legacy-peer-deps
      @umbraco-cms/backoffice@18`, then `tsc` and `npm test`. List the failures.
- [ ] **OpenAPI.** Boot an 18 TestInstance and confirm D5 is buildable: what the default management
      document contains, and whether a custom document with our names validates.
- [ ] **Runtime.** Open the desktop on 18 and log what breaks against risks 1 to 6, in order.
- [ ] **D4.** Run the Media manager on 18.0.x, then on each later minor, until drag, view memory and
      upload all work.
- [ ] **Aliases.** Dump `umbExtensionsRegistry` aliases from both majors to JSON, and diff them
      against every `Umb.*` alias the catalogues and conditions name.

**Output:** a findings section appended here. It confirms D1 (or falls back to `v17/main`), fixes the
18 floor, and turns risks into tasks or strikes them off.

## Phase 0 findings (2026-10-23)

Run in a separate worktree, `D:\UmbraDesktop-v18-spike` (branch `spike/v18-phase0`), with SDK
10.0.402 pinned to match CI. Measured against Umbraco 17.7.1 and 18.2.1 in the test instances, and
against each major's floor (17.0.0, 18.0.0) in the C# tests. **D1 holds: one source tree builds,
tests and runs on both majors.** The spike's diff is the starting point for Phases A to C.

### Baseline (17, unchanged code)

- [x] All six `npm ci`, `npm run build` and `npm test` runs, and all four `*.Tests.csproj`, pass except one test.
      That test is `Entertainment/…/tray-cup.element.test.ts:240` ("steams while live"), which fails on any machine whose OS turns animations off.
      The steam animates only under `prefers-reduced-motion: no-preference` (`coffee-icon.ts:46`), so the product is right and the test assumes a motion preference. **A test bug, already present.** Fix it by emulating the media feature in the test.
- [x] **Already present: `Accessories.Tests/packages.lock.json` is stale.** It lacks the `Services.Media` project reference that Accessories gained, and any restore rewrites it.
- [x] **Already present: a fresh clone's TestInstance cannot boot.** `appsettings.Development.json` attaches `umbraco\Data\Umbraco.mdf` through LocalDB, and nothing creates that file.
      Create it once with `sqlcmd -S "(localdb)\MSSQLLocalDB" -Q "CREATE DATABASE [X] ON (NAME=N'X', FILENAME=N'<dir>\Umbraco.mdf') LOG ON (NAME=N'X_log', FILENAME=N'<dir>\Umbraco_log.ldf'); EXEC sp_detach_db N'X';"`, then the unattended install runs.
      Write this down in the developer docs.

### Server (C#)

- [x] **Compiling against 18 found exactly what the plan predicted, and two warnings.**
      - The two OpenAPI handlers (CS0246).
      - Two calls that are obsolete from 18, "scheduled for removal in Umbraco 19": `AddUmbracoDbContext`'s four-argument overload (`ArcadeComposer.cs`) and `IMediaSearchService.SearchChildrenAsync(filter, key, ordering, skip, take)` (`MediaPlaceListViewService.cs:78`).
        Both still behave the same on 18. The spike suppresses CS0618 at those two calls only. **B2/B3: move both to the new overloads (the new overload only in an 18 build) before a 19 build exists.**
      - Nothing else: no `ILocalizationService`, `IFileService`, `MigrationBase` or EF rename hits.
- [x] **All 366 C# tests pass on both majors.**
- [x] **D5 is built and verified.**
      - `Compat/Umbraco17/OpenApiComposer.cs` holds the old handlers.
      - `Compat/Umbraco18/OpenApiComposer.cs` registers an `umbradesktop` backoffice document. It includes this assembly's `ManagementApiControllerBase` controllers only: the anonymous web app manifest controller is in the same assembly and must stay out.
      - On a running 18 site, `/umbraco/openapi/umbradesktop.json` (OpenAPI 3.1.1) has the 12 operations with **exactly** the 17 operation IDs, and 12 schemas whose names all match `types.gen.ts`. One generated client serves both majors.
      - **The `InterceptorsNamespaces` csproj line was not needed**: the package never calls `AddOpenApi` itself.
- [x] **New: the add-ons broke Umbraco 18's own management OpenAPI document.**
      - `/umbraco/openapi/management.json` returned 500: `ArgumentException: An item with the same key has already been added. Key: 403` in Umbraco's `BackOfficeSecurityRequirementsTransformer`.
      - The cause is `[ProducesResponseType(StatusCodes.Status403Forbidden)]` on `StickyNotesController` (5) and `ArcadeController` (11). Every `ManagementApiControllerBase` controller lands in the management document, and Umbraco 18 adds 401/403 itself.
      - The spike removed the 16 attributes. They are documentation only and change no behaviour. The document now returns 200 with every UmbraDesktop route in it, as on 17.
      - Worth reporting upstream: the transformer should not throw on an operation that already declares 403.
- [x] The Arcade's EF Core tests need `Microsoft.EntityFrameworkCore.Sqlite` at Umbraco 18's EF version (10.0.7). At 10.0.0 restore fails with NU1605. Per-major property `UmbraDesktopEFCoreVersion`.

### Build plumbing (D1), as built in the spike

- `UmbracoMajor` comes from, in order:
  1. a global property;
  2. a solution named `*.v18`, through `$(SolutionName)`;
  3. a project named `*.v18`;
  4. the default, 17.
- 18's `BaseIntermediateOutputPath`, `BaseOutputPath` and `NuGetLockFilePath` get a `umbraco18` suffix. 17 keeps every default, so its build is untouched.
- `DefaultItemExcludes` takes all of `obj\**` and `bin\**`. Without that, an 18 build compiled the 17 build's generated `AssemblyInfo.cs` and failed with CS0579, but only once 17 had been built in the same checkout.
- `StaticWebAssetsAdditionalBuildProperties` (and the publish counterpart) is `UmbracoMajor=$(UmbracoMajor)`. The static web assets SDK rebuilds referenced projects with only what they declare there, not the reference's `AdditionalProperties`. Without it, the 18 instance looked for its packages' manifests in the 17 `obj\` folder.
- **`Umbraco.Community.UmbraDesktop.TestInstance.v18`**, the Umbraco 18 test instance:
  - Same site, own database, ports 44368/60238. 44358 is taken on this machine by another project.
  - Its `ProjectReference`s pass `AdditionalProperties="UmbracoMajor=18"`, and it sets `RestoreUseStaticGraphEvaluation`. The default restore ignores `AdditionalProperties` and restored the packages as 17 (NU1107).
  - Two starter-kit views needed `Children` → `Children()` and one `Parent` → `Parent()`, which Umbraco 18 removed as properties.
  - The Workflow, Commerce and Deploy migrations all ran clean on a fresh install.
- **Two solution files**:
  - `Umbraco.Community.UmbraDesktop.app.slnx` is everything as 17, with the 17 instance.
  - `Umbraco.Community.UmbraDesktop.app.v18.slnx` is everything as 18, with the v18 instance and the test projects.
  - Both build clean from the command line.
  - Visual Studio evaluates and restores each project once per solution, ignoring `AdditionalProperties`. So the v18 instance cannot share a solution with the 17 one, which is what the `SolutionName` rule is for. **Not yet opened in Visual Studio itself.**
- Each instance refuses the wrong major with an error. The 17 instance built as 18 would upgrade its database to a version 17 cannot open.
- Each output resolves as intended: 17 instance 17.7.1, v18 instance 18.2.1, C# tests 17.0.0 and 18.0.0, which is the floors.

### Client (TypeScript)

- **The CI swap must install peers.** `npm install --no-save --legacy-peer-deps @umbraco-cms/backoffice@18` pruned the peers and produced 160 phantom type errors and unloadable test modules.
  `npm install --no-save @umbraco-cms/backoffice@18` (plus `@hey-api/openapi-ts@^0.99` in the host) is the right form. Also, the packages resolve different UUI versions (2.0.2 vs 2.1.1). Align them in A4.
- [x] **Five type errors against 18, in three files, all from #21984.** All fixed in the spike by dropping usages 17 already marks deprecated, so they are valid on both:
      - `Services.Media/…/media-save.ts:363`: `entityType` on a value ("we do not use entityType on values anymore").
      - `Media/…/folder-tree.repository.ts:131-132` and `bin-tree.repository.ts:28`: tree `skip`/`take` (deprecated since 16.3), now `paging` only.
      - `bin-tree.repository.ts`: empty pages also carry `totalBefore`/`totalAfter`, which 18's `UmbTargetPagedModel` requires.
- [x] **Against 18.2.1: `tsc` passes in all six packages, and 5,083 of 5,085 tests pass.**
      - One failure is the reduced-motion test above.
      - **New: `window-app-dirty.test.ts:130`**, "picks up an app that was already marked", fails deterministically.
        The probe shows the host mounting twice: the test's pre-marked app reports `true`, then the window re-renders and remounts its own clean app, which reports `false`.
        Probably fragility (the test swaps the host's app behind the window's back), but 17 does not re-render there, so **C2: find what re-renders a window on 18**. An extra render per window would also be visible as flicker.
- [x] The three fixes rechecked against 17.5.3, the version those two packages lock: `tsc` passes, and all 782 tests in Media and Services.Media pass.

### Runtime (both instances, driven by `puppeteer-core` and the local Chrome)

- [x] **On 18 the desktop works**:
      - the welcome wizard (styled correctly under UUI 2);
      - the desktop and taskbar;
      - windows: Content editor, and the Media library through the Media add-on;
      - the launcher.
      Inside every window frame Umbraco's header is hidden and the section sidebar and main are laid out exactly as on 17 (risk 1). The router-driven boot into `/section/umbradesktop` works (risk 2).
- [x] **Aliases (risk 5): none missing.** Every core alias the code names is still registered on 18.
      Models Builder, Webhooks and Engage configuration *looked* gone from the launcher, but were below the fold: Advanced Security's group is taller on 18. A diff of every rendered tile confirms the only differences are the expected ones:
      - Deploy's v17 dashboards → its v18 menu items;
      - Advanced Security's element-type and library items;
      - Umbraco 18's new **Library** section, which the launcher picks up without a catalogue change.
- [x] **New, C4:** the Workflow tile's name is the unresolved key `#workflow_workflow` on 18 ("Workflow" on 17). Workflow 18 labels its section with a localization key the catalogue does not resolve; give the entry its own name.
- [x] **Resolved, not ours:** the message-less `pageerror` when the Media library opens on 18 is a
      promise rejected with a plain string in **Umbraco Workflow 18**'s `approval-group` manifest code
      (`hostConnected`). It fires the same way in the plain backoffice's Media section, with no desktop.
- Console noise that is **not ours**:
  - token 400s during a scripted login (both majors);
  - Workflow 17's SignalR hub 404;
  - Workflow 18's duplicate custom element `workflow-table-name-column-layout`.

### D4, the 18 floor

The collection view's `interactionMemory` that the Media manager's view switch uses is **absent in 18.0 and 18.1 and present from 18.2**, as in 17.7. `onUpload` is deprecated from 18.1.

But the Media add-on already feature-detects `interactionMemory` and falls back to the pre-17.7 path (`manager/view-switch.ts`), the same one it takes on 17.0–17.6. So **the floor can stay `18.0.0`**. Phase D must run the Media manager on a real 18.0.x and 18.1.x backoffice, to see the fallback actually work there.

### Not done in Phase 0

- The remote viewer across majors (risk 6).
- Recycle bin protection (B4).
- The upgrade-in-place run.
- A visual pass of the five themes (C3).
- Opening the two solutions in Visual Studio.

All of these are in the phases below as written.

## Progress after Phase 0 (2026-10-23)

The spike's changes are on `dev/v18`, minus what the instances' first boots wrote. Then:

- **A1/A2 (D3, versioning).** The MinVer settings, the `SetJsonVersion` task and
  `SyncUmbracoPackageVersion` are defined once, in `src/Directory.Build.props` and `.targets`, instead
  of six times. The new `UmbraDesktopVersion` target gives an 18 build the tag's minor, patch and
  prerelease under major 18, and `UmbraDesktopMajorPreRelease` adds a prerelease to one major only.
  - **17 is untouched:** packing all six as 17 before and after gave identical nuspecs and file lists.
  - With `MinVerVersionOverride` standing in for a tag: `v17.4.0` packs `17.4.0` and `18.4.0`;
    `rc.1` gives `18.4.0-rc.1`; `v17.5.0-beta.2` gives `18.5.0-beta.2`.
  - Ranges follow: the add-ons get `[18.4.0, 18.99999999.0]` and Umbraco `[18.0.0, 18.99999999.0]`.
  - Assembly, file and informational versions follow too, and every packed `umbraco-package.json`
    carries its own package's version.
- **A5 (CI).** The build action takes `umbraco-majors`. It defaults to `17`, which is what
  `publish.yml` still uses. It builds, tests and packs each major in turn, never two at once, since
  both stamp the same file. Its checks are per major, and a new one requires each packed
  `umbraco-package.json` to match the package's version.
  - The checks and the gather step were run locally on real 17 and 18 packs: they pass, and they fail
    on an 18 add-on put in the 17 set.
  - `ci.yml` builds both sets, both solutions, and every frontend against the 18 backoffice. It now
    also runs on pull requests into `dev/**`.
- **B1 (D5).**
  - `Tests/Api/OpenApiContract.cs` lists the generated client's 12 operation IDs and 12 schema names,
    and checks that list against the controllers and models themselves.
  - `Compat/Umbraco17/OpenApiNamingTests.cs` and `Compat/Umbraco18/OpenApiNamingTests.cs` hold each
    major's naming to the list.
  - Breaking the 18 inclusion rule on purpose failed the manifest test.
- **B3.** Each 17-era workaround was checked against 18's source or assemblies, and its comment now says
  which majors it covers. One fact had gone stale: from late 17 and in all of 18 there *is* a
  `RecurringBackgroundJobCanceledNotification`. It is raised only for a run cut short by shutdown, so
  handling four notifications still holds; the comments say so now.
- **B4, on 18 with protection on.**
  - Our paths work: the signed-in session reads a trashed file at its `.deleted` path, the bin
    counts are right, and restore returns the original URL.
  - **Found in Umbraco, worth reporting upstream:** on Windows the rename is a copy and a delete. When
    the file is still held, for example by image processing a moment earlier (`Failed to rename media
    file`, `IOException: … being used by another process`), the delete fails and the original stays
    public beside the protected copy. The Media manager shows thumbnails right before people trash
    things, which makes this likelier.
  - Not yet run with protection off, or on 17 with it on.
- **C2.** The failing `window-app-dirty.test.ts` case was the test, not the product. It swapped the
  host's app behind the window. On 18 the window renders again, and Lit re-commits a class bound as a
  property on every render (it only compares primitives), so the window's app came back. The test now
  opens a pre-marked app in a window of its own. It passes, and fails when the host's immediate report
  is removed. The Media library error is Workflow 18's (above).
- **C4.** The Workflow section names itself (`#umbraDesktop_appWorkflow`), test first.
- **C5.** Nothing to change: no test asserts a 17-only version string that 18 breaks.
- **Docs.**
  - New developer page: Building for Umbraco 17 and 18 (`docs/developer/umbraco-versions.md`), including
    the LocalDB file a fresh clone needs.
  - RELEASE.md's versioning and ceiling paragraphs are corrected.
  - CLAUDE.md names the 18 instance and asks for both majors to be checked.

**Left:**
- B2: move the two obsolete calls to their new overloads before a 19 build.
- B4 with protection off, and on 17.
- B5: the remote viewer across majors.
- C3: a visual pass of the five themes on 18.
- Phase D: fresh installs at both floors, including the Media manager's fallback on 18.0 and 18.1,
  and an upgrade in place.
- Phase E: README lines, `publish.yml` publishing both sets, and the first 18 release.

## Phase A: dual build infrastructure (lands on `main`, a no-op for 17)

- [x] **A1** In `src/Directory.Build.props`:
      - `UmbracoMajor`, defaulting to `17`, and `UMBRACO_$(UmbracoMajor)` in `DefineConstants`.
      - Per-major `BaseIntermediateOutputPath`, `OutputPath` and `NuGetLockFilePath`; rename the
        existing locks to the 17 names.
      - `UmbraDesktopUmbracoMajorCeiling` derived as `$(UmbracoMajor).99999999`.
      - The MinVer settings moved here from the six csproj files. RELEASE.md says they are "repeated
        verbatim … no shared props file"; there is one now.

      Prove it: `dotnet pack` before and after with no property set, and diff the nuspecs and file
      lists. They must be identical.
- [x] **A2** The version target (D3), with tests: a tag `v17.4.0` packs as `17.4.0` with
      `UmbracoMajor=17` and as `18.4.0` with `18`, and its `umbraco-package.json` carries the same
      number. Also set the prerelease property and check it. Stamping writes into the shared
      `wwwroot`, so the two majors are packed **one after the other, never in parallel**, in one
      checkout. Write that into `build-packages`.
- [x] **A3** In `src/Directory.Packages.props`, give the Umbraco ranges and every TestInstance package
      one `ItemGroup` per major, by `Condition`:
      - **17:** today's entries.
      - **18:** `[<D4 floor>,$(Ceiling)]` for the five Umbraco references. The test instance takes
        `18.*` for `Umbraco.Cms`, uSync and the seven commercial packages, and `18.0.0` for the
        StarterKit.
      - **18, pinned:** AdvancedPermissions `18.2.0`, and stable AI 18 (`Umbraco.AI 18.6.0`,
        `.Agent 18.4.0`, `.Agent.UI 18.3.0`, `.Agent.Copilot.Workspace 18.2.0`, `.Anthropic 18.1.3`),
        re-checking their mutual ranges.
      - **Both:** EF Core `Design`/`Sqlite` at whatever the major's Umbraco resolves.
- [x] **A4** TestInstance per major:
      - A database file per major (`Umbraco.umbraco17.sqlite.db` …), because a database upgraded to 18
        can never boot 17 again.
      - Per-major `appsettings` where they differ (for example `HideBackOfficeLogo`).
      - ModelsBuilder models regenerated for 18, if they differ.
- [x] **A5** CI:
      - Node `'24'` everywhere.
      - `build-packages` builds the frontends once, then packs each major in turn. The ceiling check
        runs per major against that major's ceiling, and twelve packages come out.
      - `ci.yml` gets an Umbraco matrix (17, 18) for the solution job, and for a client job that swaps
        the backoffice version in (`npm install --no-save --legacy-peer-deps
        @umbraco-cms/backoffice@<major>`) before `tsc` and `npm test`.
      - `publish.yml` stays 17-only until Phase E.
      - Add a local `npm run check:umbraco18` doing the same swap, so a 17 feature can be checked
        against 18 before it merges.

Exit: `main` builds the same 17 packages as before. CI also builds the 18 set, and it is allowed to
be red until Phase C.

## Phase B: server

- [x] **B1** OpenAPI per D5. Write the contract test first and watch it fail on 18. Then point
      `generate-client` at the 17 document as today (the client is generated once, from either
      major, since both must match), and add a CI check that regenerating from 18 changes nothing.
- [ ] **B2** Arcade:
      - Handle the EF renames per D2.
      - Re-check the `AddUmbracoDbContext` overload (`ArcadeComposer.cs:14-20`) on both majors.
      - Prove an upgrade: a 17 database with Arcade scores boots on 18, and the scores survive.
- [x] **B3** The 17-era workarounds stay, because 17 is still built:
      - `DesktopUserDataCleanupHandler`;
      - the `MaximumExecutionTime` config read, the delay and the reclaim guard in
        `BackgroundJobReportService`;
      - `MediaPlaceListViewService`'s per-item authorisation;
      - `WebAppManifestController:27`;
      - `AppIconSetFactory:88`.

      For each one, confirm it is still correct on 18 and update its comment to say which majors it
      covers. Only split one into `Compat/` if 18 needs different behaviour.
- [ ] **B4** Media recycle bin protection, with the setting on and off, on both majors:
      - Disk Cleanup's counts and empty.
      - The manager's bin row.
      - Trash and restore, including that the file's URL works again after restore.
      - Thumbnails of trashed items.
      - The Image Editor on a trashed image.
- [ ] **B5** Remote viewer (risk 6): implement the cross-major decision, check the C# management paths
      (`DesktopConnectionStatusService:67,74`, `DesktopConnectionTokenProvider:43`), and test all four
      combinations: 17→17, 17→18, 18→17 and 18→18.

Exit: the four `*.Tests.csproj` green under both majors, each run by its project file.

## Phase C: client

- [x] **C1** Make `tsc` pass against both `^17` and `^18` in all six packages:
      - The known fix is `bin-tree.repository.ts`.
      - Re-transcribe `Host/bo/desktop/ai/ai.extension.ts` from the AI release A3 picks. Its types may
        differ between AI 17 and 18; if so, type it as the union.
      - Confirm `SM/bo/file-menu/deps.ts:74` still never calls `requestThumbnailUrls`.
- [ ] **C2** Fix risks 1 to 5 from the Phase 0 findings, each behind feature detection in
      `umbraco-compat.ts` (D2). Each fix starts as a failing test where the harness can express it,
      and names the manual check that proves it in each major. Update the comments that cite a single
      version ("measured on 17.7") to list what was measured on both.
- [ ] **C3** All five themes on 18: the launcher, taskbar, window chrome, a dialog, notifications, the
      Media manager table and grid, and each Ent and Acc app. Measure the constants shared between CSS
      and JS (`theming.md` §4) again, and check that no affordance disappears. UUI 2 already reached
      17.7, so this is mostly a check that 18 adds nothing new. Compare against a 17.0 backoffice too,
      since the same bundle still has to look right on UUI 1.
- [x] **C4** Catalogue: apply the alias diff from Phase 0, adding 18 surfaces beside the 17 ones.
      Confirm Automate's v18 section path (`catalogue/automate.ts:12`), and check the AI tools against
      AI 18.
- [x] **C5** Version-string fixtures: `Acc system-info/*.test.ts`, `Host help/help-links.test.ts:68`,
      `catalogue/commercial.test.ts:139-149`, `.Tests/BackgroundJobs/RecurringJobActivityHandlerTests.cs:22`.

Exit: `npm run build` **and** `npm test` green in all six packages under both backoffice versions.

## Phase D: verification on a real backoffice, per major

On the Windows TestInstance, or on Linux per `docs/design/2026-09-24-accessories-design.md` §9.

- [ ] **Fresh install** on 17.0, latest 17, the 18 floor and latest 18. Work through:
      - booting into the desktop;
      - every app in the launcher, under every theme;
      - the welcome wizard, and Help and its links;
      - the AI Copilot window;
      - a live preview, and a workspace view beside;
      - the unsaved and overwrite guards;
      - the background jobs dashboard.
- [ ] **Upgrade in place**:
      1. Start from a 17 site with UmbraDesktop 17.Y holding Arcade scores, sticky notes, desktop user
         data, connections and a trashed media item.
      2. Upgrade Umbraco to 18 and UmbraDesktop to 18.Y.
      3. Check everything comes across, and the trashed item behaves under B4.
- [ ] Pack both sets. Check that `build-packages` reports each add-on's ranges as
      `[17.Y.Z, 17.99999999.0]` and `[18.Y.Z, 18.99999999.0]` respectively.

## Phase E: docs and the first 18 release

- [ ] Per the Definition of done:
      - The four READMEs say "Umbraco 17 or 18, and .NET 10", one line each (`README.md:37`,
        Acc `:25`, Ent `:28`, Media `:28`).
      - `docs/user/getting-started/installation.md`.
      - The pages that name 17 only: `umbraco-ai.md`, `overwrite-protection.md`,
        `commercial-packages.md`, `accessories.md`, `games.md`, `window-progress.md:113`,
        `add-on-help.md:35`, `theming.md:184`, and Arcade's `putting-your-game-on-the-arcade.md:136`.
      - A developer page on the dual build: `UmbracoMajor`, `Compat/`, `umbraco-compat.ts`, and how to
        check a change against the other major.
      - The dated design docs stay as history.
- [ ] `RELEASE.md`:
      - Twelve packages from one tag, and the version rule (D3).
      - The ceilings per major.
      - "Every add-on requires this release of the host" now applies within each major.
      - Pack the majors sequentially.
      - The trap examples updated (`[18.0.0,19.0.0)` admits 19's prereleases).
- [ ] Marketplace files: no change. Neither has a version field, and the Marketplace detects support
      from the NuGet dependencies. After the first stable 18 release, check that the listings show
      both 17 and 18.
- [ ] `publish.yml` publishes both sets. The first tag after `dev/v18` merges ships 17 stable and
      18 as `-rc.1` (D3's prerelease property). The next one drops the prerelease once Phase D holds.

## Open questions for the owner

None. All were settled on 2026-10-23 (see "Owner decisions"). New ones will come from the Phase 0
findings.
