using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Configuration;

namespace Umbraco.Community.UmbraDesktop.Manifest;

/// <summary>
/// What the backoffice has stored about the installed app, as persisted.
/// </summary>
/// <remarks>
/// One document holding both, under one key. A key each buys nothing and costs a second read, a
/// second parse, and a second way for the two to disagree. The consequence lands on the write side:
/// every save must carry both fields, or storing an icon would blank the name.
/// </remarks>
public sealed class StoredAppIdentity
{
    /// <summary>The stored icon choice, or null when the icon has never been set.</summary>
    public AppIconOptions? AppIcon { get; set; }

    /// <summary>The stored app name, or null when the name has never been set.</summary>
    public string? AppName { get; set; }
}

/// <summary>
/// Resolves the app's icon and name through configuration, then the key-value store, then the site.
/// </summary>
/// <param name="options">The package's appsettings section.</param>
/// <param name="hostingSettings">
/// Umbraco's own hosting settings, read for <see cref="HostingSettings.SiteName"/>.
/// </param>
/// <param name="keyValueService">Umbraco's key-value store, holding the backoffice-set values.</param>
public sealed class AppIdentityResolver(
    IOptions<UmbraDesktopOptions> options,
    IOptions<HostingSettings> hostingSettings,
    IKeyValueService keyValueService) : IAppIdentityResolver
{
    /// <summary>
    /// Key the backoffice-set values are stored under.
    /// </summary>
    /// <remarks>
    /// Prefixed with the package id because the key-value store is one flat namespace shared with
    /// core and every other package on the site.
    /// </remarks>
    public const string StorageKey = "Umbraco.Community.UmbraDesktop.AppIdentity";

    /// <summary>Enum names rather than numbers, so a stored document is readable and diffable.</summary>
    private static readonly JsonSerializerOptions StorageJson = new()
    {
        Converters = { new JsonStringEnumConverter() },
    };

    /// <inheritdoc />
    public AppIconSource ResolveIcon()
    {
        // Configuration first and unconditionally. Present means pinned, which is the point of
        // having it: it survives a database restore from another environment.
        if (options.Value.AppIcon is { } configured)
        {
            return Validate(new AppIconSource(configured.Mode, configured.MediaKey));
        }

        if (StoredIcon() is { } stored)
        {
            return Validate(stored);
        }

        return AppIconSource.Default;
    }

    /// <summary>
    /// The stored icon choice, or null when there is none or it cannot be understood.
    /// </summary>
    /// <remarks>
    /// Read out of the document field by field rather than deserialised whole, and that is not
    /// fussiness. The icon and the name share one document, so a strict parse makes any unreadable
    /// field destroy the other — which is not hypothetical: <c>Favicon</c> was a real mode, stored by
    /// real installs, and removing it would otherwise have taken every one of those sites' chosen app
    /// names with it. A mode this version does not recognise costs the icon and nothing else.
    /// </remarks>
    /// <returns>The stored choice, or null.</returns>
    private AppIconSource? StoredIcon()
    {
        if (Stored()?["AppIcon"] is not JsonObject icon) return null;

        if (!Enum.TryParse<AppIconMode>(icon["Mode"]?.GetValue<string>(), out var mode)) return null;

        return Guid.TryParse(icon["MediaKey"]?.GetValue<string>(), out var key)
            ? new AppIconSource(mode, key)
            : new AppIconSource(mode, null);
    }

    /// <inheritdoc />
    /// <remarks>
    /// The last step reads <see cref="HostingSettings.SiteName"/> from configuration rather than
    /// <c>IHostingEnvironment.SiteName</c>, and that is the entire reason this method is worth
    /// having. <c>IHostingEnvironment</c> has already substituted the <i>application</i> name by the
    /// time you see it, so a site that configured nothing is indistinguishable from one that
    /// deliberately chose an assembly identifier — and most sites configure nothing, which is how a
    /// taskbar ends up reading <c>Contoso.Web.Site</c>. Reading the options gives a real null, and
    /// null is something the caller can replace with a word a human would recognise.
    /// </remarks>
    public string? ResolveName()
    {
        // Same order as the icon, and blank is treated as absent at every step: clearing the field
        // means "stop overriding", not "call the app nothing".
        if (NonBlank(options.Value.AppName) is { } configured) return configured;
        if (NonBlank(Stored()?["AppName"]?.GetValue<string>()) is { } stored) return stored;
        return NonBlank(hostingSettings.Value.SiteName);
    }

    /// <summary>
    /// Read and parse the stored document, tolerating anything unreadable.
    /// </summary>
    /// <remarks>
    /// Failure is swallowed rather than thrown. This runs inside an anonymous endpoint the browser
    /// hits unprompted, so an exception is a 500 on a URL nobody chose to visit — and the cost of a
    /// bad stored value should be the wrong name or picture, not a dead manifest.
    /// </remarks>
    /// <returns>The stored document, or null when absent or unreadable.</returns>
    private JsonObject? Stored()
    {
        var raw = keyValueService.GetValue(StorageKey);
        if (string.IsNullOrWhiteSpace(raw)) return null;

        try
        {
            return JsonNode.Parse(raw) as JsonObject;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Trim a value, treating blank as absent.
    /// </summary>
    /// <param name="value">The candidate.</param>
    /// <returns>The trimmed value, or null when it was null or whitespace.</returns>
    private static string? NonBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// Reject a choice that cannot actually produce an icon.
    /// </summary>
    /// <remarks>
    /// Custom with no media is the only such case, and it matters more than it looks: a manifest
    /// with no usable icon is not installable at all, so this would take the feature down rather
    /// than merely showing the wrong mark.
    /// </remarks>
    /// <param name="source">The candidate.</param>
    /// <returns>The candidate, or the default when it cannot produce an icon.</returns>
    private static AppIconSource Validate(AppIconSource source) =>
        source is { Mode: AppIconMode.Custom, MediaKey: null } ? AppIconSource.Default : source;
}
