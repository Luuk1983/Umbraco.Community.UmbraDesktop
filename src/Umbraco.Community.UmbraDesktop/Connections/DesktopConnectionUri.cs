using System.Diagnostics.CodeAnalysis;

namespace Umbraco.Community.UmbraDesktop.Connections;

/// <summary>
/// Turns a connection's stored address and a management API path into a URI, or says it cannot.
/// </summary>
/// <remarks>
/// <para>
/// This exists because of a bug. The address is typed by a person, and until something checks it, it
/// is a string rather than a URL. That check used to be the <see cref="Uri"/> constructor throwing,
/// which nothing caught: one connection saved with <c>https://localhost:123456</c> made the whole
/// status endpoint fail, so every row vanished behind one error, the local instance included.
/// </para>
/// <para>
/// That address is worth remembering, because it reads perfectly. A port cannot exceed 65535, so
/// every URL parser there is rejects it, and an extra digit in a port number is an ordinary typo
/// rather than someone abusing the field.
/// </para>
/// </remarks>
public static class DesktopConnectionUri
{
    /// <summary>
    /// Builds the absolute URI for a path on a connection's instance.
    /// </summary>
    /// <param name="baseUrl">The connection's stored address.</param>
    /// <param name="path">Absolute path on that instance, beginning with a slash.</param>
    /// <param name="uri">The resolved URI, or <c>null</c> when the address cannot be used.</param>
    /// <returns><c>true</c> when the address resolved.</returns>
    public static bool TryResolve(string? baseUrl, string path, [NotNullWhen(true)] out Uri? uri)
    {
        uri = null;

        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return false;
        }

        // Whitespace survives a paste and should not be what decides whether a connection works.
        var trimmed = baseUrl.Trim().TrimEnd('/');

        if (Uri.TryCreate($"{trimmed}{path}", UriKind.Absolute, out var resolved) is false)
        {
            return false;
        }

        // A parseable URI is not necessarily one worth sending a request to. These are stored by one
        // person and used by another, so anything that is not an ordinary web address is refused
        // here rather than left for each caller to think about. Plain http is allowed: an instance
        // on an internal network may well not be on TLS.
        if (resolved.Scheme != Uri.UriSchemeHttp && resolved.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        uri = resolved;
        return true;
    }
}
