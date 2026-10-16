# Arcade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Owner's rule, overriding every skill: never commit.** No task ends in `git commit`. Leave all work
> uncommitted in the working tree; the owner reviews one diff. Where a skill says "commit", skip it
> and say so.

**Goal:** Persistent per-user high scores for desktop games, shown on leaderboards in an Arcade hub,
with a notification when someone takes first place from you, shipped as a service package any game
add-on can use.

**Architecture:** A new add-on, `Umbraco.Community.UmbraDesktop.Services.Arcade`, holds an EF Core
store and a management API (server), plus a desktop-level context, a `umbraDesktopGame` manifest
type and the hub app (backoffice). The host gains one generic seam, `umbraDesktopContext`, so the
Arcade's context exists only while the desktop is open, and a published `openApp(alias)`.
Entertainment depends on the Arcade and wires its three games in.

**Tech Stack:** .NET 10, Umbraco 17 (floor 17.0.0), EF Core via `Umbraco.Cms.Persistence.EFCore`,
xUnit + NSubstitute; TypeScript, Lit, `@umbraco-cms/backoffice` 17, `@open-wc/testing` on
web-test-runner.

**Design:** [`2026-10-01-arcade-design.md`](./2026-10-01-arcade-design.md). Decisions are cited as
D1 to D13. Read it first.

---

## Conventions every task follows

- **Tests first.** Write the test, run it, watch it fail for the stated reason, then implement.
- **C#:** primary constructors, `var`, records unless mutation is the point (EF entities are classes
  for that reason, and say so), XML docs on every type and member including private ones.
- **TypeScript:** JSDoc on everything including private members, saying why, at the density of the
  surrounding files. `UmbLitElement`, Lit from `@umbraco-cms/backoffice/external/lit`,
  `this.localize.termOrDefault(key, englishFallback)`.
- **Commands.** Each package folder has `npm test` and `npm run build`. Run both: the test runner
  does not type-check and `tsc` renders nothing. C# tests run by project file, never by folder.
- **Paths** are relative to the repository root. `H` = `src/Umbraco.Community.UmbraDesktop`,
  `A` = `src/Umbraco.Community.UmbraDesktop.Services.Arcade`, `AT` = `src/Umbraco.Community.UmbraDesktop.Services.Arcade.Tests`,
  `E` = `src/Umbraco.Community.UmbraDesktop.Entertainment`.
- **Published strings** (do not rename once shipped): context alias `UmbraDesktopArcadeContext`;
  extension types `umbraDesktopContext`, `umbraDesktopGame`; API route
  `umbradesktop/services/arcade`; localisation area `umbraDesktopArcade`; game manifest aliases.

## File map

**Host (`H/backoffice/src/desktop/`)**
- Create `desktop-context.extension.ts`: the `umbraDesktopContext` manifest type.
- Create `package-contexts.controller.ts` (+ `.test.ts`): starts and stops package contexts.
- Modify `components/desktop.element.ts`: start on connect, stop on disconnect; give the window manager its app source.
- Modify `window-manager.context.ts` (+ test): `useApps()`, `openApp(alias)`.
- Create `docs/developer/desktop-contexts.md`; modify `docs/developer/README.md`, `desktop-apps.md`, `package-catalogues.md`.

**Arcade server (`A/`)**
- `Data/`: `ArcadeProfileEntity.cs`, `ArcadeLeaderboardEntity.cs`, `ArcadeScoreEntity.cs`, `ArcadeBeatenEntity.cs`, `ArcadeDbContext.cs`, `SqlServerArcadeDbContext.cs`, `SqliteArcadeDbContext.cs`, `DesignTimeFactories.cs`, `IArcadeDatabase.cs`, `ScopedArcadeDatabase.cs`, `Migrations/SqlServer/*`, `Migrations/Sqlite/*` (generated).
- `Scores/`: `LeaderboardDefinition.cs`, `ScoreRules.cs`, `ArcadeStore.cs`, `ArcadeResults.cs`, `IArcadeUserDirectory.cs`, `UmbracoArcadeUserDirectory.cs`.
- `Api/`: `ArcadeController.cs`, `ArcadeModels.cs`.
- `Composing/`: `ArcadeComposer.cs`, `ArcadeMigrator.cs`, `ArcadeMigrationHandlers.cs`, `ArcadeUserDeletedHandler.cs`, `ArcadeBeatenPruneJob.cs`.

**Arcade tests (`AT/`)**: `SqliteTestDatabase.cs`, `FakeUserDirectory.cs`, `ScoreRulesTests.cs`, `ArcadeStoreSubmitTests.cs`, `ArcadeStoreBoardTests.cs`, `ArcadeStoreBeatenTests.cs`, `ArcadeStoreAdminTests.cs`, `ArcadeControllerTests.cs`, `ArcadeComposerTests.cs`, `ArcadeUserDeletedHandlerTests.cs`, `MigrationsTests.cs`.

**Arcade backoffice (`A/backoffice/src/`)**
- `umbradesktop-app.d.ts`: copies of the host's types plus `umbraDesktopContext` and `umbraDesktopGame`.
- `shared/area.ts`, `shared/http.ts` (copy of Accessories'), `shared/format.ts` (+ test).
- `games/game-manifest.ts` (+ test): the `umbraDesktopGame` type and its reader.
- `api/arcade-api.ts` (+ test).
- `context/arcade.context-token.ts`, `context/arcade.context.ts` (+ test), `context/privacy-modal.token.ts`, `context/privacy-modal.element.ts` (+ test).
- `conditions/has-games.condition.ts` (+ test).
- `hub/hub.element.ts`, `hub/board.element.ts`, `hub/profile.element.ts` (+ tests), `hub/constants.ts`.
- `bundle.manifests.ts` (+ test), `localization/{manifest,en,nl}.ts` + `parity.test.ts`.

**Entertainment (`E/backoffice/src/`)**
- Create `shared/arcade.ts` (+ test): the token shim and a `submitScore` helper.
- Modify `minesweeper/minesweeper.element.ts`, `snake/snake.element.ts`, `solitaire/solitaire.element.ts` (+ their tests).
- Modify `bundle.manifests.ts` (+ test): three `umbraDesktopGame` manifests, catalogue removed.
- Modify `umbradesktop-app.d.ts`: add `umbraDesktopGame`.
- Modify `E/Umbraco.Community.UmbraDesktop.Entertainment.csproj`: reference the Arcade.

**Build and release**: `src/Directory.Build.targets`, `src/Directory.Packages.props`,
`Umbraco.Community.UmbraDesktop.app.slnx`, TestInstance csproj, `.github/actions/build-packages/action.yml`,
`.github/workflows/ci.yml`, `RELEASE.md`, `CLAUDE.md`.

**Docs**: `A/docs/product.json`, `A/docs/developer/putting-your-game-on-the-arcade.md`,
`A/docs/user/arcade.md`, `A/README.md`, `E/docs/user/games.md`, `E/README.md`,
`umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json`.

---

# Phase A: Host seams

### Task 1: The `umbraDesktopContext` manifest type and its controller

**Files:**
- Create: `H/backoffice/src/desktop/desktop-context.extension.ts`
- Create: `H/backoffice/src/desktop/package-contexts.controller.ts`
- Test: `H/backoffice/src/desktop/package-contexts.controller.test.ts`

The controller is separate from the desktop element so it can be tested against a fresh
`UmbExtensionRegistry`. No test in this repository touches the global registry; keep it that way.

- [ ] **Step 1: Write the failing tests**

```ts
// H/backoffice/src/desktop/package-contexts.controller.test.ts
import { expect, fixture, html } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbConditionConfigBase, UmbConditionControllerArguments } from '@umbraco-cms/backoffice/extension-api';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopPackageContextsController } from './package-contexts.controller.js';

/** A host standing in for the desktop element. */
@customElement('umbradesktop-package-contexts-test-host')
class TestHost extends UmbLitElement {}

/** A child standing in for an app inside the desktop, which is where a game consumes from. */
@customElement('umbradesktop-package-contexts-test-child')
class TestChild extends UmbLitElement {}

/** Every context the fake api has constructed and destroyed, in order. */
const log: string[] = [];

const TOKEN = new UmbContextToken<FakePackageContext>('Test.PackageContext');

/** A package context, as a package would write one. */
class FakePackageContext extends UmbContextBase {
  /** @param host The desktop, as the controller passes it. */
  constructor(host: UmbControllerHost) {
    super(host, TOKEN);
    log.push('created');
  }
  /** Records teardown so the tests can see the context goes when the desktop does. */
  override destroy(): void {
    log.push('destroyed');
    super.destroy();
  }
}

/** A condition that always refuses. */
class Refused extends UmbConditionBase<UmbConditionConfigBase> {
  /** @param host The host. @param args The condition arguments. */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbConditionConfigBase>) {
    super(host, args);
    this.permitted = false;
  }
}

/** Wait a turn, for the initializer's asynchronous loads. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A host with a child in it, a fresh registry, and the controller under test. */
async function setup() {
  log.length = 0;
  const host = await fixture<TestHost>(html`<umbradesktop-package-contexts-test-host><umbradesktop-package-contexts-test-child></umbradesktop-package-contexts-test-child></umbradesktop-package-contexts-test-host>`);
  const child = host.querySelector('umbradesktop-package-contexts-test-child') as TestChild;
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  const controller = new UmbraDesktopPackageContextsController(host, registry);
  return { host, child, registry, controller };
}

it('creates a registered package context on start, and an app inside the desktop can consume it', async () => {
  const { child, registry, controller } = await setup();
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Ctx', name: 'Test', api: FakePackageContext } as unknown as UmbExtensionManifest);
  controller.start();
  await settle();
  const found = await child.getContext(TOKEN);
  expect(found).to.be.instanceOf(FakePackageContext);
});

it('creates nothing before start, and destroys what it created on stop', async () => {
  const { registry, controller } = await setup();
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Ctx', name: 'Test', api: FakePackageContext } as unknown as UmbExtensionManifest);
  await settle();
  expect(log).to.deep.equal([]);
  controller.start();
  await settle();
  controller.stop();
  expect(log).to.deep.equal(['created', 'destroyed']);
});

it('honours a manifest condition', async () => {
  const { registry, controller } = await setup();
  registry.register({ type: 'condition', alias: 'Test.Refused', name: 'Refused', api: Refused } as unknown as UmbExtensionManifest);
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Ctx', name: 'Test', api: FakePackageContext, conditions: [{ alias: 'Test.Refused' }] } as unknown as UmbExtensionManifest);
  controller.start();
  await settle();
  expect(log).to.deep.equal([]);
});

it('keeps going when one package context fails to load', async () => {
  const { registry, controller } = await setup();
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Broken', name: 'Broken', api: () => Promise.reject(new Error('nope')) } as unknown as UmbExtensionManifest);
  registry.register({ type: 'umbraDesktopContext', alias: 'Test.Ctx', name: 'Test', api: FakePackageContext } as unknown as UmbExtensionManifest);
  controller.start();
  await settle();
  expect(log).to.deep.equal(['created']);
});
```

- [ ] **Step 2: Run, expect failure**

Run (from `H`): `npm test -- --files "backoffice/src/desktop/package-contexts.controller.test.ts"`
(if the runner rejects `--files`, run `npm test` and read this file's result).
Expected: FAIL, cannot resolve `./package-contexts.controller.js`.

- [ ] **Step 3: Declare the manifest type**

```ts
// H/backoffice/src/desktop/desktop-context.extension.ts
import type { ManifestApi, ManifestWithDynamicConditions, UmbApi } from '@umbraco-cms/backoffice/extension-api';
import type { UmbExtensionConditionConfig } from '@umbraco-cms/backoffice/extension-registry';

/**
 * A context a package provides at the desktop's level: created by the desktop element with itself as
 * host when the desktop connects, destroyed when it disconnects.
 *
 * The desktop's answer to `globalContext`, which Umbraco creates at the backoffice root and so runs in
 * the plain backoffice and inside every window's iframe too. A package service that belongs to the
 * desktop (the Arcade is the first) wants none of that. Modelled on Umbraco's own `workspaceContext`,
 * which a workspace creates with itself as host through `UmbExtensionsApiInitializer`; design D3 of
 * `docs/design/2026-10-01-arcade-design.md`.
 *
 * **Published API.** The type name and its behaviour are kept stable; like the other desktop types,
 * it only ever gains optional fields.
 */
export interface ManifestUmbraDesktopContext
  extends ManifestApi<UmbApi>,
    ManifestWithDynamicConditions<UmbExtensionConditionConfig> {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopContext';
}

declare global {
  /** Registers the type with Umbraco's manifest map, as `umbraDesktopApp` does. */
  interface UmbExtensionManifestMap {
    /** A package context living on the desktop element. */
    umbraDesktopContext: ManifestUmbraDesktopContext;
  }
}
```

- [ ] **Step 4: Write the controller**

```ts
// H/backoffice/src/desktop/package-contexts.controller.ts
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbExtensionsApiInitializer } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import type {} from './desktop-context.extension.js';

/** The registry type, nominal because `UmbExtensionRegistry` has private fields (see app-catalogue.context.ts). */
type UmbraDesktopExtensionRegistry = typeof umbExtensionsRegistry;

/**
 * Creates every registered `umbraDesktopContext` api with the desktop as host, from `start()` to
 * `stop()`.
 *
 * Start and stop rather than living as long as the element, because a disconnected Umbraco element
 * only tells its controllers `hostDisconnected`; it never destroys them. A package context with work
 * to do when the desktop opens (the Arcade's "you were beaten" check) needs a real birth and death
 * per visit, and leaving the desktop has to leave nothing of a package running.
 *
 * Conditions, lazy loading and a loader that rejects are all `UmbExtensionsApiInitializer`'s, which
 * reports a failed load in the console and carries on with the others.
 */
export class UmbraDesktopPackageContextsController extends UmbControllerBase {
  /** The registry to read, injectable so tests never touch the global one. */
  readonly #registry: UmbraDesktopExtensionRegistry;

  /** The running initializer, or undefined when stopped. */
  #initializer?: UmbExtensionsApiInitializer<never>;

  /**
   * @param host The desktop element, which becomes every package context's host.
   * @param registry Where manifests come from; Umbraco's own by default.
   */
  constructor(host: UmbControllerHost, registry: UmbraDesktopExtensionRegistry = umbExtensionsRegistry) {
    super(host, 'umbraDesktopPackageContexts');
    this.#registry = registry;
  }

  /** Create the package contexts. Calling it twice is harmless. */
  start(): void {
    if (this.#initializer) return;
    this.#initializer = new UmbExtensionsApiInitializer(this._host, this.#registry as never, 'umbraDesktopContext', []) as never;
  }

  /** Destroy every package context this created. Calling it twice is harmless. */
  stop(): void {
    this.#initializer?.destroy();
    this.#initializer = undefined;
  }

  /** Stops first, so destroying the desktop destroys its package contexts. */
  override destroy(): void {
    this.stop();
    super.destroy();
  }
}
```

- [ ] **Step 5: Run, expect pass.** If "destroys on stop" fails because the initializer does not
destroy its apis, destroy them explicitly: keep the `onChange` callback's permitted controllers
(6th constructor argument) and call `destroy()` on each in `stop()`. Re-run.

- [ ] **Step 6: Wire it into the desktop element**

In `H/backoffice/src/desktop/components/desktop.element.ts`, add a field beside the other contexts:

```ts
  /**
   * Package contexts (`umbraDesktopContext`), alive from connect to disconnect only, so a package
   * service never outlives a visit to the desktop. See package-contexts.controller.ts.
   */
  #packageContexts = new UmbraDesktopPackageContextsController(this);
```

In `connectedCallback`, after `this.#watchOwnNotifications();`, add `this.#packageContexts.start();`.
In `disconnectedCallback`, after `this.#stopOwnNotifications = undefined;`, add `this.#packageContexts.stop();`.
Import `UmbraDesktopPackageContextsController` from `'../package-contexts.controller.js'`.

- [ ] **Step 7: Run the whole host suite and the build** (from `H`): `npm test` then `npm run build`. Both green.

### Task 2: `openApp(alias)` on the window manager

**Files:**
- Modify: `H/backoffice/src/desktop/window-manager.context.ts` (near `open`, line ~200)
- Modify: `H/backoffice/src/desktop/components/desktop.element.ts` (constructor)
- Test: `H/backoffice/src/desktop/window-manager.context.test.ts` (append; if the file is named differently, find it with `ls H/backoffice/src/desktop/*window-manager*test*`)

- [ ] **Step 1: Write the failing tests** (reuse that file's existing host setup and app factory;
the example below assumes a `manager` built the way its other tests build one, and an `app(alias)`
helper; adapt the names to the file).

```ts
it('opens an app by alias from the apps it was given, and says whether it did', () => {
  manager.useApps(() => [app('Pkg.Game')]);
  expect(manager.openApp('Pkg.Game')).to.equal(true);
  expect(manager.getWindows().map((w) => w.app.alias)).to.deep.equal(['Pkg.Game']);
});

it('opens nothing for an alias that is not an app the user can launch', () => {
  manager.useApps(() => [app('Pkg.Game')]);
  expect(manager.openApp('Pkg.Hidden')).to.equal(false);
  expect(manager.getWindows()).to.deep.equal([]);
});

it('opens nothing before it has been given apps', () => {
  expect(manager.openApp('Pkg.Game')).to.equal(false);
});
```

- [ ] **Step 2: Run, expect failure** (`useApps` is not a function).

- [ ] **Step 3: Implement**

```ts
  /** Where `openApp` looks an alias up; the app catalogue's current list, set by the desktop. */
  #appSource?: () => ReadonlyArray<UmbraDesktopApp>;

  /**
   * Tell the manager where launchable apps come from, so `openApp` can resolve an alias.
   *
   * A source rather than the catalogue context itself: the desktop element creates both, and handing
   * one to the other at construction avoids a context lookup between two siblings on the same host.
   * @param source Returns the apps the current user can launch right now.
   */
  public useApps(source: () => ReadonlyArray<UmbraDesktopApp>): void {
    this.#appSource = source;
  }

  /**
   * Open an app by its alias, as if from the launcher. **Published API**, for package apps that open
   * another app (the Arcade's Play button): `open` takes the resolved app the launcher holds, which a
   * package cannot build. An app hidden by a condition is not in the list, so it cannot be opened
   * this way either.
   * @param alias The app's manifest alias.
   * @returns Whether a window was opened or focused.
   */
  public openApp(alias: string): boolean {
    const app = this.#appSource?.().find((each) => each.alias === alias);
    if (!app) return false;
    this.open(app);
    return true;
  }
```

In the desktop element's constructor, right after `const catalogue = new UmbraDesktopAppCatalogueContext(this);`,
add `this.#manager.useApps(() => catalogue.getApps());` (confirm the method name at
`app-catalogue.context.ts` ~line 147; it is the "launchable apps right now" getter).

- [ ] **Step 4: Run, expect pass.** Then `npm test` and `npm run build` in `H`.

### Task 3: Host developer page

**Files:**
- Create: `docs/developer/desktop-contexts.md`
- Modify: `docs/developer/README.md` (bullet list, after package-catalogues), `docs/developer/desktop-apps.md` (§7, a one-line pointer), `docs/developer/package-catalogues.md` (no change unless it lists sibling pages)

- [ ] **Step 1: Read `docs/developer/writing-documentation.md`.** Follow it: front matter with a
stable `id`, relative links, short.

- [ ] **Step 2: Write the page**

```markdown
---
id: desktop-contexts
title: Desktop contexts
description: Run a package service on the desktop only, and open another app from yours.
sidebar_position: 6
---

# Running a service on the desktop

Some packages need code that runs while the desktop is open and never anywhere else. The Arcade is
one: it keeps score for games and checks, when you open the desktop, whether somebody beat you.

## 1. Why not a `globalContext`

Umbraco creates a `globalContext` at the root of the backoffice. That is the plain backoffice, and
every window on the desktop, since each window is a backoffice of its own. A `umbraDesktopContext`
is created by the desktop and nowhere else.

## 2. The manifest

    {
      type: 'umbraDesktopContext',
      alias: 'My.Package.Context',
      name: 'My package context',
      api: () => import('./my.context.js'),
    }

The api is a class extending `UmbContextBase`. Its constructor gets the desktop as host:

    export class MyContext extends UmbContextBase {
      constructor(host: UmbControllerHost) {
        super(host, MY_CONTEXT);
      }
    }
    export { MyContext as api };

## 3. When it lives

It is created when the desktop opens and destroyed when you leave it. Work that should happen once
per visit belongs in the constructor. `conditions` are honoured. If your api fails to load, the
console says so and the desktop carries on.

## 4. Reaching it from an app

Your apps are inside the desktop, so `this.consumeContext(MY_CONTEXT, ...)` finds it. Other packages
find it the same way, with a token built from the same alias string; nothing is imported. Keep a
fallback for when it is not there, as in [Building a desktop app](desktop-apps.md) §7.2.

## 5. Opening another app

The window manager is published for one call:

| | |
|---|---|
| Context alias | `'UmbraDesktopWindowManagerContext'` |
| `openApp(alias)` | Opens the app with that manifest alias, as the launcher would, and returns `true`. Returns `false` when the current user cannot launch it |
```

(Indented code blocks above stand in for fenced ones; write them fenced as `ts`.)

- [ ] **Step 3: Link it.** In `docs/developer/README.md` add after the package-catalogues bullet:

```markdown
- [Desktop contexts](desktop-contexts.md): run a package service on the desktop only with a
  `umbraDesktopContext` manifest, and open another app from yours.
```

Bump `attached-windows.md` and `writing-documentation.md` `sidebar_position` by one. In
`desktop-apps.md` §7, add one line:

```markdown
A service your app shares with others belongs in a [desktop context](desktop-contexts.md).
```

- [ ] **Step 4: Run** `npm run docs:check` in `H`. Green.

---

# Phase B: Arcade package scaffold

### Task 4: Create the projects

**Files:** everything listed under "Arcade server" folders as empty structure, plus:
- Create: `A/Umbraco.Community.UmbraDesktop.Services.Arcade.csproj`, `A/package.json`, `A/backoffice/{tsconfig.json,vite.config.ts,web-test-runner.config.mjs}`, `A/backoffice/public/umbraco-package.json`, `A/backoffice/src/{bundle.manifests.ts,shared/area.ts}`, `A/backoffice/src/localization/{manifest.ts,en.ts,nl.ts,parity.test.ts}`, `A/docs/product.json`, `A/README.md`
- Create: `AT/Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.csproj`
- Modify: `src/Directory.Packages.props`, `Umbraco.Community.UmbraDesktop.app.slnx`, `src/Umbraco.Community.UmbraDesktop.TestInstance/Umbraco.Community.UmbraDesktop.TestInstance.csproj`

- [ ] **Step 1: csproj.** Copy `src/Umbraco.Community.UmbraDesktop.Accessories/Umbraco.Community.UmbraDesktop.Accessories.csproj`
to `A/` under the new name and change only:
  - `Product`, `PackageId`, `RootNamespace` → `Umbraco.Community.UmbraDesktop.Services.Arcade`
  - `Title` → `UmbraDesktop Arcade service`
  - `Description` → `High scores and leaderboards for UmbraDesktop games. A service package: you get it with a game that uses it, such as UmbraDesktop Entertainment, and do not need to install it yourself.`
  - `PackageTags` → `umbraco;backoffice;desktop;umbradesktop;games;leaderboard;high-scores` (no `umbraco-marketplace`, D2)
  - `UmbracoPackageJsonPath` folder → `Umbraco.Community.UmbraDesktop.Services.Arcade`
  - Host ProjectReference comment: say it brings `Umbraco.Cms.Api.Management` for the controller.
  - Add to the MinVer/SourceLink ItemGroup:
    ```xml
    <!-- EF Core the Umbraco way (design D9). Every Umbraco site already carries it through the
         Umbraco.Cms metapackage; the range keeps this package building against the 17.0 floor. -->
    <PackageReference Include="Umbraco.Cms.Persistence.EFCore" />
    <!-- dotnet ef only, never shipped. -->
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" PrivateAssets="all" />
    ```
  - `<InternalsVisibleTo Include="Umbraco.Community.UmbraDesktop.Services.Arcade.Tests" />` in an ItemGroup.

- [ ] **Step 2: Central versions.** In `src/Directory.Packages.props`, Umbraco group:
`<PackageVersion Include="Umbraco.Cms.Persistence.EFCore" Version="[17.0.0,$(UmbraDesktopUmbracoMajorCeiling)]" />`.
Build-time group: `<PackageVersion Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.0" />`
(match the EF Core version `Umbraco.Cms.Persistence.EFCore` 17.0.0 depends on; check with
`dotnet list A package --include-transitive | grep EntityFrameworkCore` after restore and set the same).
Test group: `<PackageVersion Include="Microsoft.EntityFrameworkCore.Sqlite" Version="<same EF version>" />`.

- [ ] **Step 3: Front end.** Copy Accessories' `package.json` (name `umbradesktop-services-arcade`),
`backoffice/tsconfig.json`, `backoffice/web-test-runner.config.mjs` (keep `concurrency: 1` and its
comment), `backoffice/vite.config.ts` (outDir `../wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop.Services.Arcade`,
comment naming `umbradesktop-services-arcade.js`). `umbraco-package.json`:
```json
{
	"$schema": "../../umbraco-package-schema.json",
	"id": "Umbraco.Community.UmbraDesktop.Services.Arcade",
	"name": "UmbraDesktop Arcade service",
	"version": "GetsGenerated",
	"extensions": [
		{
			"type": "bundle",
			"alias": "Umbraco.Community.UmbraDesktop.Services.Arcade.Bundle",
			"name": "UmbraDesktop Arcade Bundle",
			"js": "/App_Plugins/Umbraco.Community.UmbraDesktop.Services.Arcade/umbradesktop-services-arcade.js"
		}
	]
}
```
`shared/area.ts`: `export const AREA = 'umbraDesktopArcade';` with a doc comment in the style of
Accessories'. Localization `manifest.ts`, `en.ts`, `nl.ts`, `parity.test.ts`: copy Accessories', rename
the area to `umbraDesktopArcade` and aliases to `UmbraDesktop.Arcade.Localization.En|Nl`, start with
only `groupGames: 'Games'` / `'Spellen'`. `bundle.manifests.ts` for now:
```ts
import { manifests as localizationManifests } from './localization/manifest.js';

/** The bundle Umbraco loads for this package. Filled in by later tasks. */
export const manifests: Array<UmbExtensionManifest> = [...localizationManifests];
```
Run `npm install` in `A` to produce `package-lock.json`.

- [ ] **Step 4: Test project.** Copy the Accessories test csproj to `AT/` under the new name,
referencing `..\Umbraco.Community.UmbraDesktop.Services.Arcade\Umbraco.Community.UmbraDesktop.Services.Arcade.csproj`,
fix the stale comment ("reaches the host through the add-on's project reference"), and add
`<PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" />`.

- [ ] **Step 5: Solution and TestInstance.** Add both projects to the `.slnx` after Accessories'.
Add `<ProjectReference Include="..\Umbraco.Community.UmbraDesktop.Services.Arcade\Umbraco.Community.UmbraDesktop.Services.Arcade.csproj" />`
to the TestInstance csproj. Do not add a marketplace json (D2) and no `.slnx` entry for one.

- [ ] **Step 6: Docs stubs.** `A/docs/product.json`:
`{ "id": "arcade", "name": "UmbraDesktop Arcade", "packageId": "Umbraco.Community.UmbraDesktop.Services.Arcade" }`.
`A/README.md`: the Accessories README skeleton, title "UmbraDesktop Arcade service", one paragraph
saying what it is and that game authors are the audience; filled in Task 27.

- [ ] **Step 7: Verify.** In `A`: `npm test` and `npm run build` green (one parity test). Then
`dotnet build A/Umbraco.Community.UmbraDesktop.Services.Arcade.csproj` and
`dotnet build AT/Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.csproj` succeed. Restore
writes `packages.lock.json` in both; keep them (lock files are committed in this repo).

---

# Phase C: Arcade server

### Task 5: Entities, contexts and migrations

**Files:** `A/Data/*` as listed in the file map. Test: `AT/MigrationsTests.cs`.

- [ ] **Step 1: Write the failing test**

```csharp
// AT/MigrationsTests.cs
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>The SQLite migrations build the schema the runtime model expects.</summary>
public class MigrationsTests
{
    /// <summary>
    /// Migrating an empty database leaves nothing pending and no model drift, which is what EF 9+
    /// would otherwise report at startup as <c>PendingModelChangesWarning</c>.
    /// </summary>
    [Fact]
    public async Task Sqlite_migrations_create_the_schema_with_nothing_pending()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<SqliteArcadeDbContext>()
            .UseSqlite(connection, x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable))
            .Options;
        await using var context = new SqliteArcadeDbContext(options);

        await context.Database.MigrateAsync();

        Assert.Empty(await context.Database.GetPendingMigrationsAsync());
        Assert.False(context.Database.HasPendingModelChanges());
        Assert.Equal(0, await context.Scores.CountAsync());
    }
}
```

- [ ] **Step 2: Run, expect failure** (type not found):
`dotnet test AT/Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.csproj --filter MigrationsTests`

- [ ] **Step 3: Entities.** Classes, not records: EF tracks and mutates them in place, which is the
one case the records rule exempts. Say so in each class doc.

```csharp
// A/Data/ArcadeProfileEntity.cs
namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// One player's Arcade settings. A class rather than a record because EF Core tracks and updates it
/// in place.
/// </summary>
public sealed class ArcadeProfileEntity
{
    /// <summary>The Umbraco user's key. No foreign key to <c>umbracoUser</c>: see design §6.</summary>
    public Guid UserKey { get; set; }

    /// <summary>The name the boards show, at most <see cref="Scores.ScoreRules.MaxDisplayNameLength"/> characters.</summary>
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>Whether the player's scores appear on the boards (D7). Private by default.</summary>
    public bool IsPublic { get; set; }

    /// <summary>Whether to be told when somebody takes first place from them (D10).</summary>
    public bool NotifyWhenBeaten { get; set; } = true;

    /// <summary>Whether the one-time "show your scores?" question has been answered.</summary>
    public bool AskedAboutPublic { get; set; }
}
```

```csharp
// A/Data/ArcadeLeaderboardEntity.cs
namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// The rules of one board, recorded from the game's manifest the first time a score arrives for it.
/// A class because EF Core tracks it.
/// </summary>
public sealed class ArcadeLeaderboardEntity
{
    /// <summary>The game's <c>umbraDesktopGame</c> manifest alias.</summary>
    public string Game { get; set; } = string.Empty;

    /// <summary>The board's alias within the game, e.g. <c>easy</c> or <c>draw-1</c>.</summary>
    public string Board { get; set; } = string.Empty;

    /// <summary><c>higher</c> or <c>lower</c>: which way is better.</summary>
    public string Better { get; set; } = string.Empty;

    /// <summary><c>points</c> or <c>time</c>; time values are milliseconds.</summary>
    public string Format { get; set; } = string.Empty;

    /// <summary>The smallest value accepted, if the game set one.</summary>
    public long? Min { get; set; }

    /// <summary>The largest value accepted, if the game set one.</summary>
    public long? Max { get; set; }
}
```

```csharp
// A/Data/ArcadeScoreEntity.cs
namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>A player's best on one board (D8). A class because EF Core updates it in place.</summary>
public sealed class ArcadeScoreEntity
{
    /// <summary>Surrogate key.</summary>
    public int Id { get; set; }

    /// <summary>Whose best it is.</summary>
    public Guid UserKey { get; set; }

    /// <summary>The game's manifest alias.</summary>
    public string Game { get; set; } = string.Empty;

    /// <summary>The board's alias.</summary>
    public string Board { get; set; } = string.Empty;

    /// <summary>The best value: points, or milliseconds for a time.</summary>
    public long Value { get; set; }

    /// <summary>When it was set, UTC. Breaks ties, earlier first. DateTime because SQLite cannot order DateTimeOffset.</summary>
    public DateTime AchievedAtUtc { get; set; }
}
```

```csharp
// A/Data/ArcadeBeatenEntity.cs
namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// An unread "somebody took first place from you" event (D10). At most one per player per board: a
/// newer one replaces it. A class because EF Core updates it in place.
/// </summary>
public sealed class ArcadeBeatenEntity
{
    /// <summary>Surrogate key.</summary>
    public int Id { get; set; }

    /// <summary>Who lost first place.</summary>
    public Guid UserKey { get; set; }

    /// <summary>The game's manifest alias.</summary>
    public string Game { get; set; } = string.Empty;

    /// <summary>The board's alias.</summary>
    public string Board { get; set; } = string.Empty;

    /// <summary>Who took it.</summary>
    public Guid ByUserKey { get; set; }

    /// <summary>The value they took it with.</summary>
    public long Value { get; set; }

    /// <summary>When, UTC. Events older than the prune age are removed by the scheduled job.</summary>
    public DateTime AtUtc { get; set; }
}
```

- [ ] **Step 4: Contexts.**

```csharp
// A/Data/ArcadeDbContext.cs
using Microsoft.EntityFrameworkCore;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// The Arcade's tables, registered with Umbraco through <c>AddUmbracoDbContext</c> (design D9).
/// </summary>
/// <remarks>
/// Two constructors, so not a primary constructor: the public one is what Umbraco's pooled factory
/// calls, and the protected one lets <see cref="SqlServerArcadeDbContext"/> and
/// <see cref="SqliteArcadeDbContext"/> pass their own options type, which is how EF keeps one
/// migration set per provider in one assembly.
/// </remarks>
public class ArcadeDbContext : DbContext
{
    /// <summary>Creates the runtime context.</summary>
    /// <param name="options">Umbraco's options, already pointed at the site's database.</param>
    public ArcadeDbContext(DbContextOptions<ArcadeDbContext> options) : base(options) { }

    /// <summary>Creates a provider-specific migration context.</summary>
    /// <param name="options">That context's options.</param>
    protected ArcadeDbContext(DbContextOptions options) : base(options) { }

    /// <summary>
    /// The Arcade's own migrations history table. EF's default, <c>__EFMigrationsHistory</c>, would be
    /// shared with any other EF context on the site, and dropping the Arcade's tables after an
    /// uninstall must not mean touching anyone else's history. Set by every place that builds a
    /// migrating context: the design-time factories, <c>ArcadeMigrator</c> and the tests.
    /// </summary>
    public const string MigrationsHistoryTable = "umbraDesktopArcadeMigrations";

    /// <summary>Players' settings.</summary>
    public DbSet<ArcadeProfileEntity> Profiles => Set<ArcadeProfileEntity>();

    /// <summary>Board rules.</summary>
    public DbSet<ArcadeLeaderboardEntity> Leaderboards => Set<ArcadeLeaderboardEntity>();

    /// <summary>Best scores.</summary>
    public DbSet<ArcadeScoreEntity> Scores => Set<ArcadeScoreEntity>();

    /// <summary>Unread beaten events.</summary>
    public DbSet<ArcadeBeatenEntity> Beaten => Set<ArcadeBeatenEntity>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ArcadeProfileEntity>(entity =>
        {
            entity.ToTable("umbraDesktopArcadeProfile");
            entity.HasKey(x => x.UserKey);
            entity.Property(x => x.DisplayName).HasMaxLength(Scores.ScoreRules.MaxDisplayNameLength).IsRequired();
        });
        modelBuilder.Entity<ArcadeLeaderboardEntity>(entity =>
        {
            entity.ToTable("umbraDesktopArcadeLeaderboard");
            entity.HasKey(x => new { x.Game, x.Board });
            entity.Property(x => x.Game).HasMaxLength(Scores.ScoreRules.MaxGameAliasLength);
            entity.Property(x => x.Board).HasMaxLength(Scores.ScoreRules.MaxBoardAliasLength);
            entity.Property(x => x.Better).HasMaxLength(10).IsRequired();
            entity.Property(x => x.Format).HasMaxLength(10).IsRequired();
        });
        modelBuilder.Entity<ArcadeScoreEntity>(entity =>
        {
            entity.ToTable("umbraDesktopArcadeScore");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Game).HasMaxLength(Scores.ScoreRules.MaxGameAliasLength).IsRequired();
            entity.Property(x => x.Board).HasMaxLength(Scores.ScoreRules.MaxBoardAliasLength).IsRequired();
            entity.HasIndex(x => new { x.UserKey, x.Game, x.Board }).IsUnique();
            entity.HasIndex(x => new { x.Game, x.Board });
        });
        modelBuilder.Entity<ArcadeBeatenEntity>(entity =>
        {
            entity.ToTable("umbraDesktopArcadeBeaten");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Game).HasMaxLength(Scores.ScoreRules.MaxGameAliasLength).IsRequired();
            entity.Property(x => x.Board).HasMaxLength(Scores.ScoreRules.MaxBoardAliasLength).IsRequired();
            entity.HasIndex(x => new { x.UserKey, x.Game, x.Board }).IsUnique();
            entity.HasIndex(x => x.ByUserKey);
            entity.HasIndex(x => x.AtUtc);
        });
    }
}
```

```csharp
// A/Data/SqlServerArcadeDbContext.cs
using Microsoft.EntityFrameworkCore;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// The SQL Server migration context. Exists only to own <c>Migrations/SqlServer</c>; the runtime
/// reads and writes through <see cref="ArcadeDbContext"/>. Microsoft's "multiple context types"
/// pattern for per-provider migrations (design D9).
/// </summary>
/// <param name="options">Options pointed at a SQL Server database.</param>
public sealed class SqlServerArcadeDbContext(DbContextOptions<SqlServerArcadeDbContext> options) : ArcadeDbContext(options);
```

```csharp
// A/Data/SqliteArcadeDbContext.cs
using Microsoft.EntityFrameworkCore;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>The SQLite migration context; see <see cref="SqlServerArcadeDbContext"/>.</summary>
/// <param name="options">Options pointed at a SQLite database.</param>
public sealed class SqliteArcadeDbContext(DbContextOptions<SqliteArcadeDbContext> options) : ArcadeDbContext(options);
```

```csharp
// A/Data/DesignTimeFactories.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// Lets <c>dotnet ef</c> build the SQL Server migration context from a class library, which has no
/// startup project to ask. The connection string is never opened: <c>migrations add</c> only reads
/// the model.
/// </summary>
public sealed class SqlServerArcadeDbContextFactory : IDesignTimeDbContextFactory<SqlServerArcadeDbContext>
{
    /// <inheritdoc />
    public SqlServerArcadeDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<SqlServerArcadeDbContext>()
            .UseSqlServer("Server=.;Database=design-time", x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable))
            .Options);
}

/// <summary>The same for SQLite.</summary>
public sealed class SqliteArcadeDbContextFactory : IDesignTimeDbContextFactory<SqliteArcadeDbContext>
{
    /// <inheritdoc />
    public SqliteArcadeDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<SqliteArcadeDbContext>()
            .UseSqlite("Data Source=design-time.db", x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable))
            .Options);
}
```

- [ ] **Step 5: Add `ScoreRules` constants it needs** (the rest of the class comes in Task 7):

```csharp
// A/Scores/ScoreRules.cs
namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>The Arcade's rules about values, names and aliases, in one place for the store and the API.</summary>
public static class ScoreRules
{
    /// <summary>The longest display name (D6).</summary>
    public const int MaxDisplayNameLength = 32;

    /// <summary>The longest game alias; manifest aliases are namespaced and long.</summary>
    public const int MaxGameAliasLength = 200;

    /// <summary>The longest board alias.</summary>
    public const int MaxBoardAliasLength = 64;
}
```

- [ ] **Step 6: Generate the migrations.** Install the tool if absent: `dotnet tool install --global dotnet-ef`.
From the repository root:
```bash
dotnet ef migrations add InitialCreate --project src/Umbraco.Community.UmbraDesktop.Services.Arcade --context SqlServerArcadeDbContext --output-dir Data/Migrations/SqlServer
dotnet ef migrations add InitialCreate --project src/Umbraco.Community.UmbraDesktop.Services.Arcade --context SqliteArcadeDbContext --output-dir Data/Migrations/Sqlite
```
Generated files carry no XML docs and `TreatWarningsAsErrors` is on. Add, at the top of each
generated file, `#pragma warning disable CS1591 // Generated by dotnet ef.` rather than hand-writing
docs into generated code; or add `<Compile Update="Data\Migrations\**\*.cs"><NoWarn>CS1591</NoWarn></Compile>`
if that is accepted by the SDK (prefer it: regenerated files then need no edit). Note the choice in
the csproj with a comment.

- [ ] **Step 7: Run the test, expect pass.** Then build `A` in Release.

### Task 6: The database seam and the SQLite test database

**Files:**
- Create: `A/Data/IArcadeDatabase.cs`, `A/Data/ScopedArcadeDatabase.cs`
- Create: `AT/SqliteTestDatabase.cs`, `AT/FakeUserDirectory.cs`
- Create: `A/Scores/IArcadeUserDirectory.cs`

- [ ] **Step 1: The seam**

```csharp
// A/Data/IArcadeDatabase.cs
namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// Runs a unit of work against the Arcade's tables, inside a transaction that commits when it returns
/// and rolls back when it throws.
/// </summary>
/// <remarks>
/// The one seam between the store and Umbraco's EF scope machinery, which cannot be built outside a
/// running Umbraco. Production goes through <see cref="ScopedArcadeDatabase"/>; tests through an
/// in-memory SQLite database migrated with the real migrations (design D9).
/// </remarks>
public interface IArcadeDatabase
{
    /// <summary>Run <paramref name="work"/> and commit.</summary>
    /// <typeparam name="T">What the work returns.</typeparam>
    /// <param name="work">The reads and writes. Call <c>SaveChangesAsync</c> inside it.</param>
    /// <returns>The work's result.</returns>
    Task<T> RunAsync<T>(Func<ArcadeDbContext, Task<T>> work);
}
```

```csharp
// A/Data/ScopedArcadeDatabase.cs
using Umbraco.Cms.Persistence.EFCore.Scoping;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// <see cref="IArcadeDatabase"/> over Umbraco's EF Core scope, so Arcade writes share the site's
/// connection and join any ambient Umbraco transaction.
/// </summary>
/// <param name="scopes">Umbraco's scope provider for the Arcade's context.</param>
public sealed class ScopedArcadeDatabase(IEFCoreScopeProvider<ArcadeDbContext> scopes) : IArcadeDatabase
{
    /// <inheritdoc />
    public async Task<T> RunAsync<T>(Func<ArcadeDbContext, Task<T>> work)
    {
        using var scope = scopes.CreateScope();
        var result = await scope.ExecuteWithContextAsync(work);
        scope.Complete();
        return result;
    }
}
```

- [ ] **Step 2: Who is hidden.** Disabled and locked users drop off the boards (design §6).

```csharp
// A/Scores/IArcadeUserDirectory.cs
namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>Answers which players should not appear on a board right now.</summary>
public interface IArcadeUserDirectory
{
    /// <summary>
    /// The subset of <paramref name="userKeys"/> that is disabled, locked out or no longer exists.
    /// </summary>
    /// <param name="userKeys">The players on a board.</param>
    /// <returns>The ones to leave out.</returns>
    Task<IReadOnlySet<Guid>> GetHiddenAsync(IReadOnlyCollection<Guid> userKeys);
}
```

- [ ] **Step 3: Test doubles**

```csharp
// AT/SqliteTestDatabase.cs
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>
/// An in-memory SQLite database built by the real SQLite migrations, kept open for one test, with
/// each unit of work in its own transaction as the scoped database does.
/// </summary>
internal sealed class SqliteTestDatabase : IArcadeDatabase, IAsyncDisposable
{
    /// <summary>The connection that keeps the in-memory database alive.</summary>
    private readonly SqliteConnection _connection;

    /// <summary>Options for contexts over <see cref="_connection"/>.</summary>
    private readonly DbContextOptions<SqliteArcadeDbContext> _options;

    /// <summary>Opens and migrates the database.</summary>
    private SqliteTestDatabase(SqliteConnection connection)
    {
        _connection = connection;
        _options = new DbContextOptionsBuilder<SqliteArcadeDbContext>()
            .UseSqlite(connection, x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable))
            .Options;
    }

    /// <summary>A fresh, migrated database.</summary>
    /// <returns>The database.</returns>
    public static async Task<SqliteTestDatabase> CreateAsync()
    {
        var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        var database = new SqliteTestDatabase(connection);
        await using var context = new SqliteArcadeDbContext(database._options);
        await context.Database.MigrateAsync();
        return database;
    }

    /// <inheritdoc />
    public async Task<T> RunAsync<T>(Func<ArcadeDbContext, Task<T>> work)
    {
        await using var context = new SqliteArcadeDbContext(_options);
        await using var transaction = await context.Database.BeginTransactionAsync();
        var result = await work(context);
        await transaction.CommitAsync();
        return result;
    }

    /// <summary>Read the tables directly, for assertions.</summary>
    /// <typeparam name="T">The answer.</typeparam>
    /// <param name="read">The query.</param>
    /// <returns>The answer.</returns>
    public Task<T> ReadAsync<T>(Func<ArcadeDbContext, Task<T>> read) => RunAsync(read);

    /// <inheritdoc />
    public ValueTask DisposeAsync() => _connection.DisposeAsync();
}
```

```csharp
// AT/FakeUserDirectory.cs
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>A user directory where a test says who is hidden.</summary>
internal sealed class FakeUserDirectory : IArcadeUserDirectory
{
    /// <summary>The players to hide.</summary>
    public HashSet<Guid> Hidden { get; } = [];

    /// <inheritdoc />
    public Task<IReadOnlySet<Guid>> GetHiddenAsync(IReadOnlyCollection<Guid> userKeys) =>
        Task.FromResult<IReadOnlySet<Guid>>(userKeys.Where(Hidden.Contains).ToHashSet());
}
```

- [ ] **Step 4: Build `AT`.** Compiles. (Exercised from Task 7 on.)

### Task 7: Score rules and submitting

**Files:**
- Modify: `A/Scores/ScoreRules.cs`
- Create: `A/Scores/LeaderboardDefinition.cs`, `A/Scores/ArcadeResults.cs`, `A/Scores/ArcadeStore.cs`
- Test: `AT/ScoreRulesTests.cs`, `AT/ArcadeStoreSubmitTests.cs`

- [ ] **Step 1: Failing tests for the pure rules**

```csharp
// AT/ScoreRulesTests.cs
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>The pure rules: what is better, what is valid, how names are cleaned.</summary>
public class ScoreRulesTests
{
    /// <summary>Higher-wins and lower-wins boards disagree about the same pair, and equal is never better.</summary>
    [Theory]
    [InlineData("higher", 20, 10, true)]
    [InlineData("higher", 10, 20, false)]
    [InlineData("lower", 10, 20, true)]
    [InlineData("lower", 20, 10, false)]
    [InlineData("higher", 10, 10, false)]
    [InlineData("lower", 10, 10, false)]
    public void Knows_which_way_is_better(string better, long candidate, long current, bool expected) =>
        Assert.Equal(expected, ScoreRules.IsBetter(better, candidate, current));

    /// <summary>Positive and inside the board's limits; anything else is refused (D12).</summary>
    [Theory]
    [InlineData(1, null, null, true)]
    [InlineData(0, null, null, false)]
    [InlineData(-5, null, null, false)]
    [InlineData(999, 1000L, null, false)]
    [InlineData(1000, 1000L, null, true)]
    [InlineData(5001, null, 5000L, false)]
    public void Accepts_only_positive_values_inside_the_limits(long value, long? min, long? max, bool expected) =>
        Assert.Equal(expected, ScoreRules.IsAcceptable(value, new LeaderboardDefinition("G", "b", "higher", "points", min, max)));

    /// <summary>Trimmed, inner whitespace collapsed, cut to 32, and never empty.</summary>
    [Theory]
    [InlineData("  Ada   Lovelace ", "Umbraco Name", "Ada Lovelace")]
    [InlineData("   ", "Umbraco Name", "Umbraco Name")]
    [InlineData(null, "", "Player")]
    [InlineData("abcdefghijklmnopqrstuvwxyz0123456789", "x", "abcdefghijklmnopqrstuvwxyz012345")]
    public void Cleans_display_names(string? requested, string fallback, string expected) =>
        Assert.Equal(expected, ScoreRules.CleanDisplayName(requested, fallback));

    /// <summary>Malformed definitions are refused before anything is stored.</summary>
    [Theory]
    [InlineData("Pkg.Game", "easy", "lower", "time", true)]
    [InlineData("", "easy", "lower", "time", false)]
    [InlineData("Pkg Game", "easy", "lower", "time", false)]
    [InlineData("Pkg.Game", "Easy Board", "lower", "time", false)]
    [InlineData("Pkg.Game", "easy", "sideways", "time", false)]
    [InlineData("Pkg.Game", "easy", "lower", "furlongs", false)]
    public void Validates_definitions(string game, string board, string better, string format, bool expected) =>
        Assert.Equal(expected, ScoreRules.IsWellFormed(new LeaderboardDefinition(game, board, better, format, null, null)));
}
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement the rules and the definition**

```csharp
// A/Scores/LeaderboardDefinition.cs
namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>A board's rules, as the game's <c>umbraDesktopGame</c> manifest declares them and every submit carries.</summary>
/// <param name="Game">The game's manifest alias.</param>
/// <param name="Board">The board's alias.</param>
/// <param name="Better"><c>higher</c> or <c>lower</c>.</param>
/// <param name="Format"><c>points</c> or <c>time</c> (milliseconds).</param>
/// <param name="Min">The smallest value accepted, if any.</param>
/// <param name="Max">The largest value accepted, if any.</param>
public sealed record LeaderboardDefinition(string Game, string Board, string Better, string Format, long? Min, long? Max);
```

Append to `ScoreRules`:

```csharp
    /// <summary>Game aliases: a manifest alias, letters, digits, dots, dashes and underscores.</summary>
    private static readonly System.Text.RegularExpressions.Regex GameAlias = new("^[A-Za-z0-9._-]+$");

    /// <summary>Board aliases: lower case, digits and dashes, like <c>draw-1</c>.</summary>
    private static readonly System.Text.RegularExpressions.Regex BoardAlias = new("^[a-z0-9-]+$");

    /// <summary>What a board shows when a player has no usable name at all.</summary>
    public const string FallbackDisplayName = "Player";

    /// <summary>Whether <paramref name="candidate"/> beats <paramref name="current"/> on a board where <paramref name="better"/> wins. Equal is not better (D8).</summary>
    /// <param name="better"><c>higher</c> or <c>lower</c>.</param>
    /// <param name="candidate">The new value.</param>
    /// <param name="current">The value to beat.</param>
    /// <returns>True when strictly better.</returns>
    public static bool IsBetter(string better, long candidate, long current) =>
        better == "lower" ? candidate < current : candidate > current;

    /// <summary>Positive and within the board's limits; the whole of the cheat protection (D12).</summary>
    /// <param name="value">The submitted value.</param>
    /// <param name="definition">The board.</param>
    /// <returns>True when it may be stored.</returns>
    public static bool IsAcceptable(long value, LeaderboardDefinition definition) =>
        value > 0 && (definition.Min is not { } min || value >= min) && (definition.Max is not { } max || value <= max);

    /// <summary>Whether a definition is one the Arcade can store.</summary>
    /// <param name="definition">The definition.</param>
    /// <returns>True when every field is valid.</returns>
    public static bool IsWellFormed(LeaderboardDefinition definition) =>
        definition.Game.Length is > 0 and <= MaxGameAliasLength && GameAlias.IsMatch(definition.Game)
        && definition.Board.Length is > 0 and <= MaxBoardAliasLength && BoardAlias.IsMatch(definition.Board)
        && definition.Better is "higher" or "lower"
        && definition.Format is "points" or "time"
        && (definition.Min is null || definition.Max is null || definition.Min <= definition.Max);

    /// <summary>
    /// A display name as the boards show it: trimmed, inner whitespace collapsed, at most
    /// <see cref="MaxDisplayNameLength"/> characters, falling back to the Umbraco name and then to
    /// <see cref="FallbackDisplayName"/>. No word filter (D6).
    /// </summary>
    /// <param name="requested">What the player typed, if anything.</param>
    /// <param name="fallback">The player's Umbraco name.</param>
    /// <returns>The name to store.</returns>
    public static string CleanDisplayName(string? requested, string? fallback)
    {
        static string Clean(string? text)
        {
            var collapsed = string.Join(' ', (text ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
            return collapsed.Length > MaxDisplayNameLength ? collapsed[..MaxDisplayNameLength].TrimEnd() : collapsed;
        }

        var name = Clean(requested);
        if (name.Length == 0) name = Clean(fallback);
        return name.Length == 0 ? FallbackDisplayName : name;
    }
```

Note the operator precedence in `IsWellFormed`: `is "higher" or "lower"` binds as a pattern, which is
what is meant. Run `ScoreRulesTests`, expect pass.

- [ ] **Step 4: Failing tests for submitting**

```csharp
// AT/ArcadeStoreSubmitTests.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>Submitting a score: what is kept, what is refused, what comes back.</summary>
public class ArcadeStoreSubmitTests : IAsyncLifetime
{
    /// <summary>Minesweeper's easy board: lower wins, a time.</summary>
    internal static readonly LeaderboardDefinition Easy = new("Pkg.Minesweeper.Game", "easy", "lower", "time", null, null);

    /// <summary>Snake: higher wins, points.</summary>
    internal static readonly LeaderboardDefinition Snake = new("Pkg.Snake.Game", "default", "higher", "points", null, null);

    /// <summary>Two players.</summary>
    internal static readonly Guid Ada = Guid.Parse("00000000-0000-0000-0000-00000000000a"), Grace = Guid.Parse("00000000-0000-0000-0000-00000000000b");

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The clock, so ties can be arranged.</summary>
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero));

    /// <summary>The store under test.</summary>
    private ArcadeStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new ArcadeStore(_database, new FakeUserDirectory(), _clock);
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>The first score is a personal best with no previous best, and creates a private profile under the Umbraco name.</summary>
    [Fact]
    public async Task First_score_is_a_best_and_creates_a_private_profile()
    {
        var result = await _store.SubmitAsync(Ada, "Ada Lovelace", Easy, 9_400);

        Assert.Equal(SubmitStatus.Accepted, result.Status);
        Assert.True(result.IsPersonalBest);
        Assert.Null(result.PreviousBest);
        Assert.Equal(1, result.Rank);
        Assert.False(result.IsPublic);
        Assert.False(result.AskedAboutPublic);
        var profile = await _database.ReadAsync(db => db.Profiles.SingleAsync());
        Assert.Equal("Ada Lovelace", profile.DisplayName);
    }

    /// <summary>On a lower-wins board a faster time replaces the best and a slower one changes nothing.</summary>
    [Fact]
    public async Task Keeps_only_the_best_on_a_lower_wins_board()
    {
        await _store.SubmitAsync(Ada, "Ada", Easy, 9_400);
        var slower = await _store.SubmitAsync(Ada, "Ada", Easy, 12_000);
        var faster = await _store.SubmitAsync(Ada, "Ada", Easy, 8_100);

        Assert.False(slower.IsPersonalBest);
        Assert.True(faster.IsPersonalBest);
        Assert.Equal(9_400, faster.PreviousBest);
        Assert.Equal(8_100, (await _database.ReadAsync(db => db.Scores.SingleAsync())).Value);
    }

    /// <summary>On a higher-wins board it is the other way round.</summary>
    [Fact]
    public async Task Keeps_only_the_best_on_a_higher_wins_board()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Ada, "Ada", Snake, 120);

        Assert.Equal(300, (await _database.ReadAsync(db => db.Scores.SingleAsync())).Value);
    }

    /// <summary>An equal value ranks behind whoever set it first (D8).</summary>
    [Fact]
    public async Task Ties_go_to_whoever_was_first()
    {
        await _store.UpdateProfileAsync(Ada, "Ada", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        _clock.Advance(TimeSpan.FromMinutes(1));

        var grace = await _store.SubmitAsync(Grace, "Grace", Snake, 300);

        Assert.Equal(2, grace.Rank);
    }

    /// <summary>Zero, negative and out-of-limit values are refused and nothing is stored (D12).</summary>
    [Fact]
    public async Task Refuses_unacceptable_values()
    {
        var limited = Easy with { Min = 1_000 };

        Assert.Equal(SubmitStatus.Rejected, (await _store.SubmitAsync(Ada, "Ada", Easy, 0)).Status);
        Assert.Equal(SubmitStatus.Rejected, (await _store.SubmitAsync(Ada, "Ada", limited, 500)).Status);
        Assert.Equal(0, await _database.ReadAsync(db => db.Scores.CountAsync()));
    }

    /// <summary>A malformed definition is refused before anything is stored.</summary>
    [Fact]
    public async Task Refuses_malformed_definitions()
    {
        var result = await _store.SubmitAsync(Ada, "Ada", Easy with { Better = "sideways" }, 10);

        Assert.Equal(SubmitStatus.Rejected, result.Status);
        Assert.Equal(0, await _database.ReadAsync(db => db.Leaderboards.CountAsync()));
    }

    /// <summary>The board is recorded on first sight and a later submit describing it differently is refused (§4).</summary>
    [Fact]
    public async Task Refuses_a_board_described_differently()
    {
        await _store.SubmitAsync(Ada, "Ada", Easy, 9_400);

        var result = await _store.SubmitAsync(Grace, "Grace", Easy with { Better = "higher" }, 9_000);

        Assert.Equal(SubmitStatus.Conflict, result.Status);
        Assert.Equal(1, await _database.ReadAsync(db => db.Scores.CountAsync()));
    }
}
```

- [ ] **Step 5: Run, expect failure.**

- [ ] **Step 6: Implement results and `SubmitAsync`.**

```csharp
// A/Scores/ArcadeResults.cs
namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>How a submit went.</summary>
public enum SubmitStatus
{
    /// <summary>Checked and recorded (as a best, or as not one).</summary>
    Accepted,

    /// <summary>The value or the definition was invalid; nothing was stored.</summary>
    Rejected,

    /// <summary>The board is already recorded with different rules; nothing was stored.</summary>
    Conflict,
}

/// <summary>What a submit tells the game, and through it the player.</summary>
/// <param name="Status">How it went.</param>
/// <param name="IsPersonalBest">Whether it replaced the player's best.</param>
/// <param name="PreviousBest">The best it replaced, or null for a first score.</param>
/// <param name="Rank">The player's rank on the board, counting public players and themselves; their would-be rank when private.</param>
/// <param name="IsPublic">Whether the player is shown on the boards.</param>
/// <param name="AskedAboutPublic">Whether the player has answered the one-time question (D7).</param>
/// <param name="DisplayName">The player's display name, for prefilling that question.</param>
public sealed record SubmitResult(SubmitStatus Status, bool IsPersonalBest, long? PreviousBest, int Rank, bool IsPublic, bool AskedAboutPublic, string DisplayName)
{
    /// <summary>A refusal of the given kind.</summary>
    /// <param name="status">Rejected or Conflict.</param>
    /// <returns>The result.</returns>
    public static SubmitResult Refused(SubmitStatus status) => new(status, false, null, 0, false, false, string.Empty);
}
```

```csharp
// A/Scores/ArcadeStore.cs
using Microsoft.EntityFrameworkCore;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>
/// Everything the Arcade stores: profiles, boards, best scores and beaten events, with the rules of
/// design §4 to §6.
/// </summary>
/// <param name="database">Where the tables are.</param>
/// <param name="users">Who is hidden from the boards right now.</param>
/// <param name="clock">The site's clock.</param>
public sealed class ArcadeStore(IArcadeDatabase database, IArcadeUserDirectory users, TimeProvider clock)
{
    /// <summary>
    /// Check a score against the player's best, keep it if it is better, and say where it ranks.
    /// </summary>
    /// <param name="userKey">The player.</param>
    /// <param name="umbracoName">Their Umbraco name, for a new profile's display name.</param>
    /// <param name="definition">The board, from the game's manifest.</param>
    /// <param name="value">The score: points, or milliseconds.</param>
    /// <returns>How it went.</returns>
    public async Task<SubmitResult> SubmitAsync(Guid userKey, string umbracoName, LeaderboardDefinition definition, long value)
    {
        if (!ScoreRules.IsWellFormed(definition) || !ScoreRules.IsAcceptable(value, definition))
        {
            return SubmitResult.Refused(SubmitStatus.Rejected);
        }

        var now = clock.GetUtcNow().UtcDateTime;
        return await database.RunAsync(async db =>
        {
            var board = await db.Leaderboards.FindAsync(definition.Game, definition.Board);
            if (board is null)
            {
                db.Leaderboards.Add(new ArcadeLeaderboardEntity
                {
                    Game = definition.Game, Board = definition.Board, Better = definition.Better,
                    Format = definition.Format, Min = definition.Min, Max = definition.Max,
                });
            }
            else if (board.Better != definition.Better || board.Format != definition.Format || board.Min != definition.Min || board.Max != definition.Max)
            {
                return SubmitResult.Refused(SubmitStatus.Conflict);
            }

            var profile = await db.Profiles.FindAsync(userKey);
            if (profile is null)
            {
                profile = new ArcadeProfileEntity { UserKey = userKey, DisplayName = ScoreRules.CleanDisplayName(null, umbracoName) };
                db.Profiles.Add(profile);
            }

            var leaderBefore = await LeaderAsync(db, definition);
            var score = await db.Scores.SingleOrDefaultAsync(s => s.UserKey == userKey && s.Game == definition.Game && s.Board == definition.Board);
            var previous = score?.Value;
            var isBest = score is null || ScoreRules.IsBetter(definition.Better, value, score.Value);
            if (score is null)
            {
                score = new ArcadeScoreEntity { UserKey = userKey, Game = definition.Game, Board = definition.Board };
                db.Scores.Add(score);
            }

            if (isBest)
            {
                score.Value = value;
                score.AchievedAtUtc = now;
            }

            await db.SaveChangesAsync();

            if (isBest)
            {
                await RecordBeatenAsync(db, definition, leaderBefore, userKey, value, now);
            }

            var ranked = await RankedAsync(db, definition, userKey);
            var rank = ranked.FindIndex(s => s.UserKey == userKey) + 1;
            return new SubmitResult(SubmitStatus.Accepted, isBest, previous, rank, profile.IsPublic, profile.AskedAboutPublic, profile.DisplayName);
        });
    }

    /// <summary>
    /// A board's scores in rank order: public players who are not hidden, plus
    /// <paramref name="alwaysInclude"/> whatever their settings. Loaded whole, which is fine: a board
    /// has at most one row per user of the site.
    /// </summary>
    /// <param name="db">The context.</param>
    /// <param name="definition">The board.</param>
    /// <param name="alwaysInclude">A player to keep even when private or hidden (the viewer), or null.</param>
    /// <returns>The ranked scores.</returns>
    private async Task<List<ArcadeScoreEntity>> RankedAsync(ArcadeDbContext db, LeaderboardDefinition definition, Guid? alwaysInclude)
    {
        var rows = await db.Scores
            .Where(s => s.Game == definition.Game && s.Board == definition.Board)
            .Join(db.Profiles, s => s.UserKey, p => p.UserKey, (s, p) => new { Score = s, p.IsPublic })
            .ToListAsync();
        var hidden = await users.GetHiddenAsync(rows.Select(r => r.Score.UserKey).ToArray());
        var visible = rows
            .Where(r => r.Score.UserKey == alwaysInclude || (r.IsPublic && !hidden.Contains(r.Score.UserKey)))
            .Select(r => r.Score);
        var ordered = definition.Better == "lower" ? visible.OrderBy(s => s.Value) : visible.OrderByDescending(s => s.Value);
        return ordered.ThenBy(s => s.AchievedAtUtc).ToList();
    }

    /// <summary>The public, visible player in first place, or null on an empty board.</summary>
    /// <param name="db">The context.</param>
    /// <param name="definition">The board.</param>
    /// <returns>The leader's key.</returns>
    private async Task<Guid?> LeaderAsync(ArcadeDbContext db, LeaderboardDefinition definition) =>
        (await RankedAsync(db, definition, null)).FirstOrDefault()?.UserKey;

    /// <summary>Filled in by Task 9; a no-op until then.</summary>
    /// <param name="db">The context.</param>
    /// <param name="definition">The board.</param>
    /// <param name="leaderBefore">Who led before this score.</param>
    /// <param name="userKey">Who just scored.</param>
    /// <param name="value">What they scored.</param>
    /// <param name="now">When.</param>
    /// <returns>A task.</returns>
    private static Task RecordBeatenAsync(ArcadeDbContext db, LeaderboardDefinition definition, Guid? leaderBefore, Guid userKey, long value, DateTime now) =>
        Task.CompletedTask;
}
```

`Ties_go_to_whoever_was_first` calls `UpdateProfileAsync`, which Task 8 adds. Add the minimal
version now so this file compiles (Task 8's tests then pin the rest):

```csharp
    /// <summary>Change a player's settings, creating their profile if needed. Null leaves a field alone.</summary>
    /// <param name="userKey">The player.</param>
    /// <param name="umbracoName">Their Umbraco name, the display name's fallback.</param>
    /// <param name="displayName">A new display name.</param>
    /// <param name="isPublic">Show or hide their scores; answering also marks the one-time question as asked.</param>
    /// <param name="notifyWhenBeaten">Whether to be told when beaten.</param>
    /// <returns>The profile as saved.</returns>
    public Task<ArcadeProfile> UpdateProfileAsync(Guid userKey, string umbracoName, string? displayName, bool? isPublic, bool? notifyWhenBeaten) =>
        database.RunAsync(async db =>
        {
            var profile = await db.Profiles.FindAsync(userKey);
            if (profile is null)
            {
                profile = new ArcadeProfileEntity { UserKey = userKey, DisplayName = ScoreRules.CleanDisplayName(null, umbracoName) };
                db.Profiles.Add(profile);
            }

            if (displayName is not null) profile.DisplayName = ScoreRules.CleanDisplayName(displayName, umbracoName);
            if (isPublic is { } shown) { profile.IsPublic = shown; profile.AskedAboutPublic = true; }
            if (notifyWhenBeaten is { } notify) profile.NotifyWhenBeaten = notify;
            await db.SaveChangesAsync();
            return ArcadeProfile.From(profile);
        });
```

and in `ArcadeResults.cs`:

```csharp
/// <summary>A player's Arcade settings, as the API returns them.</summary>
/// <param name="DisplayName">Their board name.</param>
/// <param name="IsPublic">Whether they are shown.</param>
/// <param name="NotifyWhenBeaten">Whether they are told when beaten.</param>
/// <param name="AskedAboutPublic">Whether they have answered the one-time question.</param>
public sealed record ArcadeProfile(string DisplayName, bool IsPublic, bool NotifyWhenBeaten, bool AskedAboutPublic)
{
    /// <summary>The API's view of a stored profile.</summary>
    /// <param name="entity">The row.</param>
    /// <returns>The profile.</returns>
    public static ArcadeProfile From(Data.ArcadeProfileEntity entity) =>
        new(entity.DisplayName, entity.IsPublic, entity.NotifyWhenBeaten, entity.AskedAboutPublic);
}
```

- [ ] **Step 7: Run `ArcadeStoreSubmitTests` and `ScoreRulesTests`, expect pass.**

### Task 8: Profiles, boards and bests

**Files:** Modify `A/Scores/ArcadeStore.cs`, `A/Scores/ArcadeResults.cs`. Test: `AT/ArcadeStoreBoardTests.cs`.

- [ ] **Step 1: Failing tests**

```csharp
// AT/ArcadeStoreBoardTests.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;
using static Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.ArcadeStoreSubmitTests;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>Reading boards, bests and profiles: who is shown, who is not, and where the viewer stands.</summary>
public class ArcadeStoreBoardTests : IAsyncLifetime
{
    /// <summary>A third player.</summary>
    private static readonly Guid Linus = Guid.Parse("00000000-0000-0000-0000-00000000000c");

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>Who is hidden.</summary>
    private readonly FakeUserDirectory _users = new();

    /// <summary>The clock.</summary>
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero));

    /// <summary>The store under test.</summary>
    private ArcadeStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new ArcadeStore(_database, _users, _clock);
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>Submit as a public player.</summary>
    private async Task PublicScore(Guid user, string name, long value)
    {
        await _store.UpdateProfileAsync(user, name, null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(user, name, Snake, value);
        _clock.Advance(TimeSpan.FromSeconds(1));
    }

    /// <summary>Public players in rank order; a private player is left off for everyone else.</summary>
    [Fact]
    public async Task Shows_public_players_in_rank_order_and_leaves_private_ones_off()
    {
        await PublicScore(Ada, "Ada", 300);
        await PublicScore(Grace, "Grace", 500);
        await _store.SubmitAsync(Linus, "Linus", Snake, 900);

        var board = await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board);

        Assert.Equal(["Grace", "Ada"], board.Top.Select(e => e.DisplayName));
        Assert.Equal([1, 2], board.Top.Select(e => e.Rank));
    }

    /// <summary>A private viewer still sees their own row, with the rank they would have (D7).</summary>
    [Fact]
    public async Task A_private_viewer_sees_their_own_row_and_would_be_rank()
    {
        await PublicScore(Grace, "Grace", 500);
        await _store.SubmitAsync(Linus, "Linus", Snake, 900);

        var board = await _store.GetBoardAsync(Linus, Snake.Game, Snake.Board);

        Assert.DoesNotContain(board.Top, e => e.UserKey == Linus);
        Assert.NotNull(board.Viewer);
        Assert.Equal(1, board.Viewer!.Rank);
        Assert.False(board.ViewerIsPublic);
    }

    /// <summary>Only the top ten are listed; the viewer below them is still returned separately.</summary>
    [Fact]
    public async Task Lists_ten_and_returns_the_viewer_beyond_them()
    {
        for (var i = 0; i < 12; i++)
        {
            await PublicScore(Guid.NewGuid(), $"P{i}", 1_000 + i);
        }
        await PublicScore(Ada, "Ada", 5);

        var board = await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board);

        Assert.Equal(10, board.Top.Count);
        Assert.Equal(13, board.Viewer!.Rank);
    }

    /// <summary>Going private hides at once; going public again brings the scores back (D7).</summary>
    [Fact]
    public async Task Going_private_hides_and_going_public_restores()
    {
        await PublicScore(Ada, "Ada", 300);
        await _store.UpdateProfileAsync(Ada, "Ada", null, isPublic: false, notifyWhenBeaten: null);
        Assert.Empty((await _store.GetBoardAsync(Grace, Snake.Game, Snake.Board)).Top);

        await _store.UpdateProfileAsync(Ada, "Ada", null, isPublic: true, notifyWhenBeaten: null);
        Assert.Single((await _store.GetBoardAsync(Grace, Snake.Game, Snake.Board)).Top);
    }

    /// <summary>Disabled or locked players drop off without anything being deleted (§6).</summary>
    [Fact]
    public async Task Hidden_players_are_left_off()
    {
        await PublicScore(Ada, "Ada", 300);
        _users.Hidden.Add(Ada);

        Assert.Empty((await _store.GetBoardAsync(Grace, Snake.Game, Snake.Board)).Top);
    }

    /// <summary>A board nobody has played has no definition and no rows, rather than failing.</summary>
    [Fact]
    public async Task An_unplayed_board_is_empty()
    {
        var board = await _store.GetBoardAsync(Ada, "Pkg.Nothing", "default");

        Assert.Null(board.Definition);
        Assert.Empty(board.Top);
        Assert.Null(board.Viewer);
    }

    /// <summary>A player's best, for Snake's in-game display, and nothing for a board they have not played.</summary>
    [Fact]
    public async Task Reads_a_players_best()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);

        Assert.Equal(300, await _store.GetBestAsync(Ada, Snake.Game, Snake.Board));
        Assert.Null(await _store.GetBestAsync(Grace, Snake.Game, Snake.Board));
    }

    /// <summary>A player with no profile reads defaults without one being created: private, notified, not yet asked.</summary>
    [Fact]
    public async Task A_new_player_reads_default_settings()
    {
        var profile = await _store.GetProfileAsync(Ada, "Ada Lovelace");

        Assert.Equal(new ArcadeProfile("Ada Lovelace", false, true, false), profile);
        Assert.Equal(0, await _database.ReadAsync(db => db.Profiles.CountAsync()));
    }
}
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement.** In `ArcadeResults.cs`:

```csharp
/// <summary>One row on a board.</summary>
/// <param name="Rank">Position, from 1.</param>
/// <param name="UserKey">The player, so an admin can act on the row.</param>
/// <param name="DisplayName">Their board name.</param>
/// <param name="Value">Their best.</param>
/// <param name="AchievedAtUtc">When they set it.</param>
/// <param name="IsViewer">Whether it is the person looking.</param>
public sealed record BoardEntry(int Rank, Guid UserKey, string DisplayName, long Value, DateTime AchievedAtUtc, bool IsViewer);

/// <summary>A board as the hub shows it.</summary>
/// <param name="Definition">The board's rules, or null when nobody has played it.</param>
/// <param name="Top">The top public rows.</param>
/// <param name="Viewer">The viewer's own row, whether or not it is in <paramref name="Top"/> or public; null if they have not played.</param>
/// <param name="ViewerIsPublic">Whether the viewer is shown to others.</param>
public sealed record BoardView(LeaderboardDefinition? Definition, IReadOnlyList<BoardEntry> Top, BoardEntry? Viewer, bool ViewerIsPublic);
```

In `ArcadeStore`:

```csharp
    /// <summary>How many rows a board lists (D7, §7).</summary>
    public const int BoardSize = 10;

    /// <summary>A board for one viewer: the top public rows and the viewer's own standing.</summary>
    /// <param name="viewer">Who is looking.</param>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>The board.</returns>
    public Task<BoardView> GetBoardAsync(Guid viewer, string game, string board) =>
        database.RunAsync(async db =>
        {
            var entity = await db.Leaderboards.FindAsync(game, board);
            if (entity is null) return new BoardView(null, [], null, false);

            var definition = new LeaderboardDefinition(entity.Game, entity.Board, entity.Better, entity.Format, entity.Min, entity.Max);
            var names = await db.Profiles.ToDictionaryAsync(p => p.UserKey, p => p.DisplayName);
            var profile = await db.Profiles.FindAsync(viewer);
            var publicRanked = await RankedAsync(db, definition, null);
            var top = publicRanked.Take(BoardSize)
                .Select((s, i) => new BoardEntry(i + 1, s.UserKey, names[s.UserKey], s.Value, s.AchievedAtUtc, s.UserKey == viewer))
                .ToList();

            BoardEntry? mine = null;
            var withViewer = await RankedAsync(db, definition, viewer);
            var index = withViewer.FindIndex(s => s.UserKey == viewer);
            if (index >= 0)
            {
                var score = withViewer[index];
                mine = new BoardEntry(index + 1, viewer, names[viewer], score.Value, score.AchievedAtUtc, true);
            }

            return new BoardView(definition, top, mine, profile?.IsPublic ?? false);
        });

    /// <summary>A player's best on a board, or null if they have not played it.</summary>
    /// <param name="userKey">The player.</param>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>The best value.</returns>
    public Task<long?> GetBestAsync(Guid userKey, string game, string board) =>
        database.RunAsync(db => db.Scores
            .Where(s => s.UserKey == userKey && s.Game == game && s.Board == board)
            .Select(s => (long?)s.Value)
            .SingleOrDefaultAsync());

    /// <summary>A player's settings, or the defaults if they have none yet. Never creates a row.</summary>
    /// <param name="userKey">The player.</param>
    /// <param name="umbracoName">Their Umbraco name, the default display name.</param>
    /// <returns>The settings.</returns>
    public Task<ArcadeProfile> GetProfileAsync(Guid userKey, string umbracoName) =>
        database.RunAsync(async db => await db.Profiles.FindAsync(userKey) is { } profile
            ? ArcadeProfile.From(profile)
            : new ArcadeProfile(ScoreRules.CleanDisplayName(null, umbracoName), false, true, false));
```

The viewer's rank with `RankedAsync(db, definition, viewer)` counts the viewer among public players,
which for a public viewer is their real rank and for a private one their would-be rank, exactly the
number `SubmitAsync` returns.

- [ ] **Step 4: Run all `AT` tests, expect pass.**

### Task 9: Beaten events

**Files:** Modify `A/Scores/ArcadeStore.cs`, `A/Scores/ArcadeResults.cs`. Test: `AT/ArcadeStoreBeatenTests.cs`.

- [ ] **Step 1: Failing tests**

```csharp
// AT/ArcadeStoreBeatenTests.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;
using static Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.ArcadeStoreSubmitTests;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>When "you were beaten" is recorded, handed out and pruned (D10).</summary>
public class ArcadeStoreBeatenTests : IAsyncLifetime
{
    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The clock.</summary>
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero));

    /// <summary>The store under test.</summary>
    private ArcadeStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new ArcadeStore(_database, new FakeUserDirectory(), _clock);
        await _store.UpdateProfileAsync(Ada, "Ada", null, isPublic: true, notifyWhenBeaten: null);
        await _store.UpdateProfileAsync(Grace, "Grace", null, isPublic: true, notifyWhenBeaten: null);
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>Taking first place from a public, notifiable player records one event for them, handed out once.</summary>
    [Fact]
    public async Task Taking_first_place_tells_the_previous_leader_once()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);

        var events = await _store.TakeBeatenAsync(Ada);

        var only = Assert.Single(events);
        Assert.Equal(new BeatenEvent(Snake.Game, Snake.Board, "Grace", 500, "points"), only);
        Assert.Empty(await _store.TakeBeatenAsync(Ada));
    }

    /// <summary>Passing someone below first place says nothing.</summary>
    [Fact]
    public async Task Losing_second_place_says_nothing()
    {
        var linus = Guid.NewGuid();
        await _store.UpdateProfileAsync(linus, "Linus", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(linus, "Linus", Snake, 900);
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);

        Assert.Empty(await _store.TakeBeatenAsync(Ada));
    }

    /// <summary>A private scorer cannot beat anyone publicly, and a leader who turned notifications off is not told.</summary>
    [Fact]
    public async Task Private_scorers_and_unnotifiable_leaders_record_nothing()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.UpdateProfileAsync(Grace, "Grace", null, isPublic: false, notifyWhenBeaten: null);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        Assert.Empty(await _store.TakeBeatenAsync(Ada));

        await _store.UpdateProfileAsync(Ada, "Ada", null, isPublic: null, notifyWhenBeaten: false);
        await _store.UpdateProfileAsync(Grace, "Grace", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(Grace, "Grace", Snake, 600);
        Assert.Empty(await _store.TakeBeatenAsync(Ada));
    }

    /// <summary>Beating your own record is not being beaten.</summary>
    [Fact]
    public async Task Improving_your_own_lead_records_nothing()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Ada, "Ada", Snake, 400);

        Assert.Empty(await _store.TakeBeatenAsync(Ada));
    }

    /// <summary>Only the latest event per player per board is kept.</summary>
    [Fact]
    public async Task Keeps_only_the_latest_event_per_board()
    {
        var linus = Guid.NewGuid();
        await _store.UpdateProfileAsync(linus, "Linus", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        await _store.SubmitAsync(Ada, "Ada", Snake, 600);
        await _store.SubmitAsync(linus, "Linus", Snake, 700);

        var events = await _store.TakeBeatenAsync(Ada);

        Assert.Equal("Linus", Assert.Single(events).ByDisplayName);
    }

    /// <summary>Events older than the given age are pruned; newer ones stay.</summary>
    [Fact]
    public async Task Prunes_old_events()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        _clock.Advance(TimeSpan.FromDays(31));

        Assert.Equal(1, await _store.PruneBeatenAsync(TimeSpan.FromDays(30)));
        Assert.Equal(0, await _database.ReadAsync(db => db.Beaten.CountAsync()));
    }
}
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement.** `ArcadeResults.cs`:

```csharp
/// <summary>"Somebody took first place from you", as the desktop shows it.</summary>
/// <param name="Game">The game's manifest alias.</param>
/// <param name="Board">The board's alias.</param>
/// <param name="ByDisplayName">Who took it.</param>
/// <param name="Value">With what.</param>
/// <param name="Format"><c>points</c> or <c>time</c>, for showing the value.</param>
public sealed record BeatenEvent(string Game, string Board, string ByDisplayName, long Value, string Format);
```

Replace the stub `RecordBeatenAsync` in `ArcadeStore` (make it an instance method, drop `static`):

```csharp
    /// <summary>
    /// Record that <paramref name="leaderBefore"/> lost first place, if they did, to this score, and
    /// want to know (D10). Only a public scorer taking first place from someone else counts.
    /// </summary>
    /// <param name="db">The context.</param>
    /// <param name="definition">The board.</param>
    /// <param name="leaderBefore">Who led before this score.</param>
    /// <param name="userKey">Who just scored.</param>
    /// <param name="value">What they scored.</param>
    /// <param name="now">When.</param>
    /// <returns>A task.</returns>
    private async Task RecordBeatenAsync(ArcadeDbContext db, LeaderboardDefinition definition, Guid? leaderBefore, Guid userKey, long value, DateTime now)
    {
        if (leaderBefore is not { } beaten || beaten == userKey || await LeaderAsync(db, definition) != userKey)
        {
            return;
        }

        if (await db.Profiles.FindAsync(beaten) is not { NotifyWhenBeaten: true, IsPublic: true })
        {
            return;
        }

        var row = await db.Beaten.SingleOrDefaultAsync(b => b.UserKey == beaten && b.Game == definition.Game && b.Board == definition.Board);
        if (row is null)
        {
            row = new ArcadeBeatenEntity { UserKey = beaten, Game = definition.Game, Board = definition.Board };
            db.Beaten.Add(row);
        }

        row.ByUserKey = userKey;
        row.Value = value;
        row.AtUtc = now;
        await db.SaveChangesAsync();
    }

    /// <summary>Hand out a player's unread beaten events and delete them, in one transaction, so two tabs cannot both show one.</summary>
    /// <param name="userKey">The player.</param>
    /// <returns>Their events, newest first.</returns>
    public Task<IReadOnlyList<BeatenEvent>> TakeBeatenAsync(Guid userKey) =>
        database.RunAsync<IReadOnlyList<BeatenEvent>>(async db =>
        {
            var rows = await db.Beaten.Where(b => b.UserKey == userKey).OrderByDescending(b => b.AtUtc).ToListAsync();
            var events = new List<BeatenEvent>();
            foreach (var row in rows)
            {
                var by = await db.Profiles.FindAsync(row.ByUserKey);
                var board = await db.Leaderboards.FindAsync(row.Game, row.Board);
                if (by is not null && board is not null)
                {
                    events.Add(new BeatenEvent(row.Game, row.Board, by.DisplayName, row.Value, board.Format));
                }
            }

            db.Beaten.RemoveRange(rows);
            await db.SaveChangesAsync();
            return events;
        });

    /// <summary>Delete beaten events nobody read within <paramref name="age"/> (§6).</summary>
    /// <param name="age">How long an unread event is kept.</param>
    /// <returns>How many were removed.</returns>
    public Task<int> PruneBeatenAsync(TimeSpan age)
    {
        var cutoff = clock.GetUtcNow().UtcDateTime - age;
        return database.RunAsync(db => db.Beaten.Where(b => b.AtUtc < cutoff).ExecuteDeleteAsync());
    }
```

Also add `using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;` if missing.

- [ ] **Step 4: Run all `AT` tests, expect pass.**

### Task 10: Admin actions and forgetting a user

**Files:** Modify `A/Scores/ArcadeStore.cs`. Test: `AT/ArcadeStoreAdminTests.cs`.

- [ ] **Step 1: Failing tests**

```csharp
// AT/ArcadeStoreAdminTests.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;
using static Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.ArcadeStoreSubmitTests;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>Moderation (D11), deleting your own scores, and a deleted user (§6).</summary>
public class ArcadeStoreAdminTests : IAsyncLifetime
{
    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The store under test.</summary>
    private ArcadeStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new ArcadeStore(_database, new FakeUserDirectory(), new FakeTimeProvider(DateTimeOffset.UnixEpoch.AddYears(56)));
        await _store.UpdateProfileAsync(Ada, "Ada", "Ace", isPublic: true, notifyWhenBeaten: null);
        await _store.UpdateProfileAsync(Grace, "Grace", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        await _store.SubmitAsync(Ada, "Ada", Easy, 9_000);
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>Removing one score leaves the player's other boards alone.</summary>
    [Fact]
    public async Task Removes_one_score()
    {
        Assert.True(await _store.RemoveScoreAsync(Snake.Game, Snake.Board, Ada));
        Assert.False(await _store.RemoveScoreAsync(Snake.Game, Snake.Board, Ada));
        Assert.Equal(9_000, await _store.GetBestAsync(Ada, Easy.Game, Easy.Board));
    }

    /// <summary>Resetting a board removes its scores, its rules and its unread events, and nothing else.</summary>
    [Fact]
    public async Task Resets_a_board()
    {
        Assert.True(await _store.ResetBoardAsync(Snake.Game, Snake.Board));

        Assert.Null((await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board)).Definition);
        Assert.Equal(0, await _database.ReadAsync(db => db.Beaten.CountAsync()));
        Assert.Equal(9_000, await _store.GetBestAsync(Ada, Easy.Game, Easy.Board));
    }

    /// <summary>Resetting a display name puts the Umbraco name back.</summary>
    [Fact]
    public async Task Resets_a_display_name()
    {
        Assert.True(await _store.ResetDisplayNameAsync(Ada, "Ada Lovelace"));

        Assert.Equal("Ada Lovelace", (await _store.GetProfileAsync(Ada, "x")).DisplayName);
    }

    /// <summary>Forgetting a user removes their profile, scores and every event they are in, either side.</summary>
    [Fact]
    public async Task Forgets_a_user_entirely()
    {
        await _store.ForgetUserAsync(Grace);

        Assert.Equal(0, await _database.ReadAsync(db => db.Scores.CountAsync(s => s.UserKey == Grace)));
        Assert.Equal(0, await _database.ReadAsync(db => db.Profiles.CountAsync(p => p.UserKey == Grace)));
        Assert.Equal(0, await _database.ReadAsync(db => db.Beaten.CountAsync()));
        Assert.Equal("Ace", (await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board)).Top[0].DisplayName);
    }
}
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

```csharp
    /// <summary>Remove one player's score from one board (D11).</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <param name="userKey">The player.</param>
    /// <returns>Whether there was one.</returns>
    public Task<bool> RemoveScoreAsync(string game, string board, Guid userKey) =>
        database.RunAsync(async db =>
            await db.Scores.Where(s => s.Game == game && s.Board == board && s.UserKey == userKey).ExecuteDeleteAsync() > 0);

    /// <summary>Empty a board: its scores, its recorded rules and its unread events (D11).</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>Whether the board existed.</returns>
    public Task<bool> ResetBoardAsync(string game, string board) =>
        database.RunAsync(async db =>
        {
            await db.Scores.Where(s => s.Game == game && s.Board == board).ExecuteDeleteAsync();
            await db.Beaten.Where(b => b.Game == game && b.Board == board).ExecuteDeleteAsync();
            return await db.Leaderboards.Where(l => l.Game == game && l.Board == board).ExecuteDeleteAsync() > 0;
        });

    /// <summary>Put a player's display name back to their Umbraco name (D11).</summary>
    /// <param name="userKey">The player.</param>
    /// <param name="umbracoName">Their Umbraco name.</param>
    /// <returns>Whether they had a profile.</returns>
    public Task<bool> ResetDisplayNameAsync(Guid userKey, string umbracoName) =>
        database.RunAsync(async db =>
        {
            if (await db.Profiles.FindAsync(userKey) is not { } profile) return false;
            profile.DisplayName = ScoreRules.CleanDisplayName(null, umbracoName);
            await db.SaveChangesAsync();
            return true;
        });

    /// <summary>
    /// Remove everything about a player: profile, scores, and beaten events on either side. Used for
    /// "delete my scores" and when the Umbraco user is deleted (§6).
    /// </summary>
    /// <param name="userKey">The player.</param>
    /// <returns>A task.</returns>
    public Task ForgetUserAsync(Guid userKey) =>
        database.RunAsync(async db =>
        {
            await db.Beaten.Where(b => b.UserKey == userKey || b.ByUserKey == userKey).ExecuteDeleteAsync();
            await db.Scores.Where(s => s.UserKey == userKey).ExecuteDeleteAsync();
            await db.Profiles.Where(p => p.UserKey == userKey).ExecuteDeleteAsync();
            return true;
        });
```

- [ ] **Step 4: Run all `AT` tests, expect pass.**

### Task 11: The Umbraco user directory

**Files:** Create `A/Scores/UmbracoArcadeUserDirectory.cs`. Test: append to `AT/ArcadeComposerTests.cs` (created here).

- [ ] **Step 1: Failing test**

```csharp
// AT/ArcadeComposerTests.cs (first test; Task 13 adds more)
using NSubstitute;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>The Arcade's wiring into Umbraco.</summary>
public class ArcadeComposerTests
{
    /// <summary>Disabled, locked and missing users are hidden; active ones are not (§6).</summary>
    [Fact]
    public async Task Hides_disabled_locked_and_missing_users()
    {
        var active = User(UserState.Active);
        var disabled = User(UserState.Disabled);
        var locked = User(UserState.LockedOut);
        var missing = Guid.NewGuid();
        var service = Substitute.For<IUserService>();
        service.GetAsync(Arg.Any<IEnumerable<Guid>>()).Returns([active, disabled, locked]);

        var hidden = await new UmbracoArcadeUserDirectory(service).GetHiddenAsync([active.Key, disabled.Key, locked.Key, missing]);

        Assert.Equal(new HashSet<Guid> { disabled.Key, locked.Key, missing }, hidden);
    }

    /// <summary>A user substitute in the given state.</summary>
    private static IUser User(UserState state)
    {
        var user = Substitute.For<IUser>();
        user.Key.Returns(Guid.NewGuid());
        user.UserState.Returns(state);
        return user;
    }
}
```

- [ ] **Step 2: Run, expect failure.** If `IUserService.GetAsync(IEnumerable<Guid>)` does not exist at
17.0, find the keyed batch read on `IUserService` (`grep -n "Task<IEnumerable<IUser>>" ` in the
decompiled interface or Umbraco-CMS `release-17.0.0` source) and use that in both test and code.

- [ ] **Step 3: Implement**

```csharp
// A/Scores/UmbracoArcadeUserDirectory.cs
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>
/// Hides players whose Umbraco account is disabled, locked out or gone, so a colleague who left drops
/// off the boards without anyone deleting anything (design §6).
/// </summary>
/// <param name="users">Umbraco's user service.</param>
public sealed class UmbracoArcadeUserDirectory(IUserService users) : IArcadeUserDirectory
{
    /// <inheritdoc />
    public async Task<IReadOnlySet<Guid>> GetHiddenAsync(IReadOnlyCollection<Guid> userKeys)
    {
        if (userKeys.Count == 0) return new HashSet<Guid>();
        var found = (await users.GetAsync(userKeys)).ToDictionary(u => u.Key);
        return userKeys
            .Where(key => !found.TryGetValue(key, out var user) || user.UserState is UserState.Disabled or UserState.LockedOut)
            .ToHashSet();
    }
}
```

- [ ] **Step 4: Run, expect pass.**

### Task 12: The controller

**Files:** Create `A/Api/ArcadeModels.cs`, `A/Api/ArcadeController.cs`. Test: `AT/ArcadeControllerTests.cs`.

- [ ] **Step 1: Failing tests**

```csharp
// AT/ArcadeControllerTests.cs
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Api;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>Who may call what, and how each outcome reaches the browser.</summary>
public class ArcadeControllerTests : IAsyncLifetime
{
    /// <summary>A board request for Snake.</summary>
    private static readonly SubmitScoreRequestModel SnakeScore = new("Pkg.Snake.Game", "default", "higher", "points", null, null, 300);

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The store under test.</summary>
    private ArcadeStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new ArcadeStore(_database, new FakeUserDirectory(), new FakeTimeProvider());
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>Without the Desktop section every action is forbidden, admin ones included.</summary>
    [Fact]
    public async Task Forbids_users_without_the_desktop_section()
    {
        var outsider = As(Guid.NewGuid(), "Mallory", "Umb.Section.Content");

        Assert.IsType<ForbidResult>(await outsider.GetProfile());
        Assert.IsType<ForbidResult>(await outsider.SubmitScore(SnakeScore));
        Assert.IsType<ForbidResult>(await outsider.GetBoard("Pkg.Snake.Game", "default"));
        Assert.IsType<ForbidResult>(await outsider.TakeBeaten());
        Assert.IsType<ForbidResult>(await outsider.ResetBoard("Pkg.Snake.Game", "default"));
    }

    /// <summary>Admin actions need the Users section as well (D11).</summary>
    [Fact]
    public async Task Admin_actions_need_the_users_section()
    {
        var player = As(Guid.NewGuid(), "Ada", ArcadeController.DesktopSectionAlias);
        var admin = As(Guid.NewGuid(), "Root", ArcadeController.DesktopSectionAlias, ArcadeController.UsersSectionAlias);
        await player.SubmitScore(SnakeScore);

        Assert.IsType<ForbidResult>(await player.ResetBoard("Pkg.Snake.Game", "default"));
        Assert.IsType<OkResult>(await admin.ResetBoard("Pkg.Snake.Game", "default"));
    }

    /// <summary>A submit answers with the result; a refused one with problem details the client can read.</summary>
    [Fact]
    public async Task Submits_and_refuses_with_problem_details()
    {
        var player = As(Guid.NewGuid(), "Ada", ArcadeController.DesktopSectionAlias);

        var ok = Assert.IsType<OkObjectResult>(await player.SubmitScore(SnakeScore));
        Assert.True(Assert.IsType<SubmitScoreResponseModel>(ok.Value).IsPersonalBest);

        var bad = Assert.IsType<BadRequestObjectResult>(await player.SubmitScore(SnakeScore with { Value = 0 }));
        Assert.Equal("ArcadeScoreRejected", Assert.IsType<ProblemDetails>(bad.Value).Type);

        var clash = Assert.IsType<ConflictObjectResult>(await player.SubmitScore(SnakeScore with { Better = "lower" }));
        Assert.Equal("ArcadeBoardConflict", Assert.IsType<ProblemDetails>(clash.Value).Type);
    }

    /// <summary>The board says whether the viewer may moderate it, so the hub knows to draw the buttons.</summary>
    [Fact]
    public async Task A_board_says_whether_the_viewer_may_moderate()
    {
        var player = As(Guid.NewGuid(), "Ada", ArcadeController.DesktopSectionAlias);
        await player.SubmitScore(SnakeScore);

        var board = Assert.IsType<BoardResponseModel>(Assert.IsType<OkObjectResult>(await player.GetBoard("Pkg.Snake.Game", "default")).Value);

        Assert.False(board.CanModerate);
        Assert.Equal(300, board.Viewer!.Value);
    }

    /// <summary>A controller acting for one user.</summary>
    private ArcadeController As(Guid key, string name, params string[] sections)
    {
        var user = Substitute.For<IUser>();
        user.Key.Returns(key);
        user.Name.Returns(name);
        user.AllowedSections.Returns(sections);
        var security = Substitute.For<IBackOfficeSecurity>();
        security.CurrentUser.Returns(user);
        var accessor = Substitute.For<IBackOfficeSecurityAccessor>();
        accessor.BackOfficeSecurity.Returns(security);
        return new ArcadeController(_store, accessor);
    }
}
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Models**

```csharp
// A/Api/ArcadeModels.cs
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Api;

/// <summary>A score and the board it belongs to, as the game's manifest declares it.</summary>
/// <param name="Game">The game's manifest alias.</param>
/// <param name="Board">The board's alias.</param>
/// <param name="Better"><c>higher</c> or <c>lower</c>.</param>
/// <param name="Format"><c>points</c> or <c>time</c>.</param>
/// <param name="Min">The smallest value accepted, if any.</param>
/// <param name="Max">The largest value accepted, if any.</param>
/// <param name="Value">The score.</param>
public sealed record SubmitScoreRequestModel(string Game, string Board, string Better, string Format, long? Min, long? Max, long Value)
{
    /// <summary>The board part, as the store takes it.</summary>
    /// <returns>The definition.</returns>
    public LeaderboardDefinition ToDefinition() => new(Game, Board, Better, Format, Min, Max);
}

/// <summary>What a submit answers.</summary>
/// <param name="IsPersonalBest">Whether it replaced the player's best.</param>
/// <param name="PreviousBest">The best it replaced.</param>
/// <param name="Rank">Rank, or would-be rank when private.</param>
/// <param name="IsPublic">Whether the player is shown.</param>
/// <param name="AskedAboutPublic">Whether the one-time question has been answered.</param>
/// <param name="DisplayName">The player's display name, to prefill that question.</param>
public sealed record SubmitScoreResponseModel(bool IsPersonalBest, long? PreviousBest, int Rank, bool IsPublic, bool AskedAboutPublic, string DisplayName);

/// <summary>A change to the caller's settings; a null field is left alone.</summary>
/// <param name="DisplayName">A new display name.</param>
/// <param name="IsPublic">Show or hide their scores.</param>
/// <param name="NotifyWhenBeaten">Whether to be told when beaten.</param>
public sealed record UpdateProfileRequestModel(string? DisplayName, bool? IsPublic, bool? NotifyWhenBeaten);

/// <summary>One board row.</summary>
/// <param name="Rank">Position.</param>
/// <param name="UserKey">The player.</param>
/// <param name="DisplayName">Their name.</param>
/// <param name="Value">Their best.</param>
/// <param name="AchievedAtUtc">When.</param>
/// <param name="IsViewer">Whether it is the caller.</param>
public sealed record BoardEntryModel(int Rank, Guid UserKey, string DisplayName, long Value, DateTime AchievedAtUtc, bool IsViewer)
{
    /// <summary>From the store's row.</summary>
    /// <param name="entry">The row.</param>
    /// <returns>The model.</returns>
    public static BoardEntryModel From(BoardEntry entry) =>
        new(entry.Rank, entry.UserKey, entry.DisplayName, entry.Value, entry.AchievedAtUtc, entry.IsViewer);
}

/// <summary>A board for the caller.</summary>
/// <param name="Played">Whether anybody has played it.</param>
/// <param name="Top">The top public rows.</param>
/// <param name="Viewer">The caller's own row, if they have played.</param>
/// <param name="ViewerIsPublic">Whether the caller is shown.</param>
/// <param name="CanModerate">Whether the caller may remove rows and reset the board.</param>
public sealed record BoardResponseModel(bool Played, IReadOnlyList<BoardEntryModel> Top, BoardEntryModel? Viewer, bool ViewerIsPublic, bool CanModerate);

/// <summary>A player's best.</summary>
/// <param name="Value">The best, or null if they have not played.</param>
public sealed record BestResponseModel(long? Value);
```

- [ ] **Step 4: Controller.** Follow `StickyNotesController.cs` (Accessories) for attributes, the
section check and problem details. Async actions returning `Task<IActionResult>`.

```csharp
// A/Api/ArcadeController.cs
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Api;

/// <summary>
/// The Arcade's management API: the caller's profile, submitting scores, reading boards, beaten
/// events, and moderation.
/// </summary>
/// <remarks>
/// <para>
/// <b>Who may use it.</b> Anyone with the Desktop section, checked in each action as Sticky Notes
/// does, because Umbraco has no policy for a package's own section.
/// </para>
/// <para>
/// <b>Who may moderate.</b> Anyone who also has the Users section (D11): they already manage people.
/// </para>
/// <para>
/// Errors are problem details, because the backoffice's HTTP client replaces any other error body
/// with a generic one before the caller sees it.
/// </para>
/// </remarks>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/services/arcade")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
public class ArcadeController(ArcadeStore store, IBackOfficeSecurityAccessor securityAccessor) : ManagementApiControllerBase
{
    /// <summary>The Desktop section's alias, the host's <c>UMBRADESKTOP_SECTION_ALIAS</c>; the host ships no C# constant.</summary>
    public const string DesktopSectionAlias = "Umbraco.Community.UmbraDesktop.Section";

    /// <summary>Umbraco's Users section, the moderation gate (D11).</summary>
    public const string UsersSectionAlias = "Umb.Section.Users";

    /// <summary>The caller's settings, or the defaults.</summary>
    /// <returns>The profile.</returns>
    [HttpGet("profile")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(ArcadeProfile), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetProfile() =>
        Caller() is { } user ? Ok(await store.GetProfileAsync(user.Key, user.Name ?? string.Empty)) : Forbid();

    /// <summary>Change the caller's settings.</summary>
    /// <param name="model">The fields to change.</param>
    /// <returns>The profile as saved.</returns>
    [HttpPut("profile")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(ArcadeProfile), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateProfile(UpdateProfileRequestModel model) =>
        Caller() is { } user
            ? Ok(await store.UpdateProfileAsync(user.Key, user.Name ?? string.Empty, model.DisplayName, model.IsPublic, model.NotifyWhenBeaten))
            : Forbid();

    /// <summary>Delete everything the Arcade holds about the caller.</summary>
    /// <returns>200.</returns>
    [HttpDelete("profile")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteProfile()
    {
        if (Caller() is not { } user) return Forbid();
        await store.ForgetUserAsync(user.Key);
        return Ok();
    }

    /// <summary>Submit a score.</summary>
    /// <param name="model">The score and its board.</param>
    /// <returns>The result, 400 for an invalid value or definition, 409 for a board described differently.</returns>
    [HttpPost("scores")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(SubmitScoreResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SubmitScore(SubmitScoreRequestModel model)
    {
        if (Caller() is not { } user) return Forbid();
        var result = await store.SubmitAsync(user.Key, user.Name ?? string.Empty, model.ToDefinition(), model.Value);
        return result.Status switch
        {
            SubmitStatus.Accepted => Ok(new SubmitScoreResponseModel(result.IsPersonalBest, result.PreviousBest, result.Rank, result.IsPublic, result.AskedAboutPublic, result.DisplayName)),
            SubmitStatus.Conflict => Conflict(Problem("ArcadeBoardConflict", "This board is already recorded with different rules", StatusCodes.Status409Conflict)),
            _ => BadRequest(Problem("ArcadeScoreRejected", "The score or its board is not valid", StatusCodes.Status400BadRequest)),
        };
    }

    /// <summary>A board for the caller.</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>The board.</returns>
    [HttpGet("boards/{game}/{board}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(BoardResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetBoard(string game, string board)
    {
        if (Caller() is not { } user) return Forbid();
        var view = await store.GetBoardAsync(user.Key, game, board);
        return Ok(new BoardResponseModel(
            view.Definition is not null,
            view.Top.Select(BoardEntryModel.From).ToArray(),
            view.Viewer is null ? null : BoardEntryModel.From(view.Viewer),
            view.ViewerIsPublic,
            CanModerate(user)));
    }

    /// <summary>The caller's best on a board.</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>The best.</returns>
    [HttpGet("best/{game}/{board}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(BestResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetBest(string game, string board) =>
        Caller() is { } user ? Ok(new BestResponseModel(await store.GetBestAsync(user.Key, game, board))) : Forbid();

    /// <summary>Hand out the caller's unread beaten events, once.</summary>
    /// <returns>The events.</returns>
    [HttpPost("beaten/take")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(IReadOnlyList<BeatenEvent>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> TakeBeaten() =>
        Caller() is { } user ? Ok(await store.TakeBeatenAsync(user.Key)) : Forbid();

    /// <summary>Remove one player's score (admin).</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <param name="userKey">The player.</param>
    /// <returns>200, or 404.</returns>
    [HttpDelete("boards/{game}/{board}/scores/{userKey:guid}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RemoveScore(string game, string board, Guid userKey) =>
        Caller() is { } user && CanModerate(user)
            ? (await store.RemoveScoreAsync(game, board, userKey) ? Ok() : NotFound())
            : Forbid();

    /// <summary>Empty a board (admin).</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>200, or 404.</returns>
    [HttpDelete("boards/{game}/{board}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ResetBoard(string game, string board) =>
        Caller() is { } user && CanModerate(user)
            ? (await store.ResetBoardAsync(game, board) ? Ok() : NotFound())
            : Forbid();

    /// <summary>Put a player's display name back to their Umbraco name (admin).</summary>
    /// <param name="userKey">The player.</param>
    /// <param name="users">Umbraco's user service, to read the player's Umbraco name.</param>
    /// <returns>200, or 404.</returns>
    [HttpPost("profiles/{userKey:guid}/reset-name")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ResetName(Guid userKey, [FromServices] Umbraco.Cms.Core.Services.IUserService users)
    {
        if (Caller() is not { } user || !CanModerate(user)) return Forbid();
        var target = await users.GetAsync(userKey);
        return await store.ResetDisplayNameAsync(userKey, target?.Name ?? string.Empty) ? Ok() : NotFound();
    }

    /// <summary>The current user, if they have the Desktop section.</summary>
    /// <returns>The user, or null.</returns>
    private IUser? Caller()
    {
        var user = securityAccessor.BackOfficeSecurity?.CurrentUser;
        return user is not null && user.AllowedSections.Contains(DesktopSectionAlias) ? user : null;
    }

    /// <summary>Whether a user may moderate (D11).</summary>
    /// <param name="user">The user.</param>
    /// <returns>True with the Users section.</returns>
    private static bool CanModerate(IUser user) => user.AllowedSections.Contains(UsersSectionAlias);

    /// <summary>Problem details the backoffice's client passes through intact.</summary>
    /// <param name="type">A stable type the front end can switch on.</param>
    /// <param name="title">A readable title.</param>
    /// <param name="status">The status.</param>
    /// <returns>The problem.</returns>
    private static ProblemDetails Problem(string type, string title, int status) => new() { Type = type, Title = title, Status = status };
}
```

`IUserService.GetAsync(Guid)` may be named differently at 17.0; if so use the keyed single read the
service offers. Add this test to `ArcadeControllerTests`:

```csharp
    /// <summary>Resetting a name is moderation too.</summary>
    [Fact]
    public async Task Resetting_a_name_needs_the_users_section()
    {
        var users = Substitute.For<Umbraco.Cms.Core.Services.IUserService>();
        var player = As(Guid.NewGuid(), "Ada", ArcadeController.DesktopSectionAlias);

        Assert.IsType<ForbidResult>(await player.ResetName(Guid.NewGuid(), users));
    }
```

- [ ] **Step 5: Run all `AT` tests, expect pass.** Also confirm (Task 29) that the Users section
alias really is `Umb.Section.Users` on a running instance, by reading a user's `allowedSections`
from `/umbraco/management/api/v1/user/current`.

### Task 13: Composer, migrations at startup, user deletion, pruning job

**Files:** Create `A/Composing/{ArcadeComposer,ArcadeMigrator,ArcadeMigrationHandlers,ArcadeUserDeletedHandler,ArcadeBeatenPruneJob}.cs`.
Tests: append to `AT/ArcadeComposerTests.cs`; create `AT/ArcadeUserDeletedHandlerTests.cs`.

- [ ] **Step 1: Failing tests**

```csharp
// append to AT/ArcadeComposerTests.cs
    /// <summary>The store, its seams, the controller's dependencies and the job are registered; the site's clock is left alone.</summary>
    [Fact]
    public void Registers_the_arcade_and_leaves_the_clock_alone()
    {
        var services = new Microsoft.Extensions.DependencyInjection.ServiceCollection();
        var builder = Substitute.For<Umbraco.Cms.Core.DependencyInjection.IUmbracoBuilder>();
        builder.Services.Returns(services);

        new Composing.ArcadeComposer().Compose(builder);

        Assert.Contains(services, d => d.ServiceType == typeof(ArcadeStore));
        Assert.Contains(services, d => d.ServiceType == typeof(Data.IArcadeDatabase));
        Assert.Contains(services, d => d.ServiceType == typeof(IArcadeUserDirectory));
        Assert.Contains(services, d => d.ServiceType == typeof(Umbraco.Cms.Infrastructure.BackgroundJobs.IRecurringBackgroundJob));
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(TimeProvider));
    }

    /// <summary>Migrations wait for a running site; an install or upgrade in progress is left alone.</summary>
    [Fact]
    public async Task Does_not_migrate_before_the_site_runs()
    {
        var runtime = Substitute.For<Umbraco.Cms.Core.Services.IRuntimeState>();
        runtime.Level.Returns(Umbraco.Cms.Core.RuntimeLevel.Install);
        var connections = Substitute.For<Microsoft.Extensions.Options.IOptionsMonitor<Umbraco.Cms.Core.Configuration.Models.ConnectionStrings>>();

        await new Composing.ArcadeMigrator(connections, runtime, Microsoft.Extensions.Logging.Abstractions.NullLogger<Composing.ArcadeMigrator>.Instance)
            .MigrateAsync(requireRunLevel: true);

        _ = connections.DidNotReceive().CurrentValue;
    }

    /// <summary>The pruning job removes beaten events older than thirty days (§6).</summary>
    [Fact]
    public async Task The_prune_job_removes_events_older_than_thirty_days()
    {
        await using var database = await SqliteTestDatabase.CreateAsync();
        var clock = new Microsoft.Extensions.Time.Testing.FakeTimeProvider(new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero));
        var store = new ArcadeStore(database, new FakeUserDirectory(), clock);
        var (ada, grace) = (Guid.NewGuid(), Guid.NewGuid());
        await store.UpdateProfileAsync(ada, "Ada", null, true, null);
        await store.UpdateProfileAsync(grace, "Grace", null, true, null);
        var snake = new LeaderboardDefinition("Pkg.Snake.Game", "default", "higher", "points", null, null);
        await store.SubmitAsync(ada, "Ada", snake, 1);
        await store.SubmitAsync(grace, "Grace", snake, 2);
        clock.Advance(TimeSpan.FromDays(31));

        await new Composing.ArcadeBeatenPruneJob(store).RunJobAsync();

        Assert.Empty(await store.TakeBeatenAsync(ada));
    }
```

```csharp
// AT/ArcadeUserDeletedHandlerTests.cs
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>A deleted Umbraco user leaves nothing behind (§6).</summary>
public class ArcadeUserDeletedHandlerTests
{
    /// <summary>Their profile and scores are gone after the notification.</summary>
    [Fact]
    public async Task Forgets_the_deleted_user()
    {
        await using var database = await SqliteTestDatabase.CreateAsync();
        var store = new ArcadeStore(database, new FakeUserDirectory(), new FakeTimeProvider());
        var key = Guid.NewGuid();
        await store.SubmitAsync(key, "Ada", new LeaderboardDefinition("Pkg.G", "default", "higher", "points", null, null), 5);
        var user = Substitute.For<IUser>();
        user.Key.Returns(key);

        await new ArcadeUserDeletedHandler(store).HandleAsync(new UserDeletedNotification(user, new EventMessages()), CancellationToken.None);

        Assert.Null(await store.GetBestAsync(key, "Pkg.G", "default"));
    }
}
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

```csharp
// A/Composing/ArcadeUserDeletedHandler.cs
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>
/// Removes a deleted user's Arcade rows (design §6).
/// </summary>
/// <remarks>
/// <c>UserDeletedNotification</c> rather than <c>UserDeleting</c>, which the host's
/// <c>DesktopUserDataCleanupHandler</c> uses: that one has to clear rows before a foreign key
/// refuses the delete, and the Arcade's tables have no foreign key to <c>umbracoUser</c>. Deleted
/// fires only after the delete has committed, so a rolled-back delete costs nobody their scores. The
/// backoffice only hard-deletes users who never signed in, who cannot have scores; this covers
/// <c>IUserService.Delete(user, true)</c> and whatever Umbraco does later.
/// </remarks>
/// <param name="store">The Arcade's store.</param>
public sealed class ArcadeUserDeletedHandler(ArcadeStore store) : INotificationAsyncHandler<UserDeletedNotification>
{
    /// <inheritdoc />
    public async Task HandleAsync(UserDeletedNotification notification, CancellationToken cancellationToken)
    {
        foreach (var user in notification.DeletedEntities)
        {
            await store.ForgetUserAsync(user.Key);
        }
    }
}
```

```csharp
// A/Composing/ArcadeBeatenPruneJob.cs
using Umbraco.Cms.Infrastructure.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>Daily removal of beaten events nobody read within thirty days (§6).</summary>
/// <remarks>
/// Implements the 17.0 shape of <see cref="IRecurringBackgroundJob"/>, <c>RunJobAsync()</c> with no
/// token: 17.5 added a token overload that forwards to this one, so it works across every 17.
/// Default server roles, so on a load-balanced site only the scheduling server runs it.
/// </remarks>
/// <param name="store">The Arcade's store.</param>
public sealed class ArcadeBeatenPruneJob(ArcadeStore store) : IRecurringBackgroundJob
{
    /// <summary>How long an unread event is kept.</summary>
    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(30);

    /// <inheritdoc />
    public TimeSpan Period => TimeSpan.FromDays(1);

    /// <inheritdoc />
    public event EventHandler PeriodChanged { add { } remove { } }

    /// <inheritdoc />
    public Task RunJobAsync() => store.PruneBeatenAsync(MaxAge);
}
```

```csharp
// A/Composing/ArcadeMigrator.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;
using Umbraco.Extensions;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>
/// Brings the Arcade's tables up to date, with the migration set for the site's provider (design D9).
/// </summary>
/// <remarks>
/// Run outside any Umbraco scope: SQLite refuses to migrate inside a transaction, which is why
/// Umbraco's own EF executor does the same. Builds the provider's derived context directly, since
/// the runtime <see cref="ArcadeDbContext"/> owns no migrations.
/// </remarks>
/// <param name="connectionStrings">The site's connection string and provider.</param>
/// <param name="runtime">Whether the site is running, installing or upgrading.</param>
/// <param name="logger">Records a failed migration, which must not stop the site starting.</param>
public sealed class ArcadeMigrator(IOptionsMonitor<ConnectionStrings> connectionStrings, IRuntimeState runtime, ILogger<ArcadeMigrator> logger)
{
    /// <summary>Apply any pending migrations.</summary>
    /// <param name="requireRunLevel">True at ordinary startup, where an install or upgrade in progress means "not yet".</param>
    /// <returns>A task.</returns>
    public async Task MigrateAsync(bool requireRunLevel)
    {
        if (requireRunLevel && runtime.Level != RuntimeLevel.Run) return;

        var settings = connectionStrings.CurrentValue;
        var provider = settings.ProviderName;
        var connection = settings.ConnectionString?.Replace("|DataDirectory|", AppDomain.CurrentDomain.GetData("DataDirectory")?.ToString());
        if (string.IsNullOrEmpty(provider) || string.IsNullOrEmpty(connection)) return;

        try
        {
            // The provider names Umbraco's own UseDatabaseProvider recognises. Built by hand rather
            // than through it, because it has no way to pass the history table option.
            await using ArcadeDbContext context = provider.StartsWith("Microsoft.Data.Sqlite", StringComparison.OrdinalIgnoreCase)
                ? new SqliteArcadeDbContext(new DbContextOptionsBuilder<SqliteArcadeDbContext>()
                    .UseSqlite(connection, x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable)).Options)
                : new SqlServerArcadeDbContext(new DbContextOptionsBuilder<SqlServerArcadeDbContext>()
                    .UseSqlServer(connection, x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable)).Options);
            await context.Database.MigrateAsync();
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "The Arcade's tables could not be migrated; scores will not be saved until this is fixed.");
        }
    }
}
```

```csharp
// A/Composing/ArcadeMigrationHandlers.cs
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Infrastructure.Migrations.Notifications;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>
/// Runs the Arcade's migrations at the three moments Umbraco runs its own EF migrations: an ordinary
/// start, a fresh database just created by the installer, and an unattended install. Without the
/// last two, a new site would have no Arcade tables until its first restart.
/// </summary>
/// <param name="migrator">The migrator.</param>
public sealed class ArcadeMigrationHandlers(ArcadeMigrator migrator) :
    INotificationAsyncHandler<UmbracoApplicationStartedNotification>,
    INotificationAsyncHandler<DatabaseSchemaAndDataCreatedNotification>,
    INotificationAsyncHandler<UnattendedInstallNotification>
{
    /// <inheritdoc />
    public Task HandleAsync(UmbracoApplicationStartedNotification notification, CancellationToken cancellationToken) =>
        migrator.MigrateAsync(requireRunLevel: true);

    /// <inheritdoc />
    public Task HandleAsync(DatabaseSchemaAndDataCreatedNotification notification, CancellationToken cancellationToken) =>
        notification.RequiresUpgrade ? Task.CompletedTask : migrator.MigrateAsync(requireRunLevel: false);

    /// <inheritdoc />
    public Task HandleAsync(UnattendedInstallNotification notification, CancellationToken cancellationToken) =>
        migrator.MigrateAsync(requireRunLevel: false);
}
```

```csharp
// A/Composing/ArcadeComposer.cs
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Infrastructure.Migrations.Notifications;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Umbraco.Extensions;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>Registers the Arcade with Umbraco.</summary>
/// <remarks>
/// The context through <c>AddUmbracoDbContext</c>, the documented route (design D9), using the
/// overload that exists at 17.0; 17.4 added one with a <c>shareUmbracoConnection</c> flag that
/// behaves the same. Singletons throughout, as the host's stores are: none holds state. No
/// <see cref="TimeProvider"/>: the site's is Umbraco's.
/// </remarks>
public sealed class ArcadeComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddUmbracoDbContext<ArcadeDbContext>((_, options, connectionString, providerName) =>
        {
            if (string.IsNullOrEmpty(connectionString) || string.IsNullOrEmpty(providerName)) return;
            options.UseDatabaseProvider(providerName, connectionString);
        });
        builder.Services.AddSingleton<IArcadeDatabase, ScopedArcadeDatabase>();
        builder.Services.AddSingleton<IArcadeUserDirectory, UmbracoArcadeUserDirectory>();
        builder.Services.AddSingleton<ArcadeStore>();
        builder.Services.AddSingleton<ArcadeMigrator>();
        builder.AddNotificationAsyncHandler<UmbracoApplicationStartedNotification, ArcadeMigrationHandlers>();
        builder.AddNotificationAsyncHandler<DatabaseSchemaAndDataCreatedNotification, ArcadeMigrationHandlers>();
        builder.AddNotificationAsyncHandler<UnattendedInstallNotification, ArcadeMigrationHandlers>();
        builder.AddNotificationAsyncHandler<UserDeletedNotification, ArcadeUserDeletedHandler>();
        builder.Services.AddRecurringBackgroundJob<ArcadeBeatenPruneJob>();
    }
}
```

If the composer test cannot call `AddNotificationAsyncHandler` on a substitute builder (it is an
extension over `builder.Services`, so it should work), assert on `services` as above. If
`AddUmbracoDbContext` needs more of the container than a bare `ServiceCollection` offers, it only
registers descriptors, so it should not; if it does, move that line behind a small internal method
and test the rest.

- [ ] **Step 4: Run all `AT` tests and build `A` in Release.** Green, no warnings.

---

# Phase D: Arcade backoffice

### Task 14: Types, the game manifest and its reader

**Files:**
- Create: `A/backoffice/src/umbradesktop-app.d.ts`
- Create: `A/backoffice/src/games/game-manifest.ts`
- Test: `A/backoffice/src/games/game-manifest.test.ts`

- [ ] **Step 1: Type shim.** Copy `E/backoffice/src/umbradesktop-app.d.ts` and keep its header's
reasoning. Add, before `declare global`, and to the map:

```ts
/**
 * A package context on the desktop element. A copy of the host's `ManifestUmbraDesktopContext`
 * (`desktop-context.extension.ts`), for the same reason as the rest of this file.
 */
interface ManifestUmbraDesktopContext extends ManifestApi<UmbApi>, ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopContext';
}
```
and in `UmbExtensionManifestMap`: `umbraDesktopContext: ManifestUmbraDesktopContext;`. Import
`ManifestApi` and `UmbApi` from `@umbraco-cms/backoffice/extension-api`.

- [ ] **Step 2: Failing tests**

```ts
// A/backoffice/src/games/game-manifest.test.ts
import { expect } from '@open-wc/testing';
import { normaliseGames } from './game-manifest.js';

/** A valid Minesweeper manifest, to vary. */
const minesweeper = {
  type: 'umbraDesktopGame',
  alias: 'Pkg.Minesweeper.Game',
  name: 'Minesweeper scores',
  meta: {
    app: 'Pkg.Minesweeper',
    label: 'Minesweeper',
    icon: 'icon-bomb',
    leaderboards: [{ alias: 'easy', label: 'Easy', better: 'lower', format: 'time' }],
  },
};

it('reads a valid game', () => {
  const { games, dropped } = normaliseGames([minesweeper]);
  expect(dropped).to.deep.equal([]);
  expect(games).to.deep.equal([
    {
      alias: 'Pkg.Minesweeper.Game',
      app: 'Pkg.Minesweeper',
      label: 'Minesweeper',
      icon: 'icon-bomb',
      weight: 0,
      leaderboards: [{ alias: 'easy', label: 'Easy', better: 'lower', format: 'time', min: undefined, max: undefined }],
    },
  ]);
});

it('drops, never throws on, malformed manifests, and says why', () => {
  const broken = [
    { ...minesweeper, alias: 'A', meta: undefined },
    { ...minesweeper, alias: 'B', meta: { ...minesweeper.meta, app: '' } },
    { ...minesweeper, alias: 'C', meta: { ...minesweeper.meta, leaderboards: [] } },
    { ...minesweeper, alias: 'D', meta: { ...minesweeper.meta, leaderboards: [{ alias: 'Easy Board', label: 'x', better: 'lower', format: 'time' }] } },
    { ...minesweeper, alias: 'E', meta: { ...minesweeper.meta, leaderboards: [{ alias: 'easy', label: 'x', better: 'sideways', format: 'time' }] } },
    { ...minesweeper, alias: 'F', meta: { ...minesweeper.meta, leaderboards: [minesweeper.meta.leaderboards[0], minesweeper.meta.leaderboards[0]] } },
    null,
    'nonsense',
  ];
  const { games, dropped } = normaliseGames(broken);
  expect(games).to.deep.equal([]);
  expect(dropped.map((d) => d.alias)).to.deep.equal(['A', 'B', 'C', 'D', 'E', 'F', '(no alias)', '(no alias)']);
});

it('orders games by manifest weight, higher first, as Umbraco does', () => {
  const snake = { ...minesweeper, alias: 'Pkg.Snake.Game', weight: 900, meta: { ...minesweeper.meta, app: 'Pkg.Snake' } };
  const { games } = normaliseGames([{ ...minesweeper, weight: 1000 }, snake].reverse());
  expect(games.map((g) => g.alias)).to.deep.equal(['Pkg.Minesweeper.Game', 'Pkg.Snake.Game']);
});
```

- [ ] **Step 3: Run (from `A`) `npm test`, expect failure.**

- [ ] **Step 4: Implement**

```ts
// A/backoffice/src/games/game-manifest.ts
import type { ManifestBase } from '@umbraco-cms/backoffice/extension-api';

/** One board a game keeps score on. */
export interface UmbraDesktopGameLeaderboard {
  /** Stable id within the game, lower case and dashes, e.g. `easy` or `draw-1`. Final once shipped. */
  alias: string;
  /** Heading on the hub: a `#` localisation key or a literal. */
  label: string;
  /** Which way is better. */
  better: 'higher' | 'lower';
  /** How the value reads: `points`, or `time` in milliseconds. */
  format: 'points' | 'time';
  /** The smallest value the server accepts, if any. */
  min?: number;
  /** The largest value the server accepts, if any. */
  max?: number;
}

/** What a `umbraDesktopGame` manifest carries. **Published API**: only ever gains optional fields. */
export interface MetaUmbraDesktopGame {
  /** The `umbraDesktopApp` alias that plays this game, for the hub's Play button. */
  app: string;
  /** The game's name on the hub: a `#` key or a literal. */
  label: string;
  /** Umbraco icon alias. */
  icon?: string;
  /** The boards, at least one. */
  leaderboards: UmbraDesktopGameLeaderboard[];
}

/**
 * A game the Arcade keeps score for (design D5). Separate from `umbraDesktopApp` because a game is
 * still just an app; this only says what to keep score of. Its alias is the game's identity in the
 * database, so like an app alias it is final once shipped.
 */
export interface ManifestUmbraDesktopGame extends ManifestBase {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopGame';
  /** The game. */
  meta: MetaUmbraDesktopGame;
}

declare global {
  /** Registers the type with Umbraco's manifest map. */
  interface UmbExtensionManifestMap {
    /** A game on the Arcade. */
    umbraDesktopGame: ManifestUmbraDesktopGame;
  }
}

/** A game as the Arcade uses it, after reading. */
export interface ArcadeGame {
  /** The manifest alias, the game's id on the server. */
  alias: string;
  /** The app that plays it. */
  app: string;
  /** Its name, still a key or a literal. */
  label: string;
  /** Its icon. */
  icon: string;
  /** Umbraco's weight, higher first, for tab order. */
  weight: number;
  /** Its boards. */
  leaderboards: UmbraDesktopGameLeaderboard[];
}

/** Board aliases: what the server accepts (`ScoreRules.BoardAlias`). */
const BOARD_ALIAS = /^[a-z0-9-]+$/;

/** True for a non-empty string. */
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** True for a finite number or nothing. */
const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value));

/**
 * Read one leaderboard, or say what is wrong with it.
 * @param raw The manifest's entry.
 * @returns The board, or a reason.
 */
function readBoard(raw: unknown): UmbraDesktopGameLeaderboard | string {
  if (typeof raw !== 'object' || raw === null) return 'has a leaderboard that is not an object';
  const board = raw as Record<string, unknown>;
  if (!isText(board.alias) || !BOARD_ALIAS.test(board.alias)) return `has a leaderboard alias "${String(board.alias)}" that is not lower case letters, digits and dashes`;
  if (!isText(board.label)) return `leaderboard "${board.alias}" has no label`;
  if (board.better !== 'higher' && board.better !== 'lower') return `leaderboard "${board.alias}" says better is "${String(board.better)}", not "higher" or "lower"`;
  if (board.format !== 'points' && board.format !== 'time') return `leaderboard "${board.alias}" says format is "${String(board.format)}", not "points" or "time"`;
  if (!isOptionalNumber(board.min) || !isOptionalNumber(board.max)) return `leaderboard "${board.alias}" has a min or max that is not a number`;
  return { alias: board.alias, label: board.label, better: board.better, format: board.format, min: board.min, max: board.max };
}

/**
 * Read registered `umbraDesktopGame` manifests into games, dropping any that are malformed.
 *
 * **Never throws**: a JSON manifest can hold anything, and one bad game must not take the Arcade
 * down. Pure, so it reports drops rather than logging them; the context does the console.
 * @param manifests The registered manifests.
 * @returns The games, by weight, and what was dropped and why.
 */
export function normaliseGames(manifests: ReadonlyArray<unknown>): {
  games: ArcadeGame[];
  dropped: Array<{ alias: string; reason: string }>;
} {
  const games: ArcadeGame[] = [];
  const dropped: Array<{ alias: string; reason: string }> = [];
  for (const raw of manifests) {
    const manifest = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const alias = isText(manifest.alias) ? manifest.alias : '(no alias)';
    const drop = (reason: string) => dropped.push({ alias, reason });
    if (alias === '(no alias)') { drop('has no alias'); continue; }
    const meta = manifest.meta as Record<string, unknown> | undefined;
    if (typeof meta !== 'object' || meta === null) { drop('has no "meta" object'); continue; }
    if (!isText(meta.app)) { drop('has no "app", the desktop app that plays it'); continue; }
    if (!isText(meta.label)) { drop('has no "label"'); continue; }
    if (!Array.isArray(meta.leaderboards) || meta.leaderboards.length === 0) { drop('has no leaderboards'); continue; }
    const boards = meta.leaderboards.map(readBoard);
    const problem = boards.find((b): b is string => typeof b === 'string');
    if (problem) { drop(problem); continue; }
    const read = boards as UmbraDesktopGameLeaderboard[];
    if (new Set(read.map((b) => b.alias)).size !== read.length) { drop('has two leaderboards with the same alias'); continue; }
    games.push({
      alias,
      app: meta.app,
      label: meta.label,
      icon: isText(meta.icon) ? meta.icon : 'icon-game',
      weight: typeof manifest.weight === 'number' ? manifest.weight : 0,
      leaderboards: read,
    });
  }
  games.sort((a, b) => b.weight - a.weight);
  return { games, dropped };
}
```

- [ ] **Step 5: Run `npm test` and `npm run build` in `A`.** Green.

### Task 15: Value formatting

**Files:** Create `A/backoffice/src/shared/format.ts`. Test: `A/backoffice/src/shared/format.test.ts`.

- [ ] **Step 1: Failing test**

```ts
// A/backoffice/src/shared/format.test.ts
import { expect } from '@open-wc/testing';
import { formatScore } from './format.js';

it('shows points as a whole number', () => {
  expect(formatScore('points', 1250, 'en-US')).to.equal('1,250');
});

it('shows a time under a minute as seconds to one decimal', () => {
  expect(formatScore('time', 9_430, 'en-US')).to.equal('9.4');
});

it('shows a time of a minute or more as m:ss', () => {
  expect(formatScore('time', 102_900, 'en-US')).to.equal('1:42');
});

it('follows the locale for the decimal mark', () => {
  expect(formatScore('time', 9_430, 'nl-NL')).to.equal('9,4');
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

```ts
// A/backoffice/src/shared/format.ts
/**
 * A score as the Arcade shows it (design D13, §7). Points are a whole number. A time under a minute
 * is seconds to one decimal, because Minesweeper's easy board ties constantly on whole seconds;
 * from a minute it is m:ss, where a tenth no longer matters to anyone reading it.
 * @param format The board's format.
 * @param value The value: points, or milliseconds.
 * @param locale The locale for digits and the decimal mark; the backoffice's by default.
 * @returns The text.
 */
export function formatScore(format: 'points' | 'time', value: number, locale?: string): string {
  if (format === 'points') return Math.round(value).toLocaleString(locale);
  if (value < 60_000) {
    return (Math.floor(value / 100) / 10).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  const seconds = Math.floor(value / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
```

Flooring to the tenth, not rounding, so a board never shows a time faster than the one played.

- [ ] **Step 4: Run, expect pass.**

### Task 16: The API client

**Files:** Create `A/backoffice/src/shared/http.ts` (copy Accessories' `shared/http.ts` verbatim,
updating the header's first sentence to this package), `A/backoffice/src/api/arcade-api.ts`.
Test: `A/backoffice/src/api/arcade-api.test.ts`.

- [ ] **Step 1: Failing tests.** Same stubbing pattern as Accessories' `sticky-notes/api.test.ts`
(`throwsFrom` replacing a method on `umbHttpClient`, in `before`/`after` hooks). Add a `returns`
helper that makes a method resolve `{ data }`.

```ts
// A/backoffice/src/api/arcade-api.test.ts
import { expect } from '@open-wc/testing';
import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { createArcadeApi } from './arcade-api.js';

type Method = 'get' | 'post' | 'put' | 'delete';

/** Make one client method answer for a describe block, and put it back after. */
function answers(method: Method, answer: () => Promise<unknown>): void {
  const client = umbHttpClient as unknown as Record<Method, unknown>;
  let original: unknown;
  before(() => {
    original = client[method];
    client[method] = answer;
  });
  after(() => (client[method] = original));
}

const board = { alias: 'default', label: 'Snake', better: 'higher', format: 'points' } as const;

describe('submit accepted', () => {
  answers('post', async () => ({ data: { isPersonalBest: true, previousBest: null, rank: 1, isPublic: false, askedAboutPublic: false, displayName: 'Ada' } }));
  it('reads an accepted score', async () => {
    const result = await createArcadeApi().submit('Pkg.Snake.Game', board, 300);
    expect(result).to.deep.equal({ status: 'accepted', isPersonalBest: true, previousBest: null, rank: 1, isPublic: false, askedAboutPublic: false, displayName: 'Ada' });
  });
});

describe('submit conflict', () => {
  answers('post', async () => { throw { type: 'ArcadeBoardConflict', status: 409, title: 'x' }; });
  it('reads a thrown 409 as a conflict', async () => {
    expect(await createArcadeApi().submit('Pkg.Snake.Game', board, 300)).to.deep.equal({ status: 'conflict' });
  });
});

describe('submit rejected', () => {
  answers('post', async () => { throw { type: 'ArcadeScoreRejected', status: 400, title: 'x' }; });
  it('reads a thrown 400 as a rejection', async () => {
    expect(await createArcadeApi().submit('Pkg.Snake.Game', board, 0)).to.deep.equal({ status: 'rejected' });
  });
});

describe('unreachable', () => {
  answers('get', async () => { throw new TypeError('Failed to fetch'); });
  it('reads an unreachable server as nothing, never as an exception', async () => {
    expect(await createArcadeApi().getBest('Pkg.Snake.Game', 'default')).to.equal(undefined);
    expect(await createArcadeApi().getProfile()).to.equal(undefined);
  });
});

describe('beaten', () => {
  answers('post', async () => ({ data: [{ game: 'Pkg.Snake.Game', board: 'default', byDisplayName: 'Grace', value: 500, format: 'points' }] }));
  it('reads beaten events', async () => {
    expect(await createArcadeApi().takeBeaten()).to.have.length(1);
  });
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

```ts
// A/backoffice/src/api/arcade-api.ts
import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { attempt, SECURITY, statusOf } from '../shared/http.js';
import type { UmbraDesktopGameLeaderboard } from '../games/game-manifest.js';

/**
 * The Arcade API, as the desktop sees it. The server half is `Api/ArcadeController.cs`; the shapes
 * are its response models, written out by hand, as Sticky Notes does, rather than a generated client
 * for ten calls. Every failure is an answer, never an exception: a game must never break because the
 * scoreboard is down.
 */

/** A player's settings. */
export interface ArcadeProfile {
  /** Their board name. */
  displayName: string;
  /** Whether they are shown on boards. */
  isPublic: boolean;
  /** Whether they are told when beaten. */
  notifyWhenBeaten: boolean;
  /** Whether the one-time question has been answered. */
  askedAboutPublic: boolean;
}

/** How a submit went. */
export type ArcadeSubmitResult =
  | { status: 'accepted'; isPersonalBest: boolean; previousBest: number | null; rank: number; isPublic: boolean; askedAboutPublic: boolean; displayName: string }
  | { status: 'rejected' }
  | { status: 'conflict' }
  | { status: 'failed' };

/** One row on a board. */
export interface ArcadeBoardEntry {
  /** Position. */
  rank: number;
  /** The player, for moderation. */
  userKey: string;
  /** Their name. */
  displayName: string;
  /** Their best. */
  value: number;
  /** When, ISO. */
  achievedAtUtc: string;
  /** Whether it is the viewer. */
  isViewer: boolean;
}

/** A board for the viewer. */
export interface ArcadeBoard {
  /** Whether anybody has played it. */
  played: boolean;
  /** The top public rows. */
  top: ArcadeBoardEntry[];
  /** The viewer's own row. */
  viewer: ArcadeBoardEntry | null;
  /** Whether the viewer is shown. */
  viewerIsPublic: boolean;
  /** Whether the viewer may moderate. */
  canModerate: boolean;
}

/** "Somebody took first place from you." */
export interface ArcadeBeatenEvent {
  /** The game's manifest alias. */
  game: string;
  /** The board's alias. */
  board: string;
  /** Who. */
  byDisplayName: string;
  /** With what. */
  value: number;
  /** How to show the value. */
  format: 'points' | 'time';
}

/** Everything the desktop asks the server. An interface so tests can answer it. */
export interface ArcadeApi {
  /** The caller's settings. */
  getProfile(): Promise<ArcadeProfile | undefined>;
  /** Change the caller's settings; undefined fields are left alone. @param patch The change. */
  updateProfile(patch: Partial<Pick<ArcadeProfile, 'displayName' | 'isPublic' | 'notifyWhenBeaten'>>): Promise<ArcadeProfile | undefined>;
  /** Delete everything about the caller. */
  deleteProfile(): Promise<boolean>;
  /** Submit a score. @param game The game alias. @param board The board. @param value The score. */
  submit(game: string, board: UmbraDesktopGameLeaderboard, value: number): Promise<ArcadeSubmitResult>;
  /** A board. @param game The game alias. @param board The board alias. */
  getBoard(game: string, board: string): Promise<ArcadeBoard | undefined>;
  /** The caller's best. @param game The game alias. @param board The board alias. */
  getBest(game: string, board: string): Promise<number | null | undefined>;
  /** The caller's unread beaten events, handed out once. */
  takeBeaten(): Promise<ArcadeBeatenEvent[]>;
  /** Remove one score (admin). @param game Game. @param board Board. @param userKey Player. */
  removeScore(game: string, board: string, userKey: string): Promise<boolean>;
  /** Empty a board (admin). @param game Game. @param board Board. */
  resetBoard(game: string, board: string): Promise<boolean>;
  /** Reset a display name (admin). @param userKey Player. */
  resetName(userKey: string): Promise<boolean>;
}

/** Where the controller is routed. */
const URL = '/umbraco/management/api/v1/umbradesktop/services/arcade';

/** JSON request headers. */
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * The real API, over the backoffice's own HTTP client, which already carries the user's token.
 * @returns The API.
 */
export function createArcadeApi(): ArcadeApi {
  const enc = encodeURIComponent;
  return {
    async getProfile() {
      return (await attempt<ArcadeProfile>(() => umbHttpClient.get({ url: `${URL}/profile`, security: [...SECURITY] }))).data;
    },
    async updateProfile(patch) {
      return (await attempt<ArcadeProfile>(() => umbHttpClient.put({ url: `${URL}/profile`, security: [...SECURITY], body: patch, headers: JSON_HEADERS }))).data;
    },
    async deleteProfile() {
      return !(await attempt(() => umbHttpClient.delete({ url: `${URL}/profile`, security: [...SECURITY] }))).error;
    },
    async submit(game, board, value) {
      const body = { game, board: board.alias, better: board.better, format: board.format, min: board.min ?? null, max: board.max ?? null, value: Math.round(value) };
      const { data, error } = await attempt<Omit<Extract<ArcadeSubmitResult, { status: 'accepted' }>, 'status'>>(() =>
        umbHttpClient.post({ url: `${URL}/scores`, security: [...SECURITY], body, headers: JSON_HEADERS }),
      );
      if (data) return { status: 'accepted', ...data };
      if (statusOf(error) === 409) return { status: 'conflict' };
      if (statusOf(error) === 400) return { status: 'rejected' };
      return { status: 'failed' };
    },
    async getBoard(game, board) {
      return (await attempt<ArcadeBoard>(() => umbHttpClient.get({ url: `${URL}/boards/${enc(game)}/${enc(board)}`, security: [...SECURITY] }))).data;
    },
    async getBest(game, board) {
      const { data } = await attempt<{ value: number | null }>(() => umbHttpClient.get({ url: `${URL}/best/${enc(game)}/${enc(board)}`, security: [...SECURITY] }));
      return data ? data.value : undefined;
    },
    async takeBeaten() {
      return (await attempt<ArcadeBeatenEvent[]>(() => umbHttpClient.post({ url: `${URL}/beaten/take`, security: [...SECURITY] }))).data ?? [];
    },
    async removeScore(game, board, userKey) {
      return !(await attempt(() => umbHttpClient.delete({ url: `${URL}/boards/${enc(game)}/${enc(board)}/scores/${enc(userKey)}`, security: [...SECURITY] }))).error;
    },
    async resetBoard(game, board) {
      return !(await attempt(() => umbHttpClient.delete({ url: `${URL}/boards/${enc(game)}/${enc(board)}`, security: [...SECURITY] }))).error;
    },
    async resetName(userKey) {
      return !(await attempt(() => umbHttpClient.post({ url: `${URL}/profiles/${enc(userKey)}/reset-name`, security: [...SECURITY] }))).error;
    },
  };
}
```

- [ ] **Step 4: Run `npm test` and `npm run build` in `A`.** Green.

### Task 17: The privacy question

**Files:** Create `A/backoffice/src/context/privacy-modal.token.ts`, `A/backoffice/src/context/privacy-modal.element.ts`.
Test: `A/backoffice/src/context/privacy-modal.element.test.ts`.

An Umbraco modal renders in the backoffice's own modal container, outside the desktop, so the modal
element cannot consume desktop contexts. It does not need to: it takes the display name as data and
returns the answer; the Arcade context saves it.

- [ ] **Step 1: Failing test**

```ts
// A/backoffice/src/context/privacy-modal.element.test.ts
import { expect, fixture, html } from '@open-wc/testing';
import './privacy-modal.element.js';
import type { UmbraDesktopArcadePrivacyModalElement } from './privacy-modal.element.js';

/** The modal, with its data and a spy on how it closes. */
async function modal(displayName = 'Ada Lovelace') {
  const el = await fixture<UmbraDesktopArcadePrivacyModalElement>(html`<umbradesktop-arcade-privacy-modal .data=${{ displayName }}></umbradesktop-arcade-privacy-modal>`);
  let submitted: unknown;
  el.modalContext = { submit: () => (submitted = el.value), reject: () => {}, setValue: (v: unknown) => (el.value = v as never) } as never;
  return { el, submitted: () => submitted };
}

it('prefills the display name', async () => {
  const { el } = await modal();
  const input = el.shadowRoot!.querySelector('uui-input') as HTMLInputElement;
  expect(input.value).to.equal('Ada Lovelace');
});

it('answers "show them" with the name as typed', async () => {
  const { el, submitted } = await modal();
  const input = el.shadowRoot!.querySelector('uui-input') as HTMLInputElement;
  input.value = 'Ace';
  input.dispatchEvent(new Event('input'));
  (el.shadowRoot!.querySelector('[data-answer="public"]') as HTMLElement).click();
  expect(submitted()).to.deep.equal({ isPublic: true, displayName: 'Ace' });
});

it('answers "keep them private"', async () => {
  const { el, submitted } = await modal();
  (el.shadowRoot!.querySelector('[data-answer="private"]') as HTMLElement).click();
  expect(submitted()).to.deep.equal({ isPublic: false, displayName: 'Ada Lovelace' });
});
```

If `UmbModalBaseElement` exposes submitting differently in 17 (e.g. `_submitModal()` calls
`this.modalContext?.submit()`), keep the fake `modalContext` matching what `_submitModal` calls.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

```ts
// A/backoffice/src/context/privacy-modal.token.ts
import { UmbModalToken } from '@umbraco-cms/backoffice/modal';

/** What the question is opened with. */
export interface ArcadePrivacyModalData {
  /** The player's current display name, to prefill. */
  displayName: string;
}

/** What it answers. */
export interface ArcadePrivacyModalValue {
  /** Whether to show their scores. */
  isPublic: boolean;
  /** The display name they settled on. */
  displayName: string;
}

/** The one-time "show your scores?" question (design D7). A small dialog. */
export const UMBRADESKTOP_ARCADE_PRIVACY_MODAL = new UmbModalToken<ArcadePrivacyModalData, ArcadePrivacyModalValue>(
  'UmbraDesktop.Arcade.Modal.Privacy',
  { modal: { type: 'dialog' } },
);
```

```ts
// A/backoffice/src/context/privacy-modal.element.ts
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import type { ArcadePrivacyModalData, ArcadePrivacyModalValue } from './privacy-modal.token.js';
import { AREA } from '../shared/area.js';

/**
 * Asks once, at a player's first score, whether to show their scores on the leaderboards, with
 * their display name ready to change (D7). Either button is an answer; closing the dialog is not,
 * so the question comes back with the next score.
 */
@customElement('umbradesktop-arcade-privacy-modal')
export class UmbraDesktopArcadePrivacyModalElement extends UmbModalBaseElement<ArcadePrivacyModalData, ArcadePrivacyModalValue> {
  /** The name as typed so far. */
  @state()
  private _name?: string;

  /** The name to send: as typed, or as it came in. */
  get #name(): string {
    return this._name ?? this.data?.displayName ?? '';
  }

  /**
   * Close with an answer.
   * @param isPublic Show or hide.
   */
  #answer(isPublic: boolean): void {
    this.value = { isPublic, displayName: this.#name };
    this._submitModal();
  }

  /** @returns The dialog. */
  override render() {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    return html`<uui-dialog-layout headline=${t('privacyHeadline', 'Show your scores on the Arcade?')}>
      <p>${t('privacyText', 'Your best scores can appear on the Arcade leaderboards for everyone who uses the desktop. You can change this later in the Arcade.')}</p>
      <uui-label for="name">${t('displayName', 'Display name')}</uui-label>
      <uui-input id="name" .value=${this.#name} maxlength="32" @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}></uui-input>
      <uui-button slot="actions" data-answer="private" look="secondary" label=${t('keepPrivate', 'Keep them private')} @click=${() => this.#answer(false)}></uui-button>
      <uui-button slot="actions" data-answer="public" look="primary" color="positive" label=${t('showThem', 'Show them')} @click=${() => this.#answer(true)}></uui-button>
    </uui-dialog-layout>`;
  }

  /** Spacing only; the dialog is Umbraco's. */
  static override styles = css`
    uui-input { width: 100%; }
    p { max-width: 40ch; }
  `;
}

export { UmbraDesktopArcadePrivacyModalElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-privacy-modal': UmbraDesktopArcadePrivacyModalElement;
  }
}
```

- [ ] **Step 4: Run, expect pass.**

### Task 18: The Arcade context

**Files:** Create `A/backoffice/src/context/arcade.context-token.ts`, `A/backoffice/src/context/arcade.context.ts`.
Test: `A/backoffice/src/context/arcade.context.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
// A/backoffice/src/context/arcade.context.test.ts
import { expect, fixture, html } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopArcadeContext } from './arcade.context.js';
import type { ArcadeApi, ArcadeSubmitResult } from '../api/arcade-api.js';

@customElement('umbradesktop-arcade-context-test-host')
class TestHost extends UmbLitElement {}

const snakeGame = {
  type: 'umbraDesktopGame',
  alias: 'Pkg.Snake.Game',
  name: 'Snake scores',
  meta: { app: 'Pkg.Snake', label: 'Snake', leaderboards: [{ alias: 'default', label: 'Snake', better: 'higher', format: 'points' }] },
};

/** An accepted result to vary. */
const accepted = (over: Partial<Extract<ArcadeSubmitResult, { status: 'accepted' }>> = {}): ArcadeSubmitResult => ({
  status: 'accepted', isPersonalBest: true, previousBest: null, rank: 2, isPublic: true, askedAboutPublic: true, displayName: 'Ada', ...over,
});

/** A fake API recording calls; each test sets what submit answers. */
function fakeApi(submit: ArcadeSubmitResult, beaten: Awaited<ReturnType<ArcadeApi['takeBeaten']>> = []) {
  const calls: string[] = [];
  const api: ArcadeApi = {
    getProfile: async () => ({ displayName: 'Ada', isPublic: true, notifyWhenBeaten: true, askedAboutPublic: true }),
    updateProfile: async (patch) => { calls.push(`update:${JSON.stringify(patch)}`); return { displayName: patch.displayName ?? 'Ada', isPublic: patch.isPublic ?? true, notifyWhenBeaten: true, askedAboutPublic: true }; },
    deleteProfile: async () => true,
    submit: async (game, board, value) => { calls.push(`submit:${game}:${board.alias}:${value}`); return submit; },
    getBoard: async () => undefined,
    getBest: async () => 300,
    takeBeaten: async () => { calls.push('takeBeaten'); return beaten; },
    removeScore: async () => true,
    resetBoard: async () => true,
    resetName: async () => true,
  };
  return { api, calls };
}

/** Build a context with fakes, returning what it asked and toasted. */
async function setup(submit: ArcadeSubmitResult, beaten: Awaited<ReturnType<ArcadeApi['takeBeaten']>> = [], answer?: { isPublic: boolean; displayName: string }) {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-context-test-host></umbradesktop-arcade-context-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  registry.register(snakeGame as unknown as UmbExtensionManifest);
  const { api, calls } = fakeApi(submit, beaten);
  const asked: string[] = [];
  const toasts: Array<{ color: string; message: string }> = [];
  const context = new UmbraDesktopArcadeContext(host, {
    api,
    registry,
    askPrivacy: async (_host, name) => { asked.push(name); return answer; },
    toast: (_host, color, message) => { toasts.push({ color, message }); },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { context, calls, asked, toasts };
}

it('submits to the game and board it is told, and toasts a personal best', async () => {
  const { context, calls, toasts } = await setup(accepted());
  const result = await context.submit('Pkg.Snake.Game', 'default', 300);
  expect(calls).to.include('submit:Pkg.Snake.Game:default:300');
  expect(result?.status).to.equal('accepted');
  expect(toasts).to.have.length(1);
  expect(toasts[0].color).to.equal('positive');
  expect(toasts[0].message).to.contain('Snake');
  expect(toasts[0].message).to.contain('300');
});

it('stays quiet for a score that is not a best', async () => {
  const { context, toasts } = await setup(accepted({ isPersonalBest: false }));
  await context.submit('Pkg.Snake.Game', 'default', 100);
  expect(toasts).to.deep.equal([]);
});

it('asks the one-time question after the first score and saves the answer', async () => {
  const { context, asked, calls } = await setup(accepted({ askedAboutPublic: false, isPublic: false }), [], { isPublic: true, displayName: 'Ace' });
  await context.submit('Pkg.Snake.Game', 'default', 300);
  expect(asked).to.deep.equal(['Ada']);
  expect(calls).to.include('update:{"isPublic":true,"displayName":"Ace"}');
});

it('does not ask once answered', async () => {
  const { context, asked } = await setup(accepted());
  await context.submit('Pkg.Snake.Game', 'default', 300);
  expect(asked).to.deep.equal([]);
});

it('submits nothing for a game or board it does not know', async () => {
  const { context, calls } = await setup(accepted());
  expect(await context.submit('Pkg.Unknown', 'default', 1)).to.equal(undefined);
  expect(await context.submit('Pkg.Snake.Game', 'nope', 1)).to.equal(undefined);
  expect(calls.filter((c) => c.startsWith('submit'))).to.deep.equal([]);
});

it('takes beaten events once when created and toasts each as a warning', async () => {
  const { calls, toasts } = await setup(accepted(), [{ game: 'Pkg.Snake.Game', board: 'default', byDisplayName: 'Grace', value: 500, format: 'points' }]);
  expect(calls.filter((c) => c === 'takeBeaten')).to.have.length(1);
  expect(toasts).to.have.length(1);
  expect(toasts[0].color).to.equal('warning');
  expect(toasts[0].message).to.contain('Grace');
  expect(toasts[0].message).to.contain('Snake');
});

it('reads a best through to the server', async () => {
  const { context } = await setup(accepted());
  expect(await context.getBest('Pkg.Snake.Game', 'default')).to.equal(300);
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

```ts
// A/backoffice/src/context/arcade.context-token.ts
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbraDesktopArcadeContext } from './arcade.context.js';

/**
 * The Arcade's context. **The alias is published API**: game packages build their own token with
 * this string and nothing else (design D4).
 */
export const UMBRADESKTOP_ARCADE_CONTEXT = new UmbContextToken<UmbraDesktopArcadeContext>('UmbraDesktopArcadeContext');
```

```ts
// A/backoffice/src/context/arcade.context.ts
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { createArcadeApi } from '../api/arcade-api.js';
import type { ArcadeApi, ArcadeBoard, ArcadeProfile, ArcadeSubmitResult } from '../api/arcade-api.js';
import { normaliseGames } from '../games/game-manifest.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { formatScore } from '../shared/format.js';
import { AREA } from '../shared/area.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from './arcade.context-token.js';
import { UMBRADESKTOP_ARCADE_PRIVACY_MODAL } from './privacy-modal.token.js';
import type { ArcadePrivacyModalValue } from './privacy-modal.token.js';

/** What the context needs from outside, injectable so tests need no server, modal or toast container. */
export interface ArcadeContextDeps {
  /** The server. */
  api: ArcadeApi;
  /** Where `umbraDesktopGame` manifests come from. */
  registry: typeof umbExtensionsRegistry;
  /** Ask the one-time question; undefined when closed without an answer. */
  askPrivacy(host: UmbControllerHost, displayName: string): Promise<ArcadePrivacyModalValue | undefined>;
  /** Raise a toast on the desktop, where the notification centre picks it up. */
  toast(host: UmbControllerHost, color: 'positive' | 'warning', message: string): void;
}

/**
 * The Arcade on the desktop: games submit through it, the hub reads through it, and it tells you,
 * once per visit, who took first place from you (design D4, D10).
 *
 * A `umbraDesktopContext`, so the desktop creates it on open and destroys it on leave; never in the
 * plain backoffice or a window's iframe (D3). Constructed by the host with `(host)` only; the second
 * parameter is for tests.
 */
export class UmbraDesktopArcadeContext extends UmbContextBase {
  /** The injected or default collaborators. */
  readonly #deps: ArcadeContextDeps;

  /** Words for toasts, in the backoffice's language. */
  readonly #localize: UmbLocalizationController;

  /** The registered games, by weight. */
  readonly #games = new UmbArrayState<ArcadeGame>([], (g) => g.alias);

  /** The registered games, by weight, as the hub observes them. */
  readonly games = this.#games.asObservable();

  /** The player's settings, once read. */
  readonly #profile = new UmbObjectState<ArcadeProfile | undefined>(undefined);

  /** The player's settings, as the hub observes them. */
  readonly profile = this.#profile.asObservable();

  /** Drops already reported, so a manifest is named in the console once. */
  readonly #reported = new Set<string>();

  /**
   * @param host The desktop element.
   * @param deps Collaborators; the real ones by default.
   */
  constructor(host: UmbControllerHost, deps: Partial<ArcadeContextDeps> = {}) {
    super(host, UMBRADESKTOP_ARCADE_CONTEXT);
    this.#deps = {
      api: deps.api ?? createArcadeApi(),
      registry: deps.registry ?? umbExtensionsRegistry,
      askPrivacy: deps.askPrivacy ?? ((h, displayName) => umbOpenModal(h, UMBRADESKTOP_ARCADE_PRIVACY_MODAL, { data: { displayName } }).catch(() => undefined)),
      toast: deps.toast ?? ((h, color, message) => void this.#peek(h, color, message)),
    };
    this.#localize = new UmbLocalizationController(this);
    new UmbExtensionsManifestInitializer(this, this.#deps.registry as never, 'umbraDesktopGame', null, (permitted) => {
      const { games, dropped } = normaliseGames(permitted.map((c) => c.manifest));
      for (const drop of dropped) {
        if (this.#reported.has(drop.alias)) continue;
        this.#reported.add(drop.alias);
        console.warn(`[UmbraDesktop Arcade] Game "${drop.alias}" was dropped because it ${drop.reason}.`);
      }
      this.#games.setValue(games);
    });
    void this.#announceBeaten();
  }

  /** The registered games right now. @returns The games. */
  getGames(): ArcadeGame[] {
    return this.#games.getValue();
  }

  /**
   * Submit a score. Asks the one-time question after a first score, and toasts a personal best.
   * Never throws; a game ignores the answer if it has no use for it.
   * @param game The game's `umbraDesktopGame` alias.
   * @param board The board's alias.
   * @param value Points, or milliseconds for a time.
   * @returns How it went, or undefined when the game or board is unknown.
   */
  async submit(game: string, board: string, value: number): Promise<ArcadeSubmitResult | undefined> {
    const found = this.getGames().find((g) => g.alias === game);
    const definition = found?.leaderboards.find((b) => b.alias === board);
    if (!found || !definition) {
      console.warn(`[UmbraDesktop Arcade] A score for "${game}" / "${board}" was ignored: no umbraDesktopGame manifest declares that board.`);
      return undefined;
    }
    const result = await this.#deps.api.submit(game, definition, value);
    if (result.status !== 'accepted') return result;

    let isPublic = result.isPublic;
    if (!result.askedAboutPublic) {
      const answer = await this.#deps.askPrivacy(this._host, result.displayName);
      if (answer) {
        const saved = await this.#deps.api.updateProfile({ isPublic: answer.isPublic, displayName: answer.displayName });
        if (saved) { this.#profile.setValue(saved); isPublic = saved.isPublic; }
      }
    }

    if (result.isPersonalBest) {
      const name = this.#gameName(found, definition.alias);
      const score = formatScore(definition.format, value);
      const message = isPublic
        ? this.#localize.termOrDefault(`${AREA}_newBestRanked`, `New best on ${name}: ${score}, number ${result.rank}`, name, score, result.rank)
        : this.#localize.termOrDefault(`${AREA}_newBest`, `New best on ${name}: ${score}`, name, score);
      this.#deps.toast(this._host, 'positive', message);
    }
    return { ...result, isPublic };
  }

  /** The player's best on a board. @param game Game alias. @param board Board alias. @returns The best, null if unplayed, undefined if unreachable. */
  getBest(game: string, board: string): Promise<number | null | undefined> {
    return this.#deps.api.getBest(game, board);
  }

  /** A board for the hub. @param game Game alias. @param board Board alias. @returns The board. */
  getBoard(game: string, board: string): Promise<ArcadeBoard | undefined> {
    return this.#deps.api.getBoard(game, board);
  }

  /** Read the player's settings into `profile`. */
  async refreshProfile(): Promise<void> {
    const profile = await this.#deps.api.getProfile();
    if (profile) this.#profile.setValue(profile);
  }

  /** Change the player's settings. @param patch The change. @returns Whether it saved. */
  async updateProfile(patch: Parameters<ArcadeApi['updateProfile']>[0]): Promise<boolean> {
    const saved = await this.#deps.api.updateProfile(patch);
    if (saved) this.#profile.setValue(saved);
    return saved !== undefined;
  }

  /** Delete everything about the player. @returns Whether it worked. */
  async deleteMyScores(): Promise<boolean> {
    const done = await this.#deps.api.deleteProfile();
    if (done) await this.refreshProfile();
    return done;
  }

  /** Remove a score (admin). @param game Game. @param board Board. @param userKey Player. @returns Whether it worked. */
  removeScore(game: string, board: string, userKey: string): Promise<boolean> {
    return this.#deps.api.removeScore(game, board, userKey);
  }

  /** Empty a board (admin). @param game Game. @param board Board. @returns Whether it worked. */
  resetBoard(game: string, board: string): Promise<boolean> {
    return this.#deps.api.resetBoard(game, board);
  }

  /** Reset a display name (admin). @param userKey Player. @returns Whether it worked. */
  resetName(userKey: string): Promise<boolean> {
    return this.#deps.api.resetName(userKey);
  }

  /**
   * Tell the player who took first place from them since they last looked: once per visit, because
   * this context exists once per visit (D10). A plain warning toast, so the notification centre
   * shows and keeps it; its message says where to look, since a click on it does nothing.
   */
  async #announceBeaten(): Promise<void> {
    const events = await this.#deps.api.takeBeaten();
    for (const event of events) {
      const game = this.getGames().find((g) => g.alias === event.game);
      const name = game ? this.#gameName(game, event.board) : event.game;
      const score = formatScore(event.format, event.value);
      this.#deps.toast(
        this._host,
        'warning',
        this.#localize.termOrDefault(`${AREA}_beaten`, `${event.byDisplayName} took first place on ${name} from you (${score}). Open the Arcade to see the board.`, event.byDisplayName, name, score),
      );
    }
  }

  /**
   * A board's name for a message: the game's name, plus the board's when the game has several.
   * @param game The game.
   * @param board The board alias.
   * @returns The name.
   */
  #gameName(game: ArcadeGame, board: string): string {
    const gameName = this.#localize.string(game.label);
    if (game.leaderboards.length < 2) return gameName;
    const label = game.leaderboards.find((b) => b.alias === board)?.label ?? board;
    return `${gameName}, ${this.#localize.string(label)}`;
  }

  /**
   * Raise an ordinary Umbraco toast on the desktop's document; the desktop's notification watcher
   * moves it into the notification centre (`2026-09-27-desktop-notifications-design.md`).
   * @param host Where to find the notification context.
   * @param color The toast's colour.
   * @param message The text.
   */
  async #peek(host: UmbControllerHost, color: 'positive' | 'warning', message: string): Promise<void> {
    void host;
    const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);
    notifications?.peek(color, { data: { message } });
  }
}

export { UmbraDesktopArcadeContext as api };
```

Two things to confirm while implementing: `UmbLocalizationController.string()` resolves a `#key`
or passes a literal through (if the name differs in 17, use whatever `localize.string` maps to, as
the host's launcher does for `meta.label`); and the `termOrDefault` placeholder syntax: use the one
Entertainment's `solitaireCardName` (`{0} of {1}`) already proves works.

- [ ] **Step 4: Run, expect pass.** `npm run build` too.

### Task 19: The has-games condition

**Files:** Create `A/backoffice/src/conditions/has-games.condition.ts`. Test: `A/backoffice/src/conditions/has-games.condition.test.ts`.

- [ ] **Step 1: Failing test**

```ts
// A/backoffice/src/conditions/has-games.condition.test.ts
import { expect, fixture, html } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopArcadeHasGamesCondition } from './has-games.condition.js';

@customElement('umbradesktop-arcade-condition-test-host')
class TestHost extends UmbLitElement {}

it('refuses with no games and permits once one is registered', async () => {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-condition-test-host></umbradesktop-arcade-condition-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  UmbraDesktopArcadeHasGamesCondition.registry = registry as never;
  const changes: boolean[] = [];
  const condition = new UmbraDesktopArcadeHasGamesCondition(host, { host, config: { alias: 'x' }, onChange: (p: boolean) => changes.push(p) } as never);
  expect(condition.permitted).to.equal(false);

  registry.register({ type: 'umbraDesktopGame', alias: 'G', name: 'G', meta: { app: 'A', label: 'G', leaderboards: [] } } as unknown as UmbExtensionManifest);
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(condition.permitted).to.equal(true);
  expect(changes.at(-1)).to.equal(true);
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** (shape of the host's `connections/has-connections.condition.ts`):

```ts
// A/backoffice/src/conditions/has-games.condition.ts
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { UmbConditionConfigBase, UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';

/** The condition's alias. */
export const UMBRADESKTOP_ARCADE_HAS_GAMES_CONDITION = 'UmbraDesktop.Arcade.Condition.HasGames';

/**
 * Permits while at least one `umbraDesktopGame` is registered, so the hub is not in the launcher with
 * nothing in it (design §3). Counts manifests, not valid games: a malformed game still shows the hub,
 * where its absence is easier to notice than a missing tile.
 */
export class UmbraDesktopArcadeHasGamesCondition extends UmbControllerBase implements UmbExtensionCondition {
  /** Where manifests are read; replaceable only so tests never touch the global registry. */
  static registry: typeof umbExtensionsRegistry = umbExtensionsRegistry;

  /** Starts refused, so the hub never flashes up before the registry has answered. */
  public permitted = false;

  /**
   * @param host The host.
   * @param args Umbraco's condition arguments.
   */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbConditionConfigBase>) {
    super(host);
    this.observe(UmbraDesktopArcadeHasGamesCondition.registry.byType('umbraDesktopGame'), (games) => {
      this.permitted = games.length > 0;
      args.onChange(this.permitted);
    });
  }
}

export { UmbraDesktopArcadeHasGamesCondition as api };
```

- [ ] **Step 4: Run, expect pass.**

### Task 20: The hub

**Files:** Create `A/backoffice/src/hub/{constants.ts,hub.element.ts,board.element.ts,profile.element.ts}`.
Tests: `A/backoffice/src/hub/{hub,board,profile}.element.test.ts`.

Tests provide a fake Arcade context on a wrapper element (`wrapper.provideContext(UMBRADESKTOP_ARCADE_CONTEXT, fake)`),
then mount the element inside it. The fake implements `games`, `profile` (observables from
`UmbArrayState`/`UmbObjectState`), `getBoard`, `refreshProfile`, `updateProfile`, `deleteMyScores`,
`removeScore`, `resetBoard`, `resetName`, recording calls.

- [ ] **Step 1: Constants**

```ts
// A/backoffice/src/hub/constants.ts
/** The hub's opening content box: two boards side by side with ten rows each. */
export const HUB_CONTENT_SIZE = { w: 760, h: 540 };
/** The smallest box one board and the tab strip fit in. */
export const HUB_MIN_CONTENT_SIZE = { w: 420, h: 380 };
```

- [ ] **Step 2: Failing board tests**

```ts
// A/backoffice/src/hub/board.element.test.ts
import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './board.element.js';
import { arcadeHarness } from './harness.test-helper.js';

const game = { alias: 'Pkg.Snake.Game', app: 'Pkg.Snake', label: 'Snake', icon: 'icon-game', weight: 0, leaderboards: [{ alias: 'default', label: 'Snake', better: 'higher' as const, format: 'points' as const }] };
const row = (rank: number, name: string, value: number, isViewer = false) => ({ rank, userKey: `k${rank}`, displayName: name, value, achievedAtUtc: '2026-10-01T09:00:00Z', isViewer });

it('lists the top rows with rank, name and score, and marks the viewer', async () => {
  const { wrapper } = await arcadeHarness({ board: { played: true, top: [row(1, 'Grace', 500), row(2, 'Ada', 300, true)], viewer: row(2, 'Ada', 300, true), viewerIsPublic: true, canModerate: false } });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelectorAll('tbody tr').length === 2, 'rows drawn');
  const rows = [...el.shadowRoot!.querySelectorAll('tbody tr')];
  expect(rows[0].textContent).to.contain('Grace').and.contain('500');
  expect(rows[1].classList.contains('viewer')).to.equal(true);
});

it('pins the viewer underneath when they are private or outside the top', async () => {
  const { wrapper } = await arcadeHarness({ board: { played: true, top: [row(1, 'Grace', 500)], viewer: row(4, 'Ada', 30, true), viewerIsPublic: false, canModerate: false } });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('tfoot tr'), 'viewer pinned');
  expect(el.shadowRoot!.querySelector('tfoot')!.textContent).to.contain('Ada').and.contain('Private');
});

it('says when nobody has played yet', async () => {
  const { wrapper } = await arcadeHarness({ board: { played: false, top: [], viewer: null, viewerIsPublic: false, canModerate: false } });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('.empty'), 'empty state');
});

it('shows moderation buttons only to a moderator', async () => {
  const { wrapper } = await arcadeHarness({ board: { played: true, top: [row(1, 'Grace', 500)], viewer: null, viewerIsPublic: true, canModerate: true } });
  const el = await fixture(html`<umbradesktop-arcade-board .game=${game} .board=${game.leaderboards[0]}></umbradesktop-arcade-board>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-action="remove"]'), 'remove shown');
  expect(el.shadowRoot!.querySelector('[data-action="reset-board"]')).to.not.equal(null);
});
```

Create `A/backoffice/src/hub/harness.test-helper.ts` (not `.test.ts`, so the runner does not treat it
as a suite, the convention of Entertainment's `memory-storage.test-helper.ts`): a custom element
`umbradesktop-arcade-test-wrapper` extending `UmbLitElement`, and `arcadeHarness(options)` that
mounts it, provides a fake context answering `getBoard` with `options.board`, `games` with
`options.games ?? []`, `profile` with `options.profile`, records every call in `calls: string[]`,
and also provides a fake `UmbContextToken('UmbraDesktopWindowManagerContext')` whose `openApp`
records `open:<alias>`. Returns `{ wrapper, calls }`.

- [ ] **Step 3: Run, expect failure.**

- [ ] **Step 4: Implement `board.element.ts`**

```ts
// A/backoffice/src/hub/board.element.ts
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import type { ArcadeGame, UmbraDesktopGameLeaderboard } from '../games/game-manifest.js';
import { formatScore } from '../shared/format.js';
import { AREA } from '../shared/area.js';

/**
 * One leaderboard: the top ten, the viewer pinned underneath when they are not among them or are
 * private, and moderation for those allowed it (design §7).
 */
@customElement('umbradesktop-arcade-board')
export class UmbraDesktopArcadeBoardElement extends UmbLitElement {
  /** The game the board belongs to. */
  @property({ attribute: false })
  game?: ArcadeGame;

  /** The board. */
  @property({ attribute: false })
  board?: UmbraDesktopGameLeaderboard;

  /** The board as last loaded, or undefined while loading or unreachable. */
  @state()
  private _data?: ArcadeBoard;

  /** Whether the last load failed. */
  @state()
  private _failed = false;

  /** The Arcade, once found. */
  #arcade?: UmbraDesktopArcadeContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      void this.reload();
    });
  }

  /** Load the board again; the hub calls this when its tab is shown. */
  async reload(): Promise<void> {
    if (!this.#arcade || !this.game || !this.board) return;
    const data = await this.#arcade.getBoard(this.game.alias, this.board.alias);
    this._failed = data === undefined;
    this._data = data;
  }

  /** Remove a row after confirming. @param entry The row. */
  async #remove(entry: ArcadeBoardEntry): Promise<void> {
    const ok = await umbConfirmModal(this, {
      headline: this.localize.termOrDefault(`${AREA}_removeScoreHeadline`, 'Remove this score?'),
      content: entry.displayName,
      color: 'danger',
      confirmLabel: this.localize.termOrDefault(`${AREA}_remove`, 'Remove'),
    }).then(() => true, () => false);
    if (ok && (await this.#arcade?.removeScore(this.game!.alias, this.board!.alias, entry.userKey))) await this.reload();
  }

  /** Empty the board after confirming. */
  async #reset(): Promise<void> {
    const ok = await umbConfirmModal(this, {
      headline: this.localize.termOrDefault(`${AREA}_resetBoardHeadline`, 'Reset this board?'),
      content: this.localize.termOrDefault(`${AREA}_resetBoardText`, 'Every score on it is removed. This cannot be undone.'),
      color: 'danger',
      confirmLabel: this.localize.termOrDefault(`${AREA}_reset`, 'Reset'),
    }).then(() => true, () => false);
    if (ok && (await this.#arcade?.resetBoard(this.game!.alias, this.board!.alias))) await this.reload();
  }

  /** Put a player's Umbraco name back. @param entry The row. */
  async #resetName(entry: ArcadeBoardEntry): Promise<void> {
    if (await this.#arcade?.resetName(entry.userKey)) await this.reload();
  }

  /** @param entry A row. @param moderate Whether to draw the actions. @returns One table row. */
  #row(entry: ArcadeBoardEntry, moderate: boolean) {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    return html`<tr class=${entry.isViewer ? 'viewer' : ''}>
      <td class="rank">${entry.rank}</td>
      <td class="name">${entry.displayName}</td>
      <td class="score">${formatScore(this.board!.format, entry.value)}</td>
      <td class="date">${this.localize.date(new Date(entry.achievedAtUtc), { dateStyle: 'medium' })}</td>
      ${moderate
        ? html`<td class="actions">
            <uui-button compact look="secondary" data-action="reset-name" label=${t('resetName', 'Reset name')} @click=${() => this.#resetName(entry)}></uui-button>
            <uui-button compact look="secondary" color="danger" data-action="remove" label=${t('remove', 'Remove')} @click=${() => this.#remove(entry)}></uui-button>
          </td>`
        : nothing}
    </tr>`;
  }

  /** @returns The board. */
  override render() {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    const heading = this.board ? this.localize.string(this.board.label) : '';
    const data = this._data;
    if (this._failed) return html`<h3>${heading}</h3><p class="empty">${t('boardUnavailable', 'The board could not be loaded.')}</p>`;
    if (!data) return html`<h3>${heading}</h3><uui-loader-bar></uui-loader-bar>`;
    if (!data.played) return html`<h3>${heading}</h3><p class="empty">${t('boardEmpty', 'Nobody has played this yet.')}</p>`;
    const pinned = data.viewer && !data.top.some((e) => e.isViewer) ? data.viewer : undefined;
    return html`<h3>${heading}</h3>
      <table>
        <tbody>${data.top.map((e) => this.#row(e, data.canModerate))}</tbody>
        ${pinned
          ? html`<tfoot>
              ${this.#row(pinned, false)}
              ${data.viewerIsPublic ? nothing : html`<tr><td colspan="4" class="private">${t('private', 'Private: only you see this')}</td></tr>`}
            </tfoot>`
          : nothing}
      </table>
      ${data.canModerate
        ? html`<uui-button look="secondary" color="danger" data-action="reset-board" label=${t('resetBoard', 'Reset board')} @click=${this.#reset}></uui-button>`
        : nothing}`;
  }

  /** App tokens with fallbacks, so the board follows every theme (desktop-apps.md §4). */
  static override styles = css`
    :host { display: block; color: var(--umbradesktop-app-text, var(--uui-color-text)); font-family: var(--umbradesktop-app-font, inherit); }
    h3 { margin: 0 0 var(--uui-size-space-3); }
    table { width: 100%; border-collapse: collapse; background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background)); border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-border, var(--uui-color-text-alt)); border-radius: var(--umbradesktop-app-radius, 3px); }
    td { padding: var(--uui-size-space-2) var(--uui-size-space-3); border-bottom: 1px solid var(--umbradesktop-app-border, var(--uui-color-text-alt)); }
    .rank, .score { text-align: end; font-variant-numeric: tabular-nums; }
    .date, .private, .empty { color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt)); }
    tr.viewer { background: var(--umbradesktop-app-accent, var(--uui-color-selected)); color: var(--umbradesktop-app-accent-text, var(--uui-color-surface)); }
    tr.viewer .date { color: inherit; }
    tfoot tr:first-child td { border-top: 2px solid var(--umbradesktop-app-border, var(--uui-color-text-alt)); }
    .actions { white-space: nowrap; text-align: end; }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-board': UmbraDesktopArcadeBoardElement;
  }
}
```

- [ ] **Step 5: Run board tests, expect pass.**

- [ ] **Step 6: Failing profile tests**

```ts
// A/backoffice/src/hub/profile.element.test.ts
import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './profile.element.js';
import { arcadeHarness } from './harness.test-helper.js';

const profile = { displayName: 'Ada', isPublic: false, notifyWhenBeaten: true, askedAboutPublic: true };

it('shows the settings and saves a new display name', async () => {
  const { wrapper, calls } = await arcadeHarness({ profile });
  const el = await fixture(html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('uui-input'), 'drawn');
  const input = el.shadowRoot!.querySelector('uui-input') as HTMLInputElement;
  expect(input.value).to.equal('Ada');
  input.value = 'Ace';
  input.dispatchEvent(new Event('input'));
  (el.shadowRoot!.querySelector('[data-action="save-name"]') as HTMLElement).click();
  await waitUntil(() => calls.some((c) => c.startsWith('updateProfile')), 'saved');
  expect(calls).to.include('updateProfile:{"displayName":"Ace"}');
});

it('toggles showing scores', async () => {
  const { wrapper, calls } = await arcadeHarness({ profile });
  const el = await fixture(html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-setting="public"]'), 'drawn');
  (el.shadowRoot!.querySelector('[data-setting="public"]') as HTMLElement).dispatchEvent(new Event('change'));
  await waitUntil(() => calls.some((c) => c.startsWith('updateProfile')), 'saved');
  expect(calls).to.include('updateProfile:{"isPublic":true}');
});
```

(The "delete my scores" path goes through `umbConfirmModal`, which needs a modal manager; test it in
the real backoffice run of Task 29 rather than faking the manager.)

- [ ] **Step 7: Implement `profile.element.ts`**

```ts
// A/backoffice/src/hub/profile.element.ts
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import type { ArcadeProfile } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import { AREA } from '../shared/area.js';

/** The player's own settings: display name, showing scores, notifications, and deleting them (D6, D7). */
@customElement('umbradesktop-arcade-profile')
export class UmbraDesktopArcadeProfileElement extends UmbLitElement {
  /** The settings as last read. */
  @state()
  private _profile?: ArcadeProfile;

  /** The name as typed, before saving. */
  @state()
  private _name?: string;

  /** The Arcade. */
  #arcade?: UmbraDesktopArcadeContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (!arcade) return;
      this.observe(arcade.profile, (profile) => { this._profile = profile; this._name = undefined; });
      void arcade.refreshProfile();
    });
  }

  /** Save the typed name. */
  async #saveName(): Promise<void> {
    if (this._name !== undefined) await this.#arcade?.updateProfile({ displayName: this._name });
  }

  /** Delete everything after confirming. */
  async #delete(): Promise<void> {
    const ok = await umbConfirmModal(this, {
      headline: this.localize.termOrDefault(`${AREA}_deleteHeadline`, 'Delete your scores?'),
      content: this.localize.termOrDefault(`${AREA}_deleteText`, 'Your scores and Arcade settings are removed from every board. This cannot be undone.'),
      color: 'danger',
      confirmLabel: this.localize.termOrDefault(`${AREA}_delete`, 'Delete'),
    }).then(() => true, () => false);
    if (ok) await this.#arcade?.deleteMyScores();
  }

  /** @returns The settings. */
  override render() {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    const profile = this._profile;
    if (!profile) return html`<uui-loader-bar></uui-loader-bar>`;
    return html`
      <uui-box headline=${t('displayName', 'Display name')}>
        <div class="row">
          <uui-input .value=${this._name ?? profile.displayName} maxlength="32" label=${t('displayName', 'Display name')} @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}></uui-input>
          <uui-button look="primary" data-action="save-name" label=${t('save', 'Save')} ?disabled=${this._name === undefined} @click=${this.#saveName}></uui-button>
        </div>
      </uui-box>
      <uui-box headline=${t('privacy', 'Privacy')}>
        <uui-toggle data-setting="public" .checked=${profile.isPublic} label=${t('showScores', 'Show my scores on the leaderboards')} @change=${() => this.#arcade?.updateProfile({ isPublic: !profile.isPublic })}></uui-toggle>
        <uui-toggle data-setting="notify" .checked=${profile.notifyWhenBeaten} label=${t('notifyBeaten', 'Tell me when somebody takes first place from me')} @change=${() => this.#arcade?.updateProfile({ notifyWhenBeaten: !profile.notifyWhenBeaten })}></uui-toggle>
      </uui-box>
      <uui-box headline=${t('yourData', 'Your scores')}>
        <uui-button look="secondary" color="danger" data-action="delete" label=${t('deleteMyScores', 'Delete my scores')} @click=${this.#delete}></uui-button>
      </uui-box>`;
  }

  /** Spacing; the boxes and controls are Umbraco's. */
  static override styles = css`
    :host { display: grid; gap: var(--uui-size-space-4); }
    .row { display: flex; gap: var(--uui-size-space-3); }
    uui-input { flex: 1; }
    uui-toggle { display: block; margin-block: var(--uui-size-space-2); }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-profile': UmbraDesktopArcadeProfileElement;
  }
}
```

Settings are grouped in boxes, and nothing is hidden, per the owner's settings preference.

- [ ] **Step 8: Failing hub tests**

```ts
// A/backoffice/src/hub/hub.element.test.ts
import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './hub.element.js';
import { arcadeHarness } from './harness.test-helper.js';

const games = [
  { alias: 'Pkg.Minesweeper.Game', app: 'Pkg.Minesweeper', label: 'Minesweeper', icon: 'icon-bomb', weight: 1000, leaderboards: [{ alias: 'easy', label: 'Easy', better: 'lower' as const, format: 'time' as const }] },
  { alias: 'Pkg.Solitaire.Game', app: 'Pkg.Solitaire', label: 'Solitaire', icon: 'icon-playing-cards', weight: 800, leaderboards: [{ alias: 'draw-1', label: 'Draw 1', better: 'higher' as const, format: 'points' as const }, { alias: 'draw-3', label: 'Draw 3', better: 'higher' as const, format: 'points' as const }] },
];

it('has a tab per game plus Profile, and shows the first game by default', async () => {
  const { wrapper } = await arcadeHarness({ games, board: { played: false, top: [], viewer: null, viewerIsPublic: false, canModerate: false } });
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelectorAll('uui-tab').length === 3, 'tabs');
  expect(el.shadowRoot!.querySelectorAll('umbradesktop-arcade-board')).to.have.length(1);
});

it('shows every board of the selected game side by side', async () => {
  const { wrapper } = await arcadeHarness({ games, board: { played: false, top: [], viewer: null, viewerIsPublic: false, canModerate: false } });
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelectorAll('uui-tab').length === 3, 'tabs');
  (el.shadowRoot!.querySelectorAll('uui-tab')[1] as HTMLElement).click();
  await waitUntil(() => el.shadowRoot!.querySelectorAll('umbradesktop-arcade-board').length === 2, 'two boards');
});

it('opens the game from Play', async () => {
  const { wrapper, calls } = await arcadeHarness({ games, board: { played: false, top: [], viewer: null, viewerIsPublic: false, canModerate: false } });
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-action="play"]'), 'play');
  (el.shadowRoot!.querySelector('[data-action="play"]') as HTMLElement).click();
  expect(calls).to.include('open:Pkg.Minesweeper');
});

it('says it needs the desktop when there is no Arcade context', async () => {
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`);
  await waitUntil(() => el.shadowRoot!.querySelector('.missing'), 'message');
});
```

- [ ] **Step 9: Implement `hub.element.ts`**

```ts
// A/backoffice/src/hub/hub.element.ts
import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { AREA } from '../shared/area.js';
import './board.element.js';
import './profile.element.js';

/** The one window-manager member the hub uses, published by the host (`docs/developer/desktop-contexts.md`). */
interface DesktopWindows extends UmbContextMinimal {
  /** Open an app by alias. @param alias The app. @returns Whether it opened. */
  openApp(alias: string): boolean;
}

/** The host's window manager, by its published alias; nothing is imported from the host. */
const DESKTOP_WINDOWS = new UmbContextToken<DesktopWindows>('UmbraDesktopWindowManagerContext');

/** The tab id for the profile. */
const PROFILE = '#profile';

/**
 * The Arcade: a tab per game with its boards side by side and a Play button, and a Profile tab
 * (design §7). Lives in the Games group and only appears once a game is registered.
 */
@customElement('umbradesktop-arcade-hub')
export class UmbraDesktopArcadeHubElement extends UmbLitElement {
  /** The registered games. */
  @state()
  private _games: ArcadeGame[] = [];

  /** The selected tab: a game alias or {@link PROFILE}. */
  @state()
  private _tab?: string;

  /** Whether the Arcade context answered at all. */
  @state()
  private _connected = false;

  /** The window manager, for Play. */
  #windows?: DesktopWindows;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this._connected = arcade !== undefined;
      if (arcade) this.observe(arcade.games, (games) => (this._games = games));
    });
    this.consumeContext(DESKTOP_WINDOWS, (windows) => (this.#windows = windows));
  }

  /** The selected game, defaulting to the first. */
  get #selected(): ArcadeGame | undefined {
    return this._tab === PROFILE ? undefined : (this._games.find((g) => g.alias === this._tab) ?? this._games[0]);
  }

  /** @returns The hub. */
  override render() {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    if (!this._connected) return html`<p class="missing">${t('needsDesktop', 'The Arcade only works on the desktop.')}</p>`;
    const game = this.#selected;
    return html`
      <uui-tab-group>
        ${this._games.map((g) => html`<uui-tab label=${this.localize.string(g.label)} .active=${g === game} @click=${() => (this._tab = g.alias)}>
          <uui-icon slot="icon" name=${g.icon}></uui-icon>${this.localize.string(g.label)}</uui-tab>`)}
        <uui-tab label=${t('profile', 'Profile')} .active=${this._tab === PROFILE} @click=${() => (this._tab = PROFILE)}>
          <uui-icon slot="icon" name="icon-user"></uui-icon>${t('profile', 'Profile')}</uui-tab>
      </uui-tab-group>
      <div class="body">
        ${game
          ? html`<header>
                <h2>${this.localize.string(game.label)}</h2>
                <uui-button look="primary" data-action="play" label=${t('play', 'Play')} @click=${() => this.#windows?.openApp(game.app)}></uui-button>
              </header>
              <div class="boards">
                ${game.leaderboards.map((b) => html`<umbradesktop-arcade-board .game=${game} .board=${b}></umbradesktop-arcade-board>`)}
              </div>`
          : this._tab === PROFILE ? html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>` : nothing}
      </div>`;
  }

  /** Layout and the app surface (desktop-apps.md §4). */
  static override styles = css`
    :host { display: flex; flex-direction: column; height: 100%; background: var(--umbradesktop-app-surface, var(--uui-color-surface)); color: var(--umbradesktop-app-text, var(--uui-color-text)); font-family: var(--umbradesktop-app-font, inherit); }
    .body { flex: 1; overflow: auto; padding: var(--uui-size-space-5); }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--uui-size-space-4); }
    h2 { margin: 0; }
    .boards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--uui-size-space-5); }
    .missing { padding: var(--uui-size-space-5); color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt)); }
  `;
}

export { UmbraDesktopArcadeHubElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-hub': UmbraDesktopArcadeHubElement;
  }
}
```

Each board loads itself when it connects; switching tabs re-creates the boards (Lit renders new
elements for the new game's boards), so a tab always shows fresh numbers.

- [ ] **Step 10: Run all `A` tests and the build.** Green.

### Task 21: Arcade manifests and strings

**Files:** Modify `A/backoffice/src/bundle.manifests.ts`, `A/backoffice/src/localization/{en,nl}.ts`.
Test: create `A/backoffice/src/bundle.manifests.test.ts`.

- [ ] **Step 1: Failing test**

```ts
// A/backoffice/src/bundle.manifests.test.ts
import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import en from './localization/en.js';

const byType = (type: string) => manifests.filter((m) => m.type === type);

it('provides the Arcade as a desktop context, never a global one', () => {
  expect(byType('umbraDesktopContext').map((m) => m.alias)).to.deep.equal(['Umbraco.Community.UmbraDesktop.Services.Arcade.Context']);
  expect(byType('globalContext')).to.deep.equal([]);
});

it('owns the Games group at the weight it always had', () => {
  const [catalogue] = byType('umbraDesktopCatalogue') as Array<{ meta: { groups: Array<{ alias: string; weight: number }> } }>;
  expect(catalogue.meta.groups).to.deep.equal([{ alias: 'games', label: '#umbraDesktopArcade_groupGames', weight: 60 }]);
});

it('registers the hub in the Games group, gated on there being a game', () => {
  const [hub] = byType('umbraDesktopApp') as Array<{ alias: string; meta: { group: string }; conditions: Array<{ alias: string }>; element: unknown }>;
  expect(hub.alias).to.equal('Umbraco.Community.UmbraDesktop.Services.Arcade.Hub');
  expect(hub.meta.group).to.equal('games');
  expect(hub.conditions).to.deep.equal([{ alias: 'UmbraDesktop.Arcade.Condition.HasGames' }]);
  expect(typeof hub.element).to.equal('function');
});

it('has every label it points at in the English dictionary', () => {
  for (const m of manifests as Array<{ meta?: { label?: string } }>) {
    const label = m.meta?.label;
    if (label?.startsWith('#')) expect(Object.keys(en.umbraDesktopArcade)).to.include(label.slice(1).split('_')[1]);
  }
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

```ts
// A/backoffice/src/bundle.manifests.ts
import { manifests as localizationManifests } from './localization/manifest.js';
import { HUB_CONTENT_SIZE, HUB_MIN_CONTENT_SIZE } from './hub/constants.js';
import { UMBRADESKTOP_ARCADE_HAS_GAMES_CONDITION } from './conditions/has-games.condition.js';
import { AREA } from './shared/area.js';
import type {} from './games/game-manifest.js';

/** Every alias here is namespaced with the package id and final once shipped. */
const ALIAS = 'Umbraco.Community.UmbraDesktop.Services.Arcade';

/**
 * The Games launcher group. It used to be Entertainment's; it moved here because every game brings
 * the Arcade, and an outside game installed without Entertainment would otherwise land under More.
 * Same alias and weight as before (60, between the host's System at 50 and Experimental at 70), so
 * nothing anyone sees moves.
 */
const catalogue: UmbExtensionManifest = {
  type: 'umbraDesktopCatalogue',
  alias: `${ALIAS}.Catalogue`,
  name: 'UmbraDesktop Arcade catalogue',
  meta: { groups: [{ alias: 'games', label: `#${AREA}_groupGames`, weight: 60 }] },
};

/** The Arcade's context, on the desktop only (design D3). */
const context: UmbExtensionManifest = {
  type: 'umbraDesktopContext',
  alias: `${ALIAS}.Context`,
  name: 'UmbraDesktop Arcade context',
  api: () => import('./context/arcade.context.js'),
};

/** Permits the hub once a game is registered. */
const hasGames: UmbExtensionManifest = {
  type: 'condition',
  alias: UMBRADESKTOP_ARCADE_HAS_GAMES_CONDITION,
  name: 'UmbraDesktop Arcade has games',
  api: () => import('./conditions/has-games.condition.js'),
};

/** The one-time privacy question, opened through Umbraco's modal manager. */
const privacyModal: UmbExtensionManifest = {
  type: 'modal',
  alias: 'UmbraDesktop.Arcade.Modal.Privacy',
  name: 'UmbraDesktop Arcade privacy question',
  element: () => import('./context/privacy-modal.element.js'),
};

/** The hub. Weight 100: after the games themselves, which sit at 800 to 1000. */
const hub: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: `${ALIAS}.Hub`,
  name: 'Arcade',
  element: () => import('./hub/hub.element.js'),
  weight: 100,
  conditions: [{ alias: UMBRADESKTOP_ARCADE_HAS_GAMES_CONDITION }],
  meta: {
    label: `#${AREA}_hub`,
    icon: 'icon-trophy',
    group: 'games',
    defaultSize: HUB_CONTENT_SIZE,
    minSize: HUB_MIN_CONTENT_SIZE,
    allowMultiple: false,
  },
};

/** The bundle Umbraco loads for this package. */
export const manifests: Array<UmbExtensionManifest> = [catalogue, context, hasGames, privacyModal, hub, ...localizationManifests];
```

If `icon-trophy` is not an Umbraco icon, pick the nearest that is (`icon-medal`, `icon-award`); check
with the backoffice icon picker on the TestInstance.

Fill `en.ts` with every key the elements and context use (search for `${AREA}_` across
`A/backoffice/src`): `groupGames, hub ('Arcade'), newBest ('New best on {0}: {1}'), newBestRanked
('New best on {0}: {1}, number {2}'), beaten ('{0} took first place on {1} from you ({2}). Open the
Arcade to see the board.'), privacyHeadline, privacyText, displayName, keepPrivate, showThem,
removeScoreHeadline, remove, resetBoardHeadline, resetBoardText, reset, resetName, resetBoard,
boardUnavailable, boardEmpty, private, privacy, showScores, notifyBeaten, yourData, deleteMyScores,
deleteHeadline, deleteText, delete, save, profile, play, needsDesktop`, each with the English used as
the fallback in code, and translate all in `nl.ts` (e.g. `hub: 'Arcade'`, `play: 'Spelen'`,
`showThem: 'Tonen'`, `keepPrivate: 'Privé houden'`, `boardEmpty: 'Nog niemand heeft dit gespeeld.'`).

- [ ] **Step 4: Run `npm test` and `npm run build` in `A`.** Green.

---

# Phase E: Entertainment

### Task 22: Reaching the Arcade from a game

**Files:** Create `E/backoffice/src/shared/arcade.ts`. Test: `E/backoffice/src/shared/arcade.test.ts`.
Modify `E/backoffice/src/umbradesktop-app.d.ts` only if Task 26 needs `umbraDesktopGame` typed (it
does; add a copy of `ManifestUmbraDesktopGame` and its meta there, with the file's existing header
reasoning).

- [ ] **Step 1: Failing test**

```ts
// E/backoffice/src/shared/arcade.test.ts
import { expect, fixture, html } from '@open-wc/testing';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { ArcadeScores, ARCADE_CONTEXT } from './arcade.js';

@customElement('umbradesktop-entertainment-arcade-test-host')
class Host extends UmbLitElement {}
@customElement('umbradesktop-entertainment-arcade-test-game')
class Game extends UmbLitElement {}

it('does nothing, and says so, without the Arcade', async () => {
  const game = await fixture<Game>(html`<umbradesktop-entertainment-arcade-test-game></umbradesktop-entertainment-arcade-test-game>`);
  const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
  expect(await scores.submit('default', 10)).to.equal(false);
  expect(await scores.best('default')).to.equal(undefined);
});

it('submits through the Arcade when it is there', async () => {
  const host = await fixture<Host>(html`<umbradesktop-entertainment-arcade-test-host><umbradesktop-entertainment-arcade-test-game></umbradesktop-entertainment-arcade-test-game></umbradesktop-entertainment-arcade-test-host>`);
  const calls: unknown[] = [];
  host.provideContext(ARCADE_CONTEXT, { submit: async (...args: unknown[]) => { calls.push(args); return { status: 'accepted' }; }, getBest: async () => 300 } as never);
  const game = host.querySelector('umbradesktop-entertainment-arcade-test-game') as Game;
  const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
  expect(await scores.submit('default', 10)).to.equal(true);
  expect(calls).to.deep.equal([['Pkg.Snake.Game', 'default', 10]]);
  expect(await scores.best('default')).to.equal(300);
});
```

- [ ] **Step 2: Run (from `E`), expect failure.**

- [ ] **Step 3: Implement**

```ts
// E/backoffice/src/shared/arcade.ts
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The part of the Arcade's context a game uses, declared here because nothing is imported from
 * another package (design D4; the same pattern as the desktop's settings context in desktop-apps.md
 * §7.2). `docs/developer/putting-your-game-on-the-arcade.md` in the Arcade package is the contract.
 */
interface ArcadeForGames extends UmbContextMinimal {
  /** Submit a score; the Arcade handles the question, the toast and the notification. */
  submit(game: string, board: string, value: number): Promise<{ status: string } | undefined>;
  /** The player's best, null if unplayed, undefined if unreachable. */
  getBest(game: string, board: string): Promise<number | null | undefined>;
}

/** The Arcade's context, by its published alias. */
export const ARCADE_CONTEXT = new UmbContextToken<ArcadeForGames>('UmbraDesktopArcadeContext');

/**
 * One game's line to the Arcade. Every game behaves exactly as before when the Arcade is not there:
 * in its own tests, outside the desktop, or under an Arcade that failed to load.
 */
export class ArcadeScores extends UmbControllerBase {
  /** The game's `umbraDesktopGame` alias. */
  readonly #game: string;

  /** The Arcade, once and if found. */
  #arcade?: ArcadeForGames;

  /** Resolves when the lookup has answered, so a submit right after opening still finds it. */
  readonly #ready: Promise<void>;

  /**
   * @param host The game element.
   * @param game The game's `umbraDesktopGame` manifest alias.
   */
  constructor(host: UmbControllerHost, game: string) {
    super(host);
    this.#game = game;
    this.#ready = this.getContext(ARCADE_CONTEXT, { preventTimeout: false })
      .then((arcade) => { this.#arcade = arcade; })
      .catch(() => { this.#arcade = undefined; });
  }

  /**
   * Submit a score.
   * @param board The board's alias.
   * @param value Points, or milliseconds.
   * @returns Whether the Arcade took it.
   */
  async submit(board: string, value: number): Promise<boolean> {
    await this.#ready;
    const result = await this.#arcade?.submit(this.#game, board, value);
    return result?.status === 'accepted';
  }

  /**
   * The player's best from the Arcade.
   * @param board The board's alias.
   * @returns The best, or undefined without the Arcade or a best.
   */
  async best(board: string): Promise<number | undefined> {
    await this.#ready;
    return (await this.#arcade?.getBest(this.#game, board)) ?? undefined;
  }
}
```

`getContext` rejects after Umbraco's context timeout when nobody provides the token; check how
`getContext` behaves in 17 without a provider (it may resolve `undefined` after a timeout, or
reject). Either way `#ready` settles; if the timeout is long (seconds), the first test above will be
slow: shorten with the option 17 offers (`{ preventTimeout: false }` is a placeholder for whatever
the real option is called; drop it if there is none and accept Umbraco's default). The test must not
wait more than the runner's 5 s timeout.

- [ ] **Step 4: Run, expect pass.**

### Task 23: Minesweeper submits its time on a win

**Files:** Modify `E/backoffice/src/minesweeper/minesweeper.element.ts` (`#onReveal` ~line 222,
`#newGame` ~line 212). Test: `E/backoffice/src/minesweeper/minesweeper.element.test.ts` (append).

- [ ] **Step 1: Failing tests.** The element gets two injectable members for tests: `now` (a clock,
default `() => performance.now()`) and `scores` (default `new ArcadeScores(this, MINESWEEPER_GAME_ALIAS)`).

```ts
it('submits the exact time from first click to win, to the easy board, once', async () => {
  const submitted: Array<[string, number]> = [];
  let clock = 1000;
  // Under WALL (column 4 mined, plus cell 8) two clicks win: SAFE_CORNER floods every cell left of
  // the wall, and the bottom-right corner (80) floods every cell right of it, numbers included.
  const element = await fixture<MinesweeperElement>(html`<umbradesktop-minesweeper .placer=${placeAt(WALL)} .now=${() => clock}
    .scores=${{ submit: async (board: string, value: number) => { submitted.push([board, value]); return true; } }}></umbradesktop-minesweeper>`);
  cells(element)[SAFE_CORNER].click();
  await settled(element);
  clock = 10_400;
  cells(element)[80].click();
  await settled(element);
  cells(element)[0].click();
  await settled(element);
  expect(element.shadowRoot!.textContent).to.contain('Cleared.');
  expect(submitted).to.deep.equal([['easy', 9_400]]);
});

it('does not submit a loss', async () => {
  const submitted: unknown[] = [];
  const element = await fixture<MinesweeperElement>(html`<umbradesktop-minesweeper .placer=${placeAt(WALL)}
    .scores=${{ submit: async (...a: unknown[]) => { submitted.push(a); return true; } }}></umbradesktop-minesweeper>`);
  cells(element)[SAFE_CORNER].click();
  await settled(element);
  cells(element)[MINED_CELL].click();
  await settled(element);
  expect(submitted).to.deep.equal([]);
});
```

The third click (on an already revealed cell after the win) proves the submit happens once. If the
two-click win does not hold under `withFirstClickSafe` (it moves a mine only when the first click
lands on one, and SAFE_CORNER is not mined), check the board with `rules.test.ts`'s helpers before
changing the cells.

- [ ] **Step 2: Run (from `E`), expect failure.**

- [ ] **Step 3: Implement.** In `constants.ts`:

```ts
/** This game's `umbraDesktopGame` alias, its identity on the Arcade. Final once shipped. */
export const MINESWEEPER_GAME_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.Minesweeper.Game';
/**
 * The board the beginner layout scores on. Called `easy` rather than `beginner` because larger
 * boards are coming and the owner named this one; each later board is one more leaderboard in the
 * game manifest, and nobody's easy time moves (design D13).
 */
export const MINESWEEPER_EASY_BOARD = 'easy';
```

In the element:

```ts
  /** The clock a game is timed on; injectable for tests. Milliseconds, monotonic. */
  now: () => number = () => performance.now();

  /** The line to the Arcade; injectable for tests. Does nothing without the Arcade. */
  scores: Pick<ArcadeScores, 'submit'> = new ArcadeScores(this, MINESWEEPER_GAME_ALIAS);

  /**
   * When the current game's first click landed, by {@link now}. The on-screen clock counts whole
   * seconds and the easy board ties constantly on them, so the Arcade gets this exact span instead.
   */
  #startedAt?: number;
```

`#onReveal`:

```ts
  #onReveal(index: number): void {
    if (!this._board) return;
    const before = this._board.status;
    if (before === 'ready') this.#startedAt = this.now();
    this._board = reveal(this._board, index);
    if (before !== 'won' && this._board.status === 'won' && this.#startedAt !== undefined) {
      void this.scores.submit(MINESWEEPER_EASY_BOARD, Math.round(this.now() - this.#startedAt));
    }
  }
```

`#newGame`: add `this.#startedAt = undefined;`. Import `ArcadeScores` from `'../shared/arcade.js'`
and the two constants.

- [ ] **Step 4: Run Minesweeper's tests, expect pass.** Full `npm test` in `E`.

### Task 24: Snake submits at game over and reads its best from the Arcade

**Files:** Modify `E/backoffice/src/snake/snake.element.ts` (`willUpdate` ~line 151, `updated` ~line 169,
the `_best` field ~line 120). Test: append to `snake.element.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
describe('the Arcade', () => {
  beforeEach(() => window.localStorage.removeItem(BEST_SCORE_KEY));

  it('submits the score once when the game ends', async () => {
    const submitted: Array<[string, number]> = [];
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake .placer=${foodAt(1)} .tickInterval=${() => 10}
      .scores=${{ submit: async (b: string, v: number) => { submitted.push([b, v]); return true; }, best: async () => undefined }}></umbradesktop-snake>`);
    await press(element, 'ArrowRight');
    await waitUntil(() => status(element) === 'over', 'the snake should reach the wall', { timeout: 3000 });
    await element.updateComplete;
    expect(submitted).to.have.length(1);
    expect(submitted[0][0]).to.equal('default');
  });

  it('shows the Arcade best when it is higher than the browser one', async () => {
    window.localStorage.setItem(BEST_SCORE_KEY, '50');
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .scores=${{ submit: async () => true, best: async () => 300 }}></umbradesktop-snake>`);
    await waitUntil(() => text(element, '.best') === '300', 'arcade best shown');
  });
});
```

The first case's food position must make the snake score at least once before the wall, or the
submit is a score of 0, which the server refuses: place food in the snake's path (`foodAt(<cell
ahead>)`, as the existing best-score suite's `ahead()` helper does) and expect a value of 10.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement.** In `constants.ts`: `SNAKE_GAME_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.Snake.Game'`
and `SNAKE_BOARD_ALIAS = 'default'` with doc comments. In the element:

```ts
  /** The line to the Arcade; injectable for tests. Does nothing without the Arcade. */
  scores: Pick<ArcadeScores, 'submit' | 'best'> = new ArcadeScores(this, SNAKE_GAME_ALIAS);

  /** The status at the last update, to catch the one transition into a finished game. */
  #lastStatus?: SnakeStatus;

  /** Ask the Arcade for the best on connect; the browser's stays as the fallback (design §3). */
  override connectedCallback(): void {
    super.connectedCallback();
    void this.scores.best(SNAKE_BOARD_ALIAS).then((best) => {
      if (best !== undefined && best > this._best) this._best = best;
    });
  }
```

At the end of `updated()` (after the existing clock handling):

```ts
    const status = this._game?.status;
    const finished = status === 'over' || status === 'won';
    if (finished && this.#lastStatus !== status && this._game!.score > 0) {
      void this.scores.submit(SNAKE_BOARD_ALIAS, this._game!.score * SNAKE_POINTS_PER_FOOD);
    }
    this.#lastStatus = status;
```

Update the `BEST_SCORE_KEY` doc comment: the browser's best is now the fallback for when the Arcade
is absent, not the only record. Keep `localStorage` writing as is.

- [ ] **Step 4: Run Snake's tests, expect pass.**

### Task 25: Solitaire submits its score on a win

**Files:** Modify `E/backoffice/src/solitaire/solitaire.element.ts` (`#win` ~line 790, right after
`this._game = withTimeBonus(...)`, before any `await`). Test: append to `solitaire.element.test.ts`
in `describe('solitaire element: finishing')`.

- [ ] **Step 1: Failing test**

```ts
  it('submits the final score, time bonus included, to the board for the game\'s own draw mode', async () => {
    const submitted: Array<[string, number]> = [];
    const el = await solitaire({ game: { ...nearlyWon(), drawCount: 3 } });
    el.scores = { submit: async (b: string, v: number) => { submitted.push([b, v]); return true; } } as never;
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'won');
    expect(submitted).to.deep.equal([['draw-3', 110]]);
  });
```

`nearlyWon`, `solitaire` and `doubleClick` are the file's existing helpers. Extend `solitaire()`'s
options with `scores` if assigning after mount is too late for the element; assigning before the
winning move, as above, is enough because submit happens at the win.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement.** In `constants.ts`: `SOLITAIRE_GAME_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Game'`
and `solitaireBoard(drawCount: DrawCount): 'draw-1' | 'draw-3'` returning `` `draw-${drawCount}` ``.
In the element:

```ts
  /** The line to the Arcade; injectable for tests. Does nothing without the Arcade. */
  scores: Pick<ArcadeScores, 'submit'> = new ArcadeScores(this, SOLITAIRE_GAME_ALIAS);
```

In `#win`, immediately after `this._game = withTimeBonus(this._game!, this._elapsed);`:

```ts
    // Before the cascade's awaits: a New game started mid-cascade bumps the epoch and returns early,
    // and must not cost the player the score they just won. The game's own draw mode, never the
    // settings', which only apply to the next deal.
    void this.scores.submit(solitaireBoard(this._game.drawCount), this._game.score);
```

A won game scoring 0 is possible in theory (heavy time penalties, no bonus). The server refuses it;
that is fine and needs no handling here.

- [ ] **Step 4: Run Solitaire's tests, expect pass.**

### Task 26: Entertainment manifests and the dependency

**Files:** Modify `E/backoffice/src/bundle.manifests.ts`, `E/backoffice/src/bundle.manifests.test.ts`,
`E/backoffice/src/localization/{en,nl}.ts`, `E/Umbraco.Community.UmbraDesktop.Entertainment.csproj`,
`src/Directory.Build.targets`.

- [ ] **Step 1: Failing tests** (append to `bundle.manifests.test.ts`):

```ts
const games = manifests.filter((m) => m.type === 'umbraDesktopGame') as Array<{ alias: string; meta: { app: string; leaderboards: Array<{ alias: string; better: string; format: string }> } }>;

it('puts all three games on the Arcade, each linked to its app', () => {
  expect(games.map((g) => [g.alias, g.meta.app])).to.deep.equal([
    ['Umbraco.Community.UmbraDesktop.Entertainment.Minesweeper.Game', 'Umbraco.Community.UmbraDesktop.Entertainment.Minesweeper'],
    ['Umbraco.Community.UmbraDesktop.Entertainment.Snake.Game', 'Umbraco.Community.UmbraDesktop.Entertainment.Snake'],
    ['Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Game', 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire'],
  ]);
});

it('scores Minesweeper as a time, Snake and Solitaire as points', () => {
  expect(games.map((g) => g.meta.leaderboards.map((b) => `${b.alias}:${b.better}:${b.format}`))).to.deep.equal([
    ['easy:lower:time'],
    ['default:higher:points'],
    ['draw-1:higher:points', 'draw-3:higher:points'],
  ]);
});

it('no longer defines the Games group, which the Arcade owns', () => {
  expect(manifests.filter((m) => m.type === 'umbraDesktopCatalogue')).to.deep.equal([]);
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement.** Remove `catalogue` and its doc comment from `bundle.manifests.ts`
(apps keep `group: 'games'`). Remove `groupGames` from `en.ts`/`nl.ts` if nothing else reads it
(grep first). Add:

```ts
/**
 * The three games on the Arcade (design D13). Each alias is the game's identity in the Arcade's
 * database, so like an app alias it is final once shipped. The Arcade reads these; the games submit
 * through `shared/arcade.ts`, and play exactly as before when the Arcade is not there.
 */
const games: UmbExtensionManifest[] = [
  {
    type: 'umbraDesktopGame',
    alias: MINESWEEPER_GAME_ALIAS,
    name: 'Minesweeper scores',
    weight: 1000,
    meta: {
      app: 'Umbraco.Community.UmbraDesktop.Entertainment.Minesweeper',
      label: '#umbraDesktopEntertainment_minesweeper',
      icon: 'icon-bomb',
      leaderboards: [{ alias: MINESWEEPER_EASY_BOARD, label: '#umbraDesktopEntertainment_minesweeperEasy', better: 'lower', format: 'time' }],
    },
  },
  {
    type: 'umbraDesktopGame',
    alias: SNAKE_GAME_ALIAS,
    name: 'Snake scores',
    weight: 900,
    meta: {
      app: 'Umbraco.Community.UmbraDesktop.Entertainment.Snake',
      label: '#umbraDesktopEntertainment_snake',
      icon: 'icon-game',
      leaderboards: [{ alias: SNAKE_BOARD_ALIAS, label: '#umbraDesktopEntertainment_snake', better: 'higher', format: 'points' }],
    },
  },
  {
    type: 'umbraDesktopGame',
    alias: SOLITAIRE_GAME_ALIAS,
    name: 'Solitaire scores',
    weight: 800,
    meta: {
      app: 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire',
      label: '#umbraDesktopEntertainment_solitaire',
      icon: 'icon-playing-cards',
      leaderboards: [
        { alias: 'draw-1', label: '#umbraDesktopEntertainment_solitaireDrawOne', better: 'higher', format: 'points' },
        { alias: 'draw-3', label: '#umbraDesktopEntertainment_solitaireDrawThree', better: 'higher', format: 'points' },
      ],
    },
  },
];
```

and put `...games` in `manifests`. Add the keys `minesweeperEasy: 'Easy'`/`'Makkelijk'`; reuse
existing Draw 1 / Draw 3 keys if Solitaire's settings already have them (grep `solitaireDraw`),
otherwise add `solitaireDrawOne: 'Draw 1'`/`'1 kaart'`, `solitaireDrawThree: 'Draw 3'`/`'3 kaarten'`,
and add new Solitaire keys to `dictionaries.test.ts`'s `SOLITAIRE_KEYS` list. Add
`ManifestUmbraDesktopGame` to `E/backoffice/src/umbradesktop-app.d.ts`.

- [ ] **Step 4: Project reference.** In the Entertainment csproj, beside the host reference:

```xml
	  <!-- The Arcade, for high scores (docs/design/2026-10-01-arcade-design.md). Packed as a NuGet
	       dependency, so installing the games installs the Arcade. Bounded to this release up to the
	       last 17 by BoundHostRange in src/Directory.Build.targets, the same as the host. -->
	  <ProjectReference Include="..\Umbraco.Community.UmbraDesktop.Services.Arcade\Umbraco.Community.UmbraDesktop.Services.Arcade.csproj" />
```

- [ ] **Step 5: Widen `BoundHostRange`.** In `src/Directory.Build.targets`, change the condition to
cover both, and update its comment to say the Arcade is bounded for the same reason as the host:

```xml
			<_ProjectReferencesWithVersions Condition="'%(Filename)' == 'Umbraco.Community.UmbraDesktop' Or '%(Filename)' == 'Umbraco.Community.UmbraDesktop.Services.Arcade'">
```

- [ ] **Step 6: Verify.** `npm test` and `npm run build` in `E`; `dotnet build E/...csproj`;
`dotnet pack E/... -o ./artifacts-check` (after `npm run build` in host, Arcade and `E`) and confirm
the nuspec lists `Umbraco.Community.UmbraDesktop.Services.Arcade` with `[<version>, 17.99999999.0]`:
`unzip -p ./artifacts-check/Umbraco.Community.UmbraDesktop.Entertainment.*.nupkg '*.nuspec'`. Delete
`./artifacts-check` afterwards.

---

# Phase F: Release plumbing, docs, verification

### Task 27: CI and release

**Files:** `.github/actions/build-packages/action.yml`, `.github/workflows/ci.yml`, `RELEASE.md`, `CLAUDE.md`.

- [ ] **Step 1: `action.yml`.** Add the Arcade (and its test project where test projects are listed)
to: npm `cache-dependency-path`, the NuGet cache `hashFiles` list, Restore, Install frontend
dependencies, Test frontend, Build frontend, Build, Test backend (`dotnet test AT/...csproj`), Pack.
Order: after the host, before Entertainment (Entertainment's build needs the Arcade's frontend built
because its project reference pulls the Arcade's static web assets).

- [ ] **Step 2: The range check.** Extend "Verify each add-on's host dependency range": for every
add-on that depends on `Umbraco.Community.UmbraDesktop.Services.Arcade`, check that dependency is
`[$host_version, $ceiling]` too (all packages share the version). Add after the host check inside
the loop:

```bash
          arcade=$(unzip -p "$pkg" '*.nuspec' | sed -n 's:.*<dependency id="Umbraco.Community.UmbraDesktop.Services.Arcade" version="\([^"]*\)".*:\1:p')
          if [ -n "$arcade" ]; then
            echo "$pkg: Arcade dependency '$arcade', expected '$expected'"
            [ "$arcade" = "$expected" ] || { echo "::error::$pkg depends on the Arcade as '$arcade', expected '$expected'"; failed=1; }
          fi
```

and update the step's comment.

- [ ] **Step 3: `ci.yml`** solution job: the Arcade's `package-lock.json` in the npm cache paths and
`(cd src/Umbraco.Community.UmbraDesktop.Services.Arcade && npm ci && npm run build)` in "Build
frontends", before Entertainment.

- [ ] **Step 4: `RELEASE.md`.** "What ships": "Four packages", a row for the Arcade ("Service
package. High scores and the Arcade hub. Never installed on its own: Entertainment, and any game
add-on, depends on it. Has server code (EF Core tables and an API) and a C# test project. No
Marketplace listing."), "All four publish". Note under the add-on range paragraph that Entertainment
also requires this release of the Arcade, bounded the same way. Marketplace section: say the Arcade
deliberately has no listing (design D2). While there, correct the inaccurate Accessories sentence
the research found (it says Accessories references `Umbraco.Cms.Api.Management` and `.Common`
directly; it gets them through the host reference).

- [ ] **Step 5: `CLAUDE.md` layout.** Add under the add-on lines:

```
src/Umbraco.Community.UmbraDesktop.Services.Arcade/
  docs/                         high scores: a service package games depend on, never installed alone
```

and add the Arcade to the "C# has a test project for the host and one for each add-on" sentence's
examples if it lists them.

### Task 28: Docs

**Files:** `A/docs/developer/putting-your-game-on-the-arcade.md`, `A/docs/developer/README.md`,
`A/docs/user/arcade.md`, `A/README.md`, `E/docs/user/games.md`, `E/README.md`,
`umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json`.

- [ ] **Step 1: Re-read `docs/developer/writing-documentation.md`.**

- [ ] **Step 2: Developer page** (`id: putting-your-game-on-the-arcade`). Sections:
  1. What you get (boards, the privacy question, the toast, the beaten notification, the hub) and
     that the player's Arcade is the one your game's package depends on.
  2. Depend on the package: `<PackageReference Include="Umbraco.Community.UmbraDesktop.Services.Arcade" />`
     with the same version range as the host.
  3. The `umbraDesktopGame` manifest, field by field (Task 14's `MetaUmbraDesktopGame`), with
     Entertainment's Solitaire manifest as the example. Aliases are final.
  4. Submitting: the token by string, the `ArcadeForGames` interface, `submit` and `getBest`, with
     `E/backoffice/src/shared/arcade.ts` as the worked example. Keep the fallback.
  5. What counts: values are whole numbers, positive, inside `min`/`max`; times in milliseconds.
  6. Honesty: this is a sanity check, not security (D12); admins can remove scores.
  7. What the console tells you (dropped manifests, unknown board).
  Link it from `A/docs/developer/README.md` (create it with the `Developer guide` heading, as
  Entertainment's) and from the host's `docs/developer/desktop-contexts.md` §4 as the worked example.

- [ ] **Step 3: User page** `A/docs/user/arcade.md` (`id: arcade`): open the Arcade (bold labels
from `localization/en.ts`: **Arcade**, **Play**, **Profile**), the boards, the first-score question,
**Show my scores on the leaderboards**, **Tell me when somebody takes first place from me**, changing
your **Display name**, **Delete my scores**, what admins can do, and what happens to a colleague who
leaves (they drop off when disabled).

- [ ] **Step 4: `A/README.md`.** For game authors: what it is, that nobody installs it on purpose,
links to both pages, and the uninstall note with the SQL:
```sql
DROP TABLE umbraDesktopArcadeBeaten;
DROP TABLE umbraDesktopArcadeScore;
DROP TABLE umbraDesktopArcadeLeaderboard;
DROP TABLE umbraDesktopArcadeProfile;
DROP TABLE umbraDesktopArcadeMigrations;
```
The last is the Arcade's own migrations history (`ArcadeDbContext.MigrationsHistoryTable`), so
nothing else on the site is touched. No raw HTML anywhere in a README.

- [ ] **Step 5: Entertainment.** `E/docs/user/games.md`: under Play, a short "High scores" section
linking to the Arcade page; Minesweeper's line says "three difficulties", which the code does not
have: change it to the beginner board it has and say the Arcade calls it Easy. Snake's "remembered in
the browser" line becomes "kept on the Arcade, or in the browser without it". `E/README.md`: one
line, "Scores go to the Arcade leaderboards, with a notification when somebody takes first place from
you.", and fix "three difficulties" there too. Marketplace json `Tags`: add `"high scores"`,
`"leaderboard"`. Do not touch `Description`.

- [ ] **Step 6: Run `npm run docs:check` in `H`.** Green.

### Task 29: Verify against a real backoffice

Unit tests do not prove the EF registration, the migrations on both providers, the scope, or the
modal and toasts in a real desktop. `docs/design/2026-09-24-accessories-design.md` §9 is the recipe
(the owner's memory notes: a database copy per task, `npm run build` before `dotnet build`, revert
the TestInstance lock-file bump afterwards, browse on `<task>.localhost:<port>`, grant the Desktop
section on a fresh database; the hidden Browser pane does not render the backoffice, use the repo's
puppeteer-core headless setup).

- [ ] **Step 1: Build everything** (`npm run build` in host, Arcade, Entertainment, Accessories;
then `dotnet build` the TestInstance) and start it on SQLite.
- [ ] **Step 2: Tables.** Confirm the four `umbraDesktopArcade*` tables exist after first start and
the log has no Arcade migration error.
- [ ] **Step 3: Two users,** both with the Desktop section, one also with Users. As user A: open
the launcher; the **Arcade** tile is under **Games**. Win Minesweeper: the privacy dialog appears
once; choose **Show them**; a "New best" toast shows in the notification centre. Open the Arcade:
the Minesweeper tab shows A at number 1 with a seconds-to-one-decimal time.
- [ ] **Step 4: Beaten.** As user B (public), beat A's Snake score. Sign in as A, open the desktop:
one warning toast naming B and Snake; it is in the scrollback; reload the desktop: it does not come
back.
- [ ] **Step 5: Moderation and privacy.** As the admin: **Remove** a row, **Reset board**,
**Reset name**. As A: turn off **Show my scores** and confirm B no longer sees A; **Delete my
scores**. Confirm the Users section alias assumption (`Umb.Section.Users`) held, since moderation
buttons appeared only for the admin.
- [ ] **Step 6: Desktop only.** Leave the desktop for the Content section: no Arcade API calls in
the network log; open a section window inside the desktop: no second Arcade context (no second
`beaten/take` call).
- [ ] **Step 7: SQL Server.** Repeat Step 2 on a LocalDB/SQL Server copy (the owner's memory has the
LocalDB worktree workaround), so the SQL Server migration set is proven too.
- [ ] **Step 8: Themes.** Look at the hub under all five themes; nothing disappears (a theme may
restyle, never remove).
- [ ] **Step 9: Restore** test-run artefacts as the recipe says (lock file, database copies).
Write anything the run taught into the design doc's new "Notes from the build" section.

### Task 30: Definition of done

- [ ] `npm run build` and `npm test` pass in `H`, `A`, `E` (and Accessories, unchanged but built by
CI together). `dotnet test` passes for `src/Umbraco.Community.UmbraDesktop.Tests/...csproj`,
`src/Umbraco.Community.UmbraDesktop.Accessories.Tests/...csproj` and `AT/...csproj`, each by project file.
- [ ] Docs pages exist and are linked (Tasks 3, 28).
- [ ] READMEs: one line in Entertainment's; the Arcade's own for game authors; host README
unchanged (the Arcade is not something a person deciding to install the desktop needs).
- [ ] Marketplace: Entertainment tags updated; no Arcade listing (D2); Entertainment screenshot
unchanged unless the owner wants the hub shown.
- [ ] Design doc: status updated to "Built", notes from the build added.
- [ ] Anything learned that is not obvious from the code is written where the next person hits it.
- [ ] **Nothing committed.** Report the changed files to the owner and stop.

