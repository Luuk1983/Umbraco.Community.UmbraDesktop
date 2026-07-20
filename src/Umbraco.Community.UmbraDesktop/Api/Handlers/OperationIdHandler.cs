// Add this file to a composer if you have any custom endpoints for the management API
// builder.Services.AddSingleton<IOperationIdHandler, PackageOperationIdHandler>();

using Umbraco.Cms.Api.Common.OpenApi;
using Asp.Versioning;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.Options;

namespace Umbraco.Community.UmbraDesktop.Api.Handlers;

/// <summary>
/// Custom OpenAPI operation ID handler that overrides the default namespace-based naming behavior.
/// 
/// **MAIN REASON FOR THIS HANDLER:**
/// Without this handler, the default OpenAPI behavior would generate verbose operation IDs that include 
/// the full namespace and controller name (e.g., "ProudNerdsUmbracoPackageRclItemsControllerGetItems").
/// This handler ensures clean, simple operation names using only the action method name (e.g., "GetItems").
/// 
/// This is crucial for:
/// - TypeScript client generation with clean, intuitive service method names
/// - Preventing extremely long and unwieldy operation IDs in the generated OpenAPI spec
/// - Better developer experience when consuming the generated API client
/// - Clear API documentation with consistent, readable naming patterns
/// - Avoiding naming conflicts with other packages or Umbraco core APIs
/// 
/// The handler only processes operations from this package's namespace (Umbraco.Community.UmbraDesktop)
/// to ensure it doesn't interfere with other packages or Umbraco core APIs.
/// </summary>
public class PackageOperationIdHandler(IOptions<ApiVersioningOptions> apiVersioningOptions)
    : OperationIdHandler(apiVersioningOptions)
{
    ///<inheritdoc />
    protected override bool CanHandle(ApiDescription apiDescription,
        ControllerActionDescriptor controllerActionDescriptor)
        => controllerActionDescriptor.ControllerTypeInfo.Namespace?.StartsWith("Umbraco.Community.UmbraDesktop",
            comparisonType: StringComparison.InvariantCultureIgnoreCase) is true;

    ///<inheritdoc />
    public override string Handle(ApiDescription apiDescription) => $"{apiDescription.ActionDescriptor.RouteValues["action"]}";
}