using System.Net;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Exercises <see cref="DesktopConnectionApiClient"/>: that a call carries the connection's token,
/// that a refused token is replaced and the call retried exactly once, and that a permission refusal
/// arrives as something the UI can explain rather than as a generic failure.
/// </summary>
public class DesktopConnectionApiClientTests
{
    /// <summary>Arbitrary fixed instant, so nothing here depends on the wall clock.</summary>
    private static readonly DateTimeOffset Start = new(2026, 9, 15, 12, 0, 0, TimeSpan.Zero);

    /// <summary>The connection every test here talks to.</summary>
    private static readonly DesktopConnection Connection = new(
        Guid.Parse("22222222-2222-2222-2222-222222222222"),
        "Client A",
        "https://client-a.example.com",
        "#ff0000",
        "umbraco-back-office-desktop");

    /// <summary>A management API path the tests fetch.</summary>
    private const string InformationPath = "/umbraco/management/api/v1/server/information";

    /// <summary>Builds a 200 response carrying a body.</summary>
    /// <param name="body">The response body.</param>
    /// <returns>The response.</returns>
    private static HttpResponseMessage Ok(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    /// <summary>
    /// Builds a client whose token exchanges always succeed, handing out the supplied tokens in turn,
    /// and whose API calls are answered by <paramref name="respondToApi"/>.
    /// </summary>
    /// <param name="respondToApi">Answers requests that are not to the token endpoint.</param>
    /// <param name="tokens">The access tokens to issue, in order.</param>
    /// <returns>The client under test and the handler behind it.</returns>
    private static (DesktopConnectionApiClient Client, StubHttpMessageHandler Handler) Create(
        Func<HttpRequestMessage, HttpResponseMessage> respondToApi,
        params string[] tokens)
    {
        var issued = new Queue<string>(tokens.Length is 0 ? ["token-1"] : tokens);

        var handler = new StubHttpMessageHandler(request =>
            request.RequestUri!.AbsolutePath.EndsWith("/security/back-office/token", StringComparison.Ordinal)
                ? Ok($$"""{"access_token":"{{issued.Dequeue()}}","token_type":"Bearer","expires_in":300}""")
                : respondToApi(request));

        var store = new DesktopConnectionStore(new InMemoryKeyValueService(), new EphemeralDataProtectionProvider());
        store.Save(Connection, "the-secret");

        var factory = new StubHttpClientFactory(handler);
        var tokenProvider = new DesktopConnectionTokenProvider(store, factory, new FakeTimeProvider(Start));

        return (new DesktopConnectionApiClient(tokenProvider, factory), handler);
    }

    /// <summary>Every request that is not a token exchange, which is what these tests assert on.</summary>
    /// <param name="handler">The handler to read.</param>
    /// <returns>The API requests, in order.</returns>
    private static List<RecordedRequest> ApiRequests(StubHttpMessageHandler handler) =>
        handler.Requests
            .Where(request => request.Uri!.AbsolutePath.EndsWith("/security/back-office/token", StringComparison.Ordinal) is false)
            .ToList();

    /// <summary>The call goes to the requested path on the connection's own origin.</summary>
    [Fact]
    public async Task GetAsync_CallsThePathOnTheConnectionsOrigin()
    {
        var (client, handler) = Create(_ => Ok("""{"version":"17.1.0"}"""));

        await client.GetAsync(Connection, InformationPath, CancellationToken.None);

        var request = Assert.Single(ApiRequests(handler));
        Assert.Equal($"https://client-a.example.com{InformationPath}", request.Uri?.ToString());
        Assert.Equal(HttpMethod.Get, request.Method);
    }

    /// <summary>The call carries the access token the token provider obtained for that connection.</summary>
    [Fact]
    public async Task GetAsync_SendsTheBearerToken()
    {
        var (client, handler) = Create(_ => Ok("{}"), "token-1");

        await client.GetAsync(Connection, InformationPath, CancellationToken.None);

        Assert.Equal("Bearer token-1", Assert.Single(ApiRequests(handler)).Authorization);
    }

    /// <summary>A successful call hands back the body untouched, for the caller to interpret.</summary>
    [Fact]
    public async Task GetAsync_ReturnsTheBody()
    {
        var (client, _) = Create(_ => Ok("""{"version":"17.1.0"}"""));

        var response = await client.GetAsync(Connection, InformationPath, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Ok, response.Status);
        Assert.Equal("""{"version":"17.1.0"}""", response.Body);
    }

    /// <summary>
    /// A 401 means the token expired between being cached and being used, so the token is discarded
    /// and the call made again with a fresh one. This is the whole reason the token cache has an
    /// invalidate.
    /// </summary>
    [Fact]
    public async Task GetAsync_RetriesOnceWithAFreshToken_WhenTheTokenIsRefused()
    {
        var answers = new Queue<HttpResponseMessage>([
            new HttpResponseMessage(HttpStatusCode.Unauthorized),
            Ok("""{"version":"17.1.0"}"""),
        ]);
        var (client, handler) = Create(_ => answers.Dequeue(), "token-1", "token-2");

        var response = await client.GetAsync(Connection, InformationPath, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Ok, response.Status);
        var requests = ApiRequests(handler);
        Assert.Equal(2, requests.Count);
        Assert.Equal("Bearer token-1", requests[0].Authorization);
        Assert.Equal("Bearer token-2", requests[1].Authorization);
    }

    /// <summary>
    /// A second 401 is reported rather than retried again. A remote that answers 401 to everything
    /// would otherwise be an endless loop of token exchanges.
    /// </summary>
    [Fact]
    public async Task GetAsync_RetriesOnlyOnce_WhenTheRemoteKeepsRefusing()
    {
        var (client, handler) = Create(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized), "token-1", "token-2");

        var response = await client.GetAsync(Connection, InformationPath, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.InvalidCredentials, response.Status);
        Assert.Equal(2, ApiRequests(handler).Count);
    }

    /// <summary>
    /// A 403 is the API user lacking the section. It is not retried, because retrying changes
    /// nothing, and it is reported distinctly so the UI can say which permission is missing.
    /// </summary>
    [Fact]
    public async Task GetAsync_ReportsForbidden_WithoutRetrying()
    {
        var (client, handler) = Create(_ => new HttpResponseMessage(HttpStatusCode.Forbidden));

        var response = await client.GetAsync(Connection, InformationPath, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Forbidden, response.Status);
        Assert.Single(ApiRequests(handler));
    }

    /// <summary>A remote that cannot be reached is reported as unreachable.</summary>
    [Fact]
    public async Task GetAsync_ReportsUnreachable_WhenTheRequestFails()
    {
        var (client, _) = Create(_ => throw new HttpRequestException("no such host"));

        var response = await client.GetAsync(Connection, InformationPath, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Unreachable, response.Status);
    }

    /// <summary>
    /// When there is no token to be had, that reason is passed straight through and no call is made.
    /// A connection with no secret must not read as a site that is down.
    /// </summary>
    [Fact]
    public async Task GetAsync_ReportsTheTokenFailure_AndDoesNotCall()
    {
        var handler = new StubHttpMessageHandler(_ => Ok("{}"));
        var store = new DesktopConnectionStore(new InMemoryKeyValueService(), new EphemeralDataProtectionProvider());
        store.Save(Connection, clientSecret: null);
        var factory = new StubHttpClientFactory(handler);
        var client = new DesktopConnectionApiClient(
            new DesktopConnectionTokenProvider(store, factory, new FakeTimeProvider(Start)),
            factory);

        var response = await client.GetAsync(Connection, InformationPath, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.NotConfigured, response.Status);
        Assert.Empty(handler.Requests);
    }

    /// <summary>
    /// A connection whose address will not parse is reported as unreachable rather than throwing.
    /// </summary>
    /// <remarks>
    /// The address that found this was <c>https://localhost:123456</c>, which reads perfectly and is
    /// rejected by every URL parser there is, because a port cannot exceed 65535. It used to throw
    /// <c>UriFormatException</c> out of a <c>new Uri</c> that no catch filter covered.
    /// </remarks>
    [Fact]
    public async Task GetAsync_ReportsUnreachable_WhenTheAddressWillNotParse()
    {
        var (client, handler) = Create(_ => Ok("{}"));

        var response = await client.GetAsync(
            Connection with { BaseUrl = "https://localhost:123456" },
            InformationPath,
            CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Unreachable, response.Status);
        Assert.Empty(handler.Requests);
    }

    /// <summary>The unauthenticated fetch refuses an unparseable address just as quietly.</summary>
    [Fact]
    public async Task GetWithoutCredentialsAsync_ReportsUnreachable_WhenTheAddressWillNotParse()
    {
        var (client, handler) = Create(_ => Ok("{}"));

        var response = await client.GetWithoutCredentialsAsync(
            Connection with { BaseUrl = "https://localhost:123456" },
            InformationPath,
            CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Unreachable, response.Status);
        Assert.Empty(handler.Requests);
    }

    /// <summary>
    /// Only management API paths may be fetched.
    /// </summary>
    /// <remarks>
    /// This client exists so typed endpoints can reuse one authenticated GET, and the guard keeps it
    /// that way: the day someone wires a caller-supplied path to it, this refuses rather than turning
    /// the hub into a request forwarder for arbitrary URLs on a client's server.
    /// </remarks>
    [Fact]
    public async Task GetAsync_Refuses_APathOutsideTheManagementApi()
    {
        var (client, _) = Create(_ => Ok("{}"));

        await Assert.ThrowsAsync<ArgumentException>(
            () => client.GetAsync(Connection, "/umbraco/backoffice", CancellationToken.None));
    }

    /// <summary>
    /// The unauthenticated fetch presents no token at all, and exchanges none.
    /// </summary>
    /// <remarks>
    /// It exists for the handful of endpoints Umbraco leaves anonymous, and those are the ones that
    /// still answer when an instance is too broken to authenticate anybody.
    /// </remarks>
    [Fact]
    public async Task GetWithoutCredentialsAsync_SendsNoTokenAndExchangesNone()
    {
        var (client, handler) = Create(_ => Ok("""{"serverStatus":"Run"}"""));

        var response = await client.GetWithoutCredentialsAsync(
            Connection,
            "/umbraco/management/api/v1/server/status",
            CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Ok, response.Status);
        var request = Assert.Single(handler.Requests);
        Assert.Null(request.Authorization);
    }

    /// <summary>An unreachable instance is reported as such by the unauthenticated fetch too.</summary>
    [Fact]
    public async Task GetWithoutCredentialsAsync_ReportsUnreachable_WhenTheRequestFails()
    {
        var (client, _) = Create(_ => throw new HttpRequestException("no such host"));

        var response = await client.GetWithoutCredentialsAsync(
            Connection,
            "/umbraco/management/api/v1/server/status",
            CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Unreachable, response.Status);
    }
}
