using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// A stand-in for Umbraco's key/value store that keeps values in memory.
/// </summary>
/// <remarks>
/// A fake rather than a mock because everything built on the key/value store is about what comes
/// back after a write, which a mock would have to be told and would therefore never actually test.
/// </remarks>
internal sealed class InMemoryKeyValueService : IKeyValueService
{
    /// <summary>The stored values, keyed case-insensitively the way Umbraco's own implementation is.</summary>
    private readonly Dictionary<string, string> _values = new(StringComparer.OrdinalIgnoreCase);

    /// <inheritdoc />
    public string? GetValue(string key) => _values.TryGetValue(key, out var value) ? value : null;

    /// <inheritdoc />
    public IReadOnlyDictionary<string, string?>? FindByKeyPrefix(string keyPrefix) =>
        _values
            .Where(pair => pair.Key.StartsWith(keyPrefix, StringComparison.OrdinalIgnoreCase))
            .ToDictionary(pair => pair.Key, pair => (string?)pair.Value);

    /// <inheritdoc />
    public void SetValue(string key, string value) => _values[key] = value;

    /// <inheritdoc />
    public void SetValue(string key, string originValue, string newValue)
    {
        if (TrySetValue(key, originValue, newValue) is false)
        {
            throw new InvalidOperationException($"Value for '{key}' was not '{originValue}'.");
        }
    }

    /// <inheritdoc />
    public bool TrySetValue(string key, string originValue, string newValue)
    {
        if (GetValue(key) != originValue)
        {
            return false;
        }

        _values[key] = newValue;
        return true;
    }
}
