using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Community.UmbraDesktop.Api;
using Umbraco.Community.UmbraDesktop.Api.ViewModels;
using Umbraco.Community.UmbraDesktop.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Exercises <see cref="ConnectionsController"/>: the shape of what the browser is given back, and
/// above all that a client secret is never part of it.
/// </summary>
public class ConnectionsControllerTests
{
    /// <summary>Builds a controller over an empty in-memory store.</summary>
    /// <returns>The controller under test and the store behind it.</returns>
    private static (ConnectionsController Controller, DesktopConnectionStore Store) Create()
    {
        var store = new DesktopConnectionStore(new InMemoryKeyValueService(), new EphemeralDataProtectionProvider());

        return (new ConnectionsController(store), store);
    }

    /// <summary>Builds a request model with sensible values.</summary>
    /// <param name="name">The connection's display name.</param>
    /// <param name="clientSecret">The secret to send, or <c>null</c> to send none.</param>
    /// <returns>The request model.</returns>
    private static DesktopConnectionRequestModel Request(string name = "Client A", string? clientSecret = "the-secret") =>
        new(name, "https://client-a.example.com", "#ff0000", "umbraco-back-office-desktop", clientSecret);

    /// <summary>Reads the value out of an action result that is expected to be a 200.</summary>
    /// <typeparam name="T">The value's type.</typeparam>
    /// <param name="result">The action result to unwrap.</param>
    /// <returns>The value.</returns>
    private static T Value<T>(IActionResult result) => Assert.IsType<T>(Assert.IsType<OkObjectResult>(result).Value);

    /// <summary>With nothing configured, the listing is empty rather than absent.</summary>
    [Fact]
    public void GetConnections_IsEmpty_WhenNothingIsConfigured()
    {
        var (controller, _) = Create();

        Assert.Empty(Value<DesktopConnectionResponseModel[]>(controller.GetConnections()));
    }

    /// <summary>A created connection comes back with an id and is then listed.</summary>
    [Fact]
    public void CreateConnection_StoresIt()
    {
        var (controller, _) = Create();

        var created = Value<DesktopConnectionResponseModel>(controller.CreateConnection(Request()));

        Assert.NotEqual(Guid.Empty, created.Id);
        Assert.Equal("Client A", created.Name);
        Assert.True(created.HasClientSecret);
        Assert.Equal(created.Id, Assert.Single(Value<DesktopConnectionResponseModel[]>(controller.GetConnections())).Id);
    }

    /// <summary>
    /// The secret never leaves the server, in any response.
    /// </summary>
    /// <remarks>
    /// Asserted against the serialised JSON rather than against the model's properties, because the
    /// failure this guards against is somebody adding a field later, and a property-by-property
    /// assertion would keep passing while that happened.
    /// </remarks>
    [Fact]
    public void Responses_NeverContainTheSecret()
    {
        var (controller, _) = Create();

        var created = controller.CreateConnection(Request());
        var listed = controller.GetConnections();

        var json = JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(created).Value)
            + JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(listed).Value);
        Assert.DoesNotContain("the-secret", json, StringComparison.Ordinal);
    }

    /// <summary>
    /// Updating without a secret keeps the stored one, which is how renaming a connection in the UI
    /// does not wipe its credentials: the browser was never given the secret to send back.
    /// </summary>
    [Fact]
    public void UpdateConnection_WithoutASecret_KeepsTheStoredOne()
    {
        var (controller, store) = Create();
        var created = Value<DesktopConnectionResponseModel>(controller.CreateConnection(Request()));

        var updated = Value<DesktopConnectionResponseModel>(
            controller.UpdateConnection(created.Id, Request(name: "Client A renamed", clientSecret: null)));

        Assert.Equal("Client A renamed", updated.Name);
        Assert.True(updated.HasClientSecret);
        Assert.Equal("the-secret", store.GetClientSecret(created.Id));
    }

    /// <summary>Updating a connection that does not exist is a 404, not a silent create.</summary>
    [Fact]
    public void UpdateConnection_IsNotFound_ForAnUnknownConnection()
    {
        var (controller, _) = Create();

        Assert.IsType<NotFoundResult>(controller.UpdateConnection(Guid.NewGuid(), Request()));
    }

    /// <summary>Deleting removes the connection from the listing.</summary>
    [Fact]
    public void DeleteConnection_RemovesIt()
    {
        var (controller, _) = Create();
        var created = Value<DesktopConnectionResponseModel>(controller.CreateConnection(Request()));

        Assert.IsType<OkResult>(controller.DeleteConnection(created.Id));
        Assert.Empty(Value<DesktopConnectionResponseModel[]>(controller.GetConnections()));
    }
}
