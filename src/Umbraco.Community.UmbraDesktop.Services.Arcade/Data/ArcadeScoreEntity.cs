namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>A player's best on one board (D8). A class because EF Core updates it in place.</summary>
public sealed class ArcadeScoreEntity
{
    /// <summary>Surrogate key.</summary>
    public int Id { get; set; }

    /// <summary>Whose best it is.</summary>
    public Guid UserKey { get; set; }

    /// <summary>The game's manifest alias.</summary>
    public string Game { get; set; } = string.Empty;

    /// <summary>The board's alias.</summary>
    public string Board { get; set; } = string.Empty;

    /// <summary>The best value: points, or milliseconds for a time.</summary>
    public long Value { get; set; }

    /// <summary>When it was set, UTC. Breaks ties, earlier first. DateTime because SQLite cannot order DateTimeOffset.</summary>
    public DateTime AchievedAtUtc { get; set; }
}
