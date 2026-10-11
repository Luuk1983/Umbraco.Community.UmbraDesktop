# Umbraco theme refinement: design

> The Umbraco theme felt bulky next to macOS and Windows 11. This gives it a point of view of its own
> instead of a milder copy of theirs: the focused window wears the backoffice header, the caption
> buttons are round, and the frame, shadow and taskbar hover are softer. Nothing a window manager
> clamps against moves.

- **Status:** Built 2026-10-04. Screenshots retaken the same day apart from one that needs an AI
  provider, see §8
- **Date:** 2026-10-04
- **Issue:** [#124](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/124)
- **Branch:** `claude/umbraco-theme-refinement-7c3872`
- **Mock:** [`mockups/2026-10-04-umbraco-theme-directions.html`](./mockups/2026-10-04-umbraco-theme-directions.html).
  A static picture of the three directions, the close-ups with their touch areas, and the taskbar
  scenario by scenario. Direction B is what was built
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. What was wrong

Read against a screenshot, with the CSS open. In order of how much each mattered:

1. **The shadow.** The window used Umbraco's depth-3 and depth-5, which are Material's 2014 pairs:
   `0 10px 20px .19 + 0 6px 6px .23`. The second layer is tight and dark, so it draws a smudge along
   the window's edge. macOS uses one wide soft layer.
2. **The title.** Lato Bold 700 at 14px in `#060606`, the darkest and heaviest line in the frame,
   directly above the backoffice's own bold headings. Lato here ships Light, Regular, Bold and Black,
   so there is no 600 to step down to.
3. **The corners.** 3px and a 1px `#d8d7d9` border: a box rather than a window.
4. **The caption buttons.** 46px full-height blocks with square hover fills, which is the Windows 11
   idiom the theme was already close to.
5. **The taskbar.** A full-height hover block on every button.

The backoffice inside the window is an iframe the theme never touches, so part of the bulk in a
screenshot is not ours to change.

## 2. The decision

A first mock changed values only (Gentle, Refined) and the owner could barely see the difference. A
second offered three directions that were meant to be seen across a room, and **B was chosen**.

**B: the focused window wears the backoffice header.** A navy caption with a white title. An
unfocused window turns sand with navy ink rather than fading. It is the idea no other theme here has,
and it says which window is in front the way the backoffice header says where you are. The title is
Regular, see §2.1.

Shared by every direction and kept:

- **Round caption buttons**: a 30px circle painted on hover, inside the same 46px-wide, full-height
  box. The close button is a solid danger-red disc with a white glyph on the navy caption, and a pale
  wash with a danger glyph on a sand one. The Windows 11 red slab is gone.
- **12px corners**, the radius of the cards inside a backoffice view.
- **A shadow tinted with the brand navy**: one soft layer and a hairline of contact.
- **The active window's taskbar marker is a lit tile and a short coral line.** The coral line is the
  section menu's marker and the owner wanted it kept, so it stays on the bar's bottom edge. How it is
  drawn changed after seeing it on a real instance: the base's edge-to-edge 3px shadow was the heaviest
  thing on the bar, 2px was still a rule across a button, and a 1px hairline was not pretty and can
  render uneven at 125 or 150 percent display scaling. Six options were compared in
  [`mockups/2026-10-04-taskbar-marker.html`](./mockups/2026-10-04-taskbar-marker.html) and **E** was
  chosen: the hover tile, lit stronger for the active window, plus a 2px line that stops 8px short of
  each side and has soft ends, like the underline under the active tab inside a window. Two cues, so a
  hovered button cannot be mistaken for the active one. Hover is a rounded tile painted inside the
  same full-height button.
- **A group of windows is a tab** rising from the bar's edge: rounded above, open below, so the
  focused member's line stays on the bar's edge like every other window's.

Rejected: **A** (the same on a white caption: too close to what was there), **C** (a sand mat around
the content: costs 6px of content on three sides and so changes `metrics`, and the backoffice already
has sand and white panels of its own inside).

### 2.1 Two things tried in the running desktop, and changed

Seen on a real instance the same day, both were changed:

- **A coral line under the focused title was dropped.** The mock had one, in the colour of the active
  section's marker. On the navy caption it read as a faint smear along the edge, and it repeated the
  identical line under the active tab in the content, a hundred pixels below. The navy caption already
  says which window is in front. The line under the focused window's taskbar button stays, because
  that one is not competing with anything.
- **The title went from Bold to Regular.** Light text on a dark ground looks heavier than the same
  weight on white, so Bold on navy brought back the heaviness this work set out to remove. Lato ships
  Light, Regular, Bold and Black, so there was no 600 to try.

### 2.2 Found while retaking the screenshots and rebasing

- **The error marker sank into the focused caption.** Umbraco's `danger-standalone` is a dark maroon,
  darkened to read on a white ground, and on the navy caption it measured 2.1 to 1: the red circle-x
  that says "moved to the recycle bin" was nearly gone. The focused caption now lightens it, scoped to
  the titlebar so the pale pink notice banner under it keeps the dark one. The unfocused sand caption
  and the warning marker already clear 3 to 1. A test holds both captions to that.
- **The window-progress ring (#108, merged after this branch started) was blue on navy.** Its title-bar
  fill falls back to `interactive-emphasis`, a mid blue written against a white caption, and measured
  1.8 to 1 on the navy header. The Umbraco theme now sets the three title-bar progress tokens for a
  focused caption (the coral the taskbar's ring already uses, a faint track and the lightened danger)
  and the sheet restates the base's blue for the unfocused sand caption, where a window uploading in
  the background draws it. A test renders both.
- **The real danger colour is `#c31d4c`.** The mocks and an early test used `#d42054`, which is the
  base chrome's own hard-coded fallback for a variable the backoffice always defines.

## 3. Touch

The first mock shrank the caption buttons to 42 by 26, which is a touch regression. The built version
paints a smaller shape and keeps the box:

| Control | Touch target |
|---|---|
| Caption buttons | 46 wide, the caption's full height (40). Wide enough, and 4px short of Apple's 44 in height |
| Taskbar buttons | The bar's full height, at least 44 wide. Icon-only buttons in the fixed row were 42 |
| Start | The bar's full height, at least 44 wide |
| Pane header buttons, the Dock button | About 20px tall in a 28px strip. Grown to the strip's 28 by an overlay |

The pane and strip buttons stop at 28px high, which clears WCAG 2.5.8's 24px and not Apple's 44. They
are not widened: the pane's three buttons sit a few pixels apart and a wider overlay would make a tap on
one land on its neighbour. The strip cannot be taller without costing content, and its height is a
metric.

A taller caption on touch (`@media (pointer: coarse)`) was considered and **not done**: the caption's
height is a published metric, and one that depends on the input device is a different, larger change.

## 4. How it is built, and what that changed

The Umbraco theme used to be the **identity theme**: an empty palette over the base chrome, no sheets.
That was a deliberate guarantee ("setting nothing cannot drift from what shipped") and it is gone,
because a round hover face and a hover tile are structure, and structure in the base chrome
would be in every other theme too. Every opt-out would have been four palette edits, forever.

So the theme is now a **palette and two sheets** (`window.css.ts`, `taskbar.css.ts`), like the others.
What it keeps from the old arrangement is the half that mattered:

- **Every palette value is a `--uui-*` reference**, written with `color-mix` for the tints. One palette
  therefore follows Light, Dark and High contrast and anything the backoffice's own colours become,
  with no dark variant. The header colour is `--uui-color-header-surface`, not a hex.
- **It still answers no app token.** An app's fallback is the Umbraco look and lives in the app, so
  answering one here would fork the two. `app-tokens.test.ts` now asserts that, where it used to
  assert an empty palette.
- **Its `metrics` are still the base chrome's own.** The caption is 40px, the buttons 46px wide, the
  frame ring 1px. `themes/umbraco/metrics.test.ts` mounts the window with the theme's palette and
  sheets in force and holds the published numbers against what is painted. It used to measure the bare
  base, which would now pass for a window nobody sees.

Three consequences worth knowing:

- **The theme context loads the default theme's sheets.** It used to load a theme's sheets only when
  the theme in force *changed*. A context starts resolved on the default, so a user who never changed
  theme never got them, which was invisible while the default had none. `theme.context.test.ts` holds
  it, and the context now tracks which theme's sheets it has asked for.
- **The unfocused state is custom properties, not rules.** The sheet redeclares the caption tokens on
  `.frame:not(.active)`, so everything that reads them follows, including the unsaved marker, whose
  colour chains from the caption text and would otherwise be white on sand.
- **The round hover face is a `radial-gradient` in the hover token.** The base paints a hover with a
  `background` shorthand fed by a token and a gradient is a valid value for one, so the caption gained
  no structure at all.

The base chrome's own CSS is unchanged. It is still the Umbraco design as it was, which is what a
window shows in the instant before a theme resolves, and what any palette leaves alone.

## 5. Contrast

The unfocused title is navy at 70% on sand, which is about 4.9:1. The first mock used 55%, a prettier
3.4:1 that fails. The focused title is white on the header navy.

## 6. What the guard scans caught

`theme/attached-content.test.ts` reads a zero `width` or `height` as a hidden box, by regex, and the
regex has no word boundary, so `border-bottom-width: 0` on the taskbar group matched it. The group's
open bottom is written `border-bottom: none` instead. Known, and cheaper to live with than to loosen a
check whose job is to catch a theme hiding something.

## 7. Open points

- **Dark mode was not looked at in a browser.** Every value is a `--uui-*` reference and should adapt,
  but the sand caption and the 70% ink in particular were only measured in light.
- **The unfocused warning glyph** in the caption is Umbraco's yellow on sand, as it was yellow on white.
  It was weak before and is no worse, and it is not fixed here.

## 8. Not done

- **Screenshots, mostly done.** Retaken against a running instance, at the sizes of the originals:
  `hero.png`, `desktop-windows.png`, `theme-gallery.png`, `theme-wallpaper-match.png`, `launcher.png`,
  `live-preview.png`, `notifications.png`, `unsaved-changes-guard.png`, `help.png` and
  `background-jobs-viewer.png`. Not retaken: `ai-copilot-chat.png`, which is a real conversation with a
  model and needs a configured AI provider to reproduce, and the ones that do not show this theme
  (`theme-macos.png`, `theme-win98.png`, the two Entertainment captures, which are under Windows 98,
  `header-entry-point.png` and `choose-background.png`, whose only theme chrome is a Start button).
  `launcher.png` also shows today's launcher, with its All apps and Arrange buttons, which the old
  capture predated.
- **The settings picker's miniature** of the Umbraco theme picks up the navy caption and the round
  corner from the palette for free. It does not draw the round faces, which live in
  a sheet it does not adopt. A `preview.css.ts` would add them.
