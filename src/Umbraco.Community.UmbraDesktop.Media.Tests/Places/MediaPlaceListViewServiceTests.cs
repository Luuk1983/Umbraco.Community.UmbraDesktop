using NSubstitute;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Security.Authorization;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Services.OperationStatus;
using Umbraco.Community.UmbraDesktop.Media.Places;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Places;

/// <summary>
/// Listing what is under a media item whose type has no collection, which Umbraco's own list view
/// service refuses (issue #158).
/// </summary>
/// <remarks>
/// The case worth most is the hand-over: everything Umbraco can answer, it answers, untouched. Only an
/// item that is no collection is listed here, and then by Umbraco's own rules: its default media list
/// view, its ordering, its search and its access check.
/// </remarks>
public class MediaPlaceListViewServiceTests
{
    /// <summary>The image the tests list the children of: its type has no collection.</summary>
    private static readonly Guid Image = Guid.Parse("11111111-2222-3333-4444-555555555555");

    /// <summary>The Image media type, which has no collection.</summary>
    private static readonly Guid ImageType = Guid.Parse("cc07b313-0843-4aa8-bbda-871c8da728c8");

    /// <summary>A folder, whose type has a collection.</summary>
    private static readonly Guid Folder = Guid.Parse("66666666-7777-8888-9999-aaaaaaaaaaaa");

    /// <summary>The Folder media type, with a collection.</summary>
    private static readonly Guid FolderType = Guid.Parse("f38bd2d7-65d0-48e6-95dc-87ce06ec2d3d");

    /// <summary>Everything the service is built from, as substitutes a test can set up and check.</summary>
    private sealed record Parts(
        IMediaListViewService Umbraco,
        IMediaService Media,
        IMediaTypeService MediaTypes,
        IDataTypeService DataTypes,
        IMediaSearchService Search,
        IMediaPermissionAuthorizer Authorizer,
        IUser User)
    {
        /// <summary>The service under test, over these parts.</summary>
        public MediaPlaceListViewService Service =>
            new(Umbraco, Media, MediaTypes, DataTypes, Search, Authorizer);
    }

    /// <summary>
    /// The parts of a site with an image and a folder, the default media list view with Umbraco's
    /// own columns, and a person who may see everything.
    /// </summary>
    /// <returns>The parts.</returns>
    private static Parts Site()
    {
        var parts = new Parts(
            Substitute.For<IMediaListViewService>(),
            Substitute.For<IMediaService>(),
            Substitute.For<IMediaTypeService>(),
            Substitute.For<IDataTypeService>(),
            Substitute.For<IMediaSearchService>(),
            Substitute.For<IMediaPermissionAuthorizer>(),
            Substitute.For<IUser>());

        // Each made before it is handed over: NSubstitute cannot set up one substitute inside another's Returns.
        var image = MediaOf(Image, ImageType);
        var folder = MediaOf(Folder, FolderType);
        var imageType = TypeOf(ImageType, listView: null);
        var folderType = TypeOf(FolderType, listView: Guid.NewGuid());
        // Anything else does not exist, rather than NSubstitute's made-up item.
        parts.Media.GetById(Arg.Any<Guid>()).Returns((IMedia?)null);
        parts.Media.GetById(Image).Returns(image);
        parts.Media.GetById(Folder).Returns(folder);
        parts.MediaTypes.GetAsync(ImageType).Returns(imageType);
        parts.MediaTypes.GetAsync(FolderType).Returns(folderType);

        var listView = Substitute.For<IDataType>();
        listView.ConfigurationObject.Returns(new ListViewConfiguration
        {
            IncludeProperties =
            [
                new ListViewConfiguration.Property { Alias = "updateDate", IsSystem = true },
                new ListViewConfiguration.Property { Alias = "creator", IsSystem = true },
                new ListViewConfiguration.Property { Alias = "umbracoBytes", IsSystem = false },
            ],
        });
        parts.DataTypes.GetAsync(Constants.DataTypes.Guids.ListViewMediaGuid).Returns(listView);
        parts.Authorizer.IsDeniedAsync(parts.User, Arg.Any<IEnumerable<Guid>>()).Returns(false);
        return parts;
    }

    /// <summary>A media item of a type.</summary>
    /// <param name="key">Its key.</param>
    /// <param name="type">Its media type's key.</param>
    /// <returns>The item.</returns>
    private static IMedia MediaOf(Guid key, Guid type)
    {
        var media = Substitute.For<IMedia>();
        media.Key.Returns(key);
        var contentType = Substitute.For<ISimpleContentType>();
        contentType.Key.Returns(type);
        media.ContentType.Returns(contentType);
        return media;
    }

    /// <summary>A media type, with or without a collection.</summary>
    /// <param name="key">Its key.</param>
    /// <param name="listView">Its collection's list view, or null for none.</param>
    /// <returns>The type.</returns>
    private static IMediaType TypeOf(Guid key, Guid? listView)
    {
        var type = Substitute.For<IMediaType>();
        type.Key.Returns(key);
        type.ListView.Returns(listView);
        return type;
    }

    /// <summary>Make the search answer with some children of the image.</summary>
    /// <param name="parts">The site.</param>
    /// <param name="total">How many children the search says there are in all.</param>
    /// <param name="children">The children on this page.</param>
    private static void ChildrenOfImage(Parts parts, long total, params IMedia[] children) =>
        parts.Search.SearchChildrenAsync(Arg.Any<string?>(), Image, Arg.Any<string[]?>(), Arg.Any<Ordering>(), Arg.Any<bool>(), Arg.Any<int>(), Arg.Any<int>())
            .Returns(new PagedModel<IMedia>(total, children));

    /// <summary>
    /// Everything Umbraco answers goes to Umbraco: the root, a folder, a list view named as a
    /// property, an item that does not exist. Its answer comes back as it gave it.
    /// </summary>
    /// <param name="what">Which request.</param>
    [Theory]
    [InlineData("root")]
    [InlineData("folder")]
    [InlineData("property")]
    [InlineData("missing")]
    public async Task Hands_everything_umbraco_answers_to_umbraco(string what)
    {
        var parts = Site();
        Guid? key = what switch
        {
            "root" => null,
            "folder" => Folder,
            "property" => Image,
            _ => Guid.NewGuid(),
        };
        Guid? dataType = what == "property" ? Guid.NewGuid() : null;
        var answer = Attempt.FailWithStatus<ListViewPagedModel<IMedia>?, ContentCollectionOperationStatus>(
            ContentCollectionOperationStatus.ContentNotFound, null);
        parts.Umbraco.GetListViewItemsByKeyAsync(parts.User, key, dataType, "name", Direction.Ascending, "x", 5, 10)
            .Returns(answer);

        var result = await parts.Service.GetListViewItemsByKeyAsync(parts.User, key, dataType, "name", Direction.Ascending, "x", 5, 10);

        Assert.Equal(answer, result);
        await parts.Search.DidNotReceiveWithAnyArgs().SearchChildrenAsync(default, default, default, default!, default, default, default);
    }

    /// <summary>
    /// An image's children, listed as a folder's would be: through the media search, with its filter,
    /// page and order, and the default media list view's configuration with them.
    /// </summary>
    [Fact]
    public async Task Lists_the_children_of_an_item_that_is_no_collection()
    {
        var parts = Site();
        var unicorn = MediaOf(Guid.NewGuid(), ImageType);
        ChildrenOfImage(parts, 7, unicorn);

        var result = await parts.Service.GetListViewItemsByKeyAsync(parts.User, Image, null, "name", Direction.Descending, "uni", 5, 10);

        Assert.True(result.Success);
        Assert.Equal(ContentCollectionOperationStatus.Success, result.Status);
        Assert.Equal([unicorn], result.Result!.Items.Items);
        Assert.Equal(7, result.Result.Items.Total);
        Assert.Equal(3, result.Result.ListViewConfiguration.IncludeProperties.Length);
        await parts.Search.Received(1).SearchChildrenAsync(
            "uni",
            Image,
            Arg.Is<string[]?>(aliases => aliases == null),
            Arg.Is<Ordering>(ordering => ordering.OrderBy == "name" && ordering.Direction == Direction.Descending && !ordering.IsCustomField),
            Arg.Any<bool>(),
            5,
            10);
        await parts.Umbraco.DidNotReceiveWithAnyArgs().GetListViewItemsByKeyAsync(default!, default, default, default!, default, default, default, default);
    }

    /// <summary>
    /// Only what the person may see is listed, by Umbraco's own media check; the total stays the
    /// search's, as Umbraco's own list view leaves it.
    /// </summary>
    [Fact]
    public async Task Leaves_out_what_the_person_may_not_see()
    {
        var parts = Site();
        var seen = MediaOf(Guid.NewGuid(), ImageType);
        var hidden = MediaOf(Guid.NewGuid(), ImageType);
        ChildrenOfImage(parts, 2, seen, hidden);
        parts.Authorizer.IsDeniedAsync(parts.User, Arg.Is<IEnumerable<Guid>>(keys => keys.Contains(hidden.Key))).Returns(true);

        var result = await parts.Service.GetListViewItemsByKeyAsync(parts.User, Image, null, "name", Direction.Ascending, null, 0, 100);

        Assert.Equal([seen], result.Result!.Items.Items);
        Assert.Equal(2, result.Result.Items.Total);
    }

    /// <summary>
    /// The list view's ordering rules are Umbraco's: a column of the list view or the name, "creator"
    /// read as "owner", and a property that is not a system one ordered as a custom field.
    /// </summary>
    /// <param name="orderBy">What the collection asks to order by.</param>
    /// <param name="expected">What the search is asked to order by.</param>
    /// <param name="custom">Whether it is a custom field.</param>
    [Theory]
    [InlineData("updateDate", "updateDate", false)]
    [InlineData("creator", "owner", false)]
    [InlineData("umbracoBytes", "umbracoBytes", true)]
    public async Task Orders_as_umbraco_does(string orderBy, string expected, bool custom)
    {
        var parts = Site();
        ChildrenOfImage(parts, 0);

        var result = await parts.Service.GetListViewItemsByKeyAsync(parts.User, Image, null, orderBy, Direction.Ascending, null, 0, 100);

        Assert.True(result.Success);
        await parts.Search.Received(1).SearchChildrenAsync(
            null,
            Image,
            Arg.Is<string[]?>(aliases => aliases == null),
            Arg.Is<Ordering>(ordering => ordering.OrderBy == expected && ordering.IsCustomField == custom),
            Arg.Any<bool>(),
            0,
            100);
    }

    /// <summary>An order that is no column of the list view is refused, with Umbraco's own status.</summary>
    [Fact]
    public async Task Refuses_an_order_the_list_view_does_not_have()
    {
        var parts = Site();

        var result = await parts.Service.GetListViewItemsByKeyAsync(parts.User, Image, null, "colour", Direction.Ascending, null, 0, 100);

        Assert.False(result.Success);
        Assert.Equal(ContentCollectionOperationStatus.OrderByNotPartOfCollectionConfiguration, result.Status);
    }

    /// <summary>Without the default media list view there is nothing to list with: Umbraco's status says so.</summary>
    [Fact]
    public async Task Says_so_when_the_default_list_view_is_gone()
    {
        var parts = Site();
        parts.DataTypes.GetAsync(Constants.DataTypes.Guids.ListViewMediaGuid).Returns((IDataType?)null);

        var result = await parts.Service.GetListViewItemsByKeyAsync(parts.User, Image, null, "name", Direction.Ascending, null, 0, 100);

        Assert.False(result.Success);
        Assert.Equal(ContentCollectionOperationStatus.CollectionNotFound, result.Status);
    }
}
