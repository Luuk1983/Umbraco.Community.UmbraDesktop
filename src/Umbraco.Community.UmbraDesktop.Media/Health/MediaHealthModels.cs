namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>A folder of the library, as the last check saw it: by key, so the Manager can match it (design §15).</summary>
/// <param name="Key">The folder's key.</param>
/// <param name="Name">Its name.</param>
/// <param name="ParentKey">The folder it is in, or null at the root.</param>
/// <param name="Path">Its names path from the root, such as <c>/Campaign Assets/2023</c>.</param>
public sealed record MediaHealthFolder(Guid Key, string Name, Guid? ParentKey, string Path);

/// <summary>A media item of the library, as the last check classified it.</summary>
/// <param name="Key">The item's key.</param>
/// <param name="Name">Its name.</param>
/// <param name="MediaTypeAlias">Its media type's alias, such as <c>Image</c>.</param>
/// <param name="Extension">Its file's extension without the dot, or null when the item carries none.</param>
/// <param name="SizeBytes">Its file's size, or null when the item carries none.</param>
/// <param name="ParentKey">The folder it is in, or null at the root.</param>
/// <param name="Path">The names path of the folder it is in, <c>/</c> at the root.</param>
/// <param name="UsageCount">How many pages are placed on it, by Umbraco's tracked relations.</param>
/// <param name="Url">
/// The first file it owns, as stored (<c>/media/abc123/photo.jpg</c>): the string core serves and the
/// image resizer answers, so thumbnails and the preview are the resizer on it (design §16.7). Null
/// for an item without a file.
/// </param>
/// <param name="Width">Its width in pixels, from Umbraco's <c>umbracoWidth</c>, or null when it has none.</param>
/// <param name="Height">Its height in pixels, from <c>umbracoHeight</c>, or null.</param>
/// <param name="UpdatedUtc">When it was last changed, for the preview's "last changed" (design §16.5).</param>
public sealed record MediaHealthItem(
    Guid Key,
    string Name,
    string MediaTypeAlias,
    string? Extension,
    long? SizeBytes,
    Guid? ParentKey,
    string Path,
    int UsageCount,
    string? Url = null,
    int? Width = null,
    int? Height = null,
    DateTime UpdatedUtc = default)
{
    /// <summary>Whether any page is placed on it.</summary>
    public bool Used => UsageCount > 0;
}

/// <summary>A file in the media folder that no item owns.</summary>
/// <param name="RelativePath">Its path under the media folder, forward slashes, no leading slash: what a delete names.</param>
/// <param name="Url">Where the site serves it.</param>
/// <param name="SizeBytes">Its size.</param>
/// <param name="LastModifiedUtc">When it was last written.</param>
public sealed record MediaHealthOrphan(string RelativePath, string Url, long SizeBytes, DateTime LastModifiedUtc);

/// <summary>
/// An item as Umbraco has it now, for bringing the stored result in line after a Clean up (design
/// §16.12): read from Umbraco, never taken from the window, so the stored result stays Umbraco's word.
/// </summary>
/// <param name="Key">The item's key.</param>
/// <param name="Exists">Whether Umbraco still has it at all; false once it is deleted for good.</param>
/// <param name="Trashed">Whether it is in the recycle bin.</param>
/// <param name="SizeBytes">Its file's size now, or null when it carries none.</param>
/// <param name="Url">Its first owned file now, or null.</param>
/// <param name="Width">Its width now, or null.</param>
/// <param name="Height">Its height now, or null.</param>
/// <param name="UpdatedUtc">When it was last changed.</param>
public sealed record MediaHealthItemState(Guid Key, bool Exists, bool Trashed, long? SizeBytes, string? Url, int? Width, int? Height, DateTime UpdatedUtc);

/// <summary>What a finished check found.</summary>
/// <param name="Folders">Every folder.</param>
/// <param name="Items">Every item that is not a folder and not in the recycle bin.</param>
/// <param name="Orphans">Every file on disk no item owns.</param>
public sealed record MediaHealthResult(
    IReadOnlyList<MediaHealthFolder> Folders,
    IReadOnlyList<MediaHealthItem> Items,
    IReadOnlyList<MediaHealthOrphan> Orphans);

/// <summary>How far a pass is: how much is done, of how much.</summary>
/// <param name="Scanned">What is done.</param>
/// <param name="Total">What there is; 0 when not known, as the disk's file count is not before the walk.</param>
public readonly record struct MediaHealthProgress(int Scanned, int Total);

/// <summary>Where a check is.</summary>
public enum MediaHealthPhase
{
    /// <summary>Reading the library and finding what is used.</summary>
    Usage,

    /// <summary>Walking the media folder on disk.</summary>
    Disk,

    /// <summary>Writing the result.</summary>
    Saving,

    /// <summary>Finished; the result is readable.</summary>
    Done,

    /// <summary>Ended badly; <see cref="MediaHealthCheck.Error"/> says why.</summary>
    Failed,

    /// <summary>
    /// Stopped by someone before it finished. Not a failure: the last good result stands and the
    /// window shows it again, with nothing to explain.
    /// </summary>
    Stopped,
}

/// <summary>One check: when, who, where it is, and once done, what it counted.</summary>
/// <param name="Id">The check's number, higher for later checks.</param>
/// <param name="StartedUtc">When it started.</param>
/// <param name="FinishedUtc">When it finished or failed, or null while it runs.</param>
/// <param name="Phase">Where it is.</param>
/// <param name="Scanned">What the phase has done so far.</param>
/// <param name="Total">What the phase has to do; 0 when not known.</param>
/// <param name="Error">Why it failed, when it did.</param>
/// <param name="StartedBy">The key of the person who pressed Check, or null when nobody did.</param>
/// <param name="Items">How many items it found, once done.</param>
/// <param name="Folders">How many folders, once done.</param>
/// <param name="Orphans">How many orphaned files, once done.</param>
/// <param name="SizeBytes">The items' size together, once done.</param>
/// <param name="OrphanBytes">The orphaned files' size together, once done.</param>
public sealed record MediaHealthCheck(
    int Id,
    DateTime StartedUtc,
    DateTime? FinishedUtc,
    MediaHealthPhase Phase,
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
    /// <summary>Whether the check is still going.</summary>
    public bool IsRunning => Phase is MediaHealthPhase.Usage or MediaHealthPhase.Disk or MediaHealthPhase.Saving;
}

/// <summary>What the window asks first: the check running, the last one done, and a failure since.</summary>
/// <param name="Running">The check under way, or null.</param>
/// <param name="Last">The last check that finished, or null before the first.</param>
/// <param name="Failed">A check that failed after <paramref name="Last"/>, or null.</param>
public sealed record MediaHealthStatus(MediaHealthCheck? Running, MediaHealthCheck? Last, MediaHealthCheck? Failed);

/// <summary>The library as read in one pass: what the check classifies, and what the disk scan subtracts.</summary>
/// <param name="Folders">Every folder.</param>
/// <param name="Items">Every item that is not a folder and not in the recycle bin, with its usage.</param>
/// <param name="OwnedPaths">The relative path of every file an item owns, trashed items included, compared without case.</param>
public sealed record MediaLibrarySnapshot(
    IReadOnlyList<MediaHealthFolder> Folders,
    IReadOnlyList<MediaHealthItem> Items,
    ISet<string> OwnedPaths);

/// <summary>An item to classify: its id, and the ids of the folders above it.</summary>
/// <param name="Id">The item's integer id, which relations name.</param>
/// <param name="AncestorIds">The ids above it, root excluded, in any order.</param>
public sealed record MediaUsageSubject(int Id, IReadOnlyList<int> AncestorIds);

/// <summary>A page placed on a media item or folder, as Umbraco's <c>umbMedia</c> relations record it.</summary>
/// <param name="ContentId">The page.</param>
/// <param name="MediaId">The item or folder.</param>
public readonly record struct MediaRelation(int ContentId, int MediaId);

/// <summary>One property of a media item, as far as finding its file goes.</summary>
/// <param name="EditorAlias">The property editor's alias.</param>
/// <param name="Value">The stored value, as text.</param>
public sealed record MediaPropertyValue(string EditorAlias, string? Value);

/// <summary>Why an orphaned file asked for was not deleted.</summary>
public enum MediaOrphanSkipReason
{
    /// <summary>It is no longer on disk.</summary>
    NotFound,

    /// <summary>A media item owns it now.</summary>
    NowOwned,

    /// <summary>
    /// Someone keeps it (design §16.6), perhaps since the window asking loaded: the delete checks the
    /// keeps itself rather than trusting the list it was sent (plan Review Focus 5).
    /// </summary>
    Kept,
}

/// <summary>An orphaned file left alone, and why.</summary>
/// <param name="RelativePath">The file.</param>
/// <param name="Reason">Why.</param>
public sealed record MediaOrphanSkip(string RelativePath, MediaOrphanSkipReason Reason);

/// <summary>How a delete of orphaned files went.</summary>
/// <param name="Deleted">The files deleted.</param>
/// <param name="Skipped">The files left alone, each with its reason.</param>
public sealed record MediaOrphanDeleteResult(IReadOnlyList<string> Deleted, IReadOnlyList<MediaOrphanSkip> Skipped);
