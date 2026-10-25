using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Infrastructure.Notifications;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Notifications;

namespace Umbraco.Community.UmbraDesktop.Composing;

/// <summary>
/// Wires up the background jobs feature: the activity cache, the report service and the recurring
/// job notification handlers. The OpenAPI naming this composer used to register is per Umbraco
/// major, so it moved to <c>Compat/Umbraco17</c> and <c>Compat/Umbraco18</c>.
/// </summary>
public sealed class BackgroundJobsComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        // Singleton: this cache is the only record of recurring job activity this application
        // instance has ever observed (Umbraco itself persists nothing about recurring jobs). Any
        // shorter lifetime would silently discard everything on the next resolution.
        builder.Services.AddSingleton<RecurringJobActivityCache>();
        builder.Services.AddSingleton<IBackgroundJobReportService, BackgroundJobReportService>();

        // Forces RecurringJobActivityCache to be constructed during boot rather than lazily on
        // first resolution — see the remarks on RecurringJobActivityCacheStartupHandler for why
        // that matters.
        builder.AddNotificationHandler<UmbracoApplicationStartingNotification, RecurringJobActivityCacheStartupHandler>();

        // Exactly four notifications, not five: executing/executed/failed/ignored. The cancellation
        // notification fires only for a run cut short by shutdown, after this cache has stopped
        // mattering.
        builder.AddNotificationHandler<RecurringBackgroundJobExecutingNotification, RecurringJobActivityHandler>();
        builder.AddNotificationHandler<RecurringBackgroundJobExecutedNotification, RecurringJobActivityHandler>();
        builder.AddNotificationHandler<RecurringBackgroundJobFailedNotification, RecurringJobActivityHandler>();
        builder.AddNotificationHandler<RecurringBackgroundJobIgnoredNotification, RecurringJobActivityHandler>();
    }
}
