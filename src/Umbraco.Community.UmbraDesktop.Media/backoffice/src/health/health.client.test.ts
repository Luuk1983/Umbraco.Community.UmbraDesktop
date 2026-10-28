import { expect } from '@open-wc/testing';
import { CORE_IMAGING_URLS, UmbraDesktopMediaHealthClient, MEDIA_HEALTH_BASE, MEDIA_HEALTH_PAGE_SIZE } from './health.client.js';
import type { HealthHttp, HealthItem } from './health.client.js';

/**
 * Every call the window makes to the add-on's own Media Health API (design §15) goes through this one
 * module. These tests pin the routes and the shapes to `Health/Api/MediaHealthController.cs`.
 */

/**
 * A stand-in HTTP client that records what it was asked and answers from a table.
 * @param answers What each route answers: a value, a function of the query, or `denied`.
 * @returns The client and what it was asked.
 */
function http(answers: Record<string, unknown>) {
  const calls: Array<{ method: string; url: string; query?: Record<string, unknown>; body?: unknown }> = [];
  const client: HealthHttp = {
    async get({ url, query }) {
      calls.push({ method: 'get', url, query });
      const answer = answers[url];
      if (answer === undefined) throw { status: 404 };
      return { data: typeof answer === 'function' ? answer(query) : answer };
    },
    async post({ url, body }) {
      calls.push({ method: 'post', url, body });
      const answer = answers[url];
      if (answer === undefined) throw { status: 404 };
      if (answer === 'denied') throw { status: 403 };
      return { data: answer };
    },
  };
  return { client, calls };
}

/**
 * An item as the server lists it.
 * @param over What differs.
 * @returns The item.
 */
const item = (over: Partial<HealthItem> = {}): HealthItem => ({
  key: 'a',
  name: 'Banjo',
  mediaTypeAlias: 'Image',
  extension: 'jpg',
  sizeBytes: 100,
  parentKey: 'f',
  path: '/Products',
  usageCount: 0,
  used: false,
  url: '/media/a/banjo.jpg',
  width: null,
  height: null,
  updatedUtc: '2026-01-01T00:00:00Z',
  ...over,
});

const noCheck = { running: null, last: null, failed: null, mediaCount: 0 };

describe('the Media Health client', () => {
  it('talks to the add-on under the management API', () => {
    expect(MEDIA_HEALTH_BASE).to.equal('/umbraco/management/api/v1/umbradesktop/media/health');
  });

  it('reads the status, and starts a check with a POST', async () => {
    const { client, calls } = http({
      [`${MEDIA_HEALTH_BASE}/status`]: noCheck,
      [`${MEDIA_HEALTH_BASE}/check`]: { running: { id: 1, phase: 'Usage', scanned: 0, total: 0 }, last: null, failed: null },
    });
    const health = new UmbraDesktopMediaHealthClient(client);
    expect((await health.status()).data?.running).to.equal(null);
    expect((await health.check()).data?.running?.phase).to.equal('Usage');
    expect(calls.map((call) => `${call.method} ${call.url}`)).to.deep.equal([`get ${MEDIA_HEALTH_BASE}/status`, `post ${MEDIA_HEALTH_BASE}/check`]);
  });

  it('passes the media count through with the status, and the facts the preview needs with the items', async () => {
    const facts = { url: '/media/a/x.jpg', width: 5472, height: 3648, updatedUtc: '2023-03-14T09:30:00Z' };
    const { client } = http({
      [`${MEDIA_HEALTH_BASE}/status`]: { ...noCheck, mediaCount: 18240 },
      [`${MEDIA_HEALTH_BASE}/items`]: () => ({ total: 1, items: [item(facts)] }),
    });
    const health = new UmbraDesktopMediaHealthClient(client);
    expect((await health.status()).data?.mediaCount).to.equal(18240);
    const [first] = (await health.allItems()).data ?? [];
    expect({ url: first.url, width: first.width, height: first.height, updatedUtc: first.updatedUtc }).to.deep.equal(facts);
  });

  it("gets items' signed thumbnails from core's own imaging route, which checks the person may see them", async () => {
    const { client, calls } = http({
      [CORE_IMAGING_URLS]: [
        { id: 'k1', urlInfos: [{ culture: null, url: '/media/a/x.jpg?width=240&height=240&rmode=crop&hmac=s' }] },
        { id: 'k2', urlInfos: [] },
      ],
    });
    const { data } = await new UmbraDesktopMediaHealthClient(client).itemThumbnails(['k1', 'k2'], 240);
    expect(calls[0]).to.deep.include({ method: 'get', url: CORE_IMAGING_URLS, query: { id: ['k1', 'k2'], width: 240, height: 240, mode: 'Crop' } });
    expect(data).to.deep.equal({ k1: '/media/a/x.jpg?width=240&height=240&rmode=crop&hmac=s' });
  });

  it("asks the add-on to sign orphaned files' thumbnails, which core cannot, since they are no item", async () => {
    const { client, calls } = http({ [`${MEDIA_HEALTH_BASE}/orphans/thumbnails`]: { urls: { '/media/a/x.jpg': '/media/a/x.jpg?width=240&hmac=s' } } });
    const { data } = await new UmbraDesktopMediaHealthClient(client).orphanThumbnails(['/media/a/x.jpg'], 240);
    expect(calls[0]).to.deep.include({ method: 'post', body: { urls: ['/media/a/x.jpg'], width: 240, height: 240 } });
    expect(data).to.deep.equal({ '/media/a/x.jpg': '/media/a/x.jpg?width=240&hmac=s' });
  });

  it('pages through every item at the largest page the server gives, in one list', async () => {
    const all = Array.from({ length: 1100 }, (_, index) => item({ key: `k${index}` }));
    const { client, calls } = http({
      [`${MEDIA_HEALTH_BASE}/items`]: (query?: Record<string, unknown>) => {
        const skip = Number(query?.skip);
        const take = Number(query?.take);
        return { total: all.length, items: all.slice(skip, skip + take) };
      },
    });
    const { data } = await new UmbraDesktopMediaHealthClient(client).allItems();
    expect(MEDIA_HEALTH_PAGE_SIZE).to.equal(500);
    expect(data?.length).to.equal(1100);
    expect(data?.[1099].key).to.equal('k1099');
    expect(calls.length).to.equal(3);
    expect(calls[1].query).to.deep.equal({ skip: 500, take: 500 });
  });

  it('stops paging when a page comes back short, so a shrinking list never loops', async () => {
    const { client, calls } = http({ [`${MEDIA_HEALTH_BASE}/items`]: () => ({ total: 900, items: [item()] }) });
    const { data } = await new UmbraDesktopMediaHealthClient(client).allItems();
    expect(data?.length).to.equal(1);
    expect(calls.length).to.equal(1);
  });

  it('reads the orphaned files and the folders', async () => {
    const { client } = http({
      [`${MEDIA_HEALTH_BASE}/orphans`]: { orphans: [{ relativePath: '1234/old.jpg', url: '/media/1234/old.jpg', sizeBytes: 5, lastModifiedUtc: '2026-01-01T00:00:00Z' }] },
      [`${MEDIA_HEALTH_BASE}/folders`]: { folders: [{ key: 'f', name: 'Products', parentKey: null, path: '/Products' }] },
    });
    const health = new UmbraDesktopMediaHealthClient(client);
    expect((await health.orphans()).data?.[0].relativePath).to.equal('1234/old.jpg');
    expect((await health.folders()).data?.[0].name).to.equal('Products');
  });

  it('deletes orphaned files by their relative paths, and reports what was skipped', async () => {
    const { client, calls } = http({
      [`${MEDIA_HEALTH_BASE}/orphans/delete`]: { deleted: ['1234/old.jpg'], skipped: [{ relativePath: '5/x.png', reason: 'NowOwned' }] },
    });
    const { data } = await new UmbraDesktopMediaHealthClient(client).deleteOrphans(['1234/old.jpg', '5/x.png']);
    expect(calls[0].body).to.deep.equal({ relativePaths: ['1234/old.jpg', '5/x.png'] });
    expect(data?.deleted).to.deep.equal(['1234/old.jpg']);
    expect(data?.skipped[0].reason).to.equal('NowOwned');
  });

  it('answers denied for a 403, and failed for anything else, instead of throwing', async () => {
    const { client } = http({ [`${MEDIA_HEALTH_BASE}/orphans/delete`]: 'denied' });
    const health = new UmbraDesktopMediaHealthClient(client);
    expect((await health.deleteOrphans(['a'])).error).to.equal('denied');
    expect((await health.status()).error).to.equal('failed');
  });
});
