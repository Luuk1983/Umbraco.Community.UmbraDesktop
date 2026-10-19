// Batch 2 of the Media Manager mocks: cut, copy and paste, the OS clipboard, files dropped from
// the OS file manager, and the transfer window. Writes ../batch-2.html.
const fs = require('fs');
const path = require('path');
const K = require('./kit.cjs');
const { PRODUCTS, PEOPLE, FOLDERS, byId, manager, win, scene, cardRect, menu, CORE_ITEM_MENU, osGhost, explorer, transfers, toast, ic } = K;

const SINGLE = { x: 60, y: 40, w: 1120, h: 623 };
const TALL = { x: 60, y: 30, w: 1120, h: 860 };
const LEFT = { x: 24, y: 24, w: 768, h: 623 };
const RIGHT = { x: 808, y: 24, w: 768, h: 760 };
const tasks = (...labels) => labels.map(([label, active, progress, icon]) => ({ label, active, progress, icon }));

const left = (o = {}) => manager({ ...LEFT, title: 'Products', current: 'products', items: PRODUCTS, ...o });
const right = (o = {}) => manager({ ...RIGHT, title: 'People', current: 'people', items: PEOPLE, ...o });

/** The tree with People open on the Spring campaign folder that 5b uploads. */
const campaignTree = (current) => ({
  current,
  rows: [
    { label: 'Media', icon: 'image', depth: 0, open: true, id: 'media' },
    { label: 'Engage', icon: 'folder', depth: 1, kids: true, id: 'engage' },
    { label: 'People', icon: 'folder', depth: 1, open: true, id: 'people' },
    { label: 'Spring campaign', icon: 'folder', depth: 2, open: true, id: 'spring' },
    { label: 'Banners', icon: 'folder', depth: 3, id: 'banners' },
    { label: 'Social', icon: 'folder', depth: 3, id: 'social' },
    { label: 'Video', icon: 'folder', depth: 3, id: 'video' },
    { label: 'Design', icon: 'folder', depth: 1, id: 'design' },
    { label: 'Products', icon: 'folder', depth: 1, kids: true, id: 'products' },
  ],
});
const SPRING = { id: null, name: 'Spring campaign', folder: true };

const s4 = [];
{
  const r = cardRect(SINGLE, 1);
  s4.push(
    scene({
      id: 's4a',
      title: '4a. Cut and copy, from the menu or the keys',
      lede: 'Banjo\'s menu, in the manager. Cut and Copy are ours, at the top; the rest is core\'s.',
      wins: [manager({ ...SINGLE, title: 'Products', active: true, current: 'products', items: PRODUCTS, state: { banjo: { hover: true } } })],
      tasks: tasks(['Products', true]),
      over: menu([['scissors', 'Cut', true], ['copy', 'Copy', true], ...CORE_ITEM_MENU], r.x + r.w - 66, r.y + 40),
      notes: [
        [1, r.x + r.w + 150, r.y + 58, 'Cut and Copy are entity actions of ours, shown only inside the manager, so the Media section\'s menu does not change. With several items selected, the same two are in core\'s selection bar.'],
        [2, null, null, 'Keys: Ctrl+X, Ctrl+C and Ctrl+V, or Cmd on a Mac. They act on the selection, or on the focused card when nothing is selected.'],
        [3, null, null, 'A folder\'s menu, in the cards or in the tree, gets "Paste" while the clipboard holds something.'],
      ],
    }),
  );

  const cut = { banjo: { cut: true }, jumpsuit: { cut: true } };
  s4.push(
    scene({
      id: 's4b',
      title: '4b. Cut in one window, paste in another',
      lede: 'Banjo and Jumpsuit were cut in Products. In People, Ctrl+V or Paste in the folder\'s menu moves them here.',
      wins: [
        left({ state: cut }),
        right({ active: true }),
      ],
      tasks: tasks(['Products'], ['People', true]),
      over: menu([['clipboard', 'Paste', true], ['newWindow', 'Open in new window', true], ...CORE_ITEM_MENU], K.treeRect(RIGHT, 2).x + K.treeRect(RIGHT, 2).w - 30, K.treeRect(RIGHT, 2).y + 34),
      notes: [
        [1, cardRect(LEFT, 1).cx, cardRect(LEFT, 1).cy, 'Cut items stay where they are, faded, as Explorer does. Nothing moves until you paste.'],
        [2, K.treeRect(RIGHT, 2).x + K.treeRect(RIGHT, 2).w + 170, K.treeRect(RIGHT, 2).y + 52, 'Paste is ours, in a folder\'s menu in the tree or on a folder card, shown while something is cut or copied. No strip or banner: no OS shows its clipboard either. Esc empties a cut.'],
        [3, null, null, 'Pasting moves them, exactly like a drop: People comes out with them selected (as in 2e). Pasting the same cut a second time does nothing, because they have moved.'],
      ],
    }),
  );

  s4.push(
    scene({
      id: 's4c',
      title: '4c. Copying an image also puts the picture on the clipboard',
      lede: 'Banjo is selected and you press Ctrl+C. Nothing on screen changes, as in any file manager.',
      wins: [manager({ ...SINGLE, title: 'Products', active: true, current: 'products', items: PRODUCTS, state: { banjo: { selected: true } }, selectionBar: '1 of 8 selected' })],
      tasks: tasks(['Products', true]),
      notes: [
        [1, cardRect(SINGLE, 1).cx, cardRect(SINGLE, 1).cy, 'Pasted inside the manager, it makes a copy of the media item. Pasted outside the browser, it is just the picture.'],
        [2, null, null, 'The browser only lets us put PNG on the clipboard, so a JPEG or WebP is converted on the way. The media item itself is not touched.'],
        [3, null, null, 'Copying several items, or anything that is not an image, puts nothing on the OS clipboard: there is no picture to give it.'],
      ],
    }),
  );

  const ph = cardRect(TALL, 6);
  s4.push(
    scene({
      id: 's4d',
      title: '4d. Pasting a screenshot',
      lede: 'You took a screenshot, clicked into People and pressed Ctrl+V.',
      wins: [
        manager({ ...TALL, title: 'People', active: true, current: 'people', loader: 0.6, items: [...PEOPLE, { id: 'pasted', name: 'Pasted image 2026-10-17 15.25.png' }], state: { pasted: { placeholder: { progress: 0.6 } } } }),
      ],
      tasks: tasks(['People', true]),
      notes: [
        [1, ph.cx, ph.y + 10, 'The picture goes up through core\'s own upload, into the open folder, so core picks the media type (Image) exactly as for a dropped file. This is core\'s placeholder card with its progress badge, and core\'s bar under the toolbar.'],
        [2, ph.x + ph.w - 10, ph.y + ph.h - 20, 'The clipboard has no file name, so we name it "Pasted image" with the date and time. Rename it in the pane (batch 3).'],
        [3, null, null, 'When it is done, it is selected, as after a drop.'],
        [4, null, null, 'If the picture on the clipboard is the one the manager put there in 4c, Ctrl+V pastes a copy of the media item instead of uploading a new one.'],
      ],
    }),
  );
}

const s5 = [];
{
  const PEOPLE_WIN = { x: 520, y: 30, w: 1050, h: 860 };
  const files = [
    { name: 'hero-banner.jpg', meta: '2.4 MB', sel: true },
    { name: 'team-photo.jpg', meta: '3.1 MB', sel: true },
    { name: 'brochure.pdf', meta: '880 KB', sel: true },
    { name: 'Spring campaign', folder: true, meta: 'Folder' },
    { name: 'notes.txt', meta: '2 KB' },
  ];
  const cx = 1180, cy = 520;
  s5.push(
    scene({
      id: 's5a',
      title: '5a. Dragging files in from File Explorer',
      lede: 'Three files from Downloads, dragged from Windows File Explorer (outside the browser) over the People window.',
      wins: [
        manager({ ...PEOPLE_WIN, title: 'People', current: 'people', items: PEOPLE, coreDrop: true, extra: `<div class="dzlabel">${ic('upload', 16)} Upload into People</div>` }),
        explorer({ x: 30, y: 380, w: 540, h: 260, title: 'Downloads', rows: files }),
      ],
      tasks: tasks(['People', true]),
      over: osGhost(cx, cy, 3),
      notes: [
        [1, cx - 40, cy - 86, 'The drag image and the "+ Copy" label are Windows\' own. A page cannot change them.'],
        [2, 1556, 200, 'Core\'s dropzone takes the drop and shows its frame. The upload is core\'s: the media type comes from the file extension, and core asks when it is ambiguous.'],
        [3, 1046, 136, 'Ours: a label naming the folder the files will land in, because the Windows label cannot.'],
        [4, null, null, 'Dropping onto a folder card uploads into that folder, the same as dragging items onto it (2c).'],
      ],
    }),
  );

  const TRANSFER = { x: 1000, y: 210, w: 570, h: 660 };
  const w = { x: 40, y: 30, w: 1000, h: 860 };
  const sp = cardRect(w, 6);
  s5.push(
    scene({
      id: 's5b',
      title: '5b. Dropping a whole folder',
      lede: 'The Spring campaign folder from Explorer, 42 files in three subfolders, dropped on People.',
      wins: [
        manager({ ...w, title: 'People', current: 'people', items: [...PEOPLE, SPRING], loader: 0.04 }),
        win({ ...TRANSFER, title: 'Transfers', icon: 'upload', active: true, body: transfers([
          { title: 'Uploading Spring campaign to People', overall: 0.04, meta: '2 of 42 files, 6 MB of 186 MB, about 4 minutes left', buttons: [{ label: 'Pause', icon: 'pause' }, { label: 'Cancel' }],
            items: [
              { name: 'Spring campaign', path: 'People', folder: true, status: 'done' },
              { name: 'Banners', path: 'Spring campaign', folder: true, status: 'done' },
              { name: 'Social', path: 'Spring campaign', folder: true, status: 'done' },
              { name: 'Video', path: 'Spring campaign', folder: true, status: 'done' },
              { name: 'hero-banner-wide.jpg', path: 'Spring campaign / Banners', thumb: 'janae', status: 'done' },
              { name: 'hero-banner-square.jpg', path: 'Spring campaign / Banners', thumb: 'erica', status: 'done' },
              { name: 'hero-banner-mobile.jpg', path: 'Spring campaign / Banners', thumb: 'poornima', status: 'run', p: 0.4 },
              { name: 'skyscraper.jpg', path: 'Spring campaign / Banners', thumb: 'busra', status: 'run', p: 0.15 },
              { name: 'team-day-01.jpg', path: 'Spring campaign / Social', status: 'wait' },
            ] },
        ]) }),
      ],
      tasks: tasks(['People'], ['Transfers', true, 0.04, 'upload']),
      notes: [
        [1, sp.cx, sp.cy, 'Core creates the folder and its subfolders first, so the structure is kept, then uploads the files into them.'],
        [2, 1550, 228, 'Ours: an operation still running after 2 seconds opens the Transfers window, as Windows and the Finder do. A quicker one only shows core\'s placeholder cards, as in 4d.'],
        [3, null, null, 'There is one Transfers window for the whole desktop, so an upload from one window and a copy from another queue in the same place.'],
      ],
    }),
  );
}

const s6 = [];
{
  const BIG = { x: 300, y: 30, w: 820, h: 880 };
  const running = [
    { title: 'Uploading Spring campaign to People', overall: 0.45, meta: '19 of 42 files, 84 MB of 186 MB, about 2 minutes left', buttons: [{ label: 'Pause', icon: 'pause' }, { label: 'Cancel' }],
      items: [
        { name: 'hero-banner-mobile.jpg', path: 'Spring campaign / Banners', thumb: 'poornima', status: 'done' },
        { name: 'skyscraper.jpg', path: 'Spring campaign / Banners', thumb: 'busra', status: 'done' },
        { name: 'launch-film.mp4', path: 'Spring campaign / Video', status: 'fail', reason: 'Umbraco: "The file exceeds the maximum upload size of 30 MB." The others carry on.' },
        { name: 'team-day-01.jpg', path: 'Spring campaign / Social', thumb: 'ravi', status: 'done' },
        { name: 'team-day-02.jpg', path: 'Spring campaign / Social', thumb: 'emmanuel', status: 'run', p: 0.62 },
        { name: 'team-day-03.jpg', path: 'Spring campaign / Social', thumb: 'janae', status: 'run', p: 0.2 },
        { name: 'team-day-04.jpg', path: 'Spring campaign / Social', status: 'wait' },
        { name: '20 more waiting', status: 'wait', retry: false },
      ] },
    { title: 'Copying 12 items to Design', icon: 'copy', overall: 0.17, meta: '2 of 12 items, about 1 minute left', buttons: [{ label: 'Pause', icon: 'pause' }, { label: 'Cancel' }],
      items: [
        { name: 'Knitted West', path: 'Design', thumb: 'knitted', status: 'done' },
        { name: 'Bowling Ball', path: 'Design', thumb: 'bowling', status: 'done' },
        { name: 'Ping Pong Ball', path: 'Design', thumb: 'pingpong', status: 'run', p: 0.3 },
      ] },
  ];
  s6.push(
    scene({
      id: 's6a',
      title: '6a. The Transfers window',
      lede: 'Halfway through the folder upload, with a copy started from another window running beside it.',
      wins: [
        manager({ x: 30, y: 30, w: 760, h: 700, title: 'People', current: 'people', items: [...PEOPLE.slice(0, 2), SPRING, ...PEOPLE.slice(2)], loader: 0.45 }),
        win({ ...BIG, title: 'Transfers', icon: 'upload', active: true, body: transfers(running) }),
      ],
      tasks: tasks(['People'], ['Transfers', true, 0.45, 'upload']),
      notes: [
        [1, 1094, 156, 'Per operation: what it is, an overall bar, counts, size and time left, and Pause and Cancel.'],
        [2, 1094, 230, 'A row per item, with where it is going. Two upload at a time.'],
        [3, 1094, 335, 'A failed item shows Umbraco\'s own reason, as Umbraco returns it, with Retry. It does not stop the others.'],
        [4, 1094, 680, 'Operations run side by side, each with its own Pause and Cancel, as in Windows and the Finder. How many files of one operation go up at once is left to the build.'],
        [5, null, null, 'Pause finishes the files already in flight and then waits. Cancel asks first: "Stop the 23 files not uploaded yet? The 19 already uploaded stay." Nothing is rolled back.'],
      ],
    }),
  );

  const camp = { x: 60, y: 40, w: 1120, h: 700 };
  s6.push(
    scene({
      id: 's6b',
      title: '6b. Minimised, still going',
      lede: 'Transfers is minimised and you carry on in People, now at Spring campaign.',
      wins: [
        manager({ ...camp, title: 'Spring campaign', active: true, treeOpts: campaignTree('spring'), items: ['Banners', 'Social', 'Video'].map((name) => ({ name, folder: true })) }),
      ],
      tasks: tasks(['Spring campaign', true], ['Transfers', false, 0.55, 'upload']),
      notes: [
        [1, 700, 924, 'The Transfers button shows the overall progress as the ring the desktop already draws for a busy window. Red if something failed, when it finishes.'],
        [2, null, null, 'Uploads keep going when you close the manager window they started from. Closing the Transfers window while it runs asks first. Leaving the desktop warns that unfinished transfers stop.'],
      ],
    }),
  );

  const done = [
    { title: 'Uploaded Spring campaign to People', state: 'done', icon: 'check', overall: 1, meta: '41 of 42 files uploaded. 1 failed.', buttons: [{ label: 'Retry failed' }, { label: 'Open folder', primary: true }],
      items: [
        { name: 'launch-film.mp4', path: 'Spring campaign / Video', status: 'fail', reason: 'Umbraco: "The file exceeds the maximum upload size of 30 MB."' },
        { name: '41 files uploaded', status: 'done', folder: true },
      ] },
    { title: 'Copying 12 items to Design', icon: 'copy', overall: 0.25, meta: '3 of 12 items, about 1 minute left', buttons: [{ label: 'Pause', icon: 'pause' }, { label: 'Cancel' }],
      items: [
        { name: 'Knitted West', path: 'Design', thumb: 'knitted', status: 'done' },
        { name: 'Bowling Ball', path: 'Design', thumb: 'bowling', status: 'done' },
        { name: 'Ping Pong Ball', path: 'Design', thumb: 'pingpong', status: 'done' },
        { name: 'Unicorn', path: 'Design', thumb: 'unicorn', status: 'run', p: 0.5 },
        { name: '8 more waiting', status: 'wait' },
      ] },
  ];
  s6.push(
    scene({
      id: 's6c',
      title: '6c. Finished, with one failure',
      lede: 'The upload is done except for one file; the copy is still going.',
      wins: [win({ ...BIG, title: 'Transfers', icon: 'upload', active: true, body: transfers(done) })],
      tasks: tasks(['Transfers', true, 0.25, 'upload']),
      notes: [
        [1, 1094, 156, 'A finished operation folds up to its failures and a count of what worked. Open folder opens a manager window on where it went.'],
        [2, null, null, 'Retry failed tries them again, for example after someone raised the upload limit.'],
        [3, null, null, 'A finished operation stays until you close the window, so a failure is never missed.'],
      ],
    }),
  );

  s6.push(
    scene({
      id: 's6d',
      title: '6d. Finished, nothing failed',
      lede: 'When everything succeeded, the Transfers window closes by itself and the desktop says so.',
      wins: [manager({ x: 60, y: 40, w: 1120, h: 700, title: 'People', active: true, current: 'people', items: [...PEOPLE.slice(0, 2), SPRING, ...PEOPLE.slice(2)] })],
      tasks: tasks(['People', true]),
      over: toast({ title: 'Spring campaign uploaded', text: '42 files in People', action: 'Open' }),
      notes: [
        [1, 1210, 860, 'The desktop\'s own notification, so it also lands in the notification list behind the clock.'],
      ],
    }),
  );
}

const html = K.page({
  title: 'Media Manager mocks, batch 2',
  lede: `<p class="lede">Scenarios 4 to 6: cut, copy and paste, the clipboard, files from File Explorer, and the Transfers window. Same conventions as batch 1: inside a window, everything right of the tree is core's.</p>
<div class="key"><span><span class="mk">1</span> a note, listed under the picture</span><span><span class="sw" style="background:#fff3e0;box-shadow:inset 3px 0 0 #e8573f"></span> ours, inside something of core's</span><span><span class="sw" style="background:#1b264f"></span> ours: labels</span></div>`,
  sections: [
    `<section class="sc"><h2>4. Cut, copy and paste</h2>${s4.join('')}</section>`,
    `<section class="sc"><h2>5. Files from File Explorer</h2>${s5.join('')}</section>`,
    `<section class="sc"><h2>6. The Transfers window</h2>${s6.join('')}</section>`,
  ],
  decided: [
    'No clipboard strip. Cut items show faded; Paste is Ctrl+V or the folder menu. If the shelf from #26 is ever built, that is where held items could show.',
    'The Transfers window opens for an operation still running after 2 seconds, as Windows and the Finder do. Quicker ones only show core\'s placeholders.',
    'One Transfers window for the whole desktop, one section per operation, as Windows, the Finder and GNOME do.',
    'Operations run side by side, each with its own Pause and Cancel.',
    'When everything worked the window closes itself and a desktop notification says so. When something failed, it stays.',
  ],
});

fs.writeFileSync(path.join(__dirname, '..', 'batch-2.html'), html);
console.log('batch-2.html', (html.length / 1024).toFixed(0) + ' KB');
