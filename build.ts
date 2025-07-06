import * as esbuild from 'esbuild';

const cjsSupport = `import { createRequire } from "module";
const require = createRequire(import.meta.url);

import url from "url";
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
`;

esbuild
  .build({
    entryPoints: ['src/index.ts', 'src/sse.ts', 'src/cli.ts'],
    bundle: true,
    outdir: 'build',
    platform: 'node',
    target: ['es2020'],
    format: 'esm',
    banner: {
      js: cjsSupport,
    },
    plugins: [],
    external: ['buffer', 'stream', 'util', 'fs', 'path', 'http', 'https', 'crypto'],
  })
  .catch(() => process.exit(1));
