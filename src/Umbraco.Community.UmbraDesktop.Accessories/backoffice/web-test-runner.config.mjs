import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: ['src/**/*.test.ts'],
  nodeResolve: true,
  // `tsconfig` is what carries `experimentalDecorators` through to esbuild. Without it Lit's
  // @state()/@customElement compile as standard decorators and every element fails to load
  // with "Unsupported decorator location: field".
  plugins: [esbuildPlugin({ ts: true, target: 'es2020', tsconfig: 'tsconfig.json' })],
  testFramework: { config: { timeout: '5000' } },
};
