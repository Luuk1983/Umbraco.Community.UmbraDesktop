---
id: using-the-taskbar
title: Using the taskbar
description: Window buttons, and the fixed row of full screen, AI chat and pinned apps.
sidebar_position: 1
---

# Using the taskbar

The taskbar has two halves. Beside the launcher button is a fixed row that launches things. After it
come the buttons for the open windows, which switch between them.

## Switch between windows

Every open window gets a button on the taskbar.

- To bring a window to the front, select its button.
- To minimise the window in front, select its button again.

A preview popped out of a document gets its own button, in one box with its document's button. See
[Live preview](../windows/live-preview.md).

## The fixed row

The launcher is the right way in for thirty-five apps, and the wrong way in for the one or two used
all day, where every launch is two clicks and a scan. So the taskbar carries a fixed row directly
after the launcher button, before the window buttons. Three things sit in it, in this order:

- **Full screen** takes the desktop full screen, as F11 does, and brings it back. Its arrows turn
  inward while the desktop is full screen, and it notices when Esc is used to leave instead. If the
  browser was put in full screen with its own key, such as F11, the button greys out and its tooltip
  names the key that gets back, because no web page can leave the browser's own full screen.
- **AI chat** opens the Copilot Workspace. It shows when Umbraco AI is installed and you can reach
  it, and is simply absent otherwise. See [Umbraco AI](../apps/umbraco-ai.md).
- **Pinned apps** are your pins as icon-only buttons, in the order the launcher shows them.

Full screen comes first because every install has it. Pinned apps come last because they are the one
part that grows and shrinks, so pinning something never moves another button.

### Turn a part of the row on or off

All three are on to begin with.

1. Open [Desktop settings](../settings/desktop-settings.md) and select **Taskbar**.
2. Switch **Full screen**, **AI chat** or **Pinned apps** on or off.

Switching one off closes its space and moves nothing else. The order is fixed, so a button whose
place you have learned stays there.

A part can be switched on and still show nothing. That is normal: Pinned apps before anything is
pinned, or AI chat on a site without the AI package. Desktop settings still lists them, with the
switch disabled and the reason given, because settings is where to find out what the desktop can
do.

### Pin in the launcher

Nothing on the taskbar pins, unpins or reorders anything. To pin an app, drag its tile onto
**Pinned** in the launcher, or choose Pinned from the tile's **Move to** in Arrange. See
[Arranging the launcher](../launcher/arranging-the-launcher.md). The row draws that same list in a
second place, so there is only one list.

### The row launches, it does not switch

A button in the row does exactly what the app's tile in the launcher does, a second click included:
an app that allows several windows opens another one, and the Copilot Workspace, which does not,
comes to the front instead. Switching between the windows already open is the job of the window
buttons. That is why nothing in the row needs a running indicator, a modifier click or a right-click
menu.

## Under each theme

The row works under all five themes, in each theme's own button style. It is not a system tray: it
sits on the launching half of the bar. Everything in it opens something, apart from full screen,
which is there because it is a control rather than an icon that reports on something.

Three of the themes need nothing else to keep the row and the open windows apart, because a window
button carries its window's title and a row button never does. The two that show icons without
labels, macOS and Windows 11, put a separator between the two groups. Windows 11 also marks each open
window with a small bar under its icon, grey for open and its blue accent for the one in front. So on
those themes a bare icon launches something and a marked one is already open.
