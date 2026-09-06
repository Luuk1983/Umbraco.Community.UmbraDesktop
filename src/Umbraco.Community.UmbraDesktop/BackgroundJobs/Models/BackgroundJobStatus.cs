namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// A single background job as presented to the backoffice.
/// </summary>
/// <param name="Name">
/// Display name. The registered name for distributed jobs; the CLR type name for recurring jobs,
/// which have no name of their own.
/// </param>
/// <param name="TypeName">Full CLR type name, used as the stable identity across refreshes.</param>
/// <param name="Kind">Which scheduling mechanism registered the job.</param>
/// <param name="State">What the job is doing right now.</param>
/// <param name="LastOutcome">How the last observed run ended.</param>
/// <param name="Period">
/// How often the job is scheduled, or <see langword="null"/> when scheduling is disabled.
/// </param>
/// <param name="LastRun">
/// When the job last ran, or <see langword="null"/> when no run has been observed this instance.
/// </param>
/// <param name="NextRun">
/// When the job is next expected to run, or <see langword="null"/> when that cannot be determined.
/// Approximate for recurring jobs whose first run is shifted by cron configuration.
/// </param>
/// <param name="ServerRoles">
/// The server roles the job is permitted to run on. Empty for distributed jobs, which carry no
/// role restriction.
/// </param>
public record BackgroundJobStatus(
    string Name,
    string TypeName,
    BackgroundJobKind Kind,
    BackgroundJobState State,
    BackgroundJobOutcome LastOutcome,
    TimeSpan? Period,
    DateTimeOffset? LastRun,
    DateTimeOffset? NextRun,
    IReadOnlyList<string> ServerRoles);
