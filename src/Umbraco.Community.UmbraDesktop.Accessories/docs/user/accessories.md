---
id: accessories
title: Accessories
description: Install the Accessories add-on and find its nine tools in the launcher.
sidebar_position: 1
image: ../screenshots/accessories-desktop.png
---

# Accessories

UmbraDesktop Accessories puts the small tools Windows kept under Start > Programs > Accessories and
System Tools on the desktop, each in a window of its own and themed along with the rest of it. The
screen saver is the exception: it is set in Desktop settings, and its tile opens them.

## Install

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Accessories
```

That is the whole installation. UmbraDesktop comes with it as a dependency, so it is installed too if
it is not there yet. There is no section to grant and no dashboard to enable: the tools appear in an
**Accessories** group in the launcher for anyone who can already reach the desktop. Without the
package, the group is not there at all.

Prerequisites:

- Umbraco 17
- .NET 10
- UmbraDesktop 17.x, the same release or later, installed automatically

## The tools

To open a tool, open the launcher and select it in the **Accessories** group.

| Tool | What it does |
| --- | --- |
| [Notepad](notepad.md) | Edits text files in the media library |
| [Paint](paint.md) | Draws on a new picture, or on an image from the media library |
| [Sticky Notes](sticky-notes.md) | Notes of your own, and a board shared with everyone who uses the desktop |
| [Calculator](calculator.md) | The Windows Standard calculator, from the keypad or the keyboard |
| [Character Map](character-map.md) | Finds and copies the characters a keyboard does not have |
| [Clock](clock.md) | An analogue clock that writes the time the way the taskbar does |
| [Screen Saver](screen-saver.md) | Starfield, Mystify and Flying Umbraco, for when the desktop is left alone |
| [Disk Cleanup](disk-cleanup.md) | Empties the content and media recycle bins, after asking |
| [System Information](system-information.md) | The Umbraco, desktop, server and browser details, ready to copy into a support request |

Notepad and Paint open and save files in the media library, never on your own computer. See
[Opening and saving files](media-files.md).

## Versions

The add-on is released from the same tag as UmbraDesktop and always carries the same version number.
It needs UmbraDesktop of the same release or any later 17.x, because it uses things only that release
of the desktop provides, and installing or updating it brings UmbraDesktop up to that release if
needed. Updating UmbraDesktop on its own is always fine.
