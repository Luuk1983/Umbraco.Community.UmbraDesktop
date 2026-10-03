using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Api;

/// <summary>
/// The Arcade's management API: the caller's profile, submitting scores, reading boards, beaten
/// events, and moderation.
/// </summary>
/// <remarks>
/// <para>
/// <b>Who may use it.</b> Anyone with the Desktop section, checked in each action as Sticky Notes
/// does, because Umbraco has no policy for a package's own section.
/// </para>
/// <para>
/// <b>Who may moderate.</b> Anyone who also has the Users section (D11): they already manage people.
/// </para>
/// <para>
/// <b>Section aliases.</b> <c>IUser.AllowedSections</c> holds the legacy aliases (<c>users</c>), not
/// the backoffice's section names (<c>Umb.Section.Users</c>); the management API's
/// <c>SectionMapper</c> translates only on the way out to the browser. A package's own section has no
/// mapping, so the Desktop section's alias is the same in both worlds.
/// </para>
/// <para>
/// Errors are problem details, because the backoffice's HTTP client replaces any other error body
/// with a generic one before the caller sees it.
/// </para>
/// </remarks>
/// <param name="store">The score store.</param>
/// <param name="securityAccessor">Who is calling.</param>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("umbradesktop/services/arcade")]
[ApiExplorerSettings(GroupName = "UmbraDesktop")]
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
public class ArcadeController(ArcadeStore store, IBackOfficeSecurityAccessor securityAccessor) : ManagementApiControllerBase
{
    /// <summary>The Desktop section's alias, the host's <c>UMBRADESKTOP_SECTION_ALIAS</c>; the host ships no C# constant.</summary>
    public const string DesktopSectionAlias = "Umbraco.Community.UmbraDesktop.Section";

    /// <summary>Umbraco's Users section as <c>IUser.AllowedSections</c> stores it (<c>users</c>), the moderation gate (D11).</summary>
    public const string UsersSectionAlias = Constants.Applications.Users;

    /// <summary>The caller's settings, or the defaults.</summary>
    /// <returns>The profile.</returns>
    [HttpGet("profile")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(ArcadeProfile), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetProfile() =>
        Caller() is { } user ? Ok(await store.GetProfileAsync(user.Key, user.Name ?? string.Empty)) : Forbid();

    /// <summary>Change the caller's settings.</summary>
    /// <param name="model">The fields to change.</param>
    /// <returns>The profile as saved.</returns>
    [HttpPut("profile")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(ArcadeProfile), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateProfile(UpdateProfileRequestModel model) =>
        Caller() is { } user
            ? Ok(await store.UpdateProfileAsync(user.Key, user.Name ?? string.Empty, model.DisplayName, model.IsPublic, model.NotifyWhenBeaten))
            : Forbid();

    /// <summary>Delete everything the Arcade holds about the caller.</summary>
    /// <returns>200.</returns>
    [HttpDelete("profile")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteProfile()
    {
        if (Caller() is not { } user)
        {
            return Forbid();
        }

        await store.ForgetUserAsync(user.Key);
        return Ok();
    }

    /// <summary>Submit a score.</summary>
    /// <param name="model">The score and its board.</param>
    /// <returns>The result, 400 for an invalid value or definition, 409 for a board described differently.</returns>
    [HttpPost("scores")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(SubmitScoreResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SubmitScore(SubmitScoreRequestModel model)
    {
        if (Caller() is not { } user)
        {
            return Forbid();
        }

        var result = await store.SubmitAsync(user.Key, user.Name ?? string.Empty, model.ToDefinition(), model.Value);
        return result.Status switch
        {
            SubmitStatus.Accepted => Ok(new SubmitScoreResponseModel(result.IsPersonalBest, result.PreviousBest, result.Rank, result.IsPublic, result.AskedAboutPublic, result.DisplayName)),
            SubmitStatus.Conflict => Conflict(Problem("ArcadeBoardConflict", "This board is already recorded with different rules", StatusCodes.Status409Conflict)),
            _ => BadRequest(Problem("ArcadeScoreRejected", "The score or its board is not valid", StatusCodes.Status400BadRequest)),
        };
    }

    /// <summary>A board for the caller.</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>The board.</returns>
    [HttpGet("boards/{game}/{board}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(BoardResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetBoard(string game, string board)
    {
        if (Caller() is not { } user)
        {
            return Forbid();
        }

        var view = await store.GetBoardAsync(user.Key, game, board);
        return Ok(new BoardResponseModel(
            view.Definition is not null,
            view.Top.Select(BoardEntryModel.From).ToArray(),
            view.Viewer is null ? null : BoardEntryModel.From(view.Viewer),
            view.ViewerIsPublic,
            CanModerate(user)));
    }

    /// <summary>The caller's best on a board.</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>The best.</returns>
    [HttpGet("best/{game}/{board}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(BestResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetBest(string game, string board) =>
        Caller() is { } user ? Ok(new BestResponseModel(await store.GetBestAsync(user.Key, game, board))) : Forbid();

    /// <summary>Hand out the caller's unread beaten events, once.</summary>
    /// <returns>The events.</returns>
    [HttpPost("beaten/take")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(IReadOnlyList<BeatenEvent>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> TakeBeaten() =>
        Caller() is { } user ? Ok(await store.TakeBeatenAsync(user.Key)) : Forbid();

    /// <summary>Remove one player's score (admin).</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <param name="userKey">The player.</param>
    /// <returns>200, or 404.</returns>
    [HttpDelete("boards/{game}/{board}/scores/{userKey:guid}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RemoveScore(string game, string board, Guid userKey) =>
        Caller() is { } user && CanModerate(user)
            ? (await store.RemoveScoreAsync(game, board, userKey) ? Ok() : NotFound())
            : Forbid();

    /// <summary>Empty a board (admin).</summary>
    /// <param name="game">The game's manifest alias.</param>
    /// <param name="board">The board's alias.</param>
    /// <returns>200, or 404.</returns>
    [HttpDelete("boards/{game}/{board}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ResetBoard(string game, string board) =>
        Caller() is { } user && CanModerate(user)
            ? (await store.ResetBoardAsync(game, board) ? Ok() : NotFound())
            : Forbid();

    /// <summary>Put a player's display name back to their Umbraco name (admin).</summary>
    /// <param name="userKey">The player.</param>
    /// <param name="users">Umbraco's user service, to read the player's Umbraco name.</param>
    /// <returns>200, or 404.</returns>
    [HttpPost("profiles/{userKey:guid}/reset-name")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ResetName(Guid userKey, [FromServices] IUserService users)
    {
        if (Caller() is not { } user || !CanModerate(user))
        {
            return Forbid();
        }

        var target = await users.GetAsync(userKey);
        if (target is null)
        {
            return NotFound();
        }

        return await store.ResetDisplayNameAsync(userKey, target.Name ?? string.Empty) ? Ok() : NotFound();
    }

    /// <summary>The current user, if they have the Desktop section.</summary>
    /// <returns>The user, or null.</returns>
    private IUser? Caller()
    {
        var user = securityAccessor.BackOfficeSecurity?.CurrentUser;
        return user is not null && user.AllowedSections.Contains(DesktopSectionAlias) ? user : null;
    }

    /// <summary>Whether a user may moderate (D11).</summary>
    /// <param name="user">The user.</param>
    /// <returns>True with the Users section.</returns>
    private static bool CanModerate(IUser user) => user.AllowedSections.Contains(UsersSectionAlias);

    /// <summary>Problem details the backoffice's client passes through intact.</summary>
    /// <param name="type">A stable type the front end can switch on.</param>
    /// <param name="title">A readable title.</param>
    /// <param name="status">The status.</param>
    /// <returns>The problem.</returns>
    private static ProblemDetails Problem(string type, string title, int status) => new() { Type = type, Title = title, Status = status };
}
