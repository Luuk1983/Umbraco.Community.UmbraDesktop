using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.UmbraDesktop.Compat.Umbraco18;

/// <summary>
/// Umbraco 18's half of the OpenAPI naming (plan D5). Umbraco 18 replaced Swashbuckle, and with it the
/// handler hooks the 17 build uses, so the package registers a document of its own instead,
/// <c>/umbraco/openapi/umbradesktop.json</c>, built to name every operation and schema exactly as the
/// 17 build does: one generated TypeScript client serves both majors.
/// </summary>
public sealed class OpenApiComposer : IComposer
{
    /// <summary>The document's name, and so its address under <c>/umbraco/openapi/</c>.</summary>
    public const string DocumentName = "umbradesktop";

    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
        => builder.AddBackOfficeOpenApiDocument(
            DocumentName,
            document => document
                .WithTitle("UmbraDesktop Management API")
                .WithBackOfficeAuthentication()
                .WithJsonOptions(Constants.JsonOptionsNames.BackOffice)
                .ConfigureOpenApiOptions(options =>
                {
                    options.ShouldInclude = Includes;

                    // Runs after Umbraco's own operation ID transformer, so it has the last word.
                    options.AddOperationTransformer<ActionNameOperationIdTransformer>();

                    options.CreateSchemaReferenceId = SchemaReferenceId;
                }));

    /// <summary>
    /// Whether an endpoint belongs in this document.
    /// </summary>
    /// <remarks>
    /// Umbraco's default includes a controller marked <c>[MapToApi("umbradesktop")]</c>. Ours are not
    /// marked, because on 17 that attribute would move them out of the management document the 17
    /// client is generated from. So membership is by assembly, which also keeps out the add-ons'
    /// controllers that a namespace prefix would catch. Management API controllers only: the anonymous
    /// web app manifest controller is in this assembly too, and was never in the 17 document.
    /// </remarks>
    /// <param name="description">The endpoint.</param>
    /// <returns>True for this package's own management API actions.</returns>
    internal static bool Includes(ApiDescription description)
        => description.ActionDescriptor is ControllerActionDescriptor action
        && action.ControllerTypeInfo.Assembly == typeof(OpenApiComposer).Assembly
        && action.ControllerTypeInfo.IsSubclassOf(typeof(ManagementApiControllerBase));

    /// <summary>
    /// Names our types the way 17's <c>PackageSchemaIdHandler</c> does, which is Umbraco's own naming
    /// ("ViewModel" trimmed, "Model" appended); everything else as Umbraco 18 names it by default.
    /// </summary>
    /// <param name="typeInfo">The type being named.</param>
    /// <returns>The schema's name, or <c>null</c> to inline it.</returns>
    internal static string? SchemaReferenceId(JsonTypeInfo typeInfo)
    {
        var fallback = OpenApiOptions.CreateDefaultSchemaReferenceId(typeInfo);
        if (fallback is null)
        {
            return null;
        }

        Type type = Nullable.GetUnderlyingType(typeInfo.Type) ?? typeInfo.Type;
        return type.Namespace?.StartsWith("Umbraco.Community.UmbraDesktop", StringComparison.Ordinal) is true
            || type.Namespace?.StartsWith("Umbraco.Cms", StringComparison.Ordinal) is true
            ? UmbracoSchemaIdGenerator.Generate(type)
            : fallback;
    }

    /// <summary>
    /// The operation ID is the action's own name, as 17's <c>PackageOperationIdHandler</c> makes it, so
    /// the generated client's methods keep their names (<c>getAppIdentity</c>, not Umbraco's
    /// route-derived <c>getUmbradesktopAppIdentity</c>).
    /// </summary>
    internal sealed class ActionNameOperationIdTransformer : IOpenApiOperationTransformer
    {
        /// <inheritdoc />
        public Task TransformAsync(OpenApiOperation operation, OpenApiOperationTransformerContext context, CancellationToken cancellationToken)
        {
            if (context.Description.ActionDescriptor.RouteValues.TryGetValue("action", out var action) && action is not null)
            {
                operation.OperationId = action;
            }

            return Task.CompletedTask;
        }
    }
}
