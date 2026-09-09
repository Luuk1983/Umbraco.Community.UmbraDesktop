![UmbraDesktop](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop

An OS-style windowed desktop for the Umbraco backoffice. Open your tools as real windows and work in several of them side by side.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE)

---

The Umbraco backoffice shows you one thing at a time. One section is active, one workspace fills the screen. That is fine for linear editing, but it fights you the moment two tools are meant to be looked at *together*.

UmbraDesktop turns the backoffice into a desktop. A launcher opens your sections and tools as floating windows you can move, resize and place next to each other: content beside media, or a settings editor beside the thing it affects.

It also does something the backoffice does not do at all. When two people have the same page open, plain Umbraco lets the second save win silently: nobody is told, and the first person's work is gone. UmbraDesktop warns you before you overwrite someone, and it does it on the window, on its taskbar button and in every dialog that could throw work away. See [Overwrite protection](#overwrite-protection).

![The UmbraDesktop desktop: the content editor and the media library open as separate windows, side by side, with a taskbar along the bottom.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/desktop-windows.png)

> **New: games on the desktop.** [`Umbraco.Community.UmbraDesktop.Entertainment`](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Entertainment)
> is an optional add-on that puts Minesweeper in the launcher's Games group, in a window of its own
> and themed along with everything else. Install it if you want it; the desktop is unchanged
> without it. See [Games](#games).

## Features

- Work side by side. Open two or more tools at once and arrange them however you like. Edit on the left, watch the result on the right, without navigating back and forth. This one wants room: see [A note on screen size](#a-note-on-screen-size).
- Real windows. Drag, resize, minimise, maximise, and double-click a title bar to fill the desktop. Each window remembers its own place.
- Always says where you are. A window that holds a whole section carries a path under its title bar, Media library / Campaigns / hero.jpg, and every step of the way back is one click. In the plain backoffice you climb back out of a tree by clicking the section name in the header, and a window has no header, so this is where that goes.
- Never loses your work. A window holding unsaved changes shows a dot in its title bar and on its taskbar button, and closing it, reloading it or leaving the desktop asks first, in the same words the backoffice uses everywhere else. Leaving the desktop asks once and says how many windows are unsaved.
- Warns before you overwrite someone. If somebody else saves or bins a document while you have it open with unsaved changes, the window says so, in its own chrome, on its taskbar button and in every dialog that could throw your work away. Deletion is warned about even when you have nothing unsaved, because there is no version left to refresh to. The plain backoffice does not warn about this at all.
- A launcher that stays out of the way. Apps are grouped into Editing, Workflow, Marketing and sales, Development, Synchronisation, Security, Advanced security, Diagnostics, Automation, AI and System, so you find things by what they do, plus Games once a package puts an app there. Empty groups never show.
- Knows the commercial packages. Forms, Deploy, Workflow, Commerce, Engage, UI Builder, Automate and Umbraco AI each get proper apps with the right name, icon, group and window chrome, instead of a generic tile in More. Nothing to configure: an app appears only if you have that package.
- Pin what you use. Pin your regulars and they sit at the top of the launcher, under Pinned. Your pins are remembered per user, in that browser.
- A taskbar. Every open window gets a button: click to focus, click again to minimise.
- Choose your wallpaper. Eight backgrounds ship with the package, or pick any image from your own Media Library. The choice is per user, in that browser.
- Start in the desktop. Turn on one setting and opening the backoffice takes you straight to the desktop, behind a boot screen rather than a flash of the classic interface. A link straight to a document still opens that document, and Exit still gets you out. Per user, in that browser. See [Starting in the desktop](#starting-in-the-desktop).
- Looks like Umbraco. The desktop, launcher and window chrome are built from Umbraco's own design tokens, so it reads as part of the backoffice rather than bolted on.
- Or looks like something else. Pick a theme and the chrome is restyled around the same backoffice. Five ship: Umbraco, Umbraco 4, macOS, Windows 11 and Windows 98. Adding your own is a folder of CSS and one catalogue entry.
- Room for apps that are not the backoffice. Any package can register a self-contained app: its own element in a window, with no section and no URL behind it, themed along with the rest of the desktop so it looks native under whichever theme you picked. That is how games and small tools reach the desktop, and it takes no change to this package. See [Custom and third-party apps](#custom-and-third-party-apps).
- Games, if you want them. The optional Entertainment add-on above is the first thing to use that app seam, and it uses no other route in, so its source is the worked example for putting an app of your own on the desktop. See [Games](#games).
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

UmbraDesktop grants no access of its own. Every app that opens a piece of the backoffice is gated on the section it comes from, so a user only ever sees apps for sections they could already reach. Give an editor access to Content and Media and those are the apps they get.

The exception is a self-contained app registered by a package, which has no backing section to be permitted to and so is gated by nothing beyond its own manifest conditions and reaching the desktop at all. Minesweeper is one: everyone who can open the desktop can open it. An app of that kind holds no backoffice data, so there is nothing behind it to leak; if you need one restricted, the condition belongs on its own manifest.

## How to use it

Click the desktop icon in the backoffice header, top right, between Help and your avatar. That is the way in. The Desktop section's own tab in the section bar is deliberately hidden, so it does not clutter the list.

![The backoffice header, top right: the desktop icon sits between Help and the user avatar.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/header-entry-point.png)

Most people are probably familiar with the concept of a desktop and will have no trouble using it. The launcher is where you open the apps:

![The launcher: a search box, a Pinned row at the top, and the remaining apps grouped into Editing, Workflow, Marketing and sales, Development, Synchronisation, Security, Advanced security, Diagnostics, Automation, AI, System and Games.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/launcher.png)

From the launcher:

- Click an app to open it in a window.
- Hover an app and click the pin to add it to Pinned, which sits at the top.
- Drag a title bar to move a window, drag an edge or corner to resize, double-click the title bar to maximise.
- Use the taskbar at the bottom to switch between open windows.
- The path under a section window's title bar says where that window is. Click any step to go back to it; the first step returns the window to whatever it opened at. If the window has unsaved changes it asks before leaving, the same way closing it does.
- A dot in a title bar means that window has unsaved changes, and the same dot appears on its taskbar button so a minimised window still says so. Closing or reloading it asks before discarding them; saving clears the dot.
- Choose Exit in the launcher's footer to return to the classic backoffice. If you start in the desktop, exiting keeps you in the classic backoffice until you close the tab.
- Open Desktop settings from the cog in the launcher's footer, as a panel from the right, to change your theme or wallpaper or to start in the desktop. The desktop stays in view behind the panel, so you can see a change as you make it.

Several apps can be open at once, and some of them (the content editor and media library, for instance) can be opened more than once, so you can compare two documents side by side.

## A note on screen size

The Umbraco backoffice was never built to be responsive, and it does not scale down gracefully. UmbraDesktop inherits that: the backoffice inside a window starts to break up once the window gets small, which is why every window has a floor below which it will not shrink, and why you cannot pull one down to a tile. A catalogue entry can raise that floor for an app that needs more, and a few do, but the global minimum is what you meet most of the time.

So how much you get out of it depends on the screen in front of you:

- **On a wide screen**, roughly 1920px and up, two windows side by side are genuinely comfortable. This is where UmbraDesktop is at its best.
- **On a laptop screen**, side by side works for the lighter, self-contained apps, but tree-heavy tools like the content editor want most of the width to themselves. Expect to work with one window in front most of the time.
- **On anything smaller**, treat it as a single-window desktop.

Side by side is not the only reason to use it, though. Opening everything from one launcher, keeping several tools loaded at once, and switching between them from the taskbar without losing your place or waiting for a section to reload is just as useful on a laptop as it is on a 4K monitor.

## Overwrite protection

Open a page in two browsers, edit both, save both, and in a plain Umbraco backoffice the second
save wins silently: nobody is told and the first person's work is gone with no trace in the UI.
Umbraco broadcasts the change over SignalR and the backoffice uses that only to drop its cached
copy.

UmbraDesktop listens to the same signal and tells you. A window whose document changed while you
were reading it refreshes itself in place, keeping your scroll position, the tab you were on and
any split view. A window whose document changed while you had *unsaved changes* raises a banner in
its own chrome and marks both its titlebar and its taskbar button with a warning icon, so it reaches
you on a window you had minimized an hour ago. The icon is the same one Umbraco uses elsewhere, and
it is a warning triangle or a circle-x rather than a coloured dot, so the severity survives a
monochrome screen. You can keep your version, after confirming that saving loses the other person's
change, or load theirs and lose yours.

![Three content editor windows stacked on the desktop: one marked with a dot for unsaved changes, one showing the warning banner "Someone else changed this while you were editing it" with Keep my changes and Discard mine, load theirs, and one showing the error banner "Someone moved this to the recycle bin". The taskbar below carries the matching marker on all three buttons.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/unsaved-changes-guard.png)

It knows the difference between somebody else's save and your own, including your own publishes,
and it says something different when a document has been moved to the recycle bin, where the
window turns read-only the moment it catches up with that, than when it has been deleted for good,
where there is nothing left to save to.

Every theme carries it in its own idiom, and no theme is allowed to remove it.

## Background Jobs

Umbraco runs a lot behind your site: scheduled publishing, webhook delivery, log and version
cleanups, plus whatever the packages you installed added. It shows you none of it. Background Jobs
is a read-only view of the lot, and it installs as an ordinary Settings dashboard, so you get it
whether or not you use the desktop.

![Background Jobs, open in a desktop window: the Distributed group listing fifteen jobs with how often each runs, when it last ran and when it is next due, and the control that sets how often the view refreshes itself.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/background-jobs-viewer.png)

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

![Desktop settings open over the desktop: a Theme section showing the themes as named colour swatches with Umbraco selected, above a Wallpaper section with the current image and buttons for Built-in images and Media library. The Choose a wallpaper tray is open beside it, listing the eight built-in backgrounds by name alongside None, which restores the plain gradient.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/choose-background.png)

Your choice applies immediately and is remembered per user, in that browser.

### Using your own backgrounds

There is nothing to configure and nothing to deploy. Upload the image to the Media Library as you would any other, then pick it under Desktop settings, Media library.

Umbraco resizes it for you: the desktop asks for a copy with no side longer than 2560px, so a large upload never reaches the browser at full size and the resized copy is cached server-side. You do not need to optimise anything first.

If you pick something that is not an image, the desktop tells you and leaves your current wallpaper alone.

## Starting in the desktop

If the desktop is where you work, you should not have to walk through the backoffice to reach it. Open Desktop settings, Startup, and turn on "Open the desktop when I sign in".

It takes effect the next time you open the backoffice rather than there and then, which is why the panel says so under the toggle. From then on, going to `/umbraco` opens the desktop, behind a boot screen that stays up until your own desktop is ready — your theme, your wallpaper, no flash of the classic interface and no flash of somebody else's defaults.

What it deliberately does not do is take over your links. A bookmark, a notification or a shared URL that points at a document still opens that document. Only the bare backoffice address changes where it lands.

Two ways out:

- Exit in the launcher's footer returns you to the classic backoffice, and you stay there until you close the tab. Exiting means "not now", so it does not turn the setting off.
- `/umbraco?desktop=off` opens the classic backoffice once, whatever the setting says.

That second one is worth knowing before you need it. The desktop hides the backoffice header while it is open, so if a future version of the desktop ever breaks on your setup, that address is how you get back to a normal backoffice and turn the setting off. The desktop also skips the startup jump by itself if the last attempt did not finish, so a bad boot does not repeat.

The setting is stored per user, in that browser, alongside your theme and wallpaper. Signing in on another machine starts in the classic backoffice until you turn it on there too.

## Games

Minesweeper, in a window, under whichever theme you picked. It ships in its own package rather than this one, because a desktop and a minesweeper are not the same product and nobody should have to take the second to get the first:

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Entertainment
```

![Minesweeper open in its own window on the UmbraDesktop desktop under the Windows 98 theme, with the launcher's Games group highlighted in the Start menu and the game's own taskbar button below.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/entertainment-games-minesweeper.png)

That is the whole installation. There is no section to grant and no dashboard to enable: the games appear in a Games group in the launcher for anyone who can already reach the desktop, and the group is not there at all if the package is not installed.

The add-on is released from the same tag as this package and always carries the same version number, so matching versions are the compatibility answer. Its dependency on the desktop is a version range rather than an exact pin, so upgrading the desktop on its own is fine.

Nothing in that package is privileged. It reaches the desktop through the same public `umbraDesktopApp` manifest any package can register, which makes its source the worked example for [Custom and third-party apps](#custom-and-third-party-apps).

## Technical explanation

### Two kinds of window body

A window holds one of two things, and which one it is decides almost everything else about it.

**A backoffice `<iframe>`**, deep-linked into the backoffice on the same origin. Every app in the curated catalogue is one of these. The iframe is not a shortcut: the Umbraco router reads a single global `window.location` and patches History globally, so only one route tree can own the URL. An iframe has its own `window`, `location`, History and event bus, which is what makes genuinely independent navigation per window possible without any change to Umbraco core.

Authentication is shared automatically through the existing secure cookies, so each window boots an authenticated backoffice like an extra tab.

Windows stay fresh through Umbraco's own machinery rather than a custom sync layer: each iframe runs its own observers and server-events connection, so saving in one window causes the others to refresh themselves.

**A self-contained app element**, registered by any package. There is no route behind it and no second backoffice to boot, so none of the above applies and none of it is needed: the element renders in the desktop's own document, picks up the active theme's colours through ordinary CSS inheritance, and the titlebar drops its reload button, since an app has no page to re-fetch and closing the window already does what restarting it would. Games and small tools are what this kind is for. See [Custom and third-party apps](#custom-and-third-party-apps).

### How much chrome a window keeps

This applies to iframe windows only. An app element has no backoffice chrome to strip, so there is nothing to decide.

A window should not show the entire backoffice shell inside a small frame. Because the iframe is same-origin, UmbraDesktop injects a stylesheet into it, keyed off stable custom-element tags. Three profiles decide how much survives:

| Profile | Keeps | Typical use |
|---|---|---|
| `full-section` | Section sidebar and tree, without the top header | Tools where the tree *is* the tool: Content, Media, Document Types |
| `workspace-only` | Just the workspace | Self-contained editors: Log Viewer, Webhooks |
| `bare` | The target view only | Single-focus dashboards: Examine, Health Check, Profiling, Background Jobs |

### The app catalogue

The launcher fills from two sources. The first, and the one that provides everything you see out of the box, is a curated catalogue in `backoffice/src/desktop/catalogue/`. Each entry points at a registered extension by alias, so its URL is inferred from the registry rather than hardcoded, and carries display detail: name, icon, group, chrome profile, default and minimum window size, whether multiple instances are allowed, and sort weight.

The second is apps other packages register for themselves, covered below.

### Umbraco's commercial packages

The catalogue covers the eight commercial packages explicitly, so each opens as a proper app rather
than a generic tile. Entries resolve against the package's own registered extensions, so an app
appears only on installs that have that package, and nothing needs configuring either way.

| Package | What you get | Where it lands |
| --- | --- | --- |
| Umbraco Forms | The Forms section | Editing |
| Umbraco Workflow | The Workflow section, plus Workflow tasks, Workflow search and Release sets as their own windows | Workflow |
| Umbraco Deploy | Deploy and Deploy environments on v17; Deploy status, schema and configuration on v18 | Synchronisation |
| Umbraco Commerce | The Commerce section | Marketing and sales |
| Umbraco Engage | The Engage section, and Engage configuration | Marketing and sales, System |
| Umbraco UI Builder | The UI Builder settings workspace | Development |
| Umbraco Automate | The Automate section | Automation |
| Umbraco AI | The AI section | AI |

Most of these are a single app on purpose. Commerce, Engage and UI Builder navigate internally in
ways that have no stable link to point a tile at — Commerce scopes everything to a store, Engage
uses its own screen system, UI Builder generates its sections from your configuration at runtime —
so the section opens with its own sidebar and does the navigating, which is what you want anyway.

UI Builder's generated sections still appear on their own, in More, as any unrecognised section does.

Two Workflow apps only show when they apply to you: Workflow search and Release sets both check your
Workflow permissions, and Release sets also checks whether the feature is switched on. Rather than
give you a tile that opens an empty window, the desktop asks first.
### One app is ours

Almost everything in the catalogue is a window onto something Umbraco or another package already provides. **Background Jobs** is the exception: the package ships it. Umbraco has no view of its own scheduled jobs anywhere in the backoffice, so there was nothing to point at.

It is registered as an ordinary Settings dashboard, not as something desktop-only, which means you get it whether or not you use the desktop. The catalogue then refs it by alias like any other entry and windows it with `bare` chrome. Nothing about reading job state is desktop-specific, so tying it to the desktop would have been an arbitrary restriction.

### Apps that aren't in the catalogue

Any section a user can reach that no catalogue entry covers still shows up. It is derived automatically as an *uncertified* app, with default `full-section` chrome, a generic icon, and placement in the reserved More group. Nothing is hidden from you just because it hasn't been curated.

Sections listed in `catalogue/exclusions.ts` never appear this way. That list is seeded with UmbraDesktop's own section, so you cannot open the desktop inside the desktop.

### Custom and third-party apps

If your package registers a section, it appears in the launcher automatically for users permitted to that section, in the More group with default chrome and a generic icon. No work required.

Beyond that there are two paths, and which one you take depends on what your app points at rather than on who wrote it.

**A self-contained app you register yourself.** If your app is its own custom element, with no backoffice route behind it, register a `umbraDesktopApp` extension manifest and you are done. It gets a launcher tile, a group, a window, pinning, a taskbar button and the active theme's colours, and your package never talks to this repository. There is nothing for anyone here to verify: an element in a box cannot point at the wrong URL or pick the wrong chrome profile. This is how games and small tools get onto the desktop. [`docs/desktop-apps.md`](docs/desktop-apps.md) is the guide.

**Curated placement for a backoffice surface.** If your app *is* a backoffice page (a custom icon, a friendly name, a specific group, a chrome profile or window sizing for a section or dashboard), it needs an entry in `backoffice/src/desktop/catalogue/`, which means opening a pull request against this repository. That is deliberate rather than a gap: a deep link needs its URL checked and its chrome profile chosen, and getting either wrong ships a broken window whose blame lands on the desktop. The manifest type has no `url`, `section` or `chromeProfile` field, so the split is structural and not a rule anyone has to remember.

A curated entry for a third-party package points at its extension by alias rather than by URL, so it resolves only where that package is registered and stays silently absent everywhere else. No flag is needed and none exists: any package can unregister any extension, so no entry is ever guaranteed to resolve. uSync ships this way: install it and a uSync app appears in the Synchronisation group, opening its whole workspace without the Settings tree beside it. Not unconditionally, though, and that is the point of the mechanism. An install that runs uSync in its own section instead gates that entry out, and uSync turns up as an ordinary uncertified app in More.

## Documentation

The full design, including the research behind the iframe approach, is in [`docs/design/umbradesktop-design.md`](docs/design/umbradesktop-design.md).

Building an app of your own, in your own package, is one extension manifest and a custom element.
[`docs/desktop-apps.md`](docs/desktop-apps.md) is the guide: the manifest shape, every form the
`element` may take with a worked static `umbraco-package.json`, the thirteen custom properties an
app paints itself with and the fallback each one needs, what a grid of controls tiled edge to edge
needs that a single control does not, how to branch per theme and why the theme
ids are a published API, what the desktop does to your element over its lifetime, and the traps that
cost real time. The reasoning is in
[`docs/design/2026-09-06-desktop-apps-design.md`](docs/design/2026-09-06-desktop-apps-design.md).

Building a theme of your own is a folder of CSS and one catalogue entry, with no change to the
chrome itself. [`docs/theming.md`](docs/theming.md) is the guide: what a theme folder holds, the
two channels a theme reaches the chrome through, the geometry it has to publish and why that must
be measured rather than typed, the traps that cost real time, worked examples from the five
shipped themes, and a checklist to run before you open a PR. The system behind it is described in
[`docs/design/2026-09-04-theming-system-design.md`](docs/design/2026-09-04-theming-system-design.md).

## License

[MIT](LICENSE)
