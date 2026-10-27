namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// That a validator checks a package's site setting.
/// </summary>
/// <remarks>
/// Made by <see cref="SitePackageSettingsBuilderExtensions.AddUmbraDesktopSiteSettingsValidator{TValidator}"/>.
/// A type rather than an instance, so the validator is built by the container and can take the
/// package's own services.
/// </remarks>
/// <param name="Key">The package key. Matched ignoring case.</param>
/// <param name="ValidatorType">The validator's type, registered in the container under itself.</param>
public sealed record SitePackageSettingsValidatorRegistration(string Key, Type ValidatorType);
