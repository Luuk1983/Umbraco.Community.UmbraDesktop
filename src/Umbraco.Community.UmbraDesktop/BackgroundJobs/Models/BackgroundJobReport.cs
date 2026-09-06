namespace Umbraco.Community.UmbraDesktop.BackgroundJobs.Models;

/// <summary>
/// Every background job Umbraco has registered, plus the point from which recurring activity is
/// known.
/// </summary>
/// <param name="MonitoringSince">
/// When this application instance began observing recurring jobs. Without it, an empty last-run
/// column is ambiguous between "never ran" and "not seen yet".
/// </param>
/// <param name="Jobs">The jobs, ordered by kind then name.</param>
public record BackgroundJobReport(
    DateTimeOffset MonitoringSince,
    IReadOnlyList<BackgroundJobStatus> Jobs);
