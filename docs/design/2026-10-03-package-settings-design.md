# Package settings in Desktop settings: design

> A package that extends the desktop gets one row of its own in Desktop settings, named after the
> package and kept apart from ours, with its settings in boxes on that row's screen. The desktop
> offers an optional per-user store for those settings, and a way to open settings at a package.

- **Status:** Built and verified 2026-10-04 (§12 has what the build added to this design)
- **Date:** 2026-10-03
- **Branch:** designed on `claude/umbraco-desktop-research-c3d75e`, built on `worktree-103-package-settings`
- **Issue:** [#103](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/103). Unblocks
  [#104](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/104), moving Connections
  into an add-on
- **Supersedes:** the issue text of #103 (categories interleaved with ours by weight, Connections as
  the first consumer) and the never-merged `2026-09-25-settings-category-extension-design.md` on
  `fork/settings-cat` (commit `0c8d92a`), whose modal code this reuses
- **Target:** Umbraco CMS **v17**, packages `Umbraco.Community.UmbraDesktop` and
  `Umbraco.Community.UmbraDesktop.Accessories`

---

## 1. Goal & scope

Desktop settings is a fixed list (`settings/categories/index.ts`). A package that adds apps to the
desktop and has settings for them has nowhere to put them but a window of its own, which is what the
Accessories screensaver does today. Connections, which is about to move into an add-on (#104), has a
settings category and would lose it.

**In scope:**

- A manifest type, `umbraDesktopPackageSettings`, one per box of settings.
- An "Add-ons" section in the settings list: one row per package, one box per manifest.
- A global context, `UmbraDesktop.PackageSettingsContext`, with `store(key)` and `openSettings(packageName)`.
- An optional `meta.opensSettings` on `umbraDesktopApp`, so a launcher tile can open settings.
- Accessories as the first consumer: the screensaver's controls move into Desktop settings, onto the
  host store, and the Screen Saver tile becomes a shortcut.

**Out of scope:**

- Settings inside our own categories (D3).
- Site-wide storage. The store is per user; site-wide settings need a server and a permission check,
  which a package does itself, as Connections will (#104).
- Moving Connections. It stays a curated category until #104 moves it and registers it from the add-on.
- Settings as a window. Not built here, but the contract is shaped for it (D7).

## 2. Settled decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | **The package is the unit, not the manifest.** Every manifest names its package in `meta.package`; all manifests with the same package name become one row, and each manifest is one box on that row's screen | The browser cannot tell which package a manifest came from (§7.1), so "one row per package" cannot be counted, only built in. Grouping makes a package that registers five manifests get five boxes, never five rows |
| D2 | **Package rows sit in their own section, below ours, under a heading, in alphabetical order** | Makes it plain that these settings are not UmbraDesktop's, so nobody blames the desktop for them. It also removes every ordering question #103 had: no published weights, no "Site stays last" rule, no scale to get backwards |
| D3 | **No settings inside our categories** | The screensaver under Appearance was the one case for it. A package box among ours could break the layout of screens we own, and the package's own row gives the screensaver a home without that risk |
| D4 | **The package name is plain text, not a localisation key** | It is a proper noun, and the grouping key. A translated name would group differently per language |
| D5 | **The host offers a per-user store, and nobody has to use it** | Umbraco's user data service is the storage, but its client lists rows by group and creates or updates by key. Every package writes the same glue on top, with tab sync and failure status: Accessories' version is about 340 lines. Lifting that glue is moving tested code, not inventing an API. A package that wants its own storage ignores the store |
| D6 | **The context is global, not desktop-level** | Code that runs for the desktop's whole life has nowhere to live except a backoffice entry point, outside the desktop element: the screensaver's idle watcher is one. A desktop-level context cannot reach it. The alternative, a new "runs with the desktop" manifest type, is public API for one user (§9) |
| D7 | **A package's element is a content box, and opening settings goes through the context** | Settings may become a window later. A box that assumes nothing about a modal, and a call that the host implements, survive that. The modal's alias is not published |
| D8 | **`meta.opensSettings` on `umbraDesktopApp`** | An app cannot close its own window, so a tile that only opens settings needs the host to know. Keeps the Screen Saver tile where users find it today |

## 3. The manifest

```ts
{
  type: 'umbraDesktopPackageSettings',
  alias: 'Umbraco.Community.UmbraDesktop.Accessories.Settings.Screensaver',
  name: 'Accessories screensaver settings',
  element: () => import('./screensaver/screensaver-panel.element.js'),
  weight: 100,
  meta: {
    package: 'UmbraDesktop Accessories',
    label: '#umbraDesktopAccessories_screensaver',
  },
  conditions: [],
}
```

| Field | Required | Meaning |
|-------|----------|---------|
| `meta.package` | yes | The package's name as people know it, plain text (D4). The grouping key and the row's name |
| `meta.label` | yes | The box's heading. A `#` localisation key or a literal |
| `element` | yes | The box's content. Every form Umbraco accepts, resolved with `createExtensionElement`, so a path string in a static `umbraco-package.json` works |
| `weight` | no | Orders boxes within the package's screen, **higher first, Umbraco's convention**. It never orders anything against ours, so there is no reason to invert it |
| `conditions` | no | Umbraco's own. A box whose conditions are unmet is not drawn; a package with no boxes left has no row |

No icon and no description. Every package row uses the same icon, which marks it as a package, and
its line under the name lists its box headings ("Screen saver"), which says what the package's
settings are for without the author writing a second sentence that can go stale.

**Validation** is one pure function, `normalisePackageSettings`, in the shape of
`registered-apps.ts` and `package-catalogues.ts`: never throws, drops what it cannot use, and
reports each drop to the console naming the manifest alias. Dropped: no `meta`, no usable
`meta.package` or `meta.label`, no `element` (with the `js` hint `registered-apps.ts` gives). A
`meta.package` equal to `UmbraDesktop`, compared ignoring case and surrounding space, is dropped too, so a package cannot put its
settings under our name. Unknown fields are ignored silently, so a newer manifest works on an older
desktop. Two manifests with one alias cannot happen: Umbraco's registry refuses the second.

The type goes into `settings/package-settings.extension.ts`, registered in `UmbExtensionManifestMap`
like the other three, and into the hand-copied `umbradesktop-app.d.ts` of each add-on that uses it.

## 4. The settings panel

**The list.** Our six categories, unchanged. Below them, only when at least one package has a box,
a heading ("Add-ons", see §12) and one row per package name, sorted by name with the current
locale. The row: the package icon (one Umbraco icon for every package, checked to exist in the
shipped set), the package name, the box headings joined.

**A package's screen.** Under the panel heading (the package name, with the back button as today),
one line naming the package these settings come from ("These settings come from the X add-on").
It does not add "not from UmbraDesktop": that reads oddly for the desktop's own add-ons, Accessories
and Connections, and the "Add-ons" heading already says it. Then one `uui-box`
per manifest, headed by its `meta.label`, in weight order, the package's element inside. The host
draws the box, so every package's screen has the grouping the desktop's own screens use.

**Loading.** A box's element is loaded the first time its package's screen is opened, not when the
panel opens. A box shows a loader while it loads, and a line saying it could not be loaded if it
fails, never an empty box. One failed box does not affect the others. Loaded elements are kept for
as long as the panel is open, like the curated screens are.

**Deep links.** The panel's `category` data also accepts a package name. Package boxes arrive after
the panel connects, once conditions have been evaluated, so a link naming a package that has not
arrived yet is held and answered when it does; the list shows meanwhile. A name that never arrives
leaves the list showing, as an unknown id does today.

**A package that goes away while open**, because a condition changed, takes the panel back to the
list. A single box that goes away is removed from the screen.

Observation lives in the panel, through `UmbExtensionsManifestInitializer`, which evaluates
conditions; `byType` does not. The panel is a modal, and Umbraco's modal passes context requests on
to the element that opened it, so conditions and package elements see the desktop's contexts.

## 5. The global context

Registered by the host as a `globalContext`, token alias `UmbraDesktop.PackageSettingsContext`. It
does nothing until asked: no request is made at boot.

```ts
interface UmbraDesktopPackageSettingsContext {
  /** The signed-in user's settings document for this key. One shared instance per key per page. */
  store(key: string): UmbraDesktopPackageSettingsStore | undefined;
  /** Open Desktop settings at a package's screen. False when no desktop is showing. */
  openSettings(packageName: string): boolean;
}

interface UmbraDesktopPackageSettingsStore {
  /** The stored value, parsed from JSON; undefined until read, or when nothing is stored. */
  readonly value: unknown;
  /** 'unread' when the account could not be read, 'unsaved' when the last change could not be stored. */
  readonly status?: 'unread' | 'unsaved';
  /** Whether the stored value has been read. */
  readonly loaded: boolean;
  /** Change the value: applies in the page at once, stored in the background, sent to other tabs. */
  set(value: unknown): void;
  /** Be told about every change, from this page or another tab, and status changes. Returns an unsubscribe. */
  subscribe(listener: (value: unknown) => void): () => void;
}
```

**The store** is Accessories' `AccessoriesSettingsStore` and `UserDataDocument`, made generic over
an `unknown` value and moved into the host. It keeps their rules: a change applies at once and is
written in the background, newest wins, a failed write is kept and reported through `status`, a read
that arrives after a change does not undo it, and a stored change is announced to other tabs over a
`BroadcastChannel`.

- **The key is a user-data group**, the package's own, stored under the identifier `Settings`.
  That is exactly where Accessories keeps its settings today, so it moves onto the store without a
  migration. The desktop's own group is refused (`store` returns undefined and the console says so).
- **The value is opaque.** The host stores JSON and never looks inside. The package checks what it
  reads, because the stored value may come from an older version of itself.
- **Per user only** (§1). Site-wide settings are a package's own API.

**`openSettings`** needs a desktop to open on. The desktop element registers itself with the context
when it connects and unregisters when it disconnects; `openSettings` opens the panel with that
element as the modal's host, so the panel sees the desktop's contexts exactly as when the taskbar
opens it. With no desktop showing it returns false and does nothing. When settings becomes a window
(D7), this is the one place that changes.

Packages reach it with `new UmbContextToken<…>('UmbraDesktop.PackageSettingsContext')` and a
hand-copied interface, as with the manifest types.

## 6. `meta.opensSettings` on `umbraDesktopApp`

An optional package name. When set, `element` is not required, and choosing the tile, from the
launcher, a pin or search, calls `openSettings` with that name instead of opening a window. No
window, so nothing for the taskbar, reopen-windows or `allowMultiple` to do. An app with both
`element` and `opensSettings` opens settings; its `element` is never loaded. The check sits in the
window manager's `open`, which every route to an app (launcher, pin, taskbar button, the AI's open
tool) goes through.

## 7. Limitations

1. **Which package a manifest came from is unknowable in the browser.** Umbraco's server
   registrator drops the package name when it registers extensions, and bundled manifests are
   registered by the bundle's own JavaScript. So `meta.package` is the author's word. Grouping
   (D1) stops accidental extra rows; a package that uses two names gets two rows.
2. **Nothing protects against a hostile package.** Any package's JavaScript can unregister or
   overwrite any extension. The rules here stop mistakes.
3. **A package box cannot go inside our categories** (D3), and its row always sits below ours.
4. **The store is per user.** Site-wide settings are the package's own work.
5. **The desktop's own contexts are reachable from a box but not promised.** Only Umbraco's
   contexts and `UmbraDesktop.PackageSettingsContext` are contract.
6. **A box has to fit a 500px sidebar today, and a resizable window later**: anything from about
   360px wide to full width.
7. **A link inside a box navigates the backoffice away from the desktop** unless it carries
   `data-router-slot="disabled"` (see CLAUDE.md).
8. **Hand-copied types drift.** Same as the existing three manifest types.
9. **Uninstalling leaves the stored settings behind.** Umbraco's user data is not cleaned up per group.
10. **A box should paint like a desktop app.** Today the panel is backoffice-styled; a settings
    window later would be themed like every other window. A box that paints with the app tokens and
    a `uui` fallback for each (`docs/developer/desktop-apps.md` §4) looks right in both, which is
    what the guide asks for. A box styled only with `uui` still works, but would look like the
    backoffice inside a Windows 98 window.

## 7.1 Settings becoming a window later

Checked 2026-10-03 whether settings should become a window before this is built. It need not: the
package contract does not mention the modal. Boxes are content panes with no modal assumptions,
`openSettings` and `openDesktopSettings` are the only ways in, the desktop's contexts reach a box
either way (through the modal's context proxy today, through the element tree in a window), and
the width range already covers a resizable window. What a later move rewrites is host-internal: the
panel element, the package section's rendering in it and their tests. Point 10 above is the one
thing a package has to get right now so it does not have to change then.

## 8. Accessories

- **A screensaver box.** The controls of the Screen Saver window become a box element under
  `meta.package: 'UmbraDesktop Accessories'`, reusing `screensaver-panel.element.ts`'s parts.
- **The store.** `settings.source.ts` keeps its `AccessoriesSettingsSource` interface and
  `fixedSettings` for tests, and its real implementation becomes a thin adapter over
  `store('Umbraco.Community.UmbraDesktop.Accessories')` with `parseSettings` applied to what comes
  back. `AccessoriesSettingsStore` and its tests are what moved to the host. `shared/user-data.ts`
  stays: the personal Sticky Notes board uses it.
- **The Screen Saver tile** keeps its place in the Accessories group with `meta.opensSettings:
  'UmbraDesktop Accessories'`.
- **The version range** needs no edit: Accessories references the host as a project, and the
  `BoundHostRange` target in `src/Directory.Build.targets` packs `[<this release>, …]`, so the
  release that ships this is the floor automatically.

## 9. Alternatives considered

- **Interleave package categories with ours by weight (#103 as written).** Rejected for D2: it
  needed published host weights, a Site-last clamp and a choice of weight scale, and it mixed
  packages' rows in with ours, which is the opposite of making attribution plain.
- **A desktop-level context plus a "runs with the desktop" manifest type.** The screensaver watcher
  would move into it and lose its entry point and its once-a-second address check, and nothing of
  ours would live outside the desktop. Rejected for now as a second new public type with one user;
  worth adding when a second package needs desktop lifetime.
- **No host store.** Packages use Umbraco's user data service directly. Smallest, but every package
  repeats the same glue (D5).
- **Our categories as manifests too.** One code path, but a larger change, and our categories would
  become overwritable through `overwrites`.
- **Publish the settings modal's alias as the deep link.** Rejected for D7.

## 10. Testing

- `normalisePackageSettings`: every drop and report, grouping, sorting, the reserved package name,
  malformed JSON never throwing.
- The settings panel, with an injected registry as `fork/settings-cat` did: the section appears only
  with a package, one row per package, boxes in weight order, conditions, lazy loading, a failed
  box, a deep link that arrives late, a package withdrawn while open.
- The store: Accessories' `settings.source.test.ts` cases, moved and made generic, plus the reserved
  key.
- The context: `openSettings` with and without a desktop registered.
- `opensSettings`: normalisation without `element`, the tile opening settings and no window.
- Accessories: the box, the adapter, the tile.
- Run in a real backoffice (CLAUDE.md): the screensaver set in Desktop settings starts on idle, and a
  value saved by the current Accessories release is read by the new one.

## 11. Definition of done

- `npm run build` and `npm test` in the host and in Accessories.
- Docs: a developer guide page `docs/developer/package-settings.md` (linked from the developer
  README and from `desktop-apps.md`, which also documents `opensSettings`); the user guide's
  `settings/desktop-settings.md` mentions the package section; Accessories' `screen-saver.md`
  says where the settings now are.
- README: no change for the host; Accessories' README at most one line if the screensaver section
  mentions the window.
- Marketplace: no change expected.
- Update #103's text to this design, and note on #104 that Connections registers through it and its
  Status app uses `openSettings`.

## 12. What the build added

Found while building and in the browser run on 2026-10-04. None of it changes a decision above; each
is a rule the code now keeps that the design did not say.

1. **A saved window for an app that now opens settings is not restored.** Reopen-windows restores
   through `restoreWindow`, not `open()`, so §6's "every route goes through `open`" was not quite
   true. Someone who had the Screen Saver window open before upgrading would have got a window
   loading an element that does not exist. The layout restorer skips such a window and drops it
   from the saved layout, and the boot splash does not wait for it.
2. **The desktop must re-attach after a move.** Umbraco's context consumer does not call back when
   an element is moved in the DOM (disconnect and reconnect in one task), so detaching in
   `disconnectedCallback` and attaching only in the consumer callback left a moved desktop off the
   context for good. The desktop keeps the last context and re-attaches in `connectedCallback`.
3. **`store(key)` reads again on every call, not only the first.** Accessories' own store retried a
   failed read each time its window opened, and its "could not be read" hint tells people to close
   settings and open them again. A box asks for its store each time the panel builds it, so calling
   `load()` there keeps that promise; a loaded store makes no request.
4. **A finished first read is announced even when nothing is stored.** Otherwise `loaded` turned
   true silently, and a box waiting on it never re-rendered.
5. **A subscriber that throws is logged and skipped.** Subscribers are other packages' code; one
   throwing used to stop the rest and break the write loop.
6. **Package names are trimmed everywhere they are matched**: `meta.package`, `meta.opensSettings`
   and `openSettings`. Matching stays case-sensitive.
7. **The panel creates its package observer once.** Re-creating it with the same alias on reconnect
   destroys the old one, whose teardown reports an empty list and threw an open package screen back
   to the list. One observer survives a disconnect anyway.
8. **A held deep link is cancelled when the person navigates.** Otherwise a package arriving late
   pulled the panel into it after someone had moved on.
9. **The store's document is Accessories' `UserDataDocument`, ported, not the desktop's own
   repository.** The repository reads its group once and creates a row whenever that cache has
   none, so with two tabs open each could create its own `Settings` row, and a reload then showed
   whichever the server listed first. The document reads again before creating while it knows no
   row, never creates when it could not read, and lets the lowest key win. The desktop's own
   settings had the same hazard, older than this change, and the repository now follows the same
   rules: it reads again before creating when its view is older than the write, reads again after a
   refused update and moves to the row that survived, and keeps the lowest key among duplicates.
   The package store keeps its own document anyway, since it reads one row per key and needs none
   of the repository's group cache or migration ledger.
10. **The heading is "Add-ons", not "From other packages"** (decided 2026-10-04, after the browser
    run). It is the word the docs and README already use for packages that extend the desktop, and
    "packages" on the desktop is also Umbraco's own Packages app. "From" was dropped: the section
    sits below ours and every screen names its add-on, so it is already plain these are not ours.
    The line on each screen says "add-on" to match.
11. **The browser run** (DB copy `UmbraDesktop-Issue103`): a row written through Umbraco's user-data
   API in the released Accessories' exact shape (`JSON.stringify` of the settings, group
   `Umbraco.Community.UmbraDesktop.Accessories`, identifier `Settings`) was read by the new box, so
   no migration. The tile, a pinned taskbar button and `openSettings` all opened the Accessories
   screen with no window; two tabs followed each other; a 1-minute wait set in the box started the
   screensaver after 60 seconds idle; the box fits the 500px sidebar without scrolling.
