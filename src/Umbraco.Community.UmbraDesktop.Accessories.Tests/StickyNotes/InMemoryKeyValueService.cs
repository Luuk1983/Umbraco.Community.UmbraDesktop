using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Accessories.Tests.StickyNotes;

/// <summary>
/// Umbraco's key-value store, held in a dictionary, so the sticky note store can be exercised
/// without a database.
/// </summary>
internal sealed class InMemoryKeyValueService : IKeyValueService
{
    /// <summary>What has been stored, by key.</summary>
    public Dictionary<string, string> Values { get; } = new();

    /// <summary>
    /// Every read and plain write, in order, shared with a recording scope provider so a test can
    /// check they happen inside the database lock rather than before it.
    /// </summary>
    public List<string> Calls { get; init; } = [];

    /// <inheritdoc />
    public string? GetValue(string key)
    {
        Calls.Add("get");
        return Values.GetValueOrDefault(key);
    }

    /// <inheritdoc />
    public IReadOnlyDictionary<string, string?>? FindByKeyPrefix(string keyPrefix) =>
        Values.Where(pair => pair.Key.StartsWith(keyPrefix, StringComparison.Ordinal))
            .ToDictionary(pair => pair.Key, pair => (string?)pair.Value);

    /// <inheritdoc />
    public void SetValue(string key, string value)
    {
        Calls.Add("set");
        Values[key] = value;
    }

    /// <inheritdoc />
    public void SetValue(string key, string originValue, string newValue)
    {
        if (GetValue(key) != originValue)
        {
            throw new InvalidOperationException("The value changed underneath the caller.");
        }

        Values[key] = newValue;
    }

    /// <inheritdoc />
    public bool TrySetValue(string key, string originValue, string newValue)
    {
        if (GetValue(key) != originValue)
        {
            return false;
        }

        Values[key] = newValue;
        return true;
    }
}
