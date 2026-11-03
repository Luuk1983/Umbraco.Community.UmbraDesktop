using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>Deletes orphaned files from the media folder.</summary>
public interface IMediaOrphanDeleter
{
    /// <summary>Delete the files, each checked again first.</summary>
    /// <param name="relativePaths">The files, as the last check listed them.</param>
    /// <param name="userKey">Who asked, for Umbraco's audit log.</param>
    /// <param name="cancellationToken">Stops the delete between files.</param>
    /// <returns>What went and what stayed.</returns>
    Task<MediaOrphanDeleteResult> DeleteAsync(IReadOnlyList<string> relativePaths, Guid userKey, CancellationToken cancellationToken);
}

/// <summary>
/// Deleting orphaned files (design §5, §15): what core has nothing for, since a file without an item
/// has no recycle bin.
/// </summary>
/// <remarks>
/// <para>
/// Each file is checked at the moment of deleting, against the library as it is now rather than as
/// the last check saw it: a file that is gone is skipped as not found, and one an item has claimed
/// since, by an upload or a restore from the bin, is skipped as owned now. The owned paths are read
/// once per delete, which is one pass over the library; a delete is rare and asked for, so that is
/// the right side of the trade.
/// </para>
/// <para>
/// A folder a delete leaves empty is removed, and its parent if that is empty then, never the media
/// root. Emptiness is checked rather than left to a non-recursive delete failing, since blob storage
/// deletes recursively whatever is asked.
/// </para>
/// <para>
/// One entry in Umbraco's audit log per delete, under the person who asked, naming the files: the
/// same log the Media section writes to, so there is no second log to look in.
/// </para>
/// </remarks>
/// <param name="fileSystem">The media file system.</param>
/// <param name="library">Reads what items own now.</param>
/// <param name="auditService">Umbraco's audit log.</param>
internal sealed class MediaOrphanDeleter(IFileSystem fileSystem, IMediaLibraryReader library, IAuditService auditService) : IMediaOrphanDeleter
{
    /// <summary>What the audit entry is filed under, since a file is no Umbraco entity.</summary>
    public const string AuditEntityType = "Media file";

    /// <inheritdoc />
    public async Task<MediaOrphanDeleteResult> DeleteAsync(IReadOnlyList<string> relativePaths, Guid userKey, CancellationToken cancellationToken)
    {
        if (relativePaths.Count == 0)
        {
            return new MediaOrphanDeleteResult([], []);
        }

        var owned = await library.ReadOwnedPathsAsync(cancellationToken);
        var deleted = new List<string>();
        var skipped = new List<MediaOrphanSkip>();
        long bytes = 0;
        foreach (var path in relativePaths.Select(MediaDiskScanner.Normalize))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!fileSystem.FileExists(path))
            {
                skipped.Add(new MediaOrphanSkip(path, MediaOrphanSkipReason.NotFound));
                continue;
            }

            if (owned.Contains(path))
            {
                skipped.Add(new MediaOrphanSkip(path, MediaOrphanSkipReason.NowOwned));
                continue;
            }

            bytes += fileSystem.GetSize(path);
            fileSystem.DeleteFile(path);
            deleted.Add(path);
        }

        RemoveEmptiedFolders(deleted);
        if (deleted.Count > 0)
        {
            await auditService.AddAsync(
                AuditType.Delete,
                userKey,
                Umbraco.Cms.Core.Constants.System.Root,
                AuditEntityType,
                "Media Health",
                $"Deleted {deleted.Count} orphaned media files ({bytes} bytes): {string.Join(", ", deleted)}");
        }

        return new MediaOrphanDeleteResult(deleted, skipped);
    }

    /// <summary>Remove each folder a deleted file was in once it is empty, then its parents while they are, never the root.</summary>
    /// <param name="deleted">The files deleted.</param>
    private void RemoveEmptiedFolders(IEnumerable<string> deleted)
    {
        var folders = deleted.Select(ParentOf).Where(folder => folder.Length > 0).Distinct().OrderByDescending(folder => folder.Count(c => c == '/'));
        foreach (var start in folders)
        {
            var folder = start;
            while (folder.Length > 0 && fileSystem.DirectoryExists(folder) && !fileSystem.GetFiles(folder).Any() && !fileSystem.GetDirectories(folder).Any())
            {
                fileSystem.DeleteDirectory(folder, false);
                folder = ParentOf(folder);
            }
        }
    }

    /// <summary>The folder a path is in; empty at the root.</summary>
    /// <param name="path">A normalised path.</param>
    /// <returns>The folder.</returns>
    private static string ParentOf(string path)
    {
        var slash = path.LastIndexOf('/');
        return slash < 0 ? string.Empty : path[..slash];
    }
}
