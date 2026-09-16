using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Semver;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Exercises the row <see cref="DesktopConnectionStatusService"/> reports about the instance it is
/// running on, which is the one row that costs no network at all.
/// </summary>
public class DesktopConnectionStatusServiceLocalTests
{
    /// <summary>
    /// Builds a service over an empty store, with the local instance answering as described.
    /// </summary>
    /// <param name="version">The version the local instance reports.</param>
    /// <param name="mode">The runtime mode the local instance reports.</param>
    /// <param name="level">The runtime level the local instance reports.</param>
    /// <returns>The service under test.</returns>
    private static DesktopConnectionStatusService Create(
        SemVersion? version = null,
        RuntimeMode mode = RuntimeMode.Production,
        RuntimeLevel level = RuntimeLevel.Run)
    {
        var store = new DesktopConnectionStore(new InMemoryKeyValueService(), new EphemeralDataProtectionProvider());

        var information = Substitute.For<IServerInformationService>();
        information.GetServerInformation().Returns(
            new ServerInformation(version ?? new SemVersion(17, 6, 2), TimeZoneInfo.Utc, mode));

        var runtimeState = Substitute.For<IRuntimeState>();
        runtimeState.Level.Returns(level);

        var factory = new StubHttpClientFactory(new StubHttpMessageHandler(_ => throw new HttpRequestException("no")));
        var client = new DesktopConnectionApiClient(
            new DesktopConnectionTokenProvider(
                store,
                factory,
                new FakeTimeProvider(new DateTimeOffset(2026, 9, 16, 12, 0, 0, TimeSpan.Zero))),
            factory);

        return new DesktopConnectionStatusService(
            store,
            client,
            information,
            runtimeState,
            LocalInstanceStubs.Logger());
    }

    /// <summary>
    /// The instance the desktop runs on is always reported, even when nothing is connected.
    /// </summary>
    /// <remarks>
    /// It is the row a reader can check the others against: "what does a working one look like" has
    /// no answer on a screen that only ever shows other people's servers.
    /// </remarks>
    [Fact]
    public void List_ReportsTheLocalInstance_WithNoConnectionsConfigured()
    {
        var report = Assert.Single(Create().List());

        Assert.True(report.IsLocal);
        Assert.Equal(DesktopConnectionStatus.Ok, report.Status);
    }

    /// <summary>The local row carries the same three facts a remote row does, read straight from Umbraco.</summary>
    [Fact]
    public void List_ReportsTheLocalVersionModeAndLevel()
    {
        var service = Create(new SemVersion(17, 6, 2), RuntimeMode.BackofficeDevelopment, RuntimeLevel.Upgrade);

        var report = Assert.Single(service.List());

        Assert.Equal("17.6.2", report.Version);
        Assert.Equal("BackofficeDevelopment", report.RuntimeMode);
        Assert.Equal("Upgrade", report.ServerStatus);
    }

    /// <summary>
    /// The local row carries no name and no address.
    /// </summary>
    /// <remarks>
    /// Neither is the server's to give. A name would have to be invented and could not be translated,
    /// and an instance behind a proxy does not reliably know its own public address - the browser
    /// asking the question is the one party that does. So both are left to the client, which is also
    /// why the row is flagged rather than identified by its values.
    /// </remarks>
    [Fact]
    public void List_LeavesTheLocalNameAndAddressToTheClient()
    {
        var report = Assert.Single(Create().List());

        Assert.Equal(string.Empty, report.Name);
        Assert.Equal(string.Empty, report.BaseUrl);
    }

    /// <summary>
    /// The local row comes first, and is the only row with no id.
    /// </summary>
    /// <remarks>
    /// An empty id says it is not a configured connection, which is what stops the client keying a
    /// row on it and stops anything trying to edit or delete it.
    /// </remarks>
    [Fact]
    public void List_PutsTheLocalInstanceFirst_AndGivesItNoId()
    {
        var reports = Create().List();

        Assert.Equal(Guid.Empty, reports[0].Id);
        Assert.True(reports[0].IsLocal);
    }

    /// <summary>Asking about one connection never answers with the local instance.</summary>
    [Fact]
    public async Task GetAsync_DoesNotReturnTheLocalInstance()
    {
        Assert.Null(await Create().GetAsync(Guid.Empty, CancellationToken.None));
    }
}
