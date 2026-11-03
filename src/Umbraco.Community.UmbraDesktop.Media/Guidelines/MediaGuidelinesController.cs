using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;

namespace Umbraco.Community.UmbraDesktop.Media.Guidelines;

/// <summary>
/// Reads and writes the site's media guidelines (issue #179).
/// </summary>
/// <remarks>
/// <para>
/// <b>Reading is open to any backoffice user</b>, as the desktop label's is: every editor who drops a
/// file into a Media Manager is checked against these, and most of them have no Settings section. A
/// Settings-only read would switch the check off for exactly the people it is for, and fail nothing.
/// The base class already requires backoffice access; the attribute says so again on purpose.
/// </para>
/// <para>
/// Writing adds the Settings policy on the action: the guidelines apply to everyone on the site.
/// </para>
/// </remarks>
/// <param name="store">Where the guidelines are kept.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/media/guidelines")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
public class MediaGuidelinesController(IMediaGuidelinesStore store) : ManagementApiControllerBase
{
    /// <summary>
    /// Gets the guidelines.
    /// </summary>
    /// <returns>The guidelines, the defaults on a site that never set them.</returns>
    [HttpGet]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MediaGuidelines), StatusCodes.Status200OK)]
    public IActionResult GetGuidelines() => Ok(store.Read());

    /// <summary>
    /// Stores the guidelines.
    /// </summary>
    /// <param name="request">The guidelines to store, every part of them.</param>
    /// <returns>No content on success, and 400 for a value the check could not use.</returns>
    [HttpPut]
    [MapToApiVersion("1.0")]
    [Authorize(Policy = AuthorizationPolicies.SectionAccessSettings)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public IActionResult SetGuidelines(MediaGuidelines request)
    {
        // Refused rather than stored: the store reads each of these back as its default, so storing
        // one would leave a setting that says one thing and does another.
        if (Problem(request) is { } problem)
        {
            return BadRequest(problem);
        }

        store.Write(request);

        // No content rather than an empty 200, which the backoffice's client cannot read over HTTP/2.
        return NoContent();
    }

    /// <summary>
    /// What is wrong with a request, if anything.
    /// </summary>
    /// <param name="request">The request.</param>
    /// <returns>Why it is refused, or null when it can be stored.</returns>
    private static string? Problem(MediaGuidelines? request)
    {
        if (request?.MaxSize is null || request.Formats is null || request.Location is null)
        {
            return "Every guideline must be sent.";
        }

        if (request.MaxSize.LongestSide < 1 || request.MaxSize.LongestSide > MediaGuidelines.LargestLongestSide)
        {
            return $"The longest side must be between 1 and {MediaGuidelines.LargestLongestSide} pixels.";
        }

        if (request.Formats.Quality is < 1 or > 100)
        {
            return "The quality must be between 1 and 100.";
        }

        var formats = request.Formats;
        MediaGuidelineFormat[] rows = [formats.Jpeg, formats.PngPhoto, formats.PngTransparent, formats.Webp, formats.Gif];
        return rows.All(Enum.IsDefined) ? null : "That format does not exist.";
    }
}
