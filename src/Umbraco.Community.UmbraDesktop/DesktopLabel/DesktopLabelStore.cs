using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.DesktopLabel;

/// <summary>
/// Keeps the desktop label's switches in Umbraco's key-value store.
/// </summary>
/// <remarks>
/// A document of its own rather than three more fields on the app identity document. Every
/// backoffice user reads this one, while the app identity is a Settings-only concern, and that
/// document already makes every write carry all of its fields. Joining it would widen that rule for
/// nothing.
/// </remarks>
/// <param name="keyValueService">Umbraco's key-value store.</param>
public sealed class DesktopLabelStore(IKeyValueService keyValueService) : IDesktopLabelStore
{
    /// <summary>
    /// Key the switches are stored under.
    /// </summary>
    /// <remarks>
    /// Prefixed with the package id because the key-value store is one flat namespace shared with
    /// core and every other package on the site.
    /// </remarks>
    public const string StorageKey = "Umbraco.Community.UmbraDesktop.DesktopLabel";

    /// <summary>Enum names rather than numbers, so a stored document is readable and diffable.</summary>
    private static readonly JsonSerializerOptions StorageJson = new()
    {
        Converters = { new JsonStringEnumConverter() },
    };

    /// <inheritdoc />
    /// <remarks>
    /// Read field by field rather than deserialised whole, the way <c>AppIdentityResolver</c> reads
    /// its document. This runs on every desktop load, for every user, so one field this version does
    /// not understand must cost that field and never the label.
    /// </remarks>
    public DesktopLabelSettings Read()
    {
        if (Stored() is not { } document) return DesktopLabelSettings.Default;

        return new DesktopLabelSettings(
            Switch(document, nameof(DesktopLabelSettings.Show)),
            Corner(document),
            Switch(document, nameof(DesktopLabelSettings.ShowDomain)));
    }

    /// <inheritdoc />
    public void Write(DesktopLabelSettings settings) =>
        keyValueService.SetValue(StorageKey, JsonSerializer.Serialize(settings, StorageJson));

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
    /// Read one switch, treating anything but a JSON boolean as off.
    /// </summary>
    /// <param name="document">The stored document.</param>
    /// <param name="name">The switch's property name.</param>
    /// <returns>The switch, or false when it is missing or not a boolean.</returns>
    private static bool Switch(JsonObject document, string name) =>
        document[name] is JsonValue value && value.TryGetValue<bool>(out var on) && on;

    /// <summary>
    /// Read the corner, treating anything but a defined corner's name as top right.
    /// </summary>
    /// <remarks>
    /// The <see cref="Enum.IsDefined{TEnum}(TEnum)"/> check is not belt and braces.
    /// <c>Enum.TryParse</c> accepts any number, defined or not, so a stored "7" would otherwise come
    /// back as a corner that does not exist and the label would be drawn nowhere.
    /// </remarks>
    /// <param name="document">The stored document.</param>
    /// <returns>The stored corner, or top right.</returns>
    private static DesktopLabelCorner Corner(JsonObject document) =>
        document[nameof(DesktopLabelSettings.Corner)] is JsonValue value
        && value.TryGetValue<string>(out var name)
        && Enum.TryParse<DesktopLabelCorner>(name, out var corner)
        && Enum.IsDefined(corner)
            ? corner
            : DesktopLabelCorner.TopRight;
}
