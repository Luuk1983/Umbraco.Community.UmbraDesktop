using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.PackageSettings;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.PackageSettings;

/// <summary>
/// Exercises who may change a site setting: the Settings section by default, or what the package
/// registered on the server.
/// </summary>
public class SitePackageSettingsPermissionsTests
{
    /// <summary>
    /// A key nobody registered is changed by Settings users, the same people who change the
    /// desktop's own site-wide settings, so a package with no server code still gets a safe default.
    /// </summary>
    [Fact]
    public void Defaults_to_the_settings_section()
    {
        var permissions = new SitePackageSettingsPermissions([]);

        Assert.Equal([AuthorizationPolicies.SectionAccessSettings], permissions.ChangePolicies("My.Package"));
    }

    /// <summary>A registered key is changed by whoever its registration names, instead of the default.</summary>
    [Fact]
    public void Uses_the_registered_policy()
    {
        var permissions = new SitePackageSettingsPermissions(
            [new SitePackageSettingsRegistration("My.Package", AuthorizationPolicies.SectionAccessMedia)]);

        Assert.Equal([AuthorizationPolicies.SectionAccessMedia], permissions.ChangePolicies("My.Package"));
    }

    /// <summary>A registration matches its key ignoring case, the way the stored row does.</summary>
    [Fact]
    public void Matches_the_registration_ignoring_case()
    {
        var permissions = new SitePackageSettingsPermissions(
            [new SitePackageSettingsRegistration("My.Package", AuthorizationPolicies.SectionAccessMedia)]);

        Assert.Equal([AuthorizationPolicies.SectionAccessMedia], permissions.ChangePolicies("MY.PACKAGE"));
    }

    /// <summary>
    /// Two registrations for one key both have to be met. Which of them meant it is unknowable, so
    /// the setting is never easier to change than either says.
    /// </summary>
    [Fact]
    public void Requires_every_registered_policy()
    {
        var permissions = new SitePackageSettingsPermissions(
        [
            new SitePackageSettingsRegistration("My.Package", AuthorizationPolicies.SectionAccessMedia),
            new SitePackageSettingsRegistration("my.package", AuthorizationPolicies.SectionAccessSettings),
        ]);

        Assert.Equal(
            [AuthorizationPolicies.SectionAccessMedia, AuthorizationPolicies.SectionAccessSettings],
            permissions.ChangePolicies("My.Package"));
    }

    /// <summary>A registration for another key leaves this one on the default.</summary>
    [Fact]
    public void Ignores_other_keys_registrations()
    {
        var permissions = new SitePackageSettingsPermissions(
            [new SitePackageSettingsRegistration("Other.Package", AuthorizationPolicies.SectionAccessMedia)]);

        Assert.Equal([AuthorizationPolicies.SectionAccessSettings], permissions.ChangePolicies("My.Package"));
    }
}
