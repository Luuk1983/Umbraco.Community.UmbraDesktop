using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.UmbraDesktop.Connections;

namespace Umbraco.Community.UmbraDesktop.Composing;

/// <summary>
/// Wires up connections to other Umbraco instances: the store, the token provider, the read client
/// and the status service.
/// </summary>
public sealed class ConnectionsComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        // Needed by the token provider and the read client. Umbraco registers it already in most
        // setups, and AddHttpClient is idempotent, so asking for it here removes the dependency on
        // that staying true.
        builder.Services.AddHttpClient();

        // All singletons, and the token provider is the reason. Its cache is the only thing keeping
        // a status screen over eight connections from re-authenticating on every request, and a
        // per-request lifetime would throw the cache away each time. A singleton may only depend on
        // singletons, so the store is one too, which is safe because Umbraco registers
        // IKeyValueService as a singleton itself and it opens its own scope per call.
        builder.Services.AddSingleton<DesktopConnectionStore>();
        builder.Services.AddSingleton<DesktopConnectionTokenProvider>();
        builder.Services.AddSingleton<DesktopConnectionApiClient>();
        builder.Services.AddSingleton<DesktopConnectionStatusService>();
    }
}
