using Microsoft.Extensions.Configuration;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Infrastructure.BackgroundJobs;
using Umbraco.Cms.Infrastructure.Persistence.Repositories;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

namespace Umbraco.Community.UmbraDesktop.BackgroundJobs;

/// <summary>
/// Merges Umbraco's two background job mechanisms into a single report.
/// </summary>
/// <param name="distributedJobs">Registered distributed jobs, the definition half.</param>
/// <param name="distributedJobRepository">The distributed job table, the state half.</param>
/// <param name="scopeProvider">Provides the scope the repository read needs.</param>
/// <param name="recurringJobs">Registered recurring jobs, the definition half.</param>
/// <param name="activityCache">Observed recurring job activity, the state half.</param>
/// <param name="configuration">Read for the distributed job execution timeout.</param>
/// <param name="timeProvider">Clock used for staleness and next-run arithmetic.</param>
public sealed class BackgroundJobReportService(
    IEnumerable<IDistributedBackgroundJob> distributedJobs,
    IDistributedJobRepository distributedJobRepository,
    ICoreScopeProvider scopeProvider,
    IEnumerable<IRecurringBackgroundJob> recurringJobs,
    RecurringJobActivityCache activityCache,
    IConfiguration configuration,
    TimeProvider timeProvider) : IBackgroundJobReportService
{
    /// <summary>
    /// Configuration key for Umbraco's distributed job execution timeout.
    /// </summary>
    /// <remarks>
    /// Read from configuration rather than <c>DistributedJobSettings</c> because the
    /// <c>MaximumExecutionTime</c> property was added in 17.1.0 and this package compiles against
    /// 17.0.0. Note the section is <c>DistributedJobs</c>, plural.
    /// </remarks>
    private const string MaximumExecutionTimeKey = "Umbraco:CMS:DistributedJobs:MaximumExecutionTime";

    /// <summary>Umbraco's own default for the distributed job execution timeout.</summary>
    private static readonly TimeSpan DefaultMaximumExecutionTime = TimeSpan.FromMinutes(5);

    /// <inheritdoc />
    public BackgroundJobReport GetReport()
    {
        var jobs = new List<BackgroundJobStatus>();
        jobs.AddRange(GetDistributed());
        jobs.AddRange(GetRecurring());

        return new BackgroundJobReport(
            activityCache.MonitoringSince,
            jobs.OrderBy(job => job.Kind)
                .ThenBy(job => job.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray());
    }

    /// <summary>
    /// Builds a row for every distributed job that is both registered and present in the table.
    /// </summary>
    /// <returns>The distributed jobs.</returns>
    private List<BackgroundJobStatus> GetDistributed()
    {
        var registered = distributedJobs.ToDictionary(job => job.Name, StringComparer.OrdinalIgnoreCase);
        var maximumExecutionTime = configuration.GetValue<TimeSpan?>(MaximumExecutionTimeKey)
                                   ?? DefaultMaximumExecutionTime;
        var now = timeProvider.GetUtcNow();

        using var scope = scopeProvider.CreateCoreScope();
        var rows = distributedJobRepository.GetAll().ToArray();
        scope.Complete();

        var result = new List<BackgroundJobStatus>();

        foreach (var row in rows)
        {
            // A row whose job is no longer registered is left permanently running: TryTakeRunnableAsync
            // sets IsRunning before it discovers the job is missing, then returns null, so FinishAsync
            // never runs. Listing it would show a phantom job stuck in a failure state. EnsureJobsAsync
            // deletes these on the next application start.
            if (registered.TryGetValue(row.Name, out var definition) is false)
            {
                continue;
            }

            var lastRun = AsUtc(row.LastRun);
            var lastAttemptedRun = AsUtc(row.LastAttemptedRun);

            result.Add(new BackgroundJobStatus(
                row.Name,
                definition.GetType().FullName ?? row.Name,
                BackgroundJobKind.Distributed,
                DistributedState(row.IsRunning, now, lastAttemptedRun, row.Period, maximumExecutionTime),
                BackgroundJobOutcome.Unavailable,
                row.Period,
                lastRun,
                lastRun + row.Period,
                []));
        }

        return result;
    }

    /// <summary>
    /// Builds a row for every registered recurring job, joined to what has been observed of it.
    /// </summary>
    /// <returns>The recurring jobs.</returns>
    private List<BackgroundJobStatus> GetRecurring()
    {
        var result = new List<BackgroundJobStatus>();

        foreach (var job in recurringJobs)
        {
            var jobType = job.GetType();
            var activity = activityCache.Get(jobType);
            var isManual = job.Period == Timeout.InfiniteTimeSpan;

            result.Add(new BackgroundJobStatus(
                jobType.Name,
                jobType.FullName ?? jobType.Name,
                BackgroundJobKind.Recurring,
                RecurringState(activity, isManual),
                activity?.LastOutcome ?? BackgroundJobOutcome.NotObserved,
                isManual ? null : job.Period,
                activity?.LastRun,
                RecurringNextRun(job, activity, isManual),
                job.ServerRoles.Select(role => role.ToString()).ToArray()));
        }

        return result;
    }

    /// <summary>
    /// Decides a recurring job's state.
    /// </summary>
    /// <param name="activity">What has been observed, if anything.</param>
    /// <param name="isManual">Whether automatic scheduling is disabled.</param>
    /// <returns>The state to report.</returns>
    /// <remarks>
    /// Running wins over manual: a job with scheduling disabled can still have been triggered, and
    /// reporting it as merely manual while it executes would be wrong.
    /// </remarks>
    private static BackgroundJobState RecurringState(RecurringJobActivity? activity, bool isManual)
    {
        if (activity?.IsRunning is true)
        {
            return BackgroundJobState.Running;
        }

        return isManual ? BackgroundJobState.Manual : BackgroundJobState.Idle;
    }

    /// <summary>
    /// Works out when a recurring job is next expected to run.
    /// </summary>
    /// <param name="job">The registered job.</param>
    /// <param name="activity">What has been observed, if anything.</param>
    /// <param name="isManual">Whether automatic scheduling is disabled.</param>
    /// <returns>The expected time, or <see langword="null"/> if it cannot be determined.</returns>
    /// <remarks>
    /// Approximate. A job's first run can be shifted by cron configuration through
    /// <c>DelayCalculator</c>, and <see cref="IRecurringBackgroundJob"/> does not expose that.
    /// <para>
    /// Counts from the later of the last completed run and the last schedule tick. Core counts the
    /// period from the previous run's <em>completion</em> for a job that ran — 17.6.2's
    /// <c>IsDue</c> remark says so, and <c>RecurringHostedServiceBase</c> re-arms the timer in a
    /// <c>finally</c> — so the completion wins whenever there is one. For a tick that was skipped
    /// or is still in flight there is no completion, and the attempt time is both the only basis
    /// available and what the timer will actually count from. Without the attempt time, a job that
    /// is skipped on every tick (any recurring job left on the default server roles, on a
    /// subscriber node) would report a next run pinned to startup forever.
    /// </para>
    /// </remarks>
    private DateTimeOffset? RecurringNextRun(
        IRecurringBackgroundJob job,
        RecurringJobActivity? activity,
        bool isManual)
    {
        if (isManual)
        {
            return null;
        }

        var observed = Later(activity?.LastRun, activity?.LastAttempt);
        if (observed is { } lastTick)
        {
            return lastTick + job.Period;
        }

        return job.Delay == Timeout.InfiniteTimeSpan
            ? null
            : activityCache.MonitoringSince + job.Delay;
    }

    /// <summary>
    /// Picks whichever of two optional instants is later.
    /// </summary>
    /// <param name="first">The first instant, if known.</param>
    /// <param name="second">The second instant, if known.</param>
    /// <returns>
    /// The later of the two, the one that is known if only one is, or <see langword="null"/> if
    /// neither is.
    /// </returns>
    private static DateTimeOffset? Later(DateTimeOffset? first, DateTimeOffset? second)
    {
        if (first is null)
        {
            return second;
        }

        if (second is null)
        {
            return first;
        }

        return first > second ? first : second;
    }

    /// <summary>
    /// Decides a distributed job's state, matching core's own reclaim condition.
    /// </summary>
    /// <param name="isRunning">Whether the row is marked as running.</param>
    /// <param name="now">The current time.</param>
    /// <param name="lastAttemptedRun">When the run was claimed.</param>
    /// <param name="period">The job's scheduled period.</param>
    /// <param name="maximumExecutionTime">The configured execution timeout.</param>
    /// <returns>The state to report.</returns>
    /// <remarks>
    /// The threshold is <c>Period + MaximumExecutionTime</c>, not <c>MaximumExecutionTime</c> alone.
    /// That is what <c>DistributedJobService.TryTakeRunnableAsync</c> uses to decide a job may be
    /// reclaimed, and reporting stale any earlier would contradict Umbraco's own view.
    /// <para>
    /// That reclaim guard arrived in 17.1.0. On 17.0.x — the floor this package targets —
    /// <c>MaximumExecutionTime</c> does not exist at all and the predicate is just
    /// <c>x.LastRun &lt; DateTime.UtcNow - x.Period</c>, with no <c>IsRunning</c> guard, so a stuck
    /// row is reclaimed as soon as it is merely due and <see cref="BackgroundJobState.Stale"/> is
    /// effectively unreachable there.
    /// </para>
    /// </remarks>
    private static BackgroundJobState DistributedState(
        bool isRunning,
        DateTimeOffset now,
        DateTimeOffset lastAttemptedRun,
        TimeSpan period,
        TimeSpan maximumExecutionTime)
    {
        if (isRunning is false)
        {
            return BackgroundJobState.Idle;
        }

        return now - lastAttemptedRun > period + maximumExecutionTime
            ? BackgroundJobState.Stale
            : BackgroundJobState.Running;
    }

    /// <summary>
    /// Reinterprets a database timestamp as UTC.
    /// </summary>
    /// <param name="value">The value read from the table.</param>
    /// <returns>The same instant, tagged as UTC.</returns>
    /// <remarks>
    /// Umbraco writes <c>DateTime.UtcNow</c> into these columns, but the provider returns
    /// <see cref="DateTimeKind.Unspecified"/>, which would otherwise be read as local time.
    /// </remarks>
    private static DateTimeOffset AsUtc(DateTime value)
        => new(DateTime.SpecifyKind(value, DateTimeKind.Utc));
}
