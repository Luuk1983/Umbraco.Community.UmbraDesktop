using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// Lets <c>dotnet ef</c> build the SQL Server migration context from a class library, which has no
/// startup project to ask. The connection string is never opened: <c>migrations add</c> only reads
/// the model.
/// </summary>
public sealed class SqlServerArcadeDbContextFactory : IDesignTimeDbContextFactory<SqlServerArcadeDbContext>
{
    /// <inheritdoc />
    public SqlServerArcadeDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<SqlServerArcadeDbContext>()
            .UseSqlServer("Server=.;Database=design-time", x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable))
            .Options);
}

/// <summary>The same for SQLite.</summary>
public sealed class SqliteArcadeDbContextFactory : IDesignTimeDbContextFactory<SqliteArcadeDbContext>
{
    /// <inheritdoc />
    public SqliteArcadeDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<SqliteArcadeDbContext>()
            .UseSqlite("Data Source=design-time.db", x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable))
            .Options);
}
