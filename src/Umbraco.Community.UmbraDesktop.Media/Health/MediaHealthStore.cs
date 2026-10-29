using Microsoft.EntityFrameworkCore;
using Umbraco.Community.UmbraDesktop.Media.Health.Data;

namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>
/// The last check, kept in the site's database (design §15), so a restart forgets nothing and every
/// server of a load-balanced site reads the same answer.
/// </summary>
/// <remarks>
/// <para>
/// One check runs at a time across the site: starting while one runs joins it, and two starts at once
/// on one server are taken one after the other. Its progress is written as it goes, so the window can
/// poll any server. A check whose server died would otherwise block the next one, so one that has
/// said nothing for <see cref="StaleAfter"/> is given up on; the runner beats every
/// <see cref="MediaHealthRunner.HeartbeatEvery"/> while it works, so silence that long means it is gone.
/// A check can also be stopped, which is not a failure: the last good result stands.
/// </para>
/// <para>
/// A finished check replaces whatever came before it, rows and all, so the tables hold one library's
/// worth; a failed check keeps the last good one and is reported beside it until the next finishes.
/// After a Clean up the stored result is brought in line with what Umbraco says about the items it
/// changed (<see cref="RefreshItemsAsync"/>), so the next person to open the window sees what is true.
/// </para>
/// </remarks>
/// <param name="database">The tables.</param>
/// <param name="timeProvider">The clock; Umbraco's, so a site's choice of clock is kept.</param>
public sealed class MediaHealthStore(IMediaHealthDatabase database, TimeProvider timeProvider)
{
    /// <summary>
    /// How long a running check may say nothing before it counts as dead: several missed heartbeats,
    /// so a slow database write never ends a live check, and minutes rather than the hour it was, so a
    /// restart mid-check does not leave the next press joining a check nobody runs.
    /// </summary>
    public static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(2);

    /// <summary>
    /// Takes the starts on this server one at a time, so two presses at once cannot both find nothing
    /// running and both insert a check. A store is a singleton, so this is one lock per server.
    /// </summary>
    private readonly SemaphoreSlim _starting = new(1, 1);

    /// <summary>The phases a check is running in, as the rows store them.</summary>
    private static readonly string[] RunningPhases = [nameof(MediaHealthPhase.Usage), nameof(MediaHealthPhase.Disk), nameof(MediaHealthPhase.Saving)];

    /// <summary>The width of a stored URL, an item's or an orphan's; a longer one is cut rather than failing the save.</summary>
    public const int UrlLength = 2000;

    /// <summary>How many rows one insert takes at a time; a library of thousands goes in a few trips.</summary>
    private const int Batch = 500;

    /// <summary>The time now, as the rows store it.</summary>
    private DateTime Now => timeProvider.GetUtcNow().UtcDateTime;

    /// <summary>Start a check, or join the one running.</summary>
    /// <param name="startedBy">Who pressed Check.</param>
    /// <returns>Whether a new check started, and the check running either way.</returns>
    public async Task<(bool Started, MediaHealthCheck Check)> TryStartAsync(Guid? startedBy)
    {
        await _starting.WaitAsync();
        try
        {
            return await StartOnceAsync(startedBy);
        }
        finally
        {
            _starting.Release();
        }
    }

    /// <summary>Start a check, or join the one running, with the start lock held.</summary>
    /// <param name="startedBy">Who pressed Check.</param>
    /// <returns>Whether a new check started, and the check running either way.</returns>
    private Task<(bool Started, MediaHealthCheck Check)> StartOnceAsync(Guid? startedBy) => database.RunAsync(async context =>
    {
        var now = Now;
        var running = await context.Checks.Where(check => RunningPhases.Contains(check.Phase))
            .OrderByDescending(check => check.Id).FirstOrDefaultAsync();
        if (running is not null)
        {
            if (now - running.TouchedUtc <= StaleAfter)
            {
                return (false, Map(running));
            }

            running.Phase = nameof(MediaHealthPhase.Failed);
            running.Error = "The check stopped reporting; the server it ran on may have restarted.";
            running.FinishedUtc = now;
            running.TouchedUtc = now;
        }

        var fresh = new MediaHealthCheckEntity { StartedUtc = now, TouchedUtc = now, Phase = nameof(MediaHealthPhase.Usage), StartedBy = startedBy };
        context.Checks.Add(fresh);
        await context.SaveChangesAsync();
        return (true, Map(fresh));
    });

    /// <summary>Start a check, or join the one running.</summary>
    /// <param name="startedBy">Who pressed Check.</param>
    /// <returns>The check running.</returns>
    public async Task<MediaHealthCheck> StartAsync(Guid? startedBy) => (await TryStartAsync(startedBy)).Check;

    /// <summary>Say where a check is.</summary>
    /// <param name="id">The check.</param>
    /// <param name="phase">Its phase now.</param>
    /// <param name="scanned">What the phase has done.</param>
    /// <param name="total">What it has to do; 0 when not known.</param>
    /// <returns>Whether the check is still running; false once it is stopped, failed or done.</returns>
    public Task<bool> ProgressAsync(int id, MediaHealthPhase phase, int scanned, int total) => database.RunAsync(async context =>
    {
        var check = await context.Checks.FindAsync(id);
        if (check is null || !RunningPhases.Contains(check.Phase))
        {
            return false;
        }

        check.Phase = phase.ToString();
        check.Scanned = scanned;
        check.Total = total;
        check.TouchedUtc = Now;
        await context.SaveChangesAsync();
        return true;
    });

    /// <summary>
    /// Finish a check with its result, which replaces every check before it. Keeps of things the result
    /// no longer has are dropped in the same unit of work (plan Decision 7).
    /// </summary>
    /// <param name="id">The check.</param>
    /// <param name="result">What it found.</param>
    /// <returns>Whether it was saved; false for a check stopped meanwhile, whose result is dropped.</returns>
    public Task<bool> FinishAsync(int id, MediaHealthResult result) => database.RunAsync(async context =>
    {
        var check = await context.Checks.FindAsync(id) ?? throw new InvalidOperationException($"Check {id} does not exist.");
        if (!RunningPhases.Contains(check.Phase))
        {
            return false;
        }

        foreach (var batch in result.Items.Select(item => new MediaHealthItemEntity
        {
            CheckId = id, Key = item.Key, Name = Cut(item.Name, 255), MediaTypeAlias = Cut(item.MediaTypeAlias, 255), Extension = item.Extension is null ? null : Cut(item.Extension, 50),
            SizeBytes = item.SizeBytes, ParentKey = item.ParentKey, Path = Cut(item.Path, 4000), UsageCount = item.UsageCount,
            Url = item.Url is null ? null : Cut(item.Url, UrlLength), Width = item.Width, Height = item.Height, UpdatedUtc = item.UpdatedUtc,
        }).Chunk(Batch))
        {
            context.Items.AddRange(batch);
            await context.SaveChangesAsync();
        }

        foreach (var batch in result.Folders.Select(folder => new MediaHealthFolderEntity
        {
            CheckId = id, Key = folder.Key, Name = Cut(folder.Name, 255), ParentKey = folder.ParentKey, Path = Cut(folder.Path, 4000),
        }).Chunk(Batch))
        {
            context.Folders.AddRange(batch);
            await context.SaveChangesAsync();
        }

        foreach (var batch in result.Orphans.Select(orphan => new MediaHealthOrphanEntity
        {
            CheckId = id, RelativePath = Cut(orphan.RelativePath, UrlLength), Url = Cut(orphan.Url, UrlLength), SizeBytes = orphan.SizeBytes, LastModifiedUtc = orphan.LastModifiedUtc,
        }).Chunk(Batch))
        {
            context.Orphans.AddRange(batch);
            await context.SaveChangesAsync();
        }

        var now = Now;
        check.Phase = nameof(MediaHealthPhase.Done);
        check.FinishedUtc = now;
        check.TouchedUtc = now;
        check.Scanned = result.Items.Count;
        check.Total = result.Items.Count;
        check.Items = result.Items.Count;
        check.Folders = result.Folders.Count;
        check.Orphans = result.Orphans.Count;
        check.SizeBytes = result.Items.Sum(item => item.SizeBytes ?? 0);
        check.OrphanBytes = result.Orphans.Sum(orphan => orphan.SizeBytes);
        await context.Items.Where(item => item.CheckId != id).ExecuteDeleteAsync();
        await context.Folders.Where(folder => folder.CheckId != id).ExecuteDeleteAsync();
        await context.Orphans.Where(orphan => orphan.CheckId != id).ExecuteDeleteAsync();
        await context.Checks.Where(other => other.Id != id).ExecuteDeleteAsync();
        await context.SaveChangesAsync();
        await Keep.MediaKeepStore.PruneAsync(context, id);
        return true;
    });

    /// <summary>Mark a check failed, keeping the last good one.</summary>
    /// <param name="id">The check.</param>
    /// <param name="error">Why.</param>
    /// <returns>Whether it was marked; a stopped check stays stopped.</returns>
    public Task<bool> FailAsync(int id, string error) => database.RunAsync(async context =>
    {
        var check = await context.Checks.FindAsync(id);
        if (check is null || !RunningPhases.Contains(check.Phase))
        {
            return false;
        }

        var now = Now;
        check.Phase = nameof(MediaHealthPhase.Failed);
        check.Error = Cut(error, 2000);
        check.FinishedUtc = now;
        check.TouchedUtc = now;
        await context.SaveChangesAsync();
        return true;
    });

    /// <summary>
    /// Say a running check is still at work, the runner's heartbeat, and learn whether it should go on.
    /// </summary>
    /// <param name="id">The check.</param>
    /// <returns>Whether it is still running; false once someone stopped it, or it ended.</returns>
    public Task<bool> TouchAsync(int id) => database.RunAsync(async context =>
    {
        var check = await context.Checks.FindAsync(id);
        if (check is null || !RunningPhases.Contains(check.Phase))
        {
            return false;
        }

        check.TouchedUtc = Now;
        await context.SaveChangesAsync();
        return true;
    });

    /// <summary>
    /// Stop the running check. Its runner learns at its next heartbeat and drops its work; until then
    /// any progress or finish it reports is refused.
    /// </summary>
    /// <returns>Whether there was a check to stop.</returns>
    public Task<bool> StopAsync() => database.RunAsync(async context =>
    {
        var running = await context.Checks.Where(check => RunningPhases.Contains(check.Phase)).ToListAsync();
        if (running.Count == 0)
        {
            return false;
        }

        var now = Now;
        foreach (var check in running)
        {
            check.Phase = nameof(MediaHealthPhase.Stopped);
            check.FinishedUtc = now;
            check.TouchedUtc = now;
        }

        await context.SaveChangesAsync();
        return true;
    });

    /// <summary>
    /// The check running, the last one done, and a failure since. Each is its own read, so a run of
    /// stopped checks can never push the last good one out of sight.
    /// </summary>
    /// <returns>The status.</returns>
    public Task<MediaHealthStatus> GetStatusAsync() => database.RunAsync(async context =>
    {
        var runningRow = await context.Checks.Where(check => RunningPhases.Contains(check.Phase)).OrderByDescending(check => check.Id).FirstOrDefaultAsync();
        var lastRow = await context.Checks.Where(check => check.Phase == nameof(MediaHealthPhase.Done)).OrderByDescending(check => check.Id).FirstOrDefaultAsync();
        var lastId = lastRow?.Id ?? 0;
        var failedRow = await context.Checks.Where(check => check.Phase == nameof(MediaHealthPhase.Failed) && check.Id > lastId).OrderByDescending(check => check.Id).FirstOrDefaultAsync();
        var alive = runningRow is not null && Now - runningRow.TouchedUtc <= StaleAfter;
        return new MediaHealthStatus(alive ? Map(runningRow!) : null, lastRow is null ? null : Map(lastRow), failedRow is null ? null : Map(failedRow));
    });

    /// <summary>The last check's items, largest first, then by name.</summary>
    /// <param name="skip">How many to skip.</param>
    /// <param name="take">How many to take.</param>
    /// <returns>The page.</returns>
    public Task<IReadOnlyList<MediaHealthItem>> GetItemsAsync(int skip, int take) => database.RunAsync(async context =>
    {
        var lastId = await LastIdAsync(context);
        if (lastId is null)
        {
            return (IReadOnlyList<MediaHealthItem>)[];
        }

        var rows = await context.Items.Where(item => item.CheckId == lastId && !item.Trashed)
            .OrderByDescending(item => item.SizeBytes ?? 0).ThenBy(item => item.Name).ThenBy(item => item.Id)
            .Skip(skip).Take(take).ToListAsync();
        return rows.Select(row => new MediaHealthItem(
            row.Key, row.Name, row.MediaTypeAlias, row.Extension, row.SizeBytes, row.ParentKey, row.Path, row.UsageCount,
            row.Url, row.Width, row.Height, DateTime.SpecifyKind(row.UpdatedUtc, DateTimeKind.Utc))).ToList();
    });

    /// <summary>The last check's folders.</summary>
    /// <returns>The folders.</returns>
    public Task<IReadOnlyList<MediaHealthFolder>> GetFoldersAsync() => database.RunAsync(async context =>
    {
        var lastId = await LastIdAsync(context);
        var rows = lastId is null ? [] : await context.Folders.Where(folder => folder.CheckId == lastId).OrderBy(folder => folder.Path).ToListAsync();
        return (IReadOnlyList<MediaHealthFolder>)rows.Select(row => new MediaHealthFolder(row.Key, row.Name, row.ParentKey, row.Path)).ToList();
    });

    /// <summary>The last check's orphaned files, largest first.</summary>
    /// <returns>The files.</returns>
    public Task<IReadOnlyList<MediaHealthOrphan>> GetOrphansAsync() => database.RunAsync(async context =>
    {
        var lastId = await LastIdAsync(context);
        var rows = lastId is null ? [] : await context.Orphans.Where(orphan => orphan.CheckId == lastId).OrderByDescending(orphan => orphan.SizeBytes).ThenBy(orphan => orphan.RelativePath).ToListAsync();
        return (IReadOnlyList<MediaHealthOrphan>)rows.Select(row => new MediaHealthOrphan(row.RelativePath, row.Url, row.SizeBytes, DateTime.SpecifyKind(row.LastModifiedUtc, DateTimeKind.Utc))).ToList();
    });

    /// <summary>
    /// Which of some URLs are orphaned files of the last check: the only pictures Media Health signs
    /// itself. An item's picture is signed by core's imaging route, which also checks the person may
    /// see the item (design §16.7).
    /// </summary>
    /// <param name="urls">The URLs asked about.</param>
    /// <returns>Those the last check lists as orphaned, compared exactly, as stored.</returns>
    public Task<ISet<string>> KnownOrphanUrlsAsync(IReadOnlyList<string> urls) => database.RunAsync(async context =>
    {
        var lastId = await LastIdAsync(context);
        var known = new HashSet<string>(StringComparer.Ordinal);
        if (lastId is null || urls.Count == 0)
        {
            return (ISet<string>)known;
        }

        var asked = urls.Distinct().ToList();
        known.UnionWith(await context.Orphans.Where(orphan => orphan.CheckId == lastId && asked.Contains(orphan.Url)).Select(orphan => orphan.Url).ToListAsync());
        return (ISet<string>)known;
    });

    /// <summary>Drop orphaned files that were deleted from the last result, and count again.</summary>
    /// <param name="relativePaths">The files, in any slash style or case.</param>
    /// <returns>A task.</returns>
    public Task RemoveOrphansAsync(IReadOnlyList<string> relativePaths) => database.RunAsync(async context =>
    {
        var lastId = await LastIdAsync(context);
        if (lastId is null)
        {
            return false;
        }

        var gone = new HashSet<string>(relativePaths.Select(MediaDiskScanner.Normalize), StringComparer.OrdinalIgnoreCase);
        var rows = await context.Orphans.Where(orphan => orphan.CheckId == lastId).ToListAsync();
        context.Orphans.RemoveRange(rows.Where(row => gone.Contains(row.RelativePath)));
        await context.SaveChangesAsync();
        await RecountAsync(context, lastId.Value);
        return true;
    });

    /// <summary>
    /// Bring the last result in line with what Umbraco says about some items now (design §16.12): one
    /// trashed leaves the reads, one restored comes back with the folder and usage the check saw, a new
    /// size or file is taken, and one deleted for good is dropped. Keys the result never had are left
    /// out, so this never adds to a check, only follows it.
    /// </summary>
    /// <param name="states">The items as Umbraco has them now.</param>
    /// <returns>A task.</returns>
    public Task RefreshItemsAsync(IReadOnlyList<MediaHealthItemState> states) => database.RunAsync(async context =>
    {
        var lastId = await LastIdAsync(context);
        if (lastId is null || states.Count == 0)
        {
            return false;
        }

        var byKey = states.GroupBy(state => state.Key).ToDictionary(group => group.Key, group => group.Last());
        var keys = byKey.Keys.ToList();
        var rows = await context.Items.Where(item => item.CheckId == lastId && keys.Contains(item.Key)).ToListAsync();
        foreach (var row in rows)
        {
            var state = byKey[row.Key];
            if (!state.Exists)
            {
                context.Items.Remove(row);
                continue;
            }

            row.Trashed = state.Trashed;
            if (!state.Trashed)
            {
                row.SizeBytes = state.SizeBytes;
                row.Url = state.Url is null ? null : Cut(state.Url, UrlLength);
                row.Width = state.Width;
                row.Height = state.Height;
                row.UpdatedUtc = state.UpdatedUtc;
            }
        }

        await context.SaveChangesAsync();
        await RecountAsync(context, lastId.Value);
        return true;
    });

    /// <summary>The id of the last check done, or null before the first.</summary>
    /// <param name="context">The tables.</param>
    /// <returns>The id, or null.</returns>
    private static async Task<int?> LastIdAsync(MediaHealthDbContext context) =>
        await context.Checks.Where(check => check.Phase == nameof(MediaHealthPhase.Done)).OrderByDescending(check => check.Id).Select(check => (int?)check.Id).FirstOrDefaultAsync();

    /// <summary>Bring a check's counts in line with its rows after some were removed.</summary>
    /// <param name="context">The tables.</param>
    /// <param name="id">The check.</param>
    /// <returns>A task.</returns>
    private static async Task RecountAsync(MediaHealthDbContext context, int id)
    {
        var check = await context.Checks.FindAsync(id);
        if (check is null)
        {
            return;
        }

        check.Items = await context.Items.CountAsync(item => item.CheckId == id && !item.Trashed);
        check.SizeBytes = await context.Items.Where(item => item.CheckId == id && !item.Trashed).SumAsync(item => item.SizeBytes ?? 0);
        check.Orphans = await context.Orphans.CountAsync(orphan => orphan.CheckId == id);
        check.OrphanBytes = await context.Orphans.Where(orphan => orphan.CheckId == id).SumAsync(orphan => orphan.SizeBytes);
        await context.SaveChangesAsync();
    }

    /// <summary>
    /// A row as the rest of the add-on reads it. The times are marked UTC on the way out: neither
    /// provider keeps a kind, and a time without one is serialised without its Z and read as local
    /// time by the browser, an hour off on the first real run.
    /// </summary>
    /// <param name="row">The row.</param>
    /// <returns>The check.</returns>
    private static MediaHealthCheck Map(MediaHealthCheckEntity row) => new(
        row.Id,
        DateTime.SpecifyKind(row.StartedUtc, DateTimeKind.Utc),
        row.FinishedUtc is null ? null : DateTime.SpecifyKind(row.FinishedUtc.Value, DateTimeKind.Utc),
        Enum.TryParse<MediaHealthPhase>(row.Phase, out var phase) ? phase : MediaHealthPhase.Failed,
        row.Scanned,
        row.Total,
        row.Error,
        row.StartedBy,
        row.Items,
        row.Folders,
        row.Orphans,
        row.SizeBytes,
        row.OrphanBytes);

    /// <summary>Text cut to a column's width, so one long name never fails a whole check's save.</summary>
    /// <param name="text">The text.</param>
    /// <param name="max">The width.</param>
    /// <returns>The text, cut.</returns>
    private static string Cut(string text, int max) => text.Length <= max ? text : text[..max];
}
