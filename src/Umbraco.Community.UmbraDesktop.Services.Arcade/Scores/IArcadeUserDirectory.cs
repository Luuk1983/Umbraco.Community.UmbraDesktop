namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>Answers which players should not appear on a board right now.</summary>
public interface IArcadeUserDirectory
{
    /// <summary>
    /// The subset of <paramref name="userKeys"/> that is disabled, locked out or no longer exists.
    /// </summary>
    /// <param name="userKeys">The players on a board.</param>
    /// <returns>The ones to leave out.</returns>
    Task<IReadOnlySet<Guid>> GetHiddenAsync(IReadOnlyCollection<Guid> userKeys);
}
