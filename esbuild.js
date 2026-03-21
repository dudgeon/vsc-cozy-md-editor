const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const web = process.argv.includes('--web');

async function main() {
  const shared = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    external: ['vscode'],
    sourcemap: true,
    minify: production,
  };

  if (web) {
    // Browser / vscode.dev build
    const ctx = await esbuild.context({
      ...shared,
      format: 'cjs',
      platform: 'browser',
      outfile: 'dist/extension-web.js',
      // Provide empty shims for any Node built-ins that leak through deps
      define: { 'process.env.NODE_ENV': production ? '"production"' : '"development"' },
    });

    if (watch) {
      await ctx.watch();
      console.log('[web] Watching for changes...');
    } else {
      await ctx.rebuild();
      await ctx.dispose();
    }
  } else {
    // Desktop / Node.js build
    const ctx = await esbuild.context({
      ...shared,
      format: 'cjs',
      platform: 'node',
      outfile: 'dist/extension.js',
    });

    if (watch) {
      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      await ctx.rebuild();
      await ctx.dispose();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
