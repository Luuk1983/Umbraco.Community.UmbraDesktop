namespace Umbraco.Community.UmbraDesktop.Manifest;

/// <summary>
/// Builds the served manifest from the three things that vary between sites.
/// </summary>
public interface IWebAppManifestBuilder
{
    /// <summary>
    /// Build a manifest.
    /// </summary>
    /// <param name="backofficePath">
    /// The backoffice's base path, with or without a trailing slash. Never assumed to be
    /// <c>/umbraco</c>: it is configurable, and a site that moved it would otherwise receive a
    /// manifest pointing at nothing.
    /// </param>
    /// <param name="siteName">The site's name, or null when it has none.</param>
    /// <param name="icons">The resolved icon set.</param>
    /// <returns>The manifest.</returns>
    WebAppManifest Build(string backofficePath, string? siteName, IReadOnlyList<WebAppManifestIcon> icons);
}
