using NSubstitute;
using Umbraco.Cms.Core.Scoping;

namespace Umbraco.Community.UmbraDesktop.Accessories.Tests.StickyNotes;

/// <summary>
/// A scope provider that records what happens to its scopes, so a test can see whether the store
/// takes the database lock before it reads and completes the scope after it writes.
/// </summary>
/// <remarks>
/// No real transaction or lock behind it: what the tests can pin is the order of calls, which is
/// what decides whether two servers can interleave a read-modify-write. The lock itself is Umbraco's.
/// </remarks>
internal static class RecordingScopeProvider
{
    /// <summary>A scope provider writing "scope", "lock:&lt;ids&gt;", "complete" and "dispose" to a log.</summary>
    /// <param name="log">Where to record, shared with the key-value fake's own call log.</param>
    /// <returns>The provider.</returns>
    public static ICoreScopeProvider Create(List<string> log)
    {
        var provider = Substitute.For<ICoreScopeProvider>();
        provider.CreateCoreScope().ReturnsForAnyArgs(_ =>
        {
            log.Add("scope");
            var scope = Substitute.For<ICoreScope>();
            scope.When(s => s.WriteLock(Arg.Any<int[]>()))
                .Do(call => log.Add($"lock:{string.Join(",", call.Arg<int[]>())}"));
            scope.When(s => s.Complete()).Do(_ => log.Add("complete"));
            scope.When(s => s.Dispose()).Do(_ => log.Add("dispose"));
            return scope;
        });
        return provider;
    }
}
