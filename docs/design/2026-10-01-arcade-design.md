# Arcade: design

> Persistent high scores for desktop games, kept per user, shown on leaderboards in a hub app, with
> a notification when somebody takes first place from you. It ships as a service package that game
> packages depend on, so any add-on can put its game on the leaderboards, and a site without games
> carries none of it.

- **Status:** Designed 2026-10-01 with the owner. Built 2026-10-03; §10 has the notes from the build
- **Plan:** [`2026-10-01-arcade-plan.md`](./2026-10-01-arcade-plan.md)
- **Date:** 2026-10-01
- **Branch:** `claude/gaming-service-scores-8ffbf2`
- **Issue:** [#27](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/27). The issue
  asks for a scoring list for Minesweeper; this is the wider service the owner wants behind it
- **Target:** Umbraco CMS **v17**, new package `Umbraco.Community.UmbraDesktop.Services.Arcade`,
  plus one seam in the host and the wiring in `Umbraco.Community.UmbraDesktop.Entertainment`

---

## 1. Goal and scope

Colleagues playing Minesweeper want to compete. That needs scores that outlive the browser, belong
to a person, and can be compared. The issue asks for it for one game; the owner wants it for every
game, including games in add-ons we do not write.

**In scope:**

- A service package: storage, API, a desktop-level context games talk to, a `umbraDesktopGame`
  manifest type, and the Arcade hub app.
- One generic host seam, `umbraDesktopContext`, so a package can provide a context at the desktop's
  level (D3).
- Display names, a public/private choice, deleting your own scores, and admin moderation.
- A notification when you lose first place on a board.
- All three Entertainment games: Minesweeper, Snake, Solitaire.

**Out of scope, and not filed as follow-ups (owner's call):**

- Statistics (played, win rate, streaks), a daily seeded challenge, weekly boards, challenging a
  colleague. Considered during the design; the data model does not block any of them.
- Live push when you are beaten. The check runs when the desktop opens (D10).
- Anything resembling cheat prevention beyond sanity limits (D12).

## 2. Decisions

| # | Decision |
| --- | --- |
| D1 | The service is its own package, `Umbraco.Community.UmbraDesktop.Services.Arcade`, not part of the host and not part of Entertainment |
| D2 | It has no Marketplace listing. Nobody installs it on purpose; it arrives as a dependency |
| D3 | The host gains `umbraDesktopContext`: package contexts created by the desktop element, with it as host |
| D4 | Games reach the Arcade through that context, looked up by its token string. Nothing is imported |
| D5 | Games declare their leaderboards in an `umbraDesktopGame` manifest, linked to their `umbraDesktopApp` by alias |
| D6 | A score belongs to an Umbraco user. On the boards it shows under a display name the user picks |
| D7 | Private by default. Asked once, at the first submitted score |
| D8 | One stored score per user per board: the best. Ties go to whoever got there first |
| D9 | Storage is EF Core, the Umbraco way, with migrations for SQL Server and SQLite |
| D10 | "Beaten" means losing first place, and is shown when the desktop next opens |
| D11 | Admin means having the Users section |
| D12 | Cheat protection is limited to positive values within a board's optional limits, and the guide says so |
| D13 | All three Entertainment games are wired in the first round |

### D1, D2: a separate service package

The first idea was Entertainment, which fails the add-on author: a third-party game would need our
games installed to get scores, and Entertainment would stop being just our collection of apps. The
host was the second idea and works, but the owner's point decided it: this is still a CMS, and a
site with no games should carry no tables, no API and no app for them.

So the service ships like the other add-ons, built from the same commit and pinned to the host by
`BoundHostRange`, and Entertainment references it through NuGet. Installing any game that uses it
brings it along. The `Services.` segment says it is infrastructure, and gives any later shared
service an obvious home.

It has no `umbraco-marketplace` tag and no `umbraco-marketplace-*.json`. Its README is written for
game authors. The hub app ships inside it anyway: if the hub lived in Entertainment, an outside game
would get scores and nowhere to see them.

### D3: `umbraDesktopContext`, not `globalContext`

A `globalContext` is created at the backoffice root. That means in the normal backoffice and inside
every window's iframe, which is exactly where the owner wants nothing of ours running. The desktop
already provides its own contexts at its own element (window manager, theme, notification centre,
settings); a package needs the same.

Umbraco's pattern for this is the workspace, which creates every registered `workspaceContext` with
itself as host through `UmbExtensionsApiInitializer`. The desktop element does the same for
`umbraDesktopContext`:

- created when the desktop connects, destroyed when it disconnects;
- never in the plain backoffice, never in an iframe window;
- manifest `conditions` honoured;
- reachable from apps with an ordinary `consumeContext`, since apps are descendants of the desktop.

An api that fails to load is reported in the console and does not stop the desktop.

### D4, D5: how a game talks to the Arcade

Considered: a context (chosen), games calling the HTTP API directly, and a DOM event. Direct HTTP
makes every author re-do auth, errors, the opt-in question and the feedback toast. An event is
one-way, so a game cannot ask for its best or learn whether a score counted. The context is two-way
and decoupled, and follows the pattern `docs/developer/desktop-apps.md` §7.2 already teaches for the
desktop's date formatting: the game builds an `UmbContextToken` with the published string.

The context offers:

- `submit(game, leaderboard, value)`, answering whether it is a personal best, the previous best,
  and the rank (the would-be rank when private);
- `getBest(game, leaderboard)`;
- an observable of the current user's Arcade profile.

If the Arcade is not installed, the lookup finds nothing and the game behaves as it does today.

`umbraDesktopGame` is separate from `umbraDesktopApp` because a game is still just an app, and the
Arcade only needs what to keep score of:

```ts
{
  type: 'umbraDesktopGame',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Game',
  name: 'Solitaire scores',
  meta: {
    app: 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire',
    label: '#umbraDesktopEntertainment_solitaire',
    icon: 'icon-playing-cards',
    leaderboards: [
      { alias: 'draw-1', label: '...', better: 'higher', format: 'points' },
      { alias: 'draw-3', label: '...', better: 'higher', format: 'points' },
    ],
  },
}
```

Each leaderboard may also carry `min` and `max`. Labels take a `#` key or a literal, as elsewhere.
Malformed `meta` never throws: the manifest is dropped and the console names it.

The game alias the server stores is the manifest's alias, so like an app alias it is final once
shipped.

### D6, D7: identity, display name, privacy

The issue thread debated typed names against Umbraco names. A typed name alone owns nothing, so
nobody could be told their score was beaten. The settled shape: the score belongs to the Umbraco
user (by key); the board shows a display name the user sets, starting as their Umbraco name, at most
32 characters, never empty, not unique. No rude-word filter: it is colleagues, and an admin can
reset a name.

The first time a user submits, the Arcade asks once: show your scores on the leaderboards, with the
display name field prefilled, **Show them** or **Keep them private**. The answer can be changed in
the hub. Going private hides the scores at once without deleting them; going public again restores
them. A user always sees their own row and rank.

### D8: what is stored

The best per user per board, with its date. Times are stored in milliseconds so every value is a
whole number. Equal values rank by date, earlier first.

### D9: EF Core, the Umbraco way

The owner's rule: always EF Core for migrations, done the way Umbraco documents it, so the package
stays compatible when Umbraco itself moves from NPoco to EF Core. That means a package `DbContext`
registered with `AddUmbracoDbContext` (package `Umbraco.Cms.Persistence.EFCore`, which every
Umbraco site already carries through the `Umbraco.Cms` metapackage), reads and writes through
`IEFCoreScopeProvider<T>`, and migrations generated with `dotnet ef`. Checked against the 17.0.0 and
17.7 sources on 2026-10-01; what the docs leave out, and what was decided for each:

- **Two providers.** EF migrations are per provider and Umbraco's docs show only one set. Following
  Microsoft's documented "multiple context types" pattern: `ArcadeDbContext` is the runtime context;
  `SqlServerArcadeDbContext` and `SqliteArcadeDbContext` derive from it only to own a migration set
  each, in `Migrations/SqlServer` and `Migrations/Sqlite`, with a design-time factory each so
  `dotnet ef` works on a class library. The TestInstance and many small sites run SQLite.
- **Applying them.** At startup, outside any scope (SQLite refuses to migrate inside a transaction,
  which is why Umbraco's own executor does the same), only when the runtime level is `Run`, by
  building the derived context that matches the site's provider and calling `MigrateAsync`. Also on
  `DatabaseSchemaAndDataCreatedNotification` and `UnattendedInstallNotification`, as Umbraco does for
  its own EF tables, so a fresh install gets the tables without a restart.
- **The 17.0 floor.** `AddUmbracoDbContext` gained a `shareUmbracoConnection` overload in 17.4 and
  the old one is obsolete there. The package compiles against 17.0, so it uses the old overload,
  which behaves identically.
- **Testing.** `IEFCoreScopeProvider<T>` needs Umbraco's whole scope machinery, so the store talks to
  the database through one small seam (run this against the context, in a scope) that production
  implements with the scope provider and tests implement with an in-memory SQLite connection,
  migrated with the real SQLite migrations.
- **No lock row.** Two submits racing for first place can both believe they took it; the cost is at
  worst one extra or one missing notification. A unique index on user, game and board keeps the
  scores themselves right.

### D10: the beaten notification

A beaten event is recorded only when a public score takes first place from another public user who
has notifications on. Losing second place says nothing; that would be noise.

The check lives in the Arcade's desktop context, so it runs once when the desktop opens and nowhere
else. It fetches and marks read in one call, so two tabs cannot both show the same event. Each event
is raised as an ordinary Umbraco warning toast on the desktop document, so the existing notification
centre (`2026-09-27-desktop-notifications-design.md`) shows it and keeps it in the scrollback. No new
notification system was needed.

Clicking it does nothing beyond what clicking any desktop toast does. The notification centre only
re-raises a toast that carries its own element, and a desktop-raised toast with Umbraco's default
layout has no window to focus, so making the click open the hub would mean a custom toast element
for one link. The message says where to look instead ("Open the Arcade to see the board").

### D11: admin

Users with the Users section may remove a score, reset a board and reset a display name. They
already manage people; no new permission is invented.

### D12: honesty about cheating

The games run in the browser, so anyone with devtools can submit anything. The server refuses
values that are not positive or fall outside a board's limits, and the guide says plainly that this
is a sanity check, not security. Admin removal is the real remedy.

### D13: all three games

Minesweeper is a time where lower wins, Snake is points where higher wins, Solitaire is points per
draw mode. Wiring only Minesweeper would publish a contract that the second game might break.

What each game submits, confirmed with the owner:

- **Minesweeper: time to completion, on a win, to the board `easy`.** Fastest time per board is the
  metric Windows Minesweeper always kept. Today there is one board; larger ones are coming, so this
  one is named `easy` from the start, and each later board is one more entry in the game's
  `leaderboards`. No migration, and nobody's easy time moves. The clock on screen counts whole
  seconds, which on the easy board tie constantly, so the game submits the exact elapsed
  milliseconds from first click to win and the board shows seconds to one decimal (e.g. `9.4`).
- **Snake: the score at game over**, higher wins, one board.
- **Solitaire: the score on a win**, higher wins, one board per draw mode. The game already keeps
  Windows scoring including the win's time bonus (700,000 divided by the seconds taken, none under
  30 seconds), so speed is already in the number and nothing new is measured. A game abandoned
  before winning submits nothing.

## 3. Packages and parts

```
host                       Services.Arcade                          Entertainment
umbraDesktopContext ─────> Arcade context ──> Management API ──> EF Core tables
  (new seam)                ↑      │
                            │      └─> toasts ─> notification centre (host)
              games call ───┘
Arcade hub app (umbraDesktopApp, shown only when a game is registered)
umbraDesktopGame manifest type <──────────────────────── three game manifests
```

- **Host:** the `umbraDesktopContext` type and its initializer on the desktop element, and one
  published member on the window manager, `openApp(alias)`, which the hub's Play button needs. Today
  the manager only has `open(app)`, which takes the resolved app the launcher holds; `openApp` looks
  the alias up in the app catalogue, so a condition that hides an app also stops it being opened
  this way, and returns whether it opened anything. Both go in the new developer page.
- **Services.Arcade server:** `DbContext`, migrations, store, controller under
  `umbradesktop/services/arcade`, the user-deletion handler and the pruning job.
- **The Games launcher group moves to the Arcade.** Entertainment defines it today, so an outside
  game installed without Entertainment would land under More. Every game now brings the Arcade, so
  the Arcade's catalogue defines `games` (same alias, same weight 60) and Entertainment's catalogue
  manifest is removed. Pins and positions are unaffected: they hang off app aliases, not the group's
  owner.
- **Services.Arcade backoffice:** the context, the manifest type and its reader, the opt-in dialog,
  the hub app, and a condition that hides the hub until at least one `umbraDesktopGame` exists.
- **Entertainment:** a project reference to the Arcade (packed as a NuGet dependency), three
  `umbraDesktopGame` manifests, and a submit per game. The first add-on to depend on another add-on:
  `BoundHostRange` in `src/Directory.Build.targets` bounds only the host, by file name, so it is
  widened to bound the Arcade the same way (`[this release, 17.99999999]`), and the release action's
  range check learns to check that dependency too.
  What each submits is in D13. Snake also reads its best from the Arcade, falling back to
  `localStorage` without it.

## 4. Data

| Table | Columns | Notes |
| --- | --- | --- |
| Profile | user key (PK), display name, is public, notify when beaten, asked about public | Created on first submit |
| Leaderboard | game, board (PK pair), better (higher/lower), format (points/time), min, max | Created on first submit from the manifest's definition. A later submit describing it differently is refused with 409 |
| Score | user key, game, board (unique together), value, achieved at | The best only |
| Beaten | id, beaten user key, game, board, by user key, value, at | Latest per user per board only; deleted once shown |

## 5. API

All under `umbradesktop/services/arcade`. Every action requires the Desktop section, checked in the
action, the way Sticky Notes does it, because Umbraco has no policy for a package's own section.

- Get and update my profile.
- Submit a score (carries the board definition from the manifest).
- Read a board: top 10 public entries, plus my own entry and rank.
- Read my best on a board.
- Take my unread beaten events (fetch and mark read in one call).
- Delete everything about me.
- Admin: remove a score, reset a board, reset a display name.

Errors are problem details, since the backoffice HTTP client replaces anything else with a generic
error (see the Sticky Notes controller).

## 6. Cleaning up

| Event | What happens |
| --- | --- |
| User deleted (`UserDeletedNotification`) | Profile, scores and beaten events removed, including events where they were the one who beat someone. Whoever moves into first place is not notified, because nobody beat anyone. `Deleted` rather than `Deleting` (which the host's `DesktopUserDataCleanupHandler` uses): our tables have no foreign key to `umbracoUser`, so nothing has to go first, and `Deleted` only fires once the delete has committed. In practice the backoffice only hard-deletes users who never signed in, who cannot have scores; this covers `IUserService.Delete(user, true)` and whatever Umbraco does later. The disabled row below is the case that actually happens |
| User disabled or locked | Kept, but left out when a board is read. Returns when the user is re-enabled |
| Beaten events never read | Only the latest per user per board is kept; older than 30 days is pruned by a scheduled job |
| A game uninstalled | Data stays, its boards drop out of the hub. Reinstalling brings them back; an admin reset removes them for good |
| The Arcade uninstalled | Umbraco has no uninstall hook, so the tables remain. The README gives the SQL to drop them |

## 7. What players see

- **First submit:** the one-time privacy dialog (D7).
- **Personal best:** a toast, e.g. "New best on Minesweeper: 1:42, 2nd place". No toast for a score
  that is not a best.
- **Beaten:** a warning toast on the next desktop load, e.g. "Anna took first place on Snake from
  you (312 points). Open the Arcade to see the board." (D10)
- **The hub, "Arcade", in the Games group:** a tab per game, its boards side by side (Solitaire has
  Draw 1 and Draw 3). Each board shows rank, display name, score (points, or m:ss) and date for the
  top 10 (a time shows as seconds to one decimal under a minute, m:ss above). Your row is highlighted, and pinned underneath when outside the top 10 or private (marked
  private). A Play button opens the game. A board nobody has played says so. A Profile tab holds
  display name, show my scores, notify me, and Delete my scores behind a confirmation. Admins get
  remove per row, reset per board, reset per display name.
- Themed with the existing app tokens, under all five themes.

## 8. Tests, written first

- **`.Services.Arcade.Tests`, against SQLite through the real `DbContext`:**
  - best kept for higher and for lower; ties to the earlier score
  - a differently described board refused; limits enforced
  - beaten recorded only for a public, notifiable user losing first place
  - private hides, public restores; disabled users hidden
  - user deletion cleans everything; pruning
  - beaten events handed out once
  - controller: no Desktop section refused; admin actions refused without the Users section
- **Host:** `umbraDesktopContext` created on connect, destroyed on disconnect, conditions honoured,
  a failing api reported without breaking the desktop.
- **Arcade front end:**
  - first submit asks once; toast on a best only
  - hub hidden with no games
  - empty board, own row pinned, m:ss formatting
  - malformed manifests dropped with a console line
- **Entertainment:** each game submits the right board and value when it ends; Snake falls back to
  `localStorage`.
- **A real backoffice:** two users, one beats the other, the other sees the notification on their
  next desktop load. The headless recipe in `2026-09-24-accessories-design.md` §9.

## 9. Docs and release

- Host developer guide: a page for `umbraDesktopContext`, linked from the apps and catalogues pages.
- Arcade `docs/`: developer page "Putting your game on the Arcade", user page "Arcade" (boards,
  display name, privacy, deleting your scores).
- Entertainment: user pages mention scores; one README line; leaderboard and high-score tags in its
  marketplace json.
- Arcade README for game authors, including the uninstall SQL. No marketplace json (D2).
- The new package and its test project in `.github/actions/build-packages/action.yml`, the release
  workflow and `RELEASE.md`.
- English and Dutch strings.

## 10. Notes from the build

Built 2026-10-02 and 2026-10-03. Where the plan and Umbraco disagreed, the code follows Umbraco;
each case is below with where it was checked.

**Where the plan was wrong**

- **The Users section alias on the server is `users`, not `Umb.Section.Users`.** `IUser.AllowedSections`
  holds the legacy aliases; Umbraco's `SectionMapper` maps them to `Umb.Section.*` only on the way to
  the browser (17.0.0 source). With the plan's value no admin could ever moderate. The controller
  checks `Constants.Applications.Users`, and a test pins it. The hub does not check sections at all:
  it shows moderation from the `canModerate` flag the board response carries. The Desktop section's
  own alias is custom, so it is the same in both forms.
- **`getContext` has no timeout value.** Its options are `preventTimeout`, `skipHost` and
  `passContextAliasMatches` (backoffice 17.7). Without `preventTimeout` it waits one animation frame
  and then rejects with a string, so every lookup in the Arcade context is wrapped.
- **Games consume the Arcade rather than `getContext` it.** A hidden tab runs no animation frames, so
  a `getContext` there never gave up (the "no Arcade" test took 55 s in the runner), and the Arcade's
  own context loads asynchronously after the desktop opens, so a game opened in that moment missed
  it. `ArcadeScores` in Entertainment consumes the context, which has no timer and is called back
  when the Arcade arrives, and waits at most 500 ms for one not yet provided. The developer guide
  teaches this. Calling it from a game's constructor is safe: a consumer sends its request on
  `hostConnected` and refuses to send it from a disconnected element.
- **A beaten toast could name a game by its raw alias**, because the beaten call can answer before the
  game manifests have registered. The context waits for games, capped at 3 s, before naming them.
- **The migrations need no `NoWarn`.** `dotnet ef` 10 writes `/// <inheritdoc />` on everything it
  generates, so `GenerateDocumentationFile` with warnings as errors builds them clean.
- **An unrecognised provider name skips migration with a warning**, rather than being treated as SQL
  Server. Only `Microsoft.Data.Sqlite` (any casing) and `Microsoft.Data.SqlClient` migrate.

**Umbraco behaviour worth knowing**

- `UmbExtensionsApiInitializer` does not catch a rejecting api loader. A `umbraDesktopContext` that
  fails to load is an unhandled promise rejection in the console, not a handled message; the other
  contexts still load, one promise per manifest. D3's "reported in the console and does not stop the
  desktop" holds in effect.
- `destroy()` runs twice on an Umbraco class (`destroy` calls `host.removeUmbController`, which calls
  `destroy` again), so a package context's teardown must be idempotent. The developer page says so.
- `provideContext` needs a controller, not a plain object, so test fakes extend `UmbControllerBase`.
- `UmbModalBaseElement`'s `value` setter calls `modalContext.setValue`; a test fake whose `setValue`
  assigns `value` recurses. `uui-button` passes its click on after a tick.
- `IUserService.GetAsync(IEnumerable<Guid>)` is a real batch read at 17.0 (`UserService` overrides the
  interface's default). Only `UserState` Disabled and LockedOut hide a player.
- `UmbExtensionConditionConfig` is a global type, not an export of `extension-registry`.
- In C#, inside a class with the `Scores` `DbSet` in scope, `Scores.ScoreRules` binds to the property,
  not the namespace.

**Decided during the build**

- The manifest reader also enforces the server's alias rules (game alias up to 200 of letters, digits,
  `.`, `_`, `-`; board alias up to 64), so a manifest the server would refuse is dropped at load with
  a console line instead of failing every submit.
- Two games submitting a first score at the same moment share one privacy question.
- After **Delete my scores**, a score in the same desktop visit starts a private profile without
  asking again, because the context remembers it asked this visit (which is what stops a stale
  result from asking twice). The question returns on the next desktop load; the user page says so.
- A failed cleanup when a user is deleted is logged, not thrown: the delete has already committed.
- Two concurrent first submits for the same new board or profile can hit a unique index, and the loser
  gets a 500. Accepted under D9's "no lock row"; submitting again succeeds.
- A player's very first score never notifies the leader it beats: the score is submitted while the
  profile is still private (D7's default), and the privacy answer comes after. Only a public score
  counts (D10), so this follows the design; it is the one case where taking first place says nothing.
- The Arcade's docs need their own `umbraDesktopDocs` manifest to reach the Help app; copying them
  into `App_Plugins` is not enough. The cross-package review caught it, not a test.
- The Arcade package's context tests stall at test-runner concurrency 2 (the background-tab stall),
  so its `web-test-runner` config keeps concurrency 1.

**The real-backoffice run** (TestInstance on a LocalDB copy, two test users, headless Chrome through
the host's `puppeteer-core`, as in `2026-09-24-accessories-design.md` §9)

- Passed: the SQL Server migration set on first start (the SQLite set runs in the unit tests), the
  privacy question once, the best toast, the beaten toast once and kept in the scrollback, moderation
  for the admin only (403 for anyone else on all three endpoints), privacy hiding and restoring, and
  no Arcade calls outside the desktop or from a window's iframe.
- Found what no unit test did: under every theme the hub's `uui-tab-group` stretched to fill the
  window (`uui-tab` is `height: 100%` inside a column flex), leaving the boards out of sight. Fixed in
  the hub's styles, with a test that mounts it at a fixed size.
- Scripting the desktop: `UmbContextRequestEventImplementation` needs `'default'` as its second
  argument to find the Arcade's context, and shadow roots are pierced with `>>> a >>> b`.
