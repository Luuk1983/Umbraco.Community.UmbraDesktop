namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// A package's word, on the server, about who may change its site setting.
/// </summary>
/// <remarks>
/// Made by <see cref="SitePackageSettingsBuilderExtensions.AddUmbraDesktopSiteSettings"/>. On the
/// server because the browser cannot be trusted to say who may change what: any user could send any
/// policy name.
/// </remarks>
/// <param name="Key">The package key, as the browser passes it to the store. Matched ignoring case.</param>
/// <param name="ChangePolicy">The name of the authorization policy a user must meet to change it.</param>
public sealed record SitePackageSettingsRegistration(string Key, string ChangePolicy);
