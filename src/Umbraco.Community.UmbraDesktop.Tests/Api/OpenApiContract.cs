using System.Reflection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Routing;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Community.UmbraDesktop.Api;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.DesktopLabel;
using Umbraco.Community.UmbraDesktop.Manifest;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Api;

/// <summary>
/// The names the generated TypeScript client (<c>backoffice/src/api/*.gen.ts</c>) was generated with,
/// which the package's OpenAPI naming must reproduce.
/// </summary>
/// <remarks>
/// The client is generated from the management API's OpenAPI document, and calls every endpoint and
/// model by the name the document gave it. <see cref="OpenApiNamingTests"/> holds the naming handlers
/// to this one list, so a change to either cannot silently rename what the shipped client calls.
/// Change a name here only together with a regenerated client.
/// </remarks>
public static class OpenApiContract
{
    /// <summary>Every operation ID in the client, one per action of a management API controller.</summary>
    public static readonly IReadOnlySet<string> OperationIds = new HashSet<string>
    {
        "GetAppIdentity", "SetAppIdentity",
        "GetBackgroundJobs",
        "GetConnectionStatuses", "GetConnectionStatus",
        "GetConnections", "CreateConnection", "UpdateConnection", "DeleteConnection",
        "GetDesktopLabel", "SetDesktopLabel",
        "GetDocsFiles",
        "GetSitePackageSettings", "SetSitePackageSettings", "PatchSitePackageSettings",
    };

    /// <summary>Every schema the client names, by the type it is generated from.</summary>
    public static readonly IReadOnlyDictionary<Type, string> SchemaNames = new Dictionary<Type, string>
    {
        [typeof(AppIconMode)] = "AppIconModeModel",
        [typeof(AppIdentityRequestModel)] = "AppIdentityRequestModel",
        [typeof(AppIdentityResponseModel)] = "AppIdentityResponseModel",
        [typeof(BackgroundJobReportResponseModel)] = "BackgroundJobReportResponseModel",
        [typeof(BackgroundJobResponseModel)] = "BackgroundJobResponseModel",
        [typeof(DesktopConnectionRequestModel)] = "DesktopConnectionRequestModel",
        [typeof(DesktopConnectionResponseModel)] = "DesktopConnectionResponseModel",
        [typeof(DesktopConnectionStatusResponseModel)] = "DesktopConnectionStatusResponseModel",
        [typeof(DesktopLabelCorner)] = "DesktopLabelCornerModel",
        [typeof(DesktopLabelRequestModel)] = "DesktopLabelRequestModel",
        [typeof(DesktopLabelResponseModel)] = "DesktopLabelResponseModel",
        [typeof(DocsFilesResponseModel)] = "DocsFilesResponseModel",
        [typeof(SitePackageSettingsPatchRequestModel)] = "SitePackageSettingsPatchRequestModel",
        [typeof(SitePackageSettingsRequestModel)] = "SitePackageSettingsRequestModel",
        [typeof(SitePackageSettingsResponseModel)] = "SitePackageSettingsResponseModel",
    };

    /// <summary>
    /// The API description of every action the document describes: each public action with an HTTP
    /// attribute on this package's management API controllers, leaving out a controller the API
    /// explorer is told to ignore (the connection proxy).
    /// </summary>
    /// <returns>One description per action, as the API explorer would hand it to the naming.</returns>
    public static IEnumerable<ApiDescription> ManagementActions()
        => typeof(AppIdentityController).Assembly.GetTypes()
            .Where(type => type.IsSubclassOf(typeof(ManagementApiControllerBase)) && !type.IsAbstract)
            .Where(type => type.GetCustomAttribute<ApiExplorerSettingsAttribute>()?.IgnoreApi is not true)
            .SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(method => method.GetCustomAttributes<HttpMethodAttribute>().Any())
                .Select(method => Describe(type, method)));

    /// <summary>
    /// An API description for one action, carrying what the naming reads: the controller type, the
    /// method and the route values.
    /// </summary>
    /// <param name="controller">The controller type.</param>
    /// <param name="action">The action method.</param>
    /// <returns>The description.</returns>
    public static ApiDescription Describe(Type controller, MethodInfo action)
        => new()
        {
            ActionDescriptor = new ControllerActionDescriptor
            {
                ControllerTypeInfo = controller.GetTypeInfo(),
                MethodInfo = action,
                ActionName = action.Name,
                ControllerName = controller.Name.Replace("Controller", string.Empty, StringComparison.Ordinal),
                RouteValues = new Dictionary<string, string?>
                {
                    ["action"] = action.Name,
                    ["controller"] = controller.Name.Replace("Controller", string.Empty, StringComparison.Ordinal),
                },
            },
            HttpMethod = action.GetCustomAttributes<HttpMethodAttribute>().First().HttpMethods.First(),
            RelativePath = "umbraco/management/api/v1/umbradesktop/test",
        };
}

/// <summary>
/// Keeps the contract itself honest: it lists exactly the actions and models there are, so a new
/// endpoint or model cannot ship without a decision about its client name.
/// </summary>
public class OpenApiContractTests
{
    /// <summary>Every management API action is in the contract, and nothing else is.</summary>
    [Fact]
    public void Lists_every_management_api_action()
        => Assert.Equal(
            OpenApiContract.OperationIds.Order(),
            OpenApiContract.ManagementActions().Select(d => d.ActionDescriptor.RouteValues["action"]!).Order());

    /// <summary>
    /// Every public type in the API's view models namespace has a contracted name. The two enums are
    /// listed by hand, as they live with their features rather than with the view models.
    /// </summary>
    [Fact]
    public void Names_every_api_model()
    {
        var models = typeof(AppIdentityResponseModel).Assembly.GetTypes()
            .Where(type => type.IsPublic && type.Namespace == typeof(AppIdentityResponseModel).Namespace)
            .Concat([typeof(AppIconMode), typeof(DesktopLabelCorner)]);

        Assert.Equal(
            OpenApiContract.SchemaNames.Keys.Select(type => type.FullName).Order(),
            models.Select(type => type.FullName).Order());
    }
}
