import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: ['src/**/*.test.ts'],
  nodeResolve: true,
  // `tsconfig` is what carries `experimentalDecorators` through to esbuild. Without it Lit's
  // @state()/@customElement compile as standard decorators and every element fails to load
  // with "Unsupported decorator location: field".
  plugins: [esbuildPlugin({ ts: true, target: 'es2020', tsconfig: 'tsconfig.json' })],
  testFramework: { config: { timeout: '5000' } },
  // One test file at a time, so every file is the foreground tab. Run concurrently, the runner puts
  // files in background tabs, where Chrome gives no animation frames, throttles timers and does not
  // let a page take keyboard focus, and the keyboard-focus tests (window-app-focus.test.ts), which
  // click and type for real, failed there while passing alone. The Accessories package hit the same
  // wall with a test that waits on a frame. The whole suite takes about a minute this way.
  concurrency: 1,
};
