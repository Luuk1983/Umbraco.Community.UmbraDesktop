using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Community.UmbraDesktop.PackageSettings;

namespace Umbraco.Community.UmbraDesktop.Tests.PackageSettings;

/// <summary>
/// Builds the validation the store runs, over validators a test hands it, resolved the way the
/// application resolves them: from the service provider by their registered type.
/// </summary>
internal static class TestValidation
{
    /// <summary>
    /// Validation with the given validators registered for their keys.
    /// </summary>
    /// <param name="validators">Each key and the validator registered for it.</param>
    /// <returns>The validation.</returns>
    public static SitePackageSettingsValidation With(params (string Key, ISitePackageSettingsValidator Validator)[] validators)
    {
        var services = new ServiceCollection();
        var registrations = new List<SitePackageSettingsValidatorRegistration>();
        foreach (var (key, validator) in validators)
        {
            // Registered under its own type, one type per validator, as the builder extension does.
            services.AddSingleton(validator.GetType(), validator);
            registrations.Add(new SitePackageSettingsValidatorRegistration(key, validator.GetType()));
        }

        return new SitePackageSettingsValidation(
            registrations,
            services.BuildServiceProvider(),
            NullLogger<SitePackageSettingsValidation>.Instance);
    }
}

/// <summary>
/// A validator that refuses an object with a given member, and records what it was asked to check.
/// </summary>
/// <param name="forbidden">The member it refuses.</param>
internal sealed class RefusingValidator(string forbidden) : ISitePackageSettingsValidator
{
    /// <summary>Every value it was asked to check, as compact JSON, or <c>null</c> for none.</summary>
    public List<string> Seen { get; } = [];

    /// <inheritdoc />
    public IEnumerable<string> Validate(JsonNode? value)
    {
        Seen.Add(value?.ToJsonString() ?? "null");
        return value is JsonObject members && members.ContainsKey(forbidden) ? [$"\"{forbidden}\" is not allowed."] : [];
    }
}

/// <summary>A second validator type, so two registrations for one key are two validators.</summary>
internal sealed class NoNumbersValidator : ISitePackageSettingsValidator
{
    /// <inheritdoc />
    public IEnumerable<string> Validate(JsonNode? value) =>
        value is JsonObject members && members.Any(member => member.Value is JsonValue v && v.TryGetValue<double>(out _))
            ? ["Numbers are not allowed."]
            : [];
}

/// <summary>A validator with a bug in it.</summary>
internal sealed class ThrowingValidator : ISitePackageSettingsValidator
{
    /// <inheritdoc />
    public IEnumerable<string> Validate(JsonNode? value) => throw new InvalidOperationException("Broken.");
}
