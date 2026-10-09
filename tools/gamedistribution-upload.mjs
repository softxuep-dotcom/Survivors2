import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const projectUrl = new URL('../', import.meta.url);
const uploadUrl = new URL('dist/gamedistribution/', projectUrl);
const uploadPath = fileURLToPath(uploadUrl);
const packageJson = JSON.parse(await readFile(new URL('package.json', projectUrl), 'utf8'));
const archiveName = `horde-spark-gamedistribution-v${packageJson.version}.zip`;
const archiveUrl = new URL(`dist/${archiveName}`, projectUrl);
const internalSizeLimit = 8 * 1024 * 1024;
const maxFileCount = 1500;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function collectFiles(directoryUrl, relativeDirectory = '') {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    const entryUrl = new URL(`${encodeURIComponent(entry.name)}${entry.isDirectory() ? '/' : ''}`, directoryUrl);
    const stats = await lstat(entryUrl);
    invariant(!stats.isSymbolicLink(), `GameDistribution package must not contain symbolic links: ${relativePath}`);
    if (stats.isDirectory()) files.push(...await collectFiles(entryUrl, relativePath));
    else if (stats.isFile()) files.push({ relativePath, url: entryUrl, size: stats.size });
  }
  return files;
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    return value >>> 0;
  });
}

const CRC_TABLE = makeCrcTable();

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(fileName, data, offset) {
  const name = Buffer.from(fileName, 'utf8');
  const crc = crc32(data);
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const flags = 0x0800;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(offset, 42);
  return { local: Buffer.concat([local, name, data]), central: Buffer.concat([central, name]) };
}

async function createZip(files) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  for (const file of files) {
    const data = await readFile(file.url);
    const entry = zipEntry(file.relativePath, data, offset);
    localChunks.push(entry.local);
    centralChunks.push(entry.central);
    offset += entry.local.length;
  }
  const centralOffset = offset;
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  await writeFile(archiveUrl, Buffer.concat([...localChunks, ...centralChunks, end]));
}

let files;
try {
  files = await collectFiles(uploadUrl);
} catch (error) {
  if (error?.code === 'ENOENT') {
    throw new Error('dist/gamedistribution is missing; run npm run build:gamedistribution first');
  }
  throw error;
}

invariant(files.some(file => file.relativePath === 'index.html'),
  'dist/gamedistribution/index.html must exist at the ZIP root');
invariant(files.length <= maxFileCount, `GameDistribution package unexpectedly contains ${files.length} files`);
const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
invariant(totalBytes <= internalSizeLimit,
  `GameDistribution package exceeds Horde Spark's 8 MiB target: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);

const html = await readFile(new URL('index.html', uploadUrl), 'utf8');
invariant(html.includes('<meta name="horde-spark:portal" content="gamedistribution">'),
  'GameDistribution portal marker is missing');
invariant(html.includes('window["GD_OPTIONS"]'), 'GD_OPTIONS must be installed before game startup');
invariant(html.includes('https://html5.api.gamedistribution.com/main.min.js'),
  'GameDistribution SDK script is missing');
invariant(!html.includes('sdk.crazygames.com'), 'GameDistribution build must not load the CrazyGames SDK');
invariant(!html.includes('__GD_GAME_ID_REQUIRED__'),
  'GameDistribution build has no game ID; set GD_GAME_ID to the ID shown in the developer dashboard');
const gameId = html.match(/"gameId":\s*"([a-f0-9]{32})"/iu)?.[1];
invariant(gameId && !/^0{32}$/u.test(gameId), 'GameDistribution build must contain a real 32-character game ID');
invariant(!/(?:src|href)=["']\/(?!\/)/iu.test(html), 'GameDistribution build must use relative asset and script URLs');
invariant(!html.includes('__GAME_PORTAL__'), 'GameDistribution portal compile constant was not replaced');

await createZip(files);
const archiveStats = await lstat(archiveUrl);
console.log(`GameDistribution upload ready: ${fileURLToPath(archiveUrl)} (${(archiveStats.size / 1024 / 1024).toFixed(2)} MiB)`);
console.log(`${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB unpacked; index.html is at the ZIP root.`);
console.log(`Validated GameDistribution game ID ${gameId}. Source directory: ${uploadPath}`);
