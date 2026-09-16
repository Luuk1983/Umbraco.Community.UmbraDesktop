using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.UmbraDesktop.Connections;

/// <summary>
/// Reads and writes the configured connections, keeping each client secret encrypted at rest.
/// </summary>
/// <remarks>
/// <para>
/// Umbraco's key/value store is used rather than a table of our own: this is a handful of rows that
/// never needs querying, and a migration would be more machinery than the data deserves.
/// </para>
/// <para>
/// Connections and secrets live under two separate keys so that listing connections, which happens
/// on every screen, never touches the ciphertext. The secrets key holds a map rather than a key per
/// connection because <see cref="IKeyValueService"/> has no delete: rewriting a map is how a secret
/// is actually removed rather than blanked.
/// </para>
/// <para>
/// The honest limit of this, worth knowing before trusting it: anyone who can run code on this
/// instance can decrypt these, because the data protection key ring is right here. That is true of
/// every stored credential, and it is the reason the instance holding connections should be your own
/// rather than a client's.
/// </para>
/// </remarks>
/// <param name="keyValueService">Umbraco's key/value store, where both keys live.</param>
/// <param name="dataProtectionProvider">Supplies the protector that encrypts each secret.</param>
public sealed class DesktopConnectionStore(
    IKeyValueService keyValueService,
    IDataProtectionProvider dataProtectionProvider)
{
    /// <summary>Key holding the connections themselves, as a JSON array.</summary>
    private const string ConnectionsKey = "Umbraco.Community.UmbraDesktop.Connections";

    /// <summary>Key holding the encrypted secrets, as a JSON object of connection id to ciphertext.</summary>
    private const string SecretsKey = "Umbraco.Community.UmbraDesktop.ConnectionSecrets";

    /// <summary>
    /// Purpose string binding the protector to this use.
    /// </summary>
    /// <remarks>
    /// Purposes isolate ciphertexts: a payload encrypted for another purpose cannot be decrypted
    /// here even though the key ring is shared, so a bug elsewhere cannot be pointed at these.
    /// </remarks>
    private const string ProtectorPurpose = "Umbraco.Community.UmbraDesktop.ConnectionSecrets.v1";

    /// <summary>The protector used for every secret written and read by this store.</summary>
    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector(ProtectorPurpose);

    /// <summary>
    /// Gets every configured connection.
    /// </summary>
    /// <returns>The connections, or an empty list when none are configured.</returns>
    public IReadOnlyList<DesktopConnection> GetAll() => ReadConnections();

    /// <summary>
    /// Gets one connection by id.
    /// </summary>
    /// <param name="id">The connection's id.</param>
    /// <returns>The connection, or <c>null</c> when no connection has that id.</returns>
    public DesktopConnection? Get(Guid id) => ReadConnections().FirstOrDefault(connection => connection.Id == id);

    /// <summary>
    /// Adds a connection, or replaces the one that already has its id.
    /// </summary>
    /// <param name="connection">The connection to store.</param>
    /// <param name="clientSecret">
    /// The secret to store, or <c>null</c> to keep whichever secret is already stored. Null means
    /// unchanged rather than empty because the browser is never given the secret and so cannot send
    /// it back: without this, renaming a connection would wipe its credentials.
    /// </param>
    public void Save(DesktopConnection connection, string? clientSecret)
    {
        var connections = ReadConnections();
        connections.RemoveAll(existing => existing.Id == connection.Id);
        connections.Add(connection);
        WriteConnections(connections);

        if (clientSecret is null)
        {
            return;
        }

        var secrets = ReadSecrets();
        secrets[connection.Id.ToString()] = _protector.Protect(clientSecret);
        WriteSecrets(secrets);
    }

    /// <summary>
    /// Removes a connection and the secret stored against it.
    /// </summary>
    /// <param name="id">The connection's id.</param>
    public void Delete(Guid id)
    {
        var connections = ReadConnections();
        connections.RemoveAll(existing => existing.Id == id);
        WriteConnections(connections);

        var secrets = ReadSecrets();
        if (secrets.Remove(id.ToString()))
        {
            WriteSecrets(secrets);
        }
    }

    /// <summary>
    /// Gets a connection's client secret in the clear.
    /// </summary>
    /// <remarks>
    /// Only the code that exchanges credentials for a token has any business calling this. Nothing
    /// that can reach a response body should.
    /// </remarks>
    /// <param name="id">The connection's id.</param>
    /// <returns>The secret, or <c>null</c> when none is stored for that connection.</returns>
    public string? GetClientSecret(Guid id) =>
        ReadSecrets().TryGetValue(id.ToString(), out var protectedSecret)
            ? _protector.Unprotect(protectedSecret)
            : null;

    /// <summary>
    /// Says whether a connection has a secret stored, without revealing it.
    /// </summary>
    /// <remarks>This is the only thing about a secret the browser is ever told.</remarks>
    /// <param name="id">The connection's id.</param>
    /// <returns><c>true</c> when a secret is stored.</returns>
    public bool HasClientSecret(Guid id) => ReadSecrets().ContainsKey(id.ToString());

    /// <summary>Reads the stored connections into a list that callers may modify.</summary>
    /// <returns>The stored connections, or an empty list when the key has never been written.</returns>
    private List<DesktopConnection> ReadConnections()
    {
        var json = keyValueService.GetValue(ConnectionsKey);

        return string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<List<DesktopConnection>>(json) ?? [];
    }

    /// <summary>Writes the connections back, replacing whatever was stored.</summary>
    /// <param name="connections">The full set of connections to store.</param>
    private void WriteConnections(IReadOnlyList<DesktopConnection> connections) =>
        keyValueService.SetValue(ConnectionsKey, JsonSerializer.Serialize(connections));

    /// <summary>Reads the encrypted secrets into a map that callers may modify.</summary>
    /// <returns>Connection id to ciphertext, empty when the key has never been written.</returns>
    private Dictionary<string, string> ReadSecrets()
    {
        var json = keyValueService.GetValue(SecretsKey);

        return string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? [];
    }

    /// <summary>Writes the encrypted secrets back, replacing whatever was stored.</summary>
    /// <param name="secrets">Connection id to ciphertext.</param>
    private void WriteSecrets(IReadOnlyDictionary<string, string> secrets) =>
        keyValueService.SetValue(SecretsKey, JsonSerializer.Serialize(secrets));
}
