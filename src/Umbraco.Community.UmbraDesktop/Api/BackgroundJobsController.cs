using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.BackgroundJobs;

namespace Umbraco.Community.UmbraDesktop.Api;

/// <summary>
/// Exposes the background job report to the backoffice.
/// </summary>
/// <remarks>
/// The route segment must stay <c>umbradesktop</c> without a hyphen:
/// <c>backoffice/scripts/generate-openapi.js</c> filters the spec on the path prefix
/// <c>/umbraco/management/api/v1/umbradesktop</c>, and a mismatch silently produces an empty client.
/// </remarks>
/// <param name="reportService">Builds the report.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/background-jobs")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.SectionAccessSettings)]
public class BackgroundJobsController(IBackgroundJobReportService reportService)
    : ManagementApiControllerBase
{
    /// <summary>
    /// Gets every background job Umbraco has registered on this server.
    /// </summary>
    /// <returns>The report.</returns>
    [HttpGet]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(BackgroundJobReportResponseModel), StatusCodes.Status200OK)]
    public IActionResult GetBackgroundJobs()
    {
        var report = reportService.GetReport();

        return Ok(new BackgroundJobReportResponseModel(
            report.MonitoringSince,
            report.Jobs.Select(job => new BackgroundJobResponseModel(
                job.Name,
                job.TypeName,
                job.Kind.ToString(),
                job.State.ToString(),
                job.LastOutcome.ToString(),
                job.Period?.TotalSeconds,
                job.LastRun,
                job.NextRun,
                job.ServerRoles)).ToArray()));
    }
}
