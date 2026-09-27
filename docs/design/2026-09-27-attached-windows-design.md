# Attached windows - Design

> Some windows only mean something beside another one: a preview of the document you are editing,
> the list of what somebody else changed in it, its copy on another environment. This gives the
> desktop one primitive for all of them. An attached window belongs to an owner window, rises and
> minimizes with it, has no taskbar button of its own, and is either docked against the owner as
> part of it or floating above it as a tool window.

- **Status:** Approved design / pre-implementation
- **Date:** 2026-09-27
- **Branch:** `claude/attached-windows-concept-112902`
- **Issue:** [#94](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/94)
- **Blocks:** [#21](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/21) (live
  preview), [#31](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/31) (the document
  on another environment), [#38](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/38)
  (show what changed)
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

Three features want a second window beside a document window, and all three are about the document
next to them:

- **#21** shows the rendered page beside the editor.
- **#38** shows what changed when somebody else edited the document. Its design (overwrite guard
  §10) put that in the notice region of the window itself, capped and scrolling. A three-way diff
  of a real document does not fit there.
- **#31** shows the same document's copy on another environment, read-only and compared property by
  property, fetched server-side through a connection.

Built separately, each would invent its own pairing. This is the pairing, once.

**In scope:** the relationship on the window model, its stacking, taskbar, minimize, close,
placement, docking, maximize and snap rules, the dock ghost, and the tests for all of it.

**Out of scope:** anything that renders inside an attached window. Each consumer owns its content.
Also out: attaching arbitrary windows to each other by hand. Windows 11's snap groups do that, and
nobody has asked for it here.

---

## 2. What other systems do

- **Windows.** Owned windows (Find dialogs, tool palettes) stay above their owner, hide when it
  minimizes, close with it and get no taskbar button. Maximizing the owner leaves them floating.
- **macOS.** Child windows are ordered above their parent and move with it, which is the literally
  attached version. Utility panels float above an application. Sheets and the old drawers are glued
  to their window.
- **Linux.** A transient window behaves like a Windows owned window: above its parent, minimized with
  it, no taskbar entry.
- **Applications.** Visual Studio, JetBrains IDEs and Photoshop have panels that are either docked,
  which makes them part of the window's layout so they fill with it, or floating as tool windows on
  top. Winamp's windows snapped together and moved as one while snapped.

The operating systems float. The docked or floating split is an application pattern, and it is the
one that fits a desktop whose windows are whole backoffices. Everything else here (above the owner,
minimized with it, no taskbar button, closed with it) is what every platform already does.

---

## 3. Settled decisions

- **D1. Created by features, never by hand.** A preview control, a notice action or a compare
  action opens an attached window for a given owner. Attached windows are not launcher apps.
- **D2. One owner, no nesting.** An attached window has exactly one owner and owns nothing itself.
  An owner may have several attached windows, one of each kind, where the kind is the attached app's
  alias. Asking for a kind already open focuses it.
- **D3. One layer.** Focusing any window in a group raises the whole group. Attached windows always
  stack above their owner, so a floating one can never be buried behind it.
- **D4. No taskbar button.** The owner's button stands for the group. #21 had decided the preview
  gets its own button, because a minimized preview would otherwise be unreachable; an attached
  window never minimizes on its own, so that case no longer exists.
- **D5. One state.** Minimize, maximize and restore from any window apply to the group.
- **D6. Close cascades one way.** Closing the owner closes the group. Closing an attached window
  closes only that one.
- **D7. Docked or floating.** Docked is part of the owner: its top and height, against its left or
  right edge, moving and maximizing with it. Floating is a tool window above the owner. Floating is
  a necessary evil rather than the goal: the backoffice does not hold together much below 900px, so
  when two windows do not fit side by side at a usable width, overlapping beats squeezing.
- **D8. Docked moves as one.** Dragging the owner carries its docked windows. Dragging a docked
  window's titlebar undocks it. Without the first half, the first move of the owner leaves the docked
  window behind and docking means something only at the moment of maximizing.
- **D9. A different document closes the group's attached windows.** They describe the document the
  owner was showing. A consumer that would rather follow the new document can add that later.

---

## 4. The model

`UmbraDesktopWindow` gains two optional fields:

```ts
owner?: string;            // the owner window's id; absent on every ordinary window
docked?: 'left' | 'right'; // absent when floating, and always absent on an owner
```

Optional and absent, like `dirty` and `snapped`, so every window that exists today is an ordinary
window without a migration. Nothing is persisted: open windows do not survive a reload, so there is
no stored shape to version.

A **group** is an owner plus every window whose `owner` is its id. It is derived, never stored, so it
cannot disagree with the list.

### 4.1 `window-group.ts` (new, pure)

The group rules get their own file beside `window-model.ts` rather than growing it:

| Function | What it answers |
| --- | --- |
| `groupOf(windows, id)` | The owner and its attached windows, for any member's id |
| `focusGroup(windows, id)` | Raise the group: the owner takes the next z, attached windows above it, the focused one active |
| `setGroupState(windows, id, state)` | Minimize, maximize or restore every member |
| `placeAttached(owner, size, side, bounds, mins)` | Where a new attached window goes, and whether the owner has to move (§5) |
| `moveGroup(windows, id, x, y)` | Move the owner and carry its docked windows by the same delta |
| `followOwner(windows, ownerId)` | Re-derive docked rectangles after the owner resized |
| `dockTargetAt(dragged, owner, edge)` | Which side of its owner a floating window is offering to dock to, if any |
| `groupLayout(windows, ownerId, region, mins)` | The maximize and half-snap layout (§6) |

Every function hands back the same list when nothing changed, for the reason `setWindowDirty`
documents: the observable's identity drives rendering.

### 4.2 `window-manager.context.ts` (edited)

- Gains `openAttached(ownerId, app, side)`.
- `focus`, `setState`, `move`, `resize`, `close` and `requestClose` become group-aware by calling
  §4.1. `requestClose` on an owner guards every member with unsaved changes. None of the three
  consumers ever has any, since all three are read-only, but the rule should not depend on that.
- `setSubjects` already detects that a window started showing a different document, to clear its
  conflict flags. It now also closes that owner's attached windows (D9). A reload of the same
  document is not a change and closes nothing.
- `commitSnap` and the maximize path route through `groupLayout` when the window has docked
  windows. A window with none keeps today's behaviour exactly.

### 4.3 The window element (edited)

- A docked window draws no resize handle on the edge it shares with its owner, and its top and
  bottom handles are gone too, since its height is the owner's.
- Dragging an attached window never offers the half-desktop snap. It offers the dock ghost instead
  (§7).
- Drag stays hand-rolled with `setPointerCapture`. A group move is one state update per pointer
  move, the same count as a single window's.

### 4.4 The taskbar (edited)

It skips any window with an `owner`. The owner's button is active while any member has focus, and
`taskActivation` answers for the group: clicking the active group's button minimizes the group, and
clicking any other raises it.

---

## 5. Placement

A new attached window asks for a side and a size (its app's `defaultSize`, with the active theme's
chrome added exactly as `open` does). `placeAttached` tries, in order:

1. **Docked beside the owner**, at the owner's top and height. If that runs off the desktop, shift
   the pair inward until it does not.
2. **Docked, narrower.** Shrink the attached window towards its minimum width, then the owner towards
   its own, until the pair fits.
3. **Floating.** When even both minimums do not fit side by side, the window floats at the size it
   asked for, inside the owner's edge on its side, starting one titlebar below the owner's top so the
   owner's titlebar and controls stay visible.

"Minimum" is `minWindowSizeForContent`, the same floor the resize and the snap already use. No
second number for what counts as usable.

Several docked windows on one side stack outwards in the order they were opened.

---

## 6. Maximize and snap

Maximizing from any window lays the group out across the desktop. A half snap of the owner does the
same across that half, so one function serves both, with the region as its input:

- Docked windows keep their width on their side, full height.
- The owner takes what is left.
- If what is left is below the owner's minimum, the owner takes the whole region and its docked
  windows overlap it at their sides, above it. This is the same policy `snapRect` already has for a
  single window: a window you can work in beats a tiling that looks tidy.
- Floating windows stay where they are, above the owner.

**How it is drawn.** A maximized window without docked windows keeps today's 100% layout. A group
with docked windows cannot be drawn in percentages, so its layout is written into each member's
`rect`, with the previous rectangle in `restoreRect`, and re-derived on every desktop resize. That is
exactly the arrangement snapping already uses (`snapWindow`, `resnapWindows`), so a maximized group
is a snapped one as far as that machinery is concerned. Restore gives every member its `restoreRect`
back.

Dragging a maximized or snapped group's titlebar restores it under the pointer, as a single window
does today.

---

## 7. Docking by drag

While a floating attached window is dragged, `dockTargetAt` checks whether the edge facing its owner
is within `UMBRADESKTOP_SNAP_EDGE` of the owner's left or right edge. If it is, the desktop draws a
ghost at the docked rectangle and letting go docks it there. It is only ever offered against the
window's own owner.

The ghost is the snap ghost: the same element and the same three tokens. A dock preview and a snap
preview are one idea, "let go and it goes here", and two looks for it would ask every theme for a
second answer to one question.

---

## 8. The drag clamp

A dragged group is clamped as a whole: `clampWindowPosition` runs against the union of the owner and
its docked windows, and the resulting delta moves them all. Clamping each window on its own would let
the desktop's edge pull a docked window off its owner, which D8 exists to prevent. Floating windows
are clamped on their own, as today.

---

## 9. Themes

No new tokens are expected. Attached windows use the ordinary window chrome under every theme, and
the dock ghost is the snap ghost. A docked pair is two windows touching, which themes with shadows or
rounded corners may draw as a visible seam. That is checked in a browser under all five themes, and
if one of them needs to style it, that is a missing token to add for every theme rather than a theme
exception.

---

## 10. Tests, written first

| What | Where |
| --- | --- |
| Focusing an attached window raises the owner too and keeps the attached one above it | `window-group.test.ts` |
| Minimizing from either window minimizes both; restoring restores both | same |
| Closing the owner closes the group; closing an attached window leaves the owner | same |
| Opening the same kind twice focuses the one already open | same |
| An attached window cannot become an owner | same |
| Placement: docked when it fits, pair shifted when that makes it fit, narrowed to the minimums, floating below the owner's titlebar when nothing fits | same |
| A docked window follows the owner's move and resize | same |
| Dragging a docked window undocks it at its own size | same |
| A dock is offered near the owner's edge, not elsewhere, and never against another window | same |
| Maximize: docked side by side, floating left alone, overlap rather than squeeze when too narrow | same |
| A half snap lays the group out within the half by the same rule | same |
| The union clamp keeps a docked pair together at the desktop's edges | same |
| A different document closes attached windows; a reload of the same one does not | `window-manager.test.ts` |
| A group close guards every member with unsaved changes | same |
| An attached window has no taskbar button; the owner's is active while it has focus | `components/taskbar-features.test.ts` |
| A docked window has no shared-edge, top or bottom handle; an attached window is never offered the half snap | `components/window-snap.test.ts` |

**Browser checks, part of done and not of the suite:**

- Drag a docked pair across other windows' iframes; it must not stall.
- Maximize a group on a wide and on a narrow viewport, and restore it.
- Dock and undock by drag, including the ghost.
- All five themes, docked and floating.

---

## 11. Risks

- **R1. Maximize changes shape for a group.** A group with docked windows is laid out in pixels and
  re-derived on resize, where a lone window is 100%. The mitigation is keeping the lone case
  untouched and giving the group path the same machinery snapping already proved.
- **R2. A narrow desktop always floats.** Below the two minimum widths, every attached window
  overlaps its owner. Accepted: that is D7, and placement keeps the owner's titlebar visible.
- **R3. Consumers' specs predate this.** #21 says the preview gets its own taskbar button, #31 says
  it navigates to the other environment, and #38's design opens its panel in the notice region.
  Each is superseded on that point by this design, and each issue's text has been brought in line
  (§13). The overwrite guard design itself still says the notice region.

---

## 12. Alternatives considered

- **Always floating**, the Windows owned-window model. Simplest, and it covers a document you would
  like to see beside its diff with a palette over it. Rejected as the only mode because comparing
  is the point of two of the three consumers.
- **Always docked**, the macOS child-window and drawer model. Rejected because on a laptop two
  backoffices side by side are each too narrow to use, and a window that cannot be moved away from
  its owner cannot be moved out of the way either.
- **A pane inside the owner window.** Rejected in #21 already: content windows open at 960 wide and
  the backoffice stops holding together nearer 900, so a pane forces the window to about 1440, and
  `chromeProfile`, the reload button and the chrome injector are all per window.
- **A group object in the manager**, holding members. It pays off only if users could group arbitrary
  windows, which is out of scope. Two optional fields on the window cannot drift from the list.
- **An own taskbar button for each attached window**, #21's original decision. Its reason, an
  unreachable minimized preview, cannot occur under D5.
- **Docked windows that do not follow the owner.** Rejected by D8.
- **Following the owner to its new document.** Right for a preview, wrong for a diff that describes
  one specific conflict. Closing is the rule that is right for all three; following can be added per
  consumer.

---

## 13. The consumers' issues, brought in line

All three were updated on 2026-09-27, when this design was written:

- **#21:** the preview has no taskbar button of its own, per D4, and navigating the parent to a
  different node closes it, per D9.
- **#31:** renamed, and reshaped from a navigation into a read-only, compared attached window
  fetched through a connection. That needs one new typed endpoint, because
  `DesktopConnectionApiClient` is deliberately not a pass-through proxy. #77 put comparing
  environments out of scope for connections; #31 reverses that for this one case.
- **#38:** the panel opens as an attached window rather than in the notice region, superseding that
  sentence of the overwrite guard design §10. The deleted-document case reuses it the same way, and
  #31 reuses its renderer.

---

## 14. Definition of done

- [ ] `npm run build` and `npm test` both pass
- [ ] `README.md`: does not apply until a consumer ships, since nothing here is visible on its own
- [ ] `umbraco-marketplace-*.json`: does not apply, for the same reason
- [ ] `docs/`: this design doc; `docs/theming.md` only if §9's browser check finds a seam that needs
      a token
- [ ] `docs/attached-windows.md`, a guide in the spirit of `docs/theming.md`, written for two readers:
      a contributor whose issue needs an attached window, and an AI agent building a future add-on.
      It explains when a feature should use one and when it should not, how to open one, the rules
      the desktop enforces so a consumer does not re-implement them, and the traps the build finds.
      Written from the built code rather than from this design, and linked from `CLAUDE.md` so an
      agent working in this repository finds it
- [ ] Anything the build teaches that is not obvious from the code is written down where the next
      person will hit it
