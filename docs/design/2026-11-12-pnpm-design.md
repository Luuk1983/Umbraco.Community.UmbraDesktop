# pnpm instead of npm: design

> The six frontends move from npm to pnpm, each staying its own project with its own lock file.
> On Windows a clean `npm ci` took about four minutes per project, nearly all of it writing files,
> so setting up a worktree cost close to half an hour. pnpm links packages from one store per
> drive, which took a whole fresh worktree, all six projects, to 35 seconds.

- **Status:** Built 2026-11-12, not merged
- **Date:** 2026-11-12
- **Branch:** `208-pnpm`, from `v17/main`
- **Issue:** #208

---

## 1. Why change

Work here runs in many git worktrees at once, and each needs its frontends installed before the
test instance can serve the packages' static assets. A cold `npm ci` took about three to four
minutes per project on Windows while the Vite build after it took about a second. Six projects per
worktree made setup a 20 to 25 minute wait, all of it install.

The six projects share almost everything: each pins the same `@umbraco-cms/backoffice` and the same
test tooling, about 530 to 660 packages each. npm writes a full copy of that tree into every
project. pnpm keeps one content-addressed store and hard-links each project's `node_modules` from
it, so only the first install on a machine has to fetch and write the files.

## 2. Measurements

Windows 11, Node 24.14.0, npm 11.9.0, pnpm 10.24.0, on the D: drive. `node_modules` was deleted
before **every** timed run, npm and pnpm alike, so each one installs from nothing. npm used its
normal cache in `%LOCALAPPDATA%\npm-cache`, warm from daily use. pnpm used a new, empty store at
`D:\pnpm-measure-store` for the first run, so the first pnpm number includes downloading
everything. `--frozen-lockfile` throughout, which is what `npm ci` does.

| Run | Project | Time |
| --- | --- | --- |
| `npm ci`, warm npm cache, `main`'s lock (backoffice 18.1.0) | host | 234 s |
| `npm ci`, warm npm cache, `main`'s lock | Media | 257 s |
| `npm ci`, **empty** npm cache, `main`'s lock | host | 196 s |
| `npm ci`, warm npm cache, `v17/main`'s lock (backoffice 17.6.0) | host | 234 s |
| pnpm, empty store | host | 168 s |
| pnpm, store holding the host's packages | Media | 30 s |
| pnpm again, warm store | host | 3.6 s |
| pnpm again, warm store | Media | 3.9 s |
| pnpm, a second, fresh worktree | Accessories | 3.9 s |
| | Entertainment | 9.6 s |
| | Media | 3.7 s |
| | Services.Arcade | 10.3 s |
| | Services.Media | 3.6 s |
| | host | 3.6 s |
| | **all six** | **34.7 s** |

What the numbers say:

- **npm's time is not the download.** With an empty cache `npm ci` was *faster* (196 s) than with a
  warm one (234 s). The time goes into writing tens of thousands of small files per project (on
  Windows, presumably with Defender looking at each one). That is the work pnpm's hard links skip.
- **The first pnpm install on a machine is still minutes**, since it has to fill the store. Every
  install after that is seconds. Entertainment and Services.Arcade took 10 s in the second worktree
  because they were the first projects to need some packages of their own, which the store did not
  hold yet; from then on those are linked too.
- **A worktree goes from about 25 minutes to about 35 seconds**: six `npm ci` runs at roughly four
  minutes each, against 34.7 s for all six with pnpm.

The npm runs on `main`'s lock files were taken before the issue moved the work to `v17/main`; the one
run on `v17/main`'s lock is there to show the branch makes no difference to npm's time. Another
`npm ci`, from outside this measurement, ran on the machine during the first npm run, so 234 s may
be a little high. It does not change the conclusion: the clean runs are in the same range.

## 3. Separate projects, not a workspace

pnpm could also run the six as one workspace: a `pnpm-workspace.yaml` at the repository root, one
lock file, one `pnpm install` for everything. That was considered and not chosen.

- **Each package's build stays its own.** The add-ons are deliberately kept apart as an external
  add-on's would be (their docs, their package.json, their tests). A workspace lock ties an add-on's
  dependency change to every other package's install, and puts a `node_modules` layout decision at
  the root that none of them owns.
- **The store already shares what a workspace would.** The whole speed-up comes from the store's
  hard links, which work across separate projects on one drive. A workspace would save the
  difference between six commands and one, which the numbers above show is seconds.
- **CI keeps its shape.** Every step still runs per package, as it did with npm.

So each project keeps its own `pnpm-lock.yaml`, and installs, builds and tests from its own folder,
exactly as before.

## 4. What pnpm's strict `node_modules` exposed

pnpm only lets a project import what its own `package.json` declares. npm's flat layout lets a
project import anything any dependency happened to install. Two real gaps turned up, and both were
fixed by declaring the dependency, not by turning on hoisting:

- **`@web/test-runner-commands` was a phantom dependency** in Accessories, Media and Services.Arcade.
  Their tests import `sendMouse` and `sendKeys` from it, but only the host declared it. Under npm it
  resolved because `@web/test-runner` installs it. Under pnpm the Accessories suite failed with
  `Could not resolve import "@web/test-runner-commands"` (the red run). It is now declared, at
  `^0.9.0`, the version npm's lock already had.
- **`@umbraco-cms/backoffice` 17.6.0 has a peer dependency `diff@^9.0.0`.** npm installs peers
  itself and gave it 9.0.0, nesting `@web/test-runner`'s older `diff` 5.2.2 below that. pnpm, even
  on a fresh resolution, satisfied the peer with the 5.2.2 already in the tree and warned
  `unmet peer diff@^9.0.0: found 5.2.2`. Every project now declares `diff` `^9.0.0`, which is what
  the backoffice asks its consumer to provide and puts the tree back to what npm had.

One more pnpm difference that is not about layout: **pnpm 10 does not run dependencies' install
scripts unless a project allows them.** Each `package.json` allows esbuild's, which npm always ran,
with `"pnpm": { "onlyBuiltDependencies": ["esbuild"] }`. Media has one more: `canvas`, an optional
dependency of the Image Editor's `fabric` that is only used when `fabric` runs in Node. Nothing here
does (the tests run in a browser, and no code imports it), so Media skips it on purpose with
`"ignoredBuiltDependencies": ["canvas"]`, which also silences pnpm's "Ignored build scripts" warning.
npm did build it, so this is the one place the install does less than npm's; Media's 1059 tests passed
without it. `sharp` 0.35 needs no script: it ships prebuilt binaries as optional packages.

Vite, `tsc`, web-test-runner and the docs and asset scripts needed no other change. The two places
that read `node_modules` by path (`build-ranks.mjs` for the Roboto Slab font and Services.Arcade's
`vite.config.ts` for Fraunces) name direct dependencies, which pnpm links at the top of
`node_modules`. Media's licence check finds a module's package by the last `/node_modules/` in its
path, which is still the package itself in pnpm's `.pnpm/<name>@<version>/node_modules/<name>`.

## 5. Converting the lock files

`pnpm import` reads each `package-lock.json` and writes a `pnpm-lock.yaml` at the same versions, so
the switch changes the package manager without updating any dependency. Afterwards every project's
pnpm lock holds exactly the package versions its npm lock did, with one exception: in Media pnpm
shares `ws` 8.22.0 between `jsdom` and `puppeteer-core`, where npm had nested a separate 8.21.3 for
`puppeteer-core`. Both are Node-side test tooling, and the difference is a patch version.

`packageManager` is `pnpm@10.24.0` in every `package.json`. pnpm 10 reads that field and, if it is
running a different version, fetches and uses the pinned one, so every machine and CI agree.

## 6. CI

- **`pnpm/action-setup@v4` before `actions/setup-node`**, because setup-node's `cache: pnpm` asks
  pnpm where its store is. There is no root `package.json`, so the action reads the version from
  the host's (`package_json_file`), which every project pins to the same pnpm.
- **The cache is keyed on all six `pnpm-lock.yaml` files**, for the same reason it was keyed on all
  six npm locks.
- **`npm ci` became `pnpm install --frozen-lockfile`**, which fails on a lock that does not match its
  `package.json`, as `npm ci` did. `npm test` and `npm run build` became `pnpm test` and
  `pnpm run build`.
- **The "latest Umbraco 17" job swaps the backoffice with `pnpm add --save-dev`.** pnpm has no
  `--no-save`, so this rewrites `package.json` and the lock file. That only happens in the runner's
  throwaway checkout.

No `.csproj` or MSBuild target runs npm, and none should (RELEASE.md, "Never invoke pnpm from
MSBuild"). The `<Content Remove="package-lock.json" />` lines are gone with the file.
`pnpm-lock.yaml` is not a Content item to begin with (the Web SDK's Content globs pick up `.json`, not
`.yaml`), so it does not reach the package; the packed `.nupkg` was checked.

## 7. Verification

Every project was installed from nothing with `pnpm install --frozen-lockfile`, then built with
`pnpm run build` and tested with plain `pnpm test`:

| Project | Build | Tests |
| --- | --- | --- |
| host | passes (docs check, wallpapers, icons, `tsc`, Vite) | 3240 passed, 279 files |
| Services.Arcade | passes | 208 passed, 23 files |
| Services.Media | passes | 374 passed, 36 files |
| Entertainment | passes (card backs through `sharp`) | 682 passed, 38 files (see below) |
| Accessories | passes | 459 passed, 32 files |
| Media | passes (licence check included) | 1059 passed, 100 files |

The packed host `.nupkg` holds the built frontend and no `package.json` or lock file.

**Entertainment has an intermittent failure that predates this change.** In some full runs
`media-player/control-bar.element.test.ts` fails to load with `Failed to fetch dynamically imported
module` and its 38 tests do not run; on its own it always passes. It happened in 1 of 4 full runs
under npm on unchanged `v17/main` and in 2 of 3 under pnpm. Separately,
`solitaire/solitaire.element.test.ts` run on its own fails its first test (`Timeout: cards drawn`)
under npm and pnpm alike, because the first render waits for a dynamic `import()` of the card faces
that the dev server has not transformed yet; in a full run earlier files usually warm it. Neither is
pnpm's doing. Both were traced the next day in
[the test-loading flake design](2026-11-13-test-loading-flake-design.md): the first is Chrome
dropping requests on a Wi-Fi re-key, the second a one-second budget that covered a cold load, now
fixed.

## 8. Traps

- **The store has to be on the same drive as the project**, or pnpm copies instead of linking and
  most of the speed-up is gone. pnpm handles this itself: with the home folder on C: and the
  repository on D:, it puts the store at `D:\.pnpm-store`. Do not point `store-dir` at another drive.
- **Visual Studio's `-vs-binding`** still runs `npm run watch` when the solution opens. That works:
  `npm run` only runs the script with `node_modules/.bin` on the path, and does not install.
- **Do not run `npm install` in a converted project.** It ignores `pnpm-lock.yaml`, writes a
  `package-lock.json` and rebuilds `node_modules` npm's way.
- **Merging up to `main`**: `main` pins backoffice 18.1.0, so its lock files are different. Run
  `pnpm import` on `main`'s own `package-lock.json` files, then check the backoffice's peers again,
  since `diff` is unlikely to be the only one that moves between majors.
