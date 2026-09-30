namespace Umbraco.Community.UmbraDesktop.Accessories.StickyNotes;

/// <summary>
/// One note on the shared sticky note board.
/// </summary>
/// <param name="Key">The note's identity, stable across edits.</param>
/// <param name="Text">What the note says.</param>
/// <param name="Colour">Its paper colour, one of <see cref="StickyNoteStore.Colours"/>.</param>
/// <param name="UpdatedBy">The name of whoever last wrote it, so a shared board says who said what.</param>
/// <param name="UpdatedAt">When it was last written.</param>
/// <param name="Version">
/// Moves on by one with every write. An edit names the version it was made against, and one made
/// against anything but the current version is refused rather than allowed to overwrite a change
/// its author never saw.
/// </param>
public sealed record StickyNote(
    Guid Key,
    string Text,
    string Colour,
    string UpdatedBy,
    DateTimeOffset UpdatedAt,
    int Version);

/// <summary>How an edit to a note went.</summary>
public enum StickyNoteWriteStatus
{
    /// <summary>The edit was saved.</summary>
    Saved,

    /// <summary>Somebody else changed the note first; nothing was written.</summary>
    Conflict,

    /// <summary>The note no longer exists.</summary>
    NotFound,
}

/// <summary>An edit's outcome, with the note as it now stands.</summary>
/// <param name="Status">How the edit went.</param>
/// <param name="Note">
/// The note after the edit when saved, the note as somebody else left it on a conflict, and null
/// when it no longer exists.
/// </param>
public sealed record StickyNoteWriteResult(StickyNoteWriteStatus Status, StickyNote? Note);

/// <summary>Thrown when the board already holds <see cref="StickyNoteStore.MaxNotes"/> notes.</summary>
public sealed class StickyNoteBoardFullException()
    : InvalidOperationException($"The sticky note board already holds {StickyNoteStore.MaxNotes} notes.");

/// <summary>
/// Thrown instead of writing when the stored board cannot be read, as after a rollback to a version
/// that does not know a newer storage shape.
/// </summary>
/// <remarks>
/// Reading such a board as empty is fine for showing it. Writing is not: the write would save the
/// empty board over the stored one and every note in it would be gone. Refusing leaves the stored
/// board untouched until a version that can read it is back.
/// </remarks>
/// <param name="inner">Why the board could not be read.</param>
public sealed class StickyNoteBoardUnreadableException(Exception inner)
    : InvalidOperationException("The stored sticky note board cannot be read, so nothing was saved over it.", inner);
