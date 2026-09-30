# A launcher you arrange yourself: design

> The launcher stays what it is today until you change it, except that a pinned app now sits in
> Pinned only. Drag a tile to move it, drop it on Pinned to pin it, drop it on the remove pane to
> take it off. Arrange mode does the rest: groups, the apps you took off, and a button for
> everything a drag can do except reordering, which the arrow keys cover. New apps always turn up by
> themselves. All apps is the alphabetical list of everything.

- **Status:** Implemented 2026-09-27; checked in a real browser, owner review of the arrange-mode
  screenshot still pending
- **Date:** 2026-09-27
- **Branch:** `claude/umbraco-issue-59-plan-a37b58`
- **Issue:** [#59](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/59). This
  design departs from the issue text in several places, listed in §2.1
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`, release 17.3.0
- **Mockups:** [`mockups/launcher-layout-model.html`](./mockups/launcher-layout-model.html),
  [`mockups/launcher-layout-drag.html`](./mockups/launcher-layout-drag.html),
  [`mockups/launcher-layout-arrange.html`](./mockups/launcher-layout-arrange.html)

---

## 1. Goal & scope

Three things are wrong with the launcher, and the issue describes them well. Pinning is a hover badge
over the corner of the tile you are aiming at, so unpinning by accident is normal. Favourites cannot
be reordered. Nothing can be taken off, so an administrator scans past Profiling on every open.

The issue's answer was a layout the user owns and builds from a trimmed seed. Working through it
showed two problems with that. A layout you build by hand defeats the point once packages bring their
own catalogues (#85): every package install would mean arranging again. And a launcher that changes
on upgrade and asks the user to curate it is more than an average editor wants.

So the launcher stays built from the catalogue, and only the user's changes are stored.

**In scope:**

- Drag to move, pin and remove apps in normal mode.
- Pinned as a place: an app is pinned *instead of* sitting in its group.
- An All apps drawer, alphabetical and filterable.
- Arrange mode: groups (reorder, rename, delete, create), a palette of what is not on the launcher,
  Reset, and a visible button for every drag except reordering tiles within a group, which takes
  the arrow keys (D7).
- New theme tokens and values for all five themes.

**Out of scope:**

- Trimming the default launcher. Every app stays on it until the user takes it off. Role presets in
  the wizard issue can trim later, and this model gives them somewhere to write.
- Right-click menus, anywhere. See D7.
- A phone layout. The launcher has to work on a decent tablet and in the three narrow themes, and
  nothing is optimised for a phone, since the backoffice does not work on one.

## 2. Settled decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **The default launcher is today's launcher.** No stored layout means the catalogue grouping, with every app. | Nothing changes for anyone who never arranges, with one exception: pinned apps leave their groups on upgrade, since an app now has one place (accepted, see D4). By default that is Content editor, Media library and Log Viewer. No opt-out flags, no trimmed seed. |
| D2 | **Only the user's changes are stored**, as groups plus a list of removed apps and deleted groups. The view is rebuilt from the catalogue every time. | A package install must never need a manual step. Storing changes rather than a whole arrangement is what lets new apps keep arriving. |
| D3 | **New apps always go to their catalogue group**, before and after the user arranges. The one exception is a group the user deleted: its new apps wait in the palette. | Installing a package visibly does something, forever, not just until the first arrange. |
| D4 | **Pinned is a place.** An app is either pinned or in a group, never both. | Each app has one spot on the launcher, and All apps is the complete list. That is the iOS home screen model. Copy semantics, as in Windows Start, are where "which one do I edit" comes from. |
| D5 | **`pinned` keeps its shape and meaning**, and is the Pinned place. Pinned is fixed: it cannot be renamed, moved or deleted. | The taskbar's pinned apps feature (#53) reads the same list and needs no change. |
| D6 | **Drag works in normal mode**, for apps only: move, pin, remove. | A drag cannot happen by accident: it needs movement past a threshold, and removing needs a drop on a pane that only appears during a drag. |
| D7 | **No right-click.** Every non-drag path is a visible control in arrange mode: removing, moving to another group or to Pinned, adding back, moving a group and the other group edits are buttons; reordering tiles within a group is by drag or the arrow keys. | Umbraco has no right-click anywhere, it is too advanced for the average user, and it makes touch harder. |
| D8 | **All apps is alphabetical**, with a filter. No grouping, no toggle. | The launcher is already the grouped view. Alphabetical gives the drawer its own job: finding something by name. |
| D9 | **The palette holds only what is not on the launcher**, grouped by catalogue group, with Add, Add all and Add group. | Adding a whole category is one click. On an untouched launcher the palette is empty. |
| D10 | **Reset restores the groups and leaves pins alone.** | A button in the launcher should not rearrange the taskbar. |
| D11 | **Deleting a group needs no confirm.** Its apps go to the palette. | Nothing is lost that one click cannot bring back. Reset is the only thing that asks, in a modal (D15). |
| D12 | **Arrange mode follows the panel's width** through a container query: side by side when wide enough, the palette as its own view when not. | Windows 98's and Umbraco 4's launchers are 450px, and widen while arranging (§6.2). The work has to fit a decent tablet too. |
| D13 | **Drag is hand-rolled on pointer events**, not `UmbSorterController`. | The sorter uses native HTML5 drag and drop, which has no keyboard path and does not fire under touch emulation. |
| D14 | **`UmbraDesktopSettings` stays at `v: 1`** and gains an optional `layout`. | `parseSettings` resets everything for an unknown version. An unknown optional field costs nothing. |
| D15 | **Reset asks in a modal**, which the taskbar opens for the launcher and holds the launcher open under. Changed at the owner's review, 2026-09-29. | The first build asked inline, swapping the banner's buttons for two others in nearly the same place, and it read as the Reset button having moved rather than as a question. The taskbar owns the modal for the reason §7 gives. |
| D16 | **Arrange mode stays open until Done**, against an outside press and against focus going into a window. **Escape steps back** a level (All apps or arrange mode to the launcher) before it closes. **The launcher never closes because the browser lost focus** to another program. Owner's review, 2026-09-29. | A missed click in arrange mode threw the user out of it, and switching to another program and back closed the launcher every time. Nothing was lost either way, since every edit is stored as it happens, so there is no "leave arrange mode?" question: the fix is not being thrown out. |

### 2.1 Where this departs from the issue

- **No trim, no opt-out flag, no nineteen-entry list.** D1 makes them unnecessary, and the open
  question in the issue comment goes with them.
- **No new-apps badge and no customised flag.** D3 makes new apps visible by placing them, before
  and after arranging, so there is nothing to count and nothing to switch off.
- **Pinned is a place, not a hero beside the groups.** D4. The taskbar contract the issue protected
  is kept (D5).
- **Drag works outside arrange mode.** D6. Arrange mode is still where groups are edited and where
  the non-drag paths are (D7).
- **Deleting a group asks nothing.** D11.
- **Unchanged from the issue:** tiles only launch in normal mode, All apps is a header control that
  swaps the body, labels resolve by id so seeded names stay translated, `pinned` is untouched,
  nothing migrates, and the launcher itself opens no modal (Reset's confirm is the taskbar's, D15).

## 3. What it looks like

The mockups are static snapshots from the brainstorm. `launcher-layout-model.html` shows the drawer
and the palette; its normal-mode view predates D4 and still shows pinned apps in their groups.
`launcher-layout-drag.html` shows D4 and dragging. `launcher-layout-arrange.html` shows arrange mode
with every button.

### 3.1 Normal mode

- **Header row:** Search, then **All apps**, then **Arrange**.
- **Pinned** first, when it holds anything, then the groups.
- A tile launches its app on click, and does nothing else. No badge, no hover control.
- **Dragging a tile** (§5):
  - onto another tile places it before or after that tile, by which half the pointer is over;
  - onto a group's empty area appends it to that group;
  - onto **Pinned** pins it there. Pinned appears as a drop target during a drag even when empty:
    an empty Pinned is drawn over the header row, with a "Drop here to pin" hint;
  - onto the **remove pane** takes it off the launcher. The pane covers the footer while a drag
    lasts, and says the app stays in All apps.
  - Neither target moves anything when it appears. Each takes over the box of a row a drag has no
    use for, which stays in the layout underneath, hidden. Measured in the backoffice: an empty
    Pinned drawn in the flow pushed the groups 70 to 90px down under the pointer at the start of a
    drag, and a pane taller than the footer grew the panel. Laying Pinned over the top of the body
    instead covered the first group's tiles, so a drop meant for them pinned.
- **Empty state:** nothing pinned and no group with a visible app. The body says so and offers
  Arrange and All apps.

### 3.2 All apps

- Swaps the panel body. **Back** returns.
- The filter field takes focus. Apps are sorted by their localised name with the backoffice culture,
  under letter headings. The filter matches anywhere in the localised name.
- Every app the user may open, pinned or not, on the launcher or not.
- A tile launches. Nothing drags here.

### 3.3 Arrange mode

- A **banner** replaces the header row: "Arranging your launcher", **Reset to default**, **Done**.
- **Reset** asks in a modal (D15). Nothing else asks (D11).
- Every edit is saved as it happens. **Done** only leaves the mode, and so do Escape and the start
  button. A press outside the launcher does not (D16).
- Tiles do not launch.
- **Layout pane:**
  - **Pinned**, marked as fixed, as a drop target.
  - Each group: a **handle**, a **rename** field, a **delete** button and **⋯**, an inline list that
    moves the group to the start, one place earlier, one place later or to the end (only the moves
    that change something) and deletes it.
  - Each tile: **remove** and **⋯** (Move to). Move to is an inline list inside the panel:
    Pinned, every other group, New group, Remove. Remove is the same trash icon as a group's delete
    and the remove pane, since all three take something off the launcher.
  - **New group** at the end. It creates a group and focuses its rename field.
- **Palette:** "Not on your launcher", a filter, the missing apps grouped by catalogue group.
  Each category offers **Add group** when that group is not on the launcher, **Add all** when it
  is. Each app offers **+**.
- **Drag:** tiles and groups by handle within the layout, palette items into the layout, and a tile
  onto the palette to remove it.
- **Keyboard:** arrow keys move a focused tile within its group and a focused group handle among the
  groups. Esc closes an open list and returns focus to its button; otherwise it leaves arrange mode.
- **What has a button and what does not:** removing, moving to another group or to Pinned, adding
  back, moving a group and the other group edits all have buttons. Reordering tiles within a group
  does not: a tile moves within its group by drag or by the arrow keys. §12 has the open question
  this leaves for touch.
- **Narrow panel** (D12): the palette becomes its own view behind an **Add apps** button in the
  banner, and the + / Add all / Add group buttons do the adding.

## 4. The model

### 4.1 What is stored

```ts
interface UmbraDesktopLauncherLayout {
  /** The user's groups, in their order. */
  groups: UmbraDesktopLauncherLayoutGroup[];
  /** Apps the user took off the launcher. */
  removed: string[];
  /** Catalogue groups the user deleted. */
  deletedGroups: string[];
}

interface UmbraDesktopLauncherLayoutGroup {
  /** A catalogue group alias, or `custom-<random>` for a group the user created. */
  id: string;
  /** `null`: resolve the id's label (§4.4). A string: the user's own text. */
  label: string | null;
  /** App aliases in the user's order. Never pruned. */
  apps: string[];
}

// UmbraDesktopSettings gains:
layout?: UmbraDesktopLauncherLayout;
```

- **Absent** means never arranged. The first edit stores one; Reset deletes it.
- `pinned` is unchanged and is the Pinned place.
- Stored aliases are **never pruned**, so an app the user cannot open right now comes back in the
  same spot when they can.

### 4.2 Building the view

One pure function, `resolveLauncher(apps, catalogueGroups, pinned, layout)`, returns the pinned apps,
the display groups and the palette. `apps` is what the catalogue context publishes, so permissions
are already applied (see `app-catalogue.context.ts`; add no permission logic here).

1. **Pinned** is `resolvePinned(apps, pinned)`, unchanged. A pinned app is left out of every group.
2. **No layout:** the groups are `groupApps` over every app that is not pinned. That is today's
   launcher.
3. **With a layout:** each stored group lists its resolvable apps in stored order. An alias with no
   app is skipped and kept. An app listed twice counts at its first occurrence.
4. **Unplaced apps**, meaning not pinned, not in any group and not removed, are new installs, newly
   granted permissions and apps just unpinned. Each is appended to its catalogue group (More when it
   has none or an unknown one):
   - if that group is in the layout, at its end;
   - if it is not, and is not in `deletedGroups`, as a **new group**, inserted directly after the
     nearest catalogue group before it (by catalogue weight) that the layout holds, or first if
     there is none;
   - if it is in `deletedGroups`, not at all: it waits in the palette.
5. **Aliases resolve like pins** (design D15 of the package catalogues design): a stored
   `section:<alias>` that no longer has an app finds the app that now covers that section.
   `coveringApp` in `settings/pinned.ts` becomes an exported `resolveAppAlias`, shared by both.
6. **Empty groups** draw no card in normal mode, and do draw in arrange mode as drop targets.
7. **The palette** is every app not shown, grouped by catalogue group in catalogue order.

### 4.3 Edits

Every edit is a pure function in `launcher/layout-edits.ts` over the **effective layout**: the stored
layout, or the §4.2 step 2 view when there is none, with step 4's placements written in. So what the
user sees is what gets saved, and aliases they cannot open keep their positions.

Positions are **"before alias X" or "at the end"**, never an index, because an index counts
differently once hidden aliases are interleaved.

| Edit | Effect |
| --- | --- |
| Move app | Out of wherever it is, into a group before an alias or at the end. Out of `pinned` if it was pinned, out of `removed`. |
| Pin app | Into `pinned` before an alias or at the end; out of its group and out of `removed`. Uses `pinKeysFor`, so a pin held under a section's fallback alias is found. |
| Remove app | Into `removed`; out of its group and out of `pinned`. |
| Add app | Out of `removed`, into its catalogue group at the end. The group is created by the step 4 rule, and leaves `deletedGroups`, if it is missing. |
| Add group | The catalogue group back by the step 4 rule, holding every palette app of that group; out of `deletedGroups`; its apps out of `removed`. |
| Delete group | Its apps into `removed`. A catalogue group's id into `deletedGroups`. |
| Create group | `custom-<random>`, literal label, at the end. |
| Rename group | Literal label. Clearing a catalogue group's name sets it back to `null`, so the translation returns. A custom group cannot be cleared. |
| Move group | Before a group id or at the end. |
| Reset | `layout` deleted. `pinned` untouched. |

**A layout is stored only when an edit changes the groups, `removed` or `deletedGroups`.** On an unarranged
launcher, pinning an app and reordering Pinned change `pinned` alone, since a pinned app is left out
of the groups anyway. Storing a layout for a pin would freeze the catalogue order for that user,
so a later release's regrouping would never reach them. Once a layout is stored, that is the trade
the user has made, and Reset undoes it.

An edit that changes both `pinned` and `layout` is **one** settings write. The launcher computes the
effective layout (it has the catalogue), applies the edit, and hands both results to one new settings
context method, `setLauncherArrangement(pinned, layout)`. There is no separate `resetLayout()` on the
settings context: Reset is `setLauncherArrangement(pinned, undefined)`, the same method every other
edit uses. The pure `resetLayout` that the table's Reset row describes lives in `layout-edits.ts`
instead, and only returns the arrangement the launcher should hand to that call. The settings
context stays ignorant of the catalogue.

### 4.4 Labels

A `null` label resolves through `launcher/group-labels.ts`: a lookup from group id to label built from
the **merged** catalogue groups, so package groups such as Entertainment's Games are included, plus
the reserved More group. The catalogue context gains a `catalogueGroups` observable for this. Its
`groups` observable, which held only the groups with apps, is gone: the launcher groups the apps
itself now, and nothing else read it. A `null` label on an id nobody knows any more shows the
id. That only happens when a package's group is gone and the user had moved other apps into it.

The lookup is a registry rather than a read of `catalogue/groups.ts` so the role presets can add
groups that are not catalogue groups and still have translated names.

### 4.5 Parsing

`parseSettings` gains `readLayout`, which recovers on its own like `readLocale`:

- Not an object, or `groups` not an array: **absent**. The worst case is today's launcher; wallpaper,
  theme and pins are never lost with it.
- A group without a non-empty string `id`, or with a label that is neither string nor `null`, is
  dropped. A repeated id keeps its first occurrence.
- Non-strings are filtered out of `apps`, `removed` and `deletedGroups`. A missing list is empty.

### 4.6 Edges accepted on purpose

Found in review of the model, and left as they are:

- **Adding one app back to a deleted group also brings that group's new arrivals.** Adding an app
  un-deletes its group, and from then on D3 applies: apps of that group nobody has placed or removed
  land in it. Apps the user removed with the group stay in the palette.
- **Delete then Add group is not a perfect inverse for aliases the user cannot open.** A hidden
  alias from a deleted group goes to `removed`, and Add group cannot bring it back because its group
  cannot be known while it has no app behind it. It waits in the palette when access returns.
- **A package group deleted while its package is uninstalled is not remembered as deleted.** At that
  moment it is not a catalogue group, so when the package returns its apps rebuild the group. Rare
  enough not to carry a second list for.

## 5. Drag

- **Pointer events**, with `setPointerCapture` on the dragged element, the same approach as the
  window drag in `components/window.element.ts`, which was hand-rolled for the same reason a
  library lost there: capture is what keeps a drag alive across everything under it. Capture also keeps the
  taskbar's outside-pointerdown dismissal from seeing the drag.
- **Starting:** mouse and pen after 4px of movement, so a click still launches. Touch after a 400ms
  long press without movement, so a swipe still scrolls the panel.
- **Touch is the risk.** Once a long press has started a drag, the browser still wants to pan, so the
  controller has to prevent the touch move itself. This is proven under Chrome's touch emulation
  first, before the rest of the drag is built on it.
- **While dragging:** the tile's icon follows the pointer, beside it rather than under it (above a
  finger), the source spot shows faded with the move cursor, an insertion bar shows where it lands,
  and the body scrolls near its top and bottom edges. A group being dragged shows a bar along the
  edge of the card it would land before or after, rather than lighting that card up, which is what
  an app going *into* a group gets. The first build dragged a copy of the whole tile, which covered
  the insertion bar the user was aiming with (owner's review, 2026-09-29). Groups
  emptied mid-drag keep their card until the drag ends, so the layout does not jump.
- **Esc** cancels. A drop anywhere that is not a target cancels.
- The thresholds and scroll band are named constants beside the controller.

## 6. Themes and geometry

**Themes are visual interpretations, not faithful copies** of the systems they are named after. If
arrange mode or the drawer works better with a different layout in one theme, that is worth raising
and deciding, not ruling out. Windows 98 widening in arrange mode is the likely first case if its
narrow view turns out cramped.

The rule from `CLAUDE.md` still holds: a theme may restyle every new part and may remove none.

### 6.1 Tokens

New, each defaulting to the launcher's existing tokens so a theme that sets nothing still looks
coherent:

| Part | Tokens |
| --- | --- |
| All apps and Arrange controls, rest / hover / active | `launcher-control-background`, `launcher-control-border`, `launcher-control-text`, `launcher-control-active-background` |
| Drawer letter headings | `launcher-letter-text`, `launcher-letter-border` |
| Arrange banner | `launcher-banner-background`, `launcher-banner-border`, `launcher-banner-text` |
| Palette divider | `launcher-divider` |
| Drop target and insertion slot | `launcher-drop-background`, `launcher-drop-outline` |
| Drag ghost | `launcher-ghost-shadow` |
| Remove pane | `launcher-remove-background`, `launcher-remove-border`, `launcher-remove-text` |
| Group handle and other quiet text | `launcher-text-muted` |

All prefixed `--umbradesktop-`. Reused rather than duplicated: the drawer filter and the rename field
use the search field's tokens, the remove and ⋯ buttons use the control tokens, and the Move to list uses
the panel's background and shadow with the card border. The panel background rather than the card
one, because Windows 11 and macOS make cards transparent or nearly so, and a list drawn over tiles
has to be opaque enough to read.

**Removed:** `--umbradesktop-launcher-pin-hover-background`, and the `.pin` rules in Umbraco 4,
Windows 11 and Windows 98. That is the misclick target going, not an affordance: pinning is drag and
Move to in every theme.

### 6.2 Per theme

- **Umbraco:** the defaults.
- **macOS:** a full-screen launcher, so arrange mode is always side by side. All apps, Arrange and
  Back are drawn as the search pill's siblings (its height, round ends, frost and edge), because
  macOS has no All apps button to imitate: Launchpad was one grid with a search field, and Tahoe's
  Apps view that replaced it switches between by category and by name. Beside the pill, the base's
  small rounded rectangles looked like controls from another system (owner's review, 2026-09-29).
- **Windows 11:** measures 640px. That is above `UMBRADESKTOP_LAUNCHER_SPLIT_MIN` (584px: the
  260px card-column floor, plus the palette's 300px, plus 12px of body padding on each side), so
  Windows 11's arrange mode sits side by side rather than stacking.
- **Windows 98, Umbraco 4:** the launcher is a single column of menu rows, and in arrange mode the
  rows carry remove and ⋯ at their end. Both panels widen in arrange mode, through
  `--umbradesktop-launcher-arrange-width`, to their own width plus the palette's (never short of
  the split): 750px for both, measured. The first build left them at 224px and 320px with the
  palette behind Add apps, and switching between the two views to move things across was the one
  part of arranging that did not work. Both launchers are also 450px now rather than 224px and
  320px: the search field shares the top row with All apps and Arrange, and its placeholder wrapped
  onto five lines and two. A placeholder short of room anywhere now ends in an ellipsis instead of
  wrapping (owner's review, 2026-09-29).

### 6.3 Geometry

- `UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH` and `UMBRADESKTOP_LAUNCHER_SPLIT_MIN` live beside the
  launcher, in `launcher/geometry.ts`. The breakpoint is derived: palette width plus one 260px card
  column plus the body's padding on each side. There is no gap term, because the split has no gap:
  the palette sits against the layout pane behind a divider.
- The container query and the tests read the constants. Then it is measured in a browser under all
  five themes at 1920px and at a 768px tablet viewport, per `docs/developer/theming.md` §4.

## 7. Components

| File | What |
| --- | --- |
| `settings/types.ts` | `UmbraDesktopLauncherLayout`, `layout?` on the settings |
| `settings/settings-store.ts` | `readLayout` |
| `settings/settings.context.ts` | `layout` observable, `setLauncherArrangement` (Reset calls it with `undefined`) |
| `settings/pinned.ts` | `resolveAppAlias` exported; pinned insert and remove helpers |
| `app-catalogue.context.ts` | `catalogueGroups` observable, in place of `groups` |
| `launcher/resolve-launcher.ts` | §4.2 |
| `launcher/layout-edits.ts` | §4.3 |
| `launcher/group-labels.ts` | §4.4 |
| `launcher/alphabet.ts` | drawer sort and letter headings |
| `launcher/geometry.ts` | §6.3 constants |
| `launcher/drop-target.ts` | what a drag is over, and what dropping it there does |
| `launcher/apply-drop.ts` | turns a finished drag into a `layout-edits.ts` call |
| `launcher/tile-drag.controller.ts` | §5 |
| `launcher/drag-scroller.ts` | which element a drag scrolls near its edges, per mode and per theme |
| `launcher/drawer.controller.ts` | §3.2, rendered into the launcher's own shadow root |
| `launcher/arrange.controller.ts` | §3.3: banner, layout editor, palette, Move to; also into the launcher's shadow root |
| `components/launcher.element.ts` | the shell: header, modes, footer, remove pane, drop targets |
| `localization/en.ts`, `nl.ts` | new terms |
| `theme/types.ts`, `theme/themes/*` | §6 |

The drawer and arrange mode are controllers rather than elements of their own, which is a change
from how this table first read them. `UmbraDesktopThemeStyles` adopts a theme's `launcher` sheet
into `<umbradesktop-launcher>`'s own shadow root, so anything a *child* element rendered into its
own shadow root would sit outside every theme's reach, and adopting the same sheet into that child
would apply its `:host` rules (Windows 98's bevel padding, among others) a second time. A controller
that renders into the launcher's existing shadow root has neither problem, it gives the drag one
shadow root to hit-test rather than three, and it keeps `tokens.test.ts` scanning a single element.

The launcher still opens no modal. Move to, a group's list and the rename field are inline, and
Reset's confirm is a `confirm` event the taskbar answers from a modal it owns (D15).

## 8. Tests, written first

The cases most likely to be wrong and least likely to be noticed:

- An alias the user cannot open survives an edit and a save, and returns in its old position.
- A new app lands at the end of its catalogue group, with no layout and with one.
- A new package group appears at its catalogue position among the user's groups.
- A deleted group's new apps go to the palette and do not bring the group back.
- Unpinning an app with no other place returns it to its catalogue group.
- Pinning takes an app out of its group, and a pin under a section's fallback alias is found.
- Reset deletes the layout and keeps `pinned`.
- A `section:` alias in a group follows its section to the covering app.
- A malformed `layout` reads as absent and costs no other field.
- Clearing a catalogue group's name restores the translation.

Plus element tests for each mode and each drop target with the existing pointer helpers, a touch drag
under emulation, the tokens test scanning every new launcher element, and each theme's launcher test
asserting that the All apps control, the Arrange control and the arrange-mode buttons render and are
visible. Run both `npm run build` and `npm test`.

## 9. Considered and dropped

- **A trimmed seed with an opt-out flag per entry** (the issue). Every package install would need a
  manual arrange once the user had one, and every existing user's launcher would shrink on upgrade.
- **A new-apps badge and a customised flag** (the issue). Unnecessary once new apps are always
  placed.
- **Pinned as a copy beside the groups** (the issue, and Windows Start). Two places for one app.
- **A right-click menu** as the non-drag path. D7.
- **A grouped All apps, or a grouping toggle.** D8.
- **`UmbSorterController`.** D13.
- **Arrange mode at a fixed wide width in every theme.** Turns a 224px start menu into a 1180px
  dialog and does nothing for a tablet.

## 10. Build order

One branch, one PR, ordered so the launcher stays usable at each step:

1. The model: types, parser, labels, resolver, edits, shared alias resolver, `catalogueGroups`.
2. Normal mode on the model; pinned apps leave their groups. The pin badge stays for now.
3. All apps.
4. Drag in normal mode, the remove pane and the Pinned target, starting with the touch spike. The
   pin badge and its token go.
5. Arrange mode, including the container query.
6. Themes: token values, the Windows 98 and Umbraco 4 menu-row arrange styling, measuring.

## 11. Definition of done

- [x] `npm run build` and `npm test` pass.
- [x] **README:** the Features list and every other place the launcher is described, plus a new
      "Arranging the launcher" section.
- [x] **Marketplace JSON:** tags for a customisable launcher and drag and drop. `Description` is
      unchanged.
- [ ] **Marketplace screenshot:** an arrange-mode capture in `docs/screenshots/`, added to
      `Screenshots`. Left for the owner to take, since they review the look first.
- [x] **Docs:** `docs/developer/theming.md` lists the new tokens and how arrange mode behaves in a narrow
      theme.
- [x] **`docs/design/`:** this file.
- [x] **Not applicable:** `umbraco-package.json`, unchanged as expected.
- [ ] **Release notes:** say that an older build drops `layout` on its next settings write. It does
      not know the field, so going back a version and changing any setting loses the arrangement;
      the pins survive, since every build knows them. Acceptable under D14, but worth one line so a
      rollback does not read as data loss nobody mentioned.

## 12. Open questions

- Whether the touch drag works as planned under emulation (§5). If it cannot be made reliable,
  touch falls back to arrange mode's buttons, which cover every drag except reordering within a
  group and moving a group; those are drag or the arrow keys only (§3.3).
- For the owner: whether reordering tiles within a group needs buttons of its own for touch where a
  long press does not start a drag, since a touchscreen has no arrow keys. Groups got theirs, in
  their ⋯ list, at the 2026-09-29 review; tiles are still drag or arrow keys.
- Windows 11 measures above the breakpoint (§6.2). Windows 98 and Umbraco 4 were too narrow for the
  palette beside the layout and now widen in arrange mode instead (§6.2).
- A comment on issue #59 pointing at this document, since the issue text no longer matches.

## 13. Notes from the build

- **`tsconfig.json`'s `lib` is `ES2020`.** No `Array.prototype.at`, so a "last item" reach has to be
  `arr[arr.length - 1]` rather than `arr.at(-1)`. `npm test` transpiles through esbuild and does not
  check this, so a stray `.at(-1)` only shows up in `npm run build`.
- **`expect(element).to.equal(null)` can hang web-test-runner.** Chai tries to serialise the element
  for its failure message, and serialising a Lit element with a live shadow root is what stalls.
  Assert a count instead (`expect(root.querySelectorAll('.tile')).to.have.lengthOf(0)`), which never
  needs to describe the element to fail usefully.
- **open-wc's `fixture` can stall in a background tab.** web-test-runner spreads a full run across
  several tabs, and a tab that is not the foreground one does not always get frames to finish
  mounting a fixture in. Mounting by hand, appending the element and calling `updateComplete`
  directly, sidesteps whatever `fixture` is waiting on.
- **`npm test` timed out at its default concurrency on this machine.** `npm test -- --concurrency 2`
  ran the same suite reliably. Worth knowing before assuming a red run means broken code.
- **Sub-UI still renders inside the launcher's own shadow root.** Since the drawer and arrange mode
  are controllers rather than elements (§7), a theme's `launcher` sheet reaches everything they
  render without any extra adoption step; that is the reason for building them as controllers, not a
  side effect of it.
- **A `position: fixed` element inside a panel with `backdrop-filter` is positioned against the
  panel, not the viewport.** `backdrop-filter` makes the panel a containing block for anything fixed
  inside it, so the drag ghost would slide only within the launcher's own box, sized and clipped by
  it, rather than following the pointer across the desktop. Putting the ghost in the top layer as a
  manual popover (`popover="manual"`) escapes that: the top layer sits above every containing block,
  so `position: fixed` in it means the viewport again.
- **The header row owns the theme's outer margin, not the search field.** Themes set their spacing
  on `.hdr`, the row search now shares with All apps and Arrange, rather than on `.search`, which
  used to carry it alone before those controls existed.
- **The empty Pinned drop target and the remove pane take over a box that is already there.** An
  empty Pinned during a drag fills the header row's own box, and the remove pane fills the footer's;
  neither is inserted into the layout, so nothing else moves under the pointer while a drag decides
  where it is going. Earlier attempts that drew either target in the flow pushed the groups 70 to
  90px down, or grew the panel outright, at the exact moment the user needs the rest of the layout to
  hold still.
- **A private custom property must not start with `--umbradesktop-`.** `tokens.test.ts` treats every
  such name in a component's styles as a theme token and fails on one missing from
  `UMBRADESKTOP_TOKENS`. The height the launcher holds while All apps or arrange mode is open is
  `--launcher-held-height` for that reason: it is the element's own, not something a theme sets.
- **Revisions after the owner's first look (2026-09-29).** The drag carries the icon alone (§5).
  Reset asks in a modal (D15). Arrange mode no longer closes on a missed click, the launcher no
  longer closes when the browser loses focus, and Escape steps back (D16). All apps and arrange mode
  hold the panel's height, so filtering no longer makes it jump. A dragged group shows where it
  lands. Removing an app uses the trash icon a group's delete already had. Groups have a ⋯ list of
  their own. Everything that drags shows the move cursor, as Umbraco's own drag and drop does. Add
  group and Add all carry a +.
- **Second round (2026-09-29).** The bar where a dragged group lands sits in the middle of the gap
  between cards, not on the edge of one: the drag reads the grid's own column or row gap and sets
  `--launcher-drop-gap` on that card. A group dragged over no card, over the gap between two or up
  over Pinned, lands beside the nearest group instead of nowhere, so the bar never goes out while
  the pointer is still in the layout. The bar's `z-index` is 5, above a heading a theme lifts:
  Umbraco 4's sticky group strips sit at 2, and hid it at 1.
