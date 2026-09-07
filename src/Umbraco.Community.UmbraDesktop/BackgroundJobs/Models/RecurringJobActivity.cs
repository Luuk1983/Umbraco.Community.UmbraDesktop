namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// What has been observed about a single recurring background job since this application instance
/// started.
/// </summary>
/// <param name="IsRunning">
/// True between an executing notification and the notification that completes it.
/// </param>
/// <param name="LastAttempt">
/// When the job's schedule last fired, whether or not it went on to execute. Set on every tick,
/// including one that was skipped, so the next expected run can still be derived for a job that
/// never actually runs on this server.
/// </param>
/// <param name="LastRun">
/// When the most recent completed run finished, or <see langword="null"/> if none has been observed.
/// A skipped run does not set this, because being skipped is not a run.
/// </param>
/// <param name="LastOutcome">How the most recent observed run or skip ended.</param>
public record RecurringJobActivity(
    bool IsRunning,
    DateTimeOffset? LastAttempt,
    DateTimeOffset? LastRun,
    BackgroundJobOutcome LastOutcome);
