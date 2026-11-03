using NSubstitute;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Community.UmbraDesktop.PackageSettings;
using Umbraco.Community.UmbraDesktop.Tests.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.PackageSettings;

/// <summary>
/// Exercises where site-wide package settings are kept: one key-value row per package key.
/// </summary>
public class SitePackageSettingsStoreTests
{
    /// <summary>The key-value store the rows land in.</summary>
    private readonly InMemoryKeyValueService _keyValues = new();

    /// <summary>The scope the merge runs in, so a test can see the lock being taken.</summary>
    private readonly ICoreScope _scope = Substitute.For<ICoreScope>();

    /// <summary>
    /// Builds the store over the in-memory key-value store, with a validator on <c>My.Package</c>
    /// that refuses a <c>"bad"</c> member.
    /// </summary>
    /// <returns>The store under test.</returns>
    private SitePackageSettingsStore Build()
    {
        var scopes = Substitute.For<ICoreScopeProvider>();
        scopes.CreateCoreScope().ReturnsForAnyArgs(_scope);
        return new SitePackageSettingsStore(_keyValues, scopes, TestValidation.With(("My.Package", new RefusingValidator("bad"))));
    }

    /// <summary>Nothing stored reads as null, so the browser can tell it from a stored empty value.</summary>
    [Fact]
    public void Reads_nothing_stored_as_null() => Assert.Null(Build().Read("My.Package"));

    /// <summary>A replaced value reads back exactly as it was given.</summary>
    [Fact]
    public void Reads_back_a_replaced_value()
    {
        var store = Build();

        store.Replace("My.Package", """{"greeting":"Hi"}""");

        Assert.Equal("""{"greeting":"Hi"}""", store.Read("My.Package"));
    }

    /// <summary>
    /// The row is namespaced and lowercased, so it can collide with nothing else in the flat
    /// key-value table and one key means one row on every database.
    /// </summary>
    [Fact]
    public void Stores_under_the_package_settings_prefix_in_lower_case()
    {
        Build().Replace("My.Package", "1");

        Assert.Equal("1", _keyValues.GetValue(SitePackageSettingsKey.Prefix + "my.package"));
    }

    /// <summary>
    /// Keys compare ignoring case. SQL Server's key-value table already does, SQLite's does not, and
    /// a setting must not be one thing on one database and two on the other.
    /// </summary>
    [Fact]
    public void Treats_keys_that_differ_only_in_case_as_one()
    {
        var store = Build();

        store.Replace("My.Package", "1");

        Assert.Equal("1", store.Read("MY.PACKAGE"));
    }

    /// <summary>A patch merges into what is stored and returns the merged value.</summary>
    [Fact]
    public void Merges_a_patch_into_the_stored_value()
    {
        var store = Build();
        store.Replace("My.Package", """{"kept":{"a":true}}""");

        var merged = store.Patch("My.Package", """{"kept":{"b":true}}""");

        Assert.Equal("""{"kept":{"a":true,"b":true}}""", merged.Value);
        Assert.Empty(merged.Problems);
        Assert.Equal(merged.Value, store.Read("My.Package"));
    }

    /// <summary>A patch is a valid first write, with nothing stored yet.</summary>
    [Fact]
    public void Merges_a_patch_into_nothing()
    {
        var merged = Build().Patch("My.Package", """{"kept":{"a":true}}""");

        Assert.Equal("""{"kept":{"a":true}}""", merged.Value);
    }

    /// <summary>
    /// The read and the write of a patch happen under core's key-value write lock, in one completed
    /// scope, so two people patching at once on any number of servers are merged one after the
    /// other rather than one overwriting the other.
    /// </summary>
    [Fact]
    public void Patches_under_the_key_value_write_lock()
    {
        Build().Patch("My.Package", """{"a":1}""");

        Received.InOrder(() =>
        {
            _scope.WriteLock(Constants.Locks.KeyValues);
            _scope.Complete();
        });
    }

    /// <summary>A replace the validator refuses stores nothing and says why.</summary>
    [Fact]
    public void Refuses_a_replace_the_validator_refuses()
    {
        var store = Build();

        var result = store.Replace("My.Package", """{"bad":1}""");

        Assert.Null(result.Value);
        Assert.Equal(["\"bad\" is not allowed."], result.Problems);
        Assert.Null(store.Read("My.Package"));
    }

    /// <summary>
    /// A patch the validator refuses stores nothing, and its scope is not completed, so nothing it did
    /// inside the lock is kept.
    /// </summary>
    [Fact]
    public void Refuses_a_patch_the_validator_refuses()
    {
        var store = Build();
        store.Replace("My.Package", """{"a":1}""");

        var result = store.Patch("My.Package", """{"bad":1}""");

        Assert.Equal(["\"bad\" is not allowed."], result.Problems);
        Assert.Equal("""{"a":1}""", store.Read("My.Package"));
        _scope.DidNotReceive().Complete();
    }

    /// <summary>A value over the limit is refused with a reason, whole or grown by a patch.</summary>
    [Fact]
    public void Refuses_a_value_over_the_limit()
    {
        var store = Build();
        var longString = new string('a', SitePackageSettingsStore.MaxValueLength);

        var replace = store.Replace("Other.Package", $"\"{longString}\"");
        var patch = store.Patch("Other.Package", $$"""{"a":"{{longString}}"}""");

        Assert.Single(replace.Problems);
        Assert.Single(patch.Problems);
        Assert.Null(store.Read("Other.Package"));
    }
}
