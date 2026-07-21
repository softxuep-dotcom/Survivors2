import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8082;
const outputDir = path.resolve('artifacts/crazygames-videos/source');
fs.mkdirSync(outputDir, { recursive: true });

function cors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((request, response) => {
  cors(response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== 'POST' || !request.url?.startsWith('/capture')) {
    response.writeHead(404).end('Not found');
    return;
  }

  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const safeName = (url.searchParams.get('name') || 'gameplay')
    .replace(/[^a-z0-9_-]+/gi, '-');
  const outputPath = path.join(outputDir, `${safeName}.webm`);
  const file = fs.createWriteStream(outputPath);
  let bytes = 0;
  request.on('data', chunk => { bytes += chunk.length; });
  request.pipe(file);
  file.on('finish', () => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ path: outputPath, bytes }));
  });
  file.on('error', error => {
    response.writeHead(500).end(error.message);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Video capture receiver listening on http://127.0.0.1:${PORT}`);
});
