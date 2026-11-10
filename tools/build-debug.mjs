import * as esbuild from 'esbuild';
await esbuild.build({ entryPoints: ['tests/debug.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist-tests/debug.js', logLevel: 'warning' });
