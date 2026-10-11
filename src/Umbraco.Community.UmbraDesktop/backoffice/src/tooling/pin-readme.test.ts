import { expect } from '@open-wc/testing';
import { pinReadmeLinks } from '../../scripts/docs/pin-readme.mjs';

const repo = 'Luuk1983/Umbraco.Community.UmbraDesktop';
const ref = '0123abc';

describe('pinReadmeLinks', () => {
  it('turns a relative page link into a GitHub link at the packed commit', () => {
    expect(pinReadmeLinks('See [themes](docs/user/appearance/themes.md).', { repo, ref })).to.equal(
      `See [themes](https://github.com/${repo}/blob/${ref}/docs/user/appearance/themes.md).`,
    );
  });

  it('keeps the heading anchor on a pinned link', () => {
    expect(pinReadmeLinks('[h](docs/user/windows/live-preview.md#headless-sites)', { repo, ref })).to.equal(
      `[h](https://github.com/${repo}/blob/${ref}/docs/user/windows/live-preview.md#headless-sites)`,
    );
  });

  it('points an image at the raw file, which is what an img tag can load', () => {
    expect(pinReadmeLinks('![Desktop](docs/screenshots/desktop.png)', { repo, ref })).to.equal(
      `![Desktop](https://raw.githubusercontent.com/${repo}/${ref}/docs/screenshots/desktop.png)`,
    );
  });

  it('links a directory with tree rather than blob', () => {
    expect(pinReadmeLinks('[guide](docs/user/)', { repo, ref })).to.equal(
      `[guide](https://github.com/${repo}/tree/${ref}/docs/user)`,
    );
  });

  it('resolves links against a readme that is not at the repository root', () => {
    const out = pinReadmeLinks('[games](docs/user/games.md) [licence](../../LICENSE)', {
      repo,
      ref,
      readmeDir: 'src/Umbraco.Community.UmbraDesktop.Entertainment',
    });
    expect(out).to.equal(
      `[games](https://github.com/${repo}/blob/${ref}/src/Umbraco.Community.UmbraDesktop.Entertainment/docs/user/games.md) ` +
        `[licence](https://github.com/${repo}/blob/${ref}/LICENSE)`,
    );
  });

  it('leaves absolute links and same-page anchors as they are', () => {
    const text = '[n](https://www.nuget.org/x) [up](#install) [m](mailto:a@b.c)';
    expect(pinReadmeLinks(text, { repo, ref })).to.equal(text);
  });

  it('leaves code alone, where a link is an example rather than a link', () => {
    const text = '```md\n[x](docs/a.md)\n```\n\n`[y](docs/b.md)`';
    expect(pinReadmeLinks(text, { repo, ref })).to.equal(text);
  });

  it('rewrites both halves of an image inside a link', () => {
    expect(pinReadmeLinks('[![Shot](docs/screenshots/a.png)](docs/user/README.md)', { repo, ref })).to.equal(
      `[![Shot](https://raw.githubusercontent.com/${repo}/${ref}/docs/screenshots/a.png)](https://github.com/${repo}/blob/${ref}/docs/user/README.md)`,
    );
  });
});
