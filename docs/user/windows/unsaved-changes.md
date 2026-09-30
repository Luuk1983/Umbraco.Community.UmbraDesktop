---
id: unsaved-changes
title: Unsaved changes
description: How a window shows unsaved work, and when the desktop asks before discarding it.
sidebar_position: 3
---

# Unsaved changes

A window holding unsaved changes shows a dot in its title bar. The same dot appears on its taskbar
button, so a minimised window still says so. Saving clears the dot.

The desktop asks before anything throws those changes away, in the same words the backoffice uses
everywhere else:

- **Closing the window** asks first.
- **Reloading the window** with its reload button asks first.
- **Going back with the path** asks first.
- **Exit desktop** asks once for the whole desktop, and says how many windows hold unsaved changes.

If someone else changes the same document while you hold unsaved changes, the window warns about that
too. See [Overwrite protection](overwrite-protection.md).

Unsaved changes do not survive a reload of the page, even when the desktop
[reopens your windows](../settings/reopening-windows.md). Plain Umbraco loses them on a reload too.
