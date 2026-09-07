using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.BackgroundJobs;

/// <summary>
/// Exercises <see cref="RecurringJobActivityCache"/> directly, without going through the
/// notification handler: what each recorder does to the stored <see cref="RecurringJobActivity"/>,
/// and how successive writes for the same job type interact.
/// </summary>
public class RecurringJobActivityCacheTests
{
    /// <summary>Arbitrary fixed instant the fake clock starts at, so recorded timestamps are checkable.</summary>
    private static readonly DateTimeOffset Start = new(2026, 9, 6, 12, 0, 0, TimeSpan.Zero);

    /// <summary>Stand-in job type: the cache keys on <see cref="Type"/> alone, so no job behaviour is needed.</summary>
    private sealed class FakeJob;

    /// <summary>
    /// Builds a cache on a fake clock pinned to <see cref="Start"/>, and hands back the clock so a
    /// test can advance it and assert on the timestamps that fall out.
    /// </summary>
    /// <returns>The cache under test, and the clock driving it.</returns>
    private static (RecurringJobActivityCache Cache, FakeTimeProvider Time) Create()
    {
        var time = new FakeTimeProvider(Start);
        return (new RecurringJobActivityCache(time), time);
    }

    /// <summary>
    /// <see cref="RecurringJobActivityCache.MonitoringSince"/> is stamped once, in the constructor,
    /// and must not drift with later ticks: it is the "monitoring since" instant shown in the UI, and
    /// it would be a lie if it silently tracked the clock instead of the moment the cache was built.
    /// </summary>
    [Fact]
    public void MonitoringSince_IsFixedAtConstruction()
    {
        var (cache, time) = Create();

        time.Advance(TimeSpan.FromHours(3));

        Assert.Equal(Start, cache.MonitoringSince);
    }

    /// <summary>A job type nothing has been recorded for reports no activity, rather than a default one.</summary>
    [Fact]
    public void Get_ReturnsNull_WhenNothingObserved()
    {
        var (cache, _) = Create();

        Assert.Null(cache.Get(typeof(FakeJob)));
    }

    /// <summary>The first execution of a job creates an activity entry that is running and has no last run yet.</summary>
    [Fact]
    public void RecordExecuting_MarksRunning_WithNoLastRun()
    {
        var (cache, _) = Create();

        cache.RecordExecuting(typeof(FakeJob));

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.True(activity.IsRunning);
        Assert.Null(activity.LastRun);
        Assert.Equal(BackgroundJobOutcome.NotObserved, activity.LastOutcome);
    }

    /// <summary>
    /// A successful completion clears the running flag and stamps the completion time, not the start
    /// time, as the last run.
    /// </summary>
    [Fact]
    public void RecordCompleted_ClearsRunning_AndStampsLastRun()
    {
        var (cache, time) = Create();
        cache.RecordExecuting(typeof(FakeJob));
        time.Advance(TimeSpan.FromSeconds(30));

        cache.RecordCompleted(typeof(FakeJob), BackgroundJobOutcome.Succeeded);

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.False(activity.IsRunning);
        Assert.Equal(Start.AddSeconds(30), activity.LastRun);
        Assert.Equal(BackgroundJobOutcome.Succeeded, activity.LastOutcome);
    }

    /// <summary>
    /// A completion clears the running flag for a failure just as it does for success: only the
    /// outcome recorded differs, the running/last-run handling does not branch on it.
    /// </summary>
    /// <param name="outcome">The terminal outcome to record.</param>
    [Theory]
    [InlineData(BackgroundJobOutcome.Failed)]
    public void RecordCompleted_ClearsRunning_ForEveryTerminalOutcome(BackgroundJobOutcome outcome)
    {
        var (cache, _) = Create();
        cache.RecordExecuting(typeof(FakeJob));

        cache.RecordCompleted(typeof(FakeJob), outcome);

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.False(activity.IsRunning);
        Assert.Equal(outcome, activity.LastOutcome);
    }

    /// <summary>
    /// A skip records the <see cref="BackgroundJobOutcome.Ignored"/> outcome but must leave the last
    /// run untouched: being skipped is not a run, and overwriting the last run would erase the only
    /// evidence the job has ever executed on this server.
    /// </summary>
    [Fact]
    public void RecordIgnored_SetsOutcome_ButDoesNotAdvanceLastRun()
    {
        var (cache, time) = Create();
        cache.RecordExecuting(typeof(FakeJob));
        cache.RecordCompleted(typeof(FakeJob), BackgroundJobOutcome.Succeeded);
        var ranAt = cache.Get(typeof(FakeJob))!.LastRun;
        time.Advance(TimeSpan.FromMinutes(10));

        cache.RecordIgnored(typeof(FakeJob));

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.Equal(BackgroundJobOutcome.Ignored, activity.LastOutcome);
        Assert.Equal(ranAt, activity.LastRun);
        Assert.False(activity.IsRunning);
    }

    /// <summary>A second full execute/complete cycle replaces the first cycle's outcome and last run, not merges with it.</summary>
    [Fact]
    public void LaterNotifications_OverwriteEarlierOnes_ForTheSameType()
    {
        var (cache, time) = Create();
        cache.RecordExecuting(typeof(FakeJob));
        cache.RecordCompleted(typeof(FakeJob), BackgroundJobOutcome.Failed);
        time.Advance(TimeSpan.FromMinutes(1));

        cache.RecordExecuting(typeof(FakeJob));
        cache.RecordCompleted(typeof(FakeJob), BackgroundJobOutcome.Succeeded);

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.Equal(BackgroundJobOutcome.Succeeded, activity.LastOutcome);
        Assert.Equal(Start.AddMinutes(1), activity.LastRun);
    }

    /// <summary>
    /// Starting a new run must not blank the previous run's last-run time and outcome while the new
    /// run is in flight: the UI shows both together, and clearing them here would make every job look
    /// like it had never run the moment it starts running again.
    /// </summary>
    [Fact]
    public void RecordExecuting_PreservesThePreviousRun_WhenAJobRunsAgain()
    {
        var (cache, time) = Create();
        cache.RecordExecuting(typeof(FakeJob));
        cache.RecordCompleted(typeof(FakeJob), BackgroundJobOutcome.Succeeded);
        var firstRun = cache.Get(typeof(FakeJob))!.LastRun;
        time.Advance(TimeSpan.FromMinutes(5));

        cache.RecordExecuting(typeof(FakeJob));

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.True(activity.IsRunning);
        // The previous run must survive: the UI shows last run and outcome while the next run is
        // in flight, and blanking them would make every job look like it had never run.
        Assert.Equal(firstRun, activity.LastRun);
        Assert.Equal(BackgroundJobOutcome.Succeeded, activity.LastOutcome);
    }

    /// <summary>
    /// Every schedule tick stamps <see cref="RecurringJobActivity.LastAttempt"/>, whether it goes on
    /// to execute or is skipped, while a completion leaves the attempt time exactly where the run that
    /// completed left it. <see cref="RecurringJobActivity.LastAttempt"/> is the only basis for the
    /// next-run calculation on a job that is skipped every tick, so this distinguishes "the schedule
    /// fired" from "the run finished" precisely enough for that arithmetic to work.
    /// </summary>
    [Fact]
    public void EveryTickStampsTheAttempt_AndCompletionLeavesItAlone()
    {
        var (cache, time) = Create();

        cache.RecordExecuting(typeof(FakeJob));
        Assert.Equal(Start, cache.Get(typeof(FakeJob))!.LastAttempt);

        // The completion is not a new tick, so it must not move the attempt time.
        time.Advance(TimeSpan.FromSeconds(30));
        cache.RecordCompleted(typeof(FakeJob), BackgroundJobOutcome.Succeeded);
        Assert.Equal(Start, cache.Get(typeof(FakeJob))!.LastAttempt);

        // A skipped tick did fire, so it must.
        time.Advance(TimeSpan.FromMinutes(5));
        cache.RecordIgnored(typeof(FakeJob));
        Assert.Equal(Start.AddSeconds(330), cache.Get(typeof(FakeJob))!.LastAttempt);
        Assert.Equal(Start.AddSeconds(30), cache.Get(typeof(FakeJob))!.LastRun);
    }

    /// <summary>
    /// A job skipped before it has ever run still produces an activity entry: outcome
    /// <see cref="BackgroundJobOutcome.Ignored"/>, no last run, not running. Nothing here should
    /// require a prior execution to have happened first.
    /// </summary>
    [Fact]
    public void RecordIgnored_RecordsASkip_ForAJobThatHasNeverRun()
    {
        var (cache, _) = Create();

        cache.RecordIgnored(typeof(FakeJob));

        var activity = cache.Get(typeof(FakeJob));
        Assert.NotNull(activity);
        Assert.False(activity.IsRunning);
        Assert.Null(activity.LastRun);
        Assert.Equal(BackgroundJobOutcome.Ignored, activity.LastOutcome);
    }
}
