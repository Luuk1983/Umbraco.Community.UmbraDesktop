using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.UmbraDesktop.Configuration;
using Umbraco.Community.UmbraDesktop.Manifest;

namespace Umbraco.Community.UmbraDesktop.Composing;

/// <summary>
/// Wires up the web app manifest endpoint, which is what makes the backoffice installable as an app.
/// </summary>
public sealed class WebAppManifestComposer : IComposer
{
    /// <inheritdoc />
    public void Compose(IUmbracoBuilder builder)
    {
        // Singleton: the builder is pure and holds nothing per-request.
        builder.Services.AddSingleton<IWebAppManifestBuilder, WebAppManifestBuilder>();

        // The package's appsettings section, which lets CI pin the installed app's name and icon so
        // they survive a database restore from another environment.
        builder.Services.Configure<UmbraDesktopOptions>(
            builder.Config.GetSection(UmbraDesktopOptions.SectionName));

        // Singleton, like the builder: it holds no state, and its inputs are options and a service
        // that are themselves resolved per call.
        builder.Services.AddSingleton<IAppIdentityResolver, AppIdentityResolver>();
        builder.Services.AddSingleton<IAppIconSetFactory, AppIconSetFactory>();
    }
}
