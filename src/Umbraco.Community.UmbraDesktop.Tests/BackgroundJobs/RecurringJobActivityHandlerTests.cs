using Microsoft.Extensions.Time.Testing;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Sync;
using Umbraco.Cms.Infrastructure.BackgroundJobs;
using Umbraco.Cms.Infrastructure.Notifications;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Notifications;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.BackgroundJobs;

/// <summary>
/// Exercises <see cref="RecurringJobActivityHandler"/>: that each of Umbraco's four recurring-job
/// notifications is translated into the correct <see cref="RecurringJobActivityCache"/> call. The
/// cache's own behaviour once called is covered by <see cref="RecurringJobActivityCacheTests"/>; this
/// class only checks the wiring between notification and recorder.
/// </summary>
public class RecurringJobActivityHandlerTests
{
    /// <summary>
    /// Stand-in for a recurring job, matching the real Umbraco 17.0.0 <see cref="IRecurringBackgroundJob"/>
    /// surface. Deliberately has no <c>IgnoredDelay</c> member: that was added in a later Umbraco
    /// version, and this package's floor is 17.0.0.
    /// </summary>
    private sealed class FakeRecurringJob : IRecurringBackgroundJob
    {
        /// <inheritdoc />
        public TimeSpan Period => TimeSpan.FromMinutes(5);

        /// <inheritdoc />
        public TimeSpan Delay => TimeSpan.FromMinutes(1);

        /// <inheritdoc />
        public ServerRole[] ServerRoles => [ServerRole.Single];

        /// <inheritdoc />
        public event EventHandler? PeriodChanged { add { } remove { } }

        /// <inheritdoc />
        public Task RunJobAsync() => Task.CompletedTask;
    }

    /// <summary>
    /// Builds a handler wired to a fresh cache, and a fake job to raise notifications about.
    /// </summary>
    /// <returns>The handler under test, the cache it writes to, and the job the notifications carry.</returns>
    private static (RecurringJobActivityHandler Handler, RecurringJobActivityCache Cache, FakeRecurringJob Job) Create()
    {
        var cache = new RecurringJobActivityCache(new FakeTimeProvider());
        return (new RecurringJobActivityHandler(cache), cache, new FakeRecurringJob());
    }

    /// <summary>An executing notification records the job as running.</summary>
    [Fact]
    public void Executing_MarksTheJobRunning()
    {
        var (handler, cache, job) = Create();

        handler.Handle(new RecurringBackgroundJobExecutingNotification(job, new EventMessages()));

        Assert.True(cache.Get(typeof(FakeRecurringJob))!.IsRunning);
    }

    /// <summary>An executed notification, following an executing one, clears running and records success.</summary>
    [Fact]
    public void Executed_RecordsSuccess()
    {
        var (handler, cache, job) = Create();
        handler.Handle(new RecurringBackgroundJobExecutingNotification(job, new EventMessages()));

        handler.Handle(new RecurringBackgroundJobExecutedNotification(job, new EventMessages()));

        var activity = cache.Get(typeof(FakeRecurringJob))!;
        Assert.False(activity.IsRunning);
        Assert.Equal(BackgroundJobOutcome.Succeeded, activity.LastOutcome);
    }

    /// <summary>A failed notification records the failure outcome, even without a preceding executing notification.</summary>
    [Fact]
    public void Failed_RecordsFailure()
    {
        var (handler, cache, job) = Create();

        handler.Handle(new RecurringBackgroundJobFailedNotification(job, new EventMessages()));

        Assert.Equal(BackgroundJobOutcome.Failed, cache.Get(typeof(FakeRecurringJob))!.LastOutcome);
    }

    /// <summary>
    /// An ignored notification records the skip and, critically, must not set a last run: this is
    /// the handler-level counterpart to <see cref="RecurringJobActivityCacheTests.RecordIgnored_SetsOutcome_ButDoesNotAdvanceLastRun"/>,
    /// confirming the handler does not accidentally route ignored notifications through the completion path.
    /// </summary>
    [Fact]
    public void Ignored_RecordsSkip_WithoutALastRun()
    {
        var (handler, cache, job) = Create();

        handler.Handle(new RecurringBackgroundJobIgnoredNotification(job, new EventMessages()));

        var activity = cache.Get(typeof(FakeRecurringJob))!;
        Assert.Equal(BackgroundJobOutcome.Ignored, activity.LastOutcome);
        Assert.Null(activity.LastRun);
    }
}
