import type { LocationProvider } from './location-provider.interface.js';
import { MockLocationProvider } from './mock-location-provider.js';
import { GoogleMapsProvider } from './google-maps-provider.js';

export type MapProviderType = 'mock' | 'google';

/**
 * Location Provider Factory
 *
 * Creates the appropriate LocationProvider based on MAP_PROVIDER env var.
 *
 * Per PROJECT_MASTER_SPEC.md §20-21:
 * - Development: MAP_PROVIDER=mock
 * - Staging/Production: MAP_PROVIDER=google
 */
export function createLocationProvider(providerType: MapProviderType): LocationProvider {
  switch (providerType) {
    case 'mock':
      return new MockLocationProvider();
    case 'google':
      return new GoogleMapsProvider();
    default:
      throw new Error(
        `Unknown MAP_PROVIDER: "${providerType}". Supported values: mock, google`
      );
  }
}

// Re-export types for convenience
export type { LocationProvider } from './location-provider.interface.js';
export { MockLocationProvider } from './mock-location-provider.js';
export { GoogleMapsProvider } from './google-maps-provider.js';
