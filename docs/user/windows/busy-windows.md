---
id: busy-windows
title: Busy windows
description: How a window shows work that is still running, such as an upload, and when the desktop asks before stopping it.
sidebar_position: 6
---

# Busy windows

A window that is still working, such as a Media window uploading files, shows it on its title bar and
on its taskbar button. You can keep working in that window, or in any other, while the work goes on.
A minimised window keeps showing it on its taskbar button.

- **Work with a known size** fills up as it goes. Upload fifty images and the progress shows how many
  are done. Two uploads in one window count as one.
- **Work with no known size** shows as activity, with no percentage.
- **When the work finishes**, the progress disappears, whether the window is open or minimised.
- **When some of the work fails**, the progress stops where it stopped and turns red, and stays until
  you start a new upload in that window or go somewhere else in it. Hover over the taskbar button to
  see how many items failed.

Each theme draws the progress in its own way. The Umbraco theme draws a ring round the window's icon,
and Windows 11 draws its green progress bar under the taskbar icon, for example.

A window can be busy and hold [unsaved changes](unsaved-changes.md) at the same time, and then shows
both.

## Before the work is stopped

Closing a busy window stops its work, so the desktop asks first:

- **Closing the window** asks first, and says what the window is doing.
- **Reloading the window** with its reload button asks first.
- **Going back with the path** asks first.
- **Exit desktop** asks once for the whole desktop, and says how many windows are still busy.

To let the work finish, select **Cancel**. To stop it, select **Stop it**.

A window whose work has failed closes without asking, because nothing in it is still running.

## What the desktop can see

The desktop shows uploads in Media without any change to Umbraco. Apps from other packages can
report their own work too. See [Showing work in progress](../../developer/window-progress.md).
