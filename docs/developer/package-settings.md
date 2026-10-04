---
id: package-settings
title: Package settings
description: Put your package's settings in Desktop settings, store them per user, and open them from your own screens.
sidebar_position: 5.5
---

# Package settings

> How a package puts its settings in Desktop settings, stores them per user, and opens them from its
> own screens. For why it is shaped this way, see
> [the design](../design/2026-10-03-package-settings-design.md).

---

## 1. When to use it

Use it when your package adds something to the desktop and that something has settings: a tool, a
screen saver, a connection. The desktop gives your package one row in Desktop settings, below the
desktop's own categories, under an **Add-ons** heading. The row's screen holds one box per manifest
you register, and the desktop draws a line above them saying the settings come from your add-on.

Your package always gets one row, however many boxes it registers. You add boxes, not categories,
and nothing goes inside the desktop's own categories: a box among ours could break the layout of
screens we own, and keeping packages apart makes it plain whose settings are whose.

Settings that belong to a backoffice screen of your own, such as a section or a dashboard, stay
there. This is for what you add to the desktop.

## 2. The manifest

From a bundle:

```ts
{
  type: 'umbraDesktopPackageSettings',
  alias: 'My.Package.Settings',
  name: 'My Package settings',
  element: () => import('./settings.element.js'),
  weight: 100,
  meta: {
    package: 'My Package',
    label: '#myPackage_settings',
  },
  conditions: [],
}
```

Or in the `extensions` list of a static `umbraco-package.json`:

```json
{
  "type": "umbraDesktopPackageSettings",
  "alias": "My.Package.Settings",
  "name": "My Package settings",
  "element": "/App_Plugins/My.Package/settings.js",
  "weight": 100,
  "meta": {
    "package": "My Package",
    "label": "#myPackage_settings"
  }
}
```

The module the path points at exports its element class as `element` or `default`, and registers
it, the same as an app's. See [Building a desktop app](desktop-apps.md#3-every-form-of-element-works-and-only-element).

| Field | Required | Notes |
|---|---|---|
| `type` | yes | Always `'umbraDesktopPackageSettings'` |
| `alias` | yes | Unique, namespaced like any Umbraco alias |
| `name` | yes | Required by Umbraco's `ManifestBase`. The desktop does not show it |
| `element` | yes | The box's content. Every form Umbraco accepts. Not `js`, which the desktop does not read |
| `meta.package` | yes | Your package's name as people know it, in plain text, never a localisation key. Every manifest with the same name lands on one row, so spell it the same way in each. It is also the row's name, the screen's heading and what `openSettings` takes. `UmbraDesktop` is refused |
| `meta.label` | yes | The box's heading. A `#` localisation token or a literal |
| `weight` | no | Orders the boxes on your screen, **higher first**, Umbraco's convention. It never orders your row against anything else. Rows are sorted by package name |
| `conditions` | no | Umbraco's own. A box whose conditions are unmet is not drawn, silently, and a package with no boxes left has no row |

There is no icon and no description. Every package row has the same icon, and its second line lists
your box headings.

A box's element is loaded the first time someone opens your screen, not when Desktop settings opens.
While it loads, the box shows a loader. If it fails to load, the box says so and the other boxes are
unaffected.

The desktop's npm package is private, so copy the type into your package's own declaration file, as
[Package catalogues](package-catalogues.md#10-types-for-your-package) explains for the other manifest
types. The Accessories add-on's `umbradesktop-app.d.ts` has all of them.

```ts
import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

interface MetaUmbraDesktopPackageSettings {
  package: string;
  label: string;
}

interface ManifestUmbraDesktopPackageSettings extends ManifestElement<HTMLElement>, ManifestWithDynamicConditions {
  type: 'umbraDesktopPackageSettings';
  meta: MetaUmbraDesktopPackageSettings;
}

declare global {
  interface UmbExtensionManifestMap {
    umbraDesktopPackageSettings: ManifestUmbraDesktopPackageSettings;
  }
}
```

## 3. Your element

Your element is the content of a box. The desktop draws the box and its heading.

- **Fit anything from about 360px wide up to a full window.** Today Desktop settings is a sidebar
  panel.
- **Assume nothing about a modal.** Draw no close or save button and do not consume
  `UMB_MODAL_CONTEXT`. Apply a change when it is made, as every desktop setting does.
- **Paint like a desktop app.** Read the app tokens with a `uui` fallback for each, as
  [Building a desktop app](desktop-apps.md#4-painting-your-app-the-app-tokens) describes. Today the
  panel is styled like the backoffice and the fallbacks are what show. If settings becomes a themed
  window later, the tokens take over, and a box styled only with `uui` would look like the backoffice
  inside a Windows 98 window.
- **Give every link `data-router-slot="disabled"`.** Umbraco's router takes every same-origin link
  click at the window, through shadow roots, and navigates the whole backoffice away from the desktop.
- **Rely only on Umbraco's contexts and the one below.** The desktop's own contexts reach a box today,
  but they are not promised to.

The Accessories screen saver box, `screensaver/screensaver-panel.element.ts` in that add-on, is a
worked example.

## 4. Storing settings

The desktop offers a per-user store, through a global context with the alias
`'UmbraDesktop.PackageSettingsContext'`. You do not have to use it: Umbraco's user data service or an
API of your own work just as well, and site-wide settings need one of those, because the store is per
user.

Copy the shape you use and make a token with the same alias:

```ts
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

interface PackageSettingsStore {
  readonly value: unknown;
  readonly status?: 'unread' | 'unsaved';
  readonly loaded: boolean;
  set(value: unknown): void;
  subscribe(listener: (value: unknown) => void): () => void;
}

interface PackageSettingsContext extends UmbContextMinimal {
  store(key: string): PackageSettingsStore | undefined;
  openSettings(packageName: string): boolean;
}

const PACKAGE_SETTINGS = new UmbContextToken<PackageSettingsContext>('UmbraDesktop.PackageSettingsContext');
```

Then, in your box:

```ts
#store?: PackageSettingsStore;
#unsubscribe?: () => void;

constructor() {
  super();
  // Called again with undefined when the box disconnects, which stops the subscription.
  this.consumeContext(PACKAGE_SETTINGS, (context) => {
    this.#unsubscribe?.();
    this.#store = context?.store('My.Package');
    this.#unsubscribe = this.#store?.subscribe(() => this.requestUpdate());
    this.requestUpdate();
  });
}

override render() {
  // Check what you read: nothing may be stored yet, or an older version of your package wrote it.
  const value = this.#store?.value as { greeting?: unknown } | null | undefined;
  const greeting = typeof value?.greeting === 'string' ? value.greeting : 'Hello';
  return html`
    <uui-input .value=${greeting} @change=${(e: Event) => this.#store?.set({ greeting: (e.target as HTMLInputElement).value })}></uui-input>
    ${this.#store?.status ? html`<p>${this.#store.status === 'unread' ? 'Your saved settings could not be read.' : 'Not saved yet.'}</p>` : ''}
  `;
}
```

| Member | What it does |
|---|---|
| `store(key)` | The signed-in user's settings for `key`, your package's own user-data group, such as `My.Package`. One store per key per page, shared by every caller. Undefined for an empty key or the desktop's own group |
| `value` | The stored value, parsed from JSON. Undefined until it has been read, and when nothing is stored |
| `loaded` | Whether the stored value has been read, so you can tell "nothing stored" from "not read yet". Subscribers are told when the read finishes, even when nothing is stored |
| `status` | `'unread'` when the account could not be read, `'unsaved'` when the last change could not be stored. Undefined when all is well |
| `set(value)` | Changes the value in the page at once and stores it in the background. Anything JSON can keep |
| `subscribe(listener)` | Calls `listener` with the value when the first read finishes, whenever the value changes, in this page or another tab, and whenever `status` changes. Returns a function that stops the calls |

A few rules worth knowing:

- **The value is yours.** The desktop stores JSON and never looks inside, so check what you read.
- **Your settings are stored in your group under the identifier `Settings`.** If your package already
  keeps a per-user setting in Umbraco's user data under that group and identifier, the store reads it
  as it is, with no migration. Accessories moved onto the store this way.
- **A failed read is tried again** each time your screen is shown.
- **The store loads by itself** once a user is signed in. A change made before the read answers is
  kept, and the read does not undo it.
- **A failed write keeps the change in the page** and sets `status` to `'unsaved'`. The next change
  stores the whole value again.
- **A listener that throws** is logged and skipped, and the others are still called.

The context is global, so code outside the desktop element, such as a backoffice entry point, reaches
the same store. The Accessories screen saver's idle watcher reads its settings that way.

## 5. Opening your settings

To open Desktop settings at your package's row from your own screens, call `openSettings` with your
`meta.package` as you wrote it, in the same case:

```ts
const opened = context.openSettings('My Package');
```

It returns false, and does nothing, when no desktop is showing. A name with no row opens Desktop
settings at its list.

To make a launcher tile that opens your settings, give a `umbraDesktopApp` a `meta.opensSettings`
with your package name:

```ts
{
  type: 'umbraDesktopApp',
  alias: 'My.Package.SettingsTile',
  name: 'My Package settings',
  meta: {
    label: '#myPackage_settings',
    icon: 'icon-settings',
    group: 'my-package',
    opensSettings: 'My Package',
  },
}
```

Such an app needs no `element`, and if it has one, it is never loaded. Choosing the tile, from the
launcher or a pin, opens settings and never a window. If an update turns an app that opened a window
into one of these, a window of it that was saved for reopening is not put back. The Accessories
Screen Saver tile works this way. Add `opensSettings?: string;` to your copy of `MetaUmbraDesktopApp`.

## 6. What the console tells you

Every report starts with `[UmbraDesktop]` and names your manifest alias or store key. A manifest that
cannot be used is dropped, and the rest of Desktop settings carries on.

Package settings manifests are checked when Desktop settings opens, and reported once each time it
does:

- `Package settings "<alias>" has no "meta" object, so it was dropped.`
- `Package settings "<alias>" has no usable "meta.package", the package name its row is shown under, so it was dropped.`
- `Package settings "<alias>" names its package "UmbraDesktop", which is the desktop's own, so it was dropped.`
- `Package settings "<alias>" has no usable "meta.label", the heading of its box, so it was dropped.`
- `Package settings "<alias>" has no "element" to load: it points at a module through "js", which the desktop does not read. Rename that field to "element".`
- `Package settings "<alias>" has no "element" to load, so its box would be empty. It was dropped.`
- `Package settings "<alias>" has a "weight" that is not a number, so it was ignored.`
- `Package settings "<alias>" could not be loaded.`, with the error, when the box's module cannot be
  imported. A module that imports but exports no `element` or `default` gets Umbraco's own "did not
  succeed creating an element" error instead. Either way the box shows **This part of the settings
  could not be loaded.**

From the store:

- `Package settings store "<key>" refused: use your package's own user-data group.`
- `A settings subscriber threw (store <key>.Settings).`, with the error.

From a tile with `meta.opensSettings`, printed once the registry has been quiet:

- `Registered app "<alias>": "meta.opensSettings" has the wrong type, so it was ignored.` It must be a
  non-empty string.
- `Registered app "<alias>" was dropped because its manifest has no "element" to load, so its window would open empty.`
  An app with neither `element` nor a usable `meta.opensSettings`.

## 7. Limitations

- **The package name is your word.** The browser cannot tell which package a manifest came from, so
  the desktop groups by `meta.package`. Two spellings of one name make two rows.
- **Nothing protects against a hostile package.** Any package's JavaScript can unregister or
  overwrite any extension. The rules here stop mistakes.
- **No box inside the desktop's own categories**, and your row is always below them.
- **The store is per user.** Settings for the whole site need a server and a permission check, which
  is your package's own API.
- **The desktop's own contexts are not promised to your box.** See [§3](#3-your-element).
- **Your box has to fit** from about 360px wide to a full window. See [§3](#3-your-element).
- **A link needs `data-router-slot="disabled"`.** See [§3](#3-your-element).
- **A box should paint like an app.** See [§3](#3-your-element).
- **Hand-copied types drift.** The desktop's types only ever gain optional fields, so a copy that
  falls behind still describes a valid manifest.
- **Uninstalling leaves the stored settings behind.** Umbraco does not clean up user data per group.
