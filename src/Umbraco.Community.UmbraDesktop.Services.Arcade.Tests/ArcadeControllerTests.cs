using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Api;
using Umbraco.Community.UmbraDesktop.Services.Arcade.Scores;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Services.Arcade.Tests;

/// <summary>Who may call what, and how each outcome reaches the browser.</summary>
public class ArcadeControllerTests : IAsyncLifetime
{
    /// <summary>A score for Snake.</summary>
    private static readonly SubmitScoreRequestModel SnakeScore = new("Pkg.Snake.Game", "default", "higher", "points", null, null, 300);

    /// <summary>The database under test.</summary>
    private SqliteTestDatabase _database = null!;

    /// <summary>The store under test.</summary>
    private ArcadeStore _store = null!;

    /// <inheritdoc />
    public async Task InitializeAsync()
    {
        _database = await SqliteTestDatabase.CreateAsync();
        _store = new ArcadeStore(_database, new FakeUserDirectory(), new FakeTimeProvider());
    }

    /// <inheritdoc />
    public async Task DisposeAsync() => await _database.DisposeAsync();

    /// <summary>Without the Desktop section every action is forbidden, admin ones included.</summary>
    [Fact]
    public async Task Forbids_users_without_the_desktop_section()
    {
        var outsider = As(Guid.NewGuid(), "Mallory", "content");

        Assert.IsType<ForbidResult>(await outsider.GetProfile());
        Assert.IsType<ForbidResult>(await outsider.UpdateProfile(new UpdateProfileRequestModel(null, true, null)));
        Assert.IsType<ForbidResult>(await outsider.DeleteProfile());
        Assert.IsType<ForbidResult>(await outsider.SubmitScore(SnakeScore));
        Assert.IsType<ForbidResult>(await outsider.GetBoard("Pkg.Snake.Game", "default"));
        Assert.IsType<ForbidResult>(await outsider.GetBest("Pkg.Snake.Game", "default"));
        Assert.IsType<ForbidResult>(await outsider.TakeBeaten());
        Assert.IsType<ForbidResult>(await outsider.ResetBoard("Pkg.Snake.Game", "default"));
        Assert.IsType<ForbidResult>(await outsider.RemoveScore("Pkg.Snake.Game", "default", Guid.NewGuid()));
    }

    /// <summary>Admin actions need the Users section as well (D11).</summary>
    [Fact]
    public async Task Admin_actions_need_the_users_section()
    {
        var player = As(Guid.NewGuid(), "Ada", ArcadeController.DesktopSectionAlias);
        var admin = As(Guid.NewGuid(), "Root", ArcadeController.DesktopSectionAlias, ArcadeController.UsersSectionAlias);
        await player.SubmitScore(SnakeScore);

        Assert.IsType<ForbidResult>(await player.ResetBoard("Pkg.Snake.Game", "default"));
        Assert.IsType<OkResult>(await admin.ResetBoard("Pkg.Snake.Game", "default"));
        Assert.IsType<NotFoundResult>(await admin.ResetBoard("Pkg.Snake.Game", "default"));
    }

    /// <summary>The Users section is the alias Umbraco stores on a user, not the backoffice's section name.</summary>
    [Fact]
    public void The_users_section_is_the_alias_umbraco_stores()
    {
        Assert.Equal(Umbraco.Cms.Core.Constants.Applications.Users, ArcadeController.UsersSectionAlias);
    }

    /// <summary>A submit answers with the result; a refused one with problem details the client can read.</summary>
    [Fact]
    public async Task Submits_and_refuses_with_problem_details()
    {
        var player = As(Guid.NewGuid(), "Ada", ArcadeController.DesktopSectionAlias);

        var ok = Assert.IsType<OkObjectResult>(await player.SubmitScore(SnakeScore));
        Assert.True(Assert.IsType<SubmitScoreResponseModel>(ok.Value).IsPersonalBest);

        var bad = Assert.IsType<BadRequestObjectResult>(await player.SubmitScore(SnakeScore with { Value = 0 }));
        Assert.Equal("ArcadeScoreRejected", Assert.IsType<ProblemDetails>(bad.Value).Type);

        var clash = Assert.IsType<ConflictObjectResult>(await player.SubmitScore(SnakeScore with { Better = "lower" }));
        Assert.Equal("ArcadeBoardConflict", Assert.IsType<ProblemDetails>(clash.Value).Type);
    }

    /// <summary>The board says whether the viewer may moderate it, so the hub knows to draw the buttons.</summary>
    [Fact]
    public async Task A_board_says_whether_the_viewer_may_moderate()
    {
        var player = As(Guid.NewGuid(), "Ada", ArcadeController.DesktopSectionAlias);
        await player.SubmitScore(SnakeScore);

        var board = Assert.IsType<BoardResponseModel>(Assert.IsType<OkObjectResult>(await player.GetBoard("Pkg.Snake.Game", "default")).Value);

        Assert.False(board.CanModerate);
        Assert.Equal(300, board.Viewer!.Value);
    }

    /// <summary>Resetting a name is moderation too.</summary>
    [Fact]
    public async Task Resetting_a_name_needs_the_users_section()
    {
        var users = Substitute.For<IUserService>();
        var player = As(Guid.NewGuid(), "Ada", ArcadeController.DesktopSectionAlias);

        Assert.IsType<ForbidResult>(await player.ResetName(Guid.NewGuid(), users));
    }

    /// <summary>Resetting a name when the Umbraco user is not found returns NotFound and does not modify the profile.</summary>
    [Fact]
    public async Task ResetName_when_umbraco_user_not_found_returns_not_found()
    {
        var admin = As(Guid.NewGuid(), "Root", ArcadeController.DesktopSectionAlias, ArcadeController.UsersSectionAlias);
        var playerKey = Guid.NewGuid();

        // Submit a score to create a profile
        var player = As(playerKey, "Ada", ArcadeController.DesktopSectionAlias);
        await player.SubmitScore(SnakeScore);

        // Verify the profile exists and has the default display name
        var profileBefore = await _store.GetProfileAsync(playerKey, "Ada");
        Assert.NotNull(profileBefore);

        // Mock IUserService to return null for this player (the Umbraco user was deleted)
        var users = Substitute.For<IUserService>();
        users.GetAsync(playerKey).Returns((IUser?)null);

        var result = await admin.ResetName(playerKey, users);
        Assert.IsType<NotFoundResult>(result);

        // Verify the profile was not modified
        var profileAfter = await _store.GetProfileAsync(playerKey, "Ada");
        Assert.Equal(profileBefore.DisplayName, profileAfter.DisplayName);
    }

    /// <summary>RemoveScore as an admin returns OK for an existing score, and NotFound on a second attempt.</summary>
    [Fact]
    public async Task RemoveScore_returns_ok_then_not_found()
    {
        var admin = As(Guid.NewGuid(), "Root", ArcadeController.DesktopSectionAlias, ArcadeController.UsersSectionAlias);
        var playerKey = Guid.NewGuid();
        var player = As(playerKey, "Ada", ArcadeController.DesktopSectionAlias);

        // Submit a score
        await player.SubmitScore(SnakeScore);

        // First removal should return OK
        var firstRemove = await admin.RemoveScore("Pkg.Snake.Game", "default", playerKey);
        Assert.IsType<OkResult>(firstRemove);

        // Second removal should return NotFound
        var secondRemove = await admin.RemoveScore("Pkg.Snake.Game", "default", playerKey);
        Assert.IsType<NotFoundResult>(secondRemove);
    }

    /// <summary>ResetName as an admin for an existing user succeeds and sets the display name to the user's Umbraco name.</summary>
    [Fact]
    public async Task ResetName_for_existing_user_succeeds_and_sets_umbraco_name()
    {
        var admin = As(Guid.NewGuid(), "Root", ArcadeController.DesktopSectionAlias, ArcadeController.UsersSectionAlias);
        var playerKey = Guid.NewGuid();
        var playerUmbracoName = "Ada";

        // Submit a score
        var player = As(playerKey, playerUmbracoName, ArcadeController.DesktopSectionAlias);
        await player.SubmitScore(SnakeScore);

        // Change the display name manually
        await _store.UpdateProfileAsync(playerKey, playerUmbracoName, "CustomName", true, null);
        var profileBeforeReset = await _store.GetProfileAsync(playerKey, playerUmbracoName);
        Assert.Equal("CustomName", profileBeforeReset.DisplayName);

        // Reset the name
        var users = Substitute.For<IUserService>();
        var targetUser = Substitute.For<IUser>();
        targetUser.Name.Returns(playerUmbracoName);
        users.GetAsync(playerKey).Returns(targetUser);

        var result = await admin.ResetName(playerKey, users);
        Assert.IsType<OkResult>(result);

        // Verify the display name is now the Umbraco name
        var profileAfterReset = await _store.GetProfileAsync(playerKey, playerUmbracoName);
        Assert.Equal(playerUmbracoName, profileAfterReset.DisplayName);
    }

    /// <summary>TakeBeaten returns the beaten events once, then an empty list on subsequent calls.</summary>
    [Fact]
    public async Task TakeBeaten_returns_events_once_then_empty()
    {
        var player1Key = Guid.NewGuid();
        var player2Key = Guid.NewGuid();
        var player1 = As(player1Key, "Ada", ArcadeController.DesktopSectionAlias);
        var player2 = As(player2Key, "Bob", ArcadeController.DesktopSectionAlias);

        // Player 1 submits a score and makes their profile public
        await player1.SubmitScore(SnakeScore);
        await _store.UpdateProfileAsync(player1Key, "Ada", null, isPublic: true, notifyWhenBeaten: null);

        // Player 2 makes their profile public and beats player 1's score, generating a beaten event
        await _store.UpdateProfileAsync(player2Key, "Bob", null, isPublic: true, notifyWhenBeaten: null);
        await player2.SubmitScore(SnakeScore with { Value = 400 });

        // Player 1 takes the beaten event
        var firstTake = Assert.IsType<OkObjectResult>(await player1.TakeBeaten());
        var events = Assert.IsType<List<BeatenEvent>>(firstTake.Value);
        Assert.NotEmpty(events);
        Assert.Single(events);

        // Second take should return empty list
        var secondTake = Assert.IsType<OkObjectResult>(await player1.TakeBeaten());
        var emptyEvents = Assert.IsType<List<BeatenEvent>>(secondTake.Value);
        Assert.Empty(emptyEvents);
    }

    /// <summary>A controller acting for one user.</summary>
    /// <param name="key">The user's key.</param>
    /// <param name="name">The user's name.</param>
    /// <param name="sections">The sections the user may open.</param>
    /// <returns>The controller.</returns>
    private ArcadeController As(Guid key, string name, params string[] sections)
    {
        var user = Substitute.For<IUser>();
        user.Key.Returns(key);
        user.Name.Returns(name);
        user.AllowedSections.Returns(sections);
        var security = Substitute.For<IBackOfficeSecurity>();
        security.CurrentUser.Returns(user);
        var accessor = Substitute.For<IBackOfficeSecurityAccessor>();
        accessor.BackOfficeSecurity.Returns(security);
        return new ArcadeController(_store, accessor);
    }
}
