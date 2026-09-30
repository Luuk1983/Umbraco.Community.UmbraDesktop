using NSubstitute;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.DesktopLabel;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.DesktopLabel;

/// <summary>
/// Exercises how the desktop label's switches are stored and read back.
/// </summary>
/// <remarks>
/// The reading side is the one that matters. The document sits in a table anybody with database
/// access can edit, and it is read on every desktop load, so a value this version does not
/// understand must cost that one field and never the whole label.
/// </remarks>
public class DesktopLabelStoreTests
{
    /// <summary>What the key-value store holds, standing in for Umbraco's table.</summary>
    private string? _stored;

    /// <summary>
    /// Builds a store over an in-memory key-value service.
    /// </summary>
    /// <param name="stored">The raw document to start with, or null for nothing stored.</param>
    /// <returns>The store under test.</returns>
    private DesktopLabelStore Build(string? stored = null)
    {
        _stored = stored;

        var keyValue = Substitute.For<IKeyValueService>();
        keyValue.GetValue(DesktopLabelStore.StorageKey).Returns(_ => _stored);
        keyValue
            .When(service => service.SetValue(DesktopLabelStore.StorageKey, Arg.Any<string>()))
            .Do(call => _stored = call.ArgAt<string>(1));

        return new DesktopLabelStore(keyValue);
    }

    /// <summary>A site that never touched the setting gets it off, top right, with no domain.</summary>
    [Fact]
    public void Reads_off_top_right_and_no_domain_when_nothing_is_stored()
    {
        Assert.Equal(new DesktopLabelSettings(false, DesktopLabelCorner.TopRight, false), Build().Read());
    }

    /// <summary>Every field survives a write and a read.</summary>
    /// <param name="show">Whether the label is drawn.</param>
    /// <param name="corner">The corner.</param>
    /// <param name="showDomain">Whether the domain is written under the name.</param>
    [Theory]
    [InlineData(true, DesktopLabelCorner.TopLeft, false)]
    [InlineData(false, DesktopLabelCorner.BottomLeft, true)]
    [InlineData(true, DesktopLabelCorner.BottomRight, true)]
    [InlineData(true, DesktopLabelCorner.TopRight, true)]
    public void Reads_back_what_it_wrote(bool show, DesktopLabelCorner corner, bool showDomain)
    {
        var store = Build();
        var settings = new DesktopLabelSettings(show, corner, showDomain);

        store.Write(settings);

        Assert.Equal(settings, store.Read());
    }

    /// <summary>
    /// The corner is stored by name.
    /// </summary>
    /// <remarks>
    /// A number would read as nothing to a person looking at the table, and would silently change
    /// meaning if the enum were ever reordered.
    /// </remarks>
    [Fact]
    public void Stores_the_corner_by_name()
    {
        Build().Write(new DesktopLabelSettings(true, DesktopLabelCorner.BottomLeft, false));

        Assert.Contains("\"BottomLeft\"", _stored);
    }

    /// <summary>
    /// A corner this version does not know reads as top right and costs nothing else.
    /// </summary>
    /// <remarks>
    /// The numeric cases matter because <c>Enum.TryParse</c> accepts any number, defined or not,
    /// so "7" would otherwise come back as a corner that does not exist.
    /// </remarks>
    /// <param name="corner">The stored corner, as raw JSON.</param>
    [Theory]
    [InlineData("\"Middle\"")]
    [InlineData("\"7\"")]
    [InlineData("7")]
    [InlineData("null")]
    public void An_unknown_corner_reads_as_top_right_and_keeps_the_rest(string corner)
    {
        var settings = Build($$"""{"Show":true,"Corner":{{corner}},"ShowDomain":true}""").Read();

        Assert.Equal(new DesktopLabelSettings(true, DesktopLabelCorner.TopRight, true), settings);
    }

    /// <summary>A switch that is not a boolean reads as off and costs nothing else.</summary>
    [Fact]
    public void A_switch_of_the_wrong_type_reads_as_off_and_keeps_the_rest()
    {
        var settings = Build("""{"Show":"yes","Corner":"BottomLeft","ShowDomain":true}""").Read();

        Assert.Equal(new DesktopLabelSettings(false, DesktopLabelCorner.BottomLeft, true), settings);
    }

    /// <summary>A document that cannot be read at all reads as the defaults rather than failing.</summary>
    /// <param name="stored">The unreadable document.</param>
    [Theory]
    [InlineData("not json")]
    [InlineData("[]")]
    [InlineData("\"a string\"")]
    [InlineData("")]
    public void An_unreadable_document_reads_as_the_defaults(string stored)
    {
        Assert.Equal(DesktopLabelSettings.Default, Build(stored).Read());
    }
}
