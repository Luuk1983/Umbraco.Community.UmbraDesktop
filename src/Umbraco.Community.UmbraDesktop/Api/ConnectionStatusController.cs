using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.Connections;

namespace Umbraco.Community.UmbraDesktop.Api;

/// <summary>
/// Reports on the instances this desktop is connected to.
/// </summary>
/// <remarks>
/// <para>
/// No extra authorization beyond the backoffice access <see cref="ManagementApiControllerBase"/>
/// already requires. Reading which version a connected instance runs is not privileged the way
/// holding its credentials is, and the Status app is meant for anyone who can open the desktop.
/// </para>
/// <para>
/// The route segment must stay <c>umbradesktop</c> without a hyphen, for the reason given on
/// <see cref="ConnectionsController"/>.
/// </para>
/// </remarks>
/// <param name="statusService">Asks each connected instance about itself.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/connection-status")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
public class ConnectionStatusController(DesktopConnectionStatusService statusService) : ManagementApiControllerBase
{
    /// <summary>
    /// Lists the rows, without contacting any connected instance.
    /// </summary>
    /// <remarks>
    /// Answers immediately. The local instance is complete and every connection comes back as
    /// <c>Checking</c>, for the client to fill in one at a time. That is what lets the screen appear
    /// at once rather than waiting on the slowest of somebody else's servers.
    /// </remarks>
    /// <returns>One row per connection, plus the local instance.</returns>
    [HttpGet]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(DesktopConnectionStatusResponseModel[]), StatusCodes.Status200OK)]
    public IActionResult GetConnectionStatuses() =>
        Ok(statusService.List().Select(ToResponseModel).ToArray());

    /// <summary>
    /// Reports on one connection, which is what the Connections screen uses to test a connection
    /// after it is saved.
    /// </summary>
    /// <param name="id">The connection's id.</param>
    /// <param name="cancellationToken">Cancels the calls to the connected instance.</param>
    /// <returns>The report, or a 404 when no connection has that id.</returns>
    [HttpGet("{id:guid}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(DesktopConnectionStatusResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetConnectionStatus(Guid id, CancellationToken cancellationToken)
    {
        var report = await statusService.GetAsync(id, cancellationToken);

        return report is null ? NotFound() : Ok(ToResponseModel(report));
    }

    /// <summary>Maps a report onto its response model, naming the status rather than numbering it.</summary>
    /// <param name="report">The report to map.</param>
    /// <returns>The response model.</returns>
    private static DesktopConnectionStatusResponseModel ToResponseModel(DesktopConnectionStatusReport report) =>
        new(
            report.Id,
            report.Name,
            report.Colour,
            report.BaseUrl,
            report.Status.ToString(),
            report.ServerStatus,
            report.Version,
            report.RuntimeMode,
            report.IsLocal);
}
