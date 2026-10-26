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

    /// <summary>A check nobody has touched for an hour was lost with its server; the next start replaces it.</summary>
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

    /// <summary>Progress keeps a long check alive: the hour counts from its last word, not its start.</summary>
    [Fact]
    public async Task Counts_staleness_from_the_last_progress()
    {
        var running = await _store.StartAsync(Editor);
        _time.Advance(TimeSpan.FromMinutes(50));
        await _store.ProgressAsync(running.Id, MediaHealthPhase.Disk, 10, 0);
        _time.Advance(TimeSpan.FromMinutes(50));

        var again = await _store.StartAsync(Editor);

        Assert.Equal(running.Id, again.Id);
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
