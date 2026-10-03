using NSubstitute;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>The Arcade's wiring into Umbraco.</summary>
public class ArcadeComposerTests
{
    /// <summary>Disabled, locked and missing users are hidden; active ones are not (§6).</summary>
    [Fact]
    public async Task Hides_disabled_locked_and_missing_users()
    {
        var active = User(UserState.Active);
        var disabled = User(UserState.Disabled);
        var locked = User(UserState.LockedOut);
        var missing = Guid.NewGuid();
        var service = Substitute.For<IUserService>();
        service.GetAsync(Arg.Any<IEnumerable<Guid>>()).Returns(Task.FromResult<IEnumerable<IUser>>([active, disabled, locked]));

        var hidden = await new UmbracoArcadeUserDirectory(service).GetHiddenAsync([active.Key, disabled.Key, locked.Key, missing]);

        Assert.Equal(new HashSet<Guid> { disabled.Key, locked.Key, missing }, hidden);
    }

    /// <summary>An empty board needs no lookup at all.</summary>
    [Fact]
    public async Task Skips_the_lookup_for_an_empty_board()
    {
        var service = Substitute.For<IUserService>();

        var hidden = await new UmbracoArcadeUserDirectory(service).GetHiddenAsync([]);

        Assert.Empty(hidden);
        await service.DidNotReceiveWithAnyArgs().GetAsync(default(IEnumerable<Guid>)!);
    }

    /// <summary>The store, its seams, the controller's dependencies and the job are registered; the site's clock is left alone.</summary>
    [Fact]
    public void Registers_the_arcade_and_leaves_the_clock_alone()
    {
        var services = new Microsoft.Extensions.DependencyInjection.ServiceCollection();
        var builder = Substitute.For<Umbraco.Cms.Core.DependencyInjection.IUmbracoBuilder>();
        builder.Services.Returns(services);

        new Composing.ArcadeComposer().Compose(builder);

        Assert.Contains(services, d => d.ServiceType == typeof(ArcadeStore));
        Assert.Contains(services, d => d.ServiceType == typeof(Data.IArcadeDatabase));
        Assert.Contains(services, d => d.ServiceType == typeof(IArcadeUserDirectory));
        Assert.Contains(services, d => d.ServiceType == typeof(Umbraco.Cms.Infrastructure.BackgroundJobs.IRecurringBackgroundJob));
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(TimeProvider));
    }

    /// <summary>Migrations wait for a running site; an install or upgrade in progress is left alone.</summary>
    [Fact]
    public async Task Does_not_migrate_before_the_site_runs()
    {
        var runtime = Substitute.For<IRuntimeState>();
        runtime.Level.Returns(Umbraco.Cms.Core.RuntimeLevel.Install);
        var connections = Substitute.For<Microsoft.Extensions.Options.IOptionsMonitor<Umbraco.Cms.Core.Configuration.Models.ConnectionStrings>>();

        await new Composing.ArcadeMigrator(connections, runtime, Microsoft.Extensions.Logging.Abstractions.NullLogger<Composing.ArcadeMigrator>.Instance)
            .MigrateAsync(requireRunLevel: true);

        _ = connections.DidNotReceive().CurrentValue;
    }

    /// <summary>The pruning job removes beaten events older than thirty days (§6).</summary>
    [Fact]
    public async Task The_prune_job_removes_events_older_than_thirty_days()
    {
        await using var database = await SqliteTestDatabase.CreateAsync();
        var clock = new Microsoft.Extensions.Time.Testing.FakeTimeProvider(new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero));
        var store = new ArcadeStore(database, new FakeUserDirectory(), clock);
        var (ada, grace) = (Guid.NewGuid(), Guid.NewGuid());
        await store.UpdateProfileAsync(ada, "Ada", null, true, null);
        await store.UpdateProfileAsync(grace, "Grace", null, true, null);
        var snake = new LeaderboardDefinition("Pkg.Snake.Game", "default", "higher", "points", null, null);
        await store.SubmitAsync(ada, "Ada", snake, 1);
        await store.SubmitAsync(grace, "Grace", snake, 2);
        clock.Advance(TimeSpan.FromDays(31));

        await new Composing.ArcadeBeatenPruneJob(store).RunJobAsync();

        Assert.Empty(await store.TakeBeatenAsync(ada));
    }

    /// <summary>A user substitute in the given state.</summary>
    /// <param name="state">The state it reports.</param>
    /// <returns>The substitute, with a fresh key.</returns>
    private static IUser User(UserState state)
    {
        var user = Substitute.For<IUser>();
        user.Key.Returns(Guid.NewGuid());
        user.UserState.Returns(state);
        return user;
    }
}
