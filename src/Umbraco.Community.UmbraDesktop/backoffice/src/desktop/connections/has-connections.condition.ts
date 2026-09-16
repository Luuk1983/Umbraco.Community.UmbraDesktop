import { UmbraDesktopConnectionsRepository } from './connections.repository';
import { observeConnectionsChanged } from './connections-changed';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type {
  UmbConditionConfigBase,
  UmbConditionControllerArguments,
  UmbExtensionCondition,
} from '@umbraco-cms/backoffice/extension-api';

/** Alias the condition is registered and referenced under. */
export const UMBRADESKTOP_HAS_CONNECTIONS_CONDITION = 'UmbraDesktop.Condition.HasConnections';

/**
 * Permits an extension only once at least one connection to another Umbraco instance is configured.
 *
 * Why an app needs this at all: the Status app has nothing to say on an install that has never added
 * a connection, and a launcher tile that opens an empty list is worse than no tile. Gating on the
 * data rather than on a feature switch is also what makes the feature arrive by itself the moment
 * somebody configures their first instance, with nothing to switch on afterwards.
 *
 * It starts refused rather than undecided on purpose. The catalogue deliberately shows an app whose
 * condition has not reported yet, so that a slow package cannot make an app flicker out of the
 * launcher — but here the common case is *no* connections, and inheriting that rule would show the
 * tile to everybody for the length of a round trip and then take it away.
 *
 * It also re-asks whenever connections change. Asking only once was a real bug: adding your first
 * connection left the launcher unchanged until the whole window was reloaded, because the settings
 * panel closes back onto the same desktop with this same condition instance still holding its "no"
 * from before.
 */
export class UmbraDesktopHasConnectionsCondition extends UmbControllerBase implements UmbExtensionCondition {
  /** The condition's own configuration, which is nothing but its alias: it takes no arguments. */
  public config: UmbConditionConfigBase;

  /** Whether the gated extension may appear. Starts refused, for the reason in the class doc. */
  public permitted = false;

  /**
   * @param host The controller host the condition runs on.
   * @param args Carries the callback that reports a change of verdict.
   */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbConditionConfigBase>) {
    super(host);
    this.config = args.config;

    void this.#check(args.onChange);

    // Unsubscribed in destroy, not left running. A listener that outlived its condition would keep a
    // dead controller alive and go on calling the server on its behalf every time anything changed.
    this.#stopListening = observeConnectionsChanged(() => void this.#check(args.onChange));
  }

  /** Stops listening for connection changes. Held so destroy can call it. */
  #stopListening?: () => void;

  /** @inheritdoc */
  override destroy(): void {
    this.#stopListening?.();
    super.destroy();
  }

  /**
   * Asks the server whether any connection exists, and reports the answer once.
   *
   * Once and not repeatedly: adding the first connection happens in a settings screen that is not
   * open at the same time as the launcher, and the desktop is re-entered afterwards. Polling here
   * would cost every install a request on every launcher render to catch a transition almost nobody
   * makes twice.
   * @param onChange Reports the verdict back to the extension registry.
   */
  async #check(onChange: (permitted: boolean) => void): Promise<void> {
    const connections = await new UmbraDesktopConnectionsRepository(this).getConnections();
    const permitted = (connections?.length ?? 0) > 0;

    if (permitted === this.permitted) {
      return;
    }

    this.permitted = permitted;
    onChange(permitted);
  }
}

export default UmbraDesktopHasConnectionsCondition;
