namespace Umbraco.Community.UmbraDesktop.Connections;

/// <summary>
/// How an attempt to talk to a connected instance turned out.
/// </summary>
/// <remarks>
/// These are deliberately separate rather than one failure: each is fixed by a different person
/// doing a different thing, and collapsing them produces the shrug of a message that sends people
/// looking in the wrong place.
/// </remarks>
public enum DesktopConnectionStatus
{
    /// <summary>The call succeeded.</summary>
    Ok,

    /// <summary>The instance could not be reached at all, so nothing is known about it.</summary>
    Unreachable,

    /// <summary>The instance answered, and refused the client id and secret.</summary>
    InvalidCredentials,

    /// <summary>
    /// The credentials were accepted and the API user is not allowed to do this.
    /// </summary>
    /// <remarks>
    /// The one the user cannot fix from here: it needs someone with access to the remote instance to
    /// put its API user in a group that has the section.
    /// </remarks>
    Forbidden,

    /// <summary>No client secret has been stored for this connection yet.</summary>
    NotConfigured,
}
