using System.Text.Json;
using System.Text.Json.Nodes;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.PackageSettings;

namespace Umbraco.Community.UmbraDesktop.Api;

/// <summary>
/// Reads and changes a package's site-wide settings: one value per package key, for everyone.
/// </summary>
/// <remarks>
/// <para>
/// The route segment must stay <c>umbradesktop</c> without a hyphen:
/// <c>backoffice/scripts/generate-openapi.js</c> filters the spec on the path prefix
/// <c>/umbraco/management/api/v1/umbradesktop</c>, and a mismatch silently produces an empty client.
/// </para>
/// <para>
/// <b>Reading is open to every backoffice user</b>, like the desktop label: a site setting is for
/// everyone who uses the package, and an editor with one section is exactly who it is for. So a
/// package must not keep anything secret in one.
/// </para>
/// <para>
/// <b>Changing is decided per key, on the server</b>, by <see cref="SitePackageSettingsPermissions"/>:
/// the Settings section unless the package registered another policy. Not an attribute, because the
/// policy depends on the key in the route. The 403 it answers is not declared on the actions: core's
/// security filter adds 401 and 403 to every backoffice operation, and a second declaration makes it
/// throw, which takes down the whole management API's OpenAPI document.
/// </para>
/// <para>
/// <b>Every 400 says why the same way</b>: a problem details body of type <see cref="RefusedType"/>
/// whose <see cref="ProblemsMember"/> lists the reasons, the package's validators' among them, so the
/// browser's store can tell a refusal, which it must not send again, from a failure, which it does.
/// Not a validation problem's <c>errors</c>: Umbraco's serializer rewrites that dictionary into its
/// own shape, which the first real run showed. A type, because Umbraco's client only passes a body
/// through untouched when it looks like problem details.
/// </para>
/// </remarks>
/// <param name="store">Where the values are kept.</param>
/// <param name="permissions">Which policies a key's change needs.</param>
/// <param name="authorization">Checks the signed-in user against those policies.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/package-settings/site")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
public class SitePackageSettingsController(
    ISitePackageSettingsStore store,
    SitePackageSettingsPermissions permissions,
    IAuthorizationService authorization) : ManagementApiControllerBase
{
    /// <summary>
    /// The member of a 400's body that lists why the change was refused. Read by the browser's site
    /// settings document, so the two must not drift.
    /// </summary>
    public const string ProblemsMember = "problems";

    /// <summary>The problem type of a refused change, so the browser can tell it from any other 400.</summary>
    public const string RefusedType = "UmbraDesktopSiteSettingsRefused";

    /// <summary>
    /// Gets a package's site setting, and whether this user may change it.
    /// </summary>
    /// <param name="key">The package key.</param>
    /// <returns>The value and the permission, or 400 for a key that cannot be stored.</returns>
    [HttpGet("{key}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(SitePackageSettingsResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetSitePackageSettings(string key)
    {
        if (!SitePackageSettingsKey.IsValid(key)) return BadKey();

        return Ok(new SitePackageSettingsResponseModel(store.Read(key), await CanChange(key)));
    }

    /// <summary>
    /// Replaces a package's site setting, whole.
    /// </summary>
    /// <param name="key">The package key.</param>
    /// <param name="request">The new value, as JSON text.</param>
    /// <returns>
    /// The value as stored; 400 with the reasons for a bad key, a value that is not JSON, one over the
    /// limit or one the package's validators refuse; 403 when this user may not change it.
    /// </returns>
    [HttpPut("{key}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(SitePackageSettingsResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SetSitePackageSettings(string key, SitePackageSettingsRequestModel request)
    {
        if (!SitePackageSettingsKey.IsValid(key)) return BadKey();
        if (!await CanChange(key)) return Forbidden();
        if (request.Value is null || !IsJson(request.Value, out _)) return Refused("The value is not JSON.");

        return Answer(store.Replace(key, request.Value));
    }

    /// <summary>
    /// Merges a JSON Merge Patch into a package's site setting, so two people changing different
    /// parts of it at once both keep their change.
    /// </summary>
    /// <param name="key">The package key.</param>
    /// <param name="request">The patch, a JSON object as text.</param>
    /// <returns>
    /// The merged value as stored, which includes everyone else's changes; 400 with the reasons for a
    /// bad key, a patch that is not a JSON object, or a merged value over the limit or refused by the
    /// package's validators; 403 when this user may not change it.
    /// </returns>
    [HttpPatch("{key}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(SitePackageSettingsResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> PatchSitePackageSettings(string key, SitePackageSettingsPatchRequestModel request)
    {
        if (!SitePackageSettingsKey.IsValid(key)) return BadKey();
        if (!await CanChange(key)) return Forbidden();

        // An object only: any other patch replaces the whole value, which is what a replace is for,
        // and taking it here would hide a package's mistake.
        if (request.Patch is null || !IsJson(request.Patch, out var parsed) || parsed is not JsonObject)
        {
            return Refused("The patch is not a JSON object.");
        }

        return Answer(store.Patch(key, request.Patch));
    }

    /// <summary>
    /// Whether the signed-in user meets every policy the key's change needs.
    /// </summary>
    /// <param name="key">The package key.</param>
    /// <returns>True when they may change it.</returns>
    private async Task<bool> CanChange(string key)
    {
        foreach (var policy in permissions.ChangePolicies(key))
        {
            if (!(await authorization.AuthorizeAsync(User, null, policy)).Succeeded) return false;
        }

        return true;
    }

    /// <summary>
    /// Parses JSON text from a request.
    /// </summary>
    /// <param name="text">The text.</param>
    /// <param name="node">The parsed value, null for the JSON literal <c>null</c> or text that is not JSON.</param>
    /// <returns>Whether the text is JSON.</returns>
    private static bool IsJson(string text, out JsonNode? node)
    {
        try
        {
            node = JsonNode.Parse(text);
            return true;
        }
        catch (JsonException)
        {
            node = null;
            return false;
        }
    }

    /// <summary>
    /// The answer to a change: the value as stored, or a 400 with why it was not.
    /// </summary>
    /// <remarks>Can change is true: only a user who may change the value gets this far.</remarks>
    /// <param name="result">What the store did.</param>
    /// <returns>A 200 or a 400.</returns>
    private IActionResult Answer(SitePackageSettingsWriteResult result) =>
        result.Value is { } stored
            ? Ok(new SitePackageSettingsResponseModel(stored, true))
            : Refused([.. result.Problems]);

    /// <summary>The answer for a key the store cannot keep.</summary>
    /// <returns>A 400 that says why.</returns>
    private BadRequestObjectResult BadKey() => Refused(
        $"The key must be non-empty, unpadded, at most {SitePackageSettingsKey.MaxLength} characters, and not the desktop's own group.");

    /// <summary>
    /// A 400 listing why a request was refused, under <see cref="ProblemsMember"/>.
    /// </summary>
    /// <param name="problems">The reasons, one sentence each.</param>
    /// <returns>The answer.</returns>
    private BadRequestObjectResult Refused(params string[] problems) => BadRequest(
        new ProblemDetails
        {
            Type = RefusedType,
            Title = "The change was refused.",
            Status = StatusCodes.Status400BadRequest,
            Extensions = { [ProblemsMember] = problems },
        });
}
