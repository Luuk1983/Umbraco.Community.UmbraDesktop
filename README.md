![UmbraDesktop](src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop

A desktop for the Umbraco backoffice. Open your sections and tools as real windows, and work in several of them side by side.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](LICENSE)

![The UmbraDesktop desktop: the content editor showing a list of products and the media library showing their images, open side by side as two overlapping windows, the site's name written large in the top right corner of the wallpaper, and a taskbar along the bottom with a button for each window.](docs/screenshots/hero.png)

The Umbraco backoffice shows you one thing at a time. That is fine for editing one page, and it fights you the moment two things belong together: a page and the media it uses, an editor and the page it renders, a setting and the thing it affects.

UmbraDesktop turns the backoffice into a desktop. A launcher opens your sections and tools as windows you can move, resize and snap next to each other. Inside each window is the backoffice you already know, with the same trees, editors and shortcuts, so there is nothing new to learn and nothing to set up beyond one permission.

## What you get

- **Real windows, side by side.** Drag, resize, maximise, or snap two windows into halves. [Windows](docs/user/windows/README.md)
- **A warning before you overwrite someone.** Plain Umbraco lets the second save win silently; the desktop tells you, and never throws away unsaved work without asking. [Overwrite protection](docs/user/windows/overwrite-protection.md)
- **Your page beside its editor.** A live preview that reloads on every save, headless sites included. [Live preview](docs/user/windows/live-preview.md)
- **A launcher that fits how you work.** Apps grouped by what they do, pinned to the taskbar, arranged the way you like. [Launcher](docs/user/launcher/README.md)
- **Five themes.** Umbraco, Umbraco 4, macOS, Windows 11 and Windows 98, each with a wallpaper to match. [Appearance](docs/user/appearance/README.md)
- **It follows you.** Your settings live on your Umbraco account, and your windows come back after a reload. [Settings](docs/user/settings/README.md)
- **It knows your packages.** Forms, Deploy, Workflow, Commerce and the rest get proper apps, and Umbraco AI's chat sits in a window beside your pages. [Apps](docs/user/apps/README.md)
- **Help on the desktop.** The documentation for the version you run, for the desktop and its add-ons, in a window of its own. [Help](docs/user/apps/help.md)
- **Built to be extended.** Your own package can add apps, tiles, launcher groups and themes. [Developer guide](docs/developer/README.md)

![A content editor window with the rendered page docked beside it in the same window, and the Preview button in its path shown as pressed.](docs/screenshots/live-preview.png)

## Make it yours

Pick the chrome you like working in. A theme restyles the launcher, the taskbar and the window frames, and leaves the backoffice inside the windows alone.

![The same desktop in all five themes: Umbraco, Umbraco 4, macOS, Windows 11 and Windows 98, each over the wallpaper it brings.](docs/screenshots/theme-gallery.png)

## Get started

You need Umbraco 17 and .NET 10.

```bash
dotnet add package Umbraco.Community.UmbraDesktop
```

Then give a user group access to the **Desktop** section, under **Settings** > **User Groups**, and have its users sign out and back in. That step is required: until it is done, nothing appears. After it, the desktop icon shows in the backoffice header, top right.

UmbraDesktop grants no access of its own. A user only sees apps for the sections they could already reach.

[Installation](docs/user/getting-started/installation.md) has the details, and [First steps](docs/user/getting-started/first-steps.md) shows you around.

## Small tools, if you want them

[`Umbraco.Community.UmbraDesktop.Accessories`](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Accessories) is an optional add-on with the tools Windows kept under Accessories: Notepad and Paint that edit files in your media library, Sticky Notes of your own and shared with your team, Calculator, Character Map, Clock, a screen saver, Disk Cleanup and System Information. The desktop is unchanged without it.

## Games, if you want them

[`Umbraco.Community.UmbraDesktop.Entertainment`](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Entertainment) is an optional add-on that puts Minesweeper, Snake and Solitaire on the desktop, each in a window of its own and themed along with everything else. The desktop is unchanged without it.

## Documentation

- The [user guide](docs/user/README.md) covers installing, using and setting up the desktop, one short page per feature.
- The [developer guide](docs/developer/README.md) explains how it works and how to extend it from your own package.

## License

[MIT](LICENSE)
