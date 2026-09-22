import type { Payment } from '@prisma/client';
import { prisma } from '../config/database.js';
import { priceFor, bankDetails } from '../lib/pricing.js';
import { getProjectTypeConfig } from '../lib/project-types.js';
import type { ProjectType } from '../lib/project-types.js';
import { logger } from '../lib/logger.js';

export const PAYMENT_STATUSES = [
  'AWAITING_PAYMENT',
  'AWAITING_CONFIRMATION',
  'APPROVED',
  'REJECTED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export class PaymentError extends Error {}

export interface ClientConfirmationInput {
  senderName: string;
  senderBank: string;
  reference?: string;
  transferredAt?: string;
}

/**
 * Manual bank-transfer payments.
 *
 * The money never passes through this system: the owner reconciles the
 * transfer against their own bank statement and records the decision here.
 * Until they approve, the order cannot consume any paid API.
 */
export class PaymentService {
  /** Raise the invoice for a new order. */
  async createForProject(
    projectId: string,
    clientId: string,
    projectType: string
  ): Promise<Payment> {
    const config = getProjectTypeConfig(projectType);
    const amount = priceFor(config.type as ProjectType);

    return await prisma.payment.create({
      data: {
        projectId,
        clientId,
        // The quoted amount is stored, not recomputed later: an old invoice
        // must keep saying what the client was actually asked to pay.
        amount,
        status: 'AWAITING_PAYMENT',
      },
    });
  }

  async getForProject(projectId: string): Promise<Payment | null> {
    return await prisma.payment.findUnique({ where: { projectId } });
  }

  /**
   * Everything the client needs in order to pay, plus where the order stands.
   */
  async paymentInstructions(projectId: string) {
    const payment = await this.getForProject(projectId);
    if (!payment) {
      throw new PaymentError(`No payment record for project ${projectId}`);
    }

    return {
      payment,
      bankDetails: bankDetails(),
      /** False when the owner has not configured a bank account yet. */
      payable: bankDetails() !== null,
    };
  }

  /**
   * The client states they have transferred the money.
   *
   * This is a claim, not proof — it only moves the order into the owner's
   * queue for verification.
   */
  async confirmByClient(
    projectId: string,
    input: ClientConfirmationInput
  ): Promise<Payment> {
    const payment = await this.getForProject(projectId);
    if (!payment) {
      throw new PaymentError(`No payment record for project ${projectId}`);
    }

    if (payment.status === 'APPROVED') {
      throw new PaymentError('This order is already paid');
    }

    if (!input.senderName?.trim() || !input.senderBank?.trim()) {
      throw new PaymentError(
        'senderName and senderBank are required so the transfer can be found on the statement'
      );
    }

    const updated = await prisma.payment.update({
      where: { projectId },
      data: {
        status: 'AWAITING_CONFIRMATION',
        senderName: input.senderName.trim(),
        senderBank: input.senderBank.trim(),
        reference: input.reference?.trim() || null,
        transferredAt: input.transferredAt ? new Date(input.transferredAt) : null,
        confirmedAt: new Date(),
        // A re-submission after a rejection clears the previous reason.
        rejectedReason: null,
      },
    });

    logger.info({ projectId, paymentId: updated.id }, 'Client confirmed a transfer');
    return updated;
  }

  /**
   * The owner has found the transfer on their statement. Work may now begin.
   */
  async approve(projectId: string, approvedByUserId: string): Promise<Payment> {
    const payment = await this.getForProject(projectId);
    if (!payment) {
      throw new PaymentError(`No payment record for project ${projectId}`);
    }
    if (payment.status === 'APPROVED') {
      return payment;
    }

    const updated = await prisma.payment.update({
      where: { projectId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: approvedByUserId,
        rejectedReason: null,
      },
    });

    logger.info(
      { projectId, paymentId: updated.id, approvedBy: approvedByUserId, amount: updated.amount },
      'Payment approved; order may now be processed'
    );
    return updated;
  }

  /** The owner could not find the transfer, or it was short. */
  async reject(projectId: string, reason: string, rejectedByUserId: string): Promise<Payment> {
    if (!reason?.trim()) {
      throw new PaymentError('A reason is required so the client knows what to fix');
    }

    const payment = await this.getForProject(projectId);
    if (!payment) {
      throw new PaymentError(`No payment record for project ${projectId}`);
    }
    if (payment.status === 'APPROVED') {
      throw new PaymentError('An approved payment cannot be rejected');
    }

    const updated = await prisma.payment.update({
      where: { projectId },
      data: { status: 'REJECTED', rejectedReason: reason.trim() },
    });

    logger.warn(
      { projectId, rejectedBy: rejectedByUserId },
      'Payment rejected'
    );
    return updated;
  }

  /**
   * The gate. Nothing that costs money may run until this returns true.
   */
  async isPaid(projectId: string): Promise<boolean> {
    const payment = await this.getForProject(projectId);
    return payment?.status === 'APPROVED';
  }

  /** Orders waiting for the owner to verify a transfer. */
  async pendingVerification() {
    return await prisma.payment.findMany({
      where: { status: 'AWAITING_CONFIRMATION' },
      orderBy: { confirmedAt: 'asc' },
      include: {
        project: {
          select: { id: true, name: true, projectType: true, clientId: true },
        },
      },
    });
  }
}

export const paymentService = new PaymentService();
