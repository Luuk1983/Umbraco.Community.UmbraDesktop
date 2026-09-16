using System.Net;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Exercises <see cref="DesktopConnectionTokenProvider"/>: the client credentials exchange against a
/// remote instance, how long the resulting token is reused, and how the three ways it can fail are
/// told apart.
/// </summary>
public class DesktopConnectionTokenProviderTests
{
    /// <summary>Arbitrary fixed instant the fake clock starts at, so expiry maths is checkable.</summary>
    private static readonly DateTimeOffset Start = new(2026, 9, 15, 12, 0, 0, TimeSpan.Zero);

    /// <summary>The connection every test here talks to.</summary>
    private static readonly DesktopConnection Connection = new(
        Guid.Parse("11111111-1111-1111-1111-111111111111"),
        "Client A",
        "https://client-a.example.com",
        "#ff0000",
        "umbraco-back-office-desktop");

    /// <summary>Builds a token response body the way Umbraco's token endpoint answers.</summary>
    /// <param name="token">The access token to hand back.</param>
    /// <param name="expiresInSeconds">Lifetime of that token, in seconds.</param>
    /// <returns>A 200 response carrying the token.</returns>
    private static HttpResponseMessage TokenResponse(string token, int expiresInSeconds = 300) =>
        new(HttpStatusCode.OK)
        {
            Content = new StringContent(
                $$"""{"access_token":"{{token}}","token_type":"Bearer","expires_in":{{expiresInSeconds}}}""",
                System.Text.Encoding.UTF8,
                "application/json"),
        };

    /// <summary>
    /// Builds a provider over a store holding <see cref="Connection"/> with a secret, a stub handler
    /// and a clock pinned to <see cref="Start"/>.
    /// </summary>
    /// <param name="respond">Builds the response for each request the provider makes.</param>
    /// <param name="clientSecret">The secret to store, or <c>null</c> to store none.</param>
    /// <returns>The provider under test, the handler behind it, and the clock driving it.</returns>
    private static (DesktopConnectionTokenProvider Provider, StubHttpMessageHandler Handler, FakeTimeProvider Time) Create(
        Func<HttpRequestMessage, HttpResponseMessage> respond,
        string? clientSecret = "the-secret")
    {
        var store = new DesktopConnectionStore(
            new InMemoryKeyValueService(),
            new EphemeralDataProtectionProvider());
        store.Save(Connection, clientSecret);

        var handler = new StubHttpMessageHandler(respond);
        var time = new FakeTimeProvider(Start);

        return (new DesktopConnectionTokenProvider(store, new StubHttpClientFactory(handler), time), handler, time);
    }

    /// <summary>The exchange goes to the remote's own token endpoint, on its own origin.</summary>
    [Fact]
    public async Task GetAsync_PostsToTheRemoteTokenEndpoint()
    {
        var (provider, handler, _) = Create(_ => TokenResponse("token-1"));

        await provider.GetAsync(Connection, CancellationToken.None);

        Assert.Equal(
            "https://client-a.example.com/umbraco/management/api/v1/security/back-office/token",
            handler.LastRequest?.Uri?.ToString());
    }

    /// <summary>
    /// The exchange is the client credentials grant, carrying the connection's own client id and the
    /// stored secret. Anything else and the remote answers with a grant error rather than a token.
    /// </summary>
    [Fact]
    public async Task GetAsync_SendsTheClientCredentialsGrant()
    {
        var (provider, handler, _) = Create(_ => TokenResponse("token-1"));

        await provider.GetAsync(Connection, CancellationToken.None);

        Assert.Contains("grant_type=client_credentials", handler.LastRequest?.Body);
        Assert.Contains("client_id=umbraco-back-office-desktop", handler.LastRequest?.Body);
        Assert.Contains("client_secret=the-secret", handler.LastRequest?.Body);
    }

    /// <summary>A successful exchange hands back the token the remote issued.</summary>
    [Fact]
    public async Task GetAsync_ReturnsTheAccessToken()
    {
        var (provider, _, _) = Create(_ => TokenResponse("token-1"));

        var attempt = await provider.GetAsync(Connection, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Ok, attempt.Status);
        Assert.Equal("token-1", attempt.AccessToken);
    }

    /// <summary>
    /// A token is reused while it is still valid. Without this, a screen showing eight connections
    /// would perform sixteen requests where eight would do.
    /// </summary>
    [Fact]
    public async Task GetAsync_ReusesTheTokenWhileItIsValid()
    {
        var (provider, handler, time) = Create(_ => TokenResponse("token-1", expiresInSeconds: 300));

        await provider.GetAsync(Connection, CancellationToken.None);
        time.Advance(TimeSpan.FromSeconds(60));
        var second = await provider.GetAsync(Connection, CancellationToken.None);

        Assert.Single(handler.Requests);
        Assert.Equal("token-1", second.AccessToken);
    }

    /// <summary>
    /// An expired token is replaced. The default lifetime on the remote is a quarter of its login
    /// timeout, five minutes out of the box, so a desktop left open crosses this constantly.
    /// </summary>
    [Fact]
    public async Task GetAsync_FetchesAgain_OnceTheTokenHasExpired()
    {
        var tokens = new Queue<string>(["token-1", "token-2"]);
        var (provider, handler, time) = Create(_ => TokenResponse(tokens.Dequeue(), expiresInSeconds: 300));

        await provider.GetAsync(Connection, CancellationToken.None);
        time.Advance(TimeSpan.FromSeconds(301));
        var second = await provider.GetAsync(Connection, CancellationToken.None);

        Assert.Equal(2, handler.Requests.Count);
        Assert.Equal("token-2", second.AccessToken);
    }

    /// <summary>
    /// A token is treated as expired slightly before it really is, so one that would die in flight
    /// is replaced rather than sent.
    /// </summary>
    [Fact]
    public async Task GetAsync_TreatsATokenAboutToExpireAsExpired()
    {
        var tokens = new Queue<string>(["token-1", "token-2"]);
        var (provider, handler, time) = Create(_ => TokenResponse(tokens.Dequeue(), expiresInSeconds: 300));

        await provider.GetAsync(Connection, CancellationToken.None);
        time.Advance(TimeSpan.FromSeconds(290));
        await provider.GetAsync(Connection, CancellationToken.None);

        Assert.Equal(2, handler.Requests.Count);
    }

    /// <summary>
    /// Credentials the remote rejects are reported as such, because that is the one failure the user
    /// can actually fix, and it must not read as the site being down.
    /// </summary>
    [Fact]
    public async Task GetAsync_ReportsInvalidCredentials_WhenTheRemoteRejectsThem()
    {
        var (provider, _, _) = Create(_ => new HttpResponseMessage(HttpStatusCode.BadRequest)
        {
            Content = new StringContent("""{"error":"invalid_client"}""", System.Text.Encoding.UTF8, "application/json"),
        });

        var attempt = await provider.GetAsync(Connection, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.InvalidCredentials, attempt.Status);
        Assert.Null(attempt.AccessToken);
    }

    /// <summary>A remote that cannot be reached at all is reported as unreachable, not as bad credentials.</summary>
    [Fact]
    public async Task GetAsync_ReportsUnreachable_WhenTheRequestFails()
    {
        var (provider, _, _) = Create(_ => throw new HttpRequestException("no such host"));

        var attempt = await provider.GetAsync(Connection, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Unreachable, attempt.Status);
    }

    /// <summary>
    /// A connection saved without a secret is reported as unconfigured, and no request is made. This
    /// is the state a connection is in between being created and being given credentials.
    /// </summary>
    [Fact]
    public async Task GetAsync_ReportsNotConfigured_WhenNoSecretIsStored()
    {
        var (provider, handler, _) = Create(_ => TokenResponse("token-1"), clientSecret: null);

        var attempt = await provider.GetAsync(Connection, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.NotConfigured, attempt.Status);
        Assert.Empty(handler.Requests);
    }

    /// <summary>
    /// Invalidating drops the cached token, which is how a call that came back 401 gets a fresh one
    /// before retrying instead of resending the token that was just refused.
    /// </summary>
    [Fact]
    public async Task Invalidate_ForcesTheNextCallToFetchAgain()
    {
        var tokens = new Queue<string>(["token-1", "token-2"]);
        var (provider, handler, _) = Create(_ => TokenResponse(tokens.Dequeue()));

        await provider.GetAsync(Connection, CancellationToken.None);
        provider.Invalidate(Connection.Id);
        var second = await provider.GetAsync(Connection, CancellationToken.None);

        Assert.Equal(2, handler.Requests.Count);
        Assert.Equal("token-2", second.AccessToken);
    }
}
