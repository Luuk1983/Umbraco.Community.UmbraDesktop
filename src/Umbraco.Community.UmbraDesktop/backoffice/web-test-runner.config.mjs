import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: ['src/**/*.test.ts'],
  nodeResolve: true,
  plugins: [esbuildPlugin({ ts: true, target: 'es2020' })],
  testFramework: { config: { timeout: '5000' } },
};
