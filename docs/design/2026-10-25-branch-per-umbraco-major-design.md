# One branch per Umbraco major — Design

> UmbraDesktop supports Umbraco 17 and 18 the way Umbraco itself does: a branch per major. `main` is
> always the newest major and references it directly. The previous one lives on `v17/main`, and
> fixes flow upward. One source tree building both majors was built, measured and declined.

- **Status:** Decided 2026-10-25, built in #166
- **Issue:** [#166](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/166)
- **Declined alternative:** [#164](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/pull/164),
  by Robert Foster, whose 18 findings this design keeps

---

## 1. The decision

| Branch | Umbraco | Tags | Floor and ceiling | MinVer minimum |
|---|---|---|---|---|
| `main` | 18, always the newest | `v18.x` | 18.1.0 to 18.99999999 | 18.0 |
| `v17/main` | 17 | `v17.x` | 17.6.0 to 17.99999999 | 17.0 |

- Each branch references its own Umbraco: its packages, `@umbraco-cms/backoffice`, its test
  instance. No property chooses a major, and nothing is compiled conditionally.
- New work lands on `main`. A 17 fix lands on `v17/main`, then `v17/main` is merged into `main`.
  Nothing flows down; a feature reaches 17 only as a deliberate port.
- Versions restart at the major: the first 18 release is `18.0.0`, beta first. The package major
  tracks the Umbraco major, as it always has.
- The six package IDs stay the same for both majors.

`RELEASE.md` ("Branches") is the working version of this table.

## 2. Why not one source tree

#164 builds both majors from one tree. `UmbracoMajor` picks the Umbraco packages, the version, a
compilation symbol and `Compat/Umbraco17|18` folders. There is a second test instance and solution,
a second set of lock files, and CI builds and publishes both sets off one tag, numbered alike
(`17.5.0` and `18.5.0`). It works: Robert measured it on real 17 and 18 sites end to end.

It was declined for what it costs every day after:

- **Every change is two changes to check.** Each frontend change has to be type-checked and tested
  against both backoffices, and each C# change built and tested twice. CI time and review time both
  double, for every pull request, for as long as 17 is supported.
- **The build becomes the hard part.** Making it work took separate `obj`/`bin` folders per major,
  item excludes for the other major's output and lock files, static web asset properties handed
  back by hand, static graph restore, solution-name rules for Visual Studio and a guard against
  building the 17 instance as 18. Each was found by a failure. Each is something the next person
  has to know before touching a csproj.
- **It ties the majors' versions together.** One tag ships both, so 17 cannot get a patch release
  without 18 getting the same number, and 18 cannot move to a new minor that 17 does not have.
- **It is not how Umbraco works.** Umbraco-CMS keeps a branch per major and merges up. People
  contributing to an Umbraco package expect that model, and their tooling assumes one Umbraco per
  checkout.

A branch per major costs a merge-up per 17 fix, and a deliberate port for a feature 17 should
also get. The 17 line is expected to take fixes rather than features, so that cost is small.

## 3. What is kept from #164

Its measured findings, and the code that only 18 needs. #168 already took the part that also holds
on 17.

- **The OpenAPI document.** Umbraco 18 replaced Swashbuckle and removed the operation and schema ID
  handlers. `Composing/OpenApiComposer.cs` registers a document of the package's own,
  `/umbraco/openapi/umbradesktop.json`, that names every operation and schema as the 17 handlers did,
  so the client's method and type names are unchanged. `OpenApiContract` and `OpenApiNamingTests`
  hold it to that.
- **The floor is 18.1.0**, not 18.0.0: the overwrite guard needs core's `loadWithoutPersist`, which
  arrived in 18.1, as it arrived in 17.6 on 17.
- **The remote viewer reads a 17 site from an 18 desktop.** 18's `getCurrentUser` maps fields a 17
  server does not send, and the frame never booted. `remote-viewer/older-server.ts` fills in only
  what is missing. The other way, a 17 desktop reading an 18 site, stops on Advanced Permissions'
  own API, which differs between its majors; the viewer names the refused call, by design.
- **Tree paging.** 18 removed the top-level `skip`/`take`. Its media recycle bin data source reads
  `paging`, so the bin tree sends `paging` only (17 still needs both, so `v17/main` keeps both).
- **The test instance.** Two starter kit views call `Children()` as a method, and the uSync export
  is 18's.
- **Upgrading.** Media trashed before recycle bin protection was on is not renamed when 18 turns it
  on, and emptying the bin then leaves its file public
  ([Umbraco-CMS#24303](https://github.com/umbraco/Umbraco-CMS/issues/24303)). The installation page
  says to empty the media recycle bin before upgrading.

Not kept: the `UmbracoMajor` switch and everything it needed, the second test instance, solution and
lock files, and the release-candidate label per major. Its other tidy-up is taken: the MinVer settings
and the `umbraco-package.json` stamping, repeated in six csproj files, are set once in
`src/Directory.Build.props` and `.targets`. Packing all six before and after gave identical nuspecs,
file lists and stamped versions.

## 4. Done the way 18 does it, not only made to build

Compiling and passing the tests on 18 was the floor, not the goal. Three sources set the rest:
Umbraco's own 18.1.0 extension template (`Umbraco.Templates`), the 18.0 to 18.2 release notes and
breaking changes, and a pass over every workaround in the code against 18.1.0 and 18.2.1's source.

- **Each package's API in a document of its own.** Controllers carry `[MapToApi(...)]`, Umbraco 18's
  rule for what a document holds, as the template's do. The host's document needs no inclusion filter
  of its own, and Umbraco's management document no longer lists any of our routes. Sticky Notes
  (`umbradesktop-accessories`) and the Arcade (`umbradesktop-arcade`) get their own documents too.
  `[ApiExplorerSettings(GroupName = "UmbraDesktop")]` stays: in 18 it is still how Umbraco tags
  operations (its own controllers use it), and the tag names the generated SDK class.
- **The client regenerated with `@hey-api/openapi-ts` 0.99**, which `@umbraco-cms/backoffice` 18 requires.
  The generator reads the document whole, as the template's does; the 17 one had to filter the shared
  management document to our paths. 18's document marks every property required, a nullable one as
  `T | null`, so the client now spells "no secret given" as `null` where it left it out. The server
  reads both the same.
- **A direct `Microsoft.AspNetCore.OpenApi` reference** in the host, which uses its types, at what
  Umbraco 18.1 requires (10.0.10). The template explains why: left transitive, a different patch than
  the site's makes a custom document silently fail to appear.
- **Vite and Lit at the template's and the backoffice's versions** (`^7.3.1`, `^3.3.1`).
- **Built and tested against the floor.** The frontends pin `@umbraco-cms/backoffice` 18.1.0 and the
  `@umbraco-ui/uui` 2.0.2 that release was built with, and the C# projects resolve 18.1.0 by
  themselves. The newest 18 is the other end: a CI job swaps each frontend to it and type-checks and
  tests again, and the C# compiles against it through the test instance. Floor and newest, not every
  release. Every fact this conversion rests on was read in 18.1.0's code.
- **Settings read as Umbraco's typed options.** The background jobs report read the distributed job
  timeout from raw configuration, because the property arrived in 17.1; it reads
  `DistributedJobSettings` now.
- **The Arcade's prune job on `RecurringBackgroundJobBase`**, with the shutdown token reaching the
  database. The token-less `RunJobAsync()` is obsolete in 18 and goes in 19.
- **Media places authorised in one call** (`FilterAuthorizedAsync`), as core's own list view does,
  instead of one check per child, which 17.0 needed.
- **A classic `treeView` declared for the Media Manager's two trees.** 18 made tree views extensions;
  an undeclared tree falls back to classic with a warning that the fallback goes in Umbraco 20.
- **The background jobs report's next run follows 18.1's scheduling.** 18.1 lets a distributed job
  align to the clock (`AlignToClock`): it runs at the first multiple of its period after its last
  run, not a period after it. The report worked out every next run as `lastRun + Period`; it now
  follows core's `DistributedJobService.IsDue` for both kinds.
- **The test instance's settings** lost a key neither 17's nor 18's schema has (`MacroErrors`).
- **No 17-only catalogue entries.** Deploy 17's two dashboards resolved to nothing on 18 and are gone,
  with their names; the Advanced Permissions fragment no longer explains how it serves both majors.
- **Comments and docs that described 17** now say what holds on 18, each checked against 18's source;
  what stays is history, or advice for sites still on 17.

Checked and found nothing to change: no Umbraco API the TypeScript uses is marked deprecated in the
18.2.1 typings, no runtime deprecation warning matches our code, and none of the C# items on 18's
breaking changes page are used.

## 5. Left for later, on purpose

- **The view-switch fallback** in the Media Manager (`view-switch.ts`) is still needed: 18.1 has no
  collection interaction memory, 18.2 has. It goes when the floor is 18.2.
- **`userEntryPoint`** (18.2) would replace the entry point's own wait for the current user. Also an
  18.2 floor.
- **Typed localization keys** (18.2) and **server events for Elements** (18.0) are features, not
  conversion work.
- **The clock's and umbraCoffee's "older desktop" checks** guard against a host older than the add-on,
  which the host dependency's floor has made impossible on both branches.

## 6. Guarding the wrong tag

A tag publishes whatever commit it is on. With two release branches, a `v17` tag on `main` would
publish 17.x packages built against 18, and every Umbraco 17 site would install them. The build
action now fails when the packed host's version major is not the major of its Umbraco floor. It
reads both from the package rather than naming a branch, so the same step is right on every branch.
`v17/main` does not have it yet; porting it there is a follow-up.

## 7. Merging up

A squash records no ancestry, so after one squashed merge-up git would offer every 17 change again
at the next, conflicts included. So merge-ups are merged with a merge commit, which records where
the two branches were joined, and every other pull request is still squashed. The repository allows
merge commits for that since 2026-10-25.

## 8. The next major

When Umbraco 19 arrives, cut `v18/main` from `main`, then move `main`: floor, ceiling, MinVer
minimum, the `@umbraco-cms/backoffice` and `@umbraco-ui/uui` pins in all six `package.json` files (at
the new floor, not the newest), the test instance's packages,
and the CI Node version if 19 asks for a newer one. #166's diff is the template, and §4 is the
checklist that goes with it: compare against Umbraco's own extension template for that major, read
its breaking changes and release notes, and check every workaround against its source.
