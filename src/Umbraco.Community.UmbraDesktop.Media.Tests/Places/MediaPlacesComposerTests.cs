using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Security.Authorization;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Media.Places;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Places;

/// <summary>
/// What the Media package does to a site's service container: it wraps Umbraco's media list view
/// service, and replaces nothing else.
/// </summary>
public class MediaPlacesComposerTests
{
    /// <summary>
    /// Umbraco's own media list view service, as the site registered it, stands in for the one the
    /// container would make: a test needs a type it can name, and Umbraco's is internal.
    /// </summary>
    private sealed class UmbracoListView : IMediaListViewService
    {
        /// <inheritdoc />
        public Task<Umbraco.Cms.Core.Attempt<Umbraco.Cms.Core.Models.ListViewPagedModel<Umbraco.Cms.Core.Models.IMedia>?, Umbraco.Cms.Core.Services.OperationStatus.ContentCollectionOperationStatus>> GetListViewItemsByKeyAsync(
            Umbraco.Cms.Core.Models.Membership.IUser user,
            Guid? key,
            Guid? dataTypeKey,
            string orderBy,
            Umbraco.Cms.Core.Direction orderDirection,
            string? filter,
            int skip,
            int take) => throw new NotSupportedException();
    }

    /// <summary>
    /// The service the site gets is ours, wrapped round the one it had, with the lifetime it had: a
    /// decorator, so what Umbraco answers stays Umbraco's.
    /// </summary>
    [Fact]
    public void Wraps_umbracos_media_list_view_service()
    {
        var services = new ServiceCollection();
        services.AddSingleton<IMediaListViewService, UmbracoListView>();
        services.AddSingleton(Substitute.For<IMediaService>());
        services.AddSingleton(Substitute.For<IMediaTypeService>());
        services.AddSingleton(Substitute.For<IDataTypeService>());
        services.AddSingleton(Substitute.For<IMediaSearchService>());
        services.AddSingleton(Substitute.For<IMediaPermissionAuthorizer>());
        var builder = Substitute.For<IUmbracoBuilder>();
        builder.Services.Returns(services);

        new MediaPlacesComposer().Compose(builder);

        var registered = Assert.Single(services, descriptor => descriptor.ServiceType == typeof(IMediaListViewService));
        Assert.Equal(ServiceLifetime.Singleton, registered.Lifetime);
        using var provider = services.BuildServiceProvider();
        var service = Assert.IsType<MediaPlaceListViewService>(provider.GetRequiredService<IMediaListViewService>());
        Assert.IsType<UmbracoListView>(service.Umbraco);
    }

    /// <summary>
    /// A site without Umbraco's service (nothing registered it, so nothing calls it) is left as it is,
    /// rather than given a decorator with nothing inside.
    /// </summary>
    [Fact]
    public void Leaves_a_site_without_the_service_alone()
    {
        var services = new ServiceCollection();
        var builder = Substitute.For<IUmbracoBuilder>();
        builder.Services.Returns(services);

        new MediaPlacesComposer().Compose(builder);

        Assert.Empty(services);
    }
}
