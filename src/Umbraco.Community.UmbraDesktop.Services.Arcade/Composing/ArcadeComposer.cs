using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Infrastructure.Migrations.Notifications;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Umbraco.Extensions;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>Registers the Arcade with Umbraco.</summary>
/// <remarks>
/// The context through <c>AddUmbracoDbContext</c>, the documented route (design D9), using the
/// overload with <c>shareUmbracoConnection</c>, current from 17.4 (below the floor) and in 18; the one
/// without it is obsolete from 17.4 and goes in 19. Sharing is what the old one did: the scores live
/// in Umbraco's own database, in its scopes. Singletons throughout, as the host's stores are: none
/// holds state. No <see cref="TimeProvider"/>: the site's is Umbraco's.
/// </remarks>
public sealed class ArcadeComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddUmbracoDbContext<ArcadeDbContext>((IServiceProvider _, DbContextOptionsBuilder options, string? connectionString, string? providerName) =>
        {
            if (string.IsNullOrEmpty(connectionString) || string.IsNullOrEmpty(providerName)) return;
            options.UseDatabaseProvider(providerName, connectionString);
        }, shareUmbracoConnection: true);
        builder.Services.AddSingleton<IArcadeDatabase, ScopedArcadeDatabase>();
        builder.Services.AddSingleton<IArcadeUserDirectory, UmbracoArcadeUserDirectory>();
        builder.Services.AddSingleton<ArcadeStore>();
        builder.Services.AddSingleton<ArcadeMigrator>();
        builder.AddNotificationAsyncHandler<UmbracoApplicationStartedNotification, ArcadeMigrationHandlers>();
        builder.AddNotificationAsyncHandler<DatabaseSchemaAndDataCreatedNotification, ArcadeMigrationHandlers>();
        builder.AddNotificationAsyncHandler<UnattendedInstallNotification, ArcadeMigrationHandlers>();
        builder.AddNotificationAsyncHandler<UserDeletedNotification, ArcadeUserDeletedHandler>();
        builder.Services.AddRecurringBackgroundJob<ArcadeBeatenPruneJob>();
    }
}
