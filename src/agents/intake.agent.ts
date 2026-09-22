import { env } from '../config/environment.js';
import { createAIProvider, ParsedBrief } from '../providers/ai/index.js';
import { projectService } from '../services/project.service.js';
import { logger } from '../lib/logger.js';
import { findMissingFinancialInputs } from '../lib/financial-inputs.js';

export class IntakeAgent {
  private aiProvider = createAIProvider(env.AI_PROVIDER);

  /**
   * Processes a natural language brief and creates a new project.
   */
  async processBrief(clientId: string, rawText: string, projectType?: string) {
    logger.info({ clientId, rawTextLength: rawText.length }, 'IntakeAgent processing brief');
    
    // 1. AI Parsing
    const parsed: ParsedBrief = await this.aiProvider.parseBrief(rawText);
    
    // 2. Determine Project Name
    const projectName = `Expansion: ${parsed.businessProfile.businessName} - ${parsed.locationSearch.targetArea || parsed.locationSearch.targetCity}`;

    // 3. Create Project & Profiles
    const project = await projectService.createProject({
      clientId,
      name: projectName,
      projectType,
      businessProfile: {
        businessName: parsed.businessProfile.businessName,
        businessCategory: parsed.businessProfile.businessCategory,
        businessSubcategory: parsed.businessProfile.businessSubcategory,
        currentAverageTransaction: parsed.businessProfile.currentAverageTransaction,
        estimatedDailyCustomers: parsed.businessProfile.estimatedDailyCustomers,
        operatingDays: parsed.businessProfile.operatingDays,
        grossMargin: parsed.businessProfile.grossMargin,
      },
      locationSearch: {
        targetCity: parsed.locationSearch.targetCity,
        targetArea: parsed.locationSearch.targetArea,
        maximumMonthlyRent: parsed.locationSearch.maximumMonthlyRent,
        targetPropertySize: parsed.locationSearch.targetPropertySize,
        preferredRadius: parsed.locationSearch.preferredRadius,
        maximumInitialInvestment: parsed.locationSearch.maximumInitialInvestment,
        estimatedInitialInvestment: parsed.locationSearch.estimatedInitialInvestment,
      }
    });

    // The brief rarely states every figure the financial engine needs. Report
    // the gaps explicitly rather than letting them default to zero downstream.
    const missingFinancialInputs = findMissingFinancialInputs(project);

    const missingInformation = [
      ...(parsed.missingInformation ?? []),
      ...missingFinancialInputs.map((m) => `${m.field}: ${m.reason}`),
    ];

    return {
      project,
      missingInformation,
      missingFinancialInputs,
      /** False when financial analysis would run on data nobody supplied. */
      readyForAnalysis: missingFinancialInputs.length === 0,
    };
  }
}

export const intakeAgent = new IntakeAgent();
