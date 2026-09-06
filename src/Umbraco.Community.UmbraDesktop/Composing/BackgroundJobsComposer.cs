using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Infrastructure.Notifications;
using Umbraco.Community.UmbraDesktop.Api.Handlers;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;
using Umbraco.Community.UmbraDesktop.BackgroundJobs.Notifications;

namespace Umbraco.Community.UmbraDesktop.Composing;

/// <summary>
/// Wires up the background jobs feature: the activity cache, the report service, the recurring
/// job notification handlers, and the OpenAPI naming handlers the management API endpoint needs.
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

        // Exactly four notifications, not five: Umbraco 17.0.0 raises executing/executed/failed/
        // ignored for a recurring job, but no per-run cancellation notification exists to handle,
        // and one would be unreadable anyway since it would fire during shutdown, after this
        // cache has stopped mattering.
        builder.AddNotificationHandler<RecurringBackgroundJobExecutingNotification, RecurringJobActivityHandler>();
        builder.AddNotificationHandler<RecurringBackgroundJobExecutedNotification, RecurringJobActivityHandler>();
        builder.AddNotificationHandler<RecurringBackgroundJobFailedNotification, RecurringJobActivityHandler>();
        builder.AddNotificationHandler<RecurringBackgroundJobIgnoredNotification, RecurringJobActivityHandler>();

        // Keeps the generated TypeScript client's operation and schema names short — without
        // these the client would carry the full controller and namespace on every method and type.
        builder.Services.AddSingleton<IOperationIdHandler, PackageOperationIdHandler>();
        builder.Services.AddSingleton<ISchemaIdHandler, PackageSchemaIdHandler>();
    }
}
