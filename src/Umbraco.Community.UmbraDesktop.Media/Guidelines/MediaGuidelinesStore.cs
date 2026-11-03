using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Media.Guidelines;

/// <summary>
/// Keeps the media guidelines in Umbraco's key-value store, as the desktop label keeps its switches.
/// </summary>
/// <param name="keyValueService">Umbraco's key-value store.</param>
public sealed class MediaGuidelinesStore(IKeyValueService keyValueService) : IMediaGuidelinesStore
{
    /// <summary>
    /// Key the guidelines are stored under.
    /// </summary>
    /// <remarks>
    /// Prefixed with the package id because the key-value store is one flat namespace shared with
    /// core and every other package on the site.
    /// </remarks>
    public const string StorageKey = "Umbraco.Community.UmbraDesktop.Media.Guidelines";

    /// <summary>Enum names rather than numbers, so a stored document is readable and diffable.</summary>
    private static readonly JsonSerializerOptions StorageJson = new()
    {
        Converters = { new JsonStringEnumConverter() },
    };

    /// <inheritdoc />
    /// <remarks>
    /// Read field by field rather than deserialised whole, the way the desktop label's store reads
    /// its document. Every Media Manager drop reads this, for every user, so one field this version
    /// does not understand must cost that field and never the rest.
    /// </remarks>
    public MediaGuidelines Read()
    {
        var defaults = MediaGuidelines.Default;
        if (Stored() is not { } document) return defaults;

        var maxSize = document[nameof(MediaGuidelines.MaxSize)] as JsonObject;
        var formats = document[nameof(MediaGuidelines.Formats)] as JsonObject;
        var location = document[nameof(MediaGuidelines.Location)] as JsonObject;

        return new MediaGuidelines(
            new MaxSizeGuideline(
                Switch(maxSize, nameof(MaxSizeGuideline.On), defaults.MaxSize.On),
                Number(maxSize, nameof(MaxSizeGuideline.LongestSide), 1, MediaGuidelines.LargestLongestSide, defaults.MaxSize.LongestSide)),
            new FormatsGuideline(
                Switch(formats, nameof(FormatsGuideline.On), defaults.Formats.On),
                Number(formats, nameof(FormatsGuideline.Quality), 1, 100, defaults.Formats.Quality),
                Format(formats, nameof(FormatsGuideline.Jpeg), defaults.Formats.Jpeg),
                Format(formats, nameof(FormatsGuideline.PngPhoto), defaults.Formats.PngPhoto),
                Format(formats, nameof(FormatsGuideline.PngTransparent), defaults.Formats.PngTransparent),
                Format(formats, nameof(FormatsGuideline.Webp), defaults.Formats.Webp),
                Format(formats, nameof(FormatsGuideline.Gif), defaults.Formats.Gif)),
            new LocationGuideline(Switch(location, nameof(LocationGuideline.On), defaults.Location.On)));
    }

    /// <inheritdoc />
    public void Write(MediaGuidelines guidelines) =>
        keyValueService.SetValue(StorageKey, JsonSerializer.Serialize(guidelines, StorageJson));

    /// <summary>
    /// Read and parse the stored document, tolerating anything unreadable.
    /// </summary>
    /// <returns>The stored document, or null when it is absent or is not a JSON object.</returns>
    private JsonObject? Stored()
    {
        var raw = keyValueService.GetValue(StorageKey);
        if (string.IsNullOrWhiteSpace(raw)) return null;

        try
        {
            return JsonNode.Parse(raw) as JsonObject;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Read one switch.
    /// </summary>
    /// <param name="part">The guideline's part of the document, if it has one.</param>
    /// <param name="name">The switch's property name.</param>
    /// <param name="fallback">Its default.</param>
    /// <returns>The switch, or its default when it is missing or not a boolean.</returns>
    private static bool Switch(JsonObject? part, string name, bool fallback) =>
        part?[name] is JsonValue value && value.TryGetValue<bool>(out var on) ? on : fallback;

    /// <summary>
    /// Read one whole number inside a range.
    /// </summary>
    /// <param name="part">The guideline's part of the document, if it has one.</param>
    /// <param name="name">The number's property name.</param>
    /// <param name="least">The smallest it may be.</param>
    /// <param name="most">The largest it may be.</param>
    /// <param name="fallback">Its default.</param>
    /// <returns>The number, or its default when it is missing, not a whole number, or out of range.</returns>
    private static int Number(JsonObject? part, string name, int least, int most, int fallback) =>
        part?[name] is JsonValue value && value.TryGetValue<int>(out var number) && number >= least && number <= most ? number : fallback;

    /// <summary>
    /// Read one format row.
    /// </summary>
    /// <remarks>
    /// By name only, and checked against the enum: <c>Enum.TryParse</c> accepts any number, defined or
    /// not, as the desktop label's store found for its corner.
    /// </remarks>
    /// <param name="part">The formats part of the document, if it has one.</param>
    /// <param name="name">The row's property name.</param>
    /// <param name="fallback">Its default.</param>
    /// <returns>The format, or its default when it is missing or not a format this version knows.</returns>
    private static MediaGuidelineFormat Format(JsonObject? part, string name, MediaGuidelineFormat fallback) =>
        part?[name] is JsonValue value
        && value.TryGetValue<string>(out var stored)
        && Enum.TryParse<MediaGuidelineFormat>(stored, out var format)
        && Enum.IsDefined(format)
        && !int.TryParse(stored, out _)
            ? format
            : fallback;
}
