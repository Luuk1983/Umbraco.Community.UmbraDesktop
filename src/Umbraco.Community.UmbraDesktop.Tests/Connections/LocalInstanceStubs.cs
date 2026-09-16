using NSubstitute;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Semver;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Connections;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Stands in for what Umbraco reports about the instance the code is running on.
/// </summary>
/// <remarks>
/// Shared because every test of the status service now gets a local row whether it cares about one or
/// not, and a test about a remote connection should not have to restate what this instance is running
/// in order to say so.
/// </remarks>
internal static class LocalInstanceStubs
{
    /// <summary>Builds a server information service reporting a fixed, unremarkable instance.</summary>
    /// <returns>The substitute.</returns>
    public static IServerInformationService ServerInformation()
    {
        var information = Substitute.For<IServerInformationService>();
        information.GetServerInformation().Returns(
            new ServerInformation(new SemVersion(17, 6, 2), TimeZoneInfo.Utc, RuntimeMode.Production));

        return information;
    }

    /// <summary>Builds a runtime state reporting a healthy, running instance.</summary>
    /// <returns>The substitute.</returns>
    public static IRuntimeState RuntimeState()
    {
        var state = Substitute.For<IRuntimeState>();
        state.Level.Returns(RuntimeLevel.Run);

        return state;
    }

    /// <summary>
    /// The one report in a set that is not the local instance.
    /// </summary>
    /// <remarks>
    /// Every test here configures exactly one connection, so "the remote one" is well defined. Named
    /// rather than indexed, so a test reads as being about a connection rather than about row one.
    /// </remarks>
    /// <param name="reports">The reports to pick from.</param>
    /// <returns>The single remote report.</returns>
    public static DesktopConnectionStatusReport Remote(IEnumerable<DesktopConnectionStatusReport> reports) =>
        reports.Single(report => report.IsLocal is false);
}
