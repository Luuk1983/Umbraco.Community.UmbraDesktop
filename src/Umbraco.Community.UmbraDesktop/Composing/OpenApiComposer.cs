using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.UmbraDesktop.Composing;

/// <summary>
/// Registers the package's own OpenAPI document, <c>/umbraco/openapi/umbradesktop.json</c>, which the
/// TypeScript client in <c>backoffice/src/api</c> is generated from (<c>npm run generate-client</c>).
/// </summary>
/// <remarks>
/// Umbraco 18 replaced Swashbuckle with <c>Microsoft.AspNetCore.OpenApi</c>, and with it the operation
/// and schema ID handlers the package used on 17. Without its own naming the client would carry the
/// route on every method (<c>getUmbradesktopAppIdentity</c>) and the namespace on every type. The
/// document names everything exactly as those handlers did, so the client generated on 17 stays
/// valid; <c>OpenApiContractTests</c> and <c>OpenApiNamingTests</c> hold it to that list.
/// <para>
/// What the document holds is Umbraco's rule: every controller marked
/// <c>[MapToApi(DocumentName)]</c>. All of the package's management API controllers are, which also
/// keeps them out of Umbraco's own management document, where an unmarked one would land.
/// </para>
/// </remarks>
public sealed class OpenApiComposer : IComposer
{
    /// <summary>
    /// The document's name, and so its address under <c>/umbraco/openapi/</c>; the controllers'
    /// <c>[MapToApi]</c> names it.
    /// </summary>
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
                    // Runs after Umbraco's own operation ID transformer, so it has the last word.
                    options.AddOperationTransformer<ActionNameOperationIdTransformer>();

                    options.CreateSchemaReferenceId = SchemaReferenceId;
                }));

    /// <summary>
    /// Names our types the way the client has them, which is Umbraco's own naming ("ViewModel"
    /// trimmed, "Model" appended); everything else as Umbraco 18 names it by default.
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

        var type = Nullable.GetUnderlyingType(typeInfo.Type) ?? typeInfo.Type;
        return type.Namespace?.StartsWith("Umbraco.Community.UmbraDesktop", StringComparison.Ordinal) is true
            || type.Namespace?.StartsWith("Umbraco.Cms", StringComparison.Ordinal) is true
            ? UmbracoSchemaIdGenerator.Generate(type)
            : fallback;
    }

    /// <summary>
    /// Sets the operation ID to the action's own name, so the generated client's methods keep their
    /// names (<c>getAppIdentity</c>, not Umbraco's route-derived <c>getUmbradesktopAppIdentity</c>).
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
