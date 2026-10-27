import type {
  UmbraDesktopSiteSettingsAnswer,
  UmbraDesktopSiteSettingsDocument,
  UmbraDesktopSiteSettingsSnapshot,
} from './site-settings-store.js';
import { UmbraDesktopService } from '../../../api/sdk.gen.js';
import type { SitePackageSettingsResponseModel } from '../../../api/types.gen.js';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { tryExecute } from '@umbraco-cms/backoffice/resources';

/** Every request goes without Umbraco's error notification; see the class. */
const QUIET = { disableNotifications: true };

/**
 * The member of a 400's body that lists why a change was refused: the server's
 * `SitePackageSettingsController.ProblemsMember`. The two must not drift.
 */
export const PROBLEMS_MEMBER = 'problems';

/** What `tryExecute` hands back for one of the endpoints, as far as the answer needs it. */
interface UmbraDesktopSiteSettingsResult {
  data?: SitePackageSettingsResponseModel;
  error?: unknown;
  response?: { status: number };
}

/** The parts of a problem details body the answer reads. */
interface UmbraDesktopSiteSettingsProblem {
  status?: number;
  title?: string;
  [PROBLEMS_MEMBER]?: unknown;
}

/**
 * Turn what `tryExecute` gave back into the store's answer.
 *
 * A 400 is a refusal: the server, or the package's validators, said no to the change on its
 * merits, and sending it again would be refused again. Anything else that is not a 200, a 403
 * included, is a failure the store keeps and sends again with the next change.
 * @param result The request's result.
 * @returns The snapshot, the refusal with its reasons, or undefined for a failure.
 */
export function answerFrom(result: UmbraDesktopSiteSettingsResult): UmbraDesktopSiteSettingsAnswer | undefined {
  if (result.data) return { value: result.data.value ?? null, canChange: result.data.canChange };
  if (typeof result.error !== 'object' || result.error === null) return undefined;
  // The generated client hands over the body itself, which the real run showed; Umbraco wraps it
  // in an `UmbApiError` when the request throws instead. Both are read.
  const wrapped = (result.error as { problemDetails?: UmbraDesktopSiteSettingsProblem }).problemDetails;
  const details = wrapped ?? (result.error as UmbraDesktopSiteSettingsProblem);
  if ((result.response?.status ?? details.status) !== 400) return undefined;
  const reasons = details[PROBLEMS_MEMBER];
  const listed = Array.isArray(reasons) ? reasons.filter((reason): reason is string => typeof reason === 'string') : [];
  return { refused: listed.length ? listed : [details.title ?? 'The change was refused.'] };
}

/**
 * One package's site setting on the server, through the desktop's `package-settings/site`
 * endpoints, which decide who may change it.
 *
 * No notifications, on read or write. A site store is another package's, read by its screens when
 * they open, and a refused or failed change already shows as the store's `'refused'` or `'unsaved'`
 * status for the package to word in its own place. Umbraco's own error toast would name an endpoint people never
 * asked for.
 */
export class UmbraDesktopSiteSettingsServerDocument implements UmbraDesktopSiteSettingsDocument {
  /**
   * @param host The host the requests are made for.
   * @param key The package key.
   */
  constructor(
    private readonly host: UmbControllerHost,
    private readonly key: string,
  ) {}

  /** @inheritdoc */
  async read(): Promise<UmbraDesktopSiteSettingsSnapshot | undefined> {
    const answer = await this.#answer(() =>
      tryExecute(this.host, UmbraDesktopService.getSitePackageSettings({ path: { key: this.key } }), QUIET),
    );
    // A read is refused only for a key the server cannot keep, which nothing will fix: as unread.
    return answer && 'refused' in answer ? undefined : answer;
  }

  /** @inheritdoc */
  async replace(value: string): Promise<UmbraDesktopSiteSettingsAnswer | undefined> {
    return this.#answer(() =>
      tryExecute(this.host, UmbraDesktopService.setSitePackageSettings({ path: { key: this.key }, body: { value } }), QUIET),
    );
  }

  /** @inheritdoc */
  async patch(patch: string): Promise<UmbraDesktopSiteSettingsAnswer | undefined> {
    return this.#answer(() =>
      tryExecute(this.host, UmbraDesktopService.patchSitePackageSettings({ path: { key: this.key }, body: { patch } }), QUIET),
    );
  }

  /**
   * Make a request and turn its answer into the store's, through {@link answerFrom}. A throw is a
   * failure, since the document's contract is never to throw.
   * @param request Makes the request.
   * @returns The answer, or undefined.
   */
  async #answer(request: () => Promise<UmbraDesktopSiteSettingsResult>): Promise<UmbraDesktopSiteSettingsAnswer | undefined> {
    try {
      return answerFrom(await request());
    } catch {
      return undefined;
    }
  }
}
