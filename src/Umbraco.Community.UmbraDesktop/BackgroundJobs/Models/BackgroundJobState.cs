namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// What a background job is doing at the moment the report was built.
/// </summary>
public enum BackgroundJobState
{
    /// <summary>Not executing. A next run is scheduled.</summary>
    Idle,

    /// <summary>Executing right now.</summary>
    Running,

    /// <summary>
    /// Marked as running for longer than Umbraco tolerates, so it is eligible to be reclaimed by
    /// another server. Usually means the server running it died mid-job. Distributed jobs only.
    /// </summary>
    Stale,

    /// <summary>
    /// Automatic scheduling is disabled (an infinite period), so the job only runs when triggered.
    /// Recurring jobs only.
    /// </summary>
    Manual,
}
