namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Data;

/// <summary>
/// An unread "somebody took first place from you" event (D10). At most one per player per board: a
/// newer one replaces it. A class because EF Core updates it in place.
/// </summary>
public sealed class ArcadeBeatenEntity
{
    /// <summary>Surrogate key.</summary>
    public int Id { get; set; }

    /// <summary>Who lost first place.</summary>
    public Guid UserKey { get; set; }

    /// <summary>The game's manifest alias.</summary>
    public string Game { get; set; } = string.Empty;

    /// <summary>The board's alias.</summary>
    public string Board { get; set; } = string.Empty;

    /// <summary>Who took it.</summary>
    public Guid ByUserKey { get; set; }

    /// <summary>The value they took it with.</summary>
    public long Value { get; set; }

    /// <summary>When, UTC. Events older than the prune age are removed by the scheduled job.</summary>
    public DateTime AtUtc { get; set; }
}
