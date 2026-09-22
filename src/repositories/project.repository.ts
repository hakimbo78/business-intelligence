import { prisma } from '../config/database.js';
import type { Project, BusinessProfile, LocationSearch, Prisma } from '@prisma/client';

export interface CreateProjectInput {
  clientId: string;
  name: string;
  /** VALIDATION | COMPARISON | AREA_SCOUTING — see lib/project-types.ts */
  projectType?: string;
  businessProfile?: {
    businessName: string;
    businessCategory: string;
    businessSubcategory?: string;
    currentBranchCount?: number;
    currentAverageTransaction?: number;
    estimatedDailyCustomers?: number;
    operatingDays?: number;
    grossMargin?: number;
  };
  locationSearch?: {
    targetCity: string;
    targetArea?: string;
    preferredRadius?: number;
    targetPropertySize?: number;
    minimumPropertySize?: number;
    maximumPropertySize?: number;
    maximumMonthlyRent?: number;
    maximumInitialInvestment?: number;
    estimatedInitialInvestment?: number;
  };
}

export class ProjectRepository {
  /**
   * Create a new project, optionally with initial business profile and location search.
   */
  async createProject(input: CreateProjectInput): Promise<Project & { businessProfile: BusinessProfile | null, locationSearch: LocationSearch | null }> {
    const data: Prisma.ProjectCreateInput = {
      name: input.name,
      client: { connect: { id: input.clientId } },
      ...(input.projectType ? { projectType: input.projectType } : {}),
    };

    if (input.businessProfile) {
      data.businessProfile = {
        create: {
          businessName: input.businessProfile.businessName,
          businessCategory: input.businessProfile.businessCategory,
          businessSubcategory: input.businessProfile.businessSubcategory,
          currentBranchCount: input.businessProfile.currentBranchCount ?? 0,
          currentAverageTransaction: input.businessProfile.currentAverageTransaction,
          estimatedDailyCustomers: input.businessProfile.estimatedDailyCustomers,
          operatingDays: input.businessProfile.operatingDays,
          grossMargin: input.businessProfile.grossMargin,
        }
      };
    }

    if (input.locationSearch) {
      data.locationSearch = {
        create: {
          targetCity: input.locationSearch.targetCity,
          targetArea: input.locationSearch.targetArea,
          preferredRadius: input.locationSearch.preferredRadius,
          targetPropertySize: input.locationSearch.targetPropertySize,
          minimumPropertySize: input.locationSearch.minimumPropertySize,
          maximumPropertySize: input.locationSearch.maximumPropertySize,
          maximumMonthlyRent: input.locationSearch.maximumMonthlyRent,
          maximumInitialInvestment: input.locationSearch.maximumInitialInvestment,
          estimatedInitialInvestment: input.locationSearch.estimatedInitialInvestment,
        }
      };
    }

    return await prisma.project.create({
      data,
      include: {
        businessProfile: true,
        locationSearch: true,
      },
    });
  }

  /**
   * List projects, newest first, for the owner dashboard.
   */
  async listProjects(): Promise<Project[]> {
    return await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a project by ID, including its profile, search, candidates, and competitors.
   */
  async getProjectById(projectId: string) {
    return await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        businessProfile: true,
        locationSearch: true,
        candidates: true,
        competitors: true,
      },
    });
  }

  /**
   * Update project status.
   */
  async updateStatus(projectId: string, status: string): Promise<Project> {
    return await prisma.project.update({
      where: { id: projectId },
      data: { status },
    });
  }

  /**
   * Upsert the business profile for a project.
   */
  async upsertBusinessProfile(projectId: string, data: Omit<Prisma.BusinessProfileCreateInput, 'project'>): Promise<BusinessProfile> {
    return await prisma.businessProfile.upsert({
      where: { projectId },
      create: { ...data, project: { connect: { id: projectId } } },
      update: data,
    });
  }

  /**
   * Delete a project.
   */
  async deleteProject(projectId: string): Promise<Project> {
    return await prisma.project.delete({
      where: { id: projectId },
    });
  }
}

export const projectRepository = new ProjectRepository();
