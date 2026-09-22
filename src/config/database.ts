import { PrismaClient } from '@prisma/client';
import { env } from './environment.js';

/**
 * Singleton Prisma client instance.
 * Configured with logging appropriate to the current environment.
 */
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
  log:
    env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
});

/**
 * Test database connectivity.
 * Used by the health endpoint and startup verification.
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Gracefully disconnect from the database.
 * Called during application shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
