using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Guidelines;

/// <summary>
/// Umbraco's key-value store, held in a dictionary, so the guidelines store can be exercised without
/// a database. A copy of Accessories' own, cut to what this store calls.
/// </summary>
internal sealed class InMemoryKeyValueService : IKeyValueService
{
    /// <summary>What has been stored, by key.</summary>
    public Dictionary<string, string> Values { get; } = new();

    /// <inheritdoc />
    public string? GetValue(string key) => Values.GetValueOrDefault(key);

    /// <inheritdoc />
    public IReadOnlyDictionary<string, string?>? FindByKeyPrefix(string keyPrefix) =>
        Values.Where(pair => pair.Key.StartsWith(keyPrefix, StringComparison.Ordinal))
            .ToDictionary(pair => pair.Key, pair => (string?)pair.Value);

    /// <inheritdoc />
    public void SetValue(string key, string value) => Values[key] = value;

    /// <inheritdoc />
    public void SetValue(string key, string originValue, string newValue) => Values[key] = newValue;

    /// <inheritdoc />
    public bool TrySetValue(string key, string originValue, string newValue)
    {
        Values[key] = newValue;
        return true;
    }
}
