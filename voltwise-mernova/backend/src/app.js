import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import cors from 'cors';

import { API_ENDPOINTS, apiRouter } from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { config } from './config/env.js';

const here = dirname(fileURLToPath(import.meta.url));

/** The React build, if `npm run build` has been run (or WEB_DIST points at it). */
export function webDistDir() {
  const candidates = [
    process.env.WEB_DIST,
    resolve(here, '../../web/dist'),
    resolve(process.cwd(), 'web/dist'),
  ].filter(Boolean);
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) || null;
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin.length ? config.corsOrigin : true }));
  app.use(express.json({ limit: '2mb' }));
  // Raw text parser so the CSV importer can take a text/csv body directly.
  app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }));

  app.use('/api', apiRouter);

  // One port for everything: serve the built React app when it exists.
  const dist = webDistDir();
  if (dist) {
    app.use(express.static(dist, { index: false, maxAge: '7d' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(join(dist, 'index.html'));
    });
  } else {
    // No build yet — say so instead of a bare 404.
    app.get('/', (req, res) => {
      res.json({
        name: 'Voltwise API',
        note: 'The web app is not built, so there is no UI on this port yet. '
          + 'Either run the dev server (npm run dev:web, http://localhost:5173) '
          + 'or build it once (npm run build) and reload this page.',
        docs: '/api',
        endpoints: API_ENDPOINTS,
      });
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
