using Umbraco.Community.UmbraDesktop.Manifest;

namespace Umbraco.Community.UmbraDesktop.Configuration;

/// <summary>
/// The package's <c>appsettings.json</c> section, at <c>Umbraco:Community:UmbraDesktop</c>.
/// </summary>
/// <remarks>
/// The package's first configuration section. It exists alongside the backoffice UI rather than
/// instead of it, and the two answer different questions: a value here is set by CI and is
/// per-environment by nature, so staging restored from a production database does not come back
/// wearing production's identity. A value set in the backoffice needs no deploy and is
/// discoverable. Configuration wins where both are present.
/// </remarks>
public sealed class UmbraDesktopOptions
{
    /// <summary>
    /// The configuration section path.
    /// </summary>
    /// <remarks>
    /// Pinned by a test, because getting it wrong fails silently: a path nobody writes binds
    /// nothing, throws nothing and logs nothing, and the site simply behaves as though it had
    /// configured no app identity at all.
    /// </remarks>
    public const string SectionName = "Umbraco:Community:UmbraDesktop";

    /// <summary>
    /// The installed app's icon, or null to leave the choice to the backoffice.
    /// </summary>
    /// <remarks>
    /// Nullable on purpose, and the whole mechanism turns on it: absent means "the stored setting
    /// decides". A non-nullable property defaulting to <see cref="AppIconMode.Default"/> would make
    /// every site that never configured anything look like a site that had deliberately pinned the
    /// default, and the backoffice control would be permanently locked for everybody.
    /// </remarks>
    public AppIconOptions? AppIcon { get; set; }

    /// <summary>
    /// The installed app's name, or null to leave it to the backoffice and then to the site.
    /// </summary>
    /// <remarks>
    /// Nullable for the same reason as <see cref="AppIcon"/>, and independent of it: a site pinning
    /// the name through CI must keep an editable icon, so the two lock separately.
    /// </remarks>
    public string? AppName { get; set; }
}

/// <summary>
/// The configured icon choice.
/// </summary>
public sealed class AppIconOptions
{
    /// <summary>Which source to use.</summary>
    public AppIconMode Mode { get; set; } = AppIconMode.Default;

    /// <summary>The media item's key, for <see cref="AppIconMode.Custom"/>.</summary>
    public Guid? MediaKey { get; set; }
}
