namespace Umbraco.Community.UmbraDesktop.Manifest;

/// <summary>
/// Where the installed app's icon comes from.
/// </summary>
public enum AppIconMode
{
    /// <summary>The mark shipped with the package: the Umbraco logo in the loader's ring.</summary>
    Default = 0,

    /// <summary>A media item chosen in the backoffice.</summary>
    Custom = 2,

    // Favicon = 1 was a third mode, removed before release and its number left unused so an already
    // stored 1 does not silently become something else. It pointed the manifest at the site's own
    // /favicon.ico, and measurement killed it: Chrome will not use an .ico as an app icon at all,
    // and declaring one with `sizes: "any"` makes Chrome *choose* it and then abandon the install
    // rather than fall back — so the mode did not merely fail to work, it made the backoffice
    // uninstallable. Since .ico is what Umbraco ships, it could never have kept its promise.
}

/// <summary>
/// A resolved icon choice: the mode, and the media item when the mode needs one.
/// </summary>
/// <param name="Mode">Which source to use.</param>
/// <param name="MediaKey">
/// The chosen media item, for <see cref="AppIconMode.Custom"/> only. Null in every other mode, and
/// null in Custom too when nothing has been picked yet — which falls back to
/// <see cref="AppIconMode.Default"/> rather than serving a manifest with no icons, because a
/// manifest with no usable icon is not installable at all.
/// </param>
public sealed record AppIconSource(AppIconMode Mode, Guid? MediaKey)
{
    /// <summary>The shipped default, used when nothing is configured and when Custom has no media.</summary>
    public static AppIconSource Default { get; } = new(AppIconMode.Default, null);
}
