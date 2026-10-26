using Umbraco.Cms.Core;
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>Reads the whole media library for a check.</summary>
public interface IMediaLibraryReader
{
    /// <summary>Every folder, every item with its usage, and every file an item owns.</summary>
    /// <param name="progress">Told how many items have been read, of how many, as the pages go by.</param>
    /// <param name="cancellationToken">Stops the read.</param>
    /// <returns>The library.</returns>
    Task<MediaLibrarySnapshot> ReadAsync(IProgress<MediaHealthProgress> progress, CancellationToken cancellationToken);

    /// <summary>Only the files items own, trashed items included: what a delete re-checks against.</summary>
    /// <param name="cancellationToken">Stops the read.</param>
    /// <returns>The relative paths, compared without case.</returns>
    Task<ISet<string>> ReadOwnedPathsAsync(CancellationToken cancellationToken);
}

/// <summary>
/// The library from Umbraco's media service, in one pass of pages, and its usage from one relations
/// query (design §15).
/// </summary>
/// <remarks>
/// <para>
/// One pass over every descendant of the root, the recycle bin included: folders go into a map by
/// id, so each item's folder key and names path come from the map and never from a lookup per item;
/// trashed items give only the files they own, since they keep their files until the bin is emptied.
/// Then one query for every <c>umbMedia</c> relation on the site, and <see cref="MediaUsageClassifier"/>
/// counts. A library of ten thousand items is twenty pages and one query, where a lookup per item
/// would be ten thousand of each.
/// </para>
/// <para>
/// Synchronous underneath, as Umbraco's media service is; the async shape is for the runner, which
/// calls it from a background thread.
/// </para>
/// </remarks>
/// <param name="mediaService">Umbraco's media.</param>
/// <param name="relationService">Umbraco's relations.</param>
/// <param name="mediaFileSystem">The media file system, which turns a stored path into a relative one.</param>
/// <param name="pageSize">How many items a page reads; 500, as Umbraco's own bulk reads page.</param>
internal sealed class UmbracoMediaLibraryReader(
    IMediaService mediaService,
    IRelationService relationService,
    IFileSystem mediaFileSystem,
    int pageSize = 500) : IMediaLibraryReader
{
    /// <summary>What one pass gathers before the usage is counted.</summary>
    /// <param name="Id">The item's integer id.</param>
    /// <param name="Key">Its key.</param>
    /// <param name="Name">Its name.</param>
    /// <param name="ParentId">Its parent's id, the root's for a top-level item.</param>
    /// <param name="MediaTypeAlias">Its type's alias.</param>
    /// <param name="Extension">Its extension, when the item carries one.</param>
    /// <param name="SizeBytes">Its size, when the item carries one.</param>
    /// <param name="AncestorIds">The ids above it, root excluded.</param>
    private sealed record Entry(int Id, Guid Key, string Name, int ParentId, string MediaTypeAlias, string? Extension, long? SizeBytes, IReadOnlyList<int> AncestorIds);

    /// <inheritdoc />
    public Task<MediaLibrarySnapshot> ReadAsync(IProgress<MediaHealthProgress> progress, CancellationToken cancellationToken)
    {
        var entries = new Dictionary<int, Entry>();
        var folders = new List<int>();
        var items = new List<int>();
        var owned = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        ReadPages(cancellationToken, progress, media =>
        {
            foreach (var path in MediaFilePaths.Of(media))
            {
                owned.Add(MediaDiskScanner.Normalize(mediaFileSystem.GetRelativePath(path)));
            }

            if (media.Trashed)
            {
                return;
            }

            var entry = new Entry(
                media.Id,
                media.Key,
                media.Name ?? string.Empty,
                media.ParentId,
                media.ContentType.Alias,
                TextOf(media, Constants.Conventions.Media.Extension),
                long.TryParse(TextOf(media, Constants.Conventions.Media.Bytes), out var bytes) ? bytes : null,
                AncestorIdsOf(media));
            entries[media.Id] = entry;
            (IsFolder(media) ? folders : items).Add(media.Id);
        });

        var relations = relationService.GetByRelationTypeAlias(Constants.Conventions.RelationTypes.RelatedMediaAlias)
            .Select(relation => new MediaRelation(relation.ParentId, relation.ChildId));
        var usage = MediaUsageClassifier.Classify(items.Select(id => new MediaUsageSubject(id, entries[id].AncestorIds)).ToList(), relations);

        return Task.FromResult(new MediaLibrarySnapshot(
            folders.Select(id => entries[id]).Select(entry => new MediaHealthFolder(entry.Key, entry.Name, ParentKeyOf(entry, entries), PathOf(entry, entries, includeSelf: true))).ToList(),
            items.Select(id => entries[id]).Select(entry => new MediaHealthItem(
                entry.Key, entry.Name, entry.MediaTypeAlias, entry.Extension, entry.SizeBytes, ParentKeyOf(entry, entries), PathOf(entry, entries, includeSelf: false), usage[entry.Id])).ToList(),
            owned));
    }

    /// <inheritdoc />
    public Task<ISet<string>> ReadOwnedPathsAsync(CancellationToken cancellationToken)
    {
        var owned = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        ReadPages(cancellationToken, null, media =>
        {
            foreach (var path in MediaFilePaths.Of(media))
            {
                owned.Add(MediaDiskScanner.Normalize(mediaFileSystem.GetRelativePath(path)));
            }
        });
        return Task.FromResult<ISet<string>>(owned);
    }

    /// <summary>Every descendant of the root, a page at a time, trashed or not.</summary>
    /// <param name="cancellationToken">Stops the read.</param>
    /// <param name="progress">Told after each page, when given.</param>
    /// <param name="each">What to do with each item.</param>
    private void ReadPages(CancellationToken cancellationToken, IProgress<MediaHealthProgress>? progress, Action<IMedia> each)
    {
        long page = 0;
        long total;
        var seen = 0;
        do
        {
            cancellationToken.ThrowIfCancellationRequested();
            var items = mediaService.GetPagedDescendants(Constants.System.Root, page, pageSize, out total).ToList();
            foreach (var media in items)
            {
                each(media);
            }

            seen += items.Count;
            progress?.Report(new MediaHealthProgress((int)Math.Min(seen, total), (int)total));
            page++;
            if (items.Count == 0)
            {
                break;
            }
        }
        while (page * pageSize < total);
    }

    /// <summary>
    /// A property's value as text, from the item's properties rather than through <c>GetValue</c>,
    /// which is where the real item reads it from too; null when the property is missing or empty,
    /// as it is on an item a package installed without Umbraco's upload conventions.
    /// </summary>
    /// <param name="media">The item.</param>
    /// <param name="alias">The property.</param>
    /// <returns>The text, or null.</returns>
    private static string? TextOf(IMedia media, string alias)
    {
        var text = media.Properties.TryGetValue(alias, out var property) ? property?.GetValue()?.ToString() : null;
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    /// <summary>Whether an item is a folder: Umbraco's own Folder type, which is what the tree calls one.</summary>
    /// <param name="media">The item.</param>
    /// <returns>True for a folder.</returns>
    private static bool IsFolder(IMedia media) => media.ContentType.Alias == Constants.Conventions.MediaTypes.Folder;

    /// <summary>The ids on an item's path above it, root and itself excluded.</summary>
    /// <param name="media">The item.</param>
    /// <returns>The ids, root first.</returns>
    private static IReadOnlyList<int> AncestorIdsOf(IMedia media) =>
        media.Path.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => int.TryParse(part, out var id) ? id : Constants.System.Root)
            .Where(id => id != Constants.System.Root && id != media.Id)
            .ToList();

    /// <summary>The key of an entry's parent, or null at the root or when the parent is in the bin.</summary>
    /// <param name="entry">The entry.</param>
    /// <param name="entries">Every entry by id.</param>
    /// <returns>The key, or null.</returns>
    private static Guid? ParentKeyOf(Entry entry, IReadOnlyDictionary<int, Entry> entries) =>
        entries.TryGetValue(entry.ParentId, out var parent) ? parent.Key : null;

    /// <summary>An entry's names path, from the root down, with or without its own name.</summary>
    /// <param name="entry">The entry.</param>
    /// <param name="entries">Every entry by id.</param>
    /// <param name="includeSelf">Whether the entry's own name ends the path, as a folder's does.</param>
    /// <returns>The path, <c>/</c> for an item at the root.</returns>
    private static string PathOf(Entry entry, IReadOnlyDictionary<int, Entry> entries, bool includeSelf)
    {
        var names = entry.AncestorIds.Select(id => entries.TryGetValue(id, out var ancestor) ? ancestor.Name : $"#{id}").ToList();
        if (includeSelf)
        {
            names.Add(entry.Name);
        }

        return "/" + string.Join('/', names);
    }
}
