using Asp.Versioning;
using Microsoft.Extensions.Options;
using Umbraco.Community.UmbraDesktop.Api.Handlers;
using Umbraco.Community.UmbraDesktop.Tests.Api;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Compat.Umbraco17;

/// <summary>
/// Umbraco 17's OpenAPI naming, the Swashbuckle handlers, held to the contract the generated client
/// was made with (<see cref="OpenApiContract"/>). Compiled only into the Umbraco 17 build; its twin
/// in <c>Compat/Umbraco18</c> holds the 18 document to the same list.
/// </summary>
public class OpenApiNamingTests
{
    /// <summary>The operation ID handler, as the package registers it.</summary>
    private static readonly PackageOperationIdHandler Operations = new(Options.Create(new ApiVersioningOptions()));

    /// <summary>Every management action is named by the handler, with its contracted name.</summary>
    [Fact]
    public void Names_every_operation_as_the_client_expects()
    {
        var named = OpenApiContract.ManagementActions()
            .Select(description =>
            {
                Assert.True(Operations.CanHandle(description), $"{description.ActionDescriptor.DisplayName} is not handled");
                return Operations.Handle(description);
            });

        Assert.Equal(OpenApiContract.OperationIds.Order(), named.Order());
    }

    /// <summary>Every model is named by the handler, with its contracted name.</summary>
    [Fact]
    public void Names_every_schema_as_the_client_expects()
    {
        var handler = new PackageSchemaIdHandler();
        foreach (var (type, expected) in OpenApiContract.SchemaNames)
        {
            Assert.True(handler.CanHandle(type), $"{type.Name} is not handled");
            Assert.Equal(expected, handler.Handle(type));
        }
    }

    /// <summary>Umbraco's own types are left to Umbraco's handler, so ours never renames them.</summary>
    [Fact]
    public void Leaves_umbracos_own_schemas_alone()
        => Assert.False(new PackageSchemaIdHandler().CanHandle(typeof(Umbraco.Cms.Core.Models.PagedModel<string>)));
}
