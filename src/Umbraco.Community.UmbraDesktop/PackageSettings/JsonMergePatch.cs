using System.Text.Json.Nodes;

namespace Umbraco.Community.UmbraDesktop.PackageSettings;

/// <summary>
/// JSON Merge Patch, RFC 7386: a patch is an object whose members replace the target's, nested
/// objects merge, and a null removes.
/// </summary>
/// <remarks>
/// It is what lets two people change one site setting at once. A replace sends the whole value, so
/// the second of two saves drops the first one's change; a patch names only what it changes, so two
/// people keeping different media items both stay kept.
/// </remarks>
public static class JsonMergePatch
{
    /// <summary>
    /// Merges a patch into a target, as RFC 7386 §2 describes.
    /// </summary>
    /// <param name="target">The stored document, or null when nothing is stored. Not changed.</param>
    /// <param name="patch">The patch. Not changed, and none of its nodes end up in the result.</param>
    /// <returns>The merged document, a new node. Null only when the patch itself is null.</returns>
    public static JsonNode? Apply(JsonNode? target, JsonNode? patch)
    {
        if (patch is not JsonObject members) return patch?.DeepClone();

        // A target that is not an object is replaced by an empty one, as the RFC asks, so a value an
        // older version stored as something else does not stop the merge.
        var result = target is JsonObject existing ? (JsonObject)existing.DeepClone() : new JsonObject();
        foreach (var (name, value) in members)
        {
            if (value is null)
            {
                result.Remove(name);
                continue;
            }

            // Merged before it is removed, and removed before it is set, so a node is never asked to
            // join a second parent.
            var merged = Apply(result[name], value);
            result.Remove(name);
            result[name] = merged;
        }

        return result;
    }
}
