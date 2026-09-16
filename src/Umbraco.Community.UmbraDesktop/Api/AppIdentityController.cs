using System.Text.Json;
using System.Text.Json.Serialization;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Web;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.Configuration;
using Umbraco.Community.UmbraDesktop.Manifest;

namespace Umbraco.Community.UmbraDesktop.Api;

/// <summary>
/// Reads and writes the site-wide name and icon of the installed app.
/// </summary>
/// <remarks>
/// <para>
/// The route segment must stay <c>umbradesktop</c> without a hyphen:
/// <c>backoffice/scripts/generate-openapi.js</c> filters the spec on the path prefix
/// <c>/umbraco/management/api/v1/umbradesktop</c>, and a mismatch silently produces an empty client.
/// </para>
/// <para>
/// This is the management API used correctly, and it is worth being explicit about why, given the
/// manifest endpoint next door must never touch it. The consumer here <i>is</i> the backoffice, and
/// the operation <i>is</i> data manipulation by a signed-in administrator. What may never point at
/// a route like this one is anything a browser's install machinery reads.
/// </para>
/// <para>
/// Gated on Settings-section access, unlike everything else the desktop stores. This is the first
/// setting in that dialog that is not one user's preference: it changes what every person on the
/// site gets, so an editor adjusting their wallpaper must not be able to reach it.
/// </para>
/// </remarks>
/// <param name="resolver">Resolves the effective values.</param>
/// <param name="keyValueService">Where the stored document lives.</param>
/// <param name="options">Used only to report and enforce what configuration has taken over.</param>
/// <param name="iconSetFactory">Builds the preview, using the same code path the manifest uses.</param>
/// <param name="umbracoContextFactory">
/// Establishes an <c>UmbracoContext</c> so a media key can be resolved to a URL. Needed here for
/// the same reason the manifest endpoint needs it: without one, media silently resolves to nothing.
/// </param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/app-identity")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.SectionAccessSettings)]
public class AppIdentityController(
    IAppIdentityResolver resolver,
    IKeyValueService keyValueService,
    IOptions<UmbraDesktopOptions> options,
    IAppIconSetFactory iconSetFactory,
    IUmbracoContextFactory umbracoContextFactory) : ManagementApiControllerBase
{
    /// <summary>Enum names rather than numbers, matching what the resolver reads back.</summary>
    private static readonly JsonSerializerOptions StorageJson = new()
    {
        Converters = { new JsonStringEnumConverter() },
    };

    /// <summary>
    /// Gets the effective app identity.
    /// </summary>
    /// <returns>The values, and which of them configuration has locked.</returns>
    [HttpGet]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(AppIdentityResponseModel), StatusCodes.Status200OK)]
    public IActionResult GetAppIdentity()
    {
        var icon = resolver.ResolveIcon();

        using var umbracoContext = umbracoContextFactory.EnsureUmbracoContext();

        // The largest entry, which is the one an install dialog and a taskbar actually show. Never
        // empty: the factory falls back to the shipped set rather than return nothing.
        var preview = iconSetFactory.Create(icon)[^1].Src;

        return Ok(new AppIdentityResponseModel(
            icon.Mode,
            icon.MediaKey,
            resolver.ResolveName(),
            IconLockedByConfiguration: options.Value.AppIcon is not null,
            NameLockedByConfiguration: options.Value.AppName is not null,
            PreviewUrl: preview));
    }

    /// <summary>
    /// Stores a new app identity.
    /// </summary>
    /// <param name="request">The values to store.</param>
    /// <returns>
    /// No content on success, 400 for Custom with no media, and 409 when the request would change
    /// something configuration owns.
    /// </returns>
    [HttpPost]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public IActionResult SetAppIdentity(AppIdentityRequestModel request)
    {
        // Refused rather than silently stored: writing a value configuration overrides on every read
        // would leave the user staring at an unchanged setting with no explanation.
        //
        // "Changes" rather than "is present" is the test, and that distinction is load-bearing. The
        // screen sends both fields on every write because they share one document, so a request that
        // merely echoes a pinned value back is not an attempted override — and refusing it would
        // make the *other* field unsaveable whenever either one is configured.
        if (ChangesConfigured(options.Value.AppIcon, request))
        {
            return Conflict("The app icon is set in configuration and cannot be changed here.");
        }

        if (ChangesConfiguredName(options.Value.AppName, request.Name))
        {
            return Conflict("The app name is set in configuration and cannot be changed here.");
        }

        if (request.Mode == AppIconMode.Custom && request.MediaKey is null)
        {
            return BadRequest("A custom app icon needs a media item.");
        }

        keyValueService.SetValue(
            AppIdentityResolver.StorageKey,
            JsonSerializer.Serialize(
                new StoredAppIdentity
                {
                    AppIcon = new AppIconOptions { Mode = request.Mode, MediaKey = request.MediaKey },
                    // Blank stored as null, not as "": clearing the field means "stop overriding and
                    // go back to the site's own name", not "name the app nothing".
                    AppName = string.IsNullOrWhiteSpace(request.Name) ? null : request.Name.Trim(),
                },
                StorageJson));

        return NoContent();
    }

    /// <summary>
    /// Whether a request would change an icon that configuration owns.
    /// </summary>
    /// <param name="configured">The configured icon, or null when configuration says nothing.</param>
    /// <param name="request">The incoming request.</param>
    /// <returns>True when the request must be refused.</returns>
    private static bool ChangesConfigured(AppIconOptions? configured, AppIdentityRequestModel request) =>
        configured is not null
        && (configured.Mode != request.Mode || configured.MediaKey != request.MediaKey);

    /// <summary>
    /// Whether a request would change a name that configuration owns.
    /// </summary>
    /// <remarks>
    /// Compared after trimming and treating blank as absent, so the comparison matches the rules the
    /// resolver applies when reading the value back.
    /// </remarks>
    /// <param name="configured">The configured name, or null when configuration says nothing.</param>
    /// <param name="requested">The requested name.</param>
    /// <returns>True when the request must be refused.</returns>
    private static bool ChangesConfiguredName(string? configured, string? requested)
    {
        if (configured is null) return false;

        var wanted = string.IsNullOrWhiteSpace(requested) ? null : requested.Trim();
        return !string.Equals(configured.Trim(), wanted, StringComparison.Ordinal);
    }
}
