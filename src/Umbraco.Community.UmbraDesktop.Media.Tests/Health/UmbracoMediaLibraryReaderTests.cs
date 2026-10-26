using NSubstitute;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Persistence.Querying;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Strings;
using Umbraco.Community.UmbraDesktop.Media.Health;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>
/// Reading the whole library from Umbraco in one pass (design §15): folders by key, items with their
/// folder's key and names path, usage from one relations query, and the files every item owns, the
/// trashed ones included.
/// </summary>
public class UmbracoMediaLibraryReaderTests
{
    /// <summary>Makes property types.</summary>
    private static readonly IShortStringHelper Strings = new DefaultShortStringHelper(new DefaultShortStringHelperConfig());

    /// <summary>The Products folder.</summary>
    private static readonly Guid ProductsKey = Guid.Parse("f0000000-0000-0000-0000-000000000001");

    /// <summary>
    /// A media item as Umbraco hands it out, with a file property and the two built-in facts.
    /// </summary>
    /// <param name="id">Its integer id.</param>
    /// <param name="key">Its key.</param>
    /// <param name="name">Its name.</param>
    /// <param name="parentId">Its parent's id, -1 at the root.</param>
    /// <param name="typeAlias">Its media type's alias.</param>
    /// <param name="file">Its file property's value, or null for a folder.</param>
    /// <param name="editor">The file property's editor.</param>
    /// <param name="trashed">Whether it is in the recycle bin.</param>
    /// <param name="ancestors">The ids on its path above it, root to parent.</param>
    /// <returns>The item.</returns>
    private static IMedia Media(int id, Guid key, string name, int parentId, string typeAlias, string? file, string editor = Constants.PropertyEditors.Aliases.ImageCropper, bool trashed = false, params int[] ancestors)
    {
        var media = Substitute.For<IMedia>();
        media.Id.Returns(id);
        media.Key.Returns(key);
        media.Name.Returns(name);
        media.ParentId.Returns(parentId);
        media.Trashed.Returns(trashed);
        media.Path.Returns(string.Join(",", new[] { -1 }.Concat(ancestors).Append(id)));
        var type = Substitute.For<ISimpleContentType>();
        type.Alias.Returns(typeAlias);
        media.ContentType.Returns(type);
        var properties = new List<IProperty>();
        if (file is not null)
        {
            properties.Add(Property(Constants.Conventions.Media.File, editor, file));
            properties.Add(Property(Constants.Conventions.Media.Extension, "Umbraco.Label", "jpg"));
            properties.Add(Property(Constants.Conventions.Media.Bytes, "Umbraco.Label", "12345"));
        }

        media.Properties.Returns(new PropertyCollection(properties));
        return media;
    }

    /// <summary>A property with a value.</summary>
    /// <param name="alias">Its alias.</param>
    /// <param name="editor">Its editor.</param>
    /// <param name="value">Its value.</param>
    /// <returns>The property.</returns>
    private static IProperty Property(string alias, string editor, string value)
    {
        var property = new Property(new PropertyType(Strings, editor, ValueStorageType.Nvarchar, alias));
        property.SetValue(value);
        return property;
    }

    /// <summary>A media service that pages out the given items, whatever the page size.</summary>
    /// <param name="all">The library.</param>
    /// <returns>The service.</returns>
    private static IMediaService MediaService(IReadOnlyList<IMedia> all)
    {
        var service = Substitute.For<IMediaService>();
        service.GetPagedDescendants(Constants.System.Root, Arg.Any<long>(), Arg.Any<int>(), out Arg.Any<long>(), Arg.Any<IQuery<IMedia>>(), Arg.Any<Ordering>())
            .Returns(call =>
            {
                call[3] = (long)all.Count;
                var page = call.ArgAt<long>(1);
                var size = call.ArgAt<int>(2);
                return all.Skip((int)(page * size)).Take(size).ToList();
            });
        return service;
    }

    /// <summary>A relation of a page to a media item.</summary>
    /// <param name="contentId">The page.</param>
    /// <param name="mediaId">The item.</param>
    /// <returns>The relation.</returns>
    private static IRelation Relation(int contentId, int mediaId)
    {
        var relation = Substitute.For<IRelation>();
        relation.ParentId.Returns(contentId);
        relation.ChildId.Returns(mediaId);
        return relation;
    }

    /// <summary>Folders come out with their keys and paths; items with their folder's key, their path and their usage.</summary>
    [Fact]
    public async Task Reads_folders_items_usage_and_owned_files()
    {
        var hero = Guid.NewGuid();
        var library = new List<IMedia>
        {
            Media(10, ProductsKey, "Products", Constants.System.Root, Constants.Conventions.MediaTypes.Folder, null),
            Media(11, hero, "Hero", 10, "Image", """{"src":"/media/abc/hero.jpg"}""", ancestors: 10),
            Media(12, Guid.NewGuid(), "Notes", Constants.System.Root, "File", "/media/def/notes.pdf", Constants.PropertyEditors.Aliases.UploadField),
            Media(13, Guid.NewGuid(), "Binned", 10, "Image", """{"src":"/media/ghi/binned.jpg"}""", trashed: true, ancestors: 10),
        };
        var related = new[] { Relation(100, 11), Relation(101, 10) };
        var relations = Substitute.For<IRelationService>();
        relations.GetByRelationTypeAlias(Constants.Conventions.RelationTypes.RelatedMediaAlias).Returns(related);
        var files = MediaDiskScannerTests.FileSystem();
        var progress = new List<MediaHealthProgress>();

        var snapshot = await new UmbracoMediaLibraryReader(MediaService(library), relations, files).ReadAsync(
            new Progress<MediaHealthProgress>(progress.Add),
            CancellationToken.None);

        var folder = Assert.Single(snapshot.Folders);
        Assert.Equal((ProductsKey, "Products", (Guid?)null, "/Products"), (folder.Key, folder.Name, folder.ParentKey, folder.Path));
        Assert.Equal(["Hero", "Notes"], snapshot.Items.Select(item => item.Name));
        var heroItem = snapshot.Items[0];
        Assert.Equal((hero, "Image", "jpg", 12345L, (Guid?)ProductsKey, "/Products", 1), (heroItem.Key, heroItem.MediaTypeAlias, heroItem.Extension, heroItem.SizeBytes, heroItem.ParentKey, heroItem.Path, heroItem.UsageCount));
        Assert.Equal(((Guid?)null, "/", 0), (snapshot.Items[1].ParentKey, snapshot.Items[1].Path, snapshot.Items[1].UsageCount));
        Assert.Equal(["abc/hero.jpg", "def/notes.pdf", "ghi/binned.jpg"], snapshot.OwnedPaths.Order());
    }

    /// <summary>Progress is reported as the pages go by, scanned over the library's total.</summary>
    [Fact]
    public async Task Reports_progress_per_page()
    {
        var library = Enumerable.Range(1, 5).Select(i => Media(i, Guid.NewGuid(), $"Item {i}", Constants.System.Root, "Image", """{"src":"/media/x/y.jpg"}""")).ToList();
        var relations = Substitute.For<IRelationService>();
        relations.GetByRelationTypeAlias(Arg.Any<string>()).Returns([]);
        var progress = new List<MediaHealthProgress>();

        await new UmbracoMediaLibraryReader(MediaService(library), relations, MediaDiskScannerTests.FileSystem(), pageSize: 2).ReadAsync(
            new SyncProgress(progress.Add),
            CancellationToken.None);

        Assert.Equal([new MediaHealthProgress(2, 5), new MediaHealthProgress(4, 5), new MediaHealthProgress(5, 5)], progress);
    }

    /// <summary>Reads the owned file paths alone, for the delete's re-check, trashed items included.</summary>
    [Fact]
    public async Task Reads_owned_paths_alone()
    {
        var library = new List<IMedia>
        {
            Media(11, Guid.NewGuid(), "Hero", Constants.System.Root, "Image", """{"src":"/media/abc/hero.jpg"}"""),
            Media(13, Guid.NewGuid(), "Binned", Constants.System.Root, "Image", """{"src":"/media/ghi/binned.jpg"}""", trashed: true),
        };
        var relations = Substitute.For<IRelationService>();

        var owned = await new UmbracoMediaLibraryReader(MediaService(library), relations, MediaDiskScannerTests.FileSystem()).ReadOwnedPathsAsync(CancellationToken.None);

        Assert.Equal(["abc/hero.jpg", "ghi/binned.jpg"], owned.Order());
        relations.DidNotReceive().GetByRelationTypeAlias(Arg.Any<string>());
    }

    /// <summary>A progress that reports on the calling thread, so a test can read it at once.</summary>
    /// <param name="report">What to do with each report.</param>
    private sealed class SyncProgress(Action<MediaHealthProgress> report) : IProgress<MediaHealthProgress>
    {
        /// <inheritdoc />
        public void Report(MediaHealthProgress value) => report(value);
    }
}
