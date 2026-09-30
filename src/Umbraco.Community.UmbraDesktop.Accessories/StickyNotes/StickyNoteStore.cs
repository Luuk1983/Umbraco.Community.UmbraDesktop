using System.Text.Json;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Accessories.StickyNotes;

/// <summary>
/// The shared sticky note board: one list of notes every desktop user reads and writes.
/// </summary>
/// <remarks>
/// <para>
/// Stored as one JSON document in Umbraco's key-value store, the way the host package stores its
/// desktop connections. No table and no migration: the board is small by construction (see
/// <see cref="MaxNotes"/>), and a row in <c>umbracoKeyValue</c> travels with a database backup and
/// restore like any other site data.
/// </para>
/// <para>
/// Every write is a read-modify-write inside one Umbraco scope holding the key-value write lock, from
/// before the read until after the write. That lock is a database lock, so it serialises writers on
/// every server of a load-balanced site as well as on one: without it, two servers could read the
/// same board and the later write would erase a note the earlier one had just added. Umbraco's own
/// <c>SetValue</c> takes the same lock inside the scope it joins.
/// </para>
/// <para>
/// A board this version cannot read is shown as empty, but never written over: see
/// <see cref="StickyNoteBoardUnreadableException"/>.
/// </para>
/// </remarks>
public sealed class StickyNoteStore(IKeyValueService keyValueService, ICoreScopeProvider scopeProvider, TimeProvider timeProvider)
{
    /// <summary>The key-value store key holding the board.</summary>
    public const string StorageKey = "Umbraco.Community.UmbraDesktop.Accessories.StickyNotes";

    /// <summary>
    /// The most text one note keeps. A note is a scribble; this is a few paragraphs, and the ceiling
    /// is what keeps <see cref="MaxNotes"/> notes inside a sensible single row. Sent to the client
    /// with the board, so the window's own limit is this number rather than a copy of it.
    /// </summary>
    public const int MaxTextLength = 2000;

    /// <summary>The most notes the board holds. A noticeboard with more than this is a document.</summary>
    public const int MaxNotes = 100;

    /// <summary>
    /// The paper colours on offer, the first being the default. Windows 7's Sticky Notes offered
    /// six and these are five of them; the window draws each one, the server only checks the name.
    /// </summary>
    public static readonly IReadOnlyList<string> Colours = ["yellow", "green", "pink", "purple", "blue"];

    /// <summary>JSON shape of the stored board. Web defaults, so the stored document reads like the API.</summary>
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Every note, in the order they were added.</summary>
    /// <returns>The board.</returns>
    public IReadOnlyList<StickyNote> GetAll() => Read();

    /// <summary>Add a note to the board.</summary>
    /// <param name="text">What it says. Cut to <see cref="MaxTextLength"/>.</param>
    /// <param name="colour">Its colour; an unknown one becomes the default.</param>
    /// <param name="author">Who wrote it.</param>
    /// <returns>The new note.</returns>
    /// <exception cref="StickyNoteBoardFullException">The board already holds <see cref="MaxNotes"/> notes.</exception>
    public StickyNote Create(string text, string colour, string author)
    {
        using (var scope = BeginWrite())
        {
            var notes = ReadForWrite().ToList();
            if (notes.Count >= MaxNotes)
            {
                throw new StickyNoteBoardFullException();
            }

            var note = new StickyNote(
                Guid.NewGuid(), Clean(text), CleanColour(colour), author, timeProvider.GetUtcNow(), 1);
            notes.Add(note);
            Write(notes, scope);
            return note;
        }
    }

    /// <summary>Change a note, provided nobody else has changed it since the editor read it.</summary>
    /// <param name="key">The note.</param>
    /// <param name="text">What it now says.</param>
    /// <param name="colour">Its colour.</param>
    /// <param name="expectedVersion">The version the edit was made against.</param>
    /// <param name="author">Who is writing.</param>
    /// <returns>How it went, with the note as it now stands.</returns>
    public StickyNoteWriteResult Update(Guid key, string text, string colour, int expectedVersion, string author)
    {
        using (var scope = BeginWrite())
        {
            var notes = ReadForWrite().ToList();
            var index = notes.FindIndex(note => note.Key == key);
            if (index < 0)
            {
                return new StickyNoteWriteResult(StickyNoteWriteStatus.NotFound, null);
            }

            var current = notes[index];
            if (current.Version != expectedVersion)
            {
                return new StickyNoteWriteResult(StickyNoteWriteStatus.Conflict, current);
            }

            var updated = current with
            {
                Text = Clean(text),
                Colour = CleanColour(colour),
                UpdatedBy = author,
                UpdatedAt = timeProvider.GetUtcNow(),
                Version = current.Version + 1,
            };
            notes[index] = updated;
            Write(notes, scope);
            return new StickyNoteWriteResult(StickyNoteWriteStatus.Saved, updated);
        }
    }

    /// <summary>Take a note off the board.</summary>
    /// <param name="key">The note.</param>
    /// <returns>Whether there was a note to take off.</returns>
    public bool Delete(Guid key)
    {
        using (var scope = BeginWrite())
        {
            var notes = ReadForWrite().ToList();
            var removed = notes.RemoveAll(note => note.Key == key) > 0;
            if (removed)
            {
                Write(notes, scope);
            }

            return removed;
        }
    }

    /// <summary>Move a note to sit before another, which is how the board is reordered.</summary>
    /// <remarks>
    /// Named by the note it goes before, not by a position, so a note someone else adds or deletes in
    /// the meantime cannot make it land somewhere the mover did not mean. The note itself is left as
    /// it was, version and author included: moving is not editing, and somebody typing in the note
    /// while it is moved must not get a conflict for it.
    /// </remarks>
    /// <param name="key">The note to move.</param>
    /// <param name="before">The note it should go before, or null for the end of the board. A note
    /// that has since been deleted also means the end.</param>
    /// <returns>Whether there was a note to move.</returns>
    public bool Move(Guid key, Guid? before)
    {
        using (var scope = BeginWrite())
        {
            var notes = ReadForWrite().ToList();
            var index = notes.FindIndex(note => note.Key == key);
            if (index < 0)
            {
                return false;
            }

            var note = notes[index];
            notes.RemoveAt(index);
            var target = before is null ? -1 : notes.FindIndex(other => other.Key == before);
            notes.Insert(target < 0 ? notes.Count : target, note);
            Write(notes, scope);
            return true;
        }
    }

    /// <summary>Cut text to the limit.</summary>
    /// <param name="text">The text as sent.</param>
    /// <returns>The text as stored.</returns>
    private static string Clean(string? text) =>
        text is null ? string.Empty : text.Length > MaxTextLength ? text[..MaxTextLength] : text;

    /// <summary>A colour the board offers, or the default.</summary>
    /// <param name="colour">The colour as sent.</param>
    /// <returns>The colour as stored.</returns>
    private static string CleanColour(string? colour) =>
        colour is not null && Colours.Contains(colour) ? colour : Colours[0];

    /// <summary>
    /// Read the board. A payload this version cannot read is an empty board rather than an exception,
    /// because an exception here would take the whole app down on every request until somebody edited
    /// the database by hand.
    /// </summary>
    /// <returns>The notes.</returns>
    private IReadOnlyList<StickyNote> Read()
    {
        var raw = keyValueService.GetValue(StorageKey);
        if (string.IsNullOrEmpty(raw))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<StickyNote>>(raw, Json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>
    /// Read the board to change it. Unlike <see cref="Read"/>, a payload that cannot be read stops the
    /// write, because the change would be saved over it and every note in it would be gone.
    /// </summary>
    /// <returns>The notes.</returns>
    /// <exception cref="StickyNoteBoardUnreadableException">The stored board cannot be read.</exception>
    private IReadOnlyList<StickyNote> ReadForWrite()
    {
        var raw = keyValueService.GetValue(StorageKey);
        if (string.IsNullOrEmpty(raw))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<StickyNote>>(raw, Json) ?? [];
        }
        catch (JsonException exception)
        {
            throw new StickyNoteBoardUnreadableException(exception);
        }
    }

    /// <summary>
    /// Open the scope one read-modify-write happens in, holding the key-value write lock before
    /// anything is read. A scope that is disposed without <see cref="Write"/> having completed it, as
    /// when a note is not found or the board is unreadable, simply writes nothing.
    /// </summary>
    /// <returns>The scope, for the caller to dispose.</returns>
    private ICoreScope BeginWrite()
    {
        var scope = scopeProvider.CreateCoreScope();
        scope.WriteLock(Constants.Locks.KeyValues);
        return scope;
    }

    /// <summary>Write the board and complete the scope the change was made in.</summary>
    /// <param name="notes">Every note.</param>
    /// <param name="scope">The scope from <see cref="BeginWrite"/>.</param>
    private void Write(IReadOnlyList<StickyNote> notes, ICoreScope scope)
    {
        keyValueService.SetValue(StorageKey, JsonSerializer.Serialize(notes, Json));
        scope.Complete();
    }
}
