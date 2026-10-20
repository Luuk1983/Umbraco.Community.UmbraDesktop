using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Media.Places;

/// <summary>
/// Wraps Umbraco's media list view service in <see cref="MediaPlaceListViewService"/>, the first
/// server-side code in the Media package (issue #158).
/// </summary>
/// <remarks>
/// Umbraco's own service is internal, so it cannot be named: its registration is found, taken out, and
/// made inside ours, with the lifetime it had. Composers run after Umbraco has registered its services,
/// so the registration is there to find; a site where it is not gets nothing, since nothing there would
/// call it.
/// </remarks>
public sealed class MediaPlacesComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        ServiceDescriptor? umbraco = builder.Services.LastOrDefault(descriptor => descriptor.ServiceType == typeof(IMediaListViewService) && !descriptor.IsKeyedService);
        if (umbraco is null)
        {
            return;
        }

        builder.Services.Remove(umbraco);
        builder.Services.Add(new ServiceDescriptor(
            typeof(IMediaListViewService),
            provider => ActivatorUtilities.CreateInstance<MediaPlaceListViewService>(provider, Make(provider, umbraco)),
            umbraco.Lifetime));
    }

    /// <summary>
    /// Make the service a registration describes, however it was registered: an instance, a factory or
    /// a type.
    /// </summary>
    /// <param name="provider">The container.</param>
    /// <param name="registration">The registration.</param>
    /// <returns>The service.</returns>
    private static IMediaListViewService Make(IServiceProvider provider, ServiceDescriptor registration) =>
        (IMediaListViewService)(registration.ImplementationInstance
            ?? registration.ImplementationFactory?.Invoke(provider)
            ?? ActivatorUtilities.CreateInstance(provider, registration.ImplementationType!));
}
