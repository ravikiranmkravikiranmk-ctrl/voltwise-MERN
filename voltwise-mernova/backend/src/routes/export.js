import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateProjectInput } from '../middleware/validateProject.js';
import { projectRepository } from '../repositories/projectRepository.js';
import { pdfBuffer, slugify, xlsxBuffer } from '../services/exportService.js';

export const exportRouter = Router();

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function fromBody(body = {}) {
  const meta = body.project && typeof body.project === 'object' ? body.project : {};
  const clean = validateProjectInput({ name: meta.name || 'Untitled project', ...meta, loads: body.loads ?? [], settings: body.settings ?? {} });
  return { project: { ...clean, revision: meta.revision }, loads: clean.loads, settings: clean.settings };
}

async function send(res, kind, input) {
  const name = slugify(input.project?.name);
  if (kind === 'pdf') {
    const buf = await pdfBuffer(input);
    res.set({ 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name}-report.pdf"` }).send(buf);
  } else {
    const buf = await xlsxBuffer(input);
    res.set({ 'content-type': XLSX, 'content-disposition': `attachment; filename="${name}-calculations.xlsx"` }).send(buf);
  }
}

/** POST /api/export/pdf | /api/export/xlsx — export the schedule in the request (saved or not). */
exportRouter.post('/:kind(pdf|xlsx)', asyncHandler(async (req, res) => send(res, req.params.kind, fromBody(req.body))));

/** GET /api/projects/:id/export.pdf | .xlsx — export a saved project. */
export const projectExportHandler = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  await send(res, req.params.kind, { project, loads: project.loads || [], settings: project.settings || {} });
});
