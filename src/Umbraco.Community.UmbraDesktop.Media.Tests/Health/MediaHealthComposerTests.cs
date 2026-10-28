using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.UmbraDesktop.Media.Health;
using Umbraco.Community.UmbraDesktop.Media.Health.Composing;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>What Media Health adds to a site's container: its engine, as singletons that hold no state of their own.</summary>
public class MediaHealthComposerTests
{
    /// <summary>Every part of the engine is registered, once, as a singleton.</summary>
    [Fact]
    public void Registers_the_engine()
    {
        var services = new ServiceCollection();
        var builder = Substitute.For<IUmbracoBuilder>();
        builder.Services.Returns(services);
        builder.Config.Returns(new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build());

        new MediaHealthComposer().Compose(builder);

        foreach (var type in new[] { typeof(MediaHealthStore), typeof(MediaHealthRunner), typeof(IMediaLibraryReader), typeof(IMediaDiskScanner), typeof(IMediaOrphanDeleter), typeof(IMediaCounter), typeof(MediaHealthMigrator) })
        {
            var registered = Assert.Single(services, descriptor => descriptor.ServiceType == type);
            Assert.Equal(ServiceLifetime.Singleton, registered.Lifetime);
        }
    }
}
