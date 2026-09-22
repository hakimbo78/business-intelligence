import { AIProvider, ParsedBrief } from './ai-provider.interface.js';
import { logger } from '../../lib/logger.js';
import { z } from 'zod';

export class MockAIProvider implements AIProvider {
  readonly providerName = 'MockAIProvider';

  async generateStructuredData<T>(prompt: string, schema: z.ZodSchema<T>, schemaName: string): Promise<T> {
    logger.info({ provider: this.providerName, schemaName }, 'Mocking structured data generation');

    if (schemaName === 'ParsedBrief') {
      return {
        businessProfile: {
          businessName: 'Mock Coffee Shop',
          businessCategory: 'F&B',
          businessSubcategory: 'Coffee Shop',
          currentAverageTransaction: 35000,
          estimatedDailyCustomers: 100,
          operatingDays: 26,
          grossMargin: 0.65,
        },
        locationSearch: {
          targetCity: 'Jakarta Selatan',
          targetArea: 'Kemang',
          maximumMonthlyRent: 20000000,
          targetPropertySize: 50,
          maximumInitialInvestment: 500000000,
          estimatedInitialInvestment: 350000000,
        },
        missingInformation: [],
      } as any;
    }

    if (schemaName === 'ResearchPlan') {
      return {
        competitorCategories: ['cafe', 'coffee shop'],
        searchRadiusMeters: 3000,
        candidateSearchQueries: ['ruko disewakan', 'commercial space for rent'],
        requiredDataSources: ['google_places', 'competitor_density'],
        estimatedAPICalls: 2,
        rationale: 'Mock research plan rationale based on mock provider.',
      } as any;
    }

    if (schemaName === 'CompetitionAnalysis') {
      return {
        directCompetitorsCount: 3,
        indirectCompetitorsCount: 5,
        densityLevel: 'MEDIUM',
        competitionRisks: ['High saturation of local coffee shops in a 1km radius.'],
        summary: 'Market shows medium density with established local players.',
      } as any;
    }

    if (schemaName === 'DemandAnalysis') {
      return {
        demandSignal: 'STRONG',
        customerFit: 'Local demographics heavily overlap with the target audience (young adults 25-34).',
        confidence: 'HIGH',
        evidence: ['Dominant age group is 25-34', 'Search interest for category is 85/100 (UP)'],
      } as any;
    }

    if (schemaName === 'MarketGapAnalysis') {
      return {
        hypotheses: [
          {
            opportunity: 'High demand with moderate competition presents a viable entry opportunity.',
            evidence: ['Demand signal is STRONG', 'Market density is MEDIUM'],
            confidenceLevel: 'MEDIUM',
            validationRequired: ['Conduct on-foot survey to check competitor quality during lunch hours'],
          }
        ],
        overallRecommendation: 'PROCEED_WITH_CAUTION',
        summary: 'The market gap exists but requires field validation of existing competitors.',
      } as any;
    }

    if (schemaName === 'AccessibilityAnalysis') {
      return {
        score: 85,
        metrics: {
          averageTravelTimeMinutes: 12,
          averageDistanceMeters: 3500,
        },
        transitProximity: 'Nearest bus stop is 200m away, accessible by foot.',
        parkingAvailability: 'ADEQUATE',
        summary: 'Location has good accessibility for both private vehicles and public transit.',
      } as any;
    }

    if (schemaName === 'ScoringExplanation') {
      return {
        narrative: 'The location scores well overall with strong demand and moderate competition, suggesting a viable entry opportunity pending field validation.',
      } as any;
    }

    if (schemaName === 'ReportSynthesis') {
      return {
        executiveSummary: 'The project shows strong potential with high demand and manageable competition. Financials indicate a viable payback period of 8 months under base assumptions.',
        methodology: 'Analysis was conducted using geospatial data, demographic proxies, and deterministic financial modeling.',
        assumptions: [
          'Average ticket size remains constant at Rp 35.000',
          'Foot traffic captures at least 5% of passing vehicles'
        ],
        validationChecklist: [
          'Verify actual passing foot traffic during peak hours (07:00-09:00)',
          'Check for hidden zoning restrictions or neighborhood association fees',
          'Confirm actual building layout matches estimated size'
        ]
      } as any;
    }

    if (schemaName === 'QAReview') {
      return {
        isApproved: true,
        issues: [],
        confidenceScore: 95,
      } as any;
    }

    throw new Error(`Mock AI Provider does not support schemaName: ${schemaName}`);
  }

  async parseBrief(rawText: string): Promise<ParsedBrief> {
    return this.generateStructuredData(rawText, null as any, 'ParsedBrief') as any;
  }
}
