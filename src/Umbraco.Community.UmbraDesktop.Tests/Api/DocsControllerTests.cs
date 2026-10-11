using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.Docs;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Api;

/// <summary>
/// Exercises the endpoint the Help app lists a package's docs through.
/// </summary>
/// <remarks>
/// The lister has the path rules and their tests; these cover how each outcome reaches the client,
/// and the permission, which is the easy one to get wrong by copying a Settings-only neighbour.
/// </remarks>
public class DocsControllerTests
{
    /// <summary>
    /// A controller over a lister that answers with the given result.
    /// </summary>
    /// <param name="result">What the lister reports.</param>
    /// <returns>The controller under test.</returns>
    private static DocsController Build(DocsListingResult result)
    {
        var lister = Substitute.For<IDocsFileLister>();
        lister.List(Arg.Any<string?>()).Returns(result);
        return new DocsController(lister);
    }

    /// <summary>A listing comes back as the file list.</summary>
    [Fact]
    public void Returns_the_files_of_a_docs_folder()
    {
        var controller = Build(new DocsListingResult(DocsListingStatus.Ok, ["product.json", "user/README.md"], null));

        var model = Assert.IsType<DocsFilesResponseModel>(
            Assert.IsType<OkObjectResult>(controller.GetDocsFiles("/App_Plugins/X/docs")).Value);

        Assert.Equal(["product.json", "user/README.md"], model.Files);
    }

    /// <summary>A refused path is a 400 that says why.</summary>
    [Fact]
    public void Refuses_an_invalid_path_with_its_reason()
    {
        var controller = Build(new DocsListingResult(DocsListingStatus.Invalid, [], "Only folders under /App_Plugins/ can be listed."));

        var result = Assert.IsType<BadRequestObjectResult>(controller.GetDocsFiles("/css"));

        Assert.Equal("Only folders under /App_Plugins/ can be listed.", result.Value);
    }

    /// <summary>A folder that is not there is a 404.</summary>
    [Fact]
    public void Reports_a_missing_folder_as_404()
    {
        var controller = Build(new DocsListingResult(DocsListingStatus.NotFound, [], null));

        Assert.IsType<NotFoundResult>(controller.GetDocsFiles("/App_Plugins/X/docs"));
    }

    /// <summary>
    /// Any backoffice user may read the docs, so the gate is backoffice access and no section. The
    /// base class also adds Umbraco's own feature policy, which is not a section.
    /// </summary>
    [Fact]
    public void Is_open_to_every_backoffice_user()
    {
        var policies = typeof(DocsController).GetCustomAttributes<AuthorizeAttribute>(inherit: true)
            .Select(attribute => attribute.Policy)
            .Concat(typeof(DocsController).GetMethod(nameof(DocsController.GetDocsFiles))!
                .GetCustomAttributes<AuthorizeAttribute>(inherit: true)
                .Select(attribute => attribute.Policy))
            .ToList();

        Assert.Contains(AuthorizationPolicies.BackOfficeAccess, policies);
        Assert.DoesNotContain(policies, policy => policy is not null && policy.StartsWith("SectionAccess", StringComparison.Ordinal));
    }
}
