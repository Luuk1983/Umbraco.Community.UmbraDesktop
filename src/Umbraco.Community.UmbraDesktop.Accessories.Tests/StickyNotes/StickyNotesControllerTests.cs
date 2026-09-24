using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security;
using Umbraco.Community.UmbraDesktop.Accessories.StickyNotes;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Accessories.Tests.StickyNotes;

/// <summary>
/// The management API behind the Sticky Notes app.
/// </summary>
/// <remarks>
/// What is worth pinning here is what the store cannot know: who is asking, whether they may, and
/// how each outcome reaches the window as a status code it can act on.
/// </remarks>
public class StickyNotesControllerTests
{
    /// <summary>The store the controller writes to, shared with the assertions.</summary>
    private readonly StickyNoteStore _store =
        new(new InMemoryKeyValueService(), new FakeTimeProvider(new DateTimeOffset(2026, 9, 24, 10, 0, 0, TimeSpan.Zero)));

    /// <summary>A controller acting for a user with the given name and sections.</summary>
    /// <param name="name">The user's name.</param>
    /// <param name="sections">The sections the user may open.</param>
    /// <returns>The controller under test.</returns>
    private StickyNotesController As(string name = "Ada", params string[] sections)
    {
        var user = Substitute.For<IUser>();
        user.Name.Returns(name);
        user.AllowedSections.Returns(sections.Length > 0 ? sections : [StickyNotesController.DesktopSectionAlias]);

        var security = Substitute.For<IBackOfficeSecurity>();
        security.CurrentUser.Returns(user);
        var accessor = Substitute.For<IBackOfficeSecurityAccessor>();
        accessor.BackOfficeSecurity.Returns(security);

        return new StickyNotesController(_store, accessor);
    }

    /// <summary>The board comes with the limits the window has to respect, so it never copies them.</summary>
    [Fact]
    public void Lists_the_board_with_its_limits()
    {
        _store.Create("Hello", "yellow", "Ada");

        var result = Assert.IsType<OkObjectResult>(As().GetBoard());
        var board = Assert.IsType<StickyNoteBoardResponseModel>(result.Value);

        Assert.Equal("Hello", Assert.Single(board.Notes).Text);
        Assert.Equal(StickyNoteStore.MaxTextLength, board.MaxTextLength);
        Assert.Equal(StickyNoteStore.MaxNotes, board.MaxNotes);
        Assert.Equal(StickyNoteStore.Colours, board.Colours);
    }

    /// <summary>A new note is signed with the name of whoever is logged in, never one the client sends.</summary>
    [Fact]
    public void Signs_a_new_note_with_the_current_user()
    {
        var result = Assert.IsType<ObjectResult>(As("Grace").CreateNote(new CreateStickyNoteRequestModel("Hi", "green")));

        Assert.Equal(StatusCodes.Status201Created, result.StatusCode);
        var note = Assert.IsType<StickyNoteResponseModel>(result.Value);
        Assert.Equal("Grace", note.UpdatedBy);
        Assert.Equal("green", note.Colour);
    }

    /// <summary>An edit against the current version is saved and returned.</summary>
    [Fact]
    public void Saves_a_current_edit()
    {
        var note = _store.Create("Draft", "yellow", "Ada");

        var result = Assert.IsType<OkObjectResult>(
            As("Grace").UpdateNote(note.Key, new UpdateStickyNoteRequestModel("Final", "yellow", note.Version)));

        var saved = Assert.IsType<StickyNoteResponseModel>(result.Value);
        Assert.Equal("Final", saved.Text);
        Assert.Equal(2, saved.Version);
    }

    /// <summary>
    /// A stale edit is a 409 carrying the note as it now stands, which is everything the window needs
    /// to offer "use theirs" or "keep mine" without a second request.
    /// </summary>
    /// <remarks>
    /// As <see cref="ProblemDetails"/> with the note in an extension, not as a bare note, and that
    /// was found by running it: the backoffice's HTTP client replaces any error body that is not
    /// problem details with a generic one, so a bare note arrived in the window as
    /// <c>{ status: 409, title: "Conflict" }</c> and the other person's text was lost.
    /// </remarks>
    [Fact]
    public void Answers_a_stale_edit_with_409_problem_details_carrying_the_current_note()
    {
        var note = _store.Create("Draft", "yellow", "Ada");
        _store.Update(note.Key, "Ada's edit", "yellow", note.Version, "Ada");

        var result = Assert.IsType<ConflictObjectResult>(
            As("Grace").UpdateNote(note.Key, new UpdateStickyNoteRequestModel("Grace's edit", "yellow", note.Version)));

        var problem = Assert.IsType<ProblemDetails>(result.Value);
        Assert.Equal(StatusCodes.Status409Conflict, problem.Status);
        Assert.False(string.IsNullOrEmpty(problem.Type), "the backoffice only keeps a body with a type, a title and a status");
        Assert.False(string.IsNullOrEmpty(problem.Title));
        var current = Assert.IsType<StickyNoteResponseModel>(problem.Extensions[StickyNotesController.ConflictNoteExtension]);
        Assert.Equal("Ada's edit", current.Text);
    }

    /// <summary>Editing or deleting a note that is gone is a 404.</summary>
    [Fact]
    public void Answers_a_missing_note_with_404()
    {
        var missing = Guid.NewGuid();

        Assert.IsType<NotFoundResult>(As().UpdateNote(missing, new UpdateStickyNoteRequestModel("x", "yellow", 1)));
        Assert.IsType<NotFoundResult>(As().DeleteNote(missing));
    }

    /// <summary>Anyone with the desktop may delete any note, as agreed for this board.</summary>
    [Fact]
    public void Lets_anyone_delete_any_note()
    {
        var note = _store.Create("Ada's", "yellow", "Ada");

        Assert.IsType<OkResult>(As("Grace").DeleteNote(note.Key));
        Assert.Empty(_store.GetAll());
    }

    /// <summary>A full board is a 400 with a reason, not a 500.</summary>
    [Fact]
    public void Answers_a_full_board_with_400()
    {
        for (var i = 0; i < StickyNoteStore.MaxNotes; i++)
        {
            _store.Create($"{i}", "yellow", "Ada");
        }

        var result = Assert.IsType<BadRequestObjectResult>(As().CreateNote(new CreateStickyNoteRequestModel("more", "yellow")));
        var problem = Assert.IsType<ProblemDetails>(result.Value);
        Assert.False(string.IsNullOrEmpty(problem.Type), "without a type the backoffice replaces the reason with a generic one");
    }

    /// <summary>
    /// The board belongs to the desktop, so a backoffice user without the Desktop section can neither
    /// read nor write it, even though the endpoint is reachable to any backoffice user.
    /// </summary>
    [Fact]
    public void Forbids_users_without_the_desktop_section()
    {
        var note = _store.Create("Private to desktop users", "yellow", "Ada");
        var outsider = As("Mallory", "Umb.Section.Content");

        Assert.IsType<ForbidResult>(outsider.GetBoard());
        Assert.IsType<ForbidResult>(outsider.CreateNote(new CreateStickyNoteRequestModel("x", "yellow")));
        Assert.IsType<ForbidResult>(outsider.UpdateNote(note.Key, new UpdateStickyNoteRequestModel("x", "yellow", 1)));
        Assert.IsType<ForbidResult>(outsider.DeleteNote(note.Key));
        Assert.Equal("Private to desktop users", Assert.Single(_store.GetAll()).Text);
    }
}
