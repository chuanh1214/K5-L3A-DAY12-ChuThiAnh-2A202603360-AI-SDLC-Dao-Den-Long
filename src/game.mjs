export const HZ = 60;
export const RADIUS = 40;
export const idle = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false };
const lanternPositions = [[0, 0, 25], [24, 0, 8], [15, 0, -20], [-15, 0, -20], [-24, 0, 8]];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const within = (a, b, radius) => distance(a, b) <= radius;
const seconds = ticks => ticks / HZ;
const position = values => values.map(value => Number(value.toFixed(3)));

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function ring(count, radius, offset) {
  return Array.from({ length: count }, (_, i) => {
    const angle = offset + i * 2 * Math.PI / count;
    return [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
  });
}

export function createGame(tuning, seed, scenario = {}) {
  const random = randomSource(seed);
  const lanterns = lanternPositions.map((pos, i) => {
    const id = `L${i + 1}`;
    const patch = scenario.lanterns?.find(lantern => lantern.id === id);
    const deposited = patch?.deposited ?? (patch?.lit ? tuning.lantern_cost : 0);
    return { id, pos: [...(patch?.pos ?? pos)], deposited, lit: patch?.lit ?? deposited >= tuning.lantern_cost };
  });
  const game = {
    tuning, random, lanterns,
    tick: 0, state: 'playing', score: 0,
    initialTime: scenario.time_left_s ?? tuning.night1_duration_s,
    time: scenario.time_left_s ?? tuning.night1_duration_s,
    player: {
      pos: [...(scenario.player?.pos ?? [0, 0, 0])],
      carried: scenario.player?.carried ?? 0,
      flames: scenario.player?.flames ?? tuning.flames,
      vy: 0, invuln: 0, cooldown: 0
    },
    motes: [], shades: [], nextMote: 1, nextShade: 1,
    randomMotes: scenario.random_motes ?? scenario.motes === undefined,
    randomShades: scenario.random_shades ?? scenario.shades === undefined,
    previousInput: idle
  };
  const motePositions = scenario.motes ?? (game.randomMotes
    ? [...ring(8, 8, random()), ...ring(14, 17, random()), ...ring(18, 30, random())] : []);
  for (const pos of motePositions) addMote(game, pos);
  const reserved = new Set(scenario.shades?.map(shade => shade.id).filter(Boolean));
  for (const shade of scenario.shades ?? []) addShade(game, shade.pos, shade.id, reserved);
  return game;
}

function addMote(game, pos) {
  game.motes.push({ id: `M${game.nextMote++}`, pos: [...pos] });
}

function addShade(game, pos, id, reserved = new Set()) {
  if (id === undefined) {
    do {
      id = `S${game.nextShade++}`;
    } while (reserved.has(id) || game.shades.some(shade => shade.id === id));
  }
  game.shades.push({ id, pos: [...pos], state: 'chase', stun: 0 });
  return id;
}

export function nearbyLantern(game) {
  let nearest;
  let radius = game.tuning.interact_radius;
  for (const lantern of game.lanterns) {
    if (lantern.lit) continue;
    const range = distance(game.player.pos, lantern.pos);
    if (range <= radius && (!nearest || range < radius)) {
      nearest = lantern;
      radius = range;
    }
  }
  return nearest;
}

function movePlayer(game, input, pressed) {
  const { player, tuning } = game;
  const [x, z] = input.move;
  const angle = input.cam_yaw_deg * Math.PI / 180;
  const speed = tuning.player_speed / HZ / Math.max(1, Math.hypot(x, z));
  player.pos[0] += (x * Math.cos(angle) + z * Math.sin(angle)) * speed;
  player.pos[2] += (-x * Math.sin(angle) + z * Math.cos(angle)) * speed;
  const edge = distance(player.pos, [0, 0, 0]);
  if (edge > RADIUS) {
    player.pos[0] *= RADIUS / edge;
    player.pos[2] *= RADIUS / edge;
  }
  if (pressed('jump') && player.pos[1] === 0) player.vy = 7;
  player.pos[1] = Math.max(0, player.pos[1] + player.vy / HZ);
  player.vy = player.pos[1] > 0 ? player.vy - 20 / HZ : 0;
}

function moveShades(game, emit) {
  const { tuning, player, lanterns } = game;
  const safe = lanterns.filter(lantern => lantern.lit);
  const isSafe = pos => safe.some(lantern => within(pos, lantern.pos, tuning.safe_radius));
  for (const shade of game.shades) {
    shade.stun = Math.max(0, shade.stun - 1);
    if (shade.stun) continue;
    shade.state = 'chase';
    const inside = safe.find(lantern => within(shade.pos, lantern.pos, tuning.safe_radius));
    if (inside) {
      const dx = shade.pos[0] - inside.pos[0];
      const dz = shade.pos[2] - inside.pos[2];
      const length = Math.hypot(dx, dz);
      const radius = tuning.safe_radius + 0.001;
      shade.pos[0] = inside.pos[0] + (length ? dx / length : 1) * radius;
      shade.pos[2] = inside.pos[2] + (length ? dz / length : 0) * radius;
    } else {
      const range = distance(player.pos, shade.pos);
      if (range > 0) {
        const fraction = Math.min(1, tuning.shade_speed / HZ / range);
        const next = [
          shade.pos[0] + (player.pos[0] - shade.pos[0]) * fraction,
          shade.pos[1],
          shade.pos[2] + (player.pos[2] - shade.pos[2]) * fraction
        ];
        if (!isSafe(next)) shade.pos = next;
      }
    }
    if (player.flames > 0 && !player.invuln && !isSafe(player.pos) && !isSafe(shade.pos)
        && within(player.pos, shade.pos, tuning.shade_hit_radius)) {
      player.flames -= 1;
      player.invuln = Math.round(tuning.invuln_s * HZ);
      const dropped = Math.floor(player.carried * tuning.hit_drop_ratio);
      player.carried -= dropped;
      emit('player_hit', { by: 'shade', flames: player.flames, dropped });
    }
  }
}

export function step(game, input = idle) {
  if (game.state !== 'playing') return [];
  const { tuning, player } = game;
  game.tick += 1;
  game.time = Math.max(0, game.initialTime - seconds(game.tick));
  const events = [];
  const emit = (name, data) => events.push({ type: 'event', tick: game.tick, name, data });
  const pressed = key => input[key] && !game.previousInput[key];
  player.invuln = Math.max(0, player.invuln - 1);
  player.cooldown = Math.max(0, player.cooldown - 1);
  movePlayer(game, input, pressed);

  game.motes = game.motes.filter(mote => {
    if (player.carried >= tuning.carry_capacity || !within(player.pos, mote.pos, tuning.pickup_radius)) return true;
    player.carried += 1;
    game.score += tuning.score.per_mote;
    emit('mote_picked', { carried: player.carried });
    return false;
  });

  const lantern = pressed('interact') && nearbyLantern(game);
  if (lantern && player.carried > 0) {
    const amount = Math.min(player.carried, tuning.lantern_cost - lantern.deposited);
    player.carried -= amount;
    lantern.deposited += amount;
    emit('deposit', { lantern_id: lantern.id, amount, deposited: lantern.deposited });
    if (lantern.deposited === tuning.lantern_cost) {
      lantern.lit = true;
      game.score += tuning.score.per_lantern;
      emit('lantern_lit', { lantern_id: lantern.id });
    }
  }

  if (pressed('pulse') && !player.cooldown && player.carried >= tuning.pulse_cost) {
    player.carried -= tuning.pulse_cost;
    player.cooldown = Math.round(tuning.pulse_cooldown_s * HZ);
    const stunned_ids = [];
    for (const shade of game.shades) {
      const range = distance(player.pos, shade.pos);
      if (range > tuning.pulse_radius) continue;
      shade.stun = Math.round(tuning.pulse_stun_s * HZ) + 1;
      shade.state = 'stunned';
      shade.pos[0] += tuning.pulse_push_m * (range ? (shade.pos[0] - player.pos[0]) / range : 1);
      shade.pos[2] += tuning.pulse_push_m * (range ? (shade.pos[2] - player.pos[2]) / range : 0);
      stunned_ids.push(shade.id);
    }
    game.score += stunned_ids.length * tuning.score.per_stun;
    emit('pulse', { stunned_ids });
  }

  moveShades(game, emit);
  if (game.randomMotes && game.tick % (2 * HZ) === 0 && game.motes.length < 40) {
    addMote(game, ring(1, 5 + 30 * game.random(), game.random() * 2 * Math.PI)[0]);
  }
  if (game.randomShades && game.tick % (6 * HZ) === 0 && game.shades.length < 6) {
    const points = ring(12, 36, game.random() * 2 * Math.PI);
    const spawn = points.find(pos => !within(pos, player.pos, 14)
      && !game.lanterns.some(lamp => lamp.lit && within(pos, lamp.pos, tuning.safe_radius)));
    if (spawn) emit('shade_spawned', { id: addShade(game, spawn) });
  }
  if (player.flames <= 0) finish('lost', 'no_flames');
  else if (game.lanterns.every(lamp => lamp.lit)) finish('won', 'all_lit');
  else if (game.time <= 0) finish('lost', 'dawn');
  game.previousInput = { ...input };
  return events;

  function finish(result, reason) {
    game.state = result;
    if (result === 'won') {
      game.score += Math.floor(game.time) * tuning.score.per_second_left
        + player.flames * tuning.score.per_flame_left;
    }
    emit('game_over', { result, reason });
  }
}

export function snapshot(game) {
  return {
    type: 'snapshot', tick: game.tick, sim_tick: game.tick,
    state: game.state, time_left_s: game.time, score: game.score,
    player: { pos: position(game.player.pos), flames: game.player.flames, carried: game.player.carried },
    lanterns: game.lanterns.map(lamp => ({ ...lamp, pos: position(lamp.pos) })),
    shades: game.shades.map(({ id, pos, state }) => ({ id, pos: position(pos), state })),
    motes_active: game.motes.length,
    motes: game.motes.map(({ id, pos }) => ({ id, pos: position(pos) }))
  };
}
