import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: ['src/**/*.test.ts'],
  nodeResolve: true,
  // `tsconfig` is what carries `experimentalDecorators` through to esbuild. Without it Lit's
  // @state()/@customElement compile as standard decorators and every element fails to load
  // with "Unsupported decorator location: field".
  // `json: true` lets a test import the shipped `episodes.snapshot.json` the way Vite's build does;
  // without it the dev server sends the file as application/json and the browser refuses the import.
  plugins: [esbuildPlugin({ ts: true, json: true, target: 'es2020', tsconfig: 'tsconfig.json' })],
  testFramework: { config: { timeout: '5000' } },
  // Every test page carries `frame-src 'none'`, so an iframe a test draws keeps the address it was
  // given and never loads it. umbraCoffee's window draws YouTube's player and live chat, and its
  // tests assert only on their addresses: without this every run would fetch YouTube in the
  // background, slower and dependent on the network for no assertion. Test pages only; the package
  // itself is untouched.
  testRunnerHtml: (testFramework) => `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Security-Policy" content="frame-src 'none'" />
  </head>
  <body>
    <script type="module" src="${testFramework}"></script>
  </body>
</html>`,
};
