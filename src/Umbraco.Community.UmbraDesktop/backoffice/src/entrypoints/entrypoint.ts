import { UMBRADESKTOP_SECTION_ALIAS } from '../desktop/constants';
import { hideSectionTab } from '../headerapps/section-tab-hide';

import type {
    UmbEntryPointOnInit,
    UmbEntryPointOnUnload,
} from "@umbraco-cms/backoffice/extension-api";

/**
 * Runs when the package's backoffice extensions are loaded.
 */
export const onInit: UmbEntryPointOnInit = (_host, _extensionRegistry) => {
    // The desktop is entered via the top-right header-app launcher, so hide its now-redundant
    // section tab from the classic nav. No-op for users without desktop access (tab never shows).
    hideSectionTab(UMBRADESKTOP_SECTION_ALIAS);
};

/** Runs when the package's backoffice extensions are unloaded. */
export const onUnload: UmbEntryPointOnUnload = (_host, _extensionRegistry) => {
};
