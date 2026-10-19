import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: ['src/**/*.test.ts'],
  nodeResolve: true,
  // `tsconfig` is what carries `experimentalDecorators` through to esbuild, as in the other packages.
  plugins: [esbuildPlugin({ ts: true, target: 'es2020', tsconfig: 'tsconfig.json' })],
  // Longer than the other packages' 5 seconds: the rendering tests draw and encode a 6000 × 4000
  // picture, which takes a second or two on its own.
  testFramework: { config: { timeout: '20000' } },
  // One test file at a time, for the reason Accessories gives: concurrent files run in background
  // tabs, where Chrome gives no animation frames, and the fit and rendering tests wait on frames.
  concurrency: 1,
};
