import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { storeKind } from './repositories/projectRepository.js';

async function main() {
  const usingMongo = await connectDatabase();
  if (!usingMongo) {
    console.warn(
      `[db] MONGO_URI is not set — using the JSON file store in ${config.dataDir}. ` +
        'Set MONGO_URI to run on MongoDB.',
    );
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[api] Voltwise API on http://localhost:${config.port} (store: ${storeKind()})`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[api] failed to start', err);
  process.exit(1);
});
