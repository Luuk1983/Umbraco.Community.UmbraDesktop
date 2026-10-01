---
id: installation
title: Installation
description: Install the package, grant the Desktop section, and what each user can then see.
sidebar_position: 1
---

# Installation

## Prerequisites

- Umbraco 17
- .NET 10

## Install the package

```bash
dotnet add package Umbraco.Community.UmbraDesktop
```

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

The exception is a self-contained app registered by a package, such as the Minesweeper and Snake
games from the Entertainment add-on. It has no section behind it, so it is gated by nothing beyond
its own manifest conditions and access to the desktop itself: everyone who can open the desktop can
open it. An app of that kind holds no backoffice data, so there is nothing behind it to leak. To
restrict one, put the condition on its own manifest.

## Next

[First steps](first-steps.md) shows how to open the desktop and find your way around.
