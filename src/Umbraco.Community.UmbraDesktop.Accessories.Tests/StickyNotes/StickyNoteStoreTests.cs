using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.UmbraDesktop.Accessories.StickyNotes;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Accessories.Tests.StickyNotes;

/// <summary>
/// The shared sticky note board: one list every desktop user reads and writes.
/// </summary>
/// <remarks>
/// The case worth most here is the conflict. Two people editing the same note is the normal way this
/// feature is used, not an edge case, and the store's job is to make sure the second save cannot
/// silently discard the first.
/// </remarks>
public class StickyNoteStoreTests
{
    /// <summary>The moment every test starts at.</summary>
    private static readonly DateTimeOffset Start = new(2026, 9, 24, 10, 0, 0, TimeSpan.Zero);

    /// <summary>A store over an empty in-memory key-value store and a clock the test controls.</summary>
    /// <returns>The store, its backing values and its clock.</returns>
    private static (StickyNoteStore Store, InMemoryKeyValueService Values, FakeTimeProvider Clock) Create()
    {
        var values = new InMemoryKeyValueService();
        var clock = new FakeTimeProvider(Start);
        return (new StickyNoteStore(values, clock), values, clock);
    }

    /// <summary>A board nobody has written on is empty rather than missing.</summary>
    [Fact]
    public void Starts_empty()
    {
        var (store, _, _) = Create();

        Assert.Empty(store.GetAll());
    }

    /// <summary>A new note carries who wrote it, when, and the first version.</summary>
    [Fact]
    public void Adds_a_note_with_its_author_and_the_first_version()
    {
        var (store, _, _) = Create();

        var note = store.Create("Republish the homepage on Friday", "yellow", "Ada");

        Assert.Equal("Republish the homepage on Friday", note.Text);
        Assert.Equal("yellow", note.Colour);
        Assert.Equal("Ada", note.UpdatedBy);
        Assert.Equal(Start, note.UpdatedAt);
        Assert.Equal(1, note.Version);
        Assert.Equal(note, Assert.Single(store.GetAll()));
    }

    /// <summary>The board is shared through the database, so a second store over it sees the note.</summary>
    [Fact]
    public void Persists_through_the_key_value_store()
    {
        var (store, values, clock) = Create();
        var note = store.Create("Shared", "green", "Ada");

        var elsewhere = new StickyNoteStore(values, clock);

        Assert.Equal(note, Assert.Single(elsewhere.GetAll()));
    }

    /// <summary>An edit against the version the editor read is saved, and moves the version on.</summary>
    [Fact]
    public void Saves_an_edit_made_against_the_current_version()
    {
        var (store, _, clock) = Create();
        var note = store.Create("Draft", "yellow", "Ada");
        clock.Advance(TimeSpan.FromMinutes(5));

        var result = store.Update(note.Key, "Final", "pink", note.Version, "Grace");

        Assert.Equal(StickyNoteWriteStatus.Saved, result.Status);
        Assert.Equal("Final", result.Note!.Text);
        Assert.Equal("pink", result.Note.Colour);
        Assert.Equal("Grace", result.Note.UpdatedBy);
        Assert.Equal(Start.AddMinutes(5), result.Note.UpdatedAt);
        Assert.Equal(2, result.Note.Version);
    }

    /// <summary>
    /// The second of two editors who read the same version is refused, and told what the note says
    /// now, so they can choose rather than overwrite.
    /// </summary>
    [Fact]
    public void Refuses_an_edit_made_against_an_older_version_and_returns_the_current_note()
    {
        var (store, _, _) = Create();
        var note = store.Create("Draft", "yellow", "Ada");
        store.Update(note.Key, "Ada's edit", "yellow", note.Version, "Ada");

        var result = store.Update(note.Key, "Grace's edit", "yellow", note.Version, "Grace");

        Assert.Equal(StickyNoteWriteStatus.Conflict, result.Status);
        Assert.Equal("Ada's edit", result.Note!.Text);
        Assert.Equal("Ada's edit", Assert.Single(store.GetAll()).Text);
    }

    /// <summary>An edit to a note someone else deleted says so rather than bringing it back.</summary>
    [Fact]
    public void Reports_an_edit_to_a_deleted_note_as_not_found()
    {
        var (store, _, _) = Create();
        var note = store.Create("Gone soon", "yellow", "Ada");
        store.Delete(note.Key);

        var result = store.Update(note.Key, "Too late", "yellow", note.Version, "Grace");

        Assert.Equal(StickyNoteWriteStatus.NotFound, result.Status);
        Assert.Null(result.Note);
        Assert.Empty(store.GetAll());
    }

    /// <summary>Deleting answers whether there was anything to delete.</summary>
    [Fact]
    public void Deletes_a_note_once()
    {
        var (store, _, _) = Create();
        var note = store.Create("Bin me", "yellow", "Ada");

        Assert.True(store.Delete(note.Key));
        Assert.False(store.Delete(note.Key));
    }

    /// <summary>
    /// Text past the limit is cut to it rather than refused: a note is a scribble, and losing the end
    /// of one is better than losing all of it to an error.
    /// </summary>
    [Fact]
    public void Trims_text_to_the_limit()
    {
        var (store, _, _) = Create();

        var note = store.Create(new string('x', StickyNoteStore.MaxTextLength + 50), "yellow", "Ada");

        Assert.Equal(StickyNoteStore.MaxTextLength, note.Text.Length);
    }

    /// <summary>A colour this version does not offer falls back to yellow, the sticky note colour.</summary>
    [Fact]
    public void Falls_back_to_yellow_for_an_unknown_colour()
    {
        var (store, _, _) = Create();

        Assert.Equal("yellow", store.Create("x", "tartan", "Ada").Colour);
    }

    /// <summary>
    /// The board has a ceiling, so one runaway client cannot grow a single key-value row without
    /// bound. Past it, a new note is refused.
    /// </summary>
    [Fact]
    public void Refuses_a_note_past_the_board_limit()
    {
        var (store, _, _) = Create();
        for (var i = 0; i < StickyNoteStore.MaxNotes; i++)
        {
            store.Create($"Note {i}", "yellow", "Ada");
        }

        Assert.Throws<StickyNoteBoardFullException>(() => store.Create("One too many", "yellow", "Ada"));
    }

    /// <summary>A stored payload this version cannot read is an empty board, not an exception on every request.</summary>
    [Fact]
    public void Reads_an_unreadable_payload_as_an_empty_board()
    {
        var (_, values, clock) = Create();
        values.SetValue(StickyNoteStore.StorageKey, "not json");

        Assert.Empty(new StickyNoteStore(values, clock).GetAll());
    }

    /// <summary>The texts on the board, in board order, for asserting on order.</summary>
    /// <param name="store">The store to read.</param>
    /// <returns>Each note's text.</returns>
    private static string[] Order(StickyNoteStore store) => store.GetAll().Select(note => note.Text).ToArray();

    /// <summary>
    /// A note can be moved to sit before another, which is how the board is reordered. Named by the
    /// note it goes before rather than by a position, so a note someone else adds or deletes in the
    /// meantime cannot make it land somewhere the mover did not mean.
    /// </summary>
    [Fact]
    public void Moves_a_note_to_sit_before_another()
    {
        var (store, _, _) = Create();
        var a = store.Create("A", "yellow", "Ada");
        store.Create("B", "yellow", "Ada");
        var c = store.Create("C", "yellow", "Ada");

        Assert.True(store.Move(c.Key, a.Key));

        Assert.Equal(["C", "A", "B"], Order(store));
    }

    /// <summary>No note to go before means the end of the board.</summary>
    [Fact]
    public void Moves_a_note_to_the_end_when_there_is_nothing_to_go_before()
    {
        var (store, _, _) = Create();
        var a = store.Create("A", "yellow", "Ada");
        store.Create("B", "yellow", "Ada");

        Assert.True(store.Move(a.Key, null));

        Assert.Equal(["B", "A"], Order(store));
    }

    /// <summary>
    /// A note to go before that has since been deleted also means the end: the mover still meant to
    /// move the note, and the end is the one place that cannot be wrong about anything else.
    /// </summary>
    [Fact]
    public void Moves_to_the_end_when_the_note_to_go_before_has_gone()
    {
        var (store, _, _) = Create();
        var a = store.Create("A", "yellow", "Ada");
        store.Create("B", "yellow", "Ada");

        Assert.True(store.Move(a.Key, Guid.NewGuid()));

        Assert.Equal(["B", "A"], Order(store));
    }

    /// <summary>
    /// Moving is not editing: the version, the author and the time stay as they were, so somebody
    /// typing in the note while it is moved does not get a conflict for it.
    /// </summary>
    [Fact]
    public void Leaves_a_moved_note_unchanged()
    {
        var (store, _, clock) = Create();
        var a = store.Create("A", "yellow", "Ada");
        store.Create("B", "yellow", "Ada");
        clock.Advance(TimeSpan.FromMinutes(5));

        store.Move(a.Key, null);

        Assert.Equal(a, store.GetAll()[^1]);
    }

    /// <summary>A note that is not on the board cannot be moved, and nothing else changes.</summary>
    [Fact]
    public void Reports_a_move_of_a_missing_note()
    {
        var (store, _, _) = Create();
        store.Create("A", "yellow", "Ada");

        Assert.False(store.Move(Guid.NewGuid(), null));

        Assert.Equal(["A"], Order(store));
    }
}
