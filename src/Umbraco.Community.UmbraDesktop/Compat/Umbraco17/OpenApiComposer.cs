using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.UmbraDesktop.Api.Handlers;

namespace Umbraco.Community.UmbraDesktop.Compat.Umbraco17;

/// <summary>
/// Umbraco 17's half of the OpenAPI naming (plan D5): Swashbuckle's handler hooks, which Umbraco 18
/// removed. Compiled only into the Umbraco 17 build. Both majors must name operations and schemas
/// identically, because one generated TypeScript client serves both.
/// </summary>
public sealed class OpenApiComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        // Keeps the generated TypeScript client's operation and schema names short — without
        // these the client would carry the full controller and namespace on every method and type.
        builder.Services.AddSingleton<IOperationIdHandler, PackageOperationIdHandler>();
        builder.Services.AddSingleton<ISchemaIdHandler, PackageSchemaIdHandler>();
    }
}
