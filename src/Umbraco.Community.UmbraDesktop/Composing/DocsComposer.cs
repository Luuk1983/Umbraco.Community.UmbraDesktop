using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.UmbraDesktop.Docs;

namespace Umbraco.Community.UmbraDesktop.Composing;

/// <summary>
/// Wires up the listing behind the Help app.
/// </summary>
public sealed class DocsComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        // Singleton: it holds no state, and it reads the environment's file provider per call, so it
        // sees the composite provider the host installs at startup whenever it was created.
        builder.Services.AddSingleton<IDocsFileLister, DocsFileLister>();
    }
}
