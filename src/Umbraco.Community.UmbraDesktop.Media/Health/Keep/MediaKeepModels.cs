namespace Umbraco.Community.UmbraDesktop.Media.Health.Keep;

/// <summary>
/// The list a keep was made from. Shown in Kept only: a keep takes its thing out of every list, so
/// this never decides what is filtered (plan Decision 6).
/// </summary>
public enum MediaKeepKind
{
    /// <summary>An item no page uses.</summary>
    Unused,

    /// <summary>A file on disk no item owns.</summary>
    Orphaned,

    /// <summary>An image bigger than it needs to be.</summary>
    Oversized,
}

/// <summary>How long a keep lasts, the three choices Keep… offers (design §16.6).</summary>
public enum MediaKeepDuration
{
    /// <summary>Three months from now.</summary>
    ThreeMonths,

    /// <summary>A year from now; the default.</summary>
    Year,

    /// <summary>Until someone stops keeping it, or what was kept is gone or changed.</summary>
    Always,
}

/// <summary>Why a keep has ended, computed when read rather than stored (plan Decision 7).</summary>
public enum MediaKeepEnd
{
    /// <summary>Its time is up.</summary>
    Expired,

    /// <summary>What was kept is no longer what is there: the item's file or the orphaned file changed.</summary>
    Changed,
}

/// <summary>A keep: something marked as wanted, for the whole site, with who, why and until when.</summary>
/// <param name="Id">The keep's number, which Stop keeping names.</param>
/// <param name="Kind">The list it was kept from, for display.</param>
/// <param name="Target">The item's key (<c>D</c> format, lower case) or the orphaned file's normalised relative path.</param>
/// <param name="Note">Why it is kept, or null.</param>
/// <param name="UntilUtc">When it ends, or null to keep it always.</param>
/// <param name="KeptBy">The key of the person who kept it.</param>
/// <param name="KeptByName">Their name when they kept it, so Kept can say who without a user lookup.</param>
/// <param name="KeptUtc">When it was kept.</param>
/// <param name="Ended">Why it has ended, or null while it holds.</param>
public sealed record MediaKeep(
    int Id,
    MediaKeepKind Kind,
    string Target,
    string? Note,
    DateTime? UntilUtc,
    Guid KeptBy,
    string KeptByName,
    DateTime KeptUtc,
    MediaKeepEnd? Ended);
