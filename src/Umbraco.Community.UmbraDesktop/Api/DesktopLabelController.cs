using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.DesktopLabel;
using Umbraco.Community.UmbraDesktop.Manifest;

namespace Umbraco.Community.UmbraDesktop.Api;

/// <summary>
/// Reads and writes the label the desktop draws in one of its corners.
/// </summary>
/// <remarks>
/// <para>
/// The route segment must stay <c>umbradesktop</c> without a hyphen:
/// <c>backoffice/scripts/generate-openapi.js</c> filters the spec on the path prefix
/// <c>/umbraco/management/api/v1/umbradesktop</c>, and a mismatch silently produces an empty client.
/// </para>
/// <para>
/// <b>Reading is open to any backoffice user</b>, which makes this the one controller in the package
/// that is not Settings-only. It has to be: an editor with nothing but Content is exactly who the
/// label is for, and copying a neighbour's policy would hide it from them while failing nothing.
/// The base class already requires backoffice access; the attribute says so again here on purpose,
/// so the gate is a visible decision rather than an inherited accident. The name it hands out is
/// already public in the anonymous manifest, so nothing is exposed that was not.
/// </para>
/// <para>
/// Writing adds the Settings policy on the action, like the rest of the Site screen: it changes what
/// every user on the site sees.
/// </para>
/// </remarks>
/// <param name="store">Where the switches are kept.</param>
/// <param name="identity">Resolves the App name, which is the label's text.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/desktop-label")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
public class DesktopLabelController(IDesktopLabelStore store, IAppIdentityResolver identity)
    : ManagementApiControllerBase
{
    /// <summary>
    /// Gets what the desktop needs to draw the label.
    /// </summary>
    /// <returns>The name and the three switches.</returns>
    [HttpGet]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(DesktopLabelResponseModel), StatusCodes.Status200OK)]
    public IActionResult GetDesktopLabel()
    {
        var settings = store.Read();

        return Ok(new DesktopLabelResponseModel(
            identity.ResolveName(),
            settings.Show,
            settings.Corner,
            settings.ShowDomain));
    }

    /// <summary>
    /// Stores the label's switches.
    /// </summary>
    /// <param name="request">The switches to store.</param>
    /// <returns>No content on success, and 400 for a corner that does not exist.</returns>
    [HttpPost]
    [MapToApiVersion("1.0")]
    [Authorize(Policy = AuthorizationPolicies.SectionAccessSettings)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public IActionResult SetDesktopLabel(DesktopLabelRequestModel request)
    {
        // Refused rather than stored: the store reads an unknown corner back as top right, so storing
        // one would leave a setting that says one thing and does another. A number is the only way
        // to send one, since an unknown name already fails model binding.
        if (!Enum.IsDefined(request.Corner))
        {
            return BadRequest("That corner does not exist.");
        }

        store.Write(new DesktopLabelSettings(request.Show, request.Corner, request.ShowDomain));

        // No content rather than an empty 200, which the generated client cannot read over HTTP/2.
        return NoContent();
    }
}
