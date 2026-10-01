namespace Umbraco.Community.UmbraDesktop.Docs;

/// <summary>
/// Lists the files of a package's docs folder, so the Help app knows which pages exist without a
/// build step having to write an index.
/// </summary>
public interface IDocsFileLister
{
    /// <summary>
    /// Lists the pages and data files under a docs folder.
    /// </summary>
    /// <param name="path">
    /// The folder's URL path, such as <c>/App_Plugins/My.Package/docs</c>, exactly as a
    /// <c>umbraDesktopDocs</c> manifest names it.
    /// </param>
    /// <returns>The files, or why they could not be listed.</returns>
    DocsListingResult List(string? path);
}
