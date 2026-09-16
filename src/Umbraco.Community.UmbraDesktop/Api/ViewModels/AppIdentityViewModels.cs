using Umbraco.Community.UmbraDesktop.Manifest;

namespace Umbraco.Community.UmbraDesktop.Api.ViewModels;

/// <summary>
/// The current app identity, as the backoffice needs to render it.
/// </summary>
/// <param name="Mode">The effective icon mode.</param>
/// <param name="MediaKey">The chosen media item, when the mode is Custom.</param>
/// <param name="Name">
/// The effective app name, or null when nothing names this site. Null is meaningful to the UI: it
/// shows an empty field rather than pretending a name exists.
/// </param>
/// <param name="IconLockedByConfiguration">
/// Whether <c>appsettings.json</c> supplies the icon, in which case the backoffice must show it and
/// refuse to edit it. Sent rather than inferred, because the client cannot see configuration and a
/// UI that silently accepts edits it will then ignore is worse than one that says no.
/// </param>
/// <param name="NameLockedByConfiguration">
/// Whether <c>appsettings.json</c> supplies the name. Separate from the icon's flag because the two
/// are configured independently — pinning one must not disable the other's control.
/// </param>
/// <param name="PreviewUrl">
/// The icon the manifest would actually serve, for the backoffice to show.
/// <para>
/// Produced by the same factory the manifest uses, rather than reconstructed on the client. That is
/// the point: a preview assembled separately would be a second opinion about the icon, and would
/// have quietly agreed with the UI while the manifest served something else — which is exactly the
/// class of bug that made a custom icon silently fall back to the shipped mark.
/// </para>
/// </param>
public sealed record AppIdentityResponseModel(
    AppIconMode Mode,
    Guid? MediaKey,
    string? Name,
    bool IconLockedByConfiguration,
    bool NameLockedByConfiguration,
    string PreviewUrl);

/// <summary>
/// A request to change the stored app identity.
/// </summary>
/// <remarks>
/// Both fields are always sent, because they share one stored document: a request carrying only the
/// icon would blank the name as a side effect of changing the picture.
/// </remarks>
/// <param name="Mode">The icon mode to store.</param>
/// <param name="MediaKey">The media item, required when <paramref name="Mode"/> is Custom.</param>
/// <param name="Name">
/// The app name to store, or null/blank to stop overriding and fall back to the site's own name.
/// </param>
public sealed record AppIdentityRequestModel(AppIconMode Mode, Guid? MediaKey, string? Name);
