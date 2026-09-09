import type { UaiAgentToolApi } from './ai.extension';
import { findHostDesk } from './host-desk';
import { planCloseWindows } from './close-windows';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';

/**
 * The agent's `close_desktop_windows` tool: tidy the desk.
 *
 * The rules that make this safe are in `close-windows.ts` and are absolute: unsaved windows are
 * reported rather than closed, and the chat's own window is never closed. This applies the plan and
 * nothing more.
 */
export default class UmbraDesktopCloseWindowsToolApi
  extends UmbControllerBase
  implements UaiAgentToolApi
{
  /** Resolves window names, which are localisation tokens more often than they are words. */
  #localize = new UmbLocalizationController(this);

  /**
   * Close what the plan says to close.
   * @param args Whatever the model passed.
   * @returns A sentence covering what closed, what was left and why.
   */
  public async execute(args: Record<string, unknown>): Promise<string> {
    const desk = findHostDesk();
    const plan = planCloseWindows(
      desk?.view,
      args,
      (text) => this.#localize.string(text),
      desk?.selfWindowId,
    );
    for (const id of plan.windowIds) desk?.close(id);
    return plan.message;
  }
}
