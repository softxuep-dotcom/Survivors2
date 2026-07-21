import { lstat, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const uploadUrl = new URL('../dist/client/', import.meta.url);
const uploadPath = fileURLToPath(uploadUrl);
const maxFileCount = 1500;
const internalSizeLimit = 8 * 1024 * 1024;

async function collectFiles(directoryUrl, relativeDirectory = '') {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    const entryUrl = new URL(`${encodeURIComponent(entry.name)}${entry.isDirectory() ? '/' : ''}`, directoryUrl);
    const stats = await lstat(entryUrl);

    if (stats.isSymbolicLink()) {
      throw new Error(`Upload directory must not contain symbolic links: ${relativePath}`);
    }
    if (stats.isDirectory()) {
      files.push(...await collectFiles(entryUrl, relativePath));
    } else if (stats.isFile()) {
      files.push({ relativePath, size: stats.size });
    }
  }

  return files;
}

let files;
try {
  files = await collectFiles(uploadUrl);
} catch (error) {
  if (error?.code === 'ENOENT') {
    throw new Error('dist/client is missing; run npm run build first');
  }
  throw error;
}

const indexFile = files.find(file => file.relativePath === 'index.html');
if (!indexFile) throw new Error('dist/client/index.html must exist at the upload root');
if (files.length > maxFileCount) {
  throw new Error(`CrazyGames upload exceeds ${maxFileCount} files: ${files.length}`);
}

const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
if (totalBytes > internalSizeLimit) {
  throw new Error(`Upload directory exceeds Horde Spark's 8 MiB target: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
}

const indexHtml = await readFile(new URL('index.html', uploadUrl), 'utf8');
if (!indexHtml.includes('https://sdk.crazygames.com/crazygames-sdk-v3.js')) {
  throw new Error('dist/client/index.html is missing the CrazyGames SDK v3 script');
}

console.log(`CrazyGames upload directory ready: ${uploadPath}`);
console.log(`${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB total; index.html is at the upload root.`);
