import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { buildReport } from '../services/estimateService.js';
import { validateProjectInput } from '../middleware/validateProject.js';

export const estimateRouter = Router();

/** POST /api/estimate — stateless calculation, nothing is stored. */
estimateRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { loads = [], settings = {} } = validateProjectInput(
      { name: 'adhoc', ...req.body },
      { partial: true },
    );
    res.json(buildReport({ loads, settings }));
  }),
);
