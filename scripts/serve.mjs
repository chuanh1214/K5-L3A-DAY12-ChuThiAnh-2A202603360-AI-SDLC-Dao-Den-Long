import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const contentTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const port = Number(process.env.PORT ?? 4173);

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
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
}).listen(port, '127.0.0.1', () => console.log(`Đảo Đèn Lồng: http://127.0.0.1:${port}`));
