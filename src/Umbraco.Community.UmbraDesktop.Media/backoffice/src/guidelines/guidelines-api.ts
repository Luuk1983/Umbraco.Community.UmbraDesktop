import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { fromServer, toServer } from './guidelines.js';
import type { MediaGuidelines } from './guidelines.js';

/**
 * The media guidelines' two calls (#179). The server half is this package's
 * `Guidelines/MediaGuidelinesController.cs`; called through the backoffice's own `umbHttpClient`,
 * which carries the signed-in user, as Accessories' Sticky Notes calls its controller. Two calls do
 * not need a generated client.
 */

/** Where the controller is routed. */
const URL = '/umbraco/management/api/v1/umbradesktop/media/guidelines';

/** Tells `umbHttpClient` to send the backoffice's bearer token. */
const SECURITY = [{ type: 'http', scheme: 'bearer' }] as const;

/** The guidelines' calls. An interface so a test answers them. */
export interface MediaGuidelinesApi {
  /** The site's guidelines, or undefined when they could not be read. */
  read(): Promise<MediaGuidelines | undefined>;
  /**
   * Store the site's guidelines; refused without the Settings section.
   * @param guidelines The guidelines.
   * @returns True when they were stored.
   */
  write(guidelines: MediaGuidelines): Promise<boolean>;
}

/**
 * The real calls. Every failure is an answer rather than an exception: the backoffice's client throws
 * on an error status in a running backoffice (Accessories' `shared/http.ts` found that), and a check
 * that cannot read the guidelines falls back to what it had rather than holding up an upload.
 * @returns The calls.
 */
export function createMediaGuidelinesApi(): MediaGuidelinesApi {
  return {
    async read() {
      try {
        const { data, error } = await umbHttpClient.get({ url: URL, security: [...SECURITY] });
        return error || data === undefined ? undefined : fromServer(data);
      } catch {
        return undefined;
      }
    },
    async write(guidelines) {
      try {
        const { error } = await umbHttpClient.put({
          url: URL,
          security: [...SECURITY],
          body: toServer(guidelines),
          headers: { 'Content-Type': 'application/json' },
        });
        return !error;
      } catch {
        return false;
      }
    },
  };
}
