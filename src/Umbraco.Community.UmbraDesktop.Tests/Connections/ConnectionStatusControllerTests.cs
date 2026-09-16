using System.Net;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Api;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Exercises <see cref="ConnectionStatusController"/>, which is a thin map with one decision in it:
/// the status travels as a name rather than a number.
/// </summary>
public class ConnectionStatusControllerTests
{
    /// <summary>Builds a controller over one connection whose instance answers as unreachable.</summary>
    /// <returns>The controller under test.</returns>
    private static ConnectionStatusController Create()
    {
        var store = new DesktopConnectionStore(new InMemoryKeyValueService(), new EphemeralDataProtectionProvider());
        store.Save(
            new DesktopConnection(Guid.NewGuid(), "Client A", "https://client-a.example.com", "#ff0000", "client"),
            "the-secret");

        var factory = new StubHttpClientFactory(new StubHttpMessageHandler(request =>
            request.RequestUri!.AbsolutePath.EndsWith("/server/status", StringComparison.Ordinal)
                ? new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("""{"serverStatus":"Run"}""", Encoding.UTF8, "application/json"),
                }
                : throw new HttpRequestException("refused")));

        var client = new DesktopConnectionApiClient(
            new DesktopConnectionTokenProvider(
                store,
                factory,
                new FakeTimeProvider(new DateTimeOffset(2026, 9, 15, 12, 0, 0, TimeSpan.Zero))),
            factory);

        return new ConnectionStatusController(
            new DesktopConnectionStatusService(
                store,
                client,
                LocalInstanceStubs.ServerInformation(),
                LocalInstanceStubs.RuntimeState()));
    }

    /// <summary>
    /// The status is a name, not a number.
    /// </summary>
    /// <remarks>
    /// The generated TypeScript client would otherwise carry an integer whose meaning lives only in
    /// the C# enum's declaration order, so reordering it would silently change what every row says.
    /// </remarks>
    [Fact]
    public async Task GetConnectionStatuses_ReportsTheStatusByName()
    {
        var result = await Create().GetConnectionStatuses(CancellationToken.None);

        var reports = Assert.IsType<DesktopConnectionStatusResponseModel[]>(
            Assert.IsType<OkObjectResult>(result).Value);
        var remote = Assert.Single(reports, report => report.IsLocal is false);
        Assert.Equal("InvalidCredentials", remote.Status);
        Assert.Equal("Run", remote.ServerStatus);
    }
}
