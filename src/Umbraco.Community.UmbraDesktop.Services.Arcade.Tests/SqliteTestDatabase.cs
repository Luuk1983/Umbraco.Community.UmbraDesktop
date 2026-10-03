using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>
/// An in-memory SQLite database built by the real SQLite migrations, kept open for one test, with
/// each unit of work in its own transaction as the scoped database does.
/// </summary>
internal sealed class SqliteTestDatabase : IArcadeDatabase, IAsyncDisposable
{
    /// <summary>The connection that keeps the in-memory database alive.</summary>
    private readonly SqliteConnection _connection;

    /// <summary>Options for contexts over <see cref="_connection"/>.</summary>
    private readonly DbContextOptions<SqliteArcadeDbContext> _options;

    /// <summary>Wraps the open connection; <see cref="CreateAsync"/> migrates it.</summary>
    /// <param name="connection">The open in-memory connection.</param>
    private SqliteTestDatabase(SqliteConnection connection)
    {
        _connection = connection;
        _options = new DbContextOptionsBuilder<SqliteArcadeDbContext>()
            .UseSqlite(connection, x => x.MigrationsHistoryTable(ArcadeDbContext.MigrationsHistoryTable))
            .Options;
    }

    /// <summary>A fresh, migrated database.</summary>
    /// <returns>The database.</returns>
    public static async Task<SqliteTestDatabase> CreateAsync()
    {
        var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        var database = new SqliteTestDatabase(connection);
        await using var context = new SqliteArcadeDbContext(database._options);
        await context.Database.MigrateAsync();
        return database;
    }

    /// <inheritdoc />
    public async Task<T> RunAsync<T>(Func<ArcadeDbContext, Task<T>> work)
    {
        await using var context = new SqliteArcadeDbContext(_options);
        await using var transaction = await context.Database.BeginTransactionAsync();
        var result = await work(context);
        await transaction.CommitAsync();
        return result;
    }

    /// <summary>Read the tables directly, for assertions.</summary>
    /// <typeparam name="T">The answer.</typeparam>
    /// <param name="read">The query.</param>
    /// <returns>The answer.</returns>
    public Task<T> ReadAsync<T>(Func<ArcadeDbContext, Task<T>> read) => RunAsync(read);

    /// <inheritdoc />
    public ValueTask DisposeAsync() => _connection.DisposeAsync();
}
