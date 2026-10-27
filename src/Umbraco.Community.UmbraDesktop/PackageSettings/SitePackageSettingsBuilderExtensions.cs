using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// The call a package makes in its composer to say who may change its site setting.
/// </summary>
public static class SitePackageSettingsBuilderExtensions
{
    /// <summary>
    /// Lets users who meet a policy change a package's site setting, instead of only Settings users.
    /// </summary>
    /// <example>
    /// <code>builder.AddUmbraDesktopSiteSettings("My.Package", AuthorizationPolicies.SectionAccessMedia);</code>
    /// </example>
    /// <param name="builder">The Umbraco builder, in the package's composer.</param>
    /// <param name="key">The package key the browser passes to <c>siteStore</c>.</param>
    /// <param name="changePolicy">The name of an authorization policy, such as one of <c>AuthorizationPolicies</c>.</param>
    /// <returns>The builder, for chaining.</returns>
    /// <exception cref="ArgumentException">
    /// When the key could not be stored or the policy is blank. Thrown at startup, where the author
    /// sees it, rather than at the first save.
    /// </exception>
    public static IUmbracoBuilder AddUmbraDesktopSiteSettings(this IUmbracoBuilder builder, string key, string changePolicy)
    {
        ThrowUnlessValid(key);
        ArgumentException.ThrowIfNullOrWhiteSpace(changePolicy);
        builder.Services.AddSingleton(new SitePackageSettingsRegistration(key, changePolicy));
        return builder;
    }

    /// <summary>
    /// Checks a package's site setting on the server before every change is stored.
    /// </summary>
    /// <remarks>
    /// The validator is a singleton, built by the container, so it can take the package's own
    /// services. Several validators for one key all run, and a change is stored only when none of
    /// them has a problem with it.
    /// </remarks>
    /// <example>
    /// <code>builder.AddUmbraDesktopSiteSettingsValidator&lt;MyPackageSettingsValidator&gt;("My.Package");</code>
    /// </example>
    /// <typeparam name="TValidator">The validator.</typeparam>
    /// <param name="builder">The Umbraco builder, in the package's composer.</param>
    /// <param name="key">The package key the browser passes to <c>siteStore</c>.</param>
    /// <returns>The builder, for chaining.</returns>
    /// <exception cref="ArgumentException">When the key could not be stored. Thrown at startup.</exception>
    public static IUmbracoBuilder AddUmbraDesktopSiteSettingsValidator<TValidator>(this IUmbracoBuilder builder, string key)
        where TValidator : class, ISitePackageSettingsValidator
    {
        ThrowUnlessValid(key);
        // Tried, so one validator registered for two keys is built once.
        builder.Services.TryAddSingleton<TValidator>();
        builder.Services.AddSingleton(new SitePackageSettingsValidatorRegistration(key, typeof(TValidator)));
        return builder;
    }

    /// <summary>
    /// Refuses, at startup, a key the store could not keep.
    /// </summary>
    /// <param name="key">The package key.</param>
    /// <exception cref="ArgumentException">When the key could not be stored.</exception>
    private static void ThrowUnlessValid(string key)
    {
        if (SitePackageSettingsKey.IsValid(key)) return;

        throw new ArgumentException(
            $"\"{key}\" cannot be a site settings key: it must be non-empty, unpadded, at most "
            + $"{SitePackageSettingsKey.MaxLength} characters, and not the desktop's own group.",
            nameof(key));
    }
}
