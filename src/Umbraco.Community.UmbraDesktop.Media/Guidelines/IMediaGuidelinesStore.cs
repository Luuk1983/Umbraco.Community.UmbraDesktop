namespace Umbraco.Community.UmbraDesktop.Media.Guidelines;

/// <summary>
/// Reads and writes the site's media guidelines.
/// </summary>
/// <remarks>
/// One type owns both directions, as the desktop label's store does, so the stored format is decided
/// in one place and the reader can never drift from the writer.
/// </remarks>
public interface IMediaGuidelinesStore
{
    /// <summary>
    /// Reads the stored guidelines.
    /// </summary>
    /// <returns>The guidelines, never null. Anything unreadable reads as its default.</returns>
    MediaGuidelines Read();

    /// <summary>
    /// Stores the guidelines, replacing whatever was stored before.
    /// </summary>
    /// <param name="guidelines">The guidelines to store.</param>
    void Write(MediaGuidelines guidelines);
}
