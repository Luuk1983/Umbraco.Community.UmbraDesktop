namespace Umbraco.Community.UmbraDesktop.Manifest;

/// <summary>
/// Turns a resolved icon choice into the manifest's <c>icons</c> array.
/// </summary>
public interface IAppIconSetFactory
{
    /// <summary>
    /// Build the icon entries for a resolved source.
    /// </summary>
    /// <param name="source">The resolved choice.</param>
    /// <returns>
    /// The entries. Never empty, and every entry carries a <c>sizes</c> — an entry without one is
    /// silently not installable.
    /// </returns>
    IReadOnlyList<WebAppManifestIcon> Create(AppIconSource source);
}
