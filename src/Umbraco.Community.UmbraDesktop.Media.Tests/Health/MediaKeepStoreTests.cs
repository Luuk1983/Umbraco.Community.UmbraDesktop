using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Media.Health;
using Umbraco.Community.UmbraDesktop.Media.Health.Keep;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>
/// Keeps (design §16.6): marks that something is wanted, for the whole site, until their time is up or
/// what was kept is no longer what is there.
/// </summary>
public class MediaKeepStoreTests : IAsyncLifetime
{
    /// <summary>Who keeps things.</summary>
    private static readonly Guid Editor = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000001");

    /// <summary>An unused item of the last check.</summary>
    private static readonly Guid Unused = Guid.Parse("a0000000-0000-0000-0000-000000000001");

    /// <summary>A used item of the last check, a big image.</summary>
    private static readonly Guid Big = Guid.Parse("a0000000-0000-0000-0000-000000000002");

    /// <summary>When the clock starts.</summary>
    private static readonly DateTimeOffset Start = new(2026, 10, 27, 12, 0, 0, TimeSpan.Zero);

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The clock.</summary>
    private readonly FakeTimeProvider _time = new(Start);

    /// <summary>The check store, for the check whose things are kept.</summary>
    private MediaHealthStore _checks = null!;

    /// <summary>The store under test.</summary>
    private MediaKeepStore _keeps = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _checks = new MediaHealthStore(_database, _time);
        _keeps = new MediaKeepStore(_database, _time);
        await CheckAsync();
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>Run a check that finds the two items and an orphaned file, as given.</summary>
    /// <param name="unusedUrl">The unused item's file.</param>
    /// <param name="orphanWritten">When the orphaned file was last written.</param>
    /// <param name="withUnused">Whether the unused item is still in the library.</param>
    /// <returns>A task.</returns>
    private async Task CheckAsync(string unusedUrl = "/media/a/old.jpg", DateTime? orphanWritten = null, bool withUnused = true)
    {
        var check = await _checks.StartAsync(Editor);
        var items = new List<MediaHealthItem> { new(Big, "Hero", "Image", "jpg", 3_000_000, null, "/", 2, "/media/b/hero.jpg") };
        if (withUnused)
        {
            items.Add(new MediaHealthItem(Unused, "Old", "Image", "jpg", 500, null, "/", 0, unusedUrl));
        }

        var written = orphanWritten ?? new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        await _checks.FinishAsync(check.Id, new MediaHealthResult([], items, [new MediaHealthOrphan("c/news.pdf", "/media/c/news.pdf", 700, written)]));
    }

    /// <summary>Keep the unused item from the unused list.</summary>
    /// <param name="duration">For how long.</param>
    /// <param name="note">Why.</param>
    /// <returns>The keep.</returns>
    private async Task<MediaKeep> KeepUnusedAsync(MediaKeepDuration duration = MediaKeepDuration.Year, string? note = "For the press page") =>
        Assert.Single(await _keeps.KeepAsync(MediaKeepKind.Unused, [Unused.ToString("D")], note, duration, Editor, "Editor"));

    /// <summary>A year from now by default, three months, or always.</summary>
    [Fact]
    public async Task Ends_after_the_time_asked_for()
    {
        Assert.Equal(new DateTime(2027, 10, 27, 12, 0, 0, DateTimeKind.Utc), (await KeepUnusedAsync()).UntilUtc);
        Assert.Equal(new DateTime(2027, 1, 27, 12, 0, 0, DateTimeKind.Utc), (await KeepUnusedAsync(MediaKeepDuration.ThreeMonths)).UntilUtc);
        Assert.Null((await KeepUnusedAsync(MediaKeepDuration.Always)).UntilUtc);
    }

    /// <summary>Who kept it and when are recorded, with the note, and times come back as UTC.</summary>
    [Fact]
    public async Task Records_who_when_and_why()
    {
        await KeepUnusedAsync();

        var keep = Assert.Single(await _keeps.ListAsync());
        Assert.Equal(Unused.ToString("D"), keep.Target);
        Assert.Equal(MediaKeepKind.Unused, keep.Kind);
        Assert.Equal("For the press page", keep.Note);
        Assert.Equal(Editor, keep.KeptBy);
        Assert.Equal("Editor", keep.KeptByName);
        Assert.Equal(DateTimeKind.Utc, keep.KeptUtc.Kind);
        Assert.Equal(DateTimeKind.Utc, keep.UntilUtc!.Value.Kind);
        Assert.Null(keep.Ended);
    }

    /// <summary>A keep's time up: it is listed as ended, so the thing comes back with its old note.</summary>
    [Fact]
    public async Task Ends_when_its_time_is_up()
    {
        await KeepUnusedAsync();
        _time.SetUtcNow(new DateTimeOffset(2027, 10, 27, 12, 0, 1, TimeSpan.Zero));

        Assert.Equal(MediaKeepEnd.Expired, Assert.Single(await _keeps.ListAsync()).Ended);
    }

    /// <summary>A keep on an item ends when its file changes: what was kept is no longer what is there.</summary>
    [Fact]
    public async Task Ends_when_an_items_file_changes()
    {
        await KeepUnusedAsync();
        await CheckAsync(unusedUrl: "/media/z/new.jpg");

        Assert.Equal(MediaKeepEnd.Changed, Assert.Single(await _keeps.ListAsync()).Ended);
    }

    /// <summary>A keep on an orphaned file ends when the file is written again.</summary>
    [Fact]
    public async Task Ends_when_an_orphaned_file_is_written_again()
    {
        await _keeps.KeepAsync(MediaKeepKind.Orphaned, ["c/news.pdf"], null, MediaKeepDuration.Always, Editor, "Editor");
        Assert.Null(Assert.Single(await _keeps.ListAsync()).Ended);

        await CheckAsync(orphanWritten: new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc));

        Assert.Equal(MediaKeepEnd.Changed, Assert.Single(await _keeps.ListAsync()).Ended);
    }

    /// <summary>Keeping again replaces the keep, even from another list: one keep per thing (plan Decision 6).</summary>
    [Fact]
    public async Task Keeping_again_replaces()
    {
        await KeepUnusedAsync(note: "First");
        await _keeps.KeepAsync(MediaKeepKind.Oversized, [Unused.ToString("D")], "Second", MediaKeepDuration.Always, Editor, "Editor");

        var keep = Assert.Single(await _keeps.ListAsync());
        Assert.Equal("Second", keep.Note);
        Assert.Equal(MediaKeepKind.Oversized, keep.Kind);
        Assert.Null(keep.UntilUtc);
    }

    /// <summary>Only what the last check found can be kept; anything else is skipped.</summary>
    [Fact]
    public async Task Skips_what_the_last_check_did_not_find()
    {
        var made = await _keeps.KeepAsync(MediaKeepKind.Orphaned, ["c/news.pdf", "nowhere/else.pdf"], null, MediaKeepDuration.Year, Editor, "Editor");

        Assert.Equal("c/news.pdf", Assert.Single(made).Target);
    }

    /// <summary>Stop keeping removes the keep at once.</summary>
    [Fact]
    public async Task Stop_removes_the_keep()
    {
        var keep = await KeepUnusedAsync();

        await _keeps.StopAsync([keep.Id]);

        Assert.Empty(await _keeps.ListAsync());
    }

    /// <summary>A finished check drops keeps whose thing is gone, and keeps the rest (plan Decision 7).</summary>
    [Fact]
    public async Task A_check_drops_keeps_of_what_is_gone()
    {
        await KeepUnusedAsync();
        await _keeps.KeepAsync(MediaKeepKind.Oversized, [Big.ToString("D")], null, MediaKeepDuration.Year, Editor, "Editor");

        await CheckAsync(withUnused: false);

        Assert.Equal(Big.ToString("D"), Assert.Single(await _keeps.ListAsync()).Target);
    }

    /// <summary>The orphaned files kept now, for the delete to skip (Review Focus 5); an ended keep does not count.</summary>
    [Fact]
    public async Task Lists_the_orphaned_files_kept_now()
    {
        await _keeps.KeepAsync(MediaKeepKind.Orphaned, ["c/news.pdf"], null, MediaKeepDuration.ThreeMonths, Editor, "Editor");
        Assert.Contains("c/news.pdf", await _keeps.ActiveOrphanPathsAsync());

        _time.SetUtcNow(new DateTimeOffset(2027, 3, 1, 0, 0, 0, TimeSpan.Zero));

        Assert.Empty(await _keeps.ActiveOrphanPathsAsync());
    }

    /// <summary>A note is at most the column's length; the API refuses a longer one before it gets here.</summary>
    [Fact]
    public void A_note_is_at_most_five_hundred_characters() => Assert.Equal(500, MediaKeepStore.NoteLength);
}
