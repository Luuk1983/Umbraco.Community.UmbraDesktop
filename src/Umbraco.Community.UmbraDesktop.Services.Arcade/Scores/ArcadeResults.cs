namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>How a submit went.</summary>
public enum SubmitStatus
{
    /// <summary>Checked and recorded (as a best, or as not one).</summary>
    Accepted,

    /// <summary>The value or the definition was invalid; nothing was stored.</summary>
    Rejected,

    /// <summary>The board is already recorded with different rules; nothing was stored.</summary>
    Conflict,
}

/// <summary>What a submit tells the game, and through it the player.</summary>
/// <param name="Status">How it went.</param>
/// <param name="IsPersonalBest">Whether it replaced the player's best.</param>
/// <param name="PreviousBest">The best it replaced, or null for a first score.</param>
/// <param name="Rank">The player's rank on the board, counting public players and themselves; their would-be rank when private.</param>
/// <param name="IsPublic">Whether the player is shown on the boards.</param>
/// <param name="AskedAboutPublic">Whether the player has answered the one-time question (D7).</param>
/// <param name="DisplayName">The player's display name, for prefilling that question.</param>
public sealed record SubmitResult(SubmitStatus Status, bool IsPersonalBest, long? PreviousBest, int Rank, bool IsPublic, bool AskedAboutPublic, string DisplayName)
{
    /// <summary>A refusal of the given kind.</summary>
    /// <param name="status">Rejected or Conflict.</param>
    /// <returns>The result.</returns>
    public static SubmitResult Refused(SubmitStatus status) => new(status, false, null, 0, false, false, string.Empty);
}

/// <summary>One row on a board.</summary>
/// <param name="Rank">Position, from 1.</param>
/// <param name="UserKey">The player, so an admin can act on the row.</param>
/// <param name="DisplayName">Their board name.</param>
/// <param name="Value">Their best.</param>
/// <param name="AchievedAtUtc">When they set it.</param>
/// <param name="IsViewer">Whether it is the person looking.</param>
public sealed record BoardEntry(int Rank, Guid UserKey, string DisplayName, long Value, DateTime AchievedAtUtc, bool IsViewer);

/// <summary>A board as the hub shows it.</summary>
/// <param name="Definition">The board's rules, or null when nobody has played it.</param>
/// <param name="Top">The top public rows.</param>
/// <param name="Viewer">The viewer's own row, whether or not it is in <paramref name="Top"/> or public; null if they have not played.</param>
/// <param name="ViewerIsPublic">Whether the viewer is shown to others.</param>
public sealed record BoardView(LeaderboardDefinition? Definition, IReadOnlyList<BoardEntry> Top, BoardEntry? Viewer, bool ViewerIsPublic);

/// <summary>"Somebody took first place from you", as the desktop shows it.</summary>
/// <param name="Game">The game's manifest alias.</param>
/// <param name="Board">The board's alias.</param>
/// <param name="ByDisplayName">Who took it.</param>
/// <param name="Value">With what.</param>
/// <param name="Format"><c>points</c> or <c>time</c>, for showing the value.</param>
public sealed record BeatenEvent(string Game, string Board, string ByDisplayName, long Value, string Format);

/// <summary>A player's Arcade settings, as the API returns them.</summary>
/// <param name="DisplayName">Their board name.</param>
/// <param name="IsPublic">Whether they are shown.</param>
/// <param name="NotifyWhenBeaten">Whether they are told when beaten.</param>
/// <param name="AskedAboutPublic">Whether they have answered the one-time question.</param>
public sealed record ArcadeProfile(string DisplayName, bool IsPublic, bool NotifyWhenBeaten, bool AskedAboutPublic)
{
    /// <summary>The API's view of a stored profile.</summary>
    /// <param name="entity">The row.</param>
    /// <returns>The profile.</returns>
    public static ArcadeProfile From(Data.ArcadeProfileEntity entity) =>
        new(entity.DisplayName, entity.IsPublic, entity.NotifyWhenBeaten, entity.AskedAboutPublic);
}
