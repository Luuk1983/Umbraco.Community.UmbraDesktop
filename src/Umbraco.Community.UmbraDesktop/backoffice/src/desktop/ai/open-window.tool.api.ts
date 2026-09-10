import type { UaiAgentToolApi } from './ai.extension';
import { findHostDesk } from './host-desk';
import { planOpenWindow } from './open-window';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';

/**
 * The agent's `open_desktop_window` tool: turn an answer into a window the user can work in.
 *
 * Thin on purpose. Finding the desktop is `host-desk.ts`, deciding what to do is `open-window.ts`,
 * and this is the few lines that join them and are therefore the only part that cannot be tested
 * without a real frame inside a real desktop.
 */
export default class UmbraDesktopOpenWindowToolApi
  extends UmbControllerBase
  implements UaiAgentToolApi
{
  /**
   * Resolves app names for the by-name branch.
   *
   * The agent names an app the way a person would, "Log Viewer", while a catalogue app's `name` is
   * usually the manifest label token behind it. Matching without this would match nothing a model
   * would ever say.
   */
  #localize = new UmbLocalizationController(this);

  /**
   * Open, or raise, the window the model asked for.
   *
   * Asked for the desktop on every call rather than once at construction, because the api instance
   * is cached for the lifetime of the chat's tool manager while the desktop above it is not: the
   * user can leave the desktop section and come back, and a manager captured at construction would
   * then be one nobody can see.
   * @param args Whatever the model passed.
   * @returns A sentence for the model. Plain text rather than the JSON blob Umbraco's own tools
   *   return, because a sentence is the whole result here and the executor passes a string through
   *   unchanged. Every outcome, refusals included, comes back this way rather than as a throw.
   */
  public async execute(args: Record<string, unknown>): Promise<string> {
    const desk = findHostDesk();
    const plan = planOpenWindow(desk?.view, args, (text) => this.#localize.string(text));
    if (desk) {
      if (plan.kind === 'focus') desk.focus(plan.windowId);
      else if (plan.kind === 'open') desk.open(plan.app);
    }
    return plan.message;
  }
}
