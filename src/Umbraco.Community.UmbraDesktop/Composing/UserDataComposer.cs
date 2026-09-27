using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Community.UmbraDesktop.UserData;
using Umbraco.Extensions;

namespace Umbraco.Community.UmbraDesktop.Composing;

/// <summary>
/// Wires up the one server-side piece the desktop's per-user settings need: clearing this package's
/// rows out of <c>umbracoUserData</c> when a user is permanently deleted.
/// </summary>
/// <remarks>
/// Everything else about those settings is in the browser, talking to Umbraco's own `user-data`
/// endpoints, so there is no store, no controller and no schema here. This exists only because
/// Umbraco does not clear that table itself and the foreign key has no cascade — see
/// <see cref="DesktopUserDataCleanupHandler"/>.
/// </remarks>
public sealed class UserDataComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder) =>
        builder.AddNotificationAsyncHandler<UserDeletingNotification, DesktopUserDataCleanupHandler>();
}
