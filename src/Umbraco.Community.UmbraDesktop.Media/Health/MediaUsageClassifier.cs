namespace Umbraco.Community.UmbraDesktop.Media.Health;

/// <summary>
/// Which pages a media item is placed on, from Umbraco's tracked relations (design §15).
/// </summary>
/// <remarks>
/// <para>
/// Umbraco records a <c>umbMedia</c> relation from a page to each media item its properties pick, at
/// save time, through each editor's value references. That is the fast signal: one query for the
/// whole site, and it is what the Media section's own Referenced by box reads too.
/// </para>
/// <para>
/// A property can pick a whole folder (a gallery that renders what is inside it), and Umbraco then
/// relates the folder and never its files. So an item nothing is placed on counts the pages placed on
/// any folder above it, at any depth. The rule ProWorks MediaAudit found; without it every file in
/// such a folder would read as unused and could be trashed while the site shows it.
/// </para>
/// <para>
/// Pure: ids in, counts out, so the rule is tested without a database and the reader stays about
/// reading.
/// </para>
/// </remarks>
internal static class MediaUsageClassifier
{
    /// <summary>
    /// Count the distinct pages placed on each subject: on the item itself, or, when none is, on the
    /// folders above it.
    /// </summary>
    /// <param name="subjects">The items to classify.</param>
    /// <param name="relations">Every page-to-media relation on the site.</param>
    /// <returns>Each subject's id to its count; every subject is in it.</returns>
    public static IReadOnlyDictionary<int, int> Classify(IReadOnlyList<MediaUsageSubject> subjects, IEnumerable<MediaRelation> relations)
    {
        var pagesByMedia = new Dictionary<int, HashSet<int>>();
        foreach (var relation in relations)
        {
            if (!pagesByMedia.TryGetValue(relation.MediaId, out var pages))
            {
                pages = [];
                pagesByMedia[relation.MediaId] = pages;
            }

            pages.Add(relation.ContentId);
        }

        var counts = new Dictionary<int, int>(subjects.Count);
        foreach (var subject in subjects)
        {
            if (pagesByMedia.TryGetValue(subject.Id, out var own) && own.Count > 0)
            {
                counts[subject.Id] = own.Count;
                continue;
            }

            var inherited = new HashSet<int>();
            foreach (var ancestor in subject.AncestorIds)
            {
                if (pagesByMedia.TryGetValue(ancestor, out var pages))
                {
                    inherited.UnionWith(pages);
                }
            }

            counts[subject.Id] = inherited.Count;
        }

        return counts;
    }
}
