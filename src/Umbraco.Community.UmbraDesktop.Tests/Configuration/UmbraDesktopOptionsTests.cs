using Microsoft.Extensions.Configuration;
using Umbraco.Community.UmbraDesktop.Configuration;
using Umbraco.Community.UmbraDesktop.Manifest;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Configuration;

/// <summary>
/// Exercises the binding of <see cref="UmbraDesktopOptions"/> from configuration.
/// </summary>
/// <remarks>
/// Worth testing despite the class being a plain options POCO, because the failure mode is silence.
/// A section path that does not match what a consumer writes in <c>appsettings.json</c> binds
/// nothing, throws nothing and logs nothing — the site simply behaves as though it had configured
/// no app identity at all, which is indistinguishable from the default. Pinning the path here means
/// a rename breaks a test rather than breaking every consumer's config.
/// </remarks>
public class UmbraDesktopOptionsTests
{
    /// <summary>
    /// Bind a configuration dictionary through the section the package publishes.
    /// </summary>
    /// <param name="values">Flattened configuration keys and values.</param>
    /// <returns>The bound options.</returns>
    private static UmbraDesktopOptions Bind(Dictionary<string, string?> values)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var options = new UmbraDesktopOptions();
        configuration.GetSection(UmbraDesktopOptions.SectionName).Bind(options);
        return options;
    }

    /// <summary>
    /// The section path is the one consumers are told to write, spelled exactly.
    /// </summary>
    /// <remarks>
    /// Asserted as a literal rather than derived from the constant, so that changing the constant
    /// fails here instead of quietly orphaning every site that already configured the old path.
    /// </remarks>
    [Fact]
    public void Publishes_the_documented_section_path()
    {
        Assert.Equal("Umbraco:Community:UmbraDesktop", UmbraDesktopOptions.SectionName);
    }

    /// <summary>A configured icon mode and media key both arrive.</summary>
    [Fact]
    public void Binds_the_icon()
    {
        var options = Bind(new Dictionary<string, string?>
        {
            ["Umbraco:Community:UmbraDesktop:AppIcon:Mode"] = "Custom",
            ["Umbraco:Community:UmbraDesktop:AppIcon:MediaKey"] = "11111111-1111-1111-1111-111111111111",
        });

        Assert.NotNull(options.AppIcon);
        Assert.Equal(AppIconMode.Custom, options.AppIcon!.Mode);
        Assert.Equal(Guid.Parse("11111111-1111-1111-1111-111111111111"), options.AppIcon.MediaKey);
    }

    /// <summary>A configured name arrives.</summary>
    [Fact]
    public void Binds_the_name()
    {
        var options = Bind(new Dictionary<string, string?>
        {
            ["Umbraco:Community:UmbraDesktop:AppName"] = "Contoso Admin",
        });

        Assert.Equal("Contoso Admin", options.AppName);
    }

    /// <summary>
    /// Nothing configured leaves both null, which is the state the whole two-source design turns on.
    /// </summary>
    /// <remarks>
    /// Null means "the stored setting decides". A non-nullable property with a default would make
    /// every site that configured nothing look like one that had deliberately pinned a value, and
    /// the backoffice fields would be permanently locked for everybody.
    /// </remarks>
    [Fact]
    public void Leaves_both_null_when_nothing_is_configured()
    {
        var options = Bind(new Dictionary<string, string?>
        {
            ["Umbraco:CMS:Hosting:SiteName"] = "Something Unrelated",
        });

        Assert.Null(options.AppIcon);
        Assert.Null(options.AppName);
    }

    /// <summary>
    /// Configuring the name alone does not conjure an icon, and vice versa.
    /// </summary>
    /// <remarks>
    /// They pin independently: a site setting the name through CI must keep an editable icon field,
    /// so a non-null <see cref="UmbraDesktopOptions.AppIcon"/> here would lock a control nobody
    /// asked to lock.
    /// </remarks>
    [Fact]
    public void Binds_each_independently()
    {
        var named = Bind(new Dictionary<string, string?>
        {
            ["Umbraco:Community:UmbraDesktop:AppName"] = "Contoso Admin",
        });
        Assert.Null(named.AppIcon);

        var iconed = Bind(new Dictionary<string, string?>
        {
            ["Umbraco:Community:UmbraDesktop:AppIcon:Mode"] = "Default",
        });
        Assert.Null(iconed.AppName);
    }
}
