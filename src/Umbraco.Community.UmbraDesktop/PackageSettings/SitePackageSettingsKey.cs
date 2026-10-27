using Umbraco.Community.UmbraDesktop.UserData;

namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// Which package keys a site setting may be stored under, and the key-value row each one becomes.
/// </summary>
/// <remarks>
/// The key is the package's own name for its settings, the same one it gives the per-user store,
/// such as <c>My.Package</c>. The browser sends it in the route, so everything here is a check on
/// input from outside.
/// </remarks>
public static class SitePackageSettingsKey
{
    /// <summary>
    /// What every row's key starts with.
    /// </summary>
    /// <remarks>
    /// Umbraco's key-value table is one flat namespace shared with core and every other package, and
    /// the desktop keeps its own site-wide documents there under <see cref="DesktopUserData.Group"/>.
    /// A prefix of its own keeps a package's key from ever landing on one of those.
    /// </remarks>
    public const string Prefix = DesktopUserData.Group + ".PackageSettings.Site.";

    /// <summary>
    /// The length of core's key-value key column, <c>KeyValueDto.Key</c>, which is <c>[Length(256)]</c>
    /// at the floor (<c>release-17.6.0</c>). Core keeps the type internal, so the number is repeated
    /// here; a key longer than the column would surface as a raw database error rather than a 400.
    /// </summary>
    public const int KeyValueKeyLength = 256;

    /// <summary>The longest package key that still fits the column with <see cref="Prefix"/> in front.</summary>
    /// <remarks>Static rather than const: a string's length is not a compile-time constant in C#.</remarks>
    public static readonly int MaxLength = KeyValueKeyLength - Prefix.Length;

    /// <summary>
    /// Whether a package key can be stored.
    /// </summary>
    /// <param name="key">The key from the request.</param>
    /// <returns>
    /// False for an empty, blank or padded key, one too long for the column, and the desktop's own
    /// group, which the per-user store refuses too.
    /// </returns>
    public static bool IsValid(string? key) =>
        !string.IsNullOrWhiteSpace(key)
        && key.Trim() == key
        && key.Length <= MaxLength
        && !string.Equals(key, DesktopUserData.Group, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// The key-value row a package key is stored in.
    /// </summary>
    /// <remarks>
    /// Lowercased because SQL Server compares the column ignoring case and SQLite does not. Without
    /// it, <c>My.Package</c> and <c>my.package</c> would be one setting on one database and two on
    /// the other.
    /// </remarks>
    /// <param name="key">A key <see cref="IsValid"/> accepted.</param>
    /// <returns>The row's key.</returns>
    public static string StorageKey(string key) => Prefix + key.ToLowerInvariant();
}
