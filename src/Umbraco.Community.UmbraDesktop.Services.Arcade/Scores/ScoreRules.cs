namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

/// <summary>The Arcade's rules about values, names and aliases, in one place for the store and the API.</summary>
public static class ScoreRules
{
    /// <summary>The longest display name (D6).</summary>
    public const int MaxDisplayNameLength = 32;

    /// <summary>The longest game alias; manifest aliases are namespaced and long.</summary>
    public const int MaxGameAliasLength = 200;

    /// <summary>The longest board alias.</summary>
    public const int MaxBoardAliasLength = 64;

    /// <summary>Game aliases: a manifest alias, letters, digits, dots, dashes and underscores.</summary>
    private static readonly System.Text.RegularExpressions.Regex GameAlias = new("^[A-Za-z0-9._-]+$");

    /// <summary>Board aliases: lower case, digits and dashes, like <c>draw-1</c>.</summary>
    private static readonly System.Text.RegularExpressions.Regex BoardAlias = new("^[a-z0-9-]+$");

    /// <summary>What a board shows when a player has no usable name at all.</summary>
    public const string FallbackDisplayName = "Player";

    /// <summary>Whether <paramref name="candidate"/> beats <paramref name="current"/> on a board where <paramref name="better"/> wins. Equal is not better (D8).</summary>
    /// <param name="better"><c>higher</c> or <c>lower</c>.</param>
    /// <param name="candidate">The new value.</param>
    /// <param name="current">The value to beat.</param>
    /// <returns>True when strictly better.</returns>
    public static bool IsBetter(string better, long candidate, long current) =>
        better == "lower" ? candidate < current : candidate > current;

    /// <summary>Positive and within the board's limits; the whole of the cheat protection (D12).</summary>
    /// <param name="value">The submitted value.</param>
    /// <param name="definition">The board.</param>
    /// <returns>True when it may be stored.</returns>
    public static bool IsAcceptable(long value, LeaderboardDefinition definition) =>
        value > 0 && (definition.Min is not { } min || value >= min) && (definition.Max is not { } max || value <= max);

    /// <summary>Whether a definition is one the Arcade can store.</summary>
    /// <param name="definition">The definition.</param>
    /// <returns>True when every field is valid.</returns>
    public static bool IsWellFormed(LeaderboardDefinition definition) =>
        definition.Game.Length is > 0 and <= MaxGameAliasLength && GameAlias.IsMatch(definition.Game)
        && definition.Board.Length is > 0 and <= MaxBoardAliasLength && BoardAlias.IsMatch(definition.Board)
        && definition.Better is "higher" or "lower"
        && definition.Format is "points" or "time"
        && (definition.Min is null || definition.Max is null || definition.Min <= definition.Max);

    /// <summary>
    /// A display name as the boards show it: trimmed, inner whitespace collapsed, at most
    /// <see cref="MaxDisplayNameLength"/> characters, falling back to the Umbraco name and then to
    /// <see cref="FallbackDisplayName"/>. No word filter (D6).
    /// </summary>
    /// <param name="requested">What the player typed, if anything.</param>
    /// <param name="fallback">The player's Umbraco name.</param>
    /// <returns>The name to store.</returns>
    public static string CleanDisplayName(string? requested, string? fallback)
    {
        static string Clean(string? text)
        {
            var collapsed = string.Join(' ', (text ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
            return collapsed.Length > MaxDisplayNameLength ? collapsed[..MaxDisplayNameLength].TrimEnd() : collapsed;
        }

        var name = Clean(requested);
        if (name.Length == 0) name = Clean(fallback);
        return name.Length == 0 ? FallbackDisplayName : name;
    }
}
