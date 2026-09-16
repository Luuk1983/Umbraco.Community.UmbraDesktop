![UmbraDesktop](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop

An OS-style windowed desktop for the Umbraco backoffice. Open your tools as real windows and work in several of them side by side.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE)

---

The Umbraco backoffice shows you one thing at a time. One section is active, one workspace fills the screen. That is fine for linear editing, but it fights you the moment two tools are meant to be looked at *together*.

UmbraDesktop turns the backoffice into a desktop. A launcher opens your sections and tools as floating windows you can move, resize and place next to each other: content beside media, or a settings editor beside the thing it affects.

It also does something the backoffice does not do at all. When two people have the same page open, plain Umbraco lets the second save win silently: nobody is told, and the first person's work is gone. UmbraDesktop warns you before you overwrite someone, and it does it on the window, on its taskbar button and in every dialog that could throw work away. See [Overwrite protection](#overwrite-protection).

![The UmbraDesktop desktop: several backoffice sections open at once as separate, overlapping windows. The taskbar along the bottom carries a titled button for each of them, and beside the launcher button a row of icons for the pinned apps.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/desktop-windows.png)

> **New: games on the desktop.** [`Umbraco.Community.UmbraDesktop.Entertainment`](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Entertainment)
> is an optional add-on that puts Minesweeper in the launcher's Games group, in a window of its own
> and themed along with everything else. Install it if you want it; the desktop is unchanged
> without it. See [Games](#games).

## Features

- Work side by side. Open two or more tools at once and arrange them however you like. Edit on the left, watch the result on the right, without navigating back and forth. This one wants room: see [A note on screen size](#a-note-on-screen-size).
- Real windows. Drag, resize, minimise, maximise, and double-click a title bar to fill the desktop. Each window remembers its own place.
- Snap two windows side by side. Drag a window into the left or right edge and it takes that half of the desktop; drag it into the top edge and it fills the screen. An outline shows where it will land before you let go, and dragging it back off returns it to the size it was. The halves follow the desktop, so resizing the browser keeps them halves.
- Always says where you are. A window that holds a whole section carries a path under its title bar, Media library / Campaigns / hero.jpg, and every step of the way back is one click. In the plain backoffice you climb back out of a tree by clicking the section name in the header, and a window has no header, so this is where that goes.
- Never loses your work. A window holding unsaved changes shows a dot in its title bar and on its taskbar button, and closing it, reloading it or leaving the desktop asks first, in the same words the backoffice uses everywhere else. Leaving the desktop asks once and says how many windows are unsaved.
- Warns before you overwrite someone. If somebody else saves or bins a document while you have it open with unsaved changes, the window says so, in its own chrome, on its taskbar button and in every dialog that could throw your work away. Deletion is warned about even when you have nothing unsaved, because there is no version left to refresh to. The plain backoffice does not warn about this at all.
- A launcher that stays out of the way. Apps are grouped into Editing, Workflow, Marketing and sales, Development, Synchronisation, Security, Advanced security, Diagnostics, Automation, AI and System, so you find things by what they do, plus Games once a package puts an app there. Empty groups never show.
- Knows the commercial packages. Forms, Deploy, Workflow, Commerce, Engage, UI Builder, Automate and Umbraco AI each get proper apps with the right name, icon, group and window chrome, instead of a generic tile in More. Nothing to configure: an app appears only if you have that package.
- Umbraco AI, if you have it. The Copilot Workspace opens as a window, so the chat sits beside the pages it is about instead of replacing them. The agent can put a document, a media item or any of the desktop's apps on your desk in its own window, and it can read what you already have open, including which windows hold unsaved changes. Needs Umbraco AI 17.4 or later, and nothing appears without it. See [Umbraco AI](#umbraco-ai).
- Pin what you use. Pin your regulars and they sit at the top of the launcher, under Pinned, and on the taskbar as icons. One pin, one gesture, shown in two places. Your pins are remembered per user, in that browser.
- A taskbar. Every open window gets a button: click to focus, click again to minimise.
- The apps you live in, one click away. Beside the launcher button the taskbar carries a fixed row: the AI chat, then your pinned apps. Both are on by default and each is a single switch in Desktop settings, Taskbar. Nothing on the taskbar pins or reorders anything, and the row never stands in for a window, so a second click opens a second window exactly as the launcher does. See [On the taskbar](#on-the-taskbar).
- Choose your wallpaper. Ten backgrounds ship with the package, or pick any image from your own Media Library. The choice is per user, in that browser.
- Start in the desktop. Turn on one setting and opening the backoffice takes you straight to the desktop, behind a boot screen rather than a flash of the classic interface. A link straight to a document still opens that document, and Exit still gets you out. Per user, in that browser. See [Starting in the desktop](#starting-in-the-desktop).
- Speaks your language, and writes the time your way. The desktop follows your Umbraco backoffice language, so a Danish backoffice gets a Danish clock rather than whatever your browser happens to be set to, and you can change that language from Desktop settings without needing access to the Users section. If your culture and your habits disagree, one switch forces a 12 or 24 hour clock without giving up anything else about how your language writes a time. See [Language and region](#language-and-region).
- Looks like Umbraco. The desktop, launcher and window chrome are built from Umbraco's own design tokens, so it reads as part of the backoffice rather than bolted on. A window waiting for its content shows the Umbraco mark with a turning ring, the same animation the boot screen uses, so the wait belongs to the desktop rather than looking like the page has stalled.
- Or looks like something else. Pick a theme and the chrome is restyled around the same backoffice. Five ship: Umbraco, Umbraco 4, macOS, Windows 11 and Windows 98. Adding your own is a folder of CSS and one catalogue entry.
- Light, dark and high contrast, in the same place. Umbraco's own colour schemes are normally set in the user menu, three clicks from the theme that sits beside them. Appearance now has a row for them too, listing whatever themes the backoffice has registered rather than a fixed three, so a site shipping its own gets it here for free. One setting, two ways in: change it here and the user menu agrees, and the other way round. See [The backoffice's own colours](#the-backoffices-own-colours).
- Let the wallpaper follow. Turn on one toggle in the theme picker and each theme brings its own background with it, so switching to Windows 98 gives you its bare teal and switching to macOS gives you a sunrise. Off by default, and choosing a wallpaper yourself turns it back off. See [Matching the wallpaper to the theme](#matching-the-wallpaper-to-the-theme).
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

![The launcher: a search box, a Pinned row at the top, and every other app grouped by what it does.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/launcher.png)

From the launcher:

- Click an app to open it in a window.
- Hover an app and click the pin to add it to Pinned, which sits at the top.
- Drag a title bar to move a window, drag an edge or corner to resize, double-click the title bar to maximise.
- Drag a window into the left or right edge of the desktop to snap it to that half, or into the top edge to maximise it. An outline appears while you are over an edge, showing where the window will go. Drag a snapped window away and it returns to the size it had before.
- Use the taskbar at the bottom to switch between open windows. The icons to the left of them, beside the launcher button, are the fixed row: the AI chat and your pinned apps, one click from anywhere. See [On the taskbar](#on-the-taskbar).
- The path under a section window's title bar says where that window is. Click any step to go back to it; the first step returns the window to whatever it opened at. If the window has unsaved changes it asks before leaving, the same way closing it does.
- A dot in a title bar means that window has unsaved changes, and the same dot appears on its taskbar button so a minimised window still says so. Closing or reloading it asks before discarding them; saving clears the dot.
- While a window is fetching its content, whether you have just opened it or just reloaded it, it shows the Umbraco mark with a ring turning around it. It covers the window until the content is ready, so you never see a half-drawn backoffice assembling itself.
- Choose Exit in the launcher's footer to return to the classic backoffice. If you start in the desktop, exiting keeps you in the classic backoffice until you close the tab.
- Open Desktop settings from the cog in the launcher's footer, as a panel from the right. It opens on a list of categories — General for how the desktop starts, Language and region for the backoffice language and how times are written, Appearance for your theme, your wallpaper and the backoffice's own colours, Taskbar for what sits beside the launcher button — and the desktop stays in view behind it, so you can see a change as you make it.

Several apps can be open at once, and some of them (the content editor and media library, for instance) can be opened more than once, so you can compare two documents side by side.

## A note on screen size

The Umbraco backoffice was never built to be responsive, and it does not scale down gracefully. UmbraDesktop inherits that: the backoffice inside a window starts to break up once the window gets small, which is why every window has a floor below which it will not shrink, and why you cannot pull one down to a tile. A catalogue entry can raise that floor for an app that needs more, and a few do, but the global minimum is what you meet most of the time.

So how much you get out of it depends on the screen in front of you:

- **On a wide screen**, roughly 1920px and up, two windows side by side are genuinely comfortable. This is where UmbraDesktop is at its best.
- **On a laptop screen**, side by side works for the lighter, self-contained apps, but tree-heavy tools like the content editor want most of the width to themselves. Expect to work with one window in front most of the time.
- **On anything smaller**, treat it as a single-window desktop.

Snapping obeys the same floor. If half the desktop is narrower than a window is allowed to be, that window snaps to its own minimum instead, which on a narrow screen means the two halves overlap in the middle rather than one of them being squeezed into something you cannot work in. Clicking either window brings it to the front, so an overlap costs you a little of the window behind and nothing else.

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

![Three windows stacked on the desktop, each in a different state of the guard: one marked with a dot for unsaved changes, one showing the warning that someone else changed the same item with the choice to keep your version or load theirs, and one showing the error that it has been moved to the recycle bin. The taskbar below carries the matching marker on every button.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/unsaved-changes-guard.png)

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

![Background Jobs, open in a desktop window: a table of scheduled jobs with how often each runs, when it last ran and when it is next due, above the control that sets how often the view refreshes itself.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/background-jobs-viewer.png)

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

## Umbraco AI

If you have Umbraco AI, the desktop gives its agent two things the plain backoffice cannot.

The **Copilot Workspace** opens as an ordinary app, from the launcher, in the AI group. It is
Umbraco's own chat, with its conversation list, its projects and its attachments, in a window, so
the chat sits beside the pages it is about instead of replacing them. One window rather than
several: conversations are switched in the workspace's own sidebar, and switching aborts whatever
the agent was doing regardless, which is what Umbraco's own section does too.

**Answers can open as windows.** Ask where something is and the agent can put it on your desk in
its own window, without leaving the conversation. In a single-page backoffice, following a link is a
navigation and the chat resets; here both survive. If the item is already open somewhere, that
window comes to the front instead of a second one opening onto the same document, unless you ask
for another one on purpose. It opens the desktop's own apps too, so "open the log viewer" works as
well as "open the pricing page".

**And it can tidy up.** "Close everything" does what it says, with two things it will not do: a
window holding unsaved changes is left open and named back to you, and the chat's own window stays.
So there is no way for the agent to lose your work, and no dialog appears out of nowhere.

**The agent can read your desk.** It can ask which windows are open, what each is showing, which is
in front and which are holding unsaved changes, so "the page I have open" is a phrase that works. It
is also how the agent knows which apps this desktop can open at all. What it reads is a snapshot
taken at the moment it asks rather than a live feed, so what a conversation says stays true of when
it was said, and it is identity only and never your unsaved edits: reading a document is the agent's
own job, and it can do that whether or not you have it open.

![The Copilot chat open in a window on the left, its transcript listing the tool calls the agent made, with the document it opened in its own window on the right and a taskbar button for each.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/ai-copilot-chat.png)

That last part deserves one caution. From 17.4 the agent writes on the server, so it can change a
document you have open in front of you. That is the case [Overwrite protection](#overwrite-protection)
above covers, and it covers the agent exactly as it covers a colleague.

Needs **Umbraco AI 17.4 or later**. Without the package, on an older version, or for a user without
permission to the Copilot Workspace section, none of it appears: no launcher tile, no tool, and
nothing added to the chat. UmbraDesktop does not depend on Umbraco AI and never requires it.

## On the taskbar

The launcher is the right way in for thirty-five apps. It is the wrong way in for the one or two you
use all day, where every launch is two clicks and a scan of a panel you had to open first.

So the taskbar carries a fixed row immediately to the right of the launcher button, before the open
window buttons. Two things sit in it, in that order:

- **AI chat**, a single button that opens the Copilot Workspace. It is there if you have Umbraco AI
  installed and can reach it, and it is simply absent if you cannot.
- **Pinned apps**, your pins as icon-only buttons, in the order the launcher shows them.

Both are on from the start, and each is one switch in Desktop settings, Taskbar. Switching one off
closes its space and moves nothing else: the order is fixed, so a button you have learned the
position of stays where it is.

**Pinning does not change.** You pin in the launcher, exactly as before, and switching the row on
simply draws that same list in a second place. There is no pin-to-where question to answer, because
there is only one list, and nothing on the taskbar pins, unpins or reorders anything.

**The row launches, it does not switch windows.** A button there does precisely what the app's tile
in the launcher does, second click included: an app that allows several windows gives you another
one, and the Copilot Workspace, which does not, comes to the front instead. Switching between the
windows you already have is the job of the buttons on the other side of the bar, and they keep it.
That is why nothing in the row needs a running indicator, a modifier click or a right-click menu.

Switched on and showing nothing is a normal state, not a fault: that is Pinned apps before you have
pinned anything, and AI chat on a site without the AI package. Desktop settings still lists both,
with the switch disabled and the reason given, because settings is where you find out what the
product can do.

The row works under all five themes, taking each one's own button style, and it is not a system
tray: it sits on the launching half of the bar, beside the launcher button, and everything in it
opens something.

Three of the themes need nothing else to keep the row and your open windows apart, because a window
button there carries its window's title and a row button never carries anything. The two that show
icons without labels say it another way. Both put a separator between the two groups, and Windows 11
also marks each open window with a small bar under its icon, grey for open and its blue accent for
the one you are in. So on those themes a bare icon launches something and a marked one is already
open.

## Changing the theme

Open Desktop settings and pick Appearance. The Theme row shows the theme you are on as a miniature
of the desktop it paints; click it and a panel opens listing all five the same way — the window, the
title bar buttons where that theme puts them, the taskbar — so you can see what you are choosing
before you choose it. Picking one
applies it straight away and the panel stays open, so you can click through them and watch the
desktop behind change. Choosing a theme restyles the launcher, taskbar and window chrome, never the
content inside a window, which stays the backoffice you already know. It leaves your wallpaper alone
too, unless you ask it not to — see [Matching the wallpaper to the theme](#matching-the-wallpaper-to-the-theme).
Five ship today:

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

![The macOS theme: traffic lights at the left of each title bar, rounded window corners, and a floating dock centred along the bottom, over the wallpaper this theme brings with it.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/theme-macos.png)

![The Windows 98 theme: grey window frames with navy title bars, the launcher as a Start menu open in the corner listing the app catalogue by group, a taskbar button for each open window, and the bare teal desktop this theme brings with it.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/theme-win98.png)

Your choice applies immediately and is remembered per user, in that browser. Themes follow the
backoffice's own Light and Dark settings; under High contrast a theme uses its darkest colours,
while window content switches to Umbraco's real high-contrast styling. Umbraco 4 and Windows 98
ship a single palette on purpose: their grey is the design rather than a light-mode choice, so
they look the same under all three settings.

## The backoffice's own colours

"Theme" means two things here, and they used to be set in two different places. The one above is
this package's: it restyles the chrome around your windows. Umbraco's own — Light, Dark and High
contrast — restyles everything, the content inside every window included, and it lives in the user
menu at the top of the backoffice.

Appearance carries a third row for it, under Theme and Wallpaper, named **Backoffice colours** so
that it does not read as a sixth desktop skin. It is not one: these change the documents inside the
windows, which no theme in this package touches. Click the row and you get the list; picking one
applies it straight away, to the whole backoffice, and the picker stays open.

The row lists whatever the backoffice has registered rather than a fixed Light, Dark and High
contrast, because a backoffice theme is an extension. A site that ships one of its own gets it in
this row without doing anything, and one that removes a shipped theme stops being offered it.

There is one setting behind the two front ends, not a copy each: set it here and the user menu
agrees, set it there and this row updates while you are looking at it. The desktop repaints in the
matching variant either way, as it always has, and the sentence explaining what high contrast does
to the chrome now sits under this row rather than under the theme row that does not cause it.

## Matching the wallpaper to the theme

Switching to Windows 98 gives you a Windows 98 desktop with an Umbraco wallpaper still sitting on
it. The chrome changes and the thing behind it does not, which is the one part of the illusion a
theme cannot fix on its own.

Under the theme list there is a toggle for it. Turn it on and each theme brings its own background:

| Theme | Wallpaper |
| --- | --- |
| Umbraco | Aurora Flow |
| Umbraco 4 | Retro Swoosh, which is the v4-era artwork |
| macOS | First Light |
| Windows 11 | Cobalt Beacon |
| Windows 98 | None, because a Windows 98 nobody had personalised showed bare teal and nothing else |

It is off to begin with, and **turning it on changes nothing on screen**. It is a statement about
what picking a theme will do, not an instruction to redecorate now, so your wallpaper moves on the
next theme you click. What does change immediately is the previews: with the toggle on, each theme's
miniature shows its own wallpaper, so you can see where a click will land before you make it. To
apply the current theme's wallpaper without switching theme, click the theme you are already on.

**Choosing a wallpaper yourself turns it back off** and keeps the wallpaper you chose, so the
setting can never quietly discard a picture you picked.

![The Choose a theme panel with Match the wallpaper to the theme switched on above the list, and every theme preview painted on the background that theme brings with it rather than on the one currently in use.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/theme-wallpaper-match.png)

One thing it does not do: a theme names one wallpaper, not a light one and a dark one. macOS pairs
its own backgrounds that way, so under Dark the macOS theme gives you dark chrome over a bright
background. Pick a wallpaper by hand if that bothers you.

## Changing the wallpaper

Open the launcher, click the cog in its footer, and pick Appearance. The Wallpaper row shows what
you are using now; click it and the picker opens with everything you can choose from:

- Your own image, the first tile. Empty until you have picked one, it opens your Media Library; once
  you have, it *is* that image, so the wallpaper you are using is always the one marked. Click it
  again to pick another.
- None, which restores the plain gradient, and the ten backgrounds that ship with the package.

Picking one applies it straight away and the picker stays open, the same way the theme picker does,
so you can try a few and watch the desktop change behind the panel.

![Desktop settings open over the desktop, showing the theme in use above the wallpaper in use, with the wallpaper picker open beside it: every background that ships with the package, named, alongside None for the plain gradient and a tile for choosing your own image from the Media Library.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/choose-background.png)

Your choice applies immediately and is remembered per user, in that browser.

### Using your own backgrounds

There is nothing to configure and nothing to deploy. Upload the image to the Media Library as you would any other, then open Desktop settings, Appearance, click the Wallpaper row, and pick the first tile.

Umbraco resizes it for you: the desktop asks for a copy with no side longer than 2560px, so a large upload never reaches the browser at full size and the resized copy is cached server-side. You do not need to optimise anything first.

If you pick something that is not an image, the desktop tells you and leaves your current wallpaper alone.

## Starting in the desktop

If the desktop is where you work, you should not have to walk through the backoffice to reach it. Open Desktop settings, General, and turn on "Open the desktop when I sign in".

It takes effect the next time you open the backoffice rather than there and then, which is why the panel says so under the toggle. From then on, going to `/umbraco` opens the desktop, behind a boot screen that stays up until your own desktop is ready — your theme, your wallpaper, no flash of the classic interface and no flash of somebody else's defaults.

What it deliberately does not do is take over your links. A bookmark, a notification or a shared URL that points at a document still opens that document. Only the bare backoffice address changes where it lands.

Two ways out:

- Exit in the launcher's footer returns you to the classic backoffice, and you stay there until you close the tab. Exiting means "not now", so it does not turn the setting off.
- `/umbraco?desktop=off` opens the classic backoffice once, whatever the setting says.

That second one is worth knowing before you need it. The desktop hides the backoffice header while it is open, so if a future version of the desktop ever breaks on your setup, that address is how you get back to a normal backoffice and turn the setting off. The desktop also skips the startup jump by itself if the last attempt did not finish, so a bad boot does not repeat.

The setting is stored per user, in that browser, alongside your theme and wallpaper. Signing in on another machine starts in the classic backoffice until you turn it on there too.

## Language and region

The desktop is the shell around a backoffice that is already translated, so it takes its cue from that backoffice rather than from your browser. Open Desktop settings, Language and region.

**Backoffice language** is your own Umbraco language, the same setting that lives in your user profile. Changing it here changes it everywhere, not just on the desktop — and you do not need access to the Users section to change your own. The desktop hides the backoffice header, which is where that setting normally lives, so this is where it goes instead.

It cannot take effect where it stands: every window is a frame with its own copy of the backoffice in it, so the desktop asks whether to reload once the change is saved. Saying Later costs nothing; the language is already stored and applies the next time you open the backoffice. Saying Reload now closes every window you have open, because the desktop does not restore a session, so the dialog says how many that is and whether any of them are unsaved.

**Regional format** decides how the desktop writes dates and times. The default is to match your backoffice language, which is what the rest of the backoffice already does: Umbraco formats every date it shows — the Info tab, the audit trail, the log viewer — with that same language. Before this setting existed the clock alone read your browser instead, so on a default English install the backoffice said 8:59 PM while the clock beside it said 20:59. Matching the browser is still there if you prefer it.

**Clock** forces 12 or 24 hour when your language and your habits disagree. Umbraco offers no British English, so an English backoffice is a 12 hour one whether you like it or not; this is how you get 24 hour without giving up anything else. It overrides only the hour, so Dutch still writes p.m. its own way, Danish keeps its dot, and Japanese and Korean keep their own markers in their own places. Left on Automatic, your language decides.

Regional format and Clock are stored per user, in that browser, alongside your theme and wallpaper. The backoffice language is stored on your Umbraco user, so it follows you to any machine you sign in on.

## Games

Minesweeper, in a window, under whichever theme you picked. It ships in its own package rather than this one, because a desktop and a minesweeper are not the same product and nobody should have to take the second to get the first:

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Entertainment
```

![Minesweeper open in its own window on the UmbraDesktop desktop under the Windows 98 theme, with the launcher's Games group highlighted in the Start menu and the game's own taskbar button below.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/entertainment-games-minesweeper.png)

That is the whole installation. There is no section to grant and no dashboard to enable: the games appear in a Games group in the launcher for anyone who can already reach the desktop, and the group is not there at all if the package is not installed.

The add-on is released from the same tag as this package and always carries the same version number, so matching versions are the compatibility answer. Its dependency on the desktop is a version range rather than an exact pin, so upgrading the desktop on its own is fine.

Nothing in that package is privileged. It reaches the desktop through the same public `umbraDesktopApp` manifest any package can register, which makes its source the worked example for [Custom and third-party apps](#custom-and-third-party-apps).

## Connecting other Umbraco instances (experimental)

If you look after several unrelated Umbraco sites, the desktop can connect to them and report on
them, so "which version is that client on, and is it up" stops meaning logging into eight
backoffices.

**This one is experimental**, and labelled as such wherever it appears. It works, and it only ever
reads, but how connections are stored and what they can reach is still likely to change, so expect
to redo some of the setup in a later version.

It needs nothing installed on the other instance. You create an API user there, in the Users
section, which is Umbraco's own feature for exactly this, and paste its client ID and secret into
Desktop settings. For what ships today the API user needs no sections at all, and whoever owns that
instance can revoke it whenever they like. Credentials are stored encrypted on the instance you add
them to, so that should be one you own rather than a client's.

Nothing appears until you add a connection, and what appears then is one app: Connection status,
listing this instance along with every one you connected, with what each reports about itself.

It is deliberately not the environments feature. Test, acceptance and production of one solution
share content and keys, and moving or comparing things between them is uSync and Deploy's job;
unrelated instances share nothing, so there is nothing to compare and the value is just seeing them
all in one place.

[`docs/connections.md`](docs/connections.md) is the guide: creating the API user step by step, what
each field wants, what the five statuses mean and what to do about each, where credentials live and
the honest limits of that, and what the feature deliberately does not do.

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
| Umbraco AI | The AI section, and the Copilot Workspace as its own chat window | AI |

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

Connecting other Umbraco instances is experimental, and
[`docs/connections.md`](docs/connections.md) is its guide: creating the API user on the instance you
want to read, what each field in Desktop settings wants, what the five connection statuses mean and
who fixes each one, where the credentials are stored and the limits of that, and what the feature
deliberately refuses to do.

## License

[MIT](LICENSE)
