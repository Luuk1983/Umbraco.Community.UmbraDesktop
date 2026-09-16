using Microsoft.AspNetCore.DataProtection;

using Umbraco.Community.UmbraDesktop.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Exercises <see cref="DesktopConnectionStore"/>: what survives a round trip through the key/value
/// store, and the one property the whole feature rests on, that a client secret goes in and never
/// comes back out through the listing.
/// </summary>
public class DesktopConnectionStoreTests
{
    /// <summary>
    /// Builds a store over an in-memory key/value service and real, throwaway data protection.
    /// </summary>
    /// <remarks>
    /// <see cref="EphemeralDataProtectionProvider"/> is genuine cryptography with a key ring that
    /// lives and dies with the test, so the encryption path is exercised rather than stubbed out.
    /// </remarks>
    /// <returns>The store under test, and the key/value service behind it.</returns>
    private static (DesktopConnectionStore Store, InMemoryKeyValueService KeyValues) Create()
    {
        var keyValues = new InMemoryKeyValueService();
        return (new DesktopConnectionStore(keyValues, new EphemeralDataProtectionProvider()), keyValues);
    }

    /// <summary>Builds a connection with sensible values, so a test only states what it cares about.</summary>
    /// <param name="name">The connection's display name.</param>
    /// <returns>A connection that has never been saved.</returns>
    private static DesktopConnection Connection(string name = "Client A") =>
        new(Guid.NewGuid(), name, "https://client-a.example.com", "#ff0000", "umbraco-back-office-desktop");

    /// <summary>A store with nothing saved lists nothing, rather than failing on absent state.</summary>
    [Fact]
    public void GetAll_IsEmpty_WhenNothingSaved()
    {
        var (store, _) = Create();

        Assert.Empty(store.GetAll());
    }

    /// <summary>A saved connection comes back with its fields intact.</summary>
    [Fact]
    public void Save_ThenGetAll_ReturnsTheConnection()
    {
        var (store, _) = Create();
        var connection = Connection();

        store.Save(connection, "the-secret");

        var saved = Assert.Single(store.GetAll());
        Assert.Equal(connection.Id, saved.Id);
        Assert.Equal("Client A", saved.Name);
        Assert.Equal("https://client-a.example.com", saved.BaseUrl);
        Assert.Equal("#ff0000", saved.Colour);
        Assert.Equal("umbraco-back-office-desktop", saved.ClientId);
    }

    /// <summary>
    /// The secret is retrievable by the one caller that needs it, the thing that fetches tokens.
    /// </summary>
    [Fact]
    public void GetClientSecret_ReturnsWhatWasSaved()
    {
        var (store, _) = Create();
        var connection = Connection();

        store.Save(connection, "the-secret");

        Assert.Equal("the-secret", store.GetClientSecret(connection.Id));
    }

    /// <summary>
    /// The secret is never written in the clear. This is the property the whole design rests on, so
    /// it is asserted against the raw stored bytes rather than trusted.
    /// </summary>
    [Fact]
    public void Save_DoesNotStoreTheSecretInPlainText()
    {
        var (store, keyValues) = Create();

        store.Save(Connection(), "the-secret");

        var stored = string.Join(
            "\n",
            keyValues.FindByKeyPrefix(string.Empty)!.Values);
        Assert.DoesNotContain("the-secret", stored, StringComparison.Ordinal);
    }

    /// <summary>
    /// Saving without a secret keeps the one already stored, so editing a connection's name in the
    /// UI does not silently wipe its credentials. The UI cannot send the secret back, because it is
    /// never given it, so an absent secret has to mean "unchanged" rather than "empty".
    /// </summary>
    [Fact]
    public void Save_WithoutSecret_KeepsTheExistingOne()
    {
        var (store, _) = Create();
        var connection = Connection();
        store.Save(connection, "the-secret");

        store.Save(connection with { Name = "Client A renamed" }, clientSecret: null);

        Assert.Equal("the-secret", store.GetClientSecret(connection.Id));
        Assert.Equal("Client A renamed", Assert.Single(store.GetAll()).Name);
    }

    /// <summary>Deleting a connection takes its secret with it, rather than orphaning it in storage.</summary>
    [Fact]
    public void Delete_RemovesTheConnectionAndItsSecret()
    {
        var (store, _) = Create();
        var connection = Connection();
        store.Save(connection, "the-secret");

        store.Delete(connection.Id);

        Assert.Empty(store.GetAll());
        Assert.Null(store.GetClientSecret(connection.Id));
    }

    /// <summary>
    /// A connection reports whether it has a secret, because that is the only thing the UI is ever
    /// allowed to learn about it.
    /// </summary>
    [Fact]
    public void HasClientSecret_IsFalse_UntilOneIsSaved()
    {
        var (store, _) = Create();
        var connection = Connection();

        store.Save(connection, clientSecret: null);
        Assert.False(store.HasClientSecret(connection.Id));

        store.Save(connection, "the-secret");
        Assert.True(store.HasClientSecret(connection.Id));
    }
}
