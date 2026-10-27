using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using NSubstitute;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.UmbraDesktop.Api;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.PackageSettings;
using Umbraco.Community.UmbraDesktop.Tests.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.PackageSettings;

/// <summary>
/// Exercises the management API behind site-wide package settings.
/// </summary>
/// <remarks>
/// The permission tests matter most. Reading is open to every backoffice user, because a site
/// setting is for everyone, and changing is decided per key on the server, never by the browser.
/// </remarks>
public class SitePackageSettingsControllerTests
{
    /// <summary>The policies the signed-in user meets.</summary>
    private readonly HashSet<string> _met = [];

    /// <summary>The validator registered for <c>My.Package</c>, which refuses a value with a <c>"bad"</c> member.</summary>
    private readonly RefusingValidator _validator = new("bad");

    /// <summary>Where the values are kept: the real store over an in-memory key-value store.</summary>
    private readonly SitePackageSettingsStore _store;

    /// <summary>Creates the store the controllers share, with <see cref="_validator"/> on <c>My.Package</c>.</summary>
    public SitePackageSettingsControllerTests()
    {
        var scopes = Substitute.For<ICoreScopeProvider>();
        _store = new SitePackageSettingsStore(
            new InMemoryKeyValueService(),
            scopes,
            TestValidation.With(("My.Package", _validator)));
    }

    /// <summary>
    /// Builds a controller whose user meets the policies in <see cref="_met"/>.
    /// </summary>
    /// <param name="registrations">What packages registered on the server.</param>
    /// <returns>The controller under test.</returns>
    private SitePackageSettingsController Build(params SitePackageSettingsRegistration[] registrations)
    {
        var authorization = Substitute.For<IAuthorizationService>();
        authorization
            .AuthorizeAsync(Arg.Any<ClaimsPrincipal>(), Arg.Any<object?>(), Arg.Any<string>())
            .Returns(call => _met.Contains(call.ArgAt<string>(2))
                ? AuthorizationResult.Success()
                : AuthorizationResult.Failed());

        return new SitePackageSettingsController(_store, new SitePackageSettingsPermissions(registrations), authorization)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    /// <summary>
    /// The model of a 200 answer.
    /// </summary>
    /// <param name="result">The action's result.</param>
    /// <returns>The model.</returns>
    private static SitePackageSettingsResponseModel Model(IActionResult result) =>
        Assert.IsType<SitePackageSettingsResponseModel>(Assert.IsType<OkObjectResult>(result).Value);

    /// <summary>
    /// The status code of an answer that is not a 200.
    /// </summary>
    /// <param name="result">The action's result.</param>
    /// <returns>The status code.</returns>
    private static int? Status(IActionResult result) => (result as IStatusCodeActionResult)?.StatusCode;

    /// <summary>
    /// The reasons a 400 gives, where the browser reads them: a <c>problems</c> member of a problem
    /// details body with a type, which Umbraco's client passes to the page untouched.
    /// </summary>
    /// <remarks>
    /// Not a validation problem's <c>errors</c>: the first real run showed Umbraco's serializer
    /// rewrites that dictionary into its own <c>[{"$.value": [...]}]</c> shape.
    /// </remarks>
    /// <param name="result">The action's result.</param>
    /// <returns>The reasons.</returns>
    private static string[] Problems(IActionResult result)
    {
        var answer = Assert.IsType<BadRequestObjectResult>(result);
        var details = Assert.IsType<ProblemDetails>(answer.Value);
        Assert.Equal(StatusCodes.Status400BadRequest, details.Status);
        Assert.Equal(SitePackageSettingsController.RefusedType, details.Type);
        return Assert.IsType<string[]>(details.Extensions[SitePackageSettingsController.ProblemsMember]);
    }

    /// <summary>The controller is open to every backoffice user; no section policy sits on it.</summary>
    [Fact]
    public void Lets_every_backoffice_user_read()
    {
        var policies = typeof(SitePackageSettingsController)
            .GetCustomAttributes<AuthorizeAttribute>(inherit: true)
            .Select(attribute => attribute.Policy);

        // The base class adds core's feature gate beside it, which is no section.
        Assert.Contains(AuthorizationPolicies.BackOfficeAccess, policies);
        Assert.DoesNotContain(policies, policy => policy?.StartsWith("SectionAccess", StringComparison.Ordinal) is true);
    }

    /// <summary>
    /// No action declares a 401 or 403 itself. Core's security filter adds both to every backoffice
    /// operation, and a second one makes it throw, which took down the whole management API's
    /// OpenAPI document on the first real run.
    /// </summary>
    [Fact]
    public void Leaves_401_and_403_to_core()
    {
        var declared = typeof(SitePackageSettingsController)
            .GetMethods()
            .SelectMany(method => method.GetCustomAttributes<ProducesResponseTypeAttribute>())
            .Select(attribute => attribute.StatusCode);

        Assert.DoesNotContain(StatusCodes.Status401Unauthorized, declared);
        Assert.DoesNotContain(StatusCodes.Status403Forbidden, declared);
    }

    /// <summary>Nothing stored reads as a null value, with whether this user may change it.</summary>
    [Fact]
    public async Task Reads_nothing_stored_as_null()
    {
        _met.Add(AuthorizationPolicies.SectionAccessSettings);

        var model = Model(await Build().GetSitePackageSettings("My.Package"));

        Assert.Equal(new SitePackageSettingsResponseModel(null, true), model);
    }

    /// <summary>A user without the change policy can still read, and is told they cannot change.</summary>
    [Fact]
    public async Task Reads_for_a_user_who_cannot_change()
    {
        _store.Replace("My.Package", "1");

        var model = Model(await Build().GetSitePackageSettings("My.Package"));

        Assert.Equal(new SitePackageSettingsResponseModel("1", false), model);
    }

    /// <summary>A user who meets the default policy replaces the value, and gets it back.</summary>
    [Fact]
    public async Task Replaces_for_a_settings_user()
    {
        _met.Add(AuthorizationPolicies.SectionAccessSettings);

        var model = Model(await Build().SetSitePackageSettings("My.Package", new SitePackageSettingsRequestModel("""{"a":1}""")));

        Assert.Equal(new SitePackageSettingsResponseModel("""{"a":1}""", true), model);
        Assert.Equal("""{"a":1}""", _store.Read("My.Package"));
    }

    /// <summary>A user who does not meet the policy is refused with 403, and nothing is stored.</summary>
    [Fact]
    public async Task Refuses_a_change_from_a_user_without_the_policy()
    {
        _met.Add(AuthorizationPolicies.SectionAccessMedia);

        var replace = await Build().SetSitePackageSettings("My.Package", new SitePackageSettingsRequestModel("1"));
        var patch = await Build().PatchSitePackageSettings("My.Package", new SitePackageSettingsPatchRequestModel("""{"a":1}"""));

        Assert.Equal(StatusCodes.Status403Forbidden, Status(replace));
        Assert.Equal(StatusCodes.Status403Forbidden, Status(patch));
        Assert.Null(_store.Read("My.Package"));
    }

    /// <summary>A registered policy decides, so a Media user may change a setting the package opened to them.</summary>
    [Fact]
    public async Task Lets_the_registered_policy_change()
    {
        _met.Add(AuthorizationPolicies.SectionAccessMedia);
        var registration = new SitePackageSettingsRegistration("My.Package", AuthorizationPolicies.SectionAccessMedia);

        var model = Model(await Build(registration).PatchSitePackageSettings("My.Package", new SitePackageSettingsPatchRequestModel("""{"a":1}""")));

        Assert.Equal(new SitePackageSettingsResponseModel("""{"a":1}""", true), model);
    }

    /// <summary>A patch merges into what another user stored, and answers with the merged value.</summary>
    [Fact]
    public async Task Patches_into_what_is_stored()
    {
        _met.Add(AuthorizationPolicies.SectionAccessSettings);
        _store.Replace("My.Package", """{"kept":{"a":true}}""");

        var model = Model(await Build().PatchSitePackageSettings("My.Package", new SitePackageSettingsPatchRequestModel("""{"kept":{"b":true}}""")));

        Assert.Equal("""{"kept":{"a":true,"b":true}}""", model.Value);
    }

    /// <summary>A key the store cannot keep is a 400 on every action, before any permission is asked.</summary>
    [Fact]
    public async Task Refuses_a_bad_key()
    {
        _met.Add(AuthorizationPolicies.SectionAccessSettings);
        var controller = Build();

        Assert.Equal(StatusCodes.Status400BadRequest, Status(await controller.GetSitePackageSettings(" ")));
        Assert.Equal(StatusCodes.Status400BadRequest, Status(await controller.SetSitePackageSettings("Umbraco.Community.UmbraDesktop", new SitePackageSettingsRequestModel("1"))));
        Assert.Equal(StatusCodes.Status400BadRequest, Status(await controller.PatchSitePackageSettings(new string('a', SitePackageSettingsKey.MaxLength + 1), new SitePackageSettingsPatchRequestModel("{}"))));
    }

    /// <summary>A value that is not JSON is refused, since every reader parses what it reads.</summary>
    [Fact]
    public async Task Refuses_a_value_that_is_not_json()
    {
        _met.Add(AuthorizationPolicies.SectionAccessSettings);

        var result = await Build().SetSitePackageSettings("My.Package", new SitePackageSettingsRequestModel("{not json"));

        Assert.Equal(["The value is not JSON."], Problems(result));
        Assert.Null(_store.Read("My.Package"));
    }

    /// <summary>A patch must be an object: anything else would replace the whole value, which is what a replace is for.</summary>
    [Theory]
    [InlineData("[1]")]
    [InlineData("1")]
    [InlineData("null")]
    [InlineData("{not json")]
    public async Task Refuses_a_patch_that_is_not_an_object(string patch)
    {
        _met.Add(AuthorizationPolicies.SectionAccessSettings);

        var result = await Build().PatchSitePackageSettings("My.Package", new SitePackageSettingsPatchRequestModel(patch));

        Assert.Equal(StatusCodes.Status400BadRequest, Status(result));
    }

    /// <summary>A value longer than the limit is refused, whether it arrives whole or grows by a patch.</summary>
    [Fact]
    public async Task Refuses_a_value_over_the_limit()
    {
        _met.Add(AuthorizationPolicies.SectionAccessSettings);
        var longString = new string('a', SitePackageSettingsStore.MaxValueLength);
        _store.Replace("My.Package", "{}");

        var replace = await Build().SetSitePackageSettings("My.Package", new SitePackageSettingsRequestModel($"\"{longString}\""));
        var patch = await Build().PatchSitePackageSettings("My.Package", new SitePackageSettingsPatchRequestModel($$"""{"a":"{{longString}}"}"""));

        Assert.Equal(StatusCodes.Status400BadRequest, Status(replace));
        Assert.Equal(StatusCodes.Status400BadRequest, Status(patch));
        Assert.Equal("{}", _store.Read("My.Package"));
    }

    /// <summary>A value the package's validator refuses is a 400 with its reasons, and nothing is stored.</summary>
    [Fact]
    public async Task Refuses_a_value_the_package_s_validator_refuses()
    {
        _met.Add(AuthorizationPolicies.SectionAccessSettings);

        var result = await Build().SetSitePackageSettings("My.Package", new SitePackageSettingsRequestModel("""{"bad":1}"""));

        Assert.Equal(["\"bad\" is not allowed."], Problems(result));
        Assert.Null(_store.Read("My.Package"));
    }

    /// <summary>
    /// A patch is checked as the value it would make, merged with what is stored, so two changes that
    /// are each fine alone cannot together store something the package refuses.
    /// </summary>
    [Fact]
    public async Task Refuses_a_patch_whose_merged_value_the_validator_refuses()
    {
        _met.Add(AuthorizationPolicies.SectionAccessSettings);
        _store.Replace("My.Package", """{"a":1}""");

        var result = await Build().PatchSitePackageSettings("My.Package", new SitePackageSettingsPatchRequestModel("""{"bad":true}"""));

        Assert.Equal(["\"bad\" is not allowed."], Problems(result));
        Assert.Equal("""{"a":1}""", _store.Read("My.Package"));
        Assert.Equal("""{"a":1,"bad":true}""", _validator.Seen[^1]);
    }

    /// <summary>Every 400 gives its reason the same way, so the browser treats them alike.</summary>
    [Fact]
    public async Task Gives_every_refusal_its_reason()
    {
        _met.Add(AuthorizationPolicies.SectionAccessSettings);
        var controller = Build();

        Assert.Single(Problems(await controller.GetSitePackageSettings(" ")));
        Assert.Equal(["The patch is not a JSON object."], Problems(await controller.PatchSitePackageSettings("My.Package", new SitePackageSettingsPatchRequestModel("[1]"))));
        Assert.Single(Problems(await controller.SetSitePackageSettings("My.Package", new SitePackageSettingsRequestModel($"\"{new string('a', SitePackageSettingsStore.MaxValueLength)}\""))));
    }
}
