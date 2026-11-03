using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// Runs the validators packages registered for a key against a value before it is stored.
/// </summary>
/// <param name="registrations">Every validator registration packages made.</param>
/// <param name="services">Where the validators are resolved from.</param>
/// <param name="logger">Where a validator that throws is reported.</param>
public sealed class SitePackageSettingsValidation(
    IEnumerable<SitePackageSettingsValidatorRegistration> registrations,
    IServiceProvider services,
    ILogger<SitePackageSettingsValidation> logger)
{
    /// <summary>
    /// What a person is told when a validator throws. Plain, because the exception is the package
    /// author's to read, in the log, not the editor's.
    /// </summary>
    public const string CouldNotCheck = "The value could not be checked.";

    /// <summary>The registrations, read once: they are fixed when the application composes.</summary>
    private readonly IReadOnlyList<SitePackageSettingsValidatorRegistration> _registrations = registrations.ToList();

    /// <summary>
    /// Why a value may not be stored under a key.
    /// </summary>
    /// <remarks>
    /// Every validator for the key is run and every reason kept, so a person sees all of them at
    /// once rather than one per attempt. A validator that throws refuses the value: letting it
    /// through would store something nobody checked, and failing the request would look to the
    /// browser like the network, which it answers by sending the change again.
    /// </remarks>
    /// <param name="key">The package key.</param>
    /// <param name="value">The whole value as it would be stored, null for the JSON literal <c>null</c>.</param>
    /// <returns>The reasons, in registration order. Empty when it may be stored.</returns>
    public IReadOnlyList<string> Problems(string key, JsonNode? value)
    {
        var problems = new List<string>();
        foreach (var registration in _registrations)
        {
            if (!string.Equals(registration.Key, key, StringComparison.OrdinalIgnoreCase)) continue;

            try
            {
                var validator = (ISitePackageSettingsValidator)services.GetRequiredService(registration.ValidatorType);
                problems.AddRange(validator.Validate(value));
            }
            catch (Exception exception)
            {
                logger.LogError(
                    exception,
                    "The site settings validator {Validator} for {Key} threw, so the value was refused.",
                    registration.ValidatorType.FullName,
                    key);
                if (!problems.Contains(CouldNotCheck)) problems.Add(CouldNotCheck);
            }
        }

        return problems;
    }
}
