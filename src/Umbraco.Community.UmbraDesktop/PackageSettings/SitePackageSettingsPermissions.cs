using Umbraco.Cms.Web.Common.Authorization;

namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// Decides which policies a user must meet to change a package's site setting.
/// </summary>
/// <param name="registrations">Every registration packages made on the server.</param>
public sealed class SitePackageSettingsPermissions(IEnumerable<SitePackageSettingsRegistration> registrations)
{
    /// <summary>
    /// The policy for a key nobody registered: the Settings section.
    /// </summary>
    /// <remarks>
    /// The people who change the desktop's own site-wide settings, the label and the app identity. A
    /// package with no server code of its own still gets a site setting, and one only trusted users
    /// can change.
    /// </remarks>
    public const string DefaultChangePolicy = AuthorizationPolicies.SectionAccessSettings;

    /// <summary>The registrations, read once: they are fixed when the application composes.</summary>
    private readonly IReadOnlyList<SitePackageSettingsRegistration> _registrations = registrations.ToList();

    /// <summary>
    /// The policies a user must meet, every one of them, to change a key's setting.
    /// </summary>
    /// <remarks>
    /// Every registered policy rather than the last, when a key is registered twice: which one was
    /// meant is unknowable, and requiring both never makes a setting easier to change than either
    /// registration says.
    /// </remarks>
    /// <param name="key">The package key.</param>
    /// <returns>The registered policies in registration order, or the default when there are none.</returns>
    public IReadOnlyList<string> ChangePolicies(string key)
    {
        var registered = _registrations
            .Where(registration => string.Equals(registration.Key, key, StringComparison.OrdinalIgnoreCase))
            .Select(registration => registration.ChangePolicy)
            .Distinct()
            .ToList();

        return registered.Count > 0 ? registered : [DefaultChangePolicy];
    }
}
