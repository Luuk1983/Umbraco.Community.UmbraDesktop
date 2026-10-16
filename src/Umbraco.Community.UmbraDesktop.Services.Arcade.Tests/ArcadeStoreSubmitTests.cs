using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>Submitting a score: what is kept, what is refused, what comes back.</summary>
public class ArcadeStoreSubmitTests : IAsyncLifetime
{
    /// <summary>Minesweeper's easy board: lower wins, a time.</summary>
    internal static readonly LeaderboardDefinition Easy = new("Pkg.Minesweeper.Game", "easy", "lower", "time", null, null);

    /// <summary>Snake: higher wins, points.</summary>
    internal static readonly LeaderboardDefinition Snake = new("Pkg.Snake.Game", "default", "higher", "points", null, null);

    /// <summary>The first player.</summary>
    internal static readonly Guid Ada = Guid.Parse("00000000-0000-0000-0000-00000000000a");

    /// <summary>The second player.</summary>
    internal static readonly Guid Grace = Guid.Parse("00000000-0000-0000-0000-00000000000b");

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The clock, so ties can be arranged.</summary>
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero));

    /// <summary>The store under test.</summary>
    private ArcadeStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new ArcadeStore(_database, new FakeUserDirectory(), _clock);
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>The first score is a personal best with no previous best, and creates a private profile under the Umbraco name.</summary>
    [Fact]
    public async Task First_score_is_a_best_and_creates_a_private_profile()
    {
        var result = await _store.SubmitAsync(Ada, "Ada Lovelace", Easy, 9_400);

        Assert.Equal(SubmitStatus.Accepted, result.Status);
        Assert.True(result.IsPersonalBest);
        Assert.Null(result.PreviousBest);
        Assert.Equal(1, result.Rank);
        Assert.False(result.IsPublic);
        Assert.False(result.AskedAboutPublic);
        var profile = await _database.ReadAsync(db => db.Profiles.SingleAsync());
        Assert.Equal("Ada Lovelace", profile.DisplayName);
    }

    /// <summary>On a lower-wins board a faster time replaces the best and a slower one changes nothing.</summary>
    [Fact]
    public async Task Keeps_only_the_best_on_a_lower_wins_board()
    {
        await _store.SubmitAsync(Ada, "Ada", Easy, 9_400);
        var slower = await _store.SubmitAsync(Ada, "Ada", Easy, 12_000);
        var faster = await _store.SubmitAsync(Ada, "Ada", Easy, 8_100);

        Assert.False(slower.IsPersonalBest);
        Assert.True(faster.IsPersonalBest);
        Assert.Equal(9_400, faster.PreviousBest);
        Assert.Equal(8_100, (await _database.ReadAsync(db => db.Scores.SingleAsync())).Value);
    }

    /// <summary>On a higher-wins board it is the other way round.</summary>
    [Fact]
    public async Task Keeps_only_the_best_on_a_higher_wins_board()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Ada, "Ada", Snake, 120);

        Assert.Equal(300, (await _database.ReadAsync(db => db.Scores.SingleAsync())).Value);
    }

    /// <summary>An equal value ranks behind whoever set it first (D8).</summary>
    [Fact]
    public async Task Ties_go_to_whoever_was_first()
    {
        await _store.UpdateProfileAsync(Ada, "Ada", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        _clock.Advance(TimeSpan.FromMinutes(1));

        var grace = await _store.SubmitAsync(Grace, "Grace", Snake, 300);

        Assert.Equal(2, grace.Rank);
    }

    /// <summary>Resubmitting an equal value later is not a best: the original value and date stay, so the tie rule holds.</summary>
    [Fact]
    public async Task An_equal_resubmit_keeps_the_original_value_and_date()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        var original = await _database.ReadAsync(db => db.Scores.SingleAsync());
        _clock.Advance(TimeSpan.FromMinutes(5));

        var again = await _store.SubmitAsync(Ada, "Ada", Snake, 300);

        Assert.False(again.IsPersonalBest);
        var kept = await _database.ReadAsync(db => db.Scores.SingleAsync());
        Assert.Equal(300, kept.Value);
        Assert.Equal(original.AchievedAtUtc, kept.AchievedAtUtc);
    }

    /// <summary>A private player is told the rank they would have among public players plus themselves (D7).</summary>
    [Fact]
    public async Task A_private_player_is_told_their_would_be_rank()
    {
        await _store.UpdateProfileAsync(Grace, "Grace", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);

        var ada = await _store.SubmitAsync(Ada, "Ada", Snake, 300);

        Assert.False(ada.IsPublic);
        Assert.Equal(2, ada.Rank);
    }

    /// <summary>Zero, negative and out-of-limit values are refused and nothing is stored (D12).</summary>
    [Fact]
    public async Task Refuses_unacceptable_values()
    {
        var limited = Easy with { Min = 1_000 };

        Assert.Equal(SubmitStatus.Rejected, (await _store.SubmitAsync(Ada, "Ada", Easy, 0)).Status);
        Assert.Equal(SubmitStatus.Rejected, (await _store.SubmitAsync(Ada, "Ada", limited, 500)).Status);
        Assert.Equal(0, await _database.ReadAsync(db => db.Scores.CountAsync()));
    }

    /// <summary>A malformed definition is refused before anything is stored.</summary>
    [Fact]
    public async Task Refuses_malformed_definitions()
    {
        var result = await _store.SubmitAsync(Ada, "Ada", Easy with { Better = "sideways" }, 10);

        Assert.Equal(SubmitStatus.Rejected, result.Status);
        Assert.Equal(0, await _database.ReadAsync(db => db.Leaderboards.CountAsync()));
    }

    /// <summary>The board is recorded on first sight and a later submit describing it differently is refused (§4).</summary>
    [Fact]
    public async Task Refuses_a_board_described_differently()
    {
        await _store.SubmitAsync(Ada, "Ada", Easy, 9_400);

        var result = await _store.SubmitAsync(Grace, "Grace", Easy with { Better = "higher" }, 9_000);

        Assert.Equal(SubmitStatus.Conflict, result.Status);
        Assert.Equal(1, await _database.ReadAsync(db => db.Scores.CountAsync()));
    }

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
}
