namespace Umbraco.Community.UmbraDesktop.UserData;

/// <summary>
/// Where this package's rows live in Umbraco's per-user key/value store.
/// </summary>
public static class DesktopUserData
{
    /// <summary>
    /// The group every row this package stores belongs to.
    /// </summary>
    /// <remarks>
    /// The same literal appears in <c>backoffice/src/desktop/user-data/constants.ts</c>, because a
    /// C# constant cannot be read from TypeScript and nothing can make the two share one. Each side
    /// pins the exact string in a test. Change one without the other and the browser writes rows
    /// this cleanup no longer matches.
    /// </remarks>
    public const string Group = "Umbraco.Community.UmbraDesktop";
}
