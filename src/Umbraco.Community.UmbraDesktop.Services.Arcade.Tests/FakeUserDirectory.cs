using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>A user directory where a test says who is hidden.</summary>
internal sealed class FakeUserDirectory : IArcadeUserDirectory
{
    /// <summary>The players to hide.</summary>
    public HashSet<Guid> Hidden { get; } = [];

    /// <inheritdoc />
    public Task<IReadOnlySet<Guid>> GetHiddenAsync(IReadOnlyCollection<Guid> userKeys) =>
        Task.FromResult<IReadOnlySet<Guid>>(userKeys.Where(Hidden.Contains).ToHashSet());
}
