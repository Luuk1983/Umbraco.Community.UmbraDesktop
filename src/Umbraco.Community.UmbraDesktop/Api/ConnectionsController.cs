using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.Connections;

namespace Umbraco.Community.UmbraDesktop.Api;

/// <summary>
/// Manages the Umbraco instances this desktop can read from.
/// </summary>
/// <remarks>
/// <para>
/// Settings access rather than a plain backoffice login: these are credentials for somebody else's
/// server, and everyone who can edit them can reach every connected client.
/// </para>
/// <para>
/// The route segment must stay <c>umbradesktop</c> without a hyphen:
/// <c>backoffice/scripts/generate-openapi.js</c> filters the spec on the path prefix
/// <c>/umbraco/management/api/v1/umbradesktop</c>, and a mismatch silently produces an empty client.
/// </para>
/// </remarks>
/// <param name="store">Reads and writes the stored connections.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/connections")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.SectionAccessSettings)]
public class ConnectionsController(DesktopConnectionStore store) : ManagementApiControllerBase
{
    /// <summary>
    /// Gets every configured connection.
    /// </summary>
    /// <returns>The connections, without their secrets.</returns>
    [HttpGet]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(DesktopConnectionResponseModel[]), StatusCodes.Status200OK)]
    public IActionResult GetConnections() => Ok(store.GetAll().Select(ToResponseModel).ToArray());

    /// <summary>
    /// Adds a connection.
    /// </summary>
    /// <param name="request">The connection to add.</param>
    /// <returns>The connection as stored, with its new id.</returns>
    [HttpPost]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(DesktopConnectionResponseModel), StatusCodes.Status200OK)]
    public IActionResult CreateConnection(DesktopConnectionRequestModel request)
    {
        var connection = new DesktopConnection(
            Guid.NewGuid(),
            request.Name,
            request.BaseUrl,
            request.Colour,
            request.ClientId);

        store.Save(connection, request.ClientSecret);

        return Ok(ToResponseModel(connection));
    }

    /// <summary>
    /// Replaces a connection.
    /// </summary>
    /// <param name="id">The connection's id.</param>
    /// <param name="request">The new values. An absent secret leaves the stored one alone.</param>
    /// <returns>The connection as stored, or a 404 when no connection has that id.</returns>
    [HttpPut("{id:guid}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(DesktopConnectionResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult UpdateConnection(Guid id, DesktopConnectionRequestModel request)
    {
        if (store.Get(id) is null)
        {
            return NotFound();
        }

        var connection = new DesktopConnection(id, request.Name, request.BaseUrl, request.Colour, request.ClientId);
        store.Save(connection, request.ClientSecret);

        return Ok(ToResponseModel(connection));
    }

    /// <summary>
    /// Removes a connection and the secret stored against it.
    /// </summary>
    /// <param name="id">The connection's id.</param>
    /// <returns>An empty 200.</returns>
    [HttpDelete("{id:guid}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult DeleteConnection(Guid id)
    {
        store.Delete(id);

        return Ok();
    }

    /// <summary>Maps a stored connection onto what the browser is allowed to see.</summary>
    /// <param name="connection">The stored connection.</param>
    /// <returns>The response model.</returns>
    private DesktopConnectionResponseModel ToResponseModel(DesktopConnection connection) =>
        new(
            connection.Id,
            connection.Name,
            connection.BaseUrl,
            connection.Colour,
            connection.ClientId,
            store.HasClientSecret(connection.Id));
}
