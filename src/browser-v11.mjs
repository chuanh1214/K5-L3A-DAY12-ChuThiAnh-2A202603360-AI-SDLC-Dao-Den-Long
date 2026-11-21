import * as THREE from 'three';
import { carryCapacity, createBenchmark, createGame, floorAt, HZ, lanternCost, lanternFuel, nearbyLantern, step, stepBenchmark } from './game.mjs';

const byId = id => document.getElementById(id);
const ui = {
  game: byId('game'), flames: byId('flames'), timer: byId('timer'), night: byId('night-label'),
  lanterns: byId('lanterns'), score: byId('score'), prompt: byId('prompt'), slots: byId('mote-slots'),
  abilities: byId('abilities'), overlay: byId('overlay'), eyebrow: byId('eyebrow'),
  headline: byId('headline'), message: byId('message'), settings: byId('settings-panel'),
  buttons: byId('menu-buttons'), volume: byId('volume'), volumeValue: byId('volume-value'),
  sensitivity: byId('sensitivity'),
  target: byId('target-arrow'), wind: byId('wind-warning'), fps: byId('fps')
};

const nightInfo = [
  { island: 'Đảo Bến', title: 'Đêm 1 — Đảo Bến', line: 'Ông Đăng: “Thắp lại những đèn nhỏ, Mây sẽ tìm được đường về.”' },
  { island: 'Đảo Cau', title: 'Đêm 2 — Đảo Cau', line: 'Ông Đăng: “Qua cầu tre thật vững, rồi ánh đèn sẽ nối hai bờ.”' },
  { island: 'Đảo Chuông', title: 'Đêm 3 — Đảo Chuông', line: 'Ông Đăng: “Trên tầng cao nhất, tiếng chuông sẽ gọi bình minh.”' }
];
const settings = {
  accessiblePalette: localStorage.getItem('lantern-accessible-palette') === 'true',
  reducedMotion: localStorage.getItem('lantern-reduced-motion') === 'true',
  largeText: localStorage.getItem('lantern-large-text') === 'true',
  volume: Number(localStorage.getItem('lantern-volume') ?? 0.45),
  sensitivity: Number(localStorage.getItem('lantern-sensitivity') ?? 0.8)
};
const savedUnlockedNight = Number.parseInt(localStorage.getItem('lantern-unlocked-night') ?? '1', 10);
const testAllNights = new URLSearchParams(location.search).get('testAllNights') === '1';
const benchParams = new URLSearchParams(location.search);
const benchmark = benchParams.has('bench') ? {
  seed: Number(benchParams.get('seed')), duration: Number(benchParams.get('duration')) * 1000, times: []
} : null;
function reportBenchmark(data) {
  return fetch('/api/benchmark', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  }).catch(console.error);
}
if (benchmark) window.addEventListener('error', event => reportBenchmark({ error: event.message }));
let highestUnlockedNight = testAllNights ? 3
  : Number.isInteger(savedUnlockedNight) && savedUnlockedNight >= 1 && savedUnlockedNight <= 3
    ? savedUnlockedNight : 1;
ui.volume.value = String(settings.volume);
ui.volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
ui.sensitivity.value = String(settings.sensitivity);
const paletteToggle = byId('accessible-palette');
const moteCount = byId('mote-count');
paletteToggle.checked = settings.accessiblePalette;
document.body.classList.toggle('accessible-palette', settings.accessiblePalette);
const shadeAccent = () => settings.accessiblePalette ? '#00B3FF' : '#7A3CFF';

let tuning;
let renderer;
let scene;
let camera;
let ambient;
let player;
let world;
let mapRoot;
let game;
let night = 1;
let totalScore = 0;
let nightsWon = 0;
let runSeed;
let shadeNotice;
let capturingKey;
let scoreBase = 0;
let active = false;
let yaw = 0;
let elapsed = 0;
let previousTime = performance.now();
let pulseAt = -Infinity;
let lastCountdown = 10;
let frameCount = 0;
let fpsStart = performance.now();
let musicTimer;
let musicNote = 0;
let musicGain;
let audio;
let pulseRing;
let moteSlots = [];
let dashAbility;
let pulseAbility;
const keys = new Set();
const taps = new Set();
const defaultBindings = { forward: 'KeyW', left: 'KeyA', back: 'KeyS', right: 'KeyD',
  jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE', pulse: 'KeyQ', pause: 'Escape' };
const actionLabels = { forward: 'Tiến', left: 'Trái', back: 'Lùi', right: 'Phải',
  jump: 'Nhảy', dash: 'Lướt', interact: 'Nạp đèn', pulse: 'Tỏa Sáng', pause: 'Tạm dừng' };
let bindings = { ...defaultBindings };
try {
  const saved = JSON.parse(localStorage.getItem('lantern-bindings'));
  if (saved) for (const action of Object.keys(bindings)) {
    if (typeof saved[action] === 'string') bindings[action] = saved[action];
  }
} catch {}
const codesFor = action => {
  if (action === 'pause' && bindings.pause === 'Escape' && !Object.values(bindings).includes('KeyP')) return ['Escape', 'KeyP'];
  if (action === 'dash' && bindings.dash === 'ShiftLeft' && !Object.values(bindings).includes('ShiftRight')) return ['ShiftLeft', 'ShiftRight'];
  return [bindings[action]];
};
const activeKey = (action, source = keys) => codesFor(action).some(code => source.has(code));
const keyName = code => code.replace(/^Key|^Digit/, '').replace(/Left$|Right$/, match => code.startsWith('Shift') ? '' : match);
const objects = { motes: new Map(), shades: new Map(), drifters: new Map(), charms: new Map(), lamps: new Map() };
const materials = {};

async function load() {
  const response = await fetch('/game.contract.json');
  if (!response.ok) throw new Error(`Contract request failed: ${response.status}`);
  ({ tuning } = await response.json());
  moteSlots = Array.from({ length: tuning.capacity_max }, () => {
    const slot = document.createElement('span');
    slot.className = 'mote-slot';
    slot.setAttribute('aria-hidden', 'true');
    return slot;
  });
  ui.slots.replaceChildren(...moteSlots);
  dashAbility = document.createElement('span');
  pulseAbility = document.createElement('span');
  ui.abilities.replaceChildren(dashAbility, pulseAbility);
  initScene();
  initAccessibility();
  byId('save-score').addEventListener('submit', saveScore);
  if (benchmark) {
    game = createBenchmark(tuning, benchmark.seed);
    buildMap(1);
    ui.overlay.hidden = true;
    requestAnimationFrame(benchmarkFrame);
  } else {
    showMenu();
    requestAnimationFrame(frame);
  }
}

function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 0.85));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  ui.game.append(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0E1430');
  scene.fog = new THREE.FogExp2('#1B2350', 0.012);
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 260);
  ambient = new THREE.AmbientLight('#F5F1E6', 0.15);
  scene.add(ambient);
  const moonlight = new THREE.DirectionalLight('#AEBBDD', 0.65);
  moonlight.position.set(-25, 45, -20);
  scene.add(moonlight);
  materials.grass = new THREE.MeshStandardMaterial({ color: '#2F5D50', roughness: 0.92 });
  materials.grassTuft = new THREE.MeshStandardMaterial({
    color: '#4D805A', emissive: '#17331D', emissiveIntensity: 0.18, roughness: 0.95
  });
  materials.sand = new THREE.MeshStandardMaterial({ color: '#C9B48A', roughness: 1 });
  materials.wood = new THREE.MeshStandardMaterial({ color: '#6B4A2F', roughness: 0.88 });
  materials.sea = new THREE.MeshStandardMaterial({ color: '#12384A', roughness: 0.95 });
  materials.lampOff = new THREE.MeshStandardMaterial({ color: '#5B5F6E', roughness: 0.75 });
  materials.lampOn = new THREE.MeshStandardMaterial({ color: '#FFB347', emissive: '#FFB347', emissiveIntensity: 0.65 });
  materials.lampCore = new THREE.MeshStandardMaterial({ color: '#FFE9B0', emissive: '#FFB347', emissiveIntensity: 1.8 });
  materials.fuelTrack = new THREE.MeshBasicMaterial({ color: '#120A1A' });
  materials.fuelFill = new THREE.MeshBasicMaterial({ color: '#F2C14E' });
  materials.lampTear = new THREE.LineBasicMaterial({ color: '#120A1A' });
  materials.mote = new THREE.MeshStandardMaterial({ color: '#FFF6C2', emissive: '#FFE58A', emissiveIntensity: 2.1 });
  materials.shade = new THREE.MeshStandardMaterial({ color: '#120A1A', emissive: '#7A3CFF', emissiveIntensity: 0.12 });
  materials.stunned = new THREE.MeshStandardMaterial({ color: '#3A3450', emissive: '#7A3CFF', emissiveIntensity: 0.22 });
  materials.drifter = new THREE.MeshStandardMaterial({ color: '#8FA3B8', emissive: '#8FA3B8', emissiveIntensity: 0.4 });
  materials.charm = new THREE.MeshStandardMaterial({ color: '#C8102E', emissive: '#F2C14E', emissiveIntensity: 0.35 });
  materials.bell = new THREE.MeshStandardMaterial({ color: '#F2C14E', metalness: 0.55, roughness: 0.4 });
  const playerMaterial = new THREE.MeshStandardMaterial({ color: '#E8E2D0', roughness: 0.85 });
  const scarfMaterial = new THREE.MeshStandardMaterial({ color: '#C8102E', roughness: 0.7 });
  const hatMaterial = new THREE.MeshStandardMaterial({ color: '#C9B48A', roughness: 0.9 });
  player = new THREE.Group();
  scene.add(player);
  addMesh(player, new THREE.CylinderGeometry(0.35, 0.48, 0.85, 9), playerMaterial, 0, 0.6, 0);
  for (const x of [-0.2, 0.2]) {
    addMesh(player, new THREE.BoxGeometry(0.22, 0.16, 0.34), materials.wood, x, 0.08, 0.06);
    addMesh(player, new THREE.CylinderGeometry(0.09, 0.09, 0.19, 8), playerMaterial, x, 0.19, 0);
  }
  addMesh(player, new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshStandardMaterial({ color: '#F3C9A0' }), 0, 1.2, 0);
  addMesh(player, new THREE.ConeGeometry(0.68, 0.38, 18), hatMaterial, 0, 1.58, 0);
  addMesh(player, new THREE.CylinderGeometry(0.39, 0.42, 0.13, 9), scarfMaterial, 0, 0.98, 0);
  addMesh(player, new THREE.CylinderGeometry(0.025, 0.025, 0.36), materials.wood, 0.48, 1.15, 0);
  addMesh(player, new THREE.SphereGeometry(0.13, 10, 8), materials.lampCore, 0.48, 0.98, 0);
  world = new THREE.Group();
  scene.add(world);
  mapRoot = new THREE.Group();
  scene.add(mapRoot);
  pulseRing = addMesh(scene, new THREE.TorusGeometry(1, 0.045, 6, 48),
    new THREE.MeshBasicMaterial({ color: '#FFE9B0', transparent: true }));
  pulseRing.rotation.x = -Math.PI / 2;
  pulseRing.visible = false;
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); taps.clear(); });
  renderer.domElement.addEventListener('click', () => {
    if (active && renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
  });
  window.addEventListener('mousemove', event => {
    if (document.pointerLockElement === renderer.domElement && active) yaw -= event.movementX * settings.sensitivity * 0.0015;
  });
  ui.volume.addEventListener('input', () => {
    settings.volume = Number(ui.volume.value);
    localStorage.setItem('lantern-volume', String(settings.volume));
    if (musicGain) musicGain.gain.setTargetAtTime(settings.volume * 0.12, audio.currentTime, 0.08);
    else if (settings.volume > 0) startMusic();
    ui.volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
  });
  ui.sensitivity.addEventListener('input', () => {
    settings.sensitivity = Number(ui.sensitivity.value);
    localStorage.setItem('lantern-sensitivity', String(settings.sensitivity));
  });
  paletteToggle.addEventListener('change', () => {
    settings.accessiblePalette = paletteToggle.checked;
    localStorage.setItem('lantern-accessible-palette', String(settings.accessiblePalette));
    document.body.classList.toggle('accessible-palette', settings.accessiblePalette);
  });
  resize();
}

function addMesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function onKeyDown(event) {
  if (capturingKey) {
    event.preventDefault();
    if (event.repeat) return;
    const duplicate = Object.keys(bindings).find(action => action !== capturingKey && bindings[action] === event.code);
    if (duplicate || ['ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(event.code)) {
      byId('binding-status').textContent = duplicate ? `Phím đã dùng cho ${actionLabels[duplicate]}.` : 'Phím dành cho camera hoặc điều hướng.';
      return;
    }
    if (!event.code || event.code === 'Unidentified') return;
    bindings[capturingKey] = event.code;
    capturingKey = undefined;
    localStorage.setItem('lantern-bindings', JSON.stringify(bindings));
    renderBindings('Đã lưu phím mới.');
    return;
  }
  if (event.target instanceof HTMLInputElement) return;
  const pause = codesFor('pause').includes(event.code);
  if (game?.state === 'paused' && pause && ui.settings.hidden) {
    event.preventDefault();
    if (!event.repeat) resumeGame();
    return;
  }
  if (!active || !['ArrowLeft', 'ArrowRight', ...Object.keys(bindings).flatMap(codesFor)].includes(event.code)) return;
  event.preventDefault();
  keys.add(event.code);
  if (!event.repeat) taps.add(event.code);
}

function initAccessibility() {
  for (const [property, id] of [['reducedMotion', 'reduced-motion'], ['largeText', 'large-text']]) {
    const input = byId(id);
    const apply = () => document.documentElement.classList.toggle(id, settings[property]);
    input.checked = settings[property];
    apply();
    input.addEventListener('change', () => {
      settings[property] = input.checked;
      localStorage.setItem(`lantern-${id}`, String(input.checked));
      apply();
    });
  }
  byId('reset-bindings').addEventListener('click', () => {
    capturingKey = undefined;
    bindings = { ...defaultBindings };
    localStorage.removeItem('lantern-bindings');
    renderBindings('Đã khôi phục phím mặc định.');
  });
  renderBindings();
}

function renderBindings(message = '') {
  const buttons = Object.entries(actionLabels).map(([action, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = `${label} · ${codesFor(action).map(keyName).join('/')}`;
    button.addEventListener('click', () => {
      capturingKey = action;
      byId('binding-status').textContent = `Nhấn phím cho ${label}.`;
    });
    return button;
  });
  byId('bindings').replaceChildren(...buttons);
  byId('binding-status').textContent = message;
  byId('controls').textContent = `${['forward', 'left', 'back', 'right'].map(action => keyName(bindings[action])).join(' ')} di chuyển · ← → camera · ${['jump', 'dash', 'interact', 'pulse', 'pause'].map(action => `${codesFor(action).map(keyName).join('/')} ${actionLabels[action].toLowerCase()}`).join(' · ')}`;
}

function resize() {
  if (!renderer) return;
  const width = benchmark ? 1280 : innerWidth;
  const height = benchmark ? 720 : innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    disposeObject(child);
    group.remove(child);
  }
}

function disposeObject(root) {
  root.traverse(object => {
    object.geometry?.dispose();
    if (object.material && !Object.values(materials).includes(object.material)) object.material.dispose?.();
  });
}

function circle(parent, radius, y, material, x = 0, z = 0, depth = 1.5) {
  const object = addMesh(parent, new THREE.CylinderGeometry(radius, radius, depth, 64), material, x, y, z);
  return object;
}

function buildMap(level) {
  clearGroup(mapRoot);
  const sky = addMesh(mapRoot, new THREE.CylinderGeometry(150, 150, 1, 32), materials.sea, 0, -16, 0);
  sky.receiveShadow = true;
  if (level === 1) {
    circle(mapRoot, 40, -0.75, materials.sand, 0, 0, 1.5);
    circle(mapRoot, 39.5, -0.05, materials.grass, 0, 0, 0.18);
  } else if (level === 2) {
    for (const x of [0, 70]) {
      circle(mapRoot, 28, -0.7, materials.sand, x, 0, 1.4);
      circle(mapRoot, 27.5, -0.05, materials.grass, x, 0, 0.18);
    }
    const bridge = addMesh(mapRoot, new THREE.BoxGeometry(18, 0.35, 4), materials.wood, 35, -0.05, 0);
    bridge.receiveShadow = true;
  } else {
    circle(mapRoot, 45, -0.65, materials.sand, 0, 0, 1.3);
    circle(mapRoot, 44.5, -0.05, materials.grass, 0, 0, 0.18);
    const terrace = new THREE.Shape();
    terrace.absarc(0, 0, 24, Math.PI, 2 * Math.PI, false);
    terrace.absarc(0, 0, 12, 2 * Math.PI, Math.PI, true);
    terrace.closePath();
    const middleTier = addMesh(mapRoot, new THREE.ExtrudeGeometry(terrace, {
      depth: 3, bevelEnabled: false, curveSegments: 64
    }), materials.sand);
    middleTier.rotation.x = -Math.PI / 2;
    const annulusGrass = addMesh(mapRoot, new THREE.RingGeometry(12, 23.4, 64, 1, Math.PI, Math.PI), materials.grass, 0, 3.04, 0);
    annulusGrass.rotation.x = -Math.PI / 2;
    circle(mapRoot, 8, 5.85, materials.sand, 0, 0, 0.3);
    circle(mapRoot, 7.6, 5.96, materials.grass, 0, 0, 0.16);
    for (const degree of [30, 150]) {
      const ramp = new THREE.Group();
      const angle = degree * Math.PI / 180;
      ramp.position.set(Math.cos(angle) * 27, 1.5, Math.sin(angle) * 27);
      ramp.rotation.y = -angle;
      const profile = new THREE.Shape();
      profile.moveTo(-3.05, -1.5);
      profile.lineTo(3, -1.5);
      profile.lineTo(-3, 1.5);
      profile.lineTo(-3.05, 1.5);
      profile.closePath();
      addMesh(ramp, new THREE.ExtrudeGeometry(profile, { depth: 3, bevelEnabled: false }),
        materials.sand, 0, 0, -1.5);
      mapRoot.add(ramp);
    }
    const tower = new THREE.Group();
    mapRoot.add(tower);
    addMesh(tower, new THREE.CylinderGeometry(2, 2, 0.35, 18), materials.wood, 0, 6.15, 0);
    addMesh(tower, new THREE.CylinderGeometry(2, 2, 8, 18), materials.wood, 0, 10, 0);
    addMesh(tower, new THREE.BoxGeometry(4, 0.3, 0.35), materials.wood, 0, 13.85, 0);
    addMesh(tower, new THREE.CylinderGeometry(0.07, 0.07, 0.45, 8), materials.wood, 0, 13.475, 0);
    addMesh(tower, new THREE.LatheGeometry([
      new THREE.Vector2(0.12, 0), new THREE.Vector2(0.18, 0.12), new THREE.Vector2(0.45, 0.24),
      new THREE.Vector2(0.62, 0.82), new THREE.Vector2(0.58, 1.02), new THREE.Vector2(0.38, 1.02)
    ], 16), materials.bell, 0, 12.68, 0);
    addMesh(tower, new THREE.SphereGeometry(0.12, 8, 6), materials.wood, 0, 12.58, 0);
  }
  buildScenery(level);
  buildPads(level);
  buildLanterns(game.lanterns);
}

function buildScenery(level) {
  const rng = (index, salt = 0) => {
    const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const centers = level === 2 ? [[0, 0], [70, 0]] : [[0, 0]];
  const count = level === 3 ? 150 : 110;
  const vegetation = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 4), materials.grassTuft, count
  );
  const transform = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const center = centers[i % centers.length];
    const angle = rng(i) * Math.PI * 2;
    const radius = 4 + rng(i, 1) * (level === 1 ? 34 : level === 2 ? 22 : 38);
    const x = center[0] + Math.cos(angle) * radius;
    const z = center[1] + Math.sin(angle) * radius;
    const width = 0.12 + rng(i, 2) * 0.12;
    const height = 0.45 + rng(i, 3) * 0.6;
    const ground = level === 3 ? floorAt(game, x, z) : 0.04;
    transform.position.set(x, ground + height / 2, z);
    transform.rotation.set(0, angle, 0);
    transform.scale.set(width, height, width);
    transform.updateMatrix();
    vegetation.setMatrixAt(i, transform.matrix);
  }
  vegetation.instanceMatrix.needsUpdate = true;
  mapRoot.add(vegetation);
  if (level === 2) {
    for (const [x, z] of [[20, 18], [50, -18]]) {
      addMesh(mapRoot, new THREE.CylinderGeometry(1, 1, 0.22, 24),
        new THREE.MeshStandardMaterial({ color: '#F2C14E', emissive: '#FFB347', emissiveIntensity: 0.65 }),
        x, 0.13, z);
    }
  }
}

function buildPads(level) {
  if (level === 3) {
    addMesh(mapRoot, new THREE.CylinderGeometry(1, 1, 0.2, 24),
      new THREE.MeshStandardMaterial({ color: '#F2C14E', emissive: '#FFB347', emissiveIntensity: 0.8 }),
      0, 3.1, 13);
  }
}

function buildLanterns(lanterns) {
  for (const lamp of objects.lamps.values()) {
    world.remove(lamp.group);
    disposeObject(lamp.group);
  }
  objects.lamps.clear();
  for (const lamp of lanterns) {
    const group = new THREE.Group();
    group.position.set(...lamp.pos);
    world.add(group);
    addMesh(group, new THREE.CylinderGeometry(0.18, 0.3, 2.6, 8), materials.wood, 0, 1.3, 0);
    const paper = new THREE.Group();
    paper.position.y = 2.3;
    group.add(paper);
    addMesh(paper, new THREE.ConeGeometry(0.75, 0.4, 8), materials.wood, 0, 0.9, 0);
    const body = addMesh(paper, new THREE.CylinderGeometry(0.52, 0.44, 0.8, 8), materials.lampOff, 0, 0.4, 0);
    const tear = new THREE.Group();
    for (let side = 0; side < 4; side += 1) {
      const points = [[-0.12, 0.66], [0.03, 0.49], [-0.05, 0.42], [0.1, 0.2]]
        .map(([x, y]) => new THREE.Vector3(x, y, 0.51));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), materials.lampTear);
      line.rotation.y = side * Math.PI / 2;
      tear.add(line);
    }
    paper.add(tear);
    const core = addMesh(group, new THREE.SphereGeometry(0.21, 10, 8), materials.lampCore, 0, 2.7, 0);
    const light = new THREE.PointLight('#FFB347', 0, 13, 2);
    light.position.y = 2.9;
    group.add(light);
    const meter = new THREE.Group();
    meter.position.y = 3.7;
    group.add(meter);
    addMesh(meter, new THREE.PlaneGeometry(1.3, 0.17), materials.fuelTrack);
    const fill = addMesh(meter, new THREE.PlaneGeometry(1.2, 0.09), materials.fuelFill, 0, 0, 0.01);
    objects.lamps.set(lamp.id, { group, paper, body, tear, core, light, meter, fill });
  }
}

function syncEntities(entities, lookup, create, update) {
  const present = new Set();
  for (const [index, entity] of entities.entries()) {
    present.add(entity.id);
    let object = lookup.get(entity.id);
    if (!object) {
      object = create(entity);
      lookup.set(entity.id, object);
      world.add(object);
    }
    update(entity, object, index);
  }
  for (const [id, object] of lookup) {
    if (present.has(id)) continue;
    world.remove(object);
    disposeObject(object);
    lookup.delete(id);
  }
}

function syncScene(now) {
  if (!game) return;
  const { pos, invuln } = game.player;
  player.position.set(...pos);
  player.visible = settings.reducedMotion || !invuln || Math.floor(now / 90) % 2 === 0;
  const walking = active && ['forward', 'left', 'back', 'right'].some(action => activeKey(action));
  player.rotation.y = yaw + (walking ? Math.atan2(Number(activeKey('left')) - Number(activeKey('right')),
    Number(activeKey('forward')) - Number(activeKey('back'))) : 0);
  syncEntities(game.motes, objects.motes, () => {
    const mote = new THREE.Group();
    addMesh(mote, new THREE.IcosahedronGeometry(0.16, 1), materials.mote);
    return mote;
  }, (mote, object, index) => {
    object.position.set(mote.pos[0], mote.pos[1] + 0.22 + Math.sin(now / 320 + index) * 0.06, mote.pos[2]);
    object.rotation.y = now / 900 + index;
  });
  syncEntities(game.shades, objects.shades, () => {
    const shade = new THREE.Group();
    addMesh(shade, new THREE.SphereGeometry(0.62, 12, 8), materials.shade);
    const outline = addMesh(shade, new THREE.SphereGeometry(0.66, 12, 8), new THREE.MeshBasicMaterial({
      color: '#7A3CFF', wireframe: true, transparent: true, opacity: 0.42
    }));
    outline.position.y = 0;
    for (const x of [-0.2, 0.2]) addMesh(shade, new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#7A3CFF' }), x, 0.12, 0.54);
    return shade;
  }, (shade, object, index) => {
    object.position.set(shade.pos[0], shade.pos[1] + 0.72 + Math.sin(now / 230 + index) * 0.1, shade.pos[2]);
    object.rotation.y = Math.atan2(game.player.pos[0] - shade.pos[0], game.player.pos[2] - shade.pos[2]);
    object.children[0].material = shade.state === 'stunned' ? materials.stunned : materials.shade;
    for (const accent of object.children.slice(1)) accent.material.color.set(shadeAccent());
  });
  syncEntities(game.drifters, objects.drifters, () => {
    const group = new THREE.Group();
    const ribbon = addMesh(group, new THREE.TorusKnotGeometry(0.42, 0.075, 48, 6, 2, 3), materials.drifter);
    ribbon.rotation.x = Math.PI / 2;
    return group;
  }, (drifter, object, index) => {
    object.position.set(drifter.pos[0], drifter.pos[1] + 1.05 + Math.sin(now / 280 + index) * 0.2, drifter.pos[2]);
    object.rotation.y += 0.025;
  });
  syncEntities(game.charms.filter(charm => charm.available), objects.charms, () => {
    const charm = new THREE.Group();
    addMesh(charm, new THREE.TetrahedronGeometry(0.3), materials.charm);
    addMesh(charm, new THREE.SphereGeometry(0.1, 8, 6), materials.lampCore, 0, 0, 0);
    return charm;
  }, (charm, object, index) => {
    object.position.set(charm.pos[0], charm.pos[1] + 0.55 + Math.sin(now / 330 + index) * 0.1, charm.pos[2]);
    object.rotation.y = now / 500;
  });
  camera.position.set(pos[0] - 9 * Math.sin(yaw), pos[1] + 6, pos[2] - 9 * Math.cos(yaw));
  camera.lookAt(pos[0] + 3 * Math.sin(yaw), pos[1] + 1.25, pos[2] + 3 * Math.cos(yaw));
  let lit = 0;
  for (const lamp of game.lanterns) {
    const view = objects.lamps.get(lamp.id);
    const fuel = lanternFuel(lamp);
    const low = lamp.lit && fuel < tuning.low_fuel_threshold;
    const bright = settings.reducedMotion || !low || now % 1000 < 500;
    view.body.material = lamp.lit && bright ? materials.lampOn : materials.lampOff;
    view.paper.scale.y = lamp.lit ? 1 : 0.8;
    view.tear.visible = !lamp.lit;
    view.core.visible = lamp.lit && bright;
    view.light.intensity = lamp.lit ? (bright ? 38 : 12) : 0;
    view.meter.visible = lamp.lit && bright;
    view.meter.quaternion.copy(camera.quaternion);
    view.fill.scale.x = fuel / tuning.fuel_max;
    view.fill.position.x = 0.6 * (view.fill.scale.x - 1);
    lit += Number(lamp.lit);
  }
  ambient.intensity = 0.15 + 0.55 * lit / game.lanterns.length;
  const pulseAge = (now - pulseAt) / 440;
  pulseRing.visible = !settings.reducedMotion && pulseAge >= 0 && pulseAge < 1;
  if (pulseRing.visible) {
    pulseRing.position.set(pos[0], pos[1] + 0.12, pos[2]);
    pulseRing.scale.setScalar(Math.max(0.05, pulseAge * tuning.pulse_radius));
    pulseRing.material.opacity = 1 - pulseAge;
  }
  updateHud(lit);
}

function updateHud(lit) {
  const p = game.player;
  const remaining = Math.max(0, Math.ceil(game.time));
  ui.night.textContent = `Đêm ${game.night} · ${nightInfo[game.night - 1].island}`;
  const warningIcon = remaining <= 30 && settings.accessiblePalette ? '⚠ ' : '';
  ui.timer.textContent = `${warningIcon}${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  ui.timer.classList.toggle('urgent', remaining <= 30);
  ui.flames.textContent = '◆'.repeat(p.flames) + '◇'.repeat(Math.max(0, tuning.flames - p.flames));
  const near = nearbyLantern(game);
  const required = Math.ceil(tuning.win_ratio * game.lanterns.length);
  ui.lanterns.textContent = `Đèn ${lit}/${game.lanterns.length} · Bình minh cần ${required}`;
  ui.score.textContent = `${scoreBase + game.score} điểm`;
  const capacity = carryCapacity(tuning, p.successfulLights);
  moteCount.textContent = `Đom đóm ${p.carried}/${capacity}`;
  moteSlots.forEach((slot, index) => {
    slot.hidden = index >= capacity;
    slot.classList.toggle('filled', index < p.carried);
  });
  dashAbility.textContent = `⇢ Lướt ${p.charmTicks ? '∞' : `${(p.dashCd / HZ).toFixed(1)}s`}`;
  dashAbility.classList.toggle('cooldown', p.dashCd > 0);
  pulseAbility.textContent = `✦ Tỏa sáng ${(p.pulseCd / HZ).toFixed(1)}s`;
  pulseAbility.classList.toggle('cooldown', p.pulseCd > 0);
  const prompts = [];
  if (near && active) {
    const cost = lanternCost(tuning, near);
    prompts.push(near.lit
      ? `${keyName(bindings.interact)} — Châm dầu · ${near.id} còn ${Math.floor(lanternFuel(near))}/${tuning.fuel_max}`
      : `${keyName(bindings.interact)} — ${near.ever_lit ? 'Thắp lại' : 'Nạp ánh sáng'} · ${near.id} ${near.deposited}/${cost}`);
  }
  ui.prompt.textContent = prompts.join(' · ');
  const cycle = game.simTick % 1800;
  const warning = game.night === 3 && cycle >= 1680 && cycle < 1800;
  const windMessage = warning ? '🍃 Lá bay báo trước: gió mạnh sắp đến 🍃' : game.wind.active ? 'Gió mạnh đang thổi' : '';
  if (ui.wind.textContent !== windMessage) ui.wind.textContent = windMessage;
  ui.wind.classList.toggle('visible', Boolean(ui.wind.textContent));
  const notices = [];
  const low = game.lanterns.filter(lamp => lamp.lit && lanternFuel(lamp) < tuning.low_fuel_threshold);
  if (low.length) notices.push(`Đèn sắp cạn dầu (${low.map(lamp => lamp.id).join(', ')})`);
  if (remaining <= 10 && remaining > 0) notices.push(`Còn ${remaining} giây`);
  const newShade = shadeNotice && game.simTick < shadeNotice.until && shadeNotice.pos;
  if (newShade) notices.push('Bóng Mực xuất hiện');
  const message = active ? notices.join(' · ') : '';
  if (byId('subtitles').textContent !== message) byId('subtitles').textContent = message;
  positionArrow(byId('shade-arrow'), newShade, 1, true);
  updateTarget();
}

function updateTarget() {
  const target = game.lanterns.filter(lamp => !lamp.lit || lanternFuel(lamp) < tuning.low_fuel_threshold)
    .sort((a, b) => distanceXZ(game.player.pos, a.pos) - distanceXZ(game.player.pos, b.pos))[0];
  positionArrow(ui.target, target?.pos, 2.4);
}

function positionArrow(arrow, pos, height, alwaysAtEdge = false) {
  arrow.hidden = !pos || !active;
  if (arrow.hidden) return;
  const projected = new THREE.Vector3(pos[0], pos[1] + height, pos[2]).project(camera);
  const offscreen = projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 0.88 || Math.abs(projected.y) > 0.86;
  arrow.hidden = !offscreen && !alwaysAtEdge;
  if (arrow.hidden) return;
  const sign = projected.z > 1 ? -1 : 1;
  const dx = sign * projected.x;
  const dy = -sign * projected.y;
  const scale = alwaysAtEdge ? 1 / Math.max(Math.abs(dx), Math.abs(dy), 0.001) : 1;
  arrow.style.left = `${Math.max(5, Math.min(95, 50 + dx * scale * 45))}%`;
  arrow.style.top = `${Math.max(12, Math.min(82, 50 + dy * scale * 38))}%`;
  arrow.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
}

function distanceXZ(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function showOverlay(title, message, buttons, { eyebrow = '', showSettings = false } = {}) {
  active = false;
  capturingKey = undefined;
  byId('leaderboard').hidden = true;
  byId('save-score').hidden = true;
  byId('shade-arrow').hidden = true;
  byId('subtitles').textContent = '';
  keys.clear();
  taps.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  ui.overlay.hidden = false;
  ui.eyebrow.textContent = eyebrow;
  ui.headline.textContent = title;
  ui.message.textContent = message;
  ui.settings.hidden = !showSettings;
  ui.buttons.replaceChildren();
  for (const { label, action, secondary = false, disabled = false, ariaLabel } of buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
    if (secondary) button.classList.add('secondary');
    button.addEventListener('click', action);
    ui.buttons.append(button);
  }
  ui.overlay.hidden = false;
}

function showMenu() {
  totalScore = 0;
  nightsWon = 0;
  runSeed = undefined;
  scoreBase = 0;
  night = 1;
  game = undefined;
  ui.target.hidden = true;
  const nightButtons = nightInfo.map((info, index) => {
    const level = index + 1;
    const unlocked = level <= highestUnlockedNight;
    return {
      label: `Đêm ${level} — ${info.island} ${unlocked ? '🔓' : '🔒'}`,
      action: () => showIntro(level),
      disabled: !unlocked,
      ariaLabel: `Đêm ${level} — ${info.island}, ${unlocked ? 'đã mở khóa' : 'đang khóa'}`
    };
  });
  showOverlay('Đảo Đèn Lồng', 'Chọn Đêm đã mở khóa. Hoàn thành một Đêm để mở khóa Đêm tiếp theo.', [
    ...nightButtons,
    { label: 'Bảng xếp hạng', action: showLeaderboard, secondary: true },
    { label: 'Cài đặt', action: showSettings, secondary: true }
  ], { eyebrow: `Đã mở khóa ${highestUnlockedNight}/3 Đêm` });
}

function showIntro(level) {
  if (level < 1 || level > highestUnlockedNight) {
    showMenu();
    return;
  }
  night = level;
  const info = nightInfo[level - 1];
  showOverlay(info.title, `${info.line} Hãy giữ ít nhất ${[3, 4, 5][level - 1]} đèn sáng tới bình minh.`, [
    { label: `Bắt đầu Đêm ${level}`, action: () => startNight(level) },
    { label: 'Về menu', action: showMenu, secondary: true }
  ], { eyebrow: 'Lời Ông Đăng' });
}

function startNight(level) {
  night = level;
  scoreBase = totalScore;
  const seed = 1212 + level;
  runSeed ??= seed;
  game = createGame(tuning, seed, level);
  shadeNotice = undefined;
  yaw = 0;
  elapsed = 0;
  lastCountdown = 11;
  pulseAt = -Infinity;
  clearEntityMaps();
  buildMap(level);
  active = true;
  ui.overlay.hidden = true;
  ui.target.hidden = true;
  startMusic();
  syncScene(performance.now());
}

function clearEntityMaps() {
  for (const collection of Object.values(objects)) {
    for (const object of collection.values()) {
      const root = object.group ?? object;
      world.remove(root);
      disposeObject(root);
    }
    collection.clear();
  }
}

function showResult() {
  const won = game.state === 'won';
  const info = nightInfo[night - 1];
  if (won) {
    totalScore += game.score;
    nightsWon += 1;
    if (night < 3 && highestUnlockedNight < night + 1) {
      highestUnlockedNight = night + 1;
      localStorage.setItem('lantern-unlocked-night', String(highestUnlockedNight));
    }
  }
  if (!won) {
    showOverlay('Đêm chưa trọn', `Mây đã đạt ${game.score} điểm. Bạn có thể thử lại Đêm ${night}.`, [
      { label: `Chơi lại Đêm ${night}`, action: () => showIntro(night) },
      { label: 'Về menu', action: showMenu, secondary: true }
    ], { eyebrow: info.title });
    showScoreForm();
    return;
  }
  if (night < 3) {
    showOverlay('Đảo sáng tới bình minh!', `${info.island} còn ${game.lanterns.filter(lamp => lamp.lit).length} đèn sáng. Điểm đêm này: ${game.score}.`, [
      { label: `Tiếp tục Đêm ${night + 1}`, action: () => showIntro(night + 1) },
      { label: 'Về menu', action: showMenu, secondary: true }
    ], { eyebrow: `Tổng điểm ${totalScore}` });
    return;
  }
  showOverlay('Bình Minh', `Ba hòn đảo đã sáng. Tổng điểm hành trình: ${totalScore}.`, [
    { label: 'Chơi lại hành trình', action: () => { totalScore = 0; nightsWon = 0; runSeed = undefined; showIntro(1); } },
    { label: 'Về menu', action: showMenu, secondary: true }
  ], { eyebrow: 'Đêm 3 hoàn tất' });
  showScoreForm();
}

function showScoreForm() {
  const form = byId('save-score');
  form.reset();
  form.querySelector('button').disabled = false;
  byId('save-status').textContent = '';
  form.hidden = false;
}

async function saveScore(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/leaderboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: new FormData(form).get('name'), score: totalScore, nights_won: nightsWon, seed: runSeed })
    });
    if (!response.ok) throw new Error();
    byId('save-status').textContent = 'Đã lưu điểm.';
  } catch {
    byId('save-status').textContent = 'Chưa lưu được điểm. Hãy thử lại.';
    button.disabled = false;
  }
}

async function showLeaderboard() {
  showOverlay('Bảng xếp hạng', 'Đang tải…', [{ label: 'Về menu', action: showMenu }]);
  try {
    const response = await fetch('/api/leaderboard');
    if (!response.ok) throw new Error();
    const { entries } = await response.json();
    if (ui.headline.textContent !== 'Bảng xếp hạng') return;
    const list = byId('leaderboard');
    list.replaceChildren(...entries.map(entry => {
      const item = document.createElement('li');
      item.textContent = `${entry.name} · ${entry.score} điểm · ${entry.nights_won}/3 Đêm`;
      return item;
    }));
    list.hidden = entries.length === 0;
    ui.message.textContent = entries.length ? '' : 'Chưa có điểm nào.';
  } catch {
    if (ui.headline.textContent === 'Bảng xếp hạng') ui.message.textContent = 'Chưa tải được bảng xếp hạng.';
  }
}

function showPause() {
  showOverlay('Tạm dừng', 'Đêm đang dừng. Thời gian và các bộ đếm sẽ tiếp tục khi bạn quay lại.', [
    { label: 'Tiếp tục', action: resumeGame },
    { label: `Chơi lại Đêm ${night}`, action: () => showIntro(night), secondary: true },
    { label: 'Cài đặt', action: showSettings, secondary: true },
    { label: 'Về menu', action: showMenu, secondary: true }
  ], { eyebrow: `Đêm ${night}` });
}

function resumeGame() {
  if (game?.state === 'paused') {
    game.previousInput.pause = false;
    step(game, { move: [0, 0], cam_yaw_deg: yaw * 180 / Math.PI, jump: false, dash: false,
      interact: false, pulse: false, pause: true });
    game.previousInput = { move: [0, 0], cam_yaw_deg: yaw * 180 / Math.PI, jump: false,
      dash: false, interact: false, pulse: false, pause: false };
  }
  active = true;
  ui.overlay.hidden = true;
}

function showSettings() {
  showOverlay('Cài đặt', 'Các lựa chọn được lưu trên thiết bị này.', [
    { label: 'Quay lại', action: () => game?.state === 'paused' ? showPause() : showMenu() }
  ], { eyebrow: 'Âm thanh · Điều khiển', showSettings: true });
}

function startMusic() {
  if (!audio) {
    audio = new AudioContext();
    musicGain = audio.createGain();
    musicGain.gain.value = settings.volume * 0.12;
    musicGain.connect(audio.destination);
  }
  if (!musicTimer) {
    const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 349.23, 440, 523.25, 440, 349.23];
    musicTimer = window.setInterval(() => {
      if (!audio || audio.state !== 'running' || settings.volume <= 0) return;
      const oscillator = audio.createOscillator();
      const filter = audio.createBiquadFilter();
      const envelope = audio.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = notes[musicNote % notes.length];
      musicNote += 1;
      filter.type = 'lowpass';
      filter.frequency.value = 1600;
      envelope.gain.setValueAtTime(0.0001, audio.currentTime);
      envelope.gain.exponentialRampToValueAtTime(0.32, audio.currentTime + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.34);
      oscillator.connect(filter);
      filter.connect(envelope);
      envelope.connect(musicGain);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        filter.disconnect();
        envelope.disconnect();
      }, { once: true });
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.36);
    }, 400);
  }
  if (audio.state === 'suspended') audio.resume();
}

function sound(name) {
  if (!audio || settings.volume <= 0) return;
  const notes = {
    mote_picked: [740, 0.08], deposit: [420, 0.12], refuel: [420, 0.12], lantern_lit: [880, 0.28],
    pulse: [290, 0.16], player_hit: [115, 0.28], dash: [560, 0.09],
    shade_spawned: [180, 0.32], charm_picked: [980, 0.2], won: [660, 0.45],
    lost: [140, 0.55], countdown: [520, 0.12], jump: [360, 0.08], warning: [260, 0.25]
  };
  const [frequency, duration] = notes[name] ?? [330, 0.1];
  const oscillator = audio.createOscillator();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  filter.type = 'lowpass';
  filter.frequency.value = name === 'player_hit' ? 450 : 1800;
  const now = audio.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(settings.volume * 0.02, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  oscillator.addEventListener('ended', () => {
    oscillator.disconnect();
    filter.disconnect();
    gain.disconnect();
  }, { once: true });
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function handleEvents(events) {
  for (const event of events) {
    if (event.name === 'mote_picked' || event.name === 'lantern_lit' || event.name === 'pulse'
      || event.name === 'player_hit' || event.name === 'dash' || event.name === 'shade_spawned'
      || event.name === 'charm_picked' || event.name === 'deposit' || event.name === 'refuel') sound(event.name);
    if (event.name === 'pulse') pulseAt = performance.now();
    if (event.name === 'shade_spawned') {
      const shade = game.shades.find(item => item.id === event.data.id);
      if (shade) shadeNotice = { pos: [...shade.pos], until: game.simTick + 3 * HZ };
    }
    if (event.name === 'paused') showPause();
    if (event.name === 'game_over') {
      sound(game.state === 'won' ? 'won' : 'lost');
      showResult();
    }
  }
}

function frame(now) {
  const secondsElapsed = Math.min(0.12, (now - previousTime) / 1000);
  previousTime = now;
  if (active && game) {
    elapsed += secondsElapsed;
    while (active && elapsed >= 1 / HZ) {
      elapsed -= 1 / HZ;
      yaw += (Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight'))) * 1.8 / HZ;
      // With +Z forward, screen-right is -X, so invert the lateral key axis.
      const x = Number(activeKey('left')) - Number(activeKey('right'));
      const z = Number(activeKey('forward')) - Number(activeKey('back'));
      const pressed = action => activeKey(action) || activeKey(action, taps);
      if (activeKey('jump', taps) && game.player.grounded) sound('jump');
      const events = step(game, {
        move: [x, z], cam_yaw_deg: yaw * 180 / Math.PI,
        jump: pressed('jump'), dash: pressed('dash'), interact: pressed('interact'), pulse: pressed('pulse'),
        pause: activeKey('pause', taps)
      });
      taps.clear();
      handleEvents(events);
      if (game.night === 3 && game.simTick % 1800 === 1680) sound('warning');
      if (game.time <= 10 && game.time > 0 && Math.ceil(game.time) < lastCountdown) {
        lastCountdown = Math.ceil(game.time);
        sound('countdown');
      }
    }
  } else {
    elapsed = 0;
  }
  syncScene(now);
  renderer.render(scene, camera);
  frameCount += 1;
  if (now - fpsStart >= 5000) {
    ui.fps.textContent = `FPS avg ${Math.round(frameCount * 1000 / (now - fpsStart))}`;
    frameCount = 0;
    fpsStart = now;
  }
  requestAnimationFrame(frame);
}

function benchmarkFrame(now) {
  const first = benchmark.first ??= now;
  const last = benchmark.last ?? now;
  benchmark.last = now;
  elapsed += (now - last) / 1000;
  while (elapsed >= 1 / HZ) {
    stepBenchmark(game);
    elapsed -= 1 / HZ;
  }
  syncScene(now);
  const angle = (now - first) / 15000 * 2 * Math.PI;
  camera.position.set(30 * Math.cos(angle), 15, 30 * Math.sin(angle));
  camera.lookAt(0, 0, 0);
  for (const lamp of objects.lamps.values()) lamp.meter.quaternion.copy(camera.quaternion);
  renderer.render(scene, camera);
  benchmark.loadedAt ??= Date.now();
  if (now - first >= 3000 && now > last) benchmark.times.push(now - last);
  if (now - first < 3000 + benchmark.duration) {
    requestAnimationFrame(benchmarkFrame);
  } else {
    reportBenchmark({
        loadedAt: benchmark.loadedAt, times: benchmark.times,
        width: innerWidth, height: innerHeight, renderer: `Three.js r${THREE.REVISION} WebGL2`
    });
  }
}

load().catch(error => {
  if (benchmark) reportBenchmark({ error: String(error) });
  ui.headline.textContent = 'Không mở được game';
  ui.message.textContent = 'Kiểm tra trình duyệt WebGL 2, kết nối và cấu hình game.';
  ui.buttons.replaceChildren();
  ui.overlay.hidden = false;
  console.error(error);
});
