import assert from 'node:assert/strict';

const ticksPerSecond = 60;
const steps = 120;
const state = { tick: 0, distance: 0 };

for (let step = 0; step < steps; step += 1) {
  state.tick += 1;
  state.distance += 3 / ticksPerSecond;
}

assert.equal(state.tick, steps);
assert.ok(Math.abs(state.distance - 6) < 1e-9);
console.log(JSON.stringify({ check: 'hello-headless', ticks: state.tick, seconds: state.tick / ticksPerSecond, distance_m: Number(state.distance.toFixed(3)) }));
