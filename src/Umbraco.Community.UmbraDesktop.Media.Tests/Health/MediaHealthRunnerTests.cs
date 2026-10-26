using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.HostedServices;
using Umbraco.Community.UmbraDesktop.Media.Health;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>
/// One check from start to finish (design §15): the library read with progress, the disk walked,
/// the orphans worked out, and the result saved, in the background so the request that started it
/// returns at once.
/// </summary>
public class MediaHealthRunnerTests : IAsyncLifetime
{
    /// <summary>Who starts the checks.</summary>
    private static readonly Guid Editor = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000001");

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The store the runner writes to.</summary>
    private MediaHealthStore _store = null!;

    /// <summary>The library, as the runner reads it.</summary>
    private readonly IMediaLibraryReader _library = Substitute.For<IMediaLibraryReader>();

    /// <summary>The disk, as the runner walks it.</summary>
    private readonly IMediaDiskScanner _disk = Substitute.For<IMediaDiskScanner>();

    /// <summary>Umbraco's background queue, whose work this test runs by hand.</summary>
    private readonly IBackgroundTaskQueue _queue = Substitute.For<IBackgroundTaskQueue>();

    /// <summary>The work the runner queued.</summary>
    private readonly List<Func<CancellationToken, Task>> _queued = [];

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new MediaHealthStore(_database, new FakeTimeProvider());
        _queue.When(queue => queue.QueueBackgroundWorkItem(Arg.Any<Func<CancellationToken, Task>>()))
            .Do(call => _queued.Add(call.Arg<Func<CancellationToken, Task>>()));
        var folder = new MediaHealthFolder(Guid.NewGuid(), "Products", null, "/Products");
        _library.ReadAsync(Arg.Any<IProgress<MediaHealthProgress>>(), Arg.Any<CancellationToken>()).Returns(call =>
        {
            call.Arg<IProgress<MediaHealthProgress>>().Report(new MediaHealthProgress(1, 2));
            call.Arg<IProgress<MediaHealthProgress>>().Report(new MediaHealthProgress(2, 2));
            return new MediaLibrarySnapshot(
                [folder],
                [new MediaHealthItem(Guid.NewGuid(), "Hero", "Image", "jpg", 3_000_000, folder.Key, "/Products", 1)],
                new HashSet<string>(["abc/hero.jpg"], StringComparer.OrdinalIgnoreCase));
        });
        _disk.Walk(Arg.Any<CancellationToken>()).Returns(
        [
            new MediaHealthOrphan("abc/hero.jpg", "/media/abc/hero.jpg", 3_000_000, DateTime.UnixEpoch),
            new MediaHealthOrphan("old/gone.png", "/media/old/gone.png", 400, DateTime.UnixEpoch),
        ]);
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>The runner under test.</summary>
    private MediaHealthRunner Runner() => new(_store, _library, _disk, _queue, NullLogger<MediaHealthRunner>.Instance);

    /// <summary>Starting queues the work and answers with the running check; the work reads, walks and saves.</summary>
    [Fact]
    public async Task Runs_a_check_in_the_background_and_saves_the_result()
    {
        var runner = Runner();

        var started = await runner.StartAsync(Editor);
        Assert.Equal(MediaHealthPhase.Usage, started.Phase);
        Assert.Null((await _store.GetStatusAsync()).Last);
        var work = Assert.Single(_queued);

        await work(CancellationToken.None);

        var status = await _store.GetStatusAsync();
        Assert.Null(status.Running);
        Assert.Equal(MediaHealthPhase.Done, status.Last?.Phase);
        Assert.Equal((1, 1, 1), (status.Last!.Items, status.Last.Folders, status.Last.Orphans));
        Assert.Equal(["old/gone.png"], (await _store.GetOrphansAsync()).Select(orphan => orphan.RelativePath));
    }

    /// <summary>Starting while a check runs queues nothing more and answers with the one running.</summary>
    [Fact]
    public async Task Joins_a_check_already_running()
    {
        var runner = Runner();
        var first = await runner.StartAsync(Editor);

        var second = await runner.StartAsync(Editor);

        Assert.Equal(first.Id, second.Id);
        Assert.Single(_queued);
    }

    /// <summary>The disk phase is announced before the walk, so the window can say what is happening.</summary>
    [Fact]
    public async Task Announces_the_phases_as_it_goes()
    {
        var phases = new List<MediaHealthPhase>();
        _disk.Walk(Arg.Any<CancellationToken>()).Returns(call =>
        {
            phases.Add(_store.GetStatusAsync().Result.Running!.Phase);
            return [];
        });
        var runner = Runner();
        await runner.StartAsync(Editor);

        await _queued[0](CancellationToken.None);

        Assert.Equal([MediaHealthPhase.Disk], phases);
    }

    /// <summary>A reader that throws leaves a failed check, with the reason, and never a check stuck at running.</summary>
    [Fact]
    public async Task Records_a_failure()
    {
        _library.ReadAsync(Arg.Any<IProgress<MediaHealthProgress>>(), Arg.Any<CancellationToken>())
            .Returns<MediaLibrarySnapshot>(_ => throw new InvalidOperationException("The database went away"));
        var runner = Runner();
        await runner.StartAsync(Editor);

        await _queued[0](CancellationToken.None);

        var status = await _store.GetStatusAsync();
        Assert.Null(status.Running);
        Assert.Equal("The database went away", status.Failed?.Error);
    }
}
