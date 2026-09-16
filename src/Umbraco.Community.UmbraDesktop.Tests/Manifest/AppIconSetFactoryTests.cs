using NSubstitute;
using Umbraco.Cms.Core.Media;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.Routing;
using Umbraco.Community.UmbraDesktop.Manifest;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Manifest;

/// <summary>
/// Exercises the icon entries each mode produces, and the one invariant every mode must satisfy:
/// a <c>sizes</c> value, because an entry without one is silently not installable.
/// </summary>
public class AppIconSetFactoryTests
{
    /// <summary>A stand-in media key for the Custom mode cases.</summary>
    private static readonly Guid MediaKey = Guid.Parse("11111111-1111-1111-1111-111111111111");

    /// <summary>The URL the stubbed provider resolves <see cref="MediaKey"/> to.</summary>
    private const string MediaUrl = "/media/abc123/logo.png";

    /// <summary>
    /// Builds a factory whose media URL and image generation are stubbed.
    /// </summary>
    /// <remarks>
    /// The generator echoes its own options back rather than producing a realistic URL, so the
    /// tests can assert what was <i>asked for</i>. The real URL shape is ImageSharp's to decide —
    /// including whether it carries an HMAC token — and pinning it here would make this suite fail
    /// on a site that signs its images, which is exactly the configuration it must support.
    /// </remarks>
    /// <param name="mediaUrl">What the URL provider returns, or null to model deleted media.</param>
    /// <returns>The factory under test.</returns>
    private static AppIconSetFactory Build(string? mediaUrl = MediaUrl)
    {
        var urls = Substitute.For<IPublishedUrlProvider>();
        urls.GetMediaUrl(
                MediaKey,
                Arg.Any<UrlMode>(),
                Arg.Any<string?>(),
                Arg.Any<string?>(),
                Arg.Any<Uri?>())
            .Returns(mediaUrl);

        var generator = Substitute.For<IImageUrlGenerator>();
        generator.GetImageUrl(Arg.Any<ImageUrlGenerationOptions>())
            .Returns(call =>
            {
                var options = call.Arg<ImageUrlGenerationOptions>();
                return $"{options.ImageUrl}?w={options.Width}&h={options.Height}&m={options.ImageCropMode}";
            });

        return new AppIconSetFactory(urls, generator);
    }

    /// <summary>The shipped mode advertises all three renders, maskable included.</summary>
    [Fact]
    public void Default_mode_advertises_the_shipped_renders()
    {
        var icons = Build().Create(AppIconSource.Default);

        Assert.Contains(icons, i => i.Sizes == "192x192" && i.Purpose is null);
        Assert.Contains(icons, i => i.Sizes == "512x512" && i.Purpose is null);
        // A separate drawing, not this one re-exported: the maskable render stops on the safe
        // boundary while the ordinary one fills its box, so a taskbar does not draw us small.
        Assert.Contains(icons, i => i.Sizes == "512x512" && i.Purpose == "maskable");
    }

    /// <summary>
    /// Custom mode asks Umbraco for the media at each size it needs.
    /// </summary>
    /// <remarks>
    /// Both URLs come from <see cref="IImageUrlGenerator"/> over the media's own URL, never from
    /// string concatenation. That is what applies Umbraco's HMAC signature to the processing
    /// parameters, and — more importantly — it is the only form that is correct on a site whose
    /// media lives in blob storage rather than on local disk, where the provider resolves media
    /// entirely differently.
    /// </remarks>
    [Fact]
    public void Custom_mode_asks_umbraco_for_each_size()
    {
        var icons = Build().Create(new AppIconSource(AppIconMode.Custom, MediaKey));

        Assert.Equal(2, icons.Count);
        Assert.Contains(icons, i => i.Sizes == "192x192" && i.Src.Contains("w=192"));
        Assert.Contains(icons, i => i.Sizes == "512x512" && i.Src.Contains("w=512"));
        Assert.All(icons, i => Assert.StartsWith(MediaUrl, i.Src));
    }

    /// <summary>
    /// A non-square upload is cropped rather than letterboxed.
    /// </summary>
    /// <remarks>
    /// An app icon that does not fill its tile reads as broken, where a crop reads as a crop.
    /// </remarks>
    [Fact]
    public void Custom_mode_crops_to_a_square()
    {
        var icons = Build().Create(new AppIconSource(AppIconMode.Custom, MediaKey));

        Assert.All(icons, i => Assert.Contains($"m={ImageCropMode.Crop}", i.Src));
        Assert.Contains(icons, i => i.Src.Contains("w=192") && i.Src.Contains("h=192"));
    }

    /// <summary>
    /// Media that has been deleted falls back to the shipped mark.
    /// </summary>
    /// <remarks>
    /// The resolver already turns Custom-with-no-key into Default, but it cannot know the key still
    /// resolves to something. Losing the picture must never cost the install, because a manifest
    /// with no usable icon is not installable at all.
    /// </remarks>
    [Fact]
    public void Custom_mode_falls_back_when_the_media_has_gone()
    {
        var icons = Build(mediaUrl: null).Create(new AppIconSource(AppIconMode.Custom, MediaKey));

        Assert.Contains(icons, i => i.Src.Contains("appicons/icon-512.png"));
    }

    /// <summary>Nothing the factory emits may point into the management API.</summary>
    /// <param name="mode">The mode under test.</param>
    [Theory]
    [InlineData(AppIconMode.Default)]
    [InlineData(AppIconMode.Custom)]
    public void Never_points_at_the_management_api(AppIconMode mode)
    {
        var icons = Build().Create(new AppIconSource(mode, mode == AppIconMode.Custom ? MediaKey : null));

        Assert.All(icons, i => Assert.DoesNotContain("management/api", i.Src));
        Assert.All(icons, i => Assert.DoesNotContain(".ico", i.Src));
    }

    /// <summary>
    /// Every mode declares a <c>sizes</c>, because omitting it costs installability outright.
    /// </summary>
    /// <remarks>
    /// Measured against Chrome 153 rather than taken from documentation: a lone <c>512x512</c>
    /// installs, and an entry with no <c>sizes</c> at all does not — silently, with no error
    /// anywhere. MDN's "must contain both 192 and 512" is stricter than the real criterion.
    ///
    /// <para>
    /// <c>sizes: "any"</c> installs too, but only for a format the browser can actually use. It was
    /// how the removed Favicon mode declared an <c>.ico</c>, and it made Chrome choose that entry
    /// and then abandon the install rather than fall back to a sibling PNG.
    /// </para>
    /// </remarks>
    /// <param name="mode">The mode under test.</param>
    [Theory]
    [InlineData(AppIconMode.Default)]
    [InlineData(AppIconMode.Custom)]
    public void Every_mode_declares_a_size(AppIconMode mode)
    {
        var icons = Build().Create(new AppIconSource(mode, mode == AppIconMode.Custom ? MediaKey : null));

        Assert.NotEmpty(icons);
        Assert.All(icons, i => Assert.False(string.IsNullOrWhiteSpace(i.Sizes)));
    }
}
