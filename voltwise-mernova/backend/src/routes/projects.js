import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { projectRepository } from '../repositories/projectRepository.js';
import { buildReport, reportDigest } from '../services/estimateService.js';
import { validateProjectInput } from '../middleware/validateProject.js';

export const projectsRouter = Router();

/** Keep at most this many manual-save snapshots per project. */
export const MAX_REVISIONS = 30;

/** Light version of a project for list views: no snapshots, no heavy analysis. */
function card(project) {
  const { revisions = [], lastReport, ...rest } = project;
  return {
    ...rest,
    revisionCount: revisions.length,
    digest: reportDigest(lastReport),
    lastReport: lastReport
      ? { summary: lastReport.summary, transformer: lastReport.transformer, cable: lastReport.cable, warnings: lastReport.warnings }
      : null,
  };
}

function snapshot({ rev, name, loads, settings, report, note = '' }) {
  return {
    rev,
    savedAt: new Date().toISOString(),
    note: String(note || '').slice(0, 300),
    name,
    loads,
    settings,
    summary: reportDigest(report),
  };
}

projectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 200)
      : 50;
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    const status = ['draft', 'review', 'final'].includes(req.query.status) ? req.query.status : '';
    const projects = (await projectRepository.list({ limit, q, status })).map(card);
    res.json({ projects, count: projects.length });
  }),
);

projectsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = validateProjectInput(req.body);
    const loads = payload.loads ?? [];
    const settings = payload.settings ?? {};
    const report = buildReport({ loads, settings });
    const project = await projectRepository.create({
      client: '',
      site: '',
      engineer: '',
      notes: '',
      status: 'draft',
      ...payload,
      loads,
      settings,
      lastReport: report,
      revision: 1,
      revisions: [snapshot({ rev: 1, name: payload.name, loads, settings, report, note: req.body?.revisionNote || 'Created' })],
    });
    res.status(201).json(project);
  }),
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await projectRepository.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  }),
);

/**
 * PUT /api/projects/:id
 * A normal save bumps the revision and stores a snapshot.
 * `{ "autosave": true }` only updates the working copy (no new revision).
 */
projectsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const payload = validateProjectInput(req.body, { partial: true });
    const existing = await projectRepository.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const loads = payload.loads ?? existing.loads ?? [];
    const settings = { ...(existing.settings || {}), ...(payload.settings || {}) };
    const report = buildReport({ loads, settings });
    const autosave = req.body?.autosave === true;

    const patch = { ...payload, loads, settings, lastReport: report };
    if (autosave) {
      patch.lastAutosaveAt = new Date().toISOString();
    } else {
      const rev = (existing.revision || existing.revisions?.length || 0) + 1;
      patch.revision = rev;
      patch.revisions = [
        ...(existing.revisions || []),
        snapshot({ rev, name: payload.name ?? existing.name, loads, settings, report, note: req.body?.revisionNote }),
      ].slice(-MAX_REVISIONS);
    }
    const project = await projectRepository.update(req.params.id, patch);
    res.json(project);
  }),
);

projectsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const removed = await projectRepository.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Project not found' });
    res.status(204).end();
  }),
);

/** POST /api/projects/:id/duplicate — copy as a new draft (history not copied). */
projectsRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const src = await projectRepository.findById(req.params.id);
    if (!src) return res.status(404).json({ error: 'Project not found' });
    const name = `${src.name} (copy)`.slice(0, 160);
    const report = buildReport({ loads: src.loads, settings: src.settings });
    const copy = await projectRepository.create({
      name,
      client: src.client || '',
      site: src.site || '',
      engineer: src.engineer || '',
      notes: src.notes || '',
      status: 'draft',
      loads: src.loads,
      settings: src.settings,
      lastReport: report,
      revision: 1,
      revisions: [snapshot({ rev: 1, name, loads: src.loads, settings: src.settings, report, note: `Duplicated from “${src.name}”` })],
    });
    res.status(201).json(copy);
  }),
);

/** GET /api/projects/:id/revisions — history, newest first, without load rows. */
projectsRouter.get(
  '/:id/revisions',
  asyncHandler(async (req, res) => {
    const project = await projectRepository.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const revisions = [...(project.revisions || [])]
      .reverse()
      .map(({ loads = [], settings, ...r }) => ({ ...r, loadCount: loads.length }));
    res.json({ current: project.revision || 1, revisions });
  }),
);

/** GET /api/projects/:id/revisions/:rev — a single snapshot with its loads. */
projectsRouter.get(
  '/:id/revisions/:rev',
  asyncHandler(async (req, res) => {
    const project = await projectRepository.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const found = (project.revisions || []).find((r) => r.rev === Number(req.params.rev));
    if (!found) return res.status(404).json({ error: 'Revision not found' });
    res.json(found);
  }),
);

/** POST /api/projects/:id/revisions/:rev/restore — restore as a new revision. */
projectsRouter.post(
  '/:id/revisions/:rev/restore',
  asyncHandler(async (req, res) => {
    const project = await projectRepository.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const found = (project.revisions || []).find((r) => r.rev === Number(req.params.rev));
    if (!found) return res.status(404).json({ error: 'Revision not found' });
    const report = buildReport({ loads: found.loads, settings: found.settings });
    const rev = (project.revision || project.revisions.length) + 1;
    const updated = await projectRepository.update(req.params.id, {
      loads: found.loads,
      settings: found.settings,
      lastReport: report,
      revision: rev,
      revisions: [
        ...project.revisions,
        snapshot({ rev, name: project.name, loads: found.loads, settings: found.settings, report, note: `Restored from rev ${found.rev}` }),
      ].slice(-MAX_REVISIONS),
    });
    res.json(updated);
  }),
);

/** POST /api/projects/:id/estimate — recompute and store the latest report. */
projectsRouter.post(
  '/:id/estimate',
  asyncHandler(async (req, res) => {
    const existing = await projectRepository.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const payload = validateProjectInput(
      { name: 'adhoc', ...req.body },
      { partial: true },
    );
    const loads = payload.loads ?? existing.loads ?? [];
    const settings = { ...(existing.settings || {}), ...(payload.settings || {}) };
    const report = buildReport({ loads, settings });
    await projectRepository.update(req.params.id, { loads, settings, lastReport: report });
    res.json(report);
  }),
);
