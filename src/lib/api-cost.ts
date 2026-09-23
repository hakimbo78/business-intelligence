/**
 * What each call to a paid provider costs.
 *
 * Billing is now enabled on the Google Cloud project, which changes the shape
 * of the risk: before, a mistake returned an error; now it returns an invoice.
 * A runaway loop, a leaked key or an unbounded census can spend real money
 * without anyone noticing until the month closes.
 *
 * So every billable call is priced here, counted, and checked against a ceiling
 * before it is made. The prices below were read from Google's published pricing
 * list; they are reproduced so the code can reason about cost, and they will
 * drift, so the figures are labelled as estimates wherever they reach a human.
 *
 * The most important thing in this file is not the ceiling — it is
 * NEARBY_SEARCH_PRO. Asking for `rating` and `userRatingCount` moves a search
 * from the Pro SKU to Enterprise, whose free allowance is a fifth the size:
 * 1,000 calls a month against 5,000. A census spends about 45 calls, so those
 * two fields alone were the difference between 22 reports a month and 111.
 */

export type BillableSku =
  | 'NEARBY_SEARCH_PRO'
  | 'NEARBY_SEARCH_ENTERPRISE'
  | 'TEXT_SEARCH_PRO'
  | 'TEXT_SEARCH_ENTERPRISE'
  | 'PLACE_DETAILS_ENTERPRISE'
  | 'GEOCODING'
  | 'ROUTES'
  | 'STREET_VIEW_STATIC'
  | 'STATIC_MAP'
  | 'STREET_VIEW_METADATA';

export interface SkuPricing {
  /** US dollars per thousand requests. */
  usdPerThousand: number;
  /** Calls Google does not charge for each month. */
  freePerMonth: number;
  /** What the owner sees in the cost report. */
  label: string;
}

/**
 * Google Maps Platform list prices, global list, read September 2026.
 *
 * Kept in one place so a price change is one edit, and stated as an estimate
 * anywhere it is shown, because the authority is Google's invoice and not this
 * table.
 */
export const SKU_PRICING: Record<BillableSku, SkuPricing> = {
  NEARBY_SEARCH_PRO: { usdPerThousand: 32, freePerMonth: 5_000, label: 'Pencarian sekitar (Pro)' },
  NEARBY_SEARCH_ENTERPRISE: { usdPerThousand: 35, freePerMonth: 1_000, label: 'Pencarian sekitar (Enterprise)' },
  TEXT_SEARCH_PRO: { usdPerThousand: 32, freePerMonth: 5_000, label: 'Pencarian teks (Pro)' },
  TEXT_SEARCH_ENTERPRISE: { usdPerThousand: 35, freePerMonth: 1_000, label: 'Pencarian teks (Enterprise)' },
  PLACE_DETAILS_ENTERPRISE: { usdPerThousand: 20, freePerMonth: 1_000, label: 'Detail tempat (Enterprise)' },
  GEOCODING: { usdPerThousand: 5, freePerMonth: 10_000, label: 'Geocoding alamat' },
  ROUTES: { usdPerThousand: 5, freePerMonth: 10_000, label: 'Perhitungan rute' },
  STREET_VIEW_STATIC: { usdPerThousand: 7, freePerMonth: 10_000, label: 'Foto Street View' },
  STATIC_MAP: { usdPerThousand: 2, freePerMonth: 10_000, label: 'Peta statis' },
  // Google does not charge for the metadata lookup, which is why every image
  // request is preceded by one.
  STREET_VIEW_METADATA: { usdPerThousand: 0, freePerMonth: Number.MAX_SAFE_INTEGER, label: 'Cek ketersediaan Street View' },
};

/**
 * Fields that move a Places search from the Pro SKU to Enterprise.
 *
 * Checked at the call site so a future field mask cannot quietly multiply the
 * bill: Google bills at the highest tier any requested field belongs to.
 */
export const ENTERPRISE_PLACE_FIELDS = ['rating', 'userRatingCount', 'regularOpeningHours', 'priceLevel', 'reviews'];

/** Whether a field mask puts the request in the Enterprise tier. */
export function isEnterpriseFieldMask(fieldMask: string): boolean {
  return ENTERPRISE_PLACE_FIELDS.some((field) => fieldMask.includes(field));
}

/**
 * Cost of a number of calls, in US dollars.
 *
 * Deliberately ignores the free allowance: the allowance is shared across every
 * project on the billing account and resets monthly, so treating calls as free
 * while it lasts would hide the run rate that matters. The allowance is shown
 * separately in the usage summary.
 */
export function estimateCostUsd(sku: BillableSku, calls: number): number {
  const pricing = SKU_PRICING[sku];
  if (!pricing) return 0;

  // Rounded to the cent-thousandth: a single call is a fraction of a cent, and
  // rounding each one to a cent would inflate a census by an order of magnitude.
  return Math.round(((pricing.usdPerThousand * calls) / 1000) * 1_000_000) / 1_000_000;
}

export interface SkuUsage {
  sku: BillableSku;
  calls: number;
  estimatedCostUsd: number;
}

export interface UsageSummary {
  perSku: Array<SkuUsage & { label: string; freePerMonth: number; freeRemaining: number }>;
  totalCalls: number;
  totalCostUsd: number;
  /** Cost of the calls that fall outside the free allowance. */
  billableCostUsd: number;
}

/**
 * Summarise usage, showing how much of the free allowance is left.
 *
 * The free-allowance figure is what an owner actually steers by: "1,000 free
 * Enterprise searches, 640 used" is actionable in a way that "$22.40" is not.
 */
export function summariseUsage(usage: SkuUsage[]): UsageSummary {
  const perSku = usage.map((u) => {
    const pricing = SKU_PRICING[u.sku];
    const freeRemaining = Math.max(0, (pricing?.freePerMonth ?? 0) - u.calls);
    const billableCalls = Math.max(0, u.calls - (pricing?.freePerMonth ?? 0));

    return {
      ...u,
      label: pricing?.label ?? u.sku,
      freePerMonth: pricing?.freePerMonth ?? 0,
      freeRemaining: freeRemaining === Number.MAX_SAFE_INTEGER ? Infinity : freeRemaining,
      billableCostUsd: estimateCostUsd(u.sku, billableCalls),
    };
  });

  return {
    perSku,
    totalCalls: usage.reduce((sum, u) => sum + u.calls, 0),
    totalCostUsd: Math.round(usage.reduce((sum, u) => sum + u.estimatedCostUsd, 0) * 1_000_000) / 1_000_000,
    billableCostUsd:
      Math.round(perSku.reduce((sum, u) => sum + u.billableCostUsd, 0) * 1_000_000) / 1_000_000,
  };
}

/** Formats a dollar figure for a reader who thinks in rupiah. */
export function formatCost(usd: number, usdToIdr: number): string {
  const idr = Math.round(usd * usdToIdr);
  return `US$ ${usd.toFixed(2)} (±Rp ${idr.toLocaleString('id-ID')})`;
}
