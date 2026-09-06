using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Notifications;

/// <summary>
/// Forces <see cref="RecurringJobActivityCache"/> to be constructed at application start.
/// </summary>
/// <remarks>
/// This class does nothing at runtime and that is the point. <see cref="RecurringJobActivityCache"/>
/// is documented as requiring eager construction: it stamps <c>MonitoringSince</c> in its
/// constructor, and if the DI container built it lazily on first resolution, that timestamp would
/// record the moment someone first opened the dashboard rather than the moment observation began.
/// <para>
/// Notification handlers are resolved from DI to be invoked, so simply depending on the cache in
/// this handler's constructor is enough to force it into existence. Handling
/// <see cref="UmbracoApplicationStartingNotification"/> — the earliest available notification —
/// guarantees that happens during boot, before anything (including the background job notification
/// handlers, and any request that could open the dashboard) has a chance to resolve it first.
/// </para>
/// <para>
/// Do not delete this class because <see cref="Handle"/> looks like dead code: removing it would
/// silently reintroduce the lazy-construction bug described above.
/// </para>
/// </remarks>
/// <param name="cache">
/// The cache to force into existence. Unused beyond being requested from DI.
/// </param>
public sealed class RecurringJobActivityCacheStartupHandler(RecurringJobActivityCache cache)
    : INotificationHandler<UmbracoApplicationStartingNotification>
{
    /// <summary>
    /// Does nothing. The cache was already constructed by the time this method is reached, which is
    /// the entire purpose of this class.
    /// </summary>
    /// <param name="notification">The notification. Unused.</param>
    public void Handle(UmbracoApplicationStartingNotification notification)
    {
        // Intentionally empty. See the remarks on this class. The discard below only silences
        // CS9113 (unread primary constructor parameter) — the cache's value was already forced
        // into existence the moment this handler was constructed, which is all that matters.
        _ = cache;
    }
}
