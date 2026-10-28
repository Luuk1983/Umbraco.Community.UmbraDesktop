using System.Runtime.CompilerServices;
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
/// <param name="timeProvider">The clock the heartbeat waits on; Umbraco's, so a test can move it.</param>
/// <param name="logger">Records a failure, which the window also shows.</param>
public sealed class MediaHealthRunner(
    MediaHealthStore store,
    IMediaLibraryReader library,
    IMediaDiskScanner disk,
    IBackgroundTaskQueue queue,
    TimeProvider timeProvider,
    ILogger<MediaHealthRunner> logger)
{
    /// <summary>
    /// How often a running check says it is still at work, whatever its phase: the disk walk reports
    /// nothing until it ends, so without a beat a long walk would look dead. Each beat also learns
    /// whether someone stopped the check, so a stop takes at most this long to reach the work.
    /// </summary>
    public static readonly TimeSpan HeartbeatEvery = TimeSpan.FromSeconds(20);

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
    /// <remarks>
    /// The work runs beside a heartbeat that keeps the check alive and cancels the work once the check
    /// is stopped. A stopped check ends quietly: it is not a failure, and nothing is saved.
    /// </remarks>
    public async Task RunAsync(int id, CancellationToken cancellationToken)
    {
        using var work = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var stopped = new StrongBox<bool>();
        var heartbeat = BeatAsync(id, work, stopped);
        try
        {
            var snapshot = await library.ReadAsync(new StoreProgress(store, id), work.Token);
            await store.ProgressAsync(id, MediaHealthPhase.Disk, 0, 0);
            var files = disk.Walk(work.Token);
            await store.ProgressAsync(id, MediaHealthPhase.Saving, files.Count, files.Count);
            await store.FinishAsync(id, new MediaHealthResult(snapshot.Folders, snapshot.Items, MediaDiskScanner.OrphansOf(files, snapshot.OwnedPaths)));
        }
        catch (OperationCanceledException) when (stopped.Value)
        {
            logger.LogInformation("Media Health check {Id} was stopped.", id);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Media Health check {Id} failed.", id);
            await store.FailAsync(id, exception.Message);
        }
        finally
        {
            await work.CancelAsync();
            await heartbeat;
        }
    }

    /// <summary>
    /// Beat every <see cref="HeartbeatEvery"/> until the work ends, and cancel the work when a beat
    /// finds the check is no longer running, which is what a stop looks like from here.
    /// </summary>
    /// <param name="id">The check.</param>
    /// <param name="work">The work's cancellation, cancelled by the work's end or by a stop.</param>
    /// <param name="stopped">Set when the beat cancelled the work, so the cancellation is not a failure.</param>
    /// <returns>When the beating has ended.</returns>
    private async Task BeatAsync(int id, CancellationTokenSource work, StrongBox<bool> stopped)
    {
        try
        {
            while (!work.IsCancellationRequested)
            {
                await Task.Delay(HeartbeatEvery, timeProvider, work.Token);
                if (!await store.TouchAsync(id))
                {
                    stopped.Value = true;
                    await work.CancelAsync();
                }
            }
        }
        catch (OperationCanceledException)
        {
            // The work ended or was stopped; either way there is nothing left to beat for.
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Media Health check {Id} could not beat.", id);
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
