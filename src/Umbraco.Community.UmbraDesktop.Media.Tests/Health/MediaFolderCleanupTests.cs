using Umbraco.Community.UmbraDesktop.Media.Health;
using Umbraco.Community.UmbraDesktop.Media.Health.Keep;
using Xunit;

namespace Umbraco.Community.UmbraDesktop.Media.Tests.Health;

/// <summary>
/// What the Media Manager's cleanup line counts per folder (design §16.20): unused items and oversized
/// images in a folder and every folder under it, by the same rule the Media Cleanup window uses.
/// </summary>
public class MediaFolderCleanupTests
{
    /// <summary>A folder at the root.</summary>
    private static readonly Guid Products = Guid.Parse("00000000-0000-0000-0000-00000000000a");

    /// <summary>A folder in <see cref="Products"/>.</summary>
    private static readonly Guid Archive = Guid.Parse("00000000-0000-0000-0000-00000000000b");

    /// <summary>The last check's folders.</summary>
    private static readonly MediaHealthFolder[] Folders =
    [
        new(Products, "Products", null, "/Products"),
        new(Archive, "Archive", Products, "/Products/Archive"),
    ];

    /// <summary>Three megabytes: over the oversized limit.</summary>
    private const long Big = 3 * 1024 * 1024;

    /// <summary>
    /// An item of the last check.
    /// </summary>
    /// <param name="parent">Its folder, or null at the root.</param>
    /// <param name="used">How many pages use it.</param>
    /// <param name="bytes">Its size.</param>
    /// <param name="extension">Its file's extension.</param>
    /// <param name="key">Its key, or a new one.</param>
    /// <returns>The item.</returns>
    private static MediaHealthItem Item(Guid? parent, int used = 0, long? bytes = 100, string? extension = "jpg", Guid? key = null) =>
        new(key ?? Guid.NewGuid(), "x", "Image", extension, bytes, parent, "/", used);

    /// <summary>
    /// A keep of an item.
    /// </summary>
    /// <param name="key">The item's key.</param>
    /// <param name="ended">Why it ended, or null while it holds.</param>
    /// <returns>The keep.</returns>
    private static MediaKeep Keep(Guid key, MediaKeepEnd? ended = null) =>
        new(1, MediaKeepKind.Unused, key.ToString("D"), null, null, Guid.Empty, "", DateTime.UtcNow, ended);

    /// <summary>The count for one folder, or zeros when it has nothing.</summary>
    private static (int Unused, int Oversized) For(IReadOnlyList<MediaFolderCleanupCount> counts, Guid? key)
    {
        var count = counts.SingleOrDefault(each => each.Key == key);
        return count is null ? (0, 0) : (count.Unused, count.Oversized);
    }

    /// <summary>An item two levels down counts in its folder, the folder above it and the library.</summary>
    [Fact]
    public void Counts_an_item_in_every_folder_above_it()
    {
        var counts = MediaFolderCleanup.Count([Item(Archive)], Folders, []);

        Assert.Equal((1, 0), For(counts, Archive));
        Assert.Equal((1, 0), For(counts, Products));
        Assert.Equal((1, 0), For(counts, null));
    }

    /// <summary>A used image over the limit is oversized; under it, or not an image, it is not counted.</summary>
    [Fact]
    public void Counts_used_images_over_the_limit_as_oversized()
    {
        var counts = MediaFolderCleanup.Count(
            [Item(Products, used: 1, bytes: Big), Item(Products, used: 1), Item(Products, used: 1, bytes: Big, extension: "pdf")],
            Folders,
            []);

        Assert.Equal((0, 1), For(counts, Products));
    }

    /// <summary>An unused image over the limit is unused only, as the window counts it (plan Decision 3).</summary>
    [Fact]
    public void Counts_an_unused_big_image_as_unused_only() =>
        Assert.Equal((1, 0), For(MediaFolderCleanup.Count([Item(Products, bytes: Big)], Folders, []), Products));

    /// <summary>An image of core's Image type with no extension is an image, as the window decides it.</summary>
    [Fact]
    public void Counts_an_image_type_without_an_extension_as_an_image() =>
        Assert.Equal((0, 1), For(MediaFolderCleanup.Count([Item(Products, used: 1, bytes: Big, extension: null)], Folders, []), Products));

    /// <summary>An item under an item that holds items counts in that item, which the Manager opens as a place.</summary>
    [Fact]
    public void Counts_through_an_item_that_holds_items()
    {
        var place = Item(Products, used: 1, bytes: null, extension: null);
        var counts = MediaFolderCleanup.Count([place, Item(place.Key)], Folders, []);

        Assert.Equal((1, 0), For(counts, place.Key));
        Assert.Equal((1, 0), For(counts, Products));
    }

    /// <summary>A kept item is not counted while its keep holds; once it has ended it is again.</summary>
    [Fact]
    public void Leaves_out_kept_items_while_the_keep_holds()
    {
        var kept = Item(Products);
        var ended = Item(Products);

        var counts = MediaFolderCleanup.Count([kept, ended], Folders, [Keep(kept.Key), Keep(ended.Key, MediaKeepEnd.Expired)]);

        Assert.Equal((1, 0), For(counts, Products));
    }

    /// <summary>Only folders with something to clean up are listed, so the answer stays small.</summary>
    [Fact]
    public void Lists_only_folders_with_something()
    {
        var counts = MediaFolderCleanup.Count([Item(Products, used: 1)], Folders, []);

        Assert.Empty(counts);
    }

    /// <summary>The limit is the window's: 2 MB, pinned here and in `health-model.test.ts`.</summary>
    [Fact]
    public void The_oversized_limit_is_two_megabytes() => Assert.Equal(2 * 1024 * 1024, MediaFolderCleanup.OversizedBytes);

    /// <summary>The image extensions are the window's, pinned here and in `health-model.test.ts`.</summary>
    [Fact]
    public void The_image_extensions_are_the_window_s() =>
        Assert.Equal(
            new[] { "avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "tif", "tiff", "webp" },
            MediaFolderCleanup.ImageExtensions.Order(StringComparer.Ordinal));
}
