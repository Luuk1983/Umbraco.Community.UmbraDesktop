using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.UmbraDesktop.DesktopLabel;

namespace Umbraco.Community.UmbraDesktop.Composing;

/// <summary>
/// Wires up the store behind the desktop label.
/// </summary>
/// <remarks>
/// The label's text needs nothing new: it is the App name, whose resolver
/// <see cref="WebAppManifestComposer"/> already registers.
/// </remarks>
public sealed class DesktopLabelComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        // Singleton, like the app identity resolver: it holds no state of its own, and the key-value
        // service it reads through is itself safe to hold for the application's lifetime.
        builder.Services.AddSingleton<IDesktopLabelStore, DesktopLabelStore>();
    }
}
