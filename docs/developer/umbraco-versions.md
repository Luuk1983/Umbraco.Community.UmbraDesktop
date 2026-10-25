---
id: umbraco-versions
title: Building for Umbraco 17 and 18
description: How one source tree builds the packages for Umbraco 17 and for Umbraco 18, how to run and test either, and where code that only one major accepts goes.
sidebar_position: 10
---

# Building for Umbraco 17 and 18

UmbraDesktop ships the same packages for two Umbraco majors from one source tree. The packages have
the same IDs and differ by version: `17.Y.Z` is for Umbraco 17 and `18.Y.Z` for Umbraco 18, with the
same features. Why it is built this way, and what it took, is in the
[upgrade plan](../design/2026-10-23-umbraco-18-upgrade-plan.md).

## Which major a build is for

One MSBuild property, `UmbracoMajor`, decides. It comes from the first of these that applies:

1. `-p:UmbracoMajor=18` on the command line.
2. A solution named `*.v18`. Everything in `Umbraco.Community.UmbraDesktop.app.v18.slnx` builds for 18.
3. A project named `*.v18`, such as the Umbraco 18 test instance, when it is built on its own.
4. Otherwise 17.

It picks the Umbraco packages and their version range, the package version's major, and the
`UMBRACO_17` or `UMBRACO_18` compilation symbol. An 18 build keeps its restore and build output in
`obj\umbraco18\` and `bin\umbraco18\`, and its lock file is `packages.umbraco18.lock.json`, so the two
majors can be built in one checkout without touching each other.

## Running a test instance

There is one per major, each with its own database and ports:

| Major | Project | Solution |
| --- | --- | --- |
| 17 | `Umbraco.Community.UmbraDesktop.TestInstance` | `Umbraco.Community.UmbraDesktop.app.slnx` |
| 18 | `Umbraco.Community.UmbraDesktop.TestInstance.v18` | `Umbraco.Community.UmbraDesktop.app.v18.slnx` |

Each refuses to build for the other major: a database Umbraco 18 has upgraded cannot be opened by 17.
In Visual Studio, open the solution for the major you want. Visual Studio restores every project once
per solution, which is why the two instances are in different solutions.

Both expect a SQL Server LocalDB database file at `umbraco\Data\Umbraco.mdf` in the instance's
folder, and the first boot fails with "A connection string is configured but Umbraco could not connect
to the database" when there is none.

To create the file for a fresh clone, run this once from the instance's folder, with a database name
of your choosing:

```bash
sqlcmd -S "(localdb)\MSSQLLocalDB" -Q "CREATE DATABASE [UmbraDesktopDev] ON (NAME=N'UmbraDesktopDev', FILENAME=N'%CD%\umbraco\Data\Umbraco.mdf') LOG ON (NAME=N'UmbraDesktopDev_log', FILENAME=N'%CD%\umbraco\Data\Umbraco_log.ldf'); EXEC sp_detach_db N'UmbraDesktopDev';"
```

The next boot installs Umbraco unattended into it.

Both can run at once, the 17 instance on `https://localhost:44356` and the 18 one on
`https://localhost:44368`, but not in one browser profile: cookies are kept apart by host, not by
port, so signing in to one signs the other out. Use a browser profile for each.

## Checking a change against both majors

- **C#.** Run each test project for both majors, by its project file:

  ```bash
  dotnet test src/Umbraco.Community.UmbraDesktop.Tests/Umbraco.Community.UmbraDesktop.Tests.csproj -p:UmbracoMajor=17
  dotnet test src/Umbraco.Community.UmbraDesktop.Tests/Umbraco.Community.UmbraDesktop.Tests.csproj -p:UmbracoMajor=18
  ```

  The tests compile against each major's lowest supported Umbraco, 17.6.0 and 18.1.0.
- **TypeScript.** The lock files hold the Umbraco 17 backoffice. To check a package against 18, swap
  the 18 backoffice in, then type-check and test, from the package's folder:

  ```bash
  npm install --no-save @umbraco-cms/backoffice@18
  npx tsc --noEmit -p backoffice
  npm test
  ```

  In the host package, add `@hey-api/openapi-ts@^0.99` to the install, or npm refuses it. Do not add
  `--legacy-peer-deps`: it removes the backoffice's peer packages, and the type check then fails on
  types it cannot find. Run `npm ci` afterwards to go back to 17.

CI runs all of this on every pull request: both package sets, both solutions, and every frontend
against the 18 backoffice.

## Code that only one major accepts

Put it in a `Compat/Umbraco17/` or `Compat/Umbraco18/` folder in its project. Each folder is compiled
only into its own major's build, by a rule in `src/Directory.Build.targets`. When a major is dropped,
its folders are deleted and nothing else changes. Use `#if UMBRACO_18` only where a whole file would
be absurd.

The example is the OpenAPI naming. Umbraco 17's is in Swashbuckle handlers, in
`Compat/Umbraco17/`. Umbraco 18 has no Swashbuckle, so the host registers its own `umbradesktop`
document, in `Compat/Umbraco18/`. Both must produce the names the generated TypeScript client was
made with, since one client serves both. `Api/OpenApiContract.cs` in the test project lists those
names, and each major's test holds its naming to them.

The browser bundle is the same for both majors: every Vite config leaves `@umbraco-cms/backoffice`
out, so the bundle contains no Umbraco code. Where the two backoffices differ, detect the difference
at run time. Check whether an export, element or context member exists, as
`memoryOf` in the Media add-on's `manager/view-switch.ts` does. Compare version numbers only when
there is nothing to detect.

Releases within a major differ as much as the majors do. Development and the tests use the newest
backoffice, and each set installs on its major's oldest release (17.6.0, 18.1.0). The build's floor
check catches an import the oldest release lacks, but not a missing member on an object core hands
you. The workspace's `loadWithoutPersist` is the example: it only arrived in 17.6 and 18.1, so before
them the overwrite guard silently did nothing, and that is why those are the floors. Check a feature
that reads core's objects on a site at each floor; the upgrade plan's Phase D has the method. Then
either raise the floor or detect the member, as the Media add-on's `remembersViews` does.

## Versions

The tags carry Umbraco 17's numbers, `v17.Y.Z`. An Umbraco 18 build of the same commit is versioned
`18.Y.Z`: same minor, patch and prerelease, major 18. The `UmbraDesktopVersion` target in
`src/Directory.Build.targets` does this after MinVer runs. To ship the 18 packages as a release
candidate from a stable tag, set `UmbraDesktopMajorPreRelease` (in `src/Directory.Build.props`) to a
label such as `rc.1`. It is `rc.1` for the first 18 release, so that one tag ships 17 stable and
18 as a release candidate.

Each package's `umbraco-package.json` is stamped with its own version, which the backoffice puts on the
bundle's URL. Both majors stamp the same built file, so pack them one after the other, never at the
same time in one checkout. [`RELEASE.md`](../../RELEASE.md) has the release steps.
