---
id: starting-in-the-desktop
title: Starting in the desktop
description: Open the desktop straight away when you sign in, and the two ways out.
sidebar_position: 3
---

# Starting in the desktop

For anyone who works in the desktop, there is no need to walk through the backoffice to reach it.

## Turn it on

1. Open [Desktop settings](desktop-settings.md) and select **General**.
2. Switch on **Open the desktop when I sign in**.

It takes effect the next time the backoffice is opened, not there and then, which is why the panel
says so under the switch. From then on, going to `/umbraco` opens the desktop behind a boot screen,
which stays up until your own desktop is ready: your theme, your wallpaper, and no flash of the
classic backoffice or of somebody else's defaults.

It does not take over links. A bookmark, a notification or a shared URL that points at a document
still opens that document. Only the bare backoffice address changes where it lands.

An [installed app](../site/install-as-an-app.md) always opens on the desktop, whatever this setting
says.

## Two ways out

- **Exit desktop**, in the launcher's footer, returns to the classic backoffice, which stays until
  the tab is closed. Exiting means "not now", so it does not turn the setting off.
- `/umbraco?desktop=off` opens the classic backoffice once, whatever the setting says.

The second one is worth knowing before it is needed. The desktop hides the backoffice header while it
is open, so if a future version ever breaks on your setup, that address is the way back to a normal
backoffice to turn the setting off.

The desktop also skips the startup jump by itself if the last attempt did not finish, so a bad boot
does not repeat.

## In another browser

This one setting behaves slightly differently from the rest. It is stored on your Umbraco account
like your theme and wallpaper, but the decision to open the desktop is made before the backoffice
has asked the server anything. It has to be, or the classic backoffice would flash up while it
waited. So a browser reads its own copy of the setting, and a browser that has never opened the
desktop does not have one yet.

Turn it on at home, and the first sign-in at the office still starts in the classic backoffice. Open
the desktop once there, and every load after that starts in it. Turning it off elsewhere takes effect
on a machine the same way, one load later.
