![UmbraDesktop](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop Accessories

An optional add-on for UmbraDesktop that puts the small tools on the desktop: Notepad, Paint, Calculator and Clock, the ones Windows kept under Start > Programs > Accessories.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop.Accessories)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Accessories) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop.Accessories)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Accessories) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE)

---

Install the accessories package and the launcher grows an Accessories group. Open a tool and it gets a window like everything else, themed along with the rest of the desktop, so Calculator under the Windows 98 theme has bevelled keys and under the macOS theme does not.

## What's in it

- **Notepad.** A plain-text page with word wrap, and the caret's line and column in a status bar. Open reads a text file from your machine, Save downloads the page back under the name it was opened with, and Ctrl+S, Ctrl+O and Ctrl+N do what they do everywhere else.
- **Paint.** Pencil, brush, eraser and fill, in MS Paint's own twenty-eight colours: left click paints the foreground and right click the background. Undo with Ctrl+Z, and Save as PNG.
- **Calculator.** The Windows Standard calculator without its scientific row. Works from the keypad or the keyboard, left to right the way a pocket calculator does, and shows `0.3` for `0.1 + 0.2`.
- **Clock.** An analogue face with the time and the date under it, in your backoffice language.

## Where your work goes

Nowhere but your own machine. Open uses your browser's file picker and Save is a download, so nothing is stored in Umbraco, nothing is uploaded and there is no permission to set up.

The flip side is that a Notepad or Paint window's work lasts as long as the window does. New and Open ask before throwing unsaved work away. Closing the window does not ask, because the desktop's close guard can only be told about unsaved changes by a window holding a backoffice page, and these are not.

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
