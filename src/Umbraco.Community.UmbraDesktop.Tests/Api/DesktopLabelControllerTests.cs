using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.DesktopLabel;
using Umbraco.Community.UmbraDesktop.Manifest;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Api;

/// <summary>
/// Exercises the management API behind the desktop label.
/// </summary>
/// <remarks>
/// The permissions get tests of their own, and they are the most important ones here. Every other
/// controller in the package is Settings-only, so copying one is the natural mistake, and it would
/// hide the label from exactly the editors it exists for without failing anything else.
/// </remarks>
public class DesktopLabelControllerTests
{
    /// <summary>Where the controller reads and writes the switches.</summary>
    private readonly IDesktopLabelStore _store = Substitute.For<IDesktopLabelStore>();

    /// <summary>
    /// Builds a controller over the given name and stored switches.
    /// </summary>
    /// <param name="resolvedName">What the resolver reports the App name to be.</param>
    /// <param name="stored">What the store holds, or null for the defaults.</param>
    /// <returns>The controller under test.</returns>
    private DesktopLabelController Build(string? resolvedName = "Contoso Staging", DesktopLabelSettings? stored = null)
    {
        var identity = Substitute.For<IAppIdentityResolver>();
        identity.ResolveName().Returns(resolvedName);
        _store.Read().Returns(stored ?? DesktopLabelSettings.Default);

        return new DesktopLabelController(_store, identity);
    }

    /// <summary>
    /// The policies a member asks for, its inherited ones included.
    /// </summary>
    /// <param name="member">The controller type or one of its actions.</param>
    /// <returns>Every policy named by an <see cref="AuthorizeAttribute"/> on it.</returns>
    private static IEnumerable<string?> Policies(MemberInfo member) =>
        member.GetCustomAttributes<AuthorizeAttribute>(inherit: true).Select(attribute => attribute.Policy);

    /// <summary>The name and the stored switches come back together.</summary>
    [Fact]
    public void Reports_the_name_and_the_stored_switches()
    {
        var controller = Build(stored: new DesktopLabelSettings(true, DesktopLabelCorner.BottomLeft, true));

        var model = Assert.IsType<DesktopLabelResponseModel>(
            Assert.IsType<OkObjectResult>(controller.GetDesktopLabel()).Value);

        Assert.Equal(new DesktopLabelResponseModel("Contoso Staging", true, DesktopLabelCorner.BottomLeft, true), model);
    }

    /// <summary>
    /// A site nothing names reports a null name.
    /// </summary>
    /// <remarks>
    /// Not "Umbraco", which is what the installed app falls back to. On a desktop that says nothing,
    /// so the null goes through and the browser shows the domain instead.
    /// </remarks>
    [Fact]
    public void Reports_a_missing_name_as_null()
    {
        var model = Assert.IsType<DesktopLabelResponseModel>(
            Assert.IsType<OkObjectResult>(Build(resolvedName: null).GetDesktopLabel()).Value);

        Assert.Null(model.Name);
    }

    /// <summary>A save stores exactly the three switches it was given.</summary>
    [Fact]
    public void Stores_the_switches()
    {
        var result = Build().SetDesktopLabel(new DesktopLabelRequestModel(true, DesktopLabelCorner.TopLeft, false));

        Assert.IsType<NoContentResult>(result);
        _store.Received(1).Write(new DesktopLabelSettings(true, DesktopLabelCorner.TopLeft, false));
    }

    /// <summary>
    /// A corner that does not exist is refused rather than stored.
    /// </summary>
    /// <remarks>
    /// The store would read it back as top right, so storing it would leave a setting that says one
    /// thing and does another.
    /// </remarks>
    [Fact]
    public void Refuses_a_corner_that_does_not_exist()
    {
        var result = Build().SetDesktopLabel(new DesktopLabelRequestModel(true, (DesktopLabelCorner)7, false));

        Assert.IsType<BadRequestObjectResult>(result);
        _store.DidNotReceive().Write(Arg.Any<DesktopLabelSettings>());
    }

    /// <summary>Any backoffice user can read the label, an editor with nothing but Content included.</summary>
    [Fact]
    public void Any_backoffice_user_can_read_it()
    {
        var read = typeof(DesktopLabelController).GetMethod(nameof(DesktopLabelController.GetDesktopLabel))!;

        Assert.Contains(AuthorizationPolicies.BackOfficeAccess, Policies(typeof(DesktopLabelController)));
        Assert.DoesNotContain(AuthorizationPolicies.SectionAccessSettings, Policies(typeof(DesktopLabelController)));
        Assert.DoesNotContain(AuthorizationPolicies.SectionAccessSettings, Policies(read));
    }

    /// <summary>
    /// Only users with the Settings section can change it.
    /// </summary>
    /// <remarks>
    /// The same gate as the rest of the Site screen: this changes what every user on the site sees.
    /// </remarks>
    [Fact]
    public void Only_settings_users_can_change_it()
    {
        var write = typeof(DesktopLabelController).GetMethod(nameof(DesktopLabelController.SetDesktopLabel))!;

        Assert.Contains(AuthorizationPolicies.SectionAccessSettings, Policies(write));
    }
}
