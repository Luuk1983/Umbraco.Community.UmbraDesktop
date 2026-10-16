using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Infrastructure.Migrations.Notifications;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>
/// Runs the Arcade's migrations at the three moments Umbraco runs its own EF migrations: an ordinary
/// start, a fresh database just created by the installer, and an unattended install. Without the
/// last two, a new site would have no Arcade tables until its first restart.
/// </summary>
/// <param name="migrator">The migrator.</param>
public sealed class ArcadeMigrationHandlers(ArcadeMigrator migrator) :
    INotificationAsyncHandler<UmbracoApplicationStartedNotification>,
    INotificationAsyncHandler<DatabaseSchemaAndDataCreatedNotification>,
    INotificationAsyncHandler<UnattendedInstallNotification>
{
    /// <inheritdoc />
    public Task HandleAsync(UmbracoApplicationStartedNotification notification, CancellationToken cancellationToken) =>
        migrator.MigrateAsync(requireRunLevel: true);

    /// <inheritdoc />
    public Task HandleAsync(DatabaseSchemaAndDataCreatedNotification notification, CancellationToken cancellationToken) =>
        notification.RequiresUpgrade ? Task.CompletedTask : migrator.MigrateAsync(requireRunLevel: false);

    /// <inheritdoc />
    public Task HandleAsync(UnattendedInstallNotification notification, CancellationToken cancellationToken) =>
        migrator.MigrateAsync(requireRunLevel: false);
}
