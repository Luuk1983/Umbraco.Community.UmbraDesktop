using System.Net;
using System.Reflection;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api;
using Umbraco.Community.UmbraDesktop.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Exercises <see cref="ConnectionProxyController"/>: that it finds the connection, forwards the
/// path and query as the frame asked for them, and writes back exactly what the remote said.
/// </summary>
public class ConnectionProxyControllerTests
{
    /// <summary>The connection the controller knows about.</summary>
    private static readonly DesktopConnection Connection = new(
        Guid.Parse("44444444-4444-4444-4444-444444444444"),
        "Client C",
        "https://client-c.example.com",
        "#0000ff",
        "umbraco-back-office-desktop");

    /// <summary>Builds a controller over one connection whose API calls are answered by <paramref name="respond"/>.</summary>
    /// <param name="respond">Answers requests that are not to the token endpoint.</param>
    /// <param name="queryString">The query string of the incoming request.</param>
    /// <returns>The controller and the handler behind it.</returns>
    private static (ConnectionProxyController Controller, StubHttpMessageHandler Handler) Create(
        Func<HttpRequestMessage, HttpResponseMessage> respond,
        string queryString = "")
    {
        var handler = new StubHttpMessageHandler(request =>
            request.RequestUri!.AbsolutePath.EndsWith("/security/back-office/token", StringComparison.Ordinal)
                ? new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("""{"access_token":"t","token_type":"Bearer","expires_in":300}""", Encoding.UTF8, "application/json"),
                }
                : respond(request));

        var store = new DesktopConnectionStore(new InMemoryKeyValueService(), new EphemeralDataProtectionProvider());
        store.Save(Connection, "the-secret");
        var factory = new StubHttpClientFactory(handler);
        var tokens = new DesktopConnectionTokenProvider(store, factory, new FakeTimeProvider(new DateTimeOffset(2026, 9, 29, 12, 0, 0, TimeSpan.Zero)));

        var controller = new ConnectionProxyController(store, new DesktopConnectionProxy(tokens, factory))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
        controller.HttpContext.Request.QueryString = new QueryString(queryString);

        return (controller, handler);
    }

    /// <summary>Runs a result against a fresh response and reads back what it wrote.</summary>
    /// <param name="controller">The controller whose context to use.</param>
    /// <param name="result">The result to execute.</param>
    /// <returns>The response's status code, content type, body and cache header.</returns>
    private static async Task<(int Status, string? ContentType, string Body, string? CacheControl)> Execute(
        ConnectionProxyController controller,
        IActionResult result)
    {
        var body = new MemoryStream();
        controller.HttpContext.Response.Body = body;
        await result.ExecuteResultAsync(controller.ControllerContext);

        return (
            controller.HttpContext.Response.StatusCode,
            controller.HttpContext.Response.ContentType,
            Encoding.UTF8.GetString(body.ToArray()),
            controller.HttpContext.Response.Headers.CacheControl.ToString());
    }

    /// <summary>The path from the route and the query from the request reach the remote together.</summary>
    [Fact]
    public async Task Get_ForwardsThePathAndQuery()
    {
        var (controller, handler) = Create(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") }, "?skip=0&take=100");

        await Execute(controller, await controller.Get(Connection.Id, "umbraco/management/api/v1/tree/document/root", CancellationToken.None));

        Assert.Equal(
            "https://client-c.example.com/umbraco/management/api/v1/tree/document/root?skip=0&take=100",
            handler.Requests.Last().Uri?.ToString());
    }

    /// <summary>The remote's status, content type and body are written back as they were.</summary>
    [Fact]
    public async Task Get_WritesTheRemotesAnswer()
    {
        var (controller, _) = Create(_ => new HttpResponseMessage(HttpStatusCode.NotFound)
        {
            Content = new StringContent("""{"title":"Not found"}""", Encoding.UTF8, "application/problem+json"),
        });

        var (status, contentType, body, _) = await Execute(controller, await controller.Get(Connection.Id, "umbraco/management/api/v1/document/x", CancellationToken.None));

        Assert.Equal(404, status);
        Assert.StartsWith("application/problem+json", contentType);
        Assert.Equal("""{"title":"Not found"}""", body);
    }

    /// <summary>
    /// Nothing proxied is cached by the browser. It is somebody else's content, fetched under a
    /// credential the browser does not hold, and a cached copy would outlive the connection.
    /// </summary>
    [Fact]
    public async Task Get_IsNeverCached()
    {
        var (controller, _) = Create(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") });

        var (_, _, _, cacheControl) = await Execute(controller, await controller.Get(Connection.Id, "umbraco/management/api/v1/language", CancellationToken.None));

        Assert.Equal("no-store", cacheControl);
    }

    /// <summary>An id with no connection behind it is a 404, and nothing is sent anywhere.</summary>
    [Fact]
    public async Task Get_UnknownConnection_IsNotFound()
    {
        var (controller, handler) = Create(_ => new HttpResponseMessage(HttpStatusCode.OK));

        var result = await controller.Get(Guid.NewGuid(), "umbraco/management/api/v1/language", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        Assert.Empty(handler.Requests);
    }

    /// <summary>A path the proxy will not forward is a 400, and nothing is sent anywhere.</summary>
    [Fact]
    public async Task Get_RefusedPath_IsBadRequest()
    {
        var (controller, handler) = Create(_ => new HttpResponseMessage(HttpStatusCode.OK));

        var result = await controller.Get(Connection.Id, "umbraco/backoffice/index.html", CancellationToken.None);

        Assert.Equal(400, Assert.IsAssignableFrom<IStatusCodeActionResult>(result).StatusCode);
        Assert.Empty(handler.Requests);
    }

    /// <summary>A remote that cannot be reached is a 502, which says it is the far end at fault.</summary>
    [Fact]
    public async Task Get_UnreachableRemote_IsBadGateway()
    {
        var (controller, _) = Create(_ => throw new HttpRequestException("refused"));

        var result = await controller.Get(Connection.Id, "umbraco/management/api/v1/language", CancellationToken.None);

        Assert.Equal(502, Assert.IsAssignableFrom<IStatusCodeActionResult>(result).StatusCode);
    }

    /// <summary>
    /// Reading another instance's content needs Content section access here. Connection status needs
    /// only a login, but a page's content is not the same as its version number.
    /// </summary>
    [Fact]
    public void Controller_RequiresContentSectionAccess()
    {
        // Declared on the controller itself. The base class adds its own backoffice-access attribute,
        // which is why this reads the controller's own rather than asking for "the" one.
        var policies = typeof(ConnectionProxyController)
            .GetCustomAttributes<AuthorizeAttribute>(inherit: false)
            .Select(attribute => attribute.Policy);

        Assert.Contains(AuthorizationPolicies.SectionAccessContent, policies);
    }

    /// <summary>The controller answers GET and nothing else, so no other method can even be routed.</summary>
    [Fact]
    public void Controller_OnlyHasGetActions()
    {
        var verbs = typeof(ConnectionProxyController)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .SelectMany(method => method.GetCustomAttributes<HttpMethodAttribute>())
            .SelectMany(attribute => attribute.HttpMethods)
            .Distinct()
            .ToArray();

        Assert.Equal(["GET"], verbs);
    }
}
