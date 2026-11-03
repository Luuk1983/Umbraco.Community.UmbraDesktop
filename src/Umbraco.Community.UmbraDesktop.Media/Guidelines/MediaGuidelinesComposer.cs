using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.UmbraDesktop.Media.Guidelines;

/// <summary>
/// Wires up the store behind the media guidelines (issue #179).
/// </summary>
public sealed class MediaGuidelinesComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        // Singleton, like the desktop label's store: it holds no state of its own, and the key-value
        // service it reads through is itself safe to hold for the application's lifetime.
        builder.Services.AddSingleton<IMediaGuidelinesStore, MediaGuidelinesStore>();
    }
}
