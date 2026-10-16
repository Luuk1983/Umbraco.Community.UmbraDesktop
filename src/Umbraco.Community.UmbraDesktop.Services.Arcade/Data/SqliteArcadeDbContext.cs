using Microsoft.EntityFrameworkCore;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>The SQLite migration context; see <see cref="SqlServerArcadeDbContext"/>.</summary>
/// <param name="options">Options pointed at a SQLite database.</param>
public sealed class SqliteArcadeDbContext(DbContextOptions<SqliteArcadeDbContext> options) : ArcadeDbContext(options);
