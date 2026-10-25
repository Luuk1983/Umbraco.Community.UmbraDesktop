using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Umbraco.Cms.Api.Common.Attributes;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.UmbraDesktop.Accessories.StickyNotes;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Accessories.Tests.StickyNotes;

/// <summary>
/// What the Accessories package adds to a site's service container.
/// </summary>
public class StickyNotesComposerTests
{
    /// <summary>
    /// The site's clock is the site's: Umbraco registers <see cref="TimeProvider"/> itself, and the
    /// host package takes it without registering one. An add-on that registered its own would replace
    /// whatever the site or a test had put there, since the last registration wins.
    /// </summary>
    [Fact]
    public void Leaves_the_site_clock_alone()
    {
        var services = new ServiceCollection();
        var builder = Substitute.For<IUmbracoBuilder>();
        builder.Services.Returns(services);

        new StickyNotesComposer().Compose(builder);

        Assert.DoesNotContain(services, descriptor => descriptor.ServiceType == typeof(TimeProvider));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(StickyNoteStore));
    }

    /// <summary>
    /// The API is in a document of the add-on's own, the way Umbraco 18 expects a package's API to be
    /// described, rather than falling back into Umbraco's own management document.
    /// </summary>
    [Fact]
    public void Maps_the_api_to_the_add_ons_own_document()
        => Assert.Equal(StickyNotesComposer.OpenApiDocumentName, typeof(StickyNotesController).GetCustomAttribute<MapToApiAttribute>()?.ApiName);
}
