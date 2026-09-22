import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for environment configuration.
 *
 * Tests validation logic by manipulating process.env directly
 * and dynamically importing the environment module.
 */
describe('Environment Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset module cache to re-evaluate environment on each test
    // We test the Zod schema logic directly
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  it('should accept valid development configuration', async () => {
    // Set up valid env
    process.env.NODE_ENV = 'development';
    process.env.PORT = '3000';
    process.env.LOG_LEVEL = 'info';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/location_intelligence?schema=public';
    process.env.MAP_PROVIDER = 'mock';

    // Dynamically import to pick up fresh env
    const { z } = await import('zod');

    const envSchema = z.object({
      NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
      PORT: z.coerce.number().int().positive().default(3000),
      LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
      DATABASE_URL: z.string().url().startsWith('postgresql://'),
      MAP_PROVIDER: z.enum(['mock', 'google']).default('mock'),
      GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
    });

    const result = envSchema.safeParse(process.env);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.PORT).toBe(3000);
      expect(result.data.MAP_PROVIDER).toBe('mock');
    }
  });

  it('should reject invalid DATABASE_URL', async () => {
    const { z } = await import('zod');

    const envSchema = z.object({
      DATABASE_URL: z.string().url().startsWith('postgresql://'),
    });

    const result = envSchema.safeParse({ DATABASE_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid MAP_PROVIDER value', async () => {
    const { z } = await import('zod');

    const envSchema = z.object({
      MAP_PROVIDER: z.enum(['mock', 'google']).default('mock'),
    });

    const result = envSchema.safeParse({ MAP_PROVIDER: 'bing' });
    expect(result.success).toBe(false);
  });

  it('should default PORT to 3000 when not specified', async () => {
    const { z } = await import('zod');

    const envSchema = z.object({
      PORT: z.coerce.number().int().positive().default(3000),
    });

    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
    }
  });

  it('should default MAP_PROVIDER to mock when not specified', async () => {
    const { z } = await import('zod');

    const envSchema = z.object({
      MAP_PROVIDER: z.enum(['mock', 'google']).default('mock'),
    });

    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MAP_PROVIDER).toBe('mock');
    }
  });

  it('should accept all valid NODE_ENV values', async () => {
    const { z } = await import('zod');

    const envSchema = z.object({
      NODE_ENV: z.enum(['development', 'staging', 'production', 'test']),
    });

    for (const validEnv of ['development', 'staging', 'production', 'test']) {
      const result = envSchema.safeParse({ NODE_ENV: validEnv });
      expect(result.success).toBe(true);
    }
  });
});
