namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// Runs a unit of work against the Arcade's tables, inside a transaction that commits when it returns
/// and rolls back when it throws.
/// </summary>
/// <remarks>
/// The one seam between the store and Umbraco's EF scope machinery, which cannot be built outside a
/// running Umbraco. Production goes through <see cref="ScopedArcadeDatabase"/>; tests through an
/// in-memory SQLite database migrated with the real migrations (design D9).
/// </remarks>
public interface IArcadeDatabase
{
    /// <summary>Run <paramref name="work"/> and commit.</summary>
    /// <typeparam name="T">What the work returns.</typeparam>
    /// <param name="work">The reads and writes. Call <c>SaveChangesAsync</c> inside it.</param>
    /// <returns>The work's result.</returns>
    Task<T> RunAsync<T>(Func<ArcadeDbContext, Task<T>> work);
}
