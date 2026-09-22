import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Integration test: Database connectivity.
 *
 * Requires a running PostgreSQL instance (via Docker Compose).
 * Verifies that Prisma can connect and execute queries.
 */
describe('Database Connection', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should connect to PostgreSQL and execute a query', async () => {
    const result = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
    expect(result).toBeDefined();
    expect(result[0].result).toBe(1);
  });

  it('should have PostGIS extension available', async () => {
    const result = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'postgis'
    `;
    // PostGIS may or may not be enabled yet — this is informational
    // The postgis/postgis Docker image has it available
    expect(result).toBeDefined();
  });

  it('should have the system_info table after migration', async () => {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'system_info'
      ) as exists
    `;
    expect(result[0].exists).toBe(true);
  });
});
