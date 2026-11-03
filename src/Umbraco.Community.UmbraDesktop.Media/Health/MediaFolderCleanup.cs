using Umbraco.Community.UmbraDesktop.Media.Health.Keep;

namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>What one folder holds that can go, in it and every folder under it.</summary>
/// <param name="Key">The folder's key, or null for the whole library.</param>
/// <param name="Unused">Items no page uses.</param>
/// <param name="Oversized">Used images over <see cref="MediaFolderCleanup.OversizedBytes"/>.</param>
public sealed record MediaFolderCleanupCount(Guid? Key, int Unused, int Oversized);

/// <summary>
/// Counts, per folder, what the last check found to clean up, for the Media Manager's cleanup line
/// (design §16.20). On the server rather than in the browser, so a Manager window reads a row per
/// folder instead of every item of the library.
/// </summary>
/// <remarks>
/// The rule is the Media Cleanup window's (<c>healthOf</c> in <c>health-model.ts</c>): unused before
/// oversized, an image by its extension or, without one, by core's Image type, and active keeps left
/// out (design §16.6). The window decides its lists in the browser, so the two constants below are a
/// copy, pinned to the browser's by a test on each side.
/// </remarks>
public static class MediaFolderCleanup
{
    /// <summary>Over this, a used image is oversized: 2 MB, as <c>OVERSIZED_BYTES</c> in the window.</summary>
    public const long OversizedBytes = 2 * 1024 * 1024;

    /// <summary>The raster images Optimize images works on, as <c>IMAGE_EXTENSIONS</c> in the window; never SVG.</summary>
    public static readonly IReadOnlySet<string> ImageExtensions =
        new HashSet<string>(["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "avif", "heic", "heif"], StringComparer.OrdinalIgnoreCase);

    /// <summary>Core's own Image type, for an item whose file carries no extension.</summary>
    private const string CoreImageType = "image";

    /// <summary>
    /// Count each folder's unused items and oversized images over every level below it.
    /// </summary>
    /// <param name="items">The last check's items.</param>
    /// <param name="folders">The last check's folders.</param>
    /// <param name="keeps">Every keep, with <see cref="MediaKeep.Ended"/> worked out.</param>
    /// <returns>
    /// The folders with something to clean up, and the library (key null) when it has any. An item
    /// with items under it counts as a folder too, since the Manager opens it as one.
    /// </returns>
    public static IReadOnlyList<MediaFolderCleanupCount> Count(IReadOnlyList<MediaHealthItem> items, IReadOnlyList<MediaHealthFolder> folders, IReadOnlyList<MediaKeep> keeps)
    {
        var parents = new Dictionary<Guid, Guid?>();
        foreach (var folder in folders) parents[folder.Key] = folder.ParentKey;
        foreach (var item in items) parents[item.Key] = item.ParentKey;
        var kept = keeps.Where(keep => keep.Ended is null).Select(keep => keep.Target).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var unused = new Dictionary<Guid, int>();
        var oversized = new Dictionary<Guid, int>();
        int libraryUnused = 0, libraryOversized = 0;
        foreach (var item in items)
        {
            var kind = KindOf(item);
            if (kind is null || kept.Contains(item.Key.ToString("D"))) continue;
            var counts = kind == Kind.Unused ? unused : oversized;
            if (kind == Kind.Unused) libraryUnused++;
            else libraryOversized++;
            var seen = new HashSet<Guid>();
            for (var parent = item.ParentKey; parent is { } key && seen.Add(key); parent = parents.GetValueOrDefault(key))
                counts[key] = counts.GetValueOrDefault(key) + 1;
        }

        var result = new List<MediaFolderCleanupCount>();
        if (libraryUnused + libraryOversized > 0) result.Add(new MediaFolderCleanupCount(null, libraryUnused, libraryOversized));
        foreach (var key in unused.Keys.Union(oversized.Keys))
            result.Add(new MediaFolderCleanupCount(key, unused.GetValueOrDefault(key), oversized.GetValueOrDefault(key)));
        return result;
    }

    /// <summary>What an item counts as.</summary>
    private enum Kind
    {
        /// <summary>No page uses it.</summary>
        Unused,

        /// <summary>A used image over the limit.</summary>
        Oversized,
    }

    /// <summary>
    /// An item's kind, one each: unused before oversized.
    /// </summary>
    /// <param name="item">The item.</param>
    /// <returns>Its kind, or null when it is in use and fine.</returns>
    private static Kind? KindOf(MediaHealthItem item)
    {
        if (!item.Used) return Kind.Unused;
        return IsImage(item) && (item.SizeBytes ?? 0) > OversizedBytes ? Kind.Oversized : null;
    }

    /// <summary>
    /// Whether an item is a raster image, as the window decides it.
    /// </summary>
    /// <param name="item">The item.</param>
    /// <returns>True for an image.</returns>
    private static bool IsImage(MediaHealthItem item) =>
        item.Extension is { Length: > 0 } extension ? ImageExtensions.Contains(extension) : string.Equals(item.MediaTypeAlias, CoreImageType, StringComparison.OrdinalIgnoreCase);
}
