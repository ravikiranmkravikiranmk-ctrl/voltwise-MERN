import { ValidationError, toLoads } from '@voltwise/engine';

const NUMERIC_SETTINGS = [
  'voltage', 'phases', 'diversityFactor', 'derating', 'maxVdPct',
  'cableLengthM', 'maxRuns', 'maxLoading', 'futureMargin',
  'targetPf', 'branchLengthM', 'faultKa', 'faultTimeS',
];

const LIMITS = {
  voltage: [100, 11000],
  diversityFactor: [1, 5],
  derating: [0.1, 1],
  maxVdPct: [0.5, 10],
  cableLengthM: [1, 5000],
  maxRuns: [1, 8],
  maxLoading: [0.2, 1],
  futureMargin: [0, 1],
  targetPf: [0.8, 1],
  branchLengthM: [1, 5000],
  faultKa: [0, 200],
  faultTimeS: [0.01, 5],
};

function cleanSettings(input = {}) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ValidationError('settings must be an object');
  }
  const out = {};
  for (const key of NUMERIC_SETTINGS) {
    if (input[key] === undefined || input[key] === '') continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value)) throw new ValidationError(`settings.${key} must be a number`);
    if (key === 'phases' && value !== 1 && value !== 3) {
      throw new ValidationError('settings.phases must be 1 or 3');
    }
    const range = LIMITS[key];
    if (range && (value < range[0] || value > range[1])) {
      throw new ValidationError(`settings.${key} must be between ${range[0]} and ${range[1]}`);
    }
    out[key] = value;
  }
  if (input.conductor !== undefined) {
    if (!['cu', 'al'].includes(input.conductor)) throw new ValidationError('settings.conductor must be "cu" or "al"');
    out.conductor = input.conductor;
  }
  return out;
}

/** Validate and normalise a project payload coming from any client. */
export function validateProjectInput(body = {}, { partial = false } = {}) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  const out = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ValidationError('Project name is required');
    if (name.length > 160) throw new ValidationError('Project name must be 160 characters or less');
    out.name = name;
  } else if (!partial) {
    throw new ValidationError('Project name is required');
  }

  for (const key of ['client', 'site', 'engineer']) {
    if (body[key] !== undefined) out[key] = String(body[key]).trim().slice(0, 160);
  }
  if (body.notes !== undefined) out.notes = String(body.notes).slice(0, 4000);
  if (body.status !== undefined) {
    if (!['draft', 'review', 'final'].includes(body.status)) {
      throw new ValidationError('status must be draft, review or final');
    }
    out.status = body.status;
  }

  if (body.loads !== undefined) {
    if (!Array.isArray(body.loads)) throw new ValidationError('loads must be an array');
    if (body.loads.length > 500) throw new ValidationError('A schedule can hold at most 500 loads');
    // Constructing Load instances runs every domain rule in one place.
    out.loads = toLoads(body.loads).map((l) => {
      const { connectedKw, demandKw, demandKvar, ...stored } = l.toJSON();
      return stored;
    });
  }

  if (body.settings !== undefined) out.settings = cleanSettings(body.settings);

  return out;
}
