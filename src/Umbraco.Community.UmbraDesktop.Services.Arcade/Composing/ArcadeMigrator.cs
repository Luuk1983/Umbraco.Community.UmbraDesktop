using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>
/// Brings the Arcade's tables up to date, with the migration set for the site's provider (design D9).
/// </summary>
/// <remarks>
/// Run outside any Umbraco scope: SQLite refuses to migrate inside a transaction, which is why
/// Umbraco's own EF executor does the same. Builds the provider's derived context directly, since
/// the runtime <see cref="ArcadeDbContext"/> owns no migrations. Provider names are the two Umbraco
/// itself accepts (<c>Microsoft.Data.SqlClient</c>, and <c>Microsoft.Data.Sqlite</c> in either
/// capitalisation); anything else is logged and skipped rather than guessed at.
/// </remarks>
/// <param name="connectionStrings">The site's connection string and provider.</param>
/// <param name="runtime">Whether the site is running, installing or upgrading.</param>
/// <param name="logger">Records a failed migration, which must not stop the site starting.</param>
public sealed class ArcadeMigrator(IOptionsMonitor<ConnectionStrings> connectionStrings, IRuntimeState runtime, ILogger<ArcadeMigrator> logger)
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
            ArcadeDbContext context;
            if (provider.Equals("Microsoft.Data.Sqlite", StringComparison.OrdinalIgnoreCase))
            {
                context = new SqliteArcadeDbContext(new DbContextOptionsBuilder<SqliteArcadeDbContext>()
                    .UseSqlite(connection, x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable)).Options);
            }
            else if (provider.Equals("Microsoft.Data.SqlClient", StringComparison.OrdinalIgnoreCase))
            {
                context = new SqlServerArcadeDbContext(new DbContextOptionsBuilder<SqlServerArcadeDbContext>()
                    .UseSqlServer(connection, x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable)).Options);
            }
            else
            {
                logger.LogWarning("The Arcade supports SQL Server and SQLite; the database provider {Provider} is not supported, so no tables were created.", provider);
                return;
            }

            await using (context)
            {
                await context.Database.MigrateAsync();
            }
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "The Arcade's tables could not be migrated; scores will not be saved until this is fixed.");
        }
    }
}
