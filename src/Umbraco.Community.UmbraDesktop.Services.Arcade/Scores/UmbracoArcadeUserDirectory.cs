using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>
/// Hides players whose Umbraco account is disabled, locked out or gone, so a colleague who left drops
/// off the boards without anyone deleting anything (design §6).
/// </summary>
/// <param name="users">Umbraco's user service.</param>
public sealed class UmbracoArcadeUserDirectory(IUserService users) : IArcadeUserDirectory
{
    /// <inheritdoc />
    public async Task<IReadOnlySet<Guid>> GetHiddenAsync(IReadOnlyCollection<Guid> userKeys)
    {
        if (userKeys.Count == 0) return new HashSet<Guid>();
        var found = (await users.GetAsync(userKeys)).ToDictionary(u => u.Key);
        return userKeys
            .Where(key => !found.TryGetValue(key, out var user) || user.UserState is UserState.Disabled or UserState.LockedOut)
            .ToHashSet();
    }
}
