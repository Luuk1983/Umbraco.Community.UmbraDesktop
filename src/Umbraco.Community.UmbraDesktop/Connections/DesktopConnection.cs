namespace Umbraco.Community.UmbraDesktop.Connections;

/// <summary>
/// One Umbraco instance the desktop can read from.
/// </summary>
/// <remarks>
/// Deliberately does not carry the client secret. The secret is stored separately and encrypted, and
/// nothing that hands a connection to the browser should have to remember to strip a field first.
/// </remarks>
/// <param name="Id">Stable identifier, generated when the connection is first added.</param>
/// <param name="Name">What the user calls this instance, for example the client's name.</param>
/// <param name="BaseUrl">Origin of the remote instance, without a trailing path.</param>
/// <param name="Colour">Colour used to tell this connection's rows apart from another's.</param>
/// <param name="ClientId">Client id of the API user created on the remote instance.</param>
public sealed record DesktopConnection(
    Guid Id,
    string Name,
    string BaseUrl,
    string Colour,
    string ClientId);
