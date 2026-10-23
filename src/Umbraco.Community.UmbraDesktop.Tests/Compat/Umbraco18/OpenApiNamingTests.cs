using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi;
using Umbraco.Cms.Api.Management.Controllers.Server;
using Umbraco.Community.UmbraDesktop.Api;
using Umbraco.Community.UmbraDesktop.Compat.Umbraco18;
using Umbraco.Community.UmbraDesktop.Manifest;
using Umbraco.Community.UmbraDesktop.Tests.Api;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Compat.Umbraco18;

/// <summary>
/// Umbraco 18's OpenAPI naming, the package's own <c>umbradesktop</c> document, held to the contract
/// the generated client was made with (<see cref="OpenApiContract"/>). Compiled only into the
/// Umbraco 18 build; its twin in <c>Compat/Umbraco17</c> holds the Swashbuckle handlers to the same list.
/// </summary>
public class OpenApiNamingTests
{
    /// <summary>Serializer options that can describe any type, as the document's are.</summary>
    private static readonly JsonSerializerOptions Json = new() { TypeInfoResolver = new DefaultJsonTypeInfoResolver() };

    /// <summary>Every management action is in the document.</summary>
    [Fact]
    public void Includes_every_management_action()
        => Assert.All(OpenApiContract.ManagementActions(), description => Assert.True(OpenApiComposer.Includes(description)));

    /// <summary>
    /// The web app manifest controller is in this assembly but is not a management API controller,
    /// and was never in the 17 document: a namespace or assembly rule alone took it in.
    /// </summary>
    [Fact]
    public void Leaves_out_the_web_app_manifest()
        => Assert.False(OpenApiComposer.Includes(OpenApiContract.Describe(
            typeof(WebAppManifestController), typeof(WebAppManifestController).GetMethods().First(m => m.DeclaringType == typeof(WebAppManifestController) && m.IsPublic && !m.IsSpecialName))));

    /// <summary>
    /// Umbraco's own management controllers stay in Umbraco's document, and so would an add-on's, which
    /// a namespace prefix would have caught: membership is by this assembly.
    /// </summary>
    [Fact]
    public void Leaves_out_other_assemblies_controllers()
        => Assert.False(OpenApiComposer.Includes(OpenApiContract.Describe(
            typeof(StatusServerController), typeof(StatusServerController).GetMethods().First(m => m.DeclaringType == typeof(StatusServerController) && m.IsPublic && !m.IsSpecialName))));

    /// <summary>An endpoint that is not a controller action is never ours.</summary>
    [Fact]
    public void Leaves_out_non_controller_endpoints()
        => Assert.False(OpenApiComposer.Includes(OpenApiContract.NonControllerAction()));

    /// <summary>Every management action gets its contracted operation ID, whatever Umbraco set before.</summary>
    [Fact]
    public async Task Names_every_operation_as_the_client_expects()
    {
        var transformer = new OpenApiComposer.ActionNameOperationIdTransformer();
        var services = new ServiceCollection().BuildServiceProvider();
        var named = new List<string?>();
        foreach (var description in OpenApiContract.ManagementActions())
        {
            var operation = new OpenApiOperation { OperationId = "GetUmbradesktopSomethingUmbracoChose" };
            await transformer.TransformAsync(
                operation,
                new OpenApiOperationTransformerContext { DocumentName = OpenApiComposer.DocumentName, Description = description, ApplicationServices = services },
                CancellationToken.None);
            named.Add(operation.OperationId);
        }

        Assert.Equal(OpenApiContract.OperationIds.Order(), named.Order());
    }

    /// <summary>Every model gets its contracted schema name.</summary>
    [Fact]
    public void Names_every_schema_as_the_client_expects()
    {
        foreach (var (type, expected) in OpenApiContract.SchemaNames)
        {
            Assert.Equal(expected, OpenApiComposer.SchemaReferenceId(Json.GetTypeInfo(type)));
        }
    }

    /// <summary>A nullable model is named as the model, as Swashbuckle did on 17.</summary>
    [Fact]
    public void Names_a_nullable_enum_as_the_enum()
        => Assert.Equal("AppIconModeModel", OpenApiComposer.SchemaReferenceId(Json.GetTypeInfo(typeof(AppIconMode?))));

    /// <summary>Primitives stay inline, as the framework would have them.</summary>
    [Fact]
    public void Leaves_primitives_inline()
        => Assert.Null(OpenApiComposer.SchemaReferenceId(Json.GetTypeInfo(typeof(string))));
}
