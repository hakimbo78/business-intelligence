import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/config/database.js';
import {
  providerRetentionService,
  CONTENT_RETENTION_DAYS,
} from '@/services/provider-retention.service.js';

/**
 * Google's Places policy exempts only the place ID from its caching
 * restriction. These tests pin the behaviour that keeps us inside it.
 */

let projectId: string;
let clientId: string;

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  const client = await prisma.client.create({
    data: { name: 'Retention Test Client', email: `retention-${Date.now()}@example.com` },
  });
  clientId = client.id;

  const project = await prisma.project.create({
    data: { clientId, name: 'Retention Test Project', projectType: 'VALIDATION' },
  });
  projectId = project.id;
});

afterAll(async () => {
  await prisma.competitor.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.client.deleteMany({ where: { id: clientId } });
});

beforeEach(async () => {
  await prisma.competitor.deleteMany({ where: { projectId } });
  // The sweep is global by design, so other suites' rows would be counted in
  // these assertions. Clearing the backlog first makes each count a delta.
  await providerRetentionService.sweep();
});

const competitor = (name: string, contentFetchedAt: Date | null) => ({
  projectId,
  placeId: `place-${name}`,
  name,
  address: 'Jl. Contoh No. 1',
  category: 'laundry',
  latitude: -6.4,
  longitude: 106.83,
  rating: 4.5,
  reviewCount: 120,
  contentFetchedAt,
});

describe('Expiring cached provider content', () => {
  it('should clear content older than the retention window', async () => {
    await prisma.competitor.create({ data: competitor('Stale Laundry', daysAgo(CONTENT_RETENTION_DAYS + 1)) });

    const result = await providerRetentionService.sweep();
    expect(result.purged).toBe(1);

    const row = await prisma.competitor.findFirst({ where: { projectId } });
    expect(row?.name).toBe('[konten kedaluwarsa]');
    expect(row?.address).toBeNull();
    expect(row?.rating).toBeNull();
    expect(row?.reviewCount).toBeNull();
    expect(row?.contentPurged).toBe(true);
  });

  it('should keep the place ID, which the policy exempts', async () => {
    await prisma.competitor.create({ data: competitor('Stale Laundry', daysAgo(CONTENT_RETENTION_DAYS + 1)) });

    await providerRetentionService.sweep();

    // Without it, a re-run could not fetch the content again.
    const row = await prisma.competitor.findFirst({ where: { projectId } });
    expect(row?.placeId).toBe('place-Stale Laundry');
  });

  it('should leave content inside the window alone', async () => {
    await prisma.competitor.create({ data: competitor('Fresh Laundry', daysAgo(1)) });

    const result = await providerRetentionService.sweep();

    expect(result.purged).toBe(0);
    const row = await prisma.competitor.findFirst({ where: { projectId } });
    expect(row?.name).toBe('Fresh Laundry');
    expect(row?.rating).toBe(4.5);
  });

  it('should treat rows written before this policy as already expired', async () => {
    // They carry no timestamp, so their content cannot be shown to be fresh.
    await prisma.competitor.create({ data: competitor('Legacy Laundry', null) });

    const result = await providerRetentionService.sweep();
    expect(result.purged).toBe(1);
  });

  it('should not clear the same row twice', async () => {
    await prisma.competitor.create({ data: competitor('Stale Laundry', daysAgo(90)) });

    expect((await providerRetentionService.sweep()).purged).toBe(1);
    expect((await providerRetentionService.sweep()).purged).toBe(0);
  });

  it('should report what the next sweep will clear', async () => {
    await prisma.competitor.create({ data: competitor('Stale Laundry', daysAgo(90)) });
    await prisma.competitor.create({ data: competitor('Fresh Laundry', daysAgo(2)) });

    expect(await providerRetentionService.countExpiring()).toBe(1);
  });
});
