using System.Net;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Exercises <see cref="DesktopConnectionStatusService"/>: what a row in the Status app says about
/// an instance, and in particular that the three ways a connection can fail stay distinguishable all
/// the way up to the row.
/// </summary>
public class DesktopConnectionStatusServiceTests
{
    /// <summary>Arbitrary fixed instant, so nothing here depends on the wall clock.</summary>
    private static readonly DateTimeOffset Start = new(2026, 9, 15, 12, 0, 0, TimeSpan.Zero);

    /// <summary>Path of the anonymous status endpoint, which answers even on a broken instance.</summary>
    private const string StatusPath = "/umbraco/management/api/v1/server/status";

    /// <summary>Path of the authenticated information endpoint, which carries the version.</summary>
    private const string InformationPath = "/umbraco/management/api/v1/server/information";

    /// <summary>Builds a 200 response carrying a JSON body.</summary>
    /// <param name="body">The response body.</param>
    /// <returns>The response.</returns>
    private static HttpResponseMessage Ok(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    /// <summary>
    /// Builds a status service over one connection, with the remote answering as described.
    /// </summary>
    /// <param name="respond">Answers each request the service makes.</param>
    /// <param name="clientSecret">The secret to store for the connection, or <c>null</c> for none.</param>
    /// <param name="baseUrl">The connection's address, so a test can give it a bad one.</param>
    /// <returns>The service under test and the connection it knows about.</returns>
    private static (DesktopConnectionStatusService Service, DesktopConnection Connection) Create(
        Func<HttpRequestMessage, HttpResponseMessage> respond,
        string? clientSecret = "the-secret",
        string baseUrl = "https://client-a.example.com")
    {
        var connection = new DesktopConnection(
            Guid.Parse("33333333-3333-3333-3333-333333333333"),
            "Client A",
            baseUrl,
            "#ff0000",
            "umbraco-back-office-desktop");

        var store = new DesktopConnectionStore(new InMemoryKeyValueService(), new EphemeralDataProtectionProvider());
        store.Save(connection, clientSecret);

        var factory = new StubHttpClientFactory(new StubHttpMessageHandler(respond));
        var client = new DesktopConnectionApiClient(
            new DesktopConnectionTokenProvider(store, factory, new FakeTimeProvider(Start)),
            factory);

        return (
            new DesktopConnectionStatusService(
                store,
                client,
                LocalInstanceStubs.ServerInformation(),
                LocalInstanceStubs.RuntimeState(),
                LocalInstanceStubs.Logger()),
            connection);
    }

    /// <summary>Answers a healthy instance: tokens, status and information all succeed.</summary>
    /// <param name="request">The request being answered.</param>
    /// <returns>The response.</returns>
    private static HttpResponseMessage Healthy(HttpRequestMessage request) =>
        request.RequestUri!.AbsolutePath switch
        {
            var path when path.EndsWith("/security/back-office/token", StringComparison.Ordinal) =>
                Ok("""{"access_token":"token-1","token_type":"Bearer","expires_in":300}"""),
            StatusPath => Ok("""{"serverStatus":"Run"}"""),
            InformationPath => Ok(
                """{"version":"17.1.0","assemblyVersion":"17.1.0.0","baseUtcOffset":"01:00:00","runtimeMode":"Production"}"""),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound),
        };

    /// <summary>A healthy instance reports everything the row shows.</summary>
    [Fact]
    public async Task GetAsync_ReportsVersionRuntimeModeAndServerStatus()
    {
        var (service, connection) = Create(Healthy);

        var report = await service.GetAsync(connection.Id, CancellationToken.None);
        Assert.NotNull(report);

        Assert.Equal(connection.Id, report.Id);
        Assert.Equal("Client A", report.Name);
        Assert.Equal(DesktopConnectionStatus.Ok, report.Status);
        Assert.Equal("Run", report.ServerStatus);
        Assert.Equal("17.1.0", report.Version);
        Assert.Equal("Production", report.RuntimeMode);
    }

    /// <summary>An instance that cannot be reached at all says so, and carries no version.</summary>
    [Fact]
    public async Task GetAsync_ReportsUnreachable_WhenNothingAnswers()
    {
        var (service, connection) = Create(_ => throw new HttpRequestException("no such host"));

        var report = await service.GetAsync(connection.Id, CancellationToken.None);
        Assert.NotNull(report);

        Assert.Equal(DesktopConnectionStatus.Unreachable, report.Status);
        Assert.Null(report.Version);
        Assert.Null(report.ServerStatus);
    }

    /// <summary>
    /// An instance that is up but rejects the credentials says exactly that, and still reports its
    /// server status, because that endpoint needs no credentials.
    /// </summary>
    /// <remarks>
    /// This is the distinction the whole status shape exists for. "Something went wrong" sends
    /// someone to check whether a client's site is down when the real answer is that a secret was
    /// pasted with a trailing space.
    /// </remarks>
    [Fact]
    public async Task GetAsync_ReportsInvalidCredentials_ButStillReportsServerStatus()
    {
        var (service, connection) = Create(request => request.RequestUri!.AbsolutePath switch
        {
            var path when path.EndsWith("/security/back-office/token", StringComparison.Ordinal) =>
                new HttpResponseMessage(HttpStatusCode.BadRequest)
                {
                    Content = new StringContent("""{"error":"invalid_client"}""", Encoding.UTF8, "application/json"),
                },
            StatusPath => Ok("""{"serverStatus":"Run"}"""),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound),
        });

        var report = await service.GetAsync(connection.Id, CancellationToken.None);
        Assert.NotNull(report);

        Assert.Equal(DesktopConnectionStatus.InvalidCredentials, report.Status);
        Assert.Equal("Run", report.ServerStatus);
        Assert.Null(report.Version);
    }

    /// <summary>
    /// An instance mid-upgrade reports the level it is stuck at, which is the case the anonymous
    /// endpoint exists to cover: nothing authenticated answers, and "unreachable" would be a lie.
    /// </summary>
    [Fact]
    public async Task GetAsync_ReportsTheRuntimeLevel_WhenTheInstanceIsNotRunning()
    {
        var (service, connection) = Create(request => request.RequestUri!.AbsolutePath switch
        {
            StatusPath => Ok("""{"serverStatus":"Upgrade"}"""),
            _ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable),
        });

        var report = await service.GetAsync(connection.Id, CancellationToken.None);
        Assert.NotNull(report);

        Assert.Equal("Upgrade", report.ServerStatus);
    }

    /// <summary>A connection with no secret yet is reported as unconfigured, not as broken.</summary>
    [Fact]
    public async Task GetAsync_ReportsNotConfigured_WhenNoSecretIsStored()
    {
        var (service, connection) = Create(Healthy, clientSecret: null);

        var report = await service.GetAsync(connection.Id, CancellationToken.None);
        Assert.NotNull(report);

        Assert.Equal(DesktopConnectionStatus.NotConfigured, report.Status);
        Assert.Equal("Run", report.ServerStatus);
    }

    /// <summary>
    /// A connection whose address will not parse is reported as unreachable, not thrown about.
    /// </summary>
    /// <remarks>
    /// This is the bug as it was actually seen. A single connection saved with
    /// <c>https://localhost:123456</c> made the status endpoint throw, so every row disappeared
    /// behind "could not read the connection status" - including the local instance, which needs no
    /// network at all and could not possibly have been affected by it. Rows are fetched one at a
    /// time now, which contains the blast radius as well, but the throw is fixed at the source.
    /// </remarks>
    [Fact]
    public async Task GetAsync_ReportsUnreachable_WhenTheAddressWillNotParse()
    {
        var (service, connection) = Create(Healthy, baseUrl: "https://localhost:123456");

        var report = await service.GetAsync(connection.Id, CancellationToken.None);

        Assert.NotNull(report);
        Assert.Equal(DesktopConnectionStatus.Unreachable, report.Status);
    }

    /// <summary>Asking about one connection reports on that connection.</summary>
    [Fact]
    public async Task GetAsync_ReportsOnTheRequestedConnection()
    {
        var (service, connection) = Create(Healthy);

        var report = await service.GetAsync(connection.Id, CancellationToken.None);

        Assert.NotNull(report);
        Assert.Equal(connection.Id, report.Id);
        Assert.Equal(DesktopConnectionStatus.Ok, report.Status);
    }

    /// <summary>Asking about a connection that does not exist reports nothing rather than failing.</summary>
    [Fact]
    public async Task GetAsync_ReturnsNull_ForAnUnknownConnection()
    {
        var (service, connection) = Create(Healthy);

        Assert.Null(await service.GetAsync(Guid.NewGuid(), CancellationToken.None));
    }
}
