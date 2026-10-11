/**
 * What the umbraCoffee window's tests share beyond `test-support.ts`: a stand-in for the desktop the
 * window sits in, providing the host's tray context (with its "Remind me" read, or without it, as on
 * an older desktop) and the desktop's settings context, plus the engine the player is given so no
 * test reaches YouTube.
 *
 * A separate file so the tray cup's and the reminder's tests, which `test-support.ts` also serves,
 * are not touched by anything the window needs.
 *
 * Imported only by tests. It is not a `*.test.ts` file, so the runner does not run it as one, and
 * nothing in the bundle imports it.
 */

import { provideDesktopSettings } from './test-support.js';
import { UMBRADESKTOP_TRAY_CONTEXT, type UmbraDesktopTrayContextLike } from './tray-context.js';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbBooleanState, type UmbStringState } from '@umbraco-cms/backoffice/observable-api';

/** Which desktop the stand-in is: one whose tray context can be read, or one from before it could. */
export type TrayKind = 'current' | 'older';

/**
 * Stands in for the desktop around the window. Light DOM, so an element appended to it is a real,
 * laid-out descendant and it can serve as the sized box `sizedBox` makes.
 *
 * Call {@link provideTray} and {@link provideSettings} before the window goes in, as the desktop is
 * there before its apps.
 */
@customElement('umbracoffee-test-window-host')
export class TestWindowHostElement extends UmbLitElement {
  /** Every alias `openApp` was called with, oldest first. */
  readonly opened: string[] = [];

  /** Every `setTrayItemEnabled` call, oldest first. */
  readonly switched: Array<{ alias: string; enabled: boolean }> = [];

  /**
   * The reminders switch the stand-in reports. A call to `setTrayItemEnabled` changes it, as the
   * real desktop does, so a case can watch the window follow its own click, and a case may set it
   * directly to play the user changing it in Desktop settings.
   */
  readonly reminders = new UmbBooleanState(true);

  /**
   * Provide the tray context under the real token.
   * @param kind `current` for a desktop whose context has `trayItemEnabled`, `older` for one without.
   */
  provideTray(kind: TrayKind = 'current'): void {
    const tray: UmbraDesktopTrayContextLike = {
      openApp: (alias) => (this.opened.push(alias), true),
      setTrayItemEnabled: (alias, enabled) => {
        this.switched.push({ alias, enabled });
        this.reminders.setValue(enabled);
        return true;
      },
      getHostElement: () => this,
    };
    if (kind === 'current') tray.trayItemEnabled = () => this.reminders.asObservable();
    this.provideContext(UMBRADESKTOP_TRAY_CONTEXT, tray);
  }

  /**
   * Provide the desktop's settings context, as `test-support.ts` does for the cup.
   * @param kind `current` for a desktop that publishes `formatDateTime`, `older` for one that does not.
   * @returns The hour setting the stand-in formats with; setting it emits on `locale`.
   */
  provideSettings(kind: 'current' | 'older' = 'current'): UmbStringState<string> {
    return provideDesktopSettings(this, kind);
  }

  /**
   * No shadow root, so children render where they are.
   * @returns This element.
   */
  override createRenderRoot() {
    return this;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so `createElement` is typed. */
    'umbracoffee-test-window-host': TestWindowHostElement;
  }
}
