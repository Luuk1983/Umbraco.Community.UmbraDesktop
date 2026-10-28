using System.Text.Json.Nodes;

namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// A package's check on its own site setting, run on the server before every change is stored.
/// </summary>
/// <remarks>
/// The store never looks inside a value, so this is where a package says what a valid one is, such
/// as a quality between 1 and 100. On the server because the browser can be bypassed. Register one
/// with <see cref="SitePackageSettingsBuilderExtensions.AddUmbraDesktopSiteSettingsValidator{TValidator}"/>.
/// It checks only: it cannot change the value, because the browser compares what it sent with what
/// was stored.
/// </remarks>
public interface ISitePackageSettingsValidator
{
    /// <summary>
    /// Checks a value before it is stored.
    /// </summary>
    /// <param name="value">
    /// The whole value as it would be stored: for a patch, already merged with what everyone else has
    /// stored. Null for the JSON literal <c>null</c>.
    /// </param>
    /// <returns>
    /// Why the value is refused, one sentence per problem, written for the person who made the
    /// change. Empty when it may be stored.
    /// </returns>
    IEnumerable<string> Validate(JsonNode? value);
}
