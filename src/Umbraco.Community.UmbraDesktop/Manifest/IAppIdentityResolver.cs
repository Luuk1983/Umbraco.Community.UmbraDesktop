namespace Umbraco.Community.UmbraDesktop.Manifest;

/// <summary>
/// Decides what the served manifest says this app is called, and which icon it wears.
/// </summary>
/// <remarks>
/// One resolver for both rather than two, because they are one decision made in one place: the same
/// sources in the same order, one stored document, one screen in the backoffice. Splitting them
/// would duplicate the whole chain to express a distinction nobody setting them perceives.
/// </remarks>
public interface IAppIdentityResolver
{
    /// <summary>
    /// Resolve the icon choice.
    /// </summary>
    /// <returns>The resolved source. Never null, and never a mode that cannot produce an icon.</returns>
    AppIconSource ResolveIcon();

    /// <summary>
    /// Resolve the app's name.
    /// </summary>
    /// <returns>
    /// The name, or null when nothing anywhere names this site — which the caller turns into a
    /// fallback. Deliberately <b>not</b> the application name; see the remarks on the implementation.
    /// </returns>
    string? ResolveName();
}
