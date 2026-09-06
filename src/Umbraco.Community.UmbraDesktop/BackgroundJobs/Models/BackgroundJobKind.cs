namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// Which scheduling mechanism a background job is registered with.
/// </summary>
public enum BackgroundJobKind
{
    /// <summary>
    /// Claimed by a single server across a load-balanced setup. State is stored in the
    /// <c>umbracoDistributedJob</c> table and therefore survives a restart.
    /// </summary>
    Distributed,

    /// <summary>
    /// Runs on each server independently, gated by MainDom and server role. Umbraco stores nothing
    /// about these, so their state is only what this application instance has observed.
    /// </summary>
    Recurring,
}
