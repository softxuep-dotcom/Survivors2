import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareSites } from './prepare-sites.mjs';

const tempRoot = resolve(tmpdir());
const fixture = await mkdtemp(resolve(tempRoot, 'horde-build-output-'));
try {
  const preserved = [
    'client/index.html', 'douyin/project.config.json', 'douyin/horde.js',
    'douyin/assets/players/player.png', 'gamedistribution/index.html',
    'itch/index.html', 'other-output/data.bin', 'server/extra.txt',
  ];
  for (const path of preserved) {
    await mkdir(resolve(fixture, path, '..'), { recursive: true });
    await writeFile(resolve(fixture, path), `preserve: ${path}`);
  }
  const fixtureUrl = pathToFileURL(fixture + sep);
  await prepareSites(fixtureUrl);
  await prepareSites(fixtureUrl);
  for (const path of preserved) {
    assert.equal(await readFile(resolve(fixture, path), 'utf8'), `preserve: ${path}`);
  }
  assert.match(await readFile(resolve(fixture, 'server/index.js'), 'utf8'), /env\.ASSETS\.fetch/);
  console.log('Build output contract OK: Sites preparation preserves all sibling distributions and is repeatable.');
} finally {
  // Delete only the temporary fixture created above, never a project output.
  assert.ok(fixture.startsWith(tempRoot + sep + 'horde-build-output-'));
  await rm(fixture, { recursive: true, force: true });
}
