import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: ['src/**/*.test.ts'],
  nodeResolve: true,
  // `tsconfig` is what carries `experimentalDecorators` through to esbuild, as in the other packages.
  plugins: [esbuildPlugin({ ts: true, target: 'es2020', tsconfig: 'tsconfig.json' })],
  testFramework: { config: { timeout: '5000' } },
  // One test file at a time, as in the other packages: concurrent files run in background tabs,
  // where Chrome throttles timers, and the context tests wait on timers.
  concurrency: 1,
};
