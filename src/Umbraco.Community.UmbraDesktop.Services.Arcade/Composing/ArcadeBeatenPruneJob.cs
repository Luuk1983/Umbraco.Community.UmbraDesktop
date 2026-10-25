using Umbraco.Cms.Infrastructure.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Composing;

/// <summary>Daily removal of beaten events nobody read within thirty days (§6).</summary>
/// <remarks>
/// Built on Umbraco's <see cref="RecurringBackgroundJobBase"/>, as Umbraco 18 recommends: it supplies
/// the delay, the back-off, the server roles and the events, and runs the job with the shutdown token.
/// The token-less <c>RunJobAsync()</c> of the bare interface is obsolete in 18 and goes in 19.
/// Default server roles, so on a load-balanced site only the scheduling server runs it.
/// </remarks>
/// <param name="store">The Arcade's store.</param>
public sealed class ArcadeBeatenPruneJob(ArcadeStore store) : RecurringBackgroundJobBase(Interval)
{
    /// <summary>How long an unread event is kept.</summary>
    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(30);

    /// <summary>How often it runs.</summary>
    private static readonly TimeSpan Interval = TimeSpan.FromDays(1);

    /// <inheritdoc />
    public override Task RunJobAsync(CancellationToken cancellationToken) => store.PruneBeatenAsync(MaxAge, cancellationToken);
}
