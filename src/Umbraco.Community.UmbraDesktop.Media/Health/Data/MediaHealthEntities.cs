namespace Umbraco.Community.UmbraDesktop.Media.Health.Data;

/// <summary>One check's row: when, who, where it is, and its counts once done.</summary>
/// <remarks>
/// Classes with settable properties rather than records, as EF Core tracks entities: it sets
/// properties on materialisation and detects changes by comparing them. The records in
/// <c>MediaHealthModels.cs</c> are what leaves the store.
/// </remarks>
public class MediaHealthCheckEntity
{
    /// <summary>The check's number, higher for later checks.</summary>
    public int Id { get; set; }

    /// <summary>When it started.</summary>
    public DateTime StartedUtc { get; set; }

    /// <summary>When it last said anything: started, progressed, finished. What staleness counts from.</summary>
    public DateTime TouchedUtc { get; set; }

    /// <summary>When it finished or failed.</summary>
    public DateTime? FinishedUtc { get; set; }

    /// <summary>Where it is, as <see cref="MediaHealthPhase"/>'s name.</summary>
    public string Phase { get; set; } = string.Empty;

    /// <summary>What the phase has done so far.</summary>
    public int Scanned { get; set; }

    /// <summary>What the phase has to do; 0 when not known.</summary>
    public int Total { get; set; }

    /// <summary>Why it failed, when it did.</summary>
    public string? Error { get; set; }

    /// <summary>Who pressed Check.</summary>
    public Guid? StartedBy { get; set; }

    /// <summary>How many items it found.</summary>
    public int Items { get; set; }

    /// <summary>How many folders.</summary>
    public int Folders { get; set; }

    /// <summary>How many orphaned files.</summary>
    public int Orphans { get; set; }

    /// <summary>The items' size together.</summary>
    public long SizeBytes { get; set; }

    /// <summary>The orphaned files' size together.</summary>
    public long OrphanBytes { get; set; }
}

/// <summary>One item of a check; see <see cref="MediaHealthItem"/>.</summary>
public class MediaHealthItemEntity
{
    /// <summary>The row.</summary>
    public long Id { get; set; }

    /// <summary>The check it belongs to.</summary>
    public int CheckId { get; set; }

    /// <summary>The item's key.</summary>
    public Guid Key { get; set; }

    /// <summary>Its name.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Its media type's alias.</summary>
    public string MediaTypeAlias { get; set; } = string.Empty;

    /// <summary>Its file's extension, when it has one.</summary>
    public string? Extension { get; set; }

    /// <summary>Its file's size, when it has one.</summary>
    public long? SizeBytes { get; set; }

    /// <summary>The folder it is in, or null at the root.</summary>
    public Guid? ParentKey { get; set; }

    /// <summary>The names path of the folder it is in.</summary>
    public string Path { get; set; } = string.Empty;

    /// <summary>How many pages are placed on it.</summary>
    public int UsageCount { get; set; }

    /// <summary>Its first owned file, as stored, for thumbnails and the preview.</summary>
    public string? Url { get; set; }

    /// <summary>Its width in pixels, when it has one.</summary>
    public int? Width { get; set; }

    /// <summary>Its height in pixels, when it has one.</summary>
    public int? Height { get; set; }

    /// <summary>When it was last changed.</summary>
    public DateTime UpdatedUtc { get; set; }

    /// <summary>
    /// Whether a Clean up has put the item in the recycle bin since the check (design §16.12). The row
    /// stays, so Undo can bring it back with its usage and folder as the check saw them; reads leave it
    /// out until then.
    /// </summary>
    public bool Trashed { get; set; }
}

/// <summary>One folder of a check; see <see cref="MediaHealthFolder"/>.</summary>
public class MediaHealthFolderEntity
{
    /// <summary>The row.</summary>
    public long Id { get; set; }

    /// <summary>The check it belongs to.</summary>
    public int CheckId { get; set; }

    /// <summary>The folder's key.</summary>
    public Guid Key { get; set; }

    /// <summary>Its name.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>The folder it is in, or null at the root.</summary>
    public Guid? ParentKey { get; set; }

    /// <summary>Its names path.</summary>
    public string Path { get; set; } = string.Empty;
}

/// <summary>One orphaned file of a check; see <see cref="MediaHealthOrphan"/>.</summary>
public class MediaHealthOrphanEntity
{
    /// <summary>The row.</summary>
    public long Id { get; set; }

    /// <summary>The check it belongs to.</summary>
    public int CheckId { get; set; }

    /// <summary>The file's path under the media folder.</summary>
    public string RelativePath { get; set; } = string.Empty;

    /// <summary>Where the site serves it.</summary>
    public string Url { get; set; } = string.Empty;

    /// <summary>Its size.</summary>
    public long SizeBytes { get; set; }

    /// <summary>When it was last written.</summary>
    public DateTime LastModifiedUtc { get; set; }
}

/// <summary>
/// One keep; see <c>MediaKeep</c>. Not tied to a check: a keep outlives the check it was made on, and a
/// later check only drops it when its thing is gone.
/// </summary>
public class MediaHealthKeepEntity
{
    /// <summary>The keep's number.</summary>
    public int Id { get; set; }

    /// <summary>The list it was kept from, as <c>MediaKeepKind</c>'s name.</summary>
    public string Kind { get; set; } = string.Empty;

    /// <summary>The item's key or the orphaned file's path.</summary>
    public string Target { get; set; } = string.Empty;

    /// <summary>
    /// What was kept, so a change ends the keep (design §16.6): the item's URL, or the orphaned file's
    /// last-written time in round-trip form. Null for an item without a file.
    /// </summary>
    public string? Fingerprint { get; set; }

    /// <summary>Why it is kept.</summary>
    public string? Note { get; set; }

    /// <summary>When it ends, or null for always.</summary>
    public DateTime? UntilUtc { get; set; }

    /// <summary>Who kept it.</summary>
    public Guid KeptBy { get; set; }

    /// <summary>Their name when they kept it.</summary>
    public string KeptByName { get; set; } = string.Empty;

    /// <summary>When it was kept.</summary>
    public DateTime KeptUtc { get; set; }
}
