namespace Umbraco.Community.UmbraDesktop.DesktopLabel;

/// <summary>
/// Reads and writes the desktop label's switches.
/// </summary>
/// <remarks>
/// One type owns both directions, so the stored format is decided in one place and the reader can
/// never drift from the writer.
/// </remarks>
public interface IDesktopLabelStore
{
    /// <summary>
    /// Reads the stored switches.
    /// </summary>
    /// <returns>The switches, never null. Anything unreadable reads as its default.</returns>
    DesktopLabelSettings Read();

    /// <summary>
    /// Stores the switches, replacing whatever was stored before.
    /// </summary>
    /// <param name="settings">The switches to store.</param>
    void Write(DesktopLabelSettings settings);
}
