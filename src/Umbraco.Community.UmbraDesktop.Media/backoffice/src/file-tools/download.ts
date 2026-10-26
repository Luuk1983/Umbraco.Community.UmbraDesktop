import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbMediaUrlRepository } from '@umbraco-cms/backoffice/media';
import type { FileToolItem } from './item.js';

/**
 * Download on a media item (#176): the original file, as it is saved. Core has no download anywhere
 * on a media item.
 */

/** The marker a save over an item adds to its file name (edit-image design §11.4 and §11.7). */
const MARKER = /-ud[0-9a-f]{8}$/;

/**
 * The name a downloaded file gets: the last part of its address, decoded, without the `-ud` marker a
 * save over the item added. The marker is there to give each version a new address, so no cache shows
 * an old picture; it is not part of the name the person gave the file.
 * @param url The file's address.
 * @returns The file name.
 */
export function downloadName(url: string): string {
  const path = url.split(/[?#]/)[0];
  const last = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
  const dot = last.lastIndexOf('.');
  return dot > 0 ? `${last.slice(0, dot).replace(MARKER, '')}${last.slice(dot)}` : last.replace(MARKER, '');
}

/** What a download asks of the backoffice. Injectable, so a test answers without a server. */
export interface DownloadDeps {
  /**
   * The address of an item's saved file.
   * @param unique The item.
   * @returns The address, or undefined when the item holds no file.
   */
  urlOf(unique: string): Promise<string | undefined>;
  /**
   * Say that an item has no file to download.
   * @param name The item's name.
   */
  notify(name: string): void;
}

/**
 * Download an item's saved file, through a link the browser downloads, so a large video streams to
 * disk through the browser's own download rather than through memory. The link carries
 * `data-router-slot="disabled"`, because Umbraco's router takes same-origin link clicks for itself
 * (CLAUDE.md), and is gone again at once.
 * @param doc The document to click the link in: the one the action is in.
 * @param item The item.
 * @param deps How to read its address and say it has none.
 * @returns Whether a download started.
 */
export async function downloadFile(doc: Document, item: FileToolItem, deps: DownloadDeps): Promise<boolean> {
  const url = await deps.urlOf(item.unique);
  if (!url) {
    deps.notify(item.name);
    return false;
  }
  const link = doc.createElement('a');
  link.href = url;
  link.download = downloadName(url);
  link.setAttribute('data-router-slot', 'disabled');
  link.hidden = true;
  doc.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
  return true;
}

/**
 * The real address lookup: core's media URL repository, which answers with the `umbracoFile` address.
 * @param host The action, on whose host the repository is made.
 * @returns How to read an item's file address.
 */
export function backofficeUrlOf(host: UmbControllerHost): DownloadDeps['urlOf'] {
  return async (unique) => {
    const { data } = await new UmbMediaUrlRepository(host).requestItems([unique]);
    return data?.find((each) => each.unique === unique)?.url || undefined;
  };
}
