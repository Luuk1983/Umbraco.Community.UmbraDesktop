using System.Text.Json.Serialization;

namespace Umbraco.Community.UmbraDesktop.Manifest;

/// <summary>
/// One entry in a manifest's <c>icons</c> array.
/// </summary>
/// <param name="Src">Absolute path to the image.</param>
/// <param name="Sizes">The <c>WxH</c> size string, or <c>any</c> for a vector or an unknown size.</param>
/// <param name="Type">The image's media type.</param>
/// <param name="Purpose">
/// <c>maskable</c> for the padded render, or null for an ordinary icon. Null rather than
/// <c>"any"</c> because an entry with no purpose already means any.
/// <para>
/// The null is <b>omitted</b> rather than serialised. A literal <c>"purpose": null</c> is not a
/// space-separated keyword list and a browser is entitled to discard the whole icon entry over it —
/// which would cost installability, since a manifest is only installable while it still has a 192
/// and a 512.
/// </para>
/// </param>
public sealed record WebAppManifestIcon(
    [property: JsonPropertyName("src")] string Src,
    [property: JsonPropertyName("sizes")] string Sizes,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("purpose")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? Purpose);

/// <summary>
/// The served web app manifest.
/// </summary>
/// <remarks>
/// Property names are snake_case by explicit attribute rather than by a naming policy, because this
/// record is serialised by whatever options the host has configured, and a policy set elsewhere is
/// a silent way to ship a manifest no browser understands.
/// </remarks>
/// <param name="Id">
/// The app's stable identity. Different ids are distinct applications even when served from the
/// same URL, which is what lets a site's own frontend PWA and its backoffice install side by side.
/// Set explicitly so a later change to <paramref name="StartUrl"/> updates the installed app rather
/// than orphaning it.
/// </param>
/// <param name="Name">Full name, shown in install dialogs.</param>
/// <param name="ShortName">Short name, shown where space is tight.</param>
/// <param name="StartUrl">Where the installed app opens: the desktop section.</param>
/// <param name="Scope">
/// Which URLs stay inside the installed window. The backoffice root, so leaving the desktop for
/// <c>/section/content</c> does not eject the user into a browser tab.
/// </param>
/// <param name="Display">Always <c>standalone</c>. The member the whole feature exists for.</param>
/// <param name="BackgroundColor">Painted before the app renders.</param>
/// <param name="ThemeColor">The OS window chrome's colour.</param>
/// <param name="Icons">The icon set.</param>
public sealed record WebAppManifest(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("short_name")] string ShortName,
    [property: JsonPropertyName("start_url")] string StartUrl,
    [property: JsonPropertyName("scope")] string Scope,
    [property: JsonPropertyName("display")] string Display,
    [property: JsonPropertyName("background_color")] string BackgroundColor,
    [property: JsonPropertyName("theme_color")] string ThemeColor,
    [property: JsonPropertyName("icons")] IReadOnlyList<WebAppManifestIcon> Icons);
