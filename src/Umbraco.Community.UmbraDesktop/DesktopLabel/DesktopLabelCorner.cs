namespace Umbraco.Community.UmbraDesktop.DesktopLabel;

/// <summary>
/// Which corner of the desktop the label sits in.
/// </summary>
/// <remarks>
/// Top right is zero on purpose. It is the default, so a document written before anybody chose a
/// corner, or one naming a corner this version does not know, lands where it would have anyway.
/// Stored by name rather than by number, so a stored document is readable and diffable.
/// </remarks>
public enum DesktopLabelCorner
{
    /// <summary>The default, and the one corner nothing else on the desktop uses.</summary>
    TopRight = 0,

    /// <summary>Where new windows open, so the first window covers it.</summary>
    TopLeft = 1,

    /// <summary>Above the start button, and under the launcher while it is open.</summary>
    BottomLeft = 2,

    /// <summary>Above the clock, under Umbraco's notifications and over the faint Umbraco logo.</summary>
    BottomRight = 3,
}
