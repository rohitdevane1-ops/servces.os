import { buildApp } from './app.js';
import { env } from './config/env.js';
import { outboxWorker } from './workers/outbox.worker.js';

async function start() {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down server and outbox worker...');
    outboxWorker.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    if (env.OUTBOX_WORKER_ENABLED === 'true') {
      outboxWorker.start();
    }
    console.log(`================================================================`);
    console.log(` ServicePro OS — Fastify Enterprise API Server running!        `);
    console.log(` Listening on: http://${env.HOST}:${env.PORT}                   `);
    console.log(` OpenAPI 3.1 Swagger Docs: http://${env.HOST}:${env.PORT}/docs   `);
    console.log(` Health Check: http://${env.HOST}:${env.PORT}/health             `);
    console.log(`================================================================`);
  } catch (err) {
    outboxWorker.stop();
    app.log.error(err);
    process.exit(1);
  }
}

start();
