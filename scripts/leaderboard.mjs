import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.env.LANTERN_LEADERBOARD_PATH
  ? resolve(process.env.LANTERN_LEADERBOARD_PATH)
  : fileURLToPath(new URL('../.lantern-data/leaderboard.json', import.meta.url));
let pending = Promise.resolve();

export async function readLeaderboard() {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { entries: [] };
    throw error;
  }
}

export function addLeaderboardEntry(input) {
  const { name, score, nights_won, seed } = input ?? {};
  if (typeof name !== 'string' || !/^[A-Za-z0-9_]{3,12}$/.test(name)
    || !Number.isSafeInteger(score) || score < 0 || !Number.isInteger(nights_won)
    || nights_won < 0 || nights_won > 3 || !Number.isSafeInteger(seed)) {
    throw new TypeError('Invalid leaderboard entry');
  }
  const update = pending.then(async () => {
    const board = await readLeaderboard();
    board.entries.push({ name, score, nights_won, achieved_at: new Date().toISOString(), seed });
    board.entries.sort((a, b) => b.score - a.score || a.achieved_at.localeCompare(b.achieved_at));
    board.entries = board.entries.slice(0, 10);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file + '.tmp', JSON.stringify(board, null, 2) + '\n');
    await rename(file + '.tmp', file);
    return board;
  });
  pending = update.catch(() => {});
  return update;
}
