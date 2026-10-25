---
id: installation
title: Installation
description: Install the package, grant the Desktop section, and what each user can then see.
sidebar_position: 1
---

# Installation

## Prerequisites

- Umbraco 18.1 or later
- .NET 10

UmbraDesktop has a release line for each Umbraco major: 18.x for Umbraco 18 and 17.x for Umbraco 17.
This guide is for 18.x.

## Install the package

To install it on Umbraco 18, run:

```bash
dotnet add package Umbraco.Community.UmbraDesktop --version "18.*-*"
```

The `-*` takes a prerelease too, which the first 18.x releases are. Without `--version`, NuGet picks
the newest stable release, which is a 17.x release until 18.x is stable, and the restore then fails
on a version conflict with Umbraco 18.

To install it on Umbraco 17.6 or later instead, run:

```bash
dotnet add package Umbraco.Community.UmbraDesktop --version "17.*"
```

## Upgrade a site from Umbraco 17 to 18

UmbraDesktop moves with the site: everything it keeps (desktop settings, connections, sticky notes,
high scores) comes across unchanged.

1. Empty the media recycle bin first. Umbraco 18 protects files in the media recycle bin, but not the
   files of media that was already in it when you upgraded: those stay publicly reachable, and
   emptying the bin afterwards leaves them on disk. This is an Umbraco issue,
   [umbraco/Umbraco-CMS#24303](https://github.com/umbraco/Umbraco-CMS/issues/24303).
2. Upgrade Umbraco to 18.1 or later the usual way.
3. In the same step, move UmbraDesktop and any of its add-ons to 18.x. The 17.x packages do not
   install on Umbraco 18.

## Grant the Desktop section

This step is required. Until it is done, nothing appears.

1. In the backoffice, go to **Settings** > **User Groups** and open a group.
2. Grant the group access to the **Desktop** section, then save.
3. Ask the users in that group to sign out and back in.

That one grant does two things: it makes the desktop reachable, and it shows the desktop icon in the
backoffice header. Users without it see the backoffice exactly as before.

## What each user sees

UmbraDesktop grants no access of its own. Every app that opens a piece of the backoffice is gated on
the section it comes from, so a user only sees apps for sections they could already reach. An editor
with access to Content and Media gets exactly those apps.

The exception is a self-contained app registered by a package, such as the games and umbraCoffee
from the Entertainment add-on. It has no section behind it, so it is gated by nothing beyond
its own manifest conditions and access to the desktop itself: everyone who can open the desktop can
open it. An app of that kind holds no backoffice data, so there is nothing behind it to leak. To
restrict one, put the condition on its own manifest.

## Next

[First steps](first-steps.md) shows how to open the desktop and find your way around.
