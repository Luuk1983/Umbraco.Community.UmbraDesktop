namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// What a change to a site setting came to: the value stored, or why nothing was.
/// </summary>
/// <param name="Value">The value as stored, or null when the change was refused.</param>
/// <param name="Problems">Why it was refused, written for the person who made the change. Empty when it was stored.</param>
public sealed record SitePackageSettingsWriteResult(string? Value, IReadOnlyList<string> Problems)
{
    /// <summary>
    /// A stored change.
    /// </summary>
    /// <param name="value">The value as stored.</param>
    /// <returns>The result.</returns>
    public static SitePackageSettingsWriteResult Stored(string value) => new(value, []);

    /// <summary>
    /// A refused change.
    /// </summary>
    /// <param name="problems">Why. At least one.</param>
    /// <returns>The result.</returns>
    public static SitePackageSettingsWriteResult Refused(IReadOnlyList<string> problems) => new(null, problems);
}
