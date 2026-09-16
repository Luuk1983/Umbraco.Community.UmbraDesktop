using System.Text.Json;
using Umbraco.Community.UmbraDesktop.Manifest;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Manifest;

/// <summary>
/// Exercises the JSON the manifest actually serialises to.
/// </summary>
/// <remarks>
/// The manifest is a contract with a browser rather than with our own code, so its shape is the
/// thing under test and not merely an implementation detail. Nothing here would be caught by
/// <see cref="WebAppManifestBuilderTests"/>, which only ever looks at properties.
/// </remarks>
public class WebAppManifestSerialisationTests
{
    /// <summary>A manifest with one plain icon and one maskable, which is the shipped shape.</summary>
    /// <returns>The serialised JSON, parsed.</returns>
    private static JsonElement Serialise()
    {
        var manifest = new WebAppManifestBuilder().Build(
            "/umbraco",
            "Contoso",
            [
                new("/appicons/icon-192.png", "192x192", "image/png", null),
                new("/appicons/icon-512-maskable.png", "512x512", "image/png", "maskable"),
            ]);

        // Default options on purpose: the point is that the record carries its own naming, so it
        // does not depend on how the host happens to have configured MVC's serialiser.
        return JsonDocument.Parse(JsonSerializer.Serialize(manifest)).RootElement;
    }

    /// <summary>
    /// The members a browser reads are snake_case. Getting this wrong produces a manifest that
    /// parses cleanly and is silently not installable.
    /// </summary>
    [Fact]
    public void Writes_the_snake_case_member_names()
    {
        var json = Serialise();

        Assert.Equal("/umbraco/section/umbradesktop", json.GetProperty("start_url").GetString());
        Assert.Equal("Contoso", json.GetProperty("short_name").GetString());
        Assert.Equal("#3544B1", json.GetProperty("theme_color").GetString());
        Assert.Equal("#3544B1", json.GetProperty("background_color").GetString());
    }

    /// <summary>
    /// An ordinary icon omits <c>purpose</c> entirely rather than writing null.
    /// </summary>
    /// <remarks>
    /// A literal <c>"purpose": null</c> is not a space-separated keyword list, and a browser is
    /// entitled to discard the icon entry over it — which costs installability, because a manifest
    /// is only installable while it still has a 192 and a 512.
    /// </remarks>
    [Fact]
    public void Omits_purpose_on_an_ordinary_icon_rather_than_writing_null()
    {
        var icon = Serialise().GetProperty("icons")[0];

        Assert.False(
            icon.TryGetProperty("purpose", out _),
            "purpose must be absent on an ordinary icon, not present and null");
    }

    /// <summary>The maskable entry keeps its purpose, which is what makes it the maskable one.</summary>
    [Fact]
    public void Keeps_purpose_on_the_maskable_icon()
    {
        var icon = Serialise().GetProperty("icons")[1];

        Assert.Equal("maskable", icon.GetProperty("purpose").GetString());
    }
}
