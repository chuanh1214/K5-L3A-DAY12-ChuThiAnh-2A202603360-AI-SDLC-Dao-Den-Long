import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const cli = fileURLToPath(new URL('../scripts/headless.mjs', import.meta.url));
const { tuning } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
const emptyIsland = { random_motes: false, random_shades: false, random_drifters: false };
const scenarioWith = options => ({ ...emptyIsland, ...options });

function execute(t, { scenario, frames, ticks = 120, seed = 42, night = 1, snapshotEvery = 1 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'lantern-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const out = join(directory, 'out.jsonl');
  const args = [cli, '--seed', String(seed), '--night', String(night), '--ticks', String(ticks),
    '--out', out, '--snapshot-every', String(snapshotEvery)];
  for (const [flag, data] of [['scenario', scenario], ['inputs', frames === undefined ? undefined : { frames }]]) {
    if (data === undefined) continue;
    const path = join(directory, flag + '.json');
    writeFileSync(path, JSON.stringify(data));
    args.push('--' + flag, path);
  }
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) return { result };
  const raw = readFileSync(out, 'utf8');
  const records = raw.trimEnd().split('\n').map(JSON.parse);
  return {
    result, raw, end: records.at(-1),
    snapshots: records.filter(record => record.type === 'snapshot'),
    events: records.filter(record => record.type === 'event')
  };
}

test('tick 0 movement, camera rotation, normalized input and dash', t => {
  const output = execute(t, {
    scenario: scenarioWith({ motes: [], shades: [] }),
    frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 },
      { tick: 1, move: [1, 1], cam_yaw_deg: 0 },
      { tick: 3, move: [0, 1], dash: true },
      { tick: 4, dash: false }]
  });
  assert.deepEqual(output.snapshots[0].player.pos, [0, 0, 0]);
  assert.equal(output.snapshots[0].sim_tick, 0);
  assert.deepEqual(output.snapshots[1].player.pos, [0.1, 0, 0]);
  assert.ok(Math.abs(output.snapshots[2].player.pos[0] - 0.171) < 0.001);
  assert.ok(Math.abs(output.snapshots[2].player.pos[2] - 0.071) < 0.001);
  assert.equal(output.snapshots[4].player.dash_cd_s, 1.5);
  assert.equal(output.events.filter(event => event.name === 'dash').length, 1);
  assert.ok(Math.abs(output.snapshots[15].player.pos[2] - output.snapshots[3].player.pos[2] - 2.8) < 0.001);
  assert.equal(output.end.ticks, 120);
  assert.equal(output.end.state, 'playing');
  assert.equal(output.snapshots[120].time_left_s, tuning.night1_duration_s - 2);
});

test('an idle dash follows the updated facing direction', t => {
  const output = execute(t, {
    scenario: scenarioWith({ motes: [], shades: [] }),
    frames: [{ tick: 0, cam_yaw_deg: 90, dash: true }]
  });
  assert.ok(output.snapshots[1].player.pos[0] > 0.23);
  assert.equal(output.snapshots[1].player.pos[2], 0);
});

test('contract tuning and deposit scores only delivered motes', t => {
  assert.equal(tuning.lantern_cost, 10);
  assert.equal(tuning.pickup_radius, 1);
  assert.equal(tuning.dash_speed, 14);
  const output = execute(t, {
    scenario: scenarioWith({
      player: { carried: 10 },
      motes: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 0] }]
    }),
    frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }]
  });
  assert.deepEqual(output.events.filter(event => ['deposit', 'lantern_lit'].includes(event.name))
    .map(event => [event.name, event.data]), [
      ['deposit', { lantern_id: 'L1', amount: 10, deposited: 10 }],
      ['lantern_lit', { lantern_id: 'L1' }]
    ]);
  assert.equal(output.snapshots[1].score, 10 * tuning.score.per_mote + tuning.score.per_lantern);
  assert.equal(output.snapshots[1].player.carried, 0);
});

test('pulse uses its 3D radius, 3-mote cost and staged 4m push', t => {
  const output = execute(t, {
    scenario: scenarioWith({
      player: { carried: 3 },
      motes: [],
      shades: [{ id: 'near', pos: [0, 0, 4] }, { id: 'far', pos: [0, 0, 5] }]
    }),
    frames: [{ tick: 0, pulse: true }]
  });
  const shades = Object.fromEntries(output.snapshots[1].shades.map(shade => [shade.id, shade]));
  assert.deepEqual(output.events.find(event => event.name === 'pulse'),
    { type: 'event', tick: 1, name: 'pulse', data: { stunned_ids: ['near'] } });
  assert.equal(shades.near.state, 'stunned');
  assert.ok(shades.near.pos[2] > 4);
  assert.equal(shades.far.state, 'chase');
  assert.equal(output.snapshots[1].player.carried, 0);
});

test('lit lantern safe radius uses horizontal distance regardless of height', t => {
  const output = execute(t, {
    night: 3,
    scenario: scenarioWith({
      player: {}, motes: [], drifters: [], charms: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
      shades: [{ id: 'S1', pos: [0, 8, 0], state: 'spawning', state_ticks_left: 18 }]
    }),
    ticks: 1
  });
  const [x, , z] = output.snapshots[1].shades[0].pos;
  assert.ok(Math.hypot(x, z) > 6 && Math.hypot(x, z) <= 6.002);
});

test('shade hit drops half the carried motes and activates recoil/invulnerability', t => {
  const output = execute(t, {
    scenario: scenarioWith({
      player: { carried: 6 },
      motes: [],
      shades: [{ id: 'S1', pos: [0, 0, 0], state: 'chase' }]
    }), ticks: 3
  });
  assert.deepEqual(output.events.find(event => event.name === 'player_hit').data,
    { by: 'shade', flames: 2, dropped: 3 });
  assert.equal(output.snapshots[1].player.carried, 3);
  assert.equal(output.snapshots[1].player.invuln, 1.5);
  assert.deepEqual(output.snapshots[1].motes.map(mote => [mote.kind, mote.ttl_s]),
    [['dropped', 8], ['dropped', 8], ['dropped', 8]]);
  assert.equal(output.snapshots[1].shades[0].state, 'recoil');
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
    { scenario: { lanterns: [{ id: 'L6' }] } },
    { frames: [{ tick: 0, dash: 'yes' }] }
  ]) {
    const { result } = execute(t, options);
    assert.equal(result.status, 2);
    assert.notEqual(result.stderr.trim(), '');
  }
});

test('pause advances wall tick only and resumes deterministically', t => {
  const output = execute(t, {
    scenario: scenarioWith({ motes: [], shades: [] }),
    frames: [
      { tick: 0, pause: true }, { tick: 1, pause: false }, { tick: 2, pause: true },
      { tick: 3, pause: false }, { tick: 4, move: [0, 1] }
    ],
    ticks: 6
  });
  assert.deepEqual(output.events.filter(event => ['paused', 'resumed'].includes(event.name))
    .map(event => [event.name, event.tick]), [['paused', 1], ['resumed', 3]]);
  assert.equal(output.snapshots[1].state, 'paused');
  assert.equal(output.snapshots[1].tick, 1);
  assert.equal(output.snapshots[1].sim_tick, 0);
  assert.equal(output.snapshots[1].time_left_s, 300);
  assert.equal(output.snapshots[3].sim_tick, 0);
  assert.equal(output.snapshots[4].sim_tick, 1);
  assert.equal(output.snapshots[4].time_left_s, 300 - 1 / 60);
});

test('wind charm refresh fields and boosted running/dash state', t => {
  const output = execute(t, {
    night: 2,
    scenario: scenarioWith({
      player: {}, motes: [], shades: [], drifters: [],
      charms: [{ id: 'C1', pos: [0, 0, 0] }]
    }),
    frames: [{ tick: 0, move: [0, 1] }, { tick: 1, dash: true, move: [0, 1] }]
  });
  assert.deepEqual(output.events.find(event => event.name === 'charm_picked').data,
    { charm_id: 'C1', charm_ticks: 600 });
  assert.equal(output.snapshots[1].player.charm_s, 10);
  assert.equal(output.snapshots[2].player.vel[2], 14);
  assert.equal(output.snapshots[2].player.dash_cd_s, 0);
});

test('drifters steal only while chasing and a pulse returns stolen motes', t => {
  const steal = execute(t, {
    night: 2,
    scenario: scenarioWith({
      player: { carried: 5 }, motes: [], shades: [], charms: [],
      drifters: [{ id: 'D1', pos: [1, 0, 0], state: 'chase' }]
    }),
    ticks: 1
  });
  assert.deepEqual(steal.events.find(event => event.name === 'drifter_steal').data,
    { drifter_id: 'D1', amount: 3, carried: 2 });
  assert.equal(steal.snapshots[1].drifters[0].state, 'flee');
  assert.equal(steal.snapshots[1].drifters[0].stolen, 3);

  const drop = execute(t, {
    night: 2,
    scenario: scenarioWith({
      player: { carried: 3 }, motes: [], shades: [], charms: [],
      drifters: [{ id: 'D1', pos: [1, 0, 0], state: 'flee', stolen: 2, state_ticks_left: 200 }]
    }),
    frames: [{ tick: 0, pulse: true }]
  });
  assert.deepEqual(drop.events.find(event => event.name === 'drifter_drop').data,
    { drifter_id: 'D1', amount: 2 });
  assert.equal(drop.snapshots[1].motes.length, 2);
  assert.ok(drop.snapshots[1].motes.every(mote => mote.kind === 'dropped'));
});

test('night maps, scheduled spawning, launch pads, and fall recovery', t => {
  const night1 = execute(t, {
    scenario: scenarioWith({ motes: [], random_shades: true }), ticks: 300, snapshotEvery: 30
  });
  assert.equal(night1.events.filter(event => event.name === 'shade_spawned' && event.tick === 300).length, 2);
  for (const [pos, xSign, zSign] of [
    [[20, 0, 18], 1, -1], [[50, 0, -18], -1, 1]
  ]) {
    const night2 = execute(t, {
      night: 2,
      scenario: scenarioWith({
        player: { pos }, motes: [], shades: [], drifters: [], charms: []
      }),
      ticks: 1
    });
    assert.equal(night2.snapshots[0].lanterns.length, 6);
    assert.equal(night2.snapshots[1].player.grounded, false);
    const launchVelocity = night2.snapshots[1].player.vel;
    assert.equal(Math.sign(launchVelocity[0]), xSign);
    assert.equal(Math.sign(launchVelocity[2]), zSign);
    assert.ok(Math.abs(Math.hypot(launchVelocity[0], launchVelocity[2]) - 24) < 0.001);
    assert.equal(launchVelocity[1], 14);
  }

  const fall = execute(t, {
    scenario: scenarioWith({
      player: { pos: [39.9, 0, 0], carried: 4, flames: 2 }, motes: [], shades: []
    }),
    frames: [{ tick: 0, move: [1, 0] }, { tick: 120, move: [0, 0] }],
    ticks: 140
  });
  assert.deepEqual(fall.events.find(event => event.name === 'player_hit').data,
    { by: 'fall', flames: 1, dropped: 0, lost: 4 });
  assert.deepEqual(fall.snapshots.at(-1).player.pos, [0, 0, 0]);
  assert.equal(fall.snapshots.at(-1).player.carried, 0);
});

test('Night 3 has seven lamps and deterministic 30-second wind', t => {
  const scenario = scenarioWith({
    motes: [], shades: [], drifters: [], charms: [], wind_enabled: true
  });
  const first = execute(t, { night: 3, scenario, ticks: 1800, snapshotEvery: 300 });
  const second = execute(t, { night: 3, scenario, ticks: 1800, snapshotEvery: 300 });
  assert.equal(first.snapshots[0].lanterns.length, 7);
  const windy = first.snapshots.find(snapshot => snapshot.sim_tick === 1800);
  assert.equal(windy.wind.active, true);
  assert.ok(windy.wind.dir_deg >= 0 && windy.wind.dir_deg < 360);
  assert.equal(first.raw, second.raw);
});

test('Night 3 ramp supports a slightly off-center climb onto the middle tier', t => {
  const angle = 34 * Math.PI / 180;
  const start = [29.5 * Math.cos(angle), 0, 29.5 * Math.sin(angle)];
  const climb = execute(t, {
    night: 3,
    scenario: scenarioWith({
      player: { pos: start }, motes: [], shades: [], drifters: [], charms: [], wind_enabled: false
    }),
    frames: [{ tick: 0, move: [-Math.cos(angle), -Math.sin(angle)] }],
    ticks: 60,
    snapshotEvery: 60
  });
  const player = climb.snapshots.at(-1).player;
  assert.ok(player.grounded);
  assert.ok(Math.hypot(player.pos[0], player.pos[2]) < 24);
  assert.ok(player.pos[1] >= 2.99, JSON.stringify(player));
});

test('motes start at twenty and regenerate at tick 240', t => {
  const output = execute(t, { ticks: 240, snapshotEvery: 240 });
  assert.equal(output.snapshots[0].motes.length, 20);
  assert.equal(output.snapshots.at(-1).sim_tick, 240);
  assert.equal(output.snapshots.at(-1).motes.length, 21);
});

test('complete headless nights stay below the 30-second contract limit', t => {
  for (const [night, ticks] of [[1, 18000], [2, 19800], [3, 21600]]) {
    const start = Date.now();
    const output = execute(t, {
      night,
      scenario: scenarioWith({ motes: [], shades: [] }),
      ticks: 21600,
      snapshotEvery: 60
    });
    assert.equal(output.result.status, 0, output.result.stderr);
    assert.equal(output.end.state, 'lost');
    assert.equal(output.end.ticks, ticks);
    assert.ok(Date.now() - start < 30000, `Night ${night} exceeded 30 seconds`);
  }
});
