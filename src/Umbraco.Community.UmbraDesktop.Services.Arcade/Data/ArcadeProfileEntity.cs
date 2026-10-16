namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// One player's Arcade settings. A class rather than a record because EF Core tracks and updates it
/// in place.
/// </summary>
public sealed class ArcadeProfileEntity
{
    /// <summary>The Umbraco user's key. No foreign key to <c>umbracoUser</c>: see design §6.</summary>
    public Guid UserKey { get; set; }

    /// <summary>The name the boards show, at most <see cref="Scores.ScoreRules.MaxDisplayNameLength"/> characters.</summary>
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>Whether the player's scores appear on the boards (D7). Private by default.</summary>
    public bool IsPublic { get; set; }

    /// <summary>Whether to be told when somebody takes first place from them (D10).</summary>
    public bool NotifyWhenBeaten { get; set; } = true;

    /// <summary>Whether the one-time "show your scores?" question has been answered.</summary>
    public bool AskedAboutPublic { get; set; }
}
