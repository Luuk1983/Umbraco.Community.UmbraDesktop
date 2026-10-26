using System.Text.Json;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Models;

namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>
/// The files a media item owns, read from its properties (design §15).
/// </summary>
/// <remarks>
/// Every Upload field and every Image Cropper on the item, not only <c>umbracoFile</c>: a site's own
/// media type can hold a second file, and a disk scan that read one property would list the other as
/// orphaned and offer to delete it. An Upload field stores the path as text; an Image Cropper stores
/// JSON with a <c>src</c>, or, from an older site, the path as text. Anything unreadable is left out
/// rather than thrown on, since one odd item must not stop a check of the whole library.
/// </remarks>
internal static class MediaFilePaths
{
    /// <summary>The editors that hold a file.</summary>
    private static readonly HashSet<string> FileEditors = new(StringComparer.OrdinalIgnoreCase)
    {
        Constants.PropertyEditors.Aliases.UploadField,
        Constants.PropertyEditors.Aliases.ImageCropper,
    };

    /// <summary>The file paths an item's properties name, as stored, such as <c>/media/abc123/photo.jpg</c>.</summary>
    /// <param name="media">The item.</param>
    /// <returns>The paths, in property order.</returns>
    public static IReadOnlyList<string> Of(IContentBase media) =>
        FromValues(media.Properties.Select(property => new MediaPropertyValue(property.PropertyType.PropertyEditorAlias, property.GetValue()?.ToString())));

    /// <summary>The file paths a set of property values name.</summary>
    /// <param name="values">The properties, each with its editor and its stored text.</param>
    /// <returns>The paths, in the order given.</returns>
    public static IReadOnlyList<string> FromValues(IEnumerable<MediaPropertyValue> values)
    {
        var paths = new List<string>();
        foreach (var value in values)
        {
            if (!FileEditors.Contains(value.EditorAlias) || string.IsNullOrWhiteSpace(value.Value))
            {
                continue;
            }

            var path = value.Value.TrimStart().StartsWith('{') ? SourceOf(value.Value) : value.Value;
            if (!string.IsNullOrWhiteSpace(path))
            {
                paths.Add(path);
            }
        }

        return paths;
    }

    /// <summary>The <c>src</c> of an Image Cropper's JSON, or null when there is none or it is not JSON.</summary>
    /// <param name="json">The stored value.</param>
    /// <returns>The path, or null.</returns>
    private static string? SourceOf(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.TryGetProperty("src", out var source) && source.ValueKind == JsonValueKind.String ? source.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
