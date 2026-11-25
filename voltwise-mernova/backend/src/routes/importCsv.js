import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError, parseScheduleCsv, toScheduleCsv } from '@voltwise/engine';

export const importRouter = Router();

/**
 * POST /api/import/csv
 * Accepts either `text/csv` body or JSON `{ "csv": "..." }`.
 * Returns the parsed load rows plus the normalised CSV.
 */
importRouter.post(
  '/csv',
  asyncHandler(async (req, res) => {
    const text = typeof req.body === 'string' ? req.body : req.body?.csv;
    if (typeof text !== 'string' || !text.trim()) {
      throw new ValidationError('Send the CSV as a text/csv body or as JSON { "csv": "..." }');
    }
    const loads = parseScheduleCsv(text);
    res.json({ loads, count: loads.length, csv: toScheduleCsv(loads) });
  }),
);

/** GET /api/import/template — the header the importer expects. */
importRouter.get('/template', (req, res) => {
  res.type('text/csv').send(toScheduleCsv([
    { name: 'Borewell pumps', quantity: 4, ratedKw: 7.5, powerFactor: 0.82, demandFactor: 0.75, phases: 3 },
    { name: 'Lighting', quantity: 1, ratedKw: 12, powerFactor: 0.95, demandFactor: 0.9, phases: 1 },
  ]));
});
