using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;
using static Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.ArcadeStoreSubmitTests;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>Moderation (D11), deleting your own scores, and a deleted user (§6).</summary>
public class ArcadeStoreAdminTests : IAsyncLifetime
{
    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The store under test.</summary>
    private ArcadeStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new ArcadeStore(_database, new FakeUserDirectory(), new FakeTimeProvider(DateTimeOffset.UnixEpoch.AddYears(56)));
        await _store.UpdateProfileAsync(Ada, "Ada", "Ace", isPublic: true, notifyWhenBeaten: null);
        await _store.UpdateProfileAsync(Grace, "Grace", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        await _store.SubmitAsync(Ada, "Ada", Easy, 9_000);
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>Removing one score leaves the player's other boards alone.</summary>
    [Fact]
    public async Task Removes_one_score()
    {
        Assert.True(await _store.RemoveScoreAsync(Snake.Game, Snake.Board, Ada));
        Assert.False(await _store.RemoveScoreAsync(Snake.Game, Snake.Board, Ada));
        Assert.Equal(9_000, await _store.GetBestAsync(Ada, Easy.Game, Easy.Board));
    }

    /// <summary>Resetting a board removes its scores, its rules and its unread events, and nothing else.</summary>
    [Fact]
    public async Task Resets_a_board()
    {
        Assert.True(await _store.ResetBoardAsync(Snake.Game, Snake.Board));

        Assert.Null((await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board)).Definition);
        Assert.Equal(0, await _database.ReadAsync(db => db.Beaten.CountAsync()));
        Assert.Equal(9_000, await _store.GetBestAsync(Ada, Easy.Game, Easy.Board));
    }

    /// <summary>Resetting a display name puts the Umbraco name back.</summary>
    [Fact]
    public async Task Resets_a_display_name()
    {
        Assert.True(await _store.ResetDisplayNameAsync(Ada, "Ada Lovelace"));

        Assert.Equal("Ada Lovelace", (await _store.GetProfileAsync(Ada, "x")).DisplayName);
    }

    /// <summary>Forgetting a user removes their profile, scores and every event they are in, either side.</summary>
    [Fact]
    public async Task Forgets_a_user_entirely()
    {
        await _store.ForgetUserAsync(Grace);

        Assert.Equal(0, await _database.ReadAsync(db => db.Scores.CountAsync(s => s.UserKey == Grace)));
        Assert.Equal(0, await _database.ReadAsync(db => db.Profiles.CountAsync(p => p.UserKey == Grace)));
        Assert.Equal(0, await _database.ReadAsync(db => db.Beaten.CountAsync()));
        Assert.Equal("Ace", (await _store.GetBoardAsync(Ada, Snake.Game, Snake.Board)).Top[0].DisplayName);
    }
}
