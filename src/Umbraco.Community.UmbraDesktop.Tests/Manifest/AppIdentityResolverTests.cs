using Microsoft.Extensions.Options;
using NSubstitute;
using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Configuration;
using Umbraco.Community.UmbraDesktop.Manifest;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Manifest;

/// <summary>
/// Exercises the resolution order that lets configuration and the backoffice coexist: appsettings
/// wins when present, the key-value store answers when it does not, and for the name there is a
/// third step — Umbraco's own site name — before giving up.
/// </summary>
public class AppIdentityResolverTests
{
    /// <summary>A stand-in media key for the Custom mode cases.</summary>
    private static readonly Guid MediaKey = Guid.Parse("11111111-1111-1111-1111-111111111111");

    /// <summary>Builds a resolver over the given configuration, stored document and site name.</summary>
    /// <param name="options">The package's appsettings section, or null for an absent one.</param>
    /// <param name="stored">The raw stored document, or null for nothing stored.</param>
    /// <param name="siteName">
    /// Umbraco's own configured site name. Null models the common case: a site that never set
    /// <c>Umbraco:CMS:Hosting:SiteName</c> at all.
    /// </param>
    /// <returns>The resolver under test.</returns>
    private static AppIdentityResolver Build(
        UmbraDesktopOptions? options,
        string? stored,
        string? siteName = null)
    {
        var keyValue = Substitute.For<IKeyValueService>();
        keyValue.GetValue(AppIdentityResolver.StorageKey).Returns(stored);

        return new AppIdentityResolver(
            Options.Create(options ?? new UmbraDesktopOptions()),
            Options.Create(new HostingSettings { SiteName = siteName }),
            keyValue);
    }

    // ---- icon ----

    /// <summary>Nothing anywhere resolves to the shipped mark.</summary>
    [Fact]
    public void Falls_back_to_the_default_icon()
    {
        Assert.Equal(AppIconSource.Default, Build(null, null).ResolveIcon());
    }

    /// <summary>With no configuration, the stored value decides.</summary>
    [Fact]
    public void Uses_the_stored_icon_when_configuration_is_absent()
    {
        var resolved = Build(null, """{"AppIcon":{"Mode":"Custom","MediaKey":"11111111-1111-1111-1111-111111111111"}}""").ResolveIcon();

        Assert.Equal(AppIconMode.Custom, resolved.Mode);
    }

    /// <summary>
    /// Configuration beats the store.
    /// </summary>
    /// <remarks>
    /// The case the whole two-source design exists for: a database restored from another
    /// environment brings its icon with it, and configuration is what stops staging coming back
    /// wearing production's.
    /// </remarks>
    [Fact]
    public void Configured_icon_wins_over_the_stored_icon()
    {
        var options = new UmbraDesktopOptions { AppIcon = new AppIconOptions { Mode = AppIconMode.Default } };

        var resolved = Build(options, """{"AppIcon":{"Mode":"Custom","MediaKey":"11111111-1111-1111-1111-111111111111"}}""").ResolveIcon();

        Assert.Equal(AppIconMode.Default, resolved.Mode);
    }

    /// <summary>A configured custom icon carries its media key through.</summary>
    [Fact]
    public void Carries_the_configured_media_key()
    {
        var options = new UmbraDesktopOptions
        {
            AppIcon = new AppIconOptions { Mode = AppIconMode.Custom, MediaKey = MediaKey },
        };

        var resolved = Build(options, null).ResolveIcon();

        Assert.Equal(AppIconMode.Custom, resolved.Mode);
        Assert.Equal(MediaKey, resolved.MediaKey);
    }

    /// <summary>A stored custom icon carries its media key through too.</summary>
    [Fact]
    public void Carries_the_stored_media_key()
    {
        // Three '$' so interpolation is {{{ }}}, leaving the JSON's own trailing }} literal.
        var stored = $$$"""{"AppIcon":{"Mode":"Custom","MediaKey":"{{{MediaKey}}}"}}""";

        var resolved = Build(null, stored).ResolveIcon();

        Assert.Equal(AppIconMode.Custom, resolved.Mode);
        Assert.Equal(MediaKey, resolved.MediaKey);
    }

    /// <summary>
    /// Custom with no media falls back to the default rather than resolving to an empty icon set.
    /// </summary>
    /// <remarks>
    /// A manifest with no usable icon is not installable at all, so this failure mode would take
    /// the whole feature down rather than just showing the wrong picture.
    /// </remarks>
    [Fact]
    public void Custom_without_media_falls_back_to_the_default()
    {
        var options = new UmbraDesktopOptions
        {
            AppIcon = new AppIconOptions { Mode = AppIconMode.Custom, MediaKey = null },
        };

        Assert.Equal(AppIconSource.Default, Build(options, null).ResolveIcon());
    }

    /// <summary>
    /// Unreadable stored JSON resolves to the default instead of throwing.
    /// </summary>
    /// <remarks>
    /// This runs inside an anonymous endpoint that a browser hits unprompted, so an exception here
    /// is a 500 on a URL nobody chose to visit.
    /// </remarks>
    [Fact]
    public void Unreadable_stored_document_falls_back_to_the_default()
    {
        Assert.Equal(AppIconSource.Default, Build(null, "not json at all").ResolveIcon());
    }

    // ---- name ----

    /// <summary>Configuration beats the stored name, exactly as it does for the icon.</summary>
    [Fact]
    public void Configured_name_wins_over_the_stored_name()
    {
        var options = new UmbraDesktopOptions { AppName = "Contoso Admin" };

        Assert.Equal("Contoso Admin", Build(options, """{"AppName":"Stored"}""").ResolveName());
    }

    /// <summary>With no configuration, the stored name decides.</summary>
    [Fact]
    public void Uses_the_stored_name_when_configuration_is_absent()
    {
        Assert.Equal("Stored", Build(null, """{"AppName":"Stored"}""").ResolveName());
    }

    /// <summary>An explicitly configured Umbraco site name is used when nothing overrides it.</summary>
    [Fact]
    public void Falls_through_to_the_configured_umbraco_site_name()
    {
        Assert.Equal("Contoso", Build(null, null, siteName: "Contoso").ResolveName());
    }

    /// <summary>
    /// With nothing set anywhere, the name resolves to null.
    /// </summary>
    /// <remarks>
    /// <b>Null, not the application name.</b> This is the whole point of reading
    /// <c>IOptions&lt;HostingSettings&gt;</c> rather than <c>IHostingEnvironment.SiteName</c>: the
    /// latter has already substituted the application name by the time you see it, so a site that
    /// never set anything is indistinguishable from one that deliberately chose an assembly
    /// identifier — which is how a taskbar ends up reading
    /// <c>Umbraco.Community.UmbraDesktop.TestInstance</c>. Returning null lets the builder fall back
    /// to something a human would recognise.
    /// </remarks>
    [Fact]
    public void Returns_null_when_nothing_anywhere_names_the_site()
    {
        Assert.Null(Build(null, null, siteName: null).ResolveName());
    }

    /// <summary>
    /// A blank name is treated as absent at every level rather than shipped.
    /// </summary>
    /// <remarks>
    /// Clearing the field in the backoffice means "stop overriding", not "call the app nothing" —
    /// so a blank stored value must fall through to the site's own name.
    /// </remarks>
    /// <param name="blank">The blank value under test.</param>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Treats_a_blank_stored_name_as_absent(string blank)
    {
        var stored = $$"""{"AppName":"{{blank}}"}""";

        Assert.Equal("Contoso", Build(null, stored, siteName: "Contoso").ResolveName());
    }

    /// <summary>A blank configured name is absent too, so it cannot blank out the site's name.</summary>
    [Fact]
    public void Treats_a_blank_configured_name_as_absent()
    {
        var options = new UmbraDesktopOptions { AppName = "   " };

        Assert.Equal("Contoso", Build(options, null, siteName: "Contoso").ResolveName());
    }

    /// <summary>Surrounding whitespace is trimmed rather than shipped into a taskbar label.</summary>
    [Fact]
    public void Trims_the_resolved_name()
    {
        Assert.Equal("Contoso", Build(null, """{"AppName":"  Contoso  "}""").ResolveName());
    }

    /// <summary>
    /// A stored icon mode that no longer exists loses the icon and <b>keeps the name</b>.
    /// </summary>
    /// <remarks>
    /// Not hypothetical: <c>Favicon</c> was a real mode, stored by real installs during development,
    /// and removing it made every one of those documents unparseable. Because the icon and the name
    /// share a document, a strict parse would have thrown the name away too — somebody's chosen app
    /// name disappearing as a side effect of a mode they never knew was deleted. The fields are read
    /// independently so one cannot take the other down.
    /// </remarks>
    [Fact]
    public void A_stored_mode_that_no_longer_exists_keeps_the_name()
    {
        const string stored = """{"AppIcon":{"Mode":"Favicon"},"AppName":"Testsite2"}""";

        Assert.Equal("Testsite2", Build(null, stored).ResolveName());
        Assert.Equal(AppIconSource.Default, Build(null, stored).ResolveIcon());
    }

    /// <summary>
    /// An unreadable stored document does not stop the name falling through to the site.
    /// </summary>
    /// <remarks>
    /// The icon and the name share one document, so a document that fails to parse must degrade
    /// both independently rather than taking the name down with it.
    /// </remarks>
    [Fact]
    public void Unreadable_stored_document_still_falls_through_for_the_name()
    {
        Assert.Equal("Contoso", Build(null, "not json at all", siteName: "Contoso").ResolveName());
    }
}
