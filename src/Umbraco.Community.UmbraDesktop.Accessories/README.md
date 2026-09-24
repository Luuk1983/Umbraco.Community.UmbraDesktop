![UmbraDesktop](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop Accessories

An optional add-on for UmbraDesktop that puts the small tools on the desktop: Notepad, Paint, Calculator and Clock, the ones Windows kept under Start > Programs > Accessories.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop.Accessories)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Accessories) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop.Accessories)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Accessories) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE)

---

Install the accessories package and the launcher grows an Accessories group. Open a tool and it gets a window like everything else, themed along with the rest of the desktop, so Calculator under the Windows 98 theme has bevelled keys and under the macOS theme does not.

## What's in it

- **Notepad.** A plain-text page with word wrap, and the caret's line and column in a status bar. Open reads a text file from your machine, Save writes it back under the name it was opened with, and Ctrl+S, Ctrl+O and Ctrl+N do what they do everywhere else.
- **Paint.** Pencil, brush, eraser and fill, in MS Paint's own twenty-eight colours: left click paints the foreground and right click the background. Undo with Ctrl+Z, and Save as PNG with Ctrl+S.
- **Calculator.** The Windows Standard calculator without its scientific row. Works from the keypad or the keyboard, left to right the way a pocket calculator does, and shows `0.3` for `0.1 + 0.2`.
- **Clock.** An analogue face with the time and the date under it, in your backoffice language.

## Where your work goes

Wherever you choose in **Desktop settings > Accessories**: your own machine as a download, or the media library as a media item (a text file from Notepad, an image from Paint), in a folder you pick. Save and Ctrl+S go there, and each app has a second button for the other place, so both are always one click away. The choice is per user, in that browser, and starts on your own machine.

A save to the media library behaves like dragging the file into the Media section: the extension picks the media type, the folder has to allow it, and you need access to both. A refusal comes back in the backoffice's own words and leaves your work unsaved in the window. Saving the same document again updates the media item it created instead of adding another.

Unsaved work is protected the way an unsaved page is: the window shows the unsaved dot, and closing it, or leaving the desktop, asks first. New and Open ask too.

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

Nothing in here is privileged. The `umbraDesktopApp` extension manifest that puts these tools in windows is public API that any package can register, and this package uses no other route in. If you want your own app on the desktop, [`docs/desktop-apps.md`](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/desktop-apps.md) is the guide, and the source of this package is a worked example.

## License

MIT. See [LICENSE](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE).
