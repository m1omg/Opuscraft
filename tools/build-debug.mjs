import * as esbuild from 'esbuild';
const entry = process.argv[2] || 'tests/debug.ts';
const out = 'dist-tests/' + entry.split('/').pop().replace('.ts', '.js');
await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
