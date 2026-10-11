namespace Umbraco.Community.UmbraDesktop.Docs;

/// <summary>
/// How a request to list a docs folder turned out.
/// </summary>
public enum DocsListingStatus
{
    /// <summary>The folder is a docs folder and its files are listed.</summary>
    Ok,

    /// <summary>The path is not one this endpoint lists: outside <c>/App_Plugins/</c>, malformed, or not a docs folder.</summary>
    Invalid,

    /// <summary>The path is well formed but nothing is there, which is what an uninstalled package looks like.</summary>
    NotFound,
}

/// <summary>
/// The outcome of listing a docs folder.
/// </summary>
/// <param name="Status">Whether it could be listed.</param>
/// <param name="Files">
/// The pages and data files, relative to the folder, with forward slashes, in ordinal order. Empty
/// unless <paramref name="Status"/> is <see cref="DocsListingStatus.Ok"/>.
/// </param>
/// <param name="Reason">Why an invalid path was refused, in words a package author can act on.</param>
public sealed record DocsListingResult(DocsListingStatus Status, IReadOnlyList<string> Files, string? Reason)
{
    /// <summary>
    /// A refusal with its reason.
    /// </summary>
    /// <param name="reason">Why the path was refused.</param>
    /// <returns>An invalid result.</returns>
    public static DocsListingResult Invalid(string reason) => new(DocsListingStatus.Invalid, [], reason);

    /// <summary>A folder that is not there.</summary>
    public static DocsListingResult NotFound { get; } = new(DocsListingStatus.NotFound, [], null);
}
