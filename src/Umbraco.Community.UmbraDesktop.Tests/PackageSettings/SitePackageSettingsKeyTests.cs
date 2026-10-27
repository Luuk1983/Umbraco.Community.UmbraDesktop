using Umbraco.Community.UmbraDesktop.PackageSettings;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.PackageSettings;

/// <summary>
/// Exercises which package keys a site setting may be stored under.
/// </summary>
public class SitePackageSettingsKeyTests
{
    /// <summary>A package's own namespaced key is accepted.</summary>
    [Fact]
    public void Accepts_a_package_key() => Assert.True(SitePackageSettingsKey.IsValid("My.Package"));

    /// <summary>Empty, blank and padded keys are refused rather than trimmed, so a key means one thing.</summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(" My.Package")]
    [InlineData("My.Package ")]
    public void Refuses_an_empty_or_padded_key(string? key) => Assert.False(SitePackageSettingsKey.IsValid(key));

    /// <summary>
    /// The longest key that still fits core's key-value column with the prefix in front is accepted,
    /// and one character more is refused. Derived from the column, so the limit cannot drift from it.
    /// </summary>
    [Fact]
    public void Accepts_keys_up_to_what_the_column_holds()
    {
        Assert.Equal(SitePackageSettingsKey.KeyValueKeyLength - SitePackageSettingsKey.Prefix.Length, SitePackageSettingsKey.MaxLength);
        Assert.True(SitePackageSettingsKey.IsValid(new string('a', SitePackageSettingsKey.MaxLength)));
        Assert.False(SitePackageSettingsKey.IsValid(new string('a', SitePackageSettingsKey.MaxLength + 1)));
    }

    /// <summary>The desktop's own group is refused, the same as the per-user store refuses it.</summary>
    [Theory]
    [InlineData("Umbraco.Community.UmbraDesktop")]
    [InlineData("umbraco.community.umbradesktop")]
    public void Refuses_the_desktop_s_own_group(string key) => Assert.False(SitePackageSettingsKey.IsValid(key));
}
