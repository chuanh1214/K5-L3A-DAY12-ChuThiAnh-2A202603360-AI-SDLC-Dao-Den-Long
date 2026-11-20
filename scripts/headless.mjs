import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createGame, idle, snapshot, step } from '../src/game.mjs';

class DataError extends Error {}
const fields = ['player', 'random_motes', 'random_shades', 'motes', 'shades', 'lanterns', 'time_left_s'];
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

function validateScenario(scenario, tuning) {
  shape(scenario, fields, 'scenario');
  optional(scenario, 'random_motes', boolean);
  optional(scenario, 'random_shades', boolean);
  optional(scenario, 'time_left_s', value => number(value) && value >= 0);
  if ('player' in scenario) {
    shape(scenario.player, ['pos', 'carried', 'flames'], 'player');
    optional(scenario.player, 'pos', value => vector(value, 3));
    optional(scenario.player, 'carried', value => integer(value) && value <= tuning.carry_capacity);
    optional(scenario.player, 'flames', integer);
  }
  if ('motes' in scenario) list(scenario.motes, pos => check(vector(pos, 3), 'motes: invalid position'), 'motes');
  if ('shades' in scenario) {
    list(scenario.shades, shade => {
      shape(shade, ['id', 'pos'], 'shade');
      optional(shade, 'id', id => typeof id === 'string' && id.length > 0);
      check(vector(shade.pos, 3), 'shade: missing or invalid pos');
    }, 'shades');
    unique(scenario.shades, 'shades');
  }
  if ('lanterns' in scenario) {
    list(scenario.lanterns, lamp => {
      shape(lamp, ['id', 'pos', 'deposited', 'lit'], 'lantern');
      check(['L1', 'L2', 'L3', 'L4', 'L5'].includes(lamp.id), 'lantern: unknown id');
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
    shape(frame, ['tick', 'move', 'cam_yaw_deg', 'jump', 'interact', 'pulse'], 'frame');
    check(integer(frame.tick) && frame.tick > previous, 'frames: ticks must be strictly increasing');
    previous = frame.tick;
    optional(frame, 'move', move => vector(move, 2) && move.every(axis => Math.abs(axis) <= 1));
    optional(frame, 'cam_yaw_deg', number);
    for (const key of ['jump', 'interact', 'pulse']) optional(frame, key, boolean);
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
  if (!/^[+-]?\d+$/.test(values.seed) || !Number.isSafeInteger(seed) || values.night !== '1'
      || !/^\d+$/.test(values.ticks) || !integer(ticks) || !values.out
      || !/^\d+$/.test(values['snapshot-every'] ?? '10') || !integer(interval) || interval < 1) {
    throw new Error('Usage: --seed INT --night 1 --ticks INT --out FILE [--scenario FILE] [--inputs FILE] [--snapshot-every INT]');
  }
  const { tuning } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
  const scenario = values.scenario ? validateScenario(readData(values.scenario), tuning) : {};
  const frames = values.inputs ? validateInputs(readData(values.inputs)) : [];
  const game = createGame(tuning, seed, scenario);
  const lines = [JSON.stringify(snapshot(game))];
  const emit = record => lines.push(JSON.stringify(record));
  let input = idle;
  let cursor = 0;
  while (game.tick < ticks && game.state === 'playing') {
    if (frames[cursor]?.tick === game.tick) {
      input = { ...input, ...frames[cursor] };
      cursor += 1;
    }
    for (const event of step(game, input)) emit(event);
    if (game.tick % interval === 0) emit(snapshot(game));
  }
  emit({ type: 'end', ticks: game.tick, state: game.state, score: game.score });
  writeFileSync(values.out, lines.join('\n') + '\n', 'utf8');
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exitCode = error instanceof DataError ? 2 : 1;
}
