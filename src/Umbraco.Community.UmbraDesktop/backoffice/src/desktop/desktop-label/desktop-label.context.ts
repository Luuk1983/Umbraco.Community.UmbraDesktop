import { UmbraDesktopService } from '../../api/sdk.gen';
import type { DesktopLabelRequestModel, DesktopLabelResponseModel } from '../../api/types.gen';
import { UMBRADESKTOP_DESKTOP_LABEL_CONTEXT } from './desktop-label.context-token';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { tryExecute } from '@umbraco-cms/backoffice/resources';

/** The two calls the context makes, kept apart from it so a test can hand it a stand-in server. */
export interface UmbraDesktopLabelSource {
  /** Read the label. Resolves undefined when it could not be read. */
  read(): Promise<DesktopLabelResponseModel | undefined>;
  /** Store the switches. Resolves true when the server accepted them. */
  write(switches: DesktopLabelRequestModel): Promise<boolean>;
}

/**
 * The real server, through the generated client.
 *
 * Reading raises no notification on failure. Every user reads the label on every desktop load, so a
 * server that cannot answer would otherwise greet each of them with an error about an optional
 * extra. Writing does raise one, because it is an admin acting deliberately in the Site screen, and
 * a save that failed silently would read as a setting that does not stick.
 * @param host The host the requests are made for.
 * @returns A source that talks to the management API.
 */
export function serverLabelSource(host: UmbControllerHost): UmbraDesktopLabelSource {
  return {
    async read() {
      const { data } = await tryExecute(host, UmbraDesktopService.getDesktopLabel(), {
        disableNotifications: true,
      });
      return data;
    },
    async write(switches) {
      const { error } = await tryExecute(host, UmbraDesktopService.setDesktopLabel({ body: switches }));
      return !error;
    },
  };
}

/**
 * Holds the desktop label for the desktop that draws it and the Site screen that changes it.
 *
 * Provided by the desktop, beside the settings context, which is what lets the Site screen reach it
 * from inside the settings modal the same way the Appearance screen reaches the settings.
 *
 * Other users see a change on their next load. There is no push, and a label is not worth one.
 */
export class UmbraDesktopLabelContext extends UmbContextBase {
  /** The label as last read, or null when there is none to draw. */
  #label = new UmbObjectState<DesktopLabelResponseModel | null>(null);

  /** The label as last read, or null when there is none to draw. */
  public readonly label = this.#label.asObservable();

  /** Where the label is read from and written to. */
  #source: UmbraDesktopLabelSource;

  /**
   * Create the context and start reading the label straight away.
   * @param host The desktop that provides this context.
   * @param source Where to read and write the label. The server unless a test says otherwise.
   */
  constructor(host: UmbControllerHost, source: UmbraDesktopLabelSource = serverLabelSource(host)) {
    super(host, UMBRADESKTOP_DESKTOP_LABEL_CONTEXT);
    this.#source = source;
    void this.load();
  }

  /**
   * Read the label again.
   *
   * A failure leaves no label rather than throwing. The desktop must never fail to paint because of
   * an optional extra, and a label that cannot be read is simply not drawn.
   */
  async load(): Promise<void> {
    const label = await this.#source.read().catch(() => undefined);
    this.#label.setValue(label ?? null);
  }

  /**
   * Store the switches, then hold what the server kept.
   *
   * Re-read rather than trusting the write, as the rest of the Site screen does: what the desktop
   * draws should be the server's answer, not the request that was sent.
   * @param switches The switches to store.
   * @returns Whether the server accepted them.
   */
  async save(switches: DesktopLabelRequestModel): Promise<boolean> {
    const accepted = await this.#source.write(switches).catch(() => false);
    await this.load();
    return accepted;
  }
}
