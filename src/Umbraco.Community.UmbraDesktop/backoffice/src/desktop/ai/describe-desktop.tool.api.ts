import type { UaiAgentToolApi } from './ai.extension';
import { findHostDesk } from './host-desk';
import { describeDesk } from './desk-snapshot';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';

/**
 * The agent's `describe_desktop` tool: what the desktop is, and what it can do.
 *
 * **A tool rather than ambient context, and not by preference.** This started as a
 * `uaiRequestContextContributor`, which Umbraco runs once per message and would have made "the page
 * I have open" work without the agent thinking about it. It never fired: the Copilot Workspace —
 * the chat this desktop ships — does not invoke `UaiRequestContextCollector` at all, and the only
 * thing in Umbraco AI that does is the sidebar Copilot. Frontend tools, by contrast, the Workspace
 * does wire up. So this is the same information through the seam that exists.
 *
 * What that costs is automatic delivery: the agent has to decide to call it, which is why the
 * manifest's description says plainly when to. If Umbraco ever wires the collector into the
 * Workspace, ambient context is the better answer and worth going back to.
 */
export default class UmbraDesktopDescribeDesktopToolApi
  extends UmbControllerBase
  implements UaiAgentToolApi
{
  /**
   * Resolves window and app names, which are localisation tokens far more often than they are
   * words.
   *
   * The reason this api is a controller: an app's `name` comes from a manifest label, so without a
   * localizer the agent is told the user has `#umbraDesktop_appContentEditor` open, and
   * `UmbLocalizationController` needs a host. Same controller the window manager uses for its
   * dialogs.
   */
  #localize = new UmbLocalizationController(this);

  /**
   * Describe the desk.
   *
   * Takes no arguments: there is exactly one desktop and one answer about it, and a filter
   * parameter would be a knob the model has to guess at for a list this short.
   * @returns The description, or a sentence saying there is no desktop here.
   */
  public async execute(): Promise<string> {
    const desk = findHostDesk();
    const description = describeDesk(desk?.view, (text) => this.#localize.string(text));
    return (
      description ??
      'Not available here: this backoffice is not running inside UmbraDesktop, so there is no desktop to describe. Answer the user without referring to windows.'
    );
  }
}
