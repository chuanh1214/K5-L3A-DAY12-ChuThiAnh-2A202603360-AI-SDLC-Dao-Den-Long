import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const cli = fileURLToPath(new URL('../scripts/headless.mjs', import.meta.url));
const { tuning } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
const emptyIsland = { random_motes: false, random_shades: false };
const scenarioWith = options => ({ ...emptyIsland, ...options });

function execute(t, { scenario, frames, ticks = 120, seed = 42 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'lantern-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const out = join(directory, 'out.jsonl');
  const args = [cli, '--seed', String(seed), '--night', '1', '--ticks', String(ticks), '--out', out, '--snapshot-every', '1'];
  for (const [flag, data] of [['scenario', scenario], ['inputs', frames === undefined ? undefined : { frames }]]) {
    if (data === undefined) continue;
    const path = join(directory, flag + '.json');
    writeFileSync(path, JSON.stringify(data));
    args.push('--' + flag, path);
  }
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (result.status !== 0) return { result };
  const raw = readFileSync(out, 'utf8');
  const records = raw.trimEnd().split('\n').map(JSON.parse);
  return {
    result, raw, end: records.at(-1),
    snapshots: records.filter(record => record.type === 'snapshot'),
    events: records.filter(record => record.type === 'event')
  };
}

test('tick 0, movement rotation and normalization, held input and a single jump', t => {
  const output = execute(t, {
    scenario: scenarioWith({}), frames: [
      { tick: 0, move: [0, 1], cam_yaw_deg: 90, jump: true },
      { tick: 30, move: [1, 1], cam_yaw_deg: 0 },
      { tick: 90, move: [0, 0] }
    ]
  });
  assert.deepEqual(output.snapshots[0].player.pos, [0, 0, 0]);
  assert.equal(output.snapshots[0].sim_tick, 0);
  assert.ok(output.snapshots[1].player.pos[1] > 0);
  assert.equal(output.snapshots[30].player.pos[0], 3);
  assert.deepEqual(output.snapshots[90].player.pos, [7.243, 0, 4.243]);
  assert.deepEqual(output.snapshots[120].player.pos, output.snapshots[90].player.pos);
  assert.equal(output.snapshots[120].time_left_s, tuning.night1_duration_s - 2);
  assert.deepEqual(output.end, { type: 'end', ticks: 120, state: 'playing', score: 0 });
});

test('pickup, partial deposit, input edge, fifth lamp, win and score', t => {
  const output = execute(t, {
    scenario: scenarioWith({
      player: { carried: 4 }, motes: [[0, 0, 0], [0, 0, 1.5]],
      lanterns: [{ id: 'L1', pos: [0, 0, 1] },
        ...['L2', 'L3', 'L4', 'L5'].map(id => ({ id, lit: true }))]
    }),
    frames: [{ tick: 0, interact: true }, { tick: 1, move: [0, 1] },
      { tick: 4, move: [0, 0] }, { tick: 5, interact: false }, { tick: 6, interact: true }]
  });
  assert.equal(output.snapshots[0].score, 0);
  assert.deepEqual(output.events.map(({ name, tick }) => [name, tick]), [
    ['mote_picked', 1], ['deposit', 1], ['mote_picked', 4],
    ['deposit', 7], ['lantern_lit', 7], ['game_over', 7]
  ]);
  assert.deepEqual(output.events[1].data, { lantern_id: 'L1', amount: 5, deposited: 5 });
  assert.deepEqual(output.events.at(-1).data, { result: 'won', reason: 'all_lit' });
  assert.equal(output.end.score, 2 * tuning.score.per_mote + tuning.score.per_lantern
    + 299 * tuning.score.per_second_left + tuning.flames * tuning.score.per_flame_left);
});

test('pulse pushes and stuns only shades within range and consumes light', t => {
  const output = execute(t, {
    scenario: scenarioWith({
      player: { carried: 2 },
      shades: [{ id: 'near', pos: [0, 0, 5] }, { id: 'far', pos: [0, 0, 8] }]
    }),
    frames: [{ tick: 0, pulse: true }]
  });
  assert.deepEqual(output.events[0], { type: 'event', tick: 1, name: 'pulse', data: { stunned_ids: ['near'] } });
  assert.deepEqual(output.snapshots[1].shades[0], { id: 'near', pos: [0, 0, 8], state: 'stunned' });
  assert.equal(output.snapshots[1].shades[1].state, 'chase');
  assert.equal(output.snapshots[1].player.carried, 0);
});

test('shade contact, invulnerability, loss and safe lantern zone', t => {
  const shades = [{ pos: [0, 0, 0] }];
  const output = execute(t, { scenario: scenarioWith({ shades }), ticks: 200 });
  assert.deepEqual(output.events.filter(event => event.name === 'player_hit').map(event => event.tick), [1, 91, 181]);
  assert.deepEqual(output.events.at(-1).data, { result: 'lost', reason: 'no_flames' });
  assert.equal(output.end.ticks, 181);
  const safe = execute(t, { scenario: scenarioWith({ shades, lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }] }) });
  assert.equal(safe.events.length, 0);
  assert.ok(Math.abs(safe.snapshots[1].shades[0].pos[0]) > tuning.safe_radius);
});

test('dawn terminates the simulation, and a seeded run is byte-identical', t => {
  const dawn = execute(t, { scenario: scenarioWith({ time_left_s: 0.1 }) });
  assert.equal(dawn.end.ticks, 6);
  assert.deepEqual(dawn.events.at(-1).data, { result: 'lost', reason: 'dawn' });
  const first = execute(t, { ticks: 480 });
  const second = execute(t, { ticks: 480 });
  assert.ok(first.events.some(event => event.name === 'shade_spawned'));
  assert.equal(first.raw, second.raw);
  assert.notEqual(first.raw, execute(t, { ticks: 480, seed: 43 }).raw);
});

test('invalid input and scenario return code 2 and write an error to stderr', t => {
  for (const options of [
    { frames: [{ tick: 1 }, { tick: 1 }] },
    { frames: [{ tick: 0, move: [0, 2] }] },
    { scenario: { shades: [{ id: 'S1' }] } },
    { scenario: { lanterns: [{ id: 'L6' }] } }
  ]) {
    const { result } = execute(t, options);
    assert.equal(result.status, 2);
    assert.notEqual(result.stderr.trim(), '');
  }
});
