---
id: games
title: Games
description: Install the Entertainment add-on and play Minesweeper and Snake on the desktop.
sidebar_position: 1
---

# Games

UmbraDesktop Entertainment puts Minesweeper and Snake on the desktop, each in a window of its own,
under whichever theme is in use. So Minesweeper under the Windows 98 theme looks like Minesweeper, and
under the macOS theme does not.

The games ship in their own package rather than in UmbraDesktop, because a desktop and a minesweeper
are not the same product, and nobody should have to take the second to get the first.

## Install

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Entertainment
```

That is the whole installation. UmbraDesktop comes with it as a dependency, so it is installed too if
it is not there yet. There is no section to grant and no dashboard to enable: the games appear in a
**Games** group in the launcher for anyone who can already reach the desktop. Without the package,
the group is not there at all.

Prerequisites:

- Umbraco 17
- .NET 10
- UmbraDesktop 17.x, installed automatically

## Play

To start a game, open the launcher and select **Minesweeper** or **Snake** in the Games group.

Both open in a fixed-size window, the way Minesweeper did on Windows: the window can be moved and
minimised, but not resized or maximised.

### Minesweeper

![Minesweeper open in its own window on the UmbraDesktop desktop under the Windows 98 theme, with the launcher open down to its Games group, which lists Minesweeper and Snake, and the game's own taskbar button below.](../screenshots/entertainment-games-minesweeper.png)

The real one, with three difficulties, a mine counter and a timer.

- To reveal a square, left-click it. An empty square reveals its neighbours too.
- To flag a square, right-click it.

### Snake

![Snake open in its own window on the UmbraDesktop desktop under the Windows 98 theme, with its score, New game button and best score above the board, and the launcher open down to its Games group, which lists Minesweeper and Snake.](../screenshots/entertainment-games-snake.png)

Eat the food to grow longer, and do not hit the walls or your own tail.

- To steer, use the arrow keys or WASD.
- To pause, press Space.
- To start again, select **New game**.

Each piece of food is worth ten points, and the snake speeds up as it grows. The best score is
remembered in the browser. The game also pauses by itself when its window loses focus, so minimising
it does not end the game.

A game starts fresh when the desktop [reopens its windows](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/user/settings/reopening-windows.md)
after a reload.

## Versions

This package and UmbraDesktop are released together from the same tag and always share a version
number, so matching versions are the compatibility answer. The dependency on UmbraDesktop is a range
rather than an exact version, so upgrading the desktop on its own is fine.

## Writing your own

Nothing in this package is privileged. It reaches the desktop through the same public manifests any
package can register: a `umbraDesktopApp` for each game, and a catalogue for the Games group. So its
source is the worked example for putting an app of your own on the desktop. See
[Building a desktop app](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/developer/desktop-apps.md)
in the UmbraDesktop developer guide.
