using System.Text.Json.Nodes;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.PackageSettings;

/// <summary>
/// Exercises how the validators packages register for a key are run against a value before it is
/// stored.
/// </summary>
public class SitePackageSettingsValidationTests
{
    /// <summary>A key with no validator takes any value, as before validators existed.</summary>
    [Fact]
    public void Takes_anything_for_a_key_without_a_validator() =>
        Assert.Empty(TestValidation.With().Problems("My.Package", JsonNode.Parse("""{"bad":1}""")));

    /// <summary>A key's validator decides, and its reasons are returned as it wrote them.</summary>
    [Fact]
    public void Returns_the_validator_s_reasons()
    {
        var validation = TestValidation.With(("My.Package", new RefusingValidator("bad")));

        Assert.Equal(["\"bad\" is not allowed."], validation.Problems("My.Package", JsonNode.Parse("""{"bad":1}""")));
        Assert.Empty(validation.Problems("My.Package", JsonNode.Parse("""{"good":1}""")));
    }

    /// <summary>A validator registered for its key matches it ignoring case, as the stored row does.</summary>
    [Fact]
    public void Matches_the_key_ignoring_case() =>
        Assert.NotEmpty(TestValidation.With(("My.Package", new RefusingValidator("bad")))
            .Problems("MY.PACKAGE", JsonNode.Parse("""{"bad":1}""")));

    /// <summary>Another key's validator is not run.</summary>
    [Fact]
    public void Ignores_other_keys_validators() =>
        Assert.Empty(TestValidation.With(("Other.Package", new RefusingValidator("bad")))
            .Problems("My.Package", JsonNode.Parse("""{"bad":1}""")));

    /// <summary>Every validator for a key is run, and every reason given, so a person sees all of them at once.</summary>
    [Fact]
    public void Runs_every_validator_for_the_key()
    {
        var validation = TestValidation.With(
            ("My.Package", new RefusingValidator("bad")),
            ("My.Package", new NoNumbersValidator()));

        Assert.Equal(
            ["\"bad\" is not allowed.", "Numbers are not allowed."],
            validation.Problems("My.Package", JsonNode.Parse("""{"bad":1}""")));
    }

    /// <summary>
    /// A validator that throws refuses the value, rather than letting it through unchecked or failing
    /// the request with a 500 the browser would take for a network failure and send again.
    /// </summary>
    [Fact]
    public void Refuses_when_a_validator_throws()
    {
        var problems = TestValidation.With(("My.Package", new ThrowingValidator()))
            .Problems("My.Package", JsonNode.Parse("{}"));

        Assert.Equal(["The value could not be checked."], problems);
    }

    /// <summary>Nothing stored, or the JSON literal null, reaches the validator as null.</summary>
    [Fact]
    public void Hands_a_null_value_through()
    {
        var validator = new RefusingValidator("bad");

        TestValidation.With(("My.Package", validator)).Problems("My.Package", null);

        Assert.Equal(["null"], validator.Seen);
    }
}
