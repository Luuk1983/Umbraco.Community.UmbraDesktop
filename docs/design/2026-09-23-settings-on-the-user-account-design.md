# Desktop settings on the user account — Design

> Desktop settings move off the browser and onto the person. Wallpaper, theme, Favourites and the
> rest follow you between machines and survive clearing site data, because they live on your Umbraco
> account rather than in one browser's `localStorage`. Getting there needs a one-way migration that
> can only run in a browser, so this also builds the small client-side migration runner that does it.

- **Status:** Implemented 2026-09-23, verified on the TestInstance 2026-09-24 (§12), reviewed and corrected 2026-09-27 (§14)
- **Date:** 2026-09-23
- **Branch:** `claude/localstorage-database-migration-110ec3`
- **Issue:** [#29](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/29)
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

Settings are keyed by user today but stored per browser, so they are a property of the machine
rather than of the person. Sign in somewhere else and you get the defaults back, including losing a
wallpaper you picked out of the Media Library by hand.

**In scope:**

- Per-user server storage for `UmbraDesktopSettings`.
- `localStorage` demoted from source of truth to cache.
- A one-way, one-time migration of an existing `localStorage` payload onto the account.
- A general client-side migration runner with a ledger, since this is the first of these and will
  not be the last.
- Feedback while it happens: a line on the boot splash when a load runs long, and a screen of its
  own for the migration (§6).

**Out of scope:**

- Any change to the settings **shape**. `v` stays `1`; the issue is explicit that a storage move is
  not a reason to bump it, and the note on `parseSettings` explains what bumping it would cost every
  user who already has a payload.
- Instance-scoped settings. App name, app icon and connections are already server-side and are not
  moving (§3).
- Syncing settings between *environments*. That is a separate issue, and it is why a media wallpaper
  keeps its media `unique` rather than being flattened to a URL.
- A table, a schema migration, a controller or a generated-client regeneration. The one piece of C#
  here is a notification handler, and it exists for a reason unrelated to storage (§13.1).

## 2. Where the data lives

Umbraco ships a per-user key/value store, `umbracoUserData`, reached through
`/umbraco/management/api/v1/user-data`. It arrived in 14.0.0 carrying the tour data that used to be
a column on `umbracoUser` (`V_14_0_0/MigrateTours.cs`), and a JSON blob under a package's own
`group` is exactly the shape it was built for.

That settles the issue's one open question — custom table or Umbraco's own storage — in favour of
Umbraco's own, and it removes most of the cost the issue anticipated. **No table, no migration plan,
no controller, no generated-client regeneration.** The only C# is the deletion handler in §13.1, which
is not about storing anything. The precedent is already in this package: `DesktopConnectionStore`
reasons the same way about `IKeyValueService`.

### 2.1 The rows

| Group | Identifier | Value |
|---|---|---|
| `Umbraco.Community.UmbraDesktop` | `settings` | `UmbraDesktopSettings`, serialised by `serialiseSettings` |
| `Umbraco.Community.UmbraDesktop` | `migrations` | The ledger: `{ "v": 1, "applied": ["0001-settings-to-user-data"] }` |

The group is the package's assembly name, which is also what this package already uses for its
`IKeyValueService` documents. Core has no convention to follow: the v14 tours migration wrote
`umbraco.tours`, while the first user preference to use the store since writes
`Umbraco.BackOffice.Media`. Taking the assembly name is the option that cannot collide with a
lowercase `umbraco.` group core adds later.

**The group is never to be changed.** It is half the address of every row, and SQLite compares text
case-sensitively by default, so even a change of casing would leave every existing user's settings
in a group nothing reads. It is comfortably inside the `nvarchar(255)` column, which has no
validation in front of it — an overlong group surfaces as a raw database error rather than a 400.
`value` is `nvarchar(max)`, so a few KB of JSON is a non-issue.

### 2.2 What the API does and does not guarantee

Read from `release-17.0.0` of `umbraco/Umbraco-CMS`. Four facts shape the client.

1. **Authorization is exactly the gate the issue asks for.** The `UserData` controllers carry no
   `[Authorize]` of their own, so they inherit `BackOfficeAccess` from `ManagementApiControllerBase`,
   which checks authenticated and approved and nothing else. No section access is involved, which is
   right: these are personal preferences, not a Settings-section concern.
2. **GET, POST and DELETE are scoped to the caller.** The user key comes from
   `IBackOfficeSecurityAccessor`, never from the body. GET filters server-side on the current user,
   POST forces `UserKey = currentUserKey`, and DELETE returns 401 on somebody else's row. The
   request models have no `userKey` field at all, so there is no id to remember not to trust.
3. **There is no uniqueness constraint on (user, group, identifier).** The index on `userKey` is
   non-clustered with `group` and `identifier` as include columns, `CreateAsync` checks existence by
   `key` only, and the mapper assigns a fresh Guid when the body omits one. A POST without a key
   therefore *always* succeeds. There is no upsert.
4. **PUT has no ownership check.** `UpdateUserDataController` maps the body, sets
   `UserKey = currentUserKey` and saves, and `UpdateAsync` only verifies the row exists. A user who
   knew another user's row Guid could blind-overwrite it and take ownership of it. Keys are v4 Guids
   and GET-by-key blocks reading them, so it is not practically reachable, and it is upstream's to
   fix. Nothing here works around it. It is recorded so nobody later assumes PUT is ownership-safe.

Fact 3 is the one with teeth, so the save contract is fixed:

```
GET ?groups=<group>        (once per load — see §2.3)
  rows for this identifier:
    0        -> POST, with a key we chose ourselves
    1        -> PUT with that row's key
    several  -> PUT the first, DELETE the rest
  the read failed -> refuse to write at all
```

The duplicate branch is not defensive padding. Nothing in core prevents duplicates, this package is
not the only thing that can write them, and a settings screen that read a different row than it
wrote would be a bug nobody could reproduce.

Two more details that are easy to get wrong. The create carries a **client-chosen key**, because a
create returns `201` with no body: a row whose key we never learn cannot be updated afterwards, and
with no uniqueness constraint the next write would make a second one instead of failing. And a write
is refused outright when the group could not be read — with no view of what is stored, a create is
the only move available, and a create against an identifier that already has a row is precisely how
a duplicate is made.

Nothing is cached server-side and the repository has no cache policy, so every read is a database
round trip. Read once per load, never per component.

### 2.3 One read per load

Two readers want rows from this group on every load: the migration runner wants the ledger, and the
settings context wants the settings. Filtering by `groups` alone returns both in one response, so the
repository fetches the whole group once per load and serves both from that, writing through on
save. Two consumers, one round trip, and neither has to know the other exists.

An unfiltered GET is still never used. It would pull up to a hundred rows of `nvarchar(max)`
belonging to other packages.

## 3. Three scopes, two mechanisms

This package stores three kinds of thing, and conflating them is the mistake this section exists to
prevent.

| Scope | Examples | Lives in | Migrated by |
|---|---|---|---|
| Browser | boot hint, boot marker, session exit flag | `localStorage` / `sessionStorage` | Never. They are *about* the browser |
| User | wallpaper, theme, Favourites, locale, `bootIntoDesktop` | `umbracoUserData` after this change | The client runner in §5 |
| Instance | app name and icon, connections | `IKeyValueService` | Umbraco's own `PackageMigrationPlan`, server-side |

**The client runner is user-scoped, and deliberately.** A client migration runs in one person's
browser, under that person's identity, whenever they happen to sign in. For user data that is not
merely acceptable, it is the only option: `localStorage` is unreachable from anywhere else. For
instance data it is the wrong place on three counts — whichever user signs in first runs it, it runs
with whatever permissions that person happens to have, and two people signing in together race each
other. Umbraco answers all three with `PackageMigrationPlan`, which runs once, at boot, server-side,
with no authorization question at all.

So the runner will not grow an instance ledger. If instance-scoped data ever needs reshaping, it
gets a migration plan in C#, and this section is where that was decided.

## 4. `localStorage` becomes a cache

The key does not change: `umbradesktop:settings:<userUnique>`, still built by `settingsStorageKey`.
It simply stops being the source of truth. That keeps `entrypoint.ts` untouched, and has the pleasant
side effect that an older build of the package rolled back onto a migrated account still finds a
payload it understands.

### 4.1 The rule

**The cache is only ever written from a value the server confirmed.**

- Server read succeeded → mirror it into the cache.
- Server write succeeded → mirror it into the cache.
- Either failed → leave the cache alone. The session runs from memory and forgets.

That single rule delivers the issue's "a server that cannot be reached still gives a working desktop
for the session" without a second code path, and it makes cache-versus-server divergence impossible
rather than merely unlikely. There is never a local edit sitting in the cache waiting to be silently
overwritten by a later read, because an edit that did not reach the server never reaches the cache
either.

### 4.1.1 The boot hint is part of the cache

`UMBRADESKTOP_BOOT_HINT_KEY` is written **by the cache itself**, derived from the payload being
cached, and never anywhere else. `setBootIntoDesktop` no longer writes it directly.

This was not in the first draft of this document and is worth recording, because the draft was
wrong. Two keys are read at two different moments by two different pieces of code: the hint decides
whether to raise the splash, during the bundle's own evaluation, before anything can say who is
signed in; the payload decides whether to navigate, once the user has resolved. Writing the hint on
every load while writing the payload only sometimes lets them disagree — and a browser whose hint
says no while its payload says yes navigates to the desktop with **no splash at all**, which is the
exact flash this whole feature exists to remove.

Putting both writes in one function makes disagreeing impossible rather than unlikely. A payload
this build cannot parse yields a hint of `false`, which is the safe direction: a missing splash
costs a moment of the classic backoffice, while a splash raised for a boot that never comes covers a
screen that was working.

### 4.2 Boot keeps reading the cache, and why that is not about latency

`entrypoint.ts` reads the payload synchronously, before anything is painted, to decide whether to
boot into the desktop. It keeps doing exactly that, reading the cache.

The obvious first argument for this is that a request would be too slow, and **that argument does
not survive contact with the code**. It is true of one moment and not the other, so both are worth
separating:

- **Raising the splash** happens in `bundle.manifests.ts` during the bundle module's own evaluation,
  inside the backoffice route guard, before `backoffice.element.js` is imported. No request is
  possible here at all — a top-level await would hold the entire backoffice bundle for every user,
  including everyone who never boots. This is what `UMBRADESKTOP_BOOT_HINT_KEY` is for.
- **Deciding to navigate** happens in `decideBoot()`, which is already asynchronous and already sits
  behind a full round trip: it awaits `UMB_SERVER_CONTEXT`, then `UMB_CURRENT_USER_CONTEXT`, then
  `observe(currentUser).asPromise()`, and the current user resolves only once its management API
  request returns. An extra request there is not a new class of delay, and since `user-data` needs no
  user id it could even be issued concurrently.

The real reason is **coherence between those two moments.** The splash is raised from the hint; the
navigation is decided from the preference. When the two disagree the boot looks broken, in one of two
ways:

- Hint true, decision false: a splash goes up and then lifts onto the classic backoffice.
- Hint false, decision true: no splash goes up, so the user watches the classic backoffice build and
  then be replaced by the desktop. This is the exact flash the splash exists to remove.

Reading the cache makes the two values the same value by construction, so neither can happen except
in the cases that are meant to differ — a spent boot marker, a session exit, or section access. Put
the decision on the server and they diverge whenever the preference was changed on another machine.
That could be patched by raising the splash late, just before `waitForSectionRoute()`, but it puts a
new branch into the most delicate code in the package to buy a correct boot one load earlier.

Two consequences, both accepted:

- **`bootIntoDesktop` takes effect in a browser only after the desktop has been opened there once.**
  A user who turns it on at home and then signs in at the office lands in the classic backoffice
  that first time. Opening the desktop once writes the cache, and every load after that boots.
- **A change made elsewhere is one load late.** Turn it off at home, and the office browser boots you
  in once more before its cache catches up. Self-correcting, and in the safe direction, since the
  desktop's own Exit is always there.

### 4.3 Two browsers, one empty server

Both hold pre-update settings, the server has none. Whichever loads first migrates and wins. The
second finds a non-empty server, adopts it, and its own payload is never read again. One-way, no
merge, exactly as the issue specifies. Worth a line in the release notes, because the loser's
wallpaper does quietly change.

## 5. The migration runner

New folder `desktop/migrations/`, knowing nothing about settings. Migrations arrive as data.

```ts
interface UmbraDesktopMigration {
  /** Stable, sortable id. Never reused, never renumbered. */
  readonly id: string;
  /** One line, shown on the splash while it runs. */
  readonly description: string;
  /** Runs the migration. Resolves true when it changed something. */
  run(): Promise<boolean>;
}
```

The runner reads the ledger, skips what is already applied, runs the rest in declaration order,
records each one that resolves `true`, and stops at the first throw.

### 5.1 Recorded only when it did work

`run` returning a boolean is the load-bearing part of this contract.

The obvious design records every migration that completes. It loses data. Consider a user who
updates on Monday and happens to sign in first on a machine they have never used before: the
migration runs, finds no `localStorage`, completes, and is recorded. On Tuesday they sign in on their
real machine, where their actual wallpaper and Favourites are sitting in `localStorage` — and the
runner skips the migration, because the ledger says it is done. The settings are gone, and nothing
failed.

Recording only on `true` removes that. A migration with nothing to do is simply not finished yet.

The cost is that such a migration re-runs its check on every load. Here that is a `localStorage` read
against an already-parsed payload, which is free. When a migration turns up whose *check* is
expensive, it gets an opt-in flag to record unconditionally — and not before, because a flag with no
caller is a flag nobody has tested.

### 5.2 Failure and unreachability

- **Ledger unreadable** (server down, request refused): run nothing, record nothing, carry on from
  the cache. A migration that cannot be recorded must not run, or it runs again on every load.
- **A migration throws:** it is not recorded, later migrations do not run, and the desktop continues
  on the cache or the defaults. The user is told once the desktop is up (§6).
- **Ledger write fails after a successful migration:** the work stands, the record does not, and it
  is attempted again next load. Every migration must therefore be idempotent, which §5.3 is. The run
  **continues** to the next migration rather than stopping. Stopping would let one permanently
  failing write block every later migration for good, which is a far more expensive failure than
  repeating idempotent work. The report names these separately as `unrecorded`, so a caller can log
  them without interrupting anybody.

A migration that *throws* does stop the run, because a later one may depend on the state the failed
one was halfway through producing. A record that fails carries no such implication.

### 5.3 `0001-settings-to-user-data`

The only migration in the list today.

```
server row absent AND localStorage payload present  -> write it to the server, resolve true
anything else                                       -> resolve false
```

Being self-detecting, it would work correctly with no ledger at all: once the server has a row,
`localStorage` is never consulted again. That is worth stating plainly rather than letting the ledger
look load-bearing here. The ledger is infrastructure for the second migration, and the
records-only-on-`true` rule is what keeps it from being actively harmful to the first.

It parses through `parseSettings` before writing, so a corrupt local payload migrates as the defaults
rather than putting something unreadable on the account.

### 5.4 Where it runs

The settings context awaits the runner before it reads settings, inside the `#load()` it already
starts when the current user resolves. That is the only moment that satisfies all three constraints:
the user is known, the desktop is mounted so there is something to report progress to, and nothing
has painted the defaults yet because `#loaded` still gates the desktop.

The runner is passed in rather than constructed there, so the context depends on the interface and
the tests can drive a runner that does nothing. The migration list is assembled in
`migrations/index.ts` and nowhere else.

This is also why nothing migrates for a user who never opens the desktop. Their settings are still in
`localStorage` on that browser, which is exactly where they were before, so nothing is lost by
waiting.

## 6. Feedback

Two separate surfaces, because a slow load and a migration are different events.

### 6.1 A slow load: a line on the boot splash

`splash.ts` gains `setBootSplashStatus(text | null)`: one line under the wordmark, plain DOM and
inline style, no Lit, no icon registry, no context. The constraints in that file's header are
unchanged and non-negotiable — it paints before anything else exists. The caller passes an
**already-localized** string, so the splash still depends on nothing.

It appears only after `UMBRADESKTOP_BOOT_STATUS_DELAY_MS` (1500 ms), so a normal boot never shows
it. A line saying settings are loading is reassuring after a second and a half and faintly alarming
after eighty milliseconds, because at eighty it announces that something is slow when nothing is.

### 6.2 A migration: a screen of its own, after the desktop has loaded

**This replaces a first draft that put the migration on the splash, and the first draft was wrong.**
Two things killed it. The migration is two requests, so on any normal connection the line was gone
before anyone could read it — the best it could ever be was an explanation for a boot that was slow
anyway. And the splash is only raised when somebody *boots into* the desktop; everybody who reaches
it by clicking the section, which on the first load after an update is most people, would have seen
nothing at all.

So the migration runs **after** the desktop is on screen, behind `migration-screen.element.ts`,
which covers the desktop from inside it. The way somebody entered stops mattering, and the migration
stops being a delay and becomes an event with a beginning and an end that can be narrated.

Three states, and they are deliberately not symmetric:

- **Running** shows the mark and turning arc from `loader.element.ts`, the same one the splash and
  the window bodies use, and **cannot be dismissed**. Half a migration is the one moment nobody
  should be able to walk away from into a desktop about to change under them.
- **Done** waits for a button press. Not a timed hold: a timer has to guess how fast somebody reads,
  and an event nobody saw finish did not visibly happen. It explains what changed for the person —
  their desktop now follows them — rather than what moved where.
- **Failed** leads with what is still true: nothing was lost, the settings are still in this browser,
  and it will try again at the next sign-in. A red-looking screen at sign-in otherwise reads as data
  loss. It is dismissible for the same reason Done is.

The screen is **theme-neutral**, using the splash's own ground and typography rather than theme
tokens. This is the machine talking about itself, not desktop chrome, and something that looked
different under each of five themes would read as part of the desktop rather than as an event
happening to it.

Ordering is the part to get right, and it is pinned in the settings context: the phase is set
**before** `loaded` flips, so the screen and the desktop arrive in the same frame. The desktop
underneath is painting this browser's settings at that moment, because the account had none, and a
screen arriving a beat late would be a flash of a desktop that is about to change.

### 6.3 Who sees the screen

The gate is `pending()`: the account has no settings row **and** this browser has a payload to move.

| Who | Screen? |
|---|---|
| A new user, any browser | No. Nothing to move |
| An existing user, on the browser they set the desktop up in | Yes, once |
| An existing user, on a browser they never used the desktop in | No. That browser has nothing; the screen appears on the one that does |
| Anyone, after the migration has run once anywhere | No. The account has a row, and the ledger has the id |
| Anyone whose server is unreachable | No. The ledger cannot be read, so nothing is pending |

The one odd path, recorded rather than fixed: if an account's settings row were deleted server-side
while a browser still held a cached copy, the screen would appear there and push the cache back up.
That is a recovery, and the wording still reads correctly for it.

### 6.4 What is no longer reported anywhere

A migration that **could not run at all** — an unreachable server — says nothing. The desktop has
already recovered by painting the cache, and announcing a condition the user cannot act on, before
they have even seen their own desktop, is noise. A migration that ran and **threw** is different, and
that is what the failed screen is for.

A settings **save** that the account refuses still goes to `UMB_NOTIFICATION_CONTEXT`, because a
theme that silently failed to save looks identical to one that saved until the next machine.

## 7. Failure matrix

The cache and the legacy payload are the same `localStorage` key, so they are one column. It holds
this browser's copy, whether that copy predates the move or was mirrored there afterwards.

| Account | This browser | Result |
|---|---|---|
| Has settings | any | Account wins. Cache refreshed. The browser's own copy is never read again |
| Empty | Has a copy | Cache paints, the screen runs the migration, the account takes over |
| Empty | Nothing | Defaults. **Nothing written at all** — see below |
| Unreachable | Has a copy | Cache paints. The session runs in memory and forgets. No migration, no screen |
| Unreachable | Nothing | Defaults. The session forgets. No migration, no screen |
| Reachable, write refused | any | The change stands for the session. Cache untouched, and the user is told |

The third row is the one that looks like an omission and is not. Writing the defaults to the account
for a brand new user would make the account non-empty, and a non-empty account is one migration
`0001` will never run against — so somebody whose real desktop lives in another browser would have it
stranded there by a write that was only trying to be tidy. It has its own test.

## 8. Testing

Mostly TypeScript, `web-test-runner`, plus xunit for the one C# class (§13.1). Tests first
throughout, per `CLAUDE.md`.

- **`user-data.repository`**: all four save branches (none, one, several, request failure), that a
  failed read is a third answer rather than "no rows" and is retried rather than remembered, and
  that two consumers asking at once share one request.
- **`ledger`**: read, write, absent row, unreadable server, and a malformed ledger value reading as
  empty rather than throwing.
- **`runner`**: declaration order, applied ones skipped, recorded only on `true`, stops at the first
  throw, runs nothing when the ledger is unreadable.
- **`0001-settings-to-user-data`**: the §7 matrix, and specifically the fresh-browser-first-sign-in
  case from §5.1, which is the one the obvious design gets wrong.
- **`settings-cache`**: reads and writes under the per-user key, survives a `Storage` that throws on
  everything, and writes the boot hint with the payload rather than apart from it (§4.1.1).
- **`settings-persistence`**: the §7 matrix in full, that loading no longer runs migrations, that a
  brand new user has nothing written for them, and the whole vertical slice once — real migration,
  real ledger, fakes only for the two stores.
- **`pending`**: nothing when no migration has work, applied ones ignored, nothing when the ledger
  is unreadable, and a look-ahead that throws counting as nothing rather than taking the desktop
  down over a cosmetic question.
- **`migration-copy`**: every state says something, only the two a person can leave offer a way out,
  and every key it names exists in the dictionary — a missing one would render as its own token on a
  screen covering the whole desktop.
- **`migration-screen.element`**: turns while running, cannot be dismissed while running, waits for
  a press when done or failed, and covers rather than floats. Shape only; the wording is tested
  against the dictionary next door.
- **`splash`**: the status line appears, replaces itself, goes away, is set as text rather than
  markup, and is ignored when no splash is up.
- **`splash-status`**: silent before the delay, says only the latest line when it passes, immediate
  after that, and says nothing at all if the boot finished first.
- **`DesktopUserDataCleanupHandler`** (xunit): removes this package's rows for a deleted user,
  leaves other groups and other users alone, clears duplicates, pages past the first page, and does
  not throw when a delete is refused.

## 9. Files

As built:

```
backoffice/src/desktop/
  user-data/
    types.ts                      the row, and the four-operation port
    constants.ts                  group and settings identifier
    server.client.ts              the port over UserDataService, every call quiet
    user-data.repository.ts       the save contract (§2.2) and the one read per load (§2.3)
  migrations/
    types.ts                      the migration, ledger and store interfaces, the report, the phase
    ledger.ts                     user-data backed ledger, forgiving of payloads, strict about fetches
    runner.ts                     order, skip, record-only-what-worked, stop on throw
    pending.ts                    the advisory look-ahead that decides whether a screen appears
    migration-copy.ts             which keys each of the three states renders
    migration-screen.element.ts   the screen itself
    index.ts                      the list, in order
    0001-settings-to-user-data.ts
    fake-store.test-helper.ts     shared in-memory store for the tests
  settings/
    settings-cache.ts             the browser copy, and the boot hint that moves with it (§4.1.1)
    settings-persistence.ts       load, pending, migrate, save — where the §4.1 rule lives
    settings.context.ts           owns the sequence: load, paint, screen, migrate, apply, dismiss
  components/
    desktop.element.ts            renders the screen inside the desktop, in the same pass
  boot/
    splash.ts                     setBootSplashStatus, text never markup
    splash-status.ts              when the splash is allowed to speak
    constants.ts                  UMBRADESKTOP_BOOT_STATUS_DELAY_MS
  localization/en.ts, nl.ts       the status line, the screen's three states, the save failure

src/Umbraco.Community.UmbraDesktop/
  UserData/DesktopUserData.cs               the group, as a C# literal beside the TypeScript one
  UserData/DesktopUserDataCleanupHandler.cs clears our rows when a user is deleted (§13.1)
  Composing/UserDataComposer.cs             registers it
```

`settings-store.ts` and `settings/types.ts` do not change. Neither does `entrypoint.ts`, which was
the point of keeping the cache key.

Three things ended up different from the first plan. `settings.context.ts` did not grow a
server-first `#read`/`#persist`; the whole relationship moved into `settings-persistence.ts` instead,
leaving the context about state and the behaviour testable without a backoffice. The browser copy
turned out to be two keys rather than one, which is §4.1.1. And the migration moved off the splash
entirely and into a screen inside the desktop, which is §6.2 and is the change that made the entry
path stop mattering.

## 10. Definition of done

- `README.md`: user-facing. Settings following you between machines belongs wherever settings are
  described, in every place they are named rather than the first one found.
- `umbraco-marketplace-umbraco.community.umbradesktop.json`: `Tags` gains the searchable term. The
  `Description` is **not** touched — it is the card blurb rather than a summary, and per `CLAUDE.md`
  a storage change is not what it is for.
- `docs/design/`: this document.
- `backoffice/public/umbraco-package.json`: unchanged. It registers one bundle, and nothing here adds
  an extension type.

## 11. Alternatives considered

**A custom table with an Umbraco migration.** What the issue expected, and most of its anticipated
cost. `umbracoUserData` does the same job with no schema to own, no upgrade path to test and no C# to
ship. A table would only earn its keep if these settings ever needed querying across users, which is
not something a personal preference does.

**Reading the server for the boot decision.** Correct in every edge case: a new browser would boot
the first time, and a preference turned off elsewhere would take effect at once. Rejected on
coherence rather than latency, for the reasons in §4.2 — the splash and the decision would then read
two different values, and the visible failure is a flash in both directions.

**Server-side storage with `localStorage` dropped entirely.** Cleaner to describe, and it breaks the
boot outright: the splash decision happens during module evaluation, where no request exists.

**A separate cache key, with the legacy key deleted after migrating.** Unambiguous about which value
is which, at the cost of a rollback losing everything and the deletion being unrecoverable if the
migration turned out to be wrong. Reusing the key and letting the server's presence decide is both
simpler and safer.

**A manifest-registered migration type other packages could contribute to.** Real cross-package
reuse, and it would make this package the owner of a public contract before a second consumer exists.
The module is written generically so it can be lifted out later; it is not published as a contract
now. The same reasoning kept the app catalogue curated rather than manifest-driven.

## 12. Verified against a running instance

Exercised on the TestInstance on 2026-09-24, against a real Umbraco 17 database, and confirmed from
the `umbracoUserData` table rather than from the screen:

- A user with settings in `localStorage` and nothing on their account saw the migration screen, and
  the account then held their payload — theirs, not the defaults.
- The ledger row held `{"v":1,"applied":["0001-settings-to-user-data"]}`.
- A filtered read comes back in the shape the client assumes, and a POST carrying a
  **client-chosen key** is accepted.
- Changing a setting afterwards **updated the existing row**. Two rows total, one per identifier,
  so the read-then-PUT-or-POST contract holds and the duplicate hazard in §2.2 is closed.
- Clearing `localStorage` and signing in again restored the desktop from the account, which is the
  feature itself.

Still unexercised, and both deliberately hard to reach:

- The screen's **failed** state. It needs a read that succeeds followed by a write that does not.
- `DesktopUserDataCleanupHandler` against a real delete, which core refuses for any user who has
  signed in (§13.1). It is covered by unit tests and is defensive in any case.

### 12.1 What was not verified before this

Kept as a record of what the tests could not reach on their own, since the fakes made all three of
these look fine: the response shape from `getUserData`, whether a POST with our own key is accepted,
and the boot path end to end. All three held.

## 13. Is `umbracoUserData` meant to be used this way?

Checked before shipping, because we would be the first third-party package in it.

**Yes, on intent.** The originating PR, [#15923](https://github.com/umbraco/Umbraco-CMS/pull/15923)
(HQ, merged 2024-04-09, shipped v14), describes it as

> "a collection of user bound data ... not considered an entity but rather a bucket of anything one
> would like to store against the user without validation/knowledge on the server side. This allows
> syncing of client related information across multiple hosts. Example: tours and user settings like
> theme and language."

That is this payload almost word for word. The types are `public` in `Umbraco.Cms.Core`, registered
by default, with no `[Obsolete]` and nothing marking them internal.

**With three honest caveats.** There is no documentation page and no RFC, so this is inferred intent
rather than a promise. Nothing in the v17 backoffice calls these endpoints — `UserDataService` exists
only in the generated SDK, there is no repository or context around it, and there is no tours package
left, so the table currently holds v14-migrated rows that nothing reads. And no other third-party
package appears to use it.

The one piece of evidence against is that `umbraco/Umbraco.AI` considered and rejected it. Its
reasons were all relational — it needed a composite `(UserId, AgentId)` index, ordering by last-used,
and a cascade on agent delete — and none apply to one small blob. It rejected `localStorage` in the
same breath, for our reason. It credited the store with "no migrations and ownership enforced by the
CMS".

### 13.1 The user-deletion foreign key

`UserDataDto` declares `[ForeignKey(typeof(UserDto), Column = "key")]` with no `OnDelete`, and
`ForeignKeyAttribute.OnDelete` defaults to `Rule.None`, so there is no cascade.
`UserRepository.GetDeleteClauses()` deletes from seven tables and `umbracoUserData` is not among
them. A hard delete of a user holding rows would therefore fail on the constraint.

**Not reachable through the backoffice.** `IUserService.DeleteAsync`, which `DeleteUserController`
calls, refuses first:

```csharp
// Check user hasn't logged in. If they have they may have made content changes which will mean
// the Id is associated with audit trails, versions etc. and can't be removed.
if (user.LastLoginDate is not null && user.LastLoginDate != default(DateTime))
{
    return UserOperationStatus.CannotDelete;
}
```

And `BackOfficeUserStore.DeleteAsync` does not delete at all, it calls `DisableAsync`. Since a row of
ours only exists for a user who has signed in *and* opened the desktop, the population Umbraco will
hard-delete is exactly the population with none of our rows.

What remains is `IUserService.Delete(user, deletePermanently: true)` called directly, which is public
and skips the login guard. That path would throw. `UserDeletingNotification` is published inside the
same scope immediately before the repository delete, so a handler that removes this package's rows
there would satisfy the constraint — see the decision recorded against this section.

**Decision: ship the handler.** `UserData/DesktopUserDataCleanupHandler.cs` handles
`UserDeletingNotification` and deletes this package's rows for each user being deleted, registered by
`Composing/UserDataComposer.cs`. Roughly eighty lines and no schema, against the alternative of this
package being the reason somebody's user management fails with an error naming a constraint rather
than us.

Three things it does deliberately. It filters on **our group only**, because a handler that
over-deleted would be worse than the bug it fixes. It **loops from offset zero** rather than paging
forward, since each delete shortens the list and paging forward through a collection being emptied
behind you skips rows. And it **swallows a refused delete**, because the row survives either way and
the foreign key then blocks the user delete exactly as it would have without the handler — throwing
would only put this package in the stack trace instead of the real constraint. It stops looping when
a pass deletes nothing, so a store refusing everything cannot spin inside a user delete.

The group string is now a literal in two languages, `UserData/DesktopUserData.cs` and
`backoffice/src/desktop/user-data/constants.ts`, because a C# constant cannot be read from
TypeScript. Nothing can make them share one, so each side pins the exact string in a test and each
comment names the other file. That is the weakest seam in this change and it is worth knowing about.

The missing delete clause is filed upstream as
[umbraco/Umbraco-CMS#23987](https://github.com/umbraco/Umbraco-CMS/issues/23987). If it is fixed,
this handler becomes redundant rather than wrong, and can go when the package's floor moves past
the release that carries the fix.

## 14. What two reviews found, and what changed

Reviewed 2026-09-27 by two independent passes with no knowledge of the reasoning above: one
adversarial correctness pass, one Umbraco-fit pass. Both were told to treat this document as claims
to verify rather than as fact, which was the right instruction — several of its claims were wrong.

Everything below was confirmed and fixed. It is recorded because the failures are the interesting
part, and because three of them were *described in comments as already handled*.

**Data loss.** Two settings changes inside one round trip created duplicate rows: the save is
deliberately not awaited, both writes found no existing row, and both created one. The later save
then deleted the "duplicate", destroying the newer payload. Writes are now serialised on the
repository. The class comment had claimed to be "the single place that hazard is handled"; it
handled duplicates it found, not ones it made.

**The screen never covered anything.** It was `z-index: 100` against the taskbar's `1,000,000`, in
the same stacking context, so the taskbar and its settings dialog stayed clickable throughout a
migration that was rewriting those settings — which fed the bug above on exactly the path the screen
exists to make safe. The whole stacking order now lives in `desktop/constants.ts` as one derived
list. §6.2's "covers the desktop from inside it" was false when written.

**Covering was never blocking.** Even fixed, the desktop behind stayed in the tab order and exposed
to assistive technology, nothing moved focus to the only control, and `role="status"` wrapped the
button so its label was re-announced on every phase change. Now `alertdialog` with `aria-modal`,
the live region narrowed to the text, `inert` on the surface and taskbar, focus moved on appearance,
and no second `<h1>`.

**Cross-user contamination.** `#persist` and `#refreshView` — the two places `#stale` was written
for — did not have it. Worse, writes are queued, so a save for the user who just signed out could
execute under the next user's token, and core's PUT has no ownership check, so it would re-home the
first user's row onto the second. Repositories are now abandoned when the user changes, and refuse
queued writes.

**The look-ahead was load-bearing.** `types.ts` says "advisory only, nothing depends on it being
right". The one call site gated the entire migration run on it, so a future migration whose
`pending()` was wrong or threw would never have run, on any load, with nothing reported. The runner
now always runs; the look-ahead only decides whether a screen appears.

**Three hangs.** `#load` and `#migrate` had no `catch`, so a throw left the desktop never painting
or the person behind an undismissable screen; the ports they call now enforce the "report, do not
throw" contract they always assumed. The `running` phase was never reset on a user change and had no
timeout, so it could be inherited or left up forever.

**The C# handler could abort an unrelated delete.** No try/catch at all, despite a comment saying
failures were swallowed: a throw propagates through `Task.WaitAll` and rolls back the user delete
that is running around it. It also ignored `notification.Cancel`, so it could delete a user's rows
for a delete another handler then vetoed and committed.

**Truncation.** The client read one page of 100 and ignored `total`, so dedupe could never converge
past a page — for a group whose only way past a page is duplicates. It pages now.

**The "non-destructive" claim was false.** The browser copy lives at the cache's key by design, so
the load after a migration mirrors the account's copy back over it. Harmless when they agree, and
destructive when the payload was unreadable: defaults would be written to the account, recorded as
done, and copied back over the original. The migration now refuses a payload it cannot read, which
matters most for a `v: 2` payload from a later build — not corruption, real settings.

**A documented protection that did not exist.** Both the C# constant and its test said "each side
pins the exact string in a test". Only C# did. Renaming the TypeScript constant, the side that
writes the rows, passed every test in the repository.

Two tests were also removed or rewritten for naming behaviour they did not constrain, and one
assertion — that focus lands on the button — was dropped because driving `uui-button.focus()` wedges
the test runner. That one is recorded in the test file as a deliberate retreat.
