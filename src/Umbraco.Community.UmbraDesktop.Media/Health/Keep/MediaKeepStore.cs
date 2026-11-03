using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Umbraco.Community.UmbraDesktop.Media.Health.Data;

namespace Umbraco.Community.UmbraDesktop.Media.Health.Keep;

/// <summary>
/// Keeps (design §16.6): something marked as wanted, for the whole site, so it leaves the cleanup
/// lists until its time is up or what was kept is no longer what is there.
/// </summary>
/// <remarks>
/// <para>
/// One keep per thing: keeping again replaces it, whatever list it came from (plan Decision 6). A
/// keep's end is computed when read, against the clock and the last check, never stored (Decision 7):
/// an item's keep ends when its file's URL differs, an orphaned file's when its last-written time does.
/// </para>
/// <para>
/// The keeps are filtered in the browser, where the oversized list is decided (Decision 5). The one
/// server-side use is the orphan delete, which skips a file kept now (<see cref="ActiveOrphanPathsAsync"/>).
/// Keeps whose thing is gone are dropped when a check finishes (<see cref="PruneAsync"/>), inside its
/// transaction, so no read ever sees a keep of something the result no longer has.
/// </para>
/// </remarks>
/// <param name="database">The tables.</param>
/// <param name="timeProvider">The clock; Umbraco's, so a site's choice of clock is kept.</param>
public sealed class MediaKeepStore(IMediaHealthDatabase database, TimeProvider timeProvider)
{
    /// <summary>The longest note, the column's width; the API refuses a longer one rather than cutting it.</summary>
    public const int NoteLength = 500;

    /// <summary>The time now, as the rows store it.</summary>
    private DateTime Now => timeProvider.GetUtcNow().UtcDateTime;

    /// <summary>
    /// Keep things of the last check, replacing any keep each already has. Targets the last check did
    /// not find are skipped: only what the window was shown can be kept.
    /// </summary>
    /// <param name="keptFrom">The list they were kept from.</param>
    /// <param name="targets">Item keys or orphaned files' paths.</param>
    /// <param name="note">Why, or null; at most <see cref="NoteLength"/> characters.</param>
    /// <param name="duration">For how long.</param>
    /// <param name="by">Who keeps them.</param>
    /// <param name="byName">Their name.</param>
    /// <returns>The keeps made.</returns>
    public Task<IReadOnlyList<MediaKeep>> KeepAsync(MediaKeepKind keptFrom, IReadOnlyList<string> targets, string? note, MediaKeepDuration duration, Guid by, string byName) => database.RunAsync(async context =>
    {
        var lastId = await LastIdAsync(context);
        if (lastId is null || targets.Count == 0)
        {
            return (IReadOnlyList<MediaKeep>)[];
        }

        var found = await FingerprintsAsync(context, lastId.Value, targets);
        var keys = found.Keys.ToList();
        context.Keeps.RemoveRange(await context.Keeps.Where(keep => keys.Contains(keep.Target)).ToListAsync());

        var now = Now;
        var until = duration switch
        {
            MediaKeepDuration.ThreeMonths => now.AddMonths(3),
            MediaKeepDuration.Year => now.AddYears(1),
            _ => (DateTime?)null,
        };
        var trimmed = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        var rows = found.Select(target => new MediaHealthKeepEntity
        {
            Kind = keptFrom.ToString(), Target = target.Key, Fingerprint = target.Value, Note = trimmed is null ? null : Cut(trimmed, NoteLength),
            UntilUtc = until, KeptBy = by, KeptByName = Cut(byName, 255), KeptUtc = now,
        }).ToList();
        context.Keeps.AddRange(rows);
        await context.SaveChangesAsync();
        return (IReadOnlyList<MediaKeep>)rows.Select(row => Map(row, found[row.Target], now)).ToList();
    });

    /// <summary>Every keep, each with its end worked out against now and the last check.</summary>
    /// <returns>The keeps, newest first.</returns>
    public Task<IReadOnlyList<MediaKeep>> ListAsync() => database.RunAsync(ListInAsync);

    /// <summary>Stop keeping: the things come back to their lists at once.</summary>
    /// <param name="ids">The keeps.</param>
    /// <returns>A task.</returns>
    public Task StopAsync(IReadOnlyList<int> ids) => database.RunAsync(async context =>
    {
        var asked = ids.Distinct().ToList();
        var targets = await context.Keeps.Where(keep => asked.Contains(keep.Id)).Select(keep => keep.Target).ToListAsync();
        context.Keeps.RemoveRange(await context.Keeps.Where(keep => targets.Contains(keep.Target)).ToListAsync());
        await context.SaveChangesAsync();
        return true;
    });

    /// <summary>The orphaned files kept now, for the delete to skip (plan Review Focus 5).</summary>
    /// <returns>Their paths, compared without case, as the scan compares them.</returns>
    public Task<ISet<string>> ActiveOrphanPathsAsync() => database.RunAsync(async context =>
    {
        var keeps = await ListInAsync(context);
        return (ISet<string>)new HashSet<string>(
            keeps.Where(keep => keep.Ended is null && !IsItem(keep.Target)).Select(keep => keep.Target),
            StringComparer.OrdinalIgnoreCase);
    });

    /// <summary>
    /// Drop keeps whose thing is in neither the check's items nor its orphaned files (plan Decision 7).
    /// Called by <see cref="MediaHealthStore.FinishAsync"/> inside its own unit of work, so the result and
    /// the keeps change together.
    /// </summary>
    /// <param name="context">The tables, in the finishing check's transaction.</param>
    /// <param name="checkId">The check just finished.</param>
    /// <returns>A task.</returns>
    internal static async Task PruneAsync(MediaHealthDbContext context, int checkId)
    {
        var keeps = await context.Keeps.ToListAsync();
        if (keeps.Count == 0)
        {
            return;
        }

        var found = await FingerprintsAsync(context, checkId, keeps.Select(keep => keep.Target).Distinct().ToList());
        context.Keeps.RemoveRange(keeps.Where(keep => !found.ContainsKey(keep.Target)));
        await context.SaveChangesAsync();
    }

    /// <summary>Every keep with its end, inside a unit of work already open.</summary>
    /// <param name="context">The tables.</param>
    /// <returns>The keeps, newest first.</returns>
    private async Task<IReadOnlyList<MediaKeep>> ListInAsync(MediaHealthDbContext context)
    {
        var rows = await context.Keeps.OrderByDescending(keep => keep.KeptUtc).ThenByDescending(keep => keep.Id).ToListAsync();
        if (rows.Count == 0)
        {
            return [];
        }

        var lastId = await LastIdAsync(context);
        var now = Now;
        var found = lastId is null ? [] : await FingerprintsAsync(context, lastId.Value, rows.Select(row => row.Target).Distinct().ToList());
        return rows.Select(row => Map(row, found.TryGetValue(row.Target, out var fingerprint) ? fingerprint : row.Fingerprint, now)).ToList();
    }

    /// <summary>
    /// What a check says each target is now: an item's URL, an orphaned file's last-written time. A
    /// target the check does not have is left out, so the keys are also what can be kept.
    /// </summary>
    /// <param name="context">The tables.</param>
    /// <param name="checkId">The check.</param>
    /// <param name="targets">Item keys or orphaned files' paths, in any case or slash style.</param>
    /// <returns>Each target found, in its stored form, with its fingerprint.</returns>
    private static async Task<Dictionary<string, string?>> FingerprintsAsync(MediaHealthDbContext context, int checkId, IReadOnlyList<string> targets)
    {
        var found = new Dictionary<string, string?>(StringComparer.Ordinal);
        var keys = targets.Select(target => Guid.TryParse(target, out var key) ? key : (Guid?)null).OfType<Guid>().Distinct().ToList();
        if (keys.Count > 0)
        {
            foreach (var item in await context.Items.Where(item => item.CheckId == checkId && keys.Contains(item.Key)).Select(item => new { item.Key, item.Url }).ToListAsync())
            {
                found[item.Key.ToString("D")] = item.Url;
            }
        }

        var paths = targets.Where(target => !IsItem(target)).Select(MediaDiskScanner.Normalize).ToList();
        if (paths.Count > 0)
        {
            // Both cases asked for, since SQLite compares case-sensitively and the scan does not.
            var asked = paths.Concat(paths.Select(path => path.ToLowerInvariant())).Distinct().ToList();
            var wanted = new HashSet<string>(paths, StringComparer.OrdinalIgnoreCase);
            var orphans = await context.Orphans.Where(orphan => orphan.CheckId == checkId && asked.Contains(orphan.RelativePath)).ToListAsync();
            foreach (var orphan in orphans.Where(orphan => wanted.Contains(orphan.RelativePath)))
            {
                found[orphan.RelativePath] = Written(orphan.LastModifiedUtc);
            }
        }

        return found;
    }

    /// <summary>Whether a target names an item rather than an orphaned file: a key, where a path has slashes.</summary>
    /// <param name="target">The target.</param>
    /// <returns>True for an item.</returns>
    private static bool IsItem(string target) => Guid.TryParse(target, out _);

    /// <summary>An orphaned file's fingerprint: its last-written time as UTC in round-trip form.</summary>
    /// <param name="lastModified">The time as stored, without a kind.</param>
    /// <returns>The fingerprint.</returns>
    private static string Written(DateTime lastModified) =>
        DateTime.SpecifyKind(lastModified, DateTimeKind.Utc).ToString("O", CultureInfo.InvariantCulture);

    /// <summary>The id of the last check done, or null before the first.</summary>
    /// <param name="context">The tables.</param>
    /// <returns>The id, or null.</returns>
    private static async Task<int?> LastIdAsync(MediaHealthDbContext context) =>
        await context.Checks.Where(check => check.Phase == nameof(MediaHealthPhase.Done)).OrderByDescending(check => check.Id).Select(check => (int?)check.Id).FirstOrDefaultAsync();

    /// <summary>A row as the rest of the add-on reads it, its times marked UTC (§15) and its end worked out.</summary>
    /// <param name="row">The row.</param>
    /// <param name="current">What the last check says the target is now.</param>
    /// <param name="now">The time now.</param>
    /// <returns>The keep.</returns>
    private static MediaKeep Map(MediaHealthKeepEntity row, string? current, DateTime now)
    {
        DateTime? until = row.UntilUtc is null ? null : DateTime.SpecifyKind(row.UntilUtc.Value, DateTimeKind.Utc);
        MediaKeepEnd? ended = until is not null && now >= until ? MediaKeepEnd.Expired
            : !string.Equals(current, row.Fingerprint, StringComparison.Ordinal) ? MediaKeepEnd.Changed
            : null;
        return new MediaKeep(
            row.Id,
            Enum.TryParse<MediaKeepKind>(row.Kind, out var kind) ? kind : MediaKeepKind.Unused,
            row.Target,
            row.Note,
            until,
            row.KeptBy,
            row.KeptByName,
            DateTime.SpecifyKind(row.KeptUtc, DateTimeKind.Utc),
            ended);
    }

    /// <summary>Text cut to a column's width.</summary>
    /// <param name="text">The text.</param>
    /// <param name="max">The width.</param>
    /// <returns>The text, cut.</returns>
    private static string Cut(string text, int max) => text.Length <= max ? text : text[..max];
}
