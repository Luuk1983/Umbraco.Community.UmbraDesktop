using Umbraco.Community.UmbraDesktop.Connections;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// Exercises <see cref="DesktopConnectionUri"/>, which exists because an address a person typed is
/// not a URL until something has checked, and the thing that checked used to be the
/// <see cref="Uri"/> constructor throwing.
/// </summary>
public class DesktopConnectionUriTests
{
    /// <summary>A path on the remote instance, the shape every caller passes.</summary>
    private const string Path = "/umbraco/management/api/v1/server/status";

    /// <summary>An ordinary address resolves to the path on that origin.</summary>
    [Fact]
    public void TryResolve_BuildsThePathOnTheOrigin()
    {
        Assert.True(DesktopConnectionUri.TryResolve("https://www.example.com", Path, out var uri));
        Assert.Equal($"https://www.example.com{Path}", uri.ToString());
    }

    /// <summary>A trailing slash does not become a double slash in the middle of the path.</summary>
    [Fact]
    public void TryResolve_TrimsATrailingSlash()
    {
        Assert.True(DesktopConnectionUri.TryResolve("https://www.example.com/", Path, out var uri));
        Assert.Equal($"https://www.example.com{Path}", uri.ToString());
    }

    /// <summary>Surrounding whitespace survives a paste and must not decide whether this works.</summary>
    [Fact]
    public void TryResolve_IgnoresSurroundingWhitespace()
    {
        Assert.True(DesktopConnectionUri.TryResolve("  https://www.example.com  ", Path, out var uri));
        Assert.Equal($"https://www.example.com{Path}", uri.ToString());
    }

    /// <summary>
    /// An address that will not parse is refused rather than throwing.
    /// </summary>
    /// <remarks>
    /// This is the bug this type was extracted for, and the first case is the one that found it.
    /// <c>https://localhost:123456</c> reads perfectly and is rejected by every URL parser there is,
    /// because a port cannot exceed 65535 - an extra digit in a port number is an ordinary typo. It
    /// threw <see cref="UriFormatException"/> from the <see cref="Uri"/> constructor, which no catch
    /// filter covered, which took down the whole status endpoint, including the row for the local
    /// instance that needs no network at all.
    /// </remarks>
    [Theory]
    [InlineData("https://localhost:123456")]
    [InlineData("https://example.com:70000")]
    [InlineData("random")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("www.example.com")]
    [InlineData("/umbraco")]
    public void TryResolve_RefusesSomethingThatIsNotAnAbsoluteUrl(string baseUrl)
    {
        Assert.False(DesktopConnectionUri.TryResolve(baseUrl, Path, out var uri));
        Assert.Null(uri);
    }

    /// <summary>
    /// Only http and https are addresses of an Umbraco instance.
    /// </summary>
    /// <remarks>
    /// A parseable URI is not necessarily one worth sending a request to, and these are stored by one
    /// person and used by another. Refusing everything else here means no caller has to wonder.
    /// </remarks>
    [Theory]
    [InlineData("file:///c:/temp")]
    [InlineData("ftp://example.com")]
    [InlineData("javascript:alert(1)")]
    public void TryResolve_RefusesASchemeThatIsNotHttp(string baseUrl)
    {
        Assert.False(DesktopConnectionUri.TryResolve(baseUrl, Path, out _));
    }

    /// <summary>Plain http is allowed, because an internal instance may well not be on TLS.</summary>
    [Fact]
    public void TryResolve_AllowsPlainHttp()
    {
        Assert.True(DesktopConnectionUri.TryResolve("http://intranet.local", Path, out var uri));
        Assert.Equal($"http://intranet.local{Path}", uri.ToString());
    }
}
