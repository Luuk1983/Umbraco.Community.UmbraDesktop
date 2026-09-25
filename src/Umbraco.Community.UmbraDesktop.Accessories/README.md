![UmbraDesktop](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop Accessories

An optional add-on for UmbraDesktop that puts the small tools on the desktop: Notepad, Paint, Sticky Notes, Calculator, Character Map, Clock, a screen saver, Disk Cleanup and System Information, the ones Windows kept under Start > Programs > Accessories.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop.Accessories)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Accessories) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop.Accessories)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Accessories) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE)

---

Install the accessories package and the launcher grows an Accessories group. Open a tool and it gets a window like everything else, themed along with the rest of the desktop, so Calculator under the Windows 98 theme has bevelled keys and under the macOS theme does not.

## What's in it

- **Notepad.** A plain-text editor for text files in the media library, with word wrap and the caret's line and column in a status bar. Ctrl+S, Ctrl+O and Ctrl+N do what they do everywhere else.
- **Paint.** Pencil, brush, eraser and fill, in MS Paint's own twenty-eight colours: left click paints the foreground and right click the background. Undo with Ctrl+Z. Works on a new picture or on an image opened from the media library.
- **Sticky Notes.** One board shared by everyone who uses the desktop. A note one person writes shows up for everyone else within about fifteen seconds, or as soon as they click back into the window, and says who last wrote it. Anyone can edit or delete any note. When two people edit the same note at once, the second is shown the first's version and chooses **Use theirs** or **Keep mine**, so nobody's words are silently overwritten.
- **Calculator.** The Windows Standard calculator without its scientific row. Works from the keypad or the keyboard, left to right the way a pocket calculator does, and shows `0.3` for `0.1 + 0.2`.
- **Character Map.** The characters a keyboard does not have, in a grid by group, with each one's Unicode name and Windows Alt keystroke. Double-click to collect some, **Copy** to put them on the clipboard, or search by name or by code.
- **Clock.** An analogue face with the time and the date under it, in your backoffice language.
- **Screen Saver.** Starfield, Mystify, or Umbraco logos flying at you, when the desktop has been left alone for 1 to 30 minutes. Windows 98's Screen Saver tab in a window, with a live preview monitor and a **Preview** button. Off until you choose one. Any key, click or real movement of the mouse brings the desktop back, and typing in any window counts as being there.
- **Disk Cleanup.** Empties the content and media recycle bins, one or both at once, for good. Nothing is ticked when it opens, and **Clean up** always asks first, in red, naming how many items each bin holds. Umbraco decides who may empty which bin, as it does in the Content and Media sections.
- **System Information.** Windows 98's System Properties for the site: the Umbraco version, the desktop's version and theme, who is signed in, and the browser and machine. **Details** adds the server's own report, every installed package and its version, and your display, memory and processors, and **Copy all** puts it on the clipboard for a support request.

## Where your work goes

Sticky Notes live in the Umbraco database (its key-value store), readable and writable only by users with the Desktop section. Up to 100 notes of 2,000 characters each.

Notepad and Paint work on the media library. Open shows Umbraco's own media picker (with its Upload button, which is how a file on your computer gets in), Save writes the file back over the same media item, and the name in the status bar is the media item's name. Notepad opens text files, SVG included; Paint opens pictures up to 4,096 pixels across and saves each in the format it came in, and refuses an SVG rather than flattening it.

The first save of a new document or picture asks where, as Save As did: Umbraco's folder picker opens on the media library's root, so **Choose** saves it there, or you pick a folder. Later saves go back to the same item without asking. Saving behaves like dragging the file into the Media section: the extension picks the media type, the folder has to allow it, and you need access to both. A refusal shows in the window's status bar and leaves your work unsaved.

Disk Cleanup deletes for good: what it empties cannot be restored, which is why it asks every time.

Unsaved work is protected the way an unsaved page is: the window shows the unsaved dot, and closing it, or leaving the desktop, asks first. New and Open ask too.

The screen saver's settings, like the folder, are stored per user in that browser.

## Installation

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Accessories
```

The host package comes with it as a dependency, so if you do not have UmbraDesktop yet, this installs it too. No configuration, no section to grant, no dashboard to enable: the tools appear in the launcher for anyone who can reach the desktop.

### Prerequisites

- Umbraco 17
- .NET 10
- UmbraDesktop 17.x (installed automatically)

## Versions

This package and UmbraDesktop are released together from the same tag and always share a version number, so matching versions are the compatibility answer. The dependency is a range rather than an exact pin, so upgrading the desktop on its own is fine.

## Writing your own

Nothing in here is privileged. The `umbraDesktopApp` extension manifest that puts these tools in windows is public API that any package can register, and the screen saver's idle watcher is an ordinary Umbraco `backofficeEntryPoint`. If you want your own app on the desktop, [`docs/desktop-apps.md`](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/desktop-apps.md) is the guide, and the source of this package is a worked example.

## License

MIT. See [LICENSE](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE).
