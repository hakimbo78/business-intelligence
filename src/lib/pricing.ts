import { env } from '../config/environment.js';
import type { ProjectType } from './project-types.js';

/**
 * What each product costs.
 *
 * Per PROJECT_MASTER_SPEC.md §29 pricing must be configurable, so every price
 * is read from the environment. The defaults here are placeholders — the owner
 * sets the real figures, since pricing is their authority (§35).
 *
 * Prices are in whole IDR.
 */
const DEFAULT_PRICES: Record<ProjectType, number> = {
  VALIDATION: 1_500_000,
  COMPARISON: 2_500_000,
  AREA_SCOUTING: 3_500_000,
};

function priceFromEnv(type: ProjectType): number | undefined {
  const raw = {
    VALIDATION: env.PRICE_VALIDATION,
    COMPARISON: env.PRICE_COMPARISON,
    AREA_SCOUTING: env.PRICE_AREA_SCOUTING,
  }[type];

  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function priceFor(type: ProjectType): number {
  return priceFromEnv(type) ?? DEFAULT_PRICES[type];
}

export interface PriceListEntry {
  projectType: ProjectType;
  amount: number;
  currency: 'IDR';
  /** True when the owner has not set this price and a placeholder is in use. */
  isDefault: boolean;
}

export function priceList(): PriceListEntry[] {
  return (Object.keys(DEFAULT_PRICES) as ProjectType[]).map((type) => ({
    projectType: type,
    amount: priceFor(type),
    currency: 'IDR' as const,
    isDefault: priceFromEnv(type) === undefined,
  }));
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

/**
 * Where the client sends the transfer.
 *
 * Returns null when not configured, so the dashboard can say "payment is not
 * set up yet" instead of showing a client an empty account number to pay into.
 */
export function bankDetails(): BankDetails | null {
  if (!env.BANK_NAME || !env.BANK_ACCOUNT_NUMBER || !env.BANK_ACCOUNT_HOLDER) {
    return null;
  }
  return {
    bankName: env.BANK_NAME,
    accountNumber: env.BANK_ACCOUNT_NUMBER,
    accountHolder: env.BANK_ACCOUNT_HOLDER,
  };
}
