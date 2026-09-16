namespace Umbraco.Community.UmbraDesktop.Api.ViewModels;

/// <summary>
/// A connection as the backoffice is allowed to see it.
/// </summary>
/// <remarks>
/// There is deliberately no secret here, and there must never be one. The browser is told only
/// whether a secret exists, which is enough to render "set" or "not set" and nothing more.
/// </remarks>
/// <param name="Id">The connection's id.</param>
/// <param name="Name">What the user calls this instance.</param>
/// <param name="BaseUrl">Origin of the remote instance.</param>
/// <param name="Colour">Colour used to tell this connection's rows apart from another's.</param>
/// <param name="ClientId">Client id of the API user on the remote instance.</param>
/// <param name="HasClientSecret">Whether a secret is stored for this connection.</param>
public sealed record DesktopConnectionResponseModel(
    Guid Id,
    string Name,
    string BaseUrl,
    string Colour,
    string ClientId,
    bool HasClientSecret);

/// <summary>
/// A connection as the backoffice sends it when creating or updating one.
/// </summary>
/// <param name="Name">What the user calls this instance.</param>
/// <param name="BaseUrl">Origin of the remote instance.</param>
/// <param name="Colour">Colour used to tell this connection's rows apart from another's.</param>
/// <param name="ClientId">Client id of the API user on the remote instance.</param>
/// <param name="ClientSecret">
/// The secret to store, or <c>null</c> to keep whichever is already stored. Null has to mean
/// unchanged rather than empty: the browser is never given the secret, so it cannot send one back
/// when the user only edited a name.
/// </param>
public sealed record DesktopConnectionRequestModel(
    string Name,
    string BaseUrl,
    string Colour,
    string ClientId,
    string? ClientSecret);

/// <summary>
/// What the Status app shows for one connected instance.
/// </summary>
/// <param name="Id">The connection's id.</param>
/// <param name="Name">What the user calls this instance.</param>
/// <param name="Colour">Colour used to tell this connection's rows apart from another's.</param>
/// <param name="BaseUrl">Origin of the instance, so a row can link to it.</param>
/// <param name="Status">
/// How talking to the instance turned out: <c>Ok</c>, <c>Unreachable</c>, <c>InvalidCredentials</c>,
/// <c>Forbidden</c> or <c>NotConfigured</c>. A name rather than a number so the client stays readable
/// and does not break if the enum is ever reordered.
/// </param>
/// <param name="ServerStatus">Umbraco's runtime level, present whenever the instance answered at all.</param>
/// <param name="Version">The Umbraco version, present only when the credentials worked.</param>
/// <param name="RuntimeMode">The instance's runtime mode, present only when the credentials worked.</param>
/// <param name="IsLocal">
/// Whether this is the instance the desktop is running on rather than a configured connection. It
/// carries no name and no address, because neither is the server's to give, so the client names and
/// groups the row from this flag.
/// </param>
public sealed record DesktopConnectionStatusResponseModel(
    Guid Id,
    string Name,
    string Colour,
    string BaseUrl,
    string Status,
    string? ServerStatus,
    string? Version,
    string? RuntimeMode,
    bool IsLocal);
