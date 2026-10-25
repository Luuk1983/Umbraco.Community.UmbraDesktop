using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.UmbraDesktop.Accessories.StickyNotes;

/// <summary>
/// Registers the sticky note board, the first server-side code in the Accessories package.
/// </summary>
/// <remarks>
/// A singleton, as the host's own key-value stores are: it holds no state of its own, and its
/// writes are serialised by a database lock rather than by sharing an instance. The store's <c>TimeProvider</c> and
/// <c>ICoreScopeProvider</c> are Umbraco's own, so nothing else is registered here: a clock of this
/// package's would replace the one the site chose.
/// <para>
/// The API gets an OpenAPI document of the add-on's own, <c>/umbraco/openapi/umbradesktop-accessories.json</c>,
/// as Umbraco 18 expects of a package, so it is described apart from Umbraco's management API. The
/// app calls it by hand, so nothing is generated from it.
/// </para>
/// </remarks>
public sealed class StickyNotesComposer : IComposer
{
    /// <summary>
    /// The add-on's OpenAPI document, and so its address under <c>/umbraco/openapi/</c>; the controller's
    /// <c>[MapToApi]</c> names it.
    /// </summary>
    public const string OpenApiDocumentName = "umbradesktop-accessories";

    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddSingleton<StickyNoteStore>();
        builder.AddBackOfficeOpenApiDocument(
            OpenApiDocumentName,
            document => document
                .WithTitle("UmbraDesktop Accessories API")
                .WithBackOfficeAuthentication()
                .WithJsonOptions(Constants.JsonOptionsNames.BackOffice));
    }
}
