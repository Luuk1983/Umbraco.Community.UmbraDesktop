import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { client } from '../api/client.gen';
import { UMBRADESKTOP_SECTION_ALIAS } from '../desktop/constants';
import { hideSectionTab } from '../headerapps/section-tab-hide';

import type {
    UmbEntryPointOnInit,
    UmbEntryPointOnUnload,
} from "@umbraco-cms/backoffice/extension-api";

// load up the manifests here
export const onInit: UmbEntryPointOnInit = (_host, _extensionRegistry) => {
    // The desktop is entered via the top-right header-app launcher, so hide its now-redundant
    // section tab from the classic nav. No-op for users without desktop access (tab never shows).
    hideSectionTab(UMBRADESKTOP_SECTION_ALIAS);

    // Will use only to add in Open API config with generated TS OpenAPI HTTPS Client
    // Do the OAuth token handshake stuff
    _host.consumeContext(UMB_AUTH_CONTEXT, async (authContext) => {
        if (!authContext) {
            console.error("Auth context is not defined!");
            return;
        }

        // Get the token info from Umbraco
        const config = authContext.getOpenApiConfiguration();

        client.setConfig({
            baseUrl: config.base,
            credentials: config.credentials
        });

        // For every request being made, add the token to the headers
        // Can't use the setConfig approach above as its set only once and
        // tokens expire and get refreshed
        client.interceptors.request.use(async (request, _options) => {
            const token = await config.token();
            request.headers.set('Authorization', `Bearer ${token}`);
            return request;
        });
    });
};

export const onUnload: UmbEntryPointOnUnload = (_host, _extensionRegistry) => {
    console.log("Goodbye from my extension 👋");
};
