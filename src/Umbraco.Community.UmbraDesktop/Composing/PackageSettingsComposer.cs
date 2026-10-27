using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.UmbraDesktop.PackageSettings;

namespace Umbraco.Community.UmbraDesktop.Composing;

/// <summary>
/// Wires up the server side of site-wide package settings: the store, who may change what, and the
/// packages' validators.
/// </summary>
/// <remarks>
/// Per-user package settings need nothing here; they live in Umbraco's own user data, through its
/// own endpoints. Packages add their registrations with
/// <see cref="SitePackageSettingsBuilderExtensions.AddUmbraDesktopSiteSettings"/> and
/// <see cref="SitePackageSettingsBuilderExtensions.AddUmbraDesktopSiteSettingsValidator{TValidator}"/>
/// in their own composers, in any order relative to this one, since both are read when first resolved.
/// </remarks>
public sealed class PackageSettingsComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        // Singletons, like the desktop label's store: neither holds state of its own beyond the
        // registrations, which are fixed once the application has composed.
        builder.Services.AddSingleton<ISitePackageSettingsStore, SitePackageSettingsStore>();
        builder.Services.AddSingleton<SitePackageSettingsPermissions>();
        builder.Services.AddSingleton<SitePackageSettingsValidation>();
    }
}
