using Umbraco.Cms.Persistence.EFCore.Scoping;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// <see cref="IArcadeDatabase"/> over Umbraco's EF Core scope, so Arcade writes share the site's
/// connection and join any ambient Umbraco transaction.
/// </summary>
/// <param name="scopes">Umbraco's scope provider for the Arcade's context.</param>
public sealed class ScopedArcadeDatabase(IEFCoreScopeProvider<ArcadeDbContext> scopes) : IArcadeDatabase
{
    /// <inheritdoc />
    public async Task<T> RunAsync<T>(Func<ArcadeDbContext, Task<T>> work)
    {
        using var scope = scopes.CreateScope();
        var result = await scope.ExecuteWithContextAsync(work);
        scope.Complete();
        return result;
    }
}
