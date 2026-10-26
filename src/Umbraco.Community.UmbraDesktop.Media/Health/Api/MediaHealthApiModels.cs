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
public sealed record MediaHealthStatusResponseModel(MediaHealthCheckResponseModel? Running, MediaHealthCheckResponseModel? Last, MediaHealthCheckResponseModel? Failed)
{
    /// <summary>A status as the API says it.</summary>
    /// <param name="status">The status.</param>
    /// <returns>The model.</returns>
    public static MediaHealthStatusResponseModel From(MediaHealthStatus status) => new(
        status.Running is null ? null : MediaHealthCheckResponseModel.From(status.Running),
        status.Last is null ? null : MediaHealthCheckResponseModel.From(status.Last),
        status.Failed is null ? null : MediaHealthCheckResponseModel.From(status.Failed));
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
public sealed record MediaHealthItemResponseModel(Guid Key, string Name, string MediaTypeAlias, string? Extension, long? SizeBytes, Guid? ParentKey, string Path, int UsageCount, bool Used)
{
    /// <summary>An item as the API says it.</summary>
    /// <param name="item">The item.</param>
    /// <returns>The model.</returns>
    public static MediaHealthItemResponseModel From(MediaHealthItem item) =>
        new(item.Key, item.Name, item.MediaTypeAlias, item.Extension, item.SizeBytes, item.ParentKey, item.Path, item.UsageCount, item.Used);
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

/// <summary>A file left alone, and why: <c>NotFound</c> or <c>NowOwned</c>.</summary>
/// <param name="RelativePath">The file.</param>
/// <param name="Reason">Why.</param>
public sealed record MediaHealthSkipResponseModel(string RelativePath, string Reason);

/// <summary>How a delete went.</summary>
/// <param name="Deleted">The files deleted.</param>
/// <param name="Skipped">The files left alone.</param>
public sealed record MediaHealthDeleteResponseModel(IReadOnlyList<string> Deleted, IReadOnlyList<MediaHealthSkipResponseModel> Skipped);
