using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Infrastructure.Persistence.Querying;

namespace Umbraco.Community.UmbraDesktop.UserData;

/// <summary>
/// Removes this package's per-user rows when a user is permanently deleted.
/// </summary>
/// <remarks>
/// <para>
/// Works around a gap in Umbraco 17: <c>umbracoUserData.userKey</c> has a foreign key to
/// <c>umbracoUser.key</c> with no cascade (<c>ForeignKeyAttribute.OnDelete</c> defaults to
/// <c>Rule.None</c>), and <c>UserRepository.GetDeleteClauses()</c> does not clear that table. A
/// permanent delete of a user holding rows therefore fails on the constraint, with an error naming
/// the constraint rather than whoever wrote the rows.
/// </para>
/// <para>
/// Umbraco cannot reach that today: <c>UserService.DeleteAsync</c> refuses any user with a
/// <c>LastLoginDate</c>, and a row of ours only exists for someone who has signed in and opened the
/// desktop, so the population the backoffice will hard-delete is exactly the population with none of
/// our rows. What this guards is <c>IUserService.Delete(user, deletePermanently: true)</c>, which is
/// public and skips that check, and whatever Umbraco does here in future. Cheap insurance against
/// this package being the reason somebody else's user management breaks.
/// </para>
/// <para>
/// <c>UserDeletingNotification</c> rather than <c>UserDeleted</c>: it is published inside the same
/// scope immediately before the repository delete, which is the only point where removing the rows
/// still satisfies the constraint.
/// </para>
/// </remarks>
/// <param name="userDataService">Umbraco's per-user key/value store.</param>
/// <param name="logger">Records a cleanup that could not be completed, since it may not throw.</param>
public sealed class DesktopUserDataCleanupHandler(
    IUserDataService userDataService,
    ILogger<DesktopUserDataCleanupHandler> logger)
    : INotificationAsyncHandler<UserDeletingNotification>
{
    /// <summary>
    /// How many rows to fetch per read.
    /// </summary>
    /// <remarks>
    /// A user has two rows in normal use, so this is about the abnormal case: the table has no
    /// uniqueness constraint on group and identifier and the management API's create always
    /// succeeds, so duplicates are possible. Internal rather than private so the test that proves
    /// the paging loop works can exceed it without hard-coding a number that would silently stop
    /// testing anything if this changed.
    /// </remarks>
    internal const int PageSize = 100;

    /// <summary>
    /// Deletes every row this package holds for each user being deleted.
    /// </summary>
    /// <remarks>
    /// Failures are swallowed. A row that will not delete blocks the user delete on the foreign key
    /// exactly as it would have without this handler, so throwing would change nothing except to
    /// put this package in the stack trace instead of the real constraint.
    /// </remarks>
    /// <param name="notification">The users about to be deleted.</param>
    /// <param name="cancellationToken">Cancels the work.</param>
    /// <returns>A task that completes when the rows are gone.</returns>
    public async Task HandleAsync(UserDeletingNotification notification, CancellationToken cancellationToken)
    {
        // Another handler has vetoed the delete. Core runs every handler regardless of this flag —
        // neither PublishCore nor PublishCoreAsync checks it — and UserService.Delete then calls
        // scope.Complete() on a veto, so the transaction commits. Deleting here would leave the user
        // in place with their desktop gone. This does not close the window (a handler after this one
        // can still cancel) but it covers every ordering we can actually see.
        if (notification.Cancel)
        {
            return;
        }

        try
        {
            foreach (IUser user in notification.DeletedEntities)
            {
                await DeleteRowsFor(user.Key);
            }
        }
        catch (Exception exception)
        {
            // Nothing may escape this method. Notification handlers run inside the same scope as the
            // user delete, before scope.Complete(), and core wraps them in Task.WaitAll with no
            // try/catch of its own — so a throw here does not merely skip our cleanup, it rolls back
            // the entire user delete. A transient read failure would abort an operation that has
            // nothing to do with this package, including for a user holding none of our rows.
            //
            // Leaving the rows behind is the lesser failure: the foreign key then blocks the delete
            // exactly as it would have without this handler, which is the state the whole class
            // exists to improve on rather than to guarantee.
            logger.LogWarning(
                exception,
                "Could not remove UmbraDesktop user data for the user being deleted. The delete may fail on the foreign key.");
        }
    }

    /// <summary>
    /// Deletes every row this package holds for one user.
    /// </summary>
    /// <remarks>
    /// Reads a page at a time and always from offset zero, because each delete shortens the list:
    /// paging forward through a collection being emptied behind you skips rows, and skipping one
    /// here means the constraint still fires.
    /// </remarks>
    /// <param name="userKey">Whose rows to delete.</param>
    /// <returns>A task that completes when the rows are gone.</returns>
    private async Task DeleteRowsFor(Guid userKey)
    {
        var filter = new UserDataFilter
        {
            UserKeys = [userKey],
            Groups = [DesktopUserData.Group],
        };

        while (true)
        {
            PagedModel<IUserData> page = await userDataService.GetAsync(0, PageSize, filter);

            if (page.Items.Any() is false)
            {
                return;
            }

            var deleted = 0;

            foreach (IUserData row in page.Items)
            {
                if ((await userDataService.DeleteAsync(row.Key)).Success)
                {
                    deleted++;
                }
            }

            // Nothing went, so nothing will. Without this a store refusing every delete would spin
            // here forever, inside the scope of a user delete.
            if (deleted == 0)
            {
                return;
            }
        }
    }
}
