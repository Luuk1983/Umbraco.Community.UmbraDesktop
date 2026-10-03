using Umbraco.Cms.Infrastructure.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>Daily removal of beaten events nobody read within thirty days (§6).</summary>
/// <remarks>
/// Implements the 17.0 shape of <see cref="IRecurringBackgroundJob"/>, <c>RunJobAsync()</c> with no
/// token: 17.5 added a token overload that forwards to this one, so it works across every 17.
/// Default server roles, so on a load-balanced site only the scheduling server runs it.
/// </remarks>
/// <param name="store">The Arcade's store.</param>
public sealed class ArcadeBeatenPruneJob(ArcadeStore store) : IRecurringBackgroundJob
{
    /// <summary>How long an unread event is kept.</summary>
    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(30);

    /// <inheritdoc />
    public TimeSpan Period => TimeSpan.FromDays(1);

    /// <inheritdoc />
    public event EventHandler PeriodChanged { add { } remove { } }

    /// <inheritdoc />
    public Task RunJobAsync() => store.PruneBeatenAsync(MaxAge);
}
