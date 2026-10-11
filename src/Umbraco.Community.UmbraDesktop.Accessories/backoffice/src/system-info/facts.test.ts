import { expect } from '@open-wc/testing';
import {
  browserName,
  colourDepth,
  formatBytes,
  formatUptime,
  memorySize,
  operatingSystem,
  packageVersion,
  releaseVersion,
  reportText,
  themeName,
} from './facts.js';

/**
 * System Information's wording, without a DOM: how each fact the browser and the server give is
 * written the way the old System Properties and System Information wrote it.
 */

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.3485.54';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

it('names the theme, and falls back to its id for one it does not know', () => {
  expect([themeName('win98'), themeName('macos'), themeName('umbraco4'), themeName('beos'), themeName(undefined)]).to.deep.equal([
    'Windows 98',
    'macOS',
    'Umbraco 4',
    'beos',
    undefined,
  ]);
});

/** Every Chromium browser says Chrome and Safari; Edge says Edg as well, and that is what decides. */
it('names the browser and its major version', () => {
  expect([CHROME_WINDOWS, EDGE, FIREFOX_LINUX, SAFARI_MAC].map((ua) => browserName(ua))).to.deep.equal([
    'Chrome 140',
    'Edge 140',
    'Firefox 131',
    'Safari 18.1',
  ]);
});

/** Browsers stopped telling Windows 10 and 11 apart, and froze macOS at 10.15, so neither is claimed. */
it('names the operating system without claiming a version the browser does not really give', () => {
  expect([CHROME_WINDOWS, FIREFOX_LINUX, SAFARI_MAC, SAFARI_IPHONE].map((ua) => operatingSystem(ua))).to.deep.equal([
    'Windows',
    'Linux',
    'macOS',
    'iOS',
  ]);
});

it('prefers the platform the browser reports directly', () => {
  expect(operatingSystem(CHROME_WINDOWS, 'Chrome OS')).to.equal('ChromeOS');
});

/** Windows' own words from the Display Properties colour list. */
it('writes the colour depth as Display Properties did', () => {
  expect([colourDepth(32), colourDepth(24), colourDepth(16), colourDepth(8)]).to.deep.equal([
    'True Color (32 bit)',
    'True Color (24 bit)',
    'High Color (16 bit)',
    '256 Colors',
  ]);
});

/** Browsers round memory and stop at 8 GB, so 8 means "8 or more". */
it('writes memory as the browser rounds it', () => {
  expect([memorySize(8), memorySize(4), memorySize(0.5), memorySize(undefined)]).to.deep.equal([
    '8 GB or more',
    '4 GB',
    '512 MB',
    undefined,
  ]);
});

it('writes a size in bytes in the largest unit that keeps it above one', () => {
  expect([formatBytes(512), formatBytes(2048), formatBytes(5 * 1024 ** 2 + 300 * 1024), formatBytes(3 * 1024 ** 3)]).to.deep.equal([
    '512 bytes',
    '2.0 KB',
    '5.3 MB',
    '3.0 GB',
  ]);
});

/** The old Task Manager's "Up Time": days, then hours, minutes and seconds. */
it('writes up time as days:hours:minutes:seconds', () => {
  expect([formatUptime(5_000), formatUptime(3_723_000), formatUptime(90_061_000)]).to.deep.equal(['0:00:00:05', '0:01:02:03', '1:01:01:01']);
});

it('finds a package’s version among the installed ones', () => {
  const installed = [
    { name: 'UmbraDesktop', id: 'Umbraco.Community.UmbraDesktop', version: '17.3.0' },
    { name: 'Other', version: '1.0.0' },
  ];
  expect([packageVersion(installed, 'Umbraco.Community.UmbraDesktop'), packageVersion(installed, 'Missing')]).to.deep.equal([
    '17.3.0',
    undefined,
  ]);
});

/** Copy puts it on the clipboard as text, for pasting into a support request. */
it('writes the whole report as text, a heading and aligned lines per section', () => {
  const text = reportText([
    { heading: 'Umbraco', rows: [['Version', '17.7.0'], ['Runtime mode', 'Development']] },
    { heading: 'Empty', rows: [] },
  ]);
  expect(text).to.equal('[Umbraco]\nVersion       17.7.0\nRuntime mode  Development\n\n[Empty]\n');
});

/** Umbraco reports its build too; General says the release, as System Properties did, and Details says it all. */
it('writes a version without its build metadata for General', () => {
  expect([releaseVersion('17.7.0+d64a209'), releaseVersion('17.0.0-alpha.0.55'), releaseVersion('17.7.0')]).to.deep.equal([
    '17.7.0',
    '17.0.0-alpha.0.55',
    '17.7.0',
  ]);
});
