using Umbraco.Community.UmbraDesktop.Media.Guidelines;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Guidelines;

/// <summary>
/// How the media guidelines are kept in Umbraco's key-value store (issue #179).
/// </summary>
/// <remarks>
/// Every Media Manager drop reads them, for every user, so the reader's job is to never let one
/// stored field this version does not understand cost more than that field.
/// </remarks>
public class MediaGuidelinesStoreTests
{
    /// <summary>The key-value store, in memory.</summary>
    private readonly InMemoryKeyValueService _values = new();

    /// <summary>The store under test.</summary>
    private MediaGuidelinesStore Store => new(_values);

    /// <summary>
    /// A site that never opened the settings gets the guidelines on: the issue's "on by default, so a
    /// site that never opens the settings still gets them".
    /// </summary>
    [Fact]
    public void A_site_that_never_set_them_gets_the_defaults_with_every_guideline_on()
    {
        var guidelines = Store.Read();

        Assert.Equal(MediaGuidelines.Default, guidelines);
        Assert.True(guidelines.MaxSize.On);
        Assert.Equal(2560, guidelines.MaxSize.LongestSide);
        Assert.True(guidelines.Formats.On);
        Assert.Equal(80, guidelines.Formats.Quality);
        Assert.Equal(MediaGuidelineFormat.Webp, guidelines.Formats.PngPhoto);
        Assert.Equal(MediaGuidelineFormat.Keep, guidelines.Formats.Jpeg);
        Assert.Equal(MediaGuidelineFormat.Keep, guidelines.Formats.PngTransparent);
        Assert.Equal(MediaGuidelineFormat.Keep, guidelines.Formats.Webp);
        Assert.Equal(MediaGuidelineFormat.Keep, guidelines.Formats.Gif);
        Assert.True(guidelines.Location.On);
    }

    /// <summary>What is written is what is read back.</summary>
    [Fact]
    public void Reads_back_what_was_written()
    {
        var written = new MediaGuidelines(
            new MaxSizeGuideline(false, 1920),
            new FormatsGuideline(true, 65, MediaGuidelineFormat.Webp, MediaGuidelineFormat.Jpeg, MediaGuidelineFormat.Keep, MediaGuidelineFormat.Keep, MediaGuidelineFormat.Png),
            new LocationGuideline(false));

        Store.Write(written);

        Assert.Equal(written, Store.Read());
    }

    /// <summary>
    /// Formats are stored by name, so the stored document is readable, and so a reorder of the enum
    /// in a later version cannot turn every stored WebP into something else.
    /// </summary>
    [Fact]
    public void Stores_formats_by_name()
    {
        Store.Write(MediaGuidelines.Default);

        Assert.Contains("\"Webp\"", _values.Values[MediaGuidelinesStore.StorageKey]);
    }

    /// <summary>Something that is not JSON reads as the defaults rather than failing every drop.</summary>
    [Fact]
    public void A_document_that_is_not_json_reads_as_the_defaults()
    {
        _values.Values[MediaGuidelinesStore.StorageKey] = "{ not json";

        Assert.Equal(MediaGuidelines.Default, Store.Read());
    }

    /// <summary>
    /// One field this version cannot read costs that field and keeps the rest: here an unknown
    /// format, a quality out of range and a switch that is not a boolean.
    /// </summary>
    [Fact]
    public void A_field_it_cannot_read_takes_its_default_and_keeps_the_rest()
    {
        _values.Values[MediaGuidelinesStore.StorageKey] = """
            {
              "MaxSize": { "On": "yes", "LongestSide": 1600 },
              "Formats": { "On": false, "Quality": 400, "Jpeg": "Avif", "PngPhoto": "Jpeg", "Gif": 3 },
              "Location": { "On": false }
            }
            """;

        var guidelines = Store.Read();

        Assert.True(guidelines.MaxSize.On);
        Assert.Equal(1600, guidelines.MaxSize.LongestSide);
        Assert.False(guidelines.Formats.On);
        Assert.Equal(80, guidelines.Formats.Quality);
        Assert.Equal(MediaGuidelineFormat.Keep, guidelines.Formats.Jpeg);
        Assert.Equal(MediaGuidelineFormat.Jpeg, guidelines.Formats.PngPhoto);
        Assert.Equal(MediaGuidelineFormat.Keep, guidelines.Formats.Gif);
        Assert.False(guidelines.Location.On);
    }

    /// <summary>A longest side the check could not use reads as the default one.</summary>
    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(MediaGuidelines.LargestLongestSide + 1)]
    public void A_longest_side_out_of_range_reads_as_the_default(int side)
    {
        _values.Values[MediaGuidelinesStore.StorageKey] = $$"""{ "MaxSize": { "On": true, "LongestSide": {{side}} } }""";

        Assert.Equal(2560, Store.Read().MaxSize.LongestSide);
    }
}
