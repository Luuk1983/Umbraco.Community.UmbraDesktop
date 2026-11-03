# The pane as a side panel

Date: 2026-10-27. Status: built, on `v17/main` first. Decided with the owner over four mocks, which
are not kept: each was a throwaway HTML page in a session scratchpad.

## 1. The problem

The small buttons on the path strip and in a pane's header were too small and fought the window's
own controls.

- A pane's buttons were 24 by 22 with 12px glyphs, which is under WCAG 2.5.8's 24px minimum. On
  Windows 98's 22px strip they were 24 by 16. The Umbraco theme stretched their touch box with an
  overlay to make up for it.
- The pane's close cross sat about 40px under the window's own close, the same shape with a
  different result.
- Every glyph was drawn by us: a picture-in-picture for pop out, a frame with a filled panel for the
  toggles and Dock.

The owner's framing: the pane should behave like a sidebar, not like a window in a window.

## 2. Decisions

**D1. Buttons fill the strip: 32px wide, the strip's full height, 16px icons.** Option A of four.
The taller strip (B: 36px), the pane as an inset card (C) and a touch-only 44px mode (D) were
rejected. A costs no content and no theme metric, because the strip's height is already paid for.
A theme with a shorter strip gets shorter buttons, which still clear the 24px minimum on width. The width is
`UMBRADESKTOP_STRIP_BUTTON_WIDTH` behind `--umbradesktop-strip-button-width`. The Umbraco theme's
overlay went with it. The fixed width was replaced by even padding (D10).

**D2. The pane slides.** Opening a pane already widens its window so the editor keeps its width
(`placePane`). The motion shows that: the frame's edge moves out and the pane rides it, out from
under the editor, like a drawer. A maximized or snapped window cannot grow, so there the pane slides
in over the editor, which narrows once it has landed. Closing plays the same backwards. It takes
200ms in and 160ms out, and nothing moves under reduced motion. Only the frame's width and the
pane's transform move: the editor is held at its final width with a negative margin, so neither page
reflows during the slide. The geometry is pure, in `windows/pane-motion.ts`.

**D3. No close cross anywhere in a pane. Every pane has Hide, and the opener steps aside while its
pane is docked.** The owner's own idea, after a first build in which only panes nothing toggled had
Hide and Preview's pane relied on the pressed Preview button: that made panes differ by how they
were opened.

- The control that opened a pane, Preview or a view's beside button, leaves the path strip while the
  pane is docked (`previewDocked`, and `docked` on the path view). In effect it has slid out with the
  pane and become the pane's **Hide**, last in the header, at the edge the pane slides out to.
- Hide keeps the opening icon while it rides out, and turns to point back in once the pane is open
  (the pane's `opening`). When the pane slides back in, the opener comes back.
- Hide is drawn with the panel icon, never a cross, after a divider that keeps it apart from Pop out,
  as the owner asked.

Rejected on the way: Hide only where nothing toggles the pane (a `toggledByOwner` flag, built and
removed the same day), and no close anywhere (a Media Manager item could only be put away by popping
it out first).

**D4. The toggle's icon turns with the pane, and the button says what it will do.** Umbraco's
`icon-pannel-close` and `icon-panel-show` are a pair for a bottom panel, so both are turned -90° to
put the panel on the right.
- Closed: the chevron points right, out, because the edge will move that way.
- Open: the chevron points left, back in.

The owner first asked for one icon turned from -90° to 90°. Rendering it showed the panel line
flipping sides with the chevron, so one state drew a panel on the left where the window has none.
The two icons differ only in the chevron, which is the part that has to change. `icon-pannel-close`
is core's own spelling, with two n's, in 17 and 18. A comment in `panel-icon.ts` says so, so that
nobody "fixes" it into a missing icon.

**D5. Umbraco's icons only.** The owner does not want custom icons. Every icon is checked to exist
in `@umbraco-cms/backoffice` 17.6.0 and 18.0.0:
- Reload is `icon-refresh`.
- Pop out is `icon-window-popout`, which the Media Manager already uses for "Open in new window".
- Dock is its pair, `icon-window-popin`.
- The preview toolbar's new-tab button keeps `icon-out`. The two are both arrows going up and to
  the right, but they read differently side by side: the arrow stays inside the box on popout and
  leaves the box on `icon-out`.

The header reads Reload, Pop out, a divider, then Hide.

**D8. Preview draws its eye and its label, and no panel icon.** It carried the panel icon after
its label at first, and the owner found the two icons on one button untidy. The panel icon now marks
only the buttons whose one job is to move a pane: a view's beside button, which has no label, and
every pane's Hide. Preview names a feature, and its pane's header starts with the same eye. A small
chevron laid over the eye was considered and dropped: at 16px it would be a few pixels of stroke, and
it would be a drawing of ours, which D5 rules out.

**D9. The window's strip ends where it starts, and the unfocused caption's line is the strip's.**
The strip's right padding is less than its left by the difference between a button's padding and a
crumb's, so Preview ends 12px from the edge as the house starts 12px from the other. The Umbraco
theme's unfocused caption drew its bottom line in a 10% tint of the link blue, a strip's height above
the strip's grey line; it is the same grey now.

**D6. Pop out lifts off.** The owner closes the gap the pane left, and the new window travels from
where the pane was to where it opens, both in 250ms. The owner element notes the pane's corner under
the pane's id, which the window keeps (`rememberLift`). The new window, a separate element, picks it
up once on its first update (`takeLift`).

**D7. While the content is popped out, the opener is back, pressed, and closes it.** That is what it
did before. Nothing sits at the window's edge to put a floating window away from, so the opener
returns. Docking has its own button on the floating window. A toggle that sometimes docked and
sometimes could not, because a maximized owner has no room, would be the confusing part.

**D10. A strip button pads its content the same on every side, and a strip pads its two ends the
same.** The owner's rule, after Windows 98's bevel outlined 32 by 22 buttons: the space an icon
leaves above and below it is the space it leaves left and right, so an icon-only button is square,
and a labelled one, Preview or Dock, leaves the same space after its label. The strip, not its
contents, owns the space at its ends: the path strip, the pane header and a floating window's strip
are each padded `path-padding` at both ends, and the first and last thing in them starts there. Hide
and Dock no longer run to the strip's edge.

The padding is worked out in CSS from the strip's inner height, which is the theme's strip height
less whatever border or bevel it draws, so each strip is a size container and a button's padding is
`(100cqh - icon box) / 2` (`components/strip-button.ts`). The icon box is set on the icon itself, at
the 1.125em `uui-icon` draws at, so the sum does not depend on the icon having drawn. That retires
`UMBRADESKTOP_STRIP_BUTTON_WIDTH` and its token. In the default strip, 29px with its 1px line since
D11, the buttons are 28px square; in Windows 98's they are 22px.

**D11. Every strip's content is an even number of pixels tall.** Centred on their capitals, the
Umbraco theme's words sat up to a pixel above the icons beside them on the drawn pixels. Its strip
was 28px with a 1px line, so its content was an odd 27px. The centre fell on a half pixel, an 18px
icon starting on it was drawn rounded down, and the words were snapped the other way. Windows 98's
content is an even 22px, and its words sat level. A second, smaller cause is Lato itself, which draws
its capitals taller than the cap height it declares (10px against 9.31 at 13px).

A half-pixel drop of the words was built first, as a theme token, and measured as well as an even
height did. The owner turned it down: a nudge someone has to remember, where an even height is a
rule a test can hold. Every strip is a pixel taller instead, never shorter, as the owner asked: the
shared default 29px (28 and its line), macOS and Windows 11 the same, Umbraco 4 25px (24 and its
line). Each height is its theme's `*_PATH_CONTENT_HEIGHT` plus its `*_PATH_LINE`, and
`theme/strip-height.test.ts` fails any theme, in any palette, whose content is odd.

Measured live at 1x, 1.25x, 1.5x and 2x on the 29px strip: the words land within half a pixel of the
icons everywhere, level at 1.25x, which at 1x is as close as a 16-row icon and a 9-row word can get.
The house was never the problem: it is as big as the other icons and sits on the same middle.

**D12. In Windows 98 a docked pane's body is a sunken well, as the window's body is.** The window's
content sat in a bevelled well and the pane's beside it did not, so the pane read as pasted on.

## 3. Left for later

- A package that closes its pane through `closeAttached` closes it at once, without the slide. Only
  the window can play it, and it plays it for Hide. A hook on the manager would cover the rest if a
  package ever needs it.
- Only the outermost pane on a side moves. One further in would slide under its neighbour.
- Docking a floating window plays the open slide. There is no reverse lift from the window's spot
  into the pane yet.

## 4. What the live run taught

- **A Win98 strip is a well, and a full-height button covers its bevel.** The bevel is an inset
  shadow painted inside the strip's own box, so buttons that fill the strip painted their faces and
  raised hovers over it. The theme pads its strips by the bevel's depth, top, bottom and at the right
  end where Hide and Dock sit. That left its buttons 18px tall, the smallest of any theme, so the
  owner had the strip raised from 22px to 26px: 22px inside the bevel, the height of Explorer's
  toolbar buttons with small icons, and its icons back at 16px, the era's small icon.
  `WIN98_PATH_HEIGHT` is derived from those two numbers. The strip costs 4px more per window.

- **Read a flex item's width before taking it out of flex.** The slide holds the editor at its width
  by setting `flex: none` and a width. The first build read `offsetWidth` after setting `flex: none`,
  which gave the content section's tree width, 300px, so the editor collapsed to its tree for the
  whole slide. Every component test passed, because their bodies have no width of their own. Two
  tests now hold the editor's width during the slide and while the gap closes.
