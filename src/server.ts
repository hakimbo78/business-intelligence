import { buildApp } from './app.js';
import { env } from './config/environment.js';
import { disconnectDatabase } from './config/database.js';
import { logger } from './lib/logger.js';
import { queueWorker } from './queue/worker.js';

/**
 * Application entry point.
 * Starts the HTTP server and handles graceful shutdown.
 */
async function main() {
  const app = await buildApp();

  queueWorker.start();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    queueWorker.stop();
    await app.close();
    await disconnectDatabase();
    logger.info('Server shut down successfully.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`Server started`, {
      port: env.PORT,
      environment: env.NODE_ENV,
      mapProvider: env.MAP_PROVIDER,
    });
  } catch (error) {
    logger.fatal('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    });
    await disconnectDatabase();
    process.exit(1);
  }
}

main();
