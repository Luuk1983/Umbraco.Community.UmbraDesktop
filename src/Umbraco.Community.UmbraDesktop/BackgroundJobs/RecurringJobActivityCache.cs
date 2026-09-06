using System.Collections.Concurrent;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

namespace Umbraco.Community.UmbraDesktop.BackgroundJobs;

/// <summary>
/// Holds what has been observed about recurring background jobs since this application instance
/// started.
/// </summary>
/// <remarks>
/// Umbraco persists nothing about recurring jobs and exposes no run state, so notifications are the
/// only source and this cache is the only place that state exists. It is deliberately not
/// persisted: a recurring job's schedule restarts from its delay on startup, so a last run carried
/// over from a previous process would describe a different timeline from the next run beside it.
/// <para>
/// This type must be constructed eagerly at application start, not lazily on the first resolution.
/// <see cref="MonitoringSince"/> is stamped in the constructor, so a lazily built instance would
/// report the moment someone first opened the dashboard rather than the moment observation began,
/// and the "monitoring since" footer built on it would be a lie. Guaranteeing eager construction is
/// the responsibility of the DI registration.
/// </para>
/// </remarks>
/// <param name="timeProvider">
/// Clock used to stamp schedule ticks, completed runs and the monitoring start.
/// </param>
public sealed class RecurringJobActivityCache(TimeProvider timeProvider)
{
    private readonly ConcurrentDictionary<Type, RecurringJobActivity> _activity = new();

    /// <summary>
    /// Gets the moment this cache began observing, which is effectively application start.
    /// </summary>
    public DateTimeOffset MonitoringSince { get; } = timeProvider.GetUtcNow();

    /// <summary>
    /// Records that a job has begun executing, stamping the moment its schedule fired.
    /// </summary>
    /// <param name="jobType">The CLR type of the recurring job.</param>
    public void RecordExecuting(Type jobType)
        => _activity.AddOrUpdate(
            jobType,
            _ => new RecurringJobActivity(
                true,
                timeProvider.GetUtcNow(),
                null,
                BackgroundJobOutcome.NotObserved),
            (_, existing) => existing with
            {
                IsRunning = true,
                LastAttempt = timeProvider.GetUtcNow(),
            });

    /// <summary>
    /// Records that a job stopped executing, stamping the completion time as its last run.
    /// </summary>
    /// <param name="jobType">The CLR type of the recurring job.</param>
    /// <param name="outcome">How the run ended.</param>
    /// <remarks>
    /// Uses the same compare-and-swap as the other writers rather than a blind store, for
    /// consistency with them and so the method stays correct if a field is ever added to
    /// <see cref="RecurringJobActivity"/> that this method does not set. It does <em>not</em>
    /// protect against a late-delivered completion overwriting a newer execution's
    /// <c>IsRunning</c>: the update ignores <c>existing.IsRunning</c> and clears it
    /// unconditionally. Closing that window would need a run token or sequence number, which is
    /// not worth it here.
    /// <para>
    /// Leaves <see cref="RecurringJobActivity.LastAttempt"/> untouched, which the <c>with</c>
    /// expression already does: the attempt was stamped when this run started.
    /// </para>
    /// </remarks>
    public void RecordCompleted(Type jobType, BackgroundJobOutcome outcome)
        => _activity.AddOrUpdate(
            jobType,
            _ => new RecurringJobActivity(false, null, timeProvider.GetUtcNow(), outcome),
            (_, existing) => existing with
            {
                IsRunning = false,
                LastRun = timeProvider.GetUtcNow(),
                LastOutcome = outcome,
            });

    /// <summary>
    /// Records that a scheduled run was skipped without executing.
    /// </summary>
    /// <remarks>
    /// Deliberately leaves the last run untouched. Being skipped is not a run, and overwriting it
    /// would erase the only evidence that the job has ever done anything on this server. The
    /// attempt time <em>is</em> stamped: the schedule fired, and that tick is what the next
    /// expected run must be counted from for a job that is skipped on every tick.
    /// <para>
    /// Stamping the attempt here as well as in <see cref="RecordExecuting"/> is deliberate. Today
    /// Umbraco always publishes executing before ignored, so this is a second write of very nearly
    /// the same instant, but nothing in the contract guarantees that ordering and a skipped tick
    /// must advance the attempt time even if the order ever changes.
    /// </para>
    /// </remarks>
    /// <param name="jobType">The CLR type of the recurring job.</param>
    public void RecordIgnored(Type jobType)
        => _activity.AddOrUpdate(
            jobType,
            _ => new RecurringJobActivity(
                false,
                timeProvider.GetUtcNow(),
                null,
                BackgroundJobOutcome.Ignored),
            (_, existing) => existing with
            {
                IsRunning = false,
                LastAttempt = timeProvider.GetUtcNow(),
                LastOutcome = BackgroundJobOutcome.Ignored,
            });

    /// <summary>
    /// Gets what has been observed for a job type.
    /// </summary>
    /// <param name="jobType">The CLR type of the recurring job.</param>
    /// <returns>The observed activity, or <see langword="null"/> if nothing has been seen.</returns>
    public RecurringJobActivity? Get(Type jobType)
        => _activity.TryGetValue(jobType, out var activity) ? activity : null;
}
