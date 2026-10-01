using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.Docs;

namespace Umbraco.Community.UmbraDesktop.Api;

/// <summary>
/// Lists a package's docs folder for the Help app.
/// </summary>
/// <remarks>
/// <para>
/// This is what lets a package ship docs with no build tool: it copies its docs folder into its own
/// <c>App_Plugins</c> folder and registers the path, and the Help app asks here which pages are in
/// it. The path rules live in <see cref="DocsFileLister"/>.
/// </para>
/// <para>
/// <b>Open to any backoffice user.</b> Reading help is not privileged, and the files are public
/// static assets anyway. The attribute repeats the base class's gate on purpose, as
/// <see cref="DesktopLabelController"/> does, so the choice is visible rather than inherited.
/// </para>
/// <para>
/// The route segment stays <c>umbradesktop</c> without a hyphen, for the client generator's filter.
/// </para>
/// </remarks>
/// <param name="lister">Lists the folder.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/docs")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
public class DocsController(IDocsFileLister lister) : ManagementApiControllerBase
{
    /// <summary>
    /// Lists the pages and data files of a docs folder.
    /// </summary>
    /// <param name="path">The folder's URL path, such as <c>/App_Plugins/My.Package/docs</c>.</param>
    /// <returns>The files; 400 with the reason for a path that is not listed; 404 for a missing folder.</returns>
    [HttpGet("files")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(DocsFilesResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetDocsFiles([FromQuery] string? path)
    {
        var result = lister.List(path);
        return result.Status switch
        {
            DocsListingStatus.Ok => Ok(new DocsFilesResponseModel(result.Files)),
            DocsListingStatus.NotFound => NotFound(),
            _ => BadRequest(result.Reason),
        };
    }
}
