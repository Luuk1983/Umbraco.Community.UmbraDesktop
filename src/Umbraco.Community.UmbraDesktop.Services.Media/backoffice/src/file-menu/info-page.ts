import { css, html } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import type { WordKey } from '../shared/words.js';
import { formatBytes, formatLabel } from './formats.js';
import type { FileMenuDocument } from './types.js';

/**
 * Info: what the open file is, without a heading (the panel's title). Name, folder, dimensions as it will be saved, its size and format
 * now, when it was last changed, and how many places use it (#137). The count only, not the places:
 * the item's own Info tab in the Media section lists them, and the question here is "may I change
 * this", which the number answers. Left out while the count is not known.
 * @param document What is open.
 * @param words The package's words.
 * @param lang The language to write numbers and dates in.
 * @param usedIn How many places use the item, or undefined when that is not known.
 * @returns The page's content.
 */
export function renderInfoPage(
  document: FileMenuDocument | null,
  words: (key: WordKey, ...args: unknown[]) => string,
  lang: string,
  usedIn?: number,
): TemplateResult {
  if (!document) return html``;
  const updated = document.updateDate
    ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(document.updateDate))
    : words('infoNeverSaved');
  const rows: Array<[WordKey, string]> = [
    ['infoName', document.name],
    ['infoFolder', document.folderName ?? words('saveAsRoot')],
    ['infoDimensions', words('infoDimensionsValue', document.width, document.height)],
    ['infoSize', formatBytes(document.bytes, lang)],
    ['infoFormat', formatLabel(document.extension)],
    ['infoUpdated', updated],
  ];
  if (usedIn !== undefined) {
    const value = usedIn === 0 ? words('infoUsedInNone') : usedIn === 1 ? words('infoUsedInOne') : words('infoUsedInMany', usedIn.toLocaleString(lang));
    rows.push(['infoUsedIn', value]);
  }
  return html`
    <dl class="info">
      ${rows.map(([label, value]) => html`<dt>${words(label)}</dt><dd>${value}</dd>`)}
    </dl>
  `;
}

/** Info's own styles: a two-column list of facts. */
export const infoPageStyles = css`
  .info {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 8px 24px;
    margin: 0;
  }

  .info dt {
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
  }

  .info dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;
