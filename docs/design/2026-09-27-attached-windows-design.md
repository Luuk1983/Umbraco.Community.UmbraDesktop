# Attached windows - Design

> Some content only means something beside a document: a preview of it, the list of what somebody
> else changed in it, its copy on another environment. This gives the desktop one primitive for all
> of them. Attached content belongs to an owner window and is shown one of two ways: **docked**, as a
> pane inside the owner window, or **floating**, as a separate window that rises, minimizes and
> closes with its owner and sits beside it on the taskbar in one group.

- **Status:** Built, revised twice after browser testing
- **Date:** 2026-09-27
- **Branch:** `claude/attached-windows-concept-112902`
- **Issue:** [#94](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/94)
- **Blocks:** [#21](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/21) (live
  preview), [#31](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/31) (the document
  on another environment), [#38](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/38)
  (show what changed)
- **Mockup:** [`mockups/attached-windows.html`](mockups/attached-windows.html)
- **Guide:** [`../attached-windows.md`](../attached-windows.md), for a feature that wants to use this
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

Three features want something beside a document window, and all three are about the document next
to them:

- **#21** shows the rendered page beside the editor.
- **#38** shows what changed when somebody else edited the document. Its design (overwrite guard
  §10) put that in the notice region of the window itself, capped and scrolling. A three-way diff
  of a real document does not fit there.
- **#31** shows the same document's copy on another environment, read-only and compared property by
  property, fetched server-side through a connection.

Built separately, each would invent its own pairing. This is the pairing, once.

**In scope:** the relationship on the window model; the docked pane and its chrome; floating
attached windows, their stacking, controls and taskbar group; docking and undocking; and the
contract a consumer's content implements.

**Out of scope:** what renders inside. Each consumer owns its content. Also out: attaching arbitrary
windows to each other by hand. Windows 11's snap groups do that, and nobody has asked for it here.

---

## 2. What other systems do

- **Windows.** Owned windows (Find dialogs, tool palettes) stay above their owner, hide when it
  minimizes, close with it and get no taskbar button.
- **macOS.** Child windows are ordered above their parent and move with it. Utility panels float
  above an application.
- **Linux.** A transient window behaves like a Windows owned window.
- **Applications.** Visual Studio, JetBrains IDEs and Photoshop have panels that are either docked,
  which puts them *inside* the main window's layout, or floating as separate windows. That split,
  not the operating systems' owned windows, is the model here.

---

## 3. Settled decisions

- **D1. Created by features, never by hand.** A preview control, a notice action or a compare
  action opens attached content for a given owner. It is never a launcher app.
- **D2. One owner, no nesting, one of each kind.** Attached content has exactly one owner and owns
  nothing itself. The kind is the attached app's alias, counted across panes and floating windows
  together: asking for a kind that is already open, in either form, focuses it.
- **D3. Docked is a pane inside the owner window.** One frame and one border, so nothing can overlap
  and there is no seam between two windows to theme. The pane runs from the titlebar down, behind a
  splitter, with a small header of its own: icon, title, reload, pop out, close. The path strip and
  the notices stay over the owner's own content column, because both are about that content. A pane
  has no minimize or maximize and no taskbar button: it goes wherever its window goes.
- **D4. Floating is an attached window.** A separate window with the full set of controls (reload,
  minimize, maximize, close). Under its titlebar is a strip the desktop draws, reading "Attached to
  *owner*", with a Dock button at its end. The strip is the pane header's other half: pop out lives
  in the header while docked, Dock lives in the strip while floating. The first build marked a
  floating window with a chain-link glyph before its title instead, and nobody could have been
  expected to read it. Dock is disabled, with a tooltip saying why, when the pane would not fit.
- **D5. One layer, focused on top.** An owner and its floating windows rise as one, with no other
  window between them, and within the group the window you focus goes on top. A fixed order (always
  above the owner) was built first and dropped: it made the editor impossible to bring in front of
  its own preview without moving one of them.
- **D6. One group on the taskbar.** The owner's button, then a button for each of its floating
  windows, all inside one box. Each is clickable on its own and behaves as any window button does:
  clicking focuses that window, clicking the one that already has focus minimizes it. The active
  marker sits on the focused window's button. The box is the signal, not the labels, so it survives
  the icon-only themes.
- **D7. Minimizing.** Minimizing the owner minimizes the group. Minimizing a floating window hides
  only that one; its button brings it back. Restoring the owner brings back what was minimized with
  it, not what was minimized on its own.
- **D8. Maximizing is per window.** A floating window maximizes on its own, and maximizing the owner
  leaves floating windows alone, reachable from their buttons. A pane maximizes with its window.
- **D9. Closing cascades one way.** Closing the owner closes its panes and floating windows, asking
  first about any with unsaved work. Closing attached content closes only that.
- **D10. A different document closes it.** When the owner starts showing a different document, its
  panes and floating windows close: they describe the document it was showing. A reload of the same
  document closes nothing. A consumer that would rather follow the new document can add that later.
- **D11. Docking follows the pointer.** While a floating window is dragged, its owner shows a dock
  zone just inside each edge where a pane would fit: a band 160px wide (at most a third of the
  owner), below the titlebar, labelled "Dock here". The zone under the pointer turns solid and says
  "Release to dock", and letting go there docks. Where the dragged window's own edge happens to be
  does not matter. The owner draws the zones inside its own frame, so the window being dragged
  passes over them; drawn on the desktop above every window, they covered the window being dropped.
  To undock, press Pop out in the pane header, or drag the header: after 12px the pane tears off
  into a floating window under the pointer and the same drag carries on moving it, like a browser
  tab.
- **D12. Opening a pane widens the window.** The window grows by the pane's width so the editor
  keeps its own, shifting onto the desktop if it would run off an edge. When the desktop cannot fit
  the widened window, the content opens floating instead: the backoffice does not hold together much
  below its minimum, so a second window over the owner beats squeezing the editor. A maximized or
  snapped owner cannot grow, so there the pane takes its width from the editor, as long as the
  editor keeps its minimum.
- **D13. The preview control lives in the path strip, not the titlebar.** Every theme's titlebar
  controls are summed into its drag-clamp metrics and measured by its `metrics.test.ts`. A control
  only some windows draw under-counts those metrics, which is the unsafe direction: the reload
  button gets away with it only because leaving it out over-counts. The strip carries no such sum,
  already names the document, and is drawn on the section windows a document is edited in. It shows
  as pressed while the pane is open, and clicking it then closes the pane.
- **D14. Two actions that must not look alike.** Pop out uses a picture-in-picture glyph, a frame
  with a small filled window in its corner. Leaving the desktop is spelled out as "Open in a new
  browser tab" with the external-link arrow. The first build used one arrow for both. Dock uses
  the same frame with its side panel filled, on the side it will dock to.
- **D15. The strips are the path strip in other places.** The pane header and the floating
  window's strip are drawn at the theme's `pathbarHeight` and from the path strip's tokens, so a
  docked pane's header lines up with the owner's path beside it and reads as one strip. Each has
  `pane-header-*` tokens of its own that fall back to the `path-*` ones, so a theme that styled its
  path strip has styled these. The first build used a 30px strip in the backoffice's greys, which no
  theme had styled, and it looked pasted on in all five.
- **D16. Their buttons are toolbar buttons.** Preview, Dock and the pane header's controls have no
  face and no border until hovered, and are written in the strip's text colour, not the link colour
  the crumbs use. Pressed Preview is drawn the way the theme draws a toggled toolbar button, from
  `strip-button-on-*` tokens: Umbraco's own "you are here" colour by default, a darker fill on macOS,
  an accent tint on Windows 11, a pushed-in bevel over a dithered face on Windows 98. The first
  build drew a bordered white button and an outline ring, which read as form controls dropped onto
  the chrome.

---

## 4. The model

A pane is not a window. It is content the owner window draws, so it lives on the owner:

```ts
interface UmbraDesktopPane {
  id: string;               // stable while it moves between pane and floating window
  app: UmbraDesktopApp;     // the same element app either way
  side: 'left' | 'right';
  width: number;            // the pane's own width, splitter-adjustable
  grew?: number;            // how much the window grew for it, given back when it goes
}

// UmbraDesktopWindow gains:
panes?: ReadonlyArray<UmbraDesktopPane>;  // on an owner
owner?: string;                           // on a floating attached window
dockSide?: 'left' | 'right';              // on a floating attached window: where Dock puts it
minimizedWithOwner?: boolean;             // D7: what restoring the owner brings back
saves?: number;                           // on an owner: see §5
```

Docking and undocking move one app between the two forms: undocking removes it from `panes` and
opens a window with `owner` set; docking does the reverse. Its `id` survives the move, so a consumer
can tell "moved" from "opened". Its element is remounted, because it moves between two DOM subtrees.

Nothing is persisted: open windows do not survive a reload.

A **group** is an owner plus every window whose `owner` is its id, derived and never stored.

### 4.1 `window-group.ts` (pure)

The group rules: finding a window's group, raising it (D5), minimizing and restoring it (D7),
closing it (D9), the one-of-each-kind lookup (D2), pane placement and window widening (D12), and the
dock target for a pointer (D11). Every function hands back the same list when nothing changed,
because the observable's identity drives rendering.

### 4.2 `window-manager.context.ts`

`openAttached(ownerId, app, side)` opens a pane when D12 allows and a floating window otherwise,
and returns the content's id. `closeAttached`, `undock`, `dock`, `canDock`, `setPaneWidth` and
`setAttachedContentWidth` do what they say. `focus`, `setState`, `close` and `requestClose` apply the
group rules, and `setSubjects` applies D10. While a floating attached window is dragged,
`previewSnap` offers the dock zones on `dockZones` instead of the half-desktop snap, and
`commitSnap` docks when the pointer is in one.

### 4.3 The window element

Lays the frame out as titlebar, then a row: the panes on the left, the owner's column (path
strip, notices, body), the panes on the right, each pane behind a splitter. A pane is its own
element, `umbradesktop-window-pane`, but its drag is carried by the owner's frame, because the pane
element is removed the moment it tears off and the same pointer has to go on moving the new window.
On a floating attached window it draws the attached strip and the full controls. On an owner it
draws its own dock zones while one of its floating windows is dragged.

### 4.4 The taskbar

Draws each owner's button and its floating windows' buttons inside one group box (D6). Windows
without attached windows draw exactly as today.

---

## 5. The consumer contract

What a feature builds to use this, and what `docs/attached-windows.md` explains to the next one:

- An **element app**, opened with `openAttached`. The same element must work as a pane and as a
  floating window, because the editor decides which, and may change their mind.
- **`content.props`**, assigned onto the element before it connects. This is how the body learns
  its owner and its subject; a constructor takes no arguments. The app host already does this.
- **Reload** remounts the body. A body that needs fresh data on reload fetches it on connect.
- **The owner's state** is read from the window manager: `dirty`, `changedElsewhere`, and `saves`,
  a count of how many times the owner's document has had a new saved version (its own save or
  publish, or a clean window's refresh after somebody else saved). The dirty watcher counts it. A
  discard is not counted, since it leaves the saved version alone.

---

## 6. Themes

New surfaces, each with tokens so every theme restyles and none removes:

- **The pane:** `pane-background`, `pane-header-*` (falling back to `path-*`, D15) and
  `pane-splitter-*`. The header is not a titlebar and must not look like one.
- **The strips' buttons:** `strip-button-*` for radius, hover and pressed (D16).
- **The dock zones:** `dock-zone-*`, with an `active` set of their own. The first build filled the
  active zone from the snap ghost's translucent white, which vanished over a white window.
- **The taskbar group box:** `task-group-*`. A bordered box on Umbraco, a groove on Windows 98. Its
  geometry goes inside the taskbar's own box, like the notice badge, because `.running` clips.

`theme/attached-content.test.ts` fails any sheet that hides the group box, the pane header or its
controls, the splitter, the attached strip or the Dock button. It also fails a palette whose hover
or pressed text matches its own background, and a palette that styles the path strip without giving
pressed Preview a fill of its own. No new metric: the strip height is `pathbarHeight`.

---

## 7. Tests, written first

| What | Where |
| --- | --- |
| Raising a group puts the focused window on top and nothing between the group | `window-group.test.ts` |
| Minimizing the owner takes the group; a floating window minimizes alone; restoring the owner brings back only what went with it | same |
| One of each kind, across panes and floating windows | same |
| Opening a pane widens the window by the pane, shifts it onto the desktop, and falls back to floating when it cannot fit | same |
| A maximized or snapped owner's pane takes width from the editor, and floats when the editor would go below its minimum | same |
| The dock target follows the pointer, not the window's edge | same |
| Closing the owner closes panes and floating windows; a different document closes both; a reload of the same one does not | `window-manager` tests |
| Undocking keeps the id and opens a floating window; docking does the reverse | same |
| The taskbar draws a group box with one button per window, and the active marker on the focused one | `components/` tests |
| The frame lays out owner column, splitter and pane; the path strip and notices stay in the owner column | same |
| A floating attached window has the attached strip and full controls; a pane header has reload, pop out and close | same |
| Tearing a pane off takes 12px and follows the pointer; pressing its header or splitter selects no text | same |
| The dock zones are drawn inside the owner and under the dragged window, and the active one is solid | same |
| The strips are the path strip's height and take its tokens; the buttons have no face at rest | same |
| No theme hides any of the new surfaces; pressed and hovered text reads on its background | `theme/` |
| The save count: a save counts, a load, a discard and another document's load do not | `dirty-watcher.test.ts` |

**Browser checks, part of done:**

- A docked pane and a floating window under all five themes, light and dark.
- Dragging a floating window across other windows' iframes, and docking it by the pointer.
- Opening a pane on a narrow desktop falls back to floating.
- Focusing the editor and the preview in turn from the taskbar group.

---

## 8. Risks

- **R1. Two new chrome surfaces across five themes.** The pane header and the group box are fifteen
  states to check. The theme test covers removal mechanically; the look is the browser pass.
- **R2. Widening a window can move it.** Opening a pane near the right edge shifts the window left.
  That is the honest trade for keeping the editor usable, and it is what D12 says.
- **R3. A remount on dock and undock.** Whatever the body held is rebuilt. For all three consumers
  that is a refetch, and none of them hold unsaved work.
- **R4. A pane holds an iframe inside a window that holds an iframe.** The owner's focus catcher
  exists because an inactive iframe swallows the click that should focus its window; the pane's
  frame needs the same treatment.

---

## 9. What the first build taught

The first build made docked a second window against the owner's edge. It worked, and seeing it in a
browser changed the design:

- **Two windows side by side overlap.** Each frame paints its border and shadow outside its own
  rectangle, so two touching rectangles are two overlapping frames, and a seam between them is a
  styling problem in every theme. A pane has one frame.
- **A docked window's own minimize and maximize made no sense**, and pressing maximize on it
  maximized the owner. A pane has neither.
- **The attached window needed reload**, like any window whose body is a frame.
- **Docking by the dragged window's edge felt wrong.** The pointer is where the user is looking.
- **Always-above stacking buried the editor** behind its own preview. Focused-on-top plus a taskbar
  button is the answer; the button is what #21 originally asked for, for the reason it gave.
- **The same glyph for pop out and for opening a browser tab** read as one action.

Kept from the first build, because they are right in the new shape too: the save count on the dirty
watcher, `content.props` on element apps, reading the document and variant off the owner's route,
the preview URL taken from the same endpoint and provider as Save and preview, and the preview
control in the path strip.

The second round of browser testing, on the pane shape, changed less but still changed things:

- **The dock zones drew the future pane**, which beside a wide owner covered most of the screen and
  read as "you can dock almost anywhere". They are bands inside the owner's edges now.
- **Zones drawn by the desktop sat over the dragged window.** The owner draws them now (D11).
- **The active zone disappeared** over a white window, because it borrowed the snap ghost's white.
  It has accent tokens of its own.
- **Undocking needed a drag out of the whole window.** A 12px tear-off, like a browser tab.
- **Dragging a pane header selected text** across the window under the pointer. The header and the
  splitter cancel the press that starts a selection.
- **The strips and their buttons were unthemed** (D15, D16).
- **A reload on save made Umbraco's own preview page warn** that its connection was lost, because
  that page refreshes itself over its own hub. A body whose page refreshes itself must not also be
  reloaded; `docs/attached-windows.md` lists this as a trap.

---

## 10. Alternatives considered

- **Docked as a separate window against the owner's edge.** Built first. Dropped for §9's reasons.
- **A chain-link glyph on a floating window's title**, to say it is attached. Built first. Dropped
  for the strip (D4): a glyph cannot say what it is attached to, or offer to dock it back.
- **Always floating**, the Windows owned-window model. Simplest, but comparing is the point of two
  of the three consumers, and a window over the document is not a comparison.
- **Attached windows always above their owner.** Built first. Dropped by D5.
- **No taskbar button for a floating window**, relying on the owner's. Built first. With
  focused-on-top it leaves a covered window unreachable.
- **One taskbar button for the group** that flips between windows or opens a list. It hides the
  preview behind a gesture; the user wants to reach it in one click.
- **A group object in the manager**, holding members. It pays off only if users could group
  arbitrary windows, which is out of scope.
- **The strip running over the pane.** It describes and navigates the owner's content, not the
  pane's, and the pane has a header of its own.
- **Following the owner to its new document.** Right for a preview, wrong for a diff that describes
  one specific conflict. Closing is the rule that is right for all three.

---

## 11. The consumers' issues

#21, #31 and #38 were brought in line with the first version of this design on 2026-09-27. Two
points in them now need revising again: #21 still says the preview opens docked "on the content
window's right" as a separate window and has no taskbar button of its own, where it is now a pane
by default and gets a button in the group when it floats; and #38's panel likewise becomes a pane
by default.

---

## 12. Definition of done

- [x] `npm run build` and `npm test` both pass
- [x] `README.md`: describes attached content with its first visible consumer
- [x] `umbraco-marketplace-*.json`: a tag and a screenshot with its first visible consumer
- [x] `docs/theming.md`: the new token groups, and the strips drawn at `pathbarHeight`
- [x] `docs/attached-windows.md`, a guide in the spirit of `docs/theming.md`, written for two readers:
      a contributor whose issue needs attached content, and an AI agent building a future add-on. It
      explains when a feature should use it and when it should not, how to open it, the contract in
      §5, the rules the desktop enforces so a consumer does not re-implement them, and the traps the
      build finds. Written from the built code rather than from this design, and linked from
      `CLAUDE.md` so an agent working in this repository finds it
- [ ] Anything the build teaches that is not obvious from the code is written down where the next
      person will hit it
