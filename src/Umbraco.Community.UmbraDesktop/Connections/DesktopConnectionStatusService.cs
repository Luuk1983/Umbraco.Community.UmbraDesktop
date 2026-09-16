using System.Text.Json;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Services;
using Umbraco.Extensions;

namespace Umbraco.Community.UmbraDesktop.Connections;

/// <summary>
/// What the Status app shows about one connected instance.
/// </summary>
/// <param name="Id">The connection's id.</param>
/// <param name="Name">What the user calls this instance.</param>
/// <param name="Colour">Colour used to tell this connection's rows apart from another's.</param>
/// <param name="BaseUrl">Origin of the instance, so a row can link to it.</param>
/// <param name="Status">How talking to the instance turned out.</param>
/// <param name="ServerStatus">
/// Umbraco's own runtime level, such as <c>Run</c> or <c>Upgrade</c>. Present whenever the instance
/// answered at all, since the endpoint carrying it needs no credentials.
/// </param>
/// <param name="Version">The Umbraco version, present only when the credentials worked.</param>
/// <param name="RuntimeMode">
/// Whether the instance runs in <c>Production</c>, <c>Development</c> or <c>BackofficeDevelopment</c>
/// mode. Present only when the credentials worked.
/// </param>
/// <param name="IsLocal">
/// Whether this is the instance the desktop itself is running on, rather than a configured
/// connection. The client uses it to name and group the row, since the server supplies neither.
/// </param>
public sealed record DesktopConnectionStatusReport(
    Guid Id,
    string Name,
    string Colour,
    string BaseUrl,
    DesktopConnectionStatus Status,
    string? ServerStatus,
    string? Version,
    string? RuntimeMode,
    bool IsLocal);

/// <summary>
/// Builds the Status app's rows by asking each connected instance about itself.
/// </summary>
/// <remarks>
/// <para>
/// Two calls per connection, in a deliberate order. The anonymous status endpoint goes first because
/// it answers even when an instance is mid-upgrade or failed to boot, which is precisely when
/// everything authenticated stops answering. Only then are credentials used, for the version.
/// </para>
/// <para>
/// Nothing here reads content. It reports on the instance, not on what is in it.
/// </para>
/// </remarks>
/// <param name="store">Supplies the configured connections.</param>
/// <param name="client">Makes the calls.</param>
/// <param name="serverInformation">Reports this instance's own version and runtime mode.</param>
/// <param name="runtimeState">Reports this instance's own runtime level.</param>
/// <param name="logger">Records anything that stops one connection being read.</param>
public sealed class DesktopConnectionStatusService(
    DesktopConnectionStore store,
    DesktopConnectionApiClient client,
    IServerInformationService serverInformation,
    IRuntimeState runtimeState,
    ILogger<DesktopConnectionStatusService> logger)
{
    /// <summary>Path of the anonymous endpoint carrying Umbraco's runtime level.</summary>
    private const string StatusPath = "/umbraco/management/api/v1/server/status";

    /// <summary>Path of the authenticated endpoint carrying the version and runtime mode.</summary>
    /// <remarks>
    /// Needs only backoffice access, no section, so the smallest possible API user on the remote is
    /// enough to fill in a row. That is what keeps adding a client a small ask.
    /// </remarks>
    private const string InformationPath = "/umbraco/management/api/v1/server/information";

    /// <summary>
    /// Lists the rows without contacting anybody.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The local instance is complete here, because it costs no network. Every configured connection
    /// is listed as <see cref="DesktopConnectionStatus.Checking"/>, for the caller to fill in one at
    /// a time through <see cref="GetAsync"/>.
    /// </para>
    /// <para>
    /// Split from the checking on purpose. Contacting them all here was concurrent and still meant
    /// the screen stayed blank until the slowest of somebody else's servers answered - one client
    /// with a dead site held every other row hostage, the local one included. Listing first means the
    /// screen is there immediately and fills in as answers arrive.
    /// </para>
    /// </remarks>
    /// <returns>The local instance first, then one unchecked row per connection.</returns>
    public IReadOnlyList<DesktopConnectionStatusReport> List() =>
    [
        LocalReport(),
        .. store.GetAll().Select(connection => new DesktopConnectionStatusReport(
            connection.Id,
            connection.Name,
            connection.Colour,
            connection.BaseUrl,
            DesktopConnectionStatus.Checking,
            null,
            null,
            null,
            IsLocal: false)),
    ];

    /// <summary>
    /// Reports on one connection.
    /// </summary>
    /// <param name="id">The connection's id.</param>
    /// <param name="cancellationToken">Cancels the calls.</param>
    /// <returns>The report, or <c>null</c> when no connection has that id.</returns>
    public async Task<DesktopConnectionStatusReport?> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var connection = store.Get(id);

        return connection is null ? null : await ReportAsync(connection, cancellationToken);
    }

    /// <summary>
    /// Builds the row for the instance this code is running on.
    /// </summary>
    /// <remarks>
    /// No HTTP and no credentials: Umbraco already holds all three facts in process, and asking
    /// ourselves over the network would be slower, would need an API user on our own instance, and
    /// could fail in ways that would be nonsense to report.
    /// <para>
    /// Name and address are left empty deliberately. A name would have to be invented here and could
    /// not then be translated, and an instance behind a proxy does not reliably know its own public
    /// address, while the browser asking the question always does. The flag is what identifies the
    /// row; its values are not.
    /// </para>
    /// </remarks>
    /// <returns>The local instance's row.</returns>
    private DesktopConnectionStatusReport LocalReport()
    {
        var information = serverInformation.GetServerInformation();

        return new DesktopConnectionStatusReport(
            Guid.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            DesktopConnectionStatus.Ok,
            runtimeState.Level.ToString(),
            // The same call the management API's own information endpoint makes, so the local row and
            // every remote row state a version in one format rather than two.
            information.SemVersion.ToSemanticString(),
            information.RuntimeMode.ToString(),
            IsLocal: true);
    }

    /// <summary>Asks one instance about itself and assembles its row.</summary>
    /// <param name="connection">The instance to ask.</param>
    /// <param name="cancellationToken">Cancels the calls.</param>
    /// <returns>The report.</returns>
    private async Task<DesktopConnectionStatusReport> ReportAsync(
        DesktopConnection connection,
        CancellationToken cancellationToken)
    {
        try
        {
            return await ReportCoreAsync(connection, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Every row is gathered with Task.WhenAll, which propagates the first exception, so
            // anything thrown here used to take down the entire screen: every other connection and
            // the local instance, which needs no network at all. One unreachable-looking row is a
            // far better answer than one error where the whole list should be.
            //
            // A catch-all rather than a list of types, deliberately. The known cause is fixed
            // upstream by resolving the address rather than constructing it; this is here so the
            // next thing nobody predicted costs one row instead of the screen.
            logger.LogError(exception, "Could not read the status of connection {ConnectionName}.", connection.Name);

            return new DesktopConnectionStatusReport(
                connection.Id,
                connection.Name,
                connection.Colour,
                connection.BaseUrl,
                DesktopConnectionStatus.Unreachable,
                null,
                null,
                null,
                IsLocal: false);
        }
    }

    /// <summary>Asks one instance about itself, without the guard around it.</summary>
    /// <param name="connection">The instance to ask.</param>
    /// <param name="cancellationToken">Cancels the calls.</param>
    /// <returns>The report.</returns>
    private async Task<DesktopConnectionStatusReport> ReportCoreAsync(
        DesktopConnection connection,
        CancellationToken cancellationToken)
    {
        var statusResponse = await client.GetWithoutCredentialsAsync(connection, StatusPath, cancellationToken);
        var serverStatus = ReadString(statusResponse.Body, "serverStatus");

        var informationResponse = await client.GetAsync(connection, InformationPath, cancellationToken);

        // An instance that answered the anonymous endpoint is demonstrably up, so a failure on the
        // authenticated one is about the credentials rather than the site, and reporting it as
        // unreachable would point at the wrong thing.
        var status = informationResponse.Status is DesktopConnectionStatus.Unreachable
            && statusResponse.Status is DesktopConnectionStatus.Ok
                ? DesktopConnectionStatus.InvalidCredentials
                : informationResponse.Status;

        return new DesktopConnectionStatusReport(
            connection.Id,
            connection.Name,
            connection.Colour,
            connection.BaseUrl,
            status,
            serverStatus,
            ReadString(informationResponse.Body, "version"),
            ReadString(informationResponse.Body, "runtimeMode"),
            IsLocal: false);
    }

    /// <summary>
    /// Reads one string property out of a JSON body, tolerating a body that is absent or not JSON.
    /// </summary>
    /// <remarks>
    /// Deliberately forgiving: this reads a response from somebody else's server, possibly running a
    /// different Umbraco version, and a missing field should leave a blank in a row rather than take
    /// the whole screen down.
    /// </remarks>
    /// <param name="body">The response body, or <c>null</c>.</param>
    /// <param name="propertyName">The property to read.</param>
    /// <returns>The value, or <c>null</c> when it is not there.</returns>
    private static string? ReadString(string? body, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(body);

            return document.RootElement.TryGetProperty(propertyName, out var element)
                && element.ValueKind is JsonValueKind.String
                    ? element.GetString()
                    : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
