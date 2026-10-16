import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { UmbConditionConfigBase, UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';

export { UMBRADESKTOP_ARCADE_HAS_GAMES_CONDITION } from './has-games.condition.alias.js';

/**
 * Permits while at least one `umbraDesktopGame` is registered, so the hub is not in the launcher with
 * nothing in it (design §3). Counts manifests, not valid games: a malformed game still shows the hub,
 * where its absence is easier to notice than a missing tile.
 */
export class UmbraDesktopArcadeHasGamesCondition extends UmbControllerBase implements UmbExtensionCondition {
  /** Where manifests are read; replaceable only so tests never touch the global registry. */
  static registry: typeof umbExtensionsRegistry = umbExtensionsRegistry;

  /** The condition's own configuration. */
  public config: UmbConditionConfigBase;

  /** Starts refused, so the hub never flashes up before the registry has answered. */
  public permitted = false;

  /**
   * @param host The host.
   * @param args Umbraco's condition arguments.
   */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbConditionConfigBase>) {
    super(host);
    this.config = args.config;
    this.observe(UmbraDesktopArcadeHasGamesCondition.registry.byType('umbraDesktopGame'), (games) => {
      this.permitted = games.length > 0;
      args.onChange(this.permitted);
    });
  }
}

export { UmbraDesktopArcadeHasGamesCondition as api };
