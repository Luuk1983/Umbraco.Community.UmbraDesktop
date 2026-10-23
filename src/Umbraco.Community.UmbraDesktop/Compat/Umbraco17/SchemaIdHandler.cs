// Add this file to a composer if you have any custom endpoints for the management API
// builder.Services.AddSingleton<ISchemaIdHandler, PackageSchemaIdHandler>();

using Umbraco.Cms.Api.Common.OpenApi;

namespace Umbraco.Community.UmbraDesktop.Api.Handlers;

/// <summary>
/// Custom OpenAPI schema ID handler that overrides the default namespace-based naming behavior.
/// 
/// **MAIN REASON FOR THIS HANDLER:**
/// Without this handler, the default OpenAPI behavior would generate verbose schema IDs that include 
/// the full namespace path (e.g., "Umbraco.Community.UmbraDesktop.Models.ItemDto").
/// This handler ensures clean, simple schema names without the verbose namespace prefix.
/// 
/// This is crucial for:
/// - TypeScript client generation with clean, readable type names
/// - Preventing extremely long and unwieldy schema names in the generated OpenAPI spec  
/// - Better developer experience when working with generated types
/// - Clear API documentation with consistent, readable type naming
/// - Avoiding naming conflicts with other packages or Umbraco core schemas
/// 
/// The handler only processes types from this package's namespace (Umbraco.Community.UmbraDesktop)
/// to ensure it doesn't interfere with other packages or Umbraco core APIs.
/// </summary>
public class PackageSchemaIdHandler : SchemaIdHandler
{
    ///<inheritdoc />
    public override bool CanHandle(Type type)
        => (type.Namespace?.StartsWith("Umbraco.Community.UmbraDesktop") ?? false);
}