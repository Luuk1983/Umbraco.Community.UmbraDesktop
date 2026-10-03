using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>The pure rules: what is better, what is valid, how names are cleaned.</summary>
public class ScoreRulesTests
{
    /// <summary>Higher-wins and lower-wins boards disagree about the same pair, and equal is never better.</summary>
    /// <param name="better">The board's direction.</param>
    /// <param name="candidate">The new value.</param>
    /// <param name="current">The value to beat.</param>
    /// <param name="expected">Whether the candidate wins.</param>
    [Theory]
    [InlineData("higher", 20, 10, true)]
    [InlineData("higher", 10, 20, false)]
    [InlineData("lower", 10, 20, true)]
    [InlineData("lower", 20, 10, false)]
    [InlineData("higher", 10, 10, false)]
    [InlineData("lower", 10, 10, false)]
    public void Knows_which_way_is_better(string better, long candidate, long current, bool expected) =>
        Assert.Equal(expected, ScoreRules.IsBetter(better, candidate, current));

    /// <summary>Positive and inside the board's limits; anything else is refused (D12).</summary>
    /// <param name="value">The submitted value.</param>
    /// <param name="min">The board's minimum.</param>
    /// <param name="max">The board's maximum.</param>
    /// <param name="expected">Whether it is accepted.</param>
    [Theory]
    [InlineData(1, null, null, true)]
    [InlineData(0, null, null, false)]
    [InlineData(-5, null, null, false)]
    [InlineData(999, 1000L, null, false)]
    [InlineData(1000, 1000L, null, true)]
    [InlineData(5001, null, 5000L, false)]
    public void Accepts_only_positive_values_inside_the_limits(long value, long? min, long? max, bool expected) =>
        Assert.Equal(expected, ScoreRules.IsAcceptable(value, new LeaderboardDefinition("G", "b", "higher", "points", min, max)));

    /// <summary>Trimmed, inner whitespace collapsed, cut to 32, and never empty.</summary>
    /// <param name="requested">What the player typed.</param>
    /// <param name="fallback">The Umbraco name.</param>
    /// <param name="expected">The cleaned name.</param>
    [Theory]
    [InlineData("  Ada   Lovelace ", "Umbraco Name", "Ada Lovelace")]
    [InlineData("   ", "Umbraco Name", "Umbraco Name")]
    [InlineData(null, "", "Player")]
    [InlineData("abcdefghijklmnopqrstuvwxyz0123456789", "x", "abcdefghijklmnopqrstuvwxyz012345")]
    public void Cleans_display_names(string? requested, string fallback, string expected) =>
        Assert.Equal(expected, ScoreRules.CleanDisplayName(requested, fallback));

    /// <summary>Malformed definitions are refused before anything is stored.</summary>
    /// <param name="game">The game alias.</param>
    /// <param name="board">The board alias.</param>
    /// <param name="better">The direction.</param>
    /// <param name="format">The format.</param>
    /// <param name="expected">Whether it is well formed.</param>
    [Theory]
    [InlineData("Pkg.Game", "easy", "lower", "time", true)]
    [InlineData("", "easy", "lower", "time", false)]
    [InlineData("Pkg Game", "easy", "lower", "time", false)]
    [InlineData("Pkg.Game", "Easy Board", "lower", "time", false)]
    [InlineData("Pkg.Game", "easy", "sideways", "time", false)]
    [InlineData("Pkg.Game", "easy", "lower", "furlongs", false)]
    public void Validates_definitions(string game, string board, string better, string format, bool expected) =>
        Assert.Equal(expected, ScoreRules.IsWellFormed(new LeaderboardDefinition(game, board, better, format, null, null)));
}
