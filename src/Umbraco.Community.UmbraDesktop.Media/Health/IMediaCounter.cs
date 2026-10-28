using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>
/// How many items the library has, before any check: what No check yet says the job is (design
/// §16.3).
/// </summary>
public interface IMediaCounter
{
    /// <summary>The items not in the recycle bin, folders left out, as a check counts them.</summary>
    /// <returns>The count.</returns>
    int Count();
}

/// <summary>
/// The count from Umbraco's media service: everything not trashed, less the folders. Two
/// <c>COUNT</c> queries, read on every status; the window polls the status every two seconds only
/// while a check runs (§15), so that is cheap enough not to cache.
/// </summary>
/// <param name="mediaService">Umbraco's media.</param>
internal sealed class UmbracoMediaCounter(IMediaService mediaService) : IMediaCounter
{
    /// <inheritdoc />
    public int Count() =>
        (int)(mediaService.CountNotTrashed() - mediaService.CountNotTrashed(Constants.Conventions.MediaTypes.Folder));
}
