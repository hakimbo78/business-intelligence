/**
 * Property Normalizer — Pure Deterministic Functions
 *
 * Per AGENT_ORCHESTRATION_SPEC.md §9 the Property Agent normalises rent, size,
 * location, property type and availability. Normalisation only ever restates
 * what a source said — it never fills a gap with an estimate. Missing stays
 * missing, because the alternative is a fabricated rent in a customer's report
 * (PROJECT_MASTER_SPEC.md §24).
 */

/** Sources PROJECT_MASTER_SPEC.md §7 permits. Scraping is deliberately absent. */
export const PERMITTED_PROPERTY_SOURCES = [
  'CUSTOMER_SUBMITTED',
  'OWNER_SUBMITTED',
  'AGENT_SUBMITTED',
  'FIELD_SURVEY',
  'LICENSED_PROVIDER',
  'MOCK',
] as const;

export type PropertySource = (typeof PERMITTED_PROPERTY_SOURCES)[number];

export const PROPERTY_AVAILABILITY = ['AVAILABLE', 'RESERVED', 'TAKEN', 'UNKNOWN'] as const;
export type PropertyAvailability = (typeof PROPERTY_AVAILABILITY)[number];

export interface RawPropertyInput {
  source: string;
  sourceReference?: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  propertyType?: string;
  sizeSqm?: number;
  monthlyRent?: number;
  annualRent?: number;
  deposit?: number;
  availability?: string;
  confidence?: string;
}

export interface NormalizedProperty {
  source: PropertySource;
  sourceReference?: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  propertyType?: string;
  sizeSqm?: number;
  monthlyRent?: number;
  annualRent?: number;
  /** True when monthlyRent was divided out of an annual figure, not quoted. */
  rentIsDerived: boolean;
  deposit?: number;
  availability: PropertyAvailability;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Notes worth showing the customer, e.g. how the monthly rent was obtained. */
  notes: string[];
}

export class PropertyNormalizationError extends Error {}

function normalizeAvailability(value?: string): PropertyAvailability {
  const upper = (value ?? '').toUpperCase();
  return (PROPERTY_AVAILABILITY as readonly string[]).includes(upper)
    ? (upper as PropertyAvailability)
    : 'UNKNOWN';
}

function normalizeConfidence(value?: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const upper = (value ?? '').toUpperCase();
  return upper === 'HIGH' || upper === 'MEDIUM' ? upper : 'LOW';
}

/**
 * Validate and normalise one raw property record.
 *
 * Throws rather than silently downgrading an unpermitted source: accepting
 * scraped data would breach the provider terms the product depends on.
 */
export function normalizeProperty(raw: RawPropertyInput): NormalizedProperty {
  const source = (raw.source ?? '').toUpperCase();
  if (!(PERMITTED_PROPERTY_SOURCES as readonly string[]).includes(source)) {
    throw new PropertyNormalizationError(
      `Property source "${raw.source}" is not permitted. Allowed: ${PERMITTED_PROPERTY_SOURCES.join(', ')}. ` +
        'Marketplace scraping is not a permitted source (PROJECT_MASTER_SPEC.md §7).'
    );
  }

  if (!raw.address?.trim()) {
    throw new PropertyNormalizationError('Property listing requires an address');
  }
  if (!Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude)) {
    throw new PropertyNormalizationError('Property listing requires valid coordinates');
  }

  const notes: string[] = [];

  // --- Rent: normalise to a monthly figure ---
  let monthlyRent = raw.monthlyRent;
  let annualRent = raw.annualRent;
  let rentIsDerived = false;

  if (monthlyRent === undefined && annualRent !== undefined) {
    // Indonesian commercial leases are routinely quoted per year. Dividing is
    // arithmetic on a stated figure, not an estimate — but it is flagged so the
    // report can say where the monthly number came from.
    monthlyRent = Math.round(annualRent / 12);
    rentIsDerived = true;
    notes.push(
      `Monthly rent derived from a stated annual rent of ${annualRent} (÷12); verify payment terms in the field.`
    );
  } else if (monthlyRent !== undefined && annualRent === undefined) {
    annualRent = monthlyRent * 12;
  }

  if (monthlyRent !== undefined && monthlyRent <= 0) {
    throw new PropertyNormalizationError('Property rent must be a positive number');
  }
  if (raw.sizeSqm !== undefined && raw.sizeSqm <= 0) {
    throw new PropertyNormalizationError('Property size must be a positive number');
  }

  if (monthlyRent === undefined) {
    notes.push('Rent not stated by the source; left empty rather than estimated.');
  }
  if (raw.sizeSqm === undefined) {
    notes.push('Size not stated by the source; left empty rather than estimated.');
  }

  return {
    source: source as PropertySource,
    sourceReference: raw.sourceReference,
    address: raw.address.trim(),
    latitude: raw.latitude,
    longitude: raw.longitude,
    placeId: raw.placeId,
    propertyType: raw.propertyType?.trim() || undefined,
    sizeSqm: raw.sizeSqm,
    monthlyRent,
    annualRent,
    rentIsDerived,
    deposit: raw.deposit,
    availability: normalizeAvailability(raw.availability),
    confidence: normalizeConfidence(raw.confidence),
    notes,
  };
}
