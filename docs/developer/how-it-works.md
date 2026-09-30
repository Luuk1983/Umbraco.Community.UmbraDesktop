---
id: how-it-works
title: How it works
description: The two kinds of window body, chrome profiles, and where the launcher's apps come from.
sidebar_position: 1
---

# How it works

## Two kinds of window body

A window holds one of two things, and which one it is decides almost everything else about it.

### A backoffice iframe

A backoffice `<iframe>`, deep-linked into the backoffice on the same origin. Every app in the curated
catalogue is one of these. The iframe is not a shortcut: the Umbraco router reads a single global
`window.location` and patches History globally, so only one route tree can own the URL. An iframe has
its own `window`, `location`, History and event bus, which is what makes independent navigation per
window possible without any change to Umbraco core.

Authentication is shared automatically through the existing secure cookies, so each window boots an
authenticated backoffice like an extra tab.

Windows stay fresh through Umbraco's own machinery rather than a custom sync layer: each iframe runs
its own observers and server-events connection, so saving in one window causes the others to refresh
themselves.

### A self-contained app element

A custom element registered by any package. There is no route behind it and no second backoffice to
boot, so none of the above applies and none of it is needed. The element renders in the desktop's
own document and picks up the active theme's colours through ordinary CSS inheritance. The title bar
drops its reload button, since an app has no page to fetch again, and closing the window already does
what restarting it would. Games and small tools are what this kind is for. See
[Building a desktop app](desktop-apps.md).

## How much chrome a window keeps

This applies to iframe windows only. An app element has no backoffice chrome to strip.

A window should not show the entire backoffice shell inside a small frame. Because the iframe is
same-origin, UmbraDesktop injects a stylesheet into it, keyed off stable custom-element tags. Three
profiles decide how much survives:

| Profile | Keeps | Typical use |
|---|---|---|
| `full-section` | Section sidebar and tree, without the top header | Tools where the tree *is* the tool: Content, Media, Document Types |
| `workspace-only` | Just the workspace | Self-contained editors: Log Viewer, Webhooks |
| `bare` | The target view only | Single-focus dashboards: Examine, Health Check, Profiling, Background Jobs |

Every profile also hides the notifications inside the window, once the desktop is listening to that
window's notification context and not before, and the desktop draws them itself. The design and the
reasoning are in
[the notifications design doc](../design/2026-09-27-desktop-notifications-design.md).

## Where the launcher's apps come from

The launcher fills from two sources.

The first, which provides everything that shows out of the box, is a curated catalogue in
`backoffice/src/desktop/catalogue/`. Each entry points at a registered extension by alias, so its URL
is inferred from the registry rather than hardcoded. It carries display detail: name, icon, group,
chrome profile, default and minimum window size, whether several windows are allowed, and sort
weight.

The second is what other packages register for themselves: self-contained apps, and catalogues of
their own that add tiles and groups or replace the desktop's.

### Umbraco's commercial packages

The catalogue covers the eight commercial packages explicitly. Entries resolve against each
package's own registered extensions, so an app appears only on installs that have that package, and
nothing needs configuring either way. What each package gets is listed in
[Commercial packages](../user/apps/commercial-packages.md).

### One app is ours

Almost everything in the catalogue is a window onto something Umbraco or another package already
provides. Background Jobs is the exception: this package ships it, because Umbraco has no view of its
own scheduled jobs anywhere in the backoffice, so there was nothing to point at.

It is registered as an ordinary Settings dashboard, not as something desktop-only, so it is there
whether or not the desktop is used. The catalogue then refers to it by alias like any other entry and
windows it with `bare` chrome. Nothing about reading job state is desktop-specific, so tying it to
the desktop would have been an arbitrary restriction.

### Sections that aren't in the catalogue

Any section a user can reach that no catalogue entry covers still shows up. It is derived
automatically as an uncertified app, with default `full-section` chrome, a generic icon, and a place
in the reserved More group.

Sections listed in `catalogue/exclusions.ts` never appear this way. That list is seeded with
UmbraDesktop's own section, so the desktop cannot be opened inside the desktop.

### Custom and third-party apps

A package that registers a section gets it in the launcher automatically, for users permitted to that
section, in the More group with default chrome and a generic icon. No work is needed.

Beyond that there are two paths. Which one to take depends on what the app points at, not on who
wrote it.

- **A self-contained app.** When the app is its own custom element, with no backoffice route behind
  it, register a `umbraDesktopApp` extension manifest. It gets a launcher tile, a group, a window,
  pinning, a taskbar button and the active theme's colours, and the package never talks to this
  repository. There is nothing to verify here: an element in a box cannot point at the wrong URL or
  pick the wrong chrome profile. This is how games and small tools reach the desktop. See
  [Building a desktop app](desktop-apps.md).
- **Tiles for your own backoffice screens.** When the app is a backoffice page, a section, dashboard
  or workspace the package registers, register a `umbraDesktopCatalogue` manifest with an entry for
  it: a name, an icon, a group, a chrome profile and window sizing, resolved exactly like the
  desktop's own entries. The same manifest can define launcher groups of its own. It ships with the
  package, so nothing waits on a release of this one. If the desktop already has an entry for those
  screens, reuse its alias and the package's entry is used instead, pins included. See
  [Package catalogues](package-catalogues.md).

The desktop's own entry for a third-party package points at its extension by alias rather than by
URL, so it resolves only where that package is registered and stays silently absent everywhere else.
No flag is needed and none exists: any package can unregister any extension, so no entry is ever
guaranteed to resolve. uSync ships this way. Install it and a uSync app appears in the
Synchronisation group, opening its whole workspace without the Settings tree beside it. Not
unconditionally, though, and that is the point of the mechanism: an install that runs uSync in its
own section gates that entry out, and uSync turns up as an ordinary uncertified app in More.
