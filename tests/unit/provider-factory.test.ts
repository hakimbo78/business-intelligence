import { describe, it, expect, vi } from 'vitest';
import { createLocationProvider, MockLocationProvider, GoogleMapsProvider } from '@/providers/location/index.js';

// Mock the environment to avoid actual Google API calls during unit tests
vi.mock('@/config/environment.js', () => ({
  env: {
    MAP_PROVIDER: 'mock',
    GOOGLE_MAPS_API_KEY: 'test-key'
  }
}));

describe('Location Provider Factory', () => {
  it('should create MockLocationProvider when type is "mock"', () => {
    const provider = createLocationProvider('mock');
    expect(provider).toBeInstanceOf(MockLocationProvider);
    expect(provider.providerName).toBe('MockLocationProvider');
  });

  it('should create GoogleMapsProvider when type is "google"', () => {
    const provider = createLocationProvider('google');
    expect(provider).toBeInstanceOf(GoogleMapsProvider);
    expect(provider.providerName).toBe('GoogleMapsProvider');
  });

  it('should throw error for unknown provider type', () => {
    expect(() => createLocationProvider('invalid' as any)).toThrow('Unknown MAP_PROVIDER');
  });
});

describe('MockLocationProvider', () => {
  const provider = new MockLocationProvider();

  it('should return mock places', async () => {
    const result = await provider.searchPlaces({
      query: 'cafe',
      location: { latitude: -6.26, longitude: 106.81 },
      radiusMeters: 1000,
    });

    expect(result.data.length).toBe(2);
    expect(result.data[0].name).toBe('Janji Jiwa Kemang');
    expect(result.provenance.source).toBe('MockLocationProvider');
    expect(result.provenance.confidence).toBe('HIGH');
  });

  it('should return mock place details', async () => {
    const result = await provider.getPlaceDetails({
      placeId: 'test-place-001',
    });

    expect(result.data.placeId).toBe('test-place-001');
    expect(result.data.name).toBe('Mock Place Details');
    expect(result.provenance.source).toBe('MockLocationProvider');
  });

  it('should return mock geocoding result', async () => {
    const result = await provider.geocode({
      address: 'Jl. Kemang Raya',
    });

    expect(result.data.formattedAddress).toContain('Jakarta Selatan');
    expect(result.data.location.latitude).toBeDefined();
    expect(result.data.location.longitude).toBeDefined();
  });

  it('should return mock route calculation', async () => {
    const result = await provider.calculateRoute({
      origin: { latitude: -6.26, longitude: 106.81 },
      destination: { latitude: -6.22, longitude: 106.85 },
    });

    expect(result.data.distanceMeters).toBe(2500);
    expect(result.data.durationSeconds).toBe(900);
    expect(result.provenance.source).toBe('MockLocationProvider');
  });
});
