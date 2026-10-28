namespace Umbraco.Community.UmbraDesktop.Media.Guidelines;

/// <summary>
/// What a kind of image should be uploaded as: its own format, or one of the three the browser writes.
/// </summary>
/// <remarks>
/// Stored by name rather than by number, so a stored document is readable and a later reorder of
/// this enum cannot turn every stored WebP into something else. A stored name this version does not
/// know reads as that row's default.
/// </remarks>
public enum MediaGuidelineFormat
{
    /// <summary>Leave the file in its own format.</summary>
    Keep = 0,

    /// <summary>JPEG, at the guideline's quality.</summary>
    Jpeg = 1,

    /// <summary>PNG, which keeps every pixel.</summary>
    Png = 2,

    /// <summary>WebP, at the guideline's quality.</summary>
    Webp = 3,
}

/// <summary>
/// Maximum size: a picture whose longest side is longer than this is flagged, and resized to it.
/// </summary>
/// <param name="On">Whether the guideline applies.</param>
/// <param name="LongestSide">The longest a picture's longer side may be, in pixels.</param>
public sealed record MaxSizeGuideline(bool On, int LongestSide);

/// <summary>
/// Formats: what each kind of image should be. A row not set to Keep flags the file, and also sets
/// the format a file resized for Maximum size is saved in.
/// </summary>
/// <param name="On">Whether the guideline applies.</param>
/// <param name="Quality">1 to 100, for JPEG and WebP.</param>
/// <param name="Jpeg">What a JPEG should be.</param>
/// <param name="PngPhoto">What a PNG with no transparent pixel should be.</param>
/// <param name="PngTransparent">What a PNG with transparency should be.</param>
/// <param name="Webp">What a WebP should be.</param>
/// <param name="Gif">What a still GIF should be. Animated GIFs are always left alone.</param>
public sealed record FormatsGuideline(
    bool On,
    int Quality,
    MediaGuidelineFormat Jpeg,
    MediaGuidelineFormat PngPhoto,
    MediaGuidelineFormat PngTransparent,
    MediaGuidelineFormat Webp,
    MediaGuidelineFormat Gif);

/// <summary>
/// Location: a photo that records where it was taken is flagged, and has that removed.
/// </summary>
/// <param name="On">Whether the guideline applies.</param>
public sealed record LocationGuideline(bool On);

/// <summary>
/// The site's media guidelines (issue #179): what files dropped or pasted into a Media Manager are
/// checked against, in the browser, before they are uploaded. One set for the whole site.
/// </summary>
/// <remarks>
/// The check and the fixes are the browser's; the server only keeps the settings. Nothing here
/// changes core's own upload, which these are never applied to.
/// </remarks>
/// <param name="MaxSize">Maximum size.</param>
/// <param name="Formats">Formats.</param>
/// <param name="Location">Location.</param>
public sealed record MediaGuidelines(MaxSizeGuideline MaxSize, FormatsGuideline Formats, LocationGuideline Location)
{
    /// <summary>
    /// The longest side a guideline may name, in pixels: well beyond any camera, and small enough that
    /// a typo of an extra digit or two is refused rather than switching the guideline off in effect.
    /// </summary>
    public const int LargestLongestSide = 20000;

    /// <summary>
    /// What a site that never opened the settings gets: every guideline on, 2560 pixels, PNG photos to
    /// WebP at 80, and every other kind kept.
    /// </summary>
    /// <remarks>
    /// On, because the issue asks that a site which never opens the settings still gets them. 2560
    /// and 80 are Optimize images' own defaults (its design D11), so a file fixed on its way in looks
    /// like one fixed afterwards.
    /// </remarks>
    public static MediaGuidelines Default { get; } = new(
        new MaxSizeGuideline(true, 2560),
        new FormatsGuideline(true, 80, MediaGuidelineFormat.Keep, MediaGuidelineFormat.Webp, MediaGuidelineFormat.Keep, MediaGuidelineFormat.Keep, MediaGuidelineFormat.Keep),
        new LocationGuideline(true));
}
