import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbExtensionsApiInitializer } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import type {} from './desktop-context.extension.js';

/** The registry type, nominal because `UmbExtensionRegistry` has private fields (see app-catalogue.context.ts). */
type UmbraDesktopExtensionRegistry = typeof umbExtensionsRegistry;

/**
 * Creates every registered `umbraDesktopContext` api with the desktop as host, from `start()` to
 * `stop()`.
 *
 * Start and stop rather than living as long as the element, because a disconnected Umbraco element
 * only tells its controllers `hostDisconnected`; it never destroys them. A package context with work
 * to do when the desktop opens (the Arcade's "you were beaten" check) needs a real birth and death
 * per visit, and leaving the desktop has to leave nothing of a package running.
 *
 * Conditions, lazy loading and one initializer per manifest are `UmbExtensionsApiInitializer`'s. A
 * loader that rejects is not caught by it: that one context never appears and the rejection reaches
 * the console as an unhandled one, while the others carry on (each load is its own promise).
 */
export class UmbraDesktopPackageContextsController extends UmbControllerBase {
  /** The registry to read, injectable so tests never touch the global one. */
  readonly #registry: UmbraDesktopExtensionRegistry;

  /** The running initializer, or undefined when stopped. */
  #initializer?: UmbExtensionsApiInitializer<never>;

  /**
   * @param host The desktop element, which becomes every package context's host.
   * @param registry Where manifests come from; Umbraco's own by default.
   */
  constructor(host: UmbControllerHost, registry: UmbraDesktopExtensionRegistry = umbExtensionsRegistry) {
    super(host, 'umbraDesktopPackageContexts');
    this.#registry = registry;
  }

  /** Create the package contexts. Calling it twice is harmless. */
  start(): void {
    if (this.#initializer) return;
    this.#initializer = new UmbExtensionsApiInitializer(this._host, this.#registry as never, 'umbraDesktopContext', []) as never;
  }

  /** Destroy every package context this created. Calling it twice is harmless. */
  stop(): void {
    this.#initializer?.destroy();
    this.#initializer = undefined;
  }

  /** Stops first, so destroying the desktop destroys its package contexts. */
  override destroy(): void {
    this.stop();
    super.destroy();
  }
}
