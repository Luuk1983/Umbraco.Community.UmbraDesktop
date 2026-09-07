using Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

namespace Umbraco.Community.UmbraDesktop.BackgroundJobs;

/// <summary>
/// Builds a snapshot of every background job Umbraco has registered.
/// </summary>
public interface IBackgroundJobReportService
{
    /// <summary>
    /// Builds the report from the distributed job table and the observed recurring job activity.
    /// </summary>
    /// <returns>Every registered job, ordered by kind then name.</returns>
    BackgroundJobReport GetReport();
}
