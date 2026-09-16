using Umbraco.Community.UmbraDesktop.Manifest;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Manifest;

/// <summary>
/// Exercises <see cref="WebAppManifestBuilder"/>, which is the only place manifest paths are
/// derived. Every case here is a path the package would otherwise get wrong on a site that has
/// moved its backoffice, which is configurable and therefore never safe to assume.
/// </summary>
public class WebAppManifestBuilderTests
{
    /// <summary>The icon set every test uses; its contents are irrelevant to path derivation.</summary>
    private static readonly IReadOnlyList<WebAppManifestIcon> Icons =
    [
        new("/App_Plugins/Umbraco.Community.UmbraDesktop/appicons/icon-192.png", "192x192", "image/png", null),
    ];

    /// <summary>Builds with the default backoffice path, so the common case is pinned.</summary>
    [Fact]
    public void Builds_the_default_backoffice_paths()
    {
        var manifest = new WebAppManifestBuilder().Build("/umbraco", "Contoso", Icons);

        Assert.Equal("/umbraco/umbradesktop", manifest.Id);
        Assert.Equal("/umbraco/section/umbradesktop", manifest.StartUrl);
        Assert.Equal("/umbraco/", manifest.Scope);
    }

    /// <summary>
    /// A configured backoffice path must flow through every derived path. This is the case that
    /// makes the builder worth existing rather than inlining the strings in the controller.
    /// </summary>
    [Fact]
    public void Honours_a_configured_backoffice_path()
    {
        var manifest = new WebAppManifestBuilder().Build("/manage", "Contoso", Icons);

        Assert.Equal("/manage/umbradesktop", manifest.Id);
        Assert.Equal("/manage/section/umbradesktop", manifest.StartUrl);
        Assert.Equal("/manage/", manifest.Scope);
    }

    /// <summary>
    /// A trailing slash must not double up. Umbraco's own base href carries one
    /// (<c>&lt;base href="/umbraco/" /&gt;</c>), so this is the shape the value actually arrives in.
    /// </summary>
    [Fact]
    public void Normalises_a_trailing_slash()
    {
        var manifest = new WebAppManifestBuilder().Build("/umbraco/", "Contoso", Icons);

        Assert.Equal("/umbraco/section/umbradesktop", manifest.StartUrl);
        Assert.Equal("/umbraco/", manifest.Scope);
    }

    /// <summary>
    /// Scope must always end in a slash. Without it a sibling path that merely starts the same —
    /// <c>/umbraco-admin</c> against a scope of <c>/umbraco</c> — falls inside the installed app.
    /// </summary>
    [Fact]
    public void Scope_always_ends_in_a_slash()
    {
        Assert.EndsWith("/", new WebAppManifestBuilder().Build("/manage", "X", Icons).Scope);
        Assert.EndsWith("/", new WebAppManifestBuilder().Build("/manage/", "X", Icons).Scope);
    }

    /// <summary>Display must be standalone; it is the member the whole feature exists for.</summary>
    [Fact]
    public void Is_standalone()
    {
        Assert.Equal("standalone", new WebAppManifestBuilder().Build("/umbraco", "X", Icons).Display);
    }

    /// <summary>
    /// The site name becomes both names. <c>short_name</c> is what a taskbar shows when space is
    /// tight, so it is truncated rather than left to be clipped mid-word by the OS.
    /// </summary>
    [Fact]
    public void Uses_the_site_name_for_both_names()
    {
        var manifest = new WebAppManifestBuilder().Build("/umbraco", "Contoso Corporate Website", Icons);

        Assert.Equal("Contoso Corporate Website", manifest.Name);
        Assert.Equal("Contoso", manifest.ShortName);
    }

    /// <summary>
    /// A long name is shortened at a separator, never mid-word.
    /// </summary>
    /// <remarks>
    /// The dotted case is not hypothetical and is why this test exists: the TestInstance's own
    /// <c>SiteName</c> is <c>Umbraco.Community.UmbraDesktop.TestInstance</c>, and splitting on
    /// spaces alone produced <c>Umbraco.Comm</c> — mid-word, and exactly what the method's
    /// documentation claimed it would never do. A site name is as likely to be dotted or hyphenated
    /// as spaced.
    /// </remarks>
    /// <param name="siteName">The full site name.</param>
    /// <param name="expected">The short name it should shorten to.</param>
    [Theory]
    [InlineData("Contoso Corporate Website", "Contoso")]
    [InlineData("Umbraco.Community.UmbraDesktop.TestInstance", "Umbraco")]
    [InlineData("contoso-corporate-website", "contoso")]
    [InlineData("contoso_corporate_website", "contoso")]
    // No separator anywhere and too long to keep: a hard cut is the only option left, but it is the
    // last resort rather than the first move.
    [InlineData("Supercalifragilistic", "Supercalifra")]
    // Short enough already, so it is left exactly as it is.
    [InlineData("Contoso", "Contoso")]
    public void Shortens_a_long_name_at_a_separator(string siteName, string expected)
    {
        Assert.Equal(expected, new WebAppManifestBuilder().Build("/umbraco", siteName, Icons).ShortName);
    }

    /// <summary>
    /// A site with no name still has to produce an installable manifest, because <c>name</c> is
    /// required. Falling back keeps a nameless site from silently losing installability.
    /// </summary>
    /// <param name="siteName">The absent name under test.</param>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Falls_back_when_the_site_has_no_name(string? siteName)
    {
        var manifest = new WebAppManifestBuilder().Build("/umbraco", siteName, Icons);

        Assert.Equal("Umbraco", manifest.Name);
        Assert.Equal("Umbraco", manifest.ShortName);
    }
}
