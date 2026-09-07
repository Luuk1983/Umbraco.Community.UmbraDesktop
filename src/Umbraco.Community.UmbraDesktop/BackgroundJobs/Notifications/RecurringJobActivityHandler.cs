using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Infrastructure.Notifications;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Notifications;

/// <summary>
/// Translates Umbraco's recurring background job notifications into <see cref="RecurringJobActivityCache"/>
/// entries.
/// </summary>
/// <remarks>
/// These notifications are the only observable surface for recurring jobs;
/// <c>RecurringBackgroundJobHostedServiceRunner</c> exposes nothing about the jobs it is running.
/// Cancellation is deliberately not handled: Umbraco 17.0.0 raises no per-run cancellation
/// notification, and one would be unreadable anyway, since it fires during shutdown and this cache
/// does not outlive the process.
/// </remarks>
/// <param name="cache">The cache to record into.</param>
public sealed class RecurringJobActivityHandler(RecurringJobActivityCache cache) :
    INotificationHandler<RecurringBackgroundJobExecutingNotification>,
    INotificationHandler<RecurringBackgroundJobExecutedNotification>,
    INotificationHandler<RecurringBackgroundJobFailedNotification>,
    INotificationHandler<RecurringBackgroundJobIgnoredNotification>
{
    /// <summary>Records that the job has begun executing.</summary>
    /// <param name="notification">The notification.</param>
    public void Handle(RecurringBackgroundJobExecutingNotification notification)
        => cache.RecordExecuting(notification.Job.GetType());

    /// <summary>Records that the job completed successfully.</summary>
    /// <param name="notification">The notification.</param>
    public void Handle(RecurringBackgroundJobExecutedNotification notification)
        => cache.RecordCompleted(notification.Job.GetType(), BackgroundJobOutcome.Succeeded);

    /// <summary>Records that the job threw.</summary>
    /// <param name="notification">The notification.</param>
    public void Handle(RecurringBackgroundJobFailedNotification notification)
        => cache.RecordCompleted(notification.Job.GetType(), BackgroundJobOutcome.Failed);

    /// <summary>Records that the job's scheduled run was skipped.</summary>
    /// <param name="notification">The notification.</param>
    public void Handle(RecurringBackgroundJobIgnoredNotification notification)
        => cache.RecordIgnored(notification.Job.GetType());
}
