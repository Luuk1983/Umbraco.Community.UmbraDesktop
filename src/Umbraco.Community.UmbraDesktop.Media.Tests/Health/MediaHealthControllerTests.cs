using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Core.HostedServices;
using Umbraco.Cms.Core.Media;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Media.Health;
using Umbraco.Community.UmbraDesktop.Media.Health.Api;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>Who may call what, and how each answer reaches the window.</summary>
public class MediaHealthControllerTests : IAsyncLifetime
{
    /// <summary>Who is signed in.</summary>
    private static readonly Guid Editor = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000001");

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The store.</summary>
    private MediaHealthStore _store = null!;

    /// <summary>The deleter, as a stand-in.</summary>
    private readonly IMediaOrphanDeleter _deleter = Substitute.For<IMediaOrphanDeleter>();

    /// <summary>The queue, which runs nothing here.</summary>
    private readonly IBackgroundTaskQueue _queue = Substitute.For<IBackgroundTaskQueue>();

    /// <summary>Umbraco's image URL generator, which signs resizer URLs on a site with an HMAC secret.</summary>
    private readonly IImageUrlGenerator _images = Substitute.For<IImageUrlGenerator>();

    /// <summary>The library, for the items a Clean up changed.</summary>
    private readonly IMediaLibraryReader _library = Substitute.For<IMediaLibraryReader>();

    /// <summary>The library's item count, as Umbraco's media service would give it.</summary>
    private readonly IMediaCounter _counter = Substitute.For<IMediaCounter>();

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new MediaHealthStore(_database, new FakeTimeProvider());
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>The controller as the signed-in person.</summary>
    private MediaHealthController Controller()
    {
        var user = Substitute.For<IUser>();
        user.Key.Returns(Editor);
        var security = Substitute.For<IBackOfficeSecurity>();
        security.CurrentUser.Returns(user);
        var accessor = Substitute.For<IBackOfficeSecurityAccessor>();
        accessor.BackOfficeSecurity.Returns(security);
        var runner = new MediaHealthRunner(_store, _library, Substitute.For<IMediaDiskScanner>(), _queue, new FakeTimeProvider(), NullLogger<MediaHealthRunner>.Instance);
        return new MediaHealthController(_store, runner, _library, _deleter, _counter, _images, accessor);
    }

    /// <summary>Everything is behind the Media section; deleting from disk is for administrators only.</summary>
    [Fact]
    public void Gates_on_the_media_section_and_deleting_on_admin()
    {
        // The controller's own attributes, not the base class's: Umbraco's base already asks for backoffice access.
        var controller = typeof(MediaHealthController).GetCustomAttributes<AuthorizeAttribute>(inherit: false);
        Assert.Equal(AuthorizationPolicies.SectionAccessMedia, Assert.Single(controller).Policy);
        var delete = typeof(MediaHealthController).GetMethod(nameof(MediaHealthController.DeleteOrphans))!.GetCustomAttributes<AuthorizeAttribute>(inherit: false);
        Assert.Equal(AuthorizationPolicies.RequireAdminAccess, Assert.Single(delete).Policy);
        foreach (var name in new[] { nameof(MediaHealthController.GetStatus), nameof(MediaHealthController.Check), nameof(MediaHealthController.GetItems), nameof(MediaHealthController.GetFolders), nameof(MediaHealthController.GetOrphans), nameof(MediaHealthController.OrphanThumbnails), nameof(MediaHealthController.Stop), nameof(MediaHealthController.RefreshItems) })
        {
            Assert.Empty(typeof(MediaHealthController).GetMethod(name)!.GetCustomAttributes<AuthorizeAttribute>(inherit: false));
        }
    }

    /// <summary>Stop ends the running check, and the status then has none running.</summary>
    [Fact]
    public async Task Stops_the_running_check()
    {
        var controller = Controller();
        await controller.Check();

        var answer = Assert.IsType<OkObjectResult>(await controller.Stop());

        var status = Assert.IsType<MediaHealthStatusResponseModel>(answer.Value);
        Assert.Null(status.Running);
        Assert.Null(status.Failed);
    }

    /// <summary>
    /// After a Clean up the window names the items it changed, and the stored result is brought in line
    /// with what Umbraco says about them now, never with what the window says (design §16.12).
    /// </summary>
    [Fact]
    public async Task Refreshes_the_items_a_clean_up_changed_from_umbraco()
    {
        var check = await _store.StartAsync(Editor);
        var key = Guid.NewGuid();
        await _store.FinishAsync(check.Id, new MediaHealthResult([], [new MediaHealthItem(key, "Old", "Image", "jpg", 500, null, "/", 0)], []));
        _library.ReadStatesAsync(Arg.Any<IReadOnlyList<Guid>>()).Returns([new MediaHealthItemState(key, Exists: true, Trashed: true, 500, null, null, null, DateTime.UnixEpoch)]);

        Assert.IsType<NoContentResult>(await Controller().RefreshItems(new RefreshMediaHealthItemsRequestModel([key])));

        Assert.Empty(await _store.GetItemsAsync(0, 10));
        await _library.Received(1).ReadStatesAsync(Arg.Is<IReadOnlyList<Guid>>(keys => keys.SequenceEqual(new[] { key })));
    }

    /// <summary>One refresh reads at most a page's worth of items, so a request cannot ask for the whole library.</summary>
    [Fact]
    public async Task Refreshes_at_most_a_page_of_items()
    {
        _library.ReadStatesAsync(Arg.Any<IReadOnlyList<Guid>>()).Returns([]);

        await Controller().RefreshItems(new RefreshMediaHealthItemsRequestModel(Enumerable.Range(0, MediaHealthController.MaxPage + 10).Select(_ => Guid.NewGuid()).ToList()));

        await _library.Received(1).ReadStatesAsync(Arg.Is<IReadOnlyList<Guid>>(keys => keys.Count == MediaHealthController.MaxPage));
    }

    /// <summary>No check yet: an empty status, which the window shows as No check yet.</summary>
    [Fact]
    public async Task Answers_an_empty_status_before_any_check()
    {
        var ok = Assert.IsType<OkObjectResult>(await Controller().GetStatus());

        var status = Assert.IsType<MediaHealthStatusResponseModel>(ok.Value);
        Assert.Null(status.Running);
        Assert.Null(status.Last);
    }

    /// <summary>
    /// The library's item count comes with every status, so No check yet can say how big the job is
    /// (design §16.3), and with the answer to Check, which the window reads the same way.
    /// </summary>
    [Fact]
    public async Task Status_carries_the_media_count()
    {
        _counter.Count().Returns(18240);

        var status = Assert.IsType<MediaHealthStatusResponseModel>(Assert.IsType<OkObjectResult>(await Controller().GetStatus()).Value);
        var started = Assert.IsType<MediaHealthStatusResponseModel>(Assert.IsType<AcceptedResult>(await Controller().Check()).Value);

        Assert.Equal((18240, 18240), (status.MediaCount, started.MediaCount));
    }

    /// <summary>
    /// An orphaned file's thumbnail is signed by Umbraco's own generator, since a site with an HMAC
    /// secret refuses an unsigned resizer URL with 400, as the first real run of step 1 found, and core
    /// signs only media items. Only orphaned files of the last check are signed, cropped square: an
    /// item's path, or any other, is refused, so this is never an open signer.
    /// </summary>
    [Fact]
    public async Task Signs_thumbnails_only_for_the_last_checks_orphans()
    {
        var check = await _store.StartAsync(Editor);
        await _store.FinishAsync(check.Id, new MediaHealthResult(
            [],
            [new MediaHealthItem(Guid.NewGuid(), "Hero", "Image", "jpg", 900, null, "/", 0, "/media/i1/item.jpg")],
            [new MediaHealthOrphan("a1/hero.jpg", "/media/a1/hero.jpg", 5, DateTime.UnixEpoch)]));
        _images.GetImageUrl(Arg.Any<ImageUrlGenerationOptions>()).Returns(call =>
        {
            var options = call.Arg<ImageUrlGenerationOptions>();
            return $"{options.ImageUrl}?width={options.Width}&height={options.Height}&rmode={options.ImageCropMode}&hmac=signed";
        });

        var ok = Assert.IsType<OkObjectResult>(await Controller().OrphanThumbnails(new MediaHealthThumbnailsRequestModel(["/media/a1/hero.jpg", "/media/i1/item.jpg", "/media/c3/other.jpg"], 240, 240)));

        var signed = Assert.IsType<MediaHealthThumbnailsResponseModel>(ok.Value).Urls;
        var only = Assert.Single(signed);
        Assert.Equal(("/media/a1/hero.jpg", "/media/a1/hero.jpg?width=240&height=240&rmode=Crop&hmac=signed"), (only.Key, only.Value));
    }

    /// <summary>
    /// The preview asks for a picture that fits a box rather than a square crop (design §16.5): signed the
    /// same way, with the resizer's Max mode, so the whole picture shows.
    /// </summary>
    [Fact]
    public async Task Signs_a_fitted_picture_for_the_preview()
    {
        var check = await _store.StartAsync(Editor);
        await _store.FinishAsync(check.Id, new MediaHealthResult([], [], [new MediaHealthOrphan("a1/hero.jpg", "/media/a1/hero.jpg", 5, DateTime.UnixEpoch)]));

        await Controller().OrphanThumbnails(new MediaHealthThumbnailsRequestModel(["/media/a1/hero.jpg"], 1600, 1600, Fit: true));

        _images.Received(1).GetImageUrl(Arg.Is<ImageUrlGenerationOptions>(options => options.Width == 1600 && options.Height == 1600 && options.ImageCropMode == ImageCropMode.Max));
    }

    /// <summary>A size beyond what any window draws is clamped, so a signed URL never asks the resizer for a huge picture.</summary>
    [Fact]
    public async Task Clamps_the_thumbnail_size()
    {
        var check = await _store.StartAsync(Editor);
        await _store.FinishAsync(check.Id, new MediaHealthResult([], [], [new MediaHealthOrphan("a1/hero.jpg", "/media/a1/hero.jpg", 5, DateTime.UnixEpoch)]));

        await Controller().OrphanThumbnails(new MediaHealthThumbnailsRequestModel(["/media/a1/hero.jpg"], 99999, 0));

        _images.Received(1).GetImageUrl(Arg.Is<ImageUrlGenerationOptions>(options => options.Width == MediaHealthController.MaxImageEdge && options.Height == 1));
    }

    /// <summary>Starting a check answers 202 with the running check, and queues the work under the person's key.</summary>
    [Fact]
    public async Task Starts_a_check_with_accepted()
    {
        var accepted = Assert.IsType<AcceptedResult>(await Controller().Check());

        var status = Assert.IsType<MediaHealthStatusResponseModel>(accepted.Value);
        Assert.Equal("Usage", status.Running?.Phase);
        Assert.Equal(Editor, status.Running?.StartedBy);
        _queue.Received(1).QueueBackgroundWorkItem(Arg.Any<Func<CancellationToken, Task>>());
    }

    /// <summary>Items come paged, largest first, with the total so the window can page on.</summary>
    [Fact]
    public async Task Pages_the_items()
    {
        var check = await _store.StartAsync(Editor);
        var folder = Guid.NewGuid();
        await _store.FinishAsync(check.Id, new MediaHealthResult(
            [new MediaHealthFolder(folder, "Products", null, "/Products")],
            [
                new MediaHealthItem(Guid.NewGuid(), "Big", "Image", "jpg", 900, folder, "/Products", 0),
                new MediaHealthItem(Guid.NewGuid(), "Small", "Image", "jpg", 100, folder, "/Products", 3),
            ],
            []));

        var ok = Assert.IsType<OkObjectResult>(await Controller().GetItems(skip: 1, take: 1));

        var page = Assert.IsType<MediaHealthItemsResponseModel>(ok.Value);
        Assert.Equal(2, page.Total);
        var item = Assert.Single(page.Items);
        Assert.Equal(("Small", 3, true, folder), (item.Name, item.UsageCount, item.Used, item.ParentKey));
        Assert.Single(Assert.IsType<MediaHealthFoldersResponseModel>(Assert.IsType<OkObjectResult>(await Controller().GetFolders()).Value).Folders);
    }

    /// <summary>A delete goes through the deleter under the person's key, and what went is dropped from the result.</summary>
    [Fact]
    public async Task Deletes_orphans_and_drops_them_from_the_result()
    {
        var check = await _store.StartAsync(Editor);
        await _store.FinishAsync(check.Id, new MediaHealthResult([], [], [new MediaHealthOrphan("a/x.jpg", "/media/a/x.jpg", 5, DateTime.UnixEpoch), new MediaHealthOrphan("b/y.jpg", "/media/b/y.jpg", 5, DateTime.UnixEpoch)]));
        _deleter.DeleteAsync(Arg.Any<IReadOnlyList<string>>(), Editor, Arg.Any<CancellationToken>())
            .Returns(new MediaOrphanDeleteResult(["a/x.jpg"], [new MediaOrphanSkip("b/y.jpg", MediaOrphanSkipReason.NowOwned)]));

        var ok = Assert.IsType<OkObjectResult>(await Controller().DeleteOrphans(new DeleteMediaOrphansRequestModel(["a/x.jpg", "b/y.jpg"]), CancellationToken.None));

        var result = Assert.IsType<MediaHealthDeleteResponseModel>(ok.Value);
        Assert.Equal(["a/x.jpg"], result.Deleted);
        Assert.Equal("NowOwned", Assert.Single(result.Skipped).Reason);
        Assert.Equal(["b/y.jpg"], (await _store.GetOrphansAsync()).Select(orphan => orphan.RelativePath));
    }
}
