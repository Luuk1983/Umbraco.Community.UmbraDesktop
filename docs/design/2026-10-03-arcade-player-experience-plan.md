# Arcade player experience: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Owner's rule, overriding every skill: never commit, push or open a PR.** No task ends in `git
> commit`. Leave all work uncommitted in the working tree; the owner reviews one diff. Where a skill
> says "commit", skip that step and say so in your report.

**Goal:** Put the Arcade's scores inside the games at the moment they matter (a result card and a
leaderboard panel each game places itself), and rebuild the hub as an overview, a game page with a
podium, and a profile behind the player's name, all in one look restyled per theme.

**Architecture:** The server gains four reads (player count and the entry above you on a board, who
you passed on a submit, one overview call). The Arcade's front end gains two published custom
elements, `umbradesktop-arcade-result` and `umbradesktop-arcade-leaderboard`, that pick their compact
form from the box they are given through a container query on one shared constant. The Arcade context
gains a submit option that leaves the asking and the toast to the card, a way to show a board in the
hub, and a beaten toast that opens that board when selected. Entertainment's three games place the
pieces; a game that places neither keeps the first build's dialog and toast.

**Tech stack:** .NET 10, Umbraco 17 (floor 17.0.0, installed backoffice 17.7.0), EF Core, xUnit +
NSubstitute; TypeScript, Lit, `@umbraco-cms/backoffice` 17, `@open-wc/testing` on web-test-runner.

**Design:** [`2026-10-03-arcade-player-experience-design.md`](./2026-10-03-arcade-player-experience-design.md)
(decisions P1 to P14, approved; do not re-open them) and its mock
[`mockups/2026-10-03-arcade.html`](./mockups/2026-10-03-arcade.html). Round one is
[`2026-10-01-arcade-design.md`](./2026-10-01-arcade-design.md); its §10 "Notes from the build" holds
the Umbraco 17 facts this plan leans on. Read all three before Task 1.

**Worktree:** `D:\github\Umbraco.Community.UmbraDesktop\.claude\worktrees\umbraco-cross-env-blocks-5c7197`,
branch `claude/gaming-service-scores-8ffbf2`. The design doc, the mock and this plan are uncommitted
and exist only there.

---

## Conventions every task follows

- **Tests first.** Write the test, run it, watch it fail for the stated reason, then implement. On
  this repository the red run has caught real bugs that review did not.
- **C#:** primary constructors, `var`, records unless mutation is the point, XML docs on every type
  and member including private ones, with `<param>` and `<returns>`.
- **TypeScript:** JSDoc on everything including private members, saying why. Match the density of the
  file you are in. `UmbLitElement`; Lit from `@umbraco-cms/backoffice/external/lit`.
- **Words:** every string goes through the dictionary (Task 7 adds every key this plan uses, in
  English and Dutch). In code, use the `say()` helper from `shared/phrases.ts` (Task 6), which passes
  the English as the fallback and fills `{0}` in it too. Umbraco's `termOrDefault` returns the
  fallback unprocessed when the key is missing (`localization.controller.js` line 171 in 17.7.0), so
  a raw `termOrDefault` with placeholders in the fallback would show `{0}`.
- **No uppercase eyebrows.** The mock sets its kicker (`.k`), its labels (`.lbl`), its ribbon and the
  "YOU" marker in letter-spaced capitals. Do not copy that: the owner has rejected small uppercase
  letter-spaced labels as not Umbraco. Sentence case, semibold, normal letter-spacing, the muted
  colour where it must be quieter. "You won · Easy", "New best", "You".
- **Commands.** From a package folder: `npm test` and `npm run build`. Run both before calling a task
  done: the test runner does not type-check and `tsc` renders nothing. One test file:
  `cd backoffice && npx web-test-runner "src/path/file.test.ts" --node-resolve` (the config's
  `concurrency: 1` and esbuild plugin still apply). C# tests run by project file, never by folder:
  `dotnet test src/Umbraco.Community.UmbraDesktop.Services.Arcade.Tests/Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.csproj`.
- **Paths** are relative to the repository root. `H` = `src/Umbraco.Community.UmbraDesktop`,
  `A` = `src/Umbraco.Community.UmbraDesktop.Services.Arcade`,
  `AT` = `src/Umbraco.Community.UmbraDesktop.Services.Arcade.Tests`,
  `E` = `src/Umbraco.Community.UmbraDesktop.Entertainment`.
- **Published strings** (final once shipped): tag names `umbradesktop-arcade-result` and
  `umbradesktop-arcade-leaderboard`; their attributes, properties and events as Tasks 14 and 15 define
  them; the context members games use (`submit` with its options, `getBest`, `getStanding`); the
  context alias `UmbraDesktopArcadeContext`; the route `umbradesktop/services/arcade`.
- **Where the plan relies on an Umbraco 17 API**, it says "confirm in the installed source" and names
  the file under `A/node_modules/@umbraco-cms/backoffice/dist-cms/`. Do it; round one found two plan
  assumptions wrong that way.

## What this plan settles that the design left open

Each of these follows from the design and the mock; none re-opens a decision. They are written here so
no task has to guess.

1. **Who "passed" means.** A submit names a passed player only when this score moves the player to
   first place from behind someone else, counting the way the player sees the board (their hidden
   score included). Already leading and improving names nobody; the card then shows "1st of N".
2. **The short board of three** on the full card: ranks 1 to 3 when the player is in the top three;
   otherwise the leader, the player directly above, and the player. The board read returns the entry
   above (design §3), so no extra call is needed.
3. **"Next" on the overview** is whoever is second on that board, shown only when the player leads.
4. **The standing strip's third number** counts colleagues shown on any board, not counting the
   player.
5. **The mode last played** (P12) is remembered per game in the browser's `localStorage` by the
   Arcade context on each submit. A game page and a panel opened without a board open on it, falling
   back to the game's first board.
6. **A card's "You won" / "Game over"** is the game's call: an `outcome` attribute, `won` by default.
   Snake sets `over`.
7. **A card's own extra line.** The card has a `detail` slot in its standing line, for something only
   the game knows. Solitaire puts its time bonus there ("incl. 1,520 time bonus", as the mock shows).
8. **The rule line** ("Fastest time wins") is derived from each board's `better` and `format`. A game
   may override it with a new optional `rule` field on its `umbraDesktopGame` manifest. Solitaire sets
   "Highest score wins, time bonus included".
9. **Snake's one board is labelled "Classic"** (the mock's word) instead of repeating "Snake". The
   label is not the alias, so nothing stored moves.
10. **Ordinals** ("3rd", "3e") come from `Intl.PluralRules` with `type: 'ordinal'` and four dictionary
    keys. Snake's chip needs one too, and Entertainment cannot import the Arcade, so the context hands
    games the rank already in words (`rankText`).
11. **The beaten toast is one click.** The desktop draws every toast itself from plain text and, when
    one is selected, raises the notification's own element again (`notification-centre.context.ts`
    `activate`, `notification-watcher.ts` `reraise`). The Arcade raises its toast with its own element;
    when the desktop raises that element again because the player selected the toast, the element
    asks the Arcade to show the board and closes itself. So the toast the player sees is the desktop's
    own, in the theme's look, not the mock's felt toast; the felt version only shows if the Arcade has
    gone. This is the choice listed at the end of the plan.
12. **Fonts.** Fraunces is bundled (Latin subset, variable weight, SIL Open Font License) for names,
    headings and the big numbers' companions; body text uses the theme's own font
    (`--umbradesktop-app-font`) rather than Inter, so a theme still reads as itself. Windows 98 uses
    its own font for headings too. Also listed as a choice at the end.
13. **The panel pauses the game, the game decides how.** Snake pauses when its chip opens the panel
    and resumes on `close` only if it was the one that paused. Solitaire stops its clock on `open` and
    restarts it on `close`. Minesweeper opens the panel only from the win card, so nothing runs.
14. **Theme in the pieces.** A piece inside a game reads the active theme from the desktop's settings
    context (`'UmbraDesktopSettingsContext'`, its `theme` observable) and stamps it on itself as
    `data-umbradesktop-theme`, so one stylesheet with `:host([data-umbradesktop-theme='…'])` blocks
    serves the hub (stamped by the desktop as an app) and the pieces alike. `theme` already exists on
    that context but is not in the published list in `docs/developer/desktop-apps.md` §7.2; Task 23
    adds it there, since a package now depends on it.

## File map

**Arcade server (`A/`)**
- Modify `Scores/ArcadeResults.cs`: `SubmitResult.Passed`, `BoardView.Players` and `.Above`, new
  `PassedPlayer`, `BoardSummary`, `ArcadeOverview`.
- Modify `Scores/ArcadeStore.cs`: the board read, the submit, `GetOverviewAsync`, a shared `Order`.
- Modify `Api/ArcadeModels.cs`, `Api/ArcadeController.cs`: the new fields and `GET overview`.

**Arcade tests (`AT/`)**: modify `ArcadeStoreBoardTests.cs`, `ArcadeStoreSubmitTests.cs`,
`ArcadeControllerTests.cs`; create `ArcadeStoreOverviewTests.cs`.

**Arcade backoffice (`A/backoffice/src/`)**
- Modify `api/arcade-api.ts` (+ test): new fields, `getOverview`.
- Create `shared/phrases.ts` (+ test): `say`, ordinals, rule lines, units, the chase gap.
- Create `shared/windows.ts`: the host window manager's token, shared by the context and the hub.
- Modify `localization/en.ts`, `nl.ts`; create `localization/wording.test.ts`.
- Modify `games/game-manifest.ts` (+ test): optional `rule`.
- Create `pieces/constants.ts` (read by the pieces' tests), `pieces/look.ts`, `pieces/font.ts` (+ test),
  `pieces/theme.controller.ts` (+ test), `pieces/parts.ts` (+ test),
  `pieces/result.element.ts` (+ tests), `pieces/leaderboard.element.ts` (+ tests).
- Move `hub/harness.test-helper.ts` to `shared/harness.test-helper.ts` and extend it.
- Modify `context/arcade.context.ts` (+ tests); create `context/active-arcade.ts`,
  `context/beaten-toast.element.ts` (+ test); modify `context/privacy-modal.element.ts` (+ test).
- Rewrite `hub/hub.element.ts` (+ test); create `hub/overview.element.ts`, `hub/game-page.element.ts`
  (+ tests); rewrite `hub/profile.element.ts` (+ test); modify `hub/constants.ts`.
- Delete `hub/board.element.ts`, `hub/board.element.test.ts`, `hub/board.moderation.test.ts`,
  `hub/hub.switching.test.ts`, `hub/profile.validation.test.ts` (their cases move to the new tests).
- Modify `bundle.manifests.ts` (+ test): hub alias and size from `hub/constants.ts`.
- Modify `A/backoffice/vite.config.ts`, `A/package.json`: the font.

**Entertainment (`E/backoffice/src/`)**
- Modify `shared/arcade.ts` (+ test).
- Modify `minesweeper/minesweeper.element.ts`, `snake/snake.element.ts`,
  `solitaire/solitaire.element.ts`, `solitaire/settings-modal.element.ts` and their tests.
- Modify `bundle.manifests.ts` (Snake's board label, Solitaire's rule), `localization/en.ts`, `nl.ts`.

**Docs**: `A/docs/user/arcade.md` (rewrite), `A/docs/developer/putting-your-game-on-the-arcade.md`,
`E/docs/user/games.md`, `docs/developer/desktop-apps.md` §7.2, screenshots in `A/docs/screenshots/`,
and a "Notes from the build" section in the design doc.

---

# Phase A: The server's four reads

### Task 1: A board read counts its players and names the entry above you

**Files:**
- Modify: `A/Scores/ArcadeResults.cs` (the `BoardView` record)
- Modify: `A/Scores/ArcadeStore.cs` (`GetBoardAsync`)
- Test: `AT/ArcadeStoreBoardTests.cs`

Design §3, first two rows. "3rd of 12" needs the count; "3.0 s behind Bram" needs the entry above.
The count is everyone shown, plus the viewer when hidden: exactly the list `RankedAsync(db, definition,
viewer)` already builds.

- [ ] **Step 1: Write the failing tests.** Add to `ArcadeStoreBoardTests`:

```csharp
    /// <summary>"3rd of 12": the players shown, plus the viewer when their own scores are hidden (design §3).</summary>
    [Fact]
    public async Task Counts_the_players_shown_plus_a_hidden_viewer()
    {
        await PublicScore(Ada, "Ada", 300);
        await PublicScore(Grace, "Grace", 500);
        await _store.SubmitAsync(Linus, "Linus", Snake, 100);

        Assert.Equal(2, (await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board)).Players);
        Assert.Equal(3, (await _store.GetBoardAsync(Linus, Snake.Game, Snake.Board)).Players);
    }

    /// <summary>The entry directly above the viewer, for "3.0 s behind Bram", also when the viewer is outside the top ten.</summary>
    [Fact]
    public async Task Returns_the_entry_directly_above_the_viewer()
    {
        for (var i = 0; i < 12; i++)
        {
            await PublicScore(Guid.NewGuid(), $"P{i}", 1_000 + i);
        }
        await PublicScore(Ada, "Ada", 5);

        var board = await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board);

        Assert.NotNull(board.Above);
        Assert.Equal(12, board.Above!.Rank);
        Assert.Equal("P0", board.Above.DisplayName);
        Assert.Equal(1_000, board.Above.Value);
        Assert.False(board.Above.IsViewer);
    }

    /// <summary>Someone whose scores are hidden is never the one above: the viewer could not chase a row they cannot see.</summary>
    [Fact]
    public async Task A_hidden_player_is_never_the_entry_above()
    {
        await PublicScore(Grace, "Grace", 500);
        await PublicScore(Ada, "Ada", 300);
        await _store.SubmitAsync(Linus, "Linus", Snake, 400);

        var board = await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board);

        Assert.Equal("Grace", board.Above!.DisplayName);
        Assert.Equal(1, board.Above.Rank);
    }

    /// <summary>The leader has nobody above, and a viewer who has not played has no row to be above.</summary>
    [Fact]
    public async Task The_leader_and_a_viewer_who_has_not_played_have_nobody_above()
    {
        await PublicScore(Grace, "Grace", 500);

        Assert.Null((await _store.GetBoardAsync(Grace, Snake.Game, Snake.Board)).Above);
        Assert.Null((await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board)).Above);
    }
```

- [ ] **Step 2: Run, expect failure.** `dotnet test AT/Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.csproj`
  (full path as in the conventions). Expected: build error, `BoardView` has no `Players` or `Above`.

- [ ] **Step 3: Extend the record.** In `ArcadeResults.cs`, replace the `BoardView` record and its doc:

```csharp
/// <summary>A board as the hub shows it.</summary>
/// <param name="Definition">The board's rules, or null when nobody has played it.</param>
/// <param name="Top">The top public rows.</param>
/// <param name="Viewer">The viewer's own row, whether or not it is in <paramref name="Top"/> or public; null if they have not played.</param>
/// <param name="ViewerIsPublic">Whether the viewer is shown to others.</param>
/// <param name="Players">
/// How many players the board ranks for this viewer: everyone shown, plus the viewer when their own
/// scores are hidden. The "of 12" in "3rd of 12" (design §3).
/// </param>
/// <param name="Above">
/// The shown player directly above the viewer, or null when the viewer leads or has not played. Lets
/// a game say who to chase when the viewer is outside the top ten (design §3).
/// </param>
public sealed record BoardView(LeaderboardDefinition? Definition, IReadOnlyList<BoardEntry> Top, BoardEntry? Viewer, bool ViewerIsPublic, int Players = 0, BoardEntry? Above = null);
```

- [ ] **Step 4: Fill them in.** In `ArcadeStore.GetBoardAsync`, replace from `BoardEntry? mine = null;`
  to the `return`:

```csharp
            BoardEntry? mine = null;
            BoardEntry? above = null;
            var withViewer = await RankedAsync(db, definition, viewer);
            var index = withViewer.FindIndex(s => s.UserKey == viewer);
            if (index >= 0)
            {
                var score = withViewer[index];
                mine = new BoardEntry(index + 1, viewer, names[viewer], score.Value, score.AchievedAtUtc, true);
                if (index > 0)
                {
                    var next = withViewer[index - 1];
                    above = new BoardEntry(index, next.UserKey, names[next.UserKey], next.Value, next.AchievedAtUtc, false);
                }
            }

            return new BoardView(definition, top, mine, profile?.IsPublic ?? false, withViewer.Count, above);
```

- [ ] **Step 5: Run, expect pass.** Same command. All Arcade tests green.

### Task 2: A submit names the player it passed for first place

**Files:**
- Modify: `A/Scores/ArcadeResults.cs` (`SubmitResult`, new `PassedPlayer`)
- Modify: `A/Scores/ArcadeStore.cs` (`SubmitAsync`)
- Test: `AT/ArcadeStoreSubmitTests.cs`

Design §3, third row: "First place, past Bram's 450". Settled above (point 1): only a score that
moves the player to first from behind someone, as the player sees the board.

- [ ] **Step 1: Write the failing tests.** Add to `ArcadeStoreSubmitTests`:

```csharp
    /// <summary>Show a player's scores, so they rank for everyone.</summary>
    /// <param name="user">The player.</param>
    /// <param name="name">Their name.</param>
    private Task Show(Guid user, string name) => _store.UpdateProfileAsync(user, name, null, isPublic: true, notifyWhenBeaten: null);

    /// <summary>Taking first place names who was there and their score, for "past Grace's 500" (design §3).</summary>
    [Fact]
    public async Task Taking_first_place_names_who_was_passed()
    {
        await Show(Grace, "Grace");
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        await Show(Ada, "Ada");

        var result = await _store.SubmitAsync(Ada, "Ada", Snake, 600);

        Assert.Equal(new PassedPlayer("Grace", 500), result.Passed);
    }

    /// <summary>A leader beating their own best passed nobody.</summary>
    [Fact]
    public async Task A_leader_improving_passes_nobody()
    {
        await Show(Grace, "Grace");
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        await Show(Ada, "Ada");
        await _store.SubmitAsync(Ada, "Ada", Snake, 600);

        Assert.Null((await _store.SubmitAsync(Ada, "Ada", Snake, 700)).Passed);
    }

    /// <summary>A best that stays below first, and a score that is no best, pass nobody.</summary>
    [Fact]
    public async Task Below_first_or_not_a_best_passes_nobody()
    {
        await Show(Grace, "Grace");
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        await Show(Ada, "Ada");

        Assert.Null((await _store.SubmitAsync(Ada, "Ada", Snake, 300)).Passed);
        Assert.Null((await _store.SubmitAsync(Ada, "Ada", Snake, 200)).Passed);
    }

    /// <summary>A player whose scores are hidden still sees the board with themselves on it, so their would-be first place names who they passed.</summary>
    [Fact]
    public async Task A_hidden_player_taking_would_be_first_names_who_they_passed()
    {
        await Show(Grace, "Grace");
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);

        var result = await _store.SubmitAsync(Ada, "Ada", Snake, 600);

        Assert.False(result.IsPublic);
        Assert.Equal(new PassedPlayer("Grace", 500), result.Passed);
    }

    /// <summary>A hidden player already ahead of the shown leader passed nobody new by improving.</summary>
    [Fact]
    public async Task A_hidden_player_already_ahead_passes_nobody()
    {
        await Show(Grace, "Grace");
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        await _store.SubmitAsync(Ada, "Ada", Snake, 600);

        Assert.Null((await _store.SubmitAsync(Ada, "Ada", Snake, 700)).Passed);
    }
```

- [ ] **Step 2: Run, expect failure.** Build error: `PassedPlayer` and `SubmitResult.Passed` do not exist.

- [ ] **Step 3: Add the record and the field.** In `ArcadeResults.cs`, replace the `SubmitResult`
  record's docs and declaration (keep `Refused`), and add `PassedPlayer` below it:

```csharp
/// <summary>What a submit tells the game, and through it the player.</summary>
/// <param name="Status">How it went.</param>
/// <param name="IsPersonalBest">Whether it replaced the player's best.</param>
/// <param name="PreviousBest">The best it replaced, or null for a first score.</param>
/// <param name="Rank">The player's rank on the board, counting public players and themselves; their would-be rank when private.</param>
/// <param name="IsPublic">Whether the player is shown on the boards.</param>
/// <param name="AskedAboutPublic">Whether the player has answered the one-time question (D7).</param>
/// <param name="DisplayName">The player's display name, for prefilling that question.</param>
/// <param name="Passed">
/// Who this score took first place from, as the player sees the board; null unless the score moved
/// the player to first from behind someone. "First place, past Bram's 450" (design §3).
/// </param>
public sealed record SubmitResult(SubmitStatus Status, bool IsPersonalBest, long? PreviousBest, int Rank, bool IsPublic, bool AskedAboutPublic, string DisplayName, PassedPlayer? Passed = null)
```

```csharp
/// <summary>The player a score passed for first place.</summary>
/// <param name="DisplayName">Their board name.</param>
/// <param name="Value">Their best, which the new score beat.</param>
public sealed record PassedPlayer(string DisplayName, long Value);
```

- [ ] **Step 4: Work it out in the submit.** In `ArcadeStore.SubmitAsync`:

  After `var leaderBefore = await LeaderAsync(db, definition);` add:

```csharp
            // Who led as the player saw the board before this score, their own hidden score included.
            // `leaderBefore` is the public leader, which is what the beaten notification needs; "passed"
            // is about the player's own view, so a hidden player already ahead passes nobody new.
            var leaderAsSeen = (await RankedAsync(db, definition, userKey)).FirstOrDefault()?.UserKey;
```

  Replace the last two lines of the lambda (`var rank = ...` and the `return`) with:

```csharp
            var rank = ranked.FindIndex(s => s.UserKey == userKey) + 1;
            PassedPlayer? passed = null;
            if (isBest && rank == 1 && leaderAsSeen is { } passedKey && passedKey != userKey)
            {
                var passedProfile = await db.Profiles.FindAsync(passedKey);
                var passedScore = ranked.Single(s => s.UserKey == passedKey);
                passed = new PassedPlayer(passedProfile!.DisplayName, passedScore.Value);
            }

            return new SubmitResult(SubmitStatus.Accepted, isBest, previous, rank, profile.IsPublic, profile.AskedAboutPublic, profile.DisplayName, passed);
```

  `ranked.Single` holds because the passed player was shown a moment ago and is still shown; if a
  test proves a race can drop them, fall back to `null` rather than throwing.

- [ ] **Step 5: Run, expect pass.** All Arcade tests green, including round one's submit tests.

### Task 3: One overview read for the hub

**Files:**
- Modify: `A/Scores/ArcadeResults.cs` (new `BoardSummary`, `ArcadeOverview`)
- Modify: `A/Scores/ArcadeStore.cs` (new `GetOverviewAsync`, shared `Order`)
- Create: `AT/ArcadeStoreOverviewTests.cs`

Design §3, fourth row: per board the viewer's entry, the leader, the next player and the count, plus
the number of distinct players, in one call. It returns every board the server knows; the hub drops
boards of games that are not installed (Task 16), as round one already does.

- [ ] **Step 1: Write the failing tests.** Create `AT/ArcadeStoreOverviewTests.cs`:

```csharp
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;
using static Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.ArcadeStoreSubmitTests;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>The hub's overview: every board in one read, as the viewer sees each (design §3).</summary>
public class ArcadeStoreOverviewTests : IAsyncLifetime
{
    /// <summary>A third player.</summary>
    private static readonly Guid Linus = Guid.Parse("00000000-0000-0000-0000-00000000000c");

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>Who is hidden.</summary>
    private readonly FakeUserDirectory _users = new();

    /// <summary>The clock, advanced between scores so ties are ordered.</summary>
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 10, 3, 9, 0, 0, TimeSpan.Zero));

    /// <summary>The store under test.</summary>
    private ArcadeStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new ArcadeStore(_database, _users, _clock);
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>Submit as a player whose scores are shown.</summary>
    /// <param name="user">The player.</param>
    /// <param name="name">Their name.</param>
    /// <param name="board">The board.</param>
    /// <param name="value">The score.</param>
    private async Task Shown(Guid user, string name, LeaderboardDefinition board, long value)
    {
        await _store.UpdateProfileAsync(user, name, null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(user, name, board, value);
        _clock.Advance(TimeSpan.FromSeconds(1));
    }

    /// <summary>One board's summary from an overview.</summary>
    /// <param name="overview">The overview.</param>
    /// <param name="board">The board.</param>
    /// <returns>Its summary.</returns>
    private static BoardSummary Of(ArcadeOverview overview, LeaderboardDefinition board) =>
        overview.Boards.Single(b => b.Game == board.Game && b.Board == board.Board);

    /// <summary>Each board says where the viewer stands, who leads, who is second, and how many rank.</summary>
    [Fact]
    public async Task Summarises_each_board_for_the_viewer()
    {
        await Shown(Grace, "Grace", Snake, 500);
        await Shown(Ada, "Ada", Snake, 300);

        var snake = Of(await _store.GetOverviewAsync(Ada), Snake);

        Assert.Equal(2, snake.Players);
        Assert.Equal(2, snake.Viewer!.Rank);
        Assert.True(snake.Viewer.IsViewer);
        Assert.Equal("Grace", snake.Leader!.DisplayName);
        Assert.Equal("Ada", snake.Next!.DisplayName);
    }

    /// <summary>A hidden viewer is on their own boards, with their would-be rank; others do not see them.</summary>
    [Fact]
    public async Task A_hidden_viewer_ranks_on_their_own_overview_only()
    {
        await Shown(Grace, "Grace", Snake, 500);
        await _store.SubmitAsync(Linus, "Linus", Snake, 900);

        var mine = Of(await _store.GetOverviewAsync(Linus), Snake);
        var theirs = Of(await _store.GetOverviewAsync(Grace), Snake);

        Assert.Equal(1, mine.Viewer!.Rank);
        Assert.Equal("Grace", mine.Next!.DisplayName);
        Assert.Equal(2, mine.Players);
        Assert.Equal(1, theirs.Players);
        Assert.Equal("Grace", theirs.Leader!.DisplayName);
    }

    /// <summary>A board the viewer never played still shows its leader: "Not played yet" next to the crown.</summary>
    [Fact]
    public async Task A_board_the_viewer_never_played_still_has_its_leader()
    {
        await Shown(Grace, "Grace", Easy, 9_400);

        var easy = Of(await _store.GetOverviewAsync(Ada), Easy);

        Assert.Null(easy.Viewer);
        Assert.Equal("Grace", easy.Leader!.DisplayName);
        Assert.Null(easy.Next);
    }

    /// <summary>Times rank lower first, as on the board itself.</summary>
    [Fact]
    public async Task Ranks_a_lower_wins_board_the_right_way_round()
    {
        await Shown(Grace, "Grace", Easy, 9_400);
        await Shown(Ada, "Ada", Easy, 8_100);

        Assert.Equal("Ada", Of(await _store.GetOverviewAsync(Grace), Easy).Leader!.DisplayName);
    }

    /// <summary>Colleagues count once however many boards they are on, never the viewer, never the hidden.</summary>
    [Fact]
    public async Task Counts_colleagues_once_without_the_viewer_or_the_hidden()
    {
        await Shown(Grace, "Grace", Snake, 500);
        await Shown(Grace, "Grace", Easy, 9_400);
        await Shown(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Linus, "Linus", Snake, 100);

        Assert.Equal(1, (await _store.GetOverviewAsync(Ada)).Colleagues);
        Assert.Equal(2, (await _store.GetOverviewAsync(Linus)).Colleagues);
    }

    /// <summary>Disabled or locked players drop off the overview as they do off the boards (round one §6).</summary>
    [Fact]
    public async Task Leaves_disabled_players_off()
    {
        await Shown(Grace, "Grace", Snake, 500);
        _users.Hidden.Add(Grace);

        var overview = await _store.GetOverviewAsync(Ada);

        Assert.Equal(0, overview.Colleagues);
        Assert.Null(Of(overview, Snake).Leader);
        Assert.Equal(0, Of(overview, Snake).Players);
    }

    /// <summary>With nothing played there is nothing to summarise, rather than a failure.</summary>
    [Fact]
    public async Task An_empty_arcade_has_an_empty_overview()
    {
        var overview = await _store.GetOverviewAsync(Ada);

        Assert.Empty(overview.Boards);
        Assert.Equal(0, overview.Colleagues);
    }
}
```

- [ ] **Step 2: Run, expect failure.** Build error: `GetOverviewAsync`, `ArcadeOverview`, `BoardSummary` missing.

- [ ] **Step 3: Add the records** to `ArcadeResults.cs`:

```csharp
/// <summary>One board on the hub's overview, as one viewer sees it.</summary>
/// <param name="Game">The game's manifest alias.</param>
/// <param name="Board">The board's alias.</param>
/// <param name="Players">How many rank on it for this viewer, as <see cref="BoardView.Players"/>.</param>
/// <param name="Viewer">The viewer's row, or null if they have not played it.</param>
/// <param name="Leader">First place, or null when nobody ranks.</param>
/// <param name="Next">Second place, which the hub shows as "Next" when the viewer leads; null with fewer than two.</param>
public sealed record BoardSummary(string Game, string Board, int Players, BoardEntry? Viewer, BoardEntry? Leader, BoardEntry? Next);

/// <summary>Everything the hub's overview shows, in one read (design §3).</summary>
/// <param name="Colleagues">Distinct players shown on any board, not counting the viewer.</param>
/// <param name="Boards">Every board the Arcade knows; the hub keeps those of installed games.</param>
public sealed record ArcadeOverview(int Colleagues, IReadOnlyList<BoardSummary> Boards);
```

- [ ] **Step 4: Share the ordering, then read the overview.** In `ArcadeStore.cs`, replace the last two
  lines of `RankedAsync` (`var ordered = ...` and its `return`) with `return Order(visible, definition.Better);`
  and add, below `RankedAsync`:

```csharp
    /// <summary>
    /// Scores in rank order: by value the board's way round, then earliest first (D8). One method so the
    /// boards and the overview can never rank the same scores differently.
    /// </summary>
    /// <param name="scores">The scores to rank.</param>
    /// <param name="better"><c>higher</c> or <c>lower</c>.</param>
    /// <returns>The ranked scores.</returns>
    private static List<ArcadeScoreEntity> Order(IEnumerable<ArcadeScoreEntity> scores, string better) =>
        (better == "lower" ? scores.OrderBy(s => s.Value) : scores.OrderByDescending(s => s.Value))
            .ThenBy(s => s.AchievedAtUtc)
            .ToList();
```

  Then add the read, after `GetBoardAsync`:

```csharp
    /// <summary>
    /// Every board as one viewer sees it, for the hub's overview: one read instead of one per board
    /// (design §3). Shown players count, plus the viewer on their own boards whatever their settings,
    /// by the same rule as <see cref="GetBoardAsync"/>.
    /// </summary>
    /// <param name="viewer">Who is looking.</param>
    /// <returns>The overview.</returns>
    public Task<ArcadeOverview> GetOverviewAsync(Guid viewer) =>
        database.RunAsync(async db =>
        {
            var boards = await db.Leaderboards.OrderBy(l => l.Game).ThenBy(l => l.Board).ToListAsync();
            var rows = await db.Scores
                .Join(db.Profiles, s => s.UserKey, p => p.UserKey, (s, p) => new { Score = s, p.IsPublic, p.DisplayName })
                .ToListAsync();
            var hidden = await users.GetHiddenAsync(rows.Select(r => r.Score.UserKey).Distinct().ToArray());
            var shown = rows.Where(r => r.Score.UserKey == viewer || (r.IsPublic && !hidden.Contains(r.Score.UserKey))).ToList();
            var names = shown.DistinctBy(r => r.Score.UserKey).ToDictionary(r => r.Score.UserKey, r => r.DisplayName);

            var summaries = boards.Select(board =>
            {
                var ranked = Order(shown.Where(r => r.Score.Game == board.Game && r.Score.Board == board.Board).Select(r => r.Score), board.Better);
                BoardEntry Entry(int index) =>
                    new(index + 1, ranked[index].UserKey, names[ranked[index].UserKey], ranked[index].Value, ranked[index].AchievedAtUtc, ranked[index].UserKey == viewer);
                var mine = ranked.FindIndex(s => s.UserKey == viewer);
                return new BoardSummary(
                    board.Game,
                    board.Board,
                    ranked.Count,
                    mine >= 0 ? Entry(mine) : null,
                    ranked.Count > 0 ? Entry(0) : null,
                    ranked.Count > 1 ? Entry(1) : null);
            }).ToList();

            var colleagues = shown.Select(r => r.Score.UserKey).Where(key => key != viewer).Distinct().Count();
            return new ArcadeOverview(colleagues, summaries);
        });
```

  `An_empty_arcade_has_an_empty_overview` passes because no board row exists before a first submit.

- [ ] **Step 5: Run, expect pass.** All Arcade tests green.

### Task 4: The API carries the new fields and serves the overview

**Files:**
- Modify: `A/Api/ArcadeModels.cs`, `A/Api/ArcadeController.cs`
- Test: `AT/ArcadeControllerTests.cs`

- [ ] **Step 1: Write the failing tests.** In `ArcadeControllerTests`:

  In `Forbids_users_without_the_desktop_section`, add
  `Assert.IsType<ForbidResult>(await outsider.GetOverview());`. Then add:

```csharp
    /// <summary>The overview reaches the browser with the viewer's standing per board.</summary>
    [Fact]
    public async Task Serves_the_overview()
    {
        var player = As(Guid.NewGuid(), "Ada", ArcadeController.DesktopSectionAlias);
        await player.SubmitScore(SnakeScore);

        var overview = Assert.IsType<OverviewResponseModel>(Assert.IsType<OkObjectResult>(await player.GetOverview()).Value);

        var snake = Assert.Single(overview.Boards);
        Assert.Equal("Pkg.Snake.Game", snake.Game);
        Assert.Equal(1, snake.Viewer!.Rank);
        Assert.Equal(1, snake.Players);
        Assert.Equal(0, overview.Colleagues);
    }

    /// <summary>A board read carries the player count and the entry above; a submit carries who was passed.</summary>
    [Fact]
    public async Task Boards_and_submits_carry_the_new_fields()
    {
        var grace = As(Guid.NewGuid(), "Grace", ArcadeController.DesktopSectionAlias);
        var ada = As(Guid.NewGuid(), "Ada", ArcadeController.DesktopSectionAlias);
        await grace.UpdateProfile(new UpdateProfileRequestModel(null, true, null));
        await grace.SubmitScore(SnakeScore with { Value = 500 });
        await ada.UpdateProfile(new UpdateProfileRequestModel(null, true, null));

        var below = Assert.IsType<SubmitScoreResponseModel>(Assert.IsType<OkObjectResult>(await ada.SubmitScore(SnakeScore with { Value = 300 })).Value);
        var board = Assert.IsType<BoardResponseModel>(Assert.IsType<OkObjectResult>(await ada.GetBoard("Pkg.Snake.Game", "default")).Value);
        var past = Assert.IsType<SubmitScoreResponseModel>(Assert.IsType<OkObjectResult>(await ada.SubmitScore(SnakeScore with { Value = 600 })).Value);

        Assert.Null(below.Passed);
        Assert.Equal(2, board.Players);
        Assert.Equal("Grace", board.Above!.DisplayName);
        Assert.Equal(new PassedPlayerModel("Grace", 500), past.Passed);
    }
```

- [ ] **Step 2: Run, expect failure.** Build errors: `GetOverview`, `OverviewResponseModel`, `PassedPlayerModel`.

- [ ] **Step 3: Models.** In `ArcadeModels.cs`:

  Replace `SubmitScoreResponseModel` (docs and declaration) with:

```csharp
/// <summary>What a submit answers.</summary>
/// <param name="IsPersonalBest">Whether it replaced the player's best.</param>
/// <param name="PreviousBest">The best it replaced.</param>
/// <param name="Rank">Rank, or would-be rank when private.</param>
/// <param name="IsPublic">Whether the player is shown.</param>
/// <param name="AskedAboutPublic">Whether the one-time question has been answered.</param>
/// <param name="DisplayName">The player's display name, to prefill that question.</param>
/// <param name="Passed">Who the score took first place from, or null.</param>
public sealed record SubmitScoreResponseModel(bool IsPersonalBest, long? PreviousBest, int Rank, bool IsPublic, bool AskedAboutPublic, string DisplayName, PassedPlayerModel? Passed);

/// <summary>The player a score passed for first place.</summary>
/// <param name="DisplayName">Their name.</param>
/// <param name="Value">Their best.</param>
public sealed record PassedPlayerModel(string DisplayName, long Value)
{
    /// <summary>From the store's record.</summary>
    /// <param name="passed">The record, or null.</param>
    /// <returns>The model, or null.</returns>
    public static PassedPlayerModel? From(PassedPlayer? passed) => passed is null ? null : new(passed.DisplayName, passed.Value);
}
```

  Replace `BoardResponseModel` with:

```csharp
/// <summary>A board for the caller.</summary>
/// <param name="Played">Whether anybody has played it.</param>
/// <param name="Top">The top public rows.</param>
/// <param name="Viewer">The caller's own row, if they have played.</param>
/// <param name="ViewerIsPublic">Whether the caller is shown.</param>
/// <param name="CanModerate">Whether the caller may remove rows and reset the board.</param>
/// <param name="Players">How many rank on it for the caller.</param>
/// <param name="Above">The shown player directly above the caller, or null.</param>
public sealed record BoardResponseModel(bool Played, IReadOnlyList<BoardEntryModel> Top, BoardEntryModel? Viewer, bool ViewerIsPublic, bool CanModerate, int Players, BoardEntryModel? Above);
```

  Add at the end:

```csharp
/// <summary>One board on the overview.</summary>
/// <param name="Game">The game's manifest alias.</param>
/// <param name="Board">The board's alias.</param>
/// <param name="Players">How many rank on it for the caller.</param>
/// <param name="Viewer">The caller's row, or null.</param>
/// <param name="Leader">First place, or null.</param>
/// <param name="Next">Second place, or null.</param>
public sealed record BoardSummaryModel(string Game, string Board, int Players, BoardEntryModel? Viewer, BoardEntryModel? Leader, BoardEntryModel? Next)
{
    /// <summary>From the store's record.</summary>
    /// <param name="summary">The record.</param>
    /// <returns>The model.</returns>
    public static BoardSummaryModel From(BoardSummary summary) => new(
        summary.Game,
        summary.Board,
        summary.Players,
        summary.Viewer is null ? null : BoardEntryModel.From(summary.Viewer),
        summary.Leader is null ? null : BoardEntryModel.From(summary.Leader),
        summary.Next is null ? null : BoardEntryModel.From(summary.Next));
}

/// <summary>The hub's overview.</summary>
/// <param name="Colleagues">Distinct players shown on any board, not counting the caller.</param>
/// <param name="Boards">Every board the Arcade knows.</param>
public sealed record OverviewResponseModel(int Colleagues, IReadOnlyList<BoardSummaryModel> Boards);
```

- [ ] **Step 4: Controller.** In `SubmitScore`, change the `Accepted` arm's model to add
  `PassedPlayerModel.From(result.Passed)` as the last argument. In `GetBoard`, add the last two
  arguments `view.Players,` and `view.Above is null ? null : BoardEntryModel.From(view.Above)`. Add the
  action after `GetBoard`:

```csharp
    /// <summary>Every board as the caller sees it, for the hub's overview.</summary>
    /// <returns>The overview.</returns>
    [HttpGet("overview")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(OverviewResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetOverview()
    {
        if (Caller() is not { } user)
        {
            return Forbid();
        }

        var overview = await store.GetOverviewAsync(user.Key);
        return Ok(new OverviewResponseModel(overview.Colleagues, overview.Boards.Select(BoardSummaryModel.From).ToArray()));
    }
```

- [ ] **Step 5: Run, expect pass.** All Arcade tests green. Then `dotnet build` the Arcade project
  (`A/Umbraco.Community.UmbraDesktop.Services.Arcade.csproj`): warnings are errors and every new
  member needs its XML docs.

---

# Phase B: The Arcade front end's foundations

### Task 5: The API client reads the new fields and the overview

**Files:**
- Modify: `A/backoffice/src/api/arcade-api.ts`
- Test: `A/backoffice/src/api/arcade-api.test.ts`

- [ ] **Step 1: Write the failing tests.** In `arcade-api.test.ts`, change the `submit accepted`
  block's answer and expectation to carry `passed`, and add an `overview` block:

```ts
describe('submit accepted', () => {
  answers('post', async () => ({ data: { isPersonalBest: true, previousBest: null, rank: 1, isPublic: false, askedAboutPublic: false, displayName: 'Ada', passed: { displayName: 'Grace', value: 500 } } }));
  it('reads an accepted score, with who it passed', async () => {
    const result = await createArcadeApi().submit('Pkg.Snake.Game', board, 600);
    expect(result).to.deep.equal({ status: 'accepted', isPersonalBest: true, previousBest: null, rank: 1, isPublic: false, askedAboutPublic: false, displayName: 'Ada', passed: { displayName: 'Grace', value: 500 } });
  });
});

describe('overview', () => {
  const overview = {
    colleagues: 3,
    boards: [{ game: 'Pkg.Snake.Game', board: 'default', players: 4, viewer: null, leader: { rank: 1, userKey: 'k1', displayName: 'Grace', value: 500, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer: false }, next: null }],
  };
  answers('get', async () => ({ data: overview }));
  it('reads the overview', async () => {
    expect(await createArcadeApi().getOverview()).to.deep.equal(overview);
  });
});
```

- [ ] **Step 2: Run, expect failure.** From `A/backoffice`:
  `npx web-test-runner "src/api/arcade-api.test.ts" --node-resolve`. Expected: `getOverview is not a function`.

- [ ] **Step 3: Types and the call.** In `arcade-api.ts`:

  Add before `ArcadeSubmitResult`:

```ts
/** Who a score took first place from (design §3): "First place, past Bram's 450". */
export interface ArcadePassed {
  /** Their board name. */
  displayName: string;
  /** Their best, which the score beat. */
  value: number;
}
```

  In the `accepted` arm of `ArcadeSubmitResult`, add `passed: ArcadePassed | null` after `displayName: string`.

  In `ArcadeBoard`, add after `canModerate`:

```ts
  /** How many rank on it for the viewer: everyone shown, plus the viewer when hidden. "3rd of 12". */
  players: number;
  /** The shown player directly above the viewer, or null when they lead or have not played. */
  above: ArcadeBoardEntry | null;
```

  Add after `ArcadeBoard`:

```ts
/** One board on the hub's overview. */
export interface ArcadeBoardSummary {
  /** The game's manifest alias. */
  game: string;
  /** The board's alias. */
  board: string;
  /** How many rank on it for the viewer. */
  players: number;
  /** The viewer's row, or null if they have not played it. */
  viewer: ArcadeBoardEntry | null;
  /** First place, or null when nobody ranks. */
  leader: ArcadeBoardEntry | null;
  /** Second place, shown as "Next" when the viewer leads. */
  next: ArcadeBoardEntry | null;
}

/** The hub's overview, in one read. */
export interface ArcadeOverview {
  /** Colleagues shown on any board, not counting the viewer. */
  colleagues: number;
  /** Every board the server knows; the hub keeps those of installed games. */
  boards: ArcadeBoardSummary[];
}
```

  In `ArcadeApi`, after `getBoard`:

```ts
  /** Every board as the caller sees it, for the hub's overview. */
  getOverview(): Promise<ArcadeOverview | undefined>;
```

  In `createArcadeApi`, after `getBoard`:

```ts
    async getOverview() {
      return (await attempt<ArcadeOverview>(() => umbHttpClient.get({ url: `${BASE}/overview`, security: [...SECURITY] }))).data;
    },
```

- [ ] **Step 4: Keep the fakes compiling.** `tsc` checks test files too. Add `passed: null` to the
  `accepted()` helper in `context/arcade.context.test.ts`, add
  `getOverview: async () => ({ colleagues: 0, boards: [] }),` to its `fakeApi`, and add
  `players: 0, above: null` (or the right count) to every `ArcadeBoard` literal in the tests:
  `grep -rn "viewerIsPublic:" A/backoffice/src --include=*.test.ts` lists them.

- [ ] **Step 5: Run, expect pass.** `npm test` and `npm run build` from `A`. Both green.

### Task 6: Phrases, and a rule on the game manifest

**Files:**
- Create: `A/backoffice/src/shared/phrases.ts`
- Test: `A/backoffice/src/shared/phrases.test.ts`
- Modify: `A/backoffice/src/games/game-manifest.ts`
- Test: `A/backoffice/src/games/game-manifest.test.ts`

Everything the pieces and the hub say about a rank, a rule, a unit or a gap, in one place, so the
card, the panel, the hub and the toast cannot word the same thing differently.

- [ ] **Step 1: Write the failing tests.** Create `phrases.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { chaseText, fill, ordinalCategory, rankText, ruleText, say, scoreText, unitText } from './phrases.js';

/** A localizer with no dictionary, so every phrase falls back to its English, as when the dictionary fails to load. */
const english = { termOrDefault: (_key: string, fallback: string) => fallback, lang: () => 'en-US', string: (text: string) => text } as never;

it('fills numbered placeholders and leaves unknown ones', () => {
  expect(fill('{0} behind {1}', ['3.0 sec', 'Bram'])).to.equal('3.0 sec behind Bram');
  expect(fill('{0} and {2}', ['a'])).to.equal('a and {2}');
});

it('says the English with its placeholders filled when the dictionary has no entry', () => {
  expect(say(english, 'chase', '{0} behind {1}', '3.0 sec', 'Bram')).to.equal('3.0 sec behind Bram');
});

it('words English ranks as ordinals', () => {
  const ranks = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map((rank) => rankText(english, rank));
  expect(ranks).to.deep.equal(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st']);
});

it('puts every Dutch rank in one ordinal category, which nl.ts words as "{0}e"', () => {
  expect([1, 2, 3, 8].map((rank) => ordinalCategory(rank, 'nl-NL'))).to.deep.equal(['other', 'other', 'other', 'other']);
});

it('derives the rule from a board, and lets a game say its own', () => {
  expect(ruleText(english, { better: 'lower', format: 'time' })).to.equal('Fastest time wins');
  expect(ruleText(english, { better: 'higher', format: 'points' })).to.equal('Highest score wins');
  expect(ruleText(english, { better: 'lower', format: 'points' })).to.equal('Lowest score wins');
  expect(ruleText(english, { better: 'higher', format: 'time' })).to.equal('Longest time wins');
  expect(ruleText(english, { better: 'higher', format: 'points' }, 'Highest score wins, time bonus included')).to.equal('Highest score wins, time bonus included');
});

it('gives seconds a unit, m:ss none, and points their word', () => {
  expect(unitText(english, 'time', 38_100)).to.equal('sec');
  expect(unitText(english, 'time', 61_000)).to.equal('');
  expect(unitText(english, 'points', 480)).to.equal('points');
  expect(scoreText(english, 'time', 3_000)).to.equal('3.0 sec');
  expect(scoreText(english, 'points', 1_520)).to.equal('1,520 points');
});

it('names the person to chase and by how much', () => {
  expect(chaseText(english, 'time', 38_100, { displayName: 'Bram', value: 35_100 })).to.equal('3.0 sec behind Bram');
  expect(chaseText(english, 'points', 310, { displayName: 'Bram', value: 450 })).to.equal('140 points behind Bram');
});
```

  In `game-manifest.test.ts`, add:

```ts
it('reads a game\'s own rule, and ignores one that is not text', () => {
  const base = { type: 'umbraDesktopGame', meta: { app: 'Pkg.App', label: 'Game', leaderboards: [{ alias: 'default', label: 'Game', better: 'higher', format: 'points' }] } };
  const { games } = normaliseGames([
    { ...base, alias: 'Pkg.Ruled', meta: { ...base.meta, rule: '#pkg_rule' } },
    { ...base, alias: 'Pkg.Odd', meta: { ...base.meta, rule: 42 } },
  ]);
  expect(games.find((g) => g.alias === 'Pkg.Ruled')?.rule).to.equal('#pkg_rule');
  expect(games.find((g) => g.alias === 'Pkg.Odd')?.rule).to.equal(undefined);
});
```

  (Import `normaliseGames` the way that test file already does.)

- [ ] **Step 2: Run, expect failure.** Both files: cannot resolve `./phrases.js`; `rule` undefined.

- [ ] **Step 3: Write `phrases.ts`.**

```ts
import type { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import type { UmbraDesktopGameLeaderboard } from '../games/game-manifest.js';
import { AREA } from './area.js';
import { formatScore } from './format.js';

/**
 * Everything the Arcade says about a rank, a rule, a unit or a gap, in one module, so the result
 * card, the panel, the hub and the toasts cannot word the same thing two ways.
 *
 * Each function takes the caller's localizer (an element's `this.localize`, or the context's own) so
 * the words follow the backoffice language, and each falls back to English when the dictionary is
 * missing, as every Arcade string does.
 */

/** The part of Umbraco's localization controller the phrases use. */
export type Localize = Pick<UmbLocalizationController, 'termOrDefault' | 'lang' | 'string'>;

/**
 * Fill `{0}`, `{1}` and so on, the way Umbraco fills a dictionary term. Needed for the fallback:
 * `termOrDefault` returns its default untouched when the key is missing (17.7.0,
 * `localization.controller.js`), so a fallback with placeholders would show them raw.
 * @param template The text with placeholders.
 * @param args The values, by position.
 * @returns The filled text; a placeholder without a value stays as it is.
 */
export function fill(template: string, args: ReadonlyArray<unknown>): string {
  return template.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = args[Number(index)];
    return value === undefined ? match : String(value);
  });
}

/**
 * One of the Arcade's sentences: the dictionary's when it has the key, otherwise the English given
 * here, filled in either case.
 * @param localize The localizer.
 * @param key The key within the `umbraDesktopArcade` area.
 * @param english The English, with `{0}` placeholders.
 * @param args The values.
 * @returns The sentence.
 */
export function say(localize: Localize, key: string, english: string, ...args: unknown[]): string {
  return localize.termOrDefault(`${AREA}_${key}`, fill(english, args), ...(args as never[]));
}

/** The plural categories an ordinal can fall in, as `Intl.PluralRules` names them. */
export type OrdinalCategory = 'one' | 'two' | 'few' | 'other';

/**
 * Which ordinal form a rank takes in a language: English has four (1st, 2nd, 3rd, 4th), Dutch one (3e).
 * @param rank The rank.
 * @param lang A BCP 47 language tag, such as the backoffice's.
 * @returns The category, `other` for anything the language does not distinguish or cannot be read.
 */
export function ordinalCategory(rank: number, lang: string): OrdinalCategory {
  let category: string;
  try {
    category = new Intl.PluralRules(lang, { type: 'ordinal' }).select(rank);
  } catch {
    category = 'other';
  }
  return category === 'one' || category === 'two' || category === 'few' ? category : 'other';
}

/** The dictionary key and English form per ordinal category. */
const ORDINALS: Record<OrdinalCategory, { key: string; english: string }> = {
  one: { key: 'ordinalOne', english: '{0}st' },
  two: { key: 'ordinalTwo', english: '{0}nd' },
  few: { key: 'ordinalFew', english: '{0}rd' },
  other: { key: 'ordinalOther', english: '{0}th' },
};

/**
 * A rank in words: "3rd", "3e".
 * @param localize The localizer.
 * @param rank The rank, from 1.
 * @returns The ordinal.
 */
export function rankText(localize: Localize, rank: number): string {
  const { key, english } = ORDINALS[ordinalCategory(rank, localize.lang())];
  return say(localize, key, english, rank);
}

/** The rule per board shape: which key and which English. */
const RULES: Record<string, { key: string; english: string }> = {
  'lower:time': { key: 'ruleFastest', english: 'Fastest time wins' },
  'higher:points': { key: 'ruleHighest', english: 'Highest score wins' },
  'lower:points': { key: 'ruleLowest', english: 'Lowest score wins' },
  'higher:time': { key: 'ruleLongest', english: 'Longest time wins' },
};

/**
 * How to win on a board: the game's own rule when its manifest has one, otherwise derived from the
 * board's `better` and `format`.
 * @param localize The localizer.
 * @param board The board's shape.
 * @param gameRule The game manifest's `rule`: a `#` key or a literal.
 * @returns The rule.
 */
export function ruleText(localize: Localize, board: Pick<UmbraDesktopGameLeaderboard, 'better' | 'format'>, gameRule?: string): string {
  if (gameRule) return localize.string(gameRule);
  const { key, english } = RULES[`${board.better}:${board.format}`];
  return say(localize, key, english);
}

/**
 * The unit after a number: seconds under a minute, nothing for m:ss (which says it), points for points.
 * @param localize The localizer.
 * @param format The board's format.
 * @param value The value: points, or milliseconds.
 * @returns The unit, or an empty string.
 */
export function unitText(localize: Localize, format: 'points' | 'time', value: number): string {
  if (format === 'points') return say(localize, 'unitPoints', 'points');
  return value < 60_000 ? say(localize, 'unitSeconds', 'sec') : '';
}

/**
 * A value with its unit, for a sentence: "3.0 sec", "1,520 points", "1:02".
 * @param localize The localizer.
 * @param format The board's format.
 * @param value The value.
 * @returns The text.
 */
export function scoreText(localize: Localize, format: 'points' | 'time', value: number): string {
  const unit = unitText(localize, format, value);
  const number = formatScore(format, value, localize.lang());
  return unit ? `${number} ${unit}` : number;
}

/**
 * Who to chase and by how much: "3.0 sec behind Bram" (design P10).
 * @param localize The localizer.
 * @param format The board's format.
 * @param mine The player's best.
 * @param above The player directly above.
 * @returns The sentence.
 */
export function chaseText(localize: Localize, format: 'points' | 'time', mine: number, above: { displayName: string; value: number }): string {
  return say(localize, 'chase', '{0} behind {1}', scoreText(localize, format, Math.abs(mine - above.value)), above.displayName);
}
```

  If `tsc` rejects the `termOrDefault` call's key or spread, cast the way the context's existing
  calls compile (`as never` on the key); do not change the behaviour.

- [ ] **Step 4: The manifest's rule.** In `game-manifest.ts`:
  - In `MetaUmbraDesktopGame`, after `icon`:
    ```ts
      /**
       * How to win, as the hub and the panel say it: a `#` key or a literal. Optional: without it the
       * Arcade derives one per board ("Fastest time wins"). For a game whose number hides something,
       * such as Solitaire's time bonus.
       */
      rule?: string;
    ```
  - In `ArcadeGame`, after `icon`: `/** Its own rule, if the manifest has one. */ rule?: string;`
  - In `normaliseGames`, in the pushed object after `icon`: `rule: isText(meta.rule) ? meta.rule : undefined,`

- [ ] **Step 5: Run, expect pass.** Both files, then `npm test` and `npm run build` from `A`.

### Task 7: Every string, in English and Dutch, and the wording test

**Files:**
- Modify: `A/backoffice/src/localization/en.ts`, `A/backoffice/src/localization/nl.ts`
- Create: `A/backoffice/src/localization/wording.test.ts`

Design P8 and §6: "no shipped string in English or Dutch says private, public or name for this".
Every key the later tasks use is added here, so no task has to touch the dictionaries again.

- [ ] **Step 1: Write the failing test.** Create `wording.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import en from './en.js';
import nl from './nl.js';

/**
 * The keys whose words are about showing or hiding a player's scores. Design P8: these say
 * "leaderboard", "show" and "hidden", never "private", "public" or "name". Listed rather than
 * guessed, and checked to exist, so renaming one cannot quietly drop it from the test.
 */
const SHOWING_KEYS = [
  'askStanding', 'ask', 'answerShow', 'answerHide', 'hiddenLine', 'showThemLink', 'onlyYou',
  'showScores', 'showScoresHelp', 'fallbackHeadline', 'fallbackText',
] as const;

/**
 * A dictionary value as text. A value may be a function (the plurals), asked here for two.
 * @param value The value.
 * @returns Its text.
 */
const text = (value: unknown): string => (typeof value === 'function' ? String((value as (n: number) => string)(2)) : String(value));

/**
 * Every value of a dictionary, with its key.
 * @param dictionary The area's entries.
 * @returns Key and text pairs.
 */
const entries = (dictionary: Record<string, unknown>) => Object.entries(dictionary).map(([key, value]) => [key, text(value)] as const);

it('never says private or public, in English or in Dutch', () => {
  for (const [key, value] of entries(en.umbraDesktopArcade)) expect(value, key).not.to.match(/\b(private|public|privacy)\b/i);
  for (const [key, value] of entries(nl.umbraDesktopArcade)) expect(value, key).not.to.match(/priv[eé]|privacy|openbaar|publiek/i);
});

it('never says name in the words about showing and hiding scores', () => {
  const english = en.umbraDesktopArcade as Record<string, unknown>;
  const dutch = nl.umbraDesktopArcade as Record<string, unknown>;
  for (const key of SHOWING_KEYS) {
    expect(english, key).to.have.property(key);
    expect(text(english[key]), key).not.to.match(/\bname\b/i);
    expect(text(dutch[key]), key).not.to.match(/\bnaam\b/i);
  }
});
```

- [ ] **Step 2: Run, expect failure.** `npx web-test-runner "src/localization/wording.test.ts" --node-resolve`.
  Expected: the first case fails on `private` ("Private: only you see this", "Keep them private")
  and the second on `askStanding` not existing yet.

- [ ] **Step 3: Replace `en.ts`'s area** (keep the file's doc comment, and update its first paragraph
  to say the dictionary holds the hub, the pieces and the toasts):

```ts
export default {
  umbraDesktopArcade: {
    // The launcher group the Arcade's catalogue defines.
    groupGames: 'Games',
    // The hub (design P11, P12).
    hub: 'Arcade',
    needsDesktop: 'The Arcade only works on the desktop.',
    play: 'Play',
    allGames: 'All games',
    yourProfile: 'Your profile',
    standLead: 'Boards you lead',
    standTopThree: 'More in your top three',
    standColleagues: 'Colleagues playing',
    notPlayed: 'Not played yet',
    next: 'Next: {0}',
    boardEmpty: 'Nobody has played this yet.',
    boardUnavailable: 'The board could not be loaded.',
    overviewUnavailable: 'The Arcade could not be loaded.',
    retry: 'Retry',
    // How to win, derived from each board (phrases.ts).
    ruleFastest: 'Fastest time wins',
    ruleHighest: 'Highest score wins',
    ruleLowest: 'Lowest score wins',
    ruleLongest: 'Longest time wins',
    // Ranks and numbers.
    ordinalOne: '{0}st',
    ordinalTwo: '{0}nd',
    ordinalFew: '{0}rd',
    ordinalOther: '{0}th',
    unitSeconds: 'sec',
    unitPoints: 'points',
    players: (count: number) => (count === 1 ? '1 player' : `${count} players`),
    you: 'You',
    // The result card (design P2, P4 to P7, P10).
    outcomeWon: 'You won',
    outcomeOver: 'Game over',
    ribbonNewBest: 'New best',
    ribbonFirst: 'First place',
    standing: '{0} of {1}',
    wouldBe: 'would be {0}',
    yourBest: 'Your best {0}',
    stillLeads: 'Your best {0} still leads',
    passed: "past {0}'s {1}",
    chase: '{0} behind {1}',
    leaderboardLink: 'Leaderboard',
    playAgain: 'Play again',
    // Showing and hiding scores (P7 to P9). Never "private", "public" or "name": wording.test.ts.
    askStanding: "That's {0} of {1}.",
    ask: 'Show your scores on the Arcade leaderboard, where colleagues can see them?',
    answerShow: 'Yes, show my scores',
    answerHide: 'No, only I see them',
    hiddenLine: 'Your scores are hidden from the leaderboard.',
    showThemLink: 'Show them',
    onlyYou: 'Only you see this',
    // The fallback question, for a game that shows no card (P3).
    fallbackHeadline: 'Show your scores on the Arcade leaderboard?',
    fallbackText:
      "The Arcade keeps everyone's best scores in the desktop's games and ranks them on leaderboards. Show yours there, where colleagues can see them? You can change this in the Arcade at any time.",
    // The panel (P2, P10).
    leaderboard: 'Leaderboard',
    openInArcade: 'Open in the Arcade',
    close: 'Close',
    // Toasts (P13).
    newBest: 'New best on {0}: {1}',
    newBestRanked: 'New best on {0}: {1}, number {2}',
    beatenHeadline: '{0} took first place from you on {1}',
    beatenScore: '{0} beats your {1}.',
    beatenRank: 'You are {0} now.',
    beatenWith: 'With {0}.',
    beatenOpen: 'Select to open the leaderboard.',
    beatenOpenLink: 'Open the leaderboard',
    // The profile (P11).
    leaderboardName: 'Your name on the leaderboards',
    leaderboardNameHelp: 'What colleagues see next to your scores. It starts as your Umbraco name.',
    save: 'Save',
    showScores: 'Show my scores on the leaderboards',
    showScoresHelp: "Off: colleagues don't see them; you still see your own rank.",
    notifyBeaten: 'Tell me when someone takes first place from me',
    notifyBeatenHelp: 'Shown the next time you open the desktop.',
    deleteMyScores: 'Delete my scores',
    deleteHelp: 'Removes every score and your name from the Arcade. This cannot be undone.',
    deleteHeadline: 'Delete your scores?',
    deleteText: 'Your scores and Arcade settings are removed from every board. This cannot be undone.',
    delete: 'Delete',
    saveFailed: 'Your changes could not be saved.',
    deleteFailed: 'Your scores could not be deleted.',
    // Moderation, for users with the Users section (D11).
    moreActions: 'More actions for {0}',
    removeScore: 'Remove score',
    removeScoreHeadline: 'Remove this score?',
    remove: 'Remove',
    resetName: 'Reset name',
    resetNameHeadline: 'Reset this name?',
    resetNameText: 'The player goes back to their Umbraco name: {0}',
    resetBoard: 'Reset this board',
    resetBoardHeadline: 'Reset this board?',
    resetBoardText: 'Every score on it is removed. This cannot be undone.',
    reset: 'Reset',
    actionFailed: 'That did not work. Try again.',
  },
};
```

  Confirm in the installed `localization-api` types that a dictionary value may be a function
  (`#processTerm` calls a function term with the args, line 113 of `localization.controller.js` in
  17.7.0). If `tsc` objects to the function in the default export, type the export the way Umbraco's
  own `UmbLocalizationDictionary` is typed.

- [ ] **Step 4: Replace `nl.ts`'s area** with the same keys:

```ts
export default {
  umbraDesktopArcade: {
    groupGames: 'Spellen',
    // The hub (design P11, P12).
    hub: 'Arcade',
    needsDesktop: 'De Arcade werkt alleen op het bureaublad.',
    play: 'Spelen',
    allGames: 'Alle spellen',
    yourProfile: 'Je profiel',
    standLead: 'Ranglijsten die je leidt',
    standTopThree: 'Nog in je top drie',
    standColleagues: 'Collega’s die spelen',
    notPlayed: 'Nog niet gespeeld',
    next: 'Volgende: {0}',
    boardEmpty: 'Niemand heeft dit nog gespeeld.',
    boardUnavailable: 'De ranglijst kon niet worden geladen.',
    overviewUnavailable: 'De Arcade kon niet worden geladen.',
    retry: 'Opnieuw proberen',
    // How to win.
    ruleFastest: 'Snelste tijd wint',
    ruleHighest: 'Hoogste score wint',
    ruleLowest: 'Laagste score wint',
    ruleLongest: 'Langste tijd wint',
    // Ranks and numbers. Dutch has one ordinal form.
    ordinalOne: '{0}e',
    ordinalTwo: '{0}e',
    ordinalFew: '{0}e',
    ordinalOther: '{0}e',
    unitSeconds: 'sec',
    unitPoints: 'punten',
    players: (count: number) => (count === 1 ? '1 speler' : `${count} spelers`),
    you: 'Jij',
    // The result card.
    outcomeWon: 'Gewonnen',
    outcomeOver: 'Game over',
    ribbonNewBest: 'Nieuw record',
    ribbonFirst: 'Eerste plaats',
    standing: '{0} van {1}',
    wouldBe: 'zou {0} zijn',
    yourBest: 'Je record {0}',
    stillLeads: 'Je record {0} staat nog bovenaan',
    passed: 'voorbij {0} met {1}',
    chase: '{0} achter {1}',
    leaderboardLink: 'Ranglijst',
    playAgain: 'Nog een keer',
    // Showing and hiding scores. Never "privé", "openbaar" or "naam": wording.test.ts.
    askStanding: 'Dat is {0} van {1}.',
    ask: 'Je scores tonen op de Arcade-ranglijst, waar collega’s ze kunnen zien?',
    answerShow: 'Ja, toon mijn scores',
    answerHide: 'Nee, alleen ik zie ze',
    hiddenLine: 'Je scores zijn verborgen op de ranglijst.',
    showThemLink: 'Toon ze',
    onlyYou: 'Alleen jij ziet dit',
    fallbackHeadline: 'Je scores tonen op de Arcade-ranglijst?',
    fallbackText:
      'De Arcade bewaart ieders beste scores in de spellen op het bureaublad en zet ze op ranglijsten. Je scores daar tonen, waar collega’s ze kunnen zien? Je kunt dit altijd wijzigen in de Arcade.',
    // The panel.
    leaderboard: 'Ranglijst',
    openInArcade: 'Openen in de Arcade',
    close: 'Sluiten',
    // Toasts.
    newBest: 'Nieuw record op {0}: {1}',
    newBestRanked: 'Nieuw record op {0}: {1}, nummer {2}',
    beatenHeadline: '{0} heeft je de eerste plaats op {1} afgenomen',
    beatenScore: '{0} verslaat je {1}.',
    beatenRank: 'Je staat nu {0}.',
    beatenWith: 'Met {0}.',
    beatenOpen: 'Selecteer om de ranglijst te openen.',
    beatenOpenLink: 'Ranglijst openen',
    // The profile.
    leaderboardName: 'Je naam op de ranglijsten',
    leaderboardNameHelp: 'Wat collega’s naast je scores zien. Begint als je Umbraco-naam.',
    save: 'Opslaan',
    showScores: 'Mijn scores tonen op de ranglijsten',
    showScoresHelp: 'Uit: collega’s zien ze niet; je eigen plaats zie je nog wel.',
    notifyBeaten: 'Laat het me weten als iemand mijn eerste plaats overneemt',
    notifyBeatenHelp: 'Getoond de volgende keer dat je het bureaublad opent.',
    deleteMyScores: 'Mijn scores verwijderen',
    deleteHelp: 'Verwijdert al je scores en je naam uit de Arcade. Dit kan niet ongedaan worden gemaakt.',
    deleteHeadline: 'Je scores verwijderen?',
    deleteText: 'Je scores en Arcade-instellingen worden van elke ranglijst verwijderd. Dit kan niet ongedaan worden gemaakt.',
    delete: 'Verwijderen',
    saveFailed: 'Je wijzigingen konden niet worden opgeslagen.',
    deleteFailed: 'Je scores konden niet worden verwijderd.',
    // Moderation.
    moreActions: 'Meer acties voor {0}',
    removeScore: 'Score verwijderen',
    removeScoreHeadline: 'Deze score verwijderen?',
    remove: 'Verwijderen',
    resetName: 'Naam herstellen',
    resetNameHeadline: 'Deze naam herstellen?',
    resetNameText: 'De speler krijgt zijn Umbraco-naam terug: {0}',
    resetBoard: 'Deze ranglijst wissen',
    resetBoardHeadline: 'Deze ranglijst wissen?',
    resetBoardText: 'Alle scores erop worden verwijderd. Dit kan niet ongedaan worden gemaakt.',
    reset: 'Wissen',
    actionFailed: 'Dat is niet gelukt. Probeer het opnieuw.',
  },
};
```

- [ ] **Step 5: Run, expect pass.** `wording.test.ts` and `parity.test.ts` green. Then `npm test` and
  `npm run build` from `A`. The old elements still compile: they call `termOrDefault` with their own
  fallbacks, and they are replaced in Tasks 13 and 16 to 18.

### Task 8: The look: tokens per theme, the threshold, the font, the theme stamp

**Files:**
- Create: `A/backoffice/src/pieces/constants.ts`
- Create: `A/backoffice/src/pieces/look.ts`
- Create: `A/backoffice/src/pieces/font.ts`, test `font.test.ts`
- Create: `A/backoffice/src/pieces/theme.controller.ts`, test `theme.controller.test.ts`
- Modify: `A/backoffice/vite.config.ts`, `A/package.json` (dev dependency)

Design P14: one look for the hub, the card, the panel and the toast, taken from Solitaire, restyled
per theme the way Solitaire restyles its felt (`E/backoffice/src/solitaire/solitaire.element.ts`,
the `:host([data-umbradesktop-theme=…])` blocks in its styles). The hub gets the theme stamp from the
desktop as an app (`docs/developer/desktop-apps.md` §5). A piece inside a game is not an app, so it
stamps itself from the desktop's settings context (settled point 14).

- [ ] **Step 1: Write the failing tests.** Create `pieces/font.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { ARCADE_DISPLAY_FONT, ensureArcadeFont } from './font.js';

it('declares the display font once, in the document, where a shadow root can use it', () => {
  const doc = document.implementation.createHTMLDocument('font');
  ensureArcadeFont(doc);
  ensureArcadeFont(doc);
  const styles = doc.head.querySelectorAll('style#umbradesktop-arcade-font');
  expect(styles).to.have.length(1);
  expect(styles[0].textContent).to.contain(ARCADE_DISPLAY_FONT).and.contain('.woff2');
});
```

  Create `pieces/theme.controller.test.ts`:

```ts
import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbStringState } from '@umbraco-cms/backoffice/observable-api';
import { ArcadeThemeController } from './theme.controller.js';

/** Stands in for the desktop, which provides its settings context to everything inside it. */
@customElement('umbradesktop-arcade-theme-test-desktop')
class TestDesktop extends UmbLitElement {}

/** Stands in for a piece. */
@customElement('umbradesktop-arcade-theme-test-piece')
class TestPiece extends UmbLitElement {
  constructor() {
    super();
    new ArcadeThemeController(this);
  }
}

it('stamps the desktop\'s theme on the piece and follows a change', async () => {
  const theme = new UmbStringState('win98');
  const desktop = await fixture<TestDesktop>(html`<umbradesktop-arcade-theme-test-desktop></umbradesktop-arcade-theme-test-desktop>`);
  desktop.provideContext(new UmbContextToken<UmbContextMinimal>('UmbraDesktopSettingsContext'), { getHostElement: () => desktop, theme: theme.asObservable() } as never);
  const piece = document.createElement('umbradesktop-arcade-theme-test-piece') as TestPiece;
  desktop.append(piece);
  await waitUntil(() => piece.getAttribute('data-umbradesktop-theme') === 'win98', 'stamped');
  theme.setValue('macos');
  await waitUntil(() => piece.getAttribute('data-umbradesktop-theme') === 'macos', 'followed');
});

it('stamps nothing outside the desktop, so the unbranched Umbraco look applies', async () => {
  const piece = await fixture<TestPiece>(html`<umbradesktop-arcade-theme-test-piece></umbradesktop-arcade-theme-test-piece>`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(piece.hasAttribute('data-umbradesktop-theme')).to.equal(false);
});
```

- [ ] **Step 2: Run, expect failure.** Both: cannot resolve the modules.

- [ ] **Step 3: The numbers.** Create `pieces/constants.ts`:

```ts
/**
 * Every number the Arcade's pieces need in both their CSS and their tests, per the repository's
 * "derive numbers, never type them" rule (`docs/developer/theming.md` §4). The stylesheets read these
 * through `unsafeCSS`, and the tests mount the pieces in boxes sized from them.
 */

/** The full result card's width, in px, as the mock draws it. */
export const ARCADE_CARD_WIDTH_PX = 268;

/** The compact result card's width, in px. */
export const ARCADE_COMPACT_CARD_WIDTH_PX = 226;

/** Space a piece keeps from the edges of the box it is given, each side, in px. */
export const ARCADE_PIECE_MARGIN_PX = 12;

/**
 * Below this width a piece draws its compact form (design P10): the full card plus its margins no
 * longer fits. One threshold for the card and the panel, so a game never gets a full card over a
 * compact panel or the other way round.
 *
 * Minesweeper's well (nine 26px cells, eight 1px gaps, 8px padding each side: 258) is under it and
 * Snake's (twenty 14px cells, 8px padding each side: 296) is over it. Both are measured in a real
 * desktop in the verification task, because deriving only makes the sum consistent with itself.
 */
export const ARCADE_COMPACT_BELOW_PX = ARCADE_CARD_WIDTH_PX + 2 * ARCADE_PIECE_MARGIN_PX;

/** The full panel's widest, in px; it rises from the bottom of a wider game centred at this width. */
export const ARCADE_PANEL_MAX_WIDTH_PX = 470;
```

- [ ] **Step 4: The font.** From `A`: `npm install --save-dev @fontsource-variable/fraunces`. Then
  `ls node_modules/@fontsource-variable/fraunces/files | grep latin-wght-normal` and use the exact
  name (expected `fraunces-latin-wght-normal.woff2`; fix `ARCADE_FONT_FILE` below if it differs).
  Fraunces is under the SIL Open Font License; the licence goes with the file.

  In `vite.config.ts`, add below `copyDocs`, and add `copyFont()` to `plugins`:

```ts
/** The display font's file in the fontsource package, and its licence. Kept in step with `src/pieces/font.ts`. */
const FONT_SOURCE = "../node_modules/@fontsource-variable/fraunces";

/**
 * Copies the Arcade's display font (Fraunces, SIL Open Font License) and its licence into this
 * package's App_Plugins folder, where `src/pieces/font.ts` points the browser. Copied rather than
 * committed, so the repository holds no binary and the version is the lock file's.
 * @returns The Vite plugin.
 */
function copyFont(): Plugin {
	return {
		name: "umbradesktop-copy-font",
		closeBundle() {
			const from = (file: string) => fileURLToPath(new URL(`${FONT_SOURCE}/${file}`, import.meta.url));
			const to = (file: string) => fileURLToPath(new URL(`${outDir}/fonts/${file}`, import.meta.url));
			cpSync(from("files/fraunces-latin-wght-normal.woff2"), to("fraunces-latin-wght-normal.woff2"));
			cpSync(from("LICENSE"), to("OFL.txt"));
		},
	};
}
```

  Create `pieces/font.ts`:

```ts
/** The family name the Arcade declares its display font under; namespaced so no site's own Fraunces is touched. */
export const ARCADE_DISPLAY_FONT = 'UmbraDesktop Arcade Fraunces';

/** The file, as `vite.config.ts` copies it. */
const ARCADE_FONT_FILE = 'fraunces-latin-wght-normal.woff2';

/** Where the browser finds it. */
const ARCADE_FONT_URL = `/App_Plugins/Umbraco.Community.UmbraDesktop.Services.Arcade/fonts/${ARCADE_FONT_FILE}`;

/** The style element's id, so it is added once however many pieces ask. */
const STYLE_ID = 'umbradesktop-arcade-font';

/**
 * Declare the Arcade's display font in the document. In the document, not a shadow root: Chrome
 * ignores `@font-face` inside shadow-root styles, so a font declared beside the elements that use it
 * would never load. Every Arcade element calls this on construction; the first call adds it.
 * @param doc The document; the page's own by default.
 */
export function ensureArcadeFont(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `@font-face { font-family: '${ARCADE_DISPLAY_FONT}'; src: url('${ARCADE_FONT_URL}') format('woff2'); font-weight: 100 900; font-style: normal; font-display: swap; }`;
  doc.head.append(style);
}
```

- [ ] **Step 5: The theme stamp.** Create `pieces/theme.controller.ts`:

```ts
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHostElement } from '@umbraco-cms/backoffice/controller-api';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';

/** The one member of the desktop's settings context this needs, declared here because nothing is imported from the host. */
interface DesktopTheme extends UmbContextMinimal {
  /** The active theme's id; see `docs/developer/desktop-apps.md` §5 for the ids. */
  readonly theme: Observable<string>;
}

/** The desktop's settings context, by its published alias. */
const DESKTOP_SETTINGS = new UmbContextToken<DesktopTheme>('UmbraDesktopSettingsContext');

/**
 * Stamps the desktop's active theme on an Arcade piece as `data-umbradesktop-theme`, so the piece's
 * `:host([data-umbradesktop-theme=…])` rules work as they do for an app (design P14).
 *
 * The desktop stamps apps itself; a piece lives inside a game's shadow root and is not an app, so it
 * reads the theme where the desktop publishes it. Outside the desktop (a test, the plain backoffice)
 * nothing answers and nothing is stamped, which leaves the unbranched rules: the Umbraco look.
 */
export class ArcadeThemeController extends UmbControllerBase {
  /** @param host The piece. */
  constructor(host: UmbControllerHostElement) {
    super(host);
    this.consumeContext(DESKTOP_SETTINGS, (settings) => {
      if (!settings?.theme) return;
      this.observe(
        settings.theme,
        (id) => {
          if (id) host.setAttribute('data-umbradesktop-theme', id);
          else host.removeAttribute('data-umbradesktop-theme');
        },
        'umbraDesktopArcadeTheme',
      );
    });
  }
}
```

  Confirm in the installed source that `UmbControllerBase` has `observe` and `consumeContext`
  (`libs/class-api/class.mixin.d.ts`); round one's `ArcadeScores` already uses `consumeContext` on one.

- [ ] **Step 6: The look.** Create `pieces/look.ts`. The values are the mock's for the Umbraco theme
  and a starting point for the other four; Task 24 tunes them against screenshots, and changes go
  here only.

```ts
import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import type { CSSResult } from '@umbraco-cms/backoffice/external/lit';
import { ARCADE_COMPACT_BELOW_PX } from './constants.js';
import { ARCADE_DISPLAY_FONT } from './font.js';

/**
 * The faint grain on the felt, as Solitaire draws it: white fractal noise, alpha scaled down, as a
 * data URI so the package ships no image.
 */
const NOISE_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(%23n)'/></svg>";

/**
 * The Arcade's colours, per theme (design P14). Custom properties on `:host`, so every Arcade
 * element includes this first and reads only `--arcade-*` after it.
 *
 * Unbranched values are the Umbraco look and the correct case; each theme block is a refinement on
 * top (`desktop-apps.md` §5), so a sixth theme gets the Umbraco look rather than nothing. A theme may
 * restyle, never remove: no block here hides anything.
 */
export const arcadeTheme = css`
  :host {
    --arcade-felt: radial-gradient(130% 90% at 50% -10%, #34489a 0%, #1d2a5c 45%, #111a40 80%, #0c1232 100%);
    --arcade-grain: 0.28;
    --arcade-text: #eef0ff;
    --arcade-soft: rgb(232 235 255 / 62%);
    --arcade-faint: rgb(232 235 255 / 38%);
    --arcade-glass: rgb(255 255 255 / 6.5%);
    --arcade-glass-strong: rgb(255 255 255 / 10%);
    --arcade-ring: rgb(255 255 255 / 11%);
    --arcade-edge: inset 0 0 0 1px var(--arcade-ring);
    --arcade-blur: blur(10px);
    --arcade-accent: #f5c1bc;
    --arcade-accent-deep: #e9958d;
    --arcade-on-accent: #1b264f;
    --arcade-mine: linear-gradient(100deg, rgb(245 193 188 / 22%), rgb(245 193 188 / 7%) 45%, rgb(255 255 255 / 16%) 52%, rgb(245 193 188 / 7%) 60%, rgb(245 193 188 / 12%));
    --arcade-mine-edge: inset 0 0 0 1px rgb(245 193 188 / 40%), 0 0 24px -6px rgb(245 193 188 / 45%);
    --arcade-gold: #ffe08a;
    --arcade-gold-deep: #e0a91e;
    --arcade-danger: #ff9aa5;
    --arcade-radius: 14px;
    --arcade-control-radius: 999px;
    --arcade-shadow: 0 24px 50px -12px rgb(0 0 0 / 65%), 0 0 0 1px rgb(255 255 255 / 12%);
    --arcade-scrim: rgb(15 20 50 / 38%);
    --arcade-display: '${unsafeCSS(ARCADE_DISPLAY_FONT)}', Georgia, serif;
    --arcade-body: var(--umbradesktop-app-font, inherit);
  }
  :host([data-umbradesktop-theme='umbraco4']) {
    --arcade-felt: radial-gradient(130% 90% at 50% -10%, #5a9a6e 0%, #356447 45%, #20402c 80%, #16301f 100%);
    --arcade-accent: #f8c38a;
    --arcade-accent-deep: #e39a4c;
    --arcade-on-accent: #2a1a05;
    --arcade-mine: linear-gradient(100deg, rgb(248 195 138 / 24%), rgb(248 195 138 / 8%));
    --arcade-mine-edge: inset 0 0 0 1px rgb(248 195 138 / 45%);
  }
  :host([data-umbradesktop-theme='macos']) {
    --arcade-felt: radial-gradient(130% 90% at 50% -10%, #5b5f68 0%, #3a3d44 45%, #26282d 80%, #1c1d21 100%);
    --arcade-accent: #8cc4ff;
    --arcade-accent-deep: #0a84ff;
    --arcade-on-accent: #04213f;
    --arcade-mine: linear-gradient(100deg, rgb(10 132 255 / 26%), rgb(10 132 255 / 10%));
    --arcade-mine-edge: inset 0 0 0 1px rgb(140 196 255 / 45%);
    --arcade-radius: 12px;
  }
  :host([data-umbradesktop-theme='win11']) {
    --arcade-felt: radial-gradient(130% 90% at 50% -10%, #2b4c7e 0%, #1a2f52 45%, #10203a 80%, #0b172b 100%);
    --arcade-accent: #99ebff;
    --arcade-accent-deep: #60cdff;
    --arcade-on-accent: #00283a;
    --arcade-mine: linear-gradient(100deg, rgb(96 205 255 / 22%), rgb(96 205 255 / 8%));
    --arcade-mine-edge: inset 0 0 0 1px rgb(96 205 255 / 45%);
    --arcade-radius: 8px;
    --arcade-control-radius: 4px;
  }
  :host([data-umbradesktop-theme='win98']) {
    --arcade-felt: #008080;
    --arcade-grain: 0;
    --arcade-text: #fff;
    --arcade-soft: #fff;
    --arcade-faint: #dfdfdf;
    --arcade-glass: #c0c0c0;
    --arcade-glass-strong: #c0c0c0;
    --arcade-edge: inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
    --arcade-blur: none;
    --arcade-accent: #c0c0c0;
    --arcade-accent-deep: #808080;
    --arcade-on-accent: #000;
    --arcade-mine: #000080;
    --arcade-mine-edge: none;
    --arcade-gold: #ffd700;
    --arcade-gold-deep: #b8860b;
    --arcade-danger: #800000;
    --arcade-radius: 0;
    --arcade-control-radius: 0;
    --arcade-shadow: none;
    --arcade-scrim: transparent;
    --arcade-display: var(--umbradesktop-app-font, inherit);
  }
`;

/**
 * The shared pieces of the look: felt, glass, buttons, medals, rows, the podium, the pill. Class
 * names follow the mock, so the mock stays readable as the reference for each.
 *
 * Sentence case throughout, no letter-spaced capitals (the owner's rule; the mock's `.k`, `.lbl`,
 * `.ribbon` and "YOU" are deliberately not copied). Motion happens once and
 * `prefers-reduced-motion` removes it (P14).
 */
export const arcadeLook = css`
  :host { font-family: var(--arcade-body); }
  .felt { background: var(--arcade-felt); color: var(--arcade-text); position: relative; isolation: isolate; }
  .felt::before {
    content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    opacity: var(--arcade-grain); mix-blend-mode: overlay; background-image: url("${unsafeCSS(NOISE_SVG)}");
  }
  .glass { background: var(--arcade-glass); box-shadow: var(--arcade-edge); border-radius: var(--arcade-radius); backdrop-filter: var(--arcade-blur); }
  .display { font-family: var(--arcade-display); }
  button { font: inherit; color: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--arcade-accent); outline-offset: 2px; }
  .btn {
    font-weight: 600; font-size: 13px; border: 0; border-radius: var(--arcade-control-radius); padding: 9px 18px;
    color: var(--arcade-on-accent); background: linear-gradient(180deg, color-mix(in srgb, var(--arcade-accent) 70%, white), var(--arcade-accent));
    box-shadow: 0 6px 18px -6px var(--arcade-accent), inset 0 1px 0 rgb(255 255 255 / 60%);
  }
  .btn.sm { padding: 6px 14px; font-size: 12px; }
  .btn.ghost { background: transparent; color: var(--arcade-text); box-shadow: inset 0 0 0 1.5px var(--arcade-soft); }
  .btn.danger { background: transparent; color: var(--arcade-danger); box-shadow: inset 0 0 0 1.5px var(--arcade-danger); }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .link { background: none; border: 0; padding: 0; font-weight: 600; font-size: 12px; color: var(--arcade-accent); }
  .medal { width: 28px; height: 28px; border-radius: 50%; display: inline-grid; place-items: center; font-weight: 800; font-size: 12px; flex: none; }
  .medal.g { background: radial-gradient(circle at 35% 30%, #fff6cf, var(--arcade-gold) 35%, var(--arcade-gold-deep) 90%); color: #6b4700; }
  .medal.s { background: radial-gradient(circle at 35% 30%, #fff, #dfe3ee 40%, #98a1b9 95%); color: #3e465f; }
  .medal.b { background: radial-gradient(circle at 35% 30%, #ffe4cc, #e7a774 40%, #a8612b 95%); color: #5b2c07; }
  .medal.p { background: var(--arcade-glass-strong); color: var(--arcade-soft); box-shadow: var(--arcade-edge); }
  .crown { width: 16px; height: 16px; color: var(--arcade-gold); flex: none; }
  .ribbon {
    display: inline-flex; align-items: center; gap: 6px; font-weight: 800; font-size: 11px; white-space: nowrap;
    color: var(--arcade-on-accent); padding: 4px 10px; border-radius: var(--arcade-control-radius);
    background: linear-gradient(90deg, var(--arcade-gold), color-mix(in srgb, var(--arcade-gold) 80%, var(--arcade-gold-deep)), var(--arcade-gold));
    color: #1b264f;
  }
  .ribbon .crown { width: 12px; height: 12px; color: #1b264f; }
  ol { list-style: none; margin: 0; padding: 0; }
  .lr { display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-radius: calc(var(--arcade-radius) - 2px); font-size: 14px; }
  .lr .name { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; white-space: nowrap; }
  .lr .who { overflow: hidden; text-overflow: ellipsis; }
  .lr .sc { font-weight: 700; font-size: 15px; font-variant-numeric: tabular-nums; }
  .lr .dt { width: 64px; text-align: end; color: var(--arcade-faint); font-size: 12px; }
  .lr .only { color: var(--arcade-faint); font-size: 12px; }
  .lr.mine { background: var(--arcade-mine); box-shadow: var(--arcade-mine-edge); }
  .lr.ghost { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--arcade-accent) 12%, transparent) 0 6px, transparent 6px 12px); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--arcade-accent) 55%, transparent); }
  .you { font-size: 11px; font-weight: 700; color: var(--arcade-accent); margin-inline-start: 4px; }
  .gap { text-align: center; color: var(--arcade-faint); letter-spacing: 0.4em; font-size: 12px; padding: 2px 0; }
  .av { width: 30px; height: 30px; border-radius: 50%; display: inline-grid; place-items: center; font-weight: 700; font-size: 11px; color: #fff; flex: none; background: linear-gradient(135deg, #6b7cff, #3544b1); }
  .av.a1 { background: linear-gradient(135deg, #ff8fa6, #c0516b); }
  .av.a2 { background: linear-gradient(135deg, #6fe0b8, #2e8a6e); }
  .av.a3 { background: linear-gradient(135deg, #ffcf70, #b07a1c); }
  .av.a4 { background: linear-gradient(135deg, #b49bff, #6a4bc4); }
  .av.self { box-shadow: 0 0 0 2px var(--arcade-on-accent), 0 0 0 4px var(--arcade-accent); }
  .seg { display: inline-flex; padding: 4px; border-radius: var(--arcade-control-radius); background: rgb(0 0 0 / 25%); box-shadow: var(--arcade-edge); }
  .seg button { border: 0; background: none; font-weight: 600; font-size: 13px; padding: 6px 18px; border-radius: var(--arcade-control-radius); color: var(--arcade-soft); }
  .seg button[aria-selected='true'] { background: #fff; color: #1b264f; box-shadow: 0 4px 12px -4px rgb(0 0 0 / 50%); }
  .podium { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: end; gap: 12px; }
  .pod { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
  .pod .pn { font-weight: 600; font-size: 13px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pod .ps { font-weight: 700; font-size: 17px; font-variant-numeric: tabular-nums; }
  .pod.mine .pn { color: var(--arcade-accent); }
  .step { width: 100%; border-radius: 12px 12px 4px 4px; display: grid; place-items: start center; padding-top: 8px; font-family: var(--arcade-display); font-weight: 700; font-size: 20px; }
  .step.s1 { height: 54px; color: var(--arcade-gold); background: linear-gradient(180deg, color-mix(in srgb, var(--arcade-gold) 45%, transparent), color-mix(in srgb, var(--arcade-gold) 8%, transparent)); }
  .step.s2 { height: 40px; color: #dfe3ee; background: linear-gradient(180deg, rgb(223 227 238 / 32%), rgb(223 227 238 / 5%)); }
  .step.s3 { height: 30px; color: #e7a774; background: linear-gradient(180deg, rgb(231 167 116 / 35%), rgb(231 167 116 / 5%)); }
  /* Windows 98: the panels are silver bevels with black text, as that system's dialogs were. */
  :host([data-umbradesktop-theme='win98']) .glass,
  :host([data-umbradesktop-theme='win98']) .surface {
    background: #c0c0c0; box-shadow: var(--arcade-edge);
    --arcade-text: #000; --arcade-soft: #202020; --arcade-faint: #505050; --arcade-accent: #000080;
    color: #000;
  }
  :host([data-umbradesktop-theme='win98']) .lr.mine { color: #fff; --arcade-soft: #fff; --arcade-faint: #dfdfdf; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
`;

/**
 * A piece's compact rules, applied in both cases design P10 names: a box narrower than
 * {@link ARCADE_COMPACT_BELOW_PX}, and the `compact` attribute. The rules are written once, as a
 * function of a selector prefix, and emitted twice: inside the container query with no prefix, and
 * under `:host([compact])`. The host must be the query container (`container-type: inline-size`).
 * @param rulesFor Writes the compact rules, each selector starting with the prefix it is given.
 * @returns The stylesheet.
 */
export function compactStyles(rulesFor: (scope: string) => string): CSSResult {
  return unsafeCSS(`@container (width < ${ARCADE_COMPACT_BELOW_PX}px) { ${rulesFor('')} }\n${rulesFor(':host([compact])')}`);
}
```

- [ ] **Step 7: Run, expect pass.** Both new tests, then `npm test` and `npm run build` from `A`. Check
  `A/wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop.Services.Arcade/fonts/` holds the woff2 and
  `OFL.txt` after the build.

### Task 9: The parts every Arcade surface draws

**Files:**
- Create: `A/backoffice/src/pieces/parts.ts`
- Test: `A/backoffice/src/pieces/parts.test.ts`

Medals, avatars, rows, the podium and the short board of three, as Lit templates and pure helpers,
so the card, the panel and the hub draw a row the same way.

- [ ] **Step 1: Write the failing tests.** Create `parts.test.ts`:

```ts
import { expect } from '@open-wc/testing';
import { html, render } from '@umbraco-cms/backoffice/external/lit';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { AVATAR_HUES, avatarHue, entryRow, initials, medalKind, podium, shortBoardRows } from './parts.js';

const entry = (rank: number, name: string, value: number, isViewer = false): ArcadeBoardEntry =>
  ({ rank, userKey: `k-${name}`, displayName: name, value, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer });
const board = (top: ArcadeBoardEntry[], viewer: ArcadeBoardEntry | null, above: ArcadeBoardEntry | null = null): ArcadeBoard =>
  ({ played: true, top, viewer, viewerIsPublic: true, canModerate: false, players: 12, above });

it('takes initials from the first and last word', () => {
  expect(initials('Luuk Peters')).to.equal('LP');
  expect(initials('Anna de Vries')).to.equal('AV');
  expect(initials('Ada')).to.equal('A');
  expect(initials('   ')).to.equal('?');
});

it('gives each player a stable avatar colour', () => {
  expect(avatarHue('k-1')).to.equal(avatarHue('k-1'));
  for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) expect(avatarHue(key)).to.be.within(0, AVATAR_HUES - 1);
});

it('gives the top three their metals and everyone else a plain disc', () => {
  expect([1, 2, 3, 4, 12].map(medalKind)).to.deep.equal(['g', 's', 'b', 'p', 'p']);
});

it('stands the podium second, first, third from left to right', () => {
  const host = document.createElement('div');
  render(podium([entry(1, 'Tom', 3960), entry(2, 'Sophie', 3710), entry(3, 'Anna', 3120)], { format: 'points', you: 'You', lang: 'en-US' }), host);
  expect([...host.querySelectorAll('.pod')].map((p) => p.getAttribute('data-rank'))).to.deep.equal(['2', '1', '3']);
});

it('draws a podium extra once per entry, for the hub\'s moderator menu', () => {
  const host = document.createElement('div');
  const extra = (e: ArcadeBoardEntry) => html`<i class="extra">${e.rank}</i>`;
  render(podium([entry(1, 'Tom', 3960), entry(2, 'Sophie', 3710)], { format: 'points', you: 'You', lang: 'en-US', extra }), host);
  expect([...host.querySelectorAll('.extra')].map((i) => i.textContent)).to.deep.equal(['2', '1']);
});

it('names the viewer You in a row, or marks them beside their name', () => {
  const host = document.createElement('div');
  render(entryRow(entry(3, 'Luuk Peters', 38_100, true), { format: 'time', you: 'You', lang: 'en-US', youMode: 'replace' }), host);
  expect(host.querySelector('.who')!.textContent).to.equal('You');
  render(entryRow(entry(12, 'Luuk Peters', 1_140, true), { format: 'points', you: 'You', lang: 'en-US', youMode: 'mark' }), host);
  expect(host.querySelector('.who')!.textContent).to.equal('Luuk Peters');
  expect(host.querySelector('.you')!.textContent).to.equal('You');
});

it('draws a hidden viewer as a ghost row that says only they see it', () => {
  const host = document.createElement('div');
  render(entryRow(entry(2, 'Ada', 300, true), { format: 'points', you: 'You', lang: 'en-US', youMode: 'replace', onlyYou: 'Only you see this' }), host);
  expect(host.querySelector('.lr')!.classList.contains('ghost')).to.equal(true);
  expect(host.textContent).to.contain('Only you see this');
});

it('makes the short board the top three when the viewer is in it, renumbered as the viewer sees it', () => {
  const rows = shortBoardRows(board([entry(1, 'Grace', 500), entry(2, 'Bram', 450), entry(3, 'Noor', 290)], entry(1, 'Ada', 600, true)));
  expect(rows.map((r) => (r === 'gap' ? 'gap' : `${r.rank}:${r.displayName}`))).to.deep.equal(['1:Ada', '2:Grace', '3:Bram']);
});

it('makes the short board the leader, the one above and the viewer when the viewer is further down', () => {
  const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, `P${i + 1}`, 1000 - i));
  const rows = shortBoardRows(board(top, entry(12, 'Ada', 5, true), entry(11, 'P11', 10)));
  expect(rows.map((r) => (r === 'gap' ? 'gap' : `${r.rank}:${r.displayName}`))).to.deep.equal(['1:P1', 'gap', '11:P11', '12:Ada']);
});
```

- [ ] **Step 2: Run, expect failure.** Cannot resolve `./parts.js`.

- [ ] **Step 3: Write `parts.ts`.**

```ts
import { html, nothing } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { formatScore } from '../shared/format.js';

/** The crown for first place, from the mock. */
export const CROWN_PATH = 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8zm2.2 13h13.6v1.6H5.2z';

/** The trophy, the Arcade's own mark, from the mock. */
export const TROPHY_PATH =
  'M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1 1.7V7zm10 0v2.7A2 2 0 0 0 18 8V7h-1z';

/**
 * A one-path icon, decorative: every place that draws one says the same thing in words beside it.
 * @param path The path data.
 * @param className Its class, which sizes and colours it.
 * @returns The icon.
 */
export const icon = (path: string, className: string): TemplateResult =>
  html`<svg class=${className} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d=${path}></path></svg>`;

/**
 * Initials for an avatar: first and last word, so "Anna de Vries" is AV. Avatars beyond initials are
 * out of scope (design §5).
 * @param name The display name.
 * @returns One or two letters, or `?` for a blank name.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words[words.length - 1]][0] : '';
  return `${first}${last}`.toLocaleUpperCase();
}

/** How many avatar colours `look.ts` defines (`.av` and `.a1` to `.a4`). */
export const AVATAR_HUES = 5;

/**
 * A player's avatar colour, from their key rather than their name, so a renamed player keeps it.
 * @param key The user key.
 * @returns 0 to {@link AVATAR_HUES} - 1.
 */
export function avatarHue(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % AVATAR_HUES;
}

/**
 * Which medal a rank gets: gold, silver, bronze, or plain.
 * @param rank The rank.
 * @returns The class.
 */
export function medalKind(rank: number): 'g' | 's' | 'b' | 'p' {
  return rank === 1 ? 'g' : rank === 2 ? 's' : rank === 3 ? 'b' : 'p';
}

/**
 * A rank as a medal. The number is the text, so a screen reader reads the rank.
 * @param rank The rank.
 * @returns The medal.
 */
export const medal = (rank: number): TemplateResult => html`<span class="medal ${medalKind(rank)}">${rank}</span>`;

/**
 * A player's avatar.
 * @param entry The row.
 * @returns The avatar.
 */
export const avatar = (entry: Pick<ArcadeBoardEntry, 'userKey' | 'displayName' | 'isViewer'>): TemplateResult => {
  const hue = avatarHue(entry.userKey);
  return html`<span class="av ${hue ? `a${hue}` : ''} ${entry.isViewer ? 'self' : ''}" aria-hidden="true">${initials(entry.displayName)}</span>`;
};

/** How a row is drawn. */
export interface RowOptions {
  /** The board's format. */
  format: 'points' | 'time';
  /** The word for the viewer: "You". */
  you: string;
  /** The backoffice language, for the digits. */
  lang: string;
  /** `replace` writes "You" for the viewer's name (card, panel); `mark` keeps the name and adds "You" (hub). */
  youMode: 'replace' | 'mark';
  /** When set, the viewer's row is a ghost row saying this: their scores are hidden. */
  onlyYou?: string;
  /** The date column, already formatted; none when omitted. */
  date?: string;
  /** Anything after the score: the hub's admin menu, or nothing. */
  extra?: TemplateResult | typeof nothing;
  /** An extra class on the row, for a piece's own rules (the panel hides podium ranks from its full-form list). */
  className?: string;
}

/**
 * One leaderboard row: medal, avatar, name, a crown for first, the score, and optionally the date.
 * @param entry The row.
 * @param options How to draw it.
 * @returns The row, as a list item.
 */
export function entryRow(entry: ArcadeBoardEntry, options: RowOptions): TemplateResult {
  const mine = entry.isViewer;
  const ghost = mine && options.onlyYou !== undefined;
  const name = mine && options.youMode === 'replace' ? options.you : entry.displayName;
  return html`<li class="lr ${mine ? 'mine' : ''} ${ghost ? 'ghost' : ''} ${options.className ?? ''}" data-rank=${entry.rank}>
    ${medal(entry.rank)}
    <span class="name">
      ${avatar(entry)}<span class="who">${name}</span>
      ${mine && options.youMode === 'mark' ? html`<span class="you">${options.you}</span>` : nothing}
      ${ghost ? html`<span class="only">${options.onlyYou}</span>` : nothing}
    </span>
    ${entry.rank === 1 ? icon(CROWN_PATH, 'crown') : nothing}
    <span class="sc">${formatScore(options.format, entry.value, options.lang)}</span>
    ${options.date ? html`<span class="dt">${options.date}</span>` : nothing}
    ${options.extra ?? nothing}
  </li>`;
}

/**
 * The podium: the top three standing second, first, third, as podiums do. Fewer than three leave
 * their step empty rather than closing the gap, so first is always in the middle.
 * @param top The first three rows, in rank order.
 * @param options The format, the word for the viewer and the language; `extra` draws something under
 *   each entry's score, which the hub uses for a moderator's menu, since the top three stand here
 *   rather than in the list.
 * @returns The podium.
 */
export function podium(
  top: ReadonlyArray<ArcadeBoardEntry>,
  options: Pick<RowOptions, 'format' | 'you' | 'lang'> & { extra?: (entry: ArcadeBoardEntry) => TemplateResult | typeof nothing },
): TemplateResult {
  const order = [top[1], top[0], top[2]];
  return html`<div class="podium">
    ${order.map((entry) =>
      entry
        ? html`<div class="pod ${entry.isViewer ? 'mine' : ''}" data-rank=${entry.rank}>
            ${entry.rank === 1 ? icon(CROWN_PATH, 'crown') : nothing}
            ${avatar(entry)}
            <span class="pn">${entry.isViewer ? options.you : entry.displayName}</span>
            <span class="ps">${formatScore(options.format, entry.value, options.lang)}</span>
            ${options.extra?.(entry) ?? nothing}
            <div class="step s${entry.rank}">${entry.rank}</div>
          </div>`
        : html`<div class="pod empty"></div>`,
    )}
  </div>`;
}

/**
 * The full card's short board of three (settled point 2): ranks 1 to 3 when the viewer is in the top
 * three, otherwise the leader, the player directly above, and the viewer, with a gap marker when
 * those are not neighbours.
 *
 * `top` is ranked without a hidden viewer, so when the viewer is merged in, the rows are renumbered by
 * position: that is the board as the viewer sees it, which is the rank the card states.
 * @param board The board read.
 * @returns Up to three rows and at most one gap marker.
 */
export function shortBoardRows(board: ArcadeBoard): Array<ArcadeBoardEntry | 'gap'> {
  const viewer = board.viewer;
  const others = board.top.filter((entry) => !entry.isViewer);
  if (!viewer) return board.top.slice(0, 3);
  if (viewer.rank <= 3) {
    const merged = [...others];
    merged.splice(viewer.rank - 1, 0, viewer);
    return merged.slice(0, 3).map((entry, index) => ({ ...entry, rank: index + 1 }));
  }
  const rows: Array<ArcadeBoardEntry | 'gap'> = [];
  const leader = others[0];
  if (leader) rows.push(leader);
  const above = board.above;
  if (above && above.rank !== leader?.rank) {
    if (above.rank > 2) rows.push('gap');
    rows.push(above);
  }
  rows.push(viewer);
  return rows;
}
```

- [ ] **Step 4: Run, expect pass.** Then `npm run build` from `A`.

### Task 10: The context: a submit for games that show a card, the mode last played, standing

**Files:**
- Modify: `A/backoffice/src/context/arcade.context.ts`
- Create: `A/backoffice/src/context/arcade.context.pieces.test.ts`

Design §4, "Submitting": a game that shows a card says so, and the context then raises neither the
privacy dialog nor the best toast, and hands back the result. The card needs to find its board and
say the rank in words, so the result carries the game, the board, the value and `rankText`.

- [ ] **Step 1: Write the failing tests.** Create `arcade.context.pieces.test.ts`:

```ts
import { expect, fixture, html } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { ArcadeApi, ArcadeBoard, ArcadeSubmitResult } from '../api/arcade-api.js';
import { UmbraDesktopArcadeContext } from './arcade.context.js';

/** Hosts the context, as the desktop element does. */
@customElement('umbradesktop-arcade-pieces-test-host')
class TestHost extends UmbLitElement {}

const game = {
  type: 'umbraDesktopGame', alias: 'Pkg.Snake.Game', name: 'Snake scores',
  meta: { app: 'Pkg.Snake', label: 'Snake', leaderboards: [{ alias: 'default', label: 'Classic', better: 'higher', format: 'points' }, { alias: 'fast', label: 'Fast', better: 'higher', format: 'points' }] },
};

const accepted = (over: Partial<Extract<ArcadeSubmitResult, { status: 'accepted' }>> = {}): ArcadeSubmitResult => ({
  status: 'accepted', isPersonalBest: true, previousBest: null, rank: 3, isPublic: false, askedAboutPublic: false, displayName: 'Ada', passed: null, ...over,
});

/** Builds a context over fakes and in-memory storage; records what it asked, toasted and saved. */
async function setup(submit: ArcadeSubmitResult, board?: ArcadeBoard) {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-pieces-test-host></umbradesktop-arcade-pieces-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  registry.register(game as unknown as UmbExtensionManifest);
  const calls: string[] = [];
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, value) } as Storage;
  const api: ArcadeApi = {
    getProfile: async () => undefined,
    updateProfile: async (patch) => { calls.push(`update:${JSON.stringify(patch)}`); return { displayName: 'Ada', isPublic: patch.isPublic ?? false, notifyWhenBeaten: true, askedAboutPublic: true }; },
    deleteProfile: async () => true,
    submit: async () => submit,
    getBoard: async () => board,
    getOverview: async () => ({ colleagues: 2, boards: [] }),
    getBest: async () => null,
    takeBeaten: async () => [],
    removeScore: async () => true,
    resetBoard: async () => true,
    resetName: async () => true,
  };
  const asked: string[] = [];
  const toasts: string[] = [];
  const context = new UmbraDesktopArcadeContext(host, {
    api,
    registry: registry as never,
    askPrivacy: async (_host, name) => { asked.push(name); return { isPublic: true, displayName: name }; },
    toast: (_host, _color, message) => { toasts.push(message); },
    storage: () => storage,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { context, calls, asked, toasts, memory };
}

it('leaves the asking and the toast to a game that shows the result card, and hands back what the card needs', async () => {
  const { context, asked, toasts } = await setup(accepted());
  const result = await context.submit('Pkg.Snake.Game', 'default', 310, { showsResult: true });
  expect(asked).to.deep.equal([]);
  expect(toasts).to.deep.equal([]);
  expect(result).to.include({ status: 'accepted', game: 'Pkg.Snake.Game', board: 'default', value: 310, rank: 3, rankText: '3rd' });
});

it('still asks and toasts for a game that shows no card (design P3)', async () => {
  const { context, asked, toasts } = await setup(accepted());
  await context.submit('Pkg.Snake.Game', 'default', 310);
  expect(asked).to.have.length(1);
  expect(toasts).to.have.length(1);
});

it('remembers the board last played per game', async () => {
  const { context } = await setup(accepted());
  expect(context.lastBoard('Pkg.Snake.Game')).to.equal(undefined);
  await context.submit('Pkg.Snake.Game', 'fast', 310, { showsResult: true });
  expect(context.lastBoard('Pkg.Snake.Game')).to.equal('fast');
});

it('saves the answer from a card, and a later fallback submit does not ask again', async () => {
  const { context, calls, asked } = await setup(accepted());
  expect(await context.setScoresShown(true)).to.equal(true);
  expect(calls).to.include('update:{"isPublic":true}');
  await context.submit('Pkg.Snake.Game', 'default', 310);
  expect(asked).to.deep.equal([]);
});

it('reads a standing for a game\'s own display, with the rank in words', async () => {
  const viewer = { rank: 1, userKey: 'k', displayName: 'Ada', value: 480, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer: true };
  const played = await setup(accepted(), { played: true, top: [viewer], viewer, viewerIsPublic: true, canModerate: false, players: 1, above: null });
  expect(await played.context.getStanding('Pkg.Snake.Game', 'default')).to.deep.equal({ best: 480, rank: 1, rankText: '1st' });
  const unplayed = await setup(accepted(), { played: false, top: [], viewer: null, viewerIsPublic: false, canModerate: false, players: 0, above: null });
  expect(await unplayed.context.getStanding('Pkg.Snake.Game', 'default')).to.equal(null);
  const unreachable = await setup(accepted());
  expect(await unreachable.context.getStanding('Pkg.Snake.Game', 'default')).to.equal(undefined);
});

it('passes the overview through', async () => {
  const { context } = await setup(accepted());
  expect(await context.getOverview()).to.deep.equal({ colleagues: 2, boards: [] });
});
```

- [ ] **Step 2: Run, expect failure.** `submit` ignores options (asked has one entry), `lastBoard`,
  `setScoresShown`, `getStanding`, `getOverview` are not functions.

- [ ] **Step 3: Implement.** In `arcade.context.ts`:

  Imports: add `import type { ArcadeOverview } from '../api/arcade-api.js';` (extend the existing type
  import) and `import { rankText } from '../shared/phrases.js';`.

  Add to `ArcadeContextDeps`:

```ts
  /** Where the board last played per game is kept; a function so a locked-down browser's throwing storage is caught. */
  storage: () => Storage;
```

  and in the constructor's deps object: `storage: deps.storage ?? (() => window.localStorage),`.

  Add these exported types after `GAMES_WAIT_MS`:

```ts
/** What a game may say when it submits. Published API for games, only ever gains optional fields. */
export interface ArcadeSubmitOptions {
  /**
   * The game shows the Arcade's result card for this score, so the Arcade raises neither the
   * privacy dialog nor the "New best" toast: the card asks and celebrates instead (design P3, P13).
   */
  showsResult?: boolean;
}

/** An accepted submit as the game gets it: the server's answer plus what the result card needs. */
export type ArcadeGameResult = Extract<ArcadeSubmitResult, { status: 'accepted' }> & {
  /** The game's `umbraDesktopGame` alias. */
  game: string;
  /** The board's alias. */
  board: string;
  /** The value submitted. */
  value: number;
  /** The rank in words, in the backoffice language: "3rd". A game cannot import the Arcade's ordinals. */
  rankText: string;
};

/** What `submit` answers: an accepted result, or why not. */
export type ArcadeSubmitAnswer = ArcadeGameResult | Exclude<ArcadeSubmitResult, { status: 'accepted' }>;

/** A player's standing on one board, for a game's own display (Snake's Best chip, design P5). */
export interface ArcadeStanding {
  /** Their best. */
  best: number;
  /** Their rank, or would-be rank while hidden. */
  rank: number;
  /** The rank in words. */
  rankText: string;
}

/** Where the board last played per game is kept, as one JSON object of game alias to board alias. */
const LAST_BOARD_KEY = 'umbradesktop-arcade-last-board';
```

  Replace `submit` (keep its doc, add the new parameter's) with:

```ts
  async submit(game: string, board: string, value: number, options: ArcadeSubmitOptions = {}): Promise<ArcadeSubmitAnswer | undefined> {
    const found = this.getGames().find((g) => g.alias === game);
    const definition = found?.leaderboards.find((b) => b.alias === board);
    if (!found || !definition) {
      console.warn(`[UmbraDesktop Arcade] A score for "${game}" / "${board}" was ignored: no umbraDesktopGame manifest declares that board.`);
      return undefined;
    }
    const result = await this.#deps.api.submit(game, definition, value);
    if (result.status !== 'accepted') return result;
    this.#rememberBoard(game, board);
    const answer: ArcadeGameResult = { ...result, game, board, value, rankText: rankText(this.#localize, result.rank) };
    // The card asks and celebrates, so the Arcade does neither (design P3, P13).
    if (options.showsResult) return answer;

    let isPublic = result.isPublic;
    if (!result.askedAboutPublic && !this.#destroyed) {
      if (this.#answered) {
        // A stale result: the answer is already in, so use it rather than ask again.
        isPublic = this.#profile.getValue()?.isPublic ?? isPublic;
      } else {
        const saved = await this.#askOnce(result.displayName);
        if (saved) isPublic = saved.isPublic;
      }
    }

    if (result.isPersonalBest) {
      const name = this.#gameName(found, definition.alias);
      const score = formatScore(definition.format, value);
      const message = isPublic
        ? this.#localize.termOrDefault(`${AREA}_newBestRanked`, `New best on ${name}: ${score}, number ${result.rank}`, name, score, result.rank)
        : this.#localize.termOrDefault(`${AREA}_newBest`, `New best on ${name}: ${score}`, name, score);
      this.#toast('positive', message);
    }
    return { ...answer, isPublic };
  }

  /**
   * The board the player last submitted to in a game, so a game page and a panel opened without one
   * open on it (design P12). Kept in this browser only: it is a convenience, not data.
   * @param game The game's alias.
   * @returns The board's alias, or undefined when none is remembered.
   */
  lastBoard(game: string): string | undefined {
    try {
      const stored = JSON.parse(this.#deps.storage().getItem(LAST_BOARD_KEY) ?? '{}') as Record<string, unknown>;
      const board = stored?.[game];
      return typeof board === 'string' ? board : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Save the answer to "show your scores?" from a result card, or the quiet line's "Show them"
   * (design P7). Marks the question answered for this visit, as the dialog's answer does.
   * @param shown Whether to show the player's scores.
   * @returns Whether it saved.
   */
  async setScoresShown(shown: boolean): Promise<boolean> {
    const saved = await this.#deps.api.updateProfile({ isPublic: shown });
    if (!saved) return false;
    this.#profile.setValue(saved);
    this.#answered = true;
    return true;
  }

  /**
   * The player's standing on a board, for a game's own display.
   * @param game The game's alias.
   * @param board The board's alias.
   * @returns The standing, null when they have not played it, undefined when the server is unreachable.
   */
  async getStanding(game: string, board: string): Promise<ArcadeStanding | null | undefined> {
    const data = await this.#deps.api.getBoard(game, board);
    if (!data) return undefined;
    if (!data.viewer) return null;
    return { best: data.viewer.value, rank: data.viewer.rank, rankText: rankText(this.#localize, data.viewer.rank) };
  }

  /** The hub's overview. @returns Every board as the player sees it, or undefined when unreachable. */
  getOverview(): Promise<ArcadeOverview | undefined> {
    return this.#deps.api.getOverview();
  }

  /**
   * Remember the board just played. Never throws: a browser that refuses storage just forgets.
   * @param game The game's alias.
   * @param board The board's alias.
   */
  #rememberBoard(game: string, board: string): void {
    try {
      const storage = this.#deps.storage();
      const parsed: unknown = JSON.parse(storage.getItem(LAST_BOARD_KEY) ?? '{}');
      const stored = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
      storage.setItem(LAST_BOARD_KEY, JSON.stringify({ ...stored, [game]: board }));
    } catch {
      // A convenience only.
    }
  }
```

- [ ] **Step 4: Run, expect pass.** The new file and the old `arcade.context.test.ts` (its submits pass
  no options, so they still ask and toast). Then `npm test` and `npm run build` from `A`.

### Task 11: The context shows a board in the hub

**Files:**
- Create: `A/backoffice/src/shared/windows.ts`
- Modify: `A/backoffice/src/hub/constants.ts`, `A/backoffice/src/bundle.manifests.ts`
- Modify: `A/backoffice/src/context/arcade.context.ts`
- Create: `A/backoffice/src/context/arcade.context.hub.test.ts`

Design §4, last bullet: the panel's "Open in the Arcade" and the beaten toast go through the context,
which remembers the request and opens the hub with the host's `openApp`; the hub reads the request
on open and observes it while open (Task 16). No host change.

- [ ] **Step 1: Write the failing tests.** Create `arcade.context.hub.test.ts`:

```ts
import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { ARCADE_HUB_ALIAS } from '../hub/constants.js';
import type { ArcadeHubRequest } from './arcade.context.js';
import { UmbraDesktopArcadeContext } from './arcade.context.js';

/** Hosts the context and provides the window manager on the same element, as the desktop element does. */
@customElement('umbradesktop-arcade-hub-request-test-host')
class TestHost extends UmbLitElement {}

/** A context on a host that may or may not provide a window manager answering `openApp` with `opens`. */
async function setup(windowManager: boolean, opens = true) {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-hub-request-test-host></umbradesktop-arcade-hub-request-test-host>`);
  const opened: string[] = [];
  if (windowManager) {
    host.provideContext(new UmbContextToken<UmbContextMinimal>('UmbraDesktopWindowManagerContext'), {
      getHostElement: () => host,
      openApp: (alias: string) => { opened.push(alias); return opens; },
    } as never);
  }
  const context = new UmbraDesktopArcadeContext(host, {
    api: { takeBeaten: async () => [] } as never,
    registry: new UmbExtensionRegistry<UmbExtensionManifest>() as never,
    storage: () => ({ getItem: () => null, setItem: () => undefined }) as unknown as Storage,
  });
  const requests: Array<ArcadeHubRequest | undefined> = [];
  context.hubRequest.subscribe((request) => requests.push(request));
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { context, opened, requests };
}

it('records the board to show and opens the hub, finding the window manager on its own host', async () => {
  const { context, opened, requests } = await setup(true);
  expect(context.showBoard('Pkg.Snake.Game', 'default')).to.equal(true);
  expect(opened).to.deep.equal([ARCADE_HUB_ALIAS]);
  expect(requests.at(-1)).to.deep.equal({ game: 'Pkg.Snake.Game', board: 'default' });
});

it('forgets a request once the hub has taken it', async () => {
  const { context, requests } = await setup(true);
  context.showBoard('Pkg.Snake.Game');
  context.clearHubRequest();
  expect(requests.at(-1)).to.equal(undefined);
});

it('keeps no request when the hub cannot be opened', async () => {
  const refused = await setup(true, false);
  expect(refused.context.showBoard('Pkg.Snake.Game')).to.equal(false);
  expect(refused.requests.at(-1)).to.equal(undefined);
  const alone = await setup(false);
  expect(alone.context.showBoard('Pkg.Snake.Game')).to.equal(false);
  expect(alone.requests.at(-1)).to.equal(undefined);
});
```

- [ ] **Step 2: Run, expect failure.** `ARCADE_HUB_ALIAS` is not exported; `showBoard` is not a function.

- [ ] **Step 3: The shared token and the alias.** Create `shared/windows.ts`:

```ts
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

/** The one window-manager member the Arcade uses, published by the host (`docs/developer/desktop-contexts.md`). */
export interface DesktopWindows extends UmbContextMinimal {
  /** Open an app by alias, as the launcher would. @param alias The app. @returns Whether it opened or focused a window. */
  openApp(alias: string): boolean;
}

/** The host's window manager, by its published alias; nothing is imported from the host. */
export const DESKTOP_WINDOWS = new UmbContextToken<DesktopWindows>('UmbraDesktopWindowManagerContext');
```

  In `hub/constants.ts` add:

```ts
/** The hub's app alias. Final once shipped: pins and saved window layouts hang off it. */
export const ARCADE_HUB_ALIAS = 'Umbraco.Community.UmbraDesktop.Services.Arcade.Hub';
```

  In `bundle.manifests.ts`, import it and use `alias: ARCADE_HUB_ALIAS` for the hub (same value).

- [ ] **Step 4: The context.** In `arcade.context.ts`:
  - Import `DESKTOP_WINDOWS` and `type DesktopWindows` from `'../shared/windows.js'`, and
    `ARCADE_HUB_ALIAS` from `'../hub/constants.js'`.
  - Export the request type after `ArcadeStanding`:

```ts
/** A board the hub should show when it opens, or now if it is open (design §4). */
export interface ArcadeHubRequest {
  /** The game's alias. */
  game: string;
  /** The board's alias; the game's page picks the mode last played without one. */
  board?: string;
}
```

  - Fields, after `#cancelGamesWait`:

```ts
  /** The window manager, for opening the hub. Found on the desktop element, which hosts this context and provides it. */
  #windows?: DesktopWindows;

  /** The board the hub should show next, until the hub takes it. */
  readonly #hubRequest = new UmbObjectState<ArcadeHubRequest | undefined>(undefined);

  /** The board the hub should show next, as the hub observes it. */
  readonly hubRequest = this.#hubRequest.asObservable();
```

  - In the constructor, before `void this.#announceBeaten();`:
    `this.consumeContext(DESKTOP_WINDOWS, (windows) => (this.#windows = windows));`
    A consumer on the desktop element finds a provider on that same element: confirm in the installed
    `libs/context-api/consume/context-consumer.js` (the request is dispatched from the host element)
    and `provide/context-provider.js` (the provider listens on its host). The first test proves it.
  - Methods, after `getOverview`:

```ts
  /**
   * Show a board in the hub: remember it, then open the hub, which takes the request when it opens or
   * at once if it is open already (design §4). Used by the panel's "Open in the Arcade" and the beaten
   * toast. Nothing is kept when the hub cannot be opened, so a later visit does not jump to it.
   * @param game The game's alias.
   * @param board The board's alias, or none for the mode last played.
   * @returns Whether the hub opened.
   */
  showBoard(game: string, board?: string): boolean {
    if (this.#destroyed) return false;
    this.#hubRequest.setValue({ game, board });
    const opened = this.#windows?.openApp(ARCADE_HUB_ALIAS) ?? false;
    if (!opened) this.#hubRequest.setValue(undefined);
    return opened;
  }

  /** The hub has shown the requested board; forget it. */
  clearHubRequest(): void {
    this.#hubRequest.setValue(undefined);
  }
```

- [ ] **Step 5: Run, expect pass.** Then `npm test` and `npm run build` from `A`.

### Task 12: The beaten toast names both scores and opens the board when selected

**Files:**
- Create: `A/backoffice/src/context/active-arcade.ts`
- Create: `A/backoffice/src/context/beaten-toast.element.ts`, test `beaten-toast.element.test.ts`
- Modify: `A/backoffice/src/context/arcade.context.ts`, `A/backoffice/src/context/arcade.context.test.ts`

Design P13: "Bram took first place from you on Snake. 510 beats your 480. You are 2nd now.", and
selecting it opens the hub on that board. How the desktop handles toasts decides how (settled point
11), all confirmed in this repository and in 17.7.0:

- Core's `UmbNotificationHandler` constructor (`packages/core/notification/notification-handler.js`)
  creates the layout element synchronously with `document.createElement(elementName)`, then sets
  `element.data` and `element.notificationHandler`. `peek` builds the handler synchronously.
- The desktop hides core's toasts and draws its own from the handler's `data.headline` and
  `data.message` (`H/backoffice/src/desktop/notifications/read-handler.ts`), keeping an element name
  and a JSON copy of its data when the layout is not core's default.
- Selecting a desktop toast or its scrollback entry calls `activate`
  (`notifications/notification-centre.context.ts`), which raises the notification again in its source
  document through the watcher's `reraise` (`notification-watcher.ts`): a second `peek` with the same
  element name and the copied data, which the desktop lets through visibly.
- That second element renders in core's toast container in the shell, outside the desktop element,
  so it cannot consume the Arcade's context. It reaches it through a module the context registers
  itself in, which is the same JavaScript realm.

So the element knows which instance it is from a flag the context sets around its own `peek`: the
original (hidden by the desktop) does nothing; the re-raise is the player's click, and opens the board.

- [ ] **Step 1: Write the failing tests.** Create `beaten-toast.element.test.ts`:

```ts
import { expect, waitUntil } from '@open-wc/testing';
import { clearActiveArcade, setActiveArcade, whileRaising } from './active-arcade.js';
import { ARCADE_BEATEN_TOAST_ELEMENT } from './beaten-toast.element.js';
import type { UmbraDesktopArcadeBeatenToastElement } from './beaten-toast.element.js';

const data = { headline: 'Bram took first place from you on Snake', message: '510 beats your 480. You are 2nd now.', game: 'Pkg.Snake.Game', board: 'default' };

/** The stand-in registered by the current test, cleared after each so no test sees another's. */
let registered: { showBoard(game: string, board?: string): boolean } | undefined;
afterEach(() => {
  if (registered) clearActiveArcade(registered);
  registered = undefined;
});

/** A stand-in for the Arcade context, recording what it was asked to show. */
function fakeArcade(opens = true) {
  const shown: string[] = [];
  registered = { showBoard: (game: string, board?: string) => { shown.push(`${game}:${board}`); return opens; } };
  setActiveArcade(registered);
  return shown;
}

/** Build the element the way core's notification handler does: create, then set data and handler. */
function build(raisedByArcade: boolean) {
  const closed: string[] = [];
  const toast = document.createElement('div');
  const create = () => document.createElement(ARCADE_BEATEN_TOAST_ELEMENT) as UmbraDesktopArcadeBeatenToastElement;
  const element = raisedByArcade ? whileRaising(create) : create();
  element.data = data;
  element.notificationHandler = { close: () => closed.push('closed'), element: toast };
  toast.append(element);
  document.body.append(toast);
  after(() => toast.remove());
  return { element, closed, toast };
}

it('does nothing as the Arcade\'s own toast, which the desktop hides and draws itself', async () => {
  const shown = fakeArcade();
  build(true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(shown).to.deep.equal([]);
});

it('opens the board and closes itself when the desktop raises it again because the player selected it', async () => {
  const shown = fakeArcade();
  const { closed, toast } = build(false);
  await waitUntil(() => shown.length === 1, 'board shown');
  expect(shown).to.deep.equal(['Pkg.Snake.Game:default']);
  expect(closed).to.deep.equal(['closed']);
  expect(toast.hasAttribute('hidden')).to.equal(true);
});

it('stays readable, with its link, when there is no Arcade to open', async () => {
  const { element, closed } = build(false);
  await element.updateComplete;
  expect(element.shadowRoot!.textContent).to.contain('Bram took first place').and.contain('You are 2nd now');
  expect(element.shadowRoot!.querySelector('[data-action="open"]')).to.not.equal(null);
  expect(closed).to.deep.equal([]);
});
```

  In `arcade.context.test.ts`, find the beaten tests (search `takeBeaten` / `beaten`). Keep what each
  proves (once per visit, the game's name rather than its alias, waiting for games). Change the fake
  API's `getBoard` to answer `{ played: true, top: [], viewer: { rank: 2, userKey: 'k', displayName: 'Ada', value: 480, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer: true }, viewerIsPublic: true, canModerate: false, players: 3, above: null }`,
  make the beaten event `{ game: 'Pkg.Snake.Game', board: 'default', byDisplayName: 'Bram', value: 510, format: 'points' }`,
  have the `toast` fake record its fourth argument, and assert:

```ts
  expect(toasts[0].color).to.equal('warning');
  expect(toasts[0].message).to.contain('510 beats your 480').and.contain('You are 2nd now');
  expect(toasts[0].element?.name).to.equal('umbradesktop-arcade-beaten-toast');
  expect(toasts[0].element?.data).to.deep.include({ headline: 'Bram took first place from you on Snake', game: 'Pkg.Snake.Game', board: 'default' });
```

  Add one test where `getBoard` answers `undefined` (the player has since deleted their scores): the
  message is `'With 510. Select to open the leaderboard.'`.

- [ ] **Step 2: Run, expect failure.** The new modules do not exist; the context still raises the old message.

- [ ] **Step 3: The realm-wide link.** Create `context/active-arcade.ts`:

```ts
/**
 * The Arcade context on this page, for the one Arcade element that renders outside the desktop: the
 * beaten toast, which core puts in its toast container in the shell, where no desktop context can be
 * consumed. Same JavaScript realm, so a module-level reference is enough. The context sets it when it
 * is created and clears it when destroyed.
 */

/** What the toast needs of the Arcade. */
export interface ArcadeForToast {
  /** Show a board in the hub. @param game The game. @param board The board. @returns Whether the hub opened. */
  showBoard(game: string, board?: string): boolean;
}

/** The live Arcade context, or undefined while the desktop is closed. */
let active: ArcadeForToast | undefined;

/** True only while the Arcade itself is raising a toast. */
let raising = false;

/** Register the Arcade context. @param arcade The context. */
export function setActiveArcade(arcade: ArcadeForToast): void {
  active = arcade;
}

/** Unregister it, if it is still the one registered. @param arcade The context. */
export function clearActiveArcade(arcade: ArcadeForToast): void {
  if (active === arcade) active = undefined;
}

/** @returns The live Arcade context, if any. */
export function activeArcade(): ArcadeForToast | undefined {
  return active;
}

/**
 * Run something with the "the Arcade is raising this" flag set. Core builds a toast's element
 * synchronously inside `peek`, so an element constructed while this runs is the Arcade's own; one
 * constructed at any other time is the desktop raising it again because the player selected it.
 * @param run The work, which must be synchronous.
 * @returns What it returns.
 */
export function whileRaising<T>(run: () => T): T {
  raising = true;
  try {
    return run();
  } finally {
    raising = false;
  }
}

/** @returns Whether the Arcade is raising a toast right now. */
export function isRaising(): boolean {
  return raising;
}
```

- [ ] **Step 4: The element.** Create `context/beaten-toast.element.ts`:

```ts
import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { ensureArcadeFont } from '../pieces/font.js';
import { arcadeLook, arcadeTheme } from '../pieces/look.js';
import { CROWN_PATH, icon } from '../pieces/parts.js';
import { say } from '../shared/phrases.js';
import { activeArcade, isRaising } from './active-arcade.js';

/** The tag core creates for the beaten toast. Internal: only the Arcade raises it. */
export const ARCADE_BEATEN_TOAST_ELEMENT = 'umbradesktop-arcade-beaten-toast';

/** What the toast carries. Plain data, because the desktop keeps a JSON copy to raise it again later. */
export interface ArcadeBeatenToastData {
  /** "Bram took first place from you on Snake"; also what the desktop's own toast shows. */
  headline: string;
  /** "510 beats your 480. You are 2nd now. Select to open the leaderboard." */
  message: string;
  /** The game's alias. */
  game: string;
  /** The board's alias. */
  board: string;
}

/** The part of core's notification handler this uses. */
interface ToastHandler {
  /** Close the toast. */
  close(): void;
  /** Core's toast element around this one. */
  element?: HTMLElement;
}

/**
 * The beaten toast's own element (design P13, settled point 11). Two instances exist per click:
 *
 * - the Arcade's own, which the desktop hides and replaces with its own toast, drawn from `headline`
 *   and `message`, so it does nothing;
 * - the one the desktop raises again in this document when the player selects that toast or its
 *   entry in the notification list. That selection means "show me", so it asks the Arcade to show the
 *   board and closes itself at once, hidden first so it does not flash.
 *
 * If no Arcade answers (the desktop closed in between), it stays, drawn in the Arcade's look with a
 * link, so the message is still readable.
 */
@customElement(ARCADE_BEATEN_TOAST_ELEMENT)
export class UmbraDesktopArcadeBeatenToastElement extends UmbLitElement {
  /** Set by core's notification handler. */
  @property({ attribute: false })
  data?: ArcadeBeatenToastData;

  /** Set by core's notification handler. */
  @property({ attribute: false })
  notificationHandler?: ToastHandler;

  /** Whether the Arcade raised this one, read at construction, which core does inside `peek`. */
  readonly #original = isRaising();

  constructor() {
    super();
    ensureArcadeFont();
  }

  /** The re-raised instance acts on the player's click at once. */
  override connectedCallback(): void {
    super.connectedCallback();
    if (this.#original) return;
    if (this.#open()) this.#close();
  }

  /** @returns Whether the Arcade showed the board. */
  #open(): boolean {
    const data = this.data;
    return data ? (activeArcade()?.showBoard(data.game, data.board) ?? false) : false;
  }

  /** Hide core's toast before closing it, so its closing animation never shows. */
  #close(): void {
    this.notificationHandler?.element?.setAttribute('hidden', '');
    this.notificationHandler?.close();
  }

  /** @returns The toast, for when it stays. */
  override render() {
    const data = this.data;
    if (!data) return nothing;
    return html`<div class="toast felt surface">
      <span class="ti">${icon(CROWN_PATH, 'crown')}</span>
      <div>
        <b>${data.headline}</b>
        <p>${data.message}</p>
        <button class="link" data-action="open" @click=${() => this.#open() && this.#close()}>
          ${say(this.localize, 'beatenOpenLink', 'Open the leaderboard')} ›
        </button>
      </div>
    </div>`;
  }

  /** The mock's toast. */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      .toast { display: flex; gap: 12px; padding: 14px 16px; border-radius: var(--arcade-radius); max-width: 430px; }
      .ti { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; flex: none; background: color-mix(in srgb, var(--arcade-gold) 20%, transparent); }
      .ti .crown { width: 22px; height: 22px; }
      b { font-size: 14px; display: block; }
      p { margin: 2px 0 8px; font-size: 13px; color: var(--arcade-soft); }
      .link { font-size: 13px; }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-beaten-toast': UmbraDesktopArcadeBeatenToastElement;
  }
}
```

- [ ] **Step 5: The context raises it.** In `arcade.context.ts`:
  - Imports: `import { clearActiveArcade, setActiveArcade, whileRaising } from './active-arcade.js';`,
    `import { ARCADE_BEATEN_TOAST_ELEMENT } from './beaten-toast.element.js';` (this import also
    defines the element before any toast needs it), and `rankText, say, scoreText` from
    `'../shared/phrases.js'` (merge with the existing `rankText` import).
  - In `ArcadeContextDeps`, change `toast` to:

```ts
  /** Raise a toast on the desktop, where the notification centre picks it up; `element` gives it its own element and data. */
  toast(host: UmbControllerHost, color: 'positive' | 'warning', message: string, element?: { name: string; data: unknown }): void;
```

    and its default to `toast: deps.toast ?? ((_host, color, message, element) => void this.#peek(color, message, element)),`.
  - In the constructor, after the deps: `setActiveArcade(this);`. In `destroy()`, before
    `super.destroy()`: `clearActiveArcade(this);`.
  - `#toast(color, message, element?)` passes `element` through to `this.#deps.toast(...)`.
  - `#peek(color, message, element?)` raises inside the flag:

```ts
  async #peek(color: 'positive' | 'warning', message: string, element?: { name: string; data: unknown }): Promise<void> {
    try {
      const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);
      whileRaising(() =>
        notifications?.peek(color, element ? ({ elementName: element.name, data: element.data } as never) : { data: { message } }),
      );
    } catch {
      // No notification context (the desktop is gone, or not in a backoffice): the toast is a courtesy.
    }
  }
```

  - Replace the loop in `#announceBeaten` with:

```ts
    for (const event of events) {
      if (this.#destroyed) return;
      const game = this.getGames().find((g) => g.alias === event.game);
      const name = game ? this.#gameName(game, event.board) : event.game;
      const theirs = formatScore(event.format, event.value);
      const headline = say(this.#localize, 'beatenHeadline', '{0} took first place from you on {1}', event.byDisplayName, name);
      // The player's own row now, for "your 480" and "You are 2nd now". One read per event, and there
      // is at most one event per board.
      const viewer = (await this.#deps.api.getBoard(event.game, event.board))?.viewer;
      const open = say(this.#localize, 'beatenOpen', 'Select to open the leaderboard.');
      const message = viewer
        ? `${say(this.#localize, 'beatenScore', '{0} beats your {1}.', theirs, formatScore(event.format, viewer.value))} ${say(this.#localize, 'beatenRank', 'You are {0} now.', rankText(this.#localize, viewer.rank))} ${open}`
        : `${say(this.#localize, 'beatenWith', 'With {0}.', theirs)} ${open}`;
      this.#toast('warning', message, {
        name: ARCADE_BEATEN_TOAST_ELEMENT,
        data: { headline, message, game: event.game, board: event.board },
      });
    }
```

  Remove `scoreText` from the import if unused. Update the class doc and `#announceBeaten`'s doc:
  the toast is no longer "a plain warning toast whose click does nothing".

- [ ] **Step 6: Run, expect pass.** All context tests and the element test. Then `npm test` and
  `npm run build` from `A`. The real one-click behaviour is checked in Task 24, step 8.

### Task 13: The fallback question speaks the same words

**Files:**
- Modify: `A/backoffice/src/context/privacy-modal.element.ts`
- Test: `A/backoffice/src/context/privacy-modal.element.test.ts`

Design P3: a game that places neither piece still gets the dialog, "its text rewritten to the P8
vocabulary, with one sentence saying what the Arcade is". P9's neutral answers apply here too.

- [ ] **Step 1: Update the tests first.** In `privacy-modal.element.test.ts`, change every
  `[data-answer="public"]` to `[data-answer="show"]` and `[data-answer="private"]` to
  `[data-answer="hide"]`, and add:

```ts
it('offers two equal, neutral answers that say their consequence', async () => {
  // Mount the modal element as the existing tests in this file do, then:
  const show = el.shadowRoot!.querySelector('[data-answer="show"]')!;
  const hide = el.shadowRoot!.querySelector('[data-answer="hide"]')!;
  expect(show.getAttribute('look')).to.equal('outline');
  expect(hide.getAttribute('look')).to.equal('outline');
  expect(show.hasAttribute('color')).to.equal(false);
  expect(hide.hasAttribute('color')).to.equal(false);
  expect(show.getAttribute('label')).to.equal('Yes, show my scores');
  expect(hide.getAttribute('label')).to.equal('No, only I see them');
  expect(el.shadowRoot!.textContent).to.contain('The Arcade keeps');
});
```

  Use the file's existing mount helper for `el`.

- [ ] **Step 2: Run, expect failure.** The selectors find nothing.

- [ ] **Step 3: Rewrite `render`.** Import `say` from `'../shared/phrases.js'`, then:

```ts
  /** @returns The dialog. */
  override render() {
    const l = this.localize;
    const answerShow = say(l, 'answerShow', 'Yes, show my scores');
    const answerHide = say(l, 'answerHide', 'No, only I see them');
    return html`<uui-dialog-layout headline=${say(l, 'fallbackHeadline', 'Show your scores on the Arcade leaderboard?')}>
      <p>
        ${say(
          l,
          'fallbackText',
          "The Arcade keeps everyone's best scores in the desktop's games and ranks them on leaderboards. Show yours there, where colleagues can see them? You can change this in the Arcade at any time.",
        )}
      </p>
      <uui-label for="name">${say(l, 'leaderboardName', 'Your name on the leaderboards')}</uui-label>
      <uui-input
        id="name"
        label=${say(l, 'leaderboardName', 'Your name on the leaderboards')}
        .value=${this._name ?? this.data?.displayName ?? ''}
        maxlength="32"
        @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}></uui-input>
      <uui-button slot="actions" data-answer="hide" look="outline" label=${answerHide} @click=${() => this.#answer(false)}></uui-button>
      <uui-button slot="actions" data-answer="show" look="outline" label=${answerShow} @click=${() => this.#answer(true)}></uui-button>
    </uui-dialog-layout>`;
  }
```

  Update the class and token docs (`privacy-modal.token.ts`) to say this is the fallback for a game
  that shows no result card (design P3), and that the card asks for everyone else.

- [ ] **Step 4: Run, expect pass.** Then `npm test` and `npm run build` from `A`.

---

# Phase C: The two pieces

Both are published API (design P2): a game places them by tag name and imports nothing. Without the
Arcade the tag is unknown and renders nothing, so a game needs no check of its own; a game that sets
a property on it still works, because Lit sets properties on unknown elements too.

Both are overlays: each fills the nearest positioned ancestor (`position: absolute; inset: 0`) and is
its own query container, so "the box it is given" (P10) is exactly the box the game positions it in.
The developer page (Task 23) says so.

Both are defined by the Arcade context's module, which imports them (Task 14 step 5). The context
loads when the desktop opens, before any game can finish a round, and a tag a game rendered earlier
upgrades when it is defined.

### Task 14: The result card

**Files:**
- Move: `A/backoffice/src/hub/harness.test-helper.ts` to `A/backoffice/src/shared/harness.test-helper.ts` (and extend it)
- Create: `A/backoffice/src/pieces/result.element.ts`
- Test: `A/backoffice/src/pieces/result.element.test.ts`, `A/backoffice/src/pieces/result.layout.test.ts`
- Modify: `A/backoffice/src/context/arcade.context.ts` (import the pieces)

Design P2, P4 to P7, P9, P10, §4 "The card", §6 first bullet, and the mock's sections 4 to 6.

The card's moments, all from one `result` and one board read:

| Moment | Standing line | Ribbon | Below |
| --- | --- | --- | --- |
| Never answered (P7) | "That's 3rd of 12." plus the question | none | the two answers; no actions until answered |
| Shown, best, rank 1 | "past Bram's 450", or "1st of 9" when already leading | "First place" with crown | short board; Leaderboard ›, Play again |
| Shown, best | "3rd of 12" | "New best" | the same |
| Shown, not a best, leading | "Your best 480 still leads" | none | the same |
| Shown, not a best | "Your best 480 · 3rd of 12" | none | the same |
| Hidden | "would be 3rd", or "Your best 36.4 · would be 3rd" | "New best" when a best | the same, plus the quiet line |

Compact (P10): the number, the ribbon, the medal with the standing line, and "3.0 sec behind Bram"
when someone is above; no short board; the two answers stacked full width.

- [ ] **Step 1: Move and extend the harness.** `git mv A/backoffice/src/hub/harness.test-helper.ts A/backoffice/src/shared/harness.test-helper.ts`
  (a move is not a commit), and change the hub tests' imports to `'../shared/harness.test-helper.js'`.
  Then, in the moved file:

  Imports: add `UmbStringState` to the observable-api import, `ArcadeOverview` to the api type
  import, and `import type { ArcadeHubRequest } from '../context/arcade.context.js';`.

  Add to `ArcadeHarnessOptions`:

```ts
  /** What `getOverview` answers. */
  overview?: ArcadeOverview;
  /** The board last played, per game alias. */
  lastBoard?: Record<string, string>;
  /** The theme id a fake desktop settings context publishes; no settings context when undefined. */
  theme?: string;
  /** A request already waiting when the hub opens. */
  hubRequest?: ArcadeHubRequest;
```

  In `arcadeHarness`, before `const fake`, add:

```ts
  const theme = new UmbStringState(options.theme ?? '');
  const request = new UmbObjectState<ArcadeHubRequest | undefined>(options.hubRequest);
```

  and add these members to `fake`:

```ts
    getGames: () => games.getValue(),
    getOverview: async () => { calls.push('getOverview'); return options.overview; },
    setScoresShown: async (shown: boolean) => {
      calls.push(`shown:${shown}`);
      if (options.failWrites) return false;
      const before = profile.getValue();
      profile.setValue({ displayName: before?.displayName ?? 'Ada', notifyWhenBeaten: before?.notifyWhenBeaten ?? true, isPublic: shown, askedAboutPublic: true });
      return true;
    },
    lastBoard: (game: string) => options.lastBoard?.[game],
    showBoard: (game: string, board?: string) => { calls.push(`show:${game}:${board ?? ''}`); return true; },
    hubRequest: request.asObservable(),
    clearHubRequest: () => { calls.push('clearHubRequest'); request.setValue(undefined); },
```

  After the existing `provideContext` calls:

```ts
  if (options.theme !== undefined) {
    wrapper.provideContext(new UmbContextToken<UmbContextMinimal>('UmbraDesktopSettingsContext'), {
      getHostElement: () => wrapper,
      theme: theme.asObservable(),
    } as never);
  }
```

  and return `{ wrapper, calls, games, profile, theme, request }`.

- [ ] **Step 2: Write the failing tests.** Create `pieces/result.element.test.ts` for what the card
  says and does:

```ts
import { expect, fixture, html, oneEvent, waitUntil } from '@open-wc/testing';
import type { ArcadeBoard, ArcadeBoardEntry, ArcadeProfile } from '../api/arcade-api.js';
import type { ArcadeGameResult } from '../context/arcade.context.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import './result.element.js';
import type { UmbraDesktopArcadeResultElement } from './result.element.js';

const minesweeper = { alias: 'Pkg.Mines.Game', app: 'Pkg.Mines', label: 'Minesweeper', icon: 'icon-bomb', weight: 0, leaderboards: [{ alias: 'easy', label: 'Beginner', better: 'lower' as const, format: 'time' as const }] };
const snake = { alias: 'Pkg.Snake.Game', app: 'Pkg.Snake', label: 'Snake', icon: 'icon-game', weight: 0, leaderboards: [{ alias: 'default', label: 'Classic', better: 'higher' as const, format: 'points' as const }] };
const entry = (rank: number, name: string, value: number, isViewer = false): ArcadeBoardEntry => ({ rank, userKey: `k-${name}`, displayName: name, value, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer });
const result = (over: Partial<ArcadeGameResult> = {}): ArcadeGameResult => ({
  status: 'accepted', isPersonalBest: true, previousBest: 40_200, rank: 3, isPublic: true, askedAboutPublic: true, displayName: 'Luuk Peters', passed: null,
  game: 'Pkg.Mines.Game', board: 'easy', value: 38_100, rankText: '3rd', ...over,
});
const minesBoard: ArcadeBoard = {
  played: true, top: [entry(1, 'Anna', 31_800), entry(2, 'Bram', 35_000), entry(3, 'Luuk Peters', 38_100, true)],
  viewer: entry(3, 'Luuk Peters', 38_100, true), viewerIsPublic: true, canModerate: false, players: 12, above: entry(2, 'Bram', 35_000),
};
const shown: ArcadeProfile = { displayName: 'Luuk Peters', isPublic: true, notifyWhenBeaten: true, askedAboutPublic: true };

/** Mount the card in a positioned box of the given width, under a fake Arcade. */
async function mount(r: ArcadeGameResult, board: ArcadeBoard, width = 400, profile?: ArcadeProfile, games = [minesweeper, snake]) {
  const harness = await arcadeHarness({ games, board, profile });
  const box = await fixture<HTMLDivElement>(html`<div style="position:relative;width:${width}px;height:420px"></div>`, { parentNode: harness.wrapper });
  const card = document.createElement('umbradesktop-arcade-result') as UmbraDesktopArcadeResultElement;
  card.result = r;
  box.append(card);
  await waitUntil(() => card.shadowRoot?.querySelector('.card'), 'card drawn');
  return { card, root: card.shadowRoot!, ...harness };
}

it('shows the time, a New best ribbon, and the rank of the player count', async () => {
  const { root } = await mount(result(), minesBoard);
  await waitUntil(() => root.textContent!.includes('12'), 'count loaded');
  expect(root.querySelector('.big')!.textContent).to.contain('38.1');
  expect(root.querySelector('.ribbon')!.textContent).to.contain('New best');
  expect(root.querySelector('.meta')!.textContent).to.contain('3rd of 12');
  expect(root.querySelector('.kicker')!.textContent).to.equal('You won · Beginner');
});

it('gives first place the First place ribbon and names who was passed', async () => {
  const board: ArcadeBoard = { ...minesBoard, top: [entry(1, 'Luuk Peters', 30_000, true), entry(2, 'Anna', 31_800)], viewer: entry(1, 'Luuk Peters', 30_000, true), above: null };
  const { root } = await mount(result({ rank: 1, rankText: '1st', value: 30_000, passed: { displayName: 'Anna', value: 31_800 } }), board);
  await waitUntil(() => root.querySelector('.ribbon'), 'ribbon');
  expect(root.querySelector('.ribbon')!.textContent).to.contain('First place');
  expect(root.querySelector('.meta')!.textContent).to.contain("past Anna's 31.8");
});

it('says where the best stands when this run is not a best', async () => {
  const leader = entry(1, 'Luuk Peters', 480, true);
  const snakeBoard: ArcadeBoard = { played: true, top: [leader, entry(2, 'Bram', 450), entry(3, 'Noor', 290)], viewer: leader, viewerIsPublic: true, canModerate: false, players: 9, above: null };
  const leads = await mount(result({ game: 'Pkg.Snake.Game', board: 'default', isPersonalBest: false, previousBest: 480, value: 310, rank: 1, rankText: '1st' }), snakeBoard);
  await waitUntil(() => leads.root.querySelector('.meta'), 'meta');
  expect(leads.root.querySelector('.meta')!.textContent).to.contain('Your best 480 still leads');
  expect(leads.root.querySelector('.ribbon')).to.equal(null);
});

it('says Game over when the game says so', async () => {
  const { card, root } = await mount(result({ game: 'Pkg.Snake.Game', board: 'default', value: 310 }), minesBoard);
  card.outcome = 'over';
  await card.updateComplete;
  expect(root.querySelector('.kicker')!.textContent).to.equal('Game over · Classic');
});

it('asks the first time, worded around the would-be rank, with two equal outlined answers and no actions yet', async () => {
  const { root } = await mount(result({ askedAboutPublic: false, isPublic: false }), minesBoard);
  await waitUntil(() => root.querySelector('.q')!.textContent!.includes('12'), 'count loaded');
  expect(root.querySelector('.q')!.textContent).to.contain("That's 3rd of 12.").and.contain('Arcade leaderboard');
  const answers = [...root.querySelectorAll('[data-answer]')] as HTMLElement[];
  expect(answers.map((a) => a.textContent!.trim())).to.deep.equal(['Yes, show my scores', 'No, only I see them']);
  expect(answers.every((a) => a.classList.contains('ghost'))).to.equal(true);
  expect(answers[0].getBoundingClientRect().width).to.be.closeTo(answers[1].getBoundingClientRect().width, 1);
  expect(root.querySelector('[data-action="play-again"]')).to.equal(null);
});

it('saves the answer through the Arcade, then shows the card with its actions', async () => {
  const { root, calls } = await mount(result({ askedAboutPublic: false, isPublic: false }), minesBoard);
  (root.querySelector('[data-answer="show"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('shown:true'), JSON.stringify(calls));
  await waitUntil(() => root.querySelector('[data-action="play-again"]'), 'actions');
  expect(root.querySelector('.quiet')).to.equal(null);
});

it('ends every card with the quiet line while scores are hidden, and its link shows them', async () => {
  const hidden: ArcadeProfile = { ...shown, isPublic: false };
  const { root, calls } = await mount(result({ isPublic: false, isPersonalBest: false, value: 40_200, previousBest: 36_400 }), minesBoard, 400, hidden);
  await waitUntil(() => root.querySelector('.quiet'), 'quiet line');
  expect(root.querySelector('.quiet')!.textContent).to.contain('Your scores are hidden from the leaderboard.');
  expect(root.querySelector('.meta')!.textContent).to.contain('Your best 36.4').and.contain('would be 3rd');
  (root.querySelector('[data-action="show"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('shown:true'), JSON.stringify(calls));
});

it('names the person to chase in its compact form', async () => {
  const { root } = await mount(result(), minesBoard, 280);
  await waitUntil(() => root.querySelector('.chase'), 'chase');
  expect(root.querySelector('.chase')!.textContent).to.equal('3.1 sec behind Bram');
});

it('fires leaderboard with its game and board, and play-again', async () => {
  const { card, root } = await mount(result(), minesBoard);
  await waitUntil(() => root.querySelector('[data-action="leaderboard"]'), 'actions');
  setTimeout(() => (root.querySelector('[data-action="leaderboard"]') as HTMLElement).click());
  const leaderboard = await oneEvent(card, 'leaderboard');
  expect(leaderboard.detail).to.deep.equal({ game: 'Pkg.Mines.Game', board: 'easy' });
  setTimeout(() => (root.querySelector('[data-action="play-again"]') as HTMLElement).click());
  await oneEvent(card, 'play-again');
});

it('reads the board once per result', async () => {
  const { card, calls } = await mount(result(), minesBoard);
  await new Promise((resolve) => setTimeout(resolve, 50));
  card.requestUpdate();
  await card.updateComplete;
  expect(calls.filter((c) => c.startsWith('getBoard'))).to.deep.equal(['getBoard:Pkg.Mines.Game:easy']);
});

it('draws nothing without a result', async () => {
  const harness = await arcadeHarness({ games: [minesweeper] });
  const card = await fixture<UmbraDesktopArcadeResultElement>(html`<umbradesktop-arcade-result></umbradesktop-arcade-result>`, { parentNode: harness.wrapper });
  expect(card.shadowRoot!.querySelector('.card')).to.equal(null);
});
```

  Create `pieces/result.layout.test.ts` for the form chosen from the box (P10). It measures, so it
  reads the threshold from the constant rather than typing a number:

```ts
import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import type { ArcadeBoard } from '../api/arcade-api.js';
import type { ArcadeGameResult } from '../context/arcade.context.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import { ARCADE_COMPACT_BELOW_PX } from './constants.js';
import './result.element.js';
import type { UmbraDesktopArcadeResultElement } from './result.element.js';

const game = { alias: 'Pkg.Mines.Game', app: 'Pkg.Mines', label: 'Minesweeper', icon: 'icon-bomb', weight: 0, leaderboards: [{ alias: 'easy', label: 'Beginner', better: 'lower' as const, format: 'time' as const }] };
const viewer = { rank: 2, userKey: 'k', displayName: 'Ada', value: 38_100, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer: true };
const board: ArcadeBoard = { played: true, top: [{ ...viewer, rank: 1, userKey: 'g', displayName: 'Grace', value: 30_000, isViewer: false }, viewer], viewer, viewerIsPublic: true, canModerate: false, players: 2, above: { ...viewer, rank: 1, userKey: 'g', displayName: 'Grace', value: 30_000, isViewer: false } };
const result: ArcadeGameResult = { status: 'accepted', isPersonalBest: true, previousBest: null, rank: 2, isPublic: true, askedAboutPublic: true, displayName: 'Ada', passed: null, game: 'Pkg.Mines.Game', board: 'easy', value: 38_100, rankText: '2nd' };

/** The card in a box `width` wide, optionally forced compact; resolves once the board has loaded. */
async function inBox(width: number, compact = false) {
  const { wrapper } = await arcadeHarness({ games: [game], board });
  const box = await fixture<HTMLDivElement>(html`<div style="position:relative;width:${width}px;height:360px"></div>`, { parentNode: wrapper });
  const card = document.createElement('umbradesktop-arcade-result') as UmbraDesktopArcadeResultElement;
  card.result = result;
  card.compact = compact;
  box.append(card);
  await waitUntil(() => card.shadowRoot?.querySelector('.short li'), 'board loaded');
  const shown = (selector: string) => getComputedStyle(card.shadowRoot!.querySelector(selector)!).display !== 'none';
  return { card, shown };
}

it(`draws the full form in a box ${ARCADE_COMPACT_BELOW_PX}px or wider`, async () => {
  const { shown } = await inBox(ARCADE_COMPACT_BELOW_PX);
  expect(shown('.short'), 'short board').to.equal(true);
  expect(shown('.compact-only'), 'compact parts').to.equal(false);
});

it('draws the compact form in a narrower box: no board, the chase line instead', async () => {
  const { shown } = await inBox(ARCADE_COMPACT_BELOW_PX - 1);
  expect(shown('.short'), 'short board').to.equal(false);
  expect(shown('.compact-only'), 'compact parts').to.equal(true);
});

it('draws the compact form in a wide box when forced', async () => {
  const { shown } = await inBox(ARCADE_COMPACT_BELOW_PX + 200, true);
  expect(shown('.short'), 'short board').to.equal(false);
});

it('keeps the card inside the box it is given', async () => {
  for (const width of [ARCADE_COMPACT_BELOW_PX - 20, ARCADE_COMPACT_BELOW_PX, 600]) {
    const { card } = await inBox(width);
    const box = card.getBoundingClientRect();
    const drawn = card.shadowRoot!.querySelector('.card')!.getBoundingClientRect();
    expect(drawn.left, `left at ${width}`).to.be.at.least(box.left);
    expect(drawn.right, `right at ${width}`).to.be.at.most(box.right);
  }
});
```

- [ ] **Step 3: Run, expect failure.** Both files: cannot resolve `./result.element.js`.

- [ ] **Step 4: Write the element.** Create `pieces/result.element.ts`:

```ts
import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { ArcadeBoard, ArcadeProfile } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { ArcadeGameResult, UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import type { UmbraDesktopGameLeaderboard } from '../games/game-manifest.js';
import { formatScore } from '../shared/format.js';
import { chaseText, say, unitText } from '../shared/phrases.js';
import { ARCADE_CARD_WIDTH_PX, ARCADE_COMPACT_CARD_WIDTH_PX, ARCADE_PIECE_MARGIN_PX } from './constants.js';
import { ensureArcadeFont } from './font.js';
import { arcadeLook, arcadeTheme, compactStyles } from './look.js';
import { CROWN_PATH, entryRow, icon, medal, shortBoardRows } from './parts.js';
import { ArcadeThemeController } from './theme.controller.js';

/** The card's tag. **Published API** (design P2): final once shipped. */
export const ARCADE_RESULT_ELEMENT = 'umbradesktop-arcade-result';

/**
 * The result card for one submitted score (design P2, P4 to P7, P10): what happened, how good it is,
 * a short board, and Leaderboard › and Play again. The first time, it asks whether to show the
 * player's scores instead, worded around the rank the score would have (P7, P9).
 *
 * A game places it by tag name over whatever it wants covered, inside a positioned element, and sets
 * `result` to what the Arcade's `submit` handed back with `{ showsResult: true }`. It fills that box,
 * dims what is under it, and picks its compact form when the box is narrower than
 * `ARCADE_COMPACT_BELOW_PX` (P10), or when `compact` is set.
 *
 * Events, both bubbling within the game's shadow root: `leaderboard` (detail `{ game, board }`), for
 * the game to open the panel on the mode just played; `play-again`, for the game's own new game.
 * The card never closes itself: the game removes it when a new game starts.
 */
@customElement(ARCADE_RESULT_ELEMENT)
export class UmbraDesktopArcadeResultElement extends UmbLitElement {
  /** What `submit` handed back. Nothing is drawn without it. */
  @property({ attribute: false })
  result?: ArcadeGameResult;

  /** "You won" or "Game over": the game's call (settled point 6). */
  @property({ reflect: true })
  outcome: 'won' | 'over' = 'won';

  /** Forces the compact form whatever the box (P10). */
  @property({ type: Boolean, reflect: true })
  compact = false;

  /** The board read for this result: its count, its rows, the entry above. */
  @state()
  private _board?: ArcadeBoard;

  /** The player's settings as the Arcade last knew them; overrides the result once known. */
  @state()
  private _profile?: ArcadeProfile;

  /** Whether an answer is being saved, so it cannot be sent twice. */
  @state()
  private _saving = false;

  /** The Arcade, once found. */
  #arcade?: UmbraDesktopArcadeContext;

  /** The result the board was last read for, so it is read once per result (§6). */
  #loadedFor?: ArcadeGameResult;

  constructor() {
    super();
    ensureArcadeFont();
    new ArcadeThemeController(this);
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (!arcade) return;
      this.observe(arcade.profile, (profile) => (this._profile = profile), '_arcadeProfile');
      void this.#load();
    });
  }

  /**
   * Read the board again when the game hands over a new result.
   * @param changed The properties that changed.
   */
  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('result')) void this.#load();
  }

  /**
   * Read the board for the current result, once; `again` reads it after an answer changed who is shown.
   * A slow answer for a result the game has since replaced is dropped.
   * @param again Read even though this result was read already.
   */
  async #load(again = false): Promise<void> {
    const result = this.result;
    if (!this.#arcade || !result || (!again && this.#loadedFor === result)) return;
    this.#loadedFor = result;
    if (!again) this._board = undefined;
    const board = await this.#arcade.getBoard(result.game, result.board);
    if (this.result === result) this._board = board;
  }

  /** @returns The board's definition, from the game's manifest. */
  get #definition(): UmbraDesktopGameLeaderboard | undefined {
    const result = this.result;
    return this.#arcade?.getGames().find((g) => g.alias === result?.game)?.leaderboards.find((b) => b.alias === result?.board);
  }

  /** @returns Whether the player has answered the question, by the result or since. */
  get #asked(): boolean {
    return !!this.result?.askedAboutPublic || !!this._profile?.askedAboutPublic;
  }

  /** @returns Whether the player's scores are shown: the latest known settings, else the result's. */
  get #shown(): boolean {
    return this._profile ? this._profile.isPublic : !!this.result?.isPublic;
  }

  /**
   * Save the player's answer, then read the board again, since showing changes who is on it.
   * @param shown Show their scores.
   */
  async #answer(shown: boolean): Promise<void> {
    if (!this.#arcade || this._saving) return;
    this._saving = true;
    try {
      await this.#arcade.setScoresShown(shown);
    } finally {
      this._saving = false;
    }
    await this.#load(true);
  }

  /**
   * Tell the game what was chosen.
   * @param name The event.
   */
  #fire(name: 'leaderboard' | 'play-again'): void {
    const result = this.result;
    this.dispatchEvent(new CustomEvent(name, { detail: { game: result?.game, board: result?.board }, bubbles: true }));
  }

  /** @returns The card, or nothing without a result. */
  override render() {
    const result = this.result;
    if (!result) return nothing;
    const l = this.localize;
    const definition = this.#definition;
    const format = definition?.format ?? 'points';
    const outcome = this.outcome === 'over' ? say(l, 'outcomeOver', 'Game over') : say(l, 'outcomeWon', 'You won');
    const unit = unitText(l, format, result.value);
    return html`<div class="card felt surface" role="status">
      <p class="kicker">${outcome}${definition ? ` · ${l.string(definition.label)}` : ''}</p>
      <p class="big"><b>${formatScore(format, result.value, l.lang())}</b>${unit ? html`<span>${unit}</span>` : nothing}</p>
      ${this.#asked ? this.#standing(format) : this.#question()}
      ${this.#asked ? this.#shortBoard(format) : nothing}
      ${this.#asked
        ? html`<div class="acts">
            <button class="link" data-action="leaderboard" @click=${() => this.#fire('leaderboard')}>${say(l, 'leaderboardLink', 'Leaderboard')} ›</button>
            <button class="btn sm" data-action="play-again" @click=${() => this.#fire('play-again')}>${say(l, 'playAgain', 'Play again')}</button>
          </div>`
        : nothing}
      ${this.#asked && !this.#shown
        ? html`<p class="quiet">
            ${say(l, 'hiddenLine', 'Your scores are hidden from the leaderboard.')}
            <button class="link" data-action="show" ?disabled=${this._saving} @click=${() => this.#answer(true)}>${say(l, 'showThemLink', 'Show them')}</button>
          </p>`
        : nothing}
    </div>`;
  }

  /** @returns The first-time question and its two equal answers (P7, P9). */
  #question() {
    const l = this.localize;
    const result = this.result!;
    const players = this._board?.players;
    const standing = players ? `${say(l, 'askStanding', "That's {0} of {1}.", result.rankText, players)} ` : '';
    return html`<p class="q">${standing}${say(l, 'ask', 'Show your scores on the Arcade leaderboard, where colleagues can see them?')}</p>
      <div class="answers">
        <button class="btn ghost sm" data-answer="show" ?disabled=${this._saving} @click=${() => this.#answer(true)}>${say(l, 'answerShow', 'Yes, show my scores')}</button>
        <button class="btn ghost sm" data-answer="hide" ?disabled=${this._saving} @click=${() => this.#answer(false)}>${say(l, 'answerHide', 'No, only I see them')}</button>
      </div>`;
  }

  /**
   * How good it is: the ribbon and the standing line, laid out for each form. The full form puts them
   * on one line with the game's own `detail` slot; the compact form stacks them with the medal and
   * the person to chase.
   * @param format The board's format.
   * @returns Both forms; CSS shows one.
   */
  #standing(format: 'points' | 'time') {
    const l = this.localize;
    const result = this.result!;
    const lang = l.lang();
    const shown = this.#shown;
    const players = this._board?.players;
    const ofPlayers = players ? say(l, 'standing', '{0} of {1}', result.rankText, players) : result.rankText;
    const best = result.isPersonalBest ? result.value : (result.previousBest ?? result.value);
    const yourBest = say(l, 'yourBest', 'Your best {0}', formatScore(format, best, lang));
    const first = shown && result.isPersonalBest && result.rank === 1;
    let line: string;
    if (!shown) {
      const wouldBe = say(l, 'wouldBe', 'would be {0}', result.rankText);
      line = result.isPersonalBest ? wouldBe : `${yourBest} · ${wouldBe}`;
    } else if (first && result.passed) {
      line = say(l, 'passed', "past {0}'s {1}", result.passed.displayName, formatScore(format, result.passed.value, lang));
    } else if (result.isPersonalBest) {
      line = ofPlayers;
    } else if (result.rank === 1) {
      line = say(l, 'stillLeads', 'Your best {0} still leads', formatScore(format, best, lang));
    } else {
      line = `${yourBest} · ${ofPlayers}`;
    }
    const ribbon = result.isPersonalBest
      ? html`<span class="ribbon">${first ? icon(CROWN_PATH, 'crown') : nothing}${first ? say(l, 'ribbonFirst', 'First place') : say(l, 'ribbonNewBest', 'New best')}</span>`
      : nothing;
    const above = this._board?.above;
    return html`<p class="meta full-only">${ribbon}<span class="line">${line}</span><slot name="detail"></slot></p>
      <div class="compact-only">
        ${ribbon}
        <p class="standing1">${medal(result.rank)}<span>${line}</span></p>
        ${result.rank > 1 && above ? html`<p class="chase">${chaseText(l, format, best, above)}</p>` : nothing}
      </div>`;
  }

  /**
   * The short board of three with the player's row lit (settled point 2), full form only.
   * @param format The board's format.
   * @returns The list, or nothing until the board has loaded.
   */
  #shortBoard(format: 'points' | 'time') {
    const board = this._board;
    if (!board) return nothing;
    const l = this.localize;
    const options = {
      format,
      you: say(l, 'you', 'You'),
      lang: l.lang(),
      youMode: 'replace' as const,
      onlyYou: this.#shown ? undefined : say(l, 'onlyYou', 'Only you see this'),
    };
    return html`<ol class="short full-only">
      ${shortBoardRows(board).map((row) => (row === 'gap' ? html`<li class="gap" aria-hidden="true">···</li>` : entryRow(row, options)))}
    </ol>`;
  }

  /** The card, its two forms, and its one-time motion (P14). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host {
        position: absolute; inset: 0; z-index: 5; display: grid; place-items: center;
        container-type: inline-size; background: var(--arcade-scrim); backdrop-filter: blur(1.5px);
      }
      .card {
        width: ${unsafeCSS(ARCADE_CARD_WIDTH_PX)}px; max-width: calc(100% - ${unsafeCSS(2 * ARCADE_PIECE_MARGIN_PX)}px);
        box-sizing: border-box; border-radius: calc(var(--arcade-radius) + 2px); padding: 16px 16px 12px;
        box-shadow: var(--arcade-shadow); animation: rise 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      p { margin: 0; }
      .kicker { font-weight: 600; font-size: 12px; color: var(--arcade-soft); }
      .big { display: flex; align-items: baseline; gap: 6px; margin: 4px 0 2px; }
      .big b { font-weight: 800; font-size: 46px; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .big span { font-weight: 600; font-size: 16px; color: var(--arcade-soft); }
      .meta { font-size: 12px; color: var(--arcade-soft); margin: 6px 0 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .short { margin-bottom: 4px; }
      .short .lr { padding: 6px 8px; font-size: 12.5px; gap: 9px; }
      .short .lr .av, .short .lr .medal { width: 22px; height: 22px; font-size: 9px; }
      .short .lr .sc { font-size: 13px; }
      .short .lr.mine { animation: shine 900ms ease-out 300ms 1 both; background-size: 300% 100%; }
      .acts { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
      .q { font-size: 12.5px; line-height: 1.45; margin: 4px 0 10px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--arcade-accent) 12%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--arcade-accent) 35%, transparent); }
      .answers { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .quiet { margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--arcade-ring); font-size: 11.5px; color: var(--arcade-faint); line-height: 1.5; }
      .compact-only { display: none; }
      .crown { animation: settle 400ms ease-out 200ms 1 both; }
      @keyframes rise { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: none; } }
      @keyframes shine { from { background-position: 100% 0; } to { background-position: 0 0; } }
      @keyframes settle { from { transform: translateY(-6px) rotate(-12deg); opacity: 0; } to { transform: none; opacity: 1; } }
    `,
    compactStyles(
      (scope) => `
        ${scope} .card { width: ${ARCADE_COMPACT_CARD_WIDTH_PX}px; padding: 14px 16px 12px; text-align: center; }
        ${scope} .full-only { display: none; }
        ${scope} .compact-only { display: block; }
        ${scope} .big { justify-content: center; margin: 6px 0 4px; }
        ${scope} .big b { font-size: 42px; }
        ${scope} .ribbon { margin: 2px auto 0; }
        ${scope} .standing1 { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; color: var(--arcade-soft); margin-top: 10px; }
        ${scope} .standing1 .medal { width: 24px; height: 24px; font-size: 11px; }
        ${scope} .chase { font-size: 12px; color: var(--arcade-faint); margin-top: 3px; }
        ${scope} .acts { justify-content: center; gap: 14px; margin-top: 14px; }
        ${scope} .q { background: none; box-shadow: none; padding: 0; font-size: 13px; }
        ${scope} .answers { grid-template-columns: 1fr; }
      `,
    ),
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-result': UmbraDesktopArcadeResultElement;
  }
}
```

  The `.chase` expectation in the test is "3.1 sec": 38.1 minus 35.0, floored to the tenth by
  `formatScore`. The mock's "3.0" was made up.

- [ ] **Step 5: Define the pieces with the context.** At the top of `arcade.context.ts`, after the
  imports: `import '../pieces/result.element.js';` and `import '../pieces/leaderboard.element.js';`
  (the second after Task 15 exists; add the first now). Say in a comment why: games place the tags
  and import nothing, so the Arcade defines them as soon as it loads.

- [ ] **Step 6: Run, expect pass.** Both test files, then `npm test` and `npm run build` from `A`.
  If the layout tests fail because the container query does not match, confirm the host is the query
  container for its shadow children in the test's Chrome (it is in Chrome 105 and later) before
  changing anything else.

### Task 15: The leaderboard panel

**Files:**
- Create: `A/backoffice/src/pieces/leaderboard.element.ts`
- Test: `A/backoffice/src/pieces/leaderboard.element.test.ts`

Design P2, P10, P12, §4 "The panel", and the mock's section 7. A sheet over the game, rising from the
bottom of the game's own area; Esc and ✕ close it; `open` and `close` fire so a game can pause.

- [ ] **Step 1: Write the failing tests.** Create `leaderboard.element.test.ts`:

```ts
import { expect, fixture, html, oneEvent, waitUntil } from '@open-wc/testing';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import { ARCADE_COMPACT_BELOW_PX } from './constants.js';
import './leaderboard.element.js';
import type { UmbraDesktopArcadeLeaderboardElement } from './leaderboard.element.js';

const solitaire = { alias: 'Pkg.Sol.Game', app: 'Pkg.Sol', label: 'Solitaire', icon: 'icon-playing-cards', weight: 0, rule: 'Highest score wins', leaderboards: [{ alias: 'draw-1', label: 'Draw 1', better: 'higher' as const, format: 'points' as const }, { alias: 'draw-3', label: 'Draw 3', better: 'higher' as const, format: 'points' as const }] };
const entry = (rank: number, name: string, value: number, isViewer = false): ArcadeBoardEntry => ({ rank, userKey: `k-${name}`, displayName: name, value, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer });
const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, `P${i + 1}`, 5000 - i * 100));
const board = (viewer: ArcadeBoardEntry | null, viewerIsPublic = true): ArcadeBoard => ({ played: true, top, viewer, viewerIsPublic, canModerate: false, players: 14, above: null });

/** Mount a closed panel in a positioned box under a fake Arcade, then open it. */
async function open(options: { width?: number; board?: string; lastBoard?: Record<string, string>; data?: ArcadeBoard; compact?: boolean } = {}) {
  const harness = await arcadeHarness({ games: [solitaire], board: options.data ?? board(null), lastBoard: options.lastBoard });
  const box = await fixture<HTMLDivElement>(html`<div style="position:relative;width:${options.width ?? 600}px;height:480px"></div>`, { parentNode: harness.wrapper });
  const panel = document.createElement('umbradesktop-arcade-leaderboard') as UmbraDesktopArcadeLeaderboardElement;
  panel.game = 'Pkg.Sol.Game';
  if (options.board) panel.board = options.board;
  panel.compact = options.compact ?? false;
  box.append(panel);
  await panel.updateComplete;
  const opened = oneEvent(panel, 'open');
  panel.open = true;
  await opened;
  await waitUntil(() => panel.shadowRoot!.querySelector('.list li'), 'rows drawn');
  const shown = (selector: string) => getComputedStyle(panel.shadowRoot!.querySelector(selector)!).display !== 'none';
  return { panel, root: panel.shadowRoot!, shown, ...harness };
}

it('opens on the board it is given', async () => {
  const { root, calls } = await open({ board: 'draw-3' });
  expect(calls).to.include('getBoard:Pkg.Sol.Game:draw-3');
  expect(root.querySelector('[data-mode="draw-3"]')!.getAttribute('aria-selected')).to.equal('true');
});

it('opens on the mode last played when given none, and on the first otherwise', async () => {
  const remembered = await open({ lastBoard: { 'Pkg.Sol.Game': 'draw-3' } });
  expect(remembered.calls).to.include('getBoard:Pkg.Sol.Game:draw-3');
  const fresh = await open();
  expect(fresh.calls).to.include('getBoard:Pkg.Sol.Game:draw-1');
});

it('switches the board with the pill', async () => {
  const { root, calls } = await open({ board: 'draw-1' });
  (root.querySelector('[data-mode="draw-3"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('getBoard:Pkg.Sol.Game:draw-3'), JSON.stringify(calls));
});

it('stands the top three on a podium in its full form, and drops the podium in its compact form', async () => {
  const full = await open({ width: 600 });
  expect(full.shown('.podium-wrap')).to.equal(true);
  expect(full.shown('.list li[data-rank="1"]'), 'rank 1 is on the podium, not the list').to.equal(false);
  const narrow = await open({ width: ARCADE_COMPACT_BELOW_PX - 1 });
  expect(narrow.shown('.podium-wrap')).to.equal(false);
  expect(narrow.shown('.list li[data-rank="1"]')).to.equal(true);
  const forced = await open({ width: 600, compact: true });
  expect(forced.shown('.podium-wrap')).to.equal(false);
});

it('pins the player under the list when outside the top ten, marked when hidden', async () => {
  const { root } = await open({ data: board(entry(14, 'Ada', 100, true), false) });
  const pinned = root.querySelector('.pinned .lr')!;
  expect(pinned.textContent).to.contain('You').and.contain('Only you see this');
  expect(pinned.classList.contains('ghost')).to.equal(true);
});

it('says how many players, and how to win', async () => {
  const { root } = await open();
  expect(root.querySelector('.sfoot')!.textContent).to.contain('14');
  expect(root.querySelector('.rule')!.textContent).to.contain('Highest score wins');
});

it('closes on ✕ and on Esc, firing close each time', async () => {
  const { panel, root } = await open();
  setTimeout(() => (root.querySelector('[data-action="close"]') as HTMLElement).click());
  await oneEvent(panel, 'close');
  expect(panel.open).to.equal(false);
  const reopened = oneEvent(panel, 'open');
  panel.open = true;
  await reopened;
  setTimeout(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })));
  await oneEvent(panel, 'close');
  expect(panel.open).to.equal(false);
});

it('opens the same board in the Arcade, and closes', async () => {
  const { panel, root, calls } = await open({ board: 'draw-3' });
  (root.querySelector('[data-action="open-in-arcade"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('show:Pkg.Sol.Game:draw-3'), JSON.stringify(calls));
  await waitUntil(() => !panel.open, 'closed');
});

it('draws nothing while closed', async () => {
  const harness = await arcadeHarness({ games: [solitaire], board: board(null) });
  const panel = await fixture<UmbraDesktopArcadeLeaderboardElement>(html`<umbradesktop-arcade-leaderboard game="Pkg.Sol.Game"></umbradesktop-arcade-leaderboard>`, { parentNode: harness.wrapper });
  expect(getComputedStyle(panel).display).to.equal('none');
});
```

- [ ] **Step 2: Run, expect failure.** Cannot resolve `./leaderboard.element.js`.

- [ ] **Step 3: Write the element.** Create `pieces/leaderboard.element.ts`:

```ts
import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { ArcadeBoard } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { ruleText, say } from '../shared/phrases.js';
import { ARCADE_PANEL_MAX_WIDTH_PX } from './constants.js';
import { ensureArcadeFont } from './font.js';
import { arcadeLook, arcadeTheme, compactStyles } from './look.js';
import { TROPHY_PATH, entryRow, icon, podium } from './parts.js';
import { ArcadeThemeController } from './theme.controller.js';

/** The panel's tag. **Published API** (design P2): final once shipped. */
export const ARCADE_LEADERBOARD_ELEMENT = 'umbradesktop-arcade-leaderboard';

/**
 * The leaderboard for one game, as a sheet over it (design P2, P10, P12): the rule, a pill for the
 * mode when there are several, a podium in the full form, the list, the player pinned underneath when
 * outside the top ten, the player count, and "Open in the Arcade ›".
 *
 * A game places it by tag name inside a positioned element covering the game, sets `game`, and opens
 * it by setting `open`. `board` chooses the mode to open on; without it the panel opens on the mode
 * last played. It fires `open` and `close` whenever `open` changes, so a game running underneath can
 * pause and resume; Esc and ✕ close it. Like the card, it is compact in a box narrower than
 * `ARCADE_COMPACT_BELOW_PX`, or when `compact` is set.
 */
@customElement(ARCADE_LEADERBOARD_ELEMENT)
export class UmbraDesktopArcadeLeaderboardElement extends UmbLitElement {
  /** The game's `umbraDesktopGame` alias. */
  @property()
  game = '';

  /** The board to open on; the mode last played when empty. */
  @property()
  board = '';

  /** Whether the panel is showing. */
  @property({ type: Boolean, reflect: true })
  open = false;

  /** Forces the compact form whatever the box. */
  @property({ type: Boolean, reflect: true })
  compact = false;

  /** The board on show. */
  @state()
  private _mode = '';

  /** That board's read, or undefined while loading. */
  @state()
  private _data?: ArcadeBoard;

  /** Whether the read failed. */
  @state()
  private _failed = false;

  /** The Arcade, once found. */
  #arcade?: UmbraDesktopArcadeContext;

  constructor() {
    super();
    ensureArcadeFont();
    new ArcadeThemeController(this);
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (arcade && this.open) this.#start();
    });
    this.addEventListener('keydown', (event) => {
      if (this.open && event.key === 'Escape') {
        event.stopPropagation();
        this.open = false;
      }
    });
  }

  /** @returns The game, from the Arcade's registered games. */
  get #game(): ArcadeGame | undefined {
    return this.#arcade?.getGames().find((g) => g.alias === this.game);
  }

  /**
   * Fire `open` and `close` as `open` changes, and load the board on opening. After the update, so
   * a game reacting to `open` sees the panel drawn.
   * @param changed The properties that changed.
   */
  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    if (!changed.has('open')) return;
    const before = changed.get('open') as boolean | undefined;
    if (this.open && !before) {
      this.#start();
      this.dispatchEvent(new CustomEvent('open', { bubbles: true }));
      this.shadowRoot?.querySelector<HTMLElement>('[data-action="close"]')?.focus();
    } else if (!this.open && before) {
      this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
    }
  }

  /** Pick the mode to open on (P12) and load it. */
  #start(): void {
    const game = this.#game;
    if (!game) return;
    const wanted = this.board || this.#arcade?.lastBoard(game.alias) || '';
    this._mode = game.leaderboards.some((b) => b.alias === wanted) ? wanted : game.leaderboards[0].alias;
    void this.#load();
  }

  /** Read the board on show; a slow answer for a mode switched away from is dropped. */
  async #load(): Promise<void> {
    const mode = this._mode;
    if (!this.#arcade || !mode) return;
    this._data = undefined;
    this._failed = false;
    const data = await this.#arcade.getBoard(this.game, mode);
    if (mode !== this._mode) return;
    this._data = data;
    this._failed = data === undefined;
  }

  /** @param mode The board to switch to. */
  #switch(mode: string): void {
    if (mode === this._mode) return;
    this._mode = mode;
    void this.#load();
  }

  /** Show this board in the hub, and get out of the way (§4). */
  #openInArcade(): void {
    if (this.#arcade?.showBoard(this.game, this._mode)) this.open = false;
  }

  /** @returns The sheet, or nothing while closed. */
  override render() {
    if (!this.open) return nothing;
    const l = this.localize;
    const game = this.#game;
    const definition = game?.leaderboards.find((b) => b.alias === this._mode);
    const data = this._data;
    const format = definition?.format ?? 'points';
    const rowOptions = { format, you: say(l, 'you', 'You'), lang: l.lang(), youMode: 'replace' as const };
    const pinned = data?.viewer && !data.top.some((e) => e.isViewer) ? data.viewer : undefined;
    return html`<div class="scrim" @click=${() => (this.open = false)}></div>
      <section class="sheet felt surface" role="dialog" aria-modal="true" aria-label=${say(l, 'leaderboard', 'Leaderboard')}>
        <header class="shead">
          ${icon(TROPHY_PATH, 'crown')}
          <div class="title">
            <b class="display">${say(l, 'leaderboard', 'Leaderboard')}</b>
            <span class="rule">${definition ? html`<span class="compact-only">${l.string(definition.label)} · </span>` : nothing}${definition ? ruleText(l, definition, game?.rule) : ''}</span>
          </div>
          ${game && game.leaderboards.length > 1
            ? html`<div class="seg" role="tablist">
                ${game.leaderboards.map(
                  (b) => html`<button role="tab" data-mode=${b.alias} aria-selected=${String(b.alias === this._mode)} @click=${() => this.#switch(b.alias)}>${l.string(b.label)}</button>`,
                )}
              </div>`
            : nothing}
          <button class="close" data-action="close" aria-label=${say(l, 'close', 'Close')} @click=${() => (this.open = false)}>✕</button>
        </header>
        ${this._failed
          ? html`<p class="empty">${say(l, 'boardUnavailable', 'The board could not be loaded.')}</p>
              <button class="link" data-action="retry" @click=${() => this.#load()}>${say(l, 'retry', 'Retry')}</button>`
          : !data
            ? html`<uui-loader-bar></uui-loader-bar>`
            : !data.played
              ? html`<p class="empty">${say(l, 'boardEmpty', 'Nobody has played this yet.')}</p>`
              : html`<div class="podium-wrap full-only">${podium(data.top.slice(0, 3), rowOptions)}</div>
                  <ol class="list">
                    ${data.top.map((e) => entryRow(e, { ...rowOptions, className: e.rank <= 3 ? 'on-podium' : undefined }))}
                  </ol>
                  ${pinned
                    ? html`<ol class="pinned">
                        <li class="gap" aria-hidden="true">···</li>
                        ${entryRow(pinned, { ...rowOptions, onlyYou: data.viewerIsPublic ? undefined : say(l, 'onlyYou', 'Only you see this') })}
                      </ol>`
                    : nothing}`}
        <footer class="sfoot">
          <span>${data ? say(l, 'players', '{0} players', data.players) : ''}</span>
          <button class="link" data-action="open-in-arcade" @click=${() => this.#openInArcade()}>${say(l, 'openInArcade', 'Open in the Arcade')} ›</button>
        </footer>
      </section>`;
  }

  /** A sheet from the bottom of the game, full height in its compact form (mock §7). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host { position: absolute; inset: 0; z-index: 6; display: block; container-type: inline-size; }
      :host(:not([open])) { display: none; }
      .scrim { position: absolute; inset: 0; background: var(--arcade-scrim); }
      .sheet {
        position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); box-sizing: border-box;
        width: min(${unsafeCSS(ARCADE_PANEL_MAX_WIDTH_PX)}px, 100%); max-height: calc(100% - 24px); overflow: auto;
        border-radius: var(--arcade-radius) var(--arcade-radius) 0 0; padding: 12px 12px 10px;
        box-shadow: 0 -20px 50px -10px rgb(0 0 0 / 60%), 0 0 0 1px rgb(255 255 255 / 12%);
        animation: up 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .shead { display: flex; align-items: center; gap: 10px; margin: 0 2px 8px; }
      .shead > .crown { width: 18px; height: 18px; }
      .title { flex: 1; min-width: 0; }
      .title b { display: block; font-size: 16px; font-weight: 600; }
      .rule { font-size: 11.5px; color: var(--arcade-faint); }
      .close { border: 0; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--arcade-glass-strong); color: var(--arcade-soft); }
      .podium { margin: 2px 50px 8px; }
      .podium .av { width: 32px; height: 32px; font-size: 11px; }
      .podium .pn { font-size: 12px; }
      .podium .ps { font-size: 14px; }
      .podium .step { font-size: 15px; padding-top: 4px; }
      .podium .step.s1 { height: 34px; }
      .podium .step.s2 { height: 24px; }
      .podium .step.s3 { height: 18px; }
      .lr { padding: 5px 8px; font-size: 13px; gap: 10px; }
      .lr .av, .lr .medal { width: 24px; height: 24px; font-size: 9.5px; }
      .lr .sc { font-size: 14px; }
      .on-podium { display: none; }
      .compact-only { display: none; }
      .sfoot { display: flex; justify-content: space-between; align-items: center; margin: 8px 4px 0; padding-top: 8px; border-top: 1px solid var(--arcade-ring); font-size: 12px; color: var(--arcade-faint); }
      .empty { color: var(--arcade-soft); font-size: 13px; padding: 12px 4px; margin: 0; }
      @keyframes up { from { transform: translate(-50%, 24px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
    `,
    compactStyles(
      (scope) => `
        ${scope} .sheet { inset: 0; left: 0; transform: none; width: auto; max-height: none; border-radius: 0; padding: 10px 10px 8px; animation: none; }
        ${scope} .full-only { display: none; }
        ${scope} .on-podium { display: flex; }
        ${scope} .compact-only { display: inline; }
      `,
    ),
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-leaderboard': UmbraDesktopArcadeLeaderboardElement;
  }
}
```

  In the full form the top three stand on the podium and their list rows (`.on-podium`) are hidden;
  in the compact form the podium goes and those rows show, so the list always holds all ten.

- [ ] **Step 4: Define it with the context.** Add `import '../pieces/leaderboard.element.js';` beside
  the result card's import in `arcade.context.ts`.

- [ ] **Step 5: Run, expect pass.** Then `npm test` and `npm run build` from `A`.

---

# Phase D: The hub

Design P11 and P12, and the mock's sections 1 to 3. One job per place: the top bar navigates
("‹ All games" and the player's name), a game's header names it and holds Play, the pill sits above
the board it switches. The hub is an app, so the desktop stamps `data-umbradesktop-theme` on it and
`arcadeTheme` applies without the theme controller.

The three views are separate elements so each can be tested alone; the hub element only routes.

### Task 16: The hub's shell and its overview

**Files:**
- Rewrite: `A/backoffice/src/hub/hub.element.ts`
- Create: `A/backoffice/src/hub/overview.element.ts`
- Rewrite: `A/backoffice/src/hub/hub.element.test.ts`
- Modify: `A/backoffice/src/hub/constants.ts`
- Delete: `A/backoffice/src/hub/hub.switching.test.ts` (tabs are gone; its case is the request test below)

- [ ] **Step 1: Write the failing tests.** Replace `hub.element.test.ts` with:

```ts
import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import type { ArcadeBoardEntry, ArcadeOverview } from '../api/arcade-api.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import './hub.element.js';

const time = { better: 'lower' as const, format: 'time' as const };
const points = { better: 'higher' as const, format: 'points' as const };
const games = [
  { alias: 'Pkg.Mines.Game', app: 'Pkg.Mines', label: 'Minesweeper', icon: 'icon-bomb', weight: 1000, leaderboards: [{ alias: 'easy', label: 'Beginner', ...time }] },
  { alias: 'Pkg.Snake.Game', app: 'Pkg.Snake', label: 'Snake', icon: 'icon-game', weight: 900, leaderboards: [{ alias: 'default', label: 'Classic', ...points }] },
  { alias: 'Pkg.Sol.Game', app: 'Pkg.Sol', label: 'Solitaire', icon: 'icon-playing-cards', weight: 800, rule: 'Highest score wins, time bonus included', leaderboards: [{ alias: 'draw-1', label: 'Draw 1', ...points }, { alias: 'draw-3', label: 'Draw 3', ...points }] },
];
const e = (rank: number, name: string, value: number, isViewer = false): ArcadeBoardEntry => ({ rank, userKey: `k-${name}`, displayName: name, value, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer });
const me = (rank: number, value: number) => e(rank, 'Luuk Peters', value, true);
const overview: ArcadeOverview = {
  colleagues: 12,
  boards: [
    { game: 'Pkg.Mines.Game', board: 'easy', players: 12, viewer: me(3, 38_100), leader: e(1, 'Anna', 31_800), next: e(2, 'Bram', 35_000) },
    { game: 'Pkg.Snake.Game', board: 'default', players: 9, viewer: me(1, 480), leader: me(1, 480), next: e(2, 'Bram', 450) },
    { game: 'Pkg.Sol.Game', board: 'draw-1', players: 9, viewer: me(2, 4_910), leader: e(1, 'Sophie', 5_880), next: me(2, 4_910) },
    { game: 'Pkg.Sol.Game', board: 'draw-3', players: 5, viewer: null, leader: e(1, 'Tom', 3_960), next: e(2, 'Sophie', 3_710) },
    { game: 'Pkg.Gone.Game', board: 'x', players: 1, viewer: me(1, 10), leader: me(1, 10), next: null },
  ],
};
const empty = { played: false, top: [], viewer: null, viewerIsPublic: true, canModerate: false, players: 0, above: null };
const profile = { displayName: 'Luuk Peters', isPublic: true, notifyWhenBeaten: true, askedAboutPublic: true };

/** The hub under a fake Arcade, and its overview once loaded. */
async function hub(extra: Parameters<typeof arcadeHarness>[0] = {}) {
  const harness = await arcadeHarness({ games, overview, board: empty, profile, ...extra });
  const el = await fixture(html`<umbradesktop-arcade-hub style="width:820px;height:580px"></umbradesktop-arcade-hub>`, { parentNode: harness.wrapper });
  return { el, root: el.shadowRoot!, ...harness };
}

/** The overview's shadow root, once its tiles are drawn. */
async function overviewOf(root: ShadowRoot) {
  const view = await waitUntil(() => root.querySelector('umbradesktop-arcade-overview'), 'overview');
  await waitUntil(() => (view as HTMLElement).shadowRoot!.querySelectorAll('.tile').length > 0, 'tiles');
  return (view as HTMLElement).shadowRoot!;
}

it('opens on the overview: your standing, then a tile per installed game', async () => {
  const { root } = await hub();
  const view = await overviewOf(root);
  const stat = (name: string) => view.querySelector(`[data-stat="${name}"] b`)!.textContent;
  expect(stat('lead'), 'boards led, the uninstalled game left out').to.equal('1');
  expect(stat('top3')).to.equal('2');
  expect(stat('colleagues')).to.equal('12');
  expect(view.querySelector('[data-stat="lead"]')!.textContent).to.contain('Snake');
  expect([...view.querySelectorAll('.tile')].map((t) => t.getAttribute('data-game'))).to.deep.equal(['Pkg.Mines.Game', 'Pkg.Snake.Game', 'Pkg.Sol.Game']);
});

it('shows, per mode, your medal and best beside the leader and their crown', async () => {
  const view = await overviewOf((await hub()).root);
  const row = view.querySelector('[data-game="Pkg.Mines.Game"] [data-board="easy"]')!;
  expect(row.querySelector('.medal')!.textContent).to.equal('3');
  expect(row.textContent).to.contain('38.1').and.contain('Anna').and.contain('31.8');
  expect(row.querySelector('.lead .crown')).to.not.equal(null);
});

it('shows who is next when you lead', async () => {
  const view = await overviewOf((await hub()).root);
  expect(view.querySelector('[data-board="default"] .lead')!.textContent).to.contain('Next: Bram').and.contain('450');
});

it('says Not played yet for a mode you never played, and still shows its leader', async () => {
  const view = await overviewOf((await hub()).root);
  const row = view.querySelector('[data-game="Pkg.Sol.Game"] [data-board="draw-3"]')!;
  expect(row.textContent).to.contain('Not played yet').and.contain('Tom');
});

it('gives a game with several modes a wide tile, and its own rule', async () => {
  const view = await overviewOf((await hub()).root);
  const tile = view.querySelector('[data-game="Pkg.Sol.Game"]')!;
  expect(tile.classList.contains('wide')).to.equal(true);
  expect(tile.textContent).to.contain('Highest score wins, time bonus included');
  expect(view.querySelector('[data-game="Pkg.Mines.Game"]')!.textContent).to.contain('Fastest time wins');
});

it('starts a game from Play, and opens its page from the tile', async () => {
  const { root, calls } = await hub();
  const view = await overviewOf(root);
  (view.querySelector('[data-game="Pkg.Snake.Game"] [data-action="play"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('open:Pkg.Snake'), JSON.stringify(calls));
  expect(root.querySelector('umbradesktop-arcade-game-page'), 'Play does not also open the page').to.equal(null);
  (view.querySelector('[data-game="Pkg.Snake.Game"] [data-action="open-game"]') as HTMLElement).click();
  const page = await waitUntil(() => root.querySelector('umbradesktop-arcade-game-page'), 'game page');
  expect((page as unknown as { game: { alias: string } }).game.alias).to.equal('Pkg.Snake.Game');
});

it('keeps the profile behind your name, not among the games, with a way back', async () => {
  const { root } = await hub();
  await overviewOf(root);
  expect(root.querySelector('uui-tab')).to.equal(null);
  const me = root.querySelector('[data-action="profile"]') as HTMLElement;
  expect(me.textContent).to.contain('Luuk Peters');
  me.click();
  await waitUntil(() => root.querySelector('umbradesktop-arcade-profile'), 'profile');
  expect(me.getAttribute('aria-expanded')).to.equal('true');
  (root.querySelector('[data-action="back"]') as HTMLElement).click();
  await waitUntil(() => root.querySelector('umbradesktop-arcade-overview'), 'overview again');
});

it('opens on the board the Arcade was asked to show, and follows a request while open', async () => {
  const { root, calls, request } = await hub({ hubRequest: { game: 'Pkg.Sol.Game', board: 'draw-3' } });
  const page = await waitUntil(() => root.querySelector('umbradesktop-arcade-game-page'), 'game page');
  expect((page as unknown as { board: string }).board).to.equal('draw-3');
  expect(calls).to.include('clearHubRequest');
  request.setValue({ game: 'Pkg.Mines.Game' });
  await waitUntil(() => (root.querySelector('umbradesktop-arcade-game-page') as unknown as { game: { alias: string } })?.game.alias === 'Pkg.Mines.Game', 'followed');
});

it('says so when the overview cannot be loaded, and retries', async () => {
  const { root, calls } = await hub({ overview: undefined });
  const view = await waitUntil(() => root.querySelector('umbradesktop-arcade-overview'), 'overview');
  await waitUntil(() => (view as HTMLElement).shadowRoot!.querySelector('[data-action="retry"]'), 'retry');
  ((view as HTMLElement).shadowRoot!.querySelector('[data-action="retry"]') as HTMLElement).click();
  await waitUntil(() => calls.filter((c) => c === 'getOverview').length === 2, JSON.stringify(calls));
});

it('keeps its top bar short and lets the body scroll in a fixed-size window', async () => {
  const { root } = await hub();
  await overviewOf(root);
  expect(root.querySelector('.hhead')!.getBoundingClientRect().height).to.be.lessThan(80);
  const body = root.querySelector('.body') as HTMLElement;
  expect(getComputedStyle(body).overflowY).to.equal('auto');
});

it('says it needs the desktop when there is no Arcade', async () => {
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`);
  await waitUntil(() => el.shadowRoot!.querySelector('.missing'), 'message');
});
```

  `{ overview: undefined }` overrides the default because the helper spreads `extra` last.

- [ ] **Step 2: Run, expect failure.** The old hub renders tabs; there is no overview element.

- [ ] **Step 3: The sizes.** In `hub/constants.ts`, replace the two sizes (keep `ARCADE_HUB_ALIAS`):

```ts
/**
 * The hub's opening content box: the mock's window less its titlebar. Two tiles side by side and the
 * game page's podium need this width.
 */
export const HUB_CONTENT_SIZE = { w: 820, h: 580 };

/** The smallest box the overview's tiles fit in, one column wide. */
export const HUB_MIN_CONTENT_SIZE = { w: 480, h: 420 };

/** Below this content width the overview's tiles go to one column. */
export const HUB_ONE_COLUMN_BELOW_PX = 640;
```

- [ ] **Step 4: The overview.** Create `hub/overview.element.ts`:

```ts
import { css, customElement, html, nothing, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { ArcadeBoardSummary, ArcadeOverview } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import type { ArcadeGame, UmbraDesktopGameLeaderboard } from '../games/game-manifest.js';
import { arcadeLook, arcadeTheme } from '../pieces/look.js';
import { CROWN_PATH, icon, medal } from '../pieces/parts.js';
import { ArcadeThemeController } from '../pieces/theme.controller.js';
import { formatScore } from '../shared/format.js';
import { ruleText, say } from '../shared/phrases.js';
import { DESKTOP_WINDOWS } from '../shared/windows.js';
import type { DesktopWindows } from '../shared/windows.js';
import { HUB_ONE_COLUMN_BELOW_PX } from './constants.js';

/**
 * Where the hub opens (design P11): the player's standing across everything, then a tile per game
 * with one row per mode, the player's medal and best beside the leader and their crown, or who is
 * next when the player leads. One read for all of it (design §3), and boards of games that are not
 * installed are left out, as round one's hub did.
 *
 * Fires `open-game` (detail `{ game }`) for the hub to route; Play opens the game itself.
 */
@customElement('umbradesktop-arcade-overview')
export class UmbraDesktopArcadeOverviewElement extends UmbLitElement {
  /** The installed games, by weight. */
  @state()
  private _games: ArcadeGame[] = [];

  /** The overview, once read. */
  @state()
  private _overview?: ArcadeOverview;

  /** Whether the read failed. */
  @state()
  private _failed = false;

  /** The Arcade. */
  #arcade?: UmbraDesktopArcadeContext;

  /** The window manager, for Play. */
  #windows?: DesktopWindows;

  constructor() {
    super();
    // Inside the hub, but its own shadow root: the hub's theme stamp does not reach `:host` here.
    new ArcadeThemeController(this);
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (!arcade) return;
      this.observe(arcade.games, (games) => (this._games = games), '_games');
      void this.#load();
    });
    this.consumeContext(DESKTOP_WINDOWS, (windows) => (this.#windows = windows));
  }

  /** Read the overview, again after a failure. */
  async #load(): Promise<void> {
    if (!this.#arcade) return;
    this._failed = false;
    const overview = await this.#arcade.getOverview();
    this._overview = overview;
    this._failed = overview === undefined;
  }

  /**
   * One board's summary.
   * @param game The game.
   * @param board The board's alias.
   * @returns Its summary, if the server knows it.
   */
  #summary(game: ArcadeGame, board: string): ArcadeBoardSummary | undefined {
    return this._overview?.boards.find((b) => b.game === game.alias && b.board === board);
  }

  /**
   * A board's name for the standing strip: the game's, plus the mode's when it has several.
   * @param summary The board.
   * @returns The name.
   */
  #boardName(summary: ArcadeBoardSummary): string {
    const game = this._games.find((g) => g.alias === summary.game)!;
    const label = this.localize.string(game.label);
    if (game.leaderboards.length < 2) return label;
    const board = game.leaderboards.find((b) => b.alias === summary.board);
    return `${label} ${board ? this.localize.string(board.label) : summary.board}`;
  }

  /** @param game The game to show. */
  #openGame(game: ArcadeGame): void {
    this.dispatchEvent(new CustomEvent('open-game', { detail: { game: game.alias }, bubbles: true, composed: true }));
  }

  /** @returns The overview. */
  override render() {
    const l = this.localize;
    if (this._failed) {
      return html`<p class="empty">${say(l, 'overviewUnavailable', 'The Arcade could not be loaded.')}</p>
        <button class="btn ghost sm" data-action="retry" @click=${() => this.#load()}>${say(l, 'retry', 'Retry')}</button>`;
    }
    const overview = this._overview;
    if (!overview) return html`<uui-loader-bar></uui-loader-bar>`;
    const installed = new Set(this._games.flatMap((g) => g.leaderboards.map((b) => `${g.alias}|${b.alias}`)));
    const boards = overview.boards.filter((b) => installed.has(`${b.game}|${b.board}`));
    const led = boards.filter((b) => b.viewer?.rank === 1);
    const topThree = boards.filter((b) => b.viewer && b.viewer.rank >= 2 && b.viewer.rank <= 3);
    return html`
      <div class="standing">
        <div class="glass" data-stat="lead">${icon(CROWN_PATH, 'crown big')}<b>${led.length}</b><span>${say(l, 'standLead', 'Boards you lead')}<br />${led.map((b) => this.#boardName(b)).join(', ')}</span></div>
        <div class="glass" data-stat="top3">${medal(2)}<b>${topThree.length}</b><span>${say(l, 'standTopThree', 'More in your top three')}<br />${topThree.map((b) => this.#boardName(b)).join(', ')}</span></div>
        <div class="glass" data-stat="colleagues"><span class="medal p" aria-hidden="true">#</span><b>${overview.colleagues}</b><span>${say(l, 'standColleagues', 'Colleagues playing')}</span></div>
      </div>
      <div class="tiles">${this._games.map((game) => this.#tile(game))}</div>`;
  }

  /**
   * One game's tile: art, name, rule, Play, and a row per mode. Selecting the tile opens the game's
   * page; its name is the keyboard's way to do the same.
   * @param game The game.
   * @returns The tile.
   */
  #tile(game: ArcadeGame) {
    const l = this.localize;
    return html`<article class="tile glass ${game.leaderboards.length > 1 ? 'wide' : ''}" data-game=${game.alias} @click=${() => this.#openGame(game)}>
      <div class="ttop">
        <div class="art"><uui-icon name=${game.icon}></uui-icon></div>
        <div class="tinfo">
          <button class="tname display" data-action="open-game" @click=${(event: Event) => { event.stopPropagation(); this.#openGame(game); }}>${l.string(game.label)}</button>
          <div class="tsub">${ruleText(l, game.leaderboards[0], game.rule)}</div>
        </div>
        <button class="btn sm" data-action="play" @click=${(event: Event) => { event.stopPropagation(); this.#windows?.openApp(game.app); }}>${say(l, 'play', 'Play')}</button>
      </div>
      ${game.leaderboards.map((board) => this.#modeRow(game, board))}
    </article>`;
  }

  /**
   * One mode: its name, the player's medal and best or "Not played yet", and the leader with the
   * crown, or "Next" when the player leads.
   * @param game The game.
   * @param board The mode.
   * @returns The row.
   */
  #modeRow(game: ArcadeGame, board: UmbraDesktopGameLeaderboard) {
    const l = this.localize;
    const lang = l.lang();
    const summary = this.#summary(game, board.alias);
    const viewer = summary?.viewer;
    const score = (value: number) => html`<b>${formatScore(board.format, value, lang)}</b>`;
    let lead: unknown = nothing;
    if (viewer?.rank === 1 && summary?.next) {
      lead = html`${say(l, 'next', 'Next: {0}', summary.next.displayName)} ${score(summary.next.value)}`;
    } else if (summary?.leader && viewer?.rank !== 1) {
      lead = html`${icon(CROWN_PATH, 'crown')}${summary.leader.displayName} ${score(summary.leader.value)}`;
    }
    return html`<div class="mrow" data-board=${board.alias}>
      <span class="mode">${l.string(board.label)}</span>
      ${viewer
        ? html`<span class="mine">${medal(viewer.rank)}${score(viewer.value)}</span>`
        : html`<span class="mine none">${say(l, 'notPlayed', 'Not played yet')}</span>`}
      <span class="lead">${lead}</span>
    </div>`;
  }

  /** The mock's overview (section 1). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host { display: block; container-type: inline-size; }
      .standing { display: flex; gap: 10px; margin-bottom: 16px; }
      .standing .glass { flex: 1; padding: 12px 16px; display: flex; align-items: center; gap: 12px; }
      .standing b { font-weight: 700; font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; }
      .standing span { font-size: 12px; color: var(--arcade-soft); line-height: 1.3; }
      .crown.big { width: 26px; height: 26px; }
      .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .tile { padding: 16px 16px 8px; position: relative; overflow: hidden; cursor: pointer; }
      .tile.wide { grid-column: span 2; }
      .ttop { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
      .ttop .btn { margin-inline-start: auto; }
      .art { width: 48px; height: 48px; border-radius: 13px; display: grid; place-items: center; flex: none; font-size: 26px; background: linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 4%)); box-shadow: var(--arcade-edge); }
      .tname { border: 0; background: none; padding: 0; font-weight: 600; font-size: 18px; text-align: start; }
      .tsub { font-size: 12px; color: var(--arcade-faint); }
      .mrow { display: grid; grid-template-columns: 76px 1fr 1fr; align-items: center; gap: 10px; padding: 9px 2px; border-top: 1px solid var(--arcade-ring); }
      .mode { font-weight: 600; font-size: 13px; color: var(--arcade-soft); }
      .mine { display: flex; align-items: center; gap: 9px; }
      .mine b { font-weight: 700; font-size: 20px; font-variant-numeric: tabular-nums; }
      .mine.none { font-size: 13px; color: var(--arcade-faint); }
      .lead { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--arcade-soft); }
      .lead b { color: var(--arcade-text); font-variant-numeric: tabular-nums; }
      .empty { color: var(--arcade-soft); }
      @container (width < ${unsafeCSS(HUB_ONE_COLUMN_BELOW_PX)}px) {
        .tiles { grid-template-columns: 1fr; }
        .tile.wide { grid-column: auto; }
        .standing { flex-direction: column; }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-overview': UmbraDesktopArcadeOverviewElement;
  }
}
```

- [ ] **Step 5: The hub.** Replace `hub/hub.element.ts` with:

```ts
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { ArcadeProfile } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { ensureArcadeFont } from '../pieces/font.js';
import { arcadeLook, arcadeTheme } from '../pieces/look.js';
import { TROPHY_PATH, avatar, icon } from '../pieces/parts.js';
import { say } from '../shared/phrases.js';
import './game-page.element.js';
import './overview.element.js';
import './profile.element.js';

/** Where the hub is: its overview, one game's page, or the player's profile. */
type HubView = { kind: 'overview' } | { kind: 'game'; game: string; board?: string } | { kind: 'profile' };

/**
 * The Arcade (design P11): it opens on the overview, a tile opens a game's page, and the player's
 * name opens their profile. The top bar navigates and nothing else. It also takes a request from the
 * Arcade context to show a board, when it opens and while it is open, which is how the panel's
 * "Open in the Arcade" and the beaten toast land on the right board (design §4).
 */
@customElement('umbradesktop-arcade-hub')
export class UmbraDesktopArcadeHubElement extends UmbLitElement {
  /** Where the hub is. */
  @state()
  private _view: HubView = { kind: 'overview' };

  /** Whether the Arcade context answered at all. */
  @state()
  private _connected = false;

  /** The registered games. */
  @state()
  private _games: ArcadeGame[] = [];

  /** The player's settings, for their name in the top bar. */
  @state()
  private _profile?: ArcadeProfile;

  constructor() {
    super();
    ensureArcadeFont();
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this._connected = arcade !== undefined;
      if (!arcade) return;
      this.observe(arcade.games, (games) => (this._games = games), '_games');
      this.observe(arcade.profile, (profile) => (this._profile = profile), '_profile');
      this.observe(
        arcade.hubRequest,
        (request) => {
          if (!request) return;
          this._view = { kind: 'game', game: request.game, board: request.board };
          arcade.clearHubRequest();
        },
        '_hubRequest',
      );
      void arcade.refreshProfile();
    });
  }

  /** The name opens the profile, and closes it again. */
  #toggleProfile(): void {
    this._view = this._view.kind === 'profile' ? { kind: 'overview' } : { kind: 'profile' };
  }

  /** @returns The hub. */
  override render() {
    const l = this.localize;
    if (!this._connected) return html`<p class="missing">${say(l, 'needsDesktop', 'The Arcade only works on the desktop.')}</p>`;
    const view = this._view;
    const game = view.kind === 'game' ? this._games.find((g) => g.alias === view.game) : undefined;
    const name = this._profile?.displayName ?? '';
    const atHome = view.kind === 'overview' || (view.kind === 'game' && !game);
    return html`<div class="room felt">
      <header class="hhead">
        ${atHome
          ? html`${icon(TROPHY_PATH, 'trophy')}<h1 class="display">${say(l, 'hub', 'Arcade')}</h1>`
          : html`<button class="back link" data-action="back" @click=${() => (this._view = { kind: 'overview' })}>‹ ${say(l, 'allGames', 'All games')}</button>`}
        <button class="me ${view.kind === 'profile' ? 'open' : ''}" data-action="profile" title=${say(l, 'yourProfile', 'Your profile')}
          aria-expanded=${String(view.kind === 'profile')} @click=${() => this.#toggleProfile()}>
          ${avatar({ userKey: 'me', displayName: name || '?', isViewer: true })}<span>${name}</span><span class="chev" aria-hidden="true">${view.kind === 'profile' ? '▲' : '▼'}</span>
        </button>
      </header>
      <div class="body">
        ${view.kind === 'profile'
          ? html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>`
          : game
            ? html`<umbradesktop-arcade-game-page .game=${game} .board=${view.kind === 'game' ? (view.board ?? '') : ''}></umbradesktop-arcade-game-page>`
            : html`<umbradesktop-arcade-overview @open-game=${(event: CustomEvent<{ game: string }>) => (this._view = { kind: 'game', game: event.detail.game })}></umbradesktop-arcade-overview>`}
      </div>
    </div>`;
  }

  /** The room, the top bar and the scrolling body (mock §1 to §3). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host { display: flex; flex-direction: column; height: 100%; }
      .room { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 22px 24px 0; }
      .hhead { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex: none; }
      .hhead h1 { margin: 0; font-weight: 700; font-size: 28px; line-height: 1; }
      .trophy { width: 34px; height: 34px; color: var(--arcade-gold); }
      .back { font-size: 13px; }
      .me { margin-inline-start: auto; display: flex; align-items: center; gap: 9px; padding: 4px 14px 4px 4px; border: 0; border-radius: var(--arcade-control-radius); background: var(--arcade-glass-strong); box-shadow: var(--arcade-edge); font-weight: 600; font-size: 13px; }
      .me.open { background: color-mix(in srgb, var(--arcade-accent) 18%, transparent); }
      .chev { color: var(--arcade-faint); font-size: 10px; }
      .body { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 22px; }
      .missing { padding: 20px; color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt)); }
    `,
  ];
}

export { UmbraDesktopArcadeHubElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-hub': UmbraDesktopArcadeHubElement;
  }
}
```

  `game-page.element.js` does not exist until Task 17; create it now as an empty element with the
  two properties (`game`, `board`) so this task's tests run, and fill it in Task 17.

- [ ] **Step 6: Run, expect pass.** `hub.element.test.ts`, then `npm test` and `npm run build` from `A`.
  The old `board.element.ts` and its tests still exist and pass; Task 17 removes them.

### Task 17: A game's page: podium, pill, pinned row, admin menus

**Files:**
- Write: `A/backoffice/src/hub/game-page.element.ts`
- Create: `A/backoffice/src/hub/game-page.element.test.ts`
- Delete: `A/backoffice/src/hub/board.element.ts`, `board.element.test.ts`, `board.moderation.test.ts`

Design P11 "Game page" and "Admin", P12, and the mock's section 2. The moderation logic moves over
from `board.element.ts` unchanged in behaviour (confirm first, reload on success, say so on failure,
`canModerate` from the server, never guessed); only where its buttons sit changes.

- [ ] **Step 1: Write the failing tests.** Create `game-page.element.test.ts`:

```ts
import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import './game-page.element.js';

const solitaire = { alias: 'Pkg.Sol.Game', app: 'Pkg.Sol', label: 'Solitaire', icon: 'icon-playing-cards', weight: 0, rule: 'Highest score wins, time bonus included', leaderboards: [{ alias: 'draw-1', label: 'Draw 1', better: 'higher' as const, format: 'points' as const }, { alias: 'draw-3', label: 'Draw 3', better: 'higher' as const, format: 'points' as const }] };
const e = (rank: number, name: string, value: number, isViewer = false): ArcadeBoardEntry => ({ rank, userKey: `k-${name}`, displayName: name, value, achievedAtUtc: '2026-09-30T09:00:00Z', isViewer });
const top = [e(1, 'Tom Visser', 3960), e(2, 'Sophie Bakker', 3710), e(3, 'Anna de Vries', 3120), e(4, 'Bram Jansen', 2870), e(5, 'Noor Hendriks', 2400)];
const board = (over: Partial<ArcadeBoard> = {}): ArcadeBoard => ({ played: true, top, viewer: e(12, 'Luuk Peters', 1140, true), viewerIsPublic: true, canModerate: false, players: 12, above: e(11, 'Eva', 1200), ...over });

/** The page for Solitaire under a fake Arcade, once its board is drawn. */
async function page(options: Parameters<typeof arcadeHarness>[0] = {}, boardAlias = '') {
  const harness = await arcadeHarness({ games: [solitaire], board: board(), ...options });
  const el = await fixture(html`<umbradesktop-arcade-game-page .game=${solitaire} .board=${boardAlias}></umbradesktop-arcade-game-page>`, { parentNode: harness.wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('.podium, .empty'), 'drawn');
  return { el, root: el.shadowRoot!, ...harness };
}

it('names the game, its rule, and its one action, Play', async () => {
  const { root, calls } = await page();
  expect(root.querySelector('h2')!.textContent).to.equal('Solitaire');
  expect(root.querySelector('.ghero')!.textContent).to.contain('Highest score wins, time bonus included');
  expect(root.querySelectorAll('.ghero button')).to.have.length(1);
  (root.querySelector('[data-action="play"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('open:Pkg.Sol'), JSON.stringify(calls));
});

it('stands the top three on a podium, lists the rest, and pins you under a divider outside the top ten', async () => {
  const { root } = await page();
  expect([...root.querySelectorAll('.podium .pod')].map((p) => p.getAttribute('data-rank'))).to.deep.equal(['2', '1', '3']);
  expect([...root.querySelectorAll('.list .lr')].map((r) => r.getAttribute('data-rank'))).to.deep.equal(['4', '5']);
  const pinned = root.querySelector('.pinned .lr')!;
  expect(pinned.classList.contains('mine')).to.equal(true);
  expect(pinned.textContent).to.contain('Luuk Peters').and.contain('You').and.contain('1,140');
  expect(root.querySelector('.pinned .gap')).to.not.equal(null);
});

it('marks your own row Only you see this while your scores are hidden', async () => {
  const { root } = await page({ board: board({ viewerIsPublic: false }) });
  expect(root.querySelector('.pinned .lr')!.textContent).to.contain('Only you see this');
});

it('does not pin you when you are already on the page', async () => {
  const mine = e(2, 'Luuk Peters', 3710, true);
  const { root } = await page({ board: board({ top: [top[0], mine, top[2]], viewer: mine, above: top[0] }) });
  expect(root.querySelector('.pinned')).to.equal(null);
  expect(root.querySelector('.pod.mine')).to.not.equal(null);
});

it('opens on the mode it is given, else the one last played, and switches with the pill', async () => {
  const given = await page({}, 'draw-3');
  expect(given.calls).to.include('getBoard:Pkg.Sol.Game:draw-3');
  const remembered = await page({ lastBoard: { 'Pkg.Sol.Game': 'draw-3' } });
  expect(remembered.calls).to.include('getBoard:Pkg.Sol.Game:draw-3');
  const fresh = await page();
  expect(fresh.calls).to.include('getBoard:Pkg.Sol.Game:draw-1');
  (fresh.root.querySelector('[data-mode="draw-3"]') as HTMLElement).click();
  await waitUntil(() => fresh.calls.includes('getBoard:Pkg.Sol.Game:draw-3'), JSON.stringify(fresh.calls));
});

it('gives a moderator a menu per row and Reset this board, and nobody else', async () => {
  const player = await page();
  expect(player.root.querySelector('[data-action="remove"]')).to.equal(null);
  expect(player.root.querySelector('[data-action="reset-board"]')).to.equal(null);
  const admin = await page({ board: board({ canModerate: true }) });
  expect(admin.root.querySelectorAll('.list [data-action="remove"]')).to.have.length(2);
  expect(admin.root.querySelectorAll('.podium [data-action="remove"]')).to.have.length(3);
  expect(admin.root.querySelector('[data-action="reset-board"]')).to.not.equal(null);
});

it('removes a score after confirming, and reloads the board', async () => {
  const { root, calls } = await page({ board: board({ canModerate: true }) });
  root.querySelector('.list [data-action="remove"]')!.dispatchEvent(new CustomEvent('click-label'));
  await waitUntil(() => calls.some((c) => c.startsWith('removeScore:')), JSON.stringify(calls));
  expect(calls).to.include('confirm:Remove this score?');
  expect(calls).to.include('removeScore:Pkg.Sol.Game:draw-1:k-Bram Jansen');
  await waitUntil(() => calls.filter((c) => c.startsWith('getBoard')).length === 2, 'reloaded');
});

it('resets a name and the board after confirming', async () => {
  const { root, calls } = await page({ board: board({ canModerate: true }) });
  root.querySelector('.list [data-action="reset-name"]')!.dispatchEvent(new CustomEvent('click-label'));
  await waitUntil(() => calls.includes('resetName:k-Bram Jansen'), JSON.stringify(calls));
  (root.querySelector('[data-action="reset-board"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('resetBoard:Pkg.Sol.Game:draw-1'), JSON.stringify(calls));
  expect(calls).to.include('confirm:Reset this board?');
});

it('does nothing when the moderator cancels, and says so when the server refuses', async () => {
  const cancelled = await page({ board: board({ canModerate: true }), confirmAnswer: 'cancel' });
  (cancelled.root.querySelector('[data-action="reset-board"]') as HTMLElement).click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(cancelled.calls.some((c) => c.startsWith('resetBoard'))).to.equal(false);
  const refused = await page({ board: board({ canModerate: true }), failWrites: true });
  (refused.root.querySelector('[data-action="reset-board"]') as HTMLElement).click();
  await waitUntil(() => refused.root.querySelector('[role="alert"]'), 'error shown');
});

it('says when nobody has played yet, and when the board cannot be loaded', async () => {
  const unplayed = await page({ board: { played: false, top: [], viewer: null, viewerIsPublic: true, canModerate: false, players: 0, above: null } });
  expect(unplayed.root.querySelector('.empty')!.textContent).to.contain('Nobody has played this yet.');
  const harness = await arcadeHarness({ games: [solitaire], board: undefined });
  const el = await fixture(html`<umbradesktop-arcade-game-page .game=${solitaire}></umbradesktop-arcade-game-page>`, { parentNode: harness.wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-action="retry"]'), 'retry offered');
});
```

  If the harness's fake modal manager does not satisfy `umbConfirmModal` in 17.7.0, look at how the
  deleted `board.moderation.test.ts` passed and keep that arrangement.

- [ ] **Step 2: Run, expect failure.** The placeholder renders nothing.

- [ ] **Step 3: Write the page.** The podium's `extra` (Task 9) carries the moderator's menu for
  the top three, who stand on the podium rather than in the list. Replace the placeholder `hub/game-page.element.ts` with:

```ts
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import type { ArcadeGame } from '../games/game-manifest.js';
import { arcadeLook, arcadeTheme } from '../pieces/look.js';
import { entryRow, podium } from '../pieces/parts.js';
import { ArcadeThemeController } from '../pieces/theme.controller.js';
import { ruleText, say } from '../shared/phrases.js';
import { DESKTOP_WINDOWS } from '../shared/windows.js';
import type { DesktopWindows } from '../shared/windows.js';

/**
 * One game's page (design P11, P12): the game's name and rule with Play alone on the right, the mode
 * pill centred above the board it switches, the top three on a podium, ranks four to ten as a list,
 * and the player's own row pinned under a divider when they are outside the top ten. Moderators get a
 * "⋯" menu per player (remove score, reset name) and Reset this board at the bottom, each confirmed
 * (D11). Whether the viewer may moderate comes from the server's `canModerate`, never a guess.
 */
@customElement('umbradesktop-arcade-game-page')
export class UmbraDesktopArcadeGamePageElement extends UmbLitElement {
  /** The game. */
  @property({ attribute: false })
  game?: ArcadeGame;

  /** The mode to open on; the one last played when empty. */
  @property()
  board = '';

  /** The mode on show. */
  @state()
  private _mode = '';

  /** That board, or undefined while loading. */
  @state()
  private _data?: ArcadeBoard;

  /** Whether the read failed. */
  @state()
  private _failed = false;

  /** What the last failed moderation call said, until the next attempt. */
  @state()
  private _error?: string;

  /** The Arcade. */
  #arcade?: UmbraDesktopArcadeContext;

  /** The window manager, for Play. */
  #windows?: DesktopWindows;

  constructor() {
    super();
    // Inside the hub, but its own shadow root: the hub's theme stamp does not reach `:host` here.
    new ArcadeThemeController(this);
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (arcade) this.#start();
    });
    this.consumeContext(DESKTOP_WINDOWS, (windows) => (this.#windows = windows));
  }

  /**
   * Start over when the hub hands over another game or mode, in the same render.
   * @param changed The properties that changed.
   */
  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('game') || changed.has('board')) this.#start();
  }

  /** Pick the mode to show (P12) and load it. */
  #start(): void {
    const game = this.game;
    if (!game || !this.#arcade) return;
    const wanted = this.board || this.#arcade.lastBoard(game.alias) || '';
    const mode = game.leaderboards.some((b) => b.alias === wanted) ? wanted : game.leaderboards[0].alias;
    if (mode === this._mode && this._data) return;
    this._mode = mode;
    void this.#load();
  }

  /** Read the board on show; a slow answer for a mode switched away from is dropped. */
  async #load(): Promise<void> {
    const game = this.game;
    const mode = this._mode;
    if (!this.#arcade || !game || !mode) return;
    this._data = undefined;
    this._failed = false;
    const data = await this.#arcade.getBoard(game.alias, mode);
    if (game !== this.game || mode !== this._mode) return;
    this._data = data;
    this._failed = data === undefined;
  }

  /** @param mode The mode to switch to. */
  #switch(mode: string): void {
    if (mode === this._mode) return;
    this._mode = mode;
    this._error = undefined;
    void this.#load();
  }

  /**
   * Run a moderation call; reload on success, say so on failure.
   * @param action The call; resolves true when the server accepted it.
   */
  async #act(action: () => Promise<boolean> | undefined): Promise<void> {
    this._error = undefined;
    if (await action()) await this.#load();
    else this._error = say(this.localize, 'actionFailed', 'That did not work. Try again.');
  }

  /**
   * Ask before something destructive.
   * @param headline The question.
   * @param content What it will do.
   * @param confirmLabel The button.
   * @returns Whether they confirmed.
   */
  #confirm(headline: string, content: string, confirmLabel: string): Promise<boolean> {
    return umbConfirmModal(this, { headline, content, color: 'danger', confirmLabel }).then(
      () => true,
      () => false,
    );
  }

  /** @param entry The row whose score to remove. */
  async #remove(entry: ArcadeBoardEntry): Promise<void> {
    const l = this.localize;
    if (await this.#confirm(say(l, 'removeScoreHeadline', 'Remove this score?'), entry.displayName, say(l, 'remove', 'Remove'))) {
      await this.#act(() => this.#arcade?.removeScore(this.game!.alias, this._mode, entry.userKey));
    }
  }

  /** @param entry The row whose name to reset. */
  async #resetName(entry: ArcadeBoardEntry): Promise<void> {
    const l = this.localize;
    if (await this.#confirm(say(l, 'resetNameHeadline', 'Reset this name?'), say(l, 'resetNameText', 'The player goes back to their Umbraco name: {0}', entry.displayName), say(l, 'reset', 'Reset'))) {
      await this.#act(() => this.#arcade?.resetName(entry.userKey));
    }
  }

  /** Empty the board on show. */
  async #reset(): Promise<void> {
    const l = this.localize;
    if (await this.#confirm(say(l, 'resetBoardHeadline', 'Reset this board?'), say(l, 'resetBoardText', 'Every score on it is removed. This cannot be undone.'), say(l, 'reset', 'Reset'))) {
      await this.#act(() => this.#arcade?.resetBoard(this.game!.alias, this._mode));
    }
  }

  /**
   * A moderator's menu for one player, or nothing. Shown on hover and on keyboard focus.
   * Confirm in the installed source that `umb-dropdown` takes its button text in the `label` slot and
   * that `uui-menu-item` fires `click-label` (`packages/core/components/dropdown/dropdown.element.js`,
   * and UUI's menu item).
   * @param entry The row.
   * @returns The menu.
   */
  #menu(entry: ArcadeBoardEntry) {
    if (!this._data?.canModerate) return nothing;
    const l = this.localize;
    return html`<umb-dropdown class="more" compact hide-expand look="secondary" label=${say(l, 'moreActions', 'More actions for {0}', entry.displayName)}>
      <span slot="label" aria-hidden="true">⋯</span>
      <uui-menu-item data-action="remove" label=${say(l, 'removeScore', 'Remove score')} @click-label=${() => this.#remove(entry)}></uui-menu-item>
      <uui-menu-item data-action="reset-name" label=${say(l, 'resetName', 'Reset name')} @click-label=${() => this.#resetName(entry)}></uui-menu-item>
    </umb-dropdown>`;
  }

  /** @returns The page. */
  override render() {
    const game = this.game;
    if (!game) return nothing;
    const l = this.localize;
    const definition = game.leaderboards.find((b) => b.alias === this._mode) ?? game.leaderboards[0];
    return html`
      <header class="ghero">
        <div class="art"><uui-icon name=${game.icon}></uui-icon></div>
        <div>
          <h2 class="display">${l.string(game.label)}</h2>
          <div class="tsub">${ruleText(l, definition, game.rule)}</div>
        </div>
        <button class="btn play" data-action="play" @click=${() => this.#windows?.openApp(game.app)}>▶&nbsp; ${say(l, 'play', 'Play')}</button>
      </header>
      ${game.leaderboards.length > 1
        ? html`<div class="pill-row"><div class="seg" role="tablist">
            ${game.leaderboards.map(
              (b) => html`<button role="tab" data-mode=${b.alias} aria-selected=${String(b.alias === this._mode)} @click=${() => this.#switch(b.alias)}>${l.string(b.label)}</button>`,
            )}
          </div></div>`
        : nothing}
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      ${this.#board(definition.format)}`;
  }

  /**
   * The board: podium, list, pinned row, and Reset this board for a moderator.
   * @param format The board's format.
   * @returns The board.
   */
  #board(format: 'points' | 'time') {
    const l = this.localize;
    const data = this._data;
    if (this._failed) {
      return html`<p class="empty">${say(l, 'boardUnavailable', 'The board could not be loaded.')}</p>
        <button class="btn ghost sm" data-action="retry" @click=${() => this.#load()}>${say(l, 'retry', 'Retry')}</button>`;
    }
    if (!data) return html`<uui-loader-bar></uui-loader-bar>`;
    if (!data.played) return html`<p class="empty">${say(l, 'boardEmpty', 'Nobody has played this yet.')}</p>`;
    const lang = l.lang();
    const date = (entry: ArcadeBoardEntry) => l.date(new Date(entry.achievedAtUtc), { day: 'numeric', month: 'short' });
    const options = { format, you: say(l, 'you', 'You'), lang, youMode: 'mark' as const };
    const pinned = data.viewer && !data.top.some((e) => e.isViewer) ? data.viewer : undefined;
    const rest = data.top.filter((e) => e.rank > 3);
    return html`
      ${podium(data.top.slice(0, 3), { ...options, extra: (entry) => this.#menu(entry) })}
      ${rest.length || pinned
        ? html`<div class="glass list-box">
            <ol class="list">${rest.map((entry) => entryRow(entry, { ...options, date: date(entry), extra: this.#menu(entry) }))}</ol>
            ${pinned
              ? html`<ol class="pinned">
                  <li class="gap" aria-hidden="true">···</li>
                  ${entryRow(pinned, { ...options, date: date(pinned), onlyYou: data.viewerIsPublic ? undefined : say(l, 'onlyYou', 'Only you see this') })}
                </ol>`
              : nothing}
          </div>`
        : nothing}
      ${data.canModerate
        ? html`<div class="admin"><button class="btn danger sm" data-action="reset-board" @click=${() => this.#reset()}>${say(l, 'resetBoard', 'Reset this board')}</button></div>`
        : nothing}`;
  }

  /** The mock's game page (section 2). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host { display: block; }
      .ghero { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
      .ghero h2 { margin: 0; font-weight: 700; font-size: 28px; line-height: 1.1; }
      .art { width: 72px; height: 72px; border-radius: 18px; display: grid; place-items: center; font-size: 32px; flex: none; background: linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 4%)); box-shadow: var(--arcade-edge); }
      .tsub { font-size: 12px; color: var(--arcade-faint); }
      .play { margin-inline-start: auto; padding: 11px 26px; font-size: 14px; }
      .pill-row { text-align: center; margin: 10px 0 2px; }
      .podium { margin: 0 60px 10px; }
      .podium .av { width: 42px; height: 42px; font-size: 13px; }
      .pod[data-rank='1'] .av { width: 50px; height: 50px; }
      .pod[data-rank='1'] > .crown { width: 22px; height: 22px; }
      .list-box { padding: 6px; }
      .lr .more { opacity: 0; transition: opacity 120ms; }
      .lr:hover .more, .lr:focus-within .more, .pod:hover .more, .pod:focus-within .more { opacity: 1; }
      .admin { display: flex; justify-content: flex-end; margin-top: 14px; }
      .error { color: var(--arcade-danger); }
      .empty { color: var(--arcade-soft); }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-game-page': UmbraDesktopArcadeGamePageElement;
  }
}
```

- [ ] **Step 4: Delete the old board.** `git rm` is not needed and not wanted (no commits): delete
  `hub/board.element.ts`, `hub/board.element.test.ts` and `hub/board.moderation.test.ts` from disk.
  Nothing else imports the board element once Task 16's hub is in; confirm with
  `grep -rn "board.element" A/backoffice/src`.

- [ ] **Step 5: Run, expect pass.** Then `npm test` and `npm run build` from `A`.

### Task 18: The profile, behind your name

**Files:**
- Rewrite: `A/backoffice/src/hub/profile.element.ts`
- Rewrite: `A/backoffice/src/hub/profile.element.test.ts`
- Delete: `A/backoffice/src/hub/profile.validation.test.ts` (its cases move into the new test file)

Design P8 and P11 "Profile", and the mock's section 3. Every setting says what happens, not what it is
called. The switches are native checkboxes with `role="switch"`, styled in the Arcade's look, rather
than `uui-toggle`, which is drawn for Umbraco's light surfaces and would sit wrongly on the felt;
under Windows 98 they fall back to the system checkbox.

- [ ] **Step 1: Write the failing tests.** Replace `profile.element.test.ts` with:

```ts
import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import './profile.element.js';

const profile = { displayName: 'Luuk Peters', isPublic: true, notifyWhenBeaten: true, askedAboutPublic: true };

/** The profile under a fake Arcade, once drawn. */
async function mount(options: Parameters<typeof arcadeHarness>[0] = {}) {
  const harness = await arcadeHarness({ profile, ...options });
  const el = await fixture(html`<umbradesktop-arcade-profile></umbradesktop-arcade-profile>`, { parentNode: harness.wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-setting="show"]'), 'drawn');
  return { el, root: el.shadowRoot!, ...harness };
}

it('says what each setting does, in the leaderboard words', async () => {
  const { root } = await mount();
  const text = root.textContent!;
  expect(text).to.contain('Your name on the leaderboards').and.contain('Show my scores on the leaderboards')
    .and.contain("Off: colleagues don't see them; you still see your own rank.")
    .and.contain('Tell me when someone takes first place from me').and.contain('Delete my scores');
  expect(text).not.to.match(/private|public/i);
});

it('reflects the settings in its switches', async () => {
  const { root } = await mount({ profile: { ...profile, isPublic: false } });
  expect((root.querySelector('[data-setting="show"]') as HTMLInputElement).checked).to.equal(false);
  expect(root.querySelector('[data-setting="show"]')!.getAttribute('role')).to.equal('switch');
  expect((root.querySelector('[data-setting="notify"]') as HTMLInputElement).checked).to.equal(true);
});

it('shows or hides the scores through the Arcade', async () => {
  const { root, calls } = await mount();
  (root.querySelector('[data-setting="show"]') as HTMLInputElement).click();
  await waitUntil(() => calls.includes('shown:false'), JSON.stringify(calls));
});

it('saves the notification setting', async () => {
  const { root, calls } = await mount();
  (root.querySelector('[data-setting="notify"]') as HTMLInputElement).click();
  await waitUntil(() => calls.includes('updateProfile:{"notifyWhenBeaten":false}'), JSON.stringify(calls));
});

it('saves a trimmed name, and never a blank one', async () => {
  const { root, calls } = await mount();
  const input = root.querySelector('input#name') as HTMLInputElement;
  const save = root.querySelector('[data-action="save-name"]') as HTMLButtonElement;
  input.value = '   ';
  input.dispatchEvent(new Event('input'));
  await (root.host as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
  expect(save.disabled).to.equal(true);
  input.value = '  Luuk  ';
  input.dispatchEvent(new Event('input'));
  await (root.host as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
  save.click();
  await waitUntil(() => calls.includes('updateProfile:{"displayName":"Luuk"}'), JSON.stringify(calls));
});

it('deletes the scores after confirming', async () => {
  const { root, calls } = await mount();
  (root.querySelector('[data-action="delete"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('deleteMyScores'), JSON.stringify(calls));
  expect(calls).to.include('confirm:Delete your scores?');
});

it('says so when a change cannot be saved', async () => {
  const { root } = await mount({ failWrites: true });
  (root.querySelector('[data-setting="notify"]') as HTMLInputElement).click();
  await waitUntil(() => root.querySelector('[role="alert"]'), 'error shown');
});
```

- [ ] **Step 2: Run, expect failure.** The old profile has `uui-toggle`s with `data-setting="public"`.

- [ ] **Step 3: Write the profile.** Replace `hub/profile.element.ts` with:

```ts
import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import type { ArcadeProfile } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import { arcadeLook, arcadeTheme } from '../pieces/look.js';
import { ArcadeThemeController } from '../pieces/theme.controller.js';
import { say } from '../shared/phrases.js';

/**
 * The player's own settings, behind their name in the hub's top bar (design P11): the name on the
 * leaderboards, showing their scores, being told when someone takes first place, and deleting it
 * all. Each says what happens rather than what it is called (P8). Grouped in boxes; nothing is hidden.
 */
@customElement('umbradesktop-arcade-profile')
export class UmbraDesktopArcadeProfileElement extends UmbLitElement {
  /** The settings as last read. */
  @state()
  private _profile?: ArcadeProfile;

  /** The name as typed, before saving; undefined while untouched. */
  @state()
  private _name?: string;

  /** What the last failed change said, until the next attempt. */
  @state()
  private _error?: string;

  /** The Arcade. */
  #arcade?: UmbraDesktopArcadeContext;

  constructor() {
    super();
    // Inside the hub, but its own shadow root: the hub's theme stamp does not reach `:host` here.
    new ArcadeThemeController(this);
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (!arcade) return;
      this.observe(arcade.profile, (profile) => {
        this._profile = profile;
        this._name = undefined;
      }, '_profile');
      void arcade.refreshProfile();
    });
  }

  /** @returns The typed name without surrounding whitespace: what is saved, and what decides whether saving is allowed. */
  get #trimmed(): string {
    return (this._name ?? '').trim();
  }

  /**
   * Run a call and say so when it fails, rather than leaving a switch looking saved.
   * @param call Resolves true when the server accepted it.
   * @param failure The sentence for a failure.
   */
  async #run(call: () => Promise<boolean> | undefined, failure: string): Promise<void> {
    this._error = undefined;
    if (!(await call())) this._error = failure;
  }

  /** @returns The words for a change that did not save. */
  get #saveFailed(): string {
    return say(this.localize, 'saveFailed', 'Your changes could not be saved.');
  }

  /** Save the trimmed name; a blank one is never sent. */
  async #saveName(): Promise<void> {
    if (this._name === undefined || !this.#trimmed) return;
    await this.#run(() => this.#arcade?.updateProfile({ displayName: this.#trimmed }), this.#saveFailed);
  }

  /** Delete everything after confirming. */
  async #delete(): Promise<void> {
    const l = this.localize;
    const ok = await umbConfirmModal(this, {
      headline: say(l, 'deleteHeadline', 'Delete your scores?'),
      content: say(l, 'deleteText', 'Your scores and Arcade settings are removed from every board. This cannot be undone.'),
      color: 'danger',
      confirmLabel: say(l, 'delete', 'Delete'),
    }).then(
      () => true,
      () => false,
    );
    if (ok) await this.#run(() => this.#arcade?.deleteMyScores(), say(l, 'deleteFailed', 'Your scores could not be deleted.'));
  }

  /** @returns The settings. */
  override render() {
    const l = this.localize;
    const profile = this._profile;
    if (!profile) return html`<uui-loader-bar></uui-loader-bar>`;
    const nameLabel = say(l, 'leaderboardName', 'Your name on the leaderboards');
    return html`<div class="prof">
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      <section class="box glass">
        <h2 class="display">${nameLabel}</h2>
        <p>${say(l, 'leaderboardNameHelp', 'What colleagues see next to your scores. It starts as your Umbraco name.')}</p>
        <div class="field">
          <input id="name" class="input" maxlength="32" aria-label=${nameLabel} .value=${this._name ?? profile.displayName}
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <button class="btn" data-action="save-name" ?disabled=${this._name === undefined || !this.#trimmed} @click=${() => this.#saveName()}>${say(l, 'save', 'Save')}</button>
        </div>
      </section>
      <section class="box glass">
        <label class="tog">
          <span><b>${say(l, 'showScores', 'Show my scores on the leaderboards')}</b><span>${say(l, 'showScoresHelp', "Off: colleagues don't see them; you still see your own rank.")}</span></span>
          <input type="checkbox" role="switch" class="sw" data-setting="show" .checked=${profile.isPublic}
            @change=${(e: Event) => this.#run(() => this.#arcade?.setScoresShown((e.target as HTMLInputElement).checked), this.#saveFailed)} />
        </label>
        <label class="tog">
          <span><b>${say(l, 'notifyBeaten', 'Tell me when someone takes first place from me')}</b><span>${say(l, 'notifyBeatenHelp', 'Shown the next time you open the desktop.')}</span></span>
          <input type="checkbox" role="switch" class="sw" data-setting="notify" .checked=${profile.notifyWhenBeaten}
            @change=${(e: Event) => this.#run(() => this.#arcade?.updateProfile({ notifyWhenBeaten: (e.target as HTMLInputElement).checked }), this.#saveFailed)} />
        </label>
      </section>
      <section class="box glass">
        <h2 class="display">${say(l, 'deleteMyScores', 'Delete my scores')}</h2>
        <p>${say(l, 'deleteHelp', 'Removes every score and your name from the Arcade. This cannot be undone.')}</p>
        <div class="field"><button class="btn danger" data-action="delete" @click=${() => this.#delete()}>${say(l, 'deleteMyScores', 'Delete my scores')}…</button></div>
      </section>
    </div>`;
  }

  /** The mock's profile (section 3). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host { display: block; }
      .prof { max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
      .box { padding: 16px 18px; }
      .box h2 { margin: 0 0 3px; font-weight: 600; font-size: 17px; }
      .box p { margin: 0; font-size: 13px; color: var(--arcade-soft); }
      .field { display: flex; gap: 10px; margin-top: 12px; }
      .input { flex: 1; border: 0; border-radius: 10px; padding: 9px 12px; font: inherit; font-size: 14px; color: var(--arcade-text); background: rgb(0 0 0 / 25%); box-shadow: var(--arcade-edge); }
      .tog { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-top: 1px solid var(--arcade-ring); cursor: pointer; }
      .tog:first-child { border-top: 0; padding-top: 2px; }
      .tog > span { flex: 1; }
      .tog b { display: block; font-weight: 600; font-size: 14px; }
      .tog span span { font-size: 12px; color: var(--arcade-soft); }
      .sw { appearance: none; margin: 0; width: 42px; height: 24px; border-radius: 999px; background: rgb(255 255 255 / 18%); position: relative; flex: none; cursor: pointer; }
      .sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 40%); transition: left 120ms; }
      .sw:checked { background: linear-gradient(90deg, var(--arcade-accent-deep), var(--arcade-accent)); }
      .sw:checked::after { left: 21px; }
      .sw:focus-visible { outline: 2px solid var(--arcade-accent); outline-offset: 2px; }
      :host([data-umbradesktop-theme='win98']) .sw { appearance: auto; width: auto; height: auto; background: none; }
      :host([data-umbradesktop-theme='win98']) .sw::after { display: none; }
      :host([data-umbradesktop-theme='win98']) .input { border-radius: 0; background: #fff; color: #000; }
      .error { color: var(--arcade-danger); margin: 0; }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-profile': UmbraDesktopArcadeProfileElement;
  }
}
```

  The overview, the game page and the profile each run an `ArcadeThemeController`, as the pieces
  do: the desktop stamps the hub element, and a stamp on the hub's `:host` does not match the
  `:host([data-umbradesktop-theme=…])` rules in a child's own shadow root.

- [ ] **Step 4: Delete** `hub/profile.validation.test.ts` (its blank-name case is above).

- [ ] **Step 5: Run, expect pass.** Then `npm test` and `npm run build` from `A`. Check
  `bundle.manifests.test.ts` still passes with the new hub sizes and alias constant.

---

# Phase E: The games

Entertainment imports nothing from the Arcade (D4). Its bridge, `E/backoffice/src/shared/arcade.ts`,
declares the slice of the context it uses, and the games render the Arcade's tags by name. In
Entertainment's own tests the tags are unknown elements: a test checks that the game placed the tag
with the right property, attribute or listener, not what the card draws. The card's own tests did
that in Phase C, and Task 24 checks the two together in a real desktop.

### Task 19: The bridge hands games the result, a standing, and whether the Arcade is there

**Files:**
- Modify: `E/backoffice/src/shared/arcade.ts`
- Test: `E/backoffice/src/shared/arcade.test.ts`
- Modify: `E/backoffice/src/umbradesktop-app.d.ts` (the copy of `MetaUmbraDesktopGame` gains `rule?: string`)

- [ ] **Step 1: Write the failing tests.** In `arcade.test.ts`:
  - Give `FakeArcade` a `getStanding()` that returns `this.behaviour.getStanding?.() ?? Promise.resolve(undefined)`,
    and add `getStanding?: () => Promise<unknown>` to its behaviour type.
  - Change the existing assertions that `submit` resolves `true`/`false` to the new answers: the
    accepted result object, or `undefined`.
  - Add, inside `describe('ArcadeScores')`, providing the fake the way this file's other cases do:

```ts
  it('hands back the accepted result and passes the options through', async () => {
    const { host, game } = await mount();
    const accepted = { status: 'accepted', isPersonalBest: true, rank: 2, rankText: '2nd', value: 310 };
    const arcade = new FakeArcade(host, { submit: async () => accepted, getBest: async () => null });
    host.provideContext(ARCADE_CONTEXT, arcade as never);
    const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
    expect(await scores.submit('default', 310, { showsResult: true })).to.equal(accepted);
    expect(arcade.calls).to.deep.equal([['Pkg.Snake.Game', 'default', 310, { showsResult: true }]]);
  });

  it('answers undefined for a refused score', async () => {
    const { host, game } = await mount();
    host.provideContext(ARCADE_CONTEXT, new FakeArcade(host, { submit: async () => ({ status: 'rejected' }), getBest: async () => null }) as never);
    expect(await new ArcadeScores(game, 'Pkg.Snake.Game').submit('default', 0)).to.equal(undefined);
  });

  it('reads a standing, and says whether the Arcade is there', async () => {
    const { host, game } = await mount();
    const standing = { best: 480, rank: 1, rankText: '1st' };
    host.provideContext(ARCADE_CONTEXT, new FakeArcade(host, { submit: async () => undefined, getBest: async () => 480, getStanding: async () => standing }) as never);
    const scores = new ArcadeScores(game, 'Pkg.Snake.Game');
    expect(await scores.standing('default')).to.equal(standing);
    expect(await scores.reachable()).to.equal(true);
  });

  it('has no standing and is not reachable without the Arcade', async () => {
    const lone = await fixture<Game>(html`<umbradesktop-entertainment-arcade-test-game></umbradesktop-entertainment-arcade-test-game>`);
    const scores = new ArcadeScores(lone, 'Pkg.Snake.Game');
    expect(await scores.standing('default')).to.equal(undefined);
    expect(await scores.reachable()).to.equal(false);
  });
```

- [ ] **Step 2: Run, expect failure.** From `E/backoffice`: `npx web-test-runner "src/shared/arcade.test.ts" --node-resolve`.

- [ ] **Step 3: Write it.** In `arcade.ts`, replace the `ArcadeForGames` interface and add the two
  answer types above it:

```ts
/** What the Arcade answers an accepted score, as far as a game reads it. The result card reads the rest. */
export interface ArcadeResult {
  /** Always accepted: anything else comes back as undefined. */
  status: 'accepted';
  /** Whether it replaced the player's best. */
  isPersonalBest: boolean;
  /** The player's rank, or would-be rank while their scores are hidden. */
  rank: number;
  /** That rank in words, in the backoffice language: "1st". */
  rankText: string;
  /** The value submitted. */
  value: number;
}

/** A player's standing on a board, for a game's own display. */
export interface ArcadeStanding {
  /** Their best. */
  best: number;
  /** Their rank. */
  rank: number;
  /** The rank in words. */
  rankText: string;
}

/**
 * The part of the Arcade's context a game uses, declared here because nothing is imported from
 * another package (design D4). `docs/developer/putting-your-game-on-the-arcade.md` in the Arcade
 * package is the contract.
 */
interface ArcadeForGames extends UmbContextMinimal {
  /** Submit a score. With `showsResult` the game shows the result card, and the Arcade neither asks nor toasts. */
  submit(game: string, board: string, value: number, options?: { showsResult?: boolean }): Promise<{ status: string } | undefined>;
  /** The player's best, null if unplayed, undefined if unreachable. */
  getBest(game: string, board: string): Promise<number | null | undefined>;
  /** The player's best and rank, null if unplayed, undefined if unreachable. */
  getStanding(game: string, board: string): Promise<ArcadeStanding | null | undefined>;
}
```

  Replace `submit` and add `standing` and `reachable` (keep `best`):

```ts
  /**
   * Submit a score. Never throws: a score is a courtesy to the player, not something a game may fail over.
   * @param board The board's alias.
   * @param value Points, or milliseconds.
   * @param options `showsResult` when the game will show the Arcade's result card for it.
   * @returns The accepted result, for the card; undefined without the Arcade or when it refused.
   */
  async submit(board: string, value: number, options: { showsResult?: boolean } = {}): Promise<ArcadeResult | undefined> {
    try {
      const result = await (await this.#reach())?.submit(this.#game, board, value, options);
      return result?.status === 'accepted' ? (result as ArcadeResult) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The player's standing on a board. Never throws.
   * @param board The board's alias.
   * @returns The standing; null when the Arcade is there but they have not played; undefined without it.
   */
  async standing(board: string): Promise<ArcadeStanding | null | undefined> {
    try {
      return await (await this.#reach())?.getStanding(this.#game, board);
    } catch {
      return undefined;
    }
  }

  /** @returns Whether the Arcade answered, waiting as briefly as `submit` does. For games that offer the leaderboard only with it. */
  async reachable(): Promise<boolean> {
    return (await this.#reach()) !== undefined;
  }
```

  In `E/backoffice/src/umbradesktop-app.d.ts`, add to its copy of `MetaUmbraDesktopGame`, after `icon`:
  `/** How to win, as the Arcade says it: a # key or a literal; derived per board when absent. */ rule?: string;`
  (Task 22's Solitaire manifest sets it; the copy exists because nothing is imported from the Arcade.)

- [ ] **Step 4: Run, expect pass.** Then `npm test` and `npm run build` from `E`. The three games'
  tests that stub `scores.submit` returning `true` still pass the runner but fail `tsc`; each game
  task below fixes its own.

### Task 20: Minesweeper shows the card on every win, and leaves its header alone

**Files:**
- Modify: `E/backoffice/src/minesweeper/minesweeper.element.ts`
- Test: `E/backoffice/src/minesweeper/minesweeper.element.test.ts`

Design P4 and the mock's section 4: the header (mine counter, New game, timer) stays exactly as it
is; on every win the card rises over the board, compact because the board is small (P10, chosen by
the card); a loss shows nothing new; the panel is reached only through the card's Leaderboard ›.

- [ ] **Step 1: Write the failing tests.** In `minesweeper.element.test.ts`, inside
  `describe('the Arcade')`: change the two existing fakes' `return true;` to `return undefined;`
  (they are "no card" cases now, and the first still expects 'Cleared.'), widen their `submit`
  parameters to `(board: string, value: number, _options?: unknown)`. Then add:

```ts
  /** What the Arcade hands back for a win. */
  const accepted = { status: 'accepted' as const, isPersonalBest: true, rank: 3, rankText: '3rd', value: 9_400 };

  /**
   * Win a game under WALL with the given scores line, in two clicks (see the first case here).
   * @param scores The fake line to the Arcade.
   * @returns The element after the win.
   */
  async function win(scores: unknown): Promise<MinesweeperElement> {
    let clock = 1000;
    const element = await fixture<MinesweeperElement>(html`<umbradesktop-minesweeper
      .placer=${placeAt(WALL)} .now=${() => clock} .scores=${scores}></umbradesktop-minesweeper>`);
    cells(element)[SAFE_CORNER].click();
    await settled(element);
    clock = 10_400;
    cells(element)[80].click();
    await settled(element);
    return element;
  }

  /** The status row's parts, by class, which the Arcade must never change (P4). */
  const header = (element: MinesweeperElement) => [...element.shadowRoot!.querySelector('.status')!.children].map((c) => c.className);

  it('shows the Arcade\'s result card over the board on a win, having asked for it', async () => {
    const options: unknown[] = [];
    const element = await win({ submit: async (_b: string, _v: number, o: unknown) => { options.push(o); return accepted; } });
    const card = await waitUntil(() => element.shadowRoot!.querySelector('.well umbradesktop-arcade-result'), 'card placed');
    expect((card as unknown as { result: unknown }).result).to.equal(accepted);
    expect(options).to.deep.equal([{ showsResult: true }]);
    expect(element.shadowRoot!.textContent, 'the card says it, so the banner does not').not.to.contain('Cleared.');
  });

  it('shows nothing new on a loss', async () => {
    const element = await fixture<MinesweeperElement>(html`<umbradesktop-minesweeper
      .placer=${placeAt(WALL)} .scores=${{ submit: async () => accepted }}></umbradesktop-minesweeper>`);
    cells(element)[SAFE_CORNER].click();
    await settled(element);
    cells(element)[MINED_CELL].click();
    await settled(element);
    expect(element.shadowRoot!.querySelector('umbradesktop-arcade-result')).to.equal(null);
    expect(element.shadowRoot!.textContent).to.contain('Boom.');
  });

  it('leaves its header exactly as it is, before and after a win', async () => {
    const plain = await fixture<MinesweeperElement>(html`<umbradesktop-minesweeper .placer=${placeAt(WALL)}></umbradesktop-minesweeper>`);
    const before = header(plain);
    const element = await win({ submit: async () => accepted });
    await waitUntil(() => element.shadowRoot!.querySelector('umbradesktop-arcade-result'), 'card placed');
    expect(before).to.deep.equal(['display mines', 'new-game', 'display clock']);
    expect(header(element)).to.deep.equal(before);
  });

  it('opens the panel from the card on the easy board, and deals a new game from Play again', async () => {
    const element = await win({ submit: async () => accepted });
    const card = (await waitUntil(() => element.shadowRoot!.querySelector('umbradesktop-arcade-result'), 'card')) as HTMLElement;
    card.dispatchEvent(new CustomEvent('leaderboard', { bubbles: true }));
    await element.updateComplete;
    const panel = element.shadowRoot!.querySelector('umbradesktop-arcade-leaderboard')!;
    expect(panel.hasAttribute('open')).to.equal(true);
    expect(panel.getAttribute('board')).to.equal('easy');
    panel.dispatchEvent(new CustomEvent('close'));
    await element.updateComplete;
    expect(panel.hasAttribute('open')).to.equal(false);
    card.dispatchEvent(new CustomEvent('play-again', { bubbles: true }));
    await settled(element);
    expect(element.shadowRoot!.querySelector('umbradesktop-arcade-result')).to.equal(null);
  });
```

  Import `waitUntil` from `@open-wc/testing` if the file does not yet.

- [ ] **Step 2: Run, expect failure.** From `E/backoffice`:
  `npx web-test-runner "src/minesweeper/minesweeper.element.test.ts" --node-resolve`.

- [ ] **Step 3: Wire it.** In `minesweeper.element.ts`:
  - Import `type ArcadeResult` with `ArcadeScores` from `'../shared/arcade.js'`.
  - After `scores`, add:

```ts
  /**
   * What the Arcade handed back for the last win, which the result card shows over the board
   * (design P4). Undefined before a win, after New game, and without the Arcade, in which case the
   * game's own "Cleared." banner shows as it always did.
   */
  @state()
  private _result?: ArcadeResult;

  /** Whether the leaderboard panel is open. Minesweeper opens it only from the card (P4). */
  @state()
  private _panelOpen = false;
```

  - Where the win submits, replace `void this.scores.submit(MINESWEEPER_EASY_BOARD, Math.round(this.now() - this.#startedAt));` with:

```ts
      // Ask for the result card's data rather than the Arcade's dialog and toast (design P3, P13). A
      // slow answer for a board already dealt over is dropped.
      const won = this._board;
      void this.scores
        .submit(MINESWEEPER_EASY_BOARD, Math.round(this.now() - this.#startedAt), { showsResult: true })
        .then((result) => {
          if (this._board === won) this._result = result;
        });
```

  - In `#newGame`, add `this._result = undefined;` and `this._panelOpen = false;`.
  - In `render`, change `outcome` so a win with a card shows no banner: wrap its expression as
    `board.status === 'won' && this._result ? '' : <the existing expression>`.
  - Inside `.well`, after the grid's closing `</div>`, add:

```ts
          ${this._result
            ? html`<umbradesktop-arcade-result
                .result=${this._result}
                @leaderboard=${() => (this._panelOpen = true)}
                @play-again=${() => this.#newGame()}
              ></umbradesktop-arcade-result>`
            : nothing}
```

  - As the last child of `.board`, after the outcome line:

```ts
        ${this._result
          ? html`<umbradesktop-arcade-leaderboard
              game=${MINESWEEPER_GAME_ALIAS}
              board=${MINESWEEPER_EASY_BOARD}
              ?open=${this._panelOpen}
              @close=${() => (this._panelOpen = false)}
            ></umbradesktop-arcade-leaderboard>`
          : nothing}
```

  - In the first `.well` rule of the styles, add `position: relative;` with a comment: the result
    card fills its nearest positioned ancestor, and covering the well, not the header, is what P4
    asks. It changes no geometry, so the size constants and the fits tests are unaffected.
  - Update the class doc's paragraph on the Arcade to say where the card and the panel go.

- [ ] **Step 4: Run, expect pass.** Then `npm test` and `npm run build` from `E`.

### Task 21: Snake's Best chip becomes the Arcade best, and opens the panel

**Files:**
- Modify: `E/backoffice/src/snake/snake.element.ts`
- Test: `E/backoffice/src/snake/snake.element.test.ts`
- Modify: `E/backoffice/src/bundle.manifests.ts` (Snake's board label), `E/backoffice/src/localization/en.ts`, `nl.ts`

Design P5 and the mock's section 5: the chip shows the Arcade best with the rank, gold, and clicking
it opens the panel; without the Arcade it stays the browser's best, as now. Game over shows the card.
A running game pauses while the panel is open (§4).

- [ ] **Step 1: Write the failing tests.** In `snake.element.test.ts`:
  - Change the existing 'shows the Arcade best when it is higher than the browser one' fake to
    `{ submit: async () => undefined, best: async () => undefined, standing: async () => ({ best: 300, rank: 2, rankText: '2nd' }) }`
    (the chip now reads the standing), and the 'submits the score once' fake's `return true` to
    `return undefined`, and add `standing: async () => undefined` to it.
  - Add:

```ts
describe('snake element: the Arcade pieces', () => {
  const standing = { best: 480, rank: 1, rankText: '1st' };
  const chip = (element: SnakeElement) => element.shadowRoot!.querySelector<HTMLElement>('[data-action="leaderboard"]');
  const panel = (element: SnakeElement) => element.shadowRoot!.querySelector('umbradesktop-arcade-leaderboard')!;

  it('shows the Arcade best with its rank on the Best chip, which opens the panel', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await waitUntil(() => chip(element), 'the chip becomes a button');
    expect(chip(element)!.textContent).to.contain('480').and.contain('1st');
    chip(element)!.click();
    await element.updateComplete;
    expect(panel(element).hasAttribute('open')).to.equal(true);
  });

  it('pauses a running game while the panel is open, and carries on when it closes', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(0)} .tickInterval=${() => 1000}
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await waitUntil(() => chip(element), 'chip');
    await press(element, 'ArrowRight');
    expect(status(element)).to.equal('playing');
    chip(element)!.click();
    await element.updateComplete;
    expect(status(element)).to.equal('paused');
    panel(element).dispatchEvent(new CustomEvent('close'));
    await element.updateComplete;
    expect(status(element)).to.equal('playing');
  });

  it('leaves a game paused by the player paused when the panel closes', async () => {
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(0)} .tickInterval=${() => 1000}
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await waitUntil(() => chip(element), 'chip');
    await press(element, 'ArrowRight');
    await press(element, ' ');
    chip(element)!.click();
    await element.updateComplete;
    panel(element).dispatchEvent(new CustomEvent('close'));
    await element.updateComplete;
    expect(status(element)).to.equal('paused');
  });

  it('shows the result card at game over, and a new best updates the chip', async () => {
    const probe = await game(foodAt(0), 1000);
    const ahead = cells(probe).findIndex((cell) => cell.dataset.part === 'head') + 1;
    probe.remove();
    const accepted = { status: 'accepted' as const, isPersonalBest: true, rank: 1, rankText: '1st', value: 520 };
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .placer=${foodAt(ahead, 0)} .tickInterval=${() => 10}
      .scores=${{ submit: async () => accepted, best: async () => undefined, standing: async () => standing }}></umbradesktop-snake>`);
    await waitUntil(() => chip(element), 'chip');
    await press(element, 'ArrowRight');
    await waitUntil(() => status(element) === 'over', 'the snake should reach the wall', { timeout: 3000 });
    const card = await waitUntil(() => element.shadowRoot!.querySelector('.well umbradesktop-arcade-result'), 'card');
    expect((card as HTMLElement).getAttribute('outcome')).to.equal('over');
    await waitUntil(() => text(element, '.best') === '520', 'chip shows the new best');
  });

  it('keeps the browser best on a plain chip without the Arcade', async () => {
    window.localStorage.setItem(BEST_SCORE_KEY, '70');
    const element = await fixture<SnakeElement>(html`<umbradesktop-snake
      .scores=${{ submit: async () => undefined, best: async () => undefined, standing: async () => undefined }}></umbradesktop-snake>`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chip(element)).to.equal(null);
    expect(text(element, '.best')).to.equal('70');
  });
});
```

  `ArrowRight` starts a game, as in the file's existing cases; at a one-second tick the snake is
  nowhere near the wall while these run. Space pauses (`PAUSE_KEYS` in the element).

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Wire it.** In `snake.element.ts`:
  - Import `type ArcadeResult, type ArcadeStanding` with `ArcadeScores`.
  - Change `scores` to `Pick<ArcadeScores, 'submit' | 'best' | 'standing'>`.
  - Add, after `scores`:

```ts
  /**
   * The player's Arcade standing, for the Best chip (design P5): undefined without the Arcade, when
   * the chip stays the browser's best; null with the Arcade but nothing played yet.
   */
  @state()
  private _standing?: ArcadeStanding | null;

  /** What the Arcade handed back at the last game over, which the result card shows. */
  @state()
  private _result?: ArcadeResult;

  /** Whether the leaderboard panel is open. */
  @state()
  private _panelOpen = false;

  /** Whether opening the panel paused a running game, so closing it carries on (and only then). */
  #resumeOnClose = false;
```

  - In `connectedCallback`, replace the `this.scores.best(...)` read with:

```ts
    // The Arcade's standing for the chip; the browser's best stays the fallback, and nothing waits on this.
    void this.scores.standing(SNAKE_BOARD_ALIAS).then((standing) => {
      this._standing = standing;
      if (standing && standing.best > this._best) this._best = standing.best;
    });
```

  - Where game over submits, replace the submit with:

```ts
      const finished = game;
      void this.scores.submit(SNAKE_BOARD_ALIAS, game.score * SNAKE_POINTS_PER_FOOD, { showsResult: true }).then((result) => {
        if (this._game !== finished || !result) return;
        this._result = result;
        const best = result.isPersonalBest ? result.value : (this._standing?.best ?? result.value);
        this._standing = { best, rank: result.rank, rankText: result.rankText };
        if (best > this._best) this._best = best;
      });
```

  - Add the panel's two handlers:

```ts
  /** Open the panel from the chip or the card, pausing a running game underneath (§4). */
  #openPanel(): void {
    if (this._game?.status === 'playing') {
      this._game = togglePause(this._game);
      this.#resumeOnClose = true;
    }
    this._panelOpen = true;
  }

  /** Close it, carry on if it was the panel that paused, and give the playfield the keyboard back. */
  #closePanel(): void {
    this._panelOpen = false;
    if (this.#resumeOnClose && this._game?.status === 'paused') this._game = togglePause(this._game);
    this.#resumeOnClose = false;
    this.shadowRoot?.querySelector<HTMLElement>('.field')?.focus();
  }
```

  - In `#newGame`, add `this._result = undefined;` and `this._panelOpen = false;`.
  - In the message getter, return nothing for `'over'` when `this._result` is set: the card says it.
  - In `render`, replace the Best display with:

```ts
          ${this._standing !== undefined
            ? html`<button
                class="display arcade-best"
                data-action="leaderboard"
                title=${this.localize.termOrDefault(`${AREA}_snakeOpenLeaderboard`, 'Open the leaderboard')}
                @mousedown=${(event: Event) => event.preventDefault()}
                @click=${() => this.#openPanel()}
              >
                <svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d=${CROWN_PATH}></path></svg>
                <span class="label">${this.localize.termOrDefault(`${AREA}_snakeBest`, 'Best')}</span>
                <span class="best">${Math.max(this._standing?.best ?? 0, this._best)}</span>${this._standing ? html`<span class="rank"> · ${this._standing.rankText}</span>` : nothing}
              </button>`
            : html`<span class="display">
                <span class="label">${this.localize.termOrDefault(`${AREA}_snakeBest`, 'Best')}</span>
                <span class="best">${this._best}</span>
              </span>`}
```

    `@mousedown` keeps focus on the playfield, so the click does not first pause the game through
    the playfield's blur handler; the chip then pauses it itself and knows to resume. Add, above the
    class, `const CROWN_PATH = 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8zm2.2 13h13.6v1.6H5.2z';` with a
    doc saying it is the Arcade's crown, copied because nothing is imported from the Arcade.
  - Inside `.well`, after the message (the well is already positioned for the message):

```ts
          ${this._result
            ? html`<umbradesktop-arcade-result
                outcome="over"
                .result=${this._result}
                @leaderboard=${() => this.#openPanel()}
                @play-again=${() => this.#newGame()}
              ></umbradesktop-arcade-result>`
            : nothing}
```

  - As the last child of `.board` (positioned, `position: relative` in its rule):

```ts
        ${this._standing !== undefined
          ? html`<umbradesktop-arcade-leaderboard
              game=${SNAKE_GAME_ALIAS}
              board=${SNAKE_BOARD_ALIAS}
              ?open=${this._panelOpen}
              @close=${() => this.#closePanel()}
            ></umbradesktop-arcade-leaderboard>`
          : nothing}
```
  - Styles for the chip: the gold is Snake's own, like Minesweeper's glyph colours (desktop-apps.md
    §4: an app owns its domain's colours):

```css
    .arcade-best {
      font: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #3a2a00;
      background: linear-gradient(90deg, #fff3c9, #fff);
      border-color: #d8a316;
      box-shadow: 0 0 0 3px rgb(216 163 22 / 15%);
    }
    .arcade-best .crown { width: 14px; height: 14px; color: #c99512; }
    .arcade-best:focus-visible { outline: 2px solid #c99512; outline-offset: 2px; }
```

    Keep the existing `.display` rules on it, so it sits in the header like the other two displays
    under every theme. Check the Windows 98 branch still bevels it.
  - In `bundle.manifests.ts`, Snake's leaderboard label becomes `'#umbraDesktopEntertainment_snakeClassic'`
    (settled point 9).
  - In `en.ts`: `snakeClassic: 'Classic',` and `snakeOpenLeaderboard: 'Open the leaderboard',`. In
    `nl.ts`: `snakeClassic: 'Klassiek',` and `snakeOpenLeaderboard: 'Ranglijst openen',`.

- [ ] **Step 4: Run, expect pass.** Then `npm test` and `npm run build` from `E`, including
  `dictionaries.test.ts` and `bundle.manifests.test.ts`.

### Task 22: Solitaire's win screen becomes the card; its settings gain Leaderboard

**Files:**
- Modify: `E/backoffice/src/solitaire/solitaire.element.ts`, `E/backoffice/src/solitaire/settings-modal.element.ts`
- Test: `E/backoffice/src/solitaire/solitaire.element.test.ts`, `E/backoffice/src/solitaire/settings-modal.element.test.ts`
- Modify: `E/backoffice/src/bundle.manifests.ts` (Solitaire's rule), `E/backoffice/src/localization/en.ts`, `nl.ts`

Design P6 and the mock's sections 6 and 7: after the cascade the win screen is the Arcade card, so the
Arcade adds no dialog; the settings dialog (the gear) gains "Leaderboard", which opens the panel on
the current draw mode; the clock stops while the panel is open. Without the Arcade, the win screen
stays and the dialog has no Leaderboard section.

- [ ] **Step 1: Write the failing tests.** In `settings-modal.element.test.ts`, mounting the dialog as
  that file does:

```ts
it('offers Leaderboard only when told the Arcade is there, and asks for it', async () => {
  // Mount once with showLeaderboard false: no [data-action="leaderboard"].
  // Mount with .showLeaderboard=${true}:
  const button = modal.shadowRoot!.querySelector('[data-action="leaderboard"]') as HTMLElement;
  setTimeout(() => button.click());
  await oneEvent(modal, 'solitaire-settings-leaderboard');
});
```

  In `solitaire.element.test.ts`, give the `solitaire()` helper a `scores` option, so the line to the
  Arcade is in place before `connectedCallback` asks whether it is reachable:

```ts
    scores?: SolitaireElement['scores'];
```

  in its options type, and `.scores=${options.scores ?? { submit: async () => undefined, reachable: async () => false }}`
  on the element. Then add a describe using the file's `solitaire()`, `nearlyWon()`, `doubleClick()`
  and `readout()` helpers:

```ts
describe('solitaire element: the Arcade pieces', () => {
  const accepted = { status: 'accepted' as const, isPersonalBest: true, rank: 2, rankText: '2nd', value: 110 };
  const here = { submit: async () => undefined, reachable: async () => true };

  /** Open the panel the way a player does: the gear, then Leaderboard. */
  async function openPanel(el: SolitaireElement) {
    (el.shadowRoot!.querySelector('.settings') as HTMLElement).click();
    const modal = (await waitUntil(() => el.shadowRoot!.querySelector('umbradesktop-solitaire-settings'), 'settings')) as HTMLElement & { showLeaderboard: boolean };
    await waitUntil(() => modal.showLeaderboard === true, 'told the Arcade is there');
    modal.dispatchEvent(new CustomEvent('solitaire-settings-leaderboard', { bubbles: true, composed: true }));
    await el.updateComplete;
    return el.shadowRoot!.querySelector('umbradesktop-arcade-leaderboard')!;
  }

  it('shows the Arcade card instead of its own win screen, asking for it', async () => {
    const options: unknown[] = [];
    const el = await solitaire({
      game: nearlyWon(),
      scores: { submit: async (_b: string, _v: number, o?: unknown) => { options.push(o); return accepted; }, reachable: async () => true },
    });
    doubleClick(el, '13S');
    const card = await waitUntil(() => el.shadowRoot!.querySelector('umbradesktop-arcade-result'), 'card');
    expect((card as unknown as { result: unknown }).result).to.equal(accepted);
    expect(el.shadowRoot!.querySelector('.win')).to.equal(null);
    expect(options).to.deep.equal([{ showsResult: true }]);
  });

  it('keeps its own win screen, and offers no leaderboard, without the Arcade', async () => {
    const el = await solitaire({ game: nearlyWon() });
    (el.shadowRoot!.querySelector('.settings') as HTMLElement).click();
    const modal = (await waitUntil(() => el.shadowRoot!.querySelector('umbradesktop-solitaire-settings'), 'settings')) as HTMLElement & { showLeaderboard: boolean };
    expect(modal.showLeaderboard).to.equal(false);
    modal.dispatchEvent(new CustomEvent('solitaire-settings-close', { bubbles: true, composed: true }));
    doubleClick(el, '13S');
    await waitUntil(() => el.shadowRoot!.querySelector('.win'), 'win screen');
    expect(el.shadowRoot!.querySelector('umbradesktop-arcade-result')).to.equal(null);
    expect(el.shadowRoot!.querySelector('umbradesktop-arcade-leaderboard')).to.equal(null);
  });

  it('opens the panel on the current draw mode from the settings dialog', async () => {
    const el = await solitaire({ game: { ...nearlyWon(), drawCount: 3 }, scores: here });
    const panel = await openPanel(el);
    expect(panel.hasAttribute('open')).to.equal(true);
    expect(panel.getAttribute('board')).to.equal('draw-3');
    expect(el.shadowRoot!.querySelector('umbradesktop-solitaire-settings')).to.equal(null);
  });

  it('stops the clock while the panel is open, and starts it again after', async () => {
    const el = await solitaire({ game: nearlyWon(), clockIntervalMs: 5, scores: here });
    await waitUntil(() => readout(el, 'time') !== '0:00', 'the clock runs');
    const panel = await openPanel(el);
    panel.dispatchEvent(new CustomEvent('open'));
    const stopped = readout(el, 'time');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(readout(el, 'time')).to.equal(stopped);
    panel.dispatchEvent(new CustomEvent('close'));
    await waitUntil(() => readout(el, 'time') !== stopped, 'the clock runs again');
  });
});
```

  The clock readout shows whole seconds; with `clockIntervalMs: 5` a tick is 5 ms, so 60 ms is a
  dozen ticks. A `nearlyWon()` game runs its clock from the start, as the existing case at
  `clockIntervalMs: 5` relies on. In the tests the panel is an unknown element (no Arcade is
  loaded), so they fire its `open` and `close` themselves, as the real panel would.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: The settings dialog.** In `settings-modal.element.ts`:
  - Add the property beside the others:
    `/** Whether to offer the Arcade's leaderboard: only when the Arcade is there (design P6). */ @property({ attribute: false }) showLeaderboard = false;`
  - Before the `<footer>`:

```ts
          ${this.showLeaderboard
            ? html`<section>
                <h3>${t('solitaireLeaderboard', 'Leaderboard')}</h3>
                <button class="done leaderboard" data-action="leaderboard"
                  @click=${() => this.dispatchEvent(new CustomEvent('solitaire-settings-leaderboard', { bubbles: true, composed: true }))}>
                  ${t('solitaireShowLeaderboard', 'Show the leaderboard')}
                </button>
              </section>`
            : nothing}
```

    (styled as the footer's Done button; import `nothing` if the file does not.)

- [ ] **Step 4: The game.** In `solitaire.element.ts`:
  - Import `type ArcadeResult` with `ArcadeScores`, and `timeBonus` from `./rules.js` (beside `withTimeBonus`).
  - Change `scores` to `Pick<ArcadeScores, 'submit' | 'reachable'>`.
  - Add state after `_won`:

```ts
  /** What the Arcade handed back for the win; the card replaces the win screen when it is set (design P6). */
  @state()
  private _result?: ArcadeResult;

  /** Whether the Arcade answered, which is when the settings dialog offers the leaderboard. */
  @state()
  private _arcadeHere = false;

  /** Whether the leaderboard panel is open. */
  @state()
  private _panelOpen = false;

  /** The board the panel opens on. */
  @state()
  private _panelBoard = '';

  /** The win's time bonus, for the card's detail line ("incl. 1,520 time bonus", the mock's section 6). */
  #bonus = 0;
```

  - In `connectedCallback`: `void this.scores.reachable().then((here) => (this._arcadeHere = here));`
  - In `#win`, replace the submit line (keep its comment) with:

```ts
    this.#bonus = timeBonus(this._elapsed);
    void this.scores.submit(solitaireBoard(this._game.drawCount), this._game.score, { showsResult: true }).then((result) => {
      // `epoch` is the one `#win` already takes on its first line; a New game since has bumped `#epoch`.
      if (epoch === this.#epoch) this._result = result;
    });
```

    `this._game.score` and `this._elapsed` here are the same values `withTimeBonus` used on the line
    above, so the bonus shown is the bonus counted.
  - In `#newGame`: `this._result = undefined; this._panelOpen = false;`.
  - Add:

```ts
  /** @param board The draw mode's board to open the panel on. */
  #openPanel(board: string): void {
    this._panelBoard = board;
    this._panelOpen = true;
  }

  /** Whether the clock was running when the panel opened, so closing it starts the clock again, and only then. */
  #clockBeforePanel = false;

  /** The panel opened over the table: stop the clock, remembering whether it ran (§4). */
  #onPanelOpen = (): void => {
    this.#clockBeforePanel = this.#timer !== undefined;
    this.#stopTimer();
  };

  /** The panel closed: carry on timing if the clock was running before. */
  #onPanelClose = (): void => {
    this._panelOpen = false;
    if (this.#clockBeforePanel && !this._won) this.#startTimer();
    this.#clockBeforePanel = false;
  };
```

  - In `render`, replace the `_won` block with:

```ts
        ${this._won && this._result
          ? html`<umbradesktop-arcade-result
              .result=${this._result}
              @leaderboard=${(event: CustomEvent<{ board: string }>) => this.#openPanel(event.detail.board)}
              @play-again=${() => void this.#newGame()}
            >
              ${this.#bonus > 0
                ? html`<span slot="detail">${this.localize.termOrDefault(`${AREA}_solitaireBonus`, `incl. ${this.#bonus.toLocaleString(this.localize.lang())} time bonus`, this.#bonus.toLocaleString(this.localize.lang()))}</span>`
                : nothing}
            </umbradesktop-arcade-result>`
          : this._won
            ? html`<div class="win" role="status"> …the existing win screen, unchanged… </div>`
            : nothing}
```

  - Pass `.showLeaderboard=${this._arcadeHere}` to `umbradesktop-solitaire-settings`, and handle its
    event: `@solitaire-settings-leaderboard=${() => { this.#closeSettings(); this.#openPanel(solitaireBoard(this._game!.drawCount)); }}`.
  - After the settings dialog, inside `.felt`:

```ts
        ${this._arcadeHere
          ? html`<umbradesktop-arcade-leaderboard
              game=${SOLITAIRE_GAME_ALIAS}
              board=${this._panelBoard}
              ?open=${this._panelOpen}
              @open=${this.#onPanelOpen}
              @close=${this.#onPanelClose}
            ></umbradesktop-arcade-leaderboard>`
          : nothing}
```

    The panel and the card stack above `.table` because `.table` is its own stacking context (see
    the styles' doc comment) and both pieces set their own `z-index`. Check that the toolbar stays
    visible above the panel's scrim or below it as the mock shows (the mock dims everything).
  - In `bundle.manifests.ts`, Solitaire's game manifest gains `rule: '#umbraDesktopEntertainment_solitaireRule',`.
  - Strings. `en.ts`: `solitaireRule: 'Highest score wins, time bonus included',`,
    `solitaireBonus: 'incl. {0} time bonus',`, `solitaireLeaderboard: 'Leaderboard',`,
    `solitaireShowLeaderboard: 'Show the leaderboard',`. `nl.ts`: `solitaireRule: 'Hoogste score wint, inclusief tijdbonus',`,
    `solitaireBonus: 'incl. {0} tijdbonus',`, `solitaireLeaderboard: 'Ranglijst',`,
    `solitaireShowLeaderboard: 'Toon de ranglijst',`.

- [ ] **Step 5: Run, expect pass.** Then `npm test` and `npm run build` from `E`. The existing
  'submits the final score … to the board for the game's own draw mode' test passes `submit` without
  `reachable`; give its fake `reachable: async () => false` and widen its `submit` parameters.

---

# Phase F: Docs, a real backoffice, done

### Task 23: Docs

**Files:** `A/docs/user/arcade.md` (rewrite), `A/docs/developer/putting-your-game-on-the-arcade.md`,
`A/README.md` (one line at most), `E/docs/user/games.md`, `docs/developer/desktop-apps.md` §5 and §7.2.

Design §7. Re-read `docs/developer/writing-documentation.md` first: front matter with a stable `id`,
relative links, procedures as commands with the goal first, UI labels in bold exactly as `en.ts` spells
them, "select" not "click", no em-dashes, no uppercase eyebrows. Screenshots come from Task 24; write
the pages now with the image lines in place and the files added there.

- [ ] **Step 1: The user page.** Rewrite `A/docs/user/arcade.md`, keeping `id: arcade` and its
  `sidebar_position`, with a new `description` ("See your scores in the games and on the
  leaderboards, choose whether colleagues see them, and delete them."). Sections, in this order, each
  short:
  1. Intro: the Arcade keeps your best score per board and ranks everyone's; it comes with a game
     that uses it; you do not install it yourself.
  2. **After a game.** The result card: your score, **New best** or **First place**, your rank of the
     number of players, the top of the board, **Leaderboard ›** and **Play again**. Where each game
     shows it: Minesweeper on every win, Snake at game over, Solitaire after a win, in place of its
     own win screen. A game that shows no card still keeps your score and tells you about a new best.
     Image: `../screenshots/arcade-result-card.png`.
  3. **The first time.** The card asks whether to show your scores on the leaderboard: **Yes, show
     my scores** or **No, only I see them**. Until you answer, they are hidden. While they are
     hidden, each card ends with "Your scores are hidden from the leaderboard." and **Show them**.
  4. **See the leaderboard while you play.** **Leaderboard ›** on the card; in Snake, the **Best**
     score at the top, which pauses the game while the leaderboard is open; in Solitaire, the
     settings gear > **Leaderboard** > **Show the leaderboard**. The switch at the top changes the
     mode, Esc or **Close** closes it, **Open in the Arcade ›** opens the same board in the Arcade.
  5. **Open the Arcade.** Launcher > **Games** > **Arcade**. It opens on where you stand: boards you
     lead, more in your top three, colleagues playing; then a tile per game with a row per mode
     ("Not played yet" for a mode you have not played). **Play** starts the game; selecting the tile
     opens its page, with the top three on a podium and your own row at the bottom when you are
     further down, marked **Only you see this** while your scores are hidden. **‹ All games** goes
     back. Image: `../screenshots/arcade-overview.png`.
  6. **Show or hide your scores.** Procedure: "To show or hide your scores, open the Arcade, select
     your name, and turn **Show my scores on the leaderboards** on or off." Off: colleagues do not see
     them; you still see your own rank.
  7. **Change your name on the leaderboards.** Procedure via your name > **Your name on the
     leaderboards** > **Save**. It starts as your Umbraco name, up to 32 characters.
  8. **When someone takes first place from you.** The next time you open the desktop, a notification
     names the game, both scores and your new rank. Select it to open that leaderboard. To stop
     them, turn off **Tell me when someone takes first place from me** under your name.
  9. **Delete your scores.** Procedure: your name > **Delete my scores…** > confirm. Keep round one's
     note that the first-time question returns on the next desktop visit.
  10. **For administrators.** Users with the **Users** section see a **⋯** menu per player on a
      game's page (**Remove score**, **Reset name**) and **Reset this board** at the bottom, each
      confirmed. Keep round one's sentence about why (junk scores).
  11. **When somebody leaves.** Keep round one's paragraph.

- [ ] **Step 2: The developer page.** In `putting-your-game-on-the-arcade.md`:
  - §1 "What you get": add the two pieces, and say the dialog and toasts are what a game gets
    without them.
  - §3 "The manifest": add the optional `rule` field (a `#` key or literal; derived from each board
    when absent; Solitaire's as the example).
  - §4 "Submitting a score": update the declared interface to Task 19's (`submit` with
    `options?: { showsResult?: boolean }`, `getStanding`), and the `ArcadeScores` excerpt to match.
  - New §5 "Showing scores in your game" (renumber the rest). Contents:
    - The two tags, both published API: `umbradesktop-arcade-result` and
      `umbradesktop-arcade-leaderboard`. Place them by tag name; import nothing; without the Arcade
      the tag renders nothing, so no check is needed.
    - Each fills its nearest positioned ancestor (`position: absolute; inset: 0`), so put it inside a
      positioned element covering what it should cover. That box decides its form: compact below
      292 pixels wide (the full card's 268 plus 12 each side), full above. The `compact` attribute
      forces compact. Say Minesweeper's 258-pixel well gets compact and Snake's 296-pixel well full.
    - The card: submit with `{ showsResult: true }`, then render
      `<umbradesktop-arcade-result .result=${result} outcome="won">` with the result `submit` handed
      back. `outcome` is `won` (default) or `over`. A `detail` slot takes one short line of your own.
      Events: `leaderboard` (detail `{ game, board }`) and `play-again`. It never removes itself.
      With `showsResult` the Arcade does not ask the privacy question or raise the "New best" toast:
      the card does both.
    - The panel: `<umbradesktop-arcade-leaderboard game="…" board="…" ?open=${open}>`; set `open` to
      show it; it fires `open` and `close` whenever that changes; Esc and ✕ close it. Pause on `open`
      and resume on `close` if your game runs underneath.
    - The theme: both read the desktop's theme themselves; your game does not pass it.
    - The worked examples: Minesweeper (card only, over the well), Snake (card, and a header button
      opening the panel), Solitaire (card in place of its win screen, panel from its settings), with
      links to the three element files.
    - Using neither: the first build's behaviour, kept: scores stored, the dialog the first time, a
      toast on a new best.
  - §8 "Checklist": add "If you show the card, you submit with `showsResult`" and "Your card or panel
    sits inside a positioned element".

- [ ] **Step 3: Entertainment's games page.** In `E/docs/user/games.md`, rewrite the "High scores"
  section: the Arcade keeps your best; Minesweeper shows your result after every win, Snake at game
  over and on its **Best** score, which opens the leaderboard, Solitaire after a win and from the
  settings gear. Link to the Arcade user page as the section already does.

- [ ] **Step 4: The host's app guide.** In `docs/developer/desktop-apps.md`:
  - §5, after the selector paragraph: a short sub-section "Not your app's own element?" saying an
    element a package lets apps place (the Arcade's pieces) is not stamped, and can read the active
    theme from the settings context's `theme` observable and stamp itself; link to
    `src/Umbraco.Community.UmbraDesktop.Services.Arcade/backoffice/src/pieces/theme.controller.ts`.
  - §7.2's table: a row for `theme`, "An observable of the active theme's id (§5)". Change "the two
    members below" to "the members below". This makes `theme` published API; say so in the row.

- [ ] **Step 5: The Arcade's README.** If its "For game authors" list says what a game gets, add at
  most one line: "Two elements, a result card and a leaderboard panel, show scores inside your game."
  Markdown only, no raw HTML (the README is the NuGet readme).

- [ ] **Step 6: Run the docs check.** From `H`: `npm run docs:check`. Green. A renamed heading that
  another page links to fails here; fix the link, not the check.

### Task 24: Verify in a real backoffice, under all five themes

Unit tests cannot show the container query in a real window, the one-click toast through the
desktop's notification centre, or the look under each theme. Round one's Task 29 found the bug no unit
test did. This task does it again, with a screenshot of every view in the mock under every theme.

Read first: the owner's memory notes on the headless check and the worktree instance recipe (the
`umbradesktop-headless-browser-check`, `umbradesktop-worktree-instance-recipe` and
`umbraco-parallel-test-instance` notes), and `docs/design/2026-09-24-accessories-design.md` §9.
The scripts from round one's run are gone; rebuild what you need in the session's scratchpad.

**The instance.** LocalDB copy `UmbraDesktop-Arcade`, port 5127, browsed as
`http://arcade.localhost:5127` (never `127.0.0.1` or `localhost`: the owner's other instances share
those cookie jars). Test users **Arcade Alice** and **Arcade Bob** already exist there, as does the
admin from `appsettings.Development.json` (read the credentials with a regex, never type them).
This is the owner's own application on a local development host, with existing test users; create no
new accounts unless step 3 needs them, and then only on this instance and with test values recorded
in the design doc's notes.

- [ ] **Step 1: Build.** `npm run build` in `H`, `A`, `E` and `src/Umbraco.Community.UmbraDesktop.Accessories`,
  then `dotnet build src/Umbraco.Community.UmbraDesktop.TestInstance`. The npm builds must come first:
  the instance serves the static web assets manifest written at build time.

- [ ] **Step 2: Start it detached.** One PowerShell call, so the environment reaches the process:

```powershell
$env:ConnectionStrings__umbracoDbDSN = 'Server=(localdb)\MSSQLLocalDB;Integrated Security=true;Initial Catalog=UmbraDesktop-Arcade'
$env:ConnectionStrings__umbracoDbDSN_ProviderName = 'Microsoft.Data.SqlClient'
$env:Umbraco__CMS__Unattended__InstallUnattended = 'false'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5127'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
Start-Process dotnet -ArgumentList 'run', '--no-build', '--project', 'src/Umbraco.Community.UmbraDesktop.TestInstance' -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\arcade-5127.out.log" -RedirectStandardError "$env:TEMP\arcade-5127.err.log"
```

  Wait for the log to say it is listening, patiently (this instance takes 8 to 20 seconds per section
  route). Check the log has no Arcade migration error: round one's tables stay, nothing migrates.

- [ ] **Step 3: Data.** The views need a board with at least five players and the player outside the
  top ten on one board. Alice, Bob and the admin are three. Scores belong to real users (a key with no
  user is hidden), so if more players are needed, create them through the backoffice's own API on this
  instance, as "Arcade Carol" and so on, with the Desktop section, record them in the notes, and say
  so in the report. Submit scores as each user from the page through the Arcade context:
  `UmbContextRequestEventImplementation` with `'default'` as its second argument, dispatched from
  `umbradesktop-taskbar`, alias `UmbraDesktopArcadeContext`, then `submit(game, board, value)`.
  Make: Snake with the viewer first; Minesweeper with the viewer third of twelve or so; Solitaire
  draw-1 second, draw-3 twelfth.

- [ ] **Step 4: Measure the threshold.** In the real desktop, at each game's default size: the card's
  host width in Minesweeper is under 292 and its `.short` has `display: none`; in Snake it is at least
  292 and `.short` shows; in Solitaire the full form. Write the three widths into the notes. If
  Snake's well is under 292 in a real window, stop and report: the threshold or Snake's placement
  needs the owner's decision, not a quiet change.

- [ ] **Step 5: Drive every view and screenshot it under all five themes.** Set the theme from the
  page with the settings context's `setTheme(id)`; themes apply live, so arrange a view once and loop
  over `umbraco`, `umbraco4`, `macos`, `win11`, `win98`. Save under
  `docs/design/screenshots/2026-10-03-arcade/<view>-<theme>.png`. The views, as the mock numbers
  them:
  1. The hub's overview.
  2. A game's page (Solitaire, draw-3, the viewer pinned at twelfth) with the pill.
  3. The profile.
  4. Minesweeper's card three ways: a new best (compact, chase line), the first-time question (as a
     user who never answered: Bob, or a user whose scores were deleted this visit), and a later win
     with scores hidden (the quiet line).
  5. Snake's card twice: game over not a best, and first place with "past …". And the gold Best chip.
  6. Solitaire's card after a win, with its time bonus line.
  7. The panel compact over Minesweeper, and full over Solitaire with the pill.
  8. The beaten toast: as the admin, take first place on Snake from Alice (Alice showing her scores,
     notifications on); sign in as Alice, open the desktop: one notification naming Snake, both
     scores and her new rank. Select it: the hub opens on Snake, once, with no second toast visible,
     no flash. Open the notification list and select the entry: the same. Screenshot the desktop's
     toast and the hub it opened.

  To reach a game's end state: Minesweeper's `placer` and `now` properties are public test seams
  (place mines, then reveal the safe cells); Snake ends on the wall with arrow keys; for Solitaire,
  set the element's `startingGame` before it connects, or drive a near-won deal. Say in the notes
  which views were reached by playing and which by a seam.

- [ ] **Step 6: Look at each screenshot.** For every view under every theme: nothing missing (a theme
  may restyle, never remove), text readable on its ground, the Windows 98 panels bevelled with black
  text, the ribbon and the medals legible, no uppercase letter-spaced labels anywhere, the podium not
  crowded at Snake's width. Tune `pieces/look.ts` (and only that file) where a theme's values fail,
  re-run `npm test` and `npm run build` in `A`, and retake those shots.

- [ ] **Step 7: Dutch.** Switch Alice's language to Dutch through the backoffice API
  (`UserService.putUserById` with `languageIsoCode: 'nl-NL'`), reload, and screenshot the overview
  and a Minesweeper card: "3e van 12", "Ja, toon mijn scores", no English left.

- [ ] **Step 8: Compose a gallery for the owner.** With `sharp` from `H/node_modules`, one image per
  view with the five themes side by side, into the same folder. Send them to the owner with
  `SendUserFile` at the end.

- [ ] **Step 9: Pick the docs' screenshots.** Copy the Umbraco-theme overview to
  `A/docs/screenshots/arcade-overview.png` and the Snake new-best card to
  `A/docs/screenshots/arcade-result-card.png`, captured at the size the page should show them
  (Markdown images cannot be resized). Run `npm run build` in `A` so Help gets them.

- [ ] **Step 10: Stop and restore.** Stop the instance's process (by the port's owning process, not by
  name: the owner runs other instances). Restore what a run dirties: `git status` and revert the
  TestInstance `packages.lock.json`, `Views/*.cshtml` line endings, `TriggerDeploy.ps1`, any
  `umbraco/Deploy/` folder, and `settings/wallpapers.generated.ts` line endings. Leave the database
  copy for the next run.

- [ ] **Step 11: Notes.** Add "## 8. Notes from the build" to the design doc
  (`docs/design/2026-10-03-arcade-player-experience-design.md`): what Umbraco did differently from
  this plan (each "confirm in the installed source" item and what it found), the three measured
  widths, any theme value changed and why, which views were reached through seams, and any test user
  created. Update its status line to "Built", with the date of this run.

### Task 25: Definition of done

Walk the repository's list (CLAUDE.md, "Definition of done") and say which items did not apply.

- [ ] `npm run build` and `npm test` pass in `H`, `A`, `E` and Accessories (unchanged, built by CI
  together). `dotnet test` passes for
  `src/Umbraco.Community.UmbraDesktop.Tests/Umbraco.Community.UmbraDesktop.Tests.csproj`,
  `src/Umbraco.Community.UmbraDesktop.Accessories.Tests/Umbraco.Community.UmbraDesktop.Accessories.Tests.csproj`
  and `src/Umbraco.Community.UmbraDesktop.Services.Arcade.Tests/Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.csproj`,
  each by project file.
- [ ] No shipped string says private or public: `wording.test.ts` passes, and
  `grep -rniE "'[^']*\b(private|public)\b[^']*'" A/backoffice/src E/backoffice/src --include=*.ts`
  finds nothing outside test files and TypeScript's own `private`/`public` keywords.
- [ ] Docs pages describe the feature (Task 23) and the docs check passes.
- [ ] README: the Arcade's gets at most one line; Entertainment's and the host's need none (the
  feature does not change what someone deciding to install would want to know). Say so.
- [ ] Marketplace: Entertainment's `umbraco-marketplace-umbraco.community.umbradesktop.entertainment.json`
  already carries "high scores" and "leaderboard" in `Tags`; `Description` unchanged. Ask the owner
  whether a screenshot of the card or the hub should join its `Screenshots`. The Arcade has no
  listing (D2).
- [ ] The design doc has its notes from the build and its status (Task 24 step 11). Round one's design
  doc already points at this one.
- [ ] Anything a run taught that is not obvious from the code is written where the next person hits
  it: the developer page for game authors, the notes for this repository.
- [ ] **Nothing committed, pushed or opened as a PR.** Report the changed files to the owner and stop.
