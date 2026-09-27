using Umbraco.Community.UmbraDesktop.DesktopLabel;

namespace Umbraco.Community.UmbraDesktop.Api.ViewModels;

/// <summary>
/// Everything the desktop needs to draw its label.
/// </summary>
/// <param name="Name">
/// The App name, resolved exactly as the installed app resolves it, or null when nothing names the
/// site. Null is meaningful: the desktop then shows the domain in its place, which only the browser
/// knows reliably, so the server does not guess at it.
/// </param>
/// <param name="Show">Whether the label is drawn at all.</param>
/// <param name="Corner">Which corner of the desktop it sits in.</param>
/// <param name="ShowDomain">Whether the domain is written under the name.</param>
public sealed record DesktopLabelResponseModel(
    string? Name,
    bool Show,
    DesktopLabelCorner Corner,
    bool ShowDomain);

/// <summary>
/// A request to change the desktop label's switches.
/// </summary>
/// <remarks>
/// The name is not part of it. The name is the App name, and that is changed where it always has
/// been, so a request here can never rename the installed app as a side effect.
/// </remarks>
/// <param name="Show">Whether the label is drawn at all.</param>
/// <param name="Corner">Which corner of the desktop it sits in.</param>
/// <param name="ShowDomain">Whether the domain is written under the name.</param>
public sealed record DesktopLabelRequestModel(bool Show, DesktopLabelCorner Corner, bool ShowDomain);
