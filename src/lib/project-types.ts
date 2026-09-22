/**
 * The three products, and how each one changes the pipeline.
 *
 * They differ in one decisive way: who supplies the premises.
 *
 *   VALIDATION     the client has one specific premises and wants to know
 *                  whether it is the right choice before signing.
 *   COMPARISON     the client has shortlisted several premises and wants them
 *                  ranked.
 *   AREA_SCOUTING  the client has only a target area. We recommend MICRO-AREAS
 *                  (street segments, clusters) — not specific premises, which
 *                  would require property availability data we are not
 *                  permitted to scrape (PROJECT_MASTER_SPEC.md §7).
 *
 * In the first two the client supplies the property, so candidate discovery is
 * skipped entirely. Only AREA_SCOUTING searches for candidates.
 */

export const PROJECT_TYPES = ['VALIDATION', 'COMPARISON', 'AREA_SCOUTING'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface ProjectTypeConfig {
  type: ProjectType;
  label: string;
  /** Whether the pipeline searches for its own candidates. */
  runsCandidateDiscovery: boolean;
  /** Candidates the client must supply before analysis can run. */
  minClientCandidates: number;
  maxClientCandidates: number | null;
  /** How many candidates the shortlist may carry into the report. */
  reportCandidateLimit: number | null;
  /** What the customer receives. */
  deliverable: string;
}

const CONFIGS: Record<ProjectType, ProjectTypeConfig> = {
  VALIDATION: {
    type: 'VALIDATION',
    label: 'Location Validation',
    runsCandidateDiscovery: false,
    minClientCandidates: 1,
    maxClientCandidates: 1,
    // There is nothing to shortlist: the single premises either holds up or not.
    reportCandidateLimit: 1,
    deliverable:
      'A go / no-go assessment of one specific premises, with risks and what must be verified on site.',
  },
  COMPARISON: {
    type: 'COMPARISON',
    label: 'Location Comparison',
    runsCandidateDiscovery: false,
    minClientCandidates: 2,
    maxClientCandidates: 5,
    // Every premises the client submitted is reported on; none are filtered out.
    reportCandidateLimit: null,
    deliverable:
      'A ranking of the premises the client supplied, with the trade-offs behind the order.',
  },
  AREA_SCOUTING: {
    type: 'AREA_SCOUTING',
    label: 'Area Scouting',
    runsCandidateDiscovery: true,
    minClientCandidates: 0,
    maxClientCandidates: 0,
    reportCandidateLimit: 5,
    deliverable:
      'Recommended micro-areas (street segments / clusters) to search in, with the evidence behind each.',
  },
};

export function getProjectTypeConfig(type: string): ProjectTypeConfig {
  const config = CONFIGS[type as ProjectType];
  if (!config) {
    throw new Error(
      `Unknown projectType "${type}". Supported values: ${PROJECT_TYPES.join(', ')}`
    );
  }
  return config;
}

export function isProjectType(value: string): value is ProjectType {
  return (PROJECT_TYPES as readonly string[]).includes(value);
}

export interface CandidateCountProblem {
  projectType: ProjectType;
  supplied: number;
  reason: string;
}

/**
 * Check a project has the candidates its type requires, before the pipeline
 * spends anything.
 *
 * A VALIDATION order with no premises attached is not an analysis problem — it
 * is an incomplete order, and should be refused at once rather than producing
 * a report about nothing.
 */
export function checkCandidateCount(
  type: ProjectType,
  suppliedCandidates: number
): CandidateCountProblem | null {
  const config = CONFIGS[type];

  if (config.runsCandidateDiscovery) return null;

  if (suppliedCandidates < config.minClientCandidates) {
    return {
      projectType: type,
      supplied: suppliedCandidates,
      reason:
        `${config.label} requires at least ${config.minClientCandidates} premises supplied by the client, ` +
        `but ${suppliedCandidates} were attached to this project.`,
    };
  }

  if (config.maxClientCandidates !== null && suppliedCandidates > config.maxClientCandidates) {
    return {
      projectType: type,
      supplied: suppliedCandidates,
      reason:
        `${config.label} accepts at most ${config.maxClientCandidates} premises, ` +
        `but ${suppliedCandidates} were attached to this project.`,
    };
  }

  return null;
}
