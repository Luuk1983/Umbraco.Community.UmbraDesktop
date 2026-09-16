using System.Net;
using System.Net.Http.Headers;

namespace Umbraco.Community.UmbraDesktop.Connections;

/// <summary>
/// What came back from a call to a connected instance.
/// </summary>
/// <param name="Status">How the call turned out.</param>
/// <param name="Body">The response body, present only when <paramref name="Status"/> is Ok.</param>
public sealed record DesktopConnectionResponse(DesktopConnectionStatus Status, string? Body);

/// <summary>
/// Makes authenticated read calls to a connected Umbraco instance's management API.
/// </summary>
/// <remarks>
/// <para>
/// Reads only. There is no method here that writes, which is the enforcement of the feature's
/// read-only promise in our own code rather than a reliance on how the remote's API user happens to
/// be permitted.
/// </para>
/// <para>
/// This is not a pass-through proxy and must not become one. It exists so that each typed endpoint
/// the desktop exposes can share one authenticated GET, with the token handling in a single place.
/// </para>
/// </remarks>
/// <param name="tokenProvider">Supplies and invalidates access tokens for a connection.</param>
/// <param name="httpClientFactory">Creates the client used to reach the remote instance.</param>
public sealed class DesktopConnectionApiClient(
    DesktopConnectionTokenProvider tokenProvider,
    IHttpClientFactory httpClientFactory)
{
    /// <summary>Every path this client will fetch has to start with this.</summary>
    private const string ManagementApiPrefix = "/umbraco/management/api/";

    /// <summary>
    /// Fetches a management API path from a connected instance.
    /// </summary>
    /// <param name="connection">The instance to call.</param>
    /// <param name="path">Absolute path on that instance, starting with the management API prefix.</param>
    /// <param name="cancellationToken">Cancels the call.</param>
    /// <returns>The response body, or the reason there is not one.</returns>
    /// <exception cref="ArgumentException">
    /// Thrown when <paramref name="path"/> is not a management API path. A programming error rather
    /// than a user one: nothing outside this package chooses these paths.
    /// </exception>
    public async Task<DesktopConnectionResponse> GetAsync(
        DesktopConnection connection,
        string path,
        CancellationToken cancellationToken)
    {
        GuardPath(path);

        var attempt = await tokenProvider.GetAsync(connection, cancellationToken);
        if (attempt.Status is not DesktopConnectionStatus.Ok || attempt.AccessToken is null)
        {
            return new DesktopConnectionResponse(attempt.Status, null);
        }

        var response = await SendAsync(connection, path, attempt.AccessToken, cancellationToken);

        // A 401 here means the token stopped being valid between the cache handing it over and the
        // remote seeing it: the remote restarted, or someone revoked it. Fetching a fresh one and
        // trying again turns that into nothing the user ever sees. Exactly once, because a remote
        // that answers 401 to everything would otherwise loop forever.
        if (response.Status is not DesktopConnectionStatus.InvalidCredentials)
        {
            return response;
        }

        tokenProvider.Invalidate(connection.Id);

        var retryAttempt = await tokenProvider.GetAsync(connection, cancellationToken);

        return retryAttempt.Status is DesktopConnectionStatus.Ok && retryAttempt.AccessToken is not null
            ? await SendAsync(connection, path, retryAttempt.AccessToken, cancellationToken)
            : new DesktopConnectionResponse(retryAttempt.Status, null);
    }

    /// <summary>
    /// Fetches a management API path from a connected instance without authenticating.
    /// </summary>
    /// <remarks>
    /// For the few endpoints Umbraco leaves anonymous. Worth having rather than folding into the
    /// authenticated call, because those endpoints still answer when an instance is mid-upgrade or
    /// failed to boot, which is exactly when everything authenticated stops answering and when
    /// knowing what is wrong matters most.
    /// </remarks>
    /// <param name="connection">The instance to call.</param>
    /// <param name="path">Absolute path on that instance, starting with the management API prefix.</param>
    /// <param name="cancellationToken">Cancels the call.</param>
    /// <returns>The response body, or the reason there is not one.</returns>
    /// <exception cref="ArgumentException">Thrown when <paramref name="path"/> is not a management API path.</exception>
    public async Task<DesktopConnectionResponse> GetWithoutCredentialsAsync(
        DesktopConnection connection,
        string path,
        CancellationToken cancellationToken)
    {
        GuardPath(path);

        return await SendAsync(connection, path, accessToken: null, cancellationToken);
    }

    /// <summary>Refuses a path that is not part of the management API.</summary>
    /// <param name="path">The path to check.</param>
    /// <exception cref="ArgumentException">Thrown when the path is not a management API path.</exception>
    private static void GuardPath(string path)
    {
        if (path.StartsWith(ManagementApiPrefix, StringComparison.Ordinal) is false)
        {
            throw new ArgumentException(
                $"Only management API paths can be fetched, and '{path}' is not one.",
                nameof(path));
        }
    }

    /// <summary>Performs one GET, optionally with a bearer token, and maps the outcome.</summary>
    /// <param name="connection">The instance to call.</param>
    /// <param name="path">Absolute path on that instance.</param>
    /// <param name="accessToken">The token to present, or <c>null</c> to send none.</param>
    /// <param name="cancellationToken">Cancels the call.</param>
    /// <returns>The response body, or the reason there is not one.</returns>
    private async Task<DesktopConnectionResponse> SendAsync(
        DesktopConnection connection,
        string path,
        string? accessToken,
        CancellationToken cancellationToken)
    {
        // Resolved rather than constructed. `new Uri` throws on an address that will not parse,
        // and an unparseable address is an ordinary typo rather than an exceptional condition: it
        // belongs in the same bucket as a host that does not answer.
        if (DesktopConnectionUri.TryResolve(connection.BaseUrl, path, out var uri) is false)
        {
            return new DesktopConnectionResponse(DesktopConnectionStatus.Unreachable, null);
        }

        using var client = httpClientFactory.CreateClient(DesktopConnectionHttpClient.Name);
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        if (accessToken is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        }

        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            return new DesktopConnectionResponse(DesktopConnectionStatus.Unreachable, null);
        }

        using (response)
        {
            // 401 and 403 look alike and mean opposite things. 401 is "this token is no good", which
            // we can fix ourselves by getting another. 403 is "this user may not", which only
            // someone on the remote instance can fix, and which the UI has to be able to say out
            // loud. Treating them as one failure is the mistake this whole mapping exists to avoid.
            return response.StatusCode switch
            {
                HttpStatusCode.Unauthorized => new DesktopConnectionResponse(
                    DesktopConnectionStatus.InvalidCredentials, null),
                HttpStatusCode.Forbidden => new DesktopConnectionResponse(
                    DesktopConnectionStatus.Forbidden, null),
                _ when response.IsSuccessStatusCode is false => new DesktopConnectionResponse(
                    DesktopConnectionStatus.Unreachable, null),
                _ => new DesktopConnectionResponse(
                    DesktopConnectionStatus.Ok,
                    await response.Content.ReadAsStringAsync(cancellationToken)),
            };
        }
    }
}
