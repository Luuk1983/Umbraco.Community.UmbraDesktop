![UmbraDesktop](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/src/Umbraco.Community.UmbraDesktop/Package-image_128_128.png)

# UmbraDesktop Entertainment

An optional add-on for UmbraDesktop that adds games and media to the desktop. So far that is Minesweeper, the classic Windows game, Snake, and umbraCoffee, the Umbraco community's monthly live show.

[![NuGet](https://img.shields.io/nuget/v/Umbraco.Community.UmbraDesktop.Entertainment)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Entertainment) [![NuGet Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.UmbraDesktop.Entertainment)](https://www.nuget.org/packages/Umbraco.Community.UmbraDesktop.Entertainment) [![License](https://img.shields.io/github/license/Luuk1983/Umbraco.Community.UmbraDesktop)](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE)

---

Install the entertainment package and the launcher grows a Games group and a Media group. Open an app and it gets a window like everything else, themed along with the rest of the desktop, so Minesweeper under the Windows 98 theme looks like Minesweeper and under the macOS theme does not.

![Minesweeper open in its own window on the UmbraDesktop desktop under the Windows 98 theme, with the launcher open down to its Games group, which lists Minesweeper and Snake, and the game's own taskbar button below.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/entertainment-games-minesweeper.png)

## What's in it

### Games

- **Minesweeper.** The real one: left-click to reveal, right-click to flag, flood fill on an empty square, a mine counter and a timer. Three difficulties.
- **Snake.** The classic: steer with the arrow keys or WASD, eat the food to grow longer, and don't hit the walls or your own tail. Ten points per piece of food, the snake speeds up as it grows, and your best score is remembered in your browser. Space pauses, and the game pauses by itself when its window loses focus, so minimising it doesn't get you killed.

Both games open in a fixed-size window, the way Minesweeper did on Windows: you can move and minimise it, but not resize or maximise it.

![Snake open in its own window on the UmbraDesktop desktop under the Windows 98 theme, with its score, New game button and best score above the board, and the launcher open down to its Games group, which lists Minesweeper and Snake.](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/entertainment-games-snake.png)

### umbraCoffee

umbraCoffee is the community's monthly live show, and it lives in the Media group. The window opens on whatever matters now:

- **Live:** the stream, with the live chat beside it. Reading the chat needs nothing; posting in it needs you signed in to YouTube in that browser, with third-party cookies allowed.
- **Coming up:** a countdown in days, hours and minutes, with the start time written like the desktop's clock, following your Regional format and Clock settings.
- **Otherwise:** the latest episode, ready to play.

The video is YouTube's own player, but the controls under it are ours: play and pause, a seek bar, volume, captions, full screen and a link to watch on YouTube. They are drawn in the style of the theme you picked, so the window looks native under each of the five and follows the light or dark palette of the desktop. The side panel beside the player has two tabs, Chat (live only) and Episodes, newest first, thirty at a time, each playable in place. A button in the header hides the panel, and a window too narrow for both moves it under the player. The window can be resized and maximised. umbraCoffee opens one window at a time, so opening it again brings the one you have to the front.

Under the player is the episode playing: its title, its date, a short summary of what it covers, and its guests on a line starting **With:**. An episode with nothing to say there leaves that part out.

To find an old episode, use the search field at the top of Episodes, **Title, topic or guest**. It looks in every episode's title, summary and guest names, ignores case and accents, and every word you type has to match. Under it, **All guests** lists everyone who has been on the show with how many episodes they were in, so you can pick one person and see only their episodes. Both work on the whole archive, not just the rows already shown, and the panel says how many episodes match. When nothing does, **Show all episodes** clears both.

You do not have to remember to open it. While an episode is coming up or live, a coffee cup sits in the taskbar beside the clock: steaming while it is coming up, with a red dot once it is live. Point at it for the title and how long until it starts, and click it to open umbraCoffee. The rest of the month the cup is not there at all.

The desktop also reminds you twice per episode: ten minutes before it starts, and again when it goes live. Each reminder has two buttons. **Watch** opens umbraCoffee, and **Stop reminding me** turns the cup and the reminders off. Each reminder is shown once per episode in each browser, so a second tab or a reload does not repeat it.

The cup and the reminders are one switch. It is called umbraCoffee under Taskbar in Desktop settings, System tray icons, and the same switch is in the umbraCoffee window as **Remind me**. The two stay in step, even with both open. It is on by default. The umbraCoffee app itself stays in the launcher either way.

That is the whole list for now. Solitaire is the obvious next game and is not in this release.

## Installation

```bash
dotnet add package Umbraco.Community.UmbraDesktop.Entertainment
```

The host package comes with it as a dependency, so if you do not have UmbraDesktop yet, this installs it too. No configuration, no section to grant, no dashboard to enable: the apps appear in the launcher for anyone who can reach the desktop.

### Where umbraCoffee gets its data

Your server makes no outbound calls for umbraCoffee, and nothing needs configuring. A scheduled job in this package's GitHub repository, which is where the package's source lives, reads the umbraCoffee channel and keeps the data up to date on a branch called `data/umbracoffee`. The editor's browser reads two small JSON files from it on `raw.githubusercontent.com`: the list of episodes, and the next episode when one is coming up or live. So the only machine that talks to GitHub is the one the editor is sitting at. Reading GitHub is not tied to the Umbraco session, so it never keeps an idle backoffice session signed in.

The browser looks every 30 minutes, and every minute while an episode is live or about to start. The job that writes the files runs about every five minutes, though GitHub sometimes starts a run 10 to 15 minutes late. Stream pages go public well before the show starts, so the reminders still come in good time, and a next-episode file that has not been refreshed for half an hour is ignored rather than trusted.

If the browser cannot reach GitHub, for example behind a proxy that blocks it, umbraCoffee says so at the top of the window and shows the episodes that came with the package, with the date they are up to. There is no countdown, no cup and no reminders until it is back, and the Remind me switch shows as unavailable with the reason. It checks again on its next look.

The package ships a snapshot of the episode list for exactly that case, summaries and guests included. It is refreshed before each release, so it can be some weeks behind. The browser only loads it when it cannot reach GitHub.

### Where the summaries and guests come from

Each episode's summary and guest list were written once from its YouTube description by an AI model, and the maintainer reviewed them. They live on the same data branch and reach your browser in the episode list, so nothing calls an AI from your server or your browser. The guests are only the people the description names as being on the show, never the hosts.

New episodes are filled in by the maintainer on their own machine, about once a month. So a new episode can show in the list with no summary and no guests for a while, and search finds it by its title until then.

### If your site has a Content Security Policy

Umbraco sets none by default. If yours adds one, umbraCoffee needs these allowed in the backoffice:

| Directive | Host |
|---|---|
| `script-src` | `https://www.youtube.com` |
| `frame-src` | `https://www.youtube.com`, `https://www.youtube-nocookie.com` |
| `img-src` | `https://i.ytimg.com` |
| `connect-src` | `https://raw.githubusercontent.com` |

Without them the window still opens, but the player, the chat, the thumbnails or the data will be blocked, and a blocked data host looks like being offline.

### YouTube's terms

The video and the chat are YouTube's own embeds, so using them is using YouTube. By using umbraCoffee you agree to be bound by the [YouTube Terms of Service](https://www.youtube.com/t/terms). The package itself collects nothing about you. What it stores stays in your browser: your Remind me choice, which is kept with the rest of your desktop settings, and a note of which reminders it has already shown you.

### Prerequisites

- Umbraco 17
- .NET 10
- UmbraDesktop, the same version as this package or any later 17.x (installed automatically)

## Versions

This package and UmbraDesktop are released together from the same tag and always share a version number, so matching versions are the compatibility answer. It needs at least the UmbraDesktop release it came with, because it uses desktop features that earlier releases lack. If your site references an older UmbraDesktop directly, upgrade that reference along with this one, or NuGet stops with a package downgrade error. Any later 17.x desktop works too, so upgrading the desktop on its own is fine.

## Writing your own

Nothing in here is privileged. The `umbraDesktopApp` extension manifest that puts each app in a window, and the `umbraDesktopTrayItem` manifest that puts the umbraCoffee cup beside the clock, are public API that any package can register, and this package uses no other route in. If you want your own app or tray icon on the desktop, [`docs/desktop-apps.md`](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/desktop-apps.md) is the guide, and the source of this package is the worked example.

## License

MIT. See [LICENSE](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE).
