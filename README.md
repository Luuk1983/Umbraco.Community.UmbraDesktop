![UmbraDesktop](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop

An OS-style windowed desktop for the Umbraco backoffice. Open your tools as real windows and work in several of them side by side.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE)

---

The Umbraco backoffice shows you one thing at a time. One section is active, one workspace fills the screen. That is fine for linear editing, but it fights you the moment two tools are meant to be looked at *together*.

UmbraDesktop turns the backoffice into a desktop. A launcher opens your sections and tools as floating windows you can move, resize and place next to each other: content beside media, or a settings editor beside the thing it affects.

![The UmbraDesktop desktop: the content editor and the media library open as separate windows, side by side, with a taskbar along the bottom.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/desktop-windows.png)

## Features

- Work side by side. Open two or more tools at once and arrange them however you like. Edit on the left, watch the result on the right, without navigating back and forth. This one wants room: see [A note on screen size](#a-note-on-screen-size).
- Real windows. Drag, resize, minimise, maximise, and double-click a title bar to fill the desktop. Each window remembers its own place.
- A launcher that stays out of the way. Apps are grouped into Editing, Development, Synchronisation, Security, Advanced security, Diagnostics and System, so you find things by what they do.
- Pin what you use. Pin your regulars and they sit at the top of the launcher, under Pinned. Your pins are remembered per user.
- A taskbar. Every open window gets a button: click to focus, click again to minimise.
- Choose your wallpaper. Eight backgrounds ship with the package, or pick any image from your own Media Library. The choice is per user.
- Looks like Umbraco. The desktop, launcher and window chrome are built from Umbraco's own design tokens, so it reads as part of the backoffice rather than bolted on.
- Or looks like something else. Pick a theme and the chrome is restyled around the same backoffice. Five ship: Umbraco, Umbraco 4, macOS, Windows 11 and Windows 98. Adding your own is a folder of CSS and one catalogue entry.
- See what Umbraco is doing when you aren't. Background Jobs lists every scheduled job the CMS runs behind your site: publishing, webhooks, cleanups, and any a package added, with how often each runs, when it last ran, how that went and when it is due next. Umbraco shows this nowhere else.
- Nothing new to learn. The windows contain the backoffice you already know, with the same trees, the same editors and the same shortcuts.

## Installation & configuration

### Prerequisites

- Umbraco 17
- .NET 10

### Install

```bash
dotnet add package Umbraco.Community.UmbraDesktop
```

### Grant the Desktop section to a user group

This step is required. Until you do it, nothing appears.

In Settings, open User Groups, pick a group and grant it access to the Desktop section, then have those users sign out and back in.

That single grant does two things: it makes the desktop reachable, and it reveals the launcher in the backoffice header. Users without it see the backoffice exactly as before.

### What each user sees

UmbraDesktop grants no access of its own. Every app in the launcher is gated on the section it comes from, so a user only ever sees apps for sections they could already reach. Give an editor access to Content and Media and those are the apps they get.

## How to use it

Click the desktop icon in the backoffice header, top right, between Help and your avatar. That is the way in. The Desktop section's own tab in the section bar is deliberately hidden, so it does not clutter the list.

![The backoffice header, top right: the desktop icon sits between Help and the user avatar.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/header-entry-point.png)

Most people are probably familiar with the concept of a desktop and will have no trouble using it. The launcher is where you open the apps:

![The launcher: a search box, a Pinned row at the top, and the remaining apps grouped into Editing, Development, Synchronisation, Users &amp; Members, Diagnostics and System.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/launcher.png)

From the launcher:

- Click an app to open it in a window.
- Hover an app and click the pin to add it to Pinned, which sits at the top.
- Drag a title bar to move a window, drag an edge or corner to resize, double-click the title bar to maximise.
- Use the taskbar at the bottom to switch between open windows.
- Choose Exit in the launcher's footer to return to the classic backoffice.
- Open Desktop settings from the cog in the launcher's footer to change your wallpaper.

Several apps can be open at once, and some of them (the content editor and media library, for instance) can be opened more than once, so you can compare two documents side by side.

## A note on screen size

The Umbraco backoffice was never built to be responsive, and it does not scale down gracefully. UmbraDesktop inherits that: the backoffice inside a window starts to break up once the window gets small, which is why catalogue entries carry a minimum window size and why you cannot shrink a window down to a tile.

So how much you get out of it depends on the screen in front of you:

- **On a wide screen**, roughly 1920px and up, two windows side by side are genuinely comfortable. This is where UmbraDesktop is at its best.
- **On a laptop screen**, side by side works for the lighter, self-contained apps, but tree-heavy tools like the content editor want most of the width to themselves. Expect to work with one window in front most of the time.
- **On anything smaller**, treat it as a single-window desktop.

Side by side is not the only reason to use it, though. Opening everything from one launcher, keeping several tools loaded at once, and switching between them from the taskbar without losing your place or waiting for a section to reload is just as useful on a laptop as it is on a 4K monitor.

## Changing the theme

Desktop settings has a Theme section above Wallpaper. Choosing a theme restyles the launcher,
taskbar and window chrome, never the content inside a window, which stays the backoffice you
already know. Five ship today:

- **Umbraco**. The default, built from Umbraco's own design tokens.
- **Umbraco 4**. The 2009 backoffice as desktop chrome: warm grey gradients, hairline panels,
  buttons that press in, and the old Sections panel as the launcher with glossy orbs for your
  pinned apps.
- **macOS**. Traffic lights on the left of each title bar, a floating dock, and a fullscreen
  blurred launcher.
- **Windows 11**. A flush acrylic taskbar with its buttons centred, rounded windows with square
  caption buttons, and Start as a card floating above the bar.
- **Windows 98**. Grey everywhere, double bevels, square corners, a navy title bar, and the
  launcher as a Start menu.

![The macOS theme: the same content editor and media library windows, now with traffic lights at the left of each title bar, rounded corners, and a floating dock centred along the bottom of the screen.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/theme-macos.png)

![The Windows 98 theme: the same two windows with grey frames and navy title bars, a Start menu open on the left listing the whole app catalogue by group, and a taskbar button for each open window.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/theme-win98.png)

Your choice applies immediately and is remembered per user, in that browser. Themes follow the
backoffice's own Light and Dark settings; under High contrast a theme uses its darkest colours,
while window content switches to Umbraco's real high-contrast styling. Umbraco 4 and Windows 98
ship a single palette on purpose: their grey is the design rather than a light-mode choice, so
they look the same under all three settings.

## Changing the wallpaper

Open the launcher and click the cog in its footer to open Desktop settings. The Wallpaper section shows what you are using now, with two ways to change it:

- Built-in images: the eight backgrounds that ship with the package, plus None, which restores the plain gradient.
- Media library: any image already in your Media Library.

Your choice applies immediately and is remembered per user, in that browser.

### Using your own backgrounds

There is nothing to configure and nothing to deploy. Upload the image to the Media Library as you would any other, then pick it under Desktop settings, Media library.

Umbraco resizes it for you: the desktop asks for a copy no wider than 2560px and serves it as WebP, so a large upload never reaches the browser at full size and the resized copy is cached server-side. You do not need to optimise anything first.

If you pick something that is not an image, the desktop tells you and leaves your current wallpaper alone.

## Background Jobs

Umbraco runs a lot behind your site: scheduled publishing, webhook delivery, log and version
cleanups, plus whatever the packages you installed added. It shows you none of it. Background Jobs
is a read-only view of the lot, and it installs as an ordinary Settings dashboard, so you get it
whether or not you use the desktop.

![Background Jobs: the Distributed group listing ten jobs with how often each runs, when it last ran and when it is next due, above the Recurring group with its outcome column.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/background-jobs-viewer.png)

Jobs come in two kinds and the screen keeps them apart, because they can answer different
questions:

- **Distributed** jobs are shared across every server. One server claims each run and the schedule
  lives in the database, so it survives a restart. Umbraco does not record how a run ended, so
  there is no outcome to show for these.
- **Recurring** jobs are run by each server for itself. Umbraco stores nothing about them, so what
  you see has been observed since this server started, and a job that has not come round yet reads
  "Not since restart" rather than "Never". These do carry an outcome: succeeded, failed, or skipped
  because this server's role was not one the job runs on.

Times are shown relative to now, with the exact moment on hover, and the view refreshes itself.
Pick 1, 5 or 10 seconds from the control at the top right. Because the data is a snapshot, a run
due within one refresh reads "Due now" rather than counting past zero: it may already have
happened without this copy of the report knowing yet.

Nothing here can be started, paused or cancelled. It is a viewer.

## Technical explanation

### Windows are iframes

Each window hosts an `<iframe>` deep-linked into the backoffice on the same origin. That matters because the Umbraco router reads a single global `window.location` and patches History globally, so only one route tree can own the URL. An iframe has its own `window`, `location`, History and event bus, which is what makes genuinely independent navigation per window possible without any change to Umbraco core.

Authentication is shared automatically through the existing secure cookies, so each window boots an authenticated backoffice like an extra tab.

Windows stay fresh through Umbraco's own machinery rather than a custom sync layer: each iframe runs its own observers and server-events connection, so saving in one window causes the others to refresh themselves.

### How much chrome a window keeps

A window should not show the entire backoffice shell inside a small frame. Because the iframe is same-origin, UmbraDesktop injects a stylesheet into it, keyed off stable custom-element tags. Three profiles decide how much survives:

| Profile | Keeps | Typical use |
|---|---|---|
| `full-section` | Section sidebar and tree, without the top header | Tools where the tree *is* the tool: Content, Media, Document Types |
| `workspace-only` | Just the workspace | Self-contained editors: Log Viewer, Webhooks |
| `bare` | The target view only | Single-focus dashboards: Examine, Health Check, Profiling, Background Jobs |

### The app catalogue

Which apps appear, and how they present themselves, is defined by a curated catalogue in `backoffice/src/desktop/catalogue/`. Each entry points at a registered extension by alias, so its URL is inferred from the registry rather than hardcoded, and carries display detail: name, icon, group, chrome profile, default and minimum window size, whether multiple instances are allowed, and sort weight.

### One app is ours

Almost everything in the catalogue is a window onto something Umbraco or another package already provides. **Background Jobs** is the exception: the package ships it. Umbraco has no view of its own scheduled jobs anywhere in the backoffice, so there was nothing to point at.

It is registered as an ordinary Settings dashboard, not as something desktop-only, which means you get it whether or not you use the desktop. The catalogue then refs it by alias like any other entry and windows it with `bare` chrome. Nothing about reading job state is desktop-specific, so tying it to the desktop would have been an arbitrary restriction.

### Apps that aren't in the catalogue

Any section a user can reach that no catalogue entry covers still shows up. It is derived automatically as an *uncertified* app, with default `full-section` chrome, a generic icon, and placement in the reserved More group. Nothing is hidden from you just because it hasn't been curated.

Sections listed in `catalogue/exclusions.ts` never appear this way. That list is seeded with UmbraDesktop's own section, so you cannot open the desktop inside the desktop.

### Custom and third-party apps

If your package registers a section, it appears in the launcher automatically for users permitted to that section, in the More group with default chrome and a generic icon. No work required.

Curated placement (a custom icon, a friendly name, a specific group, a different chrome profile or window sizing) needs an entry in `backoffice/src/desktop/catalogue/`. That means opening a pull request against this repository; there is no runtime registration point.

A curated entry for a package that not every install has is marked `optional`. Because it points at the package's own extension by alias, it resolves only where that package is registered, and stays silently absent everywhere else. uSync ships this way: install it and a uSync app appears in the Synchronisation group, opening its dashboard without the Settings tree beside it.

## Documentation

The full design, including the research behind the iframe approach, is in [`docs/design/umbradesktop-design.md`](docs/design/umbradesktop-design.md).

Building a theme of your own is a folder of CSS and one catalogue entry, with no change to the
chrome itself. [`docs/theming.md`](docs/theming.md) is the guide: what a theme folder holds, the
two channels a theme reaches the chrome through, the geometry it has to publish and why that must
be measured rather than typed, the traps that cost real time, worked examples from the five
shipped themes, and a checklist to run before you open a PR. The system behind it is described in
[`docs/design/2026-09-04-theming-system-design.md`](docs/design/2026-09-04-theming-system-design.md).

## License

[MIT](LICENSE)
