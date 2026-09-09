import { jsonStringComparison } from '@umbraco-cms/backoffice/observable-api';

/**
 * Whether two versions of a workspace's data agree in the parts an editor can actually write.
 *
 * This is not `jsonStringComparison` on the whole model, and the difference is the whole point. The
 * server's copy of a document carries fields the editor never had: `updateDate` and `state` change
 * on every save, `publishDate` appears on a publish, `isTrashed` flips when somebody bins it. A
 * literal comparison therefore finds a window's own save unequal to the data it just sent, and
 * `classify.ts` would read that as somebody else's write and raise a data-loss alarm at the moment
 * a save succeeded. That false positive is the one failure that would cost this feature its
 * credibility, so the projection below is deliberately narrow: property values keyed by alias,
 * culture and segment, variant names, and the template. Nothing else.
 */

/**
 * Top-level keys a server owns rather than an editor, dropped from a model that is not
 * content-shaped.
 *
 * Only consulted on the fallback path: a content model is projected field by field instead, so a
 * server field nested inside a variant is excluded by not being read rather than by being listed.
 */
const SERVER_MANAGED_KEYS: ReadonlyArray<string> = [
  'createDate',
  'updateDate',
  'state',
  'publishDate',
  'scheduledPublishDate',
  'scheduledUnpublishDate',
  'isTrashed',
  'flags',
  'id',
];

/** One property value in a content-shaped model, with only the fields the projection reads. */
interface ContentValue {
  /** The property's alias. */
  alias?: string;
  /** The culture this value belongs to, or null for an invariant one. */
  culture?: string | null;
  /** The segment this value belongs to, or null for none. */
  segment?: string | null;
  /** The stored value. */
  value?: unknown;
}

/** One variant in a content-shaped model, with only the fields the projection reads. */
interface ContentVariant {
  /** The variant's culture, or null for an invariant document. */
  culture?: string | null;
  /** The variant's segment, or null for none. */
  segment?: string | null;
  /** The editor-visible name. */
  name?: string;
}

/** The shape the content projection needs; anything else takes the fallback path. */
interface ContentLike {
  /** Property values, if this model has any. */
  values?: ReadonlyArray<ContentValue>;
  /** Variants, if this model has any. */
  variants?: ReadonlyArray<ContentVariant>;
  /** The chosen template, which an editor can set. */
  template?: unknown;
}

/**
 * A stable sort key for a value or variant, so two models that list the same things in a different
 * order still compare equal. The server is under no obligation to preserve the client's order.
 *
 * The delimiter assumes no part contains `|`. Umbraco aliases and culture codes cannot, and a
 * segment set by a custom property editor is the one part that could: a collision there would
 * merely sort two values adjacently, which changes nothing about whether they compare equal,
 * because the sort is for stability and the comparison is over the whole projected object.
 * @param parts The identity fields, in order.
 * @returns A comparable string.
 */
function identity(...parts: ReadonlyArray<string | null | undefined>): string {
  return parts.map((part) => part ?? '').join('|');
}

/**
 * A shallow copy of an object without the keys a server owns. The fallback for a model that is not
 * content-shaped: a data type, a member type, a webhook.
 *
 * Shallow deliberately. Going deeper would need to know which nested objects are server-owned, and
 * guessing that for every workspace type in Umbraco is how this module would start lying. A nested
 * server field on a non-content model shows up as a difference, which errs towards warning the
 * editor rather than towards silence.
 * @param model The model to strip.
 * @returns A copy without the server-managed keys.
 */
function stripServerManaged(model: Record<string, unknown>): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  // Keys sorted, which is load-bearing rather than tidy: the comparison underneath is a JSON
  // string comparison, so two objects holding the same entries in a different order would not
  // compare equal. The values and variants arrays get this explicitly; this is the same guarantee
  // for the fallback path.
  for (const key of Object.keys(model).sort()) {
    if (SERVER_MANAGED_KEYS.includes(key)) continue;
    stripped[key] = model[key];
  }
  return stripped;
}

/**
 * The editable projection of a workspace model: everything an editor could have typed and nothing
 * the server decides.
 *
 * Exported for its tests and for phase 2's diff, which needs the same notion of "a value" to bucket
 * changes by property.
 * @param model The workspace's data, persisted data, or the server's copy.
 * @returns A normalised object safe to compare by value.
 */
export function editableProjection(model: unknown): unknown {
  if (!model || typeof model !== 'object') return model;
  const candidate = model as ContentLike & Record<string, unknown>;
  const isContentShaped = Array.isArray(candidate.values) || Array.isArray(candidate.variants);
  if (!isContentShaped) return stripServerManaged(candidate);
  return {
    template: candidate.template ?? null,
    values: [...(candidate.values ?? [])]
      .map((value) => ({
        alias: value.alias ?? '',
        culture: value.culture ?? null,
        segment: value.segment ?? null,
        value: value.value ?? null,
      }))
      .sort((a, b) =>
        identity(a.alias, a.culture, a.segment).localeCompare(identity(b.alias, b.culture, b.segment)),
      ),
    variants: [...(candidate.variants ?? [])]
      .map((variant) => ({
        culture: variant.culture ?? null,
        segment: variant.segment ?? null,
        name: variant.name ?? '',
      }))
      .sort((a, b) => identity(a.culture, a.segment).localeCompare(identity(b.culture, b.segment))),
  };
}

/**
 * Whether two versions of a workspace's data agree in every part an editor can write.
 *
 * `jsonStringComparison` is core's own comparison, the one `dirty-watcher.ts` already uses, applied
 * to the projection rather than to the raw models. A missing side answers false rather than
 * throwing: equality with data that has not arrived is unknowable, and the callers all treat
 * "unknown" as "do not act".
 * @param a One version.
 * @param b The other.
 * @returns True when they agree on everything editable.
 */
export function sameEditableContent(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return jsonStringComparison(editableProjection(a), editableProjection(b)) === true;
}
