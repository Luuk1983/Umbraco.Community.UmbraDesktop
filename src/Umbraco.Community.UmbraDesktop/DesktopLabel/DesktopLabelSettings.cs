namespace Umbraco.Community.UmbraDesktop.DesktopLabel;

/// <summary>
/// The three site-wide switches behind the desktop label.
/// </summary>
/// <remarks>
/// The text is deliberately not here. It is the App name, resolved by
/// <see cref="Manifest.IAppIdentityResolver"/> exactly as the installed app resolves it, so a site
/// has one name to set rather than two that can disagree.
/// </remarks>
/// <param name="Show">Whether the label is drawn at all.</param>
/// <param name="Corner">Which corner of the desktop it sits in.</param>
/// <param name="ShowDomain">Whether the domain is written under the name.</param>
public sealed record DesktopLabelSettings(bool Show, DesktopLabelCorner Corner, bool ShowDomain)
{
    /// <summary>
    /// What a site that never touched the setting gets: off, top right, and no domain.
    /// </summary>
    /// <remarks>
    /// Off because a permanent name across every desktop is noise on a site with one environment,
    /// and that is most sites.
    /// </remarks>
    public static DesktopLabelSettings Default { get; } = new(false, DesktopLabelCorner.TopRight, false);
}
