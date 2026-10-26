using Microsoft.EntityFrameworkCore;
using Umbraco.Community.UmbraDesktop.Media.Health.Data;

namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>
/// The last check, kept in the site's database (design §15), so a restart forgets nothing and every
/// server of a load-balanced site reads the same answer.
/// </summary>
/// <remarks>
/// <para>
/// One check runs at a time across the site: starting while one runs joins it. Its progress is
/// written as it goes, so the window can poll any server. A check whose server died would otherwise
/// block the next one for ever, so one that has said nothing for <see cref="StaleAfter"/> is given up
/// on and marked failed when the next start comes; progress counts as saying something.
/// </para>
/// <para>
/// A finished check replaces whatever came before it, rows and all, so the tables hold one library's
/// worth; a failed check keeps the last good one and is reported beside it until the next finishes.
/// </para>
/// </remarks>
/// <param name="database">The tables.</param>
/// <param name="timeProvider">The clock; Umbraco's, so a site's choice of clock is kept.</param>
public sealed class MediaHealthStore(IMediaHealthDatabase database, TimeProvider timeProvider)
{
    /// <summary>How long a running check may say nothing before the next start gives up on it.</summary>
    public static readonly TimeSpan StaleAfter = TimeSpan.FromHours(1);

    /// <summary>How many rows one insert takes at a time; a library of thousands goes in a few trips.</summary>
    private const int Batch = 500;

    /// <summary>The time now, as the rows store it.</summary>
    private DateTime Now => timeProvider.GetUtcNow().UtcDateTime;

    /// <summary>Start a check, or join the one running.</summary>
    /// <param name="startedBy">Who pressed Check.</param>
    /// <returns>Whether a new check started, and the check running either way.</returns>
    public Task<(bool Started, MediaHealthCheck Check)> TryStartAsync(Guid? startedBy) => database.RunAsync(async context =>
    {
        var now = Now;
        var running = await context.Checks.Where(check => check.Phase != nameof(MediaHealthPhase.Done) && check.Phase != nameof(MediaHealthPhase.Failed))
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
    /// <returns>A task.</returns>
    public Task ProgressAsync(int id, MediaHealthPhase phase, int scanned, int total) => database.RunAsync(async context =>
    {
        var check = await context.Checks.FindAsync(id);
        if (check is null || check.Phase is nameof(MediaHealthPhase.Done) or nameof(MediaHealthPhase.Failed))
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

    /// <summary>Finish a check with its result, which replaces every check before it.</summary>
    /// <param name="id">The check.</param>
    /// <param name="result">What it found.</param>
    /// <returns>A task.</returns>
    public Task FinishAsync(int id, MediaHealthResult result) => database.RunAsync(async context =>
    {
        var check = await context.Checks.FindAsync(id) ?? throw new InvalidOperationException($"Check {id} does not exist.");
        foreach (var batch in result.Items.Select(item => new MediaHealthItemEntity
        {
            CheckId = id, Key = item.Key, Name = Cut(item.Name, 255), MediaTypeAlias = Cut(item.MediaTypeAlias, 255), Extension = item.Extension is null ? null : Cut(item.Extension, 50),
            SizeBytes = item.SizeBytes, ParentKey = item.ParentKey, Path = Cut(item.Path, 4000), UsageCount = item.UsageCount,
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
            CheckId = id, RelativePath = Cut(orphan.RelativePath, 2000), Url = Cut(orphan.Url, 2000), SizeBytes = orphan.SizeBytes, LastModifiedUtc = orphan.LastModifiedUtc,
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
        return true;
    });

    /// <summary>Mark a check failed, keeping the last good one.</summary>
    /// <param name="id">The check.</param>
    /// <param name="error">Why.</param>
    /// <returns>A task.</returns>
    public Task FailAsync(int id, string error) => database.RunAsync(async context =>
    {
        var check = await context.Checks.FindAsync(id);
        if (check is null)
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

    /// <summary>The check running, the last one done, and a failure since.</summary>
    /// <returns>The status.</returns>
    public Task<MediaHealthStatus> GetStatusAsync() => database.RunAsync(async context =>
    {
        var now = Now;
        var checks = (await context.Checks.OrderByDescending(check => check.Id).Take(5).ToListAsync()).Select(Map).ToList();
        var running = checks.FirstOrDefault(check => check.IsRunning);
        var last = checks.FirstOrDefault(check => check.Phase == MediaHealthPhase.Done);
        var failed = checks.FirstOrDefault(check => check.Phase == MediaHealthPhase.Failed && (last is null || check.Id > last.Id));
        if (running is not null && now - TouchedOf(running, checks, context) > StaleAfter)
        {
            running = null;
        }

        return new MediaHealthStatus(running, last, failed);
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

        var rows = await context.Items.Where(item => item.CheckId == lastId)
            .OrderByDescending(item => item.SizeBytes ?? 0).ThenBy(item => item.Name).ThenBy(item => item.Id)
            .Skip(skip).Take(take).ToListAsync();
        return rows.Select(row => new MediaHealthItem(row.Key, row.Name, row.MediaTypeAlias, row.Extension, row.SizeBytes, row.ParentKey, row.Path, row.UsageCount)).ToList();
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

        check.Items = await context.Items.CountAsync(item => item.CheckId == id);
        check.SizeBytes = await context.Items.Where(item => item.CheckId == id).SumAsync(item => item.SizeBytes ?? 0);
        check.Orphans = await context.Orphans.CountAsync(orphan => orphan.CheckId == id);
        check.OrphanBytes = await context.Orphans.Where(orphan => orphan.CheckId == id).SumAsync(orphan => orphan.SizeBytes);
        await context.SaveChangesAsync();
    }

    /// <summary>When a check last said anything, from its row.</summary>
    /// <param name="check">The check.</param>
    /// <param name="checks">The checks read, for nothing; the row is read again.</param>
    /// <param name="context">The tables.</param>
    /// <returns>The time.</returns>
    private static DateTime TouchedOf(MediaHealthCheck check, IReadOnlyList<MediaHealthCheck> checks, MediaHealthDbContext context) =>
        context.Checks.Local.FirstOrDefault(row => row.Id == check.Id)?.TouchedUtc ?? check.StartedUtc;

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
