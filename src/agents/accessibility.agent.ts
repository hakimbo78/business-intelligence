import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { createLocationProvider } from '../providers/location/index.js';
import { projectService } from '../services/project.service.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';

export const accessibilityAnalysisSchema = z.object({
  score: z.number().min(0).max(100).describe('Accessibility score out of 100'),
  metrics: z.object({
    averageTravelTimeMinutes: z.number().describe('Average travel time in minutes from key nearby hubs'),
    averageDistanceMeters: z.number().describe('Average distance in meters from key nearby hubs'),
  }),
  transitProximity: z.string().describe('Description of proximity to public transit'),
  parkingAvailability: z.enum(['LIMITED', 'ADEQUATE', 'ABUNDANT']).describe('Estimated parking availability based on location type'),
  summary: z.string().describe('Final synthesized summary of accessibility'),
});

export type AccessibilityAnalysis = z.infer<typeof accessibilityAnalysisSchema>;

export class AccessibilityAgent {
  private aiProvider = createAIProvider(env.AI_PROVIDER);
  private locationProvider = createLocationProvider(env.MAP_PROVIDER);

  async analyzeAccessibility(projectId: string): Promise<AccessibilityAnalysis> {
    logger.info({ projectId }, 'AccessibilityAgent analyzing accessibility');

    // 1. Fetch project
    const project = await projectService.getProject(projectId);
    
    if (!project.locationSearch) {
      throw new Error(`Project ${projectId} is missing required data (LocationSearch)`);
    }

    const targetQuery = project.locationSearch.targetArea 
      ? `${project.locationSearch.targetArea}, ${project.locationSearch.targetCity}`
      : project.locationSearch.targetCity;

    // 2. Geocode center point
    const geocodeResult = await this.locationProvider.geocode({ address: targetQuery });
    const targetCoords = geocodeResult.data.location;

    // 3. Find nearby transit or major hubs
    const hubsResult = await this.locationProvider.searchPlaces({
      query: 'transit station OR major intersection',
      location: targetCoords,
      radiusMeters: 5000,
      maxResults: 3,
    });

    // 4. Calculate routes from hubs to target
    const routePromises = hubsResult.data.map(hub => 
      this.locationProvider.calculateRoute({
        origin: hub.location,
        destination: targetCoords,
        travelMode: 'DRIVE',
      })
    );

    const routes = await Promise.all(routePromises);

    // 5. Prepare data for AI synthesis
    const routeData = routes.map((route, i) => ({
      hubName: hubsResult.data[i].name,
      distanceMeters: route.data.distanceMeters,
      durationSeconds: route.data.durationSeconds,
    }));

    const prompt = `You are an Accessibility Analyst Agent.
Write every free-text field in Indonesian (Bahasa Indonesia); the reader is an Indonesian business owner. Enum values stay in English.
Analyze the following route data from nearby transit hubs to the target location ("${targetQuery}").
Produce an accessibility score, average metrics, parking estimates, and a summary.

ROUTE DATA:
${JSON.stringify(routeData, null, 2)}

Produce a structured accessibility analysis.`;

    // 6. Generate Analysis
    const analysis = await this.aiProvider.generateStructuredData(prompt, accessibilityAnalysisSchema, 'AccessibilityAnalysis');

    // 7. Save Analysis to DB
    await prisma.project.update({
      where: { id: projectId },
      data: { accessibilityAnalysis: analysis as any },
    });

    return analysis;
  }
}

export const accessibilityAgent = new AccessibilityAgent();
