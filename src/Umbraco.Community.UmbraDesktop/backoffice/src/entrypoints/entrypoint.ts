import { UMBRADESKTOP_SECTION_ALIAS } from '../desktop/constants';
import { hideSectionTab } from '../headerapps/section-tab-hide';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { client } from '../api/client.gen.js';
import { backofficePathFromBaseHref } from '../desktop/boot/backoffice-path';
import { clearBootAttempt, hasBootAttempt, isBootSuppressed, markBootAttempt } from '../desktop/boot/boot-storage';
import {
    desktopSectionPath,
    isBackofficeRoot,
    isDesktopSectionPath,
    shouldBootIntoDesktop,
} from '../desktop/boot/boot-decision';

import { lowerBootSplash } from '../desktop/boot/splash';
import { parseSettings, settingsStorageKey } from '../desktop/settings/settings-store';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UMB_SERVER_CONTEXT } from '@umbraco-cms/backoffice/server';
import type { UmbElement } from '@umbraco-cms/backoffice/element-api';

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

    // Whether this load opens the desktop. Deliberately not awaited: nothing else here depends on
    // it, and the splash (raised in `bundle.manifests.ts`, before this module was even fetched) is
    // what makes waiting affordable.
    void decideBoot(host);
};

/** Runs when the package's backoffice extensions are unloaded. */
export const onUnload: UmbEntryPointOnUnload = (_host, _extensionRegistry) => {
};

/**
 * Open the desktop when this user boots into it, and take the splash down when they do not.
 *
 * **Why this can afford to wait.** The splash is already covering the screen by the time this runs,
 * so the decision does not have to be quick — it can wait for the current user and read the
 * authoritative per-user preference instead of trusting the browser-level hint that decided whether
 * to raise the splash. That is what makes a shared browser show the wrong splash at worst, rather
 * than sending somebody to the wrong place.
 *
 * It also means no attempt is made to beat the router's own redirect from the root to the first
 * allowed section. That redirect is delayed by `awaitStability`, and trying to win or cancel that
 * window is a race; the navigation below steps out of the race entirely instead.
 *
 * The preference is read straight out of the payload the settings context owns, rather than through
 * that context: it is provided by the desktop element, which does not exist yet at this point in
 * the boot.
 *
 * Access is checked against the user's own allowed sections and never trusted from storage. A
 * section route only exists for users granted that section, so redirecting an ungranted user would
 * land them on Not Found.
 * @param host The entrypoint's host element, used to reach the backoffice contexts.
 */
async function decideBoot(host: UmbElement): Promise<void> {
    const serverContext = await host.getContext(UMB_SERVER_CONTEXT);
    const backofficePath = serverContext?.getBackofficePath() ?? backofficePathFromBaseHref(document.baseURI);

    /**
     * Whether this load is on its way to the desktop, and must therefore keep its splash.
     *
     * `location.replace` does not stop this function: the navigation is queued and the code below
     * runs to completion first. Without this flag the cleanup lowered the splash while still on the
     * root path, uncovering the half-built backoffice — header up, section panel empty — for the
     * moment before the new document painted. Which is precisely the flash this whole feature exists
     * to remove, introduced by the fix for a different one.
     */
    let leaving = false;

    try {
        // Nothing to decide anywhere but the root: a deeper path is somebody's link, and a setting
        // that swallowed those would break every bookmark anyone has saved.
        if (!isBackofficeRoot(window.location.pathname, backofficePath)) return;

        const userContext = await host.getContext(UMB_CURRENT_USER_CONTEXT);
        if (!userContext) return;
        // Resolves only on a real user — `asPromise` skips undefined. If the user never arrives the
        // backoffice cannot render any section either, so hanging here costs nothing the user would
        // otherwise have had, and the splash lifts on its own timeout regardless.
        const user = await host.observe(userContext.currentUser).asPromise();
        if (!user?.unique) return;

        const markerPresent = hasBootAttempt();
        // Spent whether or not it stops this boot, so one failed boot costs one skipped boot rather
        // than every boot from here on.
        if (markerPresent) clearBootAttempt();

        const boot = shouldBootIntoDesktop({
            pathname: window.location.pathname,
            backofficePath,
            search: window.location.search,
            preference: parseSettings(readStoredSettings(user.unique)).bootIntoDesktop,
            exited: isBootSuppressed(),
            markerPresent,
            hasSectionAccess: (user.allowedSections ?? []).includes(UMBRADESKTOP_SECTION_ALIAS),
        });
        if (!boot) return;

        markBootAttempt();
        leaving = true;

        // A full navigation, not a `pushState`, and this is the whole design decision of the boot.
        //
        // `pushState` is one page load instead of two and is how the desktop's own Exit navigates,
        // so it was the obvious choice — but from the backoffice root it depends on core's router
        // being ready to hear it, and two separate things there are outside our control.
        // `RouterSlot.add` navigates only if the slot is already connected when its routes are
        // assigned, and `umb-backoffice-main` assigns them to a slot Lit has not connected yet, so
        // an event fired before that slot exists is spent on nobody. And the router's own redirect
        // from the root to the first allowed section is delayed by `awaitStability`, so it can
        // complete *after* ours and take the user to Content instead. Waiting for a section to
        // render first was tried and is not a signal we can rely on: on a slow instance the root
        // redirect sometimes does not complete at all, leaving a rendered header over an empty body
        // and nothing to wait for.
        //
        // Replacing the document sidesteps all of it. The desktop URL becomes the initial URL, which
        // is the same path a typed desktop URL takes and the one case that has never failed, because
        // there is no race left: the URL is already right when the router starts.
        //
        // The cost is a second page load, behind the splash. `replace`, not `assign`, so the root we
        // came from does not sit in the back history where Back would bounce the user through this
        // same decision again.
        window.location.replace(desktopSectionPath(backofficePath));
    } finally {
        // The splash must not outlive the decision, with two exceptions, both of which end in a
        // desktop taking the screen over: this load is navigating to one (`leaving`), or it already
        // is one (a typed desktop URL). In both cases the desktop element lowers the splash itself,
        // once it has a finished desktop to show.
        const handingOver = leaving || isDesktopSectionPath(window.location.pathname, backofficePath);
        if (!handingOver) lowerBootSplash();
    }
}

/**
 * Read one user's raw settings payload, tolerating storage that refuses to be read.
 * @param userUnique The current user's unique id.
 * @returns The raw payload, or null when absent or unreadable.
 */
function readStoredSettings(userUnique: string): string | null {
    try {
        return localStorage.getItem(settingsStorageKey(userUnique));
    } catch {
        return null;
    }
}
