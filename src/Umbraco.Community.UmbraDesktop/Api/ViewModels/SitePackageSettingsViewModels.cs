namespace Umbraco.Community.UmbraDesktop.Api.ViewModels;

/// <summary>
/// A package's site setting, and whether the user asking may change it.
/// </summary>
/// <param name="Value">The stored JSON text, or null when nothing is stored.</param>
/// <param name="CanChange">
/// Whether this user meets the key's change policy, so the package can disable its controls rather
/// than let someone make a change the server will refuse.
/// </param>
public sealed record SitePackageSettingsResponseModel(string? Value, bool CanChange);

/// <summary>
/// A request to replace a package's site setting, whole.
/// </summary>
/// <param name="Value">
/// The new value as JSON text. Text rather than a JSON body, so it is kept exactly as the browser
/// serialised it, which is how the browser compares what it stored.
/// </param>
public sealed record SitePackageSettingsRequestModel(string Value);

/// <summary>
/// A request to merge a JSON Merge Patch into a package's site setting.
/// </summary>
/// <param name="Patch">A JSON object, as text: the members to replace, with null for those to remove.</param>
public sealed record SitePackageSettingsPatchRequestModel(string Patch);
