import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createBenchmark, stepBenchmark } from '../src/game.mjs';

const cli = fileURLToPath(new URL('../scripts/headless.mjs', import.meta.url));
const { contract_version, tuning } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
const emptyIsland = { random_motes: false, random_shades: false, random_drifters: false };
const scenarioWith = options => ({ ...emptyIsland, ...options });

test('benchmark keeps the standard entity counts and fuel while wander advances', () => {
  const game = createBenchmark(tuning, 42);
  assert.equal(game.shades.length, 200);
  assert.equal(game.motes.length, 100);
  assert.deepEqual(game.lanterns.filter(lamp => lamp.lit).map(lamp => lamp.id), ['L1', 'L2', 'L3']);
  const before = game.shades.map(shade => [...shade.pos]);
  const fuel = game.lanterns.map(lamp => lamp.fuelUnits);
  for (let tick = 0; tick < 300; tick += 1) stepBenchmark(game);
  assert.deepEqual(game.player.pos, [0, 0, 0]);
  assert.equal(game.player.flames, 3);
  assert.equal(game.motes.length, 100);
  assert.equal(game.state, 'playing');
  assert.deepEqual(game.lanterns.map(lamp => lamp.fuelUnits), fuel);
  assert.ok(game.shades.every(shade => shade.state === 'wander'));
  assert.notDeepEqual(game.shades.map(shade => shade.pos), before);
});

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
  assert.equal(contract_version, '1.3');
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
      ['lantern_lit', { lantern_id: 'L1', relight: false }]
    ]);
  assert.equal(output.snapshots[1].score, 10 * tuning.score.per_mote + tuning.score.per_lantern);
  assert.equal(output.snapshots[1].player.carried, 0);
  assert.equal(output.snapshots[1].player.capacity, 12);
  assert.equal(output.snapshots[1].lanterns[0].fuel, 100);
});

test('fuel expires before interaction, then relighting costs five and raises capacity up to twenty', t => {
  const output = execute(t, {
    scenario: scenarioWith({
      player: { carried: 19, successful_lights: 5 },
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 1 / 60 }],
      motes: [[0, 0, 0], [0, 0, 0]]
    }),
    frames: [{ tick: 0, interact: true }],
    ticks: 1
  });
  assert.equal(output.snapshots[0].player.capacity, 20);
  assert.equal(output.snapshots[1].player.capacity, 20);
  assert.equal(output.snapshots[1].player.carried, 15);
  assert.equal(output.snapshots[1].motes_active, 1);
  assert.deepEqual(output.events.filter(event => event.name.startsWith('lantern_')).map(event => [event.name, event.data]), [
    ['lantern_out', { lantern_id: 'L1' }], ['lantern_lit', { lantern_id: 'L1', relight: true }]
  ]);
  assert.equal(output.snapshots[1].lanterns[0].relit_count, 1);
  assert.equal(output.snapshots[1].score, 65);
});

test('refueling rounds required motes up, caps fuel and breaks ties by lantern ID', t => {
  const output = execute(t, {
    scenario: scenarioWith({
      player: { carried: 10 },
      lanterns: [
        { id: 'L2', pos: [0, 0, 1], fuel: 90, lit: true },
        { id: 'L1', pos: [0, 0, -1], fuel: 90, lit: true }
      ]
    }),
    frames: [{ tick: 0, interact: true }],
    ticks: 2
  });
  assert.deepEqual(output.events.find(event => event.name === 'refuel').data,
    { lantern_id: 'L1', amount: 2, fuel: 100 });
  assert.equal(output.snapshots[1].player.carried, 8);
  assert.equal(output.snapshots[1].score, 10);
});

test('two draining shades cost eleven fuel per second and report each drain', t => {
  const output = execute(t, {
    scenario: scenarioWith({
      player: { pos: [0, 0, -20] },
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 29 }],
      shades: ['S1', 'S2'].map(id => ({ id, pos: [1, 0, 0], state: 'drain', target_lantern_id: 'L1' }))
    }),
    ticks: 60
  });
  assert.equal(output.snapshots[60].lanterns[0].fuel, 18);
  assert.deepEqual(output.events.filter(event => event.name === 'fuel_drain').map(event => [event.tick, event.data.shade_id, event.data.fuel]),
    [[60, 'S1', 18], [60, 'S2', 18]]);
});

test('wander selects a weak lantern, and nearby players interrupt drain', t => {
  const scenario = scenarioWith({
    player: { pos: [0, 0, -20] },
    lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 29 }],
    shades: [{ id: 'S1', pos: [2.1, 0, 0] }]
  });
  const output = execute(t, { scenario, ticks: 3 });
  assert.equal(output.snapshots[2].shades[0].state, 'drain');
  const chase = execute(t, {
    scenario: { ...scenario, player: { pos: [0, 0, -4] },
      shades: [{ pos: [1, 0, 0], state: 'drain', target_lantern_id: 'L1' }] }, ticks: 1
  });
  assert.equal(chase.snapshots[1].shades[0].state, 'chase');
});

test('pulse awards 15 for interrupting drain and refuel restores safety at exactly 30', t => {
  const scenario = scenarioWith({
    player: { carried: 3 },
    lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 20.1 }],
    shades: [{ id: 'S1', pos: [1, 0, 0], state: 'drain', target_lantern_id: 'L1' }]
  });
  const pulse = execute(t, { scenario, frames: [{ tick: 0, pulse: true }], ticks: 1 });
  assert.equal(pulse.snapshots[1].score, 15);
  assert.equal(pulse.snapshots[1].shades[0].state, 'stunned');
  const refuel = execute(t, { scenario: { ...scenario, player: { carried: 1 } },
    frames: [{ tick: 0, interact: true }], ticks: 1 });
  assert.equal(refuel.snapshots[1].lanterns[0].fuel, 30);
  assert.equal(refuel.snapshots[1].shades[0].state, 'wander');
  assert.ok(refuel.snapshots[1].shades[0].pos[0] > 6);
  assert.equal(refuel.snapshots[1].player.flames, 3);
});

test('dawn uses final fuel, never ends early and prioritizes no flames', t => {
  const lamps = Array.from({ length: 5 }, (_, index) => ({ id: `L${index + 1}`, lit: true }));
  const early = execute(t, { scenario: scenarioWith({ lanterns: lamps }), ticks: 1 });
  assert.equal(early.end.state, 'playing');
  const final = { time_left_s: 1 / 60, lanterns: lamps.slice(0, 3) };
  const win = execute(t, { scenario: scenarioWith(final), ticks: 1 });
  assert.deepEqual(win.events.at(-1).data, { result: 'won', reason: 'dawn_survived' });
  assert.equal(win.end.score, 597);
  const out = execute(t, { scenario: scenarioWith({ ...final, lanterns: [
    ...final.lanterns.slice(0, 2), { id: 'L3', lit: true, fuel: 1 / 60 }
  ] }), ticks: 1 });
  assert.deepEqual(out.events.map(event => event.name), ['night_start', 'lantern_out', 'game_over']);
  assert.equal(out.events.at(-1).data.reason, 'dawn');
  const hit = execute(t, { scenario: scenarioWith({ ...final, player: { flames: 1 },
    shades: [{ pos: [0, 0, 0] }] }), ticks: 1 });
  assert.equal(hit.events.at(-1).data.reason, 'no_flames');
  const lastLight = execute(t, { scenario: scenarioWith({ ...final, player: { carried: 10 }, lanterns: [
    ...final.lanterns.slice(0, 2), { id: 'L3', pos: [0, 0, 0] }
  ] }), frames: [{ tick: 0, interact: true }], ticks: 1 });
  assert.equal(lastLight.events.at(-1).data.reason, 'dawn_survived');
  for (const [night, required] of [[2, 4], [3, 5]]) {
    const nearDawn = lit => scenarioWith({ time_left_s: 1 / 60, lanterns: lamps.slice(0, lit) });
    assert.equal(execute(t, { night, scenario: nearDawn(required - 1), ticks: 1 }).end.state, 'lost');
    assert.equal(execute(t, { night, scenario: nearDawn(required), ticks: 1 }).end.state, 'won');
  }
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
    scenario: scenarioWith({ motes: [], shades: [], lanterns: [{ id: 'L1', lit: true, fuel: 50 }] }),
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
  assert.equal(output.snapshots[1].time_left_s, tuning.night1_duration_s);
  assert.equal(output.snapshots[3].sim_tick, 0);
  assert.equal(output.snapshots[4].sim_tick, 1);
  assert.equal(output.snapshots[4].time_left_s, tuning.night1_duration_s - 1 / 60);
  assert.equal(output.snapshots[3].lanterns[0].fuel, 50);
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
  const angle = 32 * Math.PI / 180;
  const start = [30.5 * Math.cos(angle), 0, 30.5 * Math.sin(angle)];
  const climb = execute(t, {
    night: 3,
    scenario: scenarioWith({
      player: { pos: start }, motes: [], shades: [], drifters: [], charms: [], wind_enabled: false
    }),
    frames: [{ tick: 0, move: [-Math.cos(angle), -Math.sin(angle)] }],
    ticks: 70,
    snapshotEvery: 70
  });
  const player = climb.snapshots.at(-1).player;
  assert.ok(player.grounded);
  assert.ok(Math.hypot(player.pos[0], player.pos[2]) < 24);
  assert.ok(player.pos[1] >= 2.99, JSON.stringify(player));
});

test('Night 3 steps onto the terrace when the final stride clears the ramp footprint', t => {
  const output = execute(t, {
    night: 3,
    scenario: scenarioWith({ player: { pos: [26.067, 0, 15.1] }, wind_enabled: false }),
    frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 240 }],
    ticks: 70
  });
  const player = output.snapshots.at(-1).player;
  assert.equal(player.pos[1], 3);
  assert.ok(player.grounded);
});

test('Night 3 walls block entry from below but allow stepping down', t => {
  for (const { pos, move, dash = false } of [
    { pos: [0, 0, 25], move: [0, -1], dash: true },
    { pos: [0, 0, 9], move: [0, -1] },
    { pos: [27 * Math.sqrt(3) / 2 - 1, 0, 13.5 + Math.sqrt(3)], move: [0.5, -Math.sqrt(3) / 2] },
    { pos: [0, 6, 3], move: [0, -1] }
  ]) {
    const result = execute(t, {
      night: 3,
      scenario: scenarioWith({ player: { pos }, motes: [], shades: [], drifters: [], wind_enabled: false }),
      frames: [{ tick: 0, move, dash }],
      ticks: 45,
      snapshotEvery: 45
    });
    const end = result.snapshots.at(-1).player.pos;
    assert.equal(end[1], pos[1]);
    assert.ok(Math.hypot(end[0] - pos[0], end[2] - pos[2]) <= 0.34, JSON.stringify(end));
  }
  const drop = execute(t, {
    night: 3,
    scenario: scenarioWith({ player: { pos: [0, 3, 23.5] }, motes: [], shades: [], wind_enabled: false }),
    frames: [{ tick: 0, move: [0, 1] }],
    ticks: 45,
    snapshotEvery: 45
  });
  assert.equal(drop.snapshots.at(-1).player.pos[1], 0);
});

test('Night 3 can leave the ramp side and move freely after landing', t => {
  const cos = Math.sqrt(3) / 2;
  const sin = 0.5;
  const output = execute(t, {
    night: 3,
    scenario: scenarioWith({
      player: { pos: [27 * cos - 1.45 * sin, 1.5, 27 * sin + 1.45 * cos] },
      wind_enabled: false
    }),
    frames: [{ tick: 0, move: [-sin, cos] }, { tick: 1, move: [0, 0] },
      { tick: 35, move: [-sin, cos] }],
    ticks: 65
  });
  const landed = output.snapshots[35].player;
  const end = output.snapshots.at(-1).player;
  assert.ok(landed.grounded);
  assert.equal(end.pos[1], 0);
  assert.ok(end.pos[2] - landed.pos[2] > 2.5);
});

test('Night 3 keeps tangential movement when wind pushes against the terrace', t => {
  const output = execute(t, {
    night: 3,
    scenario: scenarioWith({ player: { pos: [-24.7, 0, 0.2] }, wind_enabled: true }),
    frames: [{ tick: 0, move: [0, 1] }],
    ticks: 35
  });
  const end = output.snapshots.at(-1);
  assert.equal(end.wind.active, true);
  assert.equal(end.player.pos[1], 0);
  assert.ok(end.player.pos[2] > 3.6);
  assert.ok(Math.hypot(end.player.pos[0], end.player.pos[2]) >= 24.67);
});

test('Night 3 can follow the terrace wall within one metre without clipping it', t => {
  const output = execute(t, {
    night: 3,
    scenario: scenarioWith({ player: { pos: [18, 0, -0.7] }, wind_enabled: false }),
    frames: [{ tick: 0, move: [-1, 1] }],
    ticks: 40
  });
  const { pos: [x, y, z] } = output.snapshots.at(-1).player;
  assert.ok(x < 15.5);
  assert.equal(y, 0);
  assert.ok(z >= -0.8 && z <= -0.67);
});

test('Night 3 launch pad reaches the bell platform with and without an air dash', t => {
  for (const frames of [[], [{ tick: 12, move: [0, -1], dash: true }]]) {
    const result = execute(t, {
      night: 3,
      scenario: scenarioWith({
        player: { pos: [0, 3, 13] }, motes: [], shades: [], drifters: [], wind_enabled: false
      }),
      frames,
      ticks: 90,
      snapshotEvery: 1
    });
    assert.deepEqual(result.snapshots[1].player.vel, [0, 12, -8]);
    assert.ok(result.snapshots.some(({ player }) => player.grounded && player.pos[1] === 6));
  }
});

test('Night 3 default spawn stays on the ground and can walk out from below the bell platform', t => {
  const result = execute(t, {
    night: 3,
    scenario: scenarioWith({ motes: [], shades: [], drifters: [], charms: [], wind_enabled: false }),
    frames: [{ tick: 90, move: [0, -1] }],
    ticks: 190,
    snapshotEvery: 10
  });
  assert.deepEqual(result.snapshots.find(({ tick }) => tick === 90).player.pos, [0, 0, 0]);
  assert.deepEqual(result.snapshots.at(-1).player.pos, [0, 0, -10]);
  assert.equal(result.events.some(event => event.name === 'player_hit'), false);
});

test('motes start at twenty and regenerate at tick 240', t => {
  const output = execute(t, { ticks: 240, snapshotEvery: 240 });
  assert.equal(output.snapshots[0].motes.length, 20);
  assert.equal(output.snapshots.at(-1).sim_tick, 240);
  assert.equal(output.snapshots.at(-1).motes.length, 21);
});

test('complete headless nights stay below the 30-second contract limit', t => {
  for (const [night, ticks] of [[1, 14400], [2, 16200], [3, 18000]]) {
    const start = Date.now();
    const output = execute(t, {
      night,
      scenario: scenarioWith({ motes: [], shades: [] }),
      ticks: 18000,
      snapshotEvery: 60
    });
    assert.equal(output.result.status, 0, output.result.stderr);
    assert.equal(output.end.state, 'lost');
    assert.equal(output.end.ticks, ticks);
    assert.ok(Date.now() - start < 30000, `Night ${night} exceeded 30 seconds`);
  }
});
