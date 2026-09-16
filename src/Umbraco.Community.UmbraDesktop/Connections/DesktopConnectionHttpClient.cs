namespace Umbraco.Community.UmbraDesktop.Connections;

/// <summary>
/// The HTTP client every call to a connected instance is made on.
/// </summary>
/// <remarks>
/// It exists for the timeout. <see cref="HttpClient"/> defaults to 100 seconds, and a status screen
/// asking two questions of each connection could therefore sit on one unreachable host for over
/// three minutes before admitting it. Nobody waits that long, so the screen was effectively broken
/// for anyone with a client whose site was down.
/// </remarks>
public static class DesktopConnectionHttpClient
{
    /// <summary>Name the client is registered and resolved under.</summary>
    public const string Name = "UmbraDesktop.Connections";

    /// <summary>
    /// How long any one call to a connected instance may take.
    /// </summary>
    /// <remarks>
    /// Ten seconds: far longer than a healthy instance needs for either of the two endpoints this
    /// reads, and short enough that an unhealthy one is reported while somebody is still looking at
    /// the screen. A timeout surfaces as <see cref="TaskCanceledException"/>, which both callers
    /// already map to unreachable.
    /// </remarks>
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);
}
