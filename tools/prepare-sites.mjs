import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export async function prepareSites(distUrl = new URL('../dist/', import.meta.url)) {
  // Only own the Sites worker. Vite owns dist/client; other distribution
  // directories can be open in an IDE and must never be removed here.
  const serverUrl = new URL('server/', distUrl);
  await mkdir(serverUrl, { recursive: true });
  await writeFile(new URL('index.js', serverUrl), worker);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareSites();
}
