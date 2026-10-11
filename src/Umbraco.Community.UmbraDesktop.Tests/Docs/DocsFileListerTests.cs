using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using NSubstitute;
using Umbraco.Community.UmbraDesktop.Docs;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Docs;

/// <summary>
/// Exercises the listing the Help app reads a package's docs through.
/// </summary>
/// <remarks>
/// A real folder on disk rather than a substitute file provider: what matters is how the lister
/// walks directories, and a substitute would only test the substitute.
/// </remarks>
public sealed class DocsFileListerTests : IDisposable
{
    /// <summary>A throwaway web root for each test.</summary>
    private readonly string _webRoot = Directory.CreateTempSubdirectory("umbradesktop-docs-").FullName;

    /// <summary>Removes the throwaway web root.</summary>
    public void Dispose() => Directory.Delete(_webRoot, recursive: true);

    /// <summary>
    /// Writes a file under the web root, creating its folders.
    /// </summary>
    /// <param name="path">Path relative to the web root, with forward slashes.</param>
    private void Write(string path)
    {
        var full = Path.Combine(_webRoot, path.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllText(full, "x");
    }

    /// <summary>A lister over the throwaway web root.</summary>
    /// <returns>The lister under test.</returns>
    private DocsFileLister Build()
    {
        var environment = Substitute.For<IWebHostEnvironment>();
        environment.WebRootFileProvider.Returns(new PhysicalFileProvider(_webRoot));
        return new DocsFileLister(environment);
    }

    /// <summary>A docs folder lists its pages and data files, relative to itself, in a stable order.</summary>
    [Fact]
    public void Lists_pages_and_json_relative_to_the_folder()
    {
        Write("App_Plugins/My.Package/docs/product.json");
        Write("App_Plugins/My.Package/docs/user/README.md");
        Write("App_Plugins/My.Package/docs/user/windows/_category_.json");
        Write("App_Plugins/My.Package/docs/user/windows/snapping.md");
        Write("App_Plugins/My.Package/docs/developer/theming.md");

        var result = Build().List("/App_Plugins/My.Package/docs");

        Assert.Equal(DocsListingStatus.Ok, result.Status);
        Assert.Equal(
            ["developer/theming.md", "product.json", "user/README.md", "user/windows/_category_.json", "user/windows/snapping.md"],
            result.Files);
    }

    /// <summary>Images and anything else are left out: pages link to them and the browser fetches them.</summary>
    [Fact]
    public void Leaves_out_images_and_other_files()
    {
        Write("App_Plugins/My.Package/docs/product.json");
        Write("App_Plugins/My.Package/docs/screenshots/a.png");
        Write("App_Plugins/My.Package/docs/notes.txt");

        Assert.Equal(["product.json"], Build().List("/App_Plugins/My.Package/docs").Files);
    }

    /// <summary>A trailing slash names the same folder.</summary>
    [Fact]
    public void Accepts_a_trailing_slash()
    {
        Write("App_Plugins/My.Package/docs/product.json");

        Assert.Equal(DocsListingStatus.Ok, Build().List("/App_Plugins/My.Package/docs/").Status);
    }

    /// <summary>Only package folders can be listed, so the endpoint cannot browse the rest of the site.</summary>
    [Theory]
    [InlineData("/css")]
    [InlineData("/media/docs")]
    [InlineData("App_Plugins/My.Package/docs")]
    [InlineData("/App_Plugins/")]
    [InlineData("")]
    [InlineData(null)]
    public void Refuses_a_path_outside_App_Plugins(string? path)
    {
        var result = Build().List(path);

        Assert.Equal(DocsListingStatus.Invalid, result.Status);
        Assert.Empty(result.Files);
        Assert.False(string.IsNullOrWhiteSpace(result.Reason));
    }

    /// <summary>A path that could climb out of App_Plugins is refused before anything is read.</summary>
    [Theory]
    [InlineData("/App_Plugins/../css")]
    [InlineData("/App_Plugins/My.Package/../../css")]
    [InlineData("/App_Plugins/My.Package\\docs")]
    [InlineData("/App_Plugins//docs")]
    [InlineData("/App_Plugins/My.Package/./docs")]
    public void Refuses_a_path_that_could_climb_out(string path)
    {
        Write("App_Plugins/My.Package/docs/product.json");

        Assert.Equal(DocsListingStatus.Invalid, Build().List(path).Status);
    }

    /// <summary>A folder without a product.json is not a docs folder, whatever else it holds.</summary>
    [Fact]
    public void Refuses_a_folder_without_a_product_json()
    {
        Write("App_Plugins/My.Package/scripts/app.md");

        var result = Build().List("/App_Plugins/My.Package/scripts");

        Assert.Equal(DocsListingStatus.Invalid, result.Status);
        Assert.Contains("product.json", result.Reason);
    }

    /// <summary>A folder that does not exist is a missing folder, not a bad request.</summary>
    [Fact]
    public void Reports_a_missing_folder_as_not_found()
    {
        Assert.Equal(DocsListingStatus.NotFound, Build().List("/App_Plugins/Not.Installed/docs").Status);
    }
}
