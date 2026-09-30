---
id: screen-size
title: Screen size
description: How much room the desktop needs, and what to expect on smaller screens.
sidebar_position: 3
---

# Screen size

The Umbraco backoffice was never built to be responsive, and it does not scale down gracefully.
UmbraDesktop inherits that: the backoffice inside a window starts to break up once the window gets
small. That is why every window has a minimum size, and why a window cannot be shrunk to a tile. A
catalogue entry can raise that minimum for an app that needs more, and a few do, but the global
minimum is what applies most of the time.

How much the desktop gives depends on the screen:

- **On a wide screen**, roughly 1920px and up, two windows side by side are comfortable. This is
  where the desktop is at its best.
- **On a laptop screen**, side by side works for the lighter, self-contained apps, but tree-heavy
  tools like the Content editor want most of the width. Expect to work with one window in front most
  of the time.
- **On anything smaller**, treat it as a single-window desktop.

[Snapping](../windows/snapping.md) respects the same minimum. If half the desktop is narrower than a
window is allowed to be, the window snaps to its own minimum instead. On a narrow screen that means
the two halves overlap in the middle rather than one being squeezed too small to use. Selecting
either window brings it to the front, so an overlap costs a little of the window behind and nothing
else.

Side by side is not the only reason to use it. Opening everything from one launcher, keeping several
tools loaded at once, and switching between them from the taskbar without losing your place or
waiting for a section to reload works as well on a laptop as on a 4K monitor.
