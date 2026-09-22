/**
 * A location provider could not answer.
 *
 * Provider SDKs throw transport-level errors like "Request failed with status
 * code 403", which say nothing to whoever is waiting on the answer. Wrapping
 * them here means a configuration problem reads as a configuration problem
 * (DEVELOPMENT_RULES.md §17: handle API unavailable, rate limit, timeout).
 */
export class LocationProviderError extends Error {
  readonly provider: string;
  readonly operation: string;
  /** True when the operator must fix something, not the caller. */
  readonly isConfigurationProblem: boolean;

  constructor(
    message: string,
    options: { provider: string; operation: string; isConfigurationProblem?: boolean; cause?: unknown }
  ) {
    super(message, { cause: options.cause });
    this.name = 'LocationProviderError';
    this.provider = options.provider;
    this.operation = options.operation;
    this.isConfigurationProblem = options.isConfigurationProblem ?? false;
  }
}

interface GoogleErrorShape {
  response?: {
    status?: number;
    data?: {
      // Legacy endpoints report the problem at the top level...
      status?: string;
      error_message?: string;
      // ...the current REST APIs nest it under `error`.
      error?: { status?: string; message?: string; code?: number };
    };
  };
  message?: string;
}

/**
 * Turn a Google Maps SDK failure into something actionable.
 */
export function describeGoogleMapsFailure(error: unknown, operation: string): LocationProviderError {
  const err = error as GoogleErrorShape;
  const data = err?.response?.data;
  const httpStatus = err?.response?.status;

  const status = data?.status ?? data?.error?.status;
  const detail = data?.error_message ?? data?.error?.message;

  // The current APIs answer 403 PERMISSION_DENIED where the legacy ones said
  // REQUEST_DENIED; both mean the key is not authorised for this call.
  const denied =
    status === 'REQUEST_DENIED' ||
    status === 'PERMISSION_DENIED' ||
    (httpStatus === 403 && status !== 'OVER_QUERY_LIMIT');

  if (denied) {
    return new LocationProviderError(
      `Google Maps refused the ${operation} request. ${detail ?? 'The API key is not authorised.'} ` +
        'Check that the required API is enabled for this key. A Maps Platform demo key works ' +
        'with Geocoding v4, Places (New) and Routes, but not the legacy endpoints. ' +
        'Set MAP_PROVIDER=mock to work without Google Maps.',
      { provider: 'GoogleMapsProvider', operation, isConfigurationProblem: true, cause: error }
    );
  }

  if (status === 'OVER_QUERY_LIMIT' || status === 'RESOURCE_EXHAUSTED' || httpStatus === 429) {
    return new LocationProviderError(
      `Google Maps quota exceeded on ${operation}. ${detail ?? ''}`.trim(),
      { provider: 'GoogleMapsProvider', operation, isConfigurationProblem: true, cause: error }
    );
  }

  if (status === 'ZERO_RESULTS') {
    return new LocationProviderError(
      `Google Maps found no result for the ${operation} request.`,
      { provider: 'GoogleMapsProvider', operation, cause: error }
    );
  }

  return new LocationProviderError(
    `Google Maps ${operation} failed: ${detail ?? err?.message ?? 'unknown error'}`,
    { provider: 'GoogleMapsProvider', operation, cause: error }
  );
}
