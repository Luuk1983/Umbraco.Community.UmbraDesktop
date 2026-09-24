using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Web.Common.Authorization;

namespace Umbraco.Community.UmbraDesktop.Accessories.StickyNotes;

/// <summary>
/// The shared sticky note board: read it, add to it, edit and delete its notes.
/// </summary>
/// <remarks>
/// <para>
/// <b>Who may use it.</b> Anyone with the Desktop section, which is who can open the Sticky Notes
/// window at all. Umbraco has no policy for a package's own section, so the route takes any
/// backoffice user and each action checks the section itself; without that check the board would be
/// readable by every backoffice account, including ones the desktop was never granted to.
/// </para>
/// <para>
/// <b>Anyone may edit or delete any note.</b> It is a shared noticeboard, and each note says who
/// last wrote it. What the API does guard is the lost update: an edit names the version it was made
/// against and is refused with 409, carrying the note as it now stands, when somebody else got there
/// first.
/// </para>
/// </remarks>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/accessories/sticky-notes")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
public class StickyNotesController(StickyNoteStore store, IBackOfficeSecurityAccessor securityAccessor)
    : ManagementApiControllerBase
{
    /// <summary>
    /// The Desktop section's alias, as the host package registers it. Written out rather than
    /// imported, because the host ships no C# constant for it; it is the host's
    /// <c>UMBRADESKTOP_SECTION_ALIAS</c>.
    /// </summary>
    public const string DesktopSectionAlias = "Umbraco.Community.UmbraDesktop.Section";

    /// <summary>
    /// The problem details extension a 409 carries the current note in.
    /// </summary>
    /// <remarks>
    /// Problem details rather than the note as the whole body, and that is the backoffice's rule, not
    /// this API's taste: its HTTP client replaces every error body that is not problem details (a
    /// <c>type</c>, a <c>title</c> and a <c>status</c>) with a generic one before the caller sees it.
    /// A bare note on a 409 reached the window as <c>{ status: 409, title: "Conflict" }</c>, found
    /// by running it against a real backoffice, and the other person's text went with it.
    /// </remarks>
    public const string ConflictNoteExtension = "note";

    /// <summary>The board, with the limits the window has to respect.</summary>
    /// <returns>Every note.</returns>
    [HttpGet]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(StickyNoteBoardResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public IActionResult GetBoard()
    {
        if (!CanUseDesktop(out _))
        {
            return Forbid();
        }

        return Ok(new StickyNoteBoardResponseModel(
            store.GetAll().Select(StickyNoteResponseModel.From).ToArray(),
            StickyNoteStore.MaxTextLength,
            StickyNoteStore.MaxNotes,
            StickyNoteStore.Colours));
    }

    /// <summary>Add a note, signed by the current user.</summary>
    /// <param name="model">What it says and its colour.</param>
    /// <returns>The new note.</returns>
    [HttpPost]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(StickyNoteResponseModel), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public IActionResult CreateNote(CreateStickyNoteRequestModel model)
    {
        if (!CanUseDesktop(out var author))
        {
            return Forbid();
        }

        try
        {
            var note = store.Create(model.Text, model.Colour, author);
            return StatusCode(StatusCodes.Status201Created, StickyNoteResponseModel.From(note));
        }
        catch (StickyNoteBoardFullException exception)
        {
            return BadRequest(new ProblemDetails
            {
                Type = "StickyNoteBoardFull",
                Title = "The board is full",
                Detail = exception.Message,
                Status = StatusCodes.Status400BadRequest,
            });
        }
    }

    /// <summary>Edit a note, if nobody else has since the caller read it.</summary>
    /// <param name="key">The note.</param>
    /// <param name="model">The edit and the version it was made against.</param>
    /// <returns>The saved note, or 409 with the current one, or 404.</returns>
    [HttpPut("{key:guid}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(StickyNoteResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public IActionResult UpdateNote(Guid key, UpdateStickyNoteRequestModel model)
    {
        if (!CanUseDesktop(out var author))
        {
            return Forbid();
        }

        var result = store.Update(key, model.Text, model.Colour, model.Version, author);
        return result.Status switch
        {
            StickyNoteWriteStatus.Saved => Ok(StickyNoteResponseModel.From(result.Note!)),
            StickyNoteWriteStatus.Conflict => Conflict(new ProblemDetails
            {
                Type = "StickyNoteConflict",
                Title = "Somebody else changed this note",
                Status = StatusCodes.Status409Conflict,
                Extensions = { [ConflictNoteExtension] = StickyNoteResponseModel.From(result.Note!) },
            }),
            _ => NotFound(),
        };
    }

    /// <summary>Take a note off the board.</summary>
    /// <param name="key">The note.</param>
    /// <returns>200, or 404 when it was already gone.</returns>
    [HttpDelete("{key:guid}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public IActionResult DeleteNote(Guid key)
    {
        if (!CanUseDesktop(out _))
        {
            return Forbid();
        }

        return store.Delete(key) ? Ok() : NotFound();
    }

    /// <summary>Whether the current user has the Desktop section, and their name if so.</summary>
    /// <param name="name">The user's name, for signing a note.</param>
    /// <returns>True when they may use the board.</returns>
    private bool CanUseDesktop(out string name)
    {
        var user = securityAccessor.BackOfficeSecurity?.CurrentUser;
        name = user?.Name ?? string.Empty;
        return user is not null && user.AllowedSections.Contains(DesktopSectionAlias);
    }
}
