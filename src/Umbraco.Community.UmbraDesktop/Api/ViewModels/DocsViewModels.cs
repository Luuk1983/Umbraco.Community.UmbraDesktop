namespace Umbraco.Community.UmbraDesktop.Api.ViewModels;

/// <summary>
/// The files of one docs folder, as the Help app reads them.
/// </summary>
/// <param name="Files">The pages and data files, relative to the folder, with forward slashes.</param>
public sealed record DocsFilesResponseModel(IReadOnlyList<string> Files);
