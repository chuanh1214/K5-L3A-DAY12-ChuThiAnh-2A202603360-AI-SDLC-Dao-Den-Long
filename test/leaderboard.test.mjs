import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('leaderboard validates names and exports the persisted top ten in order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lantern-board-test-'));
  const path = join(dir, 'scores.json');
  const previous = process.env.LANTERN_LEADERBOARD_PATH;
  process.env.LANTERN_LEADERBOARD_PATH = path;
  const { createGameServer } = await import('../scripts/serve.mjs');
  if (previous === undefined) delete process.env.LANTERN_LEADERBOARD_PATH;
  else process.env.LANTERN_LEADERBOARD_PATH = previous;
  const server = createGameServer();
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const endpoint = origin + '/api/leaderboard';
    const post = (name, score) => fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ name, score, nights_won: 1, seed: 42 })
    });
    assert.equal((await post('?', 500)).status, 400);
    assert.equal((await post('First', 500)).status, 200);
    assert.equal((await post('Second', 500)).status, 200);
    const others = await Promise.all(Array.from({ length: 10 }, (_, i) => post(`May_${i}`, i)));
    assert.ok(others.every(response => response.ok));
    const board = await (await fetch(endpoint)).json();
    assert.deepEqual(board.entries.map(entry => entry.name),
      ['First', 'Second', 'May_9', 'May_8', 'May_7', 'May_6', 'May_5', 'May_4', 'May_3', 'May_2']);
    assert.match(board.entries[0].achieved_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    const out = join(dir, 'export.json');
    const child = spawnSync(process.execPath, ['scripts/serve.mjs', '--export-leaderboard', out], {
      env: { ...process.env, LANTERN_LEADERBOARD_PATH: path }, encoding: 'utf8'
    });
    assert.equal(child.status, 0, child.stderr);
    const { readFile } = await import('node:fs/promises');
    assert.deepEqual(JSON.parse(await readFile(out, 'utf8')), board);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
