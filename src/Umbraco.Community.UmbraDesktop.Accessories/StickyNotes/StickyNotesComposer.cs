using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.UmbraDesktop.Accessories.StickyNotes;

/// <summary>
/// Registers the sticky note board, the first server-side code in the Accessories package.
/// </summary>
/// <remarks>
/// A singleton, as the host's own key-value stores are: it holds no state of its own, and its
/// writes are serialised by a database lock rather than by sharing an instance. The store's <c>TimeProvider</c> and
/// <c>ICoreScopeProvider</c> are Umbraco's own, so nothing else is registered here: a clock of this
/// package's would replace the one the site chose.
/// </remarks>
public sealed class StickyNotesComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddSingleton<StickyNoteStore>();
    }
}
