namespace Umbraco.Community.UmbraDesktop.Api.ViewModels;

/// <summary>
/// The full background job report, as returned by the management API.
/// </summary>
/// <param name="MonitoringSince">
/// When this server began observing recurring jobs. The UI needs it to explain why a recurring
/// job's last run may be empty.
/// </param>
/// <param name="Jobs">The jobs, ordered by kind then name.</param>
public record BackgroundJobReportResponseModel(
    DateTimeOffset MonitoringSince,
    IReadOnlyList<BackgroundJobResponseModel> Jobs);
