namespace Umbraco.Community.UmbraDesktop.Media.Health.Api;

/// <summary>One check, as the window reads it.</summary>
/// <param name="Id">The check's number.</param>
/// <param name="StartedUtc">When it started.</param>
/// <param name="FinishedUtc">When it finished or failed, or null while it runs.</param>
/// <param name="Phase">Where it is: <c>Usage</c>, <c>Disk</c>, <c>Saving</c>, <c>Done</c> or <c>Failed</c>.</param>
/// <param name="Scanned">What the phase has done.</param>
/// <param name="Total">What it has to do; 0 when not known.</param>
/// <param name="Error">Why it failed, when it did.</param>
/// <param name="StartedBy">Who pressed Check.</param>
/// <param name="Items">How many items, once done.</param>
/// <param name="Folders">How many folders, once done.</param>
/// <param name="Orphans">How many orphaned files, once done.</param>
/// <param name="SizeBytes">The items' size together, once done.</param>
/// <param name="OrphanBytes">The orphaned files' size together, once done.</param>
public sealed record MediaHealthCheckResponseModel(
    int Id,
    DateTime StartedUtc,
    DateTime? FinishedUtc,
    string Phase,
    int Scanned,
    int Total,
    string? Error,
    Guid? StartedBy,
    int Items,
    int Folders,
    int Orphans,
    long SizeBytes,
    long OrphanBytes)
{
    /// <summary>A check as the API says it.</summary>
    /// <param name="check">The check.</param>
    /// <returns>The model.</returns>
    public static MediaHealthCheckResponseModel From(MediaHealthCheck check) => new(
        check.Id, check.StartedUtc, check.FinishedUtc, check.Phase.ToString(), check.Scanned, check.Total, check.Error, check.StartedBy,
        check.Items, check.Folders, check.Orphans, check.SizeBytes, check.OrphanBytes);
}

/// <summary>The check running, the last one done, and a failure since; each null when there is none.</summary>
/// <param name="Running">The check under way.</param>
/// <param name="Last">The last check that finished.</param>
/// <param name="Failed">A check that failed after the last one.</param>
/// <param name="MediaCount">
/// The library's items now, folders and the recycle bin left out, so No check yet can say how big
/// the job is before there is any check to count from (design §16.3).
/// </param>
public sealed record MediaHealthStatusResponseModel(
    MediaHealthCheckResponseModel? Running,
    MediaHealthCheckResponseModel? Last,
    MediaHealthCheckResponseModel? Failed,
    int MediaCount)
{
    /// <summary>A status as the API says it.</summary>
    /// <param name="status">The status.</param>
    /// <param name="mediaCount">The library's items now.</param>
    /// <returns>The model.</returns>
    public static MediaHealthStatusResponseModel From(MediaHealthStatus status, int mediaCount) => new(
        status.Running is null ? null : MediaHealthCheckResponseModel.From(status.Running),
        status.Last is null ? null : MediaHealthCheckResponseModel.From(status.Last),
        status.Failed is null ? null : MediaHealthCheckResponseModel.From(status.Failed),
        mediaCount);
}

/// <summary>One item, as the window lists it.</summary>
/// <param name="Key">The item's key.</param>
/// <param name="Name">Its name.</param>
/// <param name="MediaTypeAlias">Its media type's alias.</param>
/// <param name="Extension">Its file's extension, or null.</param>
/// <param name="SizeBytes">Its file's size, or null.</param>
/// <param name="ParentKey">The folder it is in, or null at the root.</param>
/// <param name="Path">The names path of the folder it is in.</param>
/// <param name="UsageCount">How many pages are placed on it.</param>
/// <param name="Used">Whether any page is.</param>
/// <param name="Url">Its first owned file, as stored, for thumbnails and the preview; null without a file.</param>
/// <param name="Width">Its width in pixels, or null.</param>
/// <param name="Height">Its height in pixels, or null.</param>
/// <param name="UpdatedUtc">When it was last changed.</param>
public sealed record MediaHealthItemResponseModel(
    Guid Key,
    string Name,
    string MediaTypeAlias,
    string? Extension,
    long? SizeBytes,
    Guid? ParentKey,
    string Path,
    int UsageCount,
    bool Used,
    string? Url,
    int? Width,
    int? Height,
    DateTime UpdatedUtc)
{
    /// <summary>An item as the API says it.</summary>
    /// <param name="item">The item.</param>
    /// <returns>The model.</returns>
    public static MediaHealthItemResponseModel From(MediaHealthItem item) => new(
        item.Key, item.Name, item.MediaTypeAlias, item.Extension, item.SizeBytes, item.ParentKey, item.Path, item.UsageCount, item.Used,
        item.Url, item.Width, item.Height, item.UpdatedUtc);
}

/// <summary>A page of items, largest first.</summary>
/// <param name="Total">How many there are in all.</param>
/// <param name="Items">This page.</param>
public sealed record MediaHealthItemsResponseModel(int Total, IReadOnlyList<MediaHealthItemResponseModel> Items);

/// <summary>One folder, as the Manager will match it.</summary>
/// <param name="Key">The folder's key.</param>
/// <param name="Name">Its name.</param>
/// <param name="ParentKey">The folder it is in, or null at the root.</param>
/// <param name="Path">Its names path.</param>
public sealed record MediaHealthFolderResponseModel(Guid Key, string Name, Guid? ParentKey, string Path);

/// <summary>Every folder of the last check.</summary>
/// <param name="Folders">The folders.</param>
public sealed record MediaHealthFoldersResponseModel(IReadOnlyList<MediaHealthFolderResponseModel> Folders);

/// <summary>One orphaned file.</summary>
/// <param name="RelativePath">Its path under the media folder: what a delete names.</param>
/// <param name="Url">Where the site serves it.</param>
/// <param name="SizeBytes">Its size.</param>
/// <param name="LastModifiedUtc">When it was last written.</param>
public sealed record MediaHealthOrphanResponseModel(string RelativePath, string Url, long SizeBytes, DateTime LastModifiedUtc);

/// <summary>Every orphaned file of the last check, largest first.</summary>
/// <param name="Orphans">The files.</param>
public sealed record MediaHealthOrphansResponseModel(IReadOnlyList<MediaHealthOrphanResponseModel> Orphans);

/// <summary>The files to delete from disk.</summary>
/// <param name="RelativePaths">Their paths, as listed.</param>
public sealed record DeleteMediaOrphansRequestModel(IReadOnlyList<string> RelativePaths);

/// <summary>A file left alone, and why: <c>NotFound</c>, <c>NowOwned</c> or <c>Kept</c>.</summary>
/// <param name="RelativePath">The file.</param>
/// <param name="Reason">Why.</param>
public sealed record MediaHealthSkipResponseModel(string RelativePath, string Reason);

/// <summary>How a delete went.</summary>
/// <param name="Deleted">The files deleted.</param>
/// <param name="Skipped">The files left alone.</param>
public sealed record MediaHealthDeleteResponseModel(IReadOnlyList<string> Deleted, IReadOnlyList<MediaHealthSkipResponseModel> Skipped);

/// <summary>
/// Orphaned files' pictures to sign: their URLs, as the check listed them, the size to draw them at, and
/// whether to fit the whole picture in that box (the preview) rather than crop it square (a thumbnail).
/// </summary>
/// <param name="Urls">The URLs.</param>
/// <param name="Width">The width in pixels, clamped to the route's largest edge.</param>
/// <param name="Height">The height in pixels, the same.</param>
/// <param name="Fit">True to fit the picture inside the box, keeping its shape; false, the default, to crop it.</param>
public sealed record MediaHealthThumbnailsRequestModel(IReadOnlyList<string> Urls, int Width, int Height, bool Fit = false);

/// <summary>The signed thumbnail of each orphaned file of the last check, by the URL asked for.</summary>
/// <param name="Urls">Each known URL and its signed resizer URL; unknown URLs are left out.</param>
public sealed record MediaHealthThumbnailsResponseModel(IReadOnlyDictionary<string, string> Urls);

/// <summary>The items a Clean up changed, for the stored result to follow (design §16.12).</summary>
/// <param name="Keys">The items trashed, restored or optimized.</param>
public sealed record RefreshMediaHealthItemsRequestModel(IReadOnlyList<Guid> Keys);

/// <summary>One keep, as Kept lists it and the window filters by it (design §16.6).</summary>
/// <param name="Id">The keep's number, which Stop keeping names.</param>
/// <param name="Kind">The list it was kept from: <c>Unused</c>, <c>Orphaned</c> or <c>Oversized</c>.</param>
/// <param name="Target">The item's key, or the orphaned file's relative path.</param>
/// <param name="Note">Why it is kept, or null.</param>
/// <param name="UntilUtc">When it ends, or null for always.</param>
/// <param name="KeptBy">Who kept it.</param>
/// <param name="KeptByName">Their name.</param>
/// <param name="KeptUtc">When.</param>
/// <param name="Ended">Why it has ended, <c>Expired</c> or <c>Changed</c>, or null while it holds.</param>
public sealed record MediaHealthKeepResponseModel(
    int Id,
    string Kind,
    string Target,
    string? Note,
    DateTime? UntilUtc,
    Guid KeptBy,
    string KeptByName,
    DateTime KeptUtc,
    string? Ended)
{
    /// <summary>A keep as the API says it.</summary>
    /// <param name="keep">The keep.</param>
    /// <returns>The model.</returns>
    public static MediaHealthKeepResponseModel From(Keep.MediaKeep keep) => new(
        keep.Id, keep.Kind.ToString(), keep.Target, keep.Note, keep.UntilUtc, keep.KeptBy, keep.KeptByName, keep.KeptUtc, keep.Ended?.ToString());
}

/// <summary>Keeps: every keep, or the ones just made.</summary>
/// <param name="Keeps">The keeps.</param>
public sealed record MediaHealthKeepsResponseModel(IReadOnlyList<MediaHealthKeepResponseModel> Keeps);

/// <summary>Things to keep.</summary>
/// <param name="Kind">The list they are kept from: <c>Unused</c>, <c>Orphaned</c> or <c>Oversized</c>.</param>
/// <param name="Targets">Item keys or orphaned files' relative paths.</param>
/// <param name="Note">Why, or null; at most 500 characters.</param>
/// <param name="Duration">For how long: <c>ThreeMonths</c>, <c>Year</c> or <c>Always</c>.</param>
public sealed record KeepMediaRequestModel(string Kind, IReadOnlyList<string> Targets, string? Note, string Duration);

/// <summary>Keeps to stop.</summary>
/// <param name="Ids">Their numbers.</param>
public sealed record StopKeepingMediaRequestModel(IReadOnlyList<int> Ids);
