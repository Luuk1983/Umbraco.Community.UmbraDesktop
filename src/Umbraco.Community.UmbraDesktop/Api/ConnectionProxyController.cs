using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Connections;

namespace Umbraco.Community.UmbraDesktop.Api;

/// <summary>
/// Forwards the remote content viewer's reads to a connected instance.
/// </summary>
/// <remarks>
/// <para>
/// The viewer runs this instance's own backoffice in a frame and redirects the frame's data calls
/// here, as <c>connection-proxy/{id}/umbraco/management/api/...</c>. The frame stays logged in to this
/// instance, so the call arrives authenticated as the person looking, and this controller swaps that
/// for the connection's API user. The browser never holds the remote's token, and needs no CORS.
/// </para>
/// <para>
/// Content section access is required, not just a login as for Connection status. That app reports a
/// version number; this one shows another site's pages, which is the thing the Content section is
/// the gate for here.
/// </para>
/// <para>
/// Left out of the API description, and so out of the generated client: nothing calls it by name.
/// The frame reaches it by rewriting URLs, and a catch-all route documents as nothing useful.
/// </para>
/// <para>
/// The route segment must stay <c>umbradesktop</c> without a hyphen, for the reason given on
/// <see cref="ConnectionsController"/>. It also has to stay under <c>umbradesktop/</c> for a second
/// reason: that area is one the frame's routing keeps local, which is what stops a proxied call being
/// redirected to the proxy again.
/// </para>
/// </remarks>
/// <param name="store">Where the connections are kept.</param>
/// <param name="proxy">Performs the forwarded GET.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/connection-proxy")]
[ApiExplorerSettings(IgnoreApi = true)]
[Authorize(Policy = AuthorizationPolicies.SectionAccessContent)]
public class ConnectionProxyController(DesktopConnectionStore store, DesktopConnectionProxy proxy) : ManagementApiControllerBase
{
    /// <summary>
    /// Forwards one GET to a connected instance and writes back what it answered.
    /// </summary>
    /// <param name="id">The connection's id.</param>
    /// <param name="path">The path on the remote instance, without its leading slash.</param>
    /// <param name="cancellationToken">Cancels the call to the connected instance.</param>
    /// <returns>
    /// The remote's answer as it was; 404 for an unknown connection; 400 for a path the proxy will not
    /// forward; 502 when the remote could not be asked.
    /// </returns>
    [HttpGet("{id:guid}/{**path}")]
    [MapToApiVersion("1.0")]
    public async Task<IActionResult> Get(Guid id, string path, CancellationToken cancellationToken)
    {
        var connection = store.Get(id);
        if (connection is null)
        {
            return NotFound();
        }

        var response = await proxy.GetAsync(connection, $"/{path}{Request.QueryString}", cancellationToken);

        return response.Status switch
        {
            DesktopConnectionStatus.Ok => new ProxiedResponseResult(response),
            DesktopConnectionStatus.Forbidden => BadRequest(),

            // Named in the title, because each is fixed by a different person and the frame's own
            // error handling will show whatever the problem details say.
            _ => Problem(title: $"The connected instance could not be asked: {response.Status}.", statusCode: StatusCodes.Status502BadGateway),
        };
    }

    /// <summary>Writes a proxied answer out exactly as the remote gave it, and marks it uncacheable.</summary>
    /// <param name="response">The remote's answer.</param>
    private sealed record ProxiedResponseResult(DesktopConnectionProxyResponse response) : IActionResult
    {
        /// <inheritdoc />
        public async Task ExecuteResultAsync(ActionContext context)
        {
            var httpResponse = context.HttpContext.Response;
            httpResponse.StatusCode = response.StatusCode;
            httpResponse.Headers.CacheControl = "no-store";
            if (response.ContentType is not null)
            {
                httpResponse.ContentType = response.ContentType;
            }

            await httpResponse.Body.WriteAsync(response.Body, context.HttpContext.RequestAborted);
        }
    }
}
