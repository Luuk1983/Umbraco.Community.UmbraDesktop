---
id: umbracoffee-testing
title: Testing umbraCoffee
description: Console commands that make umbraCoffee act as if an episode is upcoming, live, absent or unreachable, for checking the window, the tray cup and the reminders.
sidebar_position: 2
---

# Testing umbraCoffee

A real episode is live once a month, so umbraCoffee has console commands that make it act as if one
is upcoming or live, or as if the feed is unreachable. They are for checking the window, the
[tray cup and the reminders](../user/umbracoffee.md#the-tray-cup-and-the-reminders) in a real
backoffice. The commands exist in every installation, and change nothing but what the browser tab
they run in believes.

To use them, open the desktop, open the browser's developer tools, and type the commands in the
console. `umbraCoffee` is there once the tray cup or the umbraCoffee window has loaded, so if the cup
is switched off, open the window first. Each command returns a line saying what it did.

## Commands

| Command | What it does |
| --- | --- |
| `umbraCoffee.help()` | Lists the commands. |
| `umbraCoffee.simulate('upcoming', minutes)` | An episode starting in that many minutes, 8 if left out. Under 10, the "soon" reminder is due at once. |
| `umbraCoffee.simulate('upcoming', minutes, videoId)` | The same with a real YouTube video id. |
| `umbraCoffee.simulate('live')` | An episode live now. |
| `umbraCoffee.simulate('live', videoId)` | The same with a real YouTube video id, so the player and the chat have something to show. |
| `umbraCoffee.simulate('none')` | Nothing coming up: the window shows the latest episode and the cup goes. |
| `umbraCoffee.simulate('offline')` | The feed unreachable: the warning beside the gear, the packaged episodes, and the **Remind me** switch unavailable. |
| `umbraCoffee.reset()` | Back to the real feed. |
| `umbraCoffee.forgetReminders()` | Lets reminders show again in this browser. |
| `umbraCoffee.status()` | What the app believes now: what it is simulating, whether it is offline, the current episode and how many episodes it holds. |

A simulated episode is called "Simulated episode". The episode list, the summary and the guests stay
the real ones, so a real video id from the archive shows that episode's details under the player.

## Things to know

- **The start is fixed when you run the command.** `simulate('upcoming', 8)` counts down to a moment
  eight minutes after you typed it. Run it again for a new start.
- **A reminder shows once per episode.** Without a video id, each `simulate` makes a new episode, so
  a second run shows the reminder again. With a real id, run `forgetReminders()`, reload the page,
  and run the `simulate` again.
- **The simulation lasts until the page reloads.** A reload, or `reset()`, goes back to the real
  feed.
- **The chat of a past video is disabled.** YouTube only shows a live chat for a stream that is live,
  so `simulate('live', videoId)` with an old episode shows the player but an empty chat.
