using Microsoft.EntityFrameworkCore;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// The SQL Server migration context. Exists only to own <c>Migrations/SqlServer</c>; the runtime
/// reads and writes through <see cref="ArcadeDbContext"/>. Microsoft's "multiple context types"
/// pattern for per-provider migrations (design D9).
/// </summary>
/// <param name="options">Options pointed at a SQL Server database.</param>
public sealed class SqlServerArcadeDbContext(DbContextOptions<SqlServerArcadeDbContext> options) : ArcadeDbContext(options);
