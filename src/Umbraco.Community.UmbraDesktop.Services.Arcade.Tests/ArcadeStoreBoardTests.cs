using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;
using static Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.ArcadeStoreSubmitTests;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>Reading boards, bests and profiles: who is shown, who is not, and where the viewer stands.</summary>
public class ArcadeStoreBoardTests : IAsyncLifetime
{
    /// <summary>A third player.</summary>
    private static readonly Guid Linus = Guid.Parse("00000000-0000-0000-0000-00000000000c");

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>Who is hidden.</summary>
    private readonly FakeUserDirectory _users = new();

    /// <summary>The clock.</summary>
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero));

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

    /// <summary>Submit as a public player.</summary>
    /// <param name="user">The player.</param>
    /// <param name="name">Their display name.</param>
    /// <param name="value">The score.</param>
    private async Task PublicScore(Guid user, string name, long value)
    {
        await _store.UpdateProfileAsync(user, name, null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(user, name, Snake, value);
        _clock.Advance(TimeSpan.FromSeconds(1));
    }

    /// <summary>Public players in rank order; a private player is left off for everyone else.</summary>
    [Fact]
    public async Task Shows_public_players_in_rank_order_and_leaves_private_ones_off()
    {
        await PublicScore(Ada, "Ada", 300);
        await PublicScore(Grace, "Grace", 500);
        await _store.SubmitAsync(Linus, "Linus", Snake, 900);

        var board = await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board);

        Assert.Equal(["Grace", "Ada"], board.Top.Select(e => e.DisplayName));
        Assert.Equal([1, 2], board.Top.Select(e => e.Rank));
    }

    /// <summary>A private viewer still sees their own row, with the rank they would have (D7).</summary>
    [Fact]
    public async Task A_private_viewer_sees_their_own_row_and_would_be_rank()
    {
        await PublicScore(Grace, "Grace", 500);
        await _store.SubmitAsync(Linus, "Linus", Snake, 900);

        var board = await _store.GetBoardAsync(Linus, Snake.Game, Snake.Board);

        Assert.DoesNotContain(board.Top, e => e.UserKey == Linus);
        Assert.NotNull(board.Viewer);
        Assert.Equal(1, board.Viewer!.Rank);
        Assert.False(board.ViewerIsPublic);
    }

    /// <summary>Only the top ten are listed; the viewer below them is still returned separately.</summary>
    [Fact]
    public async Task Lists_ten_and_returns_the_viewer_beyond_them()
    {
        for (var i = 0; i < 12; i++)
        {
            await PublicScore(Guid.NewGuid(), $"P{i}", 1_000 + i);
        }
        await PublicScore(Ada, "Ada", 5);

        var board = await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board);

        Assert.Equal(10, board.Top.Count);
        Assert.Equal(13, board.Viewer!.Rank);
    }

    /// <summary>Going private hides at once; going public again brings the scores back (D7).</summary>
    [Fact]
    public async Task Going_private_hides_and_going_public_restores()
    {
        await PublicScore(Ada, "Ada", 300);
        await _store.UpdateProfileAsync(Ada, "Ada", null, isPublic: false, notifyWhenBeaten: null);
        Assert.Empty((await _store.GetBoardAsync(Grace, Snake.Game, Snake.Board)).Top);

        await _store.UpdateProfileAsync(Ada, "Ada", null, isPublic: true, notifyWhenBeaten: null);
        Assert.Single((await _store.GetBoardAsync(Grace, Snake.Game, Snake.Board)).Top);
    }

    /// <summary>Disabled or locked players drop off without anything being deleted (§6).</summary>
    [Fact]
    public async Task Hidden_players_are_left_off()
    {
        await PublicScore(Ada, "Ada", 300);
        _users.Hidden.Add(Ada);

        Assert.Empty((await _store.GetBoardAsync(Grace, Snake.Game, Snake.Board)).Top);
    }

    /// <summary>A board nobody has played has no definition and no rows, rather than failing.</summary>
    [Fact]
    public async Task An_unplayed_board_is_empty()
    {
        var board = await _store.GetBoardAsync(Ada, "Pkg.Nothing", "default");

        Assert.Null(board.Definition);
        Assert.Empty(board.Top);
        Assert.Null(board.Viewer);
    }

    /// <summary>A player's best, for Snake's in-game display, and nothing for a board they have not played.</summary>
    [Fact]
    public async Task Reads_a_players_best()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);

        Assert.Equal(300, await _store.GetBestAsync(Ada, Snake.Game, Snake.Board));
        Assert.Null(await _store.GetBestAsync(Grace, Snake.Game, Snake.Board));
    }

    /// <summary>A player with no profile reads defaults without one being created: private, notified, not yet asked.</summary>
    [Fact]
    public async Task A_new_player_reads_default_settings()
    {
        var profile = await _store.GetProfileAsync(Ada, "Ada Lovelace");

        Assert.Equal(new ArcadeProfile("Ada Lovelace", false, true, false), profile);
        Assert.Equal(0, await _database.ReadAsync(db => db.Profiles.CountAsync()));
    }
}
