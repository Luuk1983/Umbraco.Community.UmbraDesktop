using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Core.Media;
using Umbraco.Cms.Core.Models;
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
/// <param name="library">Reads the items a Clean up changed, for the stored result to follow.</param>
/// <param name="deleter">Deletes orphaned files.</param>
/// <param name="counter">The library's item count, which every status carries.</param>
/// <param name="images">Umbraco's image URL generator, which signs resizer URLs on a site with an HMAC secret.</param>
/// <param name="securityAccessor">Who is signed in.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/media/health")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.SectionAccessMedia)]
public class MediaHealthController(MediaHealthStore store, MediaHealthRunner runner, IMediaLibraryReader library, IMediaOrphanDeleter deleter, IMediaCounter counter, IImageUrlGenerator images, IBackOfficeSecurityAccessor securityAccessor)
    : ManagementApiControllerBase
{
    /// <summary>The most items one page gives; the window pages through them.</summary>
    public const int MaxPage = 500;

    /// <summary>
    /// The largest edge a signed picture may ask for, in pixels: the preview's widest step at a high
    /// pixel ratio, and far beyond a thumbnail. Clamped so a signed URL never asks for a huge resize.
    /// </summary>
    public const int MaxImageEdge = 2400;

    /// <summary>The most URLs one request signs: a screen's worth of thumbnails.</summary>
    public const int MaxThumbnails = 200;

    /// <summary>The key of the person signed in, or null when there is none.</summary>
    private Guid? SignedInKey => securityAccessor.BackOfficeSecurity?.CurrentUser?.Key;

    /// <summary>Where the check is: the one running, the last one done, and a failure since.</summary>
    /// <returns>The status.</returns>
    [HttpGet("status")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MediaHealthStatusResponseModel), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetStatus() => Ok(MediaHealthStatusResponseModel.From(await store.GetStatusAsync(), counter.Count()));

    /// <summary>Start a check, or join the one running.</summary>
    /// <returns>202 with the status, the check running in it.</returns>
    [HttpPost("check")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MediaHealthStatusResponseModel), StatusCodes.Status202Accepted)]
    public async Task<IActionResult> Check()
    {
        await runner.StartAsync(SignedInKey);
        return Accepted(MediaHealthStatusResponseModel.From(await store.GetStatusAsync(), counter.Count()));
    }

    /// <summary>
    /// Stop the running check (design §16.12). Anyone who may start one may stop one: a check started
    /// out of curiosity should not have to run to its end. The last good result stands.
    /// </summary>
    /// <returns>The status, with no check running.</returns>
    [HttpPost("check/stop")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MediaHealthStatusResponseModel), StatusCodes.Status200OK)]
    public async Task<IActionResult> Stop()
    {
        await store.StopAsync();
        return Ok(MediaHealthStatusResponseModel.From(await store.GetStatusAsync(), counter.Count()));
    }

    /// <summary>
    /// Bring the stored result in line with some items a Clean up changed (design §16.12): trashed,
    /// restored or optimized. The window names them; what is stored is what Umbraco says about them
    /// now, so the next person to open the window sees what is true, without another check.
    /// </summary>
    /// <param name="model">The items, at most <see cref="MaxPage"/>.</param>
    /// <returns>204.</returns>
    [HttpPost("items/refresh")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RefreshItems(RefreshMediaHealthItemsRequestModel model)
    {
        var keys = (model.Keys ?? []).Distinct().Take(MaxPage).ToList();
        if (keys.Count > 0)
        {
            await store.RefreshItemsAsync(await library.ReadStatesAsync(keys));
        }

        return NoContent();
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

    /// <summary>
    /// Signed thumbnails for orphaned files of the last check (design §16.7). A site with an HMAC
    /// secret, which Umbraco writes at install, refuses an unsigned resizer URL with 400, and core's
    /// own imaging route signs only media items, which an orphaned file is not. Umbraco's own generator
    /// signs them here, cropped square for a thumbnail, or fitted inside the box for the preview. Only the
    /// last check's orphaned files are signed, never an item's path or any other, so this is never an
    /// open signer.
    /// </summary>
    /// <param name="model">The URLs and the size.</param>
    /// <returns>Each orphaned file's URL with its signed thumbnail; anything else is left out.</returns>
    [HttpPost("orphans/thumbnails")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MediaHealthThumbnailsResponseModel), StatusCodes.Status200OK)]
    public async Task<IActionResult> OrphanThumbnails(MediaHealthThumbnailsRequestModel model)
    {
        var known = await store.KnownOrphanUrlsAsync((model.Urls ?? []).Take(MaxThumbnails).ToList());
        var width = Math.Clamp(model.Width, 1, MaxImageEdge);
        var height = Math.Clamp(model.Height, 1, MaxImageEdge);
        var mode = model.Fit ? ImageCropMode.Max : ImageCropMode.Crop;
        var signed = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var url in known)
        {
            var thumbnail = images.GetImageUrl(new ImageUrlGenerationOptions(url) { Width = width, Height = height, ImageCropMode = mode });
            if (!string.IsNullOrEmpty(thumbnail))
            {
                signed[url] = thumbnail;
            }
        }

        return Ok(new MediaHealthThumbnailsResponseModel(signed));
    }

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
