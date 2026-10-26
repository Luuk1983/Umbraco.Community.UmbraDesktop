using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Web.Common.Authorization;

namespace Umbraco.Community.UmbraDesktop.Media.Health.Api;

/// <summary>
/// Media Health's API (design §15): start a check, follow it, read its result, and delete orphaned
/// files.
/// </summary>
/// <remarks>
/// <para>
/// <b>Who may use it.</b> Anyone with the Media section, which is who can open the window at all:
/// Umbraco's own policy for the section, on the controller. Deleting files from disk is for
/// administrators, as deleting anything for good is; that action adds Umbraco's admin policy, which
/// answers 403 rather than hiding the action, so the window can grey the button and say why.
/// </para>
/// <para>
/// The route segment stays <c>umbradesktop</c> without a hyphen, as the host's controllers keep it:
/// the host's OpenAPI client generation filters the spec on that prefix.
/// </para>
/// </remarks>
/// <param name="store">The last check and its result.</param>
/// <param name="runner">Runs a check.</param>
/// <param name="deleter">Deletes orphaned files.</param>
/// <param name="securityAccessor">Who is signed in.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/media/health")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.SectionAccessMedia)]
public class MediaHealthController(MediaHealthStore store, MediaHealthRunner runner, IMediaOrphanDeleter deleter, IBackOfficeSecurityAccessor securityAccessor)
    : ManagementApiControllerBase
{
    /// <summary>The most items one page gives; the window pages through them.</summary>
    public const int MaxPage = 500;

    /// <summary>The key of the person signed in, or null when there is none.</summary>
    private Guid? SignedInKey => securityAccessor.BackOfficeSecurity?.CurrentUser?.Key;

    /// <summary>Where the check is: the one running, the last one done, and a failure since.</summary>
    /// <returns>The status.</returns>
    [HttpGet("status")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MediaHealthStatusResponseModel), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetStatus() => Ok(MediaHealthStatusResponseModel.From(await store.GetStatusAsync()));

    /// <summary>Start a check, or join the one running.</summary>
    /// <returns>202 with the status, the check running in it.</returns>
    [HttpPost("check")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MediaHealthStatusResponseModel), StatusCodes.Status202Accepted)]
    public async Task<IActionResult> Check()
    {
        await runner.StartAsync(SignedInKey);
        return Accepted(MediaHealthStatusResponseModel.From(await store.GetStatusAsync()));
    }

    /// <summary>The last check's items, largest first, a page at a time.</summary>
    /// <param name="skip">How many to skip.</param>
    /// <param name="take">How many to take, at most <see cref="MaxPage"/>.</param>
    /// <returns>The page, with the total.</returns>
    [HttpGet("items")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MediaHealthItemsResponseModel), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetItems(int skip = 0, int take = MaxPage)
    {
        var status = await store.GetStatusAsync();
        var items = await store.GetItemsAsync(Math.Max(skip, 0), Math.Clamp(take, 1, MaxPage));
        return Ok(new MediaHealthItemsResponseModel(status.Last?.Items ?? 0, items.Select(MediaHealthItemResponseModel.From).ToList()));
    }

    /// <summary>The last check's folders.</summary>
    /// <returns>The folders.</returns>
    [HttpGet("folders")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MediaHealthFoldersResponseModel), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetFolders() =>
        Ok(new MediaHealthFoldersResponseModel((await store.GetFoldersAsync()).Select(folder => new MediaHealthFolderResponseModel(folder.Key, folder.Name, folder.ParentKey, folder.Path)).ToList()));

    /// <summary>The last check's orphaned files, largest first.</summary>
    /// <returns>The files.</returns>
    [HttpGet("orphans")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MediaHealthOrphansResponseModel), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetOrphans() =>
        Ok(new MediaHealthOrphansResponseModel((await store.GetOrphansAsync()).Select(orphan => new MediaHealthOrphanResponseModel(orphan.RelativePath, orphan.Url, orphan.SizeBytes, orphan.LastModifiedUtc)).ToList()));

    /// <summary>Delete orphaned files from disk, each checked again first. Administrators only.</summary>
    /// <param name="model">The files.</param>
    /// <param name="cancellationToken">The request's token.</param>
    /// <returns>What went and what stayed.</returns>
    [HttpPost("orphans/delete")]
    [MapToApiVersion("1.0")]
    [Authorize(Policy = AuthorizationPolicies.RequireAdminAccess)]
    [ProducesResponseType(typeof(MediaHealthDeleteResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteOrphans(DeleteMediaOrphansRequestModel model, CancellationToken cancellationToken)
    {
        var result = await deleter.DeleteAsync(model.RelativePaths, SignedInKey ?? Guid.Empty, cancellationToken);
        if (result.Deleted.Count > 0)
        {
            await store.RemoveOrphansAsync(result.Deleted);
        }

        return Ok(new MediaHealthDeleteResponseModel(result.Deleted, result.Skipped.Select(skip => new MediaHealthSkipResponseModel(skip.RelativePath, skip.Reason.ToString())).ToList()));
    }
}
