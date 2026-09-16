using System.Collections.Concurrent;
using System.Text.Json;

namespace Umbraco.Community.UmbraDesktop.Connections;

/// <summary>
/// The outcome of asking a connection for an access token.
/// </summary>
/// <param name="Status">How the exchange turned out.</param>
/// <param name="AccessToken">The token, present only when <paramref name="Status"/> is Ok.</param>
public sealed record DesktopConnectionTokenAttempt(DesktopConnectionStatus Status, string? AccessToken);

/// <summary>
/// Exchanges a connection's stored credentials for an access token on the remote instance, and holds
/// onto that token until it is nearly expired.
/// </summary>
/// <remarks>
/// <para>
/// This is the OAuth2 client credentials grant, which is what Umbraco API users authenticate with. It
/// has nothing to do with the backoffice session cookie, which is why it works across origins at all
/// and why it is not built on the part of Umbraco's auth that is scheduled for replacement.
/// </para>
/// <para>
/// Caching matters more than it looks: the remote issues tokens lasting a quarter of its login
/// timeout, five minutes by default, and a status screen over eight connections would otherwise spend
/// half its requests re-authenticating.
/// </para>
/// </remarks>
/// <param name="store">Supplies the stored client secret for a connection.</param>
/// <param name="httpClientFactory">Creates the client used to reach the remote instance.</param>
/// <param name="timeProvider">Clock used to decide whether a cached token is still good.</param>
public sealed class DesktopConnectionTokenProvider(
    DesktopConnectionStore store,
    IHttpClientFactory httpClientFactory,
    TimeProvider timeProvider)
{
    /// <summary>Path of Umbraco's back office token endpoint, relative to an instance's origin.</summary>
    /// <remarks>
    /// Matches <c>Umbraco.Cms.Api.Common.Security.Paths.BackOfficeApi.TokenEndpoint</c>. It is
    /// written out rather than referenced because it is a path on someone else's server, which this
    /// package's own version of Umbraco does not get to decide.
    /// </remarks>
    private const string TokenEndpointPath = "/umbraco/management/api/v1/security/back-office/token";

    /// <summary>
    /// How long before its real expiry a token is treated as expired.
    /// </summary>
    /// <remarks>
    /// Without a margin a token that passes the check can still expire while the request it was
    /// attached to is in flight, which surfaces as an intermittent 401 rather than as anything
    /// diagnosable.
    /// </remarks>
    private static readonly TimeSpan ExpiryMargin = TimeSpan.FromSeconds(30);

    /// <summary>Cached tokens by connection id, with the instant each stops being usable.</summary>
    private readonly ConcurrentDictionary<Guid, (string AccessToken, DateTimeOffset UsableUntil)> _tokens = new();

    /// <summary>
    /// Gets a usable access token for a connection, reusing the cached one when it is still good.
    /// </summary>
    /// <param name="connection">The connection to authenticate against.</param>
    /// <param name="cancellationToken">Cancels the exchange.</param>
    /// <returns>The token, or the reason there is not one.</returns>
    public async Task<DesktopConnectionTokenAttempt> GetAsync(
        DesktopConnection connection,
        CancellationToken cancellationToken)
    {
        if (_tokens.TryGetValue(connection.Id, out var cached) && cached.UsableUntil > timeProvider.GetUtcNow())
        {
            return new DesktopConnectionTokenAttempt(DesktopConnectionStatus.Ok, cached.AccessToken);
        }

        var clientSecret = store.GetClientSecret(connection.Id);
        if (clientSecret is null)
        {
            return new DesktopConnectionTokenAttempt(DesktopConnectionStatus.NotConfigured, null);
        }

        return await RequestTokenAsync(connection, clientSecret, cancellationToken);
    }

    /// <summary>
    /// Drops a connection's cached token.
    /// </summary>
    /// <remarks>
    /// Called when a request comes back 401, so the retry authenticates afresh rather than resending
    /// the token that was just refused.
    /// </remarks>
    /// <param name="connectionId">The connection whose token should be discarded.</param>
    public void Invalidate(Guid connectionId) => _tokens.TryRemove(connectionId, out _);

    /// <summary>Performs the client credentials exchange and caches whatever comes back.</summary>
    /// <param name="connection">The connection to authenticate against.</param>
    /// <param name="clientSecret">The stored secret, already decrypted.</param>
    /// <param name="cancellationToken">Cancels the exchange.</param>
    /// <returns>The token, or the reason there is not one.</returns>
    private async Task<DesktopConnectionTokenAttempt> RequestTokenAsync(
        DesktopConnection connection,
        string clientSecret,
        CancellationToken cancellationToken)
    {
        using var client = httpClientFactory.CreateClient();
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = connection.ClientId,
            ["client_secret"] = clientSecret,
        });

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync(TokenEndpoint(connection), content, cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            return new DesktopConnectionTokenAttempt(DesktopConnectionStatus.Unreachable, null);
        }

        using (response)
        {
            if (response.IsSuccessStatusCode is false)
            {
                // A rejected grant is a 400 carrying an OAuth error, and a 401 means the client is
                // unknown. Anything else is the remote failing rather than the credentials being
                // wrong, and saying "check your credentials" about a 502 sends people nowhere.
                var status = response.StatusCode is System.Net.HttpStatusCode.BadRequest
                    or System.Net.HttpStatusCode.Unauthorized
                    ? DesktopConnectionStatus.InvalidCredentials
                    : DesktopConnectionStatus.Unreachable;

                return new DesktopConnectionTokenAttempt(status, null);
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            using var document = JsonDocument.Parse(body);

            if (document.RootElement.TryGetProperty("access_token", out var tokenElement) is false
                || tokenElement.GetString() is not { Length: > 0 } accessToken)
            {
                return new DesktopConnectionTokenAttempt(DesktopConnectionStatus.Unreachable, null);
            }

            var lifetime = document.RootElement.TryGetProperty("expires_in", out var expiresElement)
                && expiresElement.TryGetInt32(out var expiresInSeconds)
                ? TimeSpan.FromSeconds(expiresInSeconds)
                : TimeSpan.FromMinutes(1);

            _tokens[connection.Id] = (accessToken, timeProvider.GetUtcNow() + lifetime - ExpiryMargin);

            return new DesktopConnectionTokenAttempt(DesktopConnectionStatus.Ok, accessToken);
        }
    }

    /// <summary>Builds the token endpoint URI for a connection.</summary>
    /// <param name="connection">The connection whose origin to use.</param>
    /// <returns>The absolute token endpoint URI.</returns>
    private static Uri TokenEndpoint(DesktopConnection connection) =>
        new($"{connection.BaseUrl.TrimEnd('/')}{TokenEndpointPath}");
}
