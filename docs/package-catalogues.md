# Putting your package's screens on the desktop

> How a package gives its own backoffice screens proper tiles, and its own headings in the
> launcher, without a pull request to this repository. For why it is shaped this way, see
> [the design](design/2026-09-25-package-catalogues-design.md).

---

## 1. Is a catalogue what you need?

| You want | Register |
|---|---|
| A tile for a section, dashboard or workspace your package already has | A `umbraDesktopCatalogue` entry |
| A heading of your own in the launcher | A `umbraDesktopCatalogue` group |
| An app that is its own element, with no backoffice route behind it | A `umbraDesktopApp`. See [desktop-apps.md](desktop-apps.md) |
| Your section to appear at all | Nothing: any section a user can reach already shows up under More |

A catalogue is data only. It loads no code, so a static `umbraco-package.json` can carry it as
well as a bundle can.

## 2. The manifest

From a bundle:

```ts
{
  type: 'umbraDesktopCatalogue',
  alias: 'My.Package.DesktopCatalogue',
  name: 'My Package desktop catalogue',
  meta: {
    groups: [{ alias: 'my-package', label: '#myPackage_group', weight: 22 }],
    entries: [
      {
        alias: 'My.Package.DesktopApp',
        ref: 'My.Package.Section',
        icon: 'icon-rocket',
        chromeProfile: 'full-section',
        defaultSize: { w: 1100, h: 760 },
        group: 'my-package',
        weight: 10,
      },
    ],
  },
}
```

Or the same thing in the `extensions` list of a static `umbraco-package.json`:

```json
{
  "type": "umbraDesktopCatalogue",
  "alias": "My.Package.DesktopCatalogue",
  "name": "My Package desktop catalogue",
  "meta": {
    "entries": [
      { "alias": "My.Package.DesktopApp", "ref": "My.Package.Section", "icon": "icon-rocket", "group": "development", "weight": 30 }
    ]
  }
}
```

One manifest per package, holding any number of groups and entries. Register a second one only if
some of your tiles need conditions the others do not (§8).

## 3. Entries

An entry has the same fields as the desktop's own catalogue entries, with the same meaning, and is
resolved by the same code.

| Field | Notes |
|---|---|
| `alias` | Required. The app's id and the key a pin is stored under, so keep it stable. Namespace it like any Umbraco alias. Reusing one of the desktop's aliases replaces that entry (§5) |
| `ref` | The alias of a registered `section`, a `dashboard` with a pathname, or a default-kind `menuItem` with an entity type. The URL is worked out from it, and the tile only appears where that extension is registered |
| `url` | For what `ref` cannot reach. Must be a backoffice path under `/umbraco/section/` on the same site; anything else is refused. Not existence-checked, so prefer `ref` wherever it works |
| `section` | The permission gate. Required with a menu-item `ref` or a `url` |
| `name`, `icon` | Default to the referenced extension's label and icon. Icons are native `icon-*` aliases |
| `chromeProfile` | `full-section` (the default) keeps the section's sidebar, `workspace-only` hides it, `bare` also hides a dashboard's tab strip. Anything else is ignored |
| `defaultSize`, `minSize` | The window body's size in px. The desktop adds the theme's chrome |
| `allowMultiple`, `resizable` | Whether a second window may open, and whether the window may be resized or maximized |
| `group`, `weight` | Which group the tile sits in, and its place there, lower first |
| `evaluateConditions` | Conditions on the referenced extension to answer before showing the tile. Only ones that do not depend on where the extension is mounted |

An entry whose `ref` is a section also stops that section's generic tile from appearing under More,
and users who had pinned that tile keep their pin: it moves to your entry.

Two things are refused outright: an alias starting with `section:`, which the desktop keeps for
those generic tiles, and any entry that would open the desktop's own section, since the window
would hold a desktop inside a desktop.

## 4. Groups

A group is `alias`, `label` and `weight`. Use a label token from your own dictionary. The weight
places your group among the desktop's, which are fixed so you can rely on them:

| Group | Weight |
|---|---|
| Editing | 10 |
| Workflow | 12 |
| Marketing and sales | 15 |
| Development | 20 |
| Synchronisation | 25 |
| Security | 30 |
| Advanced security | 35 |
| Diagnostics | 40 |
| Automation | 43 |
| AI | 45 |
| System | 50 |
| Experimental | 70 |
| More, always last | 9999 |

Accessories, from the Accessories add-on, sits at 55, and Games, from the Entertainment add-on, at
60. A group without a weight sorts before Editing, so always give one. An entry naming a group nobody defines lands under More.

## 5. Replacing one of the desktop's tiles

If the desktop already has a tile for your screens, give your entry the same alias and yours is used
instead. That is the intended way for a package to take over its own tiles: your release ships in
step with your screens, and ours does not. Pins stay, because they are stored under the alias.

The desktop's own aliases are the `alias` values in `backoffice/src/desktop/catalogue/`, and they are
published: none will be renamed, because pins depend on them and so does any package that replaces
one. Under an alias of your own, your tile shows beside ours instead, and the console says so.

Replacement is whole. Anything you leave out is gone, so start from the desktop's own entry in
`backoffice/src/desktop/catalogue/` and change what you need, rather than from a blank one.

A replacement that opens the same screen is silent. One that opens something else prints a line,
and so does a group redefined with a different weight: those are what an accident looks like. Do not
redefine a group you did not create.

`copilot-workspace` is one the desktop relies on: its taskbar chat button opens it and assumes one
window. Keep `allowMultiple: false` if you replace it.

## 6. When two packages disagree

If two packages define the same alias, the one whose manifest has the higher `weight` is used, then
the one whose manifest alias sorts first. The console names both. Two definitions that agree, the
same screen for an entry or the same weight for a group, are not reported.

## 7. Two weight scales

Everything inside `meta` sorts **lower first**, like the desktop's own catalogue, because your
numbers have to sit among ours. The manifest's own root `weight` is Umbraco's, **higher first**, and
only matters when two packages clash. A weight of 1000 or more inside `meta` is almost always the two
mixed up, and the console says so.

## 8. Conditions

`conditions` on the manifest switch the whole catalogue on or off. While they are unmet, the desktop
behaves as if your package had no catalogue, so the desktop's own tiles for your screens, if it has
any, come back.

A condition that depends on where an extension is mounted, `Umb.Condition.SectionAlias` for
instance, is answered on the desktop, where it never passes. Keep those off the catalogue manifest.

For a single tile, `evaluateConditions` reuses the conditions already on the screen it opens. If that
is not enough, register a second catalogue manifest for the gated tiles. An entry has no
`conditions` of its own: one sent anyway is ignored, and the console says so, because a tile shown
ungated by mistake is the wrong way round to fail.

## 9. What the console tells you

Every problem is one `[UmbraDesktop]` warning, printed once the registry has been quiet for five
seconds and naming your manifest. Nothing you send can break the launcher: a field with the wrong
type is ignored, an item that cannot be used is dropped, and the console says which.

## 10. Types for your package

The desktop's npm package is private, so copy the declaration. The Entertainment add-on's
`umbradesktop-app.d.ts` is a complete one to start from. The desktop promises that these types only
ever gain optional fields, so a copy that falls behind still describes a valid manifest.

## 11. Checklist

- [ ] Every entry alias is namespaced, or deliberately one of the desktop's.
- [ ] Every group has a weight, and a label from your own dictionary.
- [ ] `ref` wherever it can work out the URL; `url` only under `/umbraco/section/`.
- [ ] Each replacement starts from the entry it replaces.
- [ ] The tile opens in a window with the chrome profile you chose, under all five themes.
- [ ] The console has no `[UmbraDesktop]` lines about your manifest.
