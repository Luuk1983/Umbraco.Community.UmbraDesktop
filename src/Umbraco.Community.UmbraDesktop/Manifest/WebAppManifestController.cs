using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core.Web;
using Umbraco.Cms.Web.Common.Hosting;

namespace Umbraco.Community.UmbraDesktop.Manifest;

/// <summary>
/// Serves the backoffice's web app manifest.
/// </summary>
/// <remarks>
/// <para>
/// Routed at the site root rather than under the backoffice path, because everything under
/// <c>/umbraco</c> belongs to Umbraco's own routing and planting a route in it invites a collision
/// with a future core release. Nothing is lost by sitting outside: a manifest's own URL does not
/// have to fall within the <c>scope</c> it declares.
/// </para>
/// <para>
/// <see cref="AllowAnonymousAttribute"/> is load-bearing, not an oversight. The manifest is fetched
/// by the browser's install machinery rather than by the page, so it cannot be assumed to carry the
/// backoffice session, and an install can begin from the login screen. That bounds what may ever be
/// put in here to things which are already public — today, the site's name and its icon.
/// </para>
/// </remarks>
/// <param name="builder">Derives the manifest's paths.</param>
/// <param name="pathGenerator">
/// Supplies the backoffice's virtual path. This, and not <c>GlobalSettings</c>: Umbraco 17 has no
/// <c>GlobalSettings.UmbracoPath</c> at all, and <see cref="IBackOfficePathGenerator"/> is what
/// core's own manifest controllers take for the same question.
/// </param>
/// <param name="identity">
/// Supplies the app's name and icon choice. Note what it replaced: the name used to come from
/// <c>IHostingEnvironment.SiteName</c>, which substitutes the <i>application</i> name when nothing
/// is configured — so an unconfigured site shipped an assembly identifier as its app name, visibly
/// and only on somebody's taskbar.
/// </param>
/// <param name="iconSetFactory">Turns the resolved icon choice into manifest entries.</param>
/// <param name="umbracoContextFactory">
/// Establishes an <c>UmbracoContext</c> for the duration of the request. Required, and its absence
/// was a real bug: this endpoint is routed outside Umbraco's own pipeline, so no context exists by
/// the time it runs, and <c>IPublishedUrlProvider.GetMediaUrl</c> quietly resolves to nothing
/// without one. A custom icon therefore fell back to the shipped mark and the setting looked
/// broken — silently, because nothing throws.
/// </param>
[ApiController]
[AllowAnonymous]
public sealed class WebAppManifestController(
    IWebAppManifestBuilder builder,
    IBackOfficePathGenerator pathGenerator,
    IAppIdentityResolver identity,
    IAppIconSetFactory iconSetFactory,
    IUmbracoContextFactory umbracoContextFactory) : ControllerBase
{
    /// <summary>
    /// Gets the manifest.
    /// </summary>
    /// <returns>The manifest as <c>application/manifest+json</c>.</returns>
    [HttpGet("umbradesktop/manifest.webmanifest")]
    public IActionResult Get()
    {
        // Scoped around the build because the icon set is the part that needs it: resolving a media
        // key to a URL goes through the published cache, which is reachable only with a context.
        using var umbracoContext = umbracoContextFactory.EnsureUmbracoContext();

        var manifest = builder.Build(
            pathGenerator.BackOfficePath,
            identity.ResolveName(),
            iconSetFactory.Create(identity.ResolveIcon()));

        // Revalidate every time. Without a Cache-Control header a browser is free to apply
        // heuristic caching, and it does: changing the app's name or icon appeared to do nothing,
        // because the browser kept serving itself the manifest it already had. "no-cache" permits
        // caching but forbids using it without asking, which is the right trade for a document that
        // is small, read rarely, and wrong the moment a setting changes.
        Response.Headers.CacheControl = "no-cache";

        // Content type set on the result rather than with [Produces]. [Produces] constrains content
        // negotiation to a media type the JSON output formatter does not advertise, which risks a
        // 406 on a request nobody chose to make; setting it here relabels the same JSON, which is
        // all that is wanted.
        return new JsonResult(manifest) { ContentType = "application/manifest+json" };
    }
}
