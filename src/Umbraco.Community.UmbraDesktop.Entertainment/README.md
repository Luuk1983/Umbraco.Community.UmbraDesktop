![UmbraDesktop](../Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop Entertainment

Games for UmbraDesktop. Minesweeper, Snake and Solitaire, each in a window of its own on the desktop, themed along with everything else.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop.Entertainment)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Entertainment) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop.Entertainment)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Entertainment) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](../../LICENSE)

![Minesweeper open in its own window on the UmbraDesktop desktop under the Windows 98 theme, with the launcher open down to its Games group, which lists Minesweeper, Snake and Solitaire, and the game's own taskbar button below.](docs/screenshots/entertainment-games-minesweeper.png)

Install it and the launcher grows a Games group. Open a game and it gets a window like everything else, in whichever theme you picked, so Minesweeper under the Windows 98 theme looks like Minesweeper, and under macOS it does not.

- **Minesweeper.** The real one: three difficulties, flags, flood fill, a mine counter and a timer.
- **Snake.** The classic, with arrow keys or WASD, a snake that speeds up as it grows, and your best score remembered.
- **Solitaire.** Klondike with draw one or draw three, Windows-style scoring, a bouncing cascade when you win, and a choice of card backs. A game you have not finished survives a refresh.

![Solitaire open in its own window on the UmbraDesktop desktop, a Klondike game on the card table with the stock, waste, four foundations and seven columns, and the settings button in the top right corner.](docs/screenshots/entertainment-games-solitaire.png)

## Get started

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Entertainment
```

That is all. UmbraDesktop comes with it if you do not have it yet, and the games appear in the launcher for anyone who can reach the desktop. You need Umbraco 17 and .NET 10.

[Games](docs/user/games.md) covers how to play, and how versions of this package and UmbraDesktop fit together.

## Writing your own

Nothing in here is privileged. Each game is a `umbraDesktopApp` manifest, the public route any package can use, so the source of this package is a worked example for putting your own app on the desktop. See [Building a desktop app](../../docs/developer/desktop-apps.md), and [Adding a card back or a card face set to Solitaire](docs/developer/solitaire-decks.md) for the one extension point of the games' own.

## Credits

- The court cards in Solitaire's Classic card faces are by Dmitry Fomin, from the English pattern playing cards on Wikimedia Commons, released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The source of each file is in [`backoffice/art/fomin/SOURCES.md`](backoffice/art/fomin/SOURCES.md).
- The corner ranks are outlined from Roboto Slab Bold, Copyright 2018 The Roboto Slab Project Authors, under the Apache License 2.0. The full text is in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md), which ships inside the package.

## License

[MIT](../../LICENSE)
