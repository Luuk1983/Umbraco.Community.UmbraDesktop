namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// Where site-wide package settings are kept: one JSON value per package key, for the whole site.
/// </summary>
/// <remarks>
/// Knows nothing about who may change what; the controller asks that before it calls in. The value
/// is the package's own and is never looked inside, except to merge a patch into it and to hand it to
/// the validators the package registered.
/// </remarks>
public interface ISitePackageSettingsStore
{
    /// <summary>
    /// Reads a package's value.
    /// </summary>
    /// <param name="key">A key <see cref="SitePackageSettingsKey.IsValid"/> accepted.</param>
    /// <returns>The stored JSON text, or null when nothing is stored.</returns>
    string? Read(string key);

    /// <summary>
    /// Replaces a package's value, whole, unless it is too long or the package's validators refuse it.
    /// </summary>
    /// <param name="key">A key <see cref="SitePackageSettingsKey.IsValid"/> accepted.</param>
    /// <param name="value">JSON text.</param>
    /// <returns>The value as stored, or why nothing was.</returns>
    SitePackageSettingsWriteResult Replace(string key, string value);

    /// <summary>
    /// Merges a JSON Merge Patch into a package's value, as one step nobody else's change can land in
    /// the middle of.
    /// </summary>
    /// <param name="key">A key <see cref="SitePackageSettingsKey.IsValid"/> accepted.</param>
    /// <param name="patch">A JSON object, as text.</param>
    /// <returns>
    /// The merged value as stored, or why nothing was: it would be too long, or the package's
    /// validators refuse the merged value.
    /// </returns>
    SitePackageSettingsWriteResult Patch(string key, string patch);
}
