namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// The rules of one board, recorded from the game's manifest the first time a score arrives for it.
/// A class because EF Core tracks it.
/// </summary>
public sealed class ArcadeLeaderboardEntity
{
    /// <summary>The game's <c>umbraDesktopGame</c> manifest alias.</summary>
    public string Game { get; set; } = string.Empty;

    /// <summary>The board's alias within the game, e.g. <c>easy</c> or <c>draw-1</c>.</summary>
    public string Board { get; set; } = string.Empty;

    /// <summary><c>higher</c> or <c>lower</c>: which way is better.</summary>
    public string Better { get; set; } = string.Empty;

    /// <summary><c>points</c> or <c>time</c>; time values are milliseconds.</summary>
    public string Format { get; set; } = string.Empty;

    /// <summary>The smallest value accepted, if the game set one.</summary>
    public long? Min { get; set; }

    /// <summary>The largest value accepted, if the game set one.</summary>
    public long? Max { get; set; }
}
