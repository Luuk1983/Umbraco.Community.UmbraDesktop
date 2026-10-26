using Umbraco.Cms.Core.IO;

namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>Walks the media folder, wherever Umbraco keeps it.</summary>
public interface IMediaDiskScanner
{
    /// <summary>Every file in the media folder, at any depth.</summary>
    /// <param name="cancellationToken">Stops the walk.</param>
    /// <returns>The files, each as the orphan it would be.</returns>
    IReadOnlyList<MediaHealthOrphan> Walk(CancellationToken cancellationToken);
}

/// <summary>
/// The media folder on disk, through Umbraco's own media file system (design §15), so a site on
/// blob storage is walked the same way as one on disk.
/// </summary>
/// <remarks>
/// Umbraco's <see cref="IFileSystem"/> lists one folder at a time and never recurses, so the walk is
/// its own. Paths are normalised to forward slashes without a leading slash, which is how an item's
/// file path compares after <see cref="IFileSystem.GetRelativePath"/>.
/// </remarks>
/// <param name="fileSystem">The media file system.</param>
internal sealed class MediaDiskScanner(IFileSystem fileSystem) : IMediaDiskScanner
{
    /// <inheritdoc />
    public IReadOnlyList<MediaHealthOrphan> Walk(CancellationToken cancellationToken)
    {
        var files = new List<MediaHealthOrphan>();
        WalkFolder(string.Empty, files, cancellationToken);
        return files;
    }

    /// <summary>The files among <paramref name="files"/> that no item owns.</summary>
    /// <param name="files">Every file on disk.</param>
    /// <param name="ownedPaths">The relative path of every file an item owns, in any slash style or case.</param>
    /// <returns>The orphans, in the walk's order.</returns>
    public static IReadOnlyList<MediaHealthOrphan> OrphansOf(IReadOnlyList<MediaHealthOrphan> files, IEnumerable<string> ownedPaths)
    {
        var owned = new HashSet<string>(ownedPaths.Select(Normalize), StringComparer.OrdinalIgnoreCase);
        return files.Where(file => !owned.Contains(Normalize(file.RelativePath))).ToList();
    }

    /// <summary>A path as the scan compares it: forward slashes, no leading slash.</summary>
    /// <param name="path">The path, as stored or as listed.</param>
    /// <returns>The normalised path.</returns>
    public static string Normalize(string path) => path.Replace('\\', '/').TrimStart('/');

    /// <summary>One folder: its files, then its folders.</summary>
    /// <param name="folder">The folder, relative to the media root; empty for the root.</param>
    /// <param name="files">Where the files go.</param>
    /// <param name="cancellationToken">Stops the walk.</param>
    private void WalkFolder(string folder, List<MediaHealthOrphan> files, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        foreach (var file in fileSystem.GetFiles(folder))
        {
            files.Add(new MediaHealthOrphan(
                Normalize(file),
                fileSystem.GetUrl(file),
                fileSystem.GetSize(file),
                fileSystem.GetLastModified(file).UtcDateTime));
        }

        foreach (var child in fileSystem.GetDirectories(folder))
        {
            WalkFolder(child, files, cancellationToken);
        }
    }
}
