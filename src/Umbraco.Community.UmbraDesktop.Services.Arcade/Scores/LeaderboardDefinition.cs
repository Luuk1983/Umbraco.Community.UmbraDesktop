namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>A board's rules, as the game's <c>umbraDesktopGame</c> manifest declares them and every submit carries.</summary>
/// <param name="Game">The game's manifest alias.</param>
/// <param name="Board">The board's alias.</param>
/// <param name="Better"><c>higher</c> or <c>lower</c>.</param>
/// <param name="Format"><c>points</c> or <c>time</c> (milliseconds).</param>
/// <param name="Min">The smallest value accepted, if any.</param>
/// <param name="Max">The largest value accepted, if any.</param>
public sealed record LeaderboardDefinition(string Game, string Board, string Better, string Format, long? Min, long? Max);
