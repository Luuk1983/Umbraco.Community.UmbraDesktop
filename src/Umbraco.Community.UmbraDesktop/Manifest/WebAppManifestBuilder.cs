namespace Umbraco.Community.UmbraDesktop.Manifest;

/// <summary>
/// Derives every manifest path from the backoffice path, in one place.
/// </summary>
/// <remarks>
/// Pure, and separate from the controller, for the same reason <c>boot-decision.ts</c> is pure on
/// the client: these are rules whose mistakes are silent. A wrong scope does not throw, it quietly
/// ejects the user into a browser tab a week later.
/// </remarks>
public sealed class WebAppManifestBuilder : IWebAppManifestBuilder
{
    /// <summary>
    /// The section's URL segment.
    /// </summary>
    /// <remarks>
    /// Must match <c>UMBRADESKTOP_SECTION_PATHNAME</c> in
    /// <c>backoffice/src/desktop/constants.ts</c>. The two cannot share a constant across the
    /// language boundary, and a drift between them produces a manifest whose <c>start_url</c> is a
    /// 404 — an installed app that opens on Not Found.
    /// </remarks>
    private const string SectionPathname = "umbradesktop";

    /// <summary>
    /// Name used when the site has none, so a nameless site is still installable.
    /// </summary>
    /// <remarks>
    /// The name arrives from <c>IHostingEnvironment.SiteName</c>, which is not guaranteed to be
    /// set, and <c>name</c> is a required manifest member — so an empty one would cost
    /// installability rather than merely looking untidy.
    /// </remarks>
    private const string FallbackName = "Umbraco";

    /// <summary>Umbraco blue, matching the desktop's default theme and the shipped icon.</summary>
    private const string ThemeColour = "#3544B1";

    /// <summary>Longest <c>short_name</c> worth sending; beyond this the OS truncates anyway.</summary>
    private const int ShortNameMaxLength = 12;

    /// <summary>
    /// Characters a site name's first meaningful token can end at.
    /// </summary>
    /// <remarks>
    /// A space is the obvious one and on its own it is not enough. The first real site this ran
    /// against was named <c>Umbraco.Community.UmbraDesktop.TestInstance</c>, which contains no
    /// space at all and so got cut to <c>Umbraco.Comm</c> — mid-word, the exact outcome
    /// <see cref="ShortenName"/> exists to avoid. Dotted, hyphenated and underscored names are at
    /// least as common as spaced ones.
    /// </remarks>
    private static readonly char[] NameSeparators = [' ', '.', '-', '_'];

    /// <inheritdoc />
    public WebAppManifest Build(string backofficePath, string? siteName, IReadOnlyList<WebAppManifestIcon> icons)
    {
        var root = TrimTrailingSlash(backofficePath);
        var name = string.IsNullOrWhiteSpace(siteName) ? FallbackName : siteName.Trim();

        return new WebAppManifest(
            Id: $"{root}/{SectionPathname}",
            Name: name,
            ShortName: ShortenName(name),
            StartUrl: $"{root}/section/{SectionPathname}",
            // Trailing slash restored deliberately: without it a sibling path that merely starts
            // the same — /umbraco-admin against a scope of /umbraco — falls inside the app.
            Scope: $"{root}/",
            Display: "standalone",
            BackgroundColor: ThemeColour,
            ThemeColor: ThemeColour,
            Icons: icons);
    }

    /// <summary>
    /// Strip one trailing slash, so <c>/umbraco</c> and <c>/umbraco/</c> are one path.
    /// </summary>
    /// <param name="path">The path to normalise.</param>
    /// <returns>The path without its trailing slash, never empty.</returns>
    private static string TrimTrailingSlash(string path) =>
        path.Length > 1 && path.EndsWith('/') ? path[..^1] : path;

    /// <summary>
    /// Cut a long site name down to something a taskbar can show.
    /// </summary>
    /// <remarks>
    /// Cut at a separator rather than mid-word, because the alternative is the OS clipping it
    /// wherever its own pixel budget runs out, which lands mid-word and looks broken. A hard cut is
    /// the last resort, for a long name containing no separator at all.
    /// </remarks>
    /// <param name="name">The full name, already trimmed and non-empty.</param>
    /// <returns>The short name.</returns>
    private static string ShortenName(string name)
    {
        if (name.Length <= ShortNameMaxLength) return name;

        var firstToken = name.Split(NameSeparators, StringSplitOptions.RemoveEmptyEntries)[0];
        return firstToken.Length <= ShortNameMaxLength ? firstToken : firstToken[..ShortNameMaxLength];
    }
}
