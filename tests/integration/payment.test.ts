import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '@/app.js';
import { prisma } from '@/config/database.js';
import { FastifyInstance } from 'fastify';

/**
 * The payment gate. The pipeline spends real money on LLM and maps calls, so
 * an unpaid order must not be able to start one.
 */
describe('Payment gate', () => {
  let app: FastifyInstance;
  let clientId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const client = await prisma.client.create({
      data: { name: 'Paying Client', email: 'payment.test@example.com' },
    });
    clientId = client.id;

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        clientId,
        name: 'Validasi Ruko',
        projectType: 'VALIDATION',
        businessProfile: {
          businessName: 'Kopi Bayar',
          businessCategory: 'F&B',
          currentAverageTransaction: 35000,
          estimatedDailyCustomers: 100,
        },
        locationSearch: {
          targetCity: 'Jakarta Selatan',
          estimatedInitialInvestment: 350_000_000,
        },
      },
    });
    projectId = JSON.parse(created.payload).id;
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { email: 'payment.test@example.com' } });
    await app.close();
  });

  it('should raise an invoice as soon as the order exists', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/payment`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);

    expect(data.payment.status).toBe('AWAITING_PAYMENT');
    expect(data.payment.amount).toBeGreaterThan(0);
    expect(data.payment.currency).toBe('IDR');
  });

  it('should refuse to start the pipeline before payment', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate-full-report`,
    });

    // 402 Payment Required — and, critically, no job was queued.
    expect(response.statusCode).toBe(402);
    expect(JSON.parse(response.payload).paymentStatus).toBe('AWAITING_PAYMENT');

    // Scoped to this order: other suites queue jobs of their own.
    const jobs = await prisma.jobQueue.count({
      where: { payload: { path: ['projectId'], equals: projectId } },
    });
    expect(jobs).toBe(0);
  });

  it('should require sender details when the client confirms', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/payment/confirm`,
      payload: { senderName: '', senderBank: '' },
    });

    // Without a sender the owner cannot find the transfer on their statement.
    expect(response.statusCode).toBe(400);
  });

  it('should move the order into the verification queue', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/payment/confirm`,
      payload: {
        senderName: 'Hakim',
        senderBank: 'BCA',
        reference: 'TRX-12345',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).status).toBe('AWAITING_CONFIRMATION');

    const pending = await app.inject({
      method: 'GET',
      url: '/api/projects/payments/pending',
    });
    expect(pending.statusCode).toBe(200);
    expect(JSON.parse(pending.payload).some((p: { projectId: string }) => p.projectId === projectId))
      .toBe(true);
  });

  it('should still refuse the pipeline on a client claim alone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate-full-report`,
    });

    // A client saying they paid is a claim, not a verified transfer.
    expect(response.statusCode).toBe(402);
    expect(JSON.parse(response.payload).paymentStatus).toBe('AWAITING_CONFIRMATION');
  });

  it('should let the owner reject with a reason the client can act on', async () => {
    const noReason = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/payment/reject`,
      payload: {},
    });
    expect(noReason.statusCode).toBe(400);

    const rejected = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/payment/reject`,
      payload: { reason: 'Transfer not found on the statement' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(JSON.parse(rejected.payload).status).toBe('REJECTED');
  });

  it('should let the client resubmit after a rejection', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/payment/confirm`,
      payload: { senderName: 'Hakim', senderBank: 'BCA', reference: 'TRX-67890' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.status).toBe('AWAITING_CONFIRMATION');
    // The stale rejection reason must not linger on a fresh submission.
    expect(data.rejectedReason).toBeNull();
  });

  it('should open the gate once the owner approves', async () => {
    const approved = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/payment/approve`,
    });

    expect(approved.statusCode).toBe(200);
    const payment = JSON.parse(approved.payload);
    expect(payment.status).toBe('APPROVED');
    expect(payment.approvedAt).not.toBeNull();
    expect(payment.approvedBy).toBeTruthy();

    const queued = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate-full-report`,
    });

    expect(queued.statusCode).toBe(202);
    expect(JSON.parse(queued.payload).jobId).toBeTruthy();

    // Leave no work behind for other suites.
    await prisma.jobQueue.deleteMany({
      where: { payload: { path: ['projectId'], equals: projectId } },
    });
  });

  it('should refuse to reject a payment that is already approved', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/payment/reject`,
      payload: { reason: 'changed my mind' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /api/projects/prices - should quote every product', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/prices' });

    expect(response.statusCode).toBe(200);
    const prices = JSON.parse(response.payload);

    expect(prices.map((p: { projectType: string }) => p.projectType)).toEqual([
      'VALIDATION',
      'COMPARISON',
      'AREA_SCOUTING',
    ]);
    // Flagged as placeholder until the owner sets real figures (§29, §35).
    expect(prices.every((p: { isDefault: boolean }) => typeof p.isDefault === 'boolean')).toBe(true);
  });
});
