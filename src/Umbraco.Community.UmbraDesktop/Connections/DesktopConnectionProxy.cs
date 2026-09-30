using System.Net;
using System.Net.Http.Headers;

namespace Umbraco.Community.UmbraDesktop.Connections;

/// <summary>
/// What came back from a proxied call to a connected instance.
/// </summary>
/// <param name="Status">
/// Whether the remote was asked at all. <see cref="DesktopConnectionStatus.Ok"/> means it answered,
/// whatever it answered: the remote's own status code is in <paramref name="StatusCode"/>.
/// </param>
/// <param name="StatusCode">The remote's HTTP status code, when it answered.</param>
/// <param name="ContentType">The remote's content type, when it sent one.</param>
/// <param name="Body">The remote's body, byte for byte. Empty when it was not asked.</param>
public sealed record DesktopConnectionProxyResponse(
    DesktopConnectionStatus Status,
    int StatusCode,
    string? ContentType,
    byte[] Body);

/// <summary>
/// Forwards a GET from the remote content viewer to a connected instance's management API, as that
/// connection's API user, and hands back whatever the remote said.
/// </summary>
/// <remarks>
/// <para>
/// This is the one pass-through in the package, and it exists for one consumer. The remote content
/// viewer runs Umbraco's own backoffice in a frame and redirects that frame's data calls here, so it
/// needs every management API endpoint the backoffice might call, including ones a package adds, and
/// cannot work through a list of typed endpoints the way Connection status does. That is why
/// <see cref="DesktopConnectionApiClient"/> is deliberately not this, and should stay that way.
/// </para>
/// <para>
/// What keeps a pass-through safe is what it refuses. GET only, because there is no other method in
/// this class. The remote's management API only, checked on the path as given and again on the
/// address it resolves to, so that dot segments, encoded dots and a second host cannot walk it
/// somewhere else. And never the remote's auth endpoints, which the frame has no business reaching.
/// The browser never sees the token: it is added here, from the connection's stored credentials.
/// </para>
/// </remarks>
/// <param name="tokenProvider">Supplies and invalidates access tokens for a connection.</param>
/// <param name="httpClientFactory">Creates the client used to reach the remote instance.</param>
public sealed class DesktopConnectionProxy(
    DesktopConnectionTokenProvider tokenProvider,
    IHttpClientFactory httpClientFactory)
{
    /// <summary>Every path this proxy forwards has to start with this.</summary>
    private const string ManagementApiPrefix = "/umbraco/management/api/";

    /// <summary>
    /// Fragments that have no place in a path this proxy forwards. Dot segments and their encodings
    /// are how a path that starts correctly ends up somewhere else once a server decodes it; encoded
    /// slashes and backslashes are how it hides a segment boundary; the auth area is refused because
    /// nothing the viewer shows needs the remote's login machinery.
    /// </summary>
    private static readonly string[] RefusedFragments = ["..", "%2e", "%2f", "%5c", "\\", "/security/"];

    /// <summary>
    /// Forwards one GET to a connected instance.
    /// </summary>
    /// <param name="connection">The instance to call.</param>
    /// <param name="pathAndQuery">The path on that instance, with its query string.</param>
    /// <param name="cancellationToken">Cancels the call.</param>
    /// <returns>
    /// The remote's answer, or a status saying why it was not asked: <see cref="DesktopConnectionStatus.Forbidden"/>
    /// for a path this proxy will not forward, and the token provider's status when there is no usable token.
    /// </returns>
    public async Task<DesktopConnectionProxyResponse> GetAsync(
        DesktopConnection connection,
        string pathAndQuery,
        CancellationToken cancellationToken)
    {
        if (TryResolve(connection, pathAndQuery, out var uri) is false)
        {
            return NotAsked(DesktopConnectionStatus.Forbidden);
        }

        var attempt = await tokenProvider.GetAsync(connection, cancellationToken);
        if (attempt.Status is not DesktopConnectionStatus.Ok || attempt.AccessToken is null)
        {
            return NotAsked(attempt.Status);
        }

        var response = await SendAsync(uri, attempt.AccessToken, cancellationToken);

        // Same reasoning as the API client: a 401 means the cached token went stale on the remote's
        // side. One fresh token and one retry hide that; more would loop on a remote that refuses all.
        if (response.StatusCode is not (int)HttpStatusCode.Unauthorized)
        {
            return response;
        }

        tokenProvider.Invalidate(connection.Id);
        var retry = await tokenProvider.GetAsync(connection, cancellationToken);

        return retry.Status is DesktopConnectionStatus.Ok && retry.AccessToken is not null
            ? await SendAsync(uri, retry.AccessToken, cancellationToken)
            : NotAsked(retry.Status);
    }

    /// <summary>
    /// Resolves a path against the connection's address, refusing anything that is not, or does not
    /// stay, a path under the connection's own management API.
    /// </summary>
    /// <param name="connection">The connection.</param>
    /// <param name="pathAndQuery">The requested path and query.</param>
    /// <param name="uri">The address to call, when the path is allowed.</param>
    /// <returns><c>true</c> when the path is allowed and resolved.</returns>
    private static bool TryResolve(DesktopConnection connection, string pathAndQuery, out Uri uri)
    {
        uri = null!;

        var path = pathAndQuery.Split('?', 2)[0];
        if (path.StartsWith(ManagementApiPrefix, StringComparison.Ordinal) is false)
        {
            return false;
        }

        if (RefusedFragments.Any(fragment => path.Contains(fragment, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        if (DesktopConnectionUri.TryResolve(connection.BaseUrl, pathAndQuery, out var resolved) is false
            || DesktopConnectionUri.TryResolve(connection.BaseUrl, "/", out var root) is false)
        {
            return false;
        }

        // Checked on the resolved address as well as the text, because the two can differ: this is
        // where a surprise in how a URI is parsed would show up, and it costs nothing to look.
        var sameOrigin = Uri.Compare(resolved, root, UriComponents.SchemeAndServer, UriFormat.Unescaped, StringComparison.OrdinalIgnoreCase) is 0;
        if (sameOrigin is false || resolved.AbsolutePath.StartsWith(ManagementApiPrefix, StringComparison.Ordinal) is false)
        {
            return false;
        }

        uri = resolved;
        return true;
    }

    /// <summary>Performs one GET with the connection's token and captures the answer as it was.</summary>
    /// <param name="uri">The address to call.</param>
    /// <param name="accessToken">The API user's token.</param>
    /// <param name="cancellationToken">Cancels the call.</param>
    /// <returns>The remote's answer, or unreachable when there was none.</returns>
    private async Task<DesktopConnectionProxyResponse> SendAsync(Uri uri, string accessToken, CancellationToken cancellationToken)
    {
        using var client = httpClientFactory.CreateClient(DesktopConnectionHttpClient.Name);
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        try
        {
            using var response = await client.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsByteArrayAsync(cancellationToken);

            return new DesktopConnectionProxyResponse(
                DesktopConnectionStatus.Ok,
                (int)response.StatusCode,
                response.Content.Headers.ContentType?.ToString(),
                body);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            return NotAsked(DesktopConnectionStatus.Unreachable);
        }
    }

    /// <summary>A response for a call that did not reach the remote.</summary>
    /// <param name="status">Why it did not.</param>
    /// <returns>The response, with no status code and no body.</returns>
    private static DesktopConnectionProxyResponse NotAsked(DesktopConnectionStatus status) =>
        new(status, 0, null, []);
}
