namespace Umbraco.Community.UmbraDesktop.Accessories.StickyNotes;

/// <summary>
/// The whole board, as the Sticky Notes window loads it.
/// </summary>
/// <param name="Notes">Every note, in the order they were added.</param>
/// <param name="MaxTextLength">
/// The most text a note keeps. Sent with the board so the window's own limit is the server's number
/// rather than a copy of it in another language that could drift.
/// </param>
/// <param name="MaxNotes">The most notes the board holds, for the same reason.</param>
/// <param name="Colours">The paper colours on offer, the first being the default.</param>
public sealed record StickyNoteBoardResponseModel(
    IReadOnlyList<StickyNoteResponseModel> Notes,
    int MaxTextLength,
    int MaxNotes,
    IReadOnlyList<string> Colours);

/// <summary>One note, as the API returns it.</summary>
/// <param name="Key">The note's identity.</param>
/// <param name="Text">What it says.</param>
/// <param name="Colour">Its paper colour.</param>
/// <param name="UpdatedBy">Who last wrote it.</param>
/// <param name="UpdatedAt">When.</param>
/// <param name="Version">The version to send back with an edit.</param>
public sealed record StickyNoteResponseModel(
    Guid Key,
    string Text,
    string Colour,
    string UpdatedBy,
    DateTimeOffset UpdatedAt,
    int Version)
{
    /// <summary>The API's view of a stored note.</summary>
    /// <param name="note">The stored note.</param>
    /// <returns>The response model.</returns>
    public static StickyNoteResponseModel From(StickyNote note) =>
        new(note.Key, note.Text, note.Colour, note.UpdatedBy, note.UpdatedAt, note.Version);
}

/// <summary>A new note. No author field: the author is whoever is logged in.</summary>
/// <param name="Text">What it says.</param>
/// <param name="Colour">Its paper colour.</param>
public sealed record CreateStickyNoteRequestModel(string Text, string Colour);

/// <summary>An edit to a note.</summary>
/// <param name="Text">What it now says.</param>
/// <param name="Colour">Its paper colour.</param>
/// <param name="Version">The version the edit was made against, which must still be the current one.</param>
public sealed record UpdateStickyNoteRequestModel(string Text, string Colour, int Version);

/// <summary>Where to move a note: before another, or at the end when <paramref name="Before"/> is null.</summary>
/// <param name="Before">The note it should go before, or null for the end of the board.</param>
public sealed record MoveStickyNoteRequestModel(Guid? Before);
