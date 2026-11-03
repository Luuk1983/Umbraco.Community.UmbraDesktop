using System.Text.Json.Nodes;
using Umbraco.Community.UmbraDesktop.PackageSettings;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.PackageSettings;

/// <summary>
/// Holds the merge to RFC 7386, which is what lets two people change different parts of one site
/// setting at once without either losing the other's change.
/// </summary>
public class JsonMergePatchTests
{
    /// <summary>
    /// Merges a patch into a stored document, both given as JSON text, and returns the result as text.
    /// </summary>
    /// <param name="target">The stored document, or null for nothing stored.</param>
    /// <param name="patch">The patch.</param>
    /// <returns>The merged document as compact JSON.</returns>
    private static string Merge(string? target, string patch) =>
        JsonMergePatch.Apply(target is null ? null : JsonNode.Parse(target), JsonNode.Parse(patch))!.ToJsonString();

    /// <summary>A member the patch names is added beside the ones it does not.</summary>
    [Fact]
    public void Adds_a_member_and_keeps_the_others() =>
        Assert.Equal("""{"kept":{"a":true,"b":true}}""", Merge("""{"kept":{"a":true}}""", """{"kept":{"b":true}}"""));

    /// <summary>A null in the patch removes the member, which is how a package takes one entry back.</summary>
    [Fact]
    public void Removes_a_member_set_to_null() =>
        Assert.Equal("""{"kept":{"b":true}}""", Merge("""{"kept":{"a":true,"b":true}}""", """{"kept":{"a":null}}"""));

    /// <summary>A null for a member that is not there is no error, and adds nothing.</summary>
    [Fact]
    public void Ignores_a_null_for_a_missing_member() =>
        Assert.Equal("""{"a":1}""", Merge("""{"a":1}""", """{"b":null}"""));

    /// <summary>An array is a value like any other and is replaced whole, as the RFC says.</summary>
    [Fact]
    public void Replaces_an_array_whole() =>
        Assert.Equal("""{"list":[3]}""", Merge("""{"list":[1,2]}""", """{"list":[3]}"""));

    /// <summary>Nothing stored is merged into as an empty object.</summary>
    [Fact]
    public void Treats_nothing_stored_as_an_empty_object() =>
        Assert.Equal("""{"a":{"b":1}}""", Merge(null, """{"a":{"b":1}}"""));

    /// <summary>A stored value that is not an object is replaced by one, as the RFC says.</summary>
    [Fact]
    public void Replaces_a_stored_value_that_is_not_an_object() =>
        Assert.Equal("""{"a":1}""", Merge("[1,2]", """{"a":1}"""));

    /// <summary>The nulls of a nested patch never land in the result, even where nothing was there to remove.</summary>
    [Fact]
    public void Leaves_no_nulls_in_a_new_nested_object() =>
        Assert.Equal("""{"a":{"c":2}}""", Merge("{}", """{"a":{"b":null,"c":2}}"""));

    /// <summary>The patch's own nodes are copied, so the caller can keep using the patch afterwards.</summary>
    [Fact]
    public void Does_not_take_the_patch_s_nodes()
    {
        var patch = JsonNode.Parse("""{"a":{"b":1}}""")!;

        var merged = JsonMergePatch.Apply(null, patch)!;

        Assert.Equal("""{"a":{"b":1}}""", patch.ToJsonString());
        Assert.Equal("""{"a":{"b":1}}""", merged.ToJsonString());
    }
}
