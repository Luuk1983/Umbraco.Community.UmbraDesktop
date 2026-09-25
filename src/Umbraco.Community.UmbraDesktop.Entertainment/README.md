![UmbraDesktop](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop Entertainment

An optional add-on for UmbraDesktop that adds entertainment, like games to the desktop. So far that is Minesweeper, the classic Windows game, and Snake.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop.Entertainment)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Entertainment) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop.Entertainment)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Entertainment) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE)

---

Install the entertainment package and the launcher grows a Games group. Open a game and it gets a window like everything else, themed along with the rest of the desktop, so Minesweeper under the Windows 98 theme looks like Minesweeper and under the macOS theme does not.

![Minesweeper open in its own window on the UmbraDesktop desktop under the Windows 98 theme, with the launcher open down to its Games group, which lists Minesweeper and Snake, and the game's own taskbar button below.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/entertainment-games-minesweeper.png)

## What's in it

- **Minesweeper.** The real one: left-click to reveal, right-click to flag, flood fill on an empty square, a mine counter and a timer. Three difficulties.
- **Snake.** The classic: steer with the arrow keys or WASD, eat the food to grow longer, and don't hit the walls or your own tail. Ten points per piece of food, the snake speeds up as it grows, and your best score is remembered in your browser. Space pauses, and the game pauses by itself when its window loses focus, so minimising it doesn't get you killed.

Both open in a fixed-size window, the way Minesweeper did on Windows: you can move and minimise it, but not resize or maximise it.

![Snake open in its own window on the UmbraDesktop desktop under the Windows 98 theme, with its score, New game button and best score above the board, and the launcher open down to its Games group, which lists Minesweeper and Snake.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/entertainment-games-snake.png)

That is the whole list for now. Solitaire is the obvious next one and is not in this release.

## Installation

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Entertainment
```

The host package comes with it as a dependency, so if you do not have UmbraDesktop yet, this installs it too. No configuration, no section to grant, no dashboard to enable: the games appear in the launcher for anyone who can reach the desktop.

### Prerequisites

- Umbraco 17
- .NET 10
- UmbraDesktop 17.x (installed automatically)

## Versions

This package and UmbraDesktop are released together from the same tag and always share a version number, so matching versions are the compatibility answer. The dependency is a range rather than an exact pin, so upgrading the desktop on its own is fine.

## Writing your own

Nothing in here is privileged. The `umbraDesktopApp` extension manifest that puts each game in a window is public API that any package can register, and this package uses no other route in. If you want your own app on the desktop, [`docs/desktop-apps.md`](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/desktop-apps.md) is the guide, and the source of this package is the worked example.

## License

MIT. See [LICENSE](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE).
