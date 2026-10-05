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
