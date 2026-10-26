using NSubstitute;
using Umbraco.Cms.Core.IO;
using Umbraco.Community.UmbraDesktop.Media.Health;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>
/// The media folder on disk, walked through Umbraco's own file system so blob storage counts too,
/// and the files in it that no item owns (design §15).
/// </summary>
public class MediaDiskScannerTests
{
    /// <summary>A media file system with two folders of files and an empty folder.</summary>
    /// <returns>The file system.</returns>
    internal static IFileSystem FileSystem()
    {
        var fs = Substitute.For<IFileSystem>();
        fs.GetDirectories("").Returns(["abc123", "def456", "empty"]);
        fs.GetFiles("").Returns([]);
        fs.GetFiles("abc123").Returns(["abc123/report.pdf"]);
        fs.GetDirectories("abc123").Returns([]);
        fs.GetFiles("def456").Returns(["def456/photo.jpg", "def456\\photo-copy.jpg"]);
        fs.GetDirectories("def456").Returns(["def456/thumbs"]);
        fs.GetFiles("def456/thumbs").Returns(["def456/thumbs/small.jpg"]);
        fs.GetDirectories("def456/thumbs").Returns([]);
        fs.GetFiles("empty").Returns([]);
        fs.GetDirectories("empty").Returns([]);
        fs.GetSize(Arg.Any<string>()).Returns(call => call.Arg<string>().Length * 100L);
        fs.GetUrl(Arg.Any<string>()).Returns(call => "/media/" + call.Arg<string>().Replace('\\', '/'));
        fs.GetLastModified(Arg.Any<string>()).Returns(new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.Zero));
        fs.GetRelativePath(Arg.Any<string>()).Returns(call => call.Arg<string>().Replace("/media/", ""));
        return fs;
    }

    /// <summary>Every file in every folder, at any depth, with its size, URL and date, and the path normalised.</summary>
    [Fact]
    public void Walks_every_folder()
    {
        var files = new MediaDiskScanner(FileSystem()).Walk(CancellationToken.None);

        Assert.Equal(["abc123/report.pdf", "def456/photo.jpg", "def456/photo-copy.jpg", "def456/thumbs/small.jpg"], files.Select(file => file.RelativePath));
        var photo = files.Single(file => file.RelativePath == "def456/photo.jpg");
        Assert.Equal("/media/def456/photo.jpg", photo.Url);
        Assert.Equal(1600, photo.SizeBytes);
        Assert.Equal(new DateTime(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc), photo.LastModifiedUtc);
    }

    /// <summary>A file is orphaned when no item's file path names it, whatever the slashes and case.</summary>
    [Fact]
    public void Keeps_the_files_no_item_owns()
    {
        var files = new MediaDiskScanner(FileSystem()).Walk(CancellationToken.None);

        var orphans = MediaDiskScanner.OrphansOf(files, ["ABC123/Report.pdf", "def456\\photo.jpg"]);

        Assert.Equal(["def456/photo-copy.jpg", "def456/thumbs/small.jpg"], orphans.Select(file => file.RelativePath));
    }
}
