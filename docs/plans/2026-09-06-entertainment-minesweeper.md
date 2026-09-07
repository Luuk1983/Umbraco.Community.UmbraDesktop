# Entertainment package: Minesweeper — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Ignore any instinct to commit.** The repository owner's standing rule is that nothing is committed unless they ask for it in that message, and it overrides a plan or a skill that says otherwise. Finish a task, leave the work uncommitted, report what changed.

**Goal:** Ship `Umbraco.Community.UmbraDesktop.Entertainment` with Minesweeper in it, and in doing so put the host seam in front of a browser for the first time.

**Architecture:** A second Razor SDK project in this repository, versioned in lockstep with the host on the same `v*` tag (design D13), depending on the host by version range. Its backoffice bundle registers one `umbraDesktopApp` manifest. The game is a pure rules module plus a Lit element that reads the twelve app tokens.

**Tech Stack:** TypeScript, Lit, `@umbraco-cms/backoffice` v17, `@open-wc/testing` in web-test-runner, Vite, MinVer.

**Spec:** [`docs/design/2026-09-06-desktop-apps-design.md`](../design/2026-09-06-desktop-apps-design.md) §8 (the package) and §8.2 (why Minesweeper first). Author-facing contract: [`docs/desktop-apps.md`](../desktop-apps.md).

**Why this is the seam's real test.** Everything verified so far is automated tests inside the host package. Nothing has run in a browser, and the one defect this branch's tests structurally could not see (a missing side-effect import that Vite tree-shook away) would have shown only as a blank window body. A game inside the host package would exercise element mounting but not the thing the seam exists for: a **separate package** registering an app. Only a real second project tests that.

---

## Packaging facts, already established

Verified against the host project so no task has to rediscover them:

| Thing | Host's answer | Yours |
|---|---|---|
| `package.json` location | project root, `name: "umbradesktop"` | project root, `name: "umbradesktop-entertainment"` |
| Vite entry | `src/bundle.manifests.ts` in `backoffice/` | same |
| Entry output filename | **derived from `package.json` name** → `umbradesktop.js` | `umbradesktop-entertainment.js` |
| `vite.config.ts`, `tsconfig.json`, `web-test-runner.config.mjs` | inside `backoffice/` | same |
| Build output | `../wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop` | `…/Umbraco.Community.UmbraDesktop.Entertainment` |
| `umbraco-package.json` | `backoffice/public/`, registers one bundle pointing at the entry | same |
| `npm run build` | `cd backoffice && node scripts/build-wallpapers.mjs && tsc && vite build` | no wallpapers step |
| `npm test` | `cd backoffice && web-test-runner "src/**/*.test.ts" --node-resolve` | same |
| Marketplace listing | `umbraco-marketplace.json` at repo root | `umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json`, same root ([suffix convention](https://docs.umbraco.com/umbraco-dxp/marketplace/listing-your-package)) |

Externals: the host's vite config marks `/^@umbraco/` external. Do the same, and **also treat the host package as external** if you import anything from it at runtime; prefer importing nothing from it, since the manifest contract is structural.

---

### Task 1: The project skeleton, loading and empty

The point of doing this first, with no game in it, is that "a second package's bundle loads at all" is a separate failure from "the game works", and finding them together is how an afternoon disappears.

**Files:** create `src/Umbraco.Community.UmbraDesktop.Entertainment/` with `Umbraco.Community.UmbraDesktop.Entertainment.csproj`, `package.json`, `backoffice/tsconfig.json`, `backoffice/vite.config.ts`, `backoffice/web-test-runner.config.mjs`, `backoffice/public/umbraco-package.json`, `backoffice/src/bundle.manifests.ts`. Modify `Umbraco.Community.UmbraDesktop.app.slnx` and the TestInstance csproj.

- [ ] **Step 1: Copy the host's packaging, then strip what does not apply**

Mirror the host csproj: Razor SDK, `net10.0`, `ContentTargetFolders`, `StaticWebAssetBasePath`, symbols and SourceLink, `TreatWarningsAsErrors`, the `Content Remove` items that keep `backoffice/**` and `package.json` out of the package, and the `SyncUmbracoPackageVersion` target that stamps `umbraco-package.json` from MinVer.

Differences that matter:

- **`MinVerTagPrefix` is `v`, the same as the host's.** *Corrected while executing: this step originally said "no `MinVerTagPrefix`", which is wrong and breaks the very thing D13 asks for.* MinVer's default prefix is **empty**, so it only recognises bare `17.0.0` tags, and this repository tags `v17.0.0`. Measured both ways in one build: with the prefix the project stamps `17.1.0-alpha.0.34`, byte-identical to the host; without it, `17.0.0-alpha.0.119`, counting every commit in the repository. Two packages from one tag carrying different versions is exactly the failure D13 exists to prevent. The design's own §8.3 wording is fine ("no `MinVerTagPrefix` **of its own**"); it means no *separate* prefix, not no prefix. Repeat `MinVerAutoIncrement` and `MinVerMinimumMajorMinor` identically to the host's, since inheriting them would mean moving them into `src/Directory.Build.props` and deleting them from the host csproj, which is a host change.
- **Depend on the host by range**, never by `ProjectReference`. A `ProjectReference` packs an exact-version dependency and reintroduces the lockstep D13 avoids at the *consumer* level: `[17.0.0,18.0.0)` or whatever matches the host's current major. Note in your report what you used and why.
- **No wallpapers**: no `sharp`, no `scripts/`, no wallpapers step in `build`.
- Its own `PackageId`, `Title`, `Description`, `PackageTags`, `PackageIcon` (reuse the host's image or omit if that needs artwork), `PackageReadmeFile`.

- [ ] **Step 2: An empty bundle that registers nothing**

`backoffice/src/bundle.manifests.ts` exporting `export const manifests: Array<UmbExtensionManifest> = [];`, and `backoffice/public/umbraco-package.json` registering one `bundle` extension pointing at `/App_Plugins/Umbraco.Community.UmbraDesktop.Entertainment/umbradesktop-entertainment.js`.

Get the filename right: it comes from `package.json`'s `name`, not from the entry module's name. A mismatch here is a 404 at runtime and silence at build time.

- [ ] **Step 3: Wire it into the solution and the test instance**

Add the project to `Umbraco.Community.UmbraDesktop.app.slnx` beside the other two, and add a `ProjectReference` to it from `src/Umbraco.Community.UmbraDesktop.TestInstance`. The TestInstance is how any of this reaches a browser.

**That combination breaks the build, and the error names neither package nor file.** *Found while executing.* The TestInstance already has a `ProjectReference` to the host, and Entertainment depends on the host by version **range**, so restore also pulls the *published* host in behind Entertainment. Two copies of `App_Plugins/Umbraco.Community.UmbraDesktop/**` then reach the static web assets manifest and the build dies with `InvalidOperationException: Sequence contains more than one element` out of `GenerateStaticWebAssetsDevelopmentManifest`.

The fix is one commented line in the TestInstance: `<PackageReference Include="Umbraco.Community.UmbraDesktop" ExcludeAssets="all" />`. Verify it does not quietly swap the released host in for the local one, as the executing agent did: check that both host DLLs in `bin` report the MinVer version with the local commit hash, and that every host static asset in `staticwebassets.build.json` has its content root under `src\Umbraco.Community.UmbraDesktop\`.

Do **not** reach for `PrivateAssets="all"` or `ExcludeAssets="all"` on Entertainment's *own* reference to the host: that strips the dependency from the shipped nuspec, or poisons it for real consumers. One residue to accept: `packages.lock.json` records the host as a `Direct` package for the TestInstance and drops its `Project` node, so restore downloads a host nupkg it never uses. Harmless, and every alternative is worse. Anyone adding a third project to this solution will hit the same collision.

Central package management is on (`ManagePackageVersionsCentrally`), so a versioned `PackageReference` in a csproj is an error: the version belongs in `src/Directory.Packages.props`.

- [ ] **Step 4: Prove it loads**

```bash
npm install
npm run build
```

from the new project, then build the solution. Then run the TestInstance and confirm in the browser devtools that `/App_Plugins/Umbraco.Community.UmbraDesktop.Entertainment/umbradesktop-entertainment.js` is **fetched with a 200**. An empty bundle changes nothing visible, so the network tab is the only evidence.

If you cannot start the TestInstance, say so with the error rather than skipping the step: this is the one task whose whole purpose is that fetch.

Note: the repo's own history says a dot-directory in a LocalDB `.mdf` path breaks `CREATE DATABASE`, which is why this worktree lives under `Worktrees/`. If the TestInstance fails on the database, check that before anything else. In practice it installed cleanly here: `CREATE DATABASE` warnings in the boot log are the pre-install probe, followed by `Unattended upgrade completed successfully`.

**Booting against a fresh database dirties the working tree.** TheStarterKit rewrites its own views on first run, stripping a trailing newline from nine files under `src/Umbraco.Community.UmbraDesktop.TestInstance/Views/`. `git diff -w` shows nothing, so it is whitespace only and not anyone's work: clear it with `git restore` on that directory, and do not mistake it for part of the change under review.

---

### Task 2: The rules, as a pure module

**Files:** create `backoffice/src/minesweeper/rules.ts` and `rules.test.ts`.

Pure functions over a board value, no DOM, no Lit, no randomness reaching the tests. Minesweeper's rules are not domain you need explained; what follows is the behaviour to pin, and the tests are the specification.

- [ ] **Step 1: Write the failing tests**

Cover at least these, each as its own case with a message saying what a player would notice:

- A new board has exactly the requested mine count, and every cell starts unrevealed and unflagged.
- **First-click safety**: the first revealed cell is never a mine. This is the rule most implementations get wrong, and the one a player notices immediately. Decide and document whether the first click is also guaranteed to open a zero-adjacency region, which is what modern Minesweeper does, or merely to be safe.
- Revealing a cell with zero adjacent mines **floods** to its region and stops at the numbered border.
- Revealing a numbered cell reveals only that cell.
- Flagging toggles, a flagged cell cannot be revealed, and the remaining-mine counter reflects flags rather than actual mines.
- Revealing a mine loses, and the loss reveals the board.
- Revealing every non-mine cell wins, without needing every mine flagged.
- Revealing an already-revealed cell is a no-op rather than an error.

Take randomness as an injected parameter (a seed, or a shuffle function) so every test is deterministic. A test that places mines randomly and asserts a count is not testing what it looks like.

- [ ] **Step 2: Run them and watch them fail**

```bash
npx web-test-runner "src/minesweeper/rules.test.ts" --node-resolve
```

from `backoffice/`.

- [ ] **Step 3: Implement until green.** Board state as data, transitions as functions returning new state. Keep it under about 200 lines; if it grows past that, say so rather than splitting on your own.

---

### Task 3: The element

**Files:** create `backoffice/src/minesweeper/minesweeper.element.ts` and its test.

- [ ] **Step 1: Read the contract first**

[`docs/desktop-apps.md`](../desktop-apps.md) is the author-facing guide, written for exactly this job. Follow it rather than inferring from the host's source. Ten traps are listed there and every one was a real defect during the seam's build. In particular:

- `background`, never `background-color`, because a surface token may carry a gradient.
- Read the theme in **CSS**, not in the constructor. `:host([data-umbradesktop-theme='win98'])` is safe; `this.getAttribute(…)` in your own constructor reads nothing.
- Render correctly with **no** theme attribute at all, since it is absent until the theme resolves.
- Call `customElements.define` (or use `@customElement`). A module exporting an app class without registering it fails with `Illegal constructor`, and the desktop renders "could not be loaded".
- Cancel timers in `disconnectedCallback`. Minimizing does **not** unmount, so a running clock keeps running, which is correct; closing the window does unmount.

- [ ] **Step 2: Write the failing element tests**

Behaviour through the DOM, not internals: clicking a cell reveals it; clicking a flagged cell does nothing; right-click or long-press flags; a new-game affordance resets; the mine counter and any timer render. Use `@open-wc/testing`.

- [ ] **Step 3: Implement**

Read the twelve app tokens for every colour, edge and radius, each with the fallback [`docs/desktop-apps.md`](../desktop-apps.md) documents. Digit colours (the classic 1-blue, 2-green, 3-red) are the app's **own** domain palette, not theme tokens: the design says an app owns its domain colours, so hardcode them and say so in a comment.

One deliberate per-theme branch: `:host([data-umbradesktop-theme='win98'])` for real two-tone bevels. That is the branch the whole token contract was shaped around, and it is the visible proof the theme forwarding works.

---

### Task 4: Register it

**Files:** modify `backoffice/src/bundle.manifests.ts`; create `backoffice/src/localization/en.ts`, `nl.ts` and their manifest.

- [ ] **Step 1: The manifest**

One `umbraDesktopApp`, following §4 of the design and the guide's manifest table. `element` as a loader (the form the guide recommends for a bundled package), `meta.label` as a localisation token, `meta.icon`, `meta.group: 'games'`, a `defaultSize` and `minSize` that suit a beginner board, `allowMultiple: false`.

`weight` follows **Umbraco's** convention, higher first (D16). If Solitaire is to sit beside it later, pick a value that leaves room.

- [ ] **Step 2: Localisation**

Its own `en` and `nl` dictionaries, in this package. The `games` group's own label is the host's and already exists in both locales; you supply the app's name and anything the game itself says.

- [ ] **Step 3: Verify the tile appears**

Both gates, then the browser: a Games group in the launcher with one tile, which opens a window with a playable board.

---

### Task 5: The browser checkpoint, and done

This is the step the whole plan exists for, and the design's §9 has been waiting on it.

- [ ] **Step 1: Play it under all five themes**

Umbraco, Umbraco 4, macOS, Windows 11, Windows 98. For each: does the board read as belonging to that chrome, is every digit legible on its own surface, and is a raised cell distinguishable from a revealed one? Win98 is the one that must look *right* rather than merely acceptable.

Report what you saw per theme, and take a screenshot of each into `docs/screenshots/`.

- [ ] **Step 2: Answer the question the token group has been waiting on**

The design ships the app tokens **provisional** precisely so a real game could settle them. Say plainly whether the twelve were sufficient. If a value reads wrong, that is a palette fix in the host. If a *token* is missing, that is the finding this whole exercise was for, and it wants recording in the design rather than worked around in the game's CSS.

The known open item is §6.1's: on the flat themes a raised control's only separation is a fill step of about 1.1:1, well under the 3:1 WCAG 1.4.11 asks of a control boundary. A Minesweeper grid is the ideal place to judge whether that matters in practice or only on paper. Answer it.

> **Answered twice, and the second answer overrode the first.** This step reported that twelve tokens were sufficient and that the grid `gap` technique settled the boundary question (design D18). The next browser run — the same game, driven by a person — reported Windows 11 unreadable in both variants, because the gap was ruled in `edge-dark` and a theme may make its bevel as subtle as its own controls are: 1.15:1 in light, 1.33:1 in dark. The group is now **thirteen** tokens (D20, `--umbradesktop-app-border`, guaranteed 3:1 against all three surfaces), Win11's app surfaces have moved, and a second rule came out of the same round: a theme branch in an app may change how it looks and never how big it is (D21). Anyone reading this plan as a record of the contract should read those three rows instead.

- [ ] **Step 3: Definition of done**

Per CLAUDE.md, and say which items did not apply. The new package needs its own marketplace listing (suffixed filename, see the table above) and its own README if `PackageReadmeFile` points at one. The host's README should say the entertainment package exists and what installing it gets you. Screenshots from Step 1 belong in both listings.

- [ ] **Step 4: Report, and do not commit**

---

## Self-review

**Scope.** Task 1 is packaging, 2 and 3 are the game, 4 is the seam's first real consumer, 5 is the verification everything else has been deferring. Solitaire is explicitly **not** here: design §8.2 says it is several times the work and that its card deck is its own first decision, so it gets its own plan.

**Where the risk is.** Task 1, and not the game. MSBuild, MinVer and a filename derived from `package.json` are where silent failures live; a wrong bundle path is a 404 with a green build. Tasks 2 and 3 are ordinary TDD over rules a reader already knows.

**What this plan deliberately does not specify.** Minesweeper's implementation. The tests in Task 2 are the specification, and dictating 200 lines of flood fill to someone who knows the game would be worse than useless.
