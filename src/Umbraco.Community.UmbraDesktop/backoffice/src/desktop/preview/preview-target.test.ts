import { expect } from '@open-wc/testing';
import { previewTargetFromPath, withoutWorkspaceView, workspaceViewPathname } from './preview-target';

/**
 * What the preview opens is read off the document window's route: the document's GUID and the
 * variant the editor is working in. The paths below follow core's document workspace routes; the
 * browser checks confirm them against a running backoffice.
 */

const GUID = 'ca4249ed-2b23-4337-b522-63cabe5587d1';

it('reads the document and its culture from an edit route', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/edit/${GUID}/en-US/view/content`)).to.deep.equal({
    unique: GUID,
    culture: 'en-US',
    segment: undefined,
  });
});

it('reads an invariant document as having no culture', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/edit/${GUID}/invariant`)).to.deep.equal({
    unique: GUID,
    culture: undefined,
    segment: undefined,
  });
});

it('reads a segment after the culture', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/edit/${GUID}/da-DK_members`)).to.deep.equal({
    unique: GUID,
    culture: 'da-DK',
    segment: 'members',
  });
});

it('takes the first variant of a split view, which is the one being edited on the left', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/edit/${GUID}/en-US_&_da-DK/view/content`)).to.deep.equal({
    unique: GUID,
    culture: 'en-US',
    segment: undefined,
  });
});

it('reads a document route with no variant segment yet as the default variant', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/edit/${GUID}`)).to.deep.equal({
    unique: GUID,
    culture: undefined,
    segment: undefined,
  });
});

it('answers nothing for a route that is not a document being edited', () => {
  expect(previewTargetFromPath('/umbraco/section/content/dashboard')).to.equal(undefined);
  expect(previewTargetFromPath(`/umbraco/section/media/workspace/media/edit/${GUID}`)).to.equal(undefined);
});

it('answers nothing for a document being created, which has nothing saved to preview', () => {
  expect(previewTargetFromPath(`/umbraco/section/content/workspace/document/create/parent/document/null/${GUID}`)).to.equal(
    undefined,
  );
});

describe('the workspace view a document route ends in', () => {
  it('reads the view pathname after the variant segment', () => {
    expect(workspaceViewPathname(`/umbraco/section/content/workspace/document/edit/${GUID}/en-US/view/info`)).to.equal('info');
  });

  it('reads it from a split view, whose routes all hang off the one variant segment', () => {
    expect(workspaceViewPathname(`/umbraco/section/content/workspace/document/edit/${GUID}/en-US_&_da-DK/view/info`)).to.equal(
      'info',
    );
  });

  it('stops at the view, so a route the view adds below it does not change which view it is', () => {
    expect(
      workspaceViewPathname(`/umbraco/section/content/workspace/document/edit/${GUID}/invariant/view/engage-analytics/devices`),
    ).to.equal('engage-analytics');
  });

  it('answers nothing for a document showing its first view, which has no view segment', () => {
    expect(workspaceViewPathname(`/umbraco/section/content/workspace/document/edit/${GUID}/en-US`)).to.equal(undefined);
  });

  it('answers nothing for a view on anything but a document being edited', () => {
    expect(workspaceViewPathname(`/umbraco/section/media/workspace/media/edit/${GUID}/view/info`)).to.equal(undefined);
  });
});

describe('the route of a document’s first view', () => {
  it('drops the view and everything below it, which is the route core shows the first view on', () => {
    expect(withoutWorkspaceView(`/umbraco/section/content/workspace/document/edit/${GUID}/en-US/view/info`)).to.equal(
      `/umbraco/section/content/workspace/document/edit/${GUID}/en-US`,
    );
    expect(
      withoutWorkspaceView(`/umbraco/section/content/workspace/document/edit/${GUID}/en-US/view/engage-analytics/devices`),
    ).to.equal(`/umbraco/section/content/workspace/document/edit/${GUID}/en-US`);
  });

  it('leaves a route with no view as it is', () => {
    const path = `/umbraco/section/content/workspace/document/edit/${GUID}/en-US`;
    expect(withoutWorkspaceView(path)).to.equal(path);
  });
});
