import type { ManifestApi, UmbApi } from '@umbraco-cms/backoffice/extension-api';

/**
 * The Umbraco AI extension point this desktop plugs into, declared here rather than imported.
 *
 * **Umbraco AI is optional and this package does not depend on it.** Nothing here may import from
 * `@umbraco-ai/*`: those modules exist in the backoffice's import map only when the AI package is
 * installed, and a bundle that reaches for a missing module does not degrade, it fails to load —
 * taking the whole desktop with it, on every install that has no AI. The types are not on npm
 * either, so there is nothing to `import type` at build time even if we wanted the safety.
 *
 * So they are transcribed, from `Umbraco.AI@18.4.0-rc.2`, and merged into Umbraco's own manifest
 * map exactly as `app.extension.ts` does for this package's own `umbraDesktopApp`. What that buys:
 * a manifest object the registry accepts, an api the compiler checks, and an install without AI
 * where these manifests are simply inert — no extension point queries their type, so the `api`
 * modules are never even imported.
 *
 * What it costs: it can drift. The surface is one one-method interface, so there is not much to
 * drift, and the failure mode is the tool quietly not being called rather than anything throwing.
 * `catalogue/ai.ts` takes the same bet on the section alias, as do the seven other commercial
 * fragments beside it.
 */

/**
 * A browser-side tool the agent can call. Transcribed from
 * `Umbraco.AI.Agent.UI/…/chat/extensions/uai-agent-frontend-tool.extension.ts`.
 */
export interface ManifestUaiAgentFrontendTool extends ManifestApi<UaiAgentToolApi> {
  type: 'uaiAgentFrontendTool';
  meta: {
    /** The name the agent calls, which must match the AG-UI tool call name. */
    toolName: string;
    /** What the tool does, for the model. Required. */
    description: string;
    /** JSON Schema for the arguments, passed to the model unaltered. Required. */
    parameters: Record<string, unknown>;
    /**
     * Permission grouping, e.g. `navigation` or `entity-write`.
     *
     * Not cosmetic: the server drops a frontend tool whose scope declares `ForEntityTypes` that do
     * not include the run's entity type. An unknown scope, or one with no declared entity types, is
     * always included.
     */
    scope?: string;
    /** Whether the tool is destructive, for permission filtering. */
    isDestructive?: boolean;
  };
}

/**
 * What a frontend tool's api must implement.
 *
 * The return value is stringified before it reaches the model, so an object arrives as its JSON.
 * Umbraco's own tools all return a `JSON.stringify` of something, which is convention rather than
 * contract.
 *
 * A throw is caught by the executor and returned to the model as `{ error: message }`, with the
 * call marked failed in the chat. That makes throwing survivable but still worse than returning a
 * sentence, which is why {@link ManifestUaiAgentFrontendTool}'s api here never throws to say no.
 */
export interface UaiAgentToolApi extends UmbApi {
  /**
   * Run the tool.
   * @param args Whatever the model passed, parsed from its JSON. Unvalidated.
   * @returns The result to hand back to the model.
   */
  execute(args: Record<string, unknown>): Promise<unknown>;
}

declare global {
  /**
   * Registers the manifest with Umbraco's type map, which is what makes it assignable to
   * `UmbExtensionManifest` and so acceptable in this package's `manifests` array.
   *
   * Umbraco AI declares this same key in its own client. That is not a conflict, because nothing
   * here imports those types, so the two declarations are never in one program. It is, though, the
   * reason this file must stay type-only: adding `@umbraco-ai/*` to the build later means deleting
   * this declaration rather than keeping both.
   */
  interface UmbExtensionManifestMap {
    uaiAgentFrontendTool: ManifestUaiAgentFrontendTool;
  }
}
