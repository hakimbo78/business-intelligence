import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

/**
 * Integration test: Health endpoint.
 *
 * Uses Fastify's `inject` method to test without starting a real HTTP server.
 * Requires a running PostgreSQL instance.
 */
describe('Health Endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health should return 200 with status info', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.status).toBe('healthy');
    expect(body.version).toBe('0.1.0');
    expect(body.environment).toBe('test');
    expect(body.provider).toBe('MockLocationProvider');
    expect(body.checks.database).toBe('connected');
    expect(body.timestamp).toBeDefined();
  });

  it('GET / should return project info', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.name).toBe('AI Location Business Intelligence');
    expect(body.version).toBe('0.1.0');
  });
});
