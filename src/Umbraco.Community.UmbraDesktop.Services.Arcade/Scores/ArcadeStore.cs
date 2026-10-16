using Microsoft.EntityFrameworkCore;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>
/// Everything the Arcade stores: profiles, boards, best scores and beaten events, with the rules of
/// design §4 to §6.
/// </summary>
/// <param name="database">Where the tables are.</param>
/// <param name="users">Who is hidden from the boards right now.</param>
/// <param name="clock">The site's clock.</param>
public sealed class ArcadeStore(IArcadeDatabase database, IArcadeUserDirectory users, TimeProvider clock)
{
    /// <summary>
    /// Check a score against the player's best, keep it if it is better, and say where it ranks.
    /// </summary>
    /// <param name="userKey">The player.</param>
    /// <param name="umbracoName">Their Umbraco name, for a new profile's display name.</param>
    /// <param name="definition">The board, from the game's manifest.</param>
    /// <param name="value">The score: points, or milliseconds.</param>
    /// <returns>How it went.</returns>
    public async Task<SubmitResult> SubmitAsync(Guid userKey, string umbracoName, LeaderboardDefinition definition, long value)
    {
        if (!ScoreRules.IsWellFormed(definition) || !ScoreRules.IsAcceptable(value, definition))
        {
            return SubmitResult.Refused(SubmitStatus.Rejected);
        }

        var now = clock.GetUtcNow().UtcDateTime;
        return await database.RunAsync(async db =>
        {
            var board = await db.Leaderboards.FindAsync(definition.Game, definition.Board);
            if (board is null)
            {
                db.Leaderboards.Add(new ArcadeLeaderboardEntity
                {
                    Game = definition.Game, Board = definition.Board, Better = definition.Better,
                    Format = definition.Format, Min = definition.Min, Max = definition.Max,
                });
            }
            else if (board.Better != definition.Better || board.Format != definition.Format || board.Min != definition.Min || board.Max != definition.Max)
            {
                return SubmitResult.Refused(SubmitStatus.Conflict);
            }

            var profile = await db.Profiles.FindAsync(userKey);
            if (profile is null)
            {
                profile = new ArcadeProfileEntity { UserKey = userKey, DisplayName = ScoreRules.CleanDisplayName(null, umbracoName) };
                db.Profiles.Add(profile);
            }

            var leaderBefore = await LeaderAsync(db, definition);

            // Who led as the player saw the board before this score, their own hidden score included.
            // `leaderBefore` is the public leader, which is what the beaten notification needs; "passed"
            // is about the player's own view, so a hidden player already ahead passes nobody new.
            var leaderAsSeen = (await RankedAsync(db, definition, userKey)).FirstOrDefault()?.UserKey;

            var score = await db.Scores.SingleOrDefaultAsync(s => s.UserKey == userKey && s.Game == definition.Game && s.Board == definition.Board);
            var previous = score?.Value;
            var isBest = score is null || ScoreRules.IsBetter(definition.Better, value, score.Value);
            if (score is null)
            {
                score = new ArcadeScoreEntity { UserKey = userKey, Game = definition.Game, Board = definition.Board };
                db.Scores.Add(score);
            }

            if (isBest)
            {
                score.Value = value;
                score.AchievedAtUtc = now;
            }

            await db.SaveChangesAsync();

            if (isBest)
            {
                await RecordBeatenAsync(db, definition, leaderBefore, userKey, value, now);
            }

            var ranked = await RankedAsync(db, definition, userKey);
            var rank = ranked.FindIndex(s => s.UserKey == userKey) + 1;
            PassedPlayer? passed = null;
            if (isBest && rank == 1 && leaderAsSeen is { } passedKey && passedKey != userKey)
            {
                // The passed player was shown a moment ago; if a race removed them since, name nobody
                // rather than throw.
                var passedProfile = await db.Profiles.FindAsync(passedKey);
                var passedScore = ranked.SingleOrDefault(s => s.UserKey == passedKey);
                if (passedProfile is not null && passedScore is not null)
                {
                    passed = new PassedPlayer(passedProfile.DisplayName, passedScore.Value);
                }
            }

            return new SubmitResult(SubmitStatus.Accepted, isBest, previous, rank, profile.IsPublic, profile.AskedAboutPublic, profile.DisplayName, passed);
        });
    }

    /// <summary>Change a player's settings, creating their profile if needed. Null leaves a field alone.</summary>
    /// <param name="userKey">The player.</param>
    /// <param name="umbracoName">Their Umbraco name, the display name's fallback.</param>
    /// <param name="displayName">A new display name.</param>
    /// <param name="isPublic">Show or hide their scores; answering also marks the one-time question as asked.</param>
    /// <param name="notifyWhenBeaten">Whether to be told when beaten.</param>
    /// <returns>The profile as saved.</returns>
    public Task<ArcadeProfile> UpdateProfileAsync(Guid userKey, string umbracoName, string? displayName, bool? isPublic, bool? notifyWhenBeaten) =>
        database.RunAsync(async db =>
        {
            var profile = await db.Profiles.FindAsync(userKey);
            if (profile is null)
            {
                profile = new ArcadeProfileEntity { UserKey = userKey, DisplayName = ScoreRules.CleanDisplayName(null, umbracoName) };
                db.Profiles.Add(profile);
            }

            if (displayName is not null) profile.DisplayName = ScoreRules.CleanDisplayName(displayName, umbracoName);
            if (isPublic is { } shown) { profile.IsPublic = shown; profile.AskedAboutPublic = true; }
            if (notifyWhenBeaten is { } notify) profile.NotifyWhenBeaten = notify;
            await db.SaveChangesAsync();
            return ArcadeProfile.From(profile);
        });

    /// <summary>How many rows a board lists (D7, section 7).</summary>
    public const int BoardSize = 10;

    /// <summary>A board for one viewer: the top public rows and the viewer's own standing.</summary>
    /// <param name="viewer">Who is looking.</param>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>The board.</returns>
    public Task<BoardView> GetBoardAsync(Guid viewer, string game, string board) =>
        database.RunAsync(async db =>
        {
            var entity = await db.Leaderboards.FindAsync(game, board);
            if (entity is null) return new BoardView(null, [], null, false);

            var definition = new LeaderboardDefinition(entity.Game, entity.Board, entity.Better, entity.Format, entity.Min, entity.Max);
            var names = await db.Profiles.ToDictionaryAsync(p => p.UserKey, p => p.DisplayName);
            var profile = await db.Profiles.FindAsync(viewer);
            var publicRanked = await RankedAsync(db, definition, null);
            var top = publicRanked.Take(BoardSize)
                .Select((s, i) => new BoardEntry(i + 1, s.UserKey, names[s.UserKey], s.Value, s.AchievedAtUtc, s.UserKey == viewer))
                .ToList();

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
        });

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

    /// <summary>A player's best on a board, or null if they have not played it.</summary>
    /// <param name="userKey">The player.</param>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>The best value.</returns>
    public Task<long?> GetBestAsync(Guid userKey, string game, string board) =>
        database.RunAsync(db => db.Scores
            .Where(s => s.UserKey == userKey && s.Game == game && s.Board == board)
            .Select(s => (long?)s.Value)
            .SingleOrDefaultAsync());

    /// <summary>A player's settings, or the defaults if they have none yet. Never creates a row.</summary>
    /// <param name="userKey">The player.</param>
    /// <param name="umbracoName">Their Umbraco name, the default display name.</param>
    /// <returns>The settings.</returns>
    public Task<ArcadeProfile> GetProfileAsync(Guid userKey, string umbracoName) =>
        database.RunAsync(async db => await db.Profiles.FindAsync(userKey) is { } profile
            ? ArcadeProfile.From(profile)
            : new ArcadeProfile(ScoreRules.CleanDisplayName(null, umbracoName), false, true, false));

    /// <summary>
    /// A board's scores in rank order: public players who are not hidden, plus
    /// <paramref name="alwaysInclude"/> whatever their settings. Loaded whole, which is fine: a board
    /// has at most one row per user of the site.
    /// </summary>
    /// <param name="db">The context.</param>
    /// <param name="definition">The board.</param>
    /// <param name="alwaysInclude">A player to keep even when private or hidden (the viewer), or null.</param>
    /// <returns>The ranked scores.</returns>
    private async Task<List<ArcadeScoreEntity>> RankedAsync(ArcadeDbContext db, LeaderboardDefinition definition, Guid? alwaysInclude)
    {
        var rows = await db.Scores
            .Where(s => s.Game == definition.Game && s.Board == definition.Board)
            .Join(db.Profiles, s => s.UserKey, p => p.UserKey, (s, p) => new { Score = s, p.IsPublic })
            .ToListAsync();
        var hidden = await users.GetHiddenAsync(rows.Select(r => r.Score.UserKey).ToArray());
        var visible = rows
            .Where(r => r.Score.UserKey == alwaysInclude || (r.IsPublic && !hidden.Contains(r.Score.UserKey)))
            .Select(r => r.Score);
        return Order(visible, definition.Better);
    }

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

    /// <summary>The public, visible player in first place, or null on an empty board.</summary>
    /// <param name="db">The context.</param>
    /// <param name="definition">The board.</param>
    /// <returns>The leader's key.</returns>
    private async Task<Guid?> LeaderAsync(ArcadeDbContext db, LeaderboardDefinition definition) =>
        (await RankedAsync(db, definition, null)).FirstOrDefault()?.UserKey;

    /// <summary>
    /// Record that <paramref name="leaderBefore"/> lost first place, if they did, to this score, and
    /// want to know (D10). Only a public scorer taking first place from someone else counts.
    /// </summary>
    /// <param name="db">The context.</param>
    /// <param name="definition">The board.</param>
    /// <param name="leaderBefore">Who led before this score.</param>
    /// <param name="userKey">Who just scored.</param>
    /// <param name="value">What they scored.</param>
    /// <param name="now">When.</param>
    /// <returns>A task.</returns>
    private async Task RecordBeatenAsync(ArcadeDbContext db, LeaderboardDefinition definition, Guid? leaderBefore, Guid userKey, long value, DateTime now)
    {
        if (leaderBefore is not { } beaten || beaten == userKey || await LeaderAsync(db, definition) != userKey)
        {
            return;
        }

        if (await db.Profiles.FindAsync(beaten) is not { NotifyWhenBeaten: true, IsPublic: true })
        {
            return;
        }

        var row = await db.Beaten.SingleOrDefaultAsync(b => b.UserKey == beaten && b.Game == definition.Game && b.Board == definition.Board);
        if (row is null)
        {
            row = new ArcadeBeatenEntity { UserKey = beaten, Game = definition.Game, Board = definition.Board };
            db.Beaten.Add(row);
        }

        row.ByUserKey = userKey;
        row.Value = value;
        row.AtUtc = now;
        await db.SaveChangesAsync();
    }

    /// <summary>Hand out a player's unread beaten events and delete them, in one transaction, so two tabs cannot both show one.</summary>
    /// <param name="userKey">The player.</param>
    /// <returns>Their events, newest first.</returns>
    public Task<IReadOnlyList<BeatenEvent>> TakeBeatenAsync(Guid userKey) =>
        database.RunAsync<IReadOnlyList<BeatenEvent>>(async db =>
        {
            var rows = await db.Beaten.Where(b => b.UserKey == userKey).OrderByDescending(b => b.AtUtc).ToListAsync();
            var events = new List<BeatenEvent>();
            foreach (var row in rows)
            {
                var by = await db.Profiles.FindAsync(row.ByUserKey);
                var board = await db.Leaderboards.FindAsync(row.Game, row.Board);
                if (by is not null && board is not null)
                {
                    events.Add(new BeatenEvent(row.Game, row.Board, by.DisplayName, row.Value, board.Format));
                }
            }

            db.Beaten.RemoveRange(rows);
            await db.SaveChangesAsync();
            return events;
        });

    /// <summary>Delete beaten events nobody read within <paramref name="age"/> (design section 6).</summary>
    /// <param name="age">How long an unread event is kept.</param>
    /// <returns>How many were removed.</returns>
    public Task<int> PruneBeatenAsync(TimeSpan age)
    {
        var cutoff = clock.GetUtcNow().UtcDateTime - age;
        return database.RunAsync(db => db.Beaten.Where(b => b.AtUtc < cutoff).ExecuteDeleteAsync());
    }

    /// <summary>Remove one player's score from one board (D11).</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <param name="userKey">The player.</param>
    /// <returns>Whether there was one.</returns>
    public Task<bool> RemoveScoreAsync(string game, string board, Guid userKey) =>
        database.RunAsync(async db =>
            await db.Scores.Where(s => s.Game == game && s.Board == board && s.UserKey == userKey).ExecuteDeleteAsync() > 0);

    /// <summary>Empty a board: its scores, its recorded rules and its unread events (D11).</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>Whether the board existed.</returns>
    public Task<bool> ResetBoardAsync(string game, string board) =>
        database.RunAsync(async db =>
        {
            await db.Scores.Where(s => s.Game == game && s.Board == board).ExecuteDeleteAsync();
            await db.Beaten.Where(b => b.Game == game && b.Board == board).ExecuteDeleteAsync();
            return await db.Leaderboards.Where(l => l.Game == game && l.Board == board).ExecuteDeleteAsync() > 0;
        });

    /// <summary>Put a player's display name back to their Umbraco name (D11).</summary>
    /// <param name="userKey">The player.</param>
    /// <param name="umbracoName">Their Umbraco name.</param>
    /// <returns>Whether they had a profile.</returns>
    public Task<bool> ResetDisplayNameAsync(Guid userKey, string umbracoName) =>
        database.RunAsync(async db =>
        {
            if (await db.Profiles.FindAsync(userKey) is not { } profile)
            {
                return false;
            }

            profile.DisplayName = ScoreRules.CleanDisplayName(null, umbracoName);
            await db.SaveChangesAsync();
            return true;
        });

    /// <summary>
    /// Remove everything about a player: profile, scores, and beaten events on either side. Used for
    /// "delete my scores" and when the Umbraco user is deleted (design section 6).
    /// </summary>
    /// <param name="userKey">The player.</param>
    /// <returns>A task.</returns>
    public Task ForgetUserAsync(Guid userKey) =>
        database.RunAsync(async db =>
        {
            await db.Beaten.Where(b => b.UserKey == userKey || b.ByUserKey == userKey).ExecuteDeleteAsync();
            await db.Scores.Where(s => s.UserKey == userKey).ExecuteDeleteAsync();
            await db.Profiles.Where(p => p.UserKey == userKey).ExecuteDeleteAsync();
            return true;
        });
}
