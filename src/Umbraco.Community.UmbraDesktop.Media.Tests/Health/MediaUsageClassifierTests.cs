using Umbraco.Community.UmbraDesktop.Media.Health;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>
/// Which media items a page is placed on, from Umbraco's tracked relations (design §15): an item is
/// used by every page related to it, or, when no page is related to it, by every page related to a
/// folder above it, since a picker that takes a whole folder relates the folder and never its files.
/// </summary>
public class MediaUsageClassifierTests
{
    /// <summary>An item a page is placed on counts that page; a second placement of the same page counts once.</summary>
    [Fact]
    public void Counts_the_distinct_pages_related_to_an_item()
    {
        var usage = MediaUsageClassifier.Classify(
            [new MediaUsageSubject(11, [10]), new MediaUsageSubject(12, [10])],
            [new MediaRelation(100, 11), new MediaRelation(101, 11), new MediaRelation(100, 11)]);

        Assert.Equal(2, usage[11]);
        Assert.Equal(0, usage[12]);
    }

    /// <summary>An item nothing is placed on counts the pages placed on a folder above it, at any depth.</summary>
    [Fact]
    public void Falls_back_to_the_folders_above_an_item()
    {
        var usage = MediaUsageClassifier.Classify(
            [new MediaUsageSubject(11, [10, 20]), new MediaUsageSubject(12, [10, 21])],
            [new MediaRelation(100, 10), new MediaRelation(101, 20)]);

        Assert.Equal(2, usage[11]);
        Assert.Equal(1, usage[12]);
    }

    /// <summary>The folders above only count when nothing is placed on the item itself, as MediaAudit decides it.</summary>
    [Fact]
    public void Prefers_the_item_s_own_pages_over_its_folders()
    {
        var usage = MediaUsageClassifier.Classify(
            [new MediaUsageSubject(11, [10])],
            [new MediaRelation(100, 11), new MediaRelation(101, 10), new MediaRelation(102, 10)]);

        Assert.Equal(1, usage[11]);
    }

    /// <summary>Every subject gets an answer, so a caller never looks one up and misses.</summary>
    [Fact]
    public void Answers_for_every_subject_even_with_no_relations()
    {
        var usage = MediaUsageClassifier.Classify([new MediaUsageSubject(11, []), new MediaUsageSubject(12, [])], []);

        Assert.Equal(new Dictionary<int, int> { [11] = 0, [12] = 0 }, usage);
    }
}
