import type { InstalledPackage } from './facts.js';
import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { attempt, isDenied, SECURITY } from '../shared/http.js';

/** What the server says about itself. Any part may be missing: each is asked for separately. */
export interface ServerFacts {
  /** Umbraco's version and how it runs, or undefined if it could not be read. */
  information?: { version: string; assemblyVersion: string; baseUtcOffset: string; runtimeMode: string };
  /**
   * The server's troubleshooting details (operating system, framework, database and so on), as the
   * backoffice's own Help > System information lists them. `'denied'` when Umbraco keeps them from
   * this user; undefined if they could not be read.
   */
  troubleshooting?: Array<{ name: string; data: string }> | 'denied';
  /** The installed packages, from Umbraco's manifest endpoint. */
  packages?: InstalledPackage[];
  /** The signed-in user: who the desktop is "registered to". */
  user?: { name?: string; email?: string };
  /**
   * Whether the signed-in user may see the list of installed packages: true when they have the
   * Packages section, which is where Umbraco itself lists them.
   *
   * This hides the list from the window; it does not make it secret. The list comes from Umbraco's
   * manifest endpoint, which every signed-in backoffice user can call, because the backoffice loads
   * every package's extensions through it (it answers 401 to anyone not signed in). What the guard
   * stops is the window laying the whole list out for anyone who opens it. The desktop's own
   * versions are still read from it, for the Desktop category, since those are not a list of what
   * else is installed.
   */
  packagesVisible: boolean;
}

/** What the browser says about the machine it runs on. Everything a browser will say, and no more. */
export interface MachineFacts {
  /** The user agent string. */
  userAgent: string;
  /** `navigator.userAgentData.platform`, where the browser has it. */
  platform?: string;
  /** The site's address: the "Computer" the desktop runs on, as far as the person is concerned. */
  host: string;
  /** Logical processors. */
  processors?: number;
  /** Memory in GB, rounded and capped by the browser; Chromium only. */
  memoryGb?: number;
  /** The screen. */
  screen: { width: number; height: number; colorDepth: number };
  /** Device pixels per CSS pixel. */
  pixelRatio: number;
  /** The browser's language. */
  language: string;
  /** The time zone. */
  timeZone: string;
  /** How long the backoffice has been open, in ms. */
  uptimeMs: number;
  /** The graphics hardware, as WebGL names it, where it will. */
  graphics?: string;
  /** How much the browser stores for this site, and how much it may. */
  storage?: { usage: number; quota: number };
}

/** Where System Information's facts come from. An interface so tests can answer. */
export interface SystemInfoSource {
  /** Ask the server. */
  server(): Promise<ServerFacts>;
  /** Ask the browser. */
  machine(): Promise<MachineFacts>;
}

/** The management API's root. */
const API = '/umbraco/management/api/v1';

/**
 * Umbraco's Packages section, whose users may see the installed packages. Written out because the
 * backoffice exports no constant for it.
 */
const PACKAGES_SECTION_ALIAS = 'Umb.Section.Packages';

/**
 * The graphics hardware's name from WebGL, which is the one place a browser gives it. Some browsers
 * refuse, or give a generic name on purpose; either way it is what the browser says, not a guess.
 * @returns The renderer's name, or undefined.
 */
function graphicsName(): string | undefined {
  try {
    const context = document.createElement('canvas').getContext('webgl');
    if (!context) return undefined;
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    const name = context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER);
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return typeof name === 'string' && name ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The real source: Umbraco's own server endpoints, the same ones Help > System information reads,
 * and the browser's navigator and screen.
 * @param host The element asking, for the current-user context.
 * @returns The source.
 */
export function createSystemInfoSource(host: UmbLitElement): SystemInfoSource {
  return {
    async server() {
      const [information, troubleshooting, packages, userContext] = await Promise.all([
        attempt<ServerFacts['information']>(() => umbHttpClient.get({ url: `${API}/server/information`, security: [...SECURITY] })),
        attempt<{ items?: Array<{ name: string; data: string }> }>(() =>
          umbHttpClient.get({ url: `${API}/server/troubleshooting`, security: [...SECURITY] }),
        ),
        attempt<InstalledPackage[]>(() => umbHttpClient.get({ url: `${API}/manifest/manifest`, security: [...SECURITY] })),
        host.getContext(UMB_CURRENT_USER_CONTEXT).catch(() => undefined),
      ]);
      return {
        information: information.data,
        troubleshooting: troubleshooting.data?.items ?? (isDenied(troubleshooting.error) ? 'denied' : undefined),
        packages: Array.isArray(packages.data) ? packages.data : undefined,
        user: userContext ? { name: userContext.getName(), email: userContext.getEmail() } : undefined,
        packagesVisible: userContext?.getAllowedSection()?.includes(PACKAGES_SECTION_ALIAS) ?? false,
      };
    },
    async machine() {
      const navigatorExtras = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
      const storage = await navigator.storage?.estimate?.().catch(() => undefined);
      return {
        userAgent: navigator.userAgent,
        platform: navigatorExtras.userAgentData?.platform,
        host: location.host,
        processors: navigator.hardwareConcurrency || undefined,
        memoryGb: navigatorExtras.deviceMemory,
        screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
        pixelRatio: devicePixelRatio,
        language: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        uptimeMs: performance.now(),
        graphics: graphicsName(),
        storage: storage?.usage !== undefined && storage.quota !== undefined ? { usage: storage.usage, quota: storage.quota } : undefined,
      };
    },
  };
}
