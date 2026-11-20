export const HZ = 60;
export const idle = {
  move: [0, 0], cam_yaw_deg: 0, jump: false, dash: false, interact: false, pulse: false, pause: false
};
const radians = degrees => degrees * Math.PI / 180;
const point = (radius, degrees, x = 0, z = 0, y = 0) => {
  const angle = radians(degrees);
  return [x + radius * Math.cos(angle), y, z + radius * Math.sin(angle)];
};
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const roundPosition = pos => pos.map(value => Number(value.toFixed(3)));
const sortedId = (a, b) => {
  const [aPrefix, aNumber = ''] = a.id.match(/^(.*?)(\d*)$/).slice(1);
  const [bPrefix, bNumber = ''] = b.id.match(/^(.*?)(\d*)$/).slice(1);
  if (aPrefix === bPrefix && aNumber && bNumber) return Number(aNumber) - Number(bNumber);
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function mapFor(night) {
  if (night === 1) {
    return {
      duration: 300, spawnMotes: [
        ...Array.from({ length: 8 }, (_, i) => point(12, i * 45)),
        ...Array.from({ length: 16 }, (_, i) => point(33, i * 22.5))
      ],
      shadePoints: Array.from({ length: 12 }, (_, i) => point(37, 15 + i * 30)),
      lanterns: [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]],
      shadeSpeed: 4, shadeInterval: 480, shadeMax: 6, shadeStartCount: 2, drifterInterval: 0, charms: []
    };
  }
  if (night === 2) {
    const motes = [];
    const shades = [];
    for (const center of [[0, 0], [70, 0]]) {
      for (let i = 0; i < 4; i += 1) motes.push(point(10, i * 90, ...center));
      for (let i = 0; i < 8; i += 1) motes.push(point(22, i * 45, ...center));
      for (let i = 0; i < 8; i += 1) shades.push(point(26, 22.5 + i * 45, ...center));
    }
    return {
      duration: 330, spawnMotes: motes, shadePoints: shades,
      lanterns: [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]],
      shadeSpeed: 4, shadeInterval: 420, shadeMax: 8, shadeStartCount: 0, drifterInterval: 1200,
      charms: [{ id: 'C1', pos: [35, 0, 0] }],
      pads: [
        [20, 0, 18, Math.atan2(-18, 50) * 180 / Math.PI],
        [50, 0, -18, Math.atan2(18, -50) * 180 / Math.PI]
      ]
    };
  }
  const motes = [];
  for (let i = 0; i < 18; i += 1) motes.push(point(34, i * 20));
  for (let i = 0; i < 8; i += 1) motes.push(point(18, 20 + i * 20, 0, 0, 3));
  for (let i = 0; i < 4; i += 1) motes.push(point(5, 45 + i * 90, 0, 0, 6));
  return {
    duration: 360, spawnMotes: motes,
    shadePoints: Array.from({ length: 16 }, (_, i) => point(43, i * 22.5)),
    lanterns: [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]],
    shadeSpeed: 4.5, shadeInterval: 360, shadeMax: 10, shadeStartCount: 0, drifterInterval: 1200,
    charms: [{ id: 'C1', pos: [30, 0, 25] }, { id: 'C2', pos: [-30, 0, 25] }],
    pads: [[0, 3, 13, 270, 8, 12]],
    windEnabled: true
  };
}

function randomOrder(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createGame(tuning, seed, night = 1, scenario = {}) {
  if (typeof night === 'object') {
    scenario = night;
    night = 1;
  }
  const map = mapFor(night);
  map.duration = tuning[`night${night}_duration_s`];
  map.shadeSpeed = night === 3 ? tuning.shade_speed_night3 : tuning.shade_speed;
  map.shadeInterval = tuning[`shade_spawn_interval_night${night}_ticks`];
  map.drifterInterval = tuning.drifter_spawn_interval_ticks;
  const random = randomSource(seed);
  const lanterns = map.lanterns.map((pos, i) => {
    const id = `L${i + 1}`;
    const patch = scenario.lanterns?.find(item => item.id === id);
    const deposited = patch?.deposited ?? (patch?.lit ? tuning.lantern_cost : 0);
    return { id, pos: [...(patch?.pos ?? pos)], deposited, lit: patch?.lit ?? deposited >= tuning.lantern_cost };
  });
  const motes = [];
  const game = {
    tuning, night, map, random, tick: 0, simTick: 0, state: 'playing', score: 0,
    initialTime: scenario.time_left_s ?? map.duration, time: scenario.time_left_s ?? map.duration, player: {
      pos: [...(scenario.player?.pos ?? [0, 0, 0])], vel: [0, 0, 0],
      carried: scenario.player?.carried ?? 0, flames: scenario.player?.flames ?? tuning.flames,
      grounded: true, invuln: scenario.player?.invuln_ticks ?? 0,
      dashCd: scenario.player?.dash_cd_ticks ?? 0, pulseCd: scenario.player?.pulse_cd_ticks ?? 0,
      charmTicks: scenario.player?.charm_ticks ?? 0, dashTicks: 0, respawnTicks: 0,
      facing: [0, 0, 1], fallHit: false, launchLocked: false, justRespawned: false, dashDirection: [0, 1]
    },
    lanterns, motes, shades: [], drifters: [], charms: [], nextMote: 1, nextShade: 1, nextDrifter: 1,
    randomMotes: scenario.random_motes ?? scenario.motes === undefined,
    randomShades: scenario.random_shades ?? scenario.shades === undefined,
    randomDrifters: scenario.random_drifters ?? scenario.drifters === undefined,
    windEnabled: scenario.wind_enabled ?? map.windEnabled ?? false,
    wind: { active: false, dirDeg: 0, ticks: 0, warning: 0 },
    previousInput: { ...idle }, startupEvents: [{ type: 'event', tick: 0, name: 'night_start', data: { night } }]
  };
  const defaultMotes = scenario.motes ?? randomOrder(map.spawnMotes, random).slice(0, tuning.mote_start_count);
  defaultMotes.forEach(pos => addMote(game, pos, 'random'));
  for (const patch of scenario.shades ?? []) addShade(game, patch.pos, patch.id, patch);
  for (const patch of scenario.drifters ?? []) addDrifter(game, patch.pos, patch.id, patch);
  const charmList = scenario.charms ?? map.charms ?? [];
  for (const patch of charmList) addCharm(game, patch);
  return game;
}

function addMote(game, pos, kind = 'random', ttl = null, id) {
  const moteId = id ?? `M${game.nextMote++}`;
  game.motes.push({ id: moteId, pos: [...pos], kind, ttl });
  return moteId;
}

function addShade(game, pos, id, patch = {}) {
  const shadeId = id ?? `S${game.nextShade++}`;
  if (id) game.nextShade = Math.max(game.nextShade, (Number(id.slice(1)) || 0) + 1);
  game.shades.push({
    id: shadeId, pos: [...pos], state: patch.state ?? 'wander',
    stateTicks: patch.state_ticks_left ?? 0, stunPushTicks: 0, safeEvacTicks: 0, target: null
  });
  return shadeId;
}

function addDrifter(game, pos, id, patch = {}) {
  const drifterId = id ?? `D${game.nextDrifter++}`;
  if (id) game.nextDrifter = Math.max(game.nextDrifter, (Number(id.slice(1)) || 0) + 1);
  game.drifters.push({
    id: drifterId, pos: [...pos], state: patch.state ?? 'idle', stateTicks: patch.state_ticks_left ?? 0,
    stolen: patch.stolen ?? 0, angle: game.random() * Math.PI * 2
  });
  return drifterId;
}

function addCharm(game, patch) {
  game.charms.push({
    id: patch.id, pos: [...patch.pos], available: patch.available ?? true,
    respawnTicks: patch.respawn_ticks ?? 0
  });
}

function floorAt(game, x, z, y) {
  const r = Math.hypot(x, z);
  if (game.night === 1) return r <= 40 ? 0 : null;
  if (game.night === 2) {
    if (r <= 28 || Math.hypot(x - 70, z) <= 28 || (x >= 26 && x <= 44 && Math.abs(z) <= 2)) return 0;
    return null;
  }
  if (r > 45) return null;
  const surfaces = [0];
  if (z > 0 && r >= 12 && r <= 24) surfaces.push(3);
  if (r <= 8) surfaces.push(6);
  const ramp = rampHeightAt(x, z);
  if (ramp !== null) return ramp;
  return surfaces.filter(height => height <= y + 0.03).at(-1) ?? 0;
}

function rampHeightAt(x, z) {
  const radius = Math.hypot(x, z);
  if (radius < 23.8 || radius > 30) return null;
  const angle = (Math.atan2(z, x) * 180 / Math.PI + 360) % 360;
  for (const rampAngle of [30, 150]) {
    let delta = Math.abs(angle - rampAngle);
    delta = Math.min(delta, 360 - delta);
    if (delta <= radians(5)) return Math.min(3, (30 - radius) / 2);
  }
  return null;
}

function supported(game, pos, y = pos[1]) {
  const height = floorAt(game, pos[0], pos[2], y);
  return height !== null && Math.abs(height - y) <= 0.05;
}

function safeAt(game, pos) {
  return game.lanterns.some(lamp => lamp.lit && distXZ(pos, lamp.pos) <= game.tuning.safe_radius);
}

function nearestLantern(game) {
  return game.lanterns.filter(lamp => !lamp.lit && distXZ(game.player.pos, lamp.pos) <= game.tuning.interact_radius)
    .sort((a, b) => distXZ(game.player.pos, a.pos) - distXZ(game.player.pos, b.pos) || a.id.localeCompare(b.id))[0];
}

export function nearbyLantern(game) {
  return nearestLantern(game);
}

function moveHorizontal(game, vector, speed) {
  const player = game.player;
  const length = Math.hypot(vector[0], vector[1]);
  const direction = length ? [vector[0] / length, vector[1] / length] : [0, 0];
  const dx = direction[0] * speed / HZ;
  const dz = direction[1] * speed / HZ;
  let x = player.pos[0] + dx;
  let z = player.pos[2] + dz;
  if (game.night === 3 && Math.hypot(x, z) < 2 && player.pos[1] < 14.5) {
    const d = Math.hypot(x, z) || 1;
    x = x / d * 2;
    z = z / d * 2;
  }
  player.pos[0] = x;
  player.pos[2] = z;
  player.vel[0] = direction[0] * speed;
  player.vel[2] = direction[1] * speed;
}

function launchPad(game, emit) {
  const player = game.player;
  for (const [x, y, z, yaw, horizontalSpeed = 24, verticalSpeed = 14] of game.map.pads ?? []) {
    if (!player.grounded || Math.abs(player.pos[1] - y) > 0.05 || distXZ(player.pos, [x, y, z]) > 1) continue;
    const angle = radians(yaw);
    player.vel[0] = Math.cos(angle) * horizontalSpeed;
    player.vel[2] = Math.sin(angle) * horizontalSpeed;
    player.vel[1] = verticalSpeed;
    player.grounded = false;
    player.launchLocked = true;
    return;
  }
}

function movePlayer(game, input, pressed, emit) {
  const { player, tuning } = game;
  const wasGrounded = player.grounded;
  player.justRespawned = false;
  if (player.respawnTicks > 0) {
    player.respawnTicks -= 1;
    player.vel = [0, 0, 0];
    if (player.respawnTicks === 0) {
      player.pos = [0, 0, 0];
      player.grounded = true;
      player.invuln = Math.round(tuning.invuln_s * HZ);
      player.justRespawned = true;
    }
    return;
  }
  const angle = radians(input.cam_yaw_deg ?? 0);
  const [x, z] = input.move ?? [0, 0];
  const len = Math.hypot(x, z);
  const direction = len ? [
    (x * Math.cos(angle) + z * Math.sin(angle)) / Math.max(1, len),
    (-x * Math.sin(angle) + z * Math.cos(angle)) / Math.max(1, len)
  ] : [0, 0];
  player.facing = len ? direction : [Math.sin(angle), Math.cos(angle)];
  let dashing = false;
  if (player.dashTicks > 0) {
    moveHorizontal(game, player.dashDirection, tuning.dash_speed);
    player.dashTicks -= 1;
    dashing = true;
  } else if (pressed('dash') && (player.dashCd === 0 || player.charmTicks > 0)) {
    player.dashDirection = len ? direction : player.facing;
    player.dashTicks = Math.round(tuning.dash_duration_s * HZ) - 1;
    if (!player.charmTicks) player.dashCd = Math.round(tuning.dash_cooldown_s * HZ);
    moveHorizontal(game, player.dashDirection, tuning.dash_speed);
    emit('dash', {});
    dashing = true;
  } else if (player.launchLocked) {
    player.pos[0] += player.vel[0] / HZ;
    player.pos[2] += player.vel[2] / HZ;
  } else {
    moveHorizontal(game, direction, player.charmTicks > 0 ? 7.2 : tuning.player_speed);
  }
  if (game.wind.active) {
    const windAngle = radians(game.wind.dirDeg);
    player.pos[0] += Math.cos(windAngle) * 2 / HZ;
    player.pos[2] += Math.sin(windAngle) * 2 / HZ;
  }
  if (!dashing) {
    if (pressed('jump') && player.grounded) {
      player.vel[1] = 7;
      player.grounded = false;
    }
    const previousY = player.pos[1];
    const ramp = game.night === 3 ? rampHeightAt(player.pos[0], player.pos[2]) : null;
    if (wasGrounded && ramp !== null && !pressed('jump')) {
      player.pos[1] = ramp;
      player.vel[1] = 0;
      player.grounded = true;
    } else {
      player.vel[1] -= 20 / HZ;
      player.pos[1] += player.vel[1] / HZ;
      const ground = floorAt(game, player.pos[0], player.pos[2], previousY);
      if (ground !== null && player.pos[1] <= ground && previousY >= ground) {
        player.pos[1] = ground;
        player.vel[1] = 0;
        player.grounded = true;
        player.launchLocked = false;
      } else {
        player.grounded = supported(game, player.pos);
        if (player.grounded) player.vel[1] = 0;
      }
    }
    if (player.grounded) launchPad(game, emit);
  }
  if (player.pos[1] < -10 && !player.fallHit) {
    player.fallHit = true;
    const lost = player.carried;
    player.carried = 0;
    player.flames -= 1;
      player.invuln = Math.round(tuning.invuln_s * HZ);
    player.vel = [0, 0, 0];
    player.respawnTicks = player.flames > 0 ? 60 : 0;
    emit('player_hit', { by: 'fall', flames: player.flames, dropped: 0, lost });
  } else if (player.grounded) {
    player.fallHit = false;
  }
}

function collectMotes(game, emit) {
  const { player, tuning } = game;
  game.motes = game.motes.filter(mote => {
    if (mote.ttl !== null && mote.ttl <= 0) return false;
    if (player.respawnTicks > 0 || player.justRespawned || player.carried >= tuning.carry_capacity
      || distXZ(player.pos, mote.pos) > tuning.pickup_radius || Math.abs(player.pos[1] - mote.pos[1]) > 1.5) return true;
    player.carried += 1;
    emit('mote_picked', { carried: player.carried });
    return false;
  });
}

function collectCharms(game, emit) {
  const { player } = game;
  for (const charm of game.charms) {
    if (!charm.available || player.respawnTicks > 0 || player.justRespawned || distXZ(player.pos, charm.pos) > 1
      || Math.abs(player.pos[1] - charm.pos[1]) > 1.5) continue;
    charm.available = false;
    charm.respawnTicks = game.tuning.charm_respawn_ticks;
    player.charmTicks = game.tuning.charm_duration_ticks;
    emit('charm_picked', { charm_id: charm.id, charm_ticks: game.tuning.charm_duration_ticks });
  }
}

function updateLanterns(game, pressed, emit) {
  const { player, tuning } = game;
  const lamp = pressed('interact') && nearestLantern(game);
  if (!lamp || player.carried <= 0) return;
  const amount = Math.min(player.carried, tuning.lantern_cost - lamp.deposited);
  player.carried -= amount;
  lamp.deposited += amount;
  game.score += amount * tuning.score.per_mote;
  emit('deposit', { lantern_id: lamp.id, amount, deposited: lamp.deposited });
  if (lamp.deposited >= tuning.lantern_cost) {
    lamp.lit = true;
    game.score += tuning.score.per_lantern;
    emit('lantern_lit', { lantern_id: lamp.id });
  }
}

function pulse(game, emit) {
  const { player, tuning } = game;
  if (player.carried < tuning.pulse_cost) return;
  player.carried -= tuning.pulse_cost;
  player.pulseCd = Math.round(tuning.pulse_cooldown_s * HZ);
  const center = [player.pos[0], player.pos[1] + 0.8, player.pos[2]];
  const stunned_ids = [];
  for (const shade of [...game.shades].sort(sortedId)) {
    if (dist3(center, shade.pos) > tuning.pulse_radius) continue;
    shade.state = 'stunned';
    shade.stateTicks = Math.round(tuning.pulse_stun_s * HZ) + 1;
    shade.stunPushTicks = 15;
    shade.pushDirection = [shade.pos[0] - player.pos[0], shade.pos[2] - player.pos[2]];
    if (!Math.hypot(...shade.pushDirection)) shade.pushDirection = [1, 0];
    const length = Math.hypot(...shade.pushDirection);
    shade.pushDirection = shade.pushDirection.map(axis => axis / length);
    stunned_ids.push(shade.id);
  }
  for (const drifter of [...game.drifters].sort(sortedId)) {
    if (dist3(center, drifter.pos) > tuning.pulse_radius) continue;
    if (drifter.state === 'chase') {
      drifter.state = 'flee';
      drifter.stateTicks = 241;
    } else if (drifter.state === 'flee' && drifter.stolen > 0) {
        for (let i = 0; i < drifter.stolen; i += 1) {
          addMote(game, drifter.pos, 'dropped', tuning.mote_drop_ttl_ticks + 1);
        }
      emit('drifter_drop', { drifter_id: drifter.id, amount: drifter.stolen });
      drifter.stolen = 0;
      drifter.stateTicks = 121;
    }
  }
  game.score += stunned_ids.length * tuning.score.per_stun;
  emit('pulse', { stunned_ids });
}

function moveShades(game) {
  const { player, map, tuning } = game;
  for (const shade of game.shades.sort(sortedId)) {
    if (shade.stateTicks > 0) shade.stateTicks -= 1;
    if (shade.state === 'spawning') {
      if (!shade.stateTicks) shade.state = 'wander';
      continue;
    }
    if (shade.state === 'stunned') {
      if (shade.stunPushTicks > 0) {
        const nextX = shade.pos[0] + shade.pushDirection[0] * tuning.pulse_push_m / 15;
        const nextZ = shade.pos[2] + shade.pushDirection[1] * tuning.pulse_push_m / 15;
        const blockedByTower = game.night === 3 && Math.hypot(nextX, nextZ) < 2 && shade.pos[1] < 14;
        if (!blockedByTower && floorAt(game, nextX, nextZ, shade.pos[1]) !== null) {
          shade.pos[0] = nextX;
          shade.pos[2] = nextZ;
          shade.stunPushTicks -= 1;
        } else {
          shade.stunPushTicks = 0;
        }
      }
      if (!shade.stateTicks) shade.state = 'wander';
      continue;
    }
    if (shade.safeEvacTicks > 0) {
      shade.safeEvacTicks -= 1;
      if (!shade.safeEvacTicks) shade.state = 'wander';
      continue;
    }
    if (shade.state === 'recoil') {
      if (!shade.stateTicks) shade.state = 'wander';
      else moveEntityAway(shade, player.pos, 2 / HZ);
      continue;
    }
    if (safeAt(game, shade.pos)) {
      const lamp = game.lanterns.filter(item => item.lit)
        .sort((a, b) => distXZ(shade.pos, a.pos) - distXZ(shade.pos, b.pos))[0];
      if (lamp) {
        pushShadeOutsideSafeZone(shade, lamp, tuning.safe_radius);
        shade.safeEvacTicks = 31;
      }
      continue;
    }
    const range = distXZ(shade.pos, player.pos);
    if (range <= tuning.shade_detect_radius) shade.state = 'chase';
    else if (range >= tuning.shade_forget_radius && shade.state === 'chase') shade.state = 'wander';
    const speed = map.shadeSpeed / HZ;
    if (shade.state === 'chase') {
      const before = [...shade.pos];
      moveEntityToward(shade, player.pos, speed);
      if (safeAt(game, shade.pos)) {
        const lamp = game.lanterns.find(item => item.lit && distXZ(shade.pos, item.pos) <= tuning.safe_radius);
        shade.pos = before;
        pushShadeOutsideSafeZone(shade, lamp, tuning.safe_radius);
      }
    } else shade.pos[0] += Math.sin(game.simTick / 60 + shade.id.length) * speed * 0.2;
  }
}

function moveEntityToward(entity, target, distance) {
  const dx = target[0] - entity.pos[0];
  const dz = target[2] - entity.pos[2];
  const d = Math.hypot(dx, dz);
  if (d) {
    entity.pos[0] += dx / d * Math.min(distance, d);
    entity.pos[2] += dz / d * Math.min(distance, d);
  }
}

function moveEntityAway(entity, target, distance) {
  const dx = entity.pos[0] - target[0];
  const dz = entity.pos[2] - target[2];
  const d = Math.hypot(dx, dz) || 1;
  entity.pos[0] += dx / d * distance;
  entity.pos[2] += dz / d * distance;
}

function pushShadeOutsideSafeZone(shade, lamp, radius) {
  let dx = shade.pos[0] - lamp.pos[0];
  let dz = shade.pos[2] - lamp.pos[2];
  const distance = Math.hypot(dx, dz);
  if (!distance) {
    dx = 1;
    dz = 0;
  } else {
    dx /= distance;
    dz /= distance;
  }
  shade.pos[0] = lamp.pos[0] + dx * (radius + 0.001);
  shade.pos[2] = lamp.pos[2] + dz * (radius + 0.001);
}

function updateDrifters(game) {
  const { player, tuning } = game;
  for (const drifter of game.drifters) {
    if (drifter.state === 'idle') {
      drifter.angle += 2 / HZ;
      drifter.pos[0] += Math.cos(drifter.angle) * 2 / HZ;
      drifter.pos[2] += Math.sin(drifter.angle) * 2 / HZ;
      if (player.carried >= 5 && distXZ(drifter.pos, player.pos) <= 15) drifter.state = 'chase';
    } else if (drifter.state === 'chase') {
      if (player.carried < 5 || distXZ(drifter.pos, player.pos) > 15) {
        drifter.state = 'idle';
      } else moveEntityToward(drifter, player.pos, 7 / HZ);
    } else if (drifter.state === 'flee') {
      if (drifter.stateTicks > 0) drifter.stateTicks -= 1;
      moveEntityAway(drifter, player.pos, 7 / HZ);
      if (!drifter.stateTicks) drifter.state = 'removed';
    }
  }
  game.drifters = game.drifters.filter(drifter => drifter.state !== 'removed');
}

function contact(game, emit) {
  const { player, tuning } = game;
  for (const drifter of [...game.drifters].sort(sortedId)) {
    if (drifter.state !== 'chase' || player.respawnTicks > 0 || player.justRespawned
      || distXZ(drifter.pos, player.pos) > 1.2) continue;
    const amount = Math.min(3, player.carried);
    player.carried -= amount;
    drifter.stolen = amount;
    drifter.state = 'flee';
    drifter.stateTicks = 240;
    emit('drifter_steal', { drifter_id: drifter.id, amount, carried: player.carried });
  }
  if (player.respawnTicks > 0 || player.justRespawned || player.invuln > 0 || safeAt(game, player.pos)) return;
  for (const shade of [...game.shades].sort(sortedId)) {
    if (shade.state === 'spawning' || shade.state === 'stunned' || shade.state === 'recoil'
      || shade.safeEvacTicks > 0 || distXZ(shade.pos, player.pos) > tuning.shade_hit_radius
      || Math.abs(shade.pos[1] - player.pos[1]) > 1.5) continue;
    player.flames -= 1;
    const dropped = Math.floor(player.carried / 2);
    player.carried -= dropped;
    for (let i = 0; i < dropped; i += 1) {
      const a = game.random() * Math.PI * 2;
      const r = 1.5 + game.random();
      addMote(game, [player.pos[0] + Math.cos(a) * r, player.pos[1], player.pos[2] + Math.sin(a) * r],
        'dropped', tuning.mote_drop_ttl_ticks + 1);
    }
    player.invuln = Math.round(tuning.invuln_s * HZ);
    shade.state = 'recoil';
    shade.stateTicks = 60;
    emit('player_hit', { by: 'shade', flames: player.flames, dropped });
    break;
  }
}

function spawnMote(game) {
  if (game.motes.length >= game.tuning.mote_max_count) return;
  const taken = new Set(game.motes.map(mote => mote.pos.join(',')));
  const free = game.map.spawnMotes.filter(pos => !taken.has(pos.join(',')));
  if (!free.length) return;
  addMote(game, free[Math.floor(game.random() * free.length)], 'random');
}

function spawnShade(game, emit) {
  if (game.shades.length >= game.map.shadeMax) return;
  const options = randomOrder(game.map.shadePoints, game.random).filter(pos =>
    distXZ(pos, game.player.pos) >= 15 && !safeAt(game, pos));
  if (!options.length) return;
  const id = `S${game.nextShade++}`;
  addShade(game, options[0], id, { state: 'spawning', state_ticks_left: 18 });
  emit('shade_spawned', { id });
}

function spawnDrifter(game) {
  if (game.drifters.length >= 2) return;
  const choices = game.map.shadePoints.filter(pos => !game.drifters.some(item => distXZ(pos, item.pos) < 2));
  if (choices.length) addDrifter(game, choices[Math.floor(game.random() * choices.length)]);
}

function updateCharmAndMoteTimers(game) {
  for (const mote of game.motes) if (mote.ttl !== null) mote.ttl -= 1;
  for (const charm of game.charms) {
    if (!charm.available && charm.respawnTicks > 0) {
      charm.respawnTicks -= 1;
      if (!charm.respawnTicks) charm.available = true;
    }
  }
}

function updateWind(game) {
  if (!game.windEnabled) return;
  const cycle = game.simTick % 1800;
  game.wind.warning = cycle >= 1680 && cycle < 1800 ? 1800 - cycle : 0;
  if (cycle === 0) {
    game.wind.active = true;
    game.wind.dirDeg = Math.floor(game.random() * 360);
  }
  game.wind.ticks = cycle < 300 ? 300 - cycle : 0;
  game.wind.active = game.wind.ticks > 0;
}

function ageCounters(game) {
  const p = game.player;
  if (p.invuln > 0) p.invuln -= 1;
  if (p.dashCd > 0) p.dashCd -= 1;
  if (p.pulseCd > 0) p.pulseCd -= 1;
  if (p.charmTicks > 0) p.charmTicks -= 1;
  updateCharmAndMoteTimers(game);
}

export function step(game, input = idle) {
  if (game.state === 'won' || game.state === 'lost') return [];
  game.tick += 1;
  const events = [];
  const emit = (name, data) => events.push({ type: 'event', tick: game.tick, name, data });
  const pressed = key => input[key] && !game.previousInput[key];
  if (pressed('pause')) {
    game.state = game.state === 'paused' ? 'playing' : 'paused';
    emit(game.state === 'paused' ? 'paused' : 'resumed', {});
    game.previousInput = { ...input };
    return events;
  }
  if (game.state === 'paused') {
    game.previousInput = { ...input };
    return events;
  }
  game.simTick += 1;
  game.time = Math.max(0, game.initialTime - game.simTick / HZ);
  ageCounters(game);
  updateWind(game);
  movePlayer(game, input, pressed, emit);
  collectMotes(game, emit);
  collectCharms(game, emit);
  updateLanterns(game, pressed, emit);
  for (const shade of game.shades) {
    if (!shade.safeEvacTicks && game.lanterns.some(lamp => lamp.lit && distXZ(shade.pos, lamp.pos) <= game.tuning.safe_radius)) {
      const lamp = game.lanterns.find(item => item.lit && distXZ(shade.pos, item.pos) <= game.tuning.safe_radius);
      pushShadeOutsideSafeZone(shade, lamp, game.tuning.safe_radius);
      shade.safeEvacTicks = 31;
    }
  }
  if (pressed('pulse') && game.player.pulseCd === 0) pulse(game, emit);
  updateDrifters(game);
  moveShades(game);
  contact(game, emit);
  if (game.randomMotes && game.simTick % game.tuning.mote_spawn_interval_ticks === 0) spawnMote(game);
  if (game.randomShades && game.night === 1 && game.simTick === game.tuning.shade_spawn_first_tick) {
    spawnShade(game, emit);
    spawnShade(game, emit);
  } else if (game.randomShades && game.simTick >= game.tuning.shade_spawn_first_tick
    && (game.night === 1
      ? (game.simTick - game.tuning.shade_spawn_first_tick) % game.tuning.shade_spawn_interval_night1_ticks === 0
      : game.simTick % game.map.shadeInterval === 0)) {
    spawnShade(game, emit);
  }
  if (game.randomDrifters && game.map.drifterInterval && game.simTick % game.map.drifterInterval === 0) {
    spawnDrifter(game);
  }
  if (game.player.flames <= 0) finish('lost', 'no_flames');
  else if (game.lanterns.every(lamp => lamp.lit)) finish('won', 'all_lit');
  else if (game.time <= 0) finish('lost', 'dawn');
  game.previousInput = { ...input };
  return events;

  function finish(state, reason) {
    game.state = state;
    if (state === 'won') {
      game.score += Math.floor(game.time) * game.tuning.score.per_second_left
        + game.player.flames * game.tuning.score.per_flame_left;
    }
    emit('game_over', { result: state, reason });
  }
}

export function snapshot(game) {
  const p = game.player;
  return {
    type: 'snapshot', tick: game.tick, sim_tick: game.simTick, night: game.night,
    state: game.state, time_left_s: game.time, score: game.score,
    wind: { active: game.wind.active, dir_deg: game.wind.dirDeg },
    player: {
      pos: roundPosition(p.pos), vel: roundPosition(p.vel), grounded: p.grounded,
      flames: p.flames, carried: p.carried, invuln: p.invuln / HZ,
      dash_cd_s: p.dashCd / HZ, pulse_cd_s: p.pulseCd / HZ, charm_s: p.charmTicks / HZ
    },
    lanterns: game.lanterns.map(lamp => ({ ...lamp, pos: roundPosition(lamp.pos) })),
    shades: game.shades.map(shade => ({ id: shade.id, pos: roundPosition(shade.pos), state: shade.state })),
    motes_active: game.motes.length,
    motes: game.motes.map(mote => ({
      id: mote.id, pos: roundPosition(mote.pos), kind: mote.kind,
      ttl_s: mote.ttl === null ? null : Number((Math.min(mote.ttl, game.tuning.mote_drop_ttl_ticks) / HZ).toFixed(3))
    })),
    drifters: game.drifters.map(drifter => ({
      id: drifter.id, pos: roundPosition(drifter.pos), state: drifter.state, stolen: drifter.stolen
    })),
    charms: game.charms.map(charm => ({
      id: charm.id, available: charm.available, respawn_s: Number((charm.respawnTicks / HZ).toFixed(3))
    }))
  };
}

export function createMap(night) {
  return mapFor(night);
}
