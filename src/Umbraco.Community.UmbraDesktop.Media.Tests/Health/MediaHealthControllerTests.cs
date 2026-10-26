using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Core.HostedServices;
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
        var runner = new MediaHealthRunner(_store, Substitute.For<IMediaLibraryReader>(), Substitute.For<IMediaDiskScanner>(), _queue, NullLogger<MediaHealthRunner>.Instance);
        return new MediaHealthController(_store, runner, _deleter, accessor);
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
        foreach (var name in new[] { nameof(MediaHealthController.GetStatus), nameof(MediaHealthController.Check), nameof(MediaHealthController.GetItems), nameof(MediaHealthController.GetFolders), nameof(MediaHealthController.GetOrphans) })
        {
            Assert.Empty(typeof(MediaHealthController).GetMethod(name)!.GetCustomAttributes<AuthorizeAttribute>(inherit: false));
        }
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
