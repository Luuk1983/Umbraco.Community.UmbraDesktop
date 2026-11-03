using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Media.Guidelines;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Guidelines;

/// <summary>
/// The management API behind the media guidelines (issue #179).
/// </summary>
/// <remarks>
/// The permissions get tests of their own, as the desktop label's do: every editor who drops a file
/// into a Media Manager reads the guidelines, so a Settings-only read would switch the check off for
/// exactly the people it is for, and fail nothing.
/// </remarks>
public class MediaGuidelinesControllerTests
{
    /// <summary>Where the controller reads and writes the guidelines.</summary>
    private readonly IMediaGuidelinesStore _store = Substitute.For<IMediaGuidelinesStore>();

    /// <summary>
    /// A controller over the given stored guidelines.
    /// </summary>
    /// <param name="stored">What the store holds, or null for the defaults.</param>
    /// <returns>The controller under test.</returns>
    private MediaGuidelinesController Build(MediaGuidelines? stored = null)
    {
        _store.Read().Returns(stored ?? MediaGuidelines.Default);
        return new MediaGuidelinesController(_store);
    }

    /// <summary>
    /// The policies a member asks for, its inherited ones included.
    /// </summary>
    /// <param name="member">The controller type or one of its actions.</param>
    /// <returns>Every policy named by an <see cref="AuthorizeAttribute"/> on it.</returns>
    private static IEnumerable<string?> Policies(MemberInfo member) =>
        member.GetCustomAttributes<AuthorizeAttribute>(inherit: true).Select(attribute => attribute.Policy);

    /// <summary>A valid set of guidelines to change one field of.</summary>
    private static MediaGuidelines Valid => MediaGuidelines.Default;

    /// <summary>The stored guidelines come back as they are.</summary>
    [Fact]
    public void Reports_the_stored_guidelines()
    {
        var stored = Valid with { Location = new LocationGuideline(false) };

        var model = Assert.IsType<MediaGuidelines>(Assert.IsType<OkObjectResult>(Build(stored).GetGuidelines()).Value);

        Assert.Equal(stored, model);
    }

    /// <summary>A save stores exactly what it was given.</summary>
    [Fact]
    public void Stores_the_guidelines()
    {
        var sent = Valid with { MaxSize = new MaxSizeGuideline(true, 1920) };

        var result = Build().SetGuidelines(sent);

        Assert.IsType<NoContentResult>(result);
        _store.Received(1).Write(sent);
    }

    /// <summary>
    /// What the store would read back as something else is refused rather than stored, so a setting
    /// never says one thing and does another.
    /// </summary>
    /// <param name="side">The longest side sent.</param>
    /// <param name="quality">The quality sent.</param>
    /// <param name="format">The PNG photo row sent, as a number.</param>
    [Theory]
    [InlineData(0, 80, 3)]
    [InlineData(MediaGuidelines.LargestLongestSide + 1, 80, 3)]
    [InlineData(2560, 0, 3)]
    [InlineData(2560, 101, 3)]
    [InlineData(2560, 80, 9)]
    public void Refuses_values_the_check_could_not_use(int side, int quality, int format)
    {
        var sent = Valid with
        {
            MaxSize = new MaxSizeGuideline(true, side),
            Formats = Valid.Formats with { Quality = quality, PngPhoto = (MediaGuidelineFormat)format },
        };

        var result = Build().SetGuidelines(sent);

        Assert.IsType<BadRequestObjectResult>(result);
        _store.DidNotReceive().Write(Arg.Any<MediaGuidelines>());
    }

    /// <summary>A request with a part missing is refused, rather than storing a null the reader would replace.</summary>
    [Fact]
    public void Refuses_a_request_with_a_part_missing()
    {
        var result = Build().SetGuidelines(Valid with { Formats = null! });

        Assert.IsType<BadRequestObjectResult>(result);
        _store.DidNotReceive().Write(Arg.Any<MediaGuidelines>());
    }

    /// <summary>Any backoffice user can read them: every editor who uploads is checked against them.</summary>
    [Fact]
    public void Any_backoffice_user_can_read_them()
    {
        var read = typeof(MediaGuidelinesController).GetMethod(nameof(MediaGuidelinesController.GetGuidelines))!;

        Assert.Contains(AuthorizationPolicies.BackOfficeAccess, Policies(typeof(MediaGuidelinesController)));
        Assert.DoesNotContain(AuthorizationPolicies.SectionAccessSettings, Policies(typeof(MediaGuidelinesController)));
        Assert.DoesNotContain(AuthorizationPolicies.SectionAccessSettings, Policies(read));
    }

    /// <summary>Only users with the Settings section can change them: they apply to the whole site.</summary>
    [Fact]
    public void Only_settings_users_can_change_them()
    {
        var write = typeof(MediaGuidelinesController).GetMethod(nameof(MediaGuidelinesController.SetGuidelines))!;

        Assert.Contains(AuthorizationPolicies.SectionAccessSettings, Policies(write));
    }
}
