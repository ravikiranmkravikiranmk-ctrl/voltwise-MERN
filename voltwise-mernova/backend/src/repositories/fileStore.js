import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Tiny JSON-file store used when MONGO_URI is not set.
 * Keeps the API runnable with zero infrastructure (demo, CI, offline laptop)
 * while exposing exactly the same interface as the Mongoose repository.
 */
export function createFileStore(dataDir) {
  const file = join(dataDir, 'projects.json');
  let cache = null;

  const load = async () => {
    if (cache) return cache;
    try {
      cache = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      cache = [];
    }
    return cache;
  };

  const persist = async (projects) => {
    cache = projects;
    await mkdir(dataDir, { recursive: true });
    const temporaryFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(projects, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryFile, file);
  };

  return {
    kind: 'file',
    async list({ limit = 50, q = '', status = '' } = {}) {
      const all = await load();
      const needle = q.trim().toLowerCase();
      return all
        .filter((p) => !status || p.status === status)
        .filter((p) => !needle || [p.name, p.client, p.site, p.engineer]
          .some((v) => String(v || '').toLowerCase().includes(needle)))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, limit);
    },
    async findById(id) {
      return (await load()).find((p) => p.id === id) || null;
    },
    async create(data) {
      const all = await load();
      const now = new Date().toISOString();
      const project = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
      all.push(project);
      await persist(all);
      return project;
    },
    async update(id, patch) {
      const all = await load();
      const index = all.findIndex((p) => p.id === id);
      if (index === -1) return null;
      all[index] = { ...all[index], ...patch, id, updatedAt: new Date().toISOString() };
      await persist(all);
      return all[index];
    },
    async remove(id) {
      const all = await load();
      const next = all.filter((p) => p.id !== id);
      if (next.length === all.length) return false;
      await persist(next);
      return true;
    },
  };
}
