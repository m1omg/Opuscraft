// Build script for Opuscraft.
//   node tools/build.mjs            -> production build into dist/
//   node tools/build.mjs --serve    -> dev server with live rebuild on http://localhost:8080
//   node tools/build.mjs --tests    -> bundle headless simulation tests into dist-tests/
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const dist = join(root, 'dist');

async function buildTests() {
  mkdirSync(join(root, 'dist-tests'), { recursive: true });
  await esbuild.build({
    entryPoints: [join(root, 'tests/simtest.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    sourcemap: 'inline',
    outfile: join(root, 'dist-tests/simtest.js'),
    logLevel: 'warning',
  });
}

function copyStatic() {
  mkdirSync(dist, { recursive: true });
  copyFileSync(join(root, 'src/index.html'), join(dist, 'index.html'));
  copyFileSync(join(root, 'src/style.css'), join(dist, 'style.css'));
}

function writeStandalone() {
  // A single self-contained HTML file (script and styles inlined) that can be opened directly.
  const html = readFileSync(join(root, 'src/index.html'), 'utf8');
  const css = readFileSync(join(root, 'src/style.css'), 'utf8');
  const js = readFileSync(join(dist, 'opuscraft.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  const out = html
    .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
    .replace('<script src="opuscraft.js"></script>', () => `<script>\n${js}\n</script>`);
  writeFileSync(join(dist, 'opuscraft-standalone.html'), out);
}

const common = {
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: join(dist, 'opuscraft.js'),
  logLevel: 'warning',
};

if (args.has('--tests')) {
  await buildTests();
} else if (args.has('--serve')) {
  copyStatic();
  const ctx = await esbuild.context({ ...common, sourcemap: 'inline' });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: dist, port: 8080 });
  console.log(`Opuscraft dev server: http://localhost:${port}`);
} else {
  copyStatic();
  await esbuild.build({ ...common, minify: true, legalComments: 'none' });
  writeStandalone();
  console.log('Built dist/index.html, dist/opuscraft.js and dist/opuscraft-standalone.html');
}
