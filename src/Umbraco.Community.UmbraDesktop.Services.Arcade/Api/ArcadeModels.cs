using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Api;

/// <summary>A score and the board it belongs to, as the game's manifest declares it.</summary>
/// <param name="Game">The game's manifest alias.</param>
/// <param name="Board">The board's alias.</param>
/// <param name="Better"><c>higher</c> or <c>lower</c>.</param>
/// <param name="Format"><c>points</c> or <c>time</c>.</param>
/// <param name="Min">The smallest value accepted, if any.</param>
/// <param name="Max">The largest value accepted, if any.</param>
/// <param name="Value">The score.</param>
public sealed record SubmitScoreRequestModel(string Game, string Board, string Better, string Format, long? Min, long? Max, long Value)
{
    /// <summary>The board part, as the store takes it.</summary>
    /// <returns>The definition.</returns>
    public LeaderboardDefinition ToDefinition() => new(Game, Board, Better, Format, Min, Max);
}

/// <summary>What a submit answers.</summary>
/// <param name="IsPersonalBest">Whether it replaced the player's best.</param>
/// <param name="PreviousBest">The best it replaced.</param>
/// <param name="Rank">Rank, or would-be rank when private.</param>
/// <param name="IsPublic">Whether the player is shown.</param>
/// <param name="AskedAboutPublic">Whether the one-time question has been answered.</param>
/// <param name="DisplayName">The player's display name, to prefill that question.</param>
/// <param name="Passed">Who the score took first place from, or null.</param>
public sealed record SubmitScoreResponseModel(bool IsPersonalBest, long? PreviousBest, int Rank, bool IsPublic, bool AskedAboutPublic, string DisplayName, PassedPlayerModel? Passed);

/// <summary>The player a score passed for first place.</summary>
/// <param name="DisplayName">Their name.</param>
/// <param name="Value">Their best.</param>
public sealed record PassedPlayerModel(string DisplayName, long Value)
{
    /// <summary>From the store's record.</summary>
    /// <param name="passed">The record, or null.</param>
    /// <returns>The model, or null.</returns>
    public static PassedPlayerModel? From(PassedPlayer? passed) => passed is null ? null : new(passed.DisplayName, passed.Value);
}

/// <summary>A change to the caller's settings; a null field is left alone.</summary>
/// <param name="DisplayName">A new display name.</param>
/// <param name="IsPublic">Show or hide their scores.</param>
/// <param name="NotifyWhenBeaten">Whether to be told when beaten.</param>
public sealed record UpdateProfileRequestModel(string? DisplayName, bool? IsPublic, bool? NotifyWhenBeaten);

/// <summary>One board row.</summary>
/// <param name="Rank">Position.</param>
/// <param name="UserKey">The player.</param>
/// <param name="DisplayName">Their name.</param>
/// <param name="Value">Their best.</param>
/// <param name="AchievedAtUtc">When.</param>
/// <param name="IsViewer">Whether it is the caller.</param>
public sealed record BoardEntryModel(int Rank, Guid UserKey, string DisplayName, long Value, DateTime AchievedAtUtc, bool IsViewer)
{
    /// <summary>From the store's row.</summary>
    /// <param name="entry">The row.</param>
    /// <returns>The model.</returns>
    public static BoardEntryModel From(BoardEntry entry) =>
        new(entry.Rank, entry.UserKey, entry.DisplayName, entry.Value, entry.AchievedAtUtc, entry.IsViewer);
}

/// <summary>A board for the caller.</summary>
/// <param name="Played">Whether anybody has played it.</param>
/// <param name="Top">The top public rows.</param>
/// <param name="Viewer">The caller's own row, if they have played.</param>
/// <param name="ViewerIsPublic">Whether the caller is shown.</param>
/// <param name="CanModerate">Whether the caller may remove rows and reset the board.</param>
/// <param name="Players">How many rank on it for the caller.</param>
/// <param name="Above">The shown player directly above the caller, or null.</param>
public sealed record BoardResponseModel(bool Played, IReadOnlyList<BoardEntryModel> Top, BoardEntryModel? Viewer, bool ViewerIsPublic, bool CanModerate, int Players, BoardEntryModel? Above);

/// <summary>A player's best.</summary>
/// <param name="Value">The best, or null if they have not played.</param>
public sealed record BestResponseModel(long? Value);

/// <summary>One board on the overview.</summary>
/// <param name="Game">The game's manifest alias.</param>
/// <param name="Board">The board's alias.</param>
/// <param name="Players">How many rank on it for the caller.</param>
/// <param name="Viewer">The caller's row, or null.</param>
/// <param name="Leader">First place, or null.</param>
/// <param name="Next">Second place, or null.</param>
public sealed record BoardSummaryModel(string Game, string Board, int Players, BoardEntryModel? Viewer, BoardEntryModel? Leader, BoardEntryModel? Next)
{
    /// <summary>From the store's record.</summary>
    /// <param name="summary">The record.</param>
    /// <returns>The model.</returns>
    public static BoardSummaryModel From(BoardSummary summary) => new(
        summary.Game,
        summary.Board,
        summary.Players,
        summary.Viewer is null ? null : BoardEntryModel.From(summary.Viewer),
        summary.Leader is null ? null : BoardEntryModel.From(summary.Leader),
        summary.Next is null ? null : BoardEntryModel.From(summary.Next));
}

/// <summary>The hub's overview.</summary>
/// <param name="Colleagues">Distinct players shown on any board, not counting the caller.</param>
/// <param name="Boards">Every board the Arcade knows.</param>
public sealed record OverviewResponseModel(int Colleagues, IReadOnlyList<BoardSummaryModel> Boards);
