import { projectRepository, CreateProjectInput } from '../repositories/project.repository.js';
import { logger } from '../lib/logger.js';
import { isProjectType, PROJECT_TYPES } from '../lib/project-types.js';

export class ProjectService {
  async createProject(input: CreateProjectInput) {
    if (input.projectType && !isProjectType(input.projectType)) {
      throw new Error(
        `Unknown projectType "${input.projectType}". Supported values: ${PROJECT_TYPES.join(', ')}`
      );
    }
    logger.info(
      { clientId: input.clientId, name: input.name, projectType: input.projectType },
      'Creating new project'
    );
    const project = await projectRepository.createProject(input);
    return project;
  }

  /** @param clientId when set, only that client's projects are returned. */
  async listProjects(clientId?: string) {
    return await projectRepository.listProjects(clientId);
  }

  async getProject(projectId: string) {
    const project = await projectRepository.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  }

  async updateProjectStatus(projectId: string, status: string) {
    logger.info({ projectId, status }, 'Updating project status');
    return await projectRepository.updateStatus(projectId, status);
  }
}

export const projectService = new ProjectService();
