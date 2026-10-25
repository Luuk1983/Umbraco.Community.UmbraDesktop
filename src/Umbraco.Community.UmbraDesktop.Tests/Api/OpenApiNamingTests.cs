using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi;
using Umbraco.Community.UmbraDesktop.Composing;
using Umbraco.Community.UmbraDesktop.Manifest;
using Umbraco.Extensions;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Api;

/// <summary>
/// The package's OpenAPI naming, its own <c>umbradesktop</c> document (<see cref="OpenApiComposer"/>),
/// held to the contract the generated client was made with (<see cref="OpenApiContract"/>).
/// </summary>
public class OpenApiNamingTests
{
    /// <summary>Serializer options that can describe any type, as the document's are.</summary>
    private static readonly JsonSerializerOptions Json = new() { TypeInfoResolver = new DefaultJsonTypeInfoResolver() };

    /// <summary>
    /// Every management action is mapped to the document, which is how Umbraco 18 chooses what a
    /// document holds; an action left unmapped would fall back into Umbraco's own management document.
    /// </summary>
    [Fact]
    public void Maps_every_management_action_to_the_document()
        => Assert.All(OpenApiContract.ManagementActions(), description =>
            Assert.True(description.ActionDescriptor.HasMapToApiAttribute(OpenApiComposer.DocumentName), description.ActionDescriptor.DisplayName));

    /// <summary>
    /// The web app manifest controller is in this assembly but is no management API: it is anonymous,
    /// and stays out of every API document.
    /// </summary>
    [Fact]
    public void Leaves_out_the_web_app_manifest()
        => Assert.False(OpenApiContract.Describe(
            typeof(WebAppManifestController), typeof(WebAppManifestController).GetMethods().First(m => m.DeclaringType == typeof(WebAppManifestController) && m.IsPublic && !m.IsSpecialName))
            .ActionDescriptor.HasMapToApiAttribute(OpenApiComposer.DocumentName));

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

    /// <summary>A nullable model is named as the model, as the client has it.</summary>
    [Fact]
    public void Names_a_nullable_enum_as_the_enum()
        => Assert.Equal("AppIconModeModel", OpenApiComposer.SchemaReferenceId(Json.GetTypeInfo(typeof(AppIconMode?))));

    /// <summary>Primitives stay inline, as the framework would have them.</summary>
    [Fact]
    public void Leaves_primitives_inline()
        => Assert.Null(OpenApiComposer.SchemaReferenceId(Json.GetTypeInfo(typeof(string))));
}
