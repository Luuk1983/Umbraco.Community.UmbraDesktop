> **Note, 2026-09-30:** superseded in part by v2, see [2026-09-30-umbracoffee-v2-design.md](2026-09-30-umbracoffee-v2-design.md). Its data source (§3 to §5) and its window (§6.1) are replaced; the host changes (§7) stay. Read v2 first.

# umbraCoffee on the desktop: design

> umbraCoffee, the community's monthly live show, gets an app in the Entertainment package. The
> window shows the stream with its chat when the show is live, a countdown when it is coming up, and
> the latest episodes otherwise. A coffee cup appears in the taskbar tray when an episode is coming up
> or live, and the desktop reminds you ten minutes before and again when it starts. The start time is
> read from YouTube, not worked out from a calendar rule.

- **Status:** Implemented 2026-09-28, not yet verified in a browser. **Partly superseded
  2026-09-30** by [2026-09-30-umbracoffee-v2-design.md](2026-09-30-umbracoffee-v2-design.md): the
  data source (§3 watch pages, §4, §5 the server) and the window (§6.1) are replaced; the host changes
  (§7) stay
- **Date:** 2026-09-27
- **Branch:** `claude/entertainment-package-apps-9c4d8c`
- **Issue:** none yet
- **Target:** Umbraco CMS **v17**, packages `Umbraco.Community.UmbraDesktop.Entertainment` (the app,
  the endpoint, the tray item) and `Umbraco.Community.UmbraDesktop` (tray items for packages)

---

## 1. Goal & scope

The Entertainment package has two games. This is the first of three non-game apps shortlisted for it
on 2026-09-27: umbraCoffee, Winamp with internet radio, and a video player. Each gets its own design.
umbraCoffee goes first because every external fact it depends on has been checked (§3), while Winamp
waits on a spike into whether Webamp can live inside a desktop window.

The point is not a link to YouTube. It is that the desktop knows the show is about to start and puts
it in front of you, and that you can watch it and follow the chat without leaving the backoffice.

**In scope:**

- A backoffice endpoint in Entertainment that reads the umbraCoffee channel and reports the upcoming
  or live episode and the latest ones.
- An `umbraCoffee` app: stream, chat, countdown, episode list.
- A tray cup and two reminders per episode.
- In the host: a tray that exists (§7.1), tray items that packages can register (§7), and desktop
  toasts that draw the element of a notification the desktop raised itself (§7.2).

**Out of scope:**

- Winamp, radio and the video player. Their own designs.
- Opening an app with a payload. umbraCoffee does not need it (D11); the video player does, and it is
  designed there.
- The full back catalogue, resuming an episode where you stopped, chat as an attached pane (D10, D12).

## 2. Settled decisions

| # | Decision |
| --- | --- |
| D1 | On for everyone by default. One switch turns the cup and the reminders off together |
| D2 | Keyless only. The site's server reads the channel's RSS feed and the episode pages. No YouTube API key, and no setting for one |
| D3 | The endpoint caches for five minutes, so the site asks YouTube at most once per five minutes however many desktops are open |
| D4 | When YouTube cannot be reached or read, the endpoint returns what it last knew and says it is stale. The desktop then shows no countdown. A reminder can be missed, never wrong |
| D5 | The channel id is a constant. No configuration anywhere |
| D6 | The tray cup appears only while an episode is upcoming or live |
| D7 | Two reminders per episode: ten minutes before (or on first sighting, if that is later) and at going live. Each shown once per episode per browser |
| D8 | The switch lives in Desktop settings under the tray heading, and as "Stop reminding me" on the reminder itself. Not in the window |
| D9 | The host opens the tray, and only the tray, to packages through a `umbraDesktopTrayItem` manifest. Reverses "curated, not an extension point" in `taskbar/features/types.ts` for that region |
| D10 | The chat is a split inside the umbraCoffee window, not an attached pane |
| D11 | umbraCoffee needs no open-with-payload. The window works out what to show from the endpoint |
| D12 | The episode list is the feed's fifteen, plus one link to the channel for the rest. No resume |
| D13 | umbraCoffee goes in a new Media group that Entertainment registers, weight 65, which Winamp and the video player will join |
| D14 | The tray is ordered as in Windows: the clock and notifications nearest the corner, then the host's own tray features, then package items in the order they appeared. No weight for package items |
| D15 | A notification the desktop raises in its own document draws its own element on the desktop toast, buttons included. Notifications from windows stay plain data |
| D16 | The taskbar gains a tray container holding the tray items and the clock, and every theme styles the container instead of treating the clock as the whole tray |

## 3. What YouTube exposes, verified 2026-09-27

Every claim here was checked with requests against the live site, and copies of the pages are kept as
test fixtures (§9).

- **The channel** is `UCF_Ene5-58a3Z55aw8O6Djg` (`@umbraCoffee`). The show airs on the last Friday
  of the month at 11:30 UK / 12:30 CET, but that rule is only background: the design never computes a
  date from it.
- **The RSS feed** at `youtube.com/feeds/videos.xml?channel_id=…` answers without a key and holds the
  fifteen newest videos. It sends **no CORS header**, so backoffice JavaScript cannot read it. This is
  why there is a server part at all.
- **A scheduled stream is in the feed** once it is public. Checked on NASA's channel, which had one
  scheduled for 2026-09-28 19:00 UTC at the top of its feed. umbraCoffee's streams are public 30 to 60
  minutes before they start (Luuk, from watching them); the feed was not observed during that window.
- **The watch page carries the state.** An upcoming stream has `"isUpcoming":true`,
  `"scheduledStartTime"` (Unix seconds) and `"liveBroadcastDetails":{"isLiveNow":false,…}`. A stream
  that has ended has `"liveBroadcastDetails":{"isLiveNow":false,"startTimestamp":…,"endTimestamp":…}`;
  September's ran 10:30:09 to 11:24:22 UTC. A live one has `"isLiveNow":true`.
- **Embedding is allowed.** The September episode has `"playableInEmbed":true`.
- **The publish date lies about streams.** September's `publishDate` is 11:27:38 UTC, three minutes
  after the stream ended, although the stream was public before it started. Do not use it to decide
  anything about scheduling. It led this design astray once.
- **`/live` is a trap.** The channel's `/live` address resolves to umbraCoffee #114, scheduled for
  February 2020 and never aired. YouTube keeps an abandoned scheduled stream as "upcoming" forever,
  so a scheduled start in the past means nothing (§5).
- **The public API sees nothing more.** The Data API needs a key per project, which a package cannot
  ship (it would be public in every install, sharing one quota), and it only returns what is public:
  the same videos. Only the channel owner's authorised API sees private broadcasts. So a key would buy
  a documented format, not more information, and D2 drops it.

## 4. How it fits together

```
YouTube ── RSS feed ─┐
         watch pages ┤─> UmbraCoffeeService ─> endpoint ─> umbraCoffee store ─┬─> tray cup
                     │   (parse, cache 5 min)  (backoffice   (one per desktop, ├─> reminders
                                                access)       polls 5 min)     └─> window
```

Entertainment gains its first server code: a service, a management API controller, and a test
project. The controller follows the host's `DesktopLabelController`: backoffice access only, no
section policy. What it returns is public YouTube data, so there is nothing to gate beyond being
signed in, and a section policy would only hide the show from editors who can reach the desktop.

As built, the route is `GET /umbraco/management/api/v1/umbracoffee`, deliberately outside the
host's `umbradesktop` prefix (§11 says why).

On the client, one store per desktop document fetches the endpoint every five minutes while the switch
is on, and the tray cup, the reminders and any open umbraCoffee windows all read that store. Nothing
polls twice.

## 5. The server

`UmbraCoffeeService` fetches the feed, then the watch page of each entry it cannot yet classify, and
reduces them to this:

```json
{
  "current": { "videoId": "…", "title": "…", "state": "upcoming", "scheduledStart": "2026-10-30T11:30:00Z" },
  "episodes": [ { "videoId": "…", "title": "…", "published": "…" } ],
  "fetchedAt": "…",
  "stale": false
}
```

`state` is `upcoming` or `live`, and `current` is null when neither applies.

Rules:

- **Classify, then remember.** An entry whose page shows `endTimestamp`, or no `liveBroadcastDetails`
  at all, is finished and is never fetched again for the life of the process. Only unfinished entries
  cost a page request, and in practice that is none, or the one coming up.
- **Ignore a scheduled start that has long passed.** An upcoming stream whose start is more than six
  hours ago is treated as abandoned, per the `/live` trap in §3.
- **Consent.** Requests send `SOCS=CAI` and `Accept-Language: en`. Without them, a server in the EU
  can be redirected to YouTube's consent page (the `/live` probe from the Netherlands came back with
  `cbrd=1`).
- **Parsing lives in one class** with no I/O, fed strings, so an upstream change is one file and its
  fixtures.
- **Stale, not wrong (D4).** Any failure (egress blocked on a production server, a timeout, markup it
  cannot read) returns the last good result with `stale: true`, or an empty one if there never was a
  good result. It is logged once per failure streak, not every five minutes.

## 6. The client

### 6.1 The window

The app is an ordinary `umbraDesktopApp` in a `media` group (D13). Entertainment registers that
group in its existing `umbraDesktopCatalogue` manifest beside `games`, at weight 65: after Accessories
(55) and Games (60), before Experimental (70). It is "Media" rather than "umbraCoffee" or "Video"
because Winamp and the video player belong in it too. It opens on what matters now:

- **Live:** the stream through `youtube-nocookie.com/embed/<id>`, and the live chat beside it
  (`youtube.com/live_chat?v=<id>&embed_domain=<host>`), which the user can hide. Reading needs
  nothing; posting needs a YouTube sign-in in that browser and third-party cookies allowed.
- **Upcoming:** a card with the title and a countdown, and the start time written as the desktop's
  taskbar clock writes it: through the desktop settings context's public `formatDateTime`
  (documented in `docs/desktop-apps.md`), so it follows the user's regional format and 12/24-hour
  setting. The time asks for an hour and minutes rather than `timeStyle`, since the 12/24-hour
  override applies only when an hour is asked for. Under a desktop without that method, or outside
  one, it falls back to the backoffice language. The episodes' dates and the reminder's start time
  follow the same rule (`desktop-format.ts`).
- **Neither:** the latest episode, ready to play.

Under it, the feed's fifteen episodes, each playable in place, and one "All episodes on YouTube" link.
When the endpoint says `stale`, the window shows the episodes it has and no countdown. A line at the
bottom says the cup and the reminders can be switched off under Taskbar in Desktop settings (D8). It
says where, not whether they are on: the choice lives in the desktop's settings, which packages cannot
read, and one line of text is not worth new API.

Resizable, with a default size that fits a 16:9 player and the chat side by side. A window too narrow
for a usable player beside the chat hides the chat by itself, and the minimum size is below that
width.

As built, umbraCoffee opens **one window at a time** (`allowMultiple: false`). A second window would
play the same stream twice, and with one, the cup and the reminder's Watch (both `openApp`) bring the
open window to the front instead of stacking a new one on each click.

### 6.2 The tray cup

A `umbraDesktopTrayItem` (§7), on by default. It renders nothing unless the store has a `current`:

- **Upcoming:** a steaming cup. The tooltip says "umbraCoffee in 25 min" and the title.
- **Live:** the cup with a live dot.

Clicking it opens the umbraCoffee app by alias.

### 6.3 Reminders

Raised through Umbraco's notification context in the desktop document, so the notification centre
(#72) shows them like any other:

- **Soon:** when `scheduledStart − now ≤ 10 min`. If the stream is first seen later than that, it
  fires on first sighting; if it is first seen already live, only the live one fires.
- **Live:** when the state becomes `live`.

Each carries **Watch** (opens the app) and **Stop reminding me** (switches the tray item off). Each is
raised once per episode per browser, recorded in `localStorage` under the video id and the kind, so
two desktop tabs or a reload do not repeat it. A second browser or device may show it again; that is
accepted.

As built, three details the design did not name:

- **Only from a visible tab.** Every desktop tab has a cup, and a reminder raised in a background tab
  would be recorded as shown without anyone seeing it. A hidden tab's cup raises what is still due
  when the tab is shown again.
- **Timed, never `stay`.** "Soon" lasts until the start (at least a minute), "live" fifteen minutes,
  so the hidden original in the desktop's document clears itself (§11).
- **The buttons only inside the desktop.** The reminder draws Watch and Stop reminding me only once
  the tray context has arrived. Outside the desktop they would do nothing, and a Stop reminding me that
  switched nothing off would mislead, so there the reminder is text alone.

## 7. Host change: tray items for packages

A new manifest type, `umbraDesktopTrayItem`:

| Field | Required | Meaning |
| --- | --- | --- |
| `alias` | yes | Also the feature id its on/off choice is stored under. Must never change |
| `element` | yes | The element drawn in the tray. It sets `hidden` on itself while it has nothing to show |
| `meta.label` | yes | Localization key or literal: the switch's name in Desktop settings |
| `meta.description` | yes | Localization key or literal: the line under it |
| `meta.defaultEnabled` | no | Defaults to `true` |
| `conditions` | no | Honoured, as for `umbraDesktopApp` |

The design had the taskbar adapt each one to an `UmbraDesktopTaskbarFeature` in the `tray` region.
As built, tray items are **not** adapted. The tray context validates them into
a list of their own (`taskbar/tray/tray-items.ts`), and the taskbar and Desktop settings both read
that list. What the design wanted from the adaptation still holds: each item gets a switch under the
tray heading in Desktop settings (System tray icons), and its choice is stored under its alias in the
same `taskbarFeatures` map on the user account, which already keeps ids it does not recognise.
`isFeatureEnabled` now takes `{ id, defaultEnabled }`, so a tray item's default applies when the user
has no opinion. An alias equal to a host feature id, or one already taken by another tray item, is
dropped with a console warning, since the two would share one stored switch.

**Order (D14).** Windows lays the corner out as clock and notifications, then quick settings, then
everything else, and so does this. Reading outwards from the corner:

1. The clock, which already opens the notification scrollback.
2. The host's own tray features (the health indicator, #22, when it lands), in the host's fixed
   order, like Windows' quick settings.
3. Package tray items, in the order they appeared: an item that becomes visible joins at the end
   furthest from the clock, and keeps its place while it stays visible. An item that hides and comes
   back rejoins at the far end. "Visible" is the element's own `hidden` attribute, which the taskbar
   watches the same way the app host watches `data-umbradesktop-dirty`. The order is not stored:
   after a reload, items take their places as they appear again.

So there is no `weight` for a package item. A package cannot claim a place nearer the clock than an
item that was there first, and the host's own features always stay closer than any package item.

A small public context, provided by the desktop, gives package code exactly two things:

- `openApp(alias)`: open a registered app, as its launcher tile does.
- `setTrayItemEnabled(alias, enabled)`: switch a tray item on or off. The design limited it to the
  calling package's own item. As built, it accepts the alias of **any** registered tray item, since
  the context cannot tell which package is calling, and returns `false` for anything else, the
  host's own feature ids included. Nothing else in the settings is reachable. Both calls return a boolean: `openApp` is
  `false` when this user has no such app.

The launching end of the taskbar stays curated. That is the line #85 drew for the catalogue: packages
may add, the host keeps the order.

### 7.1 A tray that exists (D16)

Checked 2026-09-27: the tray region is declared in `taskbar/features/types.ts` but nothing draws it.
The taskbar renders the launcher button, the feature row, the window buttons and `.clock`, and the
themes style `.clock` as though it were the whole tray:

- **Windows 98 and Umbraco 4** make `.clock` the sunken well (Umbraco 4's test calls it "the tray").
  In Windows 98 the icons sit inside that well beside the time, so the well moves to the container.
- **Windows 11** pushes `.clock` right with `margin-left: auto`. A tray before it would sit against
  the centred cluster, so the push moves to the container.
- **macOS** ends the dock with the clock behind a separator. The items go inside that separator,
  before the time.
- **Umbraco** has no clock rule of its own and takes the base.

So the taskbar gets a `.tray` container, items first and the clock last, and all five themes restyle
the container. Each theme's existing taskbar test grows a case with an item present, and the result is
measured in a browser under every theme. An empty tray (every item hidden or off) must look exactly
like today's clock.

### 7.2 Buttons on a desktop notification (D15)

Checked 2026-09-27 in the code: a notification raised in the desktop's own document reaches the
desktop toast as plain data, headline and message only (`notification-watcher.ts` reads it through
`read-handler.ts`). Clicking it re-raises it as Umbraco's own toast in the desktop document, where
its element and buttons appear, unthemed, in Umbraco's position. Two clicks and a second toast.

Notifications are plain data because a window's document can close and the desktop must not hold on
to it (notifications design D5). The desktop's own document lives as long as the desktop, so that
reason does not apply to it. A desktop toast whose source is the desktop therefore renders the
notification's element itself, given its data and a handler whose `close()` dismisses the toast, the
way Umbraco's container hands one to a notification layout. The element sits inside the desktop, so
it can consume the desktop's contexts, which is how Watch reaches `openApp`. Notifications from
windows are unchanged.

## 8. Risks

Settled 2026-09-27: buttons on a desktop notification (§7.2) and the tray in every theme (§7.1).
Both became host work rather than blockers. Remaining:

1. **Feed latency.** YouTube caches the feed. A stream that becomes public 30 minutes ahead may reach
   the feed some minutes later, which eats into the ten-minute reminder. Check on 2026-10-30 from
   about 10:45 UK time. Does not block a release: the live reminder does not depend on it.
2. **Markup changes.** Accepted under D2 and D4. Contained by §5's single parser.

## 9. Testing

Test-first, per the repository's rules.

- **C#**, new project `Umbraco.Community.UmbraDesktop.Entertainment.Tests`: the parser against
  saved pages (NASA upcoming and the umbraCoffee September episode, captured 2026-09-27, trimmed to
  the parts the parser reads; a live page if one is captured), the feed parser, the classification
  and the six-hour abandonment rule, caching, stale-on-failure, and the controller's
  backoffice-access attribute.
- **TypeScript**, a pure module that takes the endpoint's answer, the clock and the reminder record
  and returns what to show and which reminders to raise. Then element tests for the window and the
  cup, and host tests for the tray manifest's validation, the tray order (host features nearest the clock,
package items by appearance, a hidden item rejoining at the far end), the settings screen, the
public context, and a desktop-sourced toast drawing its element while a window-sourced one does not.
- **Browser**, every theme with a tray item present and with none, and the window at its default and
  minimum sizes.

## 10. Documentation

- `docs/desktop-apps.md` §9: tray items, the tray context, and a notification with buttons. Done.
- Entertainment's `README.md`: umbraCoffee under What's in it, and a note that it contacts YouTube
  from the server. The root `README.md` wherever it lists what Entertainment brings, plus tray icons
  among the features, the taskbar section and the guide for package authors. Done.
- `umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json`: tags `umbracoffee`,
  `youtube`, `community`, `media` and `live stream`, and "Games" became "Games and media" in the
  Description, mirrored in the csproj. Done. **Still to do:** a screenshot, which needs a signed-in
  backoffice and so waits for the browser pass.
- This document, updated with what the build taught (§11).

## 11. What the build taught

Findings that are not obvious from the code, each with where it lives.

**Sessions and polling**

- **An authenticated poll keeps an idle session alive for ever.** The store asks through the
  backoffice's HTTP client, which refreshes an expired access token before sending, so a poll every
  five minutes would slide the session forward indefinitely. Polls therefore pause while the access
  token has lapsed, and only the user's own activity renews it (`store.ts`, `setPollGate`).
- **An answer older than two polls is distrusted in the browser.** The poll gate and a sleeping
  machine can both leave the store holding an old answer, and replaying an 11:15 "starts at 11:30" at
  13:00 would raise a reminder for a show that is over. So the schedule ignores `current` once the
  answer is older than two polls, and a returning desktop never raises a stale "starts soon"
  (`UMBRACOFFEE_MAX_ANSWER_AGE_MS`).

**Reminders and toasts**

- **Reminders are raised only from a visible tab** (§6.3).
- **The reminder draws its buttons only inside the desktop** (§6.3).
- **Desktop-drawn notifications must be timed.** The desktop draws its own toast and hides the
  original raised in its document. One raised with `stay` would linger there after the toast is gone;
  a timed one clears itself.

**The tray**

- **`UmbArrayState` would freeze the registry's manifests.** It deep-freezes the values it holds in
  place, and each tray item carries its manifest by reference, so `appendCondition` (which pushes into
  the original `conditions` array) would throw. The tray context uses `UmbBasicState`.
- **Lit maps a plain array of nodes by index.** Tray items render through `repeat` keyed by alias, so
  an item appearing or hiding does not move another item's element or recreate it.
- **Leaving the Desktop section destroys the whole desktop.** The router builds a new one on return,
  so tray items are new instances then. Anything that must survive that, such as which reminders were
  shown, belongs in storage (`docs/desktop-apps.md` §9.4).

**Server**

- **`JsonElement.TryGetProperty` throws on a value that is not an object.** The parser checks value
  kinds before reading properties, so odd markup is a parse failure (stale), not an unhandled
  exception.
- **The host's OpenAPI tooling reaches into this package.** The host's `generate-openapi.js` keeps any
  path starting with `/umbraco/management/api/v1/umbradesktop`, so the route is `umbracoffee` to stay
  out of the host's generated client. And the host's `PackageOperationIdHandler` claims every
  namespace starting with `Umbraco.Community.UmbraDesktop`, Entertainment's included, and names an
  operation by its action alone, so action and response names must be unique across both packages.

**Tests**

- **The test runner blocks frames.** Every Entertainment test page carries `frame-src 'none'`, so the
  window's tests assert on the player's and chat's addresses and never load YouTube
  (`web-test-runner.config.mjs`).
- **A failing chai assertion on an iframe hangs the page.** Formatting the element for the failure
  message never finishes, so frames are compared by identity as booleans instead.
