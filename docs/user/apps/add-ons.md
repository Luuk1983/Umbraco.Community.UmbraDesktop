---
id: add-ons
title: Add-ons
description: See which add-ons exist for the desktop, whether this site has them, and what to send to whoever builds the site to add one.
sidebar_position: 5
---

# Add-ons

Add-ons are packages that add apps to the desktop, such as games, small tools and media apps. The
**Add-ons** app lists every add-on on the Umbraco Marketplace that runs on this site's version of
Umbraco: the UmbraDesktop team's first, under **From the UmbraDesktop team**, then everyone else's,
under **From the community**.

An add-on cannot be installed from the backoffice. Adding one is a change to the site's code, so it
is a job for whoever builds the site. The app tells you what to send them.

## Open the Add-ons app

To open it, open the launcher and select **Add-ons** in the System group. Or, in
[Desktop settings](../settings/desktop-settings.md), select **Find more add-ons** under **Add-ons**.

Each card shows the add-on's first screenshot, its name, who made it, a short description, and
**Installed** or **Not installed**. To see an add-on's details, select anywhere on its card.

## See an add-on's details

The details page shows the add-on's screenshots with their captions, its description from the
Marketplace under **About**, the version, licence and downloads, and links to its page on the
Marketplace, its documentation and its issue tracker. Links open in a new browser tab. To go back to
the list, select **All add-ons**.

The panel beside the screenshots says where the add-on stands on this site:

- **Not on this site yet**: a line to send to whoever builds the site, such as
  `dotnet add package Umbraco.Community.UmbraDesktop.Entertainment --version 17.4.0`. Select **Copy**
  to copy it. The version is the newest one that runs on this site's version of Umbraco. After they
  deploy it, its apps appear in the launcher.
- **Update available**: the site has an older version than the newest one. The line to send names the
  newer version.
- **Installed**: the site has the newest version. If the add-on brings its own documentation, select
  **Open its guide in Help** to read it in [Help](help.md).

## When the Marketplace can't be reached

The list comes from the Umbraco Marketplace, read by your browser. When the browser can't reach it,
for example on a network without internet access, the app shows the UmbraDesktop team's own add-ons
from a list built into the desktop, and says that community add-ons can't be shown. Their install
line names the version this desktop was released with. To ask the Marketplace again, select
**Try again**.

## Made an add-on?

To get your own add-on listed here, see
[Building and listing an add-on](../../developer/building-an-add-on.md) in the developer guide.
