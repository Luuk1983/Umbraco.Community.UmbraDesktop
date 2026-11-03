using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Infrastructure.Migrations.Notifications;
using Umbraco.Community.UmbraDesktop.Media.Health.Data;
using Umbraco.Extensions;

namespace Umbraco.Community.UmbraDesktop.Media.Health.Composing;

/// <summary>Registers Media Health's engine with Umbraco (design §15).</summary>
/// <remarks>
/// The context through <c>AddUmbracoDbContext</c>, as the Arcade does it, sharing Umbraco's
/// connection. Singletons throughout: none holds state, and the store's one-at-a-time rule is a
/// database row rather than a shared instance, so it holds across servers. The reader, scanner and
/// deleter take the media file system from Umbraco's <see cref="MediaFileManager"/>, so a site on
/// blob storage is read where its files are.
/// </remarks>
public sealed class MediaHealthComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddUmbracoDbContext<MediaHealthDbContext>((IServiceProvider _, DbContextOptionsBuilder options, string? connectionString, string? providerName) =>
        {
            if (string.IsNullOrEmpty(connectionString) || string.IsNullOrEmpty(providerName)) return;
            options.UseDatabaseProvider(providerName, connectionString);
        }, shareUmbracoConnection: true);
        builder.Services.AddSingleton<IMediaHealthDatabase, ScopedMediaHealthDatabase>();
        builder.Services.AddSingleton<MediaHealthStore>();
        builder.Services.AddSingleton<Keep.MediaKeepStore>();
        builder.Services.AddSingleton<IMediaLibraryReader>(provider => new UmbracoMediaLibraryReader(
            provider.GetRequiredService<IMediaService>(),
            provider.GetRequiredService<IRelationService>(),
            provider.GetRequiredService<MediaFileManager>().FileSystem));
        builder.Services.AddSingleton<IMediaDiskScanner>(provider => new MediaDiskScanner(provider.GetRequiredService<MediaFileManager>().FileSystem));
        builder.Services.AddSingleton<IMediaOrphanDeleter>(provider => new MediaOrphanDeleter(
            provider.GetRequiredService<MediaFileManager>().FileSystem,
            provider.GetRequiredService<IMediaLibraryReader>(),
            provider.GetRequiredService<IAuditService>()));
        builder.Services.AddSingleton<IMediaCounter, UmbracoMediaCounter>();
        builder.Services.AddSingleton<MediaHealthRunner>();
        builder.Services.AddSingleton<MediaHealthMigrator>();
        builder.AddNotificationAsyncHandler<UmbracoApplicationStartedNotification, MediaHealthMigrationHandlers>();
        builder.AddNotificationAsyncHandler<DatabaseSchemaAndDataCreatedNotification, MediaHealthMigrationHandlers>();
        builder.AddNotificationAsyncHandler<UnattendedInstallNotification, MediaHealthMigrationHandlers>();
    }
}

/// <summary>
/// Brings Media Health's tables up to date, with the migration set for the site's provider, the way
/// the Arcade's migrator does.
/// </summary>
/// <remarks>
/// Run outside any Umbraco scope: SQLite refuses to migrate inside a transaction, which is why
/// Umbraco's own EF executor does the same. Provider names are the two Umbraco itself accepts;
/// anything else is logged and skipped rather than guessed at.
/// </remarks>
/// <param name="connectionStrings">The site's connection string and provider.</param>
/// <param name="runtime">Whether the site is running, installing or upgrading.</param>
/// <param name="logger">Records a failed migration, which must not stop the site starting.</param>
public sealed class MediaHealthMigrator(IOptionsMonitor<ConnectionStrings> connectionStrings, IRuntimeState runtime, ILogger<MediaHealthMigrator> logger)
{
    /// <summary>Apply any pending migrations.</summary>
    /// <param name="requireRunLevel">True at ordinary startup, where an install or upgrade in progress means "not yet".</param>
    /// <returns>A task.</returns>
    public async Task MigrateAsync(bool requireRunLevel)
    {
        if (requireRunLevel && runtime.Level != RuntimeLevel.Run) return;

        var settings = connectionStrings.CurrentValue;
        var provider = settings.ProviderName;
        var dataDirectory = AppDomain.CurrentDomain.GetData("DataDirectory")?.ToString();
        var connection = string.IsNullOrEmpty(dataDirectory)
            ? settings.ConnectionString
            : settings.ConnectionString?.Replace("|DataDirectory|", dataDirectory);
        if (string.IsNullOrEmpty(provider) || string.IsNullOrEmpty(connection)) return;

        try
        {
            MediaHealthDbContext context;
            if (provider.Equals("Microsoft.Data.Sqlite", StringComparison.OrdinalIgnoreCase))
            {
                context = new SqliteMediaHealthDbContext(new DbContextOptionsBuilder<SqliteMediaHealthDbContext>()
                    .UseSqlite(connection, x => x.MigrationsHistoryTable(MediaHealthDbContext.MigrationsHistoryTable)).Options);
            }
            else if (provider.Equals("Microsoft.Data.SqlClient", StringComparison.OrdinalIgnoreCase))
            {
                context = new SqlServerMediaHealthDbContext(new DbContextOptionsBuilder<SqlServerMediaHealthDbContext>()
                    .UseSqlServer(connection, x => x.MigrationsHistoryTable(MediaHealthDbContext.MigrationsHistoryTable)).Options);
            }
            else
            {
                logger.LogWarning("Media Health supports SQL Server and SQLite; the database provider {Provider} is not supported, so no tables were created.", provider);
                return;
            }

            await using (context)
            {
                await context.Database.MigrateAsync();
            }
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Media Health's tables could not be migrated; checks will fail until this is fixed.");
        }
    }
}

/// <summary>
/// Runs Media Health's migrations at the three moments Umbraco runs its own EF migrations: an
/// ordinary start, a fresh database just created by the installer, and an unattended install.
/// </summary>
/// <param name="migrator">The migrator.</param>
public sealed class MediaHealthMigrationHandlers(MediaHealthMigrator migrator) :
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
