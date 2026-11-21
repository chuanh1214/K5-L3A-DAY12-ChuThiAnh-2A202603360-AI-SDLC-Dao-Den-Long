import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { createGame, step, HZ } from '../src/game.mjs';

const { values } = parseArgs({ options: {
  seed: { type: 'string' }, nights: { type: 'string' }, out: { type: 'string' }
} });
const seed = Number(values.seed);
const nights = Number(values.nights);
if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(nights) || nights < 1 || !values.out) {
  throw new Error('Usage: --seed 7 --nights 10 --out soak.json');
}
const { tuning } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
const mb = bytes => bytes / 1024 ** 2;
function measureMemory() {
  globalThis.gc?.();
  return mb(process.memoryUsage.rss());
}
function runNight(index, start) {
  const night = index % 3 + 1;
  const game = createGame(tuning, seed + index, night);
  if (index === 0) start();
  let state = (seed + index) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  let move;
  const limit = tuning[`night${night}_duration_s`] * HZ;
  for (let tick = 0; tick < limit && game.state === 'playing'; tick += 1) {
    if (tick % 30 === 0) {
      const angle = random() * 2 * Math.PI;
      move = [Math.cos(angle), Math.sin(angle)];
    }
    step(game, {
      move, jump: random() < 0.05, dash: random() < 0.03,
      pulse: random() < 0.02, interact: random() < 0.1
    });
  }
  return game.state;
}
const start = performance.now();
let mem_start_mb;
let crashes = 0;
const results = [];
for (let index = 0; index < nights; index += 1) {
  try {
    results.push(runNight(index, () => { mem_start_mb = measureMemory(); }));
  } catch (error) {
    crashes += 1;
    results.push('crashed');
    console.error(error);
  }
}
const mem_end_mb = measureMemory();
const report = { nights, crashes, results, mem_start_mb: mem_start_mb ?? null, mem_end_mb,
  duration_s: (performance.now() - start) / 1000 };
writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
if (crashes) process.exitCode = 1;
