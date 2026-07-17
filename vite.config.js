import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default {
  base: './',
  build: {
    outDir: 'dist/client',
  },
  define: {
    __GAME_VERSION__: JSON.stringify(packageJson.version),
  },
};
