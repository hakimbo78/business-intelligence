/**
 * Test setup — shared configuration for all tests.
 *
 * Every provider is pinned to its mock here. Without this, values from a
 * developer's local .env leak into the suite, which makes tests non-deterministic
 * and spends real money on paid APIs (DEVELOPMENT_RULES.md §6 "mock first").
 */

// Set test environment variables before any imports that use them
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/location_intelligence?schema=public';
process.env.MAP_PROVIDER = 'mock';
process.env.AI_PROVIDER = 'mock';
// Auth is exercised by its own suites, which set their own configuration.
process.env.AUTH_DISABLED = 'true';
// Property data comes from our own store, so integration tests exercise the
// real provider against rows they submit themselves.

// OpenStreetMap and WorldPop are live third-party services reached over the
// network. Leaving them on made the report suite depend on a volunteer-run
// endpoint's rate limiter, which failed only when the whole suite ran.
process.env.ENABLE_OSM_ROAD = 'false';
process.env.ENABLE_POPULATION_DATA = 'false';

// Drop any real credentials so a misconfigured provider fails loudly
// instead of quietly reaching an external service.
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.GEMINI_API_KEY;
