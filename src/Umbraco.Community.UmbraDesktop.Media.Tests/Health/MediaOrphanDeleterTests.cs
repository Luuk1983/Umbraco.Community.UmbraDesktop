using NSubstitute;
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Media.Health;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>
/// Deleting orphaned files from disk (design §5, §15): each is checked again at the moment of
/// deleting, folders left empty go with them but never the media root, and the deletion is written
/// to Umbraco's audit log under the person who asked.
/// </summary>
public class MediaOrphanDeleterTests
{
    /// <summary>The person deleting.</summary>
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");

    /// <summary>A deleter over a file system where two files exist, one of them owned by an item since the check.</summary>
    /// <param name="fs">The file system, set up by the caller.</param>
    /// <param name="audit">Umbraco's audit log.</param>
    /// <returns>The deleter.</returns>
    private static MediaOrphanDeleter Deleter(IFileSystem fs, IAuditService audit)
    {
        var library = Substitute.For<IMediaLibraryReader>();
        library.ReadOwnedPathsAsync(Arg.Any<CancellationToken>()).Returns(new HashSet<string>(["def456/photo.jpg"], StringComparer.OrdinalIgnoreCase));
        return new MediaOrphanDeleter(fs, library, audit);
    }

    /// <summary>What is still on disk and still unowned is deleted; the rest is skipped with the reason.</summary>
    [Fact]
    public async Task Deletes_what_is_still_orphaned_and_says_why_the_rest_stayed()
    {
        var fs = Substitute.For<IFileSystem>();
        fs.FileExists("abc123/old.pdf").Returns(true);
        fs.FileExists("def456/photo.jpg").Returns(true);
        fs.FileExists("gone/x.png").Returns(false);
        fs.GetSize("abc123/old.pdf").Returns(500);
        fs.DirectoryExists("abc123").Returns(true);
        fs.GetFiles("abc123").Returns([]);
        fs.GetDirectories("abc123").Returns([]);
        var audit = Substitute.For<IAuditService>();

        var result = await Deleter(fs, audit).DeleteAsync(["abc123/old.pdf", "def456/photo.jpg", "gone/x.png"], Admin, CancellationToken.None);

        Assert.Equal(["abc123/old.pdf"], result.Deleted);
        Assert.Equal([new MediaOrphanSkip("def456/photo.jpg", MediaOrphanSkipReason.NowOwned), new MediaOrphanSkip("gone/x.png", MediaOrphanSkipReason.NotFound)], result.Skipped);
        fs.Received(1).DeleteFile("abc123/old.pdf");
        fs.DidNotReceive().DeleteFile("def456/photo.jpg");
        await audit.Received(1).AddAsync(AuditType.Delete, Admin, Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Is<string>(comment => comment.Contains("abc123/old.pdf")));
    }

    /// <summary>A folder left empty is removed, and its parent if that is now empty too, but the root never.</summary>
    [Fact]
    public async Task Removes_folders_left_empty_but_never_the_root()
    {
        var fs = Substitute.For<IFileSystem>();
        fs.FileExists("a/b/last.jpg").Returns(true);
        fs.FileExists("a/keep.jpg").Returns(false);
        fs.DirectoryExists("a/b").Returns(true);
        fs.GetFiles("a/b").Returns([]);
        fs.GetDirectories("a/b").Returns([]);
        fs.DirectoryExists("a").Returns(true);
        fs.GetFiles("a").Returns([]);
        fs.GetDirectories("a").Returns([]);
        var library = Substitute.For<IMediaLibraryReader>();
        library.ReadOwnedPathsAsync(Arg.Any<CancellationToken>()).Returns(new HashSet<string>(StringComparer.OrdinalIgnoreCase));

        await new MediaOrphanDeleter(fs, library, Substitute.For<IAuditService>()).DeleteAsync(["a/b/last.jpg"], Admin, CancellationToken.None);

        fs.Received(1).DeleteDirectory("a/b", false);
        fs.Received(1).DeleteDirectory("a", false);
        fs.DidNotReceive().DeleteDirectory("", Arg.Any<bool>());
    }

    /// <summary>A folder that still holds something stays.</summary>
    [Fact]
    public async Task Leaves_a_folder_that_still_holds_something()
    {
        var fs = Substitute.For<IFileSystem>();
        fs.FileExists("a/one.jpg").Returns(true);
        fs.DirectoryExists("a").Returns(true);
        fs.GetFiles("a").Returns(["a/two.jpg"]);
        var library = Substitute.For<IMediaLibraryReader>();
        library.ReadOwnedPathsAsync(Arg.Any<CancellationToken>()).Returns(new HashSet<string>(StringComparer.OrdinalIgnoreCase));

        await new MediaOrphanDeleter(fs, library, Substitute.For<IAuditService>()).DeleteAsync(["a/one.jpg"], Admin, CancellationToken.None);

        fs.DidNotReceive().DeleteDirectory(Arg.Any<string>(), Arg.Any<bool>());
    }

    /// <summary>Nothing to delete means nothing read and nothing audited.</summary>
    [Fact]
    public async Task Does_nothing_for_an_empty_list()
    {
        var library = Substitute.For<IMediaLibraryReader>();
        var audit = Substitute.For<IAuditService>();

        var result = await new MediaOrphanDeleter(Substitute.For<IFileSystem>(), library, audit).DeleteAsync([], Admin, CancellationToken.None);

        Assert.Empty(result.Deleted);
        await library.DidNotReceive().ReadOwnedPathsAsync(Arg.Any<CancellationToken>());
        await audit.DidNotReceive().AddAsync(Arg.Any<AuditType>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>());
    }
}
