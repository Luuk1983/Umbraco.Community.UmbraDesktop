using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Media.Guidelines;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Guidelines;

/// <summary>What the guidelines add to a site's service container.</summary>
public class MediaGuidelinesComposerTests
{
    /// <summary>The store is registered once, as a singleton over Umbraco's key-value service.</summary>
    [Fact]
    public void Registers_the_store_as_a_singleton()
    {
        var services = new ServiceCollection();
        var builder = Substitute.For<IUmbracoBuilder>();
        builder.Services.Returns(services);

        new MediaGuidelinesComposer().Compose(builder);

        var registration = Assert.Single(services, descriptor => descriptor.ServiceType == typeof(IMediaGuidelinesStore));
        Assert.Equal(ServiceLifetime.Singleton, registration.Lifetime);
        services.AddSingleton(Substitute.For<IKeyValueService>());
        Assert.IsType<MediaGuidelinesStore>(services.BuildServiceProvider().GetRequiredService<IMediaGuidelinesStore>());
    }
}
