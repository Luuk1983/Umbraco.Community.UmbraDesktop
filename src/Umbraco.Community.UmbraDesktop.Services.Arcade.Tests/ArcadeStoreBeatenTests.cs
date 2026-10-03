using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;
using static Umbraco.Community.UmbraDesktop.Services.Arcade.Tests.ArcadeStoreSubmitTests;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>When "you were beaten" is recorded, handed out and pruned (D10).</summary>
public class ArcadeStoreBeatenTests : IAsyncLifetime
{
    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The clock.</summary>
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero));

    /// <summary>The store under test.</summary>
    private ArcadeStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new ArcadeStore(_database, new FakeUserDirectory(), _clock);
        await _store.UpdateProfileAsync(Ada, "Ada", null, isPublic: true, notifyWhenBeaten: null);
        await _store.UpdateProfileAsync(Grace, "Grace", null, isPublic: true, notifyWhenBeaten: null);
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>Taking first place from a public, notifiable player records one event for them, handed out once.</summary>
    [Fact]
    public async Task Taking_first_place_tells_the_previous_leader_once()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);

        var events = await _store.TakeBeatenAsync(Ada);

        var only = Assert.Single(events);
        Assert.Equal(new BeatenEvent(Snake.Game, Snake.Board, "Grace", 500, "points"), only);
        Assert.Empty(await _store.TakeBeatenAsync(Ada));
    }

    /// <summary>Passing someone below first place says nothing.</summary>
    [Fact]
    public async Task Losing_second_place_says_nothing()
    {
        var linus = Guid.NewGuid();
        await _store.UpdateProfileAsync(linus, "Linus", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(linus, "Linus", Snake, 900);
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);

        Assert.Empty(await _store.TakeBeatenAsync(Ada));
    }

    /// <summary>A private scorer cannot beat anyone publicly, and a leader who turned notifications off is not told.</summary>
    [Fact]
    public async Task Private_scorers_and_unnotifiable_leaders_record_nothing()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.UpdateProfileAsync(Grace, "Grace", null, isPublic: false, notifyWhenBeaten: null);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        Assert.Empty(await _store.TakeBeatenAsync(Ada));

        await _store.UpdateProfileAsync(Ada, "Ada", null, isPublic: null, notifyWhenBeaten: false);
        await _store.UpdateProfileAsync(Grace, "Grace", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(Grace, "Grace", Snake, 600);
        Assert.Empty(await _store.TakeBeatenAsync(Ada));
    }

    /// <summary>Beating your own record is not being beaten.</summary>
    [Fact]
    public async Task Improving_your_own_lead_records_nothing()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Ada, "Ada", Snake, 400);

        Assert.Empty(await _store.TakeBeatenAsync(Ada));
    }

    /// <summary>Only the latest event per player per board is kept.</summary>
    [Fact]
    public async Task Keeps_only_the_latest_event_per_board()
    {
        var linus = Guid.NewGuid();
        await _store.UpdateProfileAsync(linus, "Linus", null, isPublic: true, notifyWhenBeaten: null);
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        await _store.SubmitAsync(Ada, "Ada", Snake, 600);
        await _store.SubmitAsync(linus, "Linus", Snake, 700);

        var events = await _store.TakeBeatenAsync(Ada);

        Assert.Equal("Linus", Assert.Single(events).ByDisplayName);
    }

    /// <summary>Events older than the given age are pruned; newer ones stay.</summary>
    [Fact]
    public async Task Prunes_old_events()
    {
        await _store.SubmitAsync(Ada, "Ada", Snake, 300);
        await _store.SubmitAsync(Grace, "Grace", Snake, 500);
        _clock.Advance(TimeSpan.FromDays(31));

        Assert.Equal(1, await _store.PruneBeatenAsync(TimeSpan.FromDays(30)));
        Assert.Equal(0, await _database.ReadAsync(db => db.Beaten.CountAsync()));
    }
}
