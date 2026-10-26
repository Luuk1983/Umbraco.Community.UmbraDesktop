using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.HostedServices;

namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>
/// One check from start to finish (design §15): the library read with progress, the disk walked,
/// the orphans worked out, and the result saved, on Umbraco's background queue so the request that
/// pressed Check returns at once and closing the window stops nothing.
/// </summary>
/// <remarks>
/// The usage pass comes before the disk pass, one after the other: the disk pass needs the owned
/// paths the usage pass gathers, and a check must not load the site twice over (design §2). Each
/// page of the library writes its progress, so any server answers the window's poll. A check that
/// throws is marked failed with the reason and never left at running.
/// </remarks>
/// <param name="store">Where the check and its result go.</param>
/// <param name="library">Reads the library.</param>
/// <param name="disk">Walks the media folder.</param>
/// <param name="queue">Umbraco's background queue.</param>
/// <param name="logger">Records a failure, which the window also shows.</param>
public sealed class MediaHealthRunner(
    MediaHealthStore store,
    IMediaLibraryReader library,
    IMediaDiskScanner disk,
    IBackgroundTaskQueue queue,
    ILogger<MediaHealthRunner> logger)
{
    /// <summary>Start a check, or join the one running.</summary>
    /// <param name="startedBy">Who pressed Check.</param>
    /// <returns>The check running.</returns>
    public async Task<MediaHealthCheck> StartAsync(Guid? startedBy)
    {
        var (started, check) = await store.TryStartAsync(startedBy);
        if (started)
        {
            queue.QueueBackgroundWorkItem(cancellationToken => RunAsync(check.Id, cancellationToken));
        }

        return check;
    }

    /// <summary>Run a check that has started.</summary>
    /// <param name="id">The check.</param>
    /// <param name="cancellationToken">Stops it, as the site shutting down does.</param>
    /// <returns>A task.</returns>
    public async Task RunAsync(int id, CancellationToken cancellationToken)
    {
        try
        {
            var snapshot = await library.ReadAsync(new StoreProgress(store, id), cancellationToken);
            await store.ProgressAsync(id, MediaHealthPhase.Disk, 0, 0);
            var files = disk.Walk(cancellationToken);
            await store.ProgressAsync(id, MediaHealthPhase.Saving, files.Count, files.Count);
            await store.FinishAsync(id, new MediaHealthResult(snapshot.Folders, snapshot.Items, MediaDiskScanner.OrphansOf(files, snapshot.OwnedPaths)));
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Media Health check {Id} failed.", id);
            await store.FailAsync(id, exception.Message);
        }
    }

    /// <summary>
    /// Writes each page's progress to the store as the reader reports it. The reader is synchronous
    /// underneath and runs on a background thread with no synchronization context, so waiting on the
    /// write here is a plain wait, not a deadlock.
    /// </summary>
    /// <param name="store">The store.</param>
    /// <param name="id">The check.</param>
    private sealed class StoreProgress(MediaHealthStore store, int id) : IProgress<MediaHealthProgress>
    {
        /// <inheritdoc />
        public void Report(MediaHealthProgress value) =>
            store.ProgressAsync(id, MediaHealthPhase.Usage, value.Scanned, value.Total).GetAwaiter().GetResult();
    }
}
