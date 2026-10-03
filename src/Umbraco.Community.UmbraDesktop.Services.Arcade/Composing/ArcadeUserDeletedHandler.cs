using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>
/// Removes a deleted user's Arcade rows (design §6).
/// </summary>
/// <remarks>
/// <c>UserDeletedNotification</c> rather than <c>UserDeleting</c>, which the host's
/// <c>DesktopUserDataCleanupHandler</c> uses: that one has to clear rows before a foreign key
/// refuses the delete, and the Arcade's tables have no foreign key to <c>umbracoUser</c>. Deleted
/// fires only after the delete has committed, so a rolled-back delete costs nobody their scores. The
/// backoffice only hard-deletes users who never signed in, who cannot have scores; this covers
/// <c>IUserService.Delete(user, true)</c> and whatever Umbraco does later.
/// </remarks>
/// <param name="store">The Arcade's store.</param>
/// <param name="logger">Where a failed cleanup is reported.</param>
public sealed class ArcadeUserDeletedHandler(ArcadeStore store, ILogger<ArcadeUserDeletedHandler> logger) : INotificationAsyncHandler<UserDeletedNotification>
{
    /// <inheritdoc />
    /// <remarks>
    /// A failure is logged rather than thrown. The delete has already committed when this runs, so
    /// throwing would report a finished delete as an error to whoever made it, and would skip the
    /// remaining users. The rows left behind belong to nobody and show on no board.
    /// </remarks>
    public async Task HandleAsync(UserDeletedNotification notification, CancellationToken cancellationToken)
    {
        foreach (var user in notification.DeletedEntities)
        {
            try
            {
                await store.ForgetUserAsync(user.Key);
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Could not remove the Arcade scores of deleted user {UserKey}.", user.Key);
            }
        }
    }
}
