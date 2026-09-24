/**
 * System Information's wording, apart from the window: each fact the browser and the server give,
 * written the way Windows' System Properties and System Information wrote it. Pure, so the tests
 * need no DOM and no server.
 */

/** A section of the report: a heading and its item/value rows. */
export interface ReportSection {
  /** The heading, as the category list shows it. */
  heading: string;
  /** Item and value, in order. */
  rows: Array<[item: string, value: string]>;
}

/** One installed package, as Umbraco's manifest endpoint lists it. */
export interface InstalledPackage {
  /** Its display name. */
  name: string;
  /** Its package id, when it declares one. */
  id?: string | null;
  /** Its version, when it declares one. */
  version?: string | null;
}

/**
 * The published theme ids (`docs/desktop-apps.md` §5) and their names as the theme picker shows
 * them. An id added after this was written is shown as itself, which is a normal event, not a fault.
 */
const THEME_NAMES: Record<string, string> = {
  umbraco: 'Umbraco',
  umbraco4: 'Umbraco 4',
  macos: 'macOS',
  win11: 'Windows 11',
  win98: 'Windows 98',
};

/**
 * The active theme's name.
 * @param id The id the desktop stamped on the app, if any.
 * @returns Its name, its id if unknown, or undefined with no theme.
 */
export function themeName(id: string | null | undefined): string | undefined {
  return id ? (THEME_NAMES[id] ?? id) : undefined;
}

/**
 * The browser and its version, from its user agent string.
 *
 * Order matters: every Chromium browser says Chrome and Safari as well, and Edge adds "Edg/", so the
 * specific names are tried before the general ones. Chromium-based browsers other than Edge report as
 * Chrome, which is what they are underneath.
 * @param userAgent The user agent string.
 * @returns "Chrome 140", "Firefox 131", "Safari 18.1", or the string itself if none match.
 */
export function browserName(userAgent: string): string {
  const patterns: Array<[RegExp, string]> = [
    [/Edg\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari\//, 'Safari'],
  ];
  for (const [pattern, name] of patterns) {
    const match = pattern.exec(userAgent);
    if (match) return `${name} ${match[1]}`;
  }
  return userAgent;
}

/**
 * The operating system, from the platform the browser reports if it reports one, else its user
 * agent. **No version is claimed**: browsers report every Windows since 10 as "Windows NT 10.0" and
 * froze macOS at 10.15, so a version read from either would be wrong for most people.
 * @param userAgent The user agent string.
 * @param platform `navigator.userAgentData.platform`, where the browser has it.
 * @returns "Windows", "macOS", "Linux", "Android", "iOS", "ChromeOS", or undefined.
 */
export function operatingSystem(userAgent: string, platform?: string): string | undefined {
  const source = platform || userAgent;
  if (/iPhone|iPad|iPod/.test(source)) return 'iOS';
  if (/Android/.test(source)) return 'Android';
  if (/CrOS|Chrome OS|ChromeOS/i.test(source)) return 'ChromeOS';
  if (/Windows|Win(32|64)/.test(source)) return 'Windows';
  if (/Mac/.test(source)) return 'macOS';
  if (/Linux|X11/.test(source)) return 'Linux';
  return platform || undefined;
}

/**
 * The display's colour depth, in Windows' own words from Display Properties.
 * @param bits `screen.colorDepth`.
 * @returns "True Color (24 bit)", "High Color (16 bit)", "256 Colors", or the bits.
 */
export function colourDepth(bits: number): string {
  if (bits >= 24) return `True Color (${bits} bit)`;
  if (bits >= 15) return `High Color (${bits} bit)`;
  if (bits === 8) return '256 Colors';
  return `${bits} bit`;
}

/**
 * The machine's memory as the browser reports it. Browsers round it to a power of two and stop at
 * 8 GB, so as not to single a machine out, so 8 means "8 or more".
 * @param gigabytes `navigator.deviceMemory`, which only Chromium browsers have.
 * @returns "8 GB or more", "4 GB", "512 MB", or undefined where the browser does not say.
 */
export function memorySize(gigabytes: number | undefined): string | undefined {
  if (gigabytes === undefined) return undefined;
  if (gigabytes >= 8) return '8 GB or more';
  return gigabytes >= 1 ? `${gigabytes} GB` : `${Math.round(gigabytes * 1024)} MB`;
}

/**
 * A size in bytes, in the largest unit that keeps it at one or more.
 * @param bytes The size.
 * @returns "512 bytes", "2.0 KB", "5.3 MB".
 */
export function formatBytes(bytes: number): string {
  const units = ['KB', 'MB', 'GB', 'TB'];
  if (bytes < 1024) return `${bytes} bytes`;
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * How long something has been up, as the old Task Manager wrote it.
 * @param ms Milliseconds.
 * @returns "d:hh:mm:ss".
 */
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(seconds / 86_400)}:${two(Math.floor(seconds / 3600) % 24)}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}`;
}

/**
 * A version without its build metadata: what follows a `+` in semantic versioning, which Umbraco
 * uses for the commit it was built from. A pre-release label stays, since it is part of the release.
 * @param version The version as reported.
 * @returns "17.7.0" for "17.7.0+d64a209".
 */
export function releaseVersion(version: string): string {
  return version.split('+')[0];
}

/**
 * A package's version, by its id, among those installed.
 * @param installed The installed packages.
 * @param id The package id.
 * @returns Its version, or undefined if it is not there or declares none.
 */
export function packageVersion(installed: InstalledPackage[], id: string): string | undefined {
  return installed.find((installedPackage) => installedPackage.id === id)?.version ?? undefined;
}

/**
 * The whole report as text, for Copy: each section's heading in brackets, as an old .ini file or an
 * msinfo32 export had them, then its rows with the values lined up.
 * @param sections The report.
 * @returns The text.
 */
export function reportText(sections: ReportSection[]): string {
  return sections
    .map(({ heading, rows }) => {
      const width = Math.max(0, ...rows.map(([item]) => item.length));
      return [`[${heading}]`, ...rows.map(([item, value]) => `${item.padEnd(width)}  ${value}`)].join('\n') + '\n';
    })
    .join('\n');
}
