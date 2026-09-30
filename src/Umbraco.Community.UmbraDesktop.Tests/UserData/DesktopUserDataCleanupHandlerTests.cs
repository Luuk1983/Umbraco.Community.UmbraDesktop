using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Services.OperationStatus;
using Umbraco.Community.UmbraDesktop.UserData;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.UserData;

/// <summary>
/// Exercises <see cref="DesktopUserDataCleanupHandler"/>, which exists to stop this package from
/// making a user impossible to delete.
/// </summary>
/// <remarks>
/// <para>
/// <c>umbracoUserData.userKey</c> has a foreign key to <c>umbracoUser.key</c> with no cascade, and
/// <c>UserRepository.GetDeleteClauses()</c> does not clear that table. So a permanent delete of a
/// user who holds rows fails on the constraint. Umbraco's own delete path refuses any user who has
/// ever signed in, which is every user who could have desktop settings, so the backoffice cannot
/// reach it — but <c>IUserService.Delete(user, deletePermanently: true)</c> is public and skips that
/// guard, and the resulting error names a constraint rather than this package.
/// </para>
/// <para>
/// The two properties that matter are below: our rows go, and nobody else's do. A handler that
/// over-deleted would be considerably worse than the bug it fixes.
/// </para>
/// </remarks>
public class DesktopUserDataCleanupHandlerTests
{
    /// <summary>The user being deleted in most tests.</summary>
    private static readonly Guid Doomed = Guid.Parse("11111111-1111-1111-1111-111111111111");

    /// <summary>A user who is not being deleted, and whose rows must survive.</summary>
    private static readonly Guid Bystander = Guid.Parse("22222222-2222-2222-2222-222222222222");

    /// <summary>
    /// A notification for deleting the given users.
    /// </summary>
    /// <param name="userKeys">The users being deleted.</param>
    /// <returns>The notification.</returns>
    private static UserDeletingNotification Deleting(params Guid[] userKeys)
    {
        // Substituted rather than constructed: the handler reads exactly one property off each user,
        // and building a real User drags in configuration this test has no opinion about.
        var users = userKeys.Select(key =>
        {
            IUser user = Substitute.For<IUser>();
            user.Key.Returns(key);
            return user;
        });

        return new UserDeletingNotification(users, new EventMessages());
    }

    /// <summary>
    /// A handler over the given store, with logging discarded.
    /// </summary>
    /// <param name="service">The store to clean up.</param>
    /// <returns>The handler under test.</returns>
    private static DesktopUserDataCleanupHandler Handler(InMemoryUserDataService service) =>
        new(service, NullLogger<DesktopUserDataCleanupHandler>.Instance);

    /// <summary>The rows this package owns for one user.</summary>
    /// <param name="service">The store to read.</param>
    /// <param name="userKey">Whose rows.</param>
    /// <returns>How many rows this package holds for that user.</returns>
    private static int OursFor(InMemoryUserDataService service, Guid userKey) =>
        service.Rows.Count(row =>
            row.UserKey == userKey && row.Group == DesktopUserData.Group);

    /// <summary>This package's rows for a deleted user are removed, so the delete can proceed.</summary>
    [Fact]
    public async Task HandleAsync_RemovesOurRowsForTheDeletedUser()
    {
        var service = new InMemoryUserDataService();
        service.Seed(Doomed, DesktopUserData.Group, "settings");
        service.Seed(Doomed, DesktopUserData.Group, "migrations");
        var handler = Handler(service);

        await handler.HandleAsync(Deleting(Doomed), CancellationToken.None);

        Assert.Equal(0, OursFor(service, Doomed));
    }

    /// <summary>Another package's rows for the same user are none of our business, and are left.</summary>
    [Fact]
    public async Task HandleAsync_LeavesAnotherGroupAlone()
    {
        var service = new InMemoryUserDataService();
        service.Seed(Doomed, DesktopUserData.Group, "settings");
        service.Seed(Doomed, "umbraco.tours", "some-tour");
        var handler = Handler(service);

        await handler.HandleAsync(Deleting(Doomed), CancellationToken.None);

        Assert.Single(service.Rows);
        Assert.Equal("umbraco.tours", service.Rows[0].Group);
    }

    /// <summary>Our rows belonging to somebody who is not being deleted survive.</summary>
    [Fact]
    public async Task HandleAsync_LeavesAnotherUserAlone()
    {
        var service = new InMemoryUserDataService();
        service.Seed(Doomed, DesktopUserData.Group, "settings");
        service.Seed(Bystander, DesktopUserData.Group, "settings");
        var handler = Handler(service);

        await handler.HandleAsync(Deleting(Doomed), CancellationToken.None);

        Assert.Equal(1, OursFor(service, Bystander));
    }

    /// <summary>A notification carrying several users clears all of them.</summary>
    [Fact]
    public async Task HandleAsync_ClearsEveryUserInTheNotification()
    {
        var service = new InMemoryUserDataService();
        service.Seed(Doomed, DesktopUserData.Group, "settings");
        service.Seed(Bystander, DesktopUserData.Group, "settings");
        var handler = Handler(service);

        await handler.HandleAsync(Deleting(Doomed, Bystander), CancellationToken.None);

        Assert.Empty(service.Rows);
    }

    /// <summary>A user who never opened the desktop is the common case, and costs nothing.</summary>
    [Fact]
    public async Task HandleAsync_DoesNothingWhenTheUserHasNoRows()
    {
        var service = new InMemoryUserDataService();
        service.Seed(Bystander, DesktopUserData.Group, "settings");
        var handler = Handler(service);

        await handler.HandleAsync(Deleting(Doomed), CancellationToken.None);

        Assert.Single(service.Rows);
    }

    /// <summary>
    /// Duplicate rows are removed too.
    /// </summary>
    /// <remarks>
    /// The table has no uniqueness constraint on group and identifier and the API's create always
    /// succeeds, so duplicates are possible however carefully the client behaves. One left behind
    /// would block the delete exactly as the original row would have.
    /// </remarks>
    [Fact]
    public async Task HandleAsync_RemovesDuplicateRows()
    {
        var service = new InMemoryUserDataService();
        service.Seed(Doomed, DesktopUserData.Group, "settings");
        service.Seed(Doomed, DesktopUserData.Group, "settings");
        service.Seed(Doomed, DesktopUserData.Group, "settings");
        var handler = Handler(service);

        await handler.HandleAsync(Deleting(Doomed), CancellationToken.None);

        Assert.Equal(0, OursFor(service, Doomed));
    }

    /// <summary>
    /// More rows than one page holds are still all removed.
    /// </summary>
    /// <remarks>
    /// The store pages, and reading only the first page would leave the rest to block the delete.
    /// This is the test that fails if somebody later replaces the loop with a single read.
    /// </remarks>
    [Fact]
    public async Task HandleAsync_RemovesMoreRowsThanOnePageHolds()
    {
        var service = new InMemoryUserDataService();
        for (var i = 0; i < DesktopUserDataCleanupHandler.PageSize + 7; i++)
        {
            service.Seed(Doomed, DesktopUserData.Group, $"row-{i}");
        }

        var handler = Handler(service);

        await handler.HandleAsync(Deleting(Doomed), CancellationToken.None);

        Assert.Equal(0, OursFor(service, Doomed));
    }

    /// <summary>
    /// A delete the store refuses does not throw.
    /// </summary>
    /// <remarks>
    /// Nothing is gained by throwing. The row survives either way, so the foreign key blocks the
    /// user delete exactly as it would have without this handler, and an exception here would only
    /// replace that message with one naming this package's handler instead of the real constraint.
    /// </remarks>
    [Fact]
    public async Task HandleAsync_DoesNotThrowWhenADeleteIsRefused()
    {
        var service = new InMemoryUserDataService { DeleteFailure = UserDataOperationStatus.NotFound };
        service.Seed(Doomed, DesktopUserData.Group, "settings");
        var handler = Handler(service);

        await handler.HandleAsync(Deleting(Doomed), CancellationToken.None);

        Assert.Single(service.Rows);
    }

    /// <summary>
    /// A store that throws does not take the user delete down with it.
    /// </summary>
    /// <remarks>
    /// This handler runs inside the same scope as the delete, before <c>scope.Complete()</c>, and
    /// core wraps handlers in <c>Task.WaitAll</c> without catching. A throw escaping here would not
    /// merely skip the cleanup, it would roll back the entire user delete — including for a user
    /// holding none of this package's rows. Leaving the rows behind is the lesser failure.
    /// </remarks>
    [Fact]
    public async Task HandleAsync_DoesNotThrow_WhenTheStoreDoes()
    {
        var service = new InMemoryUserDataService { ReadsThrow = true };
        var handler = Handler(service);

        await handler.HandleAsync(Deleting(Doomed), CancellationToken.None);
    }

    /// <summary>
    /// A delete another handler has vetoed leaves the rows alone.
    /// </summary>
    /// <remarks>
    /// Core runs every handler regardless of the flag, and <c>UserService.Delete</c> then calls
    /// <c>scope.Complete()</c> on a veto, so the transaction commits. Cleaning up anyway would leave
    /// the user in place with their desktop deleted.
    /// </remarks>
    [Fact]
    public async Task HandleAsync_LeavesRowsAlone_WhenTheDeleteWasCancelled()
    {
        var service = new InMemoryUserDataService();
        service.Seed(Doomed, DesktopUserData.Group, "settings");
        var notification = Deleting(Doomed);
        notification.Cancel = true;

        await Handler(service).HandleAsync(notification, CancellationToken.None);

        Assert.Equal(1, OursFor(service, Doomed));
    }

    /// <summary>
    /// The group this package cleans up is the one the browser writes.
    /// </summary>
    /// <remarks>
    /// The group is a literal in two languages — here, and in
    /// <c>backoffice/src/desktop/user-data/constants.ts</c> — because a C# constant cannot be read
    /// from TypeScript. Nothing can make them share, so each side pins the exact string in a test
    /// and says so. If this one is changed without the other, cleanup silently stops matching the
    /// rows it is meant to remove.
    /// </remarks>
    [Fact]
    public void Group_MatchesTheOneTheBrowserWrites()
    {
        Assert.Equal("Umbraco.Community.UmbraDesktop", DesktopUserData.Group);
    }
}
