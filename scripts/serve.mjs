import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { addLeaderboardEntry, readLeaderboard } from './leaderboard.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const contentTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const port = Number(process.env.PORT ?? 4173);

export function createGameServer(bench = {}) {
  return createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/api/leaderboard' || (pathname === '/api/benchmark' && bench.report)) {
      try {
        if (request.method === 'GET' && pathname === '/api/leaderboard') {
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(await readLeaderboard()));
          return;
        }
        if (request.method !== 'POST' || request.headers.origin !== `http://${request.headers.host}`
          || request.headers['content-type'] !== 'application/json') {
          response.writeHead(405).end();
          return;
        }
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (body.length > (pathname === '/api/benchmark' ? 2000000 : 2000)) throw new TypeError('Request too large');
        }
        const data = JSON.parse(body);
        const result = pathname === '/api/leaderboard' ? await addLeaderboardEntry(data) : bench.report(data);
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result ?? {}));
      } catch (error) {
        response.writeHead(error instanceof SyntaxError || error instanceof TypeError ? 400 : 500).end();
      }
      return;
    }
    const name = pathname === '/' ? '/index.html' : pathname;
    const allowed = ['/index.html', '/game.contract.json'].includes(name)
      || name.startsWith('/src/') || name.startsWith('/node_modules/three/build/');
    const file = resolve(root, '.' + name);
    if (!allowed || name.split(/[\\/]/).some(segment => segment === '..' || segment === '.')
        || !file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error();
    response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' });
    const stream = createReadStream(file);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [flag, out, ...extra] = process.argv.slice(2);
  if (flag === '--export-leaderboard' && out && extra.length === 0) {
    await writeFile(out, JSON.stringify(await readLeaderboard(), null, 2) + '\n');
  } else if (flag) {
    throw new Error('Usage: npm start [-- --export-leaderboard out.json]');
  } else {
    createGameServer().listen(port, '127.0.0.1', () => console.log(`Đảo Đèn Lồng: http://127.0.0.1:${port}`));
  }
}
