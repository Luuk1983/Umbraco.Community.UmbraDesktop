using System.Net;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Exercises <see cref="DesktopConnectionProxy"/>, the pass-through GET the remote content viewer
/// runs on: that it carries the connection's token, hands back what the remote said exactly, and
/// refuses every path outside the remote's management API however the path is dressed up.
/// </summary>
public class DesktopConnectionProxyTests
{
    /// <summary>Arbitrary fixed instant, so nothing here depends on the wall clock.</summary>
    private static readonly DateTimeOffset Start = new(2026, 9, 29, 12, 0, 0, TimeSpan.Zero);

    /// <summary>The connection every test here talks to.</summary>
    private static readonly DesktopConnection Connection = new(
        Guid.Parse("33333333-3333-3333-3333-333333333333"),
        "Client B",
        "https://client-b.example.com",
        "#00ff00",
        "umbraco-back-office-desktop");

    /// <summary>A management API path the tests fetch, with a query string.</summary>
    private const string TreePath = "/umbraco/management/api/v1/tree/document/root?skip=0&take=100";

    /// <summary>Builds a response carrying a JSON body.</summary>
    /// <param name="status">The status code.</param>
    /// <param name="body">The response body.</param>
    /// <returns>The response.</returns>
    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    /// <summary>
    /// Builds a proxy whose token exchanges succeed with the supplied tokens in turn, and whose API
    /// calls are answered by <paramref name="respondToApi"/>.
    /// </summary>
    /// <param name="respondToApi">Answers requests that are not to the token endpoint.</param>
    /// <param name="withSecret">Whether the connection has a secret stored.</param>
    /// <param name="tokens">The access tokens to issue, in order.</param>
    /// <returns>The proxy under test and the handler behind it.</returns>
    private static (DesktopConnectionProxy Proxy, StubHttpMessageHandler Handler) Create(
        Func<HttpRequestMessage, HttpResponseMessage> respondToApi,
        bool withSecret = true,
        params string[] tokens)
    {
        var issued = new Queue<string>(tokens.Length is 0 ? ["token-1", "token-2"] : tokens);

        var handler = new StubHttpMessageHandler(request =>
            request.RequestUri!.AbsolutePath.EndsWith("/security/back-office/token", StringComparison.Ordinal)
                ? Json(HttpStatusCode.OK, $$"""{"access_token":"{{issued.Dequeue()}}","token_type":"Bearer","expires_in":300}""")
                : respondToApi(request));

        var store = new DesktopConnectionStore(new InMemoryKeyValueService(), new EphemeralDataProtectionProvider());
        store.Save(Connection, withSecret ? "the-secret" : null);

        var factory = new StubHttpClientFactory(handler);
        var tokenProvider = new DesktopConnectionTokenProvider(store, factory, new FakeTimeProvider(Start));

        return (new DesktopConnectionProxy(tokenProvider, factory), handler);
    }

    /// <summary>Every request that is not a token exchange.</summary>
    /// <param name="handler">The handler to read.</param>
    /// <returns>The API requests, in order.</returns>
    private static List<RecordedRequest> ApiRequests(StubHttpMessageHandler handler) =>
        handler.Requests
            .Where(request => request.Uri!.AbsolutePath.EndsWith("/security/back-office/token", StringComparison.Ordinal) is false)
            .ToList();

    /// <summary>The path and its query string reach the connection's own origin, with a GET.</summary>
    [Fact]
    public async Task GetAsync_CallsThePathAndQueryOnTheConnectionsOrigin()
    {
        var (proxy, handler) = Create(_ => Json(HttpStatusCode.OK, "{}"));

        await proxy.GetAsync(Connection, TreePath, CancellationToken.None);

        var request = Assert.Single(ApiRequests(handler));
        Assert.Equal($"https://client-b.example.com{TreePath}", request.Uri?.ToString());
        Assert.Equal(HttpMethod.Get, request.Method);
    }

    /// <summary>The call carries the API user's token, never anything from the browser.</summary>
    [Fact]
    public async Task GetAsync_SendsTheConnectionsBearerToken()
    {
        var (proxy, handler) = Create(_ => Json(HttpStatusCode.OK, "{}"));

        await proxy.GetAsync(Connection, TreePath, CancellationToken.None);

        Assert.Equal("Bearer token-1", Assert.Single(ApiRequests(handler)).Authorization);
    }

    /// <summary>
    /// A successful answer comes back as it was: status, content type and body, byte for byte.
    /// </summary>
    [Fact]
    public async Task GetAsync_ReturnsTheRemotesAnswerUnchanged()
    {
        var (proxy, _) = Create(_ => Json(HttpStatusCode.OK, """{"total":1,"items":[]}"""));

        var result = await proxy.GetAsync(Connection, TreePath, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Ok, result.Status);
        Assert.Equal(200, result.StatusCode);
        Assert.StartsWith("application/json", result.ContentType);
        Assert.Equal("""{"total":1,"items":[]}""", Encoding.UTF8.GetString(result.Body));
    }

    /// <summary>
    /// A 404 from the remote is the remote's answer and is handed on as one, not turned into the
    /// instance being unreachable: the backoffice in the frame knows what a 404 means and the viewer
    /// would otherwise show a connection error for a missing document.
    /// </summary>
    [Fact]
    public async Task GetAsync_PassesTheRemotesErrorStatusOn()
    {
        var (proxy, _) = Create(_ => Json(HttpStatusCode.NotFound, """{"title":"Not found"}"""));

        var result = await proxy.GetAsync(Connection, TreePath, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Ok, result.Status);
        Assert.Equal(404, result.StatusCode);
        Assert.Equal("""{"title":"Not found"}""", Encoding.UTF8.GetString(result.Body));
    }

    /// <summary>A refused token is replaced and the call made again, once.</summary>
    [Fact]
    public async Task GetAsync_RetriesOnceWithAFreshTokenAfterA401()
    {
        var calls = 0;
        var (proxy, handler) = Create(_ => ++calls is 1
            ? new HttpResponseMessage(HttpStatusCode.Unauthorized)
            : Json(HttpStatusCode.OK, "{}"));

        var result = await proxy.GetAsync(Connection, TreePath, CancellationToken.None);

        Assert.Equal(200, result.StatusCode);
        Assert.Equal(["Bearer token-1", "Bearer token-2"], ApiRequests(handler).Select(request => request.Authorization));
    }

    /// <summary>A connection with no secret is reported as such, and nothing is sent anywhere.</summary>
    [Fact]
    public async Task GetAsync_WithoutASecret_SendsNothing()
    {
        var (proxy, handler) = Create(_ => Json(HttpStatusCode.OK, "{}"), withSecret: false);

        var result = await proxy.GetAsync(Connection, TreePath, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.NotConfigured, result.Status);
        Assert.Empty(handler.Requests);
    }

    /// <summary>A remote that does not answer is reported as unreachable rather than thrown.</summary>
    [Fact]
    public async Task GetAsync_WhenTheRemoteDoesNotAnswer_ReportsUnreachable()
    {
        var (proxy, _) = Create(_ => throw new HttpRequestException("refused"));

        var result = await proxy.GetAsync(Connection, TreePath, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Unreachable, result.Status);
    }

    /// <summary>
    /// Paths that are not the remote's management API are refused before anything is sent,
    /// including ones that only look like it until the dot segments are resolved.
    /// </summary>
    /// <param name="path">The path to refuse.</param>
    [Theory]
    [InlineData("/umbraco/backoffice/index.html")]
    [InlineData("/media/abc/photo.jpg")]
    [InlineData("/")]
    [InlineData("/umbraco/management/api/../../admin")]
    [InlineData("/umbraco/management/api/v1/%2e%2e/%2e%2e/%2e%2e/secret")]
    [InlineData("//evil.example.com/umbraco/management/api/v1/language")]
    [InlineData("/umbraco/management/api/v1/security/back-office/token")]
    [InlineData("umbraco/management/api/v1/language")]
    public async Task GetAsync_RefusesAnythingButTheRemotesManagementApi(string path)
    {
        var (proxy, handler) = Create(_ => Json(HttpStatusCode.OK, "{}"));

        var result = await proxy.GetAsync(Connection, path, CancellationToken.None);

        Assert.Equal(DesktopConnectionStatus.Forbidden, result.Status);
        Assert.Empty(handler.Requests);
    }
}
