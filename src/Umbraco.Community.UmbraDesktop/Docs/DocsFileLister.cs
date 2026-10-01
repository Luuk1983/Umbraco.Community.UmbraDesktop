using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;

namespace Umbraco.Community.UmbraDesktop.Docs;

/// <summary>
/// Lists a docs folder through the web root's file provider, which is where every package's
/// <c>App_Plugins</c> files are served from.
/// </summary>
/// <remarks>
/// <para>
/// The web root provider rather than the disk: during development a package's files are static web
/// assets served from its own project folder, and only the provider sees them where the browser
/// does. It is read per call because the host swaps in the composite provider while it starts.
/// </para>
/// <para>
/// The path rules are the security boundary. The files are public static assets, so listing them
/// gives nothing away, but the endpoint must not become a way to enumerate the rest of the site. So
/// only folders under <c>/App_Plugins/</c> are listed, every segment is checked before anything is
/// read, and a folder has to hold a <c>product.json</c> to count as docs at all.
/// </para>
/// </remarks>
/// <param name="environment">Supplies the web root's file provider.</param>
public sealed partial class DocsFileLister(IWebHostEnvironment environment) : IDocsFileLister
{
    /// <summary>The only folder the endpoint lists below.</summary>
    private const string Root = "/App_Plugins/";

    /// <summary>The file that makes a folder a docs folder.</summary>
    private const string ProductFile = "product.json";

    /// <summary>
    /// How many files one folder may list. Far above any real docs set (UmbraDesktop's is about
    /// fifty), and there so a mistaken path cannot walk a huge tree.
    /// </summary>
    private const int MaxFiles = 2000;

    /// <summary>How deep the walk goes, for the same reason.</summary>
    private const int MaxDepth = 10;

    /// <summary>The extensions the Help app reads. Images are fetched by the pages that use them.</summary>
    private static readonly string[] ListedExtensions = [".md", ".json"];

    /// <summary>One path segment: letters, digits, dots, hyphens and underscores.</summary>
    [GeneratedRegex("^[A-Za-z0-9._-]+$")]
    private static partial Regex Segment();

    /// <inheritdoc />
    public DocsListingResult List(string? path)
    {
        if (string.IsNullOrEmpty(path) || !path.StartsWith(Root, StringComparison.Ordinal))
        {
            return DocsListingResult.Invalid("Only folders under /App_Plugins/ can be listed.");
        }

        var segments = path[Root.Length..].TrimEnd('/').Split('/');
        if (segments.Length == 0 || segments.Any(segment => segment is "" or "." or ".." || !Segment().IsMatch(segment)))
        {
            return DocsListingResult.Invalid(
                "The path has to name a folder under /App_Plugins/ with plain segments: no '.', '..', empty segments or backslashes.");
        }

        var folder = Root + string.Join('/', segments);
        var provider = environment.WebRootFileProvider;
        if (!provider.GetDirectoryContents(folder).Exists)
        {
            return DocsListingResult.NotFound;
        }

        if (!provider.GetFileInfo($"{folder}/{ProductFile}").Exists)
        {
            return DocsListingResult.Invalid($"{folder} has no {ProductFile}, so it is not a docs folder.");
        }

        var files = new List<string>();
        Walk(provider, folder, string.Empty, 0, files);
        files.Sort(StringComparer.Ordinal);
        return new DocsListingResult(DocsListingStatus.Ok, files, null);
    }

    /// <summary>
    /// Adds the listed files under one folder, and recurses into its subfolders.
    /// </summary>
    /// <param name="provider">The web root provider.</param>
    /// <param name="folder">The docs folder's URL path.</param>
    /// <param name="relative">The current subfolder relative to it, empty or ending in a slash.</param>
    /// <param name="depth">How deep the walk is.</param>
    /// <param name="files">Where listed files are collected.</param>
    private static void Walk(IFileProvider provider, string folder, string relative, int depth, List<string> files)
    {
        if (depth > MaxDepth)
        {
            return;
        }

        foreach (var entry in provider.GetDirectoryContents(folder + "/" + relative))
        {
            if (files.Count >= MaxFiles)
            {
                return;
            }

            if (entry.IsDirectory)
            {
                Walk(provider, folder, relative + entry.Name + "/", depth + 1, files);
            }
            else if (ListedExtensions.Contains(Path.GetExtension(entry.Name), StringComparer.OrdinalIgnoreCase))
            {
                files.Add(relative + entry.Name);
            }
        }
    }
}
