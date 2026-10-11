# umbraCoffee v2: design

> umbraCoffee gets its data from this repository instead of from YouTube on every customer site. A
> GitHub Action keeps two small files up to date: the episode list, from the RSS feed only, and the
> next episode, from the YouTube Data API only while an episode is coming up or live. The editor's
> browser reads both files from GitHub, so a customer's Umbraco server never calls out. The app
> itself is redesigned after the 2026-09-30 mock, with our own themed player controls on YouTube's
> player, and a reminder switch in the app.

- **Status:** Built 2026-09-30, not yet verified in a real browser or run on GitHub. Replaces parts of the first design (see §9). What the build changed is in §12
- **Date:** 2026-09-30
- **Branch:** `claude/entertainment-package-apps-9c4d8c` (worktree
  `.claude/worktrees/package-catalogue-manifest-f7eda8`). Everything on it is uncommitted
- **First design:** [2026-09-27-umbracoffee-design.md](2026-09-27-umbracoffee-design.md). Its host
  changes (tray, tray context, toasts with buttons, closing hidden originals, `formatDateTime`, the
  bounded dependency) all stay. Its data source and window are what this document replaces
- **Mock:** [mockups/2026-09-30-umbracoffee-redesign.html](mockups/2026-09-30-umbracoffee-redesign.html).
  Static, no scripts; open it in a browser
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop.Entertainment`, plus one
  small host addition (§6)

---

## 1. Why a second version

The first version worked (browser pass 2026-09-28) but had four problems, found after it was built:

1. **Customer servers called YouTube.** Many hosting setups and WAFs block outbound calls by default,
   and the owner does not want the package to depend on them.
2. **The start time came from scraping.** The server read each new video's watch page for
   `ytInitialPlayerResponse`. YouTube's Terms of Service forbid automated access ("robots, botnets or
   scrapers"), and the API Developer Policies (III.E.6) forbid API clients from scraping YouTube's
   pages. Embedding the player makes the package an API client. RSS is a grey area (YouTube
   advertises the feed; its robots.txt disallows it) and the owner accepts that. The watch page is
   not grey.
3. **Only 15 episodes.** Every RSS feed YouTube offers stops at the 15 newest. The channel has about
   349 videos.
4. **The window was plain.** The owner called the styling and functionality "very meh" and asked for
   a professional, Umbraco-native app that changes per theme, with our own styled player.

Research behind this (2026-09-29, verified by real requests unless noted):

- Nothing keyless and legitimate gives a scheduled start time. Only the watch page (scraping) or the
  Data API (`videos.list`, `liveStreamingDetails.scheduledStartTime`) does.
- A YouTube Data API key is free: a Google Cloud project, the API switched on, no billing account.
  The default quota is 10,000 units a day. `videos.list` and `playlistItems.list` cost 1 unit each.
- The Developer Policies (III.E.4) allow storing API data for at most 30 days, then it must be
  refreshed or deleted. RSS and oEmbed are not API Services, so the rule does not apply to them.
- `raw.githubusercontent.com` and GitHub Pages serve files with `Access-Control-Allow-Origin: *`
  (max-age 300 and 600), so a browser on any backoffice can read them.
- oEmbed (`https://www.youtube.com/oembed?format=json&url=…`) is readable cross-origin and gives
  title, channel and thumbnail. No dates, durations or live state.
- The YouTube IFrame Player API is documented and keyless. `controls=0` is a documented parameter. The
  policies forbid drawing anything over the player, require at least 200×200 px (480×270 recommended
  with controls) and forbid autoplay before more than half of the player is visible.
- GitHub cannot push to browsers. Scheduled Actions run at most every 5 minutes, often start 10 to 15
  minutes late at busy times, and are switched off after 60 days without repository activity.

## 2. Settled decisions

| # | Decision |
| --- | --- |
| E1 | No outbound calls from customer servers. The Entertainment package's server code for umbraCoffee is removed (§9) |
| E2 | The data lives in this repository, kept up to date by a scheduled GitHub Action, served from `raw.githubusercontent.com` on a dedicated data branch, and read by the editor's browser |
| E3 | The episode list is filled once by a manual scrape (all ~349 episodes), then from RSS only. oEmbed enriches it (titles for backfilled ids, title changes). No API data in it, so the 30-day rule never applies |
| E4 | The next episode is a separate file, filled from the YouTube Data API only while an episode is coming up or live, and emptied once it has ended. API data is never kept for more than hours |
| E5 | No push. The browser polls: every 30 minutes normally, every minute while the next-episode file holds an episode that is upcoming within two hours or live |
| E6 | A snapshot of the episode list ships in the package. When GitHub cannot be reached the app says so plainly: it shows the snapshot's episodes "up to" its date, and says reminders are unavailable |
| E7 | Durations are dropped everywhere. Only the API has them for new episodes, and keeping them would bring back the 30-day rule |
| E8 | Dates come from RSS `published` (and the backfill). For a stream that can be the upload moment rather than the air date, a day off at worst. Accepted |
| E9 | The reminder can be switched off in the app too, with a "Remind me" switch. It is the same stored switch as Desktop settings. The host's tray context gains a way to read it (§6) |
| E10 | The poll gate that kept idle Umbraco sessions able to time out goes. Reading GitHub never touches the Umbraco session |
| E11 | The window is rebuilt after the mock (§5): our control bar under YouTube's player with its controls off, a themed player per theme, a countdown hero, an episode list with thumbnails, the chat in a tab |
| E12 | The player is a shared component in the Entertainment package with a YouTube engine now and an HTML5 `<video>` engine later, for the planned Video Player app |
| E13 | The YouTube API key for the next-episode file is a free key, stored as the repository secret `YOUTUBE_API_KEY`. The episode list needs no key |

## 3. The two files

Both are JSON on the data branch (name decided in the plan, for example `data/umbracoffee`), under a
folder such as `umbracoffee/`. The browser reads them from
`https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/<branch>/umbracoffee/…`.
The URL is one constant in the package.

### 3.1 `episodes.json`

```json
{
  "version": 1,
  "generatedAt": "2026-09-30T09:00:00Z",
  "episodes": [
    { "videoId": "aRkc0fRxQjw", "title": "The September Shift", "published": "2026-09-25T11:27:38Z", "description": "…" }
  ]
}
```

- Newest first. `title` without the "umbraCoffee - " prefix (strip it when writing, keep the raw
  title if it has no prefix).
- `description` in full, because search and chapters (later, §10) need it. Measured on the current
  feed: about 856 characters on average, so about 340 KB for 349 episodes, about 93 KB gzipped.
- No thumbnails: they are built from the id (`https://i.ytimg.com/vi/<id>/mqdefault.jpg`).
- No durations (E7), no live state.

### 3.2 `next-episode.json`

```json
{
  "version": 1,
  "updatedAt": "2026-10-30T11:05:00Z",
  "episode": {
    "videoId": "…",
    "title": "…",
    "state": "upcoming",
    "scheduledStart": "2026-10-30T11:30:00Z",
    "actualStart": null
  }
}
```

- `episode` is `null` when nothing is coming up or live. That is its normal state.
- `state` is `upcoming` or `live`. When the API reports the stream ended, the Action empties the file
  (E4) and the episode is in `episodes.json` through RSS anyway.
- `updatedAt` is written on every run while `episode` is set. The browser trusts an upcoming or live
  episode only while `updatedAt` is fresh (threshold in the plan, about 30 minutes, derived from the
  Action's interval plus GitHub's usual delay). A stale file is "missed, never wrong", as before.
- The first design's late-start grace stays: an upcoming episode more than 30 minutes past its start
  and still not live is not trusted.

## 4. The GitHub Action

A workflow in `.github/workflows/`, on a 5-minute schedule and manual dispatch. Its logic is a small
Node script in the repository (for example `tools/umbracoffee-feed/`) so it is testable with the RSS
fixtures already in `src/Umbraco.Community.UmbraDesktop.Entertainment.Tests/UmbraCoffee/Fixtures/`.

Each run:

1. Read the channel's RSS feed (`feeds/videos.xml?channel_id=UCF_Ene5-58a3Z55aw8O6Djg`). No key.
2. Add every entry whose id is not in `episodes.json`, newest first. Check its title with oEmbed.
3. For each new id, one `videos.list` call (`part=snippet,liveStreamingDetails`, 1 unit). If it is
   upcoming or live, write it to `next-episode.json`.
4. While `next-episode.json` holds an episode, one `videos.list` call per run to update its state. When
   it has ended, empty the file. An upcoming episode more than six hours past its scheduled start is
   treated as abandoned and dropped (the channel has one such stream from 2020, #114).
5. Commit and push to the data branch only when something changed.

Quota: a handful of units per episode, far below the free 10,000 a day. Without `YOUTUBE_API_KEY` the
Action still keeps `episodes.json` current and leaves `next-episode.json` empty.

The data branch keeps its commits out of `main`. The 60-day inactivity switch-off counts activity on
the repository; development on `main` is enough, and a run that commits counts too. The plan should
confirm this and add a fallback if it does not hold (a monthly no-op commit, or a note in RELEASE.md).

The one-off backfill (E3) is a manual step, not part of the Action. Its output is committed to the
data branch as the first `episodes.json`. The scrape itself is not kept in the repository.

## 5. The app

The mock is the reference for layout, states and per-theme looks. What it shows, and what changes
against it:

- **States:** live (player, control bar, Chat and Episodes tabs beside it), upcoming (countdown hero
  with days, hours and minutes, the start time through the desktop's `formatDateTime`, "Remind me",
  "Watch the last episode"), on demand (player, details, list), and a narrow layout at about 480 px
  where the side panel moves under the player.
- **Offline (new, E6):** when either file cannot be fetched, a clear notice at the top of the window
  ("Can't reach the umbraCoffee feed. Showing episodes up to 25 September. Reminders are off until it
  is back."), the snapshot's episodes, and the cup hidden. Checked again on the next poll.
- **Durations** are gone from the mock's list (E7). The mock's chapters are later work (§10).
- **"Remind me"** in the app is the tray item's switch (E9). The old footer line goes.
- **The player:** YouTube's embedded player with `controls=0`, driven by our control bar through the
  IFrame Player API (play, pause, seek, volume, mute, captions, fullscreen of our own container,
  "Watch on YouTube"). The API script is loaded from YouTube only when the window opens. Nothing of
  ours is drawn over the video. YouTube still shows its own small title and logo inside the frame.
- **Per theme:** the control bar and window content follow the theme through the
  `data-umbradesktop-theme` attribute the desktop stamps on an app element (`docs/desktop-apps.md`),
  as the games do: Umbraco-native for Umbraco, the 2010 look for Umbraco 4, QuickTime or Music for
  macOS, the new Media Player for Windows 11, Windows Media Player 6.4 for Windows 98. Tokens first,
  theme blocks as refinements. A theme may restyle, never remove.
- **Chat:** YouTube's live chat page in a frame (`youtube.com/live_chat?v=<id>&embed_domain=<host>`),
  only while live. Anyone can read; posting needs a YouTube sign-in in that browser and third-party
  cookies allowed (Chrome and Edge by default; Safari and Firefox block them, so read-only there). It
  is YouTube's page, so its colours are YouTube's. Undocumented but long-standing, so treat it as
  fragile.
- **Thumbnails** from `i.ytimg.com` (CORS allowed), with a gradient fallback.

### 5.1 The shared player

A component in the Entertainment package (for example `backoffice/src/media-player/`): the control
bar and the player frame, with an engine interface (load, play, pause, seek, volume, mute, captions,
state and time events). The YouTube engine wraps the IFrame Player API. An HTML5 `<video>` engine
comes with the Video Player app and is not part of this work. Only what umbraCoffee needs is built
now; the interface is shaped so the second engine fits without changes.

### 5.2 What stays from the first version

The store (reworked to read the two files and to know offline), the schedule rules (reworked for the
new shapes: soon at ten minutes, live once, never repeat, visible tab only, late-start grace, stale
means nothing current), the reminder record, the tray cup, the reminder element with Watch and "Stop
reminding me", `allowMultiple: false`, the Media group, and the time formatting through the desktop's
`formatDateTime` with the `localize.date` fallback.

## 6. Host change: reading a tray item's switch

The tray context (`UmbraDesktopTrayContext`) can already switch a tray item on or off
(`setTrayItemEnabled`). It gains one read: an observable of whether a given tray item is switched on,
following the user's stored choice and the item's default, so the app's "Remind me" and Desktop
settings stay in step while both are open. Name and shape are decided in the plan. It is part of the
public contract and goes into `docs/desktop-apps.md` §9.8.

## 7. Risks

1. **GitHub blocked in the editor's browser.** Some corporate proxies block `raw.githubusercontent.com`.
   Covered by the snapshot and the offline notice (E6). GitHub Pages is an alternative host if raw
   turns out to be blocked more often; the URL is one constant.
2. **Action delays.** Runs can start 10 to 15 minutes late. The stream goes public 30 to 60 minutes
   before it starts, so the reminder still arrives in time. To measure on 2026-10-30.
3. **The IFrame API script in the backoffice.** It is YouTube's documented script, loaded only when the
   window opens. Umbraco sets no Content Security Policy by default; a site that adds one needs
   `www.youtube.com` allowed. Say so in the README.
4. **The chat frame** is undocumented (§5).
5. **Grey areas accepted by the owner:** reading RSS from the Action (robots.txt disallows the feed),
   and publishing a file of API-derived data that anyone can read (III.I forbids offering "an API
   service"; the next-episode file is our own app's cache and holds data for hours only).
6. **The API client obligations.** Using our own key makes umbraCoffee an API client. The plan checks
   which obligations apply to an app that reads only public data (for example telling users they
   agree to YouTube's Terms of Service) and adds them to the README and the app.

## 8. Testing

- The Action's script: unit tests over the RSS fixtures and recorded API answers (upcoming, live,
  ended, abandoned), and a dry run against the real feed without committing.
- The client: the existing test-first pattern (web-test-runner in Chrome, frames blocked by CSP in the
  test page), with the files served from test fixtures. Offline, stale and late cases each get a test.
- A browser pass under all five themes at default and minimum size, with the next-episode file faked
  (Chrome DevTools "Override content" works on a real instance).

## 9. What this replaces in the current branch

To remove, all uncommitted:

- `src/Umbraco.Community.UmbraDesktop.Entertainment/UmbraCoffee/`, `Api/UmbraCoffeeController.cs`,
  `Composing/UmbraCoffeeComposer.cs`.
- `src/Umbraco.Community.UmbraDesktop.Entertainment.Tests/` (the project), its `.slnx` entry, its
  restore, cache-key and test lines in `.github/actions/build-packages/action.yml`. The RSS fixtures
  move to the Action's tests first.
- The poll gate in the client store, and its wiring in the window and the cup (E10).
- The first design's §3 (watch-page facts as a data source), §4 and §5 (the server), and the window
  parts of §6.1. The first design doc gets a dated note pointing here.

To keep: everything in the host, the bounded dependency and the `17.99999999` ceiling, the Media group,
and the client pieces listed in §5.2.

## 10. Open questions

1. **Chapters** from the timestamps in episode descriptions (the mock shows them): later, unless the
   owner wants them now.
2. **Windows 11 in dark** as the mock draws it, or its light palette when the backoffice is light.
3. **Search** across the whole archive: answered 2026-10-01, built. A search over title, summary
   and guest names, and a guest filter, both over the whole archive (§12, and the addendum in the v2
   plan).
4. **The data branch name**, and raw versus GitHub Pages as the host.

## 11. Documentation

- Entertainment README: umbraCoffee rewritten for v2 (where the data comes from, no server calls,
  offline behaviour, the CSP note, YouTube's terms if required).
- `docs/desktop-apps.md` §9.8: the new tray context read.
- `RELEASE.md`: the Action, the key secret, the data branch, and the snapshot being refreshed at pack
  time.
- This document, updated with what the build teaches.

## 12. What the build taught

Facts from the build, in the order the plan ran. Where the code and the sections above disagree, the
code is right.

**Decisions taken for the §10 open questions**

- Data branch `data/umbracoffee`, folder `umbracoffee/`, served from `raw.githubusercontent.com`. One
  constant, `UMBRACOFFEE_DATA_BASE_URL`, so GitHub Pages is a one-line change.
- Chapters: not built. Archive search: built after the first pass, see "Summaries, guests and
  search" below.
- Windows 11 follows the backoffice: tokens first, so it is dark or light with the desktop's palette.
- Stale threshold for `next-episode.json`: 30 minutes (`UMBRACOFFEE_NEXT_MAX_AGE_MS`), the Action's
  five minutes plus a 25 minute allowance for a late start.
- Store poll: 30 minutes normally, one minute while the episode is live or upcoming within two hours.

**Where the build deviates from the design**

- **oEmbed only when a feed entry has no title.** §4 step 2 checks every new entry. The feed already
  carries titles, so `run.mjs` asks oEmbed only when a title is empty, and the backfill uses it for
  the titles of ids that have none.
- **Partial data.** §5 says offline when either file cannot be fetched. The store does say offline
  then and drops `current`, but when only `episodes.json` arrived it keeps that list, and when neither
  did it keeps the last good list, else the snapshot's. `next-episode.json` alone is never believed
  without the episode list.
- **The upcoming hero has no player bar.** It holds the bar's height as an empty strip with a link to
  the waiting room on YouTube, so the window does not jump when the stream starts.
- **A side-panel toggle.** A header button hides the panel. The panel drops under the player by a
  container query on the window's own width, derived from the size constants, not by script.
- **The held-live rule.** A live stream the window is showing stays until an answer it can believe
  says otherwise: the feed was reachable and either says nothing is current or says something fresh.
  This is the window's own test (`answers` in the element). The schedule's `trusted` answers a
  different question, whether the cup and reminders may act, and returns nothing for an empty file,
  so it could not decide that a stream had ended.
- **Remind me on an older desktop.** `trayItemEnabled` is optional in the local context type. Without
  it the switch is drawn disabled with the pointer to Desktop settings, never hidden.
- **The snapshot** is the version 2 `episodes.json` whole (it first trimmed descriptions to 280
  characters, until version 2 dropped them) and takes its date from the file's own `generatedAt`, so
  re-running it over the same file gives the same bytes.
- **The player frame** is on `www.youtube-nocookie.com`; the IFrame API script and the chat frame are
  on `www.youtube.com`. The README's Content Security Policy table lists what that means.

**Summaries, guests and search (2026-10-01)**

Built after the first pass, from the addendum at the end of the v2 plan, which has the file shapes.

- **Transcripts are ruled out.** The Data API's `captions.download` needs edit permission on the
  video (OAuth as its owner), and the watch page withholds captions from scripts with
  `LOGIN_REQUIRED`. Neither is open to a third party.
- **Descriptions are the source.** Of 14 sampled older episodes, 7 name their guests in one
  sentence and 13 list topics. That is enough for a summary on nearly every episode and guests on
  about half.
- **The backfill numbers.** 347 episodes, 182 with named guests, 142 distinct guests, 65 flagged
  uncertain, 10 with no summary (nothing in the description or the title to summarise).
- **Files split by purpose.** Descriptions were 680 KB of the ~870 KB `episodes.json`, so they moved
  to `sources.json`, which the app never reads. The app's file (version 2) is 184 KB raw and 39 KB
  gzipped.
- **The snapshot is lazy.** It is loaded with a dynamic `import()` in its own chunk, only when the
  first answer had no episode list, so a normal desktop start does not pay for 184 KB. One static
  import anywhere would undo that.
- **`guestsUnnamed` relaxed.** The first rule set it only when no guest was named. Descriptions often
  name one guest and mention others ("joined by Jane Doe and the rest of the team"), so it is now set
  beside named guests too.
- **The window opens 20 px taller**, at a content height of 696, for the guests line in the details
  card. The card's height is the sum of its line constants, so an episode without guests does not
  shorten it.

**Other things worth knowing**

- The Action queues rather than cancels overlapping runs, so a run is never killed between writing
  and pushing, and it creates the orphan data branch itself on the first run.
- The tool builds error messages afresh so the API key, which is in the request URL, cannot reach a
  public log.
- The backfill needs `id,published` lines. Bare ids are refused: oEmbed has no dates.
- The one-off backfill was run locally on 2026-10-01, outside the repository as E3 says: the 349 ids
  from the channel's uploads playlist, each watch page's `publishDate` and description, then the
  summaries and guests. Two of the 349 are missing (one private or removed, one with no date). The
  result is a filled data folder, not yet pushed. Owned by the maintainer: pushing it as the first
  commit of the data branch, the `YOUTUBE_API_KEY` secret, and the first real run of the workflow
  (RELEASE.md). Whether a push to the data branch counts as activity for GitHub's 60-day
  switch-off has not been observed.
- YouTube's API Developer Policies (III.A.1) ask an API client to link to the YouTube Terms of Service
  and to state in its own terms that using it means agreeing to them; the policy page says this
  applies to clients that only embed the player. The Entertainment README carries that line. Its
  privacy-policy clause (III.A.2) is not answered by a policy document; the README only states that
  the package collects nothing and keeps its data in the browser. Whether that is enough is the
  owner's call.
