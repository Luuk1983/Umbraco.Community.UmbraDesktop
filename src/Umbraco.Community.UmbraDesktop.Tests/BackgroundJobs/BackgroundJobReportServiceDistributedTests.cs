using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Configuration.Models;
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
/// Exercises the distributed-job half of <see cref="BackgroundJobReportService"/>: state derived
/// from the <c>umbracoDistributedJob</c> table, staleness against Umbraco's own reclaim window,
/// timestamp handling, and the row filtering that keeps orphaned jobs off the report. The
/// recurring-job half is covered separately in <see cref="BackgroundJobReportServiceRecurringTests"/>.
/// </summary>
public class BackgroundJobReportServiceDistributedTests
{
    /// <summary>Arbitrary fixed "now" the fake clock is pinned to, so state and next-run math is checkable.</summary>
    private static readonly DateTimeOffset Now = new(2026, 9, 6, 12, 0, 0, TimeSpan.Zero);

    /// <summary>Stand-in registered distributed job: only the name, period and alignment the service reads matter.</summary>
    /// <param name="name">The job's name, matched against rows by <see cref="BackgroundJobReportService"/>.</param>
    /// <param name="period">The job's scheduled period.</param>
    /// <param name="alignToClock">Whether its runs fall on clock boundaries rather than drifting from completion.</param>
    private sealed class FakeDistributedJob(string name, TimeSpan period, bool alignToClock = false) : IDistributedBackgroundJob
    {
        /// <inheritdoc />
        public string Name => name;

        /// <inheritdoc />
        public TimeSpan Period => period;

        /// <inheritdoc />
        public bool AlignToClock => alignToClock;

        /// <inheritdoc />
        public Task ExecuteAsync() => Task.CompletedTask;
    }

    /// <summary>
    /// Stand-in registered recurring job, used only by <see cref="BothKindsAreMerged_WithDistributedFirst"/>
    /// to prove the two kinds are merged into one report.
    /// </summary>
    private sealed class FakeRecurringJob : IRecurringBackgroundJob
    {
        /// <inheritdoc />
        public TimeSpan Period => TimeSpan.FromMinutes(5);

        /// <inheritdoc />
        public TimeSpan Delay => TimeSpan.FromMinutes(2);

        /// <inheritdoc />
        public ServerRole[] ServerRoles => [ServerRole.Single];

        /// <inheritdoc />
        public event EventHandler? PeriodChanged { add { } remove { } }

        /// <inheritdoc />
        /// <remarks>Obsolete in Umbraco 18 and gone in 19; the bare interface still requires it.</remarks>
        public Task RunJobAsync() => Task.CompletedTask;

        /// <inheritdoc />
        public Task RunJobAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    /// <summary>The service under test, together with the collaborators a test needs to assert against.</summary>
    /// <param name="Service">The service under test.</param>
    /// <param name="Scope">The scope substitute the service must complete after reading the repository.</param>
    /// <param name="Cache">The recurring-job activity cache backing the service, for its <c>MonitoringSince</c>.</param>
    private sealed record Harness(
        BackgroundJobReportService Service,
        ICoreScope Scope,
        RecurringJobActivityCache Cache);

    /// <summary>
    /// Wires a <see cref="BackgroundJobReportService"/> against fakes and substitutes: a repository
    /// returning the given rows, a scope provider handing back a substitute scope so completion can be
    /// asserted, an optional execution timeout, and an optional set of recurring jobs for the merge
    /// test. The clock backing the service and the cache is the same <see cref="Now"/> instant.
    /// </summary>
    /// <param name="registered">The distributed jobs considered registered.</param>
    /// <param name="rows">The rows the repository should return.</param>
    /// <param name="maximumExecutionTime">
    /// The configured distributed job execution timeout, or <see langword="null"/> for Umbraco's default.
    /// </param>
    /// <param name="recurring">Registered recurring jobs, or <see langword="null"/> for none.</param>
    /// <returns>The wired-up harness.</returns>
    private static Harness Create(
        IEnumerable<IDistributedBackgroundJob> registered,
        IEnumerable<DistributedBackgroundJobModel> rows,
        TimeSpan? maximumExecutionTime = null,
        IEnumerable<IRecurringBackgroundJob>? recurring = null)
    {
        var repository = Substitute.For<IDistributedJobRepository>();
        repository.GetAll().Returns(rows);

        var scope = Substitute.For<ICoreScope>();
        var scopeProvider = Substitute.For<ICoreScopeProvider>();
        scopeProvider.CreateCoreScope().Returns(scope);

        var settings = new DistributedJobSettings();
        if (maximumExecutionTime is { } configured)
        {
            settings.MaximumExecutionTime = configured;
        }

        var settingsMonitor = Substitute.For<IOptionsMonitor<DistributedJobSettings>>();
        settingsMonitor.CurrentValue.Returns(settings);

        var cache = new RecurringJobActivityCache(new FakeTimeProvider(Now));

        var service = new BackgroundJobReportService(
            registered,
            repository,
            scopeProvider,
            recurring ?? [],
            cache,
            settingsMonitor,
            new FakeTimeProvider(Now));

        return new Harness(service, scope, cache);
    }

    /// <summary>
    /// Builds a distributed job row. Feeds <paramref name="lastRun"/> and <paramref name="lastAttemptedRun"/>
    /// with <see cref="DateTimeKind.Unspecified"/>, which is what the database provider actually
    /// returns for these columns. Passing already-UTC values would let a simplification of
    /// <c>BackgroundJobReportService.AsUtc</c> pass while shifting every distributed timestamp by the
    /// server's UTC offset in production.
    /// </summary>
    /// <param name="name">The row's job name.</param>
    /// <param name="period">The row's scheduled period.</param>
    /// <param name="lastRun">The last completed run, as the database would return it.</param>
    /// <param name="lastAttemptedRun">When the run was last claimed, as the database would return it.</param>
    /// <param name="isRunning">Whether the row is currently marked as running.</param>
    /// <returns>The constructed row.</returns>
    private static DistributedBackgroundJobModel Row(
        string name,
        TimeSpan period,
        DateTime lastRun,
        DateTime lastAttemptedRun,
        bool isRunning) =>
        new()
        {
            Id = 1,
            Name = name,
            Period = period,
            LastRun = DateTime.SpecifyKind(lastRun, DateTimeKind.Unspecified),
            LastAttemptedRun = DateTime.SpecifyKind(lastAttemptedRun, DateTimeKind.Unspecified),
            IsRunning = isRunning,
        };

    /// <summary>An idle job's next run is simply its last run plus its period.</summary>
    [Fact]
    public void NextRun_IsLastRunPlusPeriod()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-3);
        var harness = Create(
            [new FakeDistributedJob("WebhookFiring", period)],
            [Row("WebhookFiring", period, lastRun, lastRun, isRunning: false)]);

        var job = Assert.Single(harness.Service.GetReport().Jobs);

        Assert.Equal(BackgroundJobKind.Distributed, job.Kind);
        Assert.Equal(BackgroundJobState.Idle, job.State);
        Assert.Equal(new DateTimeOffset(lastRun, TimeSpan.Zero) + period, job.NextRun);
    }

    /// <summary>
    /// A job aligned to the clock runs on the first multiple of its period, counted in UTC, that falls
    /// after its last run, which is what core's <c>DistributedJobService.IsDue</c> waits for: a ten-minute
    /// job that last ran at 11:56:40 runs at 12:00:00, not at 12:06:40.
    /// </summary>
    [Fact]
    public void NextRun_IsTheNextClockBoundary_ForAJobAlignedToTheClock()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddSeconds(-200);
        var harness = Create(
            [new FakeDistributedJob("Aligned", period, alignToClock: true)],
            [Row("Aligned", period, lastRun, lastRun, isRunning: false)]);

        var job = Assert.Single(harness.Service.GetReport().Jobs);

        Assert.Equal(Now, job.NextRun);
    }

    /// <summary>
    /// A run that ended exactly on a boundary waits for the next one: core asks for a boundary strictly
    /// after the last run, so the one it ended on does not count again.
    /// </summary>
    [Fact]
    public void NextRun_IsTheFollowingBoundary_WhenTheLastRunEndedOnOne()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-10);
        var harness = Create(
            [new FakeDistributedJob("Aligned", period, alignToClock: true)],
            [Row("Aligned", period, lastRun, lastRun, isRunning: false)]);

        var job = Assert.Single(harness.Service.GetReport().Jobs);

        Assert.Equal(Now, job.NextRun);
    }

    /// <summary>
    /// A row marked running is still reported as running while inside core's reclaim window
    /// (<c>Period + MaximumExecutionTime</c> since it was last attempted): core has not yet decided
    /// the job is stuck, so neither should this report.
    /// </summary>
    [Fact]
    public void State_IsRunning_WhenInsideTheReclaimWindow()
    {
        var period = TimeSpan.FromMinutes(10);
        var attempted = Now.UtcDateTime.AddMinutes(-14);
        var harness = Create(
            [new FakeDistributedJob("SlowJob", period)],
            [Row("SlowJob", period, Now.UtcDateTime.AddHours(-1), attempted, isRunning: true)]);

        var job = Assert.Single(harness.Service.GetReport().Jobs);

        Assert.Equal(BackgroundJobState.Running, job.State);
    }

    /// <summary>
    /// Past the reclaim window (<c>Period + MaximumExecutionTime</c>, here 15 minutes), a row still
    /// marked running reads as stale: that is the same window core's own
    /// <c>DistributedJobService.TryTakeRunnableAsync</c> uses to decide a row may be reclaimed, so
    /// reporting stale any earlier would contradict Umbraco's own view of the job.
    /// </summary>
    [Fact]
    public void State_IsStale_OnlyOncePastPeriodPlusMaximumExecutionTime()
    {
        var period = TimeSpan.FromMinutes(10);
        var attempted = Now.UtcDateTime.AddMinutes(-16);
        var harness = Create(
            [new FakeDistributedJob("SlowJob", period)],
            [Row("SlowJob", period, Now.UtcDateTime.AddHours(-1), attempted, isRunning: true)]);

        var job = Assert.Single(harness.Service.GetReport().Jobs);

        Assert.Equal(BackgroundJobState.Stale, job.State);
    }

    /// <summary>
    /// A configured <c>DistributedJobSettings.MaximumExecutionTime</c> widens the reclaim window
    /// used for staleness, in place of the five-minute default: the same 16-minutes-late row that
    /// reads stale under the default window in <see cref="State_IsStale_OnlyOncePastPeriodPlusMaximumExecutionTime"/>
    /// must read as merely running once a one-hour timeout is configured.
    /// </summary>
    [Fact]
    public void MaximumExecutionTime_IsReadFromSettings_WhenConfigured()
    {
        var period = TimeSpan.FromMinutes(10);
        var attempted = Now.UtcDateTime.AddMinutes(-16);
        var harness = Create(
            [new FakeDistributedJob("SlowJob", period)],
            [Row("SlowJob", period, Now.UtcDateTime.AddHours(-1), attempted, isRunning: true)],
            TimeSpan.FromHours(1));

        var job = Assert.Single(harness.Service.GetReport().Jobs);

        Assert.Equal(BackgroundJobState.Running, job.State);
    }

    /// <summary>
    /// A distributed job's outcome is always reported as unavailable, never succeeded or failed:
    /// Umbraco calls <c>FinishAsync</c> from a <c>finally</c> block and writes an identical row
    /// whether the job succeeded or threw, so the table simply carries no outcome to read.
    /// </summary>
    [Fact]
    public void LastOutcome_IsAlwaysUnavailable()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-1);
        var harness = Create(
            [new FakeDistributedJob("WebhookFiring", period)],
            [Row("WebhookFiring", period, lastRun, lastRun, isRunning: false)]);

        var job = Assert.Single(harness.Service.GetReport().Jobs);

        Assert.Equal(BackgroundJobOutcome.Unavailable, job.LastOutcome);
    }

    /// <summary>
    /// A row whose job is no longer registered (its package was uninstalled) is dropped from the
    /// report rather than shown. Umbraco leaves such rows permanently marked running, because
    /// <c>TryTakeRunnableAsync</c> sets <c>IsRunning</c> before it discovers the job is missing and
    /// then returns null, so <c>FinishAsync</c> never runs to clear it; listing it would show a
    /// phantom job stuck as running forever.
    /// </summary>
    [Fact]
    public void OrphanedRows_AreNotListed()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-1);
        var harness = Create(
            [new FakeDistributedJob("StillHere", period)],
            [
                Row("StillHere", period, lastRun, lastRun, isRunning: false),
                Row("UninstalledPackageJob", period, lastRun, lastRun, isRunning: true),
            ]);

        var job = Assert.Single(harness.Service.GetReport().Jobs);

        Assert.Equal("StillHere", job.Name);
    }

    /// <summary>
    /// Exactly at the boundary (<c>Period + MaximumExecutionTime</c> since the job was attempted, to
    /// the second) the row must still read as running, not stale: core's own comparison is strict
    /// (<c>&gt;</c>, not <c>&gt;=</c>), so this is the last instant at which core itself has not yet
    /// decided the job is reclaimable.
    /// </summary>
    [Fact]
    public void State_IsRunning_AtExactlyPeriodPlusMaximumExecutionTime()
    {
        var period = TimeSpan.FromMinutes(10);
        // Exactly on the boundary: period plus the default five minute execution timeout. Core's
        // comparison is strict, so the job is not yet reclaimable and must not read as stale.
        var attempted = Now.UtcDateTime.AddMinutes(-15);
        var harness = Create(
            [new FakeDistributedJob("SlowJob", period)],
            [Row("SlowJob", period, Now.UtcDateTime.AddHours(-1), attempted, isRunning: true)]);

        var job = Assert.Single(harness.Service.GetReport().Jobs);

        Assert.Equal(BackgroundJobState.Running, job.State);
    }

    /// <summary>
    /// The scope opened to read the repository is completed even though the report is read-only:
    /// leaving a scope uncompleted rolls back the ambient caller's transaction, which a read must not
    /// do as a side effect.
    /// </summary>
    [Fact]
    public void TheScopeIsCompleted()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-1);
        var harness = Create(
            [new FakeDistributedJob("WebhookFiring", period)],
            [Row("WebhookFiring", period, lastRun, lastRun, isRunning: false)]);

        harness.Service.GetReport();

        // A read-only scope still has to be completed: leaving it uncompleted rolls back the
        // ambient caller's transaction.
        harness.Scope.Received(1).Complete();
    }

    /// <summary>
    /// Distributed and recurring jobs are merged into one ordered report, distributed jobs first:
    /// this pins both the merge itself and the ordering, so a regression that dropped one kind or
    /// reordered them would be caught here rather than only in each half's own test class.
    /// </summary>
    [Fact]
    public void BothKindsAreMerged_WithDistributedFirst()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-1);
        var harness = Create(
            [new FakeDistributedJob("WebhookFiring", period)],
            [Row("WebhookFiring", period, lastRun, lastRun, isRunning: false)],
            recurring: [new FakeRecurringJob()]);

        var report = harness.Service.GetReport();

        Assert.Equal(harness.Cache.MonitoringSince, report.MonitoringSince);
        Assert.Equal(2, report.Jobs.Count);
        Assert.Equal("WebhookFiring", report.Jobs[0].Name);
        Assert.Equal(BackgroundJobKind.Distributed, report.Jobs[0].Kind);
        Assert.Equal(nameof(FakeRecurringJob), report.Jobs[1].Name);
        Assert.Equal(BackgroundJobKind.Recurring, report.Jobs[1].Kind);
    }

    /// <summary>
    /// A distributed job has no concept of server roles, unlike a recurring one, so its reported
    /// server roles are always empty rather than defaulted to something misleading.
    /// </summary>
    [Fact]
    public void ServerRoles_AreEmptyForDistributedJobs()
    {
        var period = TimeSpan.FromMinutes(10);
        var lastRun = Now.UtcDateTime.AddMinutes(-1);
        var harness = Create(
            [new FakeDistributedJob("WebhookFiring", period)],
            [Row("WebhookFiring", period, lastRun, lastRun, isRunning: false)]);

        var job = Assert.Single(harness.Service.GetReport().Jobs);

        Assert.Empty(job.ServerRoles);
    }
}
