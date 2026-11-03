---
id: building-an-add-on
title: Building and listing an add-on
description: What an add-on is, what to put in it, and how to get it listed in the desktop's Add-ons app through the Umbraco Marketplace.
sidebar_position: 9.5
---

# Building and listing an add-on

An add-on is a NuGet package that adds to the desktop: apps, launcher tiles, settings, documentation.
The desktop's [Add-ons app](../user/apps/add-ons.md) lists every add-on on the Umbraco Marketplace
that is tagged `umbradesktop`, so getting yours listed takes a Marketplace listing and that tag, and
no change to this repository.

## What goes in the package

An add-on is an ordinary Umbraco package with an `umbraco-package.json`. What it registers is up to
you, and each part has its own page:

- Apps of your own: [Building a desktop app](desktop-apps.md).
- Tiles for your package's backoffice screens: [Package catalogues](package-catalogues.md).
- Settings in Desktop settings: [Package settings](package-settings.md).
- Documentation in Help: [Help for your add-on](add-on-help.md).

Give the `umbraco-package.json` an `id`, the NuGet package id, and a `version`. The Add-ons app reads
both from Umbraco's own list of installed packages to tell **Installed** from **Not installed**, and
to offer an update when the site has an older version than the newest one for its Umbraco. Without
an `id`, the app cannot tell your add-on is installed.

```json
{
  "id": "My.Company.UmbraDesktop.Kanban",
  "name": "Kanban for UmbraDesktop",
  "version": "1.2.0",
  "extensions": []
}
```

For **Open its guide in Help**, give your docs' `product.json` the same `packageId`. See
[Help for your add-on](add-on-help.md).

## List it on the Umbraco Marketplace

The Marketplace lists a NuGet package that carries the `umbraco-marketplace` NuGet tag and depends on
Umbraco. Umbraco's own guide,
[Listing your package](https://docs.umbraco.com/umbraco-dxp/marketplace/listing-your-package), has
the rest. Then, in the package's `umbraco-marketplace.json`:

1. To get it into the Add-ons app, add `umbradesktop` to `Tags`.
2. To choose its cover, put the screenshot you want on the card first in `Screenshots`.
3. Optional: to fill the links on its details page, set `DocumentationUrl` and `IssueTrackerUrl`.

```json
{
  "$schema": "https://marketplace.umbraco.com/umbraco-marketplace-schema.json",
  "Tags": ["umbradesktop", "kanban", "tasks"],
  "Screenshots": [
    { "ImageUrl": "https://example.com/kanban-board.png", "Caption": "The board in a window of its own." },
    { "ImageUrl": "https://example.com/kanban-card.png", "Caption": "A card open beside it." }
  ],
  "DocumentationUrl": "https://example.com/docs",
  "IssueTrackerUrl": "https://github.com/example/kanban/issues"
}
```

The tag has to be in `umbraco-marketplace.json`. The Marketplace takes a package's tags from that
file only, never from the NuGet package's own tags: a package without the file has no tags on the
Marketplace at all.

The Marketplace looks for new packages once a day and refreshes the ones it knows every two hours,
so a new add-on appears in the Add-ons app within a day, and a change to its listing within a few
hours.

## How the Add-ons app shows it

- **The card.** The cover is the first screenshot, filled into a 16:9 frame from the top, so the top
  of the picture is what shows. Without screenshots, the cover is the package icon on its most common
  colour, which the Marketplace works out from the icon. Below the cover are the icon, the title, the
  NuGet authors and the description.
- **The details page.** All the screenshots with their captions, in your order, and the README, as
  the Marketplace renders it. The README is cleaned first: scripts, styles, forms and frames are
  removed, links open in a new tab, and only `https` images and links are kept.
- **Which add-ons.** Only those that run on the site's Umbraco major, from the Marketplace's version
  table for the package. The install line names the newest package version for that major.
- **Which section.** Packages whose id starts with `Umbraco.Community.UmbraDesktop.` are the
  UmbraDesktop team's, under **From the UmbraDesktop team**. Every other add-on is under **From the
  community**, sorted by title.

The app never shows an add-on anywhere but in itself: no launcher tiles, badges or prompts for
add-ons a site does not have.
