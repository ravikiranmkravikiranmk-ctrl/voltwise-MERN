/**
 * Seed the database with the sample schedule from the original project.
 * Usage: npm run seed
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseScheduleCsv } from '@voltwise/engine';

import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { projectRepository, storeKind } from '../src/repositories/projectRepository.js';
import { buildReport } from '../src/services/estimateService.js';

const here = dirname(fileURLToPath(import.meta.url));
const csv = await readFile(join(here, '../../samples/sample_loads_v2.csv'), 'utf8');
const loads = parseScheduleCsv(csv);

await connectDatabase();
const settings = { voltage: 415, diversityFactor: 1.15, derating: 0.9, cableLengthM: 60 };
const project = await projectRepository.create({
  name: 'Sample apartment block',
  client: 'Demo',
  site: 'Bengaluru',
  engineer: '',
  status: 'draft',
  notes: 'Seeded from samples/sample_loads_v2.csv',
  loads,
  settings,
  lastReport: buildReport({ loads, settings }),
  revision: 1,
  revisions: [{ rev: 1, savedAt: new Date().toISOString(), note: 'Seeded', name: 'Sample apartment block', loads, settings, summary: null }],
});
console.log(`Seeded project ${project.id} into the ${storeKind()} store`);
await disconnectDatabase();
