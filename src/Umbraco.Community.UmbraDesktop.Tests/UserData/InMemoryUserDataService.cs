using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Services.OperationStatus;
using Umbraco.Cms.Infrastructure.Persistence.Querying;

namespace Umbraco.Community.UmbraDesktop.Tests.UserData;

/// <summary>
/// A stand-in for Umbraco's per-user key/value store that keeps rows in memory.
/// </summary>
/// <remarks>
/// <para>
/// A fake rather than a mock, for the same reason <c>InMemoryKeyValueService</c> is one: every test
/// here is about which rows are left afterwards, and a mock would have to be told the answer it is
/// supposed to be checking.
/// </para>
/// <para>
/// It reproduces two behaviours of the real store that the handler has to cope with. Paging is real,
/// so a caller that ignores <see cref="PagedModel{T}.Total"/> and reads only the first page is caught
/// here rather than on a site where somebody accumulated more rows than the page size. And there is
/// deliberately no uniqueness constraint on group and identifier, because the real table has none.
/// </para>
/// </remarks>
internal sealed class InMemoryUserDataService : IUserDataService
{
    /// <summary>The rows currently stored, in insertion order.</summary>
    private readonly List<IUserData> _rows = [];

    /// <summary>Everything currently stored.</summary>
    public IReadOnlyList<IUserData> Rows => _rows;

    /// <summary>How many times a page was requested, so a test can assert the paging actually looped.</summary>
    public int Reads { get; private set; }

    /// <summary>When set, every delete fails with this status instead of removing a row.</summary>
    public UserDataOperationStatus? DeleteFailure { get; set; }

    /// <summary>
    /// When true, every read throws instead of answering.
    /// </summary>
    /// <remarks>
    /// The store is a real service hitting a real database, so a transient failure is a throw rather
    /// than a status. It matters here more than it would elsewhere: a throw escaping the handler
    /// aborts the user delete it is running inside.
    /// </remarks>
    public bool ReadsThrow { get; set; }

    /// <summary>
    /// Adds a row directly, bypassing the service, the way an earlier session would have left it.
    /// </summary>
    /// <param name="userKey">Whose row it is.</param>
    /// <param name="group">The group it belongs to.</param>
    /// <param name="identifier">What the row is.</param>
    /// <param name="value">The stored payload.</param>
    /// <returns>The row's key.</returns>
    public Guid Seed(Guid userKey, string group, string identifier, string value = "{}")
    {
        var row = new Cms.Core.Models.Membership.UserData
        {
            Key = Guid.NewGuid(),
            UserKey = userKey,
            Group = group,
            Identifier = identifier,
            Value = value,
        };

        _rows.Add(row);
        return row.Key;
    }

    /// <inheritdoc />
    public Task<IUserData?> GetAsync(Guid key) =>
        Task.FromResult(_rows.FirstOrDefault(row => row.Key == key));

    /// <inheritdoc />
    public Task<PagedModel<IUserData>> GetAsync(int skip, int take, IUserDataFilter? filter = null)
    {
        Reads++;

        if (ReadsThrow)
        {
            throw new InvalidOperationException("The store is unavailable.");
        }

        IEnumerable<IUserData> matching = _rows;

        if (filter?.UserKeys?.Count > 0)
        {
            matching = matching.Where(row => filter.UserKeys.Contains(row.UserKey));
        }

        if (filter?.Groups?.Count > 0)
        {
            matching = matching.Where(row => filter.Groups.Contains(row.Group));
        }

        if (filter?.Identifiers?.Count > 0)
        {
            matching = matching.Where(row => filter.Identifiers.Contains(row.Identifier));
        }

        var all = matching.ToList();

        return Task.FromResult(new PagedModel<IUserData>(all.Count, all.Skip(skip).Take(take)));
    }

    /// <inheritdoc />
    public Task<Attempt<IUserData, UserDataOperationStatus>> CreateAsync(IUserData userData)
    {
        _rows.Add(userData);
        return Task.FromResult(Attempt.SucceedWithStatus(UserDataOperationStatus.Success, userData));
    }

    /// <inheritdoc />
    public Task<Attempt<IUserData, UserDataOperationStatus>> UpdateAsync(IUserData userData)
    {
        var at = _rows.FindIndex(row => row.Key == userData.Key);

        if (at < 0)
        {
            return Task.FromResult(Attempt.FailWithStatus(UserDataOperationStatus.NotFound, userData));
        }

        _rows[at] = userData;
        return Task.FromResult(Attempt.SucceedWithStatus(UserDataOperationStatus.Success, userData));
    }

    /// <inheritdoc />
    public Task<Attempt<UserDataOperationStatus>> DeleteAsync(Guid key)
    {
        if (DeleteFailure is { } failure)
        {
            return Task.FromResult(Attempt.Fail(failure));
        }

        var at = _rows.FindIndex(row => row.Key == key);

        if (at < 0)
        {
            return Task.FromResult(Attempt.Fail(UserDataOperationStatus.NotFound));
        }

        _rows.RemoveAt(at);
        return Task.FromResult(Attempt.Succeed(UserDataOperationStatus.Success));
    }
}
