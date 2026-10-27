using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.PackageSettings;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.PackageSettings;

/// <summary>
/// Exercises the one call a package makes on the server to say who may change its site setting.
/// </summary>
public class SitePackageSettingsBuilderExtensionsTests
{
    /// <summary>The call adds a registration the permissions read, and returns the builder for chaining.</summary>
    [Fact]
    public void Registers_the_key_and_its_policy()
    {
        var services = new ServiceCollection();
        var builder = Substitute.For<IUmbracoBuilder>();
        builder.Services.Returns(services);

        var returned = builder.AddUmbraDesktopSiteSettings("My.Package", AuthorizationPolicies.SectionAccessMedia);

        Assert.Same(builder, returned);
        var registrations = services.BuildServiceProvider().GetServices<SitePackageSettingsRegistration>();
        Assert.Equal([new SitePackageSettingsRegistration("My.Package", AuthorizationPolicies.SectionAccessMedia)], registrations);
    }

    /// <summary>A key the store would refuse is refused at startup, where the package author sees it, not at the first save.</summary>
    [Fact]
    public void Refuses_a_bad_key_at_startup()
    {
        var builder = Substitute.For<IUmbracoBuilder>();
        builder.Services.Returns(new ServiceCollection());

        Assert.Throws<ArgumentException>(() => builder.AddUmbraDesktopSiteSettings(" ", AuthorizationPolicies.SectionAccessMedia));
        Assert.Throws<ArgumentException>(() => builder.AddUmbraDesktopSiteSettings("My.Package", " "));
    }

    /// <summary>
    /// A validator is registered under its own type and with its key, so the validation can find it and
    /// the package's own dependencies reach it.
    /// </summary>
    [Fact]
    public void Registers_a_validator_for_a_key()
    {
        var services = new ServiceCollection();
        var builder = Substitute.For<IUmbracoBuilder>();
        builder.Services.Returns(services);

        var returned = builder.AddUmbraDesktopSiteSettingsValidator<NoNumbersValidator>("My.Package");

        Assert.Same(builder, returned);
        var provider = services.BuildServiceProvider();
        Assert.Equal(
            [new SitePackageSettingsValidatorRegistration("My.Package", typeof(NoNumbersValidator))],
            provider.GetServices<SitePackageSettingsValidatorRegistration>());
        Assert.NotNull(provider.GetService<NoNumbersValidator>());
    }

    /// <summary>A validator for a key the store would refuse is refused at startup.</summary>
    [Fact]
    public void Refuses_a_validator_for_a_bad_key()
    {
        var builder = Substitute.For<IUmbracoBuilder>();
        builder.Services.Returns(new ServiceCollection());

        Assert.Throws<ArgumentException>(() => builder.AddUmbraDesktopSiteSettingsValidator<NoNumbersValidator>(" "));
    }
}
