using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Core.Sync;
using Umbraco.Cms.Infrastructure.BackgroundJobs;
using Umbraco.Cms.Infrastructure.Models;
using Umbraco.Cms.Infrastructure.Persistence.Repositories;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.BackgroundJobs;

/// <summary>
/// Exercises the recurring-job half of <see cref="BackgroundJobReportService"/>: state and next-run
/// derivation from <see cref="RecurringJobActivityCache"/> observations, the manual/infinite-period
/// special case, and how server roles are surfaced. The distributed-job half is covered separately in
/// <see cref="BackgroundJobReportServiceDistributedTests"/>.
/// </summary>
public class BackgroundJobReportServiceRecurringTests
{
    /// <summary>Arbitrary fixed instant the fake clock starts at, so next-run math is checkable.</summary>
    private static readonly DateTimeOffset Start = new(2026, 9, 6, 12, 0, 0, TimeSpan.Zero);

    /// <summary>
    /// Stand-in registered recurring job with a configurable period, delay and server roles, so a
    /// single fake can drive every scenario in this class rather than needing one fake per shape.
    /// </summary>
    /// <param name="period">The job's scheduled period.</param>
    /// <param name="delay">The job's initial delay before its first scheduled run.</param>
    /// <param name="roles">
    /// The server roles the job runs on; defaults to <see cref="ServerRole.Single"/> when none are
    /// given, since most tests do not care about role restriction.
    /// </param>
    private sealed class FakeRecurringJob(TimeSpan period, TimeSpan delay, params ServerRole[] roles)
        : IRecurringBackgroundJob
    {
        /// <inheritdoc />
        public TimeSpan Period => period;

        /// <inheritdoc />
        public TimeSpan Delay => delay;

        /// <inheritdoc />
        public ServerRole[] ServerRoles => roles.Length is 0 ? [ServerRole.Single] : roles;

        /// <inheritdoc />
        public event EventHandler? PeriodChanged { add { } remove { } }

        /// <inheritdoc />
        public Task RunJobAsync() => Task.CompletedTask;
    }

    /// <summary>
    /// Wires a <see cref="BackgroundJobReportService"/> with no distributed jobs registered and an
    /// empty distributed job table, so a test can focus purely on the recurring-job jobs given. The
    /// cache and the service share the same fake clock, pinned to <see cref="Start"/>, so a test can
    /// advance it and observe the effect on next-run calculations.
    /// </summary>
    /// <param name="jobs">The recurring jobs to register.</param>
    /// <returns>The service under test, the cache backing it, and the clock driving both.</returns>
    private static (BackgroundJobReportService Service, RecurringJobActivityCache Cache, FakeTimeProvider Time) Create(
        params IRecurringBackgroundJob[] jobs)
    {
        var time = new FakeTimeProvider(Start);
        var cache = new RecurringJobActivityCache(time);

        var repository = Substitute.For<IDistributedJobRepository>();
        repository.GetAll().Returns(Array.Empty<DistributedBackgroundJobModel>());

        var scopeProvider = Substitute.For<ICoreScopeProvider>();
        scopeProvider.CreateCoreScope().Returns(Substitute.For<ICoreScope>());

        var service = new BackgroundJobReportService(
            [],
            repository,
            scopeProvider,
            jobs,
            cache,
            new ConfigurationBuilder().Build(),
            time);

        return (service, cache, time);
    }

    /// <summary>
    /// A job nothing has been observed for yet takes its next run from
    /// <see cref="RecurringJobActivityCache.MonitoringSince"/> plus its configured delay, since that
    /// is the only basis available before the schedule has ticked even once.
    /// </summary>
    [Fact]
    public void UnobservedJob_TakesNextRunFromMonitoringSincePlusDelay()
    {
        var delay = TimeSpan.FromMinutes(2);
        var (service, _, _) = Create(new FakeRecurringJob(TimeSpan.FromMinutes(5), delay));

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(BackgroundJobKind.Recurring, job.Kind);
        Assert.Null(job.LastRun);
        Assert.Equal(BackgroundJobOutcome.NotObserved, job.LastOutcome);
        Assert.Equal(Start + delay, job.NextRun);
    }

    /// <summary>Once a job has completed a run, its next run is derived from that last run plus its period, not the delay.</summary>
    [Fact]
    public void ObservedJob_TakesNextRunFromLastRunPlusPeriod()
    {
        var period = TimeSpan.FromMinutes(5);
        var (service, cache, time) = Create(new FakeRecurringJob(period, TimeSpan.FromMinutes(2)));
        time.Advance(TimeSpan.FromMinutes(3));
        cache.RecordCompleted(typeof(FakeRecurringJob), BackgroundJobOutcome.Succeeded);

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(Start.AddMinutes(3), job.LastRun);
        Assert.Equal(Start.AddMinutes(3) + period, job.NextRun);
    }

    /// <summary>
    /// A job with an infinite period has scheduling disabled entirely: it is reported as
    /// <see cref="BackgroundJobState.Manual"/> with no period and no next run, rather than a period
    /// and next run that would never actually arrive.
    /// </summary>
    [Fact]
    public void InfinitePeriod_IsManual_WithNoNextRun()
    {
        var (service, _, _) = Create(
            new FakeRecurringJob(Timeout.InfiniteTimeSpan, TimeSpan.FromMinutes(2)));

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(BackgroundJobState.Manual, job.State);
        Assert.Null(job.Period);
        Assert.Null(job.NextRun);
    }

    /// <summary>
    /// An infinite delay means there is no basis for a next run until the job has actually been
    /// observed once; after that first observed completion, the next run is derived from the last run
    /// plus the period exactly as normal, since the delay only ever governed the first tick.
    /// </summary>
    [Fact]
    public void InfiniteDelay_HasNoNextRun_UntilObserved()
    {
        var (service, cache, time) = Create(
            new FakeRecurringJob(TimeSpan.FromMinutes(5), Timeout.InfiniteTimeSpan));

        Assert.Null(Assert.Single(service.GetReport().Jobs).NextRun);

        time.Advance(TimeSpan.FromMinutes(1));
        cache.RecordCompleted(typeof(FakeRecurringJob), BackgroundJobOutcome.Succeeded);

        Assert.Equal(Start.AddMinutes(6), Assert.Single(service.GetReport().Jobs).NextRun);
    }

    /// <summary>
    /// A job that has been triggered while scheduling is disabled must still report as
    /// <see cref="BackgroundJobState.Running"/>, not <see cref="BackgroundJobState.Manual"/>: manual
    /// scheduling and an active run are independent facts, and reporting merely manual while it
    /// executes would hide that it is doing something right now.
    /// </summary>
    [Fact]
    public void RunningTakesPrecedenceOverManual()
    {
        var (service, cache, _) = Create(
            new FakeRecurringJob(Timeout.InfiniteTimeSpan, TimeSpan.FromMinutes(2)));
        cache.RecordExecuting(typeof(FakeRecurringJob));

        Assert.Equal(BackgroundJobState.Running, Assert.Single(service.GetReport().Jobs).State);
    }

    /// <summary>A job's configured server roles are surfaced on the report verbatim, as their string names.</summary>
    [Fact]
    public void ServerRoles_AreCarriedThrough()
    {
        var (service, _, _) = Create(new FakeRecurringJob(
            TimeSpan.FromMinutes(5),
            TimeSpan.FromMinutes(2),
            ServerRole.SchedulingPublisher,
            ServerRole.Subscriber));

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(["SchedulingPublisher", "Subscriber"], job.ServerRoles);
    }

    /// <summary>
    /// A job restricted to another server role is skipped on every tick, forever. Its next run must
    /// still advance, because <c>RecordIgnored</c> deliberately never sets a last run, and deriving
    /// the next run from that alone once pinned it to startup: on a Subscriber node the whole
    /// recurring section read "next run: three days ago".
    /// </summary>
    [Fact]
    public void SkippedJob_StillAdvancesItsNextRun()
    {
        var period = TimeSpan.FromMinutes(5);
        var (service, cache, time) = Create(new FakeRecurringJob(period, TimeSpan.FromMinutes(2)));

        // A job restricted to another server role is skipped on every tick, forever. Umbraco
        // publishes Executing before it checks the role, then Ignored, then re-arms the timer.
        time.Advance(TimeSpan.FromHours(72));
        cache.RecordExecuting(typeof(FakeRecurringJob));
        cache.RecordIgnored(typeof(FakeRecurringJob));

        var job = Assert.Single(service.GetReport().Jobs);

        Assert.Equal(BackgroundJobOutcome.Ignored, job.LastOutcome);
        Assert.Null(job.LastRun);
        // Must be one period after the skipped tick, not pinned to startup three days ago.
        Assert.Equal(Start.AddHours(72) + period, job.NextRun);
    }

    /// <summary>
    /// Once a run completes, the next run is derived from the completion time, not from when the run
    /// was attempted: core itself counts the period from completion, re-arming its timer in a
    /// <c>finally</c> block, so counting from the attempt instead would drift the reported schedule
    /// away from what core will actually do.
    /// </summary>
    [Fact]
    public void CompletedRun_TakesPrecedenceOverTheAttempt_ForNextRun()
    {
        var period = TimeSpan.FromMinutes(5);
        var (service, cache, time) = Create(new FakeRecurringJob(period, TimeSpan.FromMinutes(2)));
        cache.RecordExecuting(typeof(FakeRecurringJob));
        time.Advance(TimeSpan.FromSeconds(90));
        cache.RecordCompleted(typeof(FakeRecurringJob), BackgroundJobOutcome.Succeeded);

        var job = Assert.Single(service.GetReport().Jobs);

        // Core counts the period from completion, not from when the run started.
        Assert.Equal(Start.AddSeconds(90), job.LastRun);
        Assert.Equal(Start.AddSeconds(90) + period, job.NextRun);
    }

    /// <summary>The outcome reported for a recurring job is read straight through from the activity cache, unmodified.</summary>
    [Fact]
    public void Outcome_IsCarriedThroughFromTheCache()
    {
        var (service, cache, _) = Create(new FakeRecurringJob(TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(2)));
        cache.RecordIgnored(typeof(FakeRecurringJob));

        Assert.Equal(BackgroundJobOutcome.Ignored, Assert.Single(service.GetReport().Jobs).LastOutcome);
    }
}
