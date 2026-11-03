using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Umbraco.Cms.Persistence.EFCore.Scoping;

namespace Umbraco.Community.UmbraDesktop.Media.Health.Data;

/// <summary>
/// Runs a unit of work against Media Health's tables, inside a transaction that commits when it
/// returns and rolls back when it throws.
/// </summary>
/// <remarks>
/// The one seam between the store and Umbraco's EF scope machinery, which cannot be built outside a
/// running Umbraco. Production goes through <see cref="ScopedMediaHealthDatabase"/>; tests through an
/// in-memory SQLite database migrated with the real migrations, as the Arcade's do.
/// </remarks>
public interface IMediaHealthDatabase
{
    /// <summary>Run <paramref name="work"/> and commit.</summary>
    /// <typeparam name="T">What the work returns.</typeparam>
    /// <param name="work">The reads and writes. Call <c>SaveChangesAsync</c> inside it.</param>
    /// <returns>The work's result.</returns>
    Task<T> RunAsync<T>(Func<MediaHealthDbContext, Task<T>> work);
}

/// <summary>
/// <see cref="IMediaHealthDatabase"/> over Umbraco's EF Core scope, so the writes share the site's
/// connection and join any ambient Umbraco transaction.
/// </summary>
/// <param name="scopes">Umbraco's scope provider for the context.</param>
public sealed class ScopedMediaHealthDatabase(IEFCoreScopeProvider<MediaHealthDbContext> scopes) : IMediaHealthDatabase
{
    /// <inheritdoc />
    public async Task<T> RunAsync<T>(Func<MediaHealthDbContext, Task<T>> work)
    {
        using var scope = scopes.CreateScope();
        var result = await scope.ExecuteWithContextAsync(work);
        scope.Complete();
        return result;
    }
}

/// <summary>
/// Lets <c>dotnet ef</c> build the SQL Server migration context from a class library, which has no
/// startup project to ask. The connection string is never opened: <c>migrations add</c> only reads
/// the model.
/// </summary>
public sealed class SqlServerMediaHealthDbContextFactory : IDesignTimeDbContextFactory<SqlServerMediaHealthDbContext>
{
    /// <inheritdoc />
    public SqlServerMediaHealthDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<SqlServerMediaHealthDbContext>()
            .UseSqlServer("Server=.;Database=design-time", x => x.MigrationsHistoryTable(MediaHealthDbContext.MigrationsHistoryTable))
            .Options);
}

/// <summary>The same for SQLite.</summary>
public sealed class SqliteMediaHealthDbContextFactory : IDesignTimeDbContextFactory<SqliteMediaHealthDbContext>
{
    /// <inheritdoc />
    public SqliteMediaHealthDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<SqliteMediaHealthDbContext>()
            .UseSqlite("Data Source=design-time.db", x => x.MigrationsHistoryTable(MediaHealthDbContext.MigrationsHistoryTable))
            .Options);
}
