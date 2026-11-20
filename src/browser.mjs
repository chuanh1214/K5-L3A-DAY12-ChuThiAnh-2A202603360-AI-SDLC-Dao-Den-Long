import * as THREE from 'three';
import { createGame, HZ, nearbyLantern, RADIUS, step } from './game.mjs';

const ui = Object.fromEntries(['game', 'flames', 'timer', 'lanterns', 'score', 'prompt', 'motes', 'pulse',
  'overlay', 'headline', 'message', 'play'].map(id => [id, document.getElementById(id)]));
ui.play.disabled = true;

try {
  const response = await fetch('/game.contract.json');
  if (!response.ok) throw new Error('Không tải được cấu hình game.');
  const { tuning } = await response.json();
  start(tuning);
} catch (error) {
  ui.message.textContent = 'Không mở được màn chơi. Hãy kiểm tra trình duyệt hỗ trợ WebGL 2 và chạy lại máy chủ.';
  console.error(error);
}

function start(tuning) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  ui.game.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18122d);
  scene.fog = new THREE.FogExp2(0x251a3b, 0.019);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 180);
  const ambient = new THREE.HemisphereLight(0xc1b2ea, 0x584142, 1);
  scene.add(ambient);
  const moonlight = new THREE.DirectionalLight(0xb7b8ff, 1.35);
  moonlight.position.set(-20, 35, -12);
  scene.add(moonlight);
  const material = (color, glow = 0, intensity = 1) =>
    new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: intensity, roughness: 0.8 });
  function mesh(parent, geometry, surface, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }
  mesh(scene, new THREE.CylinderGeometry(RADIUS, 32, 4, 64), material(0x385853), 0, -2);
  mesh(scene, new THREE.CylinderGeometry(32, 22, 9, 15), material(0x32293f), 0, -8.5);
  const cloud = material(0x504368);
  const cloudShape = new THREE.SphereGeometry(1, 10, 6);
  for (let i = 0; i < 28; i += 1) {
    const angle = i * 2.39996;
    const range = 44 + (i % 5) * 5;
    mesh(scene, cloudShape, cloud, Math.cos(angle) * range, -4 - i % 4, Math.sin(angle) * range)
      .scale.set(6 + i % 5, 1.4, 4);
  }
  const grass = material(0x52665c);
  const grassShape = new THREE.ConeGeometry(0.21, 0.85, 3);
  for (let i = 0; i < 130; i += 1) {
    const angle = i * 2.39996;
    const range = 6 + (i * 13 % 33);
    mesh(scene, grassShape, grass, Math.cos(angle) * range, 0.28, Math.sin(angle) * range);
  }

  const player = new THREE.Group();
  scene.add(player);
  mesh(player, new THREE.CylinderGeometry(0.34, 0.56, 0.85, 8), material(0xbf6d57), 0, 0.61);
  mesh(player, new THREE.SphereGeometry(0.33, 12, 8), material(0xf4b280), 0, 1.22);
  mesh(player, new THREE.ConeGeometry(0.67, 0.37, 18), material(0xdba46a), 0, 1.59);
  const feet = [-0.21, 0.21].map(x =>
    mesh(player, new THREE.SphereGeometry(0.17, 8, 6), material(0x2f2342), x, 0.13, 0.06));
  mesh(player, new THREE.CylinderGeometry(0.018, 0.018, 0.35), material(0x774736), 0.49, 1.33);
  mesh(player, new THREE.SphereGeometry(0.13, 10, 8), material(0xffd586, 0xff8c34, 2), 0.49, 1.1);

  const world = new THREE.Group();
  scene.add(world);
  const lampWood = material(0x754d42);
  const lampOff = material(0x8b6867);
  const lampOn = material(0xffc068, 0xff9a36, 2.2);
  const moteMaterial = material(0xffe891, 0xffc24e, 2.7);
  const shadeMaterial = material(0x241630, 0x1d073c, 0.85);
  const stunMaterial = material(0x8a6dab, 0x3a1850, 0.7);
  const eyeMaterial = material(0xcb8ff7, 0xb15eff, 0.9);
  const pulseRing = mesh(scene, new THREE.TorusGeometry(1, 0.045, 6, 60),
    new THREE.MeshBasicMaterial({ color: 0xffcf73, transparent: true }));
  pulseRing.rotation.x = -Math.PI / 2;
  pulseRing.visible = false;
  const motes = new Map();
  const shades = new Map();
  const lamps = new Map();
  const moteGeometry = new THREE.IcosahedronGeometry(0.19, 1);
  const shadeGeometry = new THREE.SphereGeometry(0.69, 14, 10);
  const eyeGeometry = new THREE.SphereGeometry(0.085, 8, 6);
  const keys = new Set();
  const taps = new Set();
  let yaw = 0;
  let game;
  let active = false;
  let elapsed = 0;
  let previous = performance.now();
  let pulseAt = -Infinity;
  const controls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyQ']);
  window.addEventListener('keydown', event => {
    if (!active || !controls.has(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    if (!event.repeat) taps.add(event.code);
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); taps.clear(); });

  function reset() {
    game = createGame(tuning, 1212);
    yaw = 0;
    player.rotation.y = 0;
    pulseAt = -Infinity;
    elapsed = 0;
    keys.clear();
    taps.clear();
    for (const lamp of lamps.values()) world.remove(lamp.group);
    lamps.clear();
    for (const lamp of game.lanterns) {
      const group = new THREE.Group();
      group.position.set(...lamp.pos);
      world.add(group);
      mesh(group, new THREE.CylinderGeometry(0.21, 0.35, 2.7, 8), lampWood, 0, 1.35);
      mesh(group, new THREE.ConeGeometry(0.84, 0.48, 8), lampWood, 0, 3.45);
      const body = mesh(group, new THREE.CylinderGeometry(0.65, 0.52, 0.95, 8), lampOff, 0, 2.85);
      const light = new THREE.PointLight(0xffa24b, 0, 16, 2);
      light.position.y = 3;
      group.add(light);
      lamps.set(lamp.id, { group, body, light });
    }
  }

  function syncEntity(entities, lookup, create, update) {
    const present = new Set();
    entities.forEach((entity, index) => {
      present.add(entity.id);
      if (!lookup.has(entity.id)) lookup.set(entity.id, create());
      update(entity, lookup.get(entity.id), index);
    });
    for (const [id, object] of lookup) {
      if (present.has(id)) continue;
      world.remove(object);
      lookup.delete(id);
    }
  }

  function updateScene(now) {
    const time = now / 1000;
    const { pos, invuln } = game.player;
    player.position.set(...pos);
    player.visible = !invuln || Math.floor(time * 12) % 2 === 0;
    const walking = active && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(key => keys.has(key));
    feet.forEach((foot, i) => { foot.position.z = 0.06 + (walking ? Math.sin(time * 16 + i * Math.PI) * 0.2 : 0); });
    syncEntity(game.motes, motes, () => mesh(world, moteGeometry, moteMaterial), (mote, object, i) => {
      object.position.set(...mote.pos);
      object.position.y += 0.55 + Math.sin(time * 3 + i) * 0.19;
      object.rotation.y = time + i;
    });
    syncEntity(game.shades, shades, () => {
      const object = mesh(world, shadeGeometry, shadeMaterial);
      mesh(object, eyeGeometry, eyeMaterial, -0.22, 0.11, 0.61);
      mesh(object, eyeGeometry, eyeMaterial, 0.22, 0.11, 0.61);
      return object;
    }, (shade, object, i) => {
      object.position.set(...shade.pos);
      object.position.y += 0.76 + Math.sin(time * 4 + i) * 0.12;
      object.rotation.y = Math.atan2(pos[0] - shade.pos[0], pos[2] - shade.pos[2]);
      object.material = shade.state === 'stunned' ? stunMaterial : shadeMaterial;
    });
    let lit = 0;
    for (const lamp of game.lanterns) {
      const view = lamps.get(lamp.id);
      view.body.material = lamp.lit ? lampOn : lampOff;
      view.light.intensity = lamp.lit ? 52 : 0;
      lit += Number(lamp.lit);
    }
    ambient.intensity = 0.75 + lit * 0.24;
    const age = (now - pulseAt) / 440;
    pulseRing.visible = age < 1;
    if (pulseRing.visible) {
      pulseRing.position.set(pos[0], pos[1] + 0.15, pos[2]);
      pulseRing.scale.setScalar(Math.max(0.05, age * tuning.pulse_radius));
      pulseRing.material.opacity = 1 - age;
    }
    camera.position.set(pos[0] - 9 * Math.sin(yaw), pos[1] + 6, pos[2] - 9 * Math.cos(yaw));
    camera.lookAt(pos[0] + 4 * Math.sin(yaw), pos[1] + 1.4, pos[2] + 4 * Math.cos(yaw));
    const remaining = Math.ceil(game.time);
    ui.timer.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    ui.timer.classList.toggle('urgent', remaining <= 30);
    ui.flames.textContent = '◆'.repeat(game.player.flames) + '◇'.repeat(tuning.flames - game.player.flames);
    ui.lanterns.textContent = `Đèn ${lit}/${game.lanterns.length}`;
    ui.score.textContent = `${game.score} điểm`;
    ui.motes.textContent = `Đom đóm ${game.player.carried}/${tuning.carry_capacity}`;
    ui.pulse.textContent = game.player.cooldown
      ? `Tỏa sáng ${(game.player.cooldown / HZ).toFixed(1)}s` : `Q Tỏa sáng · ${tuning.pulse_cost} đom đóm`;
    const near = nearbyLantern(game);
    ui.prompt.textContent = near && active ? `E · Nạp đèn ${near.id} (${near.deposited}/${tuning.lantern_cost})` : '';
  }

  const delta = 1 / HZ;
  function frame(now) {
    elapsed += Math.min(0.12, (now - previous) / 1000);
    previous = now;
    while (active && elapsed >= delta) {
      elapsed -= delta;
      yaw += (Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight'))) * 1.8 * delta;
      const x = Number(keys.has('KeyA')) - Number(keys.has('KeyD'));
      const z = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      if (x || z) player.rotation.y = yaw + Math.atan2(x, z);
      const events = step(game, {
        move: [x, z], cam_yaw_deg: yaw * 180 / Math.PI,
        jump: keys.has('Space') || taps.has('Space'),
        interact: keys.has('KeyE') || taps.has('KeyE'),
        pulse: keys.has('KeyQ') || taps.has('KeyQ')
      });
      taps.clear();
      for (const event of events) {
        if (event.name === 'pulse') pulseAt = now;
        if (event.name !== 'game_over') continue;
        active = false;
        ui.headline.textContent = game.state === 'won' ? 'Đảo đã sáng!' : 'Đêm chưa trọn';
        const reason = { all_lit: 'Cả năm đèn đã sáng.', dawn: 'Bình minh đã lên.', no_flames: 'Mây đã hết Ngọn Lửa.' };
        ui.message.textContent = `${reason[event.data.reason]} Bạn đạt ${game.score} điểm.`;
        ui.play.textContent = 'Chơi lại';
        ui.overlay.hidden = false;
        ui.play.focus();
      }
    }
    if (!active) elapsed = 0;
    updateScene(now);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  ui.play.addEventListener('click', () => {
    reset();
    ui.overlay.hidden = true;
    active = true;
  });
  reset();
  resize();
  window.addEventListener('resize', resize);
  ui.play.disabled = false;
  requestAnimationFrame(frame);
}
