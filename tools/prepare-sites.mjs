import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';

const distUrl = new URL('../dist/', import.meta.url);
const entries = await readdir(distUrl, { withFileTypes: true });
await Promise.all(entries
  .filter(entry => entry.name !== 'client' && entry.name !== 'server')
  .map(entry => rm(new URL(entry.name, distUrl), { recursive: true, force: true })));

const worker = `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    const url = new URL(request.url);
    url.pathname = '/index.html';
    return env.ASSETS.fetch(new Request(url, request));
  },
};
`;

const serverUrl = new URL('server/', distUrl);
await mkdir(serverUrl, { recursive: true });
await writeFile(new URL('index.js', serverUrl), worker);
