import { describe, it, expect } from 'vitest';
import {
  PROJECT_TYPES,
  getProjectTypeConfig,
  isProjectType,
  checkCandidateCount,
} from '@/lib/project-types.js';

describe('Project types', () => {
  it('should cover exactly the three products', () => {
    expect(PROJECT_TYPES).toEqual(['VALIDATION', 'COMPARISON', 'AREA_SCOUTING']);
  });

  it('should only search for candidates when the client has no premises', () => {
    // The client supplies the premises in the first two products.
    expect(getProjectTypeConfig('VALIDATION').runsCandidateDiscovery).toBe(false);
    expect(getProjectTypeConfig('COMPARISON').runsCandidateDiscovery).toBe(false);
    expect(getProjectTypeConfig('AREA_SCOUTING').runsCandidateDiscovery).toBe(true);
  });

  it('should promise micro-areas, not specific premises, for scouting', () => {
    // We cannot name specific premises without property availability data we
    // are not permitted to scrape (PROJECT_MASTER_SPEC.md §7).
    const deliverable = getProjectTypeConfig('AREA_SCOUTING').deliverable;
    expect(deliverable).toContain('micro-areas');
  });

  it('should reject an unknown type rather than defaulting', () => {
    expect(() => getProjectTypeConfig('SOMETHING_ELSE')).toThrow(/Unknown projectType/);
    expect(isProjectType('SOMETHING_ELSE')).toBe(false);
    expect(isProjectType('VALIDATION')).toBe(true);
  });
});

describe('Candidate requirements per product', () => {
  it('should require exactly one premises for validation', () => {
    expect(checkCandidateCount('VALIDATION', 1)).toBeNull();

    const none = checkCandidateCount('VALIDATION', 0);
    expect(none?.reason).toContain('at least 1 premises');

    const tooMany = checkCandidateCount('VALIDATION', 2);
    expect(tooMany?.reason).toContain('at most 1 premises');
  });

  it('should require at least two premises to compare', () => {
    expect(checkCandidateCount('COMPARISON', 1)?.reason).toContain('at least 2 premises');
    expect(checkCandidateCount('COMPARISON', 2)).toBeNull();
    expect(checkCandidateCount('COMPARISON', 5)).toBeNull();
    expect(checkCandidateCount('COMPARISON', 6)?.reason).toContain('at most 5 premises');
  });

  it('should not require any premises for scouting', () => {
    // The pipeline discovers them, so an empty project is perfectly valid here.
    expect(checkCandidateCount('AREA_SCOUTING', 0)).toBeNull();
  });

  it('should report how many were actually supplied', () => {
    expect(checkCandidateCount('VALIDATION', 0)?.supplied).toBe(0);
    expect(checkCandidateCount('COMPARISON', 7)?.supplied).toBe(7);
  });
});
