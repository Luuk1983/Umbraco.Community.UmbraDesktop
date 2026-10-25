using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Core;
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
/// <para>
/// The API gets an OpenAPI document of the package's own, <c>/umbraco/openapi/umbradesktop-arcade.json</c>,
/// as Umbraco 18 expects of a package, so it is described apart from Umbraco's management API. The
/// games call it by hand, so nothing is generated from it.
/// </para>
/// </remarks>
public sealed class ArcadeComposer : IComposer
{
    /// <summary>
    /// The Arcade's OpenAPI document, and so its address under <c>/umbraco/openapi/</c>; the
    /// controller's <c>[MapToApi]</c> names it.
    /// </summary>
    public const string OpenApiDocumentName = "umbradesktop-arcade";

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
        builder.AddBackOfficeOpenApiDocument(
            OpenApiDocumentName,
            document => document
                .WithTitle("UmbraDesktop Arcade API")
                .WithBackOfficeAuthentication()
                .WithJsonOptions(Constants.JsonOptionsNames.BackOffice));
    }
}
