import { build } from 'vite';
import { build as bundle } from 'esbuild';
import { readFile, writeFile, readdir, stat, unlink, rename, mkdir, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const publishOut = resolve(root, 'dist/douyin');
await mkdir(resolve(root, 'dist'), { recursive: true });
const out = await mkdtemp(resolve(root, 'dist/.douyin-stage-'));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const project = JSON.parse(await readFile(resolve(root, 'config/douyin.json'), 'utf8'));
const gameName = project.projectname.trim();
if (!gameName) throw new Error('config/douyin.json requires a projectname');
const appid = (process.env.DOUYIN_APP_ID || project.appid || '').trim();
const adUnitId = (process.env.DOUYIN_REWARDED_AD_UNIT_ID || '').trim();
if (appid && !/^tt[\da-z]+$/i.test(appid)) throw new Error('DOUYIN_APP_ID must start with tt');

await build({
  configFile: false, root, base: './',
  define: { __GAME_VERSION__: JSON.stringify(pkg.version), __GAME_PORTAL__: '"douyin"',
    __GAME_NAME__: JSON.stringify(gameName),
    __DOUYIN_REWARDED_AD_UNIT_ID__: JSON.stringify(adUnitId) },
  build: { outDir: out, emptyOutDir: true, target: 'es2019',
    rollupOptions: { input: resolve(root, 'src/main.js'),
      output: { format: 'cjs', entryFileNames: 'horde.js', inlineDynamicImports: true } } },
});
await bundle({ entryPoints: [resolve(root, 'src/minigame/install-douyin.js')], bundle: true,
  platform: 'neutral', format: 'cjs', target: 'es2019', minify: true,
  outfile: resolve(out, 'adapter.js') });
await writeFile(resolve(out, 'game.js'), "require('./adapter.js');\nrequire('./horde.js');\n");
await writeFile(resolve(out, 'game.json'), JSON.stringify({ deviceOrientation: 'portrait' }, null, 2));
await writeFile(resolve(out, 'project.config.json'), JSON.stringify({
  appid, projectname: gameName, description: `${gameName} 抖音小游戏`,
  compileType: 'game', setting: { es6: false, minified: true, urlCheck: true },
}, null, 2));
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push({ path, bytes: (await stat(path)).size });
  }
  return result;
}
// The IDE package whitelist does not include .webp or .frag. Keep source art
// untouched; only convert copies inside this build's output directory.
for (const file of await files(resolve(out, 'assets'))) {
  if (file.path.endsWith('.webp')) {
    await sharp(await readFile(file.path)).png({ palette: true, quality: 90, effort: 7 })
      .toFile(file.path.replace(/\.webp$/, '.png'));
    await unlink(file.path);
  } else if (file.path.endsWith('.frag')) {
    await rename(file.path, file.path.replace(/\.frag$/, '.txt'));
  } else if (file.path.endsWith('.json')) {
    const json = JSON.parse(await readFile(file.path, 'utf8'));
    if (json.meta?.image?.endsWith('.webp')) {
      json.meta.image = json.meta.image.replace(/\.webp$/, '.png');
      await writeFile(file.path, JSON.stringify(json));
    }
  }
}
const entries = await files(out);
const packagedExtensions = new Set(['.js', '.json', '.png', '.wav', '.txt']);
for (const file of entries) {
  if (!packagedExtensions.has(extname(file.path))) throw new Error(`Unsupported Douyin package asset: ${file.path}`);
  // Vite's ES2019 target preserves these, but the device VM can reject them
  // before any startup/error handler runs. Check dependencies as well as UI.
  if (extname(file.path) === '.js' && /\\[pP]\{/.test(await readFile(file.path, 'utf8'))) {
    throw new Error(`Unsupported Unicode property escape in Douyin script: ${file.path}`);
  }
}
const bytes = entries.reduce((sum, file) => sum + file.bytes, 0);
if (entries.some(file => /\.html$/i.test(file.path))) throw new Error('Mini-game output must not contain HTML');
if (bytes >= 5 * 1024 * 1024) throw new Error('Douyin initial package exceeds internal 5 MiB budget; split/trim assets');
// Prepare and validate everything outside the imported project. Publish assets
// first and game.js last: the IDE must not see new code before its assets exist.
const publicationOrder = entries.sort((a, b) => {
  const priority = path => path.endsWith('game.js') ? 3 : path.endsWith('.js') ? 2 : path.endsWith('.json') ? 1 : 0;
  return priority(a.path) - priority(b.path);
});
await mkdir(publishOut, { recursive: true });
for (const file of publicationOrder) {
  const relativePath = file.path.slice(out.length + 1);
  const target = resolve(publishOut, relativePath);
  await mkdir(resolve(target, '..'), { recursive: true });
  await copyFile(file.path, target);
}
// Remove only our old unsupported extensions, preserving IDE private settings.
for (const file of await files(resolve(publishOut, 'assets'))) {
  if (/\.(webp|frag)$/i.test(file.path)) await unlink(file.path);
}
// out is the unique staging directory created by mkdtemp above.
if (!out.startsWith(resolve(root, 'dist/.douyin-stage-'))) throw new Error('Unsafe staging directory');
await rm(out, { recursive: true, force: true });
console.log(`Douyin: ${publishOut}\n${entries.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MiB (single package).`);
if (!appid) console.log('AppID not configured: select/create an app in Douyin IDE before preview/upload.');
if (!adUnitId) console.log('Rewarded ads disabled until DOUYIN_REWARDED_AD_UNIT_ID is configured.');
