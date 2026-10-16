using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>A deleted Umbraco user leaves nothing behind (§6).</summary>
public class ArcadeUserDeletedHandlerTests
{
    /// <summary>Their profile and scores are gone after the notification.</summary>
    [Fact]
    public async Task Forgets_the_deleted_user()
    {
        await using var database = await SqliteTestDatabase.CreateAsync();
        var store = new ArcadeStore(database, new FakeUserDirectory(), new FakeTimeProvider());
        var key = Guid.NewGuid();
        await store.SubmitAsync(key, "Ada", new LeaderboardDefinition("Pkg.G", "default", "higher", "points", null, null), 5);
        var user = Substitute.For<IUser>();
        user.Key.Returns(key);

        await new ArcadeUserDeletedHandler(store, NullLogger<ArcadeUserDeletedHandler>.Instance).HandleAsync(new UserDeletedNotification(user, new EventMessages()), CancellationToken.None);

        Assert.Null(await store.GetBestAsync(key, "Pkg.G", "default"));
    }

    /// <summary>
    /// A failure to clean up is logged, not thrown: the delete has already committed by the time
    /// <c>Deleted</c> fires, so throwing would only turn a finished delete into an error for whoever
    /// deleted the user.
    /// </summary>
    [Fact]
    public async Task A_failing_cleanup_does_not_throw()
    {
        var database = Substitute.For<Data.IArcadeDatabase>();
        database.RunAsync(Arg.Any<Func<Data.ArcadeDbContext, Task<bool>>>()).Returns<Task<bool>>(_ => throw new InvalidOperationException("database down"));
        var store = new ArcadeStore(database, new FakeUserDirectory(), new FakeTimeProvider());
        var user = Substitute.For<IUser>();
        user.Key.Returns(Guid.NewGuid());

        var handle = () => new ArcadeUserDeletedHandler(store, NullLogger<ArcadeUserDeletedHandler>.Instance).HandleAsync(new UserDeletedNotification(user, new EventMessages()), CancellationToken.None);

        var thrown = await Record.ExceptionAsync(handle);
        Assert.Null(thrown);
    }
}
