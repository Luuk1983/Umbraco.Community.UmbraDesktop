---
id: overwrite-protection
title: Overwrite protection
description: What the desktop does when someone else saves or deletes a document you have open.
sidebar_position: 4
---

# Overwrite protection

Open a page in two browsers, edit both, save both, and in a plain Umbraco backoffice the second save
wins silently: nobody is told, and the first person's work is gone with no trace in the UI. Umbraco
broadcasts the change over SignalR, and the backoffice uses that only to drop its cached copy.

UmbraDesktop listens to the same signal and tells you.

![Three windows stacked on the desktop, each in a different state of the guard: one marked with a dot for unsaved changes, one showing the warning that someone else changed the same item with the choice to keep your version or load theirs, and one showing the error that it has been moved to the recycle bin. The taskbar below carries the matching marker on every button.](../../screenshots/unsaved-changes-guard.png)

## When someone else saves

- **With no unsaved changes**, the window refreshes itself in place and keeps the scroll position,
  the tab that was open and any split view.
- **With unsaved changes**, the window raises a banner in its own chrome, **Someone else changed
  this while you were editing it**, and marks its title bar and its taskbar button with a warning
  icon. So the warning reaches you even on a window minimised an hour ago.

The icon is the one Umbraco uses elsewhere, a warning triangle or a circle-x rather than a coloured
dot, so the severity survives a monochrome screen.

The banner offers two choices:

- To keep your version, select **Keep my changes** and confirm. Saving then replaces the other
  person's change, and the window keeps warning until you save or discard.
- To take their version, select **Discard mine, load theirs**. Your unsaved changes are lost.

The desktop knows the difference between somebody else's save and your own, including your own
publishes, so your own saves never raise the warning.

The warning also appears in every dialog that could throw work away, such as closing the window or
leaving the desktop.

## When someone moves it to the recycle bin

The window says **Someone moved this to the recycle bin**. Items in the recycle bin are read-only, so
the window stops accepting changes as soon as it catches up with the move. Copy anything you need
before then.

This warning appears even without unsaved changes, because there is no longer an editable version to
refresh to.

## When someone deletes it for good

The window says **This no longer exists**. There is nothing left to save to, so any unsaved changes
cannot be saved. Copy anything you need before closing the window.

## Umbraco AI

From Umbraco AI 17.4 the agent writes on the server, so it can change a document you have open. This
protection covers the agent exactly as it covers a colleague. See [Umbraco AI](../apps/umbraco-ai.md).

## Themes

Every theme shows these warnings in its own style, and no theme is allowed to remove them.
