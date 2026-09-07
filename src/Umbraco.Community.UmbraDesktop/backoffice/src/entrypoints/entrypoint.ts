import { UMBRADESKTOP_SECTION_ALIAS } from '../desktop/constants';
import { hideSectionTab } from '../headerapps/section-tab-hide';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { client } from '../api/client.gen.js';

import type {
    UmbEntryPointOnInit,
    UmbEntryPointOnUnload,
} from "@umbraco-cms/backoffice/extension-api";

/**
 * Runs when the package's backoffice extensions are loaded.
 */
export const onInit: UmbEntryPointOnInit = (host, _extensionRegistry) => {
    // The desktop is entered via the top-right header-app launcher, so hide its now-redundant
    // section tab from the classic nav. No-op for users without desktop access (tab never shows).
    hideSectionTab(UMBRADESKTOP_SECTION_ALIAS);

    // Without this, every call to the package's own management API (e.g.
    // UmbraDesktopService.getBackgroundJobs()) returns 401 Unauthorized: the generated
    // @hey-api/client-fetch client (backoffice/src/api/client.gen.ts) starts out with no base
    // URL, no cookie credentials, and no bearer token of its own — it's a bare fetch wrapper
    // until something wires it into Umbraco's auth context. `UmbAuthContext.configureClient`
    // is the canonical way to do that for an extension's own generated client: it sets
    // baseUrl/credentials/auth (with automatic token refresh) and binds the same 401-retry,
    // 403, and error-notification interceptors the core backoffice's own `umbHttpClient` uses
    // (see app.element.ts, which calls `authContext.configureClient(umbHttpClient)` the same
    // way). This is a required one-time setup step for any custom management API client.
    host.consumeContext(UMB_AUTH_CONTEXT, (authContext) => {
        if (!authContext) return;
        authContext.configureClient(client);
    });
};

/** Runs when the package's backoffice extensions are unloaded. */
export const onUnload: UmbEntryPointOnUnload = (_host, _extensionRegistry) => {
};
