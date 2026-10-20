import { UmbContextConsumer } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal, UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/**
 * The context a provider above an element gives for a token, asked once and answered now, or
 * `undefined` when nothing above provides it.
 *
 * `consumeContext` waits for a provider that is not there yet and never says "none", which is the
 * one answer Edit image's conditions need: the plain backoffice has no desktop, and a table row has
 * no content-type context. Core's own consumer answers synchronously when it is asked once, without
 * being connected: a provider answers a request as it bubbles past, so the request and its answer
 * happen in one go, and nothing is left listening afterwards.
 *
 * **Alias matches.** By default a request stops at the first element providing anything under the
 * same context alias, as core's own consumers do. Core's content-type context shares the entity
 * context's alias (`UmbEntityContext`, with an API alias of its own), and a card's actions bundle
 * provides an entity context inside the card that provides the content type, so a request for the
 * content type stops at the bundle and never reaches it. `passAliasMatches` asks past those, as core's
 * `passContextAliasMatches()` does; the caller then has to check what it found is the right one.
 * @param element Where to ask from. A provider on the element itself answers too.
 * @param token The context to ask for.
 * @param options How far to ask.
 * @param options.passAliasMatches Whether to ask past a provider with the same alias and another API alias.
 * @returns The context, or undefined.
 */
export function contextNow<T extends UmbContextMinimal>(
  element: Element,
  token: UmbContextToken<T>,
  options: { passAliasMatches?: boolean } = {},
): T | undefined {
  const consumer = new UmbContextConsumer(element, token);
  if (options.passAliasMatches) consumer.passContextAliasMatches();
  consumer.request();
  const found = consumer.instance;
  consumer.destroy();
  return found;
}
