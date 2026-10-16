# umbraCoffee v2 implementation plan

> **For agentic workers:** use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans. Steps use checkbox syntax. **Do not commit.** The owner reviews one
> diff (global rule); every "checkpoint" below means "run the checks", never `git commit`.

**Goal:** Build umbraCoffee v2 as [designed](2026-09-30-umbracoffee-v2-design.md): data from two
files on a GitHub data branch kept by a scheduled Action, read by the editor's browser; the server
code removed; the window rebuilt after the [mock](mockups/2026-09-30-umbracoffee-redesign.html) with a
shared themed player; a "Remind me" switch backed by one new host read.

**Architecture:** Four parts. (A) a host addition, `trayItemEnabled(alias)`; (B) a dependency-free
Node tool in `tools/umbracoffee-feed/` plus a workflow that writes `episodes.json` and
`next-episode.json` to branch `data/umbracoffee`; (C) the client in
`src/Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/`, split into a data layer
(`umbracoffee/`) and a shared player (`media-player/`); (D) removal of the C# server code and its
tests. A and B are independent of C and of each other, so they can run in parallel.

**Tech stack:** TypeScript + Lit + web-test-runner (Chrome) for A and C; Node 22 ESM with
`node --test` and no dependencies for B; YouTube IFrame Player API for the player.

## Decisions taken for the design's §10 open questions

| Question | Taken |
| --- | --- |
| Data branch and host | Branch `data/umbracoffee`, folder `umbracoffee/`, served from `raw.githubusercontent.com`. One constant (`UMBRACOFFEE_DATA_BASE_URL`), so Pages is a one-line change |
| Chapters | Later. Not built |
| Search | Later. Not built |
| Windows 11 dark or light | Follows the backoffice: tokens first, so it is dark or light with the desktop's own palette. The mock's dark rendering is the dark case |
| Stale threshold for `next-episode.json` | 30 minutes (`UMBRACOFFEE_NEXT_MAX_AGE_MS`): Action interval 5 min plus GitHub's usual 10-15 min delay, rounded up |
| Store poll | 30 min normally, 1 min while `next` is live or upcoming within 2 h |

## Ground rules that apply to every task

- Tests first: write the failing test, run it, watch it fail for the right reason, then implement.
  Repo rule: the test runner does not type-check, so **each task ends with `npx tsc --noEmit -p backoffice`**
  (Entertainment) or `npm run build` (host) in addition to the tests.
- Run the runner with `--concurrency 2`. A failing `expect(el).to.equal(null)` **hangs** rather than
  fails: use `expect(el === null).to.equal(true)`. Fixtures stall in background tabs; keep the Browser
  pane closed while tests run. Language level is ES2020 (no `Array.prototype.at` etc. without a check).
- JSDoc on everything, private members included: say why, not what. Match the density of the
  existing files.
- Derive numbers, never type them: anything in both CSS and JS is one constant both read.
- A theme may restyle, never remove. Tokens first, `:host([data-umbradesktop-theme='…'])` blocks as
  refinements, paint only, never a size.
- Working directory for every command: the worktree,
  `D:\github\Umbraco.Community.UmbraDesktop\.claude\worktrees\package-catalogue-manifest-f7eda8`.
  Paths below are relative to it. `ENT` = `src/Umbraco.Community.UmbraDesktop.Entertainment`,
  `HOST` = `src/Umbraco.Community.UmbraDesktop`, `UC` = `ENT/backoffice/src/umbracoffee`.

## File map

Create:

| File | Responsibility |
| --- | --- |
| `HOST/backoffice/src/desktop/taskbar/tray/tray.context.ts` (modify) | `trayItemEnabled(alias)` observable |
| `tools/umbracoffee-feed/package.json` | `"type": "module"`, scripts `test`, `run`, `snapshot`, `backfill` |
| `tools/umbracoffee-feed/src/rss.mjs` | RSS/Atom text to entries |
| `tools/umbracoffee-feed/src/episodes.mjs` | merge new entries into `episodes.json`, strip title prefix |
| `tools/umbracoffee-feed/src/youtube.mjs` | oEmbed title check, `videos.list` call and answer to next-episode |
| `tools/umbracoffee-feed/src/next-episode.mjs` | the next-episode state machine (§4 steps 3-4) |
| `tools/umbracoffee-feed/src/run.mjs` | one Action run: read files, fetch, decide, write files, report changed |
| `tools/umbracoffee-feed/src/snapshot.mjs` | write the shipped snapshot from `episodes.json` |
| `tools/umbracoffee-feed/src/backfill.mjs` | one-off: merge a list of video ids into `episodes.json` via oEmbed |
| `tools/umbracoffee-feed/test/*.test.mjs`, `test/fixtures/` | tests; fixtures moved from `ENT.Tests` |
| `.github/workflows/umbracoffee-feed.yml` | schedule + dispatch, commit to the data branch |
| `UC/feed.ts` | fetch + validate the two files |
| `UC/snapshot/episodes.snapshot.json` + `UC/snapshot.ts` | shipped fallback and its typed loader |
| `ENT/backoffice/src/media-player/engine.ts` | `PlayerEngine` interface, `PlayerState`, event names |
| `ENT/backoffice/src/media-player/youtube-engine.ts` | IFrame Player API wrapper, lazy script load |
| `ENT/backoffice/src/media-player/control-bar.element.ts` | themed control bar (`umbradesktop-control-bar`) |
| `ENT/backoffice/src/media-player/player.element.ts` | frame + engine + control bar (`umbradesktop-media-player`) |
| `ENT/backoffice/src/media-player/constants.ts` | sizes, seek step, aspect |
| `UC/countdown.element.ts`, `UC/episode-list.element.ts`, `UC/chat.element.ts`, `UC/offline-notice.element.ts` | window parts, split so `umbracoffee.element.ts` stays about layout and state |

Modify: `UC/constants.ts`, `types.ts`, `schedule.ts`, `store.ts`, `umbracoffee.element.ts`,
`tray-cup.element.ts`, `tray-context.ts`, `test-support.ts`, their tests,
`ENT/backoffice/src/localization/en.ts` + `nl.ts`, `ENT/backoffice/src/bundle.manifests.ts` (sizes),
`ENT/backoffice/web-test-runner.config.mjs` (only if the player needs a test page allowance),
`ENT/README.md`, `README.md`, `RELEASE.md`, `docs/desktop-apps.md` §9.8,
`umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json`, the two design docs.

Delete (Task 8): `ENT/UmbraCoffee/`, `ENT/Api/`, `ENT/Composing/`, `src/Umbraco.Community.UmbraDesktop.Entertainment.Tests/`.

---

## Task 0: Baseline and hygiene

- [ ] **0.1** In `ENT`: `npm test` and `npx tsc --noEmit -p backoffice`. In `HOST`: `npm test -- --concurrency 2`.
  Record any pre-existing failure in the design doc's build notes; do not fix unrelated ones.
- [ ] **0.2** The repo root holds untracked research leftovers `feed_UCLA_DiR1FfKNvjuUpBHmylQ.xml`,
  `feed_UCSJ4gkVC6NrvII8umztf0Ow.xml` and `p.xml`. Do **not** delete them without asking. Task 2
  copies only the two fixtures the design names; the owner decides about these three.

---

## Task 1 (Part A): host reads a tray item's switch

**Files:** modify `HOST/backoffice/src/desktop/taskbar/tray/tray.context.ts`, `.../tray.context.test.ts`,
`HOST/backoffice/src/desktop/components/desktop.element.ts` (the `new UmbraDesktopTrayContext(this, {…})` call at ~line 139), `docs/desktop-apps.md` §9.8.

Shape (decided here): `trayItemEnabled(alias: string): Observable<boolean>`. Emits the user's stored
choice, else the item's `defaultEnabled`; emits `false` for an alias that is not a registered tray
item; `distinctUntilChanged`; follows both the settings map and the item list (an item registering
late flips it from `false` to its default).

- [ ] **1.1 Failing tests** in `tray.context.test.ts`, using the existing `setup()`; add a dependency
  `observeFeatures: () => Observable<Record<string, boolean>>` (default `of({})`) to the test's deps:

```ts
it('emits the item default when nothing is stored', async () => {
  const { context, done } = await setup({}, [trayManifest('A')]);
  await new Promise((r) => setTimeout(r));
  const seen: boolean[] = [];
  const sub = context.trayItemEnabled('A').subscribe((v) => seen.push(v));
  expect(seen).to.deep.equal([true]);
  sub.unsubscribe(); done();
});

it('follows the stored choice as it changes', async () => {
  const stored = new UmbObjectState<Record<string, boolean>>({});
  const { context, done } = await setup({ observeFeatures: () => stored.asObservable() }, [trayManifest('A')]);
  await new Promise((r) => setTimeout(r));
  const seen: boolean[] = [];
  const sub = context.trayItemEnabled('A').subscribe((v) => seen.push(v));
  stored.setValue({ A: false });
  stored.setValue({ A: false }); // no repeat emission
  stored.setValue({ A: true });
  expect(seen).to.deep.equal([true, false, true]);
  sub.unsubscribe(); done();
});

it('is false for an alias that is not a tray item', async () => {
  const { context, done } = await setup({}, [trayManifest('A')]);
  await new Promise((r) => setTimeout(r));
  const seen: boolean[] = [];
  const sub = context.trayItemEnabled('nope').subscribe((v) => seen.push(v));
  expect(seen).to.deep.equal([false]);
  sub.unsubscribe(); done();
});
```

  (Adapt `setup()`'s return shape to what it actually returns; the assertions are the point.)
- [ ] **1.2** Run: `cd HOST && npx web-test-runner "src/desktop/taskbar/tray/tray.context.test.ts" --node-resolve --concurrency 2`. Expected: FAIL, `trayItemEnabled is not a function`.
- [ ] **1.3 Implement.** Add to `UmbraDesktopTrayDependencies`:

```ts
  /**
   * The user's stored on/off choices for taskbar features and tray items, keyed by id. Passed as an
   * observable so {@link UmbraDesktopTrayContext.trayItemEnabled} follows Desktop settings while both are open.
   * @returns The map; absent keys mean "the item's own default".
   */
  observeFeatures(): Observable<Readonly<Record<string, boolean>>>;
```

  and on the context (import `combineLatest, map, distinctUntilChanged` from
  `@umbraco-cms/backoffice/external/rxjs`, `isFeatureEnabled` from `../features/enabled`):

```ts
  /**
   * Whether a tray item is switched on for this user, following the stored choice and the item's own
   * default, so an app's own switch and the one in Desktop settings stay in step. The same rule
   * `isFeatureEnabled` gives the taskbar, so it cannot disagree with what the tray shows.
   * @param alias The tray item's alias.
   * @returns An observable that emits the current value on subscribe and again on each change; `false` for an alias that is not a registered tray item.
   */
  public trayItemEnabled(alias: string): Observable<boolean> {
    return combineLatest([this.items, this.#deps.observeFeatures()]).pipe(
      map(([items, stored]) => {
        const item = items.find((candidate) => candidate.id === alias || candidate.alias === alias);
        return item ? isFeatureEnabled(stored, { id: item.alias, defaultEnabled: item.defaultEnabled }) : false;
      }),
      distinctUntilChanged(),
    );
  }
```

  Check `UmbraDesktopTrayItem`'s field names in `tray-items.ts` (it has `alias`, `defaultEnabled`); use those only. Wire `observeFeatures: () => this.#settings.taskbarFeatures` in `desktop.element.ts`.
- [ ] **1.4** Re-run the test (PASS), then `cd HOST && npm run build` and the full `npm test -- --concurrency 2`.
- [ ] **1.5 Docs.** `docs/desktop-apps.md` §9.8: add the third row to the table and to the sample
  interface (`trayItemEnabled(alias: string): Observable<boolean>`), and change "Those two calls are the whole contract" to three, describing the read: emits the current value on subscribe, `false` for a non-tray alias, follows Desktop settings live. Add that the cup's app-side "Remind me" switch is this read plus `setTrayItemEnabled`.

---

## Task 2 (Part B): the feed tool and the Action

Dependency-free Node, ES modules, `node --test`. Every network call goes through an injected
`fetchImpl` so the tests use recorded bodies and never touch the network.

**Files:** create everything under `tools/umbracoffee-feed/` and the workflow (file map above). Move
`feed-umbracoffee.xml` and `feed-nasa.xml` (git mv is not possible, both untracked: copy) from
`src/Umbraco.Community.UmbraDesktop.Entertainment.Tests/UmbraCoffee/Fixtures/` to
`tools/umbracoffee-feed/test/fixtures/`. Task 8 deletes the originals afterwards.

Data contracts, exactly the design §3 (`version: 1`; `episodes.json` entries carry `videoId, title,
published, description`; `next-episode.json` carries `updatedAt` and `episode | null`).

- [ ] **2.1 `rss.mjs`** test first (`test/rss.test.mjs`): parsing `feed-umbracoffee.xml` returns 15
  entries, newest first as the feed gives them, each with `videoId` (from `<yt:videoId>`), `title`,
  `published` (from `<published>`), `description` (from `<media:description>`); XML entities (`&amp;`,
  `&#39;`, `&quot;`, `&lt;`, `&gt;`) decoded; a feed with no entries returns `[]`; garbage input throws.
  Implement with regex over `<entry>…</entry>` blocks (the feed is machine-generated Atom; a full XML
  parser would be a dependency for no gain). Export `parseFeed(xml): FeedEntry[]`.
- [ ] **2.2 `episodes.mjs`** tests: `stripPrefix('umbraCoffee - The September Shift') === 'The September Shift'`
  (also with an en dash and extra spaces; a title without the prefix is returned untouched);
  `mergeEpisodes(existing, entries)` adds only unseen ids, keeps newest-first by `published`, never
  reorders or edits existing entries (the backfill and oEmbed corrections own that), and reports
  `changed`. Export both.
- [ ] **2.3 `youtube.mjs`** tests with recorded API answers in `test/fixtures/videos-*.json`
  (write four by hand from the documented `videos.list` shape: `upcoming`, `live`, `ended`, `none` =
  `items: []`): `describeVideo(item)` maps to `{ videoId, title, state: 'upcoming'|'live'|'ended',
  scheduledStart, actualStart }` from `snippet.liveBroadcastContent` and
  `liveStreamingDetails.{scheduledStartTime,actualStartTime,actualEndTime}` (`actualEndTime` present
  means `ended` regardless of `liveBroadcastContent`); a normal upload (no `liveStreamingDetails`) is
  `ended`, which means "not next". `fetchVideo(id, { apiKey, fetchImpl })` calls
  `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=<id>&key=<key>`;
  a non-200 throws an error whose message **never contains the key** (test this). `checkTitle(id,
  fetchImpl)` calls oEmbed and returns the title or `undefined` on any failure.
- [ ] **2.4 `next-episode.mjs`** tests, the whole of §4 steps 3-4 as a pure function
  `nextEpisode({ previous, newIds, lookup, now })` where `lookup(id)` returns a described video or
  undefined:
  - new id that is `upcoming` or `live` becomes the episode, `updatedAt = now`;
  - previous episode still `upcoming`/`live` in `lookup` is updated (state, starts), `updatedAt = now`;
  - previous ended, or gone (`undefined`), gives `episode: null`;
  - previous `upcoming` with `scheduledStart` more than 6 h before `now` and not live is dropped
    (abandoned, issue #114);
  - no API key (`lookup` is `null`) keeps `episode: null` and never throws;
  - two candidates: the sooner `scheduledStart` wins.
  Result includes `{ file, changed }`; `changed` is false only when the file would be byte-identical.
- [ ] **2.5 `run.mjs`** test with a temp directory and a fake `fetchImpl`: first run over an empty
  directory writes `episodes.json` with 15 entries and an empty `next-episode.json`; second run with
  the same feed reports `changed: false` and writes nothing; a feed with one new id whose lookup says
  `upcoming` writes both files. Read `process.env.YOUTUBE_API_KEY`, channel id from the design. Write
  files with `JSON.stringify(x, null, 2) + '\n'` and **stable key order** so unchanged data is a
  byte-identical no-op. Print `changed=true|false` to `$GITHUB_OUTPUT` when set.
- [ ] **2.6 `snapshot.mjs` and `backfill.mjs`.** `snapshot`: reads a given `episodes.json` and writes
  `ENT/backoffice/src/umbracoffee/snapshot/episodes.snapshot.json` with a `snapshotAt` field and,
  to keep the package small, **descriptions trimmed to the first 280 characters** (search and chapters
  are later work and read the live file). `backfill`: takes ids on stdin, checks each with oEmbed,
  and merges with `published: null` entries rejected (the backfill needs real dates: it takes a
  `id,published` CSV line format, not bare ids). Both have a small test.
- [ ] **2.7 Workflow** `.github/workflows/umbracoffee-feed.yml`: `schedule: cron '*/5 * * * *'` and
  `workflow_dispatch`; `permissions: contents: write`; checkout `data/umbracoffee` into `data/`
  (create the orphan branch on first run if missing), checkout `main` for the tool, run
  `node tools/umbracoffee-feed/src/run.mjs data/umbracoffee` with `YOUTUBE_API_KEY` from
  `secrets.YOUTUBE_API_KEY`, commit and push only when the output says `changed=true`. Concurrency
  group `umbracoffee-feed`, `cancel-in-progress: false`.
- [ ] **2.8** Run `cd tools/umbracoffee-feed && node --test`. Also a **dry run against the real feed
  without committing** (design §8): `node src/run.mjs "$TEMP/uc-dry"` with no API key. This is a real
  network read of the public RSS feed; say so in the report. Add the tool's tests to
  `.github/actions/build-packages/action.yml` as a step "Test feed tool" (`node --test` in
  `tools/umbracoffee-feed`, Node 22 is already set up there).

**The backfill of the ~349 back episodes is a manual owner step** (design E3), not built into the
Action. Deliver the script and the CSV format; do not scrape the channel from here. Seed the shipped
snapshot from the 15 RSS entries so the app works before the backfill exists.

---

## Task 3 (Part C1): the data layer

**Files:** `UC/constants.ts`, `types.ts`, `feed.ts` (new), `snapshot.ts` + `snapshot/…json` (new),
`store.ts`, `schedule.ts`, `test-support.ts`, and the `*.test.ts` beside each.

### 3.1 Constants (`constants.ts`)

Remove `UMBRACOFFEE_ENDPOINT`, `UMBRACOFFEE_POLL_MS`, `UMBRACOFFEE_MAX_ANSWER_AGE_MS`,
`UMBRACOFFEE_CHAT_WIDTH`'s old role if the layout no longer needs it (Task 5 decides), the auth gate.
Add:

```ts
/** The data branch's raw base URL. One constant, so moving to GitHub Pages is one line (design §7.1). */
export const UMBRACOFFEE_DATA_BASE_URL =
  'https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/data/umbracoffee/umbracoffee';
/** How often the store asks when nothing is coming up: the raw host caches for five minutes anyway. */
export const UMBRACOFFEE_POLL_IDLE_MS = 30 * 60 * 1000;
/** How often it asks while an episode is live or about to be (E5). */
export const UMBRACOFFEE_POLL_ACTIVE_MS = 60 * 1000;
/** "About to be": an upcoming episode this close to its start switches the store to the fast poll. */
export const UMBRACOFFEE_ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;
/** How old `next-episode.json`'s `updatedAt` may be before an upcoming/live episode is no longer believed (design §3.2). Action interval 5 min plus GitHub's usual 10-15 min start delay, rounded up. */
export const UMBRACOFFEE_NEXT_MAX_AGE_MS = 30 * 60 * 1000;
```

Keep `UMBRACOFFEE_LATE_START_GRACE_MS`, `REMINDER_LEAD_MS`, `LIVE_REMINDER_MS`, aliases, channel URL.
Derive `UMBRACOFFEE_NEXT_MAX_AGE_MS` from named parts if you prefer (`ACTION_INTERVAL + ACTION_LATE`), but
keep it one number.

### 3.2 Types (`types.ts`)

Replace the endpoint shapes with:

```ts
/** One entry of `episodes.json`. */
export interface UmbraCoffeeEpisode { videoId: string; title: string; published: string; description?: string }
/** The episode in `next-episode.json`. */
export interface UmbraCoffeeCurrent {
  videoId: string; title: string; state: 'upcoming' | 'live';
  scheduledStart?: string | null; actualStart?: string | null;
}
/** What the store holds: both files, or the snapshot, and how it got them. */
export interface UmbraCoffeeData {
  episodes: UmbraCoffeeEpisode[];
  /** `null` when the file said nothing is coming up, and also when the file could not be read (then `offline` is set). */
  current: UmbraCoffeeCurrent | null;
  /** `next-episode.json`'s `updatedAt`, epoch ms; undefined when there is no file answer. */
  currentUpdatedAt?: number;
  /** True when either file could not be fetched or was not valid: the window says so and the cup hides (E6). */
  offline: boolean;
  /** When the episode list was generated (or the snapshot taken), ISO; for "Showing episodes up to …". */
  episodesAsOf: string | null;
  /** When this browser received this data, epoch ms by its clock. */
  receivedAt: number;
}
```

`isEpisodesFile(v)` and `isNextEpisodeFile(v)` runtime guards (`version === 1`, arrays/objects checked
by value, an unknown `state` rejects the whole `episode` as null-equivalent invalid). Tests in
`types.test.ts`: each guard accepts the design's example JSON and rejects a wrong `version`, a
missing `videoId`, a `state: 'ended'`, and a non-object.

### 3.3 `feed.ts`

`fetchFeed(fetchImpl = fetch): Promise<{ episodes?: EpisodesFile; next?: NextEpisodeFile }>`; each file
independently `undefined` on network error, non-200 or a failed guard (never throws). URL from
`UMBRACOFFEE_DATA_BASE_URL + '/episodes.json'` and `'/next-episode.json'`. Tests with a fake fetch:
both good, one 404, one invalid JSON, one network reject.

### 3.4 Snapshot (`snapshot.ts`)

`import snapshot from './snapshot/episodes.snapshot.json'` (needs `resolveJsonModule`; check
`backoffice/tsconfig.json` and Vite; the test runner's esbuild plugin handles JSON). Export
`snapshotData(now): UmbraCoffeeData` with `offline: true`, `current: null`, `episodesAsOf: snapshot.snapshotAt`.
Seed `episodes.snapshot.json` from `tools/umbracoffee-feed/test/fixtures/feed-umbracoffee.xml` (15
entries) using the Task 2 tool; do not hand-type it.

### 3.5 Store (`store.ts`) rewrite

Remove the poll gate, `isAccessTokenLive`, `umbHttpClient`, and `UMB_AUTH_CONTEXT` use everywhere
(E10). New behaviour, all tested in `store.test.ts` (rework the existing cases; keep the ones about
listener isolation, `#tell` guarding, late subscriber, last unsubscribe stops polling):

- Environment gains `setTimeout/clearTimeout` (the poll is a chain of timeouts because the delay
  changes); keep `now()`. Update `test-support.ts` `timers()` to fire timeouts by hand.
- `refresh()`: `fetchFeed()`; if **both** files came back: `offline: false`, data from them; if either
  is missing: keep the last good `episodes` if any, else the snapshot's; `current: null`;
  `offline: true`. Stamp `receivedAt`. Tell listeners.
- After each refresh, schedule the next with `pollDelay(data, now)`, a pure exported function:
  `UMBRACOFFEE_POLL_ACTIVE_MS` when `current` is live, or upcoming with `scheduledStart - now <
  ACTIVE_WINDOW`; else `POLL_IDLE_MS`. **Offline uses the idle delay** (do not hammer a blocked host).
- Tests: `pollDelay` table (live, upcoming in 1 h, upcoming in 3 h, none, offline); a failed second
  poll keeps the first episodes and flips `offline`; a recovery flips it back; first-ever failure
  serves the snapshot; unsubscribing the last listener clears the timeout.

### 3.6 Schedule (`schedule.ts`) rework

`trusted(data, now)`: null when `data.offline`, no `current`, `now - currentUpdatedAt >
UMBRACOFFEE_NEXT_MAX_AGE_MS` (stale means nothing current), or upcoming with unreadable start / more
than the late-start grace past it. `viewFor` gains `{ kind: 'offline'; episodes }`-free handling:
offline is a **flag the window reads**, not a view, so `viewFor` keeps `live | upcoming | latest |
empty`. Rename param types to `UmbraCoffeeData`. `trayStateFor`, `dueReminders`, `reminderKey`
unchanged in behaviour. Update `schedule.test.ts`: replace `stale`/`receivedAt` cases with `offline` and
`currentUpdatedAt`; add: fresh updatedAt trusted, 31-minute-old distrusted, offline hides the cup.

### 3.7 Checks

- [ ] `cd ENT && npx web-test-runner "backoffice/src/umbracoffee/{types,feed,snapshot,store,schedule}.test.ts" ...`
  (or the per-file form) passes; `npx tsc --noEmit -p backoffice` will still fail on the elements
  that Tasks 5-6 rework. Fix only what these files own; note the rest.

---

## Task 4 (Part C2): the shared player

Nothing of ours is drawn over the video (policy). Our control bar sits **under** the frame.

**Files:** `ENT/backoffice/src/media-player/*` (file map above) and tests beside each.

- [ ] **4.1 `engine.ts`**, tests are on the interface's fake (`test-support`-style `FakeEngine`):

```ts
/** What a player engine reports. */
export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
/** The seam between the control bar and a media backend. YouTube now, HTML5 `<video>` with the Video Player app. */
export interface PlayerEngine extends EventTarget {
  /** Mount into `host` and load a video by id. */
  load(host: HTMLElement, videoId: string, options?: { autoplay?: boolean }): Promise<void>;
  play(): void; pause(): void; seek(seconds: number): void;
  setVolume(zeroToOne: number): void; setMuted(muted: boolean): void;
  setCaptions(on: boolean): void;
  readonly state: PlayerState; readonly time: number; readonly duration: number;
  readonly volume: number; readonly muted: boolean;
  destroy(): void;
}
```
  Events (`CustomEvent` on the engine): `statechange`, `timeupdate`, `volumechange`, `durationchange`.
- [ ] **4.2 `youtube-engine.ts`.** Loads `https://www.youtube.com/iframe_api` once per document
  (module-level promise; the script tag is added only on first `load`, i.e. when the window opens),
  creates `new YT.Player(host, { videoId, playerVars: { controls: 0, rel: 0, playsinline: 1,
  modestbranding: 1, fs: 0, disablekb: 1, autoplay, origin: location.origin }, host:
  'https://www.youtube-nocookie.com' })`, maps `onStateChange` numbers (-1 idle, 0 ended, 1 playing, 2
  paused, 3 loading, 5 idle) to `PlayerState`, polls `getCurrentTime()` every 250 ms only while playing.
  `fs: 0` because fullscreen is our own container (design §5). Tests: inject a fake `YT` global via an
  `apiLoader` constructor argument (`() => Promise<YTNamespace>`), assert player vars, state mapping,
  that the time poll runs only while playing and stops on `destroy`, and that a load error yields
  state `error` rather than a throw. No test touches youtube.com.
- [ ] **4.3 `control-bar.element.ts`** (`umbradesktop-control-bar`). Properties: `engine`,
  `videoId` (for "Watch on YouTube"), `container` (the element to fullscreen). Buttons, each a real
  `<button>` with an accessible name from the `umbraDesktopEntertainment_*` dictionary: play/pause
  (`aria-pressed`), seek slider (`role="slider"`, arrow keys ±5 s, PageUp/PageDown ±30 s, Home/End),
  time text (`m:ss / m:ss`), mute + volume slider, captions toggle, fullscreen (`container.requestFullscreen()`),
  Watch on YouTube (link, `target=_blank rel=noopener`). For a **live** stream (`duration` 0 or
  Infinity) the seek slider is replaced by a "Live" indicator and the time text is hidden, never
  removed silently: both states are in the test. Styling: tokens first (`--umbradesktop-app-*`), then
  one refinement block per theme, all five (`umbraco`, `umbraco4`, `macos`, `win11`, `win98`), taken
  from the mock's §"The control bar, close up". Read the mock for the exact look. Tests: renders each
  button; clicking play calls `engine.play()`; the slider keyboard steps; live mode; fullscreen calls
  the container; the bar reflects engine events; **a11y**: every control has a name.
- [ ] **4.4 `player.element.ts`** (`umbradesktop-media-player`). Properties `videoId`, `autoplay`,
  `engine` (default a new `YouTubeEngine`; tests pass a fake). Renders the frame (16:9 from
  `constants.ts`, min 200×200 enforced by CSS `min-width`/`min-height`, matching the policy) with the
  bar under it. Autoplay only when the host says the player is at least half visible (an
  `IntersectionObserver` with threshold 0.5; test with a stubbed observer). Destroys the engine on
  disconnect. Tests: loads on connect, reloads on `videoId` change, destroys on disconnect.
- [ ] **4.5** Checkpoint: `npx tsc --noEmit` on these files and the tests. **Browser check comes in
  Task 9**, the engine's real behaviour cannot be verified by unit tests.

---

## Task 5 (Part C3): the window

Read the mock first (`docs/design/mockups/2026-09-30-umbracoffee-redesign.html`, static, open it in a
browser; sections 1a-1d, 2a-2d, 3). It is the reference for layout and per-theme looks.

**Files:** `UC/umbracoffee.element.ts` (rewrite as layout + state), new `countdown`, `episode-list`,
`chat`, `offline-notice` elements, `UC/constants.ts` (sizes), `ENT/backoffice/src/bundle.manifests.ts`,
`localization/en.ts` + `nl.ts`, and `umbracoffee.element.test.ts` plus one test file per new element.

- [ ] **5.1 States, each with a failing test first** (rework `umbracoffee.element.test.ts`, keep its
  helpers; the element takes `store` and `environment` properties as today):
  1. **Live**: player, Chat and Episodes tabs beside it (chat only while live and not hidden by the
     narrow layout), title, Remind me switch.
  2. **Upcoming**: countdown hero with days / hours / minutes (ticks on the 30 s clock), start time via
     `formatUmbraCoffeeDate` (the `formatDateTime` path and the `localize.date` fallback both tested),
     "Remind me", "Watch the last episode" (plays the latest, in place).
  3. **On demand**: player, details, list; no chat tab.
  4. **Narrow (~480 px content box)**: the side panel moves under the player (container query on the
     host, derived from constants).
  5. **Offline**: notice at top with the "up to <date>" text, snapshot episodes, no cup reference, Remind
     me disabled with a reason (a disabled control with text, never hidden: "a theme may restyle,
     never remove" applies to states too).
  6. **Picked episode** plays in place; Back returns to what the schedule leads with; the held-live rule
     from v1 (`leadFor`) is kept, with "trusted" now meaning the schedule trusts the data, no
     `stale`/age fields.
- [ ] **5.2 Countdown** (`umbracoffee-countdown`): pure derivation `splitRemaining(ms)` exported and
  tested (`0 ms`, `59 s`, `61 min`, `26 h`, `3 d 4 h 5 min`; rounds **up** to the minute like v1 so it
  never reads 0 early). Renders three number blocks with labels; no live region (announcing every
  minute would talk over a stream).
- [ ] **5.3 Episode list** (`umbracoffee-episode-list`): thumbnails
  `https://i.ytimg.com/vi/<id>/mqdefault.jpg` with `loading="lazy"`, gradient fallback on `error`; **no
  durations** (E7); title, date via the desktop format; current row `aria-current`; a **virtualised-free
  but bounded** list: render 30 rows and a "Show more" button (349 episodes must not make 349 `<img>`).
  Tests: renders 30 then 60 after Show more; click emits `episode-selected` with the id; the image
  error fallback; `aria-current`.
- [ ] **5.4 Chat** (`umbracoffee-chat`): the frame exactly as v1 built it
  (`youtube.com/live_chat?v=<id>&embed_domain=<host>`, referrer policy), only while live; read-only
  note for browsers that block third-party cookies is **text under the frame**, not detection.
- [ ] **5.5 Remind me.** A `<button role="switch" aria-checked>` bound to the host's
  `trayItemEnabled(UMBRACOFFEE_TRAY_ALIAS)` (extend the local `UmbraDesktopTrayContextLike` in
  `tray-context.ts` with `trayItemEnabled(alias): Observable<boolean>`, optional, because an older
  desktop lacks it: when absent, the switch is drawn disabled with "Change this under Taskbar in
  Desktop settings", the v1 footer text). Toggling calls `setTrayItemEnabled`. Remove the v1 footer.
  Tests with a stub tray context that pushes values: reflects `true`/`false`, toggles call through,
  follows an external change.
- [ ] **5.6 Sizes.** Rework `UMBRACOFFEE_*` size constants for the new layout (player + side panel
  beside it wide; stacked at narrow) and update `bundle.manifests.ts` `defaultSize`/`minSize`;
  `bundle.manifests.test.ts` asserts they equal the constants. Size assertions in the element test
  run at both, measured with the existing box-mounting helper.
- [ ] **5.7 Localisation.** Every new string in `en.ts` **and** `nl.ts` with the English as the
  `termOrDefault` fallback in the element, as v1 does. Remove the strings v1 no longer uses
  (`umbraCoffeeRemindersWhere` stays for the older-desktop fallback; `umbraCoffeeUnavailable` becomes
  the offline text with `%0%` for the date).
- [ ] **5.8 Theming pass.** Five blocks, paint only, from the mock; tokens first. Verified in Task 9,
  not by unit test, except the structural assertion "the `data-umbradesktop-theme` attribute on the
  host changes no element's size" (measure a control at `umbraco` and `win98`).
- [ ] **5.9** Run the window tests, then `npx tsc --noEmit -p backoffice`.

---

## Task 6 (Part C4): the cup and the reminder

**Files:** `UC/tray-cup.element.ts`, `reminder-notification.element.ts` (only if it reads removed
types), `tray-cup.element.test.ts`, `reminder-notification.element.test.ts`, `test-support.ts`.

- [ ] **6.1** Remove the poll gate and `UMB_AUTH_CONTEXT` from the cup; it subscribes to the store only.
  Type parameters move to `UmbraCoffeeData`. Tests first: the existing "hides when nothing is upcoming
  or live" and reminder cases are reworked onto `offline` / `currentUpdatedAt`; **new**: `offline: true`
  hides the cup and raises nothing even if a stale `current` were present; a data update from
  `offline` to online with a live `current` raises the live reminder once.
- [ ] **6.2** `reminder-notification.element.ts` "Stop reminding me" keeps calling
  `setTrayItemEnabled(UMBRACOFFEE_TRAY_ALIAS, false)`; no change expected. Confirm by running its test.
- [ ] **6.3** `tsc` and the two files' tests.

---

## Task 7: bundle, README-facing behaviour and the CSP note

- [ ] **7.1** `bundle.manifests.ts`: comments about "server" and the endpoint removed; the tray item
  description in `en.ts`/`nl.ts` still true.
- [ ] **7.2** `ENT/backoffice/web-test-runner.config.mjs`: if the player tests load the IFrame API
  script, they must not (the fake `apiLoader` avoids it). Leave the `frame-src 'none'` page as is.
- [ ] **7.3** Add the CSP sentence's facts to the README task (Task 10): the site must allow
  `www.youtube.com` (script, frame), `www.youtube-nocookie.com` (frame), `i.ytimg.com` (img),
  `raw.githubusercontent.com` (connect).

---

## Task 8 (Part D): remove the server

Do this **after** Task 2 has copied the fixtures.

- [ ] **8.1** Delete `ENT/UmbraCoffee/`, `ENT/Api/`, `ENT/Composing/`. Delete
  `src/Umbraco.Community.UmbraDesktop.Entertainment.Tests/`.
- [ ] **8.2** `Umbraco.Community.UmbraDesktop.app.slnx`: remove the `Entertainment.Tests` project entry.
- [ ] **8.3** `.github/actions/build-packages/action.yml`: remove the `Entertainment.Tests` restore line,
  the `packages.lock.json` name in the NuGet cache key (and the comment's "four"), and its `dotnet test`
  line. `src/Directory.Build.props` / `Directory.Packages.props`: remove anything only that project
  needed (check with `git diff`; they are modified on this branch, so read what changed and why
  before removing).
- [ ] **8.4** Confirm the Entertainment csproj still builds with no C# (it keeps the host
  `ProjectReference` and the bounded range): `dotnet build ENT --configuration Release` after
  `npm run build`. If `GenerateDocumentationFile` complains about an empty compilation, fix in the
  csproj with a comment saying why. Update its `<Description>`/comment that mention
  "umbraCoffee endpoint's controller base" (the reference stays, the reason changes: the bounded host
  range and the Marketplace's Umbraco dependency check).
- [ ] **8.5** `dotnet build Umbraco.Community.UmbraDesktop.app.slnx` if the TestInstance builds here
  (memory: build the frontend first; revert the TestInstance lock-file bump afterwards).
- [ ] **8.6** Grep for leftovers: `rg -i "umbracoffee(controller|service|composer|parser)|management/api/v1/umbracoffee|poll ?gate|isAccessTokenLive" --glob '!docs/design/2026-09-27*'`. Nothing may remain outside the dated first-design docs.

---

## Task 9: verify in a real browser

Follow the repo's headless check (memory: hidden Browser pane never renders the backoffice; use the
repo's puppeteer-core headless; grant the desktop section on a fresh DB; restore test-run artifacts).

- [ ] **9.1** Start the worktree test instance per the worktree recipe (DB copy, `npm run build` before
  `dotnet build`, revert the lock-file bump).
- [ ] **9.2** With DevTools "Override content" (or puppeteer request interception) fake
  `next-episode.json` as: none, upcoming in 25 min, live, stale (`updatedAt` 31 min old), and block the
  host entirely (offline). Confirm the window, the cup, and the reminders for each.
- [ ] **9.3** All five themes, at default and minimum size: screenshot each state; measure that no
  control changes size between themes; check nothing from the design's "nothing of ours over the
  video" rule is violated (no element overlaps the frame's box: assert with `getBoundingClientRect`).
- [ ] **9.4** Real player: with a real public video id, confirm play/pause/seek/volume/mute/captions/
  fullscreen through our bar. Note what YouTube still draws inside its frame.
- [ ] **9.5** `console` clean of our errors; no request to any host except the CSP list in 7.3.
- [ ] **9.6** Save the screenshots the marketplace and README need in `docs/screenshots/`.

---

## Task 10: definition of done (repo CLAUDE.md)

Walk the list and say which items did not apply.

- [ ] `npm run build` and `npm test` pass in **both** `HOST` and `ENT`; `node --test` passes in `tools/umbracoffee-feed`.
- [ ] **`ENT/README.md`**: umbraCoffee rewritten for v2: where the data comes from and that the server
  makes no outbound calls, offline behaviour, the CSP note (7.3), YouTube's Terms of Service line if
  the policy check (design §7.6) says one is needed, the "Remind me" switch. **Root `README.md`**:
  check **every** place umbraCoffee is named (Features list and its own section). Markdown only, no
  raw HTML; images as `![alt](url)`.
- [ ] **`umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json`**: add tags (for
  example `youtube`, `live-stream`, `video-player`, `reminders`) and the `Screenshots` entries from 9.6.
  **Do not touch `Description`.**
- [ ] **`docs/`**: `desktop-apps.md` §9.8 done in Task 1; `RELEASE.md` gains the Action, the
  `YOUTUBE_API_KEY` secret (how to create the free key), the data branch (create it, protect nothing),
  the 60-day inactivity note and the fallback, the snapshot being refreshed before packing
  (`node tools/umbracoffee-feed/src/snapshot.mjs`), and the manual backfill step. Update the v2 design
  doc's status line and add "what the build taught" notes; add the dated pointer note at the top of
  `2026-09-27-umbracoffee-design.md` and mark `2026-09-27-umbracoffee-plan.md` superseded.
- [ ] `docs/design/mockups/README.md` lists the mock if it lists the others.
- [ ] Anything a build taught you that is not obvious from code is written down where the next
  person hits it.

## Self-review against the design

| Design item | Task |
| --- | --- |
| E1 remove server | 8 |
| E2 data on branch via Action | 2 |
| E3 backfill once, then RSS; oEmbed titles | 2 (script + manual step) |
| E4 next-episode from API only while relevant; emptied when ended | 2.4 |
| E5 poll 30 min / 1 min | 3.1, 3.5 |
| E6 snapshot + offline notice | 3.4, 3.5, 5.1(5) |
| E7 no durations | 2.1, 5.3 |
| E8 dates from RSS | 2.1 |
| E9 Remind me switch + host read | 1, 5.5 |
| E10 no poll gate | 3.5, 6.1 |
| E11 window after the mock, tabs, hero | 5 |
| E12 shared player, engine seam | 4 |
| E13 free key as `YOUTUBE_API_KEY` | 2.7, 10 |
| §4 abandoned stream >6 h dropped | 2.4 |
| §4 60-day inactivity | 10 (RELEASE.md) |
| §5 offline; late-start grace; stale = nothing current | 3.6 |
| §7.3 CSP note | 7.3, 10 |
| §7.6 API client obligations check | 10 (README) |
| §8 testing incl. dry run and browser pass | 2.8, 9 |
| §9 removals | 8 |
| §11 documentation | 10 |

## Summary in plain language

- Umbraco servers stop talking to YouTube. A GitHub job does it instead and keeps two small files up to date.
- The window reads those files straight from GitHub in the editor's browser. If GitHub cannot be reached, it says so and shows the episodes it shipped with.
- The window and player are rebuilt to match your mock, with our own play controls under YouTube's video in all five themes.
- A "Remind me" switch appears in the app. It is the same switch as in Desktop settings, which needs one small addition to the desktop itself.
- The old server code and its tests are deleted.
- Not done by me: the one-off download of the ~349 older episodes (a script is ready, you run it), creating the data branch and the YouTube key, and the screenshot pass needs your instance.

Choices for you, one line each:
1. Data branch called `data/umbracoffee` on raw.githubusercontent.com: OK?
2. Chapters and archive search left for later: OK?
3. The three stray files in the repo root (`feed_*.xml`, `p.xml`): delete them?

---

## Addendum 2026-10-01: summaries, guests, search

Decided with the owner after the build. Transcripts are out: the YouTube Data API only gives captions
to someone who can edit the video (`captions.download`, OAuth), and the watch page withholds them
from scripts. Descriptions are the source: 7 of 14 sampled older episodes name their guests in one
sentence, 13 of 14 list topics.

### Files on the data branch (`umbracoffee/`)

| File | Written by | Holds |
| --- | --- | --- |
| `sources.json` | the Action | `{ version: 1, generatedAt, episodes: [{ videoId, title, published, description }] }`, newest first. What the old `episodes.json` was. For the episodes in the RSS feed the Action also updates `title` and `description` when they change |
| `details.json` | locally, by hand or by a Claude Code session | `{ version: 1, episodes: { [videoId]: { summary, guests: [{ name, affiliation }], guestsUnnamed, uncertain, uncertainReason, sourceHash } } }` |
| `overrides.json` | the owner, by hand | `{ version: 1, episodes: { [videoId]: { summary?, guests?, guestsUnnamed? } } }`. Wins over `details.json`. Never written by a tool |
| `episodes.json` | the Action and the local apply step, rebuilt from the three above | what the app reads: `{ version: 2, generatedAt, episodes: [{ videoId, title, published, summary, guests, guestsUnnamed, uncertain }] }`. No descriptions (they are 680 of the ~870 KB) |
| `next-episode.json` | the Action | unchanged |

`sourceHash` is the first 16 hex characters of SHA-256 over `title + "\n" + description`. An episode is
**to do** when `details.json` has no entry for it or its `sourceHash` differs from the current source.
A stale entry is still shown until it is redone: lagging is fine, the show is monthly.

### Tool

- `run.mjs` (the Action): reads RSS, updates `sources.json`, rebuilds `episodes.json`. No AI, no key.
- `pending.mjs <dir>`: prints the to-do episodes as `[{ videoId, title, date, description }]`, the input
  the prompt expects.
- `apply-details.mjs <dir> <results.json>`: validates each result against the prompt's shape, stamps
  the current `sourceHash`, merges into `details.json`, rebuilds `episodes.json`.
- `prompts/episode-details.md`: the instructions, shared by the backfill and every later run.
- One-off migration of the existing scratch data happens once, outside the repo.

### App

- `episodes.json` version 2. The window shows `summary` in the details card in place of the
  description; guests under it.
- The episode list gains a search box (title, summary, guest names; case- and accent-insensitive)
  and a guest filter (every guest name across episodes, with a count). Both work on the whole
  archive; the list still renders 30 at a time with Show more.
- The shipped snapshot is the v2 `episodes.json` and is loaded with a dynamic `import()` only when
  the feed cannot be read, so the desktop's normal start does not pay for it.

---

## Addendum 2026-10-01 (2): the window, round 2

The owner rejected the built window after seeing it in a real backoffice ("not premium, not Umbraco
native, mushed together", a double scrollbar). The reference is now
[mockups/2026-10-01-umbracoffee-redesign.html](mockups/2026-10-01-umbracoffee-redesign.html); its
renders win over anything earlier in this plan.

Decided:

- One scroll area. Only the episode list scrolls; the window body never does, at any size.
- No header row and no cards: the player runs to the content edges with our control bar under it,
  then title, a state tag (Live, Starts in, Latest episode) on the date line, guests, summary. Nothing
  is drawn for a missing summary or guests.
- Right column: the search field ("Title, topic or guest", also matches guest names) and a gear;
  the episode list below it. No guest dropdown (too long a list); the count line only while
  searching. The current row uses the backoffice's light pink current colour, marked "Now playing".
- Live: Chat and Episodes tabs at the top of the right column, opening on Chat. No tabs otherwise.
- Settings: the gear opens a dialog over the window content in Solitaire's pattern (scrim, centred
  panel, "Settings", close X, a uui-box style "Reminders" box with the Remind me switch, Done). The
  in-app switch leaves the header. Offline: the switch is disabled and the dialog says why.
- Offline: no banner. A warning icon beside the gear, its text in a tooltip on hover and focus.
- Narrow (about 480 wide): the list goes under the player and still is the only scroll area; the gear
  sits beside the search field.
- Control bar gains back and forward 10 s and a playback speed control (IFrame API `seekTo`,
  `setPlaybackRate`).
- Umbraco look from Umbraco 17's own values (3px corners, 33px fields and buttons, Lato). Windows 11 in
  its light variant when the backoffice is light.

### Testing by hand and from a browser test (2026-10-11)

The feed cannot be made to say "starts in eight minutes" or "live" on demand, so umbraCoffee puts
commands on `window.umbraCoffee` whenever the cup or the window loads (`umbracoffee/console.ts`).
Type `umbraCoffee.help()` in the browser console, or call them from puppeteer with `page.evaluate`.
`simulate('upcoming', minutes)`, `simulate('live')`, `simulate('none')` and `simulate('offline')`
swap the store's feed for a stand-in through `UmbraCoffeeStore.simulate`, so the schedule, the
window, the cup and the reminders run their real path. Each simulated episode gets its own id, so its
reminders show every time. `reset()` goes back to the real feed, `forgetReminders()` clears the
reminder record, `status()` says what the app believes. A simulation lasts until `reset()` or a reload.
