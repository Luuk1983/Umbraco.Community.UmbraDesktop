using Umbraco.Cms.Core;
using Umbraco.Community.UmbraDesktop.Media.Health;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>
/// The files a media item owns, read from its properties (design §15): every Upload field and every
/// Image Cropper, not only <c>umbracoFile</c>, since a site's own media type can hold two files.
/// </summary>
public class MediaFilePathsTests
{
    /// <summary>An Upload field holds the path as text; an Image Cropper holds it as JSON with a <c>src</c>.</summary>
    [Fact]
    public void Reads_upload_fields_and_image_croppers()
    {
        var paths = MediaFilePaths.FromValues(
        [
            new MediaPropertyValue(Constants.PropertyEditors.Aliases.UploadField, "/media/abc123/report.pdf"),
            new MediaPropertyValue(Constants.PropertyEditors.Aliases.ImageCropper, """{"src":"/media/def456/photo.jpg","focalPoint":{"left":0.5,"top":0.5}}"""),
        ]);

        Assert.Equal(["/media/abc123/report.pdf", "/media/def456/photo.jpg"], paths);
    }

    /// <summary>Anything that is not a file property, is empty, or cannot be read is left out, never thrown on.</summary>
    [Fact]
    public void Skips_other_editors_empty_values_and_broken_json()
    {
        var paths = MediaFilePaths.FromValues(
        [
            new MediaPropertyValue(Constants.PropertyEditors.Aliases.MediaPicker3, "[{\"key\":\"x\"}]"),
            new MediaPropertyValue(Constants.PropertyEditors.Aliases.UploadField, ""),
            new MediaPropertyValue(Constants.PropertyEditors.Aliases.UploadField, null),
            new MediaPropertyValue(Constants.PropertyEditors.Aliases.ImageCropper, "{not json"),
            new MediaPropertyValue(Constants.PropertyEditors.Aliases.ImageCropper, "{\"focalPoint\":null}"),
            new MediaPropertyValue(Constants.PropertyEditors.Aliases.ImageCropper, "/media/plain/legacy.png"),
        ]);

        Assert.Equal(["/media/plain/legacy.png"], paths);
    }
}
