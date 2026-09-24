using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.UmbraDesktop.Accessories.StickyNotes;

/// <summary>
/// Registers the sticky note board, the first server-side code in the Accessories package.
/// </summary>
/// <remarks>
/// A singleton, as the host's own key-value stores are: Umbraco registers <c>IKeyValueService</c> as
/// a singleton that opens its own scope per call, and the store's write lock only serialises writes
/// if every request shares the one instance. <c>TimeProvider</c> is registered only if nothing else
/// has, so a site or a test that supplies its own keeps it.
/// </remarks>
public sealed class StickyNotesComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<StickyNoteStore>();
    }
}
