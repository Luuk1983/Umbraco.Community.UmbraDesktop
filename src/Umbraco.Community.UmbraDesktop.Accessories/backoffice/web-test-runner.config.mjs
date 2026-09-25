import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: ['src/**/*.test.ts'],
  nodeResolve: true,
  // `tsconfig` is what carries `experimentalDecorators` through to esbuild. Without it Lit's
  // @state()/@customElement compile as standard decorators and every element fails to load
  // with "Unsupported decorator location: field".
  plugins: [esbuildPlugin({ ts: true, target: 'es2020', tsconfig: 'tsconfig.json' })],
  testFramework: { config: { timeout: '5000' } },
  // One test file at a time. Run concurrently, this suite never finished: every file reported its
  // tests passed and the run still hung past any testsFinishTimeout, 120s or 300s. The runner puts
  // concurrent files in background tabs, and Chrome gives a background tab no animation frames and
  // throttles its timers, which is fatal to tests that measure a laid-out app (fits.test.ts mounts
  // nine of them under six themes at two sizes) or wait on a frame. One at a time, every file is
  // the foreground tab and the whole suite takes about 25 seconds. CI runs this same command
  // (.github/actions/build-packages), so this is what makes it pass there too.
  concurrency: 1,
};
