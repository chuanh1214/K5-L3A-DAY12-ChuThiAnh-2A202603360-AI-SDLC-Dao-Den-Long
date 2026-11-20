import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createGame, idle, snapshot, step } from '../src/game.mjs';

class DataError extends Error {}
const scenarioFields = [
  'player', 'random_motes', 'random_shades', 'random_drifters', 'wind_enabled',
  'motes', 'shades', 'drifters', 'charms', 'lanterns', 'time_left_s'
];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const number = value => Number.isFinite(value);
const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(number);
const boolean = value => typeof value === 'boolean';

function check(condition, message) {
  if (!condition) throw new DataError(message);
}

function shape(value, keys, label) {
  check(isObject(value) && Object.keys(value).every(key => keys.includes(key)), `${label}: invalid object or field`);
}

function optional(object, key, predicate) {
  if (key in object) check(predicate(object[key]), `${key}: invalid value`);
}

function list(value, validate, label) {
  check(Array.isArray(value), `${label}: expected an array`);
  value.forEach(validate);
}

function unique(items, label) {
  const ids = items.map(item => item.id).filter(id => id !== undefined);
  check(new Set(ids).size === ids.length, `${label}: duplicate id`);
}

function validateScenario(scenario, tuning, night) {
  shape(scenario, scenarioFields, 'scenario');
  for (const key of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) {
    optional(scenario, key, boolean);
  }
  optional(scenario, 'time_left_s', value => number(value) && value >= 0);
  if ('player' in scenario) {
    shape(scenario.player, [
      'pos', 'carried', 'flames', 'invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks'
    ], 'player');
    optional(scenario.player, 'pos', value => vector(value, 3));
    optional(scenario.player, 'carried', value => integer(value) && value <= tuning.carry_capacity);
    optional(scenario.player, 'flames', integer);
    for (const key of ['invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks']) {
      optional(scenario.player, key, integer);
    }
  }
  if ('motes' in scenario) {
    list(scenario.motes, pos => check(vector(pos, 3), 'motes: invalid position'), 'motes');
  }
  if ('shades' in scenario) {
    list(scenario.shades, shade => {
      shape(shade, ['id', 'pos', 'state', 'state_ticks_left'], 'shade');
      optional(shade, 'id', id => typeof id === 'string' && id.length > 0);
      check(vector(shade.pos, 3), 'shade: missing or invalid pos');
      optional(shade, 'state', value => ['spawning', 'wander', 'chase', 'recoil', 'stunned'].includes(value));
      optional(shade, 'state_ticks_left', integer);
    }, 'shades');
    unique(scenario.shades, 'shades');
  }
  if ('drifters' in scenario) {
    list(scenario.drifters, drifter => {
      shape(drifter, ['id', 'pos', 'state', 'state_ticks_left', 'stolen'], 'drifter');
      optional(drifter, 'id', id => typeof id === 'string' && id.length > 0);
      check(vector(drifter.pos, 3), 'drifter: missing or invalid pos');
      optional(drifter, 'state', value => ['idle', 'chase', 'flee', 'removed'].includes(value));
      optional(drifter, 'state_ticks_left', integer);
      optional(drifter, 'stolen', integer);
    }, 'drifters');
    unique(scenario.drifters, 'drifters');
  }
  if ('charms' in scenario) {
    list(scenario.charms, charm => {
      shape(charm, ['id', 'pos', 'available', 'respawn_ticks'], 'charm');
      check(typeof charm.id === 'string' && charm.id.length > 0, 'charm: missing id');
      check(vector(charm.pos, 3), 'charm: missing or invalid pos');
      optional(charm, 'available', boolean);
      optional(charm, 'respawn_ticks', integer);
    }, 'charms');
    unique(scenario.charms, 'charms');
  }
  if ('lanterns' in scenario) {
    list(scenario.lanterns, lamp => {
      shape(lamp, ['id', 'pos', 'deposited', 'lit'], 'lantern');
      check(/^L[1-7]$/.test(lamp.id) && Number(lamp.id.slice(1)) <= [5, 6, 7][night - 1],
        'lantern: unknown id for this night');
      optional(lamp, 'pos', value => vector(value, 3));
      optional(lamp, 'deposited', value => integer(value) && value <= tuning.lantern_cost);
      optional(lamp, 'lit', boolean);
    }, 'lanterns');
    unique(scenario.lanterns, 'lanterns');
  }
  return scenario;
}

function validateInputs(value) {
  shape(value, ['frames'], 'inputs');
  let previous = -1;
  list(value.frames, frame => {
    shape(frame, ['tick', 'move', 'cam_yaw_deg', 'jump', 'dash', 'interact', 'pulse', 'pause'], 'frame');
    check(integer(frame.tick) && frame.tick > previous, 'frames: ticks must be strictly increasing');
    previous = frame.tick;
    optional(frame, 'move', move => vector(move, 2) && move.every(axis => Math.abs(axis) <= 1));
    optional(frame, 'cam_yaw_deg', number);
    for (const key of ['jump', 'dash', 'interact', 'pulse', 'pause']) optional(frame, key, boolean);
  }, 'frames');
  return value.frames;
}

function readData(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new DataError(`${path}: ${error.message}`);
  }
}

function run() {
  const { values } = parseArgs({
    options: Object.fromEntries(['seed', 'night', 'scenario', 'inputs', 'ticks', 'out', 'snapshot-every']
      .map(key => [key, { type: 'string' }]))
  });
  const seed = Number(values.seed);
  const ticks = Number(values.ticks);
  const interval = Number(values['snapshot-every'] ?? '10');
  const night = Number(values.night);
  if (!/^[+-]?\d+$/.test(values.seed) || !Number.isSafeInteger(seed) || !['1', '2', '3'].includes(values.night)
      || !/^\d+$/.test(values.ticks) || !integer(ticks) || !values.out
      || !/^\d+$/.test(values['snapshot-every'] ?? '10') || !integer(interval) || interval < 1) {
    throw new Error('Usage: --seed INT --night 1|2|3 --ticks INT --out FILE [--scenario FILE] [--inputs FILE] [--snapshot-every INT]');
  }
  const { tuning } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
  const scenario = values.scenario ? validateScenario(readData(values.scenario), tuning, night) : {};
  const frames = values.inputs ? validateInputs(readData(values.inputs)) : [];
  const game = createGame(tuning, seed, night, scenario);
  const lines = [JSON.stringify(snapshot(game)), ...game.startupEvents.map(event => JSON.stringify(event))];
  let input = { ...idle };
  let cursor = 0;
  while (game.tick < ticks && game.state !== 'won' && game.state !== 'lost') {
    if (frames[cursor]?.tick === game.tick) {
      input = { ...input, ...frames[cursor] };
      cursor += 1;
    }
    for (const event of step(game, input)) lines.push(JSON.stringify(event));
    if (game.tick % interval === 0) lines.push(JSON.stringify(snapshot(game)));
  }
  lines.push(JSON.stringify({ type: 'end', ticks: game.tick, state: game.state, score: game.score }));
  writeFileSync(values.out, lines.join('\n') + '\n', 'utf8');
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exitCode = error instanceof DataError ? 2 : 1;
}
