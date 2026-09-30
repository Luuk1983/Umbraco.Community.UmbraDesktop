---
id: settings-on-your-account
title: Settings on your account
description: Your desktop settings follow you to any browser, and the one-time move from older versions.
sidebar_position: 2
---

# Settings on your account

Your wallpaper, theme, pinned apps, taskbar switches and language preferences are stored on your
Umbraco user account, not in the browser they were set in. Signing in from another machine, another
browser or a private window gives you the desktop you built. Clearing site data does not lose it.

There is nothing to configure and no permission to grant. The settings live in Umbraco's own
per-user storage, and a user can only read and write their own.

Two things are kept in the browser instead:

- The layout of your open windows. See [Reopening windows](reopening-windows.md).
- A copy of **Open the desktop when I sign in**, which the browser needs before it can ask the server
  anything. See [Starting in the desktop](starting-in-the-desktop.md#in-another-browser).

## Moving settings from an older version

Before settings were stored on the account, they lived in the browser. They move onto your account
the first time the desktop is opened after updating, and only that once. A screen comes up over the
desktop while it happens, **Setting up your desktop**, and when it is finished it waits to be closed
rather than disappearing on a timer. A new user never sees it, because there is nothing to move.

Nothing is deleted. The browser keeps a copy, which from then on is a cache of what is on the
account rather than the original, so rolling the package back still finds settings it understands.
Settings this version cannot read are left untouched rather than moved, so a desktop set up in a
newer version is never overwritten by an older one.

If the move fails, nothing is lost: the settings stay in the browser and the desktop tries again at
the next sign-in.

## Cases worth knowing

- **Two browsers set up before updating.** Whichever one is opened first wins. The other adopts what
  is by then on the account.
- **The server cannot be reached.** The desktop still opens, using what this browser remembers.
  Changes made in that state apply for the rest of the session and are then forgotten, and the
  desktop says when a setting could not be saved.
- **Open the desktop when I sign in** is the one setting a browser does not pick up straight away.
  See [Starting in the desktop](starting-in-the-desktop.md#in-another-browser).
