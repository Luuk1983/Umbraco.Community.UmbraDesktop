import { expect } from '@open-wc/testing';
import { planDocsCopy } from '../../scripts/docs/copy-plan.mjs';

describe('planDocsCopy', () => {
  /**
   * Plans a copy over an in-memory docs root.
   * @param files Path relative to the docs root to content, for every Markdown and JSON file.
   * @returns The plan.
   */
  const plan = (files: Record<string, string>) => planDocsCopy(new Map(Object.entries(files)));

  it('copies product.json and every page and category file under user/ and developer/', () => {
    const result = plan({
      'product.json': '{}',
      'user/README.md': '# U\n',
      'user/windows/_category_.json': '{}',
      'user/windows/snapping.md': '# S\n',
      'developer/theming.md': '# T\n',
    });
    expect(result.files).to.deep.equal([
      'developer/theming.md',
      'product.json',
      'user/README.md',
      'user/windows/_category_.json',
      'user/windows/snapping.md',
    ]);
  });

  it('leaves out design docs, plans and anything else that is not published', () => {
    const result = plan({
      'product.json': '{}',
      'design/2026-09-30-help-app-design.md': '# D\n',
      'plans/x.md': '# P\n',
      'notes.md': '# N\n',
      'user/README.md': '# U\n',
    });
    expect(result.files).to.deep.equal(['product.json', 'user/README.md']);
  });

  it('copies each image a published page uses, once, relative to the docs root', () => {
    const result = plan({
      'product.json': '{}',
      'user/windows/snapping.md': '![a](../../screenshots/snap.png)\n![again](../../screenshots/snap.png)\n',
      'user/README.md': '![b](../screenshots/hero.png)\n',
    });
    expect(result.images).to.deep.equal(['screenshots/hero.png', 'screenshots/snap.png']);
  });

  it('copies the image a page names in its front matter, which the Help landing page shows', () => {
    const result = plan({
      'product.json': '{}',
      'user/README.md': '---\nid: user-guide\nimage: ../screenshots/hero.png\n---\n\n# U\n',
    });
    expect(result.images).to.deep.equal(['screenshots/hero.png']);
  });

  it('ignores images that only unpublished files use, and images in code', () => {
    const result = plan({
      'product.json': '{}',
      'design/x.md': '![a](../screenshots/design-only.png)\n',
      'user/README.md': '```md\n![b](../screenshots/in-code.png)\n```\n',
    });
    expect(result.images).to.deep.equal([]);
  });

  it('leaves external images alone and reports an image outside the docs root', () => {
    const result = plan({
      'product.json': '{}',
      'user/README.md': '![a](https://img.shields.io/x)\n![b](../../src/Package-image.png)\n',
    });
    expect(result.images).to.deep.equal([]);
    expect(result.problems).to.deep.equal([
      'user/README.md uses ../../src/Package-image.png, which is outside the docs folder, so the Help app cannot show it',
    ]);
  });
});
