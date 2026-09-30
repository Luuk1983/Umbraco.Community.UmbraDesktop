---
id: site-name-on-the-desktop
title: Site name on the desktop
description: Write the site's name in a corner of the desktop, so environments can be told apart.
sidebar_position: 2
---

# Site name on the desktop

Local, staging and production otherwise look identical, and a full-screen desktop or an installed
app shows no address bar at all. The site's name, written large in a corner of the desktop, says
which one is on screen. It sits on the wallpaper behind the windows, like the faint Umbraco logo, so
it shows on arrival and a maximised window covers it.

## Turn it on

1. Open [Desktop settings](../settings/desktop-settings.md) and select **Site**.
2. Switch on **Show the name on the desktop**. It is off by default.
3. Optional: choose a **Corner**.
4. Optional: switch on **Show the domain underneath**.

The two options are greyed out until the switch is on.

- **Corner.** **Top right** by default, the one corner nothing else on the desktop uses: new
  windows open top left, the launcher is bottom left, and the clock and the desktop's notifications
  are bottom right. Under macOS notifications arrive at the top right, over the label, and go again.
  The other three corners are there too.
- **Show the domain underneath.** Off by default. Useful full screen or in an installed app, where no
  address bar shows it.

The **Preview** box at the top of the Site screen shows the result on a small copy of your own
desktop, in your theme and over your wallpaper, with the installed app's icon beside it.

## The name

The name is the **App name** from the same screen, the one the
[installed app](install-as-an-app.md) uses, so there is one name to set rather than two. Left empty,
it is the site's name from `Umbraco:CMS:Hosting:SiteName`. If that is not set either, the label shows
the domain instead.

## Who sees it

Everyone on the site sees the label, including editors with no access to the Settings section. Only
users with that access can change it, like everything else under Site.

It is white with a dark edge around the letters, so it reads on any wallpaper, dark or pale,
including your own photos. Each theme draws it in its own lettering: Verdana under Umbraco 4, MS Sans
Serif under Windows 98, and so on.

## Copying databases between environments

Set the name in configuration. The switches, and a name set in the backoffice, live in the database,
so a copy carries them along: copy staging to production and production says Staging. `AppName` in
`appsettings.json` stays with each environment. See
[Set them from configuration instead](install-as-an-app.md#set-them-from-configuration-instead).

The domain line cannot be wrong, because it comes from the browser.
