using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Media.Health;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>
/// The last check, kept in the site's database (design §15): one check runs at a time across every
/// server, its progress is readable from any of them, a finished check replaces the one before it,
/// and a check a server died on does not block the next one for ever.
/// </summary>
public class MediaHealthStoreTests : IAsyncLifetime
{
    /// <summary>Who starts the checks.</summary>
    private static readonly Guid Editor = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000001");

    /// <summary>A folder and two items in it, one used, and one orphaned file.</summary>
    private static readonly Guid FolderKey = Guid.Parse("f0000000-0000-0000-0000-000000000001");

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The clock.</summary>
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 26, 15, 0, 0, TimeSpan.Zero));

    /// <summary>The store under test.</summary>
    private MediaHealthStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new MediaHealthStore(_database, _time);
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>A finished check's worth of results.</summary>
    /// <param name="size">The used item's size, so two results can differ.</param>
    /// <returns>The result.</returns>
    private static MediaHealthResult Result(long size = 3_000_000) => new(
        [new MediaHealthFolder(FolderKey, "Products", null, "/Products")],
        [
            new MediaHealthItem(Guid.NewGuid(), "Hero", "Image", "jpg", size, FolderKey, "/Products", 2),
            new MediaHealthItem(Guid.NewGuid(), "Old", "Image", "png", 500, FolderKey, "/Products", 0),
            new MediaHealthItem(Guid.NewGuid(), "Notes", "File", null, null, null, "/", 0),
        ],
        [new MediaHealthOrphan("abc/old.jpg", "/media/abc/old.jpg", 700, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc))]);

    /// <summary>Nothing has run: no status at all.</summary>
    [Fact]
    public async Task Starts_with_no_check()
    {
        var status = await _store.GetStatusAsync();

        Assert.Null(status.Running);
        Assert.Null(status.Last);
        Assert.Empty(await _store.GetItemsAsync(0, 10));
    }

    /// <summary>Starting a check records who and when, and starting again while it runs returns the same check.</summary>
    [Fact]
    public async Task Starts_one_check_at_a_time()
    {
        var first = await _store.StartAsync(Editor);
        var again = await _store.StartAsync(Editor);

        Assert.Equal(first.Id, again.Id);
        Assert.Equal(MediaHealthPhase.Usage, first.Phase);
        Assert.Equal(_time.GetUtcNow().UtcDateTime, first.StartedUtc);
        Assert.Equal(Editor, first.StartedBy);
        var status = await _store.GetStatusAsync();
        Assert.Equal(first.Id, status.Running?.Id);
        Assert.Null(status.Last);
    }

    /// <summary>Progress is written so any server can report it, and read back with the status.</summary>
    [Fact]
    public async Task Reports_progress()
    {
        var check = await _store.StartAsync(Editor);

        await _store.ProgressAsync(check.Id, MediaHealthPhase.Usage, 412, 1284);
        var status = await _store.GetStatusAsync();

        Assert.Equal((412, 1284), (status.Running!.Scanned, status.Running.Total));
        Assert.Equal(MediaHealthPhase.Usage, status.Running.Phase);
    }

    /// <summary>A finished check becomes the last one, with its counts, and its rows are readable largest first.</summary>
    [Fact]
    public async Task Finishes_with_the_result_readable()
    {
        var check = await _store.StartAsync(Editor);
        _time.Advance(TimeSpan.FromSeconds(4));

        await _store.FinishAsync(check.Id, Result());
        var status = await _store.GetStatusAsync();

        Assert.Null(status.Running);
        var last = status.Last!;
        Assert.Equal(MediaHealthPhase.Done, last.Phase);
        Assert.Equal(_time.GetUtcNow().UtcDateTime, last.FinishedUtc);
        // The database keeps no kind, and a time without one is serialised without its Z and read as local in the browser.
        Assert.Equal(DateTimeKind.Utc, last.StartedUtc.Kind);
        Assert.Equal(DateTimeKind.Utc, last.FinishedUtc!.Value.Kind);
        Assert.Equal((3, 1, 1), (last.Items, last.Folders, last.Orphans));
        Assert.Equal(3_000_500, last.SizeBytes);
        Assert.Equal(700, last.OrphanBytes);
        var items = await _store.GetItemsAsync(0, 2);
        Assert.Equal(["Hero", "Old"], items.Select(item => item.Name));
        Assert.Equal(2, items[0].UsageCount);
        Assert.True(items[0].Used);
        Assert.Equal(FolderKey, items[0].ParentKey);
        Assert.Equal(["Notes"], (await _store.GetItemsAsync(2, 2)).Select(item => item.Name));
        Assert.Equal(["Products"], (await _store.GetFoldersAsync()).Select(folder => folder.Name));
        var orphan = Assert.Single(await _store.GetOrphansAsync());
        Assert.Equal(("abc/old.jpg", DateTimeKind.Utc), (orphan.RelativePath, orphan.LastModifiedUtc.Kind));
    }

    /// <summary>A new finished check replaces the old one and its rows; while it runs the old one still answers.</summary>
    [Fact]
    public async Task Replaces_the_previous_check_when_the_next_finishes()
    {
        var first = await _store.StartAsync(Editor);
        await _store.FinishAsync(first.Id, Result(3_000_000));
        var second = await _store.StartAsync(Editor);

        var during = await _store.GetStatusAsync();
        Assert.Equal(first.Id, during.Last?.Id);
        Assert.Equal(second.Id, during.Running?.Id);

        await _store.FinishAsync(second.Id, Result(4_000_000));
        var after = await _store.GetStatusAsync();
        Assert.Equal(second.Id, after.Last?.Id);
        Assert.Equal(4_000_500, after.Last!.SizeBytes);
        Assert.Equal(3, (await _store.GetItemsAsync(0, 100)).Count);
        Assert.Equal(1, await _database.RunAsync(context => Task.FromResult(context.Checks.Count())));
    }

    /// <summary>A check that failed says so and keeps the last good one.</summary>
    [Fact]
    public async Task Keeps_the_last_good_check_when_the_next_fails()
    {
        var first = await _store.StartAsync(Editor);
        await _store.FinishAsync(first.Id, Result());
        var second = await _store.StartAsync(Editor);

        await _store.FailAsync(second.Id, "The disk went away");
        var status = await _store.GetStatusAsync();

        Assert.Null(status.Running);
        Assert.Equal(first.Id, status.Last?.Id);
        Assert.Equal("The disk went away", status.Failed?.Error);
        Assert.Equal(3, (await _store.GetItemsAsync(0, 100)).Count);
    }

    /// <summary>
    /// Two presses at the same moment start one check, not two: the look for a running check and the
    /// insert of a new one happen as one step.
    /// </summary>
    [Fact]
    public async Task Starts_one_check_when_pressed_at_once()
    {
        var starts = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Task.Run(() => _store.TryStartAsync(Editor))));

        Assert.Single(starts, start => start.Started);
        Assert.Single(starts.Select(start => start.Check.Id).Distinct());
    }

    /// <summary>
    /// A check that has said nothing for a few minutes is dead: the runner beats every
    /// <see cref="MediaHealthRunner.HeartbeatEvery"/> while it works, so silence for several beats
    /// means its server went away, and the next press must not join it for an hour.
    /// </summary>
    [Fact]
    public async Task Gives_up_on_a_silent_check_within_minutes()
    {
        Assert.True(MediaHealthStore.StaleAfter <= TimeSpan.FromMinutes(5));
        Assert.True(MediaHealthStore.StaleAfter >= MediaHealthRunner.HeartbeatEvery * 4, "several beats may be missed before a check is given up");
        var lost = await _store.StartAsync(Editor);
        _time.Advance(MediaHealthStore.StaleAfter + TimeSpan.FromSeconds(1));

        Assert.Null((await _store.GetStatusAsync()).Running);
        Assert.NotEqual(lost.Id, (await _store.StartAsync(Editor)).Id);
    }

    /// <summary>A beat keeps a running check alive, and says whether it should go on.</summary>
    [Fact]
    public async Task A_beat_keeps_a_check_alive()
    {
        var running = await _store.StartAsync(Editor);
        _time.Advance(MediaHealthStore.StaleAfter - TimeSpan.FromSeconds(10));
        Assert.True(await _store.TouchAsync(running.Id));
        _time.Advance(TimeSpan.FromSeconds(30));

        Assert.Equal(running.Id, (await _store.GetStatusAsync()).Running?.Id);
    }

    /// <summary>
    /// Stop ends the running check without a failure: the window goes back to the last result, and a
    /// beat, progress or a finish that comes after it changes nothing.
    /// </summary>
    [Fact]
    public async Task Stops_the_running_check_and_keeps_the_last_result()
    {
        var first = await _store.StartAsync(Editor);
        await _store.FinishAsync(first.Id, Result());
        var running = await _store.StartAsync(Editor);

        Assert.True(await _store.StopAsync());

        var status = await _store.GetStatusAsync();
        Assert.Null(status.Running);
        Assert.Null(status.Failed);
        Assert.Equal(first.Id, status.Last?.Id);
        Assert.False(await _store.TouchAsync(running.Id));
        Assert.False(await _store.ProgressAsync(running.Id, MediaHealthPhase.Disk, 1, 1));
        Assert.False(await _store.FinishAsync(running.Id, Result(9)));
        Assert.Equal(first.Id, (await _store.GetStatusAsync()).Last?.Id);
        Assert.False(await _store.StopAsync());
    }

    /// <summary>
    /// The stored result follows a Clean up (design §16.12): an item trashed leaves it, one restored
    /// comes back with its facts, a new size is taken, one deleted for good is dropped, and the totals
    /// follow. A key the result never had is not added.
    /// </summary>
    [Fact]
    public async Task Follows_items_trashed_restored_resized_and_deleted()
    {
        var check = await _store.StartAsync(Editor);
        await _store.FinishAsync(check.Id, Result());
        var items = await _store.GetItemsAsync(0, 10);
        var hero = items.Single(item => item.Name == "Hero");
        var old = items.Single(item => item.Name == "Old");
        var notes = items.Single(item => item.Name == "Notes");
        var when = new DateTime(2026, 10, 28, 9, 0, 0, DateTimeKind.Utc);

        await _store.RefreshItemsAsync([
            new MediaHealthItemState(old.Key, Exists: true, Trashed: true, 500, old.Url, null, null, when),
            new MediaHealthItemState(hero.Key, Exists: true, Trashed: false, 800_000, "/media/x/hero.webp", 10, 20, when),
            new MediaHealthItemState(notes.Key, Exists: false, Trashed: false, null, null, null, null, when),
            new MediaHealthItemState(Guid.NewGuid(), Exists: true, Trashed: false, 1, null, null, null, when),
        ]);

        var after = await _store.GetItemsAsync(0, 10);
        Assert.Equal(["Hero"], after.Select(item => item.Name));
        Assert.Equal((800_000L, "/media/x/hero.webp", (int?)10, (int?)20, when), (after[0].SizeBytes!.Value, after[0].Url, after[0].Width, after[0].Height, after[0].UpdatedUtc));
        Assert.Equal((1, 800_000L), ((await _store.GetStatusAsync()).Last!.Items, (await _store.GetStatusAsync()).Last!.SizeBytes));

        await _store.RefreshItemsAsync([new MediaHealthItemState(old.Key, Exists: true, Trashed: false, 500, old.Url, null, null, when)]);

        var back = await _store.GetItemsAsync(0, 10);
        Assert.Equal(["Hero", "Old"], back.Select(item => item.Name));
        Assert.Equal(("/Products", 0), (back[1].Path, back[1].UsageCount));
        Assert.Equal(2, (await _store.GetStatusAsync()).Last!.Items);
    }

    /// <summary>A check nobody has touched for too long was lost with its server; the next start replaces it.</summary>
    [Fact]
    public async Task Gives_up_on_a_check_left_running_too_long()
    {
        var lost = await _store.StartAsync(Editor);
        _time.Advance(MediaHealthStore.StaleAfter + TimeSpan.FromMinutes(1));

        var fresh = await _store.StartAsync(Editor);

        Assert.NotEqual(lost.Id, fresh.Id);
        var status = await _store.GetStatusAsync();
        Assert.Equal(fresh.Id, status.Running?.Id);
        Assert.Equal(MediaHealthPhase.Failed, status.Failed?.Phase);
    }

    /// <summary>Progress keeps a long check alive: the silence counts from its last word, not its start.</summary>
    [Fact]
    public async Task Counts_staleness_from_the_last_progress()
    {
        var running = await _store.StartAsync(Editor);
        _time.Advance(MediaHealthStore.StaleAfter * 0.8);
        await _store.ProgressAsync(running.Id, MediaHealthPhase.Disk, 10, 0);
        _time.Advance(MediaHealthStore.StaleAfter * 0.8);

        var again = await _store.StartAsync(Editor);

        Assert.Equal(running.Id, again.Id);
    }

    /// <summary>
    /// The facts the preview and thumbnails need (design §16.7) survive the database: URL, size in
    /// pixels and last change, the time marked UTC, and a URL longer than its column cut rather than
    /// failing the whole save.
    /// </summary>
    [Fact]
    public async Task Round_trips_the_item_facts()
    {
        var updated = new DateTime(2023, 3, 14, 9, 30, 0, DateTimeKind.Utc);
        var longUrl = "/media/" + new string('x', 2001 - "/media/".Length);
        var check = await _store.StartAsync(Editor);
        await _store.FinishAsync(check.Id, new MediaHealthResult(
            [],
            [
                new MediaHealthItem(Guid.NewGuid(), "Hero", "Image", "jpg", 900, null, "/", 0, "/media/a1/hero.jpg", 5472, 3648, updated),
                new MediaHealthItem(Guid.NewGuid(), "Long", "Image", "jpg", 100, null, "/", 0, longUrl, null, null, updated),
            ],
            []));

        var items = await _store.GetItemsAsync(0, 10);

        Assert.Equal(("/media/a1/hero.jpg", (int?)5472, (int?)3648, updated), (items[0].Url, items[0].Width, items[0].Height, items[0].UpdatedUtc));
        Assert.Equal(DateTimeKind.Utc, items[0].UpdatedUtc.Kind);
        Assert.Equal(2000, items[1].Url!.Length);
        Assert.Null(items[1].Width);
    }

    /// <summary>
    /// Only the last check's orphaned files are Media Health's to sign thumbnails for: an item's picture
    /// is signed by core's own imaging route, which also checks the person may see the item (§16.7).
    /// </summary>
    [Fact]
    public async Task Knows_only_the_last_checks_orphan_urls()
    {
        var check = await _store.StartAsync(Editor);
        await _store.FinishAsync(check.Id, new MediaHealthResult(
            [],
            [new MediaHealthItem(Guid.NewGuid(), "Hero", "Image", "jpg", 900, null, "/", 0, "/media/a1/hero.jpg")],
            [new MediaHealthOrphan("b2/old.png", "/media/b2/old.png", 5, DateTime.UnixEpoch)]));

        var known = await _store.KnownOrphanUrlsAsync(["/media/a1/hero.jpg", "/media/b2/old.png", "/media/c3/other.jpg"]);

        Assert.Equal(["/media/b2/old.png"], known.Order());
    }

    /// <summary>Deleted orphans leave the result, so the window follows without another check.</summary>
    [Fact]
    public async Task Removes_deleted_orphans_from_the_result()
    {
        var check = await _store.StartAsync(Editor);
        await _store.FinishAsync(check.Id, Result());

        await _store.RemoveOrphansAsync(["ABC/old.jpg"]);

        Assert.Empty(await _store.GetOrphansAsync());
        Assert.Equal((0, 0L), ((await _store.GetStatusAsync()).Last!.Orphans, (await _store.GetStatusAsync()).Last!.OrphanBytes));
    }

}
