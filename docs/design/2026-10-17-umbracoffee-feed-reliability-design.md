# umbraCoffee feed reliability: design

> The umbraCoffee Action fails on about a third of its runs, every time because YouTube's RSS feed
> answers 404 (once 500), and only at night. This design lets the YouTube Data API decide whether
> anything is new, so the next episode and its reminders no longer depend on the feed, and reads the
> feed only when there is something to fetch. The episode list stays RSS data, as the v2 design
> decided. A local report flags descriptions that changed on YouTube, for the owner to fix by hand.

- **Status:** Designed and built 2026-10-17, uncommitted. §9 is what the build measured
- **Date:** 2026-10-17
- **Branch:** `claude/umbracoffee-feed-reliability` (worktree `Worktrees/umbracoffee-feed-reliability`)
- **Builds on:** [2026-09-30-umbracoffee-v2-design.md](2026-09-30-umbracoffee-v2-design.md) and the
  addendum of 2026-10-01 in [the v2 plan](2026-09-30-umbracoffee-v2-plan.md). Where they disagree,
  this document is newer
- **After this:** a Cloudflare Worker that triggers the workflow every five minutes, because GitHub's
  scheduler runs it only every three to ten hours. Live since 2026-10-17; it lives outside the
  repository, so `tools/umbracoffee-feed/README.md`, "What starts a run", has its code and setup

---

## 1. What was measured

Over the first 30 runs (2026-10-11 to 2026-10-17), 10 failed. Every failure is the run's first
request, the channel feed, answering HTTP 404 (nine times) or 500 (once). The code, the key and the
API were never involved.

| Run start (UTC) | Runs | Failed |
| --- | --- | --- |
| 07:00 to 22:00 | 16 | 0 |
| 22:00 to 07:00 | 14 | 10 |

The same URL answered 200 thirteen times in a row from a residential connection during the day.
Other feed users report the same intermittent 404s, with no statement from Google. Whether the night
window is YouTube-wide or aimed at datacenter addresses was not measured; the fix is the same either
way.

A failed run costs more than a red mark. The run stops at the feed, before the next-episode step, so
during an announced episode a failed run also skips the heartbeat that keeps `next-episode.json`
fresh, and the app stops showing the countdown and raising reminders.

## 2. The rules this respects

From the YouTube API Services Developer Policies, read 2026-10-17:

- **III.E.4(d).** Data from the API without user credentials may be stored for at most 30 days, then
  deleted or refreshed.
- **III.E.4(h).** API data must not be used to create new or derived data. Summaries and guests are
  generated from descriptions, so they may only be made from descriptions that came from RSS, which is
  not an API Service (v2 design §1).

This design stores nothing new from the API. The API's answer about the newest uploads is compared
and dropped. `next-episode.json` is API data committed to the data branch, exactly as today; the v2
design accepted that as a grey area (its §7 risk 5), and this design does not make it worse. Reading
RSS stays the grey area the v2 design accepted, and happens far less often.

## 3. Each run

1. **Ask the API for the newest uploads.** `playlistItems.list` on the channel's uploads playlist
   (`UU` plus the channel id without its leading `UC`), `part=snippet`, `maxResults=15`. 1 unit.
   Fifteen because that is what the feed lists: anything older the feed cannot fix, so comparing it
   would only ever say "changed".
2. **Compare with `sources.json`.** An id that is not there is *new*. A known id whose title or
   description differs is *changed*. Titles are compared after `stripPrefix`, both texts with
   whitespace normalised (§5).
3. **Read the feed only when something is new or changed.** Otherwise it is not read at all. The read
   retries: three attempts, about 15 and 45 seconds apart (the exact spacing is the builder's call).
4. **Feed answered:** today's `mergeEpisodes` and `refreshFromFeed`, unchanged. A new id the feed does
   not list yet is simply not added; the next run sees it as new again and reads the feed again.
5. **Feed failed:** the episode list is left as it is. It catches up on the first run the feed answers.
6. **Next episode:** the new ids from step 2 are `nextEpisode`'s `newIds`, looked up with `videos.list`
   as today. This no longer depends on the feed. While the feed is behind, a new id stays new on every
   run and is looked up each time: 1 unit a run, and `nextEpisode` already removes the duplicate with
   the previous episode.
7. **Rebuild and commit** as today.

Without `YOUTUBE_API_KEY` the tool behaves as today, reading the feed every run, with the retry
added. E13 holds: the key stays optional.

### 3.1 What colour a run is

| API | Feed | Result |
| --- | --- | --- |
| answered, nothing new or changed | not read | green |
| answered, something new or changed | answered | green |
| answered, something new or changed | failed | green, with a warning annotation |
| failed, or no key | answered | green, with a warning when there is a key; next episode skipped as today |
| failed, or no key | failed | **red** |

### 3.2 What still waits for the feed

Only the episode list. The countdown, the "Upcoming" or "Live" row that heads the list, the live
player and the reminders are all built from `next-episode.json` alone; the app already handles a
current episode that is not in the list, because a live stream often is not there yet
(`umbracoffee.element.ts`, `#episode`).

The visible gap: when a stream ends, it leaves `next-episode.json`. If the feed is still failing
then, the episode is missing from the list and "Latest episode" shows the previous one until the
feed answers. On the measured pattern that is by the next morning at the latest.

## 4. The description report

A local command for the monthly routine, with the key in the environment:

```bash
YOUTUBE_API_KEY=... node tools/umbracoffee-feed/src/report.mjs <dir>
```

It looks up every episode in `sources.json` with `videos.list` (`part=snippet`, 50 ids per call,
about 7 units) and prints two lists:

1. **No description here, YouTube has one.** Today 7 episodes have none, all event specials
   (Codegarden 2022 days 1 to 3, Codegarden 2025 and 2026, the 5th birthday, Spark 2020). They may
   have none on YouTube either.
2. **Description differs on YouTube.** Mostly older episodes, whose edits the feed never shows
   because it lists only the newest 15. Same normalisation as §5, or every line lights up.

Each line is the video id, the title and a link to the video. **Never the description text.** It
writes nothing and keeps nothing. The owner opens the video and writes a summary or guests into
`overrides.json` by hand; `overrides.json` needs no new field.

It is not part of the Action, because GitHub keeps Action logs for 90 days, which would be storing.

## 5. Measure before building

- **Whether the uploads playlist lists a scheduled stream before it airs.** The next-episode path
  depends on it. The feed does today. Check against any channel with a stream scheduled. If it does
  not, stop and come back: the alternative, `search.list` with `eventType=upcoming`, costs 100 units
  a call.
- **Whether API and RSS texts compare equal for the same video.** If they differ in ways the
  whitespace normalisation does not cover (entities, line endings), every run counts as changed and
  reads the feed: no worse than today, but nothing saved. Compare the newest 15 on the real data and
  decide how much normalisation is needed. The report's second list uses the same comparison over the
  older, backfilled entries, which came from a watch-page scrape and may differ more.

## 6. Testing

Test-first, as everywhere in `tools/umbracoffee-feed` (`node --test`), with fake fetches:

- Every row of §3.1.
- No feed request when nothing is new or changed.
- A new id while the feed fails: not in `sources.json`, but in `next-episode.json` when upcoming.
- A feed that answers without the new id yet.
- The retry: a feed that fails twice and then answers.
- Only the newest 15 compared.
- The key never in a message, as `fetchVideo` already guarantees.
- The report: both lists from recorded answers, and that its output never contains description
  text.

A dry run against the real feed and API, without committing, before the workflow change goes in.

## 7. Documentation

- `tools/umbracoffee-feed/README.md`: the new run order, and `report.mjs` in the monthly routine.
- The Entertainment add-on's `docs/developer/umbracoffee-testing.md`, if it describes the run.
- The v2 design's §12 gets a pointer to this document.
- No user guide, README or marketplace change: nothing a user sees changes.

## 8. Alternatives considered

- **A daily check of the whole catalogue** (removed episodes, durations, real air dates). Rejected for
  now. It would store API data, which brings in daily refreshing, and git history keeps every daily
  version of the file forever. That needed a separate branch without history, which was too much for
  what it adds.
- **Adding a new episode from the API when the feed fails.** The episode would sit in the data
  branch's history as API data, and needs marking, a hand-over to the feed, a 30-day backstop and a
  snapshot exception. The list catching up a few hours later costs almost nothing, since everything
  live comes from `next-episode.json`.
- **The whole episode list from the API, refreshed daily.** Allowed by III.E.4(d), but summaries could
  not be made from API descriptions (III.E.4(h)), and the list would depend on the key.
- **Green on any feed failure, red after 24 hours without one.** Needs state across runs. The API
  already says whether a failure matters.
- **Descriptions in the report.** Left out to keep the report clear of derived data. The report flags,
  the owner reads YouTube.
- **`search.list` for upcoming streams.** 100 units a call; only if §5's first check fails.

## 9. What the build taught

Measured 2026-10-17 with a real key. Where the code and the sections above disagree, the code is
right.

**The two checks in §5**

- **The uploads playlist lists a scheduled stream before it airs.** `search.list` with
  `eventType=upcoming` found 10 public scheduled streams on 10 channels; all 10 were in their
  channel's uploads playlist. Not always first, though: positions 0 to 5, and 25 for one with no
  scheduled time. The playlist is ordered by when the video was created, not when it airs, so a
  stream scheduled weeks ahead slides down as other uploads arrive. umbraCoffee uploads about once a
  month, so it stays well inside the 15.
- **API and feed text are byte-equal.** For the newest 15, the playlist and the feed listed the same
  ids in the same order, and every title and description was identical, the zero-width spaces after
  `#umbraCoffee` included. The whitespace normalisation of §3 stays as a guard for line endings; it
  fixes no measured difference, and nothing looser was needed.

**The report needs its own comparison**

The §5 comparison over the whole catalogue flagged 295 of 347 episodes, as §5 feared. None was an
edit. The backfilled descriptions came from the watch page, which drops the `- ` of a list, shows a
social link as `/ handle` and a video link as that video's title. Ours therefore has extra words but
never misses one of YouTube's.

So `report.mjs` asks a different question: does every word of YouTube's description, with links,
handles and domains left out, appear in ours in the same order? Over the real data that flags none.
An edit that adds or changes a word is caught; one that only deletes words is not, which a summary
can live with. The run keeps the stricter §3 comparison, since the newest 15 always came from the
feed.

The seven episodes with no description here (§4) have none on YouTube either, so the first list is
empty today.

**Where the build deviates or adds**

- **A retry covers any failure**, not only a non-200: a network error and a 200 that is not a feed
  (a blocked page) are tried again too. The waits are 15 and 45 seconds (`FEED_RETRY_DELAYS_MS`).
- **A first run with no data while the feed is down writes no list.** With no `sources.json` and no
  feed, an empty list would replace the app's episodes with none, so only `next-episode.json` is
  written. Only reachable on a brand-new data branch.
- **When the playlist call fails, the next episode is left as it is**, without trying `videos.list`.
  That is §3.1's "skipped as today": the API that just failed is unlikely to answer the next call.
- **Every warning is a GitHub annotation**, including a failed `videos.list`, which used to go only to
  the log.
- **The run's log line** now starts with what the API said and whether the feed was read, for example
  `api: 0 new, 0 changed, feed: not read`.

**The dry run**

Over a copy of the data branch, with the real key: the API listed nothing new or changed, the feed
was not read, and no file changed. A quiet run costs 1 unit, plus 1 per id looked up for the next
episode. At GitHub's measured rate of a run every few hours, and even at the five-minute rate the
Cloudflare trigger is meant to bring (288 runs a day), that is at most a few hundred of the 10,000
units a day.
