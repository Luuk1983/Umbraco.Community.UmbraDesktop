using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>The SQLite migrations build the schema the runtime model expects.</summary>
public class MigrationsTests
{
    /// <summary>
    /// Migrating an empty database leaves nothing pending and no model drift, which is what EF 9+
    /// would otherwise report at startup as <c>PendingModelChangesWarning</c>.
    /// </summary>
    [Fact]
    public async Task Sqlite_migrations_create_the_schema_with_nothing_pending()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<SqliteArcadeDbContext>()
            .UseSqlite(connection, x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable))
            .Options;
        await using var context = new SqliteArcadeDbContext(options);

        await context.Database.MigrateAsync();

        Assert.Empty(await context.Database.GetPendingMigrationsAsync());
        Assert.False(context.Database.HasPendingModelChanges());
        Assert.Equal(0, await context.Scores.CountAsync());
    }
}
