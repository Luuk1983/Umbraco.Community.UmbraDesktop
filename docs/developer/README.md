---
id: developer-guide
title: Developer guide
description: How the desktop works, and how to extend it with apps, themes and catalogues.
sidebar_position: 2
---

# Developer guide

How the desktop works, and how to extend it from your own package without a change to this one. For
using the desktop, see the [user guide](../user/README.md).

- [How it works](how-it-works.md): the two kinds of window body, how much backoffice chrome a window
  keeps, and where the launcher's apps come from.
- [Adding a theme](theming.md): what a theme folder holds, the two channels a theme reaches the chrome
  through, the geometry it has to publish and why that must be measured rather than typed, worked
  examples from the five shipped themes, and a checklist to run before opening a pull request.
- [Building a desktop app](desktop-apps.md): the `umbraDesktopApp` manifest, every form its `element`
  may take with a worked static `umbraco-package.json`, the custom properties an app paints itself
  with and the fallback each needs, how to branch per theme, what the desktop does to your element
  over its lifetime, and the traps that cost real time.
- [Package catalogues](package-catalogues.md): give your package's own backoffice screens proper
  tiles and launcher groups with a `umbraDesktopCatalogue` manifest, the desktop's published group
  weights, replacing one of its tiles, and what the console tells you.
- [Attached windows](attached-windows.md): show something beside a document window, the way the live
  preview does. When to use it and when not, how to open one, what your element must do, and what the
  desktop already handles.
- [Writing documentation](writing-documentation.md): how these docs are structured, the front
  matter and Markdown every page uses, and the writing style.

## Design documents

The reasoning behind each feature is in a dated design document in
[`docs/design/`](../design/). They are not part of the published docs, but they explain why things
are shaped the way they are. The ones the guides above rest on:

| Topic | Design document |
| --- | --- |
| The desktop as a whole, and the research behind the iframe approach | [umbradesktop-design.md](../design/umbradesktop-design.md) |
| Themes | [2026-09-04-theming-system-design.md](../design/2026-09-04-theming-system-design.md) |
| Desktop apps | [2026-09-06-desktop-apps-design.md](../design/2026-09-06-desktop-apps-design.md) |
| Package catalogues | [2026-09-25-package-catalogues-design.md](../design/2026-09-25-package-catalogues-design.md) |
| Attached windows | [2026-09-27-attached-windows-design.md](../design/2026-09-27-attached-windows-design.md) |
| Notifications | [2026-09-27-desktop-notifications-design.md](../design/2026-09-27-desktop-notifications-design.md) |
| Installing the backoffice as an app, the browser behaviour it depends on, and the fixture that proves it | [2026-09-13-web-app-manifest-design.md](../design/2026-09-13-web-app-manifest-design.md) |
| The site name on the desktop: why a watermark in a corner, why the App name, why the domain comes from the browser | [2026-09-27-desktop-label-design.md](../design/2026-09-27-desktop-label-design.md) |
| Remote content: how it redirects a backoffice, keeps it read-only, and what that cannot reach | [2026-09-29-remote-content-viewer-design.md](../design/2026-09-29-remote-content-viewer-design.md) |
