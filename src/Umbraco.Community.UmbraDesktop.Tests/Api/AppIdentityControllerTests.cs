using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NSubstitute;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Web;
using Umbraco.Community.UmbraDesktop.Api;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.Configuration;
using Umbraco.Community.UmbraDesktop.Manifest;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Api;

/// <summary>
/// Exercises the management API that backs the Site settings screen.
/// </summary>
/// <remarks>
/// Thin as the controller is, its guards are the interesting part: what it refuses, and what it
/// stores when the caller sends something ambiguous. Both have consequences a user would otherwise
/// meet as a setting that silently does not stick.
/// </remarks>
public class AppIdentityControllerTests
{
    /// <summary>A stand-in media key for the Custom mode cases.</summary>
    private static readonly Guid MediaKey = Guid.Parse("11111111-1111-1111-1111-111111111111");

    /// <summary>Captures what the controller wrote to the key-value store.</summary>
    private readonly IKeyValueService _keyValue = Substitute.For<IKeyValueService>();

    /// <summary>
    /// Builds a controller over the given configuration and resolved values.
    /// </summary>
    /// <param name="options">The package's appsettings section, or null for an absent one.</param>
    /// <param name="resolvedName">What the resolver reports the effective name to be.</param>
    /// <returns>The controller under test.</returns>
    private AppIdentityController Build(UmbraDesktopOptions? options = null, string? resolvedName = "Contoso")
    {
        var resolver = Substitute.For<IAppIdentityResolver>();
        resolver.ResolveIcon().Returns(AppIconSource.Default);
        resolver.ResolveName().Returns(resolvedName);

        var icons = Substitute.For<IAppIconSetFactory>();
        icons.Create(Arg.Any<AppIconSource>())
            .Returns([new("/appicons/icon-512.png", "512x512", "image/png", null)]);

        return new AppIdentityController(
            resolver,
            _keyValue,
            Options.Create(options ?? new UmbraDesktopOptions()),
            icons,
            Substitute.For<IUmbracoContextFactory>());
    }

    /// <summary>Reads back the single document the controller stored.</summary>
    /// <returns>The stored JSON.</returns>
    private string StoredDocument()
    {
        var calls = _keyValue.ReceivedCalls()
            .Where(c => c.GetMethodInfo().Name == nameof(IKeyValueService.SetValue))
            .ToList();

        var call = Assert.Single(calls);
        return (string)call.GetArguments()[1]!;
    }

    /// <summary>The effective values come back, with nothing locked when nothing is configured.</summary>
    [Fact]
    public void Reports_the_effective_values()
    {
        var result = Assert.IsType<OkObjectResult>(Build().GetAppIdentity());
        var model = Assert.IsType<AppIdentityResponseModel>(result.Value);

        Assert.Equal(AppIconMode.Default, model.Mode);
        Assert.Equal("Contoso", model.Name);
        Assert.False(model.IconLockedByConfiguration);
        Assert.False(model.NameLockedByConfiguration);
        // Straight from the icon factory, not rebuilt here. A preview assembled separately would be
        // a second opinion about the icon, free to agree with the screen while the manifest served
        // something else.
        Assert.Equal("/appicons/icon-512.png", model.PreviewUrl);
    }

    /// <summary>
    /// The two lock flags are independent.
    /// </summary>
    /// <remarks>
    /// A site pinning its name through CI must keep an editable icon. One shared flag would disable
    /// a control nobody asked to disable.
    /// </remarks>
    [Fact]
    public void Locks_the_name_and_the_icon_independently()
    {
        var named = Build(new UmbraDesktopOptions { AppName = "Pinned" });
        var namedModel = Assert.IsType<AppIdentityResponseModel>(
            Assert.IsType<OkObjectResult>(named.GetAppIdentity()).Value);
        Assert.True(namedModel.NameLockedByConfiguration);
        Assert.False(namedModel.IconLockedByConfiguration);

        var iconed = Build(new UmbraDesktopOptions { AppIcon = new AppIconOptions() });
        var iconedModel = Assert.IsType<AppIdentityResponseModel>(
            Assert.IsType<OkObjectResult>(iconed.GetAppIdentity()).Value);
        Assert.True(iconedModel.IconLockedByConfiguration);
        Assert.False(iconedModel.NameLockedByConfiguration);
    }

    /// <summary>A normal save stores both fields in one document.</summary>
    [Fact]
    public void Stores_both_fields_together()
    {
        var controller = Build();

        var result = controller.SetAppIdentity(new AppIdentityRequestModel(AppIconMode.Custom, MediaKey, "Contoso Admin"));

        Assert.IsType<NoContentResult>(result);
        var stored = StoredDocument();
        Assert.Contains("Custom", stored);
        Assert.Contains("Contoso Admin", stored);
    }

    /// <summary>
    /// A blank name is stored as null rather than as an empty string.
    /// </summary>
    /// <remarks>
    /// Clearing the field means "stop overriding and go back to the site's own name", not "call the
    /// app nothing". Storing <c>""</c> would be indistinguishable from the second.
    /// </remarks>
    /// <param name="blank">The blank value under test.</param>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Stores_a_blank_name_as_null(string? blank)
    {
        Build().SetAppIdentity(new AppIdentityRequestModel(AppIconMode.Default, null, blank));

        Assert.Contains("\"AppName\":null", StoredDocument());
    }

    /// <summary>Surrounding whitespace is trimmed before storage.</summary>
    [Fact]
    public void Trims_the_stored_name()
    {
        Build().SetAppIdentity(new AppIdentityRequestModel(AppIconMode.Default, null, "  Contoso  "));

        Assert.Contains("\"AppName\":\"Contoso\"", StoredDocument());
    }

    /// <summary>
    /// Custom with no media is refused rather than stored.
    /// </summary>
    /// <remarks>
    /// The resolver would fall back to Default anyway, so storing it would leave the user looking at
    /// a setting that reads Custom and behaves as Default.
    /// </remarks>
    [Fact]
    public void Refuses_custom_without_media()
    {
        var result = Build().SetAppIdentity(new AppIdentityRequestModel(AppIconMode.Custom, null, null));

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(_keyValue.ReceivedCalls()
            .Where(c => c.GetMethodInfo().Name == nameof(IKeyValueService.SetValue)));
    }

    /// <summary>Custom with media is accepted.</summary>
    [Fact]
    public void Accepts_custom_with_media()
    {
        var result = Build().SetAppIdentity(new AppIdentityRequestModel(AppIconMode.Custom, MediaKey, null));

        Assert.IsType<NoContentResult>(result);
        Assert.Contains(MediaKey.ToString(), StoredDocument());
    }

    /// <summary>
    /// Writing an icon that configuration owns is refused rather than silently ignored.
    /// </summary>
    /// <remarks>
    /// Storing it would succeed and change nothing, because the resolver reads configuration first —
    /// leaving the user staring at an unchanged icon with no explanation.
    /// </remarks>
    [Fact]
    public void Refuses_an_icon_write_when_configuration_owns_it()
    {
        var options = new UmbraDesktopOptions { AppIcon = new AppIconOptions() };

        var result = Build(options).SetAppIdentity(new AppIdentityRequestModel(AppIconMode.Custom, MediaKey, null));

        Assert.IsType<ConflictObjectResult>(result);
    }

    /// <summary>Writing a name that configuration owns is refused for the same reason.</summary>
    [Fact]
    public void Refuses_a_name_write_when_configuration_owns_it()
    {
        var options = new UmbraDesktopOptions { AppName = "Pinned" };

        var result = Build(options).SetAppIdentity(new AppIdentityRequestModel(AppIconMode.Default, null, "Mine"));

        Assert.IsType<ConflictObjectResult>(result);
    }

    /// <summary>
    /// A configured name does not block an icon-only save.
    /// </summary>
    /// <remarks>
    /// The screen sends both fields on every write because they share one stored document, so a
    /// request that merely echoes a pinned value back is not an attempted override. Refusing it
    /// would make the *other* field unsaveable whenever either one is configured — which is why the
    /// guard tests whether a request **changes** a configured value, not whether one is present.
    /// </remarks>
    [Fact]
    public void A_pinned_name_still_allows_an_icon_save()
    {
        var options = new UmbraDesktopOptions { AppName = "Pinned" };

        var result = Build(options).SetAppIdentity(new AppIdentityRequestModel(AppIconMode.Custom, MediaKey, "Pinned"));

        Assert.IsType<NoContentResult>(result);
    }

    /// <summary>A pinned icon does not block a name-only save, for the same reason.</summary>
    [Fact]
    public void A_pinned_icon_still_allows_a_name_save()
    {
        var options = new UmbraDesktopOptions
        {
            AppIcon = new AppIconOptions { Mode = AppIconMode.Custom, MediaKey = MediaKey },
        };

        // The screen echoes the pinned mode back and changes only the name.
        var result = Build(options).SetAppIdentity(new AppIdentityRequestModel(AppIconMode.Custom, MediaKey, "Mine"));

        Assert.IsType<NoContentResult>(result);
        Assert.Contains("Mine", StoredDocument());
    }

    /// <summary>
    /// An echoed name that differs only by surrounding whitespace is not treated as a change.
    /// </summary>
    /// <remarks>
    /// The comparison normalises the same way the resolver does when reading the value back, so a
    /// round trip through an input field cannot manufacture a conflict.
    /// </remarks>
    [Fact]
    public void Whitespace_around_an_echoed_name_is_not_a_change()
    {
        var options = new UmbraDesktopOptions { AppName = "Pinned" };

        var result = Build(options).SetAppIdentity(new AppIdentityRequestModel(AppIconMode.Default, null, "  Pinned  "));

        Assert.IsType<NoContentResult>(result);
    }
}
