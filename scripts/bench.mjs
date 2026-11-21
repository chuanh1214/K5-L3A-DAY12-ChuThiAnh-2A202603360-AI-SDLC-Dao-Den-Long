import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { platform, release, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createGameServer } from './serve.mjs';

const started = Date.now();
const { values } = parseArgs({ options: {
  seed: { type: 'string' }, duration: { type: 'string' }, out: { type: 'string' }
} });
const seed = Number(values.seed);
const duration = Number(values.duration);
if (!Number.isSafeInteger(seed) || !Number.isFinite(duration) || duration <= 0 || !values.out) {
  throw new Error('Usage: --seed 42 --duration 30 --out bench.json');
}
const names = ['chrome', 'google-chrome', 'chromium', 'chromium-browser', 'msedge'];
const browser = process.env.LANTERN_BROWSER ?? [
  ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap(directory => ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe']
      .map(name => join(directory, name))),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ...(process.env.PATH ?? '').split(delimiter).flatMap(directory => names.map(name => join(directory, name)))
].find(existsSync);
if (!browser) throw new Error('Install Chrome/Chromium or set LANTERN_BROWSER to its executable');

const profile = await mkdtemp(join(tmpdir(), 'lantern-bench-'));
let browserProcess;
let timeout;
let acceptReport;
let rejectReport;
const result = new Promise((resolve, reject) => { acceptReport = resolve; rejectReport = reject; });
const server = createGameServer({ report: acceptReport });
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const headless = process.env.LANTERN_BENCH_HEADLESS === '1';
  const args = headless ? ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
    : ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  const url = `http://127.0.0.1:${server.address().port}/?bench=1&seed=${seed}&duration=${duration}`;
  const size = !headless && platform() === 'win32' ? '1296,759' : '1280,720';
  browserProcess = spawn(browser, [...args, '--no-first-run', '--no-default-browser-check',
    '--force-device-scale-factor=1', '--user-data-dir=' + profile, '--window-size=' + size, '--app=' + url], { stdio: 'ignore' });
  browserProcess.once('error', rejectReport);
  browserProcess.once('exit', code => rejectReport(new Error(`Browser exited before reporting (${code})`)));
  timeout = setTimeout(() => rejectReport(new Error('Benchmark timed out')), (duration + 45) * 1000);
  const { times, width, height, loadedAt, renderer, error } = await result;
  if (error) throw new Error(error);
  if (!times?.length || !times.every(value => Number.isFinite(value) && value > 0)) throw new Error('No valid frames');
  const frames = times.length;
  const sorted = [...times].sort((a, b) => a - b);
  const slowest = sorted.slice(-Math.max(1, Math.ceil(frames * 0.01)));
  const sum = values => values.reduce((total, value) => total + value, 0);
  const report = {
    contract_version: '1.3', avg_fps: 1000 * frames / sum(times),
    p1_low_fps: 1000 * slowest.length / sum(slowest),
    frame_ms_p95: sorted[Math.ceil(frames * 0.95) - 1], frames, load_ms: loadedAt - started,
    peak_mem_mb: null, vsync_off: false,
    renderer: `${renderer} (${headless ? 'SwiftShader headless' : 'windowed Chromium'})`,
    os: `${platform()} ${release()}`, viewport: [width, height]
  };
  await writeFile(values.out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  clearTimeout(timeout);
  browserProcess?.kill();
  server.closeAllConnections();
  server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 2 }).catch(() => {});
}
