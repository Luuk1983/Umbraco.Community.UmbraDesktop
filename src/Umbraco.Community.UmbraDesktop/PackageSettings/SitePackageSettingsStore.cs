using System.Text.Json;
using System.Text.Json.Nodes;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// Keeps site-wide package settings in Umbraco's key-value store, one row per package key.
/// </summary>
/// <remarks>
/// The key-value store rather than a table of the package's own, the way the desktop label and the
/// app identity are kept: it is one value per key, read only when someone asks, and core already
/// owns its schema and its lock.
/// </remarks>
/// <param name="keyValueService">Umbraco's key-value store.</param>
/// <param name="scopeProvider">Opens the scope a patch holds core's key-value lock in.</param>
/// <param name="validation">Runs the package's validators on a value before it is stored.</param>
public sealed class SitePackageSettingsStore(
    IKeyValueService keyValueService,
    ICoreScopeProvider scopeProvider,
    SitePackageSettingsValidation validation) : ISitePackageSettingsStore
{
    /// <summary>
    /// The longest value kept, in characters.
    /// </summary>
    /// <remarks>
    /// A guard against a package writing without bound into a row everyone who reads it downloads,
    /// not a size to design to: the column itself is <c>nvarchar(max)</c>. One mebibyte holds a
    /// reviewed flag, <c>"&lt;guid&gt;":true,</c> at 44 characters, for over twenty thousand media
    /// items, the largest use foreseen.
    /// </remarks>
    public const int MaxValueLength = 1024 * 1024;

    /// <inheritdoc />
    public string? Read(string key) => keyValueService.GetValue(SitePackageSettingsKey.StorageKey(key));

    /// <inheritdoc />
    public SitePackageSettingsWriteResult Replace(string key, string value)
    {
        var problems = Problems(key, value, Parse(value));
        if (problems.Count > 0) return SitePackageSettingsWriteResult.Refused(problems);

        keyValueService.SetValue(SitePackageSettingsKey.StorageKey(key), value);
        return SitePackageSettingsWriteResult.Stored(value);
    }

    /// <inheritdoc />
    /// <remarks>
    /// The read and the write sit inside one scope holding core's key-value write lock, which the
    /// key-value service's own calls join. The lock is the database's, so two people patching at the
    /// same moment are merged one after the other on any number of servers, and the validators see
    /// the value that would really be stored, with the other person's change in it. Core's
    /// <c>TrySetValue</c> would do as a compare-and-set, but it cannot create a row, and the first
    /// write of every key is a create.
    /// </remarks>
    public SitePackageSettingsWriteResult Patch(string key, string patch)
    {
        var storageKey = SitePackageSettingsKey.StorageKey(key);
        using var scope = scopeProvider.CreateCoreScope();
        scope.WriteLock(Constants.Locks.KeyValues);

        var node = JsonMergePatch.Apply(Parse(keyValueService.GetValue(storageKey)), JsonNode.Parse(patch));
        var merged = node!.ToJsonString();
        var problems = Problems(key, merged, node);
        if (problems.Count > 0) return SitePackageSettingsWriteResult.Refused(problems);

        keyValueService.SetValue(storageKey, merged);
        scope.Complete();
        return SitePackageSettingsWriteResult.Stored(merged);
    }

    /// <summary>
    /// Why a value may not be stored: too long, or refused by the package's validators.
    /// </summary>
    /// <remarks>The length first, so a validator is never handed a value that could not be stored anyway.</remarks>
    /// <param name="key">The package key.</param>
    /// <param name="text">The value as it would be stored.</param>
    /// <param name="value">The same value, parsed.</param>
    /// <returns>The reasons, or none.</returns>
    private IReadOnlyList<string> Problems(string key, string text, JsonNode? value) =>
        text.Length > MaxValueLength
            ? [$"The value would be longer than {MaxValueLength} characters."]
            : validation.Problems(key, value);

    /// <summary>
    /// Parses a stored value, tolerating one that is not JSON.
    /// </summary>
    /// <param name="raw">The stored text, or null.</param>
    /// <returns>The value, or null when nothing readable is stored, which the merge treats as empty.</returns>
    private static JsonNode? Parse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try
        {
            return JsonNode.Parse(raw);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
