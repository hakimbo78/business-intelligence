import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/environment.js';
import { testDatabaseConnection } from './config/database.js';
import { createLocationProvider } from './providers/location/index.js';
import { logger } from './lib/logger.js';
import { projectRoutes } from './routes/project.routes.js';
import { costRoutes } from './routes/cost.routes.js';
import { locationRoutes } from './routes/location.routes.js';
import { propertyRoutes, projectPropertyRoutes } from './routes/property.routes.js';
import { authRoutes } from './routes/auth.routes.js';

/**
 * Build the Fastify application instance.
 *
 * Separated from server.ts to allow testing via Fastify's `inject` method
 * without starting an actual HTTP server.
 */
export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own structured logger
  });

  // Register CORS.
  // In production only the configured origins are allowed; `false` would have
  // blocked every browser client including the owner dashboard.
  await app.register(cors, {
    origin:
      env.NODE_ENV === 'production'
        ? env.CORS_ALLOWED_ORIGINS!.split(',').map((o) => o.trim()).filter(Boolean)
        : true,
  });

  // Rate limiting (PROJECT_MASTER_SPEC.md §26). Keyed by authenticated user
  // where possible, so one noisy client cannot exhaust the budget for others.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.user?.userId ?? request.ip,
  });

  // Initialize location provider based on configuration
  const locationProvider = createLocationProvider(env.MAP_PROVIDER);
  logger.info('Location provider initialized', {
    provider: locationProvider.providerName,
  });

  // Decorate app with shared dependencies
  app.decorate('locationProvider', locationProvider);

  // --- Routes ---
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(projectRoutes, { prefix: '/api/projects' });
  app.register(locationRoutes, { prefix: '/api/locations' });
  app.register(propertyRoutes, { prefix: '/api/properties' });
  app.register(projectPropertyRoutes, { prefix: '/api/projects' });
  app.register(costRoutes, { prefix: '/api/admin' });

  /**
   * Health check endpoint.
   * Verifies application and database connectivity.
   */
  app.get('/health', async (_request, reply) => {
    const dbConnected = await testDatabaseConnection();

    // The status code was computed but never sent, so a dead database still
    // reported HTTP 200 and every uptime check saw a healthy service.
    return reply.status(dbConnected ? 200 : 503).send({
      status: dbConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      environment: env.NODE_ENV,
      provider: locationProvider.providerName,
      checks: {
        database: dbConnected ? 'connected' : 'disconnected',
      },
    });
  });

  /**
   * Root endpoint — basic project info.
   */
  app.get('/', async (_request, _reply) => {
    return {
      name: 'AI Location Business Intelligence',
      version: '0.1.0',
      description: 'AI-powered Location Decision Intelligence Platform for UMKM',
      docs: '/health',
      authenticate: '/api/auth/google',
    };
  });

  return app;
}
